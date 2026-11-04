
/* =========================================================
   CINEVA — HOMEPAGE CONTROLLER
   Cloudflare Pages + Supabase
   Upgraded: Hero Slider + Latest Content + Categories
========================================================= */

import {
    getLatestContent,
    getMoviesByCategory
} from "./supabase.js";

/* =========================================================
   01. HOMEPAGE SETTINGS
========================================================= */

const HOME_CONFIG = {
    latestLimit: 6,
    heroLimit: 5,
    categoryLimit: 6,
    sliderInterval: 6500,
    requestTimeout: 12000
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

/* =========================================================
   02. DOM ELEMENTS
========================================================= */

const elements = {
    hero: document.querySelector("#hero-section"),
    latest: document.querySelector("#latest-movies"),
    categorySections: document.querySelector("#category-sections")
};

/* =========================================================
   03. SLIDER STATE
========================================================= */

let heroSlides = [];
let currentSlide = 0;
let sliderTimer = null;

/* =========================================================
   04. SECURITY HELPERS
========================================================= */

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function safeImageURL(value) {
    if (!value) return "";

    try {
        const url = new URL(value, window.location.href);

        if (!["http:", "https:"].includes(url.protocol)) {
            return "";
        }

        return url.href;
    } catch {
        return "";
    }
}

function getPoster(item) {
    return safeImageURL(
        item.poster_url ||
        item.thumbnail_url ||
        item.backdrop_url
    );
}

function getBackdrop(item) {
    return safeImageURL(
        item.backdrop_url ||
        item.poster_url ||
        item.thumbnail_url
    );
}

function getContentType(item) {
    const type = String(
        item.content_type ||
        item.media_type ||
        item.type ||
        ""
    ).toLowerCase();

    return type === "series" ? "series" : "movie";
}

function getContentUrl(item) {
    return `watch.html?id=${encodeURIComponent(item.id)}&type=${getContentType(item)}`;
}

function getYear(item) {
    return item.release_year || item.year || "";
}

/* =========================================================
   05. REQUEST TIMEOUT
========================================================= */

function withTimeout(promise, message = "Request timed out.") {
    let timeout;

    const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => {
            reject(new Error(message));
        }, HOME_CONFIG.requestTimeout);
    });

    return Promise.race([promise, timeoutPromise])
        .finally(() => clearTimeout(timeout));
}

/* =========================================================
   06. LOADING / EMPTY STATES
========================================================= */

