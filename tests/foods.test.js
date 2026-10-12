const test = require("node:test");
const assert = require("node:assert/strict");
const { Data, Qty } = require("./load");
const S = Data.cleanAll({});
const buy = (t, n) => Qty.buy(t, n, 1);

test("suite d'aliments : viande rouge, haricots verts, PDT surgelés pour 3", () => {
  const r = Data.suite(S, "viande rouge, haricots verts, PDT surgelés");
  assert.deepEqual(r.ingredients.map(i => buy(i.t, 3)), ["450 g de viande rouge", "1 moyenne boîte + 1 petite boîte de haricots verts", "600 g de pommes de terre surgelées"]);
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
  assert.equal(buy(Data.suite(S, "steak haché, salade").ingredients[0].t, 3), "3 steaks hachés");
});

test("surgelés au féminin aussi (PDT surgelées)", () => {
  assert.equal(Qty.buy(Data.suite(S, "PDT surgelées").ingredients[0].t, 3, 1), "600 g de pommes de terre surgelées");
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

test("recette + aliments dans le même repas (« Carbonade flamande, Frites »)", () => {
  const S = Data.cleanAll({ recipes: { c: { id: "c", name: "Carbonade flamande", serves: 6, ingredients: [{ t: "1,2 kg de boeuf", store: "boucherie" }] } } });
  const r = Data.suite(S, "Carbonade flamande, Frites");
  assert.equal(r.serves, 6);
  assert.deepEqual(r.ingredients.map((i) => Qty.buy(i.t, 4 / 6, 6)), ["800 g de boeuf", "1 kg de pommes de terre (frites maison)"]);
  assert.deepEqual(Data.suiteTags(S, "Carbonade flamande, Frites").map((x) => x.cat), ["rcp", "fec"]);
});

test("aliments inconnus d'une suite (ni recettes ni déjà connus)", () => {
  const S = Data.cleanAll({ recipes: { c: { id: "c", name: "Carbonade", serves: 4, ingredients: [] } }, foods: { x: { id: "c-x", label: "Navets", cat: "autre", kind: "g", q: 100 } } });
  assert.deepEqual(Data.unknownFoods(S, "Saucisses, Asperges, Carbonade, Navets"), ["Asperges"]);
  assert.deepEqual(Data.unknownFoods(S, "Restes"), ["Restes"]);
});

test("ingrédients placard : épices, sel, huile… ; herbes fraîches seulement si séchées ; réglable par ingrédient", () => {
  const S = Data.cleanAll({});
  for (const t of ["moutarde", "paprika", "cumin", "sel", "huile d'olive", "basilic séché", "ras el hanout", "clou de girofle"]) assert.ok(Data.isPantry(S, t), t);
  for (const t of ["basilic", "persil", "poivrons", "salade", "poulet", "crème fraîche"]) assert.ok(!Data.isPantry(S, t), t);
  const k = Data.pantryKey("moutarde"), k2 = Data.pantryKey("crème fraîche");
  const S2 = Data.cleanAll({ stores: { [k]: { id: k, last: [], pantry: false }, [k2]: { id: k2, last: [], pantry: true } } });
  assert.ok(!Data.isPantry(S2, "moutarde"));
  assert.ok(Data.isPantry(S2, "crème fraîche"));
});
