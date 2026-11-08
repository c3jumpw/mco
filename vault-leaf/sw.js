/* Vaultleaf service worker: keeps the app working offline. Network first, so updates arrive as soon as you're online.
   It only caches the app's own files. Your vault never passes through here: it lives in this browser's storage, encrypted. */
const CACHE = 'vaultleaf-f2a4007c4c';
const CORE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/favicon.svg', '/fonts/fonts.css', '/fonts/bricolage.woff2', '/fonts/ahn-400.woff2', '/fonts/ahn-700.woff2', '/fonts/ahm-400.woff2', '/fonts/ahm-600.woff2'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(new Request(u, {credentials:'include'})).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('vaultleaf-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if(r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(fetch(r).then(res => {
    if(res.ok && res.type === 'basic'){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r, {ignoreSearch:true}).then(m => m || (r.mode === 'navigate' ? caches.match('/') : Response.error()))));
});
