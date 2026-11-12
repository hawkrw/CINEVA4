
import { getAllSeries } from "./supabase.js?v=20261112-latest-episode-promotion-2";

document.addEventListener("DOMContentLoaded", () => {
    const seriesGrid = document.querySelector("#series-grid");
    const searchInput = document.querySelector("#series-search");
    const genreFilter = document.querySelector("#series-genre-filter");
    const sortFilter = document.querySelector("#series-sort-filter");
    const resultCount = document.querySelector("#series-result-count");

    if (!seriesGrid) return;

    let allSeries = [];

    // Safely escape text before inserting it into HTML.
    function escapeHTML(value = "") {
        return String(value).replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    // Resolve Supabase poster URLs and TMDB poster_path values safely.
    const POSTER_PLACEHOLDER = "/assets/images/movie-placeholder.jpg";

    function safeImageURL(value) {
        if (value === null || value === undefined) return POSTER_PLACEHOLDER;

        let candidate = String(value).trim();
        if (!candidate) return POSTER_PLACEHOLDER;

        // TMDB stores poster_path as a path, while admin uploads are full URLs.
        if (candidate.startsWith("/assets/")) {
            // Keep local CINEVA assets on the current origin.
        } else if (candidate.startsWith("/")) {
            candidate = "https://image.tmdb.org/t/p/w500" + candidate;
        } else if (candidate.startsWith("assets/")) {
            candidate = "/" + candidate;
        }

        try {
            const url = new URL(candidate, window.location.href);
            if (url.protocol === "https:" || url.protocol === "http:") {
                return url.href;
            }
        } catch {
            // Use the local placeholder below.
        }

        return POSTER_PLACEHOLDER;
    }
    // Display series cards.
 
// Display series cards with translator badges.
function renderSeries(seriesList) {
    if (!seriesList.length) {
        seriesGrid.innerHTML = `
            <div class="series-empty">
                <h3>No series found</h3>
                <p>Try another search or genre.</p>
            </div>
        `;

        if (resultCount) {
            resultCount.textContent = "0 series";
        }

        return;
    }

    seriesGrid.innerHTML = seriesList.map(series => {
        const id = encodeURIComponent(series.id);
        const title = escapeHTML(series.title || "Untitled Series");
        const category = escapeHTML(series.category || "Series");

        const translator = escapeHTML(
            String(series.translator || "").trim()
        );

        const poster = escapeHTML(
            safeImageURL(
                series.poster ||
                series.image ||
                series.poster_url ||
                series.thumbnail_url ||
                series.poster_path ||
                ""
            )
        );

        const yearValue = series.year || series.release_year || (series.release_date ? String(series.release_date).slice(0, 4) : "");
        const year = escapeHTML(yearValue);
        const rating = Number(series.rating || 0);

        return `
            <a
                class="movie-card"
                href="watch.html?id=${id}&type=series"
            >
                <div class="movie-poster">
                    <img
                        src="${poster}"
                        alt="${title}"
                        loading="lazy"
                        onerror="this.onerror=null;this.src='/assets/images/movie-placeholder.jpg';"
                    >

                    <span class="movie-type">
                        ${category}
                    </span>

                    ${translator ? `
                        <span class="movie-translator-badge">
                            <i class="fa-solid fa-language"></i>
                            ${translator}
                        </span>
                    ` : ""}

                    ${rating > 0 ? `
                        <span class="movie-rating">
                            ★ ${rating.toFixed(1)}
                        </span>
                    ` : ""}
                </div>

                <div class="movie-info">
                    <h3>${title}</h3>
                    <p>${year || "TV Series"}</p>
                </div>
            </a>
        `;
    }).join("");

    if (resultCount) {
        resultCount.textContent =
            `${seriesList.length} series`;
    }
}

    // Search, filter and sort series.
    function filterSeries() {
        const searchTerm =
            searchInput?.value.trim().toLowerCase() || "";

        const selectedGenre =
            genreFilter?.value || "all";

        const sortValue =
            sortFilter?.value || "latest";

        let filtered = allSeries.filter(series => {
            const searchableFields = [
                series.title, series.original_title, series.translator,
                series.category, series.overview, series.description, series.genre,
                ...(Array.isArray(series.genres) ? series.genres : [series.genres])
            ];

            const searchableText = searchableFields
                .filter(value => value !== null && value !== undefined)
                .map(value => String(value).trim().toLocaleLowerCase())
                .filter(Boolean)
                .join(" ");

            const category = String(series.category || "").trim().toLocaleLowerCase();
            const matchesSearch = !searchTerm || searchableText.includes(searchTerm);

            const matchesGenre =
                selectedGenre === "all" ||
                category === selectedGenre.toLowerCase();

            return matchesSearch && matchesGenre;
        });

        switch (sortValue) {
            case "oldest":
                filtered.sort((a, b) =>
                    new Date(a.created_at || 0) -
                    new Date(b.created_at || 0)
                );
                break;

            case "rating":
                filtered.sort((a, b) =>
                    Number(b.rating || 0) -
                    Number(a.rating || 0)
                );
                break;

            case "title":
                filtered.sort((a, b) =>
                    (a.title || "").localeCompare(b.title || "")
                );
                break;

            default:
                filtered.sort((a, b) =>
                    new Date(b.created_at || 0) -
                    new Date(a.created_at || 0)
                );
        }

        renderSeries(filtered);
    }

    // Load series from Supabase.
    async function loadSeries() {
        seriesGrid.innerHTML = `
            <p class="series-loading">
                Loading CINEVA series...
            </p>
        `;

        try {
            allSeries = await getAllSeries();

            if (!Array.isArray(allSeries)) {
                allSeries = [];
            }

            filterSeries();

        } catch (error) {
            console.error("CINEVA series loading error:", error);

            seriesGrid.innerHTML = `
                <div class="series-empty">
                    <h3>Unable to load series</h3>
                    <p>Please check your internet connection and try again.</p>
                </div>
            `;

            if (resultCount) {
                resultCount.textContent = "Loading failed";
            }
        }
    }

    // Event listeners.
    searchInput?.addEventListener("input", filterSeries);
    genreFilter?.addEventListener("change", filterSeries);
    sortFilter?.addEventListener("change", filterSeries);

    // Start application.
    loadSeries();
});
