# Kanji Vocab Trainer — édition web (PWA)

Version navigateur (PWA installable) du même quiz de vocabulaire japonais que `kanji-vocab-trainer` (édition Mac). Contrairement aux éditions Electron, celle-ci a des comptes utilisateurs, un abonnement Pro payant, un leaderboard de classe, et sert aussi de vitrine de téléchargement pour les deux éditions desktop (Mac + Windows).

## Méthode de travail

Ces règles priment sur la vitesse. Pour une tâche triviale (coquille, one-liner évident), juge par toi-même — l'objectif est d'éviter les erreurs coûteuses sur le travail non trivial, pas de ralentir le reste.

Adapté de [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) (MIT). Les principes 1 à 3 sont repris de l'original ; le principe 4, bâti sur les tests automatisés dans la version d'origine, est réécrit — KVT n'a pas de suite de tests.

### 1. Réfléchir avant de coder

**Ne pas supposer. Ne pas masquer sa confusion. Exposer les arbitrages.**

- Énoncer ses hypothèses explicitement. En cas de doute, demander.
- Si plusieurs interprétations existent, les présenter — ne pas trancher en silence.
- Si une approche plus simple existe, le dire. Contredire quand c'est justifié.
- Si quelque chose n'est pas clair, s'arrêter. Nommer ce qui bloque. Demander.

### 2. Simplicité d'abord

**Le minimum de code qui résout le problème. Rien de spéculatif.**

- Aucune fonctionnalité au-delà de ce qui est demandé.
- Aucune abstraction pour du code utilisé une seule fois.
- Aucune « flexibilité » ou « configurabilité » non demandée.
- Aucune gestion d'erreur pour des cas impossibles.
- Si 200 lignes pouvaient en faire 50, réécrire.

*Cas d'école KVT* : l'édition « amis » était un fork complet de 15 000 lignes dont la seule vraie différence était un jeu de données. Remplacée le 25/07/2026 par un fichier d'import de 1 Mo.

### 3. Modifications chirurgicales

**Ne toucher que le nécessaire. Ne nettoyer que ses propres dégâts.**

- Ne pas « améliorer » le code, les commentaires ou le formatage voisins.
- Ne pas refactorer ce qui n'est pas cassé.
- Respecter le style existant, même si on ferait autrement.
- Si on repère du code mort sans rapport : le signaler, ne pas le supprimer.
- Supprimer les imports/variables/fonctions que **nos** changements ont rendus inutiles — pas le code mort préexistant, sauf demande explicite.

*Le test* : chaque ligne modifiée doit se rattacher directement à la demande.

### 4. Vérifier avant de conclure

**Définir le critère de réussite avant d'agir, et le vérifier vraiment.**

« Ça devrait marcher » n'est pas une conclusion — il faut un contrôle concret, tiré de la nature du changement.

KVT a une suite de tests depuis le 02/08/2026 : `tests/*.test.js`, lancés par `node tests/<nom>.test.js` depuis la racine du dépôt. La lancer entièrement avant toute conclusion. Les fichiers suivent le motif `*.test.js` (le harnais) + `*.cases.js` (les scénarios), **évalués ensemble dans un seul `eval`** — un `let` ou `const` déclaré dans un `eval` reste invisible à l'extérieur, et des scénarios évalués à part créent des variables homonymes qui testent du vide.

Les tests ne remplacent pas les contrôles ci-dessous, ils s'y ajoutent :

| Changement | Vérification attendue |
|---|---|
| Fichier JS modifié | `node --check <fichier>` |
| Fichier JSON de données | parser le fichier **et** comparer les compteurs (semestres, kanjiGroups, vocab) avant/après |
| `.dmg` / `.exe` copié | comparer le SHA-256 source/destination, et vérifier l'édition et la version dans le binaire |
| Site redéployé | recharger la page en ligne, pas le fichier local. Le service worker peut servir une version en cache |
| Contenu ajouté à un semestre | lancer l'app et le voir apparaître, pas seulement constater que le seed a grossi |

Pour une tâche en plusieurs étapes, annoncer le plan avec sa vérification :

```
1. [Étape] → vérif : [contrôle]
2. [Étape] → vérif : [contrôle]
```

*Pourquoi cette section existe* — les deux vrais incidents du projet étaient des défauts de vérification, pas des bugs de code : le `.dmg` livré sur le site n'était pas signé et personne ne l'a retéléchargé depuis le site avant de conclure (bloqué par macOS pendant des jours) ; et le `.dmg` servi sur la page Applications était celui de l'édition « amis » — le fichier avait le bon nom, personne n'avait ouvert son contenu.

