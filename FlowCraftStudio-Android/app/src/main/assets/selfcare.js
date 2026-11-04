/* FlowCraft — "o'zi ishlaydigan" qatlam (4.2).
   Maqsad: foydalanuvchi yordam so'rab yozmasin. Dastur muammoni o'zi topadi, oddiy tilda tushuntiradi
   va bir tugma bilan tuzatadi.
   1) Tizim tekshiruvi: WebView, video/ovoz kodlovchi, xotira, RAM, quvvat tejash, internet, litsenziya, AI kaliti.
   2) Bosh sahifada ogohlantirish (faqat haqiqiy muammo bo'lsa).
   3) Xato maslahatchisi: xato chiqsa — "nima qilish kerak" kartochkasi va tuzatish tugmasi.
   4) Kalitni buferdan avtomatik qo'yish (Telegram botdan nusxalab qaytganda).
   5) Yordam markazi: qidiruvli savol-javoblar (internetsiz ishlaydi).
   Windows/PWA versiyasida ham ishlaydi; Android'ga xos tugmalar faqat APK ichida chiqadi. */
(function(){
'use strict';
const AND=window.AndroidDownloader||null;
const isApk=!!AND&&typeof AND.startSave==='function';
const q=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const say=(m,err)=>{try{if(typeof window.toast==='function')window.toast(m,err)}catch(_){}};
const has=fn=>typeof window[fn]==='function';
const MIN_CHROME=110;           /* WebCodecs barqaror ishlaydigan WebView versiyasi */
const CODECS=['avc1.640028','avc1.4d0028','avc1.42e028','avc1.42001f'];

/* ---------------- yordamchilar ---------------- */
function chromeVer(){const m=navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/);return m?+m[1]:0}
function device(){if(!isApk||!AND.deviceInfo)return{};try{return JSON.parse(AND.deviceInfo()||'{}')}catch(_){return{}}}
async function encOk(W,H){if(!window.VideoEncoder)return false;for(const hw of ['prefer-hardware','no-preference'])for(const codec of CODECS){
 try{const s=await VideoEncoder.isConfigSupported({codec,width:W,height:H,bitrate:W*H>2e6?8e6:4e6,framerate:30,hardwareAcceleration:hw,avc:{format:'avc'}});if(s.supported)return true}catch(_){}}return false}
async function audioOk(){if(!window.AudioEncoder)return false;for(const codec of ['mp4a.40.2','opus']){try{const s=await AudioEncoder.isConfigSupported({codec,numberOfChannels:2,sampleRate:48000,bitrate:160000});if(s.supported)return true}catch(_){}}return false}
async function json(path){try{const r=await fetch(path);return r.ok?await r.json():null}catch(_){return null}}
function openSettings(sec){try{const b=q('.sbtn[data-nav="s-settings"]');if(b)b.click();else if(has('show'))window.show('s-settings');setTimeout(()=>{if(has('setSec'))window.setSec(sec);else{const p=q('#setNav [data-sec="'+sec+'"]');if(p)p.click()}},60)}catch(_){}}
function openScreen(id){const b=q('.sbtn[data-nav="'+id+'"]');if(b)b.click();else if(has('show'))window.show(id)}
function updateWebView(){if(isApk&&AND.openWebViewUpdate)AND.openWebViewUpdate();else window.open('https://www.google.com/chrome/','_blank')}
/* ochiq loyihaning eksport sifati (P.export.q) — 720p */
function setQuality720(){try{const b=q('#qual [data-q="720"]');if(b&&b.offsetParent){b.click();say('Sifat 720p ga o\'rnatildi');return}
 if(typeof P!=='undefined'&&P){P.export=Object.assign({},P.export,{q:'720'});if(has('save'))window.save();say('Shu loyiha 720p da yig\'iladi');return}
 say('Loyiha ochilganda: 8-qadam (Eksport) → "SD 720p" ni tanlang')}catch(_){}}
const FIX={update:['WebView\'ni yangilash',updateWebView],q720:['720p ga o\'tish',setQuality720],projects:['Loyihalarni ochish',()=>openScreen('s-projects')],
 ai:['AI kalitini kiritish',()=>openSettings('k')],act:['Faollashtirish',()=>{if(has('show'))window.show('s-act')}],
 bot:['Botni ochish',()=>{const a=q('#botLink');if(a)a.click()}],recheck:['Qayta tekshirish',()=>run(true)]};

/* ---------------- 1. Tizim tekshiruvi ---------------- */
let LAST=null,RUNNING=null;
async function run(force){if(RUNNING)return RUNNING;if(LAST&&!force)return LAST;
 RUNNING=(async()=>{const R=[],add=(lv,id,t,d,fix)=>R.push({lv,id,t,d,fix});const dev=device(),cv=chromeVer();
  /* WebView va WebCodecs */
  if(!window.VideoEncoder||!window.VideoFrame)add('bad','webcodecs','Video yig\'ish imkonsiz','Telefondagi "Android System WebView" juda eski'+(cv?' (v'+cv+')':'')+'. Uni Play Market\'dan yangilang, keyin dasturni qayta oching.','update');
  else if(cv&&cv<MIN_CHROME)add('warn','webview','WebView eskirgan (v'+cv+')','Video yig\'ish ishlaydi, lekin xatolar ko\'proq bo\'ladi. Play Market\'dan "Android System WebView"ni yangilang.','update');
  else add('ok','webview','Video dvigateli tayyor',cv?'WebView v'+cv:'');
  /* kodlovchi sifati */
  if(window.VideoEncoder){const q1=await encOk(1280,720),q2=await encOk(1920,1080),q4=await encOk(3840,2160);
   if(!q1)add('bad','enc','Video kodlovchi topilmadi','Bu qurilma H.264 videoni kodlay olmayapti. WebView\'ni yangilang.','update');
   else add(q2?'ok':'warn','enc','Eng yuqori sifat: '+(q4?'4K':q2?'1080p':'720p'),q2?(q4?'':'4K tanlansa dastur o\'zi 1080p da yig\'adi.'):'1080p tanlansa ham dastur o\'zi 720p da yig\'adi.',q2?null:'q720');}
  if(window.VideoEncoder&&!(await audioOk()))add('warn','audio','Ovoz kodlovchi yo\'q','Video ovozsiz chiqishi mumkin. WebView\'ni yangilang.','update');
  /* xotira */
  const free=+dev.freeMb||0;if(free){if(free<500)add('bad','space','Xotira deyarli to\'lgan ('+free+' MB)','Video yig\'ish uchun kamida 1–2 GB bo\'sh joy kerak. Eski loyihalarni yoki galereyadagi keraksiz videolarni o\'chiring.','projects');
   else if(free<2000)add('warn','space','Bo\'sh joy kam ('+(free/1024).toFixed(1)+' GB)','Uzun (10+ daqiqa) videolar uchun 2 GB dan ko\'p joy tavsiya etiladi.','projects');
   else add('ok','space','Bo\'sh joy: '+(free/1024).toFixed(1)+' GB','')}
  try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();if(e.quota&&e.usage/e.quota>0.85)add('warn','quota','Dastur xotirasi to\'lib qolyapti','Loyihalar '+Math.round(e.usage/1048576)+' MB joy egallagan. Tugatilgan loyihalarni o\'chiring.','projects')}}catch(_){}
  /* RAM va quvvat */
  const ram=+dev.ramMb||0;if(ram&&ram<3500)add('warn','ram','Operativ xotira kam ('+(ram/1024).toFixed(1)+' GB)','720p tanlang va render paytida boshqa ilovalarni yoping. Dastur xotira yetishmasa sahifani o\'zi qayta yuklaydi, loyihalar saqlanadi.','q720');
  if(dev.powerSave)add('warn','power','Quvvat tejash rejimi yoqilgan','Bu rejimda video 2–3 baravar sekin yig\'iladi. Render paytida quvvat tejashni o\'chiring va telefonni quvvatga ulang.');
  /* internet */
  if(!navigator.onLine)add('warn','net','Internet yo\'q','Ssenariy, rasm va ovoz (AI) ishlamaydi. Montaj va video yig\'ish internetsiz ham ishlaydi.');
  /* litsenziya */
  const lic=await json('/api/license');
  if(lic){if(!lic.ok)add('bad','lic','Litsenziya faol emas',lic.message||'Botdan kalit oling va "Faollashtirish" bo\'limiga qo\'ying.','act');
   else{let days=null;if(lic.expires){const t=Date.parse(lic.expires);if(!isNaN(t))days=Math.ceil((t-Date.now())/864e5)}
    if(days!=null&&days<=3)add('warn','lic','Litsenziya '+(days<=0?'bugun':days+' kunda')+' tugaydi','Uzilish bo\'lmasligi uchun botdan yangi kalit oling.','bot');
    else add('ok','lic','Litsenziya: '+(lic.plan||'faol'),lic.expires?lic.expires+' gacha':'')}}
  /* AI */
  try{if(has('aiReady')){if(!window.aiReady())add('warn','ai','AI kaliti kiritilmagan','Ssenariy va ovozni dastur yozishi uchun bepul Gemini kalitini kiriting (aistudio.google.com/apikey). Kalitsiz ham tayyor matnni joylab ishlash mumkin.','ai');else add('ok','ai','AI ulangan','')}}catch(_){}
  LAST={at:Date.now(),items:R,bad:R.filter(x=>x.lv==='bad').length,warn:R.filter(x=>x.lv==='warn').length};
  try{window.FCDIAG&&FCDIAG.add({k:'ui',n:'Tizim tekshiruvi',ok:true,msg:R.filter(x=>x.lv!=='ok').map(x=>x.t).join('; ')})}catch(_){}
  renderPanel();renderBanner();return LAST})().finally(()=>{RUNNING=null});
 return RUNNING}

