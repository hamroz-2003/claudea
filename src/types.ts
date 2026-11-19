// content/episode.schema.json bilan mos tiplar
export type Emotion = 'neutral' | 'sad' | 'anxious' | 'angry' | 'happy' | 'tired' | 'shocked' | 'determined' | 'ashamed' | 'hopeful';
export type Environment = 'bedroom' | 'office' | 'kitchen' | 'street' | 'bus_stop' | 'rooftop' | 'hospital' | 'void' | 'living_room' | 'casino' | 'park' | 'classroom';
export type TimeOfDay = 'night' | 'day' | 'dusk' | 'dawn';
export type Pose = 'stand' | 'walk' | 'run' | 'sit' | 'slump' | 'reach' | 'kneel' | 'lie' | 'hug' | 'look_phone' | 'head_in_hands';
export type Prop = 'phone' | 'clock' | 'door' | 'bed' | 'desk' | 'laptop' | 'window' | 'bottle' | 'calendar' | 'chair' | 'sofa' | 'tv' | 'lamp' | 'streetlight' | 'bench' | 'slot_machine' | 'cards' | 'photo_frame' | 'hospital_bed' | 'car';
export type Sfx = 'clock_tick' | 'hum' | 'footsteps' | 'ui_click' | 'heartbeat' | 'rain' | 'door' | 'notification' | 'wind' | 'crowd';
export type CameraMove = 'static' | 'push_in' | 'pull_out' | 'orbit_left' | 'orbit_right' | 'pan_left' | 'pan_right' | 'crane_up' | 'crane_down' | 'shake';

export interface CastMember { id: string; label?: string; hoodie: string; scale?: number }

export interface SceneCharacter {
  castId: string;
  pose: Pose;
  emotion: Emotion;
  x?: number;
  toX?: number;
  facing?: 'left' | 'right';
}

export interface Scene {
  id: string;
  beat: string;
  durationSec: number;
  environment: Environment;
  timeOfDay?: TimeOfDay;
  camera: { move: CameraMove; intensity?: number };
  characters: SceneCharacter[];
  props?: Prop[];
  caption?: { text: string; style: 'title' | 'thought' | 'counter' | 'whisper' | 'message' };
  sfx?: Sfx[];
  music?: 'none' | 'pad_low' | 'pad_hope' | 'pulse';
  transition?: 'cut' | 'fade' | 'flash' | 'blackout';
  notes?: string;
  chapter?: string;
}

export interface Episode {
  slug: string;
  series: string;
  episodeNumber?: number;
  pillar: string;
  format: 'long' | 'short';
  title: string;
  description: string;
  tags: string[];
  logline: string;
  realProblem?: string;
  sensitive?: boolean;
  cast: CastMember[];
  thumbnail: {
    text: string;
    subtext?: string;
    emotion: Emotion;
    environment: Environment;
    timeOfDay?: TimeOfDay;
    accent?: 'yellow' | 'red' | 'white';
  };
  scenes: Scene[];
  shortScenes?: string[];
}

export interface EpisodeProps {
  episode: Episode;
  [key: string]: unknown;
}
