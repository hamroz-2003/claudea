from modules.script_parser import CHAPTER_GAP_MS, MAX_WORDS, SENTENCE_GAP_MS, parse_script


def test_chapters_and_scenes():
    r = parse_script("# One | sub\nFirst sentence is here. Second sentence follows now.\n# Two\nThird one is here too.")
    assert [c.title for c in r.chapters] == ["One", "Two"]
    assert r.chapters[0].subtitle == "sub"
    assert [s.chapter_index for s in r.scenes] == [0, 0, 1]
    assert [s.scene_id for s in r.scenes] == [1, 2, 3]


def test_chapter_gap_and_explicit_pause():
    r = parse_script("# A\nOne two three four five. Six seven eight nine ten. [pause:700]\nEleven twelve thirteen fourteen.\n# B\nFifteen sixteen seventeen eighteen.")
    assert r.scenes[0].pause_after_ms == SENTENCE_GAP_MS
    assert r.scenes[1].pause_after_ms == 700
    assert r.scenes[2].pause_after_ms == CHAPTER_GAP_MS


def test_short_fragments_merge_and_long_sentences_split():
    long = ", ".join(["so'z " * 6] * 8) + "."
    r = parse_script(f"Ha. Bu jumla yetarlicha uzun bo'ladi. {long}")
    assert r.scenes[0].narration.startswith("Ha. Bu jumla")
    assert all(len(s.narration.split()) <= MAX_WORDS for s in r.scenes)
    assert len(r.scenes) >= 3


def test_decimals_and_years_not_split():
    r = parse_script("Narx 3.5 tanga edi va hamma rozi bo'ldi. 1391-yil. edi bu juda muhim yil.")
    assert "3.5 tanga" in r.scenes[0].narration
