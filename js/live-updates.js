/* CINEVA — LIVE CONTENT UPDATES
   Admin dashboard changes are broadcast through a tiny public version row.
   Reloads active pages automatically while protecting forms and active playback.
*/
import { publicSupabase } from "./config.js?v=20261113-live-updates-1";

const SIGNAL_TABLE = "cineva_content_updates";
const CHANNEL_NAME = "cineva-live-content-updates";
const HOME_CACHE_PREFIX = "cineva_homepage_cache_";
const SCROLL_KEY = "cineva_live_update_scroll";
const IS_DESKTOP = window.matchMedia("(pointer: fine) and (min-width: 768px)").matches;
const POLL_INTERVAL_MS = IS_DESKTOP ? 15000 : 30000;
const SW_CHECK_INTERVAL_MS = IS_DESKTOP ? 3 * 60 * 1000 : 5 * 60 * 1000;

let lastVersion = null;
let pendingReload = false;
let reloadTimer = null;
let channel = null;

function readSavedScroll() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "null");
        if (!saved || saved.path !== location.pathname + location.search) return;
        sessionStorage.removeItem(SCROLL_KEY);
        requestAnimationFrame(() => window.scrollTo(0, Number(saved.y) || 0));
    } catch (_) {}
}

function clearStalePageCaches() {
    try {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(HOME_CACHE_PREFIX)) localStorage.removeItem(key);
        });
    } catch (_) {}
}

function isUserEditing() {
    const active = document.activeElement;
    return !!active && (
        /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) ||
        active.isContentEditable
    );
}

function isWatchingVideo() {
    if (!/watch\.html$/i.test(location.pathname)) return false;
    const video = document.querySelector("video");
    return !!video && !video.ended && (video.currentTime > 0 || !video.paused);
}

function saveScrollPosition() {
    try {
        sessionStorage.setItem(SCROLL_KEY, JSON.stringify({
            path: location.pathname + location.search,
            y: window.scrollY
        }));
    } catch (_) {}
}

function reloadWhenSafe() {
    if (!pendingReload || document.visibilityState !== "visible") return;
    if (isUserEditing() || isWatchingVideo()) return;

    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
        if (!pendingReload || document.visibilityState !== "visible" || isUserEditing() || isWatchingVideo()) return;
        pendingReload = false;
        clearStalePageCaches();
        saveScrollPosition();
        window.location.reload();
    }, 1600);
}

function queueUpdate(source = "realtime") {
    pendingReload = true;
    console.info("CINEVA: New dashboard update detected (" + source + ").");
    reloadWhenSafe();
}

async function readVersion() {
    const { data, error } = await publicSupabase
        .from(SIGNAL_TABLE)
        .select("updated_at")
        .eq("id", 1)
        .maybeSingle();

    if (error) throw error;
    return data?.updated_at || null;
}

async function startLiveUpdates() {
    try {
        lastVersion = await readVersion();
    } catch (error) {
        console.warn("CINEVA: Could not read live update version.", error);
    }

    channel = publicSupabase
        .channel(CHANNEL_NAME)
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: SIGNAL_TABLE
            },
            payload => {
                const nextVersion = payload?.new?.updated_at || null;
                if (nextVersion && nextVersion !== lastVersion) {
                    lastVersion = nextVersion;
                    queueUpdate("dashboard");
                }
            }
        )
        .subscribe(async status => {
            if (status === "SUBSCRIBED") {
                try {
                    const currentVersion = await readVersion();
                    if (lastVersion && currentVersion && currentVersion !== lastVersion) {
                        lastVersion = currentVersion;
                        queueUpdate("reconnect");
                    } else if (currentVersion) {
                        lastVersion = currentVersion;
                    }
                } catch (error) {
                    console.warn("CINEVA: Live update sync check failed.", error);
                }
            }
        });

    // Desktop checks more frequently; mobile keeps a lighter fallback interval.
    window.setInterval(async () => {
        if (document.visibilityState !== "visible") return;
        try {
            const currentVersion = await readVersion();
            if (currentVersion && lastVersion && currentVersion !== lastVersion) {
                lastVersion = currentVersion;
                queueUpdate("sync");
            } else if (currentVersion) {
                lastVersion = currentVersion;
            }
        } catch (error) {
            console.warn("CINEVA: Update sync check unavailable.", error);
        }
    }, POLL_INTERVAL_MS);

    // Check the deployed service-worker script so installed desktop browsers
    // receive new website code without manual cache clearing.
    if ("serviceWorker" in navigator) {
        const checkServiceWorker = async () => {
            if (document.visibilityState !== "visible" || !navigator.onLine) return;
            try {
                const registration = await navigator.serviceWorker.getRegistration("/");
                if (registration) await registration.update();
            } catch (error) {
                console.warn("CINEVA: Automatic app update check unavailable.", error);
            }
        };

        checkServiceWorker();
        window.setInterval(checkServiceWorker, SW_CHECK_INTERVAL_MS);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") checkServiceWorker();
        });
        window.addEventListener("online", checkServiceWorker);

        let refreshingForWorker = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshingForWorker) return;
            refreshingForWorker = true;
            window.location.reload();
        });
    }
}

readSavedScroll();
document.addEventListener("visibilitychange", reloadWhenSafe);
window.addEventListener("focus", reloadWhenSafe);
document.addEventListener("focusout", () => setTimeout(reloadWhenSafe, 250));
document.addEventListener("ended", reloadWhenSafe, true);
window.addEventListener("online", () => {
    if (pendingReload) reloadWhenSafe();
});

startLiveUpdates();

window.addEventListener("pagehide", () => {
    if (channel) publicSupabase.removeChannel(channel);
});
