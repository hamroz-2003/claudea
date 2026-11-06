"""Anti-repetition cinematography prompt director.

Fixes the "stuck prompt" failure where 150 image prompts drift back to the
first scene's setting. Three mechanisms, applied in order:

1. **Cinematography Diversity Matrix** (deterministic, before any LLM call):
   every scene gets a shot scale, focal subject, lens, camera motion and
   transition. Consecutive scenes never share a shot scale or focal subject,
   a face shot is always followed by a non-face shot, and chapter lighting is
   held constant (human DPs keep continuity inside a sequence).
2. **Two-layer stateless prompting**: Layer A (visual bible + character DNA,
   max 35 words each) is appended verbatim to every prompt; Layer B asks the
   LLM for at most 5 scenes at a time and *never* includes previously
   generated prompts, so the model cannot copy earlier compositions.
3. **Jaccard similarity gate**: a scene whose content tokens overlap the two
   previous scenes by more than 40% is rewritten with a different shot scale
   / focal subject and an explicit list of banned nouns.
"""

from __future__ import annotations

import logging
import random
import re
import unicodedata
from dataclasses import dataclass
from typing import Callable, Iterable, Optional

from .llm import LLMClient, LLMError
from .models import (
    CameraMotion,
    FocalSubject,
    Project,
    RenderMode,
    Scene,
    ShotScale,
    Transition,
)

log = logging.getLogger("flowcraft.director")

BATCH_SIZE = 5
SIMILARITY_THRESHOLD = 0.40
MAX_REWRITES = 2
BIBLE_WORD_LIMIT = 35

ProgressFn = Callable[[float, str], None]

# --------------------------------------------------------------------------- #
# Vocabulary
# --------------------------------------------------------------------------- #

SHOT_ORDER: list[ShotScale] = list(ShotScale)

LENS: dict[ShotScale, str] = {
    ShotScale.EXTREME_WIDE: "24mm anamorphic, deep focus, small figures against vast terrain",
    ShotScale.MEDIUM_ACTION: "40mm, waist-up framing, motion in frame",
    ShotScale.TIGHT_CLOSEUP: "100mm macro, shallow depth of field, tactile surface detail",
    ShotScale.OVER_SHOULDER: "50mm, foreground shoulder soft and out of focus",
    ShotScale.LOW_ANGLE_HERO: "28mm from knee height looking up, sky behind subject",
    ShotScale.HIGH_ANGLE_TACTICAL: "35mm from high above, top-down geometry of the scene",
    ShotScale.DUTCH_TENSION: "35mm, camera tilted 12 degrees, uneasy composition",
}

# Which focal subjects a shot scale can physically show.
COMPATIBLE: dict[ShotScale, list[FocalSubject]] = {
    ShotScale.EXTREME_WIDE: [FocalSubject.WIDE_LANDSCAPE_ACTION, FocalSubject.ENVIRONMENT_DETAIL,
                             FocalSubject.SECONDARY_GROUP],
    ShotScale.MEDIUM_ACTION: [FocalSubject.SECONDARY_GROUP, FocalSubject.CHARACTER_FACE,
                              FocalSubject.ENVIRONMENT_DETAIL],
    ShotScale.TIGHT_CLOSEUP: [FocalSubject.OBJECT_CLOSEUP, FocalSubject.MAP_DOCUMENT,
                              FocalSubject.CHARACTER_FACE],
    ShotScale.OVER_SHOULDER: [FocalSubject.MAP_DOCUMENT, FocalSubject.SECONDARY_GROUP,
                              FocalSubject.WIDE_LANDSCAPE_ACTION],
    ShotScale.LOW_ANGLE_HERO: [FocalSubject.CHARACTER_FACE, FocalSubject.SECONDARY_GROUP,
                               FocalSubject.ENVIRONMENT_DETAIL],
    ShotScale.HIGH_ANGLE_TACTICAL: [FocalSubject.WIDE_LANDSCAPE_ACTION, FocalSubject.SECONDARY_GROUP,
                                    FocalSubject.MAP_DOCUMENT],
    ShotScale.DUTCH_TENSION: [FocalSubject.CHARACTER_FACE, FocalSubject.SECONDARY_GROUP,
                              FocalSubject.OBJECT_CLOSEUP],
}

