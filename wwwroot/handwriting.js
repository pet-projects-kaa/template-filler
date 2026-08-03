"use strict";

const PAGE = { width: 1050, height: 1485, top: 118, right: 72, bottom: 82 };
const STORAGE_KEY = "template-filler-handwriting-settings-v8";
const MAX_PAGES = 30;

const PRESETS = [
    {
        id: "notebook-neat",
        name: "Ровный тетрадный",
        description: "Связный, достаточно ровный и хорошо читаемый курсив для обычного конспекта.",
        font: "Marck Script",
        sizeScale: 1,
        compress: .98,
        slant: -.045,
        wordSpacing: .02,
        rotation: .009,
        baselineJitter: .55,
        widthJitter: .018,
        alpha: .90,
        defaultSize: 30,
        defaultLineHeight: 51,
        defaultNaturalness: 46,
        defaultInk: "blue"
    },
    {
        id: "compact-small",
        name: "Мелкий сжатый",
        description: "Плотный мелкий почерк, чтобы на странице помещалось больше материала.",
        font: "Marck Script",
        sizeScale: .86,
        compress: .82,
        slant: -.075,
        wordSpacing: -.9,
        rotation: .012,
        baselineJitter: .75,
        widthJitter: .022,
        alpha: .86,
        defaultSize: 28,
        defaultLineHeight: 44,
        defaultNaturalness: 58,
        defaultInk: "dark-blue"
    },
    {
        id: "lecture-fast",
        name: "Быстрый лекционный",
        description: "Более быстрый и живой курсив с небольшим дрейфом строки и неодинаковым нажимом.",
        font: "Bad Script",
        sizeScale: 1,
        compress: .92,
        slant: -.12,
        wordSpacing: -.45,
        rotation: .020,
        baselineJitter: 1.35,
        widthJitter: .032,
        alpha: .82,
        defaultSize: 31,
        defaultLineHeight: 52,
        defaultNaturalness: 73,
        defaultInk: "blue"
    },
    {
        id: "careless-cursive",
        name: "Небрежный курсив",
        description: "Неровный почерк для быстрых записей: строки и слова слегка гуляют, ручка местами пишет слабее.",
        font: "Bad Script",
        sizeScale: 1.03,
        compress: .89,
        slant: -.16,
        wordSpacing: -.55,
        rotation: .030,
        baselineJitter: 2.05,
        widthJitter: .046,
        alpha: .77,
        defaultSize: 32,
        defaultLineHeight: 54,
        defaultNaturalness: 88,
        defaultInk: "faint"
    },
    {
        id: "adult-natural",
        name: "Взрослый естественный",
        description: "Спокойный повседневный почерк без ощущения школьных прописей.",
        font: "Shantell Sans",
        sizeScale: .96,
        compress: .93,
        slant: -.055,
        wordSpacing: -.18,
        rotation: .014,
        baselineJitter: .95,
        widthJitter: .026,
        alpha: .84,
        defaultSize: 29,
        defaultLineHeight: 50,
        defaultNaturalness: 64,
        defaultInk: "dark-blue"
    },
    {
        id: "soft-diary",
        name: "Мягкий дневниковый",
        description: "Округлый и немного размашистый вариант для спокойных записей и определений.",
        font: "Caveat",
        sizeScale: 1.02,
        compress: .96,
        slant: -.025,
        wordSpacing: .15,
        rotation: .014,
        baselineJitter: .85,
        widthJitter: .025,
        alpha: .82,
        defaultSize: 31,
        defaultLineHeight: 52,
        defaultNaturalness: 60,
        defaultInk: "blue"
    },
    {
        id: "faint-ballpoint",
        name: "Бледная шариковая",
        description: "Связный курсив с естественно неоднородной синей ручкой и редкими бледными участками.",
        font: "Marck Script",
        sizeScale: .98,
        compress: .94,
        slant: -.065,
        wordSpacing: -.25,
        rotation: .015,
        baselineJitter: 1.05,
        widthJitter: .027,
        alpha: .73,
        defaultSize: 30,
        defaultLineHeight: 51,
        defaultNaturalness: 72,
        defaultInk: "faint"
    }
];

let customFonts = [];
const customFontFaces = new Map();

const INKS = {
    blue: { color: "#2251a4", alphaMin: .64, alphaMax: .90, weakChance: .06, overlay: .16, jitter: 7 },
    "dark-blue": { color: "#173d84", alphaMin: .70, alphaMax: .94, weakChance: .04, overlay: .18, jitter: 5 },
    faint: { color: "#3865aa", alphaMin: .38, alphaMax: .70, weakChance: .20, overlay: .10, jitter: 10 },
    black: { color: "#252933", alphaMin: .66, alphaMax: .92, weakChance: .05, overlay: .14, jitter: 4 }
};

const elements = {
    gate: document.getElementById("authGate"),
    app: document.getElementById("handwritingApp"),
    sourceText: document.getElementById("sourceText"),
    preset: document.getElementById("preset"),
    presetDescription: document.getElementById("presetDescription"),
    customFontName: document.getElementById("customFontName"),
    customFontFile: document.getElementById("customFontFile"),
    customFontFileLabel: document.getElementById("customFontFileLabel"),
    uploadFontButton: document.getElementById("uploadFontButton"),
    fontUploadStatus: document.getElementById("fontUploadStatus"),
    customFontsList: document.getElementById("customFontsList"),
    swooshMode: document.getElementById("swooshMode"),
    swooshInitials: document.getElementById("swooshInitials"),
    generateSwooshesButton: document.getElementById("generateSwooshesButton"),
    clearPlacedSwooshesButton: document.getElementById("clearPlacedSwooshesButton"),
    swooshStatus: document.getElementById("swooshStatus"),
    swooshGallery: document.getElementById("swooshGallery"),
    paperStyle: document.getElementById("paperStyle"),
    inkStyle: document.getElementById("inkStyle"),
    fontSize: document.getElementById("fontSize"),
    fontSizeValue: document.getElementById("fontSizeValue"),
    lineHeight: document.getElementById("lineHeight"),
    lineHeightValue: document.getElementById("lineHeightValue"),
    naturalness: document.getElementById("naturalness"),
    naturalnessValue: document.getElementById("naturalnessValue"),
    leftMargin: document.getElementById("leftMargin"),
    marginValue: document.getElementById("marginValue"),
    recognizeHeadings: document.getElementById("recognizeHeadings"),
    renderButton: document.getElementById("renderButton"),
    regenerateButton: document.getElementById("regenerateButton"),
    downloadCurrentButton: document.getElementById("downloadCurrentButton"),
    downloadAllButton: document.getElementById("downloadAllButton"),
    printButton: document.getElementById("printButton"),
    statusText: document.getElementById("statusText"),
    pageCounter: document.getElementById("pageCounter"),
    pagesPreview: document.getElementById("pagesPreview")
};

