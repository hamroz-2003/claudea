# Ryzon Uz — avtomatlashtirilgan 2.5D animatsiya studiyasi

YouTube kanali **Ryzon** (@ryzonuz): chuqur hayotiy muammolar haqida ovozsiz 2.5D animatsion qisqa filmlar.
Auditoriya: Hindiston, AQSh, Filippin; 18–34 yoshli erkaklar. Ekrandagi matn — ingliz tilida. Ish tili (hujjatlar, buyruqlar) — o'zbekcha.

## Arxitektura
```
content/calendar.json   → mavzular navbati (holatlar bilan)
content/episode.schema.json → epizod JSON kontrakti (YAGONA manba)
episodes/<sana>-<slug>/episode.json → ssenariy (Claude faqat shuni yozadi)
src/                    → Remotion render (Episode 16:9, EpisodeShort 9:16, Thumbnail 1280x720)
lib/                    → claude.js · episode.js (validatsiya) · policy.js · render.js · youtube.js · notify.js
autopilot_channel.js    → navbat → ssenariy → render → nashr → Telegram
docs/STRATEGIYA.md      → kanal tahlili va strategiya
docs/SSENARIY_QOIDALARI.md → ssenariy yozish qoidalari
```

## Qat'iy qoidalar
1. **Ssenariy = JSON.** Yangi film uchun `src/` kodini o'zgartirmang — faqat `episode.json` yozing. Yangi vizual imkoniyat kerak bo'lsa: avval sxemaga, keyin `src/` ga qo'shing va `npm run check` ni ishga tushiring.
2. **Har bir epizod** `npm run validate -- <papka>` dan ✗ siz o'tishi shart.
3. **Uslub**: qahramon tekis 2D (kontur/soya/gradient yo'q), muhit yoritilmagan low-poly 3D. Ranglar faqat `src/style/tokens.ts` dan. Ryzon doim sariq (#FFD700) hudida.
4. **Siyosat**: jinsiy so'zlar, brend nomlari, o'z-o'ziga zarar usullari — taqiqlangan. Og'ir mavzu → `sensitive: true`.
5. **Inson nazorati**: hech qachon to'g'ridan-to'g'ri `public` qilib yuklamang. Standart rejim `manual`; `review` da private yuklanadi va `npm run publish` bilan inson chiqaradi.
6. **Vaqt hisoblari** (bo'limlar, davomiylik) — faqat kod orqali (`lib/episode.js`), qo'lda yozilmaydi.
7. Sirlar (`.env`) hech qachon commit qilinmaydi va Telegram/loglarga chiqarilmaydi.

## Buyruqlar
| Buyruq | Vazifa |
|---|---|
| `/kanal-tahlil` | Analitika → holat hisoboti, YPP progressi, xulosalar |
| `/goyalar [ustun]` | Ma'lumotga asoslangan yangi mavzular → `content/calendar.json` |
| `/ssenariy <mavzu yoki calendar id>` | Yangi `episode.json` yozish va tekshirish |
| `/vizual-tekshiruv <papka>` | Kadrlar render qilib, uslub va o'qilishni tekshirish |
| `/nashr <calendar id>` | Render + yuklash paketi / private yuklash |
| `/monetizatsiya` | YPP holati va keyingi qadamlar |
| `/haftalik-sikl` | Dushanba: tahlil → g'oyalar → 2 ta ssenariy → vizual tekshiruv |

## Tez-tez ishlatiladigan skriptlar
```
npm run setup            # tovush effektlari (bir marta)
npm run studio           # Remotion Studio — vizual tahrirlash
npm run validate -- episodes/sample
npm run render -- episodes/sample [--preview]
npm run autopilot [-- --dry-run | --topic <id> | --no-render]
npm run analyze          # kanal analitikasi
npm run publish -- <videoId> [--at ISO]
npm run check            # sintaksis + tiplar + namuna validatsiyasi
```
