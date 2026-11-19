import React, { useLayoutEffect, useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCurrentFrame, useVideoConfig, Easing, interpolate } from 'remotion';
import { timeTints } from '../style/tokens';
import type { CameraMove, Environment, Prop, TimeOfDay } from '../types';

// Yoritilmagan (MeshBasicMaterial) low-poly muhit. Hajm hissi faqat
// qirralarga oldindan berilgan tekis ohanglar orqali beriladi.

const shade = (hex: string, amt: number) => {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
};

type V3 = [number, number, number];

const Box: React.FC<{ pos: V3; size: V3; color: string; rot?: number }> = ({ pos, size, color, rot = 0 }) => {
  const mats = useMemo(() => {
    // tartib: +x, -x, +y(top), -y, +z(front), -z
    const faces = [shade(color, -0.05), shade(color, -0.08), shade(color, 0.08), shade(color, -0.12), color, shade(color, -0.1)];
    return faces.map((f) => new THREE.MeshBasicMaterial({ color: f }));
  }, [color]);
  return (
    <mesh position={pos} rotation={[0, rot, 0]} material={mats}>
      <boxGeometry args={size} />
    </mesh>
  );
};

const Flat: React.FC<{ pos: V3; size: [number, number]; color: string; rotY?: number; rotX?: number }> = ({ pos, size, color, rotY = 0, rotX = 0 }) => (
  <mesh position={pos} rotation={[rotX, rotY, 0]}>
    <planeGeometry args={size} />
    <meshBasicMaterial color={color} side={THREE.DoubleSide} />
  </mesh>
);

const Glow: React.FC<{ pos: V3; r: number; color: string }> = ({ pos, r, color }) => (
  <mesh position={pos}>
    <icosahedronGeometry args={[r, 0]} />
    <meshBasicMaterial color={color} />
  </mesh>
);

const Clock: React.FC<{ pos: V3; t: number; c: string }> = ({ pos, t, c }) => (
  <group position={pos}>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.45, 0.45, 0.06, 10]} />
      <meshBasicMaterial color={shade(c, 0.35)} />
    </mesh>
    <mesh position={[0, 0, 0.05]} rotation={[0, 0, -t * 0.1]}>
      <boxGeometry args={[0.04, 0.32, 0.01]} />
      <meshBasicMaterial color="#111" />
    </mesh>
    <mesh position={[0, 0, 0.06]} rotation={[0, 0, -t * Math.PI * 2 / 60 * 6]}>
      <boxGeometry args={[0.025, 0.4, 0.01]} />
      <meshBasicMaterial color="#C23616" />
    </mesh>
  </group>
);

interface Tint { sky: string; floor: string; wall: string; wallSide: string; object: string; objectTop: string; glow: string; fog: string }

