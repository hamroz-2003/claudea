/* FlowCraft Studio - mobile / desktop client for the FlowCraft engine.
 * No build step, no dependencies: works served by the engine (/ui/), from
 * the HF Space, or bundled inside the Android app (Capacitor).            */
"use strict";

// ------------------------------------------------------------------ i18n --
const I18N = {
  uz: {
    "nav.projects": "Loyihalar", "nav.new": "Yangi", "nav.settings": "Sozlamalar",
    "engine.on": "Engine ulangan", "engine.off": "Engine ulanmagan",
    "connect.title": "Engine'ga ulanish",
    "connect.lead": "Video tayyorlash og'ir ish, u telefoningizda emas, engine'da bajariladi. Engine sizning kompyuteringizda yoki bepul Hugging Face Space'ingizda ishlaydi.",
    "connect.url": "Engine manzili", "connect.token": "Kirish tokeni", "connect.go": "Ulanish",
    "connect.howto": "Qayerdan olaman?",
    "connect.pc": "Kompyuter (eng tez): kompyuterda python main.py --lan ni ishga tushiring. U manzil va tokenni chiqaradi. Telefon bilan bir Wi-Fi tarmog'ida bo'ling.",
    "connect.space": "Faqat telefon: FlowCraft Space'ini Hugging Face'da \"Duplicate\" qiling, FLOWCRAFT_TOKEN maxfiy qiymatini qo'ying va Space manzilini kiriting.",
    "connect.fail": "Ulanib bo'lmadi", "connect.badtoken": "Token noto'g'ri",
    "projects.title": "Loyihalar", "projects.empty": "Hali loyiha yo'q. Birinchi videongizni boshlang.",
    "projects.new": "Yangi loyiha", "scenes": "sahna", "chapters": "bob",
    "new.title": "Yangi loyiha", "new.name": "Video nomi", "new.world": "Davr va joy (vizual dunyo)",
    "new.world.ph": "Masalan: XIV asr, Temuriylar davri, O'rta Osiyo",
    "new.lang": "Ovoz tili", "new.voice": "Diktor ovozi", "new.hook": "Animatsiyali boshlang'ich sahnalar",
    "new.format": "Format", "new.wide": "YouTube 16:9", "new.shorts": "Shorts 9:16",
    "new.chars": "Qahramonlar", "new.char.name": "Ism", "new.char.dna": "Tashqi ko'rinishi (35 so'zgacha)",
    "new.char.add": "Qahramon qo'shish",
    "new.script": "Ssenariy", "new.script.hint": "# bilan boshlangan qator bob sarlavhasi bo'ladi. Har bir gap alohida sahnaga aylanadi. [pause:600] belgisi 0,6 soniyalik pauza qo'yadi.",
    "new.create": "Yaratish va promptlarni boshlash",
    "step.prompts": "Promptlar", "step.voice": "Ovoz", "step.media": "Vizuallar", "step.preview": "Tez ko'rish", "step.final": "Yakuniy video",
    "act.generate": "Yaratish", "act.regenerate": "Qayta yaratish", "act.tts": "AI diktor", "act.upload_voice": "Ovoz yuklash",
    "act.media": "Bepul yaratish", "act.preview": "540p render", "act.render": "Render", "act.download": "Yuklab olish",
    "act.copy": "Nusxa olish", "act.save": "Saqlash", "act.cancel": "Bekor qilish", "act.delete": "O'chirish",
    "act.upload_media": "Fayl yuklash", "act.new_prompt": "Yangi prompt", "act.new_media": "Qayta yaratish",
    "q.fast": "Tez · 1080p30", "q.master": "Master · 1080p60",
    "st.ready": "tayyor", "st.missing": "yo'q", "st.notyet": "hali yo'q",
    "board": "Storyboard", "yt": "YouTube boblari",
    "job.prompts": "Promptlar yaratilmoqda", "job.voice_tts": "Ovoz yozilmoqda", "job.voice_align": "Ovoz moslashtirilmoqda",
    "job.voice_scenes": "Ovoz yig'ilmoqda", "job.media": "Vizuallar yaratilmoqda", "job.render": "Yakuniy render",
    "job.render_preview": "Tez ko'rish render", "job.done": "Tayyor", "job.error": "Xato",
    "scene.narration": "Matn", "scene.prompt": "Rasm prompti", "scene.motion": "Kamera harakati",
    "scene.transition": "O'tish", "scene.mode": "Turi", "scene.anim": "Animatsiya", "scene.still": "Rasm",
    "set.title": "Sozlamalar", "set.conn": "Ulanish", "set.lang": "Til", "set.llm": "Matn AI (promptlar)",
    "set.provider": "Provayder", "set.none": "Oflayn (AI'siz)", "set.key": "API kaliti", "set.model": "Model",
    "set.baseurl": "Server manzili", "set.media": "Media generatsiya", "set.img": "Rasmlar", "set.vid": "Hook videolari",
    "set.hftoken": "Hugging Face tokeni (Read)", "set.hftoken.hint": "huggingface.co → Settings → Access Tokens. Bepul kunlik GPU kvotangiz shu akkauntdan sarflanadi.",
    "set.steps": "Sifat qadamlari", "set.comfy": "ComfyUI manzili", "set.depth": "Aniq chuqurlik modeli (Depth-Anything)",
    "set.engine": "Engine", "set.saved": "Saqlandi", "set.disconnect": "Uzish",
    "b.manual": "Qo'lda (o'zim yuklayman)", "b.pollinations": "Pollinations (bepul, bulut)", "b.comfyui": "ComfyUI (o'z GPU'm)",
    "b.parallax": "2.5D parallaks (bepul, cheksiz)", "b.hf_space": "Wan 2.2, Hugging Face (bepul kvota)",
    "confirm.delete": "Loyiha butunlay o'chirilsinmi?", "copied": "Nusxa olindi",
    "quota": "Bugungi bepul HF GPU kvotasi tugadi; qolgan kliplar parallaks bilan yasaldi.",
  },
  en: {
    "nav.projects": "Projects", "nav.new": "New", "nav.settings": "Settings",
    "engine.on": "Engine connected", "engine.off": "Engine offline",
    "connect.title": "Connect to your engine",
    "connect.lead": "Video work is heavy, so it runs on the engine, not on this phone: on your computer or on your free Hugging Face Space.",
    "connect.url": "Engine address", "connect.token": "Access token", "connect.go": "Connect",
    "connect.howto": "Where do I get these?",
    "connect.pc": "Computer (fastest): run python main.py --lan on it; it prints the address and token. Keep the phone on the same Wi-Fi.",
    "connect.space": "Phone only: duplicate the FlowCraft Space on Hugging Face, set the FLOWCRAFT_TOKEN secret and enter the Space address.",
    "connect.fail": "Could not connect", "connect.badtoken": "Wrong token",
    "projects.title": "Projects", "projects.empty": "No projects yet. Start your first video.",
    "projects.new": "New project", "scenes": "scenes", "chapters": "chapters",
    "new.title": "New project", "new.name": "Video title", "new.world": "Era and place (visual world)",
    "new.world.ph": "e.g. 14th-century Timurid Central Asia",
    "new.lang": "Narration language", "new.voice": "Narrator voice", "new.hook": "Animated opening scenes",
    "new.format": "Format", "new.wide": "YouTube 16:9", "new.shorts": "Shorts 9:16",
    "new.chars": "Characters", "new.char.name": "Name", "new.char.dna": "Appearance (max 35 words)",
    "new.char.add": "Add character",
    "new.script": "Script", "new.script.hint": "A line starting with # is a chapter title. Each sentence becomes a scene. [pause:600] adds a 0.6 s pause.",
    "new.create": "Create and start prompts",
    "step.prompts": "Prompts", "step.voice": "Voice", "step.media": "Visuals", "step.preview": "Preview", "step.final": "Final video",
    "act.generate": "Generate", "act.regenerate": "Regenerate", "act.tts": "AI narrator", "act.upload_voice": "Upload voice",
    "act.media": "Generate free", "act.preview": "Render 540p", "act.render": "Render", "act.download": "Download",
    "act.copy": "Copy", "act.save": "Save", "act.cancel": "Cancel", "act.delete": "Delete",
    "act.upload_media": "Upload file", "act.new_prompt": "New prompt", "act.new_media": "Regenerate",
    "q.fast": "Fast · 1080p30", "q.master": "Master · 1080p60",
    "st.ready": "ready", "st.missing": "missing", "st.notyet": "not yet",
    "board": "Storyboard", "yt": "YouTube chapters",
    "job.prompts": "Writing prompts", "job.voice_tts": "Recording voice", "job.voice_align": "Aligning narration",
    "job.voice_scenes": "Assembling voice", "job.media": "Generating visuals", "job.render": "Final render",
    "job.render_preview": "Preview render", "job.done": "Done", "job.error": "Error",
    "scene.narration": "Narration", "scene.prompt": "Image prompt", "scene.motion": "Camera move",
    "scene.transition": "Transition", "scene.mode": "Type", "scene.anim": "Animated", "scene.still": "Still",
    "set.title": "Settings", "set.conn": "Connection", "set.lang": "Language", "set.llm": "Text AI (prompts)",
    "set.provider": "Provider", "set.none": "Offline (no AI)", "set.key": "API key", "set.model": "Model",
    "set.baseurl": "Server URL", "set.media": "Media generation", "set.img": "Stills", "set.vid": "Hook clips",
    "set.hftoken": "Hugging Face token (Read)", "set.hftoken.hint": "huggingface.co → Settings → Access Tokens. Your free daily GPU quota is used from this account.",
    "set.steps": "Quality steps", "set.comfy": "ComfyUI address", "set.depth": "Accurate depth model (Depth-Anything)",
    "set.engine": "Engine", "set.saved": "Saved", "set.disconnect": "Disconnect",
    "b.manual": "Manual (I upload)", "b.pollinations": "Pollinations (free, cloud)", "b.comfyui": "ComfyUI (my GPU)",
    "b.parallax": "2.5D parallax (free, unlimited)", "b.hf_space": "Wan 2.2 on Hugging Face (free quota)",
    "confirm.delete": "Delete this project permanently?", "copied": "Copied",
    "quota": "Today's free HF GPU quota is used up; the remaining clips were made with parallax.",
  },
};

