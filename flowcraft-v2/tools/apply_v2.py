#!/usr/bin/env python3
"""Apply FlowCraft V2 (module 1 + module 2 core) to a FlowCraft 4.x assets folder.

    python3 apply_v2.py <original_assets_dir> <output_assets_dir>

Every replacement must match exactly once, so the script refuses to run
against code it does not recognise instead of silently producing a broken app.
New files (smartsync.js, fc-v2.js, v2.css) are copied from ../assets.
"""
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NEW_FILES = ["smartsync.js", "fc-v2.js", "scenes-v2.js", "v2.css"]


def patch(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"[{label}] expected exactly 1 match, found {n}. Source changed; update the patch.")
    return text.replace(old, new)


def main(src: Path, dst: Path) -> None:
    if not (src / "app.js").exists():
        raise SystemExit(f"{src} does not look like FlowCraft assets (app.js missing)")
    if dst.resolve() != src.resolve():
        shutil.copytree(src, dst, dirs_exist_ok=True)
    for f in NEW_FILES:
        shutil.copy2(HERE.parent / "assets" / f, dst / f)

    # ---------------------------------------------------------------- app.js
    p = dst / "app.js"
    s = p.read_text(encoding="utf-8")
    s = patch(s, "async function buildTimeline0(){",
              "async function buildTimeline0(){return FCV2.buildTimeline()}\n"
              "async function buildTimeline0Legacy(){", "app: timeline entry")
    s = patch(s, "const parts=ttsSplit(text,1600),rate=24000,",
              "const plan=FCV2.ttsPlan(text,1600),parts=plan.parts,rate=24000,", "app: tts plan")
    s = patch(s, "P.media.audio={rel:r.rel,name:r.name||name,duration:r.duration||n/rate};",
              "P.media.audio={rel:r.rel,name:r.name||name,duration:r.duration||n/rate,"
              "anchors:FCV2.ttsAnchors(plan,pcm,rate),anchorSig:FCV2.sig(P.frames||[])};", "app: tts anchors")
    s = patch(s, "let want=E.t-st[i];if(d>0.05)want=want%d;want=Math.max(0,want);",
              "let want=E.t-st[i];if(d>0.05)want=c.fit?FCSync.clipSourceTime(want,c.fit,d):want%d;"
              "want=Math.max(0,want);v.playbackRate=(c.fit&&c.fit.rate)||1;", "app: preview video fit")
    s = patch(s, "if(b){const n=P.frames?.length||0,c=+b.dataset.ahead;",
              "if(b){if(b.dataset.ahead==='auto'){$('#animSel').value=FCV2.hookFramesFromScript(6).map(x=>x+1).join(', ');return}"
              "const n=P.frames?.length||0,c=+b.dataset.ahead;", "app: auto hook selection")
    s = patch(s, "clips:clips().map((c,i)=>({img:c.img,d:c.d,motion:motionOf(i),",
              "clips:clips().map((c,i)=>({img:c.img,d:c.d,motion:motionOf(i),fit:c.fit||null,", "app: render job keeps fit")
    p.write_text(s, encoding="utf-8")

    # -------------------------------------------------------------- local.js
    p = dst / "local.js"
    s = p.read_text(encoding="utf-8")
    a = s.index("/* aqlli: pauzalarni topib, gap uzunligiga qarab moslash */")
    b = s.index("return{ok:true,durations:d,total:T,silences:sil.length,ms:Math.round(performance.now()-T0)}}", a)
    b += len("return{ok:true,durations:d,total:T,silences:sil.length,ms:Math.round(performance.now()-T0)}}")
    s = s[:a] + (
        "/* V2: pauzaga qarab kesish olib tashlandi. Aqlli moslash endi sahifada (smartsync.js:\n"
        "   STT + majburiy moslash + rasm ma'nosi). Bu yerda faqat zaxira: harf soni bo'yicha. */\n"
        " const tx=(j.texts&&j.texts.length===n)?j.texts:Array(n).fill('x');"
        "const w=tx.map(t=>Math.max(1,String(t).replace(/\\s+/g,' ').length));const sum=w.reduce((a,b)=>a+b,0);\n"
        " const d=w.map(x=>Math.max(.3,T*x/sum));return{ok:true,durations:d,total:T,silences:0,ms:Math.round(performance.now()-T0)}}"
    ) + s[b:]
    s = patch(s, "if(mo==='punch'){",
              "if(mo==='shake'){const k=t*13;return{s:z*1.03,x:0.004*Math.sin(k*2.1)+0.003*Math.sin(k*3.7)}}\n if(mo==='punch'){",
              "local: shake motion")
    s = patch(s, "tt=d>0.05?Math.min(lt%d,d-0.001):0;",
              "tt=d>0.05?(c.fit?Math.min(lt*(c.fit.rate||1),d-0.001):Math.min(lt%d,d-0.001)):0;",
              "local: render video fit")
    p.write_text(s, encoding="utf-8")

    # ------------------------------------------------------------ index.html
    p = dst / "index.html"
    s = p.read_text(encoding="utf-8")
    s = patch(s, '<script src="app.js"></script>',
              '<script src="smartsync.js"></script><script src="app.js"></script><script src="fc-v2.js"></script>'
              '<script src="scenes-v2.js"></script>',
              "html: scripts")
    s = patch(s, 'data-a="smart">Gaplarga moslab (aqlli)</button>',
              'data-a="smart">Aqlli: ovozni tinglab</button>', "html: smart label")
    s = patch(s, 'data-a="ai">AI bilan (aniq)</button>',
              'data-a="ai">Aqlli + AI ko\'zi</button>', "html: ai label")
    s = patch(s, '<button class="pill sm" type="button" data-ahead="3">Boshidan 3 ta</button>',
              '<button class="pill sm on" type="button" data-ahead="auto">Avto: 1-daqiqadagi dramatik 6 ta</button>'
              '<button class="pill sm" type="button" data-ahead="3">Boshidan 3 ta</button>', "html: auto hook button")
    s = patch(s, 'id="pastePrompts" type="button">Promptlarni joylash</button>',
              'id="pastePrompts" type="button">Promptlarni joylash</button>'
              '<button class="pill" id="v2ScenesBtn" type="button">Sahnalar jadvali</button>', "html: scenes button")
    if 'href="v2.css"' not in s:
        s = patch(s, "</head>", '<link rel="stylesheet" href="v2.css">\n</head>', "html: css")
    p.write_text(s, encoding="utf-8")

    # ---------------------------------------------------------------- sw.js
    p = dst / "sw.js"
    if p.exists():
        s = p.read_text(encoding="utf-8")
        s = s.replace("const V='fc-4.0.2';", "const V='fc-5.0.0-v2';")
        p.write_text(s, encoding="utf-8")
    print(f"FlowCraft V2 applied: {dst}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
