
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
   SMART DOWNLOAD LINK DETECTION
   Supports different Supabase JSON formats.
===================================================== */

function normalizeLinks(item) {

    const links = [];

    const addLink = (value, title = "Download") => {

        if (typeof value !== "string") return;

        const url = value.trim();

        if (!url || !isSafeHttpUrl(url)) return;

        if (links.some(link => link.url === url)) return;

        links.push({
            title,
            url
        });
    };


    // Direct download columns.
    addLink(item.download_url, "Download");
    addLink(item.download_link, "Download");
    addLink(item.download, "Download");
    addLink(item.file_url, "Download");
    addLink(item.link, "Download");


    // Handle JSON arrays and objects.
    function extractLinks(value, label = "Download") {

        if (!value) return;

        // JSON may already be an array.
        if (Array.isArray(value)) {

            value.forEach((entry, index) => {

                if (typeof entry === "string") {

                    addLink(entry, `${label} ${index + 1}`);

                } else if (entry && typeof entry === "object") {

                    const name =
                        entry.title ||
                        entry.name ||
                        entry.quality ||
                        entry.label ||
                        `${label} ${index + 1}`;

                    const directUrl =
                        entry.url ||
                        entry.href ||
                        entry.download_url ||
                        entry.download_link ||
                        entry.downloadUrl ||
                        entry.file_url ||
                        entry.direct_link ||
                        entry.link;

                    if (directUrl) {
                        addLink(directUrl, name);
                    } else {
                        extractLinks(entry, name);
                    }

                }

            });

            return;
        }


        // JSON may be an object.
        if (typeof value === "object") {

            const directUrl =
                value.url ||
                value.href ||
                value.download_url ||
                value.download_link ||
                value.downloadUrl ||
                value.file_url ||
                value.direct_link ||
                value.link;

            if (directUrl) {
                addLink(
                    directUrl,
                    value.title || value.name || label
                );
                return;
            }

            // Support formats such as:
            // { "480p": "https://...", "720p": "https://..." }
            Object.entries(value).forEach(([key, entry]) => {

                if (typeof entry === "string") {

                    addLink(entry, key);

                } else if (entry && typeof entry === "object") {

                    extractLinks(entry, key);

                }

            });

        }

    }


    // Check all known download fields.
    extractLinks(item.download_links);

    extractLinks(item.download_options);

    extractLinks(item.downloads);


    return links;
}
    // Remove duplicate URLs.
    return links.filter((link, index, array) =>
        array.findIndex(item => item.url === link.url) === index
    );
}

function isSafeHttpUrl(value) {
    try {
        const url = new URL(value, window.location.href);

        return ["http:", "https:"].includes(url.protocol);
    } catch {
        return false;
    }
}

function showLoading(show) {
    if (el.loading) {
        el.loading.hidden = !show;
    }
}

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
   MAIN WATCH BUTTON
===================================================== */

function setupMainWatchButton(item) {
    const videoUrl = item.video_url;

    if (!el.mainWatch) return;

    el.mainWatch.disabled = !videoUrl;

    el.mainWatch.addEventListener("click", () => {
        if (!videoUrl) {
            showPlayerMessage(
                "Video unavailable",
                "No video URL has been added."
            );
            return;
        }

        playVideo(videoUrl, true);

        document.querySelector(".video-player-wrapper")
            ?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
    });
}

/* =====================================================
   DOWNLOAD BUTTONS
===================================================== */

