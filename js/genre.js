
/* =========================================================
   CINEVA PRO — PREMIUM DISCOVERY CONTROLLER
   File: js/genre.js

   Performance upgrades:
   - Uses the cineva_discovery Supabase view
   - Server-side filtering and sorting
   - Server-side pagination (10 records per request)
   - Exact result count
   - Debounced search
   - Prevents outdated requests overwriting newer results
   - Reduced database payload
   - Lazy-loaded posters
   - Preserves existing URL parameters and watch links
========================================================= */

import { supabase } from "./config.js";

/* =========================================
   CONFIGURATION
========================================= */

const GENRE_CONFIG = {
    table: "cineva_discovery",
    pageSize: 10,

    // Only fetch fields needed by discovery cards.
    selectFields: [
        "id",
        "content_type",
        "title",
        "category",
        "genres_text",
        "translator",
        "overview",
        "poster_path",
        "poster",
        "thumbnail",
        "image",
        "release_date",
        "first_air_date",
        "year",
        "created_at",
        "updated_at",
        "activity_at",
        "views",
        "rating",
        "popularity",
        "is_active"
    ].join(","),

    fallbackPoster:
        "https://placehold.co/400x600/151522/ffffff?text=CINEVA",

    searchDelay: 300
};

/* =========================================
   STATE
========================================= */

const state = {
    content: [],
    totalCount: 0,

    type: "all",
    genre: "",
    sort: "latest",
    search: "",

    currentPage: 1,
    loading: false,
    requestId: 0
};

let searchTimer = null;

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

    footerYear: document.getElementById("currentYear"),

    pageLoader: document.getElementById("pageLoader"),
    genreContent: document.getElementById("genreContent")
};

/* =========================================
   GENERAL HELPERS
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
    return item.content_type || "movie";
}

function getTitle(item) {
    return item.title || "Untitled";
}

function getRating(item) {
    const value = Number(item.rating ?? 0);

    return Number.isFinite(value) ? value : 0;
}

function getReleaseYear(item) {
    const value =
        item.release_date ||
        item.first_air_date ||
        item.year ||
        item.created_at;

    if (!value) return "";

    const match = String(value).match(/\b(19|20)\d{2}\b/);

    return match ? match[0] : "";
}

/* =========================================
   POSTER HANDLING
========================================= */

function getPoster(item) {
    const poster =
        item.poster_path ||
        item.poster ||
        item.thumbnail ||
        item.image ||
        "";

    if (!poster) {
        return GENRE_CONFIG.fallbackPoster;
    }

    const value = String(poster).trim();

    if (/^https?:\/\//i.test(value)) {
        return value;
    }

    if (
        value.startsWith("/assets/") ||
        value.startsWith("assets/")
    ) {
        return value.startsWith("/")
            ? value
            : `/${value}`;
    }

    if (value.startsWith("/")) {
        return `https://image.tmdb.org/t/p/w500${value}`;
    }

    return value;
}

/* =========================================
   FILTER SANITIZATION

   Prevents user-entered search text from
   breaking PostgREST .or() filter syntax.
========================================= */

function sanitizeFilterValue(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
}

/* =========================================
   GENRE ALIASES
========================================= */

function getGenreAliases(genre) {
    const aliases = {
        "high-school": [
            "highschool",
            "high-school",
            "school"
        ],

        highschool: [
            "highschool",
            "high-school",
            "school"
        ],

        "sci-fi": [
            "sci-fi",
            "science-fiction",
            "scifi"
        ],

        scifi: [
            "sci-fi",
            "science-fiction",
            "scifi"
        ],

        animation: [
            "animation",
            "animated"
        ],

        romance: [
            "romance",
            "erotic"
        ],

        erotic: [
            "erotic",
            "romance"
        ]
    };

    return aliases[genre] || [genre];
}

/* =========================================
   URL STATE
========================================= */

