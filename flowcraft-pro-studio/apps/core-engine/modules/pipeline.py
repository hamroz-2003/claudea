"""Project storage and the stage-by-stage production pipeline.

Folder layout of a project::

    projects/<project_id>/
        project.json          single source of truth (scenes, timing, settings)
        script.txt            the narration script as imported
        prompts.json          prompt manifest for the Flow bridge / manual use
        media/001.png ...     scene visuals (001.mp4 for animated scenes)
        audio/                per-scene TTS clips + voice_master.wav
        render/               cached segments, subtitles.ass, sfx bed
        export/<id>.mp4       finished film + youtube_chapters.txt
"""

from __future__ import annotations

import asyncio
import json
import re
import shutil
import threading
import unicodedata
from pathlib import Path
from typing import Callable, Optional

from .human_composer import render_project
from .llm import LLMClient
from .media_fetcher import MediaFetcher, MediaSettings
from .models import Chapter, Character, Project, RenderMode, RenderSettings, VisualBible
from .prompt_director import PromptDirector
from .script_parser import parse_script
from .voice_aligner import align_full_audio, generate_tts_timeline, timeline_from_scene_files

ProgressFn = Callable[[float, str], None]

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")
VIDEO_EXTS = (".mp4", ".mov", ".webm")


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:48] or "project"


def apply_hook_modes(project: Project) -> None:
    """First ``hook_video_count`` scenes (+ chapter openers if enabled) are animated."""
    for i, sc in enumerate(project.scenes):
        opener = (project.chapter_openers_animated and i > 0
                  and project.scenes[i - 1].chapter_index != sc.chapter_index)
        sc.render_mode = (RenderMode.ANIMATED_VIDEO if i < project.hook_video_count or opener
                          else RenderMode.CINEMATIC_IMAGE)


class ProjectStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, threading.RLock] = {}
        self._guard = threading.Lock()

    def lock(self, project_id: str) -> threading.RLock:
        with self._guard:
            return self._locks.setdefault(project_id, threading.RLock())

    def dir(self, project_id: str) -> Path:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", project_id):
            raise ValueError("Invalid project id")
        return self.root / project_id

    def exists(self, project_id: str) -> bool:
        return (self.dir(project_id) / "project.json").exists()

    def load(self, project_id: str) -> Project:
        path = self.dir(project_id) / "project.json"
        if not path.exists():
            raise FileNotFoundError(project_id)
        return Project.model_validate_json(path.read_text(encoding="utf-8"))

    def save(self, project: Project) -> None:
        d = self.dir(project.project_id)
        d.mkdir(parents=True, exist_ok=True)
        tmp = d / "project.json.tmp"
        tmp.write_text(project.model_dump_json(indent=2), encoding="utf-8")
        tmp.replace(d / "project.json")

    def list(self) -> list[dict]:
        out = []
        for p in sorted(self.root.glob("*/project.json")):
            try:
                proj = Project.model_validate_json(p.read_text(encoding="utf-8"))
            except ValueError:
                continue
            out.append({
                "project_id": proj.project_id, "title": proj.title, "scenes": len(proj.scenes),
                "duration_ms": proj.total_ms, "output_path": proj.output_path,
            })
        return out

    def create(self, *, title: str, script: str, world: str, language: str = "uz",
               voice: str = "uz-UZ-SardorNeural", characters: Optional[list[dict]] = None,
               hook_video_count: int = 8, chapter_openers_animated: bool = False,
               render: Optional[dict] = None, project_id: Optional[str] = None) -> Project:
        pid = project_id or slugify(title)
        base, n = pid, 2
        while self.exists(pid):
            pid = f"{base}-{n}"
            n += 1
        parsed = parse_script(script, default_chapter_title=title)
        if not parsed.scenes:
            raise ValueError("The script contains no narration")
        project = Project(
            project_id=pid, title=title, language=language, voice=voice,
            hook_video_count=hook_video_count, chapter_openers_animated=chapter_openers_animated,
            bible=VisualBible(world=world, language=language,
                              characters=[Character(**c) for c in (characters or [])]),
            chapters=parsed.chapters or [Chapter(index=0, title=title)],
            scenes=parsed.scenes,
            render=RenderSettings(**(render or {})),
        )
        apply_hook_modes(project)
        d = self.dir(pid)
        for sub in ("media", "audio", "render", "export"):
            (d / sub).mkdir(parents=True, exist_ok=True)
        (d / "script.txt").write_text(script, encoding="utf-8")
        self.save(project)
        return project


# --------------------------------------------------------------------------- #
# Stages
# --------------------------------------------------------------------------- #

def write_prompt_manifest(project: Project, project_dir: Path) -> Path:
    """Queue file consumed by the Flow bridge (and usable by hand)."""
    items = [{
        "scene_id": s.scene_id,
        "filename": f"{s.scene_id:03d}",
        "render_mode": s.render_mode.value,
        "image_prompt": s.image_prompt,
        "motion_prompt": s.motion_prompt if s.render_mode == RenderMode.ANIMATED_VIDEO else None,
        "aspect_ratio": "16:9" if project.render.width >= project.render.height else "9:16",
    } for s in project.scenes]
    path = project_dir / "prompts.json"
    path.write_text(json.dumps({"project_id": project.project_id, "items": items},
                               ensure_ascii=False, indent=2), encoding="utf-8")
    txt = project_dir / "prompts.txt"
    txt.write_text("\n\n".join(f"[{i['filename']}] {i['image_prompt']}" for i in items) + "\n",
                   encoding="utf-8")
    return path


