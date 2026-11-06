"""Voiceover generation and millisecond-exact audio/visual alignment.

Two modes produce the same result: every scene gets ``start_ms`` / ``end_ms``
with ``scenes[i].end_ms == scenes[i+1].start_ms`` (no gaps, no overlaps), a
``speech_start_ms`` where its first syllable begins, per-word timings for
subtitles, and one ``voice_master.wav`` (48 kHz mono PCM) that the composer
lays under the picture.

**TTS mode** (``generate_tts_timeline``)
    edge-tts renders one clip per scene. Each clip is decoded to PCM, dead air
    under -45 dBFS is trimmed at both ends (30 ms safety pad), and clips are
    concatenated with breath pauses (180 ms between sentences, 450 ms between
    chapters, or the script's ``[pause:N]``). All positions are kept as
    *sample counts* and converted to ms only at the end, so 150 scenes
    accumulate zero rounding drift.

**Imported narration mode** (``align_full_audio``)
    faster-whisper transcribes the file with word timestamps; the script's
    words are aligned to the recognised words with a longest-matching-block
    sequence alignment (difflib), unmatched words are interpolated between
    anchors, and each cut is snapped to the real energy onset of the first
    syllable (5 ms analysis frames), which removes Whisper's own +/-100 ms
    timestamp jitter.

The cut for scene *i+1* lands on its first syllable; the breath pause belongs
to the end of scene *i*.
"""

from __future__ import annotations

import asyncio
import difflib
import logging
import os
import re
import subprocess
import unicodedata
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional, Sequence

import numpy as np

from .ffmpeg_utils import ffmpeg_bin
from .models import Project, Scene, WordTiming

log = logging.getLogger("flowcraft.voice")

SR = 48000
SILENCE_DB = -45.0
TRIM_PAD_MS = 30
LEAD_IN_MS = 350          # beat of silence before the first word of the film
FRAME_MS = 5              # onset-detection analysis frame

ProgressFn = Callable[[float, str], None]


# --------------------------------------------------------------------------- #
# PCM helpers
# --------------------------------------------------------------------------- #

def decode_pcm(path: str | Path, sr: int = SR) -> np.ndarray:
    """Decode any audio file to mono int16 PCM at ``sr`` Hz."""
    cmd = [ffmpeg_bin(), "-hide_banner", "-nostdin", "-loglevel", "error", "-i", str(path),
           "-vn", "-ac", "1", "-ar", str(sr), "-f", "s16le", "-acodec", "pcm_s16le", "-"]
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Cannot decode {path}: {proc.stderr.decode(errors='replace')[-400:]}")
    return np.frombuffer(proc.stdout, dtype=np.int16).copy()


def write_wav(path: str | Path, samples: np.ndarray, sr: int = SR) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(samples.astype(np.int16).tobytes())


def samples_to_ms(n: int, sr: int = SR) -> int:
    return int(round(n * 1000 / sr))


def ms_to_samples(ms: float, sr: int = SR) -> int:
    return int(round(ms * sr / 1000))


