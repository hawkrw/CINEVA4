/* =========================================================
   CINEVA VIP ROOM — MEMBER REQUESTS
   File: js/vip-room.js

   Access is enforced by Supabase RLS:
   - Members can read only their own requests/subscriptions.
   - Request inserts require an active VIP subscription.
   - VIP status is never trusted from browser storage.
========================================================= */

import { supabase } from "./config.js";

const $ = id => document.getElementById(id);

const loader = $("vipRoomLoader");
const accountLink = $("vipRoomAccount");
const menuButton = $("vipRoomMenuToggle");
const mobileNav = $("vipRoomMobileNav");
const requestForm = $("vipRequestForm");
const requestSubmit = $("vipRequestSubmit");
const requestMessage = $("vipRequestMessage");
const requestList = $("vipRoomRequestList");
const accessNotice = $("vipRoomAccessNotice");
const upgradePanel = $("vipRoomUpgrade");

let currentUser = null;
let activeSubscription = null;
let currentRequests = [];
let isSubmitting = false;

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function formatDate(value, includeTime = false) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-RW", {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
}

function hideLoader() {
    loader?.classList.add("is-hidden");
    window.setTimeout(() => loader?.remove(), 450);
}

function setRequestMessage(message, type = "info") {
    if (!requestMessage) return;
    requestMessage.textContent = message;
    requestMessage.dataset.type = type;
}

function setAccessNotice(state, title, message) {
    if (!accessNotice) return;
    accessNotice.dataset.state = state;
    accessNotice.replaceChildren();

    const strong = document.createElement("strong");
    strong.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = message;

    accessNotice.append(strong, paragraph);
}

function setRequestAccess(enabled) {
    if (requestSubmit) requestSubmit.disabled = !enabled || isSubmitting;

    requestForm?.querySelectorAll("input, select, textarea").forEach(control => {
        control.disabled = !enabled || isSubmitting;
    });
}

function updateAccountLink() {
    if (!accountLink) return;

    if (currentUser) {
        accountLink.textContent = "My Account";
        accountLink.href = "profile.html";
    } else {
        accountLink.textContent = "Sign In";
        accountLink.href = "login.html?redirect=vip-room.html";
    }
}

