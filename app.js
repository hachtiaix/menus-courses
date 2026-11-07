const $=s=>document.querySelector(s), LS=localStorage;
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const {cleanAll}=Data;
let S=cleanAll(JSON.parse(LS.s||"null"));
const ORDER=["auchan","lidl","drive","boucherie","fermiers"];
for(const [id,name] of [["auchan","Auchan"],["lidl","Lidl"],["drive","Drive"],["boucherie","Boucherie"],["fermiers","Au pré des fermiers"]]) S.lists[id]=S.lists[id]||{id,name,ts:0};
let openIt=null; // article de liste dont les boutons sont affichés
let addOpen=false; // case « Ajouter un article » ouverte (par le + flottant)
let rview="rec"; // onglet 📖 : « Recettes » à chaque ouverture (sinon « Ingrédients »)
const openPast=new Set(); // jours passés dépliés à la main (Menus), gardés pendant la session
const cookGot={}; // vue recette : ingrédients barrés, par recette, pendant la session
let tab=LS.tab||"auchan", code=LS.code||"", pending=JSON.parse(LS.pending||"{}"); // pending : modifications pas encore envoyées

function save(){LS.s=JSON.stringify(S);LS.pending=JSON.stringify(pending)}
function touch(kind,rec){rec.ts=Date.now();const id=rec.id||rec.key;(S[kind]=S[kind]||{})[id]=rec;(pending[kind]=pending[kind]||{})[id]=1;save();sync();}
const merge=remote=>Data.mergeInto(S,remote);
// Code minimal : en dessous, la base refuse l'écriture (cf. supabase.sql).
const MIN_CODE=10;
const cfg=window.CONFIG, canSync=()=>cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&code.length>=MIN_CODE;
const H=()=>({apikey:cfg.SUPABASE_ANON_KEY,Authorization:"Bearer "+cfg.SUPABASE_ANON_KEY,"Content-Type":"application/json"});
// Le code part dans le corps de la requête, jamais dans l'URL.
// délai maximal de 20 s : avec un réseau faible, une requête qui n'aboutit jamais bloquait la synchro pour de bon
const rpc=(fn,body)=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);
  return fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:"POST",headers:H(),body:JSON.stringify(body),signal:c.signal}).finally(()=>clearTimeout(t))};
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
    // nouveau type de données dans cette version (ex. associations) : on relit tout une fois, sinon ce qu'une ancienne
    // version a reçu sans le connaître ne reviendrait jamais
    if(LS.kinds!==Data.KINDS.join()){delete LS.since;LS.kinds=Data.KINDS.join()}
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
// iPhone : après la fermeture du clavier (ou d'une fenêtre), la barre du bas peut rester au milieu de l'écran →
// on recale la page plusieurs fois, le temps que l'animation du clavier se termine
function recale(){if(document.activeElement&&document.activeElement.matches("input,textarea,select"))return;
  const vv=window.visualViewport;if(vv&&innerHeight-vv.height>120)return; // clavier encore ouvert
  const y=Math.min(scrollY,Math.max(0,document.documentElement.scrollHeight-innerHeight));scrollTo(0,y+1);scrollTo(0,y)}
let recT=[];const recaleSoon=()=>{recT.forEach(clearTimeout);recT=[120,400,800,1500].map(ms=>setTimeout(recale,ms))};
document.addEventListener("focusout",recaleSoon);
if(window.visualViewport)visualViewport.addEventListener("resize",recaleSoon);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)recaleSoon()});
addEventListener("pageshow",recaleSoon);addEventListener("orientationchange",recaleSoon);
new MutationObserver(ms=>{if(ms.some(m=>[...m.removedNodes].some(n=>n.classList&&n.classList.contains("ov"))))recaleSoon()}).observe(document.body,{childList:true}); // fenêtre refermée
function setStatus(c){
  const changed=c!==status;status=c;
  $("#status").className=c;$("#status").title=STATE[c];
  if(changed&&(tab==="settings"||tab==="recettes"))safeRender();
}

const listSort=(a,b)=>{const i=ORDER.indexOf(a.id),j=ORDER.indexOf(b.id);return (i<0?99:i)-(j<0?99:j)||a.name.localeCompare(b.name)};
const SHORT={auchan:"Auchan",lidl:"Lidl",drive:"Drive",boucherie:"Boucherie",fermiers:"Fermiers"},ICON={drive:"🚗",boucherie:"🥩",fermiers:"🚜"},
  MENU_ICON="🍽️",LOGO={auchan:"icons/auchan.svg",lidl:"icons/lidl.svg"},PICTO={fermiers:"icons/ferme.svg"}; // logos du domaine public (Wikimedia Commons)
