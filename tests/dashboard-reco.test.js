// Contrôles de la recommandation "Recommandé pour toi" (09/09/2026) :
// repère la semaine déjà faite avec le score le plus faible (sous le seuil
// RECO_SEUIL_FAIBLE), toutes semestres confondus, sans jamais planter sur
// une semaine jamais tentée.
//
// Fonctions pures (aucun DOM) : on extrait le même bloc d'aides sur les
// données qu'utilise déjà tests/kanji-quiz.test.js (il contient déjà
// getScoreEntry/weekKey/getSemester, tous nécessaires ici).
//
// À lancer depuis la racine du dépôt : node tests/dashboard-reco.test.js

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

const CAS = fs.readFileSync(__dirname + '/dashboard-reco.cases.js', 'utf8');
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
