
import { supabase } from "./config.js";

/* =========================================================
   CINEVA PROFILE SYSTEM
========================================================= */

const STORAGE_KEYS = {
    favorites: "cineva_favorites",
    watchlist: "cineva_watchlist"
};

const elements = {
    name: document.getElementById("profile-name"),
    email: document.getElementById("profile-email"),
    avatar: document.getElementById("profile-avatar"),

    accountName: document.getElementById("account-name"),
    accountEmail: document.getElementById("account-email"),
    accountStatus: document.getElementById("account-status"),
    accountCreated: document.getElementById("account-created"),

    loading: document.getElementById("profile-loading"),
    error: document.getElementById("profile-error"),
    errorMessage: document.getElementById("profile-error-message"),

    favoritesGrid: document.getElementById("favorites-grid"),
    watchlistGrid: document.getElementById("watchlist-grid"),

    favoritesEmpty: document.getElementById("favorites-empty"),
    watchlistEmpty: document.getElementById("watchlist-empty"),

    favoritesCount: document.getElementById("favorites-count"),
    logout: document.getElementById("logout-btn"),
    footerYear: document.getElementById("profile-footer-year")
};

let currentUser = null;

/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener("DOMContentLoaded", initializeProfile);

async function initializeProfile() {
    elements.footerYear.textContent = new Date().getFullYear();

    connectProfileTabs();
    connectLogout();

    await loadProfile();
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function loadProfile() {
    showLoading();

    try {
        const { data, error } = await supabase.auth.getUser();

        if (error) throw error;

        currentUser = data.user;

        if (!currentUser) {
            window.location.replace(
                "login.html?redirect=" +
                encodeURIComponent("profile.html")
            );
            return;
        }

        renderUserInformation(currentUser);
        renderFavorites();
        renderWatchlist();

        showProfile();

    } catch (error) {
        console.error("CINEVA profile error:", error);

        showProfileError(
            error.message || "Unable to load your account."
        );
    }
}

/* =========================================================
   USER INFORMATION
========================================================= */

function renderUserInformation(user) {
    const metadata = user.user_metadata || {};

    const fullName =
        metadata.full_name ||
        metadata.name ||
        metadata.display_name ||
        user.email?.split("@")[0] ||
        "CINEVA User";

    const email = user.email || "No email available";

    elements.name.textContent = fullName;
    elements.email.textContent = email;

    elements.accountName.textContent = fullName;
    elements.accountEmail.textContent = email;
    elements.accountStatus.textContent =
        user.email_confirmed_at ? "Verified Account" : "Email Not Verified";

    elements.accountCreated.textContent = user.created_at
        ? new Date(user.created_at).toLocaleDateString("en", {
            year: "numeric",
            month: "long",
            day: "numeric"
        })
        : "Unavailable";

    renderAvatar(metadata.avatar_url || metadata.picture, fullName);
}

function renderAvatar(imageUrl, name) {
    elements.avatar.innerHTML = "";

    if (imageUrl && isSafeImageUrl(imageUrl)) {
        const image = document.createElement("img");

        image.src = imageUrl;
        image.alt = name;

        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = "cover";
        image.style.borderRadius = "50%";

        image.onerror = () => {
            elements.avatar.innerHTML =
                '<i class="fa-solid fa-user"></i>';
        };

        elements.avatar.appendChild(image);
        return;
    }

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-user";

    elements.avatar.appendChild(icon);
}

function isSafeImageUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

/* =========================================================
   LOCAL FAVORITES AND WATCHLIST
========================================================= */

function readStoredItems(key) {
    try {
        const stored = localStorage.getItem(key);

        if (!stored) return [];

        const parsed = JSON.parse(stored);

        return Array.isArray(parsed) ? parsed : [];

    } catch (error) {
        console.error("CINEVA storage error:", error);
        return [];
    }
}

function renderFavorites() {
    const favorites = readStoredItems(STORAGE_KEYS.favorites);

    elements.favoritesGrid.innerHTML = "";

    elements.favoritesCount.textContent =
        `${favorites.length} ${favorites.length === 1 ? "Title" : "Titles"}`;

    renderContentCards(favorites, elements.favoritesGrid);

    elements.favoritesEmpty.style.display =
        favorites.length ? "none" : "flex";
}

function renderWatchlist() {
    const watchlist = readStoredItems(STORAGE_KEYS.watchlist);

    elements.watchlistGrid.innerHTML = "";

    renderContentCards(watchlist, elements.watchlistGrid);

    elements.watchlistEmpty.style.display =
        watchlist.length ? "none" : "flex";
}

/* =========================================================
   CONTENT CARDS
========================================================= */

function renderContentCards(items, container) {
    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        if (!item || !item.id) return;

        const card = createContentCard(item);

        if (card) fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

function createContentCard(item) {
    const type = item.content_type || item.type || "movie";

    if (!["movie", "series"].includes(type)) return null;

    const card = document.createElement("a");

    card.className = "movie-card";

    card.href =
        `watch.html?id=${encodeURIComponent(item.id)}&type=${type}`;

    const image = document.createElement("img");

    image.src = getPoster(item);
    image.alt = item.title || "CINEVA content";
    image.loading = "lazy";

    image.onerror = () => {
        image.onerror = null;
        image.src =
            "https://placehold.co/400x600/151522/ffffff?text=CINEVA";
    };

    const title = document.createElement("h3");
    title.textContent = item.title || "Untitled";

    const info = document.createElement("p");

    info.textContent = [
        item.year || item.release_date?.substring(0, 4) || "",
        type === "series" ? "Series" : "Movie"
    ].filter(Boolean).join(" • ");

    card.append(image, title, info);

    return card;
}

function getPoster(item) {
    const poster =
        item.poster ||
        item.poster_path ||
        item.image ||
        item.thumbnail;

    if (!poster) {
        return "https://placehold.co/400x600/151522/ffffff?text=CINEVA";
    }

    if (poster.startsWith("https://") || poster.startsWith("http://")) {
        return poster;
    }

    return `https://image.tmdb.org/t/p/w500/${
        poster.replace(/^\/+/, "")
    }`;
}

/* =========================================================
   PROFILE NAVIGATION
========================================================= */

function connectProfileTabs() {
    const tabs = document.querySelectorAll(".profile-tab[data-tab]");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;

            tabs.forEach(button => {
                button.classList.remove("active");
            });

            tab.classList.add("active");

            document.querySelectorAll(".profile-section").forEach(section => {
                section.classList.remove("active");
            });

            const targetSection = document.getElementById(
                `${target}-section`
            );

            if (targetSection) {
                targetSection.classList.add("active");
            }

            history.replaceState(
                null,
                "",
                `#${encodeURIComponent(target)}`
            );
        });
    });

    openRequestedTab();
}