let basePageCanvases = [];
let pageCanvases = [];
let activePageIndex = 0;
let renderSeed = freshSeed();
let renderTimer = null;
let renderToken = 0;
let swooshLibrary = [];
let placedSwooshes = [];
let swooshCounter = 0;
let dragState = null;

initialize();

async function initialize() {
    try {
        const response = await fetch("api/auth/me", { credentials: "same-origin" });
        if (!response.ok) {
            location.href = "./";
            return;
        }

        await loadCustomFonts();
        populatePresets();
        restoreSettings();
        wireEvents();
        updateLabels();
        updatePresetDescription();
        elements.gate.classList.add("hidden");
        elements.app.classList.remove("hidden");

        await loadFonts();
        await renderDocument();
        generateSwooshLibrary(false);
    } catch (error) {
        console.error(error);
        elements.gate.textContent = "Не удалось открыть модуль рукописных конспектов.";
    }
}

function populatePresets(preferredValue = null) {
    const currentValue = preferredValue || elements.preset.value;
    elements.preset.replaceChildren();

    const builtInGroup = document.createElement("optgroup");
    builtInGroup.label = "Встроенные почерки";
    for (const item of PRESETS) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        builtInGroup.append(option);
    }
    elements.preset.append(builtInGroup);

    const availableCustomFonts = customFonts.filter(item => item.loaded);
    if (availableCustomFonts.length > 0) {
        const customGroup = document.createElement("optgroup");
        customGroup.label = "Мои шрифты";
        for (const font of availableCustomFonts) {
            const option = document.createElement("option");
            option.value = `custom:${font.id}`;
            option.textContent = font.name;
            customGroup.append(option);
        }
        elements.preset.append(customGroup);
    }

    const values = Array.from(elements.preset.options).map(option => option.value);
    elements.preset.value = values.includes(currentValue) ? currentValue : PRESETS[0].id;
}

async function loadCustomFonts() {
    setFontUploadStatus("Загружаем список шрифтов…");
    try {
        const response = await fetch("api/fonts", { credentials: "same-origin" });
        if (!response.ok) {
            throw new Error(await readApiError(response));
        }

        const records = await response.json();
        customFonts = await Promise.all(records.map(registerCustomFont));
        renderCustomFontList();
        setFontUploadStatus(customFonts.length ? "" : "Собственные шрифты пока не загружены.");
    } catch (error) {
        console.error(error);
        customFonts = [];
        renderCustomFontList();
        setFontUploadStatus(error.message || "Не удалось получить список шрифтов.", true);
    }
}

async function registerCustomFont(record) {
    const family = `UserFont_${String(record.id).replaceAll("-", "_")}`;
    const previous = customFontFaces.get(record.id);
    if (previous) {
        document.fonts.delete(previous);
        customFontFaces.delete(record.id);
    }

    try {
        const source = `url("api/fonts/${encodeURIComponent(record.id)}/file?v=${encodeURIComponent(record.createdAt)}")`;
        const face = new FontFace(family, source, { style: "normal", weight: "400" });
        await face.load();
        document.fonts.add(face);
        customFontFaces.set(record.id, face);
        return { ...record, family, loaded: true, loadError: null };
    } catch (error) {
        console.error(`Не удалось загрузить шрифт ${record.name}`, error);
        return { ...record, family, loaded: false, loadError: "Браузер не смог прочитать этот файл" };
    }
}

function renderCustomFontList() {
    elements.customFontsList.replaceChildren();
    if (customFonts.length === 0) {
        const empty = document.createElement("div");
        empty.className = "custom-font-empty";
        empty.textContent = "Здесь появятся загруженные шрифты.";
        elements.customFontsList.append(empty);
        return;
    }

    for (const font of customFonts) {
        const item = document.createElement("div");
        item.className = "custom-font-item";

        const preview = document.createElement("div");
        preview.className = "custom-font-preview";

        const title = document.createElement("strong");
        title.textContent = font.name;

        const meta = document.createElement("small");
        meta.textContent = font.loaded
            ? `${font.fileExtension.toUpperCase()} · ${formatBytes(font.sizeBytes)}`
            : font.loadError;

        const sample = document.createElement("span");
        sample.className = "custom-font-sample";
        sample.textContent = "Пример рукописного конспекта";
        if (font.loaded) {
            sample.style.fontFamily = `"${font.family}", cursive`;
        }

        preview.append(title, meta, sample);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "custom-font-delete";
        remove.title = `Удалить шрифт «${font.name}»`;
        remove.setAttribute("aria-label", remove.title);
        remove.textContent = "×";
        remove.addEventListener("click", () => deleteCustomFont(font));

        item.append(preview, remove);
        elements.customFontsList.append(item);
    }
}

function customPresetFromFont(font) {
    return {
        id: `custom:${font.id}`,
        name: font.name,
        description: "Ваш загруженный шрифт. Естественные отклонения строк и неоднородность ручки применяются поверх него.",
        font: font.family,
        sizeScale: 1,
        compress: .96,
        slant: -.035,
        wordSpacing: -.15,
        rotation: .012,
        baselineJitter: .85,
        widthJitter: .024,
        alpha: .86,
        defaultSize: 30,
        defaultLineHeight: 51,
        defaultNaturalness: 55,
        defaultInk: "blue",
        isCustom: true
    };
}

