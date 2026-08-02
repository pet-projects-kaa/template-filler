"use strict";

const state = {
    templates: [],
    current: null,
    dirty: false,
    mode: "editor",
    fillValues: new Map(),
    savedRange: null
};

const elements = {
    templateList: document.getElementById("templateList"),
    templateSearch: document.getElementById("templateSearch"),
    templateName: document.getElementById("templateName"),
    editor: document.getElementById("editor"),
    fillDocument: document.getElementById("fillDocument"),
    saveButton: document.getElementById("saveButton"),
    saveStatus: document.getElementById("saveStatus"),
    newTemplateButton: document.getElementById("newTemplateButton"),
    duplicateButton: document.getElementById("duplicateButton"),
    deleteButton: document.getElementById("deleteButton"),
    insertFieldButton: document.getElementById("insertFieldButton"),
    convertFieldsButton: document.getElementById("convertFieldsButton"),
    editorTab: document.getElementById("editorTab"),
    fillTab: document.getElementById("fillTab"),
    editorView: document.getElementById("editorView"),
    fillView: document.getElementById("fillView"),
    resetFillButton: document.getElementById("resetFillButton"),
    printButton: document.getElementById("printButton"),
    fieldCount: document.getElementById("fieldCount"),
    blockFormat: document.getElementById("blockFormat"),
    fontSize: document.getElementById("fontSize"),
    textColor: document.getElementById("textColor"),
    toast: document.getElementById("toast")
};

const allowedTags = new Set([
    "P", "DIV", "BR", "B", "STRONG", "I", "EM", "U", "S", "STRIKE",
    "UL", "OL", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "SPAN", "FONT",
    "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "HR", "SUB", "SUP"
]);

const allowedStyles = new Set([
    "color", "background-color", "font-size", "font-family", "font-weight",
    "font-style", "text-decoration", "text-align", "margin-left", "padding-left",
    "line-height", "white-space", "width"
]);

const sampleContent = `
<p style="text-align: center;"><strong>ЗАЯВЛЕНИЕ</strong></p>
<p><br></p>
<p>Я, ________________________________, прошу предоставить мне ________________________________.</p>
<p>Дата составления: __________ . __________ . 2026 год</p>`;

let toastTimer;

initialize();

async function initialize() {
    wireEvents();
    document.execCommand("styleWithCSS", false, true);
    await loadTemplates();

    if (state.templates.length > 0) {
        await openTemplate(state.templates[0].id);
    } else {
        createDraft();
    }
}

function wireEvents() {
    elements.newTemplateButton.addEventListener("click", () => createDraft(true));
    elements.saveButton.addEventListener("click", saveCurrent);
    elements.duplicateButton.addEventListener("click", duplicateCurrent);
    elements.deleteButton.addEventListener("click", deleteCurrent);
    elements.insertFieldButton.addEventListener("mousedown", event => event.preventDefault());
    elements.insertFieldButton.addEventListener("click", insertFieldAtCaret);
    elements.convertFieldsButton.addEventListener("mousedown", event => event.preventDefault());
    elements.convertFieldsButton.addEventListener("click", () => {
        const count = convertUnderscoresToFields(elements.editor);
        if (count > 0) {
            markDirty();
            showToast(`Создано полей: ${count}`);
        } else {
            showToast("Прочерки из трёх и более символов не найдены.");
        }
    });

    elements.editorTab.addEventListener("click", () => setMode("editor"));
    elements.fillTab.addEventListener("click", () => setMode("fill"));
    elements.resetFillButton.addEventListener("click", resetFillFields);
    elements.printButton.addEventListener("click", printFilledDocument);
    elements.templateSearch.addEventListener("input", renderTemplateList);

    elements.templateName.addEventListener("input", markDirty);
    elements.editor.addEventListener("input", markDirty);
    elements.editor.addEventListener("paste", handlePaste);

    document.querySelectorAll("[data-command]").forEach(button => {
        button.addEventListener("mousedown", event => event.preventDefault());
        button.addEventListener("click", () => executeEditorCommand(button.dataset.command));
    });

    elements.blockFormat.addEventListener("change", () => {
        executeEditorCommand("formatBlock", elements.blockFormat.value);
        elements.blockFormat.value = "p";
    });

    elements.fontSize.addEventListener("change", () => {
        executeEditorCommand("fontSize", elements.fontSize.value);
    });

    elements.textColor.addEventListener("input", () => {
        executeEditorCommand("foreColor", elements.textColor.value);
    });

    document.addEventListener("selectionchange", saveEditorSelection);

    document.addEventListener("keydown", event => {
        const saveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s";
        if (saveShortcut) {
            event.preventDefault();
            saveCurrent();
        }
    });

    window.addEventListener("beforeunload", event => {
        if (!state.dirty) {
            return;
        }

        event.preventDefault();
        event.returnValue = "";
    });
}

