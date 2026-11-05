
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
.select(`
    id,
    title,
    category,
    year,
    is_active,
    is_featured,
    created_at,
    overview,
    translator,
    language,
    country,
    quality,
    runtime,
    release_date,
    poster_path,
    backdrop_path,
    video_url,
    download_url,
    download_links,
    parts
`)
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
document.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");

    if (!button || button.disabled) return;

    const { action, id } = button.dataset;
    if (!id) return;

    button.disabled = true;

    try {
        switch (action) {
            case "edit-movie": {
                const movie = moviesCache.find(
                    item => String(item.id) === String(id)
                );

                if (movie) {
                    openMovieForm(movie);
                }
                break;
            }

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

            case "edit-series":
            case "edit-episode":
                alert("Series and episode forms will be implemented separately.");
                break;
        }

    } catch (error) {
        console.error("Dashboard action error:", error);
        alert("Something went wrong. Check the browser Console.");

    } finally {
        button.disabled = false;
    }
});
function closeMovieForm() {
    if (!movieModal) return;

    const form = movieModal.querySelector("#movieForm");

    form?.reset();

    renderDownloadLinks([]);

    movieModal.hidden = true;
}
/* =========================================
   SEARCH AND FILTERS
========================================= */

// ADD MOVIE BUTTON
bind("addMovieBtn", "click", () => {
    openMovieForm();
});

// MOVIE SEARCH AND FILTERS
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
   CINEVA PRO — MULTIPLE MOVIE DOWNLOAD LINKS
   Supabase: movies.download_links (JSONB)
========================================= */

