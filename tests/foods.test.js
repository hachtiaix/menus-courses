const test = require("node:test");
const assert = require("node:assert/strict");
const { Data, Qty } = require("./load");
const S = Data.cleanAll({});
const buy = (t, n) => Qty.buy(t, n, 1);

test("suite d'aliments : viande rouge, haricots verts, PDT surgelés pour 3", () => {
  const r = Data.suite(S, "viande rouge, haricots verts, PDT surgelés");
  assert.deepEqual(r.ingredients.map(i => buy(i.t, 3)), ["450 g de viande rouge", "1 moyenne boîte + 1 petite boîte de haricots verts", "600 g de PDT surgelés"]);
  assert.deepEqual(r.ingredients.map(i => i.store), ["boucherie", "auchan", "auchan"]);
});
test("soupe seule : légumes à choisir", () => {
  assert.deepEqual(Data.suite(S, "Soupe").ingredients.map(i => i.t), ["légumes pour soupe (à choisir)"]);
});
test("séparateurs + et « et », aliment inconnu gardé tel quel", () => {
  assert.deepEqual(Data.suite(S, "Poulet + riz et ratatouille").ingredients.map(i => buy(i.t, 2)), ["300 g de poulet", "160 g de riz", "ratatouille"]);
});
test("un nom simple qui n'est pas un aliment n'est pas une suite", () => {
  assert.equal(Data.suite(S, "Pommes de terres vache qui rit"), null);
  assert.equal(Data.suite(S, "Chili con carne"), null);
});
test("portion réglée par l'utilisateur", () => {
  const S2 = Data.cleanAll({ foods: { viande: { q: 200, ts: 1 } } });
  assert.equal(buy(Data.suite(S2, "viande rouge").ingredients[0].t, 2), "400 g de viande rouge");
});
test("salade : un quart par personne, arrondi au supérieur", () => {
  assert.equal(buy(Data.suite(S, "steak haché, salade").ingredients[1].t, 3), "1 salade");
  assert.equal(buy(Data.suite(S, "steak haché, salade").ingredients[0].t, 3), "3 steaks haché");
});

test("surgelés au féminin aussi (PDT surgelées)", () => {
  assert.equal(Qty.buy(Data.suite(S, "PDT surgelées").ingredients[0].t, 3, 1), "600 g de PDT surgelées");
});

test("image d'un ingrédient ajouté : d'après son nom, sinon famille", () => {
  assert.equal(Data.emojiFor("Bulots"), "🐚");
  assert.equal(Data.emojiFor("Pois chiches"), "🫘");
  assert.equal(Data.emojiFor("Haricots beurre"), "🫛");
  assert.equal(Data.emojiFor("Tartines"), null);
  const S = { foods: { "c-1": { id: "c-1", label: "Huîtres", cat: "pois", kind: "n", q: 6 }, "c-2": { id: "c-2", label: "Navets", cat: "leg", kind: "g", q: 100 } } };
  Data.setCustom(S);
  assert.equal(Data.foodFor("huitres").icon, "🦪");
  assert.equal(Data.foodFor("navets").icon, "🫜");
  Data.setCustom({ foods: {} });
});