function showLoading(container, message = "Loading content...") {
    if (!container) return;

    container.innerHTML = `
        <div class="loading-content">
            <div class="content-spinner"></div>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

function showEmpty(container, message = "No content available yet.") {
    if (!container) return;

    container.innerHTML = `
        <div class="empty-content">
            <i class="fa-regular fa-circle-play"></i>
            <h3>Nothing to show yet</h3>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

/* =========================================================
   07. MOVIE / SERIES CARD
========================================================= */

function createMovieCard(item) {
    const title = escapeHTML(item.title || "Untitled");
    const category = escapeHTML(item.category || "Uncategorized");
    const year = escapeHTML(getYear(item));
    const poster = getPoster(item);

    const rating = item.rating
        ? `<span class="movie-rating">★ ${escapeHTML(item.rating)}</span>`
        : "";

    const type = getContentType(item) === "series"
        ? "Series"
        : "Movie";

    const imageHTML = poster
        ? `<img src="${escapeHTML(poster)}"
                alt="${title}"
                loading="lazy"
                onerror="this.style.display='none'">`
        : "";

    return `
        <a class="movie-card" href="${getContentUrl(item)}">

            <div class="movie-poster">

                ${imageHTML}

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

/* =========================================================
   08. RENDER MOVIE GRID
========================================================= */

function renderMovieGrid(container, content) {
    if (!container) return;

    if (!Array.isArray(content) || content.length === 0) {
        showEmpty(container);
        return;
    }

    container.innerHTML = content
        .slice(0, HOME_CONFIG.latestLimit)
        .map(createMovieCard)
        .join("");
}

/* =========================================================
   09. HERO SLIDER MARKUP
========================================================= */

function createHeroSlide(item, index) {
    const title = escapeHTML(item.title || "Featured on CINEVA");

    const description = escapeHTML(
        item.description ||
        "Discover and enjoy this title on CINEVA."
    );

    const backdrop = getBackdrop(item);

    const type = getContentType(item) === "series"
        ? "SERIES"
        : "MOVIE";

    const year = escapeHTML(getYear(item));
    const category = escapeHTML(item.category || "Entertainment");

    const rating = item.rating
        ? `<span><i class="fa-solid fa-star"></i> ${escapeHTML(item.rating)}</span>`
        : "";

    return `
        <div class="hero-slide ${index === 0 ? "active" : ""}"
             data-slide="${index}"
             ${backdrop ? `style="--hero-image: url('${escapeHTML(backdrop)}')"` : ""}>

            <div class="hero-background">
                ${backdrop
                    ? `<img class="hero-image"
                            src="${escapeHTML(backdrop)}"
                            alt="${title}"
                            ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}
                            onerror="this.style.display='none'">`
                    : ""
                }
            </div>

            <div class="hero-overlay"></div>

            <div class="container hero-content">

                <div class="hero-information">

                    <span class="hero-label">
                        <i class="fa-solid fa-fire"></i>
                        RECENTLY ADDED TO CINEVA
                    </span>

                    <span class="hero-type">${type}</span>

                    <h1>${title}</h1>

                    <div class="hero-meta">

                        <span>${category}</span>

                        ${year ? `<span>${year}</span>` : ""}

                        ${rating}

                    </div>

                    <p class="hero-description">
                        ${description}
                    </p>

                    <div class="hero-buttons">

                        <a href="${getContentUrl(item)}"
                           class="primary-btn">
                            <i class="fa-solid fa-play"></i>
                            Watch Now
                        </a>

                        <a href="${getContentUrl(item)}"
                           class="secondary-btn">
                            <i class="fa-solid fa-circle-info"></i>
                            More Details
                        </a>

                    </div>

                </div>

            </div>

        </div>
    `;
}

/* =========================================================
   10. HERO SLIDER CONTROLS
========================================================= */

function renderHeroControls() {
    if (!elements.hero || heroSlides.length <= 1) return "";

    return `
        <div class="hero-controls">

            <button class="hero-arrow hero-prev"
                    type="button"
                    aria-label="Previous slide">
                <i class="fa-solid fa-chevron-left"></i>
            </button>

            <div class="hero-indicators">
                ${heroSlides.map((_, index) => `
                    <button
                        class="indicator ${index === 0 ? "active" : ""}"
                        type="button"
                        data-index="${index}"
                        aria-label="Go to slide ${index + 1}">
                    </button>
                `).join("")}
            </div>

            <button class="hero-arrow hero-next"
                    type="button"
                    aria-label="Next slide">
                <i class="fa-solid fa-chevron-right"></i>
            </button>

        </div>
    `;
}

/* =========================================================
   11. DISPLAY HERO
========================================================= */

function renderHero() {
    if (!elements.hero) return;

    if (!heroSlides.length) {
        elements.hero.innerHTML = `
            <div class="hero-overlay"></div>

            <div class="container hero-content">
                <div class="hero-information">
                    <span class="hero-label">WELCOME TO CINEVA</span>
                    <h1>Discover Your Next Favorite</h1>
                    <p class="hero-description">
                        Explore movies and series in one place.
                    </p>

                    <div class="hero-buttons">
                        <a href="movies.html" class="primary-btn">
                            Explore Movies
                        </a>
                    </div>
                </div>
            </div>
        `;

        return;
    }

    elements.hero.innerHTML = `
        ${heroSlides.map(createHeroSlide).join("")}

        <div class="hero-bottom-fade"></div>

        ${renderHeroControls()}
    `;

    bindHeroControls();
    startHeroSlider();
}

/* =========================================================
   12. CHANGE HERO SLIDE
========================================================= */

function showHeroSlide(index) {
    if (!elements.hero || !heroSlides.length) return;

    currentSlide = (index + heroSlides.length) % heroSlides.length;

    elements.hero.querySelectorAll(".hero-slide").forEach((slide, i) => {
        slide.classList.toggle("active", i === currentSlide);
    });

    elements.hero.querySelectorAll(".indicator").forEach((indicator, i) => {
        indicator.classList.toggle("active", i === currentSlide);
    });
}

/* =========================================================
   13. HERO EVENTS
========================================================= */

function bindHeroControls() {
    if (!elements.hero) return;

    const previous = elements.hero.querySelector(".hero-prev");
    const next = elements.hero.querySelector(".hero-next");

    previous?.addEventListener("click", () => {
        showHeroSlide(currentSlide - 1);
        restartHeroSlider();
    });

    next?.addEventListener("click", () => {
        showHeroSlide(currentSlide + 1);
        restartHeroSlider();
    });

    elements.hero.querySelectorAll(".indicator").forEach(button => {
        button.addEventListener("click", () => {
            showHeroSlide(Number(button.dataset.index));
            restartHeroSlider();
        });
    });

    elements.hero.addEventListener("mouseenter", stopHeroSlider);
    elements.hero.addEventListener("mouseleave", startHeroSlider);
}

/* =========================================================
   14. HERO AUTOPLAY
========================================================= */

function stopHeroSlider() {
    if (sliderTimer) {
        clearInterval(sliderTimer);
        sliderTimer = null;
    }
}

function startHeroSlider() {
    stopHeroSlider();

    if (heroSlides.length <= 1) return;

    sliderTimer = setInterval(() => {
        showHeroSlide(currentSlide + 1);
    }, HOME_CONFIG.sliderInterval);
}

function restartHeroSlider() {
    stopHeroSlider();
    startHeroSlider();
}

/* =========================================================
   15. LOAD HERO FROM RECENTLY ADDED CONTENT
========================================================= */

async function loadFeatured() {
    if (!elements.hero) return;

    try {
        const content = await withTimeout(
            getLatestContent(HOME_CONFIG.heroLimit),
            "Hero content request timed out."
        );

        heroSlides = Array.isArray(content)
            ? content.filter(item => item && item.id)
                .slice(0, HOME_CONFIG.heroLimit)
            : [];

        currentSlide = 0;
        renderHero();

    } catch (error) {
        console.error("CINEVA hero slider error:", error);

        heroSlides = [];
        renderHero();
    }
}

/* =========================================================
   16. LOAD LATEST CONTENT
========================================================= */

async function loadLatest() {
    if (!elements.latest) return;

    showLoading(
        elements.latest,
        "Loading latest movies and series..."
    );

    try {
        const latest = await withTimeout(
            getLatestContent(HOME_CONFIG.latestLimit),
            "Latest content request timed out."
        );

        renderMovieGrid(
            elements.latest,
            Array.isArray(latest) ? latest.slice(0, 6) : []
        );

    } catch (error) {
        console.error("Latest content failed:", error);

        showEmpty(
            elements.latest,
            "Unable to load latest content."
        );
    }
}

/* =========================================================
   17. LOAD CATEGORY SECTIONS
========================================================= */

async function loadCategories() {
    if (!elements.categorySections) return;

    elements.categorySections.innerHTML = "";

    const results = await Promise.all(
        CATEGORIES.map(async category => {
            try {
                const content = await withTimeout(
                    getMoviesByCategory(
                        category,
                        HOME_CONFIG.categoryLimit
                    ),
                    `${category} request timed out.`
                );

                return {
                    category,
                    content: Array.isArray(content)
                        ? content.slice(0, 6)
                        : []
                };

            } catch (error) {
                console.error(`${category} loading failed:`, error);

                return {
                    category,
                    content: []
                };
            }
        })
    );

    results.forEach(({ category, content }) => {
        if (!content.length) return;

        const section = document.createElement("section");
        section.className = "content-section";

        section.innerHTML = `
            <div class="section-heading">

                <div class="section-title">
                    <div class="section-icon">
                        <i class="fa-solid fa-film"></i>
                    </div>

                    <div>
                        <h2>${escapeHTML(category)}</h2>
                        <p>Explore ${escapeHTML(category)} content</p>
                    </div>
                </div>

                <a href="movies.html?genre=${encodeURIComponent(category)}"
                   class="view-all">
                    View All
                    <i class="fa-solid fa-arrow-right"></i>
                </a>

            </div>

            <div class="movie-grid">
                ${content.map(createMovieCard).join("")}
            </div>
        `;

        elements.categorySections.appendChild(section);
    });
}

/* =========================================================
   18. PAGE LOADER CONTROL
========================================================= */

function hidePageLoader() {
    const loader = document.querySelector("#pageLoader");

    if (!loader) return;

    loader.classList.add("hidden");

    loader.style.opacity = "0";
    loader.style.visibility = "hidden";
    loader.style.pointerEvents = "none";

    loader.setAttribute("aria-hidden", "true");

    setTimeout(() => {
        loader.style.display = "none";
    }, 550);
}

/* =========================================================
   19. HOMEPAGE INITIALIZATION
========================================================= */

async function initializeHome() {
    try {
        await Promise.allSettled([
            loadFeatured(),
            loadLatest(),
            loadCategories()
        ]);

        console.log("CINEVA homepage initialized successfully.");

    } catch (error) {
        console.error("CINEVA homepage initialization failed:", error);

    } finally {
        hidePageLoader();
    }
}

/* =========================================================
   20. START HOMEPAGE
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeHome,
        { once: true }
    );
} else {
    initializeHome();
}
