
/* =========================================================
   CINEVA PRO — PREMIUM RESPONSIVE SEARCH MODAL
   Desktop • Tablet • Android • Mobile
   Uses existing Supabase searchContent()
========================================================= */

import { searchContent } from "./supabase.js";

/* =========================================================
   CONFIGURATION
========================================================= */

const SEARCH_CONFIG = {
    delay: 350,
    minCharacters: 1,
    maxResults: 12,
    discoverPage: "genre.html",
    placeholder: "assets/images/movie-placeholder.jpg"
};

/* =========================================================
   STATE
========================================================= */

let searchTimeout = null;
let activeRequest = 0;
let selectedIndex = -1;
let isOpen = false;
let previousFocus = null;

/* =========================================================
   HELPERS
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

function getContentUrl(item) {
    const type = item.content_type === "series" ? "series" : "movie";

    return `watch.html?id=${encodeURIComponent(item.id)}&type=${type}`;
}

function getDiscoverUrl(query) {
    const params = new URLSearchParams();

    params.set("search", query);

    return `${SEARCH_CONFIG.discoverPage}?${params.toString()}`;
}

/* =========================================================
   MODAL STYLES
   Injected automatically — no extra CSS file required.
========================================================= */

function injectSearchStyles() {
    if (document.querySelector("#cineva-search-modal-styles")) return;

    const style = document.createElement("style");

    style.id = "cineva-search-modal-styles";

    style.textContent = `
        .cineva-search-modal,
        .cineva-search-modal * {
            box-sizing: border-box;
        }

        .cineva-search-modal {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding: clamp(12px, 5vh, 65px) 18px 25px;
            background: rgba(3, 3, 12, .88);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity .25s ease, visibility .25s ease;
        }

        .cineva-search-modal.open {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
        }

        .cineva-search-dialog {
            width: min(760px, 100%);
            max-height: min(780px, 90vh);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            color: #f5f5fa;
            background:
                radial-gradient(ellipse at top left,
                    rgba(139,53,245,.16), transparent 45%),
                #10101d;
            border: 1px solid rgba(168,85,247,.25);
            border-radius: 19px;
            box-shadow:
                0 25px 90px rgba(0,0,0,.65),
                0 0 45px rgba(139,53,245,.12);
            transform: translateY(18px) scale(.985);
            transition: transform .3s ease;
        }

        .cineva-search-modal.open .cineva-search-dialog {
            transform: translateY(0) scale(1);
        }

        .cineva-search-header {
            padding: 22px 23px 17px;
            border-bottom: 1px solid rgba(255,255,255,.07);
        }

        .cineva-search-topline {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 17px;
        }

        .cineva-search-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            color: white;
            font-family: 'Outfit', sans-serif;
            font-size: 14px;
            font-weight: 900;
            letter-spacing: 1.5px;
        }

        .cineva-search-brand i {
            color: #a855f7;
            font-size: 17px;
        }

        .cineva-search-close {
            width: 38px;
            height: 38px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            color: #aaa9bc;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 10px;
            cursor: pointer;
            transition: .2s ease;
        }

        .cineva-search-close:hover {
            color: white;
            background: #8b35f5;
            border-color: #8b35f5;
        }

        .cineva-search-field {
            position: relative;
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            min-height: 57px;
            padding: 0 15px;
            background: #090914;
            border: 1px solid rgba(168,85,247,.35);
            border-radius: 12px;
            box-shadow: 0 0 0 3px rgba(139,53,245,.06);
            transition: .2s ease;
        }

        .cineva-search-field:focus-within {
            border-color: #a855f7;
            box-shadow: 0 0 0 4px rgba(139,53,245,.13);
        }

        .cineva-search-field > i {
            color: #a855f7;
            font-size: 17px;
        }

        .cineva-search-field input {
            width: 100%;
            min-width: 0;
            height: 55px;
            color: white;
            background: transparent;
            border: 0;
            outline: none;
            font-family: 'Inter', sans-serif;
            font-size: 15px;
        }

        .cineva-search-field input::placeholder {
            color: #77768d;
        }

        .cineva-search-shortcut {
            flex-shrink: 0;
            padding: 5px 8px;
            color: #77768d;
            background: rgba(255,255,255,.05);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 6px;
            font-size: 10px;
        }

        .cineva-search-body {
            min-height: 150px;
            overflow-y: auto;
            overscroll-behavior: contain;
            padding: 19px 23px 22px;
        }

        .cineva-search-caption {
            margin: 0 0 13px;
            color: #89889e;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 1.5px;
            text-transform: uppercase;
        }

        .cineva-search-results {
            display: grid;
            grid-template-columns: repeat(2, minmax(0,1fr));
            gap: 10px;
        }

        .cineva-search-result {
            min-width: 0;
            min-height: 100px;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px;
            color: white;
            background: rgba(255,255,255,.035);
            border: 1px solid rgba(255,255,255,.065);
            border-radius: 11px;
            text-decoration: none;
            transition: .2s ease;
        }

        .cineva-search-result:hover,
        .cineva-search-result.keyboard-active {
            background: rgba(139,53,245,.13);
            border-color: rgba(168,85,247,.55);
            transform: translateY(-2px);
        }

        .cineva-search-result img {
            width: 57px;
            height: 78px;
            flex: 0 0 57px;
            object-fit: cover;
            background: #202033;
            border-radius: 7px;
        }

        .cineva-search-result-info {
            flex: 1;
            min-width: 0;
        }

        .cineva-search-result-info h4 {
            display: -webkit-box;
            overflow: hidden;
            margin: 0 0 8px;
            color: white;
            font-family: 'Outfit', sans-serif;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.5;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }

        .cineva-search-result-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }

        .cineva-search-result-meta span {
            padding: 4px 6px;
            color: #c2b3df;
            background: rgba(168,85,247,.1);
            border-radius: 4px;
            font-size: 9px;
        }

        .cineva-search-result-arrow {
            flex-shrink: 0;
            color: #a855f7;
            font-size: 17px;
        }

        .cineva-search-status {
            padding: 38px 15px;
            color: #9695aa;
            text-align: center;
            font-size: 12px;
            line-height: 1.7;
        }

        .cineva-search-status i {
            display: block;
            margin-bottom: 13px;
            color: #a855f7;
            font-size: 28px;
        }

        .cineva-search-spinner {
            width: 28px;
            height: 28px;
            margin: 0 auto 13px;
            border: 3px solid rgba(168,85,247,.15);
            border-top-color: #a855f7;
            border-radius: 50%;
            animation: cinevaSearchSpin .7s linear infinite;
        }

        @keyframes cinevaSearchSpin {
            to { transform: rotate(360deg); }
        }

        .cineva-search-view-all {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 9px;
            min-height: 45px;
            margin-top: 15px;
            color: white;
            background: linear-gradient(110deg,#6420c9,#8b35f5);
            border-radius: 9px;
            font-size: 11px;
            font-weight: 800;
            text-decoration: none;
            transition: .2s ease;
        }

        .cineva-search-view-all:hover {
            filter: brightness(1.15);
        }

        .cineva-search-footer {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            padding: 12px 23px;
            color: #77768b;
            background: rgba(0,0,0,.18);
            border-top: 1px solid rgba(255,255,255,.06);
            font-size: 9px;
        }

        .cineva-search-footer strong {
            color: #a855f7;
        }

        body.cineva-search-open {
            overflow: hidden !important;
            touch-action: none;
        }

        @media (max-width: 600px) {
            .cineva-search-modal {
                align-items: stretch;
                padding: 0;
                background: rgba(3,3,12,.96);
                backdrop-filter: blur(12px);
            }

            .cineva-search-dialog {
                width: 100%;
                height: 100%;
                max-height: 100%;
                border: 0;
                border-radius: 0;
                transform: translateY(12px);
            }

            .cineva-search-header {
                padding: max(17px, env(safe-area-inset-top)) 15px 14px;
            }

            .cineva-search-topline {
                margin-bottom: 13px;
            }

            .cineva-search-field {
                min-height: 51px;
                padding: 0 12px;
            }

            .cineva-search-field input {
                height: 49px;
                font-size: 14px;
            }

            .cineva-search-shortcut {
                display: none;
            }

            .cineva-search-body {
                flex: 1;
                padding: 17px 13px 25px;
            }

            .cineva-search-results {
                grid-template-columns: 1fr;
                gap: 9px;
            }

            .cineva-search-result {
                min-height: 91px;
                padding: 9px;
            }

            .cineva-search-result img {
                width: 53px;
                height: 72px;
                flex-basis: 53px;
            }

            .cineva-search-result-info h4 {
                font-size: 12px;
            }

            .cineva-search-footer {
                padding: 12px 15px max(12px, env(safe-area-inset-bottom));
            }
        }

        @media (min-width: 601px) and (max-width: 850px) {
            .cineva-search-results {
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 350px) {
            .cineva-search-header {
                padding-left: 11px;
                padding-right: 11px;
            }

            .cineva-search-body {
                padding-left: 10px;
                padding-right: 10px;
            }

            .cineva-search-result {
                gap: 9px;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            .cineva-search-modal,
            .cineva-search-dialog,
            .cineva-search-result,
            .cineva-search-close {
                transition: none !important;
            }

            .cineva-search-spinner {
                animation-duration: 1.5s;
            }
        }
    `;

    document.head.appendChild(style);
}