const ICON={ok:'✓',warn:'!',bad:'✕'};
function itemsHTML(items){return items.map(x=>`<div class="fcs-it fcs-${x.lv}"><span class="fcs-i">${ICON[x.lv]}</span><div class="fcs-tx"><b>${esc(x.t)}</b>${x.d?`<small>${esc(x.d)}</small>`:''}</div>${x.fix&&FIX[x.fix]?`<button class="pill sm" type="button" data-fcfix="${x.fix}">${esc(FIX[x.fix][0])}</button>`:''}</div>`).join('')}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-fcfix]');if(!b)return;const f=FIX[b.dataset.fcfix];if(f){e.preventDefault();f[1]()}});

/* ---------------- 2. Bosh sahifa banneri ---------------- */
function renderBanner(){const host=q('#s-home .home-hero');if(!host||!LAST)return;let b=q('#fcHealth');
 const top=LAST.items.filter(x=>x.lv==='bad').concat(LAST.items.filter(x=>x.lv==='warn'&&['webview','space','lic','power'].includes(x.id)));
 if(!top.length){if(b)b.remove();return}
 if(!b){b=document.createElement('div');b.id='fcHealth';b.className='panel fcs-banner';host.parentNode.insertBefore(b,host)}
 b.innerHTML=`<div class="fcs-bh"><b>${LAST.bad?'Ishlashdan oldin tuzating':'Diqqat'}</b><button class="pill sm" type="button" data-fchelp="1">Batafsil</button></div>`+itemsHTML(top.slice(0,3))}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-fchelp]');if(b){e.preventDefault();openHelp()}});

