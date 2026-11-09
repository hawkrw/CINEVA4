
/* =========================================================
   CINEVA PRO — VIEW ALL CATALOGUE
   File: js/viewall.js

   Features:
   - Loads active movies and series from Supabase
   - Search
   - Movie / Series filtering
   - Category filtering
   - Latest / Oldest / Rating / Views / Title sorting
   - Client-side Load More
   - URL parameter support
   - Responsive catalogue rendering
========================================================= */

import { getAllContent } from "./supabase.js";

/* =========================================================
   CONFIGURATION
========================================================= */

const VIEWALL_CONFIG = {
    pageSize: 24,
    posterFallback: "assets/images/movie-placeholder.jpg",
    tmdbImageBase: "https://image.tmdb.org/t/p/"
};

/* =========================================================
   DOM ELEMENTS
========================================================= */

const elements = {
    pageLoader: document.getElementById("pageLoader"),

    totalMovies: document.getElementById("totalMovies"),
    totalSeries: document.getElementById("totalSeries"),
    totalContent: document.getElementById("totalContent"),

    catalogueTitle: document.getElementById("catalogueTitle"),
    catalogueDescription: document.getElementById("catalogueDescription"),
    resultsCount: document.getElementById("resultsCount"),

    search: document.getElementById("catalogueSearch"),
    clearSearch: document.getElementById("clearSearch"),

    typeFilter: document.getElementById("typeFilter"),
    categoryFilter: document.getElementById("categoryFilter"),
    sortFilter: document.getElementById("sortFilter"),

    resetFilters: document.getElementById("resetFilters"),

    activeFilters: document.getElementById("activeFilters"),
    activeFilterTags: document.getElementById("activeFilterTags"),

    showingCount: document.getElementById("showingCount"),
    grid: document.getElementById("viewallGrid"),

    emptyState: document.getElementById("viewallEmpty"),
    emptyMessage: document.getElementById("emptyMessage"),
    emptyReset: document.getElementById("emptyReset"),

    loadMoreWrapper: document.getElementById("loadMoreWrapper"),
    remainingCount: document.getElementById("remainingCount"),
    loadMoreBtn: document.getElementById("loadMoreBtn")
};

/* =========================================================
   STATE
========================================================= */

let allContent = [];
let filteredContent = [];
let visibleCount = VIEWALL_CONFIG.pageSize;

let isLoading = false;

/* =========================================================
   HELPERS
========================================================= */

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

function normalizeText(value = "") {
    return String(value)
        .toLowerCase()
        .trim()
        .replace(/[-_]/g, " ")
        .replace(/\s+/g, " ");
}

function formatNumber(value) {
    const number = Number(value) || 0;

    return new Intl.NumberFormat("en-US").format(number);
}

function getContentType(item) {
    const type = String(
        item.content_type ||
        item.media_type ||
        item.type ||
        item.role ||
        "movie"
    ).toLowerCase();

    return ["series", "tv", "show"].includes(type)
        ? "series"
        : "movie";
}

function getCategory(item) {
    return (
        item.category ||
        item.genre ||
        item.genres?.[0] ||
        "Uncategorized"
    );
}

function getRating(item) {
    const value =
        item.rating ??
        item.vote_average ??
        item.imdb_rating ??
        item.tmdb_rating ??
        0;

    const rating = Number(value);

    return Number.isFinite(rating) ? rating : 0;
}

function getViews(item) {
    const value = Number(item.views ?? item.view_count ?? 0);

    return Number.isFinite(value) ? value : 0;
}

function getDate(item) {
    const dateValue =
        getContentType(item) === "series"
            ? item.updated_at || item.created_at
            : item.created_at || item.updated_at;

    const date = dateValue ? new Date(dateValue).getTime() : 0;

    return Number.isFinite(date) ? date : 0;
}

function getYear(item) {
    if (item.release_year) {
        return item.release_year;
    }

    if (item.year) {
        return item.year;
    }

    const date = item.release_date || item.created_at;

    if (!date) {
        return "";
    }

    const year = new Date(date).getFullYear();

    return Number.isFinite(year) ? year : "";
}

