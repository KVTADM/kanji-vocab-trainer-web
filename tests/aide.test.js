// Contrôles de aide.js — boîte à problèmes / retours utilisateurs (28/09/2026).
// Même motif que parties.test.js : pas de dépendance DOM au chargement du
// fichier, donc un eval direct suffit (pas besoin de découper comme app.js).
//
// À lancer depuis la racine du dépôt : node tests/aide.test.js

const fs = require('fs');

global.$ = () => null;
global.$$ = () => [];
global.escapeHtml = (t) => String(t == null ? '' : t);
global.showToast = () => {};
global.window = global;
global.document = { addEventListener() {} };
global.window.accountUser = { id: 'moi', pseudo: 'Moi' };

const cas = [];
const taches = [];
global.essai = (nom, fn) => { taches.push({ nom, fn }); };

const SRC = fs.readFileSync('aide.js', 'utf8');
const CAS = fs.readFileSync('tests/aide.cases.js', 'utf8');
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
