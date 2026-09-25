// ============================================================
// Kanji Vocab Trainer — logique du renderer (aucune dépendance externe)
// Structure : Semestre 3 / Semestre 4, 12 semaines chacun, ~22 kanji par
// semaine, vocabulaire par kanji, quiz à saisie libre avec score par
// similarité, meilleur score + historique sauvegardés par semaine.
// ============================================================

let DB = null;
let currentView = 'communaute';
let quizSession = null;     // { semesterId, week, queue, index, submitted, lastAnswer, lastResult, totals }
let importPreview = null;   // { rows, errors } — résultat de l'analyse avant import
let browsingWeek = null;    // { semesterId, week } — semaine affichée dans l'onglet Vocabulaire (fusionné : mots + fiches)
let learnImportPreview = null; // { rows, errors } — résultat de l'analyse avant import des fiches (anciennement onglet Apprendre, fusionné dans Vocabulaire)
let reviewPickerMode = 'vocab'; // 'vocab' | 'kanji' | 'kana' — mode choisi sur l'écran de démarrage de Réviser (kanji seul et kana ajoutés le 09/09/2026)
let reviewKanaType = 'hiragana'; // 'hiragana' | 'katakana' — persiste le choix entre deux rendus du picker kana
let reviewVerbeFilter = 'tous'; // 'tous' | 'sans_verbe' | 'verbe_seul' — filtre "avec/sans verbe de base" (09/09/2026), pertinent seulement en mode vocabulaire
let dashboardMode = 'cursus';  // 'cursus' (S0-S6) ou 'jlpt' (modules JLPT) — bascule en haut à droite de l'Accueil
let modalSemaineOuverte = null; // { semesterId, week } — modale de choix ouverte sur une carte du Tableau de bord (09/09/2026), voir renderDashboard()
let modalMotsMasquesOuvert = false; // modale "Mots masqués" ouverte depuis Vocabulaire (17/09/2026), voir renderVocab()
let modalTraceKanji = null; // caractere(s) kanji affiche(s) dans la modale de trace des traits (tache #13, KanjiVG), ou null si fermee

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Registre des lectures (poli/humble/familier, 22/09/2026) : quelques mots
// du cursus (参る, 申す, お母さん...) melangeaient jusque-la ce renseignement
// directement dans le champ "sens" affiche pendant le quiz (ex : "Dire
// (humble)"). Deplace ici dans un champ dedie vocab.registre (voir
// REGISTRE_A_PRECISER dans webapi.js) pour un badge visuel plutot qu'une
// parenthese dans la traduction -- affiche partout ou mot/lecture/sens
// sont montres (tableau de traduction, cartes de quiz).
const REGISTRE_LABELS = { poli: 'poli', humble: 'humble', familier: 'familier', litteraire: 'litteraire' };
function registreBadge(v) {
  if (!v || !v.registre || !REGISTRE_LABELS[v.registre]) return '';
  return `<span class="registre-badge registre-${escapeHtml(v.registre)}">${REGISTRE_LABELS[v.registre]}</span>`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function persist() {
  await window.api.saveData(DB);
}

// ---------- Proverbe japonais du jour (dashboard) ----------
// Petite touche culturelle, purement décorative — change chaque jour (même
// proverbe pour tout le monde une journée donnée), aucune dépendance aux
// données de l'utilisateur.
const JAPANESE_PROVERBS = [
  { kanji: '猿も木から落ちる', lecture: 'さるもきからおちる', sens: 'Même les singes tombent des arbres — tout le monde peut se tromper.' },
  { kanji: '七転び八起き', lecture: 'ななころびやおき', sens: 'Sept chutes, huit relèvements — ne jamais abandonner.' },
  { kanji: '石の上にも三年', lecture: 'いしのうえにもさんねん', sens: 'Trois ans assis sur une pierre — la patience finit par payer.' },
  { kanji: '一期一会', lecture: 'いちごいちえ', sens: 'Une rencontre, une seule fois — chaque instant est unique.' },
  { kanji: '花より団子', lecture: 'はなよりだんご', sens: 'Les brioches plutôt que les fleurs — préférer le concret à l\'apparence.' },
  { kanji: '継続は力なり', lecture: 'けいぞくはちからなり', sens: 'La continuité fait la force.' },
  { kanji: '千里の道も一歩から', lecture: 'せんりのみちもいっぽから', sens: 'Un chemin de mille lieues commence par un pas.' },
  { kanji: '案ずるより産むが易し', lecture: 'あんずるよりうむがやすし', sens: 'Accoucher est plus facile qu\'on ne le craint — on s\'inquiète souvent pour rien.' },
  { kanji: '出る杭は打たれる', lecture: 'でるくいはうたれる', sens: 'Le clou qui dépasse se fait marteler.' },
  { kanji: '二兎を追う者は一兎をも得ず', lecture: 'にとをおうものはいっとをもえず', sens: 'Qui court deux lièvres n\'en attrape aucun.' },
  { kanji: '塵も積もれば山となる', lecture: 'ちりもつもればやまとなる', sens: 'Même la poussière finit par former une montagne.' },
  { kanji: '猫に小判', lecture: 'ねこにこばん', sens: 'Donner une pièce d\'or à un chat — du gâchis pour qui n\'en a pas l\'usage.' },
  { kanji: '光陰矢の如し', lecture: 'こういんやのごとし', sens: 'Le temps passe comme une flèche.' },
  { kanji: '初心忘るべからず', lecture: 'しょしんわするべからず', sens: 'N\'oublie jamais ton intention première.' },
  { kanji: '雨降って地固まる', lecture: 'あめふってじかたまる', sens: 'Après la pluie, la terre durcit — les épreuves renforcent.' }
];
function getProverbOfDay() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const diff = new Date() - start;
  const dayOfYear = Math.floor(diff / 86400000);
  return JAPANESE_PROVERBS[dayOfYear % JAPANESE_PROVERBS.length];
}

// ---------- Aides sur les données ----------
function getSemester(id) {
  return DB.settings.semesters.find(s => s.id === id);
}
function weekKey(semesterId, week) {
  return `${semesterId}-w${week}`;
}
function getKanjiGroup(id) {
  return DB.kanjiGroups.find(k => k.id === id);
}
function getKanjiGroupsForWeek(semesterId, week) {
  return DB.kanjiGroups.filter(g => g.semesterId === semesterId && g.week === week);
}
function getVocabForGroup(groupId) {
  return DB.vocab.filter(v => v.kanjiGroupId === groupId && !estMotMasque(v.id));
}
// ---------- Masquage personnel de mots (17/09/2026) ----------
// Demande de Paul : l'ancien bouton "Suppr." a cote de chaque mot dans
// Vocabulaire supprimait la ligne pour de bon, sans confirmation ni retour
// possible. Remplace par un masquage reversible : le mot disparait de
// Parcourir et des quiz (getVocabForGroup/getVocabForWeek ci-dessous
// filtrent dessus) mais reste dans DB.vocab -- motsMasques n'est qu'une
// liste d'ids en trop par compte, jamais une suppression de donnees.
// Purement personnel : n'affecte que le compte qui masque, ne touche pas
// les autres utilisateurs ni le contenu partage.
function estMotMasque(vocabId) {
  return Array.isArray(DB.motsMasques) && DB.motsMasques.includes(vocabId);
}
async function masquerMot(vocabId) {
  if (!Array.isArray(DB.motsMasques)) DB.motsMasques = [];
  if (!DB.motsMasques.includes(vocabId)) DB.motsMasques.push(vocabId);
  await persist();
}
async function demasquerMot(vocabId) {
  DB.motsMasques = (DB.motsMasques || []).filter(id => id !== vocabId);
  await persist();
}
function motsMasquesDetails() {
  const ids = new Set(DB.motsMasques || []);
  return DB.vocab
    .filter(v => ids.has(v.id))
    .map(v => ({ ...v, kanjiGroup: getKanjiGroup(v.kanjiGroupId) }));
}

function getVocabForWeek(semesterId, week) {
  const groupIds = new Set(getKanjiGroupsForWeek(semesterId, week).map(g => g.id));
  return DB.vocab.filter(v => groupIds.has(v.kanjiGroupId) && !estMotMasque(v.id));
}

// Indice anti-confusion en mode Ecriture (tache #14, demande de Paul) :
// vu une lecture (kana) affichee cote pile, plusieurs mots differents du
// programme peuvent partager EXACTEMENT la meme lecture (homophones,
// ex. きく -> 聞く "ecouter" / 効く "faire effet" / 利く "etre efficace") --
// l'eleve risque d'ecrire le mauvais kanji sans le savoir tant qu'il n'a
// pas vu qu'un piege existe. Cherche dans tout le vocabulaire (pas
// seulement la semaine en cours : le risque de confusion existe meme si
// l'autre mot vient d'un module different) tout autre mot (id different)
// de lecture strictement identique. Plafonne a 3 resultats pour rester
// lisible -- un homophone a 4+ variantes est rarissime dans ce programme.
function motsConfondables(v) {
  if (!v || !v.lecture) return [];
  return DB.vocab
    .filter(autre => autre.id !== v.id && autre.lecture === v.lecture)
    .slice(0, 3);
}

// Trace des traits (tache #13, donnees KanjiVG -- licence CC BY-SA 3.0,
// voir kanjivg-data.js) : certaines fiches kanjiGroup.kanji contiennent
// PLUSIEURS caracteres (ex. "歳/才" ou "在大", deux kanji lies enseignes
// sur la meme fiche) -- on isole chaque caractere kanji reel individuel
// pour afficher son propre trace, dans l'ordre ou il apparait.
function caracteresKanjiDistincts(str) {
  if (!str) return [];
  const trouves = str.match(/[\u4e00-\u9faf\u3400-\u4dbf]/g) || [];
  const vus = new Set();
  const resultat = [];
  for (const c of trouves) {
    if (!vus.has(c)) { vus.add(c); resultat.push(c); }
  }
  return resultat;
}

// KANJIVG_DATA est une variable globale definie par kanjivg-data.js (charge
// avant app.js dans index.html) : { "kanji": ["chemin SVG trait 1", ...] }.
// Absente dans le harnais de tests (fichier non charge) -- renvoie null
// plutot que de planter, comme pour tout caractere hors perimetre KanjiVG.
function tracesDisponibles(kanji) {
  if (typeof KANJIVG_DATA === 'undefined' || !KANJIVG_DATA) return null;
  return KANJIVG_DATA[kanji] || null;
}

// ---------- Filtre "avec/sans verbe de base" (09/09/2026) ----------
// Distingue un verbe de base (kanji + terminaison de conjugaison, ex.
// 泳ぐ/話す/取る, ou un verbe en +する comme 愛する) d'un mot à kanji
// combinés (aucun hiragana, ex. 問題/高校生). Règle validée sur un
// échantillon avec Paul avant généralisation : seuls les vrais verbes sont
// exclus en mode "sans verbe de base" — les mots à un seul kanji, les
// adjectifs en -i et les mots mixtes kanji+hiragana restent dans les deux
// cas (aucune raison de les cacher, ce ne sont pas des verbes).
const VERBE_TERMINAISONS = new Set(['う','く','ぐ','す','つ','ぬ','ぶ','む','ゆ','る']);
function contientKanji(s) {
  return /[\u4e00-\u9fff]/.test(s || '');
}
function contientHiragana(s) {
  return /[\u3041-\u309f]/.test(s || '');
}
function estVerbeDeBase(mot) {
  if (!mot) return false;
  if (mot.endsWith('する') && contientKanji(mot) && mot.length > 2) return true;
  if (!contientKanji(mot) || !contientHiragana(mot)) return false;
  return VERBE_TERMINAISONS.has(mot[mot.length - 1]);
}

// ---------- "Mots à kanji groupés" (09/09/2026) ----------
// Différencie les mots composés de plusieurs kanji SANS hiragana (ex.
// 問題, 先生) des mots "simples" : un seul kanji (半), un verbe (泳ぐ), ou
// un adjectif en -i (高い). Décidé avec Paul en cours de route, deux
// fois : (1) pas de distinction onyomi/kunyomi — les mots kunyomi groupés
// comme 子供/名前 comptent aussi comme "groupés" (une tentative de
// détection automatique du type de lecture, testée sur les ~1900 mots
// réels, s'est avérée peu fiable : le sokuon/rendaku cassent la
// correspondance même sur de vrais onyomi comme 学校 がっこう). (2) les
// mots à kanji groupés qui restent des verbes à l'usage (電話, 旅行,
// 勉強... = +する, même stockés ici sous leur forme nominale seule)
// comptent AUSSI comme "groupés" — pas d'exception : seule la structure
// du mot (plusieurs kanji, zéro hiragana) décide.
function estKanjiGroupe(mot) {
  if (!mot) return false;
  if (mot.length <= 1) return false;
  return contientKanji(mot) && !contientHiragana(mot);
}

function filtrerVocabParVerbe(vocabList, filtre) {
  // 'sans_verbe'/'verbe_seul' : premier filtre livré (tâche 4), plus exposé
  // dans le picker depuis que "Mots à kanji groupés"/"Mots simples" l'a
  // remplacé (09/09/2026), mais gardé fonctionnel ici pour ne pas casser
  // ce qui l'utilisait déjà.
  if (filtre === 'sans_verbe') return vocabList.filter(v => !estVerbeDeBase(v.mot));
  if (filtre === 'verbe_seul') return vocabList.filter(v => estVerbeDeBase(v.mot));
  if (filtre === 'kanji_groupe') return vocabList.filter(v => estKanjiGroupe(v.mot));
  if (filtre === 'simple') return vocabList.filter(v => !estKanjiGroupe(v.mot));
  if (filtre === 'aucun') return [];
  return vocabList;
}

// Libellé court du filtre "Mots", pour l'afficher tel quel sur le Tableau
// de bord (carte de semaine en cours ou déjà terminée) et dans la modale
// de démarrage par semaine (09/09/2026) -- Paul veut voir quel type de
// test a été fait, pas seulement le score/la progression.
function libelleFiltreMots(filtre) {
  if (filtre === 'kanji_groupe') return 'mots à kanji groupés';
  if (filtre === 'simple') return 'mots simples';
  if (filtre === 'aucun') return 'aucun mot';
  return 'tous les mots';
}

// ---------- Mode "Kanji seul" (onyomi/kunyomi) — 09/09/2026 ----------
// Namespace de données totalement séparé de DB.scores/DB.inProgress : un
// nouveau mode de quiz ne doit jamais pouvoir écraser ou se mélanger avec
// les scores du quiz vocabulaire existant (voir la panne de synchronisation
// du 29-30/08/2026 — depuis, toute nouvelle mécanique vit dans son propre
// coin des données, jamais superposée à un namespace existant).
// Rang 2 du chantier de septembre 2026 (fondation demandee par Paul :
// "un temps de 5 min bat un de 10") -- chronometre chaque session de quiz
// depuis son debut (ou sa reprise si une session sauvegardee existait,
// startedAt est alors conserve tel quel) jusqu'a la derniere reponse.
// Sert de base a un futur classement par vitesse (voir la feuille de
// route) ; pour l'instant seulement enregistre et affiche en fin de
// session.
function formatDuree(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min === 0 ? `${sec} s` : `${min} min ${String(sec).padStart(2, '0')} s`;
}

// ---------- Score composite (#5, rang 5) ----------
// Un indice 0-100 qui combine precision, vitesse, assiduite et difficulte
// du contenu, pour comparer des sessions tres differentes (une semaine
// facile bien maitrisee vs. une semaine dure tentee plusieurs fois) sur une
// seule echelle. Utilise a la fois par les stats personnelles ci-dessous et
// par le classement global (leaderboard.js), donc defini ici -- app.js se
// charge avant les deux.
const KVT_DUREE_REF_MS = 10 * 60 * 1000; // 10 min : session de reference pour la vitesse
const KVT_ESSAIS_REF = 5;                // 5 tentatives ou plus = assiduite maximale
// Kanji seul est le plus exigeant (aucun indice de sens ni de lecture pour
// s'aider) ; Double reponse et Traduction demandent plus qu'un simple choix ;
// Vocabulaire (mode de base) sert de reference.
const KVT_MODE_DIFFICULTE = { vocab: 0.4, traduction: 0.6, double: 0.8, kanji: 1.0 };

// Position d'un semestre dans le programme, normalisee entre 0 (premier) et
// 1 (dernier) -- sert de proxy de difficulte. Un semestre inconnu (deck
// partage par exemple) reçoit une difficulte moyenne plutot que d'être
// avantage ou penalise arbitrairement.
function positionSemestre(semesterId) {
  const ordre = (DB.settings.semesters || []).map(s => s.id);
  const i = ordre.indexOf(semesterId);
  if (i === -1 || ordre.length < 2) return 0.5;
  return i / (ordre.length - 1);
}

// { pct, dureeMs, essais, semesterId, mode } -> score composite entre 0 et 100.
function scoreComposite({ pct, dureeMs, essais, semesterId, mode }) {
  const precision = Math.max(0, Math.min(1, (Number(pct) || 0) / 100));
  const vitesse = Number.isFinite(dureeMs) && dureeMs > 0
    ? Math.max(0, Math.min(1, 1 - dureeMs / KVT_DUREE_REF_MS))
    : 0.5; // pas de duree enregistree (anciennes sessions) : ni avantage ni penalite
  const assiduite = Math.max(0, Math.min(1, (Number(essais) || 0) / KVT_ESSAIS_REF));
  const difficulteMode = KVT_MODE_DIFFICULTE[mode] != null ? KVT_MODE_DIFFICULTE[mode] : 0.5;
  const difficulte = 0.7 * positionSemestre(semesterId) + 0.3 * difficulteMode;
  const score = 0.5 * precision + 0.2 * vitesse + 0.15 * assiduite + 0.15 * difficulte;
  return Math.round(score * 100);
}

// Score composite personnel : moyenne du score composite de chaque meilleur
// resultat, sur les 4 modes synchronises avec le classement (vocab, kanji,
// traduction, double -- voir leaderboard.js pour la meme exclusion de Kana
// et Pratique, qui n'ont pas de couple semestre/semaine). Purement local,
// aucun appel reseau : les donnees existent deja dans DB.
function getScoreCompositePersonnel() {
  const NAMESPACES = [
    { champ: 'scores', mode: 'vocab' },
    { champ: 'scoresKanji', mode: 'kanji' },
    { champ: 'scoresTraduction', mode: 'traduction' },
    { champ: 'scoresDouble', mode: 'double' }
  ];
  let somme = 0, nb = 0;
  NAMESPACES.forEach(({ champ, mode }) => {
    const namespace = DB[champ];
    if (!namespace) return;
    Object.entries(namespace).forEach(([key, entry]) => {
      if (!entry || !entry.best) return;
      const m = key.match(/^(.+)-w(\d+)$/);
      const semesterId = m ? m[1] : null;
      somme += scoreComposite({
        pct: entry.best.pct,
        dureeMs: entry.best.dureeMs,
        essais: entry.history ? entry.history.length : 0,
        semesterId,
        mode
      });
      nb += 1;
    });
  });
  return nb === 0 ? null : Math.round(somme / nb);
}

// Nombre total de sessions jouees, mode Vocabulaire (comme "Sessions
// jouees" sur la page Statistiques) -- extrait pour etre reutilisable
// depuis le resume compact du Profil (demande de Paul, 23/09/2026 :
// statistiques aussi sur le profil perso, en resume).
function getTotalSessionsJouees() {
  let total = 0;
  DB.settings.semesters.forEach(sem => {
    for (let w = 1; w <= getMaxRelevantWeek(sem); w++) {
      const entry = getScoreEntry(sem.id, w);
      if (entry) total += entry.history.length;
    }
  });
  return total;
}

// ---------- Graphique hexagonal de performance (#4, rang 5) ----------
// 6 axes choisis avec Paul : précision, vitesse, régularité, volume,
// difficulté, progression. Comme le score composite, tout est calculé
// localement à partir de DB -- aucun appel réseau, marche hors ligne.
const KVT_STREAK_REF = 30; // 30 jours d'affilée = régularité maximale sur l'axe

// Rassemble l'historique des 4 modes synchronisés avec le classement, trié
// chronologiquement -- sert à mesurer la tendance récente (axe progression).
function getAllSessionsTousModes() {
  const NAMESPACES = ['scores', 'scoresKanji', 'scoresTraduction', 'scoresDouble'];
  const all = [];
  NAMESPACES.forEach((champ) => {
    const namespace = DB[champ];
    if (!namespace) return;
    Object.values(namespace).forEach((entry) => {
      (entry.history || []).forEach((h) => all.push(h));
    });
  });
  all.sort((a, b) => a.date.localeCompare(b.date));
  return all;
}

// Calcule les 6 axes, chacun normalisé entre 0 et 1 (1 = meilleur).
function getHexagoneStats() {
  const NAMESPACES = ['scores', 'scoresKanji', 'scoresTraduction', 'scoresDouble'];
  let sommePct = 0, nbPct = 0;
  let sommeDuree = 0, nbDuree = 0;
  let sommePosition = 0, nbPosition = 0;

  NAMESPACES.forEach((champ) => {
    const namespace = DB[champ];
    if (!namespace) return;
    Object.entries(namespace).forEach(([key, entry]) => {
      if (!entry || !entry.best) return;
      sommePct += entry.best.pct; nbPct += 1;
      if (Number.isFinite(entry.best.dureeMs) && entry.best.dureeMs > 0) {
        sommeDuree += entry.best.dureeMs; nbDuree += 1;
      }
      const m = key.match(/^(.+)-w(\d+)$/);
      if (m) { sommePosition += positionSemestre(m[1]); nbPosition += 1; }
    });
  });

  const precision = nbPct ? (sommePct / nbPct) / 100 : 0;
  const vitesse = nbDuree ? Math.max(0, Math.min(1, 1 - (sommeDuree / nbDuree) / KVT_DUREE_REF_MS)) : 0;
  const streakCompte = (DB.gamification && DB.gamification.streak && DB.gamification.streak.compte) || 0;
  const regularite = Math.max(0, Math.min(1, streakCompte / KVT_STREAK_REF));
  const motsVus = DB.wordStats ? Object.keys(DB.wordStats).length : 0;
  const volume = (DB.vocab && DB.vocab.length) ? Math.max(0, Math.min(1, motsVus / DB.vocab.length)) : 0;
  const difficulte = nbPosition ? sommePosition / nbPosition : 0;

  const sessions = getAllSessionsTousModes();
  // Tendance récente : moitié la plus ancienne vs. moitié la plus récente de
  // l'historique. Pas assez de sessions pour comparer : valeur neutre au
    // centre du graphique, ni signal positif ni négatif.
  let progression = 0.5;
  if (sessions.length >= 4) {
    const moitie = Math.floor(sessions.length / 2);
    const moyenne = (liste) => liste.reduce((s, h) => s + h.pct, 0) / liste.length;
    const tendance = moyenne(sessions.slice(-moitie)) - moyenne(sessions.slice(0, moitie)); // en points de %
    progression = Math.max(0, Math.min(1, (tendance + 20) / 40)); // -20..+20 pts -> 0..1
  }

  return {
    precision, vitesse, regularite, volume, difficulte, progression,
    aucuneDonnee: nbPct === 0
  };
}

