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

// Situation réelle du 11/10/2026 : 7 recettes, 5 déjà prévues dans la semaine du 12 au 16, 2 plats sans recette.
const real = () => Data.cleanAll({
  recipes: rec(["Chili con Carne", "Purée de patate douce", "Rougaï de saucisses", "Pommes de terres vache qui rit",
    "Saucisses Lentilles", "Risotto Champignons Chorizo", "Pain de hachis"]),
  meals: {
    "2026-10-12-s": { text: "Pates", ts: 1 }, "2026-10-13-s": { text: "Saucisses Lentilles", ts: 1 },
    "2026-10-14-s": { text: "Pommes de terres vache qui rit", ts: 1 }, "2026-10-15-m": { text: "Lasagnes", ts: 1 },
    "2026-10-15-s": { text: "Purée de patate douce", ts: 1 }, "2026-10-16-s": { text: "Risotto Champignons Chorizo", ts: 1 },
    "2026-10-05-s": { text: "Pates", ts: 1 }, // plat sans recette déjà mangé
  },
});
test("semaine prochaine : les plats prévus cette semaine redeviennent possibles", () => {
  const got = Data.suggest(real(), "2026-10-11", 20, [], noRandom, "2026-10-21-s").map(x => x.name);
  assert.ok(got.length >= 8, `seulement ${got.length} : ${got}`);
  assert.ok(got.includes("Saucisses Lentilles"));
  // les plats jamais prévus passent avant ceux de la semaine précédente
  assert.ok(got.indexOf("Chili con Carne") < got.indexOf("Saucisses Lentilles"));
});
test("même semaine : un plat déjà prévu n'est pas reproposé", () => {
  const got = Data.suggest(real(), "2026-10-11", 20, [], noRandom, "2026-10-17-s").map(x => x.name);
  assert.ok(!got.includes("Saucisses Lentilles") && !got.includes("Risotto Champignons Chorizo"));
  assert.ok(got.includes("Chili con Carne"));
});
test("les plats saisis sans recette sont aussi suggérés", () => {
  const got = Data.suggest(real(), "2026-10-11", 20, [], noRandom, "2026-10-27-s").map(x => x.name);
  assert.ok(got.includes("Pates"));
});
test("deux créneaux n'ont pas forcément le même ordre de suggestions", () => {
  const S = real(), a = Data.suggest(S, "2026-10-11", 5, [], undefined, "2026-10-17-s").map(x => x.name).join(),
    b = Data.suggest(S, "2026-10-11", 5, [], undefined, "2026-10-18-s").map(x => x.name).join(),
    a2 = Data.suggest(S, "2026-10-11", 5, [], undefined, "2026-10-17-s").map(x => x.name).join();
  assert.equal(a, a2);   // stable pour un même créneau
  assert.notEqual(a, b); // différent d'un créneau à l'autre
});

test("habitude sans recette correspondante : plat déjà saisi de ce type, sinon le type lui-même", () => {
  const S = real();
  S.habits = Data.cleanAll({ habits: { p: { type: "pates", days: [1], slot: "s" }, s: { type: "soupe", days: [7], slot: "s" } } }).habits;
  const lundi = Data.suggest(S, "2026-10-11", 3, [], noRandom, "2026-10-19-s");
  assert.equal(lundi[0].name, "Pates"); assert.equal(lundi[0].habit, "pates");   // « Pates » saisi le 12/10, sans recette
  const dimanche = Data.suggest(S, "2026-10-11", 3, [], noRandom, "2026-10-25-s");
  assert.equal(dimanche[0].name, "Soupe"); assert.equal(dimanche[0].habit, "soupe"); // aucune soupe connue
  const memeSemaine = Data.suggest(S, "2026-10-11", 3, [], noRandom, "2026-10-17-s");
  assert.ok(!memeSemaine.some(x => x.habit)); // samedi : pas d'habitude ce jour-là
});

