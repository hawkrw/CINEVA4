
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


// =========================================
// PRIVACY-FRIENDLY DAILY VISITOR COUNTING
// One random browser identifier; no IP address or
// personal profile data is collected.
// =========================================
if (typeof window !== "undefined" && !window.location.pathname.startsWith("/admin")) {
    try {
        const VISITOR_KEY = "cineva_visitor_id";
        let visitorId = window.localStorage.getItem(VISITOR_KEY);

        if (!visitorId) {
            visitorId = window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
                    const random = Math.random() * 16 | 0;
                    return (character === "x" ? random : (random & 3 | 8)).toString(16);
                });
            window.localStorage.setItem(VISITOR_KEY, visitorId);
        }

        // Supabase defaults visit_day to the current Kigali calendar day.
        supabase.from("site_visits").upsert({
            visitor_id: visitorId,
            path: window.location.pathname.slice(0, 500) || "/"
        }, {
            onConflict: "visitor_id,visit_day",
            ignoreDuplicates: true
        }).then(({ error }) => {
            if (error) console.warn("CINEVA visitor tracking:", error.message);
        }).catch(error => console.warn("CINEVA visitor tracking unavailable:", error));
    } catch (error) {
        console.warn("CINEVA visitor tracking could not initialize:", error);
    }
}

console.log("CINEVA Supabase configuration loaded.");
