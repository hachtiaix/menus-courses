const test = require("node:test");
const assert = require("node:assert/strict");
const { Data } = require("./load");

const types = {
  "Spaghetti bolognaise": "pates", "Lasagnes": "pates", "Salade de pâtes": "salade", "Gratin de pâtes": "gratin",
  "Velouté de potiron": "soupe", "Hot dogs": "burger", "Burgers maison": "burger", "Soupe de poisson": "soupe",
  "Tartiflette": "raclette", "Pommes de terres vache qui rit": null,
};
for (const [n, t] of Object.entries(types)) test(`type : ${n} → ${t}`, () => assert.equal(Data.typeOf(n), t));

test("dates : jour de la semaine et lundi", () => {
  assert.equal(Data.weekday("2026-10-12"), 1); // lundi
  assert.equal(Data.weekday("2026-10-18"), 7); // dimanche
  assert.equal(Data.mondayOf("2026-10-18"), "2026-10-12");
});

// Historique de 8 semaines avant la semaine du 2026-12-07 (lundi) : semaines commençant le 12/10 … 30/11.
const weeks = [...Array(8)].map((_, i) => Data.addDays("2026-10-12", 7 * i));
const meals = {};
const put = (mon, wd, slot, text) => { meals[Data.addDays(mon, wd - 1) + "-" + slot] = { text, ts: 1 }; };
weeks.forEach((mon, i) => {
  put(mon, 1, "s", i % 3 === 2 ? "Quiche" : ["Carbonara", "Lasagnes", "Penne pesto"][i % 3]); // pâtes 6/8 le lundi
  put(mon, i % 2 ? 6 : 5, "s", "Burgers maison");                                                // burger vendredi OU samedi
  if (i < 2) put(mon, 3, "s", "Pizza");                                                            // pizza 2/8 : pas assez
});

test("apprentissage : pâtes le lundi soir, burger vendredi ou samedi soir, pas la pizza", () => {
  const S = Data.cleanAll({ meals });
  const { add } = Data.learnHabits(S, "2026-12-09");
  const sig = add.map(a => `${a.type}:${a.days.join("+")}:${a.slot}`).sort();
  assert.deepEqual(sig, ["burger:5+6:s", "pates:1:s"]);
});
test("oubli : seulement après 24 mois sans être suivie", () => {
  const S = Data.cleanAll({ habits: {
    vieille: { type: "soupe", days: [7], slot: "s", last: "2024-11-01", ts: 1 },  // suivie il y a 25 mois
    recente: { type: "pizza", days: [3], slot: "s", last: "2025-03-01", ts: 1 },  // il y a 21 mois
    nouvelle: { type: "salade", days: [2], slot: "s", since: "2026-12-01", ts: 1 },
    pates: { type: "pates", days: [1], slot: "s", ts: 1 },
  }, meals });
  const r = Data.learnHabits(S, "2026-12-09");
  assert.deepEqual(r.drop, ["vieille"]);
  assert.equal(r.seen.pates, "2026-11-30"); // dernier lundi soir de pâtes de l'historique
});
test("sans date connue, rien n'est oublié (l'app pose la date de création)", () => {
  const S = Data.cleanAll({ habits: { h1: { type: "soupe", days: [7], slot: "s", ts: 1 } } });
  assert.deepEqual(Data.learnHabits(S, "2026-12-09").drop, []);
});
test("habitude « vendredi ou samedi » : plus attendue le samedi si burger déjà prévu vendredi", () => {
  const S = Data.cleanAll({ habits: { h: { type: "burger", days: [5, 6], slot: "s", ts: 1 } }, meals: { "2026-12-11-s": { text: "Hot dogs", ts: 1 } } });
  assert.deepEqual(Data.habitTypesFor(S, "2026-12-12-s"), []);
  assert.deepEqual(Data.habitTypesFor(S, "2026-12-19-s"), ["burger"]); // semaine suivante
});
test("suggestion d'un créneau d'habitude : le type d'abord, en rotation même si fait récemment", () => {
  const S = Data.cleanAll({
    habits: { h: { type: "pates", days: [1], slot: "s", ts: 1 } },
    recipes: { a: { name: "Carbonara", ts: 1 }, b: { name: "Lasagnes", ts: 1 }, c: { name: "Quiche", ts: 1 } },
    meals: { "2026-12-07-s": { text: "Carbonara", ts: 1 }, "2026-11-30-s": { text: "Lasagnes", ts: 1 } },
  });
  const got = Data.suggest(S, "2026-12-10", 3, [], () => 0, "2026-12-14-s");
  assert.equal(got[0].name, "Lasagnes"); // la plus ancienne des pâtes
  assert.equal(got[0].habit, "pates");
  assert.equal(got[1].habit, "pates");
  assert.equal(got[2].name, "Quiche");
});
test("habitudes nettoyées (type, jours, créneau)", () => {
  const S = Data.cleanAll({ habits: { ok: { type: "pates", days: [1, "6", 9, 1], slot: "s" }, ko: { type: "inconnu", days: [1], slot: "s" } } });
  assert.deepEqual(Object.keys(S.habits), ["ok"]);
  assert.deepEqual(S.habits.ok.days, [1, 6]);
});

test("habitude sur une recette précise : proposée en premier sur son créneau", () => {
  const S = Data.cleanAll({
    recipes: { a: { name: "Pain de hachis", ts: 1 }, b: { name: "Chili", ts: 1 }, c: { name: "Quiche", ts: 1 } },
    habits: { h: { recipe: "a", days: [7], slot: "s", ts: 1 } },
  });
  const got = Data.suggest(S, "2026-12-10", 3, [], () => 0, "2026-12-13-s");
  assert.equal(got[0].name, "Pain de hachis"); assert.equal(got[0].habit, "recette");
  assert.equal(Data.suggest(S, "2026-12-10", 3, [], () => 0, "2026-12-12-s")[0].habit, null); // samedi : pas d'habitude
});
test("habitude sur une recette : nettoyée et gardée", () => {
  const S = Data.cleanAll({ habits: { h: { recipe: "r1", days: [7], slot: "s" }, ko: { days: [7], slot: "s" } } });
  assert.deepEqual(Object.keys(S.habits), ["h"]); assert.equal(S.habits.h.recipe, "r1"); assert.equal(S.habits.h.type, null);
});
