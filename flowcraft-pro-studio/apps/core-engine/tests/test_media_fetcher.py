import json
import subprocess

from modules import pipeline
from modules.media_fetcher import MediaSettings
from modules.models import RenderMode

from conftest import SCRIPT


def _store(tmp_path):
    store = pipeline.ProjectStore(tmp_path / "projects")
    p = store.create(title="Media test", script=SCRIPT, world="Timurid Central Asia", hook_video_count=2,
                     render={"width": 320, "height": 180, "fps": 24, "supersample": 1})
    d = store.dir(p.project_id)
    for s in p.scenes:
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        f"testsrc2=s=480x270", "-frames:v", "1", str(d / "media" / f"{s.scene_id:03d}.png")],
                       check=True)
    return store, p


def test_parallax_backend_animates_hook_scenes(tmp_path):
    store, p = _store(tmp_path)
    res = pipeline.stage_media(store, p.project_id, MediaSettings(depth_model=False), tmp_path / "models")
    assert res["videos"] == [1, 2] and res["missing"] == []
    project = store.load(p.project_id)
    assert project.scenes[0].asset_path == "media/001.mp4"
    assert project.scenes[2].asset_path == "media/003.png"
    assert all(s.render_mode == RenderMode.ANIMATED_VIDEO for s in project.scenes[:2])


def test_comfyui_down_falls_back_to_parallax(tmp_path):
    store, p = _store(tmp_path)
    wf = tmp_path / "wf.json"
    wf.write_text(json.dumps({"1": {"inputs": {"text": "{{PROMPT}}", "image": "{{IMAGE}}"}}}))
    cfg = MediaSettings(video_backend="comfyui", video_workflow=str(wf), comfyui_url="http://127.0.0.1:9",
                        depth_model=False)
    res = pipeline.stage_media(store, p.project_id, cfg, tmp_path / "models", scene_ids={1})
    assert res["videos"] == [1] and res["parallax_fallbacks"] == [1]
    assert (store.dir(p.project_id) / "media" / "001.mp4").exists()


def test_manual_backend_reports_missing_stills(tmp_path):
    store = pipeline.ProjectStore(tmp_path / "projects")
    p = store.create(title="Empty", script=SCRIPT, world="x", hook_video_count=1)
    res = pipeline.stage_media(store, p.project_id, MediaSettings(depth_model=False), tmp_path / "models",
                               videos=False)
    assert len(res["skipped"]) == len(p.scenes) and len(res["missing"]) == len(p.scenes)
