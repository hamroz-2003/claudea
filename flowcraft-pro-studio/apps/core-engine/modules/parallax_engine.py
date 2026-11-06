"""Local 2.5D parallax engine: any still image -> living camera-move clip.

Zero cost, no GPU, no account. Used for ``ANIMATED_VIDEO`` scenes when no
generative video backend is available (or on purpose, as a house style).

How a frame is made
-------------------
1. A depth map gives every pixel a *nearness* n in [0, 1] (see ``depth.py``).
2. A virtual camera moves (dolly, truck, crane). For each output pixel the
   source position is found by inverse mapping

       src = out / s(n) + T(t) * (0.15 + 0.85 * n),
       s(n) = z0 * (1 + dz(t) * (0.25 + 0.75 * n))

   so near pixels magnify and slide more than far ones -> real parallax.
   ``n`` is re-sampled at the source position (two fixed-point iterations)
   and the depth map is edge-dilated, so foreground silhouettes stay intact.
3. Bilinear sampling from a 1.25x oversized source keeps detail when the
   camera pushes in.
4. Atmosphere (embers, dust, snow, rain, fog) is rendered as depth-layered
   particles that ride the same camera move, then additively composited.

Frames stream straight into ffmpeg (``libx264``), so memory stays flat.
"""

from __future__ import annotations

import logging
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import numpy as np

from .depth import HeuristicDepth, gauss_blur, resize
from .ffmpeg_utils import FFmpegError, ffmpeg_bin
from .models import CameraMotion

log = logging.getLogger("flowcraft.parallax")

SOURCE_OVERSAMPLE = 1.25
BASE_ZOOM = 1.12

# camera_motion -> (dolly dz, truck tx, crane ty); tx/ty in fractions of frame width.
PARALLAX_MOTION: dict[CameraMotion, tuple[float, float, float]] = {
    CameraMotion.PUSH_IN: (0.13, 0.0, 0.0),
    CameraMotion.PULL_OUT: (-0.10, 0.0, 0.0),
    CameraMotion.PAN_LEFT: (0.02, -0.075, 0.0),
    CameraMotion.PAN_RIGHT: (0.02, 0.075, 0.0),
    CameraMotion.DIAGONAL_DRIFT: (0.06, 0.05, -0.03),
    CameraMotion.TILT_UP: (0.03, 0.0, -0.06),
    CameraMotion.TILT_DOWN: (0.03, 0.0, 0.06),
    CameraMotion.STATIC_BREATH: (0.035, 0.018, 0.0),
}


