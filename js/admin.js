
import { supabase, APP_CONFIG } from "./config.js";

/* =========================================
   CINEVA ADMIN ROOM
   Authentication + Dashboard + Navigation
========================================= */

const $ = (selector) => document.querySelector(selector);

const elements = {
    loading: $("#adminLoading"),
    error: $("#adminError"),
    app: $("#adminApp"),
    adminName: $("#adminName"),
    adminAvatar: $("#adminAvatar"),
    logout: $("#adminLogout"),

    totalMovies: $("#totalMovies"),
    totalSeries: $("#totalSeries"),
    totalEpisodes: $("#totalEpisodes"),
    databaseStatus: $("#databaseStatus"),

    recentMovies: $("#recentMovies"),
    allMovies: $("#allMovies"),
    allSeries: $("#allSeries"),

    settingsSupabaseStatus: $("#settingsSupabaseStatus"),
    sidebar: $("#adminSidebar"),
    sidebarToggle: $("#sidebarToggle"),
    pageHeading: $("#pageHeading")
};

let currentAdmin = null;

/* =========================================
   SAFE HTML
========================================= */

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function showError(message) {
    elements.loading.hidden = true;
    elements.app.hidden = true;
    elements.error.hidden = false;
    elements.error.textContent = message;
}

function showDashboard() {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.app.hidden = false;
}

/* =========================================
   ADMIN AUTHENTICATION
========================================= */

async function verifyAdmin() {
    try {
        const {
            data: { user },
            error
        } = await supabase.auth.getUser();

        if (error) throw error;

        if (!user) {
            window.location.replace("login.html?redirect=admin.html");
            return false;
        }

        // Only trust the server-issued app_metadata.
        const role = user.app_metadata?.role;

        if (role !== "admin") {
            showError(
                "Access denied. Your account does not have CINEVA administrator permissions."
            );

            setTimeout(() => {
                window.location.replace("index.html");
            }, 2500);

            return false;
        }

        currentAdmin = user;

        const displayName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "Administrator";

        elements.adminName.textContent = displayName;
        elements.adminAvatar.textContent =
            displayName.charAt(0).toUpperCase();

        showDashboard();
        return true;

    } catch (error) {
        console.error("Admin authentication error:", error);

        showError(
            "Unable to verify administrator access. Check your Supabase connection and try again."
        );

        return false;
    }
}

/* =========================================
   DATABASE HELPERS
========================================= */

