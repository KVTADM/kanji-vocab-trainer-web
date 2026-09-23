// Controles de la reparation automatique des groupes de kanji potentiellement
// supprimes par erreur (webapi.js, 23/09/2026) -- voir le commentaire de
// reparerGroupesManquants() dans webapi.js pour le contexte complet (bouton
// "Supprimer ce kanji" retire le meme jour : aucune confirmation n'existait
// avant une suppression definitive et irreversible du groupe ET de tout son
// vocabulaire).
//
// webapi.js s'execute dans une IIFE qui ne pose que `window.api` en sortie ;
// on mocke `indexedDB` et `fetch` AVANT de l'evaluer, meme principe que
// tests/sync.test.js (mocker le strict necessaire pour que le fichier
// s'evalue sans planter). `global.window = global` fait de `window.api =`
// une simple affectation sur l'objet global, relue ensuite via
// `window.api.loadData()`.
//
// A lancer depuis la racine du depot : node tests/webapi.test.js

const fs = require('fs');

global.window = global;

// ---- Fausse IndexedDB : un seul Map partage, en memoire pour la duree du
// test, qui persiste entre plusieurs appels a loadData() -- comme le ferait
// le stockage d'un vrai navigateur entre deux chargements de la page. Chaque
// scenario le remet a zero lui-meme avant de s'en servir (fakeStockage.clear()). ----
const fakeStockage = new Map();
global.indexedDB = {
  open() {
    const req = {};
    Promise.resolve().then(() => {
      const fakeDb = {
        objectStoreNames: { contains: () => true },
        transaction() {
          const tx = {};
          const objectStore = {
            get(key) {
              const r = {};
              Promise.resolve().then(() => {
                r.result = fakeStockage.get(key);
                if (r.onsuccess) r.onsuccess();
              });
              return r;
            },
            put(value, key) {
              fakeStockage.set(key, value);
              return {};
            }
          };
          tx.objectStore = () => objectStore;
          Promise.resolve().then(() => { if (tx.oncomplete) tx.oncomplete(); });
          return tx;
        }
      };
      req.result = fakeDb;
      if (req.onsuccess) req.onsuccess();
    });
    return req;
  }
};

// ---- Faux /seed-data.json : un groupe S3 deja present (kg-test-s3-a), un
// groupe S3 manquant a restaurer (kg-test-s3-b) et un groupe hors perimetre
// (jlpt-n5) qui ne doit JAMAIS etre restaure par reparerGroupesManquants
// (limitee a s1-s4, voir SEMESTRES_REPARABLES dans webapi.js). ----
const SEED_FAKE = {
  kanjiGroups: [
    { id: 'kg-test-s3-a', semesterId: 's3', week: 2, kanji: '硬', titre: 'dur' },
    { id: 'kg-test-s3-b', semesterId: 's3', week: 2, kanji: '柔', titre: 'mou' },
    { id: 'kg-test-jlpt', semesterId: 'jlpt-n5', week: 1, kanji: '猫', titre: 'chat' }
  ],
  vocab: [
    { id: 'v-test-a1', kanjiGroupId: 'kg-test-s3-a', mot: '硬い', lecture: 'かたい', sens: 'dur' },
    { id: 'v-test-b1', kanjiGroupId: 'kg-test-s3-b', mot: '柔らかい', lecture: 'やわらかい', sens: 'mou' },
    { id: 'v-test-jlpt1', kanjiGroupId: 'kg-test-jlpt', mot: '猫', lecture: 'ねこ', sens: 'chat' }
  ]
};
global.fetch = async (url) => {
  if (url !== '/seed-data.json') throw new Error('URL inattendue demandee par le test : ' + url);
  return { json: async () => JSON.parse(JSON.stringify(SEED_FAKE)) };
};

// Donnee locale de depart, comme un compte deja existant dans le navigateur :
// ne contient QUE kg-test-s3-a -- kg-test-s3-b est "le kanji supprime par
// erreur" a retrouver.
function donneeDeBase() {
  return {
    version: 1,
    settings: { semesters: [{ id: 's3', label: 'Semestre 3', weeks: 12 }], categories: [], theme: 'dark' },
    kanjiGroups: [
      { id: 'kg-test-s3-a', semesterId: 's3', week: 2, kanji: '硬', titre: 'dur' }
    ],
    vocab: [
      { id: 'v-test-a1', kanjiGroupId: 'kg-test-s3-a', mot: '硬い', lecture: 'かたい', sens: 'dur' }
    ],
    motsMasques: [], wordStats: {}, inProgress: {}, scores: {}
  };
}

const cas = [];
global.essai = (nom, fn) => cas.push({ nom, fn });

const SRC = fs.readFileSync(__dirname + '/../webapi.js', 'utf8');
const CAS = fs.readFileSync(__dirname + '/webapi.cases.js', 'utf8');
eval(SRC + '\n' + CAS);

(async () => {
  const resultats = [];
  for (const { nom, fn } of cas) {
    try { await fn(); resultats.push(['OK', nom]); }
    catch (e) { resultats.push(['ECHEC', nom + ' -> ' + (e && e.message ? e.message : e)]); }
  }
  resultats.forEach(([statut, nom]) => console.log(`  ${statut}  ${nom}`));
  const ok = resultats.filter(r => r[0] === 'OK').length;
  console.log(`\n  ${ok}/${resultats.length} passent`);
  process.exit(ok === resultats.length ? 0 : 1);
})();
