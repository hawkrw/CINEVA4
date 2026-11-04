
import { supabase } from "./config.js";

const state = {
    content: [],
    type: "all",
    genre: "",
    sort: "latest"
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
    footerYear: document.getElementById("footer-year")
};

const FALLBACK_POSTER =
    "https://placehold.co/400x600/151522/ffffff?text=CINEVA";

const GENRE_NAMES = {
    "action": "Action",
    "horror": "Horror",
    "drama": "Drama",
    "romance": "Romance",
    "animation": "Animation",
    "high-school": "High School",
    "comedy": "Comedy",
    "sci-fi": "Sci-Fi",
    "adventure": "Adventure",
    "thriller": "Thriller",
    "fantasy": "Fantasy",
    "crime": "Crime",
    "documentary": "Documentary",
    "mystery": "Mystery",
    "family": "Family"
};

/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener("DOMContentLoaded", initializeGenrePage);

async function initializeGenrePage() {
    elements.footerYear.textContent = new Date().getFullYear();

    readUrlParameters();
    updatePageInformation();
    connectFilters();

    await loadContent();
}

/* =========================================================
   URL PARAMETERS
========================================================= */

function readUrlParameters() {
    const params = new URLSearchParams(window.location.search);

    const requestedType = params.get("type")?.toLowerCase();
    const requestedGenre = params.get("genre")?.toLowerCase();
    const requestedSort = params.get("sort")?.toLowerCase();

    state.type = ["movie", "series"].includes(requestedType)
        ? requestedType
        : "all";

    state.genre = requestedGenre || "";

    state.sort = ["latest", "rating", "popular", "title"].includes(requestedSort)
        ? requestedSort
        : requestedSort === "top-rated"
            ? "rating"
            : "latest";

    elements.typeFilter.value = state.type;
    elements.sortFilter.value = state.sort;
}

/* =========================================================
   PAGE INFORMATION
========================================================= */

function updatePageInformation() {
    let title = "Discover Movies & Series";
    let description = "Explore amazing movies and series from the CINEVA collection.";
    let heading = "Explore Content";

    if (state.genre) {
        const formattedGenre = getGenreName(state.genre);

        title = `${formattedGenre} Collection`;
        description = `Explore the best ${formattedGenre.toLowerCase()} movies and series available on CINEVA.`;
        heading = `${formattedGenre} Movies & Series`;
    } else if (state.type === "movie") {
        title = "Explore Movies";
        description = "Discover movies from every genre and category.";
        heading = "All Movies";
    } else if (state.type === "series") {
        title = "Explore Series";
        description = "Discover exciting series and unforgettable stories.";
        heading = "All Series";
    } else if (state.sort === "rating") {
        title = "Top Rated Collection";
        description = "Discover the highest-rated movies and series.";
        heading = "Top Rated Content";
    }

    elements.title.textContent = title;
    elements.description.textContent = description;
    elements.heading.textContent = heading;

    document.title = `${title} | CINEVA`;
}

function getGenreName(genre) {
    return GENRE_NAMES[genre] ||
        genre.replace(/[-_]/g, " ")
            .replace(/\b\w/g, letter => letter.toUpperCase());
}

/* =========================================================
   FILTER CONTROLS
========================================================= */

