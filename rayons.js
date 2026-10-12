// Rayons (d'après les grands rayons du site Auchan), dans l'ordre d'un parcours en magasin,
// et devinette du rayon d'un article à partir de son nom.
(function(){
const RAYONS=[
  ["fruits","🥕","Fruits, légumes"],
  ["pain","🥖","Pain, pâtisserie"],
  ["boucherie","🥩","Boucherie, volaille, poisson"],
  ["charcuterie","🥓","Charcuterie, traiteur"],
  ["cremerie","🧀","Produits laitiers, œufs, fromages"],
  ["sale","🥫","Épicerie salée"],
  ["sucre","🍫","Épicerie sucrée"],
  ["boissons","🧃","Eaux, jus, sodas"],
  ["alcools","🍷","Vins, bières, alcools"],
  ["surgeles","🧊","Surgelés"],
  ["hygiene","🧴","Hygiène, beauté"],
  ["entretien","🧽","Entretien, maison"],
  ["animaux","🐾","Animalerie"],
  ["autres","🛒","Autres"],
].map(([id,icon,label])=>({id,icon,label}));

// Mots-clés (sans accents, au singulier). Les expressions de plusieurs mots passent avant les mots seuls.
// Mots seuls, sans accents, au singulier ; un mot n'apparaît que dans un rayon.
const K={
  fruits:"pomme poire banane orange citron clementine mandarine pamplemousse kiwi fraise framboise myrtille cerise abricot peche nectarine prune raisin melon pasteque ananas mangue avocat figue grenade fruit legume salade laitue mache roquette epinard tomate concombre courgette aubergine poivron carotte navet radis betterave poireau oignon echalote ail celeri fenouil chou brocoli artichaut asperge champignon potiron citrouille courge butternut endive persil ciboulette basilic coriandre menthe thym romarin aneth gingembre patate basilic persil ciboulette menthe coriandre aneth",
  pain:"pain baguette brioche croissant viennoiserie gateau biscotte bun wrap tortilla",
  boucherie:"boeuf veau porc agneau poulet dinde canard lapin steak hache viande escalope roti cote filet bavette entrecote saucisse merguez chipolata poisson saumon cabillaud colin thon crevette moule huitre crabe dorade bar truite maquereau gambas",
  charcuterie:"jambon lardon bacon saucisson chorizo rillette terrine salami coppa knacki quiche pizza traiteur taboule surimi",
  cremerie:"lait beurre creme yaourt yogourt fromage emmental gruyere comte mozzarella parmesan feta chevre camembert brie raclette reblochon roquefort mascarpone ricotta cheddar gouda edam maroille munster cantal tomme morbier mimolette oeuf skyr faisselle",
  sale:"chapelure pate spaghetti tagliatelle penne coquillette riz semoule quinoa lentille farine huile vinaigre sel poivre epice paprika cumin curry curcuma cannelle muscade cayenne colombo safran thym laurier origan romarin estragon sauge girofle badiane cardamome sesame genievre maizena bicarbonate soja moutarde mayonnaise ketchup sauce bouillon conserve olive cornichon chip cracker soupe puree concentre coulis",
  sucre:"sucre chocolat cafe the infusion cereale muesli confiture miel nutella madeleine compote levure vanille cacao bonbon biscuit",
  boissons:"eau jus soda coca limonade sirop boisson",
  alcools:"vin biere cidre champagne rhum whisky vodka pastis aperitif",
  surgeles:"surgele glace frite poelee",
  hygiene:"shampoing savon dentifrice deodorant coton mouchoir rasoir lingette",
  entretien:"lessive eponge javel nettoyant adoucissant",
  animaux:"croquette patee litiere chat chien",
};
const norm=s=>String(s).toLowerCase().replace(/œ/g,"oe").replace(/æ/g,"ae").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[’']/g," ")
  .replace(/[^a-z0-9 -]+/g," ").split(/\s+/).filter(Boolean).map(w=>w.length>3?w.replace(/[sx]$/,""):w).join(" ");
const RULES=[];
for(const [r,list] of Object.entries(K)){
  // chaque groupe de mots-clés séparé par un espace ; on reconstitue les expressions connues
  const words=list.split(" ");
  for(let i=0;i<words.length;i++)RULES.push([norm(words[i]),r]);
}
// Expressions prioritaires (plusieurs mots ou ambiguïtés)
const PHRASES=[
  ["pomme de terre","fruits"],["petit pois","fruits"],["haricot vert","fruits"],["chou fleur","fruits"],
  ["pain de mie","pain"],["pain au chocolat","pain"],
  ["thon en boite","sale"],["sardine en boite","sale"],["sauce tomate","sale"],["pate a tartiner","sucre"],
  ["lait concentre","sucre"],["fromage blanc","cremerie"],
  ["creme fraiche","cremerie"],["creme hydratante","hygiene"],["the glace","boissons"],["jus de","boissons"],
  ["noix de saint jacque","boucherie"],["blanc de poulet","charcuterie"],["jambon cru","charcuterie"],
  ["legume surgele","surgeles"],["poisson pane","surgeles"],["papier toilette","hygiene"],["brosse a dent","hygiene"],
  ["liquide vaisselle","entretien"],["sac poubelle","entretien"],["papier alu","entretien"],["film alimentaire","entretien"],
  ["gel douche","hygiene"],["pastille lave vaisselle","entretien"],["essuie tout","entretien"],["pate brisee","charcuterie"],
  ["pate feuilletee","charcuterie"],["pate a pizza","charcuterie"],["pate de campagne","charcuterie"],["pois chiche","sale"],["haricot rouge","sale"],
  ["petit suisse","cremerie"],["dessert lacte","cremerie"],["biscuit aperitif","sale"],["pain d epice","sucre"],
  ["lardon fume","charcuterie"],["ras el hanout","sale"],["herbe de provence","sale"],["piment d espelette","sale"],["quatre epice","sale"],
  ["fond de veau","sale"],["fleur de sel","sale"],["gros sel","sale"],["anis etoile","sale"],["baie de genievre","sale"],["graine de fenouil","sale"],
  ["basilic seche","sale"],["persil seche","sale"],["ciboulette sechee","sale"],["menthe sechee","sale"],["coriandre en poudre","sale"],["gingembre en poudre","sale"],
  ["ail en poudre","sale"],["oignon en poudre","sale"],["poivre 5 baie","sale"],["fenouil moulu","sale"],["chair de tomate","sale"],["poudre d amande","sucre"],["amande en poudre","sucre"],["amande effilee","sucre"],["arome","sucre"],["coulis de tomate","sale"],["tomate concassee","sale"],["fenouil en poudre","sale"],["tomate pelee","sale"],["boite de tomate","sale"],["coeur de palmier","sale"],
].map(([p,r])=>[norm(p),r]);
const map=new Map();for(const [w,r] of RULES)if(w&&!w.includes(" ")&&!map.has(w))map.set(w,r);

function guess(name){
  const n=" "+norm(name)+" ";
  for(const [p,r] of PHRASES)if(n.includes(" "+p+" ")||n.includes(" "+p))return r;
  for(const w of n.trim().split(" "))if(map.has(w))return map.get(w);
  return "autres";
}
// Clé d'un article pour mémoriser son rayon (identifiant court et sûr).
const keyOf=name=>norm(name).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,64)||"x";
window.Rayons={list:RAYONS,byId:Object.fromEntries(RAYONS.map(r=>[r.id,r])),guess,keyOf};
})();
