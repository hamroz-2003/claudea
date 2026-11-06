/* FlowCraft V2 — mavjud ilovaga ulovchi qatlam (app.js dan keyin yuklanadi).
 *
 * app.js dagi buildTimeline0() endi shu yerdagi FCV2.buildTimeline() ni
 * chaqiradi. "Teng bo'lib" va "Fayl nomidagi vaqt" rejimlari o'zgarishsiz
 * eski yo'ldan ishlaydi; "aqlli" va "AI" rejimlari FCSync orqali.
 *
 * app.js ning global yordamchilari ishlatiladi: P, GM, jsonFrom, purl,
 * isVid, sortedImages, toast, save, defaultTL, tplSub, tlSig, FCL.
 */
(function () {
  "use strict";
  const V2 = (window.FCV2 = {});

  // ------------------------------------------------------------ yordamchi --
  const callJSON = async (req) => {
    const t = await GM.json(req, { kind: "text", label: "sync" });
    const j = jsonFrom(t);
    if (!j) throw new Error("AI javobi tushunarsiz");
    return j;
  };
  const fetchBlob = async (rel, thumb) => {
    const r = await fetch(purl(rel, thumb));
    if (!r.ok) throw new Error("Fayl o'qilmadi: " + rel);
    return r.blob();
  };
  async function thumbBase64(rel) {
    const b = await fetchBlob(rel, true).catch(() => fetchBlob(rel, false));
    const bmp = await createImageBitmap(b);
    const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return { data: c.toDataURL("image/jpeg", 0.72).split(",")[1], mime: "image/jpeg" };
  }
  function videoDuration(rel) {
    return new Promise((res) => {
      const v = document.createElement("video");
      v.preload = "metadata"; v.muted = true;
      const done = (d) => { v.removeAttribute("src"); v.load(); res(d || 0); };
      v.onloadedmetadata = () => done(v.duration);
      v.onerror = () => done(0);
      setTimeout(() => done(0), 8000);
      v.src = window.FCL && FCL.videoUrl ? FCL.videoUrl(P.id, rel) : purl(rel);
    });
  }
  const sig = (frames) => {
    let h = 2166136261;
    for (const ch of (frames || []).join("\n")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  };
  V2.sig = sig;

  // ------------------------------------------- TTS: kadrlar bo'yicha langar --
  /**
   * TTS bo'laklarini butun kadrlardan yig'adi: kadr hech qachon ikki
   * bo'lakka bo'linmaydi, shuning uchun har bo'lak boshi = aniq kadr boshi.
   * Kadrlar ssenariy matniga mos kelmasa (ssenariy keyin tahrirlangan),
   * eski bo'lish usuli ishlatiladi.
   */
  V2.ttsPlan = function (text, limit) {
    const fr = (P.frames || []).map((x) => String(x || "").trim());
    const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    const a = words(fr.join(" ")), b = words(text);
    const same = fr.length && fr.every(Boolean) && Math.abs(a.length - b.length) <= Math.max(3, b.length * 0.03);
    if (!same) return { parts: ttsSplit(text, limit), first: null };
    const parts = [], first = [];
    let cur = "", start = 0;
    fr.forEach((t, i) => {
      if (cur && (cur + " " + t).length > limit) { parts.push(cur); first.push(start); cur = t; start = i; }
      else cur = cur ? cur + " " + t : t;
    });
    if (cur) { parts.push(cur); first.push(start); }
    return { parts, first };
  };
  /** pcm = [bo'lak0, pauza, bo'lak1, pauza, …] (app.js tartibi). */
  V2.ttsAnchors = function (plan, pcm, rate) {
    if (!plan.first) return null;
    const out = [];
    let t = 0;
    plan.first.forEach((frame, i) => {
      out.push({ frame, time: +(t / rate).toFixed(3) });
      t += (pcm[2 * i] ? pcm[2 * i].length : 0) + (pcm[2 * i + 1] ? pcm[2 * i + 1].length : 0);
    });
    return out;
  };
  function validAnchors(audio, frames) {
    return audio && audio.anchors && audio.anchorSig === sig(frames) ? audio.anchors : [];
  }

  // ------------------------------------------------- asosiy: vaqt jadvali --
  V2.buildTimeline = async function () {
    const mode = P.align || "smart";
    const frames = (P.frames || []).map((x) => String(x || "").trim()).filter(Boolean);
    if (mode === "equal" || mode === "timecode" || !frames.length) return buildTimeline0Legacy();
    const imgs = sortedImages(), a = P.media.audio;
    if (!imgs.length) { toast("Rasm yo'q", 1); return false; }
    if (!a) { toast("Ovoz yo'q. Ovoz yarating yoki yuklang", 1); return false; }

    const hasAI = GM.keys().length > 0;
    const vision = mode === "ai" && hasAI;
    const stage = (label, p) => { V2.lastStage = label; if (typeof p === "number") V2.progress = p; };
    try {
      toast("Ovoz tinglanmoqda…");
      const audio = await FCSync.decode(await fetchBlob(a.rel));
      const media = [];
      for (const im of imgs) {
        const video = isVid(im.rel);
        media.push({ name: im.name || im.rel, rel: im.rel, isVideo: video, duration: video ? await videoDuration(im.rel) : 0, segmentId: im.frame ?? null });
      }
      if (vision) {
        toast("AI rasmlarni ko'rmoqda…");
        for (const m of media) { try { m.thumb = await thumbBase64(m.rel); } catch (_) { /* eskizsiz qoladi */ } }
      }
      const out = await FCSync.build({
        audio, frameTexts: frames, media, anchors: validAnchors(a, P.frames || []),
        callJSON: hasAI ? callJSON : null, useVision: vision, language: P.lang || CFG.lang || "uz",
        hookCount: 6, onStage: stage,
      });

      const old = P.tl || tplSub(defaultTL());
      const tl = Object.assign(defaultTL(), old);
      delete tl._tsub;
      tl.clips = out.clips.map((c) => {
        const clip = { img: media[c.media].rel, d: c.d, x: c.x, motion: c.motion, start: c.start, segs: c.segs };
        if (c.hook) { clip.hook = true; clip.motionPrompt = c.motionPrompt; }
        if (c.fit) clip.fit = c.fit;
        return clip;
      });
      if (!old.els || !old.els.length) tl.els = [{ id: "sb", k: "sub", s: Math.min(45, audio.duration * 0.25), d: 5 }];
      tl.sig = tlSig(); tl.stale = false; tl.edited = false; tl.total = audio.duration;
      P.tl = tl;
      P.media.audio.duration = audio.duration;
      P.sync = { v: 2, report: out.report, segments: out.segments, at: Date.now() };
      P.hookFrames = out.report.hooks;
      save(true);

      const r = out.report;
      const how = { stt: `ovoz tinglandi (${Math.round((r.coverage || 0) * 100)}% so'z topildi)`, "tts-anchors": "TTS kadr vaqtlari bo'yicha (aniq)", "pause-dp": "AI kalitisiz (taxminiy)" }[r.method] || r.method;
      const extra = [r.spans ? `${r.spans} rasm 2+ gapga cho'zildi` : "", r.splits ? `${r.splits} gapga 2 rasm` : "", r.vision ? "AI ko'zi ishladi" : ""].filter(Boolean).join(" · ");
      toast(`${frames.length} gap · ${imgs.length} rasm joylandi · ${how}${extra ? " · " + extra : ""}`);
      if (r.method === "pause-dp") setTimeout(() => toast("Aniq moslash uchun Sozlamalarga bepul Gemini kalitini qo'shing: dastur ovozni tinglab, har rasmni o'z gapiga 0,01 soniya aniqlikda qo'yadi", 1), 1800);
      const stillHooks = tl.clips.filter((c) => c.hook && !isVid(c.img)).length;
      if (stillHooks) setTimeout(() => toast(`Birinchi daqiqada ${stillHooks} ta hook kadr belgilandi: ularga MP4 animatsiya qo'ysangiz, video jonliroq bo'ladi`), 2500);
      if (r.sttError) console.warn("FCSync STT:", r.sttError);
      return true;
    } catch (e) {
      console.error(e);
      toast("Aqlli moslash ishlamadi (" + e.message + "). Taxminiy usul ishlatildi", 1);
      return buildTimeline0Legacy();
    }
  };

  /** Animatsiya promptlari qadamida: birinchi daqiqadagi eng dramatik kadrlar. */
  V2.hookFramesFromScript = function (count = 6) {
    const frames = (P.frames || []).map((x) => String(x || "").trim());
    const total = frames.reduce((s, t) => s + t.length, 0) || 1;
    const dur = Math.max(30, (P.media && P.media.audio && P.media.audio.duration) || total / 14);
    let t = 0;
    const segs = frames.map((text, i) => { const d = (dur * text.length) / total; const s = { id: i + 1, start: t, end: t + d, text }; t += d; return s; });
    return FCSync.planHooks(segs, { count }).map((id) => id - 1);
  };
})();
