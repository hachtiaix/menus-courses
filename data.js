// Données de l'app : nettoyage de ce qui arrive de l'extérieur, fusion et purge.
// Sans accès au DOM, pour pouvoir être testé (tests/data.test.js).
(function(root){
const KINDS=["lists","items","meals","recipes","aisles","stores"];
const ID=/^[\w-]{1,64}$/, okId=id=>typeof id==="string"&&ID.test(id)&&id!=="__proto__";
const str=(v,n)=>typeof v==="string"?v.slice(0,n):"";
const int=(v,min,max,def)=>Math.max(min,Math.min(max,parseInt(v,10)||def));
const DAY=864e5;
const TOMBSTONE_TTL=60*DAY;  // éléments supprimés : oubliés après 60 jours
const MEAL_TTL=180*DAY;      // repas : gardés 6 mois

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
  if(k==="aisles")return R&&R.byId[r.rayon]?{id,rayon:r.rayon,ts,deleted}:null;
  if(k==="recipes")return{id,name:str(r.name,120),serves:int(r.serves,1,30,4),
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
root.Data={KINDS,okId,str,clean,cleanAll,mergeInto,prune,TOMBSTONE_TTL,MEAL_TTL};
})(typeof window!=="undefined"?window:globalThis);
