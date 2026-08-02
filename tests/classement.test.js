// Vue d'ensemble du classement : le meilleur de chaque semaine.
// Lancer : node tests/classement.test.js

const fs = require('fs');
const cas = [];
global.essai = function (nom, fn) {
  try { fn(); cas.push(['OK', nom]); }
  catch (e) { cas.push(['ECHEC', nom + ' -> ' + e.message]); }
};

const noeuds = new Map();
function faireNoeud(id) {
  return { id, innerHTML: '', dataset: {}, addEventListener(){}, value: '' };
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
  const re = new RegExp('data-' + attr[1] + '="([^"]*)"', 'g');
  return [...source.matchAll(re)].map(m => { const n = faireNoeud('auto'); n.dataset[attr[1]] = m[1]; return n; });
};
global.escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.showToast = () => {};
global.window = {
  accountUser: { id: 'moi', pseudo: 'Polus' },
  sb: null,
  kvtProfils: { avatarHtml: () => '<span class="avatar-initiale">P</span>', chargerProfils: async () => {} }
};
global.DB = {
  settings: { semesters: [
    { id: 's1', label: 'Semestre 1', weeks: 12 },
    { id: 's2', label: 'Semestre 2', weeks: 12 },
    { id: 'jlpt-n5', label: 'JLPT N5', weeks: 4 }
  ] }
};

const SOURCE = fs.readFileSync(__dirname + '/../leaderboard.js', 'utf8');
const SCENARIOS = fs.readFileSync(__dirname + '/classement.cases.js', 'utf8');
eval(SOURCE + '\n;' + SCENARIOS);

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
