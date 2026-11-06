# FlowCraft Pro Studio

Local documentary production engine: script → anti-repetition shot list and image prompts →
voiceover with millisecond timing → broadcast-style edit (sub-pixel Ken Burns, motivated
transitions, grain, chapter cards, ducked music, sound design) → finished `.mp4` and YouTube
chapters. Everything runs on the user's machine at $0 recurring cost.

| Phase | Scope | Status |
|---|---|---|
| 1 | Core engine, script parser, prompt director, voice aligner | **done** |
| 2 | FFmpeg composer (picture, transitions, subtitles, audio mastering) | **done** |
| 3 | Flow bridge + Chrome extension | not started (see notes below) |
| 4 | Electron + React desktop UI, installers | not started |

## Quick start

Requirements: Python 3.10+, FFmpeg 6+ with libass (`ffmpeg -filters | grep ass`).

```bash
cd apps/core-engine
pip install -r requirements.txt

# 1. new project from a script (see "Script format")
python cli.py new --title "Amir Temur askari" --world "14th-century Timurid Central Asia" \
  --script script.txt --hook 8 \
  --character "Sanjar=22-year-old Timurid soldier, weathered tan skin, short dark beard, worn leather lamellar armor over coarse wool tunic"

# 2. shot plan + image/motion prompts  -> projects/<id>/prompts.json, prompts.txt
python cli.py prompts amir-temur-askari

# 3. voice: free edge-tts per scene ...
python cli.py tts amir-temur-askari
#    ... or align a narrator's single recording to the script
python cli.py align amir-temur-askari narration.mp3

# 4. put visuals in projects/<id>/media as 001.png, 002.png ... (001.mp4 for animated scenes)
python cli.py scan amir-temur-askari

# 5. render: quick 540p preview (placeholders for missing media), then the master
python cli.py render amir-temur-askari --preview
python cli.py render amir-temur-askari
```

Projects live in `~/.flowcraft-pro-studio/projects/` (override with `FLOWCRAFT_DATA`).

Server mode for the desktop UI: `python main.py` serves `http://127.0.0.1:4100` (see API below).

### Script format

```text
# Ulug'tog', 1391 | Yurish boshlanadi        <- chapter title | optional subtitle
1391-yil, Dashti Qipchoq cho'llari. Qo'shin uch oydirki yo'lda. [pause:600]
```

One scene ≈ one spoken sentence. Fragments under 4 words merge forward; sentences over 30
words split at the comma closest to their middle. Pauses are 180 ms between sentences and
450 ms between chapters, unless `[pause:N]` sets one.

## How each requirement is met

### Prompt director: no "stuck" prompts (`modules/prompt_director.py`)
- **Diversity matrix, planned before any LLM call.** Every scene is assigned a shot scale (7
  kinds), a compatible focal subject, a lens, a camera move and a transition. Consecutive scenes
  never share a scale, focal subject or camera move. The scale is also different from the one
  two scenes back. A face shot is always followed by a non-face shot. Chapters open on an
  establishing wide, and lighting stays constant within a chapter for continuity.
- **Two-layer prompts.** Layer A is the visual bible plus character DNA, at most 35 words per
  field, appended verbatim to every prompt. Layer B sends the LLM at most 5 scenes per call, and
  never the prompts it generated earlier, so it has nothing to copy.
- **Similarity gate.** Content-word Jaccard against scenes *i-1* and *i-2*, with style and bible
  vocabulary excluded. Above 0.40, the scene gets a new scale/focal pair and a `do_not_mention`
  list, then is rewritten (up to 2 times).
- **In-frame text.** Years are written in the target language (`1391-yil`, `1391 год`).
  Otherwise the prompt says "no text".
- **LLM backends** (`modules/llm.py`): Gemini (free AI Studio key, rotated on 429), any
  OpenAI-compatible server (local Ollama/LM Studio, or Groq/OpenRouter free tiers), or Anthropic
  (optional, paid). With no LLM configured, a deterministic offline composer is used. It never
  repeats, but its prompts are weaker: it reuses the narration's own words.

### Voice and millisecond alignment (`modules/voice_aligner.py`)
- **TTS mode.** edge-tts renders each scene with word boundaries. Silence under -45 dBFS is
  trimmed with a 30 ms pad, and pauses are inserted. All bookkeeping uses sample counts, so 150
  scenes accumulate no drift. Each cut lands on the first sample of the next sentence's speech.
- **Imported narration.** faster-whisper produces word timestamps. Script words are aligned to
  them using longest-matching-block alignment plus a fuzzy pass for misrecognised words, and
  unmatched words are interpolated. Each cut is then snapped to the real energy onset (5 ms
  frames), which removes Whisper's ±100 ms timestamp jitter.
- **Invariant.** `scene[i].end_ms == scene[i+1].start_ms`, and the timeline starts at 0. This is
  enforced by `validate_timeline`.

### Composer (`modules/human_composer.py`)
- **Frame-exact.** Boundaries are `round(ms·fps/1000)` on absolute positions. The output has
  exactly `round(total_ms·fps/1000)` frames (verified in tests).
