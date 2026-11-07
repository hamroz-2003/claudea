/* FlowCraft V2 — 4-modul: 14 ta yo'nalish preseti (faqat vizual uslub + muqova/SEO).
 *
 * tpl_doc.js dan KEYIN, app.js dan OLDIN yuklanadi va mavjud shablonlarni
 * joyida yangilaydi (id'lar o'zgarmaydi: eski loyihalar ochilaveradi).
 *
 *  - Nomlar umumiy uslub nomlariga almashtiriladi; boshqa kanallarning nomi,
 *    havolasi va "X YouTube style" iboralari promptlardan olib tashlanadi
 *    (rasm modeli aniq bir kanal brendini nusxalamaydi).
 *  - Presetdan faqat VIZUAL USLUB (img, dna), MUQOVA (thumbs) va SEO olinadi.
 *    Ssenariy tuzilishi (plan, "TUZILISH:" qoidalari, sarlavha qolipi) presetga
 *    bog'lanmaydi: hikoya mavzuning o'zidan, chuqur faktlar asosida quriladi
 *    (fc-v2 dagi V2 tizim prompti).
 *  - Mavzu g'oyalari "xit videodan klon" emas: original namunalar.
 *  - 14-preset: "Tarixiy kundalik: bir kun hayoti".
 */
