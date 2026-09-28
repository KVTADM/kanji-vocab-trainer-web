// Contrôles de parties.js — salons multijoueur, jeu de la bombe (28/09/2026).
//
// Le harnais et les scénarios sont évalués ENSEMBLE dans un seul eval (même
// motif que gamification.test.js) : parties.js n'a aucune dépendance au DOM
// tant qu'on n'appelle pas ses fonctions render*(), donc pas besoin de
// découper le fichier comme pour app.js.
//
// À lancer depuis la racine du dépôt : node tests/parties.test.js

const fs = require('fs');

global.$ = () => null;
global.$$ = () => [];
global.escapeHtml = (t) => String(t == null ? '' : t);
global.showToast = () => {};
global.window = global;
global.document = { addEventListener() {} };
global.console.error = () => {}; // creerPartie loggue en cas d'échec répété : pas utile dans les tests

// Stubs des fonctions d'app.js dont parties.js dépend (réutilisation du
// système de quiz existant). Chaque scénario peut les redéfinir avant appel
// quand le comportement exact importe (ex. seuil de scoreAnswer).
global.shuffle = (arr) => arr.slice(); // identité : ordre déterministe dans les tests
global.estMotMasque = () => false;
global.scoreAnswer = (input, correct) => ({ pct: input === correct ? 1 : 0, points: 0 });
global.finaliserKana = (v) => v;
global.activerSaisieKanaDirecte = () => {};

global.DB = { vocab: [], kanjiGroups: [], settings: { semesters: [] } };
global.window.accountUser = { id: 'moi', pseudo: 'Moi' };

const cas = [];
const taches = [];
global.essai = (nom, fn) => { taches.push({ nom, fn }); };

const SRC = fs.readFileSync('parties.js', 'utf8');
const CAS = fs.readFileSync('tests/parties.cases.js', 'utf8');
eval(SRC + '\n' + CAS);

(async () => {
  for (const { nom, fn } of taches) {
    try {
      await fn();
      cas.push(['OK', nom]);
    } catch (e) {
      cas.push(['ECHEC', nom + ' — ' + e.message]);
    }
  }
  let echecs = 0;
  cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
  console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
  process.exit(echecs ? 1 : 0);
})();
