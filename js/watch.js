/* =====================================================
   CINEVA — PROFESSIONAL WATCH PAGE CONTROLLER
   Supabase JS v2
===================================================== */

import { supabase, APP_CONFIG } from "./config.js";

/* =====================================================
   CONFIGURATION
===================================================== */

const PLACEHOLDER = "assets/images/movie-placeholder.jpg";

const params = new URLSearchParams(window.location.search);

const contentId = params.get("id");
const contentType = params.get("type") === "series"
    ? "series"
    : "movie";

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
        el.error.textContent = message;
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
    const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("id", contentId)
        .maybeSingle();

    if (error) {
        console.error("Content query error:", error);
        throw new Error("Unable to retrieve content from Supabase.");
    }

    return data;
}

/* =====================================================
   DISPLAY CONTENT DETAILS
===================================================== */

function displayContent(item) {
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

    const isHLS = /\.m3u8($|\?)/i.test(videoUrl);

    el.player.controls = true;
    el.player.playsInline = true;
    el.player.preload = "metadata";

    if (
        isHLS &&
        !el.player.canPlayType("application/vnd.apple.mpegurl")
    ) {
        if (window.Hls) {
            attachHls(videoUrl, autoplay);
        } else {
            const script = document.createElement("script");

            script.src =
                "https://cdn.jsdelivr.net/npm/hls.js@latest";

            script.onload = () => attachHls(videoUrl, autoplay);

            script.onerror = () => {
                showPlayerMessage(
                    "Streaming error",
                    "Unable to load the HLS playback engine."
                );
            };

            document.head.appendChild(script);
        }
    } else {
        el.player.src = videoUrl;

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
   GET DOWNLOAD URL
===================================================== */

function getMediaDownloadUrl(item = {}) {
    if (!item || typeof item !== "object") {
        return "";
    }

    // 1. Direct download fields
  const directFields = [
    "download_url",
    "download_link",
    "downloadUrl",
    "downloadLink",
    "download",
    "file_url",
    "direct_link"
];

    for (const field of directFields) {
        const value = item[field];

        if (
            typeof value === "string" &&
            isSafeHttpUrl(value.trim())
        ) {
            return value.trim();
        }
    }

    // 2. Structured download options
    const links = normalizeLinks({
        download_links: item.download_links,
        download_options: item.download_options,
        downloads: item.downloads
    });

    if (links.length) {
        return links[0].url;
    }

    // 3. Legacy grouped-part schema.
    // NEVER use this field for video playback.
    if (
        typeof item.url === "string" &&
        isSafeHttpUrl(item.url.trim())
    ) {
        return item.url.trim();
    }

    return "";
}


/* =====================================================
   GET VIDEO / WATCH URL
===================================================== */

function getMediaVideoUrl(item = {}) {
    if (!item || typeof item !== "object") {
        return "";
    }

    const videoFields = [
        "video_url",
        "watch_url",
        "video_link",
        "stream_url"
    ];

    for (const field of videoFields) {
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
   SET SELECTED MEDIA
===================================================== */

function setSelectedMedia(media, autoplay = false) {
    selectedMedia = media || null;

    const videoUrl = getMediaVideoUrl(media);
    const downloadUrl = getMediaDownloadUrl(media);

    // -------------------------------
    // MAIN WATCH BUTTON
    // -------------------------------

    if (el.mainWatch) {
        el.mainWatch.disabled = !videoUrl;

        el.mainWatch.onclick = () => {
            if (!videoUrl) {
                showPlayerMessage(
                    "Video unavailable",
                    "No valid watch link is available for this selection."
                );

                return;
            }

            playVideo(videoUrl, true);
            scrollToPlayer();
        };
    }

    // -------------------------------
    // MAIN DOWNLOAD BUTTON
    // -------------------------------

    if (el.mainDownload) {
        el.mainDownload.disabled = !downloadUrl;

        el.mainDownload.onclick = () => {
            if (!downloadUrl) {
                alert(
                    "No download link is available for this selection."
                );

                return;
            }

            openDownload(downloadUrl);
        };
    }

    // -------------------------------
    // PLAYER TITLE
    // -------------------------------

    if (el.playerTitle && media) {
        el.playerTitle.textContent =
            media.title ||
            media.name ||
            currentContent?.title ||
            "Now Playing";
    }

    // -------------------------------
    // OPTIONAL AUTOPLAY
    // -------------------------------

    if (autoplay) {
        if (videoUrl) {
            playVideo(videoUrl, true);
            scrollToPlayer();
        } else {
            showPlayerMessage(
                "Video unavailable",
                "This selection has no valid watch link. You can still use its download link if one is available."
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

async function fetchEpisodes(seriesId) {
    const { data, error } = await supabase
        .from("episodes")
        .select("*")
        .eq("series_id", seriesId)
        .eq("is_active", true)
        .order("season_number", { ascending: true })
        .order("episode_number", { ascending: true });

    if (error) {
        console.error("Episode loading error:", error);
        return [];
    }

    return data || [];
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
            currentEpisodes.map(episode =>
                Number(episode.season_number) || 1
            )
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

function renderSeason(seasonNumber) {
    if (!el.episodesGrid) return;

    const selectedSeason = Number(seasonNumber);

    const episodes = currentEpisodes
        .filter(episode =>
            (Number(episode.season_number) || 1) === selectedSeason
        )
        .sort((a, b) =>
            (Number(a.episode_number) || 0) -
            (Number(b.episode_number) || 0)
        );

    if (!episodes.length) {
        el.episodesGrid.innerHTML = `
            <p class="episodes-empty">
                No episodes found in this season.
            </p>
        `;
        return;
    }

    el.episodesGrid.innerHTML = episodes.map(episode => {
        const episodeNumber =
            episode.episode_number ?? episode.episode ?? "—";

        const parts = parseParts(episode);

        const hasSingleWatch = Boolean(
            episode.video_url &&
            isSafeHttpUrl(episode.video_url)
        );

        const hasSingleDownload = Boolean(
            episode.download_url ||
            episode.download_link ||
            normalizeLinks(episode).length
        );

        const hasParts = parts.length > 0;

        const partButtons = parts.map((part, index) => `
            <button
                class="episode-part-select"
                type="button"
                data-action="select-episode-part"
                data-episode-id="${escapeHTML(episode.id)}"
                data-part-index="${index}"
            >
                ${escapeHTML(
                    part.title ||
                    `Part ${part.part_number ?? index + 1}`
                )}
            </button>
        `).join("");

        return `
            <article class="episode-card">

                <div class="episode-top">
                    <span class="episode-number">
                        S${escapeHTML(selectedSeason)}
                        E${escapeHTML(episodeNumber)}
                    </span>

                    <span class="episode-runtime">
                        ${
                            episode.runtime
                                ? `${escapeHTML(episode.runtime)} min`
                                : ""
                        }
                    </span>
                </div>

                <h3>
                    ${escapeHTML(
                        episode.title || `Episode ${episodeNumber}`
                    )}
                </h3>

                <p class="episode-description">
                    ${escapeHTML(
                        episode.description ||
                        episode.overview ||
                        ""
                    )}
                </p>

                ${
                    hasParts
                        ? `
                            <div class="episode-parts">
                                <span class="episode-parts-label">
                                    Select episode part
                                </span>
                                <div class="episode-parts-list">
                                    ${partButtons}
                                </div>
                            </div>
                        `
                        : ""
                }

                <div class="episode-actions">

                    <button
                        class="episode-watch-btn"
                        type="button"
                        data-action="play-episode"
                        data-id="${escapeHTML(episode.id)}"
                        ${hasParts || hasSingleWatch ? "" : "disabled"}
                    >
                        <i class="fa-solid fa-play"></i>
                        <span>Watch</span>
                    </button>

                    <button
                        class="episode-download-btn"
                        type="button"
                        data-action="download-episode"
                        data-id="${escapeHTML(episode.id)}"
                        ${hasParts || hasSingleDownload ? "" : "disabled"}
                    >
                        <i class="fa-solid fa-download"></i>
                        <span>Download</span>
                    </button>

                </div>

            </article>
        `;
    }).join("");

    el.episodesGrid.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", () => {
            const episode = currentEpisodes.find(
                item => String(item.id) === button.dataset.id ||
                    String(item.id) === button.dataset.episodeId
            );

            if (!episode) return;

            const parts = parseParts(episode);

            if (button.dataset.action === "select-episode-part") {
                const part = parts[
                    Number(button.dataset.partIndex)
                ];

                if (!part) return;

                setSelectedMedia(part);

                el.episodesGrid
                    .querySelectorAll(".episode-part-select")
                    .forEach(button => {
                        button.classList.remove("active");
                    });

                button.classList.add("active");

                return;
            }

            if (button.dataset.action === "play-episode") {
                if (parts.length) {
                    const firstPart = parts[0];

                    setSelectedMedia(firstPart, true);
                    return;
                }

                if (!episode.video_url) {
                    alert("No watch link is available for this episode.");
                    return;
                }

                setSelectedMedia(episode, true);
                return;
            }

            if (button.dataset.action === "download-episode") {
                if (parts.length) {
                    const firstPart = parts[0];

                    const url = getMediaDownloadUrl(firstPart);

                    if (url) {
                        setSelectedMedia(firstPart);
                        openDownload(url);
                    } else {
                        alert("No download link is available for this part.");
                    }

                    return;
                }

                const url = getMediaDownloadUrl(episode);

                if (url) {
                    setSelectedMedia(episode);
                    openDownload(url);
                } else {
                    alert("No download link is available for this episode.");
                }
            }
        });
    });
}

/* =====================================================
   FETCH MOVIE PARTS
===================================================== */

function parseParts(record) {
    if (!record || !record.parts) {
        return [];
    }

    let parts = record.parts;

    // Parse JSON strings if necessary
    if (typeof parts === "string") {
        try {
            parts = JSON.parse(parts);
        } catch (error) {
            console.error("Invalid parts JSON:", error);
            return [];
        }
    }

    // Support arrays and objects containing arrays
    if (!Array.isArray(parts)) {
        if (Array.isArray(parts.parts)) {
            parts = parts.parts;
        } else if (Array.isArray(parts.items)) {
            parts = parts.items;
        } else if (typeof parts === "object") {
            parts = Object.values(parts).filter(
                value => value && typeof value === "object"
            );
        } else {
            return [];
        }
    }

    return parts
        .filter(part => part && typeof part === "object")
        .slice(0, 5)
        .map((part, index) => {

            // WATCH URL: never use a download URL here
            const watchCandidates = [
                part.video_url,
                part.watch_url,
                part.watch_link,
                part.video_link,
                part.stream_url,
                part.videoUrl,
                part.watchUrl,
                part.playback_url
            ];

            const watchUrl = watchCandidates.find(value =>
                typeof value === "string" &&
                isSafeHttpUrl(value.trim())
            ) || "";

            // DOWNLOAD URL: independently identify download fields
            const downloadCandidates = [
                part.download_url,
                part.download_link,
                part.downloadUrl,
                part.downloadLink,
                part.download
            ];

            let downloadUrl = downloadCandidates.find(value =>
                typeof value === "string" &&
                isSafeHttpUrl(value.trim())
            ) || "";

            if (!downloadUrl) {
                downloadUrl = getMediaDownloadUrl(part);
            }

            return {
                ...part,

                part_number:
                    Number(part.part_number ?? part.partNumber) ||
                    index + 1,

                title:
                    String(
                        part.title ||
                        part.part_title ||
                        part.name ||
                        `Part ${index + 1}`
                    ).trim(),

                video_url: watchUrl.trim(),

                download_url: downloadUrl
                    ? downloadUrl.trim()
                    : ""
            };
        });
}
async function fetchParts(item) {
    const storedParts = parseParts(item);

    if (storedParts.length) {
        return storedParts;
    }

    const { data, error } = await supabase
        .from("content_parts")
        .select("*")
        .eq("content_id", String(item.id))
        .eq("content_type", "movie")
        .eq("is_active", true)
        .order("part_number", { ascending: true });

    if (error) {
        console.warn(
            "Optional movie parts table unavailable:",
            error.message
        );

        return [];
    }

    return parseParts({
        parts: data || []
    });
}
/* =====================================================
   RENDER GROUPED MOVIE PARTS
===================================================== */

function renderParts(parts) {
    if (!el.partsContainer) return;

    currentParts = Array.isArray(parts) ? parts : [];

    console.log("CINEVA GROUPED PARTS DATA:", currentParts);
    console.log(
        "CINEVA PART DETAILS:",
        JSON.stringify(currentParts, null, 2)
    );

    if (contentType !== "movie" || !currentParts.length) {
        el.partsContainer.hidden = true;
        el.partsContainer.style.display = "none";

        const mainActionBar = document.getElementById("main-watch-btn")
            ?.parentElement?.parentElement;

        if (mainActionBar) {
            mainActionBar.classList.remove("has-parts");
            mainActionBar.style.display = "";
        }

        return;
    }

    el.partsContainer.hidden = false;
    el.partsContainer.style.display = "";

    const mainWatchButton = document.getElementById("main-watch-btn");
    const mainDownloadButton = document.getElementById("main-download-btn");

    if (mainWatchButton && mainDownloadButton) {
        let actionBar = mainWatchButton.parentElement;

        while (
            actionBar &&
            !actionBar.contains(mainDownloadButton)
        ) {
            actionBar = actionBar.parentElement;
        }

        if (actionBar) {
            actionBar.classList.add("has-parts");
            actionBar.style.display = "none";
        }
    }

    if (!el.partsGrid) return;

    el.partsGrid.innerHTML = currentParts.map((part, index) => {
        const partNumber = part.part_number ?? index + 1;
        const label = part.title || `Part ${partNumber}`;

        const hasWatch = Boolean(part.video_url && isSafeHttpUrl(part.video_url));
        const hasDownload = Boolean(getMediaDownloadUrl(part));

        return `
            <article class="movie-part-card">
                <div class="episode-top">
                    <span>PART ${escapeHTML(partNumber)}</span>
                </div>

                <h3>${escapeHTML(label)}</h3>

                <p>${escapeHTML(part.description || "")}</p>

                <div class="episode-actions">
                    <button
                        class="part-watch-btn"
                        type="button"
                        data-action="select-part"
                        data-index="${index}"
                        ${hasWatch ? "" : "disabled"}
                    >
                        <i class="fa-solid fa-play"></i>
                        Watch
                    </button>

                    <button
                        class="part-download-btn"
                        type="button"
                        data-action="download-part"
                        data-index="${index}"
                        ${hasDownload ? "" : "disabled"}
                    >
                        <i class="fa-solid fa-download"></i>
                        Download
                    </button>
                </div>
            </article>
        `;
    }).join("");

    el.partsGrid.querySelectorAll("button[data-index]").forEach(button => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.index);
            const part = currentParts[index];

            if (!part) {
                alert("This part could not be found.");
                return;
            }

            if (button.dataset.action === "select-part") {
                const videoUrl = part.video_url;

                if (!videoUrl || !isSafeHttpUrl(videoUrl)) {
                    alert("No valid watch link has been added for this part.");
                    return;
                }

                setSelectedMedia(part, true);
                return;
            }

            if (button.dataset.action === "download-part") {
                console.log("SELECTED PART:", part);
                console.log("DOWNLOAD FIELDS:", {
                    download_url: part.download_url,
                    download_link: part.download_link,
                    download_links: part.download_links,
                    all_fields: Object.keys(part)
                });

                const downloadUrl =
                    part.download_url ||
                    part.download_link ||
                    part.download_links?.[0]?.url ||
                    part.download_links?.[0]?.link ||
                    normalizeLinks(part)[0]?.url ||
                    "";

                if (!downloadUrl || !isSafeHttpUrl(downloadUrl)) {
                    alert("No valid download link has been added for this part.");
                    return;
                }

                setSelectedMedia(part);
                openDownload(downloadUrl);
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

    if (el.commentsCount) {
        el.commentsCount.textContent = comments.length;
    }

    if (!comments.length) {
        el.commentsList.innerHTML = `
            <p class="comments-empty">
                No comments yet. Be the first to comment!
            </p>
        `;
        return;
    }

    el.commentsList.innerHTML = comments.map(comment => {
        const name = escapeHTML(comment.display_name || "Guest");

        const date = comment.created_at
            ? new Date(comment.created_at).toLocaleDateString()
            : "";

        return `
            <article class="comment-item">
                <div class="comment-avatar">
                    ${escapeHTML(name.charAt(0).toUpperCase())}
                </div>

                <div class="comment-content">
                    <div class="comment-user-row">
                        <strong>${name}</strong>
                        <span>${escapeHTML(date)}</span>
                    </div>

                    <p class="comment-text">
                        ${escapeHTML(comment.comment)}
                    </p>
                </div>
            </article>
        `;
    }).join("");
}

function setupCommentForm(item) {
    if (!el.commentForm) return;

    if (el.characterCount && el.commentMessage) {
        el.commentMessage.addEventListener("input", () => {
            el.characterCount.textContent =
                el.commentMessage.value.length;
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
            el.commentButton.textContent = "Submitting...";
        }

        const { error } = await supabase
            .from("comments")
            .insert({
                content_id: String(item.id),
                content_type: contentType,
                display_name: name,
                comment: message,
                is_approved: false
            });

        if (error) {
            console.error("Comment submission error:", error);
            setCommentFeedback(
                "Unable to submit your comment. Please try again."
            );
        } else {
            el.commentForm.reset();

            if (el.characterCount) {
                el.characterCount.textContent = "0";
            }

            setCommentFeedback(
                "Your comment was submitted and is awaiting approval."
            );
        }

        if (el.commentButton) {
            el.commentButton.disabled = false;
            el.commentButton.textContent = "Post Comment";
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

        return `
            <a
                href="watch.html?id=${encodeURIComponent(item.id)}&type=${contentType}"
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

        displayContent(item);

        showContent();

        setupMainActions(item);
        setupLikes(item);
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
} else if (contentType === "movie" && item.video_url) {
    playVideo(item.video_url);
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