/* =========================================================
   CREATE MODAL
========================================================= */

function createSearchModal() {
    if (document.querySelector("#cinevaSearchModal")) {
        return;
    }

    const modal = document.createElement("div");

    modal.className = "cineva-search-modal";
    modal.id = "cinevaSearchModal";

    modal.innerHTML = `
        <section
            class="cineva-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Search CINEVA"
        >
            <header class="cineva-search-header">

                <div class="cineva-search-topline">
                    <div class="cineva-search-brand">
                        <i class="fa-solid fa-clapperboard"></i>
                        <span>CINEVA SEARCH</span>
                    </div>

                    <button
                        class="cineva-search-close"
                        type="button"
                        aria-label="Close search"
                    >
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="cineva-search-field">
                    <i class="fa-solid fa-magnifying-glass"></i>

                    <input
                        id="cinevaSearchInput"
                        type="search"
                        placeholder="Search movies, series..."
                        autocomplete="off"
                        aria-label="Search movies and series"
                        aria-controls="cinevaSearchResults"
                    >

                    <span class="cineva-search-shortcut">ESC</span>
                </div>

            </header>

            <main class="cineva-search-body">

                <p class="cineva-search-caption" id="cinevaSearchCaption">
                    Discover entertainment
                </p>

                <div
                    class="cineva-search-results"
                    id="cinevaSearchResults"
                    role="listbox"
                    aria-label="Search results"
                >
                    <div class="cineva-search-status">
                        <i class="fa-solid fa-film"></i>
                        Find your next favorite movie or series.
                    </div>
                </div>

            </main>

            <footer class="cineva-search-footer">
                <span>Powered by <strong>CINEVA PRO</strong></span>
                <span>Movies • Series • Entertainment</span>
            </footer>
        </section>
    `;

    document.body.appendChild(modal);
}