def load_rgb(path: Path, w: int, h: int) -> np.ndarray:
    """Cover-fit an image to exactly w x h (centre crop), RGB uint8."""
    from PIL import Image

    im = Image.open(path).convert("RGB")
    scale = max(w / im.width, h / im.height)
    nw, nh = max(w, round(im.width * scale)), max(h, round(im.height * scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - w) // 2, (nh - h) // 2
    return np.asarray(im.crop((left, top, left + w, top + h)))


def _bilinear(img: np.ndarray, px: np.ndarray, py: np.ndarray) -> np.ndarray:
    """Bilinear RGB sampling. ``img`` must be C-contiguous float32 (h, w, 3).

    The three channels are gathered together through a 12-byte void view
    (one gather per neighbour instead of three) and all math stays float32;
    ~5x faster than naive fancy indexing at 1080p.
    """
    h, w = img.shape[:2]
    px = np.clip(px, 0, w - 1.001)
    py = np.clip(py, 0, h - 1.001)
    x0 = px.astype(np.int32)
    y0 = py.astype(np.int32)
    fx = (px - x0.astype(np.float32)).reshape(-1, 1)
    fy = (py - y0.astype(np.float32)).reshape(-1, 1)
    i00 = (y0 * w + x0).reshape(-1)
    packed = img.view(np.dtype((np.void, 12))).reshape(-1)

    def g(idx: np.ndarray) -> np.ndarray:
        return np.take(packed, idx).view(np.float32).reshape(-1, 3)

    a, b = g(i00), g(i00 + 1)
    b -= a
    b *= fx
    a += b                       # top row
    c, d = g(i00 + w), g(i00 + w + 1)
    d -= c
    d *= fx
    c += d                       # bottom row
    c -= a
    c *= fy
    a += c
    return a.reshape(px.shape + (3,))


def _nearest(img: np.ndarray, px: np.ndarray, py: np.ndarray) -> np.ndarray:
    h, w = img.shape
    xi = np.clip(np.rint(px), 0, w - 1).astype(np.int32)
    yi = np.clip(np.rint(py), 0, h - 1).astype(np.int32)
    return img[yi, xi]


def _ease(p: float) -> float:
    p = min(1.0, max(0.0, p))
    return 0.6 * p + 0.4 * (0.5 - 0.5 * math.cos(math.pi * p))


# --------------------------------------------------------------------------- #
# Particles
# --------------------------------------------------------------------------- #

@dataclass
class _ParticleStyle:
    count: int
    color: tuple[float, float, float]
    alpha: tuple[float, float]
    radius: tuple[float, float]          # px at 1080p, scaled by z
    velocity: tuple[float, float]        # frame-widths per second (vx, vy) at z=1
    wobble: float
    flicker: float
    streak: int = 0                      # vertical streak length (rain)


STYLES: dict[str, _ParticleStyle] = {
    "embers": _ParticleStyle(70, (255, 150, 60), (0.35, 0.95), (1.2, 3.6), (0.01, -0.09), 0.012, 0.6),
    "dust": _ParticleStyle(110, (235, 215, 180), (0.08, 0.28), (0.8, 2.6), (0.035, -0.004), 0.006, 0.15),
    "snow": _ParticleStyle(160, (245, 248, 255), (0.25, 0.8), (1.0, 4.2), (0.008, 0.07), 0.01, 0.0),
    "rain": _ParticleStyle(140, (200, 210, 225), (0.10, 0.28), (0.7, 1.2), (0.01, 0.55), 0.0, 0.0, streak=26),
}


def _kernel(radius: float, streak: int = 0) -> np.ndarray:
    r = max(1, int(math.ceil(radius * 2.2)))
    ry = r + streak
    y, x = np.mgrid[-ry:ry + 1, -r:r + 1].astype(np.float32)
    if streak:
        k = np.exp(-(x ** 2) / (2 * (radius * 0.6) ** 2)) * np.clip(1 - np.abs(y) / (ry + 1), 0, 1)
    else:
        k = np.exp(-(x ** 2 + y ** 2) / (2 * (radius * 0.7) ** 2))
    return k.astype(np.float32)


class ParticleField:
    def __init__(self, kind: str, w: int, h: int, fps: int, seed: int):
        self.style = STYLES[kind]
        self.w, self.h, self.fps = w, h, fps
        rng = np.random.default_rng(seed)
        n = self.style.count
        self.z = rng.uniform(0.0, 1.0, n) ** 0.7
        self.x = rng.uniform(-0.1, 1.1, n)
        self.y = rng.uniform(-0.1, 1.1, n)
        self.phase = rng.uniform(0, 2 * math.pi, n)
        self.alpha = rng.uniform(*self.style.alpha, n)
        scale = h / 1080
        radii = (self.style.radius[0] + (self.style.radius[1] - self.style.radius[0]) * self.z) * scale
        self.kernels = [_kernel(r, round(self.style.streak * scale * (0.5 + self.z[i])))
                        for i, r in enumerate(radii)]
        self.color = np.array(self.style.color, dtype=np.float32) / 255.0

    def render(self, frame: np.ndarray, t: float, cam_dx: float, cam_dy: float) -> None:
        st = self.style
        depth_speed = 0.35 + 0.65 * self.z
        xs = (self.x + st.velocity[0] * t * depth_speed
              + st.wobble * np.sin(t * 1.3 + self.phase) - cam_dx * (0.15 + 0.85 * self.z))
        ys = (self.y + st.velocity[1] * t * depth_speed * (self.w / self.h)
              + st.wobble * np.cos(t * 0.9 + self.phase) - cam_dy * (0.15 + 0.85 * self.z) * (self.w / self.h))
        xs = np.mod(xs + 0.1, 1.2) - 0.1
        ys = np.mod(ys + 0.1, 1.2) - 0.1
        flick = 1 - st.flicker * (0.5 + 0.5 * np.sin(t * 9.0 + self.phase * 3))
        for i, k in enumerate(self.kernels):
            kh, kw = k.shape
            cx, cy = int(xs[i] * self.w), int(ys[i] * self.h)
            x0, y0 = cx - kw // 2, cy - kh // 2
            x1, y1 = x0 + kw, y0 + kh
            fx0, fy0 = max(0, x0), max(0, y0)
            fx1, fy1 = min(self.w, x1), min(self.h, y1)
            if fx0 >= fx1 or fy0 >= fy1:
                continue
            sub = k[fy0 - y0:fy1 - y0, fx0 - x0:fx1 - x0]
            frame[fy0:fy1, fx0:fx1] += sub[..., None] * (self.color * self.alpha[i] * flick[i])


class Fog:
    def __init__(self, w: int, h: int, seed: int):
        rng = np.random.default_rng(seed)
        sw, sh = 96, max(8, round(96 * h / w))
        noise = gauss_blur(rng.random((sh, sw * 2)).astype(np.float32), 4)
        noise = (noise - noise.min()) / max(noise.max() - noise.min(), 1e-6)
        self.tex = np.array(resize(noise, w * 2, h), dtype=np.float32)
        self.w = w
        ramp = np.linspace(0.4, 1.0, h, dtype=np.float32)[:, None]   # thicker near the ground
        self.tex *= ramp

    def render(self, frame: np.ndarray, t: float, cam_dx: float) -> None:
        off = int((t * 0.02 + cam_dx * 0.4) * self.w) % self.w
        layer = self.tex[:, off:off + self.w][..., None] * 0.16
        frame += (1.0 - frame) * layer


# --------------------------------------------------------------------------- #
# Renderer
# --------------------------------------------------------------------------- #

class _FrameRenderer:
    """All per-clip state; ``frame(i)`` is a pure function of the frame index,
    so frames can be rendered in any order and in parallel."""

    def __init__(self, src: np.ndarray, near: np.ndarray, *, W: int, H: int, fps: int, n_frames: int,
                 motion: CameraMotion, atmosphere: Optional[str], seed: int, handheld_px: float):
        if src.dtype == np.uint8:          # shipped to workers as uint8 (4x smaller pickle)
            src = src.astype(np.float32) / 255.0
        self.src = np.ascontiguousarray(src, dtype=np.float32)
        self.near = near
        self.W, self.H, self.fps, self.n_frames = W, H, fps, n_frames
        self.Hs, self.Ws = src.shape[:2]
        self.dz, self.tx, self.ty = PARALLAX_MOTION[motion]
        self.aspect = H / W
        xs = (np.arange(W, dtype=np.float32) + 0.5) / W - 0.5
        ys = ((np.arange(H, dtype=np.float32) + 0.5) / H - 0.5) * self.aspect
        self.gx, self.gy = np.meshgrid(xs, ys)
        self.particles = ParticleField(atmosphere, W, H, fps, seed) if atmosphere in STYLES else None
        self.fog = Fog(W, H, seed) if atmosphere == "fog" else None
        rng = np.random.default_rng(seed)
        self.ph = rng.uniform(0, 2 * math.pi, 4)
        self.sway = handheld_px / W

    def _src_coords(self, n, d: float, T_x: float, T_y: float):
        if n is None:
            sx, sy = self.gx / np.float32(BASE_ZOOM), self.gy / np.float32(BASE_ZOOM)
        else:
            s = np.float32(BASE_ZOOM) * (np.float32(1) + np.float32(d) * (np.float32(0.25) + np.float32(0.75) * n))
            par = np.float32(0.15) + np.float32(0.85) * n
            sx = self.gx / s + np.float32(T_x) * par
            sy = self.gy / s + np.float32(T_y) * par
        px = (sx + np.float32(0.5)) * np.float32(self.Ws) - np.float32(0.5)
        py = (sy / np.float32(self.aspect) + np.float32(0.5)) * np.float32(self.Hs) - np.float32(0.5)
        return px, py

    def frame(self, f: int) -> bytes:
        t = f / self.fps
        e = _ease(f / (self.n_frames - 1))
        ph, sway = self.ph, self.sway
        T_x = self.tx * (e - 0.5) + sway * (0.6 * math.sin(2 * math.pi * 0.13 * t + ph[0])
                                            + 0.4 * math.sin(2 * math.pi * 0.31 * t + ph[1]))
        T_y = self.ty * (e - 0.5) + sway * (0.6 * math.sin(2 * math.pi * 0.11 * t + ph[2])
                                            + 0.4 * math.sin(2 * math.pi * 0.27 * t + ph[3]))
        d = self.dz * e if self.dz >= 0 else self.dz * e - self.dz   # pull-out starts magnified
        n = None
        for _ in range(2):   # fixed point: nearness at the *source* position
            px, py = self._src_coords(n, d, T_x, T_y)
            n = _nearest(self.near, px, py)
        px, py = self._src_coords(n, d, T_x, T_y)
        frame = _bilinear(self.src, px, py)
        if self.fog is not None:
            self.fog.render(frame, t, T_x)
        if self.particles is not None:
            self.particles.render(frame, t, T_x, T_y)
        np.clip(frame, 0, 1, out=frame)
        frame *= 255
        frame += 0.5
        return frame.astype(np.uint8).tobytes()


_WORKER: Optional[_FrameRenderer] = None


def _worker_init(kwargs: dict) -> None:
    global _WORKER
    _WORKER = _FrameRenderer(**kwargs)


def _worker_frame(f: int) -> bytes:
    assert _WORKER is not None
    return _WORKER.frame(f)


def render_parallax(image_path: Path, out_path: Path, *, duration_s: float, fps: int, width: int,
                    height: int, motion: CameraMotion = CameraMotion.PUSH_IN,
                    atmosphere: Optional[str] = None, depth_estimator=None, seed: int = 0,
                    handheld_px: float = 1.5, crf: int = 14, workers: int = 0,
                    progress: Optional[Callable[[float], None]] = None) -> Path:
    """Render a 2.5D clip. ``workers=0`` uses (cores - 1) processes."""
    import multiprocessing
    import os
    from collections import deque
    from concurrent.futures import ProcessPoolExecutor

    W, H = width, height
    Ws, Hs = round(W * SOURCE_OVERSAMPLE), round(H * SOURCE_OVERSAMPLE)
    src_u8 = load_rgb(image_path, Ws, Hs)
    estimator = depth_estimator or HeuristicDepth()
    near = estimator.estimate(src_u8)
    n_frames = max(2, round(duration_s * fps))
    kwargs = dict(src=src_u8, near=near, W=W, H=H, fps=fps, n_frames=n_frames,
                  motion=motion, atmosphere=atmosphere, seed=seed, handheld_px=handheld_px)
    n_workers = workers or max(1, min(8, (os.cpu_count() or 2) - 1))
    if W * H < 400_000 or n_frames < 24:
        n_workers = 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".tmp.mp4")
    cmd = [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
           "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
           "-movflags", "+faststart", str(tmp)]
    # The pool must exist *before* ffmpeg is spawned: forked workers would
    # otherwise inherit ffmpeg's stdin pipe and ffmpeg would never see EOF.
    pool = None
    if n_workers > 1:
        # "spawn": the engine runs jobs in threads, and forking a threaded
        # process can deadlock on locks held by other threads.
        pool = ProcessPoolExecutor(max_workers=n_workers, mp_context=multiprocessing.get_context("spawn"),
                                   initializer=_worker_init, initargs=(kwargs,))
        for _ in pool.map(int, range(n_workers)):   # force workers to start now
            pass
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        if pool is None:
            r = _FrameRenderer(**kwargs)
            frames = (r.frame(f) for f in range(n_frames))
        else:
            def ordered():
                window: deque = deque()
                nxt = 0
                while nxt < n_frames or window:
                    while nxt < n_frames and len(window) < n_workers * 2:   # bounded memory
                        window.append(pool.submit(_worker_frame, nxt))
                        nxt += 1
                    yield window.popleft().result()
            frames = ordered()
        for i, data in enumerate(frames):
            proc.stdin.write(data)
            if progress and i % 10 == 0:
                progress(i / n_frames)
        proc.stdin.close()
        err = proc.stderr.read().decode(errors="replace")
        if proc.wait() != 0:
            raise FFmpegError(cmd, proc.returncode, err)
    except BrokenPipeError:
        err = proc.stderr.read().decode(errors="replace")
        proc.wait()
        raise FFmpegError(cmd, proc.returncode or 1, err)
    finally:
        if pool is not None:
            pool.shutdown(cancel_futures=True)
        if proc.poll() is None:
            proc.kill()
    tmp.replace(out_path)
    if progress:
        progress(1.0)
    return out_path
