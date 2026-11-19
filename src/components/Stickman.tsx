import React from 'react';
import { palette, stickman as S } from '../style/tokens';
import type { Emotion, Pose } from '../types';

// Tekis 2D vektor qahramon: qora doira bosh, ikki oq ko'z chizig'i, rangli hudi,
// qalin yumaloq qora qo'l-oyoqlar. Kontur, gradient yoki 3D soya YO'Q.
// Koordinatalar: (0,0) — oyoqlar orasidagi yer nuqtasi; o'ngga qarab chiziladi.

type Pt = { x: number; y: number };
const rad = (d: number) => (d * Math.PI) / 180;
// Burchak 0 = to'g'ri pastga, musbat = oldinga (qaragan tomonga)
const step = (p: Pt, angle: number, len: number): Pt => ({
  x: p.x + Math.sin(rad(angle)) * len,
  y: p.y + Math.cos(rad(angle)) * len,
});

interface Limb { upper: number; lower: number } // lower — upper ga nisbatan
interface PoseFrame {
  hipY: number; // yerdan balandlik (manfiy = yuqori)
  lean: number; // tana egilishi (gradus, oldinga musbat)
  headDrop: number; // boshning pastga tushishi (px)
  armFront: Limb; armBack: Limb; legFront: Limb; legBack: Limb;
  rotate?: number; // butun figura (lie)
  phone?: boolean;
}

const standHip = -S.legLen;

function poseAt(pose: Pose, t: number, emotion: Emotion): PoseFrame {
  // t — sekundlarda vaqt. Nafas olish: kichik tebranish.
  const breath = Math.sin(t * 2.2) * 2;
  const sadSlouch = emotion === 'sad' || emotion === 'tired' || emotion === 'ashamed' ? 6 : 0;
  switch (pose) {
    case 'walk':
    case 'run': {
      const run = pose === 'run';
      const speed = run ? 9 : 5.5;
      const amp = run ? 38 : 24;
      const ph = Math.sin(t * speed);
      const bob = Math.abs(Math.cos(t * speed)) * (run ? 10 : 5);
      return {
        hipY: standHip + bob - (run ? 4 : 0),
        lean: (run ? 12 : 3) + sadSlouch,
        headDrop: sadSlouch,
        legFront: { upper: ph * amp, lower: ph > 0 ? -10 : -Math.abs(ph) * (run ? 70 : 40) },
        legBack: { upper: -ph * amp, lower: ph < 0 ? -10 : -Math.abs(ph) * (run ? 70 : 40) },
        armFront: { upper: -ph * amp * 0.8, lower: run ? 70 : 20 },
        armBack: { upper: ph * amp * 0.8, lower: run ? 70 : 20 },
      };
    }
    case 'sit':
      return {
        hipY: -S.legLen * 0.5 + breath * 0.3, lean: 4 + sadSlouch, headDrop: sadSlouch,
        legFront: { upper: 88, lower: -86 }, legBack: { upper: 84, lower: -82 },
        armFront: { upper: 25, lower: 50 }, armBack: { upper: 20, lower: 45 },
      };
    case 'slump':
      return {
        hipY: -S.legLen * 0.5, lean: 28, headDrop: 18,
        legFront: { upper: 80, lower: -78 }, legBack: { upper: 76, lower: -74 },
        armFront: { upper: 40 + breath, lower: 10 }, armBack: { upper: 35 + breath, lower: 10 },
      };
    case 'head_in_hands':
      return {
        hipY: -S.legLen * 0.5, lean: 30, headDrop: 22,
        legFront: { upper: 82, lower: -80 }, legBack: { upper: 78, lower: -76 },
        armFront: { upper: 55, lower: 125 + breath }, armBack: { upper: 50, lower: 128 + breath },
      };
    case 'reach': {
      const r = Math.min(1, t / 0.8);
      return {
        hipY: standHip, lean: 8, headDrop: 0,
        legFront: { upper: 10, lower: 0 }, legBack: { upper: -14, lower: 0 },
        armFront: { upper: 30 + 80 * r, lower: 5 }, armBack: { upper: -10, lower: 10 },
      };
    }
    case 'kneel':
      return {
        hipY: -S.legLen * 0.55, lean: 6 + sadSlouch, headDrop: sadSlouch,
        legFront: { upper: 85, lower: -85 }, legBack: { upper: -5, lower: -90 },
        armFront: { upper: 15, lower: 20 }, armBack: { upper: 10, lower: 15 },
      };
    case 'lie':
      return {
        hipY: standHip, lean: 0, headDrop: 0, rotate: -90,
        legFront: { upper: 4, lower: 0 }, legBack: { upper: -4, lower: 0 },
        armFront: { upper: 8 + breath * 0.5, lower: 0 }, armBack: { upper: -6, lower: 0 },
      };
    case 'hug':
      return {
        hipY: standHip + breath * 0.3, lean: 6, headDrop: 4,
        legFront: { upper: 6, lower: 0 }, legBack: { upper: -6, lower: 0 },
        armFront: { upper: 80, lower: 60 }, armBack: { upper: 75, lower: 70 },
      };
    case 'look_phone':
      return {
        hipY: standHip + breath * 0.3, lean: 6 + sadSlouch, headDrop: 10,
        legFront: { upper: 5, lower: 0 }, legBack: { upper: -5, lower: 0 },
        armFront: { upper: 22, lower: 112 }, armBack: { upper: 18, lower: 116 },
        phone: true,
      };
    case 'stand':
    default:
      return {
        hipY: standHip + breath * 0.3, lean: sadSlouch, headDrop: sadSlouch,
        legFront: { upper: 6, lower: 0 }, legBack: { upper: -6, lower: 0 },
        armFront: { upper: 8 + breath * 0.4, lower: 6 }, armBack: { upper: -6 - breath * 0.4, lower: 6 },
      };
  }
}

