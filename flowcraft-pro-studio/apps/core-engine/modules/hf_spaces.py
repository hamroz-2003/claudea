"""Free image-to-video on Hugging Face Spaces (ZeroGPU), per-user quota.

Each user signs in with *their own* Hugging Face account (a free Read token).
ZeroGPU then bills the GPU seconds to that user's free daily allowance, so
the app costs nobody anything and no account sharing or rotation happens.
When the allowance runs out the caller falls back to the local parallax
engine and the report says so; the allowance refills daily.

The default preset is ``zerogpu-aoti/wan2-2-fp8da-aoti-faster``: Wan 2.2
14B image-to-video with a Lightning LoRA, 832x480 at 16 fps, up to 5 s.
Spaces change, so presets are data and ``custom`` lets the user point at
any Space whose endpoint takes (image, prompt, ...).
"""

from __future__ import annotations

import logging
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

log = logging.getLogger("flowcraft.hf")


class HFSpaceError(RuntimeError):
    pass


class HFQuotaExceeded(HFSpaceError):
    """The signed-in user's free ZeroGPU allowance is used up for now."""


@dataclass(frozen=True)
class SpacePreset:
    space: str
    api_name: str
    max_seconds: float
    min_seconds: float
    build_args: Callable[..., list]
    note: str


def _wan22_args(image, prompt: str, negative: str, seconds: float, seed: int, steps: int) -> list:
    # (input_image, prompt, steps, negative_prompt, duration_seconds,
    #  guidance_scale, guidance_scale_2, seed, randomize_seed)
    return [image, prompt, steps, negative, seconds, 1, 1, seed, False]


PRESETS: dict[str, SpacePreset] = {
    "wan22_fast": SpacePreset(
        space="zerogpu-aoti/wan2-2-fp8da-aoti-faster", api_name="/generate_video",
        max_seconds=5.0, min_seconds=0.5, build_args=_wan22_args,
        note="Wan 2.2 14B I2V (Lightning), 832x480, 16 fps",
    ),
}

QUOTA_MARKERS = ("exceeded your", "zerogpu quota", "runs limit", "gpu quota", "quota exceeded")


def space_url(space: str) -> str:
    """Direct Space URL. Using it (instead of the repo id) avoids an extra
    huggingface.co API round-trip on every call."""
    if space.startswith("http"):
        return space.rstrip("/")
    sub = space.lower().replace("/", "-").replace("_", "-").replace(".", "-")
    return f"https://{sub}.hf.space"


class HFSpaceVideo:
    def __init__(self, token: Optional[str], preset: str = "wan22_fast", space: Optional[str] = None,
                 steps: int = 6, client_factory: Optional[Callable[..., Any]] = None):
        if preset not in PRESETS:
            raise HFSpaceError(f"Unknown preset {preset}; choose from {sorted(PRESETS)}")
        self.preset = PRESETS[preset]
        self.space = space or self.preset.space
        self.token = token or None
        self.steps = steps
        self._factory = client_factory
        self._client = None

    def _connect(self):
        if self._client is None:
            try:
                if self._factory is not None:
                    self._client = self._factory(space_url(self.space), token=self.token)
                else:
                    import inspect

                    from gradio_client import Client

                    # gradio_client 2.x calls it `token`, 1.x `hf_token`.
                    params = inspect.signature(Client.__init__).parameters
                    kw = "token" if "token" in params else "hf_token"
                    self._client = Client(space_url(self.space), verbose=False, **{kw: self.token})
            except Exception as e:
                raise HFSpaceError(f"Cannot reach Space {self.space}: {e}") from e
        return self._client

    def generate(self, image: Path, prompt: str, dest: Path, *, seconds: float, seed: int,
                 negative: str = "") -> Path:
        from gradio_client import handle_file

        client = self._connect()
        secs = max(self.preset.min_seconds, min(self.preset.max_seconds, seconds))
        args = self.preset.build_args(handle_file(str(image)), prompt, negative, secs, seed, self.steps)
        t0 = time.time()
        try:
            result = client.predict(*args, api_name=self.preset.api_name)
        except Exception as e:
            msg = str(e)
            if any(m in msg.lower() for m in QUOTA_MARKERS):
                raise HFQuotaExceeded(msg[:300]) from e
            raise HFSpaceError(f"{self.space}: {msg[:400]}") from e
        video = result[0] if isinstance(result, (list, tuple)) else result
        if isinstance(video, dict):
            video = video.get("video") or video.get("path")
        if not video or not Path(video).exists():
            raise HFSpaceError(f"{self.space} returned no video file ({result!r:.200})")
        dest = dest.with_suffix(Path(video).suffix or ".mp4")
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(video, dest)
        log.info("HF %s: %.1fs clip in %.0fs", self.space, secs, time.time() - t0)
        return dest
