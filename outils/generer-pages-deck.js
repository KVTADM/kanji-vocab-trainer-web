// ============================================================
// Génère une vraie page HTML par deck publié : /deck/<slug>/
//
// Pourquoi une génération, et pas une page unique qui charge le deck en
// JavaScript. Deux raisons, et la seconde est la vraie.
//
//   1. Partage. Un deck vivait dans l'app et n'avait aucune adresse : on ne
//      pouvait pas l'envoyer à quelqu'un par un lien.
//   2. Indexation. Tout le reste du site est fabriqué dans le navigateur.
//      Un robot qui demande la page reçoit un squelette vide : les decks,
//      les avis, les descriptions n'existent pour lui nulle part. Écrire
//      plus de contenu communautaire n'y change rien tant qu'il est produit
//      côté client. Ces pages-ci contiennent le texte dans le HTML servi.
//
// Dix decks partagés font dix pages réellement lisibles. C'est le meilleur
// rapport effort/résultat pour rendre le site indexable, et ça ne demande
// aucun bundler : un script Node lancé avant le déploiement.
//
// Lancement (fait automatiquement par deploy.sh) :
//   node outils/generer-pages-deck.js
//
// La clé utilisée est la clé publique `anon`, la même que le navigateur.
// Les politiques RLS ne laissent lire que les decks visibles : ce script ne
// peut rien voir qu'un visiteur ne verrait pas.
// ============================================================

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const SITE = 'https://kanji-vocab-trainer.netlify.app';
const SUPABASE = 'https://gkwvzfflayktnuhtkoyb.supabase.co';

// Lue depuis supabaseClient.js plutôt que recopiée : deux copies d'une même
// clé finissent toujours par diverger.
function cleAnon() {
  const src = fs.readFileSync(path.join(RACINE, 'supabaseClient.js'), 'utf8');
  const m = src.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
  if (!m) throw new Error('clé anon introuvable dans supabaseClient.js');
  return m[0];
}

const echapper = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const nombreFr = (n) => Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ');

async function lire(chemin) {
  const cle = cleAnon();
  const res = await fetch(SUPABASE + '/rest/v1/' + chemin, {
    headers: { apikey: cle, Authorization: 'Bearer ' + cle }
  });
  if (!res.ok) throw new Error(chemin + ' → ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return res.json();
}


// Du JSON place DANS une balise <script> n'est pas du JSON isole : le
// navigateur cherche la suite de caracteres qui ferme la balise avant de lire
// quoi que ce soit. Un titre de deck contenant cette suite fermerait donc la
// balise en avance, et tout ce qui suit deviendrait du code executable, dans
// une page publique. `JSON.stringify` seul ne protege pas de ca. Les trois
// echappements Unicode ci-dessous sont valides en JSON et invisibles pour un
// analyseur.
const jsonPourHtml = (obj) => JSON.stringify(obj)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026');

// ------------------------------------------------------------
// Le gabarit. Volontairement du HTML plat : ces pages doivent être
// lisibles sans exécuter une ligne de JavaScript. `ui.js` n'ajoute que le
// comportement de la barre, jamais le contenu.
// ------------------------------------------------------------
function pageDeck(deck, avis) {
  const titre = echapper(deck.titre);
  const auteur = echapper(deck.pseudo);
  const officiel = deck.officiel;

  // La description est écrite par un utilisateur : elle peut être vide.
  // Dans ce cas on écrit une phrase factuelle plutôt qu'une phrase creuse —
  // un texte de remplissage identique sur dix pages est exactement ce que
  // Google appelle du contenu à faible valeur.
  const description = (deck.description || '').trim();
  const resume = description
    || `${deck.nb_kanji} kanji et ${deck.nb_mots} mots de vocabulaire japonais, répartis sur ${deck.nb_semaines} semaines.`;

  const metaDesc = echapper(resume.slice(0, 155));

  const typeLisible = deck.type === 'jlpt'
    ? `Préparation au JLPT ${echapper(deck.niveau)}`
    : 'Cursus universitaire';

  const note = deck.nb_notes > 0
    ? `<p class="deck-fiche__note"><strong>${Number(deck.note_moyenne).toFixed(1)}</strong> sur 5 · ${deck.nb_notes} avis</p>`
    : '<p class="deck-fiche__note">Pas encore noté.</p>';

  const listeAvis = avis.length
    ? `<section class="deck-fiche__avis">
      <h2>Ce qu'en disent les autres</h2>
      ${avis.map((a) => `<blockquote class="deck-fiche__avis-item">
        <p>« ${echapper(a.avis)} »</p>
        <cite>${echapper(a.pseudo)} — ${a.note}/5</cite>
      </blockquote>`).join('\n      ')}
    </section>`
    : '';

  // Données structurées : c'est ce qui permet à Google de comprendre qu'il
  // s'agit d'un support de cours et non d'un article de blog.
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: deck.titre,
    description: resume,
    inLanguage: 'fr',
    teaches: 'Japonais — kanji et vocabulaire',
    learningResourceType: 'Liste de vocabulaire',
    isAccessibleForFree: true,
    url: `${SITE}/deck/${deck.slug}`,
    author: { '@type': 'Person', name: deck.pseudo }
  };
  if (deck.nb_notes > 0) {
    jsonld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(deck.note_moyenne).toFixed(1),
      reviewCount: deck.nb_notes
    };
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titre} — deck de vocabulaire japonais · KVT</title>
<meta name="description" content="${metaDesc}" />
<link rel="canonical" href="${SITE}/deck/${deck.slug}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${titre} — KVT" />
<meta property="og:description" content="${metaDesc}" />
<meta property="og:url" content="${SITE}/deck/${deck.slug}" />
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#16162a" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<link rel="icon" href="/icons/icon-192.png" />
<link rel="stylesheet" href="/style.css" />
<script type="application/ld+json">${jsonPourHtml(jsonld)}</script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8318848112615285"
     crossorigin="anonymous"></script>
