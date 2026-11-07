import { supabase } from "./config.js";

/* =========================================================
   CINEVA — PREMIUM GENRE & DISCOVERY CONTROLLER
========================================================= */

const CONTENTS_PER_PAGE = 15;

const FALLBACK_POSTER =
    "https://placehold.co/500x750/151522/ffffff?text=CINEVA";

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

const elements = {
    title: document.getElementById("page-title"),
    description: document.getElementById("page-description"),
    heading: document.getElementById("results-heading"),
    count: document.getElementById("results-count"),
    grid: document.getElementById("genre-grid"),
    loading: document.getElementById("genre-loading"),
    empty: document.getElementById("genre-empty"),
    error: document.getElementById("genre-error"),
    errorText: document.getElementById("genre-error-text"),
    typeFilter: document.getElementById("content-filter"),
    sortFilter: document.getElementById("sort-filter"),
    search: document.getElementById("genre-search"),
    pagination: document.getElementById("genre-pagination"),
    resultsLabel: document.getElementById("genre-results-label"),
    footerYear: document.getElementById("footer-year"),
    resetButton: document.getElementById("genre-reset-btn"),
    retryButton: document.getElementById("genre-retry-btn")
};

const GENRE_NAMES = {
    action: "Action",
    horror: "Horror",
    drama: "Drama",
    romance: "Romance",
    animation: "Animation",
    highschool: "High School",
    "high-school": "High School",
    comedy: "Comedy",
    "sci-fi": "Sci-Fi",
    scifi: "Sci-Fi",
    adventure: "Adventure",
    thriller: "Thriller",
    fantasy: "Fantasy",
    crime: "Crime",
    documentary: "Documentary",
    mystery: "Mystery",
    family: "Family",
    erotic: "Erotic"
};

const GENRE_ALIASES = {
    "sci-fi": ["science-fiction", "scifi", "science fiction"],
    scifi: ["sci-fi", "science-fiction", "science fiction"],
    "high-school": ["highschool", "school", "high school"],
    highschool: ["high-school", "school", "high school"],
    animation: ["animated"],
    romance: ["romantic"]
};

/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener("DOMContentLoaded", initializeGenrePage);

async function initializeGenrePage() {
    const missingElements = Object.entries(elements)
        .filter(([key, element]) =>
            key !== "footerYear" &&
            key !== "resultsLabel" &&
            key !== "resetButton" &&
            key !== "retryButton" &&
            !element
        )
        .map(([key]) => key);

    if (missingElements.length) {
        console.error(
            "CINEVA: Required genre page elements are missing:",
            missingElements
        );
        return;
    }

    if (elements.footerYear) {
        elements.footerYear.textContent = new Date().getFullYear();
    }

    readUrlParameters();
    updatePageInformation();
    connectFilters();

    await loadContent();

    console.log("CINEVA: Premium discovery page initialized.");
}

/* =========================================================
   URL PARAMETERS
========================================================= */

function readUrlParameters() {
    const params = new URLSearchParams(window.location.search);

    const requestedType = params.get("type")?.toLowerCase();
    const requestedGenre = params.get("genre")?.toLowerCase();
    const requestedSort = params.get("sort")?.toLowerCase();
    const requestedPage = Number(params.get("page"));

    state.type = ["movie", "series"].includes(requestedType)
        ? requestedType
        : "all";

    state.genre = requestedGenre || "";
    state.search = params.get("search") || "";
elements.search.value = state.search;

    state.sort = [
        "latest",
        "rating",
        "popular",
        "title"
    ].includes(requestedSort)
        ? requestedSort
        : requestedSort === "top-rated"
            ? "rating"
            : "latest";

    state.currentPage =
        Number.isInteger(requestedPage) && requestedPage > 0
            ? requestedPage
            : 1;

    elements.typeFilter.value = state.type;
    elements.sortFilter.value = state.sort;

    if (elements.resultsLabel) {
        elements.resultsLabel.textContent = state.genre
            ? `${getGenreName(state.genre).toUpperCase()} COLLECTION`
            : state.type === "movie"
                ? "MOVIE COLLECTION"
                : state.type === "series"
                    ? "SERIES COLLECTION"
                    : "ALL COLLECTIONS";
    }
}

