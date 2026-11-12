
/* =========================================================
   CINEVA — PREMIUM HOMEPAGE CONTROLLER
   File: js/home.js

   Features:
   - Supabase latest movies and series
   - Premium hero slider
   - Dynamic category sections
   - Improved poster and backdrop detection
   - Image fallbacks
   - Secure HTML rendering
   - Responsive movie cards
========================================================= */

import {
    getHomepageData,
    getOurTranslatorProfiles
} from "./supabase.js?v=20261112-translator-profiles-1";
/* =========================================================
   01. HOMEPAGE SETTINGS
========================================================= */
const HOME_CONFIG = {
    latestLimit: 6,
    heroLimit: 10,
    categoryLimit: 6,
   trendingLimit: 6,

    // Automatically change hero every 4 seconds
    sliderInterval: 4000,

    requestTimeout: 12000,

    tmdbImageBase: "https://image.tmdb.org/t/p/",

    // Smaller TMDB images on phones reduce data use without changing card design.
    posterSize: window.matchMedia("(max-width: 600px)").matches ? "w342" : "w500",
    backdropSize: window.matchMedia("(max-width: 600px)").matches ? "w1280" : "original"
};


const CATEGORIES = [
    "Action",
    "Adventure",
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
    trending: document.querySelector("#trendingMovies"),
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
/* =========================================================
   05. SMART IMAGE URL HANDLER
========================================================= */

function safeImageURL(value, size = HOME_CONFIG.posterSize, forceTMDB = false) {
    if (typeof value !== "string") return "";

    const image = value.trim();

    if (!image) return "";

    // Already a complete URL
    if (/^https?:\/\//i.test(image)) {
        try {
            const url = new URL(image);

            return ["http:", "https:"].includes(url.protocol)
                ? url.href
                : "";
        } catch {
            return "";
        }
    }

    // Protocol-relative URL
    if (image.startsWith("//")) {
        return `https:${image}`;
    }

    // Local website images must remain local
    if (
        image.startsWith("./") ||
        image.startsWith("../") ||
        image.startsWith("assets/") ||
        image.startsWith("/assets/") ||
        image.startsWith("images/") ||
        image.startsWith("/images/")
    ) {
        return new URL(image, window.location.href).href;
    }

    // TMDB image paths, for example: /abc123.jpg
    if (forceTMDB || image.startsWith("/")) {
        const path = image.replace(/^\/+/, "");

        return `${HOME_CONFIG.tmdbImageBase}${size}/${path}`;
    }

    // Other relative image paths
    return new URL(image, window.location.href).href;
}


/* =========================================================
   06. ADVANCED POSTER DETECTION
========================================================= */

function getPoster(item) {
    if (!item) return "";

    // Check common direct poster/image columns first
    const posterFields = [
        "poster_url",
        "poster",
        "poster_image",
        "poster_image_url",
        "image_url",
        "thumbnail_url",
        "thumbnail",
        "image",
        "cover_image",
        "cover"
    ];

    for (const field of posterFields) {
        const value = item[field];

        if (typeof value !== "string" || !value.trim()) {
            continue;
        }

        const image = safeImageURL(
            value,
            HOME_CONFIG.posterSize
        );

        if (image) return image;
    }

    // TMDB poster path
    if (item.poster_path) {
        const image = safeImageURL(
            item.poster_path,
            HOME_CONFIG.posterSize,
            true
        );

        if (image) return image;
    }

    // Use backdrop/banner as a last poster fallback
    const fallbackFields = [
        "backdrop_url",
        "backdrop",
        "banner",
        "backdrop_path"
    ];

    for (const field of fallbackFields) {
        const value = item[field];

        if (typeof value !== "string" || !value.trim()) {
            continue;
        }

        const image = safeImageURL(
            value,
            HOME_CONFIG.posterSize,
            field === "backdrop_path"
        );

        if (image) return image;
    }

    return "";
}


/* =========================================================
   07. ADVANCED BACKDROP DETECTION
========================================================= */

function getBackdrop(item) {
    if (!item) return "";

    const getHDBackdropURL = value => {
        const image = safeImageURL(value, HOME_CONFIG.backdropSize, true);
        if (!image) return "";

        // Upgrade existing TMDB backdrop URLs that were saved at poster-sized
        // or medium resolution, without changing URLs from other image hosts.
        try {
            const url = new URL(image);
            if (url.hostname === "image.tmdb.org") {
                url.pathname = url.pathname.replace(
                    /^(\/t\/p\/)[^/]+(?=\/)/,
                    `$1${HOME_CONFIG.backdropSize}`
                );
            }
            return url.href;
        } catch {
            return image;
        }
    };

    const backdropFields = [
        "backdrop_url",
        "backdrop",
        "banner",
        "backdrop_image",
        "backdrop_image_url"
    ];

    for (const field of backdropFields) {
        const value = item[field];

        if (typeof value !== "string" || !value.trim()) {
            continue;
        }

        const image = getHDBackdropURL(value);
        if (image) return image;
    }

    // TMDB backdrop path
    if (item.backdrop_path) {
        const image = getHDBackdropURL(item.backdrop_path);
        if (image) return image;
    }

    // Fall back to poster if no backdrop exists
    return getPoster(item);
}
/* =========================================================
   08. CONTENT TYPE
========================================================= */

function getContentType(item) {

    const type = String(
        item.content_type ||
        item.media_type ||
        item.type ||
        item.role ||
        ""
    ).toLowerCase();

    if (
        type === "series" ||
        type === "tv" ||
        type === "show"
    ) {
        return "series";
    }

    return "movie";

}


/* =========================================================
   09. CONTENT URL
========================================================= */

function getContentUrl(item) {

    const type = getContentType(item);

    // Legacy watch navigation uses the original database primary key.
    const id = item.id;

    if (id == null) return "watch.html";

    return `watch.html?id=${encodeURIComponent(id)}&type=${type}`;

}


/* =========================================================
   10. YEAR DETECTION
========================================================= */

function getYear(item) {

    const value =
        item.release_year ||
        item.year ||
        item.release_date ||
        item.first_air_date ||
        item.created_at ||
        "";

    if (!value) return "";

    const match = String(value).match(/\d{4}/);

    return match ? match[0] : "";

}


/* =========================================================
   11. RATING DETECTION
========================================================= */

function getRating(item) {

    const value =
        item.rating ??
        item.vote_average ??
        item.imdb_rating ??
        null;

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "";
    }

    const rating = Number(value);

    if (!Number.isFinite(rating) || rating <= 0) {
        return "";
    }

    return rating.toFixed(1);

}


