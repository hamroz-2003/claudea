"""Free media generation for every scene (replaces the paid/Flow path).

Stills (``CINEMATIC_IMAGE`` and the start frame of animated scenes):
    * ``comfyui``      - local open models (FLUX.1 schnell, SDXL ...) on the user's GPU
    * ``pollinations`` - free hosted image API, no account needed
    * ``manual``       - user drops ``media/NNN.png`` files in (any source)

Clips (``ANIMATED_VIDEO``), always animated *from the scene's still* so the
hook matches the look and characters of the rest of the film:
    * ``hf_space`` - Wan 2.2 on Hugging Face ZeroGPU with the *user's own*
                     free account (works from a phone, no GPU needed)
    * ``comfyui``  - local image-to-video (Wan 2.1/2.2, LTX-Video ...)
    * ``parallax`` - built-in 2.5D depth parallax + atmosphere; CPU-only,
                     unlimited, always available. Also the automatic fallback
                     whenever ComfyUI is down or a generation fails.

Every result lands in ``media/NNN.png`` / ``media/NNN.mp4`` and the project
picks it up through :func:`pipeline.attach_media`.
"""

from __future__ import annotations

import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from pydantic import BaseModel, Field

from .comfyui_client import ComfyUIClient, ComfyUIError, frames_for
from .depth import get_estimator
from .hf_spaces import HFQuotaExceeded, HFSpaceError, HFSpaceVideo
from .models import Project, RenderMode, Scene
from .parallax_engine import render_parallax

log = logging.getLogger("flowcraft.media")

ProgressFn = Callable[[float, str], None]
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")
VIDEO_EXTS = (".mp4", ".mov", ".webm")

DEFAULT_NEGATIVE = ("plastic skin, airbrushed, oversaturated, glowing, cgi render, 3d render, "
                    "watermark, signature, text artifacts, extra fingers, deformed hands, blurry")


class MediaSettings(BaseModel):
    image_backend: str = Field("manual", pattern=r"^(manual|comfyui|pollinations)$")
    video_backend: str = Field("parallax", pattern=r"^(parallax|comfyui|hf_space)$")
    hf_token: Optional[str] = None            # the user's own free HF "Read" token
    hf_preset: str = "wan22_fast"
    hf_space: Optional[str] = None            # override the preset's Space id / URL
    hf_steps: int = Field(6, ge=2, le=12)
    comfyui_url: str = "http://127.0.0.1:8188"
    image_workflow: Optional[str] = None      # API-format workflow JSON with placeholders
    video_workflow: Optional[str] = None
    video_fps: int = Field(16, ge=8, le=60)   # model native fps (Wan 16, LTX 24)
    frame_step: int = Field(4, ge=1, le=16)   # frames = step*n + 1 (Wan 4, LTX 8)
    max_clip_s: float = Field(8.0, ge=2, le=20)
    negative_prompt: str = DEFAULT_NEGATIVE
    pollinations_url: str = "https://image.pollinations.ai/prompt/"
    pollinations_model: str = "flux"
    pollinations_token: Optional[str] = None
    pollinations_interval_s: float = Field(6.0, ge=0)
    depth_model: bool = True                  # download Depth-Anything-V2-Small for parallax
    parallax_fps: int = Field(30, ge=24, le=60)


@dataclass
class MediaReport:
    images: list[int] = field(default_factory=list)
    videos: list[int] = field(default_factory=list)
    parallax_fallbacks: list[int] = field(default_factory=list)
    hf_quota_exhausted: bool = False
    skipped: list[int] = field(default_factory=list)
    errors: dict[int, str] = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {"images": self.images, "videos": self.videos, "parallax_fallbacks": self.parallax_fallbacks,
                "hf_quota_exhausted": self.hf_quota_exhausted,
                "skipped": self.skipped, "errors": {str(k): v for k, v in self.errors.items()}}


def _existing(media: Path, stem: str, exts: tuple[str, ...]) -> Optional[Path]:
    return next((media / f"{stem}{e}" for e in exts if (media / f"{stem}{e}").exists()), None)


