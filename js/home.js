
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
    requestTimeout: 12000,

    tmdbImageBase: "https://image.tmdb.org/t/p/",

    posterSize: "w500",
    backdropSize: "w1280"
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


/* =========================================================
   05. IMAGE URL HANDLER
========================================================= */

function safeImageURL(value, tmdbPath = false, size = "w500") {

    if (!value || typeof value !== "string") {
        return "";
    }

    value = value.trim();

    if (!value) {
        return "";
    }

    // TMDB image paths such as /abc123.jpg
    if (tmdbPath && value.startsWith("/")) {

        value = `${HOME_CONFIG.tmdbImageBase}${size}${value}`;

    }

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


/* =========================================================
   06. POSTER DETECTION
========================================================= */

function getPoster(item) {

    if (!item) return "";

    // Prefer full image URLs and locally stored images.
    const directPoster =
        item.poster_url ||
        item.poster ||
        item.thumbnail_url ||
        item.thumbnail ||
        item.image;

    if (directPoster) {

        const image = safeImageURL(directPoster);

        if (image) return image;

    }

    // TMDB poster path.
    if (item.poster_path) {

        const image = safeImageURL(
            item.poster_path,
            true,
            HOME_CONFIG.posterSize
        );

        if (image) return image;

    }

    // Backdrop as last poster fallback.
    const backdrop =
        item.backdrop_url ||
        item.backdrop ||
        item.banner ||
        item.backdrop_path;

    if (backdrop) {

        const isTMDBPath =
            Boolean(item.backdrop_path) &&
            backdrop === item.backdrop_path;

        return safeImageURL(
            backdrop,
            isTMDBPath,
            HOME_CONFIG.posterSize
        );

    }

    return "";

}


/* =========================================================
   07. BACKDROP DETECTION
========================================================= */

function getBackdrop(item) {

    if (!item) return "";

    const directBackdrop =
        item.backdrop_url ||
        item.backdrop ||
        item.banner;

    if (directBackdrop) {

        const image = safeImageURL(directBackdrop);

        if (image) return image;

    }

    if (item.backdrop_path) {

        const image = safeImageURL(
            item.backdrop_path,
            true,
            HOME_CONFIG.backdropSize
        );

        if (image) return image;

    }

    // Use poster when no backdrop exists.
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

    const id = encodeURIComponent(item.id);

    const type = getContentType(item);

    return `watch.html?id=${id}&type=${type}`;

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
   17. POSTER FALLBACK MARKUP
========================================================= */

function createPosterHTML(item, title) {

    const poster = getPoster(item);

    const fallback = `
        <div class="poster-placeholder">

            <i class="fa-solid fa-film"></i>

            <span>CINEVA</span>

        </div>
    `;

    if (!poster) {
        return fallback;
    }

    return `
        ${fallback}

        <img
            src="${escapeHTML(poster)}"
            alt="${escapeHTML(title)}"
            loading="lazy"
            decoding="async"
            onerror="this.remove()"
        >
    `;

}


/* =========================================================
   18. MOVIE / SERIES CARD
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

    const type = getContentType(item) === "series"
        ? "Series"
        : "Movie";

    const ratingHTML = rating
        ? `
            <span class="movie-rating">
                <i class="fa-solid fa-star"></i>
                ${escapeHTML(rating)}
            </span>
        `
        : "";

    return `
        <a
            class="movie-card"
            href="${getContentUrl(item)}"
            aria-label="Watch ${title}"
        >

            <div class="movie-poster">

                ${createPosterHTML(item, title)}

                <span class="movie-type">
                    ${type}
                </span>

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

    const type = getContentType(item) === "series"
        ? "SERIES"
        : "MOVIE";

    const year = escapeHTML(getYear(item));

    const category = escapeHTML(
        getCategory(item)
    );

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
                alt="${title}"
                ${index === 0
                    ? 'fetchpriority="high"'
                    : 'loading="lazy"'
                }
                decoding="async"
                onerror="this.remove()"
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
   21. HERO CONTROLS
========================================================= */

function renderHeroControls() {

    if (
        !elements.hero ||
        heroSlides.length <= 1
    ) {
        return "";
    }

    return `
        <div class="hero-controls">

            <button
                class="hero-arrow hero-prev"
                type="button"
                aria-label="Previous slide"
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
                    ></button>

                `).join("")}

            </div>


            <button
                class="hero-arrow hero-next"
                type="button"
                aria-label="Next slide"
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

    if (
        !elements.hero ||
        !heroSlides.length
    ) {
        return;
    }

    currentSlide =
        (index + heroSlides.length) %
        heroSlides.length;

    elements.hero
        .querySelectorAll(".hero-slide")
        .forEach((slide, i) => {

            slide.classList.toggle(
                "active",
                i === currentSlide
            );

        });

    elements.hero
        .querySelectorAll(".indicator")
        .forEach((indicator, i) => {

            indicator.classList.toggle(
                "active",
                i === currentSlide
            );

        });

}


