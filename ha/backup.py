#!/usr/bin/env python3
"""Sauvegarde quotidienne des données Menus & Courses, lancée par Home Assistant.

Lit le code du foyer dans .code (même dossier), récupère les données via la
fonction get_household de Supabase et les écrit dans courses-AAAA-MM-JJ.json.
La sauvegarde Home Assistant (chiffrée, vers Google Drive) emporte ensuite ce dossier.
"""
import datetime
import json
import pathlib
import sys
import urllib.request

DIR = pathlib.Path(__file__).resolve().parent
URL = "https://qazrxepqfdmbtxyfeesg.supabase.co/rest/v1/rpc/get_household"
# Clé publique "anon" (la même que dans config.js) : la protection repose sur le code du foyer.
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhenJ4ZXBxZmRtYnR4eWZlZXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NTQ0MjcsImV4cCI6MjEwNzIzMDQyN30.fmJhXiHZ8-ZVZk4Xi-w67dRM9vaY30yT8d1JySnScvI"
KEEP = 14  # nombre de fichiers gardés en local

code = (DIR / ".code").read_text(encoding="utf-8").strip()
req = urllib.request.Request(
    URL,
    data=json.dumps({"p_code": code}).encode(),
    headers={"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=30) as resp:
    data = json.load(resp)

if not isinstance(data, dict) or not data.get("lists"):
    sys.exit("Code du foyer inconnu ou données vides : rien n'a été sauvegardé.")

out = DIR / f"courses-{datetime.date.today():%Y-%m-%d}.json"
tmp = out.with_suffix(".tmp")
tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
tmp.replace(out)

for old in sorted(DIR.glob("courses-*.json"))[:-KEEP]:
    old.unlink()

print(f"{out.name} : {len(data.get('items', {}))} articles, "
      f"{len(data.get('meals', {}))} repas, {len(data.get('recipes', {}))} recettes")