def stage_prompts(store: ProjectStore, project_id: str, llm: Optional[LLMClient],
                  progress: Optional[ProgressFn] = None, scene_ids: Optional[set[int]] = None) -> Project:
    with store.lock(project_id):
        project = store.load(project_id)
        PromptDirector(llm).run(project, progress, only_scene_ids=scene_ids)
        store.save(project)
        write_prompt_manifest(project, store.dir(project_id))
        return project


def stage_voice_tts(store: ProjectStore, project_id: str, progress: Optional[ProgressFn] = None) -> Project:
    with store.lock(project_id):
        project = store.load(project_id)
        asyncio.run(generate_tts_timeline(project, store.dir(project_id), progress))
        store.save(project)
        return project


def stage_voice_scene_files(store: ProjectStore, project_id: str) -> Project:
    with store.lock(project_id):
        project = store.load(project_id)
        timeline_from_scene_files(project, store.dir(project_id))
        store.save(project)
        return project


def stage_align(store: ProjectStore, project_id: str, audio_path: Path, *, model_size: str = "medium",
                progress: Optional[ProgressFn] = None) -> Project:
    with store.lock(project_id):
        project = store.load(project_id)
        d = store.dir(project_id)
        dest = d / "audio" / f"narration{audio_path.suffix.lower()}"
        if audio_path.resolve() != dest.resolve():
            shutil.copy2(audio_path, dest)
        align_full_audio(project, dest, d, model_size=model_size, progress=progress)
        store.save(project)
        return project


def attach_media(project: Project, project_dir: Path) -> list[int]:
    """Link ``media/<NNN>.<ext>`` files to scenes. Animated scenes prefer a
    video file and fall back to the still. Returns scene ids still missing."""
    media = project_dir / "media"
    missing = []
    for sc in project.scenes:
        stem = f"{sc.scene_id:03d}"
        order = (VIDEO_EXTS + IMAGE_EXTS) if sc.render_mode == RenderMode.ANIMATED_VIDEO else IMAGE_EXTS + VIDEO_EXTS
        found = next((media / f"{stem}{ext}" for ext in order if (media / f"{stem}{ext}").exists()), None)
        if found is not None:
            sc.asset_path = str(found.relative_to(project_dir))
        elif sc.asset_path and (project_dir / sc.asset_path).exists():
            continue
        else:
            sc.asset_path = None
            missing.append(sc.scene_id)
    return missing


def import_scene_media(store: ProjectStore, project_id: str, scene_id: int, src: Path) -> Project:
    ext = src.suffix.lower()
    if ext not in IMAGE_EXTS + VIDEO_EXTS:
        raise ValueError(f"Unsupported media type {ext}")
    with store.lock(project_id):
        project = store.load(project_id)
        if not any(s.scene_id == scene_id for s in project.scenes):
            raise KeyError(scene_id)
        d = store.dir(project_id)
        for old in (d / "media").glob(f"{scene_id:03d}.*"):
            if old.suffix.lower() in (IMAGE_EXTS if ext in IMAGE_EXTS else VIDEO_EXTS):
                old.unlink()
        dest = d / "media" / f"{scene_id:03d}{ext}"
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        attach_media(project, d)
        store.save(project)
        return project


def stage_media(store: ProjectStore, project_id: str, settings: MediaSettings, models_dir: Path, *,
                scene_ids: Optional[set[int]] = None, images: bool = True, videos: bool = True,
                overwrite: bool = False, progress: Optional[ProgressFn] = None) -> dict:
    """Generate missing stills and hook clips with the free backends."""
    project = store.load(project_id)       # read-only snapshot: generation can take long
    d = store.dir(project_id)
    report = MediaFetcher(settings, models_dir).generate(
        project, d, scene_ids=scene_ids, images=images, videos=videos, overwrite=overwrite,
        progress=progress)
    with store.lock(project_id):
        project = store.load(project_id)
        missing = attach_media(project, d)
        store.save(project)
    result = report.as_dict()
    result["missing"] = missing
    (d / "render").mkdir(parents=True, exist_ok=True)
    (d / "render" / "media_report.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    if report.errors and not (report.images or report.videos):
        first = next(iter(report.errors.items()))
        raise RuntimeError(f"Media generation failed for all scenes (scene {first[0]}: {first[1]})")
    return result


PREVIEW_OVERRIDES = {"width": 960, "height": 540, "fps": 30, "supersample": 1, "grain_strength": 5}


def stage_render(store: ProjectStore, project_id: str, assets_dir: Path, *, preview: bool = False,
                 progress: Optional[ProgressFn] = None) -> Project:
    with store.lock(project_id):
        project = store.load(project_id)
        d = store.dir(project_id)
        missing = attach_media(project, d)
        if missing and not preview:
            raise ValueError(f"Scenes without media: {missing[:20]}{'…' if len(missing) > 20 else ''}")
        render_project_obj = project
        output = None
        if preview:
            render_project_obj = project.model_copy(deep=True)
            if project.render.height > project.render.width:  # 9:16 shorts
                over = {**PREVIEW_OVERRIDES, "width": 540, "height": 960}
            else:
                over = PREVIEW_OVERRIDES
            render_project_obj.render = project.render.model_copy(update=over)
            output = d / "export" / f"{project_id}_preview.mp4"
        out = render_project(render_project_obj, d, assets_dir, progress=progress,
                             allow_placeholders=preview, output=output)
        if not preview:
            project.output_path = str(out)
        store.save(project)
        return project