/* =========================================================
   ELEMENTS
========================================================= */

injectSearchStyles();
createSearchModal();

const modal = document.querySelector("#cinevaSearchModal");
const dialog = modal.querySelector(".cineva-search-dialog");
const modalInput = modal.querySelector("#cinevaSearchInput");
const modalResults = modal.querySelector("#cinevaSearchResults");
const modalCaption = modal.querySelector("#cinevaSearchCaption");
const closeButton = modal.querySelector(".cineva-search-close");

const existingInput = document.querySelector("#search-input");
const existingForm = document.querySelector("#search-form");
const existingResults = document.querySelector("#search-results");

/* =========================================================
   OPEN MODAL
========================================================= */

function openSearchModal() {
    if (isOpen) return;

    previousFocus = document.activeElement;
    isOpen = true;

    modal.classList.add("open");
    document.body.classList.add("cineva-search-open");

    if (existingInput?.value.trim()) {
        modalInput.value = existingInput.value.trim();
        performSearch(modalInput.value);
    } else {
        resetSearchView();
    }

    requestAnimationFrame(() => {
        modalInput.focus();
        modalInput.setSelectionRange(
            modalInput.value.length,
            modalInput.value.length
        );
    });
}

/* =========================================================
   CLOSE MODAL
========================================================= */

