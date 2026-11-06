"""Turns a narration script into chapters and scene-sized narration units.

Script format (plain text / Markdown)::

    # Ulug'tog', 1391 | Chapter subtitle (optional)
    1391-yil, Dashti Qipchoq cho'llari. Qo'shin uch oydirki yo'lda. [pause:600]
    ...

* ``#`` lines start a new chapter (``title | subtitle``).
* ``[pause:NNN]`` sets an explicit pause (ms) after the sentence it follows.
* One scene ~= one spoken sentence. Fragments under ``MIN_WORDS`` are merged
  into the next sentence; sentences over ``MAX_WORDS`` are split at the comma
  or semicolon nearest to their middle, so each visual holds 2-9 seconds.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .models import Chapter, Scene

SENTENCE_GAP_MS = 180
CHAPTER_GAP_MS = 450
MIN_WORDS = 4
MAX_WORDS = 30

_PAUSE_RE = re.compile(r"\[pause:(\d{2,5})\]", re.IGNORECASE)
# Split after . ! ? … when followed by whitespace; keeps "3.5" and "1391-yil." intact.
_SENT_RE = re.compile(r"(?<=[.!?…])[\"»”')\]]*\s+")


@dataclass
class _Unit:
    text: str
    pause_ms: int | None = None


@dataclass
class ParsedScript:
    chapters: list[Chapter] = field(default_factory=list)
    scenes: list[Scene] = field(default_factory=list)


def _split_sentences(paragraph: str) -> list[_Unit]:
    units: list[_Unit] = []
    # Pause tags become hard boundaries carrying their pause value.
    pos = 0
    for m in _PAUSE_RE.finditer(paragraph):
        chunk = paragraph[pos:m.start()]
        parts = [p.strip() for p in _SENT_RE.split(chunk) if p.strip()]
        for p in parts:
            units.append(_Unit(p))
        if units:
            units[-1].pause_ms = int(m.group(1))
        pos = m.end()
    tail = paragraph[pos:]
    units.extend(_Unit(p.strip()) for p in _SENT_RE.split(tail) if p.strip())
    return units


def _split_long(unit: _Unit) -> list[_Unit]:
    words = unit.text.split()
    if len(words) <= MAX_WORDS:
        return [unit]
    mid = len(unit.text) / 2
    candidates = [m.end() for m in re.finditer(r"[,;:—–]\s", unit.text)]
    if not candidates:
        # No punctuation: split at the word boundary nearest the middle.
        acc, cut = 0, 0
        for w in words:
            acc += len(w) + 1
            if acc >= mid:
                cut = acc
                break
        candidates = [cut]
    cut = min(candidates, key=lambda c: abs(c - mid))
    first, second = unit.text[:cut].strip(), unit.text[cut:].strip()
    if not first or not second:
        return [unit]
    return _split_long(_Unit(first)) + _split_long(_Unit(second, unit.pause_ms))


def _merge_short(units: list[_Unit]) -> list[_Unit]:
    out: list[_Unit] = []
    carry: _Unit | None = None
    for u in units:
        if carry is not None:
            u = _Unit(f"{carry.text} {u.text}", u.pause_ms)
            carry = None
        if len(u.text.split()) < MIN_WORDS and u.pause_ms is None:
            carry = u
            continue
        out.append(u)
    if carry is not None:
        if out:
            out[-1] = _Unit(f"{out[-1].text} {carry.text}", carry.pause_ms or out[-1].pause_ms)
        else:
            out.append(carry)
    return out


def parse_script(text: str, *, default_chapter_title: str | None = None) -> ParsedScript:
    result = ParsedScript()
    chapter_index = -1
    paragraphs: list[tuple[int, str]] = []
    buffer: list[str] = []

    def flush() -> None:
        if buffer:
            paragraphs.append((max(chapter_index, 0), " ".join(buffer)))
            buffer.clear()

    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("#"):
            flush()
            chapter_index += 1
            title, _, subtitle = line.lstrip("#").strip().partition("|")
            result.chapters.append(
                Chapter(index=chapter_index, title=title.strip(), subtitle=subtitle.strip() or None)
            )
        elif not line:
            flush()
        else:
            buffer.append(line)
    flush()

    if not result.chapters and default_chapter_title:
        result.chapters.append(Chapter(index=0, title=default_chapter_title))

    scene_id = 1
    for p_idx, (ch, para) in enumerate(paragraphs):
        units: list[_Unit] = []
        for u in _split_sentences(para):
            units.extend(_split_long(u))
        units = _merge_short(units)
        for u in units:
            result.scenes.append(
                Scene(
                    scene_id=scene_id,
                    chapter_index=ch,
                    narration=u.text,
                    pause_after_ms=u.pause_ms if u.pause_ms is not None else SENTENCE_GAP_MS,
                )
            )
            scene_id += 1

    # Longer breath at the end of each chapter unless the author set one.
    for i, sc in enumerate(result.scenes):
        nxt = result.scenes[i + 1] if i + 1 < len(result.scenes) else None
        if nxt is not None and nxt.chapter_index != sc.chapter_index and sc.pause_after_ms == SENTENCE_GAP_MS:
            sc.pause_after_ms = CHAPTER_GAP_MS
    if result.scenes and result.scenes[-1].pause_after_ms == SENTENCE_GAP_MS:
        result.scenes[-1].pause_after_ms = 900  # final hold before the outro
    return result
