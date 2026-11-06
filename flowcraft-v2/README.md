# FlowCraft V2: aqlli avto-montaj va animatsiya studiyasi

Bu papka FlowCraft 4.x ilovasining `assets` qismiga qo'shiladigan V2 modullarini o'z ichiga oladi.

## Modullarni kiritish tartibi

| # | Modul | Holati | Nega shu tartibda |
|---|---|---|---|
| 1 | Aqlli audio-rasm sinxronizatori (STT + majburiy moslash + rasm ma'nosi + drift himoyasi) | **tayyor** | Asosiy xato shu yerda; qolgan modullar uning vaqt jadvaliga tayanadi |
| 2 | Hook animatsiya dvigateli | **yadrosi tayyor** (hook tanlash, `motion_prompt`, MP4'ni vaqtga moslash, kamera harakati). UI qismi qolgan | 1-modul aniq vaqt bergandan keyingina "birinchi 60 soniya" ma'noga ega |
| 3 | Yagona sahna jadvali (3–6-qadamlar o'rniga bitta jadval) | navbatda | 1–2-modullar yaratgan `segments`, `clips.segs`, `hook` maydonlari jadval qatoriga aylanadi |
| 4 | 14 ta kanal preseti (faqat uslub va SEO) | navbatda | Oldingi modullarga ta'sir qilmaydi, oxirida qo'shiladi |

## 1-modul: nima o'zgardi

**Eski usul (o'chirildi):** `local.js → align()` ovozni harf soniga qarab bo'lardi va har chegarani ±1,2 soniyadagi eng yaqin pauzaga surardi. Keyin rasmlar tartib raqami bo'yicha ko'r-ko'rona qo'yilardi. Diktor vergulda to'xtasa yoki ikki gapni ulab o'qisa, rasmlar siljib ketardi.

**Yangi usul (`smartsync.js`, global nomi `FCSync`):**

1. **Quloq** — kadr vaqtlari aniqlik tartibida uchta manbadan olinadi:
   - **TTS langarlari:** ovoz ilova ichida yaratilsa, bo'laklar butun kadrlardan yig'iladi. Har bo'lak boshi namunagacha aniq kadr boshi bo'ladi (`P.media.audio.anchors`).
   - **STT (Gemini):** ovoz 75 soniyalik oynalarga bo'lib tinglanadi. Ssenariy so'zlari Needleman–Wunsch algoritmi bilan transkriptga majburiy moslanadi, so'ng ibora ichidagi so'z bo'shliqlari sanaladi.
   - **AI kalitisiz zaxira:** jim joylar ustida global DP. Har gap davomiyligi uning bo'g'in va harf soniga mos bo'lishi talab qilinadi, shuning uchun xato keyingi gaplarga yig'ilmaydi.

   Har chegara keyin nutqning haqiqiy boshlanish nuqtasiga 10 ms aniqlik bilan suriladi.
2. **Ko'z** — rasm yoki video gapga uchta ma'lumot bo'yicha bog'lanadi:
   - fayl nomidagi kadr raqami (agar nomlar `001.png…` ko'rinishida bo'lsa);
   - Gemini Vision: "Aqlli + AI ko'zi" rejimida har rasm qaysi gap(lar)ni tasvirlashi so'raladi;
   - pozitsiya ehtimoli.

   Bularning hammasi monoton DP orqali birlashtiriladi:
   - **80 gap va 75 rasm:** rasm yetishmagan gapda oldingi rasm davom etadi, keyingi rasm o'z gapidan oldin chiqmaydi.
   - **1 uzun gap va 2 rasm:** gap vaqti teng ikkiga bo'linadi.
3. **2-modul yadrosi:**
   - birinchi 60 soniyadagi eng dramatik 5–6 kadr hook sifatida belgilanadi (1-kadr har doim), kadrlar orasida kamida 6 soniya oraliq bo'ladi;
   - har hook uchun `motionPrompt` yaratiladi;
   - MP4 klip endi aylanib o'ynamaydi: tezligi 0,8–1,25 oralig'ida gap vaqtiga moslanadi, yetmasa oxirgi kadr ushlab turiladi (preview'da ham, render'da ham);
   - statik kadrlarda yaqinlashish, uzoqlashish, chapga va o'ngga suriladigan kamera harakatlari navbatma-navbat almashadi;
   - kuchli lahzalarda (hujum, portlash, vahima…) yengil silkinish bo'ladi, lekin kamida 4 kadr oralig'ida.

## O'lchangan natijalar

Sintetik nutqda sinaldi: verguldagi pauzalar, pauzasiz ulab o'qilgan gaplar va Gemini kabi xatolar (vaqt ±150 ms, 8% xato so'z, 3% tushib qolgan so'z).

| | O'rtacha xato | 95% chegaralar | 0,5 soniyadan ortiq siljigan kadr |
|---|---|---|---|
| Eski 4.0.4 ("aqlli") | 188 ms | 2 916 ms | 80 tadan 29 tasi |
| **V2, STT bilan** | **10 ms** | **14 ms** | **0** |
| V2, AI kalitisiz | 11 ms | 740 ms | 80 tadan 4 tasi |

Yamoqlangan ilova Chromium'da ochilib sinaldi: loyiha yaratildi, ovoz va 23 ta rasm (24 ta gap uchun) yuklandi, so'ng "Timeline" quruldi.
- STT bilan eng katta xato 15 ms.
- Har rasm o'z gapida, vaqt chizig'i uzluksiz.
- JS xatolari yo'q.

**Muhim:** bu raqamlar sintetik ovozda olingan. Haqiqiy diktor ovozida aniqlik Gemini transkripsiyasining sifatiga bog'liq va hali sinalmagan.

## Ilovaga qo'shish

```bash
# Android Studio loyihangizdagi asl assets papkasidan yangisini yasaydi
python3 flowcraft-v2/tools/apply_v2.py <loyiha>/app/src/main/assets <loyiha>/app/src/main/assets
```

Skript:
- `smartsync.js`, `fc-v2.js` va `v2.css` fayllarini qo'shadi;
- `app.js`, `local.js` va `index.html` ga aniq yamoqlar qo'llaydi. Har bir almashtirish aynan bir marta mos kelishi kerak, aks holda skript to'xtaydi va hech narsani buzmaydi.

Shundan keyin `versionCode` ni oshirib, o'z imzo kalitingiz bilan yangi APK yig'ing.

## Testlar

```bash
node --test flowcraft-v2/tests/smartsync.test.js      # 14 ta test, ~3 s
```