- **Sub-pixel camera.** `zoompan` snaps the crop to whole pixels, which is the cause of
  slideshow judder. Instead, each still is Lanczos-scaled once at a supersampled size and
  repeated with `loop`. The moving crop is then resampled by `perspective` with float corners
  and bicubic interpolation. Measured speed jitter on a 0.7 px/frame pan:

  | rig | frame-to-frame speed jitter (std) |
  |---|---|
  | naive `zoompan` | 0.82 px |
  | `zoompan`, 4× supersampled | 0.24 px |
  | **this rig (`perspective`, 2×)** | **0.07 px** |

  The motion curve is a sine ease blended with a linear carry, so the camera never comes to a
  dead stop at a cut. Two-frequency handheld sway is added, 2.5 px by default.
- **Generated clips** (opening hook). The clip is trimmed to the sentence. If it is too short,
  it is slowed by at most 1.3×, and anything beyond that holds the last frame.
- **Transitions.** Roughly 80% hard cuts. Dissolves (400 ms) follow long pauses or appear
  occasionally; chapters get a dip to black (800 ms). Each transition is rendered as its own
  segment *centred on the cut*, so sync is never shifted.
- **Look.** Temporal luma grain, a subtle optical vignette, and an optional 12% screen-blended
  atmosphere overlay (embers, dust, snow, fog, rain) from `assets/overlays/<name>.mp4`.
- **Text** (`modules/subtitles.py`). Documentary `.ass` subtitles: one line, at most 42
  characters, and no stranded last word. Chapter cards fade up out of the black with a slow
  letter-spacing settle and a hairline rule, followed by a lower-third. The chapters are also
  embedded in the MP4 and written as `youtube_chapters.txt`.
- **Audio.**
  - Voice: high-pass, warmth/presence EQ, compressor, then two-pass EBU R128 `loudnorm`
    at -14 LUFS.
  - Music: looped, faded, held at -18 dB, and ducked about 10 dB under narration with
    `sidechaincompress`.
  - SFX and room tone: synthesised procedurally (`modules/sfx_synth.py`), so no third-party
    audio ships with the app, and placed sample-exactly. Files you put in `assets/sfx/` override
    them.
  - Final stage: true-peak limiter.
- **Caching and speed.** Segments are cached by content hash, so changing one scene re-renders
  only that scene's segments. Segments render in parallel.
- **Encoders.** NVENC, VideoToolbox, AMF and QSV are each tested with a real encode before use;
  libx264 is the fallback.

## Engine API (127.0.0.1:4100)

Every route except `/health` requires the header `X-FlowCraft-Token: <data_dir>/engine.token`
(WebSocket: `?token=`). This stops web pages in the user's browser from driving a localhost
service.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status, version |
| GET | `/encoders` | working video encoders |
| GET/PUT | `/settings/llm` | LLM provider config |
| GET/POST/DELETE | `/keys` | BYOK keys (youtube, gemini, ...) with quota rotation |
| GET/POST | `/projects` | list / create from script |
| GET/PATCH | `/projects/{id}` | read / edit bible, render settings |
| PATCH | `/projects/{id}/scenes/{n}` | edit a scene (prompt, motion, transition, ...) |
| POST | `/projects/{id}/prompts` | job: generate prompts (optionally `scene_ids`) |
| POST | `/projects/{id}/voice/tts` | job: edge-tts timeline |
| POST | `/projects/{id}/voice/align` | job: align uploaded narration |
| POST | `/projects/{id}/scenes/{n}/voice` + `/voice/scenes` | per-sentence human takes |
| POST | `/projects/{id}/scenes/{n}/media` | upload / swap a scene visual |
| POST | `/projects/{id}/media/scan` | attach `media/NNN.*` files |
| POST | `/projects/{id}/render` | job: render (`{"preview": true}` for 540p) |
| GET | `/projects/{id}/youtube-chapters` | description-ready chapter list |
| GET | `/jobs`, `/jobs/{id}` | job status |
| WS | `/ws` | live `{"type":"job", progress, message}` events |

## Tests

```bash
cd apps/core-engine && python -m pytest -q      # 24 tests, ~25 s, includes real ffmpeg renders
```

## Notes and limits

- **What the tests cover.** edge-tts and faster-whisper need network access or model downloads,
  so the tests exercise everything around them with injected audio and word timings: trimming,
  word shifting, alignment, onset snapping and timeline assembly. The LLM backends have not
  been run against real APIs; the offline composer and the director logic are tested with a
  fake LLM.
- **Fonts and overlays are not bundled.** Put OFL fonts (Montserrat, Inter, Noto Sans) in
  `assets/fonts/` and atmosphere loops in `assets/overlays/`. Without them, libass falls back
  to system fonts and no overlay is applied.
- **Phase 3 scope.** The bridge will automate the user's own signed-in Flow session within
  normal limits. It will not include reCAPTCHA token harvesting or rotating several Google
  accounts to multiply free quotas: both break Google's terms and put buyers' accounts at risk.
  The daily free-credit figures in the original brief have not been verified and change often.
  `prompts.json` is already the hand-off format, and it also works by hand (paste prompts into
  Flow, save results as `NNN.png` / `NNN.mp4`).
