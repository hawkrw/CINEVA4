
import { getAllMovies } from "./supabase.js";

document.addEventListener("DOMContentLoaded", () => {
    const movieGrid = document.querySelector("#movies-grid");
    const searchInput = document.querySelector("#movie-search");
    const genreFilter = document.querySelector("#genre-filter");
    const sortFilter = document.querySelector("#sort-filter");
    const resultCount = document.querySelector("#result-count");

    if (!movieGrid) return;

    let allMovies = [];

    // Escape text before inserting it into HTML.
    function escapeHTML(value = "") {
        return String(value).replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function renderMovies(movies) {
        if (!movies.length) {
            movieGrid.innerHTML = `
                <div class="movies-empty">
                    <h3>No movies found</h3>
                    <p>Try another search or category.</p>
                </div>
            `;

            if (resultCount) resultCount.textContent = "0 movies";
            return;
        }

        movieGrid.innerHTML = movies.map(movie => {
            const id = encodeURIComponent(movie.id);
            const title = escapeHTML(movie.title || "Untitled");
            const category = escapeHTML(movie.category || "Movie");
            const poster = escapeHTML(
                movie.poster_url || movie.thumbnail_url || "assets/images/movie-placeholder.jpg"
            );
            const year = escapeHTML(movie.release_year || "");
            const rating = movie.rating ? Number(movie.rating).toFixed(1) : "";

            return `
                <a class="movie-card" href="watch.html?id=${id}&type=movie">
                    <div class="movie-card-image">
                        <img
                            src="${poster}"
                            alt="${title}"
                            loading="lazy"
                            onerror="this.onerror=null;this.src='assets/images/movie-placeholder.jpg';"
                        >
                        <span class="movie-card-category">${category}</span>
                        ${rating ? `<span class="movie-card-rating">★ ${escapeHTML(rating)}</span>` : ""}
                    </div>

                    <div class="movie-card-info">
                        <h3>${title}</h3>
                        <p>${year || category}</p>
                    </div>
                </a>
            `;
        }).join("");

        if (resultCount) {
            resultCount.textContent =
                `${movies.length} ${movies.length === 1 ? "movie" : "movies"}`;
        }
    }

    function filterMovies() {
        const searchTerm = searchInput?.value.trim().toLowerCase() || "";
        const selectedGenre = genreFilter?.value || "all";
        const sortValue = sortFilter?.value || "latest";

        let filtered = allMovies.filter(movie => {
            const title = (movie.title || "").toLowerCase();
            const category = (movie.category || "").toLowerCase();

            const matchesSearch =
                title.includes(searchTerm) || category.includes(searchTerm);

            const matchesGenre =
                selectedGenre === "all" ||
                category === selectedGenre.toLowerCase();

            return matchesSearch && matchesGenre;
        });

        if (sortValue === "latest") {
            filtered.sort((a, b) =>
                new Date(b.created_at || 0) - new Date(a.created_at || 0)
            );
        } else if (sortValue === "oldest") {
            filtered.sort((a, b) =>
                new Date(a.created_at || 0) - new Date(b.created_at || 0)
            );
        } else if (sortValue === "rating") {
            filtered.sort((a, b) =>
                Number(b.rating || 0) - Number(a.rating || 0)
            );
        } else if (sortValue === "title") {
            filtered.sort((a, b) =>
                (a.title || "").localeCompare(b.title || "")
            );
        }

        renderMovies(filtered);
    }

    async function loadMovies() {
        movieGrid.innerHTML = `<p class="movies-loading">Loading movies...</p>`;

        try {
            allMovies = await getAllMovies();
            allMovies = Array.isArray(allMovies) ? allMovies : [];
            filterMovies();
        } catch (error) {
            console.error("CINEVA movies error:", error);

            movieGrid.innerHTML = `
                <div class="movies-empty">
                    <h3>Unable to load movies</h3>
                    <p>Please check your connection and try again.</p>
                </div>
            `;
        }
    }

    searchInput?.addEventListener("input", filterMovies);
    genreFilter?.addEventListener("change", filterMovies);
    sortFilter?.addEventListener("change", filterMovies);

    loadMovies();
});
