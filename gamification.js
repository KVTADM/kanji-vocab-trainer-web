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

// Bonus de série quotidienne (#18, rang 5) : XP + pièces attribués une
// seule fois par jour, exactement quand mettreAJourStreak() fait avancer
// la série (son garde-fou "déjà compté aujourd'hui" empêche tout doublon
// si plusieurs mots/quiz sont terminés le même jour). Croissance linéaire
// plafonnée à 30 jours : ça encourage à continuer sans transformer une
// série de plusieurs mois en pluie d'XP disproportionnée. Profite du même
// boost Pro que les autres gains ; profite aussi du boost XP temporaire
// acheté en boutique (uniquement côté XP, comme pour gagnerXp) puisque
// c'est un multiplicateur générique sur l'XP, pas spécifique aux mots.
const GAMIF_STREAK_XP_PAR_JOUR = 5;
const GAMIF_STREAK_PIECES_PAR_JOUR = 1;
const GAMIF_STREAK_PLAFOND_JOURS = 30;

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

// Mode Difficile (correction en fin de session) : x1,25 sur l'XP et les
// pieces gagnees pendant la session (decision de Paul, 29/09/2026). Lu sur
// la session en cours, fige a son demarrage comme le reste du mode.
const GAMIF_BONUS_MODE_DIFFICILE = 1.25;
function multiplicateurModeDifficile() {
  return (typeof quizSession !== 'undefined' && quizSession && quizSession.hardcore) ? GAMIF_BONUS_MODE_DIFFICILE : 1;
}

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

  // --- Thèmes du site : déblocage individuel avec des pièces (25/08/2026).
  // Prix relevé de 700 à 3000 le 23/09/2026 (demande de Paul, "bien plus
  // cher aussi") -- désormais le seul moyen d'y accéder, Pro y compris
  // (voir app.js, Réglages : le raccourci isPro a été retiré, "et pas a
  // les avoir par defaut"). ---
  { id: 'theme-sakura', type: 'theme', themeId: 'sakura', nom: 'Palette Sakura', emoji: '🌸', prix: 3000, pro: false, niveauRequis: 6 },
  { id: 'theme-sumi', type: 'theme', themeId: 'sumi', nom: 'Palette Sumi', emoji: '🖋️', prix: 3000, pro: false, niveauRequis: 6 },
  { id: 'theme-ai', type: 'theme', themeId: 'ai', nom: 'Palette Ai', emoji: '🌊', prix: 3000, pro: false, niveauRequis: 6 },
  { id: 'theme-momiji', type: 'theme', themeId: 'momiji', nom: 'Palette Momiji', emoji: '🍁', prix: 3000, pro: false, niveauRequis: 6 },
  { id: 'theme-take', type: 'theme', themeId: 'take', nom: 'Palette Take', emoji: '🎍', prix: 3000, pro: false, niveauRequis: 6 },

  // --- Pendant les révisions (25/08/2026) : retirées de la vente le
  // 23/09/2026 (demande de Paul) -- `retireDeLaVente` les sort de
  // GAMIF_SECTIONS_BOUTIQUE et d'acheterObjet, mais elles restent ici pour
  // que qui en possède déjà une garde son nom/emoji (collationHtml). ---
  { id: 'collation-cookie', type: 'collation', nom: 'Cookie', emoji: '🍪', prix: 40, pro: false, niveauRequis: 1, retireDeLaVente: true },
  { id: 'collation-lait', type: 'collation', nom: 'Verre de lait', emoji: '🥛', prix: 40, pro: false, niveauRequis: 1, retireDeLaVente: true },
  { id: 'collation-popcorn', type: 'collation', nom: 'Popcorn', emoji: '🍿', prix: 60, pro: false, niveauRequis: 2, retireDeLaVente: true },
  { id: 'collation-soda', type: 'collation', nom: 'Soda', emoji: '🥤', prix: 60, pro: false, niveauRequis: 2, retireDeLaVente: true },

  // --- Bannières de profil (25/08/2026) : retirées de la vente le
  // 23/09/2026 (demande de Paul), même principe -- classeBanniere() a
  // besoin de retrouver l'entrée pour qui en a déjà une équipée. ---
  { id: 'banniere-aurore', type: 'banniere', classe: 'aurore', nom: 'Aurore', emoji: '🌅', prix: 300, pro: false, niveauRequis: 4, retireDeLaVente: true },
  { id: 'banniere-nocturne', type: 'banniere', classe: 'nocturne', nom: 'Nuit étoilée', emoji: '🌌', prix: 300, pro: false, niveauRequis: 4, retireDeLaVente: true },
  { id: 'banniere-jade', type: 'banniere', classe: 'jade', nom: 'Jade', emoji: '🍃', prix: 300, pro: false, niveauRequis: 4, retireDeLaVente: true },
  { id: 'banniere-or', type: 'banniere', classe: 'or', nom: 'Or', emoji: '🪙', prix: 500, pro: false, niveauRequis: 6, retireDeLaVente: true },
  { id: 'banniere-imperiale', type: 'banniere', classe: 'imperiale', nom: 'Impériale', emoji: '👑', prix: 700, pro: true, niveauRequis: 8, retireDeLaVente: true },

  // --- Bordures de bannière de profil et pseudos stylisés (29/09/2026,
  // demande de Paul) : visibles par les autres (profil public, classement,
  // communauté), donc synchronisés vers Supabase (profiles.bordure_active /
  // profiles.pseudo_style), comme le titre. `classe` = suffixe CSS. ---
  { id: 'bordure-sakura', type: 'bordure', classe: 'sakura', nom: 'Bordure Sakura', emoji: '🌸', prix: 800, pro: false, niveauRequis: 5 },
  { id: 'bordure-vague', type: 'bordure', classe: 'vague', nom: 'Bordure Vague', emoji: '🌊', prix: 1500, pro: false, niveauRequis: 10 },
  { id: 'bordure-or', type: 'bordure', classe: 'or', nom: 'Bordure dorée', emoji: '✨', prix: 3000, pro: false, niveauRequis: 20 },
  { id: 'bordure-dragon', type: 'bordure', classe: 'dragon', nom: 'Bordure du Dragon', emoji: '🐉', prix: 6000, pro: false, niveauRequis: 35 },
  { id: 'pseudo-sakura', type: 'pseudo', classe: 'sakura', nom: 'Pseudo Sakura', emoji: '🌸', prix: 600, pro: false, niveauRequis: 5 },
  { id: 'pseudo-jade', type: 'pseudo', classe: 'jade', nom: 'Pseudo Jade', emoji: '🍃', prix: 800, pro: false, niveauRequis: 8 },
  { id: 'pseudo-neon', type: 'pseudo', classe: 'neon', nom: 'Pseudo Néon', emoji: '💡', prix: 1500, pro: false, niveauRequis: 12 },
  { id: 'pseudo-arcenciel', type: 'pseudo', classe: 'arcenciel', nom: 'Pseudo Arc-en-ciel', emoji: '🌈', prix: 2000, pro: false, niveauRequis: 15 },
  { id: 'pseudo-or', type: 'pseudo', classe: 'or', nom: 'Pseudo doré', emoji: '👑', prix: 4000, pro: false, niveauRequis: 25 },

  // --- Boosts : consommable, rachetable à volonté (25/08/2026) ---
  // Prix relevé de 30 à 400 le 23/09/2026 (demande de Paul, "bien bien
  // plus cher") : a 30 pieces, un boost se rachetait plusieurs fois par
  // session (~2 pieces/mot) et n'avait plus rien d'un achat reflechi.
  { id: 'boost-xp-20', type: 'boost', nom: 'Boost XP (20 min, ×2)', emoji: '⚡', prix: 400, pro: false, niveauRequis: 1 }
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
      collationActive: null, banniereActive: null, boostXpJusqua: null,
      bordureActive: null, pseudoStyleActif: null
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

