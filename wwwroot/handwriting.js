"use strict";

const el = {
    gate: document.getElementById("authGate"),
    app: document.getElementById("handwritingApp"),
    text: document.getElementById("sourceText"),
    category: document.getElementById("styleCategory"),
    style: document.getElementById("handwritingStyle"),
    stylePreview: document.getElementById("stylePreview"),
    styleCounter: document.getElementById("styleCounter"),
    paper: document.getElementById("paperStyle"),
    scene: document.getElementById("sceneStyle"),
    ink: document.getElementById("inkStyle"),
    naturalness: document.getElementById("naturalness"),
    size: document.getElementById("fontSize"),
    sizeValue: document.getElementById("fontSizeValue"),
    lineHeight: document.getElementById("lineHeight"),
    lineHeightValue: document.getElementById("lineHeightValue"),
    letterSpacing: document.getElementById("letterSpacing"),
    letterSpacingValue: document.getElementById("letterSpacingValue"),
    strokeStrength: document.getElementById("strokeStrength"),
    strokeStrengthValue: document.getElementById("strokeStrengthValue"),
    count: document.getElementById("variantCount"),
    render: document.getElementById("renderButton"),
    generateVariants: document.getElementById("generateVariantsButton"),
    randomize: document.getElementById("randomizeButton"),
    download: document.getElementById("downloadButton"),
    status: document.getElementById("renderStatus"),
    variantStatus: document.getElementById("variantStatus"),
    gallery: document.getElementById("variantGallery"),
    canvas: document.getElementById("paperCanvas")
};

const OUTPUT = { width: 1400, height: 1900 };
const SHEET = { width: 1240, height: 1754 };
const FONT_FAMILIES = [
    "Marck Script",
    "Bad Script",
    "Caveat",
    "Neucha",
    "Pangolin",
    "Shantell Sans",
    "Kelly Slab",
    "Lobster",
    "Pacifico",
    "Comforter"
];

const categories = [
    { id: "school", name: "Школьные", preview: "Сегодня аккуратно записываю домашнее задание" },
    { id: "neat", name: "Аккуратные", preview: "Важные мысли лучше записывать разборчиво" },
    { id: "adult", name: "Взрослые", preview: "Нужно быстро записать, чтобы потом не забыть" },
    { id: "student", name: "Студенческие", preview: "Конспект лекции и основные тезисы занятия" },
    { id: "quick", name: "Быстрые", preview: "Срочно закончить всё до вечера" },
    { id: "doctor", name: "Медицинские", preview: "Rp.: принимать по одной таблетке после еды" },
    { id: "round", name: "Округлые", preview: "Доброе утро! Планы на сегодняшний день" },
    { id: "angular", name: "Угловатые", preview: "Короткая резкая запись на полях" },
    { id: "tiny", name: "Мелкие", preview: "Краткая заметка мелким аккуратным почерком" },
    { id: "rare", name: "Редкие характеры", preview: "Так выглядит необычный характер рукописного текста" }
];