const Eyes: React.FC<{ emotion: Emotion; t: number; frame: number }> = ({ emotion, t, frame }) => {
  // Har ~3.3 soniyada 4 kadrlik ko'z yumish
  const blinkCycle = frame % 100;
  const blink = emotion !== 'shocked' && blinkCycle >= 96 ? 0.15 : 1;
  const jitter = emotion === 'anxious' ? Math.sin(t * 40) * 1.5 : 0;
  const eyeStyle = { stroke: palette.eye, strokeWidth: 6, strokeLinecap: 'round' as const, fill: 'none' };
  const eyesX = [-4, 22]; // o'ngga qaragani uchun ko'zlar oldinga siljigan
  let y = -4;
  let tilt = 0; // + : tashqi uchlar pastga (g'amgin)
  let len = 16;
  let kind: 'dash' | 'arc' | 'dot' = 'dash';
  switch (emotion) {
    case 'sad': tilt = 20; y = -2; break;
    case 'angry': tilt = -25; break;
    case 'determined': tilt = -12; len = 18; break;
    case 'tired': y = 4; len = 11; break;
    case 'shocked': kind = 'dot'; y = -6; break;
    case 'happy': kind = 'arc'; y = -4; break;
    case 'hopeful': kind = 'arc'; y = -10; len = 13; break;
    case 'anxious': tilt = 10; break;
    case 'ashamed': tilt = 12; y = 8; len = 12; break;
    default: break;
  }
  return (
    <g transform={`translate(${jitter} 0) scale(1 ${blink})`}>
      {eyesX.map((ex, i) => {
        const outer = i === 0 ? -1 : 1;
        if (kind === 'dot') return <circle key={i} cx={ex} cy={y} r={6} fill={palette.eye} />;
        if (kind === 'arc')
          return <path key={i} d={`M ${ex - len / 2} ${y + 3} Q ${ex} ${y - 7} ${ex + len / 2} ${y + 3}`} {...eyeStyle} />;
        return (
          <line key={i} x1={ex - len / 2} y1={y} x2={ex + len / 2} y2={y} {...eyeStyle}
            transform={`rotate(${tilt * outer} ${ex} ${y})`} />
        );
      })}
    </g>
  );
};