function readUrlState() {
    const params = new URLSearchParams(
        window.location.search
    );

    const requestedType =
        params.get("type") || "all";

    state.type = [
        "all",
        "movie",
        "series"
    ].includes(requestedType)
        ? requestedType
        : "all";

    state.genre = normalizeText(
        params.get("genre") || ""
    );

    const requestedSort =
        params.get("sort") || "latest";

    const sortAliases = {
        trending: "popular",
        "top-rated": "rating",
        newest: "latest"
    };

    const normalizedSort =
        sortAliases[requestedSort] || requestedSort;

    state.sort = [
        "latest",
        "rating",
        "popular",
        "title"
    ].includes(normalizedSort)
        ? normalizedSort
        : "latest";

    state.search = params.get("search") || "";

    const requestedPage = Number.parseInt(
        params.get("page") || "1",
        10
    );

    state.currentPage =
        Number.isFinite(requestedPage) &&
        requestedPage > 0
            ? requestedPage
            : 1;

    if (elements.contentFilter) {
        elements.contentFilter.value = state.type;
    }

    if (elements.sortFilter) {
        elements.sortFilter.value = state.sort;
    }

    if (elements.search) {
        elements.search.value = state.search;
    }
}
function updateUrl() {
    const params = new URLSearchParams(
        window.location.search
    );

    // Update CINEVA discovery parameters.
    const values = {
        type: state.type === "all" ? "" : state.type,
        genre: state.genre,
        sort: state.sort === "latest" ? "" : state.sort,
        search: state.search.trim(),
        page: state.currentPage > 1
            ? String(state.currentPage)
            : ""
    };

    Object.entries(values).forEach(([key, value]) => {
        if (value) {
            params.set(key, value);
        } else {
            params.delete(key);
        }
    });

    const query = params.toString();

    const newUrl = query
        ? `${window.location.pathname}?${query}`
        : window.location.pathname;

    window.history.replaceState({}, "", newUrl);
}
/* =========================================
   PAGE HEADER
========================================= */

function titleCase(value) {
    return String(value)
        .split(/[-\s]+/)
        .filter(Boolean)
        .map((word) =>
            word.charAt(0).toUpperCase() +
            word.slice(1)
        )
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

        description =
            "Discover movies across different genres and stories.";
    } else if (state.type === "series") {
        title = "Explore TV Series";

        description =
            "Find your next favorite series and follow every story.";
    }

    if (state.sort === "rating") {
        title = state.genre
            ? `Top Rated ${titleCase(state.genre)}`
            : "Top Rated Collection";

        description =
            "Explore the highest-rated titles in the CINEVA collection.";
    } else if (state.sort === "popular") {
        title = "Trending Collection";

        description =
            "Explore the most viewed movies and series on CINEVA.";
    } else if (
        state.sort === "latest" &&
        !state.genre &&
        state.type === "all"
    ) {
        title = "Latest Added";

        description =
            "Discover the newest movies and series added to CINEVA.";
    }

    if (elements.pageTitle) {
        elements.pageTitle.textContent = title;
    }

    if (elements.pageDescription) {
        elements.pageDescription.textContent = description;
    }

    if (elements.resultsHeading) {
        elements.resultsHeading.textContent = title;
    }

    document.title = `${title} | CINEVA`;
}

/* =========================================
   DATABASE QUERY BUILDER
========================================= */

function buildDiscoveryQuery() {
    let query = supabase
        .from(GENRE_CONFIG.table)
        .select(
            GENRE_CONFIG.selectFields,
            { count: "exact" }
        )
        .eq("is_active", true);

    // Movie / series filter
    if (state.type !== "all") {
        query = query.eq(
            "content_type",
            state.type
        );
    }

    // Genre filter
    if (state.genre) {
        const aliases = getGenreAliases(
            state.genre
        );

        const genreFilters = aliases
            .map((alias) => sanitizeFilterValue(alias))
            .filter(Boolean);

        if (genreFilters.length) {
            const conditions = genreFilters.flatMap(
                (genre) => [
                    `category.ilike.%${genre}%`,
                    `genres_text.ilike.%${genre}%`
                ]
            );

            query = query.or(
                conditions.join(",")
            );
        }
    }

    // Search filter
    const searchTerm = sanitizeFilterValue(
        state.search
    );

    if (searchTerm) {
        const searchFields = [
            "title",
            "overview",
            "translator",
            "category",
            "genres_text"
        ];

        const conditions = searchFields.map(
            (field) =>
                `${field}.ilike.%${searchTerm}%`
        );

        query = query.or(
            conditions.join(",")
        );
    }

    // Server-side sorting
    switch (state.sort) {
        case "rating":
            query = query
                .order("rating", {
                    ascending: false,
                    nullsFirst: false
                })
                .order("created_at", {
                    ascending: false,
                    nullsFirst: false
                });
            break;

        case "popular":
            query = query
                .order("views", {
                    ascending: false,
                    nullsFirst: false
                })
                .order("created_at", {
                    ascending: false,
                    nullsFirst: false
                });
            break;

        case "title":
            query = query
                .order("title", {
                    ascending: true,
                    nullsFirst: false
                });
            break;

        case "latest":
        default:
            query = query
                .order("activity_at", {
                    ascending: false,
                    nullsFirst: false
                })
                .order("created_at", {
                    ascending: false,
                    nullsFirst: false
                });
            break;
    }

    return query;
}

