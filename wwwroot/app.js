"use strict";

const $ = id => document.getElementById(id);
const state = {
  user: null, section: "templates", templates: [], currentTemplate: null, templateMode: "editor",
  assets: { signature: [], font: [], background: [] }, builtInSignatures: [], gallery: [],
  hand: { x:105,y:55,w:620,h:850,rotation:0,skewX:0,skewY:0,drag:null,signatures:[],selectedSignature:null }
};
const sectionMeta = {
  templates:["Набивалка шаблонов","Создание, заполнение и экспорт документов."],
  handwriting:["Рукописный текст","Рукописный документ на выбранном фоне."],
  signatures:["Подписи","Встроенная библиотека и собственные файлы."],
  fonts:["Шрифты","Шрифты для рукописных документов."],
  backgrounds:["Фоны","Бумага, бланки и фотографии листов."],
  gallery:["Галерея документов","Сохранённые PDF и заполненные шаблоны."]
};
const penPresets = {
  "ball-light":{color:"#4677c8",opacity:.88,shadow:".25px .2px rgba(45,91,164,.18)",weight:400},
  "ball-dark":{color:"#172f8e",opacity:.95,shadow:".35px .2px rgba(10,25,92,.22)",weight:430},
  "ball-weak":{color:"#4269b2",opacity:.62,shadow:"1px 0 rgba(60,96,165,.08)",weight:350},
  "ball-bright":{color:"#174dcc",opacity:.99,shadow:".35px .2px rgba(16,62,173,.25)",weight:500},
  "ball-black":{color:"#17191e",opacity:.92,shadow:".25px .15px rgba(0,0,0,.2)",weight:420},
  "gel-blue":{color:"#123ac8",opacity:1,shadow:".55px .35px rgba(12,45,160,.32)",weight:550},
  "cap-blue":{color:"#203e98",opacity:.97,shadow:"none",weight:600},
  "cap-black":{color:"#111318",opacity:.98,shadow:"none",weight:600}
};
let toastTimer;

init();

async function init(){
  wire();
  try{
    const r=await fetch("api/auth/me",{credentials:"same-origin"});
    if(!r.ok){ showLogin(); return; }
    await authenticated(await r.json());
  }catch{ showLogin("Не удалось подключиться к серверу."); }
}

function wire(){
  $("loginForm").onsubmit=login; $("logoutButton").onclick=logout;
  $("changePasswordButton").onclick=()=>$("passwordOverlay").classList.remove("hidden");
  $("closePassword").onclick=()=>$("passwordOverlay").classList.add("hidden");
  $("passwordForm").onsubmit=changePassword;
  $("drawerToggle").onclick=openDrawer; $("drawerClose").onclick=closeDrawer; $("drawerBackdrop").onclick=closeDrawer;
  document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>showSection(b.dataset.section));
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>showSection(b.dataset.go));

  $("newTemplateButton").onclick=createTemplateDraft; $("templateSearch").oninput=renderTemplateList;
  $("saveTemplateButton").onclick=saveTemplate; $("duplicateTemplateButton").onclick=duplicateTemplate; $("deleteTemplateButton").onclick=deleteTemplate;
  $("insertFieldButton").onclick=insertTemplateField; $("convertFieldsButton").onclick=convertTemplateFields;
  document.querySelectorAll("[data-command]").forEach(b=>b.onclick=()=>{document.execCommand(b.dataset.command,false);$("templateEditor").focus();});
  document.querySelectorAll("[data-template-mode]").forEach(b=>b.onclick=()=>setTemplateMode(b.dataset.templateMode));
  $("resetFieldsButton").onclick=()=>$("fillDocument").querySelectorAll(".fill-field").forEach(x=>x.textContent="");
  $("saveFilledTemplateButton").onclick=saveTemplateFromFill; $("saveFilledToGalleryButton").onclick=saveFilledToGallery;
  $("exportTemplateWordButton").onclick=exportTemplateWord; $("exportTemplatePdfButton").onclick=exportTemplatePdf;

  ["handText","handFont","penPreset","handSize","handLine","handRotate","handSkewX","handSkewY","handOpacity"].forEach(id=>$(id).addEventListener("input",renderHandwriting));
  $("handBackground").onchange=applyHandBackground; $("resetHandTransform").onclick=resetHandTransform;
  $("exportHandPdf").onclick=()=>exportHandwritingPdf(false); $("saveHandPdf").onclick=()=>exportHandwritingPdf(true);
  const box=$("handTextBox"); box.addEventListener("pointerdown",startHandTransform); window.addEventListener("pointermove",moveHandTransform); window.addEventListener("pointerup",endHandTransform);
  $("handSignatures").addEventListener("pointerdown",startSignatureDrag);

  $("signatureUpload").onchange=e=>uploadAssets("signature",e.target.files,e.target);
  $("fontUpload").onchange=e=>uploadAssets("font",e.target.files,e.target);
  $("backgroundUpload").onchange=e=>uploadAssets("background",e.target.files,e.target);
  $("documentUpload").onchange=e=>uploadDocuments(e.target.files,e.target);
}

