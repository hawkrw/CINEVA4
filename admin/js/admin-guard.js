
import { supabase } from "../../js/config.js?v=20261112-admin-login-fix-2";

/* =========================================
   CINEVA PRO — ADMIN AUTHORIZATION GUARD
========================================= */

export async function verifyAdmin() {
    try {
        // Verify the currently authenticated user.
        const {
            data: { user },
            error: userError
        } = await supabase.auth.getUser();

        if (userError) {
            return {
                authorized: false,
                reason: "Unable to verify your login session.",
                error: true
            };
        }

        if (!user) {
            return {
                authorized: false,
                reason: "Please sign in to continue."
            };
        }

        // Check the authenticated user's ID against public.admins.
        const { data: admin, error } = await supabase
            .from("admins")
            .select("id, email, user_id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (error) {
            console.error("Admin authorization error:", error);

            return {
                authorized: false,
                reason: "Unable to verify administrator permissions.",
                error: true
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
            reason: "An unexpected security error occurred.",
            error: true
        };
    }
}
