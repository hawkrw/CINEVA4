
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

function getPoster(item) {
    return (
        item.poster ||
        item.poster_path ||
        item.image ||
        item.thumbnail ||
        PLACEHOLDER
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
   Supports Supabase URLs, JSON, arrays and objects.
===================================================== */

function normalizeLinks(item = {}) {

    const links = [];

    /* ---------------------------------------------
       ADD AND VALIDATE DOWNLOAD URL
    --------------------------------------------- */

    const addLink = (value, title = "Download") => {

        if (typeof value !== "string") return;

        const url = value.trim();

        if (!url || !isSafeHttpUrl(url)) return;

        // Prevent duplicate download URLs.
        if (links.some(link => link.url === url)) return;

        links.push({
            title: title || "Download",
            url
        });
    };

/* =====================================================
   CINEVA — GROUPED PARTS SUPPORT
===================================================== */

function parseParts(record = {}) {
    let parts = record.parts ?? [];

    if (typeof parts === "string") {
        try {
            parts = JSON.parse(parts);
        } catch {
            parts = [];
        }
    }

    if (!Array.isArray(parts)) return [];

    return parts
        .filter(part => part && typeof part === "object")
        .map((part, index) => ({
            ...part,
            part_number: part.part_number ?? index + 1,
            title: part.title || `Part ${part.part_number ?? index + 1}`
        }))
        .sort((a, b) =>
            Number(a.part_number) - Number(b.part_number)
        );
}

/*
 * Uses a selected part or a normal movie/episode record.
 * The supplied watch and download URLs remain independent.
 */
function setSelectedMedia(media, autoplay = false) {
    selectedMedia = media;

    const videoUrl = media?.video_url || "";

    const downloadLinks = normalizeLinks(media || {});
    const downloadUrl = media?.download_url ||
        media?.download_link ||
        downloadLinks[0]?.url ||
        "";

    if (el.mainWatch) {
        el.mainWatch.disabled = !(
            videoUrl && isSafeHttpUrl(videoUrl)
        );

        el.mainWatch.onclick = () => {
            if (!videoUrl || !isSafeHttpUrl(videoUrl)) {
                showPlayerMessage(
                    "Video unavailable",
                    "No valid watch link is available for this selection."
                );
                return;
            }

            playVideo(videoUrl, true);

            document.querySelector(".video-player-wrapper")
                ?.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
        };
    }

    if (el.mainDownload) {
        el.mainDownload.disabled = !(
            downloadUrl && isSafeHttpUrl(downloadUrl)
        );

        el.mainDownload.onclick = () => {
            if (!downloadUrl || !isSafeHttpUrl(downloadUrl)) {
                alert("No download link is available for this selection.");
                return;
            }

            openDownload(downloadUrl);
        };
    }

    if (autoplay && videoUrl && isSafeHttpUrl(videoUrl)) {
        playVideo(videoUrl, true);
    }
}
    /* ---------------------------------------------
       EXTRACT LINKS FROM DIFFERENT FORMATS
    --------------------------------------------- */

    function extractLinks(value, label = "Download") {

        if (value === null || value === undefined) return;


        // FORMAT 1: STRING OR JSON STRING
        if (typeof value === "string") {

            const trimmed = value.trim();

            if (!trimmed) return;

            // Detect JSON stored as text.
            if (
                (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
                (trimmed.startsWith("{") && trimmed.endsWith("}"))
            ) {

                try {

                    const parsed = JSON.parse(trimmed);

                    extractLinks(parsed, label);

                    return;

                } catch (error) {

                    // Continue and try treating it as a URL.
                }
            }

            addLink(trimmed, label);

            return;
        }


        // FORMAT 2: ARRAY OF DOWNLOAD LINKS
        if (Array.isArray(value)) {

            value.forEach((entry, index) => {

                extractLinks(
                    entry,
                    `${label} ${index + 1}`
                );

            });

            return;
        }


        // FORMAT 3: OBJECT WITH DOWNLOAD URL
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


            // FORMAT 4: QUALITY-BASED OBJECT
            // Example:
            // {
            //   "480p": "https://example.com/480.mp4",
            //   "720p": "https://example.com/720.mp4"
            // }

            Object.entries(value).forEach(([key, entry]) => {

                extractLinks(entry, key);

            });
        }
    }


    /* ---------------------------------------------
       DIRECT SUPABASE DOWNLOAD COLUMNS
    --------------------------------------------- */

    [
        "download_url",
        "download_link",
        "download",
        "file_url",
        "direct_link",
        "link"
    ].forEach(field => {

        extractLinks(item[field], field);

    });


    /* ---------------------------------------------
       SUPABASE JSON DOWNLOAD COLUMNS
    --------------------------------------------- */

    [
        "download_links",
        "download_options",
        "downloads"
    ].forEach(field => {

        extractLinks(item[field], field);

    });


    /* ---------------------------------------------
       RETURN UNIQUE DOWNLOAD LINKS
    --------------------------------------------- */

    return links.filter((link, index, array) =>

        array.findIndex(
            item => item.url === link.url
        ) === index

    );
}


/* =====================================================
   VALIDATE HTTP / HTTPS URL
===================================================== */

function isSafeHttpUrl(value) {

    try {

        const url = new URL(
            value,
            window.location.href
        );

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
   Supports Movies, Episodes and Multiple Parts
===================================================== */

/* =====================================================
   OPEN DOWNLOAD LINK
===================================================== */

function openDownload(url) {
    if (!url || !isSafeHttpUrl(url)) {
        alert("This download link is unavailable.");
        return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
}


/* =====================================================
   SCROLL TO VIDEO PLAYER
===================================================== */

function scrollToPlayer() {
    document.querySelector(".video-player-wrapper")
        ?.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
}


/* =====================================================
   GET MEDIA DOWNLOAD URL
   Supports direct and JSON download fields
===================================================== */

function getMediaDownloadUrl(item = {}) {
    // Prefer the explicitly supplied download URL.
    const directUrl =
        item.download_url ||
        item.download_link ||
        "";

    if (directUrl && isSafeHttpUrl(directUrl)) {
        return directUrl.trim();
    }

    // Fall back to existing supported download formats.
    const links = normalizeLinks(item);

    return links.length ? links[0].url : "";
}

/* =====================================================
   UPDATE MAIN WATCH AND DOWNLOAD BUTTONS
===================================================== */

function setSelectedMedia(media, autoplay = false) {
    if (!media) return;

    selectedMedia = media;

    const videoUrl = media.video_url || "";
    const downloadUrl = getMediaDownloadUrl(media);

    /* ---------------------------------------------
       MAIN WATCH BUTTON
    --------------------------------------------- */

    if (el.mainWatch) {
        el.mainWatch.disabled = !(
            videoUrl && isSafeHttpUrl(videoUrl)
        );

        el.mainWatch.onclick = () => {
            if (!videoUrl || !isSafeHttpUrl(videoUrl)) {
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


    /* ---------------------------------------------
       MAIN DOWNLOAD BUTTON
    --------------------------------------------- */

    if (el.mainDownload) {
        el.mainDownload.disabled = !(
            downloadUrl && isSafeHttpUrl(downloadUrl)
        );

        el.mainDownload.onclick = () => {
            if (!downloadUrl || !isSafeHttpUrl(downloadUrl)) {
                alert(
                    "No download link is available for this selection."
                );

                return;
            }

            openDownload(downloadUrl);
        };
    }


    /* ---------------------------------------------
       OPTIONAL AUTOPLAY
    --------------------------------------------- */

    if (
        autoplay &&
        videoUrl &&
        isSafeHttpUrl(videoUrl)
    ) {
        playVideo(videoUrl, true);

        scrollToPlayer();
    }
}


/* =====================================================
   INITIALIZE MAIN BUTTONS
   Supports normal single-link content
===================================================== */

function setupMainActions(item) {
    setSelectedMedia(item);
}


/* =====================================================
   BACKWARD-COMPATIBLE MAIN WATCH BUTTON
===================================================== */

function setupMainWatchButton(item) {
    if (!el.mainWatch) return;

    setSelectedMedia(item);
}


/* =====================================================
   BACKWARD-COMPATIBLE MAIN DOWNLOAD BUTTON
===================================================== */

function setupMainDownloadButton(item) {
    if (!el.mainDownload) return;

    setSelectedMedia(item);
}


/* =====================================================
   PLAY SELECTED MOVIE PART
===================================================== */

function watchSelectedPart(part) {
    if (!part || !part.video_url) {
        showPlayerMessage(
            "Video unavailable",
            "This part does not have a valid watch link."
        );

        return;
    }

    setSelectedMedia(part, true);
}


/* =====================================================
   DOWNLOAD SELECTED MOVIE PART
===================================================== */

function downloadSelectedPart(part) {
    if (!part) {
        alert("Part not found.");
        return;
    }

    const downloadUrl = getMediaDownloadUrl(part);

    if (!downloadUrl) {
        alert("No download link is available for this part.");
        return;
    }

    setSelectedMedia(part);

    openDownload(downloadUrl);
}


/* =====================================================
   PLAY SELECTED EPISODE
===================================================== */

function watchSelectedEpisode(episode) {
    if (!episode) return;

    const parts = parseParts(episode);

    // If the episode contains parts, play its first part.
    if (parts.length) {
        watchSelectedPart(parts[0]);
        return;
    }

    // Otherwise play the normal episode video.
    if (!episode.video_url) {
        showPlayerMessage(
            "Episode unavailable",
            "No watch link has been added for this episode."
        );

        return;
    }

    setSelectedMedia(episode, true);
}


/* =====================================================
   DOWNLOAD SELECTED EPISODE
===================================================== */

function downloadSelectedEpisode(episode) {
    if (!episode) {
        alert("Episode not found.");
        return;
    }

    const parts = parseParts(episode);

    // If the episode contains parts, download its first part.
    if (parts.length) {
        downloadSelectedPart(parts[0]);
        return;
    }

    const downloadUrl = getMediaDownloadUrl(episode);

    if (!downloadUrl) {
        alert("No download link is available for this episode.");
        return;
    }

    setSelectedMedia(episode);

    openDownload(downloadUrl);
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

    // Get actual season numbers from Supabase
    const seasons = [
        ...new Set(
            currentEpisodes.map(episode =>
                Number(episode.season_number) || 1
            )
        )
    ].sort((a, b) => a - b);

    // Build season selector
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

    // Display first available season
    renderSeason(seasons[0]);
}


/* =====================================================
   EXTRACT EPISODE DOWNLOAD LINKS
   Supports Supabase JSON, arrays and direct URLs
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

        // Direct URL
        if (typeof value === "string") {
            const trimmed = value.trim();

            // Try parsing JSON stored as text
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

        // Array of download links
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                readValue(item, `Download ${index + 1}`);
            });
            return;
        }

        // Object containing URL fields or quality options
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

            // Support objects such as:
            // { "480p": "https://...", "720p": "https://..." }
            if (!urlFields.some(field => value[field])) {
                Object.entries(value).forEach(([key, item]) => {
                    readValue(item, key);
                });
            }
        }
    };

    // Check possible Supabase download columns
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

    // Check JSON download columns
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

    /* ---------------------------------------------
       EPISODE BUTTON ACTIONS
    --------------------------------------------- */

    el.episodesGrid.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", () => {
            const episode = currentEpisodes.find(
                item => String(item.id) === button.dataset.id ||
                    String(item.id) === button.dataset.episodeId
            );

            if (!episode) return;

            const parts = parseParts(episode);

            /* Select a specific episode part */

            if (button.dataset.action === "select-episode-part") {
                const part = parts[
                    Number(button.dataset.partIndex)
                ];

                if (!part) return;

                setSelectedMedia(part);

                // Highlight the selected part.
                el.episodesGrid
                    .querySelectorAll(".episode-part-select")
                    .forEach(button => {
                        button.classList.remove("active");
                    });

                button.classList.add("active");

                return;
            }

            /* Watch selected episode */

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

            /* Download selected episode */

            if (button.dataset.action === "download-episode") {
                if (parts.length) {
                    const firstPart = parts[0];

                    const url = firstPart.download_url ||
                        firstPart.download_link ||
                        normalizeLinks(firstPart)[0]?.url;

                    if (url) {
                        setSelectedMedia(firstPart);
                        openDownload(url);
                    } else {
                        alert("No download link is available for this part.");
                    }

                    return;
                }

                const url = episode.download_url ||
                    episode.download_link ||
                    normalizeLinks(episode)[0]?.url;

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
/* =========================================
   CINEVA — GROUPED MEDIA PARTS
========================================= */

function parseParts(record) {
    if (!record || !record.parts) {
        return [];
    }

    let parts = record.parts;

    // Handle JSON stored as a string
    if (typeof parts === "string") {
        try {
            parts = JSON.parse(parts);
        } catch (error) {
            console.error("Invalid parts JSON:", error);
            return [];
        }
    }

    if (!Array.isArray(parts)) {
        return [];
    }

    return parts
        .filter(part => part && typeof part === "object")
        .map((part, index) => ({
            ...part,
            part_number: Number(part.part_number || index + 1),
            title: part.title || `Part ${index + 1}`,
            video_url: part.video_url || "",
            download_url: part.download_url || ""
        }));
}
async function fetchParts(item) {
    // Preferred format: JSONB parts stored on the movie.
    const storedParts = parseParts(item);

    if (storedParts.length) {
        return storedParts;
    }

    // Backward compatibility with an existing content_parts table.
    const { data, error } = await supabase
        .from("content_parts")
        .select("*")
        .eq("content_id", String(item.id))
        .eq("content_type", "movie")
        .eq("is_active", true)
        .order("part_number", { ascending: true });

    if (error) {
        // The table may not exist. This does not prevent normal playback.
        console.warn("Optional movie parts table unavailable:", error.message);
        return [];
    }

    return data || [];
}


/* =====================================================
   RENDER GROUPED MOVIE PARTS
===================================================== */

function renderParts(parts) {
    if (!el.partsContainer) return;

    currentParts = Array.isArray(parts) ? parts : [];
   console.log("CINEVA GROUPED PARTS DATA:", currentParts);

    // Hide parts section for non-movies or movies without parts.
    if (contentType !== "movie" || !currentParts.length) {
        el.partsContainer.hidden = true;
        el.partsContainer.style.display = "none";

        // Restore the main action bar.
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

    // Hide the main Watch / Download / Like / Share action bar.
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
                    >
                        <i class="fa-solid fa-play"></i>
                        Watch
                    </button>

                    <button
                        class="part-download-btn"
                        type="button"
                        data-action="download-part"
                        data-index="${index}"
                    >
                        <i class="fa-solid fa-download"></i>
                        Download
                    </button>
                </div>
            </article>
        `;
    }).join("");

    // Make each part button functional.
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
                const downloadUrl =
                    part.download_url ||
                    part.download_link ||
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
            // Read current value before updating.
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

    /* ---------------------------------------------
       FOOTER YEAR
    --------------------------------------------- */

    if (el.footerYear) {
        el.footerYear.textContent = new Date().getFullYear();
    }


    /* ---------------------------------------------
       BACK TO TOP
    --------------------------------------------- */

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


    /* ---------------------------------------------
       RELATED CONTENT HORIZONTAL SLIDER
    --------------------------------------------- */

    const relatedGrid = document.querySelector("#related-content");
    const relatedPrev = document.querySelector("#related-prev");
    const relatedNext = document.querySelector("#related-next");

    if (!relatedGrid) return;

    const SCROLL_AMOUNT = 320;

    /* Update arrow states */

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


    /* Previous cards */

    relatedPrev?.addEventListener("click", () => {

        relatedGrid.scrollBy({
            left: -SCROLL_AMOUNT,
            behavior: "smooth"
        });

    });


    /* Next cards */

    relatedNext?.addEventListener("click", () => {

        relatedGrid.scrollBy({
            left: SCROLL_AMOUNT,
            behavior: "smooth"
        });

    });


    /* Update arrows while scrolling */

    relatedGrid.addEventListener(
        "scroll",
        updateRelatedArrows,
        { passive: true }
    );


    /* Update arrows when browser resizes */

    window.addEventListener(
        "resize",
        updateRelatedArrows
    );


    /* Detect when related cards are added */

    const relatedObserver = new MutationObserver(() => {

        requestAnimationFrame(() => {
            updateRelatedArrows();
        });

    });

    relatedObserver.observe(relatedGrid, {
        childList: true,
        subtree: true
    });


    /* Recheck after images load */

    relatedGrid.addEventListener("load", event => {

        if (event.target.tagName === "IMG") {
            updateRelatedArrows();
        }

    }, true);


    /* Initial arrow state */

    updateRelatedArrows();
}


/* =====================================================
   CINEVA — INITIALIZE WATCH PAGE
===================================================== */

async function initializeWatchPage() {

    /* Initialize footer and page controls */

    setupPageExtras();


    /* Validate content ID */

    if (!contentId) {

        showError(
            "No content selected. Please select a movie or series."
        );

        return;
    }


    /* Display loading state */

    showLoading(true);


    try {

        /* ---------------------------------------------
           FETCH MAIN CONTENT
        --------------------------------------------- */

        const item = await fetchContent();

        if (!item) {

            showError(
                "Content not found or unavailable."
            );

            return;
        }


        /* ---------------------------------------------
           STORE CURRENT CONTENT
        --------------------------------------------- */

        currentContent = item;


        /* ---------------------------------------------
           DISPLAY CONTENT DETAILS
        --------------------------------------------- */

        displayContent(item);

        showContent();


        /* ---------------------------------------------
           INITIALIZE MAIN ACTIONS
        --------------------------------------------- */

        setupMainActions(item);

        setupLikes(item);

        setupShare(item);

        setupCommentForm(item);


        /* ---------------------------------------------
           INITIALIZE VIDEO PLAYER
        --------------------------------------------- */

      if (item.video_url) {
    playVideo(item.video_url);
} else {
    showPlayerMessage(
        "Ready to watch",
        "Select an available episode or part to begin."
    );
}


        /* ---------------------------------------------
           LOAD SUPPORTING CONTENT
        --------------------------------------------- */

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


        /* ---------------------------------------------
           RENDER EPISODES
        --------------------------------------------- */

        renderEpisodes(episodes);


        /* ---------------------------------------------
           RENDER MOVIE PARTS
        --------------------------------------------- */

        renderParts(parts);


        /* ---------------------------------------------
           RENDER COMMENTS
        --------------------------------------------- */

        renderComments(comments);


        /* ---------------------------------------------
           RENDER RELATED CONTENT
        --------------------------------------------- */

        renderRelated(related);


        /* ---------------------------------------------
           REFRESH RELATED SLIDER ARROWS
        --------------------------------------------- */

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
