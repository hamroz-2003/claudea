# FlowCraft V2: aqlli avto-montaj va animatsiya studiyasi

Bu papka FlowCraft 4.x ilovasining `assets` qismiga qo'shiladigan V2 modullarini o'z ichiga oladi.

## Modullarni kiritish tartibi

| # | Modul | Holati | Nega shu tartibda |
|---|---|---|---|
| 1 | Aqlli audio-rasm sinxronizatori (STT + majburiy moslash + rasm ma'nosi + drift himoyasi) | **tayyor** | Asosiy xato shu yerda; qolgan modullar uning vaqt jadvaliga tayanadi |
| 2 | Hook animatsiya dvigateli | **tayyor** (yadro + interfeys) | 1-modul aniq vaqt bergandan keyingina "birinchi 60 soniya" ma'noga ega |
| 3 | Yagona sahna jadvali | **tayyor** | 1–2-modullar yaratgan `segments`, `clips.segs`, `hook` maydonlari jadval qatoriga aylanadi |
| 4 | 14 ta yo'nalish preseti (faqat uslub, muqova va SEO) | **tayyor** | Oldingi modullarga ta'sir qilmaydi, oxirida qo'shiladi |

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

## 2-modul interfeysi

- **5-qadam, "Animatsiya promptlari":**
  - yangi **"Avto: 1-daqiqadagi dramatik 6 ta"** tugmasi bor (standart tanlangan);
  - 1-kadr har doim hookga kiradi, qolganlari jang, olov, sir, "birdan" kabi so'zlar, undov va yillar bo'yicha tanlanadi;
  - tanlangan kadrlar orasida kamida 6 soniya bo'ladi.
- **6-qadam, "Birinchi daqiqa: hook kadrlar" paneli:** har hook kadr uchun eskiz, vaqt va holat ko'rsatiladi ("MP4 bor", "faqat rasm" yoki "rasm yo'q"). Ikki tugma bor: **MP4 yuklash** (fayl avtomatik `NNN.mp4` deb nomlanadi) va harakat promptini yozish yoki nusxalash.
- **Hook kim tanlaydi:** foydalanuvchi animatsiya prompti yozgan yoki MP4 yuklagan kadrlar har doim hook bo'ladi va avtomatik tanlovdan ustun turadi.
- **Bir kadrda ham rasm, ham MP4 bo'lsa:** montajga faqat video kiradi, gap bo'linmaydi.
- **Tahrirlovchi:** vaqt chizig'ida hook kliplari oltin rangli chegara va nuqta bilan belgilanadi.

## 3-modul: Sahnalar jadvali

5-qadamdagi **"Sahnalar jadvali"** tugmasi yoki 6-qadamdagi hook paneli orqali ochiladi. Ekran telefonda ham to'liq ishlaydi.

**Har bir kartochka (bitta kadr) quyidagilarni bir joyda jamlaydi:**

| Maydon | Manba | Nima qilish mumkin |
|---|---|---|
| `scene_number`, `start`–`end` | 1-modul (`P.sync.segments`, ssenariy o'zgarmagan bo'lsa) | — |
| Diktor matni | `P.frames` | Tahrirlash (ovoz bilan mos kelmasa ogohlantiradi) |
| `CHAR-n`, `LOC-n` | 4-qadam referenslari (personaj ismi matnda bormi; joy oralig'i) | — |
| Rasm prompti | `P.prompts` | Tahrirlash, nusxalash, **faqat shu kadrni qayta yozish** (mavjud generator, uslub va DNK qoidalari bilan) |
| Hook + harakat prompti | `P.anim` | Belgilash yoki olib tashlash, yozish, nusxalash |
| Rasm yoki video | `media/NNN.*` | **Almashtirish** (shu kadrning fayli o'sha nom bilan yoziladi, dublikat paydo bo'lmaydi) |

- **Yuqori panel:** holat (prompt, rasm va hook MP4 soni), filtrlar ("Hammasi", "Kamchiligi bor", "Hook kadrlar"), **"Montajni yangilash"** va "Montajga o'tish" tugmalari.

## 4-modul: 14 ta yo'nalish preseti

`presets-v2.js` fayli `tpl_doc.js` dan keyin va `app.js` dan oldin yuklanadi. U mavjud shablonlarni joyida yangilaydi, id'lar o'zgarmaydi, shuning uchun eski loyihalar ochilaveradi.

| # | Preset | Vizual uslub |
|---|---|---|
| 1 | Tarix: imperiyalar va davlatlar | yassi 2D vektor multfilm |
| 2 | Biznes va moliya anatomiyasi | zamonaviy biznes-tushuntirish multfilmi |
| 3 | G'alati tarix va POV genetika | qorong'i yumorli 2D komiks |
| 4 | Qadimgi odamlar hayoti | iliq ibtidoiy multfilm |
| 5 | Inson ongi va falsafa | sokin, sirli minimal 2D |
| 6 | Qo'rqinchli haqiqiy hikoyalar | qorong'i animatsion komiks |
| 7 | Jamiyat psixologiyasi (bo'r masallari) | qora fonda oq bo'r chizmasi |
| 8 | Tana ichida: 3D tibbiyot | stillashtirilgan 3D animatsion film |
| 9 | Zamonaviy hayot melanxoliyasi (Wojak) | mem uslubidagi yassi chizma |
| 10 | Korporatsiyalar tarixi | kinematik 2D hujjatli |
| 11 | Tarixiy POV: agar sen o'sha davrda… | akvarel va qog'oz kesma |
| 12 | Apokalipsis va omon qolish | keskin 2D multfilm |
| 13 | Kasb bosqichlari va hayot | iliq 2D kundalik hayot |
| 14 | **Tarixiy kundalik: bir kun hayoti** (yangi) | real kinematik tarixiy rasm |

**Presetdan nima olinadi:** faqat rasm uslubi (`img`, personaj DNK maslahati), muqova formulalari (`thumbs`) va SEO qoidasi.

**Nima o'zgardi:**
- **Ssenariy erkin yoziladi:**
  - V2 tizim prompti presetdan faqat ohang va ishonchlilik qoidalarini oladi;
  - shablon strukturasi (`plan`, "TUZILISH: …" qoidalari) olib tashlandi;
  - har video uchun yangi tuzilish, chuqur faktlar (aniq sana, ism, raqam, manba) va tomoshabinni ushlab turish talablari qo'shildi.
- **Mavzu g'oyalari** endi "xit videodan klon" emas: original namunalar va o'ziga xos sarlavhalar so'raladi.
- **Kanal nomlari olib tashlandi:** boshqa kanallarning nomi, havolasi va "X YouTube style" iboralari shablon nomlaridan, rasm va muqova promptlaridan hamda namunalardan tozalandi. Natijada rasm modeli aniq bir kanal brendini nusxalamaydi va ilova huquqiy jihatdan xavfsizroq bo'ladi.
- **"undefined" xatolari tuzatildi:** kanal maydoni yo'qolgani sababli rasm, SEO va ma'lumot panelida "undefined" chiqib qolmasligi uchun tegishli joylar yamoqlandi.
- **Fayl nomlari:** "Flow uchun promptlar" ro'yxatidagi fayl nomlarida Windows taqiqlagan belgilar yo'q.

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
- `smartsync.js`, `presets-v2.js`, `fc-v2.js`, `scenes-v2.js` va `v2.css` fayllarini qo'shadi;
- `app.js`, `local.js` va `index.html` ga aniq yamoqlar qo'llaydi. Har bir almashtirish aynan bir marta mos kelishi kerak, aks holda skript to'xtaydi va hech narsani buzmaydi.

Shundan keyin `versionCode` ni oshirib, o'z imzo kalitingiz bilan yangi APK yig'ing.

## Testlar

```bash
node --test flowcraft-v2/tests/smartsync.test.js      # 15 ta test, ~3 s
FC_ASSETS=<asl assets> node --test flowcraft-v2/tests/presets.test.js   # 4-modul
# brauzer testlari (yamoqlangan ilova ustida): tests/e2e_browser.js, tests/e2e_modules23.js
```
