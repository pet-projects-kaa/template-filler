"use strict";

const PAGE = { width: 1050, height: 1485, top: 118, right: 72, bottom: 82 };
const STORAGE_KEY = "template-filler-handwriting-settings-v6";
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

let pageCanvases = [];
let activePageIndex = 0;
let renderSeed = freshSeed();
let renderTimer = null;
let renderToken = 0;

initialize();

async function initialize() {
    try {
        const response = await fetch("api/auth/me", { credentials: "same-origin" });
        if (!response.ok) {
            location.href = "./";
            return;
        }

        populatePresets();
        restoreSettings();
        wireEvents();
        updateLabels();
        updatePresetDescription();
        elements.gate.classList.add("hidden");
        elements.app.classList.remove("hidden");

        await loadFonts();
        await renderDocument();
    } catch (error) {
        console.error(error);
        elements.gate.textContent = "Не удалось открыть модуль рукописных конспектов.";
    }
}

function populatePresets() {
    for (const item of PRESETS) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        elements.preset.append(option);
    }
}

function wireEvents() {
    elements.preset.addEventListener("change", () => {
        applyPresetDefaults();
        updatePresetDescription();
        saveSettings();
        scheduleRender(80);
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

        pageCanvases = result.pages;
        activePageIndex = Math.min(activePageIndex, Math.max(0, pageCanvases.length - 1));
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
        card.append(canvas);

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
        sourceText: elements.sourceText.value
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
    if (typeof data.sourceText === "string") {
        elements.sourceText.value = data.sourceText;
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