async function authenticated(user){
  state.user=user;
  $("currentUser").textContent=user.username;
  $("loginOverlay").classList.add("hidden");

  if(user.mustChangePassword){
    $("app").classList.add("hidden");
    $("passwordOverlay").classList.remove("hidden");
    $("closePassword").classList.add("hidden");
    $("passwordError").textContent="Перед началом работы смените первоначальный пароль.";
    return;
  }

  $("passwordOverlay").classList.add("hidden");
  $("closePassword").classList.remove("hidden");
  $("app").classList.remove("hidden");
  await loadWorkspaceSafely();
}

async function loadWorkspaceSafely(){
  const tasks=[
    ["шаблоны",loadTemplates],
    ["объекты",loadAssets],
    ["встроенные подписи",loadBuiltInSignatures],
    ["галерею",loadGallery]
  ];
  const failures=[];
  for(const [name,loader] of tasks){
    try{await loader();}catch(error){console.error(`Не удалось загрузить ${name}`,error);failures.push(name);}
  }
  if(!state.currentTemplate) createTemplateDraft();
  renderHandwriting();
  renderAllAssets();
  if(failures.length) showToast(`Вход выполнен, но не удалось загрузить: ${failures.join(", ")}`,true);
}

function showLogin(message=""){
  state.user=null;
  $("app").classList.add("hidden");
  $("passwordOverlay").classList.add("hidden");
  $("loginOverlay").classList.remove("hidden");
  $("loginError").textContent=message;
  $("loginSubmit").disabled=false;
  $("loginSubmit").textContent="Войти";
  setTimeout(()=>$("loginUsername").focus(),0);
}

async function login(e){
  e.preventDefault();
  const username=$("loginUsername").value.trim();
  const password=$("loginPassword").value;
  $("loginError").textContent="";
  if(!username||!password){$("loginError").textContent="Введите логин и пароль.";return;}
  const button=$("loginSubmit");
  button.disabled=true;
  button.textContent="Входим…";
  try{
    const u=await api("api/auth/login",{method:"POST",body:{username,password,rememberMe:$("loginRemember").checked}});
    $("loginPassword").value="";
    await authenticated(u);
  }catch(err){
    $("loginError").textContent=err.message;
    const card=document.querySelector(".login-card");
    card.classList.remove("shake");
    requestAnimationFrame(()=>card.classList.add("shake"));
  }finally{
    button.disabled=false;
    button.textContent="Войти";
  }
}
async function logout(){await fetch("api/auth/logout",{method:"POST",credentials:"same-origin"});showLogin();}
async function changePassword(e){
  e.preventDefault();
  const a=$("newPassword").value,b=$("confirmPassword").value;
  $("passwordError").textContent="";
  if(a.length<8){$("passwordError").textContent="Новый пароль должен содержать не менее 8 символов.";return;}
  if(a!==b){$("passwordError").textContent="Пароли не совпадают.";return;}
  try{
    const user=await api("api/auth/change-password",{method:"POST",body:{currentPassword:$("currentPassword").value,newPassword:a}});
    $("passwordForm").reset();
    await authenticated(user);
    showToast("Пароль изменён");
  }catch(err){$("passwordError").textContent=err.message;}
}

