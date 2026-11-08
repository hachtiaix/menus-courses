#!/usr/bin/env python3
"""Nouveautés de Marmiton et CuisineAZ → nouveautes.json (lu par l'app pour ses propositions du mercredi au vendredi).

Ne garde que des plats (pas de desserts, boissons, sauces ni apéritifs) d'au plus 30 minutes de préparation,
et seulement le titre, le lien et les temps : le contenu d'une recette n'est lu qu'au moment où on l'importe.
Lancé chaque mardi soir par GitHub Actions (.github/workflows/nouveautes.yml) ; pages autorisées par les robots.txt.
"""
import datetime, html, json, pathlib, re, sys, time, urllib.request

UA = {"User-Agent": "MenusCourses/1.0 (application familiale ; +https://github.com/hachtiaix/menus-courses)",
      "Accept-Language": "fr-FR,fr"}
MAX_PREP, PER_SITE, MAX_PAGES = 30, 25, 220
OUT = pathlib.Path(__file__).resolve().parent.parent / "nouveautes.json"
# pas des plats : sucré, boissons, apéritif, sauces, pains
NOT_DISH = re.compile(r"sabl|bredele|bonbon|cr[eê]pe|g[aâ]teau|\bcake|tarte au suc|tartes? sucr|dessert|cookie|biscuit|muffin|"
                      r"brioche|chocolat|confiture|glace|sorbet|cocktail|rhum|boisson|smoothie|\bjus\b|sirop|\bpains?\b|naan|"
                      r"ap[ée]ritif|amuse|\bdips?\b|houmous|tartinade|sauce|vinaigrette|compote|truffe|caramel|meringue|"
                      r"macaron|beignet|gaufre|pancake|friandise|chutney|confit\b|rillettes|terrine|toast|verrine|"
                      r"mignardise|punch|vin chaud|liqueur|cr[eè]me (?:dessert|anglaise|br[uû]l)|mousse au|panna|tiramisu|"
                      r"cheesecake|brownie|flan|clafoutis|crumble|fondant|financier|madeleine|donut|marbr|yaourt|douceur|[àa] tartiner|"
                      r"toasts?\b|tartines?\b|bruschetta|crostini|canap[ée]s?\b|mouillettes?|\bchips\b", re.I)
# recettes écrites pour un robot de cuisine (on n'en a pas)
ROBOT = re.compile(r"thermomix|cookeo|companion|monsieur cuisine|robot (?:cuiseur|multifonction|chauffant)|\btm ?[56]\b", re.I)

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
        return r.read().decode("utf-8", "replace")

def recipe(page):
    for m in re.finditer(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", page, re.S | re.I):
        try:
            d = json.loads(m.group(1))
        except ValueError:
            continue
        stack = [d]
        while stack:
            x = stack.pop()
            if isinstance(x, list):
                stack.extend(x); continue
            if not isinstance(x, dict):
                continue
            if "@graph" in x:
                stack.extend(x["@graph"] if isinstance(x["@graph"], list) else [x["@graph"]])
            t = x.get("@type")
            if "Recipe" in (t if isinstance(t, list) else [t]):
                return x
    return None

def minutes(d):
    m = re.match(r"^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?", str(d or ""), re.I)
    return (int(m.group(1) or 0) * 1440 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)) if m else 0

def title(name):
    t = html.unescape(str(name or "")).strip()
    t = re.sub(r"\s*[:\-–|]\s*(la meilleure recette|recette).*$", "", t, flags=re.I)
    t = re.sub(r"^(.{6,}?)\s+:\s+.*$", r"\1", t)
    t = re.sub(r"^recette\s+(?:de\s+|d['’]\s*)?", "", t, flags=re.I)  # « Recette wrap chaud » → « Wrap chaud »
    return (t[:1].upper() + t[1:])[:80]

