"use strict";

const el = id => document.getElementById(id);
const state = {
  items: [],
  customItems: [],
  filtered: [],
  visible: 60,
  user: null,
  customBackground: null,
  placedSignatures: [],
  selectedPlacedId: null,
  drag: null
};

const DB_NAME = "template-filler-handwriting";
const DB_VERSION = 2;
const STORE_ASSETS = "assets";
let toastTimer;
let dbPromise;

init();

async function init() {
  try {
    const me = await fetch("api/auth/me", { credentials: "same-origin" });
    if (!me.ok) {
      location.href = "./";
      return;
    }

    state.user = await me.json();
    el("currentUser").textContent = state.user.username;

    const [manifest] = await Promise.all([
      fetch("signatures-manifest.json", { cache: "no-store" }),
      loadUploadedFonts(),
      loadStoredAssets()
    ]);

    state.items = await manifest.json();
    refreshSignatureList();
    wire();
    applyBackground();
    renderText();
    renderSignatures();
    renderPlacedSignatures();

    el("authGate").classList.add("hidden");
    el("page").classList.remove("hidden");
  } catch (error) {
    console.error(error);
    el("authGate").textContent = "Не удалось загрузить страницу.";
  }
}

function wire() {
  el("textTab").onclick = () => setTab("text");
  el("signaturesTab").onclick = () => setTab("signatures");

  ["sourceText", "fontSize", "slant", "lineHeight", "jitter", "fontFamily"]
    .forEach(id => el(id).addEventListener("input", renderText));

  el("fontUpload").addEventListener("change", uploadFont);
  el("backgroundPreset").addEventListener("change", applyBackground);
  el("backgroundUpload").addEventListener("change", uploadBackground);
  el("clearBackground").onclick = clearCustomBackground;

  el("showSignature").onchange = renderPlacedSignatures;
  el("signatureScale").oninput = () => {
    const current = getSelectedPlaced();
    if (!current) return;
    current.scale = Number(el("signatureScale").value) / 100;
    clampPlacedSignature(current);
    renderPlacedSignatures();
  };
  el("signatureRotation").oninput = () => {
    const current = getSelectedPlaced();
    if (!current) return;
    current.rotation = Number(el("signatureRotation").value);
    renderPlacedSignatures();
  };
  el("centerSignature").onclick = centerSelectedSignature;
  el("mutateSignature").onclick = mutateSelectedSignature;
  el("duplicateSignature").onclick = duplicateSelectedSignature;
  el("removeSignature").onclick = removeSelectedSignature;
  el("clearAllSignatures").onclick = clearAllSignatures;
  el("printNotes").onclick = () => window.print();

  el("signatureSearch").oninput = filterSignatures;
  el("shuffleButton").onclick = () => {
    state.filtered.sort(() => Math.random() - .5);
    state.visible = 60;
    renderSignatures();
  };
  el("showAllButton").onclick = () => {
    state.visible = state.filtered.length;
    renderSignatures();
  };
  el("loadMoreButton").onclick = () => {
    state.visible += 60;
    renderSignatures();
  };
  el("signatureUpload").addEventListener("change", uploadSignatures);

  const canvas = el("signatureCanvas");
  canvas.addEventListener("pointerdown", beginSignatureInteraction);
  canvas.addEventListener("click", handleSignatureCanvasClick);
  window.addEventListener("pointermove", moveSignatureInteraction);
  window.addEventListener("pointerup", endSignatureInteraction);
  window.addEventListener("keydown", moveSignatureWithKeyboard);

  el("logoutButton").onclick = async () => {
    await fetch("api/auth/logout", { method: "POST", credentials: "same-origin" });
    location.href = "./";
  };
}

function setTab(tab) {
  const text = tab === "text";
  el("textTab").classList.toggle("active", text);
  el("signaturesTab").classList.toggle("active", !text);
  el("textTab").setAttribute("aria-selected", String(text));
  el("signaturesTab").setAttribute("aria-selected", String(!text));
  el("textPanel").classList.toggle("hidden", !text);
  el("signaturesPanel").classList.toggle("hidden", text);
}

function renderText() {
  const target = el("handwrittenText");
  target.textContent = el("sourceText").value;
  target.style.fontSize = `${el("fontSize").value}px`;
  target.style.lineHeight = `${el("lineHeight").value}px`;
  target.style.fontFamily = `"${el("fontFamily").value}", cursive`;
  target.style.transform = `skewX(${-Number(el("slant").value)}deg)`;
  const jitter = Number(el("jitter").value);
  target.style.textShadow = jitter
    ? `${jitter * .25}px ${jitter * .15}px 0 rgba(23,35,142,.16)`
    : "none";
}