/* =========================================================
   24. HERO EVENTS
========================================================= */

function bindHeroControls() {

    if (!elements.hero) return;

    const previous =
        elements.hero.querySelector(".hero-prev");

    const next =
        elements.hero.querySelector(".hero-next");


    previous?.addEventListener("click", () => {

        showHeroSlide(currentSlide - 1);

        restartHeroSlider();

    });


    next?.addEventListener("click", () => {

        showHeroSlide(currentSlide + 1);

        restartHeroSlider();

    });


    elements.hero
        .querySelectorAll(".indicator")
        .forEach(button => {

            button.addEventListener("click", () => {

                showHeroSlide(
                    Number(button.dataset.index)
                );

                restartHeroSlider();

            });

        });


    elements.hero.addEventListener(
        "mouseenter",
        stopHeroSlider
    );

    elements.hero.addEventListener(
        "mouseleave",
        startHeroSlider
    );

}


/* =========================================================
   25. HERO AUTOPLAY
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
   26. LOAD HERO CONTENT
========================================================= */

async function loadFeatured() {

    if (!elements.hero) return;

    try {

        const content = await withTimeout(
            getLatestContent(HOME_CONFIG.heroLimit),
            "Hero content request timed out."
        );

        heroSlides = Array.isArray(content)

            ? content
                .filter(item => item && item.id)
                .slice(0, HOME_CONFIG.heroLimit)

            : [];

        currentSlide = 0;

        renderHero();

    } catch (error) {

        console.error(
            "CINEVA hero slider error:",
            error
        );

        heroSlides = [];

        renderHero();

    }

}


/* =========================================================
   27. LOAD LATEST CONTENT
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
            Array.isArray(latest)
                ? latest.slice(0, HOME_CONFIG.latestLimit)
                : []
        );

    } catch (error) {

        console.error(
            "Latest content failed:",
            error
        );

        showEmpty(
            elements.latest,
            "Unable to load latest content. Please try again."
        );

    }

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
   29. LOAD CATEGORY SECTIONS
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

                        ? content.slice(
                            0,
                            HOME_CONFIG.categoryLimit
                        )

                        : []

                };

            } catch (error) {

                console.error(
                    `${category} loading failed:`,
                    error
                );

                return {

                    category,

                    content: []

                };

            }

        })

    );


    results.forEach(({ category, content }) => {

        if (!content.length) return;

        const section = createCategorySection(
            category,
            content
        );

        if (section) {

            elements.categorySections.appendChild(section);

        }

    });

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
   31. HOMEPAGE INITIALIZATION
========================================================= */

async function initializeHome() {

    try {

        await Promise.allSettled([

            loadFeatured(),

            loadLatest(),

            loadCategories()

        ]);

        console.log(
            "CINEVA homepage initialized successfully."
        );

    } catch (error) {

        console.error(
            "CINEVA homepage initialization failed:",
            error
        );

    } finally {

        hidePageLoader();

    }

}

/* =========================================================
   CINEVA — OUR TRANSLATORS FROM SUPABASE
========================================================= */

async function loadOurTranslators() {
    const track = document.getElementById("translatorsTrack");

    if (!track) return;

    try {
        const [movies, series] = await Promise.all([
            supabase
                .from("movies")
                .select("translator")
                .eq("is_active", true)
                .not("translator", "is", null),

            supabase
                .from("series")
                .select("translator")
                .eq("is_active", true)
                .not("translator", "is", null)
        ]);

        if (movies.error) throw movies.error;
        if (series.error) throw series.error;

        const names = [
            ...(movies.data || []),
            ...(series.data || [])
        ]
            .map(item => item.translator?.trim())
            .filter(Boolean);

        const uniqueNames = [
            ...new Set(names)
        ].sort((a, b) => a.localeCompare(b));

        if (!uniqueNames.length) {
            track.innerHTML =
                '<div class="translator-loading">No translators available yet.</div>';

            track.style.animation = "none";
            return;
        }

        const cards = uniqueNames.map(name => {
            const initial = name.charAt(0).toUpperCase();

            const safeName = name.replace(/[&<>"']/g, char => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            })[char]);

            return `
                <div class="translator-card">
                    <div class="translator-avatar">${initial}</div>
                    <div class="translator-details">
                        <h3>${safeName}</h3>
                        <span>CINEVA Translator</span>
                    </div>
                </div>
            `;
        }).join("");

        // Duplicate cards for continuous scrolling
        track.innerHTML = cards + cards;

        if (uniqueNames.length < 2) {
            track.style.animation = "none";
        }

    } catch (error) {
        console.error("OUR TRANSLATORS:", error);

        track.innerHTML =
            '<div class="translator-loading">Unable to load translators.</div>';

        track.style.animation = "none";
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
