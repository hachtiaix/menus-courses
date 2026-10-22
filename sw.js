const V="v176",FILES=["./","index.html","style.css","qty.js","rayons.js","data.js","app.js","config.js","manifest.webmanifest","icon-180.png","icon-512.png","icons/auchan.svg","icons/lidl.svg","icons/ferme.svg","icons/saucisse.svg","icons/saumon-fume.svg","icons/truite-fumee.svg"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(FILES.map(f=>fetch(f,{cache:"reload"}).then(r=>c.put(f,r))))));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))));self.clients.claim()});
// Cache d'abord : l'app s'ouvre tout de suite, même avec un réseau faible (une page blanche venait d'une réponse qui n'arrivait jamais).
// En arrière-plan on vérifie s'il y a mieux ; une nouvelle version s'installe via sw.js (voir app.js).
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin||u.pathname.endsWith("/sw.js"))return; // sw.js : toujours le réseau (détection des nouvelles versions)
  const fresh=fetch(e.request,{cache:"no-cache"}).then(r=>{if(r.ok){const c=r.clone();caches.open(V).then(x=>x.put(e.request,c))}return r}).catch(()=>null);
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>hit||fresh.then(r=>r||Response.error())));
  e.waitUntil(fresh);
});
