
import { supabase } from "../../js/config.js";
import { verifyAdmin } from "./admin-guard.js";

const loginForm = document.getElementById("adminLoginForm");
const emailInput = document.getElementById("adminEmail");
const passwordInput = document.getElementById("adminPassword");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const togglePassword = document.getElementById("togglePassword");

const DASHBOARD_URL = "/admin/dashboard.html";

let isAuthenticating = false;

function showMessage(message = "", type = "") {
    if (!loginMessage) return;

    loginMessage.textContent = message;
    loginMessage.className = "login-message";

    if (type) {
        loginMessage.classList.add(type);
    }
}

function setLoading(loading) {
    if (!loginButton) return;

    loginButton.disabled = loading;

    const text = loginButton.querySelector("span");

    if (text) {
        text.textContent = loading
            ? "AUTHENTICATING..."
            : "ACCESS ADMIN PANEL";
    }
}

async function checkExistingSession() {
    try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (!data.session) return;

        const result = await verifyAdmin();

        if (result.authorized) {
            window.location.replace(DASHBOARD_URL);
        }
    } catch (error) {
        console.error("Session verification error:", error);
    }
}

async function handleLogin(event) {
    event.preventDefault();

    if (isAuthenticating) return;

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
        showMessage("Enter your email and password.", "error");
        return;
    }

    isAuthenticating = true;
    setLoading(true);
    showMessage();

    try {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        const result = await verifyAdmin();

        if (!result.authorized) {
            await supabase.auth.signOut();

            throw new Error(
                result.reason || "Administrator access denied."
            );
        }

        showMessage("Access granted. Opening dashboard...", "success");

        window.location.replace(DASHBOARD_URL);

    } catch (error) {
        console.error("Admin login error:", error);

        showMessage(
            error.message || "Unable to sign in.",
            "error"
        );

    } finally {
        isAuthenticating = false;
        setLoading(false);
    }
}

function initializePasswordToggle() {
    if (!togglePassword || !passwordInput) return;

    togglePassword.addEventListener("click", () => {
        const show = passwordInput.type === "password";

        passwordInput.type = show ? "text" : "password";

        togglePassword.textContent = show ? "Hide" : "Show";
    });
}

async function initializeAdminLogin() {
    if (!loginForm) return;

    initializePasswordToggle();

    loginForm.addEventListener("submit", handleLogin);

    await checkExistingSession();
}

initializeAdminLogin();
