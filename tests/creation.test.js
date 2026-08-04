// Contrôles de creation.js — fabriquer un deck depuis la banque de kanji.
//
// Le harnais et les scénarios sont évalués ENSEMBLE dans un seul eval : un
// `let` ou un `const` déclaré dans un eval reste invisible à l'extérieur, et
// des scénarios évalués à part créeraient des variables homonymes qui
// testeraient du vide.
//
// À lancer depuis la racine du dépôt : node tests/creation.test.js

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
let compteur = 0;
global.uid = (p) => p + '-' + (++compteur);
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

function baseExemple() {
  return {
    settings: {
      semesters: [
        { id: 's1', label: 'Semestre 1', weeks: 2 },
        { id: 'jlpt-n5', label: 'JLPT N5', weeks: 2 }
      ]
    },
    kanjiGroups: [
      { id: 'a', semesterId: 's1', week: 1, kanji: '日', titre: 'soleil' },
      { id: 'b', semesterId: 's1', week: 1, kanji: '月', titre: 'lune' },
      { id: 'c', semesterId: 's1', week: 2, kanji: '火', titre: 'feu' },
      { id: 'd', semesterId: 'jlpt-n5', week: 1, kanji: '水', titre: 'eau' },
      { id: 'vide', semesterId: 's1', week: 2, kanji: '木', titre: 'arbre' }
    ],
    vocab: [
      { id: 'v1', kanjiGroupId: 'a', mot: '日本', lecture: 'にほん', sens: 'Japon' },
      { id: 'v2', kanjiGroupId: 'a', mot: '毎日', lecture: 'まいにち', sens: 'chaque jour' },
      { id: 'v3', kanjiGroupId: 'b', mot: '月曜', lecture: 'げつよう', sens: 'lundi' },
      { id: 'v4', kanjiGroupId: 'c', mot: '火事', lecture: 'かじ', sens: 'incendie' },
      { id: 'v5', kanjiGroupId: 'd', mot: '水曜', lecture: 'すいよう', sens: 'mercredi' }
    ],
    scores: {
      's1-w1': { best: { pct: 40 } },
      's1-w2': { best: { pct: 95 } },
      'jlpt-n5-w1': { best: { pct: 60 } }
    }
  };
}

const SRC = fs.readFileSync('creation.js', 'utf8');
const CAS = fs.readFileSync('tests/creation.cases.js', 'utf8');
eval(SRC + '\n' + CAS);

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
