
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

/* =========================================
   CINEVA — MULTIPLE MOVIE DOWNLOAD LINKS
   Stored in movies.download_links (JSONB)
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

    return links
        .map(link => {
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
                    link?.url || link?.link || link?.download_url || ""
                ).trim()
            };
        })
        .filter(link => link.url);
}


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


function renderDownloadLinks(links = []) {
    const container = $("downloadLinksContainer");
    const emptyMessage = $("downloadLinksEmpty");

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


function collectDownloadLinks() {
    const container = $("downloadLinksContainer");

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

        // Ignore completely empty rows.
        if (!label && !url) continue;

        // Both fields are required for a usable button.
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
/* =========================================
   CINEVA PRO — MOVIE ADD / EDIT FORM
========================================= */

let movieModal = null;

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
                <button type="button"
                    class="cineva-modal-close"
                    id="closeMovieForm">✕</button>
            </div>

            <form id="movieForm">

                <input type="hidden" name="movieId">

                <div class="cineva-form-grid">

                    <div class="cineva-field full">
                        <label>Movie Title *</label>
                        <input name="title" required maxlength="250"
                            placeholder="Enter movie title">
                    </div>

                    <div class="cineva-field">
                        <label>Category</label>
                        <input name="category"
                            placeholder="Action, Drama, Comedy...">
                    </div>

                    <div class="cineva-field">
                        <label>Release Year</label>
                        <input name="year" type="number"
                            min="1800" max="2200">
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
                        <textarea name="overview"
                            placeholder="Write a movie description..."></textarea>
                    </div>

                    <div class="cineva-field full">
                        <label>Poster Image URL</label>
                        <input name="poster_path" type="url"
                            placeholder="https://...">
                    </div>

                    <div class="cineva-field full">
                        <label>Backdrop Image URL</label>
                        <input name="backdrop_path" type="url"
                            placeholder="https://...">
                    </div>

                    <div class="cineva-field full">
                        <label>Watch URL</label>
                        <input name="video_url" type="url"
                            placeholder="Your movie streaming link">
                    </div>

                    <div class="cineva-field full">
                        <label>Download URL</label>
                        <input name="download_url" type="url"
                            placeholder="Your movie download link">
                    </div>

                </div>

                <div class="cineva-form-checks">

                    <label>
                        <input type="checkbox" name="is_active" checked>
                        Active Movie
                    </label>

                    <label>
                        <input type="checkbox" name="is_featured">
                        Featured Movie
                    </label>

                </div>

                <div class="cineva-form-actions">
                    <button type="button"
                        class="cineva-cancel"
                        id="cancelMovieForm">
                        Cancel
                    </button>

                    <button type="submit"
                        class="cineva-save"
                        id="saveMovieButton">
                        Save Movie
                    </button>
                </div>

            </form>
        </div>
    `;

    document.body.appendChild(movieModal);
   const downloadContainer = $("downloadLinksContainer");

movieModal.querySelector("#addDownloadLink")
    .addEventListener("click", () => {
        const row = createDownloadLinkRow();

        downloadContainer.appendChild(row);

        const emptyMessage = $("downloadLinksEmpty");

        if (emptyMessage) {
            emptyMessage.hidden = true;
        }

        row.querySelector(".download-link-label").focus();
    });

downloadContainer.addEventListener("click", event => {
    const removeButton = event.target.closest(
        "[data-remove-download-link]"
    );

    if (!removeButton) return;

    removeButton.closest(".cineva-download-row")?.remove();

    const emptyMessage = $("downloadLinksEmpty");

    if (emptyMessage) {
        emptyMessage.hidden = downloadContainer.children.length > 0;
    }
});

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


function openMovieForm(movie = null) {
    createMovieModal();

    const form = movieModal.querySelector("#movieForm");

    form.reset();

    form.elements.namedItem("movieId").value =
        movie?.id ?? "";

    setText(
        "movieFormTitle",
        movie ? "Edit Movie" : "Add New Movie"
    );

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

    setText(
        "saveMovieButton",
        movie ? "Update Movie" : "Save Movie"
    );

    movieModal.hidden = false;

    form.elements.namedItem("title").focus();
}
renderDownloadLinks(
    normalizeDownloadLinks(movie?.download_links)
);

function closeMovieForm() {
    if (movieModal) {
        movieModal.hidden = true;
    }
}


async function saveMovie(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const saveButton = $("saveMovieButton");

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

try {
    downloadLinks = collectDownloadLinks();
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
       download_links: downloadLinks,

        // These two links are intentionally independent.
        video_url: textValue("video_url"),
        download_url: textValue("download_url"),

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
    saveButton.textContent = movieId ? "Updating..." : "Saving...";

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

            case "edit-movie": {
    const movie = moviesCache.find(
        item => String(item.id) === String(id)
    );

    if (movie) openMovieForm(movie);
    break;
}

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
    openMovieForm();
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
