"use strict";
const el=id=>document.getElementById(id);
const state={items:[],filtered:[],visible:60,selected:null,user:null};
let toastTimer;
init();
async function init(){
  try{
    const me=await fetch("api/auth/me",{credentials:"same-origin"});
    if(!me.ok){location.href="./";return;}
    state.user=await me.json(); el("currentUser").textContent=state.user.username;
    const manifest=await fetch("signatures-manifest.json",{cache:"no-store"});
    state.items=await manifest.json(); state.filtered=[...state.items];
    wire(); renderText(); renderSignatures();
    el("authGate").classList.add("hidden"); el("page").classList.remove("hidden");
  }catch{el("authGate").textContent="Не удалось загрузить страницу.";}
}
function wire(){
  el("textTab").onclick=()=>setTab("text"); el("signaturesTab").onclick=()=>setTab("signatures");
  ["sourceText","fontSize","slant","lineHeight","jitter"].forEach(id=>el(id).addEventListener("input",renderText));
  el("showSignature").onchange=renderSignatureOnPaper;
  el("clearSignature").onclick=()=>{state.selected=null;renderSignatureOnPaper();};
  el("printNotes").onclick=()=>window.print();
  el("signatureSearch").oninput=filterSignatures;
  el("shuffleButton").onclick=()=>{state.filtered.sort(()=>Math.random()-.5);state.visible=60;renderSignatures();};
  el("showAllButton").onclick=()=>{state.visible=state.filtered.length;renderSignatures();};
  el("loadMoreButton").onclick=()=>{state.visible+=60;renderSignatures();};
  el("logoutButton").onclick=async()=>{await fetch("api/auth/logout",{method:"POST",credentials:"same-origin"});location.href="./";};
}
function setTab(tab){
  const text=tab==="text"; el("textTab").classList.toggle("active",text); el("signaturesTab").classList.toggle("active",!text);
  el("textTab").setAttribute("aria-selected",String(text));el("signaturesTab").setAttribute("aria-selected",String(!text));
  el("textPanel").classList.toggle("hidden",!text);el("signaturesPanel").classList.toggle("hidden",text);
}
function renderText(){
  const target=el("handwrittenText"); target.textContent=el("sourceText").value;
  target.style.fontSize=`${el("fontSize").value}px`; target.style.lineHeight=`${el("lineHeight").value}px`;
  target.style.transform=`skewX(${-Number(el("slant").value)}deg)`;
  const jitter=Number(el("jitter").value); target.style.textShadow=jitter?`${jitter*.25}px ${jitter*.15}px 0 rgba(23,35,142,.16)`:"none";
}
function filterSignatures(){
  const q=el("signatureSearch").value.trim().replace(/\D/g,"");
  state.filtered=q?state.items.filter(x=>String(x.id).padStart(4,"0").includes(q)): [...state.items];
  state.visible=60;renderSignatures();
}
function renderSignatures(){
  const grid=el("signatureGrid"); grid.replaceChildren();
  const slice=state.filtered.slice(0,state.visible);
  for(const item of slice){
    const card=document.createElement("article");card.className="signature-card";
    const img=document.createElement("img");img.className="signature-preview";img.loading="lazy";img.src=item.file;img.alt=item.title;
    const meta=document.createElement("div");meta.className="signature-meta";
    const title=document.createElement("span");title.className="signature-title";title.textContent=item.title;
    const actions=document.createElement("div");actions.className="signature-actions";
    const use=document.createElement("button");use.className="mini use";use.textContent="Выбрать";use.onclick=()=>selectSignature(item);
    const download=document.createElement("a");download.className="mini";download.textContent="SVG";download.href=item.file;download.download=`signature-${String(item.id).padStart(4,"0")}.svg`;
    actions.append(use,download);meta.append(title,actions);card.append(img,meta);grid.append(card);
  }
  el("resultCount").textContent=`Показано ${slice.length} из ${state.filtered.length}`;
  el("loadMoreButton").classList.toggle("hidden",state.visible>=state.filtered.length);
}
function selectSignature(item){state.selected=item;renderSignatureOnPaper();setTab("text");showToast(`${item.title} добавлена на лист`);}
function renderSignatureOnPaper(){
  const img=el("paperSignature");const enabled=el("showSignature").checked&&state.selected;
  img.classList.toggle("hidden",!enabled);if(enabled)img.src=state.selected.file;
  el("selectedSignatureLabel").textContent=state.selected?`Выбрана: ${state.selected.title}`:"Подпись не выбрана";
}
function showToast(text){clearTimeout(toastTimer);el("toast").textContent=text;el("toast").classList.add("show");toastTimer=setTimeout(()=>el("toast").classList.remove("show"),2200);}