export interface StickmanProps {
  pose: Pose;
  emotion: Emotion;
  hoodie: string;
  t: number; // sekund
  frame: number;
  facing?: 'left' | 'right';
}

export const Stickman: React.FC<StickmanProps> = ({ pose, emotion, hoodie, t, frame, facing = 'right' }) => {
  const p = poseAt(pose, t, emotion);
  const hip: Pt = { x: 0, y: p.hipY };
  // Tana egilishi: yelka hip atrofida aylanadi
  const torsoTop = step(hip, 180 - p.lean, S.torsoH - 16);
  const shoulder = torsoTop;
  const headC: Pt = { x: shoulder.x + Math.sin(rad(p.lean)) * 10, y: shoulder.y - S.headRadius - 4 + p.headDrop };

  const limb = (from: Pt, l: Limb, len: number) => {
    const mid = step(from, l.upper, len / 2);
    const end = step(mid, l.upper + l.lower, len / 2);
    return { mid, end, d: `M ${from.x} ${from.y} L ${mid.x} ${mid.y} L ${end.x} ${end.y}` };
  };
  const hipL = { x: hip.x - 10, y: hip.y };
  const hipR = { x: hip.x + 10, y: hip.y };
  const legB = limb(hipL, p.legBack, S.legLen);
  const legF = limb(hipR, p.legFront, S.legLen);
  const shoulderB = { x: shoulder.x - 6, y: shoulder.y + 14 };
  const shoulderF = { x: shoulder.x + 6, y: shoulder.y + 14 };
  const armB = limb(shoulderB, p.armBack, S.armLen);
  const armF = limb(shoulderF, p.armFront, S.armLen);
  const limbStyle = { stroke: palette.ink, strokeWidth: S.limb, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  // Hudi: yumaloq trapetsiya + bosh orqasidagi kapyushon
  const tw = S.torsoW;
  const torsoPath = `M ${-tw / 2 + 8} 0 Q ${-tw / 2} 0 ${-tw / 2 + 2} 18 L ${-tw / 2 + 10} ${S.torsoH - 14}
    Q ${-tw / 2 + 12} ${S.torsoH} 0 ${S.torsoH} Q ${tw / 2 - 12} ${S.torsoH} ${tw / 2 - 10} ${S.torsoH - 14}
    L ${tw / 2 - 2} 18 Q ${tw / 2} 0 ${tw / 2 - 8} 0 Z`;

  const body = (
    <g>
      <path d={legB.d} {...limbStyle} />
      <path d={legF.d} {...limbStyle} />
      <path d={armB.d} {...limbStyle} />
      {/* kapyushon */}
      <ellipse cx={headC.x - 8} cy={headC.y + 22} rx={S.headRadius * 0.95} ry={S.headRadius * 0.8} fill={hoodie} />
      <g transform={`translate(${shoulder.x} ${shoulder.y - 8}) rotate(${p.lean})`}>
        <path d={torsoPath} fill={hoodie} />
        {/* old cho'ntak — tekis, faqat sal to'qroq ohang */}
        <rect x={-tw / 2 + 18} y={S.torsoH - 46} width={tw - 36} height={22} rx={10} fill={palette.ink} opacity={0.12} />
      </g>
      <circle cx={headC.x} cy={headC.y} r={S.headRadius} fill={palette.ink} />
      <g transform={`translate(${headC.x} ${headC.y})`}>
        <Eyes emotion={emotion} t={t} frame={frame} />
      </g>
      {p.phone && (
        <g>
          <rect x={armF.end.x - 4} y={armF.end.y - 26} width={22} height={36} rx={4} fill={palette.ink} />
          <rect x={armF.end.x - 1} y={armF.end.y - 23} width={16} height={28} rx={2} fill="#DFF1FF" />
        </g>
      )}
      <path d={armF.d} {...limbStyle} />
    </g>
  );

  const flip = facing === 'left' ? -1 : 1;
  return (
    <g transform={`scale(${flip} 1)`}>
      {p.rotate ? <g transform={`translate(${-p.hipY * 0.9} -62) rotate(${p.rotate})`}>{body}</g> : body}
    </g>
  );
};
