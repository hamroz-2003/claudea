# FlowCraft Studio 4.0.4 (Android) — texnik audit

Sana: 2026-11-06 · Manba: `FlowCraft-Studio-4.0.4_1.apk` (10,2 MB). Kod APK ichidan o'qib tahlil qilindi:
`assets/*.js` va dex fayllari dekompilyatsiya qilindi. Ilova ishga tushirilmadi.

## 1. Qisqa xulosa

Ilova ishlaydigan va o'ylab qurilgan mahsulot:
- videoni telefonning o'zida WebCodecs bilan render qiladi;
- litsenziya Ed25519 imzosi bilan tekshiriladi;
- XSS'ga qarshi `esc()` yordamchisi asosan qo'llangan;
- 8 qadamli jarayonda keyingi qadamga o'tishdan oldin tekshiruv bor.

Asosiy muammo texnik emas, **jarayonda**: oddiy foydalanuvchi 8 qadam, 173 tugma va 19 ta "nusxa olish" joyidan o'tishi kerak. Rasmlar Flow + extension'dan telefonga **qo'lda** ko'chiriladi.

Ilova kodida extension bilan hech qanday aloqa yo'q (`chrome.runtime`, `postMessage`, bridge yo'q). "Flow + extension" varianti amalda "promptlarni nusxalang, rasmlarni o'zingiz olib keling" degani.

| Yo'nalish | Baho | Izoh |
|---|---|---|
| Ishlashi (render, saqlash) | 7/10 | WebCodecs + mp4-muxer to'g'ri tanlangan; saqlash yo'li sekin (base64) |
| Xavfsizlik | 5/10 | WebView'da fayl tizimiga keng ruxsat va JS ko'prigi birga; kalitlar shifrlanmagan va backup qilinadi |
| Oddiy foydalanuvchi uchun qulaylik | 4/10 | Juda ko'p qadam, tanlov va qo'lda ko'chirish |
| Play Market'ga tayyorligi | 2/10 | `com.example` paket nomi, versionCode 1, litsenziyasi noaniq tovushlar |
| Qo'llab-quvvatlash yuki | 4/10 | Qayta o'rnatishda litsenziya yo'qoladi; yangilanish mexanizmi yo'q |

## 2. Topilgan xatolar va kamchiliklar (muhimlik bo'yicha)

### Kritik — pul, huquq yoki mijozni yo'qotishga olib keladi

**K1. Qayta o'rnatishda litsenziya yo'qoladi.**
- Joyi: `local.js → deviceId()`.
- Qurilma ID tasodifiy yaratiladi va faqat IndexedDB'da saqlanadi. Ilova o'chirib qayta o'rnatilsa, "Ma'lumotlarni tozalash" bosilsa yoki telefon almashtirilsa, yangi ID paydo bo'ladi va kalit "bu qurilma uchun emas" deb rad etiladi.
- Natija: pul to'lagan mijoz botga qayta yozadi, bu doimiy qo'llab-quvvatlash yukiga aylanadi.
- Yechim: ID'ni Kotlin tomonda `Settings.Secure.ANDROID_ID` dan (ilova imzosi bilan bog'langan, qayta o'rnatishda o'zgarmaydi) hosil qilib, ko'prik orqali berish. Eski ID'ni bir martalik ko'chirish.

**K2. Pullik litsenziyali tovushlar APK ichida tarqatilmoqda.**
- Joyi: `assets/sfx/es-*-epidemic-sound_*.mp3`, `es-camera-shutter-click-sfx-producer-1_*.mp3`.
- Epidemic Sound litsenziyasi odatda faylning o'zini dasturga qo'shib qayta tarqatishga ruxsat bermaydi.
- Yechim: tovushlarni CC0 yoki o'zingiz yaratgan tovushlarga almashtirish. Masalan, FlowCraft Pro'dagi `sfx_synth.py` ularni kod bilan yaratadi.

