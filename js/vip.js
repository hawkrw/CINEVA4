
/* =========================================================
   CINEVA VIP — MEMBERSHIP SYSTEM
   File: js/vip.js

   Supabase tables:
   - vip_plans
   - vip_payments
   - vip_subscriptions

   Secure payment function:
   - vip-create-payment

   IMPORTANT:
   Payment secrets must NEVER be placed in this file.
========================================================= */

import { supabase } from "./config.js";

/* =========================================================
   CONFIGURATION
========================================================= */

const VIP_CONFIG = {
    plansTable: "vip_plans",
    paymentFunction: "vip-create-payment",
    currency: "RWF"
};

/* =========================================================
   DOM ELEMENTS
========================================================= */

const loader = document.getElementById("vipLoader");
const plansContainer = document.getElementById("vipPlansContainer");
const planSelect = document.getElementById("selectedPlan");
const paymentForm = document.getElementById("vipPaymentForm");
const phoneInput = document.getElementById("vipPhone");
const payButton = document.getElementById("vipPayBtn");
const paymentMessage = document.getElementById("vipPaymentMessage");
const authButton = document.getElementById("vipAuthBtn");
const mobileMenuButton = document.getElementById("vipMenuBtn");
const mobileNav = document.getElementById("vipMobileNav");

/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let vipPlans = [];
let selectedPlanId = null;

/* =========================================================
   HELPERS
========================================================= */

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function formatPrice(amount) {
    return new Intl.NumberFormat("en-RW", {
        maximumFractionDigits: 0
    }).format(Number(amount || 0));
}

function formatDuration(days) {
    const duration = Number(days);

    if (duration === 1) return "1 day";
    if (duration === 7) return "1 week";
    if (duration === 30) return "1 month";
    if (duration === 90) return "3 months";
    if (duration === 180) return "6 months";
    if (duration === 365) return "1 year";

    return `${duration} days`;
}

function showMessage(message, type = "info") {
    if (!paymentMessage) return;

    paymentMessage.textContent = message;
    paymentMessage.dataset.type = type;
}

function setLoading(button, loading, loadingText = "Please wait...") {
    if (!button) return;

    if (loading) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.disabled = true;
    } else {
        button.textContent =
            button.dataset.originalText || "Continue to Payment →";

        button.disabled = false;
    }
}

