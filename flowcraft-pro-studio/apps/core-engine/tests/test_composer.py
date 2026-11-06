import json
import subprocess
from pathlib import Path

import numpy as np
import pytest

from modules.ffmpeg_utils import ms_to_frame, probe
from modules.human_composer import kenburns_corners, plan_segments, render_project
from modules.models import CameraMotion, RenderMode, Transition
from modules.prompt_director import plan_matrix
from modules.voice_aligner import SR, SceneAudio, assemble_timeline

from conftest import make_project

ASSETS = Path(__file__).resolve().parents[3] / "assets"


def timed_project(tmp_path, **render):
    p = make_project(**render)
    plan_matrix(p)
    rng = np.random.default_rng(3)
    clips = []
    for _ in p.scenes:
        t = np.arange(int(rng.uniform(0.9, 1.6) * SR)) / SR
        clips.append(SceneAudio((np.sin(2 * np.pi * 200 * t) * 9000).astype(np.int16), []))
    assemble_timeline(p, clips, tmp_path / "audio" / "voice_master.wav")
    return p


def test_segments_cover_every_frame_exactly(tmp_path):
    p = timed_project(tmp_path, fps=60)
    p.scenes[3].transition_in = Transition.DISSOLVE
    segs, lengths = plan_segments(p)
    assert sum(s.frames for s in segs) == ms_to_frame(p.total_ms, 60) == sum(lengths)
    kinds = [s.transition for s in segs if s.kind == "transition"]
    assert Transition.DISSOLVE in kinds and Transition.DIP_TO_BLACK in kinds
    # transitions are centred on the cut
    for s in segs:
        if s.kind == "transition":
            assert s.b.offset == -s.frames // 2


def test_corners_are_float_expressions():
    c = kenburns_corners(CameraMotion.PAN_RIGHT, offset=-5, total=120, fps=60, handheld_px=2.5,
                         supersample=2, src_w=3840, src_h=2160, seed=4)
    assert set(c) == {"x0", "y0", "x1", "y1", "x2", "y2", "x3", "y3"}
    assert "clip((on+-5)/119,0,1)" in c["x0"]


@pytest.mark.slow
def test_end_to_end_render(tmp_path):
    p = timed_project(tmp_path, width=320, height=180, fps=24, supersample=1, parallel_jobs=4)
    media = tmp_path / "media"
    media.mkdir()
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=800x600:d=1",
                    "-frames:v", "1", str(media / "still.png")], check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=24:d=1",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(media / "clip.mp4")], check=True)
    for s in p.scenes:
        s.asset_path = "media/clip.mp4" if s.render_mode == RenderMode.ANIMATED_VIDEO else "media/still.png"
    out = render_project(p, tmp_path, ASSETS)
    info = probe(out)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next(s for s in info["streams"] if s["codec_type"] == "audio")
    frames = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v",
                             "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(out)],
                            capture_output=True, text=True).stdout.strip()
    assert int(frames) == ms_to_frame(p.total_ms, 24)
    assert (v["width"], v["height"]) == (320, 180)
    assert abs(float(a["duration"]) - p.total_ms / 1000) < 0.05
    assert (tmp_path / "render" / "youtube_chapters.txt").read_text().startswith("0:00 ")
    # cached segments are reused on a second render
    before = {f.name for f in (tmp_path / "render" / "segments").glob("*.mp4")}
    render_project(p, tmp_path, ASSETS)
    after = {f.name for f in (tmp_path / "render" / "segments").glob("*.mp4")}
    assert before == after


@pytest.mark.slow
def test_transitions_between_mixed_sources(tmp_path):
    """Dissolve / dip between a still, a generated clip and a placeholder slate."""
    p = timed_project(tmp_path, width=320, height=180, fps=30, supersample=1, parallel_jobs=4)
    media = tmp_path / "media"
    media.mkdir()
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=800x600:d=1",
                    "-frames:v", "1", str(media / "still.png")], check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=24:d=1",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(media / "clip.mp4")], check=True)
    for i, s in enumerate(p.scenes):
        s.asset_path = ["media/still.png", "media/clip.mp4", None][i % 3]
        if i:
            s.transition_in = [Transition.DISSOLVE, Transition.DIP_TO_BLACK][i % 2]
    out = render_project(p, tmp_path, ASSETS, allow_placeholders=True)
    frames = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v",
                             "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(out)],
                            capture_output=True, text=True).stdout.strip()
    assert int(frames) == ms_to_frame(p.total_ms, 30)


@pytest.mark.slow
def test_atmosphere_overlay_blend(tmp_path):
    p = timed_project(tmp_path, width=320, height=180, fps=30, supersample=1, parallel_jobs=4)
    p.scenes = p.scenes[:3]
    p.scenes[-1].end_ms = p.scenes[-1].start_ms + 1500
    assets = tmp_path / "assets"
    (assets / "overlays").mkdir(parents=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "cellauto=s=320x180:r=25", "-t", "0.7",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(assets / "overlays" / "dust.mp4")], check=True)
    media = tmp_path / "media"
    media.mkdir()
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x334455:s=640x360",
                    "-frames:v", "1", str(media / "still.png")], check=True)
    for s in p.scenes:
        s.asset_path = "media/still.png"
        s.atmosphere = "dust"
    p.scenes[1].transition_in = Transition.DISSOLVE
    out = render_project(p, tmp_path, assets)
    frames = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v",
                             "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(out)],
                            capture_output=True, text=True).stdout.strip()
    assert int(frames) == ms_to_frame(p.total_ms, 30)