function openDrawer(){ $("drawer").classList.add("open"); $("drawerBackdrop").classList.remove("hidden"); }
function closeDrawer(){ $("drawer").classList.remove("open"); $("drawerBackdrop").classList.add("hidden"); }
function showSection(name){state.section=name;document.querySelectorAll(".section").forEach(s=>s.classList.toggle("active",s.id===`section-${name}`));document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.section===name));[$("sectionTitle").textContent,$("sectionSubtitle").textContent]=sectionMeta[name];closeDrawer();if(name==="gallery")loadGallery();}

async function loadTemplates(){state.templates=await api("api/templates");renderTemplateList();}
function renderTemplateList(){const q=$("templateSearch").value.trim().toLowerCase();$("templateList").replaceChildren(...state.templates.filter(t=>t.name.toLowerCase().includes(q)).map(t=>{const b=document.createElement("button");b.className="template-item"+(state.currentTemplate?.id===t.id?" active":"");b.innerHTML=`<strong>${escapeHtml(t.name)}</strong><span>${formatDate(t.updatedAt)}</span>`;b.onclick=()=>openTemplate(t.id);return b;}));}
function createTemplateDraft(){state.currentTemplate={id:null,name:"Новый шаблон",contentHtml:'<p style="text-align:center"><strong>ЗАЯВЛЕНИЕ</strong></p><p><br></p><p>Я, ________________________________, прошу предоставить мне ________________________________.</p>'};$("templateName").value=state.currentTemplate.name;$("templateEditor").innerHTML=state.currentTemplate.contentHtml;setTemplateMode("editor");renderTemplateList();}
async function openTemplate(id){state.currentTemplate=await api(`api/templates/${id}`);$("templateName").value=state.currentTemplate.name;$("templateEditor").innerHTML=state.currentTemplate.contentHtml;setTemplateMode("editor");renderTemplateList();}
async function saveTemplate(){if(!state.currentTemplate)return;convertTemplateFields();const payload={name:$("templateName").value.trim(),contentHtml:sanitizeHtml($("templateEditor").innerHTML)};const isNew=!state.currentTemplate.id;state.currentTemplate=await api(isNew?"api/templates":`api/templates/${state.currentTemplate.id}`,{method:isNew?"POST":"PUT",body:payload});await loadTemplates();showToast("Шаблон сохранён");}
async function duplicateTemplate(){if(!state.currentTemplate)return;const payload={name:`${$("templateName").value} — копия`,contentHtml:$("templateEditor").innerHTML};state.currentTemplate=await api("api/templates",{method:"POST",body:payload});await loadTemplates();showToast("Копия создана");}
async function deleteTemplate(){if(!state.currentTemplate?.id||!confirm("Удалить шаблон?"))return;await api(`api/templates/${state.currentTemplate.id}`,{method:"DELETE"});await loadTemplates();createTemplateDraft();}
function insertTemplateField(){const span=document.createElement("span");span.className="template-field";span.dataset.field="1";span.innerHTML="&nbsp;";const sel=getSelection();if(sel?.rangeCount){const r=sel.getRangeAt(0);r.deleteContents();r.insertNode(span);r.setStartAfter(span);r.collapse(true);sel.removeAllRanges();sel.addRange(r);}else $("templateEditor").append(span);}
function convertTemplateFields(){const root=$("templateEditor");const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const n of nodes){if(n.parentElement?.closest(".template-field"))continue;const parts=n.nodeValue.split(/(_{3,})/g);if(parts.length<2)continue;const frag=document.createDocumentFragment();parts.forEach(p=>{if(/^_{3,}$/.test(p)){const s=document.createElement("span");s.className="template-field";s.dataset.field="1";s.innerHTML="&nbsp;";frag.append(s);}else frag.append(document.createTextNode(p));});n.replaceWith(frag);}}
function setTemplateMode(mode){state.templateMode=mode;document.querySelectorAll("[data-template-mode]").forEach(b=>b.classList.toggle("active",b.dataset.templateMode===mode));$("templateEditorMode").classList.toggle("hidden",mode!=="editor");$("templateFillMode").classList.toggle("hidden",mode!=="fill");if(mode==="fill")buildFillDocument();}
function buildFillDocument(){const clone=$("templateEditor").cloneNode(true);clone.querySelectorAll(".template-field").forEach((f,i)=>{const s=document.createElement("span");s.className="fill-field";s.contentEditable="true";s.dataset.fieldIndex=String(i);s.innerHTML="&nbsp;";f.replaceWith(s);});$("fillDocument").innerHTML=clone.innerHTML;}
async function saveTemplateFromFill(){const clone=$("fillDocument").cloneNode(true);clone.querySelectorAll(".fill-field").forEach(f=>{const s=document.createElement("span");s.className="template-field";s.dataset.field="1";s.innerHTML="&nbsp;";f.replaceWith(s);});$("templateEditor").innerHTML=clone.innerHTML;await saveTemplate();}
function exportTemplatePdf(){const target=$("fillDocument");target.classList.add("print-target");window.print();setTimeout(()=>target.classList.remove("print-target"),500);}
async function saveFilledToGallery(){const title=$("templateName").value.trim()||"Заполненный шаблон";const html=`<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:'Times New Roman',serif;padding:40px;line-height:1.45}</style>${$("fillDocument").innerHTML}`;await saveBlobToGallery(new Blob([html],{type:"text/html"}),title,"template",state.currentTemplate?.id);showToast("Документ сохранён в галерею");}
async function exportTemplateWord(){const blocks=htmlToWordBlocks($("fillDocument"));const r=await fetch("api/export/word",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileName:$("templateName").value,blocks})});if(!r.ok)throw new Error("Не удалось создать Word");downloadBlob(await r.blob(),`${safeName($("templateName").value)}.docx`);}
function htmlToWordBlocks(root){return [...root.children].map(x=>({kind:"paragraph",paragraph:{alignment:getComputedStyle(x).textAlign,headingLevel:null,runs:[{text:x.innerText,bold:false,italic:false,underline:false,strike:false,fontSize:12,color:"000000",break:false}]},rows:null}));}