/* =========================================================
   12. CATEGORY DETECTION
========================================================= */

function getCategory(item) {

    if (item.category) {
        return String(item.category);
    }

    if (Array.isArray(item.genres) && item.genres.length) {

        const firstGenre = item.genres[0];

        return typeof firstGenre === "object"
            ? firstGenre.name || "Entertainment"
            : firstGenre;

    }

    return "Entertainment";

}

/* =========================================================
   TRANSLATOR DETECTION
========================================================= */

function getTranslator(item) {
    const translator = item?.translator;

    if (typeof translator !== "string") return "";

    return translator.trim();
}

/* =========================================================
   13. DESCRIPTION DETECTION
========================================================= */

function getDescription(item) {

    return (
        item.overview ||
        item.description ||
        item.tagline ||
        "Discover and enjoy this title on CINEVA."
    );

}


/* =========================================================
   14. REQUEST TIMEOUT
========================================================= */

function withTimeout(
    promise,
    message = "Request timed out."
) {

    let timeout;

    const timeoutPromise = new Promise((_, reject) => {

        timeout = setTimeout(() => {
            reject(new Error(message));
        }, HOME_CONFIG.requestTimeout);

    });

    return Promise.race([
        promise,
        timeoutPromise
    ]).finally(() => {

        clearTimeout(timeout);

    });

}


