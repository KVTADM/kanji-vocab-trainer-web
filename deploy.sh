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
#   cd ~/Developer/KVT-code/kanji-vocab-trainer-web
#   bash deploy.sh
#
# Le dossier a déménagé le 25/07/2026 (Desktop/KVT -> ~/Developer/KVT-code).
# Le script suit automatiquement grâce à $(dirname "$0"), seul ce rappel de
# chemin était à corriger.
#
# Attention : ce script publie le CONTENU DU DOSSIER, pas le dernier commit git.
#
# Depuis le 02/08/2026, les installeurs ne sont plus ici. Ils vivent dans
# ../KVT-binaires et sont publiés sur les Releases GitHub : ils pesaient 166 Mo
# sur 168, soit 98,7 % de chaque déploiement, et repartaient en entier même
# pour une ligne de CSS. Ne les remets pas dans ce dossier.
#
# 04/08/2026 — le script s'est bloqué sans rien afficher, plusieurs minutes,
# curseur figé. Cause : `npx` demande « Need to install the following
# packages… Ok to proceed? (y) » quand son cache a été vidé (redémarrage du
# Mac), et la ligne de vérification envoyait TOUTE sa sortie vers /dev/null.
# La question était posée dans le vide, et le script attendait une réponse
# qu'on ne pouvait pas voir. Deux corrections : `--yes` répond d'avance, et
# on ne fait plus taire la sortie d'erreur. Une commande silencieuse qui
# attend est pire qu'une commande bavarde.
cd "$(dirname "$0")"
echo "Vérification de la connexion Netlify…"
npx --yes netlify-cli status >/dev/null || npx --yes netlify-cli login
echo "Publication du contenu du dossier…"
npx --yes netlify-cli deploy --prod --dir=. --site=9d064bfe-ee5c-447c-8f22-e8c4c2d3e0d8
