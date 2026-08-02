"use strict";

const state = {
    templates: [],
    current: null,
    user: null,
    workspaceLoaded: false,
    dirty: false,
    fillTemplateDirty: false,
    mode: "editor",
    fillValues: new Map(),
    savedRange: null,
    passwordChangeRequired: false
};

const elements = {
    appShell: document.getElementById("appShell"),
    loginOverlay: document.getElementById("loginOverlay"),
    loginForm: document.getElementById("loginForm"),
    loginUsername: document.getElementById("loginUsername"),
    loginPassword: document.getElementById("loginPassword"),
    loginRemember: document.getElementById("loginRemember"),
    loginButton: document.getElementById("loginButton"),
    loginError: document.getElementById("loginError"),
    passwordOverlay: document.getElementById("passwordOverlay"),
    passwordForm: document.getElementById("passwordForm"),
    passwordDialogHint: document.getElementById("passwordDialogHint"),
    currentPassword: document.getElementById("currentPassword"),
    newPassword: document.getElementById("newPassword"),
    confirmPassword: document.getElementById("confirmPassword"),
    passwordError: document.getElementById("passwordError"),
    closePasswordButton: document.getElementById("closePasswordButton"),
    changePasswordButton: document.getElementById("changePasswordButton"),
    logoutButton: document.getElementById("logoutButton"),
    currentUser: document.getElementById("currentUser"),
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
    saveFillTemplateButton: document.getElementById("saveFillTemplateButton"),
    wordButton: document.getElementById("wordButton"),
    printButton: document.getElementById("printButton"),
    fieldCount: document.getElementById("fieldCount"),
    fillEditStatus: document.getElementById("fillEditStatus"),
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

    try {
        const response = await fetch("api/auth/me", { credentials: "same-origin" });
        if (!response.ok) {
            showLogin();
            return;
        }

        const user = await response.json();
        await completeAuthentication(user);
    } catch {
        showLogin("Не удалось подключиться к серверу.");
    }
}

function wireEvents() {
    elements.loginForm.addEventListener("submit", login);
    elements.passwordForm.addEventListener("submit", changePassword);
    elements.closePasswordButton.addEventListener("click", closePasswordDialog);
    elements.changePasswordButton.addEventListener("click", () => openPasswordDialog(false));
    elements.logoutButton.addEventListener("click", logout);

    elements.newTemplateButton.addEventListener("click", () => createDraft(true));
    elements.saveButton.addEventListener("click", () => {
        if (state.mode === "fill") {
            saveTemplateFromFill();
        } else {
            saveCurrent();
        }
    });
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
    elements.saveFillTemplateButton.addEventListener("click", saveTemplateFromFill);
    elements.wordButton.addEventListener("click", exportWordDocument);
    elements.printButton.addEventListener("click", printFilledDocument);
    elements.templateSearch.addEventListener("input", renderTemplateList);

    elements.templateName.addEventListener("input", markDirty);
    elements.editor.addEventListener("input", markDirty);
    elements.editor.addEventListener("paste", handlePaste);
    elements.fillDocument.addEventListener("input", handleFillInput);
    elements.fillDocument.addEventListener("paste", handleFillPaste);
    elements.fillDocument.addEventListener("keydown", handleFillKeydown);

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
        if (saveShortcut && state.user) {
            event.preventDefault();
            if (state.mode === "fill") {
                saveTemplateFromFill();
            } else {
                saveCurrent();
            }
        }
    });

    window.addEventListener("beforeunload", event => {
        if (!state.dirty && !state.fillTemplateDirty) {
            return;
        }

        event.preventDefault();
        event.returnValue = "";
    });
}

async function login(event) {
    event.preventDefault();
    elements.loginError.textContent = "";
    elements.loginButton.disabled = true;
    elements.loginButton.textContent = "Вход…";

    try {
        const response = await fetch("api/auth/login", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: elements.loginUsername.value.trim(),
                password: elements.loginPassword.value,
                rememberMe: elements.loginRemember.checked
            })
        });

        const data = await readResponseData(response);
        if (!response.ok) {
            const fallbackMessage = response.status === 429
                ? "Слишком много попыток входа. Подождите минуту и попробуйте снова."
                : `Ошибка ${response.status}`;
            throw new Error(data?.error || fallbackMessage);
        }

        elements.loginPassword.value = "";
        await completeAuthentication(data);
    } catch (error) {
        elements.loginError.textContent = error.message;
    } finally {
        elements.loginButton.disabled = false;
        elements.loginButton.textContent = "Войти";
    }
}

