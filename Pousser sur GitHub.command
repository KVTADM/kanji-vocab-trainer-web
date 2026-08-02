#!/bin/bash
# Envoie les modifications de ce dossier sur GitHub, en une seule action.
#
# Rien n'est publié sur le site : ce script ne touche qu'au dépôt. Pour mettre
# le site en ligne, c'est « déployer.command ».
#
# Le script s'arrête et explique s'il y a un problème, plutôt que de pousser
# quelque chose de cassé.

cd "$(dirname "$0")" || exit 1

echo "Dossier : $(pwd)"
echo

# ---------- 1. Y a-t-il quelque chose à envoyer ? ----------

if [ -z "$(git status --porcelain)" ] && [ -z "$(git log origin/main..HEAD 2>/dev/null)" ]; then
  echo "Rien à envoyer : le dépôt est déjà à jour."
  echo
  read -n 1 -s -r -p "Appuie sur une touche pour fermer."
  exit 0
fi

# ---------- 2. Les tests passent-ils ? ----------

if [ -d tests ] && command -v node >/dev/null 2>&1; then
  echo "Vérification des tests…"
  echec=0
  for t in tests/*.test.js; do
    [ -e "$t" ] || continue
    if node "$t" >/dev/null 2>&1; then
      printf "  OK      %s\n" "$(basename "$t")"
    else
      printf "  ÉCHEC   %s\n" "$(basename "$t")"
      echec=1
    fi
  done
  if [ "$echec" = "1" ]; then
    echo
    echo "Des tests échouent. Rien n'a été envoyé."
    echo "Pour voir le détail :  node tests/le-fichier.test.js"
    echo
    read -n 1 -s -r -p "Appuie sur une touche pour fermer."
    exit 1
  fi
  echo
fi

# ---------- 3. Ce qui va partir ----------

echo "Fichiers modifiés :"
git status --short
echo

# ---------- 4. Le message du commit ----------

echo "Décris en une phrase ce que tu as changé."
echo "(Laisse vide et appuie sur Entrée pour annuler.)"
printf "> "
read -r message

if [ -z "$message" ]; then
  echo "Annulé. Rien n'a été envoyé."
  read -n 1 -s -r -p "Appuie sur une touche pour fermer."
  exit 0
fi

# ---------- 5. Envoi ----------

echo
git add -A || exit 1

# S'il n'y avait que des commits déjà faits et rien de nouveau à ajouter,
# git commit échoue : ce n'est pas une erreur, on passe directement au push.
if ! git diff --cached --quiet; then
  git commit -m "$message" || exit 1
fi

echo
echo "Envoi vers GitHub…"
if git push origin main; then
  echo
  echo "Envoyé. Dernier commit :"
  git log --oneline -1
  echo
  echo "Le site en ligne n'a pas changé — pour ça, lance « déployer.command »."
else
  echo
  echo "L'envoi a échoué."
  echo
  echo "Cause la plus fréquente : quelqu'un (ou toi depuis l'éditeur web de"
  echo "GitHub) a modifié le dépôt entre-temps. Dans ce cas :"
  echo "    git pull --rebase origin main"
  echo "puis relance ce script."
  echo
  echo "Si le message parle de « .lock » ou d'index verrouillé :"
  echo "    find .git -name '*.lock' -delete"
fi

echo
read -n 1 -s -r -p "Appuie sur une touche pour fermer."