async function loadTemplates() {
    try {
        state.templates = await api("api/templates");
        renderTemplateList();
    } catch (error) {
        showToast(error.message, true);
    }
}

function renderTemplateList() {
    const query = elements.templateSearch.value.trim().toLocaleLowerCase("ru");
    const templates = state.templates.filter(template =>
        template.name.toLocaleLowerCase("ru").includes(query));

    elements.templateList.replaceChildren();

    if (templates.length === 0) {
        const empty = document.createElement("div");
        empty.className = "list-empty";
        empty.textContent = query ? "Ничего не найдено" : "Сохранённых шаблонов пока нет";
        elements.templateList.append(empty);
        return;
    }

    for (const template of templates) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "template-item";
        if (state.current?.id === template.id) {
            button.classList.add("active");
        }

        const title = document.createElement("strong");
        title.textContent = template.name;

        const date = document.createElement("span");
        date.textContent = `Изменён ${formatDate(template.updatedAt)}`;

        button.append(title, date);
        button.addEventListener("click", () => openTemplate(template.id));
        elements.templateList.append(button);
    }
}

function createDraft(confirmDiscard = false) {
    if (confirmDiscard && !canDiscardChanges()) {
        return;
    }

    state.current = {
        id: null,
        name: "Новый шаблон",
        contentHtml: sampleContent,
        createdAt: null,
        updatedAt: null
    };

    state.fillValues.clear();
    elements.templateName.value = state.current.name;
    elements.editor.innerHTML = state.current.contentHtml;
    setDirty(true);
    setMode("editor");
    renderTemplateList();
    setTimeout(() => {
        elements.templateName.focus();
        elements.templateName.select();
    }, 0);
}

async function openTemplate(id) {
    if (state.current?.id === id) {
        return;
    }

    if (!canDiscardChanges()) {
        return;
    }

    try {
        const template = await api(`api/templates/${id}`);
        state.current = template;
        state.fillValues.clear();
        elements.templateName.value = template.name;
        elements.editor.innerHTML = sanitizeHtml(template.contentHtml || "");
        setDirty(false);
        setMode("editor");
        renderTemplateList();
    } catch (error) {
        showToast(error.message, true);
    }
}

async function saveCurrent() {
    if (!state.current) {
        return;
    }

    const name = elements.templateName.value.trim();
    if (!name) {
        elements.templateName.focus();
        showToast("Укажите название шаблона.", true);
        return;
    }

    convertUnderscoresToFields(elements.editor);
    const contentHtml = sanitizeHtml(elements.editor.innerHTML);
    elements.editor.innerHTML = contentHtml;

    const payload = { name, contentHtml };
    const isNew = !state.current.id;
    const url = isNew ? "api/templates" : `api/templates/${state.current.id}`;
    const method = isNew ? "POST" : "PUT";

    setSaveStatus("Сохранение…");

    try {
        const saved = await api(url, { method, body: payload });
        state.current = saved;
        elements.templateName.value = saved.name;
        setDirty(false);
        await loadTemplates();
        renderTemplateList();
        showToast(isNew ? "Шаблон создан." : "Изменения сохранены.");
    } catch (error) {
        setSaveStatus("Ошибка");
        showToast(error.message, true);
    }
}

async function duplicateCurrent() {
    if (!state.current) {
        return;
    }

    convertUnderscoresToFields(elements.editor);
    const payload = {
        name: `${elements.templateName.value.trim() || "Шаблон"} — копия`,
        contentHtml: sanitizeHtml(elements.editor.innerHTML)
    };

    try {
        const copy = await api("api/templates", { method: "POST", body: payload });
        state.current = null;
        setDirty(false);
        await loadTemplates();
        await openTemplate(copy.id);
        showToast("Копия шаблона создана.");
    } catch (error) {
        showToast(error.message, true);
    }
}

