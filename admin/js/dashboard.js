
import { supabase } from "../../js/config.js";
import { verifyAdmin } from "./admin-guard.js";

/* =========================================
   CINEVA PRO — DASHBOARD SECURITY
========================================= */

const LOGIN_HANDOFF_KEY = "cineva_admin_login_handoff";

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

let moviesCache = [];
let seriesCache = [];
let episodesCache = [];

let selectedSeriesId = null;
let selectedSeriesName = "";


/* =========================================
   SCREEN MANAGEMENT
========================================= */

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


/* =========================================
   ADMIN PROFILE
========================================= */

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


/* =========================================
   SAFE DOM HELPERS
========================================= */

function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value ?? "—";
    return cell;
}

function createButton(label, className, action, id) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;
    button.className = className;
    button.dataset.action = action;
    button.dataset.id = String(id);

    return button;
}

function showTableMessage(tableBody, colspan, message) {
    tableBody.replaceChildren();

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = colspan;
    cell.className = "table-loading";
    cell.textContent = message;

    row.appendChild(cell);
    tableBody.appendChild(row);
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleDateString();
}

function getStatus(value) {
    return value === false ? "Inactive" : "Active";
}


/* =========================================
   DASHBOARD STATISTICS
========================================= */

async function loadDashboardStatistics() {
    const [movies, series, categories, featured] =
        await Promise.all([
            supabase.from("movies")
                .select("id", { count: "exact", head: true }),

            supabase.from("series")
                .select("id", { count: "exact", head: true }),

            supabase.from("categories")
                .select("id", { count: "exact", head: true }),

            supabase.from("movies")
                .select("id", { count: "exact", head: true })
                .eq("is_featured", true)
        ]);

    document.getElementById("totalMovies").textContent =
        movies.error ? "—" : (movies.count ?? 0);

    document.getElementById("totalSeries").textContent =
        series.error ? "—" : (series.count ?? 0);

    document.getElementById("totalCategories").textContent =
        categories.error ? "—" : (categories.count ?? 0);

    document.getElementById("totalFeatured").textContent =
        featured.error ? "—" : (featured.count ?? 0);

    [movies, series, categories, featured].forEach(result => {
        if (result.error) {
            console.error("Dashboard statistics error:", result.error);
        }
    });
}


/* =========================================
   RECENT MOVIES
========================================= */

async function loadRecentMovies() {
    const tableBody = document.getElementById("recentMoviesTable");

    const { data, error } = await supabase
        .from("movies")
        .select("id, title, category, created_at, is_active")
        .order("created_at", { ascending: false })
        .limit(5);

    if (error) {
        console.error("Recent movies error:", error);
        showTableMessage(tableBody, 4, "Unable to load recent movies.");
        return;
    }

    tableBody.replaceChildren();

    if (!data?.length) {
        showTableMessage(tableBody, 4, "No movies found.");
        return;
    }

    data.forEach(movie => {
        const row = document.createElement("tr");

        row.append(
            createCell(movie.title || "Untitled"),
            createCell(movie.category || "Uncategorized"),
            createCell(formatDate(movie.created_at)),
            createCell(getStatus(movie.is_active))
        );

        tableBody.appendChild(row);
    });
}


/* =========================================
   MOVIES MANAGEMENT
========================================= */

async function loadMovies() {
    const tableBody = document.getElementById("moviesTable");

    showTableMessage(tableBody, 6, "Loading movies...");

    const { data, error } = await supabase
        .from("movies")
        .select("id, title, category, year, is_active, is_featured, created_at")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Movies loading error:", error);
        showTableMessage(tableBody, 6, "Unable to load movies.");
        return;
    }

    moviesCache = data || [];

    populateMovieCategories();
    renderMovies();
}

function populateMovieCategories() {
    const select = document.getElementById("movieCategoryFilter");
    const previousValue = select.value;

    const categories = [
        ...new Set(
            moviesCache
                .map(movie => movie.category)
                .filter(Boolean)
        )
    ].sort();

    select.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All Categories";
    select.appendChild(allOption);

    categories.forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
    });

    select.value = previousValue;
}

