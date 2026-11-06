// Brauzer testi: yamoqlangan assets papkasini serve qiling (python3 -m http.server 8811), keyin: node tests/e2e_browser.js
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:8811/index.html');
  await page.waitForFunction(() => window.FCV2 && window.FCSync && typeof newProject === 'function' && bootReady === true, null, { timeout: 30000 });
  const runOnce = async (withAI) => page.evaluate(async (withAI) => {
    // --- synthetic narration: 24 sentences, some merged, comma pauses
    const POOL = "tong otmasdan bomdod o'qildi jangchilar oxirgi non burdasini bo'lishdi amir qo'shini cho'l bo'ylab yurdi shamol qumni ko'tardi otlar bezovta edi".split(' ');
    let seed = 5; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const frames = [], truth = [], spans = []; let t = 0.4;
    for (let i = 0; i < 24; i++) {
      const n = 6 + Math.floor(r() * 7), ws = Array.from({ length: n }, () => POOL[Math.floor(r() * POOL.length)]);
      if (i === 2) ws.push('birdan', 'olov', 'chiqdi');          // spoken too, so script == audio
      frames.push(ws.join(' ') + (i === 2 ? '!' : '.')); truth.push(t);
      ws.forEach((w, k) => { const d = 0.25 + r() * 0.1; spans.push([t, t + d]); t += d + 0.04; if (k === 3 && i % 3 === 0) t += 0.4; });
      t += i % 5 === 2 ? 0.02 : 0.3;
    }
    const rate = 16000, dur = t + 0.5, pcm = new Float32Array(Math.ceil(dur * rate));
    for (const [a, b] of spans) for (let k = Math.floor(a * rate); k < Math.floor(b * rate); k++) pcm[k] = 0.3 * Math.sin(k * 0.08);
    const wav = Uint8Array.from(atob(FCSync.wavBase64(pcm, rate)), c => c.charCodeAt(0));

    await newProject({ topic: 'V2 test' });
    P.frames = frames;
    const au = await upload('audio', new File([wav], 'ovoz.wav', { type: 'audio/wav' }), { clear: true, name: 'ovoz.wav' });
    P.media.audio = { rel: au.rel, name: au.name || 'ovoz.wav', duration: au.duration || dur };
    // 23 images for 24 sentences (frame 9 has no picture), named like FlowCraft output
    let first = true;
    for (let i = 1; i <= 24; i++) {
      if (i === 9) continue;
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 15},50%,40%)`; g.fillRect(0, 0, 320, 180); g.fillStyle = '#fff'; g.font = '60px sans-serif'; g.fillText(String(i), 120, 110);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      await upload('images', new File([blob], String(i).padStart(3, '0') + '.png', { type: 'image/png' }), { clear: first }); first = false;
    }
    await refreshImages();
    P.align = 'smart';
    if (withAI) {
      // mock Gemini: answer each STT window with phrases built from the true word timings (+jitter)
      const words = []; let wi = 0;
      spans.forEach((sp) => words.push(sp));
      const allWords = frames.join(' ').replace(/[!.]/g, '').split(/\s+/);
      GM.keys = () => ['test-key'];
      let calls = 0;
      GM.json = async (req) => {
        const txt = req.contents[0].parts[1].text, len = parseFloat(txt.match(/\(([\d.]+) s\)/)[1]);
        const w0 = calls++ * (75 - 4);
        const segs = [];
        for (let i = 0; i < spans.length; i += 4) {
          const g = spans.slice(i, i + 4).filter(([a, b]) => a >= w0 && b <= w0 + len); if (!g.length) continue;
          const j = (Math.sin(i) * 0.12);
          segs.push({ start: +(g[0][0] - w0 + j).toFixed(2), end: +(g[g.length - 1][1] - w0 + j).toFixed(2), text: allWords.slice(i, i + g.length).join(' ') });
        }
        return '```json\n' + JSON.stringify({ segments: segs }) + '\n```';
      };
    }
    const t0 = performance.now();
    const ok = await buildTimeline0();
    const plan = FCV2.ttsPlan(frames.join(' '), 300);
    return {
      ok, ms: Math.round(performance.now() - t0), truth, dur,
      clips: P.tl.clips.map(c => ({ img: c.img.split('/').pop(), start: c.start, d: c.d, motion: c.motion, hook: !!c.hook, segs: c.segs })),
      report: P.sync && P.sync.report, total: P.tl.total,
      ttsParts: plan.parts.length, ttsFirst: plan.first,
    };
  }, withAI);
  for (const withAI of [false, true]) {
  const res = await runOnce(withAI);
  console.log(withAI ? '\n=== with (mocked) Gemini STT' : '=== without AI key');
  console.log(JSON.stringify({ ok: res.ok, ms: res.ms, report: res.report, clips: res.clips.length }, null, 0));
  let maxErr = 0, contiguous = true, own = true;
  res.clips.forEach((c, k) => {
    const n = parseInt(c.img, 10);
    if (!c.segs.includes(n)) own = false;
    const e = Math.abs(c.start - res.truth[c.segs[0] - 1]); if (c.segs[0] > 1) maxErr = Math.max(maxErr, e);
    if (k && Math.abs(res.clips[k - 1].start + res.clips[k - 1].d - c.start) > 0.002) contiguous = false;
  });
  { const es = res.clips.filter(c => c.segs[0] > 1).map(c => Math.abs(c.start - res.truth[c.segs[0] - 1])).sort((a, b) => a - b);
    console.log('start errors: median', (es[Math.floor(es.length / 2)] * 1000).toFixed(0), 'ms | >0.5 s:', es.filter(x => x > 0.5).length, 'of', es.length); }
  console.log('every image on its own sentence:', own, '| contiguous:', contiguous, '| max start error:', (maxErr * 1000).toFixed(0), 'ms');
  console.log('clip 8 (covers missing #9):', JSON.stringify(res.clips.find(c => c.img === '008.png')));
  console.log('motions:', res.clips.map(c => c.motion).join(','), '| hooks:', res.clips.filter(c => c.hook).map(c => c.img).join(','));
  }
  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
