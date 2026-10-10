#!/bin/sh
# Enregistre le code du foyer pour la sauvegarde (fichier lisible par root seul),
# puis vérifie la configuration et redémarre Home Assistant.
cd "$(dirname "$0")" || exit 1
printf 'Code du foyer (la saisie reste invisible) : '
stty -echo; IFS= read -r CODE; stty echo; echo
if [ "${#CODE}" -lt 10 ]; then echo "Code trop court : rien n'est enregistré."; exit 1; fi
umask 077
printf '%s' "$CODE" > .code
unset CODE
echo "Code enregistré. Vérification de la configuration…"
if ha core check; then
  echo "Configuration valide. Redémarrage de Home Assistant (1 minute environ)…"
  ha core restart
else
  echo "Configuration invalide : Home Assistant n'est PAS redémarré. Copiez ce message à Claude."
fi