function renderMovies() {
    const tableBody = document.getElementById("moviesTable");

    const search = document.getElementById("movieSearch")
        .value.trim().toLowerCase();

    const category = document.getElementById("movieCategoryFilter").value;
    const status = document.getElementById("movieStatusFilter").value;

    const filtered = moviesCache.filter(movie => {
        const matchesSearch =
            (movie.title || "").toLowerCase().includes(search);

        const matchesCategory =
            !category || movie.category === category;

        const matchesStatus =
            status === "" ||
            String(movie.is_active !== false) === status;

        return matchesSearch && matchesCategory && matchesStatus;
    });

    document.getElementById("movieResultsCount").textContent =
        `${filtered.length} movie(s) found`;

    tableBody.replaceChildren();

    if (!filtered.length) {
        showTableMessage(tableBody, 6, "No matching movies found.");
        return;
    }

    filtered.forEach(movie => {
        const row = document.createElement("tr");

        const actions = document.createElement("td");

        actions.append(
            createButton("Edit", "table-action edit", "edit-movie", movie.id),
            createButton(
                movie.is_active === false ? "Activate" : "Deactivate",
                "table-action",
                "toggle-movie",
                movie.id
            ),
            createButton("Delete", "table-action delete", "delete-movie", movie.id)
        );

        row.append(
            createCell(movie.title || "Untitled"),
            createCell(movie.category || "Uncategorized"),
            createCell(movie.year || "—"),
            createCell(getStatus(movie.is_active)),
            createCell(movie.is_featured ? "Yes" : "No"),
            actions
        );

        tableBody.appendChild(row);
    });
}

async function toggleMovie(id) {
    const movie = moviesCache.find(item => String(item.id) === String(id));
    if (!movie) return;

    const nextStatus = movie.is_active === false;

    const { error } = await supabase
        .from("movies")
        .update({
            is_active: nextStatus,
            updated_at: new Date().toISOString()
        })
        .eq("id", id);

    if (error) {
        console.error(error);
        alert("Unable to update movie status: " + error.message);
        return;
    }

    await refreshContent();
}

async function deleteMovie(id) {
    const movie = moviesCache.find(item => String(item.id) === String(id));
    if (!movie) return;

    if (!confirm(`Delete "${movie.title}" permanently? This cannot be undone.`)) {
        return;
    }

    const { error } = await supabase
        .from("movies")
        .delete()
        .eq("id", id);

    if (error) {
        console.error(error);
        alert("Unable to delete movie: " + error.message);
        return;
    }

    await refreshContent();
}


/* =========================================
   SERIES MANAGEMENT
========================================= */

async function loadSeries() {
    const tableBody = document.getElementById("seriesTable");

    showTableMessage(tableBody, 6, "Loading series...");

    const { data, error } = await supabase
        .from("series")
        .select("id, title, category, year, total_seasons, is_active, created_at")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Series loading error:", error);
        showTableMessage(tableBody, 6, "Unable to load series.");
        return;
    }

    seriesCache = data || [];
    renderSeries();
}

function renderSeries() {
    const tableBody = document.getElementById("seriesTable");

    const search = document.getElementById("seriesSearch")
        .value.trim().toLowerCase();

    const status = document.getElementById("seriesStatusFilter").value;

    const filtered = seriesCache.filter(series => {
        const matchesSearch =
            (series.title || "").toLowerCase().includes(search);

        const matchesStatus =
            status === "" ||
            String(series.is_active !== false) === status;

        return matchesSearch && matchesStatus;
    });

    document.getElementById("seriesResultsCount").textContent =
        `${filtered.length} series found`;

    tableBody.replaceChildren();

    if (!filtered.length) {
        showTableMessage(tableBody, 6, "No matching series found.");
        return;
    }

    filtered.forEach(series => {
        const row = document.createElement("tr");
        const actions = document.createElement("td");

        actions.append(
            createButton("Episodes", "table-action edit", "open-episodes", series.id),
            createButton("Edit", "table-action edit", "edit-series", series.id),
            createButton(
                series.is_active === false ? "Activate" : "Deactivate",
                "table-action",
                "toggle-series",
                series.id
            ),
            createButton("Delete", "table-action delete", "delete-series", series.id)
        );

        row.append(
            createCell(series.title || "Untitled"),
            createCell(series.category || "Uncategorized"),
            createCell(series.year || "—"),
            createCell(series.total_seasons ?? 1),
            createCell(getStatus(series.is_active)),
            actions
        );

        tableBody.appendChild(row);
    });
}

