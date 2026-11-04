
/* =========================================
   CINEVA — SUPABASE CONFIGURATION
========================================= */

// Import Supabase client
import { createClient } from
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Your Supabase project credentials
const SUPABASE_URL = "https://exjgejujfxejjlbfizgz.supabase.co";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4amdlanVqZnhlampsYmZpemd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTQzMTQsImV4cCI6MjA5NDA5MDMxNH0.CWUYLk4qJfriIYXWScB7wcHHVTCuz0SGDhWUV3tMR1Y";

// Initialize Supabase
export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

// CINEVA application settings
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
