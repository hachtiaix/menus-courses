const test = require("node:test");
const assert = require("node:assert/strict");
const { Data } = require("./load");

const seasons = {
  "Tartiflette": "hiver", "Raclette": "hiver", "Pot-au-feu": "hiver", "Soupe de légumes": "hiver",
  "Salades niçoises": "ete", "Taboulé": "ete", "Brochettes de poulet": "ete",
  "Pâtes carbonara": "all", "Gâteau au chocolat": "all", "Coq au vin": "all", "Pâtes sauce tomate": "all",
};
for (const [name, s] of Object.entries(seasons)) test(`saison : ${name} → ${s}`, () => assert.equal(Data.guessSeason(name), s));

test("été exclu de novembre à mars, hiver exclu de mai à septembre", () => {
  assert.equal(Data.inSeason("ete", 1), false); assert.equal(Data.inSeason("ete", 7), true); assert.equal(Data.inSeason("ete", 10), true);
  assert.equal(Data.inSeason("hiver", 7), false); assert.equal(Data.inSeason("hiver", 1), true); assert.equal(Data.inSeason("hiver", 4), true);
});

const rec = names => Object.fromEntries(names.map((n, i) => ["r" + i, { name: n, ingredients: [], ts: 1 }]));
const S0 = () => Data.cleanAll({
  recipes: rec(["Tartiflette", "Salade niçoise", "Carbonara", "Quiche", "Chili", "Lasagnes"]),
  meals: {
    "2026-12-20-s": { text: "Quiche", ts: 1 },      // il y a 10 jours : trop récent
    "2026-10-01-s": { text: "Chili", ts: 1 },       // il y a 3 mois : éligible
    "2027-01-03-m": { text: "Lasagnes", ts: 1 },    // déjà prévu : exclu
  },
});
const noRandom = () => 0;

test("hiver : pas de salade, pas de plat récent ni déjà prévu", () => {
  const got = Data.suggest(S0(), "2026-12-30", 10, [], noRandom).map(x => x.name);
  assert.ok(!got.includes("Salade niçoise"));
  assert.ok(!got.includes("Lasagnes"));
  assert.equal(got[got.length - 1], "Quiche"); // le récent ne vient qu'en dernier recours
  assert.ok(got.includes("Tartiflette") && got.includes("Carbonara") && got.includes("Chili"));
});
test("jamais cuisiné passe avant un plat d'il y a 3 mois", () => {
  const got = Data.suggest(S0(), "2026-12-30", 3, [], noRandom);
  assert.equal(got.find(x => x.name === "Chili").days, 90);
  assert.equal(got[0].days, null);
});
test("exclusion des plats déjà proposés (↻)", () => {
  const got = Data.suggest(S0(), "2026-12-30", 10, ["Tartiflette", "Carbonara"], noRandom).map(x => x.name);
  assert.ok(!got.includes("Tartiflette") && !got.includes("Carbonara"));
});
test("saison forcée dans la recette prioritaire sur la devinette", () => {
  const S = S0(); S.recipes.r1.season = "all"; // salade servie toute l'année
  assert.ok(Data.suggest(S, "2026-12-30", 10, [], noRandom).some(x => x.name === "Salade niçoise"));
});
