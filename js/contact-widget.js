/* =========================================================
   CINEVA — GLOBAL WHATSAPP FLOATING WIDGET
   Group • Channel • Direct support
========================================================= */

(() => {
    "use strict";

    if (window.__cinevaWhatsAppWidgetLoaded) return;
    window.__cinevaWhatsAppWidgetLoaded = true;

    const links = {
        group: "https://chat.whatsapp.com/FgsooLes8rQAQRjGbpfqY5?s=cl&p=a&mlu=4&ilr=4&iam=2",
        channel: "https://whatsapp.com/channel/0029Vb6gSfuFcowDBIM2rp2u",
        direct: "https://wa.me/250783948792"
    };

    function initializeWidget() {
        if (!document.body || document.querySelector(".cineva-floating-contacts")) return;

        const widget = document.createElement("div");
        widget.className = "cineva-floating-contacts";
        widget.innerHTML = `
            <section class="cineva-whatsapp-panel"
                     id="cinevaWhatsAppPanel"
                     aria-label="CINEVA WhatsApp links"
                     aria-hidden="true"
                     hidden>
                <div class="cineva-whatsapp-panel-header">
                    <span class="cineva-whatsapp-panel-icon" aria-hidden="true">✦</span>
                    <div>
                        <strong>Connect with CINEVA</strong>
                        <small>Choose how you'd like to reach us</small>
                    </div>
                </div>

                <a class="cineva-whatsapp-option" href="${links.group}"
                   target="_blank" rel="noopener noreferrer">
                    <span class="cineva-whatsapp-option-icon" aria-hidden="true">👥</span>
                    <span class="cineva-whatsapp-option-copy">
                        <strong>WhatsApp Group</strong>
                        <small>Join the CINEVA community</small>
                    </span>
                    <span class="cineva-whatsapp-option-arrow" aria-hidden="true">↗</span>
                </a>

                <a class="cineva-whatsapp-option" href="${links.channel}"
                   target="_blank" rel="noopener noreferrer">
                    <span class="cineva-whatsapp-option-icon" aria-hidden="true">📢</span>
                    <span class="cineva-whatsapp-option-copy">
                        <strong>WhatsApp Channel</strong>
                        <small>Get CINEVA updates</small>
                    </span>
                    <span class="cineva-whatsapp-option-arrow" aria-hidden="true">↗</span>
                </a>

                <a class="cineva-whatsapp-option" href="${links.direct}"
                   target="_blank" rel="noopener noreferrer">
                    <span class="cineva-whatsapp-option-icon" aria-hidden="true">💬</span>
                    <span class="cineva-whatsapp-option-copy">
                        <strong>Chat with Support</strong>
                        <small>+250 783 948 792</small>
                    </span>
                    <span class="cineva-whatsapp-option-arrow" aria-hidden="true">↗</span>
                </a>
            </section>

            <button class="cineva-whatsapp-float"
                    id="cinevaWhatsAppToggle"
                    type="button"
                    aria-label="Open WhatsApp contact options"
                    aria-controls="cinevaWhatsAppPanel"
                    aria-expanded="false"
                    title="Chat with CINEVA on WhatsApp">
                <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d="M16.02 3.2c-7.05 0-12.78 5.7-12.78 12.72 0 2.24.59 4.43 1.7 6.36L3.13 28.8l6.72-1.76a12.86 12.86 0 0 0 6.16 1.56h.01c7.04 0 12.77-5.7 12.78-12.72a12.6 12.6 0 0 0-3.75-8.98 12.73 12.73 0 0 0-9.03-3.7Zm0 23.23h-.01c-1.9 0-3.77-.5-5.4-1.47l-.39-.23-3.99 1.04 1.06-3.88-.25-.4a10.5 10.5 0 0 1-1.62-5.57c0-5.82 4.76-10.55 10.61-10.55 2.83 0 5.49 1.1 7.49 3.09a10.45 10.45 0 0 1 3.1 7.47c0 5.82-4.76 10.5-10.6 10.5Zm5.82-7.9c-.32-.16-1.88-.92-2.17-1.02-.29-.1-.5-.16-.7.16-.2.31-.8 1.02-.98 1.23-.18.2-.36.23-.68.08-.32-.16-1.34-.5-2.55-1.58-.94-.83-1.58-1.86-1.77-2.18-.18-.31-.02-.48.14-.64.14-.14.32-.36.48-.54.16-.18.21-.31.32-.52.1-.2.05-.39-.03-.54-.08-.16-.7-1.69-.96-2.31-.25-.6-.5-.52-.7-.53h-.6c-.21 0-.55.08-.84.39-.29.31-1.1 1.07-1.1 2.6 0 1.54 1.12 3.02 1.28 3.23.16.2 2.2 3.34 5.33 4.68.75.32 1.34.51 1.8.65.76.24 1.45.2 2 .12.61-.09 1.88-.77 2.15-1.51.26-.75.26-1.39.18-1.52-.08-.13-.29-.2-.61-.36Z"/>
                </svg>
                <span class="cineva-whatsapp-pulse" aria-hidden="true"></span>
            </button>
        `;

        document.body.appendChild(widget);

        const toggle = widget.querySelector("#cinevaWhatsAppToggle");
        const panel = widget.querySelector("#cinevaWhatsAppPanel");

        function setOpen(open) {
            panel.hidden = !open;
            panel.setAttribute("aria-hidden", String(!open));
            toggle.setAttribute("aria-expanded", String(open));
            toggle.setAttribute(
                "aria-label",
                open ? "Close WhatsApp contact options" : "Open WhatsApp contact options"
            );
            toggle.classList.toggle("is-open", open);
        }

        toggle.addEventListener("click", event => {
            event.stopPropagation();
            setOpen(panel.hidden);
        });

        panel.addEventListener("click", event => event.stopPropagation());

        document.addEventListener("click", event => {
            if (!widget.contains(event.target)) setOpen(false);
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && !panel.hidden) {
                setOpen(false);
                toggle.focus();
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeWidget, { once: true });
    } else {
        initializeWidget();
    }
})();
