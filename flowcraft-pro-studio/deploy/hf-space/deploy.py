"""Create (or update) the user's FlowCraft engine Space and print its address.

Env: HF_TOKEN (write), FLOWCRAFT_TOKEN (engine password), SPACE_NAME (default flowcraft-engine).
Run ./prepare.sh first; it assembles dist/hf-space.
"""

import os
import re
import sys
from pathlib import Path

from huggingface_hub import HfApi

root = Path(__file__).resolve().parents[2]
folder = root / "dist" / "hf-space"
if not (folder / "Dockerfile").exists():
    sys.exit("dist/hf-space is missing; run deploy/hf-space/prepare.sh first")

api = HfApi(token=os.environ["HF_TOKEN"])
user = api.whoami()["name"]
name = os.environ.get("SPACE_NAME") or "flowcraft-engine"
if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,95}", name):
    sys.exit(f"Invalid Space name: {name}")
repo_id = f"{user}/{name}"

api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True, private=False)
api.add_space_secret(repo_id, "FLOWCRAFT_TOKEN", os.environ["FLOWCRAFT_TOKEN"])
api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=str(folder),
                  commit_message="Deploy FlowCraft engine", delete_patterns=["apps/**", "assets/**"])

host = re.sub(r"[^a-z0-9-]", "-", repo_id.lower().replace("/", "-"))
print("\n=========================================================")
print(f" Space:          https://huggingface.co/spaces/{repo_id}")
print(f" Engine manzili: https://{host}.hf.space")
print(" Kirish tokeni:  the FLOWCRAFT_TOKEN secret you set")
print(" The first build takes ~5-10 minutes; the app can connect once it shows 'Running'.")
print("=========================================================")
