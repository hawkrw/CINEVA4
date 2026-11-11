
/* =========================================
   CINEVA — SUPABASE CONFIGURATION
========================================= */

// Load the Supabase SDK with a second CDN fallback for Android WebView networks.
let createClient;
try {
    ({ createClient } = await import(
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
    ));
} catch (primaryError) {
    console.warn("CINEVA: Primary Supabase CDN unavailable; trying fallback.", primaryError);
    ({ createClient } = await import(
        "https://esm.sh/@supabase/supabase-js@2"
    ));
}

// =========================================
// SUPABASE PROJECT CREDENTIALS
// =========================================

const SUPABASE_URL =
    "https://exjgejujfxejjlbfizgz.supabase.co";

const SUPABASE_ANON_KEY =
   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4amdlanVqZnhlampsYmZpemd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTQzMTQsImV4cCI6MjA5NDA5MDMxNH0.CWUYLk4qJfriIYXWScB7wcHHVTCuz0SGDhWUV3tMR1Y";


// =========================================
// INITIALIZE SUPABASE CLIENT
// =========================================

// Authenticated client: retains normal user/admin sessions for actions
// that genuinely require an account.
export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    }
);

// Public-data client: never reuses a browser's stored user access token.
// Public movie/series reads must use the anon key even if an old user
// session has expired, so public pages remain available without login.
export const publicSupabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
            storageKey: "cineva-public-auth"
        }
    }
);

// =========================================
// CINEVA APPLICATION CONFIGURATION
// =========================================

export const APP_CONFIG = {
    name: "CINEVA",
    version: "1.0.0",
    defaultLanguage: "en",

    moviesTable: "movies",
    seriesTable: "series",
    categoriesTable: "categories",

    featuredLimit: 10,
    latestLimit: 20
};


console.log("CINEVA Supabase configuration loaded.");
