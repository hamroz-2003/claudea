/* FlowCraft V2 — 2-modul interfeysi (hook kadrlar) va 3-modul: Yagona sahna jadvali.
 *
 * Sahna jadvali: har qator = bitta kadr. Diktor matni, aniq vaqti (1-modul
 * natijasi), personaj/joy referensi, rasm prompti, hook belgisi va harakat
 * prompti, tayyor rasm/video — hammasi bitta joyda. Bitta kadrni boshqalarga
 * tegmasdan tahrirlash, promptini qayta yozish yoki rasmini almashtirish mumkin.
 *
 * fc-v2.js dan keyin yuklanadi; app.js global yordamchilaridan foydalanadi:
 * P, $, esc, pad3, purl, isVid, copyText, toast, save, upload, refreshImages,
 * locFor, aiReady, buildTimeline0, go, renderStep6, rTL, clips.
 */
(function () {
  "use strict";
  const V2 = window.FCV2;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, ms = 180000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(400); }
    return false;
  }
  const fmtT = (s) => {
    if (!(s >= 0)) return "—";
    const m = Math.floor(s / 60), ss = (s % 60).toFixed(2).padStart(5, "0");
    return `${String(m).padStart(2, "0")}:${ss}`;
  };
  const frameNo = (m) => FCSync.frameNumberOf(m.name || m.rel);

  /** kadr raqami → {img, vid} (P.media.images dan) */
  function mediaByFrame() {
    const map = new Map();
    for (const m of P.media.images || []) {
      const k = frameNo(m);
      if (!k) continue;
      const e = map.get(k) || {};
      if (isVid(m.rel)) e.vid = m; else e.img = m;
      map.set(k, e);
    }
    return map;
  }
  function hookFrames() {
    const user = Object.keys(P.anim || {}).map(Number).filter((k) => k > 0).sort((a, b) => a - b);
    if (user.length) return { list: user, auto: false };
    // taklif: dramatik kadrlar + MP4 allaqachon yuklangan kadrlar (foydalanuvchi niyati aniq)
    const withVideo = [...mediaByFrame()].filter(([, m]) => m.vid).map(([k]) => k);
    const list = [...new Set([...V2.hookFramesFromScript(6).map((x) => x + 1), ...withVideo])].sort((a, b) => a - b);
    return { list, auto: true };
  }
  function segTimes() {
    const sy = P.sync;
    return sy && sy.frameSig === V2.sig(P.frames || []) ? sy.segments : null;
  }
  function refsFor(k) {
    const text = ((P.frames[k - 1] || "") + " " + (P.prompts[k - 1] || "")).toLowerCase();
    const chars = (P.refs.chars || []).map((c, i) => ({ id: `CHAR-${i + 1}`, name: c.name || "" }))
      .filter((c) => c.name && text.includes(c.name.toLowerCase().slice(0, Math.max(3, Math.min(6, c.name.length)))));
    const loc = locFor(k);
    const li = loc ? (P.refs.locs || []).indexOf(loc) : -1;
    return { chars, loc: loc ? { id: `LOC-${li + 1}`, name: loc.name || "" } : null };
  }
  function markStale() { if (P.tl) P.tl.stale = true; save(); }

  async function replaceMedia(k, file) {
    const ext = (file.name.match(/\.[a-z0-9]+$/i) || [isVid(file.name) ? ".mp4" : ".png"])[0].toLowerCase();
    const video = /\.(mp4|mov|webm|m4v)$/i.test(ext);
    const cur = mediaByFrame().get(k) || {};
    const keep = video ? cur.vid : cur.img;
    // shu kadrning eski fayli bo'lsa, o'sha nom bilan yozamiz (dublikat paydo bo'lmasin)
    const name = keep ? keep.name : pad3(k) + ext;
    await upload("images", file, { name });
    await refreshImages();
    markStale();
    toast(`${pad3(k)}-kadr ${video ? "videosi" : "rasmi"} yangilandi`);
  }
  function pickFile(accept) {
    return new Promise((res) => {
      const i = document.createElement("input");
      i.type = "file"; i.accept = accept;
      i.onchange = () => res(i.files && i.files[0] || null);
      i.click();
    });
  }

  async function regenPrompt(k) {
    if (!aiReady()) { toast("AI kaliti kerak (Sozlamalar)", 1); return false; }
    const btn = $("#promptBtn");
    if (!btn || btn.hidden) { toast("Promptlar hozir yozilmoqda, biroz kuting", 1); return false; }
    const old = P.prompts[k - 1];
    P.prompts[k - 1] = "";
    btn.click();                                   // generator faqat bo'sh promptlarni to'ldiradi
    const t0 = Date.now();
    // tugadi = prompt yozildi, yoki generator to'xtadi (tugma qaytib chiqdi)
    await waitFor(() => !!P.prompts[k - 1] || (Date.now() - t0 > 1500 && !$("#promptBtn").hidden));
    if (!P.prompts[k - 1]) { P.prompts[k - 1] = old; save(); toast("Prompt yozilmadi (AI limiti yoki xato). Eski prompt qoldi", 1); return false; }
    return true;
  }
  async function writeMotion(k) {
    if (!aiReady()) { toast("AI kaliti kerak (Sozlamalar)", 1); return false; }
    P.anim = P.anim || {};
    if (!P.anim[k]) P.anim[k] = { t: "", d: 5 };
    $("#animSel").value = String(k);
    $("#animBtn").click();
    return waitFor(() => P.anim[k] && P.anim[k].t && !/yozilmoqda/.test(P.anim[k].t) && !$("#animBtn").disabled);
  }

  // =================================================== 2-modul: hook paneli --
  V2.renderHookPanel = function () {
    const pane = document.querySelector('.pane[data-p="6"]');
    if (!pane || !P) return;
    let box = document.getElementById("v2HookPanel");
    if (!box) {
      box = document.createElement("div");
      box.className = "panel"; box.id = "v2HookPanel";
      pane.insertBefore(box, pane.firstChild ? pane.firstChild.nextSibling : null);
      box.addEventListener("click", onHookClick);
    }
    const { list, auto } = hookFrames();
    const mb = mediaByFrame();
    const segs = segTimes();
    const rows = list.map((k) => {
      const m = mb.get(k) || {};
      const st = m.vid ? `<span class="v2c ok">MP4 bor</span>` : m.img ? `<span class="v2c warn">faqat rasm</span>` : `<span class="v2c err">rasm yo'q</span>`;
      const th = m.img ? `<img src="${purl(m.img.rel, true)}" alt="" loading="lazy">` : m.vid ? `<img src="${purl(m.vid.rel, true)}" alt="" loading="lazy">` : "";
      const tm = segs && segs[k - 1] ? `<span class="v2mono">${fmtT(segs[k - 1].start)}</span>` : "";
      const anim = P.anim && P.anim[k] && P.anim[k].t;
      return `<div class="v2h"><div class="v2th">${th}</div><div class="v2hm"><div class="v2hr"><b>${pad3(k)}</b>${tm}${st}</div>
        <div class="v2ht">${esc((P.frames[k - 1] || "").slice(0, 140))}</div>
        <div class="v2hr"><button class="pill sm" type="button" data-hmp4="${k}">MP4 yuklash</button>${anim ? `<button class="pill sm" type="button" data-hcp="${k}">Harakat promptini nusxalash</button>` : `<button class="pill sm" type="button" data-hwr="${k}">Harakat promptini yozish</button>`}</div></div></div>`;
    }).join("");
    const done = list.filter((k) => (mb.get(k) || {}).vid).length;
    box.innerHTML = `<div class="row between"><h3>Birinchi daqiqa: hook kadrlar</h3><span class="v2c ${done >= Math.min(5, list.length) ? "ok" : "warn"}">${done} / ${list.length} MP4</span></div>
      <p class="sub">Shu kadrlarda rasm o'rniga 5–6 soniyalik animatsiya (MP4) bo'lsa, video jonli boshlanadi. MP4 gap vaqtiga avtomatik moslanadi: tezligi biroz o'zgaradi yoki oxirgi kadr ushlab turiladi, qayta-qayta aylanmaydi.${auto ? " Ro'yxat ssenariydagi eng dramatik gaplardan avtomatik taklif qilindi." : ""}</p>
      <div class="v2hl">${rows || '<div class="empty">Avval ssenariy kerak</div>'}</div>
      <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">${auto ? `<button class="pill sm on" type="button" data-hacc>Shu kadrlarni hook qilish</button>` : ""}<button class="pill sm" type="button" data-hscn>Sahnalar jadvali</button></div>`;
  };
  async function onHookClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.hmp4) { const f = await pickFile("video/*"); if (f) { await replaceMedia(+b.dataset.hmp4, f); V2.renderHookPanel(); } return; }
    if (b.dataset.hcp) { copyText(P.anim[b.dataset.hcp].t); return; }
    if (b.dataset.hwr) { b.disabled = true; b.textContent = "Yozilmoqda…"; await writeMotion(+b.dataset.hwr); V2.renderHookPanel(); return; }
    if (b.hasAttribute("data-hacc")) {
      P.anim = P.anim || {};
      for (const k of hookFrames().list) if (!P.anim[k]) P.anim[k] = { t: "", d: 5 };
      save(); V2.renderHookPanel(); toast("Hook kadrlar belgilandi. Endi ularga harakat promptini yozing yoki MP4 yuklang"); return;
    }
    if (b.hasAttribute("data-hscn")) V2.openScenes();
  }

  // ============================================ 3-modul: yagona sahna jadvali --
  let filter = "all";
  function cardHTML(k, mb, segs, hooks) {
    const m = mb.get(k) || {};
    const r = refsFor(k);
    const seg = segs && segs[k - 1];
    const isHook = hooks.has(k);
    const anim = (P.anim && P.anim[k]) || null;
    const media = m.vid
      ? `<div class="v2sm"><img src="${purl(m.vid.rel, true)}" alt="" loading="lazy"><span class="v2tag">MP4</span></div>`
      : m.img ? `<div class="v2sm"><img src="${purl(m.img.rel, true)}" alt="" loading="lazy"></div>`
      : `<div class="v2sm v2empty">rasm yo'q</div>`;
    const chips = [...r.chars.map((c) => `<span class="v2c">${c.id} · ${esc(c.name)}</span>`), r.loc ? `<span class="v2c">${r.loc.id} · ${esc(r.loc.name)}</span>` : ""].join("");
    return `<article class="v2s ${isHook ? "hook" : ""}" data-k="${k}">
      <div class="v2scol">${media}
        <button class="pill sm" type="button" data-act="media">Almashtirish</button></div>
      <div class="v2smain">
        <div class="v2hr"><b class="v2n">${pad3(k)}</b><span class="v2mono">${seg ? fmtT(seg.start) + " – " + fmtT(seg.end) : "vaqt: montajdan keyin"}</span>${chips}
          <label class="v2tog"><input type="checkbox" data-act="hook" ${isHook ? "checked" : ""}> Hook (animatsiya)</label></div>
        <label class="v2f"><span>Diktor matni</span><textarea data-f="text" rows="2">${esc(P.frames[k - 1] || "")}</textarea></label>
        <label class="v2f"><span>Rasm prompti</span><textarea data-f="prompt" rows="3" placeholder="Prompt hali yo'q">${esc(P.prompts[k - 1] || "")}</textarea></label>
        <div class="v2hr"><button class="pill sm" type="button" data-act="regen">Promptni qayta yozish</button><button class="pill sm" type="button" data-act="copy">Nusxalash</button></div>
        ${isHook ? `<label class="v2f"><span>Harakat prompti (rasmni jonlantirish uchun)</span><textarea data-f="motion" rows="2" placeholder="Masalan: slow cinematic push-in, fire sparks drifting…">${esc((anim && anim.t) || "")}</textarea></label>
        <div class="v2hr"><button class="pill sm" type="button" data-act="motion">Harakat promptini yozish</button><button class="pill sm" type="button" data-act="mcopy">Nusxalash</button></div>` : ""}
      </div></article>`;
  }
  function stats(mb, hooks) {
    const n = (P.frames || []).length;
    const pr = (P.prompts || []).filter((x, i) => i < n && x).length;
    let med = 0, vid = 0;
    for (let k = 1; k <= n; k++) { const m = mb.get(k); if (m && (m.img || m.vid)) med++; if (hooks.has(k) && m && m.vid) vid++; }
    return { n, pr, med, vid, hooks: hooks.size };
  }
  function visibleFrames(mb, hooks) {
    const n = (P.frames || []).length, out = [];
    for (let k = 1; k <= n; k++) {
      const m = mb.get(k);
      if (filter === "todo" && P.prompts[k - 1] && m && (m.img || m.vid)) continue;
      if (filter === "hook" && !hooks.has(k)) continue;
      out.push(k);
    }
    return out;
  }
  V2.renderScenes = function () {
    const root = document.getElementById("v2Scenes");
    if (!root || !P) return;
    const mb = mediaByFrame(), segs = segTimes();
    const hooks = new Set(Object.keys(P.anim || {}).map(Number));
    const st = stats(mb, hooks);
    root.querySelector(".v2stats").innerHTML =
      `<span class="v2c">${st.n} sahna</span><span class="v2c ${st.pr === st.n ? "ok" : "warn"}">${st.pr} prompt</span>` +
      `<span class="v2c ${st.med === st.n ? "ok" : "warn"}">${st.med} rasm/video</span><span class="v2c ${st.hooks && st.vid === st.hooks ? "ok" : ""}">${st.vid}/${st.hooks} hook MP4</span>` +
      (segs ? `<span class="v2c ok">vaqtlar aniq</span>` : `<span class="v2c">vaqtlar montajdan keyin chiqadi</span>`);
    root.querySelectorAll("[data-flt]").forEach((b) => b.classList.toggle("on", b.dataset.flt === filter));
    const ks = visibleFrames(mb, hooks);
    root.querySelector(".v2list").innerHTML = ks.length ? ks.map((k) => cardHTML(k, mb, segs, hooks)).join("")
      : `<div class="empty">${filter === "todo" ? "Hamma sahnada prompt va rasm bor" : "Bu ro'yxat bo'sh"}</div>`;
  };
  function refreshCard(k) {
    const el = document.querySelector(`#v2Scenes .v2s[data-k="${k}"]`);
    if (!el) return V2.renderScenes();
    const mb = mediaByFrame(), hooks = new Set(Object.keys(P.anim || {}).map(Number));
    el.outerHTML = cardHTML(k, mb, segTimes(), hooks);
    const st = stats(mb, hooks);
    document.querySelector("#v2Scenes .v2stats .v2c:nth-child(2)").textContent = `${st.pr} prompt`;
  }

  V2.openScenes = function () {
    if (!P) return;
    if (!(P.frames || []).length) { toast("Avval ssenariy kerak (3-qadam)", 1); return; }
    let root = document.getElementById("v2Scenes");
    if (!root) {
      root = document.createElement("div");
      root.id = "v2Scenes";
      root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Sahnalar jadvali");
      root.innerHTML = `<div class="v2top"><div class="v2tt"><h2>Sahnalar jadvali</h2><div class="v2stats"></div></div>
        <div class="v2hr"><div class="seg sm2"><button class="pill sm" type="button" data-flt="all">Hammasi</button><button class="pill sm" type="button" data-flt="todo">Kamchiligi bor</button><button class="pill sm" type="button" data-flt="hook">Hook kadrlar</button></div>
        <button class="pill sm on" type="button" data-top="build">Montajni yangilash</button><button class="pill sm" type="button" data-top="edit">Montajga o'tish</button><button class="pill sm" type="button" data-top="close" aria-label="Yopish">Yopish</button></div></div>
        <div class="v2list"></div>`;
      document.body.appendChild(root);
      root.addEventListener("click", onSceneClick);
      root.addEventListener("input", onSceneInput);
      root.addEventListener("change", onSceneChange);
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !root.hidden) V2.closeScenes(); });
    }
    root.hidden = false;
    document.documentElement.classList.add("v2-lock");
    V2.renderScenes();
  };
  V2.closeScenes = function () {
    const root = document.getElementById("v2Scenes");
    if (root) root.hidden = true;
    document.documentElement.classList.remove("v2-lock");
    try { if (typeof renderStep5 === "function" && S.cur === 5) renderStep5(); if (S.cur === 6) renderStep6(); } catch (_) { /* boshqa ekranda */ }
  };

  let textWarned = false;
  function onSceneInput(e) {
    const t = e.target.closest("[data-f]");
    if (!t) return;
    const k = +t.closest(".v2s").dataset.k;
    if (t.dataset.f === "text") {
      P.frames[k - 1] = t.value; markStale();
      if (!textWarned && P.media.audio) { textWarned = true; toast("Matn o'zgardi: ovoz bu matnga mos kelishi uchun ovozni qayta yarating yoki yuklang"); }
    } else if (t.dataset.f === "prompt") { P.prompts[k - 1] = t.value; save(); }
    else if (t.dataset.f === "motion") { P.anim = P.anim || {}; P.anim[k] = Object.assign({ d: 5 }, P.anim[k], { t: t.value }); save(); }
  }
  function onSceneChange(e) {
    const c = e.target.closest('[data-act="hook"]');
    if (!c) return;
    const k = +c.closest(".v2s").dataset.k;
    P.anim = P.anim || {};
    if (c.checked) P.anim[k] = P.anim[k] || { t: "", d: 5 }; else delete P.anim[k];
    markStale(); refreshCard(k);
  }
  async function onSceneClick(e) {
    const f = e.target.closest("[data-flt]");
    if (f) { filter = f.dataset.flt; V2.renderScenes(); return; }
    const top = e.target.closest("[data-top]");
    if (top) {
      if (top.dataset.top === "close") return V2.closeScenes();
      if (top.dataset.top === "build") {
        top.disabled = true; top.textContent = "Moslanmoqda…";
        try { await buildTimeline0(); } finally { top.disabled = false; top.textContent = "Montajni yangilash"; V2.renderScenes(); }
        return;
      }
      if (top.dataset.top === "edit") { V2.closeScenes(); go(7); return; }
    }
    const b = e.target.closest("[data-act]");
    if (!b || b.tagName === "INPUT") return;
    const k = +b.closest(".v2s").dataset.k;
    const act = b.dataset.act;
    if (act === "copy") { if (P.prompts[k - 1]) copyText(P.prompts[k - 1]); else toast("Prompt hali yo'q", 1); return; }
    if (act === "mcopy") { const t = P.anim && P.anim[k] && P.anim[k].t; if (t) copyText(t); else toast("Harakat prompti hali yo'q", 1); return; }
    if (act === "media") { const file = await pickFile("image/*,video/*"); if (file) { await replaceMedia(k, file); refreshCard(k); } return; }
    if (act === "regen" || act === "motion") {
      b.disabled = true; b.textContent = "Yozilmoqda…";
      try { if (act === "regen") await regenPrompt(k); else await writeMotion(k); } finally { refreshCard(k); }
    }
  }

  // ------------------------------------------------ mavjud ekranlarga ulash --
  if (typeof window.renderStep6 === "function") {
    const orig = window.renderStep6;
    window.renderStep6 = function () { const r = orig.apply(this, arguments); try { V2.renderHookPanel(); } catch (err) { console.warn(err); } return r; };
  }
  if (typeof window.rTL === "function") {
    const orig = window.rTL;
    window.rTL = function () {
      const r = orig.apply(this, arguments);
      try { clips().forEach((c, i) => { if (c.hook) { const el = document.querySelector(`.cl[data-ci="${i}"]`); if (el) el.classList.add("hook"); } }); } catch (_) { /* tahrirlovchi yopiq */ }
      return r;
    };
  }
  document.addEventListener("click", (e) => { if (e.target.closest("#v2ScenesBtn")) V2.openScenes(); });
})();
