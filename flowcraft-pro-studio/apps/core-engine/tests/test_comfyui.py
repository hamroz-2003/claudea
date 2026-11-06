import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from modules.comfyui_client import ComfyUIClient, ComfyUIError, fill_placeholders, frames_for

WORKFLOW = {
    "3": {"class_type": "KSampler", "inputs": {"seed": "{{SEED}}", "steps": 20}},
    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "{{PROMPT}}"}},
    "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "{{NEGATIVE}}"}},
    "10": {"class_type": "LoadImage", "inputs": {"image": "{{IMAGE}}"}},
    "20": {"class_type": "WanImageToVideo", "inputs": {"width": "{{WIDTH}}", "height": "{{HEIGHT}}",
                                                       "length": "{{FRAMES}}"}},
    "30": {"class_type": "VHS_VideoCombine", "inputs": {"frame_rate": "{{FPS}}",
                                                        "filename_prefix": "{{PREFIX}}"}},
}


class FakeComfy(BaseHTTPRequestHandler):
    received: list = []
    fail = False

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        data = self.rfile.read(int(self.headers["Content-Length"]))
        if self.path == "/upload/image":
            assert b'name="image"' in data
            return self._json({"name": "start.png", "subfolder": "", "type": "input"})
        if self.path == "/prompt":
            FakeComfy.received.append(json.loads(data)["prompt"])
            if FakeComfy.fail:
                return self._json({"error": "bad", "node_errors": {"3": {"errors": ["x"]}}}, 400)
            return self._json({"prompt_id": "p1", "number": 1, "node_errors": {}})

    def do_GET(self):
        if self.path.startswith("/history/"):
            return self._json({"p1": {"status": {"status_str": "success", "completed": True},
                                      "outputs": {"30": {"gifs": [{"filename": "clip_0001.mp4",
                                                                   "subfolder": "flowcraft",
                                                                   "type": "output"}]}}}})
        if self.path.startswith("/view"):
            body = b"\x00\x00\x00\x18ftypmp42fake-video"
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/system_stats":
            return self._json({"devices": [{"name": "cuda:0 RTX", "vram_total": 12 << 30, "vram_free": 9 << 30}]})
        self.send_response(404)
        self.end_headers()


@pytest.fixture
def comfy():
    FakeComfy.received = []
    FakeComfy.fail = False
    srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeComfy)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def test_fill_placeholders_types():
    out = fill_placeholders(WORKFLOW, {"SEED": 7, "PROMPT": "a horse", "FRAMES": 81, "WIDTH": 832,
                                       "HEIGHT": 480, "FPS": 16, "NEGATIVE": "blur", "IMAGE": "x.png",
                                       "PREFIX": "p/1"})
    assert out["3"]["inputs"]["seed"] == 7 and isinstance(out["3"]["inputs"]["seed"], int)
    assert out["6"]["inputs"]["text"] == "a horse"
    assert out["20"]["inputs"]["length"] == 81


def test_frames_rule():
    assert frames_for(5.0, 16, 4) == 81        # Wan: 4n+1
    assert frames_for(4.0, 24, 8) == 97        # LTX: 8n+1
    assert (frames_for(3.3, 16, 4) - 1) % 4 == 0


def test_run_image_to_video(tmp_path, comfy):
    wf = tmp_path / "wan_i2v_api.json"
    wf.write_text(json.dumps(WORKFLOW))
    still = tmp_path / "001.png"
    still.write_bytes(b"\x89PNG fake")
    c = ComfyUIClient(comfy)
    assert c.ping()["devices"][0]["name"].startswith("cuda")
    out = c.run(wf, {"PROMPT": "slow push in", "NEGATIVE": "", "SEED": 1, "WIDTH": 832, "HEIGHT": 480,
                     "FRAMES": 81, "FPS": 16, "PREFIX": "x"}, tmp_path / "media" / "001",
                want_video=True, image=still)
    assert out.name == "001.mp4" and out.read_bytes().startswith(b"\x00\x00\x00\x18ftyp")
    sent = FakeComfy.received[0]
    assert sent["10"]["inputs"]["image"] == "start.png"
    assert sent["20"]["inputs"]["length"] == 81


def test_rejections(tmp_path, comfy):
    ui = tmp_path / "ui.json"
    ui.write_text(json.dumps({"nodes": [], "links": []}))
    with pytest.raises(ComfyUIError, match="Export \\(API\\)"):
        ComfyUIClient(comfy).run(ui, {"PROMPT": "x"}, tmp_path / "o", want_video=False)
    wf = tmp_path / "wf.json"
    wf.write_text(json.dumps({"6": {"inputs": {"text": "{{PROMPT}}"}}}))
    FakeComfy.fail = True
    with pytest.raises(ComfyUIError, match="rejected|HTTP 400"):
        ComfyUIClient(comfy).run(wf, {"PROMPT": "x"}, tmp_path / "o", want_video=False)
    with pytest.raises(ComfyUIError, match="not reachable"):
        ComfyUIClient("http://127.0.0.1:9").ping()
