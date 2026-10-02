// Contrôles de parties-jeux.js — Duel éclair, Relais des mots, Dessin de kanji (02/10/2026).
//
// Même motif que parties.test.js : harnais + scénarios évalués ensemble.
// Les règles des jeux sont des fonctions pures : on les teste sans DOM ni Supabase.
// À lancer depuis la racine du dépôt : node tests/parties-jeux.test.js

const fs = require('fs');

global.$ = () => null;
global.$$ = () => [];
global.escapeHtml = (t) => String(t == null ? '' : t);
global.showToast = () => {};
global.window = global;
global.document = { addEventListener() {} };
global.console.error = () => {};
global.shuffle = (arr) => arr.slice();
global.estMotMasque = () => false;
global.scoreAnswer = (input, correct) => ({ pct: input === correct ? 1 : 0, points: 0 });
global.finaliserKana = (v) => v;
global.activerSaisieKanaDirecte = () => {};
global.DB = { vocab: [], kanjiGroups: [], settings: { semesters: [] } };
global.window.accountUser = { id: 'a', pseudo: 'A' };

const cas = [];
const taches = [];
global.essai = (nom, fn) => { taches.push({ nom, fn }); };

const SRC = fs.readFileSync('parties.js', 'utf8') + '\n' + fs.readFileSync('parties-jeux.js', 'utf8');
const CAS = fs.readFileSync('tests/parties-jeux.cases.js', 'utf8');
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
