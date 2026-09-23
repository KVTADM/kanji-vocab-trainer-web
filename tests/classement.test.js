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
global.switchView = () => {};
global.formatDuree = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min === 0 ? `${sec} s` : `${min} min ${String(sec).padStart(2, '0')} s`;
};
// Copie fidele de app.js (voir scoreComposite / positionSemestre / KVT_*) --
// leaderboard.js les appelle comme des globales fournies par app.js, qui
// n'est pas charge dans ce test isole.
const KVT_DUREE_REF_MS = 10 * 60 * 1000;
const KVT_ESSAIS_REF = 5;
const KVT_MODE_DIFFICULTE = { vocab: 0.4, traduction: 0.6, double: 0.8, kanji: 1.0 };
global.positionSemestre = (semesterId) => {
  const ordre = (DB.settings.semesters || []).map(s => s.id);
  const i = ordre.indexOf(semesterId);
  if (i === -1 || ordre.length < 2) return 0.5;
  return i / (ordre.length - 1);
};
global.scoreComposite = ({ pct, dureeMs, essais, semesterId, mode }) => {
  const precision = Math.max(0, Math.min(1, (Number(pct) || 0) / 100));
  const vitesse = Number.isFinite(dureeMs) && dureeMs > 0
    ? Math.max(0, Math.min(1, 1 - dureeMs / KVT_DUREE_REF_MS))
    : 0.5;
  const assiduite = Math.max(0, Math.min(1, (Number(essais) || 0) / KVT_ESSAIS_REF));
  const difficulteMode = KVT_MODE_DIFFICULTE[mode] != null ? KVT_MODE_DIFFICULTE[mode] : 0.5;
  const difficulte = 0.7 * global.positionSemestre(semesterId) + 0.3 * difficulteMode;
  const score = 0.5 * precision + 0.2 * vitesse + 0.15 * assiduite + 0.15 * difficulte;
  return Math.round(score * 100);
};
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
