const $=s=>document.querySelector(s), LS=localStorage;
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
// Les données synchronisées viennent de l'extérieur : on ne garde que des champs attendus, aux types attendus.
const ID=/^[\w-]{1,64}$/, okId=id=>typeof id==="string"&&ID.test(id)&&id!=="__proto__";
const str=(v,n)=>typeof v==="string"?v.slice(0,n):"";
function clean(k,id,r){
  if(!okId(id)||!r||typeof r!=="object")return null;
  const ts=Number.isFinite(r.ts)?r.ts:0,deleted=r.deleted===true;
  if(k==="lists")return{id,name:str(r.name,60)||id,ts,deleted};
  if(k==="items")return okId(r.list)?{id,list:r.list,text:str(r.text,200),done:r.done===true,ts,deleted}:null;
  if(k==="meals")return{key:id,text:str(r.text,120),servings:Math.max(1,Math.min(30,parseInt(r.servings,10)||4)),ts,deleted};
  if(k==="recipes")return{id,name:str(r.name,120),ingredients:(Array.isArray(r.ingredients)?r.ingredients:[]).slice(0,80)
    .map(i=>({t:str(i&&i.t,200),store:okId(i&&i.store)?i.store:"auchan"})),ts,deleted};
  return null;
}
function cleanAll(src){
  const out={lists:{},items:{},meals:{},recipes:{}};
  for(const k in out)if(src&&src[k]&&typeof src[k]==="object")for(const [id,r] of Object.entries(src[k])){const c=clean(k,id,r);if(c)out[k][id]=c}
  return out;
}
let S=cleanAll(JSON.parse(LS.s||"null"));
const ORDER=["auchan","lidl","drive","boucherie","fermiers"];
for(const [id,name] of [["auchan","Auchan"],["lidl","Lidl"],["drive","Drive"],["boucherie","Boucherie"],["fermiers","Au pré des fermiers"]]) S.lists[id]=S.lists[id]||{id,name,ts:0};
let tab=LS.tab||"auchan", code=LS.code||"", dirty=!!LS.dirty;

function save(){LS.s=JSON.stringify(S);LS.dirty=dirty?"1":""}
function touch(kind,rec){rec.ts=Date.now();(S[kind]=S[kind]||{})[rec.id||rec.key]=rec;dirty=true;save();sync();}
function merge(remote){
  const r=cleanAll(remote);
  for(const k in r)for(const [id,x] of Object.entries(r[k]))
    if(!S[k][id]||x.ts>S[k][id].ts)S[k][id]=x;
}
// Code minimal : en dessous, la base refuse l'écriture (cf. supabase.sql).
const MIN_CODE=10;
const cfg=window.CONFIG, canSync=()=>cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&code.length>=MIN_CODE;
const H=()=>({apikey:cfg.SUPABASE_ANON_KEY,Authorization:"Bearer "+cfg.SUPABASE_ANON_KEY,"Content-Type":"application/json"});
// Le code part dans le corps de la requête, jamais dans l'URL.
const rpc=(fn,body)=>fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:"POST",headers:H(),body:JSON.stringify(body)});
let syncing=false,again=false;
async function sync(){
  if(!canSync()){setStatus("");return}
  if(syncing){again=true;return}
  syncing=true;
  try{
    const r=await rpc("get_household",{p_code:code});
    if(!r.ok)throw 0;
    const remote=await r.json(); if(remote)merge(remote);
    const w=await rpc("put_household",{p_code:code,p_data:S});
    if(!w.ok)throw 0;
    dirty=false;save();setStatus("ok");render();
  }catch(e){setStatus("err")}
  syncing=false;if(again){again=false;sync()}
}
function setStatus(c){$("#status").className=c;$("#status").title=c==="ok"?"Synchronisé":c==="err"?"Hors ligne (modifs conservées)":"Synchro désactivée"}

