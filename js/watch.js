
/* =========================================
   CINEVA — WATCH PAGE CONTROLLER
========================================= */

import { supabase, APP_CONFIG } from "./config.js";

/* =========================================
   PAGE ELEMENTS
========================================= */

const elements = {
    player: document.querySelector("#video-player"),
    title: document.querySelector("#watch-title"),
    description: document.querySelector("#watch-description"),
    poster: document.querySelector("#watch-poster"),
    category: document.querySelector("#watch-category"),
    year: document.querySelector("#watch-year"),
    rating: document.querySelector("#watch-rating"),
    type: document.querySelector("#watch-type"),
    related: document.querySelector("#related-content"),
    loading: document.querySelector("#watch-loading"),
    error: document.querySelector("#watch-error"),
    episodes: document.querySelector("#episodes-container")
};

/* =========================================
   URL PARAMETERS
========================================= */

const params = new URLSearchParams(window.location.search);

const contentId = params.get("id");
const contentType = params.get("type") === "series" ? "series" : "movie";

/* =========================================
   SAFE HTML
========================================= */

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

/* =========================================
   FETCH CONTENT
========================================= */

async function getContentById(id, type) {
    const table = type === "series"
        ? APP_CONFIG.seriesTable
        : APP_CONFIG.moviesTable;

    const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("id", id)
        .single();

    if (error) {
        console.error("Content loading error:", error.message);
        return null;
    }

    return data;
}

/* =========================================
   DISPLAY ERROR
========================================= */

function showError(message) {
    if (elements.loading) {
        elements.loading.hidden = true;
    }

    if (elements.error) {
        elements.error.hidden = false;
        elements.error.textContent = message;
    }
}

/* =========================================
   DISPLAY CONTENT INFORMATION
========================================= */

function displayContent(item) {
    if (elements.loading) {
        elements.loading.hidden = true;
    }

    document.title = `${item.title || "Watch"} | CINEVA`;

    if (elements.title) {
        elements.title.textContent = item.title || "Untitled";
    }

    if (elements.description) {
        elements.description.textContent =
            item.description || "No description available.";
    }

    if (elements.poster) {
        elements.poster.src =
            item.poster_url || "assets/images/movie-placeholder.jpg";

        elements.poster.alt = item.title || "Content poster";

        elements.poster.onerror = () => {
            elements.poster.src = "assets/images/movie-placeholder.jpg";
        };
    }

    if (elements.category) {
        elements.category.textContent = item.category || "Uncategorized";
    }

    if (elements.year) {
        elements.year.textContent = item.release_year || "";
    }

    if (elements.rating) {
        elements.rating.textContent = item.rating
            ? `★ ${item.rating}`
            : "";
    }

    if (elements.type) {
        elements.type.textContent =
            contentType === "series" ? "TV Series" : "Movie";
    }
}

/* =========================================
   VIDEO PLAYER
========================================= */

function playContent(item) {
    if (!elements.player) return;

    const videoUrl = item.video_url || item.stream_url;

    if (!videoUrl) {
        elements.player.innerHTML = `
            <div class="player-message">
                <h3>Video unavailable</h3>
                <p>This content does not have a video source yet.</p>
            </div>
        `;
        return;
    }

    const safeVideoUrl = escapeHTML(videoUrl);

    // HLS streams require hls.js when the browser does not
    // support HLS natively.
    const isHLS = /\.m3u8($|\?)/i.test(videoUrl);

    if (isHLS && !elements.player.canPlayType("application/vnd.apple.mpegurl")) {
        const script = document.createElement("script");

        script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
        script.onload = () => {
            if (window.Hls && window.Hls.isSupported()) {
                const hls = new window.Hls();

                hls.loadSource(videoUrl);
                hls.attachMedia(elements.player);

                hls.on(window.Hls.Events.ERROR, (_, data) => {
                    console.error("HLS playback error:", data);
                });
            } else {
                showPlayerError();
            }
        };

        script.onerror = showPlayerError;

        document.head.appendChild(script);
    } else {
        elements.player.src = safeVideoUrl;
    }

    elements.player.controls = true;
    elements.player.playsInline = true;
    elements.player.preload = "metadata";
}

