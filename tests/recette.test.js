// Fonction Supabase « recette » testée dans Node, sans réseau (pages et base simulées).
const test = require("node:test");
const assert = require("node:assert/strict");

const sample = { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, {
  "@type": "Recipe", name: "Dip de thon : la meilleure recette", recipeYield: "4 personnes", prepTime: "PT10M",
  recipeCategory: "Amuse-gueule", recipeIngredient: ["150 g de thon", "120 g de fromage frais"],
  recipeInstructions: [{ "@type": "HowToSection", name: "Le dip", itemListElement: [{ "@type": "HowToStep", text: "Mixer le thon." }, { "@type": "HowToStep", text: "Ajouter le fromage." }] }],
}] };
const calls = [];
globalThis.Deno = { serve: (h) => { globalThis.__recette = h; }, env: { get: (k) => ({ SUPABASE_URL: "https://base.test", SUPABASE_ANON_KEY: "cle-publique" })[k] } };
globalThis.fetch = async (u, o = {}) => {
  u = String(u); calls.push(u);
  if (u === "https://base.test/rest/v1/rpc/get_household_since") return new Response(JSON.parse(o.body).p_code === "bon-code-du-foyer" ? '{"_now":1}' : "null", { status: 200 });
  if (u === "https://www.marmiton.org/recettes/recette_dip-de-thon_540044.aspx") return new Response(`<html><script type="application/ld+json">${JSON.stringify(sample)}</script></html>`, { status: 200 });
  if (u === "https://www.marmiton.org/recettes/recette_redirige_1.aspx") return new Response("", { status: 301, headers: { location: "https://pirate.example/x" } });
  throw new Error("réseau interdit dans le test : " + u);
};
const call = (body) => globalThis.__recette(new Request("https://fn.test/recette", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

test("fonction recette : lit la fiche d'une recette Marmiton avec le bon code", async () => {
  await import("../supabase/functions/recette/index.ts");
  const r = await call({ url: "https://www.marmiton.org/recettes/recette_dip-de-thon_540044.aspx?utm=x", code: "bon-code-du-foyer" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://hachtiaix.github.io");
  const j = await r.json();
  assert.equal(j.name, "Dip de thon : la meilleure recette");
  assert.deepEqual(j.ingredients, ["150 g de thon", "120 g de fromage frais"]);
  assert.deepEqual(j.steps, [{ s: "Le dip", t: "Mixer le thon." }, { s: "Le dip", t: "Ajouter le fromage." }]);
  assert.equal(j.url, "https://www.marmiton.org/recettes/recette_dip-de-thon_540044.aspx");
});
test("fonction recette : refuse un mauvais code, un autre site et une redirection ailleurs", async () => {
  assert.equal((await call({ url: "https://www.marmiton.org/recettes/recette_dip-de-thon_540044.aspx", code: "mauvais-code-123" })).status, 403);
  assert.equal((await call({ url: "https://pirate.example/recettes/x.aspx", code: "bon-code-du-foyer" })).status, 400);
  assert.equal((await call({ url: "http://www.marmiton.org/recettes/x.aspx", code: "bon-code-du-foyer" })).status, 400);
  const r = await call({ url: "https://www.marmiton.org/recettes/recette_redirige_1.aspx", code: "bon-code-du-foyer" });
  assert.equal(r.status, 502);
  assert.ok(!calls.includes("https://pirate.example/x"));
});
