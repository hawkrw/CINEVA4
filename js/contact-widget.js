
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
        <div class="cineva-contact-menu whatsapp-menu" id="cinevaWhatsAppMenu" hidden>
            <div class="cineva-menu-heading">
                <i class="fa-brands fa-whatsapp"></i>
                <span>Choose WhatsApp number</span>
            </div>
            ${contacts.map(contact => `
                <a href="https://wa.me/${contact.number.replace("+", "")}"
                   target="_blank"
                   rel="noopener noreferrer">
                    <span>${contact.display}</span>
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                </a>
            `).join("")}
        </div>

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

        <button class="cineva-float-button cineva-whatsapp"
                id="cinevaWhatsAppButton"
                aria-label="WhatsApp CINEVA"
                aria-expanded="false">
            <i class="fa-brands fa-whatsapp"></i>
            <span class="cineva-float-label">WhatsApp</span>
            <span class="cineva-float-wave"></span>
        </button>

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

        const whatsappButton = document.getElementById("cinevaWhatsAppButton");
        const callButton = document.getElementById("cinevaCallButton");
        const whatsappMenu = document.getElementById("cinevaWhatsAppMenu");
        const callMenu = document.getElementById("cinevaCallMenu");

        function closeMenus() {
            whatsappMenu.hidden = true;
            callMenu.hidden = true;
            whatsappButton.setAttribute("aria-expanded", "false");
            callButton.setAttribute("aria-expanded", "false");
        }

        whatsappButton.addEventListener("click", event => {
            event.stopPropagation();

            const shouldOpen = whatsappMenu.hidden;
            closeMenus();

            whatsappMenu.hidden = !shouldOpen;
            whatsappButton.setAttribute("aria-expanded", String(shouldOpen));
        });

        callButton.addEventListener("click", event => {
            event.stopPropagation();

            const shouldOpen = callMenu.hidden;
            closeMenus();

            callMenu.hidden = !shouldOpen;
            callButton.setAttribute("aria-expanded", String(shouldOpen));
        });

        whatsappMenu.addEventListener("click", event => event.stopPropagation());
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