**K3. Ilovani Google Play'ga chiqarib va yangilab bo'lmaydi.**
- Paket nomi `com.example.flowcraftmobile`: Play Console `com.example` bilan boshlanadigan nomlarni qabul qilmaydi.
- `versionName 1.0`, `versionCode 1`, ilovaning o'zi esa 4.0.4 deydi. Har yangi APK eski ilova ustiga to'g'ri o'rnatilishi uchun versionCode har safar oshishi kerak.
- Android'da yangilanish tekshiruvi har doim "yangilanish yo'q" qaytaradi (`local.js: case '/api/update/check'`). Shuning uchun telefon foydalanuvchilari xato tuzatishlarini hech qachon olmaydi.
- Yechim: `uz.flowcraft.studio` kabi doimiy paket nomi, versionCode'ni avtomatik oshirish, yangilanishni GitHub Releases yoki Telegram bot orqali tekshirish.

### Yuqori — xavfsizlik yoki ishonchlilik

**Y1. WebView'da fayl tizimiga keng ruxsat va JS ko'prigi birga yoqilgan.**
- Joyi: `MainActivity.onCreate`.
- Yoqilgan sozlamalar: `setAllowUniversalAccessFromFileURLs(true)`, `setAllowFileAccessFromFileURLs(true)`, `addJavascriptInterface(..., "AndroidDownloader")`, `usesCleartextTraffic=true`.
- Natija: biror joyda tozalanmagan HTML ichiga tushsa (AI javobi, import qilingan matn, YouTube sarlavhasi), u skript qurilma fayllarini o'qiy oladi va internetga yubora oladi. Bu "himoyaning yagona qatlami" holati.
- Yechim: `WebViewAssetLoader` (`https://appassets.androidplatform.net/...`) orqali yuklash, ikkala "FromFileURLs" sozlamasini o'chirish, cleartext'ni faqat lokal tarmoq uchun `network_security_config` bilan ruxsat qilish.

**Y2. API kalitlari shifrlanmagan va Google backup'ga tushadi.**
- Gemini kaliti va litsenziya kaliti IndexedDB'da ochiq turadi, `allowBackup=true`.
- Yechim: `allowBackup=false` yoki `dataExtractionRules` bilan IndexedDB'ni backup'dan chiqarish. Kalitni Android Keystore orqali saqlash.

**Y3. SFX ro'yxatiga `desktop.ini` kirib qolgan.**
- Joyi: `assets/sfx/desktop.ini` + `local.js → builtinSfx(): L.slice(0,8)`.
- Ro'yxatda 9 ta fayl bor, kod esa birinchi 8 tasini oladi. `desktop.ini` matn faylini audio deb yuklaydi, oxirgi tovush (`popup2…`) esa umuman tushib qoladi. Natijada tasodifan jim yoki ishlamaydigan effektlar chiqadi.
- Yechim: kengaytma bo'yicha filtr qo'shish va `desktop.ini` ni APK'dan o'chirish.
  ```js
  const L = JSON.parse(AND.listSfx() || "[]").filter(n => /\.(mp3|m4a|wav|ogg)$/i.test(n));
  ```

**Y4. Video saqlash sekin va xotirani ko'p sarflaydi.**
- Joyi: `local.js render()` → `AND.writeChunk(btoa(...))`.
- Har 2 MB bo'lak JS'da satrga, keyin base64'ga aylantiriladi va JS ko'prigi orqali yuboriladi. Bu 33% ortiqcha hajm va ortiqcha CPU ishi, uzun videolarda sezilarli sekinlashadi.
- Yechim: `WebViewCompat.createWebMessageChannel` + ArrayBuffer (WebView 112+), yoki render natijasini OPFS'ga yozib, Kotlin'ga faqat fayl yo'lini berish.

**Y5. Litsenziya muddati qurilma soatiga qarab tekshiriladi.**
- Soatni orqaga surish "Haftalik" yoki "Oylik" kalitni uzaytiradi. Tekshiruv to'liq ilova ichida, APK'ni qayta yig'ib uni chetlab o'tish mumkin.
- Bu offline ishlaydigan dasturlar uchun ma'lum murosa. Oylik va haftalik rejalarda vaqti-vaqti bilan server orqali tekshirish (bot API) tavsiya etiladi.

### O'rta

