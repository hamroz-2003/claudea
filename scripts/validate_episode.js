// Foydalanish: npm run validate -- episodes/<papka>   (bir nechta yo'l berish mumkin)
import fs from 'node:fs';
import path from 'node:path';
import { loadEpisode, validateEpisode, printReport, buildDescription } from '../lib/episode.js';

const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const showDesc = process.argv.includes('--description');
if (!targets.length) targets.push('episodes/sample');
const historyFile = path.join('data', 'history.json');
const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf-8')) : [];

let failed = 0;
for (const t of targets) {
  const { episode, file } = loadEpisode(t);
  const r = validateEpisode(episode, { history: history.filter((h) => h.slug !== episode.slug) });
  printReport(file, r);
  if (showDesc) console.log(`\n--- YouTube tavsifi ---\n${buildDescription(episode)}\n`);
  if (!r.ok) failed++;
}
process.exit(failed ? 1 : 0);
