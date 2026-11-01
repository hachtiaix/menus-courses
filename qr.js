// QR code affiché pour transmettre le code du foyer à l'autre téléphone (lu par son appareil photo, dans l'app).
// Encodeur maison, sans bibliothèque : mode octets, correction M, versions 1 à 10 (norme ISO/IEC 18004,
// même découpage que la bibliothèque de Project Nayuki). Vérifié par tests/qr.test.js avec le lecteur jsQR.
(function(){
// corps de Galois GF(256) pour les codes correcteurs (Reed-Solomon)
const EXP=new Uint8Array(512),LOG=new Uint8Array(256);
{let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=0x11d}for(let i=255;i<512;i++)EXP[i]=EXP[i-255]}
const mul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0;
function rsGen(d){let g=[1];for(let i=0;i<d;i++){const n=new Array(g.length+1).fill(0);for(let j=0;j<g.length;j++){n[j]^=g[j];n[j+1]^=mul(g[j],EXP[i])}g=n}return g}
function rsRem(data,k){const g=rsGen(k),r=new Array(k).fill(0);for(const b of data){const f=b^r.shift();r.push(0);for(let i=0;i<k;i++)r[i]^=mul(g[i+1],f)}return r}
// correction M : octets de correction par bloc et nombre de blocs, versions 1 à 10
const ECC=[0,10,16,26,18,24,16,18,22,22,26],BLOCKS=[0,1,1,1,2,2,4,4,4,5,5];
const rawModules=v=>{let r=(16*v+128)*v+64;if(v>=2){const n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36}return r};
const dataCodewords=v=>Math.floor(rawModules(v)/8)-ECC[v]*BLOCKS[v];
function alignPos(v){if(v===1)return[];const n=Math.floor(v/7)+2,size=v*4+17,step=Math.ceil((v*4+4)/(n*2-2))*2,r=[6];
  for(let p=size-7;r.length<n;p-=step)r.splice(1,0,p);return r}
// texte → matrice de cases (true = noire)
function encode(text){
  const bytes=[...new TextEncoder().encode(String(text))];
  let v=1;while(v<=10&&4+(v<10?8:16)+bytes.length*8>dataCodewords(v)*8)v++;
  if(v>10)throw new Error("Texte trop long pour le QR code");
  const bits=[],put=(val,n)=>{for(let i=n-1;i>=0;i--)bits.push((val>>>i)&1)};
  put(4,4);put(bytes.length,v<10?8:16);bytes.forEach(b=>put(b,8));
  const cap=dataCodewords(v)*8;put(0,Math.min(4,cap-bits.length));while(bits.length%8)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8)data.push(parseInt(bits.slice(i,i+8).join(""),2));
  for(let p=0xEC;data.length<dataCodewords(v);p^=0xEC^0x11)data.push(p);
  // blocs + correction, puis entrelacement
  const nb=BLOCKS[v],ecl=ECC[v],raw=Math.floor(rawModules(v)/8),nShort=nb-raw%nb,shortLen=Math.floor(raw/nb),blocks=[];
  for(let i=0,k=0;i<nb;i++){const dat=data.slice(k,k+shortLen-ecl+(i<nShort?0:1));k+=dat.length;const ecc=rsRem(dat,ecl);if(i<nShort)dat.push(0);blocks.push(dat.concat(ecc))}
  const cw=[];for(let i=0;i<blocks[0].length;i++)blocks.forEach((b,j)=>{if(i!==shortLen-ecl||j>=nShort)cw.push(b[i])});
  // motifs fixes : synchronisation, repères des coins, alignement, format, version
  const size=v*4+17,M=[...Array(size)].map(()=>new Array(size).fill(false)),F=[...Array(size)].map(()=>new Array(size).fill(false));
  const set=(x,y,d)=>{M[y][x]=d;F[y][x]=true};
  for(let i=0;i<size;i++){set(6,i,i%2===0);set(i,6,i%2===0)}
  const finder=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy)),x=cx+dx,y=cy+dy;if(x>=0&&x<size&&y>=0&&y<size)set(x,y,d!==2&&d!==4)}};
  finder(3,3);finder(size-4,3);finder(3,size-4);
  const ap=alignPos(v),last=ap.length-1;
  ap.forEach((a,i)=>ap.forEach((b,j)=>{if(i===0&&j===0||i===0&&j===last||i===last&&j===0)return;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(a+dx,b+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)}));
  const fmt=mask=>{const d=mask;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537); // correction M = 00
    const b=((d<<10)|r)^0x5412,bit=i=>((b>>>i)&1)===1;
    for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));for(let i=9;i<15;i++)set(14-i,8,bit(i));
    for(let i=0;i<8;i++)set(size-1-i,8,bit(i));for(let i=8;i<15;i++)set(8,size-15+i,bit(i));set(8,size-8,true)};
  fmt(0);
  if(v>=7){let r=v;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const b=(v<<12)|r;
    for(let i=0;i<18;i++){const d=((b>>>i)&1)===1,a=size-11+i%3,c=Math.floor(i/3);set(a,c,d);set(c,a,d)}}
  // données en zigzag, deux colonnes à la fois, de bas en haut puis de haut en bas
  let i=0;for(let right=size-1;right>=1;right-=2){if(right===6)right=5;
    for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){const x=right-j,up=((right+1)&2)===0,y=up?size-1-vert:vert;
      if(!F[y][x]&&i<cw.length*8){M[y][x]=((cw[i>>>3]>>>(7-(i&7)))&1)===1;i++}}}
  // masque : celui qui donne le moins de pénalités (motifs gênants pour la lecture)
  const MASKS=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,
    (x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
  const apply=m=>{for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!F[y][x]&&MASKS[m](x,y))M[y][x]=!M[y][x]};
  const penalty=()=>{let p=0;
    const line=get=>{let run=1;for(let k=1;k<size;k++){if(get(k)===get(k-1)){run++;if(run===5)p+=3;else if(run>5)p++}else run=1}};
    for(let k=0;k<size;k++){line(x=>M[k][x]);line(y=>M[y][k])}
    for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){const c=M[y][x];if(c===M[y][x+1]&&c===M[y+1][x]&&c===M[y+1][x+1])p+=3}
    const pat=/(?=10111010000|00001011101)/g;
    for(let k=0;k<size;k++){p+=40*((M[k].map(b=>b?1:0).join("").match(pat)||[]).length+(M.map(row=>row[k]?1:0).join("").match(pat)||[]).length)}
    const dark=M.reduce((a,row)=>a+row.filter(Boolean).length,0);p+=10*Math.floor(Math.abs(dark*20-size*size*10)/(size*size));return p};
  let best=0,bestP=Infinity;for(let m=0;m<8;m++){apply(m);fmt(m);const p=penalty();if(p<bestP){bestP=p;best=m}apply(m)}
  apply(best);fmt(best);return M;
}
// dessin SVG : marge blanche de 4 cases, toujours noir sur blanc (même en mode sombre)
function svg(text,px){const M=encode(text),n=M.length+8;let d="";
  M.forEach((row,y)=>row.forEach((on,x)=>{if(on)d+=`M${x+4},${y+4}h1v1h-1z`}));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px||n*8}" height="${px||n*8}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`}
window.QR={encode,svg};
})();
