
/* =========================================================
   CINEVA — AUTHENTICATION SYSTEM
   Supabase Login / Signup / Password Recovery
========================================================= */

import { supabase } from "./config.js";

/* =========================================================
   DOM ELEMENTS
========================================================= */

const authForm = document.getElementById("auth-form");

const signinTab = document.getElementById("signin-tab");
const signupTab = document.getElementById("signup-tab");
const bottomToggle = document.getElementById("bottom-toggle");

const authTabs = document.querySelector(".auth-tabs");

const authTitle = document.getElementById("auth-title");
const authDescription = document.getElementById("auth-description");

const nameGroup = document.getElementById("name-group");
const passwordGroup = document.querySelector(
    "#password"
).closest(".form-group");

const confirmPasswordGroup = document.getElementById(
    "confirm-password-group"
);

const signinOptions = document.getElementById("signin-options");

const fullNameInput = document.getElementById("full-name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById(
    "confirm-password"
);

const passwordToggle = document.getElementById("password-toggle");

const submitButton = document.getElementById("auth-submit");
const submitText = document.getElementById("submit-text");

const forgotPasswordButton = document.getElementById(
    "forgot-password"
);

const authMessage = document.getElementById("auth-message");
const authMessageText = document.getElementById(
    "auth-message-text"
);

const bottomText = document.getElementById("bottom-text");

/* =========================================================
   AUTHENTICATION STATE
========================================================= */

let authMode = "signin";
let isSubmitting = false;
let recoveryMode = false;

const params = new URLSearchParams(window.location.search);


/* =========================================================
   SAFE REDIRECT
========================================================= */

function getRedirectUrl() {
    const redirect = params.get("redirect");

    if (!redirect) {
        return "/";
    }

    try {
        const target = new URL(redirect, window.location.origin);

        // Never allow external website redirects
        if (target.origin !== window.location.origin) {
            return "/";
        }

        const allowedPages = [
            "/",
            "/index.html",
            "/profile.html",
            "/watch.html",
            "/genre.html"
        ];

        if (!allowedPages.includes(target.pathname)) {
            return "/";
        }

        return target.pathname + target.search + target.hash;

    } catch (error) {
        console.error("Invalid redirect:", error);
        return "/";
    }
}

function redirectUser() {
    window.location.assign(getRedirectUrl());
}

/* =========================================================
   MESSAGE SYSTEM
========================================================= */

function showMessage(message, type = "info") {
    authMessage.hidden = false;

    authMessage.className = "auth-message";
    authMessage.classList.add(type);

    authMessageText.textContent = message;

    const icon = authMessage.querySelector("i");

    if (icon) {
        icon.className =
            type === "error"
                ? "fa-solid fa-circle-exclamation"
                : type === "success"
                    ? "fa-solid fa-circle-check"
                    : "fa-solid fa-circle-info";
    }
}

function hideMessage() {
    authMessage.hidden = true;
    authMessageText.textContent = "";
    authMessage.className = "auth-message";
}

/* =========================================================
   BUTTON LOADING
========================================================= */

function setLoading(loading, text = "Please wait...") {
    isSubmitting = loading;

    submitButton.disabled = loading;

    if (loading) {
        submitText.textContent = text;
        submitButton.querySelector("i").className =
            "fa-solid fa-spinner fa-spin";
    } else {
        submitButton.querySelector("i").className =
            "fa-solid fa-arrow-right";

        updateSubmitText();
    }
}

/* =========================================================
   UPDATE BUTTON TEXT
========================================================= */

function updateSubmitText() {
    if (recoveryMode) {
        submitText.textContent = "Update Password";
        return;
    }

    submitText.textContent =
        authMode === "signup"
            ? "Create Account"
            : "Sign In";
}

/* =========================================================
   AUTH MODE SWITCHING
========================================================= */