function showEmptyRequests(title, message) {
    if (!requestList) return;

    requestList.innerHTML = `
        <div class="vip-room-empty-state">
            <span aria-hidden="true">✦</span>
            <strong>${escapeHTML(title)}</strong>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

function renderRequests() {
    if (!requestList) return;

    if (!currentRequests.length) {
        showEmptyRequests(
            "No requests yet",
            "Your movie and series requests will appear here after you submit one."
        );
        return;
    }

    const statusLabels = {
        pending: "Pending review",
        approved: "Approved",
        processing: "Processing",
        added: "Added to CINEVA",
        rejected: "Not approved"
    };

    requestList.innerHTML = currentRequests.map(request => {
        const status = String(request.status || "pending").toLowerCase();
        const label = statusLabels[status] || status.replace(/_/g, " ");
        const type = String(request.content_type || "movie").toLowerCase();
        const year = request.release_year ? ` • ${request.release_year}` : "";
        const note = request.admin_note
            ? `<p class="vip-room-request-note">CINEVA team: ${escapeHTML(request.admin_note)}</p>`
            : "";

        return `
            <article class="vip-room-request-item">
                <div class="vip-room-request-icon" aria-hidden="true">${type === "series" ? "▤" : "▣"}</div>
                <div class="vip-room-request-main">
                    <strong>${escapeHTML(request.title || "Untitled request")}</strong>
                    <p>${type === "series" ? "TV Series" : "Movie"}${year} · Submitted ${escapeHTML(formatDate(request.created_at))}</p>
                    ${note}
                </div>
                <span class="vip-room-request-status" data-status="${escapeHTML(status)}">${escapeHTML(label)}</span>
            </article>
        `;
    }).join("");
}

async function loadRequestHistory() {
    if (!currentUser || !requestList) return;

    requestList.setAttribute("aria-busy", "true");

    try {
        const { data, error } = await supabase
            .from("vip_requests")
            .select("id, content_type, title, release_year, details, status, admin_note, created_at, updated_at")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false })
            .limit(50);

        if (error) throw error;

        currentRequests = data || [];
        $("vipRoomRequestCount").textContent = String(currentRequests.length);
        renderRequests();

    } catch (error) {
        console.error("VIP request history error:", error);
        showEmptyRequests(
            "Unable to load requests",
            "Please refresh this section and try again."
        );
    } finally {
        requestList.removeAttribute("aria-busy");
    }
}

async function loadMembership() {
    if (!currentUser) return false;

    const now = Date.now();

    const { data, error } = await supabase
        .from("vip_subscriptions")
        .select("id, plan_id, status, starts_at, expires_at")
        .eq("user_id", currentUser.id)
        .eq("status", "active")
        .lte("starts_at", new Date(now).toISOString())
        .gt("expires_at", new Date(now).toISOString())
        .order("expires_at", { ascending: false })
        .limit(1);

    if (error) throw error;

    activeSubscription = data?.[0] || null;

    if (!activeSubscription) {
        $("vipRoomMembershipStatus").textContent = "Not Active";
        $("vipRoomMembershipMessage").textContent = "An active VIP plan is required to submit requests.";
        $("vipRoomPlanName").textContent = "No active plan";
        $("vipRoomExpiry").textContent = "Choose a plan to unlock the room.";
        setAccessNotice("inactive", "VIP membership required", "Your account does not currently have an active VIP subscription.");
        upgradePanel.hidden = false;
        setRequestAccess(false);
        return false;
    }

    let planName = "CINEVA VIP";
    if (activeSubscription.plan_id) {
        const { data: plan, error: planError } = await supabase
            .from("vip_plans")
            .select("name")
            .eq("id", activeSubscription.plan_id)
            .maybeSingle();

        if (planError) {
            console.warn("VIP plan name lookup failed:", planError);
        } else if (plan?.name) {
            planName = plan.name;
        }
    }

    $("vipRoomMembershipStatus").textContent = "Active";
    $("vipRoomMembershipMessage").textContent = "Your VIP request privileges are unlocked.";
    $("vipRoomPlanName").textContent = planName;
    $("vipRoomExpiry").textContent = `Expires ${formatDate(activeSubscription.expires_at)}`;
    setAccessNotice("active", "VIP access confirmed", "Your membership is active. You can submit movie and series requests below.");
    upgradePanel.hidden = true;
    setRequestAccess(true);

    return true;
}

function updateCharacterCount() {
    const field = $("vipRequestDetails");
    const count = $("vipRequestCharCount");
    if (field && count) count.textContent = String(field.value.length);
}

function normalizeRequestDetails() {
    const details = $("vipRequestDetails")?.value.trim() || "";
    const language = $("vipRequestLanguage")?.value.trim() || "";

    if (!language) return details;
    const languageLine = `Preferred language: ${language}`;

    return details ? `${languageLine}\n\n${details}` : languageLine;
}

async function submitRequest(event) {
    event.preventDefault();

    if (isSubmitting) return;

    if (!currentUser) {
        setRequestMessage("Please sign in to submit a VIP request.", "error");
        window.location.href = "login.html?redirect=vip-room.html";
        return;
    }

    if (!activeSubscription) {
        setRequestMessage("An active VIP subscription is required.", "error");
        upgradePanel.hidden = false;
        return;
    }

    const contentType = $("vipRequestType")?.value;
    const title = $("vipRequestTitle")?.value.trim();
    const yearValue = $("vipRequestYear")?.value.trim();

    if (!["movie", "series"].includes(contentType)) {
        setRequestMessage("Choose Movie or TV Series.", "error");
        return;
    }

    if (!title || title.length < 2 || title.length > 160) {
        setRequestMessage("Enter a title between 2 and 160 characters.", "error");
        $("vipRequestTitle")?.focus();
        return;
    }

    const releaseYear = yearValue ? Number(yearValue) : null;
    if (releaseYear !== null && (!Number.isInteger(releaseYear) || releaseYear < 1900 || releaseYear > 2099)) {
        setRequestMessage("Enter a valid release year.", "error");
        $("vipRequestYear")?.focus();
        return;
    }

    isSubmitting = true;
    setRequestAccess(true);
    if (requestSubmit) requestSubmit.textContent = "Submitting request...";
    setRequestMessage("Sending your request securely...", "info");

    try {
        const { error } = await supabase
            .from("vip_requests")
            .insert({
                user_id: currentUser.id,
                content_type: contentType,
                title,
                release_year: releaseYear,
                details: normalizeRequestDetails()
            });

        if (error) throw error;

        requestForm.reset();
        updateCharacterCount();
        setRequestMessage("Your request has been submitted. You can track its progress below.", "success");
        await loadRequestHistory();

    } catch (error) {
        console.error("VIP request submission error:", error);

        if (error.code === "42501" || /row-level security|permission denied/i.test(error.message || "")) {
            setRequestMessage("Your VIP access could not be verified. Refresh your membership status or contact CINEVA support.", "error");
        } else {
            setRequestMessage(error.message || "Unable to submit your request. Please try again.", "error");
        }
    } finally {
        isSubmitting = false;
        if (requestSubmit) requestSubmit.textContent = "Submit VIP Request →";
        setRequestAccess(Boolean(activeSubscription));
    }
}

async function initializeRoom() {
    $("vipRoomYear").textContent = String(new Date().getFullYear());

    try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        currentUser = data?.user || null;
        updateAccountLink();

        if (!currentUser) {
            $("vipRoomMembershipStatus").textContent = "Sign In Required";
            $("vipRoomMembershipMessage").textContent = "Sign in to check your membership.";
            $("vipRoomPlanName").textContent = "—";
            $("vipRoomExpiry").textContent = "Your plan details will appear after sign-in.";
            $("vipRoomRequestCount").textContent = "0";
            setAccessNotice("error", "Sign in to continue", "Your VIP membership is linked to your CINEVA account.");
            setRequestAccess(false);
            showEmptyRequests("Sign in to view your requests", "Your private request history will appear here.");
            upgradePanel.hidden = true;
            return;
        }

        try {
            await loadMembership();
        } catch (error) {
            console.error("VIP membership check failed:", error);
            $("vipRoomMembershipStatus").textContent = "Unable to verify";
            $("vipRoomMembershipMessage").textContent = "Please refresh and try again.";
            setAccessNotice("error", "Membership check failed", "We could not verify your VIP status. No request will be submitted until access is confirmed.");
            setRequestAccess(false);
        }

        await loadRequestHistory();

    } catch (error) {
        console.error("VIP Room initialization error:", error);
        setAccessNotice("error", "Unable to load your account", "Please sign in again or refresh this page.");
        setRequestAccess(false);
        showEmptyRequests("Unable to load VIP Room", "Please refresh the page and try again.");
    } finally {
        hideLoader();
    }
}

menuButton?.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    if (mobileNav) mobileNav.hidden = isOpen;
});

mobileNav?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
        mobileNav.hidden = true;
        menuButton?.setAttribute("aria-expanded", "false");
    });
});

document.addEventListener("click", event => {
    if (
        mobileNav &&
        menuButton &&
        !mobileNav.hidden &&
        !mobileNav.contains(event.target) &&
        !menuButton.contains(event.target)
    ) {
        mobileNav.hidden = true;
        menuButton.setAttribute("aria-expanded", "false");
    }
});

$("vipRequestDetails")?.addEventListener("input", updateCharacterCount);
requestForm?.addEventListener("submit", submitRequest);
$("vipRoomRefresh")?.addEventListener("click", loadRequestHistory);

supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAccountLink();
});

initializeRoom();
