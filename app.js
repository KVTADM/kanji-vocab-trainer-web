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
let rechercheVocabTexte = '';
let browsingWeek = null;    // { semesterId, week } — semaine affichée dans l'onglet Vocabulaire (fusionné : mots + fiches)
let learnImportPreview = null; // { rows, errors } — résultat de l'analyse avant import des fiches (anciennement onglet Apprendre, fusionné dans Vocabulaire)
let reviewPickerMode = 'vocab'; // 'vocab' | 'kanji' | 'kana' — mode choisi sur l'écran de démarrage de Réviser (kanji seul et kana ajoutés le 09/09/2026)
let reviewVerbeFilter = 'tous'; // 'tous' | 'sans_verbe' | 'verbe_seul' — filtre "avec/sans verbe de base" (09/09/2026), pertinent seulement en mode vocabulaire
let dashboardMode = 'cursus';  // 'cursus' (S0-S6) ou 'jlpt' (modules JLPT) — bascule en haut à droite de l'Accueil
let modalSemaineOuverte = null; // { semesterId, week } — modale de choix ouverte sur une carte du Tableau de bord (09/09/2026), voir renderDashboard()
let modalMotsMasquesOuvert = false; // modale "Mots masqués" ouverte depuis Vocabulaire (17/09/2026), voir renderVocab()
let modalTraceListe = null; // kanji de la semaine parcourue (page Vocabulaire) : permet les fleches precedent/suivant dans la modale de trace, ou null (pas de navigation)
let modalTraceKanji = null; // caractere(s) kanji affiche(s) dans la modale de trace des traits (tache #13, KanjiVG), ou null si fermee