- **O1.** Yuklab olish `setDownloadListener` orqali ishlaydi va sahifadagi `#btnDownload` tugmasini JS bilan bosadi. Element nomi o'zgarsa, jimgina ishlamay qoladi.
- **O2.** APK 10 MB, dex 21 MB. Ichida Android Studio shablonidan qolgan, ishlatilmaydigan Compose ekranlari bor (`MainScreen`, `Navigation`, `DataRepository`). Ularni olib tashlab, R8 bilan kichraytirsa, hajm taxminan 3–4 MB ga tushadi.
- **O3.** `READ/WRITE_EXTERNAL_STORAGE` ruxsatlari Android 10+ da keraksiz. MediaStore allaqachon ishlatilgan, shuning uchun bu ruxsatlarni `maxSdkVersion="28"` bilan cheklash kerak.
- **O4.** Telefonda faqat Gemini ishlaydi (`'/api/ai/stream': Telefonda faqat Gemini`). Lekin sozlamalarda boshqa provayderlar ham ko'rinadi, foydalanuvchi ularni tanlab xatoga duch keladi.
- **O5.** 144 ta `toast(...)` chaqiruvi bor. Muhim xatolar (render to'xtadi, xotira to'ldi) 3 soniyada yo'qolib ketadi. Kritik xatolar uchun yopilmaydigan xabar va "Qayta urinish" tugmasi kerak.

### Past

- `sfx` fayl nomlarida `(mp3cut.net)` va bo'sh joylar bor, hisobotlarda chalkash ko'rinadi.
- Diagnostika `/api/diag/*` telefonda jim ishlaydi (`events:[]`). Telefon foydalanuvchisi xatosini yuborishning yo'li yo'q.

## 3. Foydalanuvchi jarayoni auditi

Hozirgi oqim: Shablon → Mavzu → Ssenariy → Referenslar → Promptlar → Ovoz va rasmlar → Montaj → Eksport (8 qadam).

| Qo'lda bajariladigan ish | Qayerda | Muammo |
|---|---|---|
| So'rovni nusxalab, boshqa AI'ga qo'yish va javobni qaytarish | 3–5-qadamlar | Telefonda ilovalar orasida 3–4 marta o'tiladi |
| Promptlarni extension'ga ko'chirish | 5-qadam | Extension kompyuterda, ilova telefonda. Prompt matni telefondan kompyuterga yetkazilishi kerak |
| Rasmlarni kompyuterdan telefonga o'tkazish | 6-qadam | Telegram, kabel yoki Drive orqali, keyin 150 ta faylni tanlash |
| Rasm saralash usulini tanlash (3 ta), moslash usulini tanlash (4 ta) | 6-qadam | Oddiy odam "AI bilan (aniq)" va "Gaplarga moslab (aqlli)" farqini bilmaydi |
| Encoder, kadr tezligi, sifat | Eksport | Texnik tanlovlar |

Sanoq: **8 qadam, 173 tugma, 19 ta "nusxa olish" joyi, 9 ta fayl tanlash oynasi.** 150 kadrli video uchun bu kamida 30–40 daqiqa qo'l mehnati.

### Taklif: "Avto" rejim (3 ekran), hozirgi 8 qadam esa "Pro" rejim sifatida qoladi

1. **Nima haqida?** Mavzu, format (Uzun / Shorts) va davomiylik. Shablonni ilova mavzudan o'zi tanlaydi, foydalanuvchi o'zgartirishi ham mumkin.
2. **"Yaratish"** — bitta tugma. Ilova reja, ssenariy, promptlar va ovozni (Gemini TTS) ketma-ket o'zi bajaradi va progressni ko'rsatadi. Rasmlar:
   - extension ulangan bo'lsa, rasmlar o'zi keladi va kadrlarga avtomatik qo'yiladi (4-bo'limga qarang);
   - ulanmagan bo'lsa, bitta "Rasmlarni tanlash" tugmasi chiqadi: hammasini birdan tanlaysiz, ilova `001…N` ni o'zi moslaydi. Moslash usuli doim "aqlli" bo'ladi, boshqa tanlovlar yashiriladi.
3. **Ko'rish va saqlash** — avtomatik ko'rinish (preview), keyin "Galereyaga saqlash". Muqova, sarlavha, tavsif va teglar shu ekranda tayyor turadi.

Barcha texnik sozlamalar (fps, encoder, saralash, moslash) "Pro" rejimga va "Kengaytirilgan" bo'limiga ko'chiriladi. Ularning standart qiymatlari to'g'ri tanlangan bo'lsa, oddiy foydalanuvchi ularni hech qachon ko'rmaydi.