const PropMesh: React.FC<{ prop: Prop; tint: Tint; t: number; outdoor: boolean }> = ({ prop, tint, t, outdoor }) => {
  const o = tint.object;
  const g = tint.glow;
  const wallZ = -3.9;
  switch (prop) {
    case 'bed': return (<group><Box pos={[2.6, 0.35, -2]} size={[3.2, 0.7, 2.2]} color={o} /><Box pos={[3.7, 0.8, -2]} size={[0.8, 0.25, 1.6]} color={shade(o, 0.15)} /></group>);
    case 'hospital_bed': return (<group><Box pos={[2.6, 0.75, -2]} size={[3.2, 0.3, 1.6]} color="#C8D6E5" /><Box pos={[1.1, 0.4, -2]} size={[0.1, 0.8, 1.6]} color={o} /><Box pos={[4.1, 0.6, -2]} size={[0.1, 1.2, 1.6]} color={o} /></group>);
    case 'desk': return (<group><Box pos={[-2.8, 1.0, -2.6]} size={[2.6, 0.12, 1.2]} color={tint.objectTop} /><Box pos={[-3.9, 0.5, -2.6]} size={[0.15, 1, 1.1]} color={o} /><Box pos={[-1.7, 0.5, -2.6]} size={[0.15, 1, 1.1]} color={o} /></group>);
    case 'laptop': return (<group><Box pos={[-2.8, 1.09, -2.5]} size={[0.9, 0.05, 0.6]} color="#57606F" /><Flat pos={[-2.8, 1.38, -2.78]} size={[0.9, 0.56]} color={shade(g, -0.1)} rotX={-0.15} /></group>);
    case 'chair': return (<group><Box pos={[-2.6, 0.55, -1.6]} size={[0.8, 0.1, 0.8]} color={o} /><Box pos={[-2.6, 1.0, -1.98]} size={[0.8, 0.9, 0.1]} color={o} /></group>);
    case 'sofa': return (<group><Box pos={[0, 0.4, -2.8]} size={[4, 0.8, 1.3]} color={o} /><Box pos={[0, 1.0, -3.35]} size={[4, 0.8, 0.3]} color={shade(o, -0.05)} /></group>);
    case 'tv': return (<group><Box pos={[-4.2, 0.4, -2.5]} size={[1.6, 0.8, 0.7]} color={o} /><Box pos={[-4.2, 1.45, -2.6]} size={[1.9, 1.1, 0.1]} color="#111" /><Flat pos={[-4.2, 1.45, -2.54]} size={[1.75, 0.95]} color="#5DADE2" /></group>);
    case 'window': return outdoor ? null : (<group><Flat pos={[-1.5, 2.6, wallZ + 0.01]} size={[2.2, 1.6]} color={shade(tint.sky, 0.12)} /><Glow pos={[-1.0, 3.0, wallZ + 0.02]} r={0.18} color={g} /><Flat pos={[-1.5, 2.6, wallZ + 0.03]} size={[0.08, 1.6]} color={tint.wallSide} /><Flat pos={[-1.5, 2.6, wallZ + 0.03]} size={[2.2, 0.08]} color={tint.wallSide} /></group>);
    case 'clock': return outdoor ? null : <Clock pos={[1.6, 3.1, wallZ + 0.05]} t={t} c={o} />;
    case 'calendar': return outdoor ? null : (<group><Flat pos={[3.4, 2.7, wallZ + 0.02]} size={[0.8, 1.0]} color="#DCDDE1" /><Flat pos={[3.4, 3.1, wallZ + 0.03]} size={[0.8, 0.22]} color="#C23616" /></group>);
    case 'photo_frame': return outdoor ? null : (<group><Flat pos={[0.2, 2.6, wallZ + 0.02]} size={[0.9, 0.7]} color={shade(o, 0.25)} /><Flat pos={[0.2, 2.6, wallZ + 0.03]} size={[0.7, 0.5]} color={shade(g, -0.35)} /></group>);
    case 'door': return outdoor ? null : (<group><Flat pos={[-5.95, 1.15, 0.5]} size={[1.2, 2.3]} color={shade(tint.wallSide, 0.08)} rotY={Math.PI / 2} /><Glow pos={[-5.9, 1.1, 0.95]} r={0.05} color={g} /></group>);
    case 'lamp': return (<group><Box pos={[4.6, 0.04, -3]} size={[0.5, 0.08, 0.5]} color={o} /><Box pos={[4.6, 1.0, -3]} size={[0.06, 2, 0.06]} color={o} /><Glow pos={[4.6, 2.1, -3]} r={0.32} color={g} /></group>);
    case 'bottle': return (<mesh position={[-2.2, 1.25, -2.4]}><cylinderGeometry args={[0.08, 0.1, 0.4, 6]} /><meshBasicMaterial color="#2D6A4F" /></mesh>);
    case 'cards': return (<group><Flat pos={[-3.0, 1.07, -2.4]} size={[0.25, 0.35]} color="#F5F6FA" rotX={-Math.PI / 2} /><Flat pos={[-2.6, 1.07, -2.5]} size={[0.25, 0.35]} color="#F5F6FA" rotX={-Math.PI / 2} /></group>);
    case 'phone': return (<Box pos={[2.2, 0.75, -1.4]} size={[0.25, 0.03, 0.45]} color="#111" />);
    case 'slot_machine': return (<group>{[-4, -2.4, 2.4, 4].map((x) => (<group key={x}><Box pos={[x, 1.1, -3]} size={[1.2, 2.2, 0.9]} color="#3B1F2B" /><Flat pos={[x, 1.4, -2.54]} size={[0.9, 0.6]} color={Math.sin(t * 6 + x) > 0 ? '#FFD700' : '#E84118'} /></group>))}</group>);
    case 'streetlight': return (<group><Box pos={[3.5, 2.2, -2]} size={[0.12, 4.4, 0.12]} color="#222" /><Box pos={[3.0, 4.35, -2]} size={[1.0, 0.1, 0.12]} color="#222" /><Glow pos={[2.6, 4.2, -2]} r={0.25} color={g} /></group>);
    case 'bench': return (<group><Box pos={[-1.5, 0.5, -1.8]} size={[2.6, 0.12, 0.7]} color="#5D4037" /><Box pos={[-1.5, 0.95, -2.12]} size={[2.6, 0.5, 0.08]} color="#5D4037" /><Box pos={[-2.6, 0.25, -1.8]} size={[0.1, 0.5, 0.6]} color="#222" /><Box pos={[-0.4, 0.25, -1.8]} size={[0.1, 0.5, 0.6]} color="#222" /></group>);
    case 'car': return (<group><Box pos={[-3.5, 0.6, -3]} size={[3.6, 0.8, 1.6]} color="#40739E" /><Box pos={[-3.6, 1.25, -3]} size={[2, 0.6, 1.5]} color={shade('#40739E', -0.08)} /></group>);
    default: return null;
  }
};