async function deleteCurrent() {
    if (!state.current?.id) {
        createDraft(false);
        return;
    }

    const confirmed = window.confirm(`Удалить шаблон «${state.current.name}»?`);
    if (!confirmed) {
        return;
    }

    try {
        await api(`api/templates/${state.current.id}`, { method: "DELETE" });
        state.current = null;
        setDirty(false);
        await loadTemplates();

        if (state.templates.length > 0) {
            await openTemplate(state.templates[0].id);
        } else {
            createDraft(false);
        }

        showToast("Шаблон удалён.");
    } catch (error) {
        showToast(error.message, true);
    }
}

function setMode(mode) {
    state.mode = mode;
    const editorMode = mode === "editor";

    elements.editorTab.classList.toggle("active", editorMode);
    elements.fillTab.classList.toggle("active", !editorMode);
    elements.editorTab.setAttribute("aria-selected", String(editorMode));
    elements.fillTab.setAttribute("aria-selected", String(!editorMode));
    elements.editorView.classList.toggle("hidden", !editorMode);
    elements.fillView.classList.toggle("hidden", editorMode);

    if (!editorMode) {
        const converted = convertUnderscoresToFields(elements.editor);
        if (converted > 0) {
            markDirty();
        }
        buildFillDocument();
    }
}

function buildFillDocument() {
    const container = document.createElement("div");
    container.innerHTML = sanitizeHtml(elements.editor.innerHTML);
    convertUnderscoresToFields(container);

    const placeholders = [...container.querySelectorAll(".placeholder-token")];

    for (const placeholder of placeholders) {
        const fieldId = placeholder.dataset.fieldId || createId();
        const field = document.createElement("span");
        field.className = "fill-field";
        field.contentEditable = "true";
        field.spellcheck = false;
        field.dataset.fieldId = fieldId;
        field.setAttribute("role", "textbox");
        field.setAttribute("aria-label", "Заполняемое поле");
        field.textContent = state.fillValues.get(fieldId) || "";
        placeholder.replaceWith(field);
    }

    elements.fillDocument.innerHTML = container.innerHTML;

    elements.fillDocument.querySelectorAll(".fill-field").forEach(bindFillField);

    const count = elements.fillDocument.querySelectorAll(".fill-field").length;
    elements.fieldCount.textContent = count === 0
        ? "Поля не найдены"
        : `Полей: ${count}`;
}

function bindFillField(field) {
    const fieldId = field.dataset.fieldId;

    field.addEventListener("input", () => {
        const normalized = normalizeFieldInput(field.textContent || "");

        if (!normalized) {
            field.replaceChildren();
        } else if (field.textContent !== normalized) {
            field.textContent = normalized;
            placeCaretAtEnd(field);
        }

        state.fillValues.set(fieldId, normalized);
    });

    field.addEventListener("blur", () => {
        const finalValue = getFinalFieldValue(field.textContent || "");
        field.textContent = finalValue;
        state.fillValues.set(fieldId, finalValue);
    });

    field.addEventListener("paste", event => {
        event.preventDefault();
        const text = normalizeFieldInput(event.clipboardData?.getData("text/plain") || "");
        document.execCommand("insertText", false, text);
    });

    field.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            focusNextFillField(field, event.shiftKey ? -1 : 1);
            return;
        }

        if (event.key === "Tab") {
            event.preventDefault();
            focusNextFillField(field, event.shiftKey ? -1 : 1);
        }
    });
}

function focusNextFillField(current, direction) {
    const fields = [...elements.fillDocument.querySelectorAll(".fill-field")];
    const currentIndex = fields.indexOf(current);
    if (currentIndex < 0 || fields.length === 0) {
        return;
    }

    const nextIndex = (currentIndex + direction + fields.length) % fields.length;
    fields[nextIndex].focus();
    placeCaretAtEnd(fields[nextIndex]);
}

