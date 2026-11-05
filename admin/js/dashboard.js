
import { supabase } from "../../js/config.js";
import { verifyAdmin } from "./admin-guard.js";

/* =========================================
   CINEVA PRO — DASHBOARD SECURITY
========================================= */

const LOGIN_HANDOFF_KEY = "cineva_admin_login_handoff";

const hasLoginHandoff =
    sessionStorage.getItem(LOGIN_HANDOFF_KEY) === "authorized";

sessionStorage.removeItem(LOGIN_HANDOFF_KEY);

let authorizedUserId = null;
let signingOut = false;
let initialized = false;

let moviesCache = [];
let seriesCache = [];
let episodesCache = [];

let selectedSeriesId = null;
let selectedSeriesName = "";

const $ = id => document.getElementById(id);

const bootScreen = $("adminBootScreen");
const errorScreen = $("adminErrorScreen");
const adminApp = $("adminApp");

const bootMessage = $("bootMessage");
const errorMessage = $("adminErrorMessage");

const retryButton = $("retryVerification");
const logoutButton = $("logoutButton");


/* =========================================
   SAFE DOM HELPERS
========================================= */

function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value ?? "";
}

function getValue(id) {
    return $(id)?.value ?? "";
}

function bind(id, event, callback) {
    const element = $(id);

    if (!element) {
        console.warn(`CINEVA: Element #${id} was not found.`);
        return;
    }

    element.addEventListener(event, callback);
}

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
    if (!tableBody) return;

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
   SCREEN MANAGEMENT
========================================= */

function showBoot(message = "Verifying administrator access...") {
    if (bootMessage) bootMessage.textContent = message;

    if (bootScreen) bootScreen.hidden = false;
    if (errorScreen) errorScreen.hidden = true;
    if (adminApp) adminApp.hidden = true;
}

function showError(message) {
    if (errorMessage) errorMessage.textContent = message;

    if (bootScreen) bootScreen.hidden = true;
    if (errorScreen) errorScreen.hidden = false;
    if (adminApp) adminApp.hidden = true;
}

function showDashboard() {
    if (bootScreen) bootScreen.hidden = true;
    if (errorScreen) errorScreen.hidden = true;
    if (adminApp) adminApp.hidden = false;
}


/* =========================================
   ADMIN PROFILE
========================================= */

function displayAdminProfile(user) {
    const email = user.email || "Administrator";
    const name = email.split("@")[0];

    setText("adminName", name);
    setText("adminEmail", email);
    setText("adminAvatar", name.charAt(0).toUpperCase());
    setText("currentYear", new Date().getFullYear());

    setText(
        "dashboardDate",
        new Intl.DateTimeFormat("en", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        }).format(new Date())
    );
}


/* =========================================
   DASHBOARD STATISTICS
   Categories are derived from movies.
   No categories table is required.
========================================= */

async function loadDashboardStatistics() {
    const results = await Promise.allSettled([
        supabase
            .from("movies")
            .select("id", { count: "exact", head: true }),

        supabase
            .from("series")
            .select("id", { count: "exact", head: true }),

        supabase
            .from("movies")
            .select("id", { count: "exact", head: true })
            .eq("is_featured", true)
    ]);

    const labels = ["Movies", "Series", "Featured"];

    results.forEach((result, index) => {
        const elementId = [
            "totalMovies",
            "totalSeries",
            "totalFeatured"
        ][index];

        if (result.status === "rejected") {
            console.error(
                `${labels[index]} statistics failed:`,
                result.reason
            );

            setText(elementId, "—");
            return;
        }

        const response = result.value;

        if (response.error) {
            console.error(
                `${labels[index]} statistics error:`,
                response.error
            );

            setText(elementId, "—");
            return;
        }

        setText(elementId, response.count ?? 0);
    });

    // Derive unique categories from the movie records.
    const uniqueCategories = new Set(
        moviesCache
            .map(movie => movie.category?.trim())
            .filter(Boolean)
    );

    setText("totalCategories", uniqueCategories.size);
}


/* =========================================
   RECENT MOVIES
========================================= */