test("plats faits uniquement d'ingrédients « Autres » (gâteaux) : jamais suggérés", () => {
  const S = Data.cleanAll({
    foods: { g: { id: "c-g", label: "Gâteaux", cat: "autre", kind: "n", q: 1 } },
    meals: { "2026-09-01-s": { key: "2026-09-01-s", text: "Gâteaux", servings: 4 }, "2026-09-02-s": { key: "2026-09-02-s", text: "Poulet, riz", servings: 4 } },
  });
  Data.setCustom(S);
  const names = Data.suggest(S, "2026-10-12", 10, [], () => 0.5).map((x) => x.name);
  assert.ok(!names.includes("Gâteaux"));
  assert.ok(names.includes("Poulet, riz"));
  Data.setCustom({ foods: {} });
});

test("desserts (recette de type Dessert, gâteau…) : jamais suggérés, sauf si la recette est marquée Plat", () => {
  const S = Data.cleanAll({
    recipes: {
      a: { id: "a", name: "Gâteau au yaourt", serves: 6, ingredients: [] },
      b: { id: "b", name: "Tarte maison", serves: 6, ingredients: [], dessert: true },
      c: { id: "c", name: "Crêpes", serves: 4, ingredients: [] },
      d: { id: "d", name: "Cake salé", serves: 4, ingredients: [], dessert: false },
    },
    meals: { "2026-09-01-s": { key: "2026-09-01-s", text: "Brownies", servings: 4 } },
  });
  const names = Data.suggest(S, "2026-10-12", 20, [], () => 0.5).map((x) => x.name);
  for (const n of ["Gâteau au yaourt", "Tarte maison", "Brownies"]) assert.ok(!names.includes(n), n);
  for (const n of ["Crêpes", "Cake salé"]) assert.ok(names.includes(n), n);
});

test("une recette mangée dans un repas composé (« Courgettes farcies, Orzo ») compte comme déjà faite", () => {
  const S = Data.cleanAll({
    recipes: { c: { id: "c", name: "Courgettes farcies", serves: 4, ingredients: [] } },
    meals: { "2026-10-12-m": { key: "2026-10-12-m", text: "Courgettes farcies, Orzo", servings: 4 } },
  });
  const s = Data.suggest(S, "2026-10-19", 20, [], () => 0.5);
  const r = s.find((x) => x.name === "Courgettes farcies, Orzo");
  assert.equal(r.days, 7);
});

test("dessert deviné, sauf nom salé (crumble de légumes, cake au chèvre)", () => {
  for (const n of ["Crumble aux pommes", "Gâteau au yaourt", "Tarte tatin"]) assert.ok(Data.guessDessert(n), n);
  for (const n of ["Crumble aux légumes d'été & chèvre frais", "Cake au jambon et olives", "Crumble de courgettes"]) assert.ok(!Data.guessDessert(n), n);
});

test("recette proposée avec ce qu'on a déjà mis avec elle dans un repas", () => {
  const S = Data.cleanAll({
    recipes: {
      b: { id: "b", name: "Boulettes de porc", serves: 4, ingredients: [] },
      c: { id: "c", name: "Courgettes farcies", serves: 4, ingredients: [] },
      p: { id: "p", name: "Poulet basquaise", serves: 4, ingredients: [] },
    },
    meals: { "2026-08-10-m": { key: "2026-08-10-m", text: "Courgettes farcies, Orzo", servings: 4 },
             "2026-08-11-s": { key: "2026-08-11-s", text: "Pâtes, Boulettes de porc", servings: 4 } },
  });
  const names = Data.suggest(S, "2026-10-12", 20, [], () => 0.5).map((x) => x.name);
  assert.ok(names.includes("Pâtes, Boulettes de porc"));
  assert.ok(names.includes("Courgettes farcies, Orzo"));
  assert.ok(!names.includes("Courgettes farcies"));
  assert.equal(names.filter((n) => n === "Courgettes farcies, Orzo").length, 1);
  assert.ok(names.includes("Poulet basquaise"));
});

