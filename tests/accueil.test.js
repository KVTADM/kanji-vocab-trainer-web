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
// Le 3 août au soir, la cause profonde est apparue : cette page en double
// n'aurait jamais dû exister. La page d'accueil était devenue le premier
// onglet de l'app (`communaute.js`), mais l'`index.html` de la maquette était
// resté à la racine et rendait les mêmes cinq sections avec un second code.
// C'est la version morte que voyaient les visiteurs. Les deux fichiers ont
// été supprimés et la racine sert désormais l'app.
//
// Ces contrôles vérifient ce qu'aucune relecture ne fait fiablement :
// qu'aucune page servie ne contient de syntaxe de gabarit non interprétée,
// qu'aucun lien ne pointe dans le vide, et qu'une seule page d'accueil
// existe.
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

essai('une seule page d\'accueil existe', () => {
  if (fs.existsSync(path.join(RACINE, 'index.html'))) {
    throw new Error('index.html est revenu a la racine : deuxieme page d\'accueil');
  }
  if (fs.existsSync(path.join(RACINE, 'accueil.js'))) {
    throw new Error('accueil.js est revenu : deuxieme rendu de la page d\'accueil');
  }
  if (!lire('communaute.js').includes('renderCommunaute')) {
    throw new Error('communaute.js ne rend plus la page d\'accueil');
  }
});

essai('la racine sert bien l\'application', () => {
  const toml = lire('netlify.toml');
  if (!/from = "\/"\s*\n\s*to = "\/app\/index\.html"\s*\n\s*status = 200/.test(toml)) {
    throw new Error('aucune reecriture de / vers l\'app : la racine renverrait un 404');
  }
});

essai('la page servie a deux adresses declare une seule forme canonique', () => {
  const html = lire(path.join('app', 'index.html'));
  const m = html.match(/rel="canonical" href="([^"]+)"/);
  if (!m) throw new Error('pas de canonical : / et /app/ seraient deux pages pour Google');
  if (!/netlify\.app\/$/.test(m[1])) throw new Error('la forme canonique doit etre la racine, pas ' + m[1]);
});

essai('le service worker ne garde pas en cache des fichiers supprimes', () => {
  const sw = lire('service-worker.js');
  for (const mort of ['/index.html', '/accueil.js']) {
    if (sw.includes("'" + mort + "'")) throw new Error(sw + ' met en cache ' + mort + ', qui n\'existe plus');
  }
  // Un asset absent fait echouer `cache.addAll` en entier : l'app perdrait
  // tout son fonctionnement hors connexion, silencieusement.
  const listes = sw.match(/const ASSETS = \[([\s\S]*?)\]/);
  for (const m of listes[1].matchAll(/'(\/[^']*)'/g)) {
    const rel = m[1] === '/' || m[1].endsWith('/') ? null : m[1].slice(1);
    if (rel && !fs.existsSync(path.join(RACINE, rel))) {
      throw new Error('le cache liste ' + m[1] + ', absent du dossier');
    }
  }
});

essai('un seul ascenseur par page', () => {
  const css = lire('style.css');
  const app = css.match(/\.app \{[^}]*\}/);
  if (!app) throw new Error('.app introuvable');
  // `min-height` est justement la bonne forme : c'est `height` seul qui
  // enferme. Le controle doit faire la difference, sinon il refuse le correctif.
  if (/overflow:\s*hidden/.test(app[0]) || /(^|[^-])height:\s*100vh/m.test(app[0])) {
    throw new Error('.app enferme la page : la fenetre et .content defileraient tous les deux');
  }
  const content = css.match(/\.content \{[^}]*\}/);
  if (/overflow-y:\s*auto/.test(content[0])) throw new Error('.content defile en plus de la fenetre');
});

essai('le menu deroulant n\'est rogne par aucun conteneur', () => {
  const css = lire('style.css');
  const nav = css.match(/\.kvt-topbar__nav \{[^}]*\}/);
  if (!nav) throw new Error('.kvt-topbar__nav introuvable');
  if (/overflow/.test(nav[0])) {
    throw new Error('overflow sur .kvt-topbar__nav : le menu Plus serait invisible sous le bord');
  }
});

essai('le logo ne fait pas doublon avec un bouton Accueil', () => {
  const html = lire(path.join('app', 'index.html'));
  if (/data-view="communaute"/.test(html)) {
    throw new Error('le bouton Accueil est revenu alors que le logo le remplace');
  }
  if (!lire('app.js').includes("vuesConnues.add('communaute')")) {
    throw new Error('sans bouton, communaute doit etre ajoutee a la main aux vues connues');
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
  for (const attendue of ['dashboard', 'manage', 'decks', 'stats', 'leaderboard', 'maj', 'download', 'account', 'settings']) {
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

// ---- Nouvelles vues du 04/08/2026 ----

essai('les nouvelles vues sont declarees, chargees et routees', () => {
  const html = lire(path.join('app', 'index.html'));
  const appjs = lire('app.js');
  const sw = lire('service-worker.js');
  for (const [vue, fichier, rendu] of [
    ['creation', '/creation.js', 'renderCreation'],
    ['profil', '/profil-public.js', 'renderProfilPublic']
  ]) {
    if (!html.includes('id="view-' + vue + '"')) throw new Error('section view-' + vue + ' absente');
    if (!html.includes('src="' + fichier + '"')) throw new Error(fichier + ' non charge');
    if (!appjs.includes(rendu)) throw new Error(rendu + ' non branche dans renderCurrentView');
    if (!sw.includes("'" + fichier + "'")) throw new Error(fichier + ' absent du cache hors connexion');
  }
});

essai('la creation a sa propre categorie, separee du vocabulaire', () => {
  const html = lire(path.join('app', 'index.html'));
  if (!/data-view="creation"/.test(html)) throw new Error('pas de bouton Creation dans la barre');
  const posVocab = html.indexOf('data-view="manage"');
  const posCrea = html.indexOf('data-view="creation"');
  if (posCrea < posVocab) throw new Error('Creation devrait suivre Vocabulaire, pas le preceder');
});

essai('un auteur affiche quelque part mene a son profil', () => {
  const src = lire('profils.js');
  if (!src.includes('data-voir-profil')) throw new Error('le bloc auteur n\'est pas cliquable');
  // Un ecouteur pose sur chaque bloc a chaque rendu finirait par en empiler
  // des centaines : la delegation au document est le seul moyen tenable.
  if (!/document\.addEventListener\('click'/.test(src)) {
    throw new Error('le clic devrait etre delegue au document, pas rebranche a chaque rendu');
  }
});

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
