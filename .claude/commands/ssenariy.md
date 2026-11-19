---
description: Yangi film ssenariysini episode.json sifatida yozish va tekshirish
argument-hint: "<calendar id yoki erkin mavzu>"
---
Yangi Ryzon filmi uchun ssenariy yoz. Mavzu: $ARGUMENTS

1. Agar bu `content/calendar.json` dagi id bo'lsa — o'sha brief'ni ol; aks holda erkin mavzudan brief tuz.
2. O'qi: `docs/SSENARIY_QOIDALARI.md`, `content/episode.schema.json`, `episodes/sample/episode.json` (oltin namuna), `data/history.json`.
3. Yozishdan oldin (o'zing uchun) jadval tuz: personajlar (id, rang, scale), voqealar xronologiyasi, har 20–30 soniyalik zarbalar, burilish nuqtasi foizi. Barcha raqam va ismlarni shu jadvaldan ko'chir.
4. `episodes/<YYYY-MM-DD>-<slug>/episode.json` ni yoz (`ssenarist` subagent'idan foydalanish mumkin).
5. `npm run validate -- <papka>` — barcha ✗ ni tuzat, ⚠ ni imkon qadar.
6. `siyosat-nazoratchi` subagent'iga tekshirtir; tuzatishlarni kirit.
7. Kalendardagi elementni `status: "generated"`, `episodeDir` bilan yangila.
8. Natija: sarlavha, muqova matni, logline, davomiylik va 5 qatorli hikoya qisqachasi (o'zbekcha).