function setAuthMode(mode) {
    if (recoveryMode) return;

    authMode = mode;

    hideMessage();

    authTabs.classList.toggle(
        "signup-mode",
        mode === "signup"
    );

    signinTab.classList.toggle(
        "active",
        mode === "signin"
    );

    signupTab.classList.toggle(
        "active",
        mode === "signup"
    );

    nameGroup.hidden = mode !== "signup";

    confirmPasswordGroup.hidden = mode !== "signup";

    signinOptions.hidden = mode !== "signin";

    fullNameInput.required = mode === "signup";

    confirmPasswordInput.required = mode === "signup";

    passwordInput.autocomplete =
        mode === "signup"
            ? "new-password"
            : "current-password";

    authTitle.textContent =
        mode === "signup"
            ? "Create Your Account"
            : "Welcome Back";

    authDescription.textContent =
        mode === "signup"
            ? "Join CINEVA and discover your entertainment world."
            : "Sign in to continue your CINEVA experience.";

    bottomText.textContent =
        mode === "signup"
            ? "Already have an account?"
            : "Don't have an account?";

    bottomToggle.textContent =
        mode === "signup"
            ? "Sign in"
            : "Create one";

    updateSubmitText();

    passwordInput.value = "";
    confirmPasswordInput.value = "";
}

signinTab.addEventListener("click", () => {
    setAuthMode("signin");
});

signupTab.addEventListener("click", () => {
    setAuthMode("signup");
});

bottomToggle.addEventListener("click", () => {
    setAuthMode(
        authMode === "signin"
            ? "signup"
            : "signin"
    );
});

/* =========================================================
   PASSWORD VISIBILITY
========================================================= */

passwordToggle.addEventListener("click", () => {
    const visible = passwordInput.type === "text";

    passwordInput.type = visible
        ? "password"
        : "text";

    passwordToggle.innerHTML = visible
        ? '<i class="fa-regular fa-eye"></i>'
        : '<i class="fa-regular fa-eye-slash"></i>';

    passwordToggle.setAttribute(
        "aria-label",
        visible ? "Show password" : "Hide password"
    );
});

/* =========================================================
   PASSWORD RECOVERY MODE
========================================================= */

function setRecoveryMode() {
    recoveryMode = true;

    authMode = "recovery";

    authTabs.hidden = true;
    nameGroup.hidden = true;
    signinOptions.hidden = true;

    confirmPasswordGroup.hidden = false;

    fullNameInput.required = false;
    confirmPasswordInput.required = true;

    passwordInput.value = "";
    confirmPasswordInput.value = "";

    passwordInput.autocomplete = "new-password";

    passwordGroup.querySelector("label").textContent =
        "New Password";

    confirmPasswordGroup.querySelector("label").textContent =
        "Confirm New Password";

    authTitle.textContent = "Reset Your Password";

    authDescription.textContent =
        "Choose a new password for your CINEVA account.";

    bottomText.textContent = "Secure account recovery";

    bottomToggle.hidden = true;
    forgotPasswordButton.hidden = true;

    updateSubmitText();

    hideMessage();
}

/* =========================================================
   PASSWORD RESET REQUEST
========================================================= */

forgotPasswordButton.addEventListener("click", async () => {
    hideMessage();

    const email = emailInput.value.trim();

    if (!email) {
        showMessage(
            "Please enter your email address first.",
            "error"
        );

        emailInput.focus();
        return;
    }

    if (!emailInput.checkValidity()) {
        showMessage(
            "Please enter a valid email address.",
            "error"
        );

        return;
    }

    setLoading(true, "Sending reset link...");

    try {
        const { error } =
            await supabase.auth.resetPasswordForEmail(email, {
                redirectTo:
                    window.location.origin +
                    window.location.pathname
            });

        if (error) throw error;

        showMessage(
            "If an account exists for this email, a password reset link will be sent. Check your inbox.",
            "success"
        );

    } catch (error) {
        console.error("Password reset error:", error);

        showMessage(
            error.message || "Unable to request a password reset.",
            "error"
        );

    } finally {
        setLoading(false);
    }
});

/* =========================================================
   INPUT VALIDATION
========================================================= */

