/* CINEVA PRO — Global VIP navigation + mobile menu
   Loaded on every public page. Keeps each page's existing navigation intact. */
(() => {
  "use strict";
  if (window.__CINEVA_GLOBAL_VIP_NAV__) return;
  window.__CINEVA_GLOBAL_VIP_NAV__ = true;

  const style = document.createElement("style");
  style.textContent = `
    .cineva-vip-nav-link:hover { transform:translateY(-1px); border-color:#a855f7 !important; box-shadow:0 8px 24px rgba(139,53,245,.25); }
    .cineva-vip-nav-link i { color:#d5a7ff; }
    .cineva-mobile-menu-toggle {
      display:none; align-items:center; justify-content:center; gap:7px;
      min-width:42px; height:42px; padding:0 11px; border:1px solid rgba(255,255,255,.14);
      border-radius:12px; background:rgba(139,53,245,.14); color:#fff; font-size:19px;
      cursor:pointer; -webkit-tap-highlight-color:transparent;
    }
    .cineva-mobile-menu-toggle:focus-visible { outline:2px solid #a855f7; outline-offset:3px; }
    @media(max-width:768px) {
      header .cineva-mobile-menu-toggle { display:inline-flex; }
      header nav.cineva-mobile-nav-target {
        display:none !important; position:absolute !important; top:calc(100% + 1px) !important;
        left:0 !important; right:0 !important; z-index:11000 !important;
        width:100% !important; max-height:calc(100dvh - 90px); overflow-y:auto;
        padding:14px !important; flex-direction:column !important; align-items:stretch !important;
        gap:7px !important; background:rgba(10,9,22,.98) !important;
        border:1px solid rgba(168,85,247,.2) !important; border-top:0 !important;
        border-radius:0 0 17px 17px; box-shadow:0 18px 35px rgba(0,0,0,.42);
        backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);
      }
      header nav.cineva-mobile-nav-target.cineva-mobile-nav-open,
      header nav.cineva-mobile-nav-target.active { display:flex !important; }
      header nav.cineva-mobile-nav-target > a { width:100%; min-height:42px; padding:10px 13px !important; border-radius:10px; }
      header nav.cineva-mobile-nav-target .cineva-vip-nav-link { justify-content:flex-start; border-radius:11px !important; }
      header:has(> .cineva-mobile-menu-toggle), header:has(.cineva-mobile-menu-toggle) { position:relative; }
      .info-header, .profile-header, .translator-header { gap:10px; }
    }
    .cineva-header-favorites { position:relative; display:inline-flex !important; align-items:center; justify-content:center; width:40px; min-width:40px; height:40px; border-radius:12px; color:#fff !important; text-decoration:none !important; font-size:18px; -webkit-tap-highlight-color:transparent; }
    .cineva-header-favorites:hover { background:rgba(139,53,245,.16); }
    .cineva-favorite-count { position:absolute; top:-5px; right:-7px; min-width:17px; height:17px; padding:0 4px; display:none; align-items:center; justify-content:center; border-radius:999px; background:#ef315e; color:#fff; font-size:9px; font-weight:900; line-height:1; border:2px solid #0d0d19; }
    .cineva-favorite-count.is-visible { display:inline-flex; }
    .cineva-header-favorites[aria-current="page"] { color:#d5a7ff !important; }
    @media(max-width:768px) {
      .mobile-bottom-nav > a { min-width:0; padding-left:2px; padding-right:2px; }
      .mobile-bottom-nav > a span { white-space:nowrap; }
    }
    @media(max-width:380px) {
      .cineva-mobile-menu-toggle { min-width:38px; height:38px; }
      .cineva-vip-nav-link { padding:8px 11px !important; font-size:12px; }
    }
  `;
  document.head.appendChild(style);

  // Keep one consistent Favorites shortcut in every site header.
  document.querySelectorAll("header").forEach(header => {
    const actions = header.querySelector(".nav-actions") || header.querySelector(".header-container") || header.querySelector(".navbar") || header;
    let favorite = [...header.querySelectorAll('a[href*="profile.html#favorites"],a[href*="#favorites"]')][0];
    if (!favorite) {
      favorite = document.createElement("a");
      favorite.href = "/profile.html#favorites";
      favorite.innerHTML = '<i class="fa-regular fa-heart" aria-hidden="true"></i>';
      favorite.setAttribute("aria-label","Open saved favorites");
      actions.appendChild(favorite);
    }
    favorite.classList.add("cineva-header-favorites");
    favorite.href = "/profile.html#favorites";
    favorite.setAttribute("aria-label","Open saved favorites");
    favorite.setAttribute("title","Saved favorites");
    let count = favorite.querySelector(".cineva-favorite-count");
    if (!count) {
      count = document.createElement("span");
      count.className = "cineva-favorite-count";
      count.setAttribute("aria-live","polite");
      favorite.appendChild(count);
    }
    const updateCount = () => {
      let items = [];
      try { const parsed = JSON.parse(localStorage.getItem("cineva_favorites") || "[]"); items = Array.isArray(parsed) ? parsed : []; } catch (_) {}
      count.textContent = items.length > 99 ? "99+" : String(items.length);
      count.classList.toggle("is-visible", items.length > 0);
    };
    updateCount();
    if (!favorite.dataset.cinevaCountBound) {
      favorite.dataset.cinevaCountBound = "true";
      window.addEventListener("storage", event => { if (event.key === "cineva_favorites") updateCount(); });
      window.addEventListener("cineva:favorites-updated", updateCount);
    }
  });

  // Mobile and desktop Movies/Series controls always open their dedicated catalogues.
  document.querySelectorAll('a[href*="genre.html?type=movie"],a[href*="genre.html?type=series"]').forEach(link => {
    const href = link.getAttribute("href") || "";
    link.href = /type=series/i.test(href) ? "/series.html" : "/movies.html";
  });

  document.querySelectorAll("header").forEach((header) => {
    const nav = header.querySelector("nav");
    if (nav) nav.classList.add("cineva-mobile-nav-target");
    header.querySelectorAll('a[href*="/admin/index.html"],a.nav-admin-link').forEach(link => link.remove());

    const hasMenuControl = header.querySelector(
      "#mobileMenuBtn,#menu-toggle,#vipMenuBtn,#vipRoomMenuToggle,.mobile-menu-btn,.menu-toggle,.vip-room-menu-toggle"
    );
    if (!nav || hasMenuControl) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cineva-mobile-menu-toggle";
    button.setAttribute("aria-label","Open navigation menu");
    button.setAttribute("aria-expanded","false");
    button.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    button.addEventListener("click", () => {
      const open = !nav.classList.contains("cineva-mobile-nav-open");
      nav.classList.toggle("cineva-mobile-nav-open",open);
      button.setAttribute("aria-expanded",String(open));
      button.setAttribute("aria-label",open ? "Close navigation menu" : "Open navigation menu");
      button.innerHTML = open
        ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        nav.classList.remove("cineva-mobile-nav-open");
        button.setAttribute("aria-expanded","false");
        button.setAttribute("aria-label","Open navigation menu");
        button.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
      }
    });
    header.appendChild(button);
  });

  // VIP membership shortcut on all public pages except the homepage.
  const currentPath = (window.location.pathname || "/").replace(/\\/+$/, "") || "/";
  const isHomePage = currentPath === "/" || currentPath.toLowerCase() === "/index.html";
  if (!isHomePage && !document.querySelector(".cineva-vip-floating")) {
    const floating = document.createElement("a");
    floating.href = "/vip.html";
    floating.className = "cineva-vip-floating";
    floating.innerHTML = '<i class="fa-solid fa-crown" aria-hidden="true"></i><span>VIP MEMBERSHIP</span>';
    floating.setAttribute("aria-label", "Explore CINEVA VIP Membership");
    floating.title = "CINEVA VIP Membership";
    document.body.appendChild(floating);
  }
})();
/* VIP membership floating shortcut — left side on all pages except home. */
.cineva-vip-floating{position:fixed!important;left:0!important;top:50%!important;transform:translateY(-50%)!important;z-index:12000!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:9px!important;width:42px!important;min-height:154px!important;padding:13px 10px!important;border:1px solid rgba(216,180,254,.42)!important;border-left:0!important;border-radius:0 14px 14px 0!important;color:#fff!important;background:linear-gradient(180deg,#9b45f5 0%,#6423b8 55%,#40166f 100%)!important;box-shadow:5px 8px 25px rgba(0,0,0,.34),0 0 22px rgba(139,53,245,.25)!important;text-decoration:none!important;writing-mode:vertical-rl!important;font-size:10px!important;font-weight:900!important;letter-spacing:1.25px!important;transition:width .2s ease,filter .2s ease,box-shadow .2s ease!important;-webkit-tap-highlight-color:transparent}
.cineva-vip-floating i{font-size:15px!important;color:#ffe7a3!important}
.cineva-vip-floating:hover,.cineva-vip-floating:focus-visible{width:48px!important;filter:brightness(1.12);box-shadow:7px 10px 28px rgba(0,0,0,.4),0 0 26px rgba(168,85,247,.4)!important;outline:none}
@media(max-width:600px){.cineva-vip-floating{width:34px!important;min-height:126px!important;padding:10px 7px!important;font-size:8px!important;letter-spacing:1px!important;border-radius:0 11px 11px 0!important}.cineva-vip-floating i{font-size:13px!important}}