function placeCaretAtEnd(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function normalizeFieldInput(value) {
    return value.replace(/[\r\n\t]+/g, " ");
}

function getFinalFieldValue(value) {
    return normalizeFieldInput(value).trim();
}

function resetFillFields() {
    state.fillValues.clear();
    elements.fillDocument.querySelectorAll(".fill-field").forEach(field => {
        field.textContent = "";
    });
    showToast("Поля очищены.");
}

function printFilledDocument() {
    const clone = elements.fillDocument.cloneNode(true);

    clone.querySelectorAll(".fill-field").forEach(field => {
        const value = getFinalFieldValue(field.textContent || "");
        const span = document.createElement("span");
        span.className = "print-value";
        span.textContent = value;
        field.replaceWith(span);
    });

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        showToast("Браузер заблокировал окно печати.", true);
        return;
    }

    printWindow.opener = null;
    const title = escapeHtml(elements.templateName.value.trim() || "Документ");
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
@page { size: A4; margin: 20mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #111; font-family: "PT Astra Serif", "Times New Roman", serif; font-size: 12pt; line-height: 1.15; }
p { margin: 0 0 10px; }
h1, h2, h3 { margin: 0 0 14px; }
table { width: 100%; border-collapse: collapse; }
td, th { padding: 6px; border: 1px solid #888; }
.print-value { display: inline; margin: 0; padding: 0; border: 0; background: transparent; font: inherit; white-space: pre-wrap; }
</style>
</head>
<body>${clone.innerHTML}</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 150);
}

function convertUnderscoresToFields(root) {
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
        if (!node.parentElement?.closest(".placeholder-token") && /_{3,}/.test(node.nodeValue || "")) {
            textNodes.push(node);
        }
    }

    let created = 0;

    for (const textNode of textNodes) {
        const text = textNode.nodeValue || "";
        const matches = [...text.matchAll(/_{3,}/g)];
        if (matches.length === 0 || !textNode.parentNode) {
            continue;
        }

        const blockText = getContainingBlockText(textNode);
        const preserveAsManualDate = isManualDateLine(blockText);
        const fragment = document.createDocumentFragment();
        let cursor = 0;

        for (const match of matches) {
            const index = match.index ?? 0;
            fragment.append(document.createTextNode(text.slice(cursor, index)));

            if (preserveAsManualDate) {
                fragment.append(document.createTextNode(match[0]));
            } else {
                fragment.append(createPlaceholder());
                created += 1;
            }

            cursor = index + match[0].length;
        }

        fragment.append(document.createTextNode(text.slice(cursor)));
        textNode.parentNode.replaceChild(fragment, textNode);
    }

    return created;
}

function getContainingBlockText(textNode) {
    const block = textNode.parentElement?.closest("p, div, li, td, th, blockquote")
        || textNode.parentElement;
    return (block?.textContent || textNode.nodeValue || "").replace(/\u00a0/g, " ");
}

function isManualDateLine(text) {
    const normalized = text.replace(/\s+/g, " ").trim();
    const hasYearWord = /(?:19|20)\d{2}\s*год(?:\s|$|[.,])/i.test(normalized);
    const hasBlankDatePattern = /_{3,}\s*[./]\s*_{3,}/.test(normalized);
    return hasYearWord && hasBlankDatePattern;
}

function createPlaceholder() {
    const placeholder = document.createElement("span");
    placeholder.className = "placeholder-token";
    placeholder.contentEditable = "false";
    placeholder.dataset.fieldId = createId();
    placeholder.title = "Заполняемое поле";
    placeholder.setAttribute("aria-label", "Заполняемое поле");
    return placeholder;
}

function insertFieldAtCaret() {
    restoreEditorSelection();
    elements.editor.focus();

    const selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;

    if (!range || !elements.editor.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(elements.editor);
        range.collapse(false);
    }

    range.deleteContents();
    const placeholder = createPlaceholder();
    range.insertNode(placeholder);
    range.setStartAfter(placeholder);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
    state.savedRange = range.cloneRange();
    markDirty();
}

function handlePaste(event) {
    event.preventDefault();

    const html = event.clipboardData?.getData("text/html");
    const text = event.clipboardData?.getData("text/plain") || "";

    restoreEditorSelection();

    if (html) {
        document.execCommand("insertHTML", false, sanitizeHtml(html));
    } else {
        const safeText = escapeHtml(text).replace(/\r?\n/g, "<br>");
        document.execCommand("insertHTML", false, safeText);
    }

    markDirty();
}

