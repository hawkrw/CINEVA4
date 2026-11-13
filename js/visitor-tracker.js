import { publicSupabase as supabase } from "./config.js?v=20261111-authfix-1";

/* CINEVA — privacy-friendly daily visitor tracking.
   Uses a random browser ID; no IP address or account details are collected. */

const VISITOR_KEY = "cineva_visitor_id";
const VISIT_DAY_KEY = "cineva_visit_day";

async function recordDailyVisit() {
    try {
        let visitorId = localStorage.getItem(VISITOR_KEY);

        if (!visitorId) {
            visitorId = window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
                    const random = Math.random() * 16 | 0;
                    return (character === "x" ? random : (random & 3 | 8)).toString(16);
                });

            localStorage.setItem(VISITOR_KEY, visitorId);
        }

        const now = new Date();
        const visitDay = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0")
        ].join("-");

        // Avoid sending duplicate daily inserts from every page navigation.
        if (localStorage.getItem(VISIT_DAY_KEY) === visitDay) return;

        const { error } = await supabase
            .from("site_visits")
            .insert({
                visitor_id: visitorId,
                path: location.pathname.slice(0, 500) || "/"
            });

        // A unique conflict means this visitor was already counted today.
        if (!error || error.code === "23505") {
            localStorage.setItem(VISIT_DAY_KEY, visitDay);
            return;
        }

        console.warn("CINEVA visitor tracking:", error.message);
    } catch (error) {
        console.warn("CINEVA visitor tracking unavailable:", error);
    }
}

recordDailyVisit();
