
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-import-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function isMissing(value: unknown) {
  return value === null || value === undefined || value === "";
}

function imageUrl(path: string | null, size: string) {
  return path ? `${IMAGE_BASE}${size}${path}` : null;
}

async function tmdbSearch(
  title: string,
  type: "movie" | "tv",
  year?: number
) {
  const token = Deno.env.get("TMDB_API_KEY");

  const endpoint = type === "movie" ? "movie" : "tv";
  const params = new URLSearchParams({
    query: title,
    include_adult: "true",
  });

  if (year && Number.isFinite(year)) {
    params.set(
      type === "movie" ? "year" : "first_air_date_year",
      String(year)
    );
  }

  const response = await fetch(
    `${TMDB_BASE}/search/${endpoint}?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`TMDB search failed: ${response.status}`);
  }

  const data = await response.json();

  const results = Array.isArray(data.results) ? data.results : [];
  const wanted = normalize(title);

  // Only accept an exact normalized title match.
  const match = results.find((item: any) => {
    const names = [
      item.title,
      item.name,
      item.original_title,
      item.original_name,
    ].filter(Boolean);

    return names.some(
      (name: string) => normalize(name) === wanted
    );
  });

  return match ?? null;
}

async function importMovie(supabase: any, movie: any) {
  const match = await tmdbSearch(
    movie.title,
    "movie",
    movie.year
  );

  if (!match) {
    return { id: movie.id, status: "no_exact_match" };
  }

  const update: Record<string, unknown> = {};

  const poster = imageUrl(match.poster_path, "w500");
  const backdrop = imageUrl(match.backdrop_path, "w1280");

  if (poster) {
    if (isMissing(movie.poster)) update.poster = poster;
    if (isMissing(movie.poster_path)) {
      update.poster_path = match.poster_path;
    }
  }

  if (backdrop) {
    if (isMissing(movie.backdrop)) update.backdrop = backdrop;
    if (isMissing(movie.backdrop_path)) {
      update.backdrop_path = match.backdrop_path;
    }
  }

  const metadata: Record<string, unknown> = {
    overview: match.overview,
    vote_average: match.vote_average,
    release_date: match.release_date || null,
    year: match.release_date
      ? Number(match.release_date.slice(0, 4))
      : null,
    original_title: match.original_title,
    original_language: match.original_language,
    popularity: match.popularity,
    adult: match.adult,
  };

  for (const [key, value] of Object.entries(metadata)) {
    if (isMissing(movie[key]) && !isMissing(value)) {
      update[key] = value;
    }
  }

  if (Object.keys(update).length === 0) {
    return { id: movie.id, status: "nothing_to_update" };
  }

  const { error } = await supabase
    .from("movies")
    .update(update)
    .eq("id", movie.id);

  if (error) throw error;

  return { id: movie.id, status: "updated" };
}

async function importSeries(supabase: any, series: any) {
  const match = await tmdbSearch(
    series.title,
    "tv",
    series.year
  );

  if (!match) {
    return { id: series.id, status: "no_exact_match" };
  }

  const update: Record<string, unknown> = {};

  const poster = imageUrl(match.poster_path, "w500");
  const backdrop = imageUrl(match.backdrop_path, "w1280");

  if (poster) {
    if (isMissing(series.poster)) update.poster = poster;
    if (isMissing(series.image)) update.image = poster;
    if (isMissing(series.poster_path)) {
      update.poster_path = match.poster_path;
    }
  }

  if (backdrop) {
    if (isMissing(series.backdrop)) update.backdrop = backdrop;
    if (isMissing(series.banner)) update.banner = backdrop;
    if (isMissing(series.backdrop_path)) {
      update.backdrop_path = match.backdrop_path;
    }
  }

  const metadata: Record<string, unknown> = {
    overview: match.overview,
    description: match.overview,
    rating: match.vote_average,
    release_date: match.first_air_date || null,
    year: match.first_air_date
      ? Number(match.first_air_date.slice(0, 4))
      : null,
    original_title: match.original_name,
    original_language: match.original_language,
    popularity: match.popularity,
    adult: match.adult,
  };

  for (const [key, value] of Object.entries(metadata)) {
    if (isMissing(series[key]) && !isMissing(value)) {
      update[key] = value;
    }
  }

  if (Object.keys(update).length === 0) {
    return { id: series.id, status: "nothing_to_update" };
  }

  const { error } = await supabase
    .from("series")
    .update(update)
    .eq("id", series.id);

  if (error) throw error;

  return { id: series.id, status: "updated" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "POST method required" }, 405);
  }

  try {
    const adminToken = Deno.env.get("CINEVA_IMPORT_ADMIN_TOKEN");
    const suppliedToken = req.headers.get("x-import-admin-token");

    if (!adminToken || !suppliedToken || suppliedToken !== adminToken) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const tmdbKey = Deno.env.get("TMDB_API_KEY");

    if (!supabaseUrl || !serviceKey || !tmdbKey) {
      return json({ error: "Missing server configuration" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));

    const type = body.type ?? "both";
    const offset = Math.max(0, Number(body.offset) || 0);
    const limit = Math.min(
      100,
      Math.max(1, Number(body.limit) || 20)
    );

    if (!["movies", "series", "both"].includes(type)) {
      return json({ error: "Invalid content type" }, 400);
    }

    const results: any[] = [];
    const errors: any[] = [];

    async function processTable(table: "movies" | "series") {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      for (const item of data ?? []) {
        const missingPoster =
          table === "movies"
            ? isMissing(item.poster) && isMissing(item.poster_path)
            : isMissing(item.poster) &&
              isMissing(item.image) &&
              isMissing(item.poster_path);

        if (!missingPoster) continue;

        try {
          const result =
            table === "movies"
              ? await importMovie(supabase, item)
              : await importSeries(supabase, item);

          results.push({ table, ...result });
        } catch (error) {
          errors.push({
            table,
            id: item.id,
            error: error instanceof Error
              ? error.message
              : "Unknown error",
          });
        }
      }

      return (data ?? []).length;
    }

    let moviesScanned = 0;
    let seriesScanned = 0;

    if (type === "movies" || type === "both") {
      moviesScanned = await processTable("movies");
    }

    if (type === "series" || type === "both") {
      seriesScanned = await processTable("series");
    }

    return json({
      success: true,
      message: "CINEVA TMDB import batch completed",
      offset,
      limit,
      nextOffset: offset + limit,
      moviesScanned,
      seriesScanned,
      updated: results.filter(
        (item) => item.status === "updated"
      ).length,
      results,
      errors,
      hasMore:
        moviesScanned === limit || seriesScanned === limit,
    });

  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Unexpected server error",
    }, 500);
  }
});