function wireEvents() {
    elements.preset.addEventListener("change", () => {
        applyPresetDefaults();
        updatePresetDescription();
        saveSettings();
        scheduleRender(80);
    });

    elements.customFontFile.addEventListener("change", () => {
        const file = elements.customFontFile.files?.[0];
        elements.customFontFileLabel.textContent = file ? file.name : "Выбрать файл";
        if (file && !elements.customFontName.value.trim()) {
            elements.customFontName.value = file.name.replace(/\.[^.]+$/, "");
        }
    });
    elements.uploadFontButton.addEventListener("click", uploadCustomFont);

    elements.swooshMode.addEventListener("change", () => {
        saveSettings();
        setSwooshStatus("");
    });
    elements.swooshInitials.addEventListener("input", () => {
        saveSettings();
    });
    elements.generateSwooshesButton.addEventListener("click", () => generateSwooshLibrary(true));
    elements.clearPlacedSwooshesButton.addEventListener("click", async () => {
        if (pageCanvases.length === 0) return;
        placedSwooshes = placedSwooshes.filter(item => item.pageIndex !== activePageIndex);
        await applyPlacedSwooshes();
        renderPreview();
        saveSettings();
        setSwooshStatus("Росчерки на текущей странице очищены.");
    });

    [elements.paperStyle, elements.inkStyle, elements.recognizeHeadings].forEach(input => {
        input.addEventListener("change", () => {
            saveSettings();
            scheduleRender(80);
        });
    });

    [elements.fontSize, elements.lineHeight, elements.naturalness, elements.leftMargin].forEach(input => {
        input.addEventListener("input", () => {
            updateLabels();
            saveSettings();
            scheduleRender(100);
        });
    });

    elements.sourceText.addEventListener("input", () => {
        saveSettings();
        scheduleRender(280);
    });

    elements.renderButton.addEventListener("click", renderDocument);
    elements.regenerateButton.addEventListener("click", async () => {
        renderSeed = freshSeed();
        await renderDocument();
    });
    elements.downloadCurrentButton.addEventListener("click", downloadCurrentPage);
    elements.downloadAllButton.addEventListener("click", downloadAllPagesZip);
    elements.printButton.addEventListener("click", printPages);
}

async function uploadCustomFont() {
    const file = elements.customFontFile.files?.[0];
    if (!file) {
        setFontUploadStatus("Сначала выберите файл шрифта.", true);
        return;
    }

    const allowedExtensions = [".ttf", ".otf", ".woff", ".woff2"];
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
        setFontUploadStatus("Поддерживаются только TTF, OTF, WOFF и WOFF2.", true);
        return;
    }

    if (file.size > 8 * 1024 * 1024) {
        setFontUploadStatus("Файл должен быть не больше 8 МБ.", true);
        return;
    }

    elements.uploadFontButton.disabled = true;
    setFontUploadStatus("Загружаем и проверяем шрифт…");
    try {
        const form = new FormData();
        form.append("file", file);
        form.append("name", elements.customFontName.value.trim());

        const response = await fetch("api/fonts", {
            method: "POST",
            credentials: "same-origin",
            body: form
        });
        if (!response.ok) {
            throw new Error(await readApiError(response));
        }

        const created = await response.json();
        const registered = await registerCustomFont(created);
        customFonts = [registered, ...customFonts.filter(item => item.id !== registered.id)];
        renderCustomFontList();
        populatePresets(`custom:${registered.id}`);
        elements.customFontFile.value = "";
        elements.customFontName.value = "";
        elements.customFontFileLabel.textContent = "Выбрать файл";

        if (!registered.loaded) {
            throw new Error(registered.loadError || "Браузер не смог прочитать шрифт.");
        }

        applyPresetDefaults();
        updatePresetDescription();
        saveSettings();
        setFontUploadStatus(`Шрифт «${registered.name}» добавлен и выбран.`);
        await renderDocument();
    } catch (error) {
        console.error(error);
        setFontUploadStatus(error.message || "Не удалось загрузить шрифт.", true);
    } finally {
        elements.uploadFontButton.disabled = false;
    }
}

async function deleteCustomFont(font) {
    if (!confirm(`Удалить шрифт «${font.name}»?`)) {
        return;
    }

    setFontUploadStatus(`Удаляем «${font.name}»…`);
    try {
        const response = await fetch(`api/fonts/${encodeURIComponent(font.id)}`, {
            method: "DELETE",
            credentials: "same-origin"
        });
        if (!response.ok && response.status !== 404) {
            throw new Error(await readApiError(response));
        }

        const face = customFontFaces.get(font.id);
        if (face) {
            document.fonts.delete(face);
            customFontFaces.delete(font.id);
        }

        const selectedWasDeleted = elements.preset.value === `custom:${font.id}`;
        customFonts = customFonts.filter(item => item.id !== font.id);
        renderCustomFontList();
        populatePresets(selectedWasDeleted ? PRESETS[0].id : elements.preset.value);
        if (selectedWasDeleted) {
            applyPresetDefaults();
            updatePresetDescription();
            saveSettings();
            await renderDocument();
        }
        setFontUploadStatus("Шрифт удалён.");
    } catch (error) {
        console.error(error);
        setFontUploadStatus(error.message || "Не удалось удалить шрифт.", true);
    }
}

function setFontUploadStatus(message, isError = false) {
    elements.fontUploadStatus.textContent = message;
    elements.fontUploadStatus.classList.toggle("error", isError);
}

async function readApiError(response) {
    try {
        const data = await response.json();
        return data?.error || `Ошибка ${response.status}`;
    } catch {
        return `Ошибка ${response.status}`;
    }
}

function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}



function setSwooshStatus(message, isError = false) {
    elements.swooshStatus.textContent = message;
    elements.swooshStatus.classList.toggle("error", isError);
}

function getSwooshMode() {
    return elements.swooshMode.value === "initials" ? "initials" : "random";
}

function sanitizeInitials(value) {
    return String(value || "")
        .toUpperCase()
        .replace(/[^A-ZА-ЯЁ]/gu, "")
        .slice(0, 4);
}

function generateSwooshLibrary(showStatus = true) {
    const mode = getSwooshMode();
    const initials = sanitizeInitials(elements.swooshInitials.value);
    if (mode === "initials" && !initials) {
        setSwooshStatus("Введите 1–4 буквы, чтобы построить росчерки по инициалам.", true);
        return;
    }

    const count = 8;
    const baseSeed = freshSeed();
    swooshLibrary = Array.from({ length: count }, (_, index) => buildSwooshSpec(mode, initials, normalizeSeed(baseSeed + index * 104729)));
    renderSwooshGallery();
    if (showStatus) {
        setSwooshStatus(`Сгенерировано ${count} вариантов.`);
    }
    saveSettings();
}

function buildSwooshSpec(mode, initials, seed) {
    const random = seeded(seed);
    const loops = 1 + Math.floor(random() * 3);
    const width = 320 + Math.floor(random() * 120);
    const height = 96 + Math.floor(random() * 42);
    const leadText = mode === "initials" ? initials : "";
    const spec = {
        id: `spec-${seed}`,
        seed,
        mode,
        initials: leadText,
        width,
        height,
        slant: -.18 + random() * .20,
        baseline: height * (.56 + random() * .12),
        lineCount: 1 + (random() > .65 ? 1 : 0),
        loops,
        tailLift: -14 + random() * 32,
        pressure: .70 + random() * .24,
        wave: 6 + random() * 16,
        segments: 4 + Math.floor(random() * 4),
        underline: random() > .32,
        flourish: random() > .44,
        leadScale: .75 + random() * .26,
        gap: 14 + random() * 20
    };

    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = width;
    previewCanvas.height = height;
    const ctx = previewCanvas.getContext("2d");
    drawSwooshSpec(ctx, spec, { x: 10, y: 12, width: width - 20, height: height - 24, rotation: 0, scale: 1 });
    return {
        id: `swoosh-${seed}`,
        name: leadText ? `Росчерк ${leadText} · ${String(seed).slice(-3)}` : `Росчерк · ${String(seed).slice(-3)}`,
        caption: mode === "initials" ? `По буквам: ${leadText}` : "Полностью случайный вариант",
        previewUrl: previewCanvas.toDataURL("image/png"),
        width,
        height,
        spec
    };
}

