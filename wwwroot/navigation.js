"use strict";
(() => {
  const open = document.getElementById("menuButton");
  const close = document.getElementById("menuCloseButton");
  const drawer = document.getElementById("sideDrawer");
  const backdrop = document.getElementById("drawerBackdrop");
  if (!open || !drawer || !backdrop) return;
  const setOpen = value => {
    drawer.classList.toggle("open", value);
    backdrop.classList.toggle("open", value);
    open.setAttribute("aria-expanded", String(value));
    document.body.classList.toggle("drawer-open", value);
  };
  open.addEventListener("click", () => setOpen(true));
  close?.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });
})();
