"""Command-line driver for the engine (no UI or server required).

    python cli.py new --title "Amir Temur askari" --world "14th-century Timurid Central Asia" \
        --script script.txt --character "Sanjar=22-year-old Timurid soldier, weathered tan skin, ..."
    python cli.py prompts  <project_id>
    python cli.py tts      <project_id>
    python cli.py align    <project_id> narration.mp3
    python cli.py media    <project_id> 12 path/to/image.png
    python cli.py render   <project_id> [--preview]
    python cli.py info     <project_id>
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from config import ASSETS_DIR, EngineSettings, StateStore
from modules import pipeline
from modules.llm import build_llm
from modules.subtitles import youtube_chapters


def _progress(p: float, msg: str) -> None:
    bar = "#" * int(p * 30)
    sys.stderr.write(f"\r[{bar:<30}] {p * 100:5.1f}%  {msg[:60]:<60}")
    sys.stderr.flush()
    if p >= 1.0:
        sys.stderr.write("\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="flowcraft")
    sub = ap.add_subparsers(dest="cmd", required=True)

    n = sub.add_parser("new")
    n.add_argument("--title", required=True)
    n.add_argument("--world", required=True)
    n.add_argument("--script", required=True, type=Path)
    n.add_argument("--language", default="uz")
    n.add_argument("--voice", default="uz-UZ-SardorNeural")
    n.add_argument("--hook", type=int, default=8, help="number of opening ANIMATED_VIDEO scenes")
    n.add_argument("--character", action="append", default=[], help="Name=DNA description")
    n.add_argument("--shorts", action="store_true", help="9:16 1080x1920")

    for name in ("prompts", "tts", "info", "scan"):
        s = sub.add_parser(name)
        s.add_argument("project_id")
    a = sub.add_parser("align")
    a.add_argument("project_id")
    a.add_argument("audio", type=Path)
    a.add_argument("--model", default="medium")
    m = sub.add_parser("media")
    m.add_argument("project_id")
    m.add_argument("scene_id", type=int)
    m.add_argument("file", type=Path)
    r = sub.add_parser("render")
    r.add_argument("project_id")
    r.add_argument("--preview", action="store_true")

    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.WARNING)
    settings = EngineSettings()
    settings.ensure()
    state = StateStore(settings.db_path)
    store = pipeline.ProjectStore(settings.projects_dir)

    if args.cmd == "new":
        chars = []
        for c in args.character:
            name, _, dna = c.partition("=")
            chars.append({"name": name.strip(), "dna": dna.strip()})
        render = {"width": 1080, "height": 1920} if args.shorts else None
        p = store.create(title=args.title, script=args.script.read_text(encoding="utf-8"),
                         world=args.world, language=args.language, voice=args.voice,
                         characters=chars, hook_video_count=args.hook, render=render)
        print(f"Created {p.project_id}: {len(p.scenes)} scenes, {len(p.chapters)} chapters")
        print(f"Folder: {store.dir(p.project_id)}")
    elif args.cmd == "prompts":
        p = pipeline.stage_prompts(store, args.project_id, build_llm(state), _progress)
        rew = sum(1 for s in p.scenes if s.prompt_rewrites)
        print(f"{len(p.scenes)} prompts written to prompts.json ({rew} rewritten by the similarity gate)")
    elif args.cmd == "tts":
        p = pipeline.stage_voice_tts(store, args.project_id, _progress)
        print(f"Voice timeline: {p.total_ms / 1000:.2f}s")
    elif args.cmd == "align":
        p = pipeline.stage_align(store, args.project_id, args.audio, model_size=args.model, progress=_progress)
        print(f"Aligned {len(p.scenes)} scenes over {p.total_ms / 1000:.2f}s")
    elif args.cmd == "media":
        pipeline.import_scene_media(store, args.project_id, args.scene_id, args.file)
        print("Attached")
    elif args.cmd == "scan":
        p = store.load(args.project_id)
        missing = pipeline.attach_media(p, store.dir(args.project_id))
        store.save(p)
        print(f"Missing media for scenes: {missing}" if missing else "All scenes have media")
    elif args.cmd == "render":
        p = pipeline.stage_render(store, args.project_id, ASSETS_DIR, preview=args.preview, progress=_progress)
        print(p.output_path if not args.preview else store.dir(args.project_id) / "export")
    elif args.cmd == "info":
        p = store.load(args.project_id)
        for s in p.scenes:
            print(f"{s.scene_id:03d} {s.start_ms:>8} {s.duration_ms:>6}ms {s.render_mode.value[:5]} "
                  f"{(s.shot_scale.name if s.shot_scale else '-'):<20} {s.camera_motion.value:<15} "
                  f"{s.transition_in.value:<12} {s.narration[:50]}")
        text, warnings = youtube_chapters(p)
        print("\n" + text)
        for w in warnings:
            print("! " + w)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, FileNotFoundError, RuntimeError) as e:
        sys.stderr.write(f"\nerror: {e}\n")
        raise SystemExit(1)
