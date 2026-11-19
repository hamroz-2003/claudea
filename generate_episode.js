// Mavzu (brief) -> Claude -> episode.json -> render.
//   node generate_episode.js --topic content/topics/example.json      (yangi epizod yozish + render)
//   node generate_episode.js --topic ... --no-render                 (faqat ssenariy)
//   node generate_episode.js --render-only episodes/sample            (mavjud JSONni render qilish)
//   node generate_episode.js --render-only episodes/sample --preview  (birinchi 10 s, tez tekshiruv)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateEpisodeJSON, analyticsSummaryText } from './lib/claude.js';
import { loadEpisode, validateEpisode, printReport, ROOT } from './lib/episode.js';
import { renderEpisode } from './lib/render.js';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const readJSON = (p, d) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : d);
const today = () => new Date().toISOString().slice(0, 10);

export async function generate(topic, { render = true } = {}) {
  const history = readJSON(path.join(ROOT, 'data', 'history.json'), []);
  const { episode, report } = generateEpisodeJSON({ topic, history, analyticsSummary: analyticsSummaryText() });
  const dir = path.join(ROOT, 'episodes', `${today()}-${episode.slug}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'episode.json'), `${JSON.stringify(episode, null, 2)}\n`);
  printReport(path.relative(ROOT, dir), report);
  let out;
  if (render) out = renderEpisode(episode, path.join(ROOT, 'output', episode.slug));
  return { dir, episode, out };
}

async function main() {
  const renderOnly = opt('--render-only');
  if (renderOnly) {
    const { episode, file } = loadEpisode(renderOnly);
    const r = validateEpisode(episode);
    printReport(file, r);
    if (!r.ok) process.exit(1);
    const preview = flag('--preview');
    const out = renderEpisode(episode, path.join(ROOT, 'output', episode.slug + (preview ? '-preview' : '')), {
      frames: preview ? '0-299' : undefined,
      short: !flag('--no-short'),
    });
    console.log('\nTayyor:', out);
    return;
  }
  const topicPath = opt('--topic');
  if (!topicPath) {
    console.error('Foydalanish: node generate_episode.js --topic <brief.json> | --render-only <episode papkasi>');
    process.exit(1);
  }
  const { dir, out } = await generate(readJSON(topicPath), { render: !flag('--no-render') });
  console.log('\nEpizod:', dir, out ? `\nRender: ${JSON.stringify(out)}` : '');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
