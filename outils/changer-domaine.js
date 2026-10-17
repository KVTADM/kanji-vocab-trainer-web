#!/usr/bin/env node
// Bascule l'adresse du site vers un nom de domaine personnalisé (17/10/2026).
//
// À lancer SEULEMENT quand le domaine est acheté ET branché à Netlify (le
// site répond déjà sur la nouvelle adresse, en https). Sinon toutes les
// adresses canoniques et le plan du site pointeraient vers une adresse qui
// ne répond pas, ce qui est pire que de ne rien changer.
//
//   node outils/changer-domaine.js https://kvt.app            (simulation)
//   node outils/changer-domaine.js https://kvt.app --appliquer (écrit les fichiers)
//
// Remplace l'ancienne adresse partout : pages, balises canonical / Open Graph,
// plan du site, robots.txt, générateur de decks, tests. Le dossier deck/ est
// régénéré au déploiement, mais on le met aussi à jour pour rester cohérent
// avant ce déploiement.
const fs = require('fs');
const path = require('path');

const ANCIENNE = 'https://kanji-vocab-trainer.netlify.app';
const [, , cible, option] = process.argv;
if (!cible || !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(cible)) {
  console.error('Usage : node outils/changer-domaine.js https://ton-domaine.app [--appliquer]');
  process.exit(1);
}
const RACINE = path.join(__dirname, '..');
const EXTENSIONS = new Set(['.html', '.js', '.xml', '.txt', '.json', '.toml']);
const IGNORES = new Set(['node_modules', '.git', '.netlify']);

let fichiers = 0, occurrences = 0;
function parcourir(dossier) {
  for (const nom of fs.readdirSync(dossier)) {
    if (IGNORES.has(nom)) continue;
    const chemin = path.join(dossier, nom);
    const st = fs.statSync(chemin);
    if (st.isDirectory()) { parcourir(chemin); continue; }
    if (!EXTENSIONS.has(path.extname(nom))) continue;
    if (chemin === __filename) continue; // ne jamais se réécrire soi-même
    const texte = fs.readFileSync(chemin, 'utf8');
    const n = texte.split(ANCIENNE).length - 1;
    if (!n) continue;
    fichiers++; occurrences += n;
    console.log(`  ${n} × ${path.relative(RACINE, chemin)}`);
    if (option === '--appliquer') fs.writeFileSync(chemin, texte.split(ANCIENNE).join(cible), 'utf8');
  }
}
parcourir(RACINE);
console.log(`\n${occurrences} occurrence(s) dans ${fichiers} fichier(s) ${option === '--appliquer' ? 'modifiée(s)' : '(simulation : rien n\'est écrit)'}.`);
if (option !== '--appliquer') console.log('Relance avec --appliquer pour écrire les changements.');
else console.log(`\nÀ faire ensuite : ajouter la redirection ${ANCIENNE} -> ${cible} dans netlify.toml (voir le Journal), lancer les tests, déployer.`);
