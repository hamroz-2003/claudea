// 4-modul testi. Asl 4.x assets papkasi kerak:  FC_ASSETS=<assets> node --test flowcraft-v2/tests/presets.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), vm = require("vm"), path = require("path");
const A = process.env.FC_ASSETS;

test("14 presets, generic names, no channel branding, no fixed script structure", { skip: !A && "FC_ASSETS not set" }, () => {
  const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of [path.join(A, "templates.js"), path.join(A, "tpl_doc.js"), path.join(__dirname, "../assets/presets-v2.js")])
    vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
  vm.runInContext("globalThis.__R={DOC_TPL,DOC_STY,TPL_SAMPLES,TPL}", ctx);
  const { DOC_TPL, DOC_STY, TPL_SAMPLES, TPL } = ctx.__R;
  assert.equal(DOC_TPL.length, 14); assert.equal(TPL, DOC_TPL); assert.equal(DOC_STY.length, 14);
  assert.ok(DOC_TPL.some((t) => t.id === "d_dayin"));
  const BAD = /OverSimplified|YouTube style|Pixar|Genius History|Mr\.? ?Finance|Paint Professor|Ink Explainer|Horror Shorts Party|Built On You\b|DoomStick|Maven Life|youtube\.com|@[A-Za-z]|Nella|Zenn\d*|genius_history|explainer96/;
  const walk = (v, p) => {
    if (typeof v === "string") assert.ok(!BAD.test(v), `${p}: ${v.slice(0, 120)}`);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === "object") for (const k of Object.keys(v)) if (!["id", "style", "v", "tpl"].includes(k)) walk(v[k], `${p}.${k}`);
  };
  walk(DOC_TPL, "TPL"); walk(DOC_STY, "STY"); walk(TPL_SAMPLES, "SAMPLES");
  for (const t of DOC_TPL) {
    assert.ok(!("channel" in t), t.id + " channel"); assert.equal(t.plan, "", t.id + " plan");
    assert.ok(!/TUZILISH/.test(t.rules || ""), t.id + " structure rule");
    assert.ok(t.img && t.img.lock && t.thumbs && t.thumbs.length, t.id + " keeps visual style + thumbnails");
    assert.ok(typeof t.seo === "undefined" || typeof t.seo === "string", t.id + " seo is text");
  }
});
