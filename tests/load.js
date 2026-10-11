// Charge les modules du navigateur (qty.js, rayons.js, data.js) dans Node.
globalThis.window = globalThis;
require("../qty.js");
require("../rayons.js");
require("../data.js");
module.exports = { Qty: globalThis.Qty, Rayons: globalThis.Rayons, Data: globalThis.Data };
