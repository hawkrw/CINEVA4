
import { supabase } from "../../js/config.js";

const $ = (selector) => document.querySelector(selector);

const PAGE_SIZE = 10;

let movies = [];
let currentPage = 1;
let editingMovie = null;

const elements = {
    table: $("#moviesTableBody"),
    search: $("#movieSearch"),
    category: $("#movieCategoryFilter"),
    pagination: $("#moviesPagination"),

    modal: $("#movieModal"),
    form: $("#movieForm"),
    modalTitle: $("#movieModalTitle"),
    message: $("#movieFormMessage"),
    saveButton: $("#saveMovieBtn"),

    addButton: $("#addMovieBtn"),
    closeButton: $("#closeMovieModal"),
    cancelButton: $("#cancelMovieForm")
};

/* =====================================
   HELPERS
===================================== */

function showMessage(message, type = "") {
    if (!elements.message) return;

    elements.message.textContent = message;
    elements.message.className = type;
}

function getValue(id) {
    return document.getElementById(id)?.value.trim() || "";
}

function setValue(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.value = value ?? "";
    }
}

function setCheckbox(id, checked) {
    const element = document.getElementById(id);

    if (element) {
        element.checked = Boolean(checked);
    }
}

function escapeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

/* =====================================
   LOAD MOVIES
===================================== */

async function loadMovies() {
    if (!elements.table) return;

    elements.table.innerHTML = `
        <tr>
            <td colspan="6">Loading movies...</td>
        </tr>
    `;

    const { data, error } = await supabase
        .from("movies")
        .select(`
            id,
            title,
            category,
            year,
            views,
            poster,
            poster_path,
            backdrop,
            backdrop_path,
            overview,
            rating,
            vote_average,
            video_url,
            download_url,
            download_links,
            translator,
            featured,
            is_featured,
            is_active,
            created_at
        `)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Loading movies failed:", error);

        elements.table.innerHTML = `
            <tr>
                <td colspan="6">
                    Unable to load movies. Check your Supabase permissions.
                </td>
            </tr>
        `;

        return;
    }

    movies = data || [];
    currentPage = 1;

    renderMovies();
}

/* =====================================
   FILTER MOVIES
===================================== */

function getFilteredMovies() {
    const search = elements.search?.value.trim().toLowerCase() || "";
    const category = elements.category?.value || "";

    return movies.filter(movie => {
        const matchesSearch =
            (movie.title || "").toLowerCase().includes(search);

        const matchesCategory =
            !category || movie.category === category;

        return matchesSearch && matchesCategory;
    });
}

/* =====================================
   RENDER MOVIE TABLE
===================================== */

function renderMovies() {
    if (!elements.table) return;

    const filtered = getFilteredMovies();

    const totalPages = Math.max(
        1,
        Math.ceil(filtered.length / PAGE_SIZE)
    );

    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageMovies = filtered.slice(start, start + PAGE_SIZE);

    elements.table.replaceChildren();

    if (!pageMovies.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 6;
        cell.textContent = "No movies found.";

        row.appendChild(cell);
        elements.table.appendChild(row);

        renderPagination(0, 1);
        return;
    }

    pageMovies.forEach(movie => {
        const row = document.createElement("tr");

        const movieCell = document.createElement("td");
        const poster = document.createElement("img");

        const posterUrl = movie.poster ||
            movie.poster_path ||
            "";

        poster.src = posterUrl.startsWith("/")
            ? `https://image.tmdb.org/t/p/w92${posterUrl}`
            : posterUrl;

        poster.alt = "";
        poster.className = "movie-table-poster";
        poster.onerror = () => {
            poster.style.display = "none";
        };

        const title = document.createElement("strong");
        title.textContent = movie.title || "Untitled";

        movieCell.append(poster, title);

        const categoryCell = document.createElement("td");
        categoryCell.textContent = movie.category || "Uncategorized";

        const yearCell = document.createElement("td");
        yearCell.textContent = movie.year || "—";

        const viewsCell = document.createElement("td");
        viewsCell.textContent = Number(movie.views || 0).toLocaleString();

        const statusCell = document.createElement("td");
        const status = document.createElement("span");

        status.className = "recent-badge";
        status.textContent = movie.is_active === false
            ? "Inactive"
            : "Active";

        statusCell.appendChild(status);

        const actionsCell = document.createElement("td");

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "secondary-button";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => editMovie(movie.id));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "secondary-button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => deleteMovie(movie.id));

        actionsCell.append(editButton, deleteButton);

        row.append(
            movieCell,
            categoryCell,
            yearCell,
            viewsCell,
            statusCell,
            actionsCell
        );

        elements.table.appendChild(row);
    });

    renderPagination(filtered.length, totalPages);
}

/* =====================================
   PAGINATION
===================================== */

function renderPagination(total, totalPages) {
    if (!elements.pagination) return;

    elements.pagination.replaceChildren();

    const info = document.createElement("span");
    info.textContent = `${total} movie(s) · Page ${currentPage} of ${totalPages}`;

    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.disabled = currentPage <= 1;

    previous.addEventListener("click", () => {
        currentPage--;
        renderMovies();
    });

    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.disabled = currentPage >= totalPages;

    next.addEventListener("click", () => {
        currentPage++;
        renderMovies();
    });

    elements.pagination.append(info, previous, next);
}