function connectFilters() {
    elements.typeFilter.addEventListener("change", async event => {
        state.type = event.target.value;
        updatePageInformation();
        await loadContent();
        updateBrowserUrl();
    });

    elements.sortFilter.addEventListener("change", async event => {
        state.sort = event.target.value;
        updatePageInformation();
        await loadContent();
        updateBrowserUrl();
    });
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

    const query = params.toString();

    history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`
    );
}

/* =========================================================
   FETCH SUPABASE CONTENT
========================================================= */

async function loadContent() {
    showLoading();

    try {
        const requests = [];

        if (state.type === "all" || state.type === "movie") {
            requests.push(fetchMovies());
        }

        if (state.type === "all" || state.type === "series") {
            requests.push(fetchSeries());
        }

        const results = await Promise.all(requests);

        state.content = results.flat();

        filterContent();
        sortContent();
        renderContent();

    } catch (error) {
        console.error("CINEVA genre loading error:", error);

        showError(
            error.message || "Unable to connect to the CINEVA database."
        );
    }
}

async function fetchMovies() {
    const { data, error } = await supabase
        .from("movies")
        .select("*")
        .eq("is_active", true);

    if (error) throw error;

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

    if (error) throw error;

    return (data || []).map(series => ({
        ...series,
        content_type: "series"
    }));
}

/* =========================================================
   GENRE FILTERING
========================================================= */

function filterContent() {
    if (!state.genre) return;

    const requestedGenre = normalizeText(state.genre);

    state.content = state.content.filter(item => {
        const genres = getGenres(item);

        return genres.some(genre => {
            const normalized = normalizeText(genre);

            if (normalized === requestedGenre) return true;

            // Allow common naming variations.
            const variations = {
                "sci-fi": ["science fiction", "scifi", "science-fiction"],
                "high-school": ["high school", "highschool", "school"],
                "animation": ["animated"],
                "romance": ["romantic"]
            };

            return (variations[requestedGenre] || []).includes(normalized);
        });
    });
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
        return genres.map(genre => {
            if (typeof genre === "string") return genre;

            return genre.name || genre.title || "";
        }).filter(Boolean);
    }

    const category = item.category;

    if (Array.isArray(category)) return category;

    return category ? [category] : [];
}

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[_\s]+/g, "-");
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
                new Date(b.created_at || b.release_date || 0) -
                new Date(a.created_at || a.release_date || 0)
            );
    }
}

function getRating(item) {
    return Number(
        item.vote_average ??
        item.rating ??
        0
    );
}

function getViews(item) {
    return Number(item.views || 0);
}

function getTitle(item) {
    return item.title || item.original_title || "Untitled";
}

/* =========================================================
   POSTER HANDLING
========================================================= */

function getPoster(item) {
    const poster = item.poster ||
        item.poster_path ||
        item.image ||
        item.thumbnail;

    if (!poster) return FALLBACK_POSTER;

    if (poster.startsWith("http://") || poster.startsWith("https://")) {
        return poster;
    }

    return `https://image.tmdb.org/t/p/w500${poster.startsWith("/") ? poster : `/${poster}`}`;
}

/* =========================================================
   RENDER CONTENT
========================================================= */

function renderContent() {
    hideAllMessages();

    elements.grid.innerHTML = "";

    const content = state.content;

    elements.count.textContent =
        `${content.length} ${content.length === 1 ? "title" : "titles"} found`;

    if (!content.length) {
        elements.empty.hidden = false;
        return;
    }

    const fragment = document.createDocumentFragment();

    content.forEach(item => {
        fragment.appendChild(createContentCard(item));
    });

    elements.grid.appendChild(fragment);
}

function createContentCard(item) {
    const card = document.createElement("a");

    card.className = "movie-card genre-movie-card";

    const contentType = item.content_type;
    const id = item.id;

    card.href = `watch.html?id=${encodeURIComponent(id)}&type=${contentType}`;

    const poster = document.createElement("img");

    poster.src = getPoster(item);
    poster.alt = getTitle(item);
    poster.loading = "lazy";

    poster.onerror = () => {
        poster.onerror = null;
        poster.src = FALLBACK_POSTER;
    };

    const information = document.createElement("div");
    information.className = "genre-card-info";

    const title = document.createElement("h3");
    title.textContent = getTitle(item);

    const metadata = document.createElement("div");
    metadata.className = "genre-card-meta";

    const year = document.createElement("span");
    year.textContent = getYear(item);

    const rating = document.createElement("span");
    rating.innerHTML = `<i class="fa-solid fa-star"></i> ${getRating(item).toFixed(1)}`;

    const type = document.createElement("span");
    type.textContent = contentType === "series" ? "SERIES" : "MOVIE";

    metadata.append(year, rating, type);
    information.append(title, metadata);

    card.append(poster, information);

    return card;
}

function getYear(item) {
    const year = item.year ||
        item.release_date?.substring(0, 4);

    return year || "N/A";
}

/* =========================================================
   UI STATES
========================================================= */

function showLoading() {
    elements.loading.hidden = false;
    elements.grid.innerHTML = "";
    elements.empty.hidden = true;
    elements.error.hidden = true;
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
    elements.errorText.textContent = message;
}

/* =========================================================
   END
========================================================= */
