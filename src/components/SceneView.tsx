import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Room3D } from './Room3D';
import { Stickman } from './Stickman';
import { Caption } from './Caption';
import { hoodieColors } from '../style/tokens';
import type { CastMember, Scene } from '../types';

// Bitta sahna: orqada 3D muhit, ustida tekis 2D qahramonlar va matn.
// 2.5D parallaks: kamera harakatiga mos ravishda 2D qatlam masshtabi/siljishi.
const SEATED = ['sit', 'slump', 'head_in_hands'];

export const SceneView: React.FC<{ scene: Scene; cast: CastMember[]; durationFrames: number }> = ({ scene, cast, durationFrames }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const progress = Math.min(1, frame / Math.max(1, durationFrames - 1));
  const p = Easing.inOut(Easing.cubic)(progress);
  const vertical = height > width;
  const u = Math.min(width, height) / 1080;
  const i = scene.camera.intensity ?? 0.5;

  let layerScale = 1;
  let layerX = 0;
  let layerY = 0;
  switch (scene.camera.move) {
    case 'push_in': layerScale = 9 / (9 - 3.2 * i * p); break;
    case 'pull_out': layerScale = 9 / (9 - 3.2 * i + 3.2 * i * p); break;
    case 'orbit_left': layerX = 160 * i * p * u; break;
    case 'orbit_right': layerX = -160 * i * p * u; break;
    case 'pan_left': layerX = -220 * i * (1 - 2 * p) * -1 * u; break;
    case 'pan_right': layerX = 220 * i * (1 - 2 * p) * -1 * u; break;
    case 'crane_up': layerY = 260 * i * p * u; layerScale = 1 - 0.12 * i * p; break;
    case 'crane_down': layerY = 260 * i * (1 - p) * u; break;
    case 'shake': layerX = Math.sin(t * 37) * 6 * i; layerY = Math.cos(t * 29) * 5 * i; break;
    default: layerScale = 1 + 0.04 * p;
  }

  const groundY = height * (vertical ? 0.7 : 0.82);
  const figureScale = (vertical ? 1.7 : 1.15) * u;

  // O'tish effektlari
  let overlay: React.ReactNode = null;
  if (scene.transition === 'fade' || scene.transition === 'blackout') {
    const len = scene.transition === 'blackout' ? 14 : 8;
    const o = interpolate(frame, [0, len], [1, 0], { extrapolateRight: 'clamp' });
    overlay = <AbsoluteFill style={{ background: '#000', opacity: o }} />;
  } else if (scene.transition === 'flash') {
    const o = interpolate(frame, [0, 5], [0.9, 0], { extrapolateRight: 'clamp' });
    overlay = <AbsoluteFill style={{ background: '#FFF', opacity: o }} />;
  }

  return (
    <AbsoluteFill>
      <Room3D environment={scene.environment} timeOfDay={scene.timeOfDay} props={scene.props} camera={scene.camera} progress={progress} />
      <AbsoluteFill style={{ transform: `translate(${layerX}px, ${layerY}px) scale(${layerScale})`, transformOrigin: `50% ${groundY}px` }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0 }}>
          {scene.characters.map((c, idx) => {
            const member = cast.find((m) => m.id === c.castId) ?? { id: c.castId, hoodie: 'grey', scale: 1 };
            const x0 = c.x ?? 0.5;
            const x1 = c.toX ?? x0;
            const moving = (c.pose === 'walk' || c.pose === 'run') && c.toX !== undefined;
            let xr = moving ? interpolate(progress, [0, 1], [x0, x1]) : x0;
            if (vertical) xr = 0.5 + (xr - 0.5) * 0.85;
            const facing = c.facing ?? (moving ? (x1 >= x0 ? 'right' : 'left') : 'right');
            const s = figureScale * (member.scale ?? 1);
            return (
              <g key={`${c.castId}-${idx}`} transform={`translate(${xr * width} ${groundY}) scale(${s})`}>
                {/* yerdagi tekis soya — 2D uslubga mos, bitta to'q ellips */}
                <ellipse cx={0} cy={2} rx={c.pose === 'lie' ? 200 : 70} ry={12} fill="#000" opacity={0.28} />
                {/* tekis 2D tayanch: o'tirganda o'rindiq, yotganda karavot (havoda osilib qolmasligi uchun) */}
                {SEATED.includes(c.pose) && <rect x={facing === 'left' ? -30 : -48} y={-52} width={78} height={52} rx={6} fill="#2A323C" />}
                {c.pose === 'lie' && (
                  <g transform={`scale(${facing === 'left' ? -1 : 1} 1)`}>
                    <rect x={-310} y={6} width={450} height={34} rx={6} fill="#10151B" />
                    <rect x={-305} y={-14} width={440} height={22} rx={8} fill="#56606E" />
                    <rect x={-300} y={-30} width={95} height={18} rx={8} fill="#A4B0BE" />
                  </g>
                )}
                <Stickman pose={c.pose} emotion={c.emotion} hoodie={hoodieColors[member.hoodie] ?? member.hoodie} t={t + idx * 0.7} frame={frame + idx * 37} facing={facing} />
              </g>
            );
          })}
        </svg>
      </AbsoluteFill>
      {/* yengil vinyetka — kinematografik ko'rinish */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)' }} />
      {scene.caption && <Caption caption={scene.caption} durationFrames={durationFrames} />}
      {overlay}
    </AbsoluteFill>
  );
};