async function getTableCount(table) {
    const { count, error } = await supabase
        .from(table)
        .select("*", {
            count: "exact",
            head: true
        });

    if (error) throw error;

    return count ?? 0;
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

/* =========================================
   DASHBOARD STATISTICS
========================================= */

async function loadStatistics() {
    try {
        const [movies, series, episodes] = await Promise.all([
            getTableCount(APP_CONFIG.moviesTable),
            getTableCount(APP_CONFIG.seriesTable),
            getTableCount("episodes")
        ]);

        elements.totalMovies.textContent = movies.toLocaleString();
        elements.totalSeries.textContent = series.toLocaleString();
        elements.totalEpisodes.textContent = episodes.toLocaleString();

        elements.databaseStatus.textContent = "Connected";
        elements.settingsSupabaseStatus.textContent = "Connected";

    } catch (error) {
        console.error("Dashboard statistics error:", error);

        elements.databaseStatus.textContent = "Error";
        elements.settingsSupabaseStatus.textContent = "Connection error";

        throw error;
    }
}

/* =========================================
   RECENT MOVIES
========================================= */

async function loadRecentMovies() {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("id,title,category,year,release_date,created_at,is_active")
        .order("created_at", { ascending: false })
        .limit(6);

    if (error) throw error;

    if (!data?.length) {
        elements.recentMovies.innerHTML =
            `<tr><td colspan="4">No movies found.</td></tr>`;
        return;
    }

    elements.recentMovies.innerHTML = data.map(movie => {
        const year = movie.year ||
            (movie.release_date ? movie.release_date.slice(0, 4) : "—");

        const status = movie.is_active === false ? "Inactive" : "Active";

        return `
            <tr>
                <td><strong>${escapeHTML(movie.title)}</strong></td>
                <td>${escapeHTML(movie.category || "Uncategorized")}</td>
                <td>${escapeHTML(year)}</td>
                <td>
                    <span class="content-status ${status === "Active" ? "status-active" : "status-inactive"}">
                        ${status}
                    </span>
                </td>
            </tr>
        `;
    }).join("");
}

/* =========================================
   ALL MOVIES
========================================= */

async function loadAllMovies() {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("id,title,category,year,release_date,created_at")
        .order("created_at", { ascending: false })
        .limit(100);

    if (error) throw error;

    if (!data?.length) {
        elements.allMovies.innerHTML =
            `<tr><td colspan="4">No movies found.</td></tr>`;
        return;
    }

    elements.allMovies.innerHTML = data.map(movie => {
        const year = movie.year ||
            (movie.release_date ? movie.release_date.slice(0, 4) : "—");

        return `
            <tr>
                <td><strong>${escapeHTML(movie.title)}</strong></td>
                <td>${escapeHTML(movie.category || "Uncategorized")}</td>
                <td>${escapeHTML(year)}</td>
                <td>${formatDate(movie.created_at)}</td>
            </tr>
        `;
    }).join("");
}

/* =========================================
   ALL SERIES
========================================= */

async function loadAllSeries() {
    const { data, error } = await supabase
        .from(APP_CONFIG.seriesTable)
        .select("id,title,category,year,created_at")
        .order("created_at", { ascending: false })
        .limit(100);

    if (error) throw error;

    if (!data?.length) {
        elements.allSeries.innerHTML =
            `<tr><td colspan="4">No series found.</td></tr>`;
        return;
    }

    elements.allSeries.innerHTML = data.map(series => `
        <tr>
            <td><strong>${escapeHTML(series.title)}</strong></td>
            <td>${escapeHTML(series.category || "Uncategorized")}</td>
            <td>${escapeHTML(series.year || "—")}</td>
            <td>${formatDate(series.created_at)}</td>
        </tr>
    `).join("");
}

/* =========================================
   NAVIGATION
========================================= */

const sectionTitles = {
    dashboard: "Dashboard",
    "add-movie": "Add Movie",
    movies: "Movies",
    series: "Series",
    episodes: "Episodes",
    settings: "Settings"
};

function openSection(sectionName) {
    const section = document.getElementById(
        `section-${sectionName}`
    );

    if (!section || !sectionTitles[sectionName]) {
        sectionName = "dashboard";
    }

    document.querySelectorAll(".admin-section").forEach(item => {
        item.classList.remove("active");
    });

    document.querySelectorAll(".admin-nav-link").forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.section === sectionName
        );
    });

    document.getElementById(
        `section-${sectionName}`
    ).classList.add("active");

    elements.pageHeading.textContent =
        sectionTitles[sectionName];

    elements.sidebar.classList.remove("open");

    if (sectionName === "movies") {
        loadAllMovies().catch(console.error);
    }

    if (sectionName === "series") {
        loadAllSeries().catch(console.error);
    }

    if (sectionName === "dashboard") {
        loadStatistics().catch(console.error);
        loadRecentMovies().catch(console.error);
    }

    history.replaceState(
        null,
        "",
        `#${sectionName}`
    );
}

document.querySelectorAll("[data-section]").forEach(link => {
    link.addEventListener("click", event => {
        event.preventDefault();

        const section = link.dataset.section;
        openSection(section);
    });
});

elements.sidebarToggle?.addEventListener("click", () => {
    elements.sidebar.classList.toggle("open");
});

/* =========================================
   LOGOUT
========================================= */

elements.logout?.addEventListener("click", async () => {
    elements.logout.disabled = true;
    elements.logout.textContent = "Signing out...";

    try {
        const { error } = await supabase.auth.signOut();

        if (error) throw error;

        window.location.replace("login.html");

    } catch (error) {
        console.error("Logout error:", error);

        elements.logout.disabled = false;
        elements.logout.textContent = "↪ Sign out";

        alert("Unable to sign out. Please try again.");
    }
});

/* =========================================
   INITIALIZE ADMIN ROOM
========================================= */

async function initializeAdmin() {
    const authorized = await verifyAdmin();

    if (!authorized) return;

    try {
        await Promise.all([
            loadStatistics(),
            loadRecentMovies()
        ]);

        const initialSection =
            window.location.hash.replace("#", "");

        openSection(
            sectionTitles[initialSection]
                ? initialSection
                : "dashboard"
        );

    } catch (error) {
        console.error("Admin dashboard initialization:", error);

        elements.databaseStatus.textContent = "Error";

        // Keep the authenticated admin dashboard accessible
        // even if a statistics query fails.
    }
}