function drawSwooshSpec(context, spec, placement) {
    const random = seeded(spec.seed);
    const x = placement.x || 0;
    const y = placement.y || 0;
    const width = placement.width || spec.width;
    const height = placement.height || spec.height;
    const scaleX = width / spec.width;
    const scaleY = height / spec.height;
    const scale = placement.scale || Math.min(scaleX, scaleY);
    const baseline = spec.baseline;

    context.save();
    context.translate(x + width / 2, y + height / 2);
    context.rotate(placement.rotation || 0);
    context.translate(-width / 2, -height / 2);
    context.scale(scaleX, scaleY);
    context.lineCap = "round";
    context.lineJoin = "round";

    const strokeBlue = { r: 36, g: 76, b: 164 };
    const makeColor = alpha => `rgba(${strokeBlue.r + (random() - .5) * 8}, ${strokeBlue.g + (random() - .5) * 8}, ${strokeBlue.b + (random() - .5) * 10}, ${alpha})`;

    let leadWidth = 0;
    if (spec.initials) {
        context.save();
        context.font = `${Math.round(60 * spec.leadScale)}px "Marck Script", "Bad Script", cursive`;
        context.fillStyle = makeColor(.78 * spec.pressure);
        context.globalAlpha = .95;
        context.translate(18, baseline - 10);
        context.rotate(spec.slant * .20);
        context.fillText(spec.initials, 0, 0);
        if (random() > .28) {
            context.globalAlpha = .16;
            context.fillText(spec.initials, (random() - .5) * 2.2, (random() - .5) * 1.8);
        }
        leadWidth = context.measureText(spec.initials).width + spec.gap;
        context.restore();
    }

    for (let pass = 0; pass < spec.lineCount; pass += 1) {
        const mainY = baseline + (pass * 5 - 2);
        const startX = 16 + leadWidth + pass * 8;
        const endX = spec.width - 18;
        const slope = spec.tailLift + (pass * 6 - 2);
        const amplitude = spec.wave * (.85 + random() * .4);
        context.save();
        context.lineWidth = 2.2 + spec.pressure * 1.6 + pass * .35;
        context.strokeStyle = makeColor((.56 + random() * .18) * spec.pressure);
        context.shadowColor = 'rgba(25,45,104,.08)';
        context.shadowBlur = .6;
        context.beginPath();
        context.moveTo(startX, mainY);

        let px = startX;
        let py = mainY;
        const segmentWidth = (endX - startX) / spec.segments;
        for (let seg = 0; seg < spec.segments; seg += 1) {
            const nx = startX + segmentWidth * (seg + 1);
            const ny = mainY + Math.sin(seg * .9 + random() * .7) * amplitude * (.35 + random() * .55) + slope * (seg / Math.max(1, spec.segments - 1));
            const cp1x = px + segmentWidth * (.28 + random() * .18);
            const cp1y = py + (random() - .5) * amplitude * 1.2;
            const cp2x = nx - segmentWidth * (.22 + random() * .16);
            const cp2y = ny + (random() - .5) * amplitude * 1.2;
            context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, nx, ny);
            px = nx;
            py = ny;
        }
        context.stroke();

        if (spec.flourish && pass === spec.lineCount - 1) {
            let loopX = endX - 28;
            let loopY = py;
            for (let loop = 0; loop < spec.loops; loop += 1) {
                const radius = 14 + random() * 18;
                context.beginPath();
                context.moveTo(loopX, loopY);
                context.bezierCurveTo(loopX + radius, loopY - radius, loopX + radius * 1.1, loopY + radius * .9, loopX + radius * .2, loopY + radius * 1.18);
                context.bezierCurveTo(loopX - radius * .65, loopY + radius * .8, loopX - radius * .55, loopY - radius * .9, loopX + radius * .3, loopY - radius * .4);
                context.stroke();
                loopX += radius * .58;
                loopY += (random() - .5) * 6;
            }
        }

        if (spec.underline && pass === 0) {
            const underY = baseline + 18 + random() * 8;
            context.beginPath();
            context.moveTo(Math.max(12, startX - 10), underY);
            context.bezierCurveTo(startX + 42, underY + 8, endX - 44, underY - 6, endX - 6, underY + random() * 8);
            context.strokeStyle = makeColor((.30 + random() * .12) * spec.pressure);
            context.lineWidth = 1.4 + random();
            context.stroke();
        }

        context.restore();
    }

    context.restore();
}

function renderSwooshGallery() {
    elements.swooshGallery.replaceChildren();
    if (swooshLibrary.length === 0) {
        const empty = document.createElement("div");
        empty.className = "swoosh-empty";
        empty.textContent = "Сгенерируйте росчерки, и они появятся здесь.";
        elements.swooshGallery.append(empty);
        return;
    }

    for (const item of swooshLibrary) {
        const card = document.createElement("div");
        card.className = "swoosh-item";

        const previewWrap = document.createElement("div");
        previewWrap.className = "swoosh-preview-wrap";
        const title = document.createElement("strong");
        title.textContent = item.name;
        const small = document.createElement("small");
        small.textContent = item.caption;
        const image = document.createElement("img");
        image.className = "swoosh-preview";
        image.src = item.previewUrl;
        image.alt = item.name;
        previewWrap.append(title, small, image);

        const actions = document.createElement("div");
        actions.className = "swoosh-item-actions";

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "button secondary";
        addButton.textContent = "На страницу";
        addButton.addEventListener("click", async () => {
            await placeSwooshOnActivePage(item);
        });

        const downloadButton = document.createElement("button");
        downloadButton.type = "button";
        downloadButton.className = "button";
        downloadButton.textContent = "PNG";
        downloadButton.addEventListener("click", () => downloadDataUrl(item.previewUrl, `${slugify(item.name)}.png`));

        actions.append(addButton, downloadButton);
        card.append(previewWrap, actions);
        elements.swooshGallery.append(card);
    }
}

