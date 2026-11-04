'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=t=>{t=Math.max(0,t||0);return `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`};
const fmt2=t=>{t=Math.max(0,t||0);return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`};
const pad3=n=>String(n).padStart(3,'0');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wc=t=>(String(t||'').match(/[\p{L}\p{N}'’ʻʼ-]+/gu)||[]).length;
const root=document.documentElement, reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

let TOKEN=(location.hash.match(/t=([0-9a-f]+)/)||[])[1]||'';
try{if(TOKEN)sessionStorage.setItem('fct',TOKEN);else TOKEN=sessionStorage.getItem('fct')||''}catch(_){}
history.replaceState(null,'',location.pathname);
const where=()=>{try{return (S.screen||'')+(S.screen==='s-studio'?' qadam '+S.cur:'')+(P?' · '+P.format:'')}catch(_){return''}};
let DQ=[];function dlog(k,n,o={}){DQ.push({k,n,ms:Math.round(o.ms||0),ok:o.ok!==false,msg:o.msg||'',w:where(),x:o.x,t:Date.now()});if(DQ.length>40)dflush()}
function dflush(beacon){if(!DQ.length)return;const b=JSON.stringify(DQ);DQ=[];try{if(beacon)navigator.sendBeacon('/api/diag/event',new Blob([b],{type:'application/json'}));else fetch('/api/diag/event',{method:'POST',headers:{'X-FC-Token':TOKEN,'Content-Type':'application/json'},body:b}).catch(()=>{})}catch(_){}}
setInterval(()=>dflush(),4000);addEventListener('pagehide',()=>dflush(true));
async function timed(n,fn,x){const t0=performance.now();try{const r=await fn();dlog('ui',n,{ms:performance.now()-t0,ok:r!==false,x});return r}catch(e){dlog('ui',n,{ms:performance.now()-t0,ok:false,msg:e.message,x});throw e}}
addEventListener('error',e=>dlog('js',(e.filename||'').split('/').pop()+':'+e.lineno,{ok:false,msg:e.message+(e.error?.stack?'\n'+e.error.stack.split('\n').slice(0,4).join(' | '):'')}));
addEventListener('unhandledrejection',e=>{const m=e.reason?.message||String(e.reason);if(m!=='To\'xtatildi'&&e.reason?.name!=='AbortError')dlog('js','promise',{ok:false,msg:m+(e.reason?.stack?' | '+e.reason.stack.split('\n').slice(1,4).join(' | '):'')})});
let lastFreeze=0;try{new PerformanceObserver(l=>{for(const en of l.getEntries()){if(en.duration>400&&Date.now()-lastFreeze>4000){lastFreeze=Date.now();dlog('ui','Dastur qotib qoldi',{ms:en.duration,ok:true})}}}).observe({entryTypes:['longtask']})}catch(_){}
const LOST='Dastur bilan aloqa uzildi. Dasturni yopib, yorliq orqali qayta oching.';
async function api(path,{method='GET',body,raw,signal}={}){
const h={'X-FC-Token':TOKEN,'X-FC-Ctx':encodeURIComponent(where())};let b=body;
if(body!==undefined&&!raw&&typeof body!=='string'){h['Content-Type']='application/json';b=JSON.stringify(body)}
let r;try{r=await fetch(path,{method,headers:h,body:b,signal})}catch(e){if(e.name==='AbortError')throw e;throw new Error(LOST)}
if(!r.ok)throw new Error((await r.text())||('HTTP '+r.status));
const ct=r.headers.get('content-type')||'';return ct.includes('json')?r.json():r.text();
}
async function streamND(path,body,onEv,signal){
let r;try{r=await fetch(path,{method:'POST',headers:{'X-FC-Token':TOKEN,'Content-Type':'application/json','X-FC-Ctx':encodeURIComponent(where())},body:JSON.stringify(body),signal})}catch(e){if(e.name==='AbortError')throw e;throw new Error(LOST)}
if(!r.ok)throw new Error(await r.text());
const rd=r.body.getReader(),dec=new TextDecoder();let buf='';
for(;;){const {value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);if(line.trim())onEv(JSON.parse(line))}}
}
async function ai(prompt,o={}){
if(GM.on(o))return GM.text(prompt,o);
let full='',err=null;const ac=new AbortController();let idle=null,timedOut=false;
const arm=()=>{clearTimeout(idle);idle=setTimeout(()=>{timedOut=true;ac.abort()},o.idleMs||90000)};
if(o.signal){if(o.signal.aborted)ac.abort();else o.signal.addEventListener('abort',()=>ac.abort(),{once:true})}
arm();
try{await streamND('/api/ai/stream',{prompt,system:o.system||'',search:!!o.search,temperature:o.temperature||0.9,maxTokens:o.maxTokens||8192,project:P?.id||'',images:o.images||[],provider:o.provider||''},ev=>{
arm();if(ev.t){full+=ev.t;o.onText&&o.onText(ev.t,full)}
if(ev.error)err=ev.error;
},ac.signal)}catch(e){if(timedOut&&!(o.signal&&o.signal.aborted))throw new Error('AI 90 soniya javob bermadi. Internetni tekshirib, qayta urinib ko\'ring.');throw e}finally{clearTimeout(idle)}
if(err)throw new Error(err);
return full;
}

/* ===== Gemini: hamma chaqiruvlar shu yerdan =====
   Kalitlar navbat bilan ishlatiladi. Daqiqalik limitda kutib davom etadi, kunlik limitda keyingi kalitga,
   model yo'q yoki bepul kalitga yopiq bo'lsa keyingi modelga o'tadi. */
const GM={
 base:'https://generativelanguage.googleapis.com/v1beta/models/',
 cool:{},   /* "kalit|model" -> qachongacha kutish (ms) */
 dead:{},   /* "kalit|model" -> bugun ishlamaydi */
 badKey:{}, /* noto'g'ri kalit */
 noModel:{},/* bunday model yo'q */
 rr:0,
 keys(){const k=aiCfg().keys.gemini;return [...new Set((Array.isArray(k)?k:[k]).map(x=>(x||'').trim()).filter(Boolean))]},
 on(o){const a=aiCfg();return (a.provider||'gemini')==='gemini'&&!o.provider&&this.keys().length>0},
 ver(n){const m=n.match(/gemini-(\d+(?:\.\d+)?)/);return m?parseFloat(m[1]):0},
 /* Google'dan mavjud modellar ro'yxatini olib, eng yangilarini tanlash (kuniga bir marta) */
 async discover(force){const a=aiCfg(),d=a.disc;if(!force&&d&&d.day===this.day()&&d.text?.length)return d;const keys=this.keys();
  for(const k of keys){try{const r=await fetch(this.base.replace(/models\/$/,'models')+'?pageSize=1000',{headers:{'x-goog-api-key':k}});if(!r.ok)continue;
   const all=((await r.json()).models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>m.name.replace(/^models\//,''));
   const bad=/image|live|audio|embed|aqa|robotics|computer|native|vision|learnlm|gemma|thinking|exp/;
   const flash=all.filter(n=>/^gemini-/.test(n)&&/flash/.test(n)&&!/lite/.test(n)&&!/tts/.test(n)&&!bad.test(n));
   const lite=all.filter(n=>/^gemini-/.test(n)&&/flash-lite/.test(n)&&!/tts/.test(n)&&!bad.test(n));
   const pro=all.filter(n=>/^gemini-/.test(n)&&/pro/.test(n)&&!/tts/.test(n)&&!bad.test(n));
   const sort=l=>l.sort((x,y)=>this.ver(y)-this.ver(x)||(/preview/.test(x)?1:0)-(/preview/.test(y)?1:0)||x.length-y.length);
   const tts=sort(all.filter(n=>/tts/.test(n))).sort((x,y)=>(/flash/.test(y)?1:0)-(/flash/.test(x)?1:0));
   a.disc={day:this.day(),text:[...sort(flash),...sort(lite),...sort(pro)].slice(0,10),tts:tts.slice(0,4)};saveCfg();return a.disc}catch(_){}}
  return a.disc||{text:[],tts:[]}},
 hint:[],/* Google xatoda tavsiya qilgan modellar */
 models(kind){const a=aiCfg(),pr=a.probe||{},out=[],dc=a.disc||{};
  const add=m=>{if(m&&!out.includes(m)&&!this.noModel[m])out.push(m)};
  if(kind==='tts'){add(CFG.ttsModel);this.hint.filter(m=>/tts/.test(m)).forEach(add);(pr.tts||[]).filter(m=>m.s==='ok'||m.s==='busy').forEach(m=>add(m.id));(dc.tts||[]).forEach(add);['gemini-2.5-flash-preview-tts'].forEach(add)}
  else{add(a.models.gemini);this.hint.filter(m=>!/tts/.test(m)).forEach(add);(dc.text||[]).forEach(add);(pr.text||[]).filter(m=>m.s==='ok'||m.s==='busy').forEach(m=>add(m.id));['gemini-flash-latest','gemini-flash-lite-latest','gemini-2.5-flash','gemini-2.5-flash-lite'].forEach(add)}
  return out},
 day(){const d=new Date();return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()},
 isDead(id){const v=this.dead[id];return v&&v===this.day()},
 why(st,t){/* Google xatosini turga ajratish */let j={};try{j=JSON.parse(t).error||{}}catch(_){}
  const msg=String(j.message||t||''),det=JSON.stringify(j.details||[]);
  const delay=(det.match(/"retryDelay":"(\d+(?:\.\d+)?)s"/)||[])[1];
  if(st===429||j.status==='RESOURCE_EXHAUSTED'){
   if(/limit:\s*0\b|"quotaValue":"0"/.test(msg+det))return{k:'closed',msg};
   if(/PerDay|per day|daily/i.test(det+msg))return{k:'day',msg};
   return{k:'minute',wait:Math.min(65,Math.max(5,+delay||30)),msg}}
  if(st===400&&/API key not valid|API_KEY_INVALID/i.test(msg+det)||st===401||st===403&&/API key|permission|PERMISSION_DENIED/i.test(msg+det))return{k:'key',msg};
  if(st===404||st===400&&/not found|is not supported|unknown name|not available/i.test(msg))return{k:'model',msg};
  if(st===400&&/google_search|grounding|tool/i.test(msg))return{k:'nosearch',msg};
  if(st===400)return{k:'bad',msg};
  if(st>=500)return{k:'server',msg};
  return{k:'other',msg}},
 note(s){const n=$('#gmNote');if(n){n.textContent=s;n.hidden=!s}if(s)toast(s)},
 sleep(ms,signal){return new Promise((res,rej)=>{const t=setTimeout(res,ms);signal&&signal.addEventListener('abort',()=>{clearTimeout(t);rej(new DOMException('aborted','AbortError'))},{once:true})})},
 /* asosiy chaqiruv: body = generateContent tanasi */
 async call(body,{kind='text',signal,stream=false,onText,label=''}={}){
  const keys=this.keys();if(!keys.length)throw new Error('Gemini kaliti kiritilmagan (Sozlamalar → AI xizmati)');
  await this.discover();let models=this.models(kind),last='',fails=0,searchOff=false;
  for(let round=0;round<40;round++){
   if(signal?.aborted)throw new DOMException('aborted','AbortError');
   models=models.filter(m=>!this.noModel[m]);if(!models.length)throw new Error(last||'Ishlaydigan Gemini modeli topilmadi. Sozlamalarda «Ishlaydigan modellarni topish» ni bosing');
   /* ishlatsa bo'ladigan (kalit, model) juftini topish */
   let pick=null,soon=Infinity;const now=Date.now();
   for(const m of models){for(let i=0;i<keys.length;i++){const k=keys[(this.rr+i)%keys.length],id=k+'|'+m;
     if(this.badKey[k]||this.isDead(id))continue;const c=this.cool[id]||0;if(c>now){soon=Math.min(soon,c);continue}pick={k,m};break}if(pick)break}
   if(!pick){
    if(soon<Infinity){const s=Math.ceil((soon-now)/1000);this.note(`Gemini daqiqalik limiti: ${s} soniya kutilyapti, keyin o'zi davom etadi${label?' ('+label+')':''}`);await this.sleep(soon-now+300,signal);this.note('');continue}
    const allBad=keys.every(k=>this.badKey[k]);
    throw new Error(allBad?'Gemini kaliti noto\'g\'ri yoki o\'chirilgan. Sozlamalarda kalitni tekshiring':
     (kind==='tts'?'Bugungi bepul ovoz limiti tugadi':'Bugungi bepul Gemini limiti tugadi')+'. Ertaga tiklanadi. Ovozni ElevenLabs yoki boshqa xizmatda yaratib, faylni yuklashingiz mumkin. Ko\'proq kerak bo\'lsa, Google AI Studio\'da to\'lovni yoqing')}
   this.rr=(keys.indexOf(pick.k)+1)%keys.length;
   const id=pick.k+'|'+pick.m;let b=body;if(searchOff&&b.tools){b=Object.assign({},b);delete b.tools}
   const url=this.base+pick.m+(stream?':streamGenerateContent?alt=sse':':generateContent');
   let r;try{r=await fetch(url,{method:'POST',signal,headers:{'x-goog-api-key':pick.k,'Content-Type':'application/json'},body:JSON.stringify(b)})}
   catch(e){if(e.name==='AbortError')throw e;last='Internet bilan aloqa yo\'q';if(++fails>3)throw new Error(last);await this.sleep(1500*fails,signal);continue}
   if(r.ok){if(!stream){const j=await r.json();return{json:j,model:pick.m}}
    const rd=r.body.getReader(),dec=new TextDecoder();let buf='',full='';
    for(;;){const {value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
     while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line.startsWith('data:'))continue;
      let j;try{j=JSON.parse(line.slice(5))}catch(_){continue}const t=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.thought?'':(p.text||'')).join('');if(t){full+=t;onText&&onText(t,full)}}}
    return{text:full,model:pick.m}}
   const t=await r.text().catch(()=>''),w=this.why(r.status,t);last=w.msg;dlog&&dlog('gemini',kind+' '+pick.m+' '+r.status+' '+w.k,{ok:false,msg:String(w.msg).slice(0,300)});
   if(w.k==='minute'){this.cool[id]=Date.now()+w.wait*1000;continue}
   if(w.k==='day'){this.dead[id]=this.day();continue}
   if(w.k==='closed'){if(body.tools&&!searchOff){searchOff=true;aiCfg().noSearch=true;saveCfg();continue}this.dead[id]=this.day();last='Bu model bepul kalitda yopiq ('+pick.m+')';continue}
   if(w.k==='nosearch'){searchOff=true;aiCfg().noSearch=true;saveCfg();continue}
   if(w.k==='key'){this.badKey[pick.k]=1;continue}
   if(w.k==='model'){this.noModel[pick.m]=1;const s=(String(w.msg).match(/models\/([\w.-]+)\s+for/)||[])[1];if(s&&!this.hint.includes(s)){this.hint.unshift(s);if(aiCfg().models.gemini===pick.m)aiCfg().models.gemini='';if(CFG.ttsModel===pick.m)CFG.ttsModel='';saveCfg()}models=this.models(kind);continue}
   if(w.k==='server'){this.cool[id]=Date.now()+4000*(1+(fails++%3));continue}
   if(w.k==='bad'){if(body.tools&&!searchOff){searchOff=true;continue}throw new Error('Gemini so\'rovni qabul qilmadi: '+String(w.msg).slice(0,200))}
   throw new Error('Gemini xatosi '+r.status+': '+String(w.msg).slice(0,200))}
  throw new Error(last||'Gemini javob bermadi')},
 async img64(rel){const bl=await (await fetch(purl(rel))).blob();const b=new Uint8Array(await bl.arrayBuffer());let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode.apply(null,b.subarray(i,i+32768));return{mimeType:bl.type||'image/png',data:btoa(s)}},
 async text(prompt,o={}){const parts=[];for(const rel of o.images||[]){try{parts.push({inlineData:await this.img64(rel)})}catch(_){}}parts.push({text:prompt});
  const body={contents:[{role:'user',parts}],generationConfig:{temperature:o.temperature??0.9,maxOutputTokens:(o.maxTokens||8192)+4096}};
  if(o.system)body.systemInstruction={parts:[{text:o.system}]};
  if(o.search&&!aiCfg().noSearch)body.tools=[{google_search:{}}];
  /* jim qolsa uzish */const ac=new AbortController();let idle=null;const arm=()=>{clearTimeout(idle);idle=setTimeout(()=>ac.abort(),o.idleMs||120000)};
  if(o.signal){if(o.signal.aborted)ac.abort();else o.signal.addEventListener('abort',()=>ac.abort(),{once:true})}
  arm();try{const r=await this.call(body,{stream:true,signal:ac.signal,onText:(t,f)=>{arm();o.onText&&o.onText(t,f)},label:'matn'});
   if(!r.text.trim())throw new Error('Gemini bo\'sh javob qaytardi. Qayta urinib ko\'ring');return r.text}
  catch(e){if(e.name==='AbortError'&&!(o.signal&&o.signal.aborted))throw new Error('Gemini 2 daqiqa javob bermadi. Qayta urinib ko\'ring');throw e}finally{clearTimeout(idle)}},
 async tts(text,voice,signal){const r=await this.call({contents:[{parts:[{text}]}],generationConfig:{responseModalities:['AUDIO'],temperature:0.2,speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:voice}}}}},{kind:'tts',signal,label:'ovoz'});
  const p=r.json.candidates?.[0]?.content?.parts?.find(x=>x.inlineData);if(!p)throw new Error('Ovoz bo\'sh qaytdi');
  const bin=atob(p.inlineData.data),n=bin.length>>1,pcm=new Int16Array(n);for(let i=0;i<n;i++)pcm[i]=(bin.charCodeAt(i*2+1)<<8)|bin.charCodeAt(i*2);return pcm},
 async json(body,o={}){const r=await this.call(body,o);const t=(r.json.candidates?.[0]?.content?.parts||[]).map(x=>x.thought?'':(x.text||'')).join('');return t}
};
async function aiJSON(prompt,o,ok){let last=null;for(let k=0;k<3;k++){let t='';try{t=await ai(prompt,o)}catch(e){if(o.signal?.aborted)throw e;last=e;continue}const j=jsonFrom(t);if(j&&(!ok||ok(j)))return j;last=new Error('AI javobi to\'liq kelmadi');}throw last||new Error('AI javobi tushunarsiz')}
function jsonFrom(t){t=String(t||'').replace(/```(?:json)?/gi,'');const j0=jsonFrom0(t);if(j0)return j0;
/* cut-off answer: keep the complete objects of an array */const a=t.indexOf('[');if(a>=0){const cut=t.lastIndexOf('}');if(cut>a){try{return JSON.parse(t.slice(a,cut+1)+']')}catch(_){}}}
return null}
function jsonFrom0(t){const a=t.indexOf('{'),b=t.lastIndexOf('}');const a2=t.indexOf('['),b2=t.lastIndexOf(']');
try{if(a>=0&&b>a&&(a2<0||a<a2))return JSON.parse(t.slice(a,b+1))}catch(_){}
try{if(a2>=0&&b2>a2)return JSON.parse(t.slice(a2,b2+1))}catch(_){}
return null}
async function upload(kind,file,{clear,name}={}){
const q=`/api/projects/${P.id}/upload?kind=${kind}&name=${encodeURIComponent(name||file.name)}${clear?'&clear=1':''}`;
const r=await fetch(q,{method:'POST',headers:{'X-FC-Token':TOKEN},body:file});
if(!r.ok)throw new Error(await r.text());return r.json();
}
const purl=(rel,thumb)=>!rel?'':window.FCL?FCL.url(P.id,rel,thumb):`/p/${P.id}/${rel.split('/').map(encodeURIComponent).join('/')}${thumb?'?thumb=1':''}`;

function toast(m,err){if(err)dlog('ui','Ekrandagi xato xabari',{ok:false,msg:String(m)});const t=$('#toast');t.textContent=m;t.classList.toggle('err',!!err);t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),err?5200:2200)}
function modal(title,html,onReady){$('#mTitle').textContent=title;$('#mBody2').innerHTML=html;$('#modal').classList.add('on');onReady&&onReady($('#mBody2'))}
function closeModal(){$('#modal').classList.remove('on')}
$('#mClose').onclick=closeModal;$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
function confirmBox(title,text,okText='Ha'){return new Promise(res=>{modal(title,`<p class="sub" style="font-size:14px">${esc(text)}</p><div class="row"><button class="primary sm" id="cfOk" type="button">${esc(okText)}</button><button class="pill" id="cfNo" type="button">Bekor qilish</button></div>`,b=>{
b.querySelector('#cfOk').onclick=()=>{closeModal();res(true)};b.querySelector('#cfNo').onclick=()=>{closeModal();res(false)}})})}
async function copyText(t){try{await navigator.clipboard.writeText(t);toast('Nusxalandi')}catch(_){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Nusxalandi')}}

let P=null;            // current project
let CFG={};            // settings
let LIC=null, INFO=null;
const S={screen:'',prev:'s-home',cur:1};
const allTpl=()=>[...TPL,...(CFG.userTemplates||[])];
const tplOf=id=>allTpl().find(t=>t.id===id)||(typeof TPL_OLD!=='undefined'&&TPL_OLD.find(t=>t.id===id))||TPL[0];
STY.push({id:'chalk',n:"Bo'r doska",c:'',sw:'#1f3d2b,#e9e9e9',p:'hand-drawn chalk illustration on a dark green chalkboard, white and pastel chalk lines, simple doodle shapes'},
{id:'comic',n:'Komiks',c:'',sw:'#ffcc33,#d33a2c',p:'bold comic book illustration, halftone shading, dynamic composition, saturated colors, thick ink outlines'},
{id:'flat',n:'Flat vektor',c:'',sw:'#3a86ff,#ffbe0b',p:'clean flat vector illustration, geometric shapes, limited color palette, no outlines, modern infographic look'},
{id:'horror2d',n:"Qorong'i 2D",c:'',sw:'#16241a,#7d8f6a',p:'dark 2D cartoon horror illustration, thick black outlines, desaturated greens and grays, eerie shadows'},
{id:'wojak',n:'Wojak',c:'',sw:'#8d8d8d,#e4e4e4',p:'crude MS-paint style wojak meme illustration, flat greys, hand-drawn wobbly outlines, melancholic mood'},
{id:'clay',n:'Plastilin',c:'',sw:'#c8794a,#f2d6a0',p:'claymation stop-motion still, handmade plasticine characters, visible fingerprint texture, warm studio lighting'});
const styleOf=id=>STY.find(s=>s.id===id)||STY[0];
const effStyle=()=>P.style==='custom'?{n:"O'z uslubim",p:(P.styleText||'').trim()||STY[0].p}:styleOf(P.style);
const styleOn=()=>!tplOf(P.tpl).img||!!P.styleOv;

const SIDE=['s-home','s-projects','s-templates','s-settings','s-tpl','s-import'];
function show(id){const bv=document.getElementById('bgv');if(bv&&id!=='s-editor'&&!bv.paused)bv.pause();
if(id!=='s-editor'&&E.playing)togglePlay(false);
/* montaj doim qorong'i: video bilan ishlashda ko'z charchamaydi, ranglar to'g'ri ko'rinadi */{let pref='';try{pref=localStorage.getItem('fc_th')||''}catch(_){}if(!pref&&typeof CFG!=='undefined'&&CFG?.theme==='l')pref='l';document.documentElement.dataset.th=id==='s-editor'?'':pref}
$$('.screen').forEach(s=>s.classList.toggle('show',s.id===id));
$('#bottom').classList.toggle('on',id==='s-studio');
document.body.classList.toggle('side-on',SIDE.includes(id));
$$('.sbtn[data-nav]').forEach(b=>b.classList.toggle('on',b.dataset.nav===id));
if(S.screen&&S.screen!==id&&!['s-studio','s-editor'].includes(S.screen))S.prev=S.screen;
S.screen=id;const el=$('#'+id);if(el&&id!=='s-editor')el.scrollTop=0;
if(id==='s-home')renderHome();if(id==='s-projects')renderProjects();if(id==='s-templates')renderTplAll();if(id==='s-settings')renderSettings();if(id==='s-tpl')renderMyTpls();if(id==='s-import')renderImport();
}
document.addEventListener('click',e=>{
const sc=e.target.closest('[data-screen]');if(sc){show(sc.dataset.screen);return}
const s=e.target.closest('.seg .pill');if(s&&!s.closest('[data-own]')&&!s.dataset.nosel){[...s.parentElement.children].forEach(x=>x.classList.toggle('on',x===s))}
const sw=e.target.closest('.sw');if(sw&&!sw.dataset.own){sw.classList.toggle('on');sw.setAttribute('aria-checked',sw.classList.contains('on'));sw.dispatchEvent(new Event('change'))}
});
$('#helpBtn').onclick=()=>modal('Yordam',`<p class="sub" style="font-size:14px;line-height:1.6">Savol va takliflar uchun Telegram: <b>@osonyoutube_admin</b>.<br>Kalit olish: <b>@flowcraftkalit_bot</b>.<br><br>Tezkor tugmalar (montajda): <span class="kbd">Bo'sh joy</span> ijro, <span class="kbd">←</span> <span class="kbd">→</span> kadrlar, <span class="kbd">S</span> bo'lish, <span class="kbd">Delete</span> o'chirish, <span class="kbd">Ctrl+Z</span> bekor qilish.</p>`);

const splash=$('#splash');
$('#word').innerHTML=[...'FlowCraft'].map((c,i)=>`<span style="animation-delay:${1.05+i*.055}s">${i<4?c:'<b>'+c+'</b>'}</span>`).join('');
let splashDone=false,bootReady=false;
function playSplash(short){root.classList.add('play');if(short){$$('.word span').forEach(s=>s.style.animationDelay='0s')}
const msgs=[[600,'Loyihalar yuklanmoqda'],[1300,'Kalit tekshirilmoqda'],[2100,'Tayyor']];
splashDone=true;maybeEnter()}
$('#skip').onclick=()=>{splashDone=true;maybeEnter()};
function maybeEnter(){if(!splashDone||!bootReady||splash.classList.contains('out'))return;splash.classList.add('out');root.classList.add('app-on');splash.hidden=true;
if(!LIC?.ok)show('s-act');else if(CFG.lastProject&&CFG.reopen){openProject(CFG.lastProject).catch(()=>show('s-home'))}else show('s-home')}

async function boot(){
try{await api('/api/session',{method:'POST'})}catch(e){document.body.innerHTML='<p style="padding:40px;color:#fff;font:16px Inter,Arial">Dasturni FlowCraft yorlig\'i orqali oching.</p>';return}
let seen=false;try{seen=localStorage.getItem('fc_seen')==='1';localStorage.setItem('fc_seen','1')}catch(_){}
playSplash(seen&&CFG.introShort!==false);
const beat=()=>api('/api/heartbeat',{method:'POST'}).catch(()=>{});setInterval(beat,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)beat()});addEventListener('focus',beat);addEventListener('pagehide',()=>{try{navigator.sendBeacon('/api/bye')}catch(_){}});api('/api/heartbeat',{method:'POST'}).catch(()=>{});
if(window.FCL)await FCL.boot().catch(e=>toast('Xotira ochilmadi: '+e.message,1));
[CFG,LIC,INFO]=await Promise.all([api('/api/settings'),api('/api/license'),api('/api/info')]);if(CFG.theme)setTh(CFG.theme==='l');
await loadTPK().catch(()=>{});fillLicense();bootReady=true;maybeEnter();pollFF();
}
async function pollFF(){
try{INFO=await api('/api/info')}catch(_){return setTimeout(pollFF,4000)}
const f=INFO.ffmpeg||{};const b=$('#ffBanner');
if(f.status==='downloading'){b.hidden=false;b.innerHTML=`<div><b>Video dvigateli yuklanmoqda</b><p class="sub">Bir marta, taxminan 90 MB. Bu vaqtda ssenariy ustida ishlashingiz mumkin.</p></div><div class="prog"><i style="width:${Math.round((f.progress||0)*100)}%"></i></div>`;setTimeout(pollFF,1500)}
else if(f.status==='error'||f.status==='missing'){b.hidden=false;b.innerHTML=`<div><b>Video dvigateli tayyor emas</b><p class="sub">${esc(f.message||'')}</p></div><button class="pill sm" type="button" id="ffRetry2">Qayta urinish</button>`;$('#ffRetry2').onclick=async()=>{await api('/api/ffmpeg/retry',{method:'POST'});setTimeout(pollFF,800)}}
else{b.hidden=true;if(!f.encoder)setTimeout(pollFF,4000)}
const ei=$('#encInfo');if(ei)ei.textContent=f.encoder?(f.encoder==='libx264'?'Videokarta topilmadi, protsessorda yig\'iladi.':`${f.gpu} videokartasi topildi, render tez bo'ladi.`):'Videokarta tekshirilmoqda…';
const fi=$('#ffInfo');if(fi)fi.textContent=f.status==='ready'?`Tayyor · ${f.encoder==='libx264'?'protsessor':f.gpu+' ('+f.encoder+')'}`:(f.message||f.status);
}

function fillLicense(){
$('#devId').textContent=LIC.id;$('#cpuId').textContent=LIC.cpu||'—';$('#setId').textContent=LIC.id;
$('#setPlan').className='chip '+(LIC.ok?'ok':'warn');$('#setPlan').textContent=LIC.ok?(LIC.plan+(LIC.expires?' · '+LIC.expires+' gacha':'')):'Faol emas';
$('#licChip').textContent=LIC.ok?'Litsenziya: '+LIC.plan.toLowerCase():'Litsenziya faol emas';
$('#botLink').href='https://t.me/'+LIC.bot+'?start='+encodeURIComponent(LIC.id);
if(LIC.message&&!LIC.ok){$('#keyErr').hidden=false;$('#keyErr').textContent=LIC.message}
$('#verChip').textContent='FlowCraft '+LIC.version;$('#verTxt').textContent=LIC.version;
}
$('#copyId').onclick=()=>copyText(LIC.id);
$('#activate').onclick=async()=>{const k=$('#key').value.trim();if(!k){toast('Avval kalitni kiriting',1);return}
const r=await api('/api/license',{method:'POST',body:{key:k}});
if(!r.ok){$('#keyErr').hidden=false;$('#keyErr').textContent=r.message;return}
LIC=r;fillLicense();toast('Faollashdi · '+r.plan);setTimeout(()=>show('s-home'),400)};

let saveCfgT=null;
function saveCfg(){clearTimeout(saveCfgT);saveCfgT=setTimeout(()=>api('/api/settings',{method:'PUT',body:CFG}).catch(e=>toast(e.message,1)),400)}
const PROV=[['gemini','Gemini','bepul kalit, Google Search'],['openai','ChatGPT','OpenAI kaliti'],['anthropic','Claude','Anthropic kaliti'],['deepseek','DeepSeek','arzon'],['openrouter','OpenRouter','ko\'p model bitta kalitda'],['ollama','Kompyuterda','Ollama, internetsiz']];
const KEYURL={gemini:'https://aistudio.google.com/apikey',openai:'https://platform.openai.com/api-keys',anthropic:'https://console.anthropic.com/settings/keys',deepseek:'https://platform.deepseek.com/api_keys',openrouter:'https://openrouter.ai/keys',ollama:'https://ollama.com/download'};
function aiCfg(){CFG.ai=CFG.ai||{provider:'gemini',keys:{},models:{}};CFG.ai.keys=CFG.ai.keys||{};CFG.ai.models=CFG.ai.models||{};return CFG.ai}
function aiReady(){const a=aiCfg();const p=a.provider||'gemini';if(p==='ollama')return true;const k=a.keys[p];return Array.isArray(k)?k.some(x=>x&&x.trim()):!!(k&&k.trim())}
function renderSettings(){
const a=aiCfg();const cur=a.provider||'gemini';
$('#prov').innerHTML=PROV.map(p=>`<button type="button" class="${p[0]===cur?'on':''}" data-p="${p[0]}">${p[1]}<small>${p[2]}</small></button>`).join('');
const keys=a.keys[cur];const list=cur==='gemini'?(Array.isArray(keys)?keys:(keys?[keys]:[''])):[Array.isArray(keys)?keys[0]||'':keys||''];
$('#provBox').innerHTML=(cur==='ollama'?`<div class="field"><span class="label">Ollama manzili</span><input class="input sm" id="olURL" value="${esc(a.ollamaURL||'http://127.0.0.1:11434/v1')}"></div>`:
`<div class="field"><span class="label">${cur==='gemini'?'Kalitlar · bittasining limiti tugasa keyingisiga o\'tadi':'API kalit'}</span><div id="keyList" style="display:flex;flex-direction:column;gap:8px">${list.map((k,i)=>`<div class="row" style="flex-wrap:nowrap"><input class="input sm secret" data-k="${i}" type="text" autocomplete="off" spellcheck="false" value="${esc(k)}" placeholder="Kalitni shu yerga qo'ying" style="flex:1;min-width:0">${cur==='gemini'&&list.length>1?`<button class="pill xs" type="button" data-kdel="${i}">O'chirish</button>`:''}</div>`).join('')}</div></div>
    <div class="row">${cur==='gemini'?'<button class="pill sm" type="button" id="kAdd">+ Yana kalit</button>':''}<a class="pill sm" href="${KEYURL[cur]}" target="_blank" rel="noopener">Kalit olish</a></div>`)+
`<div class="field"><span class="label">Model</span><div class="row" style="flex-wrap:nowrap"><input class="input sm" id="modelIn" list="modelList" value="${esc(a.models[cur]||'')}" placeholder="${esc({gemini:'Avto: eng yangi Flash',openai:'gpt-5-mini',anthropic:'claude-sonnet-5-5',deepseek:'deepseek-chat',openrouter:'openrouter/auto',ollama:'llama3.1'}[cur])}" style="flex:1;min-width:0"><datalist id="modelList"></datalist><button class="pill sm" type="button" id="mLoad">${cur==='gemini'?'Ishlaydigan modellarni topish':'Ro\'yxatni olish'}</button></div><p class="note">Bo'sh qoldiring: dastur kalitingiz ishlata oladigan eng yaxshi modelni o'zi tanlaydi, band bo'lsa boshqasiga o'tadi.</p></div>
    <div id="mProbe" style="display:flex;flex-direction:column;gap:6px"></div>
    <div class="row"><button class="pill sm on" type="button" id="aiTest">Tekshirish</button><span class="note" id="aiTestRes"></span></div>`;
const persistKeys=()=>{const v=$$('#keyList input').map(x=>x.value.trim());a.keys[cur]=cur==='gemini'?v:(v[0]||'');saveCfg();updAiChip()};
$$('#keyList input').forEach(x=>x.oninput=persistKeys);
$('#kAdd')&&($('#kAdd').onclick=()=>{persistKeys();a.keys.gemini=[...(a.keys.gemini||[]),''];renderSettings()});
$$('[data-kdel]').forEach(b=>b.onclick=()=>{a.keys.gemini.splice(+b.dataset.kdel,1);saveCfg();renderSettings()});
$('#olURL')&&($('#olURL').oninput=e=>{a.ollamaURL=e.target.value;saveCfg()});
$('#modelIn').oninput=e=>{a.models[cur]=e.target.value.trim();saveCfg()};

/* ===== Gemini modellarini haqiqatan sinab ko'rish ===== */
const GEM='https://generativelanguage.googleapis.com/v1beta/';
async function gemProbe(key,model,tts){const body=tts?{contents:[{parts:[{text:'Say: ok'}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Charon'}}}}}:{contents:[{parts:[{text:'ok'}]}],generationConfig:{maxOutputTokens:8,temperature:0}};
const t0=performance.now();try{const r=await fetch(GEM+'models/'+model+':generateContent',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify(body)});
if(r.ok)return{s:'ok',ms:Math.round(performance.now()-t0)};const t=await r.text().catch(()=>'');
if(r.status===429)return/limit:\s*0/.test(t)?{s:'paid'}:{s:'busy'};if(r.status===403)return{s:'key'};return{s:'no'}}catch(e){return{s:'net'}}}
async function gemFind(key,onP){const r=await fetch(GEM+'models?pageSize=200',{headers:{'x-goog-api-key':key}});if(!r.ok)throw new Error(r.status===400||r.status===403?'Kalit noto\'g\'ri yoki ruxsat yo\'q':'Ro\'yxat olinmadi ('+r.status+')');
const all=((await r.json()).models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>m.name.replace(/^models\//,''));
const text=all.filter(n=>/^gemini/.test(n)&&!/tts|image|live|audio|embed|aqa|robotics|computer-use|native/.test(n)).sort().reverse().slice(0,16);
const tts=all.filter(n=>/tts/.test(n)).slice(0,6);const res={text:[],tts:[]};let done=0;const tot=text.length+tts.length;
const run=async(list,tt,out)=>{let i=0;await Promise.all([0,1,2].map(async()=>{while(i<list.length){const n=list[i++];const p=await gemProbe(key,n,tt);out.push({id:n,...p});onP&&onP(++done/tot)}}))};
await run(text,false,res.text);await run(tts,true,res.tts);
const ord=x=>({ok:0,busy:1,paid:2}[x.s]??9);res.text.sort((a,b)=>ord(a)-ord(b)||b.id.localeCompare(a.id));res.tts.sort((a,b)=>ord(a)-ord(b)||b.id.localeCompare(a.id));return res}
$('#mLoad').onclick=cur==='gemini'?async()=>{persistKeys();const k=(a.keys.gemini||[]).find(x=>x&&x.trim());if(!k){toast('Avval kalitni kiriting',1);return}const box=$('#mProbe');box.innerHTML='<span class="spin"></span> Modellar sinab ko\'rilmoqda… <span id="mpP">0%</span>';
try{const r=await gemFind(k.trim(),p=>{$('#mpP').textContent=Math.round(p*100)+'%'});a.probe=r;saveCfg();showProbe()}catch(e){box.innerHTML='';toast(e.message,1)}}:async()=>{persistKeys();await sleep(450);const r=await api('/api/ai/models',{method:'POST',body:{provider:cur}});if(!r.ok){toast(r.message,1);return}$('#modelList').innerHTML=r.models.map(m=>`<option value="${esc(m)}">`).join('');toast(r.models.length+' ta model topildi. Maydonni bosib tanlang')};
function showProbe(){const box=$('#mProbe');if(!box||!a.probe){return}const lab={ok:'Ishlaydi',busy:'Ishlaydi (limit band)',paid:'Faqat pullik kalitda',no:'Ishlamaydi',key:'Ruxsat yo\'q',net:'? Internet'};
const row=(m,tt)=>{const sel=tt?(CFG.ttsModel||'')===m.id:(a.models.gemini||'')===m.id,okk=m.s==='ok'||m.s==='busy';return `<div class="mrow ${sel?'on':''}" ${okk?`data-pm="${m.id}" data-tt="${tt?1:0}"`:''} style="${okk?'':'opacity:.5'}"><div class="grow"><b>${esc(m.id)}</b><small>${lab[m.s]||m.s}${m.ms?' · '+(m.ms/1000).toFixed(1)+' s':''}</small></div>${okk?`<span class="pill xs ${sel?'on':''}">${sel?'Tanlangan':'Tanlash'}</span>`:''}</div>`};
const good=l=>l.filter(m=>m.s==='ok'||m.s==='busy'),paid=l=>l.filter(m=>m.s==='paid');
box.innerHTML=`<span class="label">Matn modellari (ishlaydiganlari)</span><div class="mlist">${good(a.probe.text).map(m=>row(m,0)).join('')||'<p class="note">Ishlaydigan model topilmadi</p>'}${paid(a.probe.text).map(m=>row(m,0)).join('')}</div>
<span class="label" style="margin-top:10px">Ovoz modellari (TTS)</span><div class="mlist">${good(a.probe.tts).map(m=>row(m,1)).join('')||'<p class="note">Ishlaydigan ovoz modeli topilmadi</p>'}${paid(a.probe.tts).map(m=>row(m,1)).join('')}</div>`}
$('#mProbe')&&($('#mProbe').onclick=e=>{const r=e.target.closest('[data-pm]');if(!r)return;if(r.dataset.tt==='1'){CFG.ttsModel=r.dataset.pm;$('#ttsModel')&&($('#ttsModel').value=CFG.ttsModel)}else{a.models.gemini=r.dataset.pm;$('#modelIn').value=r.dataset.pm}saveCfg();showProbe()});
cur==='gemini'&&showProbe();
$('#aiTest').onclick=async()=>{persistKeys();await sleep(450);const out=$('#aiTestRes');out.className='aires';out.innerHTML='<span class="spin"></span> Tekshirilmoqda… (band bo\'lsa boshqa modellar ham sinab ko\'riladi)';
try{if(cur==='gemini'){const t0=performance.now();const r0=await GM.call({contents:[{parts:[{text:'Reply with: ok'}]}],generationConfig:{maxOutputTokens:20,temperature:0}},{label:'tekshiruv'});out.innerHTML=`<span class="ok">Ishlayapti · ${esc(r0.model)} · ${((performance.now()-t0)/1000).toFixed(1)} s</span>`;return}const r=await api('/api/ai/test',{method:'POST',body:{provider:cur}});out.innerHTML=r.ok?`<span class="ok">✓ Ishlayapti · ${esc(r.model||'')} · ${(r.ms/1000).toFixed(1)} s</span>`:`<span class="err">${esc(r.message)}</span>`;
if(r.ok&&r.model&&!a.models[cur])$('#modelIn').placeholder='Avto: '+r.model}catch(e){out.innerHTML=`<span class="err">${esc(e.message)}</span>`}};
setSec(S.sec||'k');
$('#ttsModel').value=CFG.ttsModel||'';$('#outDir').value=CFG.outDir||INFO?.outDir||'';$('#ffDir').value=CFG.ffmpegDir||'';
pollFF();
}
$('#prov').addEventListener('click',e=>{const b=e.target.closest('[data-p]');if(!b)return;aiCfg().provider=b.dataset.p;saveCfg();renderSettings();updAiChip()});
$('#ttsModel').oninput=e=>{CFG.ttsModel=e.target.value.trim();saveCfg()};
$('#outDir').oninput=e=>{CFG.outDir=e.target.value.trim();saveCfg()};
$('#ffDir').oninput=e=>{CFG.ffmpegDir=e.target.value.trim();saveCfg()};
$('#openOut').onclick=()=>api('/api/reveal',{method:'POST'});
$('#ffRetry').onclick=async()=>{await api('/api/ffmpeg/retry',{method:'POST'});setTimeout(pollFF,1500)};
function setSec(k){S.sec=k;$$('#setNav [data-sec]').forEach(x=>x.classList.toggle('on',x.dataset.sec===k));$$('.set-body>[data-sec-b]').forEach(x=>x.classList.toggle('on',x.dataset.secB===k));if(k==='u')renderUpdate();if(k==='d')renderDiag()}
$('#setNav').dataset.own=1;$('#setNav').addEventListener('click',e=>{const b=e.target.closest('[data-sec]');if(b)setSec(b.dataset.sec)});
async function renderUpdate(){$('#updCur').textContent=INFO?.version||LIC?.version||'';const box=$('#updOnline');box.innerHTML='<span class="note"><span class="spin"></span> Tekshirilmoqda…</span>';
let r;try{r=await api('/api/update/check')}catch(e){box.innerHTML=`<span class="note">${esc(e.message)}</span>`;return}
if(!r.online){box.innerHTML='<p class="note">Avtomatik yangilanish hali ulanmagan. Yangi versiya chiqqanda faylini quyidagi tugma orqali o\'rnating.</p>';return}
if(!r.ok){box.innerHTML=`<p class="note">${esc(r.message)}</p><button class="pill sm" type="button" id="updRe">Qayta tekshirish</button>`;$('#updRe').onclick=renderUpdate;return}
if(!r.available){box.innerHTML=`<span class="aires"><span class="ok">Sizda eng so'nggi versiya (${esc(r.current)})</span></span>`;return}
box.innerHTML=`<div class="panel" style="border-color:var(--o3)"><b>Yangi versiya: ${esc(r.latest)}</b>${r.notes?`<p class="sub" style="white-space:pre-line;margin-top:6px">${esc(r.notes)}</p>`:''}<div class="row" style="margin-top:10px"><button class="primary sm" type="button" id="updGo">Yangilash</button></div></div>`;
$('#updGo').onclick=async()=>{const b=$('#updGo');b.disabled=true;b.innerHTML='<span class="spin"></span> Yuklanmoqda…';const x=await api('/api/update/apply',{method:'POST'}).catch(e=>({ok:false,message:e.message}));
if(!x.ok){toast(x.message,1);b.disabled=false;b.textContent='Yangilash';return}updRestarting()}}
const DGN={'ai/stream':'AI matn yozishi','ai/test':'AI kalitni tekshirish','ai/models':'Modellar ro\'yxati',tts:'Ovoz yaratish (so\'rov)','gemini-tts':'Ovoz yaratish',align:'Rasmlarni ovozga moslash','render/start':'Renderni boshlash',thumb:'Kichik rasmlar',license:'Litsenziya',settings:'Sozlamalarni saqlash',projects:'Loyihalar ro\'yxati','project put':'Loyihani saqlash','project get':'Loyihani ochish','ffmpeg-download':'Video dvigatelini yuklash',gemini:'Gemini',openai:'ChatGPT',anthropic:'Claude',deepseek:'DeepSeek',openrouter:'OpenRouter',ollama:'Ollama'};
const dgName=r=>{let n=DGN[r.n]||r.n;if(r.n.startsWith('project/upload'))n='Fayl yuklash ('+(r.n.split(':')[1]||'')+')';else if(r.n.startsWith('project/media'))n='Media ro\'yxati';if(r.k==='ai')n='AI: '+(DGN[r.n]||r.n);if(r.k==='render')n='Render '+r.n;if(r.k==='js')n='Dastur xatosi ('+r.n+')';return n};
const sec=ms=>ms>=60000?fmt(ms/1000):(ms/1000).toFixed(ms<10000?1:0)+' s';
async function renderDiag(){const box=$('#dgBody');box.innerHTML='<span class="note"><span class="spin"></span></span>';dflush();await sleep(300);let d;try{d=await api('/api/diag/summary')}catch(e){box.textContent=e.message;return}
const rows=d.rows||[];const errN=rows.reduce((a,r)=>a+r.errors,0),slowN=rows.filter(r=>r.slow).length;const rd=(d.renders||[]).filter(r=>r.ok&&r.x?.speed).slice(-1)[0];
box.innerHTML=`<div class="dgk"><div class="stat"><div class="v">${d.total}</div><div class="k">amal yozildi</div></div><div class="stat"><div class="v" style="color:${errN?'#ff8a7a':'#5BE39A'}">${errN}</div><div class="k">xato</div></div><div class="stat"><div class="v" style="color:${slowN?'#ffd84a':'#5BE39A'}">${slowN}</div><div class="k">sekin joy</div></div><div class="stat"><div class="v">${rd?rd.x.speed+'×':'—'}</div><div class="k">render tezligi</div></div></div>`+
(rows.length?`<div class="dgtw"><table class="dg"><thead><tr><th>Holat</th><th>Joy</th><th>Soni</th><th>O'rtacha</th><th>Eng uzun</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="st ${r.errors?'err':r.slow?'slow':'ok'}">${r.errors?r.errors+' xato':r.slow?'Sekin':'Yaxshi'}</span></td><td>${esc(dgName(r))}${r.lastErr?`<small>${esc(r.lastErr.slice(0,220))}</small>`:''}</td><td class="n">${r.count}</td><td class="n">${r.avg?sec(r.avg):'—'}</td><td class="n">${r.max?sec(r.max):'—'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Hali hech narsa yozilmadi. Dasturda ishlang, shu yerda natija chiqadi.</div>')+
((d.renders||[]).length?`<span class="label" style="display:block;margin-top:16px">Oxirgi renderlar</span><div class="dgtw" style="margin-top:6px"><table class="dg"><tbody>${d.renders.slice().reverse().map(r=>`<tr><td><span class="st ${r.ok?'ok':'err'}">${r.ok?'Tayyor':'Xato'}</span></td><td>${esc(r.n)} · ${r.x?.clips||0} kadr · ${fmt(r.x?.videoSec||0)} video<small>${esc(r.x?.encoder||'')} · ${r.x?.speed||'?'}× tezlik${r.msg?' · '+esc(r.msg.slice(0,200)):''}</small></td><td class="n">${sec(r.ms)}</td></tr>`).join('')}</tbody></table></div>`:'')}
$('#dgRe').onclick=renderDiag;
$('#dgSave').onclick=async()=>{dflush();await sleep(300);const r=await api('/api/diag/report',{method:'POST'});if(!r.ok){toast(r.message,1);return}toast('Hisobot saqlandi: '+r.path.split(/[\\/]/).pop());api('/api/reveal?path='+encodeURIComponent(r.path),{method:'POST'})};
$('#dgCopy').onclick=async()=>{dflush();await sleep(300);const r=await api('/api/diag/report',{method:'POST'});if(r.ok)copyText(r.text)};
$('#dgClear').onclick=async()=>{if(await confirmBox('Diagnostikani tozalash','Yozilgan barcha natijalar o\'chadi.','Tozalash')){await api('/api/diag/clear',{method:'POST'});renderDiag()}};
function updRestarting(){$('#updMsg').innerHTML='<span class="spin"></span> O\'rnatilmoqda. Dastur yopilib, yangi versiya o\'zi ochiladi…'}
$('#updFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(!await confirmBox('Yangilash',`"${f.name}" o'rnatiladi. Dastur yopilib, qayta ochiladi. Loyihalar saqlanib qoladi.`,'O\'rnatish'))return;
$('#updMsg').innerHTML='<span class="spin"></span> Fayl tayyorlanmoqda…';const r=await fetch('/api/update/file',{method:'POST',headers:{'X-FC-Token':TOKEN},body:f}).then(x=>x.json()).catch(e=>({ok:false,message:e.message}));
if(!r.ok){$('#updMsg').textContent=r.message;toast(r.message,1);return}if(P)await doSave();updRestarting()};
function updAiChip(){const a=aiCfg();const p=PROV.find(x=>x[0]===(a.provider||'gemini'));const ok=aiReady();const c=$('#aiChip');c.className='chip hide-sm '+(ok?'ok':'warn');c.innerHTML=`<i class="dot"></i>${ok?'AI: '+p[1]+(a.models[p[0]]?' · '+esc(a.models[p[0]]):''):'AI kaliti kiritilmagan'}`}

const NEEDL={char:'Personaj',loc:'Joy',stock:'Stok video'};
function tplImgUrl(t){const v=(CFG.tplImg||{})[t.id];if(v&&window.FCL){const u=FCL.tplUrl(t.id);if(u)return u}else if(v)return `/api/tplimg/${encodeURIComponent(t.id)}?v=${v}`;if(window.TPK&&TPK[t.id])return TPK[t.id];const pr=(PROJ||[]).find(p=>p.tpl===t.id&&p.thumb);if(pr&&pr.thumbUrl)return pr.thumbUrl;return pr?`/p/${pr.id}/${pr.thumb.split('/').map(encodeURIComponent).join('/')}?thumb=1`:''}
function tcard(t,i,sel){const iu=tplImgUrl(t);const svg0=TV[t.v]||'';const vis=iu&&svg0?svg0+`<img src="${iu}" alt="" loading="lazy" onerror="this.remove()" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block">`:iu?`<img src="${iu}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">`:TV[t.v]||`<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><rect width="320" height="180" fill="#2a160e"/><text x="160" y="100" text-anchor="middle" font-family="Inter Display,Inter" font-weight="700" font-size="28" fill="#F3C3A6">${esc(t.n).slice(0,18)}</text></svg>`;
return `<button type="button" class="tcard ${sel?'sel':''}" data-tplc="${esc(t.id)}"><div class="tvis">${vis}<span class="tnum">${String(i+1).padStart(2,'0')}</span><span class="tplay">${t.user?'Sizniki':'▶ Namuna · '+t.len}</span><label class="tpimg" title="Namuna rasm qo'yish" onclick="event.stopPropagation()"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><input type="file" accept="image/*" hidden data-tpimg="${esc(t.id)}"></label></div><div class="tmeta"><b>${esc(t.n)}</b><span>${esc(t.d)}</span><div class="tneeds">${(t.need||[]).length?t.need.map(x=>`<span>${NEEDL[x]}</span>`).join(''):'<span>Referens kerak emas</span>'}<span>${t.f==='both'?'Uzun + Shorts':t.f==='long'?'Uzun video':'Shorts'}</span></div></div></button>`}
const addCard=`<button type="button" class="tcard add" data-screen="s-tpl"><span class="plus">+</span>O'z shabloningizni qo'shish<span class="note" style="font-weight:500">4 ta oddiy savol</span></button>`;
document.addEventListener('change',async e=>{const f=e.target.closest('[data-tpimg]');if(!f||!f.files[0])return;const id=f.dataset.tpimg;
try{const r=await fetch('/api/tplimg/'+encodeURIComponent(id),{method:'POST',headers:{'X-FC-Token':TOKEN},body:f.files[0]});if(!r.ok)throw new Error(await r.text());CFG.tplImg=Object.assign({},CFG.tplImg,{[id]:Date.now()});saveCfg();toast('Namuna rasm qo\'yildi');S.screen==='s-home'?renderHome():S.screen==='s-studio'?renderStep1():renderTplAll()}catch(er){toast(er.message,1)}});
function samplePrompts(){return DOC_TPL.map((t,i)=>`${t.n.split(' (')[0]}.png\n${TPL_SAMPLES[t.id]||''}`).join('\n\n')+'\n\nHar rasmni shablon nomi bilan saqlang, keyin «Rasmlarni nomi bo\'yicha qo\'yish» bilan hammasini birdan tanlang.'}
async function renderTplAll(){if(!PROJ?.length)await loadProj().catch(()=>{});const tf=($('#tplFilter .on')||{}).dataset?.tf||'all';$('#tplAll').innerHTML=allTpl().map((t,i)=>tf==='all'||t.f==='both'||t.f===tf?tcard(t,i,false):'').join('')+addCard}
$('#tplFilter').addEventListener('click',()=>setTimeout(renderTplAll));
$('#tplSamples').onclick=()=>copyText(samplePrompts());
$('#tplPut').onclick=()=>$('#tplFiles').click();
$('#tplFiles').onchange=async e=>{const fs=[...e.target.files];e.target.value='';const ok=[],bad=[];
for(const f of fs){const t=bestMatch(f.name,allTpl(),x=>[x.n,x.n.split(' (')[0],x.id]);if(!t){bad.push(f.name);continue}
try{const r=await fetch('/api/tplimg/'+encodeURIComponent(t.id),{method:'POST',headers:{'X-FC-Token':TOKEN},body:f});if(!r.ok)throw new Error(await r.text());CFG.tplImg=Object.assign({},CFG.tplImg,{[t.id]:Date.now()});ok.push(t.n.split(' (')[0])}catch(er){bad.push(f.name+' ('+er.message+')')}}
saveCfg();renderTplAll();toast(ok.length+' ta shablonga rasm qo\'yildi'+(bad.length?'. Mos kelmadi: '+bad.join(', '):''),!ok.length&&!!bad.length)};
document.addEventListener('click',async e=>{const c=e.target.closest('[data-tplc]');if(!c)return;const id=c.dataset.tplc;
if(c.closest('#tpl')){if(!P)return;const t=tplOf(id);applyTpl(P,t);if(t.f==='short')setFormat('short');else if(t.f==='long')setFormat('long');renderStep1();save();return}
await newProject({tpl:id});go(2)});

let PROJ=[];
const stepNames=['','Shablon','Mavzu','Ssenariy','Referenslar','Promptlar','Ovoz va rasmlar','Montaj','Eksport'];
function projCard(p){const st=p.status==='done'?'Tayyor':`${stepNames[p.step||1]}da qolgan`;const ago=timeAgo(p.updated);
return `<div class="proj" role="button" tabindex="0" data-open="${p.id}"><div class="thumb t${1+(p.id.charCodeAt(p.id.length-1)%3)}">${p.thumb?`<img src="${p.thumbUrl||`/p/${p.id}/${p.thumb}?thumb=1`}" alt="" loading="lazy">`:''}<span class="fmt">${p.format==='short'?'9:16':'16:9'}${p.dur?' · '+fmt(p.dur):''}</span></div><div class="meta"><strong>${esc(p.name||'Nomsiz')}</strong><span>${st} · ${ago}</span><div class="steps8">${Array.from({length:8},(_,k)=>`<i class="${k<(p.status==='done'?8:(p.step||1))?'on':''}"></i>`).join('')}</div><div class="row" style="gap:6px;margin-top:6px"><button class="pill xs" type="button" data-pdel="${p.id}">O'chirish</button></div></div></div>`}
function timeAgo(ms){if(!ms)return'';const s=(Date.now()-ms)/1000;if(s<60)return'hozir';if(s<3600)return Math.floor(s/60)+' daqiqa oldin';if(s<86400)return Math.floor(s/3600)+' soat oldin';if(s<172800)return'kecha';return Math.floor(s/86400)+' kun oldin'}
async function loadProj(){try{PROJ=await api('/api/projects')}catch(_){PROJ=[]}}
async function renderHome(){updAiChip();$('#tplHome').innerHTML=allTpl().slice(0,6).map((t,i)=>tcard(t,i,false)).join('');await loadProj();$('#tplHome').innerHTML=allTpl().slice(0,6).map((t,i)=>tcard(t,i,false)).join('');
$('#projHome').innerHTML=PROJ.length?PROJ.slice(0,3).map(projCard).join(''):`<div class="empty" style="grid-column:1/-1">Hali loyiha yo'q. "Noldan boshlash" yoki "Tayyor materiallarim bor" ni bosing.</div>`;pollFF()}
async function renderProjects(){await loadProj();const q=($('#pSearch').value||'').toLowerCase(),f=($('#pFilter .on')||{}).dataset?.pf||'all';
const L=PROJ.filter(p=>(!q||(p.name||'').toLowerCase().includes(q))&&(f==='all'||(f==='done'?p.status==='done':p.status!=='done')));
$('#projAll').innerHTML=L.length?L.map(projCard).join(''):'<div class="empty" style="grid-column:1/-1">Hech narsa topilmadi.</div>'}
$('#pSearch').addEventListener('input',renderProjects);$('#pFilter').addEventListener('click',()=>setTimeout(renderProjects));
document.addEventListener('click',async e=>{
const d=e.target.closest('[data-pdel]');if(d){e.stopPropagation();if(await confirmBox('Loyihani o\'chirish','Loyiha o\'chiriladi. Rasm va ovozlar ham o\'chadi.','O\'chirish')){await api('/api/projects/'+d.dataset.pdel,{method:'DELETE'});S.screen==='s-home'?renderHome():renderProjects()}return}
const o=e.target.closest('[data-open]');if(o)openProject(o.dataset.open)});
$('#newVideo').onclick=async()=>{await newProject({});go(1)};
$('#newVideo2').onclick=async()=>{await newProject({});go(1)};
$('#newImport').onclick=()=>{P=null;show('s-import')};

function blankProject(o={}){return Object.assign({name:'Yangi video',format:'long',tpl:'d_history',style:'d_oversimplified',topic:'',angle:Math.floor(Math.random()*ANG.length),durVal:8,lang:'en',search:true,step:1,status:'run',
plan:[],script:'',frames:[],refs:{chars:[],locs:[]},prompts:[],anim:{},src:'flow',media:{images:[],audio:null,music:null,sfx:[]},align:'smart',sort:'num',tl:null,seo:null,covers:null,export:{quality:'1080',fps:30,enc:'auto'}},o)}
function applyTpl(p,t){p.tpl=t.id;p.styleOv=false;if(t.style)p.style=t.style;if(t.lang)p.lang=t.lang;if(t.search)p.search=true;p.refs=p.refs||{chars:[],locs:[]};if(t.dna?.length&&!(p.refs.chars||[]).length)p.refs.chars=t.dna.map(d=>({name:d.name,desc:d.desc}));if(t.f==='long'&&p.format==='short'){p.format='long';p.durVal=8}}
async function newProject(o){const t=o.tpl?tplOf(o.tpl):null;const p=blankProject(o);if(t){applyTpl(p,t);if(t.f==='short'){p.format='short';p.durVal=45}}
if(p.format==='short'&&!o.durVal)p.durVal=45;
const r=await api('/api/projects',{method:'POST',body:p});P=Object.assign(p,r);CFG.lastProject=P.id;saveCfg();return P}
async function openProject(id){const p=await api('/api/projects/'+id);P=Object.assign(blankProject(),p);P.media=Object.assign({images:[],audio:null,music:null,sfx:[]},P.media||{});CFG.lastProject=id;saveCfg();
go(P.status==='done'?8:Math.max(1,Math.min(8,P.step||1)))}
let saveT=null,saving=false;
function save(now){if(!P)return;clearTimeout(saveT);$('#savedNote').innerHTML='<span class="spin"></span><span class="hide-sm">Saqlanmoqda</span>';$('#edSaved').innerHTML='<span class="spin"></span>';
saveT=setTimeout(doSave,now?0:700)}
async function doSave(){if(!P)return;saving=true;
P.dur=P.tl?.clips?.reduce((a,c)=>a+c.d,0)||P.media?.audio?.duration||0;P.thumb=P.tl?.clips?.[0]?.img||P.media?.images?.[0]?.rel||'';
try{await api('/api/projects/'+P.id,{method:'PUT',body:P});$('#savedNote').innerHTML='<i class="dot ok"></i><span class="hide-sm">Saqlandi</span>';$('#edSaved').innerHTML='<i class="dot ok"></i>Saqlandi'}
catch(e){$('#savedNote').innerHTML='<i class="dot err"></i><span class="hide-sm">Saqlanmadi</span>';toast('Saqlab bo\'lmadi: '+e.message,1)}saving=false}
window.addEventListener('beforeunload',()=>{if(saveT&&P){clearTimeout(saveT);try{fetch('/api/projects/'+P.id,{method:'PUT',keepalive:true,headers:{'X-FC-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify(P)})}catch(_){}}});
$('#projName').addEventListener('input',e=>{if(!P)return;P.name=e.target.value;save()});

/* =====================================================================
STUDIO: steps
===================================================================== */
const STEPS=[
['Shablon','Qanday video qilamiz?','Yo\'nalish ohang va rasm uslubini beradi. Formatni keyin ham almashtirsa bo\'ladi.'],
['Mavzu','Nima haqida?','Istalgan mavzuni yozing. Reja shu mavzuning o\'zidan tuziladi.'],
['Ssenariy','Ssenariy','Bo\'limma-bo\'lim yoziladi. Xohlagan payt to\'xtatib, tahrirlab davom ettirasiz.'],
['Referenslar','Kim va qayerda?',''],
['Promptlar','Rasm promptlari','Har kadr o\'z gapidan yoziladi. Raqamlar bloklar bo\'ylab davom etadi.'],
['Ovoz va rasmlar','Ovoz va rasmlar','Ovoz yarating yoki yuklang, rasmlarni tanlang. Dastur hammasini tekshiradi.'],
['Montaj','Montaj',''],
['Eksport','Saqlash','Render, muqova va YouTube uchun matnlar.']
];
const needsRef=()=>(tplOf(P.tpl).need||[]).length>0;
function rail(){let h='';STEPS.forEach((s,i)=>{const n=i+1;const cls=(n<S.cur?'done':n===S.cur?'now':'')+(n>firstOpen()?' lockd':'');const opt=n===4&&!needsRef()&&n!==S.cur?'opt':'';
h+=`<button type="button" class="ri ${cls} ${opt}" data-go="${n}" aria-label="${n}. ${s[0]}" ${n===S.cur?'aria-current="step"':''}><b class="n">${n}</b><span>${s[0]}</span></button>`});$('#rail').innerHTML=h}
function stepIssue(k){if(!P)return'';
if(k===2&&!(P.topic||'').trim())return'2-qadam: avval mavzuni yozing';
if(k===3&&wc(stripHeads(P.script||''))<30)return'3-qadam: avval ssenariyni yozing';
if(k===5){const n=(P.frames||[]).length||0,have=(P.prompts||[]).filter((x,i)=>i<n&&x).length;if(!n||have<n)return`5-qadam: ${have} / ${n||'?'} prompt tayyor. Avval hamma promptlarni yozing`}
if(k===6){const m=P.media||{};if(!m.audio)return'6-qadam: avval ovoz yarating yoki yuklang';if(!(m.images||[]).length)return'6-qadam: avval rasmlarni qo\'shing'}return''}
function firstOpen(){for(let k=1;k<=6;k++)if(stepIssue(k))return k;return 7}
function go(n,force){
if(!P)return;if(!force&&n>S.cur){for(let k=S.cur;k<n&&k<=6;k++){const m=stepIssue(k);if(m){toast(m,1);const r=$('#rail');r.classList.remove('shake');void r.offsetWidth;r.classList.add('shake');return}}}S.cur=Math.max(1,Math.min(8,n));if(S.cur>(P.step||1)||S.cur<8)P.step=S.cur;
if(S.cur===7){if(!P.tl?.clips?.length||P.tl.stale||P.tl.sig!==tlSig()){S.cur=6;if(S.screen!=='s-studio'||!$('.pane.on[data-p="6"]'))go(6);buildTimelineIfNeeded().then(ok=>{if(ok&&P.tl?.clips?.length){S.cur=7;P.step=Math.max(P.step||1,7);save();openEditor()}});return}save();openEditor();return}
if(S.screen!=='s-studio')show('s-studio');rail();
$$('.pane').forEach(p=>p.classList.toggle('on',+p.dataset.p===S.cur));
const st=STEPS[S.cur-1];$('#stEye').textContent=String(S.cur).padStart(2,'0')+' / 08 · '+st[0];$('#stTitle').textContent=st[1];
$('#stHint').textContent=S.cur===4?refHint():st[2];
$('#back').style.visibility=S.cur===1?'hidden':'visible';
$('#nextTxt').textContent=S.cur===8?'Bosh sahifa':S.cur===6?'Montajga o\'tish':'Keyingisi';
$('#stAside').innerHTML='';$('#projName').value=P.name;$('#fmtChip').textContent=P.format==='short'?'9:16':'16:9';
$('#s-studio').scrollTop=0;
({1:renderStep1,2:renderStep2,3:renderStep3,4:renderStep4,5:renderStep5,6:renderStep6,8:renderStep8})[S.cur]?.();
save();
}
$('#rail').addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)go(+b.dataset.go)});
$('#next').onclick=async()=>{if(S.cur===8){show('s-home');return}if(S.cur===6){await buildTimelineIfNeeded()&&go(7);return}go(S.cur+1)};
$('#back').onclick=()=>go(S.cur-1);

function setFormat(f){P.format=f;$$('#fmt .pill').forEach(x=>x.classList.toggle('on',x.dataset.f===f));$('#fmtChip').textContent=f==='short'?'9:16':'16:9';
const D=DUR[f];if(!D.v.includes(P.durVal)&&(f==='short'?P.durVal>120:P.durVal<1||P.durVal>60))P.durVal=D.d;if(f==='short'&&P.durVal>120)P.durVal=45;if(f==='long'&&P.durVal>60)P.durVal=8}
function renderStep1(){$$('#fmt .pill').forEach(x=>x.classList.toggle('on',x.dataset.f===P.format));
$('#tpl').innerHTML=allTpl().map((t,i)=>tcard(t,i,t.id===P.tpl)).join('')+addCard;
renderStyles();rail()}
const STY_IMG={oversimplified:'d_history',stickman:'d_apoc',watercolor:'d_agarsen','3d':'d_medical'};
function stImg(s){const own=(CFG.styImg||{})[s.id];if(own)return own;if(window.TPK&&TPK['sty_'+s.id])return TPK['sty_'+s.id];const id=s.tpl||STY_IMG[s.id];return id?tplImgUrl({id}):''}
/* nom bo'yicha moslash: "Kino realizm.png" -> cinematic */
const normNm=s=>String(s||'').toLowerCase().replace(/\.[a-z0-9]+$/,'').replace(/[’'`ʻʼ‘]/g,'').replace(/[^a-z0-9а-яё]+/g,' ').trim();
function bestMatch(fname,items,key){const f=normNm(fname),fw=new Set(f.split(' ').filter(w=>w.length>2));let best=null,bs=0;
for(const it of items){let sc=0;for(const k of key(it).map(normNm).filter(Boolean)){const s=k===f?100:k.split(' ').filter(w=>w.length>2&&fw.has(w)).length*10;if(s>sc)sc=s}if(sc>bs){bs=sc;best=it}}return bs>=10?best:null}
function smallJpeg(file,w=320){return new Promise((res,rej)=>{const u=URL.createObjectURL(file),im=new Image();im.onload=()=>{const k=Math.min(1,w/im.width),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);res(c.toDataURL('image/jpeg',.82))};im.onerror=()=>rej(new Error('Rasm o\'qilmadi: '+file.name));im.src=u})}
async function putStyleImages(files){const gen=STY.filter(s=>!s.tpl);let ok=[],bad=[];CFG.styImg=Object.assign({},CFG.styImg);
for(const f of files){const s=bestMatch(f.name,gen,x=>[x.n,x.id]);if(!s){bad.push(f.name);continue}try{CFG.styImg[s.id]=await smallJpeg(f);ok.push(s.n)}catch(e){bad.push(f.name)}}
saveCfg();renderStyles();toast(ok.length+' ta uslubga rasm qo\'yildi'+(bad.length?'. Mos kelmadi: '+bad.join(', '):''),!!bad.length&&!ok.length)}
function stylePromptList(){const subj='an old lighthouse keeper with a grey beard standing on a rocky shore at sunset, holding a lantern, his small dog beside him, lighthouse in the background';
return STY.filter(s=>!s.tpl).map(s=>`${s.n}.png\n${s.p}. ${subj}. 16:9, no text, no watermark`).join('\n\n')}

function renderStyles(){const _t=tplOf(P.tpl),_on=styleOn();if(!$('#styTools')){$('#styles').insertAdjacentHTML('beforebegin','<div class="row" id="styTools" style="margin-top:10px"><button class="pill sm" type="button" id="styPr">Uslub rasmlari uchun Flow promptlari</button><button class="pill sm" type="button" id="styPut">Uslub rasmlarini qo\'yish</button><input type="file" accept="image/*" multiple hidden id="styFiles"></div>');$('#styPr').onclick=()=>{copyText(stylePromptList());toast('Promptlar nusxalandi. Flow\'da yarating va har rasmni uslub nomi bilan saqlang')};$('#styPut').onclick=()=>$('#styFiles').click();$('#styFiles').onchange=e=>{const f=[...e.target.files];e.target.value='';if(f.length)putStyleImages(f)}}
$('#styles').innerHTML=(_t.img?`<button type="button" class="sty ${_on?'':'on'}" data-st="__tpl"><span class="swc img" style="background:${tplImgUrl(_t)?`url('${tplImgUrl(_t)}') center/cover`:'linear-gradient(160deg,#F5C97A,#B8743A)'}"></span>Shablon uslubi</button>`:'')
+STY.map(s=>`<button type="button" class="sty ${_on&&s.id===P.style?'on':''}" data-st="${s.id}">${(()=>{const u=stImg(s);return u?`<span class="swc img" style="background:url('${u}') center/cover"></span>`:`<span class="swc img ${s.c||''}" ${s.sw?`style="background:linear-gradient(160deg,${s.sw})"`:''}></span>`})()}${s.tpl?s.n+' uslubi':s.n}</button>`).join('')
+`<button type="button" class="sty ${_on&&P.style==='custom'?'on':''}" data-st="custom"><span class="swc" style="background:repeating-linear-gradient(45deg,#555,#555 4px,#888 4px,#888 8px)"></span>O'z uslubim</button>`
+(_on&&P.style==='custom'?`<div style="grid-column:1/-1"><textarea id="styleTxt" class="input" rows="2" placeholder="Rasm uslubini inglizcha yozing. Masalan: soft pastel watercolor, hand-drawn thin outlines, warm light" style="width:100%">${esc(P.styleText||'')}</textarea></div>`:'')
+tplInfo()}
function tplInfo(){const t=tplOf(P.tpl);if(!t.img)return'';return `<div class="tplinfo" style="grid-column:1/-1"><span><b>Namuna kanal:</b> ${esc(t.channel||'')}</span><span><b>Ssenariy tili:</b> ${t.lang==='uz'?'o\'zbek':'ingliz'} · ${t.wpm} so\'z/daqiqa · <b>Rasm stili:</b> ${styleOn()?esc(effStyle().n)+' (siz tanladingiz)':'shablon promptlaridan ('+esc(styleOf(t.style).n)+')'}</span><span><b>Mavzu qolipi:</b> ${esc(t.topic?.pattern||'')}</span></div>`}
$('#styles').addEventListener('click',e=>{const b=e.target.closest('[data-st]');if(!b)return;if(b.dataset.st==='__tpl'){P.styleOv=false;P.style=tplOf(P.tpl).style||P.style}else{P.style=b.dataset.st;P.styleOv=true}renderStyles();save()});
$('#styles').addEventListener('input',e=>{if(e.target.id==='styleTxt'){P.styleText=e.target.value;save()}});
$('#fmt').dataset.own=1;$('#fmt').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;setFormat(b.dataset.f);save()});

const DUR={long:{v:[1,3,5,8,10,15,20,30],d:8},short:{v:[15,20,25,30,35,45,60,90,120],d:45}};
const TONES=[["samimiy", "Samimiy, do'stona suhbat"], ["kulguli", "Kulguli, yengil hazil bilan"], ["jiddiy", "Jiddiy va ishonchli"], ["dramatik", "Dramatik, hayajonli"], ["ilmiy", "Ilmiy va tahliliy"], ["motiv", "Motivatsion, ruhlantiruvchi"], ["sirli", "Sirli, tarang"], ["hujjatli", "Hujjatli, betaraf"], ["kinoyali", "Kinoyali, zehnli"], ["hikoya", "Hikoyachi, sekin va iliq"]];
const LANGS=[["uz", "O'zbek (lotin)"], ["uzc", "Ўзбекча (kirill)"], ["ru", "Русский"], ["en", "English"], ["ar", "العربية"], ["tr", "Türkçe"], ["kk", "Қазақша"], ["ky", "Кыргызча"], ["tg", "Тоҷикӣ"], ["tk", "Türkmençe"], ["az", "Azərbaycanca"], ["fa", "فارسی"], ["hi", "हिन्दी"], ["ur", "اردو"], ["zh", "中文"], ["ja", "日本語"], ["ko", "한국어"], ["es", "Español"], ["pt", "Português"], ["fr", "Français"], ["de", "Deutsch"], ["it", "Italiano"], ["pl", "Polski"], ["uk", "Українська"], ["id", "Bahasa Indonesia"], ["vi", "Tiếng Việt"], ["th", "ไทย"], ["nl", "Nederlands"], ["sv", "Svenska"], ["ro", "Română"], ["el", "Ελληνικά"], ["he", "עברית"]];
const LANGN={"uz": "o'zbek tilida, lotin yozuvida", "uzc": "o'zbek tilida, kirill yozuvida", "ru": "на русском языке", "en": "in English", "ar": "باللغة العربية", "tr": "Türkçe olarak", "kk": "қазақ тілінде", "ky": "кыргыз тилинде", "tg": "бо забони тоҷикӣ", "tk": "türkmen dilinde", "az": "Azərbaycan dilində", "fa": "به زبان فارسی", "hi": "हिन्दी में", "ur": "اردو میں", "zh": "用中文", "ja": "日本語で", "ko": "한국어로", "es": "en español", "pt": "em português", "fr": "en français", "de": "auf Deutsch", "it": "in italiano", "pl": "po polsku", "uk": "українською мовою", "id": "dalam bahasa Indonesia", "vi": "bằng tiếng Việt", "th": "ภาษาไทย", "nl": "in het Nederlands", "sv": "på svenska", "ro": "în limba română", "el": "στα ελληνικά", "he": "בעברית"};
const secs=()=>P.format==='long'?P.durVal*60:P.durVal;
const LWPM={"uz": 128, "uzc": 128, "ru": 130, "en": 150, "ar": 130, "tr": 135, "kk": 125, "ky": 125, "tg": 125, "tk": 125, "az": 130, "fa": 130, "hi": 130, "ur": 130, "zh": 230, "ja": 300, "ko": 220, "es": 150, "pt": 150, "fr": 150, "de": 140, "it": 150, "pl": 135, "uk": 130, "id": 140, "vi": 150, "th": 180, "nl": 140, "sv": 140, "ro": 140, "el": 130, "he": 130};
function toneUI(){$$('#tones [data-tn]').forEach(b=>b.classList.toggle('on',b.dataset.tn===(P.tone||'')))}
const wpmNow=()=>{const t=tplOf(P.tpl);return t.wpm&&P.lang===t.lang?t.wpm:(LWPM[P.lang]||130)};
const targetWords=()=>Math.round(secs()/60*wpmNow()/10)*10;
const wordsPerFrame=()=>P.format==='long'?(tplOf(P.tpl).fw||9):7;
function renderStep2(){ytRender();
$('#topic').value=P.topic||'';const D=DUR[P.format];$('#durUnit').textContent=P.format==='long'?'daqiqa':'soniya';
$('#durLabel').textContent=P.format==='long'?'Davomiylik · uzun video':'Davomiylik · Shorts, 2 daqiqagacha';
$('#dur').dataset.own=1;$('#dur').innerHTML=D.v.map(v=>`<button class="pill ${v===P.durVal?'on':''}" type="button" data-v="${v}">${P.format==='long'?v+' daq':v+' s'}</button>`).join('');
$('#durCustom').value=D.v.includes(P.durVal)?'':P.durVal;
$$('#lang .pill').forEach(x=>x.classList.toggle('on',x.dataset.l===P.lang));langBtnUpd();toneUI();
$('#useSearch').classList.toggle('on',P.search!==false);
est();renderAngles();renderPlan();renderStyles()}
function est(){const fr=Math.max(3,Math.round(targetWords()/wordsPerFrame()));
$('#est').innerHTML=`<b class="num" style="font-size:16px;color:var(--peach)">${P.format==='long'?P.durVal+' daqiqa':P.durVal+' soniya'}</b> uchun taxminan ${targetWords().toLocaleString('ru-RU')} so'z va ${fr} ta kadr kerak. So'z kam chiqsa, dastur o'sha bo'limni o'zi to'ldiradi.`}
$('#dur').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;P.durVal=+b.dataset.v;renderStep2();save()});
$('#durCustom').addEventListener('input',e=>{let v=parseInt(e.target.value);if(!v)return;const max=P.format==='short'?120:60;if(v>max){v=max;e.target.value=max;toast(P.format==='short'?'Shorts 2 daqiqadan oshmaydi':'Eng ko\'pi 60 daqiqa')}P.durVal=v;$$('#dur .pill').forEach(x=>x.classList.toggle('on',+x.dataset.v===v));est();save()});
$('#topic').addEventListener('input',e=>{P.topic=e.target.value;if(!P.name||P.name==='Yangi video'||P._autoName){P.name=P.topic.slice(0,70)||'Yangi video';P._autoName=true;$('#projName').value=P.name}save()});
$('#tones').innerHTML=TONES.map(t=>`<button class="pill sm" type="button" data-tn="${t[0]}" title="${t[1]}">${t[1].split(',')[0]}</button>`).join('');
$('#tones').addEventListener('click',e=>{const b=e.target.closest('[data-tn]');if(!b)return;P.tone=P.tone===b.dataset.tn?'':b.dataset.tn;toneUI();save()});
const langName=c=>(LANGS.find(x=>x[0]===c)||LANGS[0])[1];
function langBtnUpd(){const b=$('#langBtn');if(b)b.textContent='Til: '+langName(P.lang||'uz')+'  ▾'}
$('#langBtn').onclick=()=>modal('Ssenariy tilini tanlang',`<input class="input sm" id="lgQ" placeholder="Qidirish…" aria-label="Til qidirish" style="margin-bottom:10px"><div class="mlist" id="lgList">${LANGS.map(l=>`<button type="button" class="mi ${l[0]===P.lang?'on':''}" data-lg="${l[0]}"><span class="grow"><b>${l[1]}</b></span></button>`).join('')}</div>`,b=>{
$('#lgQ',b).oninput=e=>{const q=e.target.value.trim().toLowerCase();$$('#lgList [data-lg]',b).forEach(x=>x.hidden=q&&!x.textContent.toLowerCase().includes(q)&&!x.dataset.lg.includes(q))};
b.onclick=e=>{const x=e.target.closest('[data-lg]');if(!x)return;P.lang=x.dataset.lg;$$('#lang .pill').forEach(y=>y.classList.toggle('on',y.dataset.l===P.lang));langBtnUpd();est();save();closeModal()}});
$('#lang').dataset.own=1;$('#lang').addEventListener('click',e=>{const b=e.target.closest('[data-l]');if(!b)return;P.lang=b.dataset.l;$$('#lang .pill').forEach(x=>x.classList.toggle('on',x===b));est();save()});
$('#useSearch').addEventListener('change',()=>{P.search=$('#useSearch').classList.contains('on');save()});
$('#ideasBtn').onclick=async()=>{
const t=tplOf(P.tpl);
if(t.topic){const show=L=>{L=L.map(x=>({...x,t:String(x.t||'').replace(/\s*\(\d[\d.,]*[KM+]*\+?\)\s*$/i,'').trim()}));$('#ideas').innerHTML=`<div class="ideas" style="display:flex;flex-direction:column;gap:8px;width:100%">${L.map(x=>`<button type="button" class="idea" data-title="${esc(x.t)}"><span class="tg">${esc(x.c?'Klon: '+x.c:'Namuna')}</span><b>${esc(x.t)}</b>${x.i?`<small>${esc(x.i)}</small>`:''}</button>`).join('')}</div>`};
if(!aiReady()){show(t.topic.hits.map(h=>({t:h,c:'',i:''})));toast('AI kaliti yo\'q: namuna kanalning xit sarlavhalari ko\'rsatildi');return}
$('#ideas').innerHTML='<span class="spin"></span> Mavzular tanlanmoqda…';
let hist=[];try{hist=(await api('/api/history')).map(h=>h.topic).filter(Boolean).slice(-30)}catch(_){}
try{const arr=await aiJSON(`Yo'nalish: "${t.n}" (namuna kanal: ${t.channel}).
QAT'IY MAVZU QULFI: faqat shu yo'nalishdan, boshqa sohadan mavzu berma.
Sarlavha qolipi: ${t.topic.pattern}
Namuna kanalning haqiqiy xit videolari: ${t.topic.hits.join(' | ')}
${t.topic.areas?'Mavzu doirasi: '+t.topic.areas:''}
${P.topic?`Foydalanuvchi yo'nalishi: "${P.topic}" — shunga yaqin bo'lsin.`:''}
${hist.length?'Avval qilingan mavzular (takrorlama): '+hist.join(' | '):''}
10 ta eng kuchli, viral mavzu ber. Har biri: "t" — sarlavha (${t.lang==='uz'?"o'zbek tilida":'ingliz tilida'}, aynan qolip shaklida), "c" — qaysi xit video qolipidan klonlangani, "i" — o'zbekcha 1 jumlalik intriga (videoda nima ochib beriladi).
Faqat JSON massiv, boshqa hech narsa yozma: [{"t":"","c":"","i":""}]`,{temperature:1.05,maxTokens:8000,search:aiCfg().provider==='gemini'},a=>Array.isArray(a)&&a.length>=3&&a.every(x=>x&&x.t));
show(arr.slice(0,10));return}catch(e){toast(e.message,1);show(t.topic.hits.map(h=>({t:h,c:'',i:''})))}return}
if(aiReady()){$('#ideas').innerHTML='<span class="spin"></span>';
try{const r=await ai(`"${t.n}" yo'nalishidagi YouTube video uchun 6 ta qiziqarli mavzu taklif qil. ${P.topic?`Foydalanuvchi yozgan mavzuga yaqin bo'lsin: "${P.topic}".`:''} Har biri boshqacha bo'lsin, bir xil qolip ishlatma. Javob ${LANGN[P.lang]||LANGN.uz}. Faqat JSON massiv qaytar: ["...","..."]`,{temperature:1.1,maxTokens:800});
const arr=jsonFrom(r);if(Array.isArray(arr)&&arr.length){$('#ideas').innerHTML=arr.slice(0,6).map(x=>`<button type="button" class="pill sm">${esc(x)}</button>`).join('');return}}catch(e){toast(e.message,1)}}
$('#ideas').innerHTML=[...IDEA_POOL].sort(()=>Math.random()-.5).slice(0,5).map(t=>`<button type="button" class="pill sm">${esc(t)}</button>`).join('')};
$('#ideas').addEventListener('click',e=>{const d=e.target.closest('[data-title]');const b=d||e.target.closest('.pill');if(b){$('#topic').value=d?d.dataset.title:b.textContent;$('#topic').dispatchEvent(new Event('input'));if(d){$$('#ideas .idea').forEach(x=>x.classList.toggle('done',x===d))}}});
function renderAngles(){$('#angles').dataset.own=1;$('#angles').innerHTML=ANG.map((a,i)=>`<button class="pill ${i===P.angle?'on':''}" type="button" data-ang="${i}">${a}</button>`).join('')}
$('#angles').addEventListener('click',e=>{const b=e.target.closest('[data-ang]');if(!b)return;P.angle=+b.dataset.ang;renderAngles();save()});
function renderPlan(){const t=tplOf(P.tpl);$('#planTpl').textContent=t.n+' · '+t.tone;
$('#plan').innerHTML=(P.plan||[]).length?P.plan.map((p,i)=>`<div><span class="num">${String(i+1).padStart(2,'0')}</span><span contenteditable="true" data-pi="${i}" spellcheck="false">${esc(p)}</span></div>`).join(''):`<p class="note" style="margin-top:6px">${aiReady()?'"Reja tuzish" ni bosing. Yoqmasa "Boshqa variant" chiqadi.':'AI kaliti kiritilmagan. Sozlamalarda kalit qo\'shing yoki rejasiz to\'g\'ridan-to\'g\'ri ssenariy qadamiga o\'ting.'}</p>`;
$('#planBtn').textContent=(P.plan||[]).length?'Boshqa variant':'Reja tuzish'}
$('#plan').addEventListener('input',e=>{const s=e.target.closest('[data-pi]');if(!s)return;P.plan[+s.dataset.pi]=s.textContent.trim();save()});
function toneLine(){const t=TONES.find(x=>x[0]===P.tone);return t?`OHANG (foydalanuvchi tanlagan, shablon ohangidan ustun): ${t[1]}. Butun ssenariy shu ohangda bo'lsin.\n`:''}
function sysBase(){return sysBase0()+ytBrief()}
function sysBase0(){const t=tplOf(P.tpl);if(t.img&&t.role)return `${t.role}
Yo'nalish: "${t.n}". Ohang: ${t.tone}. (Uslub ${t.channel||''} kanaliga o'xshash, lekin bu BOSHQA kanal: namuna kanal nomini matnda hech qachon tilga olma.)
${t.rules}
${COMMON_SCRIPT}
Yuqoridagi qoidalar faqat OHANG, uslub va xavfsizlik uchun. Hikoya tuzilishini (kirish, bo'limlar soni va tartibi, burilishlar, yakun) shablondan nusxalama: uni mavzuning o'zi belgilasin. Har mavzu uchun YANGI va noyob qolip tuz, hook va yakunni har safar boshqacha qur, mavzuga to'g'ri kelmaydigan shablon elementlarini tashla. Oldingi videolarni takrorlama.
${toneLine()}Ssenariy tili: ${LANGN[P.lang]||LANGN.en}. Boshqa tilni aralashtirma. Faqat ovozda o'qiladigan matnni yoz.`;
return `Sen tajribali YouTube ssenariy muallifisan. Yo'nalish: "${t.n}". Ohang: ${t.tone}.
QOIDALAR (shablon): ${t.rules||t.system||''}
UMUMIY: Hikoya tuzilishini mavzuning o'ziga qarab tanla, hamma videoga bir xil qolip ishlatma. Faqat tekshirilgan faktlar: ishonchsiz bo'lsa, o'ylab topma. Matn ovoz chiqarib o'qish uchun: qisqa, aniq gaplar, sahna ko'rsatmalari, emoji va sarlavhasiz. ${toneLine()}Tilni aralashtirma: ${LANGN[P.lang]||LANGN.uz}.`}

/* YouTube videodan ilhom */
const ytId=u=>{const m=String(u||'').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);return m?m[1]:''};
function ytBrief(){const r=P?.yt;if(!r?.brief)return'';const b=r.brief;
return `\n\nILHOM MANBASI (foydalanuvchi tanlagan video, faqat usul uchun): "${b.title||''}".
Undan ol: hook usuli (${b.hook||''}); tuzilish (${(b.structure||[]).map(s=>s.part+(s.share?' ~'+s.share:'')).join(' → ')}); sur'at (${b.pacing||''}); ohang (${b.tone||''}); tomoshabinni ushlab turish usullari (${(b.retention||[]).join('; ')}).
Nusxa olma: gaplar, iboralar, sarlavha, faktlar ketma-ketligi va misollar butunlay o'zingniki bo'lsin. Quyidagilarni ishlatma: ${(b.avoid||[]).join('; ')}. Mavzu foydalanuvchiniki, video faqat qanday hikoya qilishni ko'rsatadi.`}
function ytRender(){const o=$('#ytOut');if(!o)return;const r=P?.yt;$('#ytUrl').value=r?.url||$('#ytUrl').value||'';$('#ytOff').hidden=!r?.brief;
if(!r?.brief){o.innerHTML='';return}const b=r.brief;
o.innerHTML=`<div class="ytb"><div class="ytb-h"><img src="https://i.ytimg.com/vi/${ytId(r.url)}/mqdefault.jpg" alt="" onerror="this.style.visibility='hidden'"><div><b>${esc(b.title||'Video')}</b><small>${esc(b.why||'')}</small></div></div>
<dl><dt>Hook</dt><dd>${esc(b.hook||'')}</dd><dt>Tuzilish</dt><dd>${(b.structure||[]).map(s=>`<span class="ytag">${esc(s.part)}${s.share?' · '+esc(s.share):''}</span>`).join(' ')}</dd><dt>Sur'at va ohang</dt><dd>${esc((b.pacing||'')+(b.tone?' · '+b.tone:''))}</dd><dt>Ushlab turish</dt><dd>${(b.retention||[]).map(esc).join(' · ')}</dd></dl>
${(b.topics||[]).length?`<div class="label" style="margin-top:10px">Shu usulda boshqa mavzular</div><div class="row" style="margin-top:6px">${b.topics.map(t=>`<button class="pill sm" type="button" data-ytt="${esc(t)}">${esc(t)}</button>`).join('')}</div>`:''}
<p class="note ok" style="margin-top:10px">Ssenariy yozishda shu tahlil ishlatiladi.</p></div>`}
$('#ytOut').addEventListener('click',e=>{const b=e.target.closest('[data-ytt]');if(b){P.topic=b.dataset.ytt;$('#topic').value=P.topic;save();toast('Mavzu qo\'yildi')}});
$('#ytOff').onclick=()=>{delete P.yt;save();ytRender()};
$('#ytGo').onclick=async()=>{const url=$('#ytUrl').value.trim();const id=ytId(url);if(!id){toast('YouTube video linkini qo\'ying',1);return}
if(!GM.keys().length){toast('Video tahlili uchun Gemini kaliti kerak (Sozlamalar)',1);return}
const btn=$('#ytGo');btn.disabled=true;btn.textContent='Ko\'rilmoqda…';$('#ytOut').innerHTML='<div class="note"><span class="spin"></span> AI videoni ko\'ryapti. Uzun video 1-2 daqiqa olishi mumkin.</div>';
const lang=LANGN[P.lang]||LANGN.uz;
const ask=`Watch this YouTube video carefully and analyse HOW it is made, so a different creator can make an original video using the same storytelling technique on their own topic. Answer in ${lang}. Return ONLY JSON:
{"title":"video title","why":"one sentence: why viewers keep watching","hook":"how the first 15 seconds grab attention (technique, not words)","structure":[{"part":"section purpose","share":"% of runtime"}],"pacing":"sentence length, cuts per minute, speed","tone":"voice and mood","retention":["techniques used to keep viewers (open loops, questions, reveals...)"],"avoid":["specific facts, names, phrases and examples from this video that must NOT be reused"],"topics":["5 new topic ideas that fit the same format${P.topic?', close to: '+P.topic:''}"]}`;
try{const t=await GM.json({contents:[{parts:[{fileData:{fileUri:'https://www.youtube.com/watch?v='+id}},{text:ask}]}],generationConfig:{temperature:.4,responseMimeType:'application/json',mediaResolution:'MEDIA_RESOLUTION_LOW'}},{label:'video tahlili'});
const m=t.match(/\{[\s\S]*\}/);if(!m)throw new Error('AI javob bermadi');
P.yt={url:'https://www.youtube.com/watch?v='+id,brief:JSON.parse(m[0]),at:Date.now()};save();ytRender();toast('Video tahlil qilindi')}
catch(e){$('#ytOut').innerHTML='';toast('Tahlil bo\'lmadi: '+(/private|not found|unavailable|permission/i.test(e.message)?'video yopiq yoki topilmadi. Ommaviy video linkini qo\'ying':e.message),1)}
btn.disabled=false;btn.textContent='Videoni tahlil qilish'};
let planAbort=null;
$('#planBtn').onclick=async()=>{
if(!P.topic?.trim()){toast('Avval mavzuni yozing',1);$('#topic').focus();return}
if((P.plan||[]).length){let n;do{n=Math.floor(Math.random()*ANG.length)}while(n===P.angle&&ANG.length>1);P.angle=n;renderAngles()}
if(!aiReady()){toast('AI kaliti kiritilmagan. Sozlamalar → AI xizmati',1);return}
let hist=[];try{hist=(await api('/api/history')).filter(h=>simTopic(h.topic,P.topic)).slice(-6)}catch(_){}
const nSec=P.format==='long'?Math.max(3,Math.min(10,Math.round(P.durVal/1.6)+2)):3;
const avoid=hist.map(h=>(h.plan||[]).join(' | ')).filter(Boolean);P.dna=pickVideoDNA(P.tpl);
$('#plan').innerHTML='<p class="note"><span class="spin"></span> Reja tuzilmoqda…</p>';planAbort?.abort();planAbort=new AbortController();
try{const j=await aiJSON(`Mavzu: "${P.topic}"
Hikoya burchagi: ${ANG[P.angle]}
Davomiylik: ${P.format==='long'?P.durVal+' daqiqa':P.durVal+' soniya (Shorts)'}
Bo'limlar soni: ${nSec}
${avoid.length?`Bu mavzuda oldin shu rejalar bo'lgan, ularni TAKRORLAMA, boshqacha yondash:\n- ${avoid.join('\n- ')}`:''}
${P.dna?`BU VIDEO UCHUN STRUKTURA (shablondagi umumiy qolipdan ustun): ${dnaText(P.dna).structure} Bo'limlarni shu strukturaga qarab nomla.\n`:''}${tplOf(P.tpl).plan?`Shablon strukturasi (faqat umumiy maslahat, yuqoridagi struktura ustun): ${tplOf(P.tpl).plan}.\n`:''}Video uchun reja tuz: har bo'lim nomi bitta qisqa jumla, aniq va qiziqarli. Birinchi bo'lim kuchli ilgak bilan boshlansin. Bo'lim nomlari o'zbek tilida, har biri 4–10 so'zlik qisqa nom bo'lsin (matn yoki gap emas).
Faqat JSON qaytar: {"title":"video sarlavhasi","sections":["...","..."]}`,{system:sysBase(),temperature:1.0,maxTokens:1500,search:P.search!==false&&aiCfg().provider==='gemini',signal:planAbort.signal},j=>Array.isArray(j?.sections)&&j.sections.length>0);
P.plan=j.sections.map(String);if(j.title&&(P._autoName||P.name==='Yangi video')){P.name=String(j.title).slice(0,90);$('#projName').value=P.name}
api('/api/history',{method:'POST',body:{topic:P.topic,angle:ANG[P.angle],plan:P.plan}}).catch(()=>{});
renderPlan();save()}catch(e){toast(e.message,1);renderPlan()}};
function simTopic(a,b){a=String(a||'').toLowerCase();b=String(b||'').toLowerCase();if(!a||!b)return false;const wa=new Set(a.split(/\W+/).filter(w=>w.length>3));const wb=b.split(/\W+/).filter(w=>w.length>3);const c=wb.filter(w=>wa.has(w)).length;return c>=Math.min(2,wb.length)}

const stripHeads=t=>String(t||'').split('\n').filter(l=>!/^\s*##/.test(l)).join('\n');
function sectionsOf(t){const out=[];let cur={title:'',text:''};String(t||'').split('\n').forEach(l=>{const m=l.match(/^\s*##\s*(.*)/);if(m){if(cur.title||cur.text.trim())out.push(cur);cur={title:m[1].trim(),text:''}}else cur.text+=l+'\n'});if(cur.title||cur.text.trim())out.push(cur);return out}
function splitSentences(t){return String(t).replace(/\s+/g,' ').match(/[^.!?…]+[.!?…]+["»”')]*|[^.!?…]+$/g)?.map(s=>s.trim()).filter(Boolean)||[]}
function splitFrames(text,wpf){const sents=splitSentences(stripHeads(text));const out=[];let cur='';
const push=()=>{if(cur.trim())out.push(cur.trim());cur=''};
for(let s of sents){const w=wc(s);
if(w>wpf*1.8){push();const parts=s.split(/(?<=[,;:—–])\s+/);let acc='';for(const p of parts){if(wc(acc+' '+p)>wpf*1.2&&acc){out.push(acc.trim());acc=p}else acc+=(acc?' ':'')+p}if(acc.trim())out.push(acc.trim());continue}
if(cur&&wc(cur)+w>wpf*1.25)push();cur+=(cur?' ':'')+s;if(wc(cur)>=wpf*0.75)push()}
push();return out}
function updFrames(){P.frames=splitFrames(P.script,wordsPerFrame());const w=wc(stripHeads(P.script));const T=targetWords();
$('#wc').textContent=`${w.toLocaleString('ru-RU')} / ${T.toLocaleString('ru-RU')}`;$('#wbar').style.width=Math.min(100,w/T*100)+'%';
$('#frameNote').textContent=P.frames.length?`${P.frames.length} ta kadr bo'ladi · taxminan ${fmt(w/2.2)}`:''}
let selSec=-1;
function renderOutline(active,doneN){const secsArr=sectionsOf(P.script);const titles=(P.plan?.length?P.plan:secsArr.map(s=>s.title)).slice();
$('#outline').innerHTML=titles.length?titles.map((s,i)=>{const done=doneN!==undefined?i<doneN:!!secsArr.find(x=>x.title===s&&x.text.trim());return `<button type="button" class="oi ${done?'done':''} ${i===active?'now':''} ${i===selSec?'sel':''}" data-si="${i}"><span class="num">${String(i+1).padStart(2,'0')}</span>${esc(s)}<span class="st">${i===active?'yozilmoqda':done?'✓':''}</span></button>`}).join(''):'<p class="note">Reja yo\'q. Ssenariy bir butun yoziladi yoki o\'zingiz joylaysiz.</p>'}
function renderStep3(){$('#script').value=P.script||'';updFrames();renderOutline();setGenUI(false)}
$('#outline').addEventListener('click',e=>{const b=e.target.closest('[data-si]');if(!b)return;selSec=+b.dataset.si;renderOutline()});
$('#script').addEventListener('input',e=>{P.script=e.target.value;updFrames();save()});
let genAbort=null;
function setGenUI(on){$('#genBtn').hidden=on;$('#stopBtn').hidden=!on;$('#regenBtn').disabled=on;$('#genBtn').textContent=P.script?.trim()?'Boshidan qayta yozish':'Ssenariyni yozish';
$('#stAside').innerHTML=on?'<span class="chip"><i class="dot warn"></i>Yozilmoqda</span>':(P.script?.trim()?'<span class="chip ok"><i class="dot"></i>Tayyor</span>':'')}
$('#stopBtn').onclick=()=>genAbort?.abort();
async function writeSection(i,titles,perSec,signal,prevTail){
const ta=$('#script');let sec='';
const pr=`Video mavzusi: "${P.topic}". Burchak: ${ANG[P.angle]}.
To'liq reja: ${titles.map((t,k)=>`${k+1}) ${t}`).join('; ')}
Hozir faqat ${i+1}-bo'limni yoz: "${titles[i]}".
Hajmi: ${perSec} so'z atrofida (${Math.round(perSec*0.9)}–${Math.round(perSec*1.1)} so'z). Bu qat'iy: ovoz uzunligi shunga bog'liq, ko'p ham, kam ham yozma.
${prevTail?`Oldingi bo'lim shunday tugadi: "…${prevTail}". Undan tabiiy davom et, takrorlama.`:'Bu birinchi bo\'lim: birinchi gapdan qiziqtir.'}
${P.dna?dnaBrief(P.dna,i,titles.length):(i===titles.length-1?'Bu oxirgi bo\'lim: aniq yakun bilan tugat.':'')}
Faqat bo'lim matnini yoz, sarlavhasiz.`;
const base=ta.value;
const onT=(t)=>{sec+=t;ta.value=base+sec;ta.scrollTop=ta.scrollHeight;P.script=ta.value;updFrames()};
await ai(pr,{system:sysBase(),search:P.search!==false&&aiCfg().provider==='gemini',temperature:0.95,signal,onText:onT});
for(let k=0;k<2&&wc(sec)<perSec*0.8;k++){
onT(' ');await ai(`Shu bo'limni davom ettir (yana taxminan ${perSec-wc(sec)} so'z). Takrorlama, yangi detal va fakt qo'sh. Faqat davomini yoz.\nHozirgacha yozilgan: "${sec.slice(-1500)}"`,{system:sysBase(),temperature:0.9,signal,onText:onT})}
return sec}
$('#genBtn').onclick=async()=>{
if(!aiReady()){toast('AI kaliti kiritilmagan. Sozlamalar → AI xizmati. Yoki boshqa AI javobini maydonga joylang',1);return}
if(!P.topic?.trim()){toast('Avval 2-qadamda mavzuni yozing',1);return}
if(P.script?.trim()&&!await confirmBox('Boshidan yozish','Hozirgi ssenariy o\'chib, yangisi yoziladi.','Yozish'))return;
const titles=P.plan?.length?P.plan:['Asosiy matn'];const perSec=Math.round(targetWords()/titles.length);
{const nd=pickVideoDNA(P.tpl);if(P.dna)nd.structure=P.dna.structure;P.dna=nd}
genAbort=new AbortController();setGenUI(true);P.script='';$('#script').value='';
try{let tail='';for(let i=0;i<titles.length;i++){renderOutline(i,i);const ta=$('#script');ta.value+=(i?'\n\n':'')+'## '+titles[i]+'\n';const sec=await writeSection(i,titles,perSec,genAbort.signal,tail);tail=splitSentences(sec).slice(-2).join(' ')}
renderOutline(-1);const W=wc(stripHeads(P.script)),T=targetWords();
if(W<T*0.88&&!genAbort.signal.aborted){$('#stAside').innerHTML='<span class="chip"><span class="spin"></span> Uzunlik moslanmoqda (kam)</span>';
try{const secs=sectionsOf(P.script);const out=[];for(const sc of secs){const w=wc(sc.text);const want=Math.max(20,Math.round(w*T/W));
const t=await ai(`Quyidagi matnni ${want} so'zgacha kengaytir (${Math.round(want*0.95)}–${Math.round(want*1.08)} so'z). Yangi to'qima fakt qo'shma: mavjud fikrlarni batafsilroq, misol, sahna tafsilotlari va hissiy detallar bilan yoz. Ohang va ma'no saqlansin. Sarlavha va belgilarsiz, faqat matn.\n\n${sc.text.trim()}`,{system:sysBase(),temperature:0.6,signal:genAbort.signal});
out.push((sc.title?'## '+sc.title+'\n':'')+t.trim())}P.script=out.join('\n\n');$('#script').value=P.script}catch(e){if(!genAbort.signal.aborted)toast('Uzaytirib bo\'lmadi: '+e.message,1)}}
if(W>T*1.2&&!genAbort.signal.aborted){$('#stAside').innerHTML='<span class="chip"><span class="spin"></span> Uzunlik moslanmoqda</span>';
try{const secs=sectionsOf(P.script);const out=[];for(const sc of secs){const w=wc(sc.text);const want=Math.max(8,Math.round(w*T/W));
const t=await ai(`Quyidagi matnni ${want} so'zga qisqartir (${Math.round(want*0.9)}–${Math.round(want*1.1)}). Ma'no, fakt va ohang saqlansin, eng muhim gaplar qolsin. Faqat qisqartirilgan matnni yoz.\n\n${sc.text.trim()}`,{system:sysBase(),temperature:0.4,signal:genAbort.signal});
out.push((sc.title?'## '+sc.title+'\n':'')+t.trim())}P.script=out.join('\n\n');$('#script').value=P.script}catch(e){if(!genAbort.signal.aborted)toast('Qisqartirib bo\'lmadi: '+e.message,1)}}
toast('Ssenariy tayyor · '+wc(stripHeads(P.script))+' so\'z')}
catch(e){if(genAbort.signal.aborted)toast('To\'xtatildi. Yozilgan qism saqlandi');else toast(e.message,1)}
setGenUI(false);P.script=$('#script').value;updFrames();save()};

/* ===== Ssenariyni tekshirish ===== */
$('#chkBtn').onclick=async()=>{const txt=speechText(P.script).trim();if(!txt){toast('Avval ssenariy kerak',1);return}if(!aiReady()){toast('AI kaliti kiritilmagan',1);return}
const ac=new AbortController();$('#chkBtn').disabled=true;$('#chkBtn').textContent='Tekshirilmoqda…';
try{const r=await ai(`Quyidagi YouTube ssenariyni qattiq, halol muharrir sifatida tekshir. Mavzu: "${P.topic||''}". Til: ${LANGN[P.lang]||LANGN.uz}.
Javobni FAQAT shu JSON ko'rinishida qaytar (hech qanday qo'shimcha matnsiz):
{"verdict":"video qilishga arziydi | tuzatib arziydi | arzimaydi","score":0-10,"summary":"2 gap","issues":[{"type":"fakt|bo'rttirish|mantiq|takror|zerikarli|til","where":"qisqa iqtibos","problem":"nima xato","fix":"qanday tuzatish"}]}
Tekshir: noto'g'ri yoki shubhali faktlar (raqam, sana, ism), bo'rttirilgan iddialar, mantiqiy teshiklar, takrorlar, zerikarli joylar, tomoshabin ketib qolishi mumkin bo'lgan joylar, til xatolari. Bilmagan faktni "to'g'ri" dema: "tekshirib bo'lmadi" deb yoz. Ko'pi bilan 12 ta muammo.\n\nSSENARIY:\n${txt.slice(0,24000)}`,{temperature:0.2,maxTokens:4000,signal:ac.signal});
const j=jsonFrom(r);if(!j||typeof j!=='object')throw new Error('Javobni o\'qib bo\'lmadi. Qayta urinib ko\'ring');
const iss=Array.isArray(j.issues)?j.issues:[];window._chk=j;
modal('Ssenariy tekshiruvi',`<div class="chkv"><b>${esc(String(j.verdict||''))}</b><span class="num">${esc(String(j.score??''))}/10</span></div><p class="sub" style="font-size:14px;line-height:1.55">${esc(j.summary||'')}</p>
<div class="mlist">${iss.length?iss.map(x=>`<div class="mrow" style="align-items:flex-start"><div class="grow"><b>${esc(x.type||'')}</b><small>«${esc(x.where||'')}»</small><div style="font-size:13px;margin-top:4px">${esc(x.problem||'')}</div><div style="font-size:13px;margin-top:2px;color:var(--o1)">→ ${esc(x.fix||'')}</div></div></div>`).join(''):'<p class="note">Jiddiy muammo topilmadi.</p>'}</div>
${iss.length?'<div class="row" style="margin-top:12px"><button class="pill on" type="button" id="chkFix">Shu bo\'yicha tuzatib yozish</button></div>':''}`,b=>{const f=$('#chkFix');if(f)f.onclick=async()=>{f.disabled=true;f.textContent='Tuzatilmoqda…';
try{const secs=sectionsOf(P.script),list=iss.map((x,i)=>`${i+1}. «${x.where}» — ${x.problem}. Tuzatish: ${x.fix}`).join('\n');const out=[];
for(const sc of secs){const t=await ai(`Quyidagi ssenariy bo'limini muammolar ro'yxatiga qarab tuzat. Faqat shu bo'limga tegishli muammolarni tuzat, qolgan matn, ohang va uzunlik (±5%) saqlansin. Ishonchsiz faktni olib tashla yoki yumshoq so'zla ("taxminan", "ba'zi manbalarga ko'ra"). Faqat tuzatilgan matnni qaytar, sarlavhasiz.\n\nMUAMMOLAR:\n${list}\n\nBO'LIM:\n${sc.text.trim()}`,{system:sysBase(),temperature:0.3});out.push((sc.title?'## '+sc.title+'\n':'')+t.trim())}
P.script=out.join('\n\n');$('#script').value=P.script;updFrames();save();closeModal();toast('Ssenariy tuzatildi')}catch(e){toast(e.message,1);f.disabled=false;f.textContent='Qayta urinish'}}})}catch(e){toast(e.message,1)}
$('#chkBtn').disabled=false;$('#chkBtn').textContent='Ssenariyni tekshirish'};
$('#regenBtn').onclick=async()=>{const secsArr=sectionsOf(P.script);if(selSec<0||!secsArr[selSec]){toast('Chapdagi ro\'yxatdan bo\'limni tanlang',1);return}if(!aiReady()){toast('AI kaliti kiritilmagan',1);return}
const titles=secsArr.map(s=>s.title);genAbort=new AbortController();setGenUI(true);
try{let sec='';const pr=`"${P.topic}" videosining "${titles[selSec]}" bo'limini qaytadan, boshqacha va yaxshiroq yoz (taxminan ${Math.max(60,wc(secsArr[selSec].text))} so'z). Avvalgi variant: "${secsArr[selSec].text.trim().slice(0,1500)}". Faqat yangi matn.`;
sec=await ai(pr,{system:sysBase(),temperature:1,signal:genAbort.signal});
secsArr[selSec].text=sec.trim()+'\n';P.script=secsArr.map(s=>(s.title?'## '+s.title+'\n':'')+s.text.trim()).join('\n\n');$('#script').value=P.script;updFrames();toast('Bo\'lim qayta yozildi')}
catch(e){toast(e.message,1)}setGenUI(false);save()};
$('#copyScript').onclick=()=>copyText(stripHeads(P.script).replace(/\n{3,}/g,'\n\n').trim());
$('#copyReq').onclick=()=>{const titles=P.plan||[];copyText(`${sysBase()}

VAZIFA: "${P.topic||'(mavzu)'}" mavzusida YouTube video ssenariysi yoz.
Hikoya burchagi: ${ANG[P.angle]}. Hajmi: taxminan ${targetWords()} so'z (${P.format==='long'?P.durVal+' daqiqa':P.durVal+' soniya'}).
${titles.length?'Reja:\n'+titles.map((t,i)=>`${i+1}. ${t}`).join('\n'):''}
${P.dna?dnaBrief(P.dna,0,2)+'\n':''}Har bo'limni "## Bo'lim nomi" qatori bilan boshlang. Boshqa izoh yozmang, faqat ssenariy.`)};

function refHint(){const n=tplOf(P.tpl).need||[];if(!n.length)return'Bu yo\'nalishda personaj ham, joy ham shart emas. Faqat rasm stili ishlatiladi.';if(n.includes('stock'))return'Stok videolar uchun qidiruv so\'zlari keyingi qadamda yoziladi. Bu qadamni o\'tkazib yuborsangiz bo\'ladi.';return'Har personaj va joy uchun bitta aniq ta\'rif. Rasm yuklasangiz, AI uni ko\'rib ta\'rifni o\'zi yozadi.'}
function renderStep4(){const n=tplOf(P.tpl).need||[];const R=P.refs;R.chars=R.chars||[];R.locs=R.locs||[];
const legend=`<div class="legend"><div class="lg on"><b>Stil</b><span>Qanday chiziladi: chiziq, rang, yorug'lik. 1-qadamda tanlangan (${esc((tplOf(P.tpl).img&&!P.styleOv?styleOf(tplOf(P.tpl).style):effStyle()).n)}), hamma kadrga.</span></div><div class="lg ${n.includes('char')?'on':''}"><b>Personaj</b><span>Kim. Faqat u bor kadrlarga qo'shiladi, yuzi va kiyimi o'zgarmaydi.</span></div><div class="lg ${n.includes('loc')?'on':''}"><b>Joy</b><span>Qayerda. Faqat shu joyda bo'lgan kadrlarga qo'shiladi.</span></div></div>`;
const card=(kind,r,i)=>`<div class="panel who"><label class="av ${r.img?'filled':''}">${r.img?`<img src="${purl(r.img,1)}" alt="">`:'Rasm yuklash<br>(ixtiyoriy)'}<input type="file" accept="image/*" hidden data-rimg="${kind}:${i}"></label>
   <input class="input sm" data-rf="${kind}:${i}:name" value="${esc(r.name)}" placeholder="${kind==='chars'?'Masalan: Qahramon (sen)':'Masalan: Shanxay ko\'chasi'}">
   <textarea class="input ta" data-rf="${kind}:${i}:desc" placeholder="Tashqi ko'rinishi: yuz, soch, kiyim, ranglar…">${esc(r.desc)}</textarea>
   ${kind==='locs'?`<input class="input sm" data-rf="${kind}:${i}:range" value="${esc(r.range||'')}" placeholder="Kadrlar: masalan 001-040 (bo'sh = AI o'zi topadi)">`:''}
   <div class="row">${r.img?`<button class="pill sm" type="button" data-rana="${kind}:${i}">AI ko'rib yozsin</button>`:''}<button class="pill sm" type="button" data-rdel="${kind}:${i}">O'chirish</button></div></div>`;
$('#refPane').innerHTML=legend+(n.includes('char')||n.includes('loc')||R.chars.length||R.locs.length?`<div class="row"><button class="pill on" type="button" id="refAuto">Ssenariydan topish</button><button class="pill" type="button" id="addChar">+ Personaj</button><button class="pill" type="button" id="addLoc">+ Joy</button></div>
   <div class="cast">${R.chars.map((r,i)=>card('chars',r,i)).join('')}${R.locs.map((r,i)=>card('locs',r,i)).join('')}</div>${!R.chars.length&&!R.locs.length?'<div class="empty">Hali yo\'q. "Ssenariydan topish" ni bosing yoki qo\'lda qo\'shing.</div>':''}`:
`<div class="panel"><h3>Bu qadamni o'tkazib yuborsangiz bo'ladi</h3><p class="sub">"${esc(tplOf(P.tpl).n)}" yo'nalishida takrorlanadigan qahramon yoki joy shart emas.</p><div class="row" style="margin-top:12px"><button class="pill sm" type="button" id="addChar">+ Baribir personaj qo'shish</button></div></div>`);
$('#addChar')&&($('#addChar').onclick=()=>{R.chars.push({name:'',desc:''});renderStep4();save()});
$('#addLoc')&&($('#addLoc').onclick=()=>{R.locs.push({name:'',desc:'',range:''});renderStep4();save()});
$('#refAuto')&&($('#refAuto').onclick=refAuto)}
$('#refPane').addEventListener('input',e=>{const f=e.target.closest('[data-rf]');if(!f)return;const [k,i,fld]=f.dataset.rf.split(':');P.refs[k][+i][fld]=f.value;save()});
$('#refPane').addEventListener('click',async e=>{
const d=e.target.closest('[data-rdel]');if(d){const [k,i]=d.dataset.rdel.split(':');P.refs[k].splice(+i,1);renderStep4();save();return}
const a=e.target.closest('[data-rana]');if(a){const [k,i]=a.dataset.rana.split(':');const r=P.refs[k][+i];if(!aiReady()){toast('AI kaliti kerak',1);return}
a.innerHTML='<span class="spin"></span>';try{const t=await ai(`Bu rasmdagi ${k==='chars'?'personajning DOIMIY tashqi ko\'rinishini (yuz shakli, soch, tana tuzilishi, kiyim, ranglar, uslub). Poza, qo\'l holati, imo-ishora, yuz ifodasi, harakat, fon va buyumlarni UMUMAN yozma — masalan "boshini ushlab turibdi" yoki "qo\'rqib qaramoqda" deb yozish xato':'joyni (binolar, ranglar, yorug\'lik, kayfiyat, detallar)'} rasm generatori uchun aniq ta'rifla. Ingliz tilida, bitta paragraf, 40–70 so'z. Faqat ta'rif.`,{images:[r.img],temperature:0.4,maxTokens:400});r.desc=t.trim();renderStep4();save();toast('Ta\'rif yozildi')}catch(err){toast(err.message,1);renderStep4()}}});
$('#refPane').addEventListener('change',async e=>{const f=e.target.closest('[data-rimg]');if(!f||!f.files[0])return;const [k,i]=f.dataset.rimg.split(':');
try{const r=await upload('refs',f.files[0],{name:`${k}_${i}_${Date.now()}${(f.files[0].name.match(/\.\w+$/)||['.png'])[0]}`});P.refs[k][+i].img=r.rel;renderStep4();save();
if(aiReady()&&!P.refs[k][+i].desc)$(`[data-rana="${k}:${i}"]`)?.click()}catch(err){toast(err.message,1)}});
async function refAuto(){if(!aiReady()){toast('AI kaliti kerak',1);return}if(!P.frames?.length){toast('Avval ssenariy kerak (3-qadam)',1);return}
const btn=$('#refAuto');btn.innerHTML='<span class="spin"></span> Qidirilmoqda';
try{const fr=P.frames.map((f,i)=>`${pad3(i+1)}: ${f}`).join('\n');
const T0=tplOf(P.tpl);const t=await ai(`Quyidagi video kadrlarida takror uchraydigan personajlar va joylarni top. Rasm stili (STYLE LOCK): ${styleOn()?effStyle().p:(tplOf(P.tpl).img?.lock||styleOf(P.style).p)}.
${T0.img?`Bu yo'nalishda personaj pasporti (CHARACTER DNA) shu stilda bo'ladi${T0.img.dnaHint?', namuna qolip: "'+T0.img.dnaHint+'"':''}${T0.dna?.length?'. Tayyor pasportlar: '+T0.dna.map(d=>d.name+': '+d.desc).join(' | '):''}.
Har personaj uchun ingliz tilida 15–40 so'zlik DNA yoz: bosh shakli, ko'z, soch, kiyim va rangi — shu stilga mos, hamma kadrda so'zma-so'z takrorlanadi. DNA faqat doimiy ko'rinish: poza, qo'l holati, yuz ifodasi va harakat DNA ga kirmaydi (ular har kadrda gapga qarab o'zgaradi).`:"Har personaj uchun ingliz tilida aniq tashqi ko'rinish ta'rifi (30–60 so'z) yoz: yosh, yuz, soch, kiyim, ranglar — hamma rasmda bir xil chizilishi uchun. Poza, qo'l holati, ifoda va harakatni yozma."}
Har joy uchun ingliz tilida ta'rif va qaysi kadrlarda ekanini yoz.
Faqat JSON: {"chars":[{"name":"...","desc":"..."}],"locs":[{"name":"...","desc":"...","range":"001-040"}]}
KADRLAR:\n${fr.slice(0,60000)}`,{temperature:0.4,maxTokens:4000});
const j=jsonFrom(t);if(!j)throw new Error('AI javobi tushunarsiz. Qayta bosing');
const keepImg=(arr,nw)=>(nw||[]).map(x=>Object.assign({},arr.find(o=>o.name===x.name)||{},x));
P.refs.chars=keepImg(P.refs.chars,j.chars).slice(0,6);P.refs.locs=keepImg(P.refs.locs,j.locs).slice(0,10);renderStep4();save();toast(`${P.refs.chars.length} ta personaj, ${P.refs.locs.length} ta joy topildi`)}
catch(e){toast(e.message,1);renderStep4()}}

const BLOCK=40;
const POSE_WORDS=/(hold|clutch|grip|grab|hands? (on|to|over|against|up)|head in|pos(e|ed|ing)\b|stand|sitt?|lean|look(s|ing)\b|expression|panic|scream|shock|terrif|worr|scared|frown|smil|grin|cry|angry|surpris|wide-eyed)/i;
function cleanDNA(d){const kept=String(d||'').split(/(?<=[,;.])\s+/).filter(x=>!POSE_WORDS.test(x));return (kept.join(' ')||String(d||'')).replace(/[,;]\s*$/,'').trim()}
function docImgSys(T,chars){chars=(chars||[]).map(c=>Object.assign({},c,{desc:cleanDNA(c.desc)}));const I=T.img;const sh=P.format==='short';const ar=sh?'9:16':'16:9';const fix=x=>sh?x.replace(/16:9/g,'9:16').replace(/horizontal/g,'vertical'):x;const locs=(P.refs.locs||[]).filter(l=>l.desc);
return `You are the Professional Visual Engineer of a YouTube channel in the "${T.n}" niche (reference: ${T.channel}). Write ONE image prompt per frame line for an AI image generator (Google Flow / Imagen / Midjourney), in English, even if the frame text is in another language.
STYLE LOCK (never change it): ${P.styleOv?effStyle().p+'\nOVERRIDE: the creator chose this art style instead of the template default. In every formula below replace ONLY the art-style wording (medium, outline, colors, shading, character look) with this style; keep the composition logic, scene rules and the CHARACTER DNA structure.':I.lock}
ALL FRAMES — use exactly this formula and fill the brackets with concrete content:
${fix(I.main.f)}
Every frame is a full scene with a real background and a real environment. NEVER use a pure white or empty background, charts, statistics, infographics, map outlines, or a character standing beside one lonely object.
${(I.extra||[]).map(x=>`SPECIAL FRAMES (ONLY for: ${x.when}) — formula:\n${fix(x.f)}`).join('\n')}
${I.notes?'NOTES: '+I.notes:''}
${COMMON_IMG}
POSE & EXPRESSION (critical): the character DNA below describes ONLY the permanent look. Ignore any pose, gesture or expression that appears in a reference picture or inside a DNA text. For EVERY frame first decide the action and emotion from that frame's sentence (running, closing a door, climbing stairs, arguing, pointing, laughing, carrying, falling...), then draw exactly that body language and face. Never repeat the same pose in two consecutive frames; hands on head / holding head is allowed ONLY when the sentence itself is about shock or headache. If the sentence has no character action, show the scene or object instead of the character.
${chars.length?`CHARACTER DNA — paste word for word wherever the formula has [CHARACTER_DNA], [MAIN_CHARACTER_DNA], [FOUNDER_DNA], [POV_DNA], [CLASSIC_WOJAK_DNA] etc. and that character is in the frame:\n${chars.map(c=>`- ${c.name}: ${c.desc}`).join('\n')}`:'If a recurring person appears, invent ONE fixed DNA in the style lock (12–15 words) and repeat it word for word in every prompt where that person appears.'}
${locs.length?`LOCATIONS (use the description when the frame happens there):\n${locs.map(l=>`- ${l.name}${l.range?' ('+l.range+')':''}: ${l.desc}`).join('\n')}`:''}
Every prompt ends with "--ar ${ar}". Never leave bracket placeholders in the output.
Output format, exactly one line per frame, nothing else: NNN. prompt`}
function fillThumb(f){const C=(P.refs.chars||[]).filter(c=>c.desc);const d0=C[0]?.desc||'',d1=C[1]?.desc||d0;let x=f.replace(/\[(MAIN_CHARACTER_DNA|FOUNDER_DNA|POV_DNA|CHARACTER_DNA)\]/g,d0||'$&').replace(/\[USTA_DNA\]/g,d1||'$&');
let ct='';try{ct=coverText()}catch(_){}if(ct)x=x.replace(/\[(TEXT|MATN|QUESTION\?|SAVOL\?|WORD 1)\]/g,ct);if(P.format==='short')x=x.replace(/16:9/g,'9:16').replace(/horizontal/g,'vertical');return x}
const aspect=()=>P.format==='short'?'vertical 9:16':'horizontal 16:9';
function parseRange(r){const m=String(r||'').match(/(\d+)\s*[-–]\s*(\d+)/);return m?[+m[1],+m[2]]:null}
function locFor(n){for(const l of P.refs.locs||[]){const r=parseRange(l.range);if(r&&n>=r[0]&&n<=r[1])return l}return null}
function flowCmd(a,b){return `Yuqoridagi promptlarni (${pad3(a)}–${pad3(b)}) tartib bilan generatsiya qil. Har bir prompt = 1 ta rasm. Hech birini tushirib qoldirma.
Qoidalar:
1. Shoshilma. Bir vaqtda faqat 4 tadan generatsiya qil.
2. Xato chiqsa, o'sha rasmni qayta generatsiya qil. Muvaffaqiyatli chiqquncha takrorla.
3. Qayta urinishda ham xato bersa, urush, qurol, qon, zo'ravonlik kabi so'zlarni neytral so'zlar bilan almashtir. Mazmun va uslub o'zgarmasin.
4. Rasmlarni prompt raqami bo'yicha ${pad3(a)}, ${pad3(a+1)} ... deb nomla.`}
function blockText(bi){const a=bi*BLOCK+1,b=Math.min(P.frames.length,(bi+1)*BLOCK);let s='';for(let n=a;n<=b;n++)s+=`${pad3(n)}. ${P.prompts[n-1]||(pAbort&&!$('#promptStop').hidden?'… yozilmoqda':'(prompt yo\'q — "Promptlarni yozish" ni bosing)')}\n\n`;return s+(P.src==='flow'?flowCmd(a,b):'')}
function renderStep5(){if(!P.frames?.length)P.frames=splitFrames(P.script,wordsPerFrame());const n=P.frames.length;const have=P.prompts.filter((x,i)=>i<n&&x).length;
$('#pStats').innerHTML=`<span class="chip"><span class="num" style="font-size:15px">${n}</span> kadr</span><span class="chip"><span class="num" style="font-size:15px">${have}</span> prompt</span>${n&&have===n?'<span class="chip ok"><i class="dot"></i>Soni teng</span>':n?`<span class="chip warn"><i class="dot"></i>${n-have} ta yetishmaydi</span>`:''}${(tplOf(P.tpl).need||[]).includes('stock')?'<span class="chip">Stok qidiruv so\'zlari</span>':''}`;
$$('#src .srcc').forEach(x=>x.classList.toggle('on',x.dataset.src===P.src));
if(!n){$('#blocks').innerHTML='<div class="empty">Avval ssenariy kerak (3-qadam). Yoki tayyor promptlarni "Promptlarni joylash" orqali qo\'ying.</div>';return}
const nb=Math.ceil(n/BLOCK);let h='';
for(let bi=0;bi<nb;bi++){const a=bi*BLOCK+1,b=Math.min(n,(bi+1)*BLOCK);const loc=locFor(a);
h+=`<div class="blk ${bi===0?'open':''}"><div class="cp ${bi%2?'right':''}" data-blk role="button" tabindex="0"><span class="cap">${String(bi+1).padStart(2,'0')}</span><span class="body"><span class="ico"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg></span><span class="txt"><span class="t">Blok ${bi+1} · ${pad3(a)}–${pad3(b)}</span><span class="d">${esc(P.frames[a-1].slice(0,90))}…${loc?' · joy: '+esc(loc.name):''}</span></span></span></div>
     <div class="bin"><textarea readonly spellcheck="false">${esc(blockShow(bi))}</textarea><div class="row"><button class="pill sm on" type="button" data-bcopy="${bi}">Blokni nusxalash</button>${loc?`<button class="pill sm" type="button" data-lcopy="${bi}">Joy ta'rifini nusxalash</button>`:''}${P.refs.chars?.length?`<button class="pill sm" type="button" data-ccopy="1">Personaj ta'rifi</button>`:''}</div></div></div>`}
$('#blocks').innerHTML=h;animRender()}
$('#blocks').addEventListener('click',e=>{const h=e.target.closest('[data-blk]');if(h){h.parentElement.classList.toggle('open');return}
const c=e.target.closest('[data-bcopy]');if(c){const bi=+c.dataset.bcopy,a=bi*BLOCK;if(Array.from({length:Math.min(P.frames.length,a+BLOCK)-a},(_,i)=>P.prompts[a+i]).some(x=>!x)){toast('Avval «Promptlarni yozish» ni bosing',1);return}copyText(blockText(bi))}
const l=e.target.closest('[data-lcopy]');if(l){const loc=locFor(+l.dataset.lcopy*BLOCK+1);copyText(`${loc.name}: ${loc.desc}`)}
const ch=e.target.closest('[data-ccopy]');if(ch)copyText(P.refs.chars.map(c=>`${c.name}: ${c.desc}`).join('\n'))});
$('#src').addEventListener('click',e=>{const b=e.target.closest('[data-src]');if(!b)return;P.src=b.dataset.src;renderStep5();save();if(P.src==='paste')$('#pastePrompts').click()});
$('#copyAllPrompts').onclick=()=>{if(!P.frames.length)return;let s='';for(let i=0;i<Math.ceil(P.frames.length/BLOCK);i++)s+=blockText(i)+'\n\n';copyText(s.trim())};
$('#pastePrompts').onclick=()=>modal('Promptlarni joylash',`<p class="sub">Har qator bitta prompt. "001. ..." kabi raqamlangan bo'lsa, raqami bo'yicha joylanadi. Raqamsiz bo'lsa, tartib bilan.</p><textarea class="input ta" id="ppIn" style="min-height:280px"></textarea><div class="row"><button class="primary sm" type="button" id="ppOk">Joylash</button></div>`,b=>{
b.querySelector('#ppOk').onclick=()=>{const lines=b.querySelector('#ppIn').value.split('\n').map(x=>x.trim()).filter(Boolean);let k=0,cnt=0;
for(const l of lines){const m=l.match(/^\s*(\d{1,4})\s*[.):\-]\s*(.+)/);if(m){P.prompts[+m[1]-1]=m[2].trim();cnt++}else if(!/^(yuqoridagi|qoidalar|\d\.\s+shoshilma)/i.test(l)){P.prompts[k]=l;k++;cnt++}}
if(!P.frames.length){P.frames=P.prompts.map((_,i)=>'');}
closeModal();renderStep5();save();toast(cnt+' ta prompt joylandi')}});
let pAbort=null;

/* animatsiya promptlari */
function animParse(s,n){const o=new Set();String(s||'').split(/[,;\s]+/).forEach(p=>{const m=p.match(/^(\d+)(?:-(\d+))?$/);if(!m)return;let x=+m[1],y=m[2]?+m[2]:x;if(x>y)[x,y]=[y,x];for(let k=Math.max(1,x);k<=Math.min(n,y);k++)o.add(k)});return[...o].sort((a,b)=>a-b)}
function animRender(){const L=$('#animList');if(!L)return;const A=P.anim||{},ks=Object.keys(A).map(Number).sort((a,b)=>a-b);
L.innerHTML=ks.length?ks.map(k=>`<div class="blk open"><div class="bin" style="display:block"><b>${pad3(k)} · ${A[k].d||5} soniya</b><textarea spellcheck="false" data-ak="${k}" style="min-height:90px">${esc(A[k].t||'… yozilmoqda')}</textarea><div class="row"><button class="pill sm" type="button" data-acp="${k}">Nusxalash</button><button class="pill sm" type="button" data-adl="${k}">O'chirish</button></div></div></div>`).join(''):'<div class="empty">Hali animatsiya prompti yo\'q. Kadrlarni tanlab tugmani bosing.</div>'}
$('#animPanel').addEventListener('click',e=>{const b=e.target.closest('[data-ahead]');if(b){const n=P.frames?.length||0,c=+b.dataset.ahead;$('#animSel').value=c?`1-${Math.min(c,n)}`:Array.from({length:Math.ceil(n/20)},(_,i)=>i*20+1).join(', ');return}
const c=e.target.closest('[data-acp]');if(c){copyText(P.anim[c.dataset.acp].t);return}
const d=e.target.closest('[data-adl]');if(d){delete P.anim[d.dataset.adl];save();animRender()}});
$('#animList').addEventListener('input',e=>{const t=e.target.closest('[data-ak]');if(t){P.anim[t.dataset.ak].t=t.value;save()}});
$('#animCopy').onclick=()=>{const A=P.anim||{},ks=Object.keys(A).map(Number).sort((a,b)=>a-b);if(!ks.length){toast('Avval prompt yozing',1);return}copyText(ks.map(k=>`${pad3(k)}. ${A[k].t}`).join('\n\n'))};
$('#animBtn').onclick=async()=>{if(!aiReady()){toast('AI kaliti kerak',1);return}const n=P.frames?.length||0;const ks=animParse($('#animSel').value,n);if(!ks.length){toast('Kadr raqamlarini yozing: 1-3, 12',1);return}
const dur=+$('#animDur').value||5;P.anim=P.anim||{};const btn=$('#animBtn');btn.disabled=true;
const chars=(P.refs.chars||[]).filter(c=>c.desc).map(c=>c.name+': '+cleanDNA(c.desc)).join('\n');
const sys=`You write image-to-video animation prompts (Google Flow Veo, Kling, Runway) for a ${dur}-second clip that brings an existing still image to life. For each frame you get the narration sentence and the still image prompt. Write ONE prompt per frame, English, 35-70 words: what moves (subject action, eyes, hair, cloth, particles, water, smoke, background life), the camera move (slow push-in, pan, tilt, orbit, handheld sway, parallax), pacing over ${dur} seconds with a clear start and end state, and mood. Keep the same character, outfit, place and art style as the still image, do not add new people or text, no cuts, no morphing, no fast flashing. ${chars?'Characters:\n'+chars:''}\nOutput exactly one line per frame, nothing else: NNN. prompt`;
try{for(let i=0;i<ks.length;i+=6){const part=ks.slice(i,i+6);part.forEach(k=>{P.anim[k]=P.anim[k]||{t:'',d:dur};P.anim[k].d=dur;P.anim[k].t=''});animRender();
const list=part.map(k=>`${pad3(k)}: ${P.frames[k-1]}\nStill image prompt: ${P.prompts[k-1]||'(none)'}`).join('\n\n');
let txt='';for(let at=0;at<3&&!txt;at++){try{txt=await ai(list,{system:sys,temperature:0.8,maxTokens:8000})}catch(er){if(at==2)throw er}}
txt.split('\n').forEach(l=>{const m=l.match(/^[\s*`#>\-]*(\d{1,4})\s*[.):\-–—]?\s*\**\s*(.{12,})/);if(m&&P.anim[+m[1]]&&part.includes(+m[1]))P.anim[+m[1]].t=m[2].replace(/\*\*/g,'').trim()});
part.forEach(k=>{if(!P.anim[k].t)P.anim[k].t=`Slow cinematic push-in on the scene, ${P.frames[k-1].slice(0,80)}. Subtle natural movement of the subject, hair and cloth, gentle background parallax, ${dur} seconds, same style, no cuts, no text`});save();animRender()}
toast(ks.length+' ta animatsiya prompti tayyor')}catch(er){toast(er.message,1)}finally{btn.disabled=false;animRender()}};
$('#promptStop').onclick=()=>pAbort?.abort();
$('#promptBtn').onclick=async()=>{if(!aiReady()){toast('AI kaliti kerak. Yoki "Boshqa AI" ni tanlab promptlarni joylang',1);return}
if(!P.frames?.length){toast('Avval ssenariy kerak',1);return}
const stock=(tplOf(P.tpl).need||[]).includes('stock');const n=P.frames.length;const nb=Math.ceil(n/BLOCK);
pAbort=new AbortController();window._pFb=0;window._pQ=0;$('#promptBtn').hidden=true;$('#promptStop').hidden=false;
const chars=(P.refs.chars||[]).filter(c=>c.desc).map(c=>Object.assign({},c,{desc:cleanDNA(c.desc)}));
try{for(let bi=0;bi<nb;bi++){const a=bi*BLOCK+1,b=Math.min(n,(bi+1)*BLOCK);
for(let attempt=0,fl=0;attempt<40;attempt++){const all=[];for(let k=a;k<=b;k++)if(!P.prompts[k-1])all.push(k);if(!all.length)break;const missing=all.slice(0,[12,6,3,1][Math.min(fl,3)]);
$('#stAside').innerHTML=`<span class="chip"><span class="spin"></span> Blok ${bi+1}/${nb} · ${missing.length} ta qoldi</span>`;
const list=missing.map(k=>{const loc=locFor(k);return `${pad3(k)}: ${P.frames[k-1]}${loc?` [joy: ${loc.name}]`:''}`}).join('\n');
const T=tplOf(P.tpl);const sys=T.img&&!stock?docImgSys(T,chars):stock?`You write stock-footage search phrases. For each line return a short English search phrase (3-6 words) that a stock site (Pexels/Pixabay) would match for that sentence. Format exactly: NNN. phrase`:
`You are an expert image prompt writer for AI image generators (Google Flow / Imagen, Midjourney). Write ONE prompt per frame, in English, describing exactly what is said in that frame's sentence.
Rules: start every prompt with the style: "${effStyle().p}". Then the concrete scene: who, doing what, where, camera angle (vary: wide, medium, close-up, over-the-shoulder, low angle, top-down), lighting, mood. End with "${aspect()}, no text, no captions, no watermark".
${chars.length?'Characters (copy the exact description whenever the character appears):\n'+chars.map(c=>`- ${c.name}: ${c.desc}`).join('\n'):''}
${(P.refs.locs||[]).filter(l=>l.desc).length?'Locations (copy the description when the frame happens there):\n'+P.refs.locs.filter(l=>l.desc).map(l=>`- ${l.name}${l.range?' ('+l.range+')':''}: ${l.desc}`).join('\n'):''}
POSE & EXPRESSION (critical): the character DNA below describes ONLY the permanent look. Ignore any pose, gesture or expression that appears in a reference picture or inside a DNA text. For EVERY frame first decide the action and emotion from that frame's sentence (running, closing a door, climbing stairs, arguing, pointing, laughing, carrying, falling...), then draw exactly that body language and face. Never repeat the same pose in two consecutive frames; hands on head / holding head is allowed ONLY when the sentence itself is about shock or headache. If the sentence has no character action, show the scene or object instead of the character.
Avoid violent or graphic words (use neutral wording). Keep each prompt 40-90 words.
Output format, exactly one line per frame, nothing else: NNN. prompt`;
let txt='';try{txt=window._pLast=await ai(`Frames:\n${list}`,{system:sys,temperature:0.8,maxTokens:fl%2?8000:30000,signal:pAbort.signal,onText:(_,full)=>{const got=(full.match(/^\s*\d{1,4}\s*[.)]/gm)||[]).length;$('#stAside').innerHTML=`<span class="chip"><span class="spin"></span> Blok ${bi+1}/${nb} · ${got}/${missing.length} yozildi</span>`;
const now=Date.now();if(now-(window._pLive||0)>900){window._pLive=now;const done=full.split('\n').slice(0,-1);for(const l of done){const m=l.match(/^[\s*`#>\-]*(\d{1,4})\s*[.):\-–—]?\s*\**\s*(.{8,})/);if(m&&+m[1]>=a&&+m[1]<=b)P.prompts[+m[1]-1]=m[2].replace(/\*\*/g,'').trim()}
const ta=$$('#blocks .blk textarea')[bi];if(ta){ta.value=blockText(bi);const blk=ta.closest('.blk');if(blk&&!blk.classList.contains('open'))blk.classList.add('open')}const have=P.prompts.filter((x,i)=>i<n&&x).length;const ch=$$('#pStats .chip .num')[1];if(ch)ch.textContent=have}}})}catch(er){if(/limit(i)? tugagan|quota|429/i.test(er.message)&&!pAbort.signal.aborted&&(window._pQ=(window._pQ||0)+1)<=2){toast('Limit: 20 soniya kutib qayta uriniladi…',1);await new Promise(r=>setTimeout(r,20000));continue}if(pAbort.signal.aborted||/limit(i)? tugagan|quota|429/i.test(er.message)||fl>5||/API key|401|403|nauthor|ermission/.test(er.message))throw er;window._pLast='XATO: '+er.message;fl++;await new Promise(r=>setTimeout(r,2500*fl));continue}
for(const l of txt.split('\n')){const m=l.match(/^[\s*`#>\-]*(\d{1,4})\s*[.):\-–—]?\s*\**\s*(.{8,})/);if(m&&+m[1]>=a&&+m[1]<=b)P.prompts[+m[1]-1]=m[2].replace(/\*\*/g,'').trim()}
if(!missing.some(k=>P.prompts[k-1])){const ls=txt.split('\n').map(x=>x.replace(/^[\s*`#>\-]*\d{0,4}\s*[.):\-–—]?\s*\**\s*/,'').trim()).filter(x=>x.length>40&&!/^(I can|I.m sorry|Sorry|I cannot|I am unable|Unable to|As an AI)/i.test(x));if(ls.length>=missing.length)missing.forEach((k,i)=>P.prompts[k-1]=ls[i])}fl=missing.some(k=>P.prompts[k-1])?0:fl+1;if(fl>5){if(++window._pFb>3)throw new Error('AI prompt qaytarmayapti: '+String(window._pLast||'(bo\'sh)').slice(0,150));missing.forEach(k=>P.prompts[k-1]=P.prompts[k-1]||styleOf(P.style).p+'. '+P.frames[k-1]+'. '+aspect()+', no text, no captions, no watermark');fl=0}save()}
renderStep5()}
{const mi=Array.from({length:n},(_,i)=>P.prompts[i]).filter(x=>!x).length;mi?toast(mi+' ta prompt yozilmadi. AI javobi: '+String(window._pLast||'(bo\'sh javob)').slice(0,200),1):toast(window._pFb?'Promptlar tayyor ('+window._pFb+' ta oddiy usulda)':'Promptlar tayyor')}}catch(e){toast(pAbort.signal.aborted?'To\'xtatildi':e.message,!pAbort.signal.aborted)}
$('#promptBtn').hidden=false;$('#promptStop').hidden=true;$('#stAside').innerHTML='';renderStep5();save()};

const IMG_RE=/\.(png|jpe?g|webp|bmp|gif|mp4|mov|webm|m4v)$/i, AUD_RE=/\.(mp3|wav|m4a|ogg|aac|flac|opus|wma)$/i;
async function filesFromDrop(dt){const out=[];const items=[...(dt.items||[])];
const walk=async(entry,pre)=>{if(entry.isFile){await new Promise(r=>entry.file(f=>{out.push(f);r()},r))}else if(entry.isDirectory){const rd=entry.createReader();let batch;do{batch=await new Promise(r=>rd.readEntries(r,()=>r([])));for(const e of batch)await walk(e)}while(batch.length)}};
if(items.length&&items[0].webkitGetAsEntry){for(const it of items){const e=it.webkitGetAsEntry();if(e)await walk(e)}}else out.push(...dt.files);return out}
function bindDrop(el,handler){el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drag')});el.addEventListener('dragleave',()=>el.classList.remove('drag'));
el.addEventListener('drop',async e=>{e.preventDefault();el.classList.remove('drag');handler(await filesFromDrop(e.dataTransfer))})}
async function refreshImages(){const L=await api(`/api/projects/${P.id}/media?kind=images&hash=1`);P.media.images=L;return L}
async function uploadImages(files,progEl,nameEl){files=[...files].filter(f=>IMG_RE.test(f.name));if(!files.length){toast('Rasm topilmadi (PNG, JPG, WEBP, MP4)',1);return}
let clear=false;if(P.media.images?.length){const r=await new Promise(res=>modal('Rasmlar bor',`<p class="sub" style="font-size:14px">Loyihada ${P.media.images.length} ta rasm bor. Yangilarini nima qilamiz?</p><div class="row"><button class="primary sm" id="rpA" type="button">Eskilarini almashtirish</button><button class="pill" id="rpB" type="button">Qo'shib qo'yish</button><button class="pill" id="rpC" type="button">Bekor qilish</button></div>`,b=>{b.querySelector('#rpA').onclick=()=>{closeModal();res('r')};b.querySelector('#rpB').onclick=()=>{closeModal();res('a')};b.querySelector('#rpC').onclick=()=>{closeModal();res('')}}));if(!r)return;clear=r==='r'}
if(clear)await api(`/api/projects/${P.id}/delete-media?kind=images&all=1`,{method:'POST'});
const NM=new Map();
if(!clear&&P.media.images?.length){/* qo'shish: yangilar eskilarining davomidan raqamlanadi */const mx=Math.max(0,...P.media.images.map(i=>i.num>=0?i.num:0));
[...files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})).forEach((f,k)=>NM.set(f,pad3(mx+k+1)+((f.name.match(/\.\w+$/)||['.png'])[0]).toLowerCase()))}
progEl.hidden=false;let done=0;const q=[...files];const used=new Set();
const worker=async()=>{while(q.length){const f=q.shift();let name=NM.get(f)||f.name;if(used.has(name))name=name.replace(/(\.\w+)$/,`_${done}$1`);used.add(name);
try{await upload('images',f,{name})}catch(e){toast(f.name+': '+e.message,1)}done++;progEl.firstElementChild.style.width=(done/files.length*100)+'%';if(nameEl)nameEl.textContent=`Yuklanmoqda: ${done} / ${files.length}`}};
await Promise.all([worker(),worker(),worker()]);progEl.hidden=true;await refreshImages();markMediaChanged();toast(`${files.length} ta rasm qo'shildi`)}
async function uploadAudioFile(f,kind='audio'){if(!AUD_RE.test(f.name)&&!f.type.startsWith('audio')){toast('Bu audio fayl emas',1);return}
toast('Yuklanmoqda…');const r=await upload(kind,f,{clear:kind!=='sfx'});
if(kind==='audio'){if(!r.duration){toast('Audio uzunligi aniqlanmadi: '+(r.probeError||'video dvigateli hali tayyor emas'),1)}P.media.audio={rel:r.rel,name:r.name,duration:r.duration||0}}
else if(kind==='music')P.media.music={rel:r.rel,name:r.name,duration:r.duration||0};
markMediaChanged();save();return r}
function markMediaChanged(){if(P.tl){P.tl.stale=true;delete P.tl.aseg}if(S.screen==='s-studio'&&S.cur===6)renderStep6();if(S.screen==='s-import')renderImport();save()}
function sortedImages(){const L=[...(P.media.images||[])];const s=P.sort||'num';
if(s==='name')L.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));else if(s==='time')L.sort((a,b)=>a.mod-b.mod);
else L.sort((a,b)=>(a.num<0?1e9:a.num)-(b.num<0?1e9:b.num)||a.name.localeCompare(b.name,undefined,{numeric:true}));return L}
function checksHTML(){const imgs=sortedImages();const out=[];const fr=P.frames?.length||0;
const ck=(cls,b,t)=>out.push(`<div class="ck"><i class="dot ${cls}"></i><div><b>${b}</b> ${t||''}</div></div>`);
if(!imgs.length)ck('warn','Rasm yo\'q.','Papkani tanlang yoki tashlang.');
else{if(fr&&imgs.length!==fr)ck('warn',`${imgs.length} ta rasm, ${fr} ta kadr.`,'Soni teng emas. Dastur rasmlarni gaplarga baribir moslaydi, lekin kadr matni bilan to\'g\'ri kelishi uchun soni teng bo\'lgani yaxshi.');else if(fr)ck('ok',`${imgs.length} ta rasm, ${fr} ta kadr.`,'Soni teng.');else ck('ok',`${imgs.length} ta rasm.`,'');
const byHash={};imgs.forEach(i=>{if(i.hash)(byHash[i.hash]=byHash[i.hash]||[]).push(i.name)});const dups=Object.values(byHash).filter(a=>a.length>1);
if(dups.length)ck('warn','Bir xil rasmlar:',dups.slice(0,5).map(a=>a.join(' = ')).join('; ')+(dups.length>5?` va yana ${dups.length-5}`:'')+'. Ortiqchasini o\'chiring, aks holda ikki marta chiqadi.');
if((P.sort||'num')==='num'){const nums=imgs.map(i=>i.num).filter(n=>n>=0);const noNum=imgs.filter(i=>i.num<0).map(i=>i.name);
if(noNum.length)ck('warn',`Nomida raqam yo'q (${noNum.length} ta):`,noNum.slice(0,5).join(', ')+'. Ular oxiriga qo\'yiladi.');
if(nums.length){const mx=Math.max(...nums),mn=Math.min(...nums);const set=new Set(nums);const miss=[];for(let k=mn;k<=mx&&miss.length<30;k++)if(!set.has(k))miss.push(pad3(k));if(miss.length)ck('err','Yetishmayapti:',miss.slice(0,15).join(', ')+(miss.length>15?' …':'')+'. Shu raqamli promptlarni qayta yarating yoki oldingi rasm cho\'zilib turadi.');
const dn=nums.filter((n,i)=>nums.indexOf(n)!==i);if(dn.length)ck('warn','Raqami takrorlangan:',[...new Set(dn)].slice(0,10).map(pad3).join(', '))}}}
const a=P.media.audio;if(!a)ck('warn','Ovoz yo\'q.','Ovoz yarating yoki faylni tanlang.');else ck(a.duration?'ok':'err',`Ovoz: ${esc(a.name)} · ${a.duration?fmt(a.duration):'uzunligi aniqlanmadi'}.`,a.duration&&imgs.length?`Har rasmga o'rtacha ${(a.duration/imgs.length).toFixed(1)} soniya.`:'');
if(P.media.music)ck('ok','Fon musiqasi:',esc(P.media.music.name));
if(P.tl&&!P.tl.stale)ck('ok','Timeline tayyor.','Montajga o\'tsangiz shu holatda ochiladi.');else if(P.tl)ck('warn','Materiallar o\'zgardi.','Montajga o\'tganda timeline qayta yig\'iladi.');
return out.join('')}
function ttsPlayerUpd(){const p=$('#ttsPlayer');if(!p)return;if(P?.media?.audio){const u=purl(P.media.audio.rel);if(p.dataset.u!==u){p.dataset.u=u;p.src=u}p.hidden=false}else{p.hidden=true;p.removeAttribute('src');p.dataset.u=''}}
function renderStep6(){ttsPlayerUpd();voiceBtn&&voiceBtn();const a=P.media.audio,imgs=P.media.images||[];
$('#audName').textContent=a?a.name:'Ovoz faylini tanlang yoki tashlang';$('#audInfo').textContent=a?`${fmt(a.duration)} · uzunlik faylning o'zidan o'lchandi`:'MP3, WAV, M4A';
$('#dropAudio').classList.toggle('done',!!a);$('#wave').innerHTML=a?Array.from({length:70},(_,i)=>`<i style="height:${18+Math.abs(Math.sin(i*1.7)*Math.cos(i*.31))*82}%"></i>`).join(''):'';
$('#imgName').textContent=imgs.length?`${imgs.length} ta rasm`:'Rasmlarni tanlang yoki shu yerga tashlang';$('#imgInfo').textContent=imgs.length?sortedImages().slice(0,3).map(i=>i.name).join(', ')+(imgs.length>3?' …':''):'PNG, JPG, WEBP, MP4 · istalgan nom';
$('#dropImgs').classList.toggle('done',imgs.length>0);
$('#ttsVoice').innerHTML=VOICES.map(v=>`<option value="${v[0]}" ${v[0]===(P.voice||'Charon')?'selected':''}>${v[0]} · ${v[1]}</option>`).join('');$('#ttsStyle').value=P.ttsStyle||$('#ttsStyle').value;
$$('#alignMode .pill').forEach(x=>x.classList.toggle('on',x.dataset.a===(P.align||'smart')));$$('#sortMode .pill').forEach(x=>x.classList.toggle('on',x.dataset.s===(P.sort||'num')));
$('#checks').innerHTML=checksHTML();
$('#musicPick').textContent=P.media.music?'Musiqa: '+P.media.music.name:'Fon musiqasi';mediaDelRow();$('#sfxPick').textContent=P.media.sfx?.length?`Effektlar: ${P.media.sfx.length} ta`:'O\'z effektlarim'}
$('#audFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)uploadAudioFile(f).then(()=>renderStep6()).catch(er=>toast(er.message,1))};
$('#imgFiles').onchange=e=>{const f=[...e.target.files];e.target.value='';uploadImages(f,$('#upProg'),$('#imgName'))};
$('#dirFiles').onchange=e=>{const f=[...e.target.files];e.target.value='';uploadImages(f,$('#upProg'),$('#imgName'))};
async function pickNative(){/* Windows'ning o'z papka oynasi: brauzer "Upload?" so'rovi chiqmaydi */
let j;try{const r=await fetch('/__fc/pickfolder',{method:'POST',headers:{'X-FC-Token':TOKEN}});if(!r.ok)return undefined;j=await r.json()}catch(_){return undefined}
if(!j.ok){if(j.message)toast(j.message,1);return null}if(!j.files.length){toast('Bu papkada rasm topilmadi',1);return null}
const out=[];toast(j.files.length+' ta rasm o\'qilmoqda…');for(const f of j.files){const b=await (await fetch('/__fc/file?name='+encodeURIComponent(f.name)+'&t='+TOKEN)).blob();out.push(new File([b],f.name,{type:b.type||'image/png'}))}return out}
$('#pickFolder').onclick=()=>$('#imgFiles').click();

/* yuklangan narsalarni o'chirish */
const TRASH='<svg class="i" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
function mediaDelRow(){const b=$('#mediaDel');if(!b)return;const m=P.media,h=[];
if(m.images?.length)h.push(`<button class="pill sm" type="button" data-md="img">Rasmlarni ko'rish va o'chirish</button>`);
if(m.audio)h.push(`<button class="pill sm" type="button" data-md="aud">${TRASH} Ovozni o'chirish</button>`);
if(m.music)h.push(`<button class="pill sm" type="button" data-md="mus">${TRASH} Musiqani o'chirish</button>`);
if(m.sfx?.length)h.push(`<button class="pill sm" type="button" data-md="sfx">${TRASH} Effektlarni o'chirish</button>`);
b.innerHTML=h.join('');b.hidden=!h.length}
async function dropImages(keep){/* qolganlarini qayta yozadi: yadroda bittalab o'chirish yo'q */
const kept=[];for(const im of keep){const bl=await (await fetch(purl(im.rel))).blob();kept.push(new File([bl],im.name,{type:bl.type||'image/png'}))}
await api(`/api/projects/${P.id}/delete-media?kind=images&all=1`,{method:'POST'});
for(const f of kept){try{await upload('images',f,{name:f.name})}catch(e){toast(f.name+': '+e.message,1)}}
await refreshImages();markMediaChanged();renderStep6()}
function imgManager(){const L=sortedImages();const sel=new Set();
modal('Rasmlar · '+L.length+' ta',`<p class="sub" style="font-size:13.5px">Keraksizlarini belgilang va o'chiring. Qolganlari tartibi o'zgarmaydi.</p>
<div class="imgm" id="imgM">${L.map((im,i)=>`<button type="button" class="imgm-i" data-ix="${i}" title="${esc(im.name)}"><img src="${purl(im.rel,1)}" loading="lazy" alt=""><span>${esc(im.name)}</span></button>`).join('')}</div>
<div class="row" style="margin-top:12px;justify-content:space-between"><div class="row"><button class="pill sm" type="button" id="imSelAll">Hammasini belgilash</button><span class="note" id="imCnt">0 ta belgilandi</span></div><div class="row"><button class="pill sm" type="button" id="imCancel">Yopish</button><button class="primary sm" type="button" id="imDel" disabled>O'chirish</button></div></div>`,box=>{
const upd=()=>{box.querySelector('#imCnt').textContent=sel.size+' ta belgilandi';box.querySelector('#imDel').disabled=!sel.size;box.querySelectorAll('[data-ix]').forEach(x=>x.classList.toggle('on',sel.has(+x.dataset.ix)))};
box.querySelector('#imgM').onclick=e=>{const b=e.target.closest('[data-ix]');if(!b)return;const i=+b.dataset.ix;sel.has(i)?sel.delete(i):sel.add(i);upd()};
box.querySelector('#imSelAll').onclick=()=>{if(sel.size===L.length)sel.clear();else L.forEach((_,i)=>sel.add(i));upd()};
box.querySelector('#imCancel').onclick=closeModal;
box.querySelector('#imDel').onclick=async()=>{const n=sel.size;closeModal();toast('O\'chirilmoqda…');try{if(n===L.length){await api(`/api/projects/${P.id}/delete-media?kind=images&all=1`,{method:'POST'});await refreshImages();markMediaChanged();renderStep6()}else await dropImages(L.filter((_,i)=>!sel.has(i)));toast(n+' ta rasm o\'chirildi')}catch(e){toast(e.message,1)}}})}
$('#mediaDel').addEventListener('click',async e=>{const b=e.target.closest('[data-md]');if(!b)return;const k=b.dataset.md;
if(k==='img'){imgManager();return}
const nm={aud:'Ovoz',mus:'Musiqa',sfx:'Effektlar'}[k];if(!await confirmBox(nm+' o\'chirilsinmi?','Loyihadan olib tashlanadi. Keyin boshqasini yuklashingiz mumkin.','O\'chirish'))return;
if(k==='aud'){P.media.audio=null;if(P.tl)P.tl.stale=true}if(k==='mus')P.media.music=null;if(k==='sfx')P.media.sfx=[];
if(P.tl?.aseg){if(k==='aud')delete P.tl.aseg.voice;if(k==='mus')delete P.tl.aseg.music}
save();markMediaChanged();renderStep6();toast(nm+' o\'chirildi')});
$('#musicPick').onclick=()=>$('#musicFile').click();$('#musicFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)uploadAudioFile(f,'music').then(()=>{renderStep6();toast('Musiqa qo\'shildi')})};
$('#sfxPick').onclick=()=>$('#sfxFiles').click();$('#sfxFiles').onchange=async e=>{const fs=[...e.target.files];e.target.value='';P.media.sfx=P.media.sfx||[];for(const f of fs){try{const r=await upload('sfx',f);P.media.sfx.push({rel:r.rel,name:r.name})}catch(er){toast(er.message,1)}}save();renderStep6();toast(fs.length+' ta effekt qo\'shildi. Nomida whoosh, pop, camera, click bo\'lsa, mos o\'tishga qo\'yiladi')};
bindDrop($('#dropAudio'),fs=>{const f=fs.find(f=>AUD_RE.test(f.name));if(f)uploadAudioFile(f).then(()=>renderStep6())});
bindDrop($('#dropImgs'),fs=>uploadImages(fs,$('#upProg'),$('#imgName')));
$('#alignMode').dataset.own=1;$('#alignMode').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;P.align=b.dataset.a;markMediaChanged()});
$('#sortMode').dataset.own=1;$('#sortMode').addEventListener('click',e=>{const b=e.target.closest('[data-s]');if(!b)return;P.sort=b.dataset.s;markMediaChanged()});
$('#ttsVoice').onchange=e=>{P.voice=e.target.value;save()};$('#ttsStyle').oninput=e=>{P.ttsStyle=e.target.value;save()};
$('#ttsHear').onclick=()=>modal('Ovozlar',`<p class="sub" style="font-size:14px;line-height:1.6">Ovozlarni AI Studio'da eshitib ko'ring, keyin nomini shu yerda tanlang.</p><div class="mlist">${VOICES.map(v=>`<div class="mrow"><div class="grow"><b>${v[0]}</b><small>${v[1]}</small></div></div>`).join('')}</div><a class="pill sm" href="https://aistudio.google.com/generate-speech" target="_blank" rel="noopener">AI Studio'da eshitish</a>`);
$('#ttsCopy').onclick=()=>copyText(stripHeads(P.script).trim());
let ttsAbort=null;

/* ===== Ovoz: faqat o'qiladigan gaplar, bir xil ohang, katta bo'laklar ===== */
function speechText(src){const out=[];let skip=false;
for(let raw of String(src||'').replace(/\r/g,'').split('\n')){let l=raw.trim();if(!l)continue;
if(/^#{1,6}\s/.test(l)||/^[-=*_~]{3,}$/.test(l))continue;
if(/^\*{0,2}\s*(\d+[.)]\s*)?(bo['‘’`]?lim|qism|kirish|xulosa|part|chapter|section|intro|outro|hook|sahna|scene)\b[^.!?]{0,60}[:：]?\s*\*{0,2}$/i.test(l))continue;
if(/^\[[^\]]*\]$|^\([^)]*\)$/.test(l))continue;
l=l.replace(/\[[^\]]*\]|\{[^}]*\}/g,' ').replace(/^\s*[-*•>]+\s+/,'').replace(/^\s*\d+[.)]\s+/,'').replace(/[*_`#~|<>]/g,'').replace(/\p{Extended_Pictographic}/gu,'').replace(/\s+/g,' ').trim();
if(l.length<2||!/[\p{L}\p{N}]/u.test(l))continue;
if(/^[^.!?…]{1,60}[:：]$/.test(l))continue;/* "Sarlavha:" kabi */
out.push(l)}return out.join('\n')}
function ttsSplit(text,limit){const out=[];let cur='';for(const s of text.split(/(?<=[.!?…])\s+|\n+/)){if(!s.trim())continue;if(cur&&(cur+' '+s).length>limit){out.push(cur.trim());cur=s}else cur+=' '+s}if(cur.trim())out.push(cur.trim());return out}
const TTS_STYLE_DEF='in a calm, warm, steady storytelling voice, keeping exactly the same pace, pitch and tone from start to finish';
function ttsLangEn(c){c=c||'uz';const M={uz:'Uzbek',uzc:'Uzbek',ru:'Russian',en:'English',tr:'Turkish',kk:'Kazakh',ky:'Kyrgyz',tg:'Tajik',tk:'Turkmen',az:'Azerbaijani',ar:'Arabic'};if(M[c])return M[c];try{return new Intl.DisplayNames(['en'],{type:'language'}).of(c)||'English'}catch(_){return 'English'}}
/* ovoz tili: Gemini matn tilini o'zi taxmin qilganda o'zbekchani inglizcha talaffuz qilib yuborardi — tilni aniq aytamiz */
function ttsDirective(){let s=($('#ttsStyle').value||'').trim();if(!s||/^hikoyachi kabi/i.test(s))s=TTS_STYLE_DEF;s=s.replace(/[:\n"]/g,' ').replace(/^say\s+/i,'').trim();
const c=P?.lang||'uz',L=ttsLangEn(c);let x='';
if(c==='uz')x=' Pronounce every word the Uzbek way, never with an English accent: q is a deep k, x is a throaty h, o\u2019 is a rounded o, g\u2019 is a soft guttural g, sh and ch as in Uzbek, and stress usually on the last syllable.';
else if(c==='uzc')x=' Pronounce every word the Uzbek way, never with a Russian or English accent.';
return `Read the following ${L} text aloud as a native ${L} speaker, in ${L} only, ${s}.${x} Text: `}
const TTSC=new Map();/* tayyor bo'laklar: limitda to'xtasa, qayta bosganda shu yerdan davom etadi */
async function ttsChunk(text,voice,model,keys,signal){const k=voice+'|'+text;if(TTSC.has(k))return TTSC.get(k);const p=await GM.tts(text,voice,signal);TTSC.set(k,p);return p}
function ttsLevel(pcm,target){/* jimlikni qirqish + bir xil balandlik */let a=0,b=pcm.length-1;const th=300;while(a<b&&Math.abs(pcm[a])<th)a++;while(b>a&&Math.abs(pcm[b])<th)b--;a=Math.max(0,a-480);b=Math.min(pcm.length-1,b+480);const s=pcm.slice(a,b+1);let e=0;for(let i=0;i<s.length;i+=4)e+=s[i]*s[i];const rms=Math.sqrt(e/Math.max(1,s.length/4))||1;const g=Math.min(4,target/rms);
for(let i=0;i<s.length;i++){const v=s[i]*g;s[i]=v>32000?32000:v<-32000?-32000:v}return s}
$('#ttsBtn').onclick=async()=>{if(ttsAbort){ttsAbort.abort();return}const text=speechText(P.script);if(!text){toast('Avval ssenariy kerak',1);return}
const a=aiCfg(),k=a.keys.gemini,keys=(Array.isArray(k)?k:[k]).map(x=>(x||'').trim()).filter(Boolean);if(!keys.length){toast('Avval Sozlamalarda Gemini kalitini kiriting',1);return}
const voice=P.voice||'Charon',model=CFG.ttsModel||'gemini-2.5-flash-preview-tts',pre=ttsDirective();
ttsAbort=new AbortController();$('#ttsBtn').textContent='To\'xtatish';$('#ttsProg').hidden=false;$('#ttsNote').textContent='Ovoz yaratilmoqda…';
try{const parts=ttsSplit(text,1600),rate=24000,gap=new Int16Array(Math.round(rate*0.28)),pcm=[];
for(let i=0;i<parts.length;i++){$('#ttsProg').firstElementChild.style.width=(i/parts.length*100)+'%';$('#ttsNote').textContent=`Ovoz yaratilmoqda: ${i+1} / ${parts.length}`;
pcm.push(ttsLevel(await ttsChunk(pre+parts[i],voice,model,keys,ttsAbort.signal),3200),gap)}
const n=pcm.reduce((s,p)=>s+p.length,0),buf=new ArrayBuffer(44+n*2),v=new DataView(buf),w=(o,t)=>[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
let o=44;for(const p of pcm)for(let i=0;i<p.length;i++,o+=2)v.setInt16(o,p[i],true);
const name='ovoz_'+new Date().toTimeString().slice(0,8).replace(/:/g,'')+'.wav';const r=await upload('audio',new File([buf],name,{type:'audio/wav'}),{clear:true,name});
P.media.audio={rel:r.rel,name:r.name||name,duration:r.duration||n/rate};markMediaChanged();$('#ttsNote').textContent='Ovoz tayyor: '+P.media.audio.name+' · '+fmt(P.media.audio.duration);toast('Ovoz tayyor · '+fmt(P.media.audio.duration))}
catch(e){toast(ttsAbort?.signal.aborted?'To\'xtatildi':e.message,!ttsAbort?.signal.aborted);$('#ttsNote').textContent=ttsAbort?.signal.aborted?'':e.message}
ttsAbort=null;$('#ttsBtn').textContent='Ovoz yaratish';$('#ttsProg').hidden=true;renderStep6()};

const tlSig=()=>JSON.stringify([(P.media.images||[]).map(i=>i.rel+i.size),P.media.audio?.rel,P.align,P.sort,(P.frames||[]).length]);
function defaultTL(){const t=tplOf(P.tpl);return{clips:[],els:[],mode:t.id==='news'?'m-static':'m-light',trans:'auto',transD:0.4,filter:{preset:'Asl',str:0.7,b:0,c:0,s:0,w:0},
sub:{on:true,preset:'pill',font:'Inter',size:17,weight:700,color:'#2b120a',accent:'#E0582A',outline:0,bg:'bg-pill',bgColor:'#fff1e6',pos:8,kw:false},
sb:{on:true,v:0,t:'',t2:'',pos:'lb'},audio:{voiceVol:100,musicVol:18,sfxMode:'all',sfxVol:45,duck:true},pps:8,...(t.sub?{_tsub:1}:{})}}
function tplSub(tl){const t=tplOf(P.tpl);if(t.sub&&tl._tsub){Object.assign(tl.sub,{bg:'',outline:3,color:'#ffffff'},t.sub);delete tl._tsub}return tl}
async function buildTimelineIfNeeded(){if(P.tl&&!P.tl.stale&&P.tl.sig===tlSig()&&P.tl.clips?.length)return true;
if(P.tl?.edited&&!await confirmBox('Timeline qayta yig\'iladi','Rasm yoki ovoz o\'zgardi. Kadrlar qayta joylanadi; filtr, subtitr va obuna sozlamalari saqlanadi.','Davom etish'))return !!P.tl?.clips?.length;
return buildTimeline()}

async function aiAlign(texts,rel){if(!GM.keys().length)throw new Error('Gemini kaliti yo\'q');
const ab=await (await fetch(purl(rel))).arrayBuffer();const ctx=new (window.AudioContext||window.webkitAudioContext)();let buf;try{buf=await ctx.decodeAudioData(ab)}finally{ctx.close&&ctx.close()}
const dur=buf.duration;if(dur>900)throw new Error('Ovoz 15 daqiqadan uzun');
const rate=dur>600?6000:8000,oc=new OfflineAudioContext(1,Math.ceil(dur*rate),rate),s=oc.createBufferSource();s.buffer=buf;s.connect(oc.destination);s.start();const out=(await oc.startRendering()).getChannelData(0);
const pcm=new Int16Array(out.length);for(let i=0;i<out.length;i++)pcm[i]=Math.max(-1,Math.min(1,out[i]))*32767;
const hd=new DataView(new ArrayBuffer(44)),w=(o,t)=>[...t].forEach((ch,i)=>hd.setUint8(o+i,ch.charCodeAt(0)));w(0,'RIFF');hd.setUint32(4,36+pcm.byteLength,true);w(8,'WAVEfmt ');hd.setUint32(16,16,true);hd.setUint16(20,1,true);hd.setUint16(22,1,true);hd.setUint32(24,rate,true);hd.setUint32(28,rate*2,true);hd.setUint16(32,2,true);hd.setUint16(34,16,true);w(36,'data');hd.setUint32(40,pcm.byteLength,true);
const bytes=new Uint8Array(44+pcm.byteLength);bytes.set(new Uint8Array(hd.buffer),0);bytes.set(new Uint8Array(pcm.buffer),44);let bin='';for(let i=0;i<bytes.length;i+=32768)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+32768));
const list=texts.map((t,i)=>`${i+1}. ${t}`).join('\n');
let st=null;for(let at=0;at<2&&!st;at++){const t=await GM.json({contents:[{parts:[{inlineData:{mimeType:'audio/wav',data:btoa(bin)}},{text:`Listen to this narration (length ${dur.toFixed(1)} seconds). Below are ${texts.length} numbered sentences in the order they are spoken. For each sentence give the exact second when the narrator starts saying it. Return ONLY a JSON array of ${texts.length} numbers, ascending, the first one near 0.\n\n${list}`}]}],generationConfig:{temperature:0,responseMimeType:'application/json'}},{label:'moslash'});
try{const m=t.match(/\[[\s\S]*\]/);const v=JSON.parse(m[0]).map(Number);if(v.length===texts.length&&v.every(x=>isFinite(x)&&x>=0&&x<=dur+1))st=v}catch(_){}}
if(!st)throw new Error('AI vaqtlarni qaytarmadi');
st[0]=0;let bad=0;for(let i=1;i<st.length;i++){if(st[i]<=st[i-1]+0.25){st[i]=st[i-1]+0.25;bad++}}if(bad>st.length/4)throw new Error('AI vaqtlari ishonchsiz chiqdi');
return{starts:st,dur}}
async function buildTimeline(){return timed('Montajni tayyorlash (jami)',buildTimeline0,{n:P.media?.images?.length})}
async function buildTimeline0(){const imgs=sortedImages();const a=P.media.audio;
if(!imgs.length){toast('Rasm yo\'q',1);return false}if(!a){toast('Ovoz yo\'q. Ovoz yarating yoki yuklang',1);return false}
const fr=P.frames||[];let texts=[];const n=imgs.length;
if(fr.length===n)texts=fr.slice();else if(fr.length){for(let i=0;i<n;i++){const s=Math.round(i*fr.length/n),e=Math.max(s+1,Math.round((i+1)*fr.length/n));texts.push(fr.slice(s,e).join(' '))}}
const starts=imgs.map(i=>i.time);
toast('Rasmlar ovozga moslanmoqda…');
let mode=P.align==='timecode'&&starts.every(x=>x>=0)?'timecode':(P.align||'smart'),st2=starts;
if(P.align==='ai'){try{if(!aiReady())throw new Error('AI kaliti yo\'q');toast('AI ovozni tinglab, vaqtlarni topmoqda…');if(texts.length!==n||texts.some(t=>!t))throw new Error('ssenariy kadrlari yo\'q');const x=await aiAlign(texts,a.rel);st2=x.starts;mode='timecode'}catch(er){toast('AI moslay olmadi ('+er.message+'). Aqlli rejim ishlatiladi',1);mode='smart'}}
const r=await api('/api/align',{method:'POST',body:{project:P.id,audio:a.rel,texts:texts.length?texts:[],count:n,mode,starts:st2}});
if(!r.ok){toast(r.message||'Moslab bo\'lmadi',1);return false}
const old=P.tl||tplSub(defaultTL());const tl=Object.assign(defaultTL(),old);delete tl._tsub;
tl.clips=imgs.map((im,i)=>({img:im.rel,d:r.durations[i],x:texts[i]||'',motion:'auto'}));
if(!old.els?.length){tl.els=[{id:'sb',k:'sub',s:Math.min(45,r.total*0.25),d:5}]}
tl.sig=tlSig();tl.stale=false;tl.edited=false;tl.total=r.total;P.tl=tl;P.media.audio.duration=r.total;save(true);
toast(`${n} ta rasm joylandi · ${r.silences} ta pauza topildi`);return true}

function renderImport(){const has=!!P&&P.imported;const imgs=has?P.media.images||[]:[];const a=has?P.media.audio:null;
$('#impName').value=has?P.name:($('#impName').value||'');$$('#impFmt .pill').forEach(x=>x.classList.toggle('on',x.dataset.f===(has?P.format:($('#impFmt .on')?.dataset.f||'long'))));
$('#impBox').innerHTML=`
  <div class="impc"><div class="row between"><div class="row" style="gap:10px"><span class="rc done" style="width:34px;height:34px;font-size:15px">1</span><h3>Ssenariy</h3></div><span class="chip">ixtiyoriy</span></div>
   <textarea class="input ta" id="impText" placeholder="Matnni shu yerga qo'ying. Har qator yoki har gap bitta kadr bo'ladi." style="min-height:140px">${esc(has?P.script:'')}</textarea>
   <label class="pill sm" style="align-self:flex-start">.txt / .srt fayldan<input type="file" accept=".txt,.srt,.md" hidden id="impTxtFile"></label>
   <div class="field"><span class="label">Kadrlarga qanday bo'linsin</span><div class="seg sm2" id="impSplit" data-own="1"><button class="pill ${(P?.impSplit||'line')==='line'?'on':''}" type="button" data-v="line">Har qator</button><button class="pill ${P?.impSplit==='sent'?'on':''}" type="button" data-v="sent">Har gap</button><button class="pill ${P?.impSplit==='auto'?'on':''}" type="button" data-v="auto">Rasm soniga qarab</button></div></div>
   <p class="note" id="impCount"></p></div>
  <div class="impc"><div class="row between"><div class="row" style="gap:10px"><span class="rc done" style="width:34px;height:34px;font-size:15px">2</span><h3>Rasmlar yoki videolar</h3></div><span class="chip ${imgs.length?'ok':''}">${imgs.length?'<i class="dot"></i>'+imgs.length+' ta':'kerak'}</span></div>
   <label class="dropz" id="impImgs"><b>${imgs.length?'Yana qo\'shish yoki almashtirish':'Papkani yoki rasmlarni shu yerga tashlang'}</b><span>PNG, JPG, WEBP, MP4 · fayl nomi qanday bo'lsa ham bo'ladi</span><input type="file" multiple accept="image/*,video/mp4" hidden id="impImgFiles"></label>
   <div class="row"><button class="pill sm" type="button" id="impDir">Rasmlarni tanlash</button></div><div class="prog" id="impProg" hidden><i></i></div>
   <div class="field"><span class="label">Tartibi</span><div class="seg sm2" id="impSort" data-own="1"><button class="pill ${(P?.sort||'num')==='num'?'on':''}" type="button" data-v="num">Nomidagi raqam</button><button class="pill ${P?.sort==='name'?'on':''}" type="button" data-v="name">Nomi</button><button class="pill ${P?.sort==='time'?'on':''}" type="button" data-v="time">Yuklangan vaqti</button></div></div></div>
  <div class="impc"><div class="row between"><div class="row" style="gap:10px"><span class="rc done" style="width:34px;height:34px;font-size:15px">3</span><h3>Ovoz</h3></div><span class="chip ${a?'ok':''}">${a?'<i class="dot"></i>'+fmt(a.duration):'kerak'}</span></div>
   <label class="dropz" id="impAud"><b>${a?esc(a.name):'Ovoz faylini tashlang yoki tanlang'}</b><span>MP3, WAV, M4A, OGG · uzunlik faylning o'zidan o'lchanadi</span><input type="file" accept="audio/*" hidden id="impAudFile"></label>
   <div class="field"><span class="label">Rasmlarni ovozga qanday qo'yamiz</span><div class="seg sm2" id="impAlign" data-own="1"><button class="pill ${(P?.align||'smart')==='smart'?'on':''}" type="button" data-v="smart">Gaplarga moslab (aqlli)</button><button class="pill ${P?.align==='equal'?'on':''}" type="button" data-v="equal">Teng bo'lib</button><button class="pill ${P?.align==='timecode'?'on':''}" type="button" data-v="timecode">Nomidagi vaqt bo'yicha</button></div></div></div>
  <div class="impc"><div class="row between"><div class="row" style="gap:10px"><span class="rc" style="width:34px;height:34px;font-size:15px">4</span><h3>Qo'shimcha</h3></div><span class="chip">ixtiyoriy</span></div>
   <div class="addg"><label><input type="file" accept="audio/*" hidden id="impMus"><span class="pill sm" style="width:100%">${P?.media?.music?'Musiqa: '+esc(P.media.music.name):'Fon musiqasi'}</span></label><label><input type="file" accept="audio/*" multiple hidden id="impSfx"><span class="pill sm" style="width:100%">${P?.media?.sfx?.length?'Effektlar: '+P.media.sfx.length:'O\'z effektlarim'}</span></label></div>
   ${has?`<div class="checks">${checksHTML()}</div>`:''}</div>`;
const cnt=()=>{const t=$('#impText').value;const n=impFrames(t).length;$('#impCount').textContent=t.trim()?`${n} ta kadr matni`+(imgs.length?` · ${imgs.length} ta rasm`:''):'Matn bo\'lmasa, video subtitrsiz yig\'iladi.'};cnt();
$('#impText').oninput=()=>{cnt();if(P&&P.imported){P.script=$('#impText').value;save()}};
$('#impTxtFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;let t=await f.text();if(/\.srt$/i.test(f.name))t=t.split(/\r?\n\r?\n/).map(b=>b.split(/\r?\n/).filter(l=>!/^\d+$/.test(l.trim())&&!/-->/.test(l)).join(' ')).filter(Boolean).join('\n');$('#impText').value=t;cnt();if(P&&P.imported){P.script=t;save()}};
const segv=(id,key)=>$(id).addEventListener('click',async e=>{const b=e.target.closest('[data-v]');if(!b)return;await ensureImportProject();P[key]=b.dataset.v;save();renderImport()});
segv('#impSplit','impSplit');segv('#impSort','sort');segv('#impAlign','align');
const imgH=async fs=>{await ensureImportProject();await uploadImages(fs,$('#impProg'),null);renderImport()};
$('#impImgFiles').onchange=e=>{const f=[...e.target.files];e.target.value='';imgH(f)};bindDrop($('#impImgs'),imgH);
$('#impDir').onclick=()=>{const inp=$('#imgFiles');inp.onchange=e=>{const f=[...e.target.files];e.target.value='';inp.onchange=ev=>{const g=[...ev.target.files];ev.target.value='';uploadImages(g,$('#upProg'),$('#imgName'))};imgH(f)};inp.click()};
const audH=async f=>{if(!f)return;await ensureImportProject();await uploadAudioFile(f);renderImport()};
$('#impAudFile').onchange=e=>{audH(e.target.files[0]);e.target.value=''};bindDrop($('#impAud'),fs=>audH(fs.find(f=>AUD_RE.test(f.name))));
$('#impMus').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;await ensureImportProject();await uploadAudioFile(f,'music');renderImport()};
$('#impSfx').onchange=async e=>{const fs=[...e.target.files];e.target.value='';await ensureImportProject();P.media.sfx=P.media.sfx||[];for(const f of fs){const r=await upload('sfx',f);P.media.sfx.push({rel:r.rel,name:r.name})}save();renderImport()}}
function impFrames(t){const mode=P?.impSplit||'line';t=String(t||'').trim();if(!t)return[];
if(mode==='sent')return splitSentences(t);
if(mode==='auto'){const n=P?.media?.images?.length||0;const s=splitSentences(t);if(!n)return s;const out=[];for(let i=0;i<n;i++){const a=Math.round(i*s.length/n),b=Math.max(a+1,Math.round((i+1)*s.length/n));out.push(s.slice(a,b).join(' '))}return out}
return t.split(/\r?\n/).map(l=>l.replace(/^\s*\d{1,4}\s*[.):\-]\s*/,'').trim()).filter(l=>l&&!/^##/.test(l))}
async function ensureImportProject(){if(P&&P.imported)return P;await newProject({name:$('#impName').value.trim()||'Import qilingan video',format:$('#impFmt .on')?.dataset.f||'long',imported:true,step:6,tpl:'top'});P.imported=true;save();return P}
$('#impName').addEventListener('input',e=>{if(P&&P.imported){P.name=e.target.value;save()}});
$('#impFmt').dataset.own=1;$('#impFmt').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;$$('#impFmt .pill').forEach(x=>x.classList.toggle('on',x===b));if(P&&P.imported){P.format=b.dataset.f;save()}});
$('#impGo').onclick=async()=>{await ensureImportProject();P.name=$('#impName').value.trim()||P.name;P.script=$('#impText').value;P.frames=impFrames(P.script);
if(!P.media.images?.length||!P.media.audio){toast('Rasmlar va ovoz kerak',1);return}
if(await buildTimeline()){P.step=7;go(7)}};

/* =====================================================================
EDITOR
===================================================================== */
const E={selEl:null,t:0,playing:false,sel:0,hist:[],fut:[],curEl:undefined,q:'',lastClip:-1};
const IC={lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',img:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',txt:'<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',star:'<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.8 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',note:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',play:'<path d="M8 5l11 7-11 7z"/>',pause:'<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>'};
const isv=k=>`<svg viewBox="0 0 24 24">${IC[k]}</svg>`;
const TL=()=>P.tl;
const clips=()=>P.tl.clips;
const starts=()=>{let t=0;return clips().map(c=>{const s=t;t+=c.d;return s})};
const total=()=>clips().reduce((a,c)=>a+c.d,0);
function clipAt(t){let acc=0;const C=clips();for(let i=0;i<C.length;i++){acc+=C[i].d;if(t<acc)return i}return C.length-1}
const isVid=r=>/\.(mp4|mov|webm|m4v)$/i.test(r||'');
const voiceEl=$('#voiceEl'),musicEl=$('#musicEl'),stage=$('#stage'),subo=$('#subo');
const HW=104;

function openEditor(){const _t0=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>dlog('ui','Montaj oynasi ochilishi',{ms:performance.now()-_t0,x:{clips:P.tl?.clips?.length}})));show('s-editor');P.tl=Object.assign(defaultTL(),P.tl);P.tl.sub=Object.assign(defaultTL().sub,P.tl.sub);P.tl.sb=Object.assign(defaultTL().sb,P.tl.sb);P.tl.audio=Object.assign(defaultTL().audio,P.tl.audio);P.tl.filter=Object.assign(defaultTL().filter,P.tl.filter);
$('#edTitle').textContent=P.name;$('#edMeta').textContent=`${clips().length} kadr · ${fmt(total())} · ${P.format==='short'?'9:16':'16:9'}`;
$('#ed2').classList.toggle('fmt-short',P.format==='short');
voiceEl.src=P.media.audio?purl(P.media.audio.rel):'';musicEl.src=P.media.music?purl(P.media.music.rel):'';
E.t=Math.min(E.t,total()-0.05);if(E.sel>=clips().length)E.sel=0;E.hist=[];E.fut=[];
syncControls();rAll();requestAnimationFrame(()=>{fit();follow()});loadWave()}
function syncControls(){const T=TL();
$$('#modes .mode').forEach(x=>x.classList.toggle('on',x.dataset.m===T.mode));stage.className='stage '+T.mode;$('#iMot').textContent=$(`#modes [data-m="${T.mode}"]`)?.dataset.n||'';
$$('#transSel .pill').forEach(x=>x.classList.toggle('on',x.dataset.v===T.trans));$('#trD').value=Math.round(T.transD*10);$('#trDv').textContent=T.transD.toFixed(1)+' s';
const s=T.sub;$('#subSw').classList.toggle('on',s.on);$('#ccBtn').classList.toggle('on',s.on);$$('#presets .pre').forEach(x=>x.classList.toggle('on',x.dataset.s===s.preset));
$('#sFont').value=s.font;$('#sSize').value=s.size;$('#sW').value=s.weight;$('#sO').value=s.outline;$('#pos').value=s.pos;
$$('#sBg .pill').forEach(x=>x.classList.toggle('on',x.dataset.b===s.bg));
$('#fp').value=Math.round(T.filter.str*100);['b','c','s','w'].forEach(k=>$('#a'+k.toUpperCase()).value=T.filter[k]);
const a=T.audio;$('#vVol').value=a.voiceVol;$('#mVol').value=a.musicVol;$('#sfxVol').value=a.sfxVol;$('#duckSw').classList.toggle('on',a.duck);$$('#sfxMode .pill').forEach(x=>x.classList.toggle('on',x.dataset.sfx===a.sfxMode));
$('#sbOn').classList.toggle('on',T.sb.on);{const se=(T.els||[]).find(x=>x.k==='sub'),v=Math.round(((se&&se.sc)||1)*100);if($('#sbSc')){$('#sbSc').value=v;$('#sbScV').textContent=v+'%'}}$('#sbText').value=T.sb.t||'';if($('#sbLangSel'))$('#sbLangSel').value=T.sb.lang||'';$('#sbText2').value=T.sb.t2||'';$$('#sbPos .pill').forEach(x=>x.classList.toggle('on',x.dataset.p===T.sb.pos));
$('#zoom').value=T.pps;renderFilters();renderSwatches();setSubVars();volUpd();rSb();rEls();rIdeas()}
function edited(){P.tl.edited=true;$('#edMeta').textContent=`${clips().length} kadr · ${fmt(total())} · ${P.format==='short'?'9:16':'16:9'}`;save()}
function snap(){E.hist.push(JSON.stringify({c:P.tl.clips,e:P.tl.els,a:P.tl.aseg||null}));if(E.hist.length>80)E.hist.shift();E.fut=[]}
function undo(){if(!E.hist.length){toast('Qaytaradigan narsa yo\'q');return}E.fut.push(JSON.stringify({c:P.tl.clips,e:P.tl.els,a:P.tl.aseg||null}));const s=JSON.parse(E.hist.pop());P.tl.clips=s.c;P.tl.els=s.e;if(s.a)P.tl.aseg=s.a;else delete P.tl.aseg;E.sel=Math.min(E.sel,clips().length-1);rAll();edited();toast('Bekor qilindi')}
function redo(){if(!E.fut.length){toast('Oldinga qaytaradigan narsa yo\'q');return}E.hist.push(JSON.stringify({c:P.tl.clips,e:P.tl.els,a:P.tl.aseg||null}));const s=JSON.parse(E.fut.pop());P.tl.clips=s.c;P.tl.els=s.e;if(s.a)P.tl.aseg=s.a;else delete P.tl.aseg;rAll();edited();toast('Qaytarildi')}
$('#undoB').onclick=undo;$('#redoB').onclick=redo;

let WAVE={voice:null,music:null};
async function peaksOf(url){const buf=await (await fetch(url)).arrayBuffer();const ctx=new OfflineAudioContext(1,8000,8000);const ab=await ctx.decodeAudioData(buf);const ch=ab.getChannelData(0);const per=Math.floor(ab.sampleRate/50);const out=new Float32Array(Math.ceil(ch.length/per));
for(let i=0;i<out.length;i++){let m=0;const e=Math.min(ch.length,(i+1)*per);for(let k=i*per;k<e;k+=4){const v=Math.abs(ch[k]);if(v>m)m=v}out[i]=m}let mx=0;for(const v of out)mx=Math.max(mx,v);if(mx>0)for(let i=0;i<out.length;i++)out[i]/=mx;return out}
async function loadWave(){WAVE={voice:null,music:null};try{if(P.media.audio)WAVE.voice=await peaksOf(purl(P.media.audio.rel));drawWaves()}catch(e){console.warn(e)}try{if(P.media.music)WAVE.music=await peaksOf(purl(P.media.music.rel));drawWaves()}catch(_){}}
function drawWave(cv,peaks,color,len,off){off=off||0;if(!cv)return;const W=Math.min(32000,Math.ceil(len*P.tl.pps)),H=cv.parentElement.clientHeight||34;cv.width=W;cv.height=H;cv.style.width=W+'px';const g=cv.getContext('2d');g.fillStyle=color;
if(!peaks){for(let x=0;x<W;x+=3){const h=3;g.fillRect(x,(H-h)/2,2,h)}return}
for(let x=0;x<W;x+=3){const t=x/P.tl.pps+off;const i=Math.floor(t*50)%peaks.length;const v=peaks[i]||0;const h=Math.max(2,v*(H-8));g.fillRect(x,(H-h)/2,2,h)}}
function drawWaves(){$$('canvas[data-ac]').forEach(cv=>{const [k,i]=cv.dataset.ac.split(':'),sg=segsOf(k)[+i];if(!sg)return;drawWave(cv,k==='voice'?WAVE.voice:WAVE.music,k==='voice'?'rgba(255,194,158,.8)':'rgba(160,190,255,.6)',sg.d,sg.o)})}

/* ===== Ovoz va musiqa: kesish, surish, qisqartirish ===== */
const srcDur=k=>k==='voice'?(P.media.audio?.duration||0):(P.media.music?.duration||0);
function segsOf(k){const T=TL();if(T.aseg&&T.aseg[k])return T.aseg[k];const d=srcDur(k),tot=total();
if(k==='voice')return d?[{s:0,o:0,d}]:[];if(!d)return[];const out=[];for(let s=0;s<tot-0.01;s+=d)out.push({s,o:0,d:Math.min(d,tot-s)});return out}
function ownSegs(k){const T=TL();T.aseg=T.aseg||{};if(!T.aseg[k])T.aseg[k]=JSON.parse(JSON.stringify(segsOf(k)));return T.aseg[k]}
const audEdited=()=>!!(TL().aseg&&(TL().aseg.voice||TL().aseg.music));
function aSegHTML(k,p){const T=TL(),nm=k==='voice'?P.media.audio?.name:P.media.music?.name;
return segsOf(k).map((sg,i)=>`<div class="cau seg ${k==='music'?'mus':''} ${E.selA&&E.selA.k===k&&E.selA.i===i?'on':''}" data-as="${k}:${i}" style="left:${sg.s*p}px;width:${Math.max(6,sg.d*p)}px"><canvas data-ac="${k}:${i}"></canvas>${i===0?`<span class="lbl">${isv(k==='voice'?'mic':'note')} ${esc(nm||'')}${k==='music'?' · '+T.audio.musicVol+'%':''}</span>`:''}<i class="rh l" data-rh="l"></i><i class="rh r" data-rh="r"></i></div>`).join('')}
let asd=null;
$('#tlc').addEventListener('pointerdown',e=>{const c=e.target.closest('[data-as]');if(!c||e.button)return;const [k,si]=c.dataset.as.split(':'),i=+si;if((TL().lock||{})[k==='voice'?'aud':'mus'])return;e.preventDefault();e.stopPropagation();
const rh=e.target.closest('[data-rh]');E.selA={k,i};E.selEl=null;$$('.cau.seg').forEach(x=>x.classList.toggle('on',x===c));snap();const sg=ownSegs(k)[i];
asd={k,i,x0:e.clientX,s:sg.s,o:sg.o,d:sg.d,m:rh?rh.dataset.rh:'m',moved:false}},true);
addEventListener('pointermove',e=>{if(!asd)return;const sg=ownSegs(asd.k)[asd.i],dt=(e.clientX-asd.x0)/P.tl.pps;if(Math.abs(e.clientX-asd.x0)>2)asd.moved=true;if(!asd.moved)return;const sd=srcDur(asd.k);
if(asd.m==='m')sg.s=+Math.max(0,Math.min(total()-0.3,asd.s+dt)).toFixed(3);
else if(asd.m==='r')sg.d=+Math.max(0.3,Math.min(sd-asd.o,asd.d+dt)).toFixed(3);
else{const mx=asd.d-0.3,ch=Math.max(-asd.o,Math.min(mx,dt));sg.s=+(asd.s+ch).toFixed(3);sg.o=+(asd.o+ch).toFixed(3);sg.d=+(asd.d-ch).toFixed(3)}
const c=$(`[data-as="${asd.k}:${asd.i}"]`);if(c){c.style.left=sg.s*P.tl.pps+'px';c.style.width=Math.max(6,sg.d*P.tl.pps)+'px'}});
addEventListener('pointerup',()=>{if(!asd)return;const m=asd.moved,k=asd.k;asd=null;if(m){rTL();edited();segSync(true)}else E.hist.pop()});
function splitAud(){const a=E.selA;if(!a)return false;const L=ownSegs(a.k),sg=L[a.i];if(!sg)return false;const off=E.t-sg.s;if(off<0.3||sg.d-off<0.3){toast('Playhead bo\'lak chetiga juda yaqin',1);return true}
snap();L.splice(a.i,1,{s:sg.s,o:sg.o,d:+off.toFixed(3)},{s:+(sg.s+off).toFixed(3),o:+(sg.o+off).toFixed(3),d:+(sg.d-off).toFixed(3)});E.selA={k:a.k,i:a.i+1};rTL();edited();segSync(true);toast('Ikkiga bo\'lindi');return true}
function delAud(){const a=E.selA;if(!a)return false;const L=ownSegs(a.k);if(!L[a.i])return false;snap();L.splice(a.i,1);E.selA=null;rTL();edited();segSync(true);return true}
/* ijro: har bo'lak o'z vaqtida eshitiladi */
function segSync(force){if(!audEdited()||!E.playing)return;for(const [k,el] of [['voice',voiceEl],['music',musicEl]]){if(!el.src)continue;const vis=(TL().vis||{})[k==='voice'?'aud':'mus']!==false;const L=segsOf(k);const j=vis?L.findIndex(s=>E.t>=s.s&&E.t<s.s+s.d):-1;
if(j<0){if(!el.paused)el.pause();el._j=-1;continue}const s=L[j],want=s.o+(E.t-s.s);if(force||el._j!==j||Math.abs(el.currentTime-want)>0.3){try{el.currentTime=want}catch(_){}}el._j=j;if(el.paused)el.play().catch(()=>{})}}
async function mixSegs(k){const L=segsOf(k),src=k==='voice'?P.media.audio:P.media.music;const buf=await (await fetch(purl(src.rel))).arrayBuffer();const rate=k==='voice'?24000:32000;const dctx=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1,rate,rate);const ab=await dctx.decodeAudioData(buf);
const n=Math.ceil(total()*rate),oc=new OfflineAudioContext(1,n,rate);for(const s of L){const sr=oc.createBufferSource();sr.buffer=ab;sr.connect(oc.destination);sr.start(s.s,s.o,s.d)}
const out=await oc.startRendering();const ch=out.getChannelData(0),pcm=new Int16Array(ch.length);for(let i=0;i<ch.length;i++){const v=Math.max(-1,Math.min(1,ch[i]));pcm[i]=v*32767}
const hd=new DataView(new ArrayBuffer(44)),w=(o,t)=>[...t].forEach((c,i)=>hd.setUint8(o+i,c.charCodeAt(0)));w(0,'RIFF');hd.setUint32(4,36+pcm.length*2,true);w(8,'WAVEfmt ');hd.setUint32(16,16,true);hd.setUint16(20,1,true);hd.setUint16(22,1,true);hd.setUint32(24,rate,true);hd.setUint32(28,rate*2,true);hd.setUint16(32,2,true);hd.setUint16(34,16,true);w(36,'data');hd.setUint32(40,pcm.length*2,true);
const name=`${k}_montaj.wav`;const r=await upload('audio',new File([hd,pcm],name,{type:'audio/wav'}),{name,clear:false});return r.rel}
function thumbOf(c){return purl(c.img,true)}
function rTL(){const T=TL(),st=starts(),tot=total(),p=T.pps,W=Math.ceil(tot*p)+80;
const step=p<3?60:p<6?30:p<12?15:p<24?5:2;let tk='';for(let t=0;t<=tot;t+=step)tk+=`<span class="tk" style="left:${t*p}px">${fmt(t)}</span>`;
const vis=T.vis||{},lock=T.lock||{};
const th=(k,ic,name)=>`<div class="th" title="${name}"><span class="tic">${isv(ic)}</span><button type="button" class="tb lk ${lock[k]?'on':''}" data-lk="${k}" aria-label="${name}: qulflash">${isv('lock')}</button><button type="button" class="tb ey ${vis[k]===false?'':'on'}" data-ey="${k}" aria-label="${name}: ko'rinish">${isv('eye')}</button></div>`;
const row=(k,ic,name,inner)=>`<div class="tr t-${k} ${vis[k]===false?'hid':''} ${lock[k]?'locked':''}">${th(k,ic,name)}<div class="lane" style="width:${W}px">${inner}</div></div>`;
let img='',tx='',sfx='';const C=clips();
C.forEach((c,i)=>{const L=st[i]*p,w=Math.max(2,c.d*p);
img+=`<div class="cl ${i===E.sel?'on':''}" data-ci="${i}" style="left:${L}px;width:${w}px">${w>18?`<img src="${thumbOf(c)}" loading="lazy" alt="">`:''}${w>30?`<span>${pad3(i+1)}</span>`:''}</div>`;
if(i>0)img+=`<span class="tl-drag" data-drag="${i}" style="left:${L}px"></span>`;
if(c.x)tx+=`<div class="ctx ${i===E.sel?'on':''}" data-ci="${i}" style="left:${L}px;width:${w}px"><b>T</b><span class="ct">${w>44?esc(c.x):''}</span></div>`;
if(i>0&&(T.audio.sfxMode==='all'||(T.audio.sfxMode==='some'&&i%3===2)))sfx+=`<i class="sd" style="left:${L}px"></i>`});
const el=(T.els||[]).map((e,i)=>`<div class="cel ${e.k==='sub'?'sub':e.k==='num'||e.k==='date'?'num':'fx'} ${E.selEl===i?'on':''}" data-eli="${i}" style="left:${e.s*p}px;width:${Math.max(30,e.d*p)}px"><i class="rh l" data-rh="l"></i>${esc(elLabel(e))}<i class="rh r" data-rh="r"></i></div>`).join('');
$('#tlc').style.width=(HW+W)+'px';
$('#tlc').innerHTML=`<div class="tr rul"><div class="th"></div><div class="lane" data-rul style="width:${W}px;--mt:${step/5*p}px">${tk}</div></div>`
+row('txt','txt','Matn',tx)+row('img','img','Rasm',img)+row('el','star','Element',el)+row('sfx','bolt','Effektlar',sfx)
+row('aud','mic','Ovoz',P.media.audio?aSegHTML('voice',p):`<div class="cau" style="width:${tot*p}px"><span class="lbl">${isv('mic')} ovoz yo'q</span></div>`)
+row('mus','note','Musiqa',P.media.music?aSegHTML('music',p):'')
+`<div class="ph2" id="ph2"></div>`;
drawWaves();posPH()}
const elLabel=e=>e.k==='sub'?'Obuna':e.k==='num'?'Raqam: '+(e.n||''):e.k==='date'?'Sana: '+(e.n||''):e.k==='name'?'Ism: '+(e.n||''):e.k==='map'?'Joy: '+(e.n||''):e.k==='quote'?'Iqtibos':e.k==='arrow'?'Strelka':e.k;
const posPH=()=>{const ph=$('#ph2');if(ph)ph.style.left=(HW+E.t*P.tl.pps)+'px'};
function follow(){const w=$('#tlw'),x=HW+E.t*P.tl.pps;if(x<w.scrollLeft+HW+20||x>w.scrollLeft+w.clientWidth-60)w.scrollLeft=Math.max(0,x-200)}
let drag=null;
$('#tlc').addEventListener('pointerdown',e=>{const d=e.target.closest('[data-drag]');if(d){if((TL().lock||{}).img)return;e.preventDefault();const i=+d.dataset.drag;snap();drag={i,x:e.clientX,a:clips()[i-1].d,b:clips()[i].d};return}
const ln=e.target.closest('.lane');E._touch=e.pointerType==='touch';if(E._touch&&ln&&!ln.hasAttribute('data-rul'))return;/* telefonda: tasmani barmoq bilan surish — oddiy aylantirish; vaqtni tanlash — bosish yoki o'lchov chizig'ida surish */
if(ln&&!e.target.closest('[data-ci],[data-eli]')){const seek=ev=>{const r=ln.getBoundingClientRect();E.t=Math.max(0,Math.min(total()-0.01,(ev.clientX-r.left)/P.tl.pps));E.sel=clipAt(E.t);markSel();upd(true)};seek(e);
const mv=ev=>seek(ev),up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up)};addEventListener('pointermove',mv);addEventListener('pointerup',up)}});
addEventListener('pointermove',e=>{if(!drag)return;const dt=(e.clientX-drag.x)/P.tl.pps;const a=Math.max(0.4,drag.a+dt),b=drag.a+drag.b-a;if(b<0.4)return;clips()[drag.i-1].d=+a.toFixed(3);clips()[drag.i].d=+b.toFixed(3);
const st=starts();const L=st[drag.i]*P.tl.pps;const x=$(`[data-drag="${drag.i}"]`);if(x)x.style.left=L+'px';$('#iClip').textContent=`${pad3(drag.i)}: ${a.toFixed(2)} s · ${pad3(drag.i+1)}: ${b.toFixed(2)} s`});
addEventListener('pointerup',()=>{if(drag){drag=null;rTL();edited()}});
$('#tlc').addEventListener('click',e=>{
const lk=e.target.closest('[data-lk]');if(lk){const T=TL();T.lock=T.lock||{};const k=lk.dataset.lk;T.lock[k]=!T.lock[k];rTL();save();toast(T.lock[k]?'Yo\'lak qulflandi':'Qulf ochildi');return}
const ey=e.target.closest('[data-ey]');if(ey){const T=TL();T.vis=T.vis||{};const k=ey.dataset.ey;T.vis[k]=T.vis[k]===false;rTL();E.curEl=undefined;upd(true);volUpd();save();return}
const el=e.target.closest('[data-eli]');if(el){const x=TL().els[+el.dataset.eli];E.t=x.s+0.1;E.curEl=undefined;upd(true);setTool('el');return}
const cl=e.target.closest('[data-ci]');if(cl){E.selEl=null;E.selA=null;select(+cl.dataset.ci)}});
$('#zoom').oninput=e=>{P.tl.pps=+e.target.value;rTL();follow();save()};

function rMedia(){const q=E.q.toLowerCase();const C=clips();
$('#mBody').innerHTML=C.map((c,i)=>q&&!(c.x||'').toLowerCase().includes(q)&&!pad3(i+1).includes(q)?'':`<button type="button" class="mi ${i===E.sel?'on':''}" data-ci="${i}"><span class="mth"><img src="${thumbOf(c)}" loading="lazy" alt=""><em>${pad3(i+1)}</em><i>${c.d.toFixed(1)}s</i></span><span class="mlb">${esc(c.x||c.img.split('/').pop())}</span></button>`).join('')||'<p class="note">Topilmadi.</p>';
$('#mTotal').textContent=`${C.length} ta kadr · ${fmt2(total())}`}
$('#mSearch').addEventListener('input',e=>{E.q=e.target.value;rMedia()});
$('#mBody').addEventListener('click',e=>{const b=e.target.closest('[data-ci]');if(b)select(+b.dataset.ci)});
$('#replaceImg').onclick=()=>$('#replaceFile').click();
$('#replaceFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const r=await upload('images',f,{name:`zz_almashgan_${Date.now()}_${f.name}`});snap();clips()[E.sel].img=r.rel;await refreshImages();P.tl.sig=tlSig();rAll();edited();toast(`${pad3(E.sel+1)}-kadr rasmi almashtirildi`)}catch(er){toast(er.message,1)}};
function markSel(){$$('#tlc [data-ci],#mBody [data-ci]').forEach(x=>x.classList.toggle('on',+x.dataset.ci===E.sel));const c=clips()[E.sel];if(!c)return;
const ta=$('#clipText');if(document.activeElement!==ta)ta.value=c.x||'';$('#clipLbl').textContent=pad3(E.sel+1);$('#mClipLbl').textContent=pad3(E.sel+1);
$$('#clipMotion .pill').forEach(x=>x.classList.toggle('on',x.dataset.v===(c.motion||'auto')))}
function select(i,seek=true){E.sel=Math.max(0,Math.min(clips().length-1,i));if(seek)E.t=starts()[E.sel]+0.02;markSel();upd(true);follow();if(E.playing){voiceEl.currentTime=E.t;sfxReset()}}
function rAll(){rTL();rMedia();rAudioPanel();rEls();markSel();E.curEl=undefined;E.lastClip=-1;upd(true)}

const subK=()=>{const w=parseFloat(stage.style.width)||640,h=parseFloat(stage.style.height)||360;return Math.min(w,h)/360};
function subTokens(text){const s=TL().sub;let words=String(text||'').split(/\s+/).filter(Boolean);if(s.preset==='karaoke')words=words.map(w=>w.toUpperCase());
const acc=new Set();if(s.preset==='karaoke'){acc.add(words.length-1);acc.add(words.length-2)}
if(s.kw){let bi=-1,bl=0;words.forEach((w,i)=>{const clean=w.replace(/[^\p{L}\p{N}]/gu,'');const sc=/\d/.test(clean)?100+clean.length:clean.length;if(sc>bl){bl=sc;bi=i}});if(bi>=0)acc.add(bi)}
return words.map((w,i)=>({w,a:acc.has(i)}))}

/* ===== Subtitr: bir qatorli bo'laklar ===== */
function subMax(){const s=TL().sub,base=P.format==='short'?22:44;return Math.max(14,Math.round(base*17/Math.max(11,s.size)))}
function subChunks(c,t0){const w=String(c.x||'').split(/\s+/).filter(Boolean);if(!w.length)return[];const mx=subMax(),parts=[];let cur=[],len=0;
for(const x of w){const add=(cur.length?1:0)+x.length;if(cur.length&&len+add>mx){parts.push(cur);cur=[];len=0}cur.push(x);len+=(cur.length>1?1:0)+x.length}
if(cur.length)parts.push(cur);
if(parts.length>1&&parts[parts.length-1].join(' ').length<8){const l=parts.pop();parts[parts.length-1].push(...l)}
const tot=parts.reduce((a,p)=>a+p.join(' ').length,0);let at=t0;return parts.map(p=>{const d=c.d*p.join(' ').length/tot,r={t0:at,t1:at+d,w:p};at+=d;return r})}
function subTok(words){const s=TL().sub;let ws=words.slice();if(s.preset==='karaoke')ws=ws.map(w=>w.toUpperCase());const acc=new Set();if(s.preset==='karaoke'){acc.add(ws.length-1)}
if(s.kw){let bi=-1,bl=0;ws.forEach((w,i)=>{const cl=w.replace(/[^\p{L}\p{N}]/gu,'');const sc=/\d/.test(cl)?100+cl.length:cl.length;if(sc>bl){bl=sc;bi=i}});if(bi>=0)acc.add(bi)}
return ws.map((w,i)=>({w,a:acc.has(i)}))}
function bgRGBA(s){const h=(s.bgColor||'#000000').replace('#','');const n=parseInt(h.length===3?h.replace(/./g,'$&$&'):h,16)||0;return `rgba(${n>>16&255},${n>>8&255},${n&255},${s.bgAlpha==null?1:s.bgAlpha})`}
function subShow(c,i,st){if(!TL().sub.on||(TL().vis||{}).txt===false||!c.x){subo.hidden=true;return}
const ch=subChunks(c,st[i]);let cur=ch.find(x=>E.t>=x.t0&&E.t<x.t1)||ch[ch.length-1];if(!cur){subo.hidden=true;return}
const key=i+'|'+cur.w.join(' ')+TL().sub.preset+TL().sub.kw;if(subo._k!==key){subo._k=key;subo.innerHTML=subTok(cur.w).map(t=>t.a?`<em>${esc(t.w)}</em>`:esc(t.w)).join(' ')}subo.hidden=false}
function setSubVars(){const s=TL().sub,k=subK();const v=(a,b)=>subo.style.setProperty(a,b);
v('--sf',`"${s.font}", Inter, sans-serif`);v('--ss',(s.size*k)+'px');v('--sw',s.weight);v('--so',(s.outline*k*0.5)+'px');v('--sc',s.color);v('--sa',s.accent);v('--sb',s.pos+'%');v('--sbg',bgRGBA(s));v('--soc',s.outlineColor||'#000000');
subo.classList.remove('bg-pill','bg-box');if(s.bg)subo.classList.add(s.bg);
subo.style.textShadow=s.preset==='kontur'||s.preset==='karaoke'?`0 ${2*k}px ${6*k}px rgba(0,0,0,.7)`:s.preset==='kino'?`0 ${k}px ${6*k}px rgba(0,0,0,.8)`:'none';
$('#sSizeV').textContent=s.size;$('#sWV').textContent=s.weight;$('#sOV').textContent=s.outline+' px';$('#posv').textContent=s.pos+'%';
$('#ovl').style.zoom=ovZoom();const sv=(id,v)=>{const q=$(id);if(q&&q!==document.activeElement)q.value=v};sv('#sColorX',s.color);sv('#sColorH',s.color);sv('#sOcX',s.outlineColor||'#000000');sv('#sBgX',s.bgColor);sv('#sBgH',s.bgColor);sv('#sBgA',Math.round((s.bgAlpha==null?1:s.bgAlpha)*100));if($('#sBgAV'))$('#sBgAV').textContent=Math.round((s.bgAlpha==null?1:s.bgAlpha)*100)+'%'}
function motionOf(i){const c=clips()[i];const m=TL().mode;if(m==='m-static'&&c.motion!=='punch')return'none';if(!c.motion||c.motion==='auto'){const cyc=m==='m-dyn'?['punch','in','left','punch','out','right']:['in','left','out','right','in','out'];return cyc[i%cyc.length]}return c.motion}
function upd(force){upd0(force);trPreview(force)}
/* video klip ko'rish oynasida haqiqiy video bo'lib o'ynaydi (avval faqat qora rasm edi) */
function vidSync(i,c,st,now){const v=$('#bgv');if(!v)return;if(!c||!isVid(c.img)||!window.FCL||(TL().vis||{}).img===false){if(!v.hidden){v.pause();v.hidden=true}return}
const u=FCL.videoUrl(P.id,c.img);if(!u){v.hidden=true;return}if(v._u!==u){v._u=u;v.src=u}v.hidden=false;
const d=v.duration||0;let want=E.t-st[i];if(d>0.05)want=want%d;want=Math.max(0,want);
if(E.playing){if(v.paused||now)v.play().catch(()=>{});if(Math.abs(v.currentTime-want)>0.4)try{v.currentTime=want}catch(_){}}
else{if(!v.paused)v.pause();if(Math.abs(v.currentTime-want)>0.05)try{v.currentTime=want}catch(_){}}}
function upd0(force){if(!P?.tl)return;const st=starts(),i=clipAt(E.t),c=clips()[i];if(!c)return;vidSync(i,c,st);
if(i!==E.lastClip||force){const changed=i!==E.lastClip;E.lastClip=i;
if(changed||force)$('#bgl').style.backgroundImage=`url("${isVid(c.img)?thumbOf(c):purl(c.img)}")`;
const mo=motionOf(i);const bg=$('#bgl');bg.className='layer bgl'+(mo!=='none'?' mo-'+mo:'');bg.style.setProperty('--dur',c.d+'s');bg.style.setProperty('--z',TL().mode==='m-dyn'?1.14:1.08);
bg.style.animationDelay=(-(E.t-st[i]))+'s';void bg.offsetWidth;bg.classList.toggle('paused',!E.playing);
const T=subTokens(c.x);subo.innerHTML=T.map(t=>t.a?`<em>${esc(t.w)}</em>`:esc(t.w)).join(' ');
const f=c.filter||TL().filter;applyFilterCSS(f);
$('#iClip').textContent=`Kadr ${pad3(i+1)} · ${fmt(st[i])}–${fmt(st[i]+c.d)}`;
if(E.playing&&i!==E.sel){E.sel=i;markSel()}}
subShow(c,i,st);
$('#pTime').textContent=`${fmt2(E.t)} / ${fmt2(total())}`;posPH();
const els=(TL().vis||{}).el===false?[]:(TL().els||[]).filter(e=>(e.k!=='sub'||TL().sb.on)&&E.t>=e.s&&E.t<e.s+e.d);const el=els[els.length-1]||null;
if(el!==E.curEl){E.curEl=el;const o=$('#ovl');o.classList.remove('on');o._q=-1;if(el){o.className='ovl '+elPosClass(el);o.style.cssText='zoom:'+ovZoom();o.innerHTML=elHTML(el,el.k==='sub'?E.t-el.s:undefined);applyElPos(o,el);void o.offsetWidth;o.classList.add('on')}}
if(E.curEl&&E.curEl.k==='sub'){const o=$('#ovl'),tm=E.t-E.curEl.s,q=Math.floor(tm*20);if(o._q!==q){o._q=q;o.innerHTML=elHTML(E.curEl,tm)}}}

/* ===== O'tish effektlari: ko'rish oynasida eksportdagidek ===== */
function trKind(j){const T=TL(),p=clips()[j-1].trans;return p&&p!=='auto'?p:(T.trans&&T.trans!=='auto'?T.trans:AUTO_TR[(j-1)%AUTO_TR.length])}
function trLayer(el,k,force){const c=clips()[k];if(!c)return;if(el._k===k&&!force)return;el._k=k;
el.style.backgroundImage=`url("${isVid(c.img)?thumbOf(c):purl(c.img)}")`;const mo=motionOf(k);el.className='layer bgl'+(mo!=='none'?' mo-'+mo:'');
el.style.setProperty('--dur',c.d+'s');el.style.setProperty('--z',TL().mode==='m-dyn'?1.14:1.08);el.style.animationDelay=(-(E.t-starts()[k]))+'s';void el.offsetWidth;el.classList.toggle('paused',!E.playing)}
function trClear(el){el.style.translate='';el.style.scale='';el.style.zIndex='';el.style.opacity=''}
function trReset(){const b2=$('#bgl2');if(!b2||!E.trOn)return;E.trOn=false;b2._k=-1;trClear($('#bgl'));trClear(b2);b2.style.opacity=0;$('#flash').style.opacity=0}
function trPreview(force){const b2=$('#bgl2');if(!b2||!P?.tl)return;const T=TL(),C=clips();if(C.length<2||(T.vis||{}).trn===false){trReset();return}
const st=starts(),i=clipAt(E.t);let hit=null;
for(const j of [i,i+1]){if(j<1||j>=C.length)continue;const tr=trKind(j);if(tr==='cut')continue;const td=Math.min(T.transD||.4,C[j-1].d,C[j].d),a0=st[j]-td/2;if(E.t>=a0&&E.t<=a0+td){hit={j,tr,p:(E.t-a0)/td};break}}
if(!hit){trReset();return}
const {j,tr,p}=hit,e=p*p*(3-2*p),b=$('#bgl'),inc=i===j;
trLayer(b2,inc?j-1:j,force||!E.trOn);b2.style.filter=b.style.filter;
const out=inc?b2:b,inn=inc?b:b2;trClear(b);trClear(b2);E.trOn=true;
out.style.opacity=1;out.style.zIndex=-2;inn.style.zIndex=-1;inn.style.opacity=1;let flash=0;
if(tr==='slide'){inn.style.translate=((1-e)*100)+'% 0';out.style.translate=(-e*35)+'% 0'}
else if(tr==='zoom'){inn.style.opacity=e;inn.style.scale=1.12-0.12*e;out.style.scale=1+0.25*e}
else{inn.style.opacity=e;if(tr==='light')flash=Math.sin(Math.PI*p)*0.75}
$('#flash').style.opacity=flash}

/* ===== Elementlar: timeline'da surish, cho'zish, tanlash ===== */
let eld=null;
$('#tlc').addEventListener('pointerdown',e=>{const c=e.target.closest('[data-eli]');if(!c||e.button)return;if((TL().lock||{}).el)return;e.preventDefault();e.stopPropagation();
const i=+c.dataset.eli,x=TL().els[i],rh=e.target.closest('[data-rh]');selEl(i,true);snap();eld={i,x0:e.clientX,s:x.s,d:x.d,m:rh?rh.dataset.rh:'m',moved:false}},true);
addEventListener('pointermove',e=>{if(!eld)return;const x=TL().els[eld.i],dt=(e.clientX-eld.x0)/P.tl.pps;if(Math.abs(e.clientX-eld.x0)>2)eld.moved=true;if(!eld.moved)return;
if(eld.m==='m')x.s=+Math.max(0,Math.min(total()-0.5,eld.s+dt)).toFixed(2);
else if(eld.m==='r')x.d=+Math.max(0.5,Math.min(total()-x.s,eld.d+dt)).toFixed(2);
else{const ns=Math.max(0,Math.min(eld.s+eld.d-0.5,eld.s+dt));x.d=+(eld.s+eld.d-ns).toFixed(2);x.s=+ns.toFixed(2)}
const c=$(`[data-eli="${eld.i}"]`);if(c){c.style.left=x.s*P.tl.pps+'px';c.style.width=Math.max(30,x.d*P.tl.pps)+'px'}});
addEventListener('pointerup',()=>{if(!eld)return;const m=eld.moved;eld=null;if(m){E.curEl=undefined;upd(true);edited()}else{E.hist.pop()}});
function selEl(i,keep){E.selEl=i;$$('.cel').forEach(c=>c.classList.toggle('on',+c.dataset.eli===i));if(!keep)return}
function delSelEl(){const L=TL().els;if(E.selEl==null||!L[E.selEl])return false;snap();L.splice(E.selEl,1);E.selEl=null;rEls();rTL();E.curEl=undefined;upd(true);edited();return true}
/* ekranda elementni surish va o'lchamini o'zgartirish */
{const o=$('#ovl');let g=null;
o.addEventListener('pointerdown',e=>{if(!E.curEl||e.button)return;const st=$('#stage').getBoundingClientRect(),x=E.curEl;e.preventDefault();o.setPointerCapture(e.pointerId);
const i=TL().els.indexOf(x);selEl(i);const r=o.getBoundingClientRect();snap();
g={st,x,px:e.clientX,py:e.clientY,cx:x.x!=null?x.x:(r.left+r.width/2-st.left)/st.width*100,cy:x.y!=null?x.y:(r.top+r.height/2-st.top)/st.height*100,moved:false}});
o.addEventListener('pointermove',e=>{if(!g)return;const dx=e.clientX-g.px,dy=e.clientY-g.py;if(!g.moved&&Math.abs(dx)+Math.abs(dy)<3)return;g.moved=true;
const x=g.x;x.x=+Math.max(3,Math.min(97,g.cx+dx/g.st.width*100)).toFixed(2);x.y=+Math.max(3,Math.min(97,g.cy+dy/g.st.height*100)).toFixed(2);applyElPos(o,x)});
o.addEventListener('pointerup',()=>{if(!g)return;const m=g.moved;g=null;if(m){edited()}else E.hist.pop()});
o.addEventListener('wheel',e=>{if(!E.curEl)return;e.preventDefault();const x=E.curEl;x.sc=+Math.max(.4,Math.min(3,(x.sc||1)*(e.deltaY<0?1.06:.94))).toFixed(3);applyElPos(o,x);clearTimeout(E._sct);E._sct=setTimeout(edited,300)},{passive:false});
$$('#ovBig,#ovSmall').forEach(b=>b.onclick=()=>{if(!E.curEl)return;snap();const x=E.curEl;x.sc=+Math.max(.4,Math.min(3,(x.sc||1)*(b.id==='ovBig'?1.15:.87))).toFixed(3);applyElPos(o,x);edited()})}
/* ustki element o'lchami: vertikal (9:16) videoda kichikroq; o'lchamni joyidan siljitmasdan ham o'zgartirish mumkin */
const elFmtK=(W,H)=>H>W?0.72:1;
function ovZoom(){const w=parseFloat(stage.style.width)||640,h=parseFloat(stage.style.height)||360;return Math.min(w,h)/360*elFmtK(w,h)}
function applyElPos(o,x){const z=`zoom:${ovZoom()};--sc:${x.sc||1}`;if(x.x==null){o.classList.remove('free');o.style.cssText=z;return}o.classList.add('free');o.style.cssText=`left:${x.x}%;top:${x.y}%;${z}`}
const elStyleFor=e=>e.x==null?'':` free" style="left:${e.x}%;top:${e.y}%;--sc:${e.sc||1}`;
function fit(){const pv=$('#pv');if(!P||!pv||!pv.clientWidth)return;const r=P.format==='short'?9/16:16/9;const W=pv.clientWidth-28,H=pv.clientHeight;let w=W,h=w/r;if(h>H){h=H;w=h*r}stage.style.width=Math.max(0,w)+'px';stage.style.height=Math.max(0,h)+'px';if(P?.tl)setSubVars()}
try{new ResizeObserver(fit).observe($('#pv'))}catch(_){addEventListener('resize',fit)}

/* ===== SFX preview (real time): same sounds and rules as the exporter ===== */
const SFXP={ctx:null,gain:null,lib:null,key:'',busy:false,sched:new Set(),srcs:[],lastT:0,cnt:{}};
const SFX_KIND={slide:['whoosh','soft'],zoom:['whoosh'],mix:['soft','whoosh'],light:['shutter','whoosh'],cut:['pop','click']};
const AUTO_TR=['mix','slide','mix','light','mix','zoom','slide','mix'];
function sfxClassify(n){n=String(n||'').toLowerCase();if(/whoosh|woosh|swoosh|swish|swipe|transition/.test(n))return/soft/.test(n)?'soft':'whoosh';if(/pop|bubble/.test(n))return'pop';if(/shutter|camera|flash|zatvor/.test(n))return'shutter';if(/click|tick/.test(n))return'click';return'whoosh'}
function sfxCtx(){if(!SFXP.ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;SFXP.ctx=new AC();SFXP.gain=SFXP.ctx.createGain();SFXP.gain.connect(SFXP.ctx.destination)}
if(SFXP.ctx.state==='suspended')SFXP.ctx.resume().catch(()=>{});return SFXP.ctx}
function sfxRng(seed){let s=seed>>>0||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}}
function sfxMk(ctx,arr){const b=ctx.createBuffer(1,arr.length,ctx.sampleRate);b.getChannelData(0).set(arr);let pk=0,pi=0;for(let i=0;i<arr.length;i++){const a=Math.abs(arr[i]);if(a>pk){pk=a;pi=i}}return{buf:b,peak:pi/ctx.sampleRate}}
function sfxWhoosh(ctx,seed,dur,bright){const R=ctx.sampleRate,n=Math.floor(dur*R),o=new Float32Array(n),r=sfxRng(seed);let l1=0,l2=0;
for(let i=0;i<n;i++){const t=i/n,env=Math.pow(Math.sin(Math.PI*Math.pow(t,.8)),2.2),cut=.02+bright*.25*Math.sin(Math.PI*t)*(48000/R);const x=r()*2-1;l1+=cut*(x-l1);l2+=cut*(l1-l2);o[i]=l2*env*2.6}return sfxMk(ctx,o)}
function sfxPop(ctx){const R=ctx.sampleRate,n=Math.floor(.09*R),o=new Float32Array(n);let ph=0;for(let i=0;i<n;i++){const t=i/R,f=520*Math.exp(-t*40)+140;ph+=2*Math.PI*f/R;o[i]=Math.sin(ph)*Math.exp(-t*55)*.9}return sfxMk(ctx,o)}
function sfxClickArr(ctx,seed,dur){const R=ctx.sampleRate,n=Math.floor(dur*R),o=new Float32Array(n),r=sfxRng(seed);for(let i=0;i<n;i++)o[i]=(r()*2-1)*Math.exp(-i/R*260)*.8;return o}
function sfxShutter(ctx){const R=ctx.sampleRate,a=sfxClickArr(ctx,7,.05),b=sfxClickArr(ctx,9,.06),o=new Float32Array(Math.floor(.16*R));o.set(a);const off=Math.floor(.085*R);for(let i=0;i<b.length;i++)if(off+i<o.length)o[off+i]+=b[i]*.8;return sfxMk(ctx,o)}
function sfxBuiltin(ctx){return{whoosh:[sfxWhoosh(ctx,1,.55,1),sfxWhoosh(ctx,2,.7,.8),sfxWhoosh(ctx,3,.45,1.2)],soft:[sfxWhoosh(ctx,4,.8,.5)],pop:[sfxPop(ctx)],shutter:[sfxShutter(ctx)],click:[sfxMk(ctx,sfxClickArr(ctx,5,.03))]}}
async function sfxLoad(){const ctx=sfxCtx();if(!ctx||!P)return false;const files=(P.media?.sfx||[]);const key=P.id+'|'+files.map(f=>f.rel).join(',');
if(SFXP.lib&&SFXP.key===key)return true;if(SFXP.busy)return false;SFXP.busy=true;
try{let lib={};
for(const f of files){try{const ab=await (await fetch(purl(f.rel))).arrayBuffer();const buf=await ctx.decodeAudioData(ab);const d=buf.getChannelData(0);const n=Math.min(d.length,Math.floor(4*buf.sampleRate));const arr=new Float32Array(n);let pk=0;for(let i=0;i<n;i++){arr[i]=d[i];pk=Math.max(pk,Math.abs(d[i]))}
if(pk>.001){const g=.85/pk;for(let i=0;i<n;i++)arr[i]*=g}const b=ctx.createBuffer(1,n,buf.sampleRate);b.getChannelData(0).set(arr);let pi=0,pv=0;for(let i=0;i<n;i++){const a=Math.abs(arr[i]);if(a>pv){pv=a;pi=i}}
(lib[sfxClassify(f.name)]=lib[sfxClassify(f.name)]||[]).push({buf:b,peak:pi/buf.sampleRate})}catch(_){}}
if(!Object.keys(lib).length)lib=sfxBuiltin(ctx);SFXP.lib=lib;SFXP.key=key;SFXP.cnt={}}finally{SFXP.busy=false}return true}
function sfxReset(){SFXP.sched.clear();SFXP.lastT=E.t}
function sfxStop(){SFXP.srcs.forEach(s=>{try{s.stop()}catch(_){}});SFXP.srcs=[];SFXP.sched.clear()}
function sfxGain(){if(!SFXP.gain)return;const T=TL(),a=T.audio||{};SFXP.gain.gain.value=Math.max(0,Math.min(2,(a.sfxVol??45)/100))*((T.vis||{}).sfx===false||voiceEl.muted?0:1)}
function sfxTick(){const T=TL();if(!T)return;const a=T.audio||{};if(a.sfxMode==='off'||(T.vis||{}).sfx===false||voiceEl.muted)return;const C=clips();if(C.length<2)return;
if(!SFXP.lib||SFXP.key.split('|')[0]!==P.id){sfxLoad();return}
const ctx=SFXP.ctx;if(!ctx)return;if(Math.abs(E.t-SFXP.lastT)>0.6)SFXP.sched.clear();SFXP.lastT=E.t;sfxGain();
const st=starts(),ci=clipAt(E.t),look=.3;
for(let i=Math.max(1,ci);i<=Math.min(C.length-1,ci+2);i++){if(a.sfxMode==='some'&&i%3!==2)continue;if(SFXP.sched.has(i))continue;
const td=Math.min(T.transD||.4,C[i-1].d,C[i].d),delta=st[i]+td/2-E.t;if(delta>look||delta<-.05)continue;
const tr=(C[i-1].trans&&C[i-1].trans!=='auto'?C[i-1].trans:(T.trans&&T.trans!=='auto'?T.trans:AUTO_TR[(i-1)%AUTO_TR.length]));
let snd=null;for(const cat of(SFX_KIND[tr]||SFX_KIND.mix)){const arr=SFXP.lib[cat];if(arr&&arr.length){const k=((SFXP.cnt[cat]||0)+i)%arr.length;SFXP.cnt[cat]=k+1;snd=arr[k];break}}
if(!snd){for(const k in SFXP.lib){if(SFXP.lib[k].length){snd=SFXP.lib[k][i%SFXP.lib[k].length];break}}}
if(!snd)continue;SFXP.sched.add(i);
const src=ctx.createBufferSource();src.buffer=snd.buf;src.connect(SFXP.gain);let when=ctx.currentTime+delta-snd.peak,off=0;if(when<ctx.currentTime){off=ctx.currentTime-when;when=ctx.currentTime;if(off>=snd.buf.duration)continue}
src.start(when,off);SFXP.srcs.push(src);src.onended=()=>{SFXP.srcs=SFXP.srcs.filter(x=>x!==src)}}}

function setPlayIcon(){$('#playB').innerHTML=`<svg viewBox="0 0 24 24">${E.playing?IC.pause:IC.play}</svg>`}
function loop(){if(!E.playing)return;if(!audEdited()&&voiceEl.src&&!voiceEl.paused)E.t=voiceEl.currentTime;else E.t+=(performance.now()-E.last)/1000;E.last=performance.now();segSync();
if(E.t>=total()-0.02){E.t=total()-0.02;togglePlay(false);return}upd();follow();sfxTick();requestAnimationFrame(loop)}
function togglePlay(on){E.playing=on===undefined?!E.playing:on;setPlayIcon();$('#bgl').classList.toggle('paused',!E.playing);
if(P?.tl){const i=clipAt(E.t);vidSync(i,clips()[i],starts(),true)}
if(E.playing){if(E.t>=total()-0.1)E.t=0;E.last=performance.now();sfxCtx();sfxLoad();sfxReset();sfxGain();if(audEdited()){voiceEl._j=musicEl._j=-2;segSync(true)}else{if(voiceEl.src){voiceEl.currentTime=E.t;voiceEl.play().catch(()=>{})}if(musicEl.src&&(TL().vis||{}).mus!==false){musicEl.currentTime=E.t%(musicEl.duration||1e9);musicEl.play().catch(()=>{})}}E.lastClip=-1;requestAnimationFrame(loop)}
else{voiceEl.pause();musicEl.pause();sfxStop()}}
$('#playB').onclick=()=>togglePlay();
$('#prevB').onclick=()=>{const st=starts(),i=clipAt(E.t);select(E.t-st[i]>0.6?i:i-1)};
$('#nextB').onclick=()=>select(clipAt(E.t)+1);
$('#fsB').onclick=()=>stage.requestFullscreen?.().catch(()=>{});
$('#muteB').onclick=e=>{const m=!voiceEl.muted;voiceEl.muted=m;musicEl.muted=m;sfxGain();e.currentTarget.classList.toggle('on',m);toast(m?'Ovoz o\'chirildi':'Ovoz yoqildi')};
$('#ccBtn').onclick=()=>{TL().sub.on=!TL().sub.on;$('#ccBtn').classList.toggle('on',TL().sub.on);$('#subSw').classList.toggle('on',TL().sub.on);upd();save()};
$('#safeBtn').onclick=e=>{const s=$('#safe');s.hidden=!s.hidden;e.currentTarget.classList.toggle('on',!s.hidden)};
function volUpd(){const a=TL().audio,vis=TL().vis||{};voiceEl.volume=Math.min(1,a.voiceVol/100)*(vis.aud===false?0:1);musicEl.volume=Math.min(1,a.musicVol/100)*(vis.mus===false?0:1);
$('#vVolV').textContent=a.voiceVol+'%';$('#mVolV').textContent=a.musicVol+'%';$('#sfxVolV').textContent=a.sfxVol+'%';sfxGain()}
const _typing=t=>t.closest('textarea,select,[contenteditable],input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button])');
addEventListener('keyup',e=>{if(e.code==='Space'&&S.screen==='s-editor'&&!_typing(e.target))e.preventDefault()},true);
addEventListener('keydown',e=>{if(S.screen!=='s-editor'||_typing(e.target))return;
if(e.code==='Space'){e.preventDefault();e.stopPropagation();const a=document.activeElement;if(a&&a!==document.body&&a.blur)a.blur();togglePlay()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='b'){e.preventDefault();if(!splitAud())$('#splitB').click()}else if(e.key==='ArrowRight')$('#nextB').click();else if(e.key==='ArrowLeft')$('#prevB').click();
else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}
else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(!delSelEl()&&!delAud())$('#delB').click()}else if(e.key.toLowerCase()==='s'&&!e.ctrlKey){if(!splitAud())$('#splitB').click()}});

$('#splitB').onclick=()=>{if(E.selA&&splitAud())return;if((TL().lock||{}).img){toast('Rasm yo\'lagi qulflangan',1);return}const st=starts(),i=clipAt(E.t),c=clips()[i],off=E.t-st[i];
if(off<0.4||c.d-off<0.4){toast('Playhead kadr chetiga juda yaqin',1);return}
snap();const words=(c.x||'').split(' ');const cut=Math.round(words.length*off/c.d);
clips().splice(i,1,{...c,d:+off.toFixed(3),x:words.slice(0,cut).join(' ')},{...c,d:+(c.d-off).toFixed(3),x:words.slice(cut).join(' ')});E.sel=i+1;rAll();edited();toast(`${pad3(i+1)}-kadr ikkiga bo'lindi`)};
$('#delB').onclick=()=>{if((TL().lock||{}).img){toast('Rasm yo\'lagi qulflangan',1);return}if(clips().length<2)return;snap();const i=E.sel,c=clips()[i];const j=i>0?i-1:1;
clips()[j].d=+(clips()[j].d+c.d).toFixed(3);if(c.x)clips()[j].x=(i>0?(clips()[j].x+' '+c.x):(c.x+' '+clips()[j].x)).trim();clips().splice(i,1);E.sel=Math.max(0,i-1);rAll();edited();toast(`${pad3(i+1)}-kadr o'chirildi, qo'shnisi joyini egalladi. Ovoz bilan sinxron buzilmadi`)};

const LEFT=['media','text','audio'];
function setTool(t){const Pn=LEFT.includes(t)?'#lp':'#rp';$$(Pn+' .tool').forEach(x=>x.classList.toggle('on',x.dataset.tool===t));$$(Pn+' .pt').forEach(x=>x.classList.toggle('on',x.dataset.tool===t));if(t==='text')markSel()}
document.addEventListener('click',e=>{const b=e.target.closest('.pt[data-tool]');if(b)setTool(b.dataset.tool)});
const PRE={pill:{font:'Inter',size:17,weight:700,color:'#2b120a',outline:0,bg:'bg-pill',bgColor:'#fff1e6'},kontur:{font:'Inter',size:19,weight:800,color:'#ffffff',outline:4,bg:'',bgColor:'#000000'},kino:{font:'Lora',size:17,weight:500,color:'#ffe7a8',outline:0,bg:'',bgColor:'#000000'},karaoke:{font:'Inter Display',size:20,weight:800,color:'#ffffff',outline:3,bg:'',bgColor:'#000000'}};
const COLS=['#ffffff','#2b120a','#ffe7a8','#F38C64','#ffd84a','#7fe0ff','#111111'],BGC=['#fff1e6','#000000','#E9845A','#ffffff','#ffd84a'];
function renderSwatches(){const pk=(id,hid)=>`<label class="cpk"><input type="color" id="${id}" aria-label="Rang"><input class="input sm hex" id="${hid}" maxlength="7" spellcheck="false" aria-label="Rang kodi"></label>`;
$('#sColor').innerHTML=pk('sColorX','sColorH');$('#sBgC').innerHTML=pk('sBgX','sBgH')+`<div class="ctl" style="margin-top:8px"><div class="hd"><span>Shaffoflik (fon)</span><span class="num" id="sBgAV">100%</span></div><input type="range" id="sBgA" min="0" max="100" value="100" aria-label="Fon qoplanishi"></div>`;
if($('#sOcW'))$('#sOcW').innerHTML=pk('sOcX','sOcH');setSubVars()}
const subSet=(k,v)=>{TL().sub[k]=v;setSubVars();E.lastClip=-1;upd(true);edited()};
$('#presets').addEventListener('click',e=>{const b=e.target.closest('.pre');if(!b)return;Object.assign(TL().sub,PRE[b.dataset.s],{preset:b.dataset.s});syncControls();E.lastClip=-1;upd(true);edited()});
$('#sFont').onchange=e=>subSet('font',e.target.value);$('#sSize').oninput=e=>subSet('size',+e.target.value);$('#sW').oninput=e=>subSet('weight',+e.target.value);$('#sO').oninput=e=>subSet('outline',+e.target.value);$('#pos').oninput=e=>subSet('pos',+e.target.value);
const hexOk=v=>/^#[0-9a-f]{6}$/i.test(v);
const bindPk=(root,key)=>{$(root).addEventListener('input',e=>{const t=e.target;if(t.type==='color')subSet(key,t.value);else if(t.classList.contains('hex')){let v=t.value.trim();if(v&&v[0]!=='#')v='#'+v;if(hexOk(v))subSet(key,v.toLowerCase())}})};
bindPk('#sColor','color');bindPk('#sOcW','outlineColor');
$('#sBg').dataset.own=1;$('#sBg').addEventListener('click',e=>{const b=e.target.closest('[data-b]');if(!b)return;$$('#sBg .pill').forEach(x=>x.classList.toggle('on',x===b));subSet('bg',b.dataset.b)});
bindPk('#sBgC','bgColor');$('#sBgC').addEventListener('input',e=>{if(e.target.id==='sBgA'){TL().sub.bgAlpha=e.target.value/100;setSubVars();E.lastClip=-1;upd(true);edited()}});
$('#subSw').dataset.own=1;$('#subSw').onclick=()=>{TL().sub.on=!TL().sub.on;$('#subSw').classList.toggle('on',TL().sub.on);$('#ccBtn').classList.toggle('on',TL().sub.on);upd();save()};
$('#clipText').addEventListener('input',e=>{const c=clips()[E.sel];c.x=e.target.value;const m=$(`#mBody [data-ci="${E.sel}"] .mlb`);if(m)m.textContent=c.x;E.lastClip=-1;upd(true);clearTimeout(E._rt);E._rt=setTimeout(rTL,600);edited()});
function rAudioPanel(){const a=P.media.audio,m=P.media.music;const sfx=P.media.sfx||[];
$('#aBody').innerHTML=`<div class="mrow"><span class="pb">${isv('mic')}</span><div class="grow"><b>${esc(a?.name||'Ovoz yo\'q')}</b><small>${a?fmt(a.duration)+' · diktor':'6-qadamda qo\'shing'}</small></div></div>
  <div class="mrow"><span class="pb">${isv('note')}</span><div class="grow"><b>${esc(m?.name||'Fon musiqasi yo\'q')}</b><small>${m?fmt(m.duration)+' · takrorlanadi':'Ixtiyoriy'}</small></div><label class="pill xs">${m?'Almashtirish':'Qo\'shish'}<input type="file" accept="audio/*" hidden id="edMusic"></label>${m?'<button class="pill xs" type="button" id="edMusicDel">O\'chirish</button>':''}</div>
  <div class="mrow"><span class="pb">${isv('bolt')}</span><div class="grow"><b>${sfx.length?sfx.length+' ta o\'z effektingiz':'Ichki effektlar'}</b><small>${sfx.length?sfx.slice(0,3).map(s=>esc(s.name)).join(', '):'whoosh, pop, zatvor, klik'}</small></div><label class="pill xs">Qo'shish<input type="file" accept="audio/*" multiple hidden id="edSfx"></label></div>`;
$('#sfxNote').textContent='Effekt eng baland joyi bilan aynan o\'tishga tushadi. Surilish → whoosh, kesish → pop, yorug\'lik → zatvor.';
$('#edMusic').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;await uploadAudioFile(f,'music');musicEl.src=purl(P.media.music.rel);rAudioPanel();rTL();loadWave()};
$('#edMusicDel')&&($('#edMusicDel').onclick=()=>{P.media.music=null;musicEl.removeAttribute('src');rAudioPanel();rTL();save()});
$('#edSfx').onchange=async e=>{const fs=[...e.target.files];e.target.value='';P.media.sfx=P.media.sfx||[];for(const f of fs){const r=await upload('sfx',f);P.media.sfx.push({rel:r.rel,name:r.name})}save();rAudioPanel()}}
$('#vVol').oninput=e=>{TL().audio.voiceVol=+e.target.value;volUpd();save()};$('#mVol').oninput=e=>{TL().audio.musicVol=+e.target.value;volUpd();rTL();save()};$('#sfxVol').oninput=e=>{TL().audio.sfxVol=+e.target.value;volUpd();save()};
$('#sfxMode').dataset.own=1;$('#sfxMode').addEventListener('click',e=>{const b=e.target.closest('[data-sfx]');if(!b)return;$$('#sfxMode .pill').forEach(x=>x.classList.toggle('on',x===b));TL().audio.sfxMode=b.dataset.sfx;rTL();save()});
$('#duckSw').dataset.own=1;$('#duckSw').onclick=()=>{TL().audio.duck=!TL().audio.duck;$('#duckSw').classList.toggle('on',TL().audio.duck);save()};

$('#modes').addEventListener('click',e=>{const b=e.target.closest('.mode');if(!b)return;TL().mode=b.dataset.m;syncControls();E.lastClip=-1;upd(true);edited()});
$('#clipMotion').dataset.own=1;$('#clipMotion').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;snap();clips()[E.sel].motion=b.dataset.v;markSel();E.lastClip=-1;upd(true);edited()});
$('#transSel').dataset.own=1;$('#transSel').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;TL().trans=b.dataset.v;$$('#transSel .pill').forEach(x=>x.classList.toggle('on',x===b));edited()});
$('#trD').oninput=e=>{TL().transD=e.target.value/10;$('#trDv').textContent=TL().transD.toFixed(1)+' s';save()};
const FL=[['Asl','none',0],
['Iliq','sepia(.22) saturate(1.18) hue-rotate(-10deg) brightness(1.03)',0],
['Quyosh','sepia(.3) saturate(1.45) hue-rotate(-18deg) brightness(1.04)',0],
['Retro','sepia(.6) hue-rotate(-12deg) saturate(1.3) contrast(1.05)',1],
['Vintaj','sepia(.45) contrast(.92) brightness(1.05) saturate(.9)',1],
['Kino','contrast(1.15) saturate(.85) brightness(.95)',1],
['Drama','contrast(1.3) saturate(1.15) brightness(.88)',1],
['Kontrast','contrast(1.45) saturate(1.1)',0],
['Jonli','saturate(1.55) contrast(1.08)',0],
['Yorqin','brightness(1.12) contrast(1.05) saturate(1.25)',0],
['Xira','contrast(.88) saturate(.85) brightness(1.06)',0],
['Sovuq','hue-rotate(14deg) saturate(.9) brightness(1.02)',0],
['Okean','hue-rotate(22deg) saturate(1.25) brightness(.98)',0],
['Tungi','brightness(.8) hue-rotate(12deg) saturate(1.1) contrast(1.15)',1],
['Qora-oq','grayscale(1)',0],
['Noir','grayscale(1) contrast(1.4) brightness(.9)',1]];
/* eksport yadrosi faqat eski 6 ta nomni biladi — yangilari eng yaqiniga o'tkaziladi */
const FL_CORE={Quyosh:'Iliq',Retro:'Vintaj',Kontrast:'Drama',Jonli:'Iliq',Yorqin:'Asl',Xira:'Kino',Okean:'Sovuq',Tungi:'Drama','Qora-oq':'Kino',Noir:'Drama'};
function coreFilter(f){return Object.assign({},f,{preset:FL_CORE[f.preset]||f.preset})}
const FL_BASE={sepia:0,'hue-rotate':0,grayscale:0,blur:0,invert:0};
function flCss(f){f=f||{};const p=f.str==null?.7:f.str,x=FL.find(q=>q[0]===f.preset)||FL[0];
let v=x[1]==='none'?'':x[1].replace(/([a-z-]+)\((-?[\d.]+)(deg)?\)/g,(m,fn,a)=>{const base=FL_BASE[fn]!=null?FL_BASE[fn]:1,r=base+(parseFloat(a)-base)*p;return fn+'('+r.toFixed(3)+(fn==='hue-rotate'?'deg':'')+')'});
v+=` brightness(${1+(f.b||0)/100*0.6}) contrast(${1+(f.c||0)/100}) saturate(${1+(f.s||0)/100})`+((f.w||0)>0?` sepia(${f.w/100*0.6})`:(f.w||0)<0?` hue-rotate(${f.w*.5}deg)`:'');
return{css:v.trim()||'none',vig:x[2]*p}}
window.flCss=flCss;
function renderFilters(){const f=curFilterObj();$('#filters').innerHTML=FL.map(x=>`<button type="button" class="flt ${x[0]===f.preset?'on':''}" data-f="${x[0]}"><span class="fs" style="${clips()[E.sel]?`background-image:url('${thumbOf(clips()[E.sel])}');background-size:cover;`:''}filter:${x[1]}"></span>${x[0]}</button>`).join('');
$('#fp').value=Math.round(f.str*100);$('#fpv').textContent=Math.round(f.str*100)+'%';['b','c','s','w'].forEach(k=>{$('#a'+k.toUpperCase()).value=f[k];$('#a'+k.toUpperCase()+'v').textContent=f[k]})}
let colScope='all';
function curFilterObj(){const c=clips()[E.sel];return colScope==='clip'&&c?(c.filter=c.filter||JSON.parse(JSON.stringify(TL().filter))):TL().filter}
function applyFilterCSS(f){const r=flCss(f);$('#bgl').style.filter=r.css;const b2=$('#bgl2');if(b2)b2.style.filter=r.css;$('#vig').style.opacity=r.vig;$('#iFx').textContent=f.preset}
$('#colScope').dataset.own=1;$('#colScope').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;colScope=b.dataset.v;$$('#colScope .pill').forEach(x=>x.classList.toggle('on',x===b));renderFilters()});
$('#filters').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;curFilterObj().preset=b.dataset.f;renderFilters();E.lastClip=-1;upd(true);edited()});
['fp','aB','aC','aS','aW'].forEach(id=>$('#'+id).addEventListener('input',e=>{const f=curFilterObj();if(id==='fp')f.str=e.target.value/100;else f[id[1].toLowerCase()]=+e.target.value;renderFilters();E.lastClip=-1;upd(true);edited()}));
$('#resetC').onclick=()=>{const f=curFilterObj();Object.assign(f,{preset:'Asl',str:0.7,b:0,c:0,s:0,w:0});if(colScope==='clip')delete clips()[E.sel].filter;renderFilters();E.lastClip=-1;upd(true);edited()};

const SUBT={"uz": ["Obuna bo'lish", "Obuna bo'lindi"], "uzc": ["Обуна бўлиш", "Обуна бўлинди"], "ru": ["Подписаться", "Вы подписаны"], "en": ["Subscribe", "Subscribed"], "ar": ["اشترك", "تم الاشتراك"], "tr": ["Abone ol", "Abone olundu"], "kk": ["Жазылу", "Жазылдыңыз"], "ky": ["Жазылуу", "Жазылдыңыз"], "tg": ["Обуна шудан", "Обуна шудед"], "tk": ["Ýazyl", "Ýazyldyňyz"], "az": ["Abunə ol", "Abunə olundu"], "fa": ["اشتراک", "مشترک شدید"], "hi": ["सब्सक्राइब", "सब्सक्राइब किया"], "ur": ["سبسکرائب", "سبسکرائب کیا"], "zh": ["订阅", "已订阅"], "ja": ["チャンネル登録", "登録済み"], "ko": ["구독", "구독중"], "es": ["Suscribirse", "Suscrito"], "pt": ["Inscrever-se", "Inscrito"], "fr": ["S'abonner", "Abonné"], "de": ["Abonnieren", "Abonniert"], "it": ["Iscriviti", "Iscritto"], "pl": ["Subskrybuj", "Subskrybujesz"], "uk": ["Підписатися", "Ви підписані"], "id": ["Subscribe", "Berlangganan"], "vi": ["Đăng ký", "Đã đăng ký"], "th": ["ติดตาม", "กำลังติดตาม"], "nl": ["Abonneren", "Geabonneerd"], "sv": ["Prenumerera", "Prenumererar"], "ro": ["Abonează-te", "Abonat"], "el": ["Εγγραφή", "Εγγεγραμμένος"], "he": ["הרשמה", "נרשמת"]};
const SB_ICON={like:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><path d="M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6C6.2 8 6 8.5 6 9v10c0 1.1.9 2 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7c.1-.2.2-.5.2-.8v-2z"/></svg>',
bell:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6V11c0-3.1-1.6-5.6-4.5-6.3V4a1.5 1.5 0 0 0-3 0v.7C7.6 5.4 6 7.9 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>',
check:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
play:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1.1em" height="1.1em"><rect width="24" height="17" y="3.5" rx="5" fill="#fff"/><path d="M10 8v8l6.5-4z" fill="#e3261f"/></svg>',
cur:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30"><path d="M5 2l14 10-6.2 1.3L16 21l-3 1.2-3.2-7.6L5 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'};
function sbText(t){const T=TL();const l=T.sb.lang||P?.lang||'uz';const r=SUBT[l]||SUBT.en;return[(t&&String(t).trim())||r[0],r[1]]}
function sbHTML(i,t,t2,tm,dur){const [a,b]=sbText(t);const n=(i||0)+1;const anim=tm!=null;
let sc=1,op=1,cx=0,cy=0,cop=0,press=1,done=false,bell=0,lk=1;
if(anim){const e=x=>Math.max(0,Math.min(1,x));const p=e(tm/0.38);const back=p<1?1+2.2*Math.pow(p-1,3)+1.2*Math.pow(p-1,2):1;sc=(0.55+0.45*back);op=e(tm/0.25);
if(dur){op*=e((dur-tm)/0.3)}
if(tm>0.7){const q=e((tm-0.7)/0.75),k=q*q*(3-2*q);cx=(1-k)*70;cy=(1-k)*52;cop=tm<1.62?e((tm-0.7)/0.15):e((1.85-tm)/0.2)}
press=tm>1.45&&tm<1.62?0.93:1;done=tm>=1.55;if(tm>1.7){const u=tm-1.7;bell=Math.sin(u*20)*20*Math.exp(-u*1.5)}
if(tm>1.55){const u=tm-1.55;lk=1+0.35*Math.sin(Math.min(1,u*5)*Math.PI)}}
const label=done?`${SB_ICON.check} ${esc(b)}`:esc(a);
const small=t2?`<span class="ytsm">${esc(t2)}</span>`:'';
return `<span class="yt yt${n}" style="transform:scale(${sc.toFixed(3)});opacity:${op.toFixed(3)}"><span class="ytrow"><span class="ytlike" style="transform:scale(${lk.toFixed(3)})">${SB_ICON.like}</span><span class="ytbtn ${done?'dn':''}" style="transform:scale(${press})">${(n===1||n===8)&&!done?SB_ICON.play+' ':''}${label}</span><span class="ytbell" style="transform:rotate(${bell.toFixed(1)}deg)">${SB_ICON.bell}</span>${anim?`<span class="ytcur" style="transform:translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px);opacity:${cop.toFixed(2)}">${SB_ICON.cur}</span>`:''}</span>${small}</span>`}
const elPosClass=e=>'p-'+(e.k==='sub'?TL().sb.pos:(e.pos||'lb'));
window.elPosClass2=elPosClass;
function elHTML(e,tm){const T=TL();
if(e.k==='sub')return sbHTML(T.sb.v,T.sb.t,T.sb.t2,tm,e.d);
if(e.k==='num'||e.k==='date')return `<span class="ncard"><b>${esc(e.n)}</b>${e.x?`<span>${esc(e.x)}</span>`:''}</span>`;
if(e.k==='name')return `<span class="elcard"><b>${esc(e.n)}</b>${e.x?`<span>${esc(e.x)}</span>`:''}</span>`;
if(e.k==='map')return `<span class="elcard"><b>📍 ${esc(e.n)}</b>${e.x?`<span>${esc(e.x)}</span>`:''}</span>`;
if(e.k==='quote')return `<span class="elquote">${esc(e.n)}</span>`;
if(e.k==='arrow')return `<span class="elarrow">${esc(e.n||'➜')}</span>`;
return esc(e.n||'')}
const ADD={num:{n:'1 000 000',x:'Izoh yozing'},name:{n:'Ism Familiya',x:'Kim ekani'},map:{n:'Shahar',x:'Davlat'},date:{n:String(new Date().getFullYear()),x:'Nima bo\'lgan'},quote:{n:'Muhim gap',x:''},arrow:{n:'➜',x:''}};
function rEls(){const L=TL().els||[];
$('#elList').innerHTML=L.length?L.map((e,i)=>e.k==='sub'?`<div class="mrow"><div class="grow"><b>Obuna tugmasi</b><small>${fmt(e.s)} dan ${e.d.toFixed(0)} soniya · "Obuna" bo'limida sozlanadi</small></div><button type="button" class="pill xs" data-elgo="${i}">Ko'rish</button></div>`:
`<div class="elrow"><div class="row between"><b>${esc(elLabel(e))}</b><div class="row"><button type="button" class="pill xs" data-elgo="${i}">Ko'rish</button><button type="button" class="pill xs" data-eldel="${i}">O'chirish</button></div></div>
    ${e.k==='arrow'?'':`<input class="input sm" data-elf="n" data-i="${i}" value="${esc(e.n)}" aria-label="Matn">`}${['quote','arrow'].includes(e.k)?'':`<input class="input sm" data-elf="x" data-i="${i}" value="${esc(e.x||'')}" placeholder="Izoh" aria-label="Izoh">`}
    <div class="row"><span class="note">Boshlanish</span><input class="input sm" style="width:76px" type="number" step="0.5" min="0" data-elf="s" data-i="${i}" value="${e.s.toFixed(1)}"><span class="note">Davomi</span><input class="input sm" style="width:64px" type="number" step="0.5" min="1" data-elf="d" data-i="${i}" value="${e.d}"></div>
    <div class="row"><span class="note">O'lcham</span><input type="range" class="rng" style="flex:1" min="40" max="250" step="5" data-elf="sc" data-i="${i}" value="${Math.round((e.sc||1)*100)}" aria-label="O'lcham"><span class="note" style="min-width:40px">${Math.round((e.sc||1)*100)}%</span></div>
    <div class="seg sm2" data-own="1">${[['lb','Chap'],['rb','O\'ng'],['c','O\'rta']].map(p=>`<button class="pill ${(e.pos||'lb')===p[0]?'on':''}" type="button" data-elpos="${p[0]}" data-i="${i}">${p[1]}</button>`).join('')}</div></div>`).join(''):'<p class="note">Hali element yo\'q.</p>'}
function showEl(e){E.t=Math.min(total()-0.05,e.s+0.2);E.curEl=undefined;upd(true);follow()}
$('#elList').addEventListener('click',e=>{const L=TL().els;const g=e.target.closest('[data-elgo]');if(g){showEl(L[+g.dataset.elgo]);return}
const d=e.target.closest('[data-eldel]');if(d){snap();L.splice(+d.dataset.eldel,1);rEls();rTL();E.curEl=undefined;upd(true);edited();return}
const p=e.target.closest('[data-elpos]');if(p){L[+p.dataset.i].pos=p.dataset.elpos;rEls();E.curEl=undefined;showEl(L[+p.dataset.i]);edited()}});
$('#elList').addEventListener('input',e=>{const f=e.target.dataset.elf;if(!f)return;const x=TL().els[+e.target.dataset.i];
if(f==='sc'){const v=parseFloat(e.target.value);if(!isNaN(v)){x.sc=+(v/100).toFixed(2);const l=e.target.nextElementSibling;if(l)l.textContent=Math.round(v)+'%'}}else if(f==='s'||f==='d'){const v=parseFloat(e.target.value);if(isNaN(v))return;x[f]=f==='d'?Math.max(1,v):Math.max(0,Math.min(total()-1,v))}else x[f]=e.target.value;
E.curEl=undefined;upd(true);clearTimeout(E._et);E._et=setTimeout(rTL,500);edited()});
$('#addg').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(!b)return;const k=b.dataset.add;snap();
const el={id:'e'+Date.now().toString(36),k,...ADD[k],s:+E.t.toFixed(1),d:k==='arrow'?3:5,pos:k==='quote'?'c':'lb'};
if(k==='num'){const m=(clips()[clipAt(E.t)].x||'').match(/\d[\d\s.,]*\d|\d/);if(m)el.n=m[0].trim()}
TL().els.push(el);rEls();rTL();showEl(el);edited();toast(`${elLabel(el)} ${fmt(el.s)} ga qo'shildi. Matnini pastda o'zgartiring`)});
function sbEl(){let s=TL().els.find(x=>x.k==='sub');if(!s){s={id:'sb',k:'sub',s:Math.min(45,total()*0.25),d:5};TL().els.push(s)}return s}
function rSb(){const f=E.sblf||'all',T=TL();$('#sbx').innerHTML=SBS.map((b,i)=>f==='all'||(f==='uz')===(b[0]==='uz')?`<button type="button" class="${i===T.sb.v?'on':''}" data-v="${i}" aria-label="${b[1]}: ${b[2]}"><span class="lgx">${b[1]}</span>${sbHTML(i)}</button>`:'').join('')}
$('#sbLangSel').innerHTML='<option value="">Video tili bo\'yicha</option>'+LANGS.map(l=>`<option value="${l[0]}">${l[1]}</option>`).join('');
$('#sbLangSel').onchange=e=>{TL().sb.lang=e.target.value;rSb();E.curEl=undefined;upd(true);edited()};
$('#sbx').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;const T=TL();T.sb.v=+b.dataset.v;T.sb.t='';$('#sbText').value='';rSb();showEl(sbEl());edited()});
$('#sbLang').dataset.own=1;$('#sbLang').addEventListener('click',e=>{const b=e.target.closest('[data-l]');if(!b)return;$$('#sbLang .pill').forEach(x=>x.classList.toggle('on',x===b));E.sblf=b.dataset.l;rSb()});
$('#sbOn').dataset.own=1;$('#sbOn').onclick=()=>{const T=TL();T.sb.on=!T.sb.on;$('#sbOn').classList.toggle('on',T.sb.on);if(T.sb.on)sbEl();rTL();E.curEl=undefined;upd(true);edited()};
$('#sbSc').addEventListener('input',e=>{const s=sbEl(),v=+e.target.value;s.sc=+(v/100).toFixed(2);$('#sbScV').textContent=v+'%';E.curEl=undefined;upd(true);clearTimeout(E._sbs);E._sbs=setTimeout(edited,300)});
$('#sbText').addEventListener('input',e=>{TL().sb.t=e.target.value;E.curEl=undefined;upd(true);save()});
$('#sbText2').addEventListener('input',e=>{TL().sb.t2=e.target.value;E.curEl=undefined;upd(true);save()});
$('#sbPos').dataset.own=1;$('#sbPos').addEventListener('click',e=>{const b=e.target.closest('[data-p]');if(!b)return;TL().sb.pos=b.dataset.p;$$('#sbPos .pill').forEach(x=>x.classList.toggle('on',x===b));E.curEl=undefined;showEl(sbEl());save()});
$('#sbWhen').dataset.own=1;$('#sbWhen').addEventListener('click',e=>{const b=e.target.closest('[data-w]');if(!b)return;$$('#sbWhen .pill').forEach(x=>x.classList.toggle('on',x===b));const s=sbEl(),tot=total(),w=b.dataset.w;
s.s=Math.max(0,Math.min(tot-s.d,w==='45'?Math.min(45,tot*0.25):w==='mid'?tot/2:w==='end'?tot-s.d-2:E.t));rTL();rEls();showEl(s);edited()});

const NUMRE=/(\d{1,3}(?:[ .,]\d{3})+|\d{3,}|\d+(?:[.,]\d+)?\s?%|\d+)/;
const AIA=[
['realign','Rasmlarni qayta joylash','Har rasm o\'z gapi boshlangan joyga tushadi'],
['punch','Muhim joylarga zarba','Savol, raqam yoki undov bor kadrda kamera yaqinlashadi'],
['sfx','O\'tishlarga tovush','Kadr almashganda yengil whoosh yoki klik'],
['numbers','Raqamlarni ko\'rsatish','Matndagi muhim raqam ekranga chiqadi'],
['kw','Muhim so\'zni ajratish','Subtitrdagi asosiy so\'z rangli bo\'ladi'],
['check','Tekshirish','Juda qisqa kadr, takror rasm va bo\'sh matnni topadi']];
$('#aiList').innerHTML=AIA.map(a=>`<div class="air"><div class="air-t"><b>${a[1]}</b><small>${a[2]}</small></div><button class="pill xs" type="button" data-ai="${a[0]}">Bajarish</button></div>`).join('');
async function runAction(k){const C=clips(),T=TL();let msg='';
if(k==='realign'){if(await buildTimeline()){openEditor();msg='Rasmlar gaplarga qayta moslandi'}else return 'Bajarilmadi'}
else if(k==='punch'){snap();let n=0;C.forEach((c,i)=>{if(i&&/[!?]|\d/.test(c.x||'')&&(c.motion||'auto')==='auto'){c.motion='punch';n++}});msg=n?`${n} ta zarbali kadr topildi`:'Zarbali joy topilmadi'}
else if(k==='sfx'){T.audio.sfxMode='all';msg=`${C.length-1} ta o'tishga ovoz qo'yildi`}
else if(k==='numbers'){snap();const st=starts();let n=0;C.forEach((c,i)=>{if(n>=8)return;const m=(c.x||'').match(NUMRE);if(!m||m[0].replace(/\D/g,'').length<2)return;
if(T.els.some(e=>Math.abs(e.s-st[i])<6))return;const w=(c.x||'').split(/\s+/);const at=w.findIndex(x=>x.includes(m[0].split(/[ .,]/)[0]));
T.els.push({id:'e'+i,k:/^(1[5-9]|20)\d\d$/.test(m[0])?'date':'num',n:m[0].trim(),x:w.slice(at+1,at+5).join(' ').replace(/[.,!?]+$/,''),s:+(st[i]+0.3).toFixed(1),d:Math.min(5,Math.max(2.5,c.d)),pos:'lb'});n++});msg=n?`${n} ta raqam kartochkasi qo'shildi`:'Matnda raqam topilmadi'}
else if(k==='kw'){T.sub.kw=true;msg='Kalit so\'zlar endi ajralib turadi'}
else if(k==='dyn'){snap();C.slice(0,3).forEach(c=>c.motion='punch');msg='Birinchi 3 kadr jonlantirildi'}
else if(k==='past'){const re=/ilgari|o'tmish|yil oldin|asr|qadim|tarix|bir paytlar|eski|раньше|давно|years ago|century/i;let n=0;C.forEach(c=>{if(re.test(c.x||'')){c.filter={preset:'Vintaj',str:0.8,b:0,c:0,s:0,w:0};n++}});msg=n?`${n} ta "o'tmish" kadriga vintaj filtr berildi`:'O\'tmish haqidagi gap topilmadi'}
else if(k==='drama'){C.slice(-3).forEach(c=>c.filter={preset:'Drama',str:0.7,b:0,c:0,s:0,w:0});msg='Oxirgi 3 kadr dramatik ranglarda'}
else if(k==='sbmid'){T.sb.on=true;const s=sbEl();s.s=total()/2;msg='Obuna tugmasi videoning o\'rtasiga ko\'chdi'}
else if(k==='quote'){let bi=-1,bl=0;C.forEach((c,i)=>{const x=c.x||'';const sc=(/!/.test(x)?50:0)+Math.min(40,x.length);if(i>2&&sc>bl&&x.length<90){bl=sc;bi=i}});if(bi<0)return'Mos gap topilmadi';snap();T.els.push({id:'q'+bi,k:'quote',n:C[bi].x.replace(/[.!?]+$/,''),s:+(starts()[bi]+0.2).toFixed(1),d:Math.min(4,C[bi].d),pos:'c'});msg=`${pad3(bi+1)}-kadrga iqtibos qo'yildi`}
else if(k==='duck'){T.audio.duck=true;msg='Gap paytida musiqa pasayadi'}
else if(k==='check'){const st=starts();const L=[];C.forEach((c,i)=>{if(c.d<0.7)L.push(`${pad3(i+1)}: juda qisqa (${c.d.toFixed(2)} s)`);if(i&&c.img===C[i-1].img)L.push(`${pad3(i+1)}: oldingi kadr bilan bir xil rasm`);if(!c.x&&P.frames?.length)L.push(`${pad3(i+1)}: matni yo'q`)});
const a=P.media.audio?.duration||0;if(a&&Math.abs(a-total())>1)L.push(`Kadrlar uzunligi (${fmt(total())}) ovozdan (${fmt(a)}) farq qiladi`);
if(L.length){modal('Tekshiruv natijasi',`<div class="checks">${L.slice(0,60).map(x=>`<div class="ck warn"><i class="dot warn"></i><span>${esc(x)}</span></div>`).join('')}</div>`);return L.length+' ta muammo topildi'}return 'Xato topilmadi'}
rAll();syncControls();edited();return msg}
$('#aiList').addEventListener('click',async e=>{const b=e.target.closest('[data-ai]');if(!b||b.disabled)return;b.disabled=true;b.innerHTML='<span class="spin"></span>';try{toast(await runAction(b.dataset.ai))}catch(er){toast(er.message,1)}b.disabled=false;b.textContent='Bajarish'});
const IDEAS_L=[
['Boshlanish','Boshini jonli qiling','Birinchi 3 kadrda kamera yaqinlashadi. Tomoshabin darrov ketib qolmaydi.','dyn'],
['Matn','Muhim so\'z rangli','Har gapdagi asosiy so\'z yoki raqam ajralib turadi.','kw'],
['Ko\'rinish','Raqamlar kartochkada','Raqamlar ekranda katta chiqadi va esda qoladi.','numbers'],
['Ko\'rinish','O\'tmish eski plyonkada','"Ilgari", "qadimda" degan gaplar vintaj rangda chiqadi.','past'],
['Tuzilish','Obuna tugmasi o\'rtada','Video o\'rtasida tomoshabin eng qiziqqan bo\'ladi, tugma ko\'proq bosiladi.','sbmid'],
['Ko\'rinish','Kuchli gapni ajrating','Eng ta\'sirli gap ekran o\'rtasida katta chiqadi.','quote'],
['Ovoz','Gapda musiqa pasaysin','Diktor gapirganda musiqa pasayadi, pauzada qaytadi.','duck'],
['Ko\'rinish','Kuchli yakun','Oxirgi 3 kadr to\'qroq va kontrastli bo\'ladi.','drama'],
['Boshlanish','Savollarda zarba','Savol va raqamli kadrlarda kamera yaqinlashadi.','punch']];
function ideaCard(d){return `<div class="air idea"><div class="air-t"><span class="tg">${esc(d[0])}</span><b>${esc(d[1])}</b><small>${esc(d[2])}</small></div>${d[3]?`<button type="button" class="pill xs" data-idea="${d[3]}">Qo'llash</button>`:'<span class="note">Qo\'lda</span>'}</div>`}
function rIdeas(){$('#ideaList').innerHTML=[...IDEAS_L].sort(()=>Math.random()-.5).slice(0,4).map(ideaCard).join('')}
$('#moreIdeas').onclick=async()=>{if(!aiReady()){rIdeas();toast('AI kaliti yo\'q. Tayyor g\'oyalardan ko\'rsatildi');return}
const b=$('#moreIdeas');b.disabled=true;b.innerHTML='<span class="spin"></span>';
const C=clips(),st=starts();const sample=C.filter((_,i)=>i%Math.max(1,Math.floor(C.length/25))===0).map(c=>`[${fmt(st[C.indexOf(c)])}] ${c.x||''}`).join('\n');
const acts='dyn (boshini jonlantirish), kw (kalit so\'z rangli), numbers (raqam kartochkalari), past (o\'tmish kadrlari vintaj), sbmid (obuna o\'rtada), quote (kuchli gap iqtibos), duck (musiqa pasayishi), drama (final dramatik), punch (zarbali kadrlar)';
try{const t=await ai(`Video: "${P.name}". ${C.length} kadr, ${fmt(total())}. Hozirgi sozlamalar: harakat ${TL().mode}, filtr ${TL().filter.preset}, subtitr ${TL().sub.on?'bor':'yo\'q'}, musiqa ${P.media.music?'bor':'yo\'q'}.
Ssenariydan parchalar:\n${sample}\n
Shu video montaji uchun muallif o'ylamagan bo'lishi mumkin bo'lgan 5 ta aniq g'oya ber. Har g'oya shu videoning mazmuniga bog'langan bo'lsin (vaqt yoki gapni ayt). Agar g'oyani dastur bajara olsa "a" maydoniga shulardan birini yoz: ${acts}. Bajara olmasa "a" bo'sh qolsin.
Faqat JSON qaytar: [{"tg":"Ushlab qolish|Vizual|Ovoz|Matn|Tuzilish","t":"qisqa sarlavha","d":"1-2 gap izoh","a":""}]. Til: o'zbek, oddiy, jonli.`,{temperature:1,maxTokens:1500});
const L=jsonFrom(t);if(!Array.isArray(L)||!L.length)throw new Error('AI javobi tushunarsiz');const ok=AIA.map(a=>a[0]).concat(IDEAS_L.map(x=>x[3]));
$('#ideaList').innerHTML=L.slice(0,6).map(x=>ideaCard([x.tg||'G\'oya',x.t||'',x.d||'',ok.includes(x.a)?x.a:''])).join('')}
catch(er){toast('AI: '+er.message,1);rIdeas()}b.disabled=false;b.textContent='AI\'dan so\'rash'};
$('#ideaList').addEventListener('click',async e=>{const b=e.target.closest('[data-idea]');if(!b||b.disabled)return;b.disabled=true;const m=await runAction(b.dataset.idea);b.textContent='✓ Qo\'llandi';b.closest('.idea').classList.add('done');toast(m+'. Yoqmasa Ctrl+Z')});

$('#edBack').onclick=()=>{togglePlay(false);go(6)};
$('#edExport').onclick=()=>{togglePlay(false);P.step=8;go(8)};

/* =====================================================================
EXPORT (step 8)
===================================================================== */
const QUAL=[['720','720p','Kuchsiz kompyuter uchun'],['1080','1080p','12 Mbit/s · tavsiya'],['2160','4K','40 Mbit/s · sekinroq']];
function dims(q,fmtx){const h={720:720,1080:1080,2160:2160}[q]||1080,w=Math.round(h*16/9);return fmtx==='short'?[h,w]:[w,h]}
let RJ=null;
function renderStep8(){P.export=Object.assign({q:'1080',fps:30,enc:'auto',coverText:''},P.export);const X=P.export;
$('#qual').innerHTML=QUAL.map(q=>`<button type="button" class="cp ${q[0]===X.q?'sel':'off'}" data-q="${q[0]}"><span class="cap">${q[0]==='2160'?'4K':q[0]==='1080'?'HD':'SD'}</span><span class="body"><span class="txt"><span class="t">${q[1]}</span><span class="d">${q[2]}</span></span></span></button>`).join('');
$$('#encSel .pill').forEach(b=>b.classList.toggle('on',b.dataset.e===X.enc));$$('#fpsSel .pill').forEach(b=>b.classList.toggle('on',+b.dataset.v===X.fps));
const ff=INFO?.ffmpeg||{};if(INFO?.local)$('#encInfo').textContent='Video qurilmaning o\'z kodlovchisi bilan yig\'iladi. Videokarta bo\'lsa, u ishlatiladi.';else $('#encInfo').textContent=ff.status!=='ready'?'Video dvigateli hali tayyor emas: '+(ff.message||'yuklanmoqda'):/nvenc|qsv|amf/.test(ff.encoder||'')?`Videokarta topildi (${ff.encoder}). Render tez bo'ladi.`:'Videokarta kodlovchisi topilmadi. Protsessorda render qilinadi.';
$('#outDirNote').textContent='Saqlanadi: '+(INFO?.outDir||'');
if(!RJ){$('#expSetup').hidden=false;$('#expRun').hidden=true}
renderCovers();renderSeo()}
$('#qual').addEventListener('click',e=>{const b=e.target.closest('[data-q]');if(!b)return;P.export.q=b.dataset.q;renderStep8();save()});
$('#encSel').addEventListener('click',e=>{const b=e.target.closest('[data-e]');if(b){P.export.enc=b.dataset.e;save()}});
$('#fpsSel').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(b){P.export.fps=+b.dataset.v;save()}});

const FONTF={'Inter|400':'Inter-Regular','Inter|500':'Inter-Medium','Inter|600':'Inter-SemiBold','Inter|700':'Inter-Bold','Inter|800':'Inter-Bold','Inter Display|700':'InterDisplay-Bold','Lora|400':'Lora-Variable','Poppins|700':'Poppins-Bold'};
const fontCache={};
async function fontData(file){if(!fontCache[file]){const b=await (await fetch('fonts/'+file+'.woff')).blob();fontCache[file]=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b)})}return fontCache[file]}
async function fontCSS(fams){let css='';for(const [k,file] of Object.entries(FONTF)){const [fam,w]=k.split('|');if(!fams.includes(fam))continue;css+=`@font-face{font-family:"${fam}";src:url(${await fontData(file)}) format("woff");font-weight:${fam==='Lora'?'400 700':w}}`}return css}
let EXCSS=null;
function exportCSS(){if(EXCSS)return EXCSS;let s='';for(const sh of document.styleSheets){let rules;try{rules=sh.cssRules}catch(_){continue}for(const r of rules){const sel=r.selectorText||'';
if(sel===':root'||(/\.sv\d*\b|\.ncard|\.elcard|\.elquote|\.elarrow|\.sub-o|\.ovl\.p-|\.ovl\.free|\.yt/.test(sel)&&!/\.sbg|\.vert|\.on\b/.test(sel)))s+=r.cssText.replace(/animation[^;]*;?/g,'')}}
return EXCSS=s+'.ovl{position:absolute;left:4%;bottom:22%;display:flex}.sub-o{transition:none}'}
function svgImg(html,W,H,css){const x=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;position:relative;overflow:hidden;font-family:Inter,sans-serif"><style>${css}</style>${html}</div></foreignObject></svg>`;
return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('Yozuvni rasmga aylantirib bo\'lmadi'));im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(x)})}
async function htmlPng(html,W,H,css){const im=await svgImg(html,W,H,css);try{await im.decode()}catch(_){}const cv=document.createElement('canvas');cv.width=W;cv.height=H;cv.getContext('2d').drawImage(im,0,0);return new Promise(r=>cv.toBlob(r,'image/png'))}
function subHTMLFor(c,W,H){const s=TL().sub,k=Math.min(W,H)/360;const T=subTokens(c.x);
const sh=s.preset==='kontur'||s.preset==='karaoke'?`0 ${2*k}px ${6*k}px rgba(0,0,0,.7)`:s.preset==='kino'?`0 ${k}px ${6*k}px rgba(0,0,0,.8)`:'none';
const st=`--sf:'${s.font}',Inter,sans-serif;--ss:${s.size*k}px;--sw:${s.weight};--so:${s.outline*k*0.5}px;--sc:${s.color};--sa:${s.accent};--sb:${s.pos}%;--sbg:${bgRGBA(s)};--soc:${s.outlineColor||'#000000'};text-shadow:${sh};${s.bg==='bg-pill'?`padding:${6*k}px ${16*k}px;`:s.bg==='bg-box'?`padding:${6*k}px ${14*k}px;border-radius:${6*k}px;`:''}`;
return `<div class="sub-o ${s.bg||''}" style="${st}">${T.map(t=>t.a?`<em style="color:${s.accent}">${esc(t.w)}</em>`:esc(t.w)).join(' ')}</div>`}
function elHTMLFor(e,W,H,tm){const k=Math.min(W,H)/360*elFmtK(W,H);if(e.x!=null)return `<div class="ovl free on" style="left:${e.x}%;top:${e.y}%;--sc:${e.sc||1};zoom:${k}">${elHTML(e,tm)}</div>`;return `<div class="ovl ${elPosClass(e)}" style="--sc:${e.sc||1};zoom:${k}">${elHTML(e,tm)}</div>`}
async function htmlPngBatch(htmls,W,H,css){const n=htmls.length;const body=htmls.map((h,k)=>`<div style="position:absolute;left:0;top:${k*H}px;width:${W}px;height:${H}px;overflow:hidden">${h}</div>`).join('');
const im=await svgImg(body,W,H*n,css);try{await im.decode()}catch(_){}const big=document.createElement('canvas');big.width=W;big.height=H*n;big.getContext('2d').drawImage(im,0,0);
const out=[];for(let k=0;k<n;k++){const c=document.createElement('canvas');c.width=W;c.height=H;c.getContext('2d').drawImage(big,0,k*H,W,H,0,0,W,H);out.push(await new Promise(r=>c.toBlob(r,'image/png')))}return out}
async function makeLayers(W,H,onP){const T=TL(),vis=T.vis||{};const css0=exportCSS();const fams=['Inter','Inter Display',T.sub.font];const css=(await fontCSS(fams))+css0;
const subs=[],ovs=[];const C=clips();const useSub=T.sub.on&&vis.txt!==false;let first=true;
const up=async(blob,name)=>{const r=await upload('overlays',new File([blob],name,{type:'image/png'}),{clear:first});first=false;return r.rel};
const stt=starts();const sIdx=[];if(useSub)C.forEach((c,i)=>{subChunks(c,stt[i]).forEach(h=>sIdx.push({i,h}))});
const eIdx=[];if(vis.el!==false)(T.els||[]).forEach((e,i)=>{if(e.k!=='sub'||T.sb.on)eIdx.push(i)});
const SBF=12,sbFrames=e=>Math.max(1,Math.ceil(e.d*SBF));
const totalN=sIdx.length+eIdx.reduce((a,i)=>a+(T.els[i].k==='sub'?sbFrames(T.els[i]):1),0);let done=0;const pend=[];
const queue=async(blob,name,set)=>{if(first){set(await up(blob,name));return}const p=up(blob,name).then(set);pend.push(p);if(pend.length>=6)await Promise.all(pend.splice(0))};
const per=Math.max(1,Math.min(24,Math.floor(30000/H)));
for(let k=0;k<sIdx.length;k+=per){if(RJ?.canceled)throw new Error('To\'xtatildi');const part=sIdx.slice(k,k+per);
const blobs=await htmlPngBatch(part.map(o=>subHTMLFor({x:o.h.w.join(' ')},W,H)),W,H,css);
for(let q=0;q<part.length;q++){const o=part[q];await queue(blobs[q],`s_${pad3(o.i+1)}_${k+q}.png`,rel=>ovs.push({png:rel,s:+o.h.t0.toFixed(3),d:+(o.h.t1-o.h.t0).toFixed(3)}))}done+=part.length;onP(done/totalN)}
for(const i of eIdx){if(RJ?.canceled)throw new Error('To\'xtatildi');const e=T.els[i];
if(e.k==='sub'){const nF=sbFrames(e),dt=e.d/nF;for(let f0=0;f0<nF;f0+=per){if(RJ?.canceled)throw new Error('To\'xtatildi');const idx=[];for(let f=f0;f<Math.min(nF,f0+per);f++)idx.push(f);
const bl=await htmlPngBatch(idx.map(f=>elHTMLFor(e,W,H,(f+0.5)*dt)),W,H,css);for(let q=0;q<idx.length;q++){const f=idx[q];await queue(bl[q],`e_${pad3(i+1)}_${f}.png`,rel=>ovs.push({png:rel,s:+(e.s+f*dt).toFixed(3),d:+dt.toFixed(3)}))}done+=idx.length;onP(done/totalN)}continue}
const b=await htmlPng(elHTMLFor(e,W,H),W,H,css);await queue(b,`e_${pad3(i+1)}.png`,rel=>ovs.push({png:rel,s:e.s,d:e.d}));onP(++done/totalN)}
await Promise.all(pend);
if(first){/* nothing uploaded: clear old */try{await api(`/api/projects/${P.id}/delete-media?kind=overlays&all=1`,{method:'POST'})}catch(_){}}
return {subs,ovs}}
function setRing(p){$('#arc').style.strokeDashoffset=553*(1-Math.max(0,Math.min(1,p)));$('#pct').textContent=Math.round(p*100)+'%'}
$('#renderBtn').onclick=async()=>{try{INFO=await api('/api/info')}catch(_){}
if(INFO?.ffmpeg?.status!=='ready'){toast('Video dvigateli (ffmpeg) hali tayyor emas. Bosh sahifadagi yuklanishni kuting',1);return}
if(!P.tl?.clips?.length){toast('Montaj bo\'sh',1);return}
const X=P.export;const [W,H]=dims(X.q,P.format);RJ={canceled:false,t0:Date.now()};
$('#expSetup').hidden=true;$('#expRun').hidden=false;$('#rRun').hidden=false;$('#rDone').hidden=true;$('#rTitle').textContent='Tayyorlanmoqda';$('#rEnc').textContent='—';$('#rLeft').textContent='—';setRing(0);
const tick=setInterval(()=>{$('#rTime').textContent=fmt((Date.now()-RJ.t0)/1000)},500);
try{$('#rStage').textContent='Subtitr va elementlar chizilmoqda';
const _lt=performance.now();const {subs,ovs}=await makeLayers(W,H,p=>{setRing(p*0.05);$('#rStage').textContent=`Subtitr va elementlar chizilmoqda · ${Math.round(p*100)}%`});
dlog('ui','Subtitr va elementlarni chizish',{ms:performance.now()-_lt,x:{subs:subs.filter(Boolean).length,els:ovs.length,w:W,h:H}});
const T=TL();const body={project:P.id,name:P.name,format:P.format,quality:X.q,fps:X.fps,encoder:X.enc,mode:T.mode,trans:T.trans,transD:T.transD,filter:coreFilter(T.filter),
clips:clips().map((c,i)=>({img:c.img,d:c.d,motion:motionOf(i),sub:subs[i]||'',filter:c.filter?coreFilter(c.filter):null,trans:c.trans||''})),overlays:ovs,
audio:{voice:(T.vis||{}).aud===false?'':P.media.audio?.rel||'',voiceVol:T.audio.voiceVol/100,music:(T.vis||{}).mus===false?'':P.media.music?.rel||'',musicVol:T.audio.musicVol/100,duck:T.audio.duck,sfxMode:(T.vis||{}).sfx===false?'off':T.audio.sfxMode,sfxVol:T.audio.sfxVol/100}};
if(RJ.canceled)throw new Error('To\'xtatildi');
if(audEdited()){$('#rStage').textContent='Ovoz tayyorlanmoqda';try{if(T.aseg.voice&&P.media.audio&&(T.vis||{}).aud!==false)body.audio.voice=await mixSegs('voice');if(T.aseg.music&&P.media.music&&(T.vis||{}).mus!==false)body.audio.music=await mixSegs('music')}catch(er){throw new Error('Ovozni birlashtirib bo\'lmadi: '+er.message)}}
const r=await api('/api/render/start',{method:'POST',body});if(!r.ok)throw new Error(r.message||'Render boshlanmadi');RJ.id=r.id;$('#rTitle').textContent='Render ketyapti';
for(;;){await sleep(800);const j=await api('/api/render/status?id='+RJ.id);const p=0.05+0.95*(j.progress||0);setRing(p);$('#rStage').textContent=j.stage||'';$('#rEnc').textContent=j.encoder||'—';
const el=(Date.now()-RJ.t0)/1000;if(j.progress>0.03)$('#rLeft').textContent=fmt(el/p-el);
if(j.status==='done'){RJ.out=j.output;setRing(1);$('#rTitle').textContent='Tayyor!';$('#rStage').textContent=`${j.output} · ${(j.size/1048576).toFixed(1)} MB`;$('#rLeft').textContent='0:00';$('#rRun').hidden=true;$('#rDone').hidden=false;
P.status='done';P.lastOutput=j.output;save();toast('Video tayyor');try{new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=').play()}catch(_){}break}
if(j.status==='error')throw new Error(j.error||'Render xatosi');if(j.status==='canceled')throw new Error('To\'xtatildi')}}
catch(er){$('#rTitle').textContent=er.message==='To\'xtatildi'?'To\'xtatildi':'Xato';$('#rStage').textContent=er.message;$('#rRun').hidden=true;$('#rDone').hidden=false;$('#rReveal').hidden=true;if(er.message!=='To\'xtatildi')toast(er.message,1)}
finally{clearInterval(tick);const keep=RJ;RJ=null;$('#rReveal').hidden=!keep?.out;RJ_LAST=keep}};
let RJ_LAST=null;
$('#rCancel').onclick=async()=>{if(!RJ)return;RJ.canceled=true;if(RJ.id)await api('/api/render/cancel?id='+RJ.id,{method:'POST'}).catch(()=>{});$('#rStage').textContent='To\'xtatilmoqda…'};
$('#rReveal').onclick=()=>api('/api/reveal?path='+encodeURIComponent(RJ_LAST?.out||P.lastOutput||''),{method:'POST'});
$('#rAgain').onclick=()=>{$('#expSetup').hidden=false;$('#expRun').hidden=true};

const loadImg=src=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src});
function coverText(){return (P.export.coverText||P.seo?.cover||P.name||'').trim()}
function wrapLines(g,text,maxW){const words=text.split(/\s+/);const L=[];let cur='';for(const w of words){const t=cur?cur+' '+w:w;if(g.measureText(t).width>maxW&&cur){L.push(cur);cur=w}else cur=t}if(cur)L.push(cur);return L}

/* ===== Muqova: har yo'nalishning haqiqiy kanal qoidasi bo'yicha ===== */
const THS={d_history:{f:'700 {s}px Lora,Georgia,serif',c:'#111',st:'#fff',pos:'tr',n:2},d_finance:{f:'800 {s}px "Inter Display",Inter,sans-serif',c:'#111',pos:'tc',frame:1,line:'#e3261f',n:3},
d_paint:{f:'800 {s}px "Inter Display",Inter,sans-serif',c:'#111',c2:'#e3261f',split:1,n:3},d_ancient:{f:'800 {s}px Impact,"Inter Display",sans-serif',c:'#FFE600',st:'#000',pos:'tc',n:3},
d_mind:{f:'800 {s}px "Inter Display",Inter,sans-serif',c:'#111',c2:'#FFE600',pos:'tc',frame:1,n:3},d_horror:{f:'800 {s}px Impact,"Inter Display",sans-serif',c:'#fff',c2:'#e3261f',st:'#000',pos:'bc',dark:1,n:3},
d_chalk:{f:'700 {s}px "Segoe Print","Comic Sans MS","Inter Display",sans-serif',c:'#FFE066',pos:'tc',dark:1,n:3},d_medical:{f:'800 {s}px "Inter Display",Inter,sans-serif',c:'#fff',st:'#0a3d62',pos:'tc',n:3},
d_wojak:{f:'800 {s}px Impact,"Inter Display",sans-serif',c:'#fff',st:'#000',pos:'bc',n:3},d_brand:{f:'800 {s}px Rockwell,Georgia,serif',c:'#111',st:'#fff',pos:'tr',n:1},
d_apoc:{f:'800 {s}px Impact,"Inter Display",sans-serif',c:'#fff',st:'#000',pos:'tc',box:'#e3261f',n:2},d_agarsen:{none:1,paper:1},d_jobs:{none:1}};
function coverTpl(g,W,H,imgs,i,text,hue){const T=tplOf(P.tpl),cfg=THS[T.id];if(!cfg)return false;const k=W/1280,im=imgs[0]||imgs[1];
const draw=(x,y,w,h,zf)=>{g.save();g.beginPath();g.rect(x,y,w,h);g.clip();if(!im){g.fillStyle='#222';g.fillRect(x,y,w,h)}else{g.filter='saturate(1.22) contrast(1.08)';const r=Math.max(w/im.width,h/im.height)*(1.12+0.1*(i%3)),iw=im.width*r,ih=im.height*r,fx=[.5,.32,.68][i%3];g.drawImage(im,x+(w-iw)*fx,y+(h-ih)/2,iw,ih);g.filter='none'}g.restore()};
const words=String(text||'').toUpperCase().split(/\s+/).filter(Boolean).slice(0,cfg.n||3);const t=words.join(' ');
if(cfg.paper){g.fillStyle='#f3ead7';g.fillRect(0,0,W,H);const m=22*k;g.save();g.shadowColor='rgba(0,0,0,.4)';g.shadowBlur=14*k;g.fillStyle='#fff';g.fillRect(m,m,W-2*m,H-2*m);g.restore();draw(m*2,m*2,W-4*m,H-4*m);return true}
if(cfg.none){draw(0,0,W,H);return true}
let x0=0,y0=0,w0=W,h0=H;
if(cfg.frame){g.fillStyle='#fff';g.fillRect(0,0,W,H);const m=26*k;x0=m;y0=m;w0=W-2*m;h0=H-2*m}
if(cfg.split){g.fillStyle='#fff';g.fillRect(0,0,W,H);draw(0,0,W*.52,H);let fs=130*k;g.font=cfg.f.replace('{s}',fs);let L=wrapLines(g,t+'?',W*.4);while(L.length>3&&fs>40){fs-=8;g.font=cfg.f.replace('{s}',fs);L=wrapLines(g,t+'?',W*.4)}
g.textBaseline='alphabetic';L.forEach((l,j)=>{g.fillStyle=j===L.length-1?cfg.c2:cfg.c;g.fillText(l,W*.56,(H-L.length*fs*1.05)/2+fs*.95+j*fs*1.05)});return true}
draw(x0,y0,w0,h0);
if(cfg.dark){const gr=g.createLinearGradient(0,0,0,H);gr.addColorStop(0,'rgba(0,0,0,.55)');gr.addColorStop(.5,'rgba(0,0,0,.15)');gr.addColorStop(1,'rgba(0,0,0,.75)');g.fillStyle=gr;g.fillRect(x0,y0,w0,h0)}
let fs=(cfg.pos==='tr'?120:150)*k;const mw=(cfg.pos==='tr'?w0*.46:w0*.88);g.font=cfg.f.replace('{s}',fs);let L=wrapLines(g,t,mw);while((L.length>2||Math.max(...L.map(l=>g.measureText(l).width))>mw)&&fs>40){fs-=6;g.font=cfg.f.replace('{s}',fs);L=wrapLines(g,t,mw)}
const lh=fs*1.05,th=L.length*lh;let ty=cfg.pos==='bc'?y0+h0-th-30*k:y0+34*k;
L.forEach((l,j)=>{const w=g.measureText(l).width;const x=cfg.pos==='tr'?x0+w0-w-40*k:x0+(w0-w)/2;const y=ty+fs*.92+j*lh;
if(cfg.box&&j===L.length-1&&L.length>0&&false){}
if(cfg.st){g.lineJoin='round';g.lineWidth=fs*.16;g.strokeStyle=cfg.st;g.strokeText(l,x,y)}
g.fillStyle=(cfg.c2&&j===L.length-1&&L.length>1)?cfg.c2:cfg.c;g.fillText(l,x,y);
if(cfg.line&&j===L.length-1){g.fillStyle=cfg.line;g.fillRect(x,y+fs*.12,w,10*k)}});
if(cfg.box){const s2=fs*.42;g.font=cfg.f.replace('{s}',s2);const lab=['PART 1','FLOOR 50','DAY 1'][i%3];const bw=g.measureText(lab).width+34*k,bx=x0+(w0-bw)/2,by=ty+th+14*k;g.fillStyle=cfg.box;g.fillRect(bx,by,bw,s2*1.5);g.fillStyle='#fff';g.fillText(lab,bx+17*k,by+s2*1.15)}
return true}
function cover(g,W,H,imgs,lay,text,hue){if(coverTpl(g,W,H,imgs,lay,text,hue))return;const fit=(im,x,y,w,h)=>{if(!im){g.fillStyle='#2a160e';g.fillRect(x,y,w,h);return}const r=Math.max(w/im.width,h/im.height);const iw=im.width*r,ih=im.height*r;g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.drawImage(im,x+(w-iw)/2,y+(h-ih)/2,iw,ih);g.restore()};
const acc=['#F38C64','#ffd84a','#5BE39A','#7fe0ff','#ff5a7a'][hue%5];const T=text.toUpperCase();const k=W/1280;
if(lay===0){fit(imgs[0],0,0,W,H);const gr=g.createLinearGradient(0,H*.35,0,H);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,.88)');g.fillStyle=gr;g.fillRect(0,0,W,H);
let fs=110*k;g.font=`800 ${fs}px "Inter Display",Inter,sans-serif`;let L=wrapLines(g,T,W*.86);while(L.length>3&&fs>40){fs-=8;g.font=`800 ${fs}px "Inter Display",Inter,sans-serif`;L=wrapLines(g,T,W*.86)}
L.forEach((l,i)=>{const y=H-40*k-(L.length-1-i)*fs*1.02;g.lineWidth=fs*.14;g.strokeStyle='#1a0602';g.lineJoin='round';g.strokeText(l,48*k,y);g.fillStyle=i===L.length-1?acc:'#fff';g.fillText(l,48*k,y)})}
else if(lay===1){fit(imgs[0],0,0,W,H);const gr=g.createLinearGradient(0,0,W*.7,0);gr.addColorStop(0,'rgba(10,4,2,.92)');gr.addColorStop(1,'rgba(10,4,2,0)');g.fillStyle=gr;g.fillRect(0,0,W,H);
let fs=96*k;g.font=`800 ${fs}px "Inter Display",Inter,sans-serif`;let L=wrapLines(g,T,W*.5);while(L.length>4&&fs>36){fs-=8;g.font=`800 ${fs}px "Inter Display",Inter,sans-serif`;L=wrapLines(g,T,W*.5)}
L.forEach((l,i)=>{g.fillStyle=i%2?acc:'#FFE3D2';g.fillText(l,52*k,70*k+fs+i*fs*1.05)});g.fillStyle=acc;g.fillRect(52*k,70*k+fs*0.2+L.length*fs*1.05+10*k,140*k,12*k)}
else{fit(imgs[0],0,0,W/2,H);fit(imgs[1]||imgs[0],W/2,0,W/2,H);g.fillStyle=acc;g.fillRect(W/2-4*k,0,8*k,H);
let fs=70*k;g.font=`800 ${fs}px "Inter Display",Inter,sans-serif`;let L=wrapLines(g,T,W*.7);while(L.length>2&&fs>30){fs-=6;g.font=`800 ${fs}px "Inter Display",Inter,sans-serif`;L=wrapLines(g,T,W*.7)}
const bw=Math.max(...L.map(l=>g.measureText(l).width))+60*k,bh=L.length*fs*1.1+36*k;g.fillStyle='rgba(0,0,0,.88)';const bx=(W-bw)/2,by=(H-bh)/2;g.beginPath();g.roundRect?g.roundRect(bx,by,bw,bh,18*k):g.rect(bx,by,bw,bh);g.fill();
g.textAlign='center';L.forEach((l,i)=>{g.fillStyle=i===L.length-1?acc:'#fff';g.fillText(l,W/2,by+18*k+fs*.92+i*fs*1.1)});g.textAlign='left'}}
async function drawCover(i){const cv=$(`#cov${i}`);if(!cv)return;const C=P.tl?.clips||[];const sh=P.format==='short';const W=sh?1080:1280,H=sh?1920:720;cv.width=W;cv.height=H;const g=cv.getContext('2d');
const sd=P.export.covers=P.export.covers||[{a:0,b:1,h:0},{a:0,b:0,h:1},{a:0,b:0,h:2}];const c=sd[i];
if(C.length&&!c.picked){c.a=Math.floor(C.length*(0.15+0.3*i)/1)%C.length;c.b=Math.floor(C.length*0.7)%C.length;c.picked=1}
let imgs=[];try{imgs=await Promise.all([C[c.a],C[c.b]].map(x=>x?loadImg(purl(x.img)):null))}catch(_){}
await document.fonts.load('800 40px "Inter Display"').catch(()=>{});
cover(g,W,H,imgs,i,coverText(),c.h)}
function renderCovers(){const sh=P.format==='short';$('#covers').innerHTML=`<div class="field" style="grid-column:1/-1"><span class="label">Muqovadagi yozuv (3–5 so'z yaxshi)</span><div class="row" style="flex-wrap:nowrap"><input class="input sm" style="flex:1;min-width:0" id="covText" value="${esc(coverText())}"><button class="pill sm" type="button" id="covAi">AI'dan so'rash</button></div></div>`+
[0,1,2].map(i=>`<div class="cov ${i===(P.export.covSel||0)?'on':''}"><canvas class="cover-c" id="cov${i}" data-cv="${i}" style="${sh?'aspect-ratio:9/16':''}"></canvas><div class="row"><button class="pill xs" type="button" data-cregen="${i}">Qayta yaratish</button><button class="pill xs" type="button" data-cprompt="${i}">Prompt nusxalash</button><button class="pill xs on" type="button" data-csave="${i}">Saqlash</button></div></div>`).join('');
[0,1,2].forEach(drawCover);
$('#covText').oninput=e=>{P.export.coverText=e.target.value;clearTimeout(E._ct);E._ct=setTimeout(()=>{[0,1,2].forEach(drawCover);save()},300)};
$('#covAi').onclick=async()=>{if(!aiReady()){toast('AI kaliti kiritilmagan',1);return}const b=$('#covAi');b.disabled=true;b.innerHTML='<span class="spin"></span>';
try{const t=await ai(`YouTube video muqovasi uchun 3-5 so'zli, bosishga undaydigan yozuv yoz. Video: "${P.name}". Mavzu: ${P.topic||''}. Til: ${LANGN[P.lang]||'o\'zbek'}. Clickbait emas, lekin qiziqarli. Faqat yozuvning o'zini qaytar.`,{temperature:1,maxTokens:100});
P.export.coverText=t.trim().replace(/^["'«]|["'»]$/g,'').split('\n')[0];$('#covText').value=P.export.coverText;[0,1,2].forEach(drawCover);save()}catch(er){toast(er.message,1)}b.disabled=false;b.textContent='AI\'dan so\'rash'}}
$('#covers').addEventListener('click',async e=>{const cs=P.export.covers;
const v=e.target.closest('[data-cv]');if(v){P.export.covSel=+v.dataset.cv;$$('.cov').forEach((x,i)=>x.classList.toggle('on',i===P.export.covSel));save();return}
const r=e.target.closest('[data-cregen]');if(r){const i=+r.dataset.cregen,n=clips().length;cs[i].a=Math.floor(Math.random()*n);cs[i].b=Math.floor(Math.random()*n);cs[i].h=(cs[i].h+1)%5;drawCover(i);save();return}
const p=e.target.closest('[data-cprompt]');if(p){const T=tplOf(P.tpl),i=+p.dataset.cprompt;const th=P.seo?.thumbs?.[i];if(th?.prompt){copyText(th.prompt);return}if(T.thumbs?.length){copyText(fillThumb(T.thumbs[i%T.thumbs.length].prompt));return}const st=styleOf(P.style);copyText(`YouTube thumbnail, ${P.format==='short'?'9:16 vertical':'16:9'}, ${st.p}. Topic: ${P.topic||P.name}. One strong focal subject with an expressive emotion, high contrast, bold rim light, clean background, lots of empty space on the ${['bottom','left','center'][+p.dataset.cprompt]} for big text: "${coverText()}". No small details, readable on a phone.`);return}
const s=e.target.closest('[data-csave]');if(s){const cv=$('#cov'+s.dataset.csave);cv.toBlob(async b=>{try{const r=await upload('covers',new File([b],`muqova_${+s.dataset.csave+1}.png`,{type:'image/png'}));const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${P.name} muqova ${+s.dataset.csave+1}.png`;a.click();toast('Muqova saqlandi (Yuklanmalar papkasiga)')}catch(er){toast(er.message,1)}},'image/png')}});

function renderSeo(){const s=P.seo;const box=$('#seoBox');
if(!s){box.innerHTML=`<p class="sub">Sarlavha variantlari, tavsif, bo'limlar (vaqtlari bilan) va teglar ssenariy asosida yoziladi.</p>${aiReady()?'':'<p class="note">AI kaliti yo\'q. "Yozish" so\'rov matnini nusxalaydi, uni istalgan AI\'ga yuboring.</p>'}`;return}
const row=(lbl,val,i)=>`<div class="box"><div style="min-width:0"><span class="label">${lbl}</span><div style="white-space:pre-wrap;margin-top:4px">${esc(val)}</div></div><button class="pill xs" type="button" data-scopy="${i}">Nusxa</button></div>`;
const parts=[];(s.titles||[]).forEach(t=>parts.push(['Sarlavha',t]));parts.push(['Tavsif',s.description||'']);if(s.chapters?.length)parts.push(['Bo\'limlar',s.chapters.map(c=>`${c.t} ${c.title}`).join('\n')]);parts.push(['Teglar',(s.tags||[]).join(', ')]);(s.thumbs||[]).forEach((t,i)=>parts.push([`Muqova #T${i+1}${t.format?' · '+t.format:''}${t.text?' — "'+t.text+'"':''}`,t.prompt||'']));
box.innerHTML=parts.map((p,i)=>row(p[0],p[1],i)).join('')+`<button class="pill sm" type="button" data-scopy="all">Hammasini nusxalash</button>`;
box.onclick=e=>{const b=e.target.closest('[data-scopy]');if(!b)return;copyText(b.dataset.scopy==='all'?parts.filter(p=>p[0]!=='Sarlavha').map(p=>p[1]).join('\n\n')+'\n\n'+(s.titles?.[0]||''):parts[+b.dataset.scopy][1])}}
function seoPrompt(){const T=tplOf(P.tpl);if(T.thumbs)return seoPromptDoc(T);const C=clips(),st=starts();const n=Math.min(8,Math.max(3,Math.round(total()/90)));const parts=[];for(let k=0;k<n;k++){const i=Math.floor(k*C.length/n);const j=Math.floor((k+1)*C.length/n);parts.push(`[${fmt(k===0?0:st[i])}] ${C.slice(i,j).map(c=>c.x).join(' ').slice(0,500)}`)}
return `YouTube video uchun SEO matnlarini yoz. Til: ${LANGN[P.lang]||'o\'zbek'}. Format: ${P.format==='short'?'Shorts':'uzun video'}, ${fmt(total())}.
Video nomi: ${P.name}
Ssenariy bo'laklari (boshlanish vaqti bilan):
${parts.join('\n')}

Talablar: 3 xil sarlavha (60 belgigacha, qiziqarli, aldamchi emas); tavsif 2-3 abzas, birinchi 2 qatorda asosiy kalit so'zlar, oxirida obunaga chaqiruv va 3-5 heshteg; ${P.format==='short'?'bo\'limlar kerak emas':'har bo\'lak uchun qisqa bo\'lim nomi, vaqtni o\'zgartirma, birinchisi 0:00'}; 15-20 ta teg (500 belgidan oshmasin).
Faqat JSON: {"titles":["","",""],"description":"","chapters":[{"t":"0:00","title":""}],"tags":[""],"cover":"3-5 so'zli muqova yozuvi"}`}
function seoPromptDoc(T){const C=clips(),st=starts();const n=Math.min(8,Math.max(3,Math.round(total()/90)));const parts=[];for(let k=0;k<n;k++){const i=Math.floor(k*C.length/n);const j=Math.floor((k+1)*C.length/n);parts.push(`[${fmt(k===0?0:st[i])}] ${C.slice(i,j).map(c=>c.x).join(' ').slice(0,600)}`)}
const uz=T.lang==='uz'||['uz','uzc'].includes(P.lang);const nt=T.id==='d_medical'?5:3;const chars=(P.refs.chars||[]).filter(c=>c.desc);
return `Siz "${T.n}" yo'nalishidagi YouTube kanal uchun SEO va muqova (thumbnail) paketini tayyorlaysiz. Uslub ${T.channel} kanaliga o'xshash, lekin bu BOSHQA kanal: tavsif va sarlavhalarda namuna kanal nomini HECH QACHON yozma (masalan "Subscribe to …" da ham).
Sarlavha, tavsif va teglar tili: ${uz?"o'zbek (lotin)":'English'}. Muqova rasm promptlari: English.
Format: ${P.format==='short'?'Shorts':'uzun video'}, ${fmt(total())}. Video: ${P.name}
Sarlavha qolipi: ${T.topic?.pattern||''}
Ssenariy bo'laklari (boshlanish vaqti bilan):
${parts.join('\n')}

1) ${nt} ta yuqori CTR'li sarlavha (60 belgigacha, aldamchi emas, qolipga mos).
2) Tavsif: birinchi 2 qatorda asosiy kalit so'zlar, so'ng 2–3 abzas, oxirida obunaga chaqiruv va 3 heshteg. ${T.seo||''}
3) ${P.format==='short'?'Bo\'limlar kerak emas.':'Har bo\'lak uchun qisqa bo\'lim nomi (vaqtni o\'zgartirma, birinchisi 0:00).'}
4) 15 ta kalit so'z/teg.
5) 3 ta muqova varianti — DINAMIK: ssenariydagi eng kuchli 3 sahnadan: #T1 Hook, #T2 Kulminatsiya, #T3 Kontrast. Shu formulalardan foydalan:
${T.thumbs.map(t=>`- ${t.name}: matn — ${t.text}; prompt — ${t.prompt}`).join('\n')}
${chars.length?'Personaj DNA (promptda so\'zma-so\'z): '+chars.map(c=>c.name+': '+c.desc).join(' | '):''}
Har muqova uchun: "format" (qaysi formula), "text" (muqovadagi 2–4 so'zlik yozuv), "prompt" (to'liq inglizcha prompt, qavslar to'ldirilgan, yozuv prompt ichida: with massive bold text at the top reading "...", ${P.format==='short'?'9:16 --ar 9:16':'16:9 --ar 16:9'}).
Faqat JSON: {"titles":[""],"description":"","chapters":[{"t":"0:00","title":""}],"tags":[""],"cover":"muqova yozuvi","thumbs":[{"format":"","text":"","prompt":""}]}`}
$('#seoBtn').onclick=async()=>{if(!P.tl?.clips?.length){toast('Avval montajni tayyorlang',1);return}if(!aiReady()){copyText(seoPrompt());return}
const b=$('#seoBtn');b.disabled=true;b.innerHTML='<span class="spin"></span> Yozilmoqda';
try{const T0=tplOf(P.tpl);const j=await aiJSON(seoPrompt(),{temperature:0.8,maxTokens:8000},j=>Array.isArray(j.titles)&&j.titles.length&&j.description&&Array.isArray(j.tags)&&j.tags.length&&(!T0.thumbs||Array.isArray(j.thumbs)&&j.thumbs.length));if(P.format==='short')j.chapters=[];P.seo=j;if(!P.export.coverText&&j.cover){P.export.coverText=j.cover;renderCovers()}save();renderSeo()}
catch(er){toast(er.message,1)}b.disabled=false;b.textContent=P.seo?'Qayta yozish':'Yozish'};

/* =====================================================================
TEMPLATE CREATOR
===================================================================== */
let TE={f:'long',need:['char'],editing:null};
$('#tS').innerHTML=STY.map(s=>`<option value="${s.id}">${s.n}</option>`).join('');
$('#tF').dataset.own=1;$('#tF').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;TE.f=b.dataset.v;$$('#tF .pill').forEach(x=>x.classList.toggle('on',x===b))});
$('#tNeed').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;const v=b.dataset.v;TE.need=TE.need.includes(v)?TE.need.filter(x=>x!==v):[...TE.need,v];if(v==='stock'&&TE.need.includes('stock'))TE.need=['stock'];else if(v!=='stock')TE.need=TE.need.filter(x=>x!=='stock');$$('#tNeed .pill').forEach(x=>x.classList.toggle('on',TE.need.includes(x.dataset.v)))});
function tplForm(t){TE={f:t?.f||'long',need:[...(t?.need||['char'])],editing:t?.id||null};$('#tN').value=t?.n||'';$('#tD').value=t?.d||'';$('#tS').value=t?.style||'cinematic';$('#tR').value=t?.src||t?.rules||'';
$('#gen').hidden=!t;$('#gen').value=t?.rules||'';$$('#tF .pill').forEach(x=>x.classList.toggle('on',x.dataset.v===TE.f));$$('#tNeed .pill').forEach(x=>x.classList.toggle('on',TE.need.includes(x.dataset.v)));$('#tSave').firstChild.textContent=t?'O\'zgarishni saqlash ':'Shablonni saqlash '}
function renderMyTpls(){const L=CFG.userTemplates||[];$('#myTpls').innerHTML=L.length?`<span class="label">Sizning shablonlaringiz</span>`+L.map(t=>`<div class="mrow"><div class="grow"><b>${esc(t.n)}</b><small>${esc(t.d||'')} · ${t.f==='short'?'Shorts':t.f==='both'?'Uzun va Shorts':'Uzun'}</small></div><button class="pill xs" type="button" data-tedit="${t.id}">Tahrirlash</button><button class="pill xs" type="button" data-texp="${t.id}">Fayl</button><button class="pill xs" type="button" data-tdel="${t.id}">O'chirish</button></div>`).join(''):'';
if(!TE.editing&&!$('#tN').value)tplForm(null)}
function tplFromForm(){const n=$('#tN').value.trim(),src=$('#tR').value.trim();if(!n){toast('Shablon nomini yozing',1);$('#tN').focus();return null}if(src.length<15){toast('Qoidalarni biroz batafsil yozing',1);$('#tR').focus();return null}
const rules=($('#gen').hidden?'':$('#gen').value.trim())||src;
return {id:TE.editing||('u_'+Date.now().toString(36)),n,d:$('#tD').value.trim()||'O\'z shabloningiz',f:TE.f,style:$('#tS').value,need:TE.need,rules,src,tone:(rules.match(/ohang[:\s]+([^.\n]{3,40})/i)||[])[1]||'o\'z uslubingiz',user:true,len:'',v:''}}
$('#mkPrompt').onclick=async()=>{const src=$('#tR').value.trim();if(src.length<15){toast('Avval qoidalarni yozing',1);return}const g=$('#gen');g.hidden=false;
const q=`Quyidagi oddiy tilda yozilgan istaklarni YouTube ssenariy yozuvchi AI uchun aniq qoidalar ro'yxatiga aylantir. Ohang, tuzilish, nima bo'lsin va nima bo'lmasin. Qat'iy syujet yoki tayyor hikoya qo'shma: har mavzuga mos bo'lishi kerak. 5-9 qisqa band, o'zbek tilida, raqamsiz, har band yangi qatorda. Faqat qoidalarni qaytar.\n\nShablon nomi: ${$('#tN').value}\nIstaklar: ${src}`;
if(!aiReady()){g.value=src.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(Boolean).join('\n');toast('AI kaliti yo\'q: qoidalar gaplarga bo\'lindi. Xohlasangiz tahrirlang');return}
const b=$('#mkPrompt');b.disabled=true;b.innerHTML='<span class="spin"></span> Yozilmoqda';g.value='';
try{await ai(q,{temperature:0.5,maxTokens:1200,onText:(_,full)=>{g.value=full}})}catch(er){toast(er.message,1)}b.disabled=false;b.textContent='Qaytadan aylantirish'};
$('#tSave').onclick=()=>{const t=tplFromForm();if(!t)return;CFG.userTemplates=CFG.userTemplates||[];const i=CFG.userTemplates.findIndex(x=>x.id===t.id);if(i>=0)CFG.userTemplates[i]=t;else CFG.userTemplates.push(t);saveCfg();toast(`"${t.n}" saqlandi. Endi u shablonlar ro'yxatida`);TE.editing=null;tplForm(null);renderMyTpls()};
function dlJSON(obj,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,1)],{type:'application/json'}));a.download=name;a.click()}
$('#tShare').onclick=()=>{const t=tplFromForm();if(t)dlJSON({fct:1,...t},t.n.replace(/[\\/:*?"<>|]/g,'')+'.fct')};
$('#myTpls').addEventListener('click',async e=>{const L=CFG.userTemplates||[];const ed=e.target.closest('[data-tedit]');if(ed){tplForm(L.find(t=>t.id===ed.dataset.tedit));$('#s-tpl').scrollTop=0;return}
const ex=e.target.closest('[data-texp]');if(ex){const t=L.find(t=>t.id===ex.dataset.texp);dlJSON({fct:1,...t},t.n+'.fct');return}
const d=e.target.closest('[data-tdel]');if(d&&await confirmBox('Shablonni o\'chirish','Bu shablon ro\'yxatdan o\'chadi. U bilan qilingan loyihalar qoladi.','O\'chirish')){CFG.userTemplates=L.filter(t=>t.id!==d.dataset.tdel);saveCfg();renderMyTpls()}});
$('#tplImport').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const t=JSON.parse(await f.text());if(!t.n||!t.rules)throw 0;
const nt={id:'u_'+Date.now().toString(36),n:String(t.n).slice(0,60),d:String(t.d||'').slice(0,120),f:['long','short','both'].includes(t.f)?t.f:'both',style:STY.some(s=>s.id===t.style)?t.style:'cinematic',need:(t.need||[]).filter(x=>NEEDL[x]),rules:String(t.rules).slice(0,6000),src:String(t.src||'').slice(0,6000),tone:String(t.tone||'').slice(0,60),user:true,len:'',v:''};
CFG.userTemplates=[...(CFG.userTemplates||[]),nt];saveCfg();renderMyTpls();toast(`"${nt.n}" qo'shildi`)}catch(_){toast('Bu fayl FlowCraft shabloni emas',1)}};

$('#helpBtn').onclick=()=>modal('Yordam',`<div class="checks" style="font-size:14px;line-height:1.6">
<p><b>Tartib:</b> shablon → mavzu → ssenariy → (kim va qayerda) → promptlar → ovoz va rasmlar → montaj → saqlash.</p>
<p><b>AI kaliti bo'lmasa:</b> har qadamdagi "So'rovni nusxalash" tugmasi bilan matnni ChatGPT, Claude yoki boshqa AI'ga yuboring, javobini dasturga joylang.</p>
<p><b>Tayyor materiallar:</b> bosh sahifada "Tayyor materiallarim bor" — ssenariy, rasmlar va ovozni yuklab, darhol montajga o'tasiz.</p>
<p><b>Montaj:</b> Bo'sh joy — ijro, ← → — kadrlar, S — bo'lish, Delete — o'chirish, Ctrl+Z — bekor qilish.</p>
<p><b>Video sifati:</b> Telegram'ga "Fayl" qilib yuboring. Render papkasi Sozlamalarda.</p>
<p>Savol bo'lsa: <b>@${esc(LIC?.admin||'osonyoutube_admin')}</b></p></div>`);

window.TPK={};
try{if(localStorage.getItem('fc_th')==='l')document.documentElement.dataset.th='l'}catch(_){}
async function loadTPK(){const b=await(await fetch('img/tpl.pack')).arrayBuffer();const L=new DataView(b).getUint32(0);const ix=JSON.parse(new TextDecoder().decode(new Uint8Array(b,4,L)));for(const k in ix){const[o,n]=ix[k];TPK[k]=URL.createObjectURL(new Blob([b.slice(4+L+o,4+L+o+n)],{type:'image/jpeg'}))}}
/* theme */
const TH_IC={moon:'<svg class="i" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',sun:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'};
function setTh(l){document.documentElement.dataset.th=l?'l':'';try{localStorage.setItem('fc_th',l?'l':'')}catch(_){}try{CFG.theme=l?'l':'d';saveCfg()}catch(_){}$$('.thb').forEach(b=>{const s=b.querySelector('span');b.querySelector('svg')?.remove();b.insertAdjacentHTML('afterbegin',l?TH_IC.moon:TH_IC.sun);if(s)s.textContent=l?'Tungi rejim':'Kunduzgi rejim';b.title=l?'Tungi rejim':'Kunduzgi rejim'})}
function togTh(){setTh(document.documentElement.dataset.th!=='l')}
{const ic='<svg class="i" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
$('#helpBtn').insertAdjacentHTML('beforebegin',`<button class="sbtn thb" type="button">${ic}<span>Kunduzgi</span></button>`);
$('#fmtChip').insertAdjacentHTML('afterend',`<button class="pill icon-btn thb" type="button" aria-label="Kunduzgi/tungi rejim" title="Kunduzgi/tungi rejim">${ic}</button>`);
$$('.thb').forEach(b=>b.onclick=togTh);setTh(document.documentElement.dataset.th==='l')}
/* voice preview */
const VOC={};let hvA=null;
function wavUrl(pcm){const n=pcm.length,h=new DataView(new ArrayBuffer(44)),s=(o,t)=>[...t].forEach((c,i)=>h.setUint8(o+i,c.charCodeAt(0)));s(0,'RIFF');h.setUint32(4,36+n,true);s(8,'WAVEfmt ');h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,1,true);h.setUint32(24,24000,true);h.setUint32(28,48000,true);h.setUint16(32,2,true);h.setUint16(34,16,true);s(36,'data');h.setUint32(40,n,true);return URL.createObjectURL(new Blob([h,pcm],{type:'audio/wav'}))}
async function hearVoice(v,btn){if(!GM.keys().length){toast('Avval Sozlamalarda Gemini kalitini kiriting',1);return}
const tx=(P&&P.script?speechText(P.script).trim().replace(/\s+/g,' ').slice(0,140):'')||'Hello! This is how my voice sounds in your videos.';const ck=v+'|'+tx,old=btn.textContent;btn.textContent='…';
try{let u=VOC[ck];if(!u){const pcm=await GM.tts(tx,v);u=VOC[ck]=wavUrl(new Uint8Array(pcm.buffer))}
if(hvA)hvA.pause();hvA=new Audio(u);await hvA.play()}catch(e){toast('Tinglab bo\'lmadi: '+e.message,1)}btn.textContent=old}
$('#ttsHear').onclick=()=>modal('Ovozlar',`<p class="sub" style="font-size:14px;line-height:1.6">▶ ni bosib ovozni tinglang (Gemini kalitingiz ishlatiladi, ssenariyingizdan parcha o'qiladi). «Tanlash» bilan ovozni tanlang.</p><div class="mlist">${VOICES.map(v=>`<div class="mrow"><button class="pill xs" type="button" data-hv="${v[0]}">▶</button><div class="grow"><b>${v[0]}</b><small>${v[1]}</small></div><button class="pill xs" type="button" data-uv="${v[0]}">Tanlash</button></div>`).join('')}</div>`,b=>{b.onclick=e=>{const u=e.target.closest('[data-uv]');if(u){P.voice=u.dataset.uv;$('#ttsVoice').value=P.voice;save();toast('Tanlandi: '+P.voice);return}const h=e.target.closest('[data-hv]');if(h)hearVoice(h.dataset.hv,h)}});
function voiceBtn(){const v=VOICES.find(x=>x[0]===(P?.voice||'Charon'))||VOICES[0];$('#ttsHear').textContent='Ovoz: '+v[0]+' · '+v[1]}
voiceBtn();
$('#ttsHear').onclick=()=>modal('Ovoz tanlang',`<p class="sub" style="font-size:14px;line-height:1.6">▶ bilan tinglang, ovozni bosib tanlang. Tanlangan ovoz belgilanadi.</p><div class="mlist">${VOICES.map(v=>`<div class="mrow ${v[0]===(P.voice||'Charon')?'on':''}" data-uv="${v[0]}"><button class="pill xs" type="button" data-hv="${v[0]}">▶</button><div class="grow"><b>${v[0]}</b><small>${v[1]}</small></div><span class="pill xs ${v[0]===(P.voice||'Charon')?'on':''}">${v[0]===(P.voice||'Charon')?'Tanlangan':'Tanlash'}</span></div>`).join('')}</div>`,b=>{b.onclick=e=>{const h=e.target.closest('[data-hv]');if(h){hearVoice(h.dataset.hv,h);return}const u=e.target.closest('[data-uv]');if(u){P.voice=u.dataset.uv;$('#ttsVoice').value=P.voice;save();voiceBtn();$$('.mrow[data-uv]',b).forEach(r=>{const on=r.dataset.uv===P.voice;r.classList.toggle('on',on);const s=r.querySelector('span.pill');s.textContent=on?'Tanlangan':'Tanlash';s.classList.toggle('on',on)})}}});

/* desktop feel */
addEventListener('contextmenu',e=>{if(!e.target.closest('input,textarea,[contenteditable]'))e.preventDefault()});
addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(e.key==='F5'||e.key==='F12'||(e.ctrlKey&&'rusp'.includes(k)&&k.length===1)||(e.ctrlKey&&e.shiftKey&&'ijc'.includes(k)))e.preventDefault()});
addEventListener('wheel',e=>{if(e.ctrlKey||e.altKey)e.preventDefault();const w=e.target.closest&&e.target.closest('#tlw');if(w&&(e.ctrlKey||e.altKey)&&P?.tl){const z=$('#zoom'),old=P.tl.pps,nv=Math.max(+z.min||2,Math.min(+z.max||80,Math.round(old*(e.deltaY<0?1.15:.87))));if(nv!==old){const r=w.getBoundingClientRect(),x=e.clientX-r.left,t=(w.scrollLeft+x-HW)/old;P.tl.pps=nv;z.value=nv;rTL();w.scrollLeft=Math.max(0,HW+t*nv-x);save()}}},{passive:false});
addEventListener('dragstart',e=>{if(e.target.tagName==='IMG')e.preventDefault()});
const noAF=()=>$$('input,textarea,select').forEach(x=>{x.setAttribute('autocomplete','off');x.setAttribute('data-lpignore','true')});noAF();new MutationObserver(noAF).observe(document.body,{childList:true,subtree:true});
function blockShow(bi){const a=bi*BLOCK,b=Math.min(P.frames.length,a+BLOCK);let any=false;for(let k=a;k<b;k++)if(P.prompts[k])any=true;return any||(pAbort&&!$('#promptStop').hidden)?blockText(bi):'Bu blokda promptlar hali yo\'q.\n\nYuqoridagi «Promptlarni yozish» tugmasini bosing.'}

boot();
/* kichik nusxalar tayyor bo'lganda tasma va ko'rish oynasini yangilaymiz */
addEventListener('fc-thumbs',()=>{try{if(P?.tl&&S.screen==='s-editor'){rTL();upd(true)}}catch(_){}});
try{setPlayIcon()}catch(_){}
/* telefonda tasmaga bir marta bosish — shu joyga o'tish (surish paytida sakramaydi) */
$('#tlc').addEventListener('click',e=>{if(!E._touch)return;const ln=e.target.closest('.lane');if(!ln||ln.hasAttribute('data-rul')||e.target.closest('[data-ci],[data-eli],[data-as],[data-drag]'))return;const r=ln.getBoundingClientRect();E.t=Math.max(0,Math.min(total()-0.01,(e.clientX-r.left)/P.tl.pps));E.sel=clipAt(E.t);markSel();upd(true)});
