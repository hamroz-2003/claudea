from modules.llm import LLMClient
from modules.models import FocalSubject, RenderMode, ShotScale, Transition
from modules.prompt_director import (
    BATCH_SIZE,
    PromptDirector,
    content_tokens,
    jaccard,
    plan_matrix,
)

from conftest import make_project

LONG = "# Bir\n" + " ".join(f"Askar {i} qum ustida yurib bordi va ufqqa qaradi." for i in range(60))


def test_matrix_never_repeats_neighbours():
    p = plan_matrix(make_project(LONG))
    sc = p.scenes
    for a, b in zip(sc, sc[1:]):
        assert a.shot_scale != b.shot_scale
        assert a.focal_subject != b.focal_subject
        assert a.camera_motion != b.camera_motion
        if a.focal_subject == FocalSubject.CHARACTER_FACE:
            assert b.focal_subject != FocalSubject.CHARACTER_FACE
    for a, b, c in zip(sc, sc[1:], sc[2:]):
        assert c.shot_scale not in (a.shot_scale, b.shot_scale)
    # all seven scales are used across a long sequence
    assert {s.shot_scale for s in sc} == set(ShotScale)


def test_hook_and_chapter_rules(project):
    plan_matrix(project)
    assert [s.render_mode for s in project.scenes[:2]] == [RenderMode.ANIMATED_VIDEO] * 2
    assert all(s.render_mode == RenderMode.CINEMATIC_IMAGE for s in project.scenes[2:])
    for prev, s in zip(project.scenes, project.scenes[1:]):
        if s.chapter_index != prev.chapter_index:
            assert s.transition_in == Transition.DIP_TO_BLACK
            assert s.shot_scale == ShotScale.EXTREME_WIDE
    hard = sum(1 for s in project.scenes[1:] if s.transition_in == Transition.HARD_CUT)
    assert hard / (len(project.scenes) - 1) >= 0.6


def test_offline_prompts_contain_bible_and_dna(project):
    PromptDirector(None).run(project)
    for s in project.scenes:
        assert "Kodak Vision3" in s.image_prompt
        assert s.shot_scale.value in s.image_prompt
        if "Sanjar" in s.characters_in_scene:
            assert "lamellar armor" in s.image_prompt
    year = next(s for s in project.scenes if "1391" in s.narration)
    if year.on_screen_text:
        assert year.on_screen_text == "1391-yil"
        assert '"1391-yil"' in year.image_prompt


class RecordingLLM(LLMClient):
    """Returns the SAME description for every scene: the classic stuck-prompt bug."""

    def __init__(self):
        self.calls = []

    def complete_json(self, system, user, schema):
        self.calls.append(user)
        ids = [int(line.split(":")[1]) for line in user.splitlines() if line.startswith("scene_id:")]
        banned = "do_not_mention" in user
        out = []
        for i in ids:
            if banned:
                desc = f"Unique fresh composition number {i} with river reeds and a broken cart wheel"
            else:
                desc = "Soldier on horseback on a desert dune at sunset with banners and tents behind"
            out.append({"scene_id": i, "description": desc, "motion": "slow push in"})
        return {"scenes": out}


def test_layer_b_is_stateless_and_batched(project):
    llm = RecordingLLM()
    PromptDirector(llm).run(project)
    batch_calls = [c for c in llm.calls if "do_not_mention" not in c]
    for call in batch_calls:
        assert call.count("scene_id:") <= BATCH_SIZE
        # no previously generated prompt text is ever sent back to the model
        assert "Soldier on horseback" not in call


def test_similarity_gate_rewrites_stuck_prompts(project):
    llm = RecordingLLM()
    PromptDirector(llm).run(project)
    rewritten = [s for s in project.scenes if s.prompt_rewrites]
    assert rewritten, "identical descriptions must trigger the gate"
    for s in project.scenes:
        assert s.similarity_to_prev <= 0.40 or s.prompt_rewrites == 2


def test_tokens_and_jaccard():
    a = content_tokens("Sanjar's horses drink at the river")
    b = content_tokens("The horse drinks from a river")
    assert jaccard(a, b) > 0.3
    assert jaccard(a, content_tokens("Map of Samarkand on a table")) == 0