// ---------- Rangs (point 1.5 du backlog envoye par Paul le 28/09/2026) ----------
// Purement cosmetique : un nom de palier plus parlant qu'un simple numero,
// facon jeu competitif -- aucun changement au calcul XP/niveau ci-dessus,
// juste un nom+couleur associes a une plage de niveaux deja existante.
// Seuils remontes le 28/09/2026 (retour de Paul le jour meme : "le niveau
// de rang devrait etre bien plus eleve, ex grand champion niveau 100") --
// Grand Champion doit representer une utilisation vraiment intensive et
// prolongee, pas quelques semaines d'usage normal. Avec la courbe XP
// quadratique existante (niveauDepuisXp), le niveau 100 demande 50*99^2 =
// 490 050 XP, un vrai sommet plutot qu'un palier atteignable en un mois.
const GAMIF_RANGS = [
  { seuil: 1, nom: 'Bronze', emoji: '🥉', couleur: '#a5682f' },
  { seuil: 10, nom: 'Argent', emoji: '🥈', couleur: '#7c8794' },
  { seuil: 20, nom: 'Or', emoji: '🥇', couleur: '#c1902a' },
  { seuil: 30, nom: 'Émeraude', emoji: '💚', couleur: '#2ca367' },
  { seuil: 45, nom: 'Rubis', emoji: '❤️', couleur: '#c22e49' },
  { seuil: 60, nom: 'Diamant', emoji: '💎', couleur: '#2b9ccb' },
  { seuil: 80, nom: 'Champion', emoji: '🏆', couleur: '#8a5cf0' },
  { seuil: 100, nom: 'Grand Champion', emoji: '👑', couleur: '#e06a2a' }
];

