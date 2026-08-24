// Contrôles de gamification.js — niveaux, XP, pièces, série, boutique.
//
// Le harnais et les scénarios sont évalués ENSEMBLE dans un seul eval (même
// motif que les autres tests du projet, voir tests/creation.test.js).
//
// À lancer depuis la racine du dépôt : node tests/gamification.test.js

const fs = require('fs');

const noeuds = new Map();
function faireNoeud(id) {
  const n = {
    id, innerHTML: '', textContent: '', value: '', disabled: false, style: {},
    dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    onclick: null, onchange: null, oninput: null,
    addEventListener(t, f) { this['on' + t] = f; },
    removeEventListener() {},
    focus() {}, querySelector: () => null, querySelectorAll: () => []
  };
  return n;
}
function trouve(sel) {
  const id = sel.replace(/^#/, '');
  if (!sel.startsWith('#')) return null;
  if (!noeuds.has(id)) noeuds.set(id, faireNoeud(id));
  return noeuds.get(id);
}

global.$ = trouve;
global.$$ = () => [];
global.escapeHtml = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
global.showToast = () => {};
global.persist = async () => {};
global.window = global;
global.document = { addEventListener() {} };

global.DB = null;

const cas = [];
global.essai = (nom, fn) => {
  try { fn(); cas.push(['OK', nom]); }
  catch (e) { cas.push(['ECHEC', nom + ' — ' + e.message]); }
};

const SRC = fs.readFileSync('gamification.js', 'utf8');
const CAS = fs.readFileSync('tests/gamification.cases.js', 'utf8');
eval(SRC + '\n' + CAS);

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