function normalizeDownloadLinks(value) {
    if (!value) return [];

    let links = value;

    if (typeof links === "string") {
        try {
            links = JSON.parse(links);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(links)) return [];

    return links.map(link => {
        if (typeof link === "string") {
            return {
                label: "Download",
                url: link
            };
        }

        return {
            label: String(
                link?.label || link?.name || "Download"
            ).trim(),

            url: String(
                link?.url ||
                link?.link ||
                link?.download_url ||
                ""
            ).trim()
        };
    }).filter(link => link.url);
}


/* CREATE DOWNLOAD LINK ROW */

function createDownloadLinkRow(label = "", url = "") {
    const row = document.createElement("div");

    row.className = "cineva-download-row";

    const labelField = document.createElement("div");
    labelField.className = "cineva-field";

    const labelTitle = document.createElement("label");
    labelTitle.textContent = "Button Name";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "download-link-label";
    labelInput.placeholder = "Download 720p";
    labelInput.maxLength = 60;
    labelInput.value = label;

    labelField.append(labelTitle, labelInput);

    const urlField = document.createElement("div");
    urlField.className = "cineva-field";

    const urlTitle = document.createElement("label");
    urlTitle.textContent = "Download URL";

    const urlInput = document.createElement("input");
    urlInput.type = "url";
    urlInput.className = "download-link-url";
    urlInput.placeholder = "https://example.com/movie";
    urlInput.value = url;

    urlField.append(urlTitle, urlInput);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "cineva-remove-link";
    removeButton.textContent = "Remove";
    removeButton.dataset.removeDownloadLink = "true";

    row.append(labelField, urlField, removeButton);

    return row;
}


/* RENDER SAVED DOWNLOAD LINKS */

function renderDownloadLinks(links = []) {
    const container = movieModal?.querySelector(
        "#downloadLinksContainer"
    );

    const emptyMessage = movieModal?.querySelector(
        "#downloadLinksEmpty"
    );

    if (!container) return;

    container.replaceChildren();

    normalizeDownloadLinks(links).forEach(link => {
        container.appendChild(
            createDownloadLinkRow(link.label, link.url)
        );
    });

    if (emptyMessage) {
        emptyMessage.hidden = container.children.length > 0;
    }
}


/* COLLECT DOWNLOAD LINKS */

function collectDownloadLinks() {
    const container = movieModal?.querySelector(
        "#downloadLinksContainer"
    );

    if (!container) return [];

    const rows = [
        ...container.querySelectorAll(".cineva-download-row")
    ];

    const links = [];

    for (const row of rows) {
        const label = row
            .querySelector(".download-link-label")
            ?.value.trim() || "";

        const url = row
            .querySelector(".download-link-url")
            ?.value.trim() || "";

        if (!label && !url) continue;

        if (!label || !url) {
            throw new Error(
                "Every download button needs both a name and a URL."
            );
        }

        let parsedURL;

        try {
            parsedURL = new URL(url);
        } catch {
            throw new Error(
                `Invalid download URL: ${url}`
            );
        }

        if (!["http:", "https:"].includes(parsedURL.protocol)) {
            throw new Error(
                "Download links must use HTTP or HTTPS."
            );
        }

        links.push({
            label,
            url
        });
    }

    return links;
}


/* INITIALIZE DOWNLOAD EVENTS */

function initializeDownloadLinkEvents() {
    if (!movieModal) return;

    const container = movieModal.querySelector(
        "#downloadLinksContainer"
    );

    const addButton = movieModal.querySelector(
        "#addDownloadLink"
    );

    const emptyMessage = movieModal.querySelector(
        "#downloadLinksEmpty"
    );

    if (!container || !addButton || !emptyMessage) {
        console.error(
            "CINEVA: Multiple download link elements are missing."
        );
        return;
    }

    addButton.addEventListener("click", () => {
        const row = createDownloadLinkRow();

        container.appendChild(row);
        emptyMessage.hidden = true;

        row.querySelector(".download-link-label").focus();
    });

    container.addEventListener("click", event => {
        const removeButton = event.target.closest(
            "[data-remove-download-link]"
        );

        if (!removeButton) return;

        removeButton.closest(".cineva-download-row")?.remove();

        emptyMessage.hidden = container.children.length > 0;
    });
}
/* =========================================
   CINEVA PRO — MOVIE PARTS
========================================= */

function createMoviePartRow(part = {}) {
    const row = document.createElement("div");
    row.className = "cineva-part-row";

    function createField(labelText, className, type, placeholder, value) {
        const field = document.createElement("div");
        field.className = "cineva-field";

        const label = document.createElement("label");
        label.textContent = labelText;

        const input = document.createElement("input");
        input.type = type;
        input.className = className;
        input.placeholder = placeholder;
        input.value = value || "";

        if (type === "text") {
            input.maxLength = 100;
        }

        field.append(label, input);
        return field;
    }

    const title = createField(
        "Part Title",
        "movie-part-title",
        "text",
        "Part A",
        part.title
    );

    const watch = createField(
        "Watch URL",
        "movie-part-watch",
        "url",
        "https://example.com/watch",
        part.watch_url || part.video_url
    );

    const download = createField(
        "Download URL",
        "movie-part-download",
        "url",
        "https://example.com/download",
        part.download_url
    );

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cineva-remove-part";
    remove.dataset.removeMoviePart = "true";
    remove.textContent = "Remove";

    row.append(title, watch, download, remove);

    return row;
}


function renderMovieParts(parts = []) {
    const container = movieModal?.querySelector(
        "#moviePartsContainer"
    );

    const emptyMessage = movieModal?.querySelector(
        "#moviePartsEmpty"
    );

    if (!container) return;

    if (typeof parts === "string") {
        try {
            parts = JSON.parse(parts);
        } catch {
            parts = [];
        }
    }

    if (!Array.isArray(parts)) parts = [];

    container.replaceChildren();

    parts.slice(0, 5).forEach(part => {
        container.appendChild(createMoviePartRow(part));
    });

    if (emptyMessage) {
        emptyMessage.hidden = container.children.length > 0;
    }
}


function collectMovieParts() {
    const container = movieModal?.querySelector(
        "#moviePartsContainer"
    );

    if (!container) return [];

    const rows = [
        ...container.querySelectorAll(".cineva-part-row")
    ];

    if (rows.length > 5) {
        throw new Error("A movie can have a maximum of 5 parts.");
    }

    const parts = [];

    for (const [index, row] of rows.entries()) {
        const title = row.querySelector(
            ".movie-part-title"
        )?.value.trim() || "";

        const watchUrl = row.querySelector(
            ".movie-part-watch"
        )?.value.trim() || "";

        const downloadUrl = row.querySelector(
            ".movie-part-download"
        )?.value.trim() || "";

        // Ignore completely empty rows.
        if (!title && !watchUrl && !downloadUrl) continue;

        if (!title || !watchUrl || !downloadUrl) {
            throw new Error(
                `Part ${index + 1}: enter its title, watch URL and download URL.`
            );
        }

        for (const url of [watchUrl, downloadUrl]) {
            let parsed;

            try {
                parsed = new URL(url);
            } catch {
                throw new Error(
                    `Part ${index + 1} has an invalid URL.`
                );
            }

            if (!["http:", "https:"].includes(parsed.protocol)) {
                throw new Error(
                    `Part ${index + 1} URLs must use HTTP or HTTPS.`
                );
            }
        }

        parts.push({
            part_number: parts.length + 1,
            title,
            watch_url: watchUrl,
            download_url: downloadUrl
        });
    }

    return parts;
}


function initializeMoviePartEvents() {
    if (!movieModal) return;

    const container = movieModal.querySelector(
        "#moviePartsContainer"
    );

    const addButton = movieModal.querySelector(
        "#addMoviePart"
    );

    const emptyMessage = movieModal.querySelector(
        "#moviePartsEmpty"
    );

    if (!container || !addButton || !emptyMessage) {
        console.error("CINEVA: Movie parts elements are missing.");
        return;
    }

    addButton.addEventListener("click", () => {
        if (container.children.length >= 5) {
            alert("You can add a maximum of 5 movie parts.");
            return;
        }

        const row = createMoviePartRow();

        container.appendChild(row);
        emptyMessage.hidden = true;

        row.querySelector(".movie-part-title")?.focus();
    });

    container.addEventListener("click", event => {
        const removeButton = event.target.closest(
            "[data-remove-movie-part]"
        );

        if (!removeButton) return;

        removeButton.closest(".cineva-part-row")?.remove();

        emptyMessage.hidden = container.children.length > 0;
    });
}
/* =========================================
   CINEVA PRO — MOVIE ADD / EDIT MODAL
   Includes:
   - Main watch and download URLs
   - Additional download links
   - Up to 5 independent movie parts
========================================= */

let movieModal = null;

/* =========================================
   MOVIE PART HELPERS
========================================= */

function normalizeMovieParts(parts) {
    if (typeof parts === "string") {
        try {
            parts = JSON.parse(parts);
        } catch {
            parts = [];
        }
    }

    if (!Array.isArray(parts)) return [];

    return parts
        .filter(part => part && typeof part === "object")
        .slice(0, 5)
        .map((part, index) => ({
            part_number: Number(part.part_number) || index + 1,
            title: String(part.title || ""),
            watch_url: String(part.watch_url || ""),
            download_url: String(part.download_url || "")
        }));
}

function createMoviePartRow(part = {}, index = 0) {
    const row = document.createElement("div");
    row.className = "cineva-part-row";

    const heading = document.createElement("div");
    heading.className = "cineva-part-row-heading";

    const title = document.createElement("strong");
    title.className = "cineva-part-number";
    title.textContent = `Part ${index + 1}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "cineva-remove-part";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove part ${index + 1}`);

    heading.append(title, removeButton);

    const fields = [
        {
            name: "title",
            label: "Part Title *",
            placeholder: "Example: Part A",
            value: part.title || "",
            type: "text",
            required: true
        },
        {
            name: "watch_url",
            label: "Part Watch URL *",
            placeholder: "https://your-watch-link.com",
            value: part.watch_url || "",
            type: "url",
            required: true
        },
        {
            name: "download_url",
            label: "Part Download URL *",
            placeholder: "https://your-download-link.com",
            value: part.download_url || "",
            type: "url",
            required: true
        }
    ];

    row.appendChild(heading);

    fields.forEach(field => {
        const wrapper = document.createElement("div");
        wrapper.className = "cineva-part-field";

        const label = document.createElement("label");
        label.textContent = field.label;

        const input = document.createElement("input");
        input.type = field.type;
        input.name = `part_${field.name}`;
        input.value = field.value;
        input.placeholder = field.placeholder;
        input.required = field.required;
        input.autocomplete = "off";

        if (field.type === "url") {
            input.inputMode = "url";
        }

        wrapper.append(label, input);
        row.appendChild(wrapper);
    });

    return row;
}