/* =========================================
   LOADING UI
========================================= */

function showLoading() {
    state.loading = true;

    if (elements.loading) {
        elements.loading.hidden = false;
    }

    if (elements.grid) {
        elements.grid.replaceChildren();
        elements.grid.setAttribute(
            "aria-busy",
            "true"
        );
    }

    if (elements.empty) {
        elements.empty.hidden = true;
    }

    if (elements.error) {
        elements.error.hidden = true;
    }

    if (elements.pagination) {
        elements.pagination.replaceChildren();
    }

    if (elements.activeFilters) {
        elements.activeFilters.hidden = true;
    }
}

function hidePageLoader() {
    if (!elements.pageLoader) return;

    elements.pageLoader.style.opacity = "0";
    elements.pageLoader.style.pointerEvents = "none";
    elements.pageLoader.style.display = "none";
    elements.pageLoader.hidden = true;
}

function showError(error) {
    if (elements.loading) {
        elements.loading.hidden = true;
    }

    if (elements.grid) {
        elements.grid.replaceChildren();
        elements.grid.setAttribute(
            "aria-busy",
            "false"
        );
    }

    if (elements.empty) {
        elements.empty.hidden = true;
    }

    if (elements.pagination) {
        elements.pagination.replaceChildren();
    }

    if (elements.error) {
        elements.error.hidden = false;
    }

    if (elements.errorText) {
        elements.errorText.textContent =
            error?.message ||
            "Please check your connection and try again.";
    }
}

/* =========================================
   LOAD DISCOVERY CONTENT

   Each request loads only one page.
   Old requests are ignored if a newer
   request has already started.
========================================= */

async function loadContent() {
    const requestId = ++state.requestId;

    showLoading();
    updateUrl();

    try {
        const start =
            (state.currentPage - 1) *
            GENRE_CONFIG.pageSize;

        const end =
            start + GENRE_CONFIG.pageSize - 1;

        let query = buildDiscoveryQuery();

        let response = await query.range(
            start,
            end
        );

        if (response.error) {
            throw response.error;
        }

        // Ignore outdated requests.
        if (requestId !== state.requestId) {
            return;
        }

        const total = response.count || 0;

        const totalPages = Math.max(
            1,
            Math.ceil(
                total / GENRE_CONFIG.pageSize
            )
        );

        // If the URL requested a page that no
        // longer exists, move to the last page.
        if (
            total > 0 &&
            state.currentPage > totalPages
        ) {
            state.currentPage = totalPages;

            const correctedStart =
                (state.currentPage - 1) *
                GENRE_CONFIG.pageSize;

            const correctedEnd =
                correctedStart +
                GENRE_CONFIG.pageSize - 1;

            response = await buildDiscoveryQuery()
                .range(
                    correctedStart,
                    correctedEnd
                );

            if (response.error) {
                throw response.error;
            }

            if (requestId !== state.requestId) {
                return;
            }
        }

        state.content = response.data || [];
        state.totalCount = response.count || 0;

        updatePageHeader();
        renderResults();
        updateActiveFilters();
        updateUrl();

    } catch (error) {
        if (requestId !== state.requestId) {
            return;
        }

        console.error(
            "CINEVA discovery error:",
            error
        );

        showError(error);

    } finally {
        if (requestId === state.requestId) {
            state.loading = false;

            hidePageLoader();

            if (elements.grid) {
                elements.grid.setAttribute(
                    "aria-busy",
                    "false"
                );
            }
        }
    }
}

/* =========================================
   RENDER RESULTS
========================================= */

