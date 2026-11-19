---
description: Epizoddan kadrlar render qilib, vizual uslub va o'qilishni tekshirish
argument-hint: "<episode papkasi>"
---
Epizodni vizual tekshir: $ARGUMENTS

1. `npm run validate -- $ARGUMENTS`
2. Kalit sahnalardan kadrlar ol: cold_open, birinchi tension, climax, cta va muqova:
   `npx remotion still src/index.ts Episode output/check/<id>.png --props=<props.json> --frame=<N> --scale=0.5`
   (props.json: `{"episode": <episode.json>}`; kadr raqami = sahna boshlanish soniyasi × 30 + 15). Muqova: `Thumbnail` kompozitsiyasi. Shorts: `EpisodeShort`.
3. Har bir kadrni ko'rib chiq va bahola:
   - Qahramon aniq ko'rinadimi, his-tuyg'u (ko'z+poza) o'qiladimi?
   - Matn o'qiladimi, qahramonni to'smaydimi?
   - Uslub: qahramonda kontur/soya yo'q, muhit low-poly, ranglar palitrada.
   - Muqova: kichik o'lchamda (320x180) ham 2–3 so'z o'qiladimi?
4. Muammolarni `episode.json` da tuzat (x pozitsiya, durationSec, kamera, matn uzunligi) va qayta tekshir.
5. Tez to'liq ko'rish uchun: `npm run render -- $ARGUMENTS --preview` (birinchi 10 s).
