// ============================================================
// Gamification — niveaux, XP, pièces d'or, série quotidienne, boutique.
//
// Ajouté le 24/08/2026 à la demande de Paul, ajusté en plusieurs passes
// suite à ses retours :
// - v2 : ajout d'une deuxième monnaie ("or") séparée des pièces.
// - v3 : Paul a précisé qu'il ne voulait PAS une deuxième monnaie — juste
//   que la monnaie existante SOIT de l'or (rebaptisée "pièces d'or").
//   Toute la logique de gain/dépense en "or" séparé (gagnerOr, paliers de
//   niveau/série/session parfaite en or) a donc été retirée : une seule
//   monnaie, plus généreuse (voir plus bas), pas deux.
// - v4 : l'emoji 🪙 générique remplacé par un koban dessiné en SVG (voir
//   iconePiece plus bas), après plusieurs allers-retours avec Paul sur la
//   forme (verticale, façon pièce de Miaouss) et le style (dégradé +
//   lignes gravées, sans contour épais).
// - v5 : les gains d'XP/pièces sont mis à l'échelle par l'avancement dans
//   le programme (voir multiplicateurDifficulte plus bas).
// - v6 (celle-ci, 25/08/2026) : quatre ajouts à la boutique — des boosts
//   d'XP temporaires (20 min), des collations cosmétiques visibles pendant
//   les révisions (cookie/lait/popcorn/soda), les cinq palettes Pro
//   achetables individuellement avec des pièces (débloquent comme si on
//   avait le Pro, sans toucher à l'abonnement), et des bannières de profil
//   visibles par les autres sur le profil public (synchronisées vers
//   Supabase, colonne `profiles.banniere_active`).
//
// Principe repris de `01 - Décisions techniques.md` / vision produit du
// 25/07 : tout ce qui touche à l'apprentissage lui-même reste gratuit et
// gagnable en jouant normalement. Le Pro n'accélère que la vitesse à
// laquelle on gagne (boost XP/pièces) et donne accès à quelques objets de
// boutique en plus — jamais un raccourci qui remplace la pratique.
//
// Numéros de barème (XP par niveau, prix boutique, seuils) : quatrième
// passe, toujours pas testée sur un usage réel — à ajuster si besoin, voir
// `02 - Idées futures.md`.
// ============================================================

// ---------- Configuration ----------

// Niveau = à quelle vitesse l'XP cumulée fait progresser. Courbe
// quadratique : xp requis pour le niveau L = GAMIF_XP_PAR_NIVEAU * (L-1)^2.
// Chaque niveau demande plus que le précédent, mais reste atteignable.
const GAMIF_XP_PAR_NIVEAU = 50;

// Boost Pro : multiplie XP et pièces d'or gagnées. Le Pro ne touche jamais
// à l'apprentissage lui-même (voir en-tête), seulement à la vitesse de la
// couche jeu — cohérent avec le reste du modèle Pro (déco + soutien).
const GAMIF_BOOST_PRO = 1.5;

// Le flux du quotidien. Deux pièces d'or par mot réussi (au lieu d'une
// dans la toute première version) — seuil identique à MISS_THRESHOLD
// (app.js, 60% = un mot déjà considéré "raté" ailleurs dans l'app, qui ne
// rapporte rien ici non plus).
const GAMIF_SEUIL_PIECE = 6; // sur l'échelle 0-10 de result.points
const GAMIF_PIECES_PAR_MOT = 2;

// Bonus de fin de session, si le score dépasse 80%.
const GAMIF_SEUIL_BONUS_SESSION = 80;
const GAMIF_BONUS_SESSION = 15;

// Boost XP temporaire (25/08/2026), acheté en boutique — voir GAMIF_BOUTIQUE
// plus bas (type 'boost'). Ne touche que l'XP, pas les pièces : Paul l'a
// demandé nommément comme un « boost d'exp », distinct du boost Pro qui
// touche les deux. Racheter un boost pendant qu'un autre tourne encore
// ALLONGE la durée restante plutôt que d'empiler le multiplicateur (voir
// activerBoostXp) : sinon, deux achats rapprochés donneraient un ×4 qui
// n'a pas de raison d'exister.
const GAMIF_BOOST_XP_DUREE_MS = 20 * 60 * 1000;
const GAMIF_BOOST_XP_MULTIPLICATEUR = 2;

