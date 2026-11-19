---
description: Ma'lumotga asoslangan yangi film mavzularini ishlab chiqish va kalendarga qo'shish
argument-hint: "[ustun: family|loneliness|addiction|discipline] [soni]"
---
Ryzon uchun yangi film g'oyalarini ishlab chiq. Parametrlar: $ARGUMENTS (bo'sh bo'lsa — 6 ta, `content/calendar.json` dagi pillarMix nisbatida).

Avval o'qi: `docs/STRATEGIYA.md`, `docs/SSENARIY_QOIDALARI.md`, `data/history.json`, `data/analytics/latest-summary.md` (bo'lsa), `content/calendar.json`.
vidIQ MCP bo'lsa: `vidiq_outliers` (keyword: mavzu, contentType long) va `vidiq_comment_insights` (mode discover, niche "emotional animated short films") bilan auditoriya talablarini tekshir.

Har bir g'oya uchun:
- `working_title` (≤ 60 belgi), `pillar`, `brief` (3–4 jumla: aniq hayotiy lahza, his-tuyg'u haqiqati, kutilmagan lekin mantiqiy burilish, yakuniy tasvir), `avoid` (klishelar), kerak bo'lsa `sensitive: true`.
- Nega ishlaydi: qaysi ma'lumotga tayanadi (1 jumla).
Filtrlar: oldingi sarlavhalarga o'xshamasin; o'lim/kasalxona finali kabi klishelardan qoch; auditoriya mamlakatlarida tanish vaziyatlar (chet elda ishlash, qarz, oila bosimi, yangi shahar).

Kalendarga `status: "planned"` bilan qo'sh; `publishAt` — navbatdagi bo'sh Seshanba/Juma 13:30 UTC. Oxirida jadval ko'rinishida qisqa xulosa ber.
