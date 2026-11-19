---
description: Epizodni render qilish va nashrga tayyorlash (manual paket yoki private yuklash)
argument-hint: "<calendar id>"
---
Kalendar elementini nashrga tayyorla: $ARGUMENTS

1. `content/calendar.json` da elementni top; `episodeDir` mavjud va validatsiyadan o'tganini tekshir (`npm run validate`).
2. `.env` dagi `YOUTUBE_PUBLISH_MODE` ni ko'r (qiymatlarni chiqarmasdan!): manual | review | schedule.
3. Foydalanuvchidan tasdiq so'ra: sarlavha, muqova matni, rejim, chiqish vaqti.
4. Tasdiqdan keyin: `npm run autopilot -- --topic $ARGUMENTS`
5. Natijani tekshir: `output/<slug>/` da mp4, short mp4, thumb png, YOUTUBE_UPLOAD.txt (manual rejimda).
6. review rejimida: Studio havolasini ber va `npm run publish -- <videoId>` buyrug'ini eslat — ommaga chiqarishni faqat foydalanuvchi buyrug'i bilan bajar.
7. Nashrdan keyingi ro'yxat: end screen, pinned comment (izoh uchun savol), Shorts'ni asosiy videoga bog'lash, pleylist.