function hideLoader() {
    if (loader) {
        loader.classList.add("hidden");
    }
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function checkAuthentication() {
    try {
        const { data, error } = await supabase.auth.getUser();

        if (error) throw error;

        currentUser = data?.user || null;

        updateAuthButton();

        return currentUser;

    } catch (error) {
        console.error("VIP authentication error:", error);

        currentUser = null;
        updateAuthButton();

        return null;
    }
}

function updateAuthButton() {
    if (!authButton) return;

    if (currentUser) {
        authButton.textContent = "My Account";
        authButton.href = "profile.html";
    } else {
        authButton.textContent = "Sign In";
        authButton.href = "login.html?redirect=vip.html";
    }
}

/* =========================================================
   LOAD VIP PLANS
========================================================= */

async function loadVIPPlans() {
    if (!plansContainer || !planSelect) return;

    plansContainer.innerHTML = `
        <div class="plans-loading">
            <div class="small-spinner"></div>
            <p>Loading membership plans...</p>
        </div>
    `;

    try {
        const { data, error } = await supabase
            .from(VIP_CONFIG.plansTable)
            .select(`
                id,
                name,
                description,
                duration_days,
                price_rwf,
                is_active,
                sort_order
            `)
            .eq("is_active", true)
            .order("sort_order", { ascending: true });

        if (error) throw error;

        vipPlans = data || [];

        if (!vipPlans.length) {
            plansContainer.innerHTML = `
                <div class="plans-loading">
                    <p>No active VIP plans are available right now.</p>
                </div>
            `;

            planSelect.innerHTML = `
                <option value="">No plans available</option>
            `;

            return;
        }

        renderVIPPlans();
        populatePlanSelect();

    } catch (error) {
        console.error("VIP plans loading error:", error);

        plansContainer.innerHTML = `
            <div class="plans-loading">
                <p>Unable to load VIP plans.</p>
                <p>Please refresh the page or try again later.</p>
            </div>
        `;

        planSelect.innerHTML = `
            <option value="">Plans unavailable</option>
        `;
    }
}

/* =========================================================
   RENDER VIP PLAN CARDS
========================================================= */

function renderVIPPlans() {
    if (!plansContainer) return;

    plansContainer.innerHTML = vipPlans.map((plan, index) => {
        const featured = index === 1;

        return `
            <article class="plan-card ${featured ? "featured" : ""}">

                ${featured ? `
                    <div class="plan-ribbon">POPULAR</div>
                ` : ""}

                <div class="plan-name">
                    ${escapeHTML(plan.name)}
                </div>

                <div class="plan-price">
                    <strong>${formatPrice(plan.price_rwf)}</strong>
                    <span>RWF</span>
                </div>

                <div class="plan-duration">
                    Valid for ${formatDuration(plan.duration_days)}
                </div>

                <p class="plan-description">
                    ${escapeHTML(
                        plan.description ||
                        "Enjoy exclusive CINEVA VIP membership benefits."
                    )}
                </p>

                <div class="plan-divider"></div>

                <ul class="plan-features">
                    <li>Access to the CINEVA VIP Room</li>
                    <li>Submit movie and series requests</li>
                    <li>Priority request consideration</li>
                    <li>Exclusive VIP membership status</li>
                </ul>

                <button
                    type="button"
                    class="plan-select-btn"
                    data-plan-id="${escapeHTML(plan.id)}"
                >
                    Choose This Plan →
                </button>

            </article>
        `;
    }).join("");

    plansContainer
        .querySelectorAll(".plan-select-btn")
        .forEach(button => {
            button.addEventListener("click", () => {
                selectPlan(button.dataset.planId);
            });
        });
}

/* =========================================================
   PLAN SELECT DROPDOWN
========================================================= */

function populatePlanSelect() {
    if (!planSelect) return;

    planSelect.innerHTML = `
        <option value="">Choose a membership plan</option>
        ${vipPlans.map(plan => `
            <option value="${escapeHTML(plan.id)}">
                ${escapeHTML(plan.name)} — ${formatPrice(plan.price_rwf)} RWF
            </option>
        `).join("")}
    `;

    if (selectedPlanId) {
        planSelect.value = selectedPlanId;
    }
}

/* =========================================================
   SELECT PLAN
========================================================= */

function selectPlan(planId) {
    const plan = vipPlans.find(item => String(item.id) === String(planId));

    if (!plan) {
        showMessage("Please select a valid membership plan.", "error");
        return;
    }

    selectedPlanId = plan.id;

    if (planSelect) {
        planSelect.value = String(plan.id);
    }

    showMessage(
        `${plan.name} selected. Choose your payment method to continue.`,
        "success"
    );

    document.getElementById("vipPayment")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

/* =========================================================
   PLAN DROPDOWN CHANGE
========================================================= */

if (planSelect) {
    planSelect.addEventListener("change", () => {
        selectedPlanId = planSelect.value || null;

        if (selectedPlanId) {
            const plan = vipPlans.find(
                item => String(item.id) === String(selectedPlanId)
            );

            if (plan) {
                showMessage(
                    `${plan.name} selected. Continue with your payment.`,
                    "success"
                );
            }
        }
    });
}

/* =========================================================
   PAYMENT METHOD
========================================================= */

function getSelectedPaymentMethod() {
    const selected = document.querySelector(
        'input[name="paymentMethod"]:checked'
    );

    return selected?.value || null;
}

/* =========================================================
   PHONE VALIDATION
========================================================= */

function validatePhone(phone) {
    const cleaned = phone.replace(/[\s-]/g, "");

    // Accept common Rwandan local and international mobile formats.
    return /^(?:07[2389]\d{7}|\+?2507[2389]\d{7})$/.test(cleaned);
}

/* =========================================================
   START SECURE PAYMENT
========================================================= */

async function startVIPPayment(event) {
    event.preventDefault();

    if (!vipPlans.length) {
        showMessage("There are currently no available VIP plans.", "error");
        return;
    }

    const planId = planSelect?.value;
    const paymentMethod = getSelectedPaymentMethod();
    const phoneNumber = phoneInput?.value.trim();

    if (!planId) {
        showMessage("Please choose a membership plan.", "error");
        planSelect?.focus();
        return;
    }

    if (!paymentMethod || !["mtn", "airtel"].includes(paymentMethod)) {
        showMessage("Please select MTN or Airtel Money.", "error");
        return;
    }

    if (!phoneNumber || !validatePhone(phoneNumber)) {
        showMessage(
            "Enter a valid Rwandan mobile money number.",
            "error"
        );
        phoneInput?.focus();
        return;
    }

    const selectedPlan = vipPlans.find(
        plan => String(plan.id) === String(planId)
    );

    if (!selectedPlan) {
        showMessage("The selected plan is no longer available.", "error");
        return;
    }

    // Require an authenticated account before initiating payment.
    const user = await checkAuthentication();

    if (!user) {
        showMessage("Please sign in before purchasing VIP membership.", "error");

        window.location.href = "login.html?redirect=vip.html";
        return;
    }

    setLoading(payButton, true, "Connecting to payment...");

    showMessage(
        "Creating your secure payment request. Please wait...",
        "info"
    );

    try {
        /*
         * This function must be deployed as a Supabase Edge Function.
         *
         * It must:
         * 1. Authenticate the user's access token.
         * 2. Read the real plan price from vip_plans.
         * 3. Create a pending vip_payments record.
         * 4. Initiate the payment with the payment provider.
         * 5. Return a safe response to this page.
         *
         * It must NOT activate VIP just because the user returns here.
         */

        const { data, error } = await supabase.functions.invoke(
            VIP_CONFIG.paymentFunction,
            {
                body: {
                    plan_id: planId,
                    payment_method: paymentMethod,
                    phone_number: phoneNumber
                }
            }
        );

        if (error) {
            throw error;
        }

        if (!data || data.success === false) {
            throw new Error(
                data?.message || "The payment request could not be started."
            );
        }

        showMessage(
            data.message ||
            "Payment request created. Check your phone and approve the mobile money prompt.",
            "success"
        );

        /*
         * If the provider/backend returns a hosted checkout URL,
         * open that exact URL. Never construct one on the frontend.
         */

        const checkoutURL = data.checkout_url || data.payment_url;

        if (checkoutURL) {
            const parsedURL = new URL(checkoutURL);

            if (parsedURL.protocol !== "https:") {
                throw new Error("The payment link is not secure.");
            }

            window.location.assign(parsedURL.href);
            return;
        }

        /*
         * Payment confirmation will be handled by the server webhook.
         * This page does not grant VIP access.
         */

        if (data.payment_id) {
            showMessage(
                "Payment request sent. Approve the prompt on your phone. Your VIP access will activate after server verification.",
                "success"
            );
        }

    } catch (error) {
        console.error("VIP payment error:", error);

        showMessage(
            error.message ||
            "Unable to start payment. Please try again later.",
            "error"
        );

    } finally {
        setLoading(payButton, false);
    }
}

/* =========================================================
   PAYMENT FORM EVENT
========================================================= */

if (paymentForm) {
    paymentForm.addEventListener("submit", startVIPPayment);
}

/* =========================================================
   MOBILE MENU
========================================================= */

if (mobileMenuButton && mobileNav) {
    mobileMenuButton.addEventListener("click", () => {
        mobileNav.classList.toggle("active");
    });

    mobileNav.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            mobileNav.classList.remove("active");
        });
    });

    document.addEventListener("click", event => {
        if (
            !mobileNav.contains(event.target) &&
            !mobileMenuButton.contains(event.target)
        ) {
            mobileNav.classList.remove("active");
        }
    });
}

/* =========================================================
   FOOTER YEAR
========================================================= */

const yearElement = document.getElementById("vipYear");

if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
}

/* =========================================================
   AUTH STATE CHANGES
========================================================= */

supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAuthButton();
});

/* =========================================================
   INITIALIZE VIP PAGE
========================================================= */

async function initializeVIPPage() {
    try {
        await checkAuthentication();
        await loadVIPPlans();

    } catch (error) {
        console.error("VIP initialization error:", error);

    } finally {
        hideLoader();
    }
}

initializeVIPPage();