function updateMoviePartRows() {
    const container = movieModal?.querySelector(
        "#moviePartsContainer"
    );

    if (!container) return;

    const rows = [...container.querySelectorAll(".cineva-part-row")];

    rows.forEach((row, index) => {
        const heading = row.querySelector(".cineva-part-number");
        const removeButton = row.querySelector(".cineva-remove-part");

        if (heading) {
            heading.textContent = `Part ${index + 1}`;
        }

        if (removeButton) {
            removeButton.setAttribute(
                "aria-label",
                `Remove part ${index + 1}`
            );
        }
    });

    const emptyMessage = movieModal.querySelector("#moviePartsEmpty");
    const addButton = movieModal.querySelector("#addMoviePart");
    const count = rows.length;

    if (emptyMessage) {
        emptyMessage.hidden = count > 0;
    }

    if (addButton) {
        addButton.disabled = count >= 5;
        addButton.textContent = count >= 5
            ? "Maximum 5 Parts"
            : "+ Add Part";
    }
}

function renderMovieParts(parts = []) {
    const container = movieModal.querySelector("#moviePartsContainer");

    if (!container) return;

    container.innerHTML = "";

    normalizeMovieParts(parts).forEach((part, index) => {
        container.appendChild(createMoviePartRow(part, index));
    });

    updateMoviePartRows();
}

