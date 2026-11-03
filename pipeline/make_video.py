#!/usr/bin/env python3
"""Render a narrated story video + thumbnail from an episode folder.

Episode folder layout (written by Claude each day):
    episodes/<YYYY-MM-DD>/story.md   - the narration text (plain paragraphs)
    episodes/<YYYY-MM-DD>/meta.json  - title, description, tags, thumbnail_text, ...

Outputs (same folder):
    video.mp4, thumbnail.jpg, subtitles.srt, narration.mp3

Usage:
    python3 pipeline/make_video.py episodes/2026-11-04
    python3 pipeline/make_video.py episodes/2026-11-04 --tts silent   # visual test, no voice

TTS engines (--tts):
    edge    free Microsoft neural voices (needs speech.platform.bing.com allowed)
    google  Google Cloud Text-to-Speech (needs env GOOGLE_TTS_API_KEY)
    silent  no voice; timing estimated from text (for testing visuals only)
    auto    edge -> google -> error (default)
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import colorsys
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1920, 1080
FPS = 12  # static background + subtitles; low fps keeps files small
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_SERIF_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

EDGE_VOICE = os.environ.get("EDGE_VOICE", "en-US-AvaMultilingualNeural")
GOOGLE_VOICE = os.environ.get("GOOGLE_VOICE", "en-US-Neural2-F")


# ---------------------------------------------------------------- text utils
def read_paragraphs(story_path: Path) -> list[str]:
    raw = story_path.read_text(encoding="utf-8")
    raw = re.sub(r"^#.*$", "", raw, flags=re.M)  # drop markdown headings
    paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", raw)]
    return [p for p in paras if p]


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?…])\s+(?=[\"'“A-Z0-9—-])", text)
    out: list[str] = []
    for s in parts:
        s = s.strip()
        # keep on-screen lines short
        while len(s) > 95:
            cut = s.rfind(",", 0, 90)
            if cut < 40:
                cut = s.rfind(" ", 0, 90)
            out.append(s[: cut + 1].strip())
            s = s[cut + 1 :].strip()
        if s:
            out.append(s)
    return out


def chunk_paragraphs(paras: list[str], limit: int = 1500) -> list[str]:
    """Group paragraphs into TTS-sized chunks."""
    chunks, cur = [], ""
    for p in paras:
        if cur and len(cur) + len(p) + 2 > limit:
            chunks.append(cur)
            cur = p
        else:
            cur = f"{cur}\n\n{p}" if cur else p
    if cur:
        chunks.append(cur)
    return chunks


# ---------------------------------------------------------------- tts
def tts_edge(text: str, out_mp3: Path) -> None:
    import edge_tts  # type: ignore

    async def run():
        await edge_tts.Communicate(text, EDGE_VOICE, rate="-5%").save(str(out_mp3))

    asyncio.run(run())


def tts_google(text: str, out_mp3: Path) -> None:
    key = os.environ.get("GOOGLE_TTS_API_KEY")
    if not key:
        raise RuntimeError("GOOGLE_TTS_API_KEY is not set")
    body = {
        "input": {"text": text},
        "voice": {"languageCode": GOOGLE_VOICE[:5], "name": GOOGLE_VOICE},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": 0.95},
    }
    req = urllib.request.Request(
        f"https://texttospeech.googleapis.com/v1/text:synthesize?key={key}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        out_mp3.write_bytes(base64.b64decode(json.load(r)["audioContent"]))


def tts_silent(text: str, out_mp3: Path) -> None:
    secs = max(1.0, len(text.split()) / 2.5)  # ~150 wpm
    run(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
         "-t", f"{secs:.2f}", "-q:a", "9", str(out_mp3)])


ENGINES = {"edge": tts_edge, "google": tts_google, "silent": tts_silent}


def pick_engine(name: str):
    if name != "auto":
        return name, ENGINES[name]
    probe = Path(tempfile.mkdtemp()) / "probe.mp3"
    for cand in ("edge", "google"):
        try:
            ENGINES[cand]("Test.", probe)
            return cand, ENGINES[cand]
        except Exception as e:  # noqa: BLE001
            print(f"[tts] {cand} unavailable: {e}", file=sys.stderr)
    sys.exit("No TTS engine available. Allow speech.platform.bing.com or set GOOGLE_TTS_API_KEY.")


# ---------------------------------------------------------------- media utils
def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    return float(out.strip())


def ts(sec: float, ass: bool = False) -> str:
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if ass:
        return f"{int(h)}:{int(m):02d}:{s:05.2f}"
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int((s % 1) * 1000):03d}"


# ---------------------------------------------------------------- visuals
def palette(seed: str) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    hue = int(hashlib.md5(seed.encode()).hexdigest()[:4], 16) / 0xFFFF
    dark = tuple(int(c * 255) for c in colorsys.hsv_to_rgb(hue, 0.55, 0.16))
    mid = tuple(int(c * 255) for c in colorsys.hsv_to_rgb((hue + 0.05) % 1, 0.45, 0.38))
    return dark, mid  # type: ignore[return-value]


def gradient_bg(seed: str, size=(W, H)) -> Image.Image:
    dark, mid = palette(seed)
    w, h = size
    img = Image.new("RGB", size, dark)
    glow = Image.new("L", size, 0)
    d = ImageDraw.Draw(glow)
    d.ellipse((w * 0.15, -h * 0.4, w * 1.1, h * 0.9), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(w // 6))
    img = Image.composite(Image.new("RGB", size, mid), img, glow)
    # vignette
    vig = Image.new("L", size, 0)
    ImageDraw.Draw(vig).ellipse((-w * 0.2, -h * 0.25, w * 1.2, h * 1.25), fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(w // 8))
    return Image.composite(img, Image.new("RGB", size, (0, 0, 0)), vig)


def fit_font(draw, text, path, max_w, start, min_size=28):
    size = start
    while size > min_size:
        f = ImageFont.truetype(path, size)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return ImageFont.truetype(path, min_size)


def make_background(meta: dict, out: Path) -> None:
    img = gradient_bg(meta["title"])
    d = ImageDraw.Draw(img)
    channel = meta.get("channel_name", "")
    if channel:
        f = ImageFont.truetype(FONT_BOLD, 34)
        d.text((80, 64), channel.upper(), font=f, fill=(255, 255, 255, 180))
    # title, upper area (subtitles live in lower third)
    lines = textwrap.wrap(meta["title"], 34)[:3]
    y = 300
    for ln in lines:
        f = fit_font(d, ln, FONT_SERIF_BOLD, W - 240, 72)
        tw = d.textlength(ln, font=f)
        d.text(((W - tw) / 2, y), ln, font=f, fill=(245, 236, 220))
        y += 92
    img.save(out, quality=92)


def make_thumbnail(meta: dict, out: Path) -> None:
    tw_, th_ = 1280, 720
    img = gradient_bg(meta["title"] + "thumb", (tw_, th_))
    d = ImageDraw.Draw(img)
    text = meta.get("thumbnail_text") or meta["title"]
    words = text.upper().split()
    lines = textwrap.wrap(" ".join(words), 14)[:3]
    accent = meta.get("thumbnail_accent", "#FFD400")
    y = (th_ - len(lines) * 150) / 2
    for i, ln in enumerate(lines):
        f = fit_font(d, ln, FONT_BOLD, tw_ - 120, 150, 60)
        w_ = d.textlength(ln, font=f)
        x = (tw_ - w_) / 2
        color = accent if i == len(lines) - 1 else "#FFFFFF"
        d.text((x, y), ln, font=f, fill=color, stroke_width=8, stroke_fill="#000000")
        y += 150
    # red bar for contrast
    d.rectangle((0, th_ - 26, tw_, th_), fill="#D11A2A")
    img.convert("RGB").save(out, quality=90)


# ---------------------------------------------------------------- render
ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,DejaVu Sans,58,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,3,18,0,2,160,160,110,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def build(ep: Path, engine_name: str) -> None:
    meta = json.loads((ep / "meta.json").read_text(encoding="utf-8"))
    paras = read_paragraphs(ep / "story.md")
    name, engine = pick_engine(engine_name)
    print(f"[tts] engine={name}, paragraphs={len(paras)}")

    work = Path(tempfile.mkdtemp(prefix="ep_"))
    parts, cues, t = [], [], 0.0
    gap = work / "gap.mp3"
    run(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.6", "-q:a", "9", str(gap)])
    for i, chunk in enumerate(chunk_paragraphs(paras)):
        mp3 = work / f"c{i:03d}.mp3"
        engine(chunk, mp3)
        d = duration(mp3)
        # distribute chunk duration over its sentences by character length
        sents = split_sentences(chunk.replace("\n\n", " "))
        total = sum(len(s) for s in sents) or 1
        st = t
        for s in sents:
            dur = d * len(s) / total
            cues.append((st, st + dur, s))
            st += dur
        parts += [mp3, gap]
        t += d + duration(gap)
        print(f"[tts] chunk {i + 1}: {d:.1f}s")

    lst = work / "list.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    narration = ep / "narration.mp3"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-ac", "1", "-b:a", "96k", str(narration)])

    # subtitles: SRT (uploaded as captions later if wanted) + ASS (burned in)
    with open(ep / "subtitles.srt", "w", encoding="utf-8") as f:
        for n, (a, b, s) in enumerate(cues, 1):
            f.write(f"{n}\n{ts(a)} --> {ts(b)}\n{s}\n\n")
    ass = work / "subs.ass"
    with open(ass, "w", encoding="utf-8") as f:
        f.write(ASS_HEADER.format(w=W, h=H))
        for a, b, s in cues:
            s = "\\N".join(textwrap.wrap(s.replace("{", "(").replace("}", ")"), 52))
            f.write(f"Dialogue: 0,{ts(a, True)},{ts(b, True)},Sub,,0,0,0,,{s}\n")

    bg = work / "bg.jpg"
    make_background(meta, bg)
    make_thumbnail(meta, ep / "thumbnail.jpg")

    out = ep / "video.mp4"
    run([
        "ffmpeg", "-y", "-loop", "1", "-framerate", str(FPS), "-i", str(bg), "-i", str(narration),
        "-vf", f"ass={ass}", "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage",
        "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
        "-shortest", "-movflags", "+faststart", str(out),
    ])
    mb = out.stat().st_size / 1e6
    print(f"[done] {out} {duration(out) / 60:.1f} min, {mb:.1f} MB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("episode", type=Path)
    ap.add_argument("--tts", default="auto", choices=["auto", *ENGINES])
    a = ap.parse_args()
    build(a.episode, a.tts)
