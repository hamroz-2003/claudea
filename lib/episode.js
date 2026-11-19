import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { lintEpisode, HELP_LINE } from './policy.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCHEMA_PATH = path.join(ROOT, 'content', 'episode.schema.json');
export const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));

const ajv = new Ajv({ allErrors: true, useDefaults: true, strict: false });
const validateSchema = ajv.compile(schema);

export const totalSec = (scenes) => scenes.reduce((a, s) => a + s.durationSec, 0);

export const fmtTime = (sec) => {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${String(m).padStart(2, '0')}:${r}`;
};

/** YouTube bo'limlari: kamida 3 ta, birinchisi 00:00 da, har biri >= 10 s. Aks holda bo'sh. */
export function chapters(ep) {
  const out = [];
  let t = 0;
  ep.scenes.forEach((s, i) => {
    if (s.chapter || i === 0) out.push({ t, title: s.chapter || 'Intro' });
    t += s.durationSec;
  });
  const total = t;
  const ok = out.length >= 3 && out.every((c, i) => ((out[i + 1]?.t ?? total) - c.t) >= 10);
  return ok ? out : [];
}

/** Yakuniy YouTube tavsifi: matn + avtomatik bo'limlar + (kerak bo'lsa) yordam manbalari */
export function buildDescription(ep) {
  let d = ep.description.trim();
  const ch = chapters(ep);
  if (ch.length) {
    const block = ch.map((c) => `${fmtTime(c.t)} ${c.title}`).join('\n');
    // Hashtaglar oxirida qolishi uchun bo'limlarni ulardan oldin qo'yamiz
    const m = d.match(/\n\s*(#[^\n]+)\s*$/);
    d = m ? `${d.slice(0, m.index).trim()}\n\n${block}\n\n${m[1].trim()}` : `${d}\n\n${block}`;
  }
  if (ep.sensitive && !d.includes('findahelpline')) d += HELP_LINE;
  return d.slice(0, 5000);
}

/** To'liq tekshiruv: sxema + mantiq + dramaturgiya (retention) + siyosat */
export function validateEpisode(ep, { history = [] } = {}) {
  const errors = [];
  const warnings = [];
  if (!validateSchema(ep)) {
    for (const e of validateSchema.errors) errors.push(`sxema ${e.instancePath || '/'} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`);
    return { ok: false, errors, warnings, durationSec: 0 };
  }

  const castIds = new Set();
  for (const c of ep.cast) { if (castIds.has(c.id)) errors.push(`cast: "${c.id}" takrorlangan`); castIds.add(c.id); }
  if (ep.cast[0].hoodie !== 'yellow') errors.push("cast[0] — bosh qahramon Ryzon, hudi 'yellow' bo'lishi shart (brend)");
  const sceneIds = new Set();
  for (const s of ep.scenes) {
    if (sceneIds.has(s.id)) errors.push(`scene: id "${s.id}" takrorlangan`);
    sceneIds.add(s.id);
    for (const c of s.characters) if (!castIds.has(c.castId)) errors.push(`${s.id}: castId "${c.castId}" cast ro'yxatida yo'q`);
    if (s.caption) {
      const cps = s.caption.text.length / s.durationSec;
      if (cps > 17) warnings.push(`${s.id}: matn o'qish uchun juda tez (${cps.toFixed(1)} belgi/s > 17). durationSec ni oshiring yoki matnni qisqartiring`);
    }
  }

  const dur = totalSec(ep.scenes);
  if (ep.format === 'long' && (dur < 120 || dur > 600)) errors.push(`davomiylik ${dur.toFixed(1)} s — uzun video 120–600 s bo'lishi kerak`);
  if (ep.format === 'short' && (dur < 15 || dur > 60)) errors.push(`davomiylik ${dur.toFixed(1)} s — Shorts 15–60 s bo'lishi kerak`);
  if (ep.format === 'long' && dur < 170) warnings.push(`davomiylik ${fmtTime(dur)} — tomosha soatlari uchun 3:00–5:00 maqsad qilinadi`);

  if (ep.shortScenes) {
    const missing = ep.shortScenes.filter((id) => !sceneIds.has(id));
    if (missing.length) errors.push(`shortScenes: mavjud bo'lmagan sahnalar: ${missing.join(', ')}`);
    const sd = totalSec(ep.scenes.filter((s) => ep.shortScenes.includes(s.id)));
    if (sd < 15 || sd > 60) errors.push(`shortScenes jami ${sd.toFixed(1)} s — 15–60 s bo'lishi kerak`);
  } else if (ep.format === 'long') warnings.push("shortScenes yo'q — Shorts kesmasi birinchi 55 soniyadan olinadi");

  // Dramaturgiya: kanal ma'lumotlariga ko'ra tomoshabinlar 0:28–0:46 oralig'ida ketmoqda
  const first = ep.scenes.slice(0, 2).map((s) => s.beat);
  if (!first.some((b) => b === 'cold_open' || b === 'hook')) warnings.push("birinchi 2 sahnada 'cold_open' yoki 'hook' yo'q — birinchi 5 soniyada savol tug'dirish shart");
  let t = 0;
  const beatsAt = ep.scenes.map((s) => { const at = t / dur; t += s.durationSec; return { beat: s.beat, at }; });
  if (!beatsAt.some((b) => (b.beat === 'turn' || b.beat === 'climax') && b.at >= 0.3 && b.at <= 0.65)) warnings.push("30–65% oralig'ida 'turn' yoki 'climax' yo'q — o'rtada burilish bo'lmasa tomoshabin ketadi");
  let tt = 0; let longestSetup = 0; let run = 0;
  for (const s of ep.scenes) { run = s.beat === 'setup' ? run + s.durationSec : 0; longestSetup = Math.max(longestSetup, run); tt += s.durationSec; }
  if (longestSetup > 45) warnings.push(`ketma-ket 'setup' sahnalari ${longestSetup.toFixed(0)} s — 45 s dan oshmasin (retention tushadi)`);
  const last = ep.scenes[ep.scenes.length - 1];
  if (ep.format === 'long' && !(last.beat === 'cta' && last.durationSec >= 10)) warnings.push("oxirgi sahna 'cta' (>= 10 s) bo'lsin — end screen uchun joy");
  if (ep.format === 'long' && !chapters(ep).length) warnings.push("YouTube bo'limlari hosil bo'lmadi (kamida 3 ta 'chapter', har biri >= 10 s)");

  const pol = lintEpisode(ep, history);
  errors.push(...pol.block);
  warnings.push(...pol.warn);

  return { ok: errors.length === 0, errors, warnings, durationSec: dur };
}

export function loadEpisode(p) {
  const file = fs.statSync(p).isDirectory() ? path.join(p, 'episode.json') : p;
  return { file, dir: path.dirname(file), episode: JSON.parse(fs.readFileSync(file, 'utf-8')) };
}

export function printReport(name, r) {
  console.log(`\n=== ${name} — ${r.ok ? "✅ O'TDI" : '❌ XATO'} (${fmtTime(r.durationSec)}) ===`);
  for (const e of r.errors) console.log(`  ✗ ${e}`);
  for (const w of r.warnings) console.log(`  ⚠ ${w}`);
}
