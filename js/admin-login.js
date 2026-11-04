
import { supabase } from "./config.js";

const form = document.getElementById("adminLoginForm");
const message = document.getElementById("loginMessage");
const button = document.getElementById("loginButton");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    button.disabled = true;
    button.textContent = "VERIFYING...";
    message.textContent = "";

    try {
        const { data, error } =
            await supabase.auth.signInWithPassword({
                email,
                password
            });

        if (error) throw error;

        const { data: admin, error: adminError } =
            await supabase
                .from("admins")
                .select("user_id, role")
                .eq("user_id", data.user.id)
                .eq("role", "admin")
                .maybeSingle();

        if (adminError || !admin) {
            await supabase.auth.signOut();
            throw new Error("This account is not an authorized administrator.");
        }

        window.location.replace("/admin.html");

    } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
        button.textContent = "SIGN IN TO DASHBOARD";
    }
});
