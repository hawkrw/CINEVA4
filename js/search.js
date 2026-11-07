
/* =========================================================
   CINEVA PRO — PREMIUM LIVE SEARCH SYSTEM
   Global search dropdown + Discover integration
========================================================= */

import { searchContent } from "./supabase.js";

/* =========================================================
   ELEMENTS
========================================================= */

const searchInput = document.querySelector("#search-input");
const searchResults = document.querySelector("#search-results");
const searchForm = document.querySelector("#search-form");

let searchTimeout = null;
let activeRequest = 0;
let selectedIndex = -1;

/* =========================================================
   CONFIGURATION
========================================================= */

const SEARCH_CONFIG = {
    delay: 350,
    minCharacters: 1,
    maxResults: 8,
    discoverPage: "genre.html"
};

/* =========================================================
   SAFE HTML
========================================================= */

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

/* =========================================================
   CONTENT URL
========================================================= */

function getContentUrl(item) {
    const type = item.content_type === "series"
        ? "series"
        : "movie";

    return `watch.html?id=${encodeURIComponent(item.id)}&type=${type}`;
}

/* =========================================================
   DISCOVER URL
========================================================= */

function getDiscoverUrl(query) {
    const params = new URLSearchParams(window.location.search);

    params.set("search", query);
    params.delete("page");

    return `${SEARCH_CONFIG.discoverPage}?${params.toString()}`;
}

/* =========================================================
   CLEAR RESULTS
========================================================= */

function clearResults() {
    activeRequest++;
    selectedIndex = -1;

    if (!searchResults) return;

    searchResults.innerHTML = "";
    searchResults.classList.remove("active");
}

/* =========================================================
   RENDER LOADING
========================================================= */

function renderLoading() {
    if (!searchResults) return;

    searchResults.innerHTML = `
        <div class="search-loading">
            <div class="loading-spinner"></div>
            <p>Searching CINEVA...</p>
        </div>
    `;

    searchResults.classList.add("active");
}

/* =========================================================
   RENDER RESULTS
========================================================= */

function renderResults(results, query) {
    if (!searchResults) return;

    selectedIndex = -1;

    if (!Array.isArray(results) || results.length === 0) {
        searchResults.innerHTML = `
            <div class="search-empty">
                <span>⌕</span>
                <p>No movies or series found.</p>
                <a href="${getDiscoverUrl(query)}">
                    Explore all content
                </a>
            </div>
        `;

        searchResults.classList.add("active");
        return;
    }

    const limitedResults = results.slice(
        0,
        SEARCH_CONFIG.maxResults
    );

    searchResults.innerHTML = `
        ${limitedResults.map(item => {
            const title = escapeHTML(item.title || "Untitled");

            const poster = escapeHTML(
                item.poster_url ||
                item.poster ||
                item.thumbnail ||
                "assets/images/movie-placeholder.jpg"
            );

            const category = escapeHTML(
                item.category || "Uncategorized"
            );

            const year = escapeHTML(
                item.release_year || item.year || ""
            );

            const type = item.content_type === "series"
                ? "Series"
                : "Movie";

            return `
                <a
                    href="${getContentUrl(item)}"
                    class="search-result-item"
                    role="option"
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
        }).join("")}

        <a
            class="search-view-all"
            href="${getDiscoverUrl(query)}"
        >
            View all results
            <span>→</span>
        </a>
    `;

    searchResults.classList.add("active");
}

/* =========================================================
   PERFORM LIVE SEARCH
========================================================= */

async function performSearch(value) {
    const query = value.trim();

    if (!searchResults) return;

    if (query.length < SEARCH_CONFIG.minCharacters) {
        clearResults();
        return;
    }

    const requestId = ++activeRequest;

    renderLoading();

    try {
        const results = await searchContent(query);

        // Ignore outdated requests.
        if (requestId !== activeRequest) return;

        renderResults(results, query);

    } catch (error) {
        console.error("CINEVA search failed:", error);

        if (requestId !== activeRequest) return;

        searchResults.innerHTML = `
            <div class="search-error">
                <p>Unable to search right now.</p>
                <button type="button" class="search-retry">
                    Try again
                </button>
            </div>
        `;

        searchResults.classList.add("active");

        searchResults
            .querySelector(".search-retry")
            ?.addEventListener("click", () => {
                performSearch(searchInput?.value || "");
            });
    }
}

/* =========================================================
   LIVE SEARCH INPUT
========================================================= */

if (searchInput && searchResults) {

    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimeout);

        selectedIndex = -1;

        const value = searchInput.value.trim();

        if (!value) {
            clearResults();
            return;
        }

        // Immediately invalidate older requests.
        activeRequest++;

        searchTimeout = setTimeout(() => {
            performSearch(value);
        }, SEARCH_CONFIG.delay);
    });

    searchInput.addEventListener("focus", () => {
        if (searchResults.innerHTML.trim()) {
            searchResults.classList.add("active");
        }
    });
}

/* =========================================================
   GLOBAL SEARCH SUBMISSION
========================================================= */

if (searchForm && searchInput) {

    searchForm.addEventListener("submit", event => {
        event.preventDefault();

        clearTimeout(searchTimeout);

        const query = searchInput.value.trim();

        if (!query) {
            searchInput.focus();
            return;
        }

        // Discover owns the full search results.
        window.location.href = getDiscoverUrl(query);
    });
}

/* =========================================================
   KEYBOARD NAVIGATION
========================================================= */

if (searchInput && searchResults) {

    searchInput.addEventListener("keydown", event => {

        const items = [
            ...searchResults.querySelectorAll(
                ".search-result-item"
            )
        ];

        if (event.key === "Escape") {
            clearResults();
            searchInput.blur();
            return;
        }

        if (!items.length) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();

            selectedIndex = Math.min(
                selectedIndex + 1,
                items.length - 1
            );

        } else if (event.key === "ArrowUp") {
            event.preventDefault();

            selectedIndex = Math.max(
                selectedIndex - 1,
                0
            );

        } else {
            return;
        }

        items.forEach((item, index) => {
            item.classList.toggle(
                "keyboard-active",
                index === selectedIndex
            );
        });

        items[selectedIndex]?.scrollIntoView({
            block: "nearest"
        });
    });
}

/* =========================================================
   CLOSE DROPDOWN WHEN CLICKING OUTSIDE
========================================================= */

document.addEventListener("click", event => {
    if (!searchInput || !searchResults) return;

    const clickedInside =
        searchForm?.contains(event.target) ||
        searchResults.contains(event.target);

    if (!clickedInside) {
        searchResults.classList.remove("active");
        selectedIndex = -1;
    }
});

/* =========================================================
   INITIALIZATION
========================================================= */

console.log("CINEVA PRO live search initialized.");