function collectMovieParts() {
    const container = movieModal.querySelector("#moviePartsContainer");

    if (!container) return [];

    const rows = [
        ...container.querySelectorAll(".cineva-part-row")
    ];

    if (rows.length > 5) {
        throw new Error("A movie can have a maximum of 5 parts.");
    }

    const parts = [];

    rows.forEach((row, index) => {
        const title = row.querySelector('[name="part_title"]')
            ?.value.trim() || "";

        const watchUrl = row.querySelector('[name="part_watch_url"]')
            ?.value.trim() || "";

        const downloadUrl = row.querySelector('[name="part_download_url"]')
            ?.value.trim() || "";

        // Ignore a completely empty row.
        if (!title && !watchUrl && !downloadUrl) return;

        // Do not save incomplete parts.
        if (!title || !watchUrl || !downloadUrl) {
            throw new Error(
                `Please complete the title, Watch URL and Download URL for Part ${index + 1}.`
            );
        }

        const validateUrl = (value, label) => {
            try {
                const parsed = new URL(value);

                if (!["http:", "https:"].includes(parsed.protocol)) {
                    throw new Error();
                }
            } catch {
                throw new Error(
                    `Please enter a valid ${label} for Part ${index + 1}.`
                );
            }
        };

        validateUrl(watchUrl, "Watch URL");
        validateUrl(downloadUrl, "Download URL");

        parts.push({
            part_number: parts.length + 1,
            title,
            watch_url: watchUrl,
            download_url: downloadUrl
        });
    });

    return parts;
}

function initializeMoviePartEvents() {
    const addButton = movieModal.querySelector("#addMoviePart");
    const container = movieModal.querySelector("#moviePartsContainer");

    if (!addButton || !container) return;

    addButton.addEventListener("click", () => {
        const count = container.querySelectorAll(
            ".cineva-part-row"
        ).length;

        if (count >= 5) {
            alert("You can add a maximum of 5 movie parts.");
            return;
        }

        container.appendChild(
            createMoviePartRow({}, count)
        );

        updateMoviePartRows();

        const newRow = container.lastElementChild;
        newRow?.querySelector('[name="part_title"]')?.focus();
    });

    container.addEventListener("click", event => {
        const removeButton = event.target.closest(
            ".cineva-remove-part"
        );

        if (!removeButton) return;

        const row = removeButton.closest(".cineva-part-row");

        if (row) {
            row.remove();
            updateMoviePartRows();
        }
    });
}

/* =========================================
   CREATE MOVIE MODAL
========================================= */