MOTION_PREF: dict[ShotScale, list[CameraMotion]] = {
    ShotScale.EXTREME_WIDE: [CameraMotion.PAN_RIGHT, CameraMotion.PAN_LEFT, CameraMotion.PULL_OUT],
    ShotScale.MEDIUM_ACTION: [CameraMotion.DIAGONAL_DRIFT, CameraMotion.PUSH_IN, CameraMotion.PAN_LEFT],
    ShotScale.TIGHT_CLOSEUP: [CameraMotion.PUSH_IN, CameraMotion.STATIC_BREATH, CameraMotion.TILT_DOWN],
    ShotScale.OVER_SHOULDER: [CameraMotion.PUSH_IN, CameraMotion.PAN_RIGHT],
    ShotScale.LOW_ANGLE_HERO: [CameraMotion.TILT_UP, CameraMotion.PUSH_IN],
    ShotScale.HIGH_ANGLE_TACTICAL: [CameraMotion.PULL_OUT, CameraMotion.DIAGONAL_DRIFT],
    ShotScale.DUTCH_TENSION: [CameraMotion.PUSH_IN, CameraMotion.STATIC_BREATH],
}

LIGHTING = {
    "night": "moonlight and firelight only, deep shadows, warm practical sources",
    "dawn": "cold blue dawn light, low sun breaking the horizon, long shadows",
    "dusk": "low amber sunset light, dust glowing in the air",
    "storm": "overcast storm light, flat grey sky, wet surfaces",
    "interior": "single window light, smoky interior, warm falloff",
    "day": "hard midday sun, bleached highlights, sharp shadows",
}
LIGHTING_KEYWORDS = {
    "night": ["night", "tun", "kech", "oy ", "yulduz", "ночь", "ноч", "луна", "gulxan", "campfire"],
    "dawn": ["dawn", "tong", "sahar", "рассвет", "утр", "sunrise"],
    "dusk": ["dusk", "sunset", "shom", "kechqurun", "закат", "вечер"],
    "storm": ["storm", "rain", "yomg'ir", "bo'ron", "дожд", "бур", "гроз"],
    "interior": ["palace", "saroy", "chodir", "tent", "room", "xona", "дворец", "шатёр", "комнат"],
}

ATMOSPHERE_KEYWORDS = {
    "embers": ["fire", "olov", "gulxan", "flame", "огон", "костёр", "костер", "пожар"],
    "dust": ["desert", "cho'l", "chol", "qum", "dust", "chang", "пустын", "пыль", "степ", "dasht"],
    "snow": ["snow", "qor", "winter", "qish", "снег", "зим"],
    "fog": ["fog", "tuman", "mist", "туман", "дым", "smoke", "tutun"],
    "rain": ["rain", "yomg'ir", "дожд"],
}

MAP_WORDS = ["map", "xarita", "карта", "manuscript", "qo'lyozma", "letter", "maktub", "yorliq",
             "document", "hujjat", "письм", "указ", "chronicle", "solnoma", "летопис"]

STOPWORDS = set("""
a an the of and or but in on at to for from by with as is are was were be been it its this that these those
there their they he she his her him we our you your i me my not no so than then into over under about after
before while when where which who whom what how all any some more most very can could would should will just
va bilan ham uchun bu u shu o'sha esa edi ekan emas yo'q bor deb bo'lib bo'ldi qilib qildi
dan ga da ni ning lar chunki agar ammo lekin yoki har bir hamma hali endi yana keyin oldin juda
и в на с по для от до из к у о об что как это так же не но а или его её их он она они мы вы я
scene shot view angle close wide frame camera lens focus light lighting background foreground image
""".split())


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    return re.sub(r"[ʻʼ’‘`´]", "'", text)


def content_tokens(text: str, extra_stop: Iterable[str] = ()) -> set[str]:
    """Stemmed content-word set used by the similarity gate.

    A 5-character prefix acts as a cheap stemmer that works across Uzbek
    (agglutinative suffixes), Russian (case endings) and English plurals.
    """
    stop = STOPWORDS | set(extra_stop)
    words = re.findall(r"[^\W\d_]+(?:'[^\W\d_]+)?", _normalize(text))
    words = [w[:-2] if w.endswith("'s") else w for w in words]
    return {w[:5] for w in words if len(w) > 2 and w not in stop and w[:5] not in stop}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _limit_words(text: str, limit: int = BIBLE_WORD_LIMIT) -> str:
    words = text.split()
    if len(words) <= limit:
        return text.strip()
    log.warning("Visual bible field truncated to %d words: %r", limit, text)
    return " ".join(words[:limit]).rstrip(",;")


def _has_any(text: str, words: Iterable[str]) -> bool:
    t = _normalize(text)
    return any(w in t for w in words)


_YEAR_RE = re.compile(
    r"\b(1[0-9]{3}|20[0-9]{2})(?:\s*|-)(yil|yili|yilda|год|году|года|г\.|year)?", re.IGNORECASE
)


def detect_on_screen_text(narration: str, language: str) -> Optional[str]:
    m = _YEAR_RE.search(narration)
    if not m:
        return None
    year = m.group(1)
    suffix = {"uz": "-yil", "ru": " год"}.get(language, "")
    return f"{year}{suffix}"


# --------------------------------------------------------------------------- #
# Matrix planning
# --------------------------------------------------------------------------- #

@dataclass
class _Slot:
    shot: ShotScale
    focal: FocalSubject


class DiversityPlanner:
    def __init__(self, seed: int):
        self.rng = random.Random(seed)
        self.last_used: dict[ShotScale, int] = {s: -100 for s in SHOT_ORDER}

    def pick(self, i: int, prev: list[_Slot], hints: dict, forbid: Optional[_Slot] = None) -> _Slot:
        recent_shots = {p.shot for p in prev[-2:]}
        if forbid:
            recent_shots.add(forbid.shot)
        prev_focal = prev[-1].focal if prev else None

        if hints.get("chapter_open") and ShotScale.EXTREME_WIDE not in recent_shots:
            shot_pool = [ShotScale.EXTREME_WIDE]
        else:
            shot_pool = [s for s in SHOT_ORDER if s not in recent_shots]
            if hints.get("document"):
                pref = [s for s in shot_pool if FocalSubject.MAP_DOCUMENT in COMPATIBLE[s]]
                shot_pool = pref or shot_pool
            # Least-recently-used first, ties broken randomly -> cycles through all 7
            # scales without feeling like a metronome.
            shot_pool.sort(key=lambda s: (self.last_used[s], self.rng.random()))
            shot_pool = shot_pool[:3]
            self.rng.shuffle(shot_pool)
            shot_pool.sort(key=lambda s: self.last_used[s])

        for shot in shot_pool:
            focals = list(COMPATIBLE[shot])
            self.rng.shuffle(focals)
            if hints.get("document") and FocalSubject.MAP_DOCUMENT in focals:
                focals.remove(FocalSubject.MAP_DOCUMENT)
                focals.insert(0, FocalSubject.MAP_DOCUMENT)
            for focal in focals:
                if focal == prev_focal:
                    continue
                if prev_focal == FocalSubject.CHARACTER_FACE and focal == FocalSubject.CHARACTER_FACE:
                    continue
                if forbid and focal == forbid.focal:
                    continue
                if focal == FocalSubject.CHARACTER_FACE and not hints.get("has_character", True):
                    continue
                self.last_used[shot] = i
                return _Slot(shot, focal)
        # Every pool exhausted (only possible with heavy constraints): take any legal pair.
        for shot in SHOT_ORDER:
            if shot in recent_shots:
                continue
            for focal in COMPATIBLE[shot]:
                if focal != prev_focal:
                    self.last_used[shot] = i
                    return _Slot(shot, focal)
        return _Slot(ShotScale.MEDIUM_ACTION, FocalSubject.ENVIRONMENT_DETAIL)


def _chapter_lighting(text: str, chapter_index: int) -> str:
    for key, words in LIGHTING_KEYWORDS.items():
        if _has_any(text, words):
            return LIGHTING[key]
    cycle = ["day", "dusk", "dawn", "day", "interior"]
    return LIGHTING[cycle[chapter_index % len(cycle)]]


