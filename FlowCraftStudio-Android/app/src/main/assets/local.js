/* FlowCraft — qurilma ichidagi yadro.
   Windows'dagi core.bin o'rnini bosadi: telefon (APK), Mac va iPhone (PWA) shu bilan ishlaydi.
   Ilova /api/... va /p/... so'rovlarini tarmoqqa emas, shu yerga yuboradi.
   Ma'lumotlar qurilmaning IndexedDB xotirasida saqlanadi. */
(function(){
'use strict';
const VERSION='4.0.4';
const LIC_PUB='lSt+CKyhSZI38Pzghyc8+3aV1I3ynfSTV+LLNjBT7Z4=';
const realFetch=window.fetch.bind(window);
/* APK qobig'idagi ko'prik nomi "AndroidDownloader" (avval "Android" deb qidirilardi — shu sabab telefonda video galereyaga saqlanmasdi) */
const AND=window.AndroidDownloader||window.Android||null;
const isAndroid=!!AND&&typeof AND.startSave==='function';
const isDesk=!!window.FC_DESK;document.documentElement.classList.add('fcl');/* Windows oynasi (WebView2) */
const deskTok=()=>{let t=(location.hash.match(/t=([0-9a-f]+)/)||[])[1];try{if(t)sessionStorage.setItem('fct',t);else t=sessionStorage.getItem('fct')}catch(_){}return t||''};
async function desk(path,body){const r=await realFetch(path+(path.includes('?')?'&':'?')+'t='+deskTok(),{method:'POST',body});if(!r.ok)throw new Error('Windows xizmati javob bermadi ('+r.status+')');return r.json()}

/* ---------- 1. Xotira (IndexedDB) ---------- */
const DB={db:null,
 open(){if(this.db)return Promise.resolve(this.db);return new Promise((res,rej)=>{const r=indexedDB.open('flowcraft',1);
  r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv');if(!d.objectStoreNames.contains('files'))d.createObjectStore('files')};
  r.onsuccess=()=>{this.db=r.result;res(this.db)};r.onerror=()=>rej(new Error('Xotira ochilmadi: '+(r.error&&r.error.message)))})},
 async tx(store,mode,fn){const d=await this.open();return new Promise((res,rej)=>{const t=d.transaction(store,mode),s=t.objectStore(store);let out;
  try{out=fn(s)}catch(e){rej(e);return}t.oncomplete=()=>res(out instanceof IDBRequest?out.result:out);t.onerror=()=>rej(new Error('Xotiraga yozib bo\'lmadi: '+(t.error&&t.error.message)));t.onabort=()=>rej(new Error(t.error&&t.error.name==='QuotaExceededError'?'Qurilma xotirasi to\'ldi. Eski loyihalarni o\'chiring':'Xotira amali bekor bo\'ldi'))})},
 get(store,k){return this.tx(store,'readonly',s=>s.get(k))},
 put(store,k,v){return this.tx(store,'readwrite',s=>s.put(v,k))},
 del(store,k){return this.tx(store,'readwrite',s=>s.delete(k))},
 async keys(store,prefix){const all=await this.tx(store,'readonly',s=>s.getAllKeys());return (all||[]).filter(k=>!prefix||String(k).startsWith(prefix))}};

/* ---------- 2. Fayl manzillari (blob URL) ---------- */
const URLS=new Map();/* "pid/rel" -> objectURL */
async function fileURL(pid,rel){const k=pid+'/'+rel;if(URLS.has(k))return URLS.get(k);const b=await DB.get('files',k);if(!b)return '';const u=URL.createObjectURL(b);URLS.set(k,u);return u}
function dropURL(k){const u=URLS.get(k);if(u){URL.revokeObjectURL(u);URLS.delete(k)}}
async function preload(pid){const all=await DB.keys('files',pid+'/');for(const k of all){if(!URLS.has(k)){const b=await DB.get('files',k);if(b)URLS.set(k,URL.createObjectURL(b))}}
 /* eski loyihalar: kichik nusxasi (thumbnail) yo'q rasm/videolar uchun orqa fonda yaratamiz */
 const have=new Set(all),miss=all.filter(k=>/\/images\//.test(k)&&!k.includes('/.th/')&&(IMGX.test(k)||VIDX.test(k))&&!have.has(thKey(k)));
 if(miss.length)setTimeout(async()=>{for(const k of miss){await makeThumb(pid,k.slice(pid.length+1))}try{window.dispatchEvent(new Event('fc-thumbs'))}catch(_){}},50)}
/* kichik nusxa: pid/.th/<rel>.jpg — tasma (timeline) va ro'yxatlar shu bilan yengil ishlaydi */
const thKey=k=>{const i=k.indexOf('/');return k.slice(0,i)+'/.th/'+k.slice(i+1)+'.jpg'};

/* ---------- 3. Qurilma ID va litsenziya ---------- */
async function deviceId(){if(isDesk){try{const r=await desk('/__fc/id');if(r.ok&&/^FC-[0-9A-F]{4}(-[0-9A-F]{4}){4}$/.test(r.id))return r.id}catch(_){}}let id=await DB.get('kv','deviceId');if(id)return id;const r=crypto.getRandomValues(new Uint8Array(10));const h=[...r].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
 id=`FC-${h.slice(0,4)}-${h.slice(4,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}`;await DB.put('kv','deviceId',id);return id}
function b32dec(s){const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,val=0;const out=[];for(const ch of s){const v=A.indexOf(ch);if(v<0)throw new Error('bad');val=(val<<5)|v;bits+=5;if(bits>=8){out.push((val>>>(bits-8))&255);bits-=8}}return new Uint8Array(out)}
function verifyKey(key,id){const k=String(key||'').toUpperCase().replace(/\s+/g,'');if(!k.startsWith('FC3-'))return{ok:false,message:'Kalit formati noto\'g\'ri. Kalit FC3- bilan boshlanadi'};
 const i=k.indexOf('-',4);if(i<0)return{ok:false,message:'Kalit formati noto\'g\'ri'};const head=k.slice(4,i),plan=head[0],exp=head.slice(1);let sig;
 try{sig=b32dec(k.slice(i+1).replace(/-/g,''))}catch(_){return{ok:false,message:'Kalit to\'liq emas yoki xato ko\'chirilgan'}}if(sig.length!==64)return{ok:false,message:'Kalit to\'liq emas yoki xato ko\'chirilgan'};
 const pub=Uint8Array.from(atob(LIC_PUB),c=>c.charCodeAt(0));const msg=new TextEncoder().encode('FC3|'+id+'|'+plan+'|'+exp);
 if(!window.nacl||!nacl.sign.detached.verify(msg,sig,pub))return{ok:false,message:'Bu kalit shu qurilma uchun emas. Botga shu qurilmadagi ID\'ni yuboring'};
 if(exp!=='0'){const t=Date.UTC(+exp.slice(0,4),+exp.slice(4,6)-1,+exp.slice(6,8),+exp.slice(8,10),+exp.slice(10,12));if(Date.now()>t)return{ok:false,message:'Kalit muddati tugagan'};return{ok:true,plan,expires:new Date(t).toLocaleString()}}
 return{ok:true,plan,expires:''}}
const PLAN={L:'Umrbod',M:'Oylik',W:'Haftalik',T:'Sinov'};
async function license(){const id=await deviceId(),key=await DB.get('kv','licKey');const st={ok:false,id,cpu:isAndroid?'Android':isDesk?'Windows':'Brauzer',bot:'flowcraftkalit_bot',admin:'osonyoutube_admin',version:VERSION};
 if(key){const v=verifyKey(key,id);if(v.ok){st.ok=true;st.plan=PLAN[v.plan]||v.plan;st.expires=v.expires}else st.message=v.message}return st}

/* ---------- 4. Yordamchilar ---------- */
const J=(o,code=200)=>new Response(JSON.stringify(o),{status:code,headers:{'Content-Type':'application/json'}});
const ERR=(m,code=400)=>new Response(m,{status:code,headers:{'Content-Type':'text/plain'}});
const uid=()=>Math.random().toString(36).slice(2,12);
async function bodyJSON(init){if(!init||init.body==null)return{};if(typeof init.body==='string'){try{return JSON.parse(init.body)}catch(_){return{}}}return{}}
async function bodyBlob(init){const b=init&&init.body;if(b instanceof Blob)return b;if(b instanceof ArrayBuffer||ArrayBuffer.isView(b))return new Blob([b]);if(typeof b==='string')return new Blob([b]);return new Blob([])}
let AC=null;function actx(){if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)();return AC}
async function decodeAudio(blob){const ab=await blob.arrayBuffer();return await new Promise((res,rej)=>{try{actx().decodeAudioData(ab.slice(0),res,()=>rej(new Error('Ovoz faylini o\'qib bo\'lmadi')))}catch(e){rej(e)}})}
async function audioDur(blob){try{return (await decodeAudio(blob)).duration}catch(_){return 0}}
const IMGX=/\.(png|jpe?g|webp|bmp|gif)$/i,VIDX=/\.(mp4|mov|webm|m4v)$/i;

/* ---------- 5. Loyihalar ---------- */
async function listProjects(){const ids=(await DB.get('kv','projects'))||[];const out=[];
 for(const id of ids){const p=await DB.get('kv','p:'+id);if(!p)continue;const o={id,name:p.name,step:p.step,status:p.status,thumb:p.thumb,dur:p.dur,format:p.format,tpl:p.tpl,updated:p.updated};
  if(p.thumb)o.thumbUrl=await fileURL(id,p.thumb);out.push(o)}
 return out.sort((a,b)=>(b.updated||0)-(a.updated||0))}
async function saveProject(p){p.updated=Date.now();await DB.put('kv','p:'+p.id,p);const ids=(await DB.get('kv','projects'))||[];if(!ids.includes(p.id)){ids.unshift(p.id);await DB.put('kv','projects',ids)}}
async function deleteProject(id){for(const k of await DB.keys('files',id+'/')){dropURL(k);await DB.del('files',k)}await DB.del('kv','p:'+id);const ids=((await DB.get('kv','projects'))||[]).filter(x=>x!==id);await DB.put('kv','projects',ids)}
async function mediaList(pid,kind){const out=[];for(const k of (await DB.keys('files',pid+'/'+kind+'/')).sort()){const name=k.split('/').pop();const b=await DB.get('files',k);const m=name.match(/^(\d+)/);
 out.push({rel:k.slice(pid.length+1),name,size:b?b.size:0,num:m?+m[1]:-1,time:-1,hash:name+':'+(b?b.size:0)});await fileURL(pid,k.slice(pid.length+1))}return out}

/* ---------- 6. Rasmlarni ovozga moslash (qurilmada) ---------- */
async function align(j){const T0=performance.now();const blob=await DB.get('files',j.project+'/'+j.audio);if(!blob)throw new Error('Ovoz fayli topilmadi');
 const buf=await decodeAudio(blob),T=buf.duration,n=Math.max(1,j.count|0);
 if(j.mode==='timecode'&&Array.isArray(j.starts)&&j.starts.length>=n&&j.starts.every(x=>x>=0)){const st=j.starts.slice(0,n).concat([T]);return{ok:true,durations:st.slice(0,n).map((s,i)=>Math.max(.3,st[i+1]-s)),total:T,silences:0}}
 if(j.mode==='equal')return{ok:true,durations:Array(n).fill(T/n),total:T,silences:0};
 /* aqlli: pauzalarni topib, gap uzunligiga qarab moslash */
 const ch=buf.getChannelData(0),sr=buf.sampleRate,win=Math.round(sr*0.02),en=[];for(let i=0;i<ch.length;i+=win){let e=0;for(let k=i;k<Math.min(i+win,ch.length);k++)e+=ch[k]*ch[k];en.push(Math.sqrt(e/win))}
 const sorted=[...en].sort((a,b)=>a-b),thr=Math.max(0.006,sorted[Math.floor(sorted.length*0.2)]*2.2);const sil=[];let run=0;
 for(let i=0;i<en.length;i++){if(en[i]<thr)run++;else{if(run>=9)sil.push((i-run/2)*0.02);run=0}}
 const tx=(j.texts&&j.texts.length===n)?j.texts:Array(n).fill('x');const w=tx.map(t=>Math.max(1,String(t).replace(/\s+/g,' ').length));const sum=w.reduce((a,b)=>a+b,0);
 const st=[0];let acc=0;for(let i=1;i<n;i++){acc+=w[i-1];let t=T*acc/sum;let best=null,bd=1e9;for(const s of sil){const d=Math.abs(s-t);if(d<bd&&d<Math.max(1.2,T/n*0.6)&&s>st[i-1]+0.4){bd=d;best=s}}st.push(best!=null?best:t)}
 for(let i=1;i<n;i++)if(st[i]<=st[i-1]+0.3)st[i]=st[i-1]+0.3;
 const d=st.map((s,i)=>Math.max(.3,(i+1<n?st[i+1]:T)-s));return{ok:true,durations:d,total:T,silences:sil.length,ms:Math.round(performance.now()-T0)}}

/* ---------- 7. Video yig'ish (WebCodecs) ---------- */
const JOBS={};
function ease(p){return p*p*(3-2*p)}
function motionXf(mo,t,d,z){const p=Math.max(0,Math.min(1,t/Math.max(.01,d)));
 if(mo==='in')return{s:1+(z-1)*p,x:0};if(mo==='out')return{s:z-(z-1)*p,x:0};if(mo==='left')return{s:z,x:0.03-0.06*p};if(mo==='right')return{s:z,x:-0.03+0.06*p};
 if(mo==='punch'){const q=p<0.18?ease(p/0.18)*0.15:0.15+0.01*(p-0.18)/0.82;return{s:1+q,x:0}}return{s:1,x:0}}
/* ---------- Video kliplar: kadrlarni aniq o'qish (WebCodecs + mp4box; bo'lmasa <video>) ---------- */
function rotOf(m){if(!m)return 0;const d=Math.round(Math.atan2(m[1],m[0])*180/Math.PI);return ((d%360)+360)%360}
function dimsOf(b){return [b.displayWidth||b.videoWidth||b.width||1,b.displayHeight||b.videoHeight||b.height||1]}
function demux(ab){return new Promise((res,rej)=>{let f,tr=null;const S=[];
 try{f=MP4Box.createFile()}catch(e){rej(e);return}
 f.onError=e=>rej(new Error('Video faylni o\'qib bo\'lmadi: '+e));
 f.onReady=info=>{tr=info.videoTracks&&info.videoTracks[0];if(!tr){rej(new Error('Videoda tasvir yo\'lagi yo\'q'));return}f.setExtractionOptions(tr.id,null,{nbSamples:1e9});f.start()};
 f.onSamples=(id,u,x)=>{for(const y of x)S.push(y)};
 ab.fileStart=0;try{f.appendBuffer(ab);f.flush()}catch(e){rej(e);return}
 setTimeout(()=>{if(!tr){rej(new Error('Video formati tanilmadi'));return}let desc;const t=f.getTrackById(tr.id);
  for(const e of t.mdia.minf.stbl.stsd.entries){const b=e.avcC||e.hvcC||e.vpcC||e.av1C;if(b){const st=new DataStream(undefined,0,DataStream.BIG_ENDIAN);b.write(st);desc=new Uint8Array(st.buffer,8);break}}
  res({tr,S,desc})},0)})}
class DecSrc{
 constructor(d){const tr=d.tr;this.S=d.S;this.ts=tr.timescale;this.rot=rotOf(tr.matrix);this.t0=Math.min(...d.S.slice(0,64).map(x=>x.cts))*1e6/this.ts;
  this.dur=tr.duration/tr.timescale||(d.S.length?d.S[d.S.length-1].cts/this.ts:0);
  this.cfg={codec:tr.codec,codedWidth:tr.video.width,codedHeight:tr.video.height,description:d.desc,optimizeForLatency:true};this.cur=null;this.ahead=[];this.dec=null;this.err=null;this.next=0}
 keyFor(T){let k=0;for(let i=0;i<this.S.length;i++){const s=this.S[i];if(s.is_sync&&s.cts*1e6/this.ts<=T)k=i}return k}
 reset(T){this.closeFrames();try{this.dec&&this.dec.state!=='closed'&&this.dec.close()}catch(_){}this.flushed=false;this.err=null;
  this.dec=new VideoDecoder({output:fr=>{let i=this.ahead.length;while(i>0&&this.ahead[i-1].timestamp>fr.timestamp)i--;this.ahead.splice(i,0,fr);this.wake&&this.wake()},error:e=>{this.err=new Error('Videoni o\'qishda xato: '+e.message);this.wake&&this.wake()}});
  this.dec.configure(this.cfg);this.next=this.keyFor(T)}
 feed(s){this.dec.decode(new EncodedVideoChunk({type:s.is_sync?'key':'delta',timestamp:Math.round(s.cts*1e6/this.ts),duration:Math.round(s.duration*1e6/this.ts),data:s.data}))}
 async frameAt(t){const T=Math.round(t*1e6+this.t0);
  if(!this.dec||this.dec.state==='closed'||(this.cur&&T<this.cur.timestamp-2000)||(!this.cur&&this.ahead.length&&T<this.ahead[0].timestamp-2000))this.reset(T);
  else{const k=this.keyFor(T);if(k>this.next&&!this.flushed)this.reset(T)}/* uzoq oldinga sakrash: eng yaqin kalit kadrdan */
  for(let guard=0;guard<100000;guard++){if(this.err)throw this.err;
   while(this.ahead.length&&this.ahead[0].timestamp<=T+1000){if(this.cur)this.cur.close();this.cur=this.ahead.shift()}
   if(this.ahead.length)return this.cur||this.ahead[0];
   if(this.next>=this.S.length){if(!this.flushed){this.flushed=true;try{await this.dec.flush()}catch(e){if(!this.cur)throw e}continue}if(this.cur)return this.cur;throw new Error('Videodan kadr olinmadi')}
   while(this.next<this.S.length&&this.dec.decodeQueueSize<4)this.feed(this.S[this.next++]);
   await new Promise(r=>{this.wake=r;setTimeout(r,30)});this.wake=null}
  throw new Error('Video kadrini kutish uzilib qoldi')}
 closeFrames(){if(this.cur){this.cur.close();this.cur=null}for(const f of this.ahead)f.close();this.ahead=[]}
 close(){this.closeFrames();try{this.dec&&this.dec.state!=='closed'&&this.dec.close()}catch(_){}this.S=[]}}
class ElSrc{/* zaxira yo'l: brauzerning o'z video pleyeri */
 static async open(url){const v=document.createElement('video');v.muted=true;v.playsInline=true;v.setAttribute('playsinline','');v.preload='auto';
  v.style.cssText='position:fixed;left:-10px;top:-10px;width:2px;height:2px;opacity:0;pointer-events:none';document.body.appendChild(v);v.src=url;
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('Video ochilmadi (format qo\'llanmaydi)')),20000);v.onloadeddata=()=>{clearTimeout(to);res()};v.onerror=()=>{clearTimeout(to);rej(new Error('Video ochilmadi (format qo\'llanmaydi)'))};v.load();const p=v.play();if(p)p.then(()=>v.pause()).catch(()=>{})});
  const s=new ElSrc();s.v=v;s.dur=v.duration||0;s.rot=0;return s}
 async frameAt(t){const v=this.v;if(Math.abs(v.currentTime-t)>0.015){await new Promise(r=>{const to=setTimeout(r,4000);v.onseeked=()=>{clearTimeout(to);r()};v.currentTime=t})}return v}
 close(){const v=this.v;if(!v)return;v.removeAttribute('src');try{v.load()}catch(_){}v.remove();this.v=null}}
