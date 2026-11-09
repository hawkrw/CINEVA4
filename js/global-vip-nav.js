/* CINEVA PRO — Global VIP navigation + mobile menu
   Loaded on every public page. Keeps each page's existing navigation intact. */
(() => {
  "use strict";
  if (window.__CINEVA_GLOBAL_VIP_NAV__) return;
  window.__CINEVA_GLOBAL_VIP_NAV__ = true;

  const style = document.createElement("style");
  style.textContent = `
    .cineva-vip-nav-link {
      display:inline-flex !important; align-items:center; justify-content:center; gap:7px;
      color:#fff !important; font-weight:800 !important; text-decoration:none !important;
      white-space:nowrap; border:1px solid rgba(192,132,252,.38) !important;
      border-radius:999px !important; padding:8px 14px !important;
      background:linear-gradient(110deg,rgba(139,53,245,.22),rgba(239,49,94,.16)) !important;
      box-shadow:0 5px 18px rgba(139,53,245,.12);
      transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease;
    }
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
    .mobile-bottom-nav .cineva-vip-bottom-link { color:#d5a7ff !important; }
    .mobile-bottom-nav .cineva-vip-bottom-link i { color:#c084fc; }
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

  const vipLink = () => {
    const a = document.createElement("a");
    a.href = "/vip.html";
    a.className = "cineva-vip-nav-link";
    a.innerHTML = '<i class="fa-solid fa-crown" aria-hidden="true"></i><span>VIP Membership</span>';
    a.setAttribute("aria-label","Explore CINEVA VIP Membership");
    return a;
  };

  document.querySelectorAll("header").forEach((header) => {
    const nav = header.querySelector("nav");
    if (nav) {
      nav.classList.add("cineva-mobile-nav-target");
      const existingVip = [...nav.querySelectorAll("a")].find((a) =>
        /(^|\/)vip(?:\.html)?(?:[?#]|$)/i.test(a.getAttribute("href") || "")
      );
      if (existingVip) {
        existingVip.classList.add("cineva-vip-nav-link");
        if (!existingVip.querySelector("i")) {
          const icon = document.createElement("i");
          icon.className = "fa-solid fa-crown";
          icon.setAttribute("aria-hidden","true");
          existingVip.prepend(icon);
        }
      } else {
        nav.appendChild(vipLink());
      }
    } else {
      const existingVip = [...header.querySelectorAll("a")].some((a) =>
        /(^|\/)vip(?:\.html)?(?:[?#]|$)/i.test(a.getAttribute("href") || "")
      );
      if (!existingVip) header.appendChild(vipLink());
    }

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

  // Keep VIP reachable from the persistent mobile bottom navigation too.
  document.querySelectorAll(".mobile-bottom-nav").forEach(nav => {
    const exists = [...nav.querySelectorAll("a")].some(a =>
      /(^|\\/)vip(?:\\.html)?(?:[?#]|$)/i.test(a.getAttribute("href") || "")
    );
    if (exists) return;
    const link = document.createElement("a");
    link.href = "/vip.html";
    link.className = "cineva-vip-bottom-link";
    link.innerHTML = '<i class="fa-solid fa-crown" aria-hidden="true"></i><span>VIP</span>';
    link.setAttribute("aria-label", "VIP Membership");
    nav.appendChild(link);
  });
})();