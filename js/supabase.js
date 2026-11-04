
/* =========================================
   CINEVA — SUPABASE DATABASE FUNCTIONS
========================================= */

import { supabase, APP_CONFIG } from "./config.js";

/* =========================================
   FETCH LATEST MOVIES
========================================= */

export async function getLatestMovies(limit = APP_CONFIG.latestLimit) {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Latest movies error:", error.message);
        return [];
    }

    return data || [];
}

/* =========================================
   FETCH ALL MOVIES
========================================= */

export async function getAllMovies() {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Movies error:", error.message);
        return [];
    }

    return data || [];
}

/* =========================================
   FETCH FEATURED MOVIES
========================================= */

export async function getFeaturedMovies(limit = APP_CONFIG.featuredLimit) {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .eq("is_featured", true)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Featured movies error:", error.message);
        return [];
    }

    return data || [];
}

/* =========================================
   FETCH MOVIES BY CATEGORY
========================================= */

export async function getMoviesByCategory(category, limit = 20) {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .ilike("category", category)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        console.error(`Category "${category}" error:`, error.message);
        return [];
    }

    return data || [];
}

/* =========================================
   FETCH ALL SERIES
========================================= */

export async function getAllSeries() {
    const { data, error } = await supabase
        .from(APP_CONFIG.seriesTable)
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Series error:", error.message);
        return [];
    }

    return data || [];
}

/* =========================================
   FETCH SERIES BY CATEGORY
========================================= */

export async function getSeriesByCategory(category, limit = 20) {
    const { data, error } = await supabase
        .from(APP_CONFIG.seriesTable)
        .select("*")
        .ilike("category", category)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Series category error:", error.message);
        return [];
    }

    return data || [];
}

/* =========================================
   FETCH CATEGORIES
========================================= */

export async function getCategories() {
    const { data, error } = await supabase
        .from(APP_CONFIG.categoriesTable)
        .select("*")
        .order("name", { ascending: true });

    if (error) {
        console.error("Categories error:", error.message);
        return [];
    }

    return data || [];
}

/* =========================================
   FETCH SINGLE MOVIE
========================================= */

export async function getMovieById(id) {
    const { data, error } = await supabase
        .from(APP_CONFIG.moviesTable)
        .select("*")
        .eq("id", id)
        .single();

    if (error) {
        console.error("Movie details error:", error.message);
        return null;
    }

    return data;
}

/* =========================================
   SEARCH MOVIES AND SERIES
========================================= */

export async function searchContent(searchTerm) {
    const term = searchTerm.trim();

    if (!term) return [];

    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("*")
            .ilike("title", `%${term}%`)
            .limit(20),

        supabase
            .from(APP_CONFIG.seriesTable)
            .select("*")
            .ilike("title", `%${term}%`)
            .limit(20)
    ]);

    if (moviesResult.error) {
        console.error("Movie search error:", moviesResult.error.message);
    }

    if (seriesResult.error) {
        console.error("Series search error:", seriesResult.error.message);
    }

    return [
        ...(moviesResult.data || []).map(item => ({
            ...item,
            content_type: "movie"
        })),

        ...(seriesResult.data || []).map(item => ({
            ...item,
            content_type: "series"
        }))
    ];
}

/* =========================================
   FETCH LATEST MOVIES AND SERIES TOGETHER
========================================= */

export async function getLatestContent(limit = 20) {
    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit),

        supabase
            .from(APP_CONFIG.seriesTable)
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit)
    ]);

    if (moviesResult.error) {
        console.error("Latest movies error:", moviesResult.error.message);
    }

    if (seriesResult.error) {
        console.error("Latest series error:", seriesResult.error.message);
    }

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
            new Date(b.created_at) - new Date(a.created_at)
        )
        .slice(0, limit);
}