async function openVideo(pid,rel,blob){blob=blob||await DB.get('files',pid+'/'+rel);if(!blob)throw new Error('Video topilmadi: '+rel);
 if(window.VideoDecoder&&window.MP4Box&&blob.size<400*1048576&&/\.(mp4|mov|m4v)$/i.test(rel)){try{const d=await demux(await blob.arrayBuffer());
  if(d.S.length&&(await VideoDecoder.isConfigSupported(d.cfg||{codec:d.tr.codec,codedWidth:d.tr.video.width,codedHeight:d.tr.video.height,description:d.desc})).supported){const s=new DecSrc(d);await s.frameAt(0);return s}}catch(e){console.warn('dekoder:',rel,e.message)}}
 return await ElSrc.open(await fileURL(pid,rel))}
async function makeThumb(pid,rel){let src=null,img=null;try{const b=await DB.get('files',pid+'/'+rel);if(!b)return;let rot=0;
  if(VIDX.test(rel)){src=await openVideo(pid,rel,b);img=await src.frameAt(Math.min(0.4,(src.dur||1)/3));rot=src.rot}else img=await createImageBitmap(b);
  const [iw,ih]=dimsOf(img),sw=rot%180?ih:iw,sh=rot%180?iw:ih,k=Math.min(1,360/Math.max(sw,sh)),W=Math.max(1,Math.round(sw*k)),H=Math.max(1,Math.round(sh*k));
  const cv=new OffscreenCanvas(W,H),ctx=cv.getContext('2d');drawCover(ctx,img,W,H,{s:1,x:0},1,rot);
  const jb=await cv.convertToBlob({type:'image/jpeg',quality:.8});const tk=thKey(pid+'/'+rel);await DB.put('files',tk,jb);dropURL(tk);URLS.set(tk,URL.createObjectURL(jb))}
 catch(e){console.warn('kichik nusxa:',rel,e.message)}finally{if(src)src.close();else if(img&&img.close)img.close()}}