const archetypes = {
    school: [
        profile("Школьный ровный", "Marck Script", 1.00, -0.02, 1.00, 0.10, 1.2, 1.1, 0.022, 0.88, 400, 27),
        profile("Прописи округлые", "Caveat", 1.08, 0.03, 1.04, 0.45, 1.0, 1.0, 0.018, 0.86, 500, 30),
        profile("Дневник", "Bad Script", 0.95, -0.06, 0.98, -0.10, 1.7, 1.8, 0.032, 0.82, 400, 38)
    ],
    neat: [
        profile("Педантичный", "Pangolin", 0.86, -0.02, 0.94, -0.20, 0.7, 0.7, 0.016, 0.92, 400, 22),
        profile("Архивный", "Kelly Slab", 0.90, 0.01, 0.90, -0.35, 0.6, 0.8, 0.018, 0.88, 400, 25),
        profile("Аккуратный курсив", "Shantell Sans", 0.98, -0.04, 0.98, 0.05, 1.2, 1.1, 0.022, 0.87, 400, 29)
    ],
    adult: [
        profile("Повседневный", "Bad Script", 1.00, -0.08, 0.96, -0.15, 2.6, 2.7, 0.040, 0.80, 400, 48),
        profile("Спокойный", "Shantell Sans", 0.98, 0.01, 0.98, 0.08, 1.7, 1.8, 0.028, 0.82, 400, 39),
        profile("Размашистый", "Caveat", 1.15, -0.05, 1.05, 0.55, 2.9, 2.8, 0.046, 0.78, 500, 52)
    ],
    student: [
        profile("Плотный конспект", "Neucha", 0.92, -0.06, 0.87, -0.85, 2.4, 2.8, 0.045, 0.78, 400, 57),
        profile("Торопливый конспект", "Bad Script", 0.93, -0.14, 0.90, -0.55, 4.3, 4.6, 0.072, 0.72, 400, 73),
        profile("Заметки на полях", "Pangolin", 0.80, 0.04, 0.90, -0.30, 2.2, 2.2, 0.050, 0.80, 400, 51)
    ],
    quick: [
        profile("Быстрый резкий", "Neucha", 0.95, -0.18, 0.82, -0.95, 5.2, 5.4, 0.090, 0.68, 400, 84),
        profile("Нервная строка", "Kelly Slab", 0.90, 0.15, 0.87, -0.25, 6.2, 6.8, 0.110, 0.68, 400, 89),
        profile("Записка на ходу", "Bad Script", 1.00, -0.20, 0.90, -0.50, 4.8, 5.0, 0.085, 0.70, 400, 80)
    ],
    doctor: [
        profile("Врачебный сжатый", "Neucha", 0.82, -0.24, 0.68, -1.45, 5.8, 6.0, 0.120, 0.62, 400, 92),
        profile("Рецепт", "Bad Script", 0.86, -0.28, 0.72, -1.20, 5.0, 5.5, 0.105, 0.64, 400, 90),
        profile("Дежурная запись", "Kelly Slab", 0.78, 0.11, 0.72, -1.05, 4.7, 5.2, 0.100, 0.66, 400, 86)
    ],
    round: [
        profile("Мягкий округлый", "Caveat", 1.18, 0.02, 1.08, 0.70, 2.2, 2.1, 0.032, 0.78, 600, 39),
        profile("Открыточный", "Lobster", 1.03, -0.04, 1.02, 0.25, 1.3, 1.5, 0.026, 0.84, 400, 31),
        profile("Воздушный", "Pacifico", 1.02, 0.02, 1.04, 0.45, 1.9, 2.0, 0.032, 0.78, 400, 40)
    ],
    angular: [
        profile("Угловатый", "Kelly Slab", 0.96, 0.12, 0.90, 0.10, 4.5, 4.8, 0.082, 0.70, 400, 77),
        profile("Обратный наклон", "Neucha", 0.98, 0.30, 0.88, 0.25, 3.7, 4.0, 0.075, 0.72, 400, 72),
        profile("Резкий мужской", "Pangolin", 0.90, -0.12, 0.88, -0.20, 3.8, 4.1, 0.076, 0.74, 400, 70)
    ],
    tiny: [
        profile("Миниатюрный", "Pangolin", 0.68, -0.02, 0.88, -0.40, 0.7, 0.7, 0.018, 0.88, 400, 24),
        profile("Бухгалтерский", "Kelly Slab", 0.70, 0.01, 0.84, -0.55, 0.8, 0.9, 0.022, 0.86, 400, 27),
        profile("Лабораторный", "Shantell Sans", 0.72, -0.03, 0.90, -0.30, 1.0, 1.1, 0.024, 0.84, 400, 31)
    ],
    rare: [
        profile("Дрожащий", "Comforter", 1.05, 0.04, 1.00, 0.10, 5.5, 6.0, 0.090, 0.68, 400, 78),
        profile("Каллиграфический", "Pacifico", 1.08, -0.06, 1.02, 0.35, 1.0, 1.2, 0.024, 0.82, 400, 32),
        profile("Детский неровный", "Caveat", 1.17, 0.08, 1.10, 0.65, 4.5, 4.8, 0.074, 0.72, 500, 71)
    ]
};

