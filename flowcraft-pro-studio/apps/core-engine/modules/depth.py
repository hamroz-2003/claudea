"""Monocular depth for the 2.5D parallax engine.

Preferred: **Depth-Anything-V2-Small** (Apache-2.0) as ONNX, run on CPU with
onnxruntime. The ~100 MB model is downloaded once into
``<data_dir>/models/`` (or point ``FLOWCRAFT_DEPTH_MODEL`` at a local file).

Fallback when the model is unavailable: a heuristic estimate (lower in frame
= nearer, detailed/sharp regions = nearer, mild centre bias). It is much
weaker than the network but keeps the engine working fully offline.

All estimators return *nearness* in [0, 1] (1 = closest to camera) at the
image's resolution, edge-dilated and smoothed for artefact-free warping.
"""

from __future__ import annotations

import logging
import os
import urllib.request
from pathlib import Path
from typing import Optional

import numpy as np

log = logging.getLogger("flowcraft.depth")

MODEL_URL = ("https://huggingface.co/onnx-community/depth-anything-v2-small/"
             "resolve/main/onnx/model.onnx")
MODEL_INPUT = 518  # multiple of 14 (ViT patch size)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


# --------------------------------------------------------------------------- #
# Small numpy image ops (no OpenCV dependency)
# --------------------------------------------------------------------------- #

def box_blur(a: np.ndarray, r: int) -> np.ndarray:
    """Separable box blur with edge padding (O(1) per pixel via cumsum)."""
    if r <= 0:
        return a
    out = a.astype(np.float32)
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (r + 1, r)
        p = np.pad(out, pad, mode="edge")
        c = np.cumsum(p, axis=axis, dtype=np.float64)
        n = out.shape[axis]
        hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        out = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return out


def gauss_blur(a: np.ndarray, r: int) -> np.ndarray:
    """Three box passes ~= Gaussian with sigma ~ r."""
    for _ in range(3):
        a = box_blur(a, r)
    return a


def max_filter(a: np.ndarray, r: int) -> np.ndarray:
    """Grey dilation: near objects grow slightly so their silhouettes carry
    the background during warping instead of tearing."""
    out = a
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (r, r)
        p = np.pad(out, pad, mode="edge")
        n = out.shape[axis]
        acc = np.take(p, np.arange(0, n), axis=axis)
        for k in range(1, 2 * r + 1):
            acc = np.maximum(acc, np.take(p, np.arange(k, k + n), axis=axis))
        out = acc
    return out


def resize(a: np.ndarray, w: int, h: int) -> np.ndarray:
    from PIL import Image

    if a.ndim == 2:
        return np.asarray(Image.fromarray(a.astype(np.float32), mode="F").resize((w, h), Image.BICUBIC))
    return np.asarray(Image.fromarray(a).resize((w, h), Image.LANCZOS))


def _normalize(d: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(d, 2), np.percentile(d, 98)
    return np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1).astype(np.float32)


def postprocess(near: np.ndarray) -> np.ndarray:
    h, w = near.shape
    r = max(2, round(min(w, h) / 220))
    near = max_filter(near, r)
    near = gauss_blur(near, r)
    return _normalize(near)


# --------------------------------------------------------------------------- #
# Estimators
# --------------------------------------------------------------------------- #

class HeuristicDepth:
    """Planar ground-plane model: lower in frame = nearer, slight centre bias.

    Deliberately smooth: per-pixel cues (edges, sharpness) make straight
    lines wobble when warped, which reads as fake. A smooth plane gives
    clean, believable perspective parallax; the ONNX model adds true
    object separation on top.
    """

    name = "heuristic"

    def estimate(self, rgb: np.ndarray) -> np.ndarray:
        h, w, _ = rgb.shape
        yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
        xx = np.linspace(-1, 1, w, dtype=np.float32)[None, :]
        near = 0.82 * yy ** 1.4 + 0.18 * (1 - np.clip(xx ** 2, 0, 1)) * yy
        return _normalize(np.broadcast_to(near, (h, w)).astype(np.float32))


class OnnxDepth:
    name = "depth-anything-v2-small"

    def __init__(self, model_path: Path):
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        providers = [p for p in ("CUDAExecutionProvider", "CoreMLExecutionProvider",
                                 "DmlExecutionProvider", "CPUExecutionProvider")
                     if p in ort.get_available_providers()]
        self.session = ort.InferenceSession(str(model_path), opts, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    def estimate(self, rgb: np.ndarray) -> np.ndarray:
        h, w, _ = rgb.shape
        x = resize(rgb, MODEL_INPUT, MODEL_INPUT).astype(np.float32) / 255.0
        x = (x - IMAGENET_MEAN) / IMAGENET_STD
        x = x.transpose(2, 0, 1)[None].astype(np.float32)
        out = self.session.run([self.output_name], {self.input_name: x})[0]
        disp = np.squeeze(out).astype(np.float32)        # relative inverse depth: larger = nearer
        return postprocess(resize(_normalize(disp), w, h))


def ensure_model(models_dir: Path, *, download: bool = True) -> Optional[Path]:
    env = os.environ.get("FLOWCRAFT_DEPTH_MODEL")
    if env and Path(env).exists():
        return Path(env)
    path = models_dir / "depth_anything_v2_small.onnx"
    if path.exists() and path.stat().st_size > 1_000_000:
        return path
    if not download:
        return None
    models_dir.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    try:
        log.info("Downloading depth model (~100 MB) from %s", MODEL_URL)
        urllib.request.urlretrieve(MODEL_URL, tmp)
        tmp.replace(path)
        return path
    except Exception as e:  # offline, blocked, interrupted
        log.warning("Depth model download failed (%s); using heuristic depth", e)
        tmp.unlink(missing_ok=True)
        return None


def get_estimator(models_dir: Path, *, prefer_model: bool = True, download: bool = True):
    if prefer_model:
        try:
            path = ensure_model(models_dir, download=download)
            if path is not None:
                return OnnxDepth(path)
        except ImportError:
            log.warning("onnxruntime not installed; using heuristic depth")
        except Exception as e:
            log.warning("Depth model failed to load (%s); using heuristic depth", e)
    return HeuristicDepth()