function getTranslator(item) {
    return (
        item.translator ||
        item.translated_by ||
        item.language ||
        ""
    );
}

/* =========================================================
   IMAGE HANDLING
========================================================= */

function getPoster(item) {
    const possibleImages = [
        item.poster_url,
        item.poster,
        item.poster_image,
        item.poster_image_url,
        item.image_url,
        item.thumbnail_url,
        item.thumbnail,
        item.image,
        item.cover_image,
        item.cover,
        item.poster_path,
        item.backdrop_url,
        item.backdrop,
        item.banner,
        item.backdrop_path
    ];

    return possibleImages.find(value => {
        return typeof value === "string" && value.trim().length > 0;
    }) || "";
}

function safeImageURL(image) {
    if (!image) {
        return VIEWALL_CONFIG.posterFallback;
    }

    const value = String(image).trim();

    if (!value) {
        return VIEWALL_CONFIG.posterFallback;
    }

    // TMDB image paths.
    if (value.startsWith("/")) {
        return `${VIEWALL_CONFIG.tmdbImageBase}w500${value}`;
    }

    // Full HTTP or HTTPS image URLs.
    if (/^https?:\/\//i.test(value)) {
        try {
            const parsed = new URL(value);

            if (!["http:", "https:"].includes(parsed.protocol)) {
                return VIEWALL_CONFIG.posterFallback;
            }

            return parsed.href;
        } catch {
            return VIEWALL_CONFIG.posterFallback;
        }
    }

    // Reject unsafe protocols and data URLs.
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
        return VIEWALL_CONFIG.posterFallback;
    }

    // Existing relative project image paths.
    return value.replace(/^\/+/, "");
}

/* =========================================================
   WATCH PAGE LINK
========================================================= */

function getWatchLink(item) {
    const type = getContentType(item);
    // Legacy watch navigation uses the original database primary key.
    const id = item.id;

    if (id == null) return "watch.html";

    return `watch.html?id=${encodeURIComponent(id)}&type=${type}`;
}

/* =========================================================
   CREATE CONTENT CARD
========================================================= */

function createContentCard(item) {
    const title = item.title || "Untitled";
    const category = getCategory(item);
    const type = getContentType(item);
    const poster = safeImageURL(getPoster(item));
    const year = getYear(item);
    const rating = getRating(item);
    const translator = getTranslator(item);

    const ratingHTML = rating > 0
        ? `
            <span class="movie-rating">
                <i class="fa-solid fa-star"></i>
                ${escapeHTML(rating.toFixed(1))}
            </span>
        `
        : "";

    const translatorHTML = translator
        ? `
            <span class="movie-translator-badge">
                ${escapeHTML(translator)}
            </span>
        `
        : "";

    const yearHTML = year
        ? `<span>${escapeHTML(year)}</span>`
        : "";

    return `
        <article class="movie-card">
            <a class="movie-card-link" href="${escapeHTML(getWatchLink(item))}" aria-label="Watch ${escapeHTML(title)}">
            <div class="movie-poster">

                <img
                    src="${escapeHTML(poster)}"
                    alt="${escapeHTML(title)}"
                    loading="lazy"
                    decoding="async"
                >

                <span class="movie-type ${type}">
                    ${type === "series" ? "SERIES" : "MOVIE"}
                </span>

                ${translatorHTML}

                <div class="movie-overlay">
                    <span class="play-icon">
                        <i class="fa-solid fa-play"></i>
                    </span>
                </div>

            </div>

            <div class="movie-info">

                <h3>${escapeHTML(title)}</h3>

                <div class="movie-meta">
                    <span>${escapeHTML(category)}</span>
                    ${yearHTML}
                    ${ratingHTML}
                </div>

            </div>
            </a>
        </article>
    `;
}

/* =========================================================
   UPDATE STATISTICS
========================================================= */

