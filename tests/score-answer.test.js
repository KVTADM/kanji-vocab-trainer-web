// Contrôles de scoreAnswer()/similarity() (09/09/2026), en particulier le
// support de plusieurs lectures valables séparées par "/" dans les données
// (ex. 門 -> "もん / かど", signalé par Paul après le fix des mots-question
// combinés avec "/" dans "mot" — voir tests/verbe-filter.test.js : deux
// bugs distincts trouvés dans la même chasse, l'un côté question, l'autre
// côté réponse).
//
// Fonctions pures, aucune dépendance au DOM : même bloc "Aides sur les
// données" qu'utilise déjà tests/kanji-quiz.test.js (il contient déjà
// scoreAnswer/similarity/levenshtein).
//
// À lancer depuis la racine du dépôt : node tests/score-answer.test.js

const fs = require('fs');

const source = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const debut = source.indexOf('// ---------- Aides sur les données ----------');
const fin = source.indexOf('// ---------- Import en masse ----------');
if (debut < 0 || fin < 0) { console.log('  ECHEC  bloc des aides sur les données introuvable dans app.js'); process.exit(1); }

global.persist = async () => {};
let DB;
let quizSession;

const cas = [];
global.essai = (nom, fn) => { cas.push({ nom, fn }); };

const CAS = fs.readFileSync(__dirname + '/score-answer.cases.js', 'utf8');
eval(source.slice(debut, fin) + '\n' + CAS);

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
