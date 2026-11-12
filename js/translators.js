import { getAllContent, getOurTranslatorProfiles } from "./supabase.js";

const params = new URLSearchParams(window.location.search);
const requestedName = params.get("name") || "";

function normalizeName(value = "") {
    return String(value).replace(/\s+/g, " ").trim();
}

function translatorGroup(value = "") {
    const key = normalizeName(value).toLowerCase();
    if (/^gaheza(?:\s+simba)?$/.test(key)) return "gaheza";
    if (/^hakim(?:\s+the\s+(?:prof|mwarimu))?$/.test(key)) return "hakims";
    return key;
}

function displayName(value) {
    const key = translatorGroup(value);
    if (key === "gaheza") return "Gaheza";
    if (key === "hakims") return "Hakim's";
    return normalizeName(value);
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
}

function contentType(item) {
    const value = String(item.content_type || item.media_type || item.type || item.role || "").toLowerCase();
    return ["series", "tv", "show"].includes(value) ? "series" : "movie";
}

function poster(item) {
    const raw = item.poster_url || item.poster || item.poster_image || item.image_url ||
        item.thumbnail_url || item.image || item.cover_image || item.poster_path ||
        item.backdrop_url || item.backdrop || item.banner || item.backdrop_path;
    if (!raw) return "assets/images/movie-placeholder.jpg";
    const value = String(raw).trim();
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/")) return "https://image.tmdb.org/t/p/w500" + value;
    return value;
}

function watchUrl(item) {
    return `watch.html?id=${encodeURIComponent(item.id)}&type=${contentType(item)}`;
}

function card(item) {
    const title = escapeHTML(item.title || "Untitled");
    const year = escapeHTML(item.year || item.release_year || (item.release_date || "").slice(0, 4) || "");
    const type = contentType(item);
    const image = escapeHTML(poster(item));
    const rating = Number(item.rating || item.vote_average || 0);
    return `
      <a class="translator-title-card" href="${watchUrl(item)}">
       <div class="translator-poster"><img src="${image}" alt="${title}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='assets/images/movie-placeholder.jpg'"><span class="translator-type">${type === "series" ? "SERIES" : "MOVIE"}</span></div>
       <div class="translator-title-meta"><h3>${title}</h3><div><span>${year}</span>${rating > 0 ? `<span><i class="fa-solid fa-star"></i> ${rating.toFixed(1)}</span>` : ""}</div></div>
      </a>`;
}

const nameNode = document.getElementById("translatorName");
const avatarNode = document.getElementById("translatorAvatar");
const grid = document.getElementById("translatorGrid");
const empty = document.getElementById("translatorEmpty");
const search = document.getElementById("translatorSearch");
const count = document.getElementById("translatorCount");
const breakdown = document.getElementById("translatorBreakdown");
const selectedGroup = translatorGroup(requestedName);

if (!requestedName.trim()) {
    window.location.replace("index.html#our-translators");
} else {
    const name = displayName(requestedName);
    document.title = `${name} — Translated Movies & Series | CINEVA`;
    nameNode.textContent = name;
    avatarNode.textContent = name.charAt(0).toUpperCase();
    document.querySelector('meta[name="description"]')?.setAttribute("content", `Browse movies and TV series translated by ${name} on CINEVA.`);

    // Use the exact profile image uploaded from CINEVA PRO.
    getOurTranslatorProfiles().then(profiles => {
        const profile = profiles.find(item => translatorGroup(item.name) === selectedGroup);
        if (!profile?.profile_image_url || !avatarNode) return;
        const image = document.createElement("img");
        image.src = profile.profile_image_url;
        image.alt = name + " profile photo";
        image.loading = "eager";
        image.decoding = "async";
        image.onerror = () => {
            image.remove();
            avatarNode.textContent = name.charAt(0).toUpperCase();
        };
        avatarNode.replaceChildren(image);
    }).catch(error => {
        console.warn("Translator profile photo unavailable:", error);
    });

    let collection = [];

    function render() {
        const term = search.value.trim().toLowerCase();
        const filtered = collection.filter(item => String(item.title || "").toLowerCase().includes(term));
        grid.innerHTML = filtered.map(card).join("");
        empty.hidden = filtered.length > 0;
        if (!filtered.length) grid.innerHTML = "";
    }

    getAllContent().then(items => {
        collection = items.filter(item => translatorGroup(item.translator || item.translated_by) === selectedGroup);
        const movies = collection.filter(item => contentType(item) === "movie").length;
        const series = collection.length - movies;
        count.textContent = collection.length;
        breakdown.textContent = `${movies} movies · ${series} series`;
        document.getElementById("translatorDescription").textContent =
            `Explore ${collection.length} movies and series translated by ${name}.`;
        render();
    }).catch(error => {
        console.error("Translator collection failed:", error);
        grid.innerHTML = '<div class="translator-page-state">Could not load this translator collection. Please refresh and try again.</div>';
    });

    search.addEventListener("input", render);
}
