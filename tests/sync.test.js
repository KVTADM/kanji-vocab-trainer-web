// Contrôles de la logique pure de synchronisation cloud (account.js) — voir
// la panne du 29-30/08/2026 (deux semaines de résultats disparues à cause
// d'une reconnexion sur un autre appareil), documentée dans account.js et
// `01 - Décisions techniques.md` (kvt-notes).
//
// Le harnais et les scénarios sont évalués ENSEMBLE dans un seul eval (même
// motif que les autres tests du projet, voir tests/gamification.test.js).
// On ne stub que le strict nécessaire pour que account.js s'évalue sans
// planter : la seule instruction exécutée immédiatement au chargement du
// fichier est l'inscription à onAuthStateChange (tout le reste n'est que
// des déclarations de fonctions, pas exécutées tant qu'on ne les appelle
// pas). Les fonctions testées ici (decisionSyncApresConnexion,
// interpreterReponsePushCloud, faitUneSnapshotHistorique, kvtCleSyncFlag)
// sont pures : aucun accès réseau, DOM ou stockage — d'où l'absence de
// mock Supabase ici (contrairement à ce qu'il faudrait pour tester
// syncAfterLogin ou kvtSnapshotHistorique elles-mêmes, qui font vraiment
// des appels réseau et restent donc vérifiées manuellement).
//
// À lancer depuis la racine du dépôt : node tests/sync.test.js

const fs = require('fs');

global.window = global;
window.sb = { auth: { onAuthStateChange: () => {} } };
global.DB = null;

const cas = [];
global.essai = (nom, fn) => {
  try { fn(); cas.push(['OK', nom]); }
  catch (e) { cas.push(['ECHEC', nom + ' — ' + e.message]); }
};

const SRC = fs.readFileSync('account.js', 'utf8');
const CAS = fs.readFileSync('tests/sync.cases.js', 'utf8');
eval(SRC + '\n' + CAS);

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
