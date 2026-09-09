// Contrôles du mode "Kana" (hiragana/katakana -> romaji, 09/09/2026) :
// intégrité de la table de référence, file de lecture par groupe, et
// isolation des scores/progression par rapport aux autres modes de quiz
// (DB.scoresKana / DB.inProgressKana ne doivent jamais toucher
// DB.scores / DB.scoresKanji / DB.inProgress / DB.inProgressKanji).
//
// On n'extrait que le bloc de données + fonctions pures d'app.js (pas
// besoin du DOM, même motif que tests/kanji-quiz.test.js).
//
// À lancer depuis la racine du dépôt : node tests/kana-quiz.test.js

const fs = require('fs');

const source = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const debut = source.indexOf('// ---------- Mode "Kana" (hiragana/katakana -> romaji, 09/09/2026) ----------');
const fin = source.indexOf('// Démarre une session sur un groupe de kana');
if (debut < 0 || fin < 0) { console.log('  ECHEC  bloc du mode kana introuvable dans app.js'); process.exit(1); }

global.persist = async () => {};
let DB;
let quizSession;

const cas = [];
global.essai = (nom, fn) => { cas.push({ nom, fn }); };

// Un seul eval pour les données/fonctions extraites ET les scénarios : les
// `const` du bloc extrait (KANA_HIRAGANA, etc.) restent scopés à l'appel
// d'eval qui les déclare — un eval séparé pour les scénarios ne les verrait
// pas (contrairement aux `function`, hoistées hors de l'eval). Même motif
// que tests/gamification.test.js.
const CAS = fs.readFileSync(__dirname + '/kana-quiz.cases.js', 'utf8');
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