async function loadUploadedFonts() {
  try {
    const response = await fetch("api/fonts", { credentials: "same-origin" });
    if (!response.ok) return;
    const fonts = await response.json();
    for (const font of fonts) addFontOption(font);
  } catch (error) {
    console.warn("Не удалось загрузить список шрифтов", error);
  }
}

function addFontOption(font) {
  const family = `UploadedFont_${String(font.id).replaceAll("-", "")}`;
  if (!document.getElementById(`font-style-${font.id}`)) {
    const style = document.createElement("style");
    style.id = `font-style-${font.id}`;
    style.textContent = `@font-face{font-family:"${family}";src:url("api/fonts/${font.id}/file") format("truetype");font-display:swap;}`;
    document.head.append(style);
  }

  if (![...el("fontFamily").options].some(option => option.value === family)) {
    const option = new Option(font.name, family);
    el("fontFamily").add(option);
  }
}

async function uploadFont(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  el("fontUploadStatus").textContent = "Загрузка…";
  const body = new FormData();
  body.append("file", file);
  body.append("name", file.name.replace(/\.[^.]+$/, ""));

  try {
    const response = await fetch("api/fonts", {
      method: "POST",
      credentials: "same-origin",
      body
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data?.error || `Ошибка ${response.status}`);
    addFontOption(data);
    const family = `UploadedFont_${String(data.id).replaceAll("-", "")}`;
    el("fontFamily").value = family;
    renderText();
    el("fontUploadStatus").textContent = `Загружен: ${data.name}`;
    showToast("Шрифт добавлен");
  } catch (error) {
    el("fontUploadStatus").textContent = error.message;
    showToast(error.message, true);
  } finally {
    event.target.value = "";
  }
}

function applyBackground() {
  const paper = el("paper");
  const preset = el("backgroundPreset").value;
  paper.classList.remove("background-lined", "background-grid", "background-blank", "background-yellow", "background-custom");
  paper.style.backgroundImage = "";

  if (preset === "custom" && state.customBackground) {
    paper.classList.add("background-custom");
    paper.style.backgroundImage = `url("${state.customBackground}")`;
  } else {
    const safePreset = preset === "custom" ? "lined" : preset;
    paper.classList.add(`background-${safePreset}`);
    if (preset === "custom") el("backgroundPreset").value = safePreset;
  }
}

async function uploadBackground(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    showToast("Фон должен быть не больше 8 МБ", true);
    return;
  }

  const dataUrl = await fileToDataUrl(file);
  state.customBackground = dataUrl;
  await putAsset("custom-background", { type: "background", dataUrl, name: file.name });
  el("backgroundPreset").value = "custom";
  applyBackground();
  showToast("Фон загружен");
  event.target.value = "";
}

async function clearCustomBackground() {
  state.customBackground = null;
  await deleteAsset("custom-background");
  el("backgroundPreset").value = "lined";
  applyBackground();
  showToast("Загруженный фон удалён");
}

function refreshSignatureList() {
  state.filtered = [...state.customItems, ...state.items];
}

function filterSignatures() {
  const q = el("signatureSearch").value.trim().toLocaleLowerCase("ru");
  const all = [...state.customItems, ...state.items];
  state.filtered = q
    ? all.filter(item => `${item.title} ${item.id}`.toLocaleLowerCase("ru").includes(q))
    : all;
  state.visible = 60;
  renderSignatures();
}

function renderSignatures() {
  const grid = el("signatureGrid");
  grid.replaceChildren();
  const slice = state.filtered.slice(0, state.visible);

  for (const item of slice) {
    const card = document.createElement("article");
    card.className = "signature-card";
    if (item.custom) card.classList.add("custom");

    const img = document.createElement("img");
    img.className = "signature-preview";
    img.loading = "lazy";
    img.src = item.file;
    img.alt = item.title;

    const meta = document.createElement("div");
    meta.className = "signature-meta";
    const title = document.createElement("span");
    title.className = "signature-title";
    title.textContent = item.title;

    const actions = document.createElement("div");
    actions.className = "signature-actions";

    const use = document.createElement("button");
    use.className = "mini use";
    use.textContent = "На лист";
    use.onclick = async () => { await addSignatureToPaper(item, false); };

    const vary = document.createElement("button");
    vary.className = "mini";
    vary.textContent = "Вар.";
    vary.title = "Добавить слегка изменённый вариант";
    vary.onclick = async () => { await addSignatureToPaper(item, true); };

    const download = document.createElement("a");
    download.className = "mini";
    download.textContent = "PNG";
    download.href = item.file;
    download.download = item.downloadName || `signature-${String(item.id).padStart(4, "0")}.png`;
    actions.append(use, vary, download);

    if (item.custom) {
      const remove = document.createElement("button");
      remove.className = "mini danger";
      remove.textContent = "×";
      remove.title = "Удалить загруженную подпись";
      remove.onclick = () => removeCustomSignature(item);
      actions.append(remove);
    }

    meta.append(title, actions);
    card.append(img, meta);
    grid.append(card);
  }

  el("resultCount").textContent = `Показано ${slice.length} из ${state.filtered.length}`;
  el("loadMoreButton").classList.toggle("hidden", state.visible >= state.filtered.length);
}

