const $=s=>document.querySelector(s), LS=localStorage;
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
// Les données synchronisées viennent de l'extérieur : on ne garde que des champs attendus, aux types attendus.
const ID=/^[\w-]{1,64}$/, okId=id=>typeof id==="string"&&ID.test(id)&&id!=="__proto__";
const str=(v,n)=>typeof v==="string"?v.slice(0,n):"";
function clean(k,id,r){
  if(!okId(id)||!r||typeof r!=="object")return null;
  const ts=Number.isFinite(r.ts)?r.ts:0,deleted=r.deleted===true;
  if(k==="lists")return{id,name:str(r.name,60)||id,ts,deleted};
  if(k==="items")return okId(r.list)?{id,list:r.list,text:str(r.text,200),done:r.done===true,archived:r.archived===true,c:Number.isFinite(r.c)?r.c:ts,ts,deleted}:null;
  if(k==="meals"){
    const ad=r.added&&typeof r.added==="object"&&Array.isArray(r.added.items)?{n:Math.max(1,Math.min(30,parseInt(r.added.n,10)||4)),
      items:r.added.items.slice(0,80).map(g=>({t:str(g&&g.t,200),store:okId(g&&g.store)?g.store:"auchan"})),
      ids:(Array.isArray(r.added.ids)?r.added.ids:[]).filter(okId).slice(0,120)}:null;
    return{key:id,text:str(r.text,120),servings:Math.max(1,Math.min(30,parseInt(r.servings,10)||4)),added:ad,ts,deleted};
  }
  if(k==="stores")return{id,last:(Array.isArray(r.last)?r.last:[]).filter(okId).slice(-3),def:okId(r.def)?r.def:null,ts,deleted};
  if(k==="aisles")return Rayons.byId[r.rayon]?{id,rayon:r.rayon,ts,deleted}:null;
  if(k==="recipes")return{id,name:str(r.name,120),ingredients:(Array.isArray(r.ingredients)?r.ingredients:[]).slice(0,80)
    .map(i=>({t:str(i&&i.t,200),store:okId(i&&i.store)?i.store:"auchan"})),ts,deleted};
  return null;
}
function cleanAll(src){
  const out={lists:{},items:{},meals:{},recipes:{},aisles:{},stores:{}};
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
    const before=JSON.stringify(S);
    const remote=await r.json(); if(remote)merge(remote);
    const changed=JSON.stringify(S)!==before;
    const w=await rpc("put_household",{p_code:code,p_data:S});
    if(!w.ok){const e=await w.json().catch(()=>({}));throw e.message==="code inconnu"?"unk":0}
    dirty=false;save();setStatus("ok");if(changed)safeRender();
  }catch(e){setStatus(e==="unk"?"unk":"err")}
  syncing=false;if(again){again=false;sync()}
}
const STATE={ok:"Synchronisé",err:"Hors ligne (modifs conservées)",unk:"Code inconnu",
  "":"Synchro désactivée"};
