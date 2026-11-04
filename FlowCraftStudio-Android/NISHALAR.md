# FlowCraft: YouTube uchun kuchli nishalar va shablon g'oyalari

> Maqsad: xaridor dasturni ochganda **tayyor, ishlaydigan formula**ni tanlasin va birinchi videoni yordam so'ramasdan chiqarsin.
> Eslatma: `goldstudio.work` sayti bu ish muhitidan ochilmadi (tarmoq cheklovi), shuning uchun u bilan solishtirish qilinmadi.
> Hujjatdagi ko'rishlar soni yoki daromad bo'yicha raqamlar ataylab yozilmagan: tekshirilmagan raqam xaridorni chalg'itadi.

---

## 1. Nisha tanlash mezonlari

Har bir shablon 5 ta savolga "ha" deb javob berishi kerak:

1. **Yuzsiz (faceless).** Ovoz (TTS) + AI rasmlar + montaj bilan to'liq ishlaydi, kamera kerak emas.
2. **Uzun ko'rish vaqti.** Hikoya formati odamni 10–60 daqiqa ushlab turadi: watch time va reklama joylari ko'p bo'ladi.
3. **Cheksiz mavzu.** Formula bitta, mavzular minglab (masalan, "Agar sen [yil]-yilda [joyda]…"). Xaridor 100-videoda ham g'oya topa oladi.
4. **Xavfsiz monetizatsiya.** Zo'ravonlik, so'kinish, tibbiy yoki moliyaviy "maslahat" va shok yo'q. Reklama beruvchilar uchun qulay.
5. **Takrorlanmaydi.** Har video boshqacha ilgak, tuzilish va ovoz bilan chiqadi. Bu ishni dasturdagi `variety.js` (FCDNA) bajaradi. YouTube 2025-yildan beri bir xil, ommaviy ishlab chiqarilgan kontentni "inauthentic content" deb monetizatsiyadan chiqaradi, shuning uchun xilma-xillik juda muhim.

---

## 2. Dasturdagi shablonlar (16 ta)