function showPlayerError() {
    if (!elements.player) return;

    elements.player.insertAdjacentHTML(
        "afterend",
        `<p class="player-error">Unable to load this video. Please check its source.</p>`
    );
}

/* =========================================
   FETCH RELATED CONTENT
========================================= */

async function getRelatedContent(category, currentId, type) {
    const table = type === "series"
        ? APP_CONFIG.seriesTable
        : APP_CONFIG.moviesTable;

    const { data, error } = await supabase
        .from(table)
        .select("*")
        .ilike("category", category || "")
        .neq("id", currentId)
        .limit(8);

    if (error) {
        console.error("Related content error:", error.message);
        return [];
    }

    return data || [];
}

/* =========================================
   RENDER RELATED CONTENT
========================================= */

function renderRelatedContent(items) {
    if (!elements.related) return;

    if (!items.length) {
        elements.related.innerHTML = `
            <p class="related-empty">No related content available.</p>
        `;
        return;
    }

    elements.related.innerHTML = items.map(item => {
        const title = escapeHTML(item.title || "Untitled");

        const poster = escapeHTML(
            item.poster_url || "assets/images/movie-placeholder.jpg"
        );

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
                    <div class="movie-overlay">
                        <span class="play-icon">▶</span>
                    </div>
                </div>

                <div class="movie-info">
                    <h3>${title}</h3>
                </div>
            </a>
        `;
    }).join("");
}

/* =========================================
   SERIES EPISODES
========================================= */

/*
Expected series table fields:
episodes = JSON array containing objects such as:

[
    {
        "season": 1,
        "episode": 1,
        "title": "Episode 1",
        "video_url": "https://example.com/video.mp4"
    }
]
*/

function renderEpisodes(item) {
    if (!elements.episodes) return;

    if (contentType !== "series") {
        elements.episodes.hidden = true;
        return;
    }

    const episodes = Array.isArray(item.episodes)
        ? item.episodes
        : [];

    if (!episodes.length) {
        elements.episodes.innerHTML = `
            <p>No episodes available yet.</p>
        `;
        return;
    }

    elements.episodes.hidden = false;

    elements.episodes.innerHTML = `
        <h2>Episodes</h2>

        <div class="episode-list">
            ${episodes.map((episode, index) => `
                <button
                    class="episode-item"
                    type="button"
                    data-episode-index="${index}"
                >
                    <span>
                        S${escapeHTML(episode.season || 1)}
                        E${escapeHTML(episode.episode || index + 1)}
                    </span>

                    <strong>${escapeHTML(episode.title || `Episode ${index + 1}`)}</strong>

                    <span>▶</span>
                </button>
            `).join("")}
        </div>
    `;

    elements.episodes.querySelectorAll(".episode-item")
        .forEach(button => {
            button.addEventListener("click", () => {
                const index = Number(button.dataset.episodeIndex);
                const episode = episodes[index];

                if (!episode?.video_url || !elements.player) return;

                elements.player.src = episode.video_url;
                elements.player.load();

                elements.player.play().catch(() => {
                    console.log("Press play to start this episode.");
                });

                document.querySelectorAll(".episode-item")
                    .forEach(item => item.classList.remove("active"));

                button.classList.add("active");
            });
        });
}

/* =========================================
   LOAD WATCH PAGE
========================================= */

async function initializeWatchPage() {
    if (!contentId) {
        showError("No content selected. Please choose a movie or series.");
        return;
    }

    if (elements.loading) {
        elements.loading.hidden = false;
    }

    try {
        const content = await getContentById(contentId, contentType);

        if (!content) {
            showError("Content not found or unavailable.");
            return;
        }

        displayContent(content);
        playContent(content);
        renderEpisodes(content);

        const related = await getRelatedContent(
            content.category,
            content.id,
            contentType
        );

        renderRelatedContent(related);

    } catch (error) {
        console.error("Watch page error:", error);
        showError("Unable to load this content. Please try again.");
    }
}

/* =========================================
   START
========================================= */

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeWatchPage);
} else {
    initializeWatchPage();
}

console.log("CINEVA watch system loaded.");