function renderResults() {
    const total = state.totalCount;

    const totalPages = Math.max(
        1,
        Math.ceil(
            total / GENRE_CONFIG.pageSize
        )
    );

    const start =
        total > 0
            ? (state.currentPage - 1) *
              GENRE_CONFIG.pageSize
            : 0;

    const end = Math.min(
        start + state.content.length,
        total
    );

    if (elements.loading) {
        elements.loading.hidden = true;
    }

    if (elements.error) {
        elements.error.hidden = true;
    }

    if (elements.resultsCount) {
        elements.resultsCount.textContent =
            total.toLocaleString();
    }

    if (elements.resultsStatus) {
        elements.resultsStatus.textContent =
            total
                ? `Showing ${start + 1}–${end} of ${total.toLocaleString()} titles`
                : "No matching titles";
    }

    if (elements.pageIndicator) {
        elements.pageIndicator.textContent =
            total
                ? `Page ${state.currentPage} of ${totalPages}`
                : "";
    }

    if (elements.clearSearch) {
        elements.clearSearch.hidden =
            !state.search;
    }

    if (elements.grid) {
        elements.grid.replaceChildren();
    }

    if (!state.content.length) {
        if (elements.empty) {
            elements.empty.hidden = false;
        }

        if (elements.pagination) {
            elements.pagination.replaceChildren();
        }

        return;
    }

    if (elements.empty) {
        elements.empty.hidden = true;
    }

    const fragment =
        document.createDocumentFragment();

    state.content.forEach((item) => {
        fragment.appendChild(
            createMovieCard(item)
        );
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
    card.className =
        "movie-card genre-movie-card";

    const link = document.createElement("a");

    link.className = "movie-card-link";

    link.href =
        `watch.html?id=${encodeURIComponent(item.id)}&type=${encodeURIComponent(type)}`;

    link.setAttribute(
        "aria-label",
        `Watch ${title}`
    );

    const posterWrap =
        document.createElement("div");

    posterWrap.className = "movie-poster";

    const image = document.createElement("img");

    image.src = poster;
    image.alt = title;
    image.loading = "lazy";
    image.decoding = "async";
    image.fetchPriority = "low";

    image.onerror = () => {
        image.onerror = null;
        image.src = GENRE_CONFIG.fallbackPoster;
    };

    const typeBadge =
        document.createElement("span");

    typeBadge.className = "movie-type-badge";

    typeBadge.textContent =
        type === "series" ? "SERIES" : "MOVIE";

    const overlay =
        document.createElement("div");

    overlay.className = "movie-card-overlay";

    const playIcon =
        document.createElement("span");

    playIcon.className = "movie-play-icon";

    const play = document.createElement("i");

    play.className = "fa-solid fa-play";

    playIcon.appendChild(play);
    overlay.appendChild(playIcon);

    posterWrap.append(
        image,
        typeBadge,
        overlay
    );

    const info = document.createElement("div");
    info.className = "movie-info";

    const heading = document.createElement("h3");

    heading.className = "movie-title";
    heading.textContent = title;
    heading.title = title;

    const meta = document.createElement("div");
    meta.className = "movie-meta";

    if (year) {
        const yearText =
            document.createElement("span");

        yearText.textContent = year;
        meta.appendChild(yearText);
    }

    if (rating > 0) {
        const ratingText =
            document.createElement("span");

        ratingText.className = "movie-rating";

        const star = document.createElement("i");
        star.className = "fa-solid fa-star";

        const score =
            document.createElement("span");

        score.textContent = rating.toFixed(1);

        ratingText.append(star, score);
        meta.appendChild(ratingText);
    }

    if (item.translator) {
        const translator =
            document.createElement("span");

        translator.className = "movie-translator";

        translator.textContent =
            String(item.translator);

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

function createPageButton(
    label,
    page,
    options = {}
) {
    const button =
        document.createElement("button");

    button.type = "button";
    button.className = "genre-page-btn";
    button.textContent = label;

    button.disabled =
        Boolean(options.disabled);

    if (options.active) {
        button.classList.add("active");

        button.setAttribute(
            "aria-current",
            "page"
        );
    }

    button.setAttribute(
        "aria-label",
        options.label ||
        `Go to page ${page}`
    );

    button.addEventListener("click", () => {
        if (
            page === state.currentPage ||
            button.disabled ||
            page < 1
        ) {
            return;
        }

        state.currentPage = page;

        loadContent();

        elements.genreContent?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });

    return button;
}

function renderPagination(totalPages) {
    if (!elements.pagination) return;

    elements.pagination.replaceChildren();

    if (totalPages <= 1) return;

    elements.pagination.appendChild(
        createPageButton(
            "‹",
            state.currentPage - 1,
            {
                disabled: state.currentPage === 1,
                label: "Previous page"
            }
        )
    );

    const pages = new Set([
        1,
        totalPages,
        state.currentPage,
        state.currentPage - 1,
        state.currentPage + 1
    ]);

    const sortedPages = [...pages]
        .filter(
            (page) =>
                page >= 1 &&
                page <= totalPages
        )
        .sort((a, b) => a - b);

    let previous = 0;

    sortedPages.forEach((page) => {
        if (
            previous &&
            page - previous > 1
        ) {
            const dots =
                document.createElement("span");

            dots.className = "genre-page-dots";
            dots.textContent = "…";

            elements.pagination.appendChild(dots);
        }

        elements.pagination.appendChild(
            createPageButton(
                String(page),
                page,
                {
                    active:
                        page === state.currentPage
                }
            )
        );

        previous = page;
    });

    elements.pagination.appendChild(
        createPageButton(
            "›",
            state.currentPage + 1,
            {
                disabled:
                    state.currentPage === totalPages,
                label: "Next page"
            }
        )
    );
}

/* =========================================
   ACTIVE FILTER DISPLAY
========================================= */

function updateActiveFilters() {
    if (!elements.activeFilters) return;

    elements.activeFilters.replaceChildren();

    const filters = [];

    if (state.genre) {
        filters.push(
            `Genre: ${titleCase(state.genre)}`
        );
    }

    if (state.type !== "all") {
        filters.push(
            `Type: ${
                state.type === "movie"
                    ? "Movies"
                    : "Series"
            }`
        );
    }

    if (state.search.trim()) {
        filters.push(
            `Search: ${state.search.trim()}`
        );
    }

    if (state.sort !== "latest") {
        const labels = {
            rating: "Top rated",
            popular: "Most viewed",
            title: "A – Z"
        };

        filters.push(
            `Sort: ${labels[state.sort] || state.sort}`
        );
    }

    if (!filters.length) {
        elements.activeFilters.hidden = true;
        return;
    }

    elements.activeFilters.hidden = false;

    filters.forEach((label) => {
        const chip =
            document.createElement("span");

        chip.className = "genre-filter-chip";

        const icon =
            document.createElement("i");

        icon.className =
            "fa-solid fa-filter";

        chip.append(
            icon,
            document.createTextNode(label)
        );

        elements.activeFilters.appendChild(chip);
    });
}

/* =========================================
   RESET FILTERS
========================================= */

function resetFilters() {
    state.type = "all";
    state.genre = "";
    state.sort = "latest";
    state.search = "";
    state.currentPage = 1;

    if (elements.contentFilter) {
        elements.contentFilter.value = "all";
    }

    if (elements.sortFilter) {
        elements.sortFilter.value = "latest";
    }

    if (elements.search) {
        elements.search.value = "";
    }

    clearTimeout(searchTimer);

    updatePageHeader();
    loadContent();
}

/* =========================================
   EVENTS
========================================= */

function bindEvents() {
    elements.contentFilter?.addEventListener(
        "change",
        () => {
            state.type =
                elements.contentFilter.value;

            state.currentPage = 1;

            updatePageHeader();
            loadContent();
        }
    );

    elements.sortFilter?.addEventListener(
        "change",
        () => {
            state.sort =
                elements.sortFilter.value;

            state.currentPage = 1;

            updatePageHeader();
            loadContent();
        }
    );

  
// =========================================================
// CINEVA PRO — PREMIUM DISCOVERY SEARCH HANDLERS
// Debounced search + stale-request protection
// =========================================================

// Search field: wait until the user stops typing.
elements.search?.addEventListener("input", () => {
    state.search = elements.search.value.trim();
    state.currentPage = 1;

    // Invalidate any previous request immediately.
    state.requestId++;

    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
        loadContent();
    }, GENRE_CONFIG.searchDelay);
});


// Clear discovery search.
elements.clearSearch?.addEventListener("click", () => {
    if (elements.search) {
        elements.search.value = "";
        elements.search.focus();
    }

    state.search = "";
    state.currentPage = 1;

    // Prevent an older request from replacing cleared results.
    state.requestId++;

    clearTimeout(searchTimer);
    loadContent();
});


// Reset all discovery filters.
elements.resetButton?.addEventListener(
    "click",
    resetFilters
);

elements.emptyReset?.addEventListener(
    "click",
    resetFilters
);


// Retry loading content after an error.
elements.retryButton?.addEventListener(
    "click",
    () => {
        clearTimeout(searchTimer);
        loadContent();
    }
);
/* =========================================
   INITIALIZATION
========================================= */

function initializeGenrePage() {
    if (!elements.grid) {
        console.error(
            "CINEVA: genre grid was not found."
        );

        hidePageLoader();
        return;
    }

    if (elements.footerYear) {
        elements.footerYear.textContent =
            new Date().getFullYear();
    }

    readUrlState();
    bindEvents();
    updatePageHeader();

    loadContent();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeGenrePage,
        { once: true }
    );
} else {
    initializeGenrePage();
}
