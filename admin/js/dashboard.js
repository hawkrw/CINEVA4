
import { supabase } from "../../js/config.js";
import { verifyAdmin } from "./admin-guard.js";
import { initializePlatformAdmin } from "./platform-admin.js?v=20261109-3";

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
let platformAdmin = null;

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

function attachCategorySuggestions(input, listId) {
    if (!input) return;
    input.setAttribute("list", listId);
    let list = document.getElementById(listId);
    if (!list) {
        list = document.createElement("datalist");
        list.id = listId;
        document.body.appendChild(list);
    }
    list.replaceChildren();
    (platformAdmin?.getCategoryNames() || []).forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        list.appendChild(option);
    });
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

function clearBootWatchdog() {
    if (window.__cinevaBootWatchdog) {
        window.clearTimeout(window.__cinevaBootWatchdog);
        window.__cinevaBootWatchdog = null;
    }
}

function showError(message) {
    clearBootWatchdog();
    if (errorMessage) errorMessage.textContent = message;

    if (bootScreen) bootScreen.hidden = true;
    if (errorScreen) errorScreen.hidden = false;
    if (adminApp) adminApp.hidden = true;
}

function showDashboard() {
    clearBootWatchdog();
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
    const uniqueCategories = new Set([
        ...moviesCache.map(movie => movie.category?.trim()),
        ...seriesCache.map(series => series.category?.trim())
    ].filter(Boolean));

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
    views,
    likes,
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
        ...new Set([
            ...moviesCache.map(movie => movie.category?.trim()),
            ...(platformAdmin?.getCategoryNames() || [])
        ].filter(Boolean))
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
           .select(`
    id,
    title,
    category,
    year,
    total_seasons,
    description,
    overview,
    poster,
    backdrop,
    is_active,
    views,
    likes,
    created_at,
    updated_at
`)
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
           .select(`
    id,
    series_id,
    season,
    episode,
    season_number,
    episode_number,
    title,
    description,
    overview,
    duration,
    runtime,
    thumbnail,
    video_url,
    download_url,
    download_link,
    download_links,
    is_final,
    is_active,
    parts,
    created_at,
    updated_at
`)
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
            createCell(`Ep${episode}`),
            createCell(season),
            createCell(item.title || `Ep${episode}`),
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
   CINEVA PRO — CONTENT FORM MODAL STATE
========================================= */

let contentFormModal = null;

/* =========================================
   CINEVA PRO — CONTENT FORM MODAL
   SERIES & EPISODE MANAGEMENT
========================================= */

function createContentFormModal() {
    if (contentFormModal) {
        return contentFormModal;
    }

    /* =====================================
       MODAL STYLES
    ===================================== */

    const style = document.createElement("style");

    style.textContent = `
        .cineva-content-modal {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(0, 0, 0, 0.82);
            backdrop-filter: blur(9px);
            -webkit-backdrop-filter: blur(9px);
        }

        .cineva-content-modal[hidden] {
            display: none !important;
        }

        .cineva-content-card {
            width: 100%;
            max-width: 720px;
            max-height: 90vh;
            overflow-y: auto;
            background: #121221;
            border: 1px solid rgba(168, 85, 247, 0.25);
            border-radius: 16px;
            padding: 25px;
            color: #fff;
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.55);
            animation: cinevaContentModalIn 0.2s ease;
        }

        @keyframes cinevaContentModalIn {
            from {
                opacity: 0;
                transform: translateY(12px) scale(0.98);
            }

            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        .cineva-content-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .cineva-content-header h2 {
            margin: 0;
            font-size: 21px;
            font-weight: 700;
            color: #fff;
        }

        .cineva-content-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
        }

        .cineva-content-grid > * {
            min-width: 0;
        }

        .cineva-content-check {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 20px;
            color: #ddd;
            font-size: 14px;
        }

        .cineva-content-check input {
            accent-color: #8b35f5;
            width: 17px;
            height: 17px;
        }

        .cineva-content-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 25px;
            padding-top: 18px;
            border-top: 1px solid rgba(255,255,255,0.08);
        }

        .cineva-content-cancel,
        .cineva-content-save {
            min-width: 110px;
            padding: 12px 20px;
            border: none;
            border-radius: 9px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            transition: 0.2s ease;
        }

        .cineva-content-cancel {
            color: #ddd;
            background: #29293b;
        }

        .cineva-content-cancel:hover {
            background: #38384c;
        }

        .cineva-content-save {
            color: #fff;
            background: linear-gradient(
                135deg,
                #8b35f5,
                #a855f7
            );
        }

        .cineva-content-save:hover {
            filter: brightness(1.12);
            transform: translateY(-1px);
        }

        .cineva-content-save:disabled,
        .cineva-content-cancel:disabled {
            opacity: 0.55;
            cursor: not-allowed;
            transform: none;
        }

        @media (max-width: 600px) {
            .cineva-content-modal {
                padding: 10px;
            }

            .cineva-content-card {
                padding: 18px;
                max-height: 94vh;
            }

            .cineva-content-grid {
                grid-template-columns: 1fr;
            }

            .cineva-content-actions {
                flex-direction: column-reverse;
            }

            .cineva-content-cancel,
            .cineva-content-save {
                width: 100%;
            }
        }
    `;

    document.head.appendChild(style);

    /* =====================================
       CREATE MODAL
    ===================================== */

    contentFormModal = document.createElement("div");

    contentFormModal.className = "cineva-content-modal";
    contentFormModal.hidden = true;

    contentFormModal.innerHTML = `
        <div class="cineva-content-card">

            <div class="cineva-content-header">
                <h2 id="contentFormTitle">
                    Add Content
                </h2>
            </div>

            <form id="contentForm">

                <input
                    type="hidden"
                    name="contentId"
                >

                <input
                    type="hidden"
                    name="contentType"
                >

                <div
                    id="contentFormFields"
                    class="cineva-content-grid">
                </div>

                <label class="cineva-content-check">
                    <input
                        type="checkbox"
                        name="is_active"
                        checked
                    >
                    Active
                </label>

                <div class="cineva-content-actions">

                    <button
                        type="button"
                        class="cineva-content-cancel"
                        id="cancelContentForm">
                        Cancel
                    </button>

                    <button
                        type="submit"
                        class="cineva-content-save"
                        id="saveContentButton">
                        Save
                    </button>

                </div>

            </form>
        </div>
    `;

    document.body.appendChild(contentFormModal);

    /* =====================================
       CANCEL BUTTON
       ONLY MANUAL CLOSE CONTROL
    ===================================== */

    contentFormModal
        .querySelector("#cancelContentForm")
        .addEventListener("click", requestCloseContentForm);

    /* =====================================
       DISABLE BACKDROP CLOSING

       Clicking outside the card does
       absolutely nothing.
    ===================================== */

    contentFormModal.addEventListener("click", event => {
        if (event.target === contentFormModal) {
            event.stopPropagation();
        }
    });

    /* =====================================
       FORM SUBMISSION
    ===================================== */

    contentFormModal
        .querySelector("#contentForm")
        .addEventListener("submit", saveContentForm);

    return contentFormModal;
}


/* =========================================
   CLOSE CONTENT FORM
   INTERNAL SUCCESS / CANCEL CLOSE
========================================= */

function closeContentForm() {
    if (!contentFormModal) return;

    const form = contentFormModal.querySelector("#contentForm");

    if (form?.dataset.saving === "true") {
        console.warn(
            "Content form is currently saving. Use requestCloseContentForm()."
        );
        return;
    }

    form?.reset();

    if (form) {
        delete form.dataset.saving;
    }

    contentFormModal.hidden = true;
}


/* =========================================
   REQUEST CONTENT FORM CLOSE
   CONFIRM IF SAVE IS IN PROGRESS
========================================= */

function requestCloseContentForm() {
    if (!contentFormModal) return;

    const form = contentFormModal.querySelector("#contentForm");

    const saving = form?.dataset.saving === "true";

    if (saving) {
        const confirmed = confirm(
            "A save is currently in progress.\n\n" +
            "Close this form anyway? The current database request " +
            "may still finish."
        );

        if (!confirmed) return;
    }

    // Close the modal after confirmation.
    if (form) {
        delete form.dataset.saving;
    }

    form?.reset();

    contentFormModal.hidden = true;
}


/* =========================================
   PREVENT ESCAPE KEY FROM CLOSING MODAL
========================================= */

document.addEventListener("keydown", event => {
    if (
        event.key !== "Escape" ||
        !contentFormModal ||
        contentFormModal.hidden
    ) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
});



/* =========================================
   CINEVA — DIRECT IMAGE UPLOADS
   Phone gallery, camera roll and desktop files
========================================= */
function attachImageUploader(urlInput, bucket, label) {
    if (!urlInput) return;

    const field = urlInput.closest(".cineva-field, .cineva-content-field");
    if (!field) return;

    field.querySelector(".cineva-image-uploader")?.remove();

    if (!document.getElementById("cinevaImageUploaderStyles")) {
        const style = document.createElement("style");
        style.id = "cinevaImageUploaderStyles";
        style.textContent = `
            .cineva-image-uploader{display:grid;gap:9px;margin-top:11px}
            .cineva-image-drop{display:flex;align-items:center;gap:12px;min-height:76px;padding:13px;border:1px dashed #625080;border-radius:12px;background:rgba(139,53,245,.07);color:#d9c8f5;cursor:pointer;transition:.2s}
            .cineva-image-drop.is-dragover{border-color:#bd8cff;background:rgba(139,53,245,.16)}
            .cineva-image-pick-icon{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border-radius:11px;background:rgba(139,53,245,.18);font-size:20px}
            .cineva-image-drop strong{display:block;color:#fff;font-size:11px}
            .cineva-image-drop small{display:block;margin-top:5px;color:#9690aa;font-size:9px;line-height:1.5}
            .cineva-image-preview{display:flex;align-items:center;gap:12px;min-width:0;padding:9px;border:1px solid #302b43;border-radius:10px;background:#0d0d19}
            .cineva-image-preview[hidden]{display:none}
            .cineva-image-preview img{width:58px;height:72px;flex:0 0 58px;object-fit:cover;border-radius:6px;background:#171525}
            .cineva-image-preview.backdrop img{width:110px;height:62px;flex-basis:110px}
            .cineva-image-preview span{min-width:0;overflow-wrap:anywhere;color:#bcb5ce;font-size:9px;line-height:1.5}
            .cineva-image-status{min-height:14px;color:#a99bbf;font-size:9px;line-height:1.5}
            .cineva-image-status[data-state="success"]{color:#72dfb1}
            .cineva-image-status[data-state="error"]{color:#ff8c9e}
            .cineva-image-drop:focus-within{outline:2px solid #9956ec;outline-offset:2px}
            @media(max-width:600px){.cineva-image-drop{min-height:72px;padding:11px}.cineva-image-preview img{width:52px;height:66px;flex-basis:52px}}
        `;
        document.head.appendChild(style);
    }

    const picker = document.createElement("div");
    picker.className = "cineva-image-uploader";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp,image/avif";
    fileInput.setAttribute("aria-label", `Choose ${label.toLowerCase()} image from device`);
    fileInput.style.position = "absolute";
    fileInput.style.width = "1px";
    fileInput.style.height = "1px";
    fileInput.style.padding = "0";
    fileInput.style.margin = "-1px";
    fileInput.style.overflow = "hidden";
    fileInput.style.clip = "rect(0,0,0,0)";
    fileInput.style.whiteSpace = "nowrap";
    fileInput.style.border = "0";

    const drop = document.createElement("div");
    drop.className = "cineva-image-drop";
    drop.tabIndex = 0;
    drop.setAttribute("role", "button");
    drop.setAttribute("aria-label", `Choose ${label.toLowerCase()} image from your device or drop a file here`);
    drop.innerHTML = `
        <span class="cineva-image-pick-icon" aria-hidden="true">▧</span>
        <span><strong>Choose ${label} from this device</strong><small>Tap to browse or drag an image here · JPG, PNG, WebP or AVIF · Up to 15 MB</small></span>
    `;

    const preview = document.createElement("div");
    preview.className = "cineva-image-preview" + (bucket === "banners" ? " backdrop" : "");
    preview.hidden = true;
    const previewImage = document.createElement("img");
    previewImage.alt = `${label} preview`;
    const previewName = document.createElement("span");
    preview.append(previewImage, previewName);

    const status = document.createElement("div");
    status.className = "cineva-image-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    picker.append(drop, fileInput, preview, status);
    field.appendChild(picker);

    const showPreview = (url, name = "Current image") => {
        if (!url) {
            preview.hidden = true;
            previewImage.removeAttribute("src");
            previewName.textContent = "";
            return;
        }
        previewImage.src = url;
        previewName.textContent = name;
        preview.hidden = false;
    };

    showPreview(urlInput.value, urlInput.value ? "Current image · URL saved" : "");

    const setStatus = (message, state = "") => {
        status.textContent = message;
        status.dataset.state = state;
    };

    const uploadFile = async file => {
        if (!file) return;
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
        if (!allowed.includes(file.type)) {
            setStatus("Unsupported image. Choose JPG, PNG, WebP or AVIF.", "error");
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            setStatus("Image is too large. Maximum size is 15 MB.", "error");
            return;
        }

        setStatus("Checking administrator session...");
        drop.style.pointerEvents = "none";
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData?.user) {
                throw new Error("Your admin session has expired. Sign in again.");
            }

            const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
            const safeExtension = ["jpg", "jpeg", "png", "webp", "avif"].includes(extension)
                ? extension : (file.type === "image/png" ? "png" : "jpg");
            const safeName = file.name
                .replace(/\.[^.]+$/, "")
                .normalize("NFKD")
                .replace(/[^a-zA-Z0-9_-]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 60) || "image";
            const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const path = `admin/${authData.user.id}/${Date.now()}-${unique}-${safeName}.${safeExtension}`;

            setStatus("Preparing secure ImageKit upload...");
            const { data: authParams, error: authParamsError } =
                await supabase.functions.invoke("imagekit-upload-auth", {
                    method: "POST"
                });

            if (authParamsError) {
                throw new Error(authParamsError.message || "Could not authorize the image upload.");
            }
            if (!authParams?.token || !authParams?.signature || !authParams?.publicKey) {
                throw new Error(authParams?.error || "ImageKit upload authentication is not configured.");
            }

            const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
            const safeName = file.name
                .replace(/\\.[^.]+$/, "")
                .normalize("NFKD")
                .replace(/[^a-zA-Z0-9_-]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 70) || "image";
            const imageKitFileName = `${safeName}-${Date.now()}.${extension}`;

            const uploadForm = new FormData();
            uploadForm.append("file", file);
            uploadForm.append("fileName", imageKitFileName);
            uploadForm.append("publicKey", authParams.publicKey);
            uploadForm.append("token", authParams.token);
            uploadForm.append("expire", String(authParams.expire));
            uploadForm.append("signature", authParams.signature);
            uploadForm.append("folder", `/cineva/${bucket}`);
            uploadForm.append("useUniqueFileName", "true");

            setStatus("Uploading image to ImageKit...");
            let imageKitResponse;
            let lastUploadError;
            for (let attempt = 1; attempt <= 3; attempt++) {
                const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
                    method: "POST",
                    body: uploadForm
                });

                imageKitResponse = await response.json().catch(() => ({}));
                if (response.ok && imageKitResponse.url) break;

                lastUploadError = new Error(
                    imageKitResponse.message || imageKitResponse.help || `ImageKit upload failed (${response.status}).`
                );
                if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 3) {
                    throw lastUploadError;
                }

                setStatus(`Connection interrupted. Retrying upload (${attempt}/2)...`);
                await new Promise(resolve => setTimeout(resolve, attempt * 900));
            }

            if (!imageKitResponse?.url) {
                throw lastUploadError || new Error("ImageKit did not return an image URL.");
            }

            urlInput.value = imageKitResponse.url;
            urlInput.dispatchEvent(new Event("input", { bubbles: true }));
            urlInput.dispatchEvent(new Event("change", { bubbles: true }));
            showPreview(publicData.publicUrl, `${file.name} · Uploaded`);
            setStatus("Image uploaded. Its URL will be saved when you save this form.", "success");
        } catch (error) {
            console.error("CINEVA image upload failed:", error);
            setStatus(error.message || "Image upload failed. Please try again.", "error");
        } finally {
            drop.style.pointerEvents = "";
            fileInput.value = "";
        }
    };

    drop.addEventListener("click", event => {
        if (event.target !== fileInput) fileInput.click();
    });
    fileInput.addEventListener("change", () => uploadFile(fileInput.files?.[0]));
    drop.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInput.click();
        }
    });
    ["dragenter", "dragover"].forEach(type => drop.addEventListener(type, event => {
        event.preventDefault();
        drop.classList.add("is-dragover");
    }));
    ["dragleave", "dragend", "drop"].forEach(type => drop.addEventListener(type, event => {
        event.preventDefault();
        drop.classList.remove("is-dragover");
    }));
    drop.addEventListener("drop", event => {
        const file = event.dataTransfer?.files?.[0];
        if (file) uploadFile(file);
    });
}

