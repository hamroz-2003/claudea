"""Broadcast-style ``.ass`` subtitles, chapter title cards and lower-thirds,
plus YouTube chapter timestamps.

Typography follows documentary convention: one line of at most 42
characters, sentence-case, white with a thin dark outline, no boxes, no
bouncing. Chapter cards fade in over black with a slow letter-spacing
settle and a hairline rule; lower-thirds name the chapter a few seconds in.
"""

from __future__ import annotations

import re
from pathlib import Path

from .models import Project, Scene, Transition

MAX_LINE_CHARS = 42
MIN_EVENT_MS = 900


def _ts(ms: int) -> str:
    ms = max(0, int(ms))
    cs = int(round(ms / 10))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _esc(text: str) -> str:
    return text.replace("\\", "⧵").replace("{", "(").replace("}", ")").replace("\n", " ")


def _chunk_scene(sc: Scene) -> list[tuple[int, int, str]]:
    """Group a scene's timed words into subtitle events."""
    words = [(w.text.strip(), w.start_ms, w.end_ms) for w in sc.words if w.text.strip()]
    if not words:  # no recogniser timing: spread the narration over the speech span
        toks = sc.narration.split()
        span = max(1, sc.speech_end_ms - sc.speech_start_ms) if sc.speech_end_ms else sc.duration_ms
        total = sum(len(t) + 1 for t in toks) or 1
        t = float(sc.speech_start_ms or sc.start_ms)
        for tok in toks:
            d = span * (len(tok) + 1) / total
            words.append((tok, int(t), int(t + d)))
            t += d
    events: list[tuple[int, int, str]] = []
    cur: list[tuple[str, int, int]] = []

    def flush() -> None:
        if cur:
            events.append((cur[0][1], cur[-1][2], " ".join(w[0] for w in cur)))
            cur.clear()

    for idx, w in enumerate(words):
        line = " ".join(x[0] for x in cur + [w])
        if cur and len(line) > MAX_LINE_CHARS:
            # Don't strand the last word or two of a sentence on their own card.
            rest = []
            for x in words[idx:]:
                rest.append(x[0])
                if re.search(r"[.!?;:…]$", x[0]):
                    break
            tail = " ".join(rest)
            if not (len(tail) <= 14 and len(" ".join(x[0] for x in cur)) + 1 + len(tail) <= MAX_LINE_CHARS + 14):
                flush()
        cur.append(w)
        line = " ".join(x[0] for x in cur)
        if re.search(r"[.!?;:…]$", w[0]) or (re.search(r",$", w[0]) and len(line) > 24):
            flush()
    flush()
    return events


def build_ass(project: Project, out_path: Path, *, burn_subtitles: bool = True,
              chapter_cards: bool = True) -> Path:
    r = project.render
    w, h = r.width, r.height
    sub_size = round(h * 0.040)
    title_size = round(h * 0.068)
    small_size = round(h * 0.026)
    margin_v = round(h * 0.075)
    font = r.font_family

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Doc,{font},{sub_size},&H00F2F2F2,&H00FFFFFF,&H00101010,&H64000000,0,0,0,0,100,100,0.4,0,1,{max(1.5, h / 600):.1f},0,2,{round(w * 0.12)},{round(w * 0.12)},{margin_v},1
Style: Chapter,{font},{title_size},&H00F4F4F4,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,4,0,1,0,0,5,60,60,0,1
Style: ChapterSub,{font},{small_size},&H00B8B8B8,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,1.5,0,1,0,0,5,60,60,0,1
Style: Rule,{font},10,&H00C8C8C8,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
Style: Lower,{font},{small_size},&H00E8E8E8,&H00FFFFFF,&H00141414,&H00000000,1,0,0,0,100,100,3,0,1,{max(1.0, h / 900):.1f},0,1,{round(w * 0.05)},60,{round(h * 0.16)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines: list[str] = []
    scenes = project.scenes

    if burn_subtitles:
        all_events: list[tuple[int, int, str]] = []
        for sc in scenes:
            all_events.extend(_chunk_scene(sc))
        for i, (s, e, text) in enumerate(all_events):
            nxt = all_events[i + 1][0] if i + 1 < len(all_events) else project.total_ms
            end = min(max(e + 180, s + MIN_EVENT_MS), max(nxt - 40, s + 200))
            lines.append(f"Dialogue: 0,{_ts(s)},{_ts(end)},Doc,,0,0,0,,{{\\fad(90,90)}}{_esc(text)}")

    if chapter_cards:
        cx, cy = w // 2, h // 2
        for i, sc in enumerate(scenes):
            first_of_chapter = i == 0 or scenes[i - 1].chapter_index != sc.chapter_index
            if not first_of_chapter:
                continue
            chapter = next((c for c in project.chapters if c.index == sc.chapter_index), None)
            if chapter is None:
                continue
            # The card rides the fade-up out of black, centred on the dip.
            t0 = sc.start_ms if sc.transition_in == Transition.DIP_TO_BLACK else sc.start_ms + 200
            card_end = min(t0 + 2900, sc.end_ms + 1500)
            title = _esc(chapter.title.upper())
            lines.append(
                f"Dialogue: 2,{_ts(t0)},{_ts(card_end)},Chapter,,0,0,0,,"
                f"{{\\pos({cx},{cy - round(h * 0.02)})\\fad(450,600)\\fsp12\\t(0,2400,0.6,\\fsp4)"
                f"\\blur0.6}}{title}"
            )
            rule_w = round(w * 0.06)
            lines.append(
                f"Dialogue: 2,{_ts(t0 + 250)},{_ts(card_end)},Rule,,0,0,0,,"
                f"{{\\pos({cx},{cy + round(h * 0.035)})\\fad(500,600)\\p1}}"
                f"m 0 0 l {rule_w} 0 {rule_w} 2 0 2{{\\p0}}"
            )
            if chapter.subtitle:
                lines.append(
                    f"Dialogue: 2,{_ts(t0 + 350)},{_ts(card_end)},ChapterSub,,0,0,0,,"
                    f"{{\\pos({cx},{cy + round(h * 0.075)})\\fad(500,600)}}{_esc(chapter.subtitle)}"
                )
            lt0 = card_end + 900
            lt1 = lt0 + 3400
            if lt1 < project.total_ms:
                lines.append(
                    f"Dialogue: 1,{_ts(lt0)},{_ts(lt1)},Lower,,0,0,0,,"
                    f"{{\\fad(350,450)}}{_esc(chapter.title)}"
                )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")
    return out_path


def youtube_chapters(project: Project) -> tuple[str, list[str]]:
    """Return ``(description_block, warnings)``. YouTube requires the first
    chapter at 0:00, at least three chapters, each at least 10 seconds."""
    marks: list[tuple[int, str]] = []
    for i, sc in enumerate(project.scenes):
        if i == 0 or project.scenes[i - 1].chapter_index != sc.chapter_index:
            title = project.chapter_title(sc.chapter_index) or project.title
            marks.append((0 if i == 0 else sc.start_ms, title))
    warnings = []
    if len(marks) < 3:
        warnings.append("YouTube needs at least 3 chapters to show chapter markers.")
    for (a, _), (b, t) in zip(marks, marks[1:]):
        if b - a < 10_000:
            warnings.append(f"Chapter before '{t}' is shorter than 10 s.")

    def fmt(ms: int) -> str:
        s = ms // 1000
        h, rem = divmod(s, 3600)
        m, s = divmod(rem, 60)
        return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"

    return "\n".join(f"{fmt(ms)} {t}" for ms, t in marks), warnings
