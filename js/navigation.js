
/* =========================================================
   CINEVA — PREMIUM NAVIGATION CONTROLLER
   File: js/navigation.js
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    "use strict";

    /* =====================================================
       01. ELEMENT SELECTORS
    ===================================================== */

    const header = document.querySelector("#mainHeader");

    // Support both current and older HTML IDs.
    const menuToggle =
        document.querySelector("#mobileMenuBtn") ||
        document.querySelector("#menu-toggle");

    const navMenu =
        document.querySelector("#navMenu") ||
        document.querySelector("#nav-menu");

    const navLinks = document.querySelectorAll(".nav-link");

    const themeToggle = document.querySelector("#themeToggle");

    const notificationBtn =
        document.querySelector("#notificationBtn");


    /* =====================================================
       02. MOBILE MENU
    ===================================================== */

    function openMenu() {

        if (!navMenu || !menuToggle) return;

        navMenu.classList.add("active");
        menuToggle.classList.add("active");

        menuToggle.setAttribute("aria-expanded", "true");

        document.body.classList.add("menu-open");

        const icon = menuToggle.querySelector("i");

        if (icon) {
            icon.classList.replace("fa-bars", "fa-xmark");
        }

    }


    function closeMenu() {

        if (!navMenu || !menuToggle) return;

        navMenu.classList.remove("active");
        menuToggle.classList.remove("active");

        menuToggle.setAttribute("aria-expanded", "false");

        document.body.classList.remove("menu-open");

        const icon = menuToggle.querySelector("i");

        if (icon) {
            icon.classList.replace("fa-xmark", "fa-bars");
        }

    }


    function toggleMenu() {

        if (!navMenu) return;

        if (navMenu.classList.contains("active")) {
            closeMenu();
        } else {
            openMenu();
        }

    }


    if (menuToggle && navMenu) {

        menuToggle.addEventListener("click", event => {

            event.stopPropagation();

            toggleMenu();

        });

    }


    /* =====================================================
       03. CLOSE MENU AFTER NAVIGATION
    ===================================================== */

    navLinks.forEach(link => {

        link.addEventListener("click", () => {

            closeMenu();

        });

    });


    /* =====================================================
       04. CLOSE MENU WHEN CLICKING OUTSIDE
    ===================================================== */

    document.addEventListener("click", event => {

        if (!navMenu || !menuToggle) return;

        const clickedInside =
            navMenu.contains(event.target) ||
            menuToggle.contains(event.target);

        if (!clickedInside) {
            closeMenu();
        }

    });


    /* =====================================================
       05. ESCAPE KEY
    ===================================================== */

    document.addEventListener("keydown", event => {

        if (event.key === "Escape") {

            closeMenu();

        }

    });


    /* =====================================================
       06. ACTIVE NAVIGATION LINKS
    ===================================================== */

    function updateActiveNavigation() {

        const currentURL = new URL(window.location.href);

        const currentPage =
            currentURL.pathname.split("/").pop() || "index.html";

        const currentGenre = currentURL.searchParams.get("genre");
        const currentType = currentURL.searchParams.get("type");

        navLinks.forEach(link => {

            const linkURL = new URL(link.href, window.location.origin);

            const linkPage =
                linkURL.pathname.split("/").pop() || "index.html";

            const linkGenre = linkURL.searchParams.get("genre");
            const linkType = linkURL.searchParams.get("type");

            let isActive = false;

            // Homepage
            if (linkPage === "index.html" && currentPage === "index.html") {
                isActive = true;
            }

            // Movie and series navigation
            else if (
                linkPage === "genre.html" &&
                currentPage === "genre.html"
            ) {

                if (linkType && currentType) {
                    isActive = linkType === currentType;
                }

                else if (linkGenre && currentGenre) {
                    isActive =
                        linkGenre.toLowerCase() === currentGenre.toLowerCase();
                }

            }

            // Other pages
            else if (
                linkPage !== "index.html" &&
                linkPage !== "genre.html" &&
                linkPage === currentPage
            ) {

                isActive = true;

            }

            // Category anchor
            if (
                link.getAttribute("href") === "#categories" &&
                currentPage === "index.html" &&
                currentURL.hash === "#categories"
            ) {

                isActive = true;

            }

            link.classList.toggle("active", isActive);

            if (isActive) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }

        });

    }

    updateActiveNavigation();


    /* =====================================================
       07. HEADER SCROLL EFFECT
    ===================================================== */

    function handleScroll() {

        if (!header) return;

        header.classList.toggle(
            "scrolled",
            window.scrollY > 40
        );

    }

    window.addEventListener("scroll", handleScroll, {
        passive: true
    });

    handleScroll();


    /* =====================================================
       08. RESPONSIVE MENU CONTROL
    ===================================================== */

    function handleResize() {

        if (window.innerWidth > 900) {
            closeMenu();
        }

    }

    window.addEventListener("resize", handleResize);


    /* =====================================================
       09. SMOOTH ANCHOR NAVIGATION
    ===================================================== */

    document.querySelectorAll('a[href^="#"]').forEach(link => {

        link.addEventListener("click", event => {

            const targetID = link.getAttribute("href");

            if (!targetID || targetID === "#") return;

            const target = document.querySelector(targetID);

            if (!target) return;

            event.preventDefault();

            target.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            closeMenu();

        });

    });


    /* =====================================================
       10. THEME TOGGLE
       Applies a class for your light-theme CSS.
    ===================================================== */

    if (themeToggle) {

        const savedTheme = localStorage.getItem("cineva-theme");

        if (savedTheme === "light") {

            document.body.classList.add("light-theme");

        }

        function updateThemeIcon() {

            const icon = themeToggle.querySelector("i");

            const isLight =
                document.body.classList.contains("light-theme");

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

            document.body.classList.toggle("light-theme");

            const isLight =
                document.body.classList.contains("light-theme");

            localStorage.setItem(
                "cineva-theme",
                isLight ? "light" : "dark"
            );

            updateThemeIcon();

        });

        updateThemeIcon();

    }


    /* =====================================================
       11. NOTIFICATION BUTTON
    ===================================================== */

    if (notificationBtn) {

        notificationBtn.addEventListener("click", () => {

            notificationBtn.classList.toggle("notification-active");

        });

    }


    /* =====================================================
       12. INITIALIZATION
    ===================================================== */

    console.log("CINEVA premium navigation initialized.");

});
