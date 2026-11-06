import subprocess

import numpy as np
import pytest

from modules.depth import HeuristicDepth, max_filter
from modules.ffmpeg_utils import probe
from modules.models import CameraMotion
from modules.parallax_engine import _bilinear, render_parallax


def _frames(path, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3).astype(np.float32)


def test_bilinear_matches_reference():
    rng = np.random.default_rng(0)
    img = rng.random((40, 50, 3)).astype(np.float32)
    px = rng.uniform(0, 48, (7, 9)).astype(np.float32)
    py = rng.uniform(0, 38, (7, 9)).astype(np.float32)
    got = _bilinear(img, px, py)
    x0, y0 = np.floor(px).astype(int), np.floor(py).astype(int)
    fx, fy = (px - x0)[..., None], (py - y0)[..., None]
    ref = (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
           + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)
    assert np.allclose(got, ref, atol=1e-5)


def test_heuristic_depth_is_smooth_ground_plane():
    d = HeuristicDepth().estimate(np.zeros((90, 160, 3), np.uint8))
    assert d.shape == (90, 160) and 0 <= d.min() and d.max() <= 1
    assert d[-1].mean() > d[0].mean()                       # bottom is nearer
    assert np.abs(np.diff(d, axis=0)).max() < 0.05           # no per-pixel bumps


def test_max_filter_dilates_without_wrapping():
    a = np.zeros((10, 10), np.float32)
    a[5, 5] = 1
    m = max_filter(a, 1)
    assert m[4:7, 4:7].min() == 1 and m.sum() == 9


@pytest.mark.parametrize("motion,atmo", [(CameraMotion.PUSH_IN, "embers"), (CameraMotion.PAN_LEFT, "fog"),
                                         (CameraMotion.TILT_UP, "snow"), (CameraMotion.PULL_OUT, None)])
def test_render_parallax_clip(tmp_path, motion, atmo):
    img = tmp_path / "in.png"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x400",
                    "-frames:v", "1", str(img)], check=True)
    out = render_parallax(img, tmp_path / "out.mp4", duration_s=1.0, fps=24, width=320, height=180,
                          motion=motion, atmosphere=atmo, seed=1)
    v = probe(out)["streams"][0]
    assert (v["width"], v["height"]) == (320, 180)
    f = _frames(out, 320, 180)
    assert len(f) == 24
    assert np.abs(f[0] - f[-1]).mean() > 2.0                 # the camera actually moves
    assert np.abs(np.diff(f, axis=0)).mean(axis=(1, 2, 3)).max() < 25   # no jumps between frames
