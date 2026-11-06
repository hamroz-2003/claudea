import subprocess

import pytest

from modules import pipeline
from modules.hf_spaces import HFQuotaExceeded, HFSpaceError, HFSpaceVideo, space_url
from modules.media_fetcher import MediaSettings

from conftest import SCRIPT


class FakeClient:
    calls = []
    mode = "ok"

    def __init__(self, src, hf_token=None, **kw):
        self.src, self.token = src, hf_token

    def predict(self, *args, api_name=None):
        FakeClient.calls.append((self.src, self.token, api_name, args))
        if FakeClient.mode == "quota":
            raise RuntimeError("You have exceeded your ZeroGPU runs limit. Authenticate with a Hugging Face token")
        if FakeClient.mode == "down":
            raise RuntimeError("Space is paused")
        out = FakeClient.tmp / "gen.mp4"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=832x480:r=16:d=1",
                        "-pix_fmt", "yuv420p", str(out)], check=True)
        return {"video": str(out), "subtitles": None}, 7


@pytest.fixture(autouse=True)
def fake(tmp_path, monkeypatch):
    FakeClient.calls, FakeClient.mode, FakeClient.tmp = [], "ok", tmp_path
    monkeypatch.setattr("gradio_client.Client", FakeClient)
    yield


def test_space_url():
    assert space_url("zerogpu-aoti/wan2-2-fp8da-aoti-faster") == "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space"
    assert space_url("Some_User/My.Space") == "https://some-user-my-space.hf.space"


def test_generate_passes_user_token_and_clamps_duration(tmp_path):
    img = tmp_path / "a.png"
    img.write_bytes(b"x")
    hf = HFSpaceVideo("hf_userToken", steps=4)
    out = hf.generate(img, "slow push in", tmp_path / "media" / "001", seconds=9.0, seed=3)
    assert out.name == "001.mp4" and out.exists()
    src, token, api, args = FakeClient.calls[0]
    assert token == "hf_userToken" and api == "/generate_video" and src.endswith(".hf.space")
    assert args[1] == "slow push in" and args[2] == 4 and args[4] == 5.0 and args[7] == 3


def test_quota_is_detected(tmp_path):
    FakeClient.mode = "quota"
    img = tmp_path / "a.png"
    img.write_bytes(b"x")
    with pytest.raises(HFQuotaExceeded):
        HFSpaceVideo(None).generate(img, "p", tmp_path / "o", seconds=3, seed=1)
    FakeClient.mode = "down"
    with pytest.raises(HFSpaceError):
        HFSpaceVideo(None).generate(img, "p", tmp_path / "o", seconds=3, seed=1)


def _project(tmp_path, hooks=3):
    store = pipeline.ProjectStore(tmp_path / "projects")
    p = store.create(title="HF test", script=SCRIPT, world="x", hook_video_count=hooks,
                     render={"width": 320, "height": 180, "fps": 24})
    for s in p.scenes[:hooks]:
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=480x270",
                        "-frames:v", "1", str(store.dir(p.project_id) / "media" / f"{s.scene_id:03d}.png")],
                       check=True)
    return store, p


def test_fetcher_uses_hf_then_stops_on_quota(tmp_path):
    store, p = _project(tmp_path)
    cfg = MediaSettings(video_backend="hf_space", hf_token="hf_x", depth_model=False)
    res = pipeline.stage_media(store, p.project_id, cfg, tmp_path / "models", images=False)
    assert res["videos"] == [1, 2, 3] and res["parallax_fallbacks"] == [] and not res["hf_quota_exhausted"]

    FakeClient.mode, FakeClient.calls = "quota", []
    res = pipeline.stage_media(store, p.project_id, cfg, tmp_path / "models", images=False, overwrite=True)
    assert res["videos"] == [1, 2, 3] and res["parallax_fallbacks"] == [1, 2, 3]
    assert res["hf_quota_exhausted"] and len(FakeClient.calls) == 1     # no hammering after quota