function updateStatistics() {
    const movies = allContent.filter(item => {
        return getContentType(item) === "movie";
    }).length;

    const series = allContent.filter(item => {
        return getContentType(item) === "series";
    }).length;

    if (elements.totalMovies) {
        elements.totalMovies.textContent = formatNumber(movies);
    }

    if (elements.totalSeries) {
        elements.totalSeries.textContent = formatNumber(series);
    }

    if (elements.totalContent) {
        elements.totalContent.textContent = formatNumber(allContent.length);
    }
}

/* =========================================================
   POPULATE CATEGORY FILTER
========================================================= */

function populateCategories() {
    if (!elements.categoryFilter) {
        return;
    }

    const selectedCategory = elements.categoryFilter.value;

    const categories = [
        ...new Set(
            allContent
                .map(item => String(getCategory(item)).trim())
                .filter(category => {
                    return category && category !== "Uncategorized";
                })
        )
    ].sort((a, b) => a.localeCompare(b));

    elements.categoryFilter.innerHTML = `
        <option value="all">All Categories</option>
        ${categories.map(category => `
            <option value="${escapeHTML(category)}">
                ${escapeHTML(category)}
            </option>
        `).join("")}
    `;

    const matchingCategory = categories.find(category => {
        return normalizeText(category) === normalizeText(selectedCategory);
    });

    if (matchingCategory) {
        elements.categoryFilter.value = matchingCategory;
    }
}

/* =========================================================
   READ URL PARAMETERS
========================================================= */

function initializeURLFilters() {
    const params = new URLSearchParams(window.location.search);

    const type = params.get("type");
    const genre = params.get("genre");
    const sort = params.get("sort");
    const search = params.get("q") || params.get("search");

    if (elements.typeFilter && ["all", "movie", "series"].includes(type)) {
        elements.typeFilter.value = type;
    }

    if (elements.search && search) {
        elements.search.value = search;
    }

    if (elements.sortFilter && sort) {
        const sortMap = {
            latest: "latest",
            oldest: "oldest",
            rating: "rating",
            views: "views",
            trending: "views",
            title: "title"
        };

        if (sortMap[sort]) {
            elements.sortFilter.value = sortMap[sort];
        }
    }

    return genre || "";
}

/* =========================================================
   FILTER CONTENT
========================================================= */

function filterContent() {
    const searchTerm = normalizeText(elements.search?.value || "");
    const selectedType = elements.typeFilter?.value || "all";
    const selectedCategory = elements.categoryFilter?.value || "all";

    filteredContent = allContent.filter(item => {
        const title = normalizeText(item.title || "");
        const category = normalizeText(getCategory(item));
        const translator = normalizeText(getTranslator(item));

        const description = normalizeText(
            item.description ||
            item.overview ||
            item.synopsis ||
            ""
        );

        const type = getContentType(item);

        const matchesSearch =
            !searchTerm ||
            title.includes(searchTerm) ||
            category.includes(searchTerm) ||
            translator.includes(searchTerm) ||
            description.includes(searchTerm);

        const matchesType =
            selectedType === "all" ||
            type === selectedType;

        const matchesCategory =
            selectedCategory === "all" ||
            normalizeText(selectedCategory) === category;

        return matchesSearch && matchesType && matchesCategory;
    });

    sortContent();

    visibleCount = VIEWALL_CONFIG.pageSize;

    renderCatalogue();
}

/* =========================================================
   SORT CONTENT
========================================================= */

function sortContent() {
    const sortBy = elements.sortFilter?.value || "latest";

    filteredContent.sort((a, b) => {
        switch (sortBy) {
            case "oldest":
                return getDate(a) - getDate(b);

            case "rating":
                return getRating(b) - getRating(a);

            case "views":
                return getViews(b) - getViews(a);

            case "title":
                return String(a.title || "").localeCompare(
                    String(b.title || "")
                );

            case "latest":
            default:
                return getDate(b) - getDate(a);
        }
    });
}

/* =========================================================
   RENDER CATALOGUE
========================================================= */