async function placeSwooshOnActivePage(item) {
    if (pageCanvases.length === 0) {
        setSwooshStatus("Сначала сформируйте хотя бы одну страницу.", true);
        return;
    }

    swooshCounter += 1;
    const scale = .62;
    const width = item.width * scale;
    const height = item.height * scale;
    const placed = {
        id: `placed-${swooshCounter}`,
        pageIndex: activePageIndex,
        x: clamp(PAGE.width - width - 86, 18, PAGE.width - width - 18),
        y: clamp(PAGE.height - height - 96, 18, PAGE.height - height - 18),
        width,
        height,
        rotation: (-.08 + Math.random() * .16),
        spec: item.spec,
        previewUrl: item.previewUrl
    };

    placedSwooshes.push(placed);
    await applyPlacedSwooshes();
    renderPreview();
    saveSettings();
    setSwooshStatus(`Росчерк добавлен на страницу ${activePageIndex + 1}.`);
}

function cloneCanvas(source) {
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext("2d", { alpha: false }).drawImage(source, 0, 0);
    return copy;
}

async function applyPlacedSwooshes() {
    pageCanvases = basePageCanvases.map(cloneCanvas);
    for (const item of placedSwooshes) {
        const canvas = pageCanvases[item.pageIndex];
        if (!canvas) continue;
        const ctx = canvas.getContext("2d");
        drawSwooshSpec(ctx, item.spec, item);
    }
}

function renderPlacedSwooshes(layer, pageIndex, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / PAGE.width;
    const scaleY = rect.height / PAGE.height;
    const items = placedSwooshes.filter(item => item.pageIndex === pageIndex);
    for (const item of items) {
        const node = document.createElement("div");
        node.className = "placed-swoosh";
        node.dataset.id = item.id;
        node.style.left = `${item.x * scaleX}px`;
        node.style.top = `${item.y * scaleY}px`;
        node.style.width = `${item.width * scaleX}px`;
        node.style.height = `${item.height * scaleY}px`;
        node.style.transform = `rotate(${item.rotation}rad)`;

        const img = document.createElement("img");
        img.src = item.previewUrl;
        img.alt = "Росчерк";

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "swoosh-remove";
        remove.textContent = "×";
        remove.title = "Удалить росчерк";
        remove.addEventListener("click", async event => {
            event.stopPropagation();
            placedSwooshes = placedSwooshes.filter(entry => entry.id !== item.id);
            await applyPlacedSwooshes();
            renderPreview();
            saveSettings();
        });

        const resize = document.createElement("button");
        resize.type = "button";
        resize.className = "swoosh-resize";
        resize.title = "Изменить размер";
        resize.setAttribute("aria-label", resize.title);
        resize.addEventListener("pointerdown", event => startSwooshResize(event, item.id, rect));

        node.append(img, remove, resize);
        node.addEventListener("pointerdown", event => {
            if (event.target === resize || event.target === remove) return;
            startSwooshDrag(event, item.id, pageIndex, rect);
        });
        layer.append(node);
    }
}

function startSwooshDrag(event, itemId, pageIndex, rect) {
    event.preventDefault();
    event.stopPropagation();
    const item = placedSwooshes.find(entry => entry.id === itemId);
    if (!item) return;

    dragState = {
        itemId,
        pageIndex,
        pointerId: event.pointerId,
        scaleX: rect.width / PAGE.width,
        scaleY: rect.height / PAGE.height,
        offsetX: event.clientX - rect.left - item.x * (rect.width / PAGE.width),
        offsetY: event.clientY - rect.top - item.y * (rect.height / PAGE.height)
    };

    const target = event.currentTarget;
    target.classList.add("active");
    target.setPointerCapture?.(event.pointerId);

    const move = moveEvent => {
        if (!dragState || moveEvent.pointerId !== dragState.pointerId) return;
        const card = target.closest(".page-card");
        if (!card) return;
        const item = placedSwooshes.find(entry => entry.id === itemId);
        if (!item) return;
        const newX = (moveEvent.clientX - rect.left - dragState.offsetX) / dragState.scaleX;
        const newY = (moveEvent.clientY - rect.top - dragState.offsetY) / dragState.scaleY;
        item.x = clamp(newX, 0, PAGE.width - item.width);
        item.y = clamp(newY, 0, PAGE.height - item.height);
        target.style.left = `${item.x * dragState.scaleX}px`;
        target.style.top = `${item.y * dragState.scaleY}px`;
    };

    const finish = async finishEvent => {
        if (!dragState || finishEvent.pointerId !== dragState.pointerId) return;
        target.classList.remove("active");
        target.releasePointerCapture?.(finishEvent.pointerId);
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", finish);
        target.removeEventListener("pointercancel", finish);
        dragState = null;
        await applyPlacedSwooshes();
        renderPreview();
        saveSettings();
    };

    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
}

function startSwooshResize(event, itemId, rect) {
    event.preventDefault();
    event.stopPropagation();
    const item = placedSwooshes.find(entry => entry.id === itemId);
    if (!item) return;

    const target = event.currentTarget;
    const node = target.closest(".placed-swoosh");
    if (!node) return;

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startWidth = item.width;
    const startHeight = item.height;
    const aspectRatio = startWidth / Math.max(1, startHeight);
    const scaleX = rect.width / PAGE.width;
    const scaleY = rect.height / PAGE.height;

    node.classList.add("active", "resizing");
    target.setPointerCapture?.(event.pointerId);

    const move = moveEvent => {
        if (moveEvent.pointerId !== event.pointerId) return;
        const deltaX = (moveEvent.clientX - startClientX) / scaleX;
        const deltaY = (moveEvent.clientY - startClientY) / scaleY;
        const dominantDelta = Math.abs(deltaX) >= Math.abs(deltaY * aspectRatio)
            ? deltaX
            : deltaY * aspectRatio;
        const nextWidth = clamp(startWidth + dominantDelta, 110, Math.min(760, PAGE.width - item.x));
        item.width = nextWidth;
        item.height = nextWidth / aspectRatio;
        node.style.width = `${item.width * scaleX}px`;
        node.style.height = `${item.height * scaleY}px`;
    };

    const finish = async finishEvent => {
        if (finishEvent.pointerId !== event.pointerId) return;
        node.classList.remove("active", "resizing");
        target.releasePointerCapture?.(finishEvent.pointerId);
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", finish);
        target.removeEventListener("pointercancel", finish);
        await applyPlacedSwooshes();
        renderPreview();
        saveSettings();
        setSwooshStatus("Размер росчерка изменён.");
    };

    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
}

