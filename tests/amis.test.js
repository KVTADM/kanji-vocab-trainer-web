// Amis : classement des trois piles, et retrouver une ligne depuis sa clé.
// Lancer : node tests/amis.test.js
//
// Même montage que pour decks.js et profils.js : la source et les scénarios
// sont évalués ensemble, sinon les « let » de amis.js restent enfermés dans
// leur eval et les scénarios testent des variables homonymes vides.

const fs = require('fs');
const cas = [];
global.essai = function (nom, fn) {
  try { fn(); cas.push(['OK', nom]); }
  catch (e) { cas.push(['ECHEC', nom + ' -> ' + e.message]); }
};

const noeuds = new Map();
function faireNoeud(id) {
  return {
    id, innerHTML: '', outerHTML: '', textContent: '', value: '', dataset: {},
    onclick: null, oninput: null, onkeydown: null,
    addEventListener(t, f) { this['on' + t] = f; },
    classList: { add(){}, remove(){}, toggle(){} }
  };
}
global.trouve = function (sel) {
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
  return [...source.matchAll(re)].map(m => {
    const n = faireNoeud('auto'); n.dataset[nomJs] = m[1]; return n;
  });
};
global.escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.showToast = () => {};
global.confirm = () => true;
global.window = {
  accountUser: { id: 'moi', pseudo: 'Polus' },
  sb: null,
  kvtProfils: {
    profilDe: (id) => ({ pseudo: 'Pseudo-' + id, niveau: 'n4', bio: 'Une bio.' }),
    avatarHtml: () => '<span class="avatar-initiale">P</span>',
    libelleNiveau: () => 'JLPT N4',
    chargerProfils: async () => {}
  }
};

const SOURCE = fs.readFileSync(__dirname + '/../amis.js', 'utf8');
const SCENARIOS = fs.readFileSync(__dirname + '/amis.cases.js', 'utf8');
eval(SOURCE + '\n;' + SCENARIOS);

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
