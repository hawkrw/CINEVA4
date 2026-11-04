
/* =========================================
   CINEVA — NAVIGATION CONTROLLER
========================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================
       ELEMENTS
    ===================================== */

    const header = document.querySelector(".main-header");
    const menuToggle = document.querySelector("#menu-toggle");
    const navMenu = document.querySelector("#nav-menu");
    const navLinks = document.querySelectorAll(".nav-link");

    /* =====================================
       MOBILE MENU
    ===================================== */

    function openMenu() {
        if (!navMenu || !menuToggle) return;

        navMenu.classList.add("active");
        menuToggle.classList.add("active");

        menuToggle.setAttribute("aria-expanded", "true");
        document.body.classList.add("menu-open");
    }

    function closeMenu() {
        if (!navMenu || !menuToggle) return;

        navMenu.classList.remove("active");
        menuToggle.classList.remove("active");

        menuToggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
    }

    function toggleMenu() {
        if (!navMenu) return;

        navMenu.classList.contains("active")
            ? closeMenu()
            : openMenu();
    }

    if (menuToggle) {
        menuToggle.addEventListener("click", toggleMenu);
    }

    /* =====================================
       CLOSE MENU WHEN LINK IS CLICKED
    ===================================== */

    navLinks.forEach(link => {
        link.addEventListener("click", closeMenu);
    });

    /* =====================================
       CLOSE MENU OUTSIDE NAVIGATION
    ===================================== */

    document.addEventListener("click", event => {
        if (!navMenu || !menuToggle) return;

        const clickedInside =
            navMenu.contains(event.target) ||
            menuToggle.contains(event.target);

        if (!clickedInside) {
            closeMenu();
        }
    });

    /* =====================================
       ESCAPE KEY
    ===================================== */

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });

    /* =====================================
       ACTIVE NAVIGATION LINK
    ===================================== */

    const currentPage = window.location.pathname
        .split("/")
        .pop() || "index.html";

    navLinks.forEach(link => {
        const linkPage = new URL(
            link.href,
            window.location.origin
        ).pathname.split("/").pop();

        const isActive = linkPage === currentPage;

        link.classList.toggle("active", isActive);

        if (isActive) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });

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

    window.addEventListener("scroll", handleScroll, {
        passive: true
    });

    handleScroll();

    /* =====================================
       CLOSE MENU ON RESIZE
    ===================================== */

    window.addEventListener("resize", () => {
        if (window.innerWidth > 900) {
            closeMenu();
        }
    });

    /* =====================================
       SMOOTH ANCHOR NAVIGATION
    ===================================== */

    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener("click", event => {
            const targetId = link.getAttribute("href");

            if (!targetId || targetId === "#") return;

            const target = document.querySelector(targetId);

            if (!target) return;

            event.preventDefault();

            target.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            closeMenu();
        });
    });

    console.log("CINEVA navigation initialized.");

});