function slugify(value) {
    return String(value || "roscherk")
        .toLowerCase()
        .replace(/[^a-zа-яё0-9]+/giu, "-")
        .replace(/^-+|-+$/g, "") || "roscherk";
}

function scheduleRender(delay) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderDocument, delay);
}

async function loadFonts() {
    if (!document.fonts?.load) {
        return;
    }

    const fontNames = [...new Set(PRESETS.map(item => item.font))];
    await Promise.allSettled(fontNames.map(font => document.fonts.load(`32px "${font}"`, "АБВабв")));
}

function getPreset() {
    if (elements.preset.value.startsWith("custom:")) {
        const fontId = elements.preset.value.slice("custom:".length);
        const font = customFonts.find(item => item.id === fontId && item.loaded);
        if (font) {
            return customPresetFromFont(font);
        }
    }

    return PRESETS.find(item => item.id === elements.preset.value) || PRESETS[0];
}

function applyPresetDefaults() {
    const preset = getPreset();
    elements.fontSize.value = String(preset.defaultSize);
    elements.lineHeight.value = String(preset.defaultLineHeight);
    elements.naturalness.value = String(preset.defaultNaturalness);
    elements.inkStyle.value = preset.defaultInk;
    updateLabels();
}

function updatePresetDescription() {
    elements.presetDescription.textContent = getPreset().description;
}

function updateLabels() {
    elements.fontSizeValue.value = elements.fontSize.value;
    elements.lineHeightValue.value = elements.lineHeight.value;
    elements.naturalnessValue.value = elements.naturalness.value;
    elements.marginValue.value = elements.leftMargin.value;
}

async function renderDocument() {
    const token = ++renderToken;
    elements.statusText.textContent = "Формируем страницы…";
    setBusy(true);
    await nextFrame();

    try {
        const result = buildPages();
        if (token !== renderToken) {
            return;
        }

        basePageCanvases = result.pages;
        placedSwooshes = placedSwooshes.filter(item => item.pageIndex < basePageCanvases.length);
        activePageIndex = Math.min(activePageIndex, Math.max(0, basePageCanvases.length - 1));
        await applyPlacedSwooshes();
        renderPreview();

        const warning = result.truncated ? ` · показаны первые ${MAX_PAGES}` : "";
        elements.statusText.textContent = `Готово${warning}`;
        elements.pageCounter.textContent = pluralPages(pageCanvases.length);
    } catch (error) {
        console.error(error);
        elements.statusText.textContent = "Не удалось сформировать страницы";
        elements.pagesPreview.innerHTML = '<div class="empty-preview">Ошибка генерации. Уменьшите объём текста или обновите страницу.</div>';
    } finally {
        setBusy(false);
    }
}

function buildPages() {
    const preset = getPreset();
    const ink = INKS[elements.inkStyle.value] || INKS.blue;
    const naturalness = Number(elements.naturalness.value) / 100;
    const baseFontSize = Number(elements.fontSize.value) * preset.sizeScale;
    const lineHeight = Number(elements.lineHeight.value);
    const leftMargin = Number(elements.leftMargin.value);
    const maxWidth = PAGE.width - leftMargin - PAGE.right;
    const rawLines = elements.sourceText.value.replace(/\r/g, "").split("\n");
    const pages = [];
    let page = createPage(lineHeight, pages.length);
    pages.push(page.canvas);
    let context = page.context;
    let y = PAGE.top;
    let globalLineIndex = 0;
    let truncated = false;

    const ensureSpace = requiredHeight => {
        if (y + requiredHeight <= PAGE.height - PAGE.bottom) {
            return true;
        }

        if (pages.length >= MAX_PAGES) {
            truncated = true;
            return false;
        }

        page = createPage(lineHeight, pages.length);
        pages.push(page.canvas);
        context = page.context;
        y = PAGE.top;
        return true;
    };

    for (const rawLine of rawLines) {
        if (truncated) {
            break;
        }

        const trimmed = rawLine.trim();
        if (!trimmed) {
            if (!ensureSpace(lineHeight * .72)) {
                break;
            }
            y += lineHeight * .72;
            continue;
        }

        const isHeading = elements.recognizeHeadings.checked && detectHeading(trimmed);
        const bulletMatch = trimmed.match(/^(?:[•●▪◦]|[-*])\s+(.*)$/u);
        const headingScale = isHeading ? 1.11 : 1;
        const lineFontSize = baseFontSize * headingScale;
        const lineStep = lineHeight * (isHeading ? 1.08 : 1);
        const bulletPrefix = bulletMatch ? "•" : "";
        const content = bulletMatch ? bulletMatch[1] : trimmed;
        const continuationIndent = bulletMatch ? lineFontSize * 1.15 : 0;
        const firstLineWidth = maxWidth - continuationIndent;
        const wrapped = wrapText(context, content, preset, lineFontSize, firstLineWidth);

        for (let index = 0; index < wrapped.length; index += 1) {
            if (!ensureSpace(lineStep)) {
                break;
            }

            const isFirst = index === 0;
            const prefix = bulletPrefix && isFirst ? `${bulletPrefix} ` : "";
            const x = leftMargin + (bulletPrefix && !isFirst ? continuationIndent : 0);
            const lineText = `${prefix}${wrapped[index]}`;
            const lineSeed = normalizeSeed(renderSeed + globalLineIndex * 104729 + pages.length * 7919);
            drawConnectedLine(
                context,
                lineText,
                x,
                y,
                preset,
                ink,
                lineFontSize,
                naturalness,
                lineSeed,
                isHeading
            );
            y += lineStep;
            globalLineIndex += 1;
        }

        if (isHeading) {
            y += lineHeight * .12;
        }
    }

    if (pages.length === 1 && elements.sourceText.value.trim().length === 0) {
        context.save();
        context.fillStyle = "rgba(75,83,96,.55)";
        context.font = '24px Inter, system-ui, sans-serif';
        context.fillText("Введите текст конспекта слева", leftMargin, PAGE.top);
        context.restore();
    }

    return { pages, truncated };
}

function createPage(lineHeight, pageIndex) {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE.width;
    canvas.height = PAGE.height;
    const context = canvas.getContext("2d", { alpha: false });
    drawPaper(context, lineHeight, pageIndex);
    return { canvas, context };
}

