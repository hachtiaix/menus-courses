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

function parse(text){
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
const plural=(w,n)=>n>1&&!/[sxz]$/i.test(w)?w+"s":w;
// « 1 gousses » → « 1 gousse » (sans toucher ananas, radis, jus…)
const single=w=>w.length>4&&/[^saiu]s$/i.test(w)?w.slice(0,-1):w;
// accorde le premier mot, et le suivant si le premier est un adjectif (« 1 grosse pomme de terre »)
const ADJ=/^(grosses?|petites?|moyennes?|grandes?|belles?|beaux?|bel|jeunes?|vieilles?|vieux|gros|petits?|grands?)$/i;
const pluralFirst=(name,n)=>{const w=name.split(" "),f=x=>n>1?plural(x,n):single(x);
  w[0]=f(w[0]);if(w.length>1&&ADJ.test(w[0]))w[1]=f(w[1]);return w.join(" ")};

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
const norm=s=>s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9 ]+/g," ")
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
window.Qty={parse,format,key,buy,add,step,boxLines};
})();
