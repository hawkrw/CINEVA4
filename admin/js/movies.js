
import { supabase } from "../../js/config.js";

/* =========================================
   CINEVA PRO - MOVIE MANAGEMENT
========================================= */

const TABLE = "movies";
const ITEMS_PER_PAGE = 10;

let movies = [];
let currentPage = 1;
let editingMovieId = null;
let isSaving = false;

/* =========================================
   DOM ELEMENTS
========================================= */

const elements = {
    tableBody: document.getElementById("moviesTableBody"),
    search: document.getElementById("movieSearch"),
    categoryFilter: document.getElementById("movieCategoryFilter"),
    pagination: document.getElementById("moviesPagination"),

    modal: document.getElementById("movieModal"),
    modalTitle: document.getElementById("movieModalTitle"),
    form: document.getElementById("movieForm"),
    message: document.getElementById("movieFormMessage"),

    addButton: document.getElementById("addMovieBtn"),
    closeButton: document.getElementById("closeMovieModal"),
    cancelButton: document.getElementById("cancelMovieForm"),
    saveButton: document.getElementById("saveMovieBtn"),

    id: document.getElementById("movieId"),
    title: document.getElementById("movieTitle"),
    category: document.getElementById("movieCategory"),
    year: document.getElementById("movieYear"),
    rating: document.getElementById("movieRating"),
    overview: document.getElementById("movieOverview"),
    poster: document.getElementById("moviePoster"),
    backdrop: document.getElementById("movieBackdrop"),
    watchUrl: document.getElementById("movieWatchUrl"),
    downloadUrl: document.getElementById("movieDownloadUrl"),
    translator: document.getElementById("movieTranslator"),
    featured: document.getElementById("movieFeatured"),
    active: document.getElementById("movieActive")
};

/* =========================================
   HELPERS
========================================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function showMessage(message = "", type = "") {
    if (!elements.message) return;

    elements.message.textContent = message;
    elements.message.className = "";

    if (type) {
        elements.message.classList.add(type);
    }
}

function setSaving(saving) {
    isSaving = saving;

    if (elements.saveButton) {
        elements.saveButton.disabled = saving;
        elements.saveButton.textContent = saving
            ? "Saving..."
            : editingMovieId
                ? "Update Movie"
                : "Save Movie";
    }
}

function formatDate(date) {
    if (!date) return "—";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) return "—";

    return parsed.toLocaleDateString();
}

/* =========================================
   LOAD MOVIES
========================================= */

