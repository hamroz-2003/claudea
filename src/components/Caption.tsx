import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts, palette } from '../style/tokens';
import type { Scene } from '../types';

// Ekrandagi matn: dialogsiz filmlarda hikoyani matn olib boradi (global auditoriya uchun qulay).
export const Caption: React.FC<{ caption: NonNullable<Scene['caption']>; durationFrames: number }> = ({ caption, durationFrames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const fadeIn = Math.min(10, Math.floor(durationFrames / 4));
  const opacity = interpolate(frame, [0, fadeIn, durationFrames - fadeIn, durationFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const vertical = height > width;

  const base: React.CSSProperties = { position: 'absolute', left: 0, right: 0, textAlign: 'center', opacity, color: palette.text, padding: `0 ${80 * u}px` };

  switch (caption.style) {
    case 'title':
      return <div style={{ ...base, top: vertical ? '22%' : '14%', fontFamily: fonts.display, fontSize: 92 * u, letterSpacing: 2, textTransform: 'uppercase' }}>{caption.text}</div>;
    case 'counter': {
      const shown = caption.text;
      return <div style={{ ...base, top: vertical ? '14%' : '8%', fontFamily: fonts.mono, fontWeight: 700, fontSize: 110 * u, color: palette.hero }}>{shown}</div>;
    }
    case 'thought':
      return <div style={{ ...base, bottom: vertical ? '22%' : '9%', fontFamily: fonts.body, fontStyle: 'italic', fontSize: 50 * u, color: palette.text }}>{caption.text}</div>;
    case 'whisper':
      return <div style={{ ...base, bottom: vertical ? '20%' : '8%', fontFamily: fonts.body, fontSize: 38 * u, color: palette.muted, letterSpacing: 1 }}>{caption.text}</div>;
    case 'message': {
      // Telefon xabari: yozilish effekti bilan
      const chars = Math.floor(interpolate(frame, [4, Math.max(5, durationFrames * 0.6)], [0, caption.text.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
      return (
        <div style={{ position: 'absolute', right: vertical ? '8%' : '10%', top: vertical ? '16%' : '14%', maxWidth: vertical ? '80%' : '38%', opacity }}>
          <div style={{ background: palette.text, color: palette.charcoal, fontFamily: fonts.body, fontSize: 40 * u, padding: `${22 * u}px ${30 * u}px`, borderRadius: 28 * u, borderBottomRightRadius: 6 * u }}>
            {caption.text.slice(0, chars)}
            <span style={{ opacity: chars < caption.text.length ? 1 : 0 }}>|</span>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
};
