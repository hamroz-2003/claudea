// Ryzon Uz avtopiloti: kalendardan navbatdagi mavzu -> ssenariy -> render -> nashr -> Telegram.
//   node autopilot_channel.js                 navbatdagi mavzu (YOUTUBE_PUBLISH_MODE bo'yicha)
//   node autopilot_channel.js --dry-run       yuklamasdan (ssenariy + render)
//   node autopilot_channel.js --topic w1-a    aniq mavzu
//   node autopilot_channel.js --no-render     faqat ssenariy (inson tekshiruvi uchun)
// Har bir bosqich holati content/calendar.json da saqlanadi — xato bo'lsa qayta ishga tushirish shu joydan davom etadi.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { generateEpisodeJSON, analyticsSummaryText } from './lib/claude.js';
import { loadEpisode, validateEpisode, buildDescription, printReport, ROOT } from './lib/episode.js';
import { renderEpisode } from './lib/render.js';
import { uploadVideo, setThumbnail, addToPlaylist, playlistForPillar } from './lib/youtube.js';
import { notify } from './lib/notify.js';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const P = {
  calendar: path.join(ROOT, 'content', 'calendar.json'),
  history: path.join(ROOT, 'data', 'history.json'),
  lock: path.join(ROOT, 'data', 'autopilot.lock'),
  runs: path.join(ROOT, 'data', 'runs'),
};
const readJSON = (p, d) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : d);
const writeJSON = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };
const MODE = flag('--dry-run') ? 'dry' : (process.env.YOUTUBE_PUBLISH_MODE || 'manual');

function nextPublishAt(item) {
  if (item.publishAt && new Date(item.publishAt) > new Date(Date.now() + 3600e3)) return new Date(item.publishAt).toISOString();
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(Number(process.env.YOUTUBE_PUBLISH_HOUR_UTC || 13), 30, 0, 0);
  return d.toISOString();
}

function shortMeta(ep, description) {
  const base = ep.title.split('|')[0].trim();
  return {
    title: `${base} #shorts`.slice(0, 100),
    description: `${description.split('\n\n')[0]}\n\nFull film on the channel: Ryzon.`,
    tags: ep.tags.slice(0, 12),
  };
}

function writeUploadPackage(dir, ep, description, out) {
  const s = shortMeta(ep, description);
  const txt = [
    "=== QO'LDA YUKLASH PAKETI (YouTube Studio > Create > Upload) ===",
    `VIDEO: ${path.basename(out.long)}`,
    `MUQOVA: ${path.basename(out.thumb)}`,
    '', 'SARLAVHA:', ep.title,
    '', 'TAVSIF:', description,
    '', 'TEGLAR (vergul bilan):', ep.tags.join(', '),
    '', 'SOZLAMALAR: Made for kids = No · Kategoriya = Film & Animation · Altered content = No (stilizatsiyalangan animatsiya)',
    'End screen: oxirgi 12 soniyada "eng mos video" + obuna tugmasi. Pleylist: ' + ep.pillar,
    '', '=== SHORTS ===', `VIDEO: ${out.short ? path.basename(out.short) : '-'}`, `SARLAVHA: ${s.title}`, `TAVSIF: ${s.description}`,
    "Shorts'ni asosiy videoga bog'lang: Studio > Shorts > Related video.",
  ].join('\n');
  const f = path.join(dir, 'YOUTUBE_UPLOAD.txt');
  fs.writeFileSync(f, txt);
  return f;
}

