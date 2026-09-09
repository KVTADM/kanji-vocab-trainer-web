// Contrôles du filtre "avec/sans verbe de base" (09/09/2026) : distingue un
// verbe de base (kanji + terminaison de conjugaison, ou +する) d'un mot à
// kanji combinés, sans exclure à tort les mots à un seul kanji, les
// adjectifs en -i ou les mots mixtes kanji+hiragana qui ne sont pas des
// verbes (règle validée avec Paul sur un échantillon réel avant
// généralisation — voir 03 - Journal.md du 09/09/2026).
//
// Fonctions pures, aucune dépendance à DB : on extrait juste le bloc dédié
// d'app.js (même motif que tests/kanji-quiz.test.js).
//
// À lancer depuis la racine du dépôt : node tests/verbe-filter.test.js

const fs = require('fs');

const source = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const debut = source.indexOf('// ---------- Filtre "avec/sans verbe de base" (09/09/2026) ----------');
const fin = source.indexOf('// ---------- Mode "Kanji seul" (onyomi/kunyomi) — 09/09/2026 ----------');
if (debut < 0 || fin < 0) { console.log('  ECHEC  bloc du filtre verbe de base introuvable dans app.js'); process.exit(1); }

const cas = [];
global.essai = (nom, fn) => { cas.push({ nom, fn }); };

const CAS = fs.readFileSync(__dirname + '/verbe-filter.cases.js', 'utf8');
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
