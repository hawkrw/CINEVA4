
/* =========================================
   CINEVA PRO — SUPABASE DATABASE SYSTEM
   Reliable data fetching and error handling
========================================= */

import { supabase, APP_CONFIG } from "./config.js";

/* =========================================
   01. DATABASE ERROR HANDLING
========================================= */

function handleError(label, error) {
    if (!error) return;

    console.error(`CINEVA ${label}:`, error);

    throw new Error(
        `${label}: ${error.message || "Database request failed."}`,
        { cause: error }
    );
}

/* =========================================
   02. COMMON HELPERS
========================================= */

function safeLimit(value, fallback = 20, maximum = 100) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 1) {
        return fallback;
    }

    return Math.min(Math.floor(number), maximum);
}

function sortByNewest(items) {
    return [...items].sort((a, b) => {
        const dateA = Date.parse(a.created_at || "") || 0;
        const dateB = Date.parse(b.created_at || "") || 0;

        return dateB - dateA;
    });
}

function combineContent(movies, series) {
    return sortByNewest([
        ...(movies || []).map(item => ({
            ...item,
            content_type: "movie"
        })),

        ...(series || []).map(item => ({
            ...item,
            content_type: "series"
        }))
    ]);
}

/* =========================================
   03. FETCH LATEST MOVIES
========================================= */

export async function getLatestMovies(
    limit = APP_CONFIG.latestLimit
) {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(safeLimit(limit));

    handleError("Latest movies error", error);

    return data || [];
}

/* =========================================
   04. FETCH ALL MOVIES
========================================= */

export async function getAllMovies() {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

    handleError("Movies error", error);

    return data || [];
}

/* =========================================
   05. FETCH FEATURED MOVIES
========================================= */

export async function getFeaturedMovies(
    limit = APP_CONFIG.featuredLimit
) {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .eq("is_active", true)
        .eq("is_featured", true)
        .order("created_at", { ascending: false })
        .limit(safeLimit(limit, 10));

    handleError("Featured movies error", error);

    return data || [];
}

/* =========================================
   06. FETCH CONTENT BY CATEGORY
   Includes movies AND series
========================================= */

export async function getMoviesByCategory(
    category,
    limit = 20
) {
    if (!category || !String(category).trim()) {
        return [];
    }

    const safeCategory = String(category).trim();
    const resultLimit = safeLimit(limit);

    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("*")
            .eq("is_active", true)
            .ilike("category", safeCategory)
            .order("created_at", { ascending: false })
            .limit(resultLimit),

        supabase
            .from(APP_CONFIG.seriesTable)
            .select("*")
            .eq("is_active", true)
            .ilike("category", safeCategory)
            .order("created_at", { ascending: false })
            .limit(resultLimit)
    ]);

    handleError("Category movies error", moviesResult.error);
    handleError("Category series error", seriesResult.error);

    return combineContent(
        moviesResult.data,
        seriesResult.data
    ).slice(0, resultLimit);
}

/* =========================================
   07. FETCH ALL SERIES
========================================= */

export async function getAllSeries() {
    const { data, error } = await supabase
        .from(APP_CONFIG.seriesTable)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

    handleError("Series error", error);

    return data || [];
}

/* =========================================
   08. FETCH LATEST SERIES
========================================= */

export async function getLatestSeries(limit = 20) {
    const { data, error } = await supabase
        .from(APP_CONFIG.seriesTable)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(safeLimit(limit));

    handleError("Latest series error", error);

    return data || [];
}

/* =========================================
   09. FETCH SERIES BY CATEGORY
========================================= */

export async function getSeriesByCategory(
    category,
    limit = 20
) {
    if (!category || !String(category).trim()) {
        return [];
    }

    const { data, error } = await supabase
        .from(APP_CONFIG.seriesTable)
        .select("*")
        .eq("is_active", true)
        .ilike("category", String(category).trim())
        .order("created_at", { ascending: false })
        .limit(safeLimit(limit));

    handleError("Series category error", error);

    return data || [];
}

/* =========================================
   10. FETCH ALL CATEGORIES
========================================= */

export async function getCategories() {
    const { data, error } = await supabase
        .from(APP_CONFIG.categoriesTable)
        .select("*")
        .order("name", { ascending: true });

    handleError("Categories error", error);

    return data || [];
}

/* =========================================
   11. FETCH SINGLE MOVIE
========================================= */

export async function getMovieById(id) {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .eq("id", id)
        .maybeSingle();

    handleError("Movie details error", error);

    return data;
}