def _atmosphere(text: str) -> Optional[str]:
    for key, words in ATMOSPHERE_KEYWORDS.items():
        if _has_any(text, words):
            return key
    return None


def _characters_in(text: str, project: Project) -> list[str]:
    t = _normalize(text)
    found = []
    for ch in project.bible.characters:
        names = [ch.name, *ch.aliases]
        if any(re.search(rf"\b{re.escape(_normalize(n))}", t) for n in names if n):
            found.append(ch.name)
    return found


def plan_matrix(project: Project, seed: int = 1391) -> Project:
    """Assign the full editorial plan to every scene (no LLM involved)."""
    planner = DiversityPlanner(seed)
    slots: list[_Slot] = []
    scenes = project.scenes
    prev_motion: Optional[CameraMotion] = None
    rng = random.Random(seed + 7)
    since_dissolve = 0

    for i, sc in enumerate(scenes):
        prev_sc = scenes[i - 1] if i else None
        chapter_open = prev_sc is None or prev_sc.chapter_index != sc.chapter_index
        named = _characters_in(sc.narration, project)
        hints = {
            "chapter_open": chapter_open,
            "document": _has_any(sc.narration, MAP_WORDS) or bool(_YEAR_RE.search(sc.narration)),
            "has_character": bool(project.bible.characters),
        }
        slot = planner.pick(i, slots, hints)
        slots.append(slot)
        sc.shot_scale, sc.focal_subject = slot.shot, slot.focal

        if named:
            sc.characters_in_scene = named
        elif slot.focal == FocalSubject.CHARACTER_FACE or slot.shot == ShotScale.OVER_SHOULDER:
            sc.characters_in_scene = [project.bible.characters[0].name] if project.bible.characters else []
        else:
            sc.characters_in_scene = []

        motions = [m for m in MOTION_PREF[slot.shot] if m != prev_motion] or [CameraMotion.PUSH_IN]
        sc.camera_motion = motions[rng.randrange(len(motions))]
        prev_motion = sc.camera_motion

        is_hook = i < project.hook_video_count
        opener_anim = project.chapter_openers_animated and chapter_open and i > 0
        sc.render_mode = RenderMode.ANIMATED_VIDEO if (is_hook or opener_anim) else RenderMode.CINEMATIC_IMAGE

        # Transition into this scene. ~80% hard cuts like broadcast documentaries.
        if prev_sc is None:
            sc.transition_in = Transition.HARD_CUT
        elif chapter_open:
            sc.transition_in = Transition.DIP_TO_BLACK
            since_dissolve = 0
        elif not is_hook and (prev_sc.pause_after_ms >= 350 or (since_dissolve >= 4 and rng.random() < 0.22)):
            sc.transition_in = Transition.DISSOLVE
            since_dissolve = 0
        else:
            sc.transition_in = Transition.HARD_CUT
            since_dissolve += 1

        if sc.transition_in == Transition.DIP_TO_BLACK:
            sc.sfx_cue = "impact"
        elif sc.transition_in == Transition.DISSOLVE:
            sc.sfx_cue = "whoosh_soft"
        elif is_hook and i > 0 and i % 2 == 0:
            sc.sfx_cue = "whoosh"
        else:
            sc.sfx_cue = None

        sc.atmosphere = _atmosphere(sc.narration)
        sc.on_screen_text = detect_on_screen_text(sc.narration, project.bible.language) \
            if slot.focal in (FocalSubject.MAP_DOCUMENT, FocalSubject.OBJECT_CLOSEUP,
                              FocalSubject.WIDE_LANDSCAPE_ACTION) else None
    return project


# --------------------------------------------------------------------------- #
# Prompt assembly
# --------------------------------------------------------------------------- #

def layer_a(project: Project) -> str:
    b = project.bible
    return _limit_words(f"{b.world}. {b.film_stock}, {b.palette}", BIBLE_WORD_LIMIT * 2)


def character_dna(project: Project, names: list[str]) -> str:
    parts = []
    for ch in project.bible.characters:
        if ch.name in names:
            parts.append(f"{ch.name}: {_limit_words(ch.dna)}")
    return "; ".join(parts)


