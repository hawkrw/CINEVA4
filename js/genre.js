
import { supabase } from "./config.js";

/* =========================================================
   CINEVA PRO — DISCOVER / GENRE SYSTEM
   Supabase view: cineva_discovery
   Responsive page support: desktop, tablet and mobile
========================================================= */

const GENRE_CONFIG = {
    table: "cineva_discovery",
    pageSize: 10,
    searchDelay: 300,
    placeholder: "assets/images/movie-placeholder.jpg"
};

const state = {
    type: "all",
    genre: "",
    sort: "latest",
    search: "",
    currentPage: 1,
    totalItems: 0,
    totalPages: 1,
    requestId: 0,
    searchTimer: null
};

const elements = {};

const SORT_OPTIONS = {
    latest: { column: "activity_at", ascending: false },
    oldest: { column: "activity_at", ascending: true },
    title: { column: "title", ascending: true },
    rating: { column: "rating", ascending: false },
    popular: { column: "views", ascending: false }
};


/* =========================================================
   HELPERS
========================================================= */

function getElement(id) {
    return document.getElementById(id);
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeType(value) {
    const type = normalizeText(value).toLowerCase();

    if (["movie", "movies", "film"].includes(type)) return "movie";
    if (["series", "tv", "show"].includes(type)) return "series";

    return "all";
}

function getContentType(item) {
    return normalizeType(item.content_type || item.type);
}

function getItemTitle(item) {
    return normalizeText(item.title || item.name || "Untitled");
}

function getItemCategory(item) {
    return normalizeText(item.category || item.genre || "");
}

function getItemYear(item) {
    if (item.year) return String(item.year);

    const date = item.release_date || item.first_air_date;

    if (date) {
        const year = new Date(date).getFullYear();
        if (!Number.isNaN(year)) return String(year);
    }

    return "";
}

function getItemRating(item) {
    const rating = Number(item.rating);

    return Number.isFinite(rating) && rating > 0
        ? rating.toFixed(1)
        : "";
}

function getPosterUrl(item) {
    const candidates = [
        item.poster_path,
        item.poster,
        item.thumbnail,
        item.image
    ];

    const poster = candidates.find(value =>
        typeof value === "string" && value.trim()
    );

    if (!poster) return GENRE_CONFIG.placeholder;

    const value = poster.trim();

    if (/^https?:\/\//i.test(value)) return value;

    if (value.startsWith("//")) return `https:${value}`;

    if (value.startsWith("/")) {
        return `https://image.tmdb.org/t/p/w500${value}`;
    }

    return value;
}

function getWatchUrl(item) {
    const id = item.id;

    if (!id) return "watch.html";

    const type = getContentType(item) === "series"
        ? "series"
        : "movie";

    const params = new URLSearchParams({
        id: String(id),
        type
    });

    return `watch.html?${params.toString()}`;
}

function setHidden(element, hidden) {
    if (element) element.hidden = hidden;
}

function setLoading(isLoading) {
    setHidden(elements.loading, !isLoading);

    if (elements.grid) {
        elements.grid.setAttribute(
            "aria-busy",
            isLoading ? "true" : "false"
        );
    }

    if (isLoading) {
        setHidden(elements.empty, true);
        setHidden(elements.error, true);
    }
}

function setError(message) {
    setLoading(false);
    setHidden(elements.grid, true);
    setHidden(elements.pagination, true);
    setHidden(elements.empty, true);
    setHidden(elements.error, false);

    const paragraph = elements.error?.querySelector("p");

    if (paragraph && message) {
        paragraph.textContent = message;
    }
}

function setEmpty() {
    setLoading(false);
    setHidden(elements.grid, true);
    setHidden(elements.empty, false);
    setHidden(elements.error, true);
    setHidden(elements.pagination, true);
}

function setResultsVisible() {
    setLoading(false);
    setHidden(elements.grid, false);
    setHidden(elements.empty, true);
    setHidden(elements.error, true);
}


/* =========================================================
   URL STATE
========================================================= */

function readUrlState() {
    const params = new URLSearchParams(window.location.search);

    state.type = normalizeType(params.get("type"));
    state.genre = normalizeText(params.get("genre"));
    state.sort = params.get("sort") || "latest";
    state.search = normalizeText(params.get("search"));

    const page = Number.parseInt(params.get("page") || "1", 10);

    state.currentPage = Number.isFinite(page) && page > 0
        ? page
        : 1;

    if (!SORT_OPTIONS[state.sort]) {
        state.sort = "latest";
    }
}

function updateUrl() {
    const params = new URLSearchParams(window.location.search);

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

function syncControlsFromState() {
    if (elements.type) elements.type.value = state.type;
    if (elements.genre) elements.genre.value = state.genre;
    if (elements.sort) elements.sort.value = state.sort;
    if (elements.search) elements.search.value = state.search;

    updateGenreChips();
}


/* =========================================================
   SUPABASE QUERY
========================================================= */

function buildQuery() {
    const from = (state.currentPage - 1) * GENRE_CONFIG.pageSize;
    const to = from + GENRE_CONFIG.pageSize - 1;

    let query = supabase
        .from(GENRE_CONFIG.table)
        .select("*", { count: "exact" });

    // Content type
    if (state.type !== "all") {
        query = query.eq("content_type", state.type);
    }

    // Genre filter
    if (state.genre) {
        const genre = state.genre.replace(/[%_]/g, "");

        query = query.or(
            `category.ilike.%${genre}%,genres_text.ilike.%${genre}%`
        );
    }

    // Search filter
    if (state.search) {
        const search = state.search
            .replace(/[%_]/g, "")
            .replace(/[(),]/g, " ")
            .trim();

        if (search) {
            query = query.or(
                `title.ilike.%${search}%,overview.ilike.%${search}%,translator.ilike.%${search}%`
            );
        }
    }

    // Sorting
    const sort = SORT_OPTIONS[state.sort] || SORT_OPTIONS.latest;

    query = query.order(sort.column, {
        ascending: sort.ascending,
        nullsFirst: false
    });

    // Stable secondary order
    if (sort.column !== "title") {
        query = query.order("title", { ascending: true });
    }

    return query.range(from, to);
}


/* =========================================================
   CARD RENDERING
========================================================= */

function createCard(item) {
    const title = getItemTitle(item);
    const poster = getPosterUrl(item);
    const year = getItemYear(item);
    const rating = getItemRating(item);
    const category = getItemCategory(item);
    const type = getContentType(item);
    const watchUrl = getWatchUrl(item);

    const typeLabel = type === "series" ? "SERIES" : "MOVIE";

    const card = document.createElement("article");
    card.className = "movie-card";

    card.innerHTML = `
        <a
            class="movie-card-link"
            href="${escapeHTML(watchUrl)}"
            aria-label="Watch ${escapeHTML(title)}"
        >
            <div class="movie-poster">
                <img
                    src="${escapeHTML(poster)}"
                    alt="${escapeHTML(title)} poster"
                    loading="lazy"
                    decoding="async"
                >

                <span class="movie-type-badge">
                    ${typeLabel}
                </span>

                ${rating ? `
                    <span class="movie-rating">
                        <i class="fas fa-star"></i>
                        ${escapeHTML(rating)}
                    </span>
                ` : ""}

                <div class="movie-card-overlay">
                    <span class="movie-play-button">
                        <i class="fas fa-play"></i>
                    </span>
                    <span class="movie-watch-label">View Details</span>
                </div>
            </div>

            <div class="movie-info">
                <h3 class="movie-title">
                    ${escapeHTML(title)}
                </h3>

                <div class="movie-meta">
                    ${year ? `<span>${escapeHTML(year)}</span>` : ""}
                    ${year && category ? `<span class="meta-separator">•</span>` : ""}
                    ${category ? `<span>${escapeHTML(category)}</span>` : ""}
                </div>
            </div>
        </a>
    `;

    const image = card.querySelector("img");

    image?.addEventListener("error", () => {
        if (image.src.includes(GENRE_CONFIG.placeholder)) return;
        image.src = GENRE_CONFIG.placeholder;
    }, { once: true });

    return card;
}

function renderCards(items) {
    if (!elements.grid) return;

    elements.grid.replaceChildren();

    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        fragment.appendChild(createCard(item));
    });

    elements.grid.appendChild(fragment);
}


/* =========================================================
   PAGINATION
========================================================= */

function renderPagination() {
    if (!elements.pagination) return;

    const totalPages = Math.max(1, state.totalPages);
    const current = state.currentPage;

    setHidden(elements.pagination, totalPages <= 1);

    if (elements.prevPage) {
        elements.prevPage.disabled = current <= 1;
    }

    if (elements.nextPage) {
        elements.nextPage.disabled = current >= totalPages;
    }

    if (!elements.paginationPages) return;

    elements.paginationPages.replaceChildren();

    let start = Math.max(1, current - 2);
    let end = Math.min(totalPages, current + 2);

    if (current <= 2) {
        end = Math.min(totalPages, 5);
    }

    if (current >= totalPages - 1) {
        start = Math.max(1, totalPages - 4);
    }

    if (start > 1) {
        addPageButton(1);

        if (start > 2) {
            addPageDots();
        }
    }

    for (let page = start; page <= end; page++) {
        addPageButton(page);
    }

    if (end < totalPages) {
        if (end < totalPages - 1) {
            addPageDots();
        }

        addPageButton(totalPages);
    }
}

function addPageButton(page) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "pagination-page";
    button.textContent = String(page);
    button.setAttribute("aria-label", `Go to page ${page}`);

    if (page === state.currentPage) {
        button.classList.add("active");
        button.setAttribute("aria-current", "page");
    }

    button.addEventListener("click", () => {
        if (page === state.currentPage) return;

        state.currentPage = page;
        loadContent();
        scrollToResults();
    });

    elements.paginationPages.appendChild(button);
}