const live=o=>Object.values(o).filter(x=>!x.deleted);
// Image d'ingrédient : emoji, ou dessin maison « svg:nom » (icons/nom.svg) quand l'emoji n'existe pas (saucisse).
const ico=i=>/^svg:[a-z-]+$/.test(i||"")?`<img class="ico" src="icons/${i.slice(4)}.svg" alt="">`:esc(String(i||""));
function render(){
  Data.setCustom(S);
  const hd=document.querySelector("header");if(hd)document.documentElement.style.setProperty("--hh",hd.offsetHeight+"px");
  $("#cfg").classList.toggle("on",tab==="settings"); // l'engrenage reste : il porte le point de synchro
  const lists=live(S.lists).sort(listSort);
  // barre du bas : 3 onglets ; 🛒 ouvre le dernier magasin (on n'est jamais dans deux magasins à la fois)
  const isList=!!S.lists[tab],nItems=live(S.items).filter(i=>!i.done&&!i.check&&S.lists[i.list]&&!S.lists[i.list].deleted).length;
  $("#tabs").innerHTML=`<button data-t="courses" class="${isList?"on":""}" aria-label="Courses"><i>🛒${nItems?`<b>${nItems}</b>`:""}</i><span>Courses</span></button>`
    +`<button data-t="menus" class="${tab==="menus"?"on":""}" aria-label="Menus"><i>${MENU_ICON}</i><span>Menus</span></button>`
    +`<button data-t="recettes" class="${tab==="recettes"?"on":""}" aria-label="Recettes"><i>📖</i><span>Recettes</span></button>`;
  if(tab==="settings")renderSettings();else if(tab==="menus")renderMenus();else if(tab==="recettes")renderRecipes();else renderList(S.lists[tab]?tab:"auchan");
}
const esc=s=>s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function renderList(id){
  LS.store=id; // 🛒 rouvre ce magasin
  const lists=live(S.lists).sort(listSort),pic=l=>LOGO[l.id]?`<img src="${LOGO[l.id]}" alt="${esc(l.name)}" class="logo-${l.id}">`:PICTO[l.id]?`<img src="${PICTO[l.id]}" alt="" class="picto">`:ICON[l.id]||"🛒";
  var storeBar=`<div class="stores">${lists.map(l=>{const c=live(S.items).filter(i=>i.list===l.id&&!i.done&&!i.check).length;return `<button data-st2="${l.id}" class="${l.id===id?"on":""}" aria-label="${esc(l.name)}">${pic(l)}${c?`<b>${c}</b>`:""}</button>`}).join("")}</div>`;
  // en-tête : les magasins (plus de logo en titre), à côté de ⚙︎ ; celui qui est ouvert est encadré
  $("#title").innerHTML=storeBar;
  live(S.items).filter(i=>i.list===id&&!i.done&&/\s\+\s/.test(i.text)&&Qty.parse(i.text).kind==="box").forEach(i=>{touch("items",{...i,deleted:true});addBoxes(id,Qty.parse(i.text),i.id)});
  const items=live(S.items).filter(i=>i.list===id&&!i.archived).sort((a,b)=>a.done-b.done||(a.c||a.ts)-(b.c||b.ts));
  // 🏠 à vérifier au placard : en gris, « Il en manque » (devient un article à acheter) ou « J'en ai » (retiré)
  // 🏠 avec les quantités demandées par chaque repas (pour voir s'il en reste assez), et le total quand il s'additionne ;
  // seulement pour ce qui se mesure vraiment (beurre, farine, sucre…), pas pour les épices, l'huile ou le vinaigre
  // (et pour les boîtes de conserve : combien de boîtes)
  const QTY_PANTRY=/^(beurre|farine|sucre|maizena|levure)/;
  const need=i=>{const k=Data.pantryKey(pantryName(i.text)),out=[],withQty=QTY_PANTRY.test(Data.plain(pantryName(i.text)).trim());
    for(const mk of i.meals||[]){const m=S.meals[mk];if(!m||m.deleted||!m.text)continue;const r=recipeOf(m.text),a=m.added;
      // ce que le repas a demandé (enregistré à l'ajout), sinon la recette
      const B=a?a.b||BASE:(r&&r.serves)||BASE,n=a?a.n:m.servings||DEFN,src=a?a.items:r?r.ingredients:[];
      const lines=src.filter(g=>Data.pantryKey(pantryName(g.t))===k&&(withQty||isCan(g.t))).map(g=>Qty.buy(g.t,n/B,B));
      out.push({meal:m.text,lines})}
    const all=out.flatMap(x=>x.lines),tot=all.length>1?all.reduce((s,t)=>s&&Qty.add(s,t)):all[0];
    const q=t=>{const nm=pantryName(t),j=t.toLowerCase().lastIndexOf(nm.toLowerCase());return (j>0?t.slice(0,j):"").replace(/\s+(?:de|d['’])\s*$/i,"").trim()};
    return{total:tot?q(tot):"",detail:out.map(x=>{const s=x.lines.map(q).filter(Boolean).join(" + ");return (s?s+" pour ":"pour ")+x.meal}).join(" · ")}};
  const row=i=>{if(!i.check)return rowItem(i);const nd=need(i);
    return `<div class="row verif"><span class="t" data-e="${i.id}">🏠 ${esc(i.text)}${nd.total?` <b class="tot">${esc(nd.total)}</b>`:""}</span><button class="pill vok" data-vok="${i.id}">Il en manque</button><button class="pill vno" data-d="${i.id}">J'en ai</button><small class="for">${esc(nd.detail||"pour un repas")}</small></div>`};
  const rowItem=i=>
`<div class="row item ${i.done?"done":""} ${openIt===i.id?"open":""}"><input type="checkbox" data-c="${i.id}" ${i.done?"checked":""}><span class="t" data-o="${i.id}">${esc(i.text)}</span><span class="ctl">${!i.done?`<span class="stp sm"><button data-q="${i.id}" data-dir="-1" aria-label="Moins">−</button><button data-q="${i.id}" data-dir="1" aria-label="Plus">+</button></span><button class="pill imv" data-imv="${i.id}" aria-label="Changer de liste">⇄</button><button class="pill ied" data-e="${i.id}" aria-label="Modifier">✏️</button>`:""}<button class="x" data-d="${i.id}" aria-label="Supprimer">×</button></span></div>`;
  $("#view").innerHTML=`<form id="add" class="${addOpen?"":"hid"}"><input type="text" id="new" placeholder="Ajouter un article…" autocomplete="off" enterkeyhint="done"></form><button class="fab" id="fabl" aria-label="Ajouter un article">+</button>`+
   // 🏠 à vérifier au placard : tous ensemble en haut de la liste
   (items.some(i=>i.check)?`<h3 class="ray">🏠 À vérifier au placard</h3><div class="card">${items.filter(i=>i.check).map(row).join("")}</div>`:"")+
   (items.length?rayonOrder(id).map(r=>{const g=items.filter(i=>!i.done&&!i.check&&rayonOf(i.text)===r.id);
      return g.length?`<h3 class="ray">${r.icon} ${esc(r.label)}</h3><div class="card">${g.map(row).join("")}</div>`:""}).join("")+
    (items.some(i=>i.done)?`<h3 class="ray">✅ Dans le caddie</h3><div class="card">${items.filter(i=>i.done).map(row).join("")}</div>`:"")+`
   ${items.some(i=>i.done)?`<button class="btn sec" id="clr">Retirer les articles cochés</button>`:""}`:`<div class="empty">Liste vide<br><small>Touchez + pour ajouter un article</small></div>`);
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
    const hits=known().filter(e=>nm(e.name).startsWith(q)||nm(e.name).includes(" "+q)) // début du nom ou d'un mot (« fraîche » → Crème fraîche)
      .sort((a,b)=>b.n-a.n||b.ts-a.ts).slice(0,25);
    // « cube de bouillon », « bouillon » : on propose les 3 sortes en premier, pas le bouillon sans précision
    if(q.length>=3&&["cube de bouillon","bouillon"].some(b=>b.startsWith(q)||q.startsWith(b))){
      const B=["Bouillon de légumes","Bouillon de volailles","Bouillon de bœuf"],bk=B.map(b=>nm(b));
      const others=hits.filter(e=>!bk.includes(nm(e.name))&&!/^(cubes? de )?bouillons?$/.test(nm(e.name)));
      hits.splice(0,hits.length,...B.map(b=>({name:b,text:b})),...others)}
    if(!hits.length)return;
    const box=document.createElement("div");box.className="sug";
    box.innerHTML=hits.map(e=>`<button type="button" data-t="${esc(e.text)}">${esc(e.text)}</button>`).join("");
    // au toucher : on choisit seulement si le doigt n'a pas bougé (la liste défile au doigt) ; à la souris, tout de suite
    const choose=b=>{addToList(id,b.dataset.t);inp.value="";closeSug();render();$("#new").focus()};
    box.onmousedown=ev=>ev.preventDefault();
    box.onpointerdown=ev=>{if(ev.pointerType==="touch")return;const b=ev.target.closest("button");if(!b)return;ev.preventDefault();choose(b)};
    let sy=0,moved=false;
    box.addEventListener("touchstart",ev=>{sy=ev.touches[0].clientY;moved=false},{passive:true});
    box.addEventListener("touchmove",ev=>{if(Math.abs(ev.touches[0].clientY-sy)>8)moved=true},{passive:true});
    box.addEventListener("touchend",ev=>{if(moved)return;const b=ev.target.closest("button");if(!b)return;ev.preventDefault();choose(b)});
    form.appendChild(box);
  };
  // case quittée sans rien taper : elle se referme (le + flottant la rouvre)
  inp.onblur=()=>setTimeout(()=>{closeSug();if(!inp.isConnected||document.activeElement===inp||inp.value.trim())return;addOpen=false;form.classList.add("hid")},300);
  // article jamais vu et que l'app ne sait pas ranger : on demande son rayon (retenu pour la suite)
  $("#add").onsubmit=e=>{e.preventDefault();const t=$("#new").value.trim();if(!t)return;
    const add=()=>{addToList(id,t);render();$("#new").focus()};
    const nm=Qty.parse(t).name||t,k=Rayons.keyOf(nm);
    if(S.aisles[k]&&!S.aisles[k].deleted||Rayons.guess(nm)!=="autres")return add();
    $("#new").blur();rayonAsk(nm,r=>{touch("aisles",{id:k,rayon:r});add()})};
  // + flottant (comme dans Recettes) : ouvre la case en haut (clavier) ; si on a déjà tapé, ajoute l'article
  $("#fabl").onclick=()=>{if($("#new").value.trim()){$("#add").requestSubmit();return}
    addOpen=true;form.classList.remove("hid");scrollTo(0,0);inp.focus()};

  document.querySelectorAll("[data-q]").forEach(el=>el.onclick=()=>{const i=S.items[el.dataset.q],t=Qty.step(i.text,+el.dataset.dir);if(t){touch("items",{...i,text:t});render()}});
  document.querySelectorAll("[data-imv]").forEach(el=>el.onclick=()=>moveItemDialog(S.items[el.dataset.imv]));
  document.querySelectorAll("[data-e]").forEach(el=>el.onclick=()=>{const i=S.items[el.dataset.e];if(!i.done)itemEditor(i)});
  // toucher un article : ses boutons (− + ⇄ ✏️ ×) apparaissent dessous ; re-toucher (ou un autre article) les cache
  document.querySelectorAll("[data-o]").forEach(el=>el.onclick=()=>{const id=el.dataset.o;openIt=openIt===id?null:id;
    document.querySelectorAll(".row.item.open").forEach(r=>r.classList.remove("open"));if(openIt)el.parentElement.classList.add("open")});
  document.querySelectorAll("[data-vok]").forEach(el=>el.onclick=()=>{const i=S.items[el.dataset.vok];touch("items",{...i,check:false,until:null,c:Date.now()});render()});
  document.querySelectorAll("[data-c]").forEach(el=>el.onchange=()=>{const i=S.items[el.dataset.c];touch("items",{...i,done:el.checked});recordPurchase(i.text,i.list,el.checked);render()});
  // retirer : « Annuler » pendant 5 s remet l'article tel qu'il était
  document.querySelectorAll("[data-d]").forEach(el=>el.onclick=()=>{const i=S.items[el.dataset.d],was={...i};touch("items",i.done?{...i,archived:true}:{...i,deleted:true});render();
    toast(`« ${i.text} » retiré`,()=>{touch("items",{...was});render()})});
  const c=$("#clr");if(c)c.onclick=()=>{const was=items.filter(i=>i.done).map(i=>({...i}));was.forEach(i=>touch("items",{...i,archived:true}));render();
    toast(`${was.length} article${was.length>1?"s":""} retiré${was.length>1?"s":""}`,()=>{was.forEach(i=>touch("items",{...i}));render()})};
}
// Ajoute un article à une liste en cumulant avec un article identique non coché (« 1 oignon » + « 3 oignons » = « 4 oignons »).
// Ingrédient « placard » d'un repas : une seule ligne 🏠 « à vérifier » (sans quantité), gardée jusqu'au dernier repas qui en a besoin.
// Rien si on l'achète déjà (article normal) ; pas de doublon si deux repas en ont besoin.
// boîtes de conserve (« 1 boîte de haricots rouges », « thon en boîte ») : à vérifier au placard, comme les épices
const isCan=t=>{const k=Qty.parse(t).kind;return k==="box"||k==="boxany"||/\b(boites?|conserves?)\b/.test(Data.plain(t))};
const pantryOf=t=>{const nm=pantryName(t),r=S.stores[Data.pantryKey(nm)];
  if(r&&!r.deleted&&r.pantry!=null)return r.pantry; // choix fait à la main (🏠 dans la recette)
  return Data.isPantry(S,nm)||isCan(t)};
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
// v191 : parcours de notre Auchan appliqué une fois à la liste Auchan (l'ordre reste modifiable dans Réglages → Rayons)
if(!LS.auchanOrder191&&S.lists.auchan){LS.auchanOrder191=1;if((S.lists.auchan.order||[]).join()!==Rayons.list.map(r=>r.id).join())setTimeout(()=>touch("lists",{...S.lists.auchan,order:Rayons.list.map(r=>r.id)}),3000)}
function rayonOrder(list){const o=(S.lists[list]&&S.lists[list].order)||[];
  return [...o.map(x=>Rayons.byId[x]).filter(Boolean),...Rayons.list.filter(r=>!o.includes(r.id))]}
// une boîte de légumes (« 1 boîte de tomates ») : rayon conserves (épicerie salée), pas fruits et légumes
function rayonOf(text){const p=Qty.parse(text),n=p.name||text,k=Rayons.keyOf(n);if(S.aisles[k]&&!S.aisles[k].deleted&&S.aisles[k].rayon)return S.aisles[k].rayon;
  const g=Rayons.guess(n);return g==="fruits"&&(p.kind==="box"||p.kind==="boxany")?"sale":g}
// Rayon d'un nouvel article (jamais vu, nom inconnu) : choix obligatoire avant de l'ajouter
function rayonAsk(name,done){
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Dans quel rayon ?</h2>
   <p class="mut">« ${esc(name.charAt(0).toUpperCase()+name.slice(1))} » est nouveau : choisissez son rayon (retenu pour la prochaine fois).</p>
   <div class="raygrid">${Rayons.list.map(r=>`<button type="button" class="btn sec" data-ray="${r.id}">${r.icon} ${esc(r.label)}</button>`).join("")}</div>
   <div class="acts"><button class="btn sec" id="rno">Annuler</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();$("#rno").onclick=close;
  ov.querySelectorAll("[data-ray]").forEach(b=>b.onclick=()=>{close();done(b.dataset.ray)});
}
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
  const was=m.servings||DEFN,min=bought(m)?was:1; // ingrédients achetés : on ne peut qu'augmenter
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
    touch("meals",o&&o.text?{...o,key:from}:{key:from,text:"",servings:m.servings||DEFN});
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
function planRecipe(r,sel,done){
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Ajouter « ${esc(r.name)} » aux menus</h2>
   <select id="plto" style="width:100%">${slotOptions(null,sel||nextFreeSlot()," (remplace)")}</select>
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">Ajouter</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove(),cancel=()=>{close();if(done)done()};ov.onclick=e=>{if(e.target===ov)cancel()};$("#no").onclick=cancel;
  $("#ok").onclick=()=>{
    const key=$("#plto").value,o=S.meals[key];
    if(o&&o.text){
      if(bought(o)){alert(`Les ingrédients de « ${o.text} » ont déjà été achetés : choisissez un autre créneau.`);return}
      if(!confirm(`Remplacer « ${o.text} » ?`))return;
      if(o.added)o.added.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,o.added.n/(o.added.b||BASE),o.added.b||BASE)));
    }
    const n=DEFN;
    touch("meals",{key,text:r.name,servings:n});gourmandWarn(key);applyCompanion(key);close();
    tab=LS.tab="menus";const d=new Date(key.slice(0,10)+"T12:00"),m=monday();setWk(wkOff()+Math.floor((d-m)/(7*864e5)+1e-9));
    render();ingredientsDialog(r.name,key,undefined,done);
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
  const B=r.serves||BASE,n=m.servings||DEFN,ids=new Set(),items=[];
  for(const g of r.ingredients){const store=defaultStore(g.t,g.store),t=Qty.buy(g.t,n/B,B);(pantryOf(g.t)?addCheck(store,t,key.slice(0,10),key):addToList(store,t)).forEach(x=>ids.add(x));items.push({t:g.t,store})}
  touch("meals",{...S.meals[key],added:{n,items,ids:[...ids],b:B}});
}
const slotName=k=>new Date(k.slice(0,10)+"T12:00").toLocaleDateString("fr-FR",{weekday:"long"})+(/-m\d*$/.test(k)?" midi":" soir")+(Data.isSecond(k)?" (2ᵉ plat)":"");
// 💡 : un plat pour chaque soir libre et pour les midis du week-end de la semaine affichée.
// Chaque ligne a son nombre de personnes ; × retire une suggestion ; ↻ en tire une autre.
function suggestDialog(){
  const today=todayKey(),rows=[];
  // samedi → vendredi suivant : midi et soir le week-end, soir seulement en semaine
  for(const key of Data.planSlots(today)){const we=[0,6].includes(new Date(key.slice(0,10)+"T12:00").getDay());
    if((we||key.endsWith("-s"))&&!(S.meals[key]&&S.meals[key].text))rows.push({key,n:DEFN})}
  if(!rows.length){alert("Tous les repas de samedi à vendredi sont déjà prévus.");return}
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
  if(!live_().length){alert("Aucune recette à suggérer pour l'instant : ajoutez des recettes dans 📖 Recettes.");return}
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
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>💡 Suggestions</h2><p class="sugper">${esc(label(rows[0].key).replace(/ (midi|soir)$/,""))} → ${esc(label(rows[rows.length-1].key).replace(/ (midi|soir)$/,""))}</p>
   <button type="button" class="btn sec nvbtn" id="nvnew">🆕 Découvrir de nouvelles recettes<small>Marmiton, CuisineAZ · moins de 30 min</small></button>
   <h3 class="sugh">📖 Parmi vos recettes</h3>
   <p class="mut">De saison, pas cuisinées depuis plus de 20 jours. Ensuite, les ingrédients s'affichent repas par repas : vous cochez ce qu'il faut acheter.</p>
   <div class="card" id="sugs"></div>
   ${rows.some(r=>!r.sug)?`<p class="mut">${rows.filter(r=>!r.sug).length} créneau${rows.filter(r=>!r.sug).length>1?"x":""} sans suggestion : plus de recettes donneront plus de choix.</p>`:""}
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok"></button></div></div>`;
  document.body.appendChild(ov);paint();
  const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  $("#nvnew").onclick=()=>{close();maybePropose(true,true)};
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
// Accompagnements retenus (affichage) : pour chaque recette, et chaque féculent (pâtes, riz, frites…), ce qui a été mis avec
// dans un repas (« Courgettes farcies, Orzo ») ou dans une association ajoutée à la main (« Pâtes, Œufs », supprimable)
function sidesLearned(){
  const rec=live(S.recipes).filter(r=>!Data.recipeDessert(r)),key=s=>Data.plain(s).trim(),out=new Map();
  const isRec=x=>rec.find(r=>key(r.name)===key(x)),starch=x=>{const f=Data.foodFor(x,true);return!!(f&&f.cat==="fec")};
  const texts=[...live(S.meals).map(m=>({t:m.text})),...live(S.combos||{}).filter(c=>c.kind!=="plaisir"&&c.kind!=="off"&&c.kind!=="refus").map(c=>({t:c.text,id:c.id}))].filter(x=>x.t);
  const isMain=x=>{if(isRec(x))return true;const f=Data.foodFor(x,true);return!!f&&(f.cat==="prot"||f.cat==="pois")};
  for(const {t,id} of texts){const p=t.split(/\s*(?:,|\+|\bet\b)\s*/i).filter(Boolean);if(p.length<2||Data.isOut(t))continue;
    if(p.filter(isMain).length>=2)continue; // « Hachis parmentier, Chili con carne » : deux repas distincts, pas un accompagnement
    // le plat principal : la recette ; sinon un type de plat (« Pâtes » avec œufs…) ; sinon ce qui n'est pas un féculent
    // (« Poulet rôti » avec pommes de terre : les pommes de terre sont l'accompagnement)
    let bases=p.filter(isRec);
    if(!bases.length)bases=p.filter(x=>{const f=Data.foodFor(x,true);return!!f&&(f.cat==="prot"||f.cat==="pois")}).slice(0,1); // viande, poisson
    if(!bases.length)bases=[...p.filter(x=>Data.typeOf(x)&&!starch(x)),...p.filter(x=>Data.typeOf(x))].slice(0,1); // « Poulet curry » avant « Riz »
    if(!bases.length)bases=p.filter(x=>!starch(x));
    for(const x of bases){const r=isRec(x),b=r?r.name:(Data.foodFor(x,true)||{}).label||x.charAt(0).toUpperCase()+x.slice(1);
      const o=out.get(b)||new Map(),side=p.filter(y=>y!==x).join(", "),k=key(side);if(Data.offPair(S,b,side))continue;
      o.set(k,{side,id:id||(o.get(k)||{}).id});out.set(b,o)}}
  return [...out].map(([recipe,s])=>({recipe,sides:[...s.values()]})).sort((a,b)=>a.recipe.localeCompare(b.recipe,"fr"));
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
const recipeOf=name=>name&&!Data.isOut(name)&&(live(S.recipes).find(x=>Data.plain(x.name).trim()===Data.plain(name).trim())||Data.suite(S,name))||null; // sans tenir compte des accents ni des majuscules
// semaine affichée : décalage par rapport à la semaine en cours, oublié après 6 h sans y toucher
// (sinon, l'app rouverte des jours plus tard restait sur une autre semaine)
const wkOff=()=>{if(Date.now()-(+LS.wkAt||0)>6*3600e3)LS.wk=0;return +LS.wk||0};
const setWk=v=>{LS.wk=v;LS.wkAt=Date.now()};
function monday(){const d=new Date();d.setHours(12);d.setDate(d.getDate()-((d.getDay()+6)%7)+7*wkOff());return d}
const LEGACY_TS=1791714864000; // mise en ligne du suivi des ajouts (v29)
const BASE=4,DEFN=3,VERSION="v283"; // BASE : recette sans nombre de parts ; DEFN : personnes par défaut d'un repas
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
// Liste de choix sous (ou au-dessus) du champ : au bas de l'écran (derniers jours de la semaine, clavier ouvert) elle s'ouvre
// vers le haut et sa hauteur s'adapte à la place visible, pour ne jamais passer sous la barre du bas.
function placeBox(box,host,slot){
  const vv=window.visualViewport,navH=(document.querySelector("nav")||{offsetHeight:64}).offsetHeight,
    bottom=(vv?vv.offsetTop+vv.height:innerHeight)-navH-6,topEdge=(document.querySelector("header")||{offsetHeight:60}).offsetHeight+6,
    r=slot.getBoundingClientRect(),below=bottom-r.bottom-4,above=r.top-topEdge-4,want=Math.min(box.scrollHeight,340);
  if(below>=Math.min(want,180)||below>=above){box.style.maxHeight=Math.max(110,Math.min(340,below))+"px";return}
  box.style.top="auto";box.style.bottom=(host.offsetHeight-slot.offsetTop+4)+"px";box.style.maxHeight=Math.max(110,Math.min(340,above))+"px";
}
// Historique : les 7 derniers jours restent modifiables (ce qui a vraiment été mangé), sans toucher aux listes
const histOk=k=>{const d=k.slice(0,10),t=todayKey();return d<t&&d>=Data.addDays(t,-7)};
function slotHtml(key,label,past){
  const e=S.meals[key]||{},n=e.servings||DEFN,b=bought(e),extras=extrasOf(key),has2=extras.length>=MAX_DISHES-1; // has2 : plus de place pour un plat de plus
  const h=past&&histOk(key);
  const lock=past?(h?"":e.text?'readonly title="Jour passé"':"disabled"):b?'readonly title="Ingrédients déjà achetés : déplacez le repas avec ⇄"':"";
  // la case prend toute la largeur : × (ou 🔒) passe dans la rangée de boutons du dessous ; seul 💡 reste à droite d'une case vide
  const right=!past&&!e.text?`<button class="pill bulb" data-bulb="${key}" aria-label="Suggestions">💡</button>`:"";
  const out=Data.isOut(e.text||"");
  const sub=!e.text?"":`<div class="sub">${
    out?`<span class="mut sm">Rien à acheter</span>`
    :past?`<span class="mut sm">${n} pers.${b?" · acheté":""}</span>`
    :b?`<div class="stp"><b>${n}</b><button data-sp="${key}" aria-label="Plus">+</button><em>pers. · acheté</em></div>`
    :`<div class="stp"><button data-sm="${key}" aria-label="Moins">−</button><b>${n}</b><button data-sp="${key}" aria-label="Plus">+</button><em>pers.</em></div><button class="pill" data-i="${key}" aria-label="Ingrédients" title="Ingrédients">🥕</button>`
  }${!past&&!has2&&!out?`<button class="pill add2" data-add2="${key}" aria-label="Ajouter un plat" title="Ajouter un plat">🍽️</button>`:""}<button class="pill" data-mv="${key}" aria-label="Déplacer">⇄</button>${past?(h?`<button class="x" data-del="${key}" aria-label="Effacer de l'historique">×</button>`:""):b?`<button class="lock" data-del="${key}" data-force="1" title="Ingrédients déjà achetés" aria-label="Supprimer quand même">🔒</button>`:`<button class="x" data-del="${key}" aria-label="Supprimer le repas">×</button>`}</div>`;
  return `<div class="slotw ${past?"past":""} ${h?"hist":""}"><div class="slot"><span class="lbl">${label}</span><span class="tagwrap ${tagsHtml(e.text)?"has":""}"><input type="text" data-m="${key}" placeholder="${past?(h?"Qu'avez-vous mangé ?":"—"):"Choisir un plat…"}" autocomplete="off" autocapitalize="sentences" value="${esc(e.text||"")}" ${lock}>${tagsHtml(e.text,key)}</span>${right}</div>${sub}</div>${extras.map((k2,i)=>secondHtml(k2,S.meals[k2],past,i+2)).join("")}`;
}
// 2e plat d'un repas (pour qui, plat, personnes, ingrédients) ; il se déplace avec le repas principal.
// Suite d'aliments : étiquettes colorées par-dessus le champ (le texte réapparaît quand on le touche).
const tagsHtml=(text,key)=>{const real=live(S.recipes).some(r=>r.name.toLowerCase()===String(text||"").toLowerCase());
  if(real)return `<span class="tags"><i class="rcp"><button type="button" class="cookb" data-cook="${esc(text)}" data-k="${key||""}" aria-label="Voir la recette">📖</button> <b>${esc(text)}</b></i></span>`; // recette : livre + nom en gras
  if(text&&Data.isOut(text))return `<span class="tags" aria-hidden="true"><i class="tag out">🍽️ ${esc(text)}</i></span>`;
  const tags=text?Data.suiteTags(S,text):null;
  return tags?`<span class="tags" aria-hidden="true">${tags.map(x=>`<i class="tag ${x.cat}">${x.cat==="rcp"?"📖 ":""}${esc(x.t.charAt(0).toUpperCase()+x.t.slice(1))}</i>`).join("")}</span>`:""};
function secondHtml(k2,e,past,pos){ // pos : rang affiché (2ᵉ, 3ᵉ…), sans trou si un plat a été retiré
  // comme un repas : case pleine largeur, puis personnes, 🥕 et × sur la rangée du dessous
  const n=e.servings||1,b=bought(e),h=past&&histOk(k2);
  const lock=past?(h?"":"readonly"):b?"readonly":"";
  // vide : 💡 et × à droite de la case (pas de rangée du dessous)
  const right=!past&&!b&&!e.text?`<button class="pill bulb" data-bulb="${k2}" aria-label="Suggestions">💡</button><button class="x" data-del="${k2}" aria-label="Retirer ce plat">×</button>`:"";
  const sub=!e.text?"":past?`<div class="sub"><span class="mut sm">${n} pers.</span>${h?`<button class="x" data-del="${k2}" aria-label="Effacer de l'historique">×</button>`:""}</div>`
    :`<div class="sub">${b?`<div class="stp"><b>${n}</b><em>pers. · acheté</em></div><button class="lock" data-del="${k2}" data-force="1" title="Ingrédients déjà achetés" aria-label="Supprimer quand même">🔒</button>`
    :`<div class="stp"><button data-sm="${k2}" aria-label="Moins">−</button><b>${n}</b><button data-sp="${k2}" aria-label="Plus">+</button><em>pers.</em></div><button class="pill" data-i="${k2}" aria-label="Ingrédients" title="Ingrédients">🥕</button><button class="x" data-del="${k2}" aria-label="Retirer ce plat">×</button>`}</div>`;
  return `<div class="slotw second ${past?"past":""} ${h?"hist":""}"><div class="slot"><span class="lbl">+ ${pos||2}ᵉ plat</span><span class="tagwrap ${tagsHtml(e.text)?"has":""}"><input type="text" data-m="${k2}" placeholder="${past?(h?"Qu'avez-vous mangé ?":"—"):"Autre plat…"}" autocomplete="off" autocapitalize="sentences" value="${esc(e.text||"")}" ${lock}>${tagsHtml(e.text,k2)}</span>${right}</div>${sub}</div>`;
}
function renderMenus(){
  const ps=Data.planSlots(todayKey()),sd=k=>new Date(k.slice(0,10)+"T12:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric"}).replace(".","");
  $("#title").innerHTML=`<span>Menus <span class="hicon">${MENU_ICON}</span></span><button class="hsugg" id="sugg"><i>💡</i><span><b>Suggérer</b><small>${sd(ps[0])} → ${sd(ps[ps.length-1])}</small></span></button>`;
  const m=monday(),today=todayKey();
  const end=new Date(m);end.setDate(m.getDate()+6);
  const f=d=>d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
  let h=`<div class="wk"><button class="btn sec" id="pv">‹</button><div>${f(m)} – ${f(end)}</div><button class="btn sec" id="nx">›</button></div>`;
  for(let n=0;n<7;n++){
    const d=new Date(m);d.setDate(m.getDate()+n);const k=d.toISOString().slice(0,10);
    const wd=d.toLocaleDateString("fr-FR",{weekday:"long"}); // jour en en-tête de la carte : « lundi 26 octobre », « dimanche 1er novembre »
    const dm=(d.getDate()===1?"1er":d.getDate())+" "+d.toLocaleDateString("fr-FR",{month:"long"});
    const slots=[["m","Midi"],["s","Soir"]].map(([s,l])=>slotHtml(k+"-"+s,l,k<today)).join("");
    if(k<today){ // jour passé : replié sur sa date, on le déplie en le touchant
      h+=`<details class="pastd" data-pd="${k}" ${openPast.has(k)?"open":""}><summary><b>${wd}</b><small>${dm}</small></summary><div class="slots">${slots}</div></details>`;
      continue}
    h+=`<section class="day ${k===today?"today":""}"><div class="dh"><b>${wd}</b><small>${dm}</small></div><div class="slots">`+slots+`</div></section>`;
  }
  $("#view").innerHTML=h;
  document.querySelectorAll("[data-pd]").forEach(d=>d.ontoggle=()=>{if(d.open)openPast.add(d.dataset.pd);else openPast.delete(d.dataset.pd)});
  document.querySelectorAll("[data-cook]").forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();const r=recipeOf(b.dataset.cook),m=S.meals[b.dataset.k];if(r&&!r.virtual)cookView(r,m&&m.servings)});
  const norm=Data.plain;
  const names=()=>{const seen=new Set(),out=[];
    for(const [t,recipe] of [...live(S.recipes).map(r=>[r.name,true]),...live(S.meals).map(m=>[m.text,false]).filter(x=>x[0])]){const k=norm(t);if(!seen.has(k)){seen.add(k);out.push({t,recipe})}}
    // écarte les fragments saisis à moitié (ex. « Pom » quand « Pommes de terre… » existe)
    return out.filter(x=>x.recipe||!out.some(y=>y!==x&&norm(y.t).length>norm(x.t).length&&norm(y.t).startsWith(norm(x.t))))};
  const commit=(el,t,quiet,after)=>{ // after : une fois la fenêtre des ingrédients fermée // quiet : enregistre le repas sans ouvrir la fenêtre des ingrédients
    const key=el.dataset.m,o=S.meals[key]||{};
    if(key.slice(0,10)<todayKey()){
      if(!histOk(key)){el.value=o.text||"";return}
      // historique : on note ce qui a été mangé ; les listes de courses ne bougent pas (le lien avec elles est retiré)
      t=String(t||"").replace(/[\s,+]+$/,"");if(Data.isOut(t))t=Data.OUT;const kn=t&&live(S.recipes).find(r=>norm(r.name)===norm(t));
      if(norm(t)!==norm(o.text||""))touch("meals",{...o,key,text:t?(kn?kn.name:t):"",servings:o.servings||(Data.isSecond(key)?1:BASE),added:null});
      render();return}
    // plat remplacé ou effacé : on retire des listes ce que l'ancien plat y avait ajouté
    if(bought(o)&&norm(o.text||"")!==norm(t)){
      el.value=o.text;
      alert(`Les ingrédients de « ${o.text} » ont déjà été achetés : ce repas ne peut pas être supprimé ni remplacé. Utilisez ⇄ pour le déplacer.`);
      return;
    }
    const dropOld=()=>{if(norm(o.text||"")===norm(t))return;dropChecks(key);
      if(o.added)o.added.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,o.added.n/(o.added.b||BASE),o.added.b||BASE)))};
    dropOld();
    if(!t){if(o.text)touch("meals",{key,text:"",servings:o.servings||DEFN});if(!Data.isSecond(key))removeSecond(key);render();return}
    t=t.replace(/[\s,+]+$/,"");if(Data.isOut(t))t=Data.OUT; // restaurant, invitation… : « Repas à l'extérieur »
    const known=live(S.recipes).find(r=>norm(r.name)===norm(t));
    touch("meals",{key,text:known?known.name:t,servings:o.servings||(Data.isSecond(key)?1:DEFN)});
    gourmandWarn(key);
    if(Data.isOut(t)){render();return} // repas dehors : rien à acheter, pas de fenêtre des ingrédients
    applyCompanion(key);render();if(quiet)return;
    // Entrée pour finir : chaque aliment inconnu de ce repas est décrit tout de suite (famille, quantité, unité, magasin ;
    // « Plus tard » : il reste une simple ligne et sera redemandé), puis la fenêtre des ingrédients s'ouvre avec les quantités.
    const waiting=Data.unknownFoods(S,t).map(p=>({id:"c-"+uid(),label:p.charAt(0).toUpperCase()+p.slice(1)}));
    const next=i=>i<waiting.length?foodEditor(null,waiting[i],()=>next(i+1),`${i+1}/${waiting.length}`):ingredientsDialog(known?known.name:t,key,undefined,after);
    next(0);
  };
  const clearSug=()=>document.querySelectorAll(".sug").forEach(x=>x.remove());
  document.querySelectorAll("[data-m]").forEach(el=>{
    const showBox=hits=>{
      clearSug();if(!hits.length)return;
      const box=document.createElement("div");box.className="sug";
      box.innerHTML=hits.map(x=>`<button type="button" data-t="${esc(x.t)}" ${x.food?'data-food="1"':""}>${ico(x.icon)} ${esc(x.food?x.t.split(/[,+]/).pop().trim():x.t)}${x.note?` <small class="mut">${esc(x.note)}</small>`:""}</button>`).join("");
      // iPhone : toucher une suggestion ne doit pas fermer le champ ; mais la liste doit pouvoir défiler au doigt :
      // au toucher, on choisit seulement si le doigt n'a pas bougé (relâché sur le même bouton) ; à la souris, tout de suite
      const choose=b=>{el._pick=Date.now();
        if(b.dataset.food){addChip(b.dataset.t.split(/[,+]/).pop().trim());clearSug();el.focus();return} // pastille, puis l'aliment suivant
        // plat déjà fait qui est une suite d'aliments (« Steak haché », « Poulet, riz ») : en pastilles, on continue la saisie
        const t=b.dataset.t,tags=live(S.recipes).some(r=>norm(r.name)===norm(t))||Data.isOut(t)?null:Data.suiteTags(S,t);
        if(tags)tags.forEach(x=>addChip(x.t));else addChip(t);clearSug();el.focus()};
      box.onmousedown=e=>e.preventDefault();
      box.onpointerdown=e=>{if(e.pointerType==="touch")return;const b=e.target.closest("button");if(!b)return;e.preventDefault();choose(b)};
      let sy=0,moved=false;
      box.addEventListener("touchstart",e=>{sy=e.touches[0].clientY;moved=false;el._pick=Date.now()},{passive:true});
      box.addEventListener("touchmove",e=>{if(Math.abs(e.touches[0].clientY-sy)>8)moved=true;el._pick=Date.now()},{passive:true});
      box.addEventListener("touchend",e=>{el._pick=Date.now();if(moved)return;const b=e.target.closest("button");if(!b)return;e.preventDefault();choose(b)});
      const sw=el.closest(".slotw");sw.appendChild(box);placeBox(box,sw,el.closest(".slot"));
    };
    // créneau vide touché sans rien taper : les meilleures suggestions (saison, pas faites depuis un mois)
    el.tips=()=>{if(el.readOnly||el.disabled||el.value.trim())return;
      // 10 idées tirées au hasard parmi les 30 meilleures (saison, pas faites récemment) : une liste différente à chaque ouverture
      showBox([{t:Data.OUT,icon:"🍽️",note:"rien à acheter"},...Data.suggest(S,todayKey(),30,[],Math.random,el.dataset.m).map(v=>[Math.random(),v]).sort((p,q)=>p[0]-q[0]).slice(0,10).map(p=>p[1]).map(x=>({t:x.name,icon:x.habit?typeById(x.habit).icon:"💡",note:x.days==null?"jamais fait":`il y a ${x.days} j`}))])};
    // Suite d'aliments en cours de saisie : pastilles devant le champ, Entrée valide l'aliment et passe au suivant.
    el._items=[];
    const drawChips=()=>{const w=el.parentElement;let c=w.querySelector(".chips");
      w.classList.remove("has");w.querySelector(".tags")?.remove(); // en saisie : plus d'ancien affichage par-dessus (il doublait les pastilles)
      if(!c){c=document.createElement("span");c.className="chips";w.insertBefore(c,el)}
      w.classList.toggle("editing",el._items.length>0);el.placeholder=el._items.length?"Ajouter…":el.dataset.ph;
      c.innerHTML=el._items.map((t,i)=>{const r=live(S.recipes).some(x=>norm(x.name)===norm(t)),f=Data.foodFor(t);return `<i class="tag ${r?"rcp":f?f.cat:"autre"}">${r?"📖 ":""}${esc(t.charAt(0).toUpperCase()+t.slice(1))}<b data-ci="${i}">×</b></i>`}).join("");
      c.onpointerdown=e=>{const x=e.target.closest("[data-ci]");e.preventDefault();if(x){el._items.splice(+x.dataset.ci,1);drawChips()}el.focus()}};
    // un seul plat principal (recette, viande ou poisson) par plat : les suivants partent chacun dans un nouveau plat
    // du même repas (à la fin de la saisie) ; les accompagnements (riz, salade, haricots verts…) restent ensemble
    const isRcp=t=>live(S.recipes).some(r=>norm(r.name)===norm(t));
    const isMain=t=>{if(isRcp(t))return true;const f=Data.foodFor(t);return !!f&&(f.cat==="prot"||f.cat==="pois")};
    const addChip=t=>{t=t.trim();if(!t)return;el._items.push(t);el.value="";drawChips();
      setTimeout(()=>{if(!el._finish&&document.activeElement!==el)el.focus()},60)}; // l'iPhone peut avoir quitté le champ : on y revient
    el.dataset.ph=el.placeholder;
    el.onfocus=()=>{clearTimeout(el._done);if(el._items.length){drawChips();return} // retour dans le champ : on continue la saisie
      el._orig=el.value;const v=el.value.trim(),tags=live(S.recipes).some(r=>norm(r.name)===norm(v))||Data.isOut(v)?[{t:v}]:Data.suiteTags(S,el.value);
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
      const outHit=/^(rep|ext|l'?ex|res|deh|au r|inv|chez)/.test(q)?[{t:Data.OUT,icon:"🍽️",note:"rien à acheter"}]:[];
      showBox([...outHit,...foods.slice(0,3),...names().filter(x=>norm(x.t).includes(q)&&norm(x.t)!==q&&!Data.isOut(x.t)).sort((a,b)=>b.recipe-a.recipe||(norm(b.t).startsWith(q)-norm(a.t).startsWith(q))).slice(0,40)
        .filter(x=>!foods.some(f=>norm(f.t)===norm(x.t))).map(x=>({t:x.t,icon:x.recipe?"📖":"🕘"}))]);
    };
    // Fin de saisie en pastilles : seulement si le champ reste vraiment quitté (l'iPhone le quitte un instant quand on
    // touche une suggestion ou une pastille, puis on y revient : dans ce cas on ne valide rien).
    el.onblur=()=>{setTimeout(clearSug,150);if(!el._items.length&&!el._finish&&!el.value.trim())return;
      clearTimeout(el._done);el._done=setTimeout(()=>{if(document.activeElement===el)return;
        let parts=[...el._items,...el.value.split(/\s*[,+]\s*/)].map(x=>x.trim()).filter(Boolean);
        const extra=parts.filter(isMain).slice(1);if(extra.length)parts=parts.filter(x=>!extra.includes(x));
        const full=parts.join(", ");el._items=[];el.value=full;
        // Entrée dans la case vide : on ouvre les ingrédients ; sinon (case quittée) on enregistre sans rien ouvrir (🥕 pour les ingrédients)
        const fin=el._finish;el._finish=false;
        // 2e plat principal sur la même ligne : nouveau plat du même repas, même nombre de personnes ;
        // avec Entrée, sa fenêtre des ingrédients s'ouvre après celle du premier
        const key=el.dataset.m,base=key.replace(/\d+$/,""),k2s=[];
        if(extra.length&&(key.slice(0,10)>=todayKey()||histOk(key))){const n=(S.meals[key]&&S.meals[key].servings)||(S.meals[base]&&S.meals[base].servings)||DEFN;
          for(const t of extra){const r=live(S.recipes).find(x=>norm(x.name)===norm(t)),k2=addSecond(base,n,r?r.name:t.charAt(0).toUpperCase()+t.slice(1),true);if(!k2)break;k2s.push(k2)}}
        const more=i=>{if(i<k2s.length)ingredientsDialog(S.meals[k2s[i]].text,k2s[i],undefined,()=>more(i+1))};
        const fut=key.slice(0,10)>=todayKey(); // pas de fenêtre des ingrédients pour un jour passé
        if(norm(full)!==norm(el._orig||""))commit(el,full,!fin,()=>{if(fin&&fut)more(0)});else{render();if(fin&&fut)more(0)}},Date.now()-(el._pick||0)<800?900:400)};
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
    if(key.slice(0,10)<todayKey()){if(!histOk(key))return;
      if(m.text&&!confirm(`Effacer « ${m.text} » de l'historique ?`))return;
      touch("meals",Data.isSecond(key)?{key,text:"",deleted:true}:{...m,key,text:"",added:null});render();return}
    if(bought(m)){
      if(!el.dataset.force){alert(`Les ingrédients de « ${m.text} » ont déjà été achetés : ce repas ne peut pas être supprimé. Utilisez ⇄ pour le déplacer.`);return}
      // 🔒 touché : on peut quand même supprimer (essai, erreur) ; les articles déjà achetés restent dans l'historique
      if(!confirm(`Les ingrédients de « ${m.text} » ont déjà été achetés.\nSupprimer quand même ce repas ? Ce qui n'est pas encore acheté sera retiré des listes.`))return;
    }
    else if(m.text&&!confirm(`Supprimer « ${m.text} »${m.added?" et retirer ses ingrédients des listes":""} ?`))return;
    dropChecks(key);if(m.added)m.added.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,m.added.n/(m.added.b||BASE),m.added.b||BASE)));
    if(Data.isSecond(key))touch("meals",{key,text:"",deleted:true});
    else{touch("meals",{key,text:"",servings:m.servings||DEFN});removeSecond(key)}
    render();
  });
  // − / + sur un repas : ouvre la fenêtre des ingrédients au nouveau nombre de personnes (rien n'est appliqué sans valider).
  const step=(key,d)=>{const m=S.meals[key];
    // − à 1 personne : 0 personne = repas à l'extérieur (ses ingrédients sont retirés des listes, sauf déjà achetés)
    if(d<0&&(m.servings||DEFN)<=1&&!Data.isSecond(key)&&!bought(m)){
      if(!confirm(`0 personne : « ${m.text} » devient « ${Data.OUT} »${m.added?" et ses ingrédients sont retirés des listes":""} ?`))return;
      dropChecks(key);if(m.added)m.added.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,m.added.n/(m.added.b||BASE),m.added.b||BASE)));
      removeSecond(key);touch("meals",{key,text:Data.OUT,servings:1,added:null});render();return}
    const n=Math.max(1,Math.min(30,(m.servings||DEFN)+d));
    if(bought(m)&&d>0)extraDialog(key,n);
    else if(recipeOf(m.text))ingredientsDialog(m.text,key,n);
    else{touch("meals",{...m,servings:n});render()}};
  document.querySelectorAll("[data-sm]").forEach(el=>el.onclick=()=>step(el.dataset.sm,-1));
  document.querySelectorAll("[data-sp]").forEach(el=>el.onclick=()=>step(el.dataset.sp,1));
  $("#sugg").onclick=suggestDialog;
  $("#pv").onclick=()=>{setWk(wkOff()-1);render()};$("#nx").onclick=()=>{setWk(wkOff()+1);render()};
}
// after : appelé une fois la fenêtre fermée (validée ou ignorée) ; step : « Repas 2/5 · mardi soir »
function ingredientsDialog(name,mealKey,startN,after,step){
  // Plat ou aliment inconnu tapé seul : une ligne sans quantité, comme dans une suite ; il attend dans
  // 📖 Recettes → Ingrédients → ⏳ À classer. Les recettes se créent dans 📖 Recettes.
  const r=recipeOf(name)||{name,serves:1,virtual:true,ingredients:[{t:name,store:"auchan"}]};
  const lists=live(S.lists).sort(listSort);
  const opts=sel=>lists.map(l=>`<option value="${l.id}" ${l.id===sel?"selected":""}>${esc(l.name)}</option>`).join("");
  const B=(r&&r.serves)||BASE; // la recette est écrite pour B personnes
  const meal=mealKey&&S.meals[mealKey],prev=meal&&meal.text===name&&meal.added;
  let n=startN||(meal&&meal.servings)||DEFN;
  const was=t=>prev&&prev.items.find(g=>g.t===t);
  const ov=document.createElement("div");ov.className="ov";
  const home=t=>prev&&t&&!was(t); // décoché lors de l'ajout : on l'avait à la maison
  const rowH=i=>`<div class="row ing-row" data-base="${esc(i.t)}" ${home(i.t)?'data-home="1"':""}><input type="checkbox" ${!prev||was(i.t)?"checked":""}><input type="text" class="ing" value="${esc(Qty.buy(i.t,n/B,B))}" data-shown="${esc(Qty.buy(i.t,n/B,B))}"><span class="stp sm"><button type="button" data-st="-1" aria-label="Moins">−</button><button type="button" data-st="1" aria-label="Plus">+</button></span><select>${opts(was(i.t)?was(i.t).store:defaultStore(i.t,i.store))}</select><p class="homewarn"></p></div>`;
  ov.innerHTML=`<div class="sheet"><div class="grab"></div>${step?`<p class="mut step">${esc(step)}</p>`:""}<h2>${esc(name)}</h2>
   ${r&&meal&&meal.text&&!prev&&meal.ts<LEGACY_TS?`<p class="homewarn" style="margin:6px 0">⚠ Ce repas date d'avant le suivi des ajouts : vérifiez qu'il n'est pas déjà dans vos listes avant d'ajouter.</p>`:""}
   ${prev?`<p class="okmsg">✓ Déjà dans les listes pour ${prev.n} personne${prev.n>1?"s":""}. Changer le nombre de personnes ou les cases met à jour les listes.</p>`:""}
   ${r?`<div class="serv"><span>Pour</span><button class="btn sec" id="mn">−</button><b id="nn">${n}</b><button class="btn sec" id="pl">+</button><span>personnes</span></div>
   <p class="mut">Cochez ce qu'il faut acheter et choisissez le magasin. ${r.virtual?"Quantités par personne, réglables dans 📖 Recettes → Ingrédients.":`Recette pour ${B} personne${B>1?"s":""}.`}</p>
   <div id="ings" class="card">${r.ingredients.filter(i=>!pantryOf(i.t)).map(rowH).join("")}</div><button class="addrow" id="more"><i>+</i>Ajouter un ingrédient</button>`
   :`<p class="mut">Nouvelle recette : un ingrédient par ligne, quantité en premier (ex. « 400 g de pâtes »).</p><div class="serv"><span>Recette pour</span><input type="number" id="sv" value="${n}" min="1" max="30" inputmode="numeric" style="width:70px"><span>personnes</span></div><textarea id="ta" rows="7" placeholder="400 g de pâtes&#10;200 g de lardons&#10;2 oeufs&#10;crème fraîche"></textarea>`}
   <div class="acts"><button class="btn sec" id="no">Ne pas ajouter<br>aux listes</button><button class="btn" id="ok">${!r?"Continuer":prev?"Mettre à jour<br>les listes":"Ajouter<br>aux listes"}</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  // « Ne pas ajouter aux listes » : rien n'est ajouté aux listes, mais le nombre de personnes choisi est gardé pour le repas
  const skip=()=>{close();const m=mealKey&&S.meals[mealKey];
    if(r&&m&&m.text){addPantry(r,mealKey);if(n!==(m.servings||DEFN))touch("meals",{...m,servings:n});render()} // les « à vérifier » sont ajoutés quand même
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
      rows.filter(x=>x.on).forEach(x=>(pantryOf(x.orig||x.shown)||isCan(x.shown)?addCheck(x.store,x.shown,mealKey&&mealKey.slice(0,10),mealKey):addToList(x.store,x.shown)).forEach(i=>ids.add(i)));
      pan.forEach(g=>addCheck(g.store,g.t,mealKey&&mealKey.slice(0,10),mealKey).forEach(i=>ids.add(i)));
    }
    // la recette ne change pas avec les quantités achetées ; seuls les ingrédients ajoutés (+ Ingrédient) s'y ajoutent
    const extra=rows.filter(x=>!x.orig).map(x=>({t:x.base,store:x.store}));
    if(extra.length&&!r.virtual)touch("recipes",{...r,ingredients:[...r.ingredients,...extra]});
    if(meal)touch("meals",{...S.meals[mealKey],servings:n,added:{n,items:now,ids:[...ids],b:B}});
    close();render();if(after)after();
  };
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-st2]");if(b){tab=LS.tab=b.dataset.st2;render();scrollTo(0,0)}});
$("#tabs").onclick=e=>{let t=(e.target.closest("[data-t]")||{dataset:{}}).dataset.t;if(t==="recettes")rview="rec";if(t==="courses")t=S.lists[LS.store]&&!S.lists[LS.store].deleted?LS.store:"auchan";if(t){tab=LS.tab=t;render();scrollTo(0,0);
  if(t==="menus"){toToday();setTimeout(()=>{maybeAvis()},600)}
  if(t==="recettes")setTimeout(dailyIdeas,600);
  if(window.syncSoon)syncSoon()}};
// Menus : aujourd'hui en haut de l'écran (ouverture de l'app ou de l'onglet)
const toToday=()=>{const d=document.querySelector(".day.today");if(d)scrollTo(0,Math.max(0,d.getBoundingClientRect().top+scrollY-(document.querySelector("header").offsetHeight+8)))};
$("#cfg").onclick=()=>{stab="foyer";tab=LS.tab="settings";render();scrollTo(0,0)};
let stab="foyer"; // onglet des réglages ; « Synchro » à chaque ouverture
const STABS=[["habitudes","Habitudes"],["rayons","Rayons"],["foyer","Synchro"]];
// Liste des recettes (onglet Menus → Recettes) : recherche, A-Z, toucher = vue cuisine
// filtres des recettes : Gourmand se cumule avec Été, Hiver ou Noël (les recettes de Noël sont aussi dans Hiver) ; « Toutes » enlève tout
const rfOn=v=>v===""?!LS.rfg&&!LS.rfs:v==="g"?!!LS.rfg:LS.rfs===v;
function recipesHtml(){const rs=live(S.recipes).sort((a,b)=>a.name.localeCompare(b.name));
  return `${rs.length>3?`<input type="search" id="rq" class="rsearch" placeholder="🔍 Chercher une recette ou un ingrédient" autocomplete="off"><div class="rfil">${[["","Toutes"],["g","😋 Gourmand"],["ete","☀️ Été"],["hiver","❄️ Hiver"],["dec","🎄 Noël"]].map(([v,l])=>`<button type="button" data-rf="${v}" class="${rfOn(v)?"on":""}">${l}</button>`).join("")}</div>`:""}${rs.length?`<p class="mut count">${rs.length} recette${rs.length>1?"s":""}</p>`:""}${rs.length?(()=>{const g={};for(const r of rs){const L=(Data.plain(r.name).trim()[0]||"#").toUpperCase();(g[/[A-Z]/.test(L)?L:"#"]=g[/[A-Z]/.test(L)?L:"#"]||[]).push(r)}
     return Object.keys(g).sort().map(L=>`<h3 class="ray letter" data-l="${L}">${L}</h3><div class="card" data-lc="${L}">${g[L].map(r=>`<div class="row link" data-r="${r.id}" data-f="${(r.gourmand?"g ":"")+({dec:"hiver dec"}[Data.recipeSeason(r)]||Data.recipeSeason(r))}" data-q="${esc(Data.plain(r.name+" "+r.ingredients.map(i=>i.t).join(" ")))}"><span class="t">${esc(r.name)}<br><small class="mut">${r.ingredients.length} ingrédient${r.ingredients.length>1?"s":""} · pour ${r.serves||BASE} pers.${Data.recipeDessert(r)?" · 🍰 dessert":""}${r.gourmand?" · 😋 gourmand":""}${{ete:" · ☀️ été",hiver:" · ❄️ hiver",dec:" · 🎄 Noël"}[Data.recipeSeason(r)]||""}</small></span><span class="mut">›</span></div>`).join("")}</div>`).join("")})():`<div class="card"><div class="empty">Aucune recette pour l'instant</div></div>`}`+azHtml(rs)+`<button class="fab" id="fabr" aria-label="Nouvelle recette" title="Nouvelle recette">+</button>`}
// Index A-Z sur le bord droit (comme les Contacts) : toucher une lettre, ou glisser le doigt dessus, saute à ses recettes
const lettre=r=>{const L=(Data.plain(r.name).trim()[0]||"#").toUpperCase();return /[A-Z]/.test(L)?L:"#"};
function azHtml(rs){const ls=[...new Set(rs.map(lettre))].sort();
  return rs.length>=12&&ls.length>=3?`<div class="az" aria-label="Aller à la lettre">${ls.map(L=>`<b data-jl="${L}">${L}</b>`).join("")}</div><div class="azb" hidden></div>`:""}
function wireAz(){const az=$(".az"),bub=$(".azb");if(!az)return;document.body.classList.add("withaz");let last=null,t=0;
  // taille des lettres : la plus grande qui tient dans la hauteur disponible (de 11 à 18 points)
  az.style.setProperty("--azf",Math.max(11,Math.min(18,Math.floor(az.clientHeight/az.children.length/1.3)))+"px");
  const go=L=>{const h=document.querySelector(`[data-l="${L}"]`);if(!h||h.hidden)return;
    scrollTo(0,h.getBoundingClientRect().top+scrollY-document.querySelector("header").offsetHeight-6);
    bub.textContent=L;bub.hidden=false;clearTimeout(t);t=setTimeout(()=>bub.hidden=true,700)};
  const at=y=>{const r=az.getBoundingClientRect(),el=document.elementFromPoint(r.left+r.width/2,Math.max(r.top+1,Math.min(r.bottom-1,y)));return el&&el.dataset&&el.dataset.jl};
  const move=e=>{e.preventDefault();const L=at(e.touches[0].clientY);if(L&&L!==last){last=L;go(L)}};
  az.addEventListener("touchstart",move,{passive:false});az.addEventListener("touchmove",move,{passive:false});
  az.addEventListener("touchend",()=>{last=null});
  az.onclick=e=>{const L=e.target.dataset&&e.target.dataset.jl;if(L)go(L)}}
function wireRecipes(){const on=(sel,ev,fn)=>{const el=$(sel);if(el)el[ev]=fn};
  document.body.classList.remove("withaz");wireAz();
  on("#fabr","onclick",()=>recipeEditor(null));
  document.querySelectorAll("[data-r]").forEach(el=>el.onclick=()=>cookView(S.recipes[el.dataset.r])); // toucher = voir la recette
  // recherche : nom ou ingrédient, sans accents ; les lettres sans résultat disparaissent
  // + filtre Gourmand / Été / Hiver (gardé d'une fois sur l'autre)
  const apply=()=>{const q=Data.plain(($("#rq")||{value:""}).value).trim(),need=[LS.rfg?"g":"",LS.rfs||""].filter(Boolean),f=need.length;let n=0;
    document.querySelectorAll("[data-q]").forEach(el=>{const t=el.dataset.f.split(" "),ok=(!q||el.dataset.q.includes(q))&&need.every(x=>t.includes(x));el.hidden=!ok;n+=ok});
    document.querySelectorAll("[data-lc]").forEach(c=>{const any=[...c.children].some(x=>!x.hidden);c.hidden=!any;document.querySelector(`[data-l="${c.dataset.lc}"]`).hidden=!any});
    const ct=document.querySelector(".count");if(ct)ct.textContent=q||f?`${n} recette${n>1?"s":""}`:`${live(S.recipes).length} recettes`;
    const az=$(".az");if(az)az.hidden=!!(q||f)};
  on("#rq","oninput",apply);
  document.querySelectorAll("[data-rf]").forEach(b=>b.onclick=()=>{const v=b.dataset.rf;
    if(!v){delete LS.rfg;delete LS.rfs}else if(v==="g"){if(LS.rfg)delete LS.rfg;else LS.rfg="1"}else if(LS.rfs===v)delete LS.rfs;else LS.rfs=v;
    document.querySelectorAll("[data-rf]").forEach(x=>x.classList.toggle("on",rfOn(x.dataset.rf)));apply()});
  if(LS.rfg||LS.rfs)apply()}
// Onglet 📖 : « Recettes | Ingrédients » (les ingrédients utilisent l'écran des réglages, avec ce sélecteur à la place)
const rseg=v=>`<div class="seg"><button data-rv="rec" class="${v==="rec"?"on":""}">Recettes</button><button data-rv="ing" class="${v==="ing"?"on":""}">Ingrédients</button></div>`;
function renderRecipes(){
  if(rview==="ing"){stab="aliments";renderSettings(true)}
  else{$("#title").innerHTML=`Recettes <span class="hicon">📖</span>`;$("#view").innerHTML=rseg("rec")+recipesHtml();wireRecipes()}
  document.querySelectorAll("[data-rv]").forEach(b=>b.onclick=()=>{rview=b.dataset.rv;render();scrollTo(0,0)})}
function renderSettings(inRecipes){
  if(!inRecipes&&stab==="aliments")stab="foyer";
  if(inRecipes)$("#title").innerHTML=`Recettes <span class="hicon">📖</span>`;else $("#title").textContent="Réglages";
  const rs=live(S.recipes).sort((a,b)=>a.name.localeCompare(b.name));
  const hs=live(S.habits).filter(h=>h.state==="on").sort((a,b)=>a.days[0]-b.days[0]||b.slot.localeCompare(a.slot));
  const tabs=inRecipes?rseg("ing"):`<div class="seg">${STABS.map(([id,l])=>`<button data-stab="${id}" class="${stab===id?"on":""}">${l}</button>`).join("")}</div>`;
  const body={
   aliments:`<p class="mut">Quantité par personne quand vous tapez une suite d'aliments dans un repas (ex. « viande rouge, haricots verts, pommes de terre surgelées »).</p>
   <input type="search" id="fsearch" placeholder="🔎 Rechercher un ingrédient" autocomplete="off" style="width:100%;margin-bottom:6px">
   ${[["leg","🥦 Légumes"],["fec","🥔 Féculents"],["prot","🥩 Viandes, œufs"],["pois","🐟 Poissons, crustacés"],["autre","🍽️ Autres"]].filter(([c])=>Data.allFoods().some(f=>f.cat===c)).map(([c,t])=>`<h3 class="fam ${c}">${t}</h3><div class="card fam ${c}">${Data.allFoods().filter(f=>f.cat===c).sort((x,y)=>x.label.localeCompare(y.label,"fr")).map(f=>foodRow(f)).join("")}</div>`).join("")}
   ${Data.hiddenFoods().length?`<details class="hidf"><summary class="mut">Ingrédients retirés (${Data.hiddenFoods().length})</summary><div class="card">${Data.hiddenFoods().sort((x,y)=>x.label.localeCompare(y.label,"fr")).map(f=>`<div class="row"><span class="t">${esc(f.label)}</span><button class="btn sec sm" data-fback="${f.id}">Remettre</button></div>`).join("")}</div></details>`:""}<button class="fab" id="fabf" aria-label="Ajouter un ingrédient">+</button>`,
   habitudes:`<p class="mut">Les suggestions 💡 proposent ces plats en priorité sur ces créneaux. L'app en apprend aussi toute seule à partir des repas passés.</p>
   <div class="card">${hs.length?hs.map(h=>`<div class="row link" data-hedit="${h.id}"><span class="t">${habitWhat(h).icon} ${esc(habitWhat(h).label)}<br><small class="mut">${habitWhen(h)}${h.auto?" · apprise":""}${h.adj?" · ajustée":""}</small></span><button class="x" data-hdel="${h.id}" aria-label="Retirer">×</button></div>`).join(""):`<div class="empty">Aucune habitude</div>`}</div>
   <button class="addrow" id="newh"><i>+</i>Ajouter une habitude</button>
   ${(()=>{const acc=sidesLearned();return `<h3 class="ray" style="margin-top:22px">🍽️ Accompagnements</h3>
     <p class="mut">Ce qui va avec une recette ou un féculent (pâtes, riz…) : appris de vos repas, ou ajouté ici. 💡 en propose un, au hasard.</p>
     ${acc.length?`<div class="card">${acc.map(x=>`<div class="row"><span class="t">${esc(x.recipe)}<br><small class="mut">avec ${x.sides.map(s=>esc(s.side)+(s.id?` <button class="cdel" data-cdel="${s.id}" aria-label="Retirer">×</button>`:` <button class="cdel" data-coff="${esc(x.recipe+", "+s.side)}" aria-label="Retirer">×</button>`)).join(" · ")}</small></span></div>`).join("")}</div>`:""}
     <button class="addrow" id="newc"><i>+</i>Ajouter un accompagnement</button>
     <h3 class="ray" style="margin-top:22px">😋 Plats gourmands</h3>
     <p class="mut">Plats riches (gratins, tartiflette…) : cochez « Plat gourmand » dans la recette. Dans 💡 : 4 au plus par semaine, un même plat pas deux fois en 30 jours ; les gratins de pâtes et pâtes riches forment une seule famille (après l'un d'eux, aucun pendant 30 jours, puis un seul, au hasard). La junk food compte aussi, sans case à cocher.</p>
     <div class="card" style="padding:12px 14px;line-height:2.1">${live(S.recipes).filter(r=>r.gourmand).sort((a,b)=>a.name.localeCompare(b.name)).map(r=>`<span class="chipw">${esc(r.name)}</span>`).join(" ")||`<span class="mut">Aucune recette cochée pour l'instant</span>`}</div>
     <h3 class="ray" style="margin-top:22px">🚫 Idées refusées</h3>
     <p class="mut">Nouvelles recettes que vous avez refusées : elles ne sont plus proposées. × pour en remettre une.</p>
     <div class="card" style="padding:12px 14px;line-height:2.1">${live(S.combos||{}).filter(c=>c.kind==="refus").map(c=>`<span class="chipw">${esc(c.label||decodeURIComponent(c.text.replace(/^.*\/(recette_)?|[_-]\d+\.aspx$/g,"")).replace(/-/g," "))}<button class="cdel" data-rdel="${c.id}" aria-label="Remettre">×</button></span>`).join(" ")||`<span class="mut">Aucune</span>`}</div>
     <h3 class="ray" style="margin-top:22px">🍔 Junk food</h3>
     <p class="mut">Une seule toutes les 2 semaines dans 💡, et elle compte dans les 4 plats gourmands de la semaine. Un plat dont le nom contient l'un de ces mots en fait partie.</p>
     <div class="card" style="padding:12px 14px;line-height:2.1">${Data.plaisirList(S).map(x=>`<span class="chipw">${esc(x.word.charAt(0).toUpperCase()+x.word.slice(1))}<button class="cdel" data-pdel="${x.id||""}" data-pw="${esc(x.word)}" aria-label="Retirer">×</button></span>`).join(" ")}</div>
     <button class="addrow" id="newp"><i>+</i>Ajouter une junk food</button>`})()}`,
   rayons:`<div class="card ordre"><div class="row"><span class="t">Magasin</span><select id="ordl">${live(S.lists).sort(listSort).map(l=>`<option value="${l.id}" ${l.id===LS.ordl?"selected":""}>${esc(l.name)}</option>`).join("")}</select></div>
   ${rayonOrder(LS.ordl&&S.lists[LS.ordl]?LS.ordl:"auchan").map((r,i,all)=>`<div class="row"><span class="t">${r.icon} ${esc(r.label)}</span><button class="pill" data-up="${i}" ${i?"":"disabled"} aria-label="Monter">↑</button><button class="pill" data-dn="${i}" ${i<all.length-1?"":"disabled"} aria-label="Descendre">↓</button></div>`).join("")}</div>`,
   foyer:`<div class="card"><div class="row"><span class="t">Version de l'app<br><small class="mut">${VERSION}</small></span><button class="btn sec" id="upd">Mettre à jour</button></div></div>
   <div class="card"><div class="row"><span class="t">Code de cet appareil<br><small class="mut">${code?"•".repeat(Math.min(code.length,12)):"non défini"} · ${STATE[status]}</small></span><button class="btn sec" id="setcode">Saisir</button></div>
   <div class="row"><span class="t">Scanner le QR code<br><small class="mut">Montré par l'autre téléphone (⚙︎ → Synchro → QR code)</small></span><button class="btn sec" id="scancode">📷 Scanner</button></div>
   ${code?`<div class="row"><span class="t">Montrer le QR code<br><small class="mut">À scanner avec l'autre téléphone</small></span><button class="btn sec" id="qrcode">QR code</button></div>
   <div class="row"><span class="t">Copier le code<br><small class="mut">Pour le coller sur un autre appareil</small></span><button class="btn sec" id="cpcode">Copier</button></div>`:""}
   ${status==="ok"?`<div class="row"><span class="t">Changer le code du foyer<br><small class="mut">Les autres appareils devront saisir le nouveau</small></span><button class="btn sec" id="rencode">Changer</button></div>`:""}</div>
   ${status==="unk"?`<p class="warn">Ce code ne correspond à aucun foyer. Vérifiez-le (majuscules, espaces) ou demandez-le à un autre membre du foyer.</p>`:""}
   <h3 class="ray" style="margin-top:22px">💾 Sauvegarde</h3>
   <div class="card"><div class="row"><span class="t">Exporter<br><small class="mut">Un fichier avec tout (recettes, ingrédients, habitudes, rayons…), à enregistrer sur Google Drive</small></span><button class="btn sec" id="exp">Exporter</button></div>
   <div class="row"><span class="t">Importer<br><small class="mut">Remet ce qui manque depuis un fichier de sauvegarde</small></span><button class="btn sec" id="imp">Importer</button></div></div>
   <input type="file" id="impf" accept=".json,application/json" hidden>
`,
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
      c.querySelectorAll(".row").forEach(r=>{const ok=!q||norm(r.querySelector(".t").textContent).includes(q);r.style.display=ok?"":"none";any=any||ok});
      c.style.display=any?"":"none";c.previousElementSibling.style.display=c.style.display})});
  on("#fabf","onclick",()=>foodEditor(null));
  wireFoods(document,render);

  // Sauvegarde : un fichier JSON (tout le foyer), partagé vers Google Drive (Enregistrer dans Fichiers) ou téléchargé
  on("#exp","onclick",async()=>{const day=todayKey(),name=`menus-courses-${day}.json`;
    const file=new File([JSON.stringify({...S,_export:{date:day,version:VERSION}})],name,{type:"application/json"});
    try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return}}catch(e){if(e&&e.name==="AbortError")return}
    const a=document.createElement("a");a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)});
  on("#imp","onclick",()=>$("#impf").click());
  on("#impf","onchange",async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;
    if(f.size>5e6){alert("Ce fichier est trop gros pour être une sauvegarde de l'app.");return}
    let raw=null;try{raw=JSON.parse(await f.text())}catch(_){}
    if(!raw||typeof raw!=="object"){alert("Ce fichier n'est pas une sauvegarde de l'app.");return}
    importDialog(raw,f.name)});
  // Forcer la mise à jour : vide le cache de l'app ET celui de Safari (qui garde les fichiers jusqu'à 10 min), puis recharge.
  on("#upd","onclick",async e=>{e.preventDefault();LS.updFrom=VERSION;e.target.textContent="Mise à jour…";
    try{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);
      await Promise.all(["./","index.html","app.js","data.js","qty.js","rayons.js","style.css","config.js","sw.js"].map(f=>fetch(f,{cache:"reload"}).catch(()=>{})))}catch(_){}
    location.replace(location.pathname+"?maj="+Date.now())});
  const askCode=(msg,def,min=MIN_CODE)=>{
    let c=prompt(msg,def);
    while(c!==null&&c.trim().length<min)c=prompt(`Trop court : au moins ${min} caractères. Par exemple trois mots et un nombre.`,c.trim());
    return c===null?null:c.trim();
  };
  // code solide tiré au hasard : 30 caractères, tous les symboles (on le copie-colle, jamais tapé).
  // Pas d'espace : l'app et la sauvegarde Home Assistant retirent les espaces au début et à la fin.
  const strongCode=()=>{const L="abcdefghijklmnopqrstuvwxyz",U=L.toUpperCase(),D="0123456789",Y="!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",A=L+U+D+Y;
    const rnd=n=>{const v=new Uint32Array(1),lim=Math.floor(2**32/n)*n;do crypto.getRandomValues(v);while(v[0]>=lim);return v[0]%n}; // sans biais
    const c=[Y,Y,Y,Y,D,D,U,U,L,L].map(set=>set[rnd(set.length)]);while(c.length<30)c.push(A[rnd(A.length)]);
    for(let i=c.length-1;i>0;i--){const j=rnd(i+1);[c[i],c[j]]=[c[j],c[i]]}return c.join("")};
  on("#qrcode","onclick",showQR);on("#scancode","onclick",scanQR);
  // Rejoindre un foyer existant : ne change que cet appareil.
  const cp=$("#cpcode");if(cp)cp.onclick=async()=>{try{await navigator.clipboard.writeText(code);cp.textContent="Copié ✓"}catch(_){alert("Copie impossible sur cet appareil.")}};
  on("#setcode","onclick",()=>{
    const c=askCode("Code du foyer (le même que sur les autres appareils) :",code);
    if(c!==null){code=LS.code=c;LS.since="";LS.deltaInit="";save();sync();render()}
  });
  // Renommer le foyer côté serveur : il faut que le code actuel soit valide.
  const ren=$("#rencode");if(ren)ren.onclick=async()=>{
    const n=askCode("Nouveau code du foyer. Celui proposé (30 caractères, avec symboles) est tiré au hasard : validez, il sera copié tout seul.",strongCode(),16);
    if(!n||n===code)return;
    const req=rpc("change_household_code",{p_old:code,p_new:n}).catch(()=>null);
    // copie automatique du nouveau code, une fois accepté par la base ; demandée tout de suite (l'iPhone ne copie que pendant le toucher)
    let copied;try{copied=navigator.clipboard.write([new ClipboardItem({"text/plain":req.then(r=>{if(!r||!r.ok)throw 0;return new Blob([n],{type:"text/plain"})})})]).then(()=>true,()=>false)}catch(_){copied=Promise.resolve(false)}
    const r=await req;
    if(r&&r.ok){code=LS.code=n;sync();render();const c=await copied;
      alert(`Code changé${c?" et copié":""}. ${c?"Collez-le":"Touchez « Copier », puis collez-le"} sur l'autre téléphone (⚙︎ → Synchro → Saisir) et dans Home Assistant (saisir-code.sh).`);return}
    const e=r?await r.json().catch(()=>({})):{};
    alert(e.message==="code deja utilise"?"Ce code est déjà pris, choisissez-en un autre.":"Impossible de changer le code pour l'instant (hors ligne ?).");
  };
  on("#newc","onclick",()=>{const t=(prompt("Association, séparée par une virgule (ex. « Pâtes, Œufs »)")||"").trim();
    if(!t)return;if(!/[,+]/.test(t)){alert("Séparez les deux par une virgule, par exemple « Pâtes, Œufs ».");return}
    touch("combos",{id:"c-"+uid(),text:t.split(/\s*[,+]\s*/).filter(Boolean).map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(", ")});render()});
  on("#newp","onclick",()=>{const t=(prompt("Junk food à ajouter (ex. « Welsh »)")||"").trim();if(!t)return;
    const w=Data.plain(t).trim(),off=live(S.combos||{}).find(c=>c.kind==="plaisir"&&c.off&&Data.plain(c.text).trim()===w);
    if(off)touch("combos",{...off,deleted:true});else touch("combos",{id:"p-"+uid(),text:t,kind:"plaisir"});render()});
  document.querySelectorAll("[data-pw]").forEach(el=>el.onclick=()=>{const id=el.dataset.pdel,w=el.dataset.pw;if(!confirm(`Retirer « ${w} » de la junk food ?`))return;
    if(id&&S.combos[id])touch("combos",{...S.combos[id],deleted:true});else touch("combos",{id:"o-"+uid(),text:w,kind:"plaisir",off:true});render()});
  document.querySelectorAll("[data-rdel]").forEach(el=>el.onclick=()=>{const c=S.combos[el.dataset.rdel];if(c){touch("combos",{...c,deleted:true});render()}});
  // accompagnement appris des repas : retiré = plus jamais proposé ni affiché
  document.querySelectorAll("[data-coff]").forEach(el=>el.onclick=()=>{const t=el.dataset.coff;if(!confirm(`Retirer l'association « ${t} » ?`))return;
    touch("combos",{id:"x-"+uid(),text:t,kind:"off"});render()});
  document.querySelectorAll("[data-cdel]").forEach(el=>el.onclick=()=>{const c=S.combos[el.dataset.cdel];if(c&&confirm(`Retirer l'association « ${c.text} » ?`)){touch("combos",{...c,deleted:true});render()}});
  const ol=()=>LS.ordl&&S.lists[LS.ordl]?LS.ordl:"auchan";
  on("#ordl","onchange",e=>{LS.ordl=e.target.value;render()});
  const moveR=(i,d)=>{const ids=rayonOrder(ol()).map(r=>r.id);[ids[i],ids[i+d]]=[ids[i+d],ids[i]];touch("lists",{...S.lists[ol()],order:ids});render()};
  document.querySelectorAll("[data-up]").forEach(el=>el.onclick=()=>moveR(+el.dataset.up,-1));
  document.querySelectorAll("[data-dn]").forEach(el=>el.onclick=()=>moveR(+el.dataset.dn,1));
}
// QR code du foyer : affiché par un téléphone, lu par l'appareil photo de l'autre, dans l'app. Tout reste sur les téléphones
// (dessin par qr.js, lecture par vendor/jsqr.js, chargés seulement à ce moment-là). Le préfixe évite de prendre un autre QR code.
const QR_PREFIX="MC1:";
const loadScript=(src,name)=>window[name]?Promise.resolve():new Promise((ok,ko)=>{const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=ko;document.head.appendChild(s)});
async function showQR(){
  if(!code)return;
  try{await loadScript("qr.js","QR")}catch(_){alert("QR code indisponible pour l'instant (hors ligne ?) : utilisez « Copier ».");return}
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>QR code du foyer</h2>
   <p class="mut">Sur l'autre téléphone : ⚙︎ → Synchro → 📷 Scanner, puis visez ce QR code. Ne le montrez qu'à un téléphone du foyer : il donne accès à vos listes.</p>
   <div class="qrbox">${QR.svg(QR_PREFIX+code,260)}</div>
   <div class="acts"><button class="btn" id="no">Fermer</button></div></div>`;
  document.body.appendChild(ov);
  // il disparaît à la fermeture, quand l'app passe en arrière-plan, et au bout de 2 minutes
  const hide=()=>{if(document.hidden)close()},t=setTimeout(()=>close(),120000);
  const close=()=>{clearTimeout(t);ov.remove();document.removeEventListener("visibilitychange",hide)};
  document.addEventListener("visibilitychange",hide);ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
}
async function scanQR(){
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Scanner le QR code</h2>
   <p class="mut">Sur l'autre téléphone : ⚙︎ → Synchro → QR code. Visez-le avec l'appareil photo.</p>
   <div class="scanbox"><video id="scv" playsinline muted autoplay></video></div>
   <p class="mut" id="scm">Ouverture de l'appareil photo…</p>
   <div class="acts"><button class="btn sec" id="no">Annuler</button></div></div>`;
  document.body.appendChild(ov);
  let stream=null,stopped=false;
  const hide=()=>{if(document.hidden)close()};
  const close=()=>{stopped=true;if(stream)stream.getTracks().forEach(t=>t.stop());ov.remove();document.removeEventListener("visibilitychange",hide)};
  document.addEventListener("visibilitychange",hide);ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  const msg=t=>{const m=ov.querySelector("#scm");if(m)m.textContent=t};
  try{await loadScript("vendor/jsqr.js","jsQR");
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false})}
  catch(e){msg(e&&e.name==="NotAllowedError"?"Accès à l'appareil photo refusé : autorisez-le dans les réglages de l'iPhone (Safari → Appareil photo), ou utilisez « Saisir ».":"Appareil photo indisponible : utilisez « Saisir ».");return}
  if(stopped){stream.getTracks().forEach(t=>t.stop());return}
  const v=ov.querySelector("#scv");v.srcObject=stream;await v.play().catch(()=>{});msg("Visez le QR code…");
  const c=document.createElement("canvas"),ctx=c.getContext("2d",{willReadFrequently:true});
  const tick=()=>{if(stopped)return;
    if(v.readyState>=2&&v.videoWidth){const w=Math.min(640,v.videoWidth),h=Math.round(v.videoHeight*w/v.videoWidth);c.width=w;c.height=h;ctx.drawImage(v,0,0,w,h);
      const r=jsQR(ctx.getImageData(0,0,w,h).data,w,h,{inversionAttempts:"dontInvert"});
      if(r&&r.data){if(r.data.startsWith(QR_PREFIX)&&r.data.length-QR_PREFIX.length>=MIN_CODE){close();useCode(r.data.slice(QR_PREFIX.length));return}
        msg("Ce QR code ne vient pas de l'app Menus & Courses.")}}
    setTimeout(tick,150)};
  tick();
}
// code lu : enregistré sur cet appareil (comme « Saisir ») ; on demande seulement s'il remplace un code qui marche
function useCode(c){
  if(c===code){toast("✓ Ce téléphone a déjà ce code");return}
  if(code&&status==="ok"&&!confirm("Ce téléphone utilise déjà un autre code qui fonctionne. Le remplacer par celui du QR code ?"))return;
  code=LS.code=c;LS.since="";LS.deltaInit="";save();sync();render();toast("✓ Code du foyer enregistré");
}
// Recette d'un lien Marmiton ou CuisineAZ, lue par la fonction Supabase « recette »
// (l'iPhone ne peut pas lire ces sites directement : voir supabase/functions/recette)
async function fetchRecipe(url){
  if(!canSync())throw new Error("Il faut d'abord le code du foyer (⚙︎ → Synchro).");
  const r=await fetch(`${cfg.SUPABASE_URL}/functions/v1/recette`,{method:"POST",headers:H(),body:JSON.stringify({url,code})}).catch(()=>null);
  if(!r)throw new Error("Lecture impossible : pas de connexion, ou import pas encore activé.");
  if(r.status===404)throw new Error("Import pas encore activé (fonction « recette » à installer dans Supabase).");
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Lecture impossible.");
  return Data.fromSchema(j,j.url||url);
}
// Chaque jour, à l'ouverture de 📖 Recettes : 5 nouveautés (15 avec le bouton 🆕),
// rapides (30 min de préparation au plus) de Marmiton et CuisineAZ (nouveautes.json, mis à jour chaque mardi soir).
// Une fois par jour au plus.
// Nouveautés de la semaine (nouveautes.json) encore inconnues : pas déjà dans les recettes, pas refusées, des repas rapides.
// max idées tirées au hasard, les deux sites à tour de rôle
async function newIdeas(max){
  let list=[];try{const r=await fetch("nouveautes.json",{cache:"no-cache"});list=((await r.json())||{}).recettes||[]}catch(_){return[]}
  const refus=new Set(live(S.combos||{}).filter(c=>c.kind==="refus").map(c=>c.text));
  const mine=new Set([...live(S.recipes).map(x=>x.source).filter(Boolean),...refus]),names=new Set(live(S.recipes).map(x=>Data.plain(x.name).trim()));
  // des repas : pas de toasts ni de recettes pour robot (Thermomix, Cookeo…), même si la liste en contient encore
  const NOT_MEAL=/toasts?\b|tartines?\b|bruschetta|crostini|canap[ée]s?\b|\bchips\b|thermomix|cookeo|companion|monsieur cuisine/i;
  const ok=list.filter(x=>x&&Data.SOURCE.test(x.url)&&!mine.has(x.url)&&!names.has(Data.plain(x.titre||"").trim())&&x.prep>0&&x.prep<=30&&!NOT_MEAL.test((x.titre||"")+" "+x.url));
  const mix=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]),a=mix(ok.filter(x=>x.site==="marmiton")),b=mix(ok.filter(x=>x.site!=="marmiton")),pick=[];
  while((a.length||b.length)&&pick.length<max){if(a.length)pick.push(a.shift());if(b.length&&pick.length<max)pick.push(b.shift())}
  return pick}