// Rend le graphique en SVG pur, à la main (aucune librairie de graphiques
// dans ce projet -- même choix que pour l'animation des traits KanjiVG).
function renderHexagoneSvg(stats) {
  const AXES = [
    { key: 'precision', label: 'Précision' },
    { key: 'vitesse', label: 'Vitesse' },
    { key: 'regularite', label: 'Régularité' },
    { key: 'volume', label: 'Volume' },
    { key: 'difficulte', label: 'Difficulté' },
    { key: 'progression', label: 'Progression' }
  ];
  const CENTRE = 140, RAYON = 104, N = AXES.length;
  const angle = (i) => -Math.PI / 2 + i * (2 * Math.PI / N);
  const point = (i, v) => ({
    x: CENTRE + Math.cos(angle(i)) * RAYON * v,
    y: CENTRE + Math.sin(angle(i)) * RAYON * v
  });
  const polygone = (v) => AXES.map((_, i) => { const p = point(i, v); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');

  const grilles = [0.25, 0.5, 0.75, 1].map((v) => `<polygon points="${polygone(v)}" class="hexa-grille" />`).join('');
  const axes = AXES.map((_, i) => {
    const p = point(i, 1);
    return `<line x1="${CENTRE}" y1="${CENTRE}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" class="hexa-axe" />`;
  }).join('');
  const donnees = AXES.map((a, i) => {
    const v = Math.max(0, Math.min(1, stats[a.key] || 0));
    const p = point(i, v);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');
  const labels = AXES.map((a, i) => {
    const p = point(i, 1.24);
    const ancrage = Math.abs(p.x - CENTRE) < 4 ? 'middle' : (p.x > CENTRE ? 'start' : 'end');
    return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="${ancrage}" class="hexa-label">${escapeHtml(a.label)}</text>`;
  }).join('');

  return `
    <svg viewBox="-50 -15 380 310" class="hexa-svg" role="img" aria-label="Graphique hexagonal de performance">
      ${grilles}
      ${axes}
      <polygon points="${donnees}" class="hexa-donnees" />
      ${labels}
    </svg>`;
}

function getKanjiScoreEntry(semesterId, week) {
  return (DB.scoresKanji && DB.scoresKanji[weekKey(semesterId, week)]) || null;
}
function recordKanjiSessionResult(semesterId, week, points, maxPoints, pct, dureeMs) {
  if (!DB.scoresKanji) DB.scoresKanji = {};
  const key = weekKey(semesterId, week);
  if (!DB.scoresKanji[key]) DB.scoresKanji[key] = { best: null, history: [] };
  const entry = DB.scoresKanji[key];
  const record = { date: new Date().toISOString(), points, maxPoints, pct, dureeMs };
  entry.history.push(record);
  if (!entry.best || pct > entry.best.pct) entry.best = record;
}
// Un item par lecture existante (onyomi et/ou kunyomi) de chaque kanji de la
// semaine — un kanji qui n'a qu'un seul type de lecture ne génère qu'un
// seul item (rien à inventer pour l'autre type, couvre "ou une seule si
// obligatoire" de la demande).
function buildKanjiQueue(semesterId, week) {
  const groups = getKanjiGroupsForWeek(semesterId, week);
  const items = [];
  groups.forEach(g => {
    if (g.onyomi && g.onyomi.trim()) items.push({ groupId: g.id, type: 'onyomi' });
    if (g.kunyomi && g.kunyomi.trim()) items.push({ groupId: g.id, type: 'kunyomi' });
  });
  return items;
}
function getValidKanjiInProgress(semesterId, week) {
  if (!DB.inProgressKanji) return null;
  const saved = DB.inProgressKanji[weekKey(semesterId, week)];
  if (!saved || !Array.isArray(saved.queue) || !Array.isArray(saved.answers)) return null;
  const currentQueue = buildKanjiQueue(semesterId, week);
  const stillValid = saved.queue.length === currentQueue.length &&
    saved.queue.every((item, i) => item.groupId === currentQueue[i].groupId && item.type === currentQueue[i].type);
  if (!stillValid || saved.index >= saved.queue.length) return null;
  return saved;
}
function saveKanjiInProgress() {
  if (!quizSession || quizSession.mode !== 'kanji') return;
  if (!DB.inProgressKanji) DB.inProgressKanji = {};
  DB.inProgressKanji[weekKey(quizSession.semesterId, quizSession.week)] = {
    queue: quizSession.queue,
    index: quizSession.answers.length,
    totals: { ...quizSession.totals },
    hardcore: quizSession.hardcore,
    answers: quizSession.answers.slice(),
    updatedAt: new Date().toISOString()
  };
  persist();
}
function clearKanjiInProgress(semesterId, week) {
  if (DB.inProgressKanji) delete DB.inProgressKanji[weekKey(semesterId, week)];
}
// Les champs onyomi/kunyomi stockent plusieurs lectures concaténées SANS
// séparateur fiable entre elles (ex. 上 -> onyomi "シャンショウジョウ" = 3
// lectures collées ; kunyomi "あ.がるあ.げる" = 2 lectures collées) : un
// découpage automatique en lectures individuelles n'est pas fiable sans
// dictionnaire externe. On note donc par présence plutôt que par
// découpage : si la réponse (une seule lecture) apparaît telle quelle dans
// le bloc nettoyé des marqueurs KANJIDIC (points, tirets), elle est juste
// en entier — une seule lecture suffit, comme demandé. Sinon, crédit
// partiel par similarité avec le bloc entier, pour rester cohérent avec la
// notation du quiz vocabulaire.
function nettoieLectureBrute(s) {
  return (s || '').replace(/[.\-（）\s]/g, '');
}
function scoreLectureKanji(input, blocLectures) {
  const blocNet = nettoieLectureBrute(blocLectures);
  const inputNet = nettoieLectureBrute(input);
  if (!inputNet) return { pct: 0, points: 0 };
  if (blocNet.includes(inputNet)) {
    return { pct: 1, points: DB.settings.pointsPerWord };
  }
  return scoreAnswer(inputNet, blocNet);
}
function getScoreEntry(semesterId, week) {
  return DB.scores[weekKey(semesterId, week)] || null;
}
// Réduire le nombre de semaines d'un semestre (Réglages) ne doit rendre les
// semaines suivantes "moins visibles" QUE sur le tableau de bord — pas les
// rendre injoignables partout. Sans ça, du vocabulaire déjà importé (ou des
// scores déjà obtenus) au-delà du nouveau réglage disparaissait des menus
// de Vocabulaire / Statistiques, alors qu'il existe toujours.
function getMaxRelevantWeek(sem) {
  let max = sem.weeks;
  DB.kanjiGroups.forEach(g => {
    if (g.semesterId === sem.id && g.week > max) max = g.week;
  });
  Object.keys(DB.scores).forEach(key => {
    const m = key.match(/^(.+)-w(\d+)$/);
    if (m && m[1] === sem.id) {
      const w = parseInt(m[2], 10);
      if (w > max) max = w;
    }
  });
  return max;
}
function recordSessionResult(semesterId, week, points, maxPoints, pct, verbeFilter, dureeMs) {
  const key = weekKey(semesterId, week);
  if (!DB.scores[key]) DB.scores[key] = { best: null, history: [] };
  const entry = DB.scores[key];
  // verbeFilter (09/09/2026) : quel filtre "Mots" a servi pour cette
  // tentative (tous / kanji_groupe / simple), pour pouvoir l'afficher sur
  // le Tableau de bord -- Paul veut savoir quel type de test a ete fait,
  // pas seulement le score. Absent sur les tentatives enregistrees avant
  // ce changement (undefined, gere a l'affichage).
  const record = { date: new Date().toISOString(), points, maxPoints, pct, dureeMs, verbeFilter: verbeFilter || 'tous' };
  entry.history.push(record);
  if (!entry.best || pct > entry.best.pct) {
    entry.best = record;
  }
}

// ---------- "Reprendre où on s'est arrêté" ----------
// Parcourt toutes les semaines ayant au moins une session enregistrée et
// renvoie celle dont la dernière tentative est la plus récente (peu
// importe le score obtenu — on suit juste la progression dans le temps).
function getLastStudiedWeek() {
  let latest = null;
  DB.settings.semesters.forEach(sem => {
    for (let w = 1; w <= sem.weeks; w++) {
      const entry = getScoreEntry(sem.id, w);
      if (!entry || entry.history.length === 0) continue;
      const lastDate = entry.history.reduce((max, r) => (r.date > max ? r.date : max), entry.history[0].date);
      if (!latest || lastDate > latest.date) {
        latest = { semesterId: sem.id, week: w, date: lastDate };
      }
    }
  });
  return latest;
}

// ---------- Session interrompue en cours de semaine (reprise possible) ----------
// Sauvegardée dans DB.inProgress (persistée comme le reste des données, donc
// synchronisée entre appareils si un compte est connecté) après chaque mot
// répondu, pour ne rien perdre si l'app est fermée en plein milieu d'une
// semaine. Effacée dès que la semaine est terminée ou explicitement
// recommencée.
function getValidInProgress(semesterId, week) {
  if (!DB.inProgress) return null;
  const saved = DB.inProgress[weekKey(semesterId, week)];
  if (!saved || !Array.isArray(saved.queue) || !Array.isArray(saved.answers)) return null;
  // Le filtre "avec/sans verbe de base" (09/09/2026) actif au démarrage de
  // la session est celui qui compte ici, pas le filtre courant du picker —
  // sinon une reprise après avoir changé le filtre serait à tort jugée
  // périmée (nombre de mots différent) alors que la file elle-même reste
  // parfaitement valide.
  const vocabList = filtrerVocabParVerbe(getVocabForWeek(semesterId, week), saved.verbeFilter || 'tous');
  const currentIds = new Set(vocabList.map(v => v.id));
  // Si le vocabulaire de la semaine a changé depuis (mots ajoutés/retirés),
  // la sauvegarde partielle n'est plus fiable — on l'ignore plutôt que de
  // risquer un décalage d'index.
  const stillValid = saved.queue.length === vocabList.length && saved.queue.every(id => currentIds.has(id));
  if (!stillValid || saved.index >= saved.queue.length) return null;
  return saved;
}

function saveInProgress() {
  if (!quizSession) return;
  if (!DB.inProgress) DB.inProgress = {};
  DB.inProgress[weekKey(quizSession.semesterId, quizSession.week)] = {
    queue: quizSession.queue,
    index: quizSession.answers.length,
    totals: { ...quizSession.totals },
    hardcore: quizSession.hardcore,
    verbeFilter: quizSession.verbeFilter || 'tous',
    answers: quizSession.answers.slice(),
    updatedAt: new Date().toISOString()
  };
  persist();
}

function clearInProgress(semesterId, week) {
  if (DB.inProgress) delete DB.inProgress[weekKey(semesterId, week)];
}

// Cherche, parmi toutes les semaines, la session interrompue la plus
// récemment touchée — utilisée pour la bannière "Reprendre" du tableau de
// bord, prioritaire sur la simple suggestion de semaine suivante.
function getMostRecentInProgress() {
  if (!DB.inProgress) return null;
  let best = null;
  DB.settings.semesters.forEach(sem => {
    for (let w = 1; w <= sem.weeks; w++) {
      const saved = getValidInProgress(sem.id, w);
      if (saved && (!best || saved.updatedAt > best.updatedAt)) {
        best = { semesterId: sem.id, week: w, index: saved.index, total: saved.queue.length, updatedAt: saved.updatedAt };
      }
    }
  });
  return best;
}

// Semaine suivante dans l'ordre canonique des semestres (voir
// DB.settings.semesters, déjà trié par migrate() dans webapi.js). Renvoie
// null si semesterId/week est déjà la toute dernière semaine du programme.
function getNextWeekAfter(semesterId, week) {
  const semesters = DB.settings.semesters;
  const idx = semesters.findIndex(s => s.id === semesterId);
  if (idx === -1) return null;
  const sem = semesters[idx];
  if (week < sem.weeks) return { semesterId: sem.id, week: week + 1 };
  const nextSem = semesters[idx + 1];
  return nextSem ? { semesterId: nextSem.id, week: 1 } : null;
}

// ---------- Recommandation "Recommandé pour toi" (09/09/2026) ----------
// Distincte de la bannière "Reprendre où tu t'es arrêté" ci-dessus (qui
// couvre déjà la progression vers la semaine suivante non commencée) :
// celle-ci repère plutôt une semaine DÉJÀ FAITE mais avec un score faible,
// pour suggérer de la retravailler. Même seuil que MISS_THRESHOLD (60%,
// déjà utilisé ailleurs pour la couleur "mauvais" du feedback de quiz) afin
// de rester cohérent sur ce qui compte comme "faible" dans toute l'app.
// Vocabulaire uniquement pour l'instant (pas kanji seul / kana) : ce sont
// les seuls scores déjà exploités ailleurs sur ce tableau de bord.
const RECO_SEUIL_FAIBLE = 60;
function getWeakestWeek() {
  let pire = null;
  DB.settings.semesters.forEach(sem => {
    for (let w = 1; w <= sem.weeks; w++) {
      const entry = getScoreEntry(sem.id, w);
      if (!entry || entry.best.pct >= RECO_SEUIL_FAIBLE) continue;
      if (!pire || entry.best.pct < pire.pct) {
        pire = { semesterId: sem.id, week: w, pct: entry.best.pct, points: entry.best.points, maxPoints: entry.best.maxPoints };
      }
    }
  });
  return pire;
}

// ---------- Historique des erreurs : suivi par mot ----------
// Un mot est considéré "raté" en dessous de 60% de similarité, seuil déjà
// utilisé ailleurs dans l'app (couleur "bad" du feedback de quiz).
const MISS_THRESHOLD = 0.6;

function recordWordAttempt(vocabId, pct) {
  if (!DB.wordStats) DB.wordStats = {};
  const stat = DB.wordStats[vocabId] || { attempts: 0, sumPct: 0, misses: 0, lastPct: null, lastDate: null };
  stat.attempts += 1;
  stat.sumPct += pct;
  if (pct < MISS_THRESHOLD) stat.misses += 1;
  stat.lastPct = pct;
  stat.lastDate = new Date().toISOString();
  DB.wordStats[vocabId] = stat;
}

// Mots les plus souvent ratés, du pire au meilleur. Ignore les mots
// supprimés depuis (plus de vocab correspondant).
function getWorstWords(limit) {
  if (!DB.wordStats) return [];
  const list = Object.keys(DB.wordStats).map(vocabId => {
    const stat = DB.wordStats[vocabId];
    const v = DB.vocab.find(x => x.id === vocabId);
    if (!v) return null;
    const g = getKanjiGroup(v.kanjiGroupId);
    return {
      vocabId, mot: v.mot, lecture: v.lecture, sens: v.sens,
      kanji: g ? g.kanji : '', semesterId: g ? g.semesterId : '', week: g ? g.week : 0,
      attempts: stat.attempts, misses: stat.misses,
      avgPct: stat.sumPct / stat.attempts
    };
  }).filter(Boolean);
  list.sort((a, b) => a.avgPct - b.avgPct || b.misses - a.misses);
  return list.slice(0, limit || 15);
}

// ---------- Barème : distance de Levenshtein → score proportionnel ----------
// Deux ajustements pour coller à la vraie difficulté du japonais plutôt qu'à
// une comparaison lettre à lettre aveugle :
//  1) certaines confusions de kana sont "presque justes" phonétiquement/visuellement
//     (dakuten か/が, petit っ/やゆよ, voyelle longue ー) : elles coûtent moins
//     cher qu'une lettre totalement différente.
//  2) sur un mot très court, une seule lettre d'écart pèse énormément en
//     proportion (ex: 1 lettre fausse sur 2 = -50%) ; on adoucit un peu ce cas
//     précis (voir similarity()) sans donner de points gratuits aux réponses
//     franchement fausses.
const KANA_CLOSE_PAIRS = (() => {
  const pairs = [
    ['か', 'が'], ['き', 'ぎ'], ['く', 'ぐ'], ['け', 'げ'], ['こ', 'ご'],
    ['さ', 'ざ'], ['し', 'じ'], ['す', 'ず'], ['せ', 'ぜ'], ['そ', 'ぞ'],
    ['た', 'だ'], ['ち', 'ぢ'], ['つ', 'づ'], ['て', 'で'], ['と', 'ど'],
    ['は', 'ば'], ['ば', 'ぱ'], ['は', 'ぱ'],
    ['ひ', 'び'], ['び', 'ぴ'], ['ひ', 'ぴ'],
    ['ふ', 'ぶ'], ['ぶ', 'ぷ'], ['ふ', 'ぷ'],
    ['へ', 'べ'], ['べ', 'ぺ'], ['へ', 'ぺ'],
    ['ほ', 'ぼ'], ['ぼ', 'ぽ'], ['ほ', 'ぽ'],
    ['う', 'ゔ'],
    ['つ', 'っ'], ['や', 'ゃ'], ['ゆ', 'ゅ'], ['よ', 'ょ'],
    ['あ', 'ぁ'], ['い', 'ぃ'], ['う', 'ぅ'], ['え', 'ぇ'], ['お', 'ぉ'],
    // Voyelle longue notée ー au lieu de la voyelle attendue (ex: おねーさん
    // pour おねえさん) : confusion courante, traitée comme "presque juste".
    ['あ', 'ー'], ['い', 'ー'], ['う', 'ー'], ['え', 'ー'], ['お', 'ー']
  ];
  const set = new Set();
  pairs.forEach(([x, y]) => { set.add(x + y); set.add(y + x); });
  return set;
})();

// Coût réduit pour insérer/supprimer une voyelle longue ー (erreur fréquente :
// おねえさん tapé おねーさん, スーパー vs スパー...).
function editWeight(ch) {
  return ch === 'ー' ? 0.4 : 1;
}

function substitutionCost(x, y) {
  if (x === y) return 0;
  if (KANA_CLOSE_PAIRS.has(x + y)) return 0.4;
  return 1;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + editWeight(a[i - 1]),
        dp[i][j - 1] + editWeight(b[j - 1]),
        dp[i - 1][j - 1] + substitutionCost(a[i - 1], b[j - 1])
      );
    }
  }
  return dp[m][n];
}

// Sur Mac, le clavier japonais convertit parfois automatiquement (ou sur une
// pression accidentelle de Espace/Tab) le romaji tapé en kanji au lieu de le
// laisser en hiragana/katakana — la lecture attendue n'étant jamais en kanji,
// on détecte ce cas pour ne pas pénaliser injustement une réponse par ailleurs
// correcte : dès qu'un caractère kanji traîne dans la saisie, on avertit et on
// laisse retaper au lieu de noter.
function containsKanji(str) {
  return /[一-鿿㐀-䶿]/.test(str || '');
}

// Le katakana et le hiragana notent les mêmes sons avec des caractères
// Unicode différents : sans conversion, une réponse juste écrite en
// katakana serait comparée lettre à lettre à la bonne réponse en hiragana
// et récolterait ~0% de similarité alors qu'elle est phonétiquement exacte.
// On ramène donc tout au hiragana avant de comparer (カ -> か, etc.), ce qui
// correspond à la consigne d'origine : hiragana OU katakana acceptés.
function toHiragana(str) {
  return (str || '').replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// Certaines lectures a plusieurs mots stockent des espaces decoratifs pour
// separer visuellement les mots a l'affichage (ex. "ねむり の もり の
// びじょ", "たいおん を はかる" -- voir le rendu de la carte de quiz).
// Personne ne tape ces espaces en repondant (ni la consigne, ni la saisie
// kana sans IME, ne les demandent) : sans cette normalisation, chaque
// espace de la bonne reponse comptait comme un caractere en trop dans la
// distance de Levenshtein, plombant a tort une reponse par ailleurs
// parfaite (signale par Paul le 23/09/2026 : "ねむりのもりのびじょ" note
// seulement 71% au lieu de 100%). On retire les espaces des DEUX cotes,
// jamais un seul, pour rester symetrique.
function sansEspaces(str) {
  return (str || '').replace(/\s+/g, '');
}

function similarity(input, correct) {
  const a = toHiragana(sansEspaces((input || '').trim()));
  const b = toHiragana(sansEspaces((correct || '').trim()));
  if (a.length === 0 && b.length === 0) return 1;
  if (b.length === 0) return a.length === 0 ? 1 : 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  // Sur un mot court, une seule lettre d'écart (dist <= 1) pèse énormément en
  // proportion — on adoucit uniquement ce cas précis (pas les réponses avec
  // plusieurs erreurs, qui restent notées normalement).
  let effectiveDist = dist;
  if (dist > 0 && dist <= 1) {
    if (maxLen <= 3) effectiveDist = dist * 0.5;
    else if (maxLen <= 4) effectiveDist = dist * 0.7;
  }
  return Math.max(0, 1 - effectiveDist / maxLen);
}

function scoreAnswer(input, correct) {
  // Quelques mots ont plusieurs lectures valables, stockees separees par
  // " / " (ex. 門 -> "もん / かど", confirme par Paul le 09/09/2026) :
  // comparer la reponse tapee a la chaine combinee penalisait a tort une
  // des deux bonnes reponses (jamais 100%, meme en repondant juste). On
  // compare a chaque alternative separement et on garde la meilleure —
  // sans effet sur les mots a lecture unique (pas de "/", une seule
  // alternative = comportement identique a avant).
  const alternatives = (correct || '').split('/').map(s => s.trim()).filter(s => s.length > 0);
  const candidats = alternatives.length > 0 ? alternatives : [correct];
  const pct = Math.max(...candidats.map(c => similarity(input, c)));
  const points = Math.round(pct * DB.settings.pointsPerWord);
  return { pct, points };
}

// Mode "Double reponse" (tache #11, rang 4) : une seule carte affiche le
// mot en kanji, DEUX champs a remplir (lecture + sens), les deux doivent
// etre justes pour marquer des points -- validee par Paul le 22/09/2026
// ("Oui exactement ca"). On reutilise scoreAnswer() tel quel sur chaque
// champ (tolerance aux fautes de frappe deja geree, alternatives "/"
// deja gerees pour les lectures a choix multiple) et on combine par le
// MINIMUM des deux pourcentages, pas une moyenne : une lecture parfaite
// ne doit pas racheter un sens invente, et inversement. La tolerance
// reste au niveau de CHAQUE champ ; seule la combinaison est stricte.
function scoreDoubleAnswer(inputLecture, inputSens, v) {
  const resLecture = scoreAnswer(inputLecture, v.lecture);
  const resSens = scoreAnswer(inputSens, v.sens);
  const pct = Math.min(resLecture.pct, resSens.pct);
  const points = Math.round(pct * DB.settings.pointsPerWord);
  return { pct, points, lecture: resLecture, sens: resSens };
}

// ---------- Saisie kana sans IME (romaji -> hiragana, tache #22) ----------
// Jusque-la, repondre en kana dans les champs qui l'exigent (Pratique,
// Vocabulaire de base, Kanji seul) demandait d'activer le clavier japonais
// du systeme (IME) : romaji -> conversion hiragana -> l'IME propose ensuite
// souvent un candidat en KANJI au moment de valider, alors que l'app ne
// veut jamais de kanji dans ces champs precis (containsKanji() plus haut
// existe deja pour avertir dans ce cas). Plutot que de lutter contre l'IME,
// on integre notre propre transcription romaji -> kana en JS (meme principe
// que wanakana.js, utilise par WaniKani) : l'utilisateur tape des lettres
// latines ordinaires, sans jamais activer de clavier japonais, et voit le
// hiragana apparaitre directement. Limite volontairement a un sous-ensemble
// courant (pas de ligne "v", pas de ゐ/ゑ archaiques, pas de raccourcis
// xtsu/ltsu) : le vocabulaire de l'app n'en a pratiquement jamais besoin
// (4 mots sur 4208 seulement ont une lecture 100% katakana/emprunt).
const ROMAJI_VERS_HIRAGANA = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ',
  za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wo: 'を',
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
  cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
  bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  '-': 'ー',
};
const SOKUON_CONSONNES = new Set(['k','g','s','z','t','d','h','b','p','m','y','r','w','f','j','c']);

function romajiVersHiragana(brut) {
  // Cette fonction retraite l'integralite du champ a chaque frappe (voir
  // activerSaisieKanaDirecte plus bas) : un "n" isole, converti tout de
  // suite en "ん"/"ン" (cf. commentaire ci-dessus), doit pouvoir redevenir
  // un "n" latin en attente si de nouvelles lettres sont tapees juste
  // apres, pour former sa syllabe (na/ni/nu/ne/no, nya/nyu/nyo) au lieu de
  // rester isole devant une syllabe separee. Sans ca, taper "n" puis "a"
  // affichait a tort "んあ" au lieu de "な" (signale par Paul le
  // 23/09/2026, clavier FR) : le "ん"/"ン" deja affiche n'etait pas
  // reconnu comme un "n" latin par la boucle de conversion ci-dessous, qui
  // ne connait que des lettres latines.
  const s = String(brut || '').toLowerCase().replace(/[んン](?=[a-z-])/g, 'n');
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    // Apostrophe juste apres un ん/ン deja ecrit : force la coupure devant la
    // syllabe suivante, comme sur un clavier japonais standard (ex. "n'i" ->
    // んい). Sans ca, aucune facon de distinguer "んい" de "に" -- signale par
    // Paul le 25/09/2026 (mot "ふんいき" tape "funiki" affichait a tort
    // "ふにき"). Ne produit rien : le ん est deja dans `out`, l'apostrophe est
    // juste avalee, et la voyelle qui suit redemarre sa propre syllabe.
    if (c === "'" && (out.slice(-1) === 'ん' || out.slice(-1) === 'ン')) {
      i += 1;
      continue;
    }
    // Consonne doublee (hors "n") -> petit tsu (ex. "kekkon" -> "けっこん")
    if (c === s[i + 1] && SOKUON_CONSONNES.has(c)) {
      out += 'っ';
      i += 1;
      continue;
    }
    // "n" isole : systeme "double n" (demande explicite de Paul le
    // 25/09/2026, "point final") -- calque le clavier japonais qu'il utilise
    // deja sur Mac : "nn" (deux "n" a la suite) donne TOUJOURS un seul ん,
    // quoi qu'il y ait derriere (voyelle, consonne, encore un "n", ou rien
    // du tout). Contrairement a l'ancien systeme "intelligent", le second
    // "n" n'est plus jamais laisse libre d'absorber la voyelle suivante :
    // "nni" donne desormais んい (pas んに), "nna" donne んあ (pas んな). Les
    // deux "n" sont consommes ensemble, et ce qui suit redemarre sa propre
    // syllabe a zero. Consequence acceptee : les mots qui s'ecrivaient avec
    // 2 "n" pour la syllabe absorbee (ex. "annai" -> あんない, "zannen" ->
    // ざんねん, "konnichiwa" -> こんにちは) demandent maintenant un 3e "n"
    // ("annnai", "zannnen", "konnnichiwa") pour retrouver le meme resultat :
    // les 2 premiers "n" donnent le ん isole, le 3e redemarre la syllabe
    // suivante (na/ni/nu/ne/no) normalement.
    if (c === 'n') {
      const suivant = s[i + 1];
      if (suivant === 'n') {
        out += 'ん';
        i += 2;
        continue;
      }
      // "n" isole (pas suivi d'un second "n") : devant une consonne ou en
      // fin de saisie -> ん tout de suite (converti sans attendre : vu que
      // toute la chaine est retraitee a chaque frappe, un "n" isole
      // redevient な/に/... de lui-meme si une voyelle est tapee juste
      // apres). Devant une voyelle ou un "y" : laisse la correspondance
      // normale ci-dessous s'en charger (na/ni/nu/ne/no, nya/nyu/nyo).
      if (suivant === undefined || !'aiueoy'.includes(suivant)) {
        out += 'ん';
        i += 1;
        continue;
      }
    }
    // Plus long groupe romaji connu (3, puis 2, puis 1 caractere)
    let trouve = false;
    for (let len = 3; len >= 1; len--) {
      const bloc = s.slice(i, i + len);
      if (Object.prototype.hasOwnProperty.call(ROMAJI_VERS_HIRAGANA, bloc)) {
        out += ROMAJI_VERS_HIRAGANA[bloc];
        i += len;
        trouve = true;
        break;
      }
    }
    if (!trouve) {
      // Romaji incomplet (ex. "k" en attente de sa voyelle) : garde tel quel
      // le temps que la frappe se poursuive.
      out += c;
      i += 1;
    }
  }
  return out;
}

function hiraganaVersKatakana(str) {
  return (str || '').replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

// Branche la transcription en direct sur un <input> de reponse en kana.
// katakana=true pour le champ onyomi (Kanji seul) : la conversion interne
// reste en hiragana (le bareme normalise deja les deux, voir toHiragana()
// ci-dessus), seul l'affichage passe en katakana pour rester coherent avec
// la consigne "onyomi (katakana)".
function activerSaisieKanaDirecte(input, katakana) {
  if (!input) return;
  input.addEventListener('input', (e) => {
    // Si un IME systeme est malgre tout actif (l'utilisateur peut toujours
    // choisir de taper en japonais plutot qu'en romaji latin), ne pas
    // toucher au champ pendant la composition en cours -- memes gardes que
    // pour la validation par Entree ailleurs dans ce fichier (e.isComposing
    // / keyCode 229), pour ne jamais interferer avec l'IME lui-meme.
    if (e.isComposing || e.keyCode === 229) return;
    const brut = input.value;
    const hira = romajiVersHiragana(brut);
    const converti = katakana ? hiraganaVersKatakana(hira) : hira;
    if (converti === brut) return;
    input.value = converti;
    // La frappe se fait quasi toujours en ajoutant a la fin (petit champ
    // d'un seul mot) : replacer le curseur en fin de champ evite qu'il
    // saute ailleurs a cause du changement de longueur texte tapee ->
    // kana (ex. "ka" 2 caracteres -> "か" 1 seul).
    input.setSelectionRange(converti.length, converti.length);
  });
}

// ---------- Import en masse ----------
function parseImportText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const rows = [];
  const errors = [];
  const semesterIds = DB.settings.semesters.map(s => s.id);

  lines.forEach((line, idx) => {
    if (idx === 0 && /semestre/i.test(line) && /semaine/i.test(line)) return; // ligne d'en-tête
    let fields = line.includes('\t') ? line.split('\t') : line.split(';');
    fields = fields.map(f => f.trim());
    if (fields.length < 6) {
      errors.push(`Ligne ${idx + 1} : ${fields.length} colonne(s) trouvée(s) (6 ou 7 attendues) — ignorée.`);
      return;
    }
    const [semRaw, weekRaw, kanji, titre, mot, lecture, sens] = fields;
    let semesterId = null;
    const s = (semRaw || '').toLowerCase().replace(/\s+/g, '');
    // Reconnaît "S0" à "S9" (ou juste le chiffre) — générique, pas besoin de
    // mettre à jour ce code à chaque nouveau semestre ajouté (S5, S6...).
    const semMatch = s.match(/(\d+)/);
    if (semMatch) semesterId = 's' + semMatch[1];
    if (!semesterId || !semesterIds.includes(semesterId)) {
      errors.push(`Ligne ${idx + 1} : semestre "${semRaw}" non reconnu (utilise S3 ou S4) — ignorée.`);
      return;
    }
    const semDef = getSemester(semesterId);
    const week = parseInt(weekRaw, 10);
    if (!week || week < 1 || week > semDef.weeks) {
      errors.push(`Ligne ${idx + 1} : semaine "${weekRaw}" invalide (1 à ${semDef.weeks}) — ignorée.`);
      return;
    }
    if (!kanji || !mot || !lecture) {
      errors.push(`Ligne ${idx + 1} : kanji, mot ou lecture manquant — ignorée.`);
      return;
    }
    rows.push({ semesterId, week, kanji, titre: titre || '', mot, lecture, sens: sens || '' });
  });

  return { rows, errors };
}

function commitImport(rows) {
  let addedGroups = 0, addedVocab = 0;
  rows.forEach(r => {
    let group = DB.kanjiGroups.find(g => g.semesterId === r.semesterId && g.week === r.week && g.kanji === r.kanji);
    if (!group) {
      group = { id: uid('kg'), semesterId: r.semesterId, week: r.week, kanji: r.kanji, titre: r.titre };
      DB.kanjiGroups.push(group);
      addedGroups++;
    } else if (r.titre && !group.titre) {
      group.titre = r.titre;
    }
    const dup = DB.vocab.find(v => v.kanjiGroupId === group.id && v.mot === r.mot && v.lecture === r.lecture);
    if (!dup) {
      DB.vocab.push({ id: uid('v'), kanjiGroupId: group.id, mot: r.mot, lecture: r.lecture, sens: r.sens });
      addedVocab++;
    }
  });
  return { addedGroups, addedVocab };
}

// ---------- Import en masse : fiches "Apprendre" (annexe, jamais utilisées
// pendant le quiz) ----------
// Une ligne par kanji (pas par mot) : crée le kanjiGroup s'il n'existe pas
// encore (comme l'import Vocabulaire), ou complète ses infos d'étude s'il
// existe déjà. Les deux imports (Vocabulaire et Apprendre) sont donc
// totalement indépendants — plus besoin de faire l'un avant l'autre.
function parseLearnImportText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const rows = [];
  const errors = [];
  const semesterIds = DB.settings.semesters.map(s => s.id);

  lines.forEach((line, idx) => {
    if (idx === 0 && /semestre/i.test(line) && /semaine/i.test(line)) return; // ligne d'en-tête
    let fields = line.includes('\t') ? line.split('\t') : line.split(';');
    fields = fields.map(f => f.trim());
    if (fields.length < 3) {
      errors.push(`Ligne ${idx + 1} : ${fields.length} colonne(s) trouvée(s) (3 à 10 attendues) — ignorée.`);
      return;
    }
    const [semRaw, weekRaw, kanji, onyomi, kunyomi, bushu, phrase, traduction, memo, attention] = fields;
    let semesterId = null;
    const s = (semRaw || '').toLowerCase().replace(/\s+/g, '');
    // Reconnaît "S0" à "S9" (ou juste le chiffre) — générique, pas besoin de
    // mettre à jour ce code à chaque nouveau semestre ajouté (S5, S6...).
    const semMatch = s.match(/(\d+)/);
    if (semMatch) semesterId = 's' + semMatch[1];
    if (!semesterId || !semesterIds.includes(semesterId)) {
      errors.push(`Ligne ${idx + 1} : semestre "${semRaw}" non reconnu — ignorée.`);
      return;
    }
    const semDef = getSemester(semesterId);
    const week = parseInt(weekRaw, 10);
    if (!week || week < 1 || week > semDef.weeks) {
      errors.push(`Ligne ${idx + 1} : semaine "${weekRaw}" invalide (1 à ${semDef.weeks}) — ignorée.`);
      return;
    }
    if (!kanji) {
      errors.push(`Ligne ${idx + 1} : kanji manquant — ignorée.`);
      return;
    }
    rows.push({
      semesterId, week, kanji,
      onyomi: onyomi || '', kunyomi: kunyomi || '', bushu: bushu || '',
      phrase: phrase || '', traduction: traduction || '', memo: memo || '', attention: attention || ''
    });
  });

  return { rows, errors };
}

function commitLearnImport(rows) {
  let updated = 0, created = 0;
  rows.forEach(r => {
    let group = DB.kanjiGroups.find(g => g.semesterId === r.semesterId && g.week === r.week && g.kanji === r.kanji);
    if (!group) {
      group = { id: uid('kg'), semesterId: r.semesterId, week: r.week, kanji: r.kanji, titre: '' };
      DB.kanjiGroups.push(group);
      created++;
    }
    group.onyomi = r.onyomi;
    group.kunyomi = r.kunyomi;
    group.bushu = r.bushu;
    group.phrase = r.phrase;
    group.traduction = r.traduction;
    group.memo = r.memo;
    group.attention = r.attention;
    updated++;
  });
  return { updated, created };
}

function hasLearnInfo(g) {
  return !!(g.onyomi || g.kunyomi || g.bushu || g.phrase || g.memo);
}

// ============================================================
// Navigation
// ============================================================
function switchView(view) {
  // L'animation d'entrée ne se joue que si on change réellement de vue.
  // renderCurrentView() est aussi appelé lors d'un simple re-rendu (statut Pro
  // résolu, connexion...) : rejouer l'animation à ces moments-là donnerait un
  // clignotement sans raison.
  const changementReel = currentView !== view;
  currentView = view;
  $$('.nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => { v.classList.remove('active', 'view-enter'); });
  const el = $('#view-' + view);
  el.classList.add('active');
  renderCurrentView();
  if (changementReel) {
    // Forcer un recalcul de style entre le retrait et l'ajout de la classe,
    // sinon le navigateur regroupe les deux et l'animation ne repart pas.
    void el.offsetWidth;
    el.classList.add('view-enter');
    // Bug #1 (22/09/2026) : tant que .view-enter reste posee, .view a une
    // animation CSS qui touche `transform` -- meme terminee, meme revenue a
    // `none` via l'''animation elle-meme, ca suffit pour que les navigateurs
    // traitent .view comme un bloc de reference pour tout descendant en
    // position:fixed. Resultat : le modal de choix de semaine (position:fixed
    // cense se centrer sur l'''ecran) se retrouvait cale sur la boite de .view
    // -- une zone qui peut faire des milliers de pixels de haut sur un
    // Tableau de bord charge -- au lieu de la fenetre. D'''ou le modal qui
    // s'''ouvrait hors ecran, plus bas ou plus haut selon le defilement. On
    // retire la classe des que l'''animation d'''entree est finie (ou tout de
    // suite si prefers-reduced-motion l'''a supprimee, d'''ou le filet via
    // setTimeout) pour que .view redevienne un conteneur normal.
    const finirEntreeVue = () => el.classList.remove('view-enter');
    el.addEventListener('animationend', (e) => { if (e.target === el) finirEntreeVue(); }, { once: true });
    setTimeout(finirEntreeVue, 260);
  }
}

function renderCurrentView() {
  if (currentView === 'dashboard') renderDashboard();
  else if (currentView === 'manage') renderVocab();
  else if (currentView === 'review') renderReview();
  else if (currentView === 'stats') renderStats();
  else if (currentView === 'download') renderDownload();
  else if (currentView === 'settings') renderSettings();
  else if (currentView === 'account' && typeof renderAccount === 'function') renderAccount();
  else if (currentView === 'leaderboard' && typeof renderLeaderboard === 'function') renderLeaderboard();
  else if (currentView === 'decks' && typeof renderDecks === 'function') renderDecks();
  else if (currentView === 'publier' && typeof renderPublier === 'function') renderPublier();
  else if (currentView === 'deck' && typeof renderDeck === 'function') renderDeck();
  else if (currentView === 'communaute' && typeof renderCommunaute === 'function') renderCommunaute();
  else if (currentView === 'profil' && typeof renderProfilPublic === 'function') renderProfilPublic();
  else if (currentView === 'creation' && typeof renderCreation === 'function') renderCreation();
  else if (currentView === 'admin' && typeof renderAdmin === 'function') renderAdmin();
  else if (currentView === 'boutique' && typeof renderBoutique === 'function') renderBoutique();
  renderSidebarFooter();
  renderTopbarProfil();
}

function renderSidebarFooter() {
  $('#weekBadge').innerHTML = `${DB.vocab.length} mot(s) au total<br/>Sauvegarde locale active`;
}

// Acces rapide a son propre profil depuis n'importe quelle page (23/09/2026,
// demande de Paul : "un acces facile au compte profil utilisateur sur le nom
// ou photo de profil pour voir le profil"). Reutilise auteurHtml(), deja le
// bouton cliquable pose a cote de chaque deck/avis (voir profils.js) : meme
// avatar, meme pseudo, meme clic delegue au document qui ouvre la page de
// profil -- aucun nouveau mecanisme de clic a brancher ici.
async function renderTopbarProfil() {
  const zone = $('#topbarProfil');
  if (!zone || !window.kvtProfils) return;
  if (!window.accountUser) { zone.innerHTML = ''; return; }
  const u = window.accountUser;
  zone.innerHTML = window.kvtProfils.auteurHtml(u.id, u.pseudo, 26);
  // Le cache des profils publics ne contient le sien que si on est deja
  // passe par Compte ou par le profil de quelqu'un d'autre -- sans cet appel,
  // l'avatar resterait bloque sur l'initiale generique tant qu'on n'a pas
  // visite ces pages. chargerProfils() ne refait jamais une requete pour un
  // id deja en cache (voir profils.js), donc cet appel est gratuit apres la
  // toute premiere fois.
  if (!window.kvtProfils.profilDe(u.id)) {
    await window.kvtProfils.chargerProfils([u.id]);
    if (window.accountUser === u) zone.innerHTML = window.kvtProfils.auteurHtml(u.id, u.pseudo, 26);
  }
}

// ---------- Catégories du tableau de bord ----------
// Deux catégories intégrées, déduites de l'identifiant du semestre, et
// autant de catégories libres que l'utilisateur en crée. Un semestre rangé
// dans une catégorie libre quitte sa catégorie intégrée : sinon il
// apparaîtrait à deux endroits et on ne saurait plus où le chercher.

function categoriesLibres() {
  return (DB.settings.categories || []);
}

function categorieDuSemestre(sem) {
  if (sem.categorie && categoriesLibres().some(c => c.id === sem.categorie)) return sem.categorie;
  return sem.id.startsWith('jlpt') ? 'jlpt' : 'cursus';
}

// Les onglets réellement affichés : on ne montre jamais un onglet vide, sauf
// s'il est sélectionné — sinon supprimer le dernier semestre d'une catégorie
// ferait disparaître l'onglet sous le curseur.
function ongletsDashboard() {
  const compte = {};
  DB.settings.semesters.forEach(sem => {
    const c = categorieDuSemestre(sem);
    compte[c] = (compte[c] || 0) + 1;
  });
  const onglets = [
    { id: 'cursus', label: 'Cursus', integre: true },
    { id: 'jlpt', label: 'JLPT', integre: true },
    { id: 'special', label: 'Spécial', integre: true }
  ].concat(categoriesLibres().map(c => ({ id: c.id, label: c.label, integre: false })));
  // 'special' (17/09/2026) : regroupe les 3 nouveaux modes (Écriture,
  // Traduction, Vocabulaire pratique) -- toujours visible comme Cursus,
  // meme si cette categorie ne contient jamais de semestre (ce n'est pas
  // une categorie de semestres, juste 3 points d'entree vers Reviser).
  return onglets.filter(o => compte[o.id] || o.id === dashboardMode || o.id === 'cursus' || o.id === 'special');
}

async function creerCategorie() {
  const nom = (prompt('Nom de la nouvelle catégorie (ex. « Deuxième année », « Decks d\'amis ») :') || '').trim();
  if (!nom) return;
  if (nom.length > 30) { showToast('Nom trop long (30 caractères maximum)'); return; }
  if (categoriesLibres().some(c => c.label.toLowerCase() === nom.toLowerCase())) {
    showToast('Cette catégorie existe déjà'); return;
  }
  const cat = { id: uid('cat'), label: nom };
  DB.settings.categories.push(cat);
  dashboardMode = cat.id;
  await persist();
  renderDashboard();
}

async function renommerCategorie(id) {
  const cat = categoriesLibres().find(c => c.id === id);
  if (!cat) return;
  const nom = (prompt('Nouveau nom :', cat.label) || '').trim();
  if (!nom || nom === cat.label) return;
  cat.label = nom.slice(0, 30);
  await persist();
  renderDashboard();
}

// Supprimer une catégorie ne supprime aucun semestre : ceux qui y étaient
// rangés retournent simplement dans leur catégorie intégrée.
async function supprimerCategorie(id) {
  const cat = categoriesLibres().find(c => c.id === id);
  if (!cat) return;
  const dedans = DB.settings.semesters.filter(s => s.categorie === id).length;
  const message = dedans
    ? `Supprimer la catégorie « ${cat.label} » ?\n\nLes ${dedans} semestre(s) qu'elle contient ne sont pas supprimés : ils retournent dans Cursus ou JLPT.`
    : `Supprimer la catégorie « ${cat.label} » ?`;
  if (!confirm(message)) return;
  DB.settings.categories = categoriesLibres().filter(c => c.id !== id);
  DB.settings.semesters.forEach(s => { if (s.categorie === id) delete s.categorie; });
  dashboardMode = 'cursus';
  await persist();
  renderDashboard();
}

async function rangerSemestre(semesterId, categorieId) {
  const sem = DB.settings.semesters.find(s => s.id === semesterId);
  if (!sem) return;
  if (categorieId === 'cursus' || categorieId === 'jlpt') delete sem.categorie;
  else sem.categorie = categorieId;
  await persist();
  renderDashboard();
}

// ============================================================
// Accueil : grille des semaines par semestre
// ============================================================
// Marque de derniere mise a jour (09/09/2026) : /version.json est genere
// par deploy.sh a chaque publication (voir ce fichier) et n'est jamais mis
// en cache cote navigateur ("cache: no-store" ci-dessous traverse la
// strategie "reseau d'abord" du service worker) - sert a verifier tout de
// suite si un deploiement a bien pris, plutot que de deviner face a un
// cache de navigateur qui n'a pas encore vu la mise a jour. echec silencieux
// (hors-ligne, fichier absent sur un vieux deploiement) : la marque reste
// vide plutot que de planter le tableau de bord pour ca.
function afficherVersionDeploiement() {
  const el = document.getElementById('kvtVersionMarque');
  if (!el) return;
  fetch('/version.json', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      if (!data || !data.deployedAt) return;
      const d = new Date(data.deployedAt);
      if (isNaN(d.getTime())) return;
      const texte = d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      el.textContent = 'Dernière mise à jour du site : ' + texte;
    })
    .catch(() => {});
}

function renderDashboard() {
  // Bascule Cursus / JLPT : n'affecte que la grille des semestres plus bas,
  // le proverbe et la bannière de reprise restent visibles dans tous les cas.
  const onglets = ongletsDashboard();
  if (!onglets.some(o => o.id === dashboardMode)) dashboardMode = 'cursus';
  const ongletCourant = onglets.find(o => o.id === dashboardMode);

  let html = `
    <div class="dashboard-header">
      <h2>Accueil</h2>
      <div class="mode-toggle">
        ${onglets.map(o => `
          <button class="mode-toggle-btn ${dashboardMode === o.id ? 'active' : ''}" data-onglet="${o.id}">${escapeHtml(o.label)}</button>`).join('')}
        <button class="mode-toggle-btn mode-toggle-plus" id="btnNouvelleCategorie" title="Nouvelle catégorie" aria-label="Nouvelle catégorie">+</button>
      </div>
    </div>
    <div class="reviser-ouvrir-row" style="margin:8px 0;">
      <button class="secondary" id="btnOuvrirReviser">Réviser (choisir mode, difficulté, mots)</button>
    </div>
    ${ongletCourant && !ongletCourant.integre ? `
      <div class="categorie-outils">
        <span>Catégorie « ${escapeHtml(ongletCourant.label)} »</span>
        <button class="lien-retour" data-renommer="${ongletCourant.id}">Renommer</button>
        <button class="lien-retour" data-supprimer-cat="${ongletCourant.id}">Supprimer</button>
      </div>` : ''}
    <div id="kvtVersionMarque" style="font-size:11px; color:var(--muted); margin:-4px 0 12px;"></div>`;

  // Gamification (24/08/2026) : niveau/XP/pièces/série, tout en haut du
  // tableau de bord — la première chose vue à l'ouverture de l'app.
  if (typeof widgetGamification === 'function') html += widgetGamification();

  // Nouveautés (#21/#23, rang 5) : aperçu compact avec un lien vers sa page
  // complète. Chargé en asynchrone (données Supabase) ; le contenu
  // synchrone du tableau de bord ci-dessus ne l'attend pas.
  // Le widget Classement qui vivait ici est passé sur la page d'accueil
  // (communaute.js) le 23/09/2026, demande de Paul : "le classement
  // devrait etre sur la page d'accueil pas le tableau de bord".
  html += `
    <div class="card accueil-widgets-row">
      <h3>Nouveautés</h3>
      <div id="accueilNouveautesWrap"><p style="font-size:13px; color:var(--muted);">Chargement…</p></div>
    </div>`;

  // Le proverbe du jour vit desormais sur la page d'accueil.

  // La bannière de reprise privilégie une session interrompue en plein
  // milieu d'une semaine (cas le plus courant : "je dois m'arrêter") ; à
  // défaut, elle suggère la semaine suivante après la dernière terminée.
  const inProgress = getMostRecentInProgress();
  const lastStudied = inProgress ? null : getLastStudiedWeek();
  let resumeTarget = null;
  if (inProgress) {
    const sem = getSemester(inProgress.semesterId);
    html += `
      <div class="card resume-card">
        <div>
          <strong>Reprendre ta session en cours</strong>
          <div style="font-size:13px; color:var(--muted); margin-top:4px;">
            ${escapeHtml(sem.label)} — Semaine ${inProgress.week} : ${inProgress.index}/${inProgress.total} mots faits.
          </div>
        </div>
        <button class="primary" id="btnResume">Continuer</button>
      </div>`;
  } else if (lastStudied) {
    const lastSem = getSemester(lastStudied.semesterId);
    resumeTarget = getNextWeekAfter(lastStudied.semesterId, lastStudied.week);
    const lastDateLabel = new Date(lastStudied.date).toLocaleDateString('fr-FR');
    if (resumeTarget) {
      const nextSem = getSemester(resumeTarget.semesterId);
      html += `
        <div class="card resume-card">
          <div>
            <strong>Reprendre où tu t'es arrêté</strong>
            <div style="font-size:13px; color:var(--muted); margin-top:4px;">
              Dernière session : ${escapeHtml(lastSem.label)} — Semaine ${lastStudied.week} (${lastDateLabel}).
              Suite : ${escapeHtml(nextSem.label)} — Semaine ${resumeTarget.week}.
            </div>
          </div>
          <button class="primary" id="btnResume">Continuer</button>
        </div>`;
    } else {
      html += `
        <div class="card resume-card">
          <div><strong>🎉 Tu as terminé tout le programme !</strong></div>
        </div>`;
    }
  }

  // "Recommandé pour toi" (09/09/2026) : ne s'affiche pas par-dessus une
  // session en cours (déjà assez de choix avec la bannière de reprise) ;
  // complète plutôt que duplique la bannière ci-dessus, qui couvre déjà la
  // progression vers la semaine suivante — celle-ci cible le renforcement.
  const weakWeek = inProgress ? null : getWeakestWeek();
  if (weakWeek) {
    const weakSem = getSemester(weakWeek.semesterId);
    html += `
      <div class="card resume-card reco-card">
        <div>
          <strong>Recommandé pour toi</strong>
          <div style="font-size:13px; color:var(--muted); margin-top:4px;">
            ${escapeHtml(weakSem.label)} — Semaine ${weakWeek.week} : ${weakWeek.pct}% la dernière fois, ça vaut le coup de la retravailler.
          </div>
        </div>
        <button class="primary" id="btnReco">Réviser</button>
      </div>`;
  }

  if (dashboardMode === 'special') {
    // Onglet "Special" (17/09/2026, complete le 22/09/2026 avec Double
    // reponse) : regroupe les modes recents (Ecriture, Traduction, Double
    // reponse, Vocabulaire pratique) au meme niveau de visibilite que
    // Cursus/JLPT, plutot que de les enterrer dans le menu deroulant de
    // l'ecran Reviser comme Kanji seul/Kana -- demande explicite de Paul.
    // Pas de semestres ici : chaque carte mene directement a l'ecran de
    // choix du mode concerne (Reviser), avec le bon mode deja preselectionne.
    const specialModes = [
      { id: 'ecriture', titre: 'Écriture', desc: 'La lecture (kana) s’affiche, tu écris le kanji toi-même sur papier, puis tu révèles la réponse pour t’auto-corriger. Pas de notation automatique.' },
      { id: 'traduction', titre: 'Traduction', desc: 'Le sens en français s’affiche, tu réponds en kanji ou en kana. Notation automatique comme en mode Vocabulaire.' },
      { id: 'double', titre: 'Double réponse', desc: 'Le mot s’affiche en kanji, tu tapes la lecture ET le sens sur le même écran. Les deux doivent être justes pour marquer des points.' },
      { id: 'pratique', titre: 'Vocabulaire pratique', desc: 'Compteurs, couleurs et expressions de temps/heure -- du vocabulaire utile en dehors du programme.' }
    ];
    html += `<div class="special-modes-grid">`;
    specialModes.forEach(m => {
      html += `
        <div class="card special-mode-card" data-special-mode="${m.id}">
          <h3>${escapeHtml(m.titre)}</h3>
          <p style="font-size:13px; color:var(--muted); margin-top:4px;">${escapeHtml(m.desc)}</p>
          <button class="primary" data-special-mode-btn="${m.id}" style="margin-top:12px;">Ouvrir</button>
        </div>`;
    });
    html += `</div>`;
  } else {
  const visibleSemesters = DB.settings.semesters.filter(sem => categorieDuSemestre(sem) === dashboardMode);

  if (!visibleSemesters.length) {
    html += `<div class="card"><p style="color:var(--muted);">Cette catégorie est vide. Range un semestre dedans depuis un autre onglet.</p></div>`;
  }

  visibleSemesters.forEach(sem => {
    const unitPrefix = sem.id.startsWith('jlpt') ? 'C' : 'S';
    const rangeeDans = categorieDuSemestre(sem);
    const choixCategorie = `
      <select class="semestre-categorie" data-ranger="${sem.id}" title="Ranger ce semestre dans une catégorie">
        <option value="cursus" ${rangeeDans === 'cursus' ? 'selected' : ''}>Cursus</option>
        <option value="jlpt" ${rangeeDans === 'jlpt' ? 'selected' : ''}>JLPT</option>
        ${categoriesLibres().map(c => `<option value="${c.id}" ${rangeeDans === c.id ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
      </select>`;
    html += `<div class="card">
      <div class="semestre-tete">
        <h3>${escapeHtml(sem.label)}${sem.importe ? ` <span class="semestre-origine">importé de ${escapeHtml(sem.auteur || 'quelqu\'un')}</span>` : ''}</h3>
        ${choixCategorie}
      </div>
      <div class="week-grid">`;
    for (let w = 1; w <= sem.weeks; w++) {
      const vocabList = getVocabForWeek(sem.id, w);
      const groups = getKanjiGroupsForWeek(sem.id, w);
      const entry = getScoreEntry(sem.id, w);
      const saved = getValidInProgress(sem.id, w);
      // Type de test fait/en cours (09/09/2026) : Paul veut voir quel filtre
      // "Mots" a servi, pas seulement le score ou la progression brute.
      // entry.best.verbeFilter est absent sur les tentatives enregistrées
      // avant ce changement -- pas de tag dans ce cas plutôt qu'un faux
      // "tous les mots" qui n'a jamais été vérifié.
      const typeTagScore = entry && entry.best.verbeFilter
        ? `<span class="week-type-tag">${escapeHtml(libelleFiltreMots(entry.best.verbeFilter))}</span>` : '';
      const typeTagProgress = saved
        ? `<span class="week-type-tag">${escapeHtml(libelleFiltreMots(saved.verbeFilter))}</span>` : '';
      html += `
        <div class="week-card ${vocabList.length === 0 ? 'empty' : ''}" data-sem="${sem.id}" data-week="${w}">
          <div class="week-num">${unitPrefix}${w}</div>
          <div class="week-meta">${groups.length} kanji · ${vocabList.length} mots</div>
          ${entry ? `<div class="week-score">${entry.best.points}/${entry.best.maxPoints} pts <span class="week-score-pct">(${entry.best.pct}%)</span> ${typeTagScore}</div>` : '<div class="week-score muted">—</div>'}
          ${saved ? `
            <div class="week-progress-bar"><div class="week-progress-fill" style="width:${Math.round((saved.index / saved.queue.length) * 100)}%"></div></div>
            <div class="week-progress-label">
              ${saved.index}/${saved.queue.length} mots · ${saved.totals.points} pts gagnés ${typeTagProgress}
              <button class="week-restart-btn" data-sem="${sem.id}" data-week="${w}" title="Recommencer cette semaine">↺ Recommencer</button>
            </div>
          ` : ''}
        </div>
      `;
    }
    html += `</div></div>`;
  });
  }
  html += kvtAdSlotHtml('dashboard-bottom');

  // Modale de choix par semaine (09/09/2026) : ouverte au clic sur une
  // carte de semaine (voir plus bas, sur .week-card), affichée par-dessus
  // le Tableau de bord ("avec le site en fond" -- demande de Paul), pour
  // voir/choisir le filtre "Mots" avant de démarrer, ET reprendre une
  // session en cours si elle existe, sans jamais la perdre par erreur.
  if (modalSemaineOuverte) {
    const semModal = getSemester(modalSemaineOuverte.semesterId);
    const weekModal = modalSemaineOuverte.week;
    const vocabModalTous = getVocabForWeek(modalSemaineOuverte.semesterId, weekModal);
    const savedModal = getValidInProgress(modalSemaineOuverte.semesterId, weekModal);
    const entryModal = getScoreEntry(modalSemaineOuverte.semesterId, weekModal);
    const filtreGroupeCocheModal = reviewVerbeFilter === 'tous' || reviewVerbeFilter === 'kanji_groupe';
    const filtreSimpleCocheModal = reviewVerbeFilter === 'tous' || reviewVerbeFilter === 'simple';
    const countModal = filtrerVocabParVerbe(vocabModalTous, reviewVerbeFilter).length;
    html += `
      <div class="modal-backdrop" id="modalSemaineBackdrop">
        <div class="modal-box">
          <div class="modal-tete">
            <h3>${escapeHtml(semModal.label)} — Semaine ${weekModal}</h3>
            <button class="modal-fermer" id="btnFermerModalSemaine" title="Fermer" aria-label="Fermer">✕</button>
          </div>
          ${vocabModalTous.length > 0 ? `
            <button type="button" class="secondary small" id="btnVoirVocabModalSemaine" style="margin-bottom:10px;">Voir le vocabulaire de cette semaine</button>
          ` : ''}
          ${savedModal ? `
            <div class="modal-reprise">
              <div>Session en cours : ${savedModal.index}/${savedModal.queue.length} mots · ${savedModal.totals.points} pts gagnés</div>
              <div style="font-size:12px; color:var(--muted); margin-top:2px;">Type : ${escapeHtml(libelleFiltreMots(savedModal.verbeFilter))}</div>
              <button class="primary" id="btnContinuerModalSemaine" style="margin-top:8px;">Continuer cette session</button>
            </div>
            <div class="modal-separateur">Ou recommencer avec d'autres réglages :</div>
          ` : entryModal ? `
            <div style="font-size:13px; color:var(--muted); margin-bottom:10px;">
              Meilleur score : ${entryModal.best.points}/${entryModal.best.maxPoints} pts (${entryModal.best.pct}%)${entryModal.best.verbeFilter ? ' · ' + escapeHtml(libelleFiltreMots(entryModal.best.verbeFilter)) : ''}
            </div>
          ` : ''}
          <div class="filtre-mots">
            <label><input type="checkbox" id="chkModalMotsGroupe" ${filtreGroupeCocheModal ? 'checked' : ''}> Mots à kanji groupés</label>
            <label><input type="checkbox" id="chkModalMotsSimple" ${filtreSimpleCocheModal ? 'checked' : ''}> Mots simples</label>
            <div class="filtre-mots-desc" style="font-size:12px; color:var(--muted);">
              Groupés = plusieurs kanji collés sans hiragana (問題, 子供). Simples = verbe (泳ぐ), kanji seul (半) ou adjectif en -i (高い).
            </div>
          </div>
          <div style="font-size:13px; color:var(--muted); margin:10px 0;">${countModal} mot(s) avec ce choix.</div>
          <button class="primary" id="btnDemarrerModalSemaine" ${countModal === 0 ? 'disabled' : ''}>${savedModal ? 'Recommencer' : 'Démarrer'}</button>
        </div>
      </div>
    `;
  }

  $('#view-dashboard').innerHTML = html;
  renderAllAdSlots();
  afficherVersionDeploiement();
  if (typeof chargerNouveautesAccueil === 'function') chargerNouveautesAccueil();

  $$('[data-onglet]').forEach(b => {
    b.addEventListener('click', () => { dashboardMode = b.dataset.onglet; renderDashboard(); });
  });
  $('#btnNouvelleCategorie').addEventListener('click', creerCategorie);
  // Cartes de l'onglet "Special" (17/09/2026) : chaque carte ouvre l'ecran
  // Reviser avec le mode correspondant deja présélectionné (meme geste
  // que "Reviser (choisir mode...)" mais sans repasser par le menu).
  $$('[data-special-mode-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      reviewPickerMode = btn.dataset.specialModeBtn;
      quizSession = null;
      switchView('review');
    });
  });
  // Point d'entree direct vers l'ecran de choix (mode/difficulte/mots) sans
  // passer par une semaine precise : sans ca, cliquer une carte de semaine
  // ou "Continuer" demarre tout de suite le quiz et l'ecran de choix
  // (avec les cases "kanji groupes"/"simples") n'est jamais vu (09/09/2026).
  const btnOuvrirReviser = $('#btnOuvrirReviser');
  if (btnOuvrirReviser) {
    btnOuvrirReviser.addEventListener('click', () => {
      quizSession = null;
      switchView('review');
    });
  }
  $$('[data-renommer]').forEach(b => b.addEventListener('click', () => renommerCategorie(b.dataset.renommer)));
  $$('[data-supprimer-cat]').forEach(b => b.addEventListener('click', () => supprimerCategorie(b.dataset.supprimerCat)));
  $$('[data-ranger]').forEach(sel => {
    // Le menu est dans l'en-tête d'une carte de semestre : sans cette ligne,
    // ouvrir le menu déclencherait aussi le clic de la carte en dessous.
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('change', () => rangerSemestre(sel.dataset.ranger, sel.value));
  });

  $$('.week-card').forEach(el => {
    el.addEventListener('click', () => {
      const sem = el.dataset.sem, w = parseInt(el.dataset.week, 10);
      const vocabList = getVocabForWeek(sem, w);
      if (vocabList.length === 0) {
        browsingWeek = { semesterId: sem, week: w };
        switchView('manage');
        showToast('Importe du vocabulaire pour cette semaine avant de réviser');
      } else {
        // Ouvre la modale de choix (09/09/2026) au lieu de démarrer tout de
        // suite : Paul veut voir/choisir le filtre "Mots" avant de lancer
        // le test, et reprendre une session en cours sans la perdre. Le
        // raccourci "↺ Recommencer" (juste en dessous) reste un démarrage
        // direct pour qui veut aller vite sans repasser par ce choix.
        modalSemaineOuverte = { semesterId: sem, week: w };
        renderDashboard();
      }
    });
  });

  // Boutons "Recommencer" imbriqués dans les cartes de semaine : on arrête
  // la propagation pour ne pas déclencher aussi le clic de la carte (qui
  // aurait repris la session au lieu de la recommencer).
  $$('.week-restart-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sem = btn.dataset.sem, w = parseInt(btn.dataset.week, 10);
      clearInProgress(sem, w);
      persist();
      startQuiz(sem, w, true);
      switchView('review');
    });
  });

  const btnResume = $('#btnResume');
  if (btnResume) {
    btnResume.addEventListener('click', () => {
      if (inProgress) {
        startQuiz(inProgress.semesterId, inProgress.week);
        switchView('review');
        return;
      }
      if (resumeTarget) {
        const vocabList = getVocabForWeek(resumeTarget.semesterId, resumeTarget.week);
        if (vocabList.length === 0) {
          browsingWeek = { semesterId: resumeTarget.semesterId, week: resumeTarget.week };
          switchView('manage');
          showToast('Importe du vocabulaire pour cette semaine avant de réviser');
        } else {
          startQuiz(resumeTarget.semesterId, resumeTarget.week);
          switchView('review');
        }
      }
    });
  }

  const btnReco = $('#btnReco');
  if (btnReco) {
    // Semaine déjà faite -> on repart d'une session fraîche (forceRestart),
    // même logique que le bouton "↺ Recommencer" des cartes de semaine.
    btnReco.addEventListener('click', () => {
      startQuiz(weakWeek.semesterId, weakWeek.week, true);
      switchView('review');
    });
  }

  // Modale de choix par semaine (09/09/2026) : voir le bloc HTML généré
  // plus haut (modalSemaineOuverte). Fermeture par le bouton ✕ ou un clic
  // sur le fond (jamais sur la boîte elle-même, d'où le test sur e.target).
  if (modalSemaineOuverte) {
    const fermerModal = () => { modalSemaineOuverte = null; renderDashboard(); };
    $('#btnFermerModalSemaine').addEventListener('click', fermerModal);
    $('#modalSemaineBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modalSemaineBackdrop') fermerModal();
    });
    // Raccourci vers le tableau de traduction de cette semaine (tache #17,
    // "moins de clics pour y arriver") : avant ce bouton, il fallait fermer
    // la modale, aller dans "Vocabulaire" via le menu, puis reselectionner
    // la meme semaine dans le menu deroulant -- 3 etapes pour revoir des
    // mots qu'on a justement la semaine sous les yeux ici. N'apparait que
    // s'il y a du vocabulaire pour cette semaine (voir le rendu plus haut).
    const btnVoirVocabModal = $('#btnVoirVocabModalSemaine');
    if (btnVoirVocabModal) {
      btnVoirVocabModal.addEventListener('click', () => {
        const { semesterId, week } = modalSemaineOuverte;
        modalSemaineOuverte = null;
        browsingWeek = { semesterId, week };
        switchView('manage');
      });
    }
    const recalculerFiltreMotsModal = () => {
      const groupeCoche = $('#chkModalMotsGroupe').checked;
      const simpleCoche = $('#chkModalMotsSimple').checked;
      if (groupeCoche && simpleCoche) reviewVerbeFilter = 'tous';
      else if (groupeCoche) reviewVerbeFilter = 'kanji_groupe';
      else if (simpleCoche) reviewVerbeFilter = 'simple';
      else reviewVerbeFilter = 'aucun';
      renderDashboard();
    };
    $('#chkModalMotsGroupe').addEventListener('change', recalculerFiltreMotsModal);
    $('#chkModalMotsSimple').addEventListener('change', recalculerFiltreMotsModal);
    const btnContinuerModal = $('#btnContinuerModalSemaine');
    if (btnContinuerModal) {
      btnContinuerModal.addEventListener('click', () => {
        // Pas de forceRestart : startQuiz retrouve tout seul la session
        // sauvegardée (même file de mots, même filtre d'origine, même
        // progression) via getValidInProgress -- voir plus haut dans
        // app.js. On ne passe pas reviewVerbeFilter ici : changer les
        // cases de la modale ne doit pas affecter une reprise en cours.
        const { semesterId, week } = modalSemaineOuverte;
        modalSemaineOuverte = null;
        startQuiz(semesterId, week);
        switchView('review');
      });
    }
    $('#btnDemarrerModalSemaine').addEventListener('click', () => {
      const { semesterId, week } = modalSemaineOuverte;
      modalSemaineOuverte = null;
      startQuiz(semesterId, week, true, reviewVerbeFilter);
      switchView('review');
    });
  }
}

// ============================================================
// Vocabulaire : import en masse + parcours
// ============================================================
function renderVocab() {
  const semesters = DB.settings.semesters;
  if (!browsingWeek) browsingWeek = { semesterId: semesters[0].id, week: 1 };

  const selectHtml = semesters.map(sem => {
    const opts = [];
    for (let w = 1; w <= getMaxRelevantWeek(sem); w++) {
      opts.push(`<option value="${sem.id}|${w}" ${browsingWeek.semesterId === sem.id && browsingWeek.week === w ? 'selected' : ''}>${sem.label} — Semaine ${w}${w > sem.weeks ? ' (hors réglage)' : ''}</option>`);
    }
    return opts.join('');
  }).join('');

  const groups = getKanjiGroupsForWeek(browsingWeek.semesterId, browsingWeek.week);
  const browseHtml = groups.length === 0 ? '<div class="empty-state">Aucun vocabulaire importé pour cette semaine.</div>' :
    groups.map(g => {
      const vocabList = getVocabForGroup(g.id);
      const learnInfo = hasLearnInfo(g) ? `
          <div class="learn-readings">
            ${g.onyomi ? `<div class="learn-pill onyomi"><span>ON</span>${escapeHtml(g.onyomi)}</div>` : ''}
            ${g.kunyomi ? `<div class="learn-pill kunyomi"><span>KUN</span>${escapeHtml(g.kunyomi)}</div>` : ''}
            ${g.bushu ? `<div class="learn-pill bushu"><span>RADICAL</span>${escapeHtml(g.bushu)}</div>` : ''}
          </div>
          ${g.phrase ? `
            <div class="learn-section">
              <h4>Phrase d'exemple</h4>
              <p class="learn-phrase">${escapeHtml(g.phrase)}</p>
              ${g.traduction ? `<p class="learn-traduction">${escapeHtml(g.traduction)}</p>` : ''}
            </div>
          ` : ''}
          ${g.memo ? `
            <div class="learn-section">
              <h4>Mémo</h4>
              <p>${escapeHtml(g.memo)}</p>
            </div>
          ` : ''}
          ${g.attention ? `
            <div class="learn-section learn-attention">
              <h4>Attention</h4>
              <p>${escapeHtml(g.attention)}</p>
            </div>
          ` : ''}
        ` : '';
      return `
        <div class="kanji-block">
          <div class="kanji-block-head">
            <span class="kj">${escapeHtml(g.kanji)}</span>
            <strong>${escapeHtml(g.titre || '')}</strong>
            <button class="secondary small btn-voir-trace-groupe" data-kanji="${escapeHtml(g.kanji)}">Voir le tracé</button>
          </div>
          ${learnInfo}
          <table>
            <thead><tr><th>Mot</th><th>Lecture</th><th>Sens</th><th></th></tr></thead>
            <tbody>
              ${vocabList.map(v => `
                <tr>
                  <td>${escapeHtml(v.mot)}${registreBadge(v)}</td>
                  <td>${escapeHtml(v.lecture)}</td>
                  <td>${escapeHtml(v.sens)}</td>
                  <td><button class="secondary small btn-masquer-vocab" data-vocab="${v.id}" title="Masquer ce mot (reversible, voir Mots masques)">Masquer</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }).join('');

  $('#view-manage').innerHTML = `
    <h2>Vocabulaire</h2>
    <p style="font-size:13px; color:var(--muted); margin-top:-8px;">
      Les mots testés pendant les révisions, avec les fiches d'aide optionnelles (lectures, radical, phrase d'exemple, mémo, attention) pour étudier avant de te tester. Les fiches ne sont jamais utilisées pendant Réviser, qui reste un vrai test à l'aveugle. L'import de nouveaux mots et fiches se fait désormais depuis « Création ».
    </p>
    <div class="card">
      <div class="semestre-tete">
        <h3>Parcourir le vocabulaire et les fiches</h3>
        <button class="lien-retour" id="btnVoirMotsMasques">Mots masqués (${motsMasquesDetails().length})</button>
      </div>
      <select id="browseWeekPicker" style="margin-bottom:14px;">${selectHtml}</select>
      ${browseHtml}
    </div>
    ${modalMotsMasquesOuvert ? `
      <div class="modal-backdrop" id="modalMotsMasquesBackdrop">
        <div class="modal-box">
          <div class="modal-tete">
            <h3>Mots masqués</h3>
            <button class="modal-fermer" id="btnFermerModalMasques" title="Fermer" aria-label="Fermer">✕</button>
          </div>
          ${motsMasquesDetails().length === 0
            ? '<p style="color:var(--muted); font-size:13px;">Aucun mot masqué pour l\'instant.</p>'
            : `<table>
                <thead><tr><th>Mot</th><th>Lecture</th><th>Sens</th><th></th></tr></thead>
                <tbody>
                  ${motsMasquesDetails().map(v => `
                    <tr>
                      <td>${escapeHtml(v.mot)}${registreBadge(v)}</td>
                      <td>${escapeHtml(v.lecture)}</td>
                      <td>${escapeHtml(v.sens)}</td>
                      <td><button class="secondary small btn-demasquer-vocab" data-vocab="${v.id}">Restaurer</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>`}
        </div>
      </div>
    ` : ''}
    ${htmlModalTraceKanji()}
  `;

  $('#browseWeekPicker').addEventListener('change', (e) => {
    const [sem, w] = e.target.value.split('|');
    browsingWeek = { semesterId: sem, week: parseInt(w, 10) };
    renderVocab();
  });

  $$('.btn-voir-trace-groupe').forEach(btn => {
    btn.addEventListener('click', () => {
      modalTraceKanji = btn.dataset.kanji;
      renderVocab();
    });
  });
  wireModalTraceKanji(renderVocab);
  $$('.btn-masquer-vocab').forEach(btn => {
    btn.addEventListener('click', async () => {
      await masquerMot(btn.dataset.vocab);
      showToast('Mot masqué — récupérable depuis « Mots masqués »');
      renderVocab();
    });
  });

  const btnVoirMasques = $('#btnVoirMotsMasques');
  if (btnVoirMasques) btnVoirMasques.addEventListener('click', () => { modalMotsMasquesOuvert = true; renderVocab(); });

  if (modalMotsMasquesOuvert) {
    const fermerModalMasques = () => { modalMotsMasquesOuvert = false; renderVocab(); };
    $('#btnFermerModalMasques').addEventListener('click', fermerModalMasques);
    $('#modalMotsMasquesBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modalMotsMasquesBackdrop') fermerModalMasques();
    });
    $$('.btn-demasquer-vocab').forEach(btn => {
      btn.addEventListener('click', async () => {
        await demasquerMot(btn.dataset.vocab);
        showToast('Mot restauré');
        renderVocab();
      });
    });
  }
}

function renderImportPreview() {
  const box = $('#importPreviewBox');
  const btnCommit = $('#btnCommitImport');
  if (!importPreview) { box.innerHTML = ''; return; }
  const { rows, errors } = importPreview;
  box.innerHTML = `
    <div style="margin-top:12px; font-size:13px;">
      <strong>${rows.length}</strong> mot(s) prêt(s) à importer.
      ${errors.length ? `<span style="color:var(--bad);"> ${errors.length} ligne(s) ignorée(s).</span>` : ''}
    </div>
    ${errors.length ? `<ul style="color:var(--bad); font-size:12px;">${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : ''}
    ${rows.length ? `<table style="margin-top:8px;"><thead><tr><th>Sem.</th><th>Sem</th><th>Kanji</th><th>Mot</th><th>Lecture</th><th>Sens</th></tr></thead>
      <tbody>${rows.slice(0, 12).map(r => `<tr><td>${r.semesterId.toUpperCase()}</td><td>${r.week}</td><td>${escapeHtml(r.kanji)}</td><td>${escapeHtml(r.mot)}</td><td>${escapeHtml(r.lecture)}</td><td>${escapeHtml(r.sens)}</td></tr>`).join('')}</tbody></table>
      ${rows.length > 12 ? `<div style="font-size:12px; color:var(--muted);">... et ${rows.length - 12} de plus.</div>` : ''}` : ''}
  `;
  btnCommit.disabled = rows.length === 0;
}

// ============================================================
// Fiches (anciennement onglet "Apprendre") : infos annexes par kanji
// (onyomi/kunyomi, radical, exemple, mémo, attention) — jamais utilisées
// pendant Réviser, affichées dans l'onglet Vocabulaire pour étudier avant
// de se tester.
// ============================================================

function renderLearnImportPreview() {
  const box = $('#learnImportPreviewBox');
  const btnCommit = $('#btnCommitLearnImport');
  if (!learnImportPreview) { box.innerHTML = ''; return; }
  const { rows, errors } = learnImportPreview;
  box.innerHTML = `
    <div style="margin-top:12px; font-size:13px;">
      <strong>${rows.length}</strong> fiche(s) prête(s) à importer.
      ${errors.length ? `<span style="color:var(--bad);"> ${errors.length} ligne(s) ignorée(s).</span>` : ''}
    </div>
    ${errors.length ? `<ul style="color:var(--bad); font-size:12px;">${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : ''}
    ${rows.length ? `<table style="margin-top:8px;"><thead><tr><th>Sem.</th><th>Sem</th><th>Kanji</th><th>Onyomi</th><th>Kunyomi</th></tr></thead>
      <tbody>${rows.slice(0, 12).map(r => `<tr><td>${r.semesterId.toUpperCase()}</td><td>${r.week}</td><td>${escapeHtml(r.kanji)}</td><td>${escapeHtml(r.onyomi)}</td><td>${escapeHtml(r.kunyomi)}</td></tr>`).join('')}</tbody></table>
      ${rows.length > 12 ? `<div style="font-size:12px; color:var(--muted);">... et ${rows.length - 12} de plus.</div>` : ''}` : ''}
  `;
  btnCommit.disabled = rows.length === 0;
}

// ============================================================
// Révision : quiz à saisie libre
// ============================================================
function startQuiz(semesterId, week, forceRestart, verbeFilter) {
  const filtre = verbeFilter || 'tous';
  const vocabList = filtrerVocabParVerbe(getVocabForWeek(semesterId, week), filtre);
  const saved = forceRestart ? null : getValidInProgress(semesterId, week);
  if (saved) {
    // Reprend exactement là où la session s'était arrêtée (même ordre de
    // mots, mêmes points déjà acquis).
    quizSession = {
      semesterId, week,
      queue: saved.queue,
      index: saved.index,
      submitted: false,
      lastAnswer: '',
      lastResult: null,
      warning: null,
      hardcore: saved.hardcore,
      verbeFilter: saved.verbeFilter || 'tous',
      usedSpectral: false, // reprise = nouveau mot en cours, pas encore de calque fantôme utilisé
      answers: saved.answers.slice(),
      totals: { ...saved.totals }
    };
    return;
  }
  clearInProgress(semesterId, week);
  quizSession = {
    semesterId, week,
    queue: shuffle(vocabList.map(v => v.id)),
    index: 0,
    submitted: false,
    lastAnswer: '',
    lastResult: null,
    warning: null, // message affiché si la saisie contient du kanji au lieu de la lecture (voir containsKanji)
    hardcore: !!DB.settings.hardcoreMode, // figé au démarrage : changer le réglage en cours de session ne la perturbe pas
    verbeFilter: filtre, // filtre "avec/sans verbe de base" actif au démarrage (09/09/2026) — figé pour la reprise
    usedSpectral: false, // vrai si le calque fantôme (mode spectral) a été utilisé sur le mot en cours -> annule ses points
    answers: [], // récap complet, rempli au fil de la session, affiché à la fin en mode hardcore
    totals: { points: 0, maxPoints: vocabList.length * DB.settings.pointsPerWord, startedAt: Date.now() }
  };
}

// ---------- Modale de trace des traits (tache #13, rang 4) ----------
// Ouvrable depuis "Kanji seul" (revele) et depuis Vocabulaire (fiche kanji).
// Un seul jeu de fonctions partage par les deux vues : modalTraceKanji
// (variable globale, voir haut de fichier) contient soit null (fermee)
// soit la chaine kanjiGroup.kanji d'origine (peut contenir plusieurs
// caracteres, voir caracteresKanjiDistincts ci-dessus).

function construireSvgTraceKanji(paths, idSvg) {
  // viewBox 0 0 109 109 : convention fixe de KanjiVG, reprise telle quelle.
  // Calque "squelette" (tous les traits, tres pale) en dessous : garde le
  // caractere entier visible pendant que les traits s'animent un par un
  // par dessus, plutot que de partir d'un cadre vide.
  const squelette = paths.map(d => `<path d="${d}" class="trait-squelette"/>`).join('');
  const traits = paths.map((d, i) => `<path d="${d}" class="trait-kanji" data-ordre="${i + 1}"/>`).join('');
  // Numero au point de depart de chaque trait (premiere paire de
  // coordonnees du "d", juste apres le M) : aide a suivre l'ordre sans
  // devoir deviner quel trait vient de s'animer.
  const numeros = paths.map((d, i) => {
    const m = /^M\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/.exec(d);
    if (!m) return '';
    return `<text x="${parseFloat(m[1]) - 3}" y="${parseFloat(m[2]) - 3}" class="numero-trait">${i + 1}</text>`;
  }).join('');
  return `<svg id="${idSvg}" viewBox="0 0 109 109" class="svg-trace-kanji">${squelette}${traits}${numeros}</svg>`;
}

function animerTraceKanji(svgEl) {
  const traits = $$('.trait-kanji', svgEl);
  const DUREE_PAR_TRAIT_MS = 380;
  traits.forEach((path, i) => {
    const longueur = path.getTotalLength();
    path.style.transition = 'none';
    path.style.strokeDasharray = String(longueur);
    path.style.strokeDashoffset = String(longueur);
    // Force le reflow pour que le navigateur applique bien l'etat "cache"
    // AVANT qu'on programme la transition -- sinon les traits ulterieurs
    // (delai > 0) sautent directement a l'etat final sans s'animer.
    void path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${DUREE_PAR_TRAIT_MS}ms ease-in-out ${i * DUREE_PAR_TRAIT_MS}ms`;
    path.style.strokeDashoffset = '0';
  });
}

function htmlModalTraceKanji() {
  if (!modalTraceKanji) return '';
  const caracteres = caracteresKanjiDistincts(modalTraceKanji);
  const blocs = caracteres.map((kanji, i) => {
    const paths = tracesDisponibles(kanji);
    if (!paths) {
      return `
        <div class="trace-bloc">
          <div class="trace-bloc-titre">${escapeHtml(kanji)}</div>
          <p style="color:var(--muted); font-size:13px;">Trace indisponible pour ce caractere.</p>
        </div>
      `;
    }
    return `
      <div class="trace-bloc">
        <div class="trace-bloc-titre">${escapeHtml(kanji)}</div>
        <div class="trace-svg-wrap">${construireSvgTraceKanji(paths, `svgTraceKanji-${i}`)}</div>
        <button class="secondary small btn-rejouer-trace" data-svg="svgTraceKanji-${i}">Rejouer le trace</button>
      </div>
    `;
  }).join('');
  return `
    <div class="modal-backdrop" id="modalTraceKanjiBackdrop">
      <div class="modal-box modal-box--trace">
        <div class="modal-tete">
          <h3>Trace des traits</h3>
          <button class="modal-fermer" id="btnFermerModalTrace" title="Fermer" aria-label="Fermer">✕</button>
        </div>
        <div class="trace-blocs">${blocs}</div>
        <p class="trace-attribution">Traces : projet <a href="https://kanjivg.tagaini.net" target="_blank" rel="noopener">KanjiVG</a> (CC BY-SA 3.0).</p>
      </div>
    </div>
  `;
}

// rerender : fonction de la vue APPELANTE a relancer apres fermeture --
// ce modal s'ouvre depuis plusieurs vues (Kanji seul, Vocabulaire), donc
// pas de vue "propriétaire" fixe a rappeler en dur (contrairement aux
// autres modales du fichier qui n'ont qu'un seul point d'ouverture).
function wireModalTraceKanji(rerender) {
  if (!modalTraceKanji) return;
  const fermer = () => { modalTraceKanji = null; rerender(); };
  const backdrop = $('#modalTraceKanjiBackdrop');
  if (backdrop) {
    $('#btnFermerModalTrace').addEventListener('click', fermer);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) fermer(); });
  }
  $$('.svg-trace-kanji').forEach(svg => animerTraceKanji(svg));
  $$('.btn-rejouer-trace').forEach(btn => {
    btn.addEventListener('click', () => {
      const svg = document.getElementById(btn.dataset.svg);
      if (svg) animerTraceKanji(svg);
    });
  });
}

// Vue "Kanji seul" : séparée de renderReview() par choix (aucune branche
// supplémentaire ajoutée au quiz vocabulaire déjà testé), même esprit
// (saisie libre, correction par similarité, historique séparé).
function renderKanjiQuizView(container) {
  // Session terminée
  if (quizSession.index >= quizSession.queue.length) {
    const { points, maxPoints, startedAt } = quizSession.totals;
    const dureeMs = Number.isFinite(startedAt) ? Date.now() - startedAt : null;
    const pct = maxPoints > 0
      // Bug #19 (22/09/2026) : un score presque parfait (ex. 569/570)
      // arrondissait a 100%, ce qui donnait un faux sentiment de sans-faute.
      // 100% est reserve au score reellement parfait ; sinon on plafonne a 99%
      // meme si l'''arrondi mathematique donnerait 100.
      ? (points >= maxPoints ? 100 : Math.min(99, Math.round((points / maxPoints) * 100)))
      : 0;
    const prevEntry = getKanjiScoreEntry(quizSession.semesterId, quizSession.week);
    const prevBest = prevEntry ? prevEntry.best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    recordKanjiSessionResult(quizSession.semesterId, quizSession.week, points, maxPoints, pct, dureeMs);
    clearKanjiInProgress(quizSession.semesterId, quizSession.week);
    persist();
    // Classement de classe, mode 'kanji' (rang 5, #16) : meme principe que
    // le mode Vocabulaire de base -- toujours le record, jamais chaque
    // tentative.
    if (typeof window.kvtPushScore === 'function') {
      const histEntry = getKanjiScoreEntry(quizSession.semesterId, quizSession.week);
      window.kvtPushScore(quizSession.semesterId, quizSession.week, histEntry.best.points, histEntry.best.maxPoints, histEntry.best.pct, 'kanji', histEntry.best.dureeMs, histEntry.history.length);
    }    // Synchronise aussi l'instantane du graphique hexagonal (deplace vers
    // le Profil public, demande de Paul le 23/09/2026) : ce mode vient de
    // faire bouger au moins un des 6 axes, autant le repousser tout de
    // suite plutot que d'attendre une visite sur son propre profil.
    if (typeof window.kvtPushHexagoneStats === 'function' && typeof getHexagoneStats === 'function') {
      window.kvtPushHexagoneStats(getHexagoneStats());
    }
    if (typeof kvtSnapshotHistorique === 'function') kvtSnapshotHistorique();
    const semLabel = getSemester(quizSession.semesterId).label;
    const etat = pct >= 100 ? 'perfect' : (pct >= 70 ? 'good' : 'low');
    const badge = improved
      ? `<div class="kvt-result__badge">Record — nouveau meilleur score</div>`
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${prevBest}&nbsp;%</div>` : '');
    container.innerHTML = `
      <h2>Kanji seul — ${escapeHtml(semLabel)} Semaine ${quizSession.week}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${badge}
        <div class="kvt-result__pct">${pct}&nbsp;%</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <button class="kvt-result__btn" type="button" id="btnBackKanjiReview">Retour</button>
      </div>
    `;
    $('#btnBackKanjiReview').addEventListener('click', () => {
      quizSession = null;
      renderReview();
    });
    return;
  }

  const item = quizSession.queue[quizSession.index];
  const g = getKanjiGroup(item.groupId);
  const blocLectures = item.type === 'onyomi' ? g.onyomi : g.kunyomi;
  const progressPct = Math.round((quizSession.index / quizSession.queue.length) * 100);
  const labelType = item.type === 'onyomi' ? 'Onyomi (lecture chinoise, katakana)' : 'Kunyomi (lecture japonaise, hiragana)';

  container.innerHTML = `
    <h2>Kanji seul — ${getSemester(quizSession.semesterId).label} Semaine ${quizSession.week}</h2>
    <div class="flashcard-wrap">
      <div class="session-progress">
        <div style="font-size:12px; color:var(--muted);">${quizSession.index + 1} / ${quizSession.queue.length}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      </div>
      <div class="flashcard">
        <div class="front-word">${escapeHtml(g.kanji)}</div>
        <div class="hint">${labelType}${g.titre ? ' · ' + escapeHtml(g.titre) : ''}</div>
        ${!quizSession.submitted ? `
          ${quizSession.warning ? `<div class="quiz-feedback bad" style="margin-top:12px;">${escapeHtml(quizSession.warning)}</div>` : ''}
          <div class="answer-input-wrap">
            <input id="answerInputKanji" type="text" placeholder="${item.type === 'onyomi' ? 'Écris une lecture onyomi (katakana)' : 'Écris une lecture kunyomi (hiragana)'}" style="margin-top:16px; width:280px; text-align:center; font-size:18px;"/>
          </div>
        ` : `
          <div class="back-reading">${escapeHtml(blocLectures)}</div>
          <div class="quiz-feedback ${quizSession.lastResult.pct >= 0.99 ? 'good' : (quizSession.lastResult.pct >= 0.6 ? 'mid' : 'bad')}">
            Ta réponse : "${escapeHtml(quizSession.lastAnswer) || '(vide)'}" — ${quizSession.lastResult.points}/${DB.settings.pointsPerWord} points
          </div>
          <button class="secondary small" id="btnVoirTraceKanji" style="margin-top:10px;">Voir le tracé des traits</button>
        `}
      </div>
      ${!quizSession.submitted ? `
        <button class="primary" id="btnSubmitKanji" style="margin-top:18px;">Valider</button>
      ` : `
        <button class="primary" id="btnNextKanji" style="margin-top:18px;">Suivant</button>
      `}
      <button class="secondary" id="btnQuitKanjiQuiz" style="margin-top:12px;">Quitter la session</button>
    </div>
    ${htmlModalTraceKanji()}
  `;

  if (!quizSession.submitted) {
    const input = $('#answerInputKanji');
    input.focus();
    activerSaisieKanaDirecte(input, item.type === 'onyomi');
    const submit = () => {
      const val = input.value;
      quizSession.warning = null;
      const result = scoreLectureKanji(val, blocLectures);
      quizSession.submitted = true;
      quizSession.lastAnswer = val;
      quizSession.lastResult = result;
      quizSession.totals.points += result.points;
      quizSession.answers.push({ kanji: g.kanji, type: item.type, userAnswer: val, points: result.points, pct: result.pct });
      saveKanjiInProgress();
      renderReview();
    };
    $('#btnSubmitKanji').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.isComposing || e.keyCode === 229) return;
      submit();
    });
  } else {
    const nextBtn = $('#btnNextKanji');
    // Le focus est différé d'un tick (09/09/2026) : sans ça, le relâchement
    // (keyup) du même Entrée qui vient de valider la réponse arrivait sur
    // ce bouton fraîchement focus et le cliquait aussitôt -- la réponse
    // n'était jamais vue, on sautait direct au mot suivant. Il faut un
    // DEUXIÈME appui, séparé, pour avancer.
    setTimeout(() => nextBtn.focus(), 0);
    nextBtn.addEventListener('click', () => {
      quizSession.index++;
      quizSession.submitted = false;
      quizSession.warning = null;
      renderReview();
    });
  }

  $('#btnQuitKanjiQuiz').addEventListener('click', () => {
    quizSession = null;
    renderReview();
  });

  const btnVoirTrace = $('#btnVoirTraceKanji');
  if (btnVoirTrace) {
    btnVoirTrace.addEventListener('click', () => {
      modalTraceKanji = g.kanji;
      renderReview();
    });
  }
  wireModalTraceKanji(renderReview);
}

// ---------- Mode "Kana" (hiragana/katakana -> romaji, 09/09/2026) ----------
// Table de référence standard (gojūon + dakuten/handakuten + yōon), à part
// des semestres JLPT/cursus comme demandé — contenu fixe, jamais édité par
// l'utilisateur. La katakana est dérivée de la hiragana par décalage de
// codepoint Unicode (+0x60, constant sur tout ce bloc), vérifié en tests.
const KANA_GROUPS = [{id:'g1',label:'Voyelles, KA, SA'},{id:'g2',label:'TA, NA, HA'},{id:'g3',label:'MA, YA, RA, WA + N'},{id:'g4',label:'Sons voisés (GA/ZA/DA/BA/PA)'},{id:'g5',label:'Sons combinés (KYA, SHA, CHA...)'}];
const KANA_HIRAGANA = [{char:'あ',romaji:'a',groupId:'g1'},{char:'い',romaji:'i',groupId:'g1'},{char:'う',romaji:'u',groupId:'g1'},{char:'え',romaji:'e',groupId:'g1'},{char:'お',romaji:'o',groupId:'g1'},{char:'か',romaji:'ka',groupId:'g1'},{char:'き',romaji:'ki',groupId:'g1'},{char:'く',romaji:'ku',groupId:'g1'},{char:'け',romaji:'ke',groupId:'g1'},{char:'こ',romaji:'ko',groupId:'g1'},{char:'さ',romaji:'sa',groupId:'g1'},{char:'し',romaji:'shi',groupId:'g1'},{char:'す',romaji:'su',groupId:'g1'},{char:'せ',romaji:'se',groupId:'g1'},{char:'そ',romaji:'so',groupId:'g1'},{char:'た',romaji:'ta',groupId:'g2'},{char:'ち',romaji:'chi',groupId:'g2'},{char:'つ',romaji:'tsu',groupId:'g2'},{char:'て',romaji:'te',groupId:'g2'},{char:'と',romaji:'to',groupId:'g2'},{char:'な',romaji:'na',groupId:'g2'},{char:'に',romaji:'ni',groupId:'g2'},{char:'ぬ',romaji:'nu',groupId:'g2'},{char:'ね',romaji:'ne',groupId:'g2'},{char:'の',romaji:'no',groupId:'g2'},{char:'は',romaji:'ha',groupId:'g2'},{char:'ひ',romaji:'hi',groupId:'g2'},{char:'ふ',romaji:'fu',groupId:'g2'},{char:'へ',romaji:'he',groupId:'g2'},{char:'ほ',romaji:'ho',groupId:'g2'},{char:'ま',romaji:'ma',groupId:'g3'},{char:'み',romaji:'mi',groupId:'g3'},{char:'む',romaji:'mu',groupId:'g3'},{char:'め',romaji:'me',groupId:'g3'},{char:'も',romaji:'mo',groupId:'g3'},{char:'や',romaji:'ya',groupId:'g3'},{char:'ゆ',romaji:'yu',groupId:'g3'},{char:'よ',romaji:'yo',groupId:'g3'},{char:'ら',romaji:'ra',groupId:'g3'},{char:'り',romaji:'ri',groupId:'g3'},{char:'る',romaji:'ru',groupId:'g3'},{char:'れ',romaji:'re',groupId:'g3'},{char:'ろ',romaji:'ro',groupId:'g3'},{char:'わ',romaji:'wa',groupId:'g3'},{char:'を',romaji:'wo',groupId:'g3'},{char:'ん',romaji:'n',groupId:'g3'},{char:'が',romaji:'ga',groupId:'g4'},{char:'ぎ',romaji:'gi',groupId:'g4'},{char:'ぐ',romaji:'gu',groupId:'g4'},{char:'げ',romaji:'ge',groupId:'g4'},{char:'ご',romaji:'go',groupId:'g4'},{char:'ざ',romaji:'za',groupId:'g4'},{char:'じ',romaji:'ji',groupId:'g4'},{char:'ず',romaji:'zu',groupId:'g4'},{char:'ぜ',romaji:'ze',groupId:'g4'},{char:'ぞ',romaji:'zo',groupId:'g4'},{char:'だ',romaji:'da',groupId:'g4'},{char:'ぢ',romaji:'ji',groupId:'g4'},{char:'づ',romaji:'zu',groupId:'g4'},{char:'で',romaji:'de',groupId:'g4'},{char:'ど',romaji:'do',groupId:'g4'},{char:'ば',romaji:'ba',groupId:'g4'},{char:'び',romaji:'bi',groupId:'g4'},{char:'ぶ',romaji:'bu',groupId:'g4'},{char:'べ',romaji:'be',groupId:'g4'},{char:'ぼ',romaji:'bo',groupId:'g4'},{char:'ぱ',romaji:'pa',groupId:'g4'},{char:'ぴ',romaji:'pi',groupId:'g4'},{char:'ぷ',romaji:'pu',groupId:'g4'},{char:'ぺ',romaji:'pe',groupId:'g4'},{char:'ぽ',romaji:'po',groupId:'g4'},{char:'きゃ',romaji:'kya',groupId:'g5'},{char:'きゅ',romaji:'kyu',groupId:'g5'},{char:'きょ',romaji:'kyo',groupId:'g5'},{char:'しゃ',romaji:'sha',groupId:'g5'},{char:'しゅ',romaji:'shu',groupId:'g5'},{char:'しょ',romaji:'sho',groupId:'g5'},{char:'ちゃ',romaji:'cha',groupId:'g5'},{char:'ちゅ',romaji:'chu',groupId:'g5'},{char:'ちょ',romaji:'cho',groupId:'g5'},{char:'にゃ',romaji:'nya',groupId:'g5'},{char:'にゅ',romaji:'nyu',groupId:'g5'},{char:'にょ',romaji:'nyo',groupId:'g5'},{char:'ひゃ',romaji:'hya',groupId:'g5'},{char:'ひゅ',romaji:'hyu',groupId:'g5'},{char:'ひょ',romaji:'hyo',groupId:'g5'},{char:'みゃ',romaji:'mya',groupId:'g5'},{char:'みゅ',romaji:'myu',groupId:'g5'},{char:'みょ',romaji:'myo',groupId:'g5'},{char:'りゃ',romaji:'rya',groupId:'g5'},{char:'りゅ',romaji:'ryu',groupId:'g5'},{char:'りょ',romaji:'ryo',groupId:'g5'},{char:'ぎゃ',romaji:'gya',groupId:'g5'},{char:'ぎゅ',romaji:'gyu',groupId:'g5'},{char:'ぎょ',romaji:'gyo',groupId:'g5'},{char:'じゃ',romaji:'ja',groupId:'g5'},{char:'じゅ',romaji:'ju',groupId:'g5'},{char:'じょ',romaji:'jo',groupId:'g5'},{char:'びゃ',romaji:'bya',groupId:'g5'},{char:'びゅ',romaji:'byu',groupId:'g5'},{char:'びょ',romaji:'byo',groupId:'g5'},{char:'ぴゃ',romaji:'pya',groupId:'g5'},{char:'ぴゅ',romaji:'pyu',groupId:'g5'},{char:'ぴょ',romaji:'pyo',groupId:'g5'}];
const KANA_KATAKANA = [{char:'ア',romaji:'a',groupId:'g1'},{char:'イ',romaji:'i',groupId:'g1'},{char:'ウ',romaji:'u',groupId:'g1'},{char:'エ',romaji:'e',groupId:'g1'},{char:'オ',romaji:'o',groupId:'g1'},{char:'カ',romaji:'ka',groupId:'g1'},{char:'キ',romaji:'ki',groupId:'g1'},{char:'ク',romaji:'ku',groupId:'g1'},{char:'ケ',romaji:'ke',groupId:'g1'},{char:'コ',romaji:'ko',groupId:'g1'},{char:'サ',romaji:'sa',groupId:'g1'},{char:'シ',romaji:'shi',groupId:'g1'},{char:'ス',romaji:'su',groupId:'g1'},{char:'セ',romaji:'se',groupId:'g1'},{char:'ソ',romaji:'so',groupId:'g1'},{char:'タ',romaji:'ta',groupId:'g2'},{char:'チ',romaji:'chi',groupId:'g2'},{char:'ツ',romaji:'tsu',groupId:'g2'},{char:'テ',romaji:'te',groupId:'g2'},{char:'ト',romaji:'to',groupId:'g2'},{char:'ナ',romaji:'na',groupId:'g2'},{char:'ニ',romaji:'ni',groupId:'g2'},{char:'ヌ',romaji:'nu',groupId:'g2'},{char:'ネ',romaji:'ne',groupId:'g2'},{char:'ノ',romaji:'no',groupId:'g2'},{char:'ハ',romaji:'ha',groupId:'g2'},{char:'ヒ',romaji:'hi',groupId:'g2'},{char:'フ',romaji:'fu',groupId:'g2'},{char:'ヘ',romaji:'he',groupId:'g2'},{char:'ホ',romaji:'ho',groupId:'g2'},{char:'マ',romaji:'ma',groupId:'g3'},{char:'ミ',romaji:'mi',groupId:'g3'},{char:'ム',romaji:'mu',groupId:'g3'},{char:'メ',romaji:'me',groupId:'g3'},{char:'モ',romaji:'mo',groupId:'g3'},{char:'ヤ',romaji:'ya',groupId:'g3'},{char:'ユ',romaji:'yu',groupId:'g3'},{char:'ヨ',romaji:'yo',groupId:'g3'},{char:'ラ',romaji:'ra',groupId:'g3'},{char:'リ',romaji:'ri',groupId:'g3'},{char:'ル',romaji:'ru',groupId:'g3'},{char:'レ',romaji:'re',groupId:'g3'},{char:'ロ',romaji:'ro',groupId:'g3'},{char:'ワ',romaji:'wa',groupId:'g3'},{char:'ヲ',romaji:'wo',groupId:'g3'},{char:'ン',romaji:'n',groupId:'g3'},{char:'ガ',romaji:'ga',groupId:'g4'},{char:'ギ',romaji:'gi',groupId:'g4'},{char:'グ',romaji:'gu',groupId:'g4'},{char:'ゲ',romaji:'ge',groupId:'g4'},{char:'ゴ',romaji:'go',groupId:'g4'},{char:'ザ',romaji:'za',groupId:'g4'},{char:'ジ',romaji:'ji',groupId:'g4'},{char:'ズ',romaji:'zu',groupId:'g4'},{char:'ゼ',romaji:'ze',groupId:'g4'},{char:'ゾ',romaji:'zo',groupId:'g4'},{char:'ダ',romaji:'da',groupId:'g4'},{char:'ヂ',romaji:'ji',groupId:'g4'},{char:'ヅ',romaji:'zu',groupId:'g4'},{char:'デ',romaji:'de',groupId:'g4'},{char:'ド',romaji:'do',groupId:'g4'},{char:'バ',romaji:'ba',groupId:'g4'},{char:'ビ',romaji:'bi',groupId:'g4'},{char:'ブ',romaji:'bu',groupId:'g4'},{char:'ベ',romaji:'be',groupId:'g4'},{char:'ボ',romaji:'bo',groupId:'g4'},{char:'パ',romaji:'pa',groupId:'g4'},{char:'ピ',romaji:'pi',groupId:'g4'},{char:'プ',romaji:'pu',groupId:'g4'},{char:'ペ',romaji:'pe',groupId:'g4'},{char:'ポ',romaji:'po',groupId:'g4'},{char:'キャ',romaji:'kya',groupId:'g5'},{char:'キュ',romaji:'kyu',groupId:'g5'},{char:'キョ',romaji:'kyo',groupId:'g5'},{char:'シャ',romaji:'sha',groupId:'g5'},{char:'シュ',romaji:'shu',groupId:'g5'},{char:'ショ',romaji:'sho',groupId:'g5'},{char:'チャ',romaji:'cha',groupId:'g5'},{char:'チュ',romaji:'chu',groupId:'g5'},{char:'チョ',romaji:'cho',groupId:'g5'},{char:'ニャ',romaji:'nya',groupId:'g5'},{char:'ニュ',romaji:'nyu',groupId:'g5'},{char:'ニョ',romaji:'nyo',groupId:'g5'},{char:'ヒャ',romaji:'hya',groupId:'g5'},{char:'ヒュ',romaji:'hyu',groupId:'g5'},{char:'ヒョ',romaji:'hyo',groupId:'g5'},{char:'ミャ',romaji:'mya',groupId:'g5'},{char:'ミュ',romaji:'myu',groupId:'g5'},{char:'ミョ',romaji:'myo',groupId:'g5'},{char:'リャ',romaji:'rya',groupId:'g5'},{char:'リュ',romaji:'ryu',groupId:'g5'},{char:'リョ',romaji:'ryo',groupId:'g5'},{char:'ギャ',romaji:'gya',groupId:'g5'},{char:'ギュ',romaji:'gyu',groupId:'g5'},{char:'ギョ',romaji:'gyo',groupId:'g5'},{char:'ジャ',romaji:'ja',groupId:'g5'},{char:'ジュ',romaji:'ju',groupId:'g5'},{char:'ジョ',romaji:'jo',groupId:'g5'},{char:'ビャ',romaji:'bya',groupId:'g5'},{char:'ビュ',romaji:'byu',groupId:'g5'},{char:'ビョ',romaji:'byo',groupId:'g5'},{char:'ピャ',romaji:'pya',groupId:'g5'},{char:'ピュ',romaji:'pyu',groupId:'g5'},{char:'ピョ',romaji:'pyo',groupId:'g5'}];

// Namespace de données à part (DB.scoresKana, DB.inProgressKana), jamais
// mélangé avec DB.scores/DB.scoresKanji — même discipline que le mode
// Kanji seul.
function getKanaList(kanaType) {
  return kanaType === 'katakana' ? KANA_KATAKANA : KANA_HIRAGANA;
}
function kanaScoreKey(kanaType, groupId) {
  return `${kanaType}-${groupId}`;
}
function buildKanaQueue(kanaType, groupId) {
  return getKanaList(kanaType).filter(k => k.groupId === groupId);
}
function getKanaScoreEntry(kanaType, groupId) {
  return (DB.scoresKana && DB.scoresKana[kanaScoreKey(kanaType, groupId)]) || null;
}
function recordKanaSessionResult(kanaType, groupId, points, maxPoints, pct, dureeMs) {
  if (!DB.scoresKana) DB.scoresKana = {};
  const key = kanaScoreKey(kanaType, groupId);
  if (!DB.scoresKana[key]) DB.scoresKana[key] = { best: null, history: [] };
  const entry = DB.scoresKana[key];
  const record = { date: new Date().toISOString(), points, maxPoints, pct, dureeMs };
  entry.history.push(record);
  if (!entry.best || pct > entry.best.pct) entry.best = record;
}
function getValidKanaInProgress(kanaType, groupId) {
  if (!DB.inProgressKana) return null;
  const saved = DB.inProgressKana[kanaScoreKey(kanaType, groupId)];
  if (!saved || !Array.isArray(saved.queue) || !Array.isArray(saved.answers)) return null;
  const currentQueue = buildKanaQueue(kanaType, groupId);
  const stillValid = saved.queue.length === currentQueue.length &&
    saved.queue.every((item, i) => item.char === currentQueue[i].char);
  if (!stillValid || saved.index >= saved.queue.length) return null;
  return saved;
}
function saveKanaInProgress() {
  if (!quizSession || quizSession.mode !== 'kana') return;
  if (!DB.inProgressKana) DB.inProgressKana = {};
  DB.inProgressKana[kanaScoreKey(quizSession.kanaType, quizSession.groupId)] = {
    queue: quizSession.queue,
    index: quizSession.answers.length,
    totals: { ...quizSession.totals },
    hardcore: quizSession.hardcore,
    answers: quizSession.answers.slice(),
    updatedAt: new Date().toISOString()
  };
  persist();
}
function clearKanaInProgress(kanaType, groupId) {
  if (DB.inProgressKana) delete DB.inProgressKana[kanaScoreKey(kanaType, groupId)];
}

// Vue "Kana" (hiragana/katakana -> romaji) : séparée elle aussi, même
// esprit que renderKanjiQuizView (aucune branche ajoutée aux modes déjà
// testés). La notation réutilise scoreAnswer telle quelle : chaque kana a
// exactement UNE réponse canonique (contrairement à onyomi/kunyomi), donc
// pas besoin d'une logique de correspondance dédiée.
function renderKanaQuizView(container) {
  if (quizSession.index >= quizSession.queue.length) {
    const { points, maxPoints, startedAt } = quizSession.totals;
    const dureeMs = Number.isFinite(startedAt) ? Date.now() - startedAt : null;
    const pct = maxPoints > 0
      // Bug #19 (22/09/2026) : un score presque parfait (ex. 569/570)
      // arrondissait a 100%, ce qui donnait un faux sentiment de sans-faute.
      // 100% est reserve au score reellement parfait ; sinon on plafonne a 99%
      // meme si l'''arrondi mathematique donnerait 100.
      ? (points >= maxPoints ? 100 : Math.min(99, Math.round((points / maxPoints) * 100)))
      : 0;
    const prevEntry = getKanaScoreEntry(quizSession.kanaType, quizSession.groupId);
    const prevBest = prevEntry ? prevEntry.best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    recordKanaSessionResult(quizSession.kanaType, quizSession.groupId, points, maxPoints, pct, dureeMs);
    clearKanaInProgress(quizSession.kanaType, quizSession.groupId);
    persist();
    if (typeof kvtSnapshotHistorique === 'function') kvtSnapshotHistorique();
    const groupLabel = (KANA_GROUPS.find(g => g.id === quizSession.groupId) || {}).label || '';
    const typeLabel = quizSession.kanaType === 'katakana' ? 'Katakana' : 'Hiragana';
    const etat = pct >= 100 ? 'perfect' : (pct >= 70 ? 'good' : 'low');
    const badge = improved
      ? `<div class="kvt-result__badge">Record — nouveau meilleur score</div>`
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${prevBest}&nbsp;%</div>` : '');
    container.innerHTML = `
      <h2>${typeLabel} — ${escapeHtml(groupLabel)}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${badge}
        <div class="kvt-result__pct">${pct}&nbsp;%</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <button class="kvt-result__btn" type="button" id="btnBackKanaReview">Retour</button>
      </div>
    `;
    $('#btnBackKanaReview').addEventListener('click', () => {
      quizSession = null;
      renderReview();
    });
    return;
  }

  const item = quizSession.queue[quizSession.index];
  const progressPct = Math.round((quizSession.index / quizSession.queue.length) * 100);
  const typeLabel = quizSession.kanaType === 'katakana' ? 'Katakana' : 'Hiragana';

  container.innerHTML = `
    <h2>${typeLabel} — romaji</h2>
    <div class="flashcard-wrap">
      <div class="session-progress">
        <div style="font-size:12px; color:var(--muted);">${quizSession.index + 1} / ${quizSession.queue.length}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      </div>
      <div class="flashcard">
        <div class="front-word">${escapeHtml(item.char)}</div>
        ${!quizSession.submitted ? `
          ${quizSession.warning ? `<div class="quiz-feedback bad" style="margin-top:12px;">${escapeHtml(quizSession.warning)}</div>` : ''}
          <div class="answer-input-wrap">
            <input id="answerInputKana" type="text" placeholder="Écris en romaji (ex : ka, shi, tsu...)" style="margin-top:16px; width:280px; text-align:center; font-size:18px;"/>
          </div>
        ` : quizSession.hardcore ? `
          <div class="quiz-feedback mid" style="margin-top:16px;">
            Réponse enregistrée. Correction disponible à la fin de la session.
          </div>
        ` : `
          <div class="back-reading">${escapeHtml(item.romaji)}</div>
          <div class="quiz-feedback ${quizSession.lastResult.pct >= 0.99 ? 'good' : (quizSession.lastResult.pct >= 0.6 ? 'mid' : 'bad')}">
            Ta réponse : "${escapeHtml(quizSession.lastAnswer) || '(vide)'}" — ${quizSession.lastResult.points}/${DB.settings.pointsPerWord} points
          </div>
        `}
      </div>
      ${!quizSession.submitted ? `
        <button class="primary" id="btnSubmitKana" style="margin-top:18px;">Valider</button>
      ` : `
        <button class="primary" id="btnNextKana" style="margin-top:18px;">Suivant</button>
      `}
      <button class="secondary" id="btnQuitKanaQuiz" style="margin-top:12px;">Quitter la session</button>
    </div>
  `;

  if (!quizSession.submitted) {
    const input = $('#answerInputKana');
    input.focus();
    const submit = () => {
      const val = input.value;
      quizSession.warning = null;
      const result = scoreAnswer(val.trim().toLowerCase(), item.romaji);
      quizSession.submitted = true;
      quizSession.lastAnswer = val;
      quizSession.lastResult = result;
      quizSession.totals.points += result.points;
      quizSession.answers.push({ char: item.char, romaji: item.romaji, userAnswer: val, points: result.points, pct: result.pct });
      saveKanaInProgress();
      renderReview();
    };
    $('#btnSubmitKana').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.isComposing || e.keyCode === 229) return;
      submit();
    });
  } else {
    const nextBtn = $('#btnNextKana');
    // Le focus est différé d'un tick (09/09/2026) : sans ça, le relâchement
    // (keyup) du même Entrée qui vient de valider la réponse arrivait sur
    // ce bouton fraîchement focus et le cliquait aussitôt -- la réponse
    // n'était jamais vue, on sautait direct au mot suivant. Il faut un
    // DEUXIÈME appui, séparé, pour avancer.
    setTimeout(() => nextBtn.focus(), 0);
    nextBtn.addEventListener('click', () => {
      quizSession.index++;
      quizSession.submitted = false;
      quizSession.warning = null;
      renderReview();
    });
  }

  $('#btnQuitKanaQuiz').addEventListener('click', () => {
    quizSession = null;
    renderReview();
  });
}

// Démarre une session sur un groupe de kana (hiragana ou katakana), avec la
// même logique de reprise que les autres modes.
function startKanaQuiz(kanaType, groupId, forceRestart) {
  const saved = forceRestart ? null : getValidKanaInProgress(kanaType, groupId);
  if (saved) {
    quizSession = {
      mode: 'kana', kanaType, groupId,
      queue: saved.queue,
      index: saved.index,
      submitted: false,
      lastAnswer: '',
      lastResult: null,
      warning: null,
      hardcore: saved.hardcore,
      answers: saved.answers.slice(),
      totals: { ...saved.totals }
    };
    return;
  }
  clearKanaInProgress(kanaType, groupId);
  const queue = shuffle(buildKanaQueue(kanaType, groupId));
  quizSession = {
    mode: 'kana', kanaType, groupId,
    queue,
    index: 0,
    submitted: false,
    lastAnswer: '',
    lastResult: null,
    warning: null,
    hardcore: !!DB.settings.hardcoreMode, // figé au démarrage, comme les autres modes
    answers: [],
    totals: { points: 0, maxPoints: queue.length * DB.settings.pointsPerWord, startedAt: Date.now() }
  };
}

// Symétrique de startQuiz() pour le mode "Kanji seul" — file de lecture
// séparée (buildKanjiQueue), progression et scores séparés (DB.inProgressKanji
// / DB.scoresKanji), aucun partage d'état avec le quiz vocabulaire.
function startKanjiQuiz(semesterId, week, forceRestart) {
  const saved = forceRestart ? null : getValidKanjiInProgress(semesterId, week);
  if (saved) {
    quizSession = {
      mode: 'kanji',
      semesterId, week,
      queue: saved.queue,
      index: saved.index,
      submitted: false,
      lastAnswer: '',
      lastResult: null,
      warning: null,
      hardcore: saved.hardcore,
      answers: saved.answers.slice(),
      totals: { ...saved.totals }
    };
    return;
  }
  clearKanjiInProgress(semesterId, week);
  const queue = shuffle(buildKanjiQueue(semesterId, week));
  quizSession = {
    mode: 'kanji',
    semesterId, week,
    queue,
    index: 0,
    submitted: false,
    lastAnswer: '',
    lastResult: null,
    warning: null,
    hardcore: !!DB.settings.hardcoreMode,
    answers: [],
    totals: { points: 0, maxPoints: queue.length * DB.settings.pointsPerWord, startedAt: Date.now() }
  };
}

// ---------- Mode "Ecriture" (kana affiche -> kanji ecrit sur papier) ----------
// Demande explicite de Paul (17/09/2026) : PAS de notation automatique --
// l'utilisateur ecrit le kanji lui-meme sur papier, puis revele la reponse
// pour s'auto-corriger. Volontairement stateless (pas de score, pas de
// reprise de session sauvegardee) : il n'y a rien a noter, donc rien a
// persister -- une carte "termine" en fin de file suffit a boucler.
function startEcritureQuiz(semesterId, week, verbeFilter) {
  const filtre = verbeFilter || 'tous';
  const vocabList = filtrerVocabParVerbe(getVocabForWeek(semesterId, week), filtre);
  quizSession = {
    mode: 'ecriture', semesterId, week,
    queue: shuffle(vocabList.map(v => v.id)),
    index: 0,
    revealed: false
  };
}

function renderEcritureQuizView(container) {
  if (quizSession.index >= quizSession.queue.length) {
    container.innerHTML = `
      <h2>Ecriture -- ${escapeHtml(getSemester(quizSession.semesterId).label)} Semaine ${quizSession.week}</h2>
      <div class="kvt-result kvt-result--good">
        <div class="kvt-result__title">Termine.</div>
        <div class="kvt-result__sub">${quizSession.queue.length} mot(s) ecrit(s). Pas de score sur ce mode -- l'auto-correction sur papier suffit.</div>
        <button class="kvt-result__btn" type="button" id="btnBackEcritureReview">Retour</button>
      </div>
    `;
    $('#btnBackEcritureReview').addEventListener('click', () => {
      quizSession = null;
      renderReview();
    });
    return;
  }

  const vocabId = quizSession.queue[quizSession.index];
  const v = DB.vocab.find(x => x.id === vocabId);
  const progressPct = Math.round((quizSession.index / quizSession.queue.length) * 100);

  container.innerHTML = `
    <h2>Ecriture -- ${escapeHtml(getSemester(quizSession.semesterId).label)} Semaine ${quizSession.week}</h2>
    <div class="flashcard-wrap">
      <div class="session-progress">
        <div style="font-size:12px; color:var(--muted);">${quizSession.index + 1} / ${quizSession.queue.length}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      </div>
      <div class="flashcard">
        <div class="front-word${quizSession.revealed ? ' front-word--ecriture-revele' : ''}">${escapeHtml(v.lecture)}</div>
        <div class="hint" style="margin-top:8px;">Ecris le kanji sur papier, puis revele pour verifier.</div>
        ${quizSession.revealed ? `
          ${(() => {
            // Indice anti-confusion (tache #14) : n'apparait que s'il existe
            // reellement un piege pour CE mot -- silencieux sinon, pas de
            // bruit visuel pour les mots sans homophone dans le programme.
            // Place AVANT la reponse (demande de Paul, 23/09/2026) : l'idee
            // est de repondre a la question avant de decouvrir le kanji
            // juste en dessous, pas de le lire une fois la reponse deja vue.
            const confondables = motsConfondables(v);
            if (confondables.length === 0) return '';
            const liste = confondables.map(c => `${escapeHtml(c.mot)}${c.sens ? ' (' + escapeHtml(c.sens) + ')' : ''}`).join(', ');
            return `<div class="anti-confusion">⚠ Ne pas confondre avec : ${liste} — meme lecture, kanji different.</div>`;
          })()}
          <div class="back-reading back-reading--grand">${escapeHtml(v.mot)}${registreBadge(v)}</div>
          ${v.sens ? `<div class="back-meaning">${escapeHtml(v.sens)}</div>` : ''}
          <button class="secondary small" id="btnVoirTraceEcriture" style="margin-top:10px;">Voir le tracé des traits</button>
        ` : ''}
      </div>
      ${!quizSession.revealed ? `
        <button class="primary" id="btnRevealEcriture" style="margin-top:18px;">Reveler la reponse</button>
      ` : `
        <button class="primary" id="btnNextEcriture" style="margin-top:18px;">Mot suivant</button>
      `}
      <button class="secondary" id="btnQuitEcritureQuiz" style="margin-top:12px;">Quitter la session</button>
    </div>
    ${htmlModalTraceKanji()}
  `;

  if (!quizSession.revealed) {
    $('#btnRevealEcriture').addEventListener('click', () => {
      quizSession.revealed = true;
      renderReview();
    });
  } else {
    const nextBtn = $('#btnNextEcriture');
    setTimeout(() => nextBtn.focus(), 0);
    nextBtn.addEventListener('click', () => {
      quizSession.index++;
      quizSession.revealed = false;
      renderReview();
    });
  }

  $('#btnQuitEcritureQuiz').addEventListener('click', () => {
    quizSession = null;
    renderReview();
  });

  const btnVoirTrace = $('#btnVoirTraceEcriture');
  if (btnVoirTrace) {
    btnVoirTrace.addEventListener('click', () => {
      // v.mot peut contenir plusieurs kanji (mot compose) : htmlModalTraceKanji
      // utilise deja caracteresKanjiDistincts() pour les isoler un par un,
      // meme mecanisme que le bouton equivalent en Kanji seul (g.kanji, lui,
      // n'en contient qu'un seul).
      modalTraceKanji = v.mot;
      renderReview();
    });
  }
  wireModalTraceKanji(renderReview);
}

// ---------- Mode "Traduction" (francais -> japonais) ----------
// Le sens en francais s'affiche, la reponse est attendue en kanji OU en
// kana -- on reutilise scoreAnswer() en lui passant mot+lecture comme
// alternatives valables (meme mecanisme que les mots a lectures multiples
// separees par "/", voir plus haut) : pas besoin d'une logique de
// correspondance dediee. Namespace a part (DB.scoresTraduction /
// DB.inProgressTraduction), jamais melange avec DB.scores (mode
// Vocabulaire) -- meme discipline que Kanji seul/Kana.
function scoreTraductionAnswer(input, v) {
  return scoreAnswer(input, `${v.mot}/${v.lecture}`);
}
function getTraductionScoreEntry(semesterId, week) {
  return (DB.scoresTraduction && DB.scoresTraduction[weekKey(semesterId, week)]) || null;
}
function recordTraductionSessionResult(semesterId, week, points, maxPoints, pct, dureeMs) {
  if (!DB.scoresTraduction) DB.scoresTraduction = {};
  const key = weekKey(semesterId, week);
  if (!DB.scoresTraduction[key]) DB.scoresTraduction[key] = { best: null, history: [] };
  const entry = DB.scoresTraduction[key];
  const record = { date: new Date().toISOString(), points, maxPoints, pct, dureeMs };
  entry.history.push(record);
  if (!entry.best || pct > entry.best.pct) entry.best = record;
}
function getValidTraductionInProgress(semesterId, week) {
  if (!DB.inProgressTraduction) return null;
  const saved = DB.inProgressTraduction[weekKey(semesterId, week)];
  if (!saved || !Array.isArray(saved.queue) || !Array.isArray(saved.answers)) return null;
  const vocabList = filtrerVocabParVerbe(getVocabForWeek(semesterId, week), saved.verbeFilter || 'tous');
  const currentIds = new Set(vocabList.map(v => v.id));
  const stillValid = saved.queue.length === vocabList.length && saved.queue.every(id => currentIds.has(id));
  if (!stillValid || saved.index >= saved.queue.length) return null;
  return saved;
}
function saveTraductionInProgress() {
  if (!quizSession || quizSession.mode !== 'traduction') return;
  if (!DB.inProgressTraduction) DB.inProgressTraduction = {};
  DB.inProgressTraduction[weekKey(quizSession.semesterId, quizSession.week)] = {
    queue: quizSession.queue,
    index: quizSession.answers.length,
    totals: { ...quizSession.totals },
    hardcore: quizSession.hardcore,
    verbeFilter: quizSession.verbeFilter || 'tous',
    answers: quizSession.answers.slice(),
    updatedAt: new Date().toISOString()
  };
  persist();
}
function clearTraductionInProgress(semesterId, week) {
  if (DB.inProgressTraduction) delete DB.inProgressTraduction[weekKey(semesterId, week)];
}

function renderTraductionQuizView(container) {
  if (quizSession.index >= quizSession.queue.length) {
    const { points, maxPoints, startedAt } = quizSession.totals;
    const dureeMs = Number.isFinite(startedAt) ? Date.now() - startedAt : null;
    const pct = maxPoints > 0
      // Bug #19 (22/09/2026) : un score presque parfait (ex. 569/570)
      // arrondissait a 100%, ce qui donnait un faux sentiment de sans-faute.
      // 100% est reserve au score reellement parfait ; sinon on plafonne a 99%
      // meme si l'''arrondi mathematique donnerait 100.
      ? (points >= maxPoints ? 100 : Math.min(99, Math.round((points / maxPoints) * 100)))
      : 0;
    const prevEntry = getTraductionScoreEntry(quizSession.semesterId, quizSession.week);
    const prevBest = prevEntry ? prevEntry.best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    recordTraductionSessionResult(quizSession.semesterId, quizSession.week, points, maxPoints, pct, dureeMs);
    clearTraductionInProgress(quizSession.semesterId, quizSession.week);
    persist();
    // Classement de classe, mode 'traduction' (rang 5, #16).
    if (typeof window.kvtPushScore === 'function') {
      const histEntry = getTraductionScoreEntry(quizSession.semesterId, quizSession.week);
      window.kvtPushScore(quizSession.semesterId, quizSession.week, histEntry.best.points, histEntry.best.maxPoints, histEntry.best.pct, 'traduction', histEntry.best.dureeMs, histEntry.history.length);
    }    // Synchronise aussi l'instantane du graphique hexagonal (deplace vers
    // le Profil public, demande de Paul le 23/09/2026) : ce mode vient de
    // faire bouger au moins un des 6 axes, autant le repousser tout de
    // suite plutot que d'attendre une visite sur son propre profil.
    if (typeof window.kvtPushHexagoneStats === 'function' && typeof getHexagoneStats === 'function') {
      window.kvtPushHexagoneStats(getHexagoneStats());
    }
    if (typeof kvtSnapshotHistorique === 'function') kvtSnapshotHistorique();
    const semLabel = getSemester(quizSession.semesterId).label;
    const etat = pct >= 100 ? 'perfect' : (pct >= 70 ? 'good' : 'low');
    const badge = improved
      ? `<div class="kvt-result__badge">Record -- nouveau meilleur score</div>`
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${prevBest}&nbsp;%</div>` : '');
    container.innerHTML = `
      <h2>Traduction -- ${escapeHtml(semLabel)} Semaine ${quizSession.week}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${badge}
        <div class="kvt-result__pct">${pct}&nbsp;%</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <button class="kvt-result__btn" type="button" id="btnBackTraductionReview">Retour</button>
      </div>
    `;
    $('#btnBackTraductionReview').addEventListener('click', () => {
      quizSession = null;
      renderReview();
    });
    return;
  }

  const vocabId = quizSession.queue[quizSession.index];
  const v = DB.vocab.find(x => x.id === vocabId);
  const progressPct = Math.round((quizSession.index / quizSession.queue.length) * 100);

  container.innerHTML = `
    <h2>Traduction -- ${escapeHtml(getSemester(quizSession.semesterId).label)} Semaine ${quizSession.week}</h2>
    <div class="flashcard-wrap">
      <div class="session-progress">
        <div style="font-size:12px; color:var(--muted);">${quizSession.index + 1} / ${quizSession.queue.length}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      </div>
      <div class="flashcard">
        <div class="front-word">${escapeHtml(v.sens || '(sens manquant)')}</div>
        ${!quizSession.submitted ? `
          ${quizSession.warning ? `<div class="quiz-feedback bad" style="margin-top:12px;">${escapeHtml(quizSession.warning)}</div>` : ''}
          <div class="answer-input-wrap">
            <input id="answerInputTraduction" type="text" placeholder="Reponds en kanji ou en kana" style="margin-top:16px; width:280px; text-align:center; font-size:18px;"/>
          </div>
        ` : quizSession.hardcore ? `
          <div class="quiz-feedback mid" style="margin-top:16px;">
            Reponse enregistree. Correction disponible a la fin de la session.
          </div>
        ` : `
          <div class="back-reading">${escapeHtml(v.mot)} (${escapeHtml(v.lecture)})${registreBadge(v)}</div>
          <div class="quiz-feedback ${quizSession.lastResult.pct >= 0.99 ? 'good' : (quizSession.lastResult.pct >= 0.6 ? 'mid' : 'bad')}">
            Ta reponse : "${escapeHtml(quizSession.lastAnswer) || '(vide)'}" -- ${quizSession.lastResult.points}/${DB.settings.pointsPerWord} points (${Math.round(quizSession.lastResult.pct * 100)}% de similarite)
          </div>
        `}
      </div>
      ${!quizSession.submitted ? `
        <button class="primary" id="btnSubmitTraduction" style="margin-top:18px;">Valider</button>
      ` : `
        <button class="primary" id="btnNextTraduction" style="margin-top:18px;">Mot suivant</button>
      `}
      <button class="secondary" id="btnQuitTraductionQuiz" style="margin-top:12px;">Quitter la session</button>
    </div>
  `;

  if (!quizSession.submitted) {
    const input = $('#answerInputTraduction');
    input.focus();
    const submit = () => {
      const val = input.value;
      quizSession.warning = null;
      const result = scoreTraductionAnswer(val, v);
      quizSession.submitted = true;
      quizSession.lastAnswer = val;
      quizSession.lastResult = result;
      quizSession.totals.points += result.points;
      quizSession.answers.push({ mot: v.mot, lecture: v.lecture, sens: v.sens, userAnswer: val, points: result.points, pct: result.pct });
      recordWordAttempt(v.id, result.pct);
      if (typeof gagnerXp === 'function') gagnerXp(result.points, quizSession.semesterId);
      if (typeof gagnerPieces === 'function') gagnerPieces(result.points, quizSession.semesterId);
      if (typeof mettreAJourStreak === 'function') mettreAJourStreak();
      saveTraductionInProgress();
      renderReview();
    };
    $('#btnSubmitTraduction').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.isComposing || e.keyCode === 229) return;
      submit();
    });
  } else {
    const nextBtn = $('#btnNextTraduction');
    setTimeout(() => nextBtn.focus(), 0);
    nextBtn.addEventListener('click', () => {
      quizSession.index++;
      quizSession.submitted = false;
      quizSession.warning = null;
      renderReview();
    });
  }

  $('#btnQuitTraductionQuiz').addEventListener('click', () => {
    quizSession = null;
    renderReview();
  });
}

function startTraductionQuiz(semesterId, week, forceRestart, verbeFilter) {
  const filtre = verbeFilter || 'tous';
  const vocabList = filtrerVocabParVerbe(getVocabForWeek(semesterId, week), filtre);
  const saved = forceRestart ? null : getValidTraductionInProgress(semesterId, week);
  if (saved) {
    quizSession = {
      mode: 'traduction', semesterId, week,
      queue: saved.queue,
      index: saved.index,
      submitted: false,
      lastAnswer: '',
      lastResult: null,
      warning: null,
      hardcore: saved.hardcore,
      verbeFilter: saved.verbeFilter || 'tous',
      answers: saved.answers.slice(),
      totals: { ...saved.totals }
    };
    return;
  }
  clearTraductionInProgress(semesterId, week);
  const queue = shuffle(vocabList.map(v => v.id));
  quizSession = {
    mode: 'traduction', semesterId, week,
    queue,
    index: 0,
    submitted: false,
    lastAnswer: '',
    lastResult: null,
    warning: null,
    hardcore: !!DB.settings.hardcoreMode,
    verbeFilter: filtre,
    answers: [],
    totals: { points: 0, maxPoints: queue.length * DB.settings.pointsPerWord, startedAt: Date.now() }
  };
}

// ---------- Mode "Double reponse" (lecture + sens simultanes, tache #11) ----------
// Le mot s'affiche en kanji (comme en Ecriture), mais ICI on demande de
// taper la lecture ET le sens sur le meme ecran, plutot que de les revoir
// separement dans deux modes distincts (Vocabulaire = lecture seule,
// Traduction = sens -> mot) -- plus proche d'un vrai controle de
// connaissance complete du mot. Scoring : voir scoreDoubleAnswer() plus
// haut (minimum des deux pourcentages, pas une moyenne). Namespace a
// part (DB.scoresDouble / DB.inProgressDouble), meme discipline que les
// autres modes dedies (Kanji seul, Kana, Traduction...).
function getDoubleScoreEntry(semesterId, week) {
  return (DB.scoresDouble && DB.scoresDouble[weekKey(semesterId, week)]) || null;
}
function recordDoubleSessionResult(semesterId, week, points, maxPoints, pct, dureeMs) {
  if (!DB.scoresDouble) DB.scoresDouble = {};
  const key = weekKey(semesterId, week);
  if (!DB.scoresDouble[key]) DB.scoresDouble[key] = { best: null, history: [] };
  const entry = DB.scoresDouble[key];
  const record = { date: new Date().toISOString(), points, maxPoints, pct, dureeMs };
  entry.history.push(record);
  if (!entry.best || pct > entry.best.pct) entry.best = record;
}
function getValidDoubleInProgress(semesterId, week) {
  if (!DB.inProgressDouble) return null;
  const saved = DB.inProgressDouble[weekKey(semesterId, week)];
  if (!saved || !Array.isArray(saved.queue) || !Array.isArray(saved.answers)) return null;
  const vocabList = filtrerVocabParVerbe(getVocabForWeek(semesterId, week), saved.verbeFilter || 'tous');
  const currentIds = new Set(vocabList.map(v => v.id));
  const stillValid = saved.queue.length === vocabList.length && saved.queue.every(id => currentIds.has(id));
  if (!stillValid || saved.index >= saved.queue.length) return null;
  return saved;
}
function saveDoubleInProgress() {
  if (!quizSession || quizSession.mode !== 'double') return;
  if (!DB.inProgressDouble) DB.inProgressDouble = {};
  DB.inProgressDouble[weekKey(quizSession.semesterId, quizSession.week)] = {
    queue: quizSession.queue,
    index: quizSession.answers.length,
    totals: { ...quizSession.totals },
    hardcore: quizSession.hardcore,
    verbeFilter: quizSession.verbeFilter || 'tous',
    answers: quizSession.answers.slice(),
    updatedAt: new Date().toISOString()
  };
  persist();
}
function clearDoubleInProgress(semesterId, week) {
  if (DB.inProgressDouble) delete DB.inProgressDouble[weekKey(semesterId, week)];
}

function renderDoubleQuizView(container) {
  if (quizSession.index >= quizSession.queue.length) {
    const { points, maxPoints, startedAt } = quizSession.totals;
    const dureeMs = Number.isFinite(startedAt) ? Date.now() - startedAt : null;
    const pct = maxPoints > 0
      ? (points >= maxPoints ? 100 : Math.min(99, Math.round((points / maxPoints) * 100)))
      : 0;
    const prevEntry = getDoubleScoreEntry(quizSession.semesterId, quizSession.week);
    const prevBest = prevEntry ? prevEntry.best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    recordDoubleSessionResult(quizSession.semesterId, quizSession.week, points, maxPoints, pct, dureeMs);
    clearDoubleInProgress(quizSession.semesterId, quizSession.week);
    persist();
    // Classement de classe, mode 'double' (rang 5, #16).
    if (typeof window.kvtPushScore === 'function') {
      const histEntry = getDoubleScoreEntry(quizSession.semesterId, quizSession.week);
      window.kvtPushScore(quizSession.semesterId, quizSession.week, histEntry.best.points, histEntry.best.maxPoints, histEntry.best.pct, 'double', histEntry.best.dureeMs, histEntry.history.length);
    }    // Synchronise aussi l'instantane du graphique hexagonal (deplace vers
    // le Profil public, demande de Paul le 23/09/2026) : ce mode vient de
    // faire bouger au moins un des 6 axes, autant le repousser tout de
    // suite plutot que d'attendre une visite sur son propre profil.
    if (typeof window.kvtPushHexagoneStats === 'function' && typeof getHexagoneStats === 'function') {
      window.kvtPushHexagoneStats(getHexagoneStats());
    }
    if (typeof kvtSnapshotHistorique === 'function') kvtSnapshotHistorique();
    const semLabel = getSemester(quizSession.semesterId).label;
    const etat = pct >= 100 ? 'perfect' : (pct >= 70 ? 'good' : 'low');
    const badge = improved
      ? `<div class="kvt-result__badge">Record -- nouveau meilleur score</div>`
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${prevBest}&nbsp;%</div>` : '');
    container.innerHTML = `
      <h2>Double réponse -- ${escapeHtml(semLabel)} Semaine ${quizSession.week}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${badge}
        <div class="kvt-result__pct">${pct}&nbsp;%</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <button class="kvt-result__btn" type="button" id="btnBackDoubleReview">Retour</button>
      </div>
    `;
    $('#btnBackDoubleReview').addEventListener('click', () => {
      quizSession = null;
      renderReview();
    });
    return;
  }

  const vocabId = quizSession.queue[quizSession.index];
  const v = DB.vocab.find(x => x.id === vocabId);
  const progressPct = Math.round((quizSession.index / quizSession.queue.length) * 100);

  container.innerHTML = `
    <h2>Double réponse -- ${escapeHtml(getSemester(quizSession.semesterId).label)} Semaine ${quizSession.week}</h2>
    <div class="flashcard-wrap">
      <div class="session-progress">
        <div style="font-size:12px; color:var(--muted);">${quizSession.index + 1} / ${quizSession.queue.length}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      </div>
      <div class="flashcard">
        <div class="front-word">${escapeHtml(v.mot)}</div>
        <div class="hint">Lecture ET sens attendus -- les deux doivent etre justes pour marquer des points.</div>
        ${!quizSession.submitted ? `
          ${quizSession.warning ? `<div class="quiz-feedback bad" style="margin-top:12px;">${escapeHtml(quizSession.warning)}</div>` : ''}
          <div class="answer-input-wrap double-answer-wrap">
            <input id="answerInputDoubleLecture" type="text" placeholder="Lecture (hiragana/katakana)" style="margin-top:16px; width:280px; text-align:center; font-size:18px;"/>
            <input id="answerInputDoubleSens" type="text" placeholder="Sens (en français)" style="margin-top:10px; width:280px; text-align:center; font-size:18px;"/>
          </div>
        ` : quizSession.hardcore ? `
          <div class="quiz-feedback mid" style="margin-top:16px;">
            Reponses enregistrees. Correction disponible a la fin de la session.
          </div>
        ` : `
          <div class="back-reading">${escapeHtml(v.lecture)}${registreBadge(v)}</div>
          <div class="back-meaning">${escapeHtml(v.sens)}</div>
          <div class="quiz-feedback ${quizSession.lastResult.pct >= 0.99 ? 'good' : (quizSession.lastResult.pct >= 0.6 ? 'mid' : 'bad')}">
            Lecture : "${escapeHtml(quizSession.lastAnswer.lecture) || '(vide)'}" (${Math.round(quizSession.lastResult.lecture.pct * 100)}%) ·
            Sens : "${escapeHtml(quizSession.lastAnswer.sens) || '(vide)'}" (${Math.round(quizSession.lastResult.sens.pct * 100)}%)
            -- ${quizSession.lastResult.points}/${DB.settings.pointsPerWord} points
          </div>
        `}
      </div>
      ${!quizSession.submitted ? `
        <button class="primary" id="btnSubmitDouble" style="margin-top:18px;">Valider</button>
      ` : `
        <button class="primary" id="btnNextDouble" style="margin-top:18px;">Mot suivant</button>
      `}
      <button class="secondary" id="btnQuitDoubleQuiz" style="margin-top:12px;">Quitter la session</button>
    </div>
  `;

  if (!quizSession.submitted) {
    const inputLecture = $('#answerInputDoubleLecture');
    const inputSens = $('#answerInputDoubleSens');
    inputLecture.focus();
    activerSaisieKanaDirecte(inputLecture, false);
    const submit = () => {
      const valLecture = inputLecture.value;
      const valSens = inputSens.value;
      quizSession.warning = null;
      const result = scoreDoubleAnswer(valLecture, valSens, v);
      quizSession.submitted = true;
      quizSession.lastAnswer = { lecture: valLecture, sens: valSens };
      quizSession.lastResult = result;
      quizSession.totals.points += result.points;
      quizSession.answers.push({ mot: v.mot, lecture: v.lecture, sens: v.sens, userAnswerLecture: valLecture, userAnswerSens: valSens, points: result.points, pct: result.pct });
      recordWordAttempt(v.id, result.pct);
      if (typeof gagnerXp === 'function') gagnerXp(result.points, quizSession.semesterId);
      if (typeof gagnerPieces === 'function') gagnerPieces(result.points, quizSession.semesterId);
      if (typeof mettreAJourStreak === 'function') mettreAJourStreak();
      saveDoubleInProgress();
      renderReview();
    };
    // Entree dans le champ Lecture -> passe au champ Sens (encore un champ a
    // remplir, pas de validation) ; Entree dans le champ Sens -> valide les
    // deux d'un coup. Meme garde IME (isComposing/229) que partout ailleurs.
    inputLecture.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      inputSens.focus();
    });
    inputSens.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.isComposing || e.keyCode === 229) return;
      submit();
    });
    $('#btnSubmitDouble').addEventListener('click', submit);
  } else {
    const nextBtn = $('#btnNextDouble');
    setTimeout(() => nextBtn.focus(), 0);
    nextBtn.addEventListener('click', () => {
      quizSession.index++;
      quizSession.submitted = false;
      quizSession.warning = null;
      renderReview();
    });
  }

  $('#btnQuitDoubleQuiz').addEventListener('click', () => {
    quizSession = null;
    renderReview();
  });
}

function startDoubleQuiz(semesterId, week, forceRestart, verbeFilter) {
  const filtre = verbeFilter || 'tous';
  const vocabList = filtrerVocabParVerbe(getVocabForWeek(semesterId, week), filtre);
  const saved = forceRestart ? null : getValidDoubleInProgress(semesterId, week);
  if (saved) {
    quizSession = {
      mode: 'double', semesterId, week,
      queue: saved.queue,
      index: saved.index,
      submitted: false,
      lastAnswer: { lecture: '', sens: '' },
      lastResult: null,
      warning: null,
      hardcore: saved.hardcore,
      verbeFilter: saved.verbeFilter || 'tous',
      answers: saved.answers.slice(),
      totals: { ...saved.totals }
    };
    return;
  }
  clearDoubleInProgress(semesterId, week);
  const queue = shuffle(vocabList.map(v => v.id));
  quizSession = {
    mode: 'double', semesterId, week,
    queue,
    index: 0,
    submitted: false,
    lastAnswer: { lecture: '', sens: '' },
    lastResult: null,
    warning: null,
    hardcore: !!DB.settings.hardcoreMode,
    verbeFilter: filtre,
    answers: [],
    totals: { points: 0, maxPoints: queue.length * DB.settings.pointsPerWord, startedAt: Date.now() }
  };
}

// ---------- Mode "Vocabulaire pratique" (compteurs, couleurs, heure) ----------
// Contenu thematique nouveau (17/09/2026, demande de Paul), hors programme
// JLPT/Cursus -- pas de semestre/semaine, juste un theme. Meme direction
// que le mode Vocabulaire de base (mot affiche -> lecture attendue),
// notation via scoreAnswer(). Namespace a part (DB.scoresPratique /
// DB.inProgressPratique), jamais melange avec DB.scores. Pas d'appel a
// recordWordAttempt() ici : ce vocabulaire ne vit pas dans DB.vocab, le
// melanger aux stats par mot du programme creerait des entrees orphelines.
const PRATIQUE_THEMES = [
  { id: 'compteurs', label: 'Compteurs' },
  { id: 'couleurs', label: 'Couleurs' },
  { id: 'heure', label: 'Heure' }
];
const PRATIQUE_VOCAB = [{"id":"pr-compteurs-01","theme":"compteurs","mot":"一つ","lecture":"ひとつ","sens":"un (objet, generique)"},{"id":"pr-compteurs-02","theme":"compteurs","mot":"二つ","lecture":"ふたつ","sens":"deux (objets, generique)"},{"id":"pr-compteurs-03","theme":"compteurs","mot":"三つ","lecture":"みっつ","sens":"trois (objets, generique)"},{"id":"pr-compteurs-04","theme":"compteurs","mot":"四つ","lecture":"よっつ","sens":"quatre (objets, generique)"},{"id":"pr-compteurs-05","theme":"compteurs","mot":"五つ","lecture":"いつつ","sens":"cinq (objets, generique)"},{"id":"pr-compteurs-06","theme":"compteurs","mot":"六つ","lecture":"むっつ","sens":"six (objets, generique)"},{"id":"pr-compteurs-07","theme":"compteurs","mot":"七つ","lecture":"ななつ","sens":"sept (objets, generique)"},{"id":"pr-compteurs-08","theme":"compteurs","mot":"八つ","lecture":"やっつ","sens":"huit (objets, generique)"},{"id":"pr-compteurs-09","theme":"compteurs","mot":"九つ","lecture":"ここのつ","sens":"neuf (objets, generique)"},{"id":"pr-compteurs-10","theme":"compteurs","mot":"十","lecture":"とお","sens":"dix (objets, generique)"},{"id":"pr-compteurs-11","theme":"compteurs","mot":"一人","lecture":"ひとり","sens":"une personne"},{"id":"pr-compteurs-12","theme":"compteurs","mot":"二人","lecture":"ふたり","sens":"deux personnes"},{"id":"pr-compteurs-13","theme":"compteurs","mot":"三人","lecture":"さんにん","sens":"trois personnes"},{"id":"pr-compteurs-14","theme":"compteurs","mot":"四人","lecture":"よにん","sens":"quatre personnes"},{"id":"pr-compteurs-15","theme":"compteurs","mot":"五人","lecture":"ごにん","sens":"cinq personnes"},{"id":"pr-compteurs-16","theme":"compteurs","mot":"何人","lecture":"なんにん","sens":"combien de personnes"},{"id":"pr-compteurs-17","theme":"compteurs","mot":"一本","lecture":"いっぽん","sens":"un (objet long/cylindrique)"},{"id":"pr-compteurs-18","theme":"compteurs","mot":"二本","lecture":"にほん","sens":"deux (objets longs)"},{"id":"pr-compteurs-19","theme":"compteurs","mot":"三本","lecture":"さんぼん","sens":"trois (objets longs)"},{"id":"pr-compteurs-20","theme":"compteurs","mot":"一枚","lecture":"いちまい","sens":"un (objet plat/feuille)"},{"id":"pr-compteurs-21","theme":"compteurs","mot":"二枚","lecture":"にまい","sens":"deux (objets plats)"},{"id":"pr-compteurs-22","theme":"compteurs","mot":"三枚","lecture":"さんまい","sens":"trois (objets plats)"},{"id":"pr-compteurs-23","theme":"compteurs","mot":"一匹","lecture":"いっぴき","sens":"un (petit animal)"},{"id":"pr-compteurs-24","theme":"compteurs","mot":"二匹","lecture":"にひき","sens":"deux (petits animaux)"},{"id":"pr-compteurs-25","theme":"compteurs","mot":"三匹","lecture":"さんびき","sens":"trois (petits animaux)"},{"id":"pr-compteurs-26","theme":"compteurs","mot":"一冊","lecture":"いっさつ","sens":"un (livre/cahier)"},{"id":"pr-compteurs-27","theme":"compteurs","mot":"二冊","lecture":"にさつ","sens":"deux (livres/cahiers)"},{"id":"pr-compteurs-28","theme":"compteurs","mot":"一台","lecture":"いちだい","sens":"un (vehicule/machine)"},{"id":"pr-compteurs-29","theme":"compteurs","mot":"二台","lecture":"にだい","sens":"deux (vehicules/machines)"},{"id":"pr-compteurs-30","theme":"compteurs","mot":"一階","lecture":"いっかい","sens":"premier etage / rez-de-chaussee"},{"id":"pr-compteurs-31","theme":"compteurs","mot":"二階","lecture":"にかい","sens":"deuxieme etage"},{"id":"pr-compteurs-32","theme":"compteurs","mot":"三階","lecture":"さんがい","sens":"troisieme etage"},{"id":"pr-compteurs-33","theme":"compteurs","mot":"何階","lecture":"なんがい","sens":"quel etage"},{"id":"pr-compteurs-34","theme":"compteurs","mot":"一回","lecture":"いっかい","sens":"une fois"},{"id":"pr-compteurs-35","theme":"compteurs","mot":"二回","lecture":"にかい","sens":"deux fois"},{"id":"pr-compteurs-36","theme":"compteurs","mot":"何回","lecture":"なんかい","sens":"combien de fois"},{"id":"pr-compteurs-37","theme":"compteurs","mot":"一歳","lecture":"いっさい","sens":"un an (age)"},{"id":"pr-compteurs-38","theme":"compteurs","mot":"二十歳","lecture":"はたち","sens":"vingt ans"},{"id":"pr-compteurs-39","theme":"compteurs","mot":"何歳","lecture":"なんさい","sens":"quel age"},{"id":"pr-couleurs-01","theme":"couleurs","mot":"赤","lecture":"あか","sens":"rouge"},{"id":"pr-couleurs-02","theme":"couleurs","mot":"青","lecture":"あお","sens":"bleu"},{"id":"pr-couleurs-03","theme":"couleurs","mot":"黄色","lecture":"きいろ","sens":"jaune"},{"id":"pr-couleurs-04","theme":"couleurs","mot":"白","lecture":"しろ","sens":"blanc"},{"id":"pr-couleurs-05","theme":"couleurs","mot":"黒","lecture":"くろ","sens":"noir"},{"id":"pr-couleurs-06","theme":"couleurs","mot":"緑","lecture":"みどり","sens":"vert"},{"id":"pr-couleurs-07","theme":"couleurs","mot":"茶色","lecture":"ちゃいろ","sens":"marron"},{"id":"pr-couleurs-08","theme":"couleurs","mot":"紫","lecture":"むらさき","sens":"violet"},{"id":"pr-couleurs-09","theme":"couleurs","mot":"灰色","lecture":"はいいろ","sens":"gris"},{"id":"pr-couleurs-10","theme":"couleurs","mot":"オレンジ","lecture":"おれんじ","sens":"orange"},{"id":"pr-couleurs-11","theme":"couleurs","mot":"ピンク","lecture":"ぴんく","sens":"rose"},{"id":"pr-couleurs-12","theme":"couleurs","mot":"金色","lecture":"きんいろ","sens":"dore"},{"id":"pr-couleurs-13","theme":"couleurs","mot":"銀色","lecture":"ぎんいろ","sens":"argente"},{"id":"pr-couleurs-14","theme":"couleurs","mot":"赤い","lecture":"あかい","sens":"rouge (adjectif)"},{"id":"pr-couleurs-15","theme":"couleurs","mot":"青い","lecture":"あおい","sens":"bleu (adjectif)"},{"id":"pr-couleurs-16","theme":"couleurs","mot":"黄色い","lecture":"きいろい","sens":"jaune (adjectif)"},{"id":"pr-couleurs-17","theme":"couleurs","mot":"白い","lecture":"しろい","sens":"blanc (adjectif)"},{"id":"pr-couleurs-18","theme":"couleurs","mot":"黒い","lecture":"くろい","sens":"noir (adjectif)"},{"id":"pr-couleurs-19","theme":"couleurs","mot":"茶色い","lecture":"ちゃいろい","sens":"marron (adjectif)"},{"id":"pr-couleurs-20","theme":"couleurs","mot":"何色","lecture":"なにいろ","sens":"quelle couleur"},{"id":"pr-heure-01","theme":"heure","mot":"時","lecture":"じ","sens":"heure (compteur)"},{"id":"pr-heure-02","theme":"heure","mot":"一時","lecture":"いちじ","sens":"1 heure"},{"id":"pr-heure-03","theme":"heure","mot":"二時","lecture":"にじ","sens":"2 heures"},{"id":"pr-heure-04","theme":"heure","mot":"三時","lecture":"さんじ","sens":"3 heures"},{"id":"pr-heure-05","theme":"heure","mot":"四時","lecture":"よじ","sens":"4 heures"},{"id":"pr-heure-06","theme":"heure","mot":"五時","lecture":"ごじ","sens":"5 heures"},{"id":"pr-heure-07","theme":"heure","mot":"六時","lecture":"ろくじ","sens":"6 heures"},{"id":"pr-heure-08","theme":"heure","mot":"七時","lecture":"しちじ","sens":"7 heures"},{"id":"pr-heure-09","theme":"heure","mot":"八時","lecture":"はちじ","sens":"8 heures"},{"id":"pr-heure-10","theme":"heure","mot":"九時","lecture":"くじ","sens":"9 heures"},{"id":"pr-heure-11","theme":"heure","mot":"十時","lecture":"じゅうじ","sens":"10 heures"},{"id":"pr-heure-12","theme":"heure","mot":"十一時","lecture":"じゅういちじ","sens":"11 heures"},{"id":"pr-heure-13","theme":"heure","mot":"十二時","lecture":"じゅうにじ","sens":"12 heures"},{"id":"pr-heure-14","theme":"heure","mot":"何時","lecture":"なんじ","sens":"quelle heure"},{"id":"pr-heure-15","theme":"heure","mot":"分","lecture":"ふん","sens":"minute (compteur)"},{"id":"pr-heure-16","theme":"heure","mot":"一分","lecture":"いっぷん","sens":"1 minute"},{"id":"pr-heure-17","theme":"heure","mot":"二分","lecture":"にふん","sens":"2 minutes"},{"id":"pr-heure-18","theme":"heure","mot":"三分","lecture":"さんぷん","sens":"3 minutes"},{"id":"pr-heure-19","theme":"heure","mot":"五分","lecture":"ごふん","sens":"5 minutes"},{"id":"pr-heure-20","theme":"heure","mot":"十分","lecture":"じゅっぷん","sens":"10 minutes"},{"id":"pr-heure-21","theme":"heure","mot":"半","lecture":"はん","sens":"et demie"},{"id":"pr-heure-22","theme":"heure","mot":"午前","lecture":"ごぜん","sens":"matin (avant midi, AM)"},{"id":"pr-heure-23","theme":"heure","mot":"午後","lecture":"ごご","sens":"apres-midi (apres midi, PM)"},{"id":"pr-heure-24","theme":"heure","mot":"朝","lecture":"あさ","sens":"matin"},{"id":"pr-heure-25","theme":"heure","mot":"昼","lecture":"ひる","sens":"midi / journee"},{"id":"pr-heure-26","theme":"heure","mot":"夜","lecture":"よる","sens":"soir / nuit"},{"id":"pr-heure-27","theme":"heure","mot":"今","lecture":"いま","sens":"maintenant"}];

function getPratiqueList(theme) {
  return PRATIQUE_VOCAB.filter(v => v.theme === theme);
}
function buildPratiqueQueue(theme) {
  return getPratiqueList(theme).map(v => v.id);
}
function getPratiqueScoreEntry(theme) {
  return (DB.scoresPratique && DB.scoresPratique[theme]) || null;
}
function recordPratiqueSessionResult(theme, points, maxPoints, pct, dureeMs) {
  if (!DB.scoresPratique) DB.scoresPratique = {};
  if (!DB.scoresPratique[theme]) DB.scoresPratique[theme] = { best: null, history: [] };
  const entry = DB.scoresPratique[theme];
  const record = { date: new Date().toISOString(), points, maxPoints, pct, dureeMs };
  entry.history.push(record);
  if (!entry.best || pct > entry.best.pct) entry.best = record;
}
function getValidPratiqueInProgress(theme) {
  if (!DB.inProgressPratique) return null;
  const saved = DB.inProgressPratique[theme];
  if (!saved || !Array.isArray(saved.queue) || !Array.isArray(saved.answers)) return null;
  const currentIds = new Set(getPratiqueList(theme).map(v => v.id));
  const stillValid = saved.queue.length === currentIds.size && saved.queue.every(id => currentIds.has(id));
  if (!stillValid || saved.index >= saved.queue.length) return null;
  return saved;
}
function savePratiqueInProgress() {
  if (!quizSession || quizSession.mode !== 'pratique') return;
  if (!DB.inProgressPratique) DB.inProgressPratique = {};
  DB.inProgressPratique[quizSession.theme] = {
    queue: quizSession.queue,
    index: quizSession.answers.length,
    totals: { ...quizSession.totals },
    hardcore: quizSession.hardcore,
    answers: quizSession.answers.slice(),
    updatedAt: new Date().toISOString()
  };
  persist();
}
function clearPratiqueInProgress(theme) {
  if (DB.inProgressPratique) delete DB.inProgressPratique[theme];
}

function renderPratiqueQuizView(container) {
  if (quizSession.index >= quizSession.queue.length) {
    const { points, maxPoints, startedAt } = quizSession.totals;
    const dureeMs = Number.isFinite(startedAt) ? Date.now() - startedAt : null;
    const pct = maxPoints > 0
      // Bug #19 (22/09/2026) : un score presque parfait (ex. 569/570)
      // arrondissait a 100%, ce qui donnait un faux sentiment de sans-faute.
      // 100% est reserve au score reellement parfait ; sinon on plafonne a 99%
      // meme si l'''arrondi mathematique donnerait 100.
      ? (points >= maxPoints ? 100 : Math.min(99, Math.round((points / maxPoints) * 100)))
      : 0;
    const prevEntry = getPratiqueScoreEntry(quizSession.theme);
    const prevBest = prevEntry ? prevEntry.best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    recordPratiqueSessionResult(quizSession.theme, points, maxPoints, pct, dureeMs);
    clearPratiqueInProgress(quizSession.theme);
    persist();
    if (typeof kvtSnapshotHistorique === 'function') kvtSnapshotHistorique();
    const themeLabel = (PRATIQUE_THEMES.find(t => t.id === quizSession.theme) || {}).label || '';
    const etat = pct >= 100 ? 'perfect' : (pct >= 70 ? 'good' : 'low');
    const badge = improved
      ? `<div class="kvt-result__badge">Record -- nouveau meilleur score</div>`
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${prevBest}&nbsp;%</div>` : '');
    container.innerHTML = `
      <h2>Vocabulaire pratique -- ${escapeHtml(themeLabel)}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${badge}
        <div class="kvt-result__pct">${pct}&nbsp;%</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <button class="kvt-result__btn" type="button" id="btnBackPratiqueReview">Retour</button>
      </div>
    `;
    $('#btnBackPratiqueReview').addEventListener('click', () => {
      quizSession = null;
      renderReview();
    });
    return;
  }

  const v = PRATIQUE_VOCAB.find(x => x.id === quizSession.queue[quizSession.index]);
  const progressPct = Math.round((quizSession.index / quizSession.queue.length) * 100);
  const themeLabel = (PRATIQUE_THEMES.find(t => t.id === quizSession.theme) || {}).label || '';

  container.innerHTML = `
    <h2>Vocabulaire pratique -- ${escapeHtml(themeLabel)}</h2>
    <div class="flashcard-wrap">
      <div class="session-progress">
        <div style="font-size:12px; color:var(--muted);">${quizSession.index + 1} / ${quizSession.queue.length}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      </div>
      <div class="flashcard">
        <div class="front-word">${escapeHtml(v.mot)}</div>
        ${!quizSession.submitted ? `
          ${quizSession.warning ? `<div class="quiz-feedback bad" style="margin-top:12px;">${escapeHtml(quizSession.warning)}</div>` : ''}
          <div class="answer-input-wrap">
            <input id="answerInputPratique" type="text" placeholder="Ecris la lecture en hiragana/katakana" style="margin-top:16px; width:280px; text-align:center; font-size:18px;"/>
          </div>
        ` : quizSession.hardcore ? `
          <div class="quiz-feedback mid" style="margin-top:16px;">
            Reponse enregistree. Correction disponible a la fin de la session.
          </div>
        ` : `
          <div class="back-reading">${escapeHtml(v.lecture)}${registreBadge(v)}</div>
          ${v.sens ? `<div class="back-meaning">${escapeHtml(v.sens)}</div>` : ''}
          <div class="quiz-feedback ${quizSession.lastResult.pct >= 0.99 ? 'good' : (quizSession.lastResult.pct >= 0.6 ? 'mid' : 'bad')}">
            Ta reponse : "${escapeHtml(quizSession.lastAnswer) || '(vide)'}" -- ${quizSession.lastResult.points}/${DB.settings.pointsPerWord} points (${Math.round(quizSession.lastResult.pct * 100)}% de similarite)
          </div>
        `}
      </div>
      ${!quizSession.submitted ? `
        <button class="primary" id="btnSubmitPratique" style="margin-top:18px;">Valider</button>
      ` : `
        <button class="primary" id="btnNextPratique" style="margin-top:18px;">Mot suivant</button>
      `}
      <button class="secondary" id="btnQuitPratiqueQuiz" style="margin-top:12px;">Quitter la session</button>
    </div>
  `;

  if (!quizSession.submitted) {
    const input = $('#answerInputPratique');
    input.focus();
    activerSaisieKanaDirecte(input, false);
    const submit = () => {
      const val = input.value;
      if (containsKanji(val)) {
        quizSession.warning = 'Ta reponse contient du kanji -- la lecture doit etre en hiragana/katakana uniquement. Retape-la.';
        renderReview();
        return;
      }
      quizSession.warning = null;
      const result = scoreAnswer(val, v.lecture);
      quizSession.submitted = true;
      quizSession.lastAnswer = val;
      quizSession.lastResult = result;
      quizSession.totals.points += result.points;
      quizSession.answers.push({ mot: v.mot, lecture: v.lecture, sens: v.sens, userAnswer: val, points: result.points, pct: result.pct });
      if (typeof gagnerXp === 'function') gagnerXp(result.points, null);
      if (typeof gagnerPieces === 'function') gagnerPieces(result.points, null);
      if (typeof mettreAJourStreak === 'function') mettreAJourStreak();
      savePratiqueInProgress();
      renderReview();
    };
    $('#btnSubmitPratique').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.isComposing || e.keyCode === 229) return;
      submit();
    });
  } else {
    const nextBtn = $('#btnNextPratique');
    setTimeout(() => nextBtn.focus(), 0);
    nextBtn.addEventListener('click', () => {
      quizSession.index++;
      quizSession.submitted = false;
      quizSession.warning = null;
      renderReview();
    });
  }

  $('#btnQuitPratiqueQuiz').addEventListener('click', () => {
    quizSession = null;
    renderReview();
  });
}

