
import { supabase } from "../../js/config.js";
import { verifyAdmin } from "./admin-guard.js";

/* =========================================
   CINEVA PRO — ADMIN LOGIN
========================================= */

const loginForm = document.getElementById("adminLoginForm");
const emailInput = document.getElementById("adminEmail");
const passwordInput = document.getElementById("adminPassword");

const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const togglePassword = document.getElementById("togglePassword");

const DASHBOARD_URL = "./dashboard.html";

let isAuthenticating = false;

/* =========================================
   MESSAGE HANDLER
========================================= */

function showMessage(message = "", type = "") {
    if (!loginMessage) return;

    loginMessage.textContent = message;
    loginMessage.className = "login-message";

    if (type) {
        loginMessage.classList.add(type);
    }
}

/* =========================================
   LOADING STATE
========================================= */

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

/* =========================================
   PASSWORD VISIBILITY
========================================= */

function initializePasswordToggle() {
    if (!togglePassword || !passwordInput) return;

    togglePassword.addEventListener("click", () => {
        const showPassword = passwordInput.type === "password";

        passwordInput.type = showPassword ? "text" : "password";

        togglePassword.textContent = showPassword ? "Hide" : "Show";

        togglePassword.setAttribute(
            "aria-label",
            showPassword ? "Hide password" : "Show password"
        );
    });
}

/* =========================================
   CHECK EXISTING SESSION
========================================= */


async function checkExistingSession() {
    try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        // Never automatically restore an old admin session.
        if (data.session) {
            await supabase.auth.signOut();
            showMessage(
                "Your previous session has ended. Please sign in again.",
                "error"
            );
        }
    } catch (error) {
        console.error("Session check failed:", error);
        showMessage(
            "Unable to verify your session. Please try again.",
            "error"
        );
    }
}


/* =========================================
   ADMIN LOGIN
========================================= */

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
        // Step 1: Authenticate with Supabase.
        const { error: loginError } = await supabase.auth
            .signInWithPassword({
                email,
                password
            });

        if (loginError) throw loginError;

        // Step 2: Verify administrator permissions.
        const result = await verifyAdmin();

        if (!result.authorized) {
            await supabase.auth.signOut();

            throw new Error(
                result.reason || "Administrator access denied."
            );
        }

        // Step 3: Redirect verified administrators.
        showMessage(
    "Access granted. Opening CINEVA PRO...",
    "success"
);

// One-time permission to enter the dashboard.
sessionStorage.setItem("cineva_admin_login_handoff", "authorized");

window.location.replace(DASHBOARD_URL);
    } catch (error) {
        console.error("CINEVA login error:", error);

        showMessage(
            error.message || "Unable to authenticate.",
            "error"
        );

    } finally {
        isAuthenticating = false;
        setLoading(false);
    }
}

/* =========================================
   INITIALIZE LOGIN
========================================= */

async function initializeAdminLogin() {
    if (!loginForm) {
        console.error("CINEVA: Admin login form not found.");
        return;
    }

    const currentYear = document.getElementById("currentYear");

    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    initializePasswordToggle();

    loginForm.addEventListener("submit", handleLogin);

    await checkExistingSession();

    console.log("CINEVA PRO authentication initialized.");
}

initializeAdminLogin();
