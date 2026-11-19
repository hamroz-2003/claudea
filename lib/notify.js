// Telegram xabarnomalari. Token yo'q bo'lsa jim o'tadi.
// Xavfsizlik: xabarga .env qiymatlari yoki to'liq stack trace yuborilmaydi.
const redact = (s) => String(s)
  .replace(/(token|secret|key|refresh)[^\s]*\s*[:=]\s*\S+/gi, '$1=[yashirildi]')
  .replace(/ya29\.[\w-]+/g, '[token]')
  .replace(/1\/\/[\w-]{20,}/g, '[token]');

export async function notify(text) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = process.env;
  console.log(`[Telegram] ${text.split('\n')[0]}`);
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: redact(text).slice(0, 4000), disable_web_page_preview: true }),
    });
    if (!res.ok) console.warn(`[Telegram] ${res.status} ${await res.text()}`);
  } catch (e) { console.warn(`[Telegram] yuborilmadi: ${e.message}`); }
}
