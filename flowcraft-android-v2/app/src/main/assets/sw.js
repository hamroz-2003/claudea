/* FlowCraft: ilova fayllarini saqlab qo'yadi, internet bo'lmasa ham ochiladi. */
const V='fc-5.0.0-v2';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith(caches.open(V).then(async c=>{try{const r=await fetch(e.request);if(r.ok)c.put(e.request,r.clone());return r}catch(_){const m=await c.match(e.request);if(m)return m;throw _}}))});