function createContentField(name, label, type = "text", value = "", full = false) {
    const wrapper = document.createElement("div");

    wrapper.className =
        "cineva-content-field" + (full ? " full" : "");

    const fieldLabel = document.createElement("label");
    fieldLabel.textContent = label;

    let input;

    if (type === "textarea") {
        input = document.createElement("textarea");
    } else {
        input = document.createElement("input");
        input.type = type;
    }

    input.name = name;
    input.value = value ?? "";
    input.autocomplete = "off";

    if (type === "url") {
        input.placeholder = "https://example.com/...";
    }

    wrapper.append(fieldLabel, input);

    return wrapper;
}


function openContentForm(type, record = null) {
    createContentFormModal();

    const form = contentFormModal.querySelector("#contentForm");
    const fieldsContainer = contentFormModal.querySelector("#contentFormFields");

    form.reset();
    fieldsContainer.replaceChildren();

    form.elements.namedItem("contentType").value = type;
    form.elements.namedItem("contentId").value = record?.id ?? "";

    const isSeries = type === "series";

    contentFormModal.querySelector("#contentFormTitle").textContent =
        record
            ? (isSeries ? "Edit Series" : "Edit Episode")
            : (isSeries ? "Add New Series" : "Add New Episode");

   const fields = isSeries
    ? [
        ["title", "Series Title *", "text", true],
        ["category", "Category", "text", false],
        ["translator", "Translator", "text", false],
        ["year", "Release Year", "number", false],
        ["total_seasons", "Total Seasons", "number", false],
        ["description", "Description", "textarea", true],
        ["overview", "Overview", "textarea", true],
        ["poster", "Poster Image URL", "url", true],
        ["backdrop", "Backdrop Image URL", "url", true]
    ]
        : [
            ["season", "Season Number *", "number", false],
            ["episode", "Episode Number (Ep1, Ep2, Ep3...) *", "number", false],
            ["title", "Episode Title *", "text", true],
            ["duration", "Duration (e.g. 45 min)", "text", false],
            ["thumbnail", "Episode Thumbnail URL", "url", true],
            ["video_url", "Episode Watch URL", "url", true],
            ["download_url", "Episode Download URL", "url", true],
            ["description", "Description", "textarea", true]
        ];

    fields.forEach(([name, label, fieldType, full]) => {
        const field = createContentField(
            name,
            label,
            fieldType,
            record?.[name] ?? "",
            full
        );

        const input = field.querySelector("input, textarea");

        if (name === "category") {
            attachCategorySuggestions(input, "cinevaCategoryOptions");
        }

        if (name === "title") {
            input.required = true;
            input.maxLength = 250;
        }

        if (!isSeries && ["video_url", "download_url"].includes(name)) {
            input.required = true;
            input.autocomplete = "url";
        }

        if (["season", "episode", "total_seasons"].includes(name)) {
            input.min = "1";
            input.step = "1";
            input.required = true;
        }

        fieldsContainer.appendChild(field);
        if (isSeries && name === "poster") attachImageUploader(input, "posters", "Poster");
        if (isSeries && name === "backdrop") attachImageUploader(input, "banners", "Backdrop");
    });

    // Restore episode numbering from either supported column pair.
    if (!isSeries && record) {
        form.elements.namedItem("season").value =
            record.season ?? record.season_number ?? 1;

        form.elements.namedItem("episode").value =
            record.episode ?? record.episode_number ?? 1;
    }

    // Restore the active checkbox.
    form.elements.namedItem("is_active").checked =
        record ? record.is_active !== false : true;

    // Final episode is only relevant to episodes.
    if (!isSeries) {
        const finalLabel = document.createElement("label");
        finalLabel.className = "cineva-content-check";
        finalLabel.innerHTML = `
            <input type="checkbox" name="is_final">
            This is the final episode
        `;

        contentFormModal.querySelector("#contentFormFields")
            .appendChild(finalLabel);

        form.elements.namedItem("is_final").checked =
            record?.is_final === true;
    }

    contentFormModal.querySelector("#saveContentButton").textContent =
        record ? "Update" : "Save";

    contentFormModal.hidden = false;

    form.elements.namedItem("title")?.focus();
}
/* =========================================
   CINEVA PRO — REFRESH SERIES LATEST ADDED
   Called whenever an episode is saved.
========================================= */