// Difficulté selon le semestre (25/08/2026, demande de Paul : « plus c'est
// loin, plus ça donne »). Ordre canonique du programme — même ordre que
// CANONICAL_SEMESTERS dans webapi.js (à garder synchronisé si un nouveau
// semestre/module y est ajouté ; dupliqué ici plutôt qu'exporté car
// CANONICAL_SEMESTERS est privé à l'IIFE de webapi.js). +8% par palier plus
// avancé : le tout premier semestre reste au tarif de base, le dernier
// module JLPT actuellement disponible (N3) rapporte 1,8×. Un id absent de
// cette liste (deck créé ou importé par un élève, voir creation.js/decks.js)
// n'est pas "un semestre du programme" — pas de bonus, tarif de base.
const GAMIF_ORDRE_SEMESTRES = [
  'l0-s1', 'l0-s2', 's1', 's2', 's3', 's4', 's5', 's6',
  'jlpt-n5', 'jlpt-n4', 'jlpt-n3'
];
const GAMIF_BONUS_PAR_PALIER = 0.08;

function multiplicateurDifficulte(semesterId) {
  const idx = GAMIF_ORDRE_SEMESTRES.indexOf(semesterId);
  if (idx === -1) return 1;
  return 1 + idx * GAMIF_BONUS_PAR_PALIER;
}

