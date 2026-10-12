const $=s=>document.querySelector(s), LS=localStorage;
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const {cleanAll}=Data;
let S=cleanAll(JSON.parse(LS.s||"null"));
const ORDER=["auchan","lidl","drive","boucherie","fermiers"];
for(const [id,name] of [["auchan","Auchan"],["lidl","Lidl"],["drive","Drive"],["boucherie","Boucherie"],["fermiers","Au pré des fermiers"]]) S.lists[id]=S.lists[id]||{id,name,ts:0};
let tab=LS.tab||"auchan", code=LS.code||"", pending=JSON.parse(LS.pending||"{}"); // pending : modifications pas encore envoyées

function save(){LS.s=JSON.stringify(S);LS.pending=JSON.stringify(pending)}
function touch(kind,rec){rec.ts=Date.now();const id=rec.id||rec.key;(S[kind]=S[kind]||{})[id]=rec;(pending[kind]=pending[kind]||{})[id]=1;save();sync();}
const merge=remote=>Data.mergeInto(S,remote);
// Code minimal : en dessous, la base refuse l'écriture (cf. supabase.sql).
const MIN_CODE=10;
const cfg=window.CONFIG, canSync=()=>cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&code.length>=MIN_CODE;
const H=()=>({apikey:cfg.SUPABASE_ANON_KEY,Authorization:"Bearer "+cfg.SUPABASE_ANON_KEY,"Content-Type":"application/json"});
// Le code part dans le corps de la requête, jamais dans l'URL.
const rpc=(fn,body)=>fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:"POST",headers:H(),body:JSON.stringify(body)});
let syncing=false,again=false;
// Synchro par différences : on ne reçoit que ce qui a changé depuis la dernière visite (date du serveur,
// avec 1 minute de recouvrement pour ne rien rater) et on n'envoie que nos modifications.
// La première fois (ou après un changement de foyer), échange complet.
const SYNC_OVERLAP=60000;
async function sync(){
  if(!canSync()){setStatus("");return}
  if(syncing){again=true;return}
  syncing=true;
  try{
    const since=LS.since?Math.max(0,+LS.since-SYNC_OVERLAP):0;
    const r=await rpc("get_household_since",{p_code:code,p_since:since});
    if(!r.ok)throw 0;
    const remote=await r.json();
    if(remote==null)throw "unk";
    const changed=merge(remote);
    const full=!LS.deltaInit,payload=full?S:Data.pick(S,pending),sent={};
    for(const k in payload)for(const id in payload[k])(sent[k]=sent[k]||{})[id]=payload[k][id].ts;
    if(Object.keys(sent).length){
      const w=await rpc("put_household",{p_code:code,p_data:payload});
      if(!w.ok){const e=await w.json().catch(()=>({}));throw e.message==="code inconnu"?"unk":0}
      // retirées de la file seulement si elles n'ont pas été remodifiées pendant l'envoi
      for(const k in sent)for(const id in sent[k])if(pending[k]&&(!S[k][id]||S[k][id].ts===sent[k][id]))delete pending[k][id];
    }
    LS.deltaInit="1";if(remote._now)LS.since=remote._now;
    save();setStatus("ok");if(changed)safeRender();
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
// une liste de suggestions ouverte par 💡 se referme si on touche ailleurs
document.addEventListener("pointerdown",e=>{if(!e.target.closest(".sug,.bulb,[data-m]"))document.querySelectorAll(".slotw .sug").forEach(x=>x.remove())});
document.addEventListener("focusout",()=>setTimeout(()=>{if(pendingRender&&!document.activeElement.matches("input,textarea,select")){pendingRender=false;safeRender()}},250));
function setStatus(c){
  const changed=c!==status;status=c;
  $("#status").className=c;$("#status").title=STATE[c];
  if(changed&&tab==="settings")safeRender();
}

const listSort=(a,b)=>{const i=ORDER.indexOf(a.id),j=ORDER.indexOf(b.id);return (i<0?99:i)-(j<0?99:j)||a.name.localeCompare(b.name)};
const SHORT={auchan:"Auchan",lidl:"Lidl",drive:"Drive",boucherie:"Boucherie",fermiers:"Fermiers"},ICON={drive:"🚗",boucherie:"🥩",fermiers:"🚜"},
  MENU_ICON="🍽️",LOGO={auchan:"icons/auchan.svg",lidl:"icons/lidl.svg"},PICTO={fermiers:"icons/ferme.svg"}; // logos du domaine public (Wikimedia Commons)
const live=o=>Object.values(o).filter(x=>!x.deleted);
// Image d'ingrédient : emoji, ou dessin maison « svg:nom » (icons/nom.svg) quand l'emoji n'existe pas (saucisse).
const ico=i=>/^svg:[a-z-]+$/.test(i||"")?`<img class="ico" src="icons/${i.slice(4)}.svg" alt="">`:(i||"");
function render(){
  Data.setCustom(S);
  const hd=document.querySelector("header");if(hd)document.documentElement.style.setProperty("--hh",hd.offsetHeight+"px");
  $("#cfg").style.display=tab==="settings"?"none":""; // inutile dans les réglages : le point de synchro prend sa place
  const lists=live(S.lists).sort(listSort);
  $("#tabs").innerHTML=lists.map(l=>{const c=live(S.items).filter(i=>i.list===l.id&&!i.done&&!i.check).length;return `<button data-t="${l.id}" class="${tab===l.id?"on":""}" aria-label="${esc(l.name)}"><i>${LOGO[l.id]?`<img src="${LOGO[l.id]}" alt="" class="logo-${l.id}">`:PICTO[l.id]?`<img src="${PICTO[l.id]}" alt="" class="picto">`:ICON[l.id]||"🛒"}${c?`<b>${c}</b>`:""}</i></button>`}).join("")+`<button data-t="menus" class="${tab==="menus"?"on":""}" aria-label="Menus"><i>${MENU_ICON}</i></button>`;
  if(tab==="settings")renderSettings();else if(tab==="menus")renderMenus();else renderList(S.lists[tab]?tab:"auchan");
}
const esc=s=>s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function renderList(id){
  // titre : le logo du magasin quand il y en a un (il contient déjà le nom)
  if(LOGO[id])$("#title").innerHTML=`<img src="${LOGO[id]}" alt="${esc(S.lists[id].name)}" class="hlogo hlogo-${id}">`;
  else if(PICTO[id]||ICON[id])$("#title").innerHTML=`${esc(S.lists[id].name)} <span class="hicon">${PICTO[id]?`<img src="${PICTO[id]}" alt="" class="picto">`:ICON[id]}</span>`;
  else $("#title").textContent=S.lists[id].name;
  live(S.items).filter(i=>i.list===id&&!i.done&&/\s\+\s/.test(i.text)&&Qty.parse(i.text).kind==="box").forEach(i=>{touch("items",{...i,deleted:true});addBoxes(id,Qty.parse(i.text),i.id)});
  const items=live(S.items).filter(i=>i.list===id&&!i.archived).sort((a,b)=>a.done-b.done||(a.c||a.ts)-(b.c||b.ts));
  // 🏠 à vérifier au placard : en gris, « Il en manque » (devient un article à acheter) ou « J'en ai » (retiré)
  // 🏠 avec les quantités demandées par chaque repas (pour voir s'il en reste assez), et le total quand il s'additionne ;
  // seulement pour ce qui se mesure vraiment (beurre, farine, sucre…), pas pour les épices, l'huile ou le vinaigre
  const QTY_PANTRY=/^(beurre|farine|sucre|maizena|levure)/;
  const need=i=>{const k=Data.pantryKey(pantryName(i.text)),out=[],withQty=QTY_PANTRY.test(Data.plain(pantryName(i.text)).trim());
    for(const mk of i.meals||[]){const m=S.meals[mk];if(!m||m.deleted||!m.text)continue;const r=recipeOf(m.text);
      const B=(r&&r.serves)||BASE,n=m.servings||BASE,lines=r&&withQty?r.ingredients.filter(g=>Data.pantryKey(pantryName(g.t))===k).map(g=>Qty.buy(g.t,n/B,B)):[];
      out.push({meal:m.text,lines})}
    const all=out.flatMap(x=>x.lines),tot=all.length>1?all.reduce((s,t)=>s&&Qty.add(s,t)):all[0];
    const q=t=>{const nm=pantryName(t),j=t.toLowerCase().lastIndexOf(nm.toLowerCase());return (j>0?t.slice(0,j):"").replace(/\s+(?:de|d['’])\s*$/i,"").trim()};
    return{total:tot?q(tot):"",detail:out.map(x=>{const s=x.lines.map(q).filter(Boolean).join(" + ");return (s?s+" pour ":"pour ")+x.meal}).join(" · ")}};
  const row=i=>{if(!i.check)return rowItem(i);const nd=need(i);
    return `<div class="row verif"><span class="t" data-e="${i.id}">🏠 ${esc(i.text)}${nd.total?` <b class="tot">${esc(nd.total)}</b>`:""}</span><button class="pill vok" data-vok="${i.id}">Il en manque</button><button class="pill vno" data-d="${i.id}">J'en ai</button><small class="for">${esc(nd.detail||"pour un repas")}</small></div>`};
  const rowItem=i=>
`<div class="row item ${i.done?"done":""}"><input type="checkbox" data-c="${i.id}" ${i.done?"checked":""}><span class="t" data-e="${i.id}">${esc(i.text)}</span>${!i.done?`<span class="stp sm"><button data-q="${i.id}" data-dir="-1" aria-label="Moins">−</button><button data-q="${i.id}" data-dir="1" aria-label="Plus">+</button></span><button class="pill imv" data-imv="${i.id}" aria-label="Changer de liste">⇄</button>`:""}<button class="x" data-d="${i.id}">×</button></div>`;
  $("#view").innerHTML=`<form id="add"><input type="text" id="new" placeholder="Ajouter un article…" autocomplete="off"><button class="btn">+</button></form>`+
   // 🏠 à vérifier au placard : tous ensemble en haut de la liste
   (items.some(i=>i.check)?`<h3 class="ray">🏠 À vérifier au placard</h3><div class="card">${items.filter(i=>i.check).map(row).join("")}</div>`:"")+
   (items.length?rayonOrder(id).map(r=>{const g=items.filter(i=>!i.done&&!i.check&&rayonOf(i.text)===r.id);
      return g.length?`<h3 class="ray">${r.icon} ${esc(r.label)}</h3><div class="card">${g.map(row).join("")}</div>`:""}).join("")+
    (items.some(i=>i.done)?`<h3 class="ray">✅ Dans le caddie</h3><div class="card">${items.filter(i=>i.done).map(row).join("")}</div>`:"")+`
   ${items.some(i=>i.done)?`<button class="btn sec" id="clr">Retirer les articles cochés</button>`:""}`:`<div class="empty">Liste vide</div>`);
  // Suggestions : articles déjà saisis (toutes listes, même retirés) et ingrédients des recettes,
  // dont le nom commence par ce qui est tapé ; les plus fréquents d'abord.
  const nm=Data.plain;
  // Suggestions de la liste : le nom seul, sans quantité (« Saucisses de Francfort », pas « 4 saucisses de Francfort »).
  // Sources : articles récents, ingrédients des recettes, et tous les articles déjà achetés (gardés sans limite de temps).
  const known=()=>{const m=new Map();
    const put=(t,ts,w=1)=>{const p=Qty.parse(t);if(!p.name)return;const k=Rayons.keyOf(p.name),e=m.get(k)||{n:0,ts:0};e.n+=w;if(ts>=e.ts){e.ts=ts;e.name=p.name}m.set(k,e)};
    Object.values(S.items).forEach(i=>put(i.text,i.ts||0));
    live(S.recipes).forEach(r=>r.ingredients.forEach(g=>put(g.t,0)));
    live(S.stores).forEach(s=>s.name&&put(s.name,s.ts||0,s.n||1));
    return [...m.values()].map(e=>({...e,text:e.name.charAt(0).toUpperCase()+e.name.slice(1)}))};
  const inp=$("#new"),form=$("#add");
  const closeSug=()=>form.querySelectorAll(".sug").forEach(x=>x.remove());
  inp.oninput=()=>{
    closeSug();const q=nm(inp.value.trim());if(!q)return;
    const hits=known().filter(e=>nm(e.name).startsWith(q)||nm(e.name).includes(" "+q)) // début du nom ou d'un mot (« fraîche » → Crème fraîche).sort((a,b)=>b.n-a.n||b.ts-a.ts).slice(0,8);
    if(!hits.length)return;
    const box=document.createElement("div");box.className="sug";
    box.innerHTML=hits.map(e=>`<button type="button" data-t="${esc(e.text)}">${esc(e.text)}</button>`).join("");
    box.onpointerdown=ev=>{const b=ev.target.closest("button");if(!b)return;ev.preventDefault();addToList(id,b.dataset.t);inp.value="";closeSug();render();$("#new").focus()};
    form.appendChild(box);
  };
  inp.onblur=()=>setTimeout(closeSug,150);
  $("#add").onsubmit=e=>{e.preventDefault();const t=$("#new").value.trim();if(t){addToList(id,t);render();$("#new").focus()}};

  document.querySelectorAll("[data-q]").forEach(el=>el.onclick=()=>{const i=S.items[el.dataset.q],t=Qty.step(i.text,+el.dataset.dir);if(t){touch("items",{...i,text:t});render()}});
  document.querySelectorAll("[data-imv]").forEach(el=>el.onclick=()=>moveItemDialog(S.items[el.dataset.imv]));
  document.querySelectorAll("[data-e]").forEach(el=>el.onclick=()=>{const i=S.items[el.dataset.e];if(!i.done)itemEditor(i)});
  document.querySelectorAll("[data-vok]").forEach(el=>el.onclick=()=>{const i=S.items[el.dataset.vok];touch("items",{...i,check:false,until:null,c:Date.now()});render()});
  document.querySelectorAll("[data-c]").forEach(el=>el.onchange=()=>{const i=S.items[el.dataset.c];touch("items",{...i,done:el.checked});recordPurchase(i.text,i.list,el.checked);render()});
  document.querySelectorAll("[data-d]").forEach(el=>el.onclick=()=>{const i=S.items[el.dataset.d];touch("items",i.done?{...i,archived:true}:{...i,deleted:true});render()});
  const c=$("#clr");if(c)c.onclick=()=>{items.filter(i=>i.done).forEach(i=>touch("items",{...i,archived:true}));render()};
}
// Ajoute un article à une liste en cumulant avec un article identique non coché (« 1 oignon » + « 3 oignons » = « 4 oignons »).
// Ingrédient « placard » d'un repas : une seule ligne 🏠 « à vérifier » (sans quantité), gardée jusqu'au dernier repas qui en a besoin.
// Rien si on l'achète déjà (article normal) ; pas de doublon si deux repas en ont besoin.
const pantryOf=t=>Data.isPantry(S,pantryName(t));
// nom seul, sans la mesure : « 2 c. à soupe de moutarde » → « moutarde »
const MEASURE=/^(?:c\.?\s*[àa]\s*(?:s|c)\.?|c\.?\s*s\.?|c\.?\s*c\.?|cs|cc|càs|càc|cuil(?:l[eè]re)?s?\.?(?:\s*[àa]\s*(?:soupe|café|cafe))?|c\.?(?:\s*[àa]\s*(?:soupe|café|cafe))|pinc[ée]es?|sachets?|pots?|bocal|bocaux|tubes?|brins?|feuilles?|traits?|filets?|noisettes?|morceaux?|bâtons?|branches?|cubes?|tablettes?)\s+(?:de\s+|d['’]\s*)/i;
const pantryName=t=>{let nm=(Qty.parse(t).name||t).trim();for(let i=0;i<2;i++)nm=nm.replace(MEASURE,"");return nm};
function addCheck(list,text,until,mealKey){
  const nm=pantryName(text),k=Data.pantryKey(nm),kOf=i=>Data.pantryKey(pantryName(i.text));
  if(live(S.items).some(i=>!i.done&&!i.check&&kOf(i)===k))return[];
  const ex=live(S.items).find(i=>i.check&&!i.done&&kOf(i)===k);
  if(ex){const meals=mealKey&&!(ex.meals||[]).includes(mealKey)?[...(ex.meals||[]),mealKey]:ex.meals||[];
    if((until&&(!ex.until||until>ex.until))||meals!==ex.meals)touch("items",{...ex,until:until&&(!ex.until||until>ex.until)?until:ex.until,meals});return[ex.id]}
  const nid=uid();touch("items",{id:nid,list,text:nm.charAt(0).toUpperCase()+nm.slice(1),check:true,until:until||null,meals:mealKey?[mealKey]:[],done:false,c:Date.now()});return[nid];
}
// Ingrédients placard d'un repas → 🏠 « à vérifier » (aussi quand on n'ajoute pas les autres ingrédients aux listes)
function addPantry(r,mealKey){for(const g of r.ingredients||[])if(pantryOf(g.t))addCheck(defaultStore(g.t,g.store),g.t,mealKey&&mealKey.slice(0,10),mealKey)}
// Repas retiré ou changé : il ne demande plus ses « à vérifier » (la ligne disparaît si plus aucun repas n'en a besoin)
function dropChecks(mealKey){
  for(const i of live(S.items))if(i.check&&(i.meals||[]).includes(mealKey)){const meals=i.meals.filter(k=>k!==mealKey);
    touch("items",meals.length?{...i,meals}:{...i,deleted:true})}
}
function addToList(list,text){
  const p=Qty.parse(text);
  if(p.kind==="box")return addBoxes(list,p);
  const same=live(S.items).find(i=>i.list===list&&!i.done&&!i.check&&Qty.key(Qty.parse(i.text))===Qty.key(Qty.parse(text)));
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
// Ordre des rayons d'un magasin : celui choisi dans les réglages, puis les autres dans l'ordre par défaut.
function rayonOrder(list){const o=(S.lists[list]&&S.lists[list].order)||[];
  return [...o.map(x=>Rayons.byId[x]).filter(Boolean),...Rayons.list.filter(r=>!o.includes(r.id))]}
function rayonOf(text){const n=Qty.parse(text).name||text,k=Rayons.keyOf(n);return (S.aisles[k]&&!S.aisles[k].deleted&&S.aisles[k].rayon)||Rayons.guess(n)}
function itemEditor(i){
  const cur=rayonOf(i.text),ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Modifier l'article</h2>
   <input type="text" id="it" value="${esc(i.text)}" style="width:100%;margin-bottom:10px">
   <p class="mut">Rayon (retenu pour la prochaine fois)</p>
   <select id="ir" style="width:100%">${Rayons.list.map(r=>`<option value="${r.id}" ${r.id===cur?"selected":""}>${r.icon} ${esc(r.label)}</option>`).join("")}</select>
   <p class="mut">Liste</p>
   <select id="il" style="width:100%">${live(S.lists).sort(listSort).map(l=>`<option value="${l.id}" ${l.id===i.list?"selected":""}>${esc(l.name)}</option>`).join("")}</select>
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">Enregistrer</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  $("#ok").onclick=()=>{
    const t=$("#it").value.trim().slice(0,200)||i.text,r=$("#ir").value;
    const l=$("#il").value;
    if(l!==i.list&&S.lists[l])moveItem(i,l,t);
    else if(t!==i.text)touch("items",{...i,text:t});
    if(r!==rayonOf(t)){const k=Rayons.keyOf(Qty.parse(t).name||t);touch("aisles",{id:k,rayon:r})}
    close();render();
  };
}
// Change un article de liste (cumulé avec le même article s'il y est déjà). Les repas qui l'avaient ajouté
// le suivent dans sa nouvelle liste : supprimer le repas le retirera bien de là.
function moveItem(i,l,t){
  t=t||i.text;touch("items",{...i,deleted:true});const nids=addToList(l,t),k=Qty.key(Qty.parse(i.text));
  for(const m of live(S.meals))if(m.added&&m.added.ids.includes(i.id))touch("meals",{...m,added:{...m.added,
    ids:[...new Set(m.added.ids.map(x=>x===i.id?nids[0]:x))],
    items:m.added.items.map(g=>g.store===i.list&&Qty.key(Qty.parse(g.t))===k?{...g,store:l}:g)}});
}
// ⇄ sur un article : choix de la liste où l'envoyer
function moveItemDialog(i){
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Déplacer « ${esc(i.text)} »</h2><p class="mut">Vers la liste :</p>
   <div class="acts" style="flex-direction:column;gap:8px">${live(S.lists).sort(listSort).filter(l=>l.id!==i.list).map(l=>`<button class="btn sec" data-to="${l.id}">${esc(l.name)}</button>`).join("")}
   <button class="btn sec" id="no">Annuler</button></div></div>`;
  document.body.appendChild(ov);const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  ov.querySelectorAll("[data-to]").forEach(b=>b.onclick=()=>{moveItem(i,b.dataset.to);close();render();toast(`✓ Envoyé dans ${S.lists[b.dataset.to].name}`)});
}
// Magasin par défaut d'un article : fixé seulement après 3 achats consécutifs au même endroit,
// et il change si les 3 derniers achats se font ailleurs.
function recordPurchase(text,store,bought){
  const nm=Qty.parse(text).name||text,k=Rayons.keyOf(nm),o=S.stores[k]||{id:k,last:[],def:null,n:0};
  let last=[...o.last];
  if(bought)last=[...last,store].slice(-3);
  else{const j=last.lastIndexOf(store);if(j>=0)last.splice(j,1)} // case décochée : on annule cet achat
  const def=last.length===3&&last.every(s=>s===last[0])?last[0]:o.def;
  touch("stores",{...o,id:k,last,def,name:nm,n:Math.max(0,(o.n||0)+(bought?1:-1))}); // garde le nom : proposé à la saisie, même des mois après
}
const defaultStore=(text,fallback)=>{const s=S.stores[Rayons.keyOf(Qty.parse(text).name||text)];return (s&&s.def&&S.lists[s.def]&&s.def)||fallback||"auchan"};
// Articles cochés depuis plus de 2 h : les courses sont finies, on les masque (gardés en historique).
const DONE_TTL=2*3600*1000;
const HISTORY_TTL=30*24*3600*1000; // historique des achats gardé 30 jours
function purgeDone(){
  let n=0;live(S.items).forEach(i=>{
    if(i.done&&!i.archived&&Date.now()-i.ts>DONE_TTL){touch("items",{...i,archived:true});n++}       // masqué après 2 h
    else if(i.archived&&Date.now()-i.ts>HISTORY_TTL)touch("items",{...i,deleted:true});              // oublié après 30 j
    else if(i.check&&i.until&&i.until<todayKey()){touch("items",{...i,deleted:true});n++}            // 🏠 à vérifier : repas passés
  });
  if(n&&tab!=="menus"&&tab!=="settings")safeRender();
}
// Retire une quantité d'un article non coché (supprimé s'il tombe à zéro).
function removeFromList(list,text){
  const p=Qty.parse(text),k=Qty.key(p),pk=Data.pantryKey(pantryName(text));
  const ck=live(S.items).find(i=>i.list===list&&i.check&&Data.pantryKey(pantryName(i.text))===pk);
  if(ck)return; // 🏠 à vérifier : retiré avec son repas (dropChecks)
  const same=live(S.items).filter(i=>i.list===list&&!i.done&&!i.check&&Qty.key(Qty.parse(i.text))===k).sort((a,b)=>Qty.parse(a.text).n-Qty.parse(b.text).n);
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
  const m=S.meals[from],nx=new Date(from.slice(0,10)+"T12:00");nx.setDate(nx.getDate()+1);
  const slots=[slotOptions(from,nx.toISOString().slice(0,10)+"-"+from.slice(-1)," (échange)")];
  const was=m.servings||BASE,min=bought(m)?was:1; // ingrédients achetés : on ne peut qu'augmenter
  let n=was;
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Déplacer « ${esc(m.text)} »</h2>
   <select id="mvto" style="width:100%">${slots.join("")}</select>
   <div class="serv"><span>Pour</span><button class="btn sec" id="mn">−</button><b id="nn">${n}</b><button class="btn sec" id="pl">+</button><span>personnes</span></div>
   ${bought(m)?`<p class="mut">Ingrédients déjà achetés pour ${was} : on peut seulement augmenter, la différence sera ajoutée aux listes.</p>`:""}
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">Déplacer</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  const setN=v=>{n=Math.max(min,Math.min(30,v));$("#nn").textContent=n};
  $("#mn").onclick=()=>setN(n-1);$("#pl").onclick=()=>setN(n+1);
  $("#ok").onclick=()=>{
    const to=$("#mvto").value,o=S.meals[to];
    touch("meals",{...m,key:to});
    touch("meals",o&&o.text?{...o,key:from}:{key:from,text:"",servings:m.servings||BASE});
    // les « à vérifier » suivent aussi leurs repas
    const sw=k=>k===from?to:k===to?from:k.startsWith(from)&&Data.isSecond(k)?to+k.slice(from.length):k.startsWith(to)&&Data.isSecond(k)?from+k.slice(to.length):k;
    for(const i of live(S.items))if(i.check&&(i.meals||[]).some(k=>sw(k)!==k))touch("items",{...i,meals:i.meals.map(sw)});
    for(let i=2;i<=MAX_DISHES;i++){ // les plats en plus suivent leur repas
      const s2=S.meals[from+i],t2=S.meals[to+i],on=x=>x&&!x.deleted;
      if(!on(s2)&&!on(t2))continue;
      touch("meals",on(s2)?{...s2,key:to+i}:{key:to+i,text:"",deleted:true});
      touch("meals",on(t2)?{...t2,key:from+i}:{key:from+i,text:"",deleted:true});
    }
    close();render();
    if(n===was)return;
    // nombre de personnes changé : mêmes règles que − / + sur le repas
    const moved=S.meals[to],hasRecipe=!!recipeOf(moved.text);
    if(bought(moved))extraDialog(to,n);
    else if(moved.added&&hasRecipe)ingredientsDialog(moved.text,to,n);
    else{touch("meals",{...moved,servings:n});render()}
  };
}
// Créneaux proposés (d'aujourd'hui à 4 semaines) : jamais un jour passé ; les créneaux occupés sont signalés.
function slotOptions(exclude,selected,busyLabel){
  const today=new Date();today.setHours(12);const out=[];
  for(let d=0;d<=28;d++){const x=new Date(today);x.setDate(today.getDate()+d);const k=x.toISOString().slice(0,10);
    for(const [s,l] of [["m","midi"],["s","soir"]]){const key=k+"-"+s;if(key===exclude)continue;const o=S.meals[key];
      out.push(`<option value="${key}" ${key===selected?"selected":""}>${x.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})} ${l}${o&&o.text?" — "+esc(o.text)+busyLabel:""}</option>`)}}
  return out.join("");
}
// Prochain créneau libre à partir d'aujourd'hui.
function nextFreeSlot(){const t=new Date();t.setHours(12);
  for(let d=0;d<=28;d++){const x=new Date(t);x.setDate(t.getDate()+d);const k=x.toISOString().slice(0,10);
    for(const s of ["m","s"]){const o=S.meals[k+"-"+s];if(!o||!o.text)return k+"-"+s}}
  return t.toISOString().slice(0,10)+"-s"}
// « + » sur une recette : on choisit le jour, le repas est créé puis la fenêtre des ingrédients s'ouvre.
function planRecipe(r){
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Ajouter « ${esc(r.name)} » aux menus</h2>
   <select id="plto" style="width:100%">${slotOptions(null,nextFreeSlot()," (remplace)")}</select>
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">Ajouter</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  $("#ok").onclick=()=>{
    const key=$("#plto").value,o=S.meals[key];
    if(o&&o.text){
      if(bought(o)){alert(`Les ingrédients de « ${o.text} » ont déjà été achetés : choisissez un autre créneau.`);return}
      if(!confirm(`Remplacer « ${o.text} » ?`))return;
      if(o.added)o.added.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,o.added.n/(o.added.b||BASE),o.added.b||BASE)));
    }
    const n=+LS.defN||r.serves||BASE;
    touch("meals",{key,text:r.name,servings:n});applyCompanion(key);close();
    tab=LS.tab="menus";const d=new Date(key.slice(0,10)+"T12:00"),m=monday();LS.wk=(+LS.wk||0)+Math.floor((d-m)/(7*864e5)+1e-9);
    render();ingredientsDialog(r.name,key);
  };
}
// Repas déjà acheté pour prev.n personnes : on passe à n et on n'achète que la différence.
function extraDialog(key,n){
  const m=S.meals[key],prev=m.added,r=recipeOf(m.text);
  if(!r){touch("meals",{...m,servings:n});render();return}
  const B=r.serves||BASE,lists=live(S.lists).sort(listSort);
  const opts=sel=>lists.map(l=>`<option value="${l.id}" ${l.id===sel?"selected":""}>${esc(l.name)}</option>`).join("");
  const was=t=>prev.items.find(g=>g.t===t);
  const diff=(t,k)=>{const a=Qty.parse(Qty.buy(t,prev.n/B,B)),b=Qty.parse(Qty.buy(t,k/B,B));
    if(a.n==null||b.n==null||Qty.key(a)!==Qty.key(b))return Qty.buy(t,k/B,B);
    return b.n-a.n>0?Qty.format({...b,n:b.n-a.n}):""};
  const ov=document.createElement("div");ov.className="ov";
  const rowH=g=>`<div class="row ing-row ${was(g.t)?"":"warn"}" data-base="${esc(g.t)}"><input type="checkbox" ${was(g.t)?"checked":""}><input type="text" class="ing" value=""><span class="stp sm"><button type="button" data-st="-1" aria-label="Moins">−</button><button type="button" data-st="1" aria-label="Plus">+</button></span><select>${opts(was(g.t)?was(g.t).store:defaultStore(g.t,g.store))}</select><p class="homewarn">${was(g.t)?"":`⚠ Vous l'aviez à la maison pour ${prev.n} personne${prev.n>1?"s":""}. Cochez s'il en manque.`}</p></div>`;
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>${esc(m.text)}</h2>
   <p class="okmsg">✓ Déjà acheté pour ${prev.n} personne${prev.n>1?"s":""}. Seule la différence sera ajoutée aux listes.</p>
   <div class="serv"><span>Pour</span><button class="btn sec" id="mn">−</button><b id="nn">${n}</b><button class="btn sec" id="pl">+</button><span>personnes</span></div>
   <div id="ings" class="card">${r.ingredients.filter(i=>!pantryOf(i.t)).map(rowH).join("")}</div>
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">Ajouter la différence</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  const setN=v=>{n=Math.max(prev.n,Math.min(30,v));$("#nn").textContent=n;
    ov.querySelectorAll(".ing-row").forEach(el=>{el.querySelector(".ing").value=diff(el.dataset.base,n)})};
  setN(n);
  $("#mn").onclick=()=>setN(n-1);$("#pl").onclick=()=>setN(n+1);
  $("#ings").addEventListener("click",e=>{const b=e.target.closest("[data-st]");if(!b)return;
    const row=b.closest(".ing-row"),i=row.querySelector(".ing"),t=Qty.step(i.value||Qty.buy(row.dataset.base,1/B,B),+b.dataset.st);
    if(t){i.value=t;row.querySelector("[type=checkbox]").checked=true}});
  $("#ok").onclick=()=>{
    const ids=new Set(prev.ids||[]),items=[...prev.items];
    ov.querySelectorAll(".ing-row").forEach(el=>{
      const v=el.querySelector(".ing").value.trim(),store=el.querySelector("select").value,t=el.dataset.base;
      if(!el.querySelector("[type=checkbox]").checked||!v)return;
      addToList(store,v).forEach(x=>ids.add(x));
      if(!was(t))items.push({t,store});
    });
    touch("meals",{...m,servings:n,added:{...prev,n,items,ids:[...ids],b:prev.b||B}});
    close();render();
  };
}
// Ajoute d'un coup les ingrédients de la recette d'un repas (magasin habituel, cumul) et s'en souvient.
function addMealIngredients(key){
  const m=S.meals[key],r=m&&recipeOf(m.text);if(!r)return;
  const B=r.serves||BASE,n=m.servings||BASE,ids=new Set(),items=[];
  for(const g of r.ingredients){const store=defaultStore(g.t,g.store),t=Qty.buy(g.t,n/B,B);(pantryOf(g.t)?addCheck(store,t,key.slice(0,10),key):addToList(store,t)).forEach(x=>ids.add(x));items.push({t:g.t,store})}
  touch("meals",{...S.meals[key],added:{n,items,ids:[...ids],b:B}});
}
const slotName=k=>new Date(k.slice(0,10)+"T12:00").toLocaleDateString("fr-FR",{weekday:"long"})+(/-m\d*$/.test(k)?" midi":" soir")+(Data.isSecond(k)?" (2ᵉ plat)":"");
// 💡 : un plat pour chaque soir libre et pour les midis du week-end de la semaine affichée.
// Chaque ligne a son nombre de personnes ; × retire une suggestion ; ↻ en tire une autre.
function suggestDialog(){
  const today=todayKey(),mon=monday().toISOString().slice(0,10),rows=[];
  for(let i=0;i<7;i++){const ymd=Data.addDays(mon,i);if(ymd<today)continue;
    for(const s of i>=5?["m","s"]:["s"]){const key=ymd+"-"+s;if(!(S.meals[key]&&S.meals[key].text))rows.push({key,n:+LS.defN||BASE})}}
  if(!rows.length){alert("Plus aucun créneau libre cette semaine : passez à la semaine suivante avec ›.");return}
  // les propositions comptent comme prévues (pas deux fois le même plat, « vendredi ou samedi » respecté)
  const withProposals=except=>({...S,meals:{...S.meals,...Object.fromEntries(rows.filter(r=>r.sug&&r!==except).map(r=>[r.key,{key:r.key,text:r.sug.name,ts:0}]))}});
  // variété : pas deux plats du même type dans la semaine, sauf celui de l'habitude du créneau
  const pickFor=(r,seen)=>{
    const used=new Set(rows.filter(x=>x!==r&&x.sug&&!x.off).map(x=>Data.typeOf(x.sug.name)).filter(Boolean));
    const c=Data.suggest(withProposals(r),today,12,seen,undefined,r.key);
    r.sug=c.find(x=>x.habit||!used.has(Data.typeOf(x.name)))||c[0]||null;
  };
  // créneaux d'habitude d'abord, puis les autres dans un ordre tiré au hasard
  // (s'il manque des recettes, ce ne sont pas toujours les mêmes créneaux qui restent vides)
  const others=rows.filter(r=>!Data.habitsFor(S,r.key).length).map(r=>[Math.random(),r]).sort((x,y)=>x[0]-y[0]).map(x=>x[1]);
  for(const r of [...rows.filter(r=>Data.habitsFor(S,r.key).length),...others])pickFor(r,[]);
  const live_=()=>rows.filter(r=>r.sug&&!r.off);
  // plat qui s'accompagne d'habitude d'un 2e plat (appris) : on le propose, d'un autre type, le plat principal ne change pas
  const side=(r,skip)=>{
    r.comp=r.sug?Data.companionFor(S,r.sug.name,today):null;if(!r.comp){r.side=null;return}
    if(skip===undefined){r.side=null;return} // pas de plat présaisi : « à choisir », ↻ donne une idée
    const taken=[r.sug.name,...rows.filter(x=>x!==r&&x.side).map(x=>x.side.name),...(skip||[])];
    const fits=x=>Data.typeOf(x.name)!==Data.typeOf(r.sug.name);
    // de préférence un plat pas encore prévu cette semaine ; sinon on accepte d'en reprendre un
    r.side=Data.suggest(withProposals(r),today,12,taken,undefined,r.key+"2").find(fits)
      ||Data.suggest(S,today,12,taken,undefined,r.key+"2").find(fits)||null;
  };
  for(const r of rows)side(r);
  if(!live_().length){alert("Aucune recette à suggérer pour l'instant : ajoutez des recettes dans ⚙︎ Réglages.");return}
  const label=k=>new Date(k.slice(0,10)+"T12:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric"})+(k.endsWith("-m")?" midi":" soir");
  const note=x=>(x.habit?typeById(x.habit).icon+" comme d'habitude · ":"")+(x.days==null?"jamais cuisiné":`il y a ${x.days} jours`);
  const rowH=(r,i)=>r.off||!r.sug?"":`<div class="sugrow" data-i="${i}">
    <div class="sugday">${esc(label(r.key))}</div>
    <div class="sugtop"><span class="t"><b>${esc(r.sug.name)}</b><br><small class="mut">${note(r.sug)}</small></span>
      <button type="button" class="pill" data-re="${i}" aria-label="Autre suggestion">↻</button><button type="button" class="x" data-rm="${i}" aria-label="Retirer">×</button></div>
    <div class="stp"><button type="button" data-n="${i}" data-d="-1" aria-label="Moins">−</button><b>${r.n}</b><button type="button" data-n="${i}" data-d="1" aria-label="Plus">+</button><em>pers.</em></div>
    ${r.comp?`<div class="side"><span class="t">➕ 2ᵉ plat : <b>${r.side?esc(r.side.name):"à choisir"}</b> <small class="mut">${r.comp.n} pers.</small></span><button type="button" class="pill" data-re2="${i}" aria-label="Autre 2e plat">↻</button></div>`:""}</div>`;
  const ov=document.createElement("div");ov.className="ov";
  const paint=()=>{ov.querySelector("#sugs").innerHTML=rows.map(rowH).join("")||`<div class="empty">Plus aucune suggestion</div>`;
    ov.querySelector("#ok").textContent=`Placer ${live_().length} plat${live_().length>1?"s":""}`};
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>💡 Suggestions</h2>
   <p class="mut">De saison, pas cuisinés depuis plus d'un mois. Ensuite, les ingrédients s'affichent repas par repas : vous cochez ce qu'il faut acheter.</p>
   <div class="card" id="sugs"></div>
   ${rows.some(r=>!r.sug)?`<p class="mut">${rows.filter(r=>!r.sug).length} créneau${rows.filter(r=>!r.sug).length>1?"x":""} sans suggestion : plus de recettes donneront plus de choix.</p>`:""}
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok"></button></div></div>`;
  document.body.appendChild(ov);paint();
  const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  const seen=new Set(rows.filter(r=>r.sug).map(r=>r.sug.name));
  $("#sugs").addEventListener("click",e=>{
    const re=e.target.closest("[data-re]"),rm=e.target.closest("[data-rm]"),nb=e.target.closest("[data-n]"),re2=e.target.closest("[data-re2]");
    if(re2){const r=rows[+re2.dataset.re2],prev=r.side;side(r,prev?[prev.name]:[]);if(!r.side)r.side=prev;paint();return}
    if(re){const r=rows[+re.dataset.re];
      const prev=r.sug;pickFor(r,[...seen]);
      if(!r.sug){seen.clear();live_().forEach(x=>x!==r&&seen.add(x.sug.name));seen.add(prev.name);pickFor(r,[...seen])}
      if(!r.sug)r.sug=prev;seen.add(r.sug.name);side(r)}
    if(rm)rows[+rm.dataset.rm].off=true;
    if(nb){const r=rows[+nb.dataset.n];r.n=Math.max(1,Math.min(30,r.n+ +nb.dataset.d))}
    if(re||rm||nb)paint();
  });
  $("#ok").onclick=()=>{
    const keep=live_();if(!keep.length){close();return}
    const queue=[];
    for(const r of keep){touch("meals",{key:r.key,text:r.sug.name,servings:r.n});queue.push(r.key);
      if(r.comp){const k2=addSecond(r.key,r.comp.n,r.side?r.side.name:"",true);if(k2&&r.side)queue.push(k2)}}
    close();render();
    // puis la fenêtre des ingrédients, repas par repas (« Ajouter aux listes » ou « Ne pas ajouter aux listes » passe au suivant)
    const next=i=>{if(i<queue.length)ingredientsDialog(S.meals[queue[i]].text,queue[i],null,()=>next(i+1),`Repas ${i+1}/${queue.length} · ${slotName(queue[i])}`)};
    next(0);
  };
}
// Habitudes apprises : ajoutées en silence (une fois par jour), oubliées après 24 mois sans être suivies ; l'admin les voit dans Réglages → Habitudes.
// Une habitude retirée à la main n'est pas réapprise avant 3 mois.
function runLearning(){
  if(LS.learnDay===todayKey())return;LS.learnDay=todayKey();
  const {add,drop,seen,change}=Data.learnHabits(S,todayKey());
  for(const c of change){const h=S.habits[c.id];if(h)touch("habits",{...h,...c,adj:todayKey()})} // l'habitude suit vos nouvelles habitudes
  // dernière fois suivie (pour l'oubli à 12 mois) ; date de création si aucune
  for(const [id,ymd] of Object.entries(seen))if(S.habits[id]&&(S.habits[id].last||"")<ymd)touch("habits",{...S.habits[id],last:ymd});
  for(const h of live(S.habits))if(h.state==="on"&&!h.last&&!h.since)touch("habits",{...h,since:todayKey()});
  for(const c of add){
    const same=live(S.habits).find(h=>h.type===c.type&&h.slot===c.slot&&h.days.some(d=>c.days.includes(d)));
    if(same&&(same.state==="on"||Date.now()-same.ts<90*864e5))continue;
    touch("habits",{id:same?same.id:"h-"+c.type+"-"+c.slot+"-"+c.days.join(""),days:c.days,slot:c.slot,type:c.type,auto:true,state:"on",since:todayKey()});
  }
  for(const id of drop)touch("habits",{...S.habits[id],state:"off",auto:true});
}
const DAYS=["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
const habitWhen=h=>"le "+h.days.map(d=>DAYS[d-1]).join(" ou ")+(h.slot==="m"?" midi":" soir");
const typeById=id=>id==="recette"?{icon:"📖",label:"Recette"}:Data.TYPES.find(t=>t.id===id)||{icon:"🍽️",label:id};
// libellé d'une habitude : la recette visée, sinon le type de plat
const habitWhat=h=>h.recipe?{icon:"📖",label:(S.recipes[h.recipe]&&!S.recipes[h.recipe].deleted)?S.recipes[h.recipe].name:"Recette supprimée"}:typeById(h.type);
// Plats en plus d'un repas (clé du repas + 2, 3… jusqu'à MAX_DISHES), ajoutés vides : l'utilisateur choisit (saisie ou 💡).
// Le plat principal garde son nombre de personnes.
const MAX_DISHES=10;
const extrasOf=key=>{const out=[];for(let i=2;i<=MAX_DISHES;i++){const m=S.meals[key+i];if(m&&!m.deleted)out.push(key+i)}return out};
function addSecond(key,n,name,noIng){ // noIng : ne pas ajouter ses ingrédients tout de suite
  let i=2;while(i<=MAX_DISHES&&S.meals[key+i]&&!S.meals[key+i].deleted)i++;
  if(i>MAX_DISHES)return null;
  const k2=key+i;name=name||"";
  touch("meals",{key:k2,text:name,servings:n||1});
  if(name&&!noIng)addMealIngredients(k2);
  return k2;
}
// Retire les plats en plus d'un repas (et leurs ingrédients), sauf ceux déjà achetés.
function removeSecond(key){
  for(const k2 of extrasOf(key)){const s=S.meals[k2];if(bought(s))continue;dropChecks(k2);
    if(s.added)s.added.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,s.added.n/(s.added.b||BASE),s.added.b||BASE)));
    touch("meals",{key:k2,text:"",deleted:true})}
}
// Plat qui s'accompagne d'habitude d'un 2e plat (appris dans l'historique) : on l'ajoute tout seul.
function applyCompanion(key){
  const m=S.meals[key];if(!m||!m.text||Data.isSecond(key))return;
  if(extrasOf(key).length)return;
  const c=Data.companionFor(S,m.text,todayKey());if(c)addSecond(key,c.n);
}
// Recette d'un plat : une recette enregistrée, sinon une suite d'aliments (« viande rouge, haricots verts »).
const recipeOf=name=>name&&(live(S.recipes).find(x=>x.name.toLowerCase()===name.toLowerCase())||Data.suite(S,name))||null;
function monday(){const d=new Date();d.setHours(12);d.setDate(d.getDate()-((d.getDay()+6)%7)+7*(+LS.wk||0));return d}
const LEGACY_TS=1791714864000; // mise en ligne du suivi des ajouts (v29)
const BASE=4,VERSION="v148";
function fmt(x){return String(Math.round(x*100)/100).replace(".",",")}
function scaleText(t,f){
  const m=t.match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(.*)$/);
  if(!m||f===1)return t;
  let n=m[1];
  if(n.includes("/")){const p=n.trim().split(/\s+/);const fr=p.pop().split("/");n=(p[0]?+p[0]:0)+fr[0]/fr[1]}else n=parseFloat(n.replace(",","."));
  const rest=m[2];
  return fmt(n*f)+(rest?" "+rest:"");
}
// Date du jour au format des clés de repas (AAAA-MM-JJ), à midi pour éviter les décalages UTC.
const todayKey=()=>{const x=new Date();x.setHours(12,0,0,0);return x.toISOString().slice(0,10)};
// Un créneau du planning. Jour passé : plus rien à compléter, le repas reste visible et déplaçable.
function slotHtml(key,label,past){
  const e=S.meals[key]||{},n=e.servings||BASE,b=bought(e),extras=extrasOf(key),has2=extras.length>=MAX_DISHES-1; // has2 : plus de place pour un plat de plus
  const lock=past?(e.text?'readonly title="Jour passé"':"disabled"):b?'readonly title="Ingrédients déjà achetés : déplacez le repas avec ⇄"':"";
  // la case prend toute la largeur : × (ou 🔒) passe dans la rangée de boutons du dessous ; seul 💡 reste à droite d'une case vide
  const right=!past&&!e.text?`<button class="pill bulb" data-bulb="${key}" aria-label="Suggestions">💡</button>`:"";
  const sub=!e.text?"":`<div class="sub">${
    past?`<span class="mut sm">${n} pers.${b?" · acheté":""}</span>`
    :b?`<div class="stp"><b>${n}</b><button data-sp="${key}" aria-label="Plus">+</button><em>pers. · acheté</em></div>`
    :`<div class="stp"><button data-sm="${key}" aria-label="Moins">−</button><b>${n}</b><button data-sp="${key}" aria-label="Plus">+</button><em>pers.</em></div><button class="pill" data-i="${key}" aria-label="Ingrédients" title="Ingrédients">🥕</button>`
  }${!past&&!has2?`<button class="pill add2" data-add2="${key}" aria-label="Ajouter un plat" title="Ajouter un plat">🍽️</button>`:""}<button class="pill" data-mv="${key}" aria-label="Déplacer">⇄</button>${past?"":b?`<button class="lock" data-del="${key}" data-force="1" title="Ingrédients déjà achetés" aria-label="Supprimer quand même">🔒</button>`:`<button class="x" data-del="${key}" aria-label="Supprimer le repas">×</button>`}</div>`;
  return `<div class="slotw ${past?"past":""}"><div class="slot"><span class="lbl">${label}</span><span class="tagwrap ${tagsHtml(e.text)?"has":""}"><input type="text" data-m="${key}" placeholder="${past?"—":"Choisir un plat…"}" autocomplete="off" autocapitalize="sentences" value="${esc(e.text||"")}" ${lock}>${tagsHtml(e.text)}</span>${right}</div>${sub}</div>${extras.map((k2,i)=>secondHtml(k2,S.meals[k2],past,i+2)).join("")}`;
}
// 2e plat d'un repas (pour qui, plat, personnes, ingrédients) ; il se déplace avec le repas principal.
// Suite d'aliments : étiquettes colorées par-dessus le champ (le texte réapparaît quand on le touche).
const tagsHtml=text=>{const real=live(S.recipes).some(r=>r.name.toLowerCase()===String(text||"").toLowerCase());
  if(real)return `<span class="tags" aria-hidden="true"><i class="rcp">📖 <b>${esc(text)}</b></i></span>`; // recette : livre + nom en gras
  const tags=text?Data.suiteTags(S,text):null;
  return tags?`<span class="tags" aria-hidden="true">${tags.map(x=>`<i class="tag ${x.cat}">${x.cat==="rcp"?"📖 ":""}${esc(x.t.charAt(0).toUpperCase()+x.t.slice(1))}</i>`).join("")}</span>`:""};
function secondHtml(k2,e,past,pos){ // pos : rang affiché (2ᵉ, 3ᵉ…), sans trou si un plat a été retiré
  // comme un repas : case pleine largeur, puis personnes, 🥕 et × sur la rangée du dessous
  const n=e.servings||1,b=bought(e);
  const lock=past||b?"readonly":"";
  // vide : 💡 et × à droite de la case (pas de rangée du dessous)
  const right=!past&&!b&&!e.text?`<button class="pill bulb" data-bulb="${k2}" aria-label="Suggestions">💡</button><button class="x" data-del="${k2}" aria-label="Retirer ce plat">×</button>`:"";
  const sub=!e.text?"":past?`<div class="sub"><span class="mut sm">${n} pers.</span></div>`
    :`<div class="sub">${b?`<div class="stp"><b>${n}</b><em>pers. · acheté</em></div><button class="lock" data-del="${k2}" data-force="1" title="Ingrédients déjà achetés" aria-label="Supprimer quand même">🔒</button>`
    :`<div class="stp"><button data-sm="${k2}" aria-label="Moins">−</button><b>${n}</b><button data-sp="${k2}" aria-label="Plus">+</button><em>pers.</em></div><button class="pill" data-i="${k2}" aria-label="Ingrédients" title="Ingrédients">🥕</button><button class="x" data-del="${k2}" aria-label="Retirer ce plat">×</button>`}</div>`;
  return `<div class="slotw second ${past?"past":""}"><div class="slot"><span class="lbl">+ ${pos||2}ᵉ plat</span><span class="tagwrap ${tagsHtml(e.text)?"has":""}"><input type="text" data-m="${k2}" placeholder="${past?"—":"Autre plat…"}" autocomplete="off" autocapitalize="sentences" value="${esc(e.text||"")}" ${lock}>${tagsHtml(e.text)}</span>${right}</div>${sub}</div>`;
}
function renderMenus(){
  $("#title").innerHTML=`Menus <span class="hicon">${MENU_ICON}</span>`;
  const m=monday(),today=todayKey();
  const end=new Date(m);end.setDate(m.getDate()+6);
  const f=d=>d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
  let h=`<div class="wk"><button class="btn sec" id="pv">‹</button><div>${f(m)} – ${f(end)}</div><button class="btn sec" id="sugg" aria-label="Suggestions de plats">💡</button><button class="btn sec" id="nx">›</button></div>`;
  for(let n=0;n<7;n++){
    const d=new Date(m);d.setDate(m.getDate()+n);const k=d.toISOString().slice(0,10);
    const wd=d.toLocaleDateString("fr-FR",{weekday:"long"}); // jour en en-tête de la carte : « lundi 5 »
    h+=`<section class="day ${k===today?"today":""}"><div class="dh"><b>${wd}</b><small>${d.getDate()}</small></div><div class="slots">`+
      [["m","Midi"],["s","Soir"]].map(([s,l])=>slotHtml(k+"-"+s,l,k<today)).join("")+`</div></section>`;
  }
  $("#view").innerHTML=h;
  const norm=Data.plain;
  const names=()=>{const seen=new Set(),out=[];
    for(const [t,recipe] of [...live(S.recipes).map(r=>[r.name,true]),...live(S.meals).map(m=>[m.text,false]).filter(x=>x[0])]){const k=norm(t);if(!seen.has(k)){seen.add(k);out.push({t,recipe})}}
    // écarte les fragments saisis à moitié (ex. « Pom » quand « Pommes de terre… » existe)
    return out.filter(x=>x.recipe||!out.some(y=>y!==x&&norm(y.t).length>norm(x.t).length&&norm(y.t).startsWith(norm(x.t))))};
  const commit=(el,t,quiet)=>{ // quiet : enregistre le repas sans ouvrir la fenêtre des ingrédients
    const key=el.dataset.m,o=S.meals[key]||{};
    if(key.slice(0,10)<todayKey()){el.value=o.text||"";return}
    // plat remplacé ou effacé : on retire des listes ce que l'ancien plat y avait ajouté
    if(bought(o)&&norm(o.text||"")!==norm(t)){
      el.value=o.text;
      alert(`Les ingrédients de « ${o.text} » ont déjà été achetés : ce repas ne peut pas être supprimé ni remplacé. Utilisez ⇄ pour le déplacer.`);
      return;
    }
    const dropOld=()=>{if(norm(o.text||"")===norm(t))return;dropChecks(key);
      if(o.added)o.added.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,o.added.n/(o.added.b||BASE),o.added.b||BASE)))};
    dropOld();
    if(!t){if(o.text)touch("meals",{key,text:"",servings:o.servings||BASE});if(!Data.isSecond(key))removeSecond(key);render();return}
    t=t.replace(/[\s,+]+$/,"");
    const known=live(S.recipes).find(r=>norm(r.name)===norm(t));
    touch("meals",{key,text:known?known.name:t,servings:o.servings||(Data.isSecond(key)?1:+LS.defN||BASE)});
    applyCompanion(key);render();if(quiet)return;
    // Entrée pour finir : chaque aliment inconnu de ce repas est décrit tout de suite (famille, quantité, unité, magasin ;
    // « Plus tard » : il reste une simple ligne et sera redemandé), puis la fenêtre des ingrédients s'ouvre avec les quantités.
    const waiting=Data.unknownFoods(S,t).map(p=>({id:"c-"+uid(),label:p.charAt(0).toUpperCase()+p.slice(1)}));
    const next=i=>i<waiting.length?foodEditor(null,waiting[i],()=>next(i+1),`${i+1}/${waiting.length}`):ingredientsDialog(known?known.name:t,key);
    next(0);
  };
  const clearSug=()=>document.querySelectorAll(".sug").forEach(x=>x.remove());
  document.querySelectorAll("[data-m]").forEach(el=>{
    const showBox=hits=>{
      clearSug();if(!hits.length)return;
      const box=document.createElement("div");box.className="sug";
      box.innerHTML=hits.map(x=>`<button type="button" data-t="${esc(x.t)}" ${x.food?'data-food="1"':""}>${ico(x.icon)} ${esc(x.food?x.t.split(/[,+]/).pop().trim():x.t)}${x.note?` <small class="mut">${esc(x.note)}</small>`:""}</button>`).join("");
      // iPhone : sans ça, toucher une suggestion ferme d'abord le champ (et validait le texte à moitié tapé)
      box.addEventListener("touchstart",e=>{el._pick=Date.now();e.preventDefault()},{passive:false});box.onmousedown=e=>e.preventDefault();
      box.onpointerdown=e=>{const b=e.target.closest("button");if(!b)return;e.preventDefault();el._pick=Date.now();
        if(b.dataset.food){addChip(b.dataset.t.split(/[,+]/).pop().trim());clearSug();el.focus();return} // pastille, puis l'aliment suivant
        // plat déjà fait qui est une suite d'aliments (« Steak haché », « Poulet, riz ») : en pastilles, on continue la saisie
        const t=b.dataset.t,tags=live(S.recipes).some(r=>norm(r.name)===norm(t))?null:Data.suiteTags(S,t);
        if(tags)tags.forEach(x=>addChip(x.t));else addChip(t);clearSug();el.focus()};
      el.closest(".slotw").appendChild(box);
    };
    // créneau vide touché sans rien taper : les meilleures suggestions (saison, pas faites depuis un mois)
    el.tips=()=>{if(el.readOnly||el.disabled||el.value.trim())return;
      showBox(Data.suggest(S,todayKey(),5,[],undefined,el.dataset.m).map(x=>({t:x.name,icon:x.habit?typeById(x.habit).icon:"💡",note:x.days==null?"jamais fait":`il y a ${x.days} j`})))};
    // Suite d'aliments en cours de saisie : pastilles devant le champ, Entrée valide l'aliment et passe au suivant.
    el._items=[];
    const drawChips=()=>{const w=el.parentElement;let c=w.querySelector(".chips");
      w.classList.remove("has");w.querySelector(".tags")?.remove(); // en saisie : plus d'ancien affichage par-dessus (il doublait les pastilles)
      if(!c){c=document.createElement("span");c.className="chips";w.insertBefore(c,el)}
      w.classList.toggle("editing",el._items.length>0);el.placeholder=el._items.length?"Ajouter…":el.dataset.ph;
      c.innerHTML=el._items.map((t,i)=>{const r=live(S.recipes).some(x=>norm(x.name)===norm(t)),f=Data.foodFor(t);return `<i class="tag ${r?"rcp":f?f.cat:"autre"}">${r?"📖 ":""}${esc(t.charAt(0).toUpperCase()+t.slice(1))}<b data-ci="${i}">×</b></i>`}).join("");
      c.onpointerdown=e=>{const x=e.target.closest("[data-ci]");e.preventDefault();if(x){el._items.splice(+x.dataset.ci,1);drawChips()}el.focus()}};
    const addChip=t=>{t=t.trim();if(!t)return;el._items.push(t);el.value="";drawChips();
      setTimeout(()=>{if(!el._finish&&document.activeElement!==el)el.focus()},60)}; // l'iPhone peut avoir quitté le champ : on y revient
    el.dataset.ph=el.placeholder;
    el.onfocus=()=>{clearTimeout(el._done);if(el._items.length){drawChips();return} // retour dans le champ : on continue la saisie
      el._orig=el.value;const v=el.value.trim(),tags=live(S.recipes).some(r=>norm(r.name)===norm(v))?[{t:v}]:Data.suiteTags(S,el.value);
      if(tags&&!el.readOnly&&!el.disabled){el._items=tags.map(x=>x.t);el.value="";drawChips()}};
    el.onkeydown=e=>{
      if(e.key==="Backspace"&&!el.value&&el._items.length){el._items.pop();drawChips();e.preventDefault();return}
      if(e.key!=="Enter")return;e.preventDefault();el._enter=true; // Entrée déclenche aussi « change » : ignoré, traité ici
      el._enter=false;const seg=el.value.trim();
      if(seg){const r=live(S.recipes).find(x=>norm(x.name)===norm(seg));addChip(r?r.name:seg);clearSug();return}
      el._pick=0;clearSug();el._finish=true;el.blur()};
    el.oninput=()=>{
      const v=el.value,q=norm(v.trim());if(!q){clearSug();return}
      // suite d'aliments en cours (après une virgule ou un +) : on propose seulement des aliments pour le dernier morceau
      const cut=el._items.length?-1:Math.max(v.lastIndexOf(","),v.lastIndexOf("+")),seg=norm(v.slice(cut+1).trim()),head=cut>=0?v.slice(0,cut+1).trimEnd()+" ":"";
      const foods=seg?Data.allFoods().flatMap(f=>f.words.filter(w=>w.startsWith(seg)||w.includes(" "+seg)).slice(0,1).map(w=>({f,w}))).slice(0,4)
        .map(({f})=>({t:head+f.label,icon:f.icon,food:true})):[];
      if(el._items.length){showBox([...foods.slice(0,3),...live(S.recipes).filter(r=>norm(r.name).includes(seg)).slice(0,3).map(r=>({t:r.name,icon:"📖"}))]);return}
      if(cut>=0){showBox(foods);return}
      showBox([...foods.slice(0,3),...names().filter(x=>norm(x.t).includes(q)&&norm(x.t)!==q).sort((a,b)=>b.recipe-a.recipe||(norm(b.t).startsWith(q)-norm(a.t).startsWith(q))).slice(0,5)
        .filter(x=>!foods.some(f=>norm(f.t)===norm(x.t))).map(x=>({t:x.t,icon:x.recipe?"📖":"🕘"}))]);
    };
    // Fin de saisie en pastilles : seulement si le champ reste vraiment quitté (l'iPhone le quitte un instant quand on
    // touche une suggestion ou une pastille, puis on y revient : dans ce cas on ne valide rien).
    el.onblur=()=>{setTimeout(clearSug,150);if(!el._items.length&&!el._finish&&!el.value.trim())return;
      clearTimeout(el._done);el._done=setTimeout(()=>{if(document.activeElement===el)return;
        const full=[...el._items,el.value.trim()].filter(Boolean).join(", ");el._items=[];el.value=full;
        // Entrée dans la case vide : on ouvre les ingrédients ; sinon (case quittée) on enregistre sans rien ouvrir (🥕 pour les ingrédients)
        const fin=el._finish;el._finish=false;
        if(norm(full)!==norm(el._orig||""))commit(el,full,!fin);else render()},Date.now()-(el._pick||0)<800?900:400)};
    el.onchange=null; // tout passe par Entrée et la sortie de la case (onblur)
  });
  document.querySelectorAll("[data-i]").forEach(el=>el.onclick=()=>ingredientsDialog(S.meals[el.dataset.i].text,el.dataset.i));
  document.querySelectorAll("[data-bulb]").forEach(b=>b.onclick=()=>{
    const open=b.closest(".slotw").querySelector(".sug");clearSug();if(open)return; // second appui : referme
    $(`[data-m="${b.dataset.bulb}"]`).tips();
  });
  document.querySelectorAll("[data-mv]").forEach(el=>el.onclick=()=>moveMeal(el.dataset.mv));
  document.querySelectorAll("[data-add2]").forEach(el=>el.onclick=()=>{const k2=addSecond(el.dataset.add2,1);render();const i=k2&&$(`[data-m="${k2}"]`);if(i)i.focus()});
  document.querySelectorAll("[data-del]").forEach(el=>el.onclick=()=>{
    const key=el.dataset.del,m=S.meals[key];
    if(bought(m)){
      if(!el.dataset.force){alert(`Les ingrédients de « ${m.text} » ont déjà été achetés : ce repas ne peut pas être supprimé. Utilisez ⇄ pour le déplacer.`);return}
      // 🔒 touché : on peut quand même supprimer (essai, erreur) ; les articles déjà achetés restent dans l'historique
      if(!confirm(`Les ingrédients de « ${m.text} » ont déjà été achetés.\nSupprimer quand même ce repas ? Ce qui n'est pas encore acheté sera retiré des listes.`))return;
    }
    else if(m.text&&!confirm(`Supprimer « ${m.text} »${m.added?" et retirer ses ingrédients des listes":""} ?`))return;
    dropChecks(key);if(m.added)m.added.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,m.added.n/(m.added.b||BASE),m.added.b||BASE)));
    if(Data.isSecond(key))touch("meals",{key,text:"",deleted:true});
    else{touch("meals",{key,text:"",servings:m.servings||BASE});removeSecond(key)}
    render();
  });
  // − / + sur un repas : ouvre la fenêtre des ingrédients au nouveau nombre de personnes (rien n'est appliqué sans valider).
  const step=(key,d)=>{const m=S.meals[key],n=Math.max(1,Math.min(30,(m.servings||BASE)+d));if(!Data.isSecond(key))LS.defN=n;
    if(bought(m)&&d>0)extraDialog(key,n);
    else if(recipeOf(m.text))ingredientsDialog(m.text,key,n);
    else{touch("meals",{...m,servings:n});render()}};
  document.querySelectorAll("[data-sm]").forEach(el=>el.onclick=()=>step(el.dataset.sm,-1));
  document.querySelectorAll("[data-sp]").forEach(el=>el.onclick=()=>step(el.dataset.sp,1));
  $("#sugg").onclick=suggestDialog;
  $("#pv").onclick=()=>{LS.wk=(+LS.wk||0)-1;render()};$("#nx").onclick=()=>{LS.wk=(+LS.wk||0)+1;render()};
}
// after : appelé une fois la fenêtre fermée (validée ou ignorée) ; step : « Repas 2/5 · mardi soir »
function ingredientsDialog(name,mealKey,startN,after,step){
  // Plat ou aliment inconnu tapé seul : une ligne sans quantité, comme dans une suite ; il attend dans
  // Réglages → Ingrédients → ⏳ À classer. Les recettes se créent dans Réglages → Recettes.
  const r=recipeOf(name)||{name,serves:1,virtual:true,ingredients:[{t:name,store:"auchan"}]};
  const lists=live(S.lists).sort(listSort);
  const opts=sel=>lists.map(l=>`<option value="${l.id}" ${l.id===sel?"selected":""}>${esc(l.name)}</option>`).join("");
  const B=(r&&r.serves)||BASE; // la recette est écrite pour B personnes
  const meal=mealKey&&S.meals[mealKey],prev=meal&&meal.text===name&&meal.added;
  let n=startN||(meal&&meal.servings)||BASE;
  const was=t=>prev&&prev.items.find(g=>g.t===t);
  const ov=document.createElement("div");ov.className="ov";
  const home=t=>prev&&t&&!was(t); // décoché lors de l'ajout : on l'avait à la maison
  const rowH=i=>`<div class="row ing-row" data-base="${esc(i.t)}" ${home(i.t)?'data-home="1"':""}><input type="checkbox" ${!prev||was(i.t)?"checked":""}><input type="text" class="ing" value="${esc(Qty.buy(i.t,n/B,B))}" data-shown="${esc(Qty.buy(i.t,n/B,B))}"><span class="stp sm"><button type="button" data-st="-1" aria-label="Moins">−</button><button type="button" data-st="1" aria-label="Plus">+</button></span><select>${opts(was(i.t)?was(i.t).store:defaultStore(i.t,i.store))}</select><p class="homewarn"></p></div>`;
  ov.innerHTML=`<div class="sheet"><div class="grab"></div>${step?`<p class="mut step">${esc(step)}</p>`:""}<h2>${esc(name)}</h2>
   ${r&&meal&&meal.text&&!prev&&meal.ts<LEGACY_TS?`<p class="homewarn" style="margin:6px 0">⚠ Ce repas date d'avant le suivi des ajouts : vérifiez qu'il n'est pas déjà dans vos listes avant d'ajouter.</p>`:""}
   ${prev?`<p class="okmsg">✓ Déjà dans les listes pour ${prev.n} personne${prev.n>1?"s":""}. Changer le nombre de personnes ou les cases met à jour les listes.</p>`:""}
   ${r?`<div class="serv"><span>Pour</span><button class="btn sec" id="mn">−</button><b id="nn">${n}</b><button class="btn sec" id="pl">+</button><span>personnes</span></div>
   <p class="mut">Cochez ce qu'il faut acheter et choisissez le magasin. ${r.virtual?"Quantités par personne, réglables dans ⚙︎ → Ingrédients.":`Recette pour ${B} personne${B>1?"s":""}.`}</p>
   <div id="ings" class="card">${r.ingredients.filter(i=>!pantryOf(i.t)).map(rowH).join("")}</div><button class="btn sec" id="more">+ Ingrédient</button>`
   :`<p class="mut">Nouvelle recette : un ingrédient par ligne, quantité en premier (ex. « 400 g de pâtes »).</p><div class="serv"><span>Recette pour</span><input type="number" id="sv" value="${n}" min="1" max="30" inputmode="numeric" style="width:70px"><span>personnes</span></div><textarea id="ta" rows="7" placeholder="400 g de pâtes&#10;200 g de lardons&#10;2 oeufs&#10;crème fraîche"></textarea>`}
   <div class="acts"><button class="btn sec" id="no">Ne pas ajouter<br>aux listes</button><button class="btn" id="ok">${!r?"Continuer":prev?"Mettre à jour<br>les listes":"Ajouter<br>aux listes"}</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  // « Ne pas ajouter aux listes » : rien n'est ajouté aux listes, mais le nombre de personnes choisi est gardé pour le repas
  const skip=()=>{close();const m=mealKey&&S.meals[mealKey];
    if(r&&m&&m.text){addPantry(r,mealKey);if(n!==(m.servings||BASE))touch("meals",{...m,servings:n});render()} // les « à vérifier » sont ajoutés quand même
    if(after)after()};
  ov.onclick=e=>{if(e.target===ov)skip()};
  $("#no").onclick=skip;
  if(r){
    const missing=t=>{const a=Qty.parse(Qty.buy(t,prev.n/B,B)),b=Qty.parse(Qty.buy(t,n/B,B));
      if(a.n==null||b.n==null||Qty.key(a)!==Qty.key(b))return Qty.buy(t,n/B,B);
      return b.n-a.n>0?Qty.format({...b,n:b.n-a.n}):null};
    const setN=v=>{
      n=Math.max(1,Math.min(30,v));$("#nn").textContent=n;
      ov.querySelectorAll(".ing-row").forEach(el=>{
        const i=el.querySelector(".ing"),w=el.querySelector(".homewarn");
        if(el.dataset.home&&n>prev.n){
          const m=missing(el.dataset.base);el.classList.toggle("warn",!!m);
          w.textContent=m?`⚠ Vous l'aviez à la maison pour ${prev.n} personne${prev.n>1?"s":""} : il en manque peut-être ${m} pour ${n}. Cochez pour l'ajouter.`:"";
          if(m&&i.value===i.dataset.shown){i.value=i.dataset.shown=m;el.dataset.diff="1"}
          return;
        }
        el.classList.remove("warn");w.textContent="";delete el.dataset.diff;
        if(i.value===i.dataset.shown)i.value=i.dataset.shown=Qty.buy(el.dataset.base,n/B,B);
      });
    };
    setN(n);
    // − / + sur un ingrédient : n'acheter qu'une partie (ou plus)
    $("#ings").addEventListener("click",e=>{const b=e.target.closest("[data-st]");if(!b)return;
      const row=b.closest(".ing-row"),i=row.querySelector(".ing"),t=Qty.step(i.value,+b.dataset.st);
      if(t){i.value=t;row.querySelector("[type=checkbox]").checked=true}});
    $("#mn").onclick=()=>setN(n-1);$("#pl").onclick=()=>setN(n+1);
    $("#more").onclick=()=>{$("#ings").insertAdjacentHTML("beforeend",rowH({t:""}));$("#ings").lastChild.querySelector(".ing").focus()};
  }
  $("#ok").onclick=()=>{
    if(!r){
      const ings=$("#ta").value.split("\n").map(x=>x.trim()).filter(Boolean).map(t=>({t,store:"auchan"}));
      const sv=$("#sv").value;
      close();if(ings.length){touch("recipes",{id:uid(),name,serves:Math.max(1,Math.min(30,parseInt(sv,10)||4)),ingredients:ings});ingredientsDialog(name,mealKey)}return;
    }
    const rows=[...ov.querySelectorAll(".ing-row")].map(el=>{const i=el.querySelector(".ing"),edited=i.value!==i.dataset.shown;
      return{orig:el.dataset.base,on:el.querySelector("[type=checkbox]").checked,shown:i.value.trim(),base:edited||el.dataset.diff?scaleText(i.value.trim(),B/n):el.dataset.base,store:el.querySelector("select").value}}).filter(x=>x.shown);
    // ingrédients placard (non affichés) : toujours ajoutés en 🏠 « à vérifier »
    const pan=r.ingredients.filter(g=>pantryOf(g.t)).map(g=>({t:g.t,store:defaultStore(g.t,g.store)}));
    const now=[...rows.filter(x=>x.on).map(x=>({t:x.base,store:x.store})),...pan];
    const sig=(items,k)=>items.map(g=>g.t+"@"+g.store).sort().join("|")+"#"+k;
    const ids=new Set(prev?prev.ids||[]:[]);
    if(!prev||sig(prev.items,prev.n)!==sig(now,n)){
      if(prev)prev.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,prev.n/(prev.b||BASE),prev.b||BASE)));
      rows.filter(x=>x.on).forEach(x=>(pantryOf(x.orig||x.shown)?addCheck(x.store,x.shown,mealKey&&mealKey.slice(0,10),mealKey):addToList(x.store,x.shown)).forEach(i=>ids.add(i)));
      pan.forEach(g=>addCheck(g.store,g.t,mealKey&&mealKey.slice(0,10),mealKey).forEach(i=>ids.add(i)));
    }
    // la recette ne change pas avec les quantités achetées ; seuls les ingrédients ajoutés (+ Ingrédient) s'y ajoutent
    const extra=rows.filter(x=>!x.orig).map(x=>({t:x.base,store:x.store}));
    if(extra.length&&!r.virtual)touch("recipes",{...r,ingredients:[...r.ingredients,...extra]});
    if(meal)touch("meals",{...S.meals[mealKey],servings:n,added:{n,items:now,ids:[...ids],b:B}});
    close();render();if(after)after();
  };
}
$("#tabs").onclick=e=>{const t=(e.target.closest("[data-t]")||{dataset:{}}).dataset.t;if(t){tab=LS.tab=t;render();scrollTo(0,0)}};
$("#cfg").onclick=()=>{stab="recettes";tab=LS.tab="settings";render();scrollTo(0,0)};
let stab="recettes"; // onglet des réglages ; « Recettes » à chaque ouverture
const STABS=[["recettes","Recettes"],["aliments","Ingrédients"],["habitudes","Habitudes"],["rayons","Rayons"],["foyer","Synchro"]];
function renderSettings(){
  $("#title").textContent="Réglages";
  const rs=live(S.recipes).sort((a,b)=>a.name.localeCompare(b.name));
  const hs=live(S.habits).filter(h=>h.state==="on").sort((a,b)=>a.days[0]-b.days[0]||b.slot.localeCompare(a.slot));
  const tabs=`<div class="seg">${STABS.map(([id,l])=>`<button data-stab="${id}" class="${stab===id?"on":""}">${l}</button>`).join("")}</div>`;
  const body={
   recettes:`<div class="card">${rs.length?rs.map(r=>`<div class="row link" data-r="${r.id}"><button class="pill plan" data-plan="${r.id}" aria-label="Ajouter aux menus">+</button><span class="t">${esc(r.name)}<br><small class="mut">${r.ingredients.length} ingrédient${r.ingredients.length>1?"s":""} · pour ${r.serves||BASE} pers.${Data.recipeDessert(r)?" · 🍰 dessert":""}${{ete:" · ☀️ été",hiver:" · ❄️ hiver"}[Data.recipeSeason(r)]||""}</small></span><span class="mut">›</span></div>`).join(""):`<div class="empty">Aucune recette pour l'instant</div>`}</div>
   <button class="btn" id="newr" style="width:100%">+ Nouvelle recette</button>`,
   aliments:`<p class="mut">Quantité par personne quand vous tapez une suite d'aliments dans un repas (ex. « viande rouge, haricots verts, pommes de terre surgelées »).</p>
   <input type="search" id="fsearch" placeholder="🔎 Rechercher un ingrédient" autocomplete="off" style="width:100%;margin-bottom:6px">
   ${[["leg","🥦 Légumes"],["fec","🥔 Féculents"],["prot","🥩 Viandes, œufs"],["pois","🐟 Poissons, crustacés"],["autre","🍽️ Autres"]].map(([c,t])=>`<h3 class="fam ${c}">${t}</h3><div class="card fam ${c}">${Data.allFoods().filter(f=>f.cat===c).sort((x,y)=>x.label.localeCompare(y.label,"fr")).map(f=>{const q=(S.foods[f.id]&&!S.foods[f.id].deleted&&S.foods[f.id].q)||f.q;
     const v=f.kind==="g"?(q>=1000?String(q/1000).replace(".",",")+" kg":q+" g"):f.kind==="n"&&f.as?q+" "+f.as.replace(/^(\S+?)s?(?= )/,(m,w)=>q>1?w+"s":w):f.kind==="n"?String(q).replace(".",",")+(q<1?" (une pour "+Math.round(1/q)+")":""):f.kind==="box"?"boîtes : petite 1, moyenne 2, grande 4":"« "+f.line+" »";
     return `<div class="row"><span class="t">${esc(f.label)}<br><small class="mut">${esc(v)}${f.kind==="g"||f.kind==="n"?" par personne":""}</small></span>${f.kind==="g"||f.kind==="n"?`<span class="stp sm"><button data-fq="${f.id}" data-d="-1" aria-label="Moins">−</button><button data-fq="${f.id}" data-d="1" aria-label="Plus">+</button></span>`:""}${f.custom?`<button class="x" data-fdel="${f.id}" aria-label="Retirer">×</button>`:""}</div>`}).join("")}<button class="row add-food" data-fadd="${c}">+ Ajouter un ingrédient</button></div>`).join("")}`,
   habitudes:`<p class="mut">Les suggestions 💡 proposent ces plats en priorité sur ces créneaux. L'app en apprend aussi toute seule à partir des repas passés.</p>
   <div class="card">${hs.length?hs.map(h=>`<div class="row link" data-hedit="${h.id}"><span class="t">${habitWhat(h).icon} ${esc(habitWhat(h).label)}<br><small class="mut">${habitWhen(h)}${h.auto?" · apprise":""}${h.adj?" · ajustée":""}</small></span><button class="x" data-hdel="${h.id}" aria-label="Retirer">×</button></div>`).join(""):`<div class="empty">Aucune habitude</div>`}</div>
   <button class="btn" id="newh" style="width:100%">+ Habitude</button>`,
   rayons:`<div class="card ordre"><div class="row"><span class="t">Magasin</span><select id="ordl">${live(S.lists).sort(listSort).map(l=>`<option value="${l.id}" ${l.id===LS.ordl?"selected":""}>${esc(l.name)}</option>`).join("")}</select></div>
   ${rayonOrder(LS.ordl&&S.lists[LS.ordl]?LS.ordl:"auchan").map((r,i,all)=>`<div class="row"><span class="t">${r.icon} ${esc(r.label)}</span><button class="pill" data-up="${i}" ${i?"":"disabled"} aria-label="Monter">↑</button><button class="pill" data-dn="${i}" ${i<all.length-1?"":"disabled"} aria-label="Descendre">↓</button></div>`).join("")}</div>`,
   foyer:`<div class="card"><div class="row"><span class="t">Code de cet appareil<br><small class="mut">${code?"•".repeat(Math.min(code.length,12)):"non défini"} · ${STATE[status]}</small></span><button class="btn sec" id="setcode">Saisir</button></div>
   ${code?`<div class="row"><span class="t">Copier le code<br><small class="mut">Pour le coller sur un autre appareil</small></span><button class="btn sec" id="cpcode">Copier</button></div>`:""}
   ${status==="ok"?`<div class="row"><span class="t">Changer le code du foyer<br><small class="mut">Les autres appareils devront saisir le nouveau</small></span><button class="btn sec" id="rencode">Changer</button></div>`:""}</div>
   ${status==="unk"?`<p class="warn">Ce code ne correspond à aucun foyer. Vérifiez-le (majuscules, espaces) ou demandez-le à un autre membre du foyer.</p>`:""}
   <p class="mut" style="text-align:center;margin-top:24px">Version ${VERSION} <a href="#" id="upd">Forcer la mise à jour</a></p>`,
  }[stab];
  $("#view").innerHTML=tabs+body;
  document.querySelectorAll("[data-stab]").forEach(b=>b.onclick=()=>{stab=b.dataset.stab;render();scrollTo(0,0)});
  const on=(sel,ev,fn)=>{const el=$(sel);if(el)el[ev]=fn};
  document.querySelectorAll("[data-hdel]").forEach(el=>el.onclick=e=>{e.stopPropagation();touch("habits",{...S.habits[el.dataset.hdel],state:"off"});render()});
  document.querySelectorAll("[data-hedit]").forEach(el=>el.onclick=()=>habitEditor(S.habits[el.dataset.hedit]));
  on("#newh","onclick",()=>habitEditor());
  // portion d'un aliment : ± 10 g (grammes) ou ± 1 / ± ¼ (à l'unité)
  on("#fsearch","oninput",e=>{const norm=Data.plain,q=norm(e.target.value.trim());
    document.querySelectorAll(".card.fam").forEach(c=>{let any=false;
      c.querySelectorAll(".row:not(.add-food)").forEach(r=>{const ok=!q||norm(r.querySelector(".t").textContent).includes(q);r.style.display=ok?"":"none";any=any||ok});
      c.querySelector(".add-food").style.display=q?"none":"";c.style.display=any||!q?"":"none";c.previousElementSibling.style.display=c.style.display})});
  document.querySelectorAll("[data-fadd]").forEach(el=>el.onclick=()=>foodEditor(el.dataset.fadd));
  document.querySelectorAll("[data-fdel]").forEach(el=>el.onclick=()=>{const r=S.foods[el.dataset.fdel];if(r&&confirm(`Retirer « ${r.label} » ?`)){touch("foods",{...r,deleted:true});render()}});
  document.querySelectorAll("[data-fq]").forEach(el=>el.onclick=()=>{const f=Data.allFoods().find(x=>x.id===el.dataset.fq),cur=(S.foods[f.id]&&!S.foods[f.id].deleted&&S.foods[f.id].q)||f.q;
    const st=f.kind==="g"?10:cur<1||(cur===1&&+el.dataset.d<0)?0.25:1,q=Math.max(f.kind==="g"?10:0.25,Math.round((cur+st*el.dataset.d)*100)/100);
    touch("foods",{...(S.foods[f.id]||{}),id:f.id,q,deleted:false});render()});

  // Forcer la mise à jour : vide le cache de l'app ET celui de Safari (qui garde les fichiers jusqu'à 10 min), puis recharge.
  on("#upd","onclick",async e=>{e.preventDefault();LS.updFrom=VERSION;e.target.textContent="Mise à jour…";
    try{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);
      await Promise.all(["./","index.html","app.js","data.js","qty.js","rayons.js","style.css","config.js","sw.js"].map(f=>fetch(f,{cache:"reload"}).catch(()=>{})))}catch(_){}
    location.replace(location.pathname+"?maj="+Date.now())});
  const askCode=(msg,def)=>{
    let c=prompt(msg,def);
    while(c!==null&&c.trim().length<MIN_CODE)c=prompt(`Trop court : au moins ${MIN_CODE} caractères. Par exemple trois mots et un nombre.`,c.trim());
    return c===null?null:c.trim();
  };
  // Rejoindre un foyer existant : ne change que cet appareil.
  const cp=$("#cpcode");if(cp)cp.onclick=async()=>{try{await navigator.clipboard.writeText(code);cp.textContent="Copié ✓"}catch(_){alert("Copie impossible sur cet appareil.")}};
  on("#setcode","onclick",()=>{
    const c=askCode("Code du foyer (le même que sur les autres appareils) :",code);
    if(c!==null){code=LS.code=c;LS.since="";LS.deltaInit="";save();sync();render()}
  });
  // Renommer le foyer côté serveur : il faut que le code actuel soit valide.
  const ren=$("#rencode");if(ren)ren.onclick=async()=>{
    const n=askCode(`Nouveau code du foyer, au moins ${MIN_CODE} caractères. Gardez-le secret :`,"");
    if(!n||n===code)return;
    const r=await rpc("change_household_code",{p_old:code,p_new:n}).catch(()=>null);
    if(r&&r.ok){code=LS.code=n;sync();render();alert("Code changé. Sur les autres appareils : ⚙︎ → Saisir, puis le nouveau code.");return}
    const e=r?await r.json().catch(()=>({})):{};
    alert(e.message==="code deja utilise"?"Ce code est déjà pris, choisissez-en un autre.":"Impossible de changer le code pour l'instant (hors ligne ?).");
  };
  on("#newr","onclick",()=>recipeEditor(null));
  const ol=()=>LS.ordl&&S.lists[LS.ordl]?LS.ordl:"auchan";
  on("#ordl","onchange",e=>{LS.ordl=e.target.value;render()});
  const moveR=(i,d)=>{const ids=rayonOrder(ol()).map(r=>r.id);[ids[i],ids[i+d]]=[ids[i+d],ids[i]];touch("lists",{...S.lists[ol()],order:ids});render()};
  document.querySelectorAll("[data-up]").forEach(el=>el.onclick=()=>moveR(+el.dataset.up,-1));
  document.querySelectorAll("[data-dn]").forEach(el=>el.onclick=()=>moveR(+el.dataset.dn,1));
  document.querySelectorAll("[data-r]").forEach(el=>el.onclick=e=>{if(!e.target.closest("[data-plan]"))recipeEditor(S.recipes[el.dataset.r])});
  document.querySelectorAll("[data-plan]").forEach(el=>el.onclick=()=>planRecipe(S.recipes[el.dataset.plan]));
}
// Champ de recherche d'un plat (types et recettes) ; renvoie une fonction qui donne le choix {type, recipe} ou null.
function dishPicker(ov,initial){
  const q=ov.querySelector(".pick input"),list=ov.querySelector(".pick .plist");
  const fold=Data.plain;
  const all=[...Data.TYPES.map(t=>({type:t.id,recipe:null,icon:t.icon,label:t.label,find:fold(t.label+" "+t.words.join(" "))})),
    ...live(S.recipes).sort((a,b)=>a.name.localeCompare(b.name)).map(r=>({type:null,recipe:r.id,icon:"📖",label:r.name,find:fold(r.name)}))];
  let sel=initial&&(initial.type||initial.recipe)?{type:initial.type||null,recipe:initial.recipe||null}:null;
  if(sel)q.value=habitWhat(sel).icon+" "+habitWhat(sel).label;
  const show=()=>{const v=fold(q.value.trim());
    const hits=(v?all.filter(x=>x.find.includes(v)):all.filter(x=>x.type)).slice(0,8);
    list.innerHTML=hits.map((x,i)=>`<button type="button" data-h="${i}">${x.icon} ${esc(x.label)}</button>`).join("")||`<p class="mut">Aucun plat ne correspond</p>`;
    list.onclick=e=>{const b=e.target.closest("[data-h]");if(!b)return;const x=hits[+b.dataset.h];
      sel={type:x.type,recipe:x.recipe};q.value=x.icon+" "+x.label;list.innerHTML=""}};
  q.oninput=()=>{sel=null;show()};q.onfocus=()=>{if(!sel)show()};
  return()=>sel;
}
function habitEditor(h){
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>${h?"Modifier l'habitude":"Nouvelle habitude"}</h2>
   <p class="mut">Plusieurs jours cochés = l'un ou l'autre dans la semaine.</p>
   <div class="days">${DAYS.map((d,i)=>`<label><input type="checkbox" value="${i+1}" ${h&&h.days.includes(i+1)?"checked":""}><span>${d.slice(0,3)}</span></label>`).join("")}</div>
   <div class="serv"><span>Moment</span><select id="hslot"><option value="s">Soir</option><option value="m" ${h&&h.slot==="m"?"selected":""}>Midi</option></select></div>
   <div class="serv"><span>Plat</span><div class="pick"><input type="text" id="hq" placeholder="Tapez : pâtes, soupe, une recette…" autocomplete="off"><div class="plist"></div></div></div>
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">${h?"Enregistrer":"Ajouter"}</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  const pick=dishPicker(ov,h);
  $("#ok").onclick=()=>{
    const days=[...ov.querySelectorAll(".days input:checked")].map(x=>+x.value);
    if(!days.length){alert("Cochez au moins un jour.");return}
    const what=pick();
    if(!what){alert("Choisissez un plat dans la liste.");$("#hq").focus();return}
    // modifiée à la main : elle redevient une habitude « à vous », et l'année se recompte
    touch("habits",{...(h||{}),id:h?h.id:"h-"+uid(),days,slot:$("#hslot").value,...what,auto:false,adj:null,state:"on",since:todayKey()});close();render();
  };
}
// Nouvel ingrédient dans une famille (réglages) : nom, quantité par personne en grammes ou en pièces, magasin.
function foodEditor(cat,rec,done,step){ // rec : aliment inconnu d'un repas, dont on choisit la famille ; done : appelé ensuite (même « Plus tard »)
  const lists=live(S.lists).sort(listSort),FAM={leg:"Légumes",fec:"Féculents",prot:"Viandes, œufs",pois:"Poissons, crustacés",autre:"Autres"},fam=FAM[cat];
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Nouvel ingrédient${rec?(step&&!step.endsWith("/1")?" "+step:""):" · "+fam}</h2>
   <input type="text" id="fn" placeholder="Nom (ex. Haricots beurre)" autocapitalize="sentences" value="${rec?esc(rec.label):""}" style="width:100%;margin-bottom:10px">
   ${rec?`<div class="serv"><span>Famille</span><select id="fc">${Object.entries(FAM).map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select></div>`:""}
   <div class="serv"><span>Par personne</span><input type="text" id="fqv" value="150" inputmode="decimal" style="width:80px">
   <select id="fk"><option value="g">grammes</option><option value="kg">kilos</option><option value="n">pièce(s)</option></select></div>
   <div class="serv"><span>Magasin</span><select id="fs">${lists.map(l=>`<option value="${l.id}" ${l.id==="auchan"?"selected":""}>${esc(SHORT[l.id]||l.name)}</option>`).join("")}</select></div>
   <div class="acts"><button class="btn sec" id="no">${done?"Plus tard":"Annuler"}</button><button class="btn" id="ok">${rec?"Enregistrer":"Ajouter"}</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove(),later=()=>{close();if(done)done()};ov.onclick=e=>{if(e.target===ov)later()};$("#no").onclick=later;
  $("#fk").onchange=()=>{$("#fqv").value={n:1,kg:1,g:150}[$("#fk").value]};
  $("#ok").onclick=()=>{const label=$("#fn").value.trim(),q=parseFloat(String($("#fqv").value).replace(",","."));
    if(!label){$("#fn").focus();return}if(!(q>0)){$("#fqv").focus();return}
    if(Data.foodFor(label,true)&&!confirm(`« ${label} » ressemble à un ingrédient existant. L'ajouter quand même ?`))return;
    const kg=$("#fk").value==="kg"; // les kilos sont gardés en grammes
    touch("foods",{id:rec?rec.id:"c-"+uid(),label:label.charAt(0).toUpperCase()+label.slice(1),cat:rec?$("#fc").value:cat,kind:kg?"g":$("#fk").value,q:kg?Math.round(q*1000):q,store:$("#fs").value,deleted:false});close();render();if(done)done()};
  if(!rec)setTimeout(()=>$("#fn").focus(),50);
}
function recipeEditor(r){
  const lists=live(S.lists).sort(listSort);
  const opts=sel=>lists.map(l=>`<option value="${l.id}" ${l.id===sel?"selected":""}>${esc(SHORT[l.id]||l.name)}</option>`).join("");
  const rowH=i=>`<div class="ed-row"><input type="text" class="ing" value="${esc(i.t)}" placeholder="400 g de pâtes"><select>${opts(i.store||"auchan")}</select><button type="button" class="pill pan ${i.t&&pantryOf(i.t)?"on":""}" aria-label="Toujours à la maison (placard)" title="Placard : toujours à la maison">🏠</button><button class="x">×</button></div>`;
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>${r?"Modifier la recette":"Nouvelle recette"}</h2>
   <input type="text" id="rn" placeholder="Nom du plat" value="${esc(r?r.name:"")}" style="width:100%;margin-bottom:10px">
   <div class="serv"><span>Recette pour</span><input type="number" id="sv" value="${r?r.serves||BASE:BASE}" min="1" max="30" inputmode="numeric" style="width:70px"><span>personnes</span></div>
   <div class="serv"><span>Type</span><select id="sdes"><option value="p">Plat</option><option value="d" ${Data.recipeDessert(r||{name:""})?"selected":""}>Dessert (jamais proposé dans les menus)</option></select></div>
   <div class="serv"><span>Saison</span><select id="ssn">${[["all","Toute l'année"],["ete","Été (pas de novembre à mars)"],["hiver","Hiver (pas de mai à septembre)"]]
     .map(([v,l])=>`<option value="${v}" ${v===Data.recipeSeason(r||{name:""})?"selected":""}>${l}</option>`).join("")}</select></div>
   <p class="mut">Ingrédients pour ce nombre de personnes, avec la quantité en premier. Le magasin est celui proposé par défaut.</p>
   <textarea id="paste" rows="3" placeholder="📋 Collez ici toute la liste d'ingrédients : une ligne par ingrédient"></textarea>
   <div id="eds">${(r?r.ingredients:[{t:""},{t:""},{t:""}]).map(rowH).join("")}</div>
   <button class="btn sec" id="more">+ Ingrédient</button>
   <div class="acts">${r?`<button class="btn sec danger" id="del">Supprimer</button>`:""}<button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">Enregistrer</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  ov.onclick=e=>{if(e.target===ov)close();const x=e.target.closest(".x");if(x)x.parentNode.remove();
    const p=e.target.closest(".pan");if(p)p.classList.toggle("on")}; // 🏠 placard : vaut pour toutes les recettes
  $("#no").onclick=close;
  // Texte collé : une ligne d'ingrédient par ligne (puces, titres et étapes ignorés), « pour 6 personnes » règle le nombre.
  $("#paste").oninput=()=>{const v=$("#paste").value;if(!/\n/.test(v.trim()))return;
    const lines=[];
    for(let l of v.split(/\r?\n/)){l=l.replace(/^\s*(?:[-•*·▪◦–—]|\d+[.)](?=\s))\s*/,"").trim();
      if(/^(pr[ée]paration|[ée]tapes?|instructions?)\b/i.test(l))break;
      const p=l.match(/pour\s+(\d+)\s*(?:pers|parts?|couverts?)/i);if(p){$("#sv").value=p[1];continue}
      if(!l||/^ingr[ée]dients?\s*:?$/i.test(l)||l.length>80)continue;lines.push(l)}
    if(!lines.length)return;
    [...ov.querySelectorAll(".ed-row")].filter(el=>!el.querySelector(".ing").value.trim()).forEach(el=>el.remove());
    $("#eds").insertAdjacentHTML("beforeend",lines.map(t=>rowH({t,store:defaultStore(t,(Data.foodFor(Qty.parse(t).name||t)||{}).store)})).join(""));
    $("#paste").value="";toast(`✓ ${lines.length} ingrédient${lines.length>1?"s":""} ajouté${lines.length>1?"s":""}`)};
  $("#more").onclick=()=>{$("#eds").insertAdjacentHTML("beforeend",rowH({t:""}));$("#eds").lastChild.querySelector(".ing").focus()};
  if(r)$("#del").onclick=()=>{if(confirm("Supprimer cette recette ?")){touch("recipes",{...r,deleted:true});close();render()}};
  $("#ok").onclick=()=>{
    const name=$("#rn").value.trim();
    const ings=[...ov.querySelectorAll(".ed-row")].map(el=>({t:el.querySelector(".ing").value.trim(),store:el.querySelector("select").value,pan:el.querySelector(".pan").classList.contains("on")})).filter(x=>x.t);
    for(const g of ings)if(g.pan!==pantryOf(g.t)){const nm=pantryName(g.t),k=Data.pantryKey(nm);
      touch("stores",{...(S.stores[k]||{id:k,last:[],def:null,n:0}),id:k,name:(S.stores[k]&&S.stores[k].name)||nm,pantry:g.pan})}
    ings.forEach(g=>delete g.pan);
    if(!name){$("#rn").focus();return}
    touch("recipes",{id:r?r.id:uid(),name,season:$("#ssn").value,dessert:$("#sdes").value==="d",serves:Math.max(1,Math.min(30,parseInt($("#sv").value,10)||4)),ingredients:ings});close();render();
  };
}
// Mise à jour automatique : à l'ouverture et au retour dans l'app, si une nouvelle version est en ligne, on recharge
// (jamais pendant une saisie ; une seule tentative par version, au cas où le serveur tarde à servir les nouveaux fichiers).
async function autoUpdate(atStart){
  try{const a=document.activeElement;if(document.hidden||(a&&a.matches("input,textarea,select"))||document.querySelector(".ov"))return;
    const t=await (await fetch("sw.js?v="+Date.now(),{cache:"no-store"})).text(),v=(t.match(/V="([^"]+)"/)||[])[1];
    if(!v||v===VERSION||LS.autoTried===v)return;
    if(!atStart&&tab!=="menus"&&tab!=="settings")return; // au retour dans l'app sur une liste (en magasin) : pas de rechargement
    LS.autoTried=v;LS.autoFrom=VERSION;
    const r=await navigator.serviceWorker?.getRegistration();if(r)await r.update();
    location.replace(location.pathname+"?maj="+Date.now());
  }catch(e){}
}
setTimeout(()=>autoUpdate(true),1500);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(autoUpdate,500)});
addEventListener("online",sync);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)sync()});
// Récupère les changements des autres appareils ; les siens partent tout de suite (touch).
// Récupère les changements des autres appareils toutes les minutes (les siens partent tout de suite).
let lastSync=0;
setInterval(()=>{const a=document.activeElement,onList=tab!=="menus"&&tab!=="settings";
  if(document.hidden||(a&&a.matches("input,textarea,select"))||Date.now()-lastSync<60000)return;lastSync=Date.now();sync()},5000);
if("serviceWorker" in navigator){
  const had=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>r.update());
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(had)location.reload()});
}
if(Data.prune(S,Date.now()))save();
runLearning();
// Après « Forcer la mise à jour » : retour sur l'onglet Foyer et confirmation de la version.
if(/[?&]maj=/.test(location.search))history.replaceState(null,"",location.pathname);
if(LS.autoFrom){const from=LS.autoFrom;delete LS.autoFrom;if(from!==VERSION)setTimeout(()=>toast(`✓ Application mise à jour (${VERSION})`),300)}
if(LS.updFrom){const from=LS.updFrom;delete LS.updFrom;tab=LS.tab="settings";stab="foyer";
  setTimeout(()=>toast(from===VERSION?`✓ Déjà à jour : version ${VERSION}`:`✓ Mise à jour installée : version ${VERSION}`),300)}
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3500)}
purgeDone();render();sync();
setInterval(purgeDone,5*60*1000);
// pas encore de code (nouvel appareil) : directement sur l'onglet Foyer, où on le saisit
if(!code&&cfg.SUPABASE_URL)setTimeout(()=>{tab=LS.tab="settings";stab="foyer";render()},300);