const listSort=(a,b)=>{const i=ORDER.indexOf(a.id),j=ORDER.indexOf(b.id);return (i<0?99:i)-(j<0?99:j)||a.name.localeCompare(b.name)};
const SHORT={auchan:"Auchan",lidl:"Lidl",drive:"Drive",boucherie:"Boucherie",fermiers:"Fermiers"},ICON={drive:"🚗",boucherie:"🥩",fermiers:"🥕"};
const live=o=>Object.values(o).filter(x=>!x.deleted);
function render(){
  const lists=live(S.lists).sort(listSort);
  $("#tabs").innerHTML=lists.map(l=>{const c=live(S.items).filter(i=>i.list===l.id&&!i.done).length;return `<button data-t="${l.id}" class="${tab===l.id?"on":""}"><i>${ICON[l.id]||"🛒"}${c?`<b>${c}</b>`:""}</i>${esc(SHORT[l.id]||l.name)}</button>`}).join("")+`<button data-t="menus" class="${tab==="menus"?"on":""}"><i>📅</i>Menus</button>`;
  if(tab==="settings")renderSettings();else if(tab==="menus")renderMenus();else renderList(S.lists[tab]?tab:"auchan");
}
const esc=s=>s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function renderList(id){
  $("#title").textContent=S.lists[id].name;
  const items=live(S.items).filter(i=>i.list===id).sort((a,b)=>a.done-b.done||a.ts-b.ts);
  $("#view").innerHTML=`<form id="add"><input type="text" id="new" placeholder="Ajouter un article…" autocomplete="off"><button class="btn">+</button></form>`+
   (items.length?`<div class="card">${items.map(i=>`<div class="row ${i.done?"done":""}"><input type="checkbox" data-c="${i.id}" ${i.done?"checked":""}><span class="t">${esc(i.text)}</span><button class="x" data-d="${i.id}">×</button></div>`).join("")}</div>
   ${items.some(i=>i.done)?`<button class="btn sec" id="clr">Retirer les articles cochés</button>`:""}`:`<div class="empty">Liste vide</div>`);
  $("#add").onsubmit=e=>{e.preventDefault();const t=$("#new").value.trim();if(t){touch("items",{id:uid(),list:id,text:t,done:false});render();$("#new").focus()}};
  document.querySelectorAll("[data-c]").forEach(el=>el.onchange=()=>{const i=S.items[el.dataset.c];touch("items",{...i,done:el.checked});render()});
  document.querySelectorAll("[data-d]").forEach(el=>el.onclick=()=>{touch("items",{...S.items[el.dataset.d],deleted:true});render()});
  const c=$("#clr");if(c)c.onclick=()=>{items.filter(i=>i.done).forEach(i=>touch("items",{...i,deleted:true}));render()};
}
function monday(){const d=new Date();d.setHours(12);d.setDate(d.getDate()-((d.getDay()+6)%7)+7*(+LS.wk||0));return d}
const BASE=4,VERSION="v11";
function fmt(x){return String(Math.round(x*100)/100).replace(".",",")}
function scaleText(t,f){
  const m=t.match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(.*)$/);
  if(!m||f===1)return t;
  let n=m[1];
  if(n.includes("/")){const p=n.trim().split(/\s+/);const fr=p.pop().split("/");n=(p[0]?+p[0]:0)+fr[0]/fr[1]}else n=parseFloat(n.replace(",","."));
  const rest=m[2];
  return fmt(n*f)+(rest?" "+rest:"");
}
function renderMenus(){
  $("#title").textContent="Menus";
  const m=monday(),today=new Date().toISOString().slice(0,10);
  const end=new Date(m);end.setDate(m.getDate()+6);
  const f=d=>d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
  let h=`<div class="wk"><button class="btn sec" id="pv">‹</button><div>${f(m)} – ${f(end)}</div><button class="btn sec" id="nx">›</button></div>`;
  for(let n=0;n<7;n++){
    const d=new Date(m);d.setDate(m.getDate()+n);const k=d.toISOString().slice(0,10);
    const wd=d.toLocaleDateString("fr-FR",{weekday:"short"}).replace(".","");
    h+=`<section class="day ${k===today?"today":""}"><div class="dh"><b>${wd}</b><small>${d.getDate()}</small></div><div class="slots">`+
      [["m","Midi"],["s","Soir"]].map(([s,l])=>{const key=k+"-"+s,e=S.meals[key]||{},n=e.servings||BASE;return `<div class="slotw"><div class="slot"><span>${l}</span><input type="text" data-m="${key}" placeholder="Choisir un plat…" autocomplete="off" autocapitalize="sentences" value="${esc(e.text||"")}"></div>${e.text?`<div class="sub"><div class="stp"><button data-sm="${key}" aria-label="Moins">−</button><b>${n}</b><button data-sp="${key}" aria-label="Plus">+</button><em>pers.</em></div><button class="pill" data-i="${key}">🛒 Ingrédients</button></div>`:""}</div>`}).join("")+`</div></section>`;
  }
  $("#view").innerHTML=h;
  const norm=x=>x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const names=()=>{const seen=new Set(),out=[];
    for(const [t,recipe] of [...live(S.recipes).map(r=>[r.name,true]),...live(S.meals).map(m=>[m.text,false]).filter(x=>x[0])]){const k=norm(t);if(!seen.has(k)){seen.add(k);out.push({t,recipe})}}
    // écarte les fragments saisis à moitié (ex. « Pom » quand « Pommes de terre… » existe)
    return out.filter(x=>x.recipe||!out.some(y=>y!==x&&norm(y.t).length>norm(x.t).length&&norm(y.t).startsWith(norm(x.t))))};
  const commit=(el,t)=>{
    const key=el.dataset.m,o=S.meals[key]||{};
    if(!t){if(o.text)touch("meals",{key,text:"",servings:o.servings||BASE});render();return}
    const known=live(S.recipes).find(r=>norm(r.name)===norm(t));
    touch("meals",{key,text:known?known.name:t,servings:o.servings||(+LS.defN||BASE)});render();ingredientsDialog(known?known.name:t,key);
  };
  const clearSug=()=>document.querySelectorAll(".sug").forEach(x=>x.remove());
  document.querySelectorAll("[data-m]").forEach(el=>{
    el.oninput=()=>{
      clearSug();const q=norm(el.value.trim());if(!q)return;
      const hits=names().filter(x=>norm(x.t).includes(q)&&norm(x.t)!==q).sort((a,b)=>b.recipe-a.recipe||(norm(b.t).startsWith(q)-norm(a.t).startsWith(q))).slice(0,6);
      if(!hits.length)return;
      const box=document.createElement("div");box.className="sug";
      box.innerHTML=hits.map(x=>`<button type="button" data-t="${esc(x.t)}">${x.recipe?"📖":"🕘"} ${esc(x.t)}</button>`).join("");
      box.onpointerdown=e=>{const b=e.target.closest("button");if(!b)return;e.preventDefault();el.value=b.dataset.t;clearSug();commit(el,b.dataset.t)};
      el.closest(".slotw").appendChild(box);
    };
    el.onblur=()=>setTimeout(clearSug,150);
    el.onchange=()=>{if(document.querySelector(".sug:hover"))return;clearSug();commit(el,el.value.trim())};
  });
  document.querySelectorAll("[data-i]").forEach(el=>el.onclick=()=>ingredientsDialog(S.meals[el.dataset.i].text,el.dataset.i));
  const step=(key,d)=>{const m=S.meals[key],n=Math.max(1,Math.min(30,(m.servings||BASE)+d));LS.defN=n;touch("meals",{...m,servings:n});render()};
  document.querySelectorAll("[data-sm]").forEach(el=>el.onclick=()=>step(el.dataset.sm,-1));
  document.querySelectorAll("[data-sp]").forEach(el=>el.onclick=()=>step(el.dataset.sp,1));
  $("#pv").onclick=()=>{LS.wk=(+LS.wk||0)-1;render()};$("#nx").onclick=()=>{LS.wk=(+LS.wk||0)+1;render()};
}
function ingredientsDialog(name,mealKey){
  const r=live(S.recipes).find(x=>x.name.toLowerCase()===name.toLowerCase());
  const lists=live(S.lists).sort(listSort);
  const opts=sel=>lists.map(l=>`<option value="${l.id}" ${l.id===sel?"selected":""}>${esc(l.name)}</option>`).join("");
  let n=(mealKey&&S.meals[mealKey]&&S.meals[mealKey].servings)||BASE;
  const ov=document.createElement("div");ov.className="ov";
  const rowH=i=>`<div class="row ing-row" data-base="${esc(i.t)}"><input type="checkbox" checked><input type="text" class="ing" value="${esc(scaleText(i.t,n/BASE))}" data-shown="${esc(scaleText(i.t,n/BASE))}"><select>${opts(i.store||"auchan")}</select></div>`;
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>${esc(name)}</h2>
   ${r?`<div class="serv"><span>Pour</span><button class="btn sec" id="mn">−</button><b id="nn">${n}</b><button class="btn sec" id="pl">+</button><span>personnes</span></div>
   <p class="mut">Cochez ce qu'il faut acheter et choisissez le magasin. Recette de base : ${BASE} personnes.</p>
   <div id="ings" class="card">${r.ingredients.map(rowH).join("")}</div><button class="btn sec" id="more">+ Ingrédient</button>`
   :`<p class="mut">Nouvelle recette : un ingrédient par ligne, <b>quantités pour ${BASE} personnes</b> (ex. « 400 g de pâtes »).</p><textarea id="ta" rows="7" placeholder="400 g de pâtes&#10;200 g de lardons&#10;2 oeufs&#10;crème fraîche"></textarea>`}
   <div class="acts"><button class="btn sec" id="no">Ignorer</button><button class="btn" id="ok">${r?"Ajouter aux listes":"Continuer"}</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  ov.onclick=e=>{if(e.target===ov)close()};
  $("#no").onclick=close;
  if(r){
    const setN=v=>{
      n=Math.max(1,Math.min(30,v));$("#nn").textContent=n;
      ov.querySelectorAll(".ing-row").forEach(el=>{const i=el.querySelector(".ing");if(i.value===i.dataset.shown){i.value=i.dataset.shown=scaleText(el.dataset.base,n/BASE)}});
    };
    $("#mn").onclick=()=>setN(n-1);$("#pl").onclick=()=>setN(n+1);
    $("#more").onclick=()=>{$("#ings").insertAdjacentHTML("beforeend",rowH({t:""}));$("#ings").lastChild.querySelector(".ing").focus()};
  }
  $("#ok").onclick=()=>{
    if(!r){
      const ings=$("#ta").value.split("\n").map(x=>x.trim()).filter(Boolean).map(t=>({t,store:"auchan"}));
      close();if(ings.length){touch("recipes",{id:uid(),name,ingredients:ings});ingredientsDialog(name,mealKey)}return;
    }
    const rows=[...ov.querySelectorAll(".ing-row")].map(el=>{const i=el.querySelector(".ing"),edited=i.value!==i.dataset.shown;
      return{on:el.querySelector("[type=checkbox]").checked,shown:i.value.trim(),base:edited?scaleText(i.value.trim(),BASE/n):el.dataset.base,store:el.querySelector("select").value}}).filter(x=>x.shown);
    rows.filter(x=>x.on).forEach(x=>touch("items",{id:uid(),list:x.store,text:x.shown,done:false}));
    touch("recipes",{...r,ingredients:rows.map(x=>({t:x.base,store:x.store}))});
    if(mealKey&&S.meals[mealKey])touch("meals",{...S.meals[mealKey],servings:n});
    close();render();
  };
}
$("#tabs").onclick=e=>{const t=(e.target.closest("[data-t]")||{dataset:{}}).dataset.t;if(t){tab=LS.tab=t;render();scrollTo(0,0)}};
$("#cfg").onclick=()=>{tab=LS.tab="settings";render();scrollTo(0,0)};
function renderSettings(){
  $("#title").textContent="Réglages";
  const rs=live(S.recipes).sort((a,b)=>a.name.localeCompare(b.name));
  $("#view").innerHTML=`<h2 class="sec">Synchronisation</h2>
   <div class="card"><div class="row"><span class="t">Code du foyer<br><small class="mut">${code?"•".repeat(Math.min(code.length,12)):"non défini"}</small></span><button class="btn sec" id="chgcode">Modifier</button></div></div>
   <h2 class="sec">Recettes <small>(quantités pour ${BASE} personnes)</small></h2>
   <div class="card">${rs.length?rs.map(r=>`<div class="row link" data-r="${r.id}"><span class="t">${esc(r.name)}<br><small class="mut">${r.ingredients.length} ingrédient${r.ingredients.length>1?"s":""}</small></span><span class="mut">›</span></div>`).join(""):`<div class="empty">Aucune recette pour l'instant</div>`}</div>
   <button class="btn" id="newr" style="width:100%">+ Nouvelle recette</button>
   <p class="mut" style="text-align:center;margin-top:24px">Version ${VERSION} <a href="#" id="upd">Forcer la mise à jour</a></p>`;
  $("#upd").onclick=async e=>{e.preventDefault();try{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)}catch(_){}location.reload()};
  $("#chgcode").onclick=()=>{
    let c=prompt(`Code du foyer, au moins ${MIN_CODE} caractères (identique sur tous les appareils, gardez-le secret) :`,code);
    while(c!==null&&c.trim().length<MIN_CODE)c=prompt(`Trop court : au moins ${MIN_CODE} caractères. Par exemple trois mots et un nombre.`,c.trim());
    if(c!==null){code=LS.code=c.trim();dirty=true;save();sync();render()}
  };
  $("#newr").onclick=()=>recipeEditor(null);
  document.querySelectorAll("[data-r]").forEach(el=>el.onclick=()=>recipeEditor(S.recipes[el.dataset.r]));
}
function recipeEditor(r){
  const lists=live(S.lists).sort(listSort);
  const opts=sel=>lists.map(l=>`<option value="${l.id}" ${l.id===sel?"selected":""}>${esc(SHORT[l.id]||l.name)}</option>`).join("");
  const rowH=i=>`<div class="ed-row"><input type="text" class="ing" value="${esc(i.t)}" placeholder="400 g de pâtes"><select>${opts(i.store||"auchan")}</select><button class="x">×</button></div>`;
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>${r?"Modifier la recette":"Nouvelle recette"}</h2>
   <input type="text" id="rn" placeholder="Nom du plat" value="${esc(r?r.name:"")}" style="width:100%;margin-bottom:10px">
   <p class="mut">Ingrédients pour ${BASE} personnes, avec la quantité en premier. Le magasin est celui proposé par défaut.</p>
   <div id="eds">${(r?r.ingredients:[{t:""},{t:""},{t:""}]).map(rowH).join("")}</div>
   <button class="btn sec" id="more">+ Ingrédient</button>
   <div class="acts">${r?`<button class="btn sec danger" id="del">Supprimer</button>`:""}<button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">Enregistrer</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  ov.onclick=e=>{if(e.target===ov)close();const x=e.target.closest(".x");if(x)x.parentNode.remove()};
  $("#no").onclick=close;
  $("#more").onclick=()=>{$("#eds").insertAdjacentHTML("beforeend",rowH({t:""}));$("#eds").lastChild.querySelector(".ing").focus()};
  if(r)$("#del").onclick=()=>{if(confirm("Supprimer cette recette ?")){touch("recipes",{...r,deleted:true});close();render()}};
  $("#ok").onclick=()=>{
    const name=$("#rn").value.trim();
    const ings=[...ov.querySelectorAll(".ed-row")].map(el=>({t:el.querySelector(".ing").value.trim(),store:el.querySelector("select").value})).filter(x=>x.t);
    if(!name){$("#rn").focus();return}
    touch("recipes",{id:r?r.id:uid(),name,ingredients:ings});close();render();
  };
}
addEventListener("online",sync);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)sync()});
setInterval(()=>{if(!document.hidden)sync()},20000);
if("serviceWorker" in navigator){
  const had=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>r.update());
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(had)location.reload()});
}
render();sync();
if(!code&&cfg.SUPABASE_URL)setTimeout(()=>$("#cfg").click(),300);
