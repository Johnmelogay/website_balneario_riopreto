const CACHE_NAME = 'pos-treino-v1';
const ASSETS = [
  './desafiocaia.html',
  './desafiocaia.css',
  './desafiocaia.js',
  './manifest.json',
  './images/logo_opt.webp',
  './images/logo_opt.png',
  './images/PROMO CAIA.webp'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
