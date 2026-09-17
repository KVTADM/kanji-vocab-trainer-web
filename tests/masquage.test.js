// Masquage personnel de mots (17/09/2026) : remplace l'ancien "Suppr."
// definitif par un masquage reversible (demande de Paul, "03 - Journal.md"
// du 17/09/2026). Fonctions extraites d'app.js entre les memes reperes que
// tests/kanji-quiz.test.js / tests/verbe-filter.test.js.
//
// persist() n'est pas extrait (il appelle window.api.saveData, hors sujet
// ici) : on fournit une version locale qui compte juste ses appels, resolue
// par la chaine de portee normale du eval ci-dessous (meme motif que les
// autres tests du projet, voir tests/sync.test.js).
//
// A lancer depuis la racine du depot : node tests/masquage.test.js

const fs = require('fs');

let persistCalls = 0;
async function persist() { persistCalls++; }

const source = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const debut = source.indexOf('// ---------- Aides sur les données ----------');
const fin = source.indexOf('// ---------- Filtre "avec/sans verbe de base" (09/09/2026) ----------');
if (debut < 0 || fin < 0) { console.log('  ECHEC  bloc "Aides sur les donnees" introuvable dans app.js'); process.exit(1); }
eval(source.slice(debut, fin));

const cas = [];
function essai(nom, fn) { cas.push({ nom, fn }); }

function faireDB() {
  return {
    motsMasques: [],
    kanjiGroups: [
      { id: 'g1', semesterId: 's1', week: 1, kanji: '水' },
      { id: 'g2', semesterId: 's1', week: 1, kanji: '火' }
    ],
    vocab: [
      { id: 'v1', kanjiGroupId: 'g1', mot: '水曜日', lecture: 'すいようび', sens: 'mercredi' },
      { id: 'v2', kanjiGroupId: 'g1', mot: '水', lecture: 'みず', sens: 'eau' },
      { id: 'v3', kanjiGroupId: 'g2', mot: '火曜日', lecture: 'かようび', sens: 'mardi' }
    ]
  };
}

essai('un mot fraichement importe n\'est pas masque', () => {
  DB = faireDB();
  if (estMotMasque('v1')) throw new Error('devrait etre visible par defaut');
});

essai('masquer un mot le retire de getVocabForGroup', async () => {
  DB = faireDB();
  await masquerMot('v2');
  const liste = getVocabForGroup('g1').map(v => v.id);
  if (liste.includes('v2')) throw new Error('v2 encore visible dans le groupe apres masquage');
  if (!liste.includes('v1')) throw new Error('v1 ne devrait pas etre touche');
});

essai('masquer un mot le retire de getVocabForWeek (donc des quiz)', async () => {
  DB = faireDB();
  await masquerMot('v1');
  const liste = getVocabForWeek('s1', 1).map(v => v.id);
  if (liste.includes('v1')) throw new Error('v1 encore dans la semaine apres masquage');
  if (!liste.includes('v2') || !liste.includes('v3')) throw new Error('les autres mots ne devraient pas etre touches');
});

essai('masquer est idempotent (ne duplique pas l\'id)', async () => {
  DB = faireDB();
  await masquerMot('v1');
  await masquerMot('v1');
  if (DB.motsMasques.filter(id => id === 'v1').length !== 1) throw new Error('v1 duplique dans motsMasques');
});

essai('demasquer restaure le mot dans getVocabForWeek', async () => {
  DB = faireDB();
  await masquerMot('v1');
  await demasquerMot('v1');
  const liste = getVocabForWeek('s1', 1).map(v => v.id);
  if (!liste.includes('v1')) throw new Error('v1 devrait etre revenu apres demasquage');
});

essai('demasquer un mot jamais masque ne plante pas', async () => {
  DB = faireDB();
  await demasquerMot('v1');
  if (DB.motsMasques.length !== 0) throw new Error('motsMasques ne devrait pas bouger');
});

essai('motsMasquesDetails ne renvoie que les mots masques, avec leur kanjiGroup', async () => {
  DB = faireDB();
  await masquerMot('v2');
  const details = motsMasquesDetails();
  if (details.length !== 1 || details[0].id !== 'v2') throw new Error('devrait ne contenir que v2');
  if (!details[0].kanjiGroup || details[0].kanjiGroup.id !== 'g1') throw new Error('kanjiGroup attache manquant ou faux');
});

essai('masquer un mot ne touche pas DB.vocab (pas une suppression de donnees)', async () => {
  DB = faireDB();
  const avant = DB.vocab.length;
  await masquerMot('v1');
  if (DB.vocab.length !== avant) throw new Error('DB.vocab n\'aurait pas du changer de taille');
  if (!DB.vocab.some(v => v.id === 'v1')) throw new Error('v1 devrait toujours exister dans DB.vocab');
});

essai('masquer/demasquer appellent bien persist()', async () => {
  DB = faireDB();
  const avant = persistCalls;
  await masquerMot('v1');
  await demasquerMot('v1');
  if (persistCalls !== avant + 2) throw new Error('persist() aurait du etre appele 2 fois, appele ' + (persistCalls - avant) + ' fois');
});

essai('un compte sans motsMasques (avant migration) ne fait rien planter', () => {
  DB = faireDB();
  delete DB.motsMasques;
  if (estMotMasque('v1')) throw new Error('devrait etre false sans exception');
  const liste = getVocabForWeek('s1', 1).map(v => v.id);
  if (liste.length !== 3) throw new Error('tous les mots devraient rester visibles sans motsMasques');
});

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
