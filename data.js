// Données de l'app : nettoyage de ce qui arrive de l'extérieur, fusion et purge.
// Sans accès au DOM, pour pouvoir être testé (tests/data.test.js).
(function(root){
const KINDS=["lists","items","meals","recipes","aisles","stores","habits"];
const ID=/^[\w-]{1,64}$/, okId=id=>typeof id==="string"&&ID.test(id)&&id!=="__proto__";
const str=(v,n)=>typeof v==="string"?v.slice(0,n):"";
const int=(v,min,max,def)=>Math.max(min,Math.min(max,parseInt(v,10)||def));
const DAY=864e5;
const TOMBSTONE_TTL=60*DAY;  // éléments supprimés : oubliés après 60 jours
const MEAL_TTL=180*DAY;      // repas : gardés 6 mois

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
  {id:"pates",label:"Pâtes",icon:"🍝",words:["pate","spaghetti","tagliatelle","penne","fusilli","macaroni","coquillette","carbonara","bolognaise",
    "lasagne","ravioli","gnocchi","linguine","farfalle","tortellini","cannelloni","pesto"]},
  {id:"soupe",label:"Soupe",icon:"🍲",words:["soupe","veloute","potage","minestrone","gaspacho","gazpacho","bouillon","garbure"]},
  {id:"burger",label:"Burger / hot-dog",icon:"🍔",words:["burger","hamburger","cheeseburger","hot dog","hotdog"]},
  {id:"pizza",label:"Pizza",icon:"🍕",words:["pizza","calzone"]},
  {id:"salade",label:"Salade",icon:"🥗",words:["salade","taboule","poke"]},
  {id:"poisson",label:"Poisson",icon:"🐟",words:["poisson","saumon","cabillaud","colin","truite","dorade","merlu","lieu","sole","crevette","moule","fruits de mer"]},
  {id:"gratin",label:"Gratin",icon:"🧀",words:["gratin","parmentier","moussaka"]},
  {id:"quiche",label:"Quiche / tarte",icon:"🥧",words:["quiche","tarte","tourte","flammekueche"]},
  {id:"raclette",label:"Raclette / fondue",icon:"🫕",words:["raclette","fondue","tartiflette","croziflette","pierrade"]},
  {id:"riz",label:"Riz / curry",icon:"🍛",words:["riz","risotto","curry","paella","biryani","chili"]},
];
const TYPE_IDS=TYPES.map(t=>t.id);
function typeOf(name){
  const n=words(name);let best=null,at=Infinity;
  for(const t of TYPES)for(const w of t.words){const m=n.match(new RegExp(" "+w.replace(/ /g,"[sx]? ")+"[sx]? "));if(m&&m.index<at){at=m.index;best=t.id}}
  return best;
}
// Dates « AAAA-MM-JJ » : jour de la semaine 1 (lundi) … 7 (dimanche), décalage, lundi de la semaine.
const addDays=(ymd,n)=>new Date(Date.parse(ymd)+n*DAY).toISOString().slice(0,10);
const weekday=ymd=>((new Date(Date.parse(ymd)).getUTCDay()+6)%7)+1;
const mondayOf=ymd=>addDays(ymd,1-weekday(ymd));

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
// Habitude active jamais suivie alors que ses créneaux ont eu des repas au moins 6 semaines sur 8 → à oublier.
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
  const drop=[];
  for(const h of Object.values(S.habits||{})){
    if(h.deleted||h.state!=="on")continue;
    const W=union(...h.days.map(d=>get(cells,h.type+"|"+d+"|"+h.slot))),A=union(...h.days.map(d=>get(any,d+"|"+h.slot)));
    if(W.size===0&&A.size>=6)drop.push(h.id);
  }
  return{add,drop};
}

// Suggestions de plats : de saison, pas déjà prévus, pas cuisinés depuis plus de 30 jours
// (complété par les plus anciens s'il en manque). today = "AAAA-MM-JJ".
function suggest(S,today,n,exclude,rnd,slotKey){
  rnd=rnd||Math.random;
  const key=s=>plain(s).trim(),t0=Date.parse(today),month=+today.slice(5,7),last={},planned=new Set();
  for(const [k,m] of Object.entries(S.meals||{})){
    if(m.deleted||!m.text)continue;
    const d=k.slice(0,10);
    if(d>=today){planned.add(key(m.text));continue}
    const t=Date.parse(d);if(!last[key(m.text)]||t>last[key(m.text)])last[key(m.text)]=t;
  }
  const ex=new Set((exclude||[]).map(key));
  const rows=Object.values(S.recipes||{})
    .filter(r=>!r.deleted&&r.name&&!ex.has(key(r.name))&&!planned.has(key(r.name))&&inSeason(recipeSeason(r),month))
    .map(r=>{const l=last[key(r.name)],days=l?Math.round((t0-l)/DAY):null;return{name:r.name,days,score:Math.min(days==null?400:days,400)+rnd()*20}});
  const types=slotKey?habitTypesFor(S,slotKey):[];
  const habit=rows.filter(x=>types.includes(typeOf(x.name))).sort((a,b)=>b.score-a.score).map(x=>({...x,habit:typeOf(x.name)}));
  const rest=rows.filter(x=>!types.includes(typeOf(x.name)));
  const fresh=rest.filter(x=>x.days==null||x.days>30).sort((a,b)=>b.score-a.score);
  const recent=rest.filter(x=>x.days!=null&&x.days<=30).sort((a,b)=>b.days-a.days);
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
    return{key:id,text:str(r.text,120),servings:int(r.servings,1,30,4),added:ad,ts,deleted};
  }
  if(k==="stores")return{id,last:(Array.isArray(r.last)?r.last:[]).filter(okId).slice(-3),def:okId(r.def)?r.def:null,ts,deleted};
  if(k==="habits")return TYPE_IDS.includes(r.type)&&(r.slot==="m"||r.slot==="s")?{id,type:r.type,slot:r.slot,
    days:[...new Set((Array.isArray(r.days)?r.days:[]).map(x=>parseInt(x,10)).filter(x=>x>=1&&x<=7))].sort().slice(0,7),
    state:r.state==="off"?"off":"on",auto:r.auto===true,ts,deleted}:null;
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
// Purge : supprimés depuis plus de 60 jours, repas de plus de 6 mois (même règle côté Supabase).
function prune(S,now){
  let n=0;
  for(const k of KINDS)for(const [id,x] of Object.entries(S[k]||{}))
    if(x.deleted&&now-x.ts>TOMBSTONE_TTL){delete S[k][id];n++}
  for(const id of Object.keys(S.meals||{})){const d=Date.parse(id.slice(0,10));if(d&&now-d>MEAL_TTL){delete S.meals[id];n++}}
  return n;
}
root.Data={KINDS,okId,str,clean,cleanAll,mergeInto,prune,guessSeason,recipeSeason,inSeason,suggest,SEASONS,
  TYPES,typeOf,habitTypesFor,learnHabits,weekday,addDays,mondayOf,TOMBSTONE_TTL,MEAL_TTL};
})(typeof window!=="undefined"?window:globalThis);
