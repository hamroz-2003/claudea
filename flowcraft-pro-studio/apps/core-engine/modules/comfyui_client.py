"""ComfyUI bridge: free, local, open-weight image and video generation.

The user runs ComfyUI (https://github.com/comfyanonymous/ComfyUI) on their own
GPU with any open model: Wan 2.1/2.2 or LTX-Video for image-to-video, FLUX.1
[schnell] or SDXL for stills. No account, no credits, no quota.

Instead of hard-coding node graphs (they change with every model and custom
node release), the user builds a workflow in ComfyUI, exports it with
"Export (API)", and puts placeholders into the text/number fields:

    {{PROMPT}}  {{NEGATIVE}}  {{SEED}}  {{WIDTH}}  {{HEIGHT}}
    {{FRAMES}}  {{FPS}}       {{IMAGE}} (uploaded start frame)  {{PREFIX}}

A field whose whole value is ``"{{SEED}}"`` (etc.) becomes a number; a
placeholder inside longer text is substituted as text.

API used: POST /upload/image, POST /prompt, GET /history/<id>, GET /view.
"""

from __future__ import annotations

import json
import logging
import mimetypes
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

log = logging.getLogger("flowcraft.comfyui")

NUMERIC = {"SEED", "WIDTH", "HEIGHT", "FRAMES", "FPS"}
VIDEO_EXTS = (".mp4", ".webm", ".mov", ".mkv", ".gif", ".webp")
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")


class ComfyUIError(RuntimeError):
    pass


def fill_placeholders(node: Any, values: dict[str, Any]) -> Any:
    """Recursively substitute ``{{NAME}}`` placeholders in a workflow."""
    if isinstance(node, dict):
        return {k: fill_placeholders(v, values) for k, v in node.items()}
    if isinstance(node, list):
        return [fill_placeholders(v, values) for v in node]
    if isinstance(node, str):
        stripped = node.strip()
        if stripped.startswith("{{") and stripped.endswith("}}") and stripped.count("{{") == 1:
            key = stripped[2:-2].strip()
            if key in values:
                v = values[key]
                return int(v) if key in NUMERIC else v
        out = node
        for key, v in values.items():
            out = out.replace("{{" + key + "}}", str(v))
        return out
    return node


def placeholders_in(workflow: Any) -> set[str]:
    text = json.dumps(workflow)
    found = set()
    i = 0
    while True:
        a = text.find("{{", i)
        if a < 0:
            return found
        b = text.find("}}", a)
        if b < 0:
            return found
        found.add(text[a + 2:b].strip())
        i = b + 2


def frames_for(duration_s: float, fps: int, step: int) -> int:
    """Frame count obeying the model's ``step*n + 1`` rule (Wan: 4, LTX: 8)."""
    n = max(1, round(duration_s * fps))
    if step <= 1:
        return n
    return max(step + 1, round((n - 1) / step) * step + 1)


