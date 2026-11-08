
/* =========================================================
   CINEVA PRO — PREMIUM RESPONSIVE SEARCH SYSTEM
   Desktop • Tablet • Android • Mobile
   Supabase powered searchContent()
   
   Features:
   - Full-screen premium search modal
   - Reliable mobile search button support
   - Close button and outside-click closing
   - Escape key support
   - Ctrl + K / Cmd + K shortcut
   - Debounced Supabase search
   - Keyboard navigation
   - Mobile-friendly scrolling
   - Safe result rendering
   - No dependency on additional CSS files
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

function safeImageUrl(value) {
    if (!value) return SEARCH_CONFIG.placeholder;

    const url = String(value).trim();

    // Reject executable and unsupported image URLs.
    if (/^(javascript|vbscript|data):/i.test(url)) {
        return SEARCH_CONFIG.placeholder;
    }

    return url;
}

function getContentUrl(item) {
    const type =
        item.content_type === "series" ||
        item.type === "series"
            ? "series"
            : "movie";

    const id = type === "series" ? item.id : (item.public_id ?? item.id);

    return `/${type}/${encodeURIComponent(id)}`;
}

function getDiscoverUrl(query) {
    const params = new URLSearchParams();
    params.set("search", query);

    return `${SEARCH_CONFIG.discoverPage}?${params.toString()}`;
}

/* =========================================================
   INJECT PREMIUM SEARCH STYLES
========================================================= */

