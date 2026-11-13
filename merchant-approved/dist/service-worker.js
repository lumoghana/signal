const CACHE='lumo-merchant-mobile-offline-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add('./offline.html')));self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// API responses, QR outcomes and balances are never cached by the service worker.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('./offline.html')))});
