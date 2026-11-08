
import { getAllSeries } from "./supabase.js";

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

    // Validate poster URLs.
    function safeImageURL(value) {
        try {
            const url = new URL(value, window.location.href);

            if (
                url.protocol === "https:" ||
                url.protocol === "http:"
            ) {
                return url.href;
            }
        } catch {
            // Use placeholder below.
        }

        return "assets/images/movie-placeholder.jpg";
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
            series.translator?.trim() || ""
        );

        const poster = escapeHTML(
            safeImageURL(
                series.poster_url ||
                series.thumbnail_url ||
                ""
            )
        );

        const year = escapeHTML(series.release_year || "");
        const rating = Number(series.rating || 0);

        return `
            <a
                class="movie-card"
                href="watch.html?id=${id}&type=series"
            >
                <div class="movie-card-image">
                    <img
                        src="${poster}"
                        alt="${title}"
                        loading="lazy"
                        onerror="this.onerror=null;this.src='assets/images/movie-placeholder.jpg';"
                    >

                    <span class="movie-card-category">
                        ${category}
                    </span>

                    ${translator ? `
                        <span class="movie-translator-badge">
                            <i class="fa-solid fa-language"></i>
                            ${translator}
                        </span>
                    ` : ""}

                    ${rating > 0 ? `
                        <span class="movie-card-rating">
                            ★ ${rating.toFixed(1)}
                        </span>
                    ` : ""}
                </div>

                <div class="movie-card-info">
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
            const title = (series.title || "").toLowerCase();
            const category = (series.category || "").toLowerCase();

            const matchesSearch =
                title.includes(searchTerm) ||
                category.includes(searchTerm);

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
