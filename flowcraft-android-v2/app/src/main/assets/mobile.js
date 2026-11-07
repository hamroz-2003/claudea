/* FlowCraft — telefon interfeysi (CapCut uslubi).
   Kompyuter sahifasini o'zgartirmaydi: ustidan ixcham tartib quradi.
   Har bir qism alohida funksiya, xato bo'lsa dastur to'xtamaydi, faqat jurnalga yoziladi. */
(function(){
'use strict';
const isPhone=()=>!!window.FCL&&(FCL.isAndroid||matchMedia('(max-width: 820px)').matches||matchMedia('(pointer: coarse)').matches);
if(!isPhone())return;
document.documentElement.classList.add('m');
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const safe=(name,fn)=>function(){try{return fn.apply(this,arguments)}catch(e){console.warn('[mobile] '+name+': '+e.message)}};
const ICON={
 chev:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>',
 down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
 clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
 lang:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
 mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
 check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4 10-10"/></svg>',
 brush:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4l6 6-9 9H5v-6z"/></svg>',
 play:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></svg>',
 dots:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'};

/* ---------- 1. Pastdan chiquvchi oyna ---------- */
const Sheet={bg:null,el:null,body:null,title:null,onClose:null,
 init(){if(this.el)return;this.bg=document.createElement('div');this.bg.className='msheet-bg';this.el=document.createElement('div');this.el.className='msheet';
  this.el.innerHTML='<div class="msheet-h"><b></b><button class="msheet-x" type="button">Tayyor</button></div><div class="msheet-b"></div>';
  document.body.append(this.bg,this.el);this.body=this.el.querySelector('.msheet-b');this.title=this.el.querySelector('b');
  this.bg.onclick=()=>this.close();this.el.querySelector('.msheet-x').onclick=()=>this.close()},
 open(title,nodes,onClose){this.init();this.close(true);this.title.textContent=title;this.onClose=onClose||null;this.body.replaceChildren(...nodes);this.bg.classList.add('on');this.el.classList.add('on')},
 close(silent){if(!this.el||!this.el.classList.contains('on'))return;this.el.classList.remove('on');this.bg.classList.remove('on');const f=this.onClose;this.onClose=null;if(f&&!silent)f();else if(f)f()}};
window.addEventListener('popstate',()=>Sheet.close());

/* ---------- 2. Bo'limni qatorga yig'ish ---------- */
function summary(el){
 const lb=el.querySelector('#langBtn');if(lb)return lb.textContent.replace(/^Til:\s*/,'').replace('▾','').trim();
 const st=el.querySelector('.sty.on');if(st)return st.textContent.trim();
 const sw=el.querySelector('.sw');if(sw)return sw.classList.contains('on')||sw.getAttribute('aria-checked')==='true'?'Yoqilgan':'O\'chirilgan';
 const on=[...el.querySelectorAll('.pill.on,button.on')].map(b=>b.textContent.trim()).filter(Boolean);if(on.length)return on.slice(0,2).join(', ');
 const inp=el.querySelector('input:not([type=range]):not([type=file]):not([hidden])');if(inp&&inp.value)return inp.value;
 return 'Tanlang'}
function collapse(el,title,icon){if(!el||el.dataset.mc)return;el.dataset.mc='1';
 const row=document.createElement('button');row.type='button';row.className='mrow2';
 const hold=document.createElement('div');hold.className='mhold';
 const upd=()=>{row.innerHTML=`<span class="mi">${icon||ICON.dots}</span><span class="mt"><b>${title}</b><small>${summary(el)}</small></span><span class="mc">${ICON.chev}</span>`};
 el.parentNode.insertBefore(row,el);row.after(hold);hold.appendChild(el);upd();
 row.onclick=safe('collapse-open',()=>{Sheet.open(title,[el],()=>{hold.appendChild(el);upd()})});
 new MutationObserver(()=>{if(el.parentNode===hold)upd()}).observe(el,{subtree:true,attributes:true,attributeFilter:['class','aria-checked'],childList:true})}
const labelOf=f=>{const l=f.querySelector('.label');return l?l.childNodes[0].textContent.trim():''};
const ICON_BY=t=>/davomiy/i.test(t)?ICON.clock:/til/i.test(t)?ICON.lang:/ohang/i.test(t)?ICON.mic:/fakt/i.test(t)?ICON.check:/uslub/i.test(t)?ICON.brush:/youtube/i.test(t)?ICON.play:ICON.dots;
const tidyPane=safe('tidy',pane=>{if(!pane||pane.dataset.mt)return;pane.dataset.mt='1';
 /* tanlovli maydonlar (matn kiritiladigan joydan tashqari) */
 pane.querySelectorAll('.field').forEach(f=>{if(f.closest('.mhold'))return;const prim=f.querySelector('input:not([type=range]):not([type=file]):not([hidden]),textarea');
  const hasChoice=f.querySelector('.seg,.toggle,#tones,.swatches,select,#langBtn,.angles');if(hasChoice&&!(prim&&!f.querySelector('.seg')&&!f.querySelector('#langBtn')))collapse(f,labelOf(f)||'Sozlama',ICON_BY(labelOf(f)))});
 /* katta, kamdan-kam kerak bo'ladigan panellar */
 pane.querySelectorAll('#ytPanel,.panel').forEach(pn=>{const h=pn.querySelector('h3');if(!h)return;const t=h.textContent.trim();
  if(pn.id==='ytPanel'||pn.querySelector('#styles'))collapse(pn,t,ICON_BY(t))})});

/* ---------- 3. Studio sarlavhasi: "2/8 · Mavzu" va chiziq ---------- */
let stepBox=null;
const renderStep=safe('step',()=>{if(typeof S==='undefined'||!window.STEPS&&typeof STEPS==='undefined')return;const st=q('#s-studio .studio');if(!st)return;
 if(!stepBox){stepBox=document.createElement('div');stepBox.className='mstep';st.prepend(stepBox);stepBox.onclick=openSteps}
 const cur=S.cur,n=STEPS.length,name=STEPS[cur-1][0];
 stepBox.innerHTML=`<div class="mstep-t"><span><b>${name}</b> · ${cur}/${n}</span>${ICON.down}</div><div class="mstep-bar">${STEPS.map((_,i)=>`<i class="${i+1<cur?'d':i+1===cur?'n':''}"></i>`).join('')}</div>`;
 setTimeout(()=>tidyPane(q('.pane.on')),0)});
function openSteps(){const box=document.createElement('div');box.className='msteps';const open=typeof firstOpen==='function'?firstOpen():8;
 STEPS.forEach((s,i)=>{const n=i+1,b=document.createElement('button');b.type='button';b.className=n<S.cur?'d':n===S.cur?'n':n>open?'l':'';
  b.innerHTML=`<i>${n<S.cur?'✓':n}</i><span>${s[0]}</span>`;b.onclick=()=>{Sheet.close();go(n)};box.appendChild(b)});
 Sheet.open('Qadamlar',[box])}

/* ---------- 4. Montaj: pastki asboblar paneli ---------- */
let toolsBuilt=false;
const buildTools=safe('tools',()=>{if(toolsBuilt)return;const ed=q('#ed2'),lp=q('#lp'),rp=q('#rp');if(!ed||!lp||!rp)return;toolsBuilt=true;
 const bar=document.createElement('nav');bar.className='mtools';
 const add=(aside,pt)=>{const b=document.createElement('button');b.type='button';b.dataset.t=pt.dataset.tool;b.innerHTML=pt.innerHTML;
  b.onclick=()=>{const was=aside.classList.contains('mopen')&&aside.dataset.mt===pt.dataset.tool;closeTools();if(was)return;pt.click();aside.dataset.mt=pt.dataset.tool;aside.classList.add('mopen');b.classList.add('on');
   aside.querySelector('.mtool-h b').textContent=pt.textContent.trim()};bar.appendChild(b)};
 for(const aside of [lp,rp]){const h=document.createElement('div');h.className='mtool-h';h.innerHTML='<b></b><button class="msheet-x" type="button">Tayyor</button>';aside.prepend(h);h.querySelector('button').onclick=closeTools;
  aside.querySelectorAll('.ptabs .pt').forEach(pt=>add(aside,pt))}
 ed.appendChild(bar)});
function closeTools(){qa('#lp,#rp').forEach(a=>a.classList.remove('mopen'));qa('.mtools button').forEach(b=>b.classList.remove('on'))}

/* ---------- 5. Ishga tushirish ---------- */
const start=safe('start',()=>{
 const skip=q('#skip');if(skip)skip.click();
 const rail=q('#rail');if(rail)new MutationObserver(renderStep).observe(rail,{childList:true});
 qa('.screen').forEach(s=>new MutationObserver(()=>{if(s.id==='s-editor'&&s.classList.contains('show'))buildTools();if(!s.classList.contains('show')&&s.id==='s-editor')closeTools()}).observe(s,{attributes:true,attributeFilter:['class']}));
 renderStep()});
const wait=()=>{if(typeof bootReady!=='undefined'&&bootReady)start();else setTimeout(wait,120)};wait();
})();
