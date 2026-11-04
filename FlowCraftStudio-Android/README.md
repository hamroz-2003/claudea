# FlowCraft Studio 4.2.0 — Android (APK)

```bash
# Talablar: JDK 17, Android SDK (Android Studio bilan birga o'rnatiladi; API 36)
# Qo'shimcha kutubxona o'rnatish shart emas — loyihada tashqi bog'liqlik yo'q.

# 1) Debug APK (darhol sinash uchun)
./gradlew assembleDebug
#    → app/build/outputs/apk/debug/app-debug.apk

# 2) Release APK (eski 4.0.4 ustidan yangilash uchun ASL kalit bilan)
cp keystore.properties.example keystore.properties   # ichini to'ldiring
./gradlew assembleRelease
#    → app/build/outputs/apk/release/app-release.apk

# 3) Telefonga o'rnatish (USB debugging yoqilgan bo'lsa)
adb install -r app/build/outputs/apk/release/app-release.apk
```

Windows'da `./gradlew` o'rniga `gradlew.bat` deb yozing.

## Kompyutersiz yig'ish (GitHub Actions)

`FlowCraftStudio-Android/` ga har bir push qilinganda GitHub APK ni o'zi yig'adi:
**Actions → "FlowCraft Android APK" → oxirgi run → Artifacts → `FlowCraft-Studio-apk`**.

Release APK asl kalit bilan imzolanishi uchun repo'da **Settings → Secrets and variables → Actions** bo'limiga quyidagilarni qo'shing:

| Secret | Qiymati |
|---|---|
| `FC_KEYSTORE_BASE64` | `base64 -w0 flowcraft.jks` buyrug'ining natijasi |
| `FC_KEYSTORE_PASSWORD` | keystore paroli |
| `FC_KEY_ALIAS` | kalit nomi (alias) |
| `FC_KEY_PASSWORD` | kalit paroli |

Secrets berilmasa release APK debug kaliti bilan imzolanadi: uni sinash mumkin, lekin 4.0.4 ustiga **o'rnatilmaydi**.

## Loyiha tuzilishi

```
FlowCraftStudio-Android/
├── AUDIT.md                     ← 4.0.4 audit hisoboti (topilgan muammolar va yechimlar)
├── NISHALAR.md                  ← YouTube nishalari va shablon g'oyalari
├── build.gradle.kts, settings.gradle.kts, gradle.properties, gradlew(.bat)
└── app/
    ├── build.gradle.kts         ← versiya, imzo, R8
    ├── proguard-rules.pro       ← @JavascriptInterface himoyasi
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/example/flowcraftmobile/
        │   ├── MainActivity.kt  ← WebView qobig'i: xavfsizlik, orqaga tugmasi, edge-to-edge, fayl tanlash, renderer qulashi
        │   ├── WebAppBridge.kt  ← window.AndroidDownloader (JS ↔ Android)
        │   ├── VideoSaver.kt    ← vaqtinchalik fayl → galereya (MediaStore / Android 7–9)
        │   ├── Mp4Tools.kt      ← fMP4 → seekable MP4, mvhd davomiyligini tuzatish
        │   └── DeviceTools.kt   ← diagnostika, hisobot fayli, bufer (4.2)
        ├── res/                 ← ikonkalar, mavzu, network/backup qoidalari
        └── assets/              ← web ilova (4.0.4 dan + android-shell.js, selfcare.js)
```

## 4.2.0 — "o'zi ishlaydigan" dastur (yordam so'ramaslik uchun)

| Imkoniyat | Nima qiladi |
|---|---|
| **Tizim tekshiruvi** (Sozlamalar → Yordam) | WebView versiyasi, video va ovoz kodlovchi (720p/1080p/4K), bo'sh joy, RAM, quvvat tejash rejimi, internet, litsenziya muddati va AI kalitini tekshiradi. Har muammo yonida tuzatish tugmasi bor: "WebView'ni yangilash", "720p ga o'tish", "AI kalitini kiritish" va h.k. |
| **Bosh sahifa ogohlantirishi** | Faqat haqiqiy muammo bo'lsa chiqadi, masalan "Litsenziya faol emas" yoki "Xotira deyarli to'lgan" |
| **Xato maslahatchisi** | Xato chiqqanda "Nima qilish kerak?" kartochkasi va tuzatish tugmasi chiqadi (Gemini kaliti, limit, internet, xotira, format, render) |
| **Yordam markazi** | 14 ta savol-javob, qidiruv bilan, internetsiz ishlaydi |
| **Kalitni avtomatik qo'yish** | Telegram'da kalitni nusxalab qaytsangiz, dastur uni o'zi qo'yadi va faollashtiradi. Buferdan faqat `FC3-…` ko'rinishidagi matn olinadi |
| **Render avtomatik tiklanishi** | Sifat qo'llanmasa pastroq sifatda yig'iladi (4K → 1080p → 720p). Videokarta xato bersa protsessorda qayta yig'iladi. Kodlovchi qotib qolsa xato beradi (cheksiz kutmaydi) |
| **Telefonda diagnostika** | 4.1.0 gacha telefonda bo'sh edi, "Hisobotni saqlash" tugmasi esa xato berardi. Endi hodisalar yoziladi, hisobot Download/FlowCraft ga saqlanadi va "Ulashish" oynasi ochiladi |
| **Loyihalarni himoyalash** | Tizim joy bo'shatayotganda loyihalar o'chib ketmasligi uchun `navigator.storage.persist()` so'raladi |
| **3 ta yangi shablon** | Oilaviy dramalar (ruscha), Uyqu uchun tarix, Adolat hikoyalari. Batafsil: [NISHALAR.md](NISHALAR.md) |

Yangi fayllar: `assets/selfcare.js`, `assets/selfcare.css`, `DeviceTools.kt`. Ko'prikka qo'shilgan metodlar: `deviceInfo`, `openWebViewUpdate`, `shareText`, `saveTextFile`, `licenseKeyFromClipboard`, `copyText`.

## Web qismidagi o'zgarishlar (4.0.4 → 4.1.0)

- `android-shell.js` (yangi): `window.FCBack()`, telefonning "Orqaga" tugmasi uchun.
- `index.html`: `android-shell.js` ulandi.
- `local.js`: `VERSION='4.1.0'`. Render xato bilan tugasa `AndroidDownloader.cancelSave()` chaqiriladi.
- `sw.js`: kesh versiyasi `fc-4.1.0`.
- `sfx/desktop.ini` va `dexopt/` o'chirildi.

Qolgan barcha fayllar 4.0.4 bilan bir xil, shuning uchun Windows va PWA versiyalariga ta'sir yo'q.