function addPageDots() {
    const dots = document.createElement("span");

    dots.className = "pagination-dots";
    dots.textContent = "…";

    elements.paginationPages.appendChild(dots);
}

function scrollToResults() {
    const target = elements.grid || elements.resultsHeader;

    if (!target) return;

    target.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


/* =========================================================
   FILTER DISPLAY
========================================================= */

function updateGenreChips() {
    if (!elements.genreChips) return;

    elements.genreChips
        .querySelectorAll("[data-genre]")
        .forEach(chip => {
            const active = normalizeText(chip.dataset.genre) === state.genre;

            chip.classList.toggle("active", active);
            chip.setAttribute("aria-pressed", String(active));
        });
}

function updateActiveFilters() {
    if (!elements.activeFilters || !elements.activeFilterTags) return;

    elements.activeFilterTags.replaceChildren();

    const filters = [];

    if (state.type !== "all") {
        filters.push(
            state.type === "movie" ? "Movies" : "Series"
        );
    }

    if (state.genre) filters.push(state.genre);
    if (state.search) filters.push(`Search: ${state.search}`);

    setHidden(elements.activeFilters, filters.length === 0);

    filters.forEach(filter => {
        const tag = document.createElement("span");

        tag.className = "active-filter-tag";
        tag.textContent = filter;

        elements.activeFilterTags.appendChild(tag);
    });
}

function updateHeadings() {
    if (elements.resultsTitle) {
        if (state.genre) {
            elements.resultsTitle.textContent = state.genre;
        } else if (state.type === "movie") {
            elements.resultsTitle.textContent = "Movies";
        } else if (state.type === "series") {
            elements.resultsTitle.textContent = "Series";
        } else {
            elements.resultsTitle.textContent = "All Content";
        }
    }

    if (elements.resultsSubtitle) {
        elements.resultsSubtitle.textContent = state.search
            ? `Search results for "${state.search}"`
            : "Explore the latest movies and series.";
    }

    updateActiveFilters();
    updateGenreChips();
}

function updateResultCount() {
    if (!elements.resultCount) return;

    const total = state.totalItems;

    elements.resultCount.textContent =
        `${total.toLocaleString()} ${total === 1 ? "title" : "titles"} found`;
}


/* =========================================================
   LOAD CONTENT
========================================================= */

async function loadContent() {
    const requestId = ++state.requestId;

    updateUrl();
    updateHeadings();
    setLoading(true);

    try {
        const { data, error, count } = await buildQuery();

        // Ignore stale responses
        if (requestId !== state.requestId) return;

        if (error) throw error;

        const items = Array.isArray(data) ? data : [];

        state.totalItems = count || 0;
        state.totalPages = Math.max(
            1,
            Math.ceil(state.totalItems / GENRE_CONFIG.pageSize)
        );

        // If filters reduce the number of pages, return to a valid page.
        if (state.currentPage > state.totalPages) {
            state.currentPage = state.totalPages;
            updateUrl();
            return loadContent();
        }

        updateResultCount();

        if (!items.length) {
            if (elements.grid) {
                elements.grid.replaceChildren();
            }

            setEmpty();
            return;
        }

        renderCards(items);
        renderPagination();
        setResultsVisible();

    } catch (error) {
        if (requestId !== state.requestId) return;

        console.error("CINEVA Discover error:", error);

        setError(
            "We couldn't load the collection. Please check your connection and try again."
        );
    }
}


/* =========================================================
   FILTER EVENTS
========================================================= */

function resetFilters() {
    clearTimeout(state.searchTimer);

    state.type = "all";
    state.genre = "";
    state.sort = "latest";
    state.search = "";
    state.currentPage = 1;

    syncControlsFromState();
    loadContent();
}

function bindEvents() {

    elements.type?.addEventListener("change", () => {
        state.type = normalizeType(elements.type.value);
        state.currentPage = 1;
        loadContent();
    });

    elements.genre?.addEventListener("change", () => {
        state.genre = normalizeText(elements.genre.value);
        state.currentPage = 1;
        loadContent();
    });

    elements.sort?.addEventListener("change", () => {
        state.sort = SORT_OPTIONS[elements.sort.value]
            ? elements.sort.value
            : "latest";

        state.currentPage = 1;
        loadContent();
    });

    elements.search?.addEventListener("input", () => {
        state.search = normalizeText(elements.search.value);
        state.currentPage = 1;

        // Invalidate an older request immediately.
        state.requestId++;

        clearTimeout(state.searchTimer);

        state.searchTimer = setTimeout(() => {
            loadContent();
        }, GENRE_CONFIG.searchDelay);
    });

    elements.genreChips
        ?.querySelectorAll("[data-genre]")
        .forEach(chip => {
            chip.addEventListener("click", () => {
                state.genre = normalizeText(chip.dataset.genre);
                state.currentPage = 1;

                if (elements.genre) {
                    elements.genre.value = state.genre;
                }

                updateGenreChips();
                loadContent();
            });
        });

    elements.clearFilters?.addEventListener("click", resetFilters);
    elements.clearActiveFilters?.addEventListener("click", resetFilters);
    elements.emptyReset?.addEventListener("click", resetFilters);

    elements.retry?.addEventListener("click", () => {
        loadContent();
    });

    elements.prevPage?.addEventListener("click", () => {
        if (state.currentPage <= 1) return;

        state.currentPage--;
        loadContent();
        scrollToResults();
    });

    elements.nextPage?.addEventListener("click", () => {
        if (state.currentPage >= state.totalPages) return;

        state.currentPage++;
        loadContent();
        scrollToResults();
    });

    // Keep the Discover filters synchronized with browser history.
    window.addEventListener("popstate", () => {
        readUrlState();
        syncControlsFromState();
        loadContent();
    });
}


/* =========================================================
   INITIALIZATION
========================================================= */

function cacheElements() {
    elements.type = getElement("content-type");
    elements.genre = getElement("genre-filter");
    elements.sort = getElement("sort-filter");
    elements.search = getElement("search-input");

    elements.genreChips = getElement("genre-chips");

    elements.grid = getElement("genre-grid");
    elements.loading = getElement("genre-loading");
    elements.empty = getElement("genre-empty");
    elements.error = getElement("genre-error");

    elements.pagination = getElement("genre-pagination");
    elements.paginationPages = getElement("pagination-pages");

    elements.prevPage = getElement("prev-page");
    elements.nextPage = getElement("next-page");

    elements.clearFilters = getElement("clear-filters");
    elements.clearActiveFilters = getElement("clear-active-filters");
    elements.activeFilters = getElement("active-filters");
    elements.activeFilterTags = getElement("active-filter-tags");

    elements.emptyReset = getElement("empty-reset-btn");
    elements.retry = getElement("retry-genre-btn");

    elements.resultCount = getElement("result-count");
    elements.resultsTitle = getElement("results-title");
    elements.resultsSubtitle = getElement("results-subtitle");
    elements.resultsHeader = document.querySelector(".genre-results-header");
}

function initializeGenrePage() {
    cacheElements();

    if (!elements.grid) {
        console.warn("CINEVA: #genre-grid was not found.");
        return;
    }

    readUrlState();
    syncControlsFromState();
    bindEvents();
    loadContent();

    console.info("CINEVA Discover initialized.");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeGenrePage, {
        once: true
    });
} else {
    initializeGenrePage();
}