async function toggleSeries(id) {
    const series = seriesCache.find(item => String(item.id) === String(id));
    if (!series) return;

    const nextStatus = series.is_active === false;

    const { error } = await supabase
        .from("series")
        .update({
            is_active: nextStatus,
            updated_at: new Date().toISOString()
        })
        .eq("id", id);

    if (error) {
        console.error(error);
        alert("Unable to update series status: " + error.message);
        return;
    }

    await refreshContent();
}

async function deleteSeries(id) {
    const series = seriesCache.find(item => String(item.id) === String(id));
    if (!series) return;

    const confirmed = confirm(
        `Delete "${series.title}" permanently?\n\n` +
        "Check its episodes and database relationships before proceeding."
    );

    if (!confirmed) return;

    const { error } = await supabase
        .from("series")
        .delete()
        .eq("id", id);

    if (error) {
        console.error(error);
        alert(
            "Unable to delete series. It may still have related episodes.\n\n" +
            error.message
        );
        return;
    }

    closeEpisodeManager();
    await refreshContent();
}


/* =========================================
   EPISODES MANAGEMENT
========================================= */

async function openEpisodeManager(seriesId) {
    const series = seriesCache.find(
        item => String(item.id) === String(seriesId)
    );

    if (!series) return;

    selectedSeriesId = series.id;
    selectedSeriesName = series.title;

    document.getElementById("selectedSeriesTitle").textContent =
        `${series.title} — Episodes`;

    document.getElementById("episodeManagementPanel").hidden = false;

    await loadEpisodes();
}

function closeEpisodeManager() {
    selectedSeriesId = null;
    selectedSeriesName = "";

    document.getElementById("episodeManagementPanel").hidden = true;
}

async function loadEpisodes() {
    if (selectedSeriesId === null) return;

    const tableBody = document.getElementById("episodesTable");

    showTableMessage(tableBody, 7, "Loading episodes...");

    const { data, error } = await supabase
        .from("episodes")
        .select(
            "id, series_id, season, episode, season_number, episode_number, title, duration, is_active, is_final"
        )
        .eq("series_id", selectedSeriesId)
        .order("season_number", { ascending: true })
        .order("episode_number", { ascending: true });

    if (error) {
        console.error("Episodes loading error:", error);
        showTableMessage(tableBody, 7, "Unable to load episodes.");
        return;
    }

    episodesCache = data || [];

    populateEpisodeSeasons();
    renderEpisodes();
}

function populateEpisodeSeasons() {
    const select = document.getElementById("episodeSeasonFilter");
    const previousValue = select.value;

    const seasons = [
        ...new Set(
            episodesCache.map(item =>
                item.season_number ?? item.season ?? 1
            )
        )
    ].sort((a, b) => a - b);

    select.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All Seasons";
    select.appendChild(allOption);

    seasons.forEach(season => {
        const option = document.createElement("option");
        option.value = String(season);
        option.textContent = `Season ${season}`;
        select.appendChild(option);
    });

    select.value = previousValue;
}

function renderEpisodes() {
    const tableBody = document.getElementById("episodesTable");
    const seasonFilter = document.getElementById("episodeSeasonFilter").value;

    const filtered = episodesCache.filter(item => {
        const season = item.season_number ?? item.season ?? 1;

        return !seasonFilter || String(season) === seasonFilter;
    });

    tableBody.replaceChildren();

    if (!filtered.length) {
        showTableMessage(tableBody, 7, "No episodes found for this series.");
        return;
    }

    filtered.forEach(item => {
        const row = document.createElement("tr");
        const actions = document.createElement("td");

        const season = item.season_number ?? item.season ?? 1;
        const episode = item.episode_number ?? item.episode ?? 1;

        actions.append(
            createButton("Edit", "table-action edit", "edit-episode", item.id),
            createButton(
                item.is_active === false ? "Activate" : "Deactivate",
                "table-action",
                "toggle-episode",
                item.id
            ),
            createButton("Delete", "table-action delete", "delete-episode", item.id)
        );

        row.append(
            createCell(episode),
            createCell(season),
            createCell(item.title || `Episode ${episode}`),
            createCell(item.duration || "—"),
            createCell(getStatus(item.is_active)),
            createCell(item.is_final ? "Yes" : "No"),
            actions
        );

        tableBody.appendChild(row);
    });
}