const inkProfiles = {
    "blue-ballpoint": { color: "#2450a4", alpha: [0.58, 0.90], overlay: 0.20, dropout: 0.10, jitter: 7, shadow: 0.10 },
    "dark-blue-ballpoint": { color: "#173b82", alpha: [0.64, 0.94], overlay: 0.22, dropout: 0.07, jitter: 5, shadow: 0.11 },
    "black-ballpoint": { color: "#252933", alpha: [0.62, 0.92], overlay: 0.18, dropout: 0.08, jitter: 4, shadow: 0.09 },
    "blue-gel": { color: "#1849b7", alpha: [0.82, 0.99], overlay: 0.28, dropout: 0.02, jitter: 3, shadow: 0.18 },
    "faint-blue": { color: "#3964a8", alpha: [0.35, 0.68], overlay: 0.10, dropout: 0.25, jitter: 10, shadow: 0.04 },
    pencil: { color: "#555a61", alpha: [0.34, 0.72], overlay: 0.12, dropout: 0.18, jitter: 8, shadow: 0.03 }
};

const naturalnessMultipliers = { neat: 0.55, natural: 1, careless: 1.55 };
const allProfiles = buildProfiles();
let variantSeeds = [freshSeed()];
let activeSeed = variantSeeds[0];
let renderTimer = null;
let galleryRenderToken = 0;

initialize();

function profile(name, font, size, slant, compress, spacing, lineWave, charJitter, angle, alpha, weight, defaultNaturalness) {
    return { name, font, size, slant, compress, spacing, lineWave, charJitter, angle, alpha, weight, defaultNaturalness };
}

function buildProfiles() {
    const result = [];
    for (const category of categories) {
        const bases = archetypes[category.id];
        bases.forEach((base, baseIndex) => {
            for (let variantIndex = 0; variantIndex < 10; variantIndex += 1) {
                const id = `${category.id}-${baseIndex + 1}-${variantIndex + 1}`;
                const random = seeded(hashString(id));
                const spread = variantIndex === 0 ? 0.25 : 1;
                result.push({
                    ...base,
                    id,
                    categoryId: category.id,
                    categoryName: category.name,
                    name: `${base.name} · ${String(variantIndex + 1).padStart(2, "0")}`,
                    size: base.size * (1 + (random() - 0.5) * 0.16 * spread),
                    slant: base.slant + (random() - 0.5) * 0.12 * spread,
                    compress: clamp(base.compress + (random() - 0.5) * 0.12 * spread, 0.58, 1.18),
                    spacing: base.spacing + (random() - 0.5) * 0.75 * spread,
                    lineWave: Math.max(0.3, base.lineWave * (0.78 + random() * 0.48 * spread)),
                    charJitter: Math.max(0.3, base.charJitter * (0.76 + random() * 0.52 * spread)),
                    angle: Math.max(0.008, base.angle * (0.75 + random() * 0.55 * spread)),
                    alpha: clamp(base.alpha + (random() - 0.5) * 0.12 * spread, 0.48, 0.95),
                    weight: variantIndex % 4 === 1 ? Math.min(600, base.weight + 100) : base.weight,
                    seedSalt: hashString(`${id}-salt`)
                });
            }
        });
    }
    return result;
}

async function initialize() {
    try {
        const response = await fetch("api/auth/me", { credentials: "same-origin" });
        if (!response.ok) {
            location.href = "./";
            return;
        }

        populateCategories();
        populateStyles();
        wireEvents();
        updateRangeLabels();
        el.gate.classList.add("hidden");
        el.app.classList.remove("hidden");
        await loadFonts();
        applyProfileDefaults();
        updateStylePreview();
        await generateVariants(false);
    } catch (error) {
        console.error(error);
        el.gate.textContent = "Не удалось подключиться к серверу.";
    }
}

async function loadFonts() {
    if (!document.fonts?.load) return;
    await Promise.allSettled(FONT_FAMILIES.map(font => document.fonts.load(`32px "${font}"`, "АБВабв")));
}

function populateCategories() {
    el.category.innerHTML = `<option value="all">Все категории</option>${categories
        .map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
        .join("")}`;
}

function populateStyles(preferredId = null) {
    const selectedCategory = el.category.value || "all";
    const filtered = selectedCategory === "all"
        ? allProfiles
        : allProfiles.filter(item => item.categoryId === selectedCategory);

    const currentId = preferredId || el.style.value;
    el.style.innerHTML = filtered.map((item, index) =>
        `<option value="${item.id}">${String(index + 1).padStart(3, "0")}. ${escapeHtml(item.name)}</option>`
    ).join("");

    if (currentId && filtered.some(item => item.id === currentId)) {
        el.style.value = currentId;
    } else {
        const defaultProfile = filtered.find(item => item.id === "adult-1-1") || filtered[0];
        if (defaultProfile) el.style.value = defaultProfile.id;
    }

    el.styleCounter.textContent = `${filtered.length} из ${allProfiles.length} пресетов`;
}

