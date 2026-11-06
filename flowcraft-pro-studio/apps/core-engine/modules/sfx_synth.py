"""Procedural sound-design library.

Ships zero third-party audio: whooshes, risers, impacts and room tone are
synthesised with numpy on first use (48 kHz mono WAV), so the app has no
licensing exposure. Any file the user drops into ``assets/sfx/<name>.wav``
(or .mp3/.flac) overrides the generated version.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .voice_aligner import SR, write_wav

SFX_NAMES = ("whoosh", "whoosh_soft", "riser", "impact", "room_tone")


def _stft_shaped_noise(dur: float, centers_hz: np.ndarray, width_oct: float, seed: int) -> np.ndarray:
    """Noise whose spectral band follows ``centers_hz`` over time (overlap-add)."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    win, hop = 2048, 512
    frames = max(1, (n - win) // hop + 1)
    out = np.zeros(n + win)
    window = np.hanning(win)
    freqs = np.fft.rfftfreq(win, 1 / SR)
    logf = np.log2(np.maximum(freqs, 1.0))
    for k in range(frames):
        c = centers_hz[min(len(centers_hz) - 1, int(k * len(centers_hz) / frames))]
        mask = np.exp(-0.5 * ((logf - np.log2(c)) / width_oct) ** 2)
        spec = np.fft.rfft(rng.standard_normal(win) * window) * mask
        out[k * hop:k * hop + win] += np.fft.irfft(spec, win) * window
    return out[:n]


def _env(n: int, peak: float, attack_curve: float = 2.0, release_curve: float = 2.5) -> np.ndarray:
    t = np.linspace(0, 1, n)
    rise = np.clip(t / peak, 0, 1) ** attack_curve
    fall = np.clip((1 - t) / (1 - peak), 0, 1) ** release_curve
    return np.where(t < peak, rise, fall)


def _norm(x: np.ndarray, peak_db: float = -1.0) -> np.ndarray:
    m = np.max(np.abs(x)) or 1.0
    return x / m * (10 ** (peak_db / 20))


def _reverb(x: np.ndarray, seconds: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir[0] = 1.0
    wet = np.convolve(x, ir)
    dry = np.concatenate([x, np.zeros(len(wet) - len(x))])
    return dry * 0.8 + _norm(wet, -6) * 0.35


def whoosh(dur: float = 0.9, lo: float = 350, hi: float = 3200, seed: int = 11) -> np.ndarray:
    n = int(dur * SR)
    t = np.linspace(0, 1, 64)
    centers = lo * (hi / lo) ** np.sin(np.pi * np.clip(t * 1.1, 0, 1)) ** 2
    x = _stft_shaped_noise(dur, centers, 0.55, seed) * _env(n, 0.6, 2.2, 1.6)
    return _norm(x, -3)


def riser(dur: float = 2.2, seed: int = 23) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 110 * (8 ** (t / dur))                     # 110 Hz -> 880 Hz exponential sweep
    phase = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(phase) * 0.35 + np.sin(phase * 1.5) * 0.12
    noise = _stft_shaped_noise(dur, np.geomspace(400, 6000, 64), 0.7, seed) * 0.6
    env = (t / dur) ** 2.4
    env[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
    return _norm((tone + _norm(noise, -6)) * env, -3)


def impact(dur: float = 1.8, seed: int = 37) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 38 + 30 * np.exp(-t * 9)                   # pitch-dropping sub thump
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    rng = np.random.default_rng(seed)
    click = rng.standard_normal(n) * np.exp(-t * 60)
    spec = np.fft.rfft(click)
    spec[np.fft.rfftfreq(n, 1 / SR) > 2500] = 0
    x = body + np.fft.irfft(spec, n) * 0.5
    return _norm(_reverb(x, 1.2, seed)[:n], -2)


def room_tone(dur: float = 12.0, seed: int = 41) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    brown = np.cumsum(rng.standard_normal(n))
    brown -= np.convolve(brown, np.ones(4801) / 4801, mode="same")   # remove DC wander
    spec = np.fft.rfft(brown)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spec *= 1 / (1 + (freqs / 450) ** 4)
    x = np.fft.irfft(spec, n)
    fade = int(0.5 * SR)                              # loop-friendly ends
    x[:fade] *= np.linspace(0, 1, fade)
    x[-fade:] *= np.linspace(1, 0, fade)
    return _norm(x, -6)


_GENERATORS = {
    "whoosh": lambda: whoosh(),
    "whoosh_soft": lambda: whoosh(1.3, 220, 1500, seed=13) * 0.7,
    "riser": riser,
    "impact": impact,
    "room_tone": room_tone,
}


def sfx_path(name: str, assets_dir: Path, cache_dir: Path) -> Path:
    """User asset if present, otherwise a generated (and cached) WAV."""
    for ext in (".wav", ".flac", ".mp3", ".ogg"):
        p = assets_dir / "sfx" / f"{name}{ext}"
        if p.exists():
            return p
    if name not in _GENERATORS:
        raise KeyError(f"Unknown SFX '{name}'")
    out = cache_dir / f"{name}.wav"
    if not out.exists():
        data = _GENERATORS[name]()
        write_wav(out, np.clip(data * 32767, -32768, 32767).astype(np.int16))
    return out
