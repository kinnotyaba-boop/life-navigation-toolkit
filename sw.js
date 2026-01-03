/* Offline-first-ish Service Worker (app shell) */
const CACHE_NAME = 'life-nav-toolkit-20260103034937';
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./sw.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-16.png"
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // 'reload' avoids the HTTP cache and helps on GitHub Pages updates
    await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Enable navigation preload if available
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Strategy:
// - Navigations: network-first (for fresh HTML), fallback to cache, then offline page
// - Static assets (same-origin): cache-first, update in background
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigations
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const preload = await event.preloadResponse;
        const networkRes = preload || await fetch(req);
        // Cache the latest HTML (even if it's index.html)
        cache.put('./index.html', networkRes.clone()).catch(() => {});
        return networkRes;
      } catch (e) {
        const cached = await cache.match('./index.html') || await cache.match(req);
        return cached || await cache.match('./offline.html');
      }
    })());
    return;
  }

  // Other same-origin requests (icons, manifest, etc.)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) {
      // Update in background
      event.waitUntil(fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
      }).catch(() => {}));
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      return await cache.match('./offline.html') || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