// ----------------------------------------------------------------- state --
const store = {
  get(k, d) { try { const v = localStorage.getItem("fc." + k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("fc." + k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem("fc." + k); } catch { /* ignore */ } },
};
const servedByEngine = /^https?:$/.test(location.protocol) && location.pathname.startsWith("/ui");
const cfg = {
  base: store.get("base", servedByEngine ? location.origin : ""),
  token: store.get("token", ""),
  lang: store.get("lang", "uz"),
};
const t = (k) => (I18N[cfg.lang] && I18N[cfg.lang][k]) || I18N.en[k] || k;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const view = $("#view");

function tc(ms) {
  ms = Math.max(0, Math.round(ms || 0));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return (h ? h + ":" + pad(m) : pad(m)) + ":" + pad(s) + "." + pad(ms % 1000, 3);
}
const dur = (ms) => { const s = Math.round((ms || 0) / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), kind === "err" ? 7000 : 3500);
}

// ------------------------------------------------------------------- api --
class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function api(path, { method = "GET", json, form } = {}) {
  if (!cfg.base) throw new ApiError("no engine", 0);
  const headers = { "X-FlowCraft-Token": cfg.token };
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  let res;
  try { res = await fetch(cfg.base + path, { method, headers, body }); }
  catch (e) { setEngine(false); throw new ApiError(t("connect.fail"), 0); }
  setEngine(true);
  if (res.status === 401) { location.hash = "#/connect"; throw new ApiError(t("connect.badtoken"), 401); }
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    const d = data && data.detail;
    throw new ApiError(typeof d === "string" ? d : (Array.isArray(d) ? d.map((x) => x.msg).join("; ") : res.statusText), res.status);
  }
  return data;
}
const fileUrl = (pid, rel, v) => `${cfg.base}/projects/${pid}/files/${rel}?token=${encodeURIComponent(cfg.token)}${v ? "&v=" + v : ""}`;