def assemble_prompt(project: Project, sc: Scene, lighting: str) -> str:
    pieces = [f"{sc.shot_scale.value}, {LENS[sc.shot_scale]}.", sc.scene_description.rstrip(". ") + "."]
    dna = character_dna(project, sc.characters_in_scene)
    if dna:
        pieces.append(dna.rstrip(".") + ".")
    if sc.on_screen_text:
        pieces.append(f'The only visible text is "{sc.on_screen_text}", hand-lettered in period style, '
                      f"spelled exactly.")
    else:
        pieces.append("No text, letters or watermarks anywhere in frame.")
    pieces.append(f"{lighting[:1].upper()}{lighting[1:]}.")
    pieces.append(layer_a(project).rstrip(".") + ".")
    return " ".join(p for p in pieces if p.strip(" ."))


def motion_prompt_offline(sc: Scene) -> str:
    cam = {
        CameraMotion.PUSH_IN: "slow dolly push-in",
        CameraMotion.PULL_OUT: "slow dolly pull-back",
        CameraMotion.PAN_LEFT: "slow pan left",
        CameraMotion.PAN_RIGHT: "slow pan right",
        CameraMotion.DIAGONAL_DRIFT: "gentle diagonal drift",
        CameraMotion.TILT_UP: "slow tilt up",
        CameraMotion.TILT_DOWN: "slow tilt down",
        CameraMotion.STATIC_BREATH: "locked-off camera with subtle handheld breathing",
    }[sc.camera_motion]
    atmo = {
        "embers": "embers drifting upward", "dust": "fine dust carried by wind",
        "snow": "light snow falling", "fog": "fog rolling slowly", "rain": "rain streaking down",
    }.get(sc.atmosphere or "", "cloth and hair moving slightly in the wind")
    return f"{cam}, {atmo}, natural human micro-movements, no morphing, no sudden cuts"


# --------------------------------------------------------------------------- #
# LLM layer B
# --------------------------------------------------------------------------- #

SYSTEM_PROMPT = """You are the director of photography on a broadcast history documentary.
For each narration line you receive, describe ONE concrete, physically shootable frame.

Rules:
- Obey the assigned shot scale and focal subject exactly. They differ from the neighbouring scenes on purpose.
- Describe only what the camera sees: subject, action, setting, props, weather. 25-45 words.
- Period-accurate clothing, architecture, weapons and materials for the stated world.
- Never write style words (cinematic, epic, 8k, masterpiece, hyperrealistic, trending). Style is added later.
- Never reuse a setting or composition idea from another line in this batch.
- If on_screen_text is given, include an object that carries exactly that text. Otherwise describe no text.
- "description" must be written in English, even when the narration is in another language.
- "motion" (for animated scenes): one short sentence of camera + subject movement for an image-to-video model.
Return JSON: {"scenes": [{"scene_id": int, "description": str, "motion": str}]}"""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "scene_id": {"type": "integer"},
                    "description": {"type": "string"},
                    "motion": {"type": "string"},
                },
                "required": ["scene_id", "description", "motion"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["scenes"],
    "additionalProperties": False,
}


def _scene_brief(project: Project, sc: Scene, banned: Iterable[str] = ()) -> str:
    lines = [
        f"scene_id: {sc.scene_id}",
        f"narration: {sc.narration}",
        f"shot_scale: {sc.shot_scale.value}",
        f"focal_subject: {sc.focal_subject.value}",
        f"render: {'animated video clip' if sc.render_mode == RenderMode.ANIMATED_VIDEO else 'still frame'}",
    ]
    if sc.characters_in_scene:
        lines.append(f"characters_visible: {', '.join(sc.characters_in_scene)}")
    else:
        lines.append("characters_visible: none of the named characters")
    if sc.on_screen_text:
        lines.append(f'on_screen_text: "{sc.on_screen_text}"')
    banned = list(banned)
    if banned:
        lines.append(f"do_not_mention: {', '.join(banned)}")
    return "\n".join(lines)