// Semestres repliables sur le Tableau de bord (28/09/2026, demande de Paul :
// "les voir a la maniere d'un fichier pour mieux voir ceux de son choix").
// Purement une préférence d'affichage locale -- volontairement PAS dans
// DB.settings (donc pas synchronisée cloud, ni poussée sur les autres
// appareils) : replier un semestre sur son téléphone ne doit pas le replier
// sur son PC. localStorage plutôt qu'un simple `let` pour survivre à un
// rechargement de page.
const KVT_SEMESTRES_REPLIES_CLE = 'kvtSemestresReplies';
function chargerSemestresReplies() {
  try {
    const brut = JSON.parse(localStorage.getItem(KVT_SEMESTRES_REPLIES_CLE) || '[]');
    return new Set(Array.isArray(brut) ? brut : []);
  } catch (e) {
    return new Set();
  }
}
let semestresReplies = chargerSemestresReplies();
function sauvegarderSemestresReplies() {
  try { localStorage.setItem(KVT_SEMESTRES_REPLIES_CLE, JSON.stringify([...semestresReplies])); } catch (e) { /* stockage indisponible : tant pis, juste pas persisté */ }
}

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
// Precisions sur un mot (liste de Paul, 30/09/2026, suite de la demande sur le
// registre) : "compteur" (ex. 一台 -> il faut penser au compteur) et "lecture
// particuliere" (ex. 一人 = ひとり, 二十歳 = はたち : la lecture n'est pas
// celle qu'on deduirait des kanji). Champ vocab.indice, pose par la migration
// INDICES_A_PRECISER de webapi.js.
const INDICE_LABELS = { 'compteur': 'compteur', 'chiffre': 'chiffre', 'lecture-speciale': 'lecture particulière' };
function indiceBadge(v) {
  if (!v || !v.indice || !INDICE_LABELS[v.indice]) return '';
  return `<span class="registre-badge indice-badge indice-${escapeHtml(v.indice)}" title="${v.indice === 'compteur' ? 'Ce mot est un compteur : pense à la lecture propre à ce compteur.' : (v.indice === 'chiffre' ? 'Ce mot est un chiffre (nombre), pas un compteur.' : 'La lecture de ce mot est particulière : elle ne se déduit pas des kanji.')}">${INDICE_LABELS[v.indice]}</span>`;
}
function registreBadge(v) {
  const registre = (!v || !v.registre || !REGISTRE_LABELS[v.registre]) ? ''
    : `<span class="registre-badge registre-${escapeHtml(v.registre)}">${REGISTRE_LABELS[v.registre]}</span>`;
  return registre + indiceBadge(v);
}
// Sous le mot pose en question : sans l'indice, on ne sait pas qu'un compteur
// est attendu.
function indiceQuestionHtml(v) {
  const badge = indiceBadge(v);
  return badge ? `<div class="indice-question">${badge}</div>` : '';
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
// Duree d'une session mise en pause (29/09/2026) : startedAt est conserve a
// la reprise d'une session sauvegardee, donc "maintenant - startedAt"
// comptait les heures/jours de pause (session reprise le lendemain =
// 24 h de "duree"), faussant l'affichage et le terme vitesse du score
// composite dans les 6 modes chronometres. On cumule plutot le temps entre
// deux reponses, plafonne : au-dela, c'etait une pause, pas de la reflexion.
const DUREE_PLAFOND_ENTRE_REPONSES_MS = 2 * 60 * 1000;
function noterActivite(totals) {
  const maintenant = Date.now();
  const depuis = Number.isFinite(totals.derniereActivite) ? totals.derniereActivite : totals.startedAt;
  if (!Number.isFinite(depuis)) return;
  totals.actifMs = (totals.actifMs || 0) + Math.min(Math.max(0, maintenant - depuis), DUREE_PLAFOND_ENTRE_REPONSES_MS);
  totals.derniereActivite = maintenant;
}
function dureeSessionMs(totals) {
  if (Number.isFinite(totals.actifMs)) return totals.actifMs;
  return Number.isFinite(totals.startedAt) ? Date.now() - totals.startedAt : null;
}

function formatDuree(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec} s`;
  // Au-dela d'une heure, "312 min 07 s" est illisible d'un coup d'oeil sur
  // le classement -- passe en H:MM:SS (28/09/2026, signale par Paul).
  // Sous une heure, le format "N min SS s" reste plus lisible que "5:07".
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const minRestantes = min % 60;
    return `${h}:${String(minRestantes).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${min} min ${String(sec).padStart(2, '0')} s`;
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

// ---------- Classement : difficulte, pourcentage, meilleur resultat (29/09/2026) ----------
// Decisions de Paul : au classement, un resultat passe devant un autre par
// son % reussi, puis a % egal par sa difficulte (Difficile > Normal >
// Facile), puis a difficulte egale par le temps le plus court. Seules les
// sessions "tous les mots" comptent pour le classement (les filtres
// reduisent le nombre de points possibles) ; les essais n'y sont plus
// qu'une indication. Les % gardent une decimale quand ils ne sont pas ronds.
const KVT_RANG_DIFFICULTE = { facile: 0, normal: 1, difficile: 2 };

// 100 % reserve au sans-faute (bug #19 du 22/09/2026) : sinon plafonne a
// 99,9 %, arrondi au dixieme.
function calculerPct(points, maxPoints) {
  if (!(maxPoints > 0)) return 0;
  if (points >= maxPoints) return 100;
  return Math.min(99.9, Math.round((points / maxPoints) * 1000) / 10);
}

// "97,5 %" mais "100 %" : une decimale seulement quand le % n'est pas rond.
function formatPct(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return '—';
  const arrondi = Math.round(n * 10) / 10;
  return (Number.isInteger(arrondi) ? String(arrondi) : arrondi.toFixed(1).replace('.', ',')) + ' %';
}

// Palier de couleur d'une carte de semaine d'apres le meilleur %
// (retour Lucien 30/09 : 100 % vert, ~60 % orange, ~30 % rouge).
function classePalierPct(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return '';
  if (n >= 100) return 'palier-parfait';
  if (n >= 80) return 'palier-bon';
  if (n >= 40) return 'palier-moyen';
  return 'palier-faible';
}

function difficulteDeSession(session) {
  if (session && session.hardcore) return 'difficile';
  if (DB && DB.settings && DB.settings.spectralMode) return 'facile';
  return 'normal';
}

// Complete un enregistrement de fin de session avec la difficulte et le
// filtre de mots de la session en cours (lus sur quizSession, pour ne pas
// changer la signature des 6 fonctions record*SessionResult).
function enrichirRecord(record) {
  if (typeof quizSession !== 'undefined' && quizSession) {
    record.difficulte = difficulteDeSession(quizSession);
    if (!record.verbeFilter) record.verbeFilter = quizSession.verbeFilter || 'tous';
  }
  return record;
}

// > 0 si a est meilleur que b selon la regle du classement.
function comparerResultats(a, b) {
  const pa = Number(a && a.pct) || 0, pb = Number(b && b.pct) || 0;
  if (pa !== pb) return pa - pb;
  const da = KVT_RANG_DIFFICULTE[(a && a.difficulte) || 'normal'], db = KVT_RANG_DIFFICULTE[(b && b.difficulte) || 'normal'];
  if (da !== db) return da - db;
  const ta = Number.isFinite(a && a.dureeMs) ? a.dureeMs : Infinity;
  const tb = Number.isFinite(b && b.dureeMs) ? b.dureeMs : Infinity;
  if (ta !== tb) return tb - ta;
  return 0;
}

// Meilleure tentative eligible au classement ("tous les mots" uniquement ;
// une tentative sans filtre enregistre est d'avant le 09/09/2026, donc
// forcement "tous").
function meilleurPourClassement(history) {
  let best = null;
  (history || []).forEach(r => {
    if ((r.verbeFilter || 'tous') !== 'tous') return;
    if (!best || comparerResultats(r, best) > 0) best = r;
  });
  return best;
}

// Recommencer une session en cours compte un essai (29/09/2026) : les
// essais affiches au classement = sessions terminees + sessions recommencees.
function cleRecommencements(mode, semesterId, week) { return `${mode}|${weekKey(semesterId, week)}`; }
function noterRecommencement(mode, semesterId, week) {
  if (!DB.recommencements) DB.recommencements = {};
  const cle = cleRecommencements(mode, semesterId, week);
  DB.recommencements[cle] = (DB.recommencements[cle] || 0) + 1;
}
function nbEssais(entry, mode, semesterId, week) {
  const termines = entry && entry.history ? entry.history.length : 0;
  return termines + ((DB.recommencements && DB.recommencements[cleRecommencements(mode, semesterId, week)]) || 0);
}

// Bouton "Recommencer" pendant une session (29/09/2026, demande de Paul) :
// repart de zero sur le meme contenu, dans le meme mode, avec le meme filtre
// et la meme difficulte courante. Deux clics (le premier arme le bouton
// 4 s) pour ne jamais perdre une session sur un clic malheureux. Compte un
// essai au classement (voir nbEssais).
function recommencerSessionEnCours() {
  const q = quizSession;
  if (!q) return;
  const filtre = q.verbeFilter || 'tous';
  if (q.mode === 'kanji') { noterRecommencement('kanji', q.semesterId, q.week); startKanjiQuiz(q.semesterId, q.week, true); }
  else if (q.mode === 'traduction') { noterRecommencement('traduction', q.semesterId, q.week); startTraductionQuiz(q.semesterId, q.week, true, filtre); }
  else if (q.mode === 'double') { noterRecommencement('double', q.semesterId, q.week); startDoubleQuiz(q.semesterId, q.week, true, filtre); }
  else if (q.mode === 'kana') startKanaQuiz(q.kanaType, q.groupId, true);
  else if (q.mode === 'pratique') startPratiqueQuiz(q.theme, true);
  else if (!q.mode) { noterRecommencement('vocab', q.semesterId, q.week); startQuiz(q.semesterId, q.week, true, filtre); }
  else return;
  persist();
  renderReview();
  showToast('Session recommencée');
}

function brancherBoutonRecommencer() {
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.btn-recommencer-session') : null;
    if (!btn) return;
    if (btn.dataset.arme !== '1') {
      btn.dataset.arme = '1';
      btn.textContent = 'Confirmer : repartir de zéro ?';
      setTimeout(() => { if (btn.isConnected) { btn.dataset.arme = '0'; btn.textContent = 'Recommencer'; } }, 4000);
      return;
    }
    recommencerSessionEnCours();
  });
}

// Pousse vers le classement le meilleur resultat eligible d'une semaine
// (rien si seules des sessions filtrees existent).
function pousserMeilleurScore(entry, semesterId, week, mode) {
  if (typeof window === 'undefined' || typeof window.kvtPushScore !== 'function' || !entry) return;
  const best = meilleurPourClassement(entry.history);
  if (!best) return;
  window.kvtPushScore(semesterId, week, best.points, best.maxPoints, best.pct, mode, best.dureeMs, nbEssais(entry, mode, semesterId, week), best.difficulte || 'normal', 'tous');
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
// Meilleur temps personnel : la session la plus rapide terminée à 100 %
// (un temps sans score parfait ne dit rien). Parcourt l'historique de chaque
// semaine du mode Vocabulaire. Renvoie { dureeMs, semesterId, week } ou null.
function meilleurTempsParfait(scores) {
  let meilleur = null;
  Object.keys(scores || {}).forEach(cle => {
    const entry = scores[cle];
    ((entry && entry.history) || []).forEach(r => {
      if (!r || Number(r.pct) < 100 || !Number.isFinite(r.dureeMs) || r.dureeMs <= 0) return;
      if (!meilleur || r.dureeMs < meilleur.dureeMs) meilleur = { dureeMs: r.dureeMs, cle };
    });
  });
  return meilleur;
}

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
  const record = enrichirRecord({ date: new Date().toISOString(), points, maxPoints, pct, dureeMs });
  entry.history.push(record);
  if (!entry.best || comparerResultats(record, entry.best) > 0) entry.best = record;
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
  return (s || '').replace(/[.\-（）\s\u200B]/g, '');
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
  const record = enrichirRecord({ date: new Date().toISOString(), points, maxPoints, pct, dureeMs, verbeFilter: verbeFilter || 'tous' });
  entry.history.push(record);
  if (!entry.best || comparerResultats(record, entry.best) > 0) {
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

// Mots longs (signale par Lucien le 29/09/2026 : "『白鳥の湖』" se coupait
// en "『白鳥の" / "湖』" a 64px, la 2e ligne decalee). On reduit la taille
// selon le nombre de caracteres pour que le mot tienne sur une ligne, et le
// CSS equilibre les lignes s'il faut quand meme couper.
function classeTailleMot(mot) {
  const n = Array.from(mot || '').length;
  if (n >= 12) return ' front-word--tres-long';
  if (n >= 6) return ' front-word--long';
  return '';
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

// Validation d'une saisie japonaise (30/09/2026, liste d'idees de Paul :
// "pas possible de valider sans rien" et "pas possible de soumettre avec des
// lettres normales"). Appelee apres finaliserKana() : les lettres latines qui
// restent sont du romaji que la conversion n'a pas pu lire ("l", "x seul"...).
// Renvoie le message a afficher, ou null si la saisie peut etre notee.
// Lettres latines, y compris pleines chasse (ｋ, ｊ) : le clavier japonais en
// mode romaji laisse une consonne pleine chasse en attente ("じんかｋ"), qui
// passait le controle (retour de Lucien, 30/09/2026). NFKC les ramene en k, j.
function aDesLettresLatines(str) {
  return /[A-Za-z]/.test(String(str || '').normalize('NFKC'));
}

function verifierSaisieJp(val) {
  const t = (val || '').trim();
  if (!t) return 'Écris une réponse avant de valider.';
  if (aDesLettresLatines(t)) return "Ta réponse contient des lettres latines qui n'ont pas pu être converties en kana. Corrige-la (romaji accepté : ka, shi, tsu…).";
  return null;
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
  // \u200B (VERROU_N, voir romajiVersHiragana) n'est pas un espace au sens
  // de \s en JS -- a retirer explicitement, sinon une reponse par ailleurs
  // parfaite tapee via le systeme "double n" perd des points a tort.
  return (str || '').replace(/[\s\u200B]+/g, '');
}

// Signale par Lucien le 29/09/2026 (boite a problemes) : "危ない！" attendu
// avec sa ponctuation, "あぶない" tape sans -> 80% ; et "東京の２３区"
// (chiffres pleine chasse) attendu, "とうきょうの23く" tape en chiffres
// normaux -> 78%. Personne ne tape le "！" ni les "２３" pleine chasse en
// repondant : on ramene les deux cotes en NFKC (２３ -> 23, ｶ -> カ) et on
// retire ponctuation et symboles (！？。、・「」『』〜...), en gardant ー
// (lettre, pas ponctuation). Symetrique, donc sans effet sur une lecture
// deja identique des deux cotes. Garde-fou : si tout disparait (lecture
// faite uniquement de symboles), on garde la version brute.
function sansPonctuationJp(str) {
  const nfkc = (str || '').normalize('NFKC');
  const nette = nfkc.replace(/[\p{P}\p{S}]+/gu, '');
  return nette.length > 0 ? nette : nfkc;
}

function similarity(input, correct) {
  const a = toHiragana(sansEspaces(sansPonctuationJp((input || '').trim())));
  const b = toHiragana(sansEspaces(sansPonctuationJp((correct || '').trim())));
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
  // Quelques mots ont plusieurs lectures/sens valables, stockes separes par
  // " / " (ex. 門 -> "もん / かど", confirme par Paul le 09/09/2026) ou par
  // une virgule (ex. un sens du genre "matin, aube" -- signale par Paul le
  // 28/09/2026, semaine 8 du semestre 2) : comparer la reponse tapee a la
  // chaine combinee penalisait a tort une des bonnes reponses (jamais 100%,
  // meme en repondant juste). On compare a chaque alternative separement et
  // on garde la meilleure -- sans effet sur les mots a alternative unique
  // (pas de "/" ni de ",", comportement identique a avant).
  const alternatives = (correct || '').split(/[/,]/).map(s => s.trim()).filter(s => s.length > 0);
  const candidats = alternatives.length > 0 ? alternatives : [correct];
  const pct = Math.max(...candidats.map(c => similarity(input, c)));
  const points = Math.round(pct * DB.settings.pointsPerWord);
  return { pct, points };
}

// Champ "sens" (francais) assoupli le 29/09/2026 apres un signalement de la
// boite a problemes : scoreAnswer() compare lettre a lettre, ce qui comptait
// faux une majuscule, un accent oublie, une ponctuation absente, les
// precisions entre parentheses ("Descendre (d'un vehicule, d'un
// escalier)") et les alternatives tapees dans un autre ordre ("droite
// gauche" pour "gauche, droite"). On normalise les deux cotes (minuscules,
// sans accents ni ponctuation), on essaie le sens avec et sans ses
// parentheses, chaque alternative seule, toutes ensemble, et on compare
// aussi les mots tries (l'ordre ne compte plus). La lecture japonaise
// garde scoreAnswer() tel quel.
function normaliserSens(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function scoreSens(input, sens) {
  const trier = str => str.split(' ').sort().join(' ');
  const saisie = normaliserSens(input);
  const candidats = [];
  [(sens || '').replace(/\([^)]*\)/g, ' '), (sens || '').replace(/[()]/g, ' ')].forEach(variante => {
    const alternatives = variante.split(/[/,;]/).map(normaliserSens).filter(a => a.length > 0);
    candidats.push(...alternatives, alternatives.join(' '));
  });
  const valides = candidats.filter(c => c.length > 0);
  if (valides.length === 0) return scoreAnswer(input, sens);
  const pct = Math.max(...valides.map(c => Math.max(similarity(saisie, c), similarity(trier(saisie), trier(c)))));
  return { pct, points: Math.round(pct * DB.settings.pointsPerWord) };
}

// Mode "Double reponse" (tache #11, rang 4) : une seule carte affiche le
// mot en kanji, DEUX champs a remplir (lecture + sens), les deux doivent
// etre justes pour marquer des points -- validee par Paul le 22/09/2026
// ("Oui exactement ca"). scoreAnswer() sur la lecture, scoreSens() sur le
// sens (voir juste au-dessus) (tolerance aux fautes de frappe deja geree, alternatives "/"
// deja gerees pour les lectures a choix multiple) et on combine par le
// MINIMUM des deux pourcentages, pas une moyenne : une lecture parfaite
// ne doit pas racheter un sens invente, et inversement. La tolerance
// reste au niveau de CHAQUE champ ; seule la combinaison est stricte.
function scoreDoubleAnswer(inputLecture, inputSens, v) {
  const resLecture = scoreAnswer(inputLecture, v.lecture);
  const resSens = scoreSens(inputSens, v.sens);
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
  // jya/jyu/jyo (28/09/2026, signale par Paul) : orthographe alternative
  // de じゃ/じゅ/じょ, acceptee par tous les autres convertisseurs romaji
  // et par un clavier japonais (J -> じ, puis Y+voyelle -> le petit や/ゆ/よ
  // qui suit) -- notre table ne connaissait que ja/ju/jo. Meme kana que
  // ja/ju/jo, juste une autre facon de les taper.
  jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
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
// Marqueur invisible (espace de largeur nulle) pose juste apres un ん/ン
// confirme par un "nn" (systeme "double n", decision de Paul le
// 25/09/2026) : sert a le "verrouiller" pour que la frappe suivante ne le
// fusionne jamais avec une syllabe (na/ni/nu/ne/no). Sans lui, des que le
// second "n" est tape, le "ん" affiche apres le premier "n" est reconverti
// en "n" latin (regle ci-dessous) et redevient indiscernable d'un "n"
// isole tout juste tape -- ce qui annule le "double n" a la frappe
// suivante (ex. "kanni" tape lettre par lettre redonnait a tort "かに").
// Jamais visible a l'ecran (largeur nulle), et retire avant la notation
// (voir nettoieLectureBrute/sansEspaces plus bas).
const VERROU_N = '\u200B';

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
        out += 'ん' + VERROU_N;
        i += 2;
        continue;
      }
      // "n" isole devant une consonne (pas suivi d'un second "n" ni d'une
      // voyelle/y) : aucune ambiguite possible (n+consonne ne peut jamais
      // former na/ni/nu/ne/no) -> ん tout de suite.
      if (suivant !== undefined && !'aiueoy'.includes(suivant)) {
        out += 'ん';
        i += 1;
        continue;
      }
      // "n" isole en fin de saisie POUR L'INSTANT (suivant === undefined) :
      // PAS de conversion immediate en ん, contrairement a avant. Demande de
      // Paul le 25/09/2026 ("bloque la vue du ん si nn n'est pas fini,
      // sinon on ne sait pas lequel est deja bien ecrit") : ce "n" est
      // encore ambigu, il pourrait devenir na/ni/nu/ne/no (une voyelle
      // arrive juste apres) ou se confirmer en ん (un second "n" arrive) --
      // un ん affiche a l'ecran doit TOUJOURS etre un ん deja confirme,
      // jamais une supposition provisoire. Reste donc affiche "n" latin, un
      // peu comme un romaji incomplet (cf. plus bas), jusqu'a ce que la
      // frappe suivante tranche. Consequence : les mots qui se terminent
      // par un ん isole (ex. "hon") n'affichent plus ce ん final tant que
      // la reponse n'est pas validee -- voir finaliserKana() plus bas, qui
      // s'en charge au moment de la validation (obligatoire : rien d'autre
      // ne va plus jamais confirmer ce "n" si la frappe s'arrete la).
      // (Rien a faire ici : on laisse tomber jusqu'au bloc de recherche
      // ci-dessous, qui ne le reconnaitra pas et le gardera tel quel --
      // meme mecanisme que "k" isole en attente de sa voyelle.)
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

// A appeler sur la valeur d'un champ en saisie kana au moment de VALIDER la
// reponse (jamais pendant la frappe elle-meme) : un "n" latin isole encore
// en attente en toute fin de chaine (ex. "hon" affiche "ほn" tant qu'on
// tape encore, voir romajiVersHiragana) n'est plus jamais confirme en ん
// tout seul -- rien ne le declenche si la frappe s'arrete la. Sans cet
// appel, un mot qui se termine par un ん isole (ex. 本 "hon") ne pourrait
// plus jamais etre note juste. katakana=true pour le champ onyomi (meme
// convention que activerSaisieKanaDirecte).
function finaliserKana(val, katakana) {
  const v = val || '';
  if (v.endsWith('n')) return v.slice(0, -1) + (katakana ? 'ン' : 'ん');
  return v;
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
  // Message d'erreur de lien (voir traiterErreurAuthDansUrl() et account.js) :
  // il reste affiché tant qu'on reste sur l'onglet Compte (y compris re-rendus
  // successifs le temps que Supabase verifie la session), mais n'a plus de
  // raison de resurgir si on revient sur Compte plus tard dans la même page.
  if (changementReel && currentView === 'account' && typeof kvtAuthErrorMessage !== 'undefined') {
    kvtAuthErrorMessage = null;
  }
  // Apercu de theme (voir renderBoutique() dans gamification.js) : on ne
  // laisse jamais quelqu'un repartir de la Boutique avec un theme
  // d'emprunt encore applique sur toute la page.
  if (changementReel && currentView === 'boutique' && typeof boutiqueApercuTheme !== 'undefined' && boutiqueApercuTheme) {
    boutiqueApercuTheme = null;
    applyTheme();
  }
  // Salons multijoueur (voir parties.js) : les minuteurs (affichage + arbitrage
  // hote) ne servent a rien hors de cette vue, autant les arreter en partant --
  // l'abonnement temps reel au salon, lui, reste actif (on peut re-ouvrir
  // l'onglet Parties et retrouver la partie en cours sans tout reperdre).
  if (changementReel && currentView === 'parties' && typeof arreterMinuteursPartie === 'function') {
    arreterMinuteursPartie();
  }
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
  else if (currentView === 'download') renderDownload();
  else if (currentView === 'settings') renderSettings();
  else if (currentView === 'account' && typeof renderAccount === 'function') renderAccount(null);
  else if (currentView === 'leaderboard' && typeof renderLeaderboard === 'function') renderLeaderboard();
  else if (currentView === 'decks' && typeof renderDecks === 'function') renderDecks();
  else if (currentView === 'publier' && typeof renderPublier === 'function') renderPublier();
  else if (currentView === 'deck' && typeof renderDeck === 'function') renderDeck();
  else if (currentView === 'communaute' && typeof renderCommunaute === 'function') renderCommunaute();
  else if (currentView === 'profil' && typeof renderProfilPublic === 'function') renderProfilPublic();
  else if (currentView === 'creation' && typeof renderCreation === 'function') renderCreation();
  else if (currentView === 'admin' && typeof renderAdmin === 'function') renderAdmin();
  else if (currentView === 'boutique' && typeof renderBoutique === 'function') renderBoutique();
  else if (currentView === 'parties' && typeof renderParties === 'function') renderParties();
  else if (currentView === 'aide' && typeof renderAide === 'function') renderAide();
  else if (currentView === 'historique' && typeof renderHistorique === 'function') renderHistorique(null);
  renderSidebarFooter();
  renderTopbarProfil();
  brancherRechercheGlobale();
}

// Voyant de synchronisation a la place du compteur de mots (30/09/2026).
// Retour de Lucien (30/09/2026) : le voyant changeait a chaque reponse
// ("Envoi…" orange puis "Synchronise"), c'etait agacant. Il reste donc VERT et
// discret ("Sync") tant que tout va bien, y compris pendant un envoi (rapide);
// il ne passe au rouge que si la synchronisation echoue.
function voyantSyncInfos(etat, connecte) {
  if (!connecte) return { classe: 'local', texte: 'Local', titre: 'Non connecté : tes données restent sur cet appareil.' };
  if (etat === 'erreur') return { classe: 'erreur', texte: 'Non synchronisé', titre: 'La dernière synchronisation a échoué (serveur ou connexion). Elle sera retentée à ta prochaine action.' };
  return { classe: 'ok', texte: 'Sync', titre: 'En ligne : ta progression est sauvegardée.' };
}

function renderSidebarFooter() {
  const el = $('#weekBadge');
  if (!el) return;
  const v = voyantSyncInfos(window.kvtEtatSync, !!window.accountUser);
  el.innerHTML = `<span class="voyant-sync voyant-sync--${v.classe}" title="${v.titre}"><span class="voyant-sync__point"></span>${v.texte}</span>`;
}

// Recherche rapide dans la barre du haut : ouvre Vocabulaire avec le terme.
function brancherRechercheGlobale() {
  const champ = document.getElementById('rechercheGlobale');
  if (!champ || champ.dataset.branche) return;
  champ.dataset.branche = '1';
  champ.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const terme = champ.value.trim();
    if (!terme) return;
    rechercheVocabTexte = terme;
    champ.value = '';
    champ.blur();
    if (currentView === 'manage') renderVocab(); else switchView('manage');
  });
}

// Acces rapide a son propre profil depuis n'importe quelle page (23/09/2026,
// demande de Paul : "un acces facile au compte profil utilisateur sur le nom
// ou photo de profil pour voir le profil"). Reutilise auteurHtml(), deja le
// bouton cliquable pose a cote de chaque deck/avis (voir profils.js) : meme
// avatar, meme pseudo, meme clic delegue au document qui ouvre la page de
// profil -- aucun nouveau mecanisme de clic a brancher ici.
// Pastille « demandes d'amis à traiter » à côté du pseudo (retour Lucien
// 30/09 : aucune notification). Clic = onglet Amis de son profil.
function majPastilleAmis() {
  const zone = $('#topbarProfil');
  if (!zone) return;
  const ancienne = zone.querySelector('.notif-pastille');
  if (ancienne) ancienne.remove();
  const n = window.kvtAmis && window.kvtAmis.nbDemandesRecues ? window.kvtAmis.nbDemandesRecues() : 0;
  // Pastille de l'onglet Amis du profil, si elle est affichée.
  document.querySelectorAll('.profil-onglet .notif-pastille').forEach(p => { if (n) p.textContent = String(n); else p.remove(); });
  if (!n || !window.accountUser) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'notif-pastille notif-pastille--topbar';
  b.textContent = n > 9 ? '9+' : String(n);
  b.title = n + ' demande' + (n > 1 ? 's' : '') + " d'ami à traiter";
  b.addEventListener('click', () => { if (window.kvtProfilPublic) window.kvtProfilPublic.ouvrirMonProfil('amis'); });
  zone.appendChild(b);
}
if (typeof window !== "undefined") window.kvtMajPastilleAmis = majPastilleAmis;

// Vérifie de temps en temps s'il y a de nouvelles demandes (toutes les 2 min,
// seulement onglet visible et connecté).
let minuterieAmis = null;
function demarrerVeilleAmis() {
  if (minuterieAmis) return;
  minuterieAmis = setInterval(async () => {
    if (!window.accountUser || !window.kvtAmis || document.hidden) return;
    await window.kvtAmis.rechargerAmities();
    majPastilleAmis();
  }, 120000);
}

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
  majPastilleAmis();
  demarrerVeilleAmis();
  if (window.kvtAmis && !window.kvtAmis.estChargee()) {
    window.kvtAmis.assurerAmitiesChargees().then(() => { if (window.accountUser === u) majPastilleAmis(); });
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
  // Signale par Lucien le 30/09/2026 ("cette fleche fait rien") : ce menu
  // RANGE le semestre dans une categorie, il ne change pas l'onglet affiche.
  // Le semestre quittait alors l'ecran sans rien dire, ce qui ressemblait a
  // un bouton mort. On suit le semestre vers son nouvel onglet et on le dit.
  const cible = ongletsDashboard().find(o => o.id === categorieId);
  if (cible) {
    dashboardMode = cible.id;
    if (typeof showToast === 'function') showToast(`« ${sem.label} » rangé dans ${cible.label}`);
  }
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

  // Cadeau en attente (28/09/2026) : au-dessus du widget de niveau, pour
  // être la toute première chose vue -- voir widgetCadeau() dans
  // gamification.js.
  if (typeof widgetCadeau === 'function') html += widgetCadeau();

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
            ${escapeHtml(weakSem.label)} — Semaine ${weakWeek.week} : ${formatPct(weakWeek.pct)} la dernière fois, ça vaut le coup de la retravailler.
          </div>
        </div>
        <button class="primary" id="btnReco">Réviser</button>
      </div>`;
  }

  if (dashboardMode === 'special') {
    // Onglet "Special" (17/09/2026, complete le 22/09/2026 avec Double
    // reponse, reduit le 28/09/2026 a Vocabulaire pratique puis passe en
    // affichage direct des 3 cartes le meme jour) : Ecriture/Traduction/
    // Double sont accessibles depuis la modale de semaine (voir plus bas
    // dans ce fichier) -- plus besoin d'eux ici. Vocabulaire pratique
    // n'a plus de carte d'entree "Ouvrir" : les 3 themes (compteurs,
    // couleurs, heure) s'affichent directement, demande de Paul -- meme
    // grille/logique (buildPratiqueCardsHtml) que l'ecran Reviser, mais
    // avec des classes marqueur separees (.special-pratique-*) pour que
    // les gestionnaires de clic ci-dessous ne mordent jamais sur les
    // cartes de Reviser si elles trainent encore dans le DOM (meme piege
    // que .week-card vs .review-week-card, deja documente plus haut).
    html += `
      <div class="card">
        <h3>Vocabulaire pratique</h3>
        <p style="font-size:13px; color:var(--muted); margin-top:4px;">Compteurs, couleurs et expressions de temps/heure -- du vocabulaire utile en dehors du programme.</p>
        <div class="week-grid" style="margin-top:12px;">${buildPratiqueCardsHtml('review-week-card special-pratique-card', 'review-week-restart-btn special-pratique-restart-btn')}</div>
      </div>`;
  } else {
  const visibleSemesters = DB.settings.semesters.filter(sem => categorieDuSemestre(sem) === dashboardMode);

  if (!visibleSemesters.length) {
    html += `<div class="card"><p style="color:var(--muted);">Cette catégorie est vide. Range un semestre dedans depuis un autre onglet.</p></div>`;
  }

  visibleSemesters.forEach(sem => {
    const unitPrefix = sem.id.startsWith('jlpt') ? 'C' : 'S';
    const rangeeDans = categorieDuSemestre(sem);
    // Menu "Ranger dans une categorie" retire le 30/09/2026 (demande de Paul,
    // apres le retour de Lucien : bouton juge inutile et deroutant).

    const replie = semestresReplies.has(sem.id);
    html += `<div class="card">
      <div class="semestre-tete">
        <div class="semestre-titre-groupe">
          <button class="semestre-toggle" type="button" data-toggle-semestre="${sem.id}" aria-expanded="${replie ? 'false' : 'true'}" title="${replie ? 'Déplier' : 'Replier'} ce semestre">${replie ? '▸' : '▾'}</button>
          <h3>${escapeHtml(sem.label)}${sem.importe ? ` <span class="semestre-origine">importé de ${escapeHtml(sem.auteur || 'quelqu\'un')}</span>` : ''}</h3>
        </div>
      </div>
      ${replie ? '' : '<div class="week-grid">'}`;
    if (!replie) for (let w = 1; w <= sem.weeks; w++) {
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
        <div class="week-card ${vocabList.length === 0 ? 'empty' : ''} ${entry ? classePalierPct(entry.best.pct) : ''} ${entry && entry.best.difficulte === 'difficile' ? 'week-card--hardcore' : ''}" data-sem="${sem.id}" data-week="${w}">
          <div class="week-num">${unitPrefix}${w}</div>
          <div class="week-meta">${groups.length} kanji · ${vocabList.length} mots</div>
          ${entry ? `<div class="week-score">${entry.best.points}/${entry.best.maxPoints} pts <span class="week-score-pct">(${formatPct(entry.best.pct)})</span> ${typeTagScore}</div>` : '<div class="week-score muted">—</div>'}
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
    html += `${replie ? '' : '</div>'}</div>`;
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
        <div class="modal-box modal-box--semaine">
          <div class="modal-tete modal-tete--semaine">
            <h3><span class="modal-semestre">${escapeHtml(semModal.label)}</span><span class="modal-semaine-titre">Semaine ${weekModal}</span></h3>
            <button class="modal-fermer" id="btnFermerModalSemaine" title="Fermer" aria-label="Fermer">✕</button>
          </div>
          ${vocabModalTous.length > 0 ? `
            <div class="modal-apercu" aria-label="Aperçu du vocabulaire">
              ${vocabModalTous.slice(0, 8).map(v => `<span class="modal-apercu__mot" title="${escapeHtml(v.lecture || '')}">${escapeHtml(v.mot)}</span>`).join('')}
              ${vocabModalTous.length > 8 ? `<span class="modal-apercu__reste">+${vocabModalTous.length - 8}</span>` : ''}
            </div>
            <button type="button" class="secondary small" id="btnVoirVocabModalSemaine" style="margin-bottom:12px;">Voir tout le vocabulaire de cette semaine</button>
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
              Meilleur score : ${entryModal.best.points}/${entryModal.best.maxPoints} pts (${formatPct(entryModal.best.pct)})${entryModal.best.verbeFilter ? ' · ' + escapeHtml(libelleFiltreMots(entryModal.best.verbeFilter)) : ''}
            </div>
          ` : ''}
          <div class="filtre-mode filtre-mode--aide">
            ${[
              ['vocab', 'Vocabulaire', "On te montre le mot japonais : tu écris sa lecture en kana. Noté, avec un temps et un classement."],
              ['ecriture', 'Écriture', "On te montre la lecture : tu écris le kanji sur papier, puis tu révèles la réponse et tu te corriges toi-même. Pas de note."],
              ['traduction', 'Traduction', "On te donne le sens en français : tu réponds en kanji ou en kana. Noté."],
              ['double', 'Double réponse', "Pour chaque mot, tu donnes à la fois la lecture (kana) et le sens (français). Noté."]
            ].map(([val, lib, aide], i) => `
              <label class="mode-choix"><input type="radio" name="modalMode" value="${val}" ${i === 0 ? 'checked' : ''}> ${lib}
                <span class="aide-bulle" tabindex="0" role="note" aria-label="${escapeHtml(aide)}" data-aide="${escapeHtml(aide)}">?</span>
              </label>`).join('')}
          </div>
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
  if (typeof wireWidgetCadeau === 'function') wireWidgetCadeau();

  $$('[data-onglet]').forEach(b => {
    b.addEventListener('click', () => { dashboardMode = b.dataset.onglet; renderDashboard(); });
  });
  $('#btnNouvelleCategorie').addEventListener('click', creerCategorie);
  // Cartes theme de l'onglet "Special" (28/09/2026) : demarrent directement
  // la session (comme une carte de semaine Cursus/JLPT) et basculent sur
  // Reviser pour l'afficher -- plus de detour par un bouton "Ouvrir".
  $$('.special-pratique-restart-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      startPratiqueQuiz(btn.dataset.theme, true);
      reviewPickerMode = 'pratique';
      switchView('review');
    });
  });
  $$('.special-pratique-card').forEach(el => {
    el.addEventListener('click', () => {
      const count = getPratiqueList(el.dataset.theme).length;
      if (count === 0) return;
      startPratiqueQuiz(el.dataset.theme, false);
      reviewPickerMode = 'pratique';
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
  $$('[data-toggle-semestre]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleSemestre;
      if (semestresReplies.has(id)) semestresReplies.delete(id); else semestresReplies.add(id);
      sauvegarderSemestresReplies();
      renderDashboard();
    });
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
    // Le « ? » est dans le label du bouton radio : sans ça, le consulter
    // changerait le mode choisi.
    $$('.aide-bulle').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }));
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
    // Le label du bouton ("Recommencer" au lieu de "Demarrer") ne concerne
    // que la reprise d'une session Vocabulaire en cours (savedModal) : si on
    // choisit Ecriture/Traduction a la place, on demarre toujours une
    // session neuve, donc le bouton doit revenir a "Demarrer" (28/09/2026).
    const btnDemarrerModal = $('#btnDemarrerModalSemaine');
    $$('input[name="modalMode"]').forEach(input => {
      input.addEventListener('change', () => {
        const repriseVocabActive = input.value === 'vocab' && !!savedModal;
        btnDemarrerModal.textContent = repriseVocabActive ? 'Recommencer' : 'Démarrer';
      });
    });
    btnDemarrerModal.addEventListener('click', () => {
      const { semesterId, week } = modalSemaineOuverte;
      const modeRadioCoche = $('input[name="modalMode"]:checked');
      const modeChoisi = modeRadioCoche ? modeRadioCoche.value : 'vocab';
      modalSemaineOuverte = null;
      if (modeChoisi === 'ecriture') {
        startEcritureQuiz(semesterId, week, reviewVerbeFilter);
      } else if (modeChoisi === 'traduction') {
        startTraductionQuiz(semesterId, week, true, reviewVerbeFilter);
      } else if (modeChoisi === 'double') {
        startDoubleQuiz(semesterId, week, true, reviewVerbeFilter);
      } else {
        startQuiz(semesterId, week, true, reviewVerbeFilter);
      }
      switchView('review');
    });
  }
}

