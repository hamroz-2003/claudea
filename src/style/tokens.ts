// Ryzon Uz vizual uslub tizimi — barcha ranglar va o'lchamlar shu yerda.
// Qoida: qahramon 100% tekis 2D (kontur va soya yo'q); muhit — yoritilmagan low-poly 3D.

export const FPS = 30;
export const LONG = { width: 1920, height: 1080 };
export const SHORT = { width: 1080, height: 1920 };
export const THUMB = { width: 1280, height: 720 };

export const palette = {
  slate: '#2F3640',
  navy: '#192A56',
  charcoal: '#1E272E',
  ink: '#000000',
  eye: '#FFFFFF',
  hero: '#FFD700',
  text: '#F5F6FA',
  muted: '#A4B0BE',
  danger: '#E84118',
};

export const hoodieColors: Record<string, string> = {
  yellow: '#FFD700',
  grey: '#7F8FA6',
  red: '#C23616',
  blue: '#40739E',
  white: '#DCDDE1',
  green: '#44BD32',
};

export const accentColors: Record<string, string> = {
  yellow: palette.hero,
  red: palette.danger,
  white: palette.text,
};

// Kun vaqti bo'yicha muhit ranglari (yoritilmagan materiallar uchun tayyor ohanglar)
export const timeTints: Record<string, { sky: string; floor: string; wall: string; wallSide: string; object: string; objectTop: string; glow: string; fog: string }> = {
  night: { sky: '#0F1626', floor: '#1E272E', wall: '#192A56', wallSide: '#15214A', object: '#2F3640', objectTop: '#3A4350', glow: '#FFE8A3', fog: '#0F1626' },
  dusk: { sky: '#2C2A4A', floor: '#2F3640', wall: '#3B3B6D', wallSide: '#323260', object: '#40475A', objectTop: '#4C5468', glow: '#FFB26B', fog: '#2C2A4A' },
  day: { sky: '#57606F', floor: '#2F3640', wall: '#485460', wallSide: '#3D4752', object: '#3C4552', objectTop: '#4B5563', glow: '#F5F6FA', fog: '#57606F' },
  dawn: { sky: '#34495E', floor: '#2F3640', wall: '#2C3E50', wallSide: '#26364A', object: '#3A4750', objectTop: '#465560', glow: '#FFD3A3', fog: '#34495E' },
};

export const fonts = {
  // Tizim shriftlari: tashqi yuklab olishsiz render barqaror bo'lishi uchun
  display: '"Arial Black", "Helvetica Neue", Arial, sans-serif',
  body: '"Helvetica Neue", Arial, sans-serif',
  mono: '"Courier New", Courier, monospace',
};

export const stickman = {
  headRadius: 46,
  limb: 18, // qo'l-oyoq qalinligi
  torsoW: 92,
  torsoH: 120,
  legLen: 110,
  armLen: 92,
};
