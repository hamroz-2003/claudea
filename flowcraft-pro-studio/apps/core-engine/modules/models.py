"""Typed data model shared by every engine module.

The project file (``project.json``) is the single source of truth for a video:
the script, the visual bible, every scene's prompt / timing / asset, and the
render settings. Every module reads a ``Project`` and returns an updated one,
so any stage can be re-run in isolation (regenerate one scene, re-align audio,
re-render) without touching the rest.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class RenderMode(str, Enum):
    ANIMATED_VIDEO = "ANIMATED_VIDEO"
    CINEMATIC_IMAGE = "CINEMATIC_IMAGE"


class ShotScale(str, Enum):
    EXTREME_WIDE = "Extreme Wide Panorama"
    MEDIUM_ACTION = "Medium Action Shot"
    TIGHT_CLOSEUP = "Tight Close-Up on Hands/Objects"
    OVER_SHOULDER = "Over-the-Shoulder View"
    LOW_ANGLE_HERO = "Low-Angle Heroic Shot"
    HIGH_ANGLE_TACTICAL = "High-Angle / Bird's-Eye Tactical View"
    DUTCH_TENSION = "Dutch-Angle Tension Shot"


class FocalSubject(str, Enum):
    CHARACTER_FACE = "main character's face and expression"
    ENVIRONMENT_DETAIL = "an environmental detail"
    SECONDARY_GROUP = "a secondary group of people"
    OBJECT_CLOSEUP = "a meaningful object in close detail"
    MAP_DOCUMENT = "a map, manuscript or document"
    WIDE_LANDSCAPE_ACTION = "a wide landscape with action in it"


class CameraMotion(str, Enum):
    PUSH_IN = "slow_push_in"
    PULL_OUT = "slow_pull_out"
    PAN_LEFT = "slow_pan_left"
    PAN_RIGHT = "slow_pan_right"
    DIAGONAL_DRIFT = "diagonal_drift"
    TILT_UP = "slow_tilt_up"
    TILT_DOWN = "slow_tilt_down"
    STATIC_BREATH = "static_breath"


class Transition(str, Enum):
    """Transition *into* the next scene, decided per cut."""

    HARD_CUT = "hard_cut"
    DISSOLVE = "dissolve"
    DIP_TO_BLACK = "dip_to_black"


class Character(BaseModel):
    name: str
    dna: str = Field(..., description="Immutable physical description, max 35 words")
    aliases: list[str] = Field(default_factory=list)


class VisualBible(BaseModel):
    """Layer A of the prompt system. Never changes across scenes."""

    world: str = Field(..., description="Era / place / world, e.g. '14th-century Timurid Central Asia'")
    film_stock: str = (
        "35mm Kodak Vision3 500T, natural chiaroscuro lighting, fine organic grain, "
        "realistic weathered textures, zero plastic sheen"
    )
    palette: str = "muted earth tones, desaturated highlights"
    characters: list[Character] = Field(default_factory=list)
    language: str = Field("uz", description="Target audio language code for in-frame text")


class WordTiming(BaseModel):
    text: str
    start_ms: int
    end_ms: int


class Scene(BaseModel):
    scene_id: int
    chapter_index: int = 0
    narration: str
    pause_after_ms: int = 180

    # Prompt director output
    render_mode: RenderMode = RenderMode.CINEMATIC_IMAGE
    shot_scale: Optional[ShotScale] = None
    focal_subject: Optional[FocalSubject] = None
    characters_in_scene: list[str] = Field(default_factory=list)
    scene_description: str = ""
    on_screen_text: Optional[str] = None
    image_prompt: str = ""
    motion_prompt: str = ""
    similarity_to_prev: float = 0.0
    prompt_rewrites: int = 0

    # Editorial
    camera_motion: CameraMotion = CameraMotion.PUSH_IN
    transition_in: Transition = Transition.HARD_CUT
    sfx_cue: Optional[str] = None
    atmosphere: Optional[str] = None

    # Media
    asset_path: Optional[str] = None
    voice_path: Optional[str] = None

    # Timing (filled by voice_aligner); end_ms of scene i == start_ms of scene i+1
    start_ms: int = 0
    end_ms: int = 0
    speech_start_ms: int = 0
    speech_end_ms: int = 0
    words: list[WordTiming] = Field(default_factory=list)

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms


class Chapter(BaseModel):
    index: int
    title: str
    subtitle: Optional[str] = None


class RenderSettings(BaseModel):
    width: int = 1920
    height: int = 1080
    fps: int = 60
    supersample: int = Field(2, ge=1, le=4, description="Ken Burns rig resamples at width*supersample")
    encoder: str = "auto"
    video_bitrate: str = "16M"
    crf: int = 18
    intermediate_crf: int = 12
    dissolve_ms: int = 400
    dip_ms: int = 800
    grain_strength: int = Field(7, ge=0, le=30)
    vignette: bool = True
    handheld_px: float = Field(2.5, ge=0, le=8, description="Handheld sway amplitude in output pixels")
    burn_subtitles: bool = True
    chapter_cards: bool = True
    music_path: Optional[str] = None
    music_level_db: float = -18.0
    music_duck_db: float = -28.0
    sfx_enabled: bool = True
    sfx_level_db: float = -22.0
    room_tone_db: float = -48.0
    voice_lufs: float = -14.0
    parallel_jobs: int = 0  # 0 = cpu_count // 2
    font_family: str = "Montserrat"


class Project(BaseModel):
    project_id: str
    title: str
    language: str = "uz"
    voice: str = "uz-UZ-SardorNeural"
    tts_rate: str = "-5%"
    hook_video_count: int = 8
    chapter_openers_animated: bool = False
    bible: VisualBible
    chapters: list[Chapter] = Field(default_factory=list)
    scenes: list[Scene] = Field(default_factory=list)
    render: RenderSettings = Field(default_factory=RenderSettings)
    voice_master_path: Optional[str] = None
    output_path: Optional[str] = None

    def chapter_title(self, index: int) -> Optional[str]:
        for ch in self.chapters:
            if ch.index == index:
                return ch.title
        return None

    @property
    def total_ms(self) -> int:
        return self.scenes[-1].end_ms if self.scenes else 0
