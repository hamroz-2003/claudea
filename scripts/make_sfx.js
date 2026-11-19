// Protsedurali tovushlar: FFmpeg lavfi orqali 100% original audio (Content ID da'volari bo'lmaydi).
// Ishga tushirish: npm run setup
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'sfx');
fs.mkdirSync(OUT, { recursive: true });
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';

// Har biri: [nom, davomiylik (s), filter_complex — [out] chiqishi bilan]
const SR = 44100;
const sounds = {
  hum: [8, `sine=f=55:r=${SR}[a];sine=f=110:r=${SR}[b];anoisesrc=c=brown:r=${SR}:a=0.05[n];[a][b][n]amix=inputs=3:weights=1 0.4 0.6,lowpass=f=300,volume=0.9[out]`],
  clock_tick: [1, `sine=f=2200:r=${SR},volume='if(lt(t,0.012),1,0)':eval=frame,highpass=f=800,volume=0.8[out]`],
  footsteps: [1, `anoisesrc=c=pink:r=${SR}:a=0.8,volume='if(lt(mod(t,0.5),0.06),1-mod(t,0.5)/0.06,0)':eval=frame,lowpass=f=600[out]`],
  ui_click: [0.5, `sine=f=1500:r=${SR},volume='if(lt(t,0.03),1-t/0.03,0)':eval=frame[out]`],
  heartbeat: [0.9, `sine=f=48:r=${SR},volume='if(lt(t,0.12),sin(PI*t/0.12),if(between(t,0.22,0.34),0.7*sin(PI*(t-0.22)/0.12),0))':eval=frame,volume=2.5[out]`],
  rain: [8, `anoisesrc=c=pink:r=${SR}:a=0.5,highpass=f=400,lowpass=f=6000,volume=0.6[out]`],
  door: [1.2, `anoisesrc=c=brown:r=${SR}:a=1,volume='if(lt(t,0.25),1-t/0.25,0)':eval=frame,lowpass=f=220,volume=3[out]`],
  notification: [1.5, `sine=f=880:r=${SR},volume='if(lt(t,0.12),1-t/0.12,0)':eval=frame[a];sine=f=1320:r=${SR},volume='if(between(t,0.13,0.3),1-(t-0.13)/0.17,0)':eval=frame[b];[a][b]amix=inputs=2,volume=1.6[out]`],
  wind: [8, `anoisesrc=c=brown:r=${SR}:a=0.6,bandpass=f=500:w=400,tremolo=f=0.2:d=0.6,volume=1.4[out]`],
  crowd: [8, `anoisesrc=c=pink:r=${SR}:a=0.4,bandpass=f=900:w=700,tremolo=f=3:d=0.3,volume=0.8[out]`],
  // Musiqa qatlamlari (sekin ambient akkordlar)
  pad_low: [16, `sine=f=110:r=${SR}[a];sine=f=130.81:r=${SR}[b];sine=f=164.81:r=${SR}[c];[a][b][c]amix=inputs=3,tremolo=f=0.15:d=0.5,lowpass=f=900,volume=1.6[out]`],
  pad_hope: [16, `sine=f=130.81:r=${SR}[a];sine=f=164.81:r=${SR}[b];sine=f=196:r=${SR}[c];sine=f=261.63:r=${SR}[d];[a][b][c][d]amix=inputs=4,tremolo=f=0.2:d=0.4,lowpass=f=1400,volume=1.6[out]`],
  pulse: [4, `sine=f=65:r=${SR},volume='0.2+0.8*pow(abs(sin(PI*t*1.0)),8)':eval=frame[a];anoisesrc=c=brown:r=${SR}:a=0.03[n];[a][n]amix=inputs=2,lowpass=f=400,volume=2[out]`],
};

let failed = 0;
for (const [name, [dur, graph]] of Object.entries(sounds)) {
  const file = path.join(OUT, `${name}.wav`);
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-filter_complex', graph, '-map', '[out]', '-t', String(dur), '-ac', '2', '-ar', String(SR), file];
  const r = spawnSync(FFMPEG, args, { encoding: 'utf-8' });
  if (r.status !== 0) { failed++; console.error(`✗ ${name}: ${r.stderr || r.error}`); }
  else console.log(`✓ ${name}.wav (${dur}s)`);
}
if (failed) { console.error(`${failed} ta tovush yaratilmadi. FFmpeg o'rnatilganini tekshiring.`); process.exit(1); }
