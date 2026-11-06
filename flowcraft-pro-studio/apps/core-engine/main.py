"""FlowCraft Pro Studio - local engine (FastAPI on 127.0.0.1:4100).

Every long operation (prompting, TTS, alignment, rendering) runs as a
background job. Progress is persisted in SQLite and pushed to all connected
clients over ``/ws`` as ``{"type": "job", ...}`` messages.

Security: the server only binds to loopback and every request (except
``/health``) must carry the per-install token from ``<data_dir>/engine.token``
in the ``X-FlowCraft-Token`` header (or ``?token=`` for WebSockets). This
stops arbitrary web pages in the user's browser from driving the engine.
Set ``FLOWCRAFT_NO_AUTH=1`` for local development only.
"""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import shutil
import tempfile
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from config import ASSETS_DIR, EngineSettings, StateStore
from modules import pipeline
from modules.ffmpeg_utils import available_encoders, ffmpeg_bin
from modules.llm import build_llm
from modules.media_fetcher import MediaSettings
from modules.comfyui_client import ComfyUIClient, ComfyUIError
from modules.models import CameraMotion, Character, RenderMode, RenderSettings, Transition
from modules.subtitles import youtube_chapters

VERSION = "0.3.0"
log = logging.getLogger("flowcraft.engine")

settings = EngineSettings()
settings.ensure()
state = StateStore(settings.db_path)
store = pipeline.ProjectStore(settings.projects_dir)


def _load_token() -> str:
    env = os.environ.get("FLOWCRAFT_TOKEN", "").strip()
    if env:                       # cloud deploys (HF Space secret)
        return env
    path = settings.data_dir / "engine.token"
    if path.exists():
        return path.read_text().strip()
    token = secrets.token_urlsafe(32)
    path.write_text(token)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return token


TOKEN = _load_token()
AUTH_DISABLED = os.environ.get("FLOWCRAFT_NO_AUTH") == "1"


def require_token(request: Request, x_flowcraft_token: Optional[str] = Header(default=None)) -> None:
    """Header for API calls; ``?token=`` for <img>/<video>/download links."""
    if AUTH_DISABLED:
        return
    tok = x_flowcraft_token or request.query_params.get("token") or ""
    if not tok or not secrets.compare_digest(tok, TOKEN):
        raise HTTPException(401, "Missing or invalid X-FlowCraft-Token")


# --------------------------------------------------------------------------- #
# Progress broadcasting & jobs
# --------------------------------------------------------------------------- #

class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    async def broadcast(self, msg: dict) -> None:
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    def publish(self, msg: dict) -> None:
        """Thread-safe publish from worker threads."""
        if self.loop is not None:
            asyncio.run_coroutine_threadsafe(self.broadcast(msg), self.loop)


hub = Hub()
render_slot = threading.Semaphore(1)   # one render at a time: renders already use all cores


