// Contrôles des pages générées par outils/generer-pages-deck.js.
//
// Ces pages sont la seule partie du site dont le texte existe dans le HTML
// servi, sans exécution de JavaScript. C'est ce qui les rend indexables — et
// c'est aussi ce qui rend une faute d'échappement dangereuse : un titre ou
// un pseudo est du texte écrit par un inconnu, recopié tel quel dans une
// page publique.
//
// Les gabarits sont exercés hors réseau, avec des données choisies. Le
// générateur, lui, n'est jamais lancé ici : il écrirait de vrais fichiers.
//
// À lancer depuis la racine du dépôt : node tests/deck.test.js

const fs = require('fs');
const path = require('path');
const { pageDeck, pageIndex, sitemap } = require('../outils/generer-pages-deck.js');

const cas = [];
function essai(nom, fn) {
  try { fn(); cas.push(['OK', nom]); }
  catch (e) { cas.push(['ECHEC', nom + ' — ' + e.message]); }
}

const DECK = {
  id: 'aaa', slug: 'jlpt-n3', titre: 'JLPT N3', pseudo: 'KVT', officiel: true,
  description: 'Le palier où le japonais bascule.', type: 'jlpt', niveau: 'N3',
  decoupage: 'semaines', nb_semaines: 15, nb_kanji: 367, nb_mots: 683,
  note_moyenne: 4.5, nb_notes: 2
};

// Un deck hostile : tout ce qu'un utilisateur peut écrire, il l'écrira.
const HOSTILE = {
  id: 'bbb', slug: 'test', titre: '<script>alert(1)</script>', pseudo: '"><img src=x onerror=alert(1)>',
  officiel: false, description: '', type: 'cursus', niveau: '', decoupage: 'semaines',
  nb_semaines: 8, nb_kanji: 76, nb_mots: 328, note_moyenne: null, nb_notes: 0
};

essai('le titre et le pseudo ne peuvent pas ouvrir de balise', () => {
  const html = pageDeck(HOSTILE, []);
  // Ce qui est dangereux n'est pas le texte « onerror », c'est le chevron qui
  // ouvre une balise. Un contrôle qui traque le mot-clé plutôt que le
  // mécanisme refuse des pages saines et laisse passer les autres.
  if (html.includes('<script>alert(1)')) throw new Error('le titre ouvre une balise script');
  if (html.includes('<img src=x')) throw new Error('le pseudo ouvre une balise img');
  if (!html.includes('&lt;script&gt;')) throw new Error('le titre devrait apparaître échappé');
});

essai('les données structurées ne peuvent pas fermer leur propre balise', () => {
  // Le piège : `JSON.stringify` produit un JSON parfaitement valide, mais le
  // navigateur cherche la fin de la balise <script> AVANT de lire du JSON.
  // Un titre contenant cette suite de caractères ferait sortir du bloc de
  // données et transformerait la suite en code exécutable.
  const piege = Object.assign({}, DECK, { titre: 'a</script><script>alert(1)</script>' });
  const html = pageDeck(piege, []);
  const blocs = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  if (blocs.length !== 1) throw new Error('la balise de données a été fermée en avance');
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  JSON.parse(m[1]); // doit rester analysable
  if (/<script>alert\(1\)/.test(html)) throw new Error('du code exécutable a été injecté');
});

essai('un avis est échappé lui aussi', () => {
  const html = pageDeck(DECK, [{ deck_id: 'aaa', note: 5, avis: '</p><script>x</script>', pseudo: 'a<b' }]);
  if (html.includes('<script>x</script>')) throw new Error('un avis peut injecter du HTML');
});

essai('une description vide donne un texte factuel, pas une phrase creuse', () => {
  const html = pageDeck(HOSTILE, []);
  if (!/76 kanji et 328 mots/.test(html)) throw new Error('pas de repli factuel sur la description');
  // Le même texte de remplissage sur toutes les pages, c'est exactement ce
  // que Google appelle du contenu à faible valeur.
  const autre = pageDeck(Object.assign({}, HOSTILE, { nb_kanji: 12, nb_mots: 40, slug: 'x' }), []);
  if (html === autre) throw new Error('deux decks différents produisent la même page');
});

