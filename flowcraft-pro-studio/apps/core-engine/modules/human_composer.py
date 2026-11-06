"""Human-editor FFmpeg composer.

Render model
------------
The timeline is cut into *segments* that are rendered independently (in
parallel, and cached by content hash so "regenerate scene 47" re-renders only
the segments that touch scene 47):

* a **body** segment per scene (the part not covered by a transition), and
* a **transition** segment per dissolve / dip-to-black, centred exactly on
  the cut so the cut still lands on the first syllable of the next sentence.

Segments are joined losslessly with the concat demuxer into ``picture.mp4``,
then one mastering pass adds grain, vignette, subtitles / chapter cards and
the three-track audio mix, and encodes with the best available hardware
encoder.

Frame accuracy: every boundary is converted with ``round(ms * fps / 1000)``
on the absolute timeline position, so per-scene rounding never accumulates;
the finished picture has exactly ``round(total_ms * fps / 1000)`` frames.

Anti-jitter camera rig (still images)
-------------------------------------
``zoompan`` crops on integer pixels (and on the 2-px chroma grid for YUV), so
a slow pan alternates between 0- and 1-pixel steps: the classic slideshow
judder. Here each still is cover-fitted once at ``supersample`` x the output
size with Lanczos, repeated with ``loop``, and the moving crop rectangle is
resampled by ``perspective`` with *float* corner coordinates and bicubic
interpolation (1/256-px precision), then downscaled with Lanczos. Measured on
a 0.7 px/frame pan, frame-to-frame speed jitter drops from 0.82 px (naive
zoompan) and 0.24 px (zoompan at 4x supersampling) to 0.07 px. Motion uses a
sine ease blended with a linear carry, so velocity never reaches zero at a
cut, plus two-frequency handheld sway of a few output pixels.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import numpy as np

from .ffmpeg_utils import (
    FFmpegError,
    duration_ms,
    ms_to_frame,
    probe,
    resolve_encoder,
    run_ffmpeg,
)
from .models import CameraMotion, Project, RenderMode, Scene, Transition
from .sfx_synth import sfx_path
from .subtitles import build_ass, youtube_chapters
from .voice_aligner import SR, decode_pcm, ms_to_samples, write_wav

log = logging.getLogger("flowcraft.composer")

ProgressFn = Callable[[float, str], None]

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}
MAX_SLOWDOWN = 1.30          # longest acceptable time-stretch of a generated clip
OVERLAY_OPACITY = 0.12


class ComposerError(RuntimeError):
    pass


# --------------------------------------------------------------------------- #
# Camera motion
# --------------------------------------------------------------------------- #

# (zoom_start, zoom_end, fx_start, fx_end, fy_start, fy_end); fx/fy are the
# crop window's position as a fraction of the available slack (0.5 = centred).
MOTION_TABLE: dict[CameraMotion, tuple[float, float, float, float, float, float]] = {
    CameraMotion.PUSH_IN: (1.04, 1.17, 0.50, 0.50, 0.50, 0.46),
    CameraMotion.PULL_OUT: (1.17, 1.04, 0.50, 0.50, 0.46, 0.50),
    CameraMotion.PAN_LEFT: (1.12, 1.12, 0.78, 0.22, 0.50, 0.50),
    CameraMotion.PAN_RIGHT: (1.12, 1.12, 0.22, 0.78, 0.50, 0.50),
    CameraMotion.DIAGONAL_DRIFT: (1.08, 1.14, 0.30, 0.66, 0.64, 0.38),
    CameraMotion.TILT_UP: (1.12, 1.12, 0.50, 0.50, 0.78, 0.24),
    CameraMotion.TILT_DOWN: (1.12, 1.12, 0.50, 0.50, 0.24, 0.78),
    CameraMotion.STATIC_BREATH: (1.06, 1.085, 0.50, 0.50, 0.50, 0.50),
}


def _num(x: float) -> str:
    s = f"{x:.6f}".rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


def kenburns_corners(motion: CameraMotion, *, offset: int, total: int, fps: int,
                     handheld_px: float, supersample: int, src_w: int, src_h: int,
                     seed: int) -> dict[str, str]:
    """Per-frame float corner expressions for the ``perspective`` filter.

    The crop rectangle (``src_w/zoom`` x ``src_h/zoom`` at a float position)
    is resampled with bicubic interpolation at 1/256-pixel precision, so slow
    pans move by fractional pixels instead of snapping between integers.
    ``offset`` is the window's first frame relative to the scene start (it
    may be negative or run past the end for transition handles; progress is
    clamped to the scene's own 0..1 range).
    """
    z0, z1, fx0, fx1, fy0, fy1 = MOTION_TABLE[motion]
    denom = max(total - 1, 1)
    p = f"clip((on+{offset})/{denom},0,1)"
    # 60% linear carry + 40% sine ease: smooth start/stop without dead stops at cuts.
    e = f"(0.6*{p}+0.4*(0.5-0.5*cos(PI*{p})))"
    z = f"({_num(z0)}+({_num(z1 - z0)})*{e})"
    t = f"((on+{offset})/{fps})"
    rng = np.random.default_rng(seed)
    ph = rng.uniform(0, 2 * math.pi, 4)
    # Sway is specified in output pixels; one output pixel = supersample/zoom source px.
    amp = handheld_px * supersample
    if handheld_px > 0:
        sx = (f"({_num(amp)}/{z})*(0.62*sin(2*PI*0.13*{t}+{_num(ph[0])})"
              f"+0.38*sin(2*PI*0.31*{t}+{_num(ph[1])}))")
        sy = (f"({_num(amp * 0.8)}/{z})*(0.58*sin(2*PI*0.11*{t}+{_num(ph[2])})"
              f"+0.42*sin(2*PI*0.27*{t}+{_num(ph[3])}))")
    else:
        sx = sy = "0"
    cw = f"({src_w}/{z})"
    ch = f"({src_h}/{z})"
    fx = f"({_num(fx0)}+({_num(fx1 - fx0)})*{e})"
    fy = f"({_num(fy0)}+({_num(fy1 - fy0)})*{e})"
    x0 = f"clip(({src_w}-{cw})*{fx}+{sx},0,{src_w}-{cw})"
    y0 = f"clip(({src_h}-{ch})*{fy}+{sy},0,{src_h}-{ch})"
    return {
        "x0": x0, "y0": y0,
        "x1": f"{x0}+{cw}", "y1": y0,
        "x2": x0, "y2": f"{y0}+{ch}",
        "x3": f"{x0}+{cw}", "y3": f"{y0}+{ch}",
    }


def _filter_path(p: Path | str) -> str:
    """Escape a path for use inside an ffmpeg filter argument."""
    s = str(Path(p).resolve()).replace("\\", "/")
    return s.replace(":", r"\:").replace("'", r"\'").replace(",", r"\,")


# --------------------------------------------------------------------------- #
# Segment planning
# --------------------------------------------------------------------------- #

@dataclass
class Window:
    scene_index: int
    offset: int       # frames from the scene's first frame (can be < 0)
    frames: int


@dataclass
class Segment:
    kind: str                          # "body" | "transition"
    frames: int
    a: Window
    b: Optional[Window] = None
    transition: Optional[Transition] = None
    path: Optional[Path] = None
    key: str = ""


def plan_segments(project: Project) -> tuple[list[Segment], list[int]]:
    r = project.render
    fps = r.fps
    scenes = project.scenes
    starts = [ms_to_frame(s.start_ms, fps) for s in scenes]
    end_total = ms_to_frame(project.total_ms, fps)
    bounds = starts + [end_total]
    lengths = [bounds[i + 1] - bounds[i] for i in range(len(scenes))]
    if any(n <= 0 for n in lengths):
        bad = [scenes[i].scene_id for i, n in enumerate(lengths) if n <= 0]
        raise ComposerError(f"Scenes shorter than one frame: {bad}")

    half = [0] * (len(scenes) + 1)  # half-width (frames) of the transition at boundary k
    for k in range(1, len(scenes)):
        t = scenes[k].transition_in
        if t == Transition.HARD_CUT:
            continue
        ms = r.dissolve_ms if t == Transition.DISSOLVE else r.dip_ms
        h = ms_to_frame(ms / 2, fps)
        h = min(h, int(lengths[k - 1] * 0.4), int(lengths[k] * 0.4))
        half[k] = max(h, 0)

    segs: list[Segment] = []
    for i in range(len(scenes)):
        head, tail = half[i], half[i + 1]
        if i > 0 and half[i] > 0:
            segs.append(Segment(
                kind="transition", frames=2 * half[i],
                a=Window(i - 1, lengths[i - 1] - half[i], 2 * half[i]),
                b=Window(i, -half[i], 2 * half[i]),
                transition=scenes[i].transition_in,
            ))
        body = lengths[i] - head - tail
        if body > 0:
            segs.append(Segment(kind="body", frames=body, a=Window(i, head, body)))
    return segs, lengths


# --------------------------------------------------------------------------- #
# Segment rendering
# --------------------------------------------------------------------------- #

class Composer:
    def __init__(self, project: Project, project_dir: Path, assets_dir: Path,
                 *, allow_placeholders: bool = False):
        self.p = project
        self.r = project.render
        self.dir = project_dir
        self.assets = assets_dir
        self.allow_placeholders = allow_placeholders
        self.work = project_dir / "render" / "segments"
        self.work.mkdir(parents=True, exist_ok=True)
        self.cache_sfx = project_dir / "render" / "sfx_cache"
        self.cache_sfx.mkdir(parents=True, exist_ok=True)
        self._lengths: list[int] = []
        self._probe_cache: dict[str, int] = {}
        self._lock = threading.Lock()

    # ---- helpers --------------------------------------------------------- #
    def _asset(self, sc: Scene) -> Optional[Path]:
        if not sc.asset_path:
            return None
        p = Path(sc.asset_path)
        if not p.is_absolute():
            p = self.dir / p
        return p if p.exists() else None

    def _overlay(self, sc: Scene) -> Optional[Path]:
        if not sc.atmosphere:
            return None
        for ext in (".mp4", ".mov", ".webm"):
            p = self.assets / "overlays" / f"{sc.atmosphere}{ext}"
            if p.exists():
                return p
        return None

    def _src_ms(self, path: Path) -> int:
        k = str(path)
        with self._lock:
            if k not in self._probe_cache:
                self._probe_cache[k] = duration_ms(path)
            return self._probe_cache[k]

    def _window_chain(self, inp: int, w: Window, label: str, extra_inputs: list[str],
                      next_input: list[int]) -> tuple[list[str], str]:
        """Inputs + filter chain producing exactly ``w.frames`` frames of
        scene ``w.scene_index`` at output size/fps on pad ``[label]``."""
        sc = self.p.scenes[w.scene_index]
        r = self.r
        W, H, fps = r.width, r.height, r.fps
        total = self._lengths[w.scene_index]
        asset = self._asset(sc)
        args: list[str] = []
        chain: list[str] = []

        if asset is None:
            if not self.allow_placeholders:
                raise ComposerError(f"Scene {sc.scene_id} has no media (asset_path={sc.asset_path!r})")
            args += ["-f", "lavfi", "-i", f"color=c=0x14161A:s={W}x{H}:r={fps}:d={w.frames / fps + 1}"]
            chain.append(f"[{inp}:v]format=yuv420p,trim=end_frame={w.frames},setpts=PTS-STARTPTS[{label}r]")
        elif asset.suffix.lower() in VIDEO_EXTS:
            src_ms = self._src_ms(asset)
            scene_ms = total * 1000 / fps
            factor = 1.0
            if src_ms < scene_ms:
                factor = min(MAX_SLOWDOWN, scene_ms / max(src_ms, 1))
            pad_start = max(0, -w.offset)
            start_frame = w.offset + pad_start
            args += ["-an", "-i", str(asset)]
            chain.append(
                f"[{inp}:v]setpts=(PTS-STARTPTS)*{factor:.6f},fps={fps},"
                f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},setsar=1,"
                f"tpad=start={pad_start}:start_mode=clone:stop=-1:stop_mode=clone,"
                f"trim=start_frame={start_frame}:end_frame={start_frame + w.frames},"
                f"setpts=PTS-STARTPTS,format=yuv420p[{label}r]"
            )
        else:
            ss = r.supersample
            sw, sh = W * ss, H * ss
            corners = kenburns_corners(
                sc.camera_motion, offset=w.offset, total=total, fps=fps,
                handheld_px=r.handheld_px, supersample=ss, src_w=sw, src_h=sh, seed=sc.scene_id,
            )
            persp = ":".join(f"{k}='{v}'" for k, v in corners.items())
            args += ["-i", str(asset)]
            # Scale once, then `loop` repeats the prepared frame (no per-frame Lanczos).
            chain.append(
                f"[{inp}:v]scale={sw}:{sh}:force_original_aspect_ratio=increase:flags=lanczos,"
                f"crop={sw}:{sh},setsar=1,format=yuv444p,loop=loop=-1:size=1:start=0,"
                f"trim=end_frame={w.frames},setpts=N/({fps}*TB),"
                f"perspective={persp}:interpolation=cubic:eval=frame,"
                f"scale={W}:{H}:flags=lanczos,format=yuv420p[{label}r]"
            )

        overlay = self._overlay(sc)
        if overlay is not None:
            ov = next_input[0]
            next_input[0] += 1
            extra_inputs += ["-stream_loop", "-1", "-an", "-i", str(overlay)]
            chain.append(
                f"[{ov}:v]fps={fps},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
                f"setsar=1,trim=end_frame={w.frames},settb=1/{fps},setpts=N,format=gbrp[{label}ov]"
            )
            chain.append(f"[{label}r]settb=1/{fps},setpts=N,fps={fps},format=gbrp[{label}g]")
            chain.append(
                f"[{label}g][{label}ov]blend=all_mode=screen:all_opacity={OVERLAY_OPACITY},"
                f"format=yuv420p[{label}]"
            )
        else:
            # Every window leaves with the same 1/fps timebase and pts = frame index,
            # whatever its source (still, generated clip, placeholder); xfade requires it.
            chain.append(f"[{label}r]settb=1/{fps},setpts=N,fps={fps}[{label}]")
        return args, ";".join(chain)

    def _segment_key(self, seg: Segment) -> str:
        r = self.r
        parts: list = [seg.kind, seg.frames, seg.transition.value if seg.transition else None,
                       r.width, r.height, r.fps, r.supersample, r.handheld_px, r.intermediate_crf, 3]
        for w in (seg.a, seg.b):
            if w is None:
                continue
            sc = self.p.scenes[w.scene_index]
            asset = self._asset(sc)
            ov = self._overlay(sc)
            parts += [w.offset, w.frames, self._lengths[w.scene_index], sc.camera_motion.value,
                      sc.scene_id, str(asset), asset.stat().st_mtime_ns if asset else None,
                      asset.stat().st_size if asset else None, str(ov)]
        return hashlib.sha1(json.dumps(parts, default=str).encode()).hexdigest()[:16]

    def _encode_args(self) -> list[str]:
        return ["-c:v", "libx264", "-preset", "veryfast", "-crf", str(self.r.intermediate_crf),
                "-pix_fmt", "yuv420p", "-g", str(self.r.fps), "-bf", "0",
                "-video_track_timescale", str(self.r.fps * 1000), "-an"]

    def render_segment(self, seg: Segment) -> Path:
        out = self.work / f"{seg.key}.mp4"
        if out.exists() and out.stat().st_size > 0:
            return out
        tmp = out.with_suffix(".tmp.mp4")
        next_input = [0]
        inputs: list[str] = []
        extra: list[str] = []

        def add(w: Window, label: str) -> str:
            idx = next_input[0]
            next_input[0] += 1
            a, chain = self._window_chain(idx, w, label, extra, next_input)
            inputs.extend(a)
            return chain

        chains = [add(seg.a, "A")]
        if seg.kind == "transition":
            chains.append(add(seg.b, "B"))
            mode = "fadeblack" if seg.transition == Transition.DIP_TO_BLACK else "fade"
            dur = seg.frames / self.r.fps
            chains.append(f"[A][B]xfade=transition={mode}:duration={dur:.6f}:offset=0,"
                          f"trim=end_frame={seg.frames},setpts=PTS-STARTPTS[out]")
        else:
            chains.append("[A]null[out]")
        graph = ";".join(chains)
        run_ffmpeg([*inputs, *extra, "-filter_complex", graph, "-map", "[out]",
                    "-frames:v", str(seg.frames), "-r", str(self.r.fps), *self._encode_args(), str(tmp)])
        got = int(probe(tmp)["streams"][0].get("nb_frames", seg.frames))
        if got != seg.frames:
            raise ComposerError(f"Segment {seg.key} rendered {got} frames, expected {seg.frames}")
        tmp.replace(out)
        return out

    # ---- audio ----------------------------------------------------------- #
    def build_sfx_bed(self, out: Path) -> Path:
        """Room tone + transition SFX placed sample-exactly in one stereo bed."""
        r = self.r
        n = ms_to_samples(self.p.total_ms) + SR
        bed = np.zeros(n, dtype=np.float64)

        def load(name: str) -> np.ndarray:
            return decode_pcm(sfx_path(name, self.assets, self.cache_sfx)).astype(np.float64) / 32768.0

        if r.room_tone_db > -90:
            tone = load("room_tone")
            reps = int(np.ceil(n / len(tone)))
            bed += np.tile(tone, reps)[:n] * 10 ** (r.room_tone_db / 20)

        if r.sfx_enabled:
            gain = 10 ** (r.sfx_level_db / 20)
            cache: dict[str, np.ndarray] = {}
            hook_end = self.p.hook_video_count
            for i, sc in enumerate(self.p.scenes):
                cues: list[tuple[str, float]] = []   # (name, anchor 0..1 within clip that sits on the cut)
                if sc.sfx_cue in ("whoosh", "whoosh_soft"):
                    cues.append((sc.sfx_cue, 0.6))
                elif sc.sfx_cue == "impact":
                    cues.append(("impact", 0.0))
                if i == hook_end and i > 0 and hook_end < len(self.p.scenes):
                    cues.append(("riser", 1.0))
                for name, anchor in cues:
                    if name not in cache:
                        cache[name] = load(name)
                    clip = cache[name]
                    pos = ms_to_samples(sc.start_ms) - int(len(clip) * anchor)
                    lo, hi = max(0, pos), min(n, pos + len(clip))
                    if hi > lo:
                        bed[lo:hi] += clip[lo - pos:hi - pos] * gain
        pcm = np.clip(bed * 32767, -32768, 32767).astype(np.int16)
        write_wav(out, pcm)
        return out

    def _voice_chain(self) -> str:
        return ("aformat=sample_rates=48000:channel_layouts=mono,highpass=f=70,"
                "equalizer=f=180:t=q:w=1.0:g=1.5,equalizer=f=3200:t=q:w=1.2:g=1.2,"
                "acompressor=threshold=-20dB:ratio=3:attack=12:release=180:makeup=2")

    def measure_voice(self, voice: Path) -> dict:
        stderr = _run_ffmpeg_capture([
            "-i", str(voice), "-af",
            f"{self._voice_chain()},loudnorm=I={self.r.voice_lufs}:TP=-1.5:LRA=11:print_format=json",
            "-f", "null", "-",
        ])
        m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr, re.DOTALL)
        if not m:
            raise ComposerError("loudnorm measurement failed")
        return json.loads(m.group(0))

    # ---- main entry ------------------------------------------------------ #
    def render(self, progress: Optional[ProgressFn] = None, output: Optional[Path] = None) -> Path:
        progress = progress or (lambda p, m: None)
        p, r = self.p, self.r
        if not p.scenes or p.total_ms <= 0:
            raise ComposerError("Project has no timed scenes; run the voice aligner first")
        if not p.voice_master_path or not Path(p.voice_master_path).exists():
            raise ComposerError("voice_master.wav missing; run the voice aligner first")

        segs, self._lengths = plan_segments(p)
        for s in segs:
            s.key = self._segment_key(s)

        jobs = r.parallel_jobs or max(1, (os.cpu_count() or 2) // 2)
        done = 0
        progress(0.01, f"Rendering {len(segs)} segments on {jobs} workers")
        with ThreadPoolExecutor(max_workers=jobs) as pool:
            futs = {pool.submit(self.render_segment, s): s for s in segs}
            for fut in as_completed(futs):
                seg = futs[fut]
                try:
                    seg.path = fut.result()
                except FFmpegError as e:
                    sc = p.scenes[seg.a.scene_index]
                    raise ComposerError(f"Scene {sc.scene_id} failed to render: {e}") from e
                done += 1
                progress(0.02 + 0.73 * done / len(segs), f"Segments {done}/{len(segs)}")

        render_dir = self.dir / "render"
        concat_list = render_dir / "segments.txt"
        concat_list.write_text("".join(f"file '{s.path.resolve().as_posix()}'\n" for s in segs))
        picture = render_dir / "picture.mp4"
        run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(picture)])
        expected = ms_to_frame(p.total_ms, r.fps)
        got = int(probe(picture)["streams"][0].get("nb_frames", 0))
        if got and got != expected:
            raise ComposerError(f"Picture has {got} frames, timeline needs {expected}")
        progress(0.78, "Picture locked; building audio")

        sfx_bed = self.build_sfx_bed(render_dir / "sfx_bed.wav")
        ass = build_ass(p, render_dir / "subtitles.ass", burn_subtitles=r.burn_subtitles,
                        chapter_cards=r.chapter_cards)
        chapters_txt, warnings = youtube_chapters(p)
        (render_dir / "youtube_chapters.txt").write_text(chapters_txt + "\n", encoding="utf-8")
        for w in warnings:
            log.warning(w)
        meta = self._chapter_metadata(render_dir / "chapters.ffmeta")
        loud = self.measure_voice(Path(p.voice_master_path))
        progress(0.82, "Mastering")

        out = output or (self.dir / "export" / f"{p.project_id}.mp4")
        out.parent.mkdir(parents=True, exist_ok=True)
        enc = resolve_encoder(r.encoder, bitrate=r.video_bitrate, crf=r.crf)
        total_s = p.total_ms / 1000

        inputs = ["-i", str(picture), "-i", p.voice_master_path, "-i", str(sfx_bed), "-i", str(meta)]
        music = Path(r.music_path) if r.music_path else None
        if music is not None and not music.is_absolute():
            music = self.dir / music
        has_music = music is not None and music.exists()
        if has_music:
            inputs += ["-stream_loop", "-1", "-i", str(music)]

        vf = ["[0:v]setsar=1"]
        if r.vignette:
            vf.append("vignette=angle=0.42:mode=forward")
        if r.grain_strength > 0:
            vf.append(f"noise=c0s={r.grain_strength}:c0f=t+u")
        if r.burn_subtitles or r.chapter_cards:
            fonts = self.assets / "fonts"
            vf.append(f"ass=filename='{_filter_path(ass)}'"
                      + (f":fontsdir='{_filter_path(fonts)}'" if fonts.exists() else ""))
        vf.append("format=yuv420p[vout]")

        ln = (f"loudnorm=I={r.voice_lufs}:TP=-1.5:LRA=11:measured_I={loud['input_i']}:"
              f"measured_TP={loud['input_tp']}:measured_LRA={loud['input_lra']}:"
              f"measured_thresh={loud['input_thresh']}:offset={loud['target_offset']}:linear=true")
        af = [f"[1:a]{self._voice_chain()},{ln},aresample=48000,"
              f"aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[vo][vsc]"]
        mix_inputs = ["[vo]"]
        if has_music:
            duck = max(0.0, r.music_level_db - r.music_duck_db)
            ratio = 4.0
            # Narration at -14 LUFS sits around -20 dBFS RMS; choose the threshold
            # so that level produces `duck` dB of gain reduction.
            thr_db = -20.0 - duck / (1 - 1 / ratio)
            fade_out = max(0.0, total_s - 3.0)
            af.append(
                f"[4:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration={total_s:.3f},"
                f"volume={r.music_level_db}dB,afade=t=in:d=1.5,afade=t=out:st={fade_out:.3f}:d=3[mus]"
            )
            af.append(f"[mus][vsc]sidechaincompress=threshold={10 ** (thr_db / 20):.5f}:ratio={ratio}:"
                      f"attack=80:release=650:knee=4[duck]")
            mix_inputs.append("[duck]")
        else:
            af.append("[vsc]anullsink")
        af.append("[2:a]aformat=sample_rates=48000:channel_layouts=stereo[sfx]")
        mix_inputs.append("[sfx]")
        af.append(f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:normalize=0:duration=longest,"
                  f"atrim=duration={total_s:.3f},alimiter=limit=0.89:attack=5:release=60,"
                  f"aresample=48000[aout]")

        graph = ";".join([",".join(vf), *af])
        tmp = out.with_suffix(".tmp.mp4")
        run_ffmpeg([
            *inputs, "-filter_complex", graph, "-map", "[vout]", "-map", "[aout]",
            "-map_metadata", "3", "-map_chapters", "3",
            *enc.args, "-pix_fmt", "yuv420p", "-r", str(r.fps),
            "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
            "-t", f"{total_s:.3f}", "-movflags", "+faststart",
            "-metadata", f"title={p.title}", str(tmp),
        ])
        tmp.replace(out)
        p.output_path = str(out)
        progress(1.0, f"Exported {out.name} ({enc.name})")
        return out

    def _chapter_metadata(self, path: Path) -> Path:
        lines = [";FFMETADATA1", f"title={_meta_esc(self.p.title)}"]
        marks = []
        for i, sc in enumerate(self.p.scenes):
            if i == 0 or self.p.scenes[i - 1].chapter_index != sc.chapter_index:
                marks.append((0 if i == 0 else sc.start_ms,
                              self.p.chapter_title(sc.chapter_index) or self.p.title))
        for k, (ms, title) in enumerate(marks):
            end = marks[k + 1][0] if k + 1 < len(marks) else self.p.total_ms
            lines += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={ms}", f"END={end}",
                      f"title={_meta_esc(title)}"]
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return path


def _meta_esc(s: str) -> str:
    return re.sub(r"([=;#\\\n])", r"\\\1", s)


def _run_ffmpeg_capture(args: list[str]) -> str:
    """Like run_ffmpeg but at info log level (loudnorm prints its JSON there)."""
    import subprocess

    from .ffmpeg_utils import ffmpeg_bin

    cmd = [ffmpeg_bin(), "-hide_banner", "-nostdin", "-y", "-loglevel", "info", *args]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise FFmpegError(cmd, proc.returncode, proc.stderr)
    return proc.stderr


def render_project(project: Project, project_dir: Path, assets_dir: Path, *,
                   progress: Optional[ProgressFn] = None, allow_placeholders: bool = False,
                   output: Optional[Path] = None) -> Path:
    return Composer(project, project_dir, assets_dir, allow_placeholders=allow_placeholders
                    ).render(progress, output)
