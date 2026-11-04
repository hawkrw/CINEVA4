
/* =========================================
   CINEVA — HOMEPAGE CONTROLLER
========================================= */

import {
    getFeaturedMovies,
    getLatestContent,
    getMoviesByCategory
} from "./supabase.js";

/* =========================================
   HOMEPAGE SETTINGS
========================================= */

const HOME_CONFIG = {
    latestLimit: 20,
    categoryLimit: 12
};

const CATEGORIES = [
    "Action",
    "Horror",
    "Drama",
    "Highschool",
    "Animation",
    "Comedy",
    "Erotic"
];

/* =========================================
   DOM ELEMENTS
========================================= */

const elements = {
    hero: document.querySelector("#hero-section"),
    latest: document.querySelector("#latest-movies"),
    categorySections: document.querySelector("#category-sections")
};

/* =========================================
   SAFE HTML HELPERS
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

function getPoster(item) {
    return item.poster_url ||
        item.backdrop_url ||
        "assets/images/movie-placeholder.jpg";
}

function getContentUrl(item) {
    const type = item.content_type || "movie";
    return `watch.html?id=${encodeURIComponent(item.id)}&type=${type}`;
}

/* =========================================
   LOADING STATE
========================================= */

function showLoading(container, message = "Loading content...") {
    if (!container) return;

    container.innerHTML = `
        <div class="content-loading">
            <div class="loading-spinner"></div>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

/* =========================================
   EMPTY STATE
========================================= */

function showEmpty(container, message = "No content available yet.") {
    if (!container) return;

    container.innerHTML = `
        <div class="content-empty">
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

/* =========================================
   MOVIE / SERIES CARD
========================================= */

function createMovieCard(item) {
    const title = escapeHTML(item.title || "Untitled");
    const poster = escapeHTML(getPoster(item));
    const category = escapeHTML(item.category || "Uncategorized");
    const year = escapeHTML(item.release_year || "");
    const rating = item.rating
        ? `<span class="movie-rating">★ ${escapeHTML(item.rating)}</span>`
        : "";

    const type = item.content_type === "series" ? "Series" : "Movie";

    return `
        <a class="movie-card" href="${getContentUrl(item)}">
            <div class="movie-poster">
                <img
                    src="${poster}"
                    alt="${title}"
                    loading="lazy"
                    onerror="this.onerror=null;this.src='assets/images/movie-placeholder.jpg';"
                >

                <span class="movie-type">${type}</span>

                <div class="movie-overlay">
                    <span class="play-icon">▶</span>
                </div>
            </div>

            <div class="movie-info">
                <h3>${title}</h3>

                <div class="movie-meta">
                    <span>${category}</span>
                    ${year ? `<span>${year}</span>` : ""}
                    ${rating}
                </div>
            </div>
        </a>
    `;
}

/* =========================================
   RENDER CONTENT GRID
========================================= */

function renderMovieGrid(container, movies) {
    if (!container) return;

    if (!movies || movies.length === 0) {
        showEmpty(container);
        return;
    }

    container.innerHTML = movies
        .map(createMovieCard)
        .join("");
}

/* =========================================
   HERO / FEATURED SECTION
========================================= */

function renderHero(movie) {
    if (!elements.hero) return;

    if (!movie) {
        elements.hero.innerHTML = `
            <div class="hero-content">
                <span class="hero-label">WELCOME TO CINEVA</span>
                <h1>Discover Your Next Favorite</h1>
                <p>Explore movies and series in one place.</p>
            </div>
        `;
        return;
    }

    const title = escapeHTML(movie.title || "Featured Movie");
    const description = escapeHTML(
        movie.description || "Discover this featured title on CINEVA."
    );
    const backdrop = escapeHTML(
        movie.backdrop_url ||
        movie.poster_url ||
        "assets/images/hero-banner.jpg"
    );

    elements.hero.innerHTML = `
        <div
            class="hero-background"
            style="background-image: url('${backdrop}')"
        ></div>

        <div class="hero-content">
            <span class="hero-label">CINEVA ORIGINAL PICK</span>

            <h1>${title}</h1>

            <p>${description}</p>

            <div class="hero-actions">
                <a href="${getContentUrl(movie)}" class="btn btn-primary">
                    ▶ Watch Now
                </a>

                <a href="${getContentUrl(movie)}" class="btn btn-secondary">
                    More Details
                </a>
            </div>
        </div>
    `;
}

/* =========================================
   LOAD FEATURED CONTENT
========================================= */

async function loadFeatured() {
    if (!elements.hero) return;

    try {
        const featured = await getFeaturedMovies(1);
        renderHero(featured[0] || null);
    } catch (error) {
        console.error("Featured content failed:", error);
        renderHero(null);
    }
}

/* =========================================
   LOAD LATEST CONTENT
========================================= */

async function loadLatest() {
    if (!elements.latest) return;

    showLoading(elements.latest, "Loading latest movies and series...");

    try {
        const latest = await getLatestContent(HOME_CONFIG.latestLimit);

        renderMovieGrid(elements.latest, latest);
    } catch (error) {
        console.error("Latest content failed:", error);
        showEmpty(elements.latest, "Unable to load latest content.");
    }
}

/* =========================================
   LOAD CATEGORY SECTIONS
========================================= */

async function loadCategories() {
    if (!elements.categorySections) return;

    elements.categorySections.innerHTML = "";

    const results = await Promise.all(
        CATEGORIES.map(async category => {
            try {
                const movies = await getMoviesByCategory(
                    category,
                    HOME_CONFIG.categoryLimit
                );

                return { category, movies };
            } catch (error) {
                console.error(`${category} loading failed:`, error);
                return { category, movies: [] };
            }
        })
    );

    results.forEach(({ category, movies }) => {
        if (!movies.length) return;

        const section = document.createElement("section");
        section.className = "content-section";

        section.innerHTML = `
            <div class="section-header">
                <div>
                    <span class="section-subtitle">EXPLORE CINEVA</span>
                    <h2>${escapeHTML(category)}</h2>
                </div>

                <a
                    href="category.html?name=${encodeURIComponent(category)}"
                    class="view-all"
                >
                    View All →
                </a>
            </div>

            <div class="movie-grid">
                ${movies.map(createMovieCard).join("")}
            </div>
        `;

        elements.categorySections.appendChild(section);
    });
}

/* =========================================
   HOMEPAGE INITIALIZATION
========================================= */

async function initializeHome() {
    await Promise.all([
        loadFeatured(),
        loadLatest(),
        loadCategories()
    ]);

    console.log("CINEVA homepage initialized.");
}

/* =========================================
   START HOMEPAGE
========================================= */

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeHome);
} else {
    initializeHome();
}