async function uploadSignatures(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;

  let added = 0;
  for (const file of files) {
    const isPng = /image\/png/i.test(file.type) || /\.png$/i.test(file.name);
    if (!isPng) continue;
    if (file.size > 5 * 1024 * 1024) continue;

    const dataUrl = await fileToDataUrl(file);
    const id = `custom-${crypto.randomUUID()}`;
    const item = {
      id,
      title: file.name.replace(/\.[^.]+$/, ""),
      file: dataUrl,
      custom: true,
      downloadName: file.name
    };
    state.customItems.unshift(item);
    await putAsset(id, { type: "signature", item });
    added++;
  }

  refreshSignatureList();
  state.visible = Math.max(60, state.customItems.length);
  renderSignatures();
  showToast(`Добавлено подписей: ${added}`);
  event.target.value = "";
}

async function removeCustomSignature(item) {
  state.customItems = state.customItems.filter(value => value.id !== item.id);
  state.placedSignatures = state.placedSignatures.filter(value => value.sourceId !== item.id);
  if (getSelectedPlaced()?.sourceId === item.id) state.selectedPlacedId = null;
  await deleteAsset(item.id);
  filterSignatures();
  renderPlacedSignatures();
}

async function addSignatureToPaper(item, vary = false) {
  const file = vary ? await createVariantDataUrl(item.file) : item.file;
  const placed = {
    instanceId: crypto.randomUUID(),
    sourceId: item.id,
    title: vary ? `${item.title} • вариант` : item.title,
    file,
    baseWidth: 310,
    baseHeight: 110,
    x: 0,
    y: 0,
    scale: 1,
    rotation: randomBetween(-3, 3)
  };
  state.placedSignatures.push(placed);
  state.selectedPlacedId = placed.instanceId;
  positionNewSignature(placed);
  renderPlacedSignatures();
  setTab("text");
  showToast(`${item.title} добавлена на лист`);
}

function positionNewSignature(placed) {
  const paper = el("paper");
  const count = state.placedSignatures.length - 1;
  const offsetX = (count % 4) * 18;
  const offsetY = Math.floor(count / 4) * 16;
  placed.x = Math.max(20, (paper.clientWidth - placed.baseWidth * placed.scale) / 2 + offsetX);
  placed.y = Math.max(20, paper.clientHeight - 180 - offsetY);
  clampPlacedSignature(placed);
}

function getSelectedPlaced() {
  return state.placedSignatures.find(item => item.instanceId === state.selectedPlacedId) || null;
}

function selectPlacedSignature(instanceId) {
  state.selectedPlacedId = instanceId;
  renderPlacedSignatures();
}

function renderPlacedSignatures() {
  const canvas = el("signatureCanvas");
  canvas.replaceChildren();
  const visible = Boolean(el("showSignature").checked);
  canvas.classList.toggle("hidden", !visible);

  for (const item of state.placedSignatures) {
    const layer = document.createElement("div");
    layer.className = "signature-instance";
    if (item.instanceId === state.selectedPlacedId) layer.classList.add("selected");
    layer.dataset.instanceId = item.instanceId;
    layer.tabIndex = 0;
    layer.style.left = `${item.x}px`;
    layer.style.top = `${item.y}px`;
    layer.style.width = `${item.baseWidth * item.scale}px`;
    layer.style.height = `${item.baseHeight * item.scale}px`;
    layer.style.transform = `rotate(${item.rotation}deg)`;

    const img = document.createElement("img");
    img.className = "paper-signature";
    img.src = item.file;
    img.alt = item.title;

    const resize = document.createElement("span");
    resize.className = "resize-handle";
    resize.setAttribute("aria-hidden", "true");

    layer.append(img, resize);
    canvas.append(layer);
  }

  syncSignatureControls();
}