class ComfyUIClient:
    def __init__(self, base_url: str = "http://127.0.0.1:8188", timeout_s: float = 1800):
        self.base = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self.client_id = uuid.uuid4().hex

    # ---- HTTP -------------------------------------------------------------- #
    def _req(self, method: str, path: str, data: bytes | None = None,
             headers: dict | None = None, timeout: float = 60) -> bytes:
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            raise ComfyUIError(f"ComfyUI {method} {path} -> HTTP {e.code}: {body[:800]}") from e
        except urllib.error.URLError as e:
            raise ComfyUIError(f"ComfyUI not reachable at {self.base} ({e.reason}). Is it running?") from e

    def ping(self) -> dict:
        return json.loads(self._req("GET", "/system_stats", timeout=5))

    def upload_image(self, path: Path) -> str:
        boundary = uuid.uuid4().hex
        ctype = mimetypes.guess_type(path.name)[0] or "image/png"
        name = f"flowcraft_{uuid.uuid4().hex[:8]}{path.suffix.lower()}"
        body = b"".join([
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n".encode(), path.read_bytes(), b"\r\n",
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n".encode(),
            f"--{boundary}--\r\n".encode(),
        ])
        res = json.loads(self._req("POST", "/upload/image", body,
                                   {"Content-Type": f"multipart/form-data; boundary={boundary}"}))
        sub = res.get("subfolder") or ""
        return f"{sub}/{res['name']}" if sub else res["name"]

    def queue(self, workflow: dict) -> str:
        res = json.loads(self._req("POST", "/prompt",
                                   json.dumps({"prompt": workflow, "client_id": self.client_id}).encode(),
                                   {"Content-Type": "application/json"}))
        if res.get("node_errors"):
            raise ComfyUIError(f"Workflow rejected: {json.dumps(res['node_errors'])[:800]}")
        return res["prompt_id"]

    def wait(self, prompt_id: str, progress: Optional[Callable[[float], None]] = None) -> dict:
        start = time.time()
        delay = 1.0
        while time.time() - start < self.timeout_s:
            hist = json.loads(self._req("GET", f"/history/{prompt_id}"))
            entry = hist.get(prompt_id)
            if entry:
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    msgs = [m for m in status.get("messages", []) if m and m[0] == "execution_error"]
                    detail = msgs[0][1].get("exception_message", "") if msgs else ""
                    raise ComfyUIError(f"ComfyUI execution failed: {detail[:600]}")
                if status.get("completed", True):
                    return entry.get("outputs", {})
            if progress:
                progress(min(0.95, (time.time() - start) / 300))
            time.sleep(delay)
            delay = min(5.0, delay * 1.3)
        raise ComfyUIError(f"ComfyUI job {prompt_id} timed out after {self.timeout_s:.0f}s")

    def download(self, item: dict, dest: Path) -> Path:
        q = urllib.parse.urlencode({"filename": item["filename"], "subfolder": item.get("subfolder", ""),
                                    "type": item.get("type", "output")})
        data = self._req("GET", f"/view?{q}", timeout=600)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return dest

    # ---- high level -------------------------------------------------------- #
    @staticmethod
    def _pick_output(outputs: dict, exts: tuple[str, ...]) -> Optional[dict]:
        for node_out in outputs.values():
            for value in node_out.values():
                if not isinstance(value, list):
                    continue
                for item in value:
                    if isinstance(item, dict) and str(item.get("filename", "")).lower().endswith(exts):
                        if item.get("type", "output") == "output":
                            return item
        for node_out in outputs.values():   # fall back to temp previews
            for value in node_out.values():
                if isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict) and str(item.get("filename", "")).lower().endswith(exts):
                            return item
        return None

    def run(self, workflow_path: Path, values: dict[str, Any], dest_stem: Path, *, want_video: bool,
            image: Optional[Path] = None, progress: Optional[Callable[[float], None]] = None) -> Path:
        wf = json.loads(Path(workflow_path).read_text(encoding="utf-8"))
        if "nodes" in wf and "links" in wf:
            raise ComfyUIError(f"{workflow_path} is a UI workflow; export it with 'Export (API)'")
        needed = placeholders_in(wf)
        if "PROMPT" not in needed:
            raise ComfyUIError(f"{workflow_path} has no {{{{PROMPT}}}} placeholder")
        vals = dict(values)
        if "IMAGE" in needed:
            if image is None:
                raise ComfyUIError("Workflow needs {{IMAGE}} but no start frame was given")
            vals["IMAGE"] = self.upload_image(image)
        wf = fill_placeholders(wf, vals)
        pid = self.queue(wf)
        outputs = self.wait(pid, progress)
        exts = VIDEO_EXTS if want_video else IMAGE_EXTS
        item = self._pick_output(outputs, exts)
        if item is None:
            raise ComfyUIError(f"Workflow finished but produced no {'video' if want_video else 'image'} output")
        ext = Path(item["filename"]).suffix.lower()
        return self.download(item, dest_stem.with_suffix(ext))