function createMovieModal() {
    if (movieModal) return movieModal;

    const style = document.createElement("style");

    style.textContent = `
        .cineva-modal {
            position: fixed;
            inset: 0;
            z-index: 99999;
            background: rgba(0,0,0,.78);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            overflow-y: auto;
        }

        .cineva-modal[hidden] {
            display: none;
        }

        .cineva-modal-card {
            width: 100%;
            max-width: 850px;
            max-height: 92vh;
            overflow-y: auto;
            background: #121221;
            border: 1px solid rgba(255,255,255,.09);
            border-radius: 16px;
            padding: 26px;
            color: #fff;
        }

        .cineva-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 15px;
            margin-bottom: 24px;
        }

        .cineva-modal-header h2 {
            margin: 0;
            font-size: 22px;
        }

        .cineva-modal-close {
            background: #242438;
            border: 0;
            color: white;
            border-radius: 8px;
            padding: 9px 13px;
            cursor: pointer;
        }

        .cineva-form-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 17px;
        }

        .cineva-field {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .cineva-field.full {
            grid-column: 1 / -1;
        }

        .cineva-field label {
            color: #c6c6d7;
            font-size: 13px;
            font-weight: 600;
        }

        .cineva-field input,
        .cineva-field textarea,
        .cineva-field select {
            width: 100%;
            box-sizing: border-box;
            padding: 12px 13px;
            background: #0b0b17;
            color: #fff;
            border: 1px solid #303047;
            border-radius: 8px;
            outline: none;
            font: inherit;
        }

        .cineva-field input:focus,
        .cineva-field textarea:focus,
        .cineva-field select:focus {
            border-color: #8b35f5;
        }

        .cineva-field textarea {
            min-height: 100px;
            resize: vertical;
        }

        .cineva-form-checks {
            display: flex;
            flex-wrap: wrap;
            gap: 25px;
            margin-top: 22px;
        }

        .cineva-form-checks label {
            display: flex;
            align-items: center;
            gap: 9px;
            color: #ddd;
            font-size: 14px;
        }

        /* ADDITIONAL DOWNLOAD LINKS */

        .cineva-download-section {
            grid-column: 1 / -1;
            background: #0b0b17;
            border: 1px solid #303047;
            border-radius: 12px;
            padding: 17px;
            margin-top: 5px;
        }

        .cineva-download-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
        }

        .cineva-download-heading h3 {
            margin: 0 0 5px;
            color: #fff;
            font-size: 15px;
        }

        .cineva-download-heading p {
            margin: 0;
            color: #9999ad;
            font-size: 12px;
        }

        .cineva-add-link {
            flex-shrink: 0;
            border: 0;
            background: #8b35f5;
            color: #fff;
            border-radius: 7px;
            padding: 10px 13px;
            cursor: pointer;
            font-weight: 700;
        }

        .cineva-add-link:hover {
            background: #a855f7;
        }

        .cineva-download-row {
            display: grid;
            grid-template-columns: minmax(0, .8fr) minmax(0, 1.5fr) auto;
            gap: 12px;
            align-items: end;
            margin-top: 13px;
            padding-top: 13px;
            border-top: 1px solid #25253a;
        }

        .cineva-remove-link {
            border: 0;
            background: #ef315e;
            color: #fff;
            border-radius: 8px;
            padding: 12px 14px;
            cursor: pointer;
            font-weight: 600;
        }

        .cineva-remove-link:hover {
            background: #d91f4d;
        }

        .cineva-download-empty {
            color: #9999ad;
            font-size: 13px;
            margin: 12px 0 0;
        }

        /* MOVIE PARTS */

        .cineva-parts-section {
            grid-column: 1 / -1;
            background: #0b0b17;
            border: 1px solid rgba(139,53,245,.35);
            border-radius: 12px;
            padding: 17px;
            margin-top: 5px;
        }

        .cineva-parts-heading {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }

        .cineva-parts-heading h3 {
            margin: 0 0 5px;
            font-size: 15px;
            color: #fff;
        }

        .cineva-parts-heading p {
            margin: 0;
            color: #9999ad;
            font-size: 12px;
            line-height: 1.5;
        }

        .cineva-parts-note {
            color: #b8a1dc;
            font-size: 12px;
            line-height: 1.5;
            margin: 12px 0;
        }

        .cineva-add-part {
            flex-shrink: 0;
            border: 0;
            background: #8b35f5;
            color: #fff;
            border-radius: 7px;
            padding: 10px 13px;
            cursor: pointer;
            font-weight: 700;
        }

        .cineva-add-part:hover {
            background: #a855f7;
        }

        .cineva-add-part:disabled {
            opacity: .55;
            cursor: not-allowed;
        }

        .cineva-part-row {
            background: #121221;
            border: 1px solid #303047;
            border-radius: 10px;
            padding: 14px;
            margin-top: 13px;
        }

        .cineva-part-row-heading {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-bottom: 14px;
        }

        .cineva-part-number {
            color: #c9a7ff;
            font-size: 14px;
        }

        .cineva-remove-part {
            border: 0;
            background: rgba(239,49,94,.15);
            color: #ff718f;
            border-radius: 7px;
            padding: 7px 11px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
        }

        .cineva-remove-part:hover {
            background: #ef315e;
            color: #fff;
        }

        .cineva-part-field {
            display: flex;
            flex-direction: column;
            gap: 7px;
            margin-top: 11px;
        }

        .cineva-part-field label {
            color: #c6c6d7;
            font-size: 12px;
            font-weight: 600;
        }

        .cineva-part-field input {
            width: 100%;
            box-sizing: border-box;
            padding: 11px 12px;
            background: #0b0b17;
            color: #fff;
            border: 1px solid #303047;
            border-radius: 8px;
            outline: none;
            font: inherit;
        }

        .cineva-part-field input:focus {
            border-color: #8b35f5;
        }

        .cineva-parts-empty {
            color: #9999ad;
            font-size: 13px;
            margin: 12px 0 0;
        }

        .cineva-form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 26px;
        }

        .cineva-form-actions button {
            border: 0;
            border-radius: 8px;
            padding: 12px 20px;
            cursor: pointer;
            font-weight: 700;
        }

        .cineva-cancel {
            background: #29293c;
            color: white;
        }

        .cineva-save {
            background: linear-gradient(135deg,#8b35f5,#ef315e);
            color: white;
        }

        .cineva-save:disabled {
            opacity: .6;
            cursor: not-allowed;
        }

        @media(max-width:600px) {
            .cineva-form-grid {
                grid-template-columns: 1fr;
            }

            .cineva-modal-card {
                padding: 18px;
            }

            .cineva-download-heading,
            .cineva-parts-heading {
                align-items: flex-start;
                flex-direction: column;
            }

            .cineva-download-row {
                grid-template-columns: 1fr;
            }

            .cineva-download-row button {
                width: 100%;
            }

            .cineva-form-actions {
                flex-direction: column-reverse;
            }

            .cineva-form-actions button {
                width: 100%;
            }
        }
    `;

    document.head.appendChild(style);

    movieModal = document.createElement("div");
    movieModal.className = "cineva-modal";
    movieModal.hidden = true;

    movieModal.innerHTML = `
        <div class="cineva-modal-card">

            <div class="cineva-modal-header">
                <h2 id="movieFormTitle">Add New Movie</h2>

                <button
                    type="button"
                    class="cineva-modal-close"
                    id="closeMovieForm">
                    ✕
                </button>
            </div>

            <form id="movieForm">

                <input type="hidden" name="movieId">

                <div class="cineva-form-grid">

                    <div class="cineva-field full">
                        <label>Movie Title *</label>
                        <input
                            name="title"
                            required
                            maxlength="250"
                            placeholder="Enter movie title">
                    </div>

                    <div class="cineva-field">
                        <label>Category</label>
                        <input
                            name="category"
                            placeholder="Action, Drama, Comedy...">
                    </div>

                    <div class="cineva-field">
                        <label>Release Year</label>
                        <input
                            name="year"
                            type="number"
                            min="1800"
                            max="2200">
                    </div>

                    <div class="cineva-field">
                        <label>Translator</label>
                        <input name="translator">
                    </div>

                    <div class="cineva-field">
                        <label>Language</label>
                        <input name="language">
                    </div>

                    <div class="cineva-field">
                        <label>Country</label>
                        <input name="country">
                    </div>

                    <div class="cineva-field">
                        <label>Quality</label>
                        <select name="quality">
                            <option value="HD">HD</option>
                            <option value="FHD">FHD</option>
                            <option value="4K">4K</option>
                            <option value="SD">SD</option>
                        </select>
                    </div>

                    <div class="cineva-field">
                        <label>Runtime (minutes)</label>
                        <input name="runtime" type="number" min="0">
                    </div>

                    <div class="cineva-field">
                        <label>Release Date</label>
                        <input name="release_date" type="date">
                    </div>

                    <div class="cineva-field full">
                        <label>Movie Overview</label>
                        <textarea
                            name="overview"
                            placeholder="Write a movie description..."></textarea>
                    </div>

                    <div class="cineva-field full">
                        <label>Poster Image URL</label>
                        <input
                            name="poster_path"
                            type="url"
                            placeholder="https://...">
                    </div>

                    <div class="cineva-field full">
                        <label>Backdrop Image URL</label>
                        <input
                            name="backdrop_path"
                            type="url"
                            placeholder="https://...">
                    </div>

                    <div class="cineva-field full">
                        <label>Main Movie Watch URL</label>
                        <input
                            name="video_url"
                            type="url"
                            placeholder="Your main movie streaming link">
                    </div>

                    <div class="cineva-field full">
                        <label>Main Movie Download URL</label>
                        <input
                            name="download_url"
                            type="url"
                            placeholder="Your main movie download link">
                    </div>

                    <!-- ADDITIONAL DOWNLOAD LINKS -->

                    <div class="cineva-download-section">

                        <div class="cineva-download-heading">
                            <div>
                                <h3>Additional Download Links</h3>
                                <p>
                                    Add extra download buttons for this movie.
                                    These are separate from movie parts.
                                </p>
                            </div>

                            <button
                                type="button"
                                class="cineva-add-link"
                                id="addDownloadLink">
                                + Add Download
                            </button>
                        </div>

                        <p
                            class="cineva-download-empty"
                            id="downloadLinksEmpty">
                            No additional download links added yet.
                        </p>

                        <div id="downloadLinksContainer"></div>

                    </div>

                    <!-- MOVIE PARTS -->

                    <div class="cineva-parts-section">

                        <div class="cineva-parts-heading">
                            <div>
                                <h3>Movie Parts</h3>
                                <p>
                                    Split movies into a maximum of 5 parts.
                                    Every part has its own Watch and Download URL.
                                </p>
                            </div>

                            <button
                                type="button"
                                class="cineva-add-part"
                                id="addMoviePart">
                                + Add Part
                            </button>
                        </div>

                        <p class="cineva-parts-note">
                            Important: A part's Watch URL is used for playback.
                            Its Download URL is used only for downloading.
                            Never put a download link in the Watch URL field.
                        </p>

                        <p
                            class="cineva-parts-empty"
                            id="moviePartsEmpty">
                            No movie parts added. You can save this as a normal movie.
                        </p>

                        <div id="moviePartsContainer"></div>

                    </div>

                </div>

                <div class="cineva-form-checks">

                    <label>
                        <input
                            type="checkbox"
                            name="is_active"
                            checked>
                        Active Movie
                    </label>

                    <label>
                        <input
                            type="checkbox"
                            name="is_featured">
                        Featured Movie
                    </label>

                </div>

                <div class="cineva-form-actions">

                    <button
                        type="button"
                        class="cineva-cancel"
                        id="cancelMovieForm">
                        Cancel
                    </button>

                    <button
                        type="submit"
                        class="cineva-save"
                        id="saveMovieButton">
                        Save Movie
                    </button>

                </div>

            </form>
        </div>
    `;

    document.body.appendChild(movieModal);

    // Initialize existing additional-download controls.
    initializeDownloadLinkEvents();

    // Initialize the new movie-parts controls.
    initializeMoviePartEvents();

    movieModal.querySelector("#closeMovieForm")
        .addEventListener("click", closeMovieForm);

    movieModal.querySelector("#cancelMovieForm")
        .addEventListener("click", closeMovieForm);

    movieModal.addEventListener("click", event => {
        if (event.target === movieModal) {
            closeMovieForm();
        }
    });

    movieModal.querySelector("#movieForm")
        .addEventListener("submit", saveMovie);

    return movieModal;
}