async function loadAssets(){const all=await api("api/assets");state.assets.signature=all.filter(x=>x.type==="signature");state.assets.font=all.filter(x=>x.type==="font");state.assets.background=all.filter(x=>x.type==="background");await registerFonts();renderAllAssets();populateHandSelects();}
async function loadBuiltInSignatures(){try{state.builtInSignatures=await (await fetch("signatures-manifest.json",{cache:"no-store"})).json();}catch{state.builtInSignatures=[];}renderSignatureGrid();}
function assetUrl(a){return `api/assets/${a.id}/file`;}
async function uploadAssets(type,files,input){
  const selected=[...(files||[])];
  if(!selected.length)return;
  input.disabled=true;
  let uploaded=0;
  const errors=[];
  try{
    // Загружаем выбранную пачку по одному файлу. Так запрос не упирается
    // в общий multipart-лимит reverse proxy/Kestrel при большой пачке шрифтов.
    for(const file of selected){
      const fd=new FormData();
      fd.append("files",file,file.name);
      try{
        const r=await fetch(`api/assets/${type}`,{method:"POST",credentials:"same-origin",body:fd});
        const data=await readData(r);
        if(!r.ok)throw new Error(data?.error||`Ошибка ${r.status}`);
        uploaded+=Array.isArray(data)?data.length:1;
        showToast(`Загрузка: ${uploaded} из ${selected.length}`);
      }catch(error){
        errors.push(`${file.name}: ${error.message}`);
      }
    }
    await loadAssets();
    if(errors.length){
      showToast(`Загружено ${uploaded}. Ошибок: ${errors.length}`,true);
      console.error("Ошибки пакетной загрузки",errors);
    }else{
      showToast(`Загружено: ${uploaded}`);
    }
  }finally{
    input.value="";
    input.disabled=false;
  }
}
async function deleteAsset(id){await api(`api/assets/${id}`,{method:"DELETE"});await loadAssets();}
function renderAllAssets(){renderSignatureGrid();renderFontGrid();renderBackgroundGrid();}
function renderSignatureGrid(){const built=state.builtInSignatures.map(x=>({id:`builtin-${x.id}`,name:x.title,url:x.file,builtin:true}));const custom=state.assets.signature.map(x=>({id:x.id,name:x.name,url:assetUrl(x),record:x}));renderAssetCards($("signatureGrid"),[...custom,...built],"signature");}
function renderFontGrid(){const defaults=[{id:"default-segoe",name:"Segoe Print",url:null,builtin:true},{id:"default-comic",name:"Comic Sans MS",url:null,builtin:true}];renderAssetCards($("fontGrid"),[...state.assets.font.map(x=>({id:x.id,name:x.name,url:assetUrl(x),record:x})),...defaults],"font");}
function renderBackgroundGrid(){const defaults=[{id:"lined",name:"Тетрадь в линейку",preset:"lined",builtin:true},{id:"grid",name:"Тетрадь в клетку",preset:"grid",builtin:true},{id:"blank",name:"Белый лист",preset:"blank",builtin:true},{id:"yellow",name:"Жёлтая бумага",preset:"yellow",builtin:true}];renderAssetCards($("backgroundGrid"),[...state.assets.background.map(x=>({id:x.id,name:x.name,url:assetUrl(x),record:x})),...defaults],"background");}
function renderAssetCards(root,items,type){root.replaceChildren(...items.map(item=>{const card=document.createElement("article");card.className="asset-card";const preview=document.createElement("div");preview.className="asset-preview"+(type==="background"?" background-thumb":"");if(type==="font"){preview.classList.add("font-sample");preview.textContent="Пример рукописного текста";preview.style.fontFamily=item.record?`"${fontFamilyForAsset(item.record)}", cursive`:`"${item.name}", cursive`;if(item.record?.fontLoadError){preview.classList.add("font-load-error");preview.title="Браузер не смог прочитать файл шрифта";}}else if(type==="background"&&item.preset){preview.classList.add(`hand-paper`,item.preset);preview.style.height="130px";}else{const img=new Image();img.src=item.url;preview.append(img);}const actions=document.createElement("div");actions.className="asset-actions";const use=document.createElement("button");use.textContent=type==="signature"?"Добавить на лист":"Использовать";use.onclick=()=>useAsset(type,item);actions.append(use);if(item.record){const del=document.createElement("button");del.textContent="Удалить";del.onclick=()=>deleteAsset(item.id);actions.append(del);}card.append(preview,Object.assign(document.createElement("div"),{className:"asset-name",textContent:item.name}),actions);return card;}));}
function useAsset(type,item){if(type==="font"){$("handFont").value=item.record?`asset:${item.id}`:item.name;renderHandwriting();showSection("handwriting");}else if(type==="background"){$("handBackground").value=item.record?`asset:${item.id}`:item.preset;applyHandBackground();showSection("handwriting");}else{addHandSignature(item);showSection("handwriting");}}
function fontFamilyForAsset(asset){return `AssetFont_${String(asset.id).replaceAll("-","")}`;}
async function registerFonts(){
  await Promise.all(state.assets.font.map(async asset=>{
    const family=fontFamilyForAsset(asset);
    asset.fontLoadError=false;
    try{
      if("FontFace" in window){
        const existing=[...document.fonts].find(face=>face.family===family);
        if(!existing){
          const face=new FontFace(family,`url("${assetUrl(asset)}?v=${encodeURIComponent(asset.size||0)}")`,{display:"swap"});
          await face.load();
          document.fonts.add(face);
        }
      }else if(!document.getElementById(`font-${asset.id}`)){
        const st=document.createElement("style");
        st.id=`font-${asset.id}`;
        st.textContent=`@font-face{font-family:"${family}";src:url("${assetUrl(asset)}") format("${fontFormat(asset.contentType)}");font-display:swap}`;
        document.head.append(st);
      }
      await document.fonts.load(`24px "${family}"`);
    }catch(error){
      asset.fontLoadError=true;
      console.error(`Не удалось загрузить шрифт ${asset.name}`,error);
    }
  }));
}
function fontFormat(contentType){return contentType==="font/woff2"?"woff2":contentType==="font/woff"?"woff":contentType==="font/otf"?"opentype":"truetype";}
function populateHandSelects(){const f=$("handFont"),bg=$("handBackground");const currentF=f.value,currentB=bg.value;f.innerHTML='<option value="Segoe Print">Segoe Print</option><option value="Comic Sans MS">Comic Sans MS</option>'+state.assets.font.map(a=>`<option value="asset:${a.id}">${escapeHtml(a.name)}</option>`).join("");bg.innerHTML='<option value="lined">Линейка</option><option value="grid">Клетка</option><option value="blank">Белый</option><option value="yellow">Жёлтый</option>'+state.assets.background.map(a=>`<option value="asset:${a.id}">${escapeHtml(a.name)}</option>`).join("");if([...f.options].some(o=>o.value===currentF))f.value=currentF;if([...bg.options].some(o=>o.value===currentB))bg.value=currentB;}

