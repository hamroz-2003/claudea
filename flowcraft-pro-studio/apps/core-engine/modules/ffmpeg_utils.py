"""Thin, strict wrappers around the ffmpeg / ffprobe binaries."""

from __future__ import annotations

import functools
import json
import logging
import os
import platform
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

log = logging.getLogger("flowcraft.ffmpeg")


class FFmpegError(RuntimeError):
    def __init__(self, cmd: Sequence[str], returncode: int, stderr: str):
        tail = "\n".join(stderr.strip().splitlines()[-25:])
        super().__init__(f"ffmpeg failed ({returncode}): {' '.join(cmd[:6])} ...\n{tail}")
        self.cmd = list(cmd)
        self.returncode = returncode
        self.stderr = stderr


def ffmpeg_bin() -> str:
    path = os.environ.get("FLOWCRAFT_FFMPEG") or shutil.which("ffmpeg")
    if not path:
        raise FileNotFoundError("ffmpeg not found. Install it or set FLOWCRAFT_FFMPEG.")
    return path


def ffprobe_bin() -> str:
    path = os.environ.get("FLOWCRAFT_FFPROBE") or shutil.which("ffprobe")
    if not path:
        raise FileNotFoundError("ffprobe not found. Install it or set FLOWCRAFT_FFPROBE.")
    return path


def run_ffmpeg(args: Sequence[str], *, timeout: float | None = None) -> str:
    cmd = [ffmpeg_bin(), "-hide_banner", "-nostdin", "-y", "-loglevel", "error", *args]
    log.debug("ffmpeg %s", " ".join(args))
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise FFmpegError(cmd, proc.returncode, proc.stderr)
    return proc.stderr


def probe(path: str | Path) -> dict:
    cmd = [
        ffprobe_bin(), "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise FFmpegError(cmd, proc.returncode, proc.stderr)
    return json.loads(proc.stdout)


def duration_ms(path: str | Path) -> int:
    """Exact media duration in milliseconds.

    For PCM audio the duration is computed from the sample count
    (``duration_ts / sample_rate``), which is exact; otherwise the container
    duration is used.
    """
    info = probe(path)
    for st in info.get("streams", []):
        if st.get("codec_type") == "audio" and st.get("codec_name", "").startswith("pcm_"):
            ts = st.get("duration_ts")
            sr = st.get("sample_rate")
            if ts and sr:
                return round(int(ts) * 1000 / int(sr))
    dur = info.get("format", {}).get("duration")
    if dur is None:
        for st in info.get("streams", []):
            if st.get("duration"):
                dur = st["duration"]
                break
    if dur is None:
        raise ValueError(f"Cannot determine duration of {path}")
    return round(float(dur) * 1000)


def has_audio(path: str | Path) -> bool:
    return any(s.get("codec_type") == "audio" for s in probe(path).get("streams", []))


def ms_to_frame(ms: int, fps: int) -> int:
    """Frame index of a timeline position. Rounding on the *absolute* position
    (never on per-scene durations) is what keeps 150 cuts drift-free."""
    return int(round(ms * fps / 1000.0))


# --------------------------------------------------------------------------- #
# Hardware encoder detection
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class EncoderProfile:
    name: str
    args: tuple[str, ...]
    hardware: bool


def _encoder_args(name: str, *, bitrate: str, crf: int) -> tuple[str, ...]:
    if name == "h264_nvenc":
        return ("-c:v", name, "-preset", "p6", "-tune", "hq", "-rc", "vbr", "-cq", str(crf),
                "-b:v", bitrate, "-maxrate", bitrate, "-bufsize", bitrate, "-spatial-aq", "1",
                "-profile:v", "high")
    if name == "h264_videotoolbox":
        return ("-c:v", name, "-b:v", bitrate, "-profile:v", "high", "-allow_sw", "1")
    if name == "h264_amf":
        return ("-c:v", name, "-quality", "quality", "-rc", "vbr_peak", "-b:v", bitrate,
                "-maxrate", bitrate)
    if name == "h264_qsv":
        return ("-c:v", name, "-preset", "slow", "-global_quality", str(crf), "-b:v", bitrate)
    return ("-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-profile:v", "high",
            "-threads", "0")


def _candidate_encoders() -> list[str]:
    system = platform.system()
    if system == "Darwin":
        return ["h264_videotoolbox"]
    return ["h264_nvenc", "h264_amf", "h264_qsv"]


@functools.lru_cache(maxsize=1)
def available_encoders() -> tuple[str, ...]:
    """Encoders that *actually work* on this machine.

    Being listed in ``ffmpeg -encoders`` is not enough (an NVENC build on a
    machine without an NVIDIA GPU lists it too), so every candidate is probed
    with a real 16-frame test encode.
    """
    proc = subprocess.run([ffmpeg_bin(), "-hide_banner", "-encoders"], capture_output=True, text=True)
    listed = proc.stdout
    working: list[str] = []
    for name in _candidate_encoders():
        if f" {name} " not in listed:
            continue
        test = [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                "color=c=black:s=256x144:r=30:d=0.5", "-frames:v", "16", "-c:v", name,
                "-f", "null", "-"]
        try:
            ok = subprocess.run(test, capture_output=True, timeout=20).returncode == 0
        except subprocess.TimeoutExpired:
            ok = False
        if ok:
            working.append(name)
    working.append("libx264")
    return tuple(working)


def resolve_encoder(preference: str, *, bitrate: str, crf: int) -> EncoderProfile:
    available = available_encoders()
    if preference and preference != "auto":
        if preference not in available:
            log.warning("Encoder %s unavailable, falling back to %s", preference, available[0])
            preference = available[0]
        name = preference
    else:
        name = available[0]
    return EncoderProfile(name, _encoder_args(name, bitrate=bitrate, crf=crf), name != "libx264")
