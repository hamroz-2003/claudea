import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Room3D } from './components/Room3D';
import { Stickman } from './components/Stickman';
import { accentColors, fonts, hoodieColors, palette } from './style/tokens';
import type { EpisodeProps } from './types';

// Muqova (1280x720). Trafikning ~82% bosh sahifadan keladi — muqova eng muhim omil.
// Qoidalar: bitta yirik qahramon + 2-3 so'zli katta matn + bitta urg'u rangi.
export const Thumbnail: React.FC<EpisodeProps> = ({ episode }) => {
  const th = episode.thumbnail;
  const hero = episode.cast[0];
  const accent = accentColors[th.accent ?? 'yellow'];
  return (
    <AbsoluteFill style={{ background: palette.charcoal }}>
      <Room3D environment={th.environment} timeOfDay={th.timeOfDay ?? 'night'} camera={{ move: 'static', intensity: 0 }} progress={0.5} />
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.65) 100%)' }} />
      <svg width={1280} height={720} style={{ position: 'absolute', inset: 0 }}>
        <g transform="translate(330 690) scale(1.75)">
          <ellipse cx={0} cy={2} rx={70} ry={12} fill="#000" opacity={0.35} />
          <Stickman pose="stand" emotion={th.emotion} hoodie={hoodieColors[hero?.hoodie ?? 'yellow']} t={0.3} frame={10} facing="right" />
        </g>
      </svg>
      <div style={{ position: 'absolute', right: 56, top: 150, width: 640, textAlign: 'right' }}>
        <div style={{ fontFamily: fonts.display, fontSize: th.text.length > 10 ? 104 : 136, lineHeight: 0.95, color: accent, textTransform: 'uppercase', letterSpacing: 1 }}>
          {th.text}
        </div>
        {th.subtext && (
          <div style={{ marginTop: 22, fontFamily: fonts.display, fontSize: 48, color: palette.text, textTransform: 'uppercase' }}>{th.subtext}</div>
        )}
      </div>
      <div style={{ position: 'absolute', left: 28, top: 22, fontFamily: fonts.display, fontSize: 26, color: palette.hero, letterSpacing: 4, opacity: 0.85 }}>RYZON</div>
    </AbsoluteFill>
  );
};
