import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { SceneView } from './components/SceneView';
import type { Episode as EpisodeT, EpisodeProps, Scene } from './types';

// Ma'lumotga asoslangan kompozitsiya: barcha hikoya episode.json da.
// Claude bu faylni o'zgartirmaydi — faqat JSON yozadi.

export const sceneFrames = (s: Scene, fps: number) => Math.max(1, Math.round(s.durationSec * fps));
export const episodeFrames = (e: EpisodeT, fps: number) => e.scenes.reduce((a, s) => a + sceneFrames(s, fps), 0);

const SFX_VOLUME: Record<string, number> = {
  hum: 0.25, clock_tick: 0.35, footsteps: 0.45, ui_click: 0.5, heartbeat: 0.55, rain: 0.3, door: 0.6, notification: 0.5, wind: 0.3, crowd: 0.25,
};
const MUSIC_VOLUME = 0.22;

export const Episode: React.FC<EpisodeProps> = ({ episode }) => {
  const { fps } = useVideoConfig();
  let cursor = 0;
  const placed = episode.scenes.map((s) => {
    const from = cursor;
    const dur = sceneFrames(s, fps);
    cursor += dur;
    return { s, from, dur };
  });

  // Musiqa: bir xil trekli ketma-ket sahnalarni bitta uzluksiz qatlamga birlashtiramiz
  const musicRuns: { track: string; from: number; dur: number }[] = [];
  for (const { s, from, dur } of placed) {
    const track = s.music ?? 'pad_low';
    const last = musicRuns[musicRuns.length - 1];
    if (last && last.track === track && last.from + last.dur === from) last.dur += dur;
    else musicRuns.push({ track, from, dur });
  }

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {placed.map(({ s, from, dur }) => (
        <Sequence key={s.id} from={from} durationInFrames={dur} name={`${s.id} · ${s.beat}`}>
          <SceneView scene={s} cast={episode.cast} durationFrames={dur} />
          {(s.sfx ?? []).map((fx) => (
            <Audio key={fx} src={staticFile(`sfx/${fx}.wav`)} loop volume={SFX_VOLUME[fx] ?? 0.4} />
          ))}
        </Sequence>
      ))}
      {musicRuns.filter((r) => r.track !== 'none').map((r, i) => (
        <Sequence key={`m${i}`} from={r.from} durationInFrames={r.dur} name={`music ${r.track}`}>
          <Audio src={staticFile(`sfx/${r.track}.wav`)} loop
            volume={(f) => Math.min(1, f / 20, (r.dur - f) / 20) * MUSIC_VOLUME} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