/* =========================================
   TMDB ADMIN MOVIE SEARCH
========================================= */

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/";

const tmdbSearchForm = $("#tmdbSearchForm");
const tmdbResults = $("#tmdbResults");
const tmdbMessage = $("#tmdbSearchMessage");
const tmdbSearchButton = $("#tmdbSearchButton");

function setTMDBMessage(message, type = "info") {
    tmdbMessage.textContent = message;
    tmdbMessage.dataset.type = type;
}

function getTMDBImage(path, size = "w500") {
    return path
        ? `${TMDB_IMAGE_BASE}${size}${path}`
        : "";
}

async function searchTMDBMovies(query, year) {
    const {
        data: { session },
        error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
    }

    const { data, error } = await supabase.functions.invoke(
        "tmdb-admin-search",
        {
            body: { query, year }
        }
    );

    if (error) {
        throw new Error(error.message || "TMDB search failed.");
    }

    if (!data?.success) {
        throw new Error(data?.error || "Unable to search TMDB.");
    }

    return data.results || [];
}

function renderTMDBMovies(movies) {
    if (!movies.length) {
        tmdbResults.innerHTML =
            `<p class="panel-note">No matching movies found.</p>`;
        return;
    }

    tmdbResults.innerHTML = movies.map(movie => {
        const title = escapeHTML(movie.title || "Untitled");
        const year = movie.release_date
            ? movie.release_date.slice(0, 4)
            : "Unknown year";

        const poster = getTMDBImage(movie.poster_path);

        return `
            <button
                type="button"
                class="tmdb-result-card"
                data-tmdb-movie="${Number(movie.id)}"
            >
                <img
                    src="${poster || "assets/images/movie-placeholder.jpg"}"
                    alt="${title}"
                    loading="lazy"
                >

                <div class="tmdb-result-info">
                    <strong>${title}</strong>
                    <small>${escapeHTML(year)}</small>
                    <small>Rating: ${Number(movie.vote_average || 0).toFixed(1)}/10</small>
                </div>
            </button>
        `;
    }).join("");

    window.cinevaTMDBResults = movies;
}

tmdbSearchForm?.addEventListener("submit", async event => {
    event.preventDefault();

    const query = $("#tmdbQuery").value.trim();
    const year = $("#tmdbYear").value.trim();

    if (query.length < 2) {
        setTMDBMessage("Enter at least two characters.", "error");
        return;
    }

    tmdbSearchButton.disabled = true;
    tmdbSearchButton.textContent = "Searching...";
    tmdbResults.innerHTML = "";

    try {
        const movies = await searchTMDBMovies(query, year);

        renderTMDBMovies(movies);

        setTMDBMessage(
            `${movies.length} matching results found.`,
            "success"
        );

    } catch (error) {
        console.error(error);
        setTMDBMessage(error.message, "error");

    } finally {
        tmdbSearchButton.disabled = false;
        tmdbSearchButton.textContent = "Search TMDB";
    }
});

/* =========================================
   SELECT TMDB RESULT
========================================= */

tmdbResults?.addEventListener("click", event => {
    const card = event.target.closest("[data-tmdb-movie]");

    if (!card) return;

    const tmdbId = Number(card.dataset.tmdbMovie);

    const movie = window.cinevaTMDBResults?.find(
        item => Number(item.id) === tmdbId
    );

    if (!movie) return;

    selectTMDBMovie(movie);
});

function selectTMDBMovie(movie) {
    const releaseYear = movie.release_date
        ? movie.release_date.slice(0, 4)
        : "";

    const posterUrl = getTMDBImage(movie.poster_path);
    const backdropUrl = getTMDBImage(movie.backdrop_path, "w1280");

    $("#movieTmdbId").value = movie.id;
    $("#movieTitle").value = movie.title || "";
    $("#movieYear").value = releaseYear;
    $("#movieRating").value = Number(movie.vote_average || 0).toFixed(1);
    $("#movieOverview").value = movie.overview || "";

    $("#moviePosterPath").value = movie.poster_path || "";
    $("#movieBackdropPath").value = movie.backdrop_path || "";

    $("#moviePoster").value = posterUrl;
    $("#movieBackdrop").value = backdropUrl;

    $("#selectedMoviePreview").innerHTML = `
        ${posterUrl
            ? `<img src="${posterUrl}" alt="">`
            : ""}
        <div>
            <strong>${escapeHTML(movie.title || "")}</strong>
            <small>TMDB ID: ${Number(movie.id)}</small>
            <small>${escapeHTML(releaseYear || "Release year unavailable")}</small>
        </div>
    `;

    $("#movieForm").hidden = false;

    $("#movieForm").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    setTMDBMessage(
        "Movie selected. Add your streaming information below.",
        "success"
    );
}