// Le tableau est trie par seuil croissant : on garde le dernier palier dont
// le seuil est atteint, jamais besoin de trier a l'appel.
function rangDepuisNiveau(niveau) {
  let rang = GAMIF_RANGS[0];
  for (const r of GAMIF_RANGS) {
    if (niveau >= r.seuil) rang = r;
  }
  return rang;
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
  const gain = Math.round(points * multiplicateurDifficulte(semesterId) * multiplicateurModeDifficile() * boost * (gamifEstPro() ? GAMIF_BOOST_PRO : 1));
  const niveauAvant = niveauDepuisXp(g.xp);
  g.xp += gain;
  const niveauApres = niveauDepuisXp(g.xp);
  if (niveauApres > niveauAvant) {
    noterMonteeNiveau(niveauAvant, niveauApres);
    synchroniserNiveauJeu();
  }
  return gain;
}

// Niveau de jeu visible par les autres (profiles.niveau_jeu), pour le rang
// affiche a cote du pseudo (30/09/2026). Silencieux : un echec n'empeche rien,
// la prochaine montee de niveau ou le prochain chargement reessaiera.
async function synchroniserNiveauJeu() {
  try {
    if (!window.accountUser || !window.kvtProfils || typeof window.kvtProfils.enregistrerProfil !== 'function') return;
    const niveau = niveauDepuisXp(assurerGamification().xp);
    if (!(niveau >= 1) || window.accountUser.niveau_jeu === niveau) return;
    await window.kvtProfils.enregistrerProfil({ niveau_jeu: niveau });
  } catch (e) { /* voir ci-dessus */ }
}

// ---------- Celebration de niveau / de rang (29/09/2026) ----------
// Les niveaux gagnes pendant un quiz sont mis de cote, puis montres une
// seule fois a l'ecran de fin de session (celebrerProgressionSiBesoin,
// appele par les 6 ecrans de fin dans app.js) : un bandeau "Niveau N" a
// chaque niveau, une animation plus marquee quand le rang change.
let celebrationEnAttente = null;

function noterMonteeNiveau(avant, apres) {
  if (!celebrationEnAttente) celebrationEnAttente = { depuis: avant, vers: apres };
  else celebrationEnAttente.vers = apres;
}

// Pure : ce qu'il faut celebrer, ou null.
function contenuCelebration(c) {
  if (!c || !(c.vers > c.depuis)) return null;
  const rangAvant = rangDepuisNiveau(c.depuis);
  const rangApres = rangDepuisNiveau(c.vers);
  return { niveau: c.vers, changeRang: rangAvant.nom !== rangApres.nom, rang: rangApres };
}

