// Widget "Nouveautés" du tableau de bord (maj.js) -- même montage que les
// autres : source et scénarios évalués ensemble, sinon les « let » restent
// enfermés dans leur eval.
//
// La page "Mises à jour" en entier (proposer/soutenir/filtrer/modérer) a été
// retirée de maj.js le 23/09/2026 (demande de Paul) : ce fichier de test a
// été réduit d'autant, seul le widget d'aperçu subsiste dans maj.js.
//
// Lancer : node tests/maj.test.js

const fs = require('fs');
const cas = [];
global.essai = function (nom, fn) {
  try { fn(); cas.push(['OK', nom]); }
  catch (e) { cas.push(['ECHEC', nom + ' -> ' + e.message]); }
};

const noeuds = new Map();
function faireNoeud(id) {
  return { id, innerHTML: '', value: '', dataset: {}, onclick: null, onchange: null,
           addEventListener(t, f) { this['on' + t] = f; } };
}
global.trouve = (sel) => {
  const id = sel.replace(/^#/, '');
  if (!sel.startsWith('#')) return null;
  if (!noeuds.has(id)) noeuds.set(id, faireNoeud(id));
  return noeuds.get(id);
};
global.$ = global.trouve;
global.escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.window = { sb: null };

const SOURCE = fs.readFileSync(__dirname + '/../maj.js', 'utf8');
const SCENARIOS = fs.readFileSync(__dirname + '/maj.cases.js', 'utf8');
eval(SOURCE + '\n;' + SCENARIOS);

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
