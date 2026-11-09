
/* =========================================================
   CINEVA — PREMIUM GENRE / DISCOVERY CONTROLLER
   File: js/genre.js

   Features:
   - Loads active movies and series from Supabase
   - Genre, type and search filters
   - Latest, rating, popularity and A-Z sorting
   - Pagination
   - URL query parameter support
   - Safe DOM rendering
   - Poster fallbacks
========================================================= */

import { supabase } from "./config.js";

/* =========================================
   CONFIGURATION
========================================= */

const GENRE_CONFIG = {
    moviesTable: "movies",
    seriesTable: "series",
    pageSize: 10,
    fallbackPoster:
        "https://placehold.co/400x600/151522/ffffff?text=CINEVA"
};

/* =========================================
   STATE
========================================= */

const state = {
    allContent: [],
    content: [],
    type: "all",
    genre: "",
    sort: "latest",
    search: "",
    currentPage: 1,
    loading: false
};

/* =========================================
   DOM ELEMENTS
========================================= */

const elements = {
    pageTitle: document.getElementById("page-title"),
    pageDescription: document.getElementById("page-description"),

    resultsHeading: document.getElementById("results-heading"),
    resultsCount: document.getElementById("results-count"),
    resultsStatus: document.getElementById("results-status"),
    pageIndicator: document.getElementById("page-indicator"),

    search: document.getElementById("genre-search"),
    clearSearch: document.getElementById("clear-search"),

    contentFilter: document.getElementById("content-filter"),
    sortFilter: document.getElementById("sort-filter"),
    resetButton: document.getElementById("genre-reset"),
    emptyReset: document.getElementById("empty-reset"),

    activeFilters: document.getElementById("active-filters"),

    grid: document.getElementById("genre-grid"),
    loading: document.getElementById("genre-loading"),
    empty: document.getElementById("genre-empty"),
    error: document.getElementById("genre-error"),
    errorText: document.getElementById("genre-error-text"),
    retryButton: document.getElementById("genre-retry"),
    pagination: document.getElementById("genre-pagination"),

    footerYear: document.getElementById("currentYear")
};

/* =========================================
   HELPERS
========================================= */

function normalizeText(value = "") {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function getContentType(item) {
    return item._contentType || item.content_type || "movie";
}

function getContentUrl(item) {
    const type = getContentType(item) === "series" ? "series" : "movie";

    // Legacy watch navigation uses the original primary key for both tables.
    const id = item.id;

    if (id == null) return "genre.html";

    return `watch.html?id=${encodeURIComponent(id)}&type=${type}`;
}

function getTitle(item) {
    return item.title || item.name || "Untitled";
}

function getRating(item) {
    const value = Number(
        item.vote_average ??
        item.rating ??
        item.tmdb_rating ??
        0
    );

    return Number.isFinite(value) ? value : 0;
}

function getViews(item) {
    const value = Number(item.views ?? item.view_count ?? 0);
    return Number.isFinite(value) ? value : 0;
}

function getReleaseYear(item) {
    const date =
        item.release_date ||
        item.first_air_date ||
        item.year ||
        item.created_at;

    if (!date) return "";

    const match = String(date).match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : "";
}

function getLatestDate(item) {
    const date =
        getContentType(item) === "series"
            ? item.last_activity_at || item.created_at || item.release_date
            : item.created_at || item.release_date;

    const timestamp = date ? new Date(date).getTime() : 0;

    return Number.isFinite(timestamp) ? timestamp : 0;
}

function getPoster(item) {
    const poster =
        item.poster_path ||
        item.poster_url ||
        item.poster ||
        item.thumbnail ||
        item.image ||
        "";

    if (!poster) return GENRE_CONFIG.fallbackPoster;

    const value = String(poster).trim();

    if (/^https?:\/\//i.test(value)) {
        return value;
    }

    if (value.startsWith("/assets/") || value.startsWith("assets/")) {
        return value.startsWith("/") ? value : `/${value}`;
    }

    if (value.startsWith("/")) {
        return `https://image.tmdb.org/t/p/w500${value}`;
    }

    return value;
}

function parseGenreValues(value) {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value.flatMap((entry) => {
            if (typeof entry === "string") {
                return entry.split(",").map((part) => part.trim()).filter(Boolean);
            }

            if (entry && typeof entry === "object") {
                const name = entry.name || entry.title || entry.genre;
                return name ? [String(name)] : [];
            }

            return [];
        });
    }

    if (typeof value === "string") {
        const trimmed = value.trim();

        if (!trimmed) return [];

        // Support JSON arrays stored as text.
        if (
            (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
            (trimmed.startsWith("{") && trimmed.endsWith("}"))
        ) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed !== value) return parseGenreValues(parsed);
            } catch {
                // Continue as a normal text value.
            }
        }

        return trimmed
            .split(/[,|]/)
            .map((part) => part.trim())
            .filter(Boolean);
    }

    return [];
}

