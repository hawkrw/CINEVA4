/* CINEVA — RELIABLE OFFLINE CACHE
   - Keep visited pages available offline.
   - Never replace an unrelated page with the homepage.
   - Refresh cached pages quietly while serving the exact requested page.
*/
const CACHE_NAME = "cineva-shell-v8";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/images/logo.png"
];

async function refreshCache(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type !== "opaque") {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());

      // Static HTML is identical across query-string filters, so also keep
      // a path-only copy for offline visits to pages with different queries.
      if (request.mode === "navigate") {
        const url = new URL(request.url);
        const pathRequest = new Request(url.origin + url.pathname);
        await cache.put(pathRequest, response.clone());
      }
    }
    return response;
  } catch (error) {
    return null;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("cineva-shell-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/")) return;
  if (request.headers.has("range")) return;

  if (request.mode === "navigate") {
    const update = refreshCache(request);
    event.waitUntil(update);

    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const exact = await cache.match(request);
      const pathOnly = await cache.match(
        new Request(url.origin + url.pathname)
      );
      const cached = exact || pathOnly;

      if (cached) return cached;

      const fresh = await update;
      if (fresh) return fresh;

      // Only the actual homepage may fall back to the homepage cache.
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const home = await cache.match("/index.html") || await cache.match("/");
        if (home) return home;
      }

      return new Response(
        "<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>CINEVA — Offline</title><body style='margin:0;background:#080812;color:#fff;font:16px Arial,sans-serif;display:grid;min-height:100vh;place-items:center;text-align:center'><main style='padding:28px'><h1 style='color:#a855f7'>CINEVA</h1><p>This page is not available offline yet.</p><a style='color:#c69cff' href='/'>Return to Home</a></main></body></html>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    })());
    return;
  }

  if (/\.(?:css|js|mjs|png|jpe?g|webp|avif|gif|svg|ico|woff2?|webmanifest)$/i.test(url.pathname)) {
    const update = refreshCache(request);
    event.waitUntil(update);

    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      return (await update) || Response.error();
    })());
  }
});
