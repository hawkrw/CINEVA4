
/* =========================================================
   CINEVA GLOBAL FLOATING CONTACT BUTTONS
========================================================= */

(() => {
    const contacts = [
        { number: "+250783948792", display: "+250 783 948 792" },
        { number: "+250725426553", display: "+250 725 426 553" }
    ];

    const widget = document.createElement("div");
    widget.className = "cineva-floating-contacts";

    widget.innerHTML = `
        <div class="cineva-contact-menu call-menu" id="cinevaCallMenu" hidden>
            <div class="cineva-menu-heading">
                <i class="fa-solid fa-phone"></i>
                <span>Choose call number</span>
            </div>
            ${contacts.map(contact => `
                <a href="tel:${contact.number}">
                    <span>${contact.display}</span>
                    <i class="fa-solid fa-phone"></i>
                </a>
            `).join("")}
        </div>

        <a class="cineva-float-button cineva-whatsapp"
           id="cinevaWhatsAppButton"
           href="https://chat.whatsapp.com/FgsooLes8rQAQRjGbpfqY5"
           target="_blank"
           rel="noopener noreferrer"
           aria-label="Join the CINEVA WhatsApp group"
           title="Join the CINEVA WhatsApp group">
            <i class="fa-brands fa-whatsapp"></i>
            <span class="cineva-float-label">Join WhatsApp Group</span>
            <span class="cineva-float-wave"></span>
        </a>

        <button class="cineva-float-button cineva-call"
                id="cinevaCallButton"
                aria-label="Call CINEVA"
                aria-expanded="false">
            <i class="fa-solid fa-phone"></i>
            <span class="cineva-float-label">Call Us</span>
            <span class="cineva-float-wave"></span>
        </button>
    `;

    function initializeWidget() {
        if (document.querySelector(".cineva-floating-contacts")) return;

        document.body.appendChild(widget);

        const callButton = document.getElementById("cinevaCallButton");
        const callMenu = document.getElementById("cinevaCallMenu");

        function closeMenus() {
            callMenu.hidden = true;
            callButton.setAttribute("aria-expanded", "false");
        }

        callButton.addEventListener("click", event => {
            event.stopPropagation();

            const shouldOpen = callMenu.hidden;
            closeMenus();

            callMenu.hidden = !shouldOpen;
            callButton.setAttribute("aria-expanded", String(shouldOpen));
        });

        callMenu.addEventListener("click", event => event.stopPropagation());

        document.addEventListener("click", closeMenus);

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") closeMenus();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeWidget);
    } else {
        initializeWidget();
    }
})();