let status="";
// Ne pas redessiner pendant une saisie : le champ serait recréé et la page sauterait.
let pendingRender=false;
function safeRender(){
  const a=document.activeElement;
  if(a&&a.matches("input,textarea,select")){pendingRender=true;return}
  const y=scrollY;render();if(Math.abs(scrollY-y)>2)scrollTo(0,y);
}
document.addEventListener("focusout",()=>setTimeout(()=>{if(pendingRender&&!document.activeElement.matches("input,textarea,select")){pendingRender=false;safeRender()}},250));
function setStatus(c){
  const changed=c!==status;status=c;
  $("#status").className=c;$("#status").title=STATE[c];
  if(changed&&tab==="settings")safeRender();
}

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
  live(S.items).filter(i=>i.list===id&&!i.done&&/\s\+\s/.test(i.text)&&Qty.parse(i.text).kind==="box").forEach(i=>{touch("items",{...i,deleted:true});addBoxes(id,Qty.parse(i.text),i.id)});
  const items=live(S.items).filter(i=>i.list===id&&!i.archived).sort((a,b)=>a.done-b.done||(a.c||a.ts)-(b.c||b.ts));
  const row=i=>`<div class="row ${i.done?"done":""}"><input type="checkbox" data-c="${i.id}" ${i.done?"checked":""}><span class="t" data-e="${i.id}">${esc(i.text)}</span>${!i.done?`<span class="stp sm"><button data-q="${i.id}" data-dir="-1" aria-label="Moins">−</button><button data-q="${i.id}" data-dir="1" aria-label="Plus">+</button></span>`:""}<button class="x" data-d="${i.id}">×</button></div>`;
  $("#view").innerHTML=`<form id="add"><input type="text" id="new" placeholder="Ajouter un article…" autocomplete="off"><button class="btn">+</button></form>`+
   (items.length?Rayons.list.map(r=>{const g=items.filter(i=>!i.done&&rayonOf(i.text)===r.id);
      return g.length?`<h3 class="ray">${r.icon} ${esc(r.label)}</h3><div class="card">${g.map(row).join("")}</div>`:""}).join("")+
    (items.some(i=>i.done)?`<h3 class="ray">✅ Dans le caddie</h3><div class="card">${items.filter(i=>i.done).map(row).join("")}</div>`:"")+`
   ${items.some(i=>i.done)?`<button class="btn sec" id="clr">Retirer les articles cochés</button>`:""}`:`<div class="empty">Liste vide</div>`);
  // Suggestions : articles déjà saisis (toutes listes, même retirés) et ingrédients des recettes,
  // dont le nom commence par ce qui est tapé ; les plus fréquents d'abord.
  const nm=x=>x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const known=()=>{const m=new Map();
    const put=(t,ts)=>{const p=Qty.parse(t),k=Qty.key(p);if(!p.name)return;const e=m.get(k)||{n:0,ts:0};e.n++;if(ts>=e.ts){e.ts=ts;e.text=t;e.name=p.name}m.set(k,e)};
    Object.values(S.items).forEach(i=>put(i.text,i.ts||0));
    live(S.recipes).forEach(r=>r.ingredients.forEach(g=>put(g.t,0)));
    return [...m.values()]};
  const inp=$("#new"),form=$("#add");
  const closeSug=()=>form.querySelectorAll(".sug").forEach(x=>x.remove());
  inp.oninput=()=>{
    closeSug();const q=nm(inp.value.trim());if(!q)return;
    const hits=known().filter(e=>nm(e.name).startsWith(q)||nm(e.text).startsWith(q)).sort((a,b)=>b.n-a.n||b.ts-a.ts).slice(0,8);
    if(!hits.length)return;
    const box=document.createElement("div");box.className="sug";
    box.innerHTML=hits.map(e=>`<button type="button" data-t="${esc(e.text)}">${esc(e.text)}</button>`).join("");
    box.onpointerdown=ev=>{const b=ev.target.closest("button");if(!b)return;ev.preventDefault();addToList(id,b.dataset.t);inp.value="";closeSug();render();$("#new").focus()};
    form.appendChild(box);
  };
  inp.onblur=()=>setTimeout(closeSug,150);
  $("#add").onsubmit=e=>{e.preventDefault();const t=$("#new").value.trim();if(t){addToList(id,t);render();$("#new").focus()}};
  document.querySelectorAll("[data-q]").forEach(el=>el.onclick=()=>{const i=S.items[el.dataset.q],t=Qty.step(i.text,+el.dataset.dir);if(t){touch("items",{...i,text:t});render()}});
  document.querySelectorAll("[data-e]").forEach(el=>el.onclick=()=>{const i=S.items[el.dataset.e];if(!i.done)itemEditor(i)});
  document.querySelectorAll("[data-c]").forEach(el=>el.onchange=()=>{const i=S.items[el.dataset.c];touch("items",{...i,done:el.checked});recordPurchase(i.text,i.list,el.checked);render()});
  document.querySelectorAll("[data-d]").forEach(el=>el.onclick=()=>{const i=S.items[el.dataset.d];touch("items",i.done?{...i,archived:true}:{...i,deleted:true});render()});
  const c=$("#clr");if(c)c.onclick=()=>{items.filter(i=>i.done).forEach(i=>touch("items",{...i,archived:true}));render()};
}
// Ajoute un article à une liste en cumulant avec un article identique non coché (« 1 oignon » + « 3 oignons » = « 4 oignons »).
function addToList(list,text){
  const p=Qty.parse(text);
  if(p.kind==="box")return addBoxes(list,p);
  const same=live(S.items).find(i=>i.list===list&&!i.done&&Qty.key(Qty.parse(i.text))===Qty.key(Qty.parse(text)));
  if(same){const t=Qty.add(same.text,text);if(t&&t!==same.text)touch("items",{...same,text:t});return[same.id]}
  const nid=uid();touch("items",{id:nid,list,text,done:false,c:Date.now()});return[nid];
}
// Boîtes : la quantité ajoutée (une recette) est répartie par taille (1 grosse = 2 moyennes = 4 petites),
// puis chaque taille s'ajoute à la ligne de même taille. Pas de conversion entre recettes :
// elles ne sont pas forcément cuisinées en même temps.
function addBoxes(list,p,except){
  const k=Qty.key(p),ids=[];
  for(const l of Qty.boxLines(p)){
    const o=live(S.items).find(i=>i.list===list&&!i.done&&i.id!==except&&Qty.key(Qty.parse(i.text))===k&&Qty.parse(i.text).size===l.size);
    if(o){touch("items",{...o,text:Qty.format({...Qty.parse(o.text),n:Qty.parse(o.text).n+Qty.parse(l.text).n})});ids.push(o.id)}
    else{const nid=uid();touch("items",{id:nid,list,text:l.text,done:false,c:Date.now()});ids.push(nid)}
  }
  return ids;
}
// Rayon d'un article : celui choisi une fois par l'utilisateur, sinon deviné d'après le nom.
function rayonOf(text){const n=Qty.parse(text).name||text,k=Rayons.keyOf(n);return (S.aisles[k]&&!S.aisles[k].deleted&&S.aisles[k].rayon)||Rayons.guess(n)}
function itemEditor(i){
  const cur=rayonOf(i.text),ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Modifier l'article</h2>
   <input type="text" id="it" value="${esc(i.text)}" style="width:100%;margin-bottom:10px">
   <p class="mut">Rayon (retenu pour la prochaine fois)</p>
   <select id="ir" style="width:100%">${Rayons.list.map(r=>`<option value="${r.id}" ${r.id===cur?"selected":""}>${r.icon} ${esc(r.label)}</option>`).join("")}</select>
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">Enregistrer</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  $("#ok").onclick=()=>{
    const t=$("#it").value.trim().slice(0,200)||i.text,r=$("#ir").value;
    if(t!==i.text)touch("items",{...i,text:t});
    if(r!==rayonOf(t)){const k=Rayons.keyOf(Qty.parse(t).name||t);touch("aisles",{id:k,rayon:r})}
    close();render();
  };
}
// Magasin par défaut d'un article : fixé seulement après 3 achats consécutifs au même endroit,
// et il change si les 3 derniers achats se font ailleurs.
function recordPurchase(text,store,bought){
  const k=Rayons.keyOf(Qty.parse(text).name||text),o=S.stores[k]||{id:k,last:[],def:null};
  let last=[...o.last];
  if(bought)last=[...last,store].slice(-3);
  else{const j=last.lastIndexOf(store);if(j>=0)last.splice(j,1)} // case décochée : on annule cet achat
  const def=last.length===3&&last.every(s=>s===last[0])?last[0]:o.def;
  touch("stores",{id:k,last,def});
}
const defaultStore=(text,fallback)=>{const s=S.stores[Rayons.keyOf(Qty.parse(text).name||text)];return (s&&s.def&&S.lists[s.def]&&s.def)||fallback||"auchan"};
// Articles cochés depuis plus de 2 h : les courses sont finies, on les masque (gardés en historique).
const DONE_TTL=2*3600*1000;
const HISTORY_TTL=30*24*3600*1000; // historique des achats gardé 30 jours
function purgeDone(){
  let n=0;live(S.items).forEach(i=>{
    if(i.done&&!i.archived&&Date.now()-i.ts>DONE_TTL){touch("items",{...i,archived:true});n++}       // masqué après 2 h
    else if(i.archived&&Date.now()-i.ts>HISTORY_TTL)touch("items",{...i,deleted:true});              // oublié après 30 j
  });
  if(n&&tab!=="menus"&&tab!=="settings")safeRender();
}
// Retire une quantité d'un article non coché (supprimé s'il tombe à zéro).
function removeFromList(list,text){
  const p=Qty.parse(text),k=Qty.key(p);
  const same=live(S.items).filter(i=>i.list===list&&!i.done&&Qty.key(Qty.parse(i.text))===k).sort((a,b)=>Qty.parse(a.text).n-Qty.parse(b.text).n);
  let need=Math.ceil(p.n==null?1:p.n);
  for(const i of same){
    if(need<=0)break;
    const q=Qty.parse(i.text),have=Math.ceil(q.n==null?1:q.n);
    if(have<=need){touch("items",{...i,deleted:true});need-=have}
    else{touch("items",{...i,text:Qty.format({...q,kind:q.kind==="none"?"count":q.kind,n:have-need})});need=0}
  }
}
// Repas dont les ingrédients sont déjà dans les listes : on n'ajoute que la différence de personnes.
// Ingrédients du repas déjà achetés (au moins un article lié coché) : le repas ne peut plus être supprimé, seulement déplacé.
const bought=m=>!!(m&&m.added&&(m.added.ids||[]).some(id=>S.items[id]&&S.items[id].done));
// Déplace un repas (avec ses ingrédients déjà ajoutés) ; si la place est prise, les deux repas s'échangent.
function moveMeal(from){
  const m=S.meals[from],today=new Date();today.setHours(12);
  const slots=[];for(let d=-7;d<=28;d++){const x=new Date(today);x.setDate(today.getDate()+d);const k=x.toISOString().slice(0,10);
    for(const [s,l] of [["m","midi"],["s","soir"]]){const key=k+"-"+s;if(key===from)continue;const o=S.meals[key];
      slots.push(`<option value="${key}" ${d===1&&s===from.slice(-1)?"selected":""}>${x.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})} ${l}${o&&o.text?" — "+esc(o.text)+" (échange)":""}</option>`)}}
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Déplacer « ${esc(m.text)} »</h2>
   <select id="mvto" style="width:100%">${slots.join("")}</select>
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">Déplacer</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  $("#ok").onclick=()=>{
    const to=$("#mvto").value,o=S.meals[to];
    touch("meals",{...m,key:to});
    touch("meals",o&&o.text?{...o,key:from}:{key:from,text:"",servings:m.servings||BASE});
    close();render();
  };
}
function resizeMeal(m,n){
  if(!m.added||m.added.n===n)return{...m,servings:n};
  const ids=new Set(m.added.ids||[]);
  m.added.items.forEach(g=>{removeFromList(g.store,Qty.buy(g.t,m.added.n/BASE));addToList(g.store,Qty.buy(g.t,n/BASE)).forEach(x=>ids.add(x))});
  return{...m,servings:n,added:{...m.added,n,ids:[...ids]}};
}
function monday(){const d=new Date();d.setHours(12);d.setDate(d.getDate()-((d.getDay()+6)%7)+7*(+LS.wk||0));return d}
const BASE=4,VERSION="v31";
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
      [["m","Midi"],["s","Soir"]].map(([s,l])=>{const key=k+"-"+s,e=S.meals[key]||{},n=e.servings||BASE;return `<div class="slotw"><div class="slot"><span>${l}</span><input type="text" data-m="${key}" placeholder="Choisir un plat…" autocomplete="off" autocapitalize="sentences" value="${esc(e.text||"")}"></div>${e.text?`<div class="sub"><div class="stp"><button data-sm="${key}" aria-label="Moins">−</button><b>${n}</b><button data-sp="${key}" aria-label="Plus">+</button><em>pers.</em></div><button class="pill" data-i="${key}">🛒 Ingrédients</button><button class="pill" data-mv="${key}" aria-label="Déplacer">⇄</button></div>`:""}</div>`}).join("")+`</div></section>`;
  }
  $("#view").innerHTML=h;
  const norm=x=>x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const names=()=>{const seen=new Set(),out=[];
    for(const [t,recipe] of [...live(S.recipes).map(r=>[r.name,true]),...live(S.meals).map(m=>[m.text,false]).filter(x=>x[0])]){const k=norm(t);if(!seen.has(k)){seen.add(k);out.push({t,recipe})}}
    // écarte les fragments saisis à moitié (ex. « Pom » quand « Pommes de terre… » existe)
    return out.filter(x=>x.recipe||!out.some(y=>y!==x&&norm(y.t).length>norm(x.t).length&&norm(y.t).startsWith(norm(x.t))))};
  const commit=(el,t)=>{
    const key=el.dataset.m,o=S.meals[key]||{};
    // plat remplacé ou effacé : on retire des listes ce que l'ancien plat y avait ajouté
    if(bought(o)&&norm(o.text||"")!==norm(t)){
      el.value=o.text;
      alert(`Les ingrédients de « ${o.text} » ont déjà été achetés : ce repas ne peut pas être supprimé ni remplacé. Utilisez ⇄ pour le déplacer.`);
      return;
    }
    const dropOld=()=>{if(o.added&&norm(o.text||"")!==norm(t))o.added.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,o.added.n/BASE)))};
    dropOld();
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
  document.querySelectorAll("[data-mv]").forEach(el=>el.onclick=()=>moveMeal(el.dataset.mv));
  const step=(key,d)=>{const m=S.meals[key],n=Math.max(1,Math.min(30,(m.servings||BASE)+d));LS.defN=n;touch("meals",resizeMeal(m,n));render()};
  document.querySelectorAll("[data-sm]").forEach(el=>el.onclick=()=>step(el.dataset.sm,-1));
  document.querySelectorAll("[data-sp]").forEach(el=>el.onclick=()=>step(el.dataset.sp,1));
  $("#pv").onclick=()=>{LS.wk=(+LS.wk||0)-1;render()};$("#nx").onclick=()=>{LS.wk=(+LS.wk||0)+1;render()};
}
function ingredientsDialog(name,mealKey){
  const r=live(S.recipes).find(x=>x.name.toLowerCase()===name.toLowerCase());
  const lists=live(S.lists).sort(listSort);
  const opts=sel=>lists.map(l=>`<option value="${l.id}" ${l.id===sel?"selected":""}>${esc(l.name)}</option>`).join("");
  const meal=mealKey&&S.meals[mealKey],prev=meal&&meal.text===name&&meal.added;
  let n=(meal&&meal.servings)||BASE;
  const was=t=>prev&&prev.items.find(g=>g.t===t);
  const ov=document.createElement("div");ov.className="ov";
  const rowH=i=>`<div class="row ing-row" data-base="${esc(i.t)}"><input type="checkbox" ${!prev||was(i.t)?"checked":""}><input type="text" class="ing" value="${esc(Qty.buy(i.t,n/BASE))}" data-shown="${esc(Qty.buy(i.t,n/BASE))}"><select>${opts(was(i.t)?was(i.t).store:defaultStore(i.t,i.store))}</select></div>`;
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>${esc(name)}</h2>
   ${prev?`<p class="okmsg">✓ Déjà dans les listes pour ${prev.n} personne${prev.n>1?"s":""}. Changer le nombre de personnes ou les cases met à jour les listes.</p>`:""}
   ${r?`<div class="serv"><span>Pour</span><button class="btn sec" id="mn">−</button><b id="nn">${n}</b><button class="btn sec" id="pl">+</button><span>personnes</span></div>
   <p class="mut">Cochez ce qu'il faut acheter et choisissez le magasin. Recette de base : ${BASE} personnes.</p>
   <div id="ings" class="card">${r.ingredients.map(rowH).join("")}</div><button class="btn sec" id="more">+ Ingrédient</button>`
   :`<p class="mut">Nouvelle recette : un ingrédient par ligne, <b>quantités pour ${BASE} personnes</b> (ex. « 400 g de pâtes »).</p><textarea id="ta" rows="7" placeholder="400 g de pâtes&#10;200 g de lardons&#10;2 oeufs&#10;crème fraîche"></textarea>`}
   <div class="acts"><button class="btn sec" id="no">Ignorer</button><button class="btn" id="ok">${!r?"Continuer":prev?"Mettre à jour les listes":"Ajouter aux listes"}</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  ov.onclick=e=>{if(e.target===ov)close()};
  $("#no").onclick=close;
  if(r){
    const setN=v=>{
      n=Math.max(1,Math.min(30,v));$("#nn").textContent=n;
      ov.querySelectorAll(".ing-row").forEach(el=>{const i=el.querySelector(".ing");if(i.value===i.dataset.shown){i.value=i.dataset.shown=Qty.buy(el.dataset.base,n/BASE)}});
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
    const now=rows.filter(x=>x.on).map(x=>({t:x.base,store:x.store}));
    const sig=(items,k)=>items.map(g=>g.t+"@"+g.store).sort().join("|")+"#"+k;
    const ids=new Set(prev?prev.ids||[]:[]);
    if(!prev||sig(prev.items,prev.n)!==sig(now,n)){
      if(prev)prev.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,prev.n/BASE)));
      rows.filter(x=>x.on).forEach(x=>addToList(x.store,x.shown).forEach(i=>ids.add(i)));
    }
    touch("recipes",{...r,ingredients:rows.map(x=>({t:x.base,store:(r.ingredients.find(g=>g.t===x.base)||x).store}))});
    if(meal)touch("meals",{...S.meals[mealKey],servings:n,added:{n,items:now,ids:[...ids]}});
    close();render();
  };
}
$("#tabs").onclick=e=>{const t=(e.target.closest("[data-t]")||{dataset:{}}).dataset.t;if(t){tab=LS.tab=t;render();scrollTo(0,0)}};
$("#cfg").onclick=()=>{tab=LS.tab="settings";render();scrollTo(0,0)};
function renderSettings(){
  $("#title").textContent="Réglages";
  const rs=live(S.recipes).sort((a,b)=>a.name.localeCompare(b.name));
  $("#view").innerHTML=`<h2 class="sec">Synchronisation</h2>
   <div class="card"><div class="row"><span class="t">Code de cet appareil<br><small class="mut">${code?"•".repeat(Math.min(code.length,12)):"non défini"} · ${STATE[status]}</small></span><button class="btn sec" id="setcode">Saisir</button></div>
   ${code?`<div class="row"><span class="t">Copier le code<br><small class="mut">Pour le coller sur un autre appareil</small></span><button class="btn sec" id="cpcode">Copier</button></div>`:""}
   ${status==="ok"?`<div class="row"><span class="t">Changer le code du foyer<br><small class="mut">Les autres appareils devront saisir le nouveau</small></span><button class="btn sec" id="rencode">Changer</button></div>`:""}</div>
   ${status==="unk"?`<p class="warn">Ce code ne correspond à aucun foyer. Vérifiez-le (majuscules, espaces) ou demandez-le à un autre membre du foyer.</p>`:""}
   <h2 class="sec">Recettes <small>(quantités pour ${BASE} personnes)</small></h2>
   <div class="card">${rs.length?rs.map(r=>`<div class="row link" data-r="${r.id}"><span class="t">${esc(r.name)}<br><small class="mut">${r.ingredients.length} ingrédient${r.ingredients.length>1?"s":""}</small></span><span class="mut">›</span></div>`).join(""):`<div class="empty">Aucune recette pour l'instant</div>`}</div>
   <button class="btn" id="newr" style="width:100%">+ Nouvelle recette</button>
   <p class="mut" style="text-align:center;margin-top:24px">Version ${VERSION} <a href="#" id="upd">Forcer la mise à jour</a></p>`;
  $("#upd").onclick=async e=>{e.preventDefault();try{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)}catch(_){}location.reload()};
  const askCode=(msg,def)=>{
    let c=prompt(msg,def);
    while(c!==null&&c.trim().length<MIN_CODE)c=prompt(`Trop court : au moins ${MIN_CODE} caractères. Par exemple trois mots et un nombre.`,c.trim());
    return c===null?null:c.trim();
  };
  // Rejoindre un foyer existant : ne change que cet appareil.
  const cp=$("#cpcode");if(cp)cp.onclick=async()=>{try{await navigator.clipboard.writeText(code);cp.textContent="Copié ✓"}catch(_){alert("Copie impossible sur cet appareil.")}};
  $("#setcode").onclick=()=>{
    const c=askCode("Code du foyer (le même que sur les autres appareils) :",code);
    if(c!==null){code=LS.code=c;dirty=true;save();sync();render()}
  };
  // Renommer le foyer côté serveur : il faut que le code actuel soit valide.
  const ren=$("#rencode");if(ren)ren.onclick=async()=>{
    const n=askCode(`Nouveau code du foyer, au moins ${MIN_CODE} caractères. Gardez-le secret :`,"");
    if(!n||n===code)return;
    const r=await rpc("change_household_code",{p_old:code,p_new:n}).catch(()=>null);
    if(r&&r.ok){code=LS.code=n;sync();render();alert("Code changé. Sur les autres appareils : ⚙︎ → Saisir, puis le nouveau code.");return}
    const e=r?await r.json().catch(()=>({})):{};
    alert(e.message==="code deja utilise"?"Ce code est déjà pris, choisissez-en un autre.":"Impossible de changer le code pour l'instant (hors ligne ?).");
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
// Récupère les changements des autres appareils ; les siens partent tout de suite (touch).
setInterval(()=>{const a=document.activeElement;if(!document.hidden&&!(a&&a.matches("input,textarea,select")))sync()},60000);
if("serviceWorker" in navigator){
  const had=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>r.update());
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(had)location.reload()});
}
purgeDone();render();sync();
setInterval(purgeDone,5*60*1000);
if(!code&&cfg.SUPABASE_URL)setTimeout(()=>$("#cfg").click(),300);