/* =====================================
   MODAL CONTROLS
===================================== */

function openMovieModal() {
    elements.modal?.classList.add("active");
}

function closeMovieModal() {
    elements.modal?.classList.remove("active");
    elements.form?.reset();

    editingMovie = null;

    setValue("movieId", "");

    if (elements.modalTitle) {
        elements.modalTitle.textContent = "Add New Movie";
    }

    if (elements.saveButton) {
        elements.saveButton.textContent = "Save Movie";
    }

    showMessage("");
}

/* =====================================
   ADD MOVIE
===================================== */

function prepareNewMovie() {
    editingMovie = null;

    elements.form?.reset();

    setValue("movieId", "");
    setCheckbox("movieActive", true);

    if (elements.modalTitle) {
        elements.modalTitle.textContent = "Add New Movie";
    }

    if (elements.saveButton) {
        elements.saveButton.textContent = "Save Movie";
    }

    showMessage("");
    openMovieModal();
}

/* =====================================
   EDIT MOVIE
===================================== */

function editMovie(id) {
    const movie = movies.find(item => String(item.id) === String(id));

    if (!movie) return;

    editingMovie = movie;

    setValue("movieId", movie.id);
    setValue("movieTitle", movie.title);
    setValue("movieCategory", movie.category);
    setValue("movieYear", movie.year);

    setValue("movieRating", movie.rating ?? movie.vote_average);
    setValue("movieOverview", movie.overview);

    setValue("moviePoster", movie.poster || movie.poster_path);
    setValue("movieBackdrop", movie.backdrop || movie.backdrop_path);

    setValue("movieWatchUrl", movie.video_url);
    setValue("movieDownloadUrl", movie.download_url);

    setValue("movieTranslator", movie.translator);

    setCheckbox("movieFeatured", movie.featured || movie.is_featured);
    setCheckbox("movieActive", movie.is_active !== false);

    if (elements.modalTitle) {
        elements.modalTitle.textContent = "Edit Movie";
    }

    if (elements.saveButton) {
        elements.saveButton.textContent = "Update Movie";
    }

    showMessage("");
    openMovieModal();
}

/* =====================================
   SAVE MOVIE
===================================== */

async function saveMovie(event) {
    event.preventDefault();

    if (!elements.saveButton) return;

    const title = getValue("movieTitle");
    const category = getValue("movieCategory");

    if (!title || !category) {
        showMessage("Movie title and category are required.", "error");
        return;
    }

    const yearValue = getValue("movieYear");
    const ratingValue = getValue("movieRating");

    const movieData = {
        title,
        category,
        year: yearValue ? Number(yearValue) : null,
        overview: getValue("movieOverview") || null,
        rating: ratingValue ? Number(ratingValue) : null,

        poster: getValue("moviePoster") || null,
        backdrop: getValue("movieBackdrop") || null,

        video_url: getValue("movieWatchUrl") || null,
        download_url: getValue("movieDownloadUrl") || null,

        translator: getValue("movieTranslator") || null,

        featured: $("#movieFeatured")?.checked || false,
        is_active: $("#movieActive")?.checked ?? true
    };

    elements.saveButton.disabled = true;
    elements.saveButton.textContent = "Saving...";

    showMessage("Saving movie...");

    try {
        let result;

        if (editingMovie) {
            result = await supabase
                .from("movies")
                .update(movieData)
                .eq("id", editingMovie.id);
        } else {
            result = await supabase
                .from("movies")
                .insert(movieData);
        }

        if (result.error) throw result.error;

        showMessage(
            editingMovie
                ? "Movie updated successfully."
                : "Movie added successfully.",
            "success"
        );

        await loadMovies();

        setTimeout(closeMovieModal, 700);

    } catch (error) {
        console.error("Saving movie failed:", error);

        showMessage(
            error.message || "Unable to save movie.",
            "error"
        );

    } finally {
        elements.saveButton.disabled = false;

        elements.saveButton.textContent = editingMovie
            ? "Update Movie"
            : "Save Movie";
    }
}

/* =====================================
   DELETE MOVIE
===================================== */

async function deleteMovie(id) {
    const movie = movies.find(item => String(item.id) === String(id));

    if (!movie) return;

    const confirmed = window.confirm(
        `Are you sure you want to delete "${movie.title}"? This cannot be undone.`
    );

    if (!confirmed) return;

    const { error } = await supabase
        .from("movies")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Movie deletion failed:", error);

        window.alert(
            "Unable to delete movie. Check your database permissions."
        );

        return;
    }

    await loadMovies();
}

/* =====================================
   INITIALIZE MOVIE MANAGEMENT
===================================== */

function initializeMovies() {
    if (!elements.table || !elements.form) return;

    elements.addButton?.addEventListener("click", prepareNewMovie);

    elements.closeButton?.addEventListener("click", closeMovieModal);

    elements.cancelButton?.addEventListener("click", closeMovieModal);

    elements.form.addEventListener("submit", saveMovie);

    elements.search?.addEventListener("input", () => {
        currentPage = 1;
        renderMovies();
    });

    elements.category?.addEventListener("change", () => {
        currentPage = 1;
        renderMovies();
    });
    elements.modal?.addEventListener("click", event => {
        if (event.target === elements.modal) {
            closeMovieModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeMovieModal();
        }
    });

    loadMovies();
}

initializeMovies();
