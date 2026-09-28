// Semestres repliables sur le Tableau de bord (28/09/2026, demande de Paul).
// On teste uniquement la persistance localStorage (chargerSemestresReplies /
// sauvegarderSemestresReplies) : c'est la seule logique non triviale, le
// reste (le rendu conditionnel du week-grid dans renderDashboard) est une
// simple branche if/else déjà couverte visuellement à chaque usage de l'app.
//
// Lancer : node tests/semestres-replies.test.js

const fs = require('fs');
const cas = [];
function essai(nom, fn) {
  try { fn(); cas.push(['OK', nom]); }
  catch (e) { cas.push(['ECHEC', nom + ' -> ' + e.message]); }
}

// On n'extrait que le bloc semestresReplies d'app.js : le fichier entier
// dépend du DOM et n'a pas à être chargé pour ça (voir tests/categories.test.js
// pour le même principe).
const source = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const debut = source.indexOf("const KVT_SEMESTRES_REPLIES_CLE = 'kvtSemestresReplies';");
const fin = source.indexOf('const $ = (sel, root) => (root || document).querySelector(sel);');
if (debut < 0 || fin < 0) { console.log('  ECHEC  bloc semestresReplies introuvable dans app.js'); process.exit(1); }

// Mini-stub localStorage (Node n'en fournit pas) : un Map suffit, on veut
// juste vérifier la sérialisation, pas un vrai navigateur.
function fabriquerLocalStorage(stockageInitial) {
  const magasin = new Map(Object.entries(stockageInitial || {}));
  return {
    getItem: (cle) => (magasin.has(cle) ? magasin.get(cle) : null),
    setItem: (cle, valeur) => { magasin.set(cle, String(valeur)); },
    removeItem: (cle) => { magasin.delete(cle); },
    _magasin: magasin
  };
}
global.localStorage = fabriquerLocalStorage();

eval(source.slice(debut, fin));

essai('sans rien en localStorage, la liste des semestres repliés est vide', () => {
  global.localStorage = fabriquerLocalStorage();
  const s = chargerSemestresReplies();
  if (!(s instanceof Set) || s.size !== 0) throw new Error('attendu un Set vide, reçu ' + JSON.stringify([...s]));
});

essai('une liste JSON valide en localStorage est reprise telle quelle', () => {
  global.localStorage = fabriquerLocalStorage({ kvtSemestresReplies: JSON.stringify(['s1', 'jlpt-n5']) });
  const s = chargerSemestresReplies();
  if (s.size !== 2 || !s.has('s1') || !s.has('jlpt-n5')) throw new Error('contenu inattendu : ' + JSON.stringify([...s]));
});

essai('du JSON corrompu ne fait pas planter, juste un Set vide (pas de crash au chargement du Tableau de bord)', () => {
  global.localStorage = fabriquerLocalStorage({ kvtSemestresReplies: '{ceci n\'est pas du JSON' });
  const s = chargerSemestresReplies();
  if (!(s instanceof Set) || s.size !== 0) throw new Error('attendu un repli silencieux vers un Set vide');
});

essai('une valeur JSON valide mais qui n\'est pas un tableau (ex. un objet) ne fait pas non plus planter', () => {
  global.localStorage = fabriquerLocalStorage({ kvtSemestresReplies: JSON.stringify({ pas: 'un tableau' }) });
  const s = chargerSemestresReplies();
  if (!(s instanceof Set) || s.size !== 0) throw new Error('attendu un Set vide face à une forme inattendue');
});

// `semestresReplies` (le `let` interne d'app.js) vit dans la portée propre
// de l'eval ci-dessus, invisible depuis ce fichier de test (règle ES6 : un
// `let`/`const` évalué ne fuit jamais vers l'appelant, contrairement à un
// `function`/`var` en mode non strict) -- on ne peut donc pas le manipuler
// directement d'ici. On vérifie plutôt le cycle complet lecture -> écriture
// -> relecture : localStorage pré-rempli, chargé au moment de l'eval, puis
// immédiatement resauvegardé et relu, pour confirmer que la sérialisation
// aller-retour ne perd ni ne déforme rien.
essai('un cycle chargement -> sauvegarde -> rechargement ne perd rien', () => {
  const brut = JSON.stringify(['s2', 'deck-venu']);
  global.localStorage = fabriquerLocalStorage({ kvtSemestresReplies: brut });
  eval(source.slice(debut, fin)); // ré-évalue avec ce localStorage : semestresReplies interne = {s2, deck-venu}
  sauvegarderSemestresReplies();
  if (global.localStorage.getItem('kvtSemestresReplies') !== brut) {
    throw new Error('la resauvegarde a modifié les données : ' + global.localStorage.getItem('kvtSemestresReplies'));
  }
  const relu = chargerSemestresReplies();
  if (relu.size !== 2 || !relu.has('s2') || !relu.has('deck-venu')) throw new Error('aller-retour perdu : ' + JSON.stringify([...relu]));
});

essai('sauvegarderSemestresReplies ne plante pas si localStorage est indisponible (navigation privée, quota)', () => {
  global.localStorage = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); } };
  semestresReplies = new Set(['s1']);
  sauvegarderSemestresReplies(); // ne doit pas lever
});

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
