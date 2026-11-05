
/* =========================================
   CINEVA — SUPABASE DATABASE SYSTEM
========================================= */

import { supabase, APP_CONFIG } from "./config.js";

// =========================================
// COMMON ERROR HANDLER
// =========================================

function handleError(label, error) {
    if (error) {
        console.error(`CINEVA ${label}:`, error.message);
        return true;
    }

    return false;
}

// =========================================
// FETCH LATEST MOVIES
// =========================================

export async function getLatestMovies(
    limit = APP_CONFIG.latestLimit
) {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (handleError("Latest movies error", error)) return [];

    return data || [];
}

// =========================================
// FETCH ALL MOVIES
// =========================================

export async function getAllMovies() {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

    if (handleError("Movies error", error)) return [];

    return data || [];
}

// =========================================
// FETCH FEATURED MOVIES
// =========================================

export async function getFeaturedMovies(
    limit = APP_CONFIG.featuredLimit
) {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .eq("is_active", true)
        .eq("is_featured", true)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (handleError("Featured movies error", error)) return [];

    return data || [];
}

// =========================================
// FETCH MOVIES BY CATEGORY
// =========================================

export async function getMoviesByCategory(
    category,
    limit = 20
) {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .eq("is_active", true)
        .ilike("category", category)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (handleError("Movie category error", error)) return [];

    return data || [];
}

// =========================================
// FETCH ALL SERIES
// =========================================

export async function getAllSeries() {
    const { data, error } = await supabase
        .from(APP_CONFIG.seriesTable)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

    if (handleError("Series error", error)) return [];

    return data || [];
}

// =========================================
// FETCH LATEST SERIES
// =========================================

export async function getLatestSeries(limit = 20) {
    const { data, error } = await supabase
        .from(APP_CONFIG.seriesTable)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (handleError("Latest series error", error)) return [];

    return data || [];
}

// =========================================
// FETCH SERIES BY CATEGORY
// =========================================

export async function getSeriesByCategory(
    category,
    limit = 20
) {
    const { data, error } = await supabase
        .from(APP_CONFIG.seriesTable)
        .select("*")
        .eq("is_active", true)
        .ilike("category", category)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (handleError("Series category error", error)) return [];

    return data || [];
}

// =========================================
// FETCH ALL CATEGORIES
// =========================================

export async function getCategories() {
    const { data, error } = await supabase
        .from(APP_CONFIG.categoriesTable)
        .select("*")
        .order("name", { ascending: true });

    if (handleError("Categories error", error)) return [];

    return data || [];
}

// =========================================
// FETCH SINGLE MOVIE
// =========================================

export async function getMovieById(id) {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (handleError("Movie details error", error)) return null;

    return data;
}

// =========================================
// FETCH SINGLE SERIES
// =========================================

export async function getSeriesById(id) {
    const { data, error } = await supabase
        .from(APP_CONFIG.seriesTable)
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (handleError("Series details error", error)) return null;

    return data;
}

// =========================================
// SEARCH MOVIES AND SERIES
// =========================================

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

    return [
        ...(moviesResult.data || []).map(item => ({
            ...item,
            content_type: "movie"
        })),

        ...(seriesResult.data || []).map(item => ({
            ...item,
            content_type: "series"
        }))
    ].sort((a, b) =>
        new Date(b.created_at || 0) -
        new Date(a.created_at || 0)
    );
}

// =========================================
// FETCH LATEST MOVIES AND SERIES TOGETHER
// =========================================

export async function getLatestContent(
    limit = APP_CONFIG.latestLimit
) {
    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(limit),

        supabase
            .from(APP_CONFIG.seriesTable)
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(limit)
    ]);

    handleError("Latest movies error", moviesResult.error);
    handleError("Latest series error", seriesResult.error);

    return [
        ...(moviesResult.data || []).map(item => ({
            ...item,
            content_type: "movie"
        })),

        ...(seriesResult.data || []).map(item => ({
            ...item,
            content_type: "series"
        }))
    ]
        .sort((a, b) =>
            new Date(b.created_at || 0) -
            new Date(a.created_at || 0)
        )
        .slice(0, limit);
}

// =========================================
// FETCH TRENDING MOVIES AND SERIES
// RANKED BY REAL VIEW COUNTS
// =========================================

export async function getTrendingContent(limit = 12) {
    const safeLimit = Math.max(
        1,
        Math.min(Number(limit) || 12, 50)
    );

    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("*")
            .eq("is_active", true)
            .order("views", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(safeLimit),

        supabase
            .from(APP_CONFIG.seriesTable)
            .select("*")
            .eq("is_active", true)
            .order("views", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(safeLimit)
    ]);

    handleError("Trending movies error", moviesResult.error);
    handleError("Trending series error", seriesResult.error);

    const movies = (moviesResult.data || []).map(item => ({
        ...item,
        content_type: "movie",
        views: Number(item.views) || 0
    }));

    const series = (seriesResult.data || []).map(item => ({
        ...item,
        content_type: "series",
        views: Number(item.views) || 0
    }));

    return [...movies, ...series]
        .sort((a, b) => {
            const viewDifference = b.views - a.views;

            if (viewDifference !== 0) {
                return viewDifference;
            }

            return new Date(b.created_at || 0) -
                new Date(a.created_at || 0);
        })
        .slice(0, safeLimit);
}

// =========================================
// FETCH ALL CONTENT
// =========================================

export async function getAllContent() {
    const [movies, series] = await Promise.all([
        getAllMovies(),
        getAllSeries()
    ]);

    return [
        ...movies.map(item => ({
            ...item,
            content_type: "movie"
        })),

        ...series.map(item => ({
            ...item,
            content_type: "series"
        }))
    ].sort((a, b) =>
        new Date(b.created_at || 0) -
        new Date(a.created_at || 0)
    );
}

// =========================================
// FETCH UNIQUE TRANSLATORS
// =========================================

export async function getOurTranslators() {
    const [moviesResult, seriesResult] = await Promise.all([
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

    if (handleError("Movie translators error", moviesResult.error)) {
        return [];
    }

    if (handleError("Series translators error", seriesResult.error)) {
        return [];
    }

    const names = [
        ...(moviesResult.data || []),
        ...(seriesResult.data || [])
    ]
        .map(item => String(item.translator || "").trim())
        .filter(Boolean);

    return [...new Set(names)]
        .sort((a, b) => a.localeCompare(b));
}

console.log("CINEVA database functions loaded.");