/* ---------------- 3. Yordam markazi (Sozlamalar → Yordam) ---------------- */
const FAQ=[
 ['Kalitni qanday olaman va faollashtiraman?','"Faollashtirish" ekranidagi bot tugmasini bosing: ID\'ingiz botga havola orqali o\'zi uzatiladi (bot so\'rasa, ID\'ni "Nusxa" tugmasi bilan nusxalab yuboring). Bot bergan kalitni Telegram\'da nusxalang va dasturga qayting: kalit o\'zi qo\'yiladi va faollashadi. Kalit faqat shu qurilmada ishlaydi.','kalit litsenziya faollashtirish bot id'],
 ['"Bu kalit shu qurilma uchun emas" deyapti','Kalit boshqa ID uchun berilgan. Dasturni qayta o\'rnatgan yoki ma\'lumotlarini tozalagan bo\'lsangiz ID o\'zgaradi. Bot tugmasini qayta bosing: bot yangi ID uchun kalit beradi.','kalit xato id boshqa qurilma'],
 ['Gemini kaliti qayerdan olinadi? (bepul)','aistudio.google.com/apikey saytiga Google akkaunt bilan kiring → "Create API key" → kalitni nusxalang → Sozlamalar → AI xizmati → Gemini maydoniga qo\'ying. Limit tez tugasa 2–3 ta kalit qo\'shing: dastur ular orasida o\'zi almashadi.','gemini api kalit ai bepul aistudio'],
 ['"Limit tugadi" / AI javob bermayapti','Bepul Gemini kalitining daqiqalik limiti bor: dastur o\'zi kutib, qayta urinadi. Kunlik limit tugasa ertagacha kuting yoki boshqa Google akkauntdan yana kalit qo\'shing. Internet ishlayotganini ham tekshiring.','limit 429 kvota ai ishlamayapti gemini'],
 ['Video qayerga saqlanadi?','Galereyaga: Movies → FlowCraft papkasi. Android 7–9 da ruxsat berilmagan bo\'lsa: Android/data/…/files/Movies. Saqlangach ekranda "✓ Video galereyaga saqlandi" xabari chiqadi.','qayerda video saqlandi galereya papka'],
 ['Video yig\'ish (render) juda sekin','Quvvat tejash rejimini o\'chiring, telefonni quvvatga ulang va render tugaguncha dasturdan chiqmang (ekran o\'zi yoniq turadi). Kuchsiz telefonda 720p tanlang. "Tizim tekshiruvi" sekinlashtirayotgan sababni ko\'rsatadi.','sekin render tezlik uzoq'],
 ['Render xato bilan to\'xtadi','Dastur avval o\'zi qayta urinadi: videokarta xato bersa protsessor bilan, sifat qo\'llanmasa pastroq sifat bilan. Baribir to\'xtasa: 720p tanlang, boshqa ilovalarni yoping va "Tizim tekshiruvi"ni ishga tushiring.','render xato to\'xtadi kodlash'],
 ['Dastur o\'zi qayta yuklandi','Telefon xotirasi yetishmaganda sahifa qayta yuklanadi. Loyihalar har qadamda saqlangan, hech narsa yo\'qolmaydi. 720p tanlang va fondagi ilovalarni yoping.','qayta yuklandi yopildi crash'],
 ['"Xotira to\'ldi" xabari','Loyihalar bo\'limidan tugatilgan loyihalarni o\'chiring (videolar galereyada qoladi). Telefondagi keraksiz videolar va fayllarni ham tozalang. Render uchun 1–2 GB bo\'sh joy kerak.','xotira to\'ldi joy yo\'q quota'],
 ['Ovoz yo\'q yoki ovoz fayli o\'qilmadi','MP3, M4A yoki WAV fayl yuklang. Ovoz Gemini TTS bilan yaratilsa, Gemini kaliti kiritilganini tekshiring. "Tizim tekshiruvi"da "Ovoz kodlovchi yo\'q" chiqsa WebView\'ni yangilang.','ovoz yo\'q tts audio musiqa'],
 ['Rasm yoki video yuklanmayapti','Rasm: JPG, PNG, WEBP. Video: MP4 (H.264). Juda katta videolar (400 MB dan ortiq) sekin ishlaydi — oldin qisqartiring. Fayllarni kadr raqami bilan nomlang (01.jpg, 02.jpg …): tartiblash oson bo\'ladi.','rasm yuklanmayapti video format'],
 ['Telefon almashtirsam loyihalar ko\'chadimi?','Yo\'q: xavfsizlik uchun loyihalar va kalit faqat shu telefonda saqlanadi. Tayyor videolar galereyada qoladi. Yangi telefonda botdan yangi ID uchun kalit oling.','telefon almashtirish ko\'chirish zaxira'],
 ['"Orqaga" tugmasi','Ochiq oyna yoki menyu bo\'lsa, avval o\'sha yopiladi. Keyin oldingi qadamga qaytadi. Bosh sahifada ikki marta bosilsa dastur yopiladi.','orqaga tugma chiqish'],
 ['Muammo hal bo\'lmadi','Sozlamalar → Diagnostika → "Hisobotni saqlash". Hisobot saqlanadi va "Ulashish" oynasi ochiladi: uni Telegram\'da @osonyoutube_admin ga yuboring. Hisobotda API kalitlar, ssenariy va rasmlar bo\'lmaydi.','yordam admin hisobot diagnostika'],
];
function ensurePanel(){const nav=q('#setNav'),body=q('.set-body');if(!nav||!body)return null;
 if(!q('#setNav [data-sec="h"]')){const b=document.createElement('button');b.className='pill';b.type='button';b.dataset.sec='h';b.textContent='Yordam';nav.insertBefore(b,nav.firstChild)}
 let p=q('.set-body>[data-sec-b="h"]');if(!p){p=document.createElement('div');p.className='panel';p.dataset.secB='h';
  p.innerHTML=`<div class="row between"><div><h3>Tizim tekshiruvi</h3><p class="sub" style="margin-top:6px">Dastur telefoningizni o'zi tekshiradi va muammo bo'lsa tuzatish yo'lini ko'rsatadi.</p></div><button class="primary sm" type="button" data-fcfix="recheck">Tekshirish</button></div>
  <div id="fcsBody" class="fcs-list" style="margin-top:12px"><span class="note">Tekshirilmoqda…</span></div>
  <h3 style="margin-top:22px">Ko'p beriladigan savollar</h3><input class="input sm" id="fcsQ" placeholder="Qidirish: kalit, render, ovoz, xotira…" style="margin-top:10px">
  <div id="fcsFaq" class="fcs-faq" style="margin-top:10px"></div>`;
  body.insertBefore(p,body.firstChild);p.querySelector('#fcsQ').addEventListener('input',e=>renderFaq(e.target.value));renderFaq('')}
 return p}
