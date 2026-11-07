
import { getAllMovies } from "./supabase.js";

document.addEventListener("DOMContentLoaded", () => {
    const movieGrid = document.querySelector("#movies-grid");
    const searchInput = document.querySelector("#movie-search");
    const genreFilter = document.querySelector("#genre-filter");
    const sortFilter = document.querySelector("#sort-filter");
    const resultCount = document.querySelector("#result-count");

    if (!movieGrid) return;

    const MOVIES_PER_PAGE = 20;

    let allMovies = [];
    let filteredMovies = [];
    let currentPage = 1;

    // Create the pagination element after the movie grid.
    const pagination = document.createElement("nav");
    pagination.className = "movies-pagination";
    pagination.id = "movies-pagination";
    pagination.setAttribute("aria-label", "Movies pages");
    movieGrid.insertAdjacentElement("afterend", pagination);

    function escapeHTML(value = "") {
        return String(value).replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function safeImageURL(value) {
        if (typeof value !== "string" || !value.trim()) {
            return "assets/images/movie-placeholder.jpg";
        }

        const image = value.trim();

        if (/^https?:\/\//i.test(image)) {
            try {
                const url = new URL(image);
                return ["http:", "https:"].includes(url.protocol)
                    ? url.href
                    : "assets/images/movie-placeholder.jpg";
            } catch {
                return "assets/images/movie-placeholder.jpg";
            }
        }

        if (
            image.startsWith("/") ||
            image.startsWith("./") ||
            image.startsWith("../") ||
            image.startsWith("assets/")
        ) {
            return image;
        }

        // TMDB-style image paths.
        if (image.startsWith("/")) {
            return `https://image.tmdb.org/t/p/w500${image}`;
        }

        return image;
    }

    function getMoviePoster(movie) {
        return safeImageURL(
            movie.poster_url ||
            movie.poster ||
            movie.poster_path ||
            movie.thumbnail_url ||
            movie.thumbnail ||
            movie.image_url ||
            movie.image ||
            ""
        );
    }

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

    function getMovieRating(movie) {
        const value = Number(
            movie.rating ?? movie.vote_average ?? 0
        );

        return Number.isFinite(value) && value > 0
            ? value.toFixed(1)
            : "";
    }

    function createMovieCard(movie) {
        if (!movie || !movie.id) return "";

        const id = encodeURIComponent(movie.id);
        const title = escapeHTML(movie.title || movie.name || "Untitled");
        const category = escapeHTML(movie.category || "Movie");
        const poster = escapeHTML(getMoviePoster(movie));
        const year = escapeHTML(getMovieYear(movie));
        const rating = getMovieRating(movie);
        const translator = escapeHTML(
            typeof movie.translator === "string"
                ? movie.translator.trim()
                : ""
        );

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
                        onerror="this.onerror=null;this.src='assets/images/movie-placeholder.jpg';"
                    >

                    <span class="movie-type">MOVIE</span>

                    ${translator ? `
                        <span class="movie-translator-badge">
                            <i class="fa-solid fa-language"></i>
                            ${translator}
                        </span>
                    ` : ""}

                    ${rating ? `
                        <span class="movie-rating">
                            <i class="fa-solid fa-star"></i>
                            ${escapeHTML(rating)}
                        </span>
                    ` : ""}

                    <div class="movie-overlay">
                        <span class="play-icon">
                            <i class="fa-solid fa-play"></i>
                        </span>
                    </div>
                </div>

                <div class="movie-info">
                    <h3 title="${title}">${title}</h3>

                    <div class="movie-meta">
                        <span>${category}</span>
                        ${year ? `<span>${year}</span>` : ""}
                    </div>
                </div>
            </a>
        `;
    }

    function renderMovies() {
        const totalMovies = filteredMovies.length;
        const totalPages = Math.ceil(totalMovies / MOVIES_PER_PAGE);

        if (!totalMovies) {
            movieGrid.innerHTML = `
                <div class="movies-empty">
                    <i class="fa-solid fa-film"></i>
                    <h3>No movies found</h3>
                    <p>Try another search or category.</p>
                </div>
            `;

            resultCount.textContent = "0 movies found";
            pagination.innerHTML = "";
            return;
        }

        // Keep the selected page within the available range.
        currentPage = Math.min(Math.max(currentPage, 1), totalPages);

        const startIndex = (currentPage - 1) * MOVIES_PER_PAGE;
        const pageMovies = filteredMovies.slice(
            startIndex,
            startIndex + MOVIES_PER_PAGE
        );

        movieGrid.innerHTML = pageMovies
            .map(createMovieCard)
            .filter(Boolean)
            .join("");

        const firstMovie = startIndex + 1;
        const lastMovie = Math.min(
            startIndex + pageMovies.length,
            totalMovies
        );

        resultCount.textContent =
            `Showing ${firstMovie}–${lastMovie} of ${totalMovies} movies`;

        renderPagination(totalPages);

        // Return the user to the movie grid after changing pages.
        movieGrid.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    function renderPagination(totalPages) {
        if (totalPages <= 1) {
            pagination.innerHTML = "";
            return;
        }

        let pages = [];

        // Always show first and last pages, with nearby pages.
        const visiblePages = new Set([
            1,
            totalPages,
            currentPage - 1,
            currentPage,
            currentPage + 1
        ]);

        pages = [...visiblePages]
            .filter(page => page >= 1 && page <= totalPages)
            .sort((a, b) => a - b);

        let buttons = `
            <button
                class="page-btn page-arrow"
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
                buttons += `<span class="page-ellipsis">...</span>`;
            }

            buttons += `
                <button
                    class="page-btn ${page === currentPage ? "active" : ""}"
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

    function filterMovies() {
        const searchTerm =
            searchInput?.value.trim().toLowerCase() || "";

        const selectedGenre =
            genreFilter?.value || "all";

        const sortValue =
            sortFilter?.value || "latest";

        filteredMovies = allMovies.filter(movie => {
            const title = String(
                movie.title || movie.name || ""
            ).toLowerCase();

            const category = String(
                movie.category || ""
            ).toLowerCase();

            const overview = String(
                movie.overview || movie.description || ""
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

        // Every new search/filter starts from page one.
        currentPage = 1;
        renderMovies();
    }

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

            resultCount.textContent = "Movies could not be loaded.";
            pagination.innerHTML = "";
        }
    }

    // Pagination click handling.
    pagination.addEventListener("click", event => {
        const button = event.target.closest("[data-page]");

        if (!button || button.disabled) return;

        const requestedPage = Number(button.dataset.page);

        if (
            !Number.isInteger(requestedPage) ||
            requestedPage < 1 ||
            requestedPage > Math.ceil(
                filteredMovies.length / MOVIES_PER_PAGE
            )
        ) {
            return;
        }

        currentPage = requestedPage;
        renderMovies();
    });

    searchInput?.addEventListener("input", filterMovies);
    genreFilter?.addEventListener("change", filterMovies);
    sortFilter?.addEventListener("change", filterMovies);

    loadMovies();
});
