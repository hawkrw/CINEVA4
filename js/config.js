
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

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
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
