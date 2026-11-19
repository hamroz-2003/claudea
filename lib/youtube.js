import fs from 'node:fs';
import { google } from 'googleapis';

export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload', // videos.insert, thumbnails.set
  'https://www.googleapis.com/auth/youtube', // videos.update (publish), playlistItems.insert
  'https://www.googleapis.com/auth/yt-analytics.readonly', // kanal tahlili
];

export function oauthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error(".env da GOOGLE_CLIENT_ID va GOOGLE_CLIENT_SECRET yo'q");
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI || 'http://127.0.0.1:3000/oauth2callback');
}

export function authed() {
  if (!process.env.YOUTUBE_REFRESH_TOKEN) throw new Error("YOUTUBE_REFRESH_TOKEN yo'q. Avval: npm run auth");
  const c = oauthClient();
  c.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return c;
}

export const yt = () => google.youtube({ version: 'v3', auth: authed() });
export const ytAnalytics = () => google.youtubeAnalytics({ version: 'v2', auth: authed() });

/**
 * Videoni yuklaydi. Har doim avval private (yoki publishAt bilan rejalashtirilgan).
 * Eslatma: tasdiqlanmagan (audit o'tmagan) API loyihasidan yuklangan videolar YouTube tomonidan
 * "private" holatida qulflanadi — shuning uchun standart rejim "manual".
 */
export async function uploadVideo(videoPath, meta, { publishAt } = {}) {
  const res = await yt().videos.insert({
    part: ['snippet', 'status'],
    notifySubscribers: true,
    requestBody: {
      snippet: {
        title: meta.title.slice(0, 100),
        description: meta.description,
        tags: meta.tags,
        categoryId: process.env.YOUTUBE_CATEGORY_ID || '1', // Film & Animation
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus: 'private',
        ...(publishAt ? { publishAt } : {}),
        selfDeclaredMadeForKids: false,
        // Stilizatsiyalangan animatsiya — real voqea/odam sifatida ko'rinmaydi, shuning uchun false (haqqoniy)
        containsSyntheticMedia: false,
      },
    },
    media: { body: fs.createReadStream(videoPath) },
  });
  return res.data;
}

export async function setThumbnail(videoId, pngPath) {
  try {
    await yt().thumbnails.set({ videoId, media: { mimeType: 'image/png', body: fs.createReadStream(pngPath) } });
    return true;
  } catch (e) {
    console.warn(`[YouTube] Muqova o'rnatilmadi (kanal telefon orqali tasdiqlanganmi?): ${e.message}`);
    return false;
  }
}

export async function addToPlaylist(videoId, playlistId) {
  if (!playlistId) return;
  try {
    await yt().playlistItems.insert({ part: ['snippet'], requestBody: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } } });
  } catch (e) { console.warn(`[YouTube] Pleylistga qo'shilmadi: ${e.message}`); }
}

/** Videoni darhol ommaga chiqarish yoki vaqtini belgilash */
export async function publish(videoId, { at } = {}) {
  const api = yt();
  const cur = await api.videos.list({ part: ['status'], id: [videoId] });
  if (!cur.data.items?.length) throw new Error(`Video topilmadi: ${videoId}`);
  const status = { ...cur.data.items[0].status, selfDeclaredMadeForKids: false };
  if (at) { status.privacyStatus = 'private'; status.publishAt = new Date(at).toISOString(); } else { status.privacyStatus = 'public'; delete status.publishAt; }
  const res = await api.videos.update({ part: ['status'], requestBody: { id: videoId, status } });
  return res.data.status;
}

export const playlistForPillar = (pillar) => process.env[`YOUTUBE_PLAYLIST_${String(pillar).toUpperCase()}`] || '';