/* =========================================
   OPEN MOVIE FORM
========================================= */

function openMovieForm(movie = null) {
    createMovieModal();

    const form = movieModal.querySelector("#movieForm");

    form.reset();

    form.elements.namedItem("movieId").value =
        movie?.id ?? "";

    movieModal.querySelector("#movieFormTitle").textContent =
        movie ? "Edit Movie" : "Add New Movie";

    const fields = [
        "title",
        "category",
        "year",
        "translator",
        "language",
        "country",
        "quality",
        "runtime",
        "release_date",
        "overview",
        "poster_path",
        "backdrop_path",
        "video_url",
        "download_url"
    ];

    fields.forEach(name => {
        form.elements.namedItem(name).value =
            movie?.[name] ?? "";
    });

    form.elements.namedItem("is_active").checked =
        movie ? movie.is_active !== false : true;

    form.elements.namedItem("is_featured").checked =
        movie?.is_featured === true;

    // Restore existing additional download links.
    renderDownloadLinks(movie?.download_links || []);

    // Restore saved movie parts.
    renderMovieParts(movie?.parts || []);

    movieModal.querySelector("#saveMovieButton").textContent =
        movie ? "Update Movie" : "Save Movie";

    movieModal.hidden = false;

    form.elements.namedItem("title").focus();
}

