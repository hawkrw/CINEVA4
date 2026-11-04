
/* =========================================
   CINEVA — LIVE SEARCH SYSTEM
========================================= */

import { searchContent } from "./supabase.js";

/* =========================================
   SEARCH ELEMENTS
========================================= */

const searchInput = document.querySelector("#search-input");
const searchResults = document.querySelector("#search-results");
const searchForm = document.querySelector("#search-form");

let searchTimeout = null;
let activeRequest = 0;

/* =========================================
   SAFE HTML
========================================= */

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

/* =========================================
   CONTENT URL
========================================= */

function getContentUrl(item) {
    const type = item.content_type || "movie";

    return `watch.html?id=${encodeURIComponent(item.id)}&type=${type}`;
}

/* =========================================
   SHOW SEARCH RESULTS
========================================= */

function renderResults(results) {
    if (!searchResults) return;

    if (!results.length) {
        searchResults.innerHTML = `
            <div class="search-empty">
                <span>⌕</span>
                <p>No movies or series found.</p>
            </div>
        `;

        searchResults.classList.add("active");
        return;
    }

    searchResults.innerHTML = results.map(item => {
        const title = escapeHTML(item.title || "Untitled");
        const poster = escapeHTML(
            item.poster_url ||
            "assets/images/movie-placeholder.jpg"
        );

        const category = escapeHTML(item.category || "Uncategorized");
        const year = escapeHTML(item.release_year || "");
        const type = item.content_type === "series" ? "Series" : "Movie";

        return `
            <a
                href="${getContentUrl(item)}"
                class="search-result-item"
            >
                <img
                    src="${poster}"
                    alt="${title}"
                    loading="lazy"
                    onerror="this.onerror=null;this.src='assets/images/movie-placeholder.jpg';"
                >

                <div class="search-result-info">
                    <h4>${title}</h4>

                    <div class="search-result-meta">
                        <span>${type}</span>
                        <span>${category}</span>
                        ${year ? `<span>${year}</span>` : ""}
                    </div>
                </div>

                <span class="search-result-arrow">→</span>
            </a>
        `;
    }).join("");

    searchResults.classList.add("active");
}

/* =========================================
   SEARCH CONTENT
========================================= */

async function performSearch(value) {
    const query = value.trim();

    if (!searchResults) return;

    if (!query) {
        searchResults.innerHTML = "";
        searchResults.classList.remove("active");
        return;
    }

    const requestId = ++activeRequest;

    searchResults.innerHTML = `
        <div class="search-loading">
            <div class="loading-spinner"></div>
            <p>Searching CINEVA...</p>
        </div>
    `;

    searchResults.classList.add("active");

    try {
        const results = await searchContent(query);

        // Ignore outdated search responses
        if (requestId !== activeRequest) return;

        renderResults(results);

    } catch (error) {
        console.error("Search failed:", error);

        if (requestId !== activeRequest) return;

        searchResults.innerHTML = `
            <div class="search-error">
                <p>Something went wrong. Please try again.</p>
            </div>
        `;

        searchResults.classList.add("active");
    }
}

/* =========================================
   LIVE SEARCH INPUT
========================================= */

if (searchInput && searchResults) {

    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimeout);

        const value = searchInput.value;

        if (!value.trim()) {
            activeRequest++;

            searchResults.innerHTML = "";
            searchResults.classList.remove("active");
            return;
        }

        searchTimeout = setTimeout(() => {
            performSearch(value);
        }, 350);
    });

    searchInput.addEventListener("focus", () => {
        if (searchResults.innerHTML.trim()) {
            searchResults.classList.add("active");
        }
    });
}

/* =========================================
   SEARCH FORM SUBMISSION
========================================= */

if (searchForm && searchInput) {
    searchForm.addEventListener("submit", event => {
        event.preventDefault();

        clearTimeout(searchTimeout);

        performSearch(searchInput.value);

        searchInput.focus();
    });
}

/* =========================================
   CLOSE SEARCH RESULTS
========================================= */

document.addEventListener("click", event => {
    if (!searchInput || !searchResults) return;

    const clickedInsideSearch =
        searchInput.contains(event.target) ||
        searchResults.contains(event.target) ||
        searchForm?.contains(event.target);

    if (!clickedInsideSearch) {
        searchResults.classList.remove("active");
    }
});

/* =========================================
   KEYBOARD SUPPORT
========================================= */

if (searchInput) {
    searchInput.addEventListener("keydown", event => {

        if (event.key === "Escape") {
            searchResults?.classList.remove("active");
            searchInput.blur();
        }

    });
}

console.log("CINEVA search system loaded.");
