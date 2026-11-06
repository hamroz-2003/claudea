import numpy as np
import pytest

from modules.models import Scene
from modules.voice_aligner import (
    SR,
    SceneAudio,
    align_full_audio,
    align_words_to_scenes,
    assemble_timeline,
    snap_to_onset,
    trim_silence,
    validate_timeline,
    write_wav,
)

from conftest import make_project


def tone(sec, f=220.0, amp=0.4):
    t = np.arange(int(sec * SR)) / SR
    return (np.sin(2 * np.pi * f * t) * amp * 32767).astype(np.int16)


def test_trim_silence_reports_lead():
    x = np.concatenate([np.zeros(SR // 2, np.int16), tone(1.0), np.zeros(SR // 4, np.int16)])
    y, lead = trim_silence(x)
    assert abs(lead - (SR // 2 - int(0.03 * SR))) <= SR // 100
    assert abs(len(y) - (SR + int(0.06 * SR))) <= SR // 50


def test_timeline_is_contiguous_and_drift_free(tmp_path):
    p = make_project("# A\n" + " ".join(f"Gap number {i} is spoken here." for i in range(150)))
    rng = np.random.default_rng(1)
    clips = [SceneAudio(tone(rng.uniform(1.1, 4.7)), []) for _ in p.scenes]
    assemble_timeline(p, clips, tmp_path / "master.wav")
    validate_timeline(p)
    # exact sample bookkeeping: total = lead-in + speech + pauses
    total_samples = int(round(0.35 * SR)) + sum(len(c.samples) for c in clips) + sum(
        int(round(s.pause_after_ms * SR / 1000)) for s in p.scenes)
    assert abs(p.total_ms - total_samples * 1000 / SR) <= 0.5
    # every cut sits on its scene's first sample of speech
    for s in p.scenes[1:]:
        assert s.start_ms == s.speech_start_ms


def test_snap_to_onset_finds_syllable():
    x = np.concatenate([tone(1.0), np.zeros(int(0.3 * SR), np.int16), tone(1.0, 330)])
    true_onset = 1300
    for guess in (1180, 1250, 1360, 1400):
        assert abs(snap_to_onset(x, SR, guess) - true_onset) <= 10


def test_word_alignment_survives_recognition_errors():
    scenes = ["Bir ikki uch to'rt.", "Besh olti yetti sakkiz.", "To'qqiz o'n o'n bir."]
    rec = [("bir", 0.0, 0.3), ("ikki", 0.3, 0.6), ("uch", 0.6, 0.9), ("tort", 0.9, 1.2),
           ("besh", 1.6, 1.9), ("olti", 1.9, 2.2), ("yeti", 2.2, 2.5), ("sakkiz", 2.5, 2.8),
           ("eee", 2.9, 3.0), ("to'qqiz", 3.4, 3.7), ("o'n", 3.7, 3.9), ("o'n", 3.9, 4.1), ("bir", 4.1, 4.4)]
    out = align_words_to_scenes(scenes, rec)
    assert [round(o[0], 2) for o in out] == [0.0, 1.6, 3.4]
    assert round(out[0][1], 2) == 1.2


def test_full_audio_alignment_with_given_words(tmp_path):
    p = make_project("# A\nBir ikki uch to'rt besh.\nOlti yetti sakkiz to'qqiz o'n.\n")
    audio = np.concatenate([np.zeros(int(0.2 * SR), np.int16), tone(1.5),
                            np.zeros(int(0.4 * SR), np.int16), tone(1.5, 300), np.zeros(int(0.3 * SR), np.int16)])
    path = tmp_path / "narr.wav"
    write_wav(path, audio)
    words = [(w, 0.2 + i * 0.3, 0.5 + i * 0.3) for i, w in enumerate("bir ikki uch to'rt besh".split())]
    words += [(w, 2.05 + i * 0.3, 2.35 + i * 0.3) for i, w in enumerate("olti yetti sakkiz to'qqiz o'n".split())]
    align_full_audio(p, path, tmp_path, words=words)
    s1, s2 = p.scenes
    assert s1.start_ms == 0 and s1.end_ms == s2.start_ms
    assert abs(s2.start_ms - 2100) <= 10        # snapped to the real onset, not Whisper's 2050
    assert s2.end_ms == 3900


def test_tts_pipeline_with_stubbed_engine(tmp_path, monkeypatch):
    """Exercises decode -> trim -> word shift -> timeline without network access."""
    import asyncio

    from modules import voice_aligner as va

    async def fake_tts(text, voice, rate, out_path, retries=4):
        # 200 ms of leading silence, then "speech", like real edge-tts output.
        audio = np.concatenate([np.zeros(int(0.2 * SR), np.int16), tone(0.8 + 0.01 * len(text))])
        write_wav(out_path, audio)
        return [(w, 200 + i * 150, 330 + i * 150) for i, w in enumerate(text.split()[:4])]

    monkeypatch.setattr(va, "_tts_one", fake_tts)
    p = make_project("# A\nBirinchi gap shu yerda.\nIkkinchi gap ham bor.\n")
    asyncio.run(va.generate_tts_timeline(p, tmp_path))
    validate_timeline(p)
    s1, s2 = p.scenes
    assert (tmp_path / "audio" / "voice_master.wav").exists()
    # word times are shifted by the trimmed lead (200 ms minus the 30 ms pad)
    assert abs(s1.words[0].start_ms - (s1.speech_start_ms + 30)) <= 12
    assert s2.start_ms == s2.speech_start_ms
