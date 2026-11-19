---
description: YouTube Partner Program holati, prognoz va xavflarni tekshirish
---
Ryzon kanalining monetizatsiya holatini tekshir.

1. Eng so'nggi ma'lumot: vidIQ MCP (`vidiq_user_channels`, `vidiq_channel_analytics` 365 kun, `creatorContentType==videoOnDemand` filtri bilan `estimatedMinutesWatched`) yoki `npm run analyze`.
2. Hisobla: obuna (1000 va 500 ga nisbatan), 365 kunlik uzun video tomosha soatlari (4000 va 3000 ga), Shorts ko'rishlari 90 kun; oxirgi 28 kun sur'atida har bir marragacha taxminiy muddat. Taxminni "kafolat emas" deb belgila.
3. Siyosat tekshiruvi: barcha ommaviy videolarning sarlavha/teglarini `lib/policy.js` qoidalari bo'yicha ko'rib chiq (`vidiq_user_videos`), xavfli metadata ro'yxatini ber.
4. "Inauthentic content" xavfi: oxirgi 10 ta video bir-biriga juda o'xshashmi (sarlavha shabloni, muqova, tuzilma)? Tavsiyalar ber.
5. Natija: holat jadvali + eng muhim 3 ta keyingi qadam (o'zbekcha). Kanal mamlakati uchun YPP mavjudligini Studio > Earn da tekshirishni eslat.
