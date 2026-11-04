
import { supabase } from "../../js/config.js";
import { verifyAdmin } from "./admin-guard.js";

/* =========================================
   CINEVA PRO — DASHBOARD CONFIGURATION
========================================= */

const LOGIN_URL = "/admin/";

const PAGE_TITLES = {
    overview: "Overview",
    movies: "Movies Management",
    series: "TV Series Management",
    categories: "Categories",
    tmdb: "TMDB Importer",
    featured: "Featured Content",
    users: "Users Management",
    admins: "Administrators",
    analytics: "Analytics",
    settings: "Settings"
};

const $ = (selector) => document.querySelector(selector);

const numberFormat = new Intl.NumberFormat("en-US");

let currentAdmin = null;

/* =========================================
   DASHBOARD MESSAGES
========================================= */

function showDashboardMessage(message, type = "info") {
    console[type === "error" ? "error" : "log"](
        `CINEVA Dashboard: ${message}`
    );
}

/* =========================================
   ADMIN PROFILE
========================================= */

function loadAdminProfile(admin) {
    const email = admin.user?.email || admin.admin?.email || "";
    const name = email ? email.split("@")[0] : "Administrator";

    const nameElement = $("#adminName");
    const emailElement = $("#adminEmail");
    const avatarElement = $("#adminAvatar");

    if (nameElement) {
        nameElement.textContent = name;
    }

    if (emailElement) {
        emailElement.textContent = email || "Administrator";
    }

    if (avatarElement) {
        avatarElement.textContent = name.charAt(0).toUpperCase() || "A";
    }
}

/* =========================================
   PAGE NAVIGATION
========================================= */

function navigateToPage(page) {
    if (!PAGE_TITLES[page]) return;

    document.querySelectorAll(".dashboard-page").forEach(section => {
        section.classList.toggle(
            "active",
            section.id === `page-${page}`
        );
    });

    document.querySelectorAll(".nav-link[data-page]").forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === page
        );
    });

    const breadcrumb = $("#breadcrumbTitle");

    if (breadcrumb) {
        breadcrumb.textContent = PAGE_TITLES[page];
    }

    history.replaceState(null, "", `#${page}`);

    closeSidebar();
}

function initializeNavigation() {
    document.querySelectorAll("[data-page]").forEach(element => {
        element.addEventListener("click", event => {
            event.preventDefault();
            navigateToPage(element.dataset.page);
        });
    });

    const initialPage = window.location.hash.replace("#", "");

    navigateToPage(
        PAGE_TITLES[initialPage] ? initialPage : "overview"
    );
}

/* =========================================
   MOBILE SIDEBAR
========================================= */

const sidebar = $("#sidebar");
const sidebarOverlay = $("#sidebarOverlay");
const menuToggle = $("#menuToggle");
const sidebarClose = $("#sidebarClose");

function openSidebar() {
    sidebar?.classList.add("active");
    sidebarOverlay?.classList.add("active");
    menuToggle?.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
    sidebar?.classList.remove("active");
    sidebarOverlay?.classList.remove("active");
    menuToggle?.setAttribute("aria-expanded", "false");
}

function initializeSidebar() {
    menuToggle?.addEventListener("click", openSidebar);
    sidebarClose?.addEventListener("click", closeSidebar);
    sidebarOverlay?.addEventListener("click", closeSidebar);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeSidebar();
        }
    });
}

/* =========================================
   DASHBOARD STATISTICS
========================================= */

function setStat(selector, value) {
    const element = $(selector);

    if (element) {
        element.textContent = value;
    }
}

async function loadContentStatistics() {
    setStat("#totalMovies", "...");
    setStat("#totalSeries", "...");
    setStat("#totalViews", "...");

    setStat("#movieNavCount", "...");
    setStat("#seriesNavCount", "...");

    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from("movies")
            .select("id", { count: "exact", head: true }),

        supabase
            .from("series")
            .select("id", { count: "exact", head: true })
    ]);

    if (moviesResult.error) {
        console.error("Movie statistics error:", moviesResult.error);
        setStat("#totalMovies", "—");
        setStat("#movieNavCount", "—");
    } else {
        const count = moviesResult.count ?? 0;

        setStat("#totalMovies", numberFormat.format(count));
        setStat("#movieNavCount", numberFormat.format(count));
    }

    if (seriesResult.error) {
        console.error("Series statistics error:", seriesResult.error);
        setStat("#totalSeries", "—");
        setStat("#seriesNavCount", "—");
    } else {
        const count = seriesResult.count ?? 0;

        setStat("#totalSeries", numberFormat.format(count));
        setStat("#seriesNavCount", numberFormat.format(count));
    }

    await loadTotalViews();
}

/* =========================================
   TOTAL VIEWS
========================================= */

