/* CINEVA — shared, touch-friendly favorites controller */
(() => {
  "use strict";
  if (window.__CINEVA_FAVORITES_READY__) return;
  window.__CINEVA_FAVORITES_READY__ = true;

  const STORAGE_KEY = "cineva_favorites";
  const readFavorites = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  };
  const writeFavorites = (items) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch (error) {
      console.error("CINEVA favorites could not be saved:", error);
      return false;
    }
  };
  const getItem = (button) => {
    try {
      return JSON.parse(decodeURIComponent(button.dataset.favorite || ""));
    } catch (_) {
      try { return JSON.parse(button.dataset.favorite || ""); } catch (_) { return null; }
    }
  };
  const keyOf = (item) => String(item?.id ?? "") + "::" +
    (String(item?.content_type || item?.type || "movie").toLowerCase() === "series" ? "series" : "movie");
  const isSaved = (item, items = readFavorites()) =>
    items.some(saved => keyOf(saved) === keyOf(item));

  function paintButton(button, active) {
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Remove from favorites" : "Add to favorites");
    button.title = active ? "Remove from favorites" : "Add to favorites";
    const icon = button.querySelector("i");
    if (icon) icon.className = active
      ? "fa-solid fa-heart"
      : "fa-regular fa-heart";
  }

  function syncButtons(root = document) {
    const items = readFavorites();
    root.querySelectorAll?.(".card-favorite[data-favorite]").forEach(button => {
      const item = getItem(button);
      if (item) paintButton(button, isSaved(item, items));
    });
  }

  let toastTimer;
  function notify(message) {
    let toast = document.getElementById("cinevaFavoriteToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "cinevaFavoriteToast";
      toast.className = "cineva-favorite-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
  }

  document.addEventListener("click", event => {
    const button = event.target.closest(".card-favorite[data-favorite]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    const item = getItem(button);
    if (!item || item.id == null) {
      notify("This title could not be saved.");
      return;
    }

    const favorites = readFavorites();
    const key = keyOf(item);
    const exists = favorites.some(saved => keyOf(saved) === key);
    const updated = exists
      ? favorites.filter(saved => keyOf(saved) !== key)
      : [...favorites, item];

    if (!writeFavorites(updated)) {
      notify("Could not save favorites. Check your browser storage.");
      return;
    }

    syncButtons();
    window.dispatchEvent(new Event("cineva:favorites-updated"));
    notify(exists ? "Removed from your favorites" : "Added to your favorites");
  }, true);

  window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY) syncButtons();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => syncButtons(), { once: true });
  } else {
    syncButtons();
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          if (node.matches?.(".card-favorite[data-favorite]")) {
            const item = getItem(node);
            if (item) paintButton(node, isSaved(item));
          }
          syncButtons(node);
        }
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();