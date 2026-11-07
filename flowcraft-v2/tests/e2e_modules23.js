// 2- va 3-modul brauzer testi: yamoqlangan assets ni 8812-portda serve qiling va hook.mp4 + new005.png ni N papkaga qo'ying.
// node tests/e2e_modules23.js <N papka>
const { chromium, devices } = require('playwright');
const fs = require('fs');
const N = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:8812/index.html');
  await page.waitForFunction(() => window.FCV2 && FCV2.openScenes && typeof newProject === 'function' && bootReady === true, null, { timeout: 30000 });
  const mp4 = fs.readFileSync(N + '/hook.mp4').toString('base64');
  // ---- project: 16 sentences, prompts, refs, voice, images (+ MP4 for frame 3 alongside its PNG)
  await page.evaluate(async (mp4) => {
    const POOL = "tong otmasdan bomdod o'qildi Sanjar otini sug'ordi qal'a devorlari baland qorovullar olov yoqdi kechasi sovuq tushdi".split(' ');
    let seed = 9; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const frames = [], spans = []; let t = 0.4;
    for (let i = 0; i < 16; i++) {
      const ws = Array.from({ length: 6 + Math.floor(r() * 6) }, () => POOL[Math.floor(r() * POOL.length)]);
      if (i === 2) ws.push('birdan', 'dushman', 'hujum', 'qildi');
      frames.push(ws.join(' ') + '.');
      ws.forEach(() => { const d = 0.3; spans.push([t, t + d]); t += d + 0.04; }); t += 0.35;
    }
    const rate = 16000, pcm = new Float32Array(Math.ceil((t + 0.5) * rate));
    for (const [a, b] of spans) for (let k = Math.floor(a * rate); k < Math.floor(b * rate); k++) pcm[k] = 0.3 * Math.sin(k * 0.08);
    await newProject({ topic: 'V2 jadval testi' });
    P.frames = frames;
    P.prompts = frames.map((f, i) => i === 6 ? '' : `cinematic history illustration, scene ${i + 1}`);
    P.refs = { chars: [{ name: 'Sanjar', desc: 'young Timurid soldier' }], locs: [{ name: "Qal'a", desc: 'stone fortress', range: '1-8' }] };
    const wav = Uint8Array.from(atob(FCSync.wavBase64(pcm, rate)), c => c.charCodeAt(0));
    const au = await upload('audio', new File([wav], 'ovoz.wav', { type: 'audio/wav' }), { clear: true, name: 'ovoz.wav' });
    P.media.audio = { rel: au.rel, name: 'ovoz.wav', duration: au.duration };
    let first = true;
    for (let i = 1; i <= 16; i++) {
      if (i === 11) continue;                       // one sentence without a picture
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 22},45%,38%)`; g.fillRect(0, 0, 320, 180); g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.fillText(String(i).padStart(3, '0'), 70, 112);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      await upload('images', new File([blob], String(i).padStart(3, '0') + '.png', { type: 'image/png' }), { clear: first }); first = false;
    }
    const vb = Uint8Array.from(atob(mp4), c => c.charCodeAt(0));
    await upload('images', new File([vb], '003.mp4', { type: 'video/mp4' }), {});
    await refreshImages(); save(true);
  }, mp4);

  // ---- module 2 UI: step 5 auto hook button
  await page.evaluate(() => go(5, true));
  await page.waitForSelector('[data-ahead="auto"]', { state: 'visible' });
  await page.click('[data-ahead="auto"]');
  const sel = await page.inputValue('#animSel');
  console.log('step 5 · auto hook selection →', sel);
  // ---- step 6 hook panel
  await page.evaluate(() => go(6, true));
  await page.waitForSelector('#v2HookPanel .v2h');
  await page.waitForTimeout(400);
  await page.locator('#v2HookPanel').screenshot({ path: N + '/m2_hookpanel.png' });
  console.log('step 6 · hook panel rows:', await page.locator('#v2HookPanel .v2h').count(), '| MP4 status:', (await page.textContent('#v2HookPanel .row.between .v2c')).trim());
  await page.click('[data-hacc]');
  const hooksAfter = await page.evaluate(() => Object.keys(P.anim).map(Number));
  console.log('accepted hooks (P.anim):', hooksAfter.join(','));

  // ---- timeline: MP4 replaces its PNG, user hooks used
  const tl = await page.evaluate(async () => { const ok = await buildTimeline0(); return { ok, clips: P.tl.clips.map(c => ({ img: c.img.split('/').pop(), segs: c.segs, hook: !!c.hook, fit: c.fit, motion: c.motion })), hooks: P.sync.report.hooks, src: P.sync.report.hookSource }; });
  const c3 = tl.clips.filter(c => c.segs.includes(3));
  console.log('timeline ok:', tl.ok, '| clips:', tl.clips.length, '| frame 3 →', JSON.stringify(c3), '| hooks', tl.hooks.join(','), '(' + tl.src + ')');
  console.log('frame 11 (no picture) covered by:', JSON.stringify(tl.clips.find(c => c.segs.includes(11))));

  // ---- module 3: scene table
  await page.evaluate(() => go(5, true));
  await page.click('#v2ScenesBtn');
  await page.waitForSelector('#v2Scenes .v2s');
  await page.waitForTimeout(600);
  const cards = await page.locator('#v2Scenes .v2s').count();
  const stats = (await page.textContent('#v2Scenes .v2stats')).replace(/\s+/g, ' ');
  console.log('scene table · cards:', cards, '| stats:', stats);
  console.log('card 3 header:', (await page.textContent('#v2Scenes .v2s[data-k="3"] .v2hr')).replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: N + '/m3_table_desktop.png' });
  // edit prompt of scene 7
  await page.fill('#v2Scenes .v2s[data-k="7"] textarea[data-f="prompt"]', 'hand-written prompt for scene 7');
  console.log('edited prompt saved:', await page.evaluate(() => P.prompts[6]));
  // toggle hook on scene 9
  await page.check('#v2Scenes .v2s[data-k="9"] [data-act="hook"]');
  console.log('scene 9 hook:', await page.evaluate(() => !!P.anim[9]), '| motion field shown:', await page.locator('#v2Scenes .v2s[data-k="9"] textarea[data-f="motion"]').count());
  // filter: only problems
  await page.click('#v2Scenes [data-flt="todo"]');
  console.log('filter "Kamchiligi bor" →', await page.$$eval('#v2Scenes .v2s', els => els.map(e => e.dataset.k).join(',')));
  // replace media of scene 11 (was missing)
  await page.click('#v2Scenes [data-flt="all"]');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#v2Scenes .v2s[data-k="11"] [data-act="media"]')]);
  await fc.setFiles(N + '/new005.png');
  await page.waitForFunction(() => (P.media.images || []).some(m => /^011\./.test(m.name)), null, { timeout: 15000 });
  console.log('scene 11 now has:', await page.evaluate(() => P.media.images.filter(m => /^011\./.test(m.name)).map(m => m.name).join(',')));
  // rebuild from the table
  await page.click('#v2Scenes [data-top="build"]');
  await page.waitForFunction(() => P.sync && P.tl.clips.length === 16, null, { timeout: 30000 });
  console.log('after rebuild: clips', await page.evaluate(() => P.tl.clips.length), '| scene 11 own image:', await page.evaluate(() => P.tl.clips.some(c => /011\./.test(c.img) && c.segs.join() === '11')));
  await page.waitForTimeout(500);
  await page.screenshot({ path: N + '/m3_table_desktop2.png' });
  // ---- editor timeline hook markers
  await page.click('#v2Scenes [data-top="edit"]');
  await page.waitForSelector('.cl[data-ci]', { timeout: 15000 });
  await page.waitForTimeout(500);
  console.log('editor clips with hook marker:', await page.$$eval('.cl.hook', els => els.map(e => +e.dataset.ci + 1).join(',')));
  // ---- mobile layout of the table (same page/storage, phone viewport)
  await page.setViewportSize({ width: 412, height: 915 });
  await page.evaluate(() => FCV2.openScenes());
  await page.waitForSelector('#v2Scenes .v2s');
  await page.waitForTimeout(600);
  await page.screenshot({ path: N + '/m3_table_mobile.png' });
  await page.evaluate(() => { FCV2.closeScenes(); go(6, true); });
  await page.waitForSelector('#v2HookPanel .v2h'); await page.waitForTimeout(400);
  await page.screenshot({ path: N + '/m2_hook_mobile.png', fullPage: false });
  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
