/* =========================================================
   CINEVA — PREMIUM MOVIES PAGE
   File: js/movies.js

   Features:
   - Supabase movies
   - 12 movies per page
   - Numbered pagination
   - Search, genre filtering and sorting
   - Homepage-compatible movie cards
   - Translator and rating badges
   - Secure HTML rendering
========================================================= */

import { getAllMovies } from "./supabase.js";

/* =========================================================
   01. SETTINGS
========================================================= */

const MOVIES_PER_PAGE = 12;
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const PLACEHOLDER = "assets/images/movie-placeholder.jpg";

/* =========================================================
   02. DOM ELEMENTS
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const movieGrid = document.querySelector("#movies-grid");
    const searchInput = document.querySelector("#movie-search");
    const genreFilter = document.querySelector("#genre-filter");
    const sortFilter = document.querySelector("#sort-filter");
    const resultCount = document.querySelector("#result-count");
    const pagination = document.querySelector("#movies-pagination");

    if (!movieGrid) {
        console.error("CINEVA: Movies grid was not found.");
        return;
    }

    if (!pagination) {
        console.error(
            "CINEVA: Add an element with id='movies-pagination' below the movies grid."
        );
        return;
    }

    let allMovies = [];
    let filteredMovies = [];
    let currentPage = 1;

    /* =====================================================
       03. SECURITY AND IMAGE HELPERS
    ===================================================== */

    function escapeHTML(value = "") {
        return String(value).replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function getImageURL(movie) {
        const candidates = [
            movie.poster_url,
            movie.poster,
            movie.thumbnail_url,
            movie.thumbnail,
            movie.image_url,
            movie.poster_path,
            movie.backdrop_path
        ];

        for (const value of candidates) {
            if (typeof value !== "string" || !value.trim()) {
                continue;
            }

            const image = value.trim();

            if (/^https?:\/\//i.test(image)) {
                try {
                    const url = new URL(image);

                    if (url.protocol === "http:" || url.protocol === "https:") {
                        return url.href;
                    }
                } catch {
                    continue;
                }
            }

            if (image.startsWith("//")) {
                return `https:${image}`;
            }

            // Keep local image paths local.
            if (
                image.startsWith("assets/") ||
                image.startsWith("./") ||
                image.startsWith("../") ||
                image.startsWith("/assets/")
            ) {
                return image;
            }

            // TMDB image paths.
            if (image.startsWith("/")) {
                return `${TMDB_IMAGE_BASE}${image}`;
            }

            return image;
        }

        return PLACEHOLDER;
    }

    function getYear(movie) {
        const value =
            movie.release_year ||
            movie.year ||
            movie.release_date ||
            movie.created_at ||
            "";

        const match = String(value).match(/\d{4}/);

        return match ? match[0] : "";
    }

    function getRating(movie) {
        const value = Number(
            movie.rating ||
            movie.vote_average ||
            movie.imdb_rating ||
            0
        );

        return Number.isFinite(value) && value > 0
            ? value.toFixed(1)
            : "";
    }

    function getTranslator(movie) {
        return typeof movie.translator === "string"
            ? movie.translator.trim()
            : "";
    }

    /* =====================================================
       04. PREMIUM MOVIE CARD
       Uses the same classes as the homepage cards.
    ===================================================== */

    function createMovieCard(movie) {
        if (!movie || !movie.id) return "";

        const title = escapeHTML(
            movie.title || movie.name || "Untitled"
        );

        const category = escapeHTML(
            movie.category || "Movie"
        );

        const year = escapeHTML(getYear(movie));
        const rating = getRating(movie);
        const translator = escapeHTML(getTranslator(movie));
        const poster = escapeHTML(getImageURL(movie));

        const id = encodeURIComponent(movie.id);

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
            <a
                class="movie-card"
                href="watch.html?id=${id}&type=movie"
                aria-label="Watch ${title}"
            >

                <div class="movie-poster">

                    <img
                        src="${poster}"
                        alt="${title}"
                        loading="lazy"
                        decoding="async"
                        onerror="this.onerror=null;this.src='${PLACEHOLDER}';"
                    >

                    <span class="movie-type">MOVIE</span>

                    ${ratingHTML}

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
                        <span>${category}</span>
                        ${year ? `<span>${year}</span>` : ""}
                    </div>

                </div>

            </a>
        `;
    }

    /* =====================================================
       05. PAGINATION
    ===================================================== */

    function renderPagination(totalPages) {
        if (totalPages <= 1) {
            pagination.innerHTML = "";
            return;
        }

        const visiblePages = new Set([
            1,
            totalPages,
            currentPage - 1,
            currentPage,
            currentPage + 1
        ]);

        const pages = [...visiblePages]
            .filter(page => page >= 1 && page <= totalPages)
            .sort((a, b) => a - b);

        let buttons = `
            <button
                class="page-btn page-arrow"
                type="button"
                data-page="${currentPage - 1}"
                aria-label="Previous page"
                ${currentPage === 1 ? "disabled" : ""}
            >
                <i class="fa-solid fa-chevron-left"></i>
            </button>
        `;

        let previousPage = 0;

        pages.forEach(page => {
            if (previousPage && page - previousPage > 1) {
                buttons += `
                    <span class="page-ellipsis">...</span>
                `;
            }

            buttons += `
                <button
                    class="page-btn ${page === currentPage ? "active" : ""}"
                    type="button"
                    data-page="${page}"
                    aria-label="Page ${page}"
                    aria-current="${page === currentPage ? "page" : "false"}"
                >
                    ${page}
                </button>
            `;

            previousPage = page;
        });

        buttons += `
            <button
                class="page-btn page-arrow"
                type="button"
                data-page="${currentPage + 1}"
                aria-label="Next page"
                ${currentPage === totalPages ? "disabled" : ""}
            >
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        `;

        pagination.innerHTML = `
            <div class="pagination-inner">
                ${buttons}
            </div>

            <p class="pagination-info">
                Page ${currentPage} of ${totalPages}
            </p>
        `;
    }

    /* =====================================================
       06. RENDER CURRENT PAGE
    ===================================================== */

    function renderMovies() {
        const totalMovies = filteredMovies.length;
        const totalPages = Math.ceil(totalMovies / MOVIES_PER_PAGE);

        if (!totalMovies) {
            movieGrid.innerHTML = `
                <div class="movies-empty">
                    <i class="fa-solid fa-film"></i>
                    <h3>No movies found</h3>
                    <p>Try another search or select a different genre.</p>
                </div>
            `;

            if (resultCount) {
                resultCount.textContent = "Showing 0 movies";
            }

            pagination.innerHTML = "";
            return;
        }

        // Keep the current page within valid limits.
        currentPage = Math.max(
            1,
            Math.min(currentPage, totalPages)
        );

        const startIndex = (currentPage - 1) * MOVIES_PER_PAGE;
        const endIndex = Math.min(
            startIndex + MOVIES_PER_PAGE,
            totalMovies
        );

        const currentMovies = filteredMovies.slice(
            startIndex,
            endIndex
        );

        movieGrid.innerHTML = currentMovies
            .map(createMovieCard)
            .filter(Boolean)
            .join("");

        if (resultCount) {
            resultCount.textContent =
                `Showing ${startIndex + 1}–${endIndex} of ${totalMovies} movies`;
        }

        renderPagination(totalPages);
    }

    /* =====================================================
       07. SEARCH, FILTER AND SORT
    ===================================================== */

    function filterMovies() {
        const searchTerm =
            searchInput?.value.trim().toLowerCase() || "";

        const selectedGenre =
            genreFilter?.value || "all";

        const sortValue =
            sortFilter?.value || "latest";

        filteredMovies = allMovies.filter(movie => {
            const searchableFields = [
                movie.title, movie.name, movie.original_title,
                movie.translator, movie.category,
                movie.overview, movie.description, movie.genre,
                ...(Array.isArray(movie.genres) ? movie.genres : [])
            ];

            const searchableText = searchableFields
                .filter(value => value !== null && value !== undefined)
                .map(value => String(value).trim().toLocaleLowerCase())
                .filter(Boolean)
                .join(" ");

            const category = String(movie.category || "").trim().toLocaleLowerCase();
            const matchesSearch = !searchTerm || searchableText.includes(searchTerm);

            const matchesGenre =
                selectedGenre === "all" ||
                category === selectedGenre.toLowerCase();

            return matchesSearch && matchesGenre;
        });

        if (sortValue === "latest") {
            filteredMovies.sort((a, b) =>
                new Date(b.created_at || 0) -
                new Date(a.created_at || 0)
            );
        } else if (sortValue === "oldest") {
            filteredMovies.sort((a, b) =>
                new Date(a.created_at || 0) -
                new Date(b.created_at || 0)
            );
        } else if (sortValue === "rating") {
            filteredMovies.sort((a, b) =>
                Number(b.rating || b.vote_average || 0) -
                Number(a.rating || a.vote_average || 0)
            );
        } else if (sortValue === "title") {
            filteredMovies.sort((a, b) =>
                (a.title || a.name || "").localeCompare(
                    b.title || b.name || ""
                )
            );
        }

        // A new search or filter always starts on page one.
        currentPage = 1;
        renderMovies();
    }

    /* =====================================================
       08. LOAD MOVIES
    ===================================================== */

    async function loadMovies() {
        movieGrid.innerHTML = `
            <div class="movies-loading">
                <span class="movies-spinner"></span>
                <p>Loading CINEVA movies...</p>
            </div>
        `;

        try {
            const result = await getAllMovies();

            allMovies = Array.isArray(result) ? result : [];

            filterMovies();

            console.log(
                `CINEVA: Loaded ${allMovies.length} movies.`
            );

        } catch (error) {
            console.error("CINEVA movies error:", error);

            movieGrid.innerHTML = `
                <div class="movies-empty">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <h3>Unable to load movies</h3>
                    <p>Please check your connection and try again.</p>
                </div>
            `;

            if (resultCount) {
                resultCount.textContent = "Movies could not be loaded.";
            }

            pagination.innerHTML = "";
        }
    }

    /* =====================================================
       09. PAGINATION EVENTS
    ===================================================== */

    pagination.addEventListener("click", event => {
        const button = event.target.closest("[data-page]");

        if (!button || button.disabled) return;

        const requestedPage = Number(button.dataset.page);
        const totalPages = Math.ceil(
            filteredMovies.length / MOVIES_PER_PAGE
        );

        if (
            !Number.isInteger(requestedPage) ||
            requestedPage < 1 ||
            requestedPage > totalPages
        ) {
            return;
        }

        currentPage = requestedPage;
        renderMovies();

        // Scroll only when the visitor changes pages.
        movieGrid.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });

    /* =====================================================
       10. FILTER EVENTS
    ===================================================== */

    searchInput?.addEventListener("input", filterMovies);
    genreFilter?.addEventListener("change", filterMovies);
    sortFilter?.addEventListener("change", filterMovies);

    loadMovies();
});
