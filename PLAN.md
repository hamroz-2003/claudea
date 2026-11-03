# Ryzon Stories — daily autopilot plan

This file is the single source of truth for the daily scheduled Claude run.
Read it fully at the start of every run and follow it step by step.

## Channel
- YouTube channel: Ryzon Uz (@ryzonuz), channel ID `UCy8z9DcambwJMM8kcYQUAfw`.
- Language: **English**. Audience: US/UK/CA/AU adults, mostly women 35+.
- Niche: narrated **family drama stories** (betrayal, in-laws, inheritance,
  divorce and kids, forgiveness, second chances). Format: long-form, 12–18 min.
- Goal: YouTube Partner Program — 1,000 subscribers + 4,000 public watch hours.
  Long-form narrated stories are the path to watch hours. Shorts are optional
  extras cut from the same story, not the main product.

## Content rules (monetization-safe)
1. **Every story is original.** Use the repo's СТИЛЬ.md / СТРУКТУРА.md /
   ИНСТРУКЦИЯ.md only as style and structure guidance. Never copy, translate or
   lightly rewrite text from `Семейные драмы.txt` or any other channel's videos.
   Copying topics/angles from successful videos is fine; copying text,
   thumbnails or video is not ("reused content" → monetization rejected).
2. No two episodes may share the same premise + twist. Check `log.md` first.
3. Fiction disclaimer in every description. Invented names only.
4. Advertiser-friendly: no graphic violence, self-harm detail, sexual content,
   or slurs. Conflict lives in dialogue and reactions, not in gore.
5. Vary structure (see СТРУКТУРА.md A/Б/В/Г), narrator (1st/3rd person),
   setting and ending so the channel is not "mass-produced / repetitive".

## Story spec
- 1,900–2,600 words (≈ 13–18 minutes of narration).
- Hook in the first 2–3 sentences: the most shocking moment or a question.
- Short paragraphs, lots of dialogue, plain spoken English, no clichés.
- Mid-story open loop ("But that wasn't the worst part…") around 40% and 70%.
- Ending: resolution + one line inviting comments
  ("What would you have done in my place? Tell me in the comments.").

## Daily run — steps
1. `git pull`, read this file and the last 14 entries of `log.md`.
2. Pick today's premise. Prefer angles similar to what performed best on the
   channel (see stats in `log.md`). Write `episodes/<YYYY-MM-DD>/story.md`.
3. Write `episodes/<YYYY-MM-DD>/meta.json`:
   ```json
   {
     "channel_name": "Ryzon Stories",
     "title": "<= 70 chars, curiosity + emotion, no clickbait lies",
     "thumbnail_text": "2–5 punchy words",
     "thumbnail_accent": "#FFD400",
     "description": "2–3 line teaser\n\nThis is a work of fiction...\n\n#familydrama #storytime",
     "tags": ["family drama", "story time", "..."],
     "category": "PEOPLE_BLOGS",
     "publish_at_utc": "<YYYY-MM-DD>T20:00:00Z"
   }
   ```
   (01:00 Asia/Tashkent = 20:00 UTC of the previous day.)
4. `pip install -r pipeline/requirements.txt` then
   `python3 pipeline/make_video.py episodes/<YYYY-MM-DD>`.
   Check the output: duration 12–18 min, file exists. Extract one frame and look
   at it and at `thumbnail.jpg`.
5. Commit `story.md`, `meta.json`, `video.mp4`, `thumbnail.jpg`,
   `subtitles.srt` and push. Build raw URLs with the **commit SHA**:
   `https://raw.githubusercontent.com/hamroz-2003/claudea/<sha>/episodes/<date>/video.mp4`
6. Run the Make scenario **"Ryzon - YouTube upload"** (Make connector,
   `scenarios_run`) with inputs: video_url, thumbnail_url, title, description,
   tags, publish_at. It uploads the video, sets the thumbnail and sends a
   Telegram message.
7. Run the Make scenario **"Ryzon - YouTube stats"**; append yesterday's numbers
   (views, watch time, subs) for recent videos to `log.md`.
8. Append today's entry to `log.md`: date, title, premise, twist, video ID.
   Commit and push.
9. If any step fails: do not retry more than twice; write the error to
   `log.md`, push, and stop. Never publish a half-rendered or silent video.

## Weekly (Sundays)
- Compare the last 7 videos: which titles/thumbnails/premises got the most
  views per hour in the first 48 h. Write 3 learnings at the top of `log.md`
  and apply them.
