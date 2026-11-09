import { supabase } from "./config.js";

/* CINEVA — privacy-friendly daily visitor tracking.
   Uses a random browser ID; no IP address or account details are collected. */

const VISITOR_KEY = "cineva_visitor_id";

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

        const { error } = await supabase
            .from("site_visits")
            .upsert({
                visitor_id: visitorId,
                path: location.pathname.slice(0, 500) || "/"
            }, {
                onConflict: "visitor_id,visit_day",
                ignoreDuplicates: true
            });

        if (error) console.warn("CINEVA visitor tracking:", error.message);
    } catch (error) {
        console.warn("CINEVA visitor tracking unavailable:", error);
    }
}

recordDailyVisit();
