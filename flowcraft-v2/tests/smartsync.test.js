// node --test flowcraft-v2/tests
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../assets/smartsync.js");

// ---------- deterministic RNG + synthetic narration ------------------------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const POOL = ("tong otmasdan bomdod o'qildi jangchilar oxirgi non burdasini bo'lishdi amir qo'shini " +
  "cho'l bo'ylab yurdi shamol qumni ko'tardi otlar bezovta edi sarkarda xaritaga qaradi dushman " +
  "qal'a devorlari baland qorovullar olov yoqdi kechasi sovuq tushdi askarlar qilichlarini charxladi " +
  "qishloq aholisi qochdi daryo bo'yida qarorgoh qurildi elchi maktub olib keldi xon g'azablandi").split(" ");

function makeStory(n, seed, opt = {}) {
  const r = rng(seed), rate = 16000;
  const frames = [], truth = [], words = [];
  let t = 0.35;
  const chunks = [];
  for (let i = 0; i < n; i++) {
    const len = 6 + Math.floor(r() * 10);
    const ws = Array.from({ length: len }, () => POOL[Math.floor(r() * POOL.length)]);
    frames.push(ws.join(" ") + ".");
    truth.push(t);
    ws.forEach((w, k) => {
      const d = 0.22 + 0.06 * w.length / 4 + r() * 0.08;
      words.push({ w, t0: t, t1: t + d, frame: i });
      chunks.push([t, t + d]);
      t += d + 0.04;
      if (opt.commaPauses && k === Math.floor(len / 2) && i % 3 === 0) t += 0.42;   // verguldagi pauza
    });
    const merged = opt.merge && i % 5 === 2;                                         // gaplarni ulab o'qish
    t += merged ? 0.02 : 0.32;
  }
  const duration = t + 0.6;
  const pcm = new Float32Array(Math.ceil(duration * rate));
  for (const [a, b] of chunks) for (let k = Math.floor(a * rate); k < Math.floor(b * rate); k++) pcm[k] = 0.35 * Math.sin(k * 0.09) * (0.6 + 0.4 * Math.sin(k * 0.003));
  for (let k = 0; k < pcm.length; k++) pcm[k] += (r() - 0.5) * 0.002;               // fon shovqini
  return { frames, truth, words, duration, audio: { pcm, rate, duration } };
}

// Gemini-like transcript: time jitter, misspellings, dropped words
function noisyTranscript(words, seed) {
  const r = rng(seed);
  const out = [];
  for (const x of words) {
    if (r() < 0.03) continue;
    let w = S.normWord(x.w);
    if (r() < 0.08) w = w.slice(0, -1) + "x";
    const j = (r() - 0.5) * 0.3;
    out.push({ w, t0: x.t0 + j, t1: x.t1 + j });
  }
  return out;
}

// The algorithm currently shipped in FlowCraft 4.0.4 (local.js align, "aqlli" mode)
function oldAlign(audio, texts) {
  const ch = audio.pcm, sr = audio.rate, T = audio.duration, n = texts.length, win = Math.round(sr * 0.02), en = [];
  for (let i = 0; i < ch.length; i += win) { let e = 0; for (let k = i; k < Math.min(i + win, ch.length); k++) e += ch[k] * ch[k]; en.push(Math.sqrt(e / win)); }
  const sorted = [...en].sort((a, b) => a - b), thr = Math.max(0.006, sorted[Math.floor(sorted.length * 0.2)] * 2.2); const sil = []; let run = 0;
  for (let i = 0; i < en.length; i++) { if (en[i] < thr) run++; else { if (run >= 9) sil.push((i - run / 2) * 0.02); run = 0; } }
  const w = texts.map((t) => Math.max(1, String(t).replace(/\s+/g, " ").length)); const sum = w.reduce((a, b) => a + b, 0);
  const st = [0]; let acc = 0;
  for (let i = 1; i < n; i++) { acc += w[i - 1]; let t = T * acc / sum; let best = null, bd = 1e9; for (const s of sil) { const d = Math.abs(s - t); if (d < bd && d < Math.max(1.2, T / n * 0.6) && s > st[i - 1] + 0.4) { bd = d; best = s; } } st.push(best != null ? best : t); }
  for (let i = 1; i < n; i++) if (st[i] <= st[i - 1] + 0.3) st[i] = st[i - 1] + 0.3;
  return st;
}

