
/* =========================================================
   CINEVA PRO — SHARED NAVIGATION CONTROLLER
   File: js/navigation.js
========================================================= */

(() => {
    "use strict";

    const MOBILE_BREAKPOINT = 950;

    function initializeNavigation() {
        const header = document.querySelector("#mainHeader");

        const menuToggle =
            document.querySelector("#mobileMenuBtn") ||
            document.querySelector("#menu-toggle");

        const navMenu =
            document.querySelector("#navMenu") ||
            document.querySelector("#nav-menu");

        const navLinks = document.querySelectorAll(".nav-link");

        const themeToggle =
            document.querySelector("#themeToggle");

        const notificationBtn =
            document.querySelector("#notificationBtn");

        /* =====================================
           MOBILE MENU
        ===================================== */

        function setMenuState(open) {
            if (!navMenu || !menuToggle) return;

            navMenu.classList.toggle("active", open);
            menuToggle.classList.toggle("active", open);

            menuToggle.setAttribute(
                "aria-expanded",
                String(open)
            );

            document.body.classList.toggle(
                "menu-open",
                open
            );

            const icon = menuToggle.querySelector("i");

            if (icon) {
                icon.classList.toggle("fa-bars", !open);
                icon.classList.toggle("fa-xmark", open);
            }
        }

        function closeMenu() {
            setMenuState(false);
        }

        function toggleMenu() {
            if (!navMenu || !menuToggle) return;

            setMenuState(
                !navMenu.classList.contains("active")
            );
        }

        if (menuToggle && navMenu) {
            menuToggle.setAttribute(
                "aria-expanded",
                "false"
            );

            menuToggle.setAttribute(
                "aria-controls",
                navMenu.id || "navMenu"
            );

            menuToggle.addEventListener("click", (event) => {
                event.stopPropagation();
                toggleMenu();
            });

            navMenu.addEventListener("click", (event) => {
                if (event.target instanceof Element && event.target.closest("a")) {
                    closeMenu();
                }
            });

            document.addEventListener("click", (event) => {
                const clickedInside =
                    navMenu.contains(event.target) ||
                    menuToggle.contains(event.target);

                if (!clickedInside) {
                    closeMenu();
                }
            });

            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                    closeMenu();
                }
            });
        }

        /* =====================================
           ACTIVE NAVIGATION
        ===================================== */

        function updateActiveNavigation() {
            const currentURL = new URL(
                window.location.href
            );

            const currentPage =
                currentURL.pathname.split("/").pop() ||
                "index.html";

            const currentGenre =
                currentURL.searchParams.get("genre");

            const currentType =
                currentURL.searchParams.get("type");

            navLinks.forEach((link) => {
                const linkURL = new URL(
                    link.href,
                    window.location.origin
                );

                const linkPage =
                    linkURL.pathname.split("/").pop() ||
                    "index.html";

                const linkGenre =
                    linkURL.searchParams.get("genre");

                const linkType =
                    linkURL.searchParams.get("type");

                let active = false;

                // Homepage
                if (
                    linkPage === "index.html" &&
                    currentPage === "index.html" &&
                    !linkURL.hash
                ) {
                    active = true;
                }

                // Movies and series
                if (
                    linkPage === "genre.html" &&
                    currentPage === "genre.html" &&
                    linkType &&
                    currentType
                ) {
                    active = linkType === currentType;
                }

                // Genre navigation
                if (
                    linkPage === "genre.html" &&
                    currentPage === "genre.html" &&
                    linkGenre &&
                    currentGenre
                ) {
                    active =
                        linkGenre.toLowerCase() ===
                        currentGenre.toLowerCase();
                }

                // Other pages
                if (
                    linkPage !== "index.html" &&
                    linkPage !== "genre.html" &&
                    linkPage === currentPage
                ) {
                    active = true;
                }

                // Homepage category anchor
                if (
                    linkURL.pathname.endsWith("/index.html") &&
                    linkURL.hash === "#categories" &&
                    currentPage === "index.html" &&
                    currentURL.hash === "#categories"
                ) {
                    active = true;
                }

                link.classList.toggle("active", active);

                if (active) {
                    link.setAttribute(
                        "aria-current",
                        "page"
                    );
                } else {
                    link.removeAttribute("aria-current");
                }
            });
        }

        updateActiveNavigation();

        /* =====================================
           HEADER SCROLL EFFECT
        ===================================== */

        function handleScroll() {
            if (!header) return;

            header.classList.toggle(
                "scrolled",
                window.scrollY > 40
            );
        }

        window.addEventListener(
            "scroll",
            handleScroll,
            { passive: true }
        );

        handleScroll();

        /* =====================================
           RESPONSIVE MENU
        ===================================== */

        function handleResize() {
            if (
                window.innerWidth > MOBILE_BREAKPOINT
            ) {
                closeMenu();
            }
        }

        window.addEventListener(
            "resize",
            handleResize,
            { passive: true }
        );

        handleResize();

        /* =====================================
           SAME-PAGE ANCHOR NAVIGATION
        ===================================== */

        document.querySelectorAll('a[href^="#"]').forEach(
            (link) => {
                link.addEventListener("click", (event) => {
                    const targetID =
                        link.getAttribute("href");

                    if (!targetID || targetID === "#") {
                        return;
                    }

                    const target =
                        document.querySelector(targetID);

                    if (!target) return;

                    event.preventDefault();

                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });

                    closeMenu();
                });
            }
        );

        /* =====================================
           THEME TOGGLE
        ===================================== */

        if (themeToggle) {
            const savedTheme =
                localStorage.getItem("cineva-theme");

            if (savedTheme === "light") {
                document.body.classList.add("light-theme");
            }

            function updateThemeIcon() {
                const icon =
                    themeToggle.querySelector("i");

                const isLight =
                    document.body.classList.contains(
                        "light-theme"
                    );

                if (icon) {
                    icon.className = isLight
                        ? "fa-solid fa-moon"
                        : "fa-solid fa-sun";
                }

                themeToggle.setAttribute(
                    "aria-pressed",
                    String(isLight)
                );
            }

            themeToggle.addEventListener("click", () => {
                document.body.classList.toggle(
                    "light-theme"
                );

                const isLight =
                    document.body.classList.contains(
                        "light-theme"
                    );

                localStorage.setItem(
                    "cineva-theme",
                    isLight ? "light" : "dark"
                );

                updateThemeIcon();
            });

            updateThemeIcon();
        }

        /* =====================================
           CINEVA UPDATES & COMMUNITY CENTER
        ===================================== */

        async function initializeCommunityCenter() {
            if (!notificationBtn || document.querySelector("#cinevaCommunityOverlay")) return;

            const [{ supabase }, { getLatestContent }] = await Promise.all([
                import("./config.js"),
                import("./supabase.js")
            ]);

            const overlay = document.createElement("div");
            overlay.id = "cinevaCommunityOverlay";
            overlay.className = "cineva-community-overlay";
            overlay.setAttribute("aria-hidden", "true");
            overlay.innerHTML = `
                <section class="cineva-community-modal" role="dialog" aria-modal="true" aria-labelledby="cinevaCommunityTitle">
                    <header class="cineva-community-header">
                        <div class="cineva-community-brand">
                            <span class="cineva-community-brand-icon"><i class="fa-solid fa-bell"></i></span>
                            <div><h2 id="cinevaCommunityTitle">CINEVA Hub</h2><p>Updates, new releases & community</p></div>
                        </div>
                        <button type="button" class="cineva-community-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
                    </header>
                    <nav class="cineva-community-tabs" aria-label="CINEVA Hub sections">
                        <button type="button" class="active" data-community-tab="latest"><i class="fa-solid fa-clock"></i> Recently Added</button>
                        <button type="button" data-community-tab="updates"><i class="fa-solid fa-sparkles"></i> Updates</button>
                        <button type="button" data-community-tab="chat"><i class="fa-solid fa-comments"></i> Community Chat</button>
                    </nav>
                    <div class="cineva-community-content">
                        <section class="cineva-community-pane active" data-community-pane="latest">
                            <div class="cineva-community-section-heading"><div><h3>Fresh on CINEVA</h3><p>Latest movies and series from the library</p></div><span class="cineva-live-pill">LIVE LIBRARY</span></div>
                            <div class="cineva-latest-list" id="cinevaLatestList"><div class="cineva-community-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading new content...</div></div>
                        </section>
                        <section class="cineva-community-pane" data-community-pane="updates">
                            <div class="cineva-community-section-heading"><div><h3>What's new?</h3><p>Announcements, improvements and important notices</p></div></div>
                            <div class="cineva-announcement-list" id="cinevaAnnouncementList"><div class="cineva-community-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading updates...</div></div>
                        </section>
                        <section class="cineva-community-pane" data-community-pane="chat">
                            <div class="cineva-community-section-heading"><div><h3>Ask the community</h3><p>Everyone can read messages and help answer questions</p></div><span class="cineva-live-pill"><span></span> PUBLIC CHAT</span></div>
                            <div class="cineva-chat-notice"><i class="fa-solid fa-eye"></i><span>Public conversation: your display name and message are visible to everyone. Never share passwords, phone numbers or private information.</span></div>
                            <div class="cineva-chat-messages" id="cinevaChatMessages" aria-live="polite"><div class="cineva-community-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading public chat...</div></div>
                            <form class="cineva-chat-form" id="cinevaChatForm">
                                <label for="cinevaChatName">Display name</label>
                                <input id="cinevaChatName" name="display_name" maxlength="32" minlength="2" placeholder="Choose a name" autocomplete="nickname" required>
                                <div class="cineva-chat-compose"><textarea id="cinevaChatInput" name="message" rows="2" maxlength="1000" placeholder="Ask a question or help someone..." required></textarea><button type="submit" aria-label="Send message"><i class="fa-solid fa-paper-plane"></i></button></div>
                                <div class="cineva-chat-form-footer"><span id="cinevaChatStatus">Be kind. Keep it helpful.</span><span>Press Send to post publicly</span></div>
                            </form>
                        </section>
                    </div>
                </section>`;
            document.body.appendChild(overlay);

            const closeButton = overlay.querySelector(".cineva-community-close");
            const panes = [...overlay.querySelectorAll("[data-community-pane]")];
            const tabs = [...overlay.querySelectorAll("[data-community-tab]")];
            const latestList = overlay.querySelector("#cinevaLatestList");
            const announcementList = overlay.querySelector("#cinevaAnnouncementList");
            const chatMessages = overlay.querySelector("#cinevaChatMessages");
            const chatForm = overlay.querySelector("#cinevaChatForm");
            const chatName = overlay.querySelector("#cinevaChatName");
            const chatInput = overlay.querySelector("#cinevaChatInput");
            const chatStatus = overlay.querySelector("#cinevaChatStatus");
            let activeReply = null;
            let chatChannel = null;
            let loaded = false;

            const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({
                "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
            })[char]);

            function openCenter(tab = "latest") {
                overlay.classList.add("open");
                overlay.setAttribute("aria-hidden", "false");
                document.body.classList.add("cineva-community-open");
                setTab(tab);
                if (!loaded) loadCenter();
                if (tab === "chat") chatInput.focus({ preventScroll: true });
            }

            function closeCenter() {
                overlay.classList.remove("open");
                overlay.setAttribute("aria-hidden", "true");
                document.body.classList.remove("cineva-community-open");
                notificationBtn.classList.remove("notification-active");
            }

            function setTab(name) {
                tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.communityTab === name));
                panes.forEach(pane => pane.classList.toggle("active", pane.dataset.communityPane === name));
                if (name === "chat") loadChat();
            }

            function itemImage(item) {
                return item.poster || item.poster_path || item.image || item.thumbnail || item.backdrop || item.backdrop_path || "";
            }

            function renderLatest(items) {
                if (!items.length) {
                    latestList.innerHTML = '<div class="cineva-community-empty">No recent titles found yet.</div>';
                    return;
                }
                latestList.innerHTML = items.map(item => {
                    const title = escapeHTML(item.title || "Untitled");
                    const type = item.content_type === "series" ? "Series" : "Movie";
                    const poster = itemImage(item);
                    const date = item.latest_activity_at || item.created_at;
                    const href = item.content_type === "series"
                        ? `watch.html?id=${encodeURIComponent(item.id)}&type=series`
                        : `watch.html?id=${encodeURIComponent(item.id)}&type=movie`;
                    return `<a class="cineva-latest-item" href="${href}">
                        <span class="cineva-latest-poster">${poster ? `<img src="${escapeHTML(poster)}" alt="" loading="lazy">` : '<i class="fa-solid fa-film"></i>'}</span>
                        <span class="cineva-latest-info"><strong>${title}</strong><small>${type}${item.category ? " · " + escapeHTML(item.category) : ""}</small><small>${date && !Number.isNaN(Date.parse(date)) ? new Date(date).toLocaleDateString() : "Recently added"}</small></span>
                        <i class="fa-solid fa-chevron-right cineva-latest-arrow"></i>
                    </a>`;
                }).join("");
            }

            async function loadCenter() {
                loaded = true;
                try {
                    const [contentResult, announcementResult] = await Promise.all([
                        getLatestContent(24),
                        supabase.from("site_announcements").select("id,title,body,announcement_type,published_at").eq("is_active", true).lte("published_at", new Date().toISOString()).order("published_at", { ascending: false }).limit(30)
                    ]);
                    renderLatest(contentResult || []);
                    if (announcementResult.error) throw announcementResult.error;
                    const announcements = announcementResult.data || [];
                    announcementList.innerHTML = announcements.length ? announcements.map(item => `
                        <article class="cineva-announcement-card">
                            <span class="cineva-announcement-type ${escapeHTML(item.announcement_type)}">${escapeHTML(item.announcement_type)}</span>
                            <h4>${escapeHTML(item.title)}</h4><p>${escapeHTML(item.body)}</p>
                            <time>${item.published_at ? new Date(item.published_at).toLocaleString() : ""}</time>
                        </article>`).join("") : '<div class="cineva-community-empty">No announcements yet. Check back for CINEVA upgrades and news.</div>';
                } catch (error) {
                    console.error("CINEVA Hub loading failed:", error);
                    latestList.innerHTML = '<div class="cineva-community-empty">Could not load recent content. Please try again later.</div>';
                    announcementList.innerHTML = '<div class="cineva-community-empty">Updates are temporarily unavailable.</div>';
                }
            }

            function renderChat(messages) {
                if (!messages.length) {
                    chatMessages.innerHTML = '<div class="cineva-community-empty">Be the first to start a conversation.</div>';
                    return;
                }
                const byId = new Map(messages.map(message => [message.id, message]));
                chatMessages.innerHTML = messages.map(message => {
                    const parent = message.reply_to ? byId.get(message.reply_to) : null;
                    return `<article class="cineva-chat-message" id="cineva-message-${message.id}">
                        ${parent ? `<div class="cineva-chat-reply-context">Replying to <strong>${escapeHTML(parent.display_name)}</strong>: ${escapeHTML(parent.message.slice(0, 100))}</div>` : ""}
                        <div class="cineva-chat-message-top"><strong>${escapeHTML(message.display_name)}</strong><time>${new Date(message.created_at).toLocaleString()}</time></div>
                        <p>${escapeHTML(message.message).replace(/\n/g, "<br>")}</p>
                        <button type="button" class="cineva-reply-button" data-reply-id="${message.id}" data-reply-name="${escapeHTML(message.display_name)}"><i class="fa-solid fa-reply"></i> Reply</button>
                    </article>`;
                }).join("");
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }

            async function loadChat() {
                if (chatChannel) return;
                const { data, error } = await supabase.from("community_messages")
                    .select("id,display_name,message,reply_to,created_at")
                    .eq("is_hidden", false).order("created_at", { ascending: true }).limit(150);
                if (error) {
                    chatMessages.innerHTML = '<div class="cineva-community-empty">Public chat is temporarily unavailable.</div>';
                    console.error("CINEVA chat load failed:", error);
                    return;
                }
                renderChat(data || []);
                chatChannel = supabase.channel("cineva-public-community")
                    .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_messages" }, payload => {
                        if (payload.new && !payload.new.is_hidden) {
                            const exists = chatMessages.querySelector(`#cineva-message-${payload.new.id}`);
                            if (!exists) {
                                const current = [...chatMessages.querySelectorAll(".cineva-chat-message")].map(node => node.id.replace("cineva-message-", ""));
                                if (!current.length) {
                                    renderChat([payload.new]);
                                } else {
                                    const article = document.createElement("article");
                                    article.className = "cineva-chat-message";
                                    article.id = `cineva-message-${payload.new.id}`;
                                    article.innerHTML = `<div class="cineva-chat-message-top"><strong>${escapeHTML(payload.new.display_name)}</strong><time>${new Date(payload.new.created_at).toLocaleString()}</time></div><p>${escapeHTML(payload.new.message).replace(/\n/g, "<br>")}</p><button type="button" class="cineva-reply-button" data-reply-id="${payload.new.id}" data-reply-name="${escapeHTML(payload.new.display_name)}"><i class="fa-solid fa-reply"></i> Reply</button>`;
                                    chatMessages.appendChild(article);
                                    chatMessages.scrollTop = chatMessages.scrollHeight;
                                }
                            }
                        }
                    }).subscribe();
            }

            chatMessages.addEventListener("click", event => {
                const button = event.target.closest("[data-reply-id]");
                if (!button) return;
                activeReply = Number(button.dataset.replyId);
                chatStatus.textContent = `Replying to ${button.dataset.replyName}. Your reply will be public.`;
                chatInput.focus();
            });

            chatForm.addEventListener("submit", async event => {
                event.preventDefault();
                const displayName = chatName.value.trim();
                const message = chatInput.value.trim();
                if (displayName.length < 2 || message.length < 2) return;
                const sendButton = chatForm.querySelector('button[type="submit"]');
                sendButton.disabled = true;
                chatStatus.textContent = "Sending...";
                const { error } = await supabase.from("community_messages").insert({
                    display_name: displayName,
                    message,
                    reply_to: activeReply
                });
                sendButton.disabled = false;
                if (error) {
                    chatStatus.textContent = error.message.includes("wait a few seconds")
                        ? "Please wait a few seconds before posting again."
                        : error.message || "Could not send message. Try again.";
                    return;
                }
                chatInput.value = "";
                activeReply = null;
                chatStatus.textContent = "Posted publicly. Thanks for joining in!";
            });

            tabs.forEach(tab => tab.addEventListener("click", () => setTab(tab.dataset.communityTab)));
            closeButton.addEventListener("click", closeCenter);
            overlay.addEventListener("click", event => {
                if (event.target === overlay) closeCenter();
            });
            document.addEventListener("keydown", event => {
                if (event.key === "Escape" && overlay.classList.contains("open")) closeCenter();
            });
            notificationBtn.setAttribute("aria-haspopup", "dialog");
            notificationBtn.setAttribute("aria-controls", overlay.id);
            notificationBtn.addEventListener("click", event => {
                event.preventDefault();
                notificationBtn.classList.add("notification-active");
                openCenter();
            });
        }

        initializeCommunityCenter().catch(error => console.error("CINEVA Hub initialization failed:", error));

        /* =====================================
           BACK TO TOP
        ===================================== */

        const scrollTopButton = document.querySelector("#scrollTop, #back-to-top");

        if (scrollTopButton) {
            const updateScrollTopVisibility = () => {
                scrollTopButton.classList.toggle("show", window.scrollY > 320);
            };

            window.addEventListener("scroll", updateScrollTopVisibility, { passive: true });

            scrollTopButton.addEventListener("click", () => {
                window.scrollTo({ top: 0, behavior: "smooth" });
            });

            updateScrollTopVisibility();
        }

console.log(
            "CINEVA shared navigation initialized."
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeNavigation,
            { once: true }
        );
    } else {
        initializeNavigation();
    }
})();
