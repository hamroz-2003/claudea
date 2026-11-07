#!/usr/bin/env python3
"""FlowCraft 4.x assets → FlowCraft V2 Android assets.

    python3 build_assets.py <asl_4.x_assets_papkasi>

1. flowcraft-v2/tools/apply_v2.py bilan V2 modullari qo'llanadi;
2. versiya 5.0.0 qilinadi;
3. eski tovushlar (Epidemic Sound va manbasi noma'lum fayllar) olib tashlanib,
   o'rniga kod bilan yaratilgan 8 ta tovush qo'yiladi (litsenziya xavfi yo'q);
4. Android Studio qoldiqlari (dexopt) olib tashlanadi.
"""
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DST = HERE / "app" / "src" / "main" / "assets"
SR = 44100


def env(n, a, r):
    t = np.linspace(0, 1, n)
    return np.where(t < a, (t / a) ** 1.5, np.clip((1 - t) / (1 - a), 0, 1) ** r)


def norm(x, db=-3):
    return x / (np.max(np.abs(x)) or 1) * 10 ** (db / 20)


def band_noise(dur, lo, hi, seed, sweep=None):
    """Spektri vaqt bo'yicha siljiydigan shovqin (whoosh)."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR); win, hop = 2048, 512
    out = np.zeros(n + win); w = np.hanning(win); f = np.fft.rfftfreq(win, 1 / SR)
    frames = max(1, (n - win) // hop + 1)
    for k in range(frames):
        p = k / max(1, frames - 1)
        c = lo * (hi / lo) ** (np.sin(np.pi * p) ** 2 if sweep is None else sweep(p))
        mask = np.exp(-0.5 * ((np.log2(np.maximum(f, 1)) - np.log2(c)) / 0.55) ** 2)
        out[k * hop:k * hop + win] += np.fft.irfft(np.fft.rfft(rng.standard_normal(win) * w) * mask, win) * w
    return out[:n]


def click(seed=1):
    n = int(0.06 * SR); t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(n) * np.exp(-t * 180) + np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 120) * 0.6
    return norm(x, -4)


def shutter():
    a = click(2); b = click(3) * 0.8
    gap = np.zeros(int(0.07 * SR))
    return norm(np.concatenate([a, gap, b]), -4)


def pop():
    n = int(0.18 * SR); t = np.arange(n) / SR
    f = 900 * np.exp(-t * 18) + 180
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22), -4)


def popup():
    n = int(0.22 * SR); t = np.arange(n) / SR
    f = 500 + 1400 * (t / t[-1]) ** 0.6
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.15, 2.5), -5)


def whoosh(dur, lo, hi, seed):
    n = int(dur * SR)
    return norm(band_noise(dur, lo, hi, seed) * env(n, 0.55, 1.6), -3)


def riser(dur=1.6):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 120 * 7 ** (t / dur)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4
    noise = band_noise(dur, 500, 6000, 9, sweep=lambda p: p)
    return norm((tone + norm(noise, -6)) * (t / dur) ** 2.2, -3)


def write(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    st = np.stack([pcm, pcm], axis=1).reshape(-1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())


def main(src):
    src = Path(src)
    if DST.exists():
        shutil.rmtree(DST)
    subprocess.run([sys.executable, str(HERE.parent / "flowcraft-v2" / "tools" / "apply_v2.py"), str(src), str(DST)], check=True)
    loc = DST / "local.js"
    s = loc.read_text(encoding="utf-8")
    if "const VERSION='4.0.4'" in s:
        loc.write_text(s.replace("const VERSION='4.0.4'", "const VERSION='5.0.0'"), encoding="utf-8")
    shutil.rmtree(DST / "dexopt", ignore_errors=True)
    sfx = DST / "sfx"
    shutil.rmtree(sfx, ignore_errors=True)
    sfx.mkdir()
    sounds = {
        "1_whoosh_fast.wav": whoosh(0.55, 500, 4200, 11),
        "2_whoosh_soft.wav": whoosh(0.9, 260, 1800, 13) * 0.8,
        "3_whoosh_deep.wav": whoosh(0.75, 150, 1200, 17),
        "4_click.wav": click(),
        "5_shutter.wav": shutter(),
        "6_pop.wav": pop(),
        "7_popup.wav": popup(),
        "8_riser.wav": riser(),
    }
    for name, x in sounds.items():
        write(sfx / name, x)
    print(f"V2 Android assets tayyor: {DST} ({len(sounds)} ta SFX)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
