import { Config } from '@remotion/cli/config';

// WebGL (Three.js) uchun: Windows'da 'angle' eng barqaror.
// GPU'siz serverda REMOTION_GL=swangle qo'ying.
Config.setChromiumOpenGlRenderer((process.env.REMOTION_GL as 'angle' | 'swangle' | 'egl' | 'swiftshader' | 'vulkan' | 'angle-egl') || 'angle');
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setConcurrency(Number(process.env.REMOTION_CONCURRENCY) || null);
