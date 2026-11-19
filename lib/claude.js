import fs from 'node:fs';
import path from 'node:path';
import { run } from './run.js';
import { schema, validateEpisode, ROOT } from './episode.js';

const CLAUDE = process.env.CLAUDE_BIN || 'claude';

/**
 * Claude Code'ni headless rejimda chaqiradi va JSON qaytaradi.
 * Xavfsizlik: faqat Read/Glob/Grep — Claude faqat ma'lumot yozadi, kod yoki fayllarni o'zgartirmaydi.
 */
export function askClaudeJSON(prompt, { jsonSchema, maxTurns = 8, label = 'Claude' } = {}) {
  const args = ['-p', '--output-format', 'json', '--permission-mode', 'dontAsk', '--allowedTools', 'Read,Glob,Grep', '--max-turns', String(maxTurns)];
  if (process.env.CLAUDE_MODEL) args.push('--model', process.env.CLAUDE_MODEL);
  // Windows cmd orqali katta JSON'ni argument sifatida uzatish ishonchsiz — u holda sxema promptda beriladi
  const canPassSchema = jsonSchema && process.platform !== 'win32';
  if (canPassSchema) args.push('--json-schema', JSON.stringify(jsonSchema));
  const fullPrompt = canPassSchema || !jsonSchema ? prompt : `${prompt}\n\nJSON SCHEMA (javob shu sxemaga 100% mos bo'lsin):\n${JSON.stringify(jsonSchema)}`;

  const { stdout } = run(CLAUDE, args, { label, input: fullPrompt, cwd: ROOT, timeoutMs: 15 * 60 * 1000 });
  let envelope;
  try { envelope = JSON.parse(stdout); } catch { throw new Error(`Claude javobi JSON emas:\n${stdout.slice(0, 2000)}`); }
  if (envelope.is_error) throw new Error(`Claude xatosi (${envelope.subtype || 'error'}): ${envelope.result || ''}`);
  if (envelope.structured_output && typeof envelope.structured_output === 'object') return envelope.structured_output;
  const text = typeof envelope.result === 'string' ? envelope.result.trim() : '';
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try { return JSON.parse(candidate); } catch { throw new Error(`Claude javobidan JSON ajratib bo'lmadi:\n${text.slice(0, 2000)}`); }
}

const readIf = (p, max = 6000) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf-8').slice(0, max) : '');

export function buildEpisodePrompt({ topic, history = [], analyticsSummary = '' }) {
  const recent = history.slice(-15).map((h) => `- ${h.title} [${h.pillar}]${h.views != null ? ` — ${h.views} views` : ''}`).join('\n') || '- (hali yo\'q)';
  return `You are the head writer of the YouTube channel "Ryzon" (Ryzon Uz): silent 2.5D animated short films about deep real-life problems.
Read these project files first: CLAUDE.md, docs/SSENARIY_QOIDALARI.md, episodes/sample/episode.json (gold-standard example).

TASK: write ONE new original episode as JSON for this brief:
${JSON.stringify(topic, null, 2)}

AUDIENCE DATA (from the channel's own analytics):
${analyticsSummary || '- 52% male 18–34; top countries India, USA, Philippines, Bangladesh, Kenya. Viewers come mostly from the Home feed (browse) — the thumbnail+title decide everything.\n- Biggest drop-off happens between 0:28 and 0:46: the second act must escalate immediately.\n- Family stories convert subscribers 3x better than average.'}

RECENT VIDEOS (do NOT repeat their premise, title pattern or twist):
${recent}

HARD RULES:
- On-screen text is English, short, human, no clichés, no moralizing at the end. Story shown through actions and short captions.
- The protagonist is always cast[0] "ryzon" with hoodie "yellow".
- Structure: cold_open with the most intriguing moment (<= 5 s) → hook → fast setup (<= 45 s total) → tension that escalates before 0:30 → turn/climax between 35%–65% → resolution with an image, not a lecture → cta scene (>= 12 s) for the end screen.
- Long format: 170–300 seconds total, 25–45 scenes, each 2–8 s (cta may be 12 s). Vary environment, camera move and pose; no more than 2 identical consecutive setups.
- Reading speed: caption characters / durationSec <= 15.
- Put "chapter" on 4–6 scenes (first scene included). NEVER write timestamps in the description.
- "shortScenes": 6–10 scene ids that make a self-contained 35–55 s vertical cut ending on a question.
- Title: <= 70 characters preferred, curiosity gap, no explicit/sexual words, no brand names, no clickbait lies. Thumbnail text: 2–3 words, must NOT repeat the title.
- Description: 2–4 short paragraphs + a comment question + max 3 hashtags at the very end.
- If the topic touches addiction, depression, self-harm or abuse: "sensitive": true, show recovery and help-seeking, never show methods.
- Output ONLY the JSON object.`;
}

/** Epizod yaratish + validatsiya + avtomatik tuzatish (maks. 2 urinish) */
export function generateEpisodeJSON({ topic, history, analyticsSummary, attempts = 3 }) {
  let prompt = buildEpisodePrompt({ topic, history, analyticsSummary });
  let last;
  for (let i = 1; i <= attempts; i++) {
    const ep = askClaudeJSON(prompt, { jsonSchema: schema, label: `Claude#${i}`, maxTurns: 10 });
    const r = validateEpisode(ep, { history });
    if (r.ok) return { episode: ep, report: r };
    last = r;
    console.warn(`[Claude#${i}] validatsiyadan o'tmadi:\n - ${r.errors.join('\n - ')}`);
    prompt = `Your previous episode JSON failed validation. Fix ALL errors and return the full corrected JSON only.\nERRORS:\n- ${r.errors.join('\n- ')}\nWARNINGS (fix if possible):\n- ${r.warnings.join('\n- ')}\n\nPREVIOUS JSON:\n${JSON.stringify(ep)}`;
  }
  throw new Error(`Claude ${attempts} urinishda ham to'g'ri epizod bera olmadi:\n - ${last.errors.join('\n - ')}`);
}

export const analyticsSummaryText = () => readIf(path.join(ROOT, 'data', 'analytics', 'latest-summary.md'), 4000);