async function toggleEpisode(id) {
    const item = episodesCache.find(
        episode => String(episode.id) === String(id)
    );

    if (!item) return;

    const { error } = await supabase
        .from("episodes")
        .update({
            is_active: item.is_active === false,
            updated_at: new Date().toISOString()
        })
        .eq("id", id);

    if (error) {
        console.error(error);
        alert("Unable to update episode: " + error.message);
        return;
    }

    await loadEpisodes();
}

async function deleteEpisode(id) {
    const item = episodesCache.find(
        episode => String(episode.id) === String(id)
    );

    if (!item) return;

    if (!confirm(`Delete "${item.title || "this episode"}" permanently?`)) {
        return;
    }

    const { error } = await supabase
        .from("episodes")
        .delete()
        .eq("id", id);

    if (error) {
        console.error(error);
        alert("Unable to delete episode: " + error.message);
        return;
    }

    await loadEpisodes();
}


/* =========================================
   TABLE ACTIONS
========================================= */

document.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;

    if (!id) return;

    button.disabled = true;

    try {
        switch (action) {
            case "toggle-movie":
                await toggleMovie(id);
                break;

            case "delete-movie":
                await deleteMovie(id);
                break;

            case "toggle-series":
                await toggleSeries(id);
                break;

            case "delete-series":
                await deleteSeries(id);
                break;

            case "open-episodes":
                await openEpisodeManager(id);
                break;

            case "toggle-episode":
                await toggleEpisode(id);
                break;

            case "delete-episode":
                await deleteEpisode(id);
                break;

            case "edit-movie":
            case "edit-series":
            case "edit-episode":
                alert("The Add/Edit forms will be connected in the next implementation step.");
                break;
        }
    } finally {
        button.disabled = false;
    }
});


/* =========================================
   SEARCH AND FILTERS
========================================= */

document.getElementById("movieSearch")
    .addEventListener("input", renderMovies);

document.getElementById("movieCategoryFilter")
    .addEventListener("change", renderMovies);

document.getElementById("movieStatusFilter")
    .addEventListener("change", renderMovies);

document.getElementById("seriesSearch")
    .addEventListener("input", renderSeries);

document.getElementById("seriesStatusFilter")
    .addEventListener("change", renderSeries);

document.getElementById("episodeSeasonFilter")
    .addEventListener("change", renderEpisodes);


/* =========================================
   REFRESH BUTTONS
========================================= */

async function refreshContent() {
    await Promise.all([
        loadMovies(),
        loadSeries(),
        loadDashboardStatistics(),
        loadRecentMovies()
    ]);
}

document.getElementById("refreshMoviesBtn")
    .addEventListener("click", loadMovies);

document.getElementById("refreshSeriesBtn")
    .addEventListener("click", loadSeries);

document.getElementById("closeEpisodeManager")
    .addEventListener("click", closeEpisodeManager);


/* =========================================
   ADD BUTTONS
   Forms are added in the next step.
========================================= */

document.getElementById("addMovieBtn")
    .addEventListener("click", () => {
        alert("The Add Movie form will be connected in the next step.");
    });

document.getElementById("addSeriesBtn")
    .addEventListener("click", () => {
        alert("The Add Series form will be connected in the next step.");
    });

document.getElementById("addEpisodeBtn")
    .addEventListener("click", () => {
        if (selectedSeriesId === null) {
            alert("Please select a series first.");
            return;
        }

        alert("The Add Episode form will be connected in the next step.");
    });


/* =========================================
   NAVIGATION
========================================= */

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

            history.replaceState(
                null,
                "",
                `#${link.dataset.page}`
            );
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


/* =========================================
   LOGOUT
========================================= */

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


/* =========================================
   SECURITY VERIFICATION
========================================= */

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

    await refreshContent();

    if (selectedSeriesId !== null) {
        await loadEpisodes();
    }

    console.log("CINEVA PRO management dashboard initialized.");
}


/* =========================================
   SESSION MONITORING
========================================= */

supabase.auth.onAuthStateChange((event, session) => {
    if (
        event === "SIGNED_OUT" &&
        authorizedUserId &&
        !signingOut
    ) {
        window.location.replace("./index.html");
    }

    if (
        event === "SIGNED_IN" &&
        session &&
        authorizedUserId &&
        session.user.id !== authorizedUserId
    ) {
        window.location.replace("./index.html");
    }
});

retryButton.addEventListener("click", initializeDashboard);

initializeDashboard();
