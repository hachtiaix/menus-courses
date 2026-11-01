const test = require("node:test");
const assert = require("node:assert/strict");
globalThis.window = globalThis;
require("../qr.js");
const jsQR = require("../vendor/jsqr.js");

// matrice → image (4 pixels par case, marge blanche de 4 cases), puis lecture par jsQR
function read(M) {
  const s = 4, n = M.length + 8, w = n * s, px = new Uint8ClampedArray(w * w * 4).fill(255);
  M.forEach((row, y) => row.forEach((on, x) => {
    if (!on) return;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const i = (((y + 4) * s + dy) * w + (x + 4) * s + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }));
  const r = jsQR(px, w, w);
  return r && r.data;
}
const ALL = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).join("");
const rand = n => Array.from({ length: n }, () => ALL[Math.floor(Math.random() * ALL.length)]).join("");

test("QR : le code du foyer (30 caractères, symboles) se relit à l'identique", () => {
  for (let i = 0; i < 40; i++) { const t = "MC1:" + rand(30); assert.equal(read(QR.encode(t)), t); }
});
test("QR : toutes les tailles (versions 1 à 10) se relisent", () => {
  for (let n = 1; n <= 210; n += 7) { const t = rand(n); assert.equal(read(QR.encode(t)), t, "longueur " + n); }
});
test("QR : accents et texte trop long", () => {
  assert.equal(read(QR.encode("Crème brûlée, œufs")), "Crème brûlée, œufs");
  assert.throws(() => QR.encode(rand(300)));
});
