"use strict";

const app = document.getElementById("signatureApp");
const loading = document.getElementById("signatureLoading");
const grid = document.getElementById("signatureGrid");
const search = document.getElementById("signatureSearch");
const stats = document.getElementById("signatureStats");
const shuffleButton = document.getElementById("shuffleButton");
let signatures = [];

initialize();

async function initialize() {
    try {
        const auth = await fetch("api/auth/me", { credentials: "same-origin" });
        if (!auth.ok) {
            location.href = "./";
            return;
        }

        const response = await fetch("signatures-manifest.json", { cache: "force-cache" });
        if (!response.ok) throw new Error("Не удалось загрузить библиотеку.");
        signatures = await response.json();
        render(signatures);
        loading.classList.add("hidden");
        app.classList.remove("hidden");
    } catch (error) {
        loading.textContent = error.message || "Ошибка загрузки.";
    }
}

search.addEventListener("input", () => {
    const query = search.value.trim().replace(/\D/g, "");
    if (!query) {
        render(signatures);
        return;
    }
    render(signatures.filter(item => String(item.id).padStart(3, "0").includes(query)));
});

shuffleButton.addEventListener("click", () => {
    const shuffled = [...signatures];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    search.value = "";
    render(shuffled);
});

function render(items) {
    grid.replaceChildren();
    stats.textContent = `Показано: ${items.length} из ${signatures.length || 500}`;
    const fragment = document.createDocumentFragment();

    for (const item of items) {
        const card = document.createElement("article");
        card.className = "signature-card";

        const image = document.createElement("img");
        image.loading = "lazy";
        image.src = item.file;
        image.alt = `Синтетическая подпись №${String(item.id).padStart(3, "0")}`;

        const footer = document.createElement("footer");
        const label = document.createElement("span");
        label.textContent = `№${String(item.id).padStart(3, "0")}`;

        const download = document.createElement("a");
        download.href = item.file;
        download.download = `synthetic-signature-${String(item.id).padStart(3, "0")}.svg`;
        download.textContent = "Скачать SVG";

        footer.append(label, download);
        card.append(image, footer);
        fragment.append(card);
    }

    grid.append(fragment);
}
