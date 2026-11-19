---
description: Kanalni chuqur tahlil qilish — YPP progressi, retention, trafik, mavzular samaradorligi
argument-hint: "[davr, masalan 28 yoki 90 kun]"
---
Ryzon kanalini chuqur tahlil qil. Davr: $ARGUMENTS (bo'sh bo'lsa — 28 kun).

1. Ma'lumot yig'ish (mavjudiga qarab):
   - vidIQ MCP ulangan bo'lsa: `vidiq_user_channels`, `vidiq_channel_analytics` (top_videos, traffic_sources, audience_geography, audience_demographics, shorts_vs_longform_split), eng yaxshi video uchun `audience_retention`.
   - Aks holda: `npm run analyze` va `data/analytics/latest-summary.md` ni o'qi.
2. `data/history.json` dagi ko'rishlarni yangila (videoId bo'yicha).
3. Hisobla: YPP progressi (1000/4000 va 500/3000), obuna/1000 ko'rish har bir video va ustun bo'yicha, 0:30 dagi retention, CTR manbasi (Browse/Suggested ulushi).
4. `docs/reports/<bugungi sana>.md` ga hisobot yoz (o'zbekcha):
   - Raqamlar jadvali (o'tgan davr bilan taqqoslab)
   - 3 ta eng muhim xulosa (raqam bilan isbotlangan)
   - Qaysi ustun/format ishladi va ishlamadi — nima uchun
   - Keyingi 2 hafta uchun 3 ta aniq harakat
5. Agar xulosalar strategiyani o'zgartirsa, `docs/STRATEGIYA.md` dagi tegishli bo'limni yangila va `data/analytics/latest-summary.md` ni qisqa saqla (ssenarist uni o'qiydi).
Taxmin qilma: ma'lumot yo'q bo'lsa "ma'lumot yo'q" deb yoz.