def _frame_db(samples: np.ndarray, sr: int, frame_ms: int = FRAME_MS) -> np.ndarray:
    hop = max(1, sr * frame_ms // 1000)
    n = len(samples) // hop
    if n == 0:
        return np.array([-120.0])
    x = samples[: n * hop].astype(np.float64).reshape(n, hop) / 32768.0
    rms = np.sqrt(np.mean(x * x, axis=1)) + 1e-9
    return 20 * np.log10(rms)


def trim_silence(samples: np.ndarray, sr: int = SR, threshold_db: float = SILENCE_DB,
                 pad_ms: int = TRIM_PAD_MS) -> tuple[np.ndarray, int]:
    """Trim leading/trailing audio below ``threshold_db``.

    Returns ``(trimmed, removed_leading_samples)``; the second value lets the
    caller shift word timestamps that were measured on the untrimmed clip.
    """
    db = _frame_db(samples, sr, 10)
    loud = np.where(db > threshold_db)[0]
    if loud.size == 0:
        return samples[:0], 0
    hop = sr // 100
    pad = ms_to_samples(pad_ms, sr)
    start = max(0, loud[0] * hop - pad)
    end = min(len(samples), (loud[-1] + 1) * hop + pad)
    return samples[start:end], start


def snap_to_onset(samples: np.ndarray, sr: int, t_ms: float, *, back_ms: int = 250,
                  fwd_ms: int = 220, rise_db: float = 12.0) -> int:
    """Move an approximate word start to the true speech onset.

    Finds the quietest point in ``[t - back, t + fwd]`` (the breath gap
    between sentences), then walks forward to the first frame that rises
    ``rise_db`` above that floor (or above -45 dBFS). Precision: one 5 ms frame.
    """
    lo = max(0, ms_to_samples(t_ms - back_ms, sr))
    hi = min(len(samples), ms_to_samples(t_ms + fwd_ms, sr))
    if hi - lo < sr // 50:
        return int(round(t_ms))
    db = _frame_db(samples[lo:hi], sr, FRAME_MS)
    floor_idx = int(np.argmin(db))
    floor = db[floor_idx]
    target = max(floor + rise_db, SILENCE_DB) if floor < SILENCE_DB else floor + rise_db
    for k in range(floor_idx, len(db)):
        if db[k] >= target:
            return int(round(lo * 1000 / sr + k * FRAME_MS))
    return int(round(t_ms))


# --------------------------------------------------------------------------- #
# Timeline assembly (shared by both modes)
# --------------------------------------------------------------------------- #

@dataclass
class SceneAudio:
    samples: np.ndarray                 # trimmed speech
    words: list[tuple[str, int, int]]   # (text, start_ms, end_ms) relative to trimmed clip


def assemble_timeline(project: Project, clips: Sequence[SceneAudio], master_path: Path,
                      lead_in_ms: int = LEAD_IN_MS) -> Project:
    """Concatenate per-scene speech with breath pauses and fill scene timing."""
    if len(clips) != len(project.scenes):
        raise ValueError("One audio clip per scene is required")
    parts: list[np.ndarray] = [np.zeros(ms_to_samples(lead_in_ms), dtype=np.int16)]
    cursor = len(parts[0])
    speech_starts: list[int] = []
    for sc, clip in zip(project.scenes, clips):
        speech_starts.append(cursor)
        sc.speech_start_ms = samples_to_ms(cursor)
        sc.speech_end_ms = samples_to_ms(cursor + len(clip.samples))
        base = sc.speech_start_ms
        sc.words = [WordTiming(text=t, start_ms=base + s, end_ms=base + e) for t, s, e in clip.words]
        parts.append(clip.samples)
        cursor += len(clip.samples)
        gap = np.zeros(ms_to_samples(sc.pause_after_ms), dtype=np.int16)
        parts.append(gap)
        cursor += len(gap)
    master = np.concatenate(parts)
    write_wav(master_path, master)
    total_ms = samples_to_ms(len(master))

    for i, sc in enumerate(project.scenes):
        sc.start_ms = 0 if i == 0 else samples_to_ms(speech_starts[i])
        sc.end_ms = samples_to_ms(speech_starts[i + 1]) if i + 1 < len(project.scenes) else total_ms
    project.voice_master_path = str(master_path)
    validate_timeline(project)
    return project


def validate_timeline(project: Project, min_scene_ms: int = 250) -> None:
    scenes = project.scenes
    if not scenes:
        return
    if scenes[0].start_ms != 0:
        raise AssertionError("Timeline must start at 0")
    for a, b in zip(scenes, scenes[1:]):
        if a.end_ms != b.start_ms:
            raise AssertionError(f"Gap/overlap between scene {a.scene_id} and {b.scene_id}")
    for sc in scenes:
        if sc.end_ms - sc.start_ms < min_scene_ms:
            raise AssertionError(f"Scene {sc.scene_id} shorter than {min_scene_ms} ms")


# --------------------------------------------------------------------------- #
# TTS mode (edge-tts)
# --------------------------------------------------------------------------- #

def _proxy() -> Optional[str]:
    return os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or None


async def _tts_one(text: str, voice: str, rate: str, out_path: Path, retries: int = 4
                   ) -> list[tuple[str, int, int]]:
    import edge_tts  # optional dependency

    last: Exception | None = None
    for attempt in range(retries):
        try:
            comm = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary", proxy=_proxy())
            words: list[tuple[str, int, int]] = []
            with open(out_path, "wb") as fh:
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        fh.write(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        start = chunk["offset"] // 10_000          # 100 ns ticks -> ms
                        words.append((chunk["text"], start, start + chunk["duration"] // 10_000))
            if out_path.stat().st_size == 0:
                raise RuntimeError("edge-tts returned no audio")
            return words
        except Exception as e:  # network errors are common; retry with backoff
            last = e
            await asyncio.sleep(1.5 * (2 ** attempt))
    raise RuntimeError(f"TTS failed for {out_path.name}: {last}")


async def generate_tts_timeline(project: Project, project_dir: Path,
                                progress: Optional[ProgressFn] = None, concurrency: int = 4) -> Project:
    progress = progress or (lambda p, m: None)
    audio_dir = project_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(concurrency)
    done = 0
    results: dict[int, SceneAudio] = {}

    async def work(sc: Scene) -> None:
        nonlocal done
        mp3 = audio_dir / f"scene_{sc.scene_id:03d}.mp3"
        async with sem:
            words = await _tts_one(sc.narration, project.voice, project.tts_rate, mp3)
        pcm = await asyncio.to_thread(decode_pcm, mp3)
        trimmed, lead = await asyncio.to_thread(trim_silence, pcm)
        lead_ms = samples_to_ms(lead)
        clip_ms = samples_to_ms(len(trimmed))
        adj = [(t, max(0, s - lead_ms), min(clip_ms, max(0, e - lead_ms))) for t, s, e in words]
        wav = audio_dir / f"scene_{sc.scene_id:03d}.wav"
        await asyncio.to_thread(write_wav, wav, trimmed)
        sc.voice_path = str(wav)
        results[sc.scene_id] = SceneAudio(trimmed, adj)
        done += 1
        progress(0.95 * done / len(project.scenes), f"Voice {done}/{len(project.scenes)}")

    await asyncio.gather(*(work(sc) for sc in project.scenes))
    clips = [results[sc.scene_id] for sc in project.scenes]
    assemble_timeline(project, clips, audio_dir / "voice_master.wav")
    progress(1.0, "Voice timeline ready")
    return project


def timeline_from_scene_files(project: Project, project_dir: Path) -> Project:
    """Build the timeline from existing per-scene audio (``scene.voice_path``),
    e.g. clips recorded by a human narrator one sentence at a time."""
    clips = []
    for sc in project.scenes:
        if not sc.voice_path:
            raise ValueError(f"Scene {sc.scene_id} has no voice_path")
        trimmed, _ = trim_silence(decode_pcm(sc.voice_path))
        clips.append(SceneAudio(trimmed, _even_words(sc.narration, samples_to_ms(len(trimmed)))))
    return assemble_timeline(project, clips, project_dir / "audio" / "voice_master.wav")


def _even_words(text: str, dur_ms: int) -> list[tuple[str, int, int]]:
    """Character-weighted word timing when no recogniser timing exists."""
    words = text.split()
    total = sum(len(w) + 1 for w in words) or 1
    out, t = [], 0.0
    for w in words:
        d = dur_ms * (len(w) + 1) / total
        out.append((w, int(t), int(t + d)))
        t += d
    return out


# --------------------------------------------------------------------------- #
# Imported narration mode (faster-whisper)
# --------------------------------------------------------------------------- #

def normalize_token(tok: str) -> str:
    tok = unicodedata.normalize("NFKC", tok).lower()
    tok = re.sub(r"[ʻʼ’‘`´]", "'", tok)
    tok = re.sub(r"[^\w']", "", tok)
    return tok.strip("'")


def align_words_to_scenes(scene_texts: Sequence[str], words: Sequence[tuple[str, float, float]]
                          ) -> list[tuple[float, float, list[tuple[str, float, float]]]]:
    """Map each scene's text onto recognised words.

    ``words`` are ``(text, start_s, end_s)`` from the recogniser. Returns per
    scene ``(speech_start_s, speech_end_s, scene_words)``. Robust to
    recognition errors, missing words and extra words: matching blocks
    become anchors and everything between anchors is interpolated.
    """
    script_tokens: list[str] = []
    scene_of_token: list[int] = []
    for si, text in enumerate(scene_texts):
        for raw in text.split():
            t = normalize_token(raw)
            if t:
                script_tokens.append(t)
                scene_of_token.append(si)
    rec_tokens = [normalize_token(w[0]) for w in words]
    if not script_tokens or not words:
        raise ValueError("Nothing to align")

    sm = difflib.SequenceMatcher(a=script_tokens, b=rec_tokens, autojunk=False)
    mapping: dict[int, int] = {}
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            mapping[blk.a + k] = blk.b + k
    # Fuzzy second pass inside unmatched gaps (recognition spelling errors).
    anchors = sorted(mapping.items())
    bounds = [(-1, -1)] + anchors + [(len(script_tokens), len(rec_tokens))]
    for (a0, b0), (a1, b1) in zip(bounds, bounds[1:]):
        if 1 < a1 - a0 <= 60 and 1 < b1 - b0 <= 60:
            last_bi = b0
            for ai in range(a0 + 1, a1):
                best, best_bi = 0.0, None
                for bi in range(last_bi + 1, b1):
                    r = difflib.SequenceMatcher(a=script_tokens[ai], b=rec_tokens[bi]).ratio()
                    if r > best:
                        best, best_bi = r, bi
                if best >= 0.72 and best_bi is not None:
                    mapping[ai] = best_bi
                    last_bi = best_bi
    anchors = sorted(mapping.items())
    if not anchors:
        raise ValueError("Script and audio share no words; check the language setting")

    starts = np.array([w[1] for w in words], dtype=float)
    ends = np.array([w[2] for w in words], dtype=float)

    def pos_of(ai: int) -> float:
        """Fractional recognised-word index for script token ``ai``."""
        if ai in mapping:
            return float(mapping[ai])
        prev = [(a, b) for a, b in anchors if a < ai]
        nxt = [(a, b) for a, b in anchors if a > ai]
        if prev and nxt:
            (a0, b0), (a1, b1) = prev[-1], nxt[0]
            return b0 + (b1 - b0) * (ai - a0) / (a1 - a0)
        if prev:
            a0, b0 = prev[-1]
            return min(len(words) - 1, b0 + (ai - a0))
        a1, b1 = nxt[0]
        return max(0.0, b1 - (a1 - ai))

    def time_at(pos: float, use_end: bool = False) -> float:
        arr = ends if use_end else starts
        lo = int(np.floor(pos))
        hi = min(len(arr) - 1, lo + 1)
        frac = pos - lo
        return float(arr[lo] + (arr[hi] - arr[lo]) * frac)

    out = []
    for si in range(len(scene_texts)):
        idx = [i for i, s in enumerate(scene_of_token) if s == si]
        if not idx:
            out.append((float("nan"), float("nan"), []))
            continue
        p0, p1 = pos_of(idx[0]), pos_of(idx[-1])
        scene_words = []
        for ai in idx:
            if ai in mapping:
                w = words[mapping[ai]]
                scene_words.append((w[0].strip(), w[1], w[2]))
        out.append((time_at(p0), time_at(p1, use_end=True), scene_words))

    # Fill scenes that had no tokens and force monotonic starts.
    for i, (s, e, w) in enumerate(out):
        if np.isnan(s):
            prev_e = out[i - 1][1] if i else 0.0
            out[i] = (prev_e, prev_e, w)
    return out


def _transcribe(audio_path: Path, language: str, model_size: str) -> list[tuple[str, float, float]]:
    from faster_whisper import WhisperModel  # optional dependency

    model = WhisperModel(model_size, device="auto", compute_type="auto")
    segments, _info = model.transcribe(
        str(audio_path), language=language or None, word_timestamps=True,
        vad_filter=True, beam_size=5,
    )
    words: list[tuple[str, float, float]] = []
    for seg in segments:
        for w in seg.words or []:
            words.append((w.word, float(w.start), float(w.end)))
    return words


def align_full_audio(project: Project, audio_path: Path, project_dir: Path, *,
                     model_size: str = "medium", min_scene_ms: int = 400,
                     words: Optional[list[tuple[str, float, float]]] = None,
                     progress: Optional[ProgressFn] = None) -> Project:
    """Align a single narration file to the script. ``words`` may be passed
    in (pre-computed transcription) to skip the recogniser."""
    progress = progress or (lambda p, m: None)
    pcm = decode_pcm(audio_path)
    master = project_dir / "audio" / "voice_master.wav"
    write_wav(master, pcm)
    total_ms = samples_to_ms(len(pcm))

    if words is None:
        progress(0.05, "Transcribing narration (faster-whisper)")
        words = _transcribe(audio_path, project.language, model_size)
    progress(0.7, f"Aligning {len(words)} words to {len(project.scenes)} scenes")
    aligned = align_words_to_scenes([s.narration for s in project.scenes], words)

    cuts: list[int] = []
    for i, (start_s, end_s, sw) in enumerate(aligned):
        sc = project.scenes[i]
        onset = snap_to_onset(pcm, SR, start_s * 1000) if i else int(round(start_s * 1000))
        sc.speech_start_ms = onset
        sc.speech_end_ms = int(round(end_s * 1000))
        sc.words = [WordTiming(text=t, start_ms=int(round(s * 1000)), end_ms=int(round(e * 1000)))
                    for t, s, e in sw]
        cuts.append(onset)

    # Monotonic, minimum-length cut list; scene 0 always starts at 0.
    cuts[0] = 0
    for i in range(1, len(cuts)):
        cuts[i] = max(cuts[i], cuts[i - 1] + min_scene_ms)
    overflow = cuts[-1] + min_scene_ms - total_ms
    if overflow > 0:
        raise ValueError("Narration is shorter than the script; alignment impossible")
    for i, sc in enumerate(project.scenes):
        sc.start_ms = cuts[i]
        sc.end_ms = cuts[i + 1] if i + 1 < len(cuts) else total_ms
        sc.speech_start_ms = max(sc.speech_start_ms, sc.start_ms)
        sc.speech_end_ms = min(max(sc.speech_end_ms, sc.speech_start_ms), sc.end_ms)
    project.voice_master_path = str(master)
    validate_timeline(project, min_scene_ms=min_scene_ms)
    progress(1.0, "Alignment complete")
    return project