class PollinationsImages:
    """Free hosted text-to-image. No account required (a free token raises limits)."""

    def __init__(self, s: MediaSettings):
        self.s = s
        self._last = 0.0

    def generate(self, prompt: str, dest: Path, *, width: int, height: int, seed: int) -> Path:
        wait = self.s.pollinations_interval_s - (time.time() - self._last)
        if wait > 0:
            time.sleep(wait)
        q = {"width": width, "height": height, "seed": seed, "model": self.s.pollinations_model,
             "nologo": "true", "private": "true", "enhance": "false"}
        url = self.s.pollinations_url + urllib.parse.quote(prompt[:1800], safe="") + "?" + urllib.parse.urlencode(q)
        headers = {"User-Agent": "FlowCraftProStudio/0.3"}
        if self.s.pollinations_token:
            headers["Authorization"] = f"Bearer {self.s.pollinations_token}"
        last: Exception | None = None
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=180) as r:
                    ctype = r.headers.get("Content-Type", "")
                    data = r.read()
                self._last = time.time()
                if not ctype.startswith("image/") or len(data) < 2048:
                    raise RuntimeError(f"unexpected response ({ctype}, {len(data)} bytes)")
                ext = ".jpg" if "jpeg" in ctype else ".png" if "png" in ctype else ".webp"
                out = dest.with_suffix(ext)
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(data)
                return out
            except (urllib.error.URLError, RuntimeError, TimeoutError) as e:
                last = e
                code = getattr(e, "code", None)
                time.sleep(20 if code == 429 else 3 * (attempt + 1))
        raise RuntimeError(f"Pollinations failed: {last}")