function executeEditorCommand(command, value = null) {
    restoreEditorSelection();
    elements.editor.focus();
    document.execCommand(command, false, value);
    saveEditorSelection();
    markDirty();
}

function saveEditorSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return;
    }

    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer;

    if (commonAncestor && elements.editor.contains(commonAncestor)) {
        state.savedRange = range.cloneRange();
    }
}

function restoreEditorSelection() {
    if (!state.savedRange) {
        elements.editor.focus();
        return;
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(state.savedRange);
}

function sanitizeHtml(html) {
    const source = document.createElement("template");
    source.innerHTML = html || "";

    const target = document.createElement("div");
    for (const child of [...source.content.childNodes]) {
        const cleaned = cleanNode(child);
        if (cleaned) {
            target.append(cleaned);
        }
    }

    return target.innerHTML;
}

function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.nodeValue || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    const tagName = node.tagName.toUpperCase();

    if (!allowedTags.has(tagName)) {
        const fragment = document.createDocumentFragment();
        for (const child of [...node.childNodes]) {
            const cleanedChild = cleanNode(child);
            if (cleanedChild) {
                fragment.append(cleanedChild);
            }
        }
        return fragment;
    }

    const cleanElement = document.createElement(tagName.toLowerCase());

    const isPlaceholder = tagName === "SPAN" && node.classList.contains("placeholder-token");

    if (isPlaceholder) {
        cleanElement.className = "placeholder-token";
        cleanElement.contentEditable = "false";
        cleanElement.dataset.fieldId = node.dataset.fieldId || createId();
        cleanElement.title = "Заполняемое поле";
        cleanElement.setAttribute("aria-label", "Заполняемое поле");
    }

    const safeStyle = sanitizeStyle(node.getAttribute("style") || "");
    if (safeStyle) {
        cleanElement.setAttribute("style", safeStyle);
    }

    if (tagName === "FONT") {
        for (const attribute of ["color", "face", "size"]) {
            const value = node.getAttribute(attribute);
            if (value && value.length < 100) {
                cleanElement.setAttribute(attribute, value);
            }
        }
    }

    if (["TD", "TH"].includes(tagName)) {
        for (const attribute of ["colspan", "rowspan"]) {
            const value = node.getAttribute(attribute);
            if (/^\d{1,2}$/.test(value || "")) {
                cleanElement.setAttribute(attribute, value);
            }
        }
    }

    if (!isPlaceholder) {
        for (const child of [...node.childNodes]) {
            const cleanedChild = cleanNode(child);
            if (cleanedChild) {
                cleanElement.append(cleanedChild);
            }
        }
    }

    return cleanElement;
}

function sanitizeStyle(styleText) {
    const parser = document.createElement("span");
    parser.style.cssText = styleText;
    const safeParts = [];

    for (const property of [...parser.style]) {
        if (!allowedStyles.has(property)) {
            continue;
        }

        const value = parser.style.getPropertyValue(property).trim();
        if (!value || /url\s*\(|expression\s*\(/i.test(value)) {
            continue;
        }

        safeParts.push(`${property}: ${value}`);
    }

    return safeParts.join("; ");
}

function markDirty() {
    setDirty(true);
}

function setDirty(value) {
    state.dirty = value;
    setSaveStatus(value ? "Не сохранено" : "Сохранено");
}

function setSaveStatus(text) {
    elements.saveStatus.textContent = text;
}

function canDiscardChanges() {
    return !state.dirty || window.confirm("Есть несохранённые изменения. Продолжить без сохранения?");
}

async function api(url, options = {}) {
    const request = {
        method: options.method || "GET",
        headers: {}
    };

    if (options.body !== undefined) {
        request.headers["Content-Type"] = "application/json";
        request.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, request);

    if (!response.ok) {
        let message = `Ошибка ${response.status}`;
        try {
            const data = await response.json();
            message = data.error || data.title || message;
        } catch {
            // Сервер вернул ответ без JSON.
        }
        throw new Error(message);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}

function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", isError);
    elements.toast.classList.add("visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}

function formatDate(value) {
    return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(value));
}

function createId() {
    return globalThis.crypto?.randomUUID?.() ||
        `field-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