// ============================================================
// Vocabulaire : import en masse + parcours
// ============================================================
// Lien externe vers la fiche Jisho du mot (demande de Paul, 28/09/2026,
// point 3 du backlog : "lien jisho auto de redirection pour le voc").
// Jisho accepte directement le mot japonais (kanji ou kana) dans l'URL de
// recherche -- pas besoin de romaji ni d'API, un simple lien suffit.
function jishoLienHtml(mot) {
  return `<a class="lien-jisho" href="https://jisho.org/search/${encodeURIComponent(mot)}" target="_blank" rel="noopener" title="Voir « ${escapeHtml(mot)} » sur Jisho">Jisho ↗</a>`;
}

// Recherche dans tout le cursus (29/09/2026, demande de Paul) : un kanji,
// une lecture (kana, ou romaji converti en hiragana), ou un mot francais
// (sans tenir compte des majuscules ni des accents). Mots masques exclus.
// Pure (hors lecture de DB) : testee dans tests/nouveaux-modes.cases.js.
function rechercherVocab(requete, limite) {
  const brute = (requete || '').trim();
  if (!brute) return [];
  const francais = normaliserSens(brute);
  const kana = toHiragana(sansEspaces(/[a-z]/i.test(brute) ? finaliserKana(romajiVersHiragana(brute.toLowerCase()), false) : brute));
  const groupes = new Map((DB.kanjiGroups || []).map(g => [g.id, g]));
  const resultats = [];
  (DB.vocab || []).forEach(v => {
    if (estMotMasque(v.id)) return;
    const g = groupes.get(v.kanjiGroupId);
    if (!g) return;
    const lecture = toHiragana(sansEspaces(v.lecture));
    let pertinence = 0;
    if (v.mot === brute || lecture === kana || normaliserSens(v.sens) === francais) pertinence = 3;
    else if ((v.mot || '').includes(brute) || g.kanji === brute) pertinence = 2;
    else if ((kana && /[ぁ-ゖ]/.test(kana) && lecture.includes(kana)) || (francais.length >= 2 && normaliserSens(v.sens).includes(francais))) pertinence = 1;
    if (pertinence) resultats.push({ v, g, pertinence });
  });
  resultats.sort((a, b) => b.pertinence - a.pertinence);
  return resultats.slice(0, limite || 50);
}