(function () {
  "use strict";
  if (typeof DOC_TPL === "undefined") return;

  // ------------------------------------------------ brend iboralarini tozalash --
  const SCRUB = [
    [/,?\s*in (?:the )?OverSimplified YouTube style/gi, ""],
    [/OverSimplified[- ](?:aesthetic|style)/gi, "flat cartoon aesthetic"],
    [/OverSimplified uslubidagi/gi, "yassi multfilm uslubidagi"],
    [/OverSimplified/gi, "flat cartoon"],
    [/,?\s*in (?:the )?Built On You YouTube style/gi, ""],
    [/Built On You Finale/gi, "Everyday Impact Finale"],
    [/Sam O['’]?Nella(?:[- ]style)?/gi, "deadpan"],
    [/Pixar[- ]style 3D render/gi, "stylized 3D animated-film render"],
    [/Pixar[- ]style/gi, "stylized 3D animated-film"],
    [/\bPixar\b/g, "3D animated-film"],
    [/,?\s*in (?:the )?[A-Z][\w.'’ ]{1,30} YouTube style/g, ""],
    [/\b(?:Genius History|Mr\.? ?Finance|Paint Professor|Ink Explainer|Horror Shorts Party|Built On You|Mr\.? ?DoomStick|Maven Life|Live It|Kurzgesagt|Zenn\d*)(?![\w])(?:\s+(?:kanali(?:dagi|ning|ga)?|uslubida|uslubidagi|style))?/g, ""],
    [/\(\s*@[\w.]+\s*\)|@[\w.]{3,}/g, ""],
    [/youtube\.com\/@[\w.]+/gi, ""],
  ];
  // shablonning yuqori darajadagi texnik maydonlari (id, format va h.k.) tegilmaydi;
  // ichki maydonlar (masalan img.main.f — rasm formulasi) tozalanadi
  const KEEP_TOP = new Set(["id", "style", "v", "tpl", "lang", "f", "need"]);
  function scrubText(s) { for (const [re, to] of SCRUB) s = s.replace(re, to); return s.replace(/ {2,}/g, " ").replace(/\s+,/g, ",").replace(/,\s*,/g, ","); }
  function scrub(v, key, depth = 0) {
    if (typeof v === "string") return depth === 1 && KEEP_TOP.has(key) ? v : scrubText(v);
    if (Array.isArray(v)) return v.map((x) => scrub(x, key, depth + 1));
    if (v && typeof v === "object") { for (const k of Object.keys(v)) v[k] = scrub(v[k], k, depth + 1); return v; }
    return v;
  }
  /** "TUZILISH: …" — ssenariy qolipi; V2 da hikoya tuzilishini mavzu belgilaydi. */
  const stripStructure = (rules) => String(rules || "").replace(/TUZILISH[^:\n]{0,40}:[^\n]*/gi, "").replace(/\n{2,}/g, "\n").trim();

  // --------------------------------------------------- 13 presetning yangi nomi --
  const META = {
    d_history: { n: "Tarix: imperiyalar va davlatlar", d: "Davlat, imperiya va shaharlar tarixi — yassi 2D multfilm uslubida",
      ideas: ["How a Tiny Trading Post Became an Empire", "The Empire That Collapsed in a Single Afternoon", "Why This Ancient City Was Rebuilt Seven Times"],
      pattern: "[Davlat / imperiya / shahar] tarixi — eng hal qiluvchi lahzalar" },
    d_finance: { n: "Biznes va moliya anatomiyasi", d: "Biznesning ichki iqtisodi: xarajat, marja, tuzoqlar — raqamlar bilan",
      ideas: ["What a Small Bakery Really Earns After Every Cost", "The Hidden Math Behind Airport Coffee Prices", "Why Most Car Washes Make Money Only on Saturdays"],
      pattern: "[Biznes] ichidan: pul aslida qayerdan keladi va qayerga ketadi" },
    d_paint: { n: "G'alati tarix va POV genetika", d: "Tarixning g'alati, bema'ni tomonlari va \"agar tanang …\" POV — qora yumor bilan",
      ideas: ["The Strangest Medical Cure People Trusted for 300 Years", "POV: Your Body After 72 Hours Without Sleep", "The Bizarre Job Nobody Wanted in Medieval Cities"],
      pattern: "G'alati fakt yoki POV holat — kutilmagan oqibatlar bilan" },
    d_ancient: { n: "Qadimgi odamlar hayoti", d: "Ibtidoiy va qadimgi odamlar kuni qanday o'tgan — ilmiy dalillar bilan",
      ideas: ["What Did People Eat 20,000 Years Ago — The Evidence", "How Ancient Humans Survived Their First Winter", "The Tool That Changed Human Life More Than Fire"],
      pattern: "Qadimgi odamlar [faoliyat]ni qanday qilgan — dalillar nima deydi" },
    d_mind: { n: "Inson ongi va falsafa", d: "Psixologik effektlar, tajribalar va falsafiy savollar — sokin va chuqur",
      ideas: ["Why Your Brain Remembers Embarrassing Moments at Night", "The Experiment That Showed How Easily We Obey", "Why Time Feels Faster as You Get Older"],
      pattern: "Nega biz [holat]? — tajriba va ilmiy tushuntirish" },
    d_horror: { n: "Qo'rqinchli haqiqiy hikoyalar", d: "Haqiqiy voqealarga asoslangan qo'rqinchli hikoyalar — animatsion",
      ideas: ["The Night Shift Call That Was Never Logged", "Three Strange Stories From Abandoned Hotels", "What the Hikers Found in the Empty Cabin"],
      pattern: "Haqiqiy voqeaga asoslangan qo'rqinchli hikoya(lar)" },
    d_chalk: { n: "Jamiyat psixologiyasi (bo'r masallari)", d: "Inson tabiati haqida masallar — qora fonda oq bo'r chizmasi",
      ideas: ["The Rat Who Learned Why the Well Was Empty", "The Village That Rewarded the Wrong Man", "Why the Quiet Wolf Leads the Pack"],
      pattern: "Masal: [hayvon / qahramon] va hayot saboq(i)" },
    d_medical: { n: "Tana ichida: 3D tibbiyot", d: "Tana ichida nima bo'layapti — iliq, tushunarli, 3D multfilm ko'rinishida",
      ideas: ["Jigaringiz kechasi nima ish qiladi?", "Kofe ichganingizdan keyin tanada 6 soat ichida nima bo'ladi", "Nega charchoq ertalab ham ketmaydi?"],
      pattern: "Tanangizda [holat]da nima bo'ladi?" },
    d_wojak: { n: "Zamonaviy hayot melanxoliyasi (Wojak)", d: "Zamonaviy hayotning bo'shlig'i va undan chiqish yo'li — mem uslubida",
      ideas: ["Why Scrolling at 2 AM Feels Worse Every Year", "The Quiet Loneliness of Having 500 Friends Online", "How to Climb Out of the Weekday Loop"],
      pattern: "Nega zamonaviy hayotda [his-tuyg'u]? — va undan chiqish" },
    d_brand: { n: "Korporatsiyalar tarixi", d: "Har kuni ishlatadigan brendlar qanday paydo bo'lgan — kinematik 2D hujjatli uslub",
      ideas: ["How a Failed Product Became a Global Giant", "The Garage Company That Nearly Went Bankrupt Twice", "The Decision That Saved a Famous Brand at the Last Minute"],
      pattern: "[Brend] qanday paydo bo'ldi va deyarli qanday yo'qolib ketdi" },
    d_agarsen: { n: "Tarixiy POV: agar sen o'sha davrda…", d: "Tomoshabin o'tmish ichida — ikkinchi shaxsda, qisqa zarbali gaplar bilan",
      ideas: ["Agar sen 1404-yilda Samarqandda usta bo'lganingda", "Agar sen Buyuk Ipak yo'lida karvon boshlig'i bo'lsang", "Agar sen 1220-yilda O'trorda yashaganingda"],
      pattern: "Agar sen [yil]da [joy]da [kim] bo'lganingda" },
    d_apoc: { n: "Apokalipsis va omon qolish", d: "Bunker, qamal, falokat — kunma-kun omon qolish ssenariylari",
      ideas: ["One Year Alone in a Sealed Bunker", "Trapped on the 40th Floor When the Power Never Returns", "Surviving a City Where Water Stops for 30 Days"],
      pattern: "[Muddat] davomida [falokat] ichida omon qolish" },
    d_jobs: { n: "Kasb bosqichlari va hayot", d: "Kasbning har bosqichidagi hayot: kun tartibi, daromad, qiyinchilik",
      ideas: ["Your Life at Every Level as an Airline Pilot", "Every Stage of a Chef's Career, From Dishwasher to Owner", "What Nurses Really Earn at Each Step"],
      pattern: "[Kasb] — har bosqichdagi hayot va daromad" },
  };

  for (const t of DOC_TPL) {
    const m = META[t.id];
    if (!m) continue;
    scrub(t);
    t.n = m.n; t.d = m.d;
    delete t.channel;
    t.rules = stripStructure(t.rules);
    t.plan = "";                                     // tuzilishni mavzu belgilaydi
    t.topic = Object.assign({}, t.topic, { pattern: m.pattern, hits: m.ideas });
    t.v2 = true;
  }

  // ------------------------------------------------- 14-preset: tarixiy kundalik --
  const NOTXT = typeof NO_TEXT !== "undefined" ? NO_TEXT : "zero text, no words, no letters";
  const LOCK = "Cinematic realistic historical painting, documentary film still look: natural directional light, warm earthy palette with deep shadows, fine painterly brushwork, authentic period clothing, tools and architecture, believable weathered textures, calm composition, no fantasy elements, no modern objects.";
  const DAY = {
    id: "d_dayin", n: "Tarixiy kundalik: bir kun hayoti",
    d: "O'tmishdagi oddiy odamning bir kuni: tongdan tungacha — real kinematik rasm uslubida",
    tone: "sokin, kuzatuvchan, hissiy, aniq faktlar bilan", v: "d_agarsen", len: "10–20 daq", f: "both", lang: "uz",
    wpm: 135, fw: 9, need: ["char", "loc"], style: "d_cinehist",
    role: "Siz tarixiy kundalik hayotni aniq manbalar asosida, tomoshabinni o'sha kunga olib kirib hikoya qiladigan hujjatli film ssenaristi va rejissyorisiz.",
    topic: { pattern: "[Yil]da [joy]da [kim]ning bir kuni", areas: "O'tmishdagi oddiy kasblar va hayot: askar, hunarmand, savdogar, dehqon, talaba, tabib, karvonchi",
      hits: ["Amir Temur qo'shinidagi askarning bir kuni", "XV asr Samarqand madrasasidagi talabaning bir kuni", "Ipak yo'lidagi karvonchining bir kuni"] },
    rules: "ISHONCHLILIK: kiyim, ovqat, narx, ish vaqti, qurol va odatlar ishonchli tarixiy manbalar va arxeologiyaga tayanadi; taxminlar \"tarixchilar fikricha\" bilan belgilanadi.\nHIS-TUYG'U: hid, tovush, ob-havo, charchoq va mayda kundalik detallar orqali tomoshabinni o'sha kunga olib kir. Zo'ravonlik ramziy, qonsiz.",
    plan: "",
    img: {
      lock: LOCK,
      main: { pct: 85, f: `${LOCK} [CHARACTER_DNA] is [ONE CLEAR EVERYDAY ACTION] in [SPECIFIC PERIOD LOCATION], [TIME OF DAY LIGHT]. Varied camera framing: wide, medium or close detail. ${NOTXT}, 16:9 --ar 16:9` },
      alt: { pct: 15, when: "faqat buyum, xarita yoki muhit detali", f: `${LOCK} Close detail of [ONE PERIOD OBJECT: bread, bowstring, ink pot, coins, tool] on [WORN SURFACE], shallow depth of field, ${NOTXT}, 16:9 --ar 16:9` },
      dnaHint: "[age]-year-old [period role] with [face, hair, beard], wearing [specific period clothing with colors] and [one accessory]",
    },
    thumbs: [
      { name: "A · Yuz va soat", text: "Katta oq qalin shrift, qora kontur, 2–4 so'z: \"1 KUN · 1404\", \"TONGDAN TUNGACHA\"",
        prompt: "Cinematic historical portrait thumbnail, close-up of a tired [PERIOD ROLE] with expressive eyes looking at camera, warm firelight on one side of the face, blurred period camp or city behind, strong contrast, painterly realism, horizontal 16:9 --ar 16:9" },
      { name: "B · Kontrast", text: "Ikki qism: chapda \"TONG\", o'ngda \"TUN\" — oq shrift",
        prompt: "Split-scene cinematic historical thumbnail, left half the same [PERIOD ROLE] at cold blue dawn starting work, right half at warm night by a fire exhausted, painterly realism, horizontal 16:9 --ar 16:9" },
    ],
    seo: "SEO: sarlavhada yil, joy va qahramon kasbi bo'lsin (masalan \"1404-yil, Samarqand: ustaning bir kuni\"); tavsifning birinchi qatorida davr va asosiy savol; kalit so'zlar: tarix, tarixiy hujjatli film, o'tmishda hayot, kundalik hayot, [davr], [joy], [kasb]; heshteglar: #tarix #tarixiyhayot #[joy].",
    v2: true,
  };
  if (!DOC_TPL.some((t) => t.id === DAY.id)) DOC_TPL.push(DAY);

  // ---------------------------------------- uslublar ro'yxati va namuna promptlar --
  if (typeof DOC_STY !== "undefined") {
    for (const s of DOC_STY) {
      const t = DOC_TPL.find((x) => x.id === s.tpl);
      if (t) { s.n = t.n.split(" (")[0]; s.p = t.img.lock; }
    }
    if (!DOC_STY.some((s) => s.id === "d_cinehist")) DOC_STY.push({ id: "d_cinehist", n: DAY.n, sw: "#c9a46a,#2f3a45", p: LOCK, tpl: DAY.id });
  }
  if (typeof TPL_SAMPLES !== "undefined") {
    for (const k of Object.keys(TPL_SAMPLES)) TPL_SAMPLES[k] = scrubText(TPL_SAMPLES[k]);
    TPL_SAMPLES.d_dayin = `${LOCK} A 22-year-old Timurid soldier with weathered tan skin and a short dark beard, wearing worn leather lamellar armor over a coarse wool tunic, shares the last piece of flatbread with a comrade beside a dying campfire at cold blue dawn in a steppe camp, horses and felt tents behind. ${NOTXT}, 16:9 --ar 16:9`;
  }

  // keyingi skriptlar (fc-v2) uchun
  window.FCV2_PRESETS = { stripStructure, scrub, scrubText, count: DOC_TPL.length };
})();