/* =========================================
   12. FETCH SINGLE SERIES
========================================= */

export async function getSeriesById(id) {
    const { data, error } = await supabase
        .from(APP_CONFIG.seriesTable)
        .select("*")
        .eq("id", id)
        .maybeSingle();

    handleError("Series details error", error);

    return data;
}

/* =========================================
   13. SEARCH MOVIES AND SERIES
========================================= */

export async function searchContent(searchTerm) {
    const term = String(searchTerm || "").trim();

    if (!term) return [];

    const pattern = `%${term}%`;

    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("*")
            .eq("is_active", true)
            .ilike("title", pattern)
            .order("created_at", { ascending: false })
            .limit(20),

        supabase
            .from(APP_CONFIG.seriesTable)
            .select("*")
            .eq("is_active", true)
            .ilike("title", pattern)
            .order("created_at", { ascending: false })
            .limit(20)
    ]);

    handleError("Movie search error", moviesResult.error);
    handleError("Series search error", seriesResult.error);

    return combineContent(
        moviesResult.data,
        seriesResult.data
    );
}

/* =========================================
   14. FETCH LATEST MOVIES AND SERIES
========================================= */

export async function getLatestContent(
    limit = APP_CONFIG.latestLimit
) {
    const safeResultLimit = safeLimit(limit);

    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(safeResultLimit),

        supabase
            .from(APP_CONFIG.seriesTable)
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(safeResultLimit)
    ]);

    handleError("Latest movies error", moviesResult.error);
    handleError("Latest series error", seriesResult.error);

    return combineContent(
        moviesResult.data,
        seriesResult.data
    ).slice(0, safeResultLimit);
}

/* =========================================
   15. FETCH TRENDING MOVIES AND SERIES
   Ranked by real view counts
========================================= */

export async function getTrendingContent(limit = 12) {
    const safeResultLimit = safeLimit(limit, 12, 50);

    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("*")
            .eq("is_active", true)
            .order("views", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(safeResultLimit),

        supabase
            .from(APP_CONFIG.seriesTable)
            .select("*")
            .eq("is_active", true)
            .order("views", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(safeResultLimit)
    ]);

    handleError("Trending movies error", moviesResult.error);
    handleError("Trending series error", seriesResult.error);

    const movies = (moviesResult.data || []).map(item => ({
        ...item,
        views: Number(item.views) || 0
    }));

    const series = (seriesResult.data || []).map(item => ({
        ...item,
        views: Number(item.views) || 0
    }));

    return [...movies, ...series]
        .map(item => ({
            ...item,
            content_type: item.content_type ||
                (series.some(seriesItem => seriesItem.id === item.id)
                    ? "series"
                    : "movie")
        }))
        .sort((a, b) => {
            const difference =
                (Number(b.views) || 0) -
                (Number(a.views) || 0);

            if (difference !== 0) return difference;

            return (
                (Date.parse(b.created_at || "") || 0) -
                (Date.parse(a.created_at || "") || 0)
            );
        })
        .slice(0, safeResultLimit);
}

/* =========================================
   16. FETCH ALL ACTIVE CONTENT
========================================= */

export async function getAllContent() {
    const [movies, series] = await Promise.all([
        getAllMovies(),
        getAllSeries()
    ]);

    return combineContent(movies, series);
}

/* =========================================
   17. FETCH UNIQUE TRANSLATORS
   Movies and series are handled independently
========================================= */

export async function getOurTranslators() {
    const results = await Promise.allSettled([
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("translator")
            .eq("is_active", true)
            .not("translator", "is", null),

        supabase
            .from(APP_CONFIG.seriesTable)
            .select("translator")
            .eq("is_active", true)
            .not("translator", "is", null)
    ]);

    const names = [];

    results.forEach((result, index) => {
        const label = index === 0
            ? "Movie translators"
            : "Series translators";

        if (result.status === "rejected") {
            console.warn(
                `CINEVA ${label} request failed:`,
                result.reason
            );
            return;
        }

        const { data, error } = result.value;

        if (error) {
            console.warn(
                `CINEVA ${label} error:`,
                error.message
            );
            return;
        }

        (data || []).forEach(item => {
            const name = String(item.translator || "").trim();

            if (name) names.push(name);
        });
    });

    if (results.every(result => result.status === "rejected")) {
        throw new Error("Unable to load translator information.");
    }

    return [...new Set(names)].sort(
        (a, b) => a.localeCompare(b)
    );
}

/* =========================================
   18. INITIALIZATION
========================================= */

console.log("CINEVA database functions loaded successfully.");