// Bouton 🆕 (Suggérer, avis) : les nouveautés repas par repas, 15 au plus
async function maybePropose(force,direct){
  if(!canSync()){toast("Il faut d'abord le code du foyer (⚙︎ → Synchro).");return}
  const pick=await newIdeas(15);if(pick.length)ideaFlow(pick);else toast("Pas d'autre idée pour l'instant")}
// 📖 Recettes, une fois par jour : la carte « Envie d'idées ? » avec 5 nouveautés, une par une (gardée dans les recettes ou passée)
async function dailyIdeas(){const t=todayKey();
  if(LS.nvSeen===t||!canSync()||tab!=="recettes"||document.querySelector(".ov"))return;
  const pick=await newIdeas(5);if(!pick.length||tab!=="recettes"||document.querySelector(".ov"))return;
  LS.nvSeen=t;
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>🆕 Envie d'idées ?</h2>
   <p class="mut">${pick.length} nouvelle${pick.length>1?"s":""} recette${pick.length>1?"s":""} rapide${pick.length>1?"s":""} (moins de 30 min de préparation), à découvrir une par une.</p>
   <div class="acts"><button class="btn sec" id="nvlater">Plus tard</button><button class="btn" id="nvgo">Voir les idées</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#nvlater").onclick=close;
  $("#nvgo").onclick=()=>{close();ideaFlow(pick,true)}}
