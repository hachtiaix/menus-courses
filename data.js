// Données de l'app : nettoyage de ce qui arrive de l'extérieur, fusion et purge.
// Sans accès au DOM, pour pouvoir être testé (tests/data.test.js).
(function(root){
const KINDS=["lists","items","meals","recipes","aisles","stores","habits","foods"];
const ID=/^[\w-]{1,64}$/, okId=id=>typeof id==="string"&&ID.test(id)&&id!=="__proto__";
const str=(v,n)=>typeof v==="string"?v.slice(0,n):"";
const int=(v,min,max,def)=>Math.max(min,Math.min(max,parseInt(v,10)||def));
const DAY=864e5;
const TOMBSTONE_TTL=60*DAY;  // éléments supprimés : oubliés après 60 jours
const MEAL_TTL=180*DAY;      // repas : gardés 6 mois
const HABIT_TTL=730*DAY;     // habitude oubliée après 24 mois sans être suivie

// Saison d'une recette : "all" (toute l'année), "ete" (pas de novembre à mars), "hiver" (pas de mai à septembre).
const SEASONS=["all","ete","hiver"];
// Expressions entières (sans accents), au singulier ; le pluriel en s/x est accepté.
const SEASON_WORDS={
  hiver:["tartiflette","croziflette","raclette","fondue","pierrade","pot au feu","choucroute","potee","soupe","veloute","potage",
         "blanquette","bourguignon","daube","cassoulet","parmentier","aligot","carbonade","garbure","mont d or","vin chaud"],
  ete:["salade","gaspacho","gazpacho","taboule","barbecue","bbq","brochette","melon","carpaccio","ceviche","poke","pan bagnat",
       "tomate mozzarella","sorbet"],
};
const plain=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const words=s=>" "+plain(s).replace(/[^a-z0-9]+/g," ").trim()+" ";
function guessSeason(name){
  const n=words(name);
  for(const [s,list] of Object.entries(SEASON_WORDS))
    for(const p of list)if(new RegExp(" "+p.replace(/ /g,"[sx]? ")+"[sx]? ").test(n))return s;
  return "all";
}
const recipeSeason=r=>(r&&r.season)||guessSeason(r&&r.name);
const inSeason=(season,month)=>season==="ete"?!(month>=11||month<=3):season==="hiver"?!(month>=5&&month<=9):true;

// Types de plats (pour les habitudes), reconnus dans le nom : l'expression la plus à gauche l'emporte
// (« Salade de pâtes » → salade, « Gratin de pâtes » → gratin).
const TYPES=[
  {id:"pates",dish:"Pâtes",label:"Pâtes",icon:"🍝",words:["pate","spaghetti","tagliatelle","penne","fusilli","macaroni","coquillette","carbonara","bolognaise",
    "lasagne","ravioli","gnocchi","linguine","farfalle","tortellini","cannelloni","pesto"]},
  {id:"soupe",dish:"Soupe",label:"Soupe",icon:"🍲",words:["soupe","veloute","potage","minestrone","gaspacho","gazpacho","bouillon","garbure"]},
  {id:"burger",dish:"Burgers",label:"Burger / hot-dog",icon:"🍔",words:["burger","hamburger","cheeseburger","hot dog","hotdog"]},
  {id:"pizza",dish:"Pizza",label:"Pizza",icon:"🍕",words:["pizza","calzone"]},
  {id:"salade",dish:"Salade",label:"Salade",icon:"🥗",words:["salade","taboule","poke"]},
  {id:"poisson",dish:"Poisson",label:"Poisson",icon:"🐟",words:["poisson","saumon","cabillaud","colin","truite","dorade","merlu","lieu","sole","crevette","moule","fruits de mer"]},
  {id:"gratin",dish:"Gratin",label:"Gratin",icon:"🧀",words:["gratin","parmentier","moussaka"]},
  {id:"quiche",dish:"Quiche",label:"Quiche / tarte",icon:"🥧",words:["quiche","tarte","tourte","flammekueche"]},
  {id:"raclette",dish:"Raclette",label:"Raclette / fondue",icon:"🫕",words:["raclette","fondue","tartiflette","croziflette","pierrade"]},
  {id:"riz",dish:"Riz",label:"Riz / curry",icon:"🍛",words:["riz","risotto","curry","paella","biryani","chili"]},
];
const TYPE_IDS=TYPES.map(t=>t.id);
function typeOf(name){
  const n=words(name);let best=null,at=Infinity;
  for(const t of TYPES)for(const w of t.words){const m=n.match(new RegExp(" "+w.replace(/ /g,"[sx]? ")+"[sx]? "));if(m&&m.index<at){at=m.index;best=t.id}}
  return best;
}
// 2e plat appris : parmi les 3 dernières fois où ce plat (ou ce type de plat) a été mangé, au moins 2 avaient
// un 2e plat → on en prévoit un, avec le nombre de personnes de la dernière fois. Sinon null.
function companionFor(S,name,today){
  const t=typeOf(name),same=x=>t?typeOf(x)===t:plain(x).trim()===plain(name).trim(),past=[];
  for(const [k,m] of Object.entries(S.meals||{})){
    if(m.deleted||!m.text||/\d$/.test(k)||k.slice(0,10)>=today||!same(m.text))continue;
    const s=(S.meals||{})[k+"2"];past.push({d:k.slice(0,10),n:s&&!s.deleted&&s.text?s.servings||1:0});
  }
  const last3=past.sort((a,b)=>b.d.localeCompare(a.d)).slice(0,3),withSide=last3.filter(x=>x.n);
  if(withSide.length>=2)return{n:withSide[0].n};
  return t==="soupe"?{n:1}:null; // une soupe est toujours proposée avec un 2e plat
}
// Aliments de base : portion par personne (q, en g ou en unités), rayon/magasin par défaut.
// kind "g" : grammes ; "n" : à l'unité ; "box" : légumes en boîte (petite 1 pers., moyenne 2, grande 4) ; "text" : ligne fixe.
const FOODS=[
  {id:"viande",icon:"🥩",cat:"prot",label:"Viande rouge",words:["viande rouge","viande","steak","boeuf","bavette","entrecote","roti de boeuf"],kind:"g",q:150,store:"boucherie"},
  {id:"hache",icon:"🥩",cat:"prot",label:"Steak haché",words:["steak hache","viande hachee","hache"],kind:"n",q:1,store:"boucherie"},
  {id:"poulet",icon:"🍗",cat:"prot",label:"Poulet",words:["poulet","blanc de poulet"],kind:"g",q:150,store:"boucherie"},
  {id:"esc-poulet",icon:"🍗",cat:"prot",label:"Escalopes de poulet",words:["escalope de poulet","escalopes de poulet"],kind:"n",q:1,store:"boucherie"},
  {id:"esc-dinde",icon:"🦃",cat:"prot",label:"Escalopes de dinde",words:["escalope de dinde","escalopes de dinde","dinde"],kind:"n",q:1,store:"boucherie"},
  {id:"esc-veau",icon:"🐄",cat:"prot",label:"Escalopes de veau",words:["escalope de veau","escalopes de veau","veau"],kind:"n",q:1,store:"boucherie"},
  {id:"paupiette",icon:"🐄",cat:"prot",label:"Paupiettes de veau",words:["paupiette"],kind:"n",q:1,store:"boucherie"},
  {id:"crepinette",icon:"🐖",cat:"prot",label:"Crépinettes",words:["crepinette"],kind:"n",q:1,store:"boucherie"},
  {id:"porc",icon:"🐖",cat:"prot",label:"Porc",words:["porc","cote de porc","filet mignon"],kind:"g",q:150,store:"boucherie"},
  {id:"saucisse",icon:"svg:saucisse",cat:"prot",label:"Saucisses",words:["saucisse","chipolata","merguez"],kind:"n",q:2,store:"boucherie"},
  {id:"jambon",icon:"🍖",cat:"prot",label:"Jambon",words:["jambon"],kind:"n",q:2,as:"tranche de jambon",store:"auchan"},
  {id:"cordon-bleu",icon:"🍗",cat:"prot",label:"Cordons bleus",words:["cordon bleu","cordons bleu"],kind:"n",q:1,store:"auchan"},
  {id:"nuggets",icon:"🍗",cat:"prot",label:"Nuggets",words:["nugget"],kind:"n",q:6,store:"auchan"},
  {id:"roti-porc",icon:"🐖",cat:"prot",label:"Rôti de porc",words:["roti de porc"],kind:"g",q:150,store:"boucherie"},
  {id:"agneau",icon:"🐑",cat:"prot",label:"Côtes d'agneau",words:["cote d agneau","cotes d agneau","agneau"],kind:"n",q:2,store:"boucherie"},
  {id:"cuisse-poulet",icon:"🍗",cat:"prot",label:"Cuisses de poulet",words:["cuisse de poulet","cuisses de poulet"],kind:"n",q:1,store:"boucherie"},
  {id:"boudin-noir",icon:"svg:saucisse",cat:"prot",label:"Boudin noir",words:["boudin noir","boudin"],kind:"n",q:1,store:"boucherie"},
  {id:"boudin-blanc",icon:"svg:saucisse",cat:"prot",label:"Boudin blanc",words:["boudin blanc"],kind:"n",q:1,store:"boucherie"},
  {id:"poisson",icon:"🐟",cat:"pois",label:"Poisson",words:["poisson","saumon","cabillaud","colin","lieu","merlu"],kind:"g",q:150,store:"auchan"},
  {id:"saumon-fume",icon:"svg:saumon-fume",cat:"pois",label:"Saumon fumé",words:["saumon fume"],kind:"n",q:2,as:"tranche de saumon fumé",store:"auchan"},
  {id:"truite-fumee",icon:"svg:truite-fumee",cat:"pois",label:"Truite fumée",words:["truite fume","truite fumee"],kind:"n",q:2,as:"tranche de truite fumée",store:"auchan"},
  {id:"crevettes",icon:"🦐",cat:"pois",label:"Crevettes",words:["crevette","gambas"],kind:"g",q:150,store:"auchan"},
  {id:"st-jacques",icon:"🐚",cat:"pois",label:"Noix de Saint-Jacques",words:["saint jacques","st jacques","noix de saint jacques","noix de st jacques"],kind:"n",q:3,store:"auchan"},
  {id:"moules",icon:"🦪",cat:"pois",label:"Moules",words:["moule"],kind:"g",q:1000,store:"auchan"},
  {id:"pdt-surg",icon:"🥔",cat:"fec",label:"Pommes de terre surgelées",words:["pdt surgele","pdt surgelee","pomme de terre surgele","pomme de terre surgelee","pommes de terre surgelee"],kind:"g",q:200,store:"auchan"},
  {id:"frites",icon:"🍟",cat:"fec",label:"Frites",words:["frite","potatoes"],kind:"g",q:250,buy:"pommes de terre (frites maison)",store:"auchan"},
  {id:"pdt",icon:"🥔",cat:"fec",label:"Pommes de terre",words:["pdt","pomme de terre","patate"],kind:"g",q:250,store:"auchan"},
  {id:"pates",icon:"🍝",cat:"fec",label:"Pâtes",words:["pate","spaghetti","tagliatelle","penne","coquillette"],kind:"g",q:100,store:"auchan"},
  {id:"riz",icon:"🍚",cat:"fec",label:"Riz",words:["riz"],kind:"g",q:80,store:"auchan"},
  {id:"beans",icon:"🥫",cat:"fec",label:"Beans",words:["beans","baked beans","haricots a la tomate"],kind:"n",q:1,as:"boîte de beans (400 g)",store:"auchan"},
  {id:"raviolis",icon:"🥫",cat:"fec",label:"Raviolis",words:["ravioli","raviolis"],kind:"n",q:1,as:"boîte de raviolis (400 g)",store:"auchan"},
  {id:"orzo",icon:"🍝",cat:"fec",label:"Orzo",words:["orzo","pates grain de riz","risoni"],kind:"g",q:80,store:"auchan"},
  {id:"ebly",icon:"🌾",cat:"fec",label:"Blé Ebly",words:["ebly","ble ebly","ble tendre","ble"],kind:"g",q:80,store:"auchan"},
  {id:"gnocchis",icon:"🥔",cat:"fec",label:"Gnocchis",words:["gnocchi"],kind:"g",q:150,store:"auchan"},
  {id:"quinoa",icon:"🌾",cat:"fec",label:"Quinoa",words:["quinoa"],kind:"g",q:70,store:"auchan"},
  {id:"tortillas",icon:"🌮",cat:"fec",label:"Tortillas",words:["tortilla","wrap"],kind:"n",q:2,store:"auchan"},
  {id:"semoule",icon:"🌾",cat:"fec",label:"Semoule",words:["semoule"],kind:"g",q:80,store:"auchan"},
  {id:"lentilles",icon:"🫘",cat:"fec",label:"Lentilles",words:["lentille"],kind:"g",q:70,store:"auchan"},
  {id:"legboite",icon:"🫛",cat:"leg",label:"Haricots verts",words:["haricot vert"],kind:"box",store:"auchan"},
  {id:"petitspois",icon:"🫛",cat:"leg",label:"Petits pois",words:["petit pois"],kind:"box",store:"auchan"},
  {id:"flageolets",icon:"🫛",cat:"leg",label:"Flageolets",words:["flageolet"],kind:"box",store:"auchan"},
  {id:"legsurg",icon:"🥦",cat:"leg",label:"Légumes surgelés",words:["haricot vert surgele","legume surgele","legumes surgelee"],kind:"g",q:150,store:"auchan"},
  {id:"soupe",icon:"🍲",cat:"leg",label:"Soupe",words:["soupe","veloute","potage"],kind:"text",line:"légumes pour soupe (à choisir)",store:"fermiers"},
  {id:"tomate",icon:"🍅",cat:"leg",label:"Tomates",words:["tomate"],kind:"n",q:1,store:"auchan"},
  {id:"carotte",icon:"🥕",cat:"leg",label:"Carottes",words:["carotte"],kind:"g",q:100,store:"auchan"},
  {id:"courgette",icon:"🥒",cat:"leg",label:"Courgettes",words:["courgette"],kind:"n",q:0.5,store:"auchan"},
  {id:"concombre",icon:"🥒",cat:"leg",label:"Concombre",words:["concombre"],kind:"n",q:0.25,store:"auchan"},
  {id:"poivron",icon:"🫑",cat:"leg",label:"Poivrons",words:["poivron"],kind:"n",q:0.5,store:"auchan"},
  {id:"aubergine",icon:"🍆",cat:"leg",label:"Aubergines",words:["aubergine"],kind:"n",q:0.5,store:"auchan"},
  {id:"champignon",icon:"🍄",cat:"leg",label:"Champignons",words:["champignon"],kind:"g",q:100,store:"auchan"},
  {id:"brocoli",icon:"🥦",cat:"leg",label:"Brocoli",words:["brocoli"],kind:"g",q:150,store:"auchan"},
  {id:"avocat",icon:"🥑",cat:"leg",label:"Avocats",words:["avocat"],kind:"n",q:0.5,store:"auchan"},
  {id:"epinards",icon:"🥬",cat:"leg",label:"Épinards surgelés",words:["epinard","epinards surgele"],kind:"g",q:150,store:"auchan"},
  {id:"choufleur",icon:"🥦",cat:"leg",label:"Chou-fleur",words:["chou fleur"],kind:"n",q:0.25,store:"auchan"},
  {id:"salade",icon:"🥬",cat:"leg",label:"Salade",words:["salade verte","salade"],kind:"n",q:0.25,store:"auchan"},
  {id:"oeufs",icon:"🥚",cat:"prot",label:"Œufs",words:["oeuf","omelette"],kind:"n",q:2,store:"auchan"},
];
// Aliment reconnu dans un morceau de texte : l'expression la plus longue qui correspond.
// exact : le texte entier doit être l'aliment (« Soupe » oui, « Pommes de terre vache qui rit » non).
// Ingrédients ajoutés dans les réglages (S.foods avec un nom) : mêmes règles que ceux de base.
const FOOD_CATS=["leg","fec","prot","pois"],CAT_ICON={leg:"🥦",fec:"🥔",prot:"🥩",pois:"🐟"};
// Image d'un ingrédient ajouté à la main, d'après son nom (sinon celle de sa famille).
const EMOJI=[["tomate","🍅"],["carotte","🥕"],["courgette","🥒"],["concombre","🥒"],["cornichon","🥒"],["poivron","🫑"],["piment","🌶️"],["aubergine","🍆"],
 ["champignon","🍄"],["brocoli","🥦"],["chou","🥬"],["salade","🥬"],["laitue","🥬"],["epinard","🥬"],["poireau","🥬"],["blette","🥬"],["avocat","🥑"],["mais","🌽"],
 ["oignon","🧅"],["echalote","🧅"],["ail","🧄"],["asperge","🌱"],["navet","🫜"],["radis","🫜"],["betterave","🫜"],["panais","🫜"],["celeri","🫜"],["topinambour","🫜"],["patate douce","🍠"],["potiron","🎃"],["courge","🎃"],["butternut","🎃"],["citrouille","🎃"],
 ["haricot","🫛"],["petit pois","🫛"],["pois","🫛"],["feve","🫛"],["edamame","🫛"],["olive","🫒"],
 ["pomme de terre","🥔"],["patate","🥔"],["frite","🍟"],["pate","🍝"],["spaghetti","🍝"],["nouille","🍜"],["riz","🍚"],["pain","🥖"],["baguette","🥖"],["wrap","🌯"],["tortilla","🌮"],
 ["quinoa","🌾"],["boulgour","🌾"],["ble","🌾"],["semoule","🌾"],["lentille","🫘"],["pois chiche","🫘"],["haricot rouge","🫘"],["gnocchi","🥔"],["polenta","🌽"],
 ["poulet","🍗"],["dinde","🦃"],["canard","🦆"],["lapin","🐇"],["boeuf","🥩"],["steak","🥩"],["veau","🐄"],["agneau","🐑"],["mouton","🐑"],["porc","🐖"],
 ["jambon","🍖"],["lardon","🥓"],["bacon","🥓"],["saucisse","svg:saucisse"],["chorizo","svg:saucisse"],["merguez","svg:saucisse"],["boudin","svg:saucisse"],["andouillette","svg:saucisse"],["oeuf","🥚"],["fromage","🧀"],["tofu","🧈"],
 ["crevette","🦐"],["gambas","🦐"],["langoustine","🦐"],["homard","🦞"],["langouste","🦞"],["crabe","🦀"],["tourteau","🦀"],["calamar","🦑"],["encornet","🦑"],["seiche","🦑"],["poulpe","🐙"],
 ["huitre","🦪"],["moule","🦪"],["coque","🦪"],["bulot","🐚"],["bigorneau","🐚"],["saint jacques","🐚"],["palourde","🐚"],["saumon","🐟"],["thon","🐟"],["sardine","🐟"],["maquereau","🐟"]];
function emojiFor(label){const n=words(label);let best=null,len=0;
  for(const [w,e] of EMOJI)if(w.length>len&&new RegExp(" "+w.replace(/ /g,"[sx]? ")+"[sx]? ").test(n)){best=e;len=w.length}
  return best}
let CUSTOM=[];
function setCustom(S){CUSTOM=Object.values(S.foods||{}).filter(r=>r&&!r.deleted&&r.label&&r.cat!=="wait"&&!FOODS.some(f=>f.id===r.id))
  .map(r=>({id:r.id,icon:emojiFor(r.label)||CAT_ICON[r.cat],cat:r.cat,label:r.label,words:[words(r.label).trim().replace(/s$/,"")],kind:r.kind,q:r.q,store:r.store||"auchan",custom:true}))}
const allFoods=()=>[...FOODS,...CUSTOM];
// Aliments inconnus d'une suite (« Saucisses, Asperges » → ["Asperges"]) : ni ingrédient, ni recette, ni déjà à classer ou écarté.
function unknownFoods(S,text){
  const parts=String(text||"").split(/\s*(?:,|\+|\bet\b)\s*/i).map(x=>x.trim()).filter(Boolean);
  const seen=new Set(Object.values(S.foods||{}).filter(r=>r&&r.label).map(r=>plain(r.label)));
  return parts.filter(p=>!foodFor(p)&&!recipeNamed(S,p)&&!seen.has(plain(p))&&(seen.add(plain(p)),true));
}
function foodFor(name,exact){
  const n=words(name);let best=null,len=0;
  for(const f of allFoods())for(const w of f.words){const re=" "+w.replace(/ /g,"[sx]? ")+"[sx]? ";
    if(w.length>len&&new RegExp(exact?"^"+re+"$":re).test(n)){best=f;len=w.length}}
  return best;
}
// Ingrédient « pour 1 personne » d'un aliment (portion réglée dans S.foods, sinon par défaut).
function foodLine(S,f,name){
  const q=(S.foods&&S.foods[f.id]&&!S.foods[f.id].deleted&&S.foods[f.id].q)||f.q;
  const nm=name.trim().replace(/^(\p{Lu})(?=\p{Ll})/u,c=>c.toLowerCase()); // « Poulet » → « poulet », « PDT » inchangé
  if(f.kind==="g")return q+" g de "+nm;
  if(f.kind==="n"&&f.as)return String(q).replace(".",",")+" "+f.as; // ex. « 1 boîte de beans (400 g) »
  if(f.kind==="n")return String(q).replace(".",",")+" "+nm;
  if(f.kind==="text")return f.line;
  return nm; // boîte : comptée par personne par Qty.buy
}
// Morceaux d'une suite d'aliments avec leur famille (affichage en étiquettes), ou null si ce n'est pas une suite.
function suiteTags(S,text){
  if(!suite(S,text))return null;
  return String(text).split(/\s*(?:,|\+|\bet\b)\s*/i).map(x=>x.trim()).filter(Boolean).map(p=>{const f=foodFor(p);return{t:p,cat:recipeNamed(S,p)?"rcp":f?f.cat:"autre"}});
}
// Sur la liste : le nom complet de l'ingrédient (« Épinards » → « épinards surgelés »), sauf pour les familles larges
// où le mot tapé est plus précis (« bavette » reste « bavette » plutôt que « viande rouge »).
const GENERIC=["viande","poisson","porc"];
// Suite d'aliments (« viande rouge, haricots verts, PDT surgelés ») → recette virtuelle pour 1 personne, ou null.
// Une recette enregistrée peut faire partie de la suite (« Carbonade flamande, Frites ») : ses ingrédients sont repris,
// et la suite est comptée pour le nombre de personnes de la recette (les aliments sont multipliés d'autant).
const recipeNamed=(S,p)=>Object.values(S.recipes||{}).find(r=>r&&!r.deleted&&r.name&&plain(r.name)===plain(p));
function suite(S,text){
  const parts=String(text||"").split(/\s*(?:,|\+|\bet\b)\s*/i).map(x=>x.trim()).filter(Boolean);
  if(!parts.length||(parts.length===1&&!foodFor(parts[0],true)))return null;
  const recs=parts.map(p=>recipeNamed(S,p)),B=(recs.find(Boolean)||{}).serves||1,ings=[];
  parts.forEach((p,i)=>{const r=recs[i];
    if(r){for(const g of r.ingredients||[])ings.push({t:(r.serves||4)===B?g.t:Qty.buy(g.t,B/(r.serves||4),r.serves||4),store:g.store||"auchan"});return}
    const f=foodFor(p),t=f?foodLine(S,f,GENERIC.includes(f.id)?p:f.buy||f.label):p;
    ings.push({t:f&&B>1&&f.kind!=="text"?Qty.buy(t,B,1):t,store:f?f.store:"auchan"})});
  return{name:text,serves:B,virtual:true,ingredients:ings};
}
// Clés : « AAAA-MM-JJ-s » repas principal, « AAAA-MM-JJ-s2 » 2e plat du même repas.
const isSecond=key=>/\d$/.test(key);
// Dates « AAAA-MM-JJ » : jour de la semaine 1 (lundi) … 7 (dimanche), décalage, lundi de la semaine.
const addDays=(ymd,n)=>new Date(Date.parse(ymd)+n*DAY).toISOString().slice(0,10);
const weekday=ymd=>((new Date(Date.parse(ymd)).getUTCDay()+6)%7)+1;
const mondayOf=ymd=>addDays(ymd,1-weekday(ymd));

// Une habitude vise un type de plat (h.type) ou une recette précise (h.recipe).
const habitMatches=(S,h,name)=>{
  if(h.recipe){const r=(S.recipes||{})[h.recipe];return!!(r&&!r.deleted&&plain(r.name).trim()===plain(name).trim())}
  return typeOf(name)===h.type;
};
// Habitudes attendues pour un créneau (objets habitude).
function habitsFor(S,key){
  const ymd=key.slice(0,10),wd=weekday(ymd),slot=key.slice(-1),mon=mondayOf(ymd),out=[];
  for(const h of Object.values(S.habits||{})){
    if(h.deleted||h.state!=="on"||h.slot!==slot||!h.days.includes(wd))continue;
    const done=h.days.some(d=>{if(d===wd)return false;const m=(S.meals||{})[addDays(mon,d-1)+"-"+slot];return m&&!m.deleted&&m.text&&habitMatches(S,h,m.text)});
    if(!done)out.push(h);
  }
  return out;
}
// Types d'habitude attendus pour un créneau (« 2026-10-12-s »). Habitude sur plusieurs jours (« vendredi ou samedi ») :
// ignorée si le type est déjà prévu un autre de ces jours dans la même semaine.
function habitTypesFor(S,key){
  const ymd=key.slice(0,10),wd=weekday(ymd),slot=key.slice(-1),mon=mondayOf(ymd),out=[];
  for(const h of Object.values(S.habits||{})){
    if(h.deleted||h.state!=="on"||h.slot!==slot||!h.days.includes(wd))continue;
    const done=h.days.some(d=>{if(d===wd)return false;const m=(S.meals||{})[addDays(mon,d-1)+"-"+slot];return m&&!m.deleted&&m.text&&typeOf(m.text)===h.type});
    if(!done)out.push(h.type);
  }
  return out;
}

// Apprentissage sur les 8 semaines complètes précédant celle de « today » :
// un type présent au moins 3 semaines sur 8 sur un créneau, et au moins une fois sur deux quand ce créneau a un repas
// → habitude ; même règle sur deux jours voisins (« vendredi ou samedi soir »).
// Pour chaque habitude active : dernière date où elle a été suivie (seen) ; oubliée après 24 mois sans être suivie.
function learnHabits(S,today){
  const mon=mondayOf(today),start=addDays(mon,-56),cells={},any={};
  const put=(o,k,w)=>(o[k]=o[k]||new Set()).add(w);
  for(const [k,m] of Object.entries(S.meals||{})){
    if(m.deleted||!m.text)continue;const ymd=k.slice(0,10);if(ymd<start||ymd>=mon)continue;
    const w=Math.floor((Date.parse(ymd)-Date.parse(start))/(7*DAY)),wd=weekday(ymd),s=k.slice(-1),t=typeOf(m.text);
    put(any,wd+"|"+s,w);if(t)put(cells,t+"|"+wd+"|"+s,w);
  }
  const get=(o,k)=>o[k]||new Set(),union=(...a)=>new Set(a.flatMap(x=>[...x]));
  const ok=(W,A)=>W.size>=3&&W.size*2>=A.size,add=[];
  for(const t of TYPE_IDS)for(const s of ["m","s"]){
    const W=wd=>get(cells,t+"|"+wd+"|"+s),A=wd=>get(any,wd+"|"+s),used=new Set();
    // d'abord les paires : retenues si elles expliquent au moins 2 semaines de plus que le meilleur des deux jours seuls
    for(let wd=1;wd<=6;wd++){
      if(used.has(wd))continue;
      const P=union(W(wd),W(wd+1));
      if(ok(P,union(A(wd),A(wd+1)))&&P.size>=Math.max(W(wd).size,W(wd+1).size)+2){add.push({days:[wd,wd+1],slot:s,type:t});used.add(wd);used.add(wd+1)}
    }
    for(let wd=1;wd<=7;wd++)if(!used.has(wd)&&ok(W(wd),A(wd)))add.push({days:[wd],slot:s,type:t});
  }
  const drop=[],seen={};
  for(const h of Object.values(S.habits||{})){
    if(h.deleted||h.state!=="on")continue;
    let last=null;
    for(const [k,m] of Object.entries(S.meals||{})){
      if(m.deleted||!m.text)continue;const ymd=k.slice(0,10);
      if(ymd>=today||k.slice(-1)!==h.slot||!h.days.includes(weekday(ymd)))continue;
      if(habitMatches(S,h,m.text)&&(!last||ymd>last))last=ymd;
    }
    if(last)seen[h.id]=last;
    const ref=[last,h.last,h.since].filter(Boolean).sort().pop();
    if(ref&&Date.parse(today)-Date.parse(ref)>HABIT_TTL)drop.push(h.id);
  }
  // Habitudes qui évoluent : un nouveau rythme détecté remplace une habitude qui n'est plus suivie depuis 8 semaines
  // (même plat à d'autres jours → nouveaux jours ; autre plat aux mêmes jours → nouveau plat). Sinon, nouvelle habitude.
  const recent=id=>seen[id]&&seen[id]>=start,change=[],fresh=[];
  for(const c of add){
    const active=Object.values(S.habits||{}).filter(h=>!h.deleted&&h.state==="on"&&h.slot===c.slot&&!change.some(x=>x.id===h.id));
    const same=active.find(h=>!h.recipe&&h.type===c.type&&h.days.some(d=>c.days.includes(d)));
    if(same){if(same.days.join()!==c.days.join()&&!recent(same.id))change.push({id:same.id,days:c.days});continue}
    const moved=active.find(h=>!h.recipe&&h.type===c.type&&!recent(h.id));
    if(moved){change.push({id:moved.id,days:c.days});continue}
    const replaced=active.find(h=>h.days.some(d=>c.days.includes(d))&&!recent(h.id));
    if(replaced){change.push({id:replaced.id,type:c.type,recipe:null,days:c.days});continue}
    fresh.push(c);
  }
  return{add:fresh,drop:drop.filter(id=>!change.some(x=>x.id===id)),seen,change};
}

// Tirage pseudo-aléatoire reproductible (ordre propre à chaque créneau quand des plats sont à égalité).
function seeded(str){let h=2166136261;for(const c of String(str))h=Math.imul(h^c.charCodeAt(0),16777619);
  return()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return((h>>>0)%10000)/10000}}

// Suggestions pour un créneau (slotKey « AAAA-MM-JJ-s ») ou, à défaut, pour aujourd'hui :
// - candidats : les recettes, plus les plats déjà mangés saisis sans recette ;
// - exclus : les plats déjà prévus la même semaine, hors saison ;
// - l'écart en jours avec le repas le plus proche (passé ou prévu) du même plat décide :
//   d'abord le type d'habitude du créneau, puis les plats pas mangés à moins d'un mois, puis les plus anciens.
function suggest(S,today,n,exclude,rnd,slotKey){
  const ref=slotKey?slotKey.slice(0,10):today,mon=mondayOf(ref),sun=addDays(mon,6),month=+ref.slice(5,7);
  rnd=rnd||(slotKey?seeded(slotKey):Math.random);
  const key=s=>plain(s).trim(),dates={};
  for(const [k,m] of Object.entries(S.meals||{})){
    if(m.deleted||!m.text||k===slotKey)continue;
    (dates[key(m.text)]=dates[key(m.text)]||[]).push(k.slice(0,10));
  }
  const names=new Map();
  for(const r of Object.values(S.recipes||{}))if(!r.deleted&&r.name)names.set(key(r.name),{name:r.name,season:recipeSeason(r)});
  for(const [k,m] of Object.entries(S.meals||{}))if(!m.deleted&&m.text&&!names.has(key(m.text)))
    names.set(key(m.text),{name:m.text,season:guessSeason(m.text)});
  const ex=new Set((exclude||[]).map(key)),t0=Date.parse(ref),todayT=Date.parse(today);
  const rows=[];
  for(const [k,x] of names){
    if(ex.has(k)||!inSeason(x.season,month))continue;
    const ds=dates[k]||[];
    if(ds.some(d=>d>=mon&&d<=sun))continue; // déjà prévu (ou mangé) cette semaine-là
    const gap=ds.length?Math.min(...ds.map(d=>Math.abs(Date.parse(d)-t0)/DAY)):null;
    const past=ds.filter(d=>d<today).sort().pop();
    rows.push({name:x.name,gap,days:past?Math.round((todayT-Date.parse(past))/DAY):null,score:Math.min(gap==null?400:gap,400)+rnd()*20});
  }
  const hs=slotKey?habitsFor(S,slotKey):[],types=hs.filter(h=>!h.recipe).map(h=>h.type);
  const tag=x=>{const h=hs.find(h=>habitMatches(S,h,x.name));return h?(h.recipe?"recette":h.type):null};
  // recette d'habitude en tête, puis les plats du type d'habitude
  const habit=rows.filter(x=>tag(x)).sort((a,b)=>(tag(b)==="recette")-(tag(a)==="recette")||b.score-a.score).map(x=>({...x,habit:tag(x)}));
  // aucun plat connu pour une habitude de type : on propose le type lui-même (« Pâtes », « Soupe »…)
  for(const t of types)if(!habit.some(x=>x.habit===t)){
    const dish=(TYPES.find(y=>y.id===t)||{}).dish,dk=key(dish||"");
    if(dish&&!ex.has(dk)&&!(dates[dk]||[]).some(d=>d>=mon&&d<=sun))habit.push({name:dish,days:null,habit:t});
  }
  const rest=rows.filter(x=>!tag(x));
  const fresh=rest.filter(x=>x.gap==null||x.gap>30).sort((a,b)=>b.score-a.score);
  const recent=rest.filter(x=>x.gap!=null&&x.gap<=30).sort((a,b)=>b.score-a.score);
  return [...habit,...fresh,...recent].slice(0,n).map(({name,days,habit})=>({name,days,habit:habit||null}));
}

// On ne garde que des champs attendus, aux types attendus.
function clean(k,id,r){
  if(!okId(id)||!r||typeof r!=="object")return null;
  const ts=Number.isFinite(r.ts)?r.ts:0,deleted=r.deleted===true;
  const R=root.Rayons;
  if(k==="lists")return{id,name:str(r.name,60)||id,
    order:(Array.isArray(r.order)?r.order:[]).filter(x=>R&&R.byId[x]).slice(0,30),ts,deleted};
  if(k==="items")return okId(r.list)?{id,list:r.list,text:str(r.text,200),done:r.done===true,archived:r.archived===true,
    c:Number.isFinite(r.c)?r.c:ts,ts,deleted}:null;
  if(k==="meals"){
    const ad=r.added&&typeof r.added==="object"&&Array.isArray(r.added.items)?{n:int(r.added.n,1,30,4),
      items:r.added.items.slice(0,80).map(g=>({t:str(g&&g.t,200),store:okId(g&&g.store)?g.store:"auchan"})),
      ids:(Array.isArray(r.added.ids)?r.added.ids:[]).filter(okId).slice(0,120),b:int(r.added.b,1,30,4)}:null;
    return{key:id,text:str(r.text,120),servings:int(r.servings,1,30,4),added:ad,for:str(r.for,30)||null,ts,deleted};
  }
  if(k==="stores")return{id,last:(Array.isArray(r.last)?r.last:[]).filter(okId).slice(-3),def:okId(r.def)?r.def:null,ts,deleted};
  if(k==="habits")return (TYPE_IDS.includes(r.type)||okId(r.recipe))&&(r.slot==="m"||r.slot==="s")?{id,
    type:TYPE_IDS.includes(r.type)?r.type:null,recipe:okId(r.recipe)?r.recipe:null,slot:r.slot,
    days:[...new Set((Array.isArray(r.days)?r.days:[]).map(x=>parseInt(x,10)).filter(x=>x>=1&&x<=7))].sort().slice(0,7),
    state:r.state==="off"?"off":"on",auto:r.auto===true,
    last:/^\d{4}-\d{2}-\d{2}$/.test(r.last)?r.last:null,since:/^\d{4}-\d{2}-\d{2}$/.test(r.since)?r.since:null,
    adj:/^\d{4}-\d{2}-\d{2}$/.test(r.adj)?r.adj:null,ts,deleted}:null;
  if(k==="foods"){const q=Math.max(0.25,Math.min(2000,+r.q||0))||null;
    if(FOODS.some(f=>f.id===id))return{id,q,ts,deleted};
    const label=str(r.label,40);if(!label||!(FOOD_CATS.includes(r.cat)||r.cat==="wait"))return null; // « wait » : à classer
    return{id,label,cat:r.cat,kind:r.kind==="n"?"n":"g",q,store:okId(r.store)?r.store:"auchan",icon:str(r.icon,8)||null,ts,deleted}}
  if(k==="aisles")return R&&R.byId[r.rayon]?{id,rayon:r.rayon,ts,deleted}:null;
  if(k==="recipes")return{id,name:str(r.name,120),serves:int(r.serves,1,30,4),season:SEASONS.includes(r.season)?r.season:null,
    ingredients:(Array.isArray(r.ingredients)?r.ingredients:[]).slice(0,80).map(i=>({t:str(i&&i.t,200),store:okId(i&&i.store)?i.store:"auchan"})),ts,deleted};
  return null;
}
function cleanAll(src){
  const out={};for(const k of KINDS)out[k]={};
  for(const k of KINDS)if(src&&src[k]&&typeof src[k]==="object")
    for(const [id,r] of Object.entries(src[k])){const c=clean(k,id,r);if(c)out[k][id]=c}
  return out;
}
// Fusion enregistrement par enregistrement : le plus récent (ts) gagne. Renvoie true si quelque chose a changé.
function mergeInto(S,remote){
  const r=cleanAll(remote);let changed=false;
  for(const k of KINDS){S[k]=S[k]||{};for(const [id,x] of Object.entries(r[k]))if(!S[k][id]||x.ts>S[k][id].ts){S[k][id]=x;changed=true}}
  return changed;
}
// Synchro par différences : ne garder que les enregistrements modifiés (pending = {type: {id: 1}}).
function pick(S,pending){
  const out={};
  for(const k of KINDS)for(const id of Object.keys((pending||{})[k]||{}))if(S[k]&&S[k][id])(out[k]=out[k]||{})[id]=S[k][id];
  return out;
}
// Purge : supprimés depuis plus de 60 jours, repas de plus de 6 mois (même règle côté Supabase).
function prune(S,now){
  let n=0;
  for(const k of KINDS)for(const [id,x] of Object.entries(S[k]||{}))
    if(x.deleted&&now-x.ts>TOMBSTONE_TTL){delete S[k][id];n++}
  for(const id of Object.keys(S.meals||{})){const d=Date.parse(id.slice(0,10));if(d&&now-d>MEAL_TTL){delete S.meals[id];n++}}
  return n;
}
root.Data={KINDS,okId,str,clean,cleanAll,mergeInto,prune,guessSeason,recipeSeason,inSeason,suggest,SEASONS,
  TYPES,typeOf,companionFor,FOODS,FOOD_CATS,CAT_ICON,emojiFor,unknownFoods,allFoods,setCustom,foodFor,foodLine,suite,suiteTags,isSecond,habitsFor,habitMatches,habitTypesFor,learnHabits,weekday,addDays,mondayOf,pick,TOMBSTONE_TTL,MEAL_TTL};
})(typeof window!=="undefined"?window:globalThis);
