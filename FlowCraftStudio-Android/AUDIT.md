# FlowCraft Studio 4.0.4 (APK) audit hisoboti

**Tekshirilgan fayl:** `FlowCraft-Studio-4.0.4.apk`, 10.2 MB
**Paket:** `com.example.flowcraftmobile` · versionCode `1` · versionName `1.0` · minSdk 24 · targetSdk 36
**Imzo:** faqat v2, `CN=FlowCraft Studio, O=FlowCraft`, 2055-yilgacha amal qiladi
**Tuzilishi:** Kotlin'dagi `MainActivity` WebView ochadi, butun interfeys `assets/` ichidagi HTML/JS'da (app.js 255 KB, local.js — video yig'ish va litsenziya).

Yangilangan versiya: **4.1.0**, shu papkadagi loyiha.

---

## 1. Xulosa

| Daraja | Soni | Asosiy muammolar |
|---|---|---|
| 🔴 Jiddiy | 4 | WebView fayl kirish huquqlari juda keng, havola orqali begona sahifa ilova ichida ochilib JS ko'prigiga ega bo'ladi, fayl nomi orqali papkadan tashqariga yozish mumkin, Android 13+ da "Orqaga" tugmasi ishlamaydi |
| 🟠 O'rta | 7 | Android 7–9 da saqlash ruxsati umuman so'ralmaydi, renderer qulasa ilova yopiladi, zaxira nusxa orqali kalitlar chiqib ketadi, ilova kodining taxminan 99% i ishlatilmaydi (Compose), saqlash xatosidan keyin galereyada yarim yozilgan fayl qoladi |
| 🟡 Past | 8 | Versiya raqamlari noto'g'ri, keraksiz ruxsatlar, `desktop.ini`, vaqtinchalik fayllar o'chmaydi va h.k. |

---

## 2. Topilgan muammolar va yechimlar

### 🔴 S-1. `setAllowUniversalAccessFromFileURLs(true)`
`file://` sahifaga **istalgan** saytdan CORS'siz javob o'qish huquqi berilgan edi. Sahifaga birorta begona matn kod sifatida tushib qolsa (masalan, AI javobi yoki loyiha nomi `innerHTML` ga escape'siz qo'yilsa — app.js'da `innerHTML` 98 joyda ishlatilgan), u kod tarmoqdagi va qurilmadagi ma'lumotlarni o'qiy olardi.
**Yechim:** `allowUniversalAccessFromFileURLs = false`. `allowFileAccessFromFileURLs` qoldirildi, chunki local.js shriftlar va `img/tpl.pack` ni XHR bilan o'qiydi. Gemini so'rovlari oddiy CORS orqali ishlayveradi.

### 🔴 S-2. `http://` havolalar WebView ichida ochilardi va JS ko'prigiga ega bo'lardi
`shouldOverrideUrlLoading` faqat `https://` va `tg:` ni tashqi brauzerga yuborardi. Qolgan hamma narsa (`http://…` ham) ilova ichida ochilar va `window.AndroidDownloader` ga to'liq kirish olardi.
**Yechim:** WebView ichida faqat `file:///android_asset/` ochiladi. `https/tg/mailto` tashqi ilovada ochiladi, qolganlari bloklanadi. Ko'prikning har bir metodi sahifa ilovaning o'ziniki ekanini tekshiradi (`isTrustedPage`).

### 🔴 S-3. Fayl nomi orqali papkadan tashqariga yozish (path traversal)
`startSave(fileName)` dagi nom Android 7–9 da `File(Movies/FlowCraft, fileName)` ga to'g'ridan-to'g'ri berilardi. `../../` qo'shilgan nom bilan umumiy xotiraning istalgan joyiga yozish mumkin edi.
**Yechim:** `VideoSaver.sanitizeFileName()`: papka qismlari olib tashlanadi, taqiqlangan belgilar almashtiriladi, uzunlik 100 belgigacha cheklanadi, kengaytma majburan `.mp4`/`.webm` qilinadi. Bu unit-test bilan tekshirildi.

### 🔴 S-4. Android 13+ da "Orqaga" tugmasi
targetSdk 36 bilan Android 16 da `onBackPressed()` endi chaqirilmaydi. Bundan tashqari SPA tarixdan (history) foydalanmagani uchun `canGoBack()` doim `false` edi. Natijada "Orqaga" bosilsa ilova darhol yopilardi, ochiq oyna yoki menyu yopilmasdi.
**Yechim:** `OnBackInvokedCallback` (API 33+) va `onBackPressed` (≤32) qo'shildi. Yangi `android-shell.js` → `window.FCBack()` quyidagi tartibda ishlaydi: pastki oyna → modal → montaj asboblari → studiyada oldingi qadam → yuqoriroq ekran. Bosh ekranda **ikki marta bosilsa** chiqadi, video saqlanayotgan bo'lsa ogohlantiradi. Chromium'da sinab ko'rildi.

### 🟠 M-1. Android 7–9 da video saqlanmasdi
Manifestda `WRITE_EXTERNAL_STORAGE` bor edi, lekin ruxsat **hech qachon so'ralmasdi**, shuning uchun `Movies/FlowCraft` ga yozish `SecurityException` berardi.
**Yechim:** ruxsat ishga tushganda so'raladi. Berilmasa video ilovaning o'z papkasiga (`Android/data/…/Movies`) saqlanadi, ya'ni saqlash baribir ishlaydi.

### 🟠 M-2. WebView renderer qulasa ilova ham yopilardi
Video yig'ish (4K, WebCodecs) rendererning xotirasini to'ldirishi mumkin. `onRenderProcessGone` yo'q edi, shuning uchun butun ilova qulardi.
**Yechim:** WebView qayta yaratiladi va foydalanuvchiga xabar chiqadi. Loyihalar IndexedDB'da bo'lgani uchun yo'qolmaydi.

### 🟠 M-3. Zaxira nusxa orqali kalitlar chiqib ketishi
`allowBackup=true` edi. IndexedDB'da litsenziya kaliti, qurilma ID va Gemini API kaliti ochiq turadi. Zaxira yoki telefondan-telefonga ko'chirish orqali bular boshqa qurilmaga o'tadi (bitta litsenziya bir nechta telefonda ishlaydi).
**Yechim:** `allowBackup=false` va `data_extraction_rules.xml` (bulut va device-transfer ikkalasida ham hamma narsa chiqarib tashlangan).
⚠️ Buning narxi: telefon almashtirilganda loyihalar avtomatik ko'chmaydi.

### 🟠 M-4. Ilovaning 99% i ishlatilmaydigan kod
14 989 klassdan atigi 71 tasi ilovaga tegishli. Jetpack Compose, Material3 va Navigation3 ulangan, lekin `MainActivity` oddiy `android.app.Activity` + WebView. dex hajmi 21 MB (siqilgan holda APK'ning taxminan 7 MB i).
**Yechim:** loyihada **birorta ham tashqi kutubxona yo'q** (faqat Android SDK va Kotlin), R8 minify va shrinkResources yoqilgan. Kutilayotgan APK hajmi taxminan **3 MB** (10.2 MB o'rniga). Ishga tushish ham tezlashadi.

### 🟠 M-5. Saqlash xatosidan keyin galereyada "osilib qolgan" fayl
MediaStore yozuvi `IS_PENDING=1` bilan yaratilardi. Nusxalashda xato bo'lsa u o'chirilmasdi va galereyada ko'rinmaydigan, joy egallaydigan yozuv qolardi.
**Yechim:** xato bo'lsa yozuv `resolver.delete()` bilan o'chiriladi.

### 🟠 M-6. Qayta o'rashda (remux) ovoz yo'qolishi va resurslar bo'shatilmasligi
Qo'llab-quvvatlanmaydigan audio yo'lak indamay tashlab yuborilar va video **ovozsiz** saqlanardi. Xato bo'lsa `MediaMuxer` ba'zan `release()` qilinmasdi. Bufer 1 MB edi, 4K kalit kadrlar sig'masligi mumkin edi.
**Yechim:** birorta yo'lak qo'llanmasa qayta o'rash umuman qilinmaydi (asl fayl ovozi bilan saqlanadi). Resurslar `finally` ichida bo'shatiladi. Bufer 4 MB, kerak bo'lsa avtomatik kattalashadi (64 MB gacha).

### 🟠 M-7. Render xato bilan tugasa vaqtinchalik fayl qolib ketardi
JS xato bersa `finishSave` chaqirilmas, keshda yuzlab MB lik `fc_raw_*.tmp` qolardi.
**Yechim:** JS'ga `cancelSave()` qo'shildi (local.js, catch bloki). Ilova ishga tushganda eski vaqtinchalik fayllar o'chiriladi. Saqlash boshlanishidan oldin bo'sh joy tekshiriladi (kamida 200 MB).

### 🟡 Past darajadagi muammolar (hammasi tuzatildi)
| # | Muammo | Yechim |
|---|---|---|
| L-1 | versionCode=1, versionName="1.0" (JS'da 4.0.4) | 410 / "4.1.0" |
| L-2 | `READ_MEDIA_IMAGES/VIDEO/AUDIO`, `READ_EXTERNAL_STORAGE` keraksiz (fayllar SAF orqali tanlanadi). Play Market bularni asoslab berishni talab qiladi | olib tashlandi |
| L-3 | `usesCleartextTraffic=true` | taqiqlandi, faqat `127.0.0.1` uchun istisno (Ollama/Termux) |
| L-4 | Fayl tanlashda `accept` turi e'tiborga olinmasdi (doim `*/*`, doim bir nechta fayl) | `FileChooserParams` dan MIME va rejim olinadi |
| L-5 | `listSfx()` `desktop.ini` ni ham qaytarardi | faqat audio fayllar qaytadi, `desktop.ini` o'chirildi |
| L-6 | Uzoq render paytida ekran o'chib, jarayon sekinlashardi | saqlash vaqtida `FLAG_KEEP_SCREEN_ON` |
| L-7 | targetSdk 36 da edge-to-edge: interfeys status bar ostiga kirib ketardi | panellar va klaviatura o'lchami konteynerga padding qilinadi |
| L-8 | Ochilishda oq ekran chaqnashi, `WebView` o'chirilgan qurilmada qulash | qorong'i fon, `WebView()` try/catch ichida |

---

## 3. Ataylab o'zgartirilmagan narsalar

1. **Sahifa manzili `file:///android_asset/index.html`.** Barcha loyihalar, qurilma ID va litsenziya kaliti shu manzilning IndexedDB xotirasida. Manzil o'zgarsa (masalan, `WebViewAssetLoader` ga o'tilsa) foydalanuvchilarning hamma ma'lumotlari "yo'qoladi".
2. **`applicationId = com.example.flowcraftmobile`.** O'zgartirilsa telefon buni boshqa ilova deb biladi. ⚠️ Lekin Google Play `com.example.*` paketlarni qabul qilmaydi. Play'ga chiqarish rejasi bo'lsa, buni hozir, yangi foydalanuvchilar uchun o'zgartirish kerak.
3. **JS ko'prigi nomi `AndroidDownloader` va eski metodlar.** Windows, PWA va APK versiyalari bir xil `local.js` dan foydalanadi.
4. **`webView.onPause()` chaqirilmaydi.** Aks holda ilova fonga o'tganda render to'xtaydi.

## 4. ⚠️ Yangilash uchun muhim shart: imzo kaliti

Telefonda 4.0.4 o'rnatilgan bo'lsa, 4.1.0 uning ustidan **faqat bir xil kalit** (`CN=FlowCraft Studio`) bilan imzolangandagina o'rnatiladi. Boshqa kalit bilan imzolansa, avval eskisini o'chirishga to'g'ri keladi va **barcha loyihalar o'chib ketadi**. Kalitni `keystore.properties` yoki GitHub Secrets orqali bering (README'ga qarang).

## 5. Keyingi bosqich uchun tavsiyalar (5.0)

- **Litsenziya faqat qurilmaning o'zida tekshiriladi** (Ed25519 + `nacl`). `local.js` APK ichida ochiq turadi: APK'ni ochib `verifyKey` ni o'zgartirish va qayta imzolash orqali tekshiruvni chetlab o'tish oson. Himoyani kuchaytirish uchun Play Integrity API, server tomonidagi tekshiruv yoki hech bo'lmasa APK imzosini nativ tomonda tekshirish kerak.
- **API kalitlar ochiq saqlanadi** (IndexedDB). Ularni Android Keystore bilan shifrlab, ko'prik orqali berish mumkin.
- **Ma'lumotlarni eksport/import qilish** (loyihalarni `.zip` ga) qo'shilsa, keyin xavfsizroq `https://appassets.androidplatform.net` manziliga xavfsiz o'tish va telefon almashtirishda ma'lumot ko'chirish mumkin bo'ladi.
- **Fonda render uchun Foreground Service** (`mediaProcessing` turi): ilova yopilib qolsa ham video yig'ilishi davom etadi.
- `writeChunk` Base64 orqali ishlaydi (ma'lumot 33% kattalashadi). `WebMessagePort` + `ArrayBuffer` bilan tezroq bo'ladi.