function setEngine(ok) {
  const pill = $("#engine-pill");
  pill.className = "engine-pill " + (ok ? "ok" : "bad");
  $("span", pill).textContent = ok ? t("engine.on") : t("engine.off");
}

// ---------------------------------------------------- live job tracking --
const jobs = new Map();          // job id -> latest state
const jobListeners = new Set();
let ws = null, wsTimer = null;

function emitJob(j) {
  const prev = jobs.get(j.id) || {};
  const merged = { ...prev, ...j };
  jobs.set(j.id, merged);
  jobListeners.forEach((fn) => fn(merged));
}

function connectWs() {
  if (!cfg.base || !cfg.token) return;
  try { ws && ws.close(); } catch { /* ignore */ }
  try {
    ws = new WebSocket(cfg.base.replace(/^http/, "ws") + "/ws?token=" + encodeURIComponent(cfg.token));
  } catch { return; }
  ws.onmessage = (e) => {
    try { const m = JSON.parse(e.data); if (m.type === "job") emitJob(m); } catch { /* ignore */ }
  };
  ws.onclose = () => { clearTimeout(wsTimer); wsTimer = setTimeout(connectWs, 4000); };
}

// Polling backup: mobile networks drop sockets; this keeps progress honest.
async function pollJob(id) {
  for (;;) {
    let j;
    try { j = await api("/jobs/" + id); } catch { await sleep(3000); continue; }
    emitJob({ id: j.id, kind: j.kind, project_id: j.project_id, status: j.status, progress: j.progress, message: j.message, error: j.error });
    if (j.status === "done" || j.status === "error") return j;
    await sleep(1500);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startJob(path, json) {
  const r = await api(path, { method: "POST", json: json ?? {} });
  emitJob({ id: r.job_id, kind: r.kind, status: "queued", progress: 0 });
  pollJob(r.job_id);
  return r.job_id;
}

// ----------------------------------------------------------------- sheet --
function openSheet(html, mount) {
  const sheet = $("#sheet");
  $(".sheet-body", sheet).innerHTML = html;
  sheet.hidden = false;
  sheet.onclick = (e) => { if (e.target === sheet) closeSheet(); };
  mount && mount($(".sheet-body", sheet));
}
function closeSheet() { $("#sheet").hidden = true; }

// ---------------------------------------------------------------- router --
const routes = [
  [/^#\/connect$/, viewConnect],
  [/^#\/projects$/, viewProjects],
  [/^#\/new$/, viewNew],
  [/^#\/p\/([a-z0-9-]+)$/, viewProject],
  [/^#\/settings$/, viewSettings],
];
async function route() {
  jobListeners.clear();
  closeSheet();
  $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  if (!cfg.base || !cfg.token) { if (location.hash !== "#/connect") { location.hash = "#/connect"; return; } }
  const h = location.hash || "#/projects";
  $$("#nav a").forEach((a) => a.classList.toggle("active", h.startsWith("#/" + a.dataset.nav) || (a.dataset.nav === "projects" && h.startsWith("#/p/"))));
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      try { await fn(...m.slice(1)); } catch (e) { view.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
      view.focus({ preventScroll: true });
      return;
    }
  }
  location.hash = "#/projects";
}
window.addEventListener("hashchange", route);

// -------------------------------------------------------------- connect --
async function viewConnect() {
  view.innerHTML = `
    <h1>${t("connect.title")}</h1>
    <p class="muted">${t("connect.lead")}</p>
    <div class="card stack" style="margin-top:16px">
      <label class="field"><span>${t("connect.url")}</span>
        <input type="url" id="c-url" inputmode="url" autocomplete="url" placeholder="http://192.168.1.10:4100" value="${esc(cfg.base)}"></label>
      <label class="field"><span>${t("connect.token")}</span>
        <input type="password" id="c-token" autocomplete="off" value="${esc(cfg.token)}"></label>
      <button class="btn primary block" id="c-go">${t("connect.go")}</button>
    </div>
    <h2>${t("connect.howto")}</h2>
    <div class="grid two">
      <div class="card"><p>${t("connect.pc")}</p></div>
      <div class="card"><p>${t("connect.space")}</p></div>
    </div>`;
  $("#c-go").onclick = async () => {
    const base = $("#c-url").value.trim().replace(/\/+$/, "");
    const token = $("#c-token").value.trim();
    if (!base) return;
    try {
      const h = await fetch(base + "/health").then((r) => r.json());
      if (h.status !== "ok") throw new Error();
    } catch { toast(t("connect.fail") + ": " + base, "err"); return; }
    const old = { ...cfg };
    cfg.base = base; cfg.token = token;
    try { await api("/projects"); } catch (e) { Object.assign(cfg, old); toast(e.message, "err"); return; }
    store.set("base", base); store.set("token", token);
    connectWs();
    location.hash = "#/projects";
  };
}

// ------------------------------------------------------------- projects --
async function viewProjects() {
  view.innerHTML = `<div class="head"><h1>${t("projects.title")}</h1>
    <a class="btn primary small" href="#/new">${t("projects.new")}</a></div><div id="plist" class="grid two"></div>`;
  const list = await api("/projects");
  const el = $("#plist");
  if (!list.length) { el.outerHTML = `<div class="empty">${t("projects.empty")}</div>`; return; }
  el.innerHTML = list.map((p) => `
    <a class="card link" href="#/p/${esc(p.project_id)}">
      <div class="spread"><h3>${esc(p.title)}</h3>${p.output_path ? `<span class="badge ok">MP4</span>` : ""}</div>
      <div class="row muted" style="margin-top:8px;font-size:13px">
        <span>${p.scenes} ${t("scenes")}</span><span class="faint">·</span><span class="mono">${p.duration_ms ? dur(p.duration_ms) : "--:--"}</span>
      </div>
    </a>`).join("");
}

// ------------------------------------------------------------ new project --
async function viewNew() {
  let voices = {};
  try { voices = await api("/voices"); } catch { /* offline list stays empty */ }
  const langs = Object.keys(voices).length ? Object.keys(voices) : ["uz"];
  view.innerHTML = `
    <h1>${t("new.title")}</h1>
    <form id="np" class="stack" style="margin-top:14px" autocomplete="off">
      <div class="card stack">
        <label class="field"><span>${t("new.name")}</span><input type="text" name="title" required maxlength="120"></label>
        <label class="field"><span>${t("new.world")}</span><input type="text" name="world" required placeholder="${esc(t("new.world.ph"))}"></label>
        <div class="grid two">
          <label class="field"><span>${t("new.lang")}</span><select name="language">${langs.map((l) => `<option value="${l}">${l.toUpperCase()}</option>`).join("")}</select></label>
          <label class="field"><span>${t("new.voice")}</span><select name="voice"></select></label>
        </div>
        <div class="grid two">
          <label class="field"><span>${t("new.hook")}: <b class="mono" id="hookv">8</b></span><input type="range" name="hook" min="0" max="15" value="8"></label>
          <div class="field"><span class="muted" style="font-size:12px;display:block;margin-bottom:6px">${t("new.format")}</span>
            <div class="seg" id="fmt"><button type="button" data-v="wide" class="on">${t("new.wide")}</button><button type="button" data-v="shorts">${t("new.shorts")}</button></div></div>
        </div>
      </div>
      <div class="card stack">
        <div class="spread"><h3>${t("new.chars")}</h3><button type="button" class="btn small ghost" id="addc">+ ${t("new.char.add")}</button></div>
        <div id="chars" class="stack"></div>
      </div>
      <div class="card stack">
        <label class="field"><span>${t("new.script")}</span><textarea class="script" name="script" required placeholder="# Ulug'tog', 1391&#10;1391-yil, Dashti Qipchoq cho'llari. Qo'shin uch oydirki yo'lda."></textarea></label>
        <div class="hint">${t("new.script.hint")}</div>
      </div>
      <button class="btn primary block" type="submit">${t("new.create")}</button>
    </form>`;
  const form = $("#np");
  const fillVoices = () => {
    const v = voices[form.language.value] || [];
    form.voice.innerHTML = v.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("") || `<option value="uz-UZ-SardorNeural">Sardor</option>`;
  };
  form.language.onchange = fillVoices; fillVoices();
  form.hook.oninput = () => ($("#hookv").textContent = form.hook.value);
  let fmt = "wide";
  $$("#fmt button").forEach((b) => (b.onclick = () => { fmt = b.dataset.v; $$("#fmt button").forEach((x) => x.classList.toggle("on", x === b)); }));
  const addChar = () => {
    const row = document.createElement("div");
    row.className = "grid two";
    row.innerHTML = `<input type="text" placeholder="${esc(t("new.char.name"))}" data-k="name">
      <input type="text" placeholder="${esc(t("new.char.dna"))}" data-k="dna">`;
    $("#chars").appendChild(row);
  };
  $("#addc").onclick = addChar; addChar();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form); btn.disabled = true;
    const characters = $$("#chars .grid").map((r) => ({ name: $("[data-k=name]", r).value.trim(), dna: $("[data-k=dna]", r).value.trim() }))
      .filter((c) => c.name && c.dna);
    const body = {
      title: form.title.value.trim(), world: form.world.value.trim(), script: form.script.value,
      language: form.language.value, voice: form.voice.value, hook_video_count: +form.hook.value, characters,
      render: fmt === "shorts" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
    };
    try {
      const p = await api("/projects", { method: "POST", json: body });
      await startJob(`/projects/${p.project_id}/prompts`);
      location.hash = "#/p/" + p.project_id;
    } catch (err) { toast(err.message, "err"); btn.disabled = false; }
  };
}

// --------------------------------------------------------------- project --
async function viewProject(pid) {
  const [p, media, jobList, ms] = await Promise.all([
    api("/projects/" + pid), api(`/projects/${pid}/media`), api("/jobs?project_id=" + pid), api("/settings/media").catch(() => ({})),
  ]);
  const scenes = p.scenes;
  const tall = p.render.height > p.render.width;
  const total = scenes.length ? scenes[scenes.length - 1].end_ms : 0;
  const prompted = scenes.filter((s) => s.image_prompt).length;
  const has = (s) => { const m = media.scenes[s.scene_id] || {}; return s.render_mode === "ANIMATED_VIDEO" ? !!m.video : !!(m.image || m.video); };
  const ready = scenes.filter(has).length;
  const preview = media.exports.find((x) => x.endsWith("_preview.mp4"));
  const final = media.exports.find((x) => x === `export/${pid}.mp4`);
  const master = p.render.fps >= 60;
  const active = jobList.find((j) => j.status === "running" || j.status === "queued");

  const step = (n, key, done, status, actions) => `
    <div class="step ${done ? "done" : ""}"><div class="spread"><span class="n">0${n}</span>${done ? `<span class="badge ok">${t("st.ready")}</span>` : ""}</div>
      <h3>${t(key)}</h3><div class="muted" style="font-size:13px">${status}</div><div class="actions">${actions}</div></div>`;

  view.innerHTML = `
    <div class="head"><div><a href="#/projects" class="faint" style="text-decoration:none;font-size:13px">← ${t("nav.projects")}</a>
      <h1>${esc(p.title)}</h1>
      <div class="row wrap muted" style="font-size:13px"><span>${scenes.length} ${t("scenes")}</span><span class="faint">·</span>
        <span>${p.chapters.length} ${t("chapters")}</span><span class="faint">·</span><span class="mono">${total ? tc(total) : "--:--"}</span>
        <span class="faint">·</span><span>${tall ? "9:16" : "16:9"}</span></div></div>
      <button class="btn small ghost" id="del" aria-label="${t("act.delete")}"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></button></div>

    <div class="card stack" id="jobcard" ${active ? "" : "hidden"}>
      <div class="spread"><b id="jobname"></b><span class="mono" id="jobpct"></span></div>
      <div class="progress"><i id="jobbar"></i></div><div class="jobline" id="jobmsg"></div></div>

    <h2>Pipeline</h2>
    <div class="steps">
      ${step(1, "step.prompts", prompted === scenes.length, `${prompted} / ${scenes.length}`,
        `<button class="btn small ${prompted ? "" : "primary"}" data-job="prompts">${prompted ? t("act.regenerate") : t("act.generate")}</button>`)}
      ${step(2, "step.voice", total > 0, total ? `<span class="mono">${tc(total)}</span>` : t("st.notyet"),
        `<button class="btn small ${total ? "" : "primary"}" data-job="tts">${t("act.tts")}</button>
         <label class="btn small">${t("act.upload_voice")}<input type="file" accept="audio/*" id="voicefile" hidden></label>`)}
      ${step(3, "step.media", ready === scenes.length, `${ready} / ${scenes.length}<div class="faint" style="font-size:12px">${esc(t("b." + (ms.image_backend || "manual")))} · ${esc(t("b." + (ms.video_backend || "parallax")))}</div>`,
        `<button class="btn small ${ready === scenes.length ? "" : "primary"}" data-job="media">${t("act.media")}</button>`)}
      ${step(4, "step.preview", !!preview, preview ? "540p" : t("st.notyet"),
        `<button class="btn small" data-job="preview" ${total ? "" : "disabled"}>${t("act.preview")}</button>
         ${preview ? `<a class="btn small" target="_blank" rel="noopener" href="${fileUrl(pid, preview, Date.now())}">▶</a>` : ""}`)}
      ${step(5, "step.final", !!final, `<div class="seg" id="qual"><button data-q="fast" class="${master ? "" : "on"}">${t("q.fast")}</button><button data-q="master" class="${master ? "on" : ""}">${t("q.master")}</button></div>`,
        `<button class="btn small ${final ? "" : "primary"}" data-job="render" ${total && ready === scenes.length ? "" : "disabled"}>${t("act.render")}</button>
         ${final ? `<a class="btn small primary" target="_blank" rel="noopener" href="${fileUrl(pid, final, Date.now())}" download>${t("act.download")}</a>` : ""}`)}
    </div>

    ${final ? `<h2>${t("yt")}</h2><div class="card stack"><pre class="chapters" id="ytc">…</pre><button class="btn small" id="ytcopy">${t("act.copy")}</button></div>` : ""}

    <h2>${t("board")}</h2>
    <div class="timeline" aria-hidden="true">${scenes.map((s) => `<i class="${s.render_mode === "ANIMATED_VIDEO" ? "anim" : ""} ${has(s) ? "has" : ""}" style="flex:${Math.max(1, s.end_ms - s.start_ms || 1)}"></i>`).join("")}</div>
    <div class="board">${scenes.map((s) => sceneCard(pid, s, media.scenes[s.scene_id] || {}, tall)).join("")}</div>`;

  // --- wiring
  $("#del").onclick = async () => {
    if (!confirm(t("confirm.delete"))) return;
    await api("/projects/" + pid, { method: "DELETE" }); location.hash = "#/projects";
  };
  const run = async (path, json) => { try { await startJob(path, json); } catch (e) { toast(e.message, "err"); } };
  $$("[data-job]").forEach((b) => (b.onclick = () => {
    const k = b.dataset.job;
    if (k === "prompts") run(`/projects/${pid}/prompts`);
    if (k === "tts") run(`/projects/${pid}/voice/tts`);
    if (k === "media") run(`/projects/${pid}/media/generate`, { images: true, videos: true });
    if (k === "preview") run(`/projects/${pid}/render`, { preview: true });
    if (k === "render") run(`/projects/${pid}/render`, { preview: false });
  }));
  $("#voicefile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const form = new FormData(); form.append("audio", f); form.append("model_size", "small");
    try { const r = await api(`/projects/${pid}/voice/align`, { method: "POST", form }); emitJob({ id: r.job_id, kind: r.kind, status: "queued", progress: 0 }); pollJob(r.job_id); }
    catch (err) { toast(err.message, "err"); }
  };
  $$("#qual button").forEach((b) => (b.onclick = async () => {
    const q = b.dataset.q === "master" ? { fps: 60, supersample: 2 } : { fps: 30, supersample: 1 };
    try { await api("/projects/" + pid, { method: "PATCH", json: { render: q } }); $$("#qual button").forEach((x) => x.classList.toggle("on", x === b)); }
    catch (e) { toast(e.message, "err"); }
  }));
  if (final) {
    api(`/projects/${pid}/youtube-chapters`).then((r) => { $("#ytc").textContent = r.text; }).catch(() => {});
    $("#ytcopy").onclick = () => navigator.clipboard.writeText($("#ytc").textContent).then(() => toast(t("copied"), "ok"));
  }
  $$(".scene").forEach((el) => (el.onclick = () => sceneSheet(pid, scenes.find((s) => s.scene_id === +el.dataset.id))));

  // --- live progress
  const showJob = (j) => {
    if (j.project_id && j.project_id !== pid) return;
    const card = $("#jobcard"); if (!card) return;
    card.hidden = false;
    $("#jobname").textContent = t("job." + j.kind);
    $("#jobpct").textContent = Math.round((j.progress || 0) * 100) + "%";
    $("#jobbar").style.width = Math.round((j.progress || 0) * 100) + "%";
    $("#jobmsg").textContent = j.status === "error" ? (j.error || t("job.error")) : (j.message || "");
    if (j.status === "done" || j.status === "error") {
      if (j.status === "error") toast(t("job.error") + ": " + (j.error || ""), "err");
      else toast(t("job." + j.kind) + " · " + t("job.done"), "ok");
      setTimeout(() => { if (location.hash === "#/p/" + pid) route(); }, 600);
    }
  };
  jobListeners.add(showJob);
  if (active) { showJob({ ...active, project_id: pid }); pollJob(active.id); }
}

function sceneCard(pid, s, m, tall) {
  const src = m.image ? fileUrl(pid, m.image, m.mtime) : null;
  const anim = s.render_mode === "ANIMATED_VIDEO";
  return `<article class="scene" data-id="${s.scene_id}">
    <div class="thumb ${tall ? "tall" : ""}">${src ? `<img loading="lazy" alt="" src="${src}">` : `<span>${t("st.missing")}</span>`}
      <span class="sid">${String(s.scene_id).padStart(3, "0")}</span>
      <span class="tc">${tc(s.start_ms)} · ${((s.end_ms - s.start_ms) / 1000).toFixed(2)}s</span></div>
    <div class="body">
      <div class="row wrap">${anim ? `<span class="badge anim">${t("scene.anim")}${m.video ? " ✓" : ""}</span>` : ""}
        ${s.shot_scale ? `<span class="badge">${esc(s.shot_scale.split(" ")[0] + " " + (s.shot_scale.split(" ")[1] || ""))}</span>` : ""}
        <span class="badge">${esc(s.camera_motion.replace(/_/g, " "))}</span>
        ${s.transition_in !== "hard_cut" ? `<span class="badge">${esc(s.transition_in.replace(/_/g, " "))}</span>` : ""}</div>
      <div class="narr">${esc(s.narration)}</div>
    </div></article>`;
}

const MOTIONS = ["slow_push_in", "slow_pull_out", "slow_pan_left", "slow_pan_right", "diagonal_drift", "slow_tilt_up", "slow_tilt_down", "static_breath"];
const TRANSITIONS = ["hard_cut", "dissolve", "dip_to_black"];

function sceneSheet(pid, s) {
  const opt = (list, cur) => list.map((v) => `<option value="${v}" ${v === cur ? "selected" : ""}>${v.replace(/_/g, " ")}</option>`).join("");
  openSheet(`
    <div class="spread"><h3 class="mono">${String(s.scene_id).padStart(3, "0")} · ${tc(s.start_ms)}</h3>
      <button class="btn small ghost" data-close>✕</button></div>
    <div class="stack" style="margin-top:12px">
      <label class="field"><span>${t("scene.narration")}</span><textarea name="narration" style="min-height:90px">${esc(s.narration)}</textarea></label>
      <label class="field"><span>${t("scene.prompt")}</span><textarea name="image_prompt">${esc(s.image_prompt)}</textarea></label>
      <div class="grid two">
        <label class="field"><span>${t("scene.motion")}</span><select name="camera_motion">${opt(MOTIONS, s.camera_motion)}</select></label>
        <label class="field"><span>${t("scene.transition")}</span><select name="transition_in">${opt(TRANSITIONS, s.transition_in)}</select></label>
      </div>
      <label class="field"><span>${t("scene.mode")}</span><select name="render_mode">
        <option value="CINEMATIC_IMAGE" ${s.render_mode === "CINEMATIC_IMAGE" ? "selected" : ""}>${t("scene.still")}</option>
        <option value="ANIMATED_VIDEO" ${s.render_mode === "ANIMATED_VIDEO" ? "selected" : ""}>${t("scene.anim")}</option></select></label>
      <div class="row wrap">
        <button class="btn primary" data-save>${t("act.save")}</button>
        <label class="btn">${t("act.upload_media")}<input type="file" accept="image/*,video/*" hidden data-upload></label>
        <button class="btn" data-reprompt>${t("act.new_prompt")}</button>
        <button class="btn" data-remedia>${t("act.new_media")}</button>
      </div>
    </div>`, (root) => {
    $("[data-close]", root).onclick = closeSheet;
    $("[data-save]", root).onclick = async () => {
      const json = {};
      ["narration", "image_prompt", "camera_motion", "transition_in", "render_mode"].forEach((k) => (json[k] = $(`[name=${k}]`, root).value));
      try { await api(`/projects/${pid}/scenes/${s.scene_id}`, { method: "PATCH", json }); toast(t("set.saved"), "ok"); closeSheet(); route(); }
      catch (e) { toast(e.message, "err"); }
    };
    $("[data-upload]", root).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const form = new FormData(); form.append("file", f);
      try { await api(`/projects/${pid}/scenes/${s.scene_id}/media`, { method: "POST", form }); toast(t("set.saved"), "ok"); closeSheet(); route(); }
      catch (err) { toast(err.message, "err"); }
    };
    $("[data-reprompt]", root).onclick = async () => { closeSheet(); try { await startJob(`/projects/${pid}/prompts`, { scene_ids: [s.scene_id] }); } catch (e) { toast(e.message, "err"); } };
    $("[data-remedia]", root).onclick = async () => { closeSheet(); try { await startJob(`/projects/${pid}/media/generate`, { scene_ids: [s.scene_id], overwrite: true }); } catch (e) { toast(e.message, "err"); } };
  });
}

// -------------------------------------------------------------- settings --
async function viewSettings() {
  const [llm, ms, keys, enc, health] = await Promise.all([
    api("/settings/llm"), api("/settings/media"), api("/keys?service=gemini"),
    api("/encoders").catch(() => ({ available: [] })), fetch(cfg.base + "/health").then((r) => r.json()).catch(() => ({})),
  ]);
  const sel = (name, opts, cur) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  view.innerHTML = `
    <h1>${t("set.title")}</h1>
    <h2>${t("set.lang")}</h2>
    <div class="seg" id="lang"><button data-l="uz" class="${cfg.lang === "uz" ? "on" : ""}">O'zbekcha</button><button data-l="en" class="${cfg.lang === "en" ? "on" : ""}">English</button></div>

    <h2>${t("set.media")}</h2>
    <form class="card stack" id="mform">
      <div class="grid two">
        <label class="field"><span>${t("set.img")}</span>${sel("image_backend", [["manual", t("b.manual")], ["pollinations", t("b.pollinations")], ["comfyui", t("b.comfyui")]], ms.image_backend)}</label>
        <label class="field"><span>${t("set.vid")}</span>${sel("video_backend", [["parallax", t("b.parallax")], ["hf_space", t("b.hf_space")], ["comfyui", t("b.comfyui")]], ms.video_backend)}</label>
      </div>
      <label class="field"><span>${t("set.hftoken")}</span><input type="password" name="hf_token" value="${esc(ms.hf_token || "")}" placeholder="hf_…"><div class="hint">${t("set.hftoken.hint")}</div></label>
      <div class="grid two">
        <label class="field"><span>${t("set.steps")}: <b class="mono" id="stv">${ms.hf_steps}</b></span><input type="range" name="hf_steps" min="4" max="8" value="${ms.hf_steps}"></label>
        <label class="field"><span>${t("set.comfy")}</span><input type="url" name="comfyui_url" value="${esc(ms.comfyui_url || "")}"></label>
      </div>
      <label class="row"><input type="checkbox" name="depth_model" ${ms.depth_model ? "checked" : ""}> <span>${t("set.depth")}</span></label>
      <button class="btn primary" type="submit">${t("act.save")}</button>
    </form>

    <h2>${t("set.llm")}</h2>
    <form class="card stack" id="lform">
      <label class="field"><span>${t("set.provider")}</span>${sel("provider", [["", t("set.none")], ["gemini", "Google Gemini (free key)"], ["openai_compatible", "Ollama / Groq / OpenRouter"], ["anthropic", "Anthropic Claude"]], llm.provider || "")}</label>
      <div class="grid two">
        <label class="field"><span>${t("set.model")}</span><input type="text" name="model" value="${esc(llm.model || "")}" placeholder="gemini-2.5-flash"></label>
        <label class="field" data-show="openai_compatible"><span>${t("set.baseurl")}</span><input type="url" name="base_url" value="${esc(llm.base_url || "")}" placeholder="http://127.0.0.1:11434/v1"></label>
      </div>
      <label class="field"><span>${t("set.key")}</span><input type="password" name="api_key" placeholder="${llm.provider === "gemini" ? (keys.length ? keys.map((k) => k.masked).join(", ") : "AIza…") : (llm.api_key || "")}"></label>
      <button class="btn primary" type="submit">${t("act.save")}</button>
    </form>

    <h2>${t("set.conn")}</h2>
    <div class="card stack">
      <dl class="kv"><dt>URL</dt><dd>${esc(cfg.base)}</dd><dt>${t("set.engine")}</dt><dd>${esc(health.version || "?")}</dd>
        <dt>Encoder</dt><dd>${esc((enc.available || []).join(", "))}</dd></dl>
      <button class="btn" id="disc">${t("set.disconnect")}</button>
    </div>`;

  $$("#lang button").forEach((b) => (b.onclick = () => { cfg.lang = b.dataset.l; store.set("lang", cfg.lang); document.documentElement.lang = cfg.lang; route(); }));
  const mf = $("#mform");
  mf.hf_steps.oninput = () => ($("#stv").textContent = mf.hf_steps.value);
  mf.onsubmit = async (e) => {
    e.preventDefault();
    const body = { ...ms, image_backend: mf.image_backend.value, video_backend: mf.video_backend.value,
      hf_token: mf.hf_token.value.trim() || null, hf_steps: +mf.hf_steps.value, comfyui_url: mf.comfyui_url.value.trim() || ms.comfyui_url,
      depth_model: mf.depth_model.checked };
    try { await api("/settings/media", { method: "PUT", json: body }); toast(t("set.saved"), "ok"); } catch (err) { toast(err.message, "err"); }
  };
  const lf = $("#lform");
  const toggle = () => $$("[data-show]", lf).forEach((el) => (el.hidden = el.dataset.show !== lf.provider.value));
  lf.provider.onchange = toggle; toggle();
  lf.onsubmit = async (e) => {
    e.preventDefault();
    const provider = lf.provider.value, key = lf.api_key.value.trim();
    try {
      if (provider === "gemini" && key) await api("/keys", { method: "POST", json: { service: "gemini", secret: key } });
      const body = { provider, model: lf.model.value.trim() || null, base_url: lf.base_url.value.trim() || null };
      if (provider !== "gemini" && key) body.api_key = key;
      await api("/settings/llm", { method: "PUT", json: body });
      toast(t("set.saved"), "ok"); route();
    } catch (err) { toast(err.message, "err"); }
  };
  $("#disc").onclick = () => { store.del("token"); cfg.token = ""; try { ws && ws.close(); } catch { /* ignore */ } location.hash = "#/connect"; };
}

// ------------------------------------------------------------------ boot --
document.documentElement.lang = cfg.lang;
if (cfg.base) fetch(cfg.base + "/health").then(() => setEngine(true)).catch(() => setEngine(false));
connectWs();
route();
if ("serviceWorker" in navigator && servedByEngine) navigator.serviceWorker.register("sw.js").catch(() => {});