async function loadRecentMovies() {
    const tableBody = $("recentMoviesTable");

    if (!tableBody) {
        console.warn("CINEVA: #recentMoviesTable was not found.");
        return;
    }

    showTableMessage(tableBody, 4, "Loading recent movies...");

    try {
        const { data, error } = await supabase
            .from("movies")
            .select("id, title, category, created_at, is_active")
            .order("created_at", { ascending: false })
            .limit(5);

        if (error) throw error;

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

    } catch (error) {
        console.error("Recent movies loading error:", error);
        showTableMessage(tableBody, 4, "Unable to load recent movies.");
    }
}


/* =========================================
   MOVIES MANAGEMENT
========================================= */

async function loadMovies() {
    const tableBody = $("moviesTable");

    showTableMessage(tableBody, 6, "Loading movies...");

    try {
        const { data, error } = await supabase
            .from("movies")
            .select(
                "id, title, category, year, is_active, is_featured, created_at"
            )
            .order("created_at", { ascending: false });

        if (error) throw error;

        moviesCache = data || [];

        populateMovieCategories();
        renderMovies();

        console.log(`CINEVA: Loaded ${moviesCache.length} movies.`);

    } catch (error) {
        console.error("Movies loading error:", error);

        showTableMessage(
            tableBody,
            6,
            `Unable to load movies: ${error.message || "Unknown error"}`
        );
    }
}


function populateMovieCategories() {
    const select = $("movieCategoryFilter");
    if (!select) return;

    const previousValue = select.value;

    const categories = [
        ...new Set(
            moviesCache
                .map(movie => movie.category?.trim())
                .filter(Boolean)
        )
    ].sort((a, b) => a.localeCompare(b));

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

    select.value = categories.includes(previousValue)
        ? previousValue
        : "";
}


function renderMovies() {
    const tableBody = $("moviesTable");
    if (!tableBody) return;

    const search = getValue("movieSearch").trim().toLowerCase();
    const category = getValue("movieCategoryFilter");
    const status = getValue("movieStatusFilter");

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

    setText("movieResultsCount", `${filtered.length} movie(s) found`);

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

            createButton(
                "Delete",
                "table-action delete",
                "delete-movie",
                movie.id
            )
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
    const movie = moviesCache.find(
        item => String(item.id) === String(id)
    );

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
        console.error("Movie update error:", error);
        alert("Unable to update movie status: " + error.message);
        return;
    }

    await refreshContent();
}


async function deleteMovie(id) {
    const movie = moviesCache.find(
        item => String(item.id) === String(id)
    );

    if (!movie) return;

    if (!confirm(
        `Delete "${movie.title}" permanently? This cannot be undone.`
    )) return;

    const { error } = await supabase
        .from("movies")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Movie deletion error:", error);
        alert("Unable to delete movie: " + error.message);
        return;
    }

    await refreshContent();
}


/* =========================================
   SERIES MANAGEMENT
========================================= */

async function loadSeries() {
    const tableBody = $("seriesTable");

    showTableMessage(tableBody, 6, "Loading series...");

    try {
        const { data, error } = await supabase
            .from("series")
            .select(
                "id, title, category, year, total_seasons, is_active, created_at"
            )
            .order("created_at", { ascending: false });

        if (error) throw error;

        seriesCache = data || [];

        renderSeries();

        console.log(`CINEVA: Loaded ${seriesCache.length} series.`);

    } catch (error) {
        console.error("Series loading error:", error);

        showTableMessage(
            tableBody,
            6,
            `Unable to load series: ${error.message || "Unknown error"}`
        );
    }
}