def item(site, url, x):
    serves = re.search(r"\d+", " ".join(map(str, x.get("recipeYield") if isinstance(x.get("recipeYield"), list) else [x.get("recipeYield") or ""])))
    return {"site": site, "titre": title(x.get("name")), "url": url, "prep": minutes(x.get("prepTime")),
            "total": minutes(x.get("totalTime")) or None, "pour": int(serves.group()) if serves else None,
            "publie": str(x.get("datePublished") or "")[:10] or None}

def category(x):
    c = x.get("recipeCategory")
    return " ".join(c) if isinstance(c, list) else str(c or "")

def robot(x):
    txt = " ".join(str(x.get(k) or "") for k in ("name", "keywords", "recipeCategory", "description"))
    return bool(ROBOT.search(txt))

def collect(site, urls, keep):
    out, seen = [], 0
    for url in urls:
        if len(out) >= PER_SITE or seen >= MAX_PAGES:
            break
        seen += 1
        try:
            x = recipe(get(url))
        except Exception as e:  # une page qui ne répond pas : on passe à la suivante
            print(f"  {site} : {url} ignorée ({e})", file=sys.stderr); x = None
        time.sleep(1)  # une page par seconde, pour ménager les sites
        if x and 0 < minutes(x.get("prepTime")) <= MAX_PREP and keep(x) and not robot(x):
            out.append(item(site, url, x))
    # presque le même plat deux fois (« Wrap chaud au four » / « Recette wrap chaud au four ») : un seul
    uniq, keys = [], set()
    for r in out:
        k = re.sub(r"[^a-z]", "", html.unescape(r["titre"]).lower())
        if k not in keys:
            keys.add(k); uniq.append(r)
    out = uniq
    print(f"{site} : {len(out)} plats retenus sur {seen} recettes lues")
    return out

def marmiton_urls():
    urls = []
    for p in range(1, 5):
        page = get("https://www.marmiton.org/recettes/nouveautes.aspx" + (f"?page={p}" if p > 1 else ""))
        for u in re.findall(r"https://www\.marmiton\.org/recettes/recette_[\w\-]+\.aspx", page):
            if u not in urls:
                urls.append(u)
        time.sleep(1)
    return urls

def cuisineaz_urls():
    xml = get("https://www.cuisineaz.com/xml/sitemap-cuisineaz-recette-1.xml")
    items = re.findall(r"<loc>(https://www\.cuisineaz\.com/recettes/[^<]+\.aspx)</loc>\s*<lastmod>([^<]+)</lastmod>", xml)
    since = (datetime.date.today() - datetime.timedelta(days=21)).isoformat()
    return [u for u, d in sorted(items, key=lambda t: t[1], reverse=True) if d[:10] >= since]

def main():
    mar = collect("marmiton", marmiton_urls(),
                  lambda x: "plat principal" in category(x).lower() and not NOT_DISH.search(str(x.get("name"))))
    caz = collect("cuisineaz", cuisineaz_urls(),
                  lambda x: not NOT_DISH.search(category(x) + " " + str(x.get("name"))))
    if not mar and not caz:
        sys.exit("Aucune nouveauté lue : fichier inchangé.")
    # on garde aussi les recettes des passages précédents (30 jours, 100 au plus) : plus de choix d'un jour à l'autre
    today = datetime.date.today().isoformat()
    fresh = [dict(r, vu=today) for r in mar + caz]
    seen = {r["url"] for r in fresh}
    try:
        old = json.loads(OUT.read_text(encoding="utf-8")).get("recettes", [])
    except Exception:
        old = []
    limit = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()
    keep = [r for r in old if r.get("url") not in seen and (r.get("vu") or "") >= limit]
    for r in keep:
        r.setdefault("vu", today)
    allr = (fresh + keep)[:100]
    OUT.write_text(json.dumps({"maj": today, "recettes": allr},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT.name} : {len(allr)} recettes ({len(fresh)} lues aujourd'hui)")

if __name__ == "__main__":
    main()
