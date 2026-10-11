#!/usr/bin/env python3
"""Restaure une sauvegarde Menus & Courses (fichier courses-AAAA-MM-JJ.json) dans le foyer.

    python3 restaurer.py courses-2026-10-11.json            # fusion : ne remplace rien de plus récent
    python3 restaurer.py courses-2026-10-11.json --force    # la sauvegarde l'emporte (annule une suppression)

Le code du foyer est lu dans .code (à côté du script), sinon demandé à l'écran.
La base fusionne enregistrement par enregistrement : rien n'est supprimé par une restauration.
"""
import getpass
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

DIR = pathlib.Path(__file__).resolve().parent
API = "https://qazrxepqfdmbtxyfeesg.supabase.co/rest/v1/rpc/"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhenJ4ZXBxZmRtYnR4eWZlZXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NTQ0MjcsImV4cCI6MjEwNzIzMDQyN30.fmJhXiHZ8-ZVZk4Xi-w67dRM9vaY30yT8d1JySnScvI"
KINDS = ("lists", "items", "meals", "recipes", "aisles", "stores", "habits", "foods")


def call(fn, body):
    req = urllib.request.Request(API + fn, data=json.dumps(body).encode(),
                                 headers={"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


def count(d):
    return {k: len(d.get(k) or {}) for k in KINDS}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    data = json.loads(pathlib.Path(args[0]).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not any(k in data for k in KINDS):
        sys.exit("Ce fichier n'est pas une sauvegarde Menus & Courses.")
    if "--force" in sys.argv:  # date d'aujourd'hui sur chaque enregistrement : la sauvegarde gagne la fusion
        now = int(time.time() * 1000)
        for k in KINDS:
            for rec in (data.get(k) or {}).values():
                if isinstance(rec, dict):
                    rec["ts"] = now
    code_file = DIR / ".code"
    code = code_file.read_text(encoding="utf-8").strip() if code_file.exists() else getpass.getpass("Code du foyer : ").strip()

    print("Sauvegarde :", count(data))
    try:
        call("put_household", {"p_code": code, "p_data": data})
    except urllib.error.HTTPError as e:
        sys.exit("Refusé par la base : " + e.read().decode(errors="replace"))
    after = call("get_household", {"p_code": code})
    print("Foyer après restauration :", count(after or {}))


if __name__ == "__main__":
    main()
