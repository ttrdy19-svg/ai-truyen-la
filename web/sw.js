const CACHE='truyen-la-v1';
let assets;
async function precache(){const list=await fetch(new URL('offline-assets.json',self.registration.scope)).then(r=>{if(!r.ok)throw Error('Assets unavailable');return r.json();});assets=list;const cache=await caches.open(CACHE);await cache.addAll(list.map(p=>new URL(p,self.registration.scope).href));}
self.addEventListener('install',event=>event.waitUntil(precache().then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('truyen-la-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();for(const client of await self.clients.matchAll())client.postMessage('offline-ready');})()));
self.addEventListener('message',event=>{if(event.data==='status')event.ports[0]?.postMessage('offline-ready');});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||!u.href.startsWith(self.registration.scope))return;event.respondWith((async()=>{if(event.request.mode==='navigate'){try{return await fetch(event.request);}catch{return await caches.match(new URL('./',self.registration.scope).href);}}return await caches.match(event.request)||fetch(event.request);})());});
