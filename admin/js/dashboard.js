
import { supabase } from "../../js/config.js";
import { verifyAdmin } from "./admin-guard.js";
const LOGIN_HANDOFF_KEY = "cineva_admin_login_handoff";

// Consume the one-time login permission immediately.
// A page refresh will not have this permission again.
const hasLoginHandoff =
    sessionStorage.getItem(LOGIN_HANDOFF_KEY) === "authorized";

sessionStorage.removeItem(LOGIN_HANDOFF_KEY);
const bootScreen = document.getElementById("adminBootScreen");
const errorScreen = document.getElementById("adminErrorScreen");
const adminApp = document.getElementById("adminApp");

const bootMessage = document.getElementById("bootMessage");
const errorMessage = document.getElementById("adminErrorMessage");

const retryButton = document.getElementById("retryVerification");
const logoutButton = document.getElementById("logoutButton");

let authorizedUserId = null;
let signingOut = false;

function showBoot(message = "Verifying administrator access...") {
    bootMessage.textContent = message;
    bootScreen.hidden = false;
    errorScreen.hidden = true;
    adminApp.hidden = true;
}

function showError(message) {
    errorMessage.textContent = message;
    bootScreen.hidden = true;
    errorScreen.hidden = false;
    adminApp.hidden = true;
}

function showDashboard() {
    bootScreen.hidden = true;
    errorScreen.hidden = true;
    adminApp.hidden = false;
}

function displayAdminProfile(user) {
    const email = user.email || "Administrator";
    const name = email.split("@")[0];

    document.getElementById("adminName").textContent = name;
    document.getElementById("adminEmail").textContent = email;

    document.getElementById("adminAvatar").textContent =
        name.charAt(0).toUpperCase();

    document.getElementById("currentYear").textContent =
        new Date().getFullYear();

    document.getElementById("dashboardDate").textContent =
        new Intl.DateTimeFormat("en", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        }).format(new Date());
}

// =========================================
// DASHBOARD STATISTICS
// =========================================

async function loadDashboardStatistics() {
    const [movies, series, categories, featured] =
        await Promise.all([
            supabase.from("movies").select("id", { count: "exact", head: true }),
            supabase.from("series").select("id", { count: "exact", head: true }),
            supabase.from("categories").select("id", { count: "exact", head: true }),
            supabase.from("movies").select("id", { count: "exact", head: true })
                .eq("is_featured", true)
        ]);

    const results = [movies, series, categories, featured];

    results.forEach((result, index) => {
        if (result.error) {
            console.error("Dashboard statistics error:", result.error);
        }
    });

    document.getElementById("totalMovies").textContent =
        movies.error ? "—" : (movies.count ?? 0);

    document.getElementById("totalSeries").textContent =
        series.error ? "—" : (series.count ?? 0);

    document.getElementById("totalCategories").textContent =
        categories.error ? "—" : (categories.count ?? 0);

    document.getElementById("totalFeatured").textContent =
        featured.error ? "—" : (featured.count ?? 0);
}

// =========================================
// RECENT MOVIES
// =========================================

async function loadRecentMovies() {
    const tableBody = document.getElementById("recentMoviesTable");

    const { data, error } = await supabase
        .from("movies")
        .select("id, title, category, created_at, is_active")
        .order("created_at", { ascending: false })
        .limit(5);

    if (error) {
        console.error("Recent movies error:", error);
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="table-loading">
                    Unable to load recent movies.
                </td>
            </tr>
        `;
        return;
    }

    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="table-loading">
                    No movies found.
                </td>
            </tr>
        `;
        return;
    }

    tableBody.replaceChildren();

    data.forEach(movie => {
        const row = document.createElement("tr");

        const titleCell = document.createElement("td");
        titleCell.textContent = movie.title || "Untitled";

        const categoryCell = document.createElement("td");
        categoryCell.textContent = movie.category || "Uncategorized";

        const dateCell = document.createElement("td");
        dateCell.textContent = movie.created_at
            ? new Date(movie.created_at).toLocaleDateString()
            : "Unknown";

        const statusCell = document.createElement("td");
        statusCell.textContent = movie.is_active ? "Active" : "Inactive";
        statusCell.className = "content-status";

        row.append(titleCell, categoryCell, dateCell, statusCell);
        tableBody.appendChild(row);
    });
}

// =========================================
// NAVIGATION
// =========================================

function initializeNavigation() {
    const links = document.querySelectorAll("[data-page]");
    const pageTitle = document.getElementById("pageTitle");
    const sidebar = document.getElementById("sidebar");

    function openPage(page) {
        const target = document.getElementById(`${page}Page`);
        if (!target) return;

        document.querySelectorAll(".dashboard-page")
            .forEach(section => section.classList.remove("active"));

        target.classList.add("active");

        document.querySelectorAll(".nav-link")
            .forEach(link => link.classList.toggle(
                "active",
                link.dataset.page === page
            ));

        const activeLink = document.querySelector(
            `.nav-link[data-page="${page}"]`
        );

        pageTitle.textContent = activeLink
            ? activeLink.querySelector("span:last-child").textContent
            : page.charAt(0).toUpperCase() + page.slice(1);

        sidebar.classList.remove("open");
    }

    links.forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            openPage(link.dataset.page);
            history.replaceState(null, "", `#${link.dataset.page}`);
        });
    });

    document.getElementById("sidebarToggle")
        .addEventListener("click", () => {
            sidebar.classList.toggle("open");
        });

    const requestedPage = location.hash.replace("#", "");

    if (requestedPage && document.getElementById(`${requestedPage}Page`)) {
        openPage(requestedPage);
    }
}

// =========================================
// LOGOUT
// =========================================

async function logout() {
    if (signingOut) return;

    signingOut = true;
    logoutButton.disabled = true;
    logoutButton.textContent = "Signing out...";

    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        window.location.replace("./index.html");
    } catch (error) {
        console.error("Logout error:", error);
        logoutButton.disabled = false;
        logoutButton.textContent = "↪ Sign Out";
        signingOut = false;
        alert("Unable to sign out. Please try again.");
    }
}

// =========================================
// SECURITY VERIFICATION
// =========================================

async function initializeDashboard() {
    showBoot();
if (!hasLoginHandoff) {
    await supabase.auth.signOut();
    window.location.replace("./index.html");
    return;
}
    const result = await verifyAdmin();

    if (!result.authorized) {
        if (result.error) {
            showError(result.reason);
            return;
        }

        await supabase.auth.signOut();
        window.location.replace("./index.html");
        return;
    }

    authorizedUserId = result.user.id;

    displayAdminProfile(result.user);
    showDashboard();

    initializeNavigation();

    logoutButton.addEventListener("click", logout);

    await Promise.all([
        loadDashboardStatistics(),
        loadRecentMovies()
    ]);

    console.log("CINEVA PRO dashboard initialized.");
}

// =========================================
// SESSION MONITORING
// =========================================

supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" && authorizedUserId && !signingOut) {
        window.location.replace("./index.html");
    }

    if (event === "SIGNED_IN" && session && authorizedUserId &&
        session.user.id !== authorizedUserId) {
        window.location.replace("./index.html");
    }
});

retryButton.addEventListener("click", initializeDashboard);

initializeDashboard();
