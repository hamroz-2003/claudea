/* FlowCraft V2 — 1-modul: aqlli audio-rasm sinxronizatori (Smart Semantic Auto-Matcher)
 * va 2-modul yadrosi (hook kadrlar, klipni vaqtga moslash, kamera harakati).
 *
 * Eski "pauzaga qarab kesish" (local.js align → silence detection) o'rniga:
 *
 *  1. QULOQ — kadr vaqtlari uchta manbadan olinadi (aniqlik tartibida):
 *     a) TTS manifesti: ovoz dastur ichida kadrlar bo'yicha yaratilgan bo'lsa,
 *        har bo'lakning boshlanish vaqti namunagacha (sample) aniq ma'lum;
 *     b) STT: ovoz 75 soniyalik oynalarga bo'linib Gemini'ga yuboriladi,
 *        so'zlar vaqti olinadi va ssenariy so'zlari Needleman–Wunsch bilan
 *        transkriptga MAJBURIY moslanadi (forced alignment);
 *     c) zaxira: harf soniga mutanosib taqsim (faqat AI kaliti bo'lmasa).
 *     Har chegara keyin ovozning haqiqiy boshlanish nuqtasiga (10 ms aniqlik)
 *     "yopishtiriladi" — diktor vergulda to'xtasa ham, gaplarni ulab o'qisa ham.
 *
 *  2. KO'Z — rasm/video kadrlarga ma'no bo'yicha bog'lanadi:
 *     a) manifest (FlowCraft yaratgan rasm qaysi kadr uchunligini biladi),
 *     b) Gemini Vision ovozi (har rasm qaysi gap(lar)ni tasvirlaydi),
 *     c) pozitsiya ehtimoli (tartib odatda saqlanadi).
 *     Monoton dinamik dasturlash (DP) yo'li: bir rasm ketma-ket 2 gapga
 *     cho'zilishi yoki bitta uzun gapga 2 rasm bo'linishi mumkin, lekin
 *     hech qachon "bittaga siljib ketmaydi" — har rasm o'z gapiga tushadi.
 *
 * Bog'liqliksiz, ES2019; brauzer/WebView'da `window.FCSync`, Node'da
 * `module.exports` (testlar uchun).
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ matn --
  const APOS = /[ʻʼ’‘`´']/g;
  function normWord(w) {
    return String(w || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(APOS, "'")
      .replace(/[^\p{L}\p{N}']+/gu, "")
      .replace(/^'+|'+$/g, "");
  }
  function tokenize(text) {
    return String(text || "").split(/\s+/).map(normWord).filter(Boolean);
  }
  /** Ikki so'z o'xshashligi 0..1 (o'zbek qo'shimchalariga chidamli). */
  function wordSim(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const p = Math.min(a.length, b.length);
    let k = 0;
    while (k < p && a[k] === b[k]) k++;
    if (k >= 4) return 0.8;                 // umumiy o'zak: "jangchilar" ~ "jangchi"
    return lev(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 4)) ? 0.7 : 0;
  }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 99;
    const m = a.length, n = b.length, d = new Array(n + 1);
    for (let j = 0; j <= n; j++) d[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = d[0]; d[0] = i;
      for (let j = 1; j <= n; j++) {
        const t = d[j];
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = t;
      }
    }
    return d[n];
  }

  /** Nutq og'irligi ≈ bo'g'inlar soni (unli guruhlari) — harf sonidan aniqroq. */
  function speechWeight(text) {
    const t = String(text || "").toLowerCase().replace(APOS, "'");
    const syl = (t.match(/[aeiouyəöüıo]['ʻ’]?|[аеёиоуыэюяў]/g) || []).length;
    const pauses = (t.match(/[,;:—–]/g) || []).length;
    const chars = t.replace(/[^\p{L}\p{N}]/gu, "").length;
    // bo'g'inlar va harflar (o'zbekchada ~2,6 harf/bo'g'in) o'rtachasi: ikkala
    // nutq modeliga ham chidamli
    return Math.max(1, 0.5 * syl + 0.5 * (chars / 2.6) + 0.8 * pauses);
  }

  // ----------------------------------------------------------------- audio --
  /** Blob/ArrayBuffer → mono Float32 (`rate` Hz). Faqat brauzerda. */
  async function decode(input, rate = 16000) {
    const ab = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
    const AC = root.AudioContext || root.webkitAudioContext;
    const ctx = new AC();
    let buf;
    try { buf = await ctx.decodeAudioData(ab.slice(0)); } finally { ctx.close && ctx.close(); }
    const oc = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * rate)), rate);
    const src = oc.createBufferSource();
    src.buffer = buf; src.connect(oc.destination); src.start();
    const out = await oc.startRendering();
    return { pcm: out.getChannelData(0), rate, duration: buf.duration };
  }

  /** 10 ms ramkalardagi RMS energiya (dBFS). */
  function envelope(pcm, rate, frameMs = 10) {
    const hop = Math.max(1, Math.round((rate * frameMs) / 1000));
    const n = Math.floor(pcm.length / hop);
    const db = new Float32Array(Math.max(1, n));
    for (let f = 0; f < n; f++) {
      let e = 0;
      for (let i = f * hop, end = i + hop; i < end; i++) e += pcm[i] * pcm[i];
      db[f] = 10 * Math.log10(e / hop + 1e-12);
    }
    return { db, frameMs };
  }

  /**
   * Taxminiy chegarani haqiqiy nutq boshlanishiga suradi.
   * Oynadagi eng jim nuqta (nafas/pauza) topiladi, keyin undan keyingi
   * birinchi "ovoz ko'tarilgan" ramka qaytariladi. Pauza bo'lmasa (gaplar
   * ulab o'qilgan) — eng jim nuqtaning o'zi (so'zlar orasidagi chuqurlik).
   */
  function snapBoundary(env, t, opt = {}) {
    const back = opt.back ?? 0.45, fwd = opt.fwd ?? 0.35;
    const { db, frameMs } = env;
    const fs = frameMs / 1000;
    const lo = Math.max(0, Math.floor((t - back) / fs));
    const hi = Math.min(db.length - 1, Math.ceil((t + fwd) / fs));
    if (hi - lo < 3) return t;
    let floor = 0, peak = -200;
    floor = Infinity;
    for (let i = lo; i <= hi; i++) { if (db[i] < floor) floor = db[i]; if (db[i] > peak) peak = db[i]; }
    if (peak - floor < 12) return t;                       // pauza yo'q va nutq tekis: tegmaymiz
    const quiet = floor + Math.min(10, (peak - floor) / 3);
    // Jim bo'laklar (pauza yoki so'zlar orasidagi chuqurlik). Har birining
    // oxiri = keyingi nutq boshlanishi. Uzun pauza va taxminga yaqinlik yutadi:
    // ball = 40·uzunlik − 30·masofa (0,3 s nafas 0,04 s so'z oralig'idan ustun,
    // lekin taxmindan juda uzoq bo'lsa emas).
    let best = null, bestScore = -Infinity, runStart = -1;
    for (let i = lo; i <= hi + 1; i++) {
      const isQuiet = i <= hi && db[i] < quiet;
      if (isQuiet && runStart < 0) runStart = i;
      if (!isQuiet && runStart >= 0) {
        const onset = i * fs;                              // birinchi baland ramka
        const len = (i - runStart) * fs;
        const score = 40 * len - 30 * Math.abs(onset - t);
        if (i <= hi && score > bestScore) { bestScore = score; best = onset; }
        runStart = -1;
      }
    }
    return best == null ? t : Math.max(0, best - fs / 2);
  }

  /** Int16 mono WAV (base64) — Gemini'ga yuborish uchun. */
  function wavBase64(pcm, rate, from = 0, to = pcm.length) {
    const n = Math.max(0, to - from);
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, pcm[from + i]));
      v.setInt16(44 + i * 2, s * 32767, true);
    }
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  }

  // --------------------------------------------------------- 1a. STT (Gemini) --
  /**
   * Ovozni oynalarga bo'lib transkripsiya qiladi → [{w, t0, t1}] (so'zlar).
   * `callJSON(request)` — ilovaning Gemini chaqiruvchisi (kalit almashtirish
   * bilan), JSON qaytaradi. Qisqa oynalar Gemini vaqtlarini aniq qiladi.
   */
  async function transcribe(audio, opt) {
    const { callJSON, language = "uz", hint = "", windowSec = 75, overlapSec = 4, onProgress } = opt;
    const { pcm, rate, duration } = audio;
    const words = [];
    const step = windowSec - overlapSec;
    const n = Math.max(1, Math.ceil((duration - overlapSec) / step));
    for (let k = 0; k < n; k++) {
      const t0 = k * step, t1 = Math.min(duration, t0 + windowSec);
      const prompt =
        `Transcribe this ${language} narration clip (${(t1 - t0).toFixed(2)} s) verbatim. ` +
        `Split it into short phrases of 2-8 words exactly as spoken. For each phrase give start and end ` +
        `in seconds from the start of THIS clip, with 2 decimals. ` +
        (hint ? `The narration follows this script (spelling reference only): """${hint.slice(0, 6000)}""" ` : "") +
        `Return JSON: {"segments":[{"start":0.00,"end":1.23,"text":"..."}]}`;
      const res = await callJSON({
        contents: [{ parts: [
          { inlineData: { mimeType: "audio/wav", data: wavBase64(pcm, rate, Math.floor(t0 * rate), Math.floor(t1 * rate)) } },
          { text: prompt },
        ] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      });
      const segs = (res && (res.segments || res)) || [];
      const keepFrom = k === 0 ? 0 : t0 + overlapSec / 2;
      const keepTo = k === n - 1 ? duration + 1 : t1 - overlapSec / 2;
      let last = 0;
      for (const s of segs) {
        let a = Number(s.start), b = Number(s.end);
        if (!isFinite(a) || !isFinite(b)) continue;
        a = Math.max(last, Math.min(t1 - t0, a)); b = Math.max(a + 0.05, Math.min(t1 - t0, b));
        last = a;
        const toks = String(s.text || "").split(/\s+/).filter(Boolean);
        if (!toks.length) continue;
        const total = toks.reduce((x, t) => x + t.length + 1, 0);
        let c = a;
        toks.forEach((tok, pi) => {
          const d = ((b - a) * (tok.length + 1)) / total;
          const abs0 = t0 + c, abs1 = t0 + c + d;
          c += d;
          const mid = (abs0 + abs1) / 2;
          // pa/pb/pi/pn: ibora chegaralari va so'zning ibora ichidagi o'rni (aniqlash uchun)
          if (mid >= keepFrom && mid < keepTo) words.push({ w: normWord(tok), t0: abs0, t1: abs1, pa: t0 + a, pb: t0 + b, pi, pn: toks.length });
        });
      }
      onProgress && onProgress((k + 1) / n);
    }
    return words.filter((x) => x.w);
  }

  // --------------------------------------- 1b. majburiy moslash (forced align) --
  /**
   * Ssenariy so'zlarini transkript so'zlariga global moslash (Needleman–Wunsch,
   * diagonal atrofidagi tasma bilan). Qaytaradi: ssenariy so'zi → transkript
   * indeksi (-1 = mos topilmadi).
   */
  function alignWords(script, heard, band = 0) {
    const n = script.length, m = heard.length;
    if (!n || !m) return new Int32Array(n).fill(-1);
    const B = band || Math.max(120, Math.abs(n - m) + 80);
    const W = 2 * B + 1;
    const NEG = -1e9;
    const score = new Float64Array((n + 1) * W).fill(NEG);
    const from = new Uint8Array((n + 1) * W);           // 1=diag 2=up(skip script) 3=left(skip heard)
    const idx = (i, j) => i * W + (j - Math.round((i * m) / n) + B);
    const inBand = (i, j) => { const c = j - Math.round((i * m) / n); return c >= -B && c <= B; };
    const GAP = -0.6;
    for (let i = 0; i <= n; i++) {
      const c0 = Math.round((i * m) / n);
      for (let j = Math.max(0, c0 - B); j <= Math.min(m, c0 + B); j++) {
        if (i === 0 && j === 0) { score[idx(0, 0)] = 0; continue; }
        let best = NEG, f = 0;
        if (i > 0 && j > 0 && inBand(i - 1, j - 1)) {
          const s = wordSim(script[i - 1], heard[j - 1]);
          const v = score[idx(i - 1, j - 1)] + (s > 0 ? 1 + s : -0.5);
          if (v > best) { best = v; f = 1; }
        }
        if (i > 0 && inBand(i - 1, j)) { const v = score[idx(i - 1, j)] + GAP; if (v > best) { best = v; f = 2; } }
        if (j > 0 && inBand(i, j - 1)) { const v = score[idx(i, j - 1)] + GAP; if (v > best) { best = v; f = 3; } }
        score[idx(i, j)] = best; from[idx(i, j)] = f;
      }
    }
    const map = new Int32Array(n).fill(-1);
    let i = n, j = m;
    if (!inBand(n, m)) return map;
    while (i > 0 || j > 0) {
      const f = from[idx(i, j)];
      if (f === 1) { if (wordSim(script[i - 1], heard[j - 1]) > 0) map[i - 1] = j - 1; i--; j--; }
      else if (f === 2) i--;
      else if (f === 3) j--;
      else break;
    }
    return map;
  }

  /** Kadr matnlari + transkript so'zlari → har kadrning boshlanish vaqti. */
  function startsFromTranscript(frameTexts, words, duration) {
    const script = [], owner = [];
    frameTexts.forEach((t, fi) => tokenize(t).forEach((w) => { script.push(w); owner.push(fi); }));
    const map = alignWords(script, words.map((x) => x.w));
    const n = frameTexts.length;
    const firstTok = new Array(n).fill(-1);
    owner.forEach((fi, k) => { if (firstTok[fi] < 0) firstTok[fi] = k; });
    const first = new Array(n).fill(null), src = new Array(n).fill(null);
    let matched = 0;
    for (let k = 0; k < script.length; k++) {
      if (map[k] < 0) continue;
      matched++;
      const fi = owner[k];
      if (first[fi] !== null) continue;
      const before = k - firstTok[fi];                  // kadr boshidan nechta so'z o'tkazib yuborilgan
      if (before > 3) continue;                         // juda uzoq: qo'shnilar orasida to'ldiriladi
      const w = words[map[k]];
      const wordDur = Math.max(0.12, w.t1 - w.t0);
      first[fi] = Math.max(0, w.t0 - before * wordDur);
      if (before === 0) src[fi] = w;
    }
    const starts = fillGaps(first, frameTexts, duration);
    return { starts, src, coverage: script.length ? matched / script.length : 0 };
  }

  /** Topilmagan kadr vaqtlarini qo'shnilar orasida harf soni bo'yicha to'ldiradi. */
  function fillGaps(first, frameTexts, duration) {
    const n = first.length, w = frameTexts.map(speechWeight);
    const s = first.slice();
    s[0] = 0;
    let a = 0;
    for (let i = 1; i <= n; i++) {
      if (i < n && s[i] === null) continue;
      const tb = i < n ? s[i] : duration;
      const ta = s[a];
      let tot = 0; for (let k = a; k < i; k++) tot += w[k];
      let acc = 0;
      for (let k = a + 1; k < i; k++) { acc += w[k - 1]; s[k] = ta + ((tb - ta) * acc) / tot; }
      a = i;
    }
    return s;
  }

  /** Zaxira: harf soni bo'yicha, ma'lum langarlar (anchors) orasida. */
  function startsByProportion(frameTexts, duration, anchors = []) {
    const first = new Array(frameTexts.length).fill(null);
    for (const a of anchors) if (a.frame >= 0 && a.frame < first.length) first[a.frame] = a.time;
    return fillGaps(first, frameTexts, duration);
  }

  /** Ibora ichidagi jim bo'laklar (so'zlar orasidagi bo'shliqlar). */
  function quietRuns(env, a, b) {
    const { db, frameMs } = env, fs = frameMs / 1000;
    const lo = Math.max(0, Math.floor((a - 0.3) / fs)), hi = Math.min(db.length - 1, Math.ceil((b + 0.3) / fs));
    let floor = Infinity, peak = -200;
    for (let i = lo; i <= hi; i++) { floor = Math.min(floor, db[i]); peak = Math.max(peak, db[i]); }
    if (peak - floor < 12) return null;
    const quiet = floor + Math.min(10, (peak - floor) / 3);
    const i0 = Math.ceil(a / fs), i1 = Math.floor(b / fs);
    // ibora boshidagi/oxiridagi jimlikni tashlaymiz: faqat ichki bo'shliqlar
    let s0 = i0; while (s0 <= i1 && db[s0] < quiet) s0++;
    let s1 = i1; while (s1 >= s0 && db[s1] < quiet) s1--;
    const runs = []; let rs = -1;
    for (let i = s0; i <= s1 + 1; i++) {
      const q = i <= s1 && db[i] < quiet;
      if (q && rs < 0) rs = i;
      if (!q && rs >= 0) { runs.push({ start: rs * fs, end: i * fs, len: (i - rs) * fs }); rs = -1; }
    }
    return runs;
  }

  /**
   * So'z iborada nechanchi bo'lsa, o'shancha bo'shliqdan keyin boshlanadi.
   * Kutilgan pn−1 ta bo'shliq (harf soniga ko'ra) topilgan jim bo'laklarga
   * monoton DP bilan moslanadi: STT ibora chegarasidagi xato tufayli chetdan
   * kirib qolgan ortiqcha bo'shliqlar tashlab ketiladi.
   */
  function phraseBoundary(env, w) {
    if (!w || w.pn == null || w.pi === 0) return null;
    const runs = quietRuns(env, w.pa - 0.25, w.pb + 0.25);
    const G = w.pn - 1;
    if (!runs || runs.length < G) return null;            // bo'shliqlar ajralmagan (ulab aytilgan)
    const exp = [];
    for (let k = 1; k <= G; k++) exp.push(w.pa + ((w.pb - w.pa) * k) / w.pn);
    const R = runs.length, INF = 1e9;
    const dp = Array.from({ length: G + 1 }, () => new Float64Array(R + 1).fill(INF));
    const pick = Array.from({ length: G + 1 }, () => new Int8Array(R + 1));
    for (let r = 0; r <= R; r++) dp[0][r] = 0;
    for (let g = 1; g <= G; g++) for (let r = g; r <= R; r++) {
      const skip = dp[g][r - 1];
      const take = dp[g - 1][r - 1] + Math.abs(runs[r - 1].end - exp[g - 1]) - 0.5 * Math.min(0.4, runs[r - 1].len);
      if (take <= skip) { dp[g][r] = take; pick[g][r] = 1; } else dp[g][r] = skip;
    }
    let g = G, r = R, chosen = null;
    while (g > 0 && r > 0) {
      if (pick[g][r]) { if (g === w.pi) chosen = runs[r - 1]; g--; r--; } else r--;
    }
    if (!chosen) return null;
    return Math.abs(chosen.end - exp[w.pi - 1]) < 0.6 ? chosen.end : null;
  }

  /**
   * AI kalitisiz zaxira: global DP. Butun audiodagi jim joylar (nafas,
   * so'z oralig'i) nomzod chegara bo'ladi; har gapning davomiyligi uning
   * harf soni × o'rtacha nutq tezligiga yaqin bo'lishi talab qilinadi.
   * Xato bir gapdan keyingisiga yig'ilmaydi (eski usuldagi drift yo'q):
   * har bir chegara o'zining mahalliy mezoni bilan tanlanadi.
   */
  function startsByPauseDP(frameTexts, env, duration, anchors = []) {
    const n = frameTexts.length;
    if (n < 2) return [0];
    const runs = quietRuns(env, 0.3, duration - 0.3) || [];
    const cands = runs.filter((r) => r.len >= 0.03).map((r) => ({ t: r.end, len: r.len }));
    const chars = frameTexts.map(speechWeight);
    // nutq boshlanishi/oxiri: dastlabki va oxirgi jimlikni hisobga olmaymiz
    const { db, frameMs } = env; const fs = frameMs / 1000;
    let peak = -200; for (const v of db) peak = Math.max(peak, v);
    let a = 0; while (a < db.length && db[a] < peak - 30) a++;
    let b = db.length - 1; while (b > a && db[b] < peak - 30) b--;
    const t0 = a * fs, t1 = (b + 1) * fs;
    const rate = (t1 - t0) / chars.reduce((x, y) => x + y, 0);
    const K = cands.length;
    if (K < n - 1) return startsByProportion(frameTexts, duration, anchors);
    const fixed = new Map(anchors.map((x) => [x.frame, x.time]));
    const cost = (i, ta, tb) => {           // gap i davomiyligi [ta, tb]
      const want = chars[i] * rate, sd = 0.22 * want + 0.25;
      const d = tb - ta - want;
      return (d * d) / (sd * sd);
    };
    const bonus = (k) => -1.2 * Math.min(0.5, cands[k].len);
    // dp[i][k]: i-chegara k-nomzodda (i = 1..n-1)
    const INF = 1e18, dp = [], back = [];
    for (let i = 1; i < n; i++) { dp.push(new Float64Array(K).fill(INF)); back.push(new Int32Array(K).fill(-1)); }
    const win = (i) => { const e = t0 + rate * chars.slice(0, i).reduce((x, y) => x + y, 0); return [e - Math.max(4, duration * 0.12), e + Math.max(4, duration * 0.12)]; };
    for (let i = 1; i < n; i++) {
      const [lo, hi] = win(i);
      for (let k = 0; k < K; k++) {
        const t = cands[k].t;
        if (t < lo || t > hi) continue;
        if (fixed.has(i) && Math.abs(t - fixed.get(i)) > 0.15) continue;
        if (i === 1) { dp[0][k] = cost(0, t0, t) + bonus(k); continue; }
        let best = INF, bj = -1;
        for (let j = 0; j < k; j++) {
          const pv = dp[i - 2][j];
          if (pv >= INF) continue;
          const v = pv + cost(i - 1, cands[j].t, t);
          if (v < best) { best = v; bj = j; }
        }
        if (bj >= 0) { dp[i - 1][k] = best + bonus(k); back[i - 1][k] = bj; }
      }
    }
    let bestK = -1, best = INF;
    for (let k = 0; k < K; k++) {
      const v = dp[n - 2][k];
      if (v < INF) { const tot = v + cost(n - 1, cands[k].t, t1); if (tot < best) { best = tot; bestK = k; } }
    }
    if (bestK < 0) return startsByProportion(frameTexts, duration, anchors);
    const out = new Array(n); out[0] = 0;
    for (let i = n - 1, k = bestK; i >= 1; i--) { out[i] = cands[k].t; k = back[i - 1][k]; }
    for (const [f, tm] of fixed) out[f] = tm;
    return out;
  }

  /** Chegaralarni ovozga yopishtirish + monotonlik + minimal davomiylik. */
  function refineStarts(starts, env, duration, opt = {}) {
    const minDur = opt.minDur ?? 0.35, locked = opt.locked || new Set(), src = opt.src || [];
    const out = starts.slice();
    out[0] = 0;
    for (let i = 1; i < out.length; i++) {
      const pb = env && !locked.has(i) ? phraseBoundary(env, src[i]) : null;
      if (pb != null) out[i] = snapBoundary(env, pb, { back: 0.08, fwd: 0.08 });
      else if (env && !locked.has(i)) out[i] = snapBoundary(env, out[i], opt);
      out[i] = Math.max(out[i], out[i - 1] + minDur);
    }
    for (let i = out.length - 1; i > 0; i--) out[i] = Math.min(out[i], (i + 1 < out.length ? out[i + 1] : duration) - minDur);
    return out;
  }

  function segmentsFrom(frameTexts, starts, duration) {
    return frameTexts.map((text, i) => ({
      id: i + 1,
      start: +starts[i].toFixed(3),
      end: +(i + 1 < starts.length ? starts[i + 1] : duration).toFixed(3),
      text,
    }));
  }

  // ------------------------------------------------- 2. ko'z: media moslash --
  function frameNumberOf(name) {
    const m = String(name || "").replace(/^.*[\\/]/, "").match(/(?:^|[^0-9])(\d{1,4})(?=[^0-9]*\.[a-z0-9]+$)|^(\d{1,4})/i);
    const v = m ? +(m[1] || m[2]) : NaN;
    return isFinite(v) && v > 0 ? v : null;
  }

  /** Fayl nomlari kadr raqamlariga o'xshaydimi (001.png, 002.png …)? */
  function namesLookLikeFrames(names, n) {
    const nums = names.map(frameNumberOf).filter((x) => x != null);
    if (nums.length < names.length * 0.8) return false;
    const inRange = nums.filter((x) => x >= 1 && x <= n + 5).length;
    return inRange >= nums.length * 0.9 && new Set(nums).size >= nums.length * 0.9;
  }

  /**
   * Gemini Vision: har rasm qaysi gap(lar)ni tasvirlaydi. Rasmlar kichik
   * eskiz (thumbnail, base64 JPEG) bo'lib, 12 tadan yuboriladi.
   * Qaytaradi: votes[j] = [segId1, segId2, segId3] (eng mosi birinchi).
   */
  async function visionVotes(segments, thumbs, opt) {
    const { callJSON, batch = 12, onProgress } = opt;
    const lines = segments.map((s) => `${s.id}. ${s.text}`).join("\n");
    const votes = new Array(thumbs.length).fill(null).map(() => []);
    for (let b = 0; b < thumbs.length; b += batch) {
      const part = thumbs.slice(b, b + batch);
      const parts = [{ text: `Narration lines of a video, numbered:\n${lines}\n\nFor each image below (IMG_1..IMG_${part.length}) list the 1-3 line numbers it illustrates best, best first. Judge by what is visible (people, place, objects, action). Return JSON: {"images":[{"img":1,"lines":[12,13]}]}` }];
      part.forEach((t, k) => { parts.push({ text: `IMG_${k + 1}` }); parts.push({ inlineData: { mimeType: t.mime || "image/jpeg", data: t.data } }); });
      const res = await callJSON({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } });
      for (const it of (res && res.images) || []) {
        const j = b + (Number(it.img) - 1);
        if (j >= b && j < b + part.length) votes[j] = (it.lines || []).map(Number).filter((x) => x >= 1 && x <= segments.length).slice(0, 3);
      }
      onProgress && onProgress(Math.min(1, (b + batch) / thumbs.length));
    }
    return votes;
  }

  /**
   * Monoton DP: segmentlar (i) × media (j). Yo'l (0,0) dan (n-1,m-1) gacha,
   * qadamlar: diagonal (keyingi gap, keyingi rasm), pastga (keyingi gap shu
   * rasm bilan — cho'zish), o'ngga (shu gapda keyingi rasm — bo'lish).
   * Har katak ball: manifest > vision > pozitsiya.
   */
  function matchMedia(segments, media, opt = {}) {
    const n = segments.length, m = media.length;
    if (!n || !m) return { rows: [], score: 0 };
    const votes = opt.votes || [];
    const SPAN = opt.spanPenalty ?? 0.55, SPLIT = opt.splitPenalty ?? 0.8;
    const cell = (i, j) => {
      let s = 0;
      const md = media[j];
      if (md.segmentId != null) {
        // rasm o'zining gapida: +4. Keyingi gap uchun yaratilgan rasmni oldinroq
        // ko'rsatish (−2.5) oldingi rasmni davom ettirishdan (−1.2) yomonroq.
        const sid = segments[i].id;
        s += md.segmentId === sid ? 4 : md.segmentId > sid ? -2.5 : -1.2;
      }
      const v = votes[j];
      if (v && v.length) { const r = v.indexOf(segments[i].id); s += r === 0 ? 3 : r === 1 ? 2 : r === 2 ? 1.2 : -0.3; }
      const pi = n > 1 ? i / (n - 1) : 0, pj = m > 1 ? j / (m - 1) : 0;
      s += 1.6 * Math.exp(-((pi - pj) ** 2) / (2 * 0.05 ** 2));
      return s;
    };
    const NEG = -1e18, sc = new Float64Array(n * m).fill(NEG), fr = new Uint8Array(n * m);
    sc[0] = cell(0, 0);
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      if (!i && !j) continue;
      let best = NEG, f = 0;
      if (i && j && sc[(i - 1) * m + j - 1] > best) { best = sc[(i - 1) * m + j - 1]; f = 1; }
      if (i && sc[(i - 1) * m + j] - SPAN > best) { best = sc[(i - 1) * m + j] - SPAN; f = 2; }
      if (j && sc[i * m + j - 1] - SPLIT > best) { best = sc[i * m + j - 1] - SPLIT; f = 3; }
      sc[i * m + j] = best + cell(i, j); fr[i * m + j] = f;
    }
    const path = [];
    let i = n - 1, j = m - 1;
    for (;;) { path.push([i, j]); if (!i && !j) break; const f = fr[i * m + j]; if (f === 1) { i--; j--; } else if (f === 2) i--; else j--; }
    path.reverse();
    const rows = segments.map(() => []);
    for (const [a, b] of path) if (rows[a][rows[a].length - 1] !== b) rows[a].push(b);
    return { rows, score: sc[n * m - 1] };
  }

  /** DP natijasi → vaqt jadvali kliplari (cho'zilgan rasmlar birlashtiriladi). */
  function clipsFrom(segments, media, rows) {
    const clips = [];
    segments.forEach((sg, i) => {
      const list = rows[i];
      const d = (sg.end - sg.start) / list.length;
      list.forEach((j, k) => {
        const start = sg.start + d * k, end = k === list.length - 1 ? sg.end : sg.start + d * (k + 1);
        const prev = clips[clips.length - 1];
        if (prev && prev.media === j && Math.abs(prev.end - start) < 1e-6) { prev.end = end; prev.segs.push(sg.id); prev.x += " " + sg.text; }
        else clips.push({ media: j, start, end, segs: [sg.id], x: list.length > 1 ? sg.text : sg.text });
      });
    });
    return clips;
  }

  // ------------------------------------------ 2-modul: hook va harakat --
  const DRAMA = /o['ʻ’]?lim|o['ʻ’]?ldi|jang|qon|olov|yong['ʻ’]?in|portla|qo['ʻ’]?rqu|dahshat|sir(li)?\b|birdan|to['ʻ’]?satdan|halok|qurbon|xiyonat|qochd|hujum|urush|zilzila|falokat|yashirin|faqat|hech kim|death|kill|blood|fire|war|attack|secret|suddenly|never|смерт|кров|огон|войн|тайн|вдруг/i;
  const SHAKE = /hujum|portla|zilzila|qo['ʻ’]?rquv|dahshat|jang boshlan|urush boshlan|\bjangda\b|vahima|zarba ber|battle began|attack|explo|earthquake|panic|взрыв|паник|атак/i;

  /** Birinchi `window` soniyadagi eng dramatik `count` ta kadr (oraliq bilan). */
  function planHooks(segments, opt = {}) {
    const window = opt.window ?? 60, count = opt.count ?? 6, minGap = opt.minGapSec ?? 6;
    const llm = opt.scores || {};
    const cands = segments.filter((s) => s.start < window).map((s, k) => {
      let sc = (llm[s.id] ?? 0) * 1.5;
      if (DRAMA.test(s.text)) sc += 3;
      if (/[!?]/.test(s.text)) sc += 1;
      if (/\b\d{3,4}\b/.test(s.text)) sc += 0.8;
      sc += Math.max(0, 1.5 - s.start / 20);           // boshiga yaqin — kuchliroq ilgak
      if (k === 0) sc += 2;                            // 1-kadr har doim hook
      return { s, sc };
    }).sort((a, b) => b.sc - a.sc);
    const picked = [];
    for (const c of cands) {
      if (picked.length >= count) break;
      if (picked.every((p) => Math.abs(p.start - c.s.start) >= minGap)) picked.push(c.s);
    }
    for (const c of cands) {                           // oraliq tufayli kam bo'lsa, to'ldiramiz
      if (picked.length >= Math.min(count, cands.length)) break;
      if (!picked.includes(c.s)) picked.push(c.s);
    }
    return picked.map((s) => s.id).sort((a, b) => a - b);
  }

  const MOTION_HINTS = [
    [/olov|gulxan|yong['ʻ’]?in|fire|огон/i, "fire sparks and embers drifting upward"],
    [/jang|hujum|urush|battle|attack|бой/i, "dust kicked up, subtle handheld camera shake"],
    [/yomg['ʻ’]?ir|rain|дожд/i, "rain streaking down, wet surfaces glistening"],
    [/qor|snow|снег/i, "light snow falling"],
    [/dengiz|daryo|suv|sea|river|water|мор|рек/i, "water rippling, gentle waves"],
    [/shamol|cho['ʻ’]?l|qum|desert|wind|пустын/i, "wind moving cloth and hair, sand drifting"],
    [/tun|kecha|night|ночь/i, "flickering torchlight, slow shadows"],
  ];
  function motionPrompt(text) {
    const extra = MOTION_HINTS.filter(([re]) => re.test(text)).map(([, m]) => m).slice(0, 2);
    return ["slow cinematic camera push-in", ...extra, "subtle natural breathing and micro-movements, no morphing"].join(", ");
  }

  /** MP4 klipni gap vaqtiga moslash: tezlik 0.8–1.25 oralig'ida, yetmasa oxirgi kadr ushlanadi. */
  function fitClip(clipDur, targetDur) {
    if (!(clipDur > 0) || !(targetDur > 0)) return { rate: 1, hold: true };
    const rate = Math.min(1.25, Math.max(0.8, clipDur / targetDur));
    return { rate: +rate.toFixed(4), hold: clipDur / rate < targetDur - 0.02 };
  }
  /** Render/preview uchun: klip ichidagi manba vaqti (aylanib qaytmaydi). */
  function clipSourceTime(t, fit, clipDur) {
    const r = (fit && fit.rate) || 1;
    return Math.max(0, Math.min(t * r, clipDur - 0.001));
  }

  /** Statik kadrlarga almashinuvchi kamera harakati; jang/qo'rquvda silkinish. */
  function assignMotion(clips, opt = {}) {
    const cycle = opt.cycle || ["in", "left", "out", "right"];
    let k = 0, prev = "", lastShake = -99;
    clips.forEach((c, idx) => {
      if (c.isVideo) { c.motion = "none"; prev = "none"; return; }
      // silkinish faqat kuchli lahzalarda va kamida 4 kadr oralig'ida
      if (SHAKE.test(c.x || "") && idx - lastShake >= 4) { c.motion = "shake"; prev = "shake"; lastShake = idx; return; }
      let mo = cycle[k++ % cycle.length];
      if (mo === prev) mo = cycle[k++ % cycle.length];
      c.motion = mo; prev = mo;
    });
    return clips;
  }

  // ------------------------------------------------------- to'liq konveyer --
  /**
   * @param {object} o
   *   audio: {pcm, rate, duration}  (decode() natijasi)
   *   frameTexts: string[]          (P.frames — diktor gaplari tartibida)
   *   media: [{name, isVideo, duration?, segmentId?, thumb?:{data,mime}}]
   *   anchors: [{frame, time}]      (TTS manifesti, ixtiyoriy)
   *   callJSON: fn | null           (Gemini; yo'q bo'lsa STT/vision o'tkazib yuboriladi)
   *   useVision, language, hookCount, onStage(label, p)
   */
  async function build(o) {
    const stage = o.onStage || (() => {});
    const { audio, frameTexts } = o;
    const duration = audio.duration;
    const env = envelope(audio.pcm, audio.rate);
    const report = { method: "", coverage: null, vision: false, anchors: (o.anchors || []).length };
    const anchors = (o.anchors || []).filter((a) => a.frame > 0 && a.frame < frameTexts.length);
    const locked = new Set(anchors.map((a) => a.frame));

    // 1) quloq
    let starts, sttSrc = [];
    if (o.callJSON && o.stt !== false) {
      stage("Ovoz tinglanmoqda", 0);
      try {
        const words = await transcribe(audio, { callJSON: o.callJSON, language: o.language, hint: frameTexts.join(" "), onProgress: (p) => stage("Ovoz tinglanmoqda", p * 0.6) });
        const r = startsFromTranscript(frameTexts, words, duration);
        if (r.coverage >= 0.35) {
          starts = r.starts; sttSrc = r.src; report.method = "stt"; report.coverage = +r.coverage.toFixed(3);
          for (const a of anchors) starts[a.frame] = a.time;     // TTS langari har doim ustun
        } else report.sttRejected = +r.coverage.toFixed(3);
      } catch (e) { report.sttError = String(e && e.message || e); }
    }
    if (!starts) {
      starts = startsByPauseDP(frameTexts, env, duration, anchors);
      report.method = anchors.length ? "tts-anchors" : "pause-dp";
    }
    starts = refineStarts(starts, env, duration, { locked, src: sttSrc });
    const segments = segmentsFrom(frameTexts, starts, duration);

    // 2) ko'z
    let votes = [];
    const trust = o.trustNames ?? namesLookLikeFrames(o.media.map((m) => m.name), frameTexts.length);
    const media = o.media.map((m) => ({ ...m, segmentId: m.segmentId ?? (trust ? frameNumberOf(m.name) : null) }));
    report.trustNames = trust;
    if (o.callJSON && o.useVision && media.some((m) => m.thumb)) {
      stage("Rasmlar ko'rilmoqda", 0.6);
      try {
        const idx = media.map((m, j) => (m.thumb ? j : -1)).filter((j) => j >= 0);
        const v = await visionVotes(segments, idx.map((j) => media[j].thumb), { callJSON: o.callJSON, onProgress: (p) => stage("Rasmlar ko'rilmoqda", 0.6 + p * 0.3) });
        votes = new Array(media.length).fill(null);
        idx.forEach((j, k) => { votes[j] = v[k]; });
        report.vision = true;
      } catch (e) { report.visionError = String(e && e.message || e); }
    }
    const { rows } = matchMedia(segments, media, { votes });
    const raw = clipsFrom(segments, media, rows);

    // 3) hook va harakat
    const hookIds = new Set(planHooks(segments, { count: o.hookCount ?? 6 }));
    const clips = raw.map((c) => {
      const md = media[c.media];
      const d = c.end - c.start;
      const hook = c.segs.some((id) => hookIds.has(id));
      return {
        media: c.media, name: md.name, isVideo: !!md.isVideo,
        start: +c.start.toFixed(3), end: +c.end.toFixed(3), d: +d.toFixed(3),
        segs: c.segs, x: c.x.trim(), hook,
        motionPrompt: hook ? motionPrompt(c.x) : "",
        fit: md.isVideo ? fitClip(md.duration || d, d) : null,
      };
    });
    assignMotion(clips);
    report.hooks = [...hookIds];
    report.spans = clips.filter((c) => c.segs.length > 1).length;     // 1 rasm → bir nechta gap
    report.splits = rows.filter((r) => r.length > 1).length;           // 1 gap → bir nechta rasm
    stage("Tayyor", 1);
    return { segments, clips, report };
  }

  const api = {
    normWord, tokenize, wordSim, speechWeight, decode, envelope, snapBoundary, wavBase64, transcribe,
    alignWords, startsFromTranscript, quietRuns, phraseBoundary, startsByPauseDP, startsByProportion, fillGaps, refineStarts, segmentsFrom,
    frameNumberOf, namesLookLikeFrames, visionVotes, matchMedia, clipsFrom, planHooks, motionPrompt, fitClip,
    clipSourceTime, assignMotion, build,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FCSync = api;
})(typeof window !== "undefined" ? window : globalThis);
