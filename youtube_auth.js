// Bir martalik avtorizatsiya: brauzerda "Ryzon Uz" Brand Account'ni tanlang.
// Lokal server kodni avtomatik ushlaydi (nusxa ko'chirish shart emas).
//   node youtube_auth.js          refresh token'ni ekranga chiqaradi
//   node youtube_auth.js --save   .env fayliga o'zi yozadi
import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import { oauthClient, SCOPES } from './lib/youtube.js';

const client = oauthClient();
const redirect = new URL(process.env.GOOGLE_REDIRECT_URI || 'http://127.0.0.1:3000/oauth2callback');
const authUrl = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirect.origin);
  if (url.pathname !== redirect.pathname) { res.writeHead(404).end(); return; }
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  try {
    if (err || !code) throw new Error(err || "kod yo'q");
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) throw new Error("refresh_token qaytmadi. https://myaccount.google.com/permissions da ilovaga ruxsatni bekor qilib, qayta urinib ko'ring.");
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h2>Tayyor ✅ Terminalga qayting.</h2>');
    if (process.argv.includes('--save')) {
      const envPath = '.env';
      let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
      env = /^YOUTUBE_REFRESH_TOKEN=.*$/m.test(env) ? env.replace(/^YOUTUBE_REFRESH_TOKEN=.*$/m, `YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`) : `${env.trimEnd()}\nYOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
      fs.writeFileSync(envPath, env);
      console.log('\n✅ YOUTUBE_REFRESH_TOKEN .env fayliga yozildi.');
    } else {
      console.log(`\n.env fayliga qo'shing:\nYOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
    }
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<h2>Xato: ${String(e.message).replace(/</g, '&lt;')}</h2>`);
    console.error('OAuth xatosi:', e.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(Number(redirect.port || 80), redirect.hostname, () => {
  console.log(`\n1) Shu havolani brauzerda oching va "Ryzon Uz" Brand Account'ni tanlang:\n\n${authUrl}\n`);
  console.log(`2) Ruxsat bergach, ${redirect.origin} ga qaytasiz — token avtomatik olinadi.`);
  console.log("   Ruxsatlar: video yuklash, video holatini o'zgartirish, analitikani o'qish.\n");
});
