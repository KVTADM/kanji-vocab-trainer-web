// Controles du Classeur de kanji (coffres, raretes, collection) :
// classeur.js + donnees de classeur-data.js.
// A lancer depuis la racine du depot : node tests/classeur.test.js

const fs = require('fs');
global.window = {};
eval(fs.readFileSync(__dirname + '/../classeur-data.js', 'utf8'));
global.KVT_CLASSEUR_DATA = window.KVT_CLASSEUR_DATA;

let DB;
function assurerGamification() { if (!DB.gamification) DB.gamification = { pieces: 0, xp: 0 }; return DB.gamification; }
global.assurerGamification = assurerGamification;
global.showToast = () => {};
global.persist = () => {};
global.escapeHtml = s => String(s);
global.iconePiece = () => '';

const src = fs.readFileSync(__dirname + '/../classeur.js', 'utf8');
const finLogique = src.indexOf('// ---------- Page « Classeur » ----------');
if (finLogique < 0) { console.log('  ECHEC  bloc de logique introuvable dans classeur.js'); process.exit(1); }
// Les "let/const" du bloc sont locaux a eval : on les expose via globalThis.
const exportes = src.slice(0, finLogique) + `
globalThis.C = { CLASSEUR_RARETES, CLASSEUR_COFFRES, CLASSEUR_NIVEAUX, classeurRareteDepuisRang, classeurTousLesKanji, classeurParRarete, classeurTirer, classeurOuvrirCoffre, classeurProgression, classeurChances, classeurEtat };`;
eval(exportes);

const cas = [];
global.essai = (nom, fn) => { cas.push({ nom, fn }); };
eval(fs.readFileSync(__dirname + '/classeur.cases.js', 'utf8'));

(async () => {
  const resultats = [];
  for (const { nom, fn } of cas) {
    try { DB = { gamification: { pieces: 0, xp: 0 } }; await fn(); resultats.push(['OK', nom]); }
    catch (e) { resultats.push(['ECHEC', nom + ' -> ' + e.message]); }
  }
  resultats.forEach(([s, n]) => console.log(`  ${s}  ${n}`));
  const ok = resultats.filter(r => r[0] === 'OK').length;
  console.log(`\n  ${ok}/${resultats.length} passent`);
  process.exit(ok === resultats.length ? 0 : 1);
})();