function startPratiqueQuiz(theme, forceRestart) {
  const saved = forceRestart ? null : getValidPratiqueInProgress(theme);
  if (saved) {
    quizSession = {
      mode: 'pratique', theme,
      queue: saved.queue,
      index: saved.index,
      submitted: false,
      lastAnswer: '',
      lastResult: null,
      warning: null,
      hardcore: saved.hardcore,
      answers: saved.answers.slice(),
      totals: { ...saved.totals }
    };
    return;
  }
  clearPratiqueInProgress(theme);
  const queue = shuffle(buildPratiqueQueue(theme));
  quizSession = {
    mode: 'pratique', theme,
    queue,
    index: 0,
    submitted: false,
    lastAnswer: '',
    lastResult: null,
    warning: null,
    hardcore: !!DB.settings.hardcoreMode,
    answers: [],
    totals: { points: 0, maxPoints: queue.length * DB.settings.pointsPerWord, startedAt: Date.now() }
  };
}

function renderReview() {
  const container = $('#view-review');
  // Mode "Kanji seul" : vue entièrement séparée (renderKanjiQuizView), pour
  // ne jamais toucher aux branches existantes du quiz vocabulaire ci-dessous.
  if (quizSession && quizSession.mode === 'kanji') {
    renderKanjiQuizView(container);
    return;
  }
  if (quizSession && quizSession.mode === 'kana') {
    renderKanaQuizView(container);
    return;
  }
  // Les 3 nouveaux modes (17/09/2026) suivent le meme principe : vue
  // dediee, jamais melangee aux branches vocab/kanji/kana ci-dessus.
  if (quizSession && quizSession.mode === 'ecriture') {
    renderEcritureQuizView(container);
    return;
  }
  if (quizSession && quizSession.mode === 'traduction') {
    renderTraductionQuizView(container);
    return;
  }
  if (quizSession && quizSession.mode === 'double') {
    renderDoubleQuizView(container);
    return;
  }
  if (quizSession && quizSession.mode === 'pratique') {
    renderPratiqueQuizView(container);
    return;
  }

  if (!quizSession) {
    const modeSelectHtml = `
      <select id="quizModePicker">
        <option value="vocab" ${reviewPickerMode === 'vocab' ? 'selected' : ''}>Vocabulaire</option>
        <option value="kanji" ${reviewPickerMode === 'kanji' ? 'selected' : ''}>Kanji seul (onyomi/kunyomi)</option>
        <option value="kana" ${reviewPickerMode === 'kana' ? 'selected' : ''}>Hiragana / Katakana (romaji)</option>
        <option value="ecriture" ${reviewPickerMode === 'ecriture' ? 'selected' : ''}>Ecriture (kana -> kanji sur papier)</option>
        <option value="traduction" ${reviewPickerMode === 'traduction' ? 'selected' : ''}>Traduction (francais -> japonais)</option>
        <option value="double" ${reviewPickerMode === 'double' ? 'selected' : ''}>Double reponse (lecture + sens ensemble)</option>
        <option value="pratique" ${reviewPickerMode === 'pratique' ? 'selected' : ''}>Vocabulaire pratique (compteurs, couleurs, heure)</option>
      </select>
    `;
    // Menu de choix des exercices (09/09/2026) : la difficulté vit dans les
    // mêmes réglages globaux que la carte "Mode de révision" de Réglages
    // (hardcoreMode/spectralMode) — un seul état, juste choisi à deux
    // endroits pour plus de commodité. Facile = mode spectral (indice
    // possible), Difficile = mode hardcore (correction en fin de session
    // seulement), Normal = aucun des deux.
    const difficulteActuelle = DB.settings.hardcoreMode ? 'difficile' : (DB.settings.spectralMode ? 'facile' : 'normal');
    const difficulteSelectHtml = `
      <select id="difficultePicker">
        <option value="facile" ${difficulteActuelle === 'facile' ? 'selected' : ''}>Facile (indice possible)</option>
        <option value="normal" ${difficulteActuelle === 'normal' ? 'selected' : ''}>Normal</option>
        <option value="difficile" ${difficulteActuelle === 'difficile' ? 'selected' : ''}>Difficile (correction en fin de session)</option>
      </select>
    `;
    const brancherDifficultePicker = () => {
      $('#difficultePicker').addEventListener('change', (e) => {
        const val = e.target.value;
        DB.settings.hardcoreMode = val === 'difficile';
        DB.settings.spectralMode = val === 'facile';
        persist();
        showToast('Difficulté : ' + (val === 'facile' ? 'Facile' : val === 'difficile' ? 'Difficile' : 'Normal'));
        renderReview();
      });
    };

    // Mode "Kana" : pas de semestre/semaine (à part des JLPT/cursus comme
    // demandé), juste un type (hiragana/katakana) et un groupe de lecture.
    if (reviewPickerMode === 'kana') {
      if (!reviewKanaType) reviewKanaType = 'hiragana';
      const groupOpts = KANA_GROUPS.map(g => {
        const count = buildKanaQueue(reviewKanaType, g.id).length;
        return `<option value="${g.id}">${escapeHtml(g.label)} (${count})</option>`;
      }).join('');
      container.innerHTML = `
        <h2>Réviser</h2>
        <div class="card">
          <div class="form-row">${modeSelectHtml}${difficulteSelectHtml}</div>
          <div class="form-row">
            <select id="kanaTypePicker">
              <option value="hiragana" ${reviewKanaType === 'hiragana' ? 'selected' : ''}>Hiragana</option>
              <option value="katakana" ${reviewKanaType === 'katakana' ? 'selected' : ''}>Katakana</option>
            </select>
            <select id="kanaGroupPicker">${groupOpts}</select>
            <button class="primary" id="btnStartQuiz">Démarrer</button>
          </div>
        </div>
      `;
      $('#quizModePicker').addEventListener('change', (e) => {
        reviewPickerMode = e.target.value;
        renderReview();
      });
      brancherDifficultePicker();
      $('#kanaTypePicker').addEventListener('change', (e) => {
        reviewKanaType = e.target.value;
        renderReview();
      });
      $('#btnStartQuiz').addEventListener('click', () => {
        const groupId = $('#kanaGroupPicker').value;
        if (!groupId) return;
        startKanaQuiz(reviewKanaType, groupId);
        renderReview();
      });
      return;
    }

    // Mode "Vocabulaire pratique" (17/09/2026) : pas de semestre/semaine,
    // juste un theme (compteurs/couleurs/heure) -- meme emplacement/esprit
    // que la branche kana ci-dessus.
    if (reviewPickerMode === 'pratique') {
      const themeOpts = PRATIQUE_THEMES.map(t => {
        const count = getPratiqueList(t.id).length;
        return `<option value="${t.id}">${escapeHtml(t.label)} (${count})</option>`;
      }).join('');
      container.innerHTML = `
        <h2>Réviser</h2>
        <div class="card">
          <div class="form-row">${modeSelectHtml}${difficulteSelectHtml}</div>
          <div class="form-row">
            <select id="pratiqueThemePicker">${themeOpts}</select>
            <button class="primary" id="btnStartQuiz">Démarrer</button>
          </div>
        </div>
      `;
      $('#quizModePicker').addEventListener('change', (e) => {
        reviewPickerMode = e.target.value;
        renderReview();
      });
      brancherDifficultePicker();
      $('#btnStartQuiz').addEventListener('click', () => {
        const theme = $('#pratiqueThemePicker').value;
        if (!theme) return;
        startPratiqueQuiz(theme);
        renderReview();
      });
      return;
    }

    // Filtre "Mots" (09/09/2026, remplacé par 2 cases à cocher suite au
    // retour de Paul) : uniquement pertinent pour les modes basés sur le
    // vocabulaire du programme (vocab/écriture/traduction) -- le mode
    // kanji seul travaille sur des lectures, pas des mots ; le mode kana
    // n'a pas de notion de kanji groupés ; le mode pratique a sa propre
    // branche ci-dessus. Les deux cases sont cochées par défaut (= tous
    // les mots) ; décocher l'une exclut sa catégorie.
    const filtreGroupeCoche = reviewVerbeFilter === 'tous' || reviewVerbeFilter === 'kanji_groupe';
    const filtreSimpleCoche = reviewVerbeFilter === 'tous' || reviewVerbeFilter === 'simple';
    const motsSelectHtml = ['vocab', 'ecriture', 'traduction', 'double'].includes(reviewPickerMode) ? `
      <div class="filtre-mots">
        <label><input type="checkbox" id="chkMotsGroupe" ${filtreGroupeCoche ? 'checked' : ''}> Mots à kanji groupés</label>
        <label><input type="checkbox" id="chkMotsSimple" ${filtreSimpleCoche ? 'checked' : ''}> Mots simples</label>
        <div class="filtre-mots-desc" style="font-size:12px; color:var(--muted);">
          Groupés = plusieurs kanji collés sans hiragana (問題, 子供). Simples = verbe (泳ぐ), kanji seul (半) ou adjectif en -i (高い).
        </div>
      </div>
    ` : '';

    // Grille de semaines (22/09/2026) pour Ecriture/Traduction : demande de
    // Paul, memes cartes cliquables que Cursus/JLPT (score visible dessus)
    // plutot que le menu deroulant "semestre - semaine (n mots)" + bouton
    // Demarrer, garde tel quel pour Vocabulaire/Kanji seul. Classes CSS
    // dediees .review-week-card / .review-week-restart-btn (voir style.css) :
    // jamais .week-card / .week-restart-btn ici, ces classes-la sont
    // reliees par document.querySelectorAll(...) a la fin de
    // renderDashboard(), qui tourne sur TOUT le document -- les reutiliser
    // accrocherait la logique de la modale du Tableau de bord sur ces
    // cartes des qu'on rouvre ensuite le Tableau de bord.
    const grilleSemaines = ['ecriture', 'traduction', 'double'].includes(reviewPickerMode);

    let semainesHtml;
    if (!grilleSemaines) {
      const opts = [];
      DB.settings.semesters.forEach(sem => {
        for (let w = 1; w <= sem.weeks; w++) {
          const count = reviewPickerMode === 'kanji'
            ? buildKanjiQueue(sem.id, w).length
            : filtrerVocabParVerbe(getVocabForWeek(sem.id, w), reviewVerbeFilter).length;
          const label = reviewPickerMode === 'kanji' ? `${count} lecture(s)` : `${count} mots`;
          opts.push(`<option value="${sem.id}|${w}" ${count === 0 ? 'disabled' : ''}>${sem.label} — Semaine ${w} (${label})</option>`);
        }
      });
      semainesHtml = `
        <div class="form-row">
          <select id="quizWeekPicker">${opts.join('')}</select>
          <button class="primary" id="btnStartQuiz">Démarrer</button>
        </div>
      `;
    } else {
      semainesHtml = '';
      DB.settings.semesters.forEach(sem => {
        const unitPrefix = sem.id.startsWith('jlpt') ? 'C' : 'S';
        let cartesHtml = '';
        for (let w = 1; w <= sem.weeks; w++) {
          const count = filtrerVocabParVerbe(getVocabForWeek(sem.id, w), reviewVerbeFilter).length;
          if (reviewPickerMode === 'traduction' || reviewPickerMode === 'double') {
            const entry = reviewPickerMode === 'double' ? getDoubleScoreEntry(sem.id, w) : getTraductionScoreEntry(sem.id, w);
            const saved = reviewPickerMode === 'double' ? getValidDoubleInProgress(sem.id, w) : getValidTraductionInProgress(sem.id, w);
            const typeTagScore = entry && entry.best.verbeFilter
              ? `<span class="week-type-tag">${escapeHtml(libelleFiltreMots(entry.best.verbeFilter))}</span>` : '';
            const typeTagProgress = saved
              ? `<span class="week-type-tag">${escapeHtml(libelleFiltreMots(saved.verbeFilter))}</span>` : '';
            cartesHtml += `
              <div class="review-week-card ${count === 0 ? 'empty' : ''}" data-sem="${sem.id}" data-week="${w}">
                <div class="week-num">${unitPrefix}${w}</div>
                <div class="week-meta">${count} mots</div>
                ${entry ? `<div class="week-score">${entry.best.points}/${entry.best.maxPoints} pts <span class="week-score-pct">(${entry.best.pct}%)</span> ${typeTagScore}</div>` : '<div class="week-score muted">—</div>'}
                ${saved ? `
                  <div class="week-progress-bar"><div class="week-progress-fill" style="width:${Math.round((saved.index / saved.queue.length) * 100)}%"></div></div>
                  <div class="week-progress-label">
                    ${saved.index}/${saved.queue.length} mots · ${saved.totals.points} pts gagnés ${typeTagProgress}
                    <button class="review-week-restart-btn" data-sem="${sem.id}" data-week="${w}" title="Recommencer cette semaine">↺ Recommencer</button>
                  </div>
                ` : ''}
              </div>
            `;
          } else {
            // Ecriture : stateless par choix explicite de Paul (pas de
            // notation automatique) -- jamais de score/progression a
            // afficher, pour ne pas laisser croire qu'un suivi existe alors
            // qu'aucune tentative n'est jamais enregistree.
            cartesHtml += `
              <div class="review-week-card ${count === 0 ? 'empty' : ''}" data-sem="${sem.id}" data-week="${w}">
                <div class="week-num">${unitPrefix}${w}</div>
                <div class="week-meta">${count} mots</div>
                <div class="week-score muted">Entraînement libre, sans note</div>
              </div>
            `;
          }
        }
        semainesHtml += `<div class="card"><h3>${escapeHtml(sem.label)}</h3><div class="week-grid">${cartesHtml}</div></div>`;
      });
    }

    container.innerHTML = `
      <h2>Réviser</h2>
      <div class="card">
        <div class="form-row">${modeSelectHtml}${difficulteSelectHtml}</div>
        ${motsSelectHtml ? `<div class="form-row">${motsSelectHtml}</div>` : ''}
        ${!grilleSemaines ? semainesHtml : ''}
      </div>
      ${grilleSemaines ? semainesHtml : ''}
    `;
    $('#quizModePicker').addEventListener('change', (e) => {
      reviewPickerMode = e.target.value;
      renderReview();
    });
    brancherDifficultePicker();
    if (['vocab', 'ecriture', 'traduction', 'double'].includes(reviewPickerMode)) {
      const recalculerFiltreMots = () => {
        const groupeCoche = $('#chkMotsGroupe').checked;
        const simpleCoche = $('#chkMotsSimple').checked;
        if (groupeCoche && simpleCoche) reviewVerbeFilter = 'tous';
        else if (groupeCoche) reviewVerbeFilter = 'kanji_groupe';
        else if (simpleCoche) reviewVerbeFilter = 'simple';
        else reviewVerbeFilter = 'aucun';
        renderReview();
      };
      $('#chkMotsGroupe').addEventListener('change', recalculerFiltreMots);
      $('#chkMotsSimple').addEventListener('change', recalculerFiltreMots);
    }
    if (!grilleSemaines) {
      $('#btnStartQuiz').addEventListener('click', () => {
        const val = $('#quizWeekPicker').value;
        if (!val) return;
        const [sem, w] = val.split('|');
        if (reviewPickerMode === 'kanji') startKanjiQuiz(sem, parseInt(w, 10));
        else startQuiz(sem, parseInt(w, 10), false, reviewVerbeFilter);
        renderReview();
      });
    } else {
      $$('.review-week-restart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const sem = btn.dataset.sem, w = parseInt(btn.dataset.week, 10);
          if (reviewPickerMode === 'double') startDoubleQuiz(sem, w, true, reviewVerbeFilter);
          else startTraductionQuiz(sem, w, true, reviewVerbeFilter);
          renderReview();
        });
      });
      $$('.review-week-card').forEach(el => {
        el.addEventListener('click', () => {
          const sem = el.dataset.sem, w = parseInt(el.dataset.week, 10);
          const count = filtrerVocabParVerbe(getVocabForWeek(sem, w), reviewVerbeFilter).length;
          if (count === 0) { showToast('Aucun mot pour cette semaine avec ce filtre.'); return; }
          if (reviewPickerMode === 'ecriture') startEcritureQuiz(sem, w, reviewVerbeFilter);
          else if (reviewPickerMode === 'double') startDoubleQuiz(sem, w, false, reviewVerbeFilter);
          else startTraductionQuiz(sem, w, false, reviewVerbeFilter);
          renderReview();
        });
      });
    }
    return;
  }

  // Session terminée
  if (quizSession.index >= quizSession.queue.length) {
    const { points, maxPoints, startedAt } = quizSession.totals;
    const dureeMs = Number.isFinite(startedAt) ? Date.now() - startedAt : null;
    const pct = maxPoints > 0
      // Bug #19 (22/09/2026) : un score presque parfait (ex. 569/570)
      // arrondissait a 100%, ce qui donnait un faux sentiment de sans-faute.
      // 100% est reserve au score reellement parfait ; sinon on plafonne a 99%
      // meme si l'''arrondi mathematique donnerait 100.
      ? (points >= maxPoints ? 100 : Math.min(99, Math.round((points / maxPoints) * 100)))
      : 0;
    const key = weekKey(quizSession.semesterId, quizSession.week);
    const prevBest = DB.scores[key] ? DB.scores[key].best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    recordSessionResult(quizSession.semesterId, quizSession.week, points, maxPoints, pct, quizSession.verbeFilter, dureeMs);
    // Gamification : bonus de pièces si la session est réussie (>= 80%).
    if (typeof bonusFinSession === 'function') bonusFinSession(pct, quizSession.semesterId);
    // Le palier qui compte vraiment : quelqu'un a fait un quiz en entier.
    // Une visite qui va jusque-la n'est plus un passage, c'est un essai.
    if (window.kvtMesure) window.kvtMesure.noter('quiz_fini');
    clearInProgress(quizSession.semesterId, quizSession.week);
    persist();
    // Pousse le meilleur score de cette semaine vers le classement de classe
    // (si un compte est connecté) — le leaderboard reflète toujours le
    // record personnel, pas chaque tentative individuelle. mode 'vocab' +
    // duree/essais (rang 5, #16) : voir account.js kvtPushScore().
    if (typeof window.kvtPushScore === 'function') {
      const bestEntry = DB.scores[key].best;
      window.kvtPushScore(quizSession.semesterId, quizSession.week, bestEntry.points, bestEntry.maxPoints, bestEntry.pct, 'vocab', bestEntry.dureeMs, DB.scores[key].history.length);
    }    // Synchronise aussi l'instantane du graphique hexagonal (deplace vers
    // le Profil public, demande de Paul le 23/09/2026) : ce mode vient de
    // faire bouger au moins un des 6 axes, autant le repousser tout de
    // suite plutot que d'attendre une visite sur son propre profil.
    if (typeof window.kvtPushHexagoneStats === 'function' && typeof getHexagoneStats === 'function') {
      window.kvtPushHexagoneStats(getHexagoneStats());
    }
    // Sauvegarde automatique horodatée (30/08/2026, voir account.js) : une
    // fin de session est un bon moment naturel pour ça (résultat qui compte
    // vraiment), l'appel lui-même est throttlé en interne (~1x/jour) donc
    // pas de souci à l'appeler ici à chaque session terminée.
    if (typeof kvtSnapshotHistorique === 'function') kvtSnapshotHistorique();
    const semLabel = getSemester(quizSession.semesterId).label;
    const recap = quizSession.hardcore ? `
      <div class="card">
        <h3>Correction complète</h3>
        <table>
          <thead><tr><th>Mot</th><th>Lecture attendue</th><th>Sens</th><th>Ta réponse</th><th>Points</th></tr></thead>
          <tbody>${quizSession.answers.map(a => `
            <tr>
              <td class="kj">${escapeHtml(a.mot)}</td>
              <td>${escapeHtml(a.lecture)}</td>
              <td>${escapeHtml(a.sens)}</td>
              <td>${escapeHtml(a.userAnswer) || '(vide)'}</td>
              <td>${a.points}/${DB.settings.pointsPerWord}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    ` : '';
    // Trois intensités d'écran de résultat. Le seuil est ici, et pas dans le
    // CSS, pour rester ajustable sans toucher au style : le barème est sévère
    // (distance de Levenshtein — une erreur de kana coûte cher), donc le
    // niveau "encouragement" doit se déclencher assez bas pour ne pas
    // sanctionner une session honnête.
    const SEUIL_BON_SCORE = 70;
    const etat = pct >= 100 ? 'perfect' : (pct >= SEUIL_BON_SCORE ? 'good' : 'low');
    const textes = {
      perfect: { titre: 'Parfait.', sub: 'Chaque lecture, juste. Une révision impeccable.' },
      good:    { titre: 'Bon travail.', sub: 'La plupart des lectures maîtrisées. Encore quelques-unes à consolider.' },
      low:     { titre: "Continue à t'entraîner.", sub: "C'est en révisant régulièrement qu'on progresse. Reviens quand tu veux." }
    }[etat];

    // L'éclat n'apparaît qu'au score parfait : c'est ce qui en fait un moment
    // rare. L'afficher plus souvent le banaliserait.
    const burst = etat === 'perfect' ? `
      <div class="kvt-result__burst" aria-hidden="true">
        ${'<div class="kvt-ring"></div>'.repeat(3)}
        ${'<div class="kvt-ray"><div class="kvt-ray__bar"></div></div>'.repeat(10)}
      </div>` : '';

    const badge = improved
      ? `<div class="kvt-result__badge">Record — nouveau meilleur score</div>`
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${prevBest}&nbsp;%</div>` : '');

    container.innerHTML = `
      <h2>Session terminée — ${escapeHtml(semLabel)} Semaine ${quizSession.week}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${burst}
        ${badge}
        <div class="kvt-result__pct">${pct}&nbsp;%</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <div class="kvt-result__title">${textes.titre}</div>
        <div class="kvt-result__sub">${textes.sub}</div>
        <button class="kvt-result__btn" type="button" id="btnBackReview">Retour</button>
      </div>
      ${recap}
    `;
    $('#btnBackReview').addEventListener('click', () => {
      quizSession = null;
      renderReview();
    });
    return;
  }

  const vocabId = quizSession.queue[quizSession.index];
  const v = DB.vocab.find(x => x.id === vocabId);
  const g = getKanjiGroup(v.kanjiGroupId);
  const progressPct = Math.round((quizSession.index / quizSession.queue.length) * 100);

  container.innerHTML = `
    <h2>Réviser — ${getSemester(quizSession.semesterId).label} Semaine ${quizSession.week}</h2>
    ${typeof collationHtml === 'function' ? collationHtml() : ''}
    <div class="flashcard-wrap">
      <div class="session-progress">
        <div style="font-size:12px; color:var(--muted);">${quizSession.index + 1} / ${quizSession.queue.length}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      </div>
      <div class="flashcard">
        <div class="front-word">${escapeHtml(v.mot)}</div>
        ${/* Indice (kanji du groupe + titre) : reserve au mode Facile
           (tache #7, demande de Paul le 14/09/2026 -- "RETIRER les
           indices en mode normal"). Avant ce correctif il s'affichait
           des que hardcore etait desactive, donc aussi en mode Normal ;
           ne dependait pas de DB.settings.spectralMode. Le mode Hardcore
           reste sans indice comme avant (!quizSession.hardcore). */ ''}
        ${!quizSession.hardcore && DB.settings.spectralMode ? `<div class="hint">${g ? escapeHtml(g.kanji) + (g.titre ? ' · ' + escapeHtml(g.titre) : '') : ''}</div>` : ''}
        ${!quizSession.submitted ? `
          ${quizSession.warning ? `<div class="quiz-feedback bad" style="margin-top:12px;">${escapeHtml(quizSession.warning)}</div>` : ''}
          <div class="answer-input-wrap">
            <input id="answerInput" type="text" placeholder="Écris la lecture en hiragana/katakana" style="margin-top:16px; width:280px; text-align:center; font-size:18px;"/>
            ${!quizSession.hardcore && DB.settings.spectralMode ? `
              <div id="spectralOverlay" class="spectral-overlay">${escapeHtml(v.lecture)}</div>
              <button type="button" id="btnSpectralEye" class="spectral-eye" title="Maintenir pour voir la réponse — ce mot ne rapportera aucun point" aria-label="Maintenir pour voir la réponse — ce mot ne rapportera aucun point">👁</button>
            ` : ''}
          </div>
        ` : quizSession.hardcore ? `
          <div class="quiz-feedback mid" style="margin-top:16px;">
            Réponse enregistrée. Correction disponible à la fin de la session.
          </div>
        ` : quizSession.usedSpectral ? `
          <div class="back-reading">${escapeHtml(v.lecture)}${registreBadge(v)}</div>
          ${v.sens ? `<div class="back-meaning">${escapeHtml(v.sens)}</div>` : ''}
          <div class="quiz-feedback bad">
            Mode spectral utilisé — 0/${DB.settings.pointsPerWord} points, cette réponse ne compte pas.
          </div>
        ` : `
          <div class="back-reading">${escapeHtml(v.lecture)}${registreBadge(v)}</div>
          ${v.sens ? `<div class="back-meaning">${escapeHtml(v.sens)}</div>` : ''}
          <div class="quiz-feedback ${quizSession.lastResult.pct >= 0.99 ? 'good' : (quizSession.lastResult.pct >= 0.6 ? 'mid' : 'bad')}">
            Ta réponse : "${escapeHtml(quizSession.lastAnswer) || '(vide)'}" — ${quizSession.lastResult.points}/${DB.settings.pointsPerWord} points (${Math.round(quizSession.lastResult.pct * 100)}% de similarité)
          </div>
        `}
      </div>
      ${!quizSession.submitted ? `
        <button class="primary" id="btnSubmitAnswer" style="margin-top:18px;">Valider</button>
      ` : `
        <button class="primary" id="btnNextWord" style="margin-top:18px;">Mot suivant</button>
      `}
      <button class="secondary" id="btnQuitQuiz" style="margin-top:12px;">Quitter la session</button>
    </div>
  `;

  if (!quizSession.submitted) {
    const input = $('#answerInput');
    input.focus();
    activerSaisieKanaDirecte(input, false);
    const eyeBtn = $('#btnSpectralEye');
    if (eyeBtn) {
      const overlay = $('#spectralOverlay');
      const showGhost = () => {
        quizSession.usedSpectral = true; // se souvient qu'on a triché sur ce mot -> 0 point à la validation
        if (overlay) overlay.style.opacity = '1';
      };
      const hideGhost = () => { if (overlay) overlay.style.opacity = '0'; };
      eyeBtn.addEventListener('mousedown', showGhost);
      eyeBtn.addEventListener('touchstart', (e) => { e.preventDefault(); showGhost(); });
      eyeBtn.addEventListener('mouseup', hideGhost);
      eyeBtn.addEventListener('mouseleave', hideGhost);
      eyeBtn.addEventListener('touchend', hideGhost);
    }
    const submit = async () => {
      const val = input.value;
      if (containsKanji(val)) {
        // Le clavier japonais a converti la saisie en kanji au lieu de la
        // laisser en kana (touche Espace/Tab pressée par réflexe, ou
        // conversion prédictive) : on ne score pas, on laisse retaper.
        quizSession.warning = 'Ta réponse contient du kanji — la lecture doit être en hiragana/katakana uniquement (le clavier a dû convertir tout seul). Retape-la.';
        renderReview();
        return;
      }
      quizSession.warning = null;
      const result = scoreAnswer(val, v.lecture);
      if (quizSession.usedSpectral) {
        // Le calque fantôme (mode spectral) a été utilisé sur ce mot : on
        // garde le % de similarité pour info mais on annule les points.
        result.points = 0;
      }
      quizSession.submitted = true;
      quizSession.lastAnswer = val;
      quizSession.lastResult = result;
      quizSession.totals.points += result.points;
      quizSession.answers.push({
        mot: v.mot, lecture: v.lecture, sens: v.sens,
        userAnswer: val, points: result.points, pct: result.pct, spectral: quizSession.usedSpectral
      });
      recordWordAttempt(v.id, result.pct);
      // Gamification (24/08/2026) : XP/pièces à chaque mot, série quotidienne
      // au premier mot de la journée. N'a aucun effet sur le score du quiz
      // lui-même (result.points), qui reste la seule chose comparée dans le
      // classement.
      if (typeof gagnerXp === 'function') gagnerXp(result.points, quizSession.semesterId);
      if (typeof gagnerPieces === 'function') gagnerPieces(result.points, quizSession.semesterId);
      if (typeof mettreAJourStreak === 'function') mettreAJourStreak();
      saveInProgress();
      renderReview();
    };
    $('#btnSubmitAnswer').addEventListener('click', submit);
    // Sur Mac, taper en clavier japonais (romaji -> hiragana/katakana) passe par
    // un IME : la touche Entrée sert d'abord à valider la conversion en cours,
    // pas à valider la réponse. e.isComposing/keyCode 229 suffisent à détecter
    // ce premier Entrée (même garde que Kanji seul/Kana ci-dessous). Un flag
    // "composing" maison basé sur compositionstart/compositionend a été retiré
    // le 09/09/2026 : compositionend ne se déclenche pas de façon fiable avec
    // certains IME (bug connu de certains navigateurs), ce qui bloquait Entrée
    // en permanence après une composition ratée -- la réponse ne s'affichait
    // plus jamais tant qu'on ne cliquait pas "Valider" à la souris.
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.isComposing || e.keyCode === 229) return;
      submit();
    });
  } else {
    // 09/09/2026 : focus natif sur "Mot suivant" -> Entrée l'active direct
    // (comportement standard d'un <button> focus), pour enchaîner les mots
    // au clavier sans repasser par la souris entre chaque mot. Le focus est
    // différé d'un tick : sans ça, le relâchement (keyup) du même Entrée
    // qui vient de valider la réponse arrivait sur ce bouton fraîchement
    // focus et le cliquait aussitôt -- la réponse n'était jamais vue, on
    // sautait direct au mot suivant. Il faut un DEUXIÈME appui, séparé.
    const nextBtn = $('#btnNextWord');
    setTimeout(() => nextBtn.focus(), 0);
    nextBtn.addEventListener('click', () => {
      quizSession.index++;
      quizSession.submitted = false;
      quizSession.warning = null;
      quizSession.usedSpectral = false;
      renderReview();
    });
  }

  $('#btnQuitQuiz').addEventListener('click', () => {
    quizSession = null;
    renderReview();
  });
}

