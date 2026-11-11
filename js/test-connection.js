
import { publicSupabase as supabase } from "./config.js?v=20261111-authfix-1";

async function testConnection() {
    console.log("Testing CINEVA Supabase connection...");

    try {
        const { data, error } = await supabase
            .from("movies")
            .select("id")
            .limit(1);

        if (error) throw error;

        console.log("CINEVA Supabase connection successful!");
        console.log("Movies table is accessible:", data);

    } catch (error) {
        console.error("Supabase connection failed:", error.message);
    }
}

testConnection();