async function main() {
  if (fs.existsSync(P.lock) && Date.now() - fs.statSync(P.lock).mtimeMs < 6 * 3600e3) {
    throw new Error(`Avtopilot allaqachon ishlayapti (${P.lock}). Agar bu xato bo'lsa — faylni o'chiring.`);
  }
  fs.mkdirSync(path.dirname(P.lock), { recursive: true });
  fs.writeFileSync(P.lock, String(process.pid));
  const log = { startedAt: new Date().toISOString(), mode: MODE, steps: [] };
  const step = (name, data = {}) => { log.steps.push({ name, at: new Date().toISOString(), ...data }); console.log(`\n▶ ${name}`); };

  try {
    const cal = readJSON(P.calendar, { queue: [] });
    const history = readJSON(P.history, []);
    const wanted = opt('--topic');
    const item = wanted ? cal.queue.find((q) => q.id === wanted) : cal.queue.find((q) => ['planned', 'generated', 'rendered'].includes(q.status));
    if (!item) { await notify('Ryzon avtopilot: kalendarda navbatdagi mavzu yo\'q. /goyalar buyrug\'i bilan yangi mavzular qo\'shing.'); return; }
    const save = () => writeJSON(P.calendar, cal);
    step('Mavzu tanlandi', { id: item.id, title: item.working_title });

    // 1) SSENARIY
    let ep;
    if (item.status === 'planned' || !item.episodeDir || !fs.existsSync(path.join(ROOT, item.episodeDir, 'episode.json'))) {
      step('Ssenariy (Claude headless)');
      const res = generateEpisodeJSON({ topic: item, history, analyticsSummary: analyticsSummaryText() });
      ep = res.episode;
      const dir = path.join('episodes', `${new Date().toISOString().slice(0, 10)}-${ep.slug}`);
      writeJSON(path.join(ROOT, dir, 'episode.json'), ep);
      Object.assign(item, { status: 'generated', episodeDir: dir.replace(/\\/g, '/') });
      save();
      printReport(dir, res.report);
    } else {
      ep = loadEpisode(path.join(ROOT, item.episodeDir)).episode;
      const r = validateEpisode(ep, { history: history.filter((h) => h.slug !== ep.slug) });
      printReport(item.episodeDir, r);
      if (!r.ok) throw new Error(`${item.episodeDir} validatsiyadan o'tmadi`);
    }
    if (flag('--no-render')) { await notify(`Ryzon: ssenariy tayyor — "${ep.title}"\n${item.episodeDir}/episode.json\nTekshirib, keyin: npm run autopilot -- --topic ${item.id}`); return; }

    // 2) RENDER
    const outDir = path.join(ROOT, 'output', ep.slug);
    let out = item.render;
    if (item.status !== 'rendered' || !out || !fs.existsSync(out.long)) {
      step('Render (Remotion)');
      out = renderEpisode(ep, outDir);
      Object.assign(item, { status: 'rendered', render: out });
      save();
    }
    const description = buildDescription(ep);

    // 3) NASHR
    if (MODE === 'dry') {
      writeUploadPackage(outDir, ep, description, out);
      step('Dry-run: yuklash o\'tkazib yuborildi');
      await notify(`Ryzon (dry-run): "${ep.title}" render qilindi.\n${out.long}`);
      return;
    }
    if (MODE === 'manual') {
      const pkg = writeUploadPackage(outDir, ep, description, out);
      Object.assign(item, { status: 'ready_manual' });
      save();
      step('Qo\'lda yuklash paketi tayyor', { pkg });
      await notify(`Ryzon: yangi film tayyor ✅\n"${ep.title}"\n\nPapka: ${outDir}\nYOUTUBE_UPLOAD.txt dagi ma'lumotlar bilan Studio'ga yuklang.\nTavsiya etilgan vaqt: ${nextPublishAt(item)} (UTC)`);
    } else {
      const publishAt = MODE === 'schedule' ? nextPublishAt(item) : undefined;
      step('YouTube\'ga yuklash', { publishAt });
      const v = await uploadVideo(out.long, { title: ep.title, description, tags: ep.tags }, { publishAt });
      await setThumbnail(v.id, out.thumb);
      await addToPlaylist(v.id, playlistForPillar(ep.pillar));
      let shortId;
      if (out.short) {
        const s = await uploadVideo(out.short, shortMeta(ep, description), { publishAt: publishAt ? new Date(new Date(publishAt).getTime() + 24 * 3600e3).toISOString() : undefined });
        shortId = s.id;
      }
      Object.assign(item, { status: publishAt ? 'scheduled' : 'uploaded_private', videoId: v.id, shortId, publishAt: publishAt || item.publishAt });
      save();
      const studio = `https://studio.youtube.com/video/${v.id}/edit`;
      await notify(publishAt
        ? `Ryzon: "${ep.title}" rejalashtirildi → ${publishAt}\n${studio}`
        : `Ryzon: "${ep.title}" PRIVATE yuklandi. Ko'rib chiqing:\n${studio}\n\nOmmaga chiqarish: npm run publish -- ${v.id}\nYoki vaqt bilan: npm run publish -- ${v.id} --at ${nextPublishAt(item)}`);
    }
    history.push({ slug: ep.slug, title: ep.title, pillar: ep.pillar, series: ep.series, videoId: item.videoId || null, date: new Date().toISOString().slice(0, 10), views: null });
    writeJSON(P.history, history);
  } catch (err) {
    log.error = err.message;
    console.error(err);
    await notify(`Ryzon avtopilot XATO ❌\n${err.message.slice(0, 1500)}`);
    process.exitCode = 1;
  } finally {
    writeJSON(path.join(P.runs, `${log.startedAt.replace(/[:.]/g, '-')}.json`), log);
    fs.rmSync(P.lock, { force: true });
  }
}

main();
