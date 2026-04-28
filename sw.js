// Conecta Reynosa — Service Worker
// v3: bypass cross-origin (Deezer, AudioDB, tracking) — solo intercepta same-origin
const CACHE_NAME = 'conecta-v3';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(e) {
  var url;
  try { url = new URL(e.request.url); } catch(err) { return; }

  // Bypass cross-origin: imágenes Deezer/AudioDB, tracking pixels, fonts CDNs.
  // El navegador maneja directo y respeta el CSP del documento.
  if (url.origin !== self.location.origin) return;

  e.respondWith(fetch(e.request));
});