function renderSeries() {
    const tableBody = $("seriesTable");
    if (!tableBody) return;

    const search = getValue("seriesSearch").trim().toLowerCase();
    const status = getValue("seriesStatusFilter");

    const filtered = seriesCache.filter(series => {
        const matchesSearch =
            (series.title || "").toLowerCase().includes(search);

        const matchesStatus =
            status === "" ||
            String(series.is_active !== false) === status;

        return matchesSearch && matchesStatus;
    });

    setText("seriesResultsCount", `${filtered.length} series found`);

    tableBody.replaceChildren();

    if (!filtered.length) {
        showTableMessage(tableBody, 6, "No matching series found.");
        return;
    }

    filtered.forEach(series => {
        const row = document.createElement("tr");
        const actions = document.createElement("td");

        actions.append(
            createButton(
                "Episodes",
                "table-action edit",
                "open-episodes",
                series.id
            ),

            createButton(
                "Edit",
                "table-action edit",
                "edit-series",
                series.id
            ),

            createButton(
                series.is_active === false ? "Activate" : "Deactivate",
                "table-action",
                "toggle-series",
                series.id
            ),

            createButton(
                "Delete",
                "table-action delete",
                "delete-series",
                series.id
            )
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
    const series = seriesCache.find(
        item => String(item.id) === String(id)
    );

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
        console.error("Series update error:", error);
        alert("Unable to update series status: " + error.message);
        return;
    }

    await refreshContent();
}


async function deleteSeries(id) {
    const series = seriesCache.find(
        item => String(item.id) === String(id)
    );

    if (!series) return;

    const confirmed = confirm(
        `Delete "${series.title}" permanently?\n\n` +
        "This may fail if episodes are still linked to this series."
    );

    if (!confirmed) return;

    const { error } = await supabase
        .from("series")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Series deletion error:", error);

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

    setText(
        "selectedSeriesTitle",
        `${series.title} — Episodes`
    );

    const panel = $("episodeManagementPanel");
    if (panel) panel.hidden = false;

    await loadEpisodes();
}


function closeEpisodeManager() {
    selectedSeriesId = null;
    selectedSeriesName = "";
    episodesCache = [];

    const panel = $("episodeManagementPanel");
    if (panel) panel.hidden = true;
}


async function loadEpisodes() {
    if (selectedSeriesId === null) return;

    const tableBody = $("episodesTable");

    showTableMessage(tableBody, 7, "Loading episodes...");

    try {
        const { data, error } = await supabase
            .from("episodes")
            .select(
                "id, series_id, season, episode, season_number, " +
                "episode_number, title, duration, is_active, is_final"
            )
            .eq("series_id", selectedSeriesId)
            .order("season_number", { ascending: true })
            .order("episode_number", { ascending: true });

        if (error) throw error;

        episodesCache = data || [];

        populateEpisodeSeasons();
        renderEpisodes();

    } catch (error) {
        console.error("Episodes loading error:", error);

        showTableMessage(
            tableBody,
            7,
            `Unable to load episodes: ${error.message || "Unknown error"}`
        );
    }
}


function populateEpisodeSeasons() {
    const select = $("episodeSeasonFilter");
    if (!select) return;

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

    select.value = seasons.some(
        season => String(season) === previousValue
    ) ? previousValue : "";
}


function renderEpisodes() {
    const tableBody = $("episodesTable");
    if (!tableBody) return;

    const seasonFilter = getValue("episodeSeasonFilter");

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
            createButton(
                "Edit",
                "table-action edit",
                "edit-episode",
                item.id
            ),

            createButton(
                item.is_active === false ? "Activate" : "Deactivate",
                "table-action",
                "toggle-episode",
                item.id
            ),

            createButton(
                "Delete",
                "table-action delete",
                "delete-episode",
                item.id
            )
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
        console.error("Episode update error:", error);
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

    if (!confirm(
        `Delete "${item.title || "this episode"}" permanently?`
    )) return;

    const { error } = await supabase
        .from("episodes")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Episode deletion error:", error);
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

    if (!button || button.disabled) return;

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
                alert(
                    "The Add/Edit forms will be connected in the next implementation step."
                );
                break;
        }

    } catch (error) {
        console.error("Dashboard action error:", error);
        alert("Something went wrong. Check the browser Console.");

    } finally {
        button.disabled = false;
    }
});


/* =========================================
   SEARCH AND FILTERS
========================================= */

bind("movieSearch", "input", renderMovies);
bind("movieCategoryFilter", "change", renderMovies);
bind("movieStatusFilter", "change", renderMovies);

