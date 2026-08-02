"use strict";

const el = {
    gate: document.getElementById("authGate"),
    app: document.getElementById("handwritingApp"),
    text: document.getElementById("sourceText"),
    style: document.getElementById("handwritingStyle"),
    paper: document.getElementById("paperStyle"),
    ink: document.getElementById("inkColor"),
    size: document.getElementById("fontSize"),
    randomness: document.getElementById("randomness"),
    lineHeight: document.getElementById("lineHeight"),
    render: document.getElementById("renderButton"),
    randomize: document.getElementById("randomizeButton"),
    download: document.getElementById("downloadButton"),
    status: document.getElementById("renderStatus"),
    canvas: document.getElementById("paperCanvas")
};

const ctx = el.canvas.getContext("2d");
let seed = Math.floor(Math.random() * 2147483646) + 1;

initialize();

async function initialize() {
    try {
        const response = await fetch("api/auth/me", { credentials: "same-origin" });
        if (!response.ok) {
            location.href = "./";
            return;
        }
        el.gate.classList.add("hidden");
        el.app.classList.remove("hidden");
        wireEvents();
        renderDocument();
    } catch {
        el.gate.textContent = "Не удалось подключиться к серверу.";
    }
}

function wireEvents() {
    el.render.addEventListener("click", () => { seed = Date.now() % 2147483647; renderDocument(); });
    el.randomize.addEventListener("click", randomizeSettings);
    el.download.addEventListener("click", downloadPng);
    [el.paper, el.ink, el.size, el.randomness, el.lineHeight, el.style].forEach(input => input.addEventListener("input", renderDocument));
    let timer;
    el.text.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(renderDocument, 180);
    });
}

function randomizeSettings() {
    const styles = ["neat", "casual", "quick"];
    const papers = ["lined", "grid", "plain"];
    const inks = ["#2450a4", "#20232a", "#1f5d46"];
    el.style.value = styles[Math.floor(Math.random() * styles.length)];
    el.paper.value = papers[Math.floor(Math.random() * papers.length)];
    el.ink.value = inks[Math.floor(Math.random() * inks.length)];
    el.size.value = String(26 + Math.floor(Math.random() * 11));
    el.randomness.value = String(25 + Math.floor(Math.random() * 55));
    el.lineHeight.value = String(44 + Math.floor(Math.random() * 17));
    seed = Date.now() % 2147483647;
    renderDocument();
}

function renderDocument() {
    el.status.textContent = "Генерация…";
    drawPaper();
    drawText();
    el.status.textContent = "Готово";
}

function drawPaper() {
    const w = el.canvas.width, h = el.canvas.height;
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.lineWidth = 1;
    if (el.paper.value === "lined") {
        ctx.strokeStyle = "rgba(91,139,190,.23)";
        for (let y = 120; y < h - 70; y += 56) line(70, y, w - 70, y);
        ctx.strokeStyle = "rgba(215,92,92,.32)";
        line(145, 60, 145, h - 60);
    } else if (el.paper.value === "grid") {
        ctx.strokeStyle = "rgba(91,139,190,.18)";
        for (let y = 70; y < h - 50; y += 42) line(55, y, w - 55, y);
        for (let x = 55; x < w - 50; x += 42) line(x, 55, x, h - 55);
    }
    ctx.restore();
}

function drawText() {
    const text = el.text.value.replace(/\r/g, "");
    const fontSize = Number(el.size.value);
    const lineHeight = Number(el.lineHeight.value);
    const randomness = Number(el.randomness.value) / 100;
    const style = el.style.value;
    const font = style === "neat" ? '"Segoe Print", "Comic Sans MS", cursive' : style === "quick" ? '"Bradley Hand", "Segoe Print", cursive' : '"Comic Sans MS", "Segoe Print", cursive';
    const left = 175;
    const right = el.canvas.width - 85;
    const maxWidth = right - left;
    let y = 135;
    let random = seeded(seed);

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = el.ink.value;

    for (const paragraph of text.split("\n")) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (!words.length) { y += lineHeight; continue; }
        let lineWords = [];
        for (const word of words) {
            const candidate = [...lineWords, word].join(" ");
            ctx.font = `${fontSize}px ${font}`;
            if (ctx.measureText(candidate).width > maxWidth && lineWords.length) {
                drawNaturalLine(lineWords.join(" "), left, y, font, fontSize, randomness, random);
                y += lineHeight;
                lineWords = [word];
            } else {
                lineWords.push(word);
            }
            if (y > el.canvas.height - 90) break;
        }
        if (lineWords.length && y <= el.canvas.height - 90) {
            drawNaturalLine(lineWords.join(" "), left, y, font, fontSize, randomness, random);
            y += lineHeight;
        }
    }
}

function drawNaturalLine(text, x, y, font, size, randomness, random) {
    let cursor = x + (random() - .5) * 5 * randomness;
    for (const ch of text) {
        const localSize = size * (1 + (random() - .5) * .06 * randomness);
        const dy = (random() - .5) * 4.5 * randomness;
        const angle = (random() - .5) * .045 * randomness;
        ctx.save();
        ctx.translate(cursor, y + dy);
        ctx.rotate(angle);
        ctx.globalAlpha = .78 + random() * .2;
        ctx.font = `${localSize}px ${font}`;
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        const width = ctx.measureText(ch).width;
        cursor += width + (random() - .5) * 1.8 * randomness;
    }
    ctx.globalAlpha = 1;
}

function line(x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function seeded(initial) {
    let value = initial || 1;
    return () => {
        value = value * 16807 % 2147483647;
        return (value - 1) / 2147483646;
    };
}

function downloadPng() {
    renderDocument();
    const link = document.createElement("a");
    link.download = `rukopisny-text-${new Date().toISOString().slice(0,10)}.png`;
    link.href = el.canvas.toDataURL("image/png");
    link.click();
}
