const test = require("node:test");
const assert = require("node:assert/strict");
const { Rayons } = require("./load");

const expected = {
  "oignons": "fruits", "pommes de terre": "fruits", "tomates": "fruits", "1 tête d'ail": "fruits",
  "lait": "cremerie", "6 œufs": "cremerie", "crème fraîche": "cremerie", "yaourts": "cremerie",
  "400 g de pâtes": "sale", "riz": "sale", "1 grosse boîte de tomates": "sale", "sauce tomate": "sale",
  "lardons": "charcuterie", "pâte feuilletée": "charcuterie", "steak haché": "boucherie",
  "baguette": "pain", "chocolat": "sucre", "jus d'orange": "boissons", "vin rouge": "alcools",
  "frites surgelées": "surgeles", "papier toilette": "hygiene", "liquide vaisselle": "entretien",
  "lingettes": "hygiene", "croquettes chat": "animaux", "truc inconnu": "autres",
};
for (const [name, rayon] of Object.entries(expected))
  test(`${name} → ${rayon}`, () => assert.equal(Rayons.guess(name), rayon));
