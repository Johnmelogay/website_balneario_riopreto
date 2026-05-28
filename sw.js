const CACHE_NAME = 'pos-treino-v2';
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
  // Force new service worker to activate immediately
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Clean up old caches on activation
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // NEVER cache auth-related requests or Firebase/Google API calls
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebase.google.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('gstatic.com') ||
    url.pathname.includes('__/auth/')
  ) {
    return; // Let the browser handle these normally
  }

  // Network-first strategy for HTML and JS (ensures fresh auth code)
  if (e.request.destination === 'document' || url.pathname.endsWith('.js') || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          // Cache the fresh response for offline use
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return response;
        })
        .catch(() => {
          // Offline fallback: serve from cache
          return caches.match(e.request);
        })
    );
    return;
  }

  // Cache-first for static assets (images, CSS, fonts)
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return response;
      });
    })
  );
});