### 5. Écrire ce qui a été fait

Toute session non triviale se termine par une entrée dans `00 - Notes projet/03 - Journal.md` : ce qui a été fait, ce qui a été vérifié, ce qui reste ouvert. Un point laissé en suspens s'écrit comme tel — ne pas cocher à moitié.

---

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
- `outils/generer-pages-deck.js` : génère `/deck/<slug>/` et `sitemap.xml` depuis Supabase, lancé par `deploy.sh` avant la publication. Ces pages sont les seules du site dont le texte existe dans le HTML servi — tout le reste est fabriqué dans le navigateur. `/deck/` et `sitemap.xml` sont gitignorés (régénérés à chaque déploiement).
- `mesure.js` : comptage d'audience anonyme (page, provenance `?ref=`, cinq paliers) vers la table `visites`. Aucune donnée personnelle, donc aucun consentement à demander — ne jamais y ajouter d'identifiant de compte ni de stockage persistant.
- **Les binaires ne sont plus dans ce dépôt.** Depuis le 02/08/2026, `KVT-Mac.dmg` et `KVT-Windows.exe` vivent dans `../KVT-binaires/` et sont distribués par les **Releases GitHub** (`releases/download/v<APP_VERSION>/`). Ils pesaient 166 Mo sur 168 et repartaient en entier à chaque déploiement. `downloads/` n'existe plus ; une redirection 302 dans `netlify.toml` garde les anciens liens vivants.

## Abonnement Pro

Stripe **Managed Payments** (pas d'intégration API custom côté client) : bouton = simple lien Stripe Payment Link avec `client_reference_id` dans l'URL. Le passage en/hors statut Pro est géré par un webhook Stripe → Supabase (côté Supabase, pas dans ce repo) qui met à jour la table `pro_status` (RLS lecture seule côté client). Prix : 3,99 €/mois.

## Déploiement

- `bash deploy.sh` : script déjà configuré avec l'id du site Netlify — le plus simple, gère aussi la connexion CLI si besoin (`npx netlify-cli login` au premier lancement).
- Sinon manuellement : `npx netlify-cli deploy --prod` depuis ce dossier (le CLI `netlify` n'est pas forcément installé globalement sur la machine — toujours passer par `npx`).
- **Important** : `deploy.sh` publie le **contenu du dossier**, pas le dernier commit git. Un push GitHub ne déploie rien. Tout fichier posé dans ce dossier part en production — un `.zip` de travail oublié à la racine serait publié.
- Le script commence par générer les pages de deck (`set -e` : si ça échoue, rien ne part). Il ne fonctionne que depuis le Mac de Paul : `api.netlify.com` est injoignable depuis le bac à sable.
- **Nouveaux binaires** : ils ne passent plus par le déploiement. Reconstruire, poser les fichiers dans `../KVT-binaires/`, créer une Release GitHub étiquetée `v<APP_VERSION>` (voir `app.js`) et y déposer les deux fichiers **sous leurs noms exacts** — piège déjà rencontré : `KVT-Mac.dmg` contenait en fait l'édition « amis ». Vérifier par SHA-256, le nom de fichier ne prouve rien.
- Le déploiement est en mode **CLI manuel**, pas de lien Git→Netlify : un push GitHub ne redéploie pas le site tout seul.

## Contexte de session (bac à sable Claude)

- `git push`/`commit` échoue fréquemment dans le bac à sable Linux Cowork (verrous `.git/*.lock`) — repli sur l'éditeur web GitHub (sélection + `paste` simulé dans CodeMirror) quand le CLI local bloque.
- Réseau du bac à sable : `api.github.com` (API REST directe) est bloqué par l'allowlist, alors que `github.com` (donc git lui-même) fonctionne — utiliser Chrome pour toute vérification qui passerait par l'API REST GitHub. `netlify.app` est aussi bloqué en sortie directe (curl) depuis le bac à sable — utiliser le connecteur MCP Netlify pour lire l'état des déploiements à la place.
- Le déploiement (`netlify deploy --prod`) doit être lancé depuis le vrai Mac de Paul (fichiers `downloads/` locaux, CLI non authentifié dans le bac à sable). Coordination via `05 - A faire sur Mac.md` / `03 - Journal.md` dans `Desktop/KVT/00 - Notes projet/`.
