// ============================================================================
// Alexander Public Schools — Marshall Growth Platform
// Service Worker — app-shell + offline fallback + smart caching
// ----------------------------------------------------------------------------
// Strategy:
//   • /static/* + icons   → Cache First (fast, long-lived static assets)
//   • HTML pages          → Network First, fall back to cached /offline.html
//   • API / form POSTs    → Network only (never cached)
//   • Cross-origin (CDN)  → Stale-While-Revalidate (Tailwind, FontAwesome)
// Bump CACHE_VERSION any time static assets change in an incompatible way.
// ============================================================================

const CACHE_VERSION = 'v3';
const CACHE_SHELL   = `aps-shell-${CACHE_VERSION}`;
const CACHE_STATIC  = `aps-static-${CACHE_VERSION}`;
const CACHE_CDN     = `aps-cdn-${CACHE_VERSION}`;

const SHELL_URLS = [
  '/static/styles.css',
  '/static/app.js',
  '/static/tour.js',
  '/static/manifest.json',
  '/static/icon-192.png',
  '/static/icon-512.png',
  '/static/apple-touch-icon.png',
  '/static/offline',
];

// ---------------------------- Install -------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      // Tolerate missing files so a failed fetch doesn't break install.
      await Promise.all(
        SHELL_URLS.map((u) =>
          cache.add(new Request(u, { cache: 'reload' })).catch(() => {})
        )
      );
      self.skipWaiting();
    })()
  );
});

// ---------------------------- Activate ------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([CACHE_SHELL, CACHE_STATIC, CACHE_CDN]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.enable(); } catch (e) {}
      }
      await self.clients.claim();
    })()
  );
});

// ---------------------------- Messages ------------------------------------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ---------------------------- Fetch ---------------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // Never cache POST/PUT/DELETE (form posts, logins)

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Same-origin /static/* → cache-first
  if (sameOrigin && url.pathname.startsWith('/static/')) {
    event.respondWith(cacheFirst(req, CACHE_STATIC));
    return;
  }

  // Cross-origin CDN (Tailwind, FontAwesome, etc.) → stale-while-revalidate
  if (!sameOrigin) {
    event.respondWith(staleWhileRevalidate(req, CACHE_CDN));
    return;
  }

  // Same-origin HTML navigation → network-first with offline fallback
  const isNavigation =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(networkFirstHTML(event));
    return;
  }

  // Other same-origin GETs (API, JSON) → network, no cache
  // (keep data always live; no stale dashboards or reports)
});

// ---------------------------- Strategies ---------------------------------
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fetchPromise;
}

async function networkFirstHTML(event) {
  const req = event.request;
  try {
    // Use navigation preload if available (faster than starting fetch again)
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const res = preload || (await fetch(req));
    return res;
  } catch (err) {
    const cache = await caches.open(CACHE_SHELL);
    const offline = await cache.match('/static/offline');
    if (offline) return offline;
    return new Response(
      '<h1>Offline</h1><p>You appear to be offline. Please reconnect and try again.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}