async function loadTotalViews() {
    const [moviesResult, seriesResult] = await Promise.all([
        supabase.from("movies").select("views"),
        supabase.from("series").select("views")
    ]);

    if (moviesResult.error || seriesResult.error) {
        console.error(
            "Unable to load total views:",
            moviesResult.error || seriesResult.error
        );

        setStat("#totalViews", "—");
        return;
    }

    const movieViews = (moviesResult.data || []).reduce(
        (total, item) => total + Number(item.views || 0),
        0
    );

    const seriesViews = (seriesResult.data || []).reduce(
        (total, item) => total + Number(item.views || 0),
        0
    );

    setStat(
        "#totalViews",
        numberFormat.format(movieViews + seriesViews)
    );
}

/* =========================================
   RECENT CONTENT
========================================= */

function resolvePoster(path) {
    if (!path) return "";

    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    if (path.startsWith("/")) {
        return `https://image.tmdb.org/t/p/w185${path}`;
    }

    return path;
}

function formatDate(dateValue) {
    if (!dateValue) return "Date unavailable";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(date);
}

function createRecentItem(item, type) {
    const element = document.createElement("div");
    element.className = "recent-item";

    const poster = document.createElement("div");
    poster.className = "recent-poster";

    const imagePath = resolvePoster(
        item.poster ||
        item.image ||
        item.thumbnail ||
        item.poster_path
    );

    if (imagePath) {
        const image = document.createElement("img");

        image.src = imagePath;
        image.alt = item.title || "Content poster";
        image.loading = "lazy";

        image.onerror = () => {
            image.remove();
            poster.textContent = "C";
        };

        poster.appendChild(image);
    } else {
        poster.textContent = "C";
    }

    const details = document.createElement("div");
    details.className = "recent-details";

    const title = document.createElement("h4");
    title.textContent = item.title || "Untitled";

    const meta = document.createElement("p");
    meta.textContent = `${item.category || type} · ${formatDate(item.created_at)}`;

    details.append(title, meta);

    const badge = document.createElement("span");
    badge.className = "recent-badge";
    badge.textContent = type;

    element.append(poster, details, badge);

    return element;
}

async function loadRecentContent() {
    const container = $("#recentContent");

    if (!container) return;

    container.replaceChildren();

    const loading = document.createElement("p");
    loading.className = "loading-placeholder";
    loading.textContent = "Loading recently added content...";
    container.appendChild(loading);

    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from("movies")
            .select("id,title,category,created_at,poster,poster_path,thumbnail")
            .order("created_at", { ascending: false })
            .limit(6),

        supabase
            .from("series")
            .select("id,title,category,created_at,poster,image,poster_path")
            .order("created_at", { ascending: false })
            .limit(6)
    ]);

    if (moviesResult.error) {
        console.error("Recent movies error:", moviesResult.error);
    }

    if (seriesResult.error) {
        console.error("Recent series error:", seriesResult.error);
    }

    const movies = (moviesResult.data || []).map(item => ({
        ...item,
        contentType: "Movie"
    }));

    const series = (seriesResult.data || []).map(item => ({
        ...item,
        contentType: "Series"
    }));

    const recentItems = [...movies, ...series]
        .sort((a, b) => {
            return new Date(b.created_at || 0) -
                   new Date(a.created_at || 0);
        })
        .slice(0, 6);

    container.replaceChildren();

    if (recentItems.length === 0) {
        const empty = document.createElement("p");
        empty.className = "loading-placeholder";
        empty.textContent = "No content found yet.";
        container.appendChild(empty);
        return;
    }

    recentItems.forEach(item => {
        container.appendChild(
            createRecentItem(item, item.contentType)
        );
    });
}

/* =========================================
   USER STATISTICS
========================================= */

function initializeUnavailableStatistics() {
    // User count requires confirming the existing user/profile table.
    // Never guess a table name or use the Supabase service-role API here.
    setStat("#totalUsers", "—");
}

/* =========================================
   LOGOUT
========================================= */

async function handleLogout() {
    const logoutButton = $("#logoutButton");

    if (logoutButton) {
        logoutButton.disabled = true;
        logoutButton.textContent = "Signing out...";
    }

    try {
        const { error } = await supabase.auth.signOut();

        if (error) throw error;

        window.location.replace(LOGIN_URL);
    } catch (error) {
        console.error("CINEVA logout error:", error);

        showDashboardMessage(
            "Unable to sign out. Please try again.",
            "error"
        );

        if (logoutButton) {
            logoutButton.disabled = false;
            logoutButton.textContent = "Logout";
        }
    }
}

function initializeLogout() {
    $("#logoutButton")?.addEventListener("click", handleLogout);
}

/* =========================================
   DASHBOARD INITIALIZATION
========================================= */

async function initializeDashboard() {
    const result = await verifyAdmin();

    if (!result.authorized) {
        console.error("Dashboard access denied:", result.reason);
        window.location.replace(LOGIN_URL);
        return;
    }

    currentAdmin = result;

    loadAdminProfile(currentAdmin);

    const yearElement = $("#currentYear");

    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }

    initializeNavigation();
    initializeSidebar();
    initializeLogout();
    initializeUnavailableStatistics();

    await Promise.all([
        loadContentStatistics(),
        loadRecentContent()
    ]);

    console.log("CINEVA PRO dashboard initialized.");
}

initializeDashboard().catch(error => {
    console.error("Dashboard initialization failed:", error);
});