bind("seriesSearch", "input", renderSeries);
bind("seriesStatusFilter", "change", renderSeries);

bind("episodeSeasonFilter", "change", renderEpisodes);


/* =========================================
   REFRESH CONTENT
========================================= */

async function refreshContent() {
    await Promise.all([
        loadMovies(),
        loadSeries(),
        loadRecentMovies()
    ]);

    // Statistics run after movies load so category
    // totals use the latest movie records.
    await loadDashboardStatistics();
}

bind("refreshMoviesBtn", "click", loadMovies);
bind("refreshSeriesBtn", "click", loadSeries);
bind("closeEpisodeManager", "click", closeEpisodeManager);


/* =========================================
   ADD BUTTONS
========================================= */

bind("addMovieBtn", "click", () => {
    alert("The Add Movie form will be connected in the next implementation step.");
});

bind("addSeriesBtn", "click", () => {
    alert("The Add Series form will be connected in the next implementation step.");
});

bind("addEpisodeBtn", "click", () => {
    if (selectedSeriesId === null) {
        alert("Please select a series first.");
        return;
    }

    alert("The Add Episode form will be connected in the next implementation step.");
});


/* =========================================
   NAVIGATION
========================================= */

function initializeNavigation() {
    const links = document.querySelectorAll("[data-page]");
    const pageTitle = $("pageTitle");
    const sidebar = $("sidebar");

    function openPage(page) {
        const target = $(`${page}Page`);

        if (!target) return;

        document.querySelectorAll(".dashboard-page")
            .forEach(section => section.classList.remove("active"));

        target.classList.add("active");

        document.querySelectorAll(".nav-link")
            .forEach(link => {
                link.classList.toggle(
                    "active",
                    link.dataset.page === page
                );
            });

        const activeLink = document.querySelector(
            `.nav-link[data-page="${page}"]`
        );

        const titleElement = activeLink?.querySelector("span:last-child");

        if (pageTitle) {
            pageTitle.textContent = titleElement
                ? titleElement.textContent
                : page.charAt(0).toUpperCase() + page.slice(1);
        }

        sidebar?.classList.remove("open");
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

    bind("sidebarToggle", "click", () => {
        sidebar?.classList.toggle("open");
    });

    const requestedPage = location.hash.replace("#", "");

    if (requestedPage && $(`${requestedPage}Page`)) {
        openPage(requestedPage);
    }
}


/* =========================================
   LOGOUT
========================================= */

async function logout() {
    if (signingOut) return;

    signingOut = true;

    if (logoutButton) {
        logoutButton.disabled = true;
        logoutButton.textContent = "Signing out...";
    }

    try {
        const { error } = await supabase.auth.signOut();

        if (error) throw error;

        window.location.replace("./index.html");

    } catch (error) {
        console.error("Logout error:", error);

        if (logoutButton) {
            logoutButton.disabled = false;
            logoutButton.textContent = "↪ Sign Out";
        }

        signingOut = false;

        alert("Unable to sign out. Please try again.");
    }
}


/* =========================================
   SECURITY VERIFICATION
========================================= */

async function initializeDashboard() {
    if (initialized) return;

    showBoot();

    try {
        // A dashboard refresh has no login handoff.
        // Always sign out and require a fresh login.
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

        initialized = true;

        displayAdminProfile(result.user);
        showDashboard();

        initializeNavigation();

        bind("logoutButton", "click", logout);

        await refreshContent();

        if (selectedSeriesId !== null) {
            await loadEpisodes();
        }

        console.log("CINEVA PRO management dashboard initialized.");

    } catch (error) {
        console.error("Dashboard initialization error:", error);

        initialized = false;

        showError(
            "Dashboard initialization failed. " +
            (error.message || "Please try again.")
        );
    }
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


/* =========================================
   RETRY VERIFICATION
========================================= */

bind("retryVerification", "click", async () => {
    initialized = false;
    await initializeDashboard();
});


/* =========================================
   START DASHBOARD
========================================= */

initializeDashboard();