function resultatsRechercheHtml(requete) {
  const res = rechercherVocab(requete, 50);
  if (!res.length) return '<div class="empty-state">Aucun mot trouvé dans le cursus.</div>';
  return `
    <table>
      <thead><tr><th>Mot</th><th>Lecture</th><th>Sens</th><th>Où</th></tr></thead>
      <tbody>
        ${res.map(({ v, g }) => {
          const sem = getSemester(g.semesterId);
          return `
          <tr>
            <td>${escapeHtml(v.mot)}</td>
            <td>${escapeHtml(v.lecture)}</td>
            <td>${escapeHtml(v.sens)}</td>
            <td><button class="lien-retour btn-aller-semaine" data-aller="${escapeHtml(g.semesterId)}|${g.week}">${escapeHtml(sem ? sem.label : g.semesterId)} — sem. ${g.week}</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

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
                  <td>${jishoLienHtml(v.mot)} <button class="secondary small btn-masquer-vocab" data-vocab="${v.id}" title="Masquer ce mot (reversible, voir Mots masques)">Masquer</button></td>
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
      <input type="search" id="vocabRecherche" class="vocab-recherche" placeholder="Rechercher dans tout le cursus : kanji, lecture (kana ou romaji) ou mot en français" value="${escapeHtml(rechercheVocabTexte)}">
      <div id="vocabRechercheResultats">${rechercheVocabTexte.trim() ? resultatsRechercheHtml(rechercheVocabTexte) : ''}</div>
      <div id="vocabParcours" ${rechercheVocabTexte.trim() ? 'hidden' : ''}>
        <select id="browseWeekPicker" style="margin-bottom:14px;">${selectHtml}</select>
        ${browseHtml}
      </div>
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
                      <td>${jishoLienHtml(v.mot)} <button class="secondary small btn-demasquer-vocab" data-vocab="${v.id}">Restaurer</button></td>
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

  // Recherche : seuls les resultats sont redessines a la frappe (redessiner
  // toute la vue ferait perdre le focus du champ).
  const brancherResultats = () => {
    $$('.btn-aller-semaine').forEach(b => {
      b.addEventListener('click', () => {
        const [sem, w] = b.dataset.aller.split('|');
        browsingWeek = { semesterId: sem, week: parseInt(w, 10) };
        rechercheVocabTexte = '';
        renderVocab();
      });
    });
  };
  const champRecherche = $('#vocabRecherche');
  champRecherche.addEventListener('input', () => {
    rechercheVocabTexte = champRecherche.value;
    const actif = !!rechercheVocabTexte.trim();
    $('#vocabRechercheResultats').innerHTML = actif ? resultatsRechercheHtml(rechercheVocabTexte) : '';
    $('#vocabParcours').hidden = actif;
    brancherResultats();
  });
  brancherResultats();

  $$('.btn-voir-trace-groupe').forEach(btn => {
    btn.addEventListener('click', () => {
      modalTraceKanji = btn.dataset.kanji;
      modalTraceListe = groups.map(g => g.kanji);
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
  // Laisse le kanji complet visible un instant avant de relancer la boucle
  // (demande de Paul, 28/09/2026 : "les animations de tracé doivent être
  // répétées à l'infini") -- sans cette pause, l'oeil n'a pas le temps de
  // voir le caractere entier avant que tout reparte de zero.
  const PAUSE_AVANT_REPRISE_MS = 900;
  // Un appel repart toujours de zero (ex. bouton "Rejouer") : on annule
  // d'abord toute boucle deja programmee pour ce SVG, sinon deux boucles
  // tourneraient en parallele sur les memes traits.
  if (svgEl._kvtBoucleTraceId) {
    clearTimeout(svgEl._kvtBoucleTraceId);
    svgEl._kvtBoucleTraceId = null;
  }
  // Respecte la preference systeme reduced-motion (meme principe que les
  // autres @media (prefers-reduced-motion: reduce) du CSS) : le kanji
  // s'affiche direct, trait complet, sans animation ni boucle.
  const reduitMouvement = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduitMouvement) {
    traits.forEach(path => {
      path.style.transition = 'none';
      path.style.strokeDasharray = '';
      path.style.strokeDashoffset = '0';
    });
    return;
  }
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
  // Boucle infinie tant que le SVG reste dans la page : isConnected coupe
  // proprement la boucle des que la modale se ferme ou que la vue change
  // (innerHTML remplace), sans avoir a intercepter chaque endroit qui
  // pourrait faire disparaitre cet element.
  const dureeTotale = traits.length * DUREE_PAR_TRAIT_MS + PAUSE_AVANT_REPRISE_MS;
  svgEl._kvtBoucleTraceId = setTimeout(() => {
    if (svgEl.isConnected) animerTraceKanji(svgEl);
  }, dureeTotale);
}

// Fleches precedent/suivant dans la modale de trace (demande de Paul,
// 03/10/2026) : on trace les kanji d'une semaine un par un, dans l'ordre,
// donc on passe au kanji suivant sans fermer la modale. Seulement quand la
// modale vient de la page Vocabulaire (modalTraceListe renseignee).
function htmlNavTraceKanji() {
  if (!modalTraceListe || modalTraceListe.length < 2) return '';
  const i = modalTraceListe.indexOf(modalTraceKanji);
  if (i < 0) return '';
  const avant = i > 0, apres = i < modalTraceListe.length - 1;
  return `
    <div class="trace-nav">
      <button class="secondary trace-nav-btn" id="btnTracePrec" aria-label="Kanji precedent" title="Kanji precedent (fleche gauche)" ${avant ? '' : 'disabled'}>←</button>
      <span class="trace-nav-pos">${i + 1} / ${modalTraceListe.length}</span>
      <button class="secondary trace-nav-btn" id="btnTraceSuiv" aria-label="Kanji suivant" title="Kanji suivant (fleche droite)" ${apres ? '' : 'disabled'}>→</button>
    </div>
  `;
}

// Passe au kanji voisin de la semaine (delta = -1 ou +1) ; sans effet aux extremites.
function traceKanjiVoisin(delta) {
  if (!modalTraceKanji || !modalTraceListe) return false;
  const i = modalTraceListe.indexOf(modalTraceKanji);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= modalTraceListe.length) return false;
  modalTraceKanji = modalTraceListe[j];
  return true;
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
        ${htmlNavTraceKanji()}
        <p class="trace-attribution">Traces : projet <a href="https://kanjivg.tagaini.net" target="_blank" rel="noopener">KanjiVG</a> (CC BY-SA 3.0).</p>
      </div>
    </div>
  `;
}

// Version incrustee du trace anime (sans modale, sans bouton) : pensee
// pour un affichage direct des que la reponse est revelee (demande de
// Paul, 28/09/2026 : "les kanji affiches a la reponse doivent etre
// affiches directement en trace"). Meme rendu que htmlModalTraceKanji()
// (construireSvgTraceKanji + caracteresKanjiDistincts), mais sans le cadre
// modal -- et silencieuse (chaine vide) si aucun trace n'est disponible
// pour aucun caractere du mot, plutot que d'afficher un cadre vide.
function htmlTraceInline(mot, prefixeId) {
  const caracteres = caracteresKanjiDistincts(mot);
  const blocs = caracteres.map((kanji, i) => {
    const paths = tracesDisponibles(kanji);
    if (!paths) return '';
    return `<div class="trace-svg-wrap">${construireSvgTraceKanji(paths, `${prefixeId}-${i}`)}</div>`;
  }).filter(Boolean).join('');
  if (!blocs) return '';
  return `<div class="trace-blocs trace-blocs--inline">${blocs}</div>`;
}

// A appeler juste apres avoir pose le HTML de htmlTraceInline() dans le
// DOM : demarre (ou relance) la boucle d'animation de chaque SVG incruste
// portant ce prefixe d'id.
function animerTracesInline(prefixeId) {
  $$(`svg[id^="${prefixeId}-"]`).forEach(svg => animerTraceKanji(svg));
}

// rerender : fonction de la vue APPELANTE a relancer apres fermeture --
// ce modal s'ouvre depuis plusieurs vues (Kanji seul, Vocabulaire), donc
// pas de vue "propriétaire" fixe a rappeler en dur (contrairement aux
// autres modales du fichier qui n'ont qu'un seul point d'ouverture).
let _kvtTraceToucheHandler = null;
function wireModalTraceKanji(rerender) {
  if (_kvtTraceToucheHandler) {
    document.removeEventListener('keydown', _kvtTraceToucheHandler);
    _kvtTraceToucheHandler = null;
  }
  if (!modalTraceKanji) return;
  const fermer = () => { modalTraceKanji = null; modalTraceListe = null; rerender(); };
  const voisin = (delta) => { if (traceKanjiVoisin(delta)) rerender(); };
  const btnPrec = $('#btnTracePrec'), btnSuiv = $('#btnTraceSuiv');
  if (btnPrec) btnPrec.addEventListener('click', () => voisin(-1));
  if (btnSuiv) btnSuiv.addEventListener('click', () => voisin(1));
  if (modalTraceListe) {
    _kvtTraceToucheHandler = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); voisin(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); voisin(1); }
      else if (e.key === 'Escape') { fermer(); }
    };
    document.addEventListener('keydown', _kvtTraceToucheHandler);
  }
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

// Case de dessin du mode Ecriture (debut du point 2 du backlog envoye par
// Paul le 28/09/2026 : "possibilite d'ecrire le kanji dans une case...  a
// la souris, au doigt sur telephone, au stylet sur iPad"). Pointer Events
// couvre les trois entrees avec une seule API, pas besoin de brancher
// mouse/touch separement.
function activerDessinCanvas(canvas, session) {
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1a1a1a';
  let enTrain = false;
  let dernierX = 0;
  let dernierY = 0;

  function position(e) {
    const rect = canvas.getBoundingClientRect();
    const echelleX = canvas.width / rect.width;
    const echelleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * echelleX, y: (e.clientY - rect.top) * echelleY };
  }
  function debuter(e) {
    e.preventDefault();
    // setPointerCapture : le pointerup arrive sur CE canvas meme si le
    // geste se termine hors de ses limites (facile en tracant vite pres du
    // bord) -- sinon le trait resterait "colle" en mode dessin.
    canvas.setPointerCapture(e.pointerId);
    enTrain = true;
    const p = position(e);
    dernierX = p.x; dernierY = p.y;
    // Point simple des le contact (avant tout glisse) : sinon un tap sans
    // glisser ne laisserait aucune trace, contrairement a un vrai crayon.
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }
  function tracer(e) {
    if (!enTrain) return;
    e.preventDefault();
    const p = position(e);
    ctx.beginPath();
    ctx.moveTo(dernierX, dernierY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dernierX = p.x; dernierY = p.y;
  }
  function terminer() {
    if (!enTrain) return;
    enTrain = false;
    // Sauvegarde a la fin de chaque trait plutot qu'une seule fois a la
    // fin : reveler/mot suivant peuvent arriver a tout moment, on ne veut
    // jamais perdre un trait deja fini.
    session.dessinDataUrl = canvas.toDataURL();
  }

  canvas.addEventListener('pointerdown', debuter);
  canvas.addEventListener('pointermove', tracer);
  canvas.addEventListener('pointerup', terminer);
  canvas.addEventListener('pointercancel', terminer);
}

// Vue "Kanji seul" : séparée de renderReview() par choix (aucune branche
// supplémentaire ajoutée au quiz vocabulaire déjà testé), même esprit
// (saisie libre, correction par similarité, historique séparé).
function renderKanjiQuizView(container) {
  // Session terminée
  if (quizSession.index >= quizSession.queue.length) {
    const { points, maxPoints } = quizSession.totals;
    const dureeMs = dureeSessionMs(quizSession.totals);
    const pct = maxPoints > 0
      // Bug #19 (22/09/2026) : un score presque parfait (ex. 569/570)
      // arrondissait a 100%, ce qui donnait un faux sentiment de sans-faute.
      // 100% est reserve au score reellement parfait ; sinon on plafonne a 99%
      // meme si l'''arrondi mathematique donnerait 100.
      ? calculerPct(points, maxPoints)
      : 0;
    const prevEntry = getKanjiScoreEntry(quizSession.semesterId, quizSession.week);
    const prevBest = prevEntry ? prevEntry.best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    if (typeof celebrerProgressionSiBesoin === 'function') setTimeout(celebrerProgressionSiBesoin, 300);
    recordKanjiSessionResult(quizSession.semesterId, quizSession.week, points, maxPoints, pct, dureeMs);
    if (window.kvtHistorique && !quizSession.historiqueNote) { quizSession.historiqueNote = true; window.kvtHistorique.enregistrerHistoriqueSession(DB, quizSession, 'kanji', { pct, points, maxPoints, dureeMs, difficulte: difficulteDeSession(quizSession) }); }
    clearKanjiInProgress(quizSession.semesterId, quizSession.week);
    persist();
    // Classement de classe, mode 'kanji' (rang 5, #16) : meme principe que
    // le mode Vocabulaire de base -- toujours le record, jamais chaque
    // tentative.
    if (typeof window.kvtPushScore === 'function') {
      pousserMeilleurScore(getKanjiScoreEntry(quizSession.semesterId, quizSession.week), quizSession.semesterId, quizSession.week, 'kanji');
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
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${formatPct(prevBest)}</div>` : '');
    container.innerHTML = `
      <h2>Kanji seul — ${escapeHtml(semLabel)} Semaine ${quizSession.week}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${badge}
        <div class="kvt-result__pct">${formatPct(pct)}</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <button class="kvt-result__btn" type="button" id="btnBackKanjiReview">Retour au tableau de bord</button>
      </div>
    `;
    if (typeof ajouterClassementResultat === 'function') ajouterClassementResultat(container, 'kanji', quizSession.semesterId, quizSession.week);
    $('#btnBackKanjiReview').addEventListener('click', () => {
      quizSession = null;
      switchView('dashboard');
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
      <div class="quiz-actions-bas"><button class="secondary btn-recommencer-session" type="button">Recommencer</button><button class="secondary" id="btnQuitKanjiQuiz">Quitter la session</button></div>
    </div>
    ${htmlModalTraceKanji()}
  `;

  if (!quizSession.submitted) {
    const input = $('#answerInputKanji');
    input.focus();
    activerSaisieKanaDirecte(input, item.type === 'onyomi');
    const submit = () => {
      const val = finaliserKana(input.value, item.type === 'onyomi');
      { const refus = verifierSaisieJp(val);
        if (refus) { quizSession.warning = refus; renderReview(); return; } }
      quizSession.warning = null;
      const result = scoreLectureKanji(val, blocLectures);
      quizSession.submitted = true;
      quizSession.lastAnswer = val;
      quizSession.lastResult = result;
      quizSession.totals.points += result.points;
      noterActivite(quizSession.totals);
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
      modalTraceListe = null;
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
  const record = enrichirRecord({ date: new Date().toISOString(), points, maxPoints, pct, dureeMs });
  entry.history.push(record);
  if (!entry.best || comparerResultats(record, entry.best) > 0) entry.best = record;
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
    const { points, maxPoints } = quizSession.totals;
    const dureeMs = dureeSessionMs(quizSession.totals);
    const pct = maxPoints > 0
      // Bug #19 (22/09/2026) : un score presque parfait (ex. 569/570)
      // arrondissait a 100%, ce qui donnait un faux sentiment de sans-faute.
      // 100% est reserve au score reellement parfait ; sinon on plafonne a 99%
      // meme si l'''arrondi mathematique donnerait 100.
      ? calculerPct(points, maxPoints)
      : 0;
    const prevEntry = getKanaScoreEntry(quizSession.kanaType, quizSession.groupId);
    const prevBest = prevEntry ? prevEntry.best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    if (typeof celebrerProgressionSiBesoin === 'function') setTimeout(celebrerProgressionSiBesoin, 300);
    recordKanaSessionResult(quizSession.kanaType, quizSession.groupId, points, maxPoints, pct, dureeMs);
    clearKanaInProgress(quizSession.kanaType, quizSession.groupId);
    persist();
    if (typeof kvtSnapshotHistorique === 'function') kvtSnapshotHistorique();
    const groupLabel = (KANA_GROUPS.find(g => g.id === quizSession.groupId) || {}).label || '';
    const typeLabel = quizSession.kanaType === 'katakana' ? 'Katakana' : 'Hiragana';
    const etat = pct >= 100 ? 'perfect' : (pct >= 70 ? 'good' : 'low');
    const badge = improved
      ? `<div class="kvt-result__badge">Record — nouveau meilleur score</div>`
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${formatPct(prevBest)}</div>` : '');
    container.innerHTML = `
      <h2>${typeLabel} — ${escapeHtml(groupLabel)}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${badge}
        <div class="kvt-result__pct">${formatPct(pct)}</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <button class="kvt-result__btn" type="button" id="btnBackKanaReview">Retour au tableau de bord</button>
      </div>
    `;
    $('#btnBackKanaReview').addEventListener('click', () => {
      quizSession = null;
      switchView('dashboard');
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
      <div class="quiz-actions-bas"><button class="secondary btn-recommencer-session" type="button">Recommencer</button><button class="secondary" id="btnQuitKanaQuiz">Quitter la session</button></div>
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
      noterActivite(quizSession.totals);
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
    revealed: false,
    // PNG (toDataURL) de la case de dessin (voir activerDessinCanvas) --
    // necessaire car chaque reveler/mot suivant reconstruit tout le HTML
    // (innerHTML), ce qui recree un <canvas> vierge : on restaure ce PNG
    // dedans juste apres pour que le dessin survive au clic "Reveler".
    dessinDataUrl: null
  };
}

function renderEcritureQuizView(container) {
  if (quizSession.index >= quizSession.queue.length) {
    container.innerHTML = `
      <h2>Ecriture -- ${escapeHtml(getSemester(quizSession.semesterId).label)} Semaine ${quizSession.week}</h2>
      <div class="kvt-result kvt-result--good">
        <div class="kvt-result__title">Termine.</div>
        <div class="kvt-result__sub">${quizSession.queue.length} mot(s) ecrit(s). Pas de score sur ce mode -- l'auto-correction sur papier suffit.</div>
        <button class="kvt-result__btn" type="button" id="btnBackEcritureReview">Retour au tableau de bord</button>
      </div>
    `;
    $('#btnBackEcritureReview').addEventListener('click', () => {
      quizSession = null;
      switchView('dashboard');
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
      <div class="ecriture-zone">
        <div class="flashcard">
          <div class="front-word${quizSession.revealed ? ' front-word--ecriture-revele' : ''}">${escapeHtml(v.lecture)}</div>
          <div class="hint" style="margin-top:8px;">Ecris le kanji dans la case a droite (ou sur papier), puis revele pour verifier.</div>
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
            ${htmlTraceInline(v.mot, 'svgTraceEcritureInline')}
            ${v.sens ? `<div class="back-meaning">${escapeHtml(v.sens)}</div>` : ''}
          ` : ''}
        </div>
        <div class="ecriture-dessin">
          <div class="ecriture-dessin-titre">Ton tracé</div>
          <canvas id="canvasEcriture" class="canvas-ecriture" width="200" height="200"></canvas>
          <button class="secondary small" type="button" id="btnEffacerDessin">Effacer</button>
        </div>
      </div>
      ${!quizSession.revealed ? `
        <button class="primary" id="btnRevealEcriture" style="margin-top:18px;">Reveler la reponse</button>
      ` : `
        <button class="primary" id="btnNextEcriture" style="margin-top:18px;">Mot suivant</button>
      `}
      <button class="secondary" id="btnQuitEcritureQuiz" style="margin-top:12px;">Quitter la session</button>
    </div>
  `;

  // Case de dessin : toujours active (avant ET apres reveler, comme le
  // papier qu'elle remplace). Le PNG sauvegarde est restaure dedans a
  // chaque reconstruction du DOM -- voir le commentaire sur dessinDataUrl
  // dans startEcritureQuiz().
  const canvasDessin = $('#canvasEcriture');
  if (canvasDessin) {
    activerDessinCanvas(canvasDessin, quizSession);
    if (quizSession.dessinDataUrl) {
      const img = new Image();
      img.onload = () => canvasDessin.getContext('2d').drawImage(img, 0, 0);
      img.src = quizSession.dessinDataUrl;
    }
    $('#btnEffacerDessin').addEventListener('click', () => {
      canvasDessin.getContext('2d').clearRect(0, 0, canvasDessin.width, canvasDessin.height);
      quizSession.dessinDataUrl = null;
    });
  }

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
      quizSession.dessinDataUrl = null;
      renderReview();
    });
    // Trace incruste (htmlTraceInline ci-dessus) : demarre la boucle
    // d'animation des que le DOM de la reponse revelee existe. Plus besoin
    // du bouton "Voir le trace" ni de la modale -- affichage direct demande
    // par Paul le 28/09/2026.
    animerTracesInline('svgTraceEcritureInline');
  }

  $('#btnQuitEcritureQuiz').addEventListener('click', () => {
    quizSession = null;
    renderReview();
  });
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
  const record = enrichirRecord({ date: new Date().toISOString(), points, maxPoints, pct, dureeMs });
  entry.history.push(record);
  if (!entry.best || comparerResultats(record, entry.best) > 0) entry.best = record;
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

// Affichage du sens (francais) a traduire (04/10/2026, demande de Paul) :
// avant, "cohue, encombrement" etait rendu en 64px comme un kanji et les
// mots etaient coupes au milieu ("encombrem/ent"). Le sens est decoupe sur
// les virgules/points-virgules HORS parentheses, chaque definition prend sa
// ligne, et la taille de police suit la plus longue definition.
function decouperSens(sens) {
  const t = String(sens || '').trim();
  if (!t) return [];
  const parts = [];
  let prof = 0, cur = '';
  for (const c of t) {
    if (c === '(' || c === '\uff08') prof++;
    else if (c === ')' || c === '\uff09') prof = Math.max(0, prof - 1);
    if ((c === ',' || c === ';') && prof === 0) { parts.push(cur); cur = ''; }
    else cur += c;
  }
  parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean);
}
function classeTailleSens(parts) {
  const max = parts.reduce((m, p) => Math.max(m, Array.from(p).length), 0);
  if (max > 40) return 'sens-trad--tres-long';
  if (max > 22) return 'sens-trad--long';
  return '';
}
function htmlSensTraduction(sens) {
  const parts = decouperSens(sens);
  if (!parts.length) return '<div class="sens-trad"><div class="sens-trad-ligne">(sens manquant)</div></div>';
  return `<div class="sens-trad ${classeTailleSens(parts)}" lang="fr">${parts.map(p => `<div class="sens-trad-ligne">${escapeHtml(p)}</div>`).join('')}</div>`;
}

function renderTraductionQuizView(container) {
  if (quizSession.index >= quizSession.queue.length) {
    const { points, maxPoints } = quizSession.totals;
    const dureeMs = dureeSessionMs(quizSession.totals);
    const pct = maxPoints > 0
      // Bug #19 (22/09/2026) : un score presque parfait (ex. 569/570)
      // arrondissait a 100%, ce qui donnait un faux sentiment de sans-faute.
      // 100% est reserve au score reellement parfait ; sinon on plafonne a 99%
      // meme si l'''arrondi mathematique donnerait 100.
      ? calculerPct(points, maxPoints)
      : 0;
    const prevEntry = getTraductionScoreEntry(quizSession.semesterId, quizSession.week);
    const prevBest = prevEntry ? prevEntry.best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    if (typeof celebrerProgressionSiBesoin === 'function') setTimeout(celebrerProgressionSiBesoin, 300);
    recordTraductionSessionResult(quizSession.semesterId, quizSession.week, points, maxPoints, pct, dureeMs);
    if (window.kvtHistorique && !quizSession.historiqueNote) { quizSession.historiqueNote = true; window.kvtHistorique.enregistrerHistoriqueSession(DB, quizSession, 'traduction', { pct, points, maxPoints, dureeMs, difficulte: difficulteDeSession(quizSession) }); }
    clearTraductionInProgress(quizSession.semesterId, quizSession.week);
    persist();
    // Classement de classe, mode 'traduction' (rang 5, #16).
    if (typeof window.kvtPushScore === 'function') {
      pousserMeilleurScore(getTraductionScoreEntry(quizSession.semesterId, quizSession.week), quizSession.semesterId, quizSession.week, 'traduction');
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
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${formatPct(prevBest)}</div>` : '');
    container.innerHTML = `
      <h2>Traduction -- ${escapeHtml(semLabel)} Semaine ${quizSession.week}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${badge}
        <div class="kvt-result__pct">${formatPct(pct)}</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <button class="kvt-result__btn" type="button" id="btnBackTraductionReview">Retour au tableau de bord</button>
      </div>
    `;
    if (typeof ajouterClassementResultat === 'function') ajouterClassementResultat(container, 'traduction', quizSession.semesterId, quizSession.week);
    $('#btnBackTraductionReview').addEventListener('click', () => {
      quizSession = null;
      switchView('dashboard');
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
        ${htmlSensTraduction(v.sens)}${indiceQuestionHtml(v)}
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
      <div class="quiz-actions-bas"><button class="secondary btn-recommencer-session" type="button">Recommencer</button><button class="secondary" id="btnQuitTraductionQuiz">Quitter la session</button></div>
    </div>
  `;

  if (!quizSession.submitted) {
    const input = $('#answerInputTraduction');
    input.focus();
    // Saisie romaji -> hiragana comme dans les autres modes (oubli signale
    // le 28/09/2026). Les kanji restent acceptes : un IME systeme actif
    // n'est pas touche pendant la composition (voir activerSaisieKanaDirecte).
    activerSaisieKanaDirecte(input, false);
    const submit = () => {
      const val = finaliserKana(input.value, false);
      { const refus = verifierSaisieJp(val);
        if (refus) { quizSession.warning = refus; renderReview(); return; } }
      quizSession.warning = null;
      const result = scoreTraductionAnswer(val, v);
      quizSession.submitted = true;
      quizSession.lastAnswer = val;
      quizSession.lastResult = result;
      quizSession.totals.points += result.points;
      noterActivite(quizSession.totals);
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
  const record = enrichirRecord({ date: new Date().toISOString(), points, maxPoints, pct, dureeMs });
  entry.history.push(record);
  if (!entry.best || comparerResultats(record, entry.best) > 0) entry.best = record;
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
    const { points, maxPoints } = quizSession.totals;
    const dureeMs = dureeSessionMs(quizSession.totals);
    const pct = maxPoints > 0
      ? calculerPct(points, maxPoints)
      : 0;
    const prevEntry = getDoubleScoreEntry(quizSession.semesterId, quizSession.week);
    const prevBest = prevEntry ? prevEntry.best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    if (typeof celebrerProgressionSiBesoin === 'function') setTimeout(celebrerProgressionSiBesoin, 300);
    recordDoubleSessionResult(quizSession.semesterId, quizSession.week, points, maxPoints, pct, dureeMs);
    if (window.kvtHistorique && !quizSession.historiqueNote) { quizSession.historiqueNote = true; window.kvtHistorique.enregistrerHistoriqueSession(DB, quizSession, 'double', { pct, points, maxPoints, dureeMs, difficulte: difficulteDeSession(quizSession) }); }
    clearDoubleInProgress(quizSession.semesterId, quizSession.week);
    persist();
    // Classement de classe, mode 'double' (rang 5, #16).
    if (typeof window.kvtPushScore === 'function') {
      pousserMeilleurScore(getDoubleScoreEntry(quizSession.semesterId, quizSession.week), quizSession.semesterId, quizSession.week, 'double');
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
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${formatPct(prevBest)}</div>` : '');
    container.innerHTML = `
      <h2>Double réponse -- ${escapeHtml(semLabel)} Semaine ${quizSession.week}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${badge}
        <div class="kvt-result__pct">${formatPct(pct)}</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <button class="kvt-result__btn" type="button" id="btnBackDoubleReview">Retour au tableau de bord</button>
      </div>
    `;
    if (typeof ajouterClassementResultat === 'function') ajouterClassementResultat(container, 'double', quizSession.semesterId, quizSession.week);
    $('#btnBackDoubleReview').addEventListener('click', () => {
      quizSession = null;
      switchView('dashboard');
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
        <div class="front-word${classeTailleMot(v.mot)}">${escapeHtml(v.mot)}</div>${indiceQuestionHtml(v)}
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
      <div class="quiz-actions-bas"><button class="secondary btn-recommencer-session" type="button">Recommencer</button><button class="secondary" id="btnQuitDoubleQuiz">Quitter la session</button></div>
    </div>
  `;

  if (!quizSession.submitted) {
    const inputLecture = $('#answerInputDoubleLecture');
    const inputSens = $('#answerInputDoubleSens');
    inputLecture.focus();
    activerSaisieKanaDirecte(inputLecture, false);
    const submit = () => {
      const valLecture = finaliserKana(inputLecture.value, false);
      const valSens = inputSens.value;
      if (!valLecture.trim() && !valSens.trim()) { quizSession.warning = 'Écris une réponse avant de valider.'; renderReview(); return; }
      if (aDesLettresLatines(valLecture)) { quizSession.warning = "Ta lecture contient des lettres latines qui n'ont pas pu être converties en kana. Corrige-la."; renderReview(); return; }
      quizSession.warning = null;
      const result = scoreDoubleAnswer(valLecture, valSens, v);
      quizSession.submitted = true;
      quizSession.lastAnswer = { lecture: valLecture, sens: valSens };
      quizSession.lastResult = result;
      quizSession.totals.points += result.points;
      noterActivite(quizSession.totals);
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
  { id: 'compteurs', label: 'Compteurs 1' },
  { id: 'compteurs2', label: 'Compteurs 2' },
  { id: 'couleurs', label: 'Couleurs' },
  { id: 'heure', label: 'Heure' }
];
const PRATIQUE_VOCAB = [{"id":"pr-compteurs-01","theme":"compteurs","mot":"一つ","lecture":"ひとつ","sens":"un (objet, generique)","note":"Série « objets en général » : ひとつ, ふたつ, みっつ… (lectures japonaises). Elle sert quand on ne connaît pas le bon compteur, mais seulement de 1 à 10."},{"id":"pr-compteurs-02","theme":"compteurs","mot":"二つ","lecture":"ふたつ","sens":"deux (objets, generique)"},{"id":"pr-compteurs-03","theme":"compteurs","mot":"三つ","lecture":"みっつ","sens":"trois (objets, generique)"},{"id":"pr-compteurs-04","theme":"compteurs","mot":"四つ","lecture":"よっつ","sens":"quatre (objets, generique)"},{"id":"pr-compteurs-05","theme":"compteurs","mot":"五つ","lecture":"いつつ","sens":"cinq (objets, generique)"},{"id":"pr-compteurs-06","theme":"compteurs","mot":"六つ","lecture":"むっつ","sens":"six (objets, generique)"},{"id":"pr-compteurs-07","theme":"compteurs","mot":"七つ","lecture":"ななつ","sens":"sept (objets, generique)"},{"id":"pr-compteurs-08","theme":"compteurs","mot":"八つ","lecture":"やっつ","sens":"huit (objets, generique)"},{"id":"pr-compteurs-09","theme":"compteurs","mot":"九つ","lecture":"ここのつ","sens":"neuf (objets, generique)","note":"9 se lit ここの (pas きゅう) devant つ : ここのつ."},{"id":"pr-compteurs-10","theme":"compteurs","mot":"十","lecture":"とお","sens":"dix (objets, generique)","note":"Exception : 10 se lit とお tout seul (pas とおつ). À partir de 11, on passe aux compteurs avec les nombres chinois (十一個…)."},{"id":"pr-compteurs-11","theme":"compteurs","mot":"一人","lecture":"ひとり","sens":"une personne","note":"人 : exceptions pour 1 et 2 personnes → ひとり, ふたり. À partir de 3 : 〜にん (さんにん, よにん, ごにん…)."},{"id":"pr-compteurs-12","theme":"compteurs","mot":"二人","lecture":"ふたり","sens":"deux personnes","note":"Exception : ふたり (pas ににん). Avec 一人 (ひとり), ce sont les deux seuls cas irréguliers."},{"id":"pr-compteurs-13","theme":"compteurs","mot":"三人","lecture":"さんにん","sens":"trois personnes","note":"À partir de 3, on revient au régulier : さんにん."},{"id":"pr-compteurs-14","theme":"compteurs","mot":"四人","lecture":"よにん","sens":"quatre personnes","note":"4 se lit よ (pas し ni よん) devant にん : よにん."},{"id":"pr-compteurs-15","theme":"compteurs","mot":"五人","lecture":"ごにん","sens":"cinq personnes","note":"Régulier : ごにん."},{"id":"pr-compteurs-16","theme":"compteurs","mot":"何人","lecture":"なんにん","sens":"combien de personnes","note":"何 se lit なん devant にん : なんにん."},{"id":"pr-compteurs-17","theme":"compteurs","mot":"一本","lecture":"いっぽん","sens":"un (objet long/cylindrique)","note":"本 : objets longs et fins (stylo, bouteille, arbre, parapluie). 1 → いっぽん, 6 → ろっぽん, 8 → はっぽん, 10 → じゅっぽん ; 3 et 何 → ぼん (さんぼん, なんぼん) ; 2, 4, 5, 7, 9 → ほん."},{"id":"pr-compteurs-18","theme":"compteurs","mot":"二本","lecture":"にほん","sens":"deux (objets longs)","note":"2 : régulier, ほん (にほん)."},{"id":"pr-compteurs-19","theme":"compteurs","mot":"三本","lecture":"さんぼん","sens":"trois (objets longs)","note":"Après さん, ほん devient ぼん : さんぼん (comme なんぼん)."},{"id":"pr-compteurs-20","theme":"compteurs","mot":"一枚","lecture":"いちまい","sens":"un (objet plat/feuille)","note":"枚 : objets plats et fins (feuille, billet, chemise, assiette, ticket). Toujours まい, aucune irrégularité."},{"id":"pr-compteurs-21","theme":"compteurs","mot":"二枚","lecture":"にまい","sens":"deux (objets plats)"},{"id":"pr-compteurs-22","theme":"compteurs","mot":"三枚","lecture":"さんまい","sens":"trois (objets plats)"},{"id":"pr-compteurs-23","theme":"compteurs","mot":"一匹","lecture":"いっぴき","sens":"un (petit animal)","note":"匹 : petits animaux (chat, chien, poisson, insecte). 1 → いっぴき, 6 → ろっぴき, 8 → はっぴき, 10 → じゅっぴき ; 3 et 何 → びき ; autres → ひき."},{"id":"pr-compteurs-24","theme":"compteurs","mot":"二匹","lecture":"にひき","sens":"deux (petits animaux)","note":"2 : régulier, ひき (にひき)."},{"id":"pr-compteurs-25","theme":"compteurs","mot":"三匹","lecture":"さんびき","sens":"trois (petits animaux)","note":"Après さん, ひき devient びき : さんびき (comme なんびき)."},{"id":"pr-compteurs-26","theme":"compteurs","mot":"一冊","lecture":"いっさつ","sens":"un (livre/cahier)","note":"冊 : livres, cahiers, magazines. 1 → いっさつ, 8 → はっさつ, 10 → じゅっさつ ; les autres sont réguliers (にさつ, さんさつ…)."},{"id":"pr-compteurs-27","theme":"compteurs","mot":"二冊","lecture":"にさつ","sens":"deux (livres/cahiers)","note":"2 : régulier, さつ (にさつ)."},{"id":"pr-compteurs-28","theme":"compteurs","mot":"一台","lecture":"いちだい","sens":"un (vehicule/machine)","note":"台 : machines et véhicules (voiture, ordinateur, vélo, télé). Régulier : いちだい, にだい, さんだい…"},{"id":"pr-compteurs-29","theme":"compteurs","mot":"二台","lecture":"にだい","sens":"deux (vehicules/machines)"},{"id":"pr-compteurs-30","theme":"compteurs","mot":"一階","lecture":"いっかい","sens":"premier etage / rez-de-chaussee","note":"階 : étages. 1 → いっかい, 6 → ろっかい, 8 → はっかい, 10 → じゅっかい ; 3 et 何 → がい (さんがい, なんがい). À l'oral, 一階 sonne comme 一回 (une fois)."},{"id":"pr-compteurs-31","theme":"compteurs","mot":"二階","lecture":"にかい","sens":"deuxieme etage","note":"2 : régulier, かい (にかい)."},{"id":"pr-compteurs-32","theme":"compteurs","mot":"三階","lecture":"さんがい","sens":"troisieme etage","note":"Après さん, かい devient がい : さんがい (comme なんがい)."},{"id":"pr-compteurs-33","theme":"compteurs","mot":"何階","lecture":"なんがい","sens":"quel etage","note":"何階 se lit なんがい (voisé), alors que 何回 (combien de fois) se lit なんかい."},{"id":"pr-compteurs-34","theme":"compteurs","mot":"一回","lecture":"いっかい","sens":"une fois","note":"回 : nombre de fois. 1 → いっかい, 6 → ろっかい, 8 → はっかい, 10 → じゅっかい. Contrairement à 階, pas de voisement : さんかい, なんかい."},{"id":"pr-compteurs-35","theme":"compteurs","mot":"二回","lecture":"にかい","sens":"deux fois","note":"2 : régulier, かい (にかい)."},{"id":"pr-compteurs-36","theme":"compteurs","mot":"何回","lecture":"なんかい","sens":"combien de fois","note":"Pas de voisement ici : なんかい (≠ なんがい pour les étages)."},{"id":"pr-compteurs-37","theme":"compteurs","mot":"一歳","lecture":"いっさい","sens":"un an (age)","note":"歳 : âge. 1 → いっさい, 8 → はっさい, 10 → じゅっさい ; les autres sont réguliers (にさい, さんさい…). Exception : 20 ans = はたち."},{"id":"pr-compteurs-38","theme":"compteurs","mot":"二十歳","lecture":"はたち","sens":"vingt ans","note":"Exception : 20 ans se dit はたち (pas にじゅっさい). À retenir par cœur : c'est aussi l'âge de la majorité."},{"id":"pr-compteurs-39","theme":"compteurs","mot":"何歳","lecture":"なんさい","sens":"quel age","note":"何 + さい : なんさい (« quel âge ? »). Plus poli : おいくつ."},{"id":"pr-compteurs-40","theme":"compteurs","mot":"一個","lecture":"いっこ","sens":"un (objet rond/compact)","note":"個 : objets ronds ou compacts (œuf, orange, pomme, gomme). 1 → いっこ, 6 → ろっこ, 8 → はっこ, 10 → じゅっこ (ou じっこ) ; les autres sont réguliers (にこ, さんこ…)."},{"id":"pr-compteurs-41","theme":"compteurs","mot":"二個","lecture":"にこ","sens":"deux (objets ronds/compacts)","note":"2 : régulier, こ (にこ)."},{"id":"pr-compteurs-42","theme":"compteurs","mot":"三個","lecture":"さんこ","sens":"trois (objets ronds/compacts)","note":"3 : régulier, pas de changement de son (さんこ)."},{"id":"pr-compteurs-43","theme":"compteurs","mot":"六個","lecture":"ろっこ","sens":"six (objets ronds/compacts)","note":"6 → ろっこ : le く de ろく tombe et le こ est précédé d'un petit っ."},{"id":"pr-compteurs-44","theme":"compteurs","mot":"八個","lecture":"はっこ","sens":"huit (objets ronds/compacts)","note":"8 → はっこ : はち devient はっ devant こ."},{"id":"pr-compteurs-45","theme":"compteurs","mot":"十個","lecture":"じゅっこ","sens":"dix (objets ronds/compacts)","note":"10 → じゅっこ (じっこ est aussi accepté à l'oral). Même mécanisme que pour 本, 冊, 回…"},{"id":"pr-compteurs-46","theme":"compteurs","mot":"何個","lecture":"なんこ","sens":"combien (objets ronds/compacts)","note":"何 + こ : なんこ, pas de voisement."},{"id":"pr-compteurs-52","theme":"compteurs","mot":"一羽","lecture":"いちわ","sens":"un (oiseau / lapin)","note":"羽 : oiseaux (et, par tradition, lapins). Il se lit わ, ば ou ぱ selon le chiffre. 1 → いちわ, 2 → にわ, 3 → さんば, 6 → ろっぱ, 10 → じゅっぱ."},{"id":"pr-compteurs-53","theme":"compteurs","mot":"三羽","lecture":"さんば","sens":"trois (oiseaux)","note":"Après さん, わ devient ば : さんば (comme なんば)."},{"id":"pr-compteurs-54","theme":"compteurs","mot":"六羽","lecture":"ろっぱ","sens":"six (oiseaux)","note":"6 → ろっぱ : le わ devient ぱ après le petit っ."},{"id":"pr-compteurs-55","theme":"compteurs","mot":"十羽","lecture":"じゅっぱ","sens":"dix (oiseaux)","note":"10 → じゅっぱ (じっぱ aussi). Même schéma que 六羽."},{"id":"pr-compteurs-56","theme":"compteurs","mot":"何羽","lecture":"なんば","sens":"combien (oiseaux)","note":"何 + 羽 : なんば (ば, comme pour 3)."},{"id":"pr-compteurs-58","theme":"compteurs","mot":"一頭","lecture":"いっとう","sens":"un (grand animal)","note":"頭 : grands animaux (cheval, vache, éléphant). 1 → いっとう, 8 → はっとう, 10 → じゅっとう ; les autres sont réguliers (にとう, さんとう…)."},{"id":"pr-compteurs-59","theme":"compteurs","mot":"三頭","lecture":"さんとう","sens":"trois (grands animaux)","note":"3 : régulier, pas de voisement (さんとう)."},{"id":"pr-compteurs-60","theme":"compteurs","mot":"十頭","lecture":"じゅっとう","sens":"dix (grands animaux)","note":"10 → じゅっとう (じっとう aussi)."},{"id":"pr-compteurs-61","theme":"compteurs","mot":"何頭","lecture":"なんとう","sens":"combien (grands animaux)","note":"何 + 頭 : なんとう. Attention : 頭 tout seul = あたま (tête), mais comme compteur on lit トウ."},{"id":"pr-compteurs-62","theme":"compteurs","mot":"一名","lecture":"いちめい","sens":"une personne (formel)","note":"名 : compter les personnes de façon formelle (réservations, annonces, rapports). Totalement régulier : いちめい, にめい, さんめい… Pas d'exception comme ひとり/ふたり avec 人."},{"id":"pr-compteurs-63","theme":"compteurs","mot":"二名","lecture":"にめい","sens":"deux personnes (formel)","note":"Régulier : にめい (≠ ふたり)."},{"id":"pr-compteurs-64","theme":"compteurs","mot":"十名","lecture":"じゅうめい","sens":"dix personnes (formel)","note":"10 : じゅうめい, pas de petit っ devant め."},{"id":"pr-compteurs-65","theme":"compteurs","mot":"何名","lecture":"なんめい","sens":"combien de personnes (formel)","note":"Au restaurant : 何名様ですか ? = « Vous êtes combien ? »."},{"id":"pr-compteurs-66","theme":"compteurs","mot":"数名","lecture":"すうめい","sens":"quelques personnes (formel)","note":"数 (すう) = quelques, plusieurs."},{"id":"pr-compteurs-67","theme":"compteurs2","mot":"一度","lecture":"いちど","sens":"une fois / un degré","note":"度 : fois (plus soutenu que 回) et degrés (température, angle). Régulier : いちど, にど, さんど…"},{"id":"pr-compteurs-68","theme":"compteurs2","mot":"二度","lecture":"にど","sens":"deux fois / deux degrés","note":"Régulier : にど."},{"id":"pr-compteurs-69","theme":"compteurs2","mot":"何度","lecture":"なんど","sens":"combien de fois / combien de degrés","note":"何度ですか ? peut demander une température ou un nombre de fois selon le contexte."},{"id":"pr-compteurs-70","theme":"compteurs2","mot":"三十度","lecture":"さんじゅうど","sens":"trente degrés","note":"Pour une température ou un angle, 度 se place juste après le nombre : 三十度."},{"id":"pr-compteurs-71","theme":"compteurs2","mot":"三十八度","lecture":"さんじゅうはちど","sens":"trente-huit degrés","note":"38 : さんじゅうはち, puis ど sans changement (38 °C = fièvre)."},{"id":"pr-compteurs-72","theme":"compteurs2","mot":"一番","lecture":"いちばん","sens":"numéro un / le plus","note":"番 : ordre, numéro. Se lit toujours ばん (jamais はん). 一番 = n°1, mais aussi « le plus » : 一番好き = « j'aime le plus »."},{"id":"pr-compteurs-73","theme":"compteurs2","mot":"二番","lecture":"にばん","sens":"numéro deux","note":"Régulier : にばん."},{"id":"pr-compteurs-74","theme":"compteurs2","mot":"三番","lecture":"さんばん","sens":"numéro trois","note":"Régulier : さんばん."},{"id":"pr-compteurs-75","theme":"compteurs2","mot":"四番","lecture":"よんばん","sens":"numéro quatre","note":"Ici 4 se lit よん (pas し) : よんばん."},{"id":"pr-compteurs-76","theme":"compteurs2","mot":"何番","lecture":"なんばん","sens":"quel numéro","note":"何番ですか ? = « C'est quel numéro ? »."},{"id":"pr-compteurs-77","theme":"compteurs2","mot":"一番線","lecture":"いちばんせん","sens":"voie / quai n°1","note":"線 (セン) : ligne, voie ferrée. 〜番線 = numéro de voie ou de quai dans une gare : 1 + 番 = いちばん, puis せん."},{"id":"pr-compteurs-78","theme":"compteurs2","mot":"三番線","lecture":"さんばんせん","sens":"voie / quai n°3","note":"Régulier : さんばんせん."},{"id":"pr-compteurs-79","theme":"compteurs2","mot":"何番線","lecture":"なんばんせん","sens":"quelle voie / quel quai","note":"何番線ですか ? = « C'est quel quai ? »."},{"id":"pr-compteurs-82","theme":"compteurs2","mot":"一期","lecture":"いっき","sens":"première période / 1er terme","note":"期 : période, terme, semestre. 1 → いっき, 6 → ろっき, 8 → はっき, 10 → じゅっき ; les autres sont réguliers (にき, さんき…)."},{"id":"pr-compteurs-83","theme":"compteurs2","mot":"二期","lecture":"にき","sens":"deuxième période / 2e terme","note":"Régulier : にき."},{"id":"pr-compteurs-87","theme":"compteurs2","mot":"一代","lecture":"いちだい","sens":"une génération","note":"代 : génération, époque, et aussi « frais/coût ». Régulier : いちだい, にだい, さんだい… (一代 = « de son vivant »)."},{"id":"pr-compteurs-88","theme":"compteurs2","mot":"三代","lecture":"さんだい","sens":"trois générations","note":"Régulier : さんだい (3 générations de la même famille)."},{"id":"pr-compteurs-89","theme":"compteurs2","mot":"二十代","lecture":"にじゅうだい","sens":"la vingtaine (20-29 ans)","note":"二十代 = les 20-29 ans (aussi : la 20e génération). Notez 二十 = にじゅう (pas はたち ici). 十代 = les adolescents."},{"id":"pr-compteurs-93","theme":"compteurs2","mot":"一町","lecture":"いっちょう","sens":"un chō (≈ 109 m)","note":"町 : ancienne unité de distance japonaise (1 町 ≈ 109 m). Lecture ちょう ; 1 → いっちょう (petit っ). Elle ne s'utilise plus guère qu'en lecture historique."},{"id":"pr-compteurs-94","theme":"compteurs2","mot":"二町","lecture":"にちょう","sens":"deux chō (≈ 218 m)","note":"Régulier : にちょう."},{"id":"pr-compteurs-95","theme":"compteurs2","mot":"三町","lecture":"さんちょう","sens":"trois chō (≈ 327 m)","note":"Régulier : さんちょう."},{"id":"pr-compteurs-96","theme":"compteurs2","mot":"一杯","lecture":"いっぱい","sens":"un verre / une tasse (ou « plein »)","note":"杯 : contenants (verre, tasse, bol, cuillerée). 1 → いっぱい, 6 → ろっぱい, 8 → はっぱい, 10 → じゅっぱい ; 3 et 何 → ばい ; autres → はい. 一杯 veut aussi dire « plein » (お腹が一杯 = j'ai le ventre plein)."},{"id":"pr-compteurs-97","theme":"compteurs2","mot":"二杯","lecture":"にはい","sens":"deux verres / tasses","note":"2 : régulier, はい (にはい)."},{"id":"pr-compteurs-98","theme":"compteurs2","mot":"三杯","lecture":"さんばい","sens":"trois verres / tasses","note":"Après さん, はい devient ばい : さんばい (comme なんばい)."},{"id":"pr-compteurs-99","theme":"compteurs2","mot":"六杯","lecture":"ろっぱい","sens":"six verres / tasses","note":"6 → ろっぱい : petit っ et はい devient ぱい."},{"id":"pr-compteurs-100","theme":"compteurs2","mot":"十杯","lecture":"じゅっぱい","sens":"dix verres / tasses","note":"10 → じゅっぱい (じっぱい aussi)."},{"id":"pr-compteurs-101","theme":"compteurs2","mot":"何杯","lecture":"なんばい","sens":"combien de verres / tasses","note":"何 + 杯 : なんばい (ば, comme pour 3)."},{"id":"pr-compteurs-103","theme":"compteurs2","mot":"一点","lecture":"いってん","sens":"un point","note":"点 : points et notes (sport, examens). 1 → いってん, 8 → はってん, 10 → じゅってん ; les autres sont réguliers (にてん, さんてん…)."},{"id":"pr-compteurs-104","theme":"compteurs2","mot":"三点","lecture":"さんてん","sens":"trois points","note":"Régulier : さんてん (pas de voisement avec てん)."},{"id":"pr-compteurs-105","theme":"compteurs2","mot":"十点","lecture":"じゅってん","sens":"dix points","note":"10 → じゅってん (じってん aussi)."},{"id":"pr-compteurs-106","theme":"compteurs2","mot":"何点","lecture":"なんてん","sens":"combien de points / quelle note","note":"何点でしたか ? = « Tu as eu combien ? »."},{"id":"pr-compteurs-108","theme":"compteurs2","mot":"百点","lecture":"ひゃくてん","sens":"cent points / 100 sur 100","note":"100 点 est la note maximale classique d'un examen au Japon : ひゃくてん (pas de changement avec てん)."},{"id":"pr-compteurs-109","theme":"compteurs2","mot":"一号","lecture":"いちごう","sens":"n°1","note":"号 : numéro (chambre, numéro d'un magazine, typhon n°…). Régulier : いちごう, にごう, さんごう…"},{"id":"pr-compteurs-110","theme":"compteurs2","mot":"三号","lecture":"さんごう","sens":"n°3","note":"Régulier : さんごう."},{"id":"pr-compteurs-111","theme":"compteurs2","mot":"何号","lecture":"なんごう","sens":"quel numéro","note":"何号室 = « Quelle chambre ? »."},{"id":"pr-compteurs-112","theme":"compteurs2","mot":"二百一号室","lecture":"にひゃくいちごうしつ","sens":"chambre 201","note":"号室 : numéro de chambre (室 = pièce, しつ). 201 = 二百一. Attention aux centaines : 300 = さんびゃく, 600 = ろっぴゃく, 800 = はっぴゃく."},{"id":"pr-compteurs-113","theme":"compteurs2","mot":"三期","lecture":"さんき","sens":"troisième période / 3e terme","note":"Régulier : さんき (pas de changement de son)."},{"id":"pr-compteurs-114","theme":"compteurs2","mot":"六期","lecture":"ろっき","sens":"sixième période / 6e terme","note":"6 → ろっき : le く de ろく tombe et on double le き."},{"id":"pr-compteurs-115","theme":"compteurs2","mot":"十代","lecture":"じゅうだい","sens":"les 10-19 ans / dixième génération","note":"十代 = les adolescents (10-19 ans) ; aussi la 10e génération. Même schéma que 二十代 (la vingtaine)."},{"id":"pr-compteurs-116","theme":"compteurs2","mot":"何代","lecture":"なんだい","sens":"quelle génération / combien de générations","note":"何 + 代 : なんだい, pas de changement de son."},{"id":"pr-couleurs-01","theme":"couleurs","mot":"赤","lecture":"あか","sens":"rouge"},{"id":"pr-couleurs-02","theme":"couleurs","mot":"青","lecture":"あお","sens":"bleu"},{"id":"pr-couleurs-03","theme":"couleurs","mot":"黄色","lecture":"きいろ","sens":"jaune"},{"id":"pr-couleurs-04","theme":"couleurs","mot":"白","lecture":"しろ","sens":"blanc"},{"id":"pr-couleurs-05","theme":"couleurs","mot":"黒","lecture":"くろ","sens":"noir"},{"id":"pr-couleurs-06","theme":"couleurs","mot":"緑","lecture":"みどり","sens":"vert"},{"id":"pr-couleurs-07","theme":"couleurs","mot":"茶色","lecture":"ちゃいろ","sens":"marron"},{"id":"pr-couleurs-08","theme":"couleurs","mot":"紫","lecture":"むらさき","sens":"violet"},{"id":"pr-couleurs-09","theme":"couleurs","mot":"灰色","lecture":"はいいろ","sens":"gris"},{"id":"pr-couleurs-10","theme":"couleurs","mot":"オレンジ","lecture":"おれんじ","sens":"orange"},{"id":"pr-couleurs-11","theme":"couleurs","mot":"ピンク","lecture":"ぴんく","sens":"rose"},{"id":"pr-couleurs-12","theme":"couleurs","mot":"金色","lecture":"きんいろ","sens":"dore"},{"id":"pr-couleurs-13","theme":"couleurs","mot":"銀色","lecture":"ぎんいろ","sens":"argente"},{"id":"pr-couleurs-14","theme":"couleurs","mot":"赤い","lecture":"あかい","sens":"rouge (adjectif)"},{"id":"pr-couleurs-15","theme":"couleurs","mot":"青い","lecture":"あおい","sens":"bleu (adjectif)"},{"id":"pr-couleurs-16","theme":"couleurs","mot":"黄色い","lecture":"きいろい","sens":"jaune (adjectif)"},{"id":"pr-couleurs-17","theme":"couleurs","mot":"白い","lecture":"しろい","sens":"blanc (adjectif)"},{"id":"pr-couleurs-18","theme":"couleurs","mot":"黒い","lecture":"くろい","sens":"noir (adjectif)"},{"id":"pr-couleurs-19","theme":"couleurs","mot":"茶色い","lecture":"ちゃいろい","sens":"marron (adjectif)"},{"id":"pr-couleurs-20","theme":"couleurs","mot":"何色","lecture":"なにいろ","sens":"quelle couleur"},{"id":"pr-heure-01","theme":"heure","mot":"時","lecture":"じ","sens":"heure (compteur)"},{"id":"pr-heure-02","theme":"heure","mot":"一時","lecture":"いちじ","sens":"1 heure"},{"id":"pr-heure-03","theme":"heure","mot":"二時","lecture":"にじ","sens":"2 heures"},{"id":"pr-heure-04","theme":"heure","mot":"三時","lecture":"さんじ","sens":"3 heures"},{"id":"pr-heure-05","theme":"heure","mot":"四時","lecture":"よじ","sens":"4 heures"},{"id":"pr-heure-06","theme":"heure","mot":"五時","lecture":"ごじ","sens":"5 heures"},{"id":"pr-heure-07","theme":"heure","mot":"六時","lecture":"ろくじ","sens":"6 heures"},{"id":"pr-heure-08","theme":"heure","mot":"七時","lecture":"しちじ","sens":"7 heures"},{"id":"pr-heure-09","theme":"heure","mot":"八時","lecture":"はちじ","sens":"8 heures"},{"id":"pr-heure-10","theme":"heure","mot":"九時","lecture":"くじ","sens":"9 heures"},{"id":"pr-heure-11","theme":"heure","mot":"十時","lecture":"じゅうじ","sens":"10 heures"},{"id":"pr-heure-12","theme":"heure","mot":"十一時","lecture":"じゅういちじ","sens":"11 heures"},{"id":"pr-heure-13","theme":"heure","mot":"十二時","lecture":"じゅうにじ","sens":"12 heures"},{"id":"pr-heure-14","theme":"heure","mot":"何時","lecture":"なんじ","sens":"quelle heure"},{"id":"pr-heure-15","theme":"heure","mot":"分","lecture":"ふん","sens":"minute (compteur)"},{"id":"pr-heure-16","theme":"heure","mot":"一分","lecture":"いっぷん","sens":"1 minute"},{"id":"pr-heure-17","theme":"heure","mot":"二分","lecture":"にふん","sens":"2 minutes"},{"id":"pr-heure-18","theme":"heure","mot":"三分","lecture":"さんぷん","sens":"3 minutes"},{"id":"pr-heure-19","theme":"heure","mot":"五分","lecture":"ごふん","sens":"5 minutes"},{"id":"pr-heure-20","theme":"heure","mot":"十分","lecture":"じゅっぷん","sens":"10 minutes"},{"id":"pr-heure-21","theme":"heure","mot":"半","lecture":"はん","sens":"et demie"},{"id":"pr-heure-22","theme":"heure","mot":"午前","lecture":"ごぜん","sens":"matin (avant midi, AM)"},{"id":"pr-heure-23","theme":"heure","mot":"午後","lecture":"ごご","sens":"apres-midi (apres midi, PM)"},{"id":"pr-heure-24","theme":"heure","mot":"朝","lecture":"あさ","sens":"matin"},{"id":"pr-heure-25","theme":"heure","mot":"昼","lecture":"ひる","sens":"midi / journee"},{"id":"pr-heure-26","theme":"heure","mot":"夜","lecture":"よる","sens":"soir / nuit"},{"id":"pr-heure-27","theme":"heure","mot":"今","lecture":"いま","sens":"maintenant"}];

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
  const record = enrichirRecord({ date: new Date().toISOString(), points, maxPoints, pct, dureeMs });
  entry.history.push(record);
  if (!entry.best || comparerResultats(record, entry.best) > 0) entry.best = record;
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

function buildPratiqueCardsHtml(cardClass, restartClass) {
  let html = '';
  PRATIQUE_THEMES.forEach(t => {
    const count = getPratiqueList(t.id).length;
    const entry = getPratiqueScoreEntry(t.id);
    const saved = getValidPratiqueInProgress(t.id);
    html += `
      <div class="${cardClass}${count === 0 ? ' empty' : ''}${entry ? ' ' + classePalierPct(entry.best.pct) : ''}${entry && entry.best.difficulte === 'difficile' ? ' week-card--hardcore' : ''}" data-theme="${t.id}">
        <div class="week-num">${escapeHtml(t.label)}</div>
        <div class="week-meta">${count} mots</div>
        ${entry ? `<div class="week-score">${entry.best.points}/${entry.best.maxPoints} pts <span class="week-score-pct">(${formatPct(entry.best.pct)})</span></div>` : '<div class="week-score muted">—</div>'}
        ${saved ? `
          <div class="week-progress-bar"><div class="week-progress-fill" style="width:${Math.round((saved.index / saved.queue.length) * 100)}%"></div></div>
          <div class="week-progress-label">
            ${saved.index}/${saved.queue.length} · ${saved.totals.points} pts gagnés
            <button class="${restartClass}" data-theme="${t.id}" title="Recommencer ce thème">↺ Recommencer</button>
          </div>
        ` : ''}
      </div>
    `;
  });
  return html;
}

function renderPratiqueQuizView(container) {
  if (quizSession.index >= quizSession.queue.length) {
    const { points, maxPoints } = quizSession.totals;
    const dureeMs = dureeSessionMs(quizSession.totals);
    const pct = maxPoints > 0
      // Bug #19 (22/09/2026) : un score presque parfait (ex. 569/570)
      // arrondissait a 100%, ce qui donnait un faux sentiment de sans-faute.
      // 100% est reserve au score reellement parfait ; sinon on plafonne a 99%
      // meme si l'''arrondi mathematique donnerait 100.
      ? calculerPct(points, maxPoints)
      : 0;
    const prevEntry = getPratiqueScoreEntry(quizSession.theme);
    const prevBest = prevEntry ? prevEntry.best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    if (typeof celebrerProgressionSiBesoin === 'function') setTimeout(celebrerProgressionSiBesoin, 300);
    recordPratiqueSessionResult(quizSession.theme, points, maxPoints, pct, dureeMs);
    clearPratiqueInProgress(quizSession.theme);
    persist();
    if (typeof kvtSnapshotHistorique === 'function') kvtSnapshotHistorique();
    const themeLabel = (PRATIQUE_THEMES.find(t => t.id === quizSession.theme) || {}).label || '';
    const etat = pct >= 100 ? 'perfect' : (pct >= 70 ? 'good' : 'low');
    const badge = improved
      ? `<div class="kvt-result__badge">Record -- nouveau meilleur score</div>`
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${formatPct(prevBest)}</div>` : '');
    container.innerHTML = `
      <h2>Vocabulaire pratique -- ${escapeHtml(themeLabel)}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${badge}
        <div class="kvt-result__pct">${formatPct(pct)}</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <button class="kvt-result__btn" type="button" id="btnBackPratiqueReview">Retour au tableau de bord</button>
      </div>
    `;
    $('#btnBackPratiqueReview').addEventListener('click', () => {
      quizSession = null;
      switchView('dashboard');
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
        <div class="front-word${classeTailleMot(v.mot)}">${escapeHtml(v.mot)}</div>${indiceQuestionHtml(v)}
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
          ${v.note ? `<div class="back-note"><strong>À retenir</strong> ${escapeHtml(v.note)}</div>` : ''}
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
      <div class="quiz-actions-bas"><button class="secondary btn-recommencer-session" type="button">Recommencer</button><button class="secondary" id="btnQuitPratiqueQuiz">Quitter la session</button></div>
    </div>
  `;

  if (!quizSession.submitted) {
    const input = $('#answerInputPratique');
    input.focus();
    activerSaisieKanaDirecte(input, false);
    const submit = () => {
      const val = finaliserKana(input.value, false);
      { const refus = verifierSaisieJp(val);
        if (refus) { quizSession.warning = refus; renderReview(); return; } }
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
      noterActivite(quizSession.totals);
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
    // Grille de cartes cliquables (28/09/2026, demande de Paul) : meme
    // principe visuel/interactif que Cursus/JLPT/Ecriture/Traduction/Double
    // (score + reprise directement sur la carte), a la place du double
    // menu deroulant type+groupe utilise jusque-la. Hiragana et Katakana
    // s'affichent tous les deux en meme temps (comme 2 "semestres"), plus
    // besoin de choisir un type avant de voir les groupes.
    if (reviewPickerMode === 'kana') {
      let semainesHtmlKana = '';
      [{ id: 'hiragana', label: 'Hiragana' }, { id: 'katakana', label: 'Katakana' }].forEach(type => {
        let cartesHtml = '';
        KANA_GROUPS.forEach(g => {
          const count = buildKanaQueue(type.id, g.id).length;
          const entry = getKanaScoreEntry(type.id, g.id);
          const saved = getValidKanaInProgress(type.id, g.id);
          cartesHtml += `
            <div class="review-week-card ${count === 0 ? 'empty' : ''}" data-kana-type="${type.id}" data-group="${g.id}">
              <div class="week-num">${escapeHtml(g.label)}</div>
              <div class="week-meta">${count} kana</div>
              ${entry ? `<div class="week-score">${entry.best.points}/${entry.best.maxPoints} pts <span class="week-score-pct">(${formatPct(entry.best.pct)})</span></div>` : '<div class="week-score muted">—</div>'}
              ${saved ? `
                <div class="week-progress-bar"><div class="week-progress-fill" style="width:${Math.round((saved.index / saved.queue.length) * 100)}%"></div></div>
                <div class="week-progress-label">
                  ${saved.index}/${saved.queue.length} · ${saved.totals.points} pts gagnés
                  <button class="review-week-restart-btn" data-kana-type="${type.id}" data-group="${g.id}" title="Recommencer ce groupe">↺ Recommencer</button>
                </div>
              ` : ''}
            </div>
          `;
        });
        semainesHtmlKana += `<div class="card"><h3>${type.label}</h3><div class="week-grid week-grid--kana">${cartesHtml}</div></div>`;
      });
      container.innerHTML = `
        <h2>Réviser</h2>
        <div class="card">
          <div class="form-row">${modeSelectHtml}${difficulteSelectHtml}</div>
        </div>
        ${semainesHtmlKana}
      `;
      $('#quizModePicker').addEventListener('change', (e) => {
        reviewPickerMode = e.target.value;
        renderReview();
      });
      brancherDifficultePicker();
      $$('.review-week-restart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          startKanaQuiz(btn.dataset.kanaType, btn.dataset.group, true);
          renderReview();
        });
      });
      $$('.review-week-card').forEach(el => {
        el.addEventListener('click', () => {
          const count = buildKanaQueue(el.dataset.kanaType, el.dataset.group).length;
          if (count === 0) return;
          startKanaQuiz(el.dataset.kanaType, el.dataset.group, false);
          renderReview();
        });
      });
      return;
    }

    // Mode "Vocabulaire pratique" (17/09/2026) : pas de semestre/semaine,
    // juste un theme (compteurs/couleurs/heure). Grille de cartes
    // cliquables (28/09/2026, demande de Paul) : meme principe que Kana
    // ci-dessus, a la place du menu deroulant de themes utilise jusque-la.
    if (reviewPickerMode === 'pratique') {
      const cartesHtmlPratique = buildPratiqueCardsHtml('review-week-card', 'review-week-restart-btn');
      container.innerHTML = `
        <h2>Réviser</h2>
        <div class="card">
          <div class="form-row">${modeSelectHtml}${difficulteSelectHtml}</div>
        </div>
        <div class="card"><h3>Vocabulaire pratique</h3><div class="week-grid">${cartesHtmlPratique}</div></div>
      `;
      $('#quizModePicker').addEventListener('change', (e) => {
        reviewPickerMode = e.target.value;
        renderReview();
      });
      brancherDifficultePicker();
      $$('.review-week-restart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          startPratiqueQuiz(btn.dataset.theme, true);
          renderReview();
        });
      });
      $$('.review-week-card').forEach(el => {
        el.addEventListener('click', () => {
          const count = getPratiqueList(el.dataset.theme).length;
          if (count === 0) return;
          startPratiqueQuiz(el.dataset.theme, false);
          renderReview();
        });
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
                ${entry ? `<div class="week-score">${entry.best.points}/${entry.best.maxPoints} pts <span class="week-score-pct">(${formatPct(entry.best.pct)})</span> ${typeTagScore}</div>` : '<div class="week-score muted">—</div>'}
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
    const { points, maxPoints } = quizSession.totals;
    const dureeMs = dureeSessionMs(quizSession.totals);
    const pct = maxPoints > 0
      // Bug #19 (22/09/2026) : un score presque parfait (ex. 569/570)
      // arrondissait a 100%, ce qui donnait un faux sentiment de sans-faute.
      // 100% est reserve au score reellement parfait ; sinon on plafonne a 99%
      // meme si l'''arrondi mathematique donnerait 100.
      ? calculerPct(points, maxPoints)
      : 0;
    const key = weekKey(quizSession.semesterId, quizSession.week);
    const prevBest = DB.scores[key] ? DB.scores[key].best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    if (typeof celebrerProgressionSiBesoin === 'function') setTimeout(celebrerProgressionSiBesoin, 300);
    recordSessionResult(quizSession.semesterId, quizSession.week, points, maxPoints, pct, quizSession.verbeFilter, dureeMs);
    if (window.kvtHistorique && !quizSession.historiqueNote) { quizSession.historiqueNote = true; window.kvtHistorique.enregistrerHistoriqueSession(DB, quizSession, 'vocab', { pct, points, maxPoints, dureeMs, difficulte: difficulteDeSession(quizSession) }); }
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
      pousserMeilleurScore(DB.scores[key], quizSession.semesterId, quizSession.week, 'vocab');
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
      : (prevBest !== null ? `<div class="kvt-result__badge">Meilleur score : ${formatPct(prevBest)}</div>` : '');

    container.innerHTML = `
      <h2>Session terminée — ${escapeHtml(semLabel)} Semaine ${quizSession.week}</h2>
      <div class="kvt-result kvt-result--${etat}">
        ${burst}
        ${badge}
        <div class="kvt-result__pct">${formatPct(pct)}</div>
        <div class="kvt-result__points">${points} / ${maxPoints} points</div>
        ${dureeMs !== null ? `<div class="kvt-result__duree">Termine en ${formatDuree(dureeMs)}</div>` : ''}
        <div class="kvt-result__title">${textes.titre}</div>
        <div class="kvt-result__sub">${textes.sub}</div>
        <button class="kvt-result__btn" type="button" id="btnBackReview">Retour au tableau de bord</button>
      </div>
      ${recap}
    `;
    if (typeof ajouterClassementResultat === 'function') ajouterClassementResultat(container, 'vocab', quizSession.semesterId, quizSession.week);
    $('#btnBackReview').addEventListener('click', () => {
      quizSession = null;
      switchView('dashboard');
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
        <div class="front-word${classeTailleMot(v.mot)}">${escapeHtml(v.mot)}</div>${indiceQuestionHtml(v)}
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
      <div class="quiz-actions-bas"><button class="secondary btn-recommencer-session" type="button">Recommencer</button><button class="secondary" id="btnQuitQuiz">Quitter la session</button></div>
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
      const val = finaliserKana(input.value, false);
      { const refus = verifierSaisieJp(val);
        if (refus) { quizSession.warning = refus; renderReview(); return; } }
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
      noterActivite(quizSession.totals);
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

// (28/09/2026, demande de Paul) La page Statistiques a ete supprimee : le
// tableau de bord permet desormais de lancer Ecriture/Traduction/Vocabulaire
// directement depuis la modale de semaine. getWorstWords() (plus haut dans
// ce fichier) est conservee : c'est une fonction utilitaire generale, pas
// liee a la page en elle-meme, gardee au cas ou ces donnees (mots les plus
// rates) soient un jour resurfacees ailleurs (ex. dans le tableau de bord).

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
// Un lien reçu par mail (réinitialisation de mot de passe, confirmation
// d'inscription...) déjà utilisé, expiré, ou invalide ne déclenche PAS
// PASSWORD_RECOVERY : Supabase redirige quand même vers l'app (redirectTo),
// mais avec "#error=...&error_code=...&error_description=..." dans l'URL au
// lieu d'ouvrir une session. Sans traitement, ça n'affichait RIEN :
// l'utilisateur atterrissait sur l'app sans le moindre indice que son lien
// avait un problème (signalé par un cas réel le 25/09/2026 : lien fonctionnel
// au 1er clic mais "invalid or expired" en cas de reclic, ex. lien ouvert
// deux fois ou pré-visité par un scanner de sécurité de la messagerie).
// Cette fonction détecte ce cas, prépare le message pour l'onglet Compte
// (voir kvtAuthErrorMessage dans account.js) et nettoie l'URL pour qu'un
// simple rechargement de page ne le réaffiche pas indéfiniment.
function traiterErreurAuthDansUrl() {
  const brut = location.hash.replace(/^#/, '');
  if (!/(^|&)error=/.test(brut)) return false;
  const params = new URLSearchParams(brut);
  const code = params.get('error_code') || '';
  const description = params.get('error_description') || '';
  if (code === 'otp_expired') {
    kvtAuthErrorMessage = "Ce lien a expiré ou a déjà été utilisé. Redemande un nouveau lien depuis « Mot de passe oublié ? ».";
  } else {
    kvtAuthErrorMessage = description || "Ce lien n'est plus valide. Redemande un nouveau lien depuis « Mot de passe oublié ? ».";
  }
  // Efface le hash pour qu'un rechargement de page (ou un retour arrière du
  // navigateur) ne retombe pas sur cette même erreur en boucle.
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}

async function init() {
  DB = await window.api.loadData();
  applyTheme();
  brancherBoutonRecommencer();
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
  // Un lien de mail invalide/expiré prend le pas sur le routage normal par
  // ancre : "#error=..." ne correspond a aucune vue connue de toute facon,
  // mais autant etre explicite plutot que de compter sur ce hasard.
  const erreurAuth = traiterErreurAuthDansUrl();
  const ancre = decodeURIComponent(location.hash.replace(/^#/, ''));
  // Lien de salon (/app/?salon=CODE) : on ouvre l'onglet Parties, code déjà saisi.
  const veutSalon = /[?&]salon=/.test(location.search);
  switchView(erreurAuth ? 'account' : (veutSalon ? 'parties' : (vuesConnues.has(ancre) ? ancre : 'communaute')));

  // Signal de mesure : quelqu'un a ouvert l'application, pas seulement
  // affiche une page. C'est le premier palier qui distingue un visiteur
  // curieux d'un simple clic paye.
  if (window.kvtMesure) window.kvtMesure.noter('app_ouverte');
}

document.addEventListener('DOMContentLoaded', init);