function celebrerProgressionSiBesoin() {
  const contenu = contenuCelebration(celebrationEnAttente);
  celebrationEnAttente = null;
  if (!contenu || typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'celebration' + (contenu.changeRang ? ' celebration--rang' : '');
  el.setAttribute('role', 'status');
  el.style.setProperty('--rang-couleur', contenu.rang.couleur);
  el.innerHTML = contenu.changeRang
    ? `<div class="celebration__emoji">${contenu.rang.emoji}</div>
       <div class="celebration__titre">Nouveau rang : ${escapeHtml(contenu.rang.nom)} !</div>
       <div class="celebration__detail">Niveau ${contenu.niveau}</div>`
    : `<div class="celebration__titre">Niveau ${contenu.niveau} !</div>`;
  document.body.appendChild(el);
  const retirer = () => { el.classList.add('celebration--sortie'); setTimeout(() => el.remove(), 400); };
  el.addEventListener('click', retirer);
  setTimeout(retirer, contenu.changeRang ? 6500 : 4500);
}

function gagnerPieces(points, semesterId) {
  if (!points || points < GAMIF_SEUIL_PIECE) return 0;
  const g = assurerGamification();
  const gain = Math.round(GAMIF_PIECES_PAR_MOT * multiplicateurDifficulte(semesterId) * multiplicateurModeDifficile() * (gamifEstPro() ? GAMIF_BOOST_PRO : 1));
  g.pieces += gain;
  return gain;
}

function bonusFinSession(pctSession, semesterId) {
  if (pctSession < GAMIF_SEUIL_BONUS_SESSION) return 0;
  const g = assurerGamification();
  const gain = Math.round(GAMIF_BONUS_SESSION * multiplicateurDifficulte(semesterId) * multiplicateurModeDifficile() * (gamifEstPro() ? GAMIF_BOOST_PRO : 1));
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

// Attribue le bonus du jour -- appelée uniquement depuis mettreAJourStreak(),
// jamais directement, pour ne jamais risquer un double gain le même jour.
function bonusStreak(g) {
  const jours = Math.min(g.streak.compte, GAMIF_STREAK_PLAFOND_JOURS);
  const boostXp = boostXpActif() ? GAMIF_BOOST_XP_MULTIPLICATEUR : 1;
  const boostPro = gamifEstPro() ? GAMIF_BOOST_PRO : 1;
  const gainXp = Math.round(jours * GAMIF_STREAK_XP_PAR_JOUR * boostXp * boostPro);
  const gainPieces = Math.round(jours * GAMIF_STREAK_PIECES_PAR_JOUR * boostPro);
  g.xp += gainXp;
  g.pieces += gainPieces;
  return { xp: gainXp, pieces: gainPieces };
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
  bonusStreak(g);
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

// Classes CSS de la bordure et du style de pseudo equipes par un profil
// (profiles.bordure_active / profiles.pseudo_style) ; '' si rien ou inconnu.
function classeBordure(id) {
  const objet = id ? objetBoutique(id) : null;
  return (objet && objet.type === 'bordure') ? `profil-bordure profil-bordure--${objet.classe}` : '';
}
function classePseudo(id) {
  const objet = id ? objetBoutique(id) : null;
  return (objet && objet.type === 'pseudo') ? `pseudo-style pseudo-style--${objet.classe}` : '';
}

// Ordre des refus : introuvable, déjà possédé (sauf boost, rachetable),
// niveau, Pro, puis les pièces — le niveau et le statut Pro sont des
// conditions d'accès à l'objet lui-même, vérifiées avant de regarder si le
// porte-monnaie suit.
function acheterObjet(id) {
  const g = assurerGamification();
  const objet = objetBoutique(id);
  if (!objet) return { ok: false, motif: 'introuvable' };
  if (objet.retireDeLaVente) return { ok: false, motif: 'plus-en-vente' };
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

// Comme la bannière (voir equiperBanniere ci-dessous) : un titre est visible
// par les autres sur le profil public (demande de Paul, 23/09/2026 : "le
// titre doit etre affiche sur le profile aussi"), il faut donc le
// synchroniser vers Supabase (`profiles.titre_actif`), pas seulement le
// garder dans DB.gamification. Mise à jour optimiste, annulée si
// l'enregistrement distant échoue. Sans compte connecté, on équipe
// seulement en local -- rien à synchroniser.
async function equiperTitre(id) {
  const g = assurerGamification();
  if (id !== null && !g.inventaire.includes(id)) return { ok: false };
  const ancien = g.titreActif;
  g.titreActif = id;
  if (window.accountUser && window.kvtProfils && typeof window.kvtProfils.enregistrerProfil === 'function') {
    const res = await window.kvtProfils.enregistrerProfil({ titre_actif: id });
    if (!res.ok) {
      g.titreActif = ancien;
      return { ok: false, motif: 'sync-echouee' };
    }
  }
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
// Bordure / style de pseudo : meme principe que equiperTitre (mise a jour
// optimiste, annulee si l'enregistrement distant echoue).
const GAMIF_SLOTS_PROFIL = {
  bordure: { slot: 'bordureActive', colonne: 'bordure_active' },
  pseudo: { slot: 'pseudoStyleActif', colonne: 'pseudo_style' }
};
async function equiperCosmetiqueProfil(type, id) {
  const cfg = GAMIF_SLOTS_PROFIL[type];
  const g = assurerGamification();
  if (!cfg) return { ok: false };
  if (id !== null) {
    const objet = objetBoutique(id);
    if (!objet || objet.type !== type || !g.inventaire.includes(id)) return { ok: false };
  }
  const ancien = g[cfg.slot] || null;
  g[cfg.slot] = id;
  if (window.accountUser && window.kvtProfils && typeof window.kvtProfils.enregistrerProfil === 'function') {
    const res = await window.kvtProfils.enregistrerProfil({ [cfg.colonne]: id });
    if (!res.ok) {
      g[cfg.slot] = ancien;
      return { ok: false, motif: 'sync-echouee' };
    }
  }
  return { ok: true };
}

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

// ---------- Cadeaux ponctuels de pièces (voir gamification_grants) ----------
// Contrairement à un ancien essai (28/09/2026, créditées silencieusement dès
// la connexion) : Paul a demandé une vraie carte "à récupérer" sur le
// tableau de bord plutôt qu'un crédit invisible noyé dans un toast — plus
// visible, et ça laisse un vrai geste ("cliquer pour récupérer son cadeau")
// au lieu d'un ajout qu'on peut rater. cadeauxEnAttente est peuplé par
// chargerCadeauxEnAttente() (account.js, appelé à la connexion/au
// rechargement) ; les pièces ne sont créditées qu'au clic, via
// reclamerCadeaux() ci-dessous.
let cadeauxEnAttente = [];

function totalCadeauxEnAttente() {
  return cadeauxEnAttente.reduce((somme, c) => somme + (Number(c.pieces) || 0), 0);
}

// XP offerts (29/09/2026) : meme table, colonne `xp` -- premier usage, rendre
// a lucienrosset36 l'XP perdue lors de l'ecrasement entre deux appareils.
function totalXpCadeauxEnAttente() {
  return cadeauxEnAttente.reduce((somme, c) => somme + (Number(c.xp) || 0), 0);
}

function detailCadeaux(total, totalXp) {
  const parts = [];
  if (total > 0) parts.push(`${iconePiece(14)} ${total} pièce${total > 1 ? 's' : ''} d'or`);
  if (totalXp > 0) parts.push(`${totalXp} XP`);
  return parts.join(' + ');
}

// Carte "cadeau" du tableau de bord : rien si aucun don en attente, sinon
// tout en haut à côté du widget de niveau (voir renderDashboard() dans
// app.js) pour être vue dès l'ouverture de l'app.
function widgetCadeau() {
  if (!cadeauxEnAttente.length) return '';
  const total = totalCadeauxEnAttente();
  const totalXp = totalXpCadeauxEnAttente();
  return `
    <div class="card gamif-cadeau" id="gamifCadeauCard">
      <div class="gamif-cadeau__emoji">🎁</div>
      <div class="gamif-cadeau__texte">
        <div class="gamif-cadeau__titre">Un cadeau t'attend !</div>
        <div class="gamif-cadeau__detail">${detailCadeaux(total, totalXp)} à récupérer</div>
      </div>
      <button class="primary" id="btnReclamerCadeau">Récupérer</button>
    </div>`;
}

// Branché depuis renderDashboard() (app.js) juste après avoir posé le HTML
// du tableau de bord -- mirroring le geste deja fait pour les autres widgets
// dont le rendu vit ici mais dont le cablage des boutons vit la-bas.
function wireWidgetCadeau() {
  const btn = $('#btnReclamerCadeau');
  if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Récupération…';
    await reclamerCadeaux();
  };
}

async function reclamerCadeaux() {
  if (!cadeauxEnAttente.length) return;
  const total = totalCadeauxEnAttente();
  const totalXp = totalXpCadeauxEnAttente();
  const ids = cadeauxEnAttente.map(c => c.id);
  const { error } = await window.sb
    .from('gamification_grants')
    .update({ applique: true })
    .in('id', ids);
  if (error) {
    showToast('Impossible de récupérer le cadeau pour l\'instant, réessaie plus tard.');
    return;
  }
  const g = assurerGamification();
  g.pieces = (g.pieces || 0) + total;
  g.xp = (g.xp || 0) + totalXp;
  cadeauxEnAttente = [];
  await persist();
  showToast(`+${detailCadeaux(total, totalXp).replace(/<[^>]*>/g, '').trim()} reçu !`);
  if (typeof renderCurrentView === 'function') renderCurrentView();
}

function widgetGamification() {
  const g = assurerGamification();
  const prog = progressionNiveau(g.xp);
  const rang = rangDepuisNiveau(prog.niveau);
  const titre = g.titreActif ? objetBoutique(g.titreActif) : null;
  return `
    <div class="card gamif-widget">
      <div class="gamif-widget__niveau">
        <div class="gamif-widget__rang" style="background:${rang.couleur};" title="Palier ${escapeHtml(rang.nom)}, débloqué au niveau ${rang.seuil}">${rang.emoji} ${escapeHtml(rang.nom)}</div>
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

// Bannieres et collations retirees de la vente le 23/09/2026 (demande de
// Paul) : plus de section pour elles ici (voir GAMIF_BOUTIQUE plus haut --
// `retireDeLaVente` -- pour pourquoi les entrees elles-memes restent dans
// le catalogue).
// Apercu d'un theme avant achat (demande de Paul, 28/09/2026) : applique
// live le theme choisi sur toute la page (juste document.documentElement,
// jamais DB.settings.theme -- rien n'est persiste ni pousse au cloud) pour
// que l'utilisateur voie a quoi ca ressemble en vrai avant de depenser ses
// pieces. Remis a zero en quittant la vue Boutique (voir switchView() dans
// app.js) pour ne jamais laisser quelqu'un "coince" dans un theme qu'il n'a
// pas choisi s'il oublie de cliquer sur "Revenir a mon theme".
let boutiqueApercuTheme = null;

const GAMIF_SECTIONS_BOUTIQUE = [
  { type: 'titre', titre: 'Titres', aide: "Affichés à côté de ton niveau, sur le tableau de bord." },
  { type: 'bordure', titre: 'Bordures de profil', aide: "Encadrent l'en-tête de ton profil public, visible par tout le monde." },
  { type: 'pseudo', titre: 'Pseudos stylisés', aide: "Ton pseudo change d'allure partout où il apparaît : classement, communauté, profil." },
  { type: 'theme', titre: 'Thèmes du site', aide: "Débloque une palette normalement réservée au Pro, sans toucher à l'abonnement. Le choix du thème se fait ensuite dans Réglages." },
  { type: 'boost', titre: 'Boosts', aide: "Consommable : s'active tout de suite pour 20 minutes. En racheter un pendant qu'il tourne encore prolonge la durée." }
];

// Vrai si cet objet est celui actuellement porte (retour de Lucien,
// 30/09/2026 : "faut choisir chef" -- on ne voyait pas lequel est equipe).
function objetEstEquipe(o, g) {
  if (!o || !g) return false;
  if (GAMIF_SLOTS_PROFIL[o.type]) return g[GAMIF_SLOTS_PROFIL[o.type].slot] === o.id;
  if (o.type === 'banniere') return g.banniereActive === o.id;
  if (o.type === 'collation') return g.collationActive === o.id;
  if (o.type === 'titre') return g.titreActif === o.id;
  return false;
}

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

  if (GAMIF_SLOTS_PROFIL[o.type]) {
    const actifProfil = g[GAMIF_SLOTS_PROFIL[o.type].slot] === o.id;
    return actifProfil
      ? `<button class="boutique-btn-retirer" data-desequiper="${o.type}" title="Enlever cet objet">Retirer</button>`
      : `<button class="boutique-btn-equiper" data-equiper-profil="${o.type}|${o.id}">Équiper</button>`;
  }
  const slot = o.type === 'banniere' ? 'banniereActive' : (o.type === 'collation' ? 'collationActive' : 'titreActif');
  const actif = g[slot] === o.id;
  const attrEquiper = o.type === 'banniere' ? 'data-equiper-banniere' : (o.type === 'collation' ? 'data-equiper-collation' : 'data-equiper');
  return actif
    ? `<button class="boutique-btn-retirer" data-desequiper="${o.type}" title="Enlever cet objet">Retirer</button>`
    : `<button class="boutique-btn-equiper" ${attrEquiper}="${o.id}">Équiper</button>`;
}

// Equipe l'objet qui vient d'etre achete, quel que soit son type (30/09/2026,
// liste de Paul : "quand tu achete ca equipe pas automatiquement, faut
// cliquer plusieurs fois"). Et son inverse pour le bouton "Retirer".
async function equiperObjetParType(type, id) {
  if (GAMIF_SLOTS_PROFIL[type]) return equiperCosmetiqueProfil(type, id);
  if (type === 'banniere') return equiperBanniere(id);
  if (type === 'collation') return equiperCollation(id);
  if (type === 'titre') return equiperTitre(id);
  return { ok: false };
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
          <div class="card boutique-item ${g.inventaire.includes(o.id) ? 'boutique-item--possede' : ''} ${objetEstEquipe(o, g) ? 'boutique-item--equipe' : ''}">
            <div class="boutique-item__emoji">${o.emoji}</div>
            <div class="boutique-item__nom">${escapeHtml(o.nom)}${objetEstEquipe(o, g) ? ' <span class="boutique-item__coche" title="Équipé" aria-label="Équipé">✓</span>' : ''}</div>
            ${o.pro ? '<div class="boutique-item__pro">Pro</div>' : ''}
            ${o.type === 'theme' ? `<button class="secondary small boutique-item__apercu" data-apercu-theme="${o.themeId}">Aperçu</button>` : ''}
            ${o.type === 'bordure' ? `<div class="boutique-apercu-bordure ${classeBordure(o.id)}"></div>` : ''}
            ${o.type === 'pseudo' ? `<div class="boutique-apercu-pseudo"><span class="${classePseudo(o.id)}">${escapeHtml((window.accountUser && window.accountUser.pseudo) || 'Ton pseudo')}</span></div>` : ''}
            ${boutiqueBouton(o, g, pro, niveauActuel)}
          </div>`).join('')}
      </div>`;
  }).join('');

  container.innerHTML = `
    <h2>Boutique</h2>
    ${boutiqueApercuTheme ? `
    <div class="boutique-apercu-bar">
      <span>Aperçu : ${escapeHtml((GAMIF_BOUTIQUE.find(o => o.themeId === boutiqueApercuTheme) || {}).nom || boutiqueApercuTheme)}</span>
      <button class="secondary small" data-revenir-apercu>Revenir à mon thème</button>
    </div>` : ''}
    <div class="card gamif-solde">
      <span class="gamif-piece">${iconePiece(18)} ${g.pieces} pièce${g.pieces > 1 ? 's' : ''} d'or</span>
      <span style="color:var(--muted); font-size:13px;">Gagnées en révisant — deux pièces d'or par mot correct, un bonus si tu finis une session à 80% ou plus, davantage sur les semestres avancés. Purement décoratif : aucun avantage sur le classement.</span>
    </div>
    ${sections}
    <div class="gamif-retirer-liste">
      ${g.titreActif ? `<button class="lien-retour" data-retirer-titre>Ne plus afficher de titre</button>` : ''}
      ${g.collationActive ? `<button class="lien-retour" data-retirer-collation>Ne plus afficher de collation</button>` : ''}
      ${g.banniereActive ? `<button class="lien-retour" data-retirer-banniere>Ne plus afficher de bannière</button>` : ''}
      ${g.bordureActive ? `<button class="lien-retour" data-retirer-profil="bordure">Ne plus afficher de bordure</button>` : ''}
      ${g.pseudoStyleActif ? `<button class="lien-retour" data-retirer-profil="pseudo">Revenir au pseudo normal</button>` : ''}
    </div>
  `;

  $$('[data-apercu-theme]', container).forEach(b => {
    b.onclick = () => {
      boutiqueApercuTheme = b.dataset.apercuTheme;
      document.documentElement.dataset.theme = boutiqueApercuTheme;
      renderBoutique();
    };
  });
  const btnRevenirApercu = $('[data-revenir-apercu]', container);
  if (btnRevenirApercu) {
    btnRevenirApercu.onclick = () => {
      boutiqueApercuTheme = null;
      document.documentElement.dataset.theme = (DB.settings && DB.settings.theme) || 'dark';
      renderBoutique();
    };
  }
  $$('[data-acheter]', container).forEach(b => {
    b.onclick = async () => {
      const res = acheterObjet(b.dataset.acheter);
      if (!res.ok) { showToast('Achat impossible.'); return; }
      const objet = objetBoutique(b.dataset.acheter);
      const equipable = objet && ['bordure', 'pseudo', 'banniere', 'collation', 'titre'].includes(objet.type);
      if (equipable) {
        const eq = await equiperObjetParType(objet.type, objet.id);
        showToast(eq.ok ? 'Objet acheté et équipé !' : 'Objet acheté (à équiper depuis la boutique).');
      } else {
        showToast('Objet acheté !');
      }
      persist();
      renderBoutique();
      if (typeof renderTopbarProfil === 'function') renderTopbarProfil();
    };
  });
  $$('[data-equiper]', container).forEach(b => {
    b.onclick = async () => { await equiperTitre(b.dataset.equiper); persist(); renderBoutique(); };
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
  $$('[data-equiper-profil]', container).forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      const [type, id] = b.dataset.equiperProfil.split('|');
      const res = await equiperCosmetiqueProfil(type, id);
      if (!res.ok) showToast("Impossible d'équiper cet objet pour l'instant.");
      persist();
      renderBoutique();
      // Signale par Lucien le 29/09/2026 ("on voit rien nulle part") : le
      // pseudo du bandeau du haut n'etait redessine qu'au rechargement.
      if (typeof renderTopbarProfil === 'function') renderTopbarProfil();
    };
  });
  $$('[data-desequiper]', container).forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      await equiperObjetParType(b.dataset.desequiper, null);
      persist();
      renderBoutique();
      if (typeof renderTopbarProfil === 'function') renderTopbarProfil();
    };
  });
  $$('[data-retirer-profil]', container).forEach(b => {
    b.onclick = async () => { await equiperCosmetiqueProfil(b.dataset.retirerProfil, null); persist(); renderBoutique(); if (typeof renderTopbarProfil === 'function') renderTopbarProfil(); };
  });
  const btnRetirerTitre = $('[data-retirer-titre]', container);
  if (btnRetirerTitre) btnRetirerTitre.onclick = async () => { await equiperTitre(null); persist(); renderBoutique(); };
  const btnRetirerCollation = $('[data-retirer-collation]', container);
  if (btnRetirerCollation) btnRetirerCollation.onclick = () => { equiperCollation(null); persist(); renderBoutique(); };
  const btnRetirerBanniere = $('[data-retirer-banniere]', container);
  if (btnRetirerBanniere) btnRetirerBanniere.onclick = async () => { await equiperBanniere(null); persist(); renderBoutique(); };
}
