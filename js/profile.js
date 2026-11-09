
/* =========================================================
   CINEVA — USER PROFILE SYSTEM
   Authentication, Account Details, Favorites & Watchlist
========================================================= */

import { supabase } from "./config.js";

/* =========================================================
   DOM ELEMENTS
========================================================= */

const elements = {
    loading: document.getElementById("profile-loading"),
    error: document.getElementById("profile-error"),
    errorMessage: document.getElementById("profile-error-message"),

    avatar: document.getElementById("profile-avatar"),
    name: document.getElementById("profile-name"),
    email: document.getElementById("profile-email"),

    accountName: document.getElementById("account-name"),
    accountEmail: document.getElementById("account-email"),
    accountStatus: document.getElementById("account-status"),
    accountCreated: document.getElementById("account-created"),

    favoritesGrid: document.getElementById("favorites-grid"),
    favoritesEmpty: document.getElementById("favorites-empty"),
    favoritesCount: document.getElementById("favorites-count"),

    watchlistGrid: document.getElementById("watchlist-grid"),
    watchlistEmpty: document.getElementById("watchlist-empty"),

    logoutButton: document.getElementById("logout-btn"),

    footerYear: document.getElementById("profile-footer-year")
};

/* =========================================================
   STORAGE KEYS
========================================================= */

const STORAGE_KEYS = {
    favorites: "cineva_favorites",
    watchlist: "cineva_watchlist"
};

/* =========================================================
   PROFILE STATE
========================================================= */

let currentUser = null;
let activeTab = "favorites";

/* =========================================================
   SAFE TEXT HELPERS
========================================================= */

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function getDisplayName(user) {
    return (
        user?.user_metadata?.full_name ||
        user?.user_metadata?.display_name ||
        user?.user_metadata?.name ||
        user?.email?.split("@")[0] ||
        "CINEVA Member"
    );
}

function getInitials(name) {
    return String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join("") || "C";
}

function formatDate(dateValue) {
    if (!dateValue) return "Not available";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Not available";
    }

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

/* =========================================================
   IMAGE HELPERS
========================================================= */

function getPoster(item) {
    const poster =
        item.poster ||
        item.poster_path ||
        item.thumbnail ||
        item.image ||
        "";

    if (!poster) {
        return "";
    }

    if (
        poster.startsWith("http://") ||
        poster.startsWith("https://") ||
        poster.startsWith("data:")
    ) {
        return poster;
    }

    if (poster.startsWith("/")) {
        return `https://image.tmdb.org/t/p/w500${poster}`;
    }

    return poster;
}

function getContentType(item) {
    const type = item.content_type || item.type || "movie";

    return type.toLowerCase() === "series"
        ? "series"
        : "movie";
}

function getContentUrl(item) {
    const id = item.id;

    const type = getContentType(item);

    return `watch.html?id=${encodeURIComponent(id)}&type=${type}`;
}

/* =========================================================
   LOCAL STORAGE HELPERS
========================================================= */

function readStorage(key) {
    try {
        const value = localStorage.getItem(key);

        if (!value) return [];

        const parsed = JSON.parse(value);

        return Array.isArray(parsed) ? parsed : [];

    } catch (error) {
        console.error("Storage read error:", error);
        return [];
    }
}

function writeStorage(key, data) {
    try {
        localStorage.setItem(
            key,
            JSON.stringify(data)
        );
        if (key === STORAGE_KEYS.favorites) {
            window.dispatchEvent(new Event("cineva:favorites-updated"));
        }

        return true;

    } catch (error) {
        console.error("Storage write error:", error);
        return false;
    }
}

/* =========================================================
   PROFILE AVATAR
========================================================= */

function renderAvatar(user) {
    if (!elements.avatar) return;

    const name = getDisplayName(user);

    const avatarUrl =
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        "";

    if (avatarUrl) {
        const safeUrl = escapeHTML(avatarUrl);

        elements.avatar.innerHTML = `
            <img
                src="${safeUrl}"
                alt="${escapeHTML(name)}"
                class="profile-avatar-image"
                referrerpolicy="no-referrer"
            >
        `;

        const image = elements.avatar.querySelector("img");

        image.addEventListener("error", () => {
            elements.avatar.textContent = getInitials(name);
        }, { once: true });

    } else {
        elements.avatar.textContent = getInitials(name);
    }
}