essai('la page déclare sa forme canonique', () => {
  const html = pageDeck(DECK, []);
  if (!html.includes('rel="canonical" href="https://kanji-vocab-trainer.netlify.app/deck/jlpt-n3"')) {
    throw new Error('canonical absent ou faux');
  }
});

essai('le contenu est lisible sans JavaScript', () => {
  const html = pageDeck(DECK, []);
  // Le corps de la page, scripts retirés, doit déjà contenir le texte.
  const sansScript = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const attendu of ['JLPT N3', 'Le palier où le japonais bascule', '367', '683']) {
    if (!sansScript.includes(attendu)) throw new Error(`"${attendu}" n'est pas dans le HTML servi`);
  }
});

essai('les données structurées sont un JSON valide', () => {
  const html = pageDeck(DECK, []);
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('pas de données structurées');
  const obj = JSON.parse(m[1]);
  if (obj['@type'] !== 'LearningResource') throw new Error('type inattendu : ' + obj['@type']);
  if (!obj.aggregateRating) throw new Error('un deck noté doit exposer sa note');
});

essai('un deck sans note n\'invente pas de note', () => {
  const html = pageDeck(HOSTILE, []);
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (JSON.parse(m[1]).aggregateRating) throw new Error('note structurée sur un deck jamais noté');
  if (!html.includes('Pas encore noté')) throw new Error('devrait dire qu\'il n\'y a pas d\'avis');
});

essai('aucun lien mort dans une page générée', () => {
  const html = pageDeck(DECK, []) + pageIndex([DECK, HOSTILE]);
  if (/href="#"/.test(html)) throw new Error('un href="#" a été généré');
});

essai('les pages générées portent la barre et chargent ui.js', () => {
  for (const html of [pageDeck(DECK, []), pageIndex([DECK])]) {
    if (!html.includes('kvt-topbar')) throw new Error('barre de navigation absente');
    if (!html.includes('/ui.js')) throw new Error('ui.js absent');
    if (!/<a class="kvt-topbar__brand" href="\/"/.test(html)) throw new Error('logo absent ou mal pointé');
  }
});

essai('l\'index liste tous les decks avec leur adresse', () => {
  const html = pageIndex([DECK, HOSTILE]);
  if (!html.includes('href="/deck/jlpt-n3"')) throw new Error('deck absent de l\'index');
  if (!html.includes('href="/deck/test"')) throw new Error('deck absent de l\'index');
});

essai('le sitemap est un XML bien formé au bon espace de noms', () => {
  const xml = sitemap([DECK]);
  if (!xml.includes('http://www.sitemaps.org/schemas/sitemap/0.9')) {
    throw new Error('espace de noms invalide : Google ignorerait le fichier');
  }
  const ouvertes = (xml.match(/<url>/g) || []).length;
  const fermees = (xml.match(/<\/url>/g) || []).length;
  if (ouvertes !== fermees || !ouvertes) throw new Error('balises <url> déséquilibrées');
  if (!xml.includes('/deck/jlpt-n3')) throw new Error('le deck manque au sitemap');
});

essai('le sitemap ne liste que des pages qui existent', () => {
  const xml = sitemap([]);
  const racine = path.join(__dirname, '..');
  for (const m of xml.matchAll(/<loc>https:\/\/kanji-vocab-trainer\.netlify\.app(\/[^<]*)<\/loc>/g)) {
    const chemin = m[1].replace(/\/$/, '');
    if (chemin === '' || chemin === '/deck') continue; // servies par reecriture ou generees
    const dossier = path.join(racine, chemin);
    if (!fs.existsSync(path.join(dossier, 'index.html'))) {
      throw new Error(chemin + ' est au sitemap mais n\'existe pas');
    }
  }
});

essai('le generateur est branche dans le deploiement', () => {
  const sh = fs.readFileSync(path.join(__dirname, '..', 'deploy.sh'), 'utf8');
  if (!sh.includes('generer-pages-deck.js')) {
    throw new Error('deploy.sh publierait un site sans pages de deck');
  }
  const avantGen = sh.indexOf('generer-pages-deck.js');
  const avantDeploy = sh.indexOf('netlify-cli deploy');
  if (avantGen > avantDeploy) throw new Error('la generation doit passer AVANT la publication');
});

let echecs = 0;
cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
process.exit(echecs ? 1 : 0);
