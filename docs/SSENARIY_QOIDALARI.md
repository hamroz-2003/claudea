# Ssenariy qoidalari (Claude ssenarist uchun)

> Bu fayl `lib/claude.js` tomonidan har bir ssenariy yozishdan oldin o'qiladi. Qisqa saqlang (< 5K token).
> Asos: kanal analitikasi + repodagi ИНСТРУКЦИЯ.md / СТИЛЬ.md tamoyillari (jadval → yozish → tekshirish, finalda nasihat yo'q).

## 1. Yozishdan oldin (o'ylash bosqichi, javobga yozilmaydi)
1. **Haqiqiy muammo**: tomoshabin o'zini taniydigan *aniq* lahza. "Ular bir-birini tushunmay qolishdi" emas — "u 37-qo'ng'iroqni ham rad etdi".
2. **Bitta savol**: cold open qanday savol tug'diradi? Javob faqat 60–80% da beriladi.
3. **Burilish**: tomoshabin kutgan klishe (o'lim, kasalxona) o'rniga mantiqiy, lekin kutilmagan haqiqat.
4. **Yakuniy tasvir**: oxirgi kadr — harakat yoki detal, xulosa emas.

## 2. Tuzilma va vaqt
- `cold_open` (≤ 5 s): eng qiziq lahza. `hook` (3–4 s): "X years earlier" yoki kontrast.
- Setup ≤ 45 s. **0:30 gacha birinchi muammo** (kanal tomoshabinlari 0:28–0:46 da ketmoqda).
- Har 20–30 soniyada yangi ma'lumot yoki kuchayish. Bir xil muhit + kamera 2 sahnadan ko'p takrorlanmasin.
- `turn`/`climax` umumiy davomiylikning 35–65% ida.
- Oxirgi sahna `cta`, ≥ 12 s, qahramon chap tomonda (`x: 0.3`) — o'ng tomonda end screen elementlari turadi.
- Uzun film: 170–300 s, 25–45 sahna, har biri 2–8 s.

## 3. Matn (ekrandagi)
- Ingliz tili, oddiy, inson ovozi. ≤ 15 belgi/soniya.
- Uslublar: `counter` (vaqt/kun: "2:47 AM", "YEAR 4"), `message` (telefon xabari), `thought` (ichki ovoz/dialog), `whisper` (hikoyachi), `title` (katta zarba).
- Dialog: `Lola: "..."` ko'rinishida. Muallif izohisiz.
- **Taqiqlangan klishe**: "and that's when he realized", "life is short", "money can't buy happiness", "the end", har qanday to'g'ridan-to'g'ri axloqiy xulosa.

## 4. Vizual grammatika
- Qahramon: `cast[0]` = `ryzon`, `yellow`. Boshqalar: `grey`, `blue`, `red`, `white`, `green`. Bola: `scale` 0.6–0.7.
- His-tuyg'u faqat ko'z + poza orqali: `head_in_hands`+`ashamed`, `look_phone`+`anxious`, `kneel`+`hopeful`.
- Kamera: tanglik → `push_in`/`shake`; yolg'izlik → `pull_out`/`crane_up`; o'tish → `pan_*`; xotira → `orbit_*`.
- O'tishlar: vaqt sakrashi → `blackout`; zarba → `flash`; yumshoq → `fade`.
- Tovush: ichki holat → `heartbeat`; kutish → `clock_tick`; yolg'izlik → `hum`/`wind`/`rain`. Musiqa: `pad_low` (og'ir), `pad_hope` (iliq), `pulse` (tanglik), `none` (eng kuchli lahzadan oldin jimlik).

## 5. Metadata
- Sarlavha ≤ 70 belgi, KATTA harf faqat asosiy qismda: `DADDY IS A PHONE | He Worked Abroad for 5 Years | Animated Short Film`.
- Muqova matni 2–3 so'z, sarlavhani takrorlamaydi.
- Tavsif: 2–4 qisqa paragraf → izoh uchun savol → oxirida ≤ 3 hashtag. **Vaqt belgilari yozilmaydi** (`chapter` maydonidan avtomatik).
- Teglar 10–18 ta, aniq mavzu + format ("animated short film", "silent short film", "ryzon").

## 6. Xavfsizlik
- Og'ir mavzu → `sensitive: true`. Tiklanish va yordam so'rashni ko'rsating. O'z-o'ziga zarar usuli, qon, zo'ravonlik — **hech qachon**.
- Real brendlar, ilovalar, shaxslar nomi yo'q.
- Jinsiy so'zlar sarlavha, teg, muqovada yo'q (policy.js bloklaydi).

## 7. Tekshiruv (yozgandan keyin)
`npm run validate -- <papka>` — barcha `✗` tuzatiladi, `⚠` imkon qadar.