function closeSearchModal() {
    if (!isOpen) return;

    isOpen = false;

    modal.classList.remove("open");
    document.body.classList.remove("cineva-search-open");

    clearTimeout(searchTimeout);
    activeRequest++;

    if (existingResults) {
        existingResults.classList.remove("active");
    }

    if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
    }
}

closeButton.addEventListener("click", closeSearchModal);

modal.addEventListener("click", event => {
    if (event.target === modal) {
        closeSearchModal();
    }
});

/* =========================================================
   RESET VIEW
========================================================= */

function resetSearchView() {
    selectedIndex = -1;

    modalCaption.textContent = "Discover entertainment";

    modalResults.innerHTML = `
        <div class="cineva-search-status">
            <i class="fa-solid fa-film"></i>
            Find your next favorite movie or series.
        </div>
    `;
}

/* =========================================================
   LOADING
========================================================= */

function renderLoading() {
    modalCaption.textContent = "Searching";

    modalResults.innerHTML = `
        <div class="cineva-search-status">
            <div class="cineva-search-spinner"></div>
            Searching CINEVA...
        </div>
    `;
}

/* =========================================================
   RENDER RESULTS
========================================================= */

function renderResults(results, query) {
    selectedIndex = -1;

    if (!Array.isArray(results) || results.length === 0) {
        modalCaption.textContent = "No results found";

        modalResults.innerHTML = `
            <div class="cineva-search-status">
                <i class="fa-solid fa-face-frown"></i>
                No movies or series found for
                <strong>${escapeHTML(query)}</strong>.
            </div>

            <a class="cineva-search-view-all"
               href="${escapeHTML(getDiscoverUrl(query))}">
                Explore all content
                <i class="fa-solid fa-arrow-right"></i>
            </a>
        `;

        return;
    }

    const limited = results.slice(0, SEARCH_CONFIG.maxResults);

    modalCaption.textContent =
        `${results.length} result${results.length === 1 ? "" : "s"} found`;

    modalResults.innerHTML = `
        ${limited.map(item => {
            const title = escapeHTML(item.title || "Untitled");

            const poster = escapeHTML(
                item.poster_url ||
                item.poster ||
                item.thumbnail ||
                SEARCH_CONFIG.placeholder
            );

            const category = escapeHTML(item.category || "Uncategorized");

            const year = escapeHTML(
                item.release_year || item.year || ""
            );

            const type = item.content_type === "series"
                ? "Series"
                : "Movie";

            return `
                <a
                    href="${escapeHTML(getContentUrl(item))}"
                    class="cineva-search-result"
                    role="option"
                    aria-label="Open ${title}"
                >
                    <img
                        src="${poster}"
                        alt="${title}"
                        loading="lazy"
                        onerror="this.onerror=null;this.src='${SEARCH_CONFIG.placeholder}';"
                    >

                    <div class="cineva-search-result-info">
                        <h4>${title}</h4>

                        <div class="cineva-search-result-meta">
                            <span>${type}</span>
                            <span>${category}</span>
                            ${year ? `<span>${year}</span>` : ""}
                        </div>
                    </div>

                    <span class="cineva-search-result-arrow">
                        <i class="fa-solid fa-chevron-right"></i>
                    </span>
                </a>
            `;
        }).join("")}

        <a
            class="cineva-search-view-all"
            href="${escapeHTML(getDiscoverUrl(query))}"
        >
            View all search results
            <i class="fa-solid fa-arrow-right"></i>
        </a>
    `;
}