function drawPaper(context, lineHeight, pageIndex) {
    const style = elements.paperStyle.value;
    const colors = {
        lined: "#fffdf8",
        grid: "#fffdf8",
        plain: "#fffefc",
        warm: "#f8f0dc"
    };

    context.fillStyle = colors[style] || colors.lined;
    context.fillRect(0, 0, PAGE.width, PAGE.height);

    context.save();
    context.lineWidth = 1;
    if (style === "lined") {
        context.strokeStyle = "rgba(83,132,185,.23)";
        for (let y = PAGE.top + 8; y < PAGE.height - 55; y += lineHeight) {
            drawLine(context, 55, y, PAGE.width - 48, y);
        }
        context.strokeStyle = "rgba(211,88,88,.29)";
        drawLine(context, Number(elements.leftMargin.value) - 18, 44, Number(elements.leftMargin.value) - 18, PAGE.height - 44);
    } else if (style === "grid") {
        const step = Math.max(34, Math.min(48, lineHeight * .82));
        context.strokeStyle = "rgba(83,132,185,.16)";
        for (let y = 45; y < PAGE.height - 40; y += step) {
            drawLine(context, 45, y, PAGE.width - 45, y);
        }
        for (let x = 45; x < PAGE.width - 40; x += step) {
            drawLine(context, x, 42, x, PAGE.height - 42);
        }
    }
    context.restore();

    const random = seeded(normalizeSeed(renderSeed + pageIndex * 65537 + 41));
    context.save();
    for (let index = 0; index < 180; index += 1) {
        const alpha = .006 + random() * .012;
        context.fillStyle = `rgba(72,62,47,${alpha})`;
        const size = .4 + random() * 1.1;
        context.fillRect(random() * PAGE.width, random() * PAGE.height, size, size);
    }
    context.restore();
}

function wrapText(context, text, preset, fontSize, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return [""];
    }

    const lines = [];
    let current = "";
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (measureConnectedText(context, candidate, preset, fontSize) <= maxWidth || !current) {
            current = candidate;
        } else {
            lines.push(current);
            current = word;
        }
    }

    if (current) {
        lines.push(current);
    }
    return lines;
}

function measureConnectedText(context, text, preset, fontSize) {
    context.font = `${preset.id === "adult-natural" ? 430 : 400} ${fontSize}px "${preset.font}", cursive`;
    return context.measureText(text).width * preset.compress + Math.max(0, text.length - 1) * preset.wordSpacing * .14;
}

function drawConnectedLine(context, text, startX, baselineY, preset, ink, fontSize, naturalness, seed, isHeading) {
    const random = seeded(seed);
    const tokens = text.match(/\S+|\s+/g) || [];
    const baseColor = hexToRgb(ink.color);
    const effectiveNaturalness = naturalness * (isHeading ? .58 : 1);
    const lineSlope = (random() - .5) * preset.rotation * effectiveNaturalness;
    const lineDrift = (random() - .5) * preset.baselineJitter * effectiveNaturalness;
    let cursor = startX + (random() - .5) * 4 * effectiveNaturalness;
    let wordIndex = 0;

    for (const token of tokens) {
        if (/^\s+$/.test(token)) {
            cursor += fontSize * (.18 + random() * .045) + preset.wordSpacing;
            continue;
        }

        const localSize = fontSize * (1 + (random() - .5) * .025 * effectiveNaturalness);
        const localCompress = clamp(
            preset.compress + (random() - .5) * preset.widthJitter * effectiveNaturalness,
            .70,
            1.10
        );
        const localSlant = preset.slant + (random() - .5) * .018 * effectiveNaturalness;
        const angle = lineSlope + (random() - .5) * preset.rotation * .55 * effectiveNaturalness;
        const wave = Math.sin(wordIndex * .78 + random() * .7) * preset.baselineJitter * .42 * effectiveNaturalness;
        const dy = lineDrift + wave + (random() - .5) * preset.baselineJitter * .38 * effectiveNaturalness;
        const weakWord = random() < ink.weakChance * (.55 + effectiveNaturalness);
        const alphaRandom = ink.alphaMin + random() * (ink.alphaMax - ink.alphaMin);
        const alpha = clamp(alphaRandom * preset.alpha * (weakWord ? .58 : 1), .16, .98);
        const jitter = (random() - .5) * ink.jitter;
        const color = rgbString(
            clamp(baseColor.r + jitter, 0, 255),
            clamp(baseColor.g + jitter, 0, 255),
            clamp(baseColor.b + jitter * 1.25, 0, 255)
        );
        const weight = isHeading ? 500 : preset.id === "adult-natural" ? 430 : 400;

        context.save();
        context.translate(cursor, baselineY + dy);
        context.rotate(angle);
        context.transform(localCompress, 0, localSlant * effectiveNaturalness, 1, 0, 0);
        context.font = `${weight} ${localSize}px "${preset.font}", cursive`;
        context.fillStyle = color;
        context.globalAlpha = alpha;
        context.shadowColor = `rgba(${baseColor.r},${baseColor.g},${baseColor.b},.07)`;
        context.shadowBlur = .25;
        context.fillText(token, 0, 0);

        if (!weakWord && random() < .84) {
            context.globalAlpha = clamp(alpha * ink.overlay, .025, .20);
            context.fillText(token, (random() - .5) * .48, (random() - .5) * .36);
        }

        const wordWidth = context.measureText(token).width;
        context.restore();

        cursor += wordWidth * localCompress + preset.wordSpacing + (random() - .5) * .75 * effectiveNaturalness;
        wordIndex += 1;
    }

    context.globalAlpha = 1;
    context.shadowBlur = 0;
}

function detectHeading(text) {
    if (/^тема\s*:/iu.test(text)) {
        return true;
    }
    if (text.length <= 70 && /:$/.test(text) && !/[.!?]/.test(text.slice(0, -1))) {
        return true;
    }
    return /^#{1,3}\s+/.test(text);
}

