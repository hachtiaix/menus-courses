const test = require("node:test");
const assert = require("node:assert/strict");
const { Qty } = require("./load");

const cases = [
  // [description, résultat, attendu]
  ["0,5 oignon arrondi au supérieur", Qty.buy("1 oignon", 0.5), "1 oignon"],
  ["pluriel", Qty.buy("1 oignon", 3), "3 oignons"],
  ["accord adjectif + nom", Qty.buy("4 grosses pommes de terre", 0.25), "1 grosse pomme de terre"],
  ["demi-boîte → 1 boîte", Qty.buy("1/2 boîte de tomates", 1), "1 boîte de tomates"],
  ["boîtes regroupées dans une recette", Qty.buy("1 grosse boîte de tomates", 1.5), "1 grosse boîte + 1 moyenne boîte de tomates"],
  ["2 petites = 1 moyenne", Qty.buy("1 petite boîte de maïs", 2), "1 moyenne boîte de maïs"],
  ["400 g × 3 → kg", Qty.buy("400 g de pâtes", 3), "1,2 kg de pâtes"],
  ["arrondi des grammes", Qty.buy("400 g de lardons", 2 / 3), "270 g de lardons"],
  ["20 cl × 6 → l", Qty.buy("20 cl de crème", 6), "1,2 l de crème"],
  ["d' devant voyelle", Qty.buy("100 g d'amandes", 2), "200 g d'amandes"],
  ["sans quantité", Qty.buy("sel", 3), "sel"],
  ["ail : gousses → têtes", Qty.buy("3 gousses d'ail", 2), "2 têtes d'ail (pour 6 gousses)"],
  ["ail : 5 gousses = 1 tête", Qty.buy("5 gousses d'ail", 1), "1 tête d'ail"],
  ["ananas reste ananas", Qty.buy("2 ananas", 0.5), "1 ananas"],
  ["cumul 1 + 3 oignons", Qty.add("1 oignon", "3 oignons"), "4 oignons"],
  ["cumul sans casse (garde l'écriture existante)", Qty.add("2 Oignons", "1 oignon"), "3 Oignons"],
  ["cumul g + kg", Qty.add("600 g de pâtes", "1 kg de pâtes"), "1,6 kg de pâtes"],
  ["cumul implicite (lait + lait)", Qty.add("lait", "lait"), "2 laits"],
  ["pas de cumul oignons/carottes", Qty.add("1 oignon", "2 carottes"), null],
  ["pas de cumul g / unités", Qty.add("200 g de tomates", "2 tomates"), null],
  ["+ sur 950 g → kg", Qty.step("950 g de farine", 1), "1 kg de farine"],
  ["− minimum à 1", Qty.step("1 oignon", -1), null],
  ["+ sur sans quantité", Qty.step("lait", 1), "2 laits"],
  ["+ sur une taille de boîte", Qty.step("1 grosse boîte de tomates", 1), "2 grosses boîtes de tomates"],
  ["+ sur l'ail = une tête", Qty.step("2 têtes d'ail (pour 7 gousses)", 1), "3 têtes d'ail"],
];
cases.push(
  ["boîte de légumes : 4 pers. → 1 grande", Qty.buy("haricots verts", 1, 4), "1 grosse boîte de haricots verts"],
  ["boîte de légumes : 3 pers. → 1 moyenne + 1 petite", Qty.buy("petits pois", 3, 1), "1 moyenne boîte + 1 petite boîte de petits pois"],
  ["boîte de légumes : 1 pers. → 1 petite", Qty.buy("flageolets", 1/4, 4), "1 petite boîte de flageolets"],
  ["surgelés : pas des boîtes", Qty.buy("haricots verts surgelés", 2, 4), "haricots verts surgelés"],
  ["h aspiré : haricots verts", Qty.buy("200 g de haricots verts", 3), "600 g de haricots verts"],
  ["h muet : huile", Qty.buy("10 cl d'huile", 2), "20 cl d'huile"],
  ["quantité après le nom : poulet 1,6 kg ×1,5", Qty.buy("poulet 1,6 kg", 1.5), "2,4 kg de poulet"],
  ["quantité après le nom : oignons 2 ×2", Qty.buy("oignons 2", 2), "4 oignons"],
  ["quantité après le nom entre parenthèses", Qty.buy("tomates (1 grosse boîte)", 1), "1 grosse boîte de tomates"],
  ["quantité après le nom : ail 2 gousses", Qty.buy("ail 2 gousses", 1), "1 tête d'ail (pour 2 gousses)"],
  ["quantité après le nom : crème 20 cl ×2", Qty.buy("crème fraîche 20 cl", 2), "40 cl de crème fraîche"],
  ["un chiffre dans le nom n'est pas une quantité", Qty.buy("pizza 4 fromages", 2), "pizza 4 fromages"],
  ["cumul poulet 1,6 kg + 400 g de poulet", Qty.add("poulet 1,6 kg", "400 g de poulet"), "2 kg de poulet"],
);
for (const [name, got, want] of cases) test(name, () => assert.equal(got, want));

test("boîtes : une ligne par taille", () => {
  assert.deepEqual(Qty.boxLines({ n: 6, name: "tomates" }).map(l => l.text),
    ["1 grosse boîte de tomates", "1 moyenne boîte de tomates"]);
});
test("ancienne ligne combinée relue", () => {
  const p = Qty.parse("1 grosse boîte + 1 petite boîte de tomates");
  assert.equal(p.kind, "box"); assert.equal(p.n, 5);
});

test("pluriels : -eau/-au → x, chou(x), chou-fleur, adjectifs après le nom", () => {
  const up = (t) => Qty.step(t, 1), down = (t) => Qty.step(Qty.step(t, 1), -1);
  assert.equal(up("1 poireau"), "2 poireaux");
  assert.equal(up("1 gâteau"), "2 gâteaux");
  assert.equal(up("1 chou-fleur"), "2 choux-fleurs");
  assert.equal(up("1 chou rouge"), "2 choux rouges");
  assert.equal(up("1 carotte râpée"), "2 carottes râpées");
  assert.equal(up("1 avocat mûr"), "2 avocats mûrs");
  assert.equal(down("1 cordon bleu"), "1 cordon bleu");
  assert.equal(down("1 poireau"), "1 poireau");
  assert.equal(up("1 poisson frais"), "2 poissons frais");
  assert.equal(up("1 noix de saint-jacques"), "2 noix de saint-jacques");
});
