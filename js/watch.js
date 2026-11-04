
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

function normalizeLinks(item) {
    const links = [];

    if (item.download_url) {
        links.push({
            title: "Download",
            url: item.download_url
        });
    }

    const extra = item.download_links;

    if (Array.isArray(extra)) {
        extra.forEach((link, index) => {
            if (typeof link === "string" && link.trim()) {
                links.push({
                    title: `Download ${index + 1}`,
                    url: link
                });
            } else if (link && typeof link === "object") {
                const url = link.url || link.href || link.download_url;

                if (url) {
                    links.push({
                        title: link.title || link.name ||
                            `Download ${index + 1}`,
                        url
                    });
                }
            }
        });
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
   RENDER SERIES EPISODES
===================================================== */

function renderEpisodes(episodes) {
    if (!el.episodesContainer) return;

    if (contentType !== "series") {
        el.episodesContainer.hidden = true;
        return;
    }

    el.episodesContainer.hidden = false;

    if (el.episodeCount) {
        el.episodeCount.textContent = `${episodes.length} Episodes`;
    }

    if (!episodes.length) {
        if (el.episodesGrid) {
            el.episodesGrid.innerHTML = `
                <p class="episodes-empty">
                    No episodes have been added yet.
                </p>
            `;
        }
        return;
    }

    const seasons = [...new Set(
        episodes.map(episode => Number(episode.season_number) || 1)
    )];

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

    currentEpisodes = episodes;

    renderSeason(seasons[0]);
}

function renderSeason(seasonNumber) {
    if (!el.episodesGrid) return;

    const episodes = currentEpisodes.filter(
        episode => Number(episode.season_number || 1) === seasonNumber
    );

    el.episodesGrid.innerHTML = episodes.map(episode => `
        <article class="episode-card">
            <div class="episode-top">
                <span>
                    S${escapeHTML(episode.season_number || 1)}
                    E${escapeHTML(episode.episode_number)}
                </span>
                <span>${episode.runtime ? `${escapeHTML(episode.runtime)} min` : ""}</span>
            </div>

            <h3>${escapeHTML(episode.title || "Untitled Episode")}</h3>

            <p class="episode-description">
                ${escapeHTML(episode.description || "")}
            </p>

            <div class="episode-actions">
                <button
                    class="episode-watch-btn"
                    type="button"
                    data-action="play"
                    data-id="${episode.id}"
                >
                    ▶ Watch
                </button>

                <button
                    class="episode-download-btn"
                    type="button"
                    data-action="download"
                    data-id="${episode.id}"
                >
                    ↓ Download
                </button>
            </div>
        </article>
    `).join("");

    el.episodesGrid.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", () => {
            const episode = episodes.find(
                item => String(item.id) === button.dataset.id
            );

            if (!episode) return;

            if (button.dataset.action === "play") {
                playVideo(episode.video_url, true);

                document.querySelector(".video-player-wrapper")
                    ?.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });
            }

            if (button.dataset.action === "download") {
                const links = normalizeLinks(episode);

                if (links.length) {
                    openDownload(links[0].url);
                } else {
                    alert("No download link for this episode.");
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
   FOOTER AND BACK TO TOP
===================================================== */

function setupPageExtras() {
    if (el.footerYear) {
        el.footerYear.textContent = new Date().getFullYear();
    }

    if (el.backToTop) {
        window.addEventListener("scroll", () => {
            el.backToTop.classList.toggle(
                "visible",
                window.scrollY > 500
            );
        });

        el.backToTop.addEventListener("click", () => {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
    }
}

/* =====================================================
   INITIALIZE WATCH PAGE
===================================================== */

async function initializeWatchPage() {
    setupPageExtras();

    if (!contentId) {
        showError("No content selected. Please select a movie or series.");
        return;
    }

    showLoading(true);

    try {
        const item = await fetchContent();

        if (!item) {
            showError("Content not found or unavailable.");
            return;
        }

        currentContent = item;

        displayContent(item);
        showContent();

        setupMainWatchButton(item);
        setupMainDownloadButton(item);
        setupLikes(item);
        setupShare(item);
        setupCommentForm(item);

        // Initial player source.
        if (item.video_url) {
            playVideo(item.video_url);
        } else {
            showPlayerMessage(
                "Ready to watch",
                "Select an available episode or part to begin."
            );
        }

        // Load supporting content.
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
        renderComments(comments);
        renderRelated(related);

    } catch (error) {
        console.error("CINEVA watch initialization error:", error);

        showError(
            error.message ||
            "Unable to load this content. Please try again."
        );
    }
}

/* =====================================================
   START APPLICATION
===================================================== */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeWatchPage
    );
} else {
    initializeWatchPage();
}

console.log("CINEVA Watch System Initialized.");