// ============================================================
// Statistiques
// ============================================================
// ---------- Statistiques avancées (Pro) ----------
// Rassemble toutes les tentatives de toutes les semaines, triées par date
// — utilisé pour la courbe de progression globale ci-dessous.
function getAllSessionsChronological() {
  const all = [];
  Object.keys(DB.scores).forEach(key => {
    DB.scores[key].history.forEach(h => all.push(h));
  });
  all.sort((a, b) => a.date.localeCompare(b.date));
  return all;
}

// Gratuit depuis le 25/07/2026. Le Pro se limite désormais à deux choses :
// pas de publicité, et les palettes décoratives. Tout ce qui touche à
// l'apprentissage lui-même — statistiques, export Anki, contenu — reste
// accessible à tout le monde.
function renderAdvancedStatsCard() {
  const recent = getAllSessionsChronological().slice(-30);
  const trendBars = recent.map(h => {
    const cls = h.pct >= 99 ? 'good' : (h.pct >= 60 ? 'mid' : 'bad');
    const d = new Date(h.date);
    const dateLabel = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    return `<div class="error-bar ${cls}" style="height:${Math.max(6, h.pct)}%" title="${dateLabel} — ${h.pct}%"></div>`;
  }).join('');

  const weekRanking = [];
  DB.settings.semesters.forEach(sem => {
    for (let w = 1; w <= getMaxRelevantWeek(sem); w++) {
      const entry = getScoreEntry(sem.id, w);
      if (entry) weekRanking.push({ label: `${sem.label} — S${w}`, pct: entry.best.pct });
    }
  });
  weekRanking.sort((a, b) => a.pct - b.pct);
  const weakest = weekRanking.slice(0, 5);

  return `
    <div class="card">
      <h3>Statistiques avancées <span style="color:var(--good-bright); font-size:11px;">PRO</span></h3>
      ${recent.length === 0 ? `
        <p class="empty-state">Pas encore assez de sessions pour afficher une tendance.</p>
      ` : `
        <p style="font-size:12px; color:var(--muted); margin-top:-4px;">Progression sur tes ${recent.length} dernières sessions, toutes semaines confondues.</p>
        <div class="error-history-list">
          <div class="error-history-row"><div class="error-history-bars">${trendBars}</div></div>
        </div>
      `}
      ${weakest.length > 0 ? `
        <h4 style="margin:18px 0 8px; font-size:13px; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Semaines à retravailler en priorité</h4>
        <table>
          <thead><tr><th>Semaine</th><th>Meilleur score</th></tr></thead>
          <tbody>${weakest.map(w => `<tr><td>${escapeHtml(w.label)}</td><td>${w.pct}%</td></tr>`).join('')}</tbody>
        </table>
      ` : ''}
    </div>`;
}

