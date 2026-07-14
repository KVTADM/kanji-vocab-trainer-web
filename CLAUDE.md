# Kanji Vocab Trainer — édition web (PWA)

Version navigateur (PWA installable) du même quiz de vocabulaire japonais que `kanji-vocab-trainer` (édition Mac). Contrairement aux éditions Electron, celle-ci a des comptes utilisateurs, un abonnement Pro payant, un leaderboard de classe, et sert aussi de vitrine de téléchargement pour les deux éditions desktop (Mac + Windows).

## Stack et fichiers

- Site statique (HTML/CSS/JS vanilla, aucun bundler/framework), déployé sur Netlify (projet "kanji-vocab-trainer", id `9d064bfe-ee5c-447c-8f22-e8c4c2d3e0d8`).
- `app.js` (~1600 lignes) : même logique de quiz/scoring/vues que les éditions Electron, adaptée au web. Contient aussi la page "Applications" (détection auto de l'OS, boutons de téléchargement Mac/Windows, instructions d'installation).
- `webapi.js` : remplace le pont Electron (`preload.js`/`ipcMain`) par du stockage IndexedDB — même contrat que `window.api.*` (`loadData`/`saveData`/`exportBackup`/`importBackup`/`resetToDefault`), pour qu'`app.js` tourne à l'identique sans dépendance Electron.
- `supabaseClient.js` : init du client Supabase (URL + clé publique "anon" — normal qu'elle soit visible côté client, la vraie protection est dans les règles RLS côté serveur).
- `account.js` : gestion de compte (connexion, statut Pro, lien Stripe Payment Link avec `client_reference_id` = id du compte connecté au moment du clic — point important pour diagnostiquer un abonnement arrivé sur le mauvais compte).
- `admin.js` : vue Admin (probablement réservée à Paul).
- `leaderboard.js` : classement de classe (Supabase).
- `ads.js` : Google AdSense + bandeau de consentement cookies RGPD maison — aucune requête pub tant que le consentement n'est pas donné, aucune pub si compte Pro.
- `manifest.json` / `service-worker.js` : PWA installable.
- `downloads/` : contient les binaires téléchargeables (`KVT-Mac.dmg`, `KVT-Windows.exe`) — **gitignorés** (trop gros pour git), placés et mis à jour manuellement, jamais poussés sur GitHub.

## Abonnement Pro

Stripe **Managed Payments** (pas d'intégration API custom côté client) : bouton = simple lien Stripe Payment Link avec `client_reference_id` dans l'URL. Le passage en/hors statut Pro est géré par un webhook Stripe → Supabase (côté Supabase, pas dans ce repo) qui met à jour la table `pro_status` (RLS lecture seule côté client). Prix : 3,99 €/mois.

## Déploiement

- `bash deploy.sh` : script déjà configuré avec l'id du site Netlify — le plus simple, gère aussi la connexion CLI si besoin (`npx netlify-cli login` au premier lancement).
- Sinon manuellement : `npx netlify-cli deploy --prod` depuis ce dossier (le CLI `netlify` n'est pas forcément installé globalement sur la machine — toujours passer par `npx`).
- **Important** : les fichiers dans `downloads/` ne sont jamais dans git (gitignorés) — un déploiement Netlify les prend directement depuis le disque local. Donc avant de redéployer après un nouveau build Mac/Windows, bien vérifier que le bon fichier (bonne édition, bonne version) est physiquement dans `downloads/` sous le bon nom (`KVT-Mac.dmg` / `KVT-Windows.exe`) — piège déjà rencontré : `KVT-Mac.dmg` contenait en fait l'édition "amis" au lieu de la principale.
- Le déploiement est en mode **CLI manuel**, pas de lien Git→Netlify : un push GitHub ne redéploie pas le site tout seul.

## Contexte de session (bac à sable Claude)

- `git push`/`commit` échoue fréquemment dans le bac à sable Linux Cowork (verrous `.git/*.lock`) — repli sur l'éditeur web GitHub (sélection + `paste` simulé dans CodeMirror) quand le CLI local bloque.
- Réseau du bac à sable : `api.github.com` (API REST directe) est bloqué par l'allowlist, alors que `github.com` (donc git lui-même) fonctionne — utiliser Chrome pour toute vérification qui passerait par l'API REST GitHub. `netlify.app` est aussi bloqué en sortie directe (curl) depuis le bac à sable — utiliser le connecteur MCP Netlify pour lire l'état des déploiements à la place.
- Le déploiement (`netlify deploy --prod`) doit être lancé depuis le vrai Mac de Paul (fichiers `downloads/` locaux, CLI non authentifié dans le bac à sable). Coordination via `05 - A faire sur Mac.md` / `03 - Journal.md` dans `Desktop/KVT/00 - Notes projet/`.