function renderHandwriting(){const r=$("handTextRender"),font=$("handFont").value,p=penPresets[$("penPreset").value];r.textContent=$("handText").value;r.style.fontFamily=font.startsWith("asset:")?`"${fontFamilyForAsset({id:font.slice(6)})}", cursive`:`"${font}",cursive`;r.style.fontSize=`${$("handSize").value}px`;r.style.lineHeight=`${$("handLine").value}px`;r.style.color=p.color;r.style.opacity=(p.opacity*Number($("handOpacity").value)/100).toFixed(2);r.style.textShadow=p.shadow;r.style.fontWeight=String(p.weight);state.hand.rotation=Number($("handRotate").value);state.hand.skewX=Number($("handSkewX").value);state.hand.skewY=Number($("handSkewY").value);applyHandBox();}
function applyHandBox(){const b=$("handTextBox");Object.assign(b.style,{left:`${state.hand.x}px`,top:`${state.hand.y}px`,width:`${state.hand.w}px`,height:`${state.hand.h}px`,transform:`rotate(${state.hand.rotation}deg) skew(${state.hand.skewX}deg,${state.hand.skewY}deg)`});}
function applyHandBackground(){const paper=$("handPaper"),v=$("handBackground").value;paper.className="hand-paper";paper.style.backgroundImage="";if(v.startsWith("asset:")){paper.style.backgroundImage=`url("api/assets/${v.slice(6)}/file")`;paper.style.backgroundSize="cover";paper.style.backgroundPosition="center";}else paper.classList.add(v);}
function resetHandTransform(){Object.assign(state.hand,{x:105,y:55,w:620,h:850,rotation:0,skewX:0,skewY:0});$("handRotate").value=0;$("handSkewX").value=0;$("handSkewY").value=0;applyHandBox();}
function startHandTransform(e){const h=e.target.dataset.handle;const box=$("handTextBox");box.setPointerCapture?.(e.pointerId);state.hand.drag={pointerId:e.pointerId,mode:h?"resize":"move",handle:h,startX:e.clientX,startY:e.clientY,x:state.hand.x,y:state.hand.y,w:state.hand.w,h:state.hand.h};e.preventDefault();}
function moveHandTransform(e){const d=state.hand.drag;if(!d||d.pointerId!==e.pointerId)return;const dx=e.clientX-d.startX,dy=e.clientY-d.startY;if(d.mode==="move"){state.hand.x=d.x+dx;state.hand.y=d.y+dy;}else{if(d.handle.includes("e"))state.hand.w=Math.max(120,d.w+dx);if(d.handle.includes("s"))state.hand.h=Math.max(100,d.h+dy);if(d.handle.includes("w")){state.hand.x=d.x+dx;state.hand.w=Math.max(120,d.w-dx);}if(d.handle.includes("n")){state.hand.y=d.y+dy;state.hand.h=Math.max(100,d.h-dy);}}applyHandBox();}
function endHandTransform(e){if(state.hand.drag?.pointerId===e.pointerId)state.hand.drag=null;}
function addHandSignature(item){const s={id:crypto.randomUUID(),name:item.name,url:item.url,x:280+state.hand.signatures.length*16,y:930-state.hand.signatures.length*12,w:260,h:85,rotation:(Math.random()*6-3)};state.hand.signatures.push(s);renderHandSignatures();}
function renderHandSignatures(){$("handSignatures").replaceChildren(...state.hand.signatures.map(s=>{const d=document.createElement("div");d.className="placed-signature"+(state.hand.selectedSignature===s.id?" selected":"");d.dataset.id=s.id;Object.assign(d.style,{left:`${s.x}px`,top:`${s.y}px`,width:`${s.w}px`,height:`${s.h}px`,transform:`rotate(${s.rotation}deg)`});const i=new Image();i.src=s.url;d.append(i);return d;}));}
function startSignatureDrag(e){const d=e.target.closest(".placed-signature");if(!d)return;const s=state.hand.signatures.find(x=>x.id===d.dataset.id);state.hand.selectedSignature=s.id;renderHandSignatures();const startX=e.clientX,startY=e.clientY,ox=s.x,oy=s.y;const move=ev=>{s.x=ox+ev.clientX-startX;s.y=oy+ev.clientY-startY;renderHandSignatures();};const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);};window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);e.preventDefault();}


