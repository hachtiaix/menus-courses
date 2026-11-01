const test = require("node:test");
const assert = require("node:assert/strict");
const { Data } = require("./load");

test("import : lignes d'ingrédients de CuisineAZ et Marmiton au format de l'app", () => {
  const t = Data.tidyIngredient;
  assert.equal(t("250 g Farine de blé"), "250 g de farine de blé");
  assert.equal(t("1 sachet(s) Levure chimique"), "1 sachet de levure chimique");
  assert.equal(t("1 pot(s) Yaourt(s) nature(s)"), "1 pot de yaourt nature");
  assert.equal(t("3 gousse(s) d&#39;ail"), "3 gousses d'ail");
  assert.equal(t("2 Oeuf(s)"), "2 oeufs");
  assert.equal(t("125 g Beurre doux"), "125 g de beurre doux");
  assert.equal(t("200 g Haricots verts"), "200 g de haricots verts");
  assert.equal(t("20 cl d&#39;huile d&#39;olive"), "20 cl d'huile d'olive");
  assert.equal(t("sel"), "sel");
  // lignes réelles relevées sur les deux sites
  assert.equal(t("2 gousse(s) Gousse(s) d&#39;ail"), "2 gousses d'ail");
  assert.equal(t("2 c. à soupe Huile végétale"), "2 c. à soupe d'huile végétale");
  assert.equal(t("4 pièces de tortillas grand format"), "4 tortillas grand format");
  assert.equal(t("0.5 pièces d&#39;oignons rouges"), "½ oignon rouge");
  assert.equal(t("1 paquets de jeunes pousses"), "1 paquet de jeunes pousses");
  assert.equal(t("1 cuillères à café de moutarde de Dijon"), "1 cuillère à café de moutarde de Dijon");
  assert.equal(t("1.5 kg de pommes de terre"), "1,5 kg de pommes de terre");
  assert.equal(t("1 avocats"), "1 avocat");
  assert.equal(t("1 ananas"), "1 ananas");
  // recette CuisineAZ « Sauté de dinde au Cookeo »
  assert.equal(t("2 Gousse Ail"), "2 gousses d'ail");
  assert.equal(t("5 Branches Persil"), "5 branches de persil");
  assert.equal(t("1 Filet(s) Huile"), "1 filet d'huile");
  assert.equal(t("1 bouquet(s) Garni"), "1 bouquet garni");
  assert.equal(t("750 g Dinde"), "750 g de dinde");
});

test("import : recette complète (nom raccourci, personnes, étapes numérotées, lien gardé)", () => {
  const url = "https://www.cuisineaz.com/recettes/poulet-roti-au-paprika-126100.aspx";
  const r = Data.fromSchema({
    name: "Poulet rôti au paprika et purée maison : le plat réconfortant", yield: ["4", "4 personnes"], prep: "PT20M",
    ingredients: ["1 Poulet", "1 kg Pommes de terre", "2 c. à s. Paprika"],
    steps: [{ s: "Le poulet", t: "Badigeonner le poulet." }, { s: "Le poulet", t: "Cuire 1 h &agrave; 200 °C." }, { s: "La purée", t: "Écraser les pommes de terre." }],
  }, url);
  assert.equal(r.name, "Poulet rôti au paprika et purée maison");
  assert.equal(r.serves, 4);
  assert.equal(r.prep, 20);
  assert.deepEqual(r.ingredients, ["1 poulet", "1 kg de pommes de terre", "2 c. à s. de paprika"]);
  assert.equal(r.steps, "# Le poulet\n1. Badigeonner le poulet.\n2. Cuire 1 h à 200 °C.\n# La purée\n1. Écraser les pommes de terre.");
  assert.equal(r.source, url);
  assert.equal(Data.fromSchema({ name: "Dip de thon : la meilleure recette", yield: "4 0" }, "https://evil.example/x").name, "Dip de thon");
  assert.equal(Data.fromSchema({ name: "x" }, "https://evil.example/recettes/a.aspx").source, null);
});

test("import : lien et temps gardés au nettoyage, liens d'autres sites refusés", () => {
  const ok = Data.clean("recipes", "r1", { name: "A", source: "https://www.marmiton.org/recettes/recette_dip-de-thon_540044.aspx", prep: 10, ingredients: [] });
  assert.equal(ok.source, "https://www.marmiton.org/recettes/recette_dip-de-thon_540044.aspx");
  assert.equal(ok.prep, 10);
  const bad = Data.clean("recipes", "r1", { name: "A", source: "javascript:alert(1)", prep: -3, ingredients: [] });
  assert.equal(bad.source, null);
  assert.equal(bad.prep, null);
});

test("propositions : période du samedi au vendredi (7 soirs + midis du week-end)", () => {
  assert.deepEqual(Data.planSlots("2026-11-04"), ["2026-11-07-m", "2026-11-07-s", "2026-11-08-m", "2026-11-08-s",
    "2026-11-09-s", "2026-11-10-s", "2026-11-11-s", "2026-11-12-s", "2026-11-13-s"]);
  assert.equal(Data.planSlots("2026-11-06")[0], "2026-11-07-m"); // vendredi → le lendemain
  assert.equal(Data.isoMinutes("PT1H30M"), 90);
});