/* =========================================
   CANCEL MOVIE FORM
========================================= */

$("#cancelMovieForm")?.addEventListener("click", () => {
    $("#movieForm").reset();
    $("#movieForm").hidden = true;
    $("#selectedMoviePreview").innerHTML = "";
    setTMDBMessage("Select another movie whenever you're ready.");
});

/* =========================================
   SAVE MOVIE TO SUPABASE
========================================= */

$("#movieForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const button = $("#saveMovieButton");
    const message = $("#movieSaveMessage");

    button.disabled = true;
    button.textContent = "Saving movie...";
    message.textContent = "";

    try {
        const {
            data: { user },
            error: authError
        } = await supabase.auth.getUser();

        if (authError || !user || user.app_metadata?.role !== "admin") {
            throw new Error("Administrator authentication required.");
        }

        const title = $("#movieTitle").value.trim();
        const videoUrl = $("#movieVideoUrl").value.trim();
        const downloadUrl = $("#movieDownloadUrl").value.trim();

        if (!title || !videoUrl) {
            throw new Error("Movie title and watch URL are required.");
        }

        const validHttpUrl = value => {
            if (!value) return true;

            try {
                const url = new URL(value);
                return url.protocol === "https:" || url.protocol === "http:";
            } catch {
                return false;
            }
        };

        if (!validHttpUrl(videoUrl) || !validHttpUrl(downloadUrl)) {
            throw new Error("Enter valid HTTP or HTTPS streaming/download links.");
        }

        const tmdbId = Number($("#movieTmdbId").value);

        if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
            throw new Error("Select a valid movie from TMDB first.");
        }

        // Only insert the fields managed by this form.
        // User-provided streaming and translator values are kept separate
        // from TMDB metadata.
        const movieRecord = {
            title,
            tmdb_id: tmdbId,
            category: $("#movieCategory").value,
            year: $("#movieYear").value
                ? Number($("#movieYear").value)
                : null,
            release_date: $("#movieYear").value
                ? `${$("#movieYear").value}-01-01`
                : null,
            vote_average: Number($("#movieRating").value || 0),
            rating: Number($("#movieRating").value || 0),
            runtime: Number($("#movieRuntime").value || 0) || null,
            overview: $("#movieOverview").value.trim(),
            description: $("#movieOverview").value.trim(),
            poster_path: $("#moviePosterPath").value || null,
            backdrop_path: $("#movieBackdropPath").value || null,
            poster: $("#moviePoster").value.trim() || null,
            backdrop: $("#movieBackdrop").value.trim() || null,
            video_url: videoUrl,
            download_url: downloadUrl || null,
            translator: $("#movieTranslator").value.trim() || null,
            language: $("#movieLanguage").value.trim() || null,
            quality: $("#movieQuality").value || null,
            featured: $("#movieFeatured").checked,
            is_active: true
        };

        // Duplicate protection by TMDB ID.
        const { data: existing, error: duplicateError } = await supabase
            .from(APP_CONFIG.moviesTable)
            .select("id")
            .eq("tmdb_id", tmdbId)
            .limit(1);

        if (duplicateError) throw duplicateError;

        if (existing?.length) {
            throw new Error("This movie already exists in your database.");
        }

        const { error: insertError } = await supabase
            .from(APP_CONFIG.moviesTable)
            .insert(movieRecord);

        if (insertError) throw insertError;

        message.textContent = "Movie successfully added to CINEVA!";
        message.dataset.type = "success";

        $("#movieForm").reset();
        $("#movieForm").hidden = true;
        $("#selectedMoviePreview").innerHTML = "";

        await Promise.all([
            loadStatistics(),
            loadRecentMovies()
        ]);

    } catch (error) {
        console.error("Movie save error:", error);

        message.textContent = error.message || "Unable to save movie.";
        message.dataset.type = "error";

    } finally {
        button.disabled = false;
        button.textContent = "Save Movie to Supabase";
    }
});

// START ADMIN ROOM
initializeAdmin();

