#!/bin/bash
# Publie le dossier courant sur Netlify (site "kanji-vocab-trainer") via le
# CLI classique — pas l'outil "Agent Runner" IA utilisé avant, qui consomme
# beaucoup plus de crédits (compute + inférence IA en plus du déploiement
# lui-même). Le CLI classique ne coûte que le déploiement de base.
#
# Première utilisation seulement : authentifie-toi une fois avec
#   npx netlify-cli login
# (ouvre ton navigateur, autorise l'accès une fois pour toutes — ensuite ce
# script suffit à chaque déploiement, plus besoin de refaire cette étape
# ni de jeton à copier-coller).
#
# À lancer depuis un Terminal sur ton Mac, dans ce dossier :
#   cd "/Users/paulpicavet/Documents/_À trier/ANKI/kanji/kanji-vocab-trainer-web"
#   bash deploy.sh
cd "$(dirname "$0")"
npx netlify-cli status >/dev/null 2>&1 || npx netlify-cli login
npx netlify-cli deploy --prod --dir=. --site=9d064bfe-ee5c-447c-8f22-e8c4c2d3e0d8
