const test = require("node:test");
const assert = require("node:assert/strict");
const { Data } = require("./load");

test("données piégées écartées ou neutralisées", () => {
  const S = Data.cleanAll({
    meals: { "2026-10-07-m": { text: "Plat", servings: "<img src=x onerror=alert(1)>", ts: 1 } },
    items: { '"><img>': { list: "auchan", text: "x", ts: 1 }, ok: { list: "auchan", text: "<b>t</b>", ts: 1 } },
    recipes: { __proto__: { name: "pollution" }, r1: { name: "R", ingredients: "pas un tableau", ts: 1 } },
  });
  assert.equal(S.meals["2026-10-07-m"].servings, 4);
  assert.deepEqual(Object.keys(S.items), ["ok"]);
  assert.equal(S.items.ok.text, "<b>t</b>"); // texte gardé tel quel, échappé à l'affichage
  assert.deepEqual(S.recipes.r1.ingredients, []);
  assert.equal(Object.getPrototypeOf(S.recipes), Object.prototype);
});
test("fusion : le plus récent gagne", () => {
  const S = Data.cleanAll({ items: { a: { list: "lidl", text: "1 oignon", ts: 10 } } });
  assert.equal(Data.mergeInto(S, { items: { a: { list: "lidl", text: "ancien", ts: 5 } } }), false);
  assert.equal(S.items.a.text, "1 oignon");
  assert.equal(Data.mergeInto(S, { items: { a: { list: "lidl", text: "2 oignons", ts: 20 } } }), true);
  assert.equal(S.items.a.text, "2 oignons");
});
test("purge : supprimés > 60 j et repas > 6 mois", () => {
  const now = Date.parse("2026-10-11"), day = 864e5;
  const S = Data.cleanAll({
    items: { vieux: { list: "lidl", text: "x", deleted: true, ts: now - 61 * day }, recent: { list: "lidl", text: "y", deleted: true, ts: now - 5 * day } },
    meals: { "2026-03-01-m": { text: "ancien", ts: 1 }, "2026-10-10-s": { text: "récent", ts: 1 } },
  });
  assert.equal(Data.prune(S, now), 2);
  assert.deepEqual(Object.keys(S.items), ["recent"]);
  assert.deepEqual(Object.keys(S.meals), ["2026-10-10-s"]);
});
test("ordre des rayons : seuls les rayons connus", () => {
  const S = Data.cleanAll({ lists: { lidl: { name: "Lidl", order: ["surgeles", "inconnu", "fruits"], ts: 1 } } });
  assert.deepEqual(S.lists.lidl.order, ["surgeles", "fruits"]);
});

test("synchro par différences : seuls les enregistrements modifiés partent", () => {
  const S = Data.cleanAll({ items: { a: { list: "lidl", text: "lait", ts: 1 }, b: { list: "lidl", text: "pain", ts: 1 } }, recipes: { r: { name: "Soupe", ts: 1 } } });
  assert.deepEqual(Data.pick(S, { items: { b: 1, disparu: 1 } }), { items: { b: S.items.b } });
  assert.deepEqual(Data.pick(S, {}), {});
});
test("champ technique _s (date serveur) ignoré à la lecture", () => {
  const S = Data.cleanAll({ items: { a: { list: "lidl", text: "lait", ts: 1, _s: 123 } } });
  assert.equal("_s" in S.items.a, false);
});
