/**
 * CINEVA — Cloudflare Worker
 * Legacy watch navigation is handled by watch.html?id=...&type=...
 * Static assets are served unchanged. Clean /movie and /series routing is paused.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