function renderPreview() {
    elements.pagesPreview.replaceChildren();
    if (pageCanvases.length === 0) {
        elements.pagesPreview.innerHTML = '<div class="empty-preview">Нет страниц для отображения.</div>';
        return;
    }

    pageCanvases.forEach((canvas, index) => {
        const card = document.createElement("article");
        card.className = `page-card${index === activePageIndex ? " active" : ""}`;
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Выбрать страницу ${index + 1}`);

        const canvasWrap = document.createElement("div");
        canvasWrap.className = "page-canvas-wrap";
        canvasWrap.append(canvas);

        const layer = document.createElement("div");
        layer.className = "page-swoosh-layer";
        canvasWrap.append(layer);
        card.append(canvasWrap);

        const label = document.createElement("div");
        label.className = "page-label";
        label.textContent = `Страница ${index + 1}`;
        card.append(label);

        const activate = () => {
            activePageIndex = index;
            elements.pagesPreview.querySelectorAll(".page-card").forEach((item, itemIndex) => {
                item.classList.toggle("active", itemIndex === activePageIndex);
            });
        };
        card.addEventListener("click", activate);
        card.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activate();
            }
        });
        elements.pagesPreview.append(card);
        requestAnimationFrame(() => renderPlacedSwooshes(layer, index, canvas));
    });
}

function downloadCurrentPage() {
    const canvas = pageCanvases[activePageIndex];
    if (!canvas) {
        return;
    }
    downloadDataUrl(canvas.toDataURL("image/png"), buildPageFileName(activePageIndex));
}

async function downloadAllPagesZip() {
    if (pageCanvases.length === 0) {
        return;
    }

    elements.downloadAllButton.disabled = true;
    elements.statusText.textContent = "Собираем ZIP…";
    try {
        const files = [];
        for (let index = 0; index < pageCanvases.length; index += 1) {
            const blob = await canvasToBlob(pageCanvases[index]);
            files.push({
                name: buildPageFileName(index),
                data: new Uint8Array(await blob.arrayBuffer())
            });
        }

        const zip = buildStoreZip(files);
        const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
        downloadDataUrl(url, `konspekt-${new Date().toISOString().slice(0, 10)}.zip`);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        elements.statusText.textContent = "ZIP готов";
    } catch (error) {
        console.error(error);
        elements.statusText.textContent = "Не удалось собрать ZIP";
    } finally {
        elements.downloadAllButton.disabled = false;
    }
}

function printPages() {
    if (pageCanvases.length === 0) {
        return;
    }

    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
        elements.statusText.textContent = "Браузер заблокировал окно печати";
        return;
    }

    const images = pageCanvases.map((canvas, index) =>
        `<img src="${canvas.toDataURL("image/png")}" alt="Страница ${index + 1}">`
    ).join("");

    printWindow.document.write(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Рукописный конспект</title>
<style>
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
img { display: block; width: 210mm; height: 297mm; object-fit: fill; page-break-after: always; }
img:last-child { page-break-after: auto; }
</style></head><body>${images}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`);
    printWindow.document.close();
}

function setBusy(value) {
    elements.renderButton.disabled = value;
    elements.regenerateButton.disabled = value;
    elements.downloadCurrentButton.disabled = value;
    elements.printButton.disabled = value;
    elements.generateSwooshesButton.disabled = value;
}

function saveSettings() {
    const data = {
        preset: elements.preset.value,
        paperStyle: elements.paperStyle.value,
        inkStyle: elements.inkStyle.value,
        fontSize: elements.fontSize.value,
        lineHeight: elements.lineHeight.value,
        naturalness: elements.naturalness.value,
        leftMargin: elements.leftMargin.value,
        recognizeHeadings: elements.recognizeHeadings.checked,
        sourceText: elements.sourceText.value,
        swooshMode: elements.swooshMode.value,
        swooshInitials: elements.swooshInitials.value,
        placedSwooshes
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        // Настройки не критичны для работы приложения.
    }
}

function restoreSettings() {
    let data = null;
    try {
        data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
        data = null;
    }

    if (!data) {
        elements.preset.value = PRESETS[0].id;
        return;
    }

    setSelectValue(elements.preset, data.preset);
    setSelectValue(elements.paperStyle, data.paperStyle);
    setSelectValue(elements.inkStyle, data.inkStyle);
    setRangeValue(elements.fontSize, data.fontSize);
    setRangeValue(elements.lineHeight, data.lineHeight);
    setRangeValue(elements.naturalness, data.naturalness);
    setRangeValue(elements.leftMargin, data.leftMargin);
    elements.recognizeHeadings.checked = data.recognizeHeadings !== false;
    setSelectValue(elements.swooshMode, data.swooshMode);
    if (typeof data.swooshInitials === "string") {
        elements.swooshInitials.value = data.swooshInitials;
    }
    if (typeof data.sourceText === "string") {
        elements.sourceText.value = data.sourceText;
    }
    if (Array.isArray(data.placedSwooshes)) {
        placedSwooshes = data.placedSwooshes.filter(item => item && typeof item.pageIndex === "number" && item.spec);
        swooshCounter = placedSwooshes.reduce((max, item) => Math.max(max, Number(item.id?.split("-").pop()) || 0), 0);
    }
}

function setSelectValue(select, value) {
    if (typeof value === "string" && Array.from(select.options).some(option => option.value === value)) {
        select.value = value;
    }
}

function setRangeValue(input, value) {
    const number = Number(value);
    if (Number.isFinite(number)) {
        input.value = String(clamp(number, Number(input.min), Number(input.max)));
    }
}

function buildPageFileName(index) {
    return `konspekt-${String(index + 1).padStart(2, "0")}.png`;
}

function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Canvas export failed")), "image/png");
    });
}

function downloadDataUrl(url, fileName) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
}

function buildStoreZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const { time, date } = getDosDateTime(new Date());

    for (const file of files) {
        const nameBytes = encoder.encode(file.name);
        const crc = crc32(file.data);
        const localHeader = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(localHeader.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0, true);
        localView.setUint16(8, 0, true);
        localView.setUint16(10, time, true);
        localView.setUint16(12, date, true);
        localView.setUint32(14, crc, true);
        localView.setUint32(18, file.data.length, true);
        localView.setUint32(22, file.data.length, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true);
        localHeader.set(nameBytes, 30);
        localParts.push(localHeader, file.data);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(centralHeader.buffer);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, time, true);
        centralView.setUint16(14, date, true);
        centralView.setUint32(16, crc, true);
        centralView.setUint32(20, file.data.length, true);
        centralView.setUint32(24, file.data.length, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, offset, true);
        centralHeader.set(nameBytes, 46);
        centralParts.push(centralHeader);

        offset += localHeader.length + file.data.length;
    }

    const centralDirectory = concatBytes(centralParts);
    const localData = concatBytes(localParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, localData.length, true);
    endView.setUint16(20, 0, true);
    return concatBytes([localData, centralDirectory, end]);
}

function getDosDateTime(value) {
    const year = Math.max(1980, value.getFullYear());
    const time = (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2);
    const date = ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate();
    return { time, date };
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
        }
        table[index] = value >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) {
        value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
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

function rgbString(red, green, blue) {
    return `rgb(${Math.round(red)},${Math.round(green)},${Math.round(blue)})`;
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

function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

function pluralPages(count) {
    const lastTwo = count % 100;
    const last = count % 10;
    if (lastTwo >= 11 && lastTwo <= 14) {
        return `${count} страниц`;
    }
    if (last === 1) {
        return `${count} страница`;
    }
    if (last >= 2 && last <= 4) {
        return `${count} страницы`;
    }
    return `${count} страниц`;
}