function updateBrowserUrl() {
    const params = new URLSearchParams();

    if (state.genre) {
        params.set("genre", state.genre);
    }

    if (state.type !== "all") {
        params.set("type", state.type);
    }

    if (state.sort !== "latest") {
        params.set("sort", state.sort);
    }

    if (state.search) {
        params.set("search", state.search);
    }

    if (state.currentPage > 1) {
        params.set("page", String(state.currentPage));
    }

    const query = params.toString();

    history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`
    );
}

/* =========================================================
   PAGE INFORMATION
========================================================= */

function updatePageInformation() {
    let title = "Discover Movies & Series";
    let description =
        "Explore incredible stories, discover new favourites and find your next unforgettable experience.";
    let heading = "Explore Content";

    if (state.genre) {
        const genreName = getGenreName(state.genre);

        title = `${genreName} Collection`;
        description =
            `Explore ${genreName.toLowerCase()} movies and series from the CINEVA collection.`;
        heading = `${genreName} Collection`;

    } else if (state.type === "movie") {
        title = "Explore Movies";
        description =
            "Discover movies from every category and explore your next favourite story.";
        heading = "All Movies";

    } else if (state.type === "series") {
        title = "Explore Series";
        description =
            "Discover exciting series, unforgettable characters and amazing stories.";
        heading = "All Series";

    } else if (state.sort === "rating") {
        title = "Top Rated Collection";
        description =
            "Explore the highest-rated movies and series in the CINEVA collection.";
        heading = "Top Rated Content";
    }

    elements.title.textContent = title;
    elements.description.textContent = description;
    elements.heading.textContent = heading;

    document.title = `${title} | CINEVA`;
}

function getGenreName(genre) {
    const key = normalizeText(genre);

    return GENRE_NAMES[key] ||
        String(genre)
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, letter => letter.toUpperCase());
}

/* =========================================================
   FILTER CONTROLS
========================================================= */

function connectFilters() {
    elements.typeFilter.addEventListener("change", event => {
        state.type = event.target.value;
        state.currentPage = 1;

        updatePageInformation();
        applyFilters();
    });

    elements.sortFilter.addEventListener("change", event => {
        state.sort = event.target.value;
        state.currentPage = 1;

        updatePageInformation();
        applyFilters();
    });

    elements.search.addEventListener("input", event => {
        state.search = event.target.value.trim().toLowerCase();
        state.currentPage = 1;

        applyFilters();
    });

    elements.resetButton?.addEventListener("click", () => {
        state.search = "";
        state.type = "all";
        state.sort = "latest";
        state.currentPage = 1;

        elements.search.value = "";
        elements.typeFilter.value = "all";
        elements.sortFilter.value = "latest";

        updatePageInformation();
        applyFilters();
    });

    elements.retryButton?.addEventListener("click", loadContent);
}

/* =========================================================
   FETCH SUPABASE CONTENT
========================================================= */
async function loadContent() {
    if (state.loading) return;

    state.loading = true;
    showLoading();

    try {
        const [movies, series] = await Promise.all([
            fetchMovies(),
            fetchSeries()
        ]);

        state.allContent = [...movies, ...series];

        applyFilters();

        console.log(
            `CINEVA: Loaded ${state.allContent.length} content records.`
        );

    } catch (error) {
        console.error("CINEVA genre loading error:", error);

        showError(
            error.message ||
            "Unable to connect to the CINEVA database."
        );

    } finally {
        state.loading = false;
    }
}

async function fetchMovies() {
    const { data, error } = await supabase
        .from("movies")
        .select("*")
        .eq("is_active", true);

    if (error) {
        throw new Error(`Movies: ${error.message}`);
    }

    return (data || []).map(movie => ({
        ...movie,
        content_type: "movie"
    }));
}

async function fetchSeries() {
    const { data, error } = await supabase
        .from("series")
        .select("*")
        .eq("is_active", true);

    if (error) {
        throw new Error(`Series: ${error.message}`);
    }

    return (data || []).map(series => ({
        ...series,
        content_type: "series"
    }));
}

/* =========================================================
   FILTERING
========================================================= */

function applyFilters() {
    const searchTerm = normalizeSearch(state.search);
    const requestedGenre = normalizeText(state.genre);

    const acceptedGenres = [
        requestedGenre,
        ...(GENRE_ALIASES[requestedGenre] || [])
    ].map(normalizeText);

    state.content = state.allContent.filter(item => {
        const matchesType =
            state.type === "all" ||
            item.content_type === state.type;

        const searchableText = [
            getTitle(item),
            item.original_title,
            item.category,
            item.overview,
            item.description,
            item.translator
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        const matchesSearch =
            !searchTerm ||
            normalizeSearch(searchableText).includes(searchTerm);

        const matchesGenre =
            !requestedGenre ||
            getGenres(item).some(genre => {
                const normalizedGenre = normalizeText(genre);

                return acceptedGenres.includes(normalizedGenre) ||
                    acceptedGenres.some(accepted =>
                        GENRE_ALIASES[accepted]?.some(alias =>
                            normalizeText(alias) === normalizedGenre
                        )
                    );
            });

        return matchesType && matchesSearch && matchesGenre;
    });

    sortContent();

    const totalPages = getTotalPages();

    if (state.currentPage > totalPages) {
        state.currentPage = Math.max(1, totalPages);
    }

    renderContent();
    updateBrowserUrl();
}

function getGenres(item) {
    let genres = item.genres;

    if (typeof genres === "string") {
        try {
            genres = JSON.parse(genres);
        } catch {
            genres = genres.split(",");
        }
    }

    if (Array.isArray(genres)) {
        return genres
            .map(genre => {
                if (typeof genre === "string") {
                    return genre;
                }

                return genre?.name || genre?.title || "";
            })
            .filter(Boolean);
    }

    const category = item.category;

    if (Array.isArray(category)) {
        return category;
    }

    if (typeof category === "string" && category.includes(",")) {
        return category.split(",").map(value => value.trim());
    }

    return category ? [category] : [];
}

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[_\s]+/g, "-");
}

function normalizeSearch(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

/* =========================================================
   SORTING
========================================================= */

function sortContent() {
    switch (state.sort) {
        case "rating":
            state.content.sort((a, b) =>
                getRating(b) - getRating(a)
            );
            break;

        case "popular":
            state.content.sort((a, b) =>
                getViews(b) - getViews(a)
            );
            break;

        case "title":
            state.content.sort((a, b) =>
                getTitle(a).localeCompare(getTitle(b))
            );
            break;

        default:
            state.content.sort((a, b) =>
                getActivityDate(b) - getActivityDate(a)
            );
    }
}

function getActivityDate(item) {
    const date = item.content_type === "series"
        ? item.updated_at || item.created_at || item.release_date
        : item.created_at || item.release_date;

    const timestamp = date ? new Date(date).getTime() : 0;

    return Number.isFinite(timestamp) ? timestamp : 0;
}

function getRating(item) {
    return Number(item.vote_average ?? item.rating ?? 0) || 0;
}

function getViews(item) {
    return Number(item.views || 0) || 0;
}

function getTitle(item) {
    return String(
        item.title ||
        item.name ||
        item.original_title ||
        "Untitled"
    );
}

/* =========================================================
   POSTER HANDLING
========================================================= */

function getPoster(item) {
    const poster =
        item.poster ||
        item.poster_path ||
        item.image ||
        item.thumbnail;

    if (!poster || typeof poster !== "string") {
        return FALLBACK_POSTER;
    }

    const value = poster.trim();

    if (/^https?:\/\//i.test(value)) {
        return value;
    }

    if (
        value.startsWith("/") &&
        (
            value.startsWith("/assets/") ||
            value.startsWith("/images/")
        )
    ) {
        return value;
    }

    return `https://image.tmdb.org/t/p/w500/${
        value.replace(/^\/+/, "")
    }`;
}

function getYear(item) {
    const date =
        item.year ||
        item.release_date ||
        item.first_air_date ||
        item.created_at;

    if (!date) return "N/A";

    const match = String(date).match(/\b(19|20)\d{2}\b/);

    return match ? match[0] : "N/A";
}

/* =========================================================
   RENDER CONTENT
========================================================= */

function getTotalPages() {
    return Math.ceil(state.content.length / CONTENTS_PER_PAGE);
}

function renderContent() {
    hideAllMessages();

    elements.grid.innerHTML = "";

    const total = state.content.length;
    const totalPages = getTotalPages();

    if (!total) {
        elements.count.textContent = "No titles found";
        elements.empty.hidden = false;
        elements.pagination.hidden = true;
        return;
    }

    const startIndex =
        (state.currentPage - 1) * CONTENTS_PER_PAGE;

    const endIndex = Math.min(
        startIndex + CONTENTS_PER_PAGE,
        total
    );

    const currentContent = state.content.slice(
        startIndex,
        endIndex
    );

    const fragment = document.createDocumentFragment();

    currentContent.forEach(item => {
        fragment.appendChild(createContentCard(item));
    });

    elements.grid.appendChild(fragment);

    elements.count.textContent =
        `Showing ${startIndex + 1}–${endIndex} of ${total} titles`;

    renderPagination(totalPages);
}

/* =========================================================
   CONTENT CARDS
========================================================= */

function createContentCard(item) {
    const card = document.createElement("a");

    card.className = "movie-card genre-movie-card";

    card.href =
        `watch.html?id=${encodeURIComponent(item.id)}&type=${item.content_type}`;

    card.setAttribute(
        "aria-label",
        `Watch ${getTitle(item)}`
    );

    const posterWrapper = document.createElement("div");
    posterWrapper.className = "genre-poster";

    const poster = document.createElement("img");

    poster.src = getPoster(item);
    poster.alt = getTitle(item);
    poster.loading = "lazy";
    poster.decoding = "async";

    poster.onerror = () => {
        poster.onerror = null;
        poster.src = FALLBACK_POSTER;
    };

    const typeBadge = document.createElement("span");
    typeBadge.className = "genre-type-badge";
    typeBadge.textContent =
        item.content_type === "series" ? "SERIES" : "MOVIE";

    posterWrapper.append(poster, typeBadge);

    const ratingValue = getRating(item);

    if (ratingValue > 0) {
        const ratingBadge = document.createElement("span");

        ratingBadge.className = "genre-rating-badge";

        const star = document.createElement("i");
        star.className = "fa-solid fa-star";

        const ratingText = document.createElement("span");
        ratingText.textContent = ratingValue.toFixed(1);

        ratingBadge.append(star, ratingText);
        posterWrapper.appendChild(ratingBadge);
    }

    if (item.translator) {
        const translator = document.createElement("span");

        translator.className = "genre-translator-badge";
        translator.textContent = `Translated by ${item.translator}`;

        posterWrapper.appendChild(translator);
    }

    const overlay = document.createElement("div");
    overlay.className = "genre-poster-overlay";

    const playButton = document.createElement("span");
    playButton.className = "genre-play-button";

    const playIcon = document.createElement("i");
    playIcon.className = "fa-solid fa-play";

    playButton.appendChild(playIcon);
    overlay.appendChild(playButton);
    posterWrapper.appendChild(overlay);

    const information = document.createElement("div");
    information.className = "genre-card-info";

    const title = document.createElement("h3");
    title.textContent = getTitle(item);

    const metadata = document.createElement("div");
    metadata.className = "genre-card-meta";

    const year = document.createElement("span");
    year.className = "genre-card-year";
    year.textContent = getYear(item);

    const category = document.createElement("span");
    category.className = "genre-card-category";
    category.textContent = getGenres(item)[0] || "CINEVA";

    const rating = document.createElement("span");
    rating.className = "genre-card-rating";

    if (ratingValue > 0) {
        rating.textContent = ratingValue.toFixed(1);
    } else {
        rating.textContent = "New";
    }

    metadata.append(year, category, rating);
    information.append(title, metadata);

    card.append(posterWrapper, information);

    return card;
}

/* =========================================================
   PAGINATION
========================================================= */

function renderPagination(totalPages) {
    elements.pagination.innerHTML = "";

    if (totalPages <= 1) {
        elements.pagination.hidden = true;
        return;
    }

    elements.pagination.hidden = false;

    const fragment = document.createDocumentFragment();

    fragment.appendChild(
        createPageButton(
            "‹",
            state.currentPage - 1,
            state.currentPage === 1,
            "Previous page"
        )
    );

    getVisiblePages(totalPages).forEach(page => {
        if (page === "...") {
            const dots = document.createElement("span");

            dots.className = "pagination-dots";
            dots.textContent = "…";

            fragment.appendChild(dots);
            return;
        }

        fragment.appendChild(
            createPageButton(
                String(page),
                page,
                false,
                `Page ${page}`,
                page === state.currentPage
            )
        );
    });

    fragment.appendChild(
        createPageButton(
            "›",
            state.currentPage + 1,
            state.currentPage === totalPages,
            "Next page"
        )
    );

    const summary = document.createElement("span");

    summary.className = "pagination-summary";
    summary.textContent =
        `Page ${state.currentPage} of ${totalPages}`;

    elements.pagination.append(fragment, summary);
}

function getVisiblePages(totalPages) {
    const current = state.currentPage;

    if (totalPages <= 5) {
        return Array.from(
            { length: totalPages },
            (_, index) => index + 1
        );
    }

    if (current <= 3) {
        return [1, 2, 3, 4, "...", totalPages];
    }

    if (current >= totalPages - 2) {
        return [
            1,
            "...",
            totalPages - 3,
            totalPages - 2,
            totalPages - 1,
            totalPages
        ];
    }

    return [
        1,
        "...",
        current - 1,
        current,
        current + 1,
        "...",
        totalPages
    ];
}

function createPageButton(
    label,
    page,
    disabled = false,
    ariaLabel = "",
    active = false
) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "pagination-button";
    button.textContent = label;
    button.disabled = disabled;

    if (active) {
        button.classList.add("active");
        button.setAttribute("aria-current", "page");
    }

    if (ariaLabel) {
        button.setAttribute("aria-label", ariaLabel);
    }

    button.addEventListener("click", () => {
        if (
            disabled ||
            page < 1 ||
            page > getTotalPages() ||
            page === state.currentPage
        ) {
            return;
        }

        state.currentPage = page;

        renderContent();
        updateBrowserUrl();

        elements.grid.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });

    return button;
}

/* =========================================================
   UI STATES
========================================================= */

function showLoading() {
    elements.loading.hidden = false;
    elements.empty.hidden = true;
    elements.error.hidden = true;

    elements.grid.innerHTML = "";
    elements.pagination.hidden = true;

    elements.count.textContent = "Loading CINEVA collection...";
}

function hideAllMessages() {
    elements.loading.hidden = true;
    elements.empty.hidden = true;
    elements.error.hidden = true;
}

function showError(message) {
    elements.loading.hidden = true;
    elements.empty.hidden = true;
    elements.error.hidden = false;

    elements.grid.innerHTML = "";
    elements.pagination.hidden = true;

    elements.errorText.textContent = message;
    elements.count.textContent = "Content could not be loaded.";
}

/* =========================================================
   END
========================================================= */