/* =========================================================
   PROFILE INFORMATION
========================================================= */

function renderProfile(user) {
    const name = getDisplayName(user);

    if (elements.name) {
        elements.name.textContent = name;
    }

    if (elements.email) {
        elements.email.textContent = user.email || "";
    }

    if (elements.accountName) {
        elements.accountName.textContent = name;
    }

    if (elements.accountEmail) {
        elements.accountEmail.textContent = user.email || "";
    }

    if (elements.accountStatus) {
        elements.accountStatus.textContent =
            user.email_confirmed_at
                ? "Verified Account"
                : "Email Not Yet Verified";
    }

    if (elements.accountCreated) {
        elements.accountCreated.textContent =
            formatDate(user.created_at);
    }

    renderAvatar(user);
}

/* =========================================================
   CONTENT CARD GENERATOR
========================================================= */

function createContentCard(item, listType) {
    if (!item || !item.id || !item.title) {
        return "";
    }

    const title = escapeHTML(item.title);

    const poster = getPoster(item);

    const type = getContentType(item);

    const safePoster = escapeHTML(poster);

    const url = getContentUrl(item);

    const rating = Number(
        item.vote_average ?? item.rating ?? 0
    );

    const ratingText = Number.isFinite(rating)
        ? rating.toFixed(1)
        : "N/A";

    const label = type === "series" ? "SERIES" : "MOVIE";

    return `
        <article class="profile-content-card">

            <a href="${escapeHTML(url)}" class="profile-card-link">

                <div class="profile-card-poster">

                    ${
                        safePoster
                            ? `
                                <img
                                    src="${safePoster}"
                                    alt="${title}"
                                    loading="lazy"
                                    onerror="this.style.display='none'"
                                >
                            `
                            : `
                                <div class="profile-no-poster">
                                    <i class="fa-solid fa-film"></i>
                                </div>
                            `
                    }

                    <span class="profile-card-type">
                        ${label}
                    </span>

                    <div class="profile-card-overlay">
                        <i class="fa-solid fa-play"></i>
                    </div>

                </div>

                <div class="profile-card-details">

                    <h3>${title}</h3>

                    <div class="profile-card-meta">
                        <span>
                            <i class="fa-solid fa-star"></i>
                            ${ratingText}
                        </span>

                        <span>${label}</span>
                    </div>

                </div>

            </a>

            <button
                type="button"
                class="profile-remove-btn"
                data-remove-type="${listType}"
                data-remove-id="${escapeHTML(item.id)}"
                aria-label="Remove ${title}"
                title="Remove from ${listType}"
            >
                <i class="fa-solid fa-trash"></i>
            </button>

        </article>
    `;
}

/* =========================================================
   RENDER FAVORITES
========================================================= */

function renderFavorites() {
    if (!elements.favoritesGrid) return;

    const favorites = readStorage(STORAGE_KEYS.favorites);

    if (elements.favoritesCount) {
        elements.favoritesCount.textContent =
            favorites.length;
    }

    elements.favoritesGrid.innerHTML = favorites
        .map(item => createContentCard(item, "favorites"))
        .join("");

    if (elements.favoritesEmpty) {
        elements.favoritesEmpty.hidden =
            favorites.length > 0;
    }

    elements.favoritesGrid.hidden =
        favorites.length === 0;
}

/* =========================================================
   RENDER WATCHLIST
========================================================= */

function renderWatchlist() {
    if (!elements.watchlistGrid) return;

    const watchlist = readStorage(STORAGE_KEYS.watchlist);

    elements.watchlistGrid.innerHTML = watchlist
        .map(item => createContentCard(item, "watchlist"))
        .join("");

    if (elements.watchlistEmpty) {
        elements.watchlistEmpty.hidden =
            watchlist.length > 0;
    }

    elements.watchlistGrid.hidden =
        watchlist.length === 0;
}

/* =========================================================
   REMOVE CONTENT FROM LISTS
========================================================= */

document.addEventListener("click", event => {
    const button = event.target.closest(
        ".profile-remove-btn"
    );

    if (!button) return;

    const listType = button.dataset.removeType;
    const itemId = button.dataset.removeId;

    const key =
        listType === "favorites"
            ? STORAGE_KEYS.favorites
            : STORAGE_KEYS.watchlist;

    const items = readStorage(key);

    const updatedItems = items.filter(
        item => String(item.id) !== String(itemId)
    );

    if (!writeStorage(key, updatedItems)) {
        return;
    }

    if (listType === "favorites") {
        renderFavorites();
    } else {
        renderWatchlist();
    }
});