function injectSearchStyles() {
    if (document.querySelector("#cineva-search-modal-styles")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "cineva-search-modal-styles";

    style.textContent = `

        /* =============================================
           MODAL BASE
        ============================================= */

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

            width: 100%;
            height: 100vh;
            height: 100dvh;

            padding: clamp(12px, 5vh, 65px) 18px 25px;

            background: rgba(3, 3, 12, .88);

            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);

            opacity: 0;
            visibility: hidden;
            pointer-events: none;

            transition:
                opacity .25s ease,
                visibility .25s ease;
        }

        .cineva-search-modal.open {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
        }

        /* =============================================
           DIALOG
        ============================================= */

        .cineva-search-dialog {
            width: min(760px, 100%);
            max-height: min(780px, 90vh);

            min-height: 0;

            display: flex;
            flex-direction: column;

            overflow: hidden;

            color: #f5f5fa;

            background:
                radial-gradient(
                    ellipse at top left,
                    rgba(139, 53, 245, .17),
                    transparent 45%
                ),
                #10101d;

            border: 1px solid rgba(168, 85, 247, .25);
            border-radius: 19px;

            box-shadow:
                0 25px 90px rgba(0, 0, 0, .65),
                0 0 45px rgba(139, 53, 245, .12);

            transform: translateY(18px) scale(.985);

            transition: transform .3s ease;
        }

        .cineva-search-modal.open .cineva-search-dialog {
            transform: translateY(0) scale(1);
        }

        /* =============================================
           HEADER
        ============================================= */

        .cineva-search-header {
            flex-shrink: 0;

            padding: 22px 23px 17px;

            border-bottom: 1px solid rgba(255, 255, 255, .07);
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

            font-family:;
            font-size: 14px;
            font-weight: 900;
            letter-spacing: 1.5px;
        }

        .cineva-search-brand i {
            color: #a855f7;
            font-size: 18px;
        }

        /* =============================================
           CLOSE BUTTON
        ============================================= */

        .cineva-search-close {
            width: 42px;
            height: 42px;
            min-width: 42px;
            min-height: 42px;

            display: flex;
            align-items: center;
            justify-content: center;

            flex-shrink: 0;

            color: #aaa9bc;
            background: rgba(255, 255, 255, .06);

            border: 1px solid rgba(255, 255, 255, .08);
            border-radius: 11px;

            cursor: pointer;

            transition:
                background .2s ease,
                color .2s ease,
                border-color .2s ease,
                transform .2s ease;
        }

        .cineva-search-close:hover {
            color: white;
            background: #8b35f5;
            border-color: #8b35f5;
            transform: rotate(90deg);
        }

        .cineva-search-close:focus-visible {
            outline: 2px solid #a855f7;
            outline-offset: 3px;
        }

        /* =============================================
           SEARCH INPUT
        ============================================= */

        .cineva-search-field {
            position: relative;

            display: flex;
            align-items: center;
            gap: 12px;

            width: 100%;
            min-height: 57px;

            padding: 0 15px;

            background: #090914;

            border: 1px solid rgba(168, 85, 247, .35);
            border-radius: 12px;

            box-shadow: 0 0 0 3px rgba(139, 53, 245, .06);

            transition: .2s ease;
        }

        .cineva-search-field:focus-within {
            border-color: #a855f7;
            box-shadow: 0 0 0 4px rgba(139, 53, 245, .13);
        }

        .cineva-search-field > i {
            flex-shrink: 0;
            color: #a855f7;
            font-size: 17px;
        }

        .cineva-search-field input {
            width: 100%;
            min-width: 0;
            height: 55px;

            padding: 0;

            color: white;
            background: transparent;

            border: 0;
            outline: none;

            font-family:;
            font-size: 15px;
        }

        .cineva-search-field input::placeholder {
            color: #77768d;
        }

        .cineva-search-field input::-webkit-search-cancel-button {
            cursor: pointer;
        }

        .cineva-search-shortcut {
            flex-shrink: 0;

            padding: 5px 8px;

            color: #77768d;
            background: rgba(255, 255, 255, .05);

            border: 1px solid rgba(255, 255, 255, .08);
            border-radius: 6px;

            font-size: 10px;
        }

        /* =============================================
           RESULTS BODY
        ============================================= */

        .cineva-search-body {
            flex: 1 1 auto;

            min-height: 150px;
            min-width: 0;

            overflow-x: hidden;
            overflow-y: auto;

            overscroll-behavior-y: contain;
            -webkit-overflow-scrolling: touch;

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
            grid-template-columns: repeat(2, minmax(0, 1fr));

            gap: 10px;
            width: 100%;
        }

        /* =============================================
           RESULT CARD
        ============================================= */

        .cineva-search-result {
            min-width: 0;
            min-height: 100px;

            display: flex;
            align-items: center;
            gap: 12px;

            padding: 10px;

            color: white;
            background: rgba(255, 255, 255, .035);

            border: 1px solid rgba(255, 255, 255, .065);
            border-radius: 11px;

            text-decoration: none;

            transition:
                background .2s ease,
                border-color .2s ease,
                transform .2s ease;
        }

        .cineva-search-result:hover,
        .cineva-search-result.keyboard-active {
            background: rgba(139, 53, 245, .13);
            border-color: rgba(168, 85, 247, .55);
            transform: translateY(-2px);
        }

        .cineva-search-result:focus-visible {
            outline: 2px solid #a855f7;
            outline-offset: 2px;
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

            font-family:;
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
            background: rgba(168, 85, 247, .1);

            border-radius: 4px;

            font-size: 9px;
        }

        .cineva-search-result-arrow {
            flex-shrink: 0;
            color: #a855f7;
            font-size: 16px;
        }

        /* =============================================
           STATUS / EMPTY / LOADING
        ============================================= */

        .cineva-search-status {
            grid-column: 1 / -1;

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

            border: 3px solid rgba(168, 85, 247, .15);
            border-top-color: #a855f7;

            border-radius: 50%;

            animation: cinevaSearchSpin .7s linear infinite;
        }

        @keyframes cinevaSearchSpin {
            to {
                transform: rotate(360deg);
            }
        }

        /* =============================================
           VIEW ALL
        ============================================= */

        .cineva-search-view-all {
            grid-column: 1 / -1;

            display: flex;
            align-items: center;
            justify-content: center;
            gap: 9px;

            min-height: 46px;
            margin-top: 15px;
            padding: 10px;

            color: white;

            background: linear-gradient(110deg, #6420c9, #8b35f5);

            border: 0;
            border-radius: 9px;

            font-family:;
            font-size: 11px;
            font-weight: 800;

            text-decoration: none;
            cursor: pointer;

            transition:
                filter .2s ease,
                transform .2s ease;
        }

        .cineva-search-view-all:hover {
            filter: brightness(1.15);
            transform: translateY(-1px);
        }

        /* =============================================
           FOOTER
        ============================================= */

        .cineva-search-footer {
            flex-shrink: 0;

            display: flex;
            justify-content: space-between;
            gap: 10px;

            padding: 12px 23px;

            color: #77768b;
            background: rgba(0, 0, 0, .18);

            border-top: 1px solid rgba(255, 255, 255, .06);

            font-size: 9px;
        }

        .cineva-search-footer strong {
            color: #a855f7;
        }

        /* =============================================
           BODY LOCK
           Keep modal scrolling enabled.
        ============================================= */

        body.cineva-search-open {
            overflow: hidden !important;
        }

        /* =============================================
           TABLET
        ============================================= */

        @media (min-width: 601px) and (max-width: 850px) {
            .cineva-search-results {
                grid-template-columns: 1fr;
            }

            .cineva-search-dialog {
                max-height: 88vh;
            }
        }

        /* =============================================
           MOBILE / ANDROID
        ============================================= */

        @media (max-width: 600px) {

            .cineva-search-modal {
                align-items: stretch;

                width: 100%;
                height: 100vh;
                height: 100dvh;

                padding: 0;

                overflow: hidden;

                background: rgba(3, 3, 12, .97);

                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
            }

            .cineva-search-dialog {
                width: 100%;
                height: 100%;
                max-height: 100%;
                min-height: 0;

                border: 0;
                border-radius: 0;

                transform: translateY(12px);

                box-shadow: none;
            }

            .cineva-search-header {
                padding:
                    max(17px, env(safe-area-inset-top))
                    15px
                    14px;
            }

            .cineva-search-topline {
                margin-bottom: 13px;
            }

            .cineva-search-brand {
                font-size: 13px;
            }

            .cineva-search-close {
                width: 44px;
                height: 44px;
                min-width: 44px;
                min-height: 44px;
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
                flex: 1 1 auto;

                min-height: 0;
                width: 100%;

                padding: 17px 13px 25px;

                overflow-x: hidden;
                overflow-y: auto;

                -webkit-overflow-scrolling: touch;
                overscroll-behavior-y: contain;

                touch-action: pan-y;
            }

            .cineva-search-results {
                grid-template-columns: 1fr;
                gap: 9px;
            }

            .cineva-search-result {
                min-height: 91px;
                padding: 9px;
                gap: 11px;
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
                padding:
                    12px
                    15px
                    max(12px, env(safe-area-inset-bottom));

                flex-wrap: wrap;
            }
        }

        /* =============================================
           VERY SMALL PHONES
        ============================================= */

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

            .cineva-search-footer {
                font-size: 8px;
            }
        }

        /* =============================================
           REDUCED MOTION
        ============================================= */

        @media (prefers-reduced-motion: reduce) {

            .cineva-search-modal,
            .cineva-search-dialog,
            .cineva-search-result,
            .cineva-search-close,
            .cineva-search-view-all {
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
   CREATE SEARCH MODAL
========================================================= */

function createSearchModal() {
    if (document.querySelector("#cinevaSearchModal")) {
        return;
    }

    const modal = document.createElement("div");

    modal.className = "cineva-search-modal";
    modal.id = "cinevaSearchModal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
        <section
            class="cineva-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Search CINEVA"
            tabindex="-1"
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

                <p
                    class="cineva-search-caption"
                    id="cinevaSearchCaption"
                    aria-live="polite"
                >
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

                <span>
                    DESIGNED by <strong>IT HAWK RW</strong>
                </span>

                <span>
                    Movies • Series • Entertainment
                </span>

            </footer>

        </section>
    `;

    document.body.appendChild(modal);
}

/* =========================================================
   INITIALIZE ELEMENTS
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
   RESET SEARCH VIEW
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
   OPEN SEARCH MODAL
========================================================= */

function openSearchModal() {
    if (isOpen) {
        modalInput.focus();
        return;
    }

    previousFocus = document.activeElement;
    isOpen = true;

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");

    document.body.classList.add("cineva-search-open");

    if (existingInput?.value.trim()) {
        modalInput.value = existingInput.value.trim();
        performSearch(modalInput.value);
    } else {
        modalInput.value = "";
        resetSearchView();
    }

    requestAnimationFrame(() => {
        if (!isOpen) return;

        modalInput.focus({ preventScroll: true });

        try {
            modalInput.setSelectionRange(
                modalInput.value.length,
                modalInput.value.length
            );
        } catch (error) {
            // Some mobile browsers do not support selection ranges.
        }
    });
}

/* =========================================================
   CLOSE SEARCH MODAL
========================================================= */

function closeSearchModal() {
    if (!isOpen) return;

    isOpen = false;

    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");

    document.body.classList.remove("cineva-search-open");

    clearTimeout(searchTimeout);

    // Cancel previous pending search requests.
    activeRequest++;
    selectedIndex = -1;

    // Clear search input.
    modalInput.value = "";

    if (existingInput) {
        existingInput.value = "";
    }

    // Reset modal results.
    resetSearchView();

    // Clear old header results.
    if (existingResults) {
        existingResults.innerHTML = "";
        existingResults.classList.remove("active", "show");
    }

    modalInput.blur();

    /*
       Do not restore focus to the original header input.
       Its focus listener would immediately reopen the modal.
    */

    const focusIsInsideHeader =
        previousFocus &&
        (
            previousFocus === existingInput ||
            existingForm?.contains(previousFocus)
        );

    if (
        previousFocus?.isConnected &&
        !focusIsInsideHeader &&
        typeof previousFocus.focus === "function"
    ) {
        previousFocus.focus({ preventScroll: true });
    }

    previousFocus = null;
}

/* =========================================================
   CLOSE BUTTON
========================================================= */

closeButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();

    closeSearchModal();
});