function renderStats() {
  let rows = '';
  let totalAttempts = 0;
  const weeksWithHistory = [];
  DB.settings.semesters.forEach(sem => {
    for (let w = 1; w <= getMaxRelevantWeek(sem); w++) {
      const entry = getScoreEntry(sem.id, w);
      const vocabCount = getVocabForWeek(sem.id, w).length;
      if (vocabCount === 0 && !entry) continue;
      totalAttempts += entry ? entry.history.length : 0;
      rows += `
        <tr>
          <td>${sem.label} — S${w}</td>
          <td>${vocabCount}</td>
          <td>${entry ? entry.best.pct + '%' : '—'}</td>
          <td>${entry ? entry.history.length : 0}</td>
        </tr>
      `;
      if (entry && entry.history.length > 0) {
        weeksWithHistory.push({ label: `${sem.label} — S${w}`, history: entry.history });
      }
    }
  });

  // ---- Historique visuel des erreurs : évolution du score par semaine ----
  const errorHistoryHtml = weeksWithHistory.length === 0 ? `
    <p class="empty-state">Aucune session terminée pour le moment — cette vue se remplit au fil de tes révisions.</p>
  ` : weeksWithHistory.map(w => {
    const bars = w.history.map(h => {
      const cls = h.pct >= 99 ? 'good' : (h.pct >= 60 ? 'mid' : 'bad');
      const d = new Date(h.date);
      const dateLabel = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      return `<div class="error-bar ${cls}" style="height:${Math.max(6, h.pct)}%" title="${dateLabel} — ${h.pct}%"></div>`;
    }).join('');
    const trend = w.history.length >= 2 ? w.history[w.history.length - 1].pct - w.history[0].pct : 0;
    const trendLabel = w.history.length >= 2
      ? (trend > 0 ? `▲ +${trend}%` : (trend < 0 ? `▼ ${trend}%` : '— stable'))
      : '';
    return `
      <div class="error-history-row">
        <div class="error-history-label">${escapeHtml(w.label)}</div>
        <div class="error-history-bars">${bars}</div>
        <div class="error-history-trend">${trendLabel}</div>
      </div>
    `;
  }).join('');

  // ---- Mots les plus souvent ratés ----
  const worst = getWorstWords(15).filter(x => x.avgPct < 0.99);
  const worstRows = worst.map(x => `
    <tr>
      <td class="kj">${escapeHtml(x.kanji)}</td>
      <td>${escapeHtml(x.mot)}</td>
      <td>${escapeHtml(x.lecture)}</td>
      <td>${escapeHtml(x.sens)}</td>
      <td>${x.semesterId ? x.semesterId.toUpperCase() + ' — S' + x.week : '—'}</td>
      <td>${Math.round(x.avgPct * 100)}%</td>
      <td>${x.misses} / ${x.attempts}</td>
    </tr>
  `).join('');

  const composite = getScoreCompositePersonnel();

  $('#view-stats').innerHTML = `
    <h2>Statistiques</h2>
    <div class="grid-4">
      <div class="stat-box"><div class="num">${DB.vocab.length}</div><div class="label">Mots au total</div></div>
      <div class="stat-box"><div class="num">${totalAttempts}</div><div class="label">Sessions jouées</div></div>
      <div class="stat-box"><div class="num">${DB.kanjiGroups.length}</div><div class="label">Kanji importés</div></div>
      <div class="stat-box" title="Précision, vitesse, assiduité et difficulté du contenu, combinées sur 100 (voir #5 de la feuille de route).">
        <div class="num">${composite === null ? '—' : composite}</div><div class="label">Score composite</div>
      </div>
    </div>
    ${renderAdvancedStatsCard()}
    <div class="card">
      <h3>Meilleur score par semaine</h3>
      <table>
        <thead><tr><th>Semaine</th><th>Mots</th><th>Meilleur score</th><th>Tentatives</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">Aucune donnée pour le moment.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="card">
      <h3>Historique des erreurs</h3>
      <p style="font-size:12px; color:var(--muted); margin-top:-4px;">
        Score de chaque session jouée, dans l'ordre chronologique (gauche → droite) pour les semaines déjà tentées.
        Plus une barre est basse et rouge, plus il y a eu d'erreurs ce jour-là.
      </p>
      <div class="error-history-list">${errorHistoryHtml}</div>
    </div>
    <div class="card">
      <h3>Mots les plus souvent ratés</h3>
      ${worst.length === 0 ? `
        <p class="empty-state">Rien à signaler pour le moment — continue à réviser pour voir apparaître ici les mots à retravailler.</p>
      ` : `
        <table>
          <thead><tr><th>Kanji</th><th>Mot</th><th>Lecture</th><th>Sens</th><th>Semaine</th><th>Réussite moy.</th><th>Ratés / tentatives</th></tr></thead>
          <tbody>${worstRows}</tbody>
        </table>
      `}
    </div>
  `;
}

