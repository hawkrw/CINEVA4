
/* =========================================
   CINEVA PRO — SUPABASE DATABASE SYSTEM
   Reliable data fetching and error handling
========================================= */

import { publicSupabase as supabase, APP_CONFIG } from "./config.js?v=20261111-authfix-1";

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
const HOMEPAGE_MOVIE_FIELDS = [
    "id", "title", "category", "created_at", "updated_at", "is_active",
    "views", "translator", "year", "release_date", "rating", "vote_average",
    "overview", "tagline", "poster", "poster_path", "backdrop", "backdrop_path",
    "genres", "quality", "stream_type", "featured", "is_featured",
    "featured_order", "tmdb_id", "original_title", "vote_count", "popularity"
].join(",");

const HOMEPAGE_SERIES_FIELDS = [
    "id", "title", "category", "created_at", "updated_at", "last_activity_at",
    "is_active", "views", "translator", "year", "release_date", "rating",
    "overview", "description", "tagline", "image", "banner", "poster",
    "poster_path", "backdrop", "backdrop_path", "genres", "total_seasons",
    "tmdb_id", "original_title", "vote_count", "popularity"
].join(",");

// Category cards need only compact display fields; avoid transferring full
// descriptions and metadata for hundreds of rows on mobile connections.
const CATEGORY_MOVIE_FIELDS = [
    "id", "title", "category", "created_at", "views", "translator",
    "year", "release_date", "rating", "vote_average", "poster",
    "poster_path", "backdrop", "backdrop_path"
].join(",");

const CATEGORY_SERIES_FIELDS = [
    "id", "title", "category", "created_at", "updated_at", "last_activity_at", "views",
    "translator", "year", "release_date", "rating", "poster",
    "poster_path", "backdrop", "backdrop_path"
].join(",");

/* =========================================
   02.1. SHARED HOMEPAGE DATA LOADER
========================================= */

