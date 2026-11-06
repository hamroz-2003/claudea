import time

from fastapi.testclient import TestClient

import main
from conftest import SCRIPT

client = TestClient(main.app)
H = {"X-FlowCraft-Token": main.TOKEN}


def test_health_is_public_and_rest_requires_token():
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/projects").status_code == 401
    assert client.get("/projects", headers=H).status_code == 200


def test_project_lifecycle_with_offline_prompts():
    r = client.post("/projects", headers=H, json={
        "title": "Amir Temur askari", "script": SCRIPT, "world": "14th-century Timurid Central Asia",
        "characters": [{"name": "Sanjar", "dna": "young Timurid soldier"}], "hook_video_count": 3,
    })
    assert r.status_code == 200, r.text
    pid = r.json()["project_id"]
    job = client.post(f"/projects/{pid}/prompts", headers=H, json={}).json()
    for _ in range(100):
        j = client.get(f"/jobs/{job['job_id']}", headers=H).json()
        if j["status"] in ("done", "error"):
            break
        time.sleep(0.05)
    assert j["status"] == "done", j
    p = client.get(f"/projects/{pid}", headers=H).json()
    assert all(s["image_prompt"] for s in p["scenes"])
    r = client.patch(f"/projects/{pid}/scenes/1", headers=H, json={"camera_motion": "slow_pull_out"})
    assert r.json()["camera_motion"] == "slow_pull_out"
    assert "001" in client.get(f"/projects/{pid}/prompts.txt", headers=H).text
    assert client.get(f"/projects/{pid}/files/../../flowcraft.db", headers=H).status_code == 404


def test_websocket_requires_token():
    with client.websocket_connect(f"/ws?token={main.TOKEN}") as ws:
        assert ws.receive_json()["type"] == "hello"


def test_media_settings_and_comfyui_status(tmp_path):
    assert client.get("/settings/media", headers=H).json()["video_backend"] == "parallax"
    r = client.put("/settings/media", headers=H, json={"video_backend": "comfyui",
                                                        "video_workflow": str(tmp_path / "missing.json")})
    assert r.status_code == 400
    wf = tmp_path / "wf.json"
    wf.write_text('{"1": {"inputs": {"text": "{{PROMPT}}"}}}')
    r = client.put("/settings/media", headers=H, json={"video_backend": "comfyui", "video_workflow": str(wf),
                                                        "comfyui_url": "http://127.0.0.1:9"})
    assert r.status_code == 200
    assert client.get("/media/comfyui/status", headers=H).json()["online"] is False
    client.put("/settings/media", headers=H, json={})


def test_ui_is_served_and_query_token_works():
    r = client.get("/", follow_redirects=False)
    assert r.status_code in (302, 307) and r.headers["location"] == "/ui/"
    assert "FlowCraft" in client.get("/ui/").text
    assert client.get(f"/voices?token={main.TOKEN}").json()["uz"][0]["id"].startswith("uz-UZ")
    assert client.get("/voices?token=wrong").status_code == 401