/* =========================================================
   CLOSE WHEN BACKDROP IS CLICKED
========================================================= */

modal.addEventListener("click", event => {
    if (event.target === modal) {
        closeSearchModal();
    }
});

/* =========================================================
   LOADING STATE
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
   RENDER SEARCH RESULTS
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

            <a
                class="cineva-search-view-all"
                href="${escapeHTML(getDiscoverUrl(query))}"
            >
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
                safeImageUrl(
                    item.poster_url ||
                    item.poster ||
                    item.thumbnail
                )
            );

            const category = escapeHTML(
                item.category || "Uncategorized"
            );

            const year = escapeHTML(
                item.release_year || item.year || ""
            );

            const type =
                item.content_type === "series" ||
                item.type === "series"
                    ? "Series"
                    : "Movie";

            return `
                <a
                    href="${escapeHTML(getContentUrl(item))}"
                    class="cineva-search-result"
                    role="option"
                    aria-label="Open ${title}"
                    aria-selected="false"
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
    const query = String(value || "").trim();

    if (!query || !isOpen) {
        resetSearchView();
        return;
    }

    const requestId = ++activeRequest;

    renderLoading();

    try {
        const results = await searchContent(query);

        // Ignore outdated or closed modal requests.
        if (!isOpen || requestId !== activeRequest) {
            return;
        }

        renderResults(results, query);

    } catch (error) {

        console.error("CINEVA modal search failed:", error);

        if (!isOpen || requestId !== activeRequest) {
            return;
        }

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

    // Invalidate previous search request.
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

        const active = index === selectedIndex;

        item.classList.toggle("keyboard-active", active);
        item.setAttribute("aria-selected", String(active));

    });

    items[selectedIndex]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth"
    });
});

/* =========================================================
   MODAL FOCUS MANAGEMENT
========================================================= */