function syncSignatureControls() {
  const current = getSelectedPlaced();
  const hasAny = state.placedSignatures.length > 0;
  const hasSelected = Boolean(current);
  const disabledIds = ["signatureScale", "signatureRotation", "centerSignature", "mutateSignature", "duplicateSignature", "removeSignature"];
  for (const id of disabledIds) el(id).disabled = !hasSelected;
  el("clearAllSignatures").disabled = !hasAny;

  if (current) {
    el("signatureScale").value = String(Math.round(current.scale * 100));
    el("signatureRotation").value = String(Math.round(current.rotation));
    el("selectedSignatureLabel").textContent = `Подписей на листе: ${state.placedSignatures.length}. Выделена: ${current.title}`;
  } else {
    el("selectedSignatureLabel").textContent = `Подписей на листе: ${state.placedSignatures.length}`;
  }
}

function handleSignatureCanvasClick(event) {
  const card = event.target.closest(".signature-instance");
  if (!card) {
    state.selectedPlacedId = null;
    renderPlacedSignatures();
    return;
  }
  selectPlacedSignature(card.dataset.instanceId);
}

function beginSignatureInteraction(event) {
  const layer = event.target.closest(".signature-instance");
  if (!layer) return;
  const current = state.placedSignatures.find(item => item.instanceId === layer.dataset.instanceId);
  if (!current) return;

  event.preventDefault();
  state.selectedPlacedId = current.instanceId;
  updatePlacedSelection();
  syncSignatureControls();

  const canvas = el("signatureCanvas");
  canvas.setPointerCapture?.(event.pointerId);
  const resize = event.target.classList.contains("resize-handle");
  state.drag = {
    mode: resize ? "resize" : "move",
    pointerId: event.pointerId,
    instanceId: current.instanceId,
    layer,
    startX: event.clientX,
    startY: event.clientY,
    originalX: current.x,
    originalY: current.y,
    originalScale: current.scale
  };
}

function moveSignatureInteraction(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  const current = state.placedSignatures.find(item => item.instanceId === state.drag.instanceId);
  if (!current) return;

  const dx = event.clientX - state.drag.startX;
  const dy = event.clientY - state.drag.startY;

  if (state.drag.mode === "resize") {
    const next = Math.min(2.2, Math.max(.4, state.drag.originalScale + dx / 260));
    current.scale = next;
    el("signatureScale").value = String(Math.round(next * 100));
    clampPlacedSignature(current);
  } else {
    current.x = state.drag.originalX + dx;
    current.y = state.drag.originalY + dy;
    clampPlacedSignature(current);
  }

  applyPlacedSignatureStyle(state.drag.layer, current);
}

function endSignatureInteraction(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  el("signatureCanvas").releasePointerCapture?.(event.pointerId);
  state.drag = null;
  syncSignatureControls();
}

function updatePlacedSelection() {
  for (const layer of el("signatureCanvas").querySelectorAll(".signature-instance")) {
    layer.classList.toggle("selected", layer.dataset.instanceId === state.selectedPlacedId);
  }
}

function applyPlacedSignatureStyle(layer, item) {
  if (!layer || !item) return;
  layer.style.left = `${item.x}px`;
  layer.style.top = `${item.y}px`;
  layer.style.width = `${item.baseWidth * item.scale}px`;
  layer.style.height = `${item.baseHeight * item.scale}px`;
  layer.style.transform = `rotate(${item.rotation}deg)`;
}

function moveSignatureWithKeyboard(event) {
  const current = getSelectedPlaced();
  if (!current) return;
  const step = event.shiftKey ? 10 : 2;
  const movement = {
    ArrowLeft: [-step, 0], ArrowRight: [step, 0],
    ArrowUp: [0, -step], ArrowDown: [0, step]
  }[event.key];
  if (!movement) return;
  event.preventDefault();
  current.x += movement[0];
  current.y += movement[1];
  clampPlacedSignature(current);
  renderPlacedSignatures();
}

function clampPlacedSignature(item) {
  const paper = el("paper");
  const width = item.baseWidth * item.scale;
  const height = item.baseHeight * item.scale;
  item.x = Math.min(Math.max(-width * .25, item.x), paper.clientWidth - width * .25);
  item.y = Math.min(Math.max(-height * .25, item.y), paper.clientHeight - height * .25);
}

