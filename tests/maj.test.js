// Page « Mises à jour ». Même montage que les autres : source et scénarios
// évalués ensemble, sinon les « let » restent enfermés dans leur eval.
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
global.$$ = (sel, racine) => {
  const source = racine && racine.innerHTML ? racine.innerHTML : '';
  const attr = sel.match(/\[data-([a-z-]+)\]/);
  if (!attr) return [];
  const nomJs = attr[1].replace(/-([a-z])/g, (m, c) => c.toUpperCase());
  const re = new RegExp('data-' + attr[1] + '="([^"]*)"', 'g');
  return [...source.matchAll(re)].map(m => { const n = faireNoeud('auto'); n.dataset[nomJs] = m[1]; return n; });
};
global.escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.dateCourte = () => '2 août 2026';
global.showToast = () => {};
global.confirm = () => true;
global.currentView = 'maj';
global.window = {
  accountUser: { id: 'moi', pseudo: 'Polus', isAdmin: false },
  sb: null,
  kvtProfils: { auteurHtml: (id, p) => `<span>${p}</span>`, chargerProfils: async () => {} }
};

const SOURCE = fs.readFileSync(__dirname + '/../maj.js', 'utf8');
const SCENARIOS = fs.readFileSync(__dirname + '/maj.cases.js', 'utf8');
eval(SOURCE + '\n;' + SCENARIOS);

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
