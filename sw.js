/* CINEVA — NETWORK-FIRST UPDATE CACHE
   Always check the network for current pages and scripts first.
   Keep the last successful response as an offline fallback.
*/
const CACHE_NAME = "cineva-shell-v22";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/images/logo.png"
];

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // Bypass the browser's HTTP cache so desktop browsers fetch current builds.
    const response = await fetch(request, { cache: "no-cache" });
    if (response && response.ok && response.type !== "opaque") {
      await cache.put(request, response.clone());
      if (request.mode === "navigate") {
        const url = new URL(request.url);
        await cache.put(new Request(url.origin + url.pathname), response.clone());
      }
    }
    return response;
  } catch (_) {
    const exact = await cache.match(request);
    if (exact) return exact;
    if (request.mode === "navigate") {
      const url = new URL(request.url);
      const pathOnly = await cache.match(new Request(url.origin + url.pathname));
      if (pathOnly) return pathOnly;
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const home = await cache.match("/index.html") || await cache.match("/");
        if (home) return home;
      }
    }
    return null;
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key.startsWith("cineva-shell-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Admin/auth and API requests keep their own live network behavior.
  if (url.pathname.startsWith("/admin/") ||
      url.pathname === "/js/config.js" ||
      url.pathname.startsWith("/rest/") ||
      url.pathname.startsWith("/auth/") ||
      request.headers.has("range")) return;

  if (request.mode === "navigate" ||
      /\.(?:css|js|mjs|png|jpe?g|webp|avif|gif|svg|ico|woff2?|webmanifest)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const response = await networkFirst(request);
      if (response) return response;
      return new Response(
        "<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>CINEVA — Offline</title><body style='margin:0;background:#080812;color:#fff;font:16px Arial,sans-serif;display:grid;min-height:100vh;place-items:center;text-align:center'><main style='padding:28px'><h1 style='color:#a855f7'>CINEVA</h1><p>This page is not available offline yet.</p><a style='color:#c69cff' href='/'>Return to Home</a></main></body></html>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    })());
  }
});