// Catalogue boutique. Aucun objet ne touche à l'apprentissage (contenu,
// stats, classement) — décoratif ou temporaire uniquement, comme le reste
// de ce qui se paie dans KVT. `niveauRequis` verrouille l'objet tant que le
// niveau n'est pas atteint, même avec assez de pièces d'or.
//
// `type` détermine comment l'objet se comporte à l'achat/à l'équipement :
// - 'titre'     : cosmétique, équipé dans titreActif, affiché au tableau
//                 de bord (widgetGamification).
// - 'collation' : cosmétique, équipé dans collationActive, affiché
//                 uniquement pendant une session de Réviser (collationHtml)
//                 — slot séparé du titre, les deux peuvent être actifs en
//                 même temps.
// - 'theme'     : débloque un thème normalement réservé au Pro (`themeId`),
//                 exactement comme si on avait le Pro pour ce thème précis
//                 — pas d'équipement ici, la sélection se fait dans
//                 Réglages comme d'habitude (themeDebloqueParPieces).
// - 'banniere'  : cosmétique, équipé dans banniereActive, synchronisé vers
//                 Supabase (`profiles.banniere_active`) car visible par les
//                 autres sur le profil public — voir equiperBanniere.
//                 `classe` = suffixe de .profil-banniere--<classe>
//                 (style.css).
// - 'boost'     : consommable, jamais ajouté à l'inventaire — rachetable à
//                 volonté (acheterObjet le traite à part).
const GAMIF_BOUTIQUE = [
  // --- Titres : affichés au tableau de bord ---
  { id: 'titre-motive', type: 'titre', nom: 'Motivé·e', emoji: '🌱', prix: 20, pro: false, niveauRequis: 1 },
  { id: 'titre-serieux', type: 'titre', nom: 'Sérieux·se', emoji: '📘', prix: 60, pro: false, niveauRequis: 1 },
  { id: 'titre-assidu', type: 'titre', nom: 'Assidu·e', emoji: '📅', prix: 100, pro: false, niveauRequis: 3 },
  { id: 'titre-chasseur', type: 'titre', nom: 'Chasseur de kanji', emoji: '🎯', prix: 150, pro: false, niveauRequis: 3 },
  { id: 'titre-marathonien', type: 'titre', nom: 'Marathonien·ne', emoji: '🏃', prix: 200, pro: false, niveauRequis: 4 },
  { id: 'titre-nocturne', type: 'titre', nom: 'Réviseur·se nocturne', emoji: '🌙', prix: 250, pro: false, niveauRequis: 5 },
  { id: 'titre-dojo', type: 'titre', nom: 'Légende du dojo', emoji: '🥋', prix: 500, pro: false, niveauRequis: 8 },
  { id: 'titre-sensei', type: 'titre', nom: 'Sensei', emoji: '⛩️', prix: 400, pro: true, niveauRequis: 5 },
  { id: 'titre-dragon', type: 'titre', nom: 'Dragon de jade', emoji: '🐉', prix: 800, pro: true, niveauRequis: 10 },
  { id: 'titre-legendaire', type: 'titre', nom: 'Légendaire', emoji: '🏆', prix: 1200, pro: false, niveauRequis: 10 },
  { id: 'titre-immortel', type: 'titre', nom: 'Immortel·le', emoji: '💎', prix: 2000, pro: true, niveauRequis: 15 },
  { id: 'titre-empereur', type: 'titre', nom: 'Empereur du kanji', emoji: '👑', prix: 3500, pro: true, niveauRequis: 20 },

  // --- Pendant les révisions : visibles seulement en session (25/08/2026) ---
  { id: 'collation-cookie', type: 'collation', nom: 'Cookie', emoji: '🍪', prix: 40, pro: false, niveauRequis: 1 },
  { id: 'collation-lait', type: 'collation', nom: 'Verre de lait', emoji: '🥛', prix: 40, pro: false, niveauRequis: 1 },
  { id: 'collation-popcorn', type: 'collation', nom: 'Popcorn', emoji: '🍿', prix: 60, pro: false, niveauRequis: 2 },
  { id: 'collation-soda', type: 'collation', nom: 'Soda', emoji: '🥤', prix: 60, pro: false, niveauRequis: 2 },

  // --- Thèmes du site : déblocage individuel avec des pièces (25/08/2026) ---
  { id: 'theme-sakura', type: 'theme', themeId: 'sakura', nom: 'Palette Sakura', emoji: '🌸', prix: 700, pro: false, niveauRequis: 6 },
  { id: 'theme-sumi', type: 'theme', themeId: 'sumi', nom: 'Palette Sumi', emoji: '🖋️', prix: 700, pro: false, niveauRequis: 6 },
  { id: 'theme-ai', type: 'theme', themeId: 'ai', nom: 'Palette Ai', emoji: '🌊', prix: 700, pro: false, niveauRequis: 6 },
  { id: 'theme-momiji', type: 'theme', themeId: 'momiji', nom: 'Palette Momiji', emoji: '🍁', prix: 700, pro: false, niveauRequis: 6 },
  { id: 'theme-take', type: 'theme', themeId: 'take', nom: 'Palette Take', emoji: '🎍', prix: 700, pro: false, niveauRequis: 6 },

  // --- Bannières de profil : visibles par les autres (25/08/2026) ---
  { id: 'banniere-aurore', type: 'banniere', classe: 'aurore', nom: 'Aurore', emoji: '🌅', prix: 300, pro: false, niveauRequis: 4 },
  { id: 'banniere-nocturne', type: 'banniere', classe: 'nocturne', nom: 'Nuit étoilée', emoji: '🌌', prix: 300, pro: false, niveauRequis: 4 },
  { id: 'banniere-jade', type: 'banniere', classe: 'jade', nom: 'Jade', emoji: '🍃', prix: 300, pro: false, niveauRequis: 4 },
  { id: 'banniere-or', type: 'banniere', classe: 'or', nom: 'Or', emoji: '🪙', prix: 500, pro: false, niveauRequis: 6 },
  { id: 'banniere-imperiale', type: 'banniere', classe: 'imperiale', nom: 'Impériale', emoji: '👑', prix: 700, pro: true, niveauRequis: 8 },

  // --- Boosts : consommable, rachetable à volonté (25/08/2026) ---
  { id: 'boost-xp-20', type: 'boost', nom: 'Boost XP (20 min, ×2)', emoji: '⚡', prix: 30, pro: false, niveauRequis: 1 }
];

function gamifEstPro() {
  return !!(window.accountUser && window.accountUser.isPro);
}

// Ajoute les champs par défaut si absents — même logique que migrate() dans
// webapi.js (non-destructif, jamais utile en pratique puisque migrate() le
// fait déjà, gardée ici en repli pour les tests et les cas limites).
function assurerGamification() {
  if (!DB.gamification) {
    DB.gamification = {
      xp: 0, pieces: 0,
      streak: { compte: 0, record: 0, dernierJour: null },
      inventaire: [], titreActif: null,
      collationActive: null, banniereActive: null, boostXpJusqua: null
    };
  }
  return DB.gamification;
}

// ---------- Niveau (dérivé de l'XP, jamais stocké séparément) ----------

function niveauDepuisXp(xp) {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / GAMIF_XP_PAR_NIVEAU));
}

function xpPourNiveau(niveau) {
  return GAMIF_XP_PAR_NIVEAU * Math.pow(niveau - 1, 2);
}