const errs = (a, truth) => truth.slice(1).map((t, i) => Math.abs(a[i + 1] - t));
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// ---------- 1-modul: quloq --------------------------------------------------
test("forced alignment survives comma pauses, merged sentences and STT noise", () => {
  const st = makeStory(80, 7, { commaPauses: true, merge: true });
  const heard = noisyTranscript(st.words, 3);
  const { starts, coverage } = S.startsFromTranscript(st.frames, heard, st.duration);
  const env = S.envelope(st.audio.pcm, st.audio.rate);
  const refined = S.refineStarts(starts, env, st.duration);
  const e = errs(refined, st.truth), eOld = errs(oldAlign(st.audio, st.frames), st.truth);
  console.log(`   coverage ${(coverage * 100).toFixed(0)}% | new: median ${(pct(e, .5) * 1000).toFixed(0)} ms, p95 ${(pct(e, .95) * 1000).toFixed(0)} ms, max ${(Math.max(...e) * 1000).toFixed(0)} ms` +
    ` | old 4.0.4: median ${(pct(eOld, .5) * 1000).toFixed(0)} ms, p95 ${(pct(eOld, .95) * 1000).toFixed(0)} ms, frames off by >0.5 s: ${eOld.filter((x) => x > 0.5).length}`);
  assert.ok(coverage > 0.8);
  assert.ok(pct(e, 0.5) < 0.04, "median boundary error under 40 ms");
  assert.ok(pct(e, 0.95) < 0.2, "95% of boundaries within 200 ms");
  assert.equal(e.filter((x) => x > 0.5).length, 0, "no frame drifts by more than half a second");
});

test("snapBoundary lands on the real onset within one 10 ms frame", () => {
  const rate = 16000, pcm = new Float32Array(rate * 3);
  for (let k = 0; k < rate; k++) pcm[k] = 0.3 * Math.sin(k * 0.1);
  for (let k = Math.floor(1.3 * rate); k < 3 * rate; k++) pcm[k] = 0.3 * Math.sin(k * 0.1);
  const env = S.envelope(pcm, rate);
  for (const guess of [1.0, 1.15, 1.42, 1.55]) assert.ok(Math.abs(S.snapBoundary(env, guess, { back: 0.45, fwd: 0.35 }) - 1.3) <= 0.011, `guess ${guess}`);
});

test("timeline is contiguous, monotonic and starts at zero", () => {
  const st = makeStory(30, 11, { merge: true });
  const starts = S.refineStarts(S.startsByProportion(st.frames, st.duration), S.envelope(st.audio.pcm, st.audio.rate), st.duration);
  const seg = S.segmentsFrom(st.frames, starts, st.duration);
  assert.equal(seg[0].start, 0);
  for (let i = 1; i < seg.length; i++) { assert.equal(seg[i].start, seg[i - 1].end); assert.ok(seg[i].end - seg[i].start >= 0.349); }
  assert.equal(seg[seg.length - 1].end, +st.duration.toFixed(3));
});

test("TTS anchors are exact and never moved by snapping", () => {
  const st = makeStory(20, 5);
  const anchors = [{ frame: 5, time: st.truth[5] }, { frame: 12, time: st.truth[12] }];
  const s = S.refineStarts(S.startsByProportion(st.frames, st.duration, anchors), S.envelope(st.audio.pcm, st.audio.rate), st.duration, { locked: new Set([5, 12]) });
  assert.equal(s[5], st.truth[5]); assert.equal(s[12], st.truth[12]);
});

// ---------- 1-modul: ko'z (drift himoyasi) ----------------------------------
const segsOf = (n, d = 4) => Array.from({ length: n }, (_, i) => ({ id: i + 1, start: i * d, end: (i + 1) * d, text: `gap ${i + 1}` }));

test("80 sentences, 75 images: every image stays on its own sentence (no drift)", () => {
  const segs = segsOf(80), missing = new Set([9, 23, 24, 51, 77]);
  const media = []; for (let k = 1; k <= 80; k++) if (!missing.has(k)) media.push({ name: String(k).padStart(3, "0") + ".png", segmentId: k });
  const { rows } = S.matchMedia(segs, media);
  rows.forEach((r, i) => { for (const j of r) if (!missing.has(i + 1)) assert.equal(media[j].segmentId, i + 1, `sentence ${i + 1}`); });
  const clips = S.clipsFrom(segs, media, rows);
  for (const c of clips) {
    assert.ok(c.segs.includes(media[c.media].segmentId), `image ${media[c.media].name} covers its own sentence`);
    for (const id of c.segs) if (id !== media[c.media].segmentId) assert.ok(missing.has(id), `image only stretches over sentences that have no image (${id})`);
  }
  assert.equal(clips.length, 75);
  assert.deepEqual([...new Set(clips.flatMap((c) => c.segs))].length, 80);
});

