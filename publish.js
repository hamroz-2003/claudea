// Inson tasdig'idan keyin videoni ommaga chiqarish:
//   node publish.js <videoId>                       darhol public
//   node publish.js <videoId> --at 2026-11-20T13:30:00Z   rejalashtirish
import 'dotenv/config';
import { publish } from './lib/youtube.js';
import { notify } from './lib/notify.js';

const [videoId, ...rest] = process.argv.slice(2);
const atIdx = rest.indexOf('--at');
const at = atIdx >= 0 ? rest[atIdx + 1] : undefined;

if (!videoId) { console.error('Foydalanish: node publish.js <videoId> [--at ISO_VAQT]'); process.exit(1); }
if (at && Number.isNaN(Date.parse(at))) { console.error(`Noto'g'ri vaqt: ${at}`); process.exit(1); }

publish(videoId, { at })
  .then(async (s) => {
    const msg = at ? `Rejalashtirildi: ${s.publishAt}` : `Ommaga chiqdi: https://youtu.be/${videoId}`;
    console.log(msg);
    await notify(`Ryzon: ${msg}`);
  })
  .catch((e) => {
    const locked = /private|locked|unverified|forbidden/i.test(e.message);
    console.error(e.message);
    if (locked) console.error("\nAPI loyihangiz audit qilinmagan bo'lsa, YouTube API orqali yuklangan videolar private holatida qulflanadi.\nYechim: YouTube API Services audit formasini topshiring yoki YOUTUBE_PUBLISH_MODE=manual dan foydalaning.");
    process.exit(1);
  });