</head>
<body>
  <header class="kvt-topbar">
    <div class="kvt-topbar__inner">
      <a class="kvt-topbar__brand" href="/" aria-label="KVT — retour à la page d'accueil">
        <div class="brand-kanji">漢</div>
        <div class="brand-text">KVT</div>
      </a>
      <button class="kvt-topbar__toggle" type="button" aria-expanded="false" aria-controls="navPrincipale">Menu</button>
      <nav class="kvt-topbar__nav" id="navPrincipale" aria-label="Navigation principale">
        <a href="/deck/" class="active">Decks</a>
        <a href="/l-idee">L'idée</a>
        <a href="/a-propos">À propos</a>
        <a href="/faq">FAQ</a>
        <a href="/blog">Blog</a>
      </nav>
      <div class="kvt-topbar__end">
        <a class="kvt-topbar__cta" href="/app/#decks">Ouvrir l'app</a>
      </div>
    </div>
  </header>
  <main class="editorial-main deck-fiche">
    <p class="editorial-eyebrow"><a href="/deck/">Decks</a> · ${typeLisible}</p>
    <h1>${titre}</h1>
    <p class="deck-fiche__auteur">${officiel ? 'Deck officiel KVT' : 'Publié par ' + auteur}</p>

    <p class="deck-fiche__resume">${echapper(resume)}</p>

    <ul class="deck-fiche__faits">
      <li><strong>${nombreFr(deck.nb_kanji)}</strong> kanji</li>
      <li><strong>${nombreFr(deck.nb_mots)}</strong> mots de vocabulaire</li>
      <li><strong>${deck.nb_semaines}</strong> semaines</li>
    </ul>
    ${note}

    <p class="deck-fiche__action">
      <a class="primary" href="/app/#decks">${officiel ? 'Réviser ce deck' : 'Importer ce deck'}</a>
    </p>

    ${listeAvis}

    <section class="deck-fiche__contexte">
      <h2>Comment ce deck s'utilise</h2>
      <p>
        KVT fait réviser le vocabulaire japonais <strong>par les kanji</strong> plutôt que
        mot par mot. Chaque kanji de ce deck arrive accompagné des mots qui l'emploient :
        on apprend ${nombreFr(deck.nb_mots)} mots en retenant ${nombreFr(deck.nb_kanji)} caractères,
        au lieu de mémoriser ${nombreFr(deck.nb_mots)} formes isolées sans lien entre elles.
      </p>
      <p>
        Le quiz demande d'écrire la lecture en hiragana ou en katakana, et note chaque
        réponse selon sa ressemblance avec la bonne solution plutôt qu'en tout-ou-rien :
        une syllabe oubliée ne fait pas perdre le point entier. Le contenu est découpé en
        ${deck.nb_semaines} semaines pour suivre l'avancement d'un cours réel.
      </p>
      <p>
        L'application est gratuite et fonctionne dans le navigateur, sur ordinateur comme
        sur mobile, ainsi qu'en version installable pour <a href="/app/#download">Mac et Windows</a>.
        Pour comprendre la démarche du projet, voir <a href="/l-idee">l'idée derrière KVT</a>
        et la <a href="/faq">foire aux questions</a>.
      </p>
    </section>
  </main>
  <footer class="site-footer">
    <p>
      <a href="/deck/">Tous les decks</a> · <a href="/l-idee">L'idée</a> · <a href="/a-propos">À propos</a> ·
      <a href="/faq">FAQ</a> · <a href="/blog">Blog</a> ·
      <a href="/regles-de-publication">Règles de publication</a> · <a href="/signaler">Signaler</a> ·
      <a href="/confidentialite">Confidentialité</a>
    </p>
    <p>© 2026 KVT (Kanji Vocab Trainer). Tous droits réservés.</p>
  </footer>
  <script src="/ui.js"></script>
