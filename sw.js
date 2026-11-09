/* CINEVA — FAST, OFFLINE-TOLERANT APP CACHE
   Cache-first for the app shell and same-origin assets.
   Network refreshes happen in the background so repeat visits feel instant.
*/
const CACHE_NAME = "cineva-shell-v5";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/images/logo.png"
];

async function refreshCache(request) {
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque")) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return null;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Do not let one missing optional image prevent the service worker installing.
    await Promise.allSettled(APP_SHELL.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("cineva-shell-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/")) return;
  if (request.headers.has("range")) return;

  // HTML opens immediately from cache; the newest copy is saved for next visit.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request) || await cache.match("/index.html");
      const update = refreshCache(request);
      if (cached) {
        event.waitUntil(update);
        return cached;
      }
      const fresh = await update;
      return fresh || Response.error();
    })());
    return;
  }

  // Cache-first assets make repeat page loads fast. Update quietly in the background.
  if (/\.(?:css|js|mjs|png|jpe?g|webp|avif|gif|svg|ico|woff2?|webmanifest)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const update = refreshCache(request);
      if (cached) {
        event.waitUntil(update);
        return cached;
      }
      return (await update) || Response.error();
    })());
  }
});