const BASE_PROPS: Record<Environment, Prop[]> = {
  bedroom: ['bed', 'window', 'lamp'],
  office: ['desk', 'laptop', 'chair', 'window'],
  kitchen: ['window'],
  living_room: ['sofa', 'tv', 'window', 'photo_frame'],
  hospital: ['hospital_bed', 'window'],
  classroom: ['window'],
  casino: ['slot_machine'],
  street: ['streetlight'],
  bus_stop: ['bench', 'streetlight'],
  rooftop: [],
  park: ['bench', 'streetlight'],
  void: [],
};

const OUTDOOR: Environment[] = ['street', 'bus_stop', 'rooftop', 'park', 'void'];

const Skyline: React.FC<{ tint: Tint; night: boolean; low?: boolean }> = ({ tint, night, low }) => {
  const blocks = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    return { x: -21 + i * 3.2, h: 4 + r * 9, w: 2.2 + r * 1.2, lit: Math.floor(r * 5) };
  }), []);
  const y0 = low ? -6 : 0;
  return (
    <group position={[0, y0, -16]}>
      {blocks.map((b, i) => (
        <group key={i}>
          <Box pos={[b.x, b.h / 2, 0]} size={[b.w, b.h, 2]} color={shade(tint.wall, -0.04 - (i % 3) * 0.02)} />
          {night && Array.from({ length: b.lit }, (_, k) => (
            <Flat key={k} pos={[b.x - 0.5 + (k % 2) * 1, 1.5 + k * 1.4, 1.01]} size={[0.4, 0.5]} color={tint.glow} />
          ))}
        </group>
      ))}
    </group>
  );
};

const CameraRig: React.FC<{ move: CameraMove; intensity: number; progress: number; t: number; vertical: boolean }> = ({ move, intensity, progress, t, vertical }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    const p = Easing.inOut(Easing.cubic)(progress);
    const i = intensity;
    let x = 0; let y = 1.8; let z = vertical ? 8.5 : 9; let lx = 0; let ly = 1.4; let angle = 0;
    switch (move) {
      case 'push_in': z -= 3.2 * i * p; break;
      case 'pull_out': z += -3.2 * i + 3.2 * i * p; break;
      case 'orbit_left': angle = -0.45 * i * p; break;
      case 'orbit_right': angle = 0.45 * i * p; break;
      case 'pan_left': x = 2.2 * i * (1 - 2 * p) * -1; lx = x; break;
      case 'pan_right': x = -2.2 * i * (1 - 2 * p) * -1; lx = x; break;
      case 'crane_up': y = 1.2 + 3.2 * i * p; ly = 1.4 - 0.4 * p; break;
      case 'crane_down': y = 1.2 + 3.2 * i * (1 - p); break;
      case 'shake': x = Math.sin(t * 37) * 0.06 * i; y += Math.cos(t * 29) * 0.05 * i; break;
      default: z -= 0.4 * p; break; // static: sezilmas siljish
    }
    camera.position.set(x + Math.sin(angle) * z, y, Math.cos(angle) * z);
    camera.lookAt(lx, ly, 0);
    camera.fov = vertical ? 62 : 42;
    camera.updateProjectionMatrix();
  }, [camera, move, intensity, progress, t, vertical]);
  return null;
};

