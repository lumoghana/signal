/* Public static shell only. Never caches records, exports, API requests or POSTs.
   Installed offline use is read-only; the application owns all money guards. */
'use strict';
importScripts('/platform-precache.js');
const config=self.LUMO_PRECACHE;
if(!config||config.schemaVersion!==1||!Array.isArray(config.assets)||!/^[a-z0-9_-]+$/i.test(config.namespace))throw Error('Invalid Lumo shell configuration');
const prefix='lumo-shell-'+config.namespace+'-';
const cacheName=prefix+config.version;
const urls=new Set(config.assets.map(item=>new URL(item.url,self.location.origin).pathname));
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
async function validated(item){
 const response=await fetch(new Request(item.url,{cache:'reload',credentials:'same-origin'}));
 if(!response.ok||response.type==='opaque')throw Error('Shell asset unavailable');
 if(item.sha256&&await digest(await response.clone().arrayBuffer())!==item.sha256)throw Error('Shell asset changed during installation');
 return response;
}
self.addEventListener('install',event=>{event.waitUntil((async()=>{
 const cache=await caches.open(cacheName);
 try{for(const item of config.assets)await cache.put(item.url,await validated(item));}
 catch(error){await caches.delete(cacheName);throw error;}
 // Updates wait for the user's explicit action; first install activates normally.
})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
 const names=(await caches.keys()).filter(name=>name.startsWith(prefix));
 const previous=names.filter(name=>name!==cacheName).slice(-1);
 await Promise.all(names.filter(name=>name!==cacheName&&!previous.includes(name)).map(name=>caches.delete(name)));
 await self.clients.claim();
})());});
self.addEventListener('message',event=>{if(event.data?.type==='LUMO_ACTIVATE_UPDATE')self.skipWaiting();});
async function cached(request){
 const direct=await (await caches.open(cacheName)).match(request);if(direct)return direct;
 const names=(await caches.keys()).filter(name=>name.startsWith(prefix)&&name!==cacheName).reverse();
 for(const name of names){const hit=await (await caches.open(name)).match(request);if(hit)return hit;}
 return null;
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // This explicit, read-only probe must reach the origin instead of the cache.
 if(url.searchParams.has('lumo-connection-check'))return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{try{const response=await fetch(request);if(response.ok)return response;throw Error('App origin unavailable');}catch{
   const shell=await cached('/index.html');
   if(shell){const html=(await shell.text()).replace(/<head\b[^>]*>/i,match=>match+'<meta name="lumo-shell-offline" content="true">');return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}
   return new Response('Lumo needs a connection for its first launch. Reconnect and reopen the preview.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }})());return;
 }
 // Only the exact reviewed public asset paths are eligible. Queries contain no
 // customer records; matching uses the canonical content-addressed/static path.
 if(!urls.has(url.pathname))return;
 event.respondWith((async()=>{const hit=await cached(url.pathname);if(hit)return hit;return fetch(request);})());
});