async function loadBitmap(pid,rel){const b=await DB.get('files',pid+'/'+rel);if(!b)throw new Error('Rasm topilmadi: '+rel);
 if(VIDX.test(rel)){const s=await openVideo(pid,rel,b);try{return await createImageBitmap(await s.frameAt(0))}finally{s.close()}}
 return await createImageBitmap(b)}
function drawCover(ctx,bmp,W,H,xf,alpha,rot=0){const [iw,ih]=dimsOf(bmp),sw=rot%180?ih:iw,sh=rot%180?iw:ih,r=Math.max(W/sw,H/sh)*xf.s,w=iw*r,h=ih*r;ctx.globalAlpha=alpha;
 if(!rot)ctx.drawImage(bmp,(W-w)/2+xf.x*W,(H-h)/2,w,h);else{ctx.save();ctx.translate(W/2+xf.x*W,H/2);ctx.rotate(rot*Math.PI/180);ctx.drawImage(bmp,-w/2,-h/2,w,h);ctx.restore()}ctx.globalAlpha=1}
let SFX=null;/* ichki o'tish tovushlari: APK'da assets/sfx, brauzerda sfx/ papkasi */
async function builtinSfx(){if(SFX)return SFX;SFX=[];try{
 if(isAndroid&&AND.listSfx){const L=JSON.parse(AND.listSfx()||'[]');for(const n of L.slice(0,8)){try{const b64=AND.getAssetBase64(String(n).startsWith('sfx/')?n:'sfx/'+n);if(b64){const u=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));SFX.push(new Blob([u]))}}catch(_){}}}
 else{const r=await fetch('sfx/list.json');if(r.ok){for(const n of (await r.json()).slice(0,8)){try{const x=await fetch('sfx/'+encodeURIComponent(n));if(x.ok)SFX.push(await x.blob())}catch(_){}}}}}catch(_){}return SFX}