test("one long sentence with two images is split in half", () => {
  const segs = segsOf(5); segs[2].end = segs[2].start + 8; for (let i = 3; i < 5; i++) { segs[i].start += 4; segs[i].end += 4; }
  const media = [1, 2, 3, 3, 4, 5].map((k, i) => ({ name: `${i}.png`, segmentId: k }));
  const clips = S.clipsFrom(segs, media, S.matchMedia(segs, media).rows);
  const two = clips.filter((c) => c.segs[0] === 3);
  assert.equal(two.length, 2); assert.equal(two[0].end - two[0].start, 4); assert.equal(two[1].start, two[0].end);
});

test("vision votes rescue unnumbered, partly shuffled images", () => {
  const segs = segsOf(12);
  const order = [1, 2, 3, 5, 4, 6, 7, 8, 9, 10, 11, 12];      // two images uploaded in the wrong order
  const media = order.map((k, i) => ({ name: `IMG_${2034 + i}.jpg` }));
  const votes = order.map((k) => [k]);
  const { rows } = S.matchMedia(segs, media, { votes });
  // monotonic path keeps story order; the swapped pair is resolved without shifting the rest
  for (let i = 5; i < 12; i++) assert.equal(order[rows[i][0]], i + 1);
  assert.equal(order[rows[0][0]], 1);
  assert.equal(S.namesLookLikeFrames(media.map((m) => m.name), 12), false);
  assert.equal(S.namesLookLikeFrames(["001.png", "002.png", "004.png"], 12), true);
});

// ---------- 2-modul ----------------------------------------------------------
test("hooks: 5-6 dramatic frames in the first minute, spaced apart, frame 1 included", () => {
  const texts = ["Tong otdi.", "Qishloq jim edi.", "Birdan olov chiqdi!", "Odamlar qochdi.", "Jang boshlandi.", "Qon to'kildi.",
    "Xon sukut saqladi.", "Sir ochildi?", "Dushman hujum qildi.", "Hech kim omon qolmadi.", "Kun botdi.", "Tinchlik.", "Keyingi kun.", "Yana jang!", "Oxiri."];
  const segs = texts.map((t, i) => ({ id: i + 1, start: i * 5, end: i * 5 + 5, text: t }));
  const h = S.planHooks(segs, { count: 6 });
  assert.ok(h.length >= 5 && h.length <= 6); assert.ok(h.includes(1));
  assert.ok(h.every((id) => segs[id - 1].start < 60));
  for (let i = 1; i < h.length; i++) assert.ok(segs[h[i] - 1].start - segs[h[i - 1] - 1].start >= 6);
});

test("video clips are time-fitted instead of looping", () => {
  assert.deepEqual(S.fitClip(8, 6.4), { rate: 1.25, hold: false });
  assert.deepEqual(S.fitClip(5, 5.5), { rate: 0.9091, hold: false });
  const f = S.fitClip(3, 6);                      // too short: slow to 0.8, then hold last frame
  assert.equal(f.rate, 0.8); assert.equal(f.hold, true);
  assert.ok(S.clipSourceTime(5.9, f, 3) < 3);     // never wraps back to the start
  assert.ok(S.clipSourceTime(5.9, f, 3) > 2.99);
});

test("camera motion alternates, shakes on battle lines, videos stay still", () => {
  const clips = [{ x: "tong" }, { x: "jangchilar non yedi" }, { x: "jang boshlandi" }, { x: "kun", isVideo: true }, { x: "dushman hujum qildi" }, { x: "tun" }];
  S.assignMotion(clips);
  assert.equal(clips[2].motion, "shake"); assert.equal(clips[3].motion, "none");
  assert.notEqual(clips[1].motion, "shake", "'jangchilar' (warriors) is not a battle moment");
  assert.notEqual(clips[4].motion, "shake", "shakes are spaced at least 4 clips apart");
  for (let i = 1; i < clips.length; i++) assert.notEqual(clips[i].motion, clips[i - 1].motion);
});