async function refreshSeriesLatestAdded(seriesId) {
    if (!seriesId) {
        console.warn("CINEVA: No series ID provided for timestamp refresh.");
        return false;
    }

    const { error } = await supabase
        .from("series")
        .update({
            updated_at: new Date().toISOString()
        })
        .eq("id", seriesId);

    if (error) {
        console.error(
            "CINEVA: Unable to refresh series latest-added timestamp:",
            error
        );

        return false;
    }

    console.log(
        "CINEVA: Series latest-added timestamp refreshed:",
        seriesId
    );

    return true;
}
/* =========================================
   SAVE SERIES / EPISODE FORM
   Automatically refreshes parent series
   when an episode is added or edited.
========================================= */

/* =========================================
   DUPLICATE MOVIE / SERIES TITLE GUARD
   Case-insensitive; trims and normalizes spaces.
========================================= */
async function findDuplicateContentTitle(table, title, excludeId = null) {
    const normalizedTitle = String(title || "")
        .trim()
        .replace(/\\s+/g, " ")
        .toLocaleLowerCase();

    if (!normalizedTitle) return null;

    const { data, error } = await supabase
        .from(table)
        .select("id,title")
        .ilike("title", normalizedTitle);

    if (error) throw error;

    return (data || []).find(record => {
        if (excludeId && String(record.id) === String(excludeId)) return false;

        return String(record.title || "")
            .trim()
            .replace(/\\s+/g, " ")
            .toLocaleLowerCase() === normalizedTitle;
    }) || null;
}

async function rejectDuplicateContentTitle(table, title, excludeId = null) {
    const duplicate = await findDuplicateContentTitle(table, title, excludeId);
    if (!duplicate) return false;

    alert(
        `This ${table === "movies" ? "movie" : "series"} already exists: "${duplicate.title}".\\n\\nEdit the existing content instead of uploading it again.`
    );
    return true;
}

