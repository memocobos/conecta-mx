// Conecta Reynosa — Service Worker
// v2: bypass para scripts de tracking (Meta Pixel, GA, TikTok)
const CACHE_NAME = 'conecta-v2';

const TRACKING_HOSTS = [
  'facebook.net',
  'facebook.com',
  'fbcdn.net',
  'graph.facebook.com',
  'google-analytics.com',
  'googletagmanager.com',
  'analytics.google.com',
  'analytics.tiktok.com'
];

self.addEventListener('install', function(e) {
  // Activar el SW nuevo sin esperar a que se cierren las pestañas
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  // Tomar control de clientes abiertos inmediatamente
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(e) {
  var url;
  try { url = new URL(e.request.url); } catch(err) { return; }

  // Bypass: dejar que el navegador maneje tracking/pixel requests directo
  for (var i = 0; i < TRACKING_HOSTS.length; i++) {
    if (url.hostname.indexOf(TRACKING_HOSTS[i]) !== -1) {
      return;
    }
  }

  e.respondWith(fetch(e.request));
});