function renderCatalogue() {
    if (!elements.grid) {
        return;
    }

    const visibleItems = filteredContent.slice(0, visibleCount);

    elements.grid.innerHTML = visibleItems
        .map(createContentCard)
        .join("");

    // Fallback for missing or broken poster images.
    elements.grid.querySelectorAll(".movie-poster img").forEach(image => {
        image.addEventListener("error", () => {
            image.onerror = null;
            image.src = VIEWALL_CONFIG.posterFallback;
        }, { once: true });
    });

    updateResults();
    updateEmptyState();
    updateLoadMore();
    updateActiveFilters();
    updatePageHeading();
}

/* =========================================================
   UPDATE RESULTS
========================================================= */

function updateResults() {
    const total = filteredContent.length;
    const showing = Math.min(visibleCount, total);

    if (elements.resultsCount) {
        elements.resultsCount.textContent =
            `${formatNumber(total)} results`;
    }

    if (elements.showingCount) {
        elements.showingCount.textContent =
            `Showing ${formatNumber(showing)} of ${formatNumber(total)} titles`;
    }
}

/* =========================================================
   EMPTY STATE
========================================================= */

function updateEmptyState() {
    const isEmpty = filteredContent.length === 0;

    if (elements.emptyState) {
        elements.emptyState.hidden = !isEmpty;
    }

    if (elements.grid) {
        elements.grid.hidden = isEmpty;
    }

    if (elements.emptyMessage && isEmpty) {
        const hasFilters =
            Boolean(elements.search?.value.trim()) ||
            (elements.typeFilter?.value || "all") !== "all" ||
            (elements.categoryFilter?.value || "all") !== "all";

        elements.emptyMessage.textContent = hasFilters
            ? "No titles match your current search or filters. Try changing your selections."
            : "There are no titles available right now. Please check again later.";
    }
}

/* =========================================================
   LOAD MORE
========================================================= */

function updateLoadMore() {
    if (!elements.loadMoreWrapper) {
        return;
    }

    const remaining = Math.max(
        filteredContent.length - visibleCount,
        0
    );

    elements.loadMoreWrapper.hidden = remaining === 0;

    if (elements.remainingCount) {
        elements.remainingCount.textContent =
            `${formatNumber(remaining)} more titles available`;
    }
}

function loadMore() {
    visibleCount += VIEWALL_CONFIG.pageSize;

    renderCatalogue();
}

/* =========================================================
   ACTIVE FILTER TAGS
========================================================= */

function updateActiveFilters() {
    if (!elements.activeFilterTags) {
        return;
    }

    const tags = [];

    const searchValue = elements.search?.value.trim() || "";
    const typeValue = elements.typeFilter?.value || "all";
    const categoryValue = elements.categoryFilter?.value || "all";

    if (searchValue) {
        tags.push({
            label: `Search: ${searchValue}`,
            filter: "search"
        });
    }

    if (typeValue !== "all") {
        tags.push({
            label: typeValue === "movie" ? "Movies" : "Series",
            filter: "type"
        });
    }

    if (categoryValue !== "all") {
        tags.push({
            label: categoryValue,
            filter: "category"
        });
    }

    elements.activeFilterTags.innerHTML = tags.map(tag => `
        <span class="viewall-filter-tag">
            ${escapeHTML(tag.label)}
            <button
                type="button"
                data-remove-filter="${tag.filter}"
                aria-label="Remove ${escapeHTML(tag.label)} filter"
            >
                <i class="fa-solid fa-xmark"></i>
            </button>
        </span>
    `).join("");

    if (elements.activeFilters) {
        elements.activeFilters.hidden = tags.length === 0;
    }
}

/* =========================================================
   PAGE HEADING
========================================================= */

function updatePageHeading() {
    if (!elements.catalogueTitle) {
        return;
    }

    const type = elements.typeFilter?.value || "all";
    const category = elements.categoryFilter?.value || "all";

    let heading = "Explore All Content";

    if (type === "movie") {
        heading = "Explore Movies";
    } else if (type === "series") {
        heading = "Explore Series";
    }

    if (category !== "all") {
        heading = category;
    }

    elements.catalogueTitle.textContent = heading;

    if (elements.catalogueDescription) {
        elements.catalogueDescription.textContent =
            `Discover ${formatNumber(filteredContent.length)} titles available in the CINEVA collection.`;
    }
}

