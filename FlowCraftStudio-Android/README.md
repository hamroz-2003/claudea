# FlowCraft Studio 4.1.0 — Android (APK)

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
        │   └── Mp4Tools.kt      ← fMP4 → seekable MP4, mvhd davomiyligini tuzatish
        ├── res/                 ← ikonkalar, mavzu, network/backup qoidalari
        └── assets/              ← web ilova (4.0.4 dan + android-shell.js)
```

## Web qismidagi o'zgarishlar (4.0.4 → 4.1.0)

- `android-shell.js` (yangi): `window.FCBack()`, telefonning "Orqaga" tugmasi uchun.
- `index.html`: `android-shell.js` ulandi.
- `local.js`: `VERSION='4.1.0'`. Render xato bilan tugasa `AndroidDownloader.cancelSave()` chaqiriladi.
- `sw.js`: kesh versiyasi `fc-4.1.0`.
- `sfx/desktop.ini` va `dexopt/` o'chirildi.

Qolgan barcha fayllar 4.0.4 bilan bir xil, shuning uchun Windows va PWA versiyalariga ta'sir yo'q.
