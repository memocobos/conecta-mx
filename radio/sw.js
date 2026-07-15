/* Radio Conecta SW — mínimo para instalabilidad PWA.
   NO cachea nada: el stream es en vivo y la página siempre fresca. */
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(){ /* passthrough: red directa */ });
