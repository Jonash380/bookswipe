const CACHE_NAME = 'bookswipe-v7';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/books.js',
  '/js/media.js',
  '/js/games.js',
  '/js/games_api.js',
  '/js/steam.js',
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
  '/js/experiment.js',
  '/js/achievements.js',
  '/js/challenges.js',
  '/js/compatibility.js',
  '/js/roast.js',
  '/js/passport.js',
  '/js/wrapped.js',
  '/js/timecapsule.js',
  '/js/franchise.js',
  '/js/swipe-party.js',
  '/js/pick-for-me.js',
  '/js/concierge.js',
  '/js/media-generator.js',
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

  // API requests: network first, cache fallback with TTL check
  if (url.pathname.startsWith('/proxy/') || url.pathname.includes('image.tmdb.org')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        // Check if cached response is older than 5 minutes
        if (cached) {
          const cachedDate = cached.headers.get('sw-cache-time');
          if (cachedDate && Date.now() - Number(cachedDate) > 5 * 60 * 1000) {
            // Expired — delete stale cache entry
            caches.open(CACHE_NAME).then(cache => cache.delete(event.request));
          } else if (cachedDate) {
            return cached; // Fresh enough — use cache
          }
        }
        return fetch(event.request).then(response => {
          if (response.ok) {
            const headers = new Headers(response.headers);
            headers.set('sw-cache-time', String(Date.now()));
            const timed = new Response(response.clone().body, {
              status: response.status,
              statusText: response.statusText,
              headers
            });
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, timed));
          }
          return response;
        }).catch(() => cached || new Response('Offline', { status: 503 }));
      })
    );
    return;
  }

  // Static assets: stale-while-revalidate (instant load + background update)
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchAndUpdate = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => null);
      return cached || fetchAndUpdate;
    })
  );
});