test("plusieurs accompagnements déjà faits avec une recette : un au hasard", () => {
  const S = Data.cleanAll({
    recipes: { c: { id: "c", name: "Courgettes farcies", serves: 4, ingredients: [] } },
    meals: { "2026-08-10-m": { key: "2026-08-10-m", text: "Courgettes farcies, Orzo", servings: 4 },
             "2026-06-10-m": { key: "2026-06-10-m", text: "Courgettes farcies, Riz", servings: 4 },
             "2026-07-10-m": { key: "2026-07-10-m", text: "Courgettes farcies, Semoule", servings: 4 } },
  });
  const got = new Set([0, 0.4, 0.7, 0.99].map((v) => Data.suggest(S, "2026-10-12", 20, [], () => v).find((x) => x.name.startsWith("Courgettes farcies, ")).name));
  assert.deepEqual([...got].sort(), ["Courgettes farcies, Orzo", "Courgettes farcies, Riz", "Courgettes farcies, Semoule"]);
});

test("saison « décembre seulement »", () => {
  assert.ok(Data.inSeason("dec", 12));
  for (const m of [1, 6, 11]) assert.ok(!Data.inSeason("dec", m));
  const S = Data.cleanAll({ recipes: { a: { id: "a", name: "Dinde aux marrons", serves: 6, ingredients: [], season: "dec" } } });
  assert.equal(S.recipes.a.season, "dec");
  assert.ok(Data.suggest(S, "2026-12-01", 10, [], () => 0.5).some((x) => x.name === "Dinde aux marrons"));
  assert.ok(!Data.suggest(S, "2026-11-01", 10, [], () => 0.5).some((x) => x.name === "Dinde aux marrons"));
});

test("associations ajoutées à la main (« Pâtes, Œufs ») : proposées, et rangées sous la recette quand il y en a une", () => {
  const S = Data.cleanAll({
    habits: { h: { type: "pates", days: [1], slot: "s", ts: 1 } },
    recipes: { b: { id: "b", name: "Boulettes de porc", serves: 4, ingredients: [] } },
    combos: { c1: { id: "c1", text: "Pâtes, Œufs" }, c2: { id: "c2", text: "Pâtes, Saucisses de Francfort" }, c3: { id: "c3", text: "Boulettes de porc, Riz" }, ko: { id: "ko", text: "Pâtes" } },
  });
  assert.deepEqual(Object.keys(S.combos).sort(), ["c1", "c2", "c3"]);
  const got = Data.suggest(S, "2026-12-10", 10, [], () => 0, "2026-12-14-s").map((x) => x.name);
  assert.ok(got.includes("Pâtes, Œufs"));
  assert.ok(got.includes("Pâtes, Saucisses de Francfort"));
  assert.ok(got.includes("Boulettes de porc, Riz"));
  assert.ok(!got.includes("Boulettes de porc"));
});

test("junk food (burgers, pizza, raclette…) : une fois toutes les 2 semaines au plus", () => {
  const S = Data.cleanAll({
    recipes: { p: { id: "p", name: "Pizza maison", serves: 4, ingredients: [] }, r: { id: "r", name: "Raclette", serves: 4, ingredients: [] }, q: { id: "q", name: "Poulet basquaise", serves: 4, ingredients: [] } },
    meals: { "2026-12-15-s": { key: "2026-12-15-s", text: "Burgers", servings: 4 } },
  });
  const week = Data.suggest(S, "2026-12-10", 10, [], () => 0.5, "2026-12-17-s").map((x) => x.name);
  assert.ok(!week.includes("Pizza maison") && !week.includes("Raclette") && week.includes("Poulet basquaise"));
  const wk2 = Data.suggest(S, "2026-12-10", 10, [], () => 0.5, "2026-12-27-s").map((x) => x.name); // 12 jours plus tard : encore trop tôt
  assert.ok(!wk2.includes("Pizza maison"));
  const wk3 = Data.suggest(S, "2026-12-10", 10, [], () => 0.5, "2026-12-30-s").map((x) => x.name); // 15 jours : possible
  assert.ok(wk3.includes("Pizza maison") || wk3.includes("Raclette"));
});