## 4. Ilova ↔ extension ko'prigi (asosiy qo'l mehnatini yo'q qiladi)

Muammo: Chrome extension faqat kompyuterda ishlaydi, ilova esa telefonda. Ular orasida hozir hech qanday aloqa yo'q.

**Tavsiya etilgan protokol: "juftlash kodi" va lokal tarmoq.**

```
 Telefon (FlowCraft ilovasi)                 Kompyuter (Chrome + extension, Flow ochiq)
 ┌──────────────────────────┐   bir Wi-Fi    ┌───────────────────────────────────────┐
 │ Kotlin: kichik HTTP server│◄──────────────│ popup: "Telefonga ulash" → 6 xonali kod│
 │  :8765, juftlash kodi     │  GET  /queue   │ navbatni oladi: N, prompt, format      │
 │  /queue  /image/{n}       │──────────────►│ Flow'da sizning sessiyangizda yaratadi │
 │  /status                  │◄──────────────│ POST /image/{n} (PNG) — darhol         │
 │ JS: kadrga avtomatik qo'yadi│              │ ilovada ko'rinadi, progress: 37/150    │
 └──────────────────────────┘                └───────────────────────────────────────┘
```

- **Telefon tomoni (Kotlin):**
  - `ServerSocket` asosidagi kichik server (NanoHTTPD yoki o'zingiz yozgan).
  - Faqat juftlash kodi bilan imzolangan so'rovlarni qabul qiladi (HMAC sarlavhasi).
  - Faqat lokal tarmoq (`192.168.*`, `10.*`) manzillaridan ulanishga ruxsat beradi.
  - Rasmni to'g'ridan-to'g'ri loyiha papkasiga yozadi va JS'ga "keldi" hodisasini yuboradi.
- **Extension tomoni:**
  - Popup'da kod kiritish maydoni bo'ladi, kod va telefon manzili `chrome.storage` da saqlanadi.
  - Promptlar navbati telefondan olinadi, ya'ni qo'lda nusxa olish yo'qoladi.
  - Har bir tayyor rasm darhol telefonga yuboriladi.
- **Kompyuterdagi desktop versiya uchun:** extension xuddi shu protokol bilan `http://127.0.0.1:<port>` ga ulanadi. Juftlash kodi bitta, tugma bitta.
- **Natija:** promptni ko'chirish, rasmlarni ko'chirish, fayllarni tanlash va saralash bosqichlari to'liq yo'qoladi. Foydalanuvchi faqat kompyuterda Flow'ni ochiq qoldiradi.

**Chegara:** ko'prik foydalanuvchining **o'z** Flow akkauntida, Flow'ning odatiy limitlari doirasida ishlaydi. reCAPTCHA'ni avtomatik yechish va bepul limitni ko'paytirish uchun bir nechta akkauntni almashtirish bu ishga kirmaydi.

## 5. Ish rejasi

| Bosqich | Ish | Natija |
|---|---|---|
| 1 (tezkor tuzatishlar) | K1, Y3, O4, O5; paket nomi va versionCode; SFX'ni almashtirish | Litsenziya yo'qolmaydi, effektlar ishlaydi, Play'ga tayyorgarlik |
| 2 (xavfsizlik) | Y1, Y2, O3; APK'ni kichraytirish (O2) | WebViewAssetLoader, backup qoidalari, ~3–4 MB APK |
| 3 (ko'prik) | Telefon server + extension juftlash + avtomatik rasm qabul qilish | Rasm uchun qo'l mehnati yo'q |
| 4 (Avto rejim) | 3 ekranli oqim, texnik tanlovlarni yashirish | Oddiy foydalanuvchi 3 ta bosish bilan video oladi |
| 5 (yangilanish) | GitHub Releases yoki bot orqali yangilanishni tekshirish, imzolangan release | Xato tuzatishlari mijozlarga yetib boradi |

**Bu ishlarni bajarish uchun kerak bo'ladiganlar:**
1. Android Studio loyihasi (Kotlin kodi va `assets/` manba fayllari). APK'dagi kod siqilgan holatda, uni o'zgartirib qayta yig'ish sizning imzo kalitingizsiz mumkin emas. Aks holda yangi APK eski ilova ustiga o'rnatilmaydi.
2. Chrome extension'ning manba kodi (`manifest.json`, `background.js`, `content` skriptlari).