async function completeAuthentication(user) {
    state.user = user;
    state.passwordChangeRequired = Boolean(user.mustChangePassword);
    elements.currentUser.textContent = user.username;
    elements.loginOverlay.classList.add("hidden");

    if (state.passwordChangeRequired) {
        elements.appShell.classList.add("hidden");
        openPasswordDialog(true);
        return;
    }

    elements.passwordOverlay.classList.add("hidden");
    elements.appShell.classList.remove("hidden");
    if (!state.workspaceLoaded) {
        await loadWorkspace();
    }
}

function showLogin(message = "") {
    state.user = null;
    state.workspaceLoaded = false;
    state.templates = [];
    state.current = null;
    state.fillValues.clear();
    state.dirty = false;
    state.fillTemplateDirty = false;
    elements.appShell.classList.add("hidden");
    elements.passwordOverlay.classList.add("hidden");
    elements.loginOverlay.classList.remove("hidden");
    elements.loginError.textContent = message;
    if (!elements.loginUsername.value) {
        elements.loginUsername.value = "01";
    }
    setTimeout(() => {
        if (elements.loginUsername.value) {
            elements.loginPassword.focus();
        } else {
            elements.loginUsername.focus();
        }
    }, 0);
}

async function logout() {
    if (!canDiscardChanges()) {
        return;
    }

    try {
        await fetch("api/auth/logout", {
            method: "POST",
            credentials: "same-origin"
        });
    } finally {
        showLogin();
    }
}

function openPasswordDialog(required) {
    state.passwordChangeRequired = required;
    elements.passwordForm.reset();
    elements.passwordError.textContent = "";
    elements.passwordDialogHint.textContent = required
        ? "Это первоначальный пароль. Перед началом работы задайте новый."
        : "Укажите текущий и новый пароль.";
    elements.closePasswordButton.classList.toggle("hidden", required);
    elements.passwordOverlay.classList.remove("hidden");
    setTimeout(() => elements.currentPassword.focus(), 0);
}

function closePasswordDialog() {
    if (state.passwordChangeRequired) {
        return;
    }
    elements.passwordOverlay.classList.add("hidden");
}

async function changePassword(event) {
    event.preventDefault();
    elements.passwordError.textContent = "";

    const currentPassword = elements.currentPassword.value;
    const newPassword = elements.newPassword.value;
    const confirmPassword = elements.confirmPassword.value;

    if (newPassword.length < 8) {
        elements.passwordError.textContent = "Новый пароль должен содержать не менее 8 символов.";
        return;
    }

    if (newPassword !== confirmPassword) {
        elements.passwordError.textContent = "Новые пароли не совпадают.";
        return;
    }

    try {
        const user = await api("api/auth/change-password", {
            method: "POST",
            body: { currentPassword, newPassword }
        });
        state.passwordChangeRequired = false;
        elements.passwordOverlay.classList.add("hidden");
        await completeAuthentication(user);
        showToast("Пароль изменён.");
    } catch (error) {
        elements.passwordError.textContent = error.message;
    }
}