dialog.addEventListener("keydown", event => {

    if (event.key !== "Tab") return;

    const focusable = [
        ...dialog.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
    ].filter(element => element.offsetParent !== null);

    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
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

    // Header input opens the modal instead of using inline search.
    existingInput.setAttribute("readonly", "readonly");

    existingInput.setAttribute(
        "aria-label",
        "Open CINEVA search"
    );

    existingInput.setAttribute(
        "aria-haspopup",
        "dialog"
    );

    existingInput.addEventListener("focus", () => {
        openSearchModal();
    });

    existingInput.addEventListener("click", event => {
        event.preventDefault();
        openSearchModal();
    });
}

if (existingForm) {

    // Keep normal form submission from navigating away.
    existingForm.addEventListener("submit", event => {
        event.preventDefault();
        openSearchModal();
    });
}

/* =========================================================
   MOBILE / DESKTOP SEARCH BUTTON SUPPORT
========================================================= */

document.addEventListener("click", event => {

    const searchTrigger = event.target.closest(
        [
            "[data-open-search]",
            ".search-trigger",
            ".search-submit",
            "#openSearch",
            "#watchSearchButton",
            '#search-form button[type="submit"]',
            '#search-form .search-icon'
        ].join(",")
    );

    if (!searchTrigger) return;

    // Do not intercept the modal's own buttons.
    if (modal.contains(searchTrigger)) return;

    event.preventDefault();

    openSearchModal();
});

/* =========================================================
   GLOBAL KEYBOARD SHORTCUTS
========================================================= */

document.addEventListener("keydown", event => {

    const target = event.target;

    const typing =
        target instanceof HTMLElement &&
        (
            target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
        );

    // Escape closes the modal from anywhere.
    if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        closeSearchModal();
        return;
    }

    // Ctrl + K / Cmd + K.
    if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
    ) {
        event.preventDefault();
        openSearchModal();
        return;
    }

    // Slash shortcut, unless the user is typing.
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

console.log(
    "CINEVA PRO premium responsive search system initialized."
);
