// Garde-fou contre les restes de maquette.
//
// Le 3 août 2026, la page d'accueil affichait en production « 2 136 kanji
// disponibles », « 341 decks publiés » et « 4 802 membres ». Ces trois
// nombres venaient de la maquette Claude Design et n'ont jamais été
// remplacés : accueil.js visait un élément #nbKanji qui n'existait pas dans
// index.html, sortait à sa première ligne, et laissait le HTML inventé en
// place. Personne ne l'a vu parce qu'un chiffre plausible ne ressemble pas à
// un bug.
//
// Ces contrôles vérifient trois choses qu'aucune relecture ne fait
// fiablement : que les constantes de contenu correspondent aux vraies
// données, qu'aucune page servie ne contient de syntaxe de gabarit non
// interprétée, et qu'aucun lien de la page d'accueil ne pointe dans le vide.
//
// À lancer depuis la racine du dépôt : node tests/accueil.test.js

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');

const cas = [];
function essai(nom, fn) {
  try { fn(); cas.push(['OK', nom]); }
  catch (e) { cas.push(['ECHEC', nom + ' — ' + e.message]); }
}

// Toutes les pages HTML réellement servies aux visiteurs.
function pagesHtml(dir = RACINE, sortie = []) {
  for (const nom of fs.readdirSync(dir)) {
    if (nom === '.git' || nom === 'node_modules' || nom === 'tests') continue;
    const p = path.join(dir, nom);
    const st = fs.statSync(p);
    if (st.isDirectory()) pagesHtml(p, sortie);
    else if (nom.endsWith('.html')) sortie.push(path.relative(RACINE, p));
  }
  return sortie;
}

essai('les constantes de contenu correspondent à seed-data.json', () => {
  const seed = JSON.parse(lire('seed-data.json'));
  const src = lire('accueil.js');
  const m = src.match(/const CONTENU = \{\s*kanji:\s*(\d+),\s*mots:\s*(\d+)\s*\}/);
  if (!m) throw new Error('CONTENU introuvable dans accueil.js');
  const kanji = Number(m[1]);
  const mots = Number(m[2]);
  if (kanji !== seed.kanjiGroups.length) {
    throw new Error(`CONTENU.kanji vaut ${kanji}, seed-data.json en a ${seed.kanjiGroups.length}`);
  }
  if (mots !== seed.vocab.length) {
    throw new Error(`CONTENU.mots vaut ${mots}, seed-data.json en a ${seed.vocab.length}`);
  }
});

essai('les trois compteurs de la page d\'accueil ont leur élément', () => {
  const html = lire('index.html');
  for (const id of ['nbKanji', 'nbMots', 'nbDecks']) {
    if (!html.includes(`id="${id}"`)) throw new Error(`#${id} absent d'index.html`);
  }
  const src = lire('accueil.js');
  for (const id of ['nbKanji', 'nbMots', 'nbDecks']) {
    if (!src.includes(`'${id}'`)) throw new Error(`accueil.js ne remplit pas #${id}`);
  }
});

essai('aucun chiffre inventé de la maquette ne subsiste', () => {
  // Les valeurs exactes qui étaient affichées en production, avec l'espace
  // fine insécable du HTML d'origine comme avec une espace ordinaire.
  const interdits = ['2 136', '2 136', '341', '4 802', '4 802'];
  const html = lire('index.html');
  for (const n of interdits) {
    if (html.includes(`>${n}<`)) throw new Error(`la valeur ${n} est écrite en dur dans index.html`);
  }
});

essai('aucune page servie ne contient de gabarit non interprété', () => {
  const fautifs = [];
  for (const page of pagesHtml()) {
    const html = lire(page);
    if (/<sc-[a-z]/.test(html) || /\{\{[^}]*\}\}/.test(html)) fautifs.push(page);
  }
  if (fautifs.length) throw new Error('restes de maquette dans ' + fautifs.join(', '));
});

essai('aucun lien mort dans la page d\'accueil', () => {
  const html = lire('index.html');
  if (/href="#"/.test(html)) throw new Error('un href="#" subsiste : le lien ne mène nulle part');
});

