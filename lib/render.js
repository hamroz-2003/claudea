import fs from 'node:fs';
import path from 'node:path';
import { run, npxCmd } from './run.js';
import { ROOT } from './episode.js';

// YouTube ovozni -14 LUFS ga moslaydi; undan past bo'lsa video telefonda jim eshitiladi.
function normalizeLoudness(file) {
  const tmp = file.replace(/\.mp4$/, '.norm.mp4');
  try {
    run(process.env.FFMPEG_BIN || 'ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-c:v', 'copy',
      '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', tmp], { label: 'Ovoz -14 LUFS' });
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    console.warn(`[Ovoz] normalizatsiya qilinmadi (FFmpeg o'rnatilganmi?): ${e.message.split('\n')[0]}`);
  }
}

const browserArgs = () => (process.env.REMOTION_BROWSER ? [`--browser-executable=${process.env.REMOTION_BROWSER}`] : []);

function ensureSfx() {
  const probe = path.join(ROOT, 'public', 'sfx', 'hum.wav');
  if (!fs.existsSync(probe)) run(process.execPath, [path.join(ROOT, 'scripts', 'make_sfx.js')], { label: 'SFX', inherit: true, cwd: ROOT });
}

/**
 * Epizodni render qiladi: uzun video, Shorts kesmasi va muqova.
 * @returns {{long?: string, short?: string, thumb: string, props: string}}
 */
export function renderEpisode(episode, outDir, { long = true, short = true, thumb = true, frames } = {}) {
  ensureSfx();
  fs.mkdirSync(outDir, { recursive: true });
  const props = path.join(outDir, 'props.json');
  fs.writeFileSync(props, JSON.stringify({ episode }));
  const common = [`--props=${props}`, '--log=error', ...browserArgs()];
  const out = { props };
  const entry = path.join(ROOT, 'src', 'index.ts');
  if (long) {
    out.long = path.join(outDir, `${episode.slug}.mp4`);
    run(npxCmd, ['remotion', 'render', entry, 'Episode', out.long, '--codec=h264', ...(frames ? [`--frames=${frames}`] : []), ...common], { label: 'Render 16:9', inherit: true, cwd: ROOT });
  }
  if (short) {
    out.short = path.join(outDir, `${episode.slug}-short.mp4`);
    run(npxCmd, ['remotion', 'render', entry, 'EpisodeShort', out.short, '--codec=h264', ...(frames ? [`--frames=${frames}`] : []), ...common], { label: 'Render 9:16', inherit: true, cwd: ROOT });
  }
  if (thumb) {
    out.thumb = path.join(outDir, `${episode.slug}-thumb.png`);
    run(npxCmd, ['remotion', 'still', entry, 'Thumbnail', out.thumb, ...common], { label: 'Muqova', inherit: true, cwd: ROOT });
  }
  for (const f of [out.long, out.short, out.thumb].filter(Boolean)) if (!fs.existsSync(f)) throw new Error(`Render natijasi topilmadi: ${f}`);
  for (const f of [out.long, out.short].filter(Boolean)) normalizeLoudness(f);
  return out;
}
