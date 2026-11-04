
/* =========================================================
   CINEVA PRO — ADMIN AUTHENTICATION
   Secure Supabase Login
========================================================= */

import { supabase } from "../../js/config.js";
import { verifyAdmin } from "./admin-guard.js";

/* =========================================================
   1. DOM ELEMENTS
========================================================= */

const loginForm = document.getElementById("adminLoginForm");
const emailInput = document.getElementById("adminEmail");
const passwordInput = document.getElementById("adminPassword");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const togglePassword = document.getElementById("togglePassword");

/* =========================================================
   2. CONFIGURATION
========================================================= */

const DASHBOARD_URL = "/admin/dashboard.html";
const LOGIN_URL = "/admin/";

let isAuthenticating = false;

/* =========================================================
   3. MESSAGE HANDLER
========================================================= */

function showMessage(message = "", type = "") {
    if (!loginMessage) return;

    loginMessage.textContent = message;
    loginMessage.className = "login-message";

    if (type) {
        loginMessage.classList.add(type);
    }
}

/* =========================================================
   4. BUTTON LOADING STATE
========================================================= */

function setLoading(loading) {
    if (!loginButton) return;

    loginButton.disabled = loading;

    const text = loginButton.querySelector("span");

    if (text) {
        text.textContent = loading
            ? "AUTHENTICATING..."
            : "ACCESS ADMIN PANEL";
    }

    loginButton.setAttribute(
        "aria-busy",
        String(loading)
    );
}

/* =========================================================
   5. ADMIN VERIFICATION
========================================================= */

async function checkAdminAccess() {
    try {
        const result = await verifyAdmin();

        if (result.authorized) {
            window.location.replace(DASHBOARD_URL);
            return true;
        }

        return false;

    } catch (error) {
        console.error("Admin access check failed:", error);
        return false;
    }
}

/* =========================================================
   6. LOGIN PROCESS
========================================================= */

async function handleLogin(event) {
    event.preventDefault();

    if (isAuthenticating) return;

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
        showMessage(
            "Please enter your administrator email and password.",
            "error"
        );
        return;
    }

    isAuthenticating = true;
    setLoading(true);
    showMessage();

    try {
        /* Authenticate with Supabase */
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            throw error;
        }

        if (!data?.user) {
            throw new Error("Authentication failed. Please try again.");
        }

        /* Verify the authenticated user against admins */
        const result = await verifyAdmin();

        if (!result.authorized) {
            await supabase.auth.signOut();

            throw new Error(
                result.reason ||
                "Your account does not have administrator permission."
            );
        }

        showMessage(
            "Access granted. Opening CINEVA PRO...",
            "success"
        );

        /* Open the protected dashboard */
        window.location.replace(DASHBOARD_URL);

    } catch (error) {
        console.error("CINEVA admin login error:", error);

        showMessage(
            error.message || "Unable to sign in. Please try again.",
            "error"
        );

    } finally {
        isAuthenticating = false;
        setLoading(false);
    }
}

/* =========================================================
   7. PASSWORD VISIBILITY
========================================================= */

function initializePasswordToggle() {
    if (!togglePassword || !passwordInput) return;

    togglePassword.addEventListener("click", () => {
        const show = passwordInput.type === "password";

        passwordInput.type = show ? "text" : "password";

        togglePassword.textContent = show ? "Hide" : "Show";

        togglePassword.setAttribute(
            "aria-label",
            show ? "Hide password" : "Show password"
        );
    });
}

/* =========================================================
   8. CLEAR ERRORS WHILE TYPING
========================================================= */

function initializeInputListeners() {
    emailInput?.addEventListener("input", () => {
        showMessage();
    });

    passwordInput?.addEventListener("input", () => {
        showMessage();
    });
}

/* =========================================================
   9. AUTH STATE HANDLING
========================================================= */

function initializeAuthStateListener() {
    supabase.auth.onAuthStateChange((event, session) => {
        if (
            event === "SIGNED_OUT" &&
            window.location.pathname.includes("/admin/dashboard")
        ) {
            window.location.replace(LOGIN_URL);
        }
    });
}

/* =========================================================
   10. INITIALIZATION
========================================================= */

async function initializeAdminLogin() {
    if (!loginForm || !emailInput || !passwordInput) {
        console.error("CINEVA: Admin login HTML elements are missing.");
        return;
    }

    initializePasswordToggle();
    initializeInputListeners();
    initializeAuthStateListener();

    await checkAdminAccess();

    loginForm.addEventListener("submit", handleLogin);

    console.log("CINEVA PRO: Admin authentication initialized.");
}

initializeAdminLogin();