def start_job(kind: str, project_id: Optional[str], fn: Callable[[Callable[[float, str], None]], Any],
              heavy: bool = False) -> dict:
    job_id = uuid.uuid4().hex[:12]
    state.upsert_job(job_id, project_id=project_id, kind=kind, status="queued")
    hub.publish({"type": "job", "id": job_id, "kind": kind, "project_id": project_id,
                 "status": "queued", "progress": 0.0})

    def progress(p: float, message: str) -> None:
        p = max(0.0, min(1.0, float(p)))
        state.upsert_job(job_id, project_id=project_id, kind=kind, status="running",
                         progress=p, message=message)
        hub.publish({"type": "job", "id": job_id, "kind": kind, "project_id": project_id,
                     "status": "running", "progress": p, "message": message})

    def runner() -> None:
        slot = render_slot if heavy else None
        if slot:
            slot.acquire()
        try:
            progress(0.0, "Started")
            fn(progress)
            state.upsert_job(job_id, project_id=project_id, kind=kind, status="done",
                             progress=1.0, message="Done")
            hub.publish({"type": "job", "id": job_id, "kind": kind, "project_id": project_id,
                         "status": "done", "progress": 1.0})
        except Exception as e:  # report every failure to the UI
            log.exception("Job %s (%s) failed", job_id, kind)
            state.upsert_job(job_id, project_id=project_id, kind=kind, status="error",
                             error=str(e)[:4000])
            hub.publish({"type": "job", "id": job_id, "kind": kind, "project_id": project_id,
                         "status": "error", "error": str(e)[:4000]})
        finally:
            if slot:
                slot.release()

    threading.Thread(target=runner, name=f"job-{kind}-{job_id}", daemon=True).start()
    return {"job_id": job_id, "kind": kind, "status": "queued"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    hub.loop = asyncio.get_running_loop()
    log.info("FlowCraft engine %s on %s:%s (data: %s)", VERSION, settings.host, settings.port,
             settings.data_dir)
    yield


app = FastAPI(title="FlowCraft Pro Studio Engine", version=VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # Auth is a bearer-style header token, never a cookie, so a foreign page
    # cannot ride on the user's session; any origin (Android app at
    # https://localhost, LAN browsers, the HF Space page) may call the API.
    allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)
auth = [Depends(require_token)]


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #

class CreateProject(BaseModel):
    title: str
    script: str
    world: str = Field(..., description="Era / world for the visual bible")
    language: str = "uz"
    voice: str = "uz-UZ-SardorNeural"
    characters: list[Character] = Field(default_factory=list)
    hook_video_count: int = Field(8, ge=0, le=40)
    chapter_openers_animated: bool = False
    render: Optional[RenderSettings] = None


class ProjectPatch(BaseModel):
    title: Optional[str] = None
    voice: Optional[str] = None
    tts_rate: Optional[str] = None
    hook_video_count: Optional[int] = Field(None, ge=0, le=40)
    world: Optional[str] = None
    film_stock: Optional[str] = None
    palette: Optional[str] = None
    characters: Optional[list[Character]] = None
    render: Optional[dict] = None


class ScenePatch(BaseModel):
    narration: Optional[str] = None
    image_prompt: Optional[str] = None
    motion_prompt: Optional[str] = None
    camera_motion: Optional[CameraMotion] = None
    transition_in: Optional[Transition] = None
    render_mode: Optional[RenderMode] = None
    pause_after_ms: Optional[int] = Field(None, ge=0, le=5000)
    sfx_cue: Optional[str] = None
    atmosphere: Optional[str] = None


class PromptJob(BaseModel):
    scene_ids: Optional[list[int]] = None


class MediaJob(BaseModel):
    scene_ids: Optional[list[int]] = None
    images: bool = True
    videos: bool = True
    overwrite: bool = False


class RenderJob(BaseModel):
    preview: bool = False


class KeyIn(BaseModel):
    service: str = Field(..., pattern=r"^(youtube|gemini|groq|openrouter)$")
    secret: str = Field(..., min_length=8)
    label: Optional[str] = None


class LLMSettings(BaseModel):
    provider: str = Field("", pattern=r"^(|gemini|openai_compatible|anthropic)$")
    model: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #

def _project_or_404(project_id: str):
    try:
        return store.load(project_id)
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, f"Project {project_id} not found")


@app.get("/health")
def health() -> dict:
    try:
        ff = ffmpeg_bin()
    except FileNotFoundError:
        ff = None
    return {"status": "ok", "version": VERSION, "ffmpeg": ff, "auth": not AUTH_DISABLED}


@app.get("/encoders", dependencies=auth)
def encoders() -> dict:
    return {"available": list(available_encoders())}


@app.get("/settings/llm", dependencies=auth)
def get_llm() -> dict:
    cfg = dict(state.get_setting("llm", {}) or {})
    if cfg.get("api_key"):
        cfg["api_key"] = "••••" + cfg["api_key"][-4:]
    return cfg


@app.put("/settings/llm", dependencies=auth)
def put_llm(body: LLMSettings) -> dict:
    cfg = body.model_dump(exclude_none=True)
    old = state.get_setting("llm", {}) or {}
    if "api_key" not in cfg and old.get("api_key") and old.get("provider") == cfg.get("provider"):
        cfg["api_key"] = old["api_key"]
    state.set_setting("llm", cfg)
    return {"ok": True}


def media_settings() -> MediaSettings:
    return MediaSettings(**(state.get_setting("media", {}) or {}))


@app.get("/settings/media", dependencies=auth)
def get_media_settings() -> dict:
    data = media_settings().model_dump()
    for key in ("pollinations_token", "hf_token"):
        if data.get(key):
            data[key] = "••••" + data[key][-4:]
    return data


