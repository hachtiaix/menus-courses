const $=s=>document.querySelector(s), LS=localStorage;
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
let S=JSON.parse(LS.s||"null")||{lists:{},items:{},meals:{},recipes:{}};S.recipes=S.recipes||{};
for(const [id,name] of [["auchan","Auchan"],["lidl","Lidl"],["drive","Drive"]]) S.lists[id]=S.lists[id]||{id,name,ts:0};
let tab=LS.tab||"auchan", code=LS.code||"", dirty=!!LS.dirty;

function save(){LS.s=JSON.stringify(S);LS.dirty=dirty?"1":""}
function touch(kind,rec){rec.ts=Date.now();(S[kind]=S[kind]||{})[rec.id||rec.key]=rec;dirty=true;save();sync();}
function merge(remote){
  for(const k of ["lists","items","meals","recipes"])for(const [id,r] of Object.entries(remote[k]||{}))
    if(!S[k][id]||r.ts>S[k][id].ts)S[k][id]=r;
}
const cfg=window.CONFIG, canSync=()=>cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&code;
const H=()=>({apikey:cfg.SUPABASE_ANON_KEY,Authorization:"Bearer "+cfg.SUPABASE_ANON_KEY,"Content-Type":"application/json"});
let syncing=false,again=false;
async function sync(){
  if(!canSync()){setStatus("");return}
  if(syncing){again=true;return}
  syncing=true;
  try{
    const r=await fetch(`${cfg.SUPABASE_URL}/rest/v1/households?code=eq.${encodeURIComponent(code)}&select=data`,{headers:H()});
    if(!r.ok)throw 0;
    const rows=await r.json(); if(rows[0])merge(rows[0].data);
    const w=await fetch(`${cfg.SUPABASE_URL}/rest/v1/households?on_conflict=code`,{method:"POST",headers:{...H(),Prefer:"resolution=merge-duplicates"},body:JSON.stringify({code,data:S,updated_at:new Date().toISOString()})});
    if(!w.ok)throw 0;
    dirty=false;save();setStatus("ok");render();
  }catch(e){setStatus("err")}
  syncing=false;if(again){again=false;sync()}
}
function setStatus(c){$("#status").className=c;$("#status").title=c==="ok"?"Synchronisé":c==="err"?"Hors ligne (modifs conservées)":"Synchro désactivée"}

const live=o=>Object.values(o).filter(x=>!x.deleted);
function render(){
  const lists=live(S.lists).sort((a,b)=>a.name.localeCompare(b.name));
  $("#tabs").innerHTML=lists.map(l=>{const c=live(S.items).filter(i=>i.list===l.id&&!i.done).length;return `<button data-t="${l.id}" class="${tab===l.id?"on":""}"><i>🛒${c?`<b>${c}</b>`:""}</i>${esc(l.name)}</button>`}).join("")+`<button data-t="menus" class="${tab==="menus"?"on":""}"><i>📅</i>Menus</button>`;
  if(tab==="menus")renderMenus();else renderList(S.lists[tab]?tab:"auchan");
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
const BASE=4;
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
    h+=`<section class="day ${k===today?"today":""}"><h3>${d.toLocaleDateString("fr-FR",{weekday:"long"})} <small>${d.getDate()}</small></h3>`+
      [["m","Midi"],["s","Soir"]].map(([s,l])=>{const e=S.meals[k+"-"+s]||{};return `<div class="slot"><span>${l}</span><input type="text" data-m="${k}-${s}" list="recipes" placeholder="Choisir un plat…" value="${esc(e.text||"")}">${e.text?`<button class="pill" data-i="${k}-${s}" title="Ingrédients">🛒 ${e.servings||BASE} pers.</button>`:""}</div>`}).join("")+`</section>`;
  }
  h+=`<datalist id="recipes">${live(S.recipes).map(r=>`<option value="${esc(r.name)}">`).join("")}</datalist>`;
  $("#view").innerHTML=h;
  document.querySelectorAll("[data-m]").forEach(el=>el.onchange=()=>{const t=el.value.trim(),o=S.meals[el.dataset.m]||{};touch("meals",{key:el.dataset.m,text:t,servings:o.servings||BASE});render();if(t)ingredientsDialog(t,el.dataset.m)});
  document.querySelectorAll("[data-i]").forEach(el=>el.onclick=()=>ingredientsDialog(S.meals[el.dataset.i].text,el.dataset.i));
  $("#pv").onclick=()=>{LS.wk=(+LS.wk||0)-1;render()};$("#nx").onclick=()=>{LS.wk=(+LS.wk||0)+1;render()};
}
function ingredientsDialog(name,mealKey){
  const r=live(S.recipes).find(x=>x.name.toLowerCase()===name.toLowerCase());
  const lists=live(S.lists).sort((a,b)=>a.name.localeCompare(b.name));
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
$("#cfg").onclick=()=>{
  const c=prompt("Code du foyer (identique sur tous les appareils, gardez-le secret) :",code);
  if(c!==null){code=LS.code=c.trim();sync()}
};
addEventListener("online",sync);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)sync()});
setInterval(()=>{if(!document.hidden)sync()},20000);
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js");
render();sync();
if(!code&&cfg.SUPABASE_URL)setTimeout(()=>$("#cfg").click(),300);