async function ensureSelectedFontLoaded(){
  const value=$("handFont").value;
  if(!value.startsWith("asset:"))return;
  const family=fontFamilyForAsset({id:value.slice(6)});
  try{await document.fonts.load(`32px "${family}"`);await document.fonts.ready;}catch(error){console.error("Не удалось подготовить шрифт к экспорту",error);}
}
async function exportHandwritingPdf(save){const canvas=await renderHandCanvas();const blob=canvasToPdf(canvas);const title=`Рукописный документ ${new Date().toLocaleDateString("ru-RU")}`;if(save)await saveBlobToGallery(blob,title,"handwriting",null);else downloadBlob(blob,`${safeName(title)}.pdf`);showToast(save?"PDF сохранён в галерею":"PDF сформирован");}
async function renderHandCanvas(){await ensureSelectedFontLoaded();const paper=$("handPaper"),canvas=document.createElement("canvas");canvas.width=paper.clientWidth*2;canvas.height=paper.clientHeight*2;const c=canvas.getContext("2d");c.scale(2,2);await drawBackground(c,paper.clientWidth,paper.clientHeight);c.strokeStyle="#efaaa9";c.lineWidth=2;c.beginPath();c.moveTo(82,0);c.lineTo(82,paper.clientHeight);c.stroke();drawHandText(c);for(const s of state.hand.signatures){const img=await loadImage(s.url);c.save();c.translate(s.x+s.w/2,s.y+s.h/2);c.rotate(s.rotation*Math.PI/180);c.drawImage(img,-s.w/2,-s.h/2,s.w,s.h);c.restore();}return canvas;}
async function drawBackground(c,w,h){const v=$("handBackground").value;c.fillStyle=v==="yellow"?"#fff8d7":"#fff";c.fillRect(0,0,w,h);if(v.startsWith("asset:")){const img=await loadImage(`api/assets/${v.slice(6)}/file`);c.drawImage(img,0,0,w,h);return;}c.strokeStyle=v==="yellow"?"rgba(198,178,102,.45)":"#b8d3ef";c.lineWidth=1;if(v==="lined"||v==="yellow")for(let y=39;y<h;y+=39){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}if(v==="grid")for(let x=0;x<w;x+=38){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}if(v==="grid")for(let y=0;y<h;y+=38){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}}
function drawHandText(c){const p=penPresets[$("penPreset").value],fontValue=$("handFont").value,fontName=fontValue.startsWith("asset:")?fontFamilyForAsset({id:fontValue.slice(6)}):fontValue,size=Number($("handSize").value),line=Number($("handLine").value);c.save();c.translate(state.hand.x+state.hand.w/2,state.hand.y+state.hand.h/2);c.rotate(state.hand.rotation*Math.PI/180);c.transform(1,Math.tan(state.hand.skewY*Math.PI/180),Math.tan(state.hand.skewX*Math.PI/180),1,0,0);c.translate(-state.hand.w/2,-state.hand.h/2);c.font=`${p.weight} ${size}px "${fontName}"`;c.fillStyle=p.color;c.globalAlpha=p.opacity*Number($("handOpacity").value)/100;c.textBaseline="top";const lines=wrapText(c,$("handText").value,state.hand.w);let y=0;for(const ln of lines){if(y+line>state.hand.h)break;c.fillText(ln,0,y);if($("penPreset").value==="ball-weak"&&Math.random()>.55){c.globalAlpha*=.55;c.fillText(ln,.4,y+.15);c.globalAlpha=p.opacity*Number($("handOpacity").value)/100;}y+=line;}c.restore();}
function wrapText(c,text,max){const out=[];for(const paragraph of text.split("\n")){if(!paragraph){out.push("");continue;}let line="";for(const word of paragraph.split(/\s+/)){const test=line?`${line} ${word}`:word;if(c.measureText(test).width>max&&line){out.push(line);line=word;}else line=test;}out.push(line);}return out;}
function canvasToPdf(canvas){const data=atob(canvas.toDataURL("image/jpeg",.92).split(",")[1]),bytes=Uint8Array.from(data,c=>c.charCodeAt(0)),w=595,h=842;const parts=[],offsets=[];const push=s=>parts.push(new TextEncoder().encode(s));push("%PDF-1.4\n");const obj=(n,content)=>{offsets[n]=parts.reduce((a,b)=>a+b.length,0);push(`${n} 0 obj\n${content}\nendobj\n`);};obj(1,"<< /Type /Catalog /Pages 2 0 R >>");obj(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");obj(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);offsets[4]=parts.reduce((a,b)=>a+b.length,0);push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);parts.push(bytes);push("\nendstream\nendobj\n");const content=`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;obj(5,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);const xref=parts.reduce((a,b)=>a+b.length,0);push("xref\n0 6\n0000000000 65535 f \n");for(let i=1;i<=5;i++)push(String(offsets[i]).padStart(10,"0")+" 00000 n \n");push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);return new Blob(parts,{type:"application/pdf"});}

async function loadGallery(){state.gallery=await api("api/documents");renderGallery();}
function renderGallery(){$("galleryGrid").replaceChildren(...state.gallery.map(d=>{const card=document.createElement("article");card.className="gallery-card";card.innerHTML=`<h3>${escapeHtml(d.title)}</h3><p>${d.kind==="handwriting"?"Рукописный PDF":d.kind==="template"?"Заполненный шаблон":"Документ"} · ${formatDate(d.createdAt)}</p>`;const actions=document.createElement("div");actions.className="asset-actions";const a=document.createElement("a");a.href=`api/documents/${d.id}/file`;a.textContent="Скачать";const del=document.createElement("button");del.textContent="Удалить";del.onclick=async()=>{await api(`api/documents/${d.id}`,{method:"DELETE"});loadGallery();};actions.append(a,del);card.append(actions);return card;}));}
async function saveBlobToGallery(blob,title,kind,templateId){const fd=new FormData();fd.append("file",blob,kind==="handwriting"?`${safeName(title)}.pdf`:`${safeName(title)}.html`);fd.append("title",title);fd.append("kind",kind);if(templateId)fd.append("templateId",templateId);const r=await fetch("api/documents",{method:"POST",credentials:"same-origin",body:fd});if(!r.ok)throw new Error((await readData(r))?.error||"Ошибка сохранения");await loadGallery();}
async function uploadDocuments(files,input){for(const f of files){const fd=new FormData();fd.append("file",f);fd.append("title",f.name.replace(/\.[^.]+$/,"") );fd.append("kind",f.type==="application/pdf"?"handwriting":"document");const r=await fetch("api/documents",{method:"POST",credentials:"same-origin",body:fd});if(!r.ok)throw new Error("Не удалось загрузить документ");}input.value="";await loadGallery();}

async function api(url,opt={}){const init={credentials:"same-origin",method:opt.method||"GET",headers:{}};if(opt.body!==undefined){init.headers["Content-Type"]="application/json";init.body=JSON.stringify(opt.body);}const r=await fetch(url,init);if(r.status===204)return null;const data=await readData(r);if(!r.ok)throw new Error(data?.error||`Ошибка ${r.status}`);return data;}
async function readData(r){const t=await r.text();try{return t?JSON.parse(t):null;}catch{return null;}}
function sanitizeHtml(html){const d=document.createElement("div");d.innerHTML=html;d.querySelectorAll("script,style,iframe,object,embed").forEach(x=>x.remove());d.querySelectorAll("*").forEach(x=>[...x.attributes].forEach(a=>{if(a.name.startsWith("on"))x.removeAttribute(a.name);}));return d.innerHTML;}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function formatDate(v){return new Date(v).toLocaleString("ru-RU");}
function safeName(v){return String(v||"document").replace(/[\\/:*?"<>|]+/g,"_").trim()||"document";}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);}
function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.crossOrigin="anonymous";i.onload=()=>res(i);i.onerror=rej;i.src=src;});}
function showToast(text,error=false){clearTimeout(toastTimer);$("toast").textContent=text;$("toast").classList.toggle("error",error);$("toast").classList.add("show");toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2600);}