async function saveContentForm(event) {
    event.preventDefault();

    const form = event.currentTarget;

    if (!form.reportValidity()) return;

    // Prevent duplicate submissions.
    if (form.dataset.saving === "true") return;

    const type = form.elements.namedItem("contentType")?.value;
    const contentId = form.elements.namedItem("contentId")?.value;

    const isSeries = type === "series";

    const saveButton = contentFormModal.querySelector(
        "#saveContentButton"
    );

    if (!saveButton) {
        console.error("CINEVA: Save button not found.");
        return;
    }

    // Safely read form values.
    const value = name =>
        String(
            form.elements.namedItem(name)?.value ?? ""
        ).trim();

    const number = name => {
        const raw = value(name);

        if (raw === "") return null;

        const parsed = Number(raw);

        return Number.isFinite(parsed) ? parsed : NaN;
    };

    const active = Boolean(
        form.elements.namedItem("is_active")?.checked
    );

    let payload;

    /* =====================================
       SERIES PAYLOAD
    ===================================== */

    if (isSeries) {
        const totalSeasons = number("total_seasons") ?? 1;
        const year = number("year");

        if (
            !Number.isInteger(totalSeasons) ||
            totalSeasons < 1 ||
            (year !== null && !Number.isInteger(year))
        ) {
            alert(
                "Please enter valid season and release-year values."
            );
            return;
        }

        payload = {
            title: value("title"),

            category: value("category") || null,

            year: year === null
                ? null
                : String(year),

            total_seasons: totalSeasons,

            // Preserve the series translator.
            translator: value("translator") || null,

            description: value("description") || null,

            overview: value("overview") || null,

            poster: value("poster") || null,

            backdrop: value("backdrop") || null,

            is_active: active,

            updated_at: new Date().toISOString()
        };

    } else {

        /* =====================================
           EPISODE PAYLOAD
        ===================================== */

        const season = number("season");
        const episode = number("episode");

        if (
            !Number.isInteger(season) ||
            season < 1 ||
            !Number.isInteger(episode) ||
            episode < 1
        ) {
            alert(
                "Season and episode numbers must be positive whole numbers."
            );
            return;
        }

        if (!selectedSeriesId) {
            alert(
                "Please select a series before saving this episode."
            );
            return;
        }

        const description = value("description") || null;
        const duration = value("duration") || null;
        const downloadUrl = value("download_url") || null;
        const videoUrl = value("video_url") || null;

        payload = {
            series_id: selectedSeriesId,

            // Required database columns.
            season,
            episode,

            // Compatibility columns.
            season_number: season,
            episode_number: episode,

            title: value("title"),

            description,
            overview: description,

            duration,

            thumbnail: value("thumbnail") || null,

            // Playback and download remain independent.
            video_url: videoUrl,

            download_url: downloadUrl,

            download_link: downloadUrl,

            is_final: Boolean(
                form.elements.namedItem("is_final")?.checked
            ),

            is_active: active,

            updated_at: new Date().toISOString()
        };
    }

    /* =====================================
       VALIDATE TITLE
    ===================================== */

    if (!payload.title) {
        alert("A title is required.");
        return;
    }

    if (!isSeries) {
        const normalizeEpisodeUrl = url => {
            try {
                const parsed = new URL(String(url || "").trim());
                const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

                // MediaFire display filenames can differ while the actual
                // file ID is identical. Compare the real file ID, not the
                // decorative filename at the end of the URL.
                if (host === "mediafire.com") {
                    const match = parsed.pathname.match(/^\/file\/([^/]+)/i);
                    if (match) return `mediafire.com/file/${match[1].toLowerCase()}`;
                }

                parsed.hash = "";
                parsed.searchParams.sort();
                return `${host}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`;
            } catch {
                return "";
            }
        };

        const watchUrl = normalizeEpisodeUrl(payload.video_url);
        const downloadUrl = normalizeEpisodeUrl(payload.download_url);

        if (!watchUrl || !downloadUrl) {
            alert("Every episode must have its own Watch URL and Download URL.");
            return;
        }

        if (watchUrl === downloadUrl) {
            alert("The Watch URL and Download URL must be two different links.");
            return;
        }

        const duplicate = episodesCache.find(item => {
            if (contentId && String(item.id) === String(contentId)) return false;
            const existingWatch = normalizeEpisodeUrl(item.video_url);
            const existingDownload = normalizeEpisodeUrl(item.download_url || item.download_link);
            return (
                (existingWatch && existingWatch === watchUrl) ||
                (existingDownload && existingDownload === downloadUrl)
            );
        });

        if (duplicate) {
            alert("This Watch URL or Download URL is already assigned to another episode. Each episode must have unique links.");
            return;
        }
    }

    if (isSeries) {
        try {
            if (await rejectDuplicateContentTitle("series", payload.title, contentId)) return;
        } catch (error) {
            console.error("Series duplicate check failed:", error);
            alert("Unable to verify the series title. Please try again.");
            return;
        }

        // Editing series details must not make an old series look newly added.
        // Only a newly inserted series receives its initial update timestamp.
        if (contentId) {
            delete payload.updated_at;
        }
    }

    /* =====================================
       SAVE TO SUPABASE
    ===================================== */

    form.dataset.saving = "true";

    saveButton.disabled = true;

    saveButton.textContent = contentId
        ? "Updating..."
        : "Saving...";

    try {
        let response;

        const table = isSeries
            ? "series"
            : "episodes";

        if (contentId) {
            // UPDATE EXISTING RECORD.
            response = await supabase
                .from(table)
                .update(payload)
                .eq("id", contentId);

        } else {
            // INSERT NEW RECORD.
            response = await supabase
                .from(table)
                .insert(payload);
        }

        if (response.error) {
            throw response.error;
        }

        /* =================================
           REFRESH PARENT SERIES TIMESTAMP
        ================================= */

        if (!isSeries && !contentId) {
            // Only a newly added episode refreshes the parent series
            // into Latest Added. Editing an existing episode does not.
            await refreshSeriesLatestAdded(selectedSeriesId);
        }

        /* =================================
           CLOSE FORM AFTER SUCCESS
        ================================= */

        closeContentForm();

        alert(
            contentId
                ? (
                    isSeries
                        ? "Series updated successfully."
                        : "Episode updated successfully."
                )
                : (
                    isSeries
                        ? "Series added successfully."
                        : "Episode added successfully. The series has been refreshed in Latest Added."
                )
        );

        /* =================================
           REFRESH DASHBOARD
        ================================= */

        if (isSeries) {
            await refreshContent();
        } else {
            await Promise.all([
                loadEpisodes(),
                loadSeries()
            ]);
        }

    } catch (error) {
        console.error(
            "CINEVA Series/Episode save error:",
            error
        );

        alert(
            "Unable to save " +
            (isSeries ? "series" : "episode") +
            ".\n\n" +
            (error.message || "Please try again.")
        );

    } finally {
        // Always restore the save button.
        delete form.dataset.saving;

        saveButton.disabled = false;

        saveButton.textContent = contentId
            ? "Update"
            : "Save";
    }
}
/* =========================================
   CINEVA PRO — AUTOMATIC MANAGEMENT BUTTONS
========================================= */

function createManagementButton(id, label, tableId, callback) {
    let button = document.getElementById(id);

    if (!button) {
        const tableBody = document.getElementById(tableId);

        if (!tableBody) {
            console.warn(
                `CINEVA: Cannot create ${label}; #${tableId} is missing.`
            );
            return;
        }

        const table = tableBody.closest("table") || tableBody;

        button = document.createElement("button");
        button.id = id;
        button.type = "button";
        button.textContent = label;

        const parent = table.parentElement;

        if (!parent) {
            console.warn(`CINEVA: Cannot insert ${label}.`);
            return;
        }

        parent.insertBefore(button, table);
    }

    button.type = "button";
    button.classList.add("cineva-add-content-button");

    // Prevent duplicate click listeners.
    if (button.dataset.cinevaClickBound === "true") {
        return;
    }

    button.dataset.cinevaClickBound = "true";

    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        callback();
    });
}


/* =========================================
   SERIES & EPISODE FORM INITIALIZATION
========================================= */

function initializeSeriesEpisodeForms() {

    // ADD NEW SERIES
    createManagementButton(
        "addSeriesBtn",
        "+ Add New Series",
        "seriesTable",
        () => {
            console.log("CINEVA: Opening Add New Series form.");

            openContentForm("series");
        }
    );

    // ADD SINGLE EPISODE
    createManagementButton(
        "addEpisodeBtn",
        "+ Add Episode",
        "episodesTable",
        () => {
            if (selectedSeriesId === null) {
                alert("Open a series first.");
                return;
            }

            openContentForm("episode");
        }
    );
}

/* =========================================
   CINEVA PRO — BULK MOVIE & EPISODE UPLOAD
   Maximum 10 records per batch.
   Each record is validated and saved separately.
========================================= */

let bulkUploadModal = null;
let bulkUploadBusy = false;
let bulkCancelRequested = false;
let bulkUploadKind = null;

const BULK_UPLOAD_LIMIT = 10;


/* -----------------------------------------
   BULK MODAL STYLES AND STRUCTURE
----------------------------------------- */

