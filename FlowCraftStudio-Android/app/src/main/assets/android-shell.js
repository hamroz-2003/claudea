/* FlowCraft — Android qobig'i bilan bog'lovchi kichik qatlam (4.1.0).
   Faqat APK ichida ishlaydi (window.AndroidDownloader bo'lsa). Windows/PWA versiyasiga ta'sir qilmaydi.
   window.FCBack(): telefonning "Orqaga" tugmasi. true — sahifa o'zi hal qildi, false — ilova chiqishi mumkin. */
(function(){
'use strict';
if(!window.AndroidDownloader)return;
const q=s=>document.querySelector(s);
const vis=el=>!!el&&el.offsetParent!==null&&getComputedStyle(el).visibility!=='hidden';
const click=el=>{if(!el)return false;el.click();return true};
/* qaysi ekrandan qayerga qaytiladi */
const PARENT={'s-tpl':'s-templates','s-editor':'s-home','s-studio':'s-home','s-import':'s-home','s-projects':'s-home','s-templates':'s-home','s-settings':'s-home'};
window.FCBack=function(){
 try{
  /* 1. pastdan chiquvchi oyna (mobile.js) */
  const sh=q('.msheet.on');if(sh){const bg=q('.msheet-bg');if(bg){bg.click();return true}}
  /* 2. modal oyna */
  const m=q('#modal.on');if(m){if(typeof window.closeModal==='function')window.closeModal();else m.classList.remove('on');return true}
  /* 3. montajdagi asboblar paneli */
  const tool=q('#lp.mopen .mtool-h .msheet-x,#rp.mopen .mtool-h .msheet-x');if(click(tool))return true;
  /* 4. ekranlar: studiyada oldingi qadam, boshqa joyda yuqoriroq ekran */
  const cur=q('.screen.show');const id=cur&&cur.id;
  if(!id||id==='s-home'||id==='s-act')return false;
  if(id==='s-studio'){const b=q('#back');if(vis(b)){b.click();return true}}
  const to=PARENT[id]||'s-home';
  if(click(q('.sbtn[data-nav="'+to+'"]')))return true;
  if(typeof window.show==='function'){window.show(to);return true}
 }catch(e){console.warn('[android] back: '+e.message)}
 return false};
/* ilova versiyasi (sozlamalar va diagnostika uchun) */
try{if(typeof AndroidDownloader.appVersion==='function')document.documentElement.dataset.apk=AndroidDownloader.appVersion()}catch(_){}
})();