@app.put("/settings/media", dependencies=auth)
def put_media_settings(body: MediaSettings) -> dict:
    old = state.get_setting("media", {}) or {}
    data = body.model_dump()
    for key in ("pollinations_token", "hf_token"):
        if (data.get(key) or "").startswith("••••"):
            data[key] = old.get(key)
    for key in ("image_workflow", "video_workflow"):
        if data.get(key) and not Path(data[key]).is_file():
            raise HTTPException(400, f"{key}: file not found")
    state.set_setting("media", data)
    return {"ok": True}


@app.get("/media/comfyui/status", dependencies=auth)
def comfyui_status() -> dict:
    try:
        stats = ComfyUIClient(media_settings().comfyui_url).ping()
    except ComfyUIError as e:
        return {"online": False, "error": str(e)}
    devices = [{"name": d.get("name"), "vram_total": d.get("vram_total"), "vram_free": d.get("vram_free")}
               for d in stats.get("devices", [])]
    return {"online": True, "devices": devices}


@app.get("/keys", dependencies=auth)
def list_keys(service: Optional[str] = None) -> list[dict]:
    return state.list_keys(service)


@app.post("/keys", dependencies=auth)
def add_key(body: KeyIn) -> dict:
    state.add_key(body.service, body.secret, body.label)
    return {"ok": True}


@app.delete("/keys/{key_id}", dependencies=auth)
def delete_key(key_id: int) -> dict:
    state.remove_key(key_id)
    return {"ok": True}


@app.get("/projects", dependencies=auth)
def list_projects() -> list[dict]:
    return store.list()


@app.post("/projects", dependencies=auth)
def create_project(body: CreateProject) -> dict:
    try:
        project = store.create(
            title=body.title, script=body.script, world=body.world, language=body.language,
            voice=body.voice, characters=[c.model_dump() for c in body.characters],
            hook_video_count=body.hook_video_count, chapter_openers_animated=body.chapter_openers_animated,
            render=body.render.model_dump() if body.render else None,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return project.model_dump()


@app.get("/projects/{project_id}", dependencies=auth)
def get_project(project_id: str) -> dict:
    return _project_or_404(project_id).model_dump()


@app.patch("/projects/{project_id}", dependencies=auth)
def patch_project(project_id: str, body: ProjectPatch) -> dict:
    with store.lock(project_id):
        p = _project_or_404(project_id)
        for f in ("title", "voice", "tts_rate", "hook_video_count"):
            v = getattr(body, f)
            if v is not None:
                setattr(p, f, v)
        for f in ("world", "film_stock", "palette"):
            v = getattr(body, f)
            if v is not None:
                setattr(p.bible, f, v)
        if body.hook_video_count is not None:
            pipeline.apply_hook_modes(p)
        if body.characters is not None:
            p.bible.characters = body.characters
        if body.render:
            p.render = RenderSettings(**{**p.render.model_dump(), **body.render})
        store.save(p)
        return p.model_dump()


@app.patch("/projects/{project_id}/scenes/{scene_id}", dependencies=auth)
def patch_scene(project_id: str, scene_id: int, body: ScenePatch) -> dict:
    with store.lock(project_id):
        p = _project_or_404(project_id)
        sc = next((s for s in p.scenes if s.scene_id == scene_id), None)
        if sc is None:
            raise HTTPException(404, "Scene not found")
        for k, v in body.model_dump(exclude_none=True).items():
            setattr(sc, k, v)
        store.save(p)
        pipeline.write_prompt_manifest(p, store.dir(project_id))
        return sc.model_dump()


@app.post("/projects/{project_id}/prompts", dependencies=auth)
def run_prompts(project_id: str, body: PromptJob) -> dict:
    _project_or_404(project_id)
    ids = set(body.scene_ids) if body.scene_ids else None
    llm = build_llm(state)
    return start_job("prompts", project_id,
                     lambda prog: pipeline.stage_prompts(store, project_id, llm, prog, ids))


@app.post("/projects/{project_id}/voice/tts", dependencies=auth)
def run_tts(project_id: str) -> dict:
    _project_or_404(project_id)
    return start_job("voice_tts", project_id, lambda prog: pipeline.stage_voice_tts(store, project_id, prog))


@app.post("/projects/{project_id}/voice/align", dependencies=auth)
async def run_align(project_id: str, audio: UploadFile = File(...),
                    model_size: str = Form("medium")) -> dict:
    _project_or_404(project_id)
    suffix = Path(audio.filename or "narration.mp3").suffix.lower() or ".mp3"
    if suffix not in (".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"):
        raise HTTPException(400, "Unsupported audio type")
    tmp = Path(tempfile.mkdtemp()) / f"narration{suffix}"
    with tmp.open("wb") as fh:
        shutil.copyfileobj(audio.file, fh)
    return start_job("voice_align", project_id,
                     lambda prog: pipeline.stage_align(store, project_id, tmp, model_size=model_size,
                                                       progress=prog), heavy=True)


@app.post("/projects/{project_id}/scenes/{scene_id}/voice", dependencies=auth)
async def upload_scene_voice(project_id: str, scene_id: int, audio: UploadFile = File(...)) -> dict:
    """Per-sentence narration recorded by a human (build the timeline with /voice/scenes)."""
    suffix = Path(audio.filename or "").suffix.lower()
    if suffix not in (".mp3", ".wav", ".m4a", ".flac", ".ogg"):
        raise HTTPException(400, "Unsupported audio type")
    with store.lock(project_id):
        p = _project_or_404(project_id)
        sc = next((s for s in p.scenes if s.scene_id == scene_id), None)
        if sc is None:
            raise HTTPException(404, "Scene not found")
        dest = store.dir(project_id) / "audio" / f"take_{scene_id:03d}{suffix}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as fh:
            shutil.copyfileobj(audio.file, fh)
        sc.voice_path = str(dest)
        store.save(p)
    return sc.model_dump()


@app.post("/projects/{project_id}/voice/scenes", dependencies=auth)
def run_scene_voice_timeline(project_id: str) -> dict:
    _project_or_404(project_id)
    return start_job("voice_scenes", project_id,
                     lambda prog: pipeline.stage_voice_scene_files(store, project_id))


@app.post("/projects/{project_id}/scenes/{scene_id}/media", dependencies=auth)
async def upload_media(project_id: str, scene_id: int, file: UploadFile = File(...)) -> dict:
    _project_or_404(project_id)
    suffix = Path(file.filename or "").suffix.lower()
    tmp = Path(tempfile.mkdtemp()) / f"upload{suffix}"
    with tmp.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)
    try:
        p = pipeline.import_scene_media(store, project_id, scene_id, tmp)
    except (ValueError, KeyError) as e:
        raise HTTPException(400, str(e))
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)
    return next(s for s in p.scenes if s.scene_id == scene_id).model_dump()