function openRequestedTab() {
    const requestedTab = location.hash.replace("#", "");

    const allowedTabs = [
        "favorites",
        "watchlist",
        "account"
    ];

    if (!allowedTabs.includes(requestedTab)) return;

    const tab = document.querySelector(
        `.profile-tab[data-tab="${requestedTab}"]`
    );

    if (tab) tab.click();
}

/* =========================================================
   LOGOUT
========================================================= */

function connectLogout() {
    elements.logout.addEventListener("click", logoutUser);
}

async function logoutUser() {
    const confirmed = window.confirm(
        "Are you sure you want to sign out of CINEVA?"
    );

    if (!confirmed) return;

    elements.logout.disabled = true;

    try {
        const { error } = await supabase.auth.signOut();

        if (error) throw error;

        window.location.replace("login.html");

    } catch (error) {
        console.error("CINEVA logout error:", error);

        window.alert(
            "Unable to sign out. Please try again."
        );

        elements.logout.disabled = false;
    }
}

/* =========================================================
   UI STATES
========================================================= */

function showLoading() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
}

function showProfile() {
    elements.loading.hidden = true;
    elements.error.hidden = true;
}

function showProfileError(message) {
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.errorMessage.textContent = message;
}

/* =========================================================
   AUTH STATE CHANGES
========================================================= */

supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
        window.location.replace("login.html");
    }
});
