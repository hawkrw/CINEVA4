/* =====================================================
   CINEVA — PROFESSIONAL WATCH PAGE CONTROLLER
   Supabase JS v2
===================================================== */

import { supabase, APP_CONFIG } from "./config.js";
/* DEFAULT POSTER */
const PLACEHOLDER = "/assets/images/movie-placeholder.jpg";

/* =====================================================
   CONFIGURATION — ORIGINAL URL SYSTEM
===================================================== */

const params = new URLSearchParams(window.location.search);
const contentId = params.get("id");
const contentType = params.get("type") === "series" ? "series" : "movie";

const table = contentType === "series"
    ? APP_CONFIG.seriesTable
    : APP_CONFIG.moviesTable;
/* =====================================================
   DOM ELEMENTS
===================================================== */

const el = {
    loading: document.querySelector("#watch-loading"),
    error: document.querySelector("#watch-error"),
    content: document.querySelector("#watch-content"),

    player: document.querySelector("#video-player"),
    playerEmpty: document.querySelector("#player-empty"),
    playerTitle: document.querySelector("#player-breadcrumb-title"),

    mainWatch: document.querySelector("#main-watch-btn"),
    mainDownload: document.querySelector("#main-download-btn"),

    title: document.querySelector("#watch-title"),
    description: document.querySelector("#watch-description"),
    poster: document.querySelector("#watch-poster"),
    category: document.querySelector("#watch-category"),
    year: document.querySelector("#watch-year"),
    rating: document.querySelector("#watch-rating"),
    type: document.querySelector("#watch-type"),

    likeButton: document.querySelector("#like-btn"),
    favoriteButton: document.querySelector("#favorite-btn"),
    likeCount: document.querySelector("#like-count"),
    shareButton: document.querySelector("#share-btn"),

    partsContainer: document.querySelector("#movie-parts-container"),
    partsGrid: document.querySelector("#movie-parts-grid"),

    episodesContainer: document.querySelector("#episodes-container"),
    episodeCount: document.querySelector("#episode-count"),
    seasonSelector: document.querySelector("#season-selector"),
    episodesGrid: document.querySelector("#episodes-grid"),

    commentsSection: document.querySelector("#comments-section"),
    commentsCount: document.querySelector("#comments-count"),
    commentForm: document.querySelector("#comment-form"),
    commentName: document.querySelector("#comment-name"),
    commentMessage: document.querySelector("#comment-message"),
    characterCount: document.querySelector("#comment-character-count"),
    commentButton: document.querySelector("#post-comment-btn"),
    commentFeedback: document.querySelector("#comment-feedback"),
    commentsList: document.querySelector("#comments-list"),

    related: document.querySelector("#related-content"),
    footerYear: document.querySelector("#footer-year"),
    backToTop: document.querySelector("#back-to-top")
};

/* =====================================================
   CURRENT CONTENT
===================================================== */

let currentContent = null;
let currentEpisodes = [];
let currentParts = [];
let currentHls = null;
let selectedMedia = null;

/* =====================================================
   HELPERS
===================================================== */

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function formatNumber(value) {
    return new Intl.NumberFormat().format(
        Number(value) || 0
    );
}

function getYear(item) {
    return (
        item.year ||
        item.release_year ||
        (item.release_date
            ? String(item.release_date).slice(0, 4)
            : "")
    );
}

function getRating(item) {
    return item.vote_average ?? item.rating ?? null;
}

function getDescription(item) {
    return (
        item.overview ||
        item.description ||
        "No description available."
    );
}

/* =====================================================
   CINEVA — SMART DOWNLOAD LINK DETECTION
===================================================== */

function normalizeLinks(item = {}) {
    const links = [];

    const addLink = (value, title = "Download") => {
        if (typeof value !== "string") return;

        const url = value.trim();

        if (!url || !isSafeHttpUrl(url)) return;

        if (links.some(link => link.url === url)) return;

        links.push({
            title: title || "Download",
            url
        });
    };

    function extractLinks(value, label = "Download") {
        if (value === null || value === undefined) return;

        if (typeof value === "string") {
            const trimmed = value.trim();

            if (!trimmed) return;

            if (
                (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
                (trimmed.startsWith("{") && trimmed.endsWith("}"))
            ) {
                try {
                    extractLinks(JSON.parse(trimmed), label);
                    return;
                } catch (error) {
                    // Treat as a normal URL if JSON parsing fails.
                }
            }

            addLink(trimmed, label);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((entry, index) => {
                extractLinks(entry, `${label} ${index + 1}`);
            });

            return;
        }

        if (typeof value === "object") {
            const urlFields = [
                "url",
                "href",
                "download_url",
                "download_link",
                "downloadUrl",
                "file_url",
                "direct_link",
                "link"
            ];

            let foundDirectUrl = false;

            for (const field of urlFields) {
                if (typeof value[field] === "string") {
                    addLink(
                        value[field],
                        value.title ||
                        value.name ||
                        value.quality ||
                        value.label ||
                        label
                    );

                    foundDirectUrl = true;
                }
            }

            if (foundDirectUrl) return;

            Object.entries(value).forEach(([key, entry]) => {
                extractLinks(entry, key);
            });
        }
    }

    [
        "download_url",
        "download_link",
        "download",
        "file_url",
        "direct_link",
        "link",
        "url"
    ].forEach(field => {
        extractLinks(item[field], field);
    });

    [
        "download_links",
        "download_options",
        "downloads"
    ].forEach(field => {
        extractLinks(item[field], field);
    });

    return links.filter((link, index, array) =>
        array.findIndex(item => item.url === link.url) === index
    );
}
function normalizeImageUrl(value) {
    if (typeof value !== "string") return "";

    const image = value.trim();

    if (
        !image ||
        image.includes("movie-placeholder.jpg") ||
        image.includes("placeholder.png")
    ) {
        return "";
    }

    if (/^https?:\/\//i.test(image)) {
        return image;
    }

    // TMDB relative image paths
    if (image.startsWith("/")) {
        return `https://image.tmdb.org/t/p/w500${image}`;
    }

    return image;
}

function getPoster(item = {}) {
    const candidates = [
        item.poster_path,
        item.poster,
        item.image,
        item.thumbnail
    ];

    for (const candidate of candidates) {
        const image = normalizeImageUrl(candidate);

        if (image) return image;
    }

    return PLACEHOLDER;
}
/* =====================================================
   CINEVA — SAFE HTTP / HTTPS VALIDATION
===================================================== */

function isSafeHttpUrl(value) {
    if (typeof value !== "string" || !value.trim()) {
        return false;
    }

    try {
        const url = new URL(value.trim());

        return (
            url.protocol === "http:" ||
            url.protocol === "https:"
        );
    } catch (error) {
        return false;
    }
}

/* =====================================================
   LOADING STATE
===================================================== */

function showLoading(show) {
    if (el.loading) {
        el.loading.hidden = !show;
    }
}

/* =====================================================
   ERROR STATE
===================================================== */

function showError(message) {
    showLoading(false);

    if (el.error) {
        el.error.hidden = false;

        const messageElement = el.error.querySelector("p");

        if (messageElement) {
            messageElement.textContent = message;
        }
    }

    if (el.content) {
        el.content.hidden = true;
    }
}
/* =====================================================
   CONTENT DISPLAY STATE
===================================================== */

function showContent() {
    showLoading(false);

    if (el.error) {
        el.error.hidden = true;
    }

    if (el.content) {
        el.content.hidden = false;
    }
}

/* =====================================================
   FETCH MAIN CONTENT
===================================================== */

async function fetchContent() {
    let query = supabase
        .from(table)
        .select("*")
        .eq("is_active", true);

    // Legacy watch URLs use the original primary key:
    // movies.id (UUID) or series.id (bigint).
    query = query.eq("id", contentId);

    const { data, error } = await query.maybeSingle();

    if (error) {
        console.error("Content query error:", error);
        throw new Error("Unable to retrieve content from Supabase.");
    }

    return data;
}
/* =====================================================
   CINEVA PRO — RECORD CONTENT VIEW
===================================================== */

async function incrementContentView(item) {
    if (!item?.id) return;

    try {
        const { data, error } = await supabase.rpc(
            "increment_content_view",
            {
                p_content_type: contentType,
                p_content_id: String(item.id)
            }
        );

        if (error) {
            console.error("View counter error:", error);
            return;
        }

        console.log(
            "CINEVA view recorded:",
            item.title,
            "Total views:",
            data
        );

    } catch (error) {
        console.error("Unable to record content view:", error);
    }
}
/* =====================================================
   DISPLAY CONTENT DETAILS
===================================================== */

function setSeoMeta(name, value, property = false) {
    if (!value) return;

    const selector = property
        ? `meta[property="${name}"]`
        : `meta[name="${name}"]`;

    let meta = document.head.querySelector(selector);

    if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute(property ? "property" : "name", name);
        document.head.appendChild(meta);
    }

    meta.setAttribute("content", String(value));
}