@app.post("/projects/{project_id}/media/scan", dependencies=auth)
def scan_media(project_id: str) -> dict:
    with store.lock(project_id):
        p = _project_or_404(project_id)
        missing = pipeline.attach_media(p, store.dir(project_id))
        store.save(p)
    return {"missing": missing, "attached": len(p.scenes) - len(missing)}


@app.post("/projects/{project_id}/media/generate", dependencies=auth)
def run_media(project_id: str, body: MediaJob) -> dict:
    _project_or_404(project_id)
    ms = media_settings()
    ids = set(body.scene_ids) if body.scene_ids else None
    return start_job("media", project_id,
                     lambda prog: pipeline.stage_media(store, project_id, ms, settings.data_dir / "models",
                                                       scene_ids=ids, images=body.images, videos=body.videos,
                                                       overwrite=body.overwrite, progress=prog),
                     heavy=True)


@app.post("/projects/{project_id}/render", dependencies=auth)
def run_render(project_id: str, body: RenderJob) -> dict:
    _project_or_404(project_id)
    return start_job("render_preview" if body.preview else "render", project_id,
                     lambda prog: pipeline.stage_render(store, project_id, ASSETS_DIR,
                                                        preview=body.preview, progress=prog),
                     heavy=True)


@app.get("/projects/{project_id}/youtube-chapters", dependencies=auth)
def chapters(project_id: str) -> dict:
    p = _project_or_404(project_id)
    text, warnings = youtube_chapters(p)
    return {"text": text, "warnings": warnings}


@app.get("/projects/{project_id}/prompts.txt", dependencies=auth, response_class=PlainTextResponse)
def prompts_txt(project_id: str) -> str:
    path = store.dir(project_id) / "prompts.txt"
    if not path.exists():
        raise HTTPException(404, "Run prompt generation first")
    return path.read_text(encoding="utf-8")