async function decodeAt(blob,rate){const ab=await blob.arrayBuffer();const c=new OfflineAudioContext(1,1,rate);return await new Promise((res,rej)=>{try{const p=c.decodeAudioData(ab,res,()=>rej(new Error('Ovoz faylini o\'qib bo\'lmadi')));if(p&&p.catch)p.catch(()=>{})}catch(e){rej(e)}})}
/* ovoz manbalari bir marta o'qiladi; keyin video 20 soniyalik bo'laklarda aralashtiriladi — 15 daqiqalik videoda ham telefon xotirasi to'lmaydi */
async function audioSources(job,pid,cl,starts){const A=job.audio||{},L=[];const dec=async(rel,rate)=>{if(!rel)return null;const b=await DB.get('files',pid+'/'+rel);return b?await decodeAt(b,rate):null};
 const v=await dec(A.voice,24000);if(v)L.push({buf:v,vol:A.voiceVol??1,at:0});
 const m=await dec(A.music,32000);if(m)L.push({buf:m,vol:(A.musicVol??0.18)*(A.duck?0.8:1),at:0,loop:true});
 if(A.sfxMode&&A.sfxMode!=='off'){const own=job.sfx||[];const bufs=[];
  if(own.length){for(const r of own){try{const x=await dec(r,48000);if(x)bufs.push(x)}catch(_){}}}else{for(const b of await builtinSfx()){try{bufs.push(await decodeAt(b,48000))}catch(_){}}}
  if(bufs.length)for(let i=1;i<cl.length;i++){if(A.sfxMode==='some'&&i%3)continue;L.push({buf:bufs[i%bufs.length],vol:A.sfxVol??0.45,at:Math.max(0,starts[i]-0.15)})}}
 return L}