def _world_header(project: Project) -> str:
    chars = "; ".join(f"{c.name} = {_limit_words(c.dna)}" for c in project.bible.characters) or "none"
    return f"WORLD: {project.bible.world}\nCHARACTERS: {chars}\n"


def _llm_batch(llm: LLMClient, project: Project, batch: list[Scene]) -> dict[int, dict]:
    user = _world_header(project) + "\n\n".join(_scene_brief(project, s) for s in batch)
    data = llm.complete_json(SYSTEM_PROMPT, user, RESPONSE_SCHEMA)
    items = data.get("scenes", []) if isinstance(data, dict) else data
    return {int(it["scene_id"]): it for it in items if "scene_id" in it and it.get("description")}


OFFLINE_FOCAL: dict[FocalSubject, str] = {
    FocalSubject.CHARACTER_FACE: "{who}'s face fills the frame, eyes reacting to the moment",
    FocalSubject.ENVIRONMENT_DETAIL: "Telling detail of the surroundings, worn surfaces and period materials",
    FocalSubject.SECONDARY_GROUP: "A small group of period-dressed people caught mid-action",
    FocalSubject.OBJECT_CLOSEUP: "A single meaningful object resting in natural light, every scratch visible",
    FocalSubject.MAP_DOCUMENT: "An aged hand-drawn map or manuscript on rough wood, ink faded",
    FocalSubject.WIDE_LANDSCAPE_ACTION: "Vast landscape with tiny figures moving across it",
}
OFFLINE_CONTEXT = "story context"


def _offline_description(project: Project, sc: Scene) -> str:
    """Deterministic composition when no LLM is configured.

    It keeps the narration's own nouns (in the narration language) so the
    image model still gets the scene's content, framed by the assigned focal
    subject. Quality is lower than an LLM rewrite but never repetitive.
    """
    keywords = [w for w in re.findall(r"[^\W\d_]+(?:'[^\W\d_]+)?", sc.narration)
                if len(w) > 3 and _normalize(w) not in STOPWORDS]
    seen, uniq = set(), []
    for w in keywords:
        k = _normalize(w)
        if k not in seen:
            seen.add(k)
            uniq.append(w)
    gist = ", ".join(uniq[:8]) or sc.narration
    who = sc.characters_in_scene[0] if sc.characters_in_scene else None
    focal = OFFLINE_FOCAL[sc.focal_subject].format(who=who or "A weathered figure")
    return f"{focal}; {OFFLINE_CONTEXT}: {gist}"


