// Catégories libres du tableau de bord. On teste la logique de rangement,
// pas le rendu : c'est là que se joue le risque réel (un semestre qui
// disparaît, ou qui apparaît dans deux onglets).
//
// Lancer : node tests/categories.test.js

const fs = require('fs');
const cas = [];
function essai(nom, fn) {
  try { fn(); cas.push(['OK', nom]); }
  catch (e) { cas.push(['ECHEC', nom + ' -> ' + e.message]); }
}

// On n'extrait que les fonctions de catégories d'app.js : le fichier entier
// dépend du DOM et n'a pas à être chargé pour ça.
const source = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const debut = source.indexOf('function categoriesLibres()');
const fin = source.indexOf('// ============================================================\n// Accueil');
if (debut < 0 || fin < 0) { console.log('  ECHEC  bloc des catégories introuvable dans app.js'); process.exit(1); }

global.uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);
global.showToast = () => {};
global.persist = async () => {};
global.renderDashboard = () => {};
global.prompt = () => reponsePrompt;
global.confirm = () => reponseConfirm;
let reponsePrompt = '';
let reponseConfirm = true;
let dashboardMode = 'cursus';
let DB;

eval(source.slice(debut, fin));

function base() {
  return {
    settings: {
      categories: [],
      semesters: [
        { id: 's1', label: 'Semestre 1', weeks: 12 },
        { id: 's2', label: 'Semestre 2', weeks: 12 },
        { id: 'jlpt-n5', label: 'JLPT N5', weeks: 4 },
        { id: 'deck-venu', label: "Venu d'ailleurs", weeks: 3, importe: true, auteur: 'Hana' }
      ]
    }
  };
}

essai('sans catégorie créée, tout est réparti entre Cursus et JLPT', () => {
  DB = base();
  const par = DB.settings.semesters.map(categorieDuSemestre).join(',');
  if (par !== 'cursus,cursus,jlpt,cursus') throw new Error(par);
});

essai('un onglet vide ne s\'affiche pas, sauf Cursus', () => {
  DB = base();
  DB.settings.semesters = [{ id: 's1', label: 'S1', weeks: 12 }];
  dashboardMode = 'cursus';
  const ids = ongletsDashboard().map(o => o.id).join(',');
  if (ids !== 'cursus') throw new Error('onglets = ' + ids);
});

essai('créer une catégorie et y ranger un semestre', async () => {
  DB = base();
  reponsePrompt = 'Deuxième année';
  creerCategorie();
  if (DB.settings.categories.length !== 1) throw new Error('catégorie non créée');
  const id = DB.settings.categories[0].id;
  rangerSemestre('s2', id);
  if (categorieDuSemestre(DB.settings.semesters[1]) !== id) throw new Error('semestre non rangé');
  // et il a bien quitté Cursus
  const dansCursus = DB.settings.semesters.filter(s => categorieDuSemestre(s) === 'cursus').map(s => s.id).join(',');
  if (dansCursus.includes('s2')) throw new Error('le semestre est dans deux onglets à la fois');
});

essai('un semestre n\'apparaît que dans un seul onglet', () => {
  DB = base();
  DB.settings.categories = [{ id: 'cat-x', label: 'X' }];
  DB.settings.semesters.forEach(s => { s.categorie = 'cat-x'; });
  dashboardMode = 'cat-x';
  const compte = {};
  DB.settings.semesters.forEach(s => {
    const c = categorieDuSemestre(s);
    compte[c] = (compte[c] || 0) + 1;
  });
  if (Object.keys(compte).join(',') !== 'cat-x') throw new Error('réparti sur ' + Object.keys(compte).join(','));
  if (compte['cat-x'] !== 4) throw new Error('semestres perdus : ' + compte['cat-x']);
});

essai('supprimer une catégorie ne supprime aucun semestre', () => {
  DB = base();
  DB.settings.categories = [{ id: 'cat-x', label: 'X' }];
  DB.settings.semesters[1].categorie = 'cat-x';
  reponseConfirm = true;
  supprimerCategorie('cat-x');
  if (DB.settings.semesters.length !== 4) throw new Error('des semestres ont disparu');
  if (DB.settings.categories.length !== 0) throw new Error('catégorie non supprimée');
  if (DB.settings.semesters[1].categorie) throw new Error('rattachement fantôme conservé');
  if (categorieDuSemestre(DB.settings.semesters[1]) !== 'cursus') throw new Error('le semestre n\'est pas revenu dans Cursus');
});

essai('un rattachement à une catégorie disparue est ignoré', () => {
  DB = base();
  DB.settings.categories = [];
  DB.settings.semesters[0].categorie = 'cat-fantome';
  if (categorieDuSemestre(DB.settings.semesters[0]) !== 'cursus') throw new Error('semestre injoignable');
});

essai('refuser une catégorie en double', () => {
  DB = base();
  reponsePrompt = 'Révisions';
  creerCategorie();
  reponsePrompt = 'révisions';
  creerCategorie();
  if (DB.settings.categories.length !== 1) throw new Error('doublon accepté');
});

essai('un nom vide ne crée rien', () => {
  DB = base();
  reponsePrompt = '   ';
  creerCategorie();
  if (DB.settings.categories.length !== 0) throw new Error('catégorie vide créée');
});

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