</body>
</html>
`;
}

function pageIndex(decks) {
  const lignes = decks.map((d) => `      <li class="deck-index__item">
        <a href="/deck/${d.slug}">
          <span class="deck-index__titre">${echapper(d.titre)}</span>
          <span class="deck-index__detail">${nombreFr(d.nb_kanji)} kanji · ${nombreFr(d.nb_mots)} mots · ${d.officiel ? 'officiel' : 'par ' + echapper(d.pseudo)}</span>
        </a>
      </li>`).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tous les decks de vocabulaire japonais · KVT</title>
<meta name="description" content="Les listes de vocabulaire japonais disponibles sur KVT : semestres universitaires et niveaux JLPT N5 à N3, avec les decks publiés par la communauté." />
<link rel="canonical" href="${SITE}/deck/" />
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#16162a" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<link rel="icon" href="/icons/icon-192.png" />
<link rel="stylesheet" href="/style.css" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8318848112615285"
     crossorigin="anonymous"></script>
</head>
<body>
  <header class="kvt-topbar">
    <div class="kvt-topbar__inner">
      <a class="kvt-topbar__brand" href="/" aria-label="KVT — retour à la page d'accueil">
        <div class="brand-kanji">漢</div>
        <div class="brand-text">KVT</div>
      </a>
      <button class="kvt-topbar__toggle" type="button" aria-expanded="false" aria-controls="navPrincipale">Menu</button>
      <nav class="kvt-topbar__nav" id="navPrincipale" aria-label="Navigation principale">
        <a href="/deck/" class="active">Decks</a>
        <a href="/l-idee">L'idée</a>
        <a href="/a-propos">À propos</a>
        <a href="/faq">FAQ</a>
        <a href="/blog">Blog</a>
      </nav>
      <div class="kvt-topbar__end">
        <a class="kvt-topbar__cta" href="/app/#decks">Ouvrir l'app</a>
      </div>
    </div>
  </header>
  <main class="editorial-main">
    <p class="editorial-eyebrow">Decks</p>
    <h1>Tous les decks de vocabulaire japonais</h1>
    <p>
      Chaque deck rassemble des kanji et les mots qui les emploient, découpés semaine par
      semaine. Les decks officiels suivent un cursus universitaire ou un niveau du JLPT ;
      les autres sont publiés par les personnes qui utilisent KVT.
    </p>
    <ul class="deck-index">
${lignes}
    </ul>
    <p>
      Un deck manque ? Tu peux publier le tien depuis l'application, en respectant les
      <a href="/regles-de-publication">règles de publication</a>.
    </p>
  </main>
  <footer class="site-footer">
    <p>
      <a href="/l-idee">L'idée</a> · <a href="/a-propos">À propos</a> · <a href="/faq">FAQ</a> ·
      <a href="/blog">Blog</a> · <a href="/regles-de-publication">Règles de publication</a> ·
      <a href="/signaler">Signaler</a> · <a href="/confidentialite">Confidentialité</a>
    </p>
    <p>© 2026 KVT (Kanji Vocab Trainer). Tous droits réservés.</p>
  </footer>
  <script src="/ui.js"></script>
</body>
</html>
`;
}

function sitemap(decks) {
  const fixes = ['/', '/deck/', '/l-idee', '/a-propos', '/faq', '/blog',
    '/blog/cursus-ou-jlpt', '/blog/guide-complet', '/blog/import-anki',
    '/blog/vocabulaire-kanji', '/blog/classement-stats',
    '/regles-de-publication', '/signaler', '/confidentialite'];
  const urls = fixes.concat(decks.map((d) => '/deck/' + d.slug));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}
</urlset>
`;
}

async function principal() {
  const decks = await lire('decks?select=*&visible=eq.true&order=officiel.desc,titre.asc');
  if (!decks.length) throw new Error('aucun deck visible : rien à générer, et c\'est suspect');

  const tousAvis = await lire('deck_notes?select=deck_id,note,avis,pseudo&avis=not.is.null&order=created_at.desc')
    .catch(() => []);

  const dossier = path.join(RACINE, 'deck');
  fs.rmSync(dossier, { recursive: true, force: true });
  fs.mkdirSync(dossier, { recursive: true });

  for (const deck of decks) {
    const avis = tousAvis.filter((a) => a.deck_id === deck.id && (a.avis || '').trim()).slice(0, 8);
    const cible = path.join(dossier, deck.slug);
    fs.mkdirSync(cible, { recursive: true });
    fs.writeFileSync(path.join(cible, 'index.html'), pageDeck(deck, avis), 'utf8');
  }
  fs.writeFileSync(path.join(dossier, 'index.html'), pageIndex(decks), 'utf8');
  fs.writeFileSync(path.join(RACINE, 'sitemap.xml'), sitemap(decks), 'utf8');

  console.log(`  ${decks.length} pages de deck générées, plus l'index et le sitemap.`);
}

// Les gabarits sont exportés pour que tests/deck.test.js puisse les
// exercer sans réseau, avec des données choisies — dont un titre contenant
// du HTML, parce qu'un pseudo est du texte écrit par un inconnu.
module.exports = { pageDeck, pageIndex, sitemap };

// Rien ne part si ce fichier est simplement requis par un contrôle.
if (require.main !== module) return;

principal().catch((e) => {
  // Un échec ici ne doit pas passer inaperçu : sans ces pages, le
  // déploiement publierait un site dont tous les liens /deck/ sont morts.
  console.error('\n  ÉCHEC de la génération des pages de deck : ' + e.message);
  console.error('  Le déploiement est interrompu — corrige avant de publier.\n');
  process.exit(1);
});