test("full pipeline without AI key still produces a drift-free timeline", async () => {
  const st = makeStory(25, 21, { merge: true });
  const media = st.frames.map((_, i) => ({ name: String(i + 1).padStart(3, "0") + ".png" })).filter((_, i) => i !== 7);
  const out = await S.build({ audio: st.audio, frameTexts: st.frames, media, callJSON: null, hookCount: 6 });
  assert.equal(out.clips[0].start, 0);
  assert.ok(Math.abs(out.clips[out.clips.length - 1].end - st.duration) < 0.01);
  for (let i = 1; i < out.clips.length; i++) assert.ok(Math.abs(out.clips[i].start - out.clips[i - 1].end) < 1e-6);
  assert.equal(out.report.trustNames, true);
  assert.ok(out.clips.filter((c) => c.hook).length >= 4);
});

test("full pipeline with a (mock) Gemini STT uses forced alignment", async () => {
  const st = makeStory(40, 33, { commaPauses: true, merge: true });
  const heard = noisyTranscript(st.words, 9);
  let calls = 0;
  const callJSON = async (req) => {             // returns phrases for the requested window
    calls++;
    const parts = req.contents[0].parts, txt = parts[1].text;
    const len = parseFloat(txt.match(/\(([\d.]+) s\)/)[1]);
    const t0 = (calls - 1) * (75 - 4);
    const inWin = heard.filter((w) => w.t0 >= t0 && w.t1 <= t0 + len);
    const segments = [];
    for (let i = 0; i < inWin.length; i += 4) { const g = inWin.slice(i, i + 4); segments.push({ start: g[0].t0 - t0, end: g[g.length - 1].t1 - t0, text: g.map((w) => w.w).join(" ") }); }
    return { segments };
  };
  const media = st.frames.map((_, i) => ({ name: String(i + 1).padStart(3, "0") + ".png" }));
  const out = await S.build({ audio: st.audio, frameTexts: st.frames, media, callJSON });
  assert.equal(out.report.method, "stt");
  const e = out.segments.slice(1).map((s, i) => Math.abs(s.start - st.truth[i + 1]));
  console.log(`   pipeline: ${calls} STT windows, coverage ${(out.report.coverage * 100).toFixed(0)}%, median ${(pct(e, .5) * 1000).toFixed(0)} ms, max ${(Math.max(...e) * 1000).toFixed(0)} ms`);
  assert.ok(pct(e, 0.5) < 0.05 && Math.max(...e) < 0.5);
});

test("no AI key: global pause DP does not drift", () => {
  const st = makeStory(80, 7, { commaPauses: true, merge: true });
  const env = S.envelope(st.audio.pcm, st.audio.rate);
  const dp = S.refineStarts(S.startsByPauseDP(st.frames, env, st.duration), env, st.duration);
  const prop = S.refineStarts(S.startsByProportion(st.frames, st.duration), env, st.duration);
  const e = errs(dp, st.truth), ep = errs(prop, st.truth), eOld = errs(oldAlign(st.audio, st.frames), st.truth);
  console.log(`   no key: pause-DP median ${(pct(e, .5) * 1000).toFixed(0)} ms, p95 ${(pct(e, .95) * 1000).toFixed(0)} ms, >0.5 s: ${e.filter((x) => x > 0.5).length}` +
    ` | proportional p95 ${(pct(ep, .95) * 1000).toFixed(0)} ms | old 4.0.4 p95 ${(pct(eOld, .95) * 1000).toFixed(0)} ms, >0.5 s: ${eOld.filter((x) => x > 0.5).length}`);
  assert.ok(pct(e, 0.95) < pct(eOld, 0.95) / 3, "at least 3x better than 4.0.4 at p95");
  assert.ok(e.filter((x) => x > 0.5).length < eOld.filter((x) => x > 0.5).length / 3);
});

test("a missing image is covered by continuing the previous image, not by showing the next one early", () => {
  const segs = segsOf(12);
  const media = [];
  for (let k = 1; k <= 12; k++) if (k !== 9) media.push({ name: String(k).padStart(3, "0") + ".png", segmentId: k });
  const clips = S.clipsFrom(segs, media, S.matchMedia(segs, media).rows);
  const c8 = clips.find((c) => media[c.media].segmentId === 8), c10 = clips.find((c) => media[c.media].segmentId === 10);
  assert.deepEqual(c8.segs, [8, 9]); assert.deepEqual(c10.segs, [10]);
  assert.equal(c10.start, segs[9].start);
});