essai('les liens de la page d\'accueil visent des vues connues', () => {
  const html = lire('index.html');
  const app = lire(path.join('app', 'index.html'));
  const vues = new Set(Array.from(app.matchAll(/data-view="([a-z-]+)"/g), m => m[1]));
  for (const m of html.matchAll(/href="\/app\/#([a-z-]+)"/g)) {
    if (!vues.has(m[1])) throw new Error(`#${m[1]} n'est pas une vue de l'app`);
  }
});

essai('l\'app sait ouvrir une ancre connue', () => {
  const src = lire('app.js');
  if (!src.includes('location.hash')) throw new Error('app.js ignore location.hash');
  if (!src.includes('vuesConnues')) throw new Error('aucun filtrage des ancres inconnues');
});

// ---- Barre de navigation partagée (03/08/2026) ----

essai('toutes les pages servies portent la barre de navigation', () => {
  const sans = pagesHtml().filter((p) => !lire(p).includes('kvt-topbar'));
  if (sans.length) throw new Error('pages sans barre : ' + sans.join(', '));
});

essai('toutes les pages servies chargent ui.js', () => {
  const sans = pagesHtml().filter((p) => !lire(p).includes('/ui.js'));
  if (sans.length) throw new Error('pages sans ui.js : ' + sans.join(', '));
});

essai('le logo ramène à la page d\'accueil sur chaque page', () => {
  for (const p of pagesHtml()) {
    const html = lire(p);
    const m = html.match(/<a class="kvt-topbar__brand" href="([^"]+)"/);
    if (!m) throw new Error(`${p} n'a pas de logo cliquable`);
    if (m[1] !== '/') throw new Error(`${p} : le logo pointe sur ${m[1]}`);
  }
});

essai('aucun lien de navigation ne pointe vers une page inexistante', () => {
  const morts = [];
  for (const p of pagesHtml()) {
    for (const m of lire(p).matchAll(/<a[^>]+href="(\/[a-z0-9\-\/]*)"/g)) {
      const cible = m[1].replace(/\/$/, '');
      if (cible === '') continue;
      const dossier = path.join(RACINE, cible);
      const existe = fs.existsSync(path.join(dossier, 'index.html')) || fs.existsSync(dossier);
      if (!existe) morts.push(`${p} -> ${m[1]}`);
    }
  }
  if (morts.length) throw new Error(morts.join(', '));
});

essai('l\'app garde ses boutons de vue après le passage en barre haute', () => {
  const html = lire(path.join('app', 'index.html'));
  const vues = Array.from(html.matchAll(/class="nav-btn[^"]*" data-view="([a-z-]+)"/g), (m) => m[1]);
  for (const attendue of ['communaute', 'dashboard', 'manage', 'decks', 'stats', 'leaderboard', 'maj', 'download', 'account', 'settings']) {
    if (!vues.includes(attendue)) throw new Error(`le bouton ${attendue} a disparu de la navigation`);
  }
  if (html.includes('class="sidebar"')) throw new Error('la colonne latérale est encore là');
});

essai('les animations ne cachent rien sans JavaScript', () => {
  const css = lire('style.css');
  // L'état "caché" doit être conditionné par .js-anim, sinon un visiteur
  // sans JavaScript ne voit jamais le contenu.
  const regles = css.match(/^[^\n@}]*\.kvt-fade\b[^{]*\{/gm) || [];
  const nues = regles.filter((r) => !r.includes('.js-anim'));
  if (nues.length) throw new Error('règle .kvt-fade non conditionnée : ' + nues.join(' | '));
  if (!/prefers-reduced-motion/.test(css)) throw new Error('aucun repli prefers-reduced-motion');
});

essai('un filet montre le contenu si l\'observateur ne se declenche pas', () => {
  const src = lire('ui.js');
  if (!/setTimeout\([\s\S]{0,400}kvt-fade:not\(\.is-shown\)/.test(src)) {
    throw new Error('aucun repli : un contenu anime pourrait rester invisible');
  }
});

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
