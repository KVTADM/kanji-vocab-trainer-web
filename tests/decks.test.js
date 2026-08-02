// Exécute réellement les deux vues avec un DOM factice, pour attraper les
// fautes de frappe que node --check ne voit pas (fonction inexistante,
// élément absent, template cassé).
const fs = require('fs');

const noeuds = new Map();
function faireNoeud(id) {
  const n = {
    id, innerHTML: '', textContent: '', value: '', disabled: false, style: {},
    dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){return false;} },
    onclick: null, onchange: null, oninput: null, onkeydown: null,
    addEventListener(type, fn) { this['on' + type] = fn; },
    removeEventListener() {},
    focus(){}, setSelectionRange(){},
    selectionStart: 0, offsetWidth: 1,
    querySelector: () => null, querySelectorAll: () => []
  };
  return n;
}
function trouve(sel, racine) {
  const id = sel.replace(/^#/, '');
  if (!sel.startsWith('#')) return null;
  if (!noeuds.has(id)) noeuds.set(id, faireNoeud(id));
  return noeuds.get(id);
}

global.$ = trouve;
global.$$ = (sel, racine) => {
  // On relit le HTML produit pour retrouver les éléments annoncés par les
  // templates : c'est là que se cachent les erreurs de sélecteur.
  const source = racine && racine.innerHTML ? racine.innerHTML : '';
  const attr = sel.match(/\[data-([a-z]+)\]/);
  if (attr) {
    const re = new RegExp('data-' + attr[1] + '="([^"]*)"', 'g');
    return [...source.matchAll(re)].map(m => {
      const n = faireNoeud('auto'); n.dataset[attr[1]] = m[1]; return n;
    });
  }
  const cls = sel.match(/^\.([a-z-]+)/);
  if (cls) {
    const n = (source.match(new RegExp('class="[^"]*' + cls[1] + '[^"]*"', 'g')) || []).length;
    return Array.from({ length: n }, () => faireNoeud('auto'));
  }
  return [];
};
global.escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);
global.showToast = () => {};
global.switchView = () => {};
global.persist = async () => {};
global.confirm = () => true;
global.prompt = () => 'SUPPRIMER';
global.currentView = 'decks';
global.window = { accountUser: null, sb: null };
global.DB = {
  settings: { semesters: [{ id: 's1', label: 'Semestre 1', weeks: 12 }, { id: 'jlpt-n5', label: 'JLPT N5', weeks: 4 }] },
  kanjiGroups: [
    { id: 'kg-1', semesterId: 's1', week: 1, kanji: '支', titre: 'soutenir' },
    { id: 'kg-2', semesterId: 's1', week: 3, kanji: '験', titre: 'épreuve' }
  ],
  scores: {},
  vocab: [
    { id: 'v-1', kanjiGroupId: 'kg-1', mot: '支える', lecture: 'ささえる', sens: 'soutenir' },
    { id: 'v-2', kanjiGroupId: 'kg-2', mot: '試験', lecture: 'しけん', sens: 'examen' }
  ]
};

// decks.js et les scénarios sont évalués ensemble : les « let » de decks.js
// restent enfermés dans leur eval, un scénario évalué à part créerait des
// variables homonymes et testerait du vide (erreur commise le 02/08).
const SOURCE = fs.readFileSync(__dirname + '/../decks.js', 'utf8');
const SCENARIOS = fs.readFileSync(__dirname + '/decks.cases.js', 'utf8');

const cas = [];
global.trouve = trouve;
global.essai = function (nom, fn) {
  try { fn(); cas.push(['OK', nom]); }
  catch (e) { cas.push(['ECHEC', nom + ' -> ' + e.message]); }
};

eval(SOURCE + '\n;' + SCENARIOS);

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