// ============================================================
// Applications (téléchargement des versions Mac/Windows)
// ============================================================
function detectPlatform() {
  const ua = navigator.userAgent || '';
  const plat = navigator.platform || '';
  if (/Mac|iPhone|iPad|iPod/.test(plat) || /Macintosh/.test(ua)) return 'mac';
  if (/Win/.test(plat) || /Windows/.test(ua)) return 'win';
  return 'other';
}

function renderDownload() {
  const detected = detectPlatform();
  const APP_VERSION = '1.2.0';
  // Les installeurs sont heberges sur les Releases GitHub et non sur Netlify :
  // ils pesaient 166 Mo sur 168, soit 98,7 % de chaque deploiement, et ils
  // repartaient en entier a chaque changement d'une ligne de CSS.
  const RELEASES = 'https://github.com/KVTADM/kanji-vocab-trainer-web/releases/download/v' + APP_VERSION;
  const RELEASE_DATE = '22 septembre 2026';
  $('#view-download').innerHTML = `
    <h2>Applications</h2>
    <div class="card">
      <p style="font-size:13.5px; color:var(--ink); line-height:1.6;">
        En plus de cette version web, KVT existe en version bureau — 100% locale,
        gratuite, sans compte requis. Choisis ton système :
      </p>
      <p style="font-size:12.5px; color:var(--accent-bright); font-weight:700; margin:10px 0 2px;">
        Dernière version : ${APP_VERSION} · ${RELEASE_DATE}
      </p>
      <p style="font-size:12px; color:var(--muted); margin:0; line-height:1.6;">
        Nouveau dans la 1.1 : module JLPT N3 (367 kanji, 683 mots). Après installation,
        la version s'affiche aussi dans l'app (Réglages) pour confirmer que tu as bien la 1.1.
      </p>
    </div>
    <div class="download-grid">
      <div class="download-card ${detected === 'mac' ? 'recommended' : ''}" id="downloadCardMac">
        <div class="download-icon">🍎</div>
        <h3>macOS</h3>
        <p>Apple Silicon (M1/M2/M3/M4). Fichier .dmg.</p>
        <p class="download-version">Version ${APP_VERSION}</p>
        <a class="primary download-btn" id="btnDownloadMac" href="${RELEASES}/KVT-Mac.dmg">Télécharger pour Mac · v${APP_VERSION}</a>
        ${detected === 'mac' ? '<div class="download-tag">Recommandé pour ton appareil</div>' : ''}
      </div>
      <div class="download-card ${detected === 'win' ? 'recommended' : ''}" id="downloadCardWin">
        <div class="download-icon">🪟</div>
        <h3>Windows</h3>
        <p>Windows 10/11 (64 bits). Fichier .exe.</p>
        <p class="download-version">Version ${APP_VERSION}</p>
        <a class="primary download-btn" id="btnDownloadWin" href="${RELEASES}/KVT-Windows.exe">Télécharger pour Windows · v${APP_VERSION}</a>
        ${detected === 'win' ? '<div class="download-tag">Recommandé pour ton appareil</div>' : ''}
      </div>
    </div>
    <div class="card">
      <h3>À savoir avant d'installer</h3>
      <p style="font-size:12px; color:var(--muted); line-height:1.6;">
        L'app n'étant pas signée par un compte développeur payant (Apple/Microsoft),
        ton système affichera un avertissement de sécurité au premier lancement —
        c'est normal, pas un virus. Sur Mac : clic droit sur l'app → Ouvrir → Ouvrir
        (une seule fois). Sur Windows : "Informations complémentaires" → "Exécuter
        quand même" dans la fenêtre SmartScreen.
      </p>
      <p style="font-size:12px; color:var(--muted); line-height:1.6; margin-top:8px;">
        Sur Mac (puces M1/M2/M3/M4), il arrive que le clic droit → Ouvrir ne suffise
        pas et que macOS affiche à la place "l'app est endommagée et ne peut pas être
        ouverte" — ce n'est pas un fichier corrompu, juste Gatekeeper qui bloque une
        app non signée. Solution : ouvre Terminal (Applications → Utilitaires), tape
        <code>xattr -cr </code> (avec l'espace après), glisse l'app "Kanji Vocab
        Trainer" dans la fenêtre du Terminal pour compléter le chemin, puis appuie
        sur Entrée. Relance ensuite l'app normalement.
      </p>
      <p style="font-size:12px; color:var(--muted); line-height:1.6; margin-top:8px;">
        Ces versions bureau sont indépendantes de ton compte web : tes données
        (vocabulaire, scores) restent stockées localement sur chaque appareil, pas
        liées à ce compte en ligne.
      </p>
    </div>
  `;

  // L'ancien test d'existence par requête HEAD a disparu avec le passage aux
  // Releases GitHub : la requête part vers un autre domaine et se fait bloquer
  // par la politique d'origine, donc elle échouait toujours et désactivait le
  // bouton même quand le fichier existait. Les deux binaires sont publiés
  // ensemble, à la même version : si l'un est là, l'autre aussi.
}