function wireEvents() {
    el.category.addEventListener("change", () => {
        populateStyles();
        applyProfileDefaults();
        updateStylePreview();
        scheduleRender(true);
    });

    el.style.addEventListener("change", () => {
        applyProfileDefaults();
        updateStylePreview();
        scheduleRender(true);
    });

    [el.paper, el.scene, el.ink, el.naturalness].forEach(input => {
        input.addEventListener("change", () => scheduleRender(true));
    });

    [el.size, el.lineHeight, el.letterSpacing, el.strokeStrength].forEach(input => {
        input.addEventListener("input", () => {
            updateRangeLabels();
            scheduleRender(false);
        });
    });

    el.text.addEventListener("input", () => scheduleRender(false, 220));
    el.render.addEventListener("click", () => {
        const previousSeed = activeSeed;
        const activeIndex = variantSeeds.indexOf(previousSeed);
        activeSeed = freshSeed();
        if (activeIndex >= 0) variantSeeds[activeIndex] = activeSeed;
        else variantSeeds[0] = activeSeed;
        renderSelected();
        renderGallery();
    });
    el.generateVariants.addEventListener("click", () => generateVariants(true));
    el.randomize.addEventListener("click", randomizeSettings);
    el.download.addEventListener("click", () => downloadVariant(activeSeed));
}

function updateRangeLabels() {
    el.sizeValue.value = el.size.value;
    el.lineHeightValue.value = el.lineHeight.value;
    el.letterSpacingValue.value = Number(el.letterSpacing.value).toFixed(2).replace(/\.00$/, "");
    el.strokeStrengthValue.value = el.strokeStrength.value;
}

function getSelectedProfile() {
    return allProfiles.find(item => item.id === el.style.value) || allProfiles[0];
}

function applyProfileDefaults() {
    const selected = getSelectedProfile();
    el.size.value = String(clamp(Math.round(31 * selected.size), 18, 52));
    el.lineHeight.value = String(clamp(Math.round(52 * selected.size), 34, 82));
    el.letterSpacing.value = String(clamp(selected.spacing, -3, 5));
    const naturalness = selected.defaultNaturalness;
    el.naturalness.value = naturalness < 35 ? "neat" : naturalness > 72 ? "careless" : "natural";
    updateRangeLabels();
}

function updateStylePreview() {
    const selected = getSelectedProfile();
    const category = categories.find(item => item.id === selected.categoryId);
    el.stylePreview.textContent = category?.preview || "Пример выбранного почерка";
    el.stylePreview.style.fontFamily = `"${selected.font}", cursive`;
    el.stylePreview.style.fontSize = `${Math.max(22, Math.round(28 * selected.size))}px`;
    el.stylePreview.style.letterSpacing = `${selected.spacing}px`;
    el.stylePreview.style.transform = `skewX(${Math.round(selected.slant * 32)}deg) scaleX(${selected.compress})`;
}

function scheduleRender(refreshGallery, delay = 100) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(async () => {
        await renderSelected();
        if (refreshGallery) await renderGallery();
    }, delay);
}

async function generateVariants(createNewSeeds) {
    const count = Number(el.count.value);
    if (createNewSeeds || variantSeeds.length !== count) {
        const base = freshSeed();
        variantSeeds = Array.from({ length: count }, (_, index) => normalizeSeed(base + index * 104729));
        activeSeed = variantSeeds[0];
    }

    el.generateVariants.disabled = true;
    el.variantStatus.textContent = "Генерация…";
    try {
        await renderSelected();
        await renderGallery();
    } finally {
        el.generateVariants.disabled = false;
    }
}

async function renderSelected() {
    el.status.textContent = "Генерация…";
    await nextFrame();
    renderScene(el.canvas, activeSeed, 1);
    const selected = getSelectedProfile();
    el.status.textContent = `Готово · ${selected.name}`;
    markActiveCard();
}