// Repas de la semaine en préparation (samedi → vendredi), midis et soirs ; les repas déjà prévus sont signalés
function weekOptions(sel){const sat=Data.planSlots(todayKey())[0].slice(0,10),out=[];
  for(let i=0;i<7;i++){const d=Data.addDays(sat,i),lb=new Date(d+"T12:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"short"});
    for(const [s,l] of (i<2?[["m","midi"],["s","soir"]]:[["s","soir"]])){const k=d+"-"+s,o=S.meals[k];
      out.push(`<option value="${k}" ${k===sel?"selected":""}>${lb} ${l}${o&&o.text?" — "+esc(o.text)+" (remplace)":""}</option>`)}}
  return out.join("")}
// Les idées repas par repas (repas libres de la période samedi → vendredi, les soirs d'abord) : la recette s'affiche
// (ingrédients, étapes) ; « Ajouter » la place sur ce repas (puis les ingrédients pour les listes) et passe au repas suivant ;
// « Passer cette recette → » la refuse (liste des idées refusées, modifiable dans ⚙︎ → Habitudes) et montre la suivante, pour le même repas.
// Fermée : on arrête là, retour sur Menus.
function ideaFlow(pool,toRecipes){ // toRecipes : depuis 📖 Recettes, on garde la recette sans choisir de repas
  const sl=Data.planSlots(todayKey()).filter(k=>k.endsWith("-s")||[0,6].includes(new Date(k.slice(0,10)+"T12:00").getDay())),libre=k=>!(S.meals[k]&&S.meals[k].text);
  const slots=[...sl.filter(k=>k.endsWith("-s")&&libre(k)),...sl.filter(k=>k.endsWith("-m")&&libre(k))];
  let si=0,ii=0,kept=0;const done=()=>{if(!toRecipes)tab=LS.tab="menus";render();toast(toRecipes?`✓ Fini pour les idées${kept?` · ${kept} recette${kept>1?"s":""} ajoutée${kept>1?"s":""}`:""}`:"✓ Fini pour les idées")};
  const load=x=>x.rec||(x.rec=fetchRecipe(x.url).catch(e=>({error:e.message})));
  const show=async()=>{
    if(ii>=pool.length){done();return}
    // repas proposé : le prochain libre ; s'il n'y en a plus, le premier de la période (à choisir dans la liste, « remplace »)
    const key=slots[si]||slots[0]||sl[0],x=pool[ii],site=x.site==="marmiton"?"Marmiton":"CuisineAZ";
    if(pool[ii+1])load(pool[ii+1]); // la suivante se prépare en avance
    const when=new Date(key.slice(0,10)+"T12:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})+(key.endsWith("-m")?" midi":" soir");
    const ov=document.createElement("div");ov.className="ov";
    ov.innerHTML=`<div class="sheet"><div class="grab"></div>${toRecipes?`<p class="mut step">Idée ${ii+1}/${pool.length}</p>`:`<select id="nvwhen" class="nvwhen" aria-label="Repas">${weekOptions(key)}</select>`}<h2>${esc(String(x.titre||""))}</h2>
     <p class="mut">⏱ ${+x.prep} min de préparation · ${site} · <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Voir sur le site ↗</a></p>
     <div id="nvrec"><p class="mut">Lecture de la recette…</p></div>
     <div class="nvfoot"><div class="acts"><button class="btn sec" id="nvref">Passer →</button><button class="btn" id="nvadd" disabled>${toRecipes?"Garder la recette":"Ajouter"}</button></div></div></div>`;
    document.body.appendChild(ov);
    const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov){close();if(!toRecipes)tab=LS.tab="menus";render()}};
    // passer : l'idée est refusée (plus reproposée), la recette suivante est proposée pour le même repas
    $("#nvref").onclick=()=>{touch("combos",{id:"n-"+uid(),text:x.url,kind:"refus",label:String(x.titre||"").slice(0,100)});close();ii++;show()};
    const rec=await load(x);if(!ov.isConnected)return;
    if(rec.error){$("#nvrec").innerHTML=`<p class="nverr">⚠ ${esc(rec.error)}</p>`;return}
    $("#nvrec").innerHTML=`<p class="mut">Pour ${rec.serves} personne${rec.serves>1?"s":""}${rec.from?` (adaptée, prévue pour ${rec.from})`:""}</p>
      <div class="card cook">${rec.ingredients.map(t=>`<div class="row"><span class="t">${esc(t)}</span></div>`).join("")}</div>
      ${rec.steps?`<details class="fold"><summary class="steps-h">Étapes</summary>${md(rec.steps)}</details>`:""}`;
    const add=$("#nvadd");add.disabled=false;
    const recOf=()=>({id:uid(),name:rec.name,serves:rec.serves,ingredients:rec.ingredients.map(t=>({t,store:defaultStore(t,(Data.foodFor(pantryName(t))||{}).store)})),
        steps:rec.steps||"",source:rec.source,prep:rec.prep,season:Data.recipeSeason({name:rec.name}),dessert:false});
    if(toRecipes){
      // avant de la garder : gourmand, dessert, saison (proposés d'après le nom, modifiables d'un appui)
      let g=false,d=Data.guessDessert(rec.name||""),se=Data.recipeSeason({name:rec.name});
      const SE=[["all","Toute l'année"],["ete","☀️ Été"],["hiver","❄️ Hiver"],["dec","🎄 Noël"]];
      const paintT=()=>{$("#nvtags").innerHTML=`<div class="rfil"><button type="button" data-tg="p" class="${!d?"on":""}">🍽️ Plat</button><button type="button" data-tg="d" class="${d?"on":""}">🍰 Dessert</button><button type="button" data-tg="g" class="${g?"on":""}">😋 Gourmand</button></div>
        <div class="rfil">${SE.map(([v,l])=>`<button type="button" data-ts="${v}" class="${se===v?"on":""}">${l}</button>`).join("")}</div>`};
      $("#nvrec").insertAdjacentHTML("afterbegin",`<div id="nvtags" class="nvtags"></div>`);paintT();
      $("#nvtags").onclick=e=>{const b=e.target.closest("button");if(!b)return;
        if(b.dataset.tg==="g")g=!g;else if(b.dataset.tg==="d")d=true;else if(b.dataset.tg==="p")d=false;else if(b.dataset.ts)se=b.dataset.ts;paintT()};
      add.onclick=()=>{touch("recipes",{...recOf(),gourmand:g||null,dessert:d,season:se});kept++;close();toast("✓ Ajoutée à vos recettes");ii++;render();show()};return}
    add.onclick=()=>{const key=$("#nvwhen").value,o=S.meals[key]; // le repas choisi (mardi plutôt que samedi…)
      if(o&&o.text){if(bought(o)){alert(`Les ingrédients de « ${o.text} » ont déjà été achetés : choisissez un autre repas.`);return}
        if(!confirm(`Remplacer « ${o.text} » ?`))return;dropChecks(key);
        if(o.added)o.added.items.forEach(g=>removeFromList(g.store,Qty.buy(g.t,o.added.n/(o.added.b||BASE),o.added.b||BASE)))}
      close();
      const r=recOf();
      touch("recipes",r);touch("meals",{key,text:r.name,servings:DEFN});gourmandWarn(key);render();
      // ce repas n'est plus à remplir ; si on en a choisi un autre, celui proposé reste libre pour l'idée suivante
      ii++;const at=slots.indexOf(key);if(at>=0){slots.splice(at,1);if(at<si)si--}
      ingredientsDialog(r.name,key,undefined,show)};
  };
  show();
}
// Recette importée, mangée : « Avez-vous aimé ? » — oui : gardée ; non : retirée (et plus reproposée), une autre idée si on veut.
const avisAsked=new Set();
function maybeAvis(){
  if(document.querySelector(".ov"))return false;const t=todayKey(),norm=Data.plain;
  const r=live(S.recipes).find(r=>r.source&&!r.avis&&!avisAsked.has(r.id)&&live(S.meals).some(m=>m.text&&m.key&&m.key.slice(0,10)<t&&norm(m.text).includes(norm(r.name))));
  if(!r)return false;avisAsked.add(r.id);
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Avez-vous aimé « ${esc(r.name)} » ?</h2>
   <p class="mut">Nouvelle recette essayée récemment.</p>
   <div class="acts"><button class="btn sec" id="avno">Non</button><button class="btn" id="avok">Oui, on la garde</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};
  $("#avok").onclick=()=>{touch("recipes",{...r,avis:"oui"});close();toast("✓ Recette gardée")};
  $("#avno").onclick=()=>{close();touch("recipes",{...r,deleted:true});if(r.source)touch("combos",{id:"n-"+uid(),text:r.source,kind:"refus",label:r.name});render();
    const o2=document.createElement("div");o2.className="ov";
    o2.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Recette retirée</h2><p class="mut">Voulez-vous une autre nouvelle recette à la place ?</p>
     <div class="acts"><button class="btn sec" id="av2no">Non merci</button><button class="btn" id="av2ok">Oui, une autre</button></div></div>`;
    document.body.appendChild(o2);const c2=()=>o2.remove();o2.onclick=e=>{if(e.target===o2)c2()};$("#av2no").onclick=c2;
    $("#av2ok").onclick=()=>{c2();maybePropose(true,true)}};
  return true;
}
// Import d'une sauvegarde (fichier exporté, ou fichier de la sauvegarde Home Assistant) : données vérifiées comme
// celles de la synchro (cleanAll). Par défaut, seul ce qui manque (ou a été supprimé) revient ; rien d'actuel n'est remplacé.
const IMPORT_GROUPS=[["📖 Recettes",["recipes"],true],["🥕 Ingrédients",["foods"],true],["🔁 Habitudes et accompagnements",["habits","combos"],true],
  ["🏷️ Rayons et magasins",["aisles","stores","lists"],true],["🍽️ Repas",["meals"],false],["🛒 Listes de courses",["items"],false]];
function importDialog(raw,fname){
  const data=Data.cleanAll(raw);
  const has=(k,id)=>{const c=S[k][id];return !!c&&!c.deleted&&(k!=="meals"||!!c.text)}; // repas vide = place libre
  const same=(k,id,a,b)=>{const x=Data.clean(k,id,a);return !!x&&JSON.stringify({...x,ts:0})===JSON.stringify({...b,ts:0})}; // comparés une fois remis en forme
  const fileRecs=k=>Object.entries(data[k]).filter(([id,x])=>!x.deleted&&(k!=="meals"||x.text));
  const inFile=kinds=>kinds.reduce((a,k)=>a+fileRecs(k).length,0);
  if(!IMPORT_GROUPS.some(g=>inFile(g[1]))){alert("Ce fichier ne contient aucune donnée de l'app.");return}
  const when=(raw._export&&raw._export.date)||(String(fname).match(/\d{4}-\d{2}-\d{2}/)||[])[0];
  // nom lisible de chaque élément, pour le choisir
  const dayLbl=k=>new Date(k.slice(0,10)+"T12:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})+(/-m\d*$/.test(k)?" midi":" soir");
  const cap=t=>t.charAt(0).toUpperCase()+t.slice(1);
  const LAB={recipes:x=>x.name,foods:x=>x.label,habits:x=>habitWhat(x).label+" · "+habitWhen(x),combos:x=>x.text,lists:x=>x.name,stores:(x,id)=>x.name||id,
    aisles:(x,id)=>cap(id.replace(/-/g," "))+" → "+((Rayons.byId[x.rayon]||{}).label||x.rayon),meals:(x,id)=>dayLbl(id)+" : "+x.text,items:x=>x.text};
  const lab=(k,id,x)=>{try{return LAB[k](x,id)||id}catch(_){return id}}; // seulement le libellé de sa sorte
  // à remettre : ce qui manque (ou a été supprimé) ; avec « remplacer », aussi ce qui a changé depuis
  let force=false;const pick=new Map(),opened=new Set(); // pick : choix fait à la main (sinon : le groupe coché par défaut ou non)
  const todo=g=>IMPORT_GROUPS[g][1].flatMap(k=>fileRecs(k).filter(([id,x])=>!has(k,id)||(force&&!same(k,id,S[k][id],x)))
    .map(([id,x])=>({k,id,x,key:k+"|"+id,repl:has(k,id),label:String(lab(k,id,x)||id)}))).sort((a,b)=>a.label.localeCompare(b.label,"fr"));
  const isOn=(g,t)=>pick.has(t.key)?pick.get(t.key):IMPORT_GROUPS[g][2];
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Importer une sauvegarde</h2>
   <p class="mut">${when&&/^\d{4}-\d{2}-\d{2}$/.test(when)?"Sauvegarde du "+new Date(when+"T12:00").toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):esc(String(fname).slice(0,60))}.
   Cochez un groupe pour tout reprendre, ou « Choisir » pour sélectionner.</p>
   <div class="card imp" id="igs"></div>
   <label class="row impforce"><input type="checkbox" id="impforce"><span class="t">Remplacer aussi ce qui a changé depuis<br><small class="mut">Sinon, rien de ce que vous avez aujourd'hui n'est remplacé : seul ce qui manque revient.</small></span></label>
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok"></button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  const chosen=()=>IMPORT_GROUPS.flatMap((_,g)=>todo(g).filter(t=>isOn(g,t)));
  const paint=()=>{
    $("#igs").innerHTML=IMPORT_GROUPS.map(([l,kinds],g)=>{const n=inFile(kinds);if(!n)return "";const t=todo(g),on=t.filter(x=>isOn(g,x)).length;
      return `<div class="ig"><div class="row"><label class="igh"><input type="checkbox" data-ga="${g}" ${t.length&&on===t.length?"checked":""} ${t.length?"":"disabled"}><span class="t">${l}<br><small class="mut">${n} dans le fichier · ${!t.length?"rien à remettre":on===t.length?t.length+" à remettre":on+" sur "+t.length+" à remettre"}</small></span></label>${t.length?`<button type="button" class="btn sec igc" data-gc="${g}">${opened.has(g)?"Fermer":"Choisir"}</button>`:""}</div>
       ${opened.has(g)&&t.length?`<div class="igl">${t.map(x=>`<label class="row"><input type="checkbox" data-it="${esc(x.key)}" data-g="${g}" ${isOn(g,x)?"checked":""}><span class="t">${esc(x.label)}${x.repl?` <small class="mut">· remplace l'actuel</small>`:""}</span></label>`).join("")}</div>`:""}</div>`}).join("");
    // groupe en partie choisi : case à moitié cochée
    ov.querySelectorAll("[data-ga]").forEach(c=>{const g=+c.dataset.ga,t=todo(g),on=t.filter(x=>isOn(g,x)).length;c.indeterminate=on>0&&on<t.length});
    const n=chosen().length;$("#ok").textContent=n?`Remettre ${n} élément${n>1?"s":""}`:"Rien à remettre";$("#ok").disabled=!n};
  ov.addEventListener("change",e=>{const c=e.target;
    if(c.id==="impforce")force=c.checked;
    else if(c.dataset.ga!=null){const g=+c.dataset.ga;todo(g).forEach(t=>pick.set(t.key,c.checked))} // tout le groupe
    else if(c.dataset.it!=null)pick.set(c.dataset.it,c.checked); // un élément
    else return;
    paint()});
  ov.addEventListener("click",e=>{if(e.target===ov){close();return}const b=e.target.closest("[data-gc]");if(!b)return;
    const g=+b.dataset.gc;if(opened.has(g))opened.delete(g);else opened.add(g);paint()});
  $("#no").onclick=close;paint();
  $("#ok").onclick=()=>{const list=chosen(),repl=list.filter(t=>t.repl).length,now=Date.now(),withItems=list.some(t=>t.k==="items");
    if(repl&&!confirm(`${repl} élément${repl>1?"s":""} actuel${repl>1?"s":""} ser${repl>1?"ont":"a"} remplacé${repl>1?"s":""} par la sauvegarde. Continuer ?`))return;
    // en une fois (pas un enregistrement + envoi par élément) ; les repas sans leurs articles ne gardent pas le lien vers les listes
    for(const {k,id,x} of list){const rec={...x,ts:now,deleted:false};if(k==="meals"&&!withItems)rec.added=null;
      (S[k]=S[k]||{})[id]=rec;(pending[k]=pending[k]||{})[id]=1}
    save();sync();close();render();toast(`✓ ${list.length} élément${list.length>1?"s":""} remis`)};
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
  const ed=rec&&rec.edit,kg0=ed&&rec.kind==="g"&&rec.q>=1000,k0=ed?(kg0?"kg":rec.kind):"g",q0=ed?(kg0?rec.q/1000:rec.q):150,st0=ed&&rec.store||"auchan",c0=rec&&rec.cat||cat||"leg";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>${ed?"Modifier l'ingrédient":"Nouvel ingrédient"+(rec&&step&&!step.endsWith("/1")?" "+step:"")}</h2>
   <label class="flab" for="fn">Nom</label>
   <input type="text" id="fn" placeholder="ex. Haricots beurre" autocapitalize="sentences" value="${rec?esc(rec.label):""}" style="width:100%;margin-bottom:12px">
   <div class="serv"><span>Famille</span><select id="fc">${Object.entries(FAM).map(([k,l])=>`<option value="${k}" ${k===c0?"selected":""}>${l}</option>`).join("")}</select></div>
   <div class="serv"><span>Par personne</span><input type="text" id="fqv" value="${String(q0).replace(".",",")}" inputmode="decimal" style="width:80px">
   <select id="fk">${[["g","grammes"],["kg","kilos"],["n","pièce(s)"]].map(([v,l])=>`<option value="${v}" ${v===k0?"selected":""}>${l}</option>`).join("")}</select></div>
   <div class="serv"><span>Magasin</span><select id="fs">${lists.map(l=>`<option value="${l.id}" ${l.id===st0?"selected":""}>${esc(SHORT[l.id]||l.name)}</option>`).join("")}</select></div>
   ${synHtml()}
   <div class="acts"><button class="btn sec" id="no">${done?"Plus tard":"Annuler"}</button><button class="btn" id="ok">${rec?"Enregistrer":"Ajouter"}</button></div></div>`;
  document.body.appendChild(ov);const getSyn=wireSyn(ed&&rec.syn,ed&&rec.synq);
  const close=()=>ov.remove(),later=()=>{close();if(done)done()};ov.onclick=e=>{if(e.target===ov)later()};$("#no").onclick=later;
  $("#fk").onchange=()=>{$("#fqv").value={n:1,kg:1,g:150}[$("#fk").value]};
  $("#ok").onclick=()=>{const label=$("#fn").value.trim(),q=parseFloat(String($("#fqv").value).replace(",","."));
    if(!label){$("#fn").focus();return}if(!(q>0)){$("#fqv").focus();return}
    const same=Data.foodFor(label,true);if(same&&!(ed&&same.id===rec.id)&&!confirm(`« ${label} » ressemble à un ingrédient existant. L'ajouter quand même ?`))return;
    const G=getSyn(),syn=G.names.filter(x=>Data.plain(x)!==Data.plain(label)),synq=G.synq;
    const pris=syn.map(x=>[x,Data.foodFor(x,true)]).filter(([x,f])=>f&&!(rec&&f.id===rec.id));
    if(pris.length&&!confirm(`Déjà utilisé : ${pris.map(([x,f])=>`« ${x} » (${f.label})`).join(", ")}. Garder quand même ?`))return;
    const kg=$("#fk").value==="kg"; // les kilos sont gardés en grammes
    touch("foods",{id:rec?rec.id:"c-"+uid(),label:label.charAt(0).toUpperCase()+label.slice(1),cat:$("#fc").value,kind:kg?"g":$("#fk").value,q:kg?Math.round(q*1000):q,store:$("#fs").value,syn:syn.join(", ")||null,synq,deleted:false});close();render();if(done)done()};
  if(!rec)setTimeout(()=>$("#fn").focus(),50);
}
// Ligne d'un ingrédient (liste Ingrédients, ou détail d'un groupe comme « Poulet »)
const kindSel=f=>f.kind==="g"||f.kind==="n"?`<select class="fk" data-fk="${f.id}" aria-label="Compter"><option value="g" ${f.kind==="g"?"selected":""}>au poids</option><option value="n" ${f.kind==="n"?"selected":""}>à la pièce</option></select>`:"";
// « aussi : bavette, rôti de bœuf (200 g) » : la quantité propre d'un autre nom est rappelée
const synShow=f=>{const A=Object.values(f.amt||{}),lab=a=>a.kind==="g"?(a.q>=1000?String(a.q/1000).replace(".",",")+" kg":a.q+" g"):a.q<1?"1 pour "+Math.round(1/a.q):String(a.q).replace(".",",")+(a.q>1?" pièces":" pièce");
  const groups=new Map(); // même quantité → un seul groupe : « 1 pour 4 · poulet entier, poulet rôti »
  const base={kind:f.kind,q:(S.foods[f.id]&&!S.foods[f.id].deleted&&S.foods[f.id].q)||f.q},kb=f.kind==="g"||f.kind==="n"?lab(base):"";
  groups.set(kb,[f.self&&f.label===Data.baseLabel(f.id)?f.self:f.label.charAt(0).toLowerCase()+f.label.slice(1)]); // l'ingrédient lui-même en premier, avec sa quantité
  for(const t of String(f.syn).split(",").map(x=>x.trim()).filter(Boolean)){const a=A.find(v=>v.t===t),k=a?lab(a):kb;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t)}
  return [...groups].map(([k,ts])=>`<span class="sgrp">${k?`<b class="sq-own">${k}</b> · `:""}${esc(ts.join(", "))}</span>`).join("")};
