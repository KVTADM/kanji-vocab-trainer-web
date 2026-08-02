#!/bin/bash
# Aperçu local du site KVT — rien n'est publié, rien n'est envoyé.
#
# Pourquoi un serveur et pas un double-clic sur index.html : les pages
# utilisent des chemins absolus (/style.css, /app, /regles-de-publication).
# Ouvert en fichier local, le navigateur les cherche à la racine du disque et
# la page arrive sans style. Un serveur, même minuscule, rétablit la racine.

cd "$(dirname "$0")" || exit 1
PORT=8765

# Si le port est déjà pris (aperçu déjà lancé), on ne lance pas un deuxième
# serveur : on ouvre simplement le navigateur sur celui qui tourne.
if lsof -i :$PORT >/dev/null 2>&1; then
  echo "Un aperçu tourne déjà sur le port $PORT — j'ouvre le navigateur dessus."
  open "http://localhost:$PORT/"
  exit 0
fi

echo "Aperçu local du site KVT"
echo "Dossier servi : $(pwd)"
echo
echo "  Accueil                 http://localhost:$PORT/"
echo "  Règles de publication   http://localhost:$PORT/regles-de-publication/"
echo "  Signaler un contenu     http://localhost:$PORT/signaler/"
echo "  L'app                   http://localhost:$PORT/app/"
echo "  Decks partagés          http://localhost:$PORT/app/ puis onglet « Decks partagés »"
echo
echo "Pour arrêter : ferme cette fenêtre, ou Ctrl-C."
echo "Attention : le service worker garde les pages en cache. Si une"
echo "modification n'apparaît pas, recharge avec Cmd-Maj-R."
echo

# Laisser au serveur le temps de démarrer avant d'ouvrir le navigateur.
( sleep 1 && open "http://localhost:$PORT/" ) &

python3 -m http.server $PORT --bind 127.0.0.1
