# Ryzon Uz — kanal tahlili va monetizatsiya strategiyasi

> Ma'lumotlar: YouTube Studio Analytics (vidIQ orqali), 2026-11-13 holatiga. Yangilash: `/kanal-tahlil` yoki `npm run analyze`.
> Eslatma: 2026-08-27 dan YouTube ko'rishni birinchi kadrdan hisoblaydi; taqqoslashda `engagedViews` ishonchliroq.

---

## 1. Hozirgi holat (raqamlarda)

| Ko'rsatkich | Qiymat | YPP talabi | Yetishmaydi |
|---|---|---|---|
| Obunachilar | **644** | 1 000 (to'liq) / 500 (kengaytirilgan) | 356 / ✅ |
| Uzun video tomosha soatlari (365 kun) | **≈ 2 349** | 4 000 / 3 000 | ≈ 1 651 / ≈ 651 |
| Ommaviy videolar | 9 uzun + 1 Shorts | 90 kunda 3 ta (kengaytirilgan) | ✅ |
| Jami ko'rishlar | 163 946 | — | — |

**Eng yaqin marra — kengaytirilgan YPP** (500 obuna + 3 000 soat + 90 kunda 3 ta yuklama): a'zolik (membership), Super Thanks va shu kabi funksiyalar ochiladi. Bu daraja **mintaqaga bog'liq** — YouTube Studio → *Earn* bo'limida mamlakatingiz uchun mavjudligini tekshiring. Kanal mamlakati sozlamasi haqiqiy yashash joyingizni ko'rsatishi shart.

### Videolar bo'yicha

| Video | Ko'rish | O'rt. tomosha | Obuna / 1000 ko'rish |
|---|---|---|---|
| NEVER AGAIN WATCH PORN (2:57) | 146 588 | 41% | 2.9 |
| NEVER AGAIN 2 (5:00) | 10 405 | 32% | 2.5 |
| DAY 3 (2:46) | 2 330 | 40% | 4.3 |
| I'M BUSY, DAD (3:11) | 1 484 | **42%** | **8.8** |
| ONE MORE. (3:21) | 1 430 | 36% | 3.5 |
| NEVER AGAIN 3 (4:05) | 768 | 35% | 2.6 |
| Why We Watch PornHub (4:09) | 698 | 29% | 7.9 |
| ALL IN (4:05) | 576 | 29% | 8.8 |
| What If You Never Quit on Day 3? (3:30) | 525 | 31% | 5.7 |

### Auditoriya (2026-10-01 – 11-13)
- **Mamlakatlar:** Hindiston 29%, AQSh 14%, Filippin 10%, Bangladesh, JAR, Keniya, Malayziya, Germaniya, Britaniya, Pokiston.
- **Demografiya:** 78% erkak; **18–34 yoshli erkaklar — 52%**; 35–44 yoshli erkaklar — 13.5%.
- **Trafik:** Bosh sahifa (Browse) **82%**, tavsiya etilganlar (Suggested) 10%, End screen 2.3% (o'rtacha tomosha **119 s**, eng yuqori), qidiruv atigi 1.1%.
- **Dinamika:** kunlik ko'rish 18–24 oktyabrdagi cho'qqidan (~11 700/kun) hozir 2 000–4 000/kun gacha tushgan; kunlik yangi obunachilar 60–74 dan 8–13 gacha.

## 2. Tashxis — 6 ta asosiy xulosa

1. **Bitta hit kanalni ko'tarib turibdi.** Ko'rishlarning 89% bitta videoda. Algoritm kanalni hali "tushunmagan": hitdan keyingi videolar bosh sahifada sinovdan o'tmayapti.
2. **Muqova + sarlavha hamma narsani hal qiladi.** Trafikning 82% bosh sahifadan; qidiruv deyarli yo'q. Demak SEO teglari ikkinchi darajali, **CTR (bosish ulushi)** birinchi darajali.
3. **Retention 0:28–0:46 oralig'ida qulaydi.** Hit videoda tomoshabinlarning 76% 0:27 gacha qoladi, 0:46 da esa 50% gacha tushadi. Qolganlar oxirigacha qoladi (60–91% oralig'ida egri chiziq tekis ~30%). Demak **ikkinchi akt kech boshlanyapti** — birinchi 30 soniyada kuchayish bo'lishi shart.
4. **Obunaga aylanish — asosiy to'siq.** O'rtacha 3 obuna / 1000 ko'rish. Shu tezlikda 356 obuna uchun ~120 000 ko'rish kerak; 6/1000 da esa ~60 000. Oilaviy hikoya (I'M BUSY, DAD) 8.8/1000 berdi — lekin bu kichik namuna, gipoteza sifatida sinaymiz.
5. **Shorts deyarli ishlatilmagan** (1 ta, 247 ko'rish). Shorts — 18–34 yoshli auditoriyaga obuna yig'ishning eng arzon kanali.
6. **Metadata xavfi.** "Why We Watch PornHub" videosida `porn, porno, sex, sexy, xxx, sex video` teglari va brend nomi bor. YPP tekshiruvchisi kanalni umumiy ko'rib chiqadi — bu "aldamchi metadata / jinsiy kontent" sifatida rad etish sababi bo'lishi mumkin. **Monetizatsiyaga ariza berishdan oldin tuzating** (3-bo'lim).

## 3. Birinchi hafta: tozalash (qo'lda, 30 daqiqa)

- [ ] "Why We Watch PornHub": sarlavhani `Why Your Brain Can't Stop Watching (The Dopamine Trap)` ga o'zgartiring; `porn, porno, sex, sexy, xxx, sex video, porn video` teglarini olib tashlang. Yoki videoni private qiling.
- [ ] "NEVER AGAIN WATC PORN #animation" Shorts: imloni tuzating yoki private qiling.
- [ ] Barcha videolarda: Made for kids = **No**; Kategoriya = **Film & Animation**.
- [ ] Kanal "trailer"i va bosh sahifa: hit video + "Family" pleylisti.
- [ ] 4 ta pleylist yarating: *Family*, *Loneliness*, *Addiction & Recovery*, *Discipline*. ID'larini `.env` ga yozing (`YOUTUBE_PLAYLIST_FAMILY=...`).
- [ ] Hit videoga qadalgan izoh (pinned comment) + end screen → eng yangi oilaviy film.

## 4. Pozitsiya: "Ryzon" — bitta qahramon, bitta olam

**Ryzon — gapirilmaydigan muammolar haqidagi ovozsiz animatsion filmlar olami.**
Sariq hudili qahramon — har bir filmda o'sha *Ryzon*, lekin turli hayotiy vaziyatda. Tomoshabin qahramonni taniydi → keyingi filmni bosadi → obuna bo'ladi.

**Nega ovozsiz va ingliz tilida matn bilan:** auditoriya Hindiston, AQSh, Filippin, Afrika — ovozsiz hikoya til to'sig'ini olib tashlaydi, matn qisqa va oddiy ingliz tilida.

### Kontent ustunlari

| Ustun | Ulush | Nega | Misol mavzular |
|---|---|---|---|
| **Oila** (family) | 35% | Eng yuqori obuna konversiyasi va retention | Chet elda ishlaydigan ota, onaning javobsiz qo'ng'iroqlari, aka-uka janjali, ishsiz ota |
| **Yolg'izlik / ruhiy salomatlik** (loneliness) | 25% | 18–34 yoshli erkaklarning eng katta og'rig'i | 200 do'st — qo'ng'iroq qiladigan odam yo'q, yangi shaharda, yashirin depressiya |
| **Qaramlik va tiklanish** (addiction) | 20% | Hit shu ustundan chiqqan | Onlayn qarz ilovalari, alkogolli ota (bola nigohi), telefon |
| **Intizom / taqqoslash** (discipline) | 20% | DAY 3 yaxshi ishlagan | "Hammadan orqadaman", kelajakdagi o'zing, 1-yanvar yana |

"NEVER AGAIN" seriyasi yakunlandi. Yangi filmlar — **mustaqil (STANDALONE)**, lekin bitta olamda.

## 5. Formatlar

1. **Asosiy film** — 3:00–5:00, 16:9, haftada **2 ta** (Seshanba va Juma, 13:30 UTC = Hindiston 19:00, AQSh 08:30 ET). Tomosha soatlarining asosiy manbai.
2. **Shorts** — har bir filmdan 35–55 s vertikal kesma (avtomatik, `shortScenes`). Asosiy videoga "Related video" orqali bog'lanadi. Maqsad — yangi obunachilar.
3. **Kompilyatsiya** (3–4 filmdan keyin) — ustun bo'yicha 12–20 daqiqalik to'plam, yangi kirish va o'tish sahnalari bilan. Uzun sessiya = ko'p tomosha soati. *Faqat qo'shimcha qiymat bilan* — aks holda "takroriy kontent" deb baholanadi.

## 6. Hikoya tuzilmasi (retention uchun)

Batafsil: [`SSENARIY_QOIDALARI.md`](SSENARIY_QOIDALARI.md). Qisqacha:

| Vaqt | Bosqich | Vazifa |
|---|---|---|
| 0:00–0:05 | **Cold open** | Eng kuchli lahza oldinga chiqariladi ("Mama… who is he?") |
| 0:05–0:12 | Hook | "5 years earlier" — savol ochiq qoladi |
| 0:12–0:45 | Setup + birinchi zarba | 45 s dan oshmasin; **0:30 gacha muammo boshlanadi** (0:28 dagi qulashga qarshi) |
| 35–65% | Burilish / cho'qqi | Kutilmagan, lekin mantiqiy zarba |
| 65–90% | Yechim | Nasihat emas — tasvir, harakat, detal |
| oxirgi 12 s | CTA | End screen: keyingi film + obuna |

End screen trafigi eng uzoq tomosha qilinadi (119 s) — har bir film oxirida **o'xshash ustundagi** filmni tavsiya qiling.

## 7. Sarlavha va muqova qoidalari

- Sarlavha ≤ 70 belgi, qiziqish bo'shlig'i (curiosity gap): `DADDY IS A PHONE | He Worked Abroad for 5 Years`.
- Muqovada 2–3 so'z, sarlavhani **takrorlamaydi**: `WHO IS HE?`.
- Bitta yirik qahramon, bitta urg'u rangi (sariq), qorong'i fon.
- Taqiqlangan: jinsiy so'zlar, brend nomlari, yolg'on va'da (clickbait). `lib/policy.js` buni avtomatik tekshiradi.
- Har bir film uchun 2 xil muqova tayyorlang va YouTube "Test & Compare" funksiyasidan foydalaning.

## 8. Monetizatsiya yo'l xaritasi

| Bosqich | Muddat (taxmin) | Maqsad | Asosiy harakat |
|---|---|---|---|
| 0 | 1-hafta | Kanal toza | 3-bo'limdagi ro'yxat |
| 1 | 1–4 hafta | 3 000 soat (kengaytirilgan YPP) | 8 film + 8 Shorts, oila ustuniga urg'u |
| 2 | 4–10 hafta | 1 000 obuna + 4 000 soat | Haftada 2 film, kompilyatsiya, eng yaxshi ustunni kuchaytirish |
| 3 | YPP dan keyin | Daromadni diversifikatsiya | A'zolik, Super Thanks, ruhiy salomatlik/o'z-o'zini rivojlantirish ilovalari bilan homiylik |

**Hisob-kitob:** o'rtacha 74 s tomosha → har 1 000 ko'rish ≈ 20 soat. 3 000 soatga ~32 000, 4 000 ga ~80 000 qo'shimcha ko'rish kerak. Filmlar 3–4 daqiqa va 45% retention bo'lsa (≈ 95 s), 4 000 soatga ~63 000 ko'rish yetadi. Muddatlar — taxmin, kafolat emas: algoritm va CTR ga bog'liq.

## 9. Xavflar va himoya

| Xavf | Himoya (tizimda) |
|---|---|
| **"Inauthentic / takroriy kontent"** (YPP siyosati, 2025) — shablon asosida ommaviy ishlab chiqarilgan videolar monetizatsiya qilinmaydi | Har film — yangi hikoya; `policy.js` sarlavha o'xshashligini tekshiradi; haftada 2 tadan oshmaydi; **inson tekshiruvi majburiy** (`manual`/`review` rejimi) |
| API orqali yuklangan video "private" holatida qulflanadi (audit o'tmagan Google Cloud loyihasi) | Standart rejim `manual`: tizim render + metadata paketini tayyorlaydi, siz Studio orqali yuklaysiz. Audit o'tgach `review`/`schedule` ga o'ting |
| Reklama cheklanishi (sariq belgi) | Jinsiy so'zlar bloklanadi; og'ir mavzularda `sensitive: true` → tavsifga yordam manbalari qo'shiladi; o'z-o'ziga zarar usullari bloklanadi |
| Musiqa bo'yicha Content ID da'volari | Barcha tovushlar FFmpeg bilan protsedurali yaratiladi (100% original) |
| Sun'iy o'sish | Obuna/ko'rish sotib olmang, "sub4sub" qilmang — kanal YPP dan butunlay chetlatilishi mumkin |

## 10. Haftalik KPI (`/kanal-tahlil` har dushanba)

- CTR (bosh sahifa) ≥ 6% · O'rtacha tomosha ≥ 45% · 0:30 dagi retention ≥ 70%
- Obuna / 1 000 ko'rish ≥ 5 · End screen bosish ≥ 3%
- Har hafta: eng yaxshi va eng yomon film — nima uchun? Natija `content/calendar.json` dagi keyingi mavzularga ta'sir qiladi.