### Mavjud 13 ta (4.0.4 dan)
| # | Shablon | Til | Nima uchun kuchli |
|---|---|---|---|
| 1 | Tarix (Genius History) | en | Doimiy qiziqish, cheksiz mavzu |
| 2 | Biznes va Finance | en | Moliya mavzusida reklama odatda qimmat turadi |
| 3 | G'alati tarix (Paint) | en | Qisqa, qiziqarli, Shorts'ga mos |
| 4 | Qadimgi Odamlar | en | "Qanday yashashgan?" degan savol hamisha qiziq |
| 5 | Inson Ongi va Falsafa | en | Psixologiya — o'sib borayotgan nisha |
| 6 | Horror Story (True Stories) | en | Yuqori ushlab turish, 3 hikoya formati |
| 7 | Jamiyat Psixologiyasi (Masal) | en | Minimal vizual (bo'r), tez ishlab chiqiladi |
| 8 | Tibbiyot (Pixar 3D) | en | Ta'limiy, oilaviy auditoriya |
| 9 | Wojak Doomer | en | Yosh auditoriya, Shorts |
| 10 | Brendlar tarixi | en | Biznes hikoyalari |
| 11 | Agar sen… (Tarixiy POV) | **uz** | O'zbek tilida raqobat kam |
| 12 | Apokalipsis va Omon Qolish | en | "What if" formati |
| 13 | Kasblar va Hayot Bosqichlari | en | "Every level" formati |

### Yangi 3 ta (4.2.0)
| # | Shablon | Til | Formula | Nega aynan shu |
|---|---|---|---|---|
| 14 | **Oilaviy dramalar** | **ru** | "[Kim] [nima qildi]. А через год…" | Sizning `ИНСТРУКЦИЯ.md`, `СТИЛЬ.md`, `СТРУКТУРА.md` hujjatlaringiz asosida. 45+ yoshli rusiyzabon auditoriya uzun hikoyalarni oxirigacha tinglaydi. MDH bozori O'zbekistondagi xaridorlarga eng yaqin |
| 15 | **Uyqu uchun tarix** | en | "What Life Was Like for [X] in [Davr] \| Boring History for Sleep" | 30–60 daqiqali videolar, odam uxlab qolguncha tinglanadi: juda uzun ko'rish vaqti. Vizual sodda (sokin moybo'yoq), rasm kam kerak (har ~16 so'zga 1 kadr) |
| 16 | **Adolat hikoyalari (Karma)** | en | "My Boss Fired Me… So I Did This" | Qoniqarli yakun odamni oxirigacha ushlaydi. Long va Shorts'ga mos. Faqat qonuniy "qasos" va original hikoya, Reddit'dan ko'chirish yo'q |

Har bir yangi shablonda boshqalardagidek: rol, mavzu qolipi, ssenariy qoidalari, 5 bosqichli reja, rasm uchun "STYLE LOCK" va prompt formulalari, personaj pasportlari (DNA), 1–2 muqova formulasi va SEO maslahati bor.

---

## 3. Keyingi shablonlar uchun g'oyalar (hali qo'shilmagan)

| G'oya | Til | Formula | Ehtiyot bo'lish kerak |
|---|---|---|---|
| **Ibratli hikoyalar / masallar** | uz, ru | "Ota o'g'liga bitta tanga berdi…" | Diniy mavzu bo'lsa manbalarga juda aniq tayanish kerak |
| **Ruscha "Истории из жизни" (qisqa)** | ru | 3–5 daqiqali Shorts va qisqa hikoyalar | 14-shablonning qisqa varianti sifatida qo'shsa bo'ladi |
| **"Agar sen…" (MDH tarixi, ruscha)** | ru | "Если бы ты жил в СССР в 1975 году" | 11-shablonni rus tiliga moslash kifoya |
| **Hayvonlar dunyosi: "What if" va faktlar** | en | "What If Elephants Disappeared?" | Faktlarni tekshirish |
| **Kosmos uchun uyqu** | en | "Fall Asleep to the Edge of the Universe" | 15-shablonning ilmiy varianti |
| **Kasb sirlari (o'zbekcha)** | uz | "Taksichining bir kuni: qancha topadi?" | Raqamlar real bo'lishi kerak |
| **Shaxsiy moliya (o'zbekcha)** | uz | "Oyiga 5 million bilan qanday yashash mumkin" | Investitsiya bo'yicha "maslahat" emas, faqat hayotiy hisob-kitob |

---

## 4. "Odam qo'li tegmasin" deganda shablonga qo'yiladigan talablar

1. **Mavzu qolipi + 4–6 ta namuna sarlavha.** Xaridor mavzu o'ylab topishda qiynalmasligi uchun.
2. **Ssenariy qoidalari TTS uchun toza.** Sarlavha, `[music]`, emoji yo'q (dasturdagi `COMMON_SCRIPT` buni majbur qiladi).
3. **STYLE LOCK + personaj DNA.** Butun videoda rasmlar bir xil uslubda va bir xil personaj bilan chiqadi.
4. **Muqova formulasi + SEO.** Video yuklashga to'liq tayyor bo'ladi.
5. **Dastur o'zi tuzatadi.** 4.2 dan boshlab "Tizim tekshiruvi" va "Xato maslahatchisi" bor. Render muammoga uchrasa sifat avtomatik pasayadi yoki protsessorda qayta yig'iladi.

## 5. Kanal egasiga tavsiyalar (videoni yuklayotganda)

- YouTube Studio'da haqiqiyga o'xshash (realistik) AI kontent uchun **"Altered or synthetic content"** belgisini yoqing. Oilaviy drama va "TRUE" hikoyalar shunga kiradi.
- Tavsifda hikoya to'qima yoki dramatizatsiya ekanini yozing.
- Haftasiga 2–3 ta sifatli video joylang. Kuniga 10 ta bir xil video chiqarish monetizatsiyaga xavf soladi.
- Har videoda kamida bitta "inson qo'li"ni qo'shing: o'z sarlavhangiz, muqovani tanlash, kirish qismini tahrirlash.