function updateWatchSeo(item) {
    const title = String(item.title || "Watch").trim();
    const description = String(getDescription(item) || "Discover this title on CINEVA.")
        .replace(/\\s+/g, " ")
        .slice(0, 300);
    const image = getPoster(item);
    const canonicalUrl = new URL(window.location.href);
    canonicalUrl.hash = "";

    document.title = `${title} | CINEVA`;

    setSeoMeta("description", description);
    setSeoMeta("robots", "index, follow, max-image-preview:large");
    setSeoMeta("og:type", "video.movie", true);
    setSeoMeta("og:site_name", "CINEVA", true);
    setSeoMeta("og:title", `${title} | CINEVA`, true);
    setSeoMeta("og:description", description, true);
    setSeoMeta("og:url", canonicalUrl.href, true);
    setSeoMeta("og:image", image, true);
    setSeoMeta("twitter:card", "summary_large_image");
    setSeoMeta("twitter:title", `${title} | CINEVA`);
    setSeoMeta("twitter:description", description);
    setSeoMeta("twitter:image", image);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl.href;

    const structuredData = {
        "@context": "https://schema.org",
        "@type": contentType === "series" ? "TVSeries" : "Movie",
        "name": title,
        "description": description,
        "url": canonicalUrl.href,
        "image": image || undefined,
        "datePublished": item.release_date || undefined,
        "genre": item.category || undefined,
        "inLanguage": item.original_language || undefined
    };

    let script = document.getElementById("cineva-watch-structured-data");
    if (!script) {
        script = document.createElement("script");
        script.id = "cineva-watch-structured-data";
        script.type = "application/ld+json";
        document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(structuredData);
}

function displayContent(item) {
    updateWatchSeo(item);
    document.title = `${item.title || "Watch"} | CINEVA`;

    if (el.title) {
        el.title.textContent = item.title || "Untitled";
    }

    if (el.description) {
        el.description.textContent = getDescription(item);
    }

    if (el.poster) {
        el.poster.src = getPoster(item);
        el.poster.alt = item.title || "Content poster";

        el.poster.onerror = () => {
            el.poster.src = PLACEHOLDER;
        };
    }

    if (el.category) {
        el.category.textContent = item.category || "Uncategorized";
    }

    if (el.year) {
        el.year.textContent = getYear(item) || "N/A";
    }

    if (el.rating) {
        const rating = getRating(item);

        el.rating.textContent = rating !== null
            ? `★ ${Number(rating).toFixed(1)}`
            : "Not rated";
    }

    if (el.type) {
        el.type.textContent = contentType === "series"
            ? "TV Series"
            : "Movie";
    }

    if (el.playerTitle) {
        el.playerTitle.textContent = item.title || "Now Playing";
    }

    if (el.likeCount) {
        el.likeCount.textContent = formatNumber(item.likes);
    }
}

/* =====================================================
   VIDEO PLAYER
===================================================== */

function destroyPlayer() {
    if (currentHls) {
        currentHls.destroy();
        currentHls = null;
    }

    if (el.player) {
        el.player.pause();
        el.player.removeAttribute("src");
        el.player.load();
        el.player.hidden = false;
    }

    const embed = document.querySelector("#embed-player");
    if (embed) {
        embed.src = "about:blank";
        embed.hidden = true;
    }
}

function showPlayerMessage(title, message) {
    if (!el.playerEmpty) return;

    el.playerEmpty.hidden = false;

    el.playerEmpty.innerHTML = `
        <div class="player-message">
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

function normalizeEmbedUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";

    let input = value.trim();

    // Accept a pasted iframe embed snippet as well as a plain URL.
    if (/<iframe\b/i.test(input)) {
        const match = input.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
        if (!match) return "";
        input = match[1].replace(/&amp;/g, "&");
    }

    if (!isSafeHttpUrl(input)) return "";

    try {
        const url = new URL(input);
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        const parts = url.pathname.split("/").filter(Boolean);
        const first = parts[0] || "";
        const second = parts[1] || "";

        // YouTube watch, short, live and youtu.be links.
        if (host === "youtu.be") {
            return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(first);
        }
        if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
            const id = url.searchParams.get("v") ||
                (["embed", "shorts", "live"].includes(first) ? second : "");
            if (id) return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id);
        }

        // Vimeo public video links.
        if (host === "vimeo.com" || host === "player.vimeo.com") {
            const id = host === "player.vimeo.com"
                ? (first === "video" ? second : first)
                : first;
            if (/^\d+$/.test(id)) return "https://player.vimeo.com/video/" + id;
        }

        // Google Drive share links.
        if (host === "drive.google.com" || host === "docs.google.com") {
            const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
            const id = fileMatch?.[1] || url.searchParams.get("id");
            if (id) return "https://drive.google.com/file/d/" + encodeURIComponent(id) + "/preview";
        }

        // Dropbox share links are best served as a browser preview.
        if (host === "dropbox.com") {
            url.searchParams.delete("dl");
            url.searchParams.set("raw", "1");
            return url.href;
        }

        // StreamHG share-page links use the HGCloud embed endpoint.
        if (
            (host === "audinifer.com" || host === "streamhg.com") &&
            first &&
            !["e", "embed"].includes(first.toLowerCase())
        ) {
            return "https://hgcloud.to/e/" + encodeURIComponent(first);
        }

        // Dembed share links must use its embed endpoint.
        if (host === "dembed.cc") {
            if (first.toLowerCase() === "embed" && second) return url.href;
            if (first.toLowerCase() === "v" && second) {
                return "https://dembed.cc/embed/" + encodeURIComponent(second);
            }
        }

        // Voe.sx share-page links use /e/VIDEO_ID for embedding.
        if (host === "voe.sx") {
            if (["e", "embed"].includes(first.toLowerCase())) return url.href;
            if (first) return "https://voe.sx/e/" + encodeURIComponent(first);
        }

        // Generic providers: use their supplied player/embed URL.
        return url.href;
    } catch {
        return "";
    }
}
function isDirectMediaUrl(value) {
    return /\.(mp4|m4v|webm|ogv|ogg|m3u8)(?:$|[?#])/i.test(value);
}

function playVideo(videoUrl, autoplay = false) {
    if (!el.player) return;

    if (!videoUrl || !isSafeHttpUrl(videoUrl)) {
        showPlayerMessage(
            "Video unavailable",
            "A valid video source has not been added yet."
        );
        return;
    }

    destroyPlayer();

    if (el.playerEmpty) {
        el.playerEmpty.hidden = true;
    }

    const playbackUrl = normalizeEmbedUrl(videoUrl);
    const isHLS = /\.m3u8($|[?#])/i.test(playbackUrl);
    const isDirectMedia = isDirectMediaUrl(playbackUrl);

    // Web-page and embed URLs are loaded in an iframe. Direct media
    // files and HLS streams continue using the native video player.
    if (!isDirectMedia && !isHLS) {
        const embed = document.querySelector("#embed-player");

        if (!embed) {
            showPlayerMessage(
                "Player unavailable",
                "The embedded video player could not be initialized."
            );
            return;
        }

        el.player.hidden = true;
        embed.hidden = false;
        embed.title = currentContent?.title
            ? `CINEVA player — ${currentContent.title}`
            : "CINEVA embedded video player";

        // Keep third-party players inside the CINEVA player and suppress
        // unsolicited pop-up windows where the provider supports sandboxing.
        // Voe.sx is intentionally excluded because its player rejects sandboxing.
        const embedHost = new URL(playbackUrl).hostname.toLowerCase();
        embed.removeAttribute("sandbox");
        if (
            embedHost === "dembed.cc" ||
            embedHost.endsWith(".dembed.cc") ||
            embedHost === "f4scdn.com" ||
            embedHost.endsWith(".f4scdn.com")
        ) {
            embed.setAttribute(
                "sandbox",
                "allow-scripts allow-same-origin allow-forms allow-presentation allow-downloads"
            );
        }
        embed.referrerPolicy = "strict-origin-when-cross-origin";
        embed.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
        embed.src = playbackUrl;
        return;
    }

    el.player.hidden = false;
    el.player.controls = true;
    el.player.playsInline = true;
    el.player.preload = "metadata";

    if (
        isHLS &&
        !el.player.canPlayType("application/vnd.apple.mpegurl")
    ) {
        if (window.Hls) {
            attachHls(playbackUrl, autoplay);
        } else {
            const script = document.createElement("script");

            script.src =
                "https://cdn.jsdelivr.net/npm/hls.js@latest";

            script.onload = () => attachHls(playbackUrl, autoplay);

            script.onerror = () => {
                showPlayerMessage(
                    "Streaming error",
                    "Unable to load the HLS playback engine."
                );
            };

            document.head.appendChild(script);
        }
    } else {
        el.player.src = playbackUrl;

        if (autoplay) {
            el.player.play().catch(() => {
                console.log("Press play to start playback.");
            });
        }
    }
}
function attachHls(videoUrl, autoplay) {
    if (!window.Hls || !window.Hls.isSupported()) {
        showPlayerMessage(
            "Unsupported stream",
            "This browser cannot play this HLS stream."
        );
        return;
    }

    currentHls = new window.Hls();

    currentHls.loadSource(videoUrl);
    currentHls.attachMedia(el.player);

    currentHls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        if (autoplay) {
            el.player.play().catch(() => {});
        }
    });

    currentHls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
            console.error("Fatal HLS error:", data);
            showPlayerMessage(
                "Playback error",
                "The video stream could not be played."
            );
        }
    });
}

/* =====================================================
   CINEVA — MAIN WATCH & DOWNLOAD CONTROLLER
===================================================== */

function openDownload(url) {
    if (!url || !isSafeHttpUrl(url)) {
        alert("This download link is unavailable.");
        return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
}

function scrollToPlayer() {
    document.querySelector(".video-player-wrapper")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
}


/* =====================================================
   CINEVA PRO — SMART WATCH & DOWNLOAD CONTROLLER
   IMPORTANT:
   - video_url / watch_url = playback only
   - download_url / download_link = download only
   - part.url = legacy download fallback only
   - Never use a download link as a video source
===================================================== */

/* =====================================================
   CINEVA PRO — STRICT WATCH / DOWNLOAD URL DETECTION
===================================================== */

function getMediaDownloadUrl(item = {}) {
    if (!item || typeof item !== "object") return "";

    const fields = [
        "download_url",
        "download_link",
        "downloadUrl",
        "downloadLink",
        "download"
    ];

    for (const field of fields) {
        const value = item[field];

        if (
            typeof value === "string" &&
            isSafeHttpUrl(value.trim())
        ) {
            return value.trim();
        }
    }

    // Additional download links only.
    const links = normalizeLinks({
        download_links: item.download_links,
        download_options: item.download_options,
        downloads: item.downloads
    });

    return links[0]?.url || "";
}

function getMediaVideoUrl(item = {}) {
    if (!item || typeof item !== "object") return "";

    const fields = [
        "video_url",
        "watch_url",
        "watch_link",
        "video_link",
        "stream_url",
        "videoUrl",
        "watchUrl",
        "playback_url"
    ];

    for (const field of fields) {
        const value = item[field];

        if (
            typeof value === "string" &&
            isSafeHttpUrl(value.trim())
        ) {
            return value.trim();
        }
    }

    return "";
}
/* =====================================================
   CINEVA PRO — NORMALIZE MOVIE PARTS
===================================================== */

function parseParts(record) {
    if (!record || record.parts == null) {
        return [];
    }

    let rawParts = record.parts;

    if (typeof rawParts === "string") {
        try {
            rawParts = JSON.parse(rawParts);
        } catch (error) {
            console.error("Invalid movie parts JSON:", error);
            return [];
        }
    }

    if (!Array.isArray(rawParts)) {
        if (Array.isArray(rawParts.parts)) {
            rawParts = rawParts.parts;
        } else if (Array.isArray(rawParts.items)) {
            rawParts = rawParts.items;
        } else {
            return [];
        }
    }

    return rawParts
        .filter(part =>
            part &&
            typeof part === "object" &&
            !Array.isArray(part)
        )
        .slice(0, 5)
        .map((part, index) => {
            const watchUrl = getMediaVideoUrl(part);
            const downloadUrl = getMediaDownloadUrl(part);

            return {
                ...part,

                part_number:
                    Number(part.part_number ?? part.partNumber) ||
                    index + 1,

                title: String(
                    part.title ||
                    part.part_title ||
                    part.name ||
                    `Part ${index + 1}`
                ).trim(),

                // Playback URL is exclusively for watching.
                video_url: watchUrl,

                // Download URL is exclusively for downloading.
                download_url: downloadUrl
            };
        });
}

/* =====================================================
   FETCH MOVIE PARTS
===================================================== */

async function fetchParts(item) {
    if (contentType !== "movie") return [];

    // The movies.parts JSONB column is the source of truth.
    return parseParts(item);
}
/* =====================================================
   CINEVA PRO — RENDER MOVIE PARTS
===================================================== */
/* =====================================================
   CINEVA PRO — RENDER MOVIE PARTS
===================================================== */

function renderParts(parts) {
    if (!el.partsContainer) return;

    currentParts = Array.isArray(parts) ? parts : [];

    const hasParts =
        contentType === "movie" &&
        currentParts.length > 0;

    el.partsContainer.hidden = !hasParts;
    el.partsContainer.style.display = hasParts ? "" : "none";

    // Hide the main action bar when separate movie parts exist.
    if (el.mainWatch && el.mainDownload) {
        let actionBar = el.mainWatch.parentElement;

        while (
            actionBar &&
            !actionBar.contains(el.mainDownload)
        ) {
            actionBar = actionBar.parentElement;
        }

        if (actionBar) {
            actionBar.classList.toggle("has-parts", hasParts);
            actionBar.style.display = hasParts ? "none" : "";
        }
    }

    if (!el.partsGrid) return;

    if (!hasParts) {
        el.partsGrid.innerHTML = "";
        return;
    }

    el.partsGrid.innerHTML = currentParts.map((part, index) => {
        const partNumber = part.part_number || index + 1;
        const title = part.title || `Part ${partNumber}`;

        const watchUrl = getMediaVideoUrl(part);
        const downloadUrl = getMediaDownloadUrl(part);

        return `
            <article class="movie-part-card">

                <div class="movie-part-number">
                    ${escapeHTML(partNumber)}
                </div>

                <div class="movie-part-info">
                    <h3>${escapeHTML(title)}</h3>
                    <p>Movie Part ${escapeHTML(partNumber)}</p>
                </div>

                <div class="movie-part-actions">

                    <button
                        class="part-watch-btn"
                        type="button"
                        data-action="watch-part"
                        data-index="${index}"
                        ${watchUrl ? "" : "disabled"}
                    >
                        <i class="fa-solid fa-play"></i>
                        Watch
                    </button>

                    <button
    class="part-download-btn"
    type="button"
    data-action="download-part"
    data-index="${index}"
    aria-label="Download"
    ${downloadUrl ? "" : "disabled"}
>
    <i class="fa-solid fa-download"></i>
</button>

                </div>

            </article>
        `;
    }).join("");

    // Attach separate Watch and Download actions.
    el.partsGrid.querySelectorAll("button[data-index]").forEach(button => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.index);
            const part = currentParts[index];

            if (!part) return;

            if (button.dataset.action === "watch-part") {
                const url = getMediaVideoUrl(part);

                if (!url) {
                    alert("No valid Watch URL has been added for this part.");
                    return;
                }

                setSelectedMedia(part, true);
                return;
            }

            if (button.dataset.action === "download-part") {
                const url = getMediaDownloadUrl(part);

                if (!url) {
                    alert("No valid Download URL has been added for this part.");
                    return;
                }

                setSelectedMedia(part);
                openDownload(url);
            }
        });
    });
}
/* =====================================================
   SET SELECTED MEDIA
===================================================== */

function setSelectedMedia(media, autoplay = false) {
    selectedMedia = media || null;

    const videoUrl = getMediaVideoUrl(media);
    const downloadUrl = getMediaDownloadUrl(media);

    if (el.mainWatch) {
        el.mainWatch.disabled = !videoUrl;

        el.mainWatch.onclick = () => {
            const selectedUrl = getMediaVideoUrl(selectedMedia);

            if (!selectedUrl) {
                showPlayerMessage(
                    "Video unavailable",
                    "No valid Watch URL is available for this selection."
                );
                return;
            }

            playVideo(selectedUrl, true);
            scrollToPlayer();
        };
    }

    if (el.mainDownload) {
        el.mainDownload.disabled = !downloadUrl;

        el.mainDownload.onclick = () => {
            const selectedUrl =
                getMediaDownloadUrl(selectedMedia);

            if (!selectedUrl) {
                alert("No Download URL is available for this selection.");
                return;
            }

            openDownload(selectedUrl);
        };
    }

    if (el.playerTitle && media) {
        el.playerTitle.textContent =
            media.title ||
            media.name ||
            currentContent?.title ||
            "Now Playing";
    }

    if (autoplay) {
        if (videoUrl) {
            playVideo(videoUrl, true);
            scrollToPlayer();
        } else {
            showPlayerMessage(
                "Video unavailable",
                "This selection does not have a valid Watch URL."
            );
        }
    }

    return {
        videoUrl,
        downloadUrl
    };
}
   
/* =====================================================
   SET MAIN CONTENT ACTIONS
===================================================== */

function setupMainActions(item) {
    setSelectedMedia(item);
}


/* =====================================================
   MAIN WATCH BUTTON
===================================================== */

function setupMainWatchButton(item) {
    if (!el.mainWatch) return;

    setSelectedMedia(item);
}


/* =====================================================
   MAIN DOWNLOAD BUTTON
===================================================== */

function setupMainDownloadButton(item) {
    if (!el.mainDownload) return;

    setSelectedMedia(item);
}


/* =====================================================
   WATCH SELECTED MOVIE PART
===================================================== */

function watchSelectedPart(part) {
    if (!part) {
        showPlayerMessage(
            "Part unavailable",
            "This movie part could not be found."
        );

        return;
    }

    const videoUrl = getMediaVideoUrl(part);

    if (!videoUrl) {
        showPlayerMessage(
            "Video unavailable",
            "This part does not have a valid watch link."
        );

        return;
    }

    setSelectedMedia(part, true);
}


/* =====================================================
   WATCH SELECTED EPISODE
===================================================== */

function watchSelectedEpisode(episode) {
    if (!episode) return;

    const parts = parseParts(episode);

    // Play the first part when the episode has multiple parts.
    if (parts.length) {
        watchSelectedPart(parts[0]);
        return;
    }

    const videoUrl = getMediaVideoUrl(episode);

    if (!videoUrl) {
        showPlayerMessage(
            "Episode unavailable",
            "No watch link has been added for this episode."
        );

        return;
    }

    setSelectedMedia(episode, true);
}

/* =====================================================
   FETCH SERIES EPISODES
===================================================== */

function getEpisodeNumber(episode = {}) {
    const modern = Number(episode.episode_number) || 0;
    const legacy = Number(episode.episode) || 0;
    return legacy > 1 && modern <= 1 ? legacy : (modern || legacy || 1);
}

function getEpisodeSeason(episode = {}) {
    const modern = Number(episode.season_number) || 0;
    const legacy = Number(episode.season) || 0;
    return legacy > 1 && modern <= 1 ? legacy : (modern || legacy || 1);
}

async function fetchEpisodes(seriesId) {
    const { data, error } = await supabase
        .from("episodes")
        .select("*")
        .eq("series_id", seriesId)
        .eq("is_active", true);

    if (error) {
        console.error("Episode loading error:", error);
        return [];
    }

    return (data || []).sort((a, b) =>
        getEpisodeSeason(a) - getEpisodeSeason(b) ||
        getEpisodeNumber(a) - getEpisodeNumber(b)
    );
}

/* =====================================================
   RENDER SERIES EPISODES — CINEVA PRO
===================================================== */

function renderEpisodes(episodes) {
    if (!el.episodesContainer) return;

    if (contentType !== "series") {
        el.episodesContainer.hidden = true;
        return;
    }

    el.episodesContainer.hidden = false;

    currentEpisodes = Array.isArray(episodes) ? episodes : [];

    if (el.episodeCount) {
        el.episodeCount.textContent =
            `${currentEpisodes.length} Episodes`;
    }

    if (!currentEpisodes.length) {
        if (el.episodesGrid) {
            el.episodesGrid.innerHTML = `
                <p class="episodes-empty">
                    No episodes have been added yet.
                </p>
            `;
        }

        if (el.seasonSelector) {
            el.seasonSelector.innerHTML = "";
        }

        return;
    }

    const seasons = [
        ...new Set(
            currentEpisodes.map(getEpisodeSeason)
        )
    ].sort((a, b) => a - b);

    if (el.seasonSelector) {
        el.seasonSelector.innerHTML = seasons.map(season => `
            <option value="${season}">
                Season ${season}
            </option>
        `).join("");

        el.seasonSelector.onchange = () => {
            renderSeason(Number(el.seasonSelector.value));
        };
    }

    renderSeason(seasons[0]);
}

/* =====================================================
   EXTRACT EPISODE DOWNLOAD LINKS
===================================================== */

function getEpisodeDownloadLinks(episode) {
    const links = [];

    const addLink = (value, label = "Download") => {
        if (typeof value !== "string") return;

        const url = value.trim();

        if (!url) return;

        try {
            const parsed = new URL(url, window.location.origin);

            if (!["http:", "https:"].includes(parsed.protocol)) {
                return;
            }

            if (!links.some(item => item.url === parsed.href)) {
                links.push({
                    label,
                    url: parsed.href
                });
            }
        } catch (error) {
            console.warn("Invalid episode download URL:", value);
        }
    };

    const readValue = (value, label = "Download") => {
        if (value === null || value === undefined) return;

        if (typeof value === "string") {
            const trimmed = value.trim();

            if (
                (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
                (trimmed.startsWith("{") && trimmed.endsWith("}"))
            ) {
                try {
                    readValue(JSON.parse(trimmed), label);
                    return;
                } catch (error) {
                    // Continue and treat it as a direct URL
                }
            }

            addLink(trimmed, label);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                readValue(item, `Download ${index + 1}`);
            });
            return;
        }

        if (typeof value === "object") {
            const urlFields = [
                "url",
                "href",
                "download_url",
                "download_link",
                "downloadUrl",
                "file_url",
                "direct_link",
                "link"
            ];

            for (const field of urlFields) {
                if (value[field]) {
                    addLink(
                        value[field],
                        value.label || value.quality || label
                    );
                }
            }

            if (!urlFields.some(field => value[field])) {
                Object.entries(value).forEach(([key, item]) => {
                    readValue(item, key);
                });
            }
        }
    };

    [
        "download_url",
        "download_link",
        "download",
        "file_url",
        "direct_link",
        "link"
    ].forEach(field => {
        readValue(episode[field], field);
    });

    [
        "download_links",
        "download_options",
        "downloads"
    ].forEach(field => {
        readValue(episode[field], field);
    });

    return links;
}

/* =====================================================
   RENDER SELECTED SEASON — EPISODE PARTS
===================================================== */

/* =====================================================
   RENDER SELECTED SEASON — EPISODE PARTS
===================================================== */

function renderSeason(seasonNumber) {
    if (!el.episodesGrid) return;

    const selectedSeason = Number(seasonNumber);

    const episodes = currentEpisodes
        .filter(episode => getEpisodeSeason(episode) === selectedSeason)
        .sort((a, b) => getEpisodeNumber(a) - getEpisodeNumber(b));

    if (!episodes.length) {
        el.episodesGrid.innerHTML = `
            <p class="episodes-empty">
                No episodes found in this season.
            </p>
        `;
        return;
    }

    el.episodesGrid.innerHTML = episodes.map(episode => {
        const episodeIndex = currentEpisodes.findIndex(
            item => String(item.id) === String(episode.id)
        );
        const episodeNumber = getEpisodeNumber(episode);

        const parts = parseParts(episode);
        const hasParts = parts.length > 0;

        const episodeWatchUrl = getMediaVideoUrl(episode);
        const episodeDownloadUrl = getMediaDownloadUrl(episode);

        const partButtons = parts.map((part, index) => {
            const watchUrl = getMediaVideoUrl(part);
            const downloadUrl = getMediaDownloadUrl(part);

            return `
                <div class="episode-part-item">

                    <span class="episode-part-title">
                        ${escapeHTML(
                            part.title || `Part ${part.part_number ?? index + 1}`
                        )}
                    </span>

                    <div class="episode-actions">

                        <button
                            class="episode-watch-btn"
                            type="button"
                            data-action="watch-episode-part"
                            data-episode-index="${episodeIndex}"
                            data-part-index="${index}"
                            ${watchUrl ? "" : "disabled"}
                        >
                            <i class="fa-solid fa-play"></i>
                            <span>Watch</span>
                        </button>

                        <button
                            class="episode-download-btn"
                            type="button"
                            data-action="download-episode-part"
                            data-episode-index="${episodeIndex}"
                            data-part-index="${index}"
                            ${downloadUrl ? "" : "disabled"}
                        >
                            <i class="fa-solid fa-download"></i>
                            <span>Download</span>
                        </button>

                    </div>
                </div>
            `;
        }).join("");

        return `
            <article class="episode-card">

                <div class="episode-top">

                    <span class="episode-number">
                        EP ${escapeHTML(episodeNumber)}
                    </span>

                    <div class="episode-information">
                        <h3>
                            ${escapeHTML(`Ep${episodeNumber}`)}
                            ${episode.title && !/^episode\s*\d+$/i.test(episode.title.trim())
                                ? ` — ${escapeHTML(episode.title)}`
                                : ""}
                        </h3>

                        <p>
                            Season ${escapeHTML(selectedSeason)}
                            • Episode ${escapeHTML(episodeNumber)}
                        </p>
                    </div>

                </div>

                ${
                    episode.description
                        ? `<p class="episode-description">${escapeHTML(episode.description)}</p>`
                        : ""
                }

                ${
                    hasParts
                        ? `<div class="episode-parts">${partButtons}</div>`
                        : `
                            <div class="episode-actions">

                                <button
                                    class="episode-watch-btn"
                                    type="button"
                                    data-action="play-episode"
                                    data-episode-index="${episodeIndex}"
                                    ${episodeWatchUrl ? "" : "disabled"}
                                >
                                    <i class="fa-solid fa-play"></i>
                                    <span>Watch</span>
                                </button>

                                <button
                                    class="episode-download-btn"
                                    type="button"
                                    data-action="download-episode"
                                    data-episode-index="${episodeIndex}"
                                    ${episodeDownloadUrl ? "" : "disabled"}
                                >
                                    <i class="fa-solid fa-download"></i>
                                    <span>Download</span>
                                </button>

                            </div>
                        `
                }

            </article>
        `;
    }).join("");

    // Attach one click handler to each episode action.
    el.episodesGrid.querySelectorAll("button[data-action]").forEach(button => {
        button.addEventListener("click", () => {
            const episodeIndex = Number(button.dataset.episodeIndex);
            const episode = Number.isInteger(episodeIndex)
                ? currentEpisodes[episodeIndex]
                : null;

            if (!episode) return;

            const parts = parseParts(episode);
            const action = button.dataset.action;

            // Watch an individual episode part.
            if (action === "watch-episode-part") {
                const part = parts[Number(button.dataset.partIndex)];

                if (!part) return;

                const url = getMediaVideoUrl(part);

                if (!url) {
                    alert("No Watch URL is available for this part.");
                    return;
                }

                setSelectedMedia(part, true);
                scrollToPlayer();
                return;
            }

            // Download an individual episode part.
            if (action === "download-episode-part") {
                const part = parts[Number(button.dataset.partIndex)];

                if (!part) return;

                const url = getMediaDownloadUrl(part);

                if (!url) {
                    alert("No Download URL is available for this part.");
                    return;
                }

                setSelectedMedia(part);
                openDownload(url);
                return;
            }

            // Watch an episode without parts.
            if (action === "play-episode") {
                const url = getMediaVideoUrl(episode);

                if (!url) {
                    alert("No Watch URL is available for this episode.");
                    return;
                }

                setSelectedMedia(episode, true);
                scrollToPlayer();
                return;
            }

            // Download an episode without parts.
            if (action === "download-episode") {
                const url = getMediaDownloadUrl(episode);

                if (!url) {
                    alert("No Download URL is available for this episode.");
                    return;
                }

                setSelectedMedia(episode);
                openDownload(url);
            }
        });
    });
}
/* =====================================================
   COMMENTS
===================================================== */

async function fetchComments(item) {
    const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("content_id", String(item.id))
        .eq("content_type", contentType)
        .eq("is_approved", true)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Comments loading error:", error);
        return [];
    }
    return data || [];
}

function renderComments(comments) {
    if (!el.commentsList) return;
    if (el.commentsCount) el.commentsCount.textContent = comments.length;

    if (!comments.length) {
        el.commentsList.innerHTML = `
            <p class="comments-empty">No comments yet. Be the first to comment!</p>
        `;
        return;
    }

    el.commentsList.innerHTML = comments.map(comment => {
        const name = escapeHTML(comment.display_name || comment.username || "Guest");
        const body = comment.comment || comment.text || "";
        const date = comment.created_at ? new Date(comment.created_at).toLocaleDateString() : "";

        return `
            <article class="comment-item">
                <div class="comment-avatar">${escapeHTML(name.charAt(0).toUpperCase())}</div>
                <div class="comment-content">
                    <div class="comment-user-row">
                        <strong>${name}</strong>
                        <span>${escapeHTML(date)}</span>
                    </div>
                    <p class="comment-text">${escapeHTML(body)}</p>
                </div>
            </article>
        `;
    }).join("");
}

function setupCommentForm(item) {
    if (!el.commentForm) return;

    if (el.characterCount && el.commentMessage) {
        el.commentMessage.addEventListener("input", () => {
            el.characterCount.textContent = el.commentMessage.value.length;
        });
    }

    el.commentForm.addEventListener("submit", async event => {
        event.preventDefault();
        const name = el.commentName?.value.trim() || "";
        const message = el.commentMessage?.value.trim() || "";

        if (name.length < 2 || name.length > 60) {
            setCommentFeedback("Name must be between 2 and 60 characters.");
            return;
        }
        if (message.length < 2 || message.length > 2000) {
            setCommentFeedback("Comment must be between 2 and 2000 characters.");
            return;
        }

        if (el.commentButton) {
            el.commentButton.disabled = true;
            el.commentButton.textContent = "Posting...";
        }

        try {
            const { error } = await supabase
                .from("comments")
                .insert({
                    content_id: String(item.id),
                    content_type: contentType,
                    display_name: name,
                    comment: message,
                    text: message,
                    is_approved: true
                });

            if (error) throw error;

            el.commentForm.reset();
            if (el.characterCount) el.characterCount.textContent = "0";
            setCommentFeedback("Your comment is now published.");
            renderComments(await fetchComments(item));
        } catch (error) {
            console.error("Comment submission error:", error);
            setCommentFeedback(error?.message
                ? `Unable to publish comment: ${error.message}`
                : "Unable to submit your comment. Please try again.");
        } finally {
            if (el.commentButton) {
                el.commentButton.disabled = false;
                el.commentButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Post Comment';
            }
        }
    });
}

function setCommentFeedback(message) {
    if (el.commentFeedback) {
        el.commentFeedback.textContent = message;
    }
}

/* =====================================================
   LIKES
===================================================== */

function setupLikes(item) {
    if (!el.likeButton) return;

    el.likeButton.addEventListener("click", async () => {
        el.likeButton.disabled = true;

        try {
            const { data, error: readError } = await supabase
                .from(table)
                .select("likes")
                .eq("id", item.id)
                .maybeSingle();

            if (readError) throw readError;

            const nextLikes = (Number(data?.likes) || 0) + 1;

            const { error: updateError } = await supabase
                .from(table)
                .update({ likes: nextLikes })
                .eq("id", item.id);

            if (updateError) throw updateError;

            item.likes = nextLikes;

            if (el.likeCount) {
                el.likeCount.textContent = formatNumber(nextLikes);
            }

            el.likeButton.classList.add("liked");
        } catch (error) {
            console.error("Like update error:", error);

            alert(
                "Unable to save your like. Check your Supabase update permissions."
            );
        } finally {
            el.likeButton.disabled = false;
        }
    });
}

/* =====================================================
   FAVORITES — SAVE / REMOVE TOGGLE
===================================================== */
function setupFavorite(item) {
    if (!el.favoriteButton || !item?.id) return;

    const key = String(item.id) + "::" + contentType;
    const readFavorites = () => {
        try {
            const saved = JSON.parse(localStorage.getItem("cineva_favorites") || "[]");
            return Array.isArray(saved) ? saved : [];
        } catch (_) {
            return [];
        }
    };

    const updateButton = () => {
        const active = readFavorites().some(saved =>
            String(saved.id) + "::" +
            (String(saved.content_type || saved.type || "movie").toLowerCase() === "series" ? "series" : "movie") === key
        );
        el.favoriteButton.classList.toggle("liked", active);
        el.favoriteButton.setAttribute("aria-pressed", String(active));
        el.favoriteButton.setAttribute("aria-label", active ? "Remove from favorites" : "Add to favorites");
        const icon = el.favoriteButton.querySelector("i");
        if (icon) icon.className = active ? "fa-solid fa-heart" : "fa-regular fa-heart";
        const label = el.favoriteButton.querySelector("span");
        if (label) label.textContent = active ? "Saved" : "Save";
    };

    updateButton();
    el.favoriteButton.addEventListener("click", () => {
        const favorites = readFavorites();
        const exists = favorites.some(saved =>
            String(saved.id) + "::" +
            (String(saved.content_type || saved.type || "movie").toLowerCase() === "series" ? "series" : "movie") === key
        );

        const updated = exists
            ? favorites.filter(saved =>
                String(saved.id) + "::" +
                (String(saved.content_type || saved.type || "movie").toLowerCase() === "series" ? "series" : "movie") !== key
            )
            : [...favorites, {
                id: item.id,
                title: item.title || "Untitled",
                poster: getPoster(item),
                content_type: contentType,
                category: item.category || "",
                year: getYear(item),
                rating: getRating(item)
            }];

        try {
            localStorage.setItem("cineva_favorites", JSON.stringify(updated));
            updateButton();
            window.dispatchEvent(new Event("cineva:favorites-updated"));
        } catch (error) {
            console.error("CINEVA favorite toggle failed:", error);
            alert("Unable to update favorites. Check your browser storage.");
        }
    });
}

/* =====================================================
   SHARE CONTENT
===================================================== */

function setupShare(item) {
    if (!el.shareButton) return;

    el.shareButton.addEventListener("click", async () => {
        const shareData = {
            title: item.title || "CINEVA",
            text: `Watch ${item.title || "this content"} on CINEVA`,
            url: window.location.href
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(shareData.url);
                alert("Watch link copied!");
            } else {
                window.prompt("Copy this link:", shareData.url);
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                console.error("Share error:", error);
            }
        }
    });
}

/* =====================================================
   RELATED CONTENT
===================================================== */

async function fetchRelated(item) {
    let query = supabase
        .from(table)
        .select("*")
        .eq("is_active", true)
        .neq("id", item.id)
        .limit(8);

    if (item.category) {
        query = query.ilike("category", item.category);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Related content error:", error);
        return [];
    }

    return data || [];
}

function renderRelated(items) {
    if (!el.related) return;

    if (!items.length) {
        el.related.innerHTML = `
            <p class="related-empty">
                No related content available.
            </p>
        `;
        return;
    }

    el.related.innerHTML = items.map(item => {
        const title = escapeHTML(item.title || "Untitled");
        const poster = escapeHTML(getPoster(item));

        if (item.id == null) return "";

        return `
            <a
                href="/watch.html?id=${encodeURIComponent(item.id)}&type=${contentType}"
                class="movie-card"
            >
                <div class="movie-poster">
                    <img
                        src="${poster}"
                        alt="${title}"
                        loading="lazy"
                    >
                </div>

                <div class="movie-info">
                    <h3>${title}</h3>
                    <span>${escapeHTML(getYear(item))}</span>
                </div>
            </a>
        `;
    }).join("");
}
/* =====================================================
   CINEVA — FOOTER, BACK TO TOP & RELATED NAVIGATION
===================================================== */

function setupPageExtras() {
    if (el.footerYear) {
        el.footerYear.textContent = new Date().getFullYear();
    }

    if (el.backToTop) {
        const updateBackToTop = () => {
            el.backToTop.classList.toggle(
                "visible",
                window.scrollY > 500
            );
        };

        window.addEventListener("scroll", updateBackToTop, {
            passive: true
        });

        el.backToTop.addEventListener("click", () => {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });

        updateBackToTop();
    }

    const relatedGrid = document.querySelector("#related-content");
    const relatedPrev = document.querySelector("#related-prev");
    const relatedNext = document.querySelector("#related-next");

    if (!relatedGrid) return;

    const SCROLL_AMOUNT = 320;

    function updateRelatedArrows() {
        const maxScroll =
            relatedGrid.scrollWidth - relatedGrid.clientWidth;

        const canScroll = maxScroll > 5;

        if (relatedPrev) {
            relatedPrev.disabled =
                !canScroll || relatedGrid.scrollLeft <= 5;

            relatedPrev.classList.toggle(
                "is-hidden",
                !canScroll
            );
        }

        if (relatedNext) {
            relatedNext.disabled =
                !canScroll ||
                relatedGrid.scrollLeft >= maxScroll - 5;

            relatedNext.classList.toggle(
                "is-hidden",
                !canScroll
            );
        }
    }

    relatedPrev?.addEventListener("click", () => {
        relatedGrid.scrollBy({
            left: -SCROLL_AMOUNT,
            behavior: "smooth"
        });
    });

    relatedNext?.addEventListener("click", () => {
        relatedGrid.scrollBy({
            left: SCROLL_AMOUNT,
            behavior: "smooth"
        });
    });

    relatedGrid.addEventListener(
        "scroll",
        updateRelatedArrows,
        { passive: true }
    );

    window.addEventListener(
        "resize",
        updateRelatedArrows
    );

    const relatedObserver = new MutationObserver(() => {
        requestAnimationFrame(() => {
            updateRelatedArrows();
        });
    });

    relatedObserver.observe(relatedGrid, {
        childList: true,
        subtree: true
    });

    relatedGrid.addEventListener("load", event => {
        if (event.target.tagName === "IMG") {
            updateRelatedArrows();
        }
    }, true);

    updateRelatedArrows();
}

/* =====================================================
   CINEVA — INITIALIZE WATCH PAGE
===================================================== */

async function initializeWatchPage() {
    setupPageExtras();

    if (!contentId) {
        showError(
            "No content selected. Please select a movie or series."
        );
        return;
    }

    showLoading(true);

    try {
        const item = await fetchContent();

        if (!item) {
            showError(
                "Content not found or unavailable."
            );
            return;
        }
currentContent = item;

// Record one view for this page opening.
incrementContentView(item);

displayContent(item);

        showContent();

        setupMainActions(item);
        setupLikes(item);
        setupFavorite(item);
        setupShare(item);
        setupCommentForm(item);
       

       

        const [
            episodes,
            parts,
            comments,
            related
        ] = await Promise.all([
            contentType === "series"
                ? fetchEpisodes(item.id)
                : Promise.resolve([]),

            fetchParts(item),

            fetchComments(item),

            fetchRelated(item)
        ]);

        renderEpisodes(episodes);
        renderParts(parts);
       // Do not automatically play the main movie when
// separate movie parts are available.
if (contentType === "movie" && parts.length > 0) {
    destroyPlayer();

    showPlayerMessage(
        "Select a movie part",
        "Choose a part below to start watching."
    );
} else if (
    contentType === "movie" &&
    getMediaVideoUrl(item)
) {
    playVideo(getMediaVideoUrl(item));
} else {
    showPlayerMessage(
        "Ready to watch",
        "Select an available episode or part to begin."
    );
}
        renderComments(comments);
        renderRelated(related);

        requestAnimationFrame(() => {
            const relatedGrid =
                document.querySelector("#related-content");

            if (relatedGrid) {
                relatedGrid.dispatchEvent(
                    new Event("scroll")
                );
            }
        });

        console.log(
            `CINEVA: ${contentType} loaded successfully.`,
            item.title
        );

    } catch (error) {
        console.error(
            "CINEVA watch initialization error:",
            error
        );

        showError(
            error.message ||
            "Unable to load this content. Please try again."
        );
    }
}
/* =========================================
   WATCH PAGE — CLOSE SEARCH
========================================= */

function setupWatchSearchClose() {
    const searchBox = document.querySelector("#search-form");
    const searchInput = document.querySelector("#search-input");
    const searchResults = document.querySelector("#search-results");
    const closeButton = document.querySelector("#watchSearchClose");

    if (!searchBox || !searchInput || !closeButton) return;

    searchInput.addEventListener("focus", () => {
        searchBox.classList.add("search-active");
    });

    closeButton.addEventListener("click", () => {
        searchInput.value = "";
        searchBox.classList.remove("search-active");

        if (searchResults) {
            searchResults.innerHTML = "";
            searchResults.classList.remove("active", "show");
        }

        searchInput.blur();
    });
}

setupWatchSearchClose();
/* =====================================================
   START CINEVA WATCH APPLICATION
===================================================== */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeWatchPage,
        { once: true }
    );
} else {
    initializeWatchPage();
}

console.log("CINEVA Watch System Ready.");

/* =========================================
   CINEVA WATCH PAGE — SEARCH OPEN/CLOSE
========================================= */

function initializeWatchSearchControls() {
    const searchForm = document.getElementById("search-form");
    const searchInput = document.getElementById("search-input");
    const searchClose = document.getElementById("watchSearchClose");
    const searchResults = document.getElementById("search-results");

    if (!searchForm || !searchInput || !searchClose) return;

    // Open search when the input receives focus
    searchInput.addEventListener("focus", () => {
        searchForm.classList.remove("watch-search-collapsed");
    });

    // Open search when the magnifying glass is clicked
    searchForm.addEventListener("submit", (event) => {
        if (searchForm.classList.contains("watch-search-collapsed")) {
            event.preventDefault();

            searchForm.classList.remove("watch-search-collapsed");

            requestAnimationFrame(() => {
                searchInput.focus();
            });
        }
    }, true);

    // Close search when X is clicked
    searchClose.addEventListener("click", () => {
        searchInput.value = "";

        // Notify the existing search system that input was cleared
        searchInput.dispatchEvent(new Event("input", {
            bubbles: true
        }));

        if (searchResults) {
            searchResults.innerHTML = "";
            searchResults.classList.remove("active", "show");
        }

        searchForm.classList.add("watch-search-collapsed");
        searchInput.blur();
    });
}

initializeWatchSearchControls();