async function renderGallery() {
    const token = ++galleryRenderToken;
    el.gallery.innerHTML = "";
    el.variantStatus.textContent = `${variantSeeds.length} ${pluralVariant(variantSeeds.length)}`;

    for (let index = 0; index < variantSeeds.length; index += 1) {
        if (token !== galleryRenderToken) return;
        const seed = variantSeeds[index];
        const card = document.createElement("article");
        card.className = `variant-card${seed === activeSeed ? " active" : ""}`;
        card.dataset.seed = String(seed);

        const canvas = document.createElement("canvas");
        canvas.width = 350;
        canvas.height = 475;
        renderScene(canvas, seed, 0.25);

        const footer = document.createElement("div");
        footer.className = "variant-card-footer";
        const label = document.createElement("span");
        label.textContent = `Вариант ${index + 1}`;
        const downloadButton = document.createElement("button");
        downloadButton.type = "button";
        downloadButton.className = "variant-download";
        downloadButton.textContent = "PNG";
        downloadButton.title = "Скачать этот вариант";
        downloadButton.addEventListener("click", event => {
            event.stopPropagation();
            downloadVariant(seed);
        });

        footer.append(label, downloadButton);
        card.append(canvas, footer);
        card.addEventListener("click", async () => {
            activeSeed = seed;
            markActiveCard();
            await renderSelected();
            el.canvas.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        el.gallery.append(card);
        await nextFrame();
    }
}

function markActiveCard() {
    el.gallery.querySelectorAll(".variant-card").forEach(card => {
        card.classList.toggle("active", Number(card.dataset.seed) === activeSeed);
    });
}

function randomizeSettings() {
    const profileItem = allProfiles[Math.floor(Math.random() * allProfiles.length)];
    el.category.value = profileItem.categoryId;
    populateStyles(profileItem.id);
    el.style.value = profileItem.id;

    const paperOptions = Array.from(el.paper.options);
    const sceneOptions = Array.from(el.scene.options);
    const inkOptions = Array.from(el.ink.options);
    const naturalOptions = Array.from(el.naturalness.options);
    el.paper.value = randomItem(paperOptions).value;
    el.scene.value = randomItem(sceneOptions).value;
    el.ink.value = randomItem(inkOptions).value;
    applyProfileDefaults();
    el.naturalness.value = randomItem(naturalOptions).value;
    el.strokeStrength.value = String(45 + Math.floor(Math.random() * 46));
    updateRangeLabels();
    updateStylePreview();
    generateVariants(true);
}

function renderScene(targetCanvas, variantSeed, resolution) {
    const targetWidth = Math.round(OUTPUT.width * resolution);
    const targetHeight = Math.round(OUTPUT.height * resolution);
    if (targetCanvas.width !== targetWidth) targetCanvas.width = targetWidth;
    if (targetCanvas.height !== targetHeight) targetCanvas.height = targetHeight;

    const outputContext = targetCanvas.getContext("2d");
    const sheetCanvas = document.createElement("canvas");
    sheetCanvas.width = Math.round(SHEET.width * resolution);
    sheetCanvas.height = Math.round(SHEET.height * resolution);
    const sheetContext = sheetCanvas.getContext("2d");

    drawPaper(sheetContext, sheetCanvas.width, sheetCanvas.height, variantSeed, resolution);
    drawHandwriting(sheetContext, sheetCanvas.width, sheetCanvas.height, variantSeed, resolution);
    composeScene(outputContext, targetCanvas.width, targetCanvas.height, sheetCanvas, variantSeed, resolution);
}

function drawPaper(context, width, height, variantSeed, scale) {
    const random = seeded(normalizeSeed(variantSeed + 71));
    const style = el.paper.value;
    const baseColors = {
        plain: "#fffefb",
        office: "#fdfdfc",
        warm: "#f8f0dc",
        lined: "#fffdf7",
        "wide-lined": "#fffdf8",
        grid: "#fffdf8",
        yellow: "#f5edcb",
        aged: "#eadbb9"
    };

    context.fillStyle = baseColors[style] || baseColors.plain;
    context.fillRect(0, 0, width, height);

    if (style === "aged") {
        const gradient = context.createRadialGradient(width * 0.48, height * 0.45, width * 0.15, width * 0.5, height * 0.5, width * 0.72);
        gradient.addColorStop(0, "rgba(255,255,255,.16)");
        gradient.addColorStop(1, "rgba(114,77,26,.20)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
    }

    const lineScale = scale;
    context.save();
    context.lineWidth = Math.max(0.6, scale);
    if (style === "lined" || style === "yellow") {
        context.strokeStyle = style === "yellow" ? "rgba(89,118,153,.22)" : "rgba(91,139,190,.23)";
        for (let y = 120 * lineScale; y < height - 70 * lineScale; y += 56 * lineScale) {
            drawLine(context, 70 * lineScale, y, width - 70 * lineScale, y);
        }
        context.strokeStyle = "rgba(211,92,92,.30)";
        drawLine(context, 145 * lineScale, 60 * lineScale, 145 * lineScale, height - 60 * lineScale);
    } else if (style === "wide-lined") {
        context.strokeStyle = "rgba(91,139,190,.22)";
        for (let y = 130 * lineScale; y < height - 70 * lineScale; y += 72 * lineScale) {
            drawLine(context, 70 * lineScale, y, width - 70 * lineScale, y);
        }
        context.strokeStyle = "rgba(211,92,92,.28)";
        drawLine(context, 145 * lineScale, 60 * lineScale, 145 * lineScale, height - 60 * lineScale);
    } else if (style === "grid") {
        context.strokeStyle = "rgba(91,139,190,.17)";
        for (let y = 60 * lineScale; y < height - 50 * lineScale; y += 42 * lineScale) {
            drawLine(context, 50 * lineScale, y, width - 50 * lineScale, y);
        }
        for (let x = 50 * lineScale; x < width - 50 * lineScale; x += 42 * lineScale) {
            drawLine(context, x, 50 * lineScale, x, height - 50 * lineScale);
        }
    }
    context.restore();

    context.save();
    for (let index = 0; index < Math.round(250 * scale); index += 1) {
        const alpha = style === "aged" ? 0.025 + random() * 0.045 : 0.008 + random() * 0.016;
        context.fillStyle = `rgba(77,63,42,${alpha})`;
        const size = Math.max(0.35, (0.5 + random() * 1.3) * scale);
        context.fillRect(random() * width, random() * height, size, size);
    }
    context.restore();
}

function drawHandwriting(context, width, height, variantSeed, scale) {
    const selected = getSelectedProfile();
    const ink = inkProfiles[el.ink.value] || inkProfiles["blue-ballpoint"];
    const random = seeded(normalizeSeed(variantSeed + selected.seedSalt));
    const naturalness = naturalnessMultipliers[el.naturalness.value] || 1;
    const fontSize = Number(el.size.value) * selected.size * scale;
    const lineHeight = Number(el.lineHeight.value) * scale;
    const userSpacing = Number(el.letterSpacing.value) * scale;
    const strength = Number(el.strokeStrength.value) / 100;
    const left = 176 * scale;
    const right = width - 84 * scale;
    const maxWidth = right - left;
    const bottom = height - 88 * scale;
    let y = 142 * scale;

    context.textBaseline = "alphabetic";
    const paragraphs = el.text.value.replace(/\r/g, "").split("\n");

    for (const paragraph of paragraphs) {
        if (y > bottom) break;
        if (!paragraph.trim()) {
            y += lineHeight;
            continue;
        }

        const words = paragraph.split(/\s+/).filter(Boolean);
        let lineWords = [];
        for (const word of words) {
            const candidate = [...lineWords, word].join(" ");
            const widthCandidate = measureText(context, candidate, selected, fontSize, userSpacing);
            if (widthCandidate > maxWidth && lineWords.length) {
                drawNaturalLine(context, lineWords.join(" "), left, y, selected, ink, fontSize, userSpacing, strength, naturalness, random, scale);
                y += lineHeight + (random() - 0.5) * selected.lineWave * naturalness * scale;
                lineWords = [word];
            } else {
                lineWords.push(word);
            }
        }

        if (lineWords.length && y <= bottom) {
            drawNaturalLine(context, lineWords.join(" "), left, y, selected, ink, fontSize, userSpacing, strength, naturalness, random, scale);
            y += lineHeight + (random() - 0.5) * selected.lineWave * naturalness * scale;
        }
    }
}

function drawNaturalLine(context, text, startX, baselineY, selected, ink, fontSize, userSpacing, strength, naturalness, random, scale) {
    let cursor = startX + (random() - 0.5) * 8 * naturalness * scale;
    const lineSlope = (random() - 0.5) * selected.angle * naturalness;
    const lineWave = selected.lineWave * naturalness * scale;
    const baseColor = hexToRgb(ink.color);

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === " ") {
            cursor += measureCharacter(context, " ", selected, fontSize) * selected.compress + (3 + random() * 4) * scale;
            continue;
        }

        const localSize = fontSize * (1 + (random() - 0.5) * 0.075 * naturalness);
        const charWidth = measureCharacter(context, character, selected, localSize);
        const baselineWave = Math.sin(index * 0.72 + random() * 0.8) * lineWave * 0.55;
        const dy = baselineWave + (random() - 0.5) * selected.charJitter * naturalness * scale;
        const angle = lineSlope + (random() - 0.5) * selected.angle * naturalness;
        const localCompress = clamp(selected.compress + (random() - 0.5) * 0.045 * naturalness, 0.55, 1.22);
        const localSlant = selected.slant + (random() - 0.5) * 0.035 * naturalness;
        const dropout = random() < ink.dropout * naturalness;
        const alphaVariance = ink.alpha[0] + random() * (ink.alpha[1] - ink.alpha[0]);
        const mainAlpha = clamp(alphaVariance * selected.alpha * strength * (dropout ? 0.34 + random() * 0.25 : 1), 0.08, 1);
        const colorJitter = (random() - 0.5) * ink.jitter;
        const localColor = rgbString(
            clamp(baseColor.r + colorJitter, 0, 255),
            clamp(baseColor.g + colorJitter, 0, 255),
            clamp(baseColor.b + colorJitter * 1.4, 0, 255)
        );

        context.save();
        context.translate(cursor, baselineY + dy);
        context.rotate(angle);
        context.transform(localCompress, 0, localSlant * naturalness, 1, 0, 0);
        context.font = `${selected.weight || 400} ${localSize}px "${selected.font}", cursive`;
        context.fillStyle = localColor;
        context.globalAlpha = mainAlpha;
        context.shadowColor = `rgba(${baseColor.r},${baseColor.g},${baseColor.b},${ink.shadow * strength})`;
        context.shadowBlur = Math.max(0, 0.35 * scale);
        context.fillText(character, 0, 0);

        if (!dropout && random() < 0.88) {
            context.globalAlpha = clamp(mainAlpha * ink.overlay, 0.03, 0.34);
            context.fillText(character, (random() - 0.5) * 0.9 * scale, (random() - 0.5) * 0.7 * scale);
        }

        if (random() < 0.42 * naturalness) {
            const stripStart = charWidth * (0.15 + random() * 0.55);
            const stripWidth = Math.max(0.7 * scale, charWidth * (0.08 + random() * 0.15));
            context.save();
            context.beginPath();
            context.rect(stripStart, -localSize * 1.15, stripWidth, localSize * 1.55);
            context.clip();
            context.globalAlpha = clamp(mainAlpha * (0.18 + random() * 0.28), 0.02, 0.32);
            context.fillText(character, 0, 0);
            context.restore();
        }
        context.restore();

        const advanceNoise = (random() - 0.5) * 2.4 * naturalness * scale;
        cursor += charWidth * localCompress + selected.spacing * scale + userSpacing + advanceNoise;
    }

    context.globalAlpha = 1;
    context.shadowBlur = 0;
}

function measureText(context, text, selected, fontSize, userSpacing) {
    let total = 0;
    for (const character of text) {
        total += measureCharacter(context, character, selected, fontSize) * selected.compress;
        total += selected.spacing + userSpacing;
    }
    return total;
}

function measureCharacter(context, character, selected, fontSize) {
    context.font = `${selected.weight || 400} ${fontSize}px "${selected.font}", cursive`;
    return context.measureText(character).width;
}

function composeScene(context, width, height, sheetCanvas, variantSeed, scale) {
    const random = seeded(normalizeSeed(variantSeed + 1907));
    const scene = el.scene.value;
    drawSceneBackground(context, width, height, scene, random, scale);

    const sheetWidth = sheetCanvas.width;
    const sheetHeight = sheetCanvas.height;
    const angle = scene === "scan" ? 0 : (random() - 0.5) * 0.045;

    context.save();
    context.translate(width / 2, height / 2);
    context.rotate(angle);
    context.translate(-sheetWidth / 2, -sheetHeight / 2);
    context.shadowColor = scene === "scan" ? "rgba(30,37,51,.10)" : "rgba(19,23,31,.34)";
    context.shadowBlur = (scene === "scan" ? 10 : 30) * scale;
    context.shadowOffsetX = (scene === "scan" ? 0 : 8) * scale;
    context.shadowOffsetY = (scene === "scan" ? 4 : 14) * scale;
    context.drawImage(sheetCanvas, 0, 0);
    context.restore();

    if (scene !== "scan") {
        context.save();
        const vignette = context.createRadialGradient(width / 2, height / 2, width * 0.20, width / 2, height / 2, width * 0.78);
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(1, "rgba(0,0,0,.14)");
        context.fillStyle = vignette;
        context.fillRect(0, 0, width, height);
        context.restore();
    }

}

function drawSceneBackground(context, width, height, scene, random, scale) {
    if (scene === "scan") {
        context.fillStyle = "#e8ebf0";
        context.fillRect(0, 0, width, height);
        return;
    }

    if (scene === "wood") {
        const gradient = context.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#9a6848");
        gradient.addColorStop(0.5, "#b17b57");
        gradient.addColorStop(1, "#83563d");
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        context.strokeStyle = "rgba(75,39,21,.20)";
        context.lineWidth = Math.max(1, 2 * scale);
        for (let y = -20 * scale; y < height; y += 44 * scale) {
            context.beginPath();
            context.moveTo(0, y + random() * 12 * scale);
            context.bezierCurveTo(width * 0.25, y - 8 * scale, width * 0.66, y + 14 * scale, width, y + (random() - 0.5) * 18 * scale);
            context.stroke();
        }
    } else if (scene === "dark-desk") {
        const gradient = context.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#242a32");
        gradient.addColorStop(1, "#11161d");
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        for (let index = 0; index < Math.round(180 * scale); index += 1) {
            context.fillStyle = `rgba(255,255,255,${0.008 + random() * 0.012})`;
            context.fillRect(random() * width, random() * height, Math.max(0.4, random() * 1.6 * scale), Math.max(0.4, random() * 1.6 * scale));
        }
    } else {
        context.fillStyle = "#c9bda9";
        context.fillRect(0, 0, width, height);
        context.strokeStyle = "rgba(91,78,62,.12)";
        context.lineWidth = Math.max(0.5, scale);
        const step = 18 * scale;
        for (let x = -height; x < width + height; x += step) {
            drawLine(context, x, 0, x + height, height);
            drawLine(context, x + height, 0, x, height);
        }
    }
}

function downloadVariant(variantSeed) {
    const canvas = document.createElement("canvas");
    renderScene(canvas, variantSeed, 1);
    const selected = getSelectedProfile();
    const link = document.createElement("a");
    const safeStyle = selected.id.replace(/[^a-z0-9-]/gi, "-");
    link.download = `rukopis-${safeStyle}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

function drawLine(context, x1, y1, x2, y2) {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
}

function hexToRgb(hex) {
    const normalized = hex.replace("#", "");
    return {
        r: Number.parseInt(normalized.slice(0, 2), 16),
        g: Number.parseInt(normalized.slice(2, 4), 16),
        b: Number.parseInt(normalized.slice(4, 6), 16)
    };
}

function rgbString(r, g, b) {
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return normalizeSeed(hash);
}

function seeded(initial) {
    let value = normalizeSeed(initial);
    return () => {
        value = value * 16807 % 2147483647;
        return (value - 1) / 2147483646;
    };
}

function normalizeSeed(value) {
    const normalized = Math.abs(Number(value) || 1) % 2147483647;
    return normalized === 0 ? 1 : normalized;
}

function freshSeed() {
    if (globalThis.crypto?.getRandomValues) {
        const values = new Uint32Array(1);
        globalThis.crypto.getRandomValues(values);
        return normalizeSeed(values[0]);
    }
    return normalizeSeed(Date.now() + Math.floor(Math.random() * 100000));
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function pluralVariant(count) {
    const lastTwo = count % 100;
    const last = count % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return "вариантов";
    if (last === 1) return "вариант";
    if (last >= 2 && last <= 4) return "варианта";
    return "вариантов";
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