class PromptDirector:
    def __init__(self, llm: Optional[LLMClient], *, seed: int = 1391,
                 threshold: float = SIMILARITY_THRESHOLD):
        self.llm = llm
        self.seed = seed
        self.threshold = threshold

    def _style_stop(self, project: Project) -> set[str]:
        stop = content_tokens(layer_a(project))
        for ch in project.bible.characters:
            stop |= content_tokens(ch.dna)
            stop |= content_tokens(ch.name)
        for lens in LENS.values():
            stop |= content_tokens(lens)
        for f in FocalSubject:
            stop |= content_tokens(f.value)
        # Template scaffolding of the offline composer is not scene content.
        for phrase in OFFLINE_FOCAL.values():
            stop |= content_tokens(phrase.format(who=""))
        stop |= content_tokens(OFFLINE_CONTEXT)
        return stop

    def similarity(self, project: Project, scenes: list[Scene], i: int, stop: set[str]) -> tuple[float, set[str]]:
        cur = content_tokens(scenes[i].scene_description, stop)
        worst, overlap = 0.0, set()
        for j in (i - 1, i - 2):
            if j < 0:
                continue
            other = content_tokens(scenes[j].scene_description, stop)
            s = jaccard(cur, other)
            if s > worst:
                worst, overlap = s, cur & other
        return worst, overlap

    def run(self, project: Project, progress: Optional[ProgressFn] = None,
            only_scene_ids: Optional[set[int]] = None) -> Project:
        progress = progress or (lambda p, m: None)
        if only_scene_ids is None:
            plan_matrix(project, self.seed)
        scenes = project.scenes
        targets = [s for s in scenes if only_scene_ids is None or s.scene_id in only_scene_ids]

        chapter_light: dict[int, str] = {}
        for ch_idx in {s.chapter_index for s in scenes}:
            text = " ".join(s.narration for s in scenes if s.chapter_index == ch_idx)
            title = project.chapter_title(ch_idx) or ""
            chapter_light[ch_idx] = _chapter_lighting(f"{title} {text}", ch_idx)

        # Layer B: stateless batches of 5.
        total = max(len(targets), 1)
        for b in range(0, len(targets), BATCH_SIZE):
            batch = targets[b:b + BATCH_SIZE]
            results: dict[int, dict] = {}
            if self.llm is not None:
                try:
                    results = _llm_batch(self.llm, project, batch)
                except LLMError as e:
                    log.warning("LLM batch %d failed (%s); using offline composer", b // BATCH_SIZE, e)
            for sc in batch:
                item = results.get(sc.scene_id)
                if item:
                    sc.scene_description = item["description"].strip()
                    sc.motion_prompt = (item.get("motion") or "").strip() or motion_prompt_offline(sc)
                else:
                    sc.scene_description = _offline_description(project, sc)
                    sc.motion_prompt = motion_prompt_offline(sc)
            progress(min(0.85, 0.85 * (b + len(batch)) / total), f"Prompts {b + len(batch)}/{total}")

        # Similarity gate, in timeline order so each check sees final neighbours.
        stop = self._style_stop(project)
        index = {s.scene_id: i for i, s in enumerate(scenes)}
        for n, sc in enumerate(targets):
            i = index[sc.scene_id]
            sim, overlap = self.similarity(project, scenes, i, stop)
            rewrites = 0
            while sim > self.threshold and rewrites < MAX_REWRITES:
                rewrites += 1
                self._rewrite(project, scenes, i, overlap)
                sim, overlap = self.similarity(project, scenes, i, stop)
            sc.similarity_to_prev = round(sim, 3)
            sc.prompt_rewrites = rewrites
            sc.image_prompt = assemble_prompt(project, sc, chapter_light[sc.chapter_index])
            if sc.render_mode == RenderMode.ANIMATED_VIDEO and not sc.motion_prompt:
                sc.motion_prompt = motion_prompt_offline(sc)
            progress(0.85 + 0.15 * (n + 1) / total, f"Similarity gate {n + 1}/{total}")
        return project

    def _rewrite(self, project: Project, scenes: list[Scene], i: int, overlap: set[str]) -> None:
        sc = scenes[i]
        prev_slots = [_Slot(s.shot_scale, s.focal_subject) for s in scenes[max(0, i - 2):i]]
        planner = DiversityPlanner(self.seed + i * 31 + sc.prompt_rewrites)
        slot = planner.pick(i, prev_slots, {"has_character": bool(project.bible.characters)},
                            forbid=_Slot(sc.shot_scale, sc.focal_subject))
        sc.shot_scale, sc.focal_subject = slot.shot, slot.focal
        if slot.focal != FocalSubject.CHARACTER_FACE and slot.shot != ShotScale.OVER_SHOULDER:
            sc.characters_in_scene = _characters_in(sc.narration, project)
        log.info("Scene %d too similar to neighbours (overlap %s) -> %s / %s",
                 sc.scene_id, sorted(overlap), slot.shot.value, slot.focal.value)
        if self.llm is not None:
            try:
                user = _world_header(project) + _scene_brief(project, sc, banned=sorted(overlap))
                data = self.llm.complete_json(SYSTEM_PROMPT, user, RESPONSE_SCHEMA)
                items = data.get("scenes", []) if isinstance(data, dict) else data
                res = {int(it["scene_id"]): it for it in items if it.get("description")}
                item = res.get(sc.scene_id)
                if item:
                    sc.scene_description = item["description"].strip()
                    sc.motion_prompt = (item.get("motion") or "").strip() or motion_prompt_offline(sc)
                    return
            except (LLMError, KeyError, ValueError, TypeError) as e:
                log.warning("Rewrite of scene %d failed: %s", sc.scene_id, e)
        sc.scene_description = _offline_description(project, sc)
        sc.motion_prompt = motion_prompt_offline(sc)