class MediaFetcher:
    def __init__(self, settings: MediaSettings, models_dir: Path):
        self.s = settings
        self.models_dir = models_dir
        self._comfy: Optional[ComfyUIClient] = None
        self._poll: Optional[PollinationsImages] = None
        self._depth = None
        self._hf: Optional[HFSpaceVideo] = None
        self.hf_quota_exhausted = False

    @property
    def comfy(self) -> ComfyUIClient:
        if self._comfy is None:
            self._comfy = ComfyUIClient(self.s.comfyui_url)
        return self._comfy

    @property
    def depth(self):
        if self._depth is None:
            self._depth = get_estimator(self.models_dir, prefer_model=self.s.depth_model)
            log.info("Parallax depth: %s", self._depth.name)
        return self._depth

    # ---- stills ------------------------------------------------------------ #
    def make_image(self, project: Project, sc: Scene, media: Path) -> Optional[Path]:
        r = project.render
        dest = media / f"{sc.scene_id:03d}"
        prompt = sc.image_prompt or sc.narration
        if self.s.image_backend == "comfyui":
            if not self.s.image_workflow:
                raise ComfyUIError("No image workflow configured")
            # Generate near 1 MP at the project's aspect; the composer upscales with Lanczos.
            w, h = (1344, 768) if r.width >= r.height else (768, 1344)
            return self.comfy.run(Path(self.s.image_workflow), {
                "PROMPT": prompt, "NEGATIVE": self.s.negative_prompt, "SEED": 1000 + sc.scene_id,
                "WIDTH": w, "HEIGHT": h, "PREFIX": f"flowcraft/{project.project_id}/{sc.scene_id:03d}",
            }, dest, want_video=False)
        if self.s.image_backend == "pollinations":
            if self._poll is None:
                self._poll = PollinationsImages(self.s)
            w, h = (1920, 1080) if r.width >= r.height else (1080, 1920)
            return self._poll.generate(prompt, dest, width=w, height=h, seed=1000 + sc.scene_id)
        return None   # manual

    # ---- clips ------------------------------------------------------------- #
    def _clip_seconds(self, sc: Scene) -> float:
        dur = sc.duration_ms / 1000 if sc.end_ms > sc.start_ms else 6.0
        return min(self.s.max_clip_s, dur + 0.6)    # small handle for dissolves

    def make_parallax(self, project: Project, sc: Scene, still: Path, media: Path) -> Path:
        r = project.render
        return render_parallax(
            still, media / f"{sc.scene_id:03d}.mp4", duration_s=self._clip_seconds(sc),
            fps=min(r.fps, self.s.parallax_fps), width=r.width, height=r.height,
            motion=sc.camera_motion, atmosphere=sc.atmosphere, depth_estimator=self.depth,
            seed=sc.scene_id,
        )

    def make_clip(self, project: Project, sc: Scene, still: Path, media: Path) -> tuple[Path, bool]:
        """Returns (path, used_fallback)."""
        if self.s.video_backend == "hf_space" and not self.hf_quota_exhausted:
            try:
                if self._hf is None:
                    self._hf = HFSpaceVideo(self.s.hf_token, self.s.hf_preset, self.s.hf_space, self.s.hf_steps)
                prompt = f"{sc.motion_prompt}. {sc.scene_description}".strip(". ") or "subtle cinematic motion"
                out = self._hf.generate(still, prompt, media / f"{sc.scene_id:03d}",
                                        seconds=self._clip_seconds(sc), seed=2000 + sc.scene_id,
                                        negative=self.s.negative_prompt + ", morphing, flicker, text")
                return out, False
            except HFQuotaExceeded as e:
                # Stop calling HF for the rest of this batch; quota refills daily.
                self.hf_quota_exhausted = True
                log.warning("HF ZeroGPU quota exhausted (%s); remaining clips use parallax", e)
            except HFSpaceError as e:
                log.warning("Scene %d: HF Space failed (%s); using parallax", sc.scene_id, e)
        if self.s.video_backend == "comfyui":
            try:
                if not self.s.video_workflow:
                    raise ComfyUIError("No video workflow configured")
                r = project.render
                w, h = (832, 480) if r.width >= r.height else (480, 832)
                secs = self._clip_seconds(sc)
                out = self.comfy.run(Path(self.s.video_workflow), {
                    "PROMPT": f"{sc.motion_prompt}. {sc.scene_description}".strip(". "),
                    "NEGATIVE": self.s.negative_prompt + ", morphing, warping, flicker, sudden cuts",
                    "SEED": 2000 + sc.scene_id, "WIDTH": w, "HEIGHT": h,
                    "FRAMES": frames_for(secs, self.s.video_fps, self.s.frame_step), "FPS": self.s.video_fps,
                    "PREFIX": f"flowcraft/{project.project_id}/{sc.scene_id:03d}",
                }, media / f"{sc.scene_id:03d}", want_video=True, image=still)
                if out.suffix.lower() not in VIDEO_EXTS:
                    raise ComfyUIError(f"Unsupported clip format {out.suffix}; save as mp4/webm")
                return out, False
            except ComfyUIError as e:
                log.warning("Scene %d: ComfyUI video failed (%s); using parallax", sc.scene_id, e)
        return self.make_parallax(project, sc, still, media), self.s.video_backend in ("comfyui", "hf_space")

    # ---- orchestration ----------------------------------------------------- #
    def generate(self, project: Project, project_dir: Path, *, scene_ids: Optional[set[int]] = None,
                 images: bool = True, videos: bool = True, overwrite: bool = False,
                 progress: Optional[ProgressFn] = None) -> MediaReport:
        progress = progress or (lambda p, m: None)
        media = project_dir / "media"
        media.mkdir(parents=True, exist_ok=True)
        report = MediaReport()
        targets = [s for s in project.scenes if scene_ids is None or s.scene_id in scene_ids]
        steps = max(1, len(targets) * (int(images) + int(videos)))
        done = 0

        if images:
            for sc in targets:
                stem = f"{sc.scene_id:03d}"
                if _existing(media, stem, IMAGE_EXTS) and not overwrite:
                    done += 1
                    continue
                try:
                    out = self.make_image(project, sc, media)
                    if out is None:
                        report.skipped.append(sc.scene_id)
                    else:
                        for old in media.glob(f"{stem}.*"):     # one still per scene
                            if old.suffix.lower() in IMAGE_EXTS and old != out:
                                old.unlink()
                        report.images.append(sc.scene_id)
                except Exception as e:
                    report.errors[sc.scene_id] = f"image: {e}"
                done += 1
                progress(done / steps, f"Still {stem} ({self.s.image_backend})")

        if videos:
            for sc in targets:
                stem = f"{sc.scene_id:03d}"
                if sc.render_mode != RenderMode.ANIMATED_VIDEO:
                    done += 1
                    continue
                if _existing(media, stem, VIDEO_EXTS) and not overwrite:
                    done += 1
                    continue
                still = _existing(media, stem, IMAGE_EXTS)
                if still is None:
                    report.errors[sc.scene_id] = "video: no start frame (media/%s.png)" % stem
                    done += 1
                    continue
                try:
                    _, fell_back = self.make_clip(project, sc, still, media)
                    report.videos.append(sc.scene_id)
                    if fell_back:
                        report.parallax_fallbacks.append(sc.scene_id)
                except Exception as e:
                    report.errors[sc.scene_id] = f"video: {e}"
                done += 1
                progress(done / steps, f"Clip {stem} ({self.s.video_backend})")
        report.hf_quota_exhausted = self.hf_quota_exhausted
        progress(1.0, "Media generation finished")
        return report
