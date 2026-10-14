// Service worker for Fish Bite Forecast PWA.
// Strategy:
//   - HTML navigation requests: network-first (always show latest UI when online)
//   - Static assets (JS/CSS/images): stale-while-revalidate (instant from cache, update in background)
//   - API calls: network-first (always fresh data when online)
//
// Cache name is bumped on every deploy to invalidate previous caches.
const CACHE_NAME = "fish-bite-v2-2026-10-12";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      // Delete all caches that don't match the current CACHE_NAME (forces invalidation on update).
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Network-first for API calls (always fetch fresh when online; fallback to cache).
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // HTML navigation requests: network-first (so users always see the latest UI on refresh)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return resp;
        })
        .catch(() => caches.match(req).then((cached) => cached || new Response("Offline", { status: 503 })))
    );
    return;
  }

  // Static assets (JS/CSS/images): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && (resp.type === "basic" || resp.type === "cors")) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