async function audioSeg(L,t0,len,SR){const oc=new OfflineAudioContext(2,Math.max(1,Math.round(len*SR)),SR);
 for(const x of L){const d=x.buf.duration;if(!(d>0))continue;let when,off;
  if(x.loop){if(x.at>=t0+len)continue;if(x.at>=t0){when=x.at-t0;off=0}else{when=0;off=(t0-x.at)%d}}
  else{if(x.at+d<=t0||x.at>=t0+len)continue;if(x.at>=t0){when=x.at-t0;off=0}else{when=0;off=t0-x.at}}
  const src=oc.createBufferSource();src.buffer=x.buf;src.loop=!!x.loop;const g=oc.createGain();g.gain.value=x.vol;src.connect(g).connect(oc.destination);src.start(when,off)}
 return await oc.startRendering()}
async function pickAudioCodec(){if(!window.AudioEncoder)return null;for(const c of [{codec:'mp4a.40.2',mux:'aac'},{codec:'opus',mux:'opus'}]){try{const s=await AudioEncoder.isConfigSupported({codec:c.codec,numberOfChannels:2,sampleRate:48000,bitrate:160000});if(s.supported)return c}catch(_){}}return null}
async function pickVideoCodec(W,H,fps,br){for(const hw of ['prefer-hardware','no-preference'])for(const codec of ['avc1.640028','avc1.4d0028','avc1.42e028','avc1.42001f']){try{const s=await VideoEncoder.isConfigSupported({codec,width:W,height:H,bitrate:br,framerate:fps,hardwareAcceleration:hw,avc:{format:'avc'}});if(s.supported)return{codec,hw}}catch(_){}}return null}
async function render(id,job){const S=JOBS[id];const pid=job.project;
 const srcs=new Map();const dropSrc=k=>{const x=srcs.get(k);if(!x)return;try{x.b&&x.b.close&&x.b.close();x.v&&x.v.close()}catch(_){}srcs.delete(k)};
 try{
  if(!window.VideoEncoder||!window.Mp4Muxer)throw new Error('Bu qurilmada video yig\'ish qo\'llab-quvvatlanmaydi (WebCodecs yo\'q). Chrome yoki yangiroq tizim kerak');
  const q={'720':[1280,720],'1080':[1920,1080],'2160':[3840,2160]}[job.quality]||[1280,720];let [W,H]=q;if(job.format==='short')[W,H]=[H,W];
  const fps=job.fps||30,br=W*H>2e6?8e6:4e6,cl=job.clips||[];if(!cl.length)throw new Error('Montaj bo\'sh');
  const vcodec=await pickVideoCodec(W,H,fps,br);if(!vcodec)throw new Error(`Qurilma ${W}x${H} videoni kodlay olmaydi. Sifatni pasaytiring (720p)`);
  const starts=[];let T=0;for(const c of cl){starts.push(T);T+=c.d}
  S.stage='Ovoz tayyorlanmoqda';const acodec=await pickAudioCodec();let asrc=null;if(acodec&&(job.audio?.voice||job.audio?.music)){asrc=await audioSources(job,pid,cl,starts);if(!asrc.length)asrc=null}
  /* chiqish: Android'da to'g'ridan-to'g'ri galereyaga, brauzerda bo'laklar */
  const name=(String(job.name||'video').replace(/[\\/:*?"<>|]+/g,' ').trim().slice(0,60)||'video')+'_'+new Date().toISOString().slice(0,16).replace(/[-:T]/g,'')+'.mp4';
  const parts=[];let size=0;
  if(isAndroid&&!AND.startSave(name,'video/mp4',Math.round(T*1000)))throw new Error('Faylni saqlashni boshlab bo\'lmadi (xotiraga ruxsat bering)');
  let chain=Promise.resolve(),deskErr=null;if(isDesk){const r=await desk('/__fc/save/start?name='+encodeURIComponent(name));if(!r.ok)throw new Error(r.message||'Faylni yaratib bo\'lmadi')}
  const write=data=>{size+=data.byteLength;if(isDesk){const c=new Uint8Array(data).slice();chain=chain.then(async()=>{if(deskErr)return;const r=await desk('/__fc/save/chunk',c);if(!r.ok)deskErr=new Error(r.message)});return}if(isAndroid){let s='';const u=new Uint8Array(data);for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));if(!AND.writeChunk(btoa(s)))throw new Error('Faylga yozib bo\'lmadi (xotira to\'lgan bo\'lishi mumkin)')}else parts.push(new Uint8Array(data).slice())};
  const muxer=new Mp4Muxer.Muxer({target:new Mp4Muxer.StreamTarget({onData:(d,pos)=>{if(pos!==size)throw new Error("Video bo'laklari tartibi buzildi");write(d)},chunked:true,chunkSize:2**21}),fastStart:'fragmented',
   video:{codec:'avc',width:W,height:H,frameRate:fps},...(asrc?{audio:{codec:acodec.mux,numberOfChannels:2,sampleRate:48000}}:{})});
  let encErr=null;const venc=new VideoEncoder({output:(ch,meta)=>muxer.addVideoChunk(ch,meta),error:e=>{encErr=e}});
  venc.configure({codec:vcodec.codec,width:W,height:H,bitrate:br,framerate:fps,latencyMode:'quality',hardwareAcceleration:vcodec.hw,avc:{format:'avc'}});S.encoder=vcodec.hw==='prefer-hardware'?'Videokarta':'Protsessor';
  const cv=new OffscreenCanvas(W,H),ctx=cv.getContext('2d',{alpha:false});
  /* ustki qatlamlar (subtitr, elementlar) */
  const ov=[];for(const o of job.overlays||[]){try{ov.push({s:o.s,d:o.d,bmp:await loadBitmap(pid,o.png)})}catch(_){}}
  const subs=[];for(let i=0;i<cl.length;i++){const s=cl[i].sub;if(s){try{subs[i]=await loadBitmap(pid,s)}catch(_){}}}
  const filt=job.filterCss||'none',td=Math.max(0,job.transD||0.4),z=job.mode==='m-dyn'?1.14:1.08;
  /* har kadr manbai: rasm (bitmap) yoki video (har chiqish kadrida o'zining aniq kadri) */
  const srcOf=async i=>{if(!srcs.has(i)){const rel=cl[i].img;srcs.set(i,VIDX.test(rel)?{v:await openVideo(pid,rel)}:{b:await loadBitmap(pid,rel)})}for(const k of [...srcs.keys()])if(k<ci-1)dropSrc(k);return srcs.get(i)};
  const draw=async(i,lt,alpha)=>{const x=await srcOf(i),c=cl[i];if(x.b){drawCover(ctx,x.b,W,H,motionXf(c.motion,lt,c.d,z),alpha);return}
   const v=x.v,d=v.dur||0,tt=d>0.05?Math.min(lt%d,d-0.001):0;drawCover(ctx,await v.frameAt(Math.max(0,tt)),W,H,{s:1,x:0},alpha,v.rot)};
  const N=Math.ceil(T*fps);S.stage='Kadrlar yig\'ilmoqda';let ci=0;
  for(let f=0;f<N;f++){if(S.canceled)throw new Error('To\'xtatildi');if(encErr)throw new Error('Video kodlash xatosi: '+encErr.message);
   const t=f/fps;while(ci<cl.length-1&&t>=starts[ci+1])ci++;const c=cl[ci],lt=t-starts[ci];
   ctx.filter=filt;ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
   const useTr=td>0&&(job.trans!=='cut');
   if(useTr&&ci>0&&lt<td/2&&srcs.has(ci-1)){/* oldingi kadrdan silliq o'tish */await draw(ci-1,cl[ci-1].d-0.001,1);await draw(ci,lt,ease(0.5+lt/td))}
   else await draw(ci,lt,1);
   if(useTr&&ci<cl.length-1){const left=starts[ci+1]-t;if(left<td/2)await draw(ci+1,0,ease(0.5-left/td))}
   ctx.filter='none';if(subs[ci])ctx.drawImage(subs[ci],0,0,W,H);for(const o of ov)if(t>=o.s&&t<o.s+o.d)ctx.drawImage(o.bmp,0,0,W,H);
   const vf=new VideoFrame(cv,{timestamp:Math.round(t*1e6),duration:Math.round(1e6/fps)});venc.encode(vf,{keyFrame:f%(fps*2)===0});vf.close();
   if(venc.encodeQueueSize>8)await new Promise(r=>{const w=()=>venc.encodeQueueSize>4?setTimeout(w,5):r();w()});
   if(f%15===0){S.progress=0.05+0.85*f/N;await new Promise(r=>setTimeout(r,0))}}
  await venc.flush();venc.close();
  for(const k of [...srcs.keys()])dropSrc(k);
  if(asrc){S.stage='Ovoz kodlanmoqda';let aerr=null;const aenc=new AudioEncoder({output:(ch,meta)=>muxer.addAudioChunk(ch,meta),error:e=>{aerr=e}});aenc.configure({codec:acodec.codec,numberOfChannels:2,sampleRate:48000,bitrate:160000});
   const SEG=20,total=Math.round(T*48000);let done=0;
   for(let t0=0;t0<T-1e-6;t0+=SEG){if(S.canceled)throw new Error('To\'xtatildi');const len=Math.min(SEG,T-t0),ab=await audioSeg(asrc,t0,len,48000);
    const L=ab.getChannelData(0),R=ab.getChannelData(1),step=48000;for(let i=0;i<ab.length&&done<total;i+=step){const n=Math.min(step,ab.length-i,total-done),d=new Float32Array(n*2);d.set(L.subarray(i,i+n),0);d.set(R.subarray(i,i+n),n);
     const ad=new AudioData({format:'f32-planar',sampleRate:48000,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round(done/48000*1e6),data:d});aenc.encode(ad);ad.close();done+=n;if(aerr)throw new Error('Ovoz kodlash xatosi: '+aerr.message)}
    if(aenc.encodeQueueSize>16)await new Promise(r=>{const w=()=>aenc.encodeQueueSize>4?setTimeout(w,5):r();w()});S.progress=0.9+0.07*Math.min(1,(t0+len)/T)}
   await aenc.flush();aenc.close()}
  muxer.finalize();S.progress=0.97;S.stage='Saqlanmoqda';
  if(isDesk){await chain;if(deskErr)throw deskErr;const r=await desk('/__fc/save/finish');if(!r.ok)throw new Error(r.message||'Videoni saqlab bo\'lmadi');S.output=r.path}
  else if(isAndroid){if(!AND.finishSave())throw new Error('Videoni galereyaga saqlab bo\'lmadi');S.output='Galereya → Movies/FlowCraft/'+name}
  else{const blob=new Blob(parts,{type:'video/mp4'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),120000);S.output='Yuklab olinganlar → '+name}
  S.size=size;S.status='done';S.progress=1}
 catch(e){for(const k of [...srcs.keys()])dropSrc(k);S.status=S.canceled?'canceled':'error';S.error=e.message||String(e);if(isDesk){desk('/__fc/save/cancel').catch(()=>{})}}}

/* ---------- 8. So'rovlar yo'riqnomasi ---------- */
async function route(path,init){const u=new URL(path,location.href),p=decodeURIComponent(u.pathname.replace(/^.*?(\/api\/|\/p\/)/,'$1')),q=Object.fromEntries(u.searchParams),m=(init&&init.method||'GET').toUpperCase();
 if(p.startsWith('/p/')){const [,,pid,...r]=p.split('/');const b=await DB.get('files',pid+'/'+r.join('/'));return b?new Response(b):ERR('topilmadi',404)}
 switch(p){
  case '/api/settings':if(m==='PUT'){await DB.put('kv','settings',await bodyJSON(init));return J({ok:true})}return J((await DB.get('kv','settings'))||{});
  case '/api/license':if(m==='POST'){const bj=await bodyJSON(init);const k=bj.key||bj.Key||'';const id=await deviceId();const v=verifyKey(k,id);if(!v.ok)return J({ok:false,message:v.message,id});await DB.put('kv','licKey',k.trim().toUpperCase())}return J(await license());
  case '/api/info':return J({version:VERSION,ffmpeg:{status:'ready',encoder:window.VideoEncoder?'webcodecs':'yo\'q'},outDir:isAndroid?'Galereya → Movies/FlowCraft':isDesk?'Videos\\FlowCraft':'Yuklab olinganlar (Downloads)',local:true});
  case '/api/heartbeat':if(isDesk)desk('/__fc/beat').catch(()=>{});return J({ok:true});
  case '/api/session':case '/api/bye':case '/api/diag/event':case '/api/diag/report':case '/api/diag/clear':case '/api/ffmpeg/retry':case '/api/update/apply':return J({ok:true});
  case '/api/reveal':if(isDesk)await desk('/__fc/reveal?path='+encodeURIComponent(q.path||'')).catch(()=>{});return J({ok:true});
  case '/api/diag/summary':return J({ok:true,events:[]});
  case '/api/history':return J([]);
  case '/api/update/check':return J({ok:true,latest:VERSION,update:false});
  case '/api/ai/test':return J({ok:false,message:'Telefonda faqat Gemini kaliti ishlaydi'});
  case '/api/ai/models':return J({ok:false,message:'Telefonda faqat Gemini'});
  case '/api/ai/stream':return ERR('Telefonda faqat Gemini kaliti bilan ishlaydi. Sozlamalarda Gemini kalitini kiriting',400);
  case '/api/align':return J(await align(await bodyJSON(init)));
  case '/api/render/start':{const j=await bodyJSON(init);const id=uid();JOBS[id]={status:'running',progress:0,stage:'Tayyorlanmoqda',encoder:'WebCodecs'};
   try{const P=window.P,T=P&&P.tl;if(T&&window.flCss)j.filterCss=flCss(T.filter);j.sfx=(P&&P.media&&P.media.sfx||[]).map(s=>s.rel)}catch(_){}
   setTimeout(()=>render(id,j),30);return J({ok:true,id})}
  case '/api/render/status':{const s=JOBS[q.id];return s?J({ok:true,...s}):J({ok:false,status:'error',error:'Render topilmadi'})}
  case '/api/render/cancel':{const s=JOBS[q.id];if(s)s.canceled=true;return J({ok:true})}
  case '/api/projects':if(m==='POST'){const pr=await bodyJSON(init);pr.id=uid();await saveProject(pr);return J({id:pr.id})}return J(await listProjects());
 }
 if(p.startsWith('/api/tplimg/')){const id=p.split('/').pop();if(m==='POST'){await DB.put('files','_tpl/'+id,await bodyBlob(init));dropURL('_tpl/'+id);await fileURL('_tpl',id);return J({ok:true})}const b=await DB.get('files','_tpl/'+id);return b?new Response(b):ERR('yo\'q',404)}
 const mm=p.match(/^\/api\/projects\/([^/]+)(\/.*)?$/);if(mm){const pid=mm[1],rest=mm[2]||'';
  if(!rest){if(m==='PUT'){const pr=await bodyJSON(init);pr.id=pid;await saveProject(pr);return J({ok:true})}if(m==='DELETE'){await deleteProject(pid);return J({ok:true})}
   const pr=await DB.get('kv','p:'+pid);if(!pr)return ERR('Loyiha topilmadi',404);await preload(pid);return J(pr)}
  if(rest==='/upload'){const kind=q.kind||'images',nm=String(q.name||'fayl').split(/[\\/]/).pop();
   if(q.clear){for(const k of await DB.keys('files',pid+'/'+kind+'/')){dropURL(k);await DB.del('files',k);const tk=thKey(k);dropURL(tk);await DB.del('files',tk).catch(()=>{})}}
   const blob=await bodyBlob(init);await DB.put('files',pid+'/'+kind+'/'+nm,blob);dropURL(pid+'/'+kind+'/'+nm);await fileURL(pid,kind+'/'+nm);if(kind==='images'&&(IMGX.test(nm)||VIDX.test(nm)))await makeThumb(pid,kind+'/'+nm);
   const r={ok:true,rel:kind+'/'+nm,name:nm};if(kind==='audio'||kind==='music')r.duration=await audioDur(blob);return J(r)}
  if(rest==='/media')return J(await mediaList(pid,q.kind||'images'));
  if(rest==='/delete-media'){const kind=q.kind||'images';for(const k of await DB.keys('files',pid+'/'+kind+'/')){if(q.all||k.endsWith('/'+q.name)){dropURL(k);await DB.del('files',k);const tk=thKey(k);dropURL(tk);await DB.del('files',tk).catch(()=>{})}}return J({ok:true})}}
 return ERR('Bu amal qurilma rejimida yo\'q: '+p,404)}

/* APK ichida (file://) oddiy fayllarni XHR bilan o'qish: fetch() file:// ni qo'llamaydi */
function xhrFile(url){return new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('GET',url);x.responseType='blob';x.onload=()=>res(new Response(x.response,{status:x.status===0?200:x.status}));x.onerror=()=>rej(new TypeError('Fayl o\'qilmadi: '+url));x.send()})}
window.fetch=async function(input,init){const url=typeof input==='string'?input:(input&&input.url)||'';
 if(location.protocol==='file:'&&url&&!/^(https?|blob|data):/i.test(url)&&!/^\/?(api|p)\//.test(url))return xhrFile(new URL(url,location.href).href);
 if(/^(\/|\.\/)?(api|p)\//.test(url.replace(location.origin,''))||url.startsWith(location.origin+'/api/')||url.startsWith(location.origin+'/p/')){
  try{return await route(url,init)}catch(e){return ERR(e.message||String(e),500)}}
 return realFetch(input,init)};

if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
/* 3.x versiyadagi loyihalarni bir marta ko'chirib olish */
async function importLegacy(){if(await DB.get('kv','legacyDone'))return;const L=await desk('/__fc/legacy/list');let n=0;
 for(const it of L){try{const pr=it.project||{};pr.id=it.id;if(await DB.get('kv','p:'+it.id))continue;
  for(const f of it.files||[]){const r=await realFetch('/__fc/legacy/file?t='+deskTok()+'&p='+encodeURIComponent(it.id+'/'+f));if(r.ok)await DB.put('files',it.id+'/'+f,await r.blob())}
  await saveProject(pr);n++}catch(_){}}
 await DB.put('kv','legacyDone',1);if(n)setTimeout(()=>{try{toast(n+' ta eski loyiha ko\'chirildi')}catch(_){}},2500)}
/* Windows oynasida tashqi havolalar odatiy brauzerda ochilsin (dastur ichida yangi oyna emas) */
if(isDesk||isAndroid){const ext=u=>/^https?:\/\//i.test(u)&&!u.startsWith(location.origin);
 /* Android: qobiq https havolani telefonning odatiy brauzerida ochadi, ilova o'z joyida qoladi */
 const openExt=u=>{if(isAndroid){location.href=u;return}desk('/__fc/open?url='+encodeURIComponent(u)).catch(()=>{})};
 document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;const u=a.href;if(ext(u)){e.preventDefault();e.stopPropagation();openExt(u)}},true);
 const wo=window.open;window.open=function(u,...r){if(u&&ext(String(u))){openExt(String(u));return null}return wo.call(window,u,...r)}}
window.FCL={url(pid,rel,th){const k=pid+'/'+rel;if(th){const t=URLS.get(thKey(k));if(t)return t;if(VIDX.test(rel))return ''}return URLS.get(k)||''},
 videoUrl(pid,rel){return URLS.get(pid+'/'+rel)||''},tplUrl(id){return URLS.get('_tpl/'+id)||''},
 async boot(){await DB.open();if(isDesk)await importLegacy().catch(e=>console.warn('eski loyihalar: '+e.message));for(const k of await DB.keys('files','_tpl/')){await fileURL('_tpl',k.slice(5))}},isAndroid,version:VERSION};
})();