test("placard : ail, cornichons, mayonnaise, ketchup ; à acheter : lait, crème, œufs, oignon, olives, câpres, jus de citron, concentré de tomate, pesto, harissa", () => {
  const S = { stores: {} }, home = n => Data.isPantry(S, n);
  for (const n of ["ail", "petite gousse d'ail", "huile d'olive", "mayonnaise", "ketchup", "cornichons", "sauce Worcestershire", "tabasco"])
    assert.ok(home(n), n);
  for (const n of ["lait demi-écrémé", "crème fraîche", "oeufs", "oignon rouge", "citron vert (pour le jus)", "poulet", "pommes de terre", "concentré de tomate", "pesto", "harissa", "olives vertes dénoyautées", "câpres", "jus de citron"])
    assert.ok(!home(n), n);
});

test("recette pour 1 ou 2 personnes : adaptée pour 3 ou 4 (quantités justes), étapes comprises, écriture gardée", () => {
  const a = Data.adaptServes(2, ["2 escalopes de veau", "1 oeuf", "50 g de chapelure", "1 cuillère à soupe d'huile", "sel"], "Battre 1 oeuf. Paner 2 escalopes.");
  assert.equal(a.serves, 4);
  assert.equal(a.from, 2);
  assert.deepEqual(a.ingredients, ["4 escalopes de veau", "2 oeufs", "100 g de chapelure", "2 cuillères à soupe d'huile", "sel"]);
  assert.equal(a.steps, "Battre 2 oeufs. Paner 4 escalopes.");
  assert.deepEqual(Data.adaptServes(4, ["400 g de pâtes"], "").ingredients, ["400 g de pâtes"]); // déjà pour 4 : rien ne change
  // pour 6 : 3 ou 4 selon les quantités les plus rondes
  const six = Data.adaptServes(6, ["6 escalopes", "2 oeufs", "600 g de pâtes"], "Cuire 600 g de pâtes.");
  assert.equal(six.serves, 3); // 3 escalopes, 1 œuf, 300 g (pour 4 : 1,33 œuf)
  assert.deepEqual(six.ingredients, ["3 escalopes", "1 oeuf", "300 g de pâtes"]);
  assert.equal(six.steps, "Cuire 300 g de pâtes.");
  const six4 = Data.adaptServes(6, ["6 escalopes", "3 oeufs", "600 g de pâtes", "3 cuillères à soupe d'huile"], "");
  assert.equal(six4.serves, 4); // 4 escalopes, 2 œufs, 400 g, 2 cuillères (pour 3 : 1 ½ œuf, 1 ½ cuillère)
  assert.deepEqual(six4.ingredients, ["4 escalopes", "2 oeufs", "400 g de pâtes", "2 cuillères à soupe d'huile"]);
  assert.equal(Data.adaptServes(6, ["300 g de riz"], "").serves, 3); // égalité : le nombre exact (6 → 3)
  assert.equal(Data.adaptServes(8, ["800 g de boeuf"], "").serves, 4);
  assert.deepEqual(Data.adaptServes(8, ["800 g de boeuf"], "").ingredients, ["400 g de boeuf"]);
  assert.equal(Data.adaptServes(3, ["3 oeufs"], "").from, null); // pour 3 : rien ne change
  assert.equal(Data.adaptServes(4, ["400 g de pâtes"], "").from, null);
  const r = Data.fromSchema({ name: "Pâtes", yield: "2 personnes", ingredients: ["250 g de spaghetti"], steps: [{ s: "", t: "Cuire 250 g de spaghetti." }] }, "");
  assert.equal(r.serves, 4); assert.equal(r.from, 2);
  assert.deepEqual(r.ingredients, ["500 g de spaghetti"]);
  assert.equal(r.steps, "1. Cuire 500 g de spaghetti.");
});

test("import : sel et poivre séparés", () => {
  const f = Data.splitSeasoning;
  assert.deepEqual(f(["Sel, poivre"]), ["sel", "poivre"]);
  assert.deepEqual(f(["sel et poivre du moulin"]), ["sel", "poivre du moulin"]);
  assert.deepEqual(f(["Huile d'olive, sel, poivre"]), ["huile d'olive", "sel", "poivre"]);
  assert.deepEqual(f(["Sel / Poivre"]), ["sel", "poivre"]);
  assert.deepEqual(f(["Sel poivre"]), ["sel", "poivre"]);
  assert.deepEqual(f(["200 g de poulet", "sel"]), ["200 g de poulet", "sel"]);
  assert.deepEqual(f(["Pommes de terre et carottes"]), ["Pommes de terre et carottes"]); // pas de sel ni poivre : inchangé
  assert.deepEqual(Data.fromSchema({ name: "X", ingredients: ["400 g Pâtes", "Sel, poivre"] }, "").ingredients, ["400 g de pâtes", "sel", "poivre"]);
});