function centerSelectedSignature() {
  const current = getSelectedPlaced();
  if (!current) return;
  current.x = Math.max(0, (el("paper").clientWidth - current.baseWidth * current.scale) / 2);
  current.y = Math.max(0, el("paper").clientHeight - 170 * current.scale);
  clampPlacedSignature(current);
  renderPlacedSignatures();
}

async function mutateSelectedSignature() {
  const current = getSelectedPlaced();
  if (!current) return;
  current.file = await createVariantDataUrl(current.file);
  current.rotation += randomBetween(-2, 2);
  current.scale = Math.min(2.2, Math.max(.4, current.scale * randomBetween(.95, 1.05)));
  clampPlacedSignature(current);
  renderPlacedSignatures();
  showToast("Подпись слегка изменена");
}

function duplicateSelectedSignature() {
  const current = getSelectedPlaced();
  if (!current) return;
  const copy = {
    ...current,
    instanceId: crypto.randomUUID(),
    x: current.x + 18,
    y: current.y + 18,
    rotation: current.rotation + randomBetween(-2, 2)
  };
  clampPlacedSignature(copy);
  state.placedSignatures.push(copy);
  state.selectedPlacedId = copy.instanceId;
  renderPlacedSignatures();
  showToast("Подпись продублирована");
}

function removeSelectedSignature() {
  const current = getSelectedPlaced();
  if (!current) return;
  state.placedSignatures = state.placedSignatures.filter(item => item.instanceId !== current.instanceId);
  state.selectedPlacedId = state.placedSignatures.at(-1)?.instanceId || null;
  renderPlacedSignatures();
}

function clearAllSignatures() {
  state.placedSignatures = [];
  state.selectedPlacedId = null;
  renderPlacedSignatures();
}

async function createVariantDataUrl(src) {
  const img = await loadImage(src);
  const width = img.naturalWidth || img.width || 620;
  const height = img.naturalHeight || img.height || 180;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sctx = sourceCanvas.getContext("2d");
  sctx.drawImage(img, 0, 0, width, height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width * 0.03, height * 0.03);
  ctx.rotate(randomBetween(-0.04, 0.04));
  ctx.scale(randomBetween(0.96, 1.04), randomBetween(0.94, 1.06));
  ctx.globalAlpha = randomBetween(0.88, 0.98);
  const sliceHeight = Math.max(2, Math.round(height / 36));
  const amp = randomBetween(1.5, 5.5);
  const freq = randomBetween(1.2, 2.8);
  const phase = randomBetween(0, Math.PI * 2);

  for (let y = 0; y < height; y += sliceHeight) {
    const h = Math.min(sliceHeight, height - y);
    const offsetX = Math.sin((y / height) * Math.PI * freq + phase) * amp + randomBetween(-1.2, 1.2);
    const offsetY = randomBetween(-0.6, 0.6);
    ctx.drawImage(sourceCanvas, 0, y, width, h, offsetX, y + offsetY, width, h);
  }
  ctx.restore();
  return canvas.toDataURL("image/png");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

async function loadStoredAssets() {
  try {
    const assets = await getAllAssets();
    for (const asset of assets) {
      if (asset.key === "custom-background" && asset.value?.dataUrl) {
        state.customBackground = asset.value.dataUrl;
      } else if (asset.value?.type === "signature" && asset.value.item) {
        state.customItems.push(asset.value.item);
      }
    }
    if (state.customBackground) el("backgroundPreset").value = "custom";
  } catch (error) {
    console.warn("Не удалось загрузить локальные изображения", error);
  }
}

function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_ASSETS)) db.createObjectStore(STORE_ASSETS);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function putAsset(key, value) {
  const db = await openDatabase();
  await transactionPromise(db, "readwrite", store => store.put(value, key));
}

async function deleteAsset(key) {
  const db = await openDatabase();
  await transactionPromise(db, "readwrite", store => store.delete(key));
}

async function getAllAssets() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_ASSETS, "readonly");
    const store = transaction.objectStore(STORE_ASSETS);
    const values = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(values);
        return;
      }
      values.push({ key: cursor.key, value: cursor.value });
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

function transactionPromise(db, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_ASSETS, mode);
    action(transaction.objectStore(STORE_ASSETS));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function showToast(text, error = false) {
  clearTimeout(toastTimer);
  el("toast").textContent = text;
  el("toast").classList.toggle("error", error);
  el("toast").classList.add("show");
  toastTimer = setTimeout(() => el("toast").classList.remove("show"), 2400);
}