export interface Room3DProps {
  environment: Environment;
  timeOfDay?: TimeOfDay;
  props?: Prop[];
  camera: { move: CameraMove; intensity?: number };
  progress: number; // 0..1 sahna ichida
}

export const Room3D: React.FC<Room3DProps> = ({ environment, timeOfDay = 'night', props = [], camera, progress }) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const t = frame / fps;
  const tint = timeTints[timeOfDay] ?? timeTints.night;
  const outdoor = OUTDOOR.includes(environment);
  const vertical = height > width;
  const all = Array.from(new Set([...(BASE_PROPS[environment] ?? []), ...props]));
  const wallTone = environment === 'hospital' ? shade('#8395A7', timeOfDay === 'night' ? -0.25 : 0) : tint.wall;
  const fade = interpolate(progress, [0, 1], [0, 1]);

  return (
    <ThreeCanvas width={width} height={height} gl={{ antialias: true }} style={{ position: 'absolute', inset: 0 }}>
      <color attach="background" args={[tint.sky]} />
      <fog attach="fog" args={[tint.fog, 10, environment === 'void' ? 18 : 34]} />
      <CameraRig move={camera.move} intensity={camera.intensity ?? 0.5} progress={fade} t={t} vertical={vertical} />
      {/* pol */}
      <Flat pos={[0, 0, 0]} size={[outdoor ? 80 : 12, outdoor ? 80 : 12]} color={tint.floor} rotX={-Math.PI / 2} />
      {!outdoor && (
        <group>
          <Flat pos={[0, 2.25, -4]} size={[12, 4.5]} color={wallTone} />
          <Flat pos={[-6, 2.25, 0]} size={[8, 4.5]} color={shade(wallTone, -0.05)} rotY={Math.PI / 2} />
          <Flat pos={[6, 2.25, 0]} size={[8, 4.5]} color={shade(wallTone, -0.07)} rotY={-Math.PI / 2} />
          {/* plintus — low-poly hissi uchun */}
          <Box pos={[0, 0.08, -3.95]} size={[12, 0.16, 0.1]} color={shade(wallTone, -0.1)} />
        </group>
      )}
      {environment === 'kitchen' && (<group><Box pos={[-3, 0.5, -3.3]} size={[5, 1, 1.2]} color={tint.object} /><Box pos={[-3, 1.03, -3.3]} size={[5.1, 0.08, 1.3]} color={tint.objectTop} /><Box pos={[2.5, 0.42, -1.5]} size={[2, 0.08, 1.2]} color={tint.objectTop} /></group>)}
      {environment === 'classroom' && (<group><Flat pos={[0.5, 2.4, -3.98]} size={[5, 1.8]} color="#1E3D2F" />{[-3, 0, 3].map((x) => <Box key={x} pos={[x, 0.75, -1]} size={[1.6, 0.08, 0.9]} color={tint.objectTop} />)}</group>)}
      {(environment === 'street' || environment === 'bus_stop' || environment === 'park') && <Skyline tint={tint} night={timeOfDay === 'night' || timeOfDay === 'dusk'} />}
      {environment === 'rooftop' && (<group><Box pos={[0, 0.4, -3.5]} size={[14, 0.8, 0.4]} color={tint.object} /><Skyline tint={tint} night={timeOfDay !== 'day'} low /></group>)}
      {environment === 'park' && [-6, 5, 8].map((x) => (
        <group key={x}><Box pos={[x, 1, -5]} size={[0.3, 2, 0.3]} color="#3E2723" /><mesh position={[x, 2.8, -5]}><icosahedronGeometry args={[1.3, 0]} /><meshBasicMaterial color={shade('#2D4A3E', timeOfDay === 'night' ? -0.1 : 0)} /></mesh></group>
      ))}
      {all.map((p) => <PropMesh key={p} prop={p} tint={tint} t={t} outdoor={outdoor} />)}
    </ThreeCanvas>
  );
};