// ============================================================
// Réglages
// ============================================================
function renderSettings() {
  const s = DB.settings;
  const isPro = !!(window.accountUser && window.accountUser.isPro);
  $('#view-settings').innerHTML = `
    <h2>Réglages</h2>
    <div class="card">
      <h3>Barème</h3>
      <p style="font-size:12px; color:var(--muted); line-height:1.6;">
        Chaque mot vaut jusqu'à <strong style="color:var(--ink);">${s.pointsPerWord} points</strong> —
        un barème fixe, identique pour tout le monde (app Mac, version amis,
        web), pour que le classement de la classe reste comparable entre
        tous. Le score d'un mot est proportionnel à la ressemblance entre ta
        réponse et la bonne réponse (distance de Levenshtein : nombre de
        lettres à ajouter/retirer/changer pour passer de l'une à l'autre).
        Réponse exacte = tous les points ; plus il y a de différences, moins
        tu en gagnes.
      </p>
    </div>
    <div class="card">
      <h3>Mode de révision</h3>
      <div class="form-row">
        <label style="flex-direction:row; align-items:center; gap:8px; text-transform:none; font-size:14px; color:var(--ink);">
          <input type="checkbox" id="setHardcoreMode" ${s.hardcoreMode ? 'checked' : ''}/>
          Mode hardcore
        </label>
      </div>
      <p style="font-size:12px; color:var(--muted); line-height:1.6;">
        Pendant une session : aucun indice sur le kanji avant de répondre, et aucune lecture/correction
        affichée mot par mot. Toute la correction (lectures, sens, points) n'apparaît qu'à la toute fin
        de la session, une fois tous les mots passés.
      </p>
      <div class="form-row" style="margin-top:14px;">
        <label style="flex-direction:row; align-items:center; gap:8px; text-transform:none; font-size:14px; color:var(--ink);">
          <input type="checkbox" id="setSpectralMode" ${s.spectralMode ? 'checked' : ''}/>
          Mode spectral
        </label>
      </div>
      <p style="font-size:12px; color:var(--muted); line-height:1.6;">
        Fait apparaître un bouton 👁 à côté du champ de saisie pendant une session : en le maintenant
        appuyé, la bonne réponse s'affiche en transparence par-dessus le champ, pour t'aider à t'en
        souvenir. Si tu l'utilises sur un mot, ce mot rapporte 0 point (comme une mauvaise réponse).
        Indisponible en mode hardcore (qui masque toute correction avant la fin de la session).
      </p>
    </div>
    <div class="card">
      <h3>Thème</h3>
      <div class="form-row">
        <label>Palette de couleurs
          <select id="setTheme">
            <option value="dark" ${(!s.theme || s.theme === 'dark') ? 'selected' : ''}>Sombre (par défaut)</option>
            <option value="light" ${s.theme === 'light' ? 'selected' : ''}>Clair</option>
            ${[
              ['sakura', 'Sakura — cerisiers'],
              ['sumi', 'Sumi — encre et washi'],
              ['ai', 'Ai — mer et indigo'],
              ['momiji', 'Momiji — érables d\'automne'],
              ['take', 'Take — bambou']
            ].map(([id, nom]) => {
              // Le raccourci Pro (debloque = isPro || ...) a ete retire le
              // 23/09/2026 (demande de Paul : "pas a les avoir par defaut") --
              // les 5 palettes decoratives ne s'obtiennent plus qu'en pieces
              // dans la Boutique, abonnement Pro ou non. Sombre et Clair
              // restent gratuits pour tout le monde, inchange.
              const debloque = typeof themeDebloqueParPieces === 'function' && themeDebloqueParPieces(id);
              return `
              <option value="${id}" ${s.theme === id ? 'selected' : ''} ${debloque ? '' : 'disabled'}>${nom}${debloque ? '' : ' 🔒'}</option>
            `;
            }).join('')}
          </select>
        </label>
      </div>
      <p style="font-size:13px; color:var(--muted); line-height:1.6;">
        Sombre et Clair sont gratuits — le mode clair est une question de
        confort visuel, pas un supplément. Les cinq palettes décoratives se
        débloquent une à une dans la Boutique avec des pièces d'or gagnées
        en révisant, Pro ou pas : l'abonnement ne les inclut pas.
      </p>
    </div>
    <div class="card">
      <h3>Export pour Anki</h3>
      ${`
        <p style="font-size:13px; color:var(--muted); line-height:1.6;">
          Génère un fichier avec tout ton vocabulaire, à importer dans
          l'app Anki (gratuite, sur ordinateur ou mobile).
        </p>
        <ol style="font-size:13px; color:var(--muted); line-height:1.8; padding-left:18px; margin:8px 0;">
          <li>Clique sur le bouton ci-dessous : un fichier <code>.txt</code> est téléchargé.</li>
          <li>Ouvre l'app Anki (pas installée ? <a href="https://apps.ankiweb.net/" target="_blank" rel="noopener" style="color:var(--accent);">télécharge-la ici</a>, c'est gratuit).</li>
          <li>Dans Anki : menu <strong>Fichier → Importer</strong>, puis choisis le fichier téléchargé.</li>
          <li>Anki propose automatiquement les bonnes colonnes (mot / lecture+sens / tags) et un type de note "Basique" — tu n'as rien à changer, clique juste sur <strong>Importer</strong>.</li>
        </ol>
        <p style="font-size:12px; color:var(--muted-dim); line-height:1.6;">
          Dans le fichier : le mot japonais devient le recto de la carte, la
          lecture et le sens le verso, et le semestre/semaine un tag
          (pratique pour filtrer dans Anki).
        </p>
        <button class="secondary" id="btnExportAnki">Exporter pour Anki (.txt)</button>
      `}
    </div>
    <div class="card">
      <h3>Sauvegarde des données</h3>
      <p style="font-size:13px; color:var(--muted);">Sauvegarde automatique locale à chaque action. Pense à exporter une copie de temps en temps.</p>
      <div class="form-row">
        <button class="secondary" id="btnExport">Exporter une sauvegarde</button>
        <button class="secondary" id="btnImport">Importer une sauvegarde</button>
        <button class="danger" id="btnReset">Réinitialiser toutes les données</button>
      </div>
    </div>
  `;

  $('#setHardcoreMode').addEventListener('change', async (e) => {
    s.hardcoreMode = e.target.checked;
    await persist();
    showToast(s.hardcoreMode ? 'Mode hardcore activé' : 'Mode hardcore désactivé');
  });

  $('#setSpectralMode').addEventListener('change', async (e) => {
    s.spectralMode = e.target.checked;
    await persist();
    showToast(s.spectralMode ? 'Mode spectral activé' : 'Mode spectral désactivé');
  });

  // Thème et export Anki sont désormais rendus pour tout le monde : leurs
  // gestionnaires doivent donc l'être aussi, sinon les contrôles s'affichent
  // sans rien faire. Le seul verrou Pro restant est l'option Sakura, marquée
  // `disabled` dans le sélecteur — un utilisateur gratuit ne peut pas la
  // choisir, et la sécurité réelle du Pro reste côté serveur (RLS).
  $('#setTheme').addEventListener('change', async (e) => {
    s.theme = e.target.value;
    applyTheme();
    await persist();
    showToast('Thème changé');
  });
  $('#btnExportAnki').addEventListener('click', () => {
    exportAnkiTsv();
    showToast('Export Anki généré');
  });

  $('#btnExport').addEventListener('click', async () => {
    const res = await window.api.exportBackup(DB);
    if (res.ok) showToast('Sauvegarde exportée');
  });

  $('#btnImport').addEventListener('click', async () => {
    const res = await window.api.importBackup();
    if (res.ok) {
      DB = res.data;
      applyTheme();
      showToast('Sauvegarde importée');
      renderCurrentView();
    }
  });

  $('#btnReset').addEventListener('click', async () => {
    if (!confirm('Réinitialiser toutes les données ? Cette action est irréversible (fais un export avant si besoin).')) return;
    DB = await window.api.resetToDefault();
    browsingWeek = null;
    applyTheme();
    showToast('Données réinitialisées');
    renderCurrentView();
  });
}

