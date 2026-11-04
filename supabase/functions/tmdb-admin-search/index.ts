
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
        },
    });

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
        const authorization = req.headers.get("Authorization");

        if (!authorization?.startsWith("Bearer ")) {
            return jsonResponse({ error: "Authentication required" }, 401);
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const tmdbKey = Deno.env.get("TMDB_API_KEY");

        if (!tmdbKey || !supabaseUrl || !anonKey || !serviceRoleKey) {
            return jsonResponse({
                error: "Server configuration is incomplete."
            }, 500);
        }

        const token = authorization.slice("Bearer ".length);

        // Verify the actual signed-in user.
        const authClient = createClient(supabaseUrl, anonKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        });

        const {
            data: { user },
            error: authError,
        } = await authClient.auth.getUser(token);

        if (authError || !user) {
            return jsonResponse({ error: "Invalid session" }, 401);
        }

        // Only server-issued administrator metadata is trusted.
        if (user.app_metadata?.role !== "admin") {
            return jsonResponse({ error: "Administrator access required" }, 403);
        }

        const body = await req.json();

        const query = String(body.query || "").trim();
        const year = String(body.year || "").trim();

        if (query.length < 2 || query.length > 150) {
            return jsonResponse({
                error: "Enter a movie title between 2 and 150 characters."
            }, 400);
        }

        if (year && !/^\d{4}$/.test(year)) {
            return jsonResponse({ error: "Invalid release year." }, 400);
        }

        const tmdbUrl = new URL(
            "https://api.themoviedb.org/3/search/movie"
        );

        tmdbUrl.searchParams.set("api_key", tmdbKey);
        tmdbUrl.searchParams.set("query", query);
        tmdbUrl.searchParams.set("include_adult", "true");
        tmdbUrl.searchParams.set("language", "en-US");

        if (year) {
            tmdbUrl.searchParams.set("year", year);
        }

        const response = await fetch(tmdbUrl.toString());

        if (!response.ok) {
            return jsonResponse({
                error: "TMDB search failed. Please try again."
            }, 502);
        }

        const result = await response.json();

        const movies = (result.results || [])
            .slice(0, 15)
            .map((movie: Record<string, unknown>) => ({
                id: movie.id,
                title: movie.title,
                original_title: movie.original_title,
                overview: movie.overview,
                release_date: movie.release_date,
                vote_average: movie.vote_average,
                vote_count: movie.vote_count,
                poster_path: movie.poster_path,
                backdrop_path: movie.backdrop_path,
                popularity: movie.popularity,
                original_language: movie.original_language,
                adult: movie.adult,
            }));

        return jsonResponse({
            success: true,
            total: result.total_results || 0,
            results: movies,
        });

    } catch (error) {
        console.error("TMDB admin search:", error);

        return jsonResponse({
            error: "An unexpected server error occurred."
        }, 500);
    }
});
