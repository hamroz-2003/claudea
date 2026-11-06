# FlowCraft Studio: foydalanuvchi qo'llanmasi

FlowCraft ikki qismdan iborat:

- **Ilova** (Android APK yoki brauzer): siz ko'radigan va boshqaradigan interfeys.
- **Engine**: videoni yasaydigan "dvigatel". Og'ir ish shu yerda bajariladi, telefonda emas.

Engine'ni ikki joyda ishga tushirish mumkin. Ikkalasi ham bepul.

## 1-variant: kompyuter (eng tez)

1. Kompyuterga Python 3.10+ va FFmpeg o'rnating.
2. `apps/core-engine` papkasida: `pip install -r requirements.txt`
3. Engine'ni ishga tushiring: `python main.py --lan`
4. Ekranda manzil (masalan, `http://192.168.1.10:4100`) va **token** chiqadi.
5. Telefon kompyuter bilan **bir Wi-Fi tarmog'ida** bo'lsin. Ilovani ochib, manzil va tokenni kiriting.

Kompyuterning o'zida brauzerda `http://127.0.0.1:4100` ni ochsangiz ham bo'ladi.

## 2-variant: faqat telefon (Hugging Face Space)

1. huggingface.co'da bepul akkaunt oching.
2. FlowCraft Engine Space'ini oching → **⋮ → Duplicate this Space**. Hardware: **CPU basic (free)**.
3. Nusxangizda: **Settings → Variables and secrets → New secret** → nomi `FLOWCRAFT_TOKEN`, qiymati uzun parol.
4. Ilovada manzil sifatida `https://<akkaunt>-<space-nomi>.hf.space`, token sifatida o'sha parolni kiriting.

Eslatma: bepul Space'da 2 ta CPU bor, shuning uchun render kompyuterdagidan sekinroq. Bundan tashqari, Space qayta ishga tushsa, fayllar o'chib ketishi mumkin. Tayyor videoni darhol yuklab oling.

## Video tayyorlash: 5 qadam

1. **Yangi loyiha:** nom, davr va joy, qahramonlar, ssenariy. `#` bilan boshlangan qator bob sarlavhasi bo'ladi.
2. **Promptlar:** avtomatik boshlanadi. Har bir sahna uchun boshqacha plan va burchak tanlanadi.
3. **Ovoz:** "AI diktor" (bepul o'zbekcha ovoz) yoki o'zingiz yozgan ovozni yuklang.
4. **Vizuallar:** "Bepul yaratish". Rasmlar va boshidagi animatsiyali kliplar yasaladi. Istalgan sahnaga bosib, o'z rasm yoki videongizni ham yuklashingiz mumkin.
5. **Render:** avval "540p render" bilan tez ko'rib chiqing, keyin "Tez 1080p30" yoki "Master 1080p60" tanlab yakuniy videoni chiqaring → **Yuklab olish**. YouTube boblari tayyor holda chiqadi: nusxa olib, video tavsifiga qo'ying.

## Sozlamalar (bepul variantlar)

| Nima | Tavsiya | Nima kerak |
|---|---|---|
| Promptlar uchun matn AI | Google Gemini | aistudio.google.com'dan bepul API kalit |
| Rasmlar | Pollinations | Hech narsa |
| Boshidagi animatsiyalar | Wan 2.2, Hugging Face | huggingface.co → Settings → Access Tokens → **Read** token |
| HF kvotasi tugasa | 2.5D parallaks | Avtomatik ishlaydi |

Hugging Face har bir akkauntga kuniga ma'lum miqdorda bepul GPU vaqti beradi. U tugasa, qolgan kliplar avtomatik ravishda 2.5D parallaks bilan yasaladi. Kvota ertasi kuni yangilanadi.

## Android ilovasini o'rnatish

1. GitHub → repo → **Actions → Android APK** → oxirgi muvaffaqiyatli build → **Artifacts** bo'limidan `flowcraft-studio-debug-apk` ni yuklab oling.
2. Arxivdan `app-debug.apk` ni chiqarib, telefonga o'tkazing va o'rnating. "Noma'lum manbalardan o'rnatish"ga ruxsat bering.
3. Play Market'ga chiqarish uchun imzolangan release APK kerak. Buning uchun `ANDROID_KEYSTORE_*` maxfiy qiymatlarini repo sozlamalariga qo'shing (README'ga qarang).