/* =========================================================
   RESET FILTERS
========================================================= */

function resetFilters() {
    if (elements.search) {
        elements.search.value = "";
    }

    if (elements.typeFilter) {
        elements.typeFilter.value = "all";
    }

    if (elements.categoryFilter) {
        elements.categoryFilter.value = "all";
    }

    if (elements.sortFilter) {
        elements.sortFilter.value = "latest";
    }

    filterContent();
}

/* =========================================================
   FILTER TAG REMOVAL
========================================================= */

function removeFilter(filter) {
    switch (filter) {
        case "search":
            if (elements.search) {
                elements.search.value = "";
            }
            break;

        case "type":
            if (elements.typeFilter) {
                elements.typeFilter.value = "all";
            }
            break;

        case "category":
            if (elements.categoryFilter) {
                elements.categoryFilter.value = "all";
            }
            break;

        default:
            return;
    }

    filterContent();
}

/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupEventListeners() {
    elements.search?.addEventListener("input", filterContent);

    elements.clearSearch?.addEventListener("click", () => {
        if (elements.search) {
            elements.search.value = "";
            elements.search.focus();
        }

        filterContent();
    });

    elements.typeFilter?.addEventListener("change", filterContent);

    elements.categoryFilter?.addEventListener("change", filterContent);

    elements.sortFilter?.addEventListener("change", filterContent);

    elements.resetFilters?.addEventListener("click", resetFilters);

    elements.emptyReset?.addEventListener("click", resetFilters);

    elements.loadMoreBtn?.addEventListener("click", loadMore);

    elements.activeFilterTags?.addEventListener("click", event => {
        const button = event.target.closest("[data-remove-filter]");

        if (!button) {
            return;
        }

        removeFilter(button.dataset.removeFilter);
    });
}

/* =========================================================
   LOADER
========================================================= */

function hidePageLoader() {
    if (!elements.pageLoader) {
        return;
    }

    elements.pageLoader.classList.add("hidden");

    // Keep the page usable if the loader CSS has no transition.
    elements.pageLoader.style.pointerEvents = "none";
}

/* =========================================================
   LOAD SUPABASE CONTENT
========================================================= */

async function loadCatalogue() {
    if (isLoading) {
        return;
    }

    isLoading = true;

    try {
        if (elements.grid) {
            elements.grid.innerHTML = `
                <div class="viewall-loading">
                    <span class="viewall-loading-spinner"></span>
                    Loading CINEVA collection...
                </div>
            `;
        }

        const result = await getAllContent();

        if (!Array.isArray(result)) {
            throw new Error("Supabase returned an invalid catalogue response.");
        }

        allContent = result.filter(item => {
            return item && item.id && item.title;
        });

        updateStatistics();

        populateCategories();

        // Apply initial URL category after category options exist.
        if (initialGenre && elements.categoryFilter) {
            const matchingCategory = [
                ...elements.categoryFilter.options
            ].find(option => {
                return normalizeText(option.value) === normalizeText(initialGenre);
            });

            if (matchingCategory) {
                elements.categoryFilter.value = matchingCategory.value;
            }
        }

        filterContent();

        if (allContent.length === 0 && elements.emptyMessage) {
            elements.emptyMessage.textContent =
                "No active movies or series were found in your CINEVA database.";
        }

    } catch (error) {
        console.error("CINEVA catalogue loading error:", error);

        if (elements.grid) {
            elements.grid.innerHTML = "";
        }

        if (elements.emptyState) {
            elements.emptyState.hidden = false;
        }

        if (elements.emptyMessage) {
            elements.emptyMessage.textContent =
                "We couldn't load the catalogue. Please refresh the page and try again.";
        }

        if (elements.resultsCount) {
            elements.resultsCount.textContent = "Unable to load titles";
        }

        if (elements.loadMoreWrapper) {
            elements.loadMoreWrapper.hidden = true;
        }

    } finally {
        isLoading = false;
        hidePageLoader();
    }
}

/* =========================================================
   INITIALIZE
========================================================= */

const initialGenre = initializeURLFilters();

setupEventListeners();

loadCatalogue();
