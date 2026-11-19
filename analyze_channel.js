// Kanal tahlili (YouTube Analytics API): monetizatsiya progressi, eng yaxshi videolar,
// trafik manbalari. Natija: data/analytics/<sana>.json va latest-summary.md (Claude ssenariy yozishda o'qiydi).
//   node analyze_channel.js
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { yt, ytAnalytics } from './lib/youtube.js';
import { ROOT } from './lib/episode.js';

const day = (offset) => { const d = new Date(Date.now() - offset * 864e5); return d.toISOString().slice(0, 10); };
const OUT = path.join(ROOT, 'data', 'analytics');

async function query(params) {
  const res = await ytAnalytics().reports.query({ ids: 'channel==MINE', ...params });
  const cols = res.data.columnHeaders.map((c) => c.name);
  return (res.data.rows || []).map((r) => Object.fromEntries(r.map((v, i) => [cols[i], v])));
}

async function main() {
  const ch = (await yt().channels.list({ part: ['snippet', 'statistics'], mine: true })).data.items?.[0];
  if (!ch) throw new Error('Kanal topilmadi (Brand Account to\'g\'ri tanlanganmi?)');
  const subs = Number(ch.statistics.subscriberCount);

  const [year] = await query({ startDate: day(365), endDate: day(1), metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost', filters: 'creatorContentType==videoOnDemand' });
  const [shorts90] = await query({ startDate: day(90), endDate: day(1), metrics: 'views', filters: 'creatorContentType==shorts' }).catch(() => [{ views: 0 }]);
  const last28 = await query({ startDate: day(28), endDate: day(1), metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained', dimensions: 'video', sort: '-views', maxResults: 25 });
  const prev28 = await query({ startDate: day(56), endDate: day(29), metrics: 'views,estimatedMinutesWatched,subscribersGained' });
  const now28 = await query({ startDate: day(28), endDate: day(1), metrics: 'views,estimatedMinutesWatched,subscribersGained' });
  const traffic = await query({ startDate: day(28), endDate: day(1), metrics: 'views,averageViewDuration', dimensions: 'insightTrafficSourceType', sort: '-views' });

  const ids = last28.map((r) => r.video);
  const titles = {};
  for (let i = 0; i < ids.length; i += 50) {
    const r = await yt().videos.list({ part: ['snippet', 'contentDetails'], id: ids.slice(i, i + 50) });
    for (const v of r.data.items || []) titles[v.id] = { title: v.snippet.title, duration: v.contentDetails.duration };
  }

  const hours = Math.round((year?.estimatedMinutesWatched || 0) / 60);
  const ypp = {
    full: { subs: [subs, 1000], watchHours365: [hours, 4000], shortsViews90: [shorts90?.views || 0, 10_000_000] },
    expanded: { subs: [subs, 500], watchHours365: [hours, 3000], shortsViews90: [shorts90?.views || 0, 3_000_000], note: '+ oxirgi 90 kunda 3 ta ommaviy yuklama; mintaqaga bog\'liq' },
  };
  const data = { date: day(0), channel: { id: ch.id, title: ch.snippet.title, subs, views: Number(ch.statistics.viewCount), videos: Number(ch.statistics.videoCount) }, ypp, year, shorts90, now28: now28[0], prev28: prev28[0], traffic, topVideos: last28.map((r) => ({ ...r, ...titles[r.video] })) };

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${data.date}.json`), JSON.stringify(data, null, 2));

  const pct = (a, b) => `${Math.min(100, Math.round((a / b) * 100))}%`;
  const delta = (k) => (data.prev28?.[k] ? `${Math.round(((data.now28?.[k] || 0) / data.prev28[k] - 1) * 100)}%` : 'n/a');
  const subsPerK = (r) => (r.views ? (r.subscribersGained / r.views * 1000).toFixed(1) : '0');
  const md = [
    `# Ryzon kanal holati — ${data.date}`,
    `- Obunachilar: ${subs} / 1000 (${pct(subs, 1000)}) · Tomosha soatlari (365 kun, uzun video): ${hours} / 4000 (${pct(hours, 4000)})`,
    `- Kengaytirilgan YPP (500 obuna + 3000 soat): soatlar ${pct(hours, 3000)}`,
    `- Oxirgi 28 kun: ${data.now28?.views || 0} ko'rish (${delta('views')}), ${Math.round((data.now28?.estimatedMinutesWatched || 0) / 60)} soat (${delta('estimatedMinutesWatched')}), +${data.now28?.subscribersGained || 0} obunachi`,
    `- Trafik: ${traffic.slice(0, 5).map((t) => `${t.insightTrafficSourceType} ${t.views}`).join(' · ')}`,
    '', '## Eng yaxshi videolar (28 kun)', '| Video | Ko\'rish | O\'rt. % | Obuna/1000 |', '|---|---|---|---|',
    ...data.topVideos.slice(0, 10).map((v) => `| ${v.title || v.video} | ${v.views} | ${Number(v.averageViewPercentage || 0).toFixed(0)}% | ${subsPerK(v)} |`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'latest-summary.md'), `${md}\n`);

  // history.json dagi ko'rishlarni yangilash (ssenarist qaysi mavzu ishlaganini bilishi uchun)
  const hp = path.join(ROOT, 'data', 'history.json');
  if (fs.existsSync(hp)) {
    const h = JSON.parse(fs.readFileSync(hp, 'utf-8'));
    for (const e of h) { const v = data.topVideos.find((t) => t.video === e.videoId); if (v) e.views = v.views; }
    fs.writeFileSync(hp, `${JSON.stringify(h, null, 2)}\n`);
  }
  console.log(md);
}

main().catch((e) => {
  console.error('Tahlil xatosi:', e.message);
  if (/insufficient|scope|403/i.test(e.message)) console.error("Token'da analytics ruxsati yo'q. Qayta avtorizatsiya: npm run auth -- --save");
  process.exit(1);
});
