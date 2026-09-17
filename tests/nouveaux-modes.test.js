// Contrôles des 3 nouveaux modes (17/09/2026) : Écriture (stateless, sans
// notation), Traduction (français -> japonais, kanji OU kana accepté) et
// Vocabulaire pratique (compteurs/couleurs/heure). Isolation des scores et
// de la progression par rapport aux autres modes (DB.scoresTraduction /
// DB.inProgressTraduction / DB.scoresPratique / DB.inProgressPratique ne
// doivent jamais toucher DB.scores / DB.scoresKanji / DB.scoresKana / leurs
// équivalents inProgress).
//
// Extraction plus large que kana-quiz.test.js : ces 3 modes s'appuient sur
// des fonctions définies plus tôt dans app.js (getVocabForWeek,
// filtrerVocabParVerbe, scoreAnswer, weekKey, getSemester, shuffle...),
// contrairement au mode Kana qui est entièrement autonome. On extrait donc
// depuis juste après les déclarations `let`/`const $` de tête de fichier
// (pour ne pas les redéclarer en double avec celles ci-dessous) jusqu'à
// juste avant renderReview() -- uniquement des `function`/`const` purs,
// jamais exécutés au chargement, donc sans dépendance au DOM tant qu'on
// n'appelle pas les fonctions de rendu (non testées ici, comme pour les
// autres modes).
//
// À lancer depuis la racine du dépôt : node tests/nouveaux-modes.test.js

const fs = require('fs');

const source = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const debut = source.indexOf('function uid(prefix) {');
const fin = source.indexOf('function renderReview() {');
if (debut < 0 || fin < 0) { console.log('  ECHEC  bloc des nouveaux modes introuvable dans app.js'); process.exit(1); }

global.persist = async () => { global.persistCalls = (global.persistCalls || 0) + 1; };
let DB;
let quizSession;

const cas = [];
global.essai = (nom, fn) => { cas.push({ nom, fn }); };

// Un seul eval pour le bloc extrait ET les scénarios, même motif que
// tests/kana-quiz.test.js et tests/masquage.test.js : les `const` du bloc
// extrait (PRATIQUE_VOCAB, etc.) restent scopés à cet appel d'eval.
const CAS = fs.readFileSync(__dirname + '/nouveaux-modes.cases.js', 'utf8');
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
