/**
 * CINEVA — Cloudflare Worker
 * Rewrites clean movie and series URLs to the existing watch page.
 * All other requests are served unchanged from the static asset binding.
 */

const CONTENT_ROUTE = /^\/(movie|series)\/([1-9][0-9]*)\/?$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(CONTENT_ROUTE);

    if (match) {
      const rewrittenUrl = new URL(url);
      rewrittenUrl.pathname = "/watch.html";

      // Keep the browser URL unchanged; only the internal asset request changes.
      const rewrittenRequest = new Request(rewrittenUrl.toString(), request);
      return env.ASSETS.fetch(rewrittenRequest);
    }

    // Invalid clean-content paths should not fall through to a generic page.
    if (/^\/(movie|series)(\/|$)/.test(url.pathname)) {
      return new Response("Content not found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff"
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