function createBulkUploadModal() {
    if (bulkUploadModal) return bulkUploadModal;

    const style = document.createElement("style");

    style.textContent = `
        .cineva-bulk-modal {
            position: fixed;
            inset: 0;
            z-index: 100001;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            background: rgba(0,0,0,.86);
            backdrop-filter: blur(9px);
            overflow-y: auto;
        }

        .cineva-bulk-modal[hidden] {
            display: none;
        }

        .cineva-bulk-card {
            width: 100%;
            max-width: 1050px;
            max-height: 94vh;
            overflow-y: auto;
            padding: 23px;
            color: #fff;
            background: #121221;
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 15px;
        }

        .cineva-bulk-heading {
            margin-bottom: 20px;
        }

        .cineva-bulk-heading h2 {
            margin: 0 0 8px;
            font-size: 21px;
        }

        .cineva-bulk-heading p {
            margin: 0;
            color: #aaaabd;
            font-size: 13px;
            line-height: 1.6;
        }

        .cineva-bulk-items {
            display: grid;
            gap: 15px;
        }

        .cineva-bulk-item {
            padding: 16px;
            background: #0b0b17;
            border: 1px solid #303047;
            border-radius: 11px;
        }

        .cineva-bulk-item-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-bottom: 13px;
        }

        .cineva-bulk-item-head strong {
            color: #c9a7ff;
            font-size: 14px;
        }

        .cineva-bulk-status {
            font-size: 12px;
            color: #aaaabd;
            font-weight: 700;
        }

        .cineva-bulk-status[data-status="saved"] {
            color: #4ade80;
        }

        .cineva-bulk-status[data-status="failed"] {
            color: #fb7185;
        }

        .cineva-bulk-status[data-status="uploading"] {
            color: #c9a7ff;
        }

        .cineva-bulk-fields {
            display: grid;
            grid-template-columns: repeat(2,minmax(0,1fr));
            gap: 12px;
        }

        .cineva-bulk-field {
            display: flex;
            flex-direction: column;
            gap: 7px;
        }

        .cineva-bulk-field.full {
            grid-column: 1 / -1;
        }

        .cineva-bulk-field label {
            color: #c6c6d7;
            font-size: 12px;
            font-weight: 600;
        }

        .cineva-bulk-field input,
        .cineva-bulk-field textarea {
            width: 100%;
            box-sizing: border-box;
            padding: 11px 12px;
            color: white;
            background: #121221;
            border: 1px solid #303047;
            border-radius: 7px;
            outline: none;
            font: inherit;
        }

        .cineva-bulk-field input:focus,
        .cineva-bulk-field textarea:focus {
            border-color: #8b35f5;
        }

        .cineva-bulk-error {
            display: none;
            margin-top: 12px;
            color: #fb7185;
            font-size: 12px;
            line-height: 1.5;
        }

        .cineva-bulk-error.visible {
            display: block;
        }

        .cineva-bulk-actions {
            position: sticky;
            bottom: -23px;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin: 20px -23px -23px;
            padding: 16px 23px;
            background: #121221;
            border-top: 1px solid #303047;
        }

        .cineva-bulk-actions button {
            padding: 12px 19px;
            border: 0;
            border-radius: 8px;
            color: white;
            font-weight: 700;
            cursor: pointer;
        }

        .cineva-bulk-cancel {
            background: #29293c;
        }

        .cineva-bulk-submit {
            background: linear-gradient(135deg,#8b35f5,#ef315e);
        }

        .cineva-bulk-submit:disabled {
            opacity: .6;
            cursor: not-allowed;
        }

        @media(max-width:600px) {
            .cineva-bulk-card {
                padding: 15px;
            }

            .cineva-bulk-fields {
                grid-template-columns: 1fr;
            }

            .cineva-bulk-actions {
                bottom: -15px;
                margin: 18px -15px -15px;
                padding: 13px 15px;
            }

            .cineva-bulk-actions button {
                flex: 1;
            }
        }
    `;

    document.head.appendChild(style);

    bulkUploadModal = document.createElement("div");
    bulkUploadModal.className = "cineva-bulk-modal";
    bulkUploadModal.hidden = true;

    bulkUploadModal.innerHTML = `
        <div class="cineva-bulk-card">

            <div class="cineva-bulk-heading">
                <h2 id="bulkUploadTitle">Bulk Upload</h2>
                <p id="bulkUploadDescription"></p>
            </div>

            <form id="bulkUploadForm">

                <div
                    id="bulkUploadItems"
                    class="cineva-bulk-items">
                </div>

                <div class="cineva-bulk-actions">

                    <button
                        type="button"
                        class="cineva-bulk-cancel"
                        id="bulkUploadCancel">
                        Cancel
                    </button>

                    <button
                        type="submit"
                        class="cineva-bulk-submit"
                        id="bulkUploadSubmit">
                        Upload All
                    </button>

                </div>

            </form>
        </div>
    `;

    document.body.appendChild(bulkUploadModal);

    bulkUploadModal.querySelector("#bulkUploadCancel")
        .addEventListener("click", requestCloseBulkUpload);

    bulkUploadModal.querySelector("#bulkUploadForm")
        .addEventListener("submit", processBulkUpload);

    return bulkUploadModal;
}


/* -----------------------------------------
   CREATE ONE BULK ITEM
----------------------------------------- */

function createBulkItem(index, kind) {
    const item = document.createElement("section");

    item.className = "cineva-bulk-item";
    item.dataset.index = String(index);

    const heading = document.createElement("div");
    heading.className = "cineva-bulk-item-head";

    const number = document.createElement("strong");
    number.textContent = kind === "movie" ? `Movie ${index + 1}` : `Ep${index + 1}`;

    const status = document.createElement("span");
    status.className = "cineva-bulk-status";
    status.dataset.status = "pending";
    status.textContent = "Pending";

    heading.append(number, status);

    const fieldsContainer = document.createElement("div");
    fieldsContainer.className = "cineva-bulk-fields";

    const fields = kind === "movie"
        ? [
            ["title", "Movie Title *", "text", true],
            ["category", "Category", "text", false],
            ["year", "Release Year", "number", false],
            ["poster_path", "Poster Image URL", "url", true],
            ["video_url", "Movie Watch URL", "url", true],
            ["download_url", "Movie Download URL", "url", true]
        ]
        : [
            ["season", "Season Number *", "number", false],
            ["episode", "Episode Number (Ep1, Ep2, Ep3...) *", "number", false],
            ["title", "Episode Title *", "text", true],
            ["duration", "Duration", "text", false],
            ["thumbnail", "Thumbnail URL", "url", true],
            ["video_url", "Episode Watch URL", "url", true],
            ["download_url", "Episode Download URL", "url", true],
            ["description", "Description", "text", true]
        ];

    fields.forEach(([name, labelText, type, full]) => {
        const wrapper = document.createElement("div");

        wrapper.className =
            "cineva-bulk-field" + (full ? " full" : "");

        const label = document.createElement("label");
        label.textContent = labelText;

        const input = document.createElement("input");

        input.type = type;
        input.name = name;
        input.autocomplete = "off";

        // Native form validation prevents an episode row from being
        // submitted without its own independent playback and download URLs.
        if (
            kind === "episode" &&
            ["title", "video_url", "download_url"].includes(name)
        ) {
            input.required = true;
        }

        if (type === "url") {
            input.placeholder = "https://example.com/...";
        }

        if (type === "number") {
            input.step = "1";
            input.min = "1";
        }

        wrapper.append(label, input);
        fieldsContainer.appendChild(wrapper);
    });

    const error = document.createElement("div");
    error.className = "cineva-bulk-error";
    error.dataset.error = "true";

    item.append(heading, fieldsContainer, error);

    return item;
}


/* -----------------------------------------
   OPEN BULK UPLOAD
----------------------------------------- */

function openBulkUpload(kind) {
    if (!["movie", "episode"].includes(kind)) return;

    if (kind === "episode" && selectedSeriesId === null) {
        alert("Open a series before bulk uploading episodes.");
        return;
    }

    createBulkUploadModal();

    bulkUploadKind = kind;
    bulkCancelRequested = false;

    const items = bulkUploadModal.querySelector("#bulkUploadItems");
    const title = bulkUploadModal.querySelector("#bulkUploadTitle");
    const description = bulkUploadModal.querySelector("#bulkUploadDescription");
    const submit = bulkUploadModal.querySelector("#bulkUploadSubmit");

    items.replaceChildren();

    title.textContent = kind === "movie"
        ? "Bulk Add Movies"
        : `Bulk Add Episodes — ${selectedSeriesName}`;

    description.textContent = kind === "movie"
        ? "Enter up to 10 movies. Each movie is validated and saved independently. Watch and Download URLs are separate."
        : "Enter up to 10 episodes for this series. Each episode is validated and saved independently.";

    submit.textContent = kind === "movie"
        ? "Upload Movies"
        : "Upload Episodes";

    submit.disabled = false;

    for (let index = 0; index < BULK_UPLOAD_LIMIT; index++) {
        items.appendChild(createBulkItem(index, kind));
    }

    bulkUploadModal.hidden = false;

    items.querySelector('input[name="title"]')?.focus();
}


