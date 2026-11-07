/* =========================================================
   CINEVA PRO — PREMIUM MOVIES PAGE
   File: js/movies.js

   FEATURES:
   - Supabase movie loading
   - Numbered pagination
   - Previous / Next buttons
   - Search and genre filtering
   - Latest, oldest, rating and A-Z sorting
   - URL genre filter support
   - Smooth pagination scrolling
   - Responsive movie cards
========================================================= */

import { getAllMovies } from "./supabase.js";

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       01. DOM ELEMENTS
    ===================================================== */

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
            "CINEVA: Pagination container is missing from movies.html."
        );
        return;
    }


    /* =====================================================
       02. CONFIGURATION
    ===================================================== */

    const MOVIES_PER_PAGE = 12;

    const PLACEHOLDER_IMAGE =
        "assets/images/movie-placeholder.jpg";


    /* =====================================================
       03. PAGE STATE
    ===================================================== */

    let allMovies = [];
    let filteredMovies = [];

    let currentPage = 1;


    /* =====================================================
       04. SECURITY
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


    /* =====================================================
       05. IMAGE HANDLER
    ===================================================== */

    function getMoviePoster(movie) {

        const fields = [
            "poster_url",
            "poster",
            "poster_image",
            "image_url",
            "thumbnail_url",
            "thumbnail",
            "image",
            "poster_path"
        ];

        for (const field of fields) {

            const value = movie?.[field];

            if (
                typeof value !== "string" ||
                !value.trim()
            ) {
                continue;
            }

            const image = value.trim();

            // Complete image URL
            if (/^https?:\/\//i.test(image)) {

                try {

                    const url = new URL(image);

                    if (
                        url.protocol === "https:" ||
                        url.protocol === "http:"
                    ) {
                        return url.href;
                    }

                } catch {
                    continue;
                }

            }

            // TMDB image path
            if (field === "poster_path" && image.startsWith("/")) {

                return `https://image.tmdb.org/t/p/w500${image}`;

            }

            // Local image path
            if (
                image.startsWith("assets/") ||
                image.startsWith("/assets/") ||
                image.startsWith("./")
            ) {

                return image;

            }

        }

        return PLACEHOLDER_IMAGE;

    }


    /* =====================================================
       06. CONTENT YEAR
    ===================================================== */

    function getMovieYear(movie) {

        const value =
            movie.release_year ||
            movie.year ||
            movie.release_date ||
            movie.created_at ||
            "";

        const match = String(value).match(/\d{4}/);

        return match ? match[0] : "";

    }


    /* =====================================================
       07. MOVIE CARD
    ===================================================== */

    function createMovieCard(movie) {

        if (!movie || !movie.id) return "";

        const id = encodeURIComponent(movie.id);

        const title = escapeHTML(
            movie.title ||
            movie.name ||
            "Untitled"
        );

        const category = escapeHTML(
            movie.category ||
            "Movie"
        );

        const poster = escapeHTML(
            getMoviePoster(movie)
        );

        const year = escapeHTML(
            getMovieYear(movie)
        );

        const ratingValue =
            movie.rating ??
            movie.vote_average ??
            "";

        const rating = Number(ratingValue);

        const ratingHTML =
            Number.isFinite(rating) && rating > 0
                ? `
                    <span class="movie-card-rating">
                        <i class="fa-solid fa-star"></i>
                        ${rating.toFixed(1)}
                    </span>
                `
                : "";

        const translator = escapeHTML(
            movie.translator || ""
        );

        const translatorHTML = translator
            ? `
                <span class="movie-translator-badge">
                    <i class="fa-solid fa-language"></i>
                    ${translator}
                </span>
            `
            : "";

        return `
            <a
                class="movie-card"
                href="watch.html?id=${id}&type=movie"
                aria-label="Watch ${title}"
            >

                <div class="movie-poster movie-card-image">

                    <img
                        src="${poster}"
                        alt="${title}"
                        loading="lazy"
                        decoding="async"
                        onerror="
                            this.onerror=null;
                            this.src='${PLACEHOLDER_IMAGE}';
                        "
                    >

                    <span class="movie-card-category">
                        ${category}
                    </span>

                    ${ratingHTML}

                    ${translatorHTML}

                    <div class="movie-overlay">
                        <span class="play-icon">
                            <i class="fa-solid fa-play"></i>
                        </span>
                    </div>

                </div>

                <div class="movie-info movie-card-info">

                    <h3 title="${title}">
                        ${title}
                    </h3>

                    <div class="movie-meta">
                        <span>${year || category}</span>
                    </div>

                </div>

            </a>
        `;

    }


    /* =====================================================
       08. RENDER MOVIES
    ===================================================== */

    function renderMovies() {

        const totalMovies = filteredMovies.length;

        const totalPages = Math.ceil(
            totalMovies / MOVIES_PER_PAGE
        );

        if (!totalMovies) {

            movieGrid.innerHTML = `
                <div class="movies-empty">

                    <i class="fa-solid fa-film"></i>

                    <h3>No movies found</h3>

                    <p>
                        Try another search or category.
                    </p>

                </div>
            `;

            resultCount.textContent = "0 movies found.";

            pagination.innerHTML = "";

            return;

        }

        // Keep the current page within valid limits.
        currentPage = Math.max(
            1,
            Math.min(currentPage, totalPages)
        );

        const startIndex =
            (currentPage - 1) * MOVIES_PER_PAGE;

        const endIndex =
            startIndex + MOVIES_PER_PAGE;

        const currentMovies = filteredMovies.slice(
            startIndex,
            endIndex
        );

        movieGrid.innerHTML = currentMovies
            .map(createMovieCard)
            .filter(Boolean)
            .join("");

        resultCount.textContent =
            `Showing ${startIndex + 1}–${Math.min(
                endIndex,
                totalMovies
            )} of ${totalMovies} movies`;

        renderPagination(totalPages);

    }


    /* =====================================================
       09. NUMBERED PAGINATION
    ===================================================== */

    function renderPagination(totalPages) {

        if (totalPages <= 1) {

            pagination.innerHTML = "";

            return;

        }

        // Always show first and last pages,
        // plus pages around the current page.
        const visiblePages = new Set([
            1,
            totalPages,
            currentPage - 1,
            currentPage,
            currentPage + 1
        ]);

        const pages = [...visiblePages]
            .filter(page =>
                page >= 1 &&
                page <= totalPages
            )
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

            if (
                previousPage &&
                page - previousPage > 1
            ) {

                buttons += `
                    <span class="page-ellipsis">
                        ...
                    </span>
                `;

            }

            buttons += `
                <button
                    class="page-btn ${
                        page === currentPage ? "active" : ""
                    }"
                    type="button"
                    data-page="${page}"
                    aria-label="Page ${page}"
                    aria-current="${
                        page === currentPage ? "page" : "false"
                    }"
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
       10. SEARCH, FILTER AND SORT
    ===================================================== */

    function filterMovies() {

        const searchTerm =
            searchInput?.value.trim().toLowerCase() || "";

        const selectedGenre =
            genreFilter?.value || "all";

        const sortValue =
            sortFilter?.value || "latest";


        filteredMovies = allMovies.filter(movie => {

            const title = String(
                movie.title ||
                movie.name ||
                ""
            ).toLowerCase();

            const category = String(
                movie.category || ""
            ).toLowerCase();

            const overview = String(
                movie.overview ||
                movie.description ||
                ""
            ).toLowerCase();

            const matchesSearch =
                title.includes(searchTerm) ||
                category.includes(searchTerm) ||
                overview.includes(searchTerm);

            const matchesGenre =
                selectedGenre === "all" ||
                category === selectedGenre.toLowerCase();

            return matchesSearch && matchesGenre;

        });


        // SORTING
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


        // Every new search or filter starts on page one.
        currentPage = 1;

        renderMovies();

    }


    /* =====================================================
       11. LOAD MOVIES FROM SUPABASE
    ===================================================== */

    async function loadMovies() {

        movieGrid.innerHTML = `
            <div class="movies-loading">

                <span class="movies-spinner"></span>

                <p>Loading CINEVA movies...</p>

            </div>
        `;

        resultCount.textContent = "Loading movies...";

        pagination.innerHTML = "";

        try {

            const result = await getAllMovies();

            allMovies = Array.isArray(result)
                ? result.filter(movie => movie && movie.id)
                : [];

            console.log(
                `CINEVA: Loaded ${allMovies.length} movies.`,
                allMovies
            );

            filterMovies();

        } catch (error) {

            console.error(
                "CINEVA movies error:",
                error
            );

            movieGrid.innerHTML = `
                <div class="movies-empty">

                    <i class="fa-solid fa-triangle-exclamation"></i>

                    <h3>Unable to load movies</h3>

                    <p>
                        Please check your connection and try again.
                    </p>

                </div>
            `;

            resultCount.textContent =
                "Movies could not be loaded.";

            pagination.innerHTML = "";

        }

    }


    /* =====================================================
       12. PAGINATION CLICK EVENTS
    ===================================================== */

    pagination.addEventListener("click", event => {

        const button = event.target.closest("[data-page]");

        if (!button || button.disabled) return;

        const requestedPage = Number(
            button.dataset.page
        );

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

        // Scroll to the movie grid after changing page.
        movieGrid.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    });


    /* =====================================================
       13. FILTER EVENTS
    ===================================================== */

    searchInput?.addEventListener(
        "input",
        filterMovies
    );

    genreFilter?.addEventListener(
        "change",
        filterMovies
    );

    sortFilter?.addEventListener(
        "change",
        filterMovies
    );


    /* =====================================================
       14. READ GENRE FROM URL
       Example: movies.html?genre=Action
    ===================================================== */

    const urlParams = new URLSearchParams(
        window.location.search
    );

    const urlGenre = urlParams.get("genre");

    if (urlGenre && genreFilter) {

        const matchingOption = [
            ...genreFilter.options
        ].find(option =>
            option.value.toLowerCase() ===
            urlGenre.toLowerCase()
        );

        if (matchingOption) {

            genreFilter.value = matchingOption.value;

        }

    }


    /* =====================================================
       15. START
    ===================================================== */

    loadMovies();

});