// ---------- Export Anki (Pro) ----------
// Fichier texte tabulé (pas un vrai .apkg) : plus simple et 100% fiable —
// Anki (Fichier > Importer) détecte lui-même les colonnes grâce aux
// directives #separator/#html/#columns en tête de fichier.
function escapeTsvField(str) {
  // Une tabulation ou un retour à la ligne dans un champ casserait
  // l'alignement des colonnes — on les neutralise plutôt que de risquer un
  // import Anki mal découpé.
  return String(str || '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

function exportAnkiTsv() {
  const lines = ['#separator:tab', '#html:true', '#columns:Front,Back,Tags'];
  DB.vocab.forEach(v => {
    const g = getKanjiGroup(v.kanjiGroupId);
    const front = escapeTsvField(v.mot);
    const back = escapeTsvField(`<b>${v.lecture}</b>${v.sens ? `<br><i>${escapeHtml(v.sens)}</i>` : ''}`);
    const tag = g ? `${g.semesterId}_S${g.week}` : 'sans_semaine';
    lines.push(`${front}\t${back}\t${tag}`);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `kvt-export-anki-${today}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Thèmes (Pro) ----------
// Appliqué systématiquement (même sans compte Pro actif) pour que le choix
// déjà fait ne "saute" pas au chargement — seul le CHANGEMENT de thème est
// verrouillé derrière isPro, dans Réglages.
function applyTheme() {
  document.documentElement.dataset.theme = (DB.settings && DB.settings.theme) || 'dark';
}

// ============================================================
// Démarrage
// ============================================================
async function init() {
  DB = await window.api.loadData();
  applyTheme();
  // [data-view] uniquement : la barre latérale contient aussi un vrai lien
  // (« L'idée du projet ») qui n'est pas une vue de l'app. Sans ce filtre, il
  // recevrait ce gestionnaire et appellerait switchView(undefined).
  $$('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  // La page d'accueil est le premier ecran : c'est elle qui dit ce qui a
  // bouge depuis la derniere session. Une ancre connue (/app/#decks) permet
  // d'arriver directement sur une categorie — c'est ce qui rend cliquable le
  // bouton "Parcourir les decks" de la page d'accueil publique. Une ancre
  // inconnue est ignoree plutot que de vider l'ecran.
  // « communaute » n'a plus de bouton depuis que le logo la remplace : elle
  // est ajoutee a la main, sinon `/app/#communaute` serait rejete comme une
  // ancre inconnue.
  const vuesConnues = new Set($$('.nav-btn[data-view]').map(b => b.dataset.view));
  vuesConnues.add('communaute');
  const ancre = decodeURIComponent(location.hash.replace(/^#/, ''));
  switchView(vuesConnues.has(ancre) ? ancre : 'communaute');

  // Signal de mesure : quelqu'un a ouvert l'application, pas seulement
  // affiche une page. C'est le premier palier qui distingue un visiteur
  // curieux d'un simple clic paye.
  if (window.kvtMesure) window.kvtMesure.noter('app_ouverte');
}

document.addEventListener('DOMContentLoaded', init);