function renderFaq(qs){const box=q('#fcsFaq');if(!box)return;const w=String(qs||'').toLowerCase().split(/\s+/).filter(Boolean);
 const L=FAQ.filter(f=>!w.length||w.every(x=>(f[0]+' '+f[1]+' '+f[2]).toLowerCase().includes(x)));
 box.innerHTML=L.length?L.map(f=>`<details class="fcs-q"><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join(''):'<p class="note">Topilmadi. "Muammo hal bo\'lmadi" bo\'limiga qarang.</p>'}
function renderPanel(){const b=q('#fcsBody');if(!b||!LAST)return;b.innerHTML=itemsHTML(LAST.items)+`<p class="note" style="margin-top:8px">Tekshirildi: ${new Date(LAST.at).toLocaleTimeString()}</p>`}
function openHelp(){ensurePanel();openSettings('h');run(true)}
window.FCHelp={open:openHelp,check:run};

/* ---------------- 4. Xato maslahatchisi ---------------- */
const COACH=[
 [/kalit noto|API key|API_KEY|ruxsat yo'q|PERMISSION/i,'Gemini kaliti ishlamayapti. Kalitni qaytadan nusxalab kiriting (aistudio.google.com/apikey).','ai'],
 [/kiritilmagan/i,'AI kaliti yo\'q. Bepul Gemini kalitini kiriting yoki tayyor matnni joylab ishlang.','ai'],
 [/limit|kvota|quota|RESOURCE_EXHAUSTED|429/i,'Bepul limit tugadi. Dastur o\'zi qayta urinadi; tezroq ishlash uchun 2–3 ta Gemini kaliti qo\'shing.','ai'],
 [/internet|network|failed to fetch|aloqa yo'q/i,'Internet aloqasi yo\'q. Wi-Fi yoki mobil internetni tekshiring.',null],
 [/xotira.*to'l|QuotaExceeded|joy yetarli emas|xotira to'lgan/i,'Xotira to\'ldi. Tugatilgan loyihalarni o\'chiring va telefonda joy bo\'shating.','projects'],
 [/kodla|WebCodecs|kodlay olmaydi|dekoder/i,'Video yig\'ishda muammo. 720p tanlang yoki WebView\'ni yangilang.','q720'],
 [/ovoz faylini|audio/i,'Ovoz fayli o\'qilmadi. MP3, M4A yoki WAV formatida yuklang.',null],
 [/video ochilmadi|formati tanilmadi|format qo'llanmaydi/i,'Video formati qo\'llanmaydi. MP4 (H.264) fayl yuklang.',null],
 [/litsenziya|muddati tugagan|shu qurilma uchun emas/i,'Kalit muammosi. Botdan shu qurilma ID\'si uchun yangi kalit oling.','bot'],
 [/galereyaga saqlab|saqlashni boshlab/i,'Video saqlanmadi. Xotirada joy borligini tekshiring; Android 7–9 da xotiraga ruxsat bering.','projects']];
let coachT=null;
function coach(msg){const m=String(msg||'');const hit=COACH.find(c=>c[0].test(m));if(!hit)return;let c=q('#fcCoach');
 if(!c){c=document.createElement('div');c.id='fcCoach';c.className='fcs-coach';document.body.appendChild(c)}
 const fx=hit[2]&&FIX[hit[2]];
 c.innerHTML=`<div class="fcs-tx"><b>Nima qilish kerak?</b><small>${esc(hit[1])}</small></div>${fx?`<button class="pill sm" type="button" data-fcfix="${hit[2]}">${esc(fx[0])}</button>`:''}<button class="pill sm" type="button" data-fchelp="1">Yordam</button><button class="fcs-x" type="button" aria-label="Yopish">×</button>`;
 c.querySelector('.fcs-x').onclick=()=>c.classList.remove('on');c.classList.add('on');clearTimeout(coachT);coachT=setTimeout(()=>c.classList.remove('on'),14000)}
function wrapToast(){if(!has('toast')||window.toast.__fc)return false;const orig=window.toast;
 const w=function(m,err){const r=orig.apply(this,arguments);if(err)try{coach(m)}catch(_){}return r};w.__fc=1;window.toast=w;return true}

/* ---------------- 5. Kalitni buferdan avtomatik qo'yish ---------------- */
let triedKey='';
function autoKey(){try{if(!isApk||!AND.licenseKeyFromClipboard)return;const act=q('#s-act');if(!act||!act.classList.contains('show'))return;
 const k=AND.licenseKeyFromClipboard();if(!k||k===triedKey)return;const ta=q('#key');if(!ta)return;triedKey=k;ta.value=k;say('Kalit buferdan olindi, faollashtirilmoqda…');
 setTimeout(()=>{const b=q('#activate');if(b)b.click()},350)}catch(_){}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(autoKey,400)});
window.addEventListener('focus',()=>setTimeout(autoKey,400));
/* faollashtirish ekraniga qisqa ko'rsatma */
function actHint(){const n=q('#s-act .note:last-of-type');if(!n||n.dataset.fc)return;n.dataset.fc=1;
 if(isApk)n.insertAdjacentHTML('afterend','<p class="note" style="margin-top:6px;color:var(--ink-2)">Botdan kalitni nusxalab qayting — dastur uni o\'zi qo\'yadi va faollashtiradi.</p>')}

/* ---------------- ishga tushirish ---------------- */
function start(){wrapToast();ensurePanel();actHint();
 /* "Yordam" tugmasi bosh sahifa sarlavhasida */
 const acts=q('#s-home .top .actions');if(acts&&!q('#fcHelpBtn')){const b=document.createElement('button');b.id='fcHelpBtn';b.type='button';b.className='chip';b.dataset.fchelp='1';b.textContent='? Yordam';acts.appendChild(b)}
 const nav=q('#setNav');if(nav)nav.addEventListener('click',e=>{const b=e.target.closest('[data-sec="h"]');if(b){ensurePanel();if(!has('setSec')){/* setSec bo'lmasa o'zimiz ko'rsatamiz */document.querySelectorAll('.set-body>[data-sec-b]').forEach(x=>x.classList.toggle('on',x.dataset.secB==='h'))}run(false)}});
 setTimeout(()=>run(false),1500);setTimeout(autoKey,1800);
 addEventListener('online',()=>run(true));addEventListener('offline',()=>run(true))}
const wait=(n=0)=>{if((typeof bootReady!=='undefined'&&bootReady)||n>150)start();else setTimeout(()=>wait(n+1),120)};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>wait());else wait();
})();
