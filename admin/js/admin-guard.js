
import { supabase } from "../../js/config.js";

export async function verifyAdmin() {
    try {
        const {
            data: { user },
            error: userError
        } = await supabase.auth.getUser();

        if (userError || !user) {
            return {
                authorized: false,
                reason: "Please sign in first."
            };
        }

        const { data: admin, error } = await supabase
            .from("admins")
            .select("id, email, user_id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (error) {
            console.error("Admin verification failed:", error);

            return {
                authorized: false,
                reason: "Unable to verify administrator access."
            };
        }

        if (!admin) {
            return {
                authorized: false,
                reason: "You are not authorized to access CINEVA PRO."
            };
        }

        return {
            authorized: true,
            user,
            admin
        };

    } catch (error) {
        console.error("Admin guard error:", error);

        return {
            authorized: false,
            reason: "An unexpected security error occurred."
        };
    }
}