function foodRow(f,lab,withKind){const q=(S.foods[f.id]&&!S.foods[f.id].deleted&&S.foods[f.id].q)||f.q;
     const v=f.kind==="g"?(q>=1000?String(q/1000).replace(".",",")+" kg":q+" g"):f.kind==="n"&&f.as?q+" "+f.as.replace(/^(\S+?)s?(?= )/,(m,w)=>q>1?w+"s":w):f.kind==="n"?String(q).replace(".",",")+(q<1?" (une pour "+Math.round(1/q)+")":""):f.kind==="box"?"boîtes : petite 1, moyenne 2, grande 4":"« "+f.line+" »";
     return `<div class="row link" data-fedit="${f.id}"><span class="t">${esc(lab||f.label)}<br><small class="mut">${f.syn&&!withKind?synShow(f):`${withKind?kindSel(f)+" ":""}${esc(v)}${(f.kind==="g"||f.kind==="n")&&!withKind?" par personne":""}`}</small></span>${f.kind==="g"||f.kind==="n"?`<span class="stp sm"><button data-fq="${f.id}" data-d="-1" aria-label="Moins">−</button><button data-fq="${f.id}" data-d="1" aria-label="Plus">+</button></span>`:""}<button class="x" data-fdel="${f.id}" aria-label="Retirer">×</button></div>`}
