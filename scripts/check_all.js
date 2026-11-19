// To'liq tekshiruv: JS sintaksisi (node --check), TypeScript tiplari, namuna epizod validatsiyasi.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const files = ['autopilot_channel.js', 'generate_episode.js', 'publish.js', 'analyze_channel.js', 'youtube_auth.js',
  ...fs.readdirSync('lib').map((f) => path.join('lib', f)), ...fs.readdirSync('scripts').map((f) => path.join('scripts', f))].filter((f) => f.endsWith('.js'));
let failed = 0;
const step = (name, cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n${(r.stderr || r.stdout || '').trim()}`}`);
};
for (const f of files) step(`node --check ${f}`, process.execPath, ['--check', f]);
step('TypeScript (tsc --noEmit)', process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '--noEmit']);
step('Namuna epizod validatsiyasi', process.execPath, ['scripts/validate_episode.js', 'episodes/sample']);
step('Kalendar JSON', process.execPath, ['-e', "JSON.parse(require('fs').readFileSync('content/calendar.json','utf-8'))"]);
console.log(failed ? `\n${failed} ta tekshiruv xato` : '\nHammasi joyida ✅');
process.exit(failed ? 1 : 0);