/* =========================================================
   PROFILE TAB NAVIGATION
========================================================= */

function setActiveTab(tab) {
    const allowedTabs = [
        "favorites",
        "watchlist",
        "account"
    ];

    if (!allowedTabs.includes(tab)) {
        tab = "favorites";
    }

    activeTab = tab;

    document.querySelectorAll("[data-tab]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.tab === tab
        );
    });

    document.querySelectorAll(".profile-section").forEach(
        section => {
            section.classList.toggle(
                "active",
                section.id === `${tab}-section`
            );
        }
    );

    if (tab === "favorites") {
        renderFavorites();
    }

    if (tab === "watchlist") {
        renderWatchlist();
    }

    history.replaceState(
        null,
        "",
        `#${tab}`
    );
}

document.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => {
        setActiveTab(button.dataset.tab);
    });
});

/* =========================================================
   INITIAL TAB
========================================================= */

function initializeTabs() {
    const requestedTab = window.location.hash.replace("#", "");

    const allowedTabs = [
        "favorites",
        "watchlist",
        "account"
    ];

    setActiveTab(
        allowedTabs.includes(requestedTab)
            ? requestedTab
            : "favorites"
    );
}

/* =========================================================
   LOGOUT
========================================================= */

async function logout() {
    if (!elements.logoutButton) return;

    const confirmed = window.confirm(
        "Are you sure you want to sign out of CINEVA?"
    );

    if (!confirmed) return;

    elements.logoutButton.disabled = true;

    const originalContent =
        elements.logoutButton.innerHTML;

    elements.logoutButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Signing out...
    `;

    try {
        const { error } = await supabase.auth.signOut();

        if (error) throw error;

        window.location.replace("login.html");

    } catch (error) {
        console.error("Logout error:", error);

        alert(
            error.message ||
            "Unable to sign out. Please try again."
        );

        elements.logoutButton.disabled = false;

        elements.logoutButton.innerHTML =
            originalContent;
    }
}

if (elements.logoutButton) {
    elements.logoutButton.addEventListener(
        "click",
        logout
    );
}

/* =========================================================
   PAGE LOADING / ERROR STATES
========================================================= */

function showLoading() {
    if (elements.loading) {
        elements.loading.hidden = false;
    }

    if (elements.error) {
        elements.error.hidden = true;
    }
}

function hideLoading() {
    if (elements.loading) {
        elements.loading.hidden = true;
    }
}

function showError(message) {
    hideLoading();

    if (elements.error) {
        elements.error.hidden = false;
    }

    if (elements.errorMessage) {
        elements.errorMessage.textContent = message;
    }
}

/* =========================================================
   LOAD PROFILE
========================================================= */

async function loadProfile() {
    showLoading();

    try {
        const { data, error } =
            await supabase.auth.getUser();

        if (error) throw error;

        if (!data.user) {
            window.location.replace(
                "login.html?redirect=profile.html"
            );

            return;
        }

        currentUser = data.user;

        renderProfile(currentUser);

        renderFavorites();

        renderWatchlist();

        initializeTabs();

        hideLoading();

    } catch (error) {
        console.error("Profile loading error:", error);

        showError(
            "We couldn't load your profile. Please refresh the page or sign in again."
        );
    }
}

/* =========================================================
   AUTH STATE CHANGES
========================================================= */

supabase.auth.onAuthStateChange((event, session) => {

    if (event === "SIGNED_OUT" || !session) {
        window.location.replace("login.html");
    }

    if (event === "USER_UPDATED" && session?.user) {
        currentUser = session.user;
        renderProfile(currentUser);
    }

});

/* =========================================================
   FOOTER YEAR
========================================================= */

if (elements.footerYear) {
    elements.footerYear.textContent =
        new Date().getFullYear();
}


window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEYS.favorites) {
        renderFavorites();
    }
    if (event.key === STORAGE_KEYS.watchlist) {
        renderWatchlist();
    }
});

/* =========================================================
   INITIALIZE CINEVA PROFILE
========================================================= */

loadProfile();

console.log("CINEVA profile system initialized.");