function validateForm() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !emailInput.checkValidity()) {
        showMessage(
            "Please enter a valid email address.",
            "error"
        );

        emailInput.focus();
        return false;
    }

    if (password.length < 6) {
        showMessage(
            "Your password must contain at least 6 characters.",
            "error"
        );

        passwordInput.focus();
        return false;
    }

    if (authMode === "signup") {
        const fullName = fullNameInput.value.trim();

        if (fullName.length < 2) {
            showMessage(
                "Please enter your full name.",
                "error"
            );

            fullNameInput.focus();
            return false;
        }

        if (password !== confirmPasswordInput.value) {
            showMessage(
                "Your passwords do not match.",
                "error"
            );

            confirmPasswordInput.focus();
            return false;
        }
    }

    if (recoveryMode) {
        if (password !== confirmPasswordInput.value) {
            showMessage(
                "Your new passwords do not match.",
                "error"
            );

            confirmPasswordInput.focus();
            return false;
        }
    }

    return true;
}

/* =========================================================
   SIGN IN
========================================================= */

async function signIn() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const { data, error } =
        await supabase.auth.signInWithPassword({
            email,
            password
        });

    if (error) throw error;

    if (data.session) {
        showMessage(
            "Welcome back! Redirecting...",
            "success"
        );

        setTimeout(redirectUser, 700);
    }
}

/* =========================================================
   CREATE ACCOUNT
========================================================= */

async function signUp() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const fullName = fullNameInput.value.trim();

    const { data, error } =
        await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    display_name: fullName
                },
                emailRedirectTo:
                    window.location.origin +
                    window.location.pathname
            }
        });

    if (error) throw error;

    if (data.session) {
        showMessage(
            "Your account has been created successfully!",
            "success"
        );

        setTimeout(redirectUser, 900);

    } else {
        showMessage(
            "Account created! Please check your email and confirm your account before signing in.",
            "success"
        );

        setAuthMode("signin");
    }
}

/* =========================================================
   UPDATE PASSWORD AFTER RECOVERY
========================================================= */

async function updatePassword() {
    const password = passwordInput.value;

    const { error } =
        await supabase.auth.updateUser({
            password
        });

    if (error) throw error;

    recoveryMode = false;

    showMessage(
        "Your password has been updated successfully. Redirecting...",
        "success"
    );

    setTimeout(redirectUser, 1000);
}

/* =========================================================
   MAIN FORM SUBMISSION
========================================================= */

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    hideMessage();

    if (!validateForm()) return;

    try {
        if (recoveryMode) {
            setLoading(true, "Updating password...");
            await updatePassword();
            return;
        }

        if (authMode === "signup") {
            setLoading(true, "Creating account...");
            await signUp();

        } else {
            setLoading(true, "Signing in...");
            await signIn();
        }

    } catch (error) {
        console.error("CINEVA authentication error:", error);

        showMessage(
            error.message || "Something went wrong. Please try again.",
            "error"
        );

    } finally {
        setLoading(false);
    }
});

/* =========================================================
   SUPABASE AUTHENTICATION EVENTS
========================================================= */

supabase.auth.onAuthStateChange((event, session) => {

    if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode();

        showMessage(
            "Enter your new password below.",
            "info"
        );
    }

    if (event === "SIGNED_OUT") {
        recoveryMode = false;
    }

});

/* =========================================================
   INITIAL SESSION CHECK
========================================================= */

async function initializeAuth() {
    try {
        const { data, error } =
            await supabase.auth.getSession();

        if (error) throw error;

        if (data.session) {
            redirectUser();
            return;
        }

    } catch (error) {
        console.error(
            "CINEVA session initialization error:",
            error
        );

        showMessage(
            "Unable to verify your session. Please refresh the page.",
            "error"
        );
    }
}

/* =========================================================
   INITIALIZE PAGE
========================================================= */

setAuthMode("signin");

initializeAuth();

console.log("CINEVA authentication system initialized.");