@app.get("/projects/{project_id}/files/{rel_path:path}", dependencies=auth)
def project_file(project_id: str, rel_path: str) -> FileResponse:
    base = store.dir(project_id).resolve()
    target = (base / rel_path).resolve()
    if base not in target.parents or not target.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(target)


VOICES = {
    "uz": [("uz-UZ-SardorNeural", "Sardor"), ("uz-UZ-MadinaNeural", "Madina")],
    "ru": [("ru-RU-DmitryNeural", "Dmitry"), ("ru-RU-SvetlanaNeural", "Svetlana")],
    "en": [("en-US-AndrewMultilingualNeural", "Andrew"), ("en-US-AvaMultilingualNeural", "Ava"),
           ("en-GB-RyanNeural", "Ryan (UK)")],
    "tr": [("tr-TR-AhmetNeural", "Ahmet"), ("tr-TR-EmelNeural", "Emel")],
    "kk": [("kk-KZ-DauletNeural", "Daulet"), ("kk-KZ-AigulNeural", "Aigul")],
}


@app.get("/voices", dependencies=auth)
def voices() -> dict:
    return {lang: [{"id": v, "name": n} for v, n in items] for lang, items in VOICES.items()}


@app.delete("/projects/{project_id}", dependencies=auth)
def delete_project(project_id: str) -> dict:
    with store.lock(project_id):
        _project_or_404(project_id)
        shutil.rmtree(store.dir(project_id))
    return {"ok": True}


@app.get("/projects/{project_id}/media", dependencies=auth)
def media_files(project_id: str) -> dict:
    """Which still / clip exists for each scene (drives storyboard thumbnails)."""
    p = _project_or_404(project_id)
    media = store.dir(project_id) / "media"
    out: dict[str, dict] = {}
    for sc in p.scenes:
        stem = f"{sc.scene_id:03d}"
        entry: dict[str, Any] = {}
        for f in sorted(media.glob(f"{stem}.*")):
            ext = f.suffix.lower()
            if ext in pipeline.IMAGE_EXTS:
                entry["image"] = f"media/{f.name}"
            elif ext in pipeline.VIDEO_EXTS:
                entry["video"] = f"media/{f.name}"
            entry["mtime"] = max(entry.get("mtime", 0), int(f.stat().st_mtime))
        out[str(sc.scene_id)] = entry
    exports = store.dir(project_id) / "export"
    files = sorted(f.name for f in exports.glob("*.mp4")) if exports.exists() else []
    return {"scenes": out, "exports": [f"export/{n}" for n in files if ".tmp." not in n]}


@app.get("/jobs", dependencies=auth)
def jobs(project_id: Optional[str] = None) -> list[dict]:
    return state.list_jobs(project_id)


@app.get("/jobs/{job_id}", dependencies=auth)
def job(job_id: str) -> dict:
    j = state.get_job(job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    return j


@app.websocket("/ws")
async def ws(websocket: WebSocket, token: str = Query(default="")) -> None:
    if not AUTH_DISABLED and not secrets.compare_digest(token, TOKEN):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    hub.clients.add(websocket)
    try:
        await websocket.send_json({"type": "hello", "version": VERSION})
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.discard(websocket)


UI_DIR = Path(os.environ.get("FLOWCRAFT_UI", Path(__file__).resolve().parent.parent / "web-ui"))
if UI_DIR.is_dir():
    app.mount("/ui", StaticFiles(directory=UI_DIR, html=True), name="ui")

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse("/ui/")


def _lan_addresses() -> list[str]:
    import socket

    addrs = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        addrs.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(a for a in addrs if not a.startswith("127."))


def main() -> None:
    import argparse

    import uvicorn

    ap = argparse.ArgumentParser(description="FlowCraft Pro Studio engine")
    ap.add_argument("--lan", action="store_true",
                    help="listen on the local network so the phone app can connect")
    ap.add_argument("--port", type=int, default=settings.port)
    args = ap.parse_args()
    host = "0.0.0.0" if args.lan else settings.host
    logging.basicConfig(level=os.environ.get("FLOWCRAFT_LOG", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    print(f"\nFlowCraft engine {VERSION}")
    urls = [f"http://{a}:{args.port}" for a in _lan_addresses()] if args.lan else []
    urls.insert(0, f"http://127.0.0.1:{args.port}")
    for u in urls:
        print(f"  Open / connect app:  {u}")
    print(f"  Token:               {TOKEN}\n")
    uvicorn.run(app, host=host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