/* =========================================================
   PERFORM SUPABASE SEARCH
========================================================= */

async function performSearch(value) {
    const query = value.trim();

    if (!query || !isOpen) {
        resetSearchView();
        return;
    }

    const requestId = ++activeRequest;

    renderLoading();

    try {
        const results = await searchContent(query);

        if (!isOpen || requestId !== activeRequest) return;

        renderResults(results, query);

    } catch (error) {
        console.error("CINEVA modal search failed:", error);

        if (!isOpen || requestId !== activeRequest) return;

        modalCaption.textContent = "Search unavailable";

        modalResults.innerHTML = `
            <div class="cineva-search-status">
                <i class="fa-solid fa-triangle-exclamation"></i>
                Unable to search right now. Please try again.
            </div>

            <button
                class="cineva-search-view-all"
                type="button"
                id="cinevaSearchRetry"
            >
                <i class="fa-solid fa-rotate-right"></i>
                Try again
            </button>
        `;

        modalResults
            .querySelector("#cinevaSearchRetry")
            ?.addEventListener("click", () => {
                performSearch(modalInput.value);
            });
    }
}

/* =========================================================
   INPUT + DEBOUNCE
========================================================= */

modalInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);

    activeRequest++;
    selectedIndex = -1;

    const query = modalInput.value.trim();

    if (query.length < SEARCH_CONFIG.minCharacters) {
        resetSearchView();
        return;
    }

    searchTimeout = setTimeout(() => {
        performSearch(query);
    }, SEARCH_CONFIG.delay);
});

/* =========================================================
   KEYBOARD NAVIGATION
========================================================= */

modalInput.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        event.preventDefault();
        closeSearchModal();
        return;
    }

    const items = [
        ...modalResults.querySelectorAll(".cineva-search-result")
    ];

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

/* =========================================================
   SUBMIT SEARCH
========================================================= */

function submitSearch() {
    const query = modalInput.value.trim();

    if (!query) {
        modalInput.focus();
        return;
    }

    window.location.href = getDiscoverUrl(query);
}

modalInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        submitSearch();
    }
});

/* =========================================================
   EXISTING HEADER SEARCH INTEGRATION
========================================================= */

if (existingInput) {
    existingInput.setAttribute("readonly", "readonly");

    existingInput.addEventListener("focus", event => {
        event.preventDefault();
        openSearchModal();
    });

    existingInput.addEventListener("click", openSearchModal);
}

if (existingForm) {
    existingForm.addEventListener("submit", event => {
        event.preventDefault();
        openSearchModal();
    });
}

/* =========================================================
   MOBILE SEARCH BUTTON SUPPORT
========================================================= */

document.addEventListener("click", event => {
    const searchTrigger = event.target.closest(
        '[data-open-search], .search-trigger, #openSearch'
    );

    if (searchTrigger) {
        event.preventDefault();
        openSearchModal();
    }
});

/* =========================================================
   GLOBAL KEYBOARD SHORTCUT
========================================================= */

document.addEventListener("keydown", event => {
    const target = event.target;

    const typing =
        target instanceof HTMLElement &&
        (
            target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
        );

    if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
    ) {
        event.preventDefault();
        openSearchModal();
        return;
    }

    if (
        event.key === "/" &&
        !typing &&
        !isOpen
    ) {
        event.preventDefault();
        openSearchModal();
    }
});

/* =========================================================
   INITIALIZATION
========================================================= */

console.log("CINEVA PRO premium responsive search modal initialized.");
