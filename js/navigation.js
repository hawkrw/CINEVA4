
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
                if (event.target.closest("a")) {
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
           NOTIFICATIONS
        ===================================== */

        if (notificationBtn) {
            notificationBtn.addEventListener("click", () => {
                notificationBtn.classList.toggle(
                    "notification-active"
                );
            });
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
