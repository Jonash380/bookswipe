const CACHE_NAME = 'bookswipe-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/books.js',
  '/js/media.js',
  '/js/games.js',
  '/js/games_api.js',
  '/js/api.js',
  '/js/swipe.js',
  '/js/enrichment.js',
  '/js/recommender.js',
  '/js/tmdb.js',
  '/js/utils.js',
  '/js/descriptions.js',
  '/js/tag_mapper.js',
  '/js/storage.js',
  '/js/api-client.js',
  '/js/toast.js',
  '/static/manifest.json',
  '/static/icon-192.png',
  '/static/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: network first, cache fallback + store successful responses
  if (url.pathname.startsWith('/proxy/') || url.pathname.includes('image.tmdb.org')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: cache first, stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetched = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
