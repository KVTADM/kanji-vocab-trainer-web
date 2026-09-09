// Contrôles du mode "Kanji seul" (onyomi/kunyomi, 09/09/2026) : file de
// lecture, notation, et isolation des scores/progression par rapport au
// quiz vocabulaire existant (DB.scoresKanji / DB.inProgressKanji ne
// doivent jamais toucher DB.scores / DB.inProgress).
//
// On n'extrait que le bloc de fonctions pures d'app.js (aides sur les
// données + scoreAnswer/similarity/levenshtein) : pas besoin du DOM pour
// ça (même motif que tests/categories.test.js).
//
// À lancer depuis la racine du dépôt : node tests/kanji-quiz.test.js

const fs = require('fs');

const source = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const debut = source.indexOf('// ---------- Aides sur les données ----------');
const fin = source.indexOf('// ---------- Import en masse ----------');
if (debut < 0 || fin < 0) { console.log('  ECHEC  bloc des aides sur les données introuvable dans app.js'); process.exit(1); }

global.persist = async () => {};
let DB;
let quizSession;

eval(source.slice(debut, fin));

const cas = [];
global.essai = (nom, fn) => { cas.push({ nom, fn }); };

const SRC = fs.readFileSync(__dirname + '/kanji-quiz.cases.js', 'utf8');
eval(SRC);

(async () => {
  const resultats = [];
  for (const { nom, fn } of cas) {
    try {
      await fn();
      resultats.push(['OK', nom]);
    } catch (e) {
      resultats.push(['ECHEC', nom + ' -> ' + e.message]);
    }
  }
  resultats.forEach(([statut, nom]) => console.log(`  ${statut}  ${nom}`));
  const ok = resultats.filter(r => r[0] === 'OK').length;
  console.log(`\n  ${ok}/${resultats.length} passent`);
  process.exit(ok === resultats.length ? 0 : 1);
})();