function getItemGenres(item) {
    const values = [
        ...parseGenreValues(item.genres),
        ...parseGenreValues(item.genre),
        ...parseGenreValues(item.category)
    ];

    return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function matchesGenre(item, requestedGenre) {
    if (!requestedGenre) return true;

    const genres = getItemGenres(item);

    const aliases = {
        "high-school": ["highschool", "high-school", "school"],
        highschool: ["highschool", "high-school", "school"],
        "sci-fi": ["sci-fi", "science-fiction", "scifi"],
        scifi: ["sci-fi", "science-fiction", "scifi"],
        animation: ["animation", "animated"],
        romance: ["romance", "erotic"],
        erotic: ["erotic", "romance"]
    };

    const accepted = aliases[requestedGenre] || [requestedGenre];

    return genres.some((genre) =>
        accepted.some((alias) =>
            genre === alias ||
            genre.includes(alias) ||
            alias.includes(genre)
        )
    );
}

/* =========================================
   URL STATE
========================================= */

function readUrlState() {
    const params = new URLSearchParams(window.location.search);

    const requestedType = params.get("type") || "all";
    state.type = ["all", "movie", "series"].includes(requestedType)
        ? requestedType
        : "all";

    state.genre = normalizeText(params.get("genre") || "");

    const requestedSort = params.get("sort") || "latest";

    const sortAliases = {
        trending: "popular",
        "top-rated": "rating",
        newest: "latest"
    };

    const normalizedSort = sortAliases[requestedSort] || requestedSort;

    state.sort = ["latest", "rating", "popular", "title"].includes(normalizedSort)
        ? normalizedSort
        : "latest";

    state.search = params.get("search") || "";

    const requestedPage = Number.parseInt(params.get("page") || "1", 10);
    state.currentPage = Number.isFinite(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    elements.contentFilter.value = state.type;
    elements.sortFilter.value = state.sort;
    elements.search.value = state.search;
}

function updateUrl() {
    const params = new URLSearchParams();

    if (state.type !== "all") {
        params.set("type", state.type);
    }

    if (state.genre) {
        params.set("genre", state.genre);
    }

    if (state.sort !== "latest") {
        params.set("sort", state.sort);
    }

    if (state.search.trim()) {
        params.set("search", state.search.trim());
    }

    if (state.currentPage > 1) {
        params.set("page", String(state.currentPage));
    }

    const query = params.toString();
    const newUrl = query
        ? `${window.location.pathname}?${query}`
        : window.location.pathname;

    window.history.replaceState({}, "", newUrl);
}

/* =========================================
   FETCH CONTENT
========================================= */

async function fetchTable(tableName, contentType) {
    const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("is_active", true);

    if (error) {
        throw new Error(`${tableName}: ${error.message}`);
    }

    return (data || []).map((item) => ({
        ...item,
        _contentType: contentType
    }));
}

async function loadContent() {
    if (state.loading) return;

    state.loading = true;
    showLoading();

    try {
        const [movies, series] = await Promise.all([
            fetchTable(GENRE_CONFIG.moviesTable, "movie"),
            fetchTable(GENRE_CONFIG.seriesTable, "series")
        ]);

        state.allContent = [...movies, ...series];

        applyFilters();
        updatePageHeader();
    } catch (error) {
        console.error("CINEVA genre loading error:", error);

        elements.loading.hidden = true;
        elements.grid.replaceChildren();
        elements.pagination.replaceChildren();
        elements.empty.hidden = true;
        elements.error.hidden = false;

        elements.errorText.textContent =
            error.message || "Please check your connection and try again.";
    } finally {
        state.loading = false;
    }
}
const pageLoader = document.getElementById("pageLoader");

if (pageLoader) {
    pageLoader.style.opacity = "0";
    pageLoader.style.pointerEvents = "none";

    setTimeout(() => {
        pageLoader.style.display = "none";
    }, 350);
}
/* =========================================
   FILTERING AND SORTING
========================================= */

function applyFilters() {
    let result = [...state.allContent];

    // Movie / series filter
    if (state.type !== "all") {
        result = result.filter(
            (item) => getContentType(item) === state.type
        );
    }

    // Genre filter
    if (state.genre) {
        result = result.filter(
            (item) => matchesGenre(item, state.genre)
        );
    }

    // Search filter
    const searchTerm = normalizeText(state.search);

    if (searchTerm) {
        result = result.filter((item) => {
            const searchable = [
                getTitle(item),
                item.overview,
                item.description,
                item.translator,
                item.category,
                ...parseGenreValues(item.genres),
                ...parseGenreValues(item.genre)
            ]
                .filter(Boolean)
                .join(" ");

            return normalizeText(searchable).includes(searchTerm);
        });
    }

    // Sorting
    switch (state.sort) {
        case "rating":
            result.sort((a, b) => getRating(b) - getRating(a));
            break;

        case "popular":
            result.sort((a, b) => getViews(b) - getViews(a));
            break;

        case "title":
            result.sort((a, b) =>
                getTitle(a).localeCompare(getTitle(b), undefined, {
                    sensitivity: "base"
                })
            );
            break;

        case "latest":
        default:
            result.sort((a, b) => getLatestDate(b) - getLatestDate(a));
            break;
    }

    state.content = result;

    const totalPages = Math.max(
        1,
        Math.ceil(result.length / GENRE_CONFIG.pageSize)
    );

    state.currentPage = Math.min(state.currentPage, totalPages);

    renderResults();
    updateActiveFilters();
    updateUrl();
}

/* =========================================
   PAGE HEADER
========================================= */

function titleCase(value) {
    return String(value)
        .split(/[-\s]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function updatePageHeader() {
    let title = "Explore CINEVA";
    let description =
        "Discover movies and series, explore different genres and find your next favorite story.";

    if (state.genre) {
        title = `${titleCase(state.genre)} Collection`;
        description =
            `Explore ${titleCase(state.genre)} movies and series selected for your entertainment.`;
    } else if (state.type === "movie") {
        title = "Explore Movies";
        description = "Discover movies across different genres and stories.";
    } else if (state.type === "series") {
        title = "Explore TV Series";
        description = "Find your next favorite series and follow every story.";
    }

    if (state.sort === "rating") {
        title = state.genre
            ? `Top Rated ${titleCase(state.genre)}`
            : "Top Rated Collection";
        description = "Explore the highest-rated titles in the CINEVA collection.";
    } else if (state.sort === "popular") {
        title = "Trending Collection";
        description = "Explore the most viewed movies and series on CINEVA.";
    } else if (state.sort === "latest" && !state.genre && state.type === "all") {
        title = "Latest Added";
        description = "Discover the newest movies and series added to CINEVA.";
    }

    elements.pageTitle.textContent = title;
    elements.pageDescription.textContent = description;
    elements.resultsHeading.textContent = title;
    document.title = `${title} | CINEVA`;
}

/* =========================================
   RENDER RESULTS
========================================= */

function showLoading() {
    elements.loading.hidden = false;
    elements.grid.replaceChildren();
    elements.empty.hidden = true;
    elements.error.hidden = true;
    elements.pagination.replaceChildren();
    elements.activeFilters.hidden = true;
}

function renderResults() {
    elements.loading.hidden = true;
    elements.error.hidden = true;

    const total = state.content.length;
    const totalPages = Math.max(
        1,
        Math.ceil(total / GENRE_CONFIG.pageSize)
    );

    const start = (state.currentPage - 1) * GENRE_CONFIG.pageSize;
    const pageItems = state.content.slice(
        start,
        start + GENRE_CONFIG.pageSize
    );

    elements.resultsCount.textContent = total.toLocaleString();
    elements.resultsStatus.textContent = total
        ? `Showing ${start + 1}–${Math.min(start + pageItems.length, total)} of ${total} titles`
        : "No matching titles";

    elements.pageIndicator.textContent = total
        ? `Page ${state.currentPage} of ${totalPages}`
        : "";

    elements.clearSearch.hidden = !state.search;

    elements.grid.replaceChildren();

    if (!pageItems.length) {
        elements.empty.hidden = false;
        elements.pagination.replaceChildren();
        return;
    }

    elements.empty.hidden = true;

    const fragment = document.createDocumentFragment();

    pageItems.forEach((item) => {
        fragment.appendChild(createMovieCard(item));
    });

    elements.grid.appendChild(fragment);

    renderPagination(totalPages);
}

/* =========================================
   SAFE CARD CREATION
========================================= */

function createMovieCard(item) {
    const type = getContentType(item);
    const title = getTitle(item);
    const rating = getRating(item);
    const year = getReleaseYear(item);
    const poster = getPoster(item);

    const card = document.createElement("article");
    card.className = "movie-card genre-movie-card";

    const link = document.createElement("a");
    link.className = "movie-card-link";
    link.href = getContentUrl(item);
    link.setAttribute("aria-label", `Watch ${title}`);

    const posterWrap = document.createElement("div");
    posterWrap.className = "movie-poster";

    const image = document.createElement("img");
    image.src = poster;
    image.alt = title;
    image.loading = "lazy";
    image.decoding = "async";
    image.onerror = () => {
        image.onerror = null;
        image.src = GENRE_CONFIG.fallbackPoster;
    };

    const typeBadge = document.createElement("span");
    typeBadge.className = "movie-type-badge";
    typeBadge.textContent = type === "series" ? "SERIES" : "MOVIE";

    const newEpisodeBadge = type === "series" && item.last_activity_at &&
        Date.now() - new Date(item.last_activity_at).getTime() <= 7 * 24 * 60 * 60 * 1000
        ? Object.assign(document.createElement("span"), {
            className: "movie-new-episode-badge",
            textContent: "NEW EP",
            ariaLabel: "New episode added"
        })
        : null;

    const overlay = document.createElement("div");
    overlay.className = "movie-card-overlay";

    const playIcon = document.createElement("span");
    playIcon.className = "movie-play-icon";

    const play = document.createElement("i");
    play.className = "fa-solid fa-play";
    playIcon.appendChild(play);
    overlay.appendChild(playIcon);

    const translatorName = String(item.translator || "").trim();
    if (translatorName) {
        const translatorBadge = document.createElement("span");
        translatorBadge.className = "movie-translator-badge";
        translatorBadge.title = `Translated by ${translatorName}`;

        const translatorIcon = document.createElement("i");
        translatorIcon.className = "fa-solid fa-language";

        const translatorText = document.createElement("span");
        translatorText.textContent = translatorName;

        translatorBadge.append(translatorIcon, translatorText);
        posterWrap.append(image, typeBadge);
        if (newEpisodeBadge) posterWrap.appendChild(newEpisodeBadge);
        posterWrap.append(translatorBadge, overlay);
    } else {
        posterWrap.append(image, typeBadge);
        if (newEpisodeBadge) posterWrap.appendChild(newEpisodeBadge);
        posterWrap.appendChild(overlay);
    }

    const info = document.createElement("div");
    info.className = "movie-info";

    const heading = document.createElement("h3");
    heading.className = "movie-title";
    heading.textContent = title;
    heading.title = title;

    const meta = document.createElement("div");
    meta.className = "movie-meta";

    if (year) {
        const yearText = document.createElement("span");
        yearText.textContent = year;
        meta.appendChild(yearText);
    }

    if (rating > 0) {
        const ratingText = document.createElement("span");
        ratingText.className = "movie-rating";

        const star = document.createElement("i");
        star.className = "fa-solid fa-star";

        const score = document.createElement("span");
        score.textContent = rating.toFixed(1);

        ratingText.append(star, score);
        meta.appendChild(ratingText);
    }

    if (item.translator) {
        const translator = document.createElement("span");
        translator.className = "movie-translator";
        translator.textContent = String(item.translator);
        meta.appendChild(translator);
    }

    info.append(heading, meta);
    link.append(posterWrap, info);

    card.appendChild(link);

    return card;
}

/* =========================================
   PAGINATION
========================================= */

function createPageButton(label, page, options = {}) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "genre-page-btn";
    button.textContent = label;
    button.disabled = Boolean(options.disabled);

    if (options.active) {
        button.classList.add("active");
        button.setAttribute("aria-current", "page");
    }

    button.addEventListener("click", () => {
        if (page === state.currentPage || button.disabled) return;

        state.currentPage = page;
        renderResults();
        updateUrl();

        document.getElementById("genreContent").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });

    return button;
}

function renderPagination(totalPages) {
    elements.pagination.replaceChildren();

    if (totalPages <= 1) return;

    elements.pagination.appendChild(
        createPageButton("‹", state.currentPage - 1, {
            disabled: state.currentPage === 1
        })
    );

    const pages = new Set([
        1,
        totalPages,
        state.currentPage,
        state.currentPage - 1,
        state.currentPage + 1
    ]);

    const sortedPages = [...pages]
        .filter((page) => page >= 1 && page <= totalPages)
        .sort((a, b) => a - b);

    let previous = 0;

    sortedPages.forEach((page) => {
        if (previous && page - previous > 1) {
            const dots = document.createElement("span");
            dots.className = "genre-page-dots";
            dots.textContent = "…";
            elements.pagination.appendChild(dots);
        }

        elements.pagination.appendChild(
            createPageButton(String(page), page, {
                active: page === state.currentPage
            })
        );

        previous = page;
    });

    elements.pagination.appendChild(
        createPageButton("›", state.currentPage + 1, {
            disabled: state.currentPage === totalPages
        })
    );
}

/* =========================================
   ACTIVE FILTER DISPLAY
========================================= */

function updateActiveFilters() {
    elements.activeFilters.replaceChildren();

    const filters = [];

    if (state.genre) {
        filters.push(`Genre: ${titleCase(state.genre)}`);
    }

    if (state.type !== "all") {
        filters.push(`Type: ${state.type === "movie" ? "Movies" : "Series"}`);
    }

    if (state.search.trim()) {
        filters.push(`Search: ${state.search.trim()}`);
    }

    if (state.sort !== "latest") {
        const labels = {
            rating: "Top rated",
            popular: "Most viewed",
            title: "A – Z"
        };

        filters.push(`Sort: ${labels[state.sort] || state.sort}`);
    }

    if (!filters.length) {
        elements.activeFilters.hidden = true;
        return;
    }

    elements.activeFilters.hidden = false;

    filters.forEach((label) => {
        const chip = document.createElement("span");
        chip.className = "genre-filter-chip";

        const icon = document.createElement("i");
        icon.className = "fa-solid fa-filter";

        chip.append(icon, document.createTextNode(label));
        elements.activeFilters.appendChild(chip);
    });
}

/* =========================================
   RESET
========================================= */

function resetFilters() {
    state.type = "all";
    state.genre = "";
    state.sort = "latest";
    state.search = "";
    state.currentPage = 1;

    elements.contentFilter.value = "all";
    elements.sortFilter.value = "latest";
    elements.search.value = "";

    updatePageHeader();
    applyFilters();
}

/* =========================================
   EVENTS
========================================= */

function bindEvents() {
    const backButton = document.getElementById("genreBackButton");
    backButton?.addEventListener("click", () => {
        if (window.history.length > 1 && document.referrer) {
            window.history.back();
        } else {
            window.location.href = "index.html";
        }
    });

    elements.contentFilter.addEventListener("change", () => {
        state.type = elements.contentFilter.value;
        state.currentPage = 1;
        updatePageHeader();
        applyFilters();
    });

    elements.sortFilter.addEventListener("change", () => {
        state.sort = elements.sortFilter.value;
        state.currentPage = 1;
        updatePageHeader();
        applyFilters();
    });

    elements.search.addEventListener("input", () => {
        state.search = elements.search.value;
        state.currentPage = 1;
        applyFilters();
    });

    elements.clearSearch.addEventListener("click", () => {
        elements.search.value = "";
        state.search = "";
        state.currentPage = 1;
        applyFilters();
        elements.search.focus();
    });

    elements.resetButton.addEventListener("click", resetFilters);
    elements.emptyReset.addEventListener("click", resetFilters);

    elements.retryButton.addEventListener("click", () => {
        loadContent();
    });

    // Keep the homepage search system compatible with this page.
    const siteSearch = document.getElementById("search-form");

    if (siteSearch) {
        siteSearch.addEventListener("submit", (event) => {
            event.preventDefault();

            const input = document.getElementById("search-input");
            const value = input?.value?.trim();

            if (!value) return;

            state.search = value;
            state.currentPage = 1;
            elements.search.value = value;

            applyFilters();

            document.getElementById("genreContent").scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    }
}

/* =========================================
   INITIALIZE
========================================= */

function initializeGenrePage() {
    if (!elements.grid) {
        console.error("CINEVA: genre grid was not found.");
        return;
    }

    if (elements.footerYear) {
        elements.footerYear.textContent = new Date().getFullYear();
    }

    readUrlState();
    bindEvents();
    updatePageHeader();
    loadContent();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeGenrePage, {
        once: true
    });
} else {
    initializeGenrePage();
}
