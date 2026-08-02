"use strict";

(() => {
    const openButton = document.getElementById("menuButton");
    const closeButton = document.getElementById("menuCloseButton");
    const drawer = document.getElementById("sideDrawer");
    const backdrop = document.getElementById("drawerBackdrop");

    if (!openButton || !drawer || !backdrop) {
        return;
    }

    const setOpen = value => {
        drawer.classList.toggle("open", value);
        backdrop.classList.toggle("open", value);
        openButton.setAttribute("aria-expanded", String(value));
        document.body.classList.toggle("drawer-open", value);
    };

    openButton.addEventListener("click", () => setOpen(true));
    closeButton?.addEventListener("click", () => setOpen(false));
    backdrop.addEventListener("click", () => setOpen(false));
    drawer.querySelectorAll("a").forEach(link => link.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            setOpen(false);
        }
    });
})();
