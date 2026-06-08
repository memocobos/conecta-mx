// Conecta Reynosa — Service Worker
// v4: bypass cross-origin + PURGA toda caché vieja al activar. Versiones previas
// (v1/v2) cacheaban el app-shell y servían HTML viejo aunque ya hubiera deploy;
// esto borra esas cachés y deja al SW como puro pass-through a red.
const CACHE_NAME = 'conecta-v4';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    // Borra TODAS las cachés (incluidas las de SW viejos) y toma control ya.
    caches.keys()
      .then(function(keys){ return Promise.all(keys.map(function(k){ return caches.delete(k); })); })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var url;
  try { url = new URL(e.request.url); } catch(err) { return; }

  // Bypass cross-origin: imágenes Deezer/AudioDB, tracking pixels, fonts CDNs.
  // El navegador maneja directo y respeta el CSP del documento.
  if (url.origin !== self.location.origin) return;

  // Same-origin: SIEMPRE a red, nunca desde caché (evita servir HTML viejo).
  e.respondWith(fetch(e.request));
});
