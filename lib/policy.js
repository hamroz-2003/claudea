// YouTube siyosati va reklama beruvchilarga mos kontent bo'yicha avtomatik tekshiruv.
// "block" — nashr to'xtatiladi; "warn" — inson ko'rib chiqishi kerak.
// Manbalar: YouTube Advertiser-friendly content guidelines, YPP "inauthentic content",
// metadata (spam/deceptive practices) qoidalari.

const BLOCK_TERMS = [
  'pornhub', 'xvideos', 'xnxx', 'onlyfans', 'xxx', 'nsfw', 'hentai', 'nude', 'nudes', 'naked',
  'sex video', 'sexy', 'porno', 'porn video', 'hot girl', '18+',
];
// Mavzu sifatida muhokama qilish mumkin, lekin sarlavha/muqovada sariq belgi (cheklangan reklama) xavfi yuqori
const WARN_TERMS = ['porn', 'sex', 'suicide', 'kill myself', 'self harm', 'self-harm', 'drugs', 'cocaine', 'heroin', 'gun', 'blood'];
// O'z-o'ziga zarar usullarini ko'rsatish — YouTube'da taqiqlangan
const SELF_HARM_METHOD = ['overdose', 'pills to die', 'rope', 'noose', 'jump off', 'cut myself', 'cutting myself', 'slit', 'hang myself'];

const lc = (s) => String(s || '').toLowerCase();
const hasTerm = (text, term) => new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i').test(text);

const words = (s) => new Set(lc(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
const jaccard = (a, b) => {
  const A = words(a); const B = words(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.max(1, new Set([...A, ...B]).size);
};

/** @returns {{block: string[], warn: string[]}} */
export function lintEpisode(ep, history = []) {
  const block = [];
  const warn = [];
  const meta = { title: ep.title, description: ep.description, tags: (ep.tags || []).join(', '), thumbnail: `${ep.thumbnail?.text || ''} ${ep.thumbnail?.subtext || ''}` };
  const captions = (ep.scenes || []).map((s) => s.caption?.text || '').join(' \n ');

  for (const [field, text] of Object.entries({ ...meta, captions })) {
    for (const t of BLOCK_TERMS) if (hasTerm(text, t)) block.push(`${field}: taqiqlangan/xavfli so'z "${t}" (reklama cheklanadi yoki YPP rad etadi)`);
    for (const t of WARN_TERMS) if (hasTerm(text, t) && (field === 'title' || field === 'thumbnail')) warn.push(`${field}: "${t}" — sarlavha/muqovada sariq belgi xavfi. Muqobil so'z toping`);
    for (const t of SELF_HARM_METHOD) if (hasTerm(text, t)) block.push(`${field}: o'z-o'ziga zarar usuli tilga olingan ("${t}") — YouTube siyosatiga zid`);
  }

  if (/[<>]/.test(ep.title) || /[<>]/.test(ep.description)) block.push('title/description: "<" yoki ">" belgisi — YouTube API rad etadi');
  if ((ep.title || '').length > 100) block.push('title: 100 belgidan uzun');
  // YouTube teglari: jami 500 belgi (bo'shliqli teglar qo'shtirnoq bilan hisoblanadi)
  const tagChars = (ep.tags || []).reduce((n, t) => n + t.length + (t.includes(' ') ? 2 : 0), 0) + Math.max(0, (ep.tags || []).length - 1);
  if (tagChars > 500) block.push(`tags: jami ${tagChars} belgi (> 500)`);
  const hashtags = (ep.description.match(/#[\p{L}0-9_]+/gu) || []).length;
  if (hashtags > 15) warn.push(`description: ${hashtags} ta hashtag — 15 tadan ko'p bo'lsa spam deb qaralishi mumkin`);
  if (/\b\d{1,2}:\d{2}\b/.test(ep.description) && /\n\d{1,2}:\d{2}\s/.test(ep.description)) warn.push("description: qo'lda yozilgan vaqt belgilari bor — ularni olib tashlang, 'chapter' maydonidan avtomatik qo'shiladi");

  // Takroriy/shablon kontent (YPP "inauthentic content") — oldingi sarlavhalarga juda o'xshash bo'lmasin
  for (const h of history) {
    const sim = jaccard(ep.title, h.title);
    if (sim >= 0.7) block.push(`title: "${h.title}" bilan ${Math.round(sim * 100)}% o'xshash — takroriy kontent xavfi`);
    else if (sim >= 0.5) warn.push(`title: "${h.title}" ga o'xshash (${Math.round(sim * 100)}%)`);
    if (h.slug === ep.slug) block.push(`slug "${ep.slug}" allaqachon ishlatilgan`);
  }

  const capsRatio = (ep.title.replace(/[^A-Za-z]/g, '').match(/[A-Z]/g) || []).length / Math.max(1, ep.title.replace(/[^A-Za-z]/g, '').length);
  if (capsRatio > 0.8 && ep.title.length > 40) warn.push('title: deyarli hammasi KATTA harf — faqat kalit qismini katta qiling');

  return { block: [...new Set(block)], warn: [...new Set(warn)] };
}

export const HELP_LINE = '\n\nIf you are struggling, you are not alone. Find free, confidential support in your country: https://findahelpline.com';