/* =========================================
   SAVE MOVIE
========================================= */

async function saveMovie(event) {
    event.preventDefault();

    const form = event.currentTarget;

    const saveButton = movieModal.querySelector(
        "#saveMovieButton"
    );

    if (!form.reportValidity()) return;

    const movieId = form.elements.namedItem("movieId").value;

    const numberValue = name => {
        const value = form.elements.namedItem(name).value.trim();
        return value === "" ? null : Number(value);
    };

    const textValue = name => {
        const value = form.elements.namedItem(name).value.trim();
        return value || null;
    };

    let downloadLinks = [];
    let movieParts = [];

    try {
        downloadLinks = collectDownloadLinks();
        movieParts = collectMovieParts();

    } catch (error) {
        alert(error.message);
        return;
    }

    const payload = {
        title: textValue("title"),
        category: textValue("category"),
        year: numberValue("year"),
        translator: textValue("translator"),
        language: textValue("language"),
        country: textValue("country"),
        quality: textValue("quality") || "HD",
        runtime: numberValue("runtime"),
        release_date: textValue("release_date"),
        overview: textValue("overview"),
        poster_path: textValue("poster_path"),
        backdrop_path: textValue("backdrop_path"),

        // Additional download buttons.
        download_links: downloadLinks,

        // Main movie links remain independent.
        video_url: textValue("video_url"),
        download_url: textValue("download_url"),

        // Each part has its own title, watch URL and download URL.
        parts: movieParts,

        is_active: form.elements.namedItem("is_active").checked,
        is_featured: form.elements.namedItem("is_featured").checked,

        updated_at: new Date().toISOString()
    };

    if (!payload.title) {
        alert("Movie title is required.");
        return;
    }

    if (
        (payload.year !== null &&
            (!Number.isInteger(payload.year) ||
             payload.year < 1800 ||
             payload.year > 2200)) ||
        (payload.runtime !== null &&
            (!Number.isInteger(payload.runtime) ||
             payload.runtime < 0))
    ) {
        alert("Please enter a valid year and runtime.");
        return;
    }

    saveButton.disabled = true;

    saveButton.textContent = movieId
        ? "Updating..."
        : "Saving...";

    try {
        let response;

        if (movieId) {
            response = await supabase
                .from("movies")
                .update(payload)
                .eq("id", movieId);
        } else {
            response = await supabase
                .from("movies")
                .insert(payload);
        }

        if (response.error) {
            throw response.error;
        }

        closeMovieForm();

        alert(
            movieId
                ? "Movie updated successfully."
                : "Movie added successfully."
        );

        await refreshContent();

    } catch (error) {
        console.error("Movie save error:", error);

        alert(
            "Unable to save movie.\n\n" +
            (error.message || "Please try again.")
        );

    } finally {
        saveButton.disabled = false;

        saveButton.textContent = movieId
            ? "Update Movie"
            : "Save Movie";
    }
}
/* =========================================
   START DASHBOARD
========================================= */

initializeDashboard();