function openDownload(url) {
    if (!url || !isSafeHttpUrl(url)) {
        alert("This download link is unavailable.");
        return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
}

function setupMainDownloadButton(item) {
    const links = normalizeLinks(item);

    if (!el.mainDownload) return;

    el.mainDownload.disabled = links.length === 0;

    el.mainDownload.addEventListener("click", () => {
        if (!links.length) {
            alert("No download links are available.");
            return;
        }

        openDownload(links[0].url);
    });
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
   RENDER SELECTED SEASON
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
        const season = Number(episode.season_number) || 1;

        // Use the real episode number stored in Supabase
        const episodeNumber = episode.episode_number ?? "—";

        const hasVideo =
            typeof episode.video_url === "string" &&
            episode.video_url.trim() !== "";

        const downloadLinks = getEpisodeDownloadLinks(episode);
        const hasDownload = downloadLinks.length > 0;

        return `
            <article class="episode-card">

                <div class="episode-top">
                    <span class="episode-number">
                        S${escapeHTML(season)}
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
                    ${escapeHTML(episode.description || "")}
                </p>

                <div class="episode-actions">

                    <button
                        class="episode-watch-btn"
                        type="button"
                        data-action="play"
                        data-id="${escapeHTML(episode.id)}"
                        ${hasVideo ? "" : "disabled"}
                        aria-label="Watch episode ${escapeHTML(episodeNumber)}"
                    >
                        <i class="fa-solid fa-play"></i>
                        <span>Watch</span>
                    </button>

                    <button
                        class="episode-download-btn"
                        type="button"
                        data-action="download"
                        data-id="${escapeHTML(episode.id)}"
                        ${hasDownload ? "" : "disabled"}
                        title="${hasDownload ? "Download episode" : "No download link available"}"
                        aria-label="Download episode ${escapeHTML(episodeNumber)}"
                    >
                        <i class="fa-solid fa-download"></i>
                    </button>

                </div>

            </article>
        `;
    }).join("");

    // Attach episode actions
    el.episodesGrid.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", () => {
            const episode = currentEpisodes.find(
                item => String(item.id) === button.dataset.id
            );

            if (!episode) return;

            // WATCH EPISODE
            if (button.dataset.action === "play") {
                if (!episode.video_url) {
                    alert("No video URL is available for this episode.");
                    return;
                }

                playVideo(episode.video_url, true);

                document.querySelector(".video-player-wrapper")
                    ?.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });
            }

            // DOWNLOAD EPISODE
            if (button.dataset.action === "download") {
                const links = getEpisodeDownloadLinks(episode);

                if (links.length > 0) {
                    openDownload(links[0].url);
                } else {
                    console.error(
                        "Episode download link not found. Supabase episode record:",
                        episode
                    );

                    alert(
                        "No valid download URL was found for this episode. Check the episode download column in Supabase."
                    );
                }
            }
        });
    });
}

/* =====================================================
   FETCH MOVIE PARTS
===================================================== */

async function fetchParts(item) {
    const { data, error } = await supabase
        .from("content_parts")
        .select("*")
        .eq("content_id", String(item.id))
        .eq("content_type", contentType)
        .eq("is_active", true)
        .order("part_number", { ascending: true });

    if (error) {
        console.error("Content parts error:", error);
        return [];
    }

    return data || [];
}

/* =====================================================
   RENDER MOVIE PARTS
===================================================== */

function renderParts(parts) {
    if (!el.partsContainer) return;

    if (contentType !== "movie" || !parts.length) {
        el.partsContainer.hidden = true;
        return;
    }

    el.partsContainer.hidden = false;
    currentParts = parts;

    if (!el.partsGrid) return;

    el.partsGrid.innerHTML = parts.map(part => `
        <article class="movie-part-card">
            <div class="episode-top">
                <span>PART ${escapeHTML(part.part_number)}</span>
            </div>

            <h3>${escapeHTML(part.title || `Part ${part.part_number}`)}</h3>

            <p>${escapeHTML(part.description || "")}</p>

            <div class="episode-actions">
                <button
                    class="part-watch-btn"
                    type="button"
                    data-action="play"
                    data-id="${part.id}"
                >
                    ▶ Watch
                </button>

                <button
                    class="part-download-btn"
                    type="button"
                    data-action="download"
                    data-id="${part.id}"
                >
                    ↓ Download
                </button>
            </div>
        </article>
    `).join("");

    el.partsGrid.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", () => {
            const part = parts.find(
                item => String(item.id) === button.dataset.id
            );

            if (!part) return;

            if (button.dataset.action === "play") {
                playVideo(part.video_url, true);

                document.querySelector(".video-player-wrapper")
                    ?.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });
            }

            if (button.dataset.action === "download") {
                const links = normalizeLinks(part);

                if (links.length) {
                    openDownload(links[0].url);
                } else {
                    alert("No download link for this part.");
                }
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

        setupMainWatchButton(item);

        setupMainDownloadButton(item);

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