async function loadMovies() {
    if (!elements.tableBody) return;

    elements.tableBody.innerHTML = `
        <tr>
            <td colspan="6">Loading movies...</td>
        </tr>
    `;

    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select(`
                id,
                title,
                category,
                created_at,
                views,
                download_links,
                translator,
                featured,
                is_active,
                video_url,
                poster,
                poster_path,
                backdrop,
                backdrop_path,
                overview,
                rating,
                vote_average,
                release_date,
                year,
                download_url
            `)
            .order("created_at", { ascending: false });

        if (error) throw error;

        movies = data || [];
        currentPage = 1;

        renderMovies();

        console.log(`CINEVA: Loaded ${movies.length} movies.`);

    } catch (error) {
        console.error("Movie loading error:", error);

        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    Unable to load movies: ${escapeHTML(error.message)}
                </td>
            </tr>
        `;
    }
}

/* =========================================
   FILTER MOVIES
========================================= */

function getFilteredMovies() {
    const searchTerm = elements.search?.value
        .trim()
        .toLowerCase() || "";

    const category = elements.categoryFilter?.value || "";

    return movies.filter(movie => {
        const matchesSearch = (movie.title || "")
            .toLowerCase()
            .includes(searchTerm);

        const matchesCategory = !category ||
            movie.category === category;

        return matchesSearch && matchesCategory;
    });
}

/* =========================================
   RENDER MOVIES TABLE
========================================= */

function renderMovies() {
    if (!elements.tableBody) return;

    const filtered = getFilteredMovies();

    const totalPages = Math.max(
        1,
        Math.ceil(filtered.length / ITEMS_PER_PAGE)
    );

    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * ITEMS_PER_PAGE;

    const pageMovies = filtered.slice(
        start,
        start + ITEMS_PER_PAGE
    );

    if (!pageMovies.length) {
        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="6">No movies found.</td>
            </tr>
        `;

        renderPagination(0, 1);
        return;
    }

    elements.tableBody.innerHTML = pageMovies.map(movie => {
        const poster = movie.poster || movie.poster_path || "";
        const year = movie.year ||
            (movie.release_date
                ? movie.release_date.substring(0, 4)
                : "—");

        return `
            <tr>
                <td>
                    <div class="movie-table-info">
                        ${
                            poster
                                ? `<img src="${escapeHTML(poster)}"
                                    alt=""
                                    class="movie-table-poster"
                                    loading="lazy"
                                    onerror="this.style.display='none'">`
                                : `<div class="movie-table-poster placeholder">🎬</div>`
                        }

                        <div>
                            <strong>${escapeHTML(movie.title)}</strong>
                            <small>${escapeHTML(movie.translator || "No translator")}</small>
                        </div>
                    </div>
                </td>

                <td>${escapeHTML(movie.category || "Uncategorized")}</td>

                <td>${escapeHTML(year)}</td>

                <td>${Number(movie.views || 0).toLocaleString()}</td>

                <td>
                    <span class="status-badge ${
                        movie.is_active ? "active" : "inactive"
                    }">
                        ${movie.is_active ? "Active" : "Inactive"}
                    </span>
                </td>

                <td>
                    <div class="table-actions">
                        <button
                            type="button"
                            class="edit-movie-btn"
                            data-action="edit"
                            data-id="${escapeHTML(movie.id)}">
                            Edit
                        </button>

                        <button
                            type="button"
                            class="delete-movie-btn"
                            data-action="delete"
                            data-id="${escapeHTML(movie.id)}">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    renderPagination(filtered.length, totalPages);
}

/* =========================================
   PAGINATION
========================================= */

function renderPagination(total, totalPages) {
    if (!elements.pagination) return;

    if (total === 0) {
        elements.pagination.innerHTML = "";
        return;
    }

    elements.pagination.innerHTML = `
        <div class="pagination-info">
            ${total} movie${total === 1 ? "" : "s"} found
            · Page ${currentPage} of ${totalPages}
        </div>

        <div class="pagination-buttons">
            <button
                type="button"
                data-page="${currentPage - 1}"
                ${currentPage === 1 ? "disabled" : ""}>
                Previous
            </button>

            <button
                type="button"
                data-page="${currentPage + 1}"
                ${currentPage === totalPages ? "disabled" : ""}>
                Next
            </button>
        </div>
    `;
}

/* =========================================
   OPEN MODAL
========================================= */

function openMovieModal(movie = null) {
    if (!elements.modal || !elements.form) return;

    elements.form.reset();

    editingMovieId = movie?.id || null;

    elements.id.value = movie?.id || "";

    elements.modalTitle.textContent = movie
        ? "Edit Movie"
        : "Add New Movie";

    elements.saveButton.textContent = movie
        ? "Update Movie"
        : "Save Movie";

    if (movie) {
        elements.title.value = movie.title || "";
        elements.category.value = movie.category || "";
        elements.year.value = movie.year || "";
        elements.rating.value = movie.rating ?? "";
        elements.overview.value = movie.overview || "";

        elements.poster.value =
            movie.poster || movie.poster_path || "";

        elements.backdrop.value =
            movie.backdrop || movie.backdrop_path || "";

        elements.watchUrl.value = movie.video_url || "";
        elements.downloadUrl.value = movie.download_url || "";
        elements.translator.value = movie.translator || "";

        elements.featured.checked = !!movie.featured;
        elements.active.checked = movie.is_active !== false;
    } else {
        elements.active.checked = true;
        elements.featured.checked = false;
    }

    showMessage();

    elements.modal.classList.add("active");
    document.body.style.overflow = "hidden";
}

/* =========================================
   CLOSE MODAL
========================================= */

function closeMovieModal() {
    if (!elements.modal) return;

    elements.modal.classList.remove("active");
    document.body.style.overflow = "";

    editingMovieId = null;

    elements.form?.reset();
    showMessage();
}

/* =========================================
   SAVE MOVIE
========================================= */

async function saveMovie(event) {
    event.preventDefault();

    if (isSaving) return;

    const title = elements.title.value.trim();
    const category = elements.category.value;

    if (!title || !category) {
        showMessage("Movie title and category are required.", "error");
        return;
    }

    const yearValue = elements.year.value.trim();
    const ratingValue = elements.rating.value.trim();

    const year = yearValue ? Number(yearValue) : null;
    const rating = ratingValue ? Number(ratingValue) : null;

    if (
        year !== null &&
        (!Number.isInteger(year) || year < 1900 || year > 2100)
    ) {
        showMessage("Enter a valid release year.", "error");
        return;
    }

    if (
        rating !== null &&
        (!Number.isFinite(rating) || rating < 0 || rating > 10)
    ) {
        showMessage("Rating must be between 0 and 10.", "error");
        return;
    }

    const payload = {
        title,
        category,
        year,
        overview: elements.overview.value.trim() || null,
        rating,
        poster: elements.poster.value.trim() || null,
        backdrop: elements.backdrop.value.trim() || null,

        // Your Watch and Download links remain independent.
        video_url: elements.watchUrl.value.trim() || null,
        download_url: elements.downloadUrl.value.trim() || null,

        translator: elements.translator.value.trim() || null,
        featured: elements.featured.checked,
        is_active: elements.active.checked,

        updated_at: new Date().toISOString()
    };

    setSaving(true);
    showMessage();

    try {
        let result;

        if (editingMovieId) {
            // Update only the fields managed by this form.
            // download_links and other existing metadata are preserved.
            result = await supabase
                .from(TABLE)
                .update(payload)
                .eq("id", editingMovieId)
                .select("id")
                .single();
        } else {
            // Do not supply download_links.
            // The database default/null value remains untouched.
            result = await supabase
                .from(TABLE)
                .insert(payload)
                .select("id")
                .single();
        }

        if (result.error) throw result.error;

        showMessage(
            editingMovieId
                ? "Movie updated successfully!"
                : "Movie added successfully!",
            "success"
        );

        await loadMovies();

        setTimeout(() => {
            closeMovieModal();
        }, 700);

    } catch (error) {
        console.error("Movie save error:", error);

        showMessage(
            error.message || "Unable to save movie.",
            "error"
        );
    } finally {
        setSaving(false);
    }
}

/* =========================================
   EDIT MOVIE
========================================= */

function editMovie(id) {
    const movie = movies.find(item => item.id === id);

    if (!movie) {
        alert("Movie not found.");
        return;
    }

    openMovieModal(movie);
}

/* =========================================
   DELETE MOVIE
========================================= */

async function deleteMovie(id) {
    const movie = movies.find(item => item.id === id);

    if (!movie) return;

    const confirmed = window.confirm(
        `Are you sure you want to permanently delete "${movie.title}"?`
    );

    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from(TABLE)
            .delete()
            .eq("id", id);

        if (error) throw error;

        await loadMovies();

        console.log("Movie deleted:", movie.title);

    } catch (error) {
        console.error("Movie deletion error:", error);

        alert(
            error.message || "Unable to delete this movie."
        );
    }
}

/* =========================================
   EVENT LISTENERS
========================================= */

function initializeMovieEvents() {

    elements.addButton?.addEventListener("click", () => {
        openMovieModal();
    });

    elements.closeButton?.addEventListener("click", closeMovieModal);

    elements.cancelButton?.addEventListener("click", closeMovieModal);

    elements.form?.addEventListener("submit", saveMovie);

    elements.search?.addEventListener("input", () => {
        currentPage = 1;
        renderMovies();
    });

    elements.categoryFilter?.addEventListener("change", () => {
        currentPage = 1;
        renderMovies();
    });

    elements.tableBody?.addEventListener("click", event => {
        const button = event.target.closest("[data-action]");

        if (!button) return;

        const id = button.dataset.id;
        const action = button.dataset.action;

        if (action === "edit") {
            editMovie(id);
        }

        if (action === "delete") {
            deleteMovie(id);
        }
    });

    elements.pagination?.addEventListener("click", event => {
        const button = event.target.closest("[data-page]");

        if (!button || button.disabled) return;

        const page = Number(button.dataset.page);

        if (!Number.isInteger(page) || page < 1) return;

        currentPage = page;
        renderMovies();
    });

    elements.modal?.addEventListener("click", event => {
        if (event.target === elements.modal) {
            closeMovieModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (
            event.key === "Escape" &&
            elements.modal?.classList.contains("active")
        ) {
            closeMovieModal();
        }
    });
}

/* =========================================
   INITIALIZE
========================================= */

async function initializeMovies() {
    if (!elements.tableBody) {
        console.warn("CINEVA: Movie management section not found.");
        return;
    }

    initializeMovieEvents();

    await loadMovies();

    console.log("CINEVA PRO Movie Management initialized.");
}

initializeMovies();
