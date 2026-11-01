// Quantités des articles : lecture, mise à l'échelle arrondie à ce qui s'achète, cumul et affichage.
// Une quantité lue : {n, kind, name}
//   kind "count"  : à l'unité (arrondi au supérieur)        ex. « 3 oignons »
//        "mass"   : n en grammes, affiché en kg dès 1000 g   ex. « 400 g de pâtes »
//        "vol"    : n en ml, affiché en cl ou l              ex. « 20 cl de crème »
//        "box"    : n en petites boîtes (moyenne = 2, grosse = 4)
//        "none"   : pas de quantité                          ex. « sel »
(function(){
const FRAC={"½":.5,"¼":.25,"¾":.75,"⅓":1/3,"⅔":2/3};
const BOX={petite:1,moyenne:2,grosse:4,grande:4};
const AIL=5; // gousses par tête (on préfère en avoir trop)
const NUM=/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔]?|[½¼¾⅓⅔])\s*/;
const MASS=/^(kg|kilos?|kilogrammes?|g|gr|grammes?)\.?(?=\s|$)/i;
const VOL=/^(ml|cl|dl|l|litres?|millilitres?|centilitres?)\.?(?=\s|$)/i;
const TRAIL=/^(.*?\D)\s*[:(,-]?\s*(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(kg|kilos?|g|gr|grammes?|ml|cl|dl|l|litres?|(?:petites?|moyennes?|grosses?|grandes?)\s+bo[iî]tes?|bo[iî]tes?|gousses?|t[eê]tes?)?\.?\s*\)?\s*$/i;
const BOXRE=/^(?:(petites?|moyennes?|grosses?|grandes?)\s+)?bo[iî]tes?(?:\s+(petites?|moyennes?|grosses?|grandes?))?(?=\s|$)/i;

function num(s){
  s=s.trim();
  if(FRAC[s])return FRAC[s];
  const f=s.match(/^(\d+(?:[.,]\d+)?)\s*([½¼¾⅓⅔])$/);if(f)return parseFloat(f[1].replace(",","."))+FRAC[f[2]];
  if(s.includes("/")){const p=s.split(/\s+/),fr=p.pop().split("/");return (p[0]?+p[0]:0)+fr[0]/fr[1]}
  return parseFloat(s.replace(",","."));
}
const stripDe=s=>s.trim().replace(/^(de\s+|des\s+|d['’]\s*)/i,"").trim();

// Synonymes : « cube de bouillon », « bouillon de légume », « cubes de bouillon volaille »…
// → un seul nom, pour cumuler les lignes (« bouillon de légumes » / « bouillon de volailles » / « bouillon de bœuf »).
const BOUILLON_SKIP=new Set(["cube","cubes","tablette","tablettes","de","d","en","au","aux","du","bouillon","bouillons"]);
const EGG_PREP=/^(cuits?|durs?|crus?|battus?|mollets?|poches?|entiers?|frais|extra|bio|plein|air|de|a|la|en|coque|brouilles?|au|plat|ecrases?|moyens?|gros|petits?|temperature|ambiante)$/;
function canon(name){const w=String(name||"").toLowerCase().replace(/œ/g,"oe").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z ]+/g," ").split(/\s+/).filter(Boolean);
  // Œufs : la préparation (cuits durs, cru, battus…) ne compte pas pour les courses → « œufs »
  if(/^oeufs?$/.test(w[0]||"")&&w.length>1&&w.slice(1).every(x=>EGG_PREP.test(x)))return /œ/i.test(name)?"œufs":"oeufs";
  if(!w.some(x=>/^bouillons?$/.test(x)))return name;
  const rest=w.filter(x=>!BOUILLON_SKIP.has(x));
  if(!rest.length)return name; // « cube de bouillon » seul : on laisse choisir (légumes, volailles, bœuf)
  if(rest.every(x=>/^legumes?$/.test(x)))return "bouillon de légumes";
  if(rest.every(x=>/^(volailles?|poulets?)$/.test(x)))return "bouillon de volailles";
  if(rest.every(x=>/^(boeufs?|bœufs?)$/.test(x)))return "bouillon de bœuf";
  return name}
function parse(text){const p=parse0(text);if(p.name)p.name=canon(p.name);return p}
function parse0(text){
  const t=String(text||"").trim();
  if(/\s\+\s/.test(t)){ // ancienne ligne combinée : on additionne les boîtes
    const parts=t.split(/\s\+\s/).map(x=>parse(x)),last=parts[parts.length-1];
    if(parts.every(x=>x.kind==="box"))return{n:parts.reduce((a,x)=>a+x.n,0),kind:"box",name:last.name};
  }
  const m=t.match(NUM);
  if(!m){ // quantité écrite après le nom : « poulet 1,6 kg », « oignons 2 », « tomates (1 boîte) »
    const tr=t.match(TRAIL);
    if(tr&&tr[1].trim()){const name=tr[1].trim(),unit=tr[3]||"";
      return parse(tr[2]+" "+(unit?unit+(/^[aeiouyhâàéèêëîïôûù]/i.test(name)?" d'":" de ")+name:name))}
    return{n:null,kind:"none",name:t};
  }
  const n=num(m[1]);let rest=t.slice(m[0].length),u;
  if(!(n>0))return{n:null,kind:"none",name:t};
  if((u=rest.match(MASS))){const k=/^k/i.test(u[1])?1000:1;return{n:n*k,kind:"mass",name:stripDe(rest.slice(u[0].length))}}
  if((u=rest.match(VOL))){const x=u[1].toLowerCase(),k=x.startsWith("ml")||x.startsWith("milli")?1:x.startsWith("cl")||x.startsWith("centi")?10:x==="dl"?100:1000;
    return{n:n*k,kind:"vol",name:stripDe(rest.slice(u[0].length))}}
  if((u=rest.match(BOXRE))){const size=(u[1]||u[2]||"").toLowerCase().replace(/s$/,"");const name=stripDe(rest.slice(u[0].length));
    return BOX[size]?{n:n*BOX[size],kind:"box",size,name}:{n,kind:"boxany",name}}
  // Ail : compté en gousses (1 tête = 5 gousses), acheté par tête.
  const ail=rest.match(/^(gousses?|t[eê]tes?)\s+d['’]\s*ail\b/i);
  if(ail){const pour=rest.match(/\(pour\s+(\d+)\s+gousses?\)/i);
    return{n:pour?+pour[1]:/^g/i.test(ail[1])?n:n*AIL,kind:"ail",name:"ail"}}
  return{n,kind:"count",name:rest.trim()};
}

const fr=x=>String(Math.round(x*100)/100).replace(".",",");
// « d' » devant une voyelle ou un h muet ; h aspiré (haricot, hachis, homard…) → « de »
const ASPIRE=/^h(aricot|achis|amburger|omard|ibou|arengs?|ors|aut)/i;
const de=name=>!name?"":(/^[aeiouyâàéèêëîïôûù]/i.test(name)||(/^h/i.test(name)&&!ASPIRE.test(name)))?" d'"+name:" de "+name;
// pluriel : -eau/-au/-eu → x (poireaux, gâteaux ; sauf bleus, pneus), chou → choux, chou-fleur → choux-fleurs
const plural=(w,n)=>{if(n<=1||/[sxz.]$/i.test(w))return w; // « c. à soupe » : abréviation inchangée
  if(/^chou-/i.test(w))return w.split("-").map(x=>plural(x,n)).join("-");
  if(/^chou$/i.test(w)||(/(eau|au|eu)$/i.test(w)&&!/^(bleu|pneu)$/i.test(w)))return w+"x";
  return w+"s"};
// « 1 gousses » → « 1 gousse » (sans toucher ananas, radis, jus…)
const single=w=>/^choux-/i.test(w)?w.split("-").map(single).join("-"):/^choux$/i.test(w)||/(eau|au|eu)x$/i.test(w)?w.slice(0,-1)
  :w.length>4&&/[^saiu]s$/i.test(w)?w.slice(0,-1):w;
// accorde le premier mot, et le suivant si le premier est un adjectif (« 1 grosse pomme de terre »)
const ADJ=/^(grosses?|petites?|moyennes?|grandes?|belles?|beaux?|bel|jeunes?|vieilles?|vieux|gros|petits?|grands?)$/i;
// adjectif après le nom, accordé aussi (« 3 boudins blancs », « 4 steaks hachés », « 2 cordons bleus »)
const POST=/^(mignons?|blancs?|blanches?|noirs?|noires?|rouges?|verts?|vertes?|bleus?|jaunes?|frais|fraîches?|entiers?|entières?|mûrs?|mûres?|cuits?|cuites?|crus?|crues?|secs?|sèches?|cerises?|[^\s]{2,}ée?s?)$/i; // …ée?s? : haché, râpée, pané, fumé, émincé…
const pluralFirst=(name,n)=>{if(/^ca[cs]\b/i.test(name))return name; // cac, cas : invariables
  const w=name.split(" "),f=x=>n>1?plural(x,n):single(x);
  w[0]=f(w[0]);if(w.length>1&&ADJ.test(w[0]))w[1]=f(w[1]);
  else if(w.length>1&&POST.test(w[1]))w[1]=n>1?plural(w[1],n):/^(frais|gros)$/i.test(w[1])?w[1]:w[1].replace(/s$/i,""); // adjectif : « 1 avocat mûr », « 1 cordon bleu »
  return w.join(" ")};

function format(p){
  if(p.n==null)return p.name;
  if(p.kind==="mass"){const g=p.n<100?Math.ceil(p.n):Math.ceil(p.n/10)*10;
    return (g>=1000?fr(g/1000)+" kg":g+" g")+de(p.name)}
  if(p.kind==="vol"){const ml=Math.ceil(p.n);
    return (ml>=1000?fr(ml/1000)+" l":ml%10===0?ml/10+" cl":ml+" ml")+de(p.name)}
  if(p.kind==="ail"){const g=Math.ceil(p.n-1e-9),t=Math.ceil(g/AIL);
    return t+" "+plural("tête",t)+" d'ail"+(g%AIL?" (pour "+g+" "+plural("gousse",g)+")":"")}
  if(p.kind==="box"&&p.size){const c=Math.max(1,Math.ceil(p.n/BOX[p.size]-1e-9));return c+" "+plural(p.size,c)+" "+plural("boîte",c)+de(p.name)}
  if(p.kind==="box"){let s=Math.ceil(p.n-1e-9);const parts=[];
    for(const [adj,k] of [["grosse",4],["moyenne",2],["petite",1]]){const c=Math.floor(s/k);s-=c*k;if(c)parts.push(c+" "+plural(adj,c)+" "+plural("boîte",c))}
    return parts.join(" + ")+de(p.name)}
  const c=Math.ceil(p.n-1e-9);
  if(p.kind==="boxany")return c+" "+plural("boîte",c)+de(p.name);
  return c+(p.name?" "+pluralFirst(p.name,c):"");
}

// Boîtes : total en petites boîtes → une ligne par taille (grosse, moyenne, petite).
function boxLines(p){let s=Math.ceil(p.n-1e-9);const out=[];
  for(const [size,k] of [["grosse",4],["moyenne",2],["petite",1]]){const c=Math.floor(s/k);s-=c*k;if(c)out.push({size,text:format({kind:"box",size,n:c*k,name:p.name})})}
  return out}
// Clé de cumul : même nature de quantité + même nom, sans casse, accents ni pluriel.
const norm=s=>s.toLowerCase().replace(/œ/g,"oe").replace(/æ/g,"ae").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9 ]+/g," ")
  .split(/\s+/).filter(Boolean).map(w=>w.length>3?w.replace(/[sx]$/,""):w).join(" ");
const key=p=>(p.kind==="none"?"count":p.kind)+"|"+norm(p.name);

// Quantité à acheter pour un facteur donné (arrondie).
// (les boîtes perdent leur taille : on regroupe au mieux, puis la liste les répartit par taille)
// Légumes en boîte sans quantité (haricots verts, petits pois, flageolets) : comptés en portions,
// 1 par personne de la recette (B) ; petite boîte = 1 pers., moyenne = 2, grande = 4.
const plain=s=>String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
const CANNED=/^(haricots? verts?|petits? pois|flageolets?)( en boites?)?$/;
const buy=(text,f,B)=>{const p=parse(text);
  if(p.n==null&&CANNED.test(plain(p.name)))return format({kind:"box",n:(B||1)*f,name:p.name});return p.n==null?p.name:format({...p,size:undefined,n:p.n*f})};
// Cumule b dans a (même clé) ; renvoie le texte ou null si pas cumulable.
function add(aText,bText){
  const a=parse(aText),b=parse(bText);
  if(key(a)!==key(b))return null;
  const n=x=>x.n==null?1:Math.ceil(x.n);
  return format({...a,kind:a.kind==="none"?"count":a.kind,n:n(a)+n(b)});
}
// Pas du − / + dans la liste.
function step(text,dir){
  const p=parse(text);
  if(p.n==null)return dir>0?format({kind:"count",n:2,name:p.name}):null; // « lait » = 1 implicite
  if(p.kind==="ail"){const t=Math.ceil(p.n/AIL)+dir;return t>=1?format({...p,n:t*AIL}):null}
  const s=p.kind==="mass"?(p.n<1000?50:100):p.kind==="vol"?(p.n<1000?50:250):p.kind==="box"&&p.size?BOX[p.size]:1;
  const n=Math.ceil(p.n)+dir*s;
  return n>=s||dir>0?format({...p,n:Math.max(n,s)}):null;
}
// Cuisine : la recette pour f fois plus de monde, sans arrondir à ce qui s'achète ; le reste du texte est gardé.
function nice(x,dec){if(x>=100)return String(Math.round(x/10)*10);if(x>=20)return String(Math.round(x/5)*5);if(x>=10)return String(Math.round(x));
  if(dec)return fr(Math.round(x*10)/10);
  const q=Math.max(1,Math.round(x*4)),w=Math.floor(q/4),r=["","¼","½","¾"][q%4];return w?(r?w+" "+r:String(w)):r}
// « cuillère(s) à café », « c. à c. », « càc » → « cac » ; à soupe → « cas » (invariables)
const spoon=t=>t.replace(/\b(?:cuill[eè]res?|cuil\.?|c\.?)\s*(?:à|a)\.?\s*(?:(caf[ée])|(soupe)|([cs]))(?![a-z])\.?/gi,(m,c,so,l)=>c||(l&&/c/i.test(l))?"cac":"cas");
function cook(text,f){const t=spoon(String(text||"").trim()).replace(/^(une?)\s+(?=\S)/i,"1 ");
  // cuillères seules : on compte tout en cac (1 cas = 3 cac) puis on regroupe → « 5 cas + 1 cac de sucre », « 1 ½ cac »
  {const ps=t.split(/\s*\+\s*|\s+et\s+(?=[\d½¼¾⅓⅔])/);let T=0,tail="",ok=true;
    for(const p of ps){const m=p.match(NUM),r=m&&p.slice(m[0].length).match(/^(ca[cs])\b(.*)$/i);
      if(!r||!(num(m[1])>0)){ok=false;break}T+=num(m[1])*(/s/i.test(r[1])?3:1);if(r[2].trim())tail=r[2]}
    if(ok){T=Math.round(T*f*4)/4||.25;const cas=Math.floor(T/3+1e-9),c=T-cas*3;
      return [cas?nice(cas)+" cas":"",c?nice(c)+" cac":""].filter(Boolean).join(" + ")+tail}}
  // plusieurs quantités sur une ligne : « 1 cas + 1 cac de sucre », « 1 cas et 2 cac »
  const parts=t.split(/(\s*\+\s*|\s+et\s+(?=[\d½¼¾⅓⅔]))/);if(parts.length>1)return parts.map((x,i)=>i%2?x:cook(x,f)).join("");
  const m=t.match(NUM);
  if(!m){const tr=t.match(/^(.*?\D)(\s*[:(,-]?\s*)(\d+(?:[.,]\d+)?)(\s*\S*\)?\s*)$/); // « poulet 1,6 kg »
    if(!tr||!tr[1].trim())return t;const n=parseFloat(tr[3].replace(",","."));
    return tr[1]+tr[2]+nice(n*f,/^\s*(kg|kilos?|l|litres?)\b/i.test(tr[4]))+tr[4]}
  const n=num(m[1]);if(!(n>0))return t;const rest=t.slice(m[0].length),x=n*f;
  if(MASS.test(rest)||VOL.test(rest))return nice(x,/^(kg|kilos?|l|litres?)\b/i.test(rest))+" "+rest;
  const r2=n<1&&x>=.5?rest.replace(/^(de\s+|d['’]\s*)/i,""):rest; // « ¼ de sachet » → « ½ sachet »
  return nice(x)+" "+(/^ca[cs]\b/i.test(r2)?r2:pluralFirst(r2,x<2?1:x))} // « 1 ½ oignon », « 2 petites boîtes »
// Étapes : on adapte les quantités avec une unité (g, cl, cac…) et celles d'un ingrédient de la recette
// (« 2 œufs », « 1 gousse de vanille ») ; durées, températures et autres nombres ne bougent pas.
const pl=w=>single(String(w||"").toLowerCase().replace(/œ/g,"oe").normalize("NFD").replace(/[\u0300-\u036f]/g,""));
function cookSteps(text,f,ings){const t=String(text||"");if(f===1)return t;
  const heads=new Set((ings||[]).map(i=>{const w=stripDe(String(parse(i).name||"")).split(/\s+/);return pl(ADJ.test(w[0])&&w[1]?w[1]:w[0])}).filter(x=>x.length>2&&!/^(des|les|une|aux|pour)$/.test(x)));
  return spoon(t).replace(/(^|[\s(«"'’])((?:une?(?=\s)|\d+(?:[.,]\d+)?(?:\s*[½¼¾⅓⅔])?|[½¼¾⅓⅔])\s*[^\s\d,.;:!?()\n][^,.;:!?()\n]*?)(?=\s+(?:et|puis|ou|pendant|dans|sur|avec)\s|[,.;:!?()\n]|$)/gi,(m,pre,q)=>{const q0=q;
    q=q.replace(/^une?\s+/i,"1 ");const n=q.match(NUM);if(!n)return m;const rest=q.slice(n[0].length),w=rest.split(/\s+/);
    if(/^(ou|à|a|-)\s*\d/i.test(rest))return m; // « 2 ou 3 gouttes » : on laisse
    const unit=MASS.test(rest)||VOL.test(rest)||/^(ca[cs]|pinc[ée]es?|sachets?|verres?|tranches?|bols?|tasses?|noix|noisettes?|gouttes?|brins?|feuilles?|morceaux?)\b/i.test(rest);
    const ing=w.slice(0,4).some(x=>heads.has(pl(x.replace(/^[dl]['’]/i,"")).replace(/[^a-z-]/g,"")));
    return unit||ing?pre+cook(q,f):m})}
window.Qty={parse,format,key,buy,add,step,boxLines,cook,cookSteps,agree:pluralFirst}; // agree : « ½ oignons rouges » → « oignon rouge »
})();