// au poids ↔ à la pièce : la quantité repart d'une valeur simple (150 g ou 1)
function setKind(id,kind){const f=Data.allFoods().find(x=>x.id===id);if(!f||f.kind===kind)return;
  touch("foods",{...(S.foods[id]||{}),id,kind,q:kind==="g"?150:1,deleted:false})}
function wireFoods(root,again,leave){
  root.querySelectorAll("[data-fk]").forEach(el=>el.onchange=()=>{setKind(el.dataset.fk,el.value);again()});
  root.querySelectorAll("[data-fedit]").forEach(el=>el.onclick=e=>{if(e.target.closest("button,select"))return;const r=S.foods[el.dataset.fedit],f=Data.allFoods().find(x=>x.id===el.dataset.fedit);if(leave)leave();if(f&&!f.custom)synEditor(f);else if(r)foodEditor(r.cat,{...r,edit:true})});
  root.querySelectorAll("[data-fdel]").forEach(el=>el.onclick=e=>{e.stopPropagation();const id=el.dataset.fdel,f=Data.allFoods().find(x=>x.id===id);if(!f||!confirm(`Retirer « ${f.label} » ?`))return;
    if(f.custom)touch("foods",{...S.foods[id],deleted:true});else touch("foods",{...(S.foods[id]||{}),id,off:true,deleted:false});again()});
  root.querySelectorAll("[data-fback]").forEach(el=>el.onclick=()=>{const id=el.dataset.fback;touch("foods",{...(S.foods[id]||{}),id,off:false,deleted:false});again()});
  root.querySelectorAll("[data-fq]").forEach(el=>el.onclick=()=>{const f=Data.allFoods().find(x=>x.id===el.dataset.fq),cur=(S.foods[f.id]&&!S.foods[f.id].deleted&&S.foods[f.id].q)||f.q;
    const st=f.kind==="g"?10:cur<1||(cur===1&&+el.dataset.d<0)?0.25:1,q=Math.max(f.kind==="g"?10:0.25,Math.round((cur+st*el.dataset.d)*100)/100);
    touch("foods",{...(S.foods[f.id]||{}),id:f.id,q,deleted:false});again()});}