/* -----------------------------------------
   BULK FIELD HELPERS
----------------------------------------- */

function getBulkItemValues(item) {
    const values = {};

    item.querySelectorAll("input").forEach(input => {
        values[input.name] = input.value.trim();
    });

    return values;
}


function isBulkItemEmpty(values) {
    return Object.values(values).every(value => value === "");
}


function validateBulkURL(value, label) {
    if (!value) return;

    let parsed;

    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${label} must be a valid URL.`);
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error(`${label} must use HTTP or HTTPS.`);
    }
}


function setBulkItemStatus(item, status, message = "") {
    const statusElement = item.querySelector(".cineva-bulk-status");
    const errorElement = item.querySelector("[data-error]");

    if (statusElement) {
        statusElement.dataset.status = status;

        const labels = {
            pending: "Pending",
            uploading: "Uploading...",
            saved: "Saved successfully",
            failed: "Failed",
            skipped: "Skipped"
        };

        statusElement.textContent = labels[status] || status;
    }

    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.toggle("visible", Boolean(message));
    }
}


/* -----------------------------------------
   VALIDATE AND BUILD PAYLOAD
----------------------------------------- */

function buildBulkPayload(values, kind) {
    if (!values.title) {
        throw new Error("Title is required.");
    }

    validateBulkURL(values.video_url, "Watch URL");
    validateBulkURL(values.download_url, "Download URL");

    if (kind === "movie") {
        const year = values.year === ""
            ? null
            : Number(values.year);

        if (
            year !== null &&
            (!Number.isInteger(year) || year < 1800 || year > 2200)
        ) {
            throw new Error("Release year must be between 1800 and 2200.");
        }

        validateBulkURL(values.poster_path, "Poster URL");

        return {
            title: values.title,
            category: values.category || null,
            year,
            poster_path: values.poster_path || null,

            // Watch and download are never interchangeable.
            video_url: values.video_url || null,
            download_url: values.download_url || null,

            // Keep existing JSON structures valid.
            download_links: [],
            parts: [],

            quality: "HD",
            is_active: true,
            is_featured: false,
            updated_at: new Date().toISOString()
        };
    }

    const season = Number(values.season);
    const episode = Number(values.episode);

    if (!Number.isInteger(season) || season < 1) {
        throw new Error("Season must be a positive whole number.");
    }

    if (!Number.isInteger(episode) || episode < 1) {
        throw new Error("Episode must be a positive whole number.");
    }

    validateBulkURL(values.thumbnail, "Thumbnail URL");

    if (!values.video_url || !values.download_url) {
        throw new Error("Every episode needs its own Watch URL and Download URL.");
    }

    return {
        series_id: selectedSeriesId,

        // Required database columns and their aliases.
        season,
        episode,
        season_number: season,
        episode_number: episode,

        title: values.title,
        duration: values.duration || null,
        thumbnail: values.thumbnail || null,
        description: values.description || null,
        overview: values.description || null,

        // Independent playback and download fields.
        video_url: values.video_url || null,
        download_url: values.download_url || null,
        download_link: values.download_url || null,

        is_active: true,
        is_final: false,
        updated_at: new Date().toISOString()
    };
}


/* -----------------------------------------
   CLOSE BULK UPLOAD
----------------------------------------- */

function requestCloseBulkUpload() {
    if (!bulkUploadModal) return;

    if (bulkUploadBusy) {
        const confirmed = confirm(
            "Bulk upload is still running.\n\n" +
            "Stop the remaining uploads?\n\n" +
            "Items already saved will remain in your database."
        );

        if (!confirmed) return;

        bulkCancelRequested = true;
        bulkUploadModal.hidden = true;

        return;
    }

    bulkUploadModal.hidden = true;
}
/* -----------------------------------------
   PROCESS BULK UPLOAD
   Automatically refresh parent series
   after successful episode uploads.
----------------------------------------- */

async function processBulkUpload(event) {
    event.preventDefault();

    if (bulkUploadBusy || !bulkUploadKind) return;

    const kind = bulkUploadKind;

    // Preserve the parent series ID throughout this upload.
    const parentSeriesId = kind === "episode"
        ? selectedSeriesId
        : null;

    const items = [
        ...bulkUploadModal.querySelectorAll(".cineva-bulk-item")
    ];

    const submit = bulkUploadModal.querySelector(
        "#bulkUploadSubmit"
    );

    const prepared = [];
    let filledCount = 0;

    // Validate every row before beginning database requests.
    items.forEach(item => {
        const values = getBulkItemValues(item);

        if (isBulkItemEmpty(values)) {
            setBulkItemStatus(item, "skipped");
            return;
        }

        filledCount++;

        try {
            const payload = buildBulkPayload(values, kind);

            prepared.push({
                item,
                payload
            });

        } catch (error) {
            setBulkItemStatus(
                item,
                "failed",
                error.message
            );
        }
    });

    if (filledCount === 0) {
        alert("Enter at least one item before uploading.");
        return;
    }

    if (kind === "episode" && prepared.length) {
        const normalizeEpisodeUrl = url => {
            try { return new URL(String(url || "").trim()).href; }
            catch { return ""; }
        };
        // All episode URLs share one uniqueness set. This prevents a
        // Watch URL from accidentally reusing another episode's Download URL.
        const usedUrls = new Set();

        episodesCache.forEach(existing => {
            const watch = normalizeEpisodeUrl(existing.video_url);
            const download = normalizeEpisodeUrl(
                existing.download_url || existing.download_link
            );
            if (watch) usedUrls.add(watch);
            if (download) usedUrls.add(download);
        });

        for (const entry of prepared) {
            const watchUrl = normalizeEpisodeUrl(entry.payload.video_url);
            const downloadUrl = normalizeEpisodeUrl(entry.payload.download_url);

            if (
                !watchUrl ||
                !downloadUrl ||
                watchUrl === downloadUrl ||
                usedUrls.has(watchUrl) ||
                usedUrls.has(downloadUrl)
            ) {
                setBulkItemStatus(
                    entry.item,
                    "failed",
                    "Each episode needs two different URLs. Neither URL may be reused by another episode."
                );
                entry.invalid = true;
                continue;
            }

            usedUrls.add(watchUrl);
            usedUrls.add(downloadUrl);
        }

        for (let i = prepared.length - 1; i >= 0; i--) {
            if (prepared[i].invalid) prepared.splice(i, 1);
        }
    }

    if (prepared.length === 0) {
        alert(
            "No valid items to upload. Please correct the failed rows."
        );
        return;
    }

    bulkUploadBusy = true;
    bulkCancelRequested = false;

    submit.disabled = true;
    submit.textContent = "Uploading...";

    let savedCount = 0;
    let failedCount = filledCount - prepared.length;

    try {
        for (const entry of prepared) {
            if (bulkCancelRequested) break;

            setBulkItemStatus(entry.item, "uploading");

            try {
                const table = kind === "movie"
                    ? "movies"
                    : "episodes";

                if (kind === "movie") {
                    const duplicate = await findDuplicateContentTitle(
                        "movies",
                        entry.payload.title
                    );
                    if (duplicate) {
                        throw new Error(`Movie already exists: "${duplicate.title}".`);
                    }
                }

                // Request the saved row back and verify the database kept
                // this exact episode's separate Watch and Download URLs.
                const insertQuery = supabase
                    .from(table)
                    .insert(entry.payload);

                const { data: savedRows, error } = kind === "episode"
                    ? await insertQuery.select(
                        "id, series_id, season_number, episode_number, video_url, download_url"
                    )
                    : await insertQuery;

                if (error) throw error;

                if (kind === "episode") {
                    const saved = Array.isArray(savedRows)
                        ? savedRows[0]
                        : savedRows;

                    const expectedWatch = entry.payload.video_url;
                    const expectedDownload = entry.payload.download_url;

                    if (
                        !saved ||
                        String(saved.video_url || "").trim() !== expectedWatch ||
                        String(saved.download_url || "").trim() !== expectedDownload
                    ) {
                        throw new Error(
                            "The database did not confirm this episode's exact Watch and Download URLs. Please check the saved episode before continuing."
                        );
                    }
                }

                savedCount++;

                setBulkItemStatus(
                    entry.item,
                    "saved"
                );

            } catch (error) {
                failedCount++;

                console.error(
                    `CINEVA bulk ${kind} upload failed:`,
                    error
                );

                setBulkItemStatus(
                    entry.item,
                    "failed",
                    error.message || "Database insert failed."
                );
            }
        }

    } finally {
        bulkUploadBusy = false;

        submit.disabled = false;

        submit.textContent = kind === "movie"
            ? "Upload Movies"
            : "Upload Episodes";

        /* =================================
           REFRESH AFTER SUCCESSFUL UPLOADS
        ================================= */

        if (savedCount > 0) {
            if (kind === "movie") {
                await refreshContent();

            } else {
                // Refresh the parent series timestamp once,
                // even if several episodes were uploaded.
                await refreshSeriesLatestAdded(parentSeriesId);

                await Promise.all([
                    loadEpisodes(),
                    loadSeries()
                ]);
            }
        }

        /* =================================
           FINAL UPLOAD REPORT
        ================================= */

        if (!bulkCancelRequested) {
            alert(
                "Bulk upload finished.\n\n" +
                `Saved: ${savedCount}\n` +
                `Failed: ${failedCount}\n` +
                `Skipped: ${BULK_UPLOAD_LIMIT - filledCount}` +
                (
                    kind === "episode" && savedCount > 0
                        ? "\n\nParent series refreshed successfully."
                        : ""
                )
            );

        } else {
            console.info(
                `CINEVA bulk upload stopped. ${savedCount} item(s) saved.`
            );
        }

        bulkCancelRequested = false;
    }
}
/* -----------------------------------------
   BULK BUTTONS
----------------------------------------- */

function initializeBulkUploadButtons() {
    // Movies bulk button.
    if (!$("bulkAddMoviesBtn")) {
        const addMovieButton = $("addMovieBtn");

        if (addMovieButton) {
            const button = document.createElement("button");

            button.type = "button";
            button.id = "bulkAddMoviesBtn";
            button.className =
                addMovieButton.className || "cineva-add-content-button";

            button.textContent = "+ Bulk Add Movies";

            button.addEventListener("click", () => {
                openBulkUpload("movie");
            });

            addMovieButton.insertAdjacentElement("afterend", button);
        }
    }

    // Episodes bulk button.
    createManagementButton(
        "bulkAddEpisodesBtn",
        "+ Bulk Add 10 Episodes",
        "episodesTable",
        () => openBulkUpload("episode")
    );
}
/* =========================================
   END SERIES & EPISODE FORMS
========================================= */

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

           case "edit-series": {
    const series = seriesCache.find(
        item => String(item.id) === String(id)
    );

    if (series) {
        openContentForm("series", series);
    }

    break;
}

case "edit-episode": {
    const episode = episodesCache.find(
        item => String(item.id) === String(id)
    );

    if (episode) {
        openContentForm("episode", episode);
    }

    break;
}
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
   document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    const contentOpen =
        contentFormModal && !contentFormModal.hidden;

    const movieOpen =
        movieModal && !movieModal.hidden;

    const bulkOpen =
        bulkUploadModal && !bulkUploadModal.hidden;

    if (contentOpen || movieOpen || bulkOpen) {
        event.preventDefault();
        event.stopPropagation();
    }
}, true);
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

    if (platformAdmin) {
        try {
            await platformAdmin.refreshCategories();
        } catch (error) {
            console.warn("CINEVA: Category registry refresh was unavailable.", error);
        }
    }

    await loadDashboardStatistics();
    renderCategoryManagement();
    if (platformAdmin) await platformAdmin.loadAnalytics();
}

bind("refreshMoviesBtn", "click", loadMovies);
bind("refreshSeriesBtn", "click", loadSeries);
bind("visitorRefreshBtn", "click", async () => {
    await Promise.all([
        loadVisitorAnalytics(),
        platformAdmin?.loadAnalytics()
    ]);
});
bind("categorySearch", "input", renderCategoryManagement);
window.addEventListener("cineva:categories-updated", populateMovieCategories);
bind("closeEpisodeManager", "click", closeEpisodeManager);

/* =========================================
   CATEGORY LIBRARY
   Categories are derived from existing movie
   and series category values; no data is moved.
========================================= */

function renderCategoryManagement() {
    platformAdmin?.renderCategories();
}


/* =========================================
   VISITOR ANALYTICS
========================================= */

function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

async function loadVisitorAnalytics() {
    const trend = $("visitorTrend");
    if (trend) {
        trend.replaceChildren();
        const loading = document.createElement("div");
        loading.className = "category-loading";
        loading.textContent = "Loading visitor activity...";
        trend.appendChild(loading);
    }

    ["visitorToday", "visitorMonth", "visitorYear"].forEach(id => setText(id, "—"));

    try {
        const now = new Date();
        const todayKey = localDateKey(now);
        const monthKey = todayKey.slice(0, 7);
        const yearKey = todayKey.slice(0, 4);
        const yearStart = `${yearKey}-01-01`;

        const visits = [];
        const pageSize = 1000;
        let offset = 0;

        // Read every page so high-traffic sites are not capped
        // by Supabase's default 1,000-row response limit.
        while (true) {
            const { data, error } = await supabase
                .from("site_visits")
                .select("id, visitor_id, visit_day")
                .gte("visit_day", yearStart)
                .lte("visit_day", todayKey)
                .order("visit_day", { ascending: true })
                .order("id", { ascending: true })
                .range(offset, offset + pageSize - 1);

            if (error) throw error;

            visits.push(...(data || []));
            if (!data || data.length < pageSize) break;
            offset += pageSize;
        }
        const todayVisitors = new Set();
        const monthVisitors = new Set();
        const yearVisitors = new Set();
        const dailyCounts = new Map();

        visits.forEach(visit => {
            const day = String(visit.visit_day);
            const visitor = String(visit.visitor_id);
            dailyCounts.set(day, (dailyCounts.get(day) || 0) + 1);
            yearVisitors.add(visitor);
            if (day.slice(0, 7) === monthKey) monthVisitors.add(visitor);
            if (day === todayKey) todayVisitors.add(visitor);
        });

        setText("visitorToday", todayVisitors.size.toLocaleString());
        setText("visitorMonth", monthVisitors.size.toLocaleString());
        setText("visitorYear", yearVisitors.size.toLocaleString());

        if (trend) {
            trend.replaceChildren();
            const chartDays = [];
            for (let offset = 13; offset >= 0; offset--) {
                const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
                const key = localDateKey(day);
                chartDays.push({
                    key,
                    label: day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
                    count: dailyCounts.get(key) || 0
                });
            }

            const maximum = Math.max(1, ...chartDays.map(day => day.count));

            chartDays.forEach(day => {
                const row = document.createElement("div");
                row.className = "visitor-trend-row";

                const label = document.createElement("span");
                label.className = "visitor-trend-date";
                label.textContent = day.label;

                const track = document.createElement("div");
                track.className = "visitor-trend-track";
                const bar = document.createElement("div");
                bar.className = "visitor-trend-bar";
                bar.style.width = `${day.count ? Math.max(2, day.count / maximum * 100) : 0}%`;
                track.appendChild(bar);

                const value = document.createElement("strong");
                value.className = "visitor-trend-value";
                value.textContent = day.count.toLocaleString();

                row.append(label, track, value);
                trend.appendChild(row);
            });
        }

        setText("visitorUpdated", `Updated ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • Kigali time`);
    } catch (error) {
        console.error("CINEVA visitor analytics error:", error);
        if (trend) {
            trend.replaceChildren();
            const message = document.createElement("div");
            message.className = "category-empty";
            message.textContent = "Unable to load visitor data. Check the site_visits table and admin access.";
            trend.appendChild(message);
        }
        setText("visitorUpdated", "Analytics unavailable");
    }
}

/* =========================================
   NAVIGATION
========================================= */

function initializeNavigation() {
    const links = document.querySelectorAll("[data-page]");
    const pageTitle = $("pageTitle");
    const sidebar = $("sidebar");
    const sidebarToggle = $("sidebarToggle");
    let drawerOverlay = $("adminDrawerOverlay");
    if (!drawerOverlay && sidebar) {
        drawerOverlay = document.createElement("button");
        drawerOverlay.type = "button";
        drawerOverlay.id = "adminDrawerOverlay";
        drawerOverlay.className = "admin-drawer-overlay";
        drawerOverlay.setAttribute("aria-label", "Close navigation menu");
        drawerOverlay.setAttribute("tabindex", "-1");
        document.body.appendChild(drawerOverlay);
    }

    function closeDrawer() {
        sidebar?.classList.remove("open");
        drawerOverlay?.classList.remove("visible");
        sidebarToggle?.setAttribute("aria-expanded", "false");
        document.body.classList.remove("admin-drawer-open");
    }

    function openDrawer() {
        sidebar?.classList.add("open");
        drawerOverlay?.classList.add("visible");
        sidebarToggle?.setAttribute("aria-expanded", "true");
        document.body.classList.add("admin-drawer-open");
    }

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

        closeDrawer();
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
        if (sidebar?.classList.contains("open")) closeDrawer();
        else openDrawer();
    });
    drawerOverlay?.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeDrawer();
    });
    window.addEventListener("resize", () => {
        if (window.innerWidth > 760) closeDrawer();
    }, { passive: true });

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

        // Prevent a stalled network/auth request from leaving the
        // full-screen boot loader visible forever.
        const verificationTimeout = new Promise((_, reject) => {
            window.setTimeout(() => {
                reject(new Error(
                    "Administrator verification timed out. Check your connection and tap Try Again."
                ));
            }, 15000);
        });

        const result = await Promise.race([
            verifyAdmin(),
            verificationTimeout
        ]);

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

platformAdmin = initializePlatformAdmin({
    getMovies: () => moviesCache,
    getSeries: () => seriesCache,
    adminUser: result.user,
    refreshContent: () => refreshContent()
});
await platformAdmin.initialize();

initializeNavigation();
initializeSeriesEpisodeForms();
initializeBulkUploadButtons();

bind("logoutButton", "click", logout);

await refreshContent();
        await loadVisitorAnalytics();

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

/* =========================================
   RENDER MOVIE PARTS
========================================= */

function renderMovieParts(parts = []) {
    const container = movieModal.querySelector("#moviePartsContainer");

    if (!container) return;

    container.innerHTML = "";

    normalizeMovieParts(parts).forEach((part, index) => {
        container.appendChild(createMoviePartRow(part, index));
    });

    updateMoviePartRows();
}


/* =========================================
   COLLECT MOVIE PARTS
========================================= */

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

        // Every entered part must be complete.
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


/* =========================================
   INITIALIZE MOVIE PART EVENTS
========================================= */

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
    movieModal.setAttribute("role", "dialog");
    movieModal.setAttribute("aria-modal", "true");
    movieModal.setAttribute("aria-labelledby", "movieFormTitle");
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
                        <label>Movie Category *</label>
                        <select name="category" required>
                            <option value="">Select movie category</option>
                            <option value="Action">Action</option>
                            <option value="Horror">Horror</option>
                            <option value="Drama">Drama</option>
                            <option value="Highschool">Highschool</option>
                            <option value="Animation">Animation</option>
                            <option value="Comedy">Comedy</option>
                            <option value="Erotic">Erotic</option>
                        </select>

                        <small class="cineva-field-hint">
                            Select the category that matches your movie.
                        </small>
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
                        <label>Production Country *</label>

                        <select name="country" required>
                            <option value="">Select production country</option>

                            <optgroup label="🌍 Major Film Industries">
                                <option value="United States">United States</option>
                                <option value="India">India</option>
                                <option value="China">China</option>
                                <option value="Japan">Japan</option>
                                <option value="South Korea">South Korea</option>
                                <option value="United Kingdom">United Kingdom</option>
                                <option value="France">France</option>
                                <option value="Nigeria">Nigeria</option>
                                <option value="Canada">Canada</option>
                                <option value="Germany">Germany</option>
                                <option value="Italy">Italy</option>
                                <option value="Spain">Spain</option>
                                <option value="Turkey">Turkey</option>
                                <option value="Thailand">Thailand</option>
                                <option value="Indonesia">Indonesia</option>
                                <option value="Hong Kong">Hong Kong</option>
                                <option value="Egypt">Egypt</option>
                                <option value="Brazil">Brazil</option>
                                <option value="Mexico">Mexico</option>
                                <option value="Australia">Australia</option>
                            </optgroup>

                            <optgroup label="🌎 Other Film-Producing Countries">
                                <option value="Argentina">Argentina</option>
                                <option value="Austria">Austria</option>
                                <option value="Belgium">Belgium</option>
                                <option value="Chile">Chile</option>
                                <option value="Colombia">Colombia</option>
                                <option value="Czech Republic">Czech Republic</option>
                                <option value="Denmark">Denmark</option>
                                <option value="Finland">Finland</option>
                                <option value="Greece">Greece</option>
                                <option value="Hungary">Hungary</option>
                                <option value="Ireland">Ireland</option>
                                <option value="Israel">Israel</option>
                                <option value="Kenya">Kenya</option>
                                <option value="Malaysia">Malaysia</option>
                                <option value="Netherlands">Netherlands</option>
                                <option value="New Zealand">New Zealand</option>
                                <option value="Norway">Norway</option>
                                <option value="Pakistan">Pakistan</option>
                                <option value="Philippines">Philippines</option>
                                <option value="Poland">Poland</option>
                                <option value="Portugal">Portugal</option>
                                <option value="Rwanda">Rwanda</option>
                                <option value="Russia">Russia</option>
                                <option value="Saudi Arabia">Saudi Arabia</option>
                                <option value="Singapore">Singapore</option>
                                <option value="South Africa">South Africa</option>
                                <option value="Sweden">Sweden</option>
                                <option value="Switzerland">Switzerland</option>
                                <option value="Taiwan">Taiwan</option>
                                <option value="Vietnam">Vietnam</option>
                            </optgroup>
                        </select>

                        <small class="cineva-field-hint">
                            Countries are arranged by major film-producing industries first.
                        </small>
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
                        <label>Main Movie Watch URL (Optional)</label>
                        <input
                            name="video_url"
                            type="url"
                            placeholder="Add a streaming link now, or leave empty and add it later">
                        <small class="cineva-field-hint">
                            You can save movie details without a watch URL and add playback later.
                        </small>
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
                                    The main Movie Watch URL can be left empty when you add parts.
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
                            No movie parts added. Add at least one complete part if the main Movie Watch URL is empty.
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

    // Initialize movie-parts controls.
    initializeMoviePartEvents();

    movieModal.querySelector("#closeMovieForm")
        .addEventListener("click", closeMovieForm);

    movieModal.querySelector("#cancelMovieForm")
        .addEventListener("click", closeMovieForm);

    // Close only when the backdrop itself is pressed, never when
    // the user interacts with fields or controls inside the form.
    movieModal.addEventListener("pointerdown", event => {
        if (event.target === movieModal) {
            closeMovieForm();
        }
    });

    // Escape is a convenient keyboard alternative to the close button.
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && movieModal && !movieModal.hidden) {
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

    attachImageUploader(form.elements.namedItem("poster_path"), "posters", "Poster");
    attachImageUploader(form.elements.namedItem("backdrop_path"), "banners", "Backdrop");

    attachCategorySuggestions(form.elements.namedItem("category"), "cinevaCategoryOptions");

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

        // Each part has its own title, Watch URL and Download URL.
        parts: movieParts,

        is_active: form.elements.namedItem("is_active").checked,
        is_featured: form.elements.namedItem("is_featured").checked,

        updated_at: new Date().toISOString()
    };

    if (!payload.title) {
        alert("Movie title is required.");
        return;
    }

    /*
     * Main playback URL is optional.
     * Movies may be saved with metadata and download links first,
     * then have playback added later from the edit form.
     *
     * Any part that is added must still contain its own valid
     * Watch URL and Download URL.
     */

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

    try {
        if (await rejectDuplicateContentTitle("movies", payload.title, movieId)) return;
    } catch (error) {
        console.error("Movie duplicate check failed:", error);
        alert("Unable to verify the movie title. Please try again.");
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
