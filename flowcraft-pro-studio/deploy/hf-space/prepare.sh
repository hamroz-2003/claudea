#!/usr/bin/env bash
# Assemble a ready-to-push Hugging Face Space folder in dist/hf-space.
#   ./deploy/hf-space/prepare.sh
#   cd dist/hf-space && git init && git remote add origin https://huggingface.co/spaces/<you>/flowcraft-engine
#   git add . && git commit -m "FlowCraft engine" && git push -u origin main
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
out="$root/dist/hf-space"
rm -rf "$out"
mkdir -p "$out/apps"
cp "$here/Dockerfile" "$here/requirements-cloud.txt" "$out/"
cp "$here/SPACE_README.md" "$out/README.md"
cp -R "$root/apps/core-engine" "$root/apps/web-ui" "$out/apps/"
cp -R "$root/assets" "$out/"
rm -rf "$out/apps/core-engine/tests" "$out/apps/core-engine/pytest.ini"
find "$out" \( -name '__pycache__' -o -name '.pytest_cache' \) -type d -prune -exec rm -rf {} +
echo "Space folder ready: $out"