// { niveau, xpDansNiveau, largeurNiveau, pct } — pct = avancement (0-100)
// vers le niveau suivant, pour la barre de progression.
function progressionNiveau(xp) {
  const niveau = niveauDepuisXp(xp);
  const seuilActuel = xpPourNiveau(niveau);
  const seuilSuivant = xpPourNiveau(niveau + 1);
  const xpDansNiveau = xp - seuilActuel;
  const largeurNiveau = seuilSuivant - seuilActuel;
  const pct = largeurNiveau > 0 ? Math.min(100, Math.round((xpDansNiveau / largeurNiveau) * 100)) : 100;
  return { niveau, xpDansNiveau, largeurNiveau, pct };
}

// ---------- Boost XP temporaire ----------

function activerBoostXp() {
  const g = assurerGamification();
  const maintenant = Date.now();
  const depart = Math.max(g.boostXpJusqua || 0, maintenant);
  g.boostXpJusqua = depart + GAMIF_BOOST_XP_DUREE_MS;
}

function boostXpActif() {
  const g = assurerGamification();
  return !!(g.boostXpJusqua && Date.now() < g.boostXpJusqua);
}

function boostXpRestantMs() {
  const g = assurerGamification();
  return boostXpActif() ? g.boostXpJusqua - Date.now() : 0;
}

// ---------- Gains ----------

function gagnerXp(points, semesterId) {
  if (!points || points <= 0) return 0;
  const g = assurerGamification();
  const boost = boostXpActif() ? GAMIF_BOOST_XP_MULTIPLICATEUR : 1;
  const gain = Math.round(points * multiplicateurDifficulte(semesterId) * boost * (gamifEstPro() ? GAMIF_BOOST_PRO : 1));
  g.xp += gain;
  return gain;
}

function gagnerPieces(points, semesterId) {
  if (!points || points < GAMIF_SEUIL_PIECE) return 0;
  const g = assurerGamification();
  const gain = Math.round(GAMIF_PIECES_PAR_MOT * multiplicateurDifficulte(semesterId) * (gamifEstPro() ? GAMIF_BOOST_PRO : 1));
  g.pieces += gain;
  return gain;
}

function bonusFinSession(pctSession, semesterId) {
  if (pctSession < GAMIF_SEUIL_BONUS_SESSION) return 0;
  const g = assurerGamification();
  const gain = Math.round(GAMIF_BONUS_SESSION * multiplicateurDifficulte(semesterId) * (gamifEstPro() ? GAMIF_BOOST_PRO : 1));
  g.pieces += gain;
  return gain;
}

// ---------- Série quotidienne (streak) ----------
// Une seule mise à jour par jour civil (UTC — même convention que les dates
// ISO déjà utilisées dans DB.scores ailleurs dans le projet). Un jour sauté
// remet le compteur à 1, pas à 0 : le jour où on revient compte lui-même.

function gamifDateDuJour() {
  return new Date().toISOString().slice(0, 10);
}