// nombre tapé : « 0,25 », « 1/4 »
const num=v=>{const m=String(v).trim().match(/^(\d+)\s*\/\s*(\d+)$/);return m?+m[1]/+m[2]:parseFloat(String(v).replace(",","."))};
// Autres noms (synonymes) : une liste ; chaque nom a la quantité de l'ingrédient, ou la sienne (toucher la quantité pour la changer)
const synHtml=known=>`<h3 class="ray" style="margin:18px 0 4px">Autres noms</h3>
   <p class="mut" style="margin:0 0 8px;font-size:13px">Noms que vous tapez dans les repas pour cet ingrédient.</p>
   <div class="card synlist"><div id="synrows"></div>
   <div class="sadd"><input type="text" id="fsyn" placeholder="Ajouter un nom (ex. rumsteck)" autocapitalize="none" enterkeyhint="done"><button type="button" class="splus" id="synplus" aria-label="Ajouter">+</button></div></div>
   ${known&&known.length?`<p class="mut" style="margin:6px 2px 0;font-size:13px">Déjà reconnus par l'app : ${esc(known.join(", "))}</p>`:""}`;
const UNIT={g:"g",kg:"kg",n:"pièce(s)"};
function wireSyn(init,initQ){const Q=initQ||{};let open=-1;
  let list=String(init||"").split(",").map(x=>x.trim()).filter(Boolean).map(t=>{const a=Q[t];return a?{t,k:a.kind==="g"&&a.q>=1000?"kg":a.kind,q:a.kind==="g"&&a.q>=1000?a.q/1000:a.q}:{t,k:"",q:""}});
  const fmt=(q,k)=>{const v=num(q);return k==="n"&&v>0&&v<1?"1 pour "+Math.round(1/v):String(q).replace(".",",")+" "+(k==="n"?(v>1?"pièces":"pièce"):UNIT[k])};
  const def=()=>{const q=$("#fqv"),k=$("#fk");return q&&k?fmt(q.value,k.value):"quantité de l'ingrédient"};
  const sync=()=>{const r=document.querySelector("#synrows .sedit");if(r&&list[open]&&list[open].k){list[open].q=r.querySelector(".sq").value;list[open].k=r.querySelector(".su").value}};
  const draw=()=>{$("#synrows").innerHTML=list.map((x,i)=>`<div class="srow"><span class="sn">${esc(x.t)}</span>
      <button type="button" class="spill ${x.k?"own":""}" data-so="${i}">${x.k?esc(fmt(x.q,x.k)):`<span class="mut">comme l'ingrédient</span>`} ›</button>
      <button type="button" class="cdel" data-sx="${i}" aria-label="Retirer">×</button></div>
      ${open===i?`<div class="sedit"><div class="seg"><button type="button" data-own="0" class="${x.k?"":"on"}">Comme l'ingrédient<br><small>${esc(def())}</small></button><button type="button" data-own="1" class="${x.k?"on":""}">Sa quantité</button></div>
      ${x.k?`<div class="serv"><span>Par personne</span><input type="text" class="sq" inputmode="decimal" value="${esc(String(x.q).replace(".",","))}" style="width:80px"><select class="su">${Object.entries({g:"grammes",kg:"kilos",n:"pièce(s)"}).map(([v,l])=>`<option value="${v}" ${v===x.k?"selected":""}>${l}</option>`).join("")}</select></div>`:""}</div>`:""}`).join("");
    document.querySelectorAll("[data-so]").forEach(b=>b.onclick=()=>{sync();open=open===+b.dataset.so?-1:+b.dataset.so;draw()});
    document.querySelectorAll("[data-sx]").forEach(b=>b.onclick=()=>{sync();list.splice(+b.dataset.sx,1);open=-1;draw()});
    document.querySelectorAll("[data-own]").forEach(b=>b.onclick=()=>{const x=list[open];if(b.dataset.own==="1"&&!x.k){const k=$("#fk");x.k=k&&k.value||"g";x.q=$("#fqv")?$("#fqv").value:150}if(b.dataset.own==="0"){x.k="";x.q=""}draw()});
    const su=document.querySelector("#synrows .su");if(su)su.onchange=()=>{list[open].k=su.value;list[open].q={g:150,kg:1,n:1}[su.value];draw()};
    const sq=document.querySelector("#synrows .sq");if(sq)sq.oninput=()=>{list[open].q=sq.value;const p=document.querySelector(`[data-so="${open}"]`);if(p)p.firstChild.textContent=fmt(sq.value,list[open].k)+" "}};
  const add=()=>{sync();const v=$("#fsyn").value;for(const x of v.split(/[,;\/\n]+/).map(y=>y.trim()).filter(Boolean))if(!list.some(y=>Data.plain(y.t)===Data.plain(x)))list.push({t:x,k:"",q:""});$("#fsyn").value="";draw()};
  $("#synplus").onclick=()=>{add();$("#fsyn").focus()};$("#fsyn").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();add()}};
  for(const id of ["#fqv","#fk"]){const el=$(id);if(el){el.addEventListener("input",()=>{if(open>=0){sync();draw()}});el.addEventListener("change",()=>{if(open>=0){sync();draw()}})}}
  draw();
  return()=>{add();const synq={};for(const x of list){const q=num(x.q);if(x.k&&q>0)synq[x.t]={kind:x.k==="kg"?"g":x.k,q:x.k==="kg"?Math.round(q*1000):q}}
    return{names:list.map(x=>x.t),synq:Object.keys(synq).length?synq:null}}}
// Ingrédient fourni par l'app : on peut seulement lui ajouter des synonymes
function synEditor(f){const ov=document.createElement("div");ov.className="ov";
  const cnt=f.kind==="g"||f.kind==="n",q0=(S.foods[f.id]&&!S.foods[f.id].deleted&&S.foods[f.id].q)||f.q,kg0=f.kind==="g"&&q0>=1000,k0=kg0?"kg":f.kind;
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>Modifier l'ingrédient</h2>
   <label class="flab" for="fn">Nom</label>
   <input type="text" id="fn" autocapitalize="sentences" value="${esc(f.label)}" style="width:100%;margin-bottom:12px">
   ${cnt?`<div class="serv"><span>Par personne</span><input type="text" id="fqv" value="${String(kg0?q0/1000:q0).replace(".",",")}" inputmode="decimal" style="width:80px">
   <select id="fk">${[["g","grammes"],["kg","kilos"],["n","pièce(s)"]].map(([v,l])=>`<option value="${v}" ${v===k0?"selected":""}>${l}</option>`).join("")}</select></div>`:""}
   ${synHtml(Data.baseWords(f.id))}
   <div class="acts"><button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">Enregistrer</button></div></div>`;
  document.body.appendChild(ov);const getSyn=wireSyn(f.syn,f.synq);const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};$("#no").onclick=close;
  if(cnt)$("#fk").onchange=()=>{$("#fqv").value={n:1,kg:1,g:150}[$("#fk").value]};
  $("#ok").onclick=()=>{let label=$("#fn").value.trim();if(!label){$("#fn").focus();return}label=label.charAt(0).toUpperCase()+label.slice(1);
    let kind,q;if(cnt){q=parseFloat(String($("#fqv").value).replace(",","."));if(!(q>0)){$("#fqv").focus();return}
      const k=$("#fk").value;kind=k==="kg"?"g":k;if(k==="kg")q=Math.round(q*1000)}
    const autre=Data.foodFor(label,true);if(autre&&autre.id!==f.id&&!confirm(`« ${label} » ressemble à « ${autre.label} ». Garder ce nom quand même ?`))return;
    const G=getSyn(),syn=G.names.filter(x=>Data.plain(x)!==Data.plain(label)),synq=G.synq;
    const pris=syn.map(x=>[x,Data.foodFor(x,true)]).filter(([x,g])=>g&&g.id!==f.id);
    if(pris.length&&!confirm(`Déjà utilisé : ${pris.map(([x,g])=>`« ${x} » (${g.label})`).join(", ")}. Garder quand même ?`))return;
    touch("foods",{...(S.foods[f.id]||{}),id:f.id,label:label===Data.baseLabel(f.id)?null:label,syn:syn.join(", ")||null,synq,...(cnt?{kind,q}:{}),deleted:false});close();render()}}
// Étapes en markdown simple : # titre, **gras**, *italique*, listes « - » ou « 1. ».
// Sans aucune marque de liste ni titre : une ligne = une étape numérotée.
function md(text){const inl=x=>esc(x).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/(^|[^*])\*([^*\s][^*]*?)\*/g,"$1<i>$2</i>").replace(/__(.+?)__/g,"<b>$1</b>");
  const L=text.split(/\r?\n/);
  if(!L.some(l=>/^\s*(#{1,3}\s|[-*•]\s|\d+[.)]\s)/.test(l)))return `<ol class="card steps">${L.map(x=>x.trim()).filter(Boolean).map(x=>`<li>${inl(x)}</li>`).join("")}</ol>`;
  let out="",list=null;const end=()=>{if(list){out+=`</${list}>`;list=null}};
  for(const raw of L){const l=raw.trim();let m;
    if(!l){end();continue}
    if((m=l.match(/^#{1,3}\s+(.*)$/))){end();out+=`<h4>${inl(m[1])}</h4>`;continue}
    if((m=l.match(/^(?:[-*•])\s+(.*)$/))){if(list!=="ul"){end();out+="<ul>";list="ul"}out+=`<li>${inl(m[1])}</li>`;continue}
    if((m=l.match(/^\d+[.)]\s+(.*)$/))){if(list!=="ol"){end();out+="<ol>";list="ol"}out+=`<li>${inl(m[1])}</li>`;continue}
    end();out+=`<p>${inl(l)}</p>`}
  end();return `<div class="card steps md">${out}</div>`}
// Vue cuisine : la recette pour un autre nombre de personnes, à l'écran seulement (la recette enregistrée ne change pas).
function cookView(r,start){const B=r.serves||BASE;let n=start||B;
  const got=cookGot[r.id]||(cookGot[r.id]=new Set()); // ingrédients déjà sortis / utilisés : barrés
  const ov=document.createElement("div");ov.className="ov cookov";
  const draw=()=>{$("#cn").textContent=n;$("#cb").textContent=n===B?"":`Recette écrite pour ${B} personne${B>1?"s":""}`;
    // préparation : l'ingrédient avec sa quantité (« 3 carottes : couper en rondelles »), pour le nombre de personnes choisi
    if($("#cprep")){const done=new Set([...$("#cprep").querySelectorAll(".got")].map(x=>x.dataset.pi));
      $("#cprep").innerHTML=Data.prepList(r.steps).map((x,j)=>{const [noun,...how]=x.split(" : "),k=Data.plain(noun).replace(/s\b/g,"").trim();
        const g=r.ingredients.find(i=>Data.plain(i.t).replace(/s\b/g,"").includes(k));
        const lab=g?Qty.cook(g.t,n/B):noun;
        return `<div class="row${done.has(String(j))?" got":""}" data-pi="${j}"><span class="t"><b>${esc(lab)}</b> : ${esc(how.join(" : "))}</span></div>`}).join("")}
    if($("#cs"))$("#cs").innerHTML=md(Qty.cookSteps(r.steps,n/B,r.ingredients.map(i=>i.t))); // les quantités des étapes suivent aussi
    $("#cl").innerHTML=r.ingredients.map((i,j)=>`<div class="row${got.has(j)?" got":""}" data-gi="${j}"><span class="t">${esc(Qty.cook(i.t,n/B))}</span></div>`).join("")};
  const site=r.source&&Data.SOURCE.test(r.source)?(/marmiton/.test(r.source)?"Marmiton":"CuisineAZ"):null;
  ov.innerHTML=`<div class="sheet"><div class="cooktop"><button class="pill" id="ced" aria-label="Modifier la recette" title="Modifier">✏️</button><button class="pill" id="cpl" aria-label="Mettre au menu" title="Au menu">📅</button><button class="pill cx" id="cx" aria-label="Fermer" title="Fermer">✕</button></div><h2>${esc(r.name)}</h2>
   ${site||r.prep?`<p class="mut srcl">${r.prep?`⏱ ${r.prep} min de préparation`:""}${site&&r.prep?" · ":""}${site?`<a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">Voir sur ${site} ↗</a>`:""}</p>`:""}
   <div class="serv"><span>Pour</span><button class="btn sec" id="cm">−</button><b id="cn"></b><button class="btn sec" id="cp">+</button><span>personnes</span></div>
   <p class="mut" id="cb"></p><p class="mut wl" id="wl" hidden>🔆 L'écran reste allumé</p>
   <div class="cookcols"><details class="fold" data-f="ing" ${LS.foldIng?"":"open"}><summary class="steps-h">Ingrédients <small class="mut">touchez pour barrer</small></summary><div id="cl" class="card cook"></div></details>
   ${(r.steps||"").trim()?`<details class="fold" data-f="stp" ${LS.foldStp?"":"open"}><summary class="steps-h">Étapes</summary>${(()=>{const pl=Data.prepList(r.steps);return pl.length?`<div class="prep"><div class="prep-h">🔪 Préparation <small class="mut">tout préparer avant de commencer</small></div><div class="card cook" id="cprep"></div></div>`:""})()}<div id="cs"></div></details>`:""}</div></div>`;
  document.body.appendChild(ov);draw();
  // plié / déplié : gardé sur cet appareil
  ov.querySelectorAll(".fold").forEach(d=>d.ontoggle=()=>{const k=d.dataset.f==="ing"?"foldIng":"foldStp";if(d.open)delete LS[k];else LS[k]=1});
  // l'écran reste allumé tant que la recette est ouverte (repris au retour dans l'app)
  // Secours (iPad, anciens iOS, app sur l'écran d'accueil) : une mini-vidéo muette et invisible en boucle empêche la veille
  let lock=null,vid=null;
  const byVideo=()=>{if(!vid){vid=document.createElement("video");vid.src="eveil.mp4";vid.muted=true;vid.loop=true;vid.playsInline=true;
      vid.setAttribute("playsinline","");vid.setAttribute("muted","");vid.setAttribute("aria-hidden","true");vid.className="eveil";ov.appendChild(vid)}
    vid.play().then(()=>{$("#wl").hidden=false}).catch(()=>{})};
  const wake=async()=>{if(!ov.isConnected||document.hidden)return;
    try{if("wakeLock" in navigator&&!lock){lock=await navigator.wakeLock.request("screen");lock.addEventListener("release",()=>{lock=null});$("#wl").hidden=false}}catch(_){}
    byVideo()}; // les deux : la vidéo couvre les appareils où la demande est acceptée sans effet
  const onVis=()=>{if(!document.hidden)wake()};document.addEventListener("visibilitychange",onVis);wake();
  const close=()=>{ov.remove();document.removeEventListener("visibilitychange",onVis);if(lock)lock.release().catch(()=>{});if(vid){vid.pause();vid.removeAttribute("src");vid.load()}};
  ov.onclick=e=>{if(e.target===ov)close()};
  if($("#cprep"))$("#cprep").onclick=e=>{const row=e.target.closest(".row");if(row)row.classList.toggle("got")}; // préparation : touchée = faite
  $("#cl").onclick=e=>{const row=e.target.closest("[data-gi]");if(!row)return;const j=+row.dataset.gi;if(got.has(j))got.delete(j);else got.add(j);row.classList.toggle("got",got.has(j))};
  $("#cm").onclick=()=>{if(n>1){n--;draw()}};$("#cp").onclick=()=>{if(n<30){n++;draw()}};
  $("#cx").onclick=close;$("#ced").onclick=()=>{close();recipeEditor(r)};$("#cpl").onclick=()=>{close();planRecipe(r)};
}
const readMsg=p=>`✓ Recette lue${p.from?` (prévue pour ${p.from}, adaptée pour ${p.serves})`:""} : vérifiez, puis « Enregistrer ».`;
// pre : recette importée (pré-remplie, à vérifier) ; after(recette) : appelé une fois enregistrée
function recipeEditor(r,pre,after,onCancel){
  const lists=live(S.lists).sort(listSort);
  const opts=sel=>lists.map(l=>`<option value="${l.id}" ${l.id===sel?"selected":""}>${esc(SHORT[l.id]||l.name)}</option>`).join("");
  const rowH=i=>`<div class="ed-row"><input type="text" class="ing" value="${esc(i.t)}" placeholder="400 g de pâtes"><select>${opts(i.store||"auchan")}</select><button type="button" class="pill pan ${i.t&&pantryOf(i.t)?"on":""}" aria-label="Toujours à la maison (placard)" title="Placard : toujours à la maison">🏠</button><button class="x">×</button></div>`;
  const ov=document.createElement("div");ov.className="ov";
  ov.innerHTML=`<div class="sheet"><div class="grab"></div><h2>${r?"Modifier la recette":"Nouvelle recette"}</h2>
   <textarea id="paste" class="rlink" rows="3" placeholder="📋 Collez ici la recette : ${r?"":"le lien Marmiton ou CuisineAZ, ou "}le texte (tout, ou seulement les ingrédients, ou seulement les étapes)" autocomplete="off"></textarea><p class="mut rlinkm" id="rlinkm"></p>
   <input type="text" id="rn" placeholder="Nom du plat" value="${esc(r?r.name:"")}" style="width:100%;margin-bottom:10px">
   <div class="serv"><span>Recette pour</span><input type="number" id="sv" value="${r?r.serves||BASE:BASE}" min="1" max="30" inputmode="numeric" style="width:70px"><span>personnes</span></div>
   <input type="hidden" id="sdes" value="${Data.recipeDessert(r||{name:""})?"d":"p"}"><input type="checkbox" id="sgou" hidden ${r&&r.gourmand?"checked":""}><input type="hidden" id="ssn" value="${Data.recipeSeason(r||{name:""})}">
   <div id="rtags" class="nvtags"></div>
   <p class="mut">Ingrédients pour ce nombre de personnes, avec la quantité en premier. Le magasin est celui proposé par défaut.</p>
   <div id="eds">${(r?r.ingredients:[{t:""},{t:""},{t:""}]).map(rowH).join("")}</div>
   <button class="addrow" id="more"><i>+</i>Ajouter un ingrédient</button>
   <h3 class="steps-h">Étapes</h3>
   <textarea id="stp" rows="6" placeholder="Une étape par ligne (markdown possible : # titre, **gras**, - liste)&#10;Faire revenir l'oignon&#10;Ajouter la viande…">${esc(r&&r.steps||"")}</textarea>
   <div class="acts">${r?`<button class="btn sec danger" id="del">Supprimer</button>`:""}<button class="btn sec" id="no">Annuler</button><button class="btn" id="ok">Enregistrer</button></div></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  // recette d'un site : tous les champs remplis, le lien d'origine gardé ; on vérifie puis « Enregistrer »
  let src=r&&r.source||null,prep=r&&r.prep||null;
  const fill=p=>{$("#rn").value=p.name||"";$("#sv").value=p.serves||BASE;$("#stp").value=p.steps||"";src=p.source||null;prep=p.prep||null;
    $("#sdes").value=Data.guessDessert(p.name||"")?"d":"p";$("#ssn").value=Data.recipeSeason({name:p.name||""});if($("#rtags"))paintT();
    [...ov.querySelectorAll(".ed-row")].forEach(el=>el.remove());
    $("#eds").insertAdjacentHTML("beforeend",(p.ingredients||[]).map(t=>rowH({t,store:defaultStore(t,(Data.foodFor(pantryName(t))||{}).store)})).join("")||rowH({t:""}))};
  // une seule case : un lien Marmiton / CuisineAZ (nouvelle recette) est lu sur le site, un texte est trié (plus bas)
  // Plat / Dessert, Gourmand, saison : les mêmes boutons que pour les idées (valeurs dans les champs cachés)
  const SE=[["all","Toute l'année"],["ete","☀️ Été"],["hiver","❄️ Hiver"],["dec","🎄 Noël"]];
  const paintT=()=>{const d=$("#sdes").value==="d",g=$("#sgou").checked,se=$("#ssn").value;
    $("#rtags").innerHTML=`<div class="rfil"><button type="button" data-tg="p" class="${!d?"on":""}">🍽️ Plat</button><button type="button" data-tg="d" class="${d?"on":""}">🍰 Dessert</button><button type="button" data-tg="g" class="${g?"on":""}">😋 Gourmand</button></div>
      <div class="rfil">${SE.map(([v,l])=>`<button type="button" data-ts="${v}" class="${se===v?"on":""}">${l}</button>`).join("")}</div>`};
  paintT();
  $("#rtags").onclick=e=>{const b=e.target.closest("button");if(!b)return;
    if(b.dataset.tg==="g")$("#sgou").checked=!$("#sgou").checked;else if(b.dataset.tg)$("#sdes").value=b.dataset.tg;else if(b.dataset.ts)$("#ssn").value=b.dataset.ts;paintT()};
  const lk=$("#paste");
  const readLink=async()=>{const v=lk.value.trim(),m=$("#rlinkm");if(r||/\n/.test(v)||!/^https?:\/\//i.test(v))return false;
    const u=v.replace(/[?#].*$/,"");
    if(!Data.SOURCE.test(u)){m.textContent="Lien non reconnu : seuls Marmiton et CuisineAZ se lisent. Sinon, collez le texte de la recette.";return true}
    m.textContent="Lecture de la recette…";lk.disabled=true;
    try{const p=await fetchRecipe(u);fill(p);lk.value="";m.textContent=readMsg(p)}catch(e){m.textContent="⚠ "+e.message}
    lk.disabled=false;return true};
  if(pre){fill(pre);$("#rlinkm").textContent=readMsg(pre)}
  // toucher à côté de la fenêtre : on ferme seulement si rien n'a changé (sinon on demande)
  const snap=()=>[...ov.querySelectorAll("input,textarea,select,.pan")].map(e=>e.classList.contains("pan")?e.classList.contains("on"):e.type==="checkbox"?e.checked:e.value).join("\u0001");
  const start=pre?null:snap(); // recette importée : pas encore enregistrée, on demande toujours
  const cancel=()=>{close();if(onCancel)onCancel()};
  ov.onclick=e=>{if(e.target===ov){if(snap()===start||confirm(pre?"Abandonner cette recette importée ?":"Abandonner les modifications de la recette ?"))cancel();return}const x=e.target.closest(".x");if(x)x.parentNode.remove();
    const p=e.target.closest(".pan");if(p)p.classList.toggle("on")}; // 🏠 placard : vaut pour toutes les recettes
  $("#no").onclick=cancel;
  // Texte collé : la recette entière, ou seulement les ingrédients, ou seulement les étapes (tri dans Data.splitPaste) ;
  // le nom du plat (au-dessus de « Ingrédients ») remplit le nom s'il est vide, « pour 6 personnes » règle le nombre.
  $("#paste").oninput=async()=>{if(await readLink())return;$("#rlinkm").textContent="";const v=$("#paste").value;if(!/\n/.test(v.trim()))return;
    const x=Data.splitPaste(v);let lines=x.ingredients;
    if(!lines.length&&!x.steps)return;
    // prévue pour 1 ou 2 : adaptée pour 3 ou 4 (le nombre qui tombe le plus juste), étapes comprises
    const a=x.pour?Data.adaptServes(x.pour,lines,x.steps):{serves:0,ingredients:lines,steps:x.steps,from:null};lines=a.ingredients;
    if(x.pour)$("#sv").value=a.serves;
    if(x.name&&!$("#rn").value.trim())$("#rn").value=x.name;
    if(a.steps){const cur=$("#stp").value.trim();$("#stp").value=cur?cur+"\n"+a.steps:a.steps}
    if(lines.length){[...ov.querySelectorAll(".ed-row")].filter(el=>!el.querySelector(".ing").value.trim()).forEach(el=>el.remove());
      $("#eds").insertAdjacentHTML("beforeend",lines.map(t=>rowH({t,store:defaultStore(t,(Data.foodFor(pantryName(t))||{}).store)})).join(""))}
    const ns=a.steps?a.steps.split("\n").length:0,pl=(n,w)=>n+" "+w+(n>1?"s":"");
    $("#paste").value="";toast("✓ "+[lines.length?pl(lines.length,"ingrédient"):"",ns?pl(ns,"étape"):""].filter(Boolean).join(" et ")+(a.from?` · prévue pour ${a.from}, adaptée pour ${a.serves}`:""))};
  $("#more").onclick=()=>{$("#eds").insertAdjacentHTML("beforeend",rowH({t:""}));$("#eds").lastChild.querySelector(".ing").focus()};
  if(r)$("#del").onclick=()=>{if(confirm("Supprimer cette recette ?")){touch("recipes",{...r,deleted:true});close();render()}};
  $("#ok").onclick=()=>{
    const name=$("#rn").value.trim();
    const ings=[...ov.querySelectorAll(".ed-row")].map(el=>({t:el.querySelector(".ing").value.trim(),store:el.querySelector("select").value,pan:el.querySelector(".pan").classList.contains("on")})).filter(x=>x.t);
    for(const g of ings)if(g.pan!==pantryOf(g.t)){const nm=pantryName(g.t),k=Data.pantryKey(nm);
      touch("stores",{...(S.stores[k]||{id:k,last:[],def:null,n:0}),id:k,name:(S.stores[k]&&S.stores[k].name)||nm,pantry:g.pan})}
    ings.forEach(g=>delete g.pan);
    if(!name){$("#rn").focus();return}
    const saved={id:r?r.id:uid(),name,steps:$("#stp").value.trim(),season:$("#ssn").value,dessert:$("#sdes").value==="d",serves:Math.max(1,Math.min(30,parseInt($("#sv").value,10)||4)),ingredients:ings,source:src,prep,gourmand:$("#sgou").checked||null};
    touch("recipes",saved);close();if(after){render();after(S.recipes[saved.id]);return}render();
  };
}
// Mise à jour automatique : à l'ouverture et au retour dans l'app, si une nouvelle version est en ligne, on recharge
// (jamais pendant une saisie ; une seule tentative par version, au cas où le serveur tarde à servir les nouveaux fichiers).
async function autoUpdate(atStart){
  try{const a=document.activeElement;if(document.hidden||(a&&a.matches("input,textarea,select"))||document.querySelector(".ov"))return;
    const t=await (await fetch("sw.js?v="+Date.now(),{cache:"no-store"})).text(),v=(t.match(/V="([^"]+)"/)||[])[1];
    if(!v||v===VERSION||LS.autoTried===v)return;
    if(!atStart&&S.lists[tab])return; // au retour dans l'app sur une liste (en magasin) : pas de rechargement
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
// Récupère les changements des autres appareils (les siens partent tout de suite).
let lastSync=0;
setInterval(()=>{const a=document.activeElement,onList=tab!=="menus"&&tab!=="settings";
  // une fois par minute quand l'app est visible (même si un champ est sélectionné : on ne fait que lire) ; l'affichage attend la fin d'une saisie.
  // Chaque validation d'un repas relit aussi les changements de l'autre téléphone (sync lit avant d'envoyer), et l'ouverture d'un onglet aussi.
  // sur l'onglet Menus (à deux sur la semaine) : toutes les 15 s ; ailleurs, une fois par minute
  if(document.hidden||Date.now()-lastSync<(tab==="menus"?15000:60000))return;lastSync=Date.now();sync()},5000);
window.syncSoon=()=>{if(!document.hidden&&Date.now()-lastSync>8000){lastSync=Date.now();sync()}};
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
// 5ᵉ plat gourmand (junk food comprise) dans la semaine du repas : on prévient, sans bloquer
function gourmandWarn(key){const m=S.meals[key];if(!m||!Data.isGourmand(S,m.text))return;
  const mon=Data.mondayOf(key.slice(0,10)),sun=Data.addDays(mon,6);
  const n=live(S.meals).filter(x=>x.text&&x.key&&x.key.slice(0,10)>=mon&&x.key.slice(0,10)<=sun&&Data.isGourmand(S,x.text)).length;
  if(n>=5)toast(`⚠ ${n}ᵉ plat gourmand cette semaine (4 conseillés)`)}
// Fenêtres : tirées vers le bas (depuis la poignée, ou quand leur contenu est tout en haut), elles se ferment comme sur
// iPhone. Même effet que toucher à côté : chaque fenêtre garde sa règle (confirmation, « Ne pas ajouter aux listes »…) ;
// si elle reste ouverte (choix obligatoire, confirmation refusée), elle revient en place.
{let drag=null;
  document.addEventListener("touchstart",e=>{const sh=e.target.closest(".ov>.sheet");if(!sh||e.touches.length>1)return;
    const onGrab=!!e.target.closest(".grab");
    if(!onGrab&&(sh.scrollTop>0||e.target.closest("input,textarea,select,.sug,.plist,.igl,.scanbox")))return;
    drag={sh,y:e.touches[0].clientY,t:Date.now(),dy:0}},{passive:true});
  document.addEventListener("touchmove",e=>{if(!drag)return;const dy=e.touches[0].clientY-drag.y;
    if(dy<=0&&!drag.dy){drag=null;return} // vers le haut : on laisse défiler le contenu
    drag.dy=Math.max(0,dy);drag.sh.style.transition="none";drag.sh.style.transform=`translateY(${drag.dy}px)`;e.preventDefault()},{passive:false});
  document.addEventListener("touchend",()=>{if(!drag)return;const {sh,dy,t}=drag;drag=null;const ov=sh.parentElement;
    sh.style.transition="transform .2s ease";
    if(dy>110||(dy>50&&dy/(Date.now()-t)>0.3)){ // assez loin, ou un petit coup rapidesh.style.transform="translateY(100%)";
      setTimeout(()=>{ov.dispatchEvent(new MouseEvent("click",{bubbles:true}));if(ov.isConnected)sh.style.transform=""},180)}
    else sh.style.transform=""});
}
// message en haut de l'écran ; avec undo : bouton « Annuler » pendant 5 s
function toast(msg,undo){document.querySelectorAll(".toast").forEach(x=>x.remove());
  const t=document.createElement("div");t.className="toast"+(undo?" undo":"");const m=document.createElement("span");m.textContent=msg;t.appendChild(m);
  if(undo){const b=document.createElement("button");b.type="button";b.textContent="Annuler";b.onclick=()=>{t.remove();undo()};t.appendChild(b)}
  document.body.appendChild(t);setTimeout(()=>t.remove(),undo?5000:3500)}
purgeDone();render();if(tab==="menus"){toToday();setTimeout(()=>{maybeAvis()},1500)}if(tab==="recettes")setTimeout(dailyIdeas,1500);sync();
setInterval(purgeDone,5*60*1000);
// pas encore de code (nouvel appareil) : directement sur l'onglet Foyer, où on le saisit
if(!code&&cfg.SUPABASE_URL)setTimeout(()=>{tab=LS.tab="settings";stab="foyer";render()},300);