async function loadWorkspace() {
    await loadTemplates();
    state.workspaceLoaded = true;

    if (state.templates.length > 0) {
        await openTemplate(state.templates[0].id, true);
    } else {
        createDraft();
    }
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
    state.fillTemplateDirty = false;
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

async function openTemplate(id, skipDiscardCheck = false) {
    if (state.current?.id === id) {
        return;
    }

    if (!skipDiscardCheck && !canDiscardChanges()) {
        return;
    }

    try {
        const template = await api(`api/templates/${id}`);
        state.current = template;
        state.fillValues.clear();
        state.fillTemplateDirty = false;
        elements.templateName.value = template.name;
        elements.editor.innerHTML = sanitizeHtml(template.contentHtml || "");
        setDirty(false);
        setMode("editor");
        renderTemplateList();
    } catch (error) {
        showToast(error.message, true);
    }
}

async function saveCurrent(options = {}) {
    if (!state.current) {
        return null;
    }

    const name = elements.templateName.value.trim();
    if (!name) {
        elements.templateName.focus();
        showToast("Укажите название шаблона.", true);
        return null;
    }

    let contentHtml = options.contentHtml;
    if (contentHtml === undefined) {
        convertUnderscoresToFields(elements.editor);
        contentHtml = sanitizeHtml(elements.editor.innerHTML);
        elements.editor.innerHTML = contentHtml;
    }

    const payload = { name, contentHtml };
    const isNew = !state.current.id;
    const url = isNew ? "api/templates" : `api/templates/${state.current.id}`;
    const method = isNew ? "POST" : "PUT";

    setSaveStatus("Сохранение…");

    try {
        const saved = await api(url, { method, body: payload });
        state.current = saved;
        elements.templateName.value = saved.name;
        elements.editor.innerHTML = sanitizeHtml(saved.contentHtml || "");
        setDirty(false);
        await loadTemplates();
        renderTemplateList();
        showToast(isNew ? "Шаблон создан." : "Изменения сохранены.");
        return saved;
    } catch (error) {
        setSaveStatus("Ошибка");
        showToast(error.message, true);
        return null;
    }
}

async function saveTemplateFromFill() {
    if (!state.current) {
        return;
    }

    captureFillValues();
    const templateHtml = extractTemplateHtmlFromFill();
    const saved = await saveCurrent({ contentHtml: templateHtml });
    if (!saved) {
        return;
    }

    state.fillTemplateDirty = false;
    buildFillDocument();
    updateFillEditStatus();
}

async function duplicateCurrent() {
    if (!state.current) {
        return;
    }

    let contentHtml;
    if (state.mode === "fill") {
        contentHtml = extractTemplateHtmlFromFill();
    } else {
        convertUnderscoresToFields(elements.editor);
        contentHtml = sanitizeHtml(elements.editor.innerHTML);
    }

    const payload = {
        name: `${elements.templateName.value.trim() || "Шаблон"} — копия`,
        contentHtml
    };

    try {
        const copy = await api("api/templates", { method: "POST", body: payload });
        state.current = null;
        setDirty(false);
        state.fillTemplateDirty = false;
        await loadTemplates();
        await openTemplate(copy.id, true);
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
        state.fillTemplateDirty = false;
        await loadTemplates();

        if (state.templates.length > 0) {
            await openTemplate(state.templates[0].id, true);
        } else {
            createDraft(false);
        }

        showToast("Шаблон удалён.");
    } catch (error) {
        showToast(error.message, true);
    }
}

function setMode(mode) {
    if (mode === state.mode) {
        return;
    }

    if (mode === "editor" && state.fillTemplateDirty) {
        const confirmed = window.confirm(
            "В режиме заполнения изменён текст шаблона. Перейти в редактор без сохранения этих правок?");
        if (!confirmed) {
            return;
        }
        state.fillTemplateDirty = false;
    }

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
    state.fillTemplateDirty = false;
    updateFieldCount();
    updateFillEditStatus();
}

function handleFillInput(event) {
    const field = getElementTarget(event)?.closest(".fill-field");
    if (field && elements.fillDocument.contains(field)) {
        const normalized = normalizeFieldInput(field.textContent || "");
        if (field.textContent !== normalized) {
            field.textContent = normalized;
            placeCaretAtEnd(field);
        }
        state.fillValues.set(field.dataset.fieldId, normalized);
    }

    window.requestAnimationFrame(() => {
        state.fillTemplateDirty = normalizeComparableHtml(extractTemplateHtmlFromFill()) !==
            normalizeComparableHtml(sanitizeHtml(elements.editor.innerHTML));
        updateFieldCount();
        updateFillEditStatus();
    });
}

function handleFillPaste(event) {
    const field = getElementTarget(event)?.closest(".fill-field");
    if (!field) {
        return;
    }

    event.preventDefault();
    const text = normalizeFieldInput(event.clipboardData?.getData("text/plain") || "");
    document.execCommand("insertText", false, text);
}

function handleFillKeydown(event) {
    const field = getElementTarget(event)?.closest(".fill-field");
    if (!field) {
        return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        focusNextFillField(field, event.shiftKey ? -1 : 1);
    }
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

function captureFillValues() {
    elements.fillDocument.querySelectorAll(".fill-field").forEach(field => {
        const value = getFinalFieldValue(field.textContent || "");
        field.textContent = value;
        state.fillValues.set(field.dataset.fieldId, value);
    });
}

function extractTemplateHtmlFromFill() {
    const clone = elements.fillDocument.cloneNode(true);
    clone.querySelectorAll(".fill-field").forEach(field => {
        const placeholder = createPlaceholder(field.dataset.fieldId || createId());
        field.replaceWith(placeholder);
    });
    return sanitizeHtml(clone.innerHTML);
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

function updateFieldCount() {
    const count = elements.fillDocument.querySelectorAll(".fill-field").length;
    elements.fieldCount.textContent = count === 0 ? "Поля не найдены" : `Полей: ${count}`;
}

function updateFillEditStatus() {
    elements.fillEditStatus.textContent = state.fillTemplateDirty
        ? "Текст шаблона изменён — сохраните правки"
        : "Текст шаблона не изменён";
    elements.fillEditStatus.classList.toggle("changed", state.fillTemplateDirty);
    elements.saveFillTemplateButton.disabled = !state.fillTemplateDirty && Boolean(state.current?.id);
}

function printFilledDocument() {
    captureFillValues();
    const clone = createFinalDocumentClone();

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

async function exportWordDocument() {
    captureFillValues();
    elements.wordButton.disabled = true;
    elements.wordButton.textContent = "Экспорт…";

    try {
        const payload = {
            fileName: elements.templateName.value.trim() || "Документ",
            blocks: serializeDocumentForWord(elements.fillDocument)
        };

        const response = await fetch("api/export/word", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            showLogin("Сессия истекла. Войдите снова.");
            return;
        }

        if (!response.ok) {
            const data = await readResponseData(response);
            throw new Error(data?.error || `Ошибка ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${sanitizeDownloadName(payload.fileName)}.docx`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast("Word-документ сформирован.");
    } catch (error) {
        showToast(error.message, true);
    } finally {
        elements.wordButton.disabled = false;
        elements.wordButton.textContent = "Экспорт в Word";
    }
}

function createFinalDocumentClone() {
    const clone = elements.fillDocument.cloneNode(true);
    clone.removeAttribute("contenteditable");
    clone.querySelectorAll(".fill-field").forEach(field => {
        const value = getFinalFieldValue(field.textContent || "");
        const span = document.createElement("span");
        span.className = "print-value";
        span.textContent = value;
        field.replaceWith(span);
    });
    return clone;
}

function serializeDocumentForWord(root) {
    const blocks = [];

    for (const child of [...root.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) {
            if ((child.nodeValue || "").trim()) {
                blocks.push({
                    kind: "paragraph",
                    paragraph: createWordParagraph(root, [createWordRun(child, root)])
                });
            }
            continue;
        }

        if (child.nodeType !== Node.ELEMENT_NODE) {
            continue;
        }

        const tag = child.tagName.toUpperCase();
        if (tag === "TABLE") {
            blocks.push(serializeTable(child));
        } else if (tag === "UL" || tag === "OL") {
            const items = [...child.children].filter(item => item.tagName === "LI");
            items.forEach((item, index) => {
                const prefix = tag === "UL" ? "• " : `${index + 1}. `;
                const runs = [plainWordRun(prefix), ...collectWordRuns(item)];
                blocks.push({ kind: "paragraph", paragraph: createWordParagraph(item, runs) });
            });
        } else if (tag === "HR") {
            blocks.push({
                kind: "paragraph",
                paragraph: createWordParagraph(child, [plainWordRun("────────────────────────")])
            });
        } else {
            blocks.push({
                kind: "paragraph",
                paragraph: createWordParagraph(child, collectWordRuns(child))
            });
        }
    }

    return blocks.length > 0
        ? blocks
        : [{ kind: "paragraph", paragraph: createWordParagraph(root, []) }];
}

function serializeTable(table) {
    const rows = [...table.querySelectorAll("tr")].map(row =>
        [...row.children]
            .filter(cell => cell.tagName === "TD" || cell.tagName === "TH")
            .map(cell => createWordParagraph(cell, collectWordRuns(cell))));

    return { kind: "table", rows };
}

function createWordParagraph(element, runs) {
    const style = getComputedStyle(element);
    const headingLevel = /^H[1-3]$/.test(element.tagName || "")
        ? Number(element.tagName.substring(1))
        : null;

    return {
        alignment: style.textAlign || "left",
        headingLevel,
        runs
    };
}

function collectWordRuns(root) {
    const runs = [];

    function visit(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.nodeValue || "";
            if (text) {
                runs.push(createWordRun(node, node.parentElement || root));
            }
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        if (node.tagName === "BR") {
            runs.push({ ...plainWordRun(""), break: true });
            return;
        }

        for (const child of [...node.childNodes]) {
            visit(child);
        }
    }

    for (const child of [...root.childNodes]) {
        visit(child);
    }

    return mergeAdjacentRuns(runs);
}

function createWordRun(textNode, styleElement) {
    const style = getComputedStyle(styleElement);
    const weight = Number.parseInt(style.fontWeight, 10);
    return {
        text: textNode.nodeValue || "",
        bold: style.fontWeight === "bold" || Number.isFinite(weight) && weight >= 600,
        italic: style.fontStyle === "italic" || style.fontStyle === "oblique",
        underline: style.textDecorationLine.includes("underline"),
        strike: style.textDecorationLine.includes("line-through"),
        fontSize: Math.max(8, Math.round(Number.parseFloat(style.fontSize || "16") * 0.75)),
        color: cssColorToHex(style.color),
        break: false
    };
}

function plainWordRun(text) {
    return {
        text,
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        fontSize: 12,
        color: "20242B",
        break: false
    };
}

function mergeAdjacentRuns(runs) {
    const result = [];
    for (const run of runs) {
        const previous = result.at(-1);
        const sameFormat = previous && !previous.break && !run.break &&
            previous.bold === run.bold && previous.italic === run.italic &&
            previous.underline === run.underline && previous.strike === run.strike &&
            previous.fontSize === run.fontSize && previous.color === run.color;

        if (sameFormat) {
            previous.text += run.text;
        } else {
            result.push({ ...run });
        }
    }
    return result;
}

function cssColorToHex(color) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) {
        return "20242B";
    }
    return [match[1], match[2], match[3]]
        .map(value => Number(value).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
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
    const block = textNode.parentElement?.closest("p, div, li, td, th, blockquote") ||
        textNode.parentElement;
    return (block?.textContent || textNode.nodeValue || "").replace(/\u00a0/g, " ");
}

function isManualDateLine(text) {
    const normalized = text.replace(/\s+/g, " ").trim();
    const hasYearWord = /(?:19|20)\d{2}\s*год(?:\s|$|[.,])/i.test(normalized);
    const hasBlankDatePattern = /_{3,}\s*[./]\s*_{3,}/.test(normalized);
    return hasYearWord && hasBlankDatePattern;
}

function createPlaceholder(fieldId = createId()) {
    const placeholder = document.createElement("span");
    placeholder.className = "placeholder-token";
    placeholder.contentEditable = "false";
    placeholder.dataset.fieldId = fieldId;
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
    return (!state.dirty && !state.fillTemplateDirty) ||
        window.confirm("Есть несохранённые изменения. Продолжить без сохранения?");
}

async function api(url, options = {}) {
    const request = {
        method: options.method || "GET",
        credentials: "same-origin",
        headers: {}
    };

    if (options.body !== undefined) {
        request.headers["Content-Type"] = "application/json";
        request.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, request);

    if (response.status === 401) {
        showLogin("Сессия истекла. Войдите снова.");
        throw new Error("Требуется повторный вход.");
    }

    if (!response.ok) {
        const data = await readResponseData(response);
        throw new Error(data?.error || data?.title || `Ошибка ${response.status}`);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}

async function readResponseData(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", isError);
    elements.toast.classList.add("visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2800);
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

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizeComparableHtml(value) {
    return value.replace(/>\s+</g, "><").trim();
}

function sanitizeDownloadName(value) {
    const cleaned = String(value || "Документ")
        .replace(/[\\/:*?"<>|]/g, "_")
        .trim()
        .replace(/\.+$/g, "");
    return cleaned || "Документ";
}

function getElementTarget(event) {
    return event.target instanceof Element ? event.target : event.target?.parentElement || null;
}