function gamifJourPrecedent(jourIso) {
  const d = new Date(jourIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function mettreAJourStreak() {
  const g = assurerGamification();
  const aujourdhui = gamifDateDuJour();
  if (g.streak.dernierJour === aujourdhui) return g.streak; // déjà compté aujourd'hui
  if (g.streak.dernierJour === gamifJourPrecedent(aujourdhui)) {
    g.streak.compte += 1;
  } else {
    g.streak.compte = 1;
  }
  g.streak.dernierJour = aujourdhui;
  if (g.streak.compte > g.streak.record) g.streak.record = g.streak.compte;
  return g.streak;
}

// ---------- Boutique ----------

function objetBoutique(id) {
  return GAMIF_BOUTIQUE.find(o => o.id === id) || null;
}

// Un thème débloqué en boutique (voir GAMIF_BOUTIQUE, type 'theme') se
// comporte comme s'il était Pro : appelé depuis app.js pour autoriser le
// choix de thème dans Réglages sans toucher au statut Pro lui-même.
function themeDebloqueParPieces(themeId) {
  return !!(DB.gamification && DB.gamification.inventaire.includes('theme-' + themeId));
}

// Classe CSS de la bannière équipée par un profil (voir GAMIF_BOUTIQUE,
// type 'banniere', champ `classe`) — utilisé par profil-public.js pour
// habiller l'en-tête du profil public. `id` vient de `profiles.banniere_active`
// (une chaîne vide ou un id retiré du catalogue retombe sur '', pas d'erreur).
function classeBanniere(id) {
  const objet = id ? objetBoutique(id) : null;
  return (objet && objet.type === 'banniere') ? `profil-banniere--${objet.classe}` : '';
}

// Ordre des refus : introuvable, déjà possédé (sauf boost, rachetable),
// niveau, Pro, puis les pièces — le niveau et le statut Pro sont des
// conditions d'accès à l'objet lui-même, vérifiées avant de regarder si le
// porte-monnaie suit.
function acheterObjet(id) {
  const g = assurerGamification();
  const objet = objetBoutique(id);
  if (!objet) return { ok: false, motif: 'introuvable' };
  if (objet.type !== 'boost' && g.inventaire.includes(id)) return { ok: false, motif: 'deja-possede' };
  if (niveauDepuisXp(g.xp) < objet.niveauRequis) return { ok: false, motif: 'niveau-insuffisant' };
  if (objet.pro && !gamifEstPro()) return { ok: false, motif: 'reserve-pro' };
  if (g.pieces < objet.prix) return { ok: false, motif: 'pas-assez-de-pieces' };
  g.pieces -= objet.prix;
  if (objet.type === 'boost') {
    activerBoostXp();
  } else {
    g.inventaire.push(id);
  }
  return { ok: true };
}

function equiperTitre(id) {
  const g = assurerGamification();
  if (id !== null && !g.inventaire.includes(id)) return { ok: false };
  g.titreActif = id;
  return { ok: true };
}

function equiperCollation(id) {
  const g = assurerGamification();
  if (id !== null && !g.inventaire.includes(id)) return { ok: false };
  g.collationActive = id;
  return { ok: true };
}

// Contrairement à equiperTitre/equiperCollation (purement locales), une
// bannière est visible par les autres sur le profil public : il faut la
// synchroniser vers Supabase (`profiles.banniere_active`), pas seulement
// la garder dans DB.gamification. Mise à jour optimiste, annulée si
// l'enregistrement distant échoue. Sans compte connecté (pas de profil
// public du tout), on équipe seulement en local — rien à synchroniser.
async function equiperBanniere(id) {
  const g = assurerGamification();
  if (id !== null && !g.inventaire.includes(id)) return { ok: false };
  const ancien = g.banniereActive;
  g.banniereActive = id;
  if (window.accountUser && window.kvtProfils && typeof window.kvtProfils.enregistrerProfil === 'function') {
    const res = await window.kvtProfils.enregistrerProfil({ banniere_active: id || '' });
    if (!res.ok) {
      g.banniereActive = ancien;
      return { ok: false, motif: 'sync-echouee' };
    }
  }
  return { ok: true };
}

// ---------- Icône ----------
// Petit koban (小判, la pièce d'or ovale japonaise) en SVG plutôt qu'un
// emoji — dessiné avec Paul le 24/08/2026 (forme moins ovale, dégradé,
// lignes gravées, sans contour épais). Un id de dégradé/clip unique par
// appel : la boutique en affiche plusieurs à la fois sur la même page, et
// deux <svg> avec le même id de dégradé se marchent dessus au rendu.
let gamifIconeCompteur = 0;

function iconePiece(taillePx) {
  const hauteur = taillePx || 16;
  const largeur = Math.round(hauteur * 0.75);
  const id = 'gamifCoin' + (gamifIconeCompteur++);
  return `<svg class="gamif-icone-piece" width="${largeur}" height="${hauteur}" viewBox="0 0 240 320" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${id}-gold" x1="15%" y1="10%" x2="85%" y2="95%">
        <stop offset="0%" stop-color="#ffe98a"/>
        <stop offset="45%" stop-color="#ffc93c"/>
        <stop offset="100%" stop-color="#e39a1a"/>
      </linearGradient>
      <clipPath id="${id}-forme">
        <rect x="20" y="10" width="200" height="290" rx="95" ry="105"/>
      </clipPath>
    </defs>
    <rect x="20" y="18" width="200" height="290" rx="95" ry="105" fill="#c67f12"/>
    <rect x="20" y="10" width="200" height="290" rx="95" ry="105" fill="url(#${id}-gold)"/>
    <g clip-path="url(#${id}-forme)" stroke="#c67f12" stroke-width="2" opacity="0.55">
      <line x1="10" y1="40" x2="230" y2="40"/>
      <line x1="10" y1="62" x2="230" y2="62"/>
      <line x1="10" y1="84" x2="230" y2="84"/>
      <line x1="10" y1="106" x2="230" y2="106"/>
      <line x1="10" y1="128" x2="230" y2="128"/>
      <line x1="10" y1="150" x2="230" y2="150"/>
      <line x1="10" y1="172" x2="230" y2="172"/>
      <line x1="10" y1="194" x2="230" y2="194"/>
      <line x1="10" y1="216" x2="230" y2="216"/>
      <line x1="10" y1="238" x2="230" y2="238"/>
      <line x1="10" y1="260" x2="230" y2="260"/>
      <line x1="10" y1="282" x2="230" y2="282"/>
    </g>
  </svg>`;
}

// ---------- Rendu : widget tableau de bord ----------
// Inséré dans renderDashboard() (app.js) — voir en-tête de la fonction.

function widgetGamification() {
  const g = assurerGamification();
  const prog = progressionNiveau(g.xp);
  const titre = g.titreActif ? objetBoutique(g.titreActif) : null;
  return `
    <div class="card gamif-widget">
      <div class="gamif-widget__niveau">
        <div class="gamif-widget__badge">Niv. ${prog.niveau}</div>
        <div class="gamif-widget__barre" title="${prog.xpDansNiveau}/${prog.largeurNiveau} XP avant le niveau suivant">
          <div class="gamif-widget__barre-remplie" style="width:${prog.pct}%"></div>
        </div>
        <div class="gamif-widget__xp">${g.xp} XP</div>
      </div>
      <div class="gamif-widget__stats">
        <span class="gamif-piece" title="Pièces d'or">${iconePiece(16)} ${g.pieces}</span>
        <span class="gamif-streak" title="Série de jours consécutifs">🔥 ${g.streak.compte}</span>
        ${boostXpActif() ? `<span class="gamif-boost" title="Boost XP actif">⚡ ×${GAMIF_BOOST_XP_MULTIPLICATEUR} XP · ${Math.max(1, Math.ceil(boostXpRestantMs() / 60000))} min</span>` : ''}
        ${titre ? `<span class="gamif-titre">${titre.emoji} ${escapeHtml(titre.nom)}</span>` : ''}
      </div>
    </div>`;
}

// ---------- Rendu : collation pendant les révisions ----------
// Inséré dans renderReview() (app.js), uniquement pendant une session en
// cours — voir en-tête de GAMIF_BOUTIQUE (type 'collation').

function collationHtml() {
  const g = assurerGamification();
  if (!g.collationActive) return '';
  const objet = objetBoutique(g.collationActive);
  if (!objet) return '';
  return `<div class="gamif-collation" title="Ta collation équipée">${objet.emoji} ${escapeHtml(objet.nom)}</div>`;
}

// ---------- Rendu : vue Boutique ----------

const GAMIF_SECTIONS_BOUTIQUE = [
  { type: 'titre', titre: 'Titres', aide: "Affichés à côté de ton niveau, sur le tableau de bord." },
  { type: 'collation', titre: 'Pendant les révisions', aide: "Affichée uniquement pendant une session de Réviser — indépendante du titre." },
  { type: 'theme', titre: 'Thèmes du site', aide: "Débloque une palette normalement réservée au Pro, sans toucher à l'abonnement. Le choix du thème se fait ensuite dans Réglages." },
  { type: 'banniere', titre: 'Bannières de profil', aide: "Visible par les autres sur ton profil public." },
  { type: 'boost', titre: 'Boosts', aide: "Consommable : s'active tout de suite pour 20 minutes. En racheter un pendant qu'il tourne encore prolonge la durée." }
];

function boutiqueBouton(o, g, pro, niveauActuel) {
  const niveauBloque = niveauActuel < o.niveauRequis;
  const proBloque = o.pro && !pro;
  if (niveauBloque) return `<button class="secondary" disabled>Niveau ${o.niveauRequis} requis</button>`;
  if (proBloque) return `<button class="secondary" disabled>Réservé Pro</button>`;

  if (o.type === 'boost') {
    return `<button class="primary" data-acheter="${o.id}" ${g.pieces < o.prix ? 'disabled' : ''}>${o.prix} ${iconePiece(14)}</button>`;
  }

  const possede = g.inventaire.includes(o.id);
  if (!possede) {
    return `<button class="primary" data-acheter="${o.id}" ${g.pieces < o.prix ? 'disabled' : ''}>${o.prix} ${iconePiece(14)}</button>`;
  }

  if (o.type === 'theme') {
    return `<span class="boutique-item__debloque">Débloqué — dans Réglages</span>`;
  }

  const slot = o.type === 'banniere' ? 'banniereActive' : (o.type === 'collation' ? 'collationActive' : 'titreActif');
  const actif = g[slot] === o.id;
  const attrEquiper = o.type === 'banniere' ? 'data-equiper-banniere' : (o.type === 'collation' ? 'data-equiper-collation' : 'data-equiper');
  return `<button class="secondary" ${attrEquiper}="${o.id}" ${actif ? 'disabled' : ''}>${actif ? 'Équipé' : 'Équiper'}</button>`;
}

function renderBoutique() {
  const container = $('#view-boutique');
  const g = assurerGamification();
  const pro = gamifEstPro();
  const niveauActuel = niveauDepuisXp(g.xp);

  const sections = GAMIF_SECTIONS_BOUTIQUE.map(section => {
    const objets = GAMIF_BOUTIQUE.filter(o => o.type === section.type);
    if (!objets.length) return '';
    return `
      <h3 class="boutique-section__titre">${escapeHtml(section.titre)}</h3>
      <p class="boutique-section__aide">${escapeHtml(section.aide)}</p>
      <div class="boutique-grid">
        ${objets.map(o => `
          <div class="card boutique-item ${g.inventaire.includes(o.id) ? 'boutique-item--possede' : ''}">
            <div class="boutique-item__emoji">${o.emoji}</div>
            <div class="boutique-item__nom">${escapeHtml(o.nom)}</div>
            ${o.pro ? '<div class="boutique-item__pro">Pro</div>' : ''}
            ${boutiqueBouton(o, g, pro, niveauActuel)}
          </div>`).join('')}
      </div>`;
  }).join('');

  container.innerHTML = `
    <h2>Boutique</h2>
    <div class="card gamif-solde">
      <span class="gamif-piece">${iconePiece(18)} ${g.pieces} pièce${g.pieces > 1 ? 's' : ''} d'or</span>
      <span style="color:var(--muted); font-size:13px;">Gagnées en révisant — deux pièces d'or par mot correct, un bonus si tu finis une session à 80% ou plus, davantage sur les semestres avancés. Purement décoratif : aucun avantage sur le classement.</span>
    </div>
    ${sections}
    <div class="gamif-retirer-liste">
      ${g.titreActif ? `<button class="lien-retour" data-retirer-titre>Ne plus afficher de titre</button>` : ''}
      ${g.collationActive ? `<button class="lien-retour" data-retirer-collation>Ne plus afficher de collation</button>` : ''}
      ${g.banniereActive ? `<button class="lien-retour" data-retirer-banniere>Ne plus afficher de bannière</button>` : ''}
    </div>
  `;

  $$('[data-acheter]', container).forEach(b => {
    b.onclick = () => {
      const res = acheterObjet(b.dataset.acheter);
      if (!res.ok) { showToast('Achat impossible.'); return; }
      showToast('Objet acheté !');
      persist();
      renderBoutique();
    };
  });
  $$('[data-equiper]', container).forEach(b => {
    b.onclick = () => { equiperTitre(b.dataset.equiper); persist(); renderBoutique(); };
  });
  $$('[data-equiper-collation]', container).forEach(b => {
    b.onclick = () => { equiperCollation(b.dataset.equiperCollation); persist(); renderBoutique(); };
  });
  $$('[data-equiper-banniere]', container).forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      const res = await equiperBanniere(b.dataset.equiperBanniere);
      if (!res.ok) { showToast("Impossible d'équiper cette bannière pour l'instant."); }
      persist();
      renderBoutique();
    };
  });
  const btnRetirerTitre = $('[data-retirer-titre]', container);
  if (btnRetirerTitre) btnRetirerTitre.onclick = () => { equiperTitre(null); persist(); renderBoutique(); };
  const btnRetirerCollation = $('[data-retirer-collation]', container);
  if (btnRetirerCollation) btnRetirerCollation.onclick = () => { equiperCollation(null); persist(); renderBoutique(); };
  const btnRetirerBanniere = $('[data-retirer-banniere]', container);
  if (btnRetirerBanniere) btnRetirerBanniere.onclick = async () => { await equiperBanniere(null); persist(); renderBoutique(); };
}