export async function getHomepageData({
    latestLimit = 10,
    trendingLimit = 6,
    categoryLimit = 6,
    categories = []
} = {}) {
    const latestCount = safeLimit(latestLimit, 10);
    const trendingCount = safeLimit(trendingLimit, 6);
    const perCategory = safeLimit(categoryLimit, 6);

    const categoryNames = [
        ...new Set(
            categories
                .map(name => String(name || "").trim())
                .filter(Boolean)
        )
    ];

    const categoryFilters = categoryNames
        .map(name => name.replace(/[^a-zA-Z0-9 -]/g, ""))
        .filter(Boolean)
        .map(name => `category.ilike.${name}`)
        .join(",");

    const requests = [
        // Latest movies
        supabase
            .from(APP_CONFIG.moviesTable)
            .select(HOMEPAGE_MOVIE_FIELDS)
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(latestCount),

        // Latest series are based strictly on original creation date.
        // Views, clicks, playback and new episode activity never promote
        // an older series into Latest Added or the hero slider.
        supabase
            .from(APP_CONFIG.seriesTable)
            .select(HOMEPAGE_SERIES_FIELDS)
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(latestCount),

        // Trending movies
        supabase
            .from(APP_CONFIG.moviesTable)
            .select(HOMEPAGE_MOVIE_FIELDS)
            .eq("is_active", true)
            .gt("views", 0)
            .order("views", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(trendingCount),

        // Trending series
        supabase
            .from(APP_CONFIG.seriesTable)
            .select(HOMEPAGE_SERIES_FIELDS)
            .eq("is_active", true)
            .gt("views", 0)
            .order("views", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(trendingCount)
    ];

    // Fetch all category content in two requests,
    // rather than two requests for every category.
    if (categoryFilters) {
        requests.push(
            supabase
                .from(APP_CONFIG.moviesTable)
                .select(CATEGORY_MOVIE_FIELDS)
                .eq("is_active", true)
                .or(categoryFilters)
                .order("created_at", { ascending: false })
                .limit(1000),

            supabase
                .from(APP_CONFIG.seriesTable)
                .select(CATEGORY_SERIES_FIELDS)
                .eq("is_active", true)
                .or(categoryFilters)
                .order("created_at", { ascending: false })
                .limit(1000)
        );
    }

    const results = await Promise.all(requests);

    const labels = [
        "Homepage latest movies",
        "Homepage latest series",
        "Homepage trending movies",
        "Homepage trending series"
    ];

    if (categoryFilters) {
        labels.push(
            "Homepage category movies",
            "Homepage category series"
        );
    }

    results.forEach((result, index) => {
        handleError(labels[index], result.error);
    });

    const latest = combineContent(
        results[0].data,
        results[1].data
    )
        .map(item => ({
            ...item,
            // Series get a fresh position only when an episode is inserted.
            // Views and playback never update last_activity_at.
            latest_activity_at: item.content_type === "series"
                ? item.last_activity_at || item.created_at
                : item.created_at,
            has_new_episode: item.content_type === "series" && Boolean(item.last_activity_at) &&
                Date.now() - Date.parse(item.last_activity_at) <= 7 * 24 * 60 * 60 * 1000
        }))
        .sort((a, b) =>
            (Date.parse(b.latest_activity_at || "") || 0) -
            (Date.parse(a.latest_activity_at || "") || 0)
        )
        .slice(0, latestCount);

    const trending = [
        ...(results[2].data || []).map(item => ({
            ...item,
            content_type: "movie",
            views: Number(item.views) || 0
        })),

        ...(results[3].data || []).map(item => ({
            ...item,
            content_type: "series",
            views: Number(item.views) || 0
        }))
    ]
        .sort((a, b) => {
            const viewsDifference = b.views - a.views;

            if (viewsDifference !== 0) {
                return viewsDifference;
            }

            return (
                (Date.parse(b.created_at || "") || 0) -
                (Date.parse(a.created_at || "") || 0)
            );
        })
        .slice(0, trendingCount);

    const categoryContent = {};

    categoryNames.forEach(category => {
        categoryContent[category] = [];
    });

    if (categoryFilters) {
        const categoryItems = combineContent(
            results[4].data,
            results[5].data
        );

        categoryNames.forEach(category => {
            // Adventure is a dedicated movie collection: show every active
            // Adventure movie uploaded, not just the standard six-card preview.
            if (category.toLowerCase() === "adventure") {
                categoryContent[category] = (results[4].data || [])
                    .filter(item =>
                        String(item.category || "").trim().toLowerCase() === "adventure"
                    )
                    .map(item => ({ ...item, content_type: "movie" }));
                return;
            }

            categoryContent[category] = categoryItems
                .filter(item =>
                    String(item.category || "").trim().toLowerCase() ===
                    category.toLowerCase()
                )
                .slice(0, perCategory);
        });
    }

    return {
        latest,
        trending,
        categories: categoryContent
    };
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

    // Strip PostgREST filter delimiters from visitor input.
    const safeTerm = term
        .replace(/[(),%"]/g, " ")
        .split(String.fromCharCode(92)).join(" ")
        .replace(/\s+/g, " ")
        .trim();

    if (!safeTerm) return [];

    const pattern = `%${safeTerm}%`;
    const searchFilter =
        `title.ilike.${pattern},original_title.ilike.${pattern},translator.ilike.${pattern},category.ilike.${pattern}`;

    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("id,title,original_title,category,created_at,translator,year,release_date,rating,vote_average,poster,poster_path,thumbnail")
            .eq("is_active", true)
            .or(searchFilter)
            .order("created_at", { ascending: false })
            .limit(30),

        supabase
            .from(APP_CONFIG.seriesTable)
            .select("id,title,original_title,category,created_at,last_activity_at,translator,year,release_date,rating,poster,poster_path,image")
            .eq("is_active", true)
            .or(searchFilter)
            .order("created_at", { ascending: false })
            .limit(30)
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
   Both content types use created_at only.
   Views, clicks and episode updates never reset
   a title's position in "Latest Added".
========================================= */

export async function getLatestContent(
    limit = APP_CONFIG.latestLimit
) {
    const safeResultLimit = safeLimit(limit);

    const [moviesResult, seriesResult] = await Promise.all([
        // Latest movies are based on creation date
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(safeResultLimit),

        // Latest series are based on original creation date, not activity.
        supabase
            .from(APP_CONFIG.seriesTable)
            .select("*")
            .eq("is_active", true)
            .order("last_activity_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .limit(safeResultLimit)
    ]);

    handleError("Latest movies error", moviesResult.error);
    handleError("Latest series error", seriesResult.error);

    const movies = (moviesResult.data || []).map(item => ({
        ...item,
        content_type: "movie",
        latest_activity_at: item.created_at
    }));

    const series = (seriesResult.data || []).map(item => ({
        ...item,
        content_type: "series",
        latest_activity_at: item.last_activity_at || item.created_at,
        has_new_episode: Boolean(item.last_activity_at) &&
            Date.now() - Date.parse(item.last_activity_at) <= 7 * 24 * 60 * 60 * 1000
    }));

    return [...movies, ...series]
        .sort((a, b) => {
            const dateA =
                Date.parse(a.latest_activity_at || "") || 0;

            const dateB =
                Date.parse(b.latest_activity_at || "") || 0;

            return dateB - dateA;
        })
        .slice(0, safeResultLimit);
}

/* =========================================
   15. FETCH TRENDING MOVIES AND SERIES
   Ranked by real view counts
========================================= */
export async function getTrendingContent(limit = 12) {
    const resultLimit = safeLimit(limit, 12, 50);

    const [moviesResult, seriesResult] = await Promise.all([
        supabase
            .from(APP_CONFIG.moviesTable)
            .select("*")
            .eq("is_active", true)
            .gt("views", 0)
            .order("views", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(resultLimit),

        supabase
            .from(APP_CONFIG.seriesTable)
            .select("*")
            .eq("is_active", true)
            .gt("views", 0)
            .order("views", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(resultLimit)
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
            const difference = b.views - a.views;

            if (difference !== 0) return difference;

            return (
                (Date.parse(b.created_at || "") || 0) -
                (Date.parse(a.created_at || "") || 0)
            );
        })
        .slice(0, resultLimit);
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
   17.1. FETCH MANAGED TRANSLATOR PROFILES
========================================= */
export async function getOurTranslatorProfiles() {
    const { data, error } = await supabase
        .from("translator_profiles")
        .select("id,name,profile_image_url,bio,sort_order,is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

    if (error) {
        console.error("CINEVA translator profiles failed:", error);
        throw error;
    }

    // Keep automatic discovery working for translator names added to new
    // movie or series records after this profile directory was created.
    const managed = data || [];
    const known = new Set(managed.map(profile => String(profile.name || "").trim().toLowerCase()));
    let discovered = [];
    try {
        discovered = await getOurTranslators();
    } catch (discoveryError) {
        console.warn("CINEVA translator auto-discovery unavailable; showing managed profiles:", discoveryError);
    }
    const generated = discovered
        .map(rawName => {
            const key = String(rawName || "").replace(/\\s+/g, " ").trim().toLowerCase();
            if (/^gaheza(?:\\s+simba)?$/.test(key)) return "Gaheza";
            if (/^hakim(?:\\s+the\\s+(?:prof|mwarimu))?$/.test(key)) return "Hakim's";
            return String(rawName || "").replace(/\\s+/g, " ").trim();
        })
        .filter(name => name && !known.has(name.toLowerCase()))
        .map((name, index) => ({
            id: null,
            name,
            profile_image_url: null,
            bio: "CINEVA Translator",
            sort_order: managed.length + index,
            is_active: true
        }));

    return [...managed, ...generated];
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

    const collected = [];

    results.forEach((result, index) => {
        const label = index === 0
            ? "Movie translators"
            : "Series translators";

        if (result.status === "rejected") {
            console.warn(`CINEVA ${label} request failed:`, result.reason);
            return;
        }

        const { data, error } = result.value;

        if (error) {
            console.warn(`CINEVA ${label} error:`, error.message);
            return;
        }

        (data || []).forEach(item => {
            const name = String(item.translator || "")
                .replace(/\s+/g, " ")
                .trim();

            if (name) collected.push(name);
        });
    });

    if (results.every(result => result.status === "rejected")) {
        throw new Error("Unable to load translator information.");
    }

    // Merge case and spacing variants (e.g. "ROCKY" and "Rocky")
    // while keeping the most frequently used display spelling.
    const grouped = new Map();

    collected.forEach(name => {
        const key = name.toLocaleLowerCase();

        if (!grouped.has(key)) {
            grouped.set(key, new Map());
        }

        const variants = grouped.get(key);
        variants.set(name, (variants.get(name) || 0) + 1);
    });

    return [...grouped.values()]
        .map(variants => [...variants.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0])
        .sort((a, b) => a.localeCompare(b));
}

/* =========================================
   18. INITIALIZATION
========================================= */

console.log("CINEVA database functions loaded successfully.");
