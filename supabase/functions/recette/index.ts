// Fonction Supabase « recette » : lit une recette Marmiton ou CuisineAZ pour l'app Menus & Courses
// (l'iPhone ne peut pas lire ces sites directement depuis l'app). Garde-fous :
//  - seulement une page de recette de ces deux sites (aucune autre adresse, redirections comprises) ;
//  - seulement avec un code de foyer valide : ce n'est pas un relais ouvert à tous ;
//  - rien n'est enregistré ici : la recette est renvoyée à l'app, qui la montre avant de l'enregistrer.
// Ce qui est lu : les données « Recipe » (schema.org) que la page publie pour les moteurs de recherche.
// Écrit sans types TypeScript : testé aussi par Node (tests/recette.test.js).
const APP = "https://hachtiaix.github.io";
const SITE = /^https:\/\/(www\.)?(marmiton\.org|cuisineaz\.com)\//i;
const RECIPE = /^https:\/\/(www\.)?(marmiton\.org|cuisineaz\.com)\/recettes\/[\w\-.%]+\.aspx$/i;
const UA = "MenusCourses/1.0 (application familiale ; +https://github.com/hachtiaix/menus-courses)";
const headers = {
  "Access-Control-Allow-Origin": APP,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });

// la fiche « Recipe » de la page (dans un bloc JSON-LD, éventuellement dans un @graph ou une liste)
export function findRecipe(html) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let d;
    try { d = JSON.parse(m[1]); } catch { continue; }
    const stack = [d];
    while (stack.length) {
      const x = stack.pop();
      if (Array.isArray(x)) { stack.push(...x); continue; }
      if (!x || typeof x !== "object") continue;
      if (x["@graph"]) stack.push(...[].concat(x["@graph"]));
      if ([].concat(x["@type"] || []).includes("Recipe")) return x;
    }
  }
  return null;
}
const txt = (v, n) => (typeof v === "string" ? v : v && typeof v === "object" ? String(v.text || v.name || "") : "").slice(0, n);
// seulement ce dont l'app a besoin, en texte, avec des longueurs limitées
export function shape(x) {
  const steps = [];
  const walk = (v, sec) => {
    if (typeof v === "string") { steps.push({ s: sec, t: v.slice(0, 600) }); return; }
    if (Array.isArray(v)) { v.forEach((e) => walk(e, sec)); return; }
    if (!v || typeof v !== "object") return;
    if ([].concat(v["@type"] || []).includes("HowToSection")) { walk(v.itemListElement, txt(v.name, 120)); return; }
    if (v.itemListElement) { walk(v.itemListElement, sec); return; }
    steps.push({ s: sec, t: txt(v, 600) });
  };
  walk(x.recipeInstructions, "");
  return {
    name: txt(x.name, 200),
    yield: [].concat(x.recipeYield || []).map(String).slice(0, 4),
    prep: txt(x.prepTime, 20), cook: txt(x.cookTime, 20), total: txt(x.totalTime, 20),
    category: [].concat(x.recipeCategory || []).map(String).slice(0, 4),
    ingredients: [].concat(x.recipeIngredient || []).map((i) => txt(i, 300)).filter(Boolean).slice(0, 80),
    steps: steps.filter((p) => p.t).slice(0, 80),
  };
}
// code du foyer valide ? (même vérification que la synchro, sans rien lire des données)
async function householdOk(code, apikey) {
  if (typeof code !== "string" || code.length < 10 || code.length > 200) return false;
  const base = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_ANON_KEY") || apikey;
  const r = await fetch(`${base}/rest/v1/rpc/get_household_since`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code, p_since: 9e15 }),
  });
  return r.ok && (await r.json()) != null;
}
async function getPage(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr" }, redirect: "manual" });
    const to = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && to) {
      url = new URL(to, url).href;
      if (!SITE.test(url)) throw new Error("redirection vers un autre site");
      continue;
    }
    if (!r.ok) throw new Error("page " + r.status);
    return (await r.text()).slice(0, 4_000_000);
  }
  throw new Error("trop de redirections");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "POST seulement" }, 405);
  let body;
  try { body = await req.json(); } catch { return reply({ error: "Requête illisible" }, 400); }
  const url = String(body?.url || "").trim().replace(/[?#].*$/, "");
  if (!RECIPE.test(url)) return reply({ error: "Lien non pris en charge : une recette Marmiton ou CuisineAZ seulement." }, 400);
  if (!(await householdOk(body?.code, req.headers.get("apikey")))) return reply({ error: "Code du foyer inconnu." }, 403);
  try {
    const x = findRecipe(await getPage(url));
    if (!x) return reply({ error: "Pas de recette lisible sur cette page." }, 422);
    return reply({ ...shape(x), url });
  } catch (e) {
    return reply({ error: "Lecture impossible (" + (e?.message || "erreur") + ")." }, 502);
  }
});