/* =========================================================
   15. LOADING STATE
========================================================= */

function showLoading(
    container,
    message = "Loading content..."
) {

    if (!container) return;

    container.innerHTML = `
        <div class="loading-content">

            <div class="content-spinner"></div>

            <p>${escapeHTML(message)}</p>

        </div>
    `;

}


/* =========================================================
   16. EMPTY STATE
========================================================= */

function showEmpty(
    container,
    message = "No content available yet."
) {

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
   17. PREMIUM POSTER MARKUP
========================================================= */

function createPosterHTML(item, title) {
    const poster = getPoster(item);

    const fallback = `
        <div class="poster-placeholder">
            <i class="fa-solid fa-film"></i>
            <span>CINEVA</span>
        </div>
    `;

    // No poster available
    if (!poster) {
        return fallback;
    }

    return `
        <img
            src="${escapeHTML(poster)}"
            alt="${escapeHTML(title)}"
            loading="lazy"
            decoding="async"
            onerror="
                this.style.display='none';
                this.nextElementSibling.style.display='flex';
            "
        >

        <div
            class="poster-placeholder"
            style="display:none;"
        >
            <i class="fa-solid fa-film"></i>
            <span>CINEVA</span>
        </div>
    `;
}

/* =========================================================
   18. PREMIUM MOVIE / SERIES CARD
   Includes translator badge on poster
========================================================= */

function createMovieCard(item) {

    if (!item || !item.id) return "";

    const title = escapeHTML(
        item.title ||
        item.name ||
        "Untitled"
    );

    const category = escapeHTML(
        getCategory(item)
    );

    const year = escapeHTML(
        getYear(item)
    );

    const rating = getRating(item);

    const translator = escapeHTML(
        getTranslator(item)
    );

    const type = getContentType(item) === "series"
        ? "Series"
        : "Movie";

    const translatorHTML = translator
        ? `
            <span
                class="movie-translator-badge"
                title="Translated by ${translator}"
            >
                <i class="fa-solid fa-language"></i>
                ${translator}
            </span>
        `
        : "";

    const ratingHTML = rating
        ? `
            <span class="movie-rating">
                <i class="fa-solid fa-star"></i>
                ${escapeHTML(rating)}
            </span>
        `
        : "";

    return `
        <article class="movie-card">
            <a class="movie-card-link" href="${getContentUrl(item)}" aria-label="Watch ${title}">

            <div class="movie-poster">

                ${createPosterHTML(item, title)}

                <span class="movie-type">
                    ${type}
                </span>

                ${(item.content_type === "series" || item.type === "series") && item.last_activity_at && Date.now() - Date.parse(item.last_activity_at) <= 7 * 24 * 60 * 60 * 1000 ? '<span class="movie-new-episode-badge" aria-label="New episode added">NEW EP</span>' : ""}

                ${translatorHTML}

                <div class="movie-overlay">

                    <span class="play-icon">
                        <i class="fa-solid fa-play"></i>
                    </span>

                </div>

            </div>

            <div class="movie-info">

                <h3 title="${title}">
                    ${title}
                </h3>

                <div class="movie-meta">

                    <span title="${category}">
                        ${category}
                    </span>

                    ${year
                        ? `<span>${year}</span>`
                        : ""
                    }

                    ${ratingHTML}

                </div>

            </div>

            </a>
        </article>
    `;
}

/* =========================================================
   19. RENDER MOVIE GRID
========================================================= */

function renderMovieGrid(container, content) {

    if (!container) return;

    if (
        !Array.isArray(content) ||
        content.length === 0
    ) {

        showEmpty(container);

        return;

    }

    const cards = content
        .filter(item => item && item.id)
        .map(createMovieCard)
        .filter(Boolean);

    if (!cards.length) {

        showEmpty(container);

        return;

    }

    container.innerHTML = cards.join("");

}


/* =========================================================
   20. HERO SLIDER MARKUP
========================================================= */

function createHeroSlide(item, index) {

    const title = escapeHTML(
        item.title ||
        item.name ||
        "Featured on CINEVA"
    );

    const description = escapeHTML(
        getDescription(item)
    );

    const backdrop = getBackdrop(item);
    const posterFallback = getPoster(item);

    const type = getContentType(item) === "series"
        ? "SERIES"
        : "MOVIE";

    const year = escapeHTML(getYear(item));

    const category = escapeHTML(
        getCategory(item)
    );

    const translator = escapeHTML(getTranslator(item));
    const translatorHTML = translator
        ? `<span class="hero-translator-badge" title="Translated by ${translator}"><i class="fa-solid fa-language"></i><span>Translated by <strong>${translator}</strong></span></span>`
        : "";

    const rating = getRating(item);

    const ratingHTML = rating
        ? `
            <span>
                <i class="fa-solid fa-star"></i>
                ${escapeHTML(rating)}
            </span>
        `
        : "";

    const imageHTML = backdrop
        ? `
            <img
                class="hero-image"
                src="${escapeHTML(backdrop)}"
                data-fallback="${escapeHTML(posterFallback)}"
                alt="${title}"
                ${index === 0
                    ? 'fetchpriority="high"'
                    : 'loading="lazy"'
                }
                decoding="async"
                onerror="if(this.dataset.fallback && this.src !== this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.remove();}"
            >
        `
        : "";

    return `
        <div
            class="hero-slide ${index === 0 ? "active" : ""}"
            data-slide="${index}"
        >

            <div class="hero-background">

                ${imageHTML}

            </div>


            <div class="hero-overlay"></div>


            <div class="container hero-content">

                <div class="hero-information">

                    <span class="hero-label">

                        <i class="fa-solid fa-fire"></i>

                        RECENTLY ADDED TO CINEVA

                    </span>


                    <span class="hero-type">
                        ${type}
                    </span>


                    <h1>${title}</h1>


                    <div class="hero-meta">

                        <span>${category}</span>

                        ${year
                            ? `<span>${year}</span>`
                            : ""
                        }

                        ${ratingHTML}
                        ${translatorHTML}

                    </div>


                    <p class="hero-description">

                        ${description}

                    </p>


                    <div class="hero-buttons">

                        <a
                            href="${getContentUrl(item)}"
                            class="primary-btn"
                        >

                            <i class="fa-solid fa-play"></i>

                            Watch Now

                        </a>


                        <a
                            href="${getContentUrl(item)}"
                            class="secondary-btn"
                        >

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
   21. PREMIUM HERO NAVIGATION
========================================================= */

function renderHeroControls() {
    if (!elements.hero || heroSlides.length <= 1) {
        return "";
    }

    return `
        <div class="hero-controls">

            <button
                class="hero-arrow hero-prev"
                type="button"
                aria-label="Previous slide"
                title="Previous"
            >
                <i class="fa-solid fa-chevron-left"></i>
            </button>

            <div class="hero-indicators">
                ${heroSlides.map((_, index) => `
                    <button
                        class="indicator ${index === 0 ? "active" : ""}"
                        type="button"
                        data-index="${index}"
                        aria-label="Go to slide ${index + 1}"
                        aria-current="${index === 0 ? "true" : "false"}"
                    ></button>
                `).join("")}
            </div>

            <button
                class="hero-arrow hero-next"
                type="button"
                aria-label="Next slide"
                title="Next"
            >
                <i class="fa-solid fa-chevron-right"></i>
            </button>

        </div>
    `;
}
/* =========================================================
   22. DISPLAY HERO
========================================================= */

function renderHero() {

    if (!elements.hero) return;

    if (!heroSlides.length) {

        elements.hero.innerHTML = `

            <div class="hero-overlay"></div>

            <div class="container hero-content">

                <div class="hero-information">

                    <span class="hero-label">
                        WELCOME TO CINEVA
                    </span>

                    <h1>
                        Discover Your Next Favorite
                    </h1>

                    <p class="hero-description">
                        Explore movies and series in one place.
                    </p>

                    <div class="hero-buttons">

                        <a
                            href="movies.html"
                            class="primary-btn"
                        >
                            Explore Movies
                        </a>

                    </div>

                </div>

            </div>

        `;

        return;

    }

    elements.hero.innerHTML = `

        ${heroSlides
            .map(createHeroSlide)
            .join("")
        }

        <div class="hero-bottom-fade"></div>

        ${renderHeroControls()}

    `;

    bindHeroControls();

    startHeroSlider();

}


/* =========================================================
   23. CHANGE HERO SLIDE
========================================================= */

function showHeroSlide(index) {
    if (!elements.hero || !heroSlides.length) return;

    currentSlide =
        (index + heroSlides.length) % heroSlides.length;

    elements.hero.querySelectorAll(".hero-slide").forEach(
        (slide, i) => {
            const active = i === currentSlide;

            slide.classList.toggle("active", active);
            slide.setAttribute("aria-hidden", String(!active));
        }
    );

    elements.hero.querySelectorAll(".indicator").forEach(
        (indicator, i) => {
            const active = i === currentSlide;

            indicator.classList.toggle("active", active);
            indicator.setAttribute(
                "aria-current",
                active ? "true" : "false"
            );
        }
    );
}
/* =========================================================
   24. HERO NAVIGATION EVENTS
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

    // Keep autoplay running even while the pointer is over the hero.

    // Pause autoplay when the browser tab is hidden
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopHeroSlider();
        } else {
            startHeroSlider();
        }
    });
}


/* =========================================================
   25. AUTOMATIC HERO SLIDER
========================================================= */

function stopHeroSlider() {
    if (sliderTimer !== null) {
        clearInterval(sliderTimer);
        sliderTimer = null;
    }
}

function startHeroSlider() {
    stopHeroSlider();

    if (
        heroSlides.length <= 1 ||
        document.hidden
    ) {
        return;
    }

    sliderTimer = setInterval(() => {
        showHeroSlide(currentSlide + 1);
    }, HOME_CONFIG.sliderInterval);
}

function restartHeroSlider() {
    stopHeroSlider();
    startHeroSlider();
}
/* =========================================================
   26. LOAD HERO CONTENT
========================================================= */
/* =========================================================
   26. RENDER HERO FROM SHARED HOMEPAGE DATA
========================================================= */

function loadFeatured(content = []) {
    if (!elements.hero) return;

    heroSlides = Array.isArray(content)
        ? content
            .filter(item => item && item.id)
            .slice(0, HOME_CONFIG.heroLimit)
        : [];

    currentSlide = 0;

    renderHero();
}
/* =========================================================
   CINEVA PRO — LATEST ADDED VIEW ALL LINK
========================================================= */

function ensureLatestViewAll() {
    if (!elements.latest) return;

    const section =
        elements.latest.closest(".content-section") ||
        document.querySelector("#latestAdded");

    if (!section) return;

    const heading = section.querySelector(
        ".section-heading, .section-header"
    );

    if (!heading) return;

    let viewAll = heading.querySelector(".view-all");

    if (!viewAll) {
        viewAll = document.createElement("a");
        viewAll.className = "view-all";
        heading.appendChild(viewAll);
    }

    viewAll.href = "movies.html?sort=latest";
    viewAll.setAttribute("aria-label", "View all latest content");

    viewAll.innerHTML = `
        View All
        <i class="fa-solid fa-arrow-right"></i>
    `;
}

/* =========================================================
   27. RENDER LATEST FROM SHARED HOMEPAGE DATA
========================================================= */

function loadLatest(content = []) {
    if (!elements.latest) return;

    ensureLatestViewAll();

    const latestSix = Array.isArray(content)
        ? content
            .filter(item => item && item.id)
            .slice(0, HOME_CONFIG.latestLimit)
        : [];

    if (!latestSix.length) {
        showEmpty(
            elements.latest,
            "New movies and series will appear here soon."
        );
        return;
    }

    renderMovieGrid(elements.latest, latestSix);

    console.log(
        `CINEVA: Displaying ${latestSix.length} latest titles.`
    );
}
/* =========================================================
   CINEVA — LOAD TRENDING MOVIES AND SERIES
   Ranked by actual Supabase views
========================================================= */
/* =========================================================
   RENDER TRENDING FROM SHARED HOMEPAGE DATA
========================================================= */

function loadTrending(content = []) {
    if (!elements.trending) return;

    if (!Array.isArray(content) || !content.length) {
        showEmpty(
            elements.trending,
            "Trending content will appear here as viewers watch movies and series."
        );
        return;
    }

    renderMovieGrid(elements.trending, content);

    console.log(
        `CINEVA: Loaded ${content.length} trending titles.`
    );
}
/* =========================================================
   28. CATEGORY SECTION MARKUP
========================================================= */

function createCategorySection(category, content) {

    const safeCategory = escapeHTML(category);

    const cards = content
        .map(createMovieCard)
        .filter(Boolean)
        .join("");

    if (!cards) return null;

    const section = document.createElement("section");

    section.className = "content-section category-section";

    section.innerHTML = `

        <div class="section-heading">

            <div class="section-title">

                <div class="section-icon">

                    <i class="fa-solid fa-film"></i>

                </div>

                <div>

                    <h2>${safeCategory}</h2>

                    <p>
                        Explore ${safeCategory} content
                    </p>

                </div>

            </div>


            <a
                href="movies.html?genre=${encodeURIComponent(category)}"
                class="view-all"
            >

                View All

                <i class="fa-solid fa-arrow-right"></i>

            </a>

        </div>


        <div class="movie-grid">

            ${cards}

        </div>

    `;

    return section;

}


/* =========================================================
   29. RENDER CATEGORIES FROM SHARED HOMEPAGE DATA
========================================================= */

function loadCategories(categoryData = {}) {
    if (!elements.categorySections) return;

    elements.categorySections.innerHTML = "";

    CATEGORIES.forEach(category => {
        const content = categoryData[category] || [];

        if (!content.length) return;

        const section = createCategorySection(
            category,
            content
        );

        if (section) {
            elements.categorySections.appendChild(section);
        }
    });

    console.log("CINEVA: Category sections rendered.");
}
/* =========================================================
   30. PAGE LOADER
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
   CINEVA PRO — OPTIMIZED HOMEPAGE INITIALIZATION
   One shared homepage database request
========================================================= */

const HOMEPAGE_CACHE_KEY = "cineva_homepage_cache_v3";
const HOMEPAGE_CACHE_MAX_AGE = 6 * 60 * 60 * 1000;

function readHomepageCache() {
    try {
        const cached = JSON.parse(localStorage.getItem(HOMEPAGE_CACHE_KEY) || "null");
        return cached && cached.data && cached.savedAt
            ? cached
            : null;
    } catch {
        return null;
    }
}

function saveHomepageCache(data) {
    try {
        localStorage.setItem(HOMEPAGE_CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            data
        }));
    } catch (error) {
        // Storage may be full or unavailable; live content still works.
        console.warn("CINEVA: Homepage cache could not be saved.", error);
    }
}

function renderHomepageData(homepageData) {
    loadFeatured(homepageData.latest || []);
    loadLatest(homepageData.latest || []);
    loadTrending(homepageData.trending || []);
    loadCategories(homepageData.categories || {});
}

async function initializeHome() {
    console.log("CINEVA: Starting fast homepage...");

    // Translator content is independent; never block the main catalogue on it.
    loadOurTranslators().catch(error =>
        console.warn("CINEVA: Translator section deferred.", error)
    );

    const cached = readHomepageCache();
    if (cached) {
        renderHomepageData(cached.data);
        hidePageLoader();
        console.log("CINEVA: Homepage rendered from local cache.");
    } else {
        showLoading(elements.latest, "Loading latest movies and series...");
        showLoading(elements.trending, "Finding the most watched content...");
        if (elements.categorySections) elements.categorySections.innerHTML = "";
    }

    try {
        // Refresh in the background and keep the previous catalogue visible
        // until fresh data is ready. A slow connection no longer blocks cached UI.
        const homepageData = await withTimeout(
            getHomepageData({
                latestLimit: HOME_CONFIG.heroLimit,
                trendingLimit: HOME_CONFIG.trendingLimit,
                categoryLimit: HOME_CONFIG.categoryLimit,
                categories: CATEGORIES
            }),
            "Homepage content request timed out."
        );

        saveHomepageCache(homepageData);
        renderHomepageData(homepageData);
        console.log("CINEVA: Fresh homepage data loaded.", {
            latest: homepageData.latest?.length || 0,
            trending: homepageData.trending?.length || 0,
            categories: Object.keys(homepageData.categories || {}).length
        });
    } catch (error) {
        console.warn("CINEVA: Live homepage refresh failed; cached content is retained.", error);

        if (!cached) {
            loadFeatured([]);
            showEmpty(elements.latest, "CINEVA is having trouble connecting. Check your internet and try again.");
            showEmpty(elements.trending, "Trending titles will appear when your connection returns.");
            if (elements.categorySections) elements.categorySections.innerHTML = "";
        }
    } finally {
        hidePageLoader();
    }
}
/* =========================================================
   CINEVA — OUR TRANSLATORS
========================================================= */

function normalizeTranslatorName(value = "") {
    const name = String(value).replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();

    if (/^gaheza(?:\s+simba)?$/.test(key)) return "Gaheza";
    if (/^hakim(?:\s+the\s+(?:prof|mwarimu))?$/.test(key)) return "Hakim's";

    return name;
}

async function loadOurTranslators() {
    const track = document.getElementById("translatorsTrack");
    if (!track) return;

    try {
        const profiles = await getOurTranslatorProfiles();
        if (!profiles.length) {
            track.innerHTML = '<div class="translator-loading">No translator profiles available yet.</div>';
            track.classList.add("is-static");
            return;
        }

        track.innerHTML = profiles.map(profile => {
            const safeName = escapeHTML(profile.name);
            const safeBio = escapeHTML(profile.bio || "CINEVA Translator");
            const image = profile.profile_image_url
                ? `<img src="${escapeHTML(profile.profile_image_url)}" alt="${safeName}" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`
                : "";
            const initial = escapeHTML((profile.name || "?").trim().charAt(0).toUpperCase());
            const href = `translator.html?name=${encodeURIComponent(profile.name)}`;

            return `
                <a class="translator-card translator-profile-card" href="${href}" aria-label="View titles translated by ${safeName}">
                    <span class="translator-avatar translator-profile-avatar">
                        ${image}
                        <span class="translator-avatar-fallback" ${profile.profile_image_url ? "hidden" : ""}>${initial}</span>
                    </span>
                    <span class="translator-details">
                        <strong>${safeName}</strong>
                        <span>${safeBio}</span>
                    </span>
                    <i class="fa-solid fa-arrow-up-right-from-square translator-card-arrow" aria-hidden="true"></i>
                </a>
            `;
        }).join("");
        track.classList.add("is-static");
        track.style.animation = "none";
    } catch (error) {
        console.error("CINEVA translators error:", error);
        track.innerHTML = '<div class="translator-loading">Unable to load translator profiles right now.</div>';
        track.classList.add("is-static");
    }
}

/* =========================================================
   32. START HOMEPAGE
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
