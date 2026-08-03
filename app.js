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
let dashboardMode = 'cursus';  // 'cursus' (S0-S6) ou 'jlpt' (modules JLPT) — bascule en haut à droite de l'Accueil

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
  return DB.vocab.filter(v => v.kanjiGroupId === groupId);
}
function getVocabForWeek(semesterId, week) {
  const groupIds = new Set(getKanjiGroupsForWeek(semesterId, week).map(g => g.id));
  return DB.vocab.filter(v => groupIds.has(v.kanjiGroupId));
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
function recordSessionResult(semesterId, week, points, maxPoints, pct) {
  const key = weekKey(semesterId, week);
  if (!DB.scores[key]) DB.scores[key] = { best: null, history: [] };
  const entry = DB.scores[key];
  const record = { date: new Date().toISOString(), points, maxPoints, pct };
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
  const vocabList = getVocabForWeek(semesterId, week);
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

function similarity(input, correct) {
  const a = toHiragana((input || '').trim());
  const b = toHiragana((correct || '').trim());
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
  const pct = similarity(input, correct);
  const points = Math.round(pct * DB.settings.pointsPerWord);
  return { pct, points };
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
  else if (currentView === 'maj' && typeof renderMaj === 'function') renderMaj();
  else if (currentView === 'communaute' && typeof renderCommunaute === 'function') renderCommunaute();
  else if (currentView === 'admin' && typeof renderAdmin === 'function') renderAdmin();
  renderSidebarFooter();
}

function renderSidebarFooter() {
  $('#weekBadge').innerHTML = `${DB.vocab.length} mot(s) au total<br/>Sauvegarde locale active`;
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
    { id: 'jlpt', label: 'JLPT', integre: true }
  ].concat(categoriesLibres().map(c => ({ id: c.id, label: c.label, integre: false })));
  return onglets.filter(o => compte[o.id] || o.id === dashboardMode || o.id === 'cursus');
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
        <button class="mode-toggle-btn mode-toggle-plus" id="btnNouvelleCategorie" title="Nouvelle catégorie">+</button>
      </div>
    </div>
    ${ongletCourant && !ongletCourant.integre ? `
      <div class="categorie-outils">
        <span>Catégorie « ${escapeHtml(ongletCourant.label)} »</span>
        <button class="lien-retour" data-renommer="${ongletCourant.id}">Renommer</button>
        <button class="lien-retour" data-supprimer-cat="${ongletCourant.id}">Supprimer</button>
      </div>` : ''}`;

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
      html += `
        <div class="week-card ${vocabList.length === 0 ? 'empty' : ''}" data-sem="${sem.id}" data-week="${w}">
          <div class="week-num">${unitPrefix}${w}</div>
          <div class="week-meta">${groups.length} kanji · ${vocabList.length} mots</div>
          ${entry ? `<div class="week-score">${entry.best.points}/${entry.best.maxPoints} pts <span class="week-score-pct">(${entry.best.pct}%)</span></div>` : '<div class="week-score muted">—</div>'}
          ${saved ? `
            <div class="week-progress-bar"><div class="week-progress-fill" style="width:${Math.round((saved.index / saved.queue.length) * 100)}%"></div></div>
            <div class="week-progress-label">
              ${saved.index}/${saved.queue.length} mots · ${saved.totals.points} pts gagnés
              <button class="week-restart-btn" data-sem="${sem.id}" data-week="${w}" title="Recommencer cette semaine">↺ Recommencer</button>
            </div>
          ` : ''}
        </div>
      `;
    }
    html += `</div></div>`;
  });
  html += kvtAdSlotHtml('dashboard-bottom');
  $('#view-dashboard').innerHTML = html;
  renderAllAdSlots();

  $$('[data-onglet]').forEach(b => {
    b.addEventListener('click', () => { dashboardMode = b.dataset.onglet; renderDashboard(); });
  });
  $('#btnNouvelleCategorie').addEventListener('click', creerCategorie);
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
        startQuiz(sem, w);
        switchView('review');
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
            <button class="secondary small btn-del-group" data-group="${g.id}">Supprimer ce kanji</button>
          </div>
          ${learnInfo}
          <table>
            <thead><tr><th>Mot</th><th>Lecture</th><th>Sens</th><th></th></tr></thead>
            <tbody>
              ${vocabList.map(v => `
                <tr>
                  <td>${escapeHtml(v.mot)}</td>
                  <td>${escapeHtml(v.lecture)}</td>
                  <td>${escapeHtml(v.sens)}</td>
                  <td><button class="secondary small btn-del-vocab" data-vocab="${v.id}">Suppr.</button></td>
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
      Les mots testés pendant les révisions, avec les fiches d'aide optionnelles (lectures, radical, phrase d'exemple, mémo, attention) pour étudier avant de te tester. Les fiches ne sont jamais utilisées pendant Réviser, qui reste un vrai test à l'aveugle — l'import des mots reste le seul obligatoire, celui des fiches est facultatif et indépendant.
    </p>
    <div class="card">
      <h3>Importer des mots en masse</h3>
      <p style="font-size:13px; color:var(--muted); line-height:1.6;">
        Une ligne par mot, colonnes séparées par point-virgule (ou tabulation si tu colles depuis Excel/Numbers) :<br/>
        <code>Semestre;Semaine;Kanji;Titre;Mot;Lecture;Sens</code><br/>
        Exemple : <code>S3;1;水;eau;水曜日;すいようび;mercredi</code>
      </p>
      <textarea id="importText" rows="8" style="width:100%; font-family:monospace; font-size:13px; padding:10px; border:1px solid var(--border); border-radius:8px;" placeholder="S3;1;水;eau;水;みず;eau&#10;S3;1;水;eau;水曜日;すいようび;mercredi"></textarea>
      <div class="form-row" style="margin-top:10px;">
        <button class="secondary" id="btnParseImport">Analyser</button>
        <button class="primary" id="btnCommitImport" disabled>Importer</button>
      </div>
      <div id="importPreviewBox"></div>
    </div>

    <div class="card">
      <h3>Importer des fiches en masse (optionnel)</h3>
      <p style="font-size:13px; color:var(--muted); line-height:1.6;">
        Une ligne par kanji (pas par mot), colonnes séparées par point-virgule (ou tabulation).<br/>
        <code>Semestre;Semaine;Kanji;Onyomi;Kunyomi;Bushu;Phrase;Traduction;Memo;Attention</code>
      </p>
      <textarea id="learnImportText" rows="8" style="width:100%; font-family:monospace; font-size:13px; padding:10px; border:1px solid var(--border); border-radius:8px;" placeholder="S3;1;水;スイ;みず;みず;水を飲む。;Boire de l'eau.;Dessin d'une rivière;"></textarea>
      <div class="form-row" style="margin-top:10px;">
        <button class="secondary" id="btnParseLearnImport">Analyser</button>
        <button class="primary" id="btnCommitLearnImport" disabled>Importer</button>
      </div>
      <div id="learnImportPreviewBox"></div>
    </div>

    <div class="card">
      <h3>Parcourir le vocabulaire et les fiches</h3>
      <select id="browseWeekPicker" style="margin-bottom:14px;">${selectHtml}</select>
      ${browseHtml}
    </div>
  `;

  $('#btnParseImport').addEventListener('click', () => {
    importPreview = parseImportText($('#importText').value);
    renderImportPreview();
  });

  $('#btnCommitImport').addEventListener('click', async () => {
    if (!importPreview || importPreview.rows.length === 0) return;
    const { addedGroups, addedVocab } = commitImport(importPreview.rows);
    await persist();
    showToast(`${addedVocab} mot(s) importé(s) (${addedGroups} nouveau(x) kanji)`);
    importPreview = null;
    renderVocab();
  });

  $('#btnParseLearnImport').addEventListener('click', () => {
    learnImportPreview = parseLearnImportText($('#learnImportText').value);
    renderLearnImportPreview();
  });

  $('#btnCommitLearnImport').addEventListener('click', async () => {
    if (!learnImportPreview || learnImportPreview.rows.length === 0) return;
    const { updated, created } = commitLearnImport(learnImportPreview.rows);
    await persist();
    showToast(`${updated} fiche(s) mise(s) à jour${created ? ` (${created} nouveau(x) kanji créé(s))` : ''}`);
    learnImportPreview = null;
    renderVocab();
  });

  $('#browseWeekPicker').addEventListener('change', (e) => {
    const [sem, w] = e.target.value.split('|');
    browsingWeek = { semesterId: sem, week: parseInt(w, 10) };
    renderVocab();
  });

  $$('.btn-del-group').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gid = btn.dataset.group;
      DB.kanjiGroups = DB.kanjiGroups.filter(g => g.id !== gid);
      DB.vocab = DB.vocab.filter(v => v.kanjiGroupId !== gid);
      await persist();
      renderVocab();
    });
  });
  $$('.btn-del-vocab').forEach(btn => {
    btn.addEventListener('click', async () => {
      DB.vocab = DB.vocab.filter(v => v.id !== btn.dataset.vocab);
      await persist();
      renderVocab();
    });
  });
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
function startQuiz(semesterId, week, forceRestart) {
  const vocabList = getVocabForWeek(semesterId, week);
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
    usedSpectral: false, // vrai si le calque fantôme (mode spectral) a été utilisé sur le mot en cours -> annule ses points
    answers: [], // récap complet, rempli au fil de la session, affiché à la fin en mode hardcore
    totals: { points: 0, maxPoints: vocabList.length * DB.settings.pointsPerWord }
  };
}

function renderReview() {
  const container = $('#view-review');

  if (!quizSession) {
    const opts = [];
    DB.settings.semesters.forEach(sem => {
      for (let w = 1; w <= sem.weeks; w++) {
        const count = getVocabForWeek(sem.id, w).length;
        opts.push(`<option value="${sem.id}|${w}" ${count === 0 ? 'disabled' : ''}>${sem.label} — Semaine ${w} (${count} mots)</option>`);
      }
    });
    container.innerHTML = `
      <h2>Réviser</h2>
      <div class="card">
        <div class="form-row">
          <select id="quizWeekPicker">${opts.join('')}</select>
          <button class="primary" id="btnStartQuiz">Démarrer</button>
        </div>
      </div>
    `;
    $('#btnStartQuiz').addEventListener('click', () => {
      const val = $('#quizWeekPicker').value;
      if (!val) return;
      const [sem, w] = val.split('|');
      startQuiz(sem, parseInt(w, 10));
      renderReview();
    });
    return;
  }

  // Session terminée
  if (quizSession.index >= quizSession.queue.length) {
    const { points, maxPoints } = quizSession.totals;
    const pct = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 0;
    const key = weekKey(quizSession.semesterId, quizSession.week);
    const prevBest = DB.scores[key] ? DB.scores[key].best.pct : null;
    const improved = prevBest === null || pct > prevBest;
    recordSessionResult(quizSession.semesterId, quizSession.week, points, maxPoints, pct);
    clearInProgress(quizSession.semesterId, quizSession.week);
    persist();
    // Pousse le meilleur score de cette semaine vers le classement de classe
    // (si un compte est connecté) — le leaderboard reflète toujours le
    // record personnel, pas chaque tentative individuelle.
    if (typeof window.kvtPushScore === 'function') {
      const bestEntry = DB.scores[key].best;
      window.kvtPushScore(quizSession.semesterId, quizSession.week, bestEntry.points, bestEntry.maxPoints, bestEntry.pct);
    }
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
    <div class="flashcard-wrap">
      <div class="session-progress">
        <div style="font-size:12px; color:var(--muted);">${quizSession.index + 1} / ${quizSession.queue.length}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      </div>
      <div class="flashcard">
        <div class="front-word">${escapeHtml(v.mot)}</div>
        ${!quizSession.hardcore ? `<div class="hint">${g ? escapeHtml(g.kanji) + (g.titre ? ' · ' + escapeHtml(g.titre) : '') : ''}</div>` : ''}
        ${!quizSession.submitted ? `
          ${quizSession.warning ? `<div class="quiz-feedback bad" style="margin-top:12px;">${escapeHtml(quizSession.warning)}</div>` : ''}
          <div class="answer-input-wrap">
            <input id="answerInput" type="text" placeholder="Écris la lecture en hiragana/katakana" style="margin-top:16px; width:280px; text-align:center; font-size:18px;"/>
            ${!quizSession.hardcore && DB.settings.spectralMode ? `
              <div id="spectralOverlay" class="spectral-overlay">${escapeHtml(v.lecture)}</div>
              <button type="button" id="btnSpectralEye" class="spectral-eye" title="Maintenir pour voir la réponse — ce mot ne rapportera aucun point">👁</button>
            ` : ''}
          </div>
        ` : quizSession.hardcore ? `
          <div class="quiz-feedback mid" style="margin-top:16px;">
            Réponse enregistrée. Correction disponible à la fin de la session.
          </div>
        ` : quizSession.usedSpectral ? `
          <div class="back-reading">${escapeHtml(v.lecture)}</div>
          ${v.sens ? `<div class="back-meaning">${escapeHtml(v.sens)}</div>` : ''}
          <div class="quiz-feedback bad">
            Mode spectral utilisé — 0/${DB.settings.pointsPerWord} points, cette réponse ne compte pas.
          </div>
        ` : `
          <div class="back-reading">${escapeHtml(v.lecture)}</div>
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
      saveInProgress();
      renderReview();
    };
    $('#btnSubmitAnswer').addEventListener('click', submit);
    // Sur Mac, taper en clavier japonais (romaji -> hiragana/katakana) passe par
    // un IME : la touche Entrée sert d'abord à valider la conversion en cours,
    // pas à valider la réponse. Sans cette garde, ce premier Entrée validait le
    // formulaire trop tôt avec un mot pas encore converti -> mauvaise réponse.
    // On ignore donc Entrée tant qu'une composition IME est active.
    let composing = false;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (composing || e.isComposing || e.keyCode === 229) return;
      submit();
    });
  } else {
    $('#btnNextWord').addEventListener('click', () => {
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

  $('#view-stats').innerHTML = `
    <h2>Statistiques</h2>
    <div class="grid-3">
      <div class="stat-box"><div class="num">${DB.vocab.length}</div><div class="label">Mots au total</div></div>
      <div class="stat-box"><div class="num">${totalAttempts}</div><div class="label">Sessions jouées</div></div>
      <div class="stat-box"><div class="num">${DB.kanjiGroups.length}</div><div class="label">Kanji importés</div></div>
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
  const APP_VERSION = '1.1.1';
  // Les installeurs sont heberges sur les Releases GitHub et non sur Netlify :
  // ils pesaient 166 Mo sur 168, soit 98,7 % de chaque deploiement, et ils
  // repartaient en entier a chaque changement d'une ligne de CSS.
  const RELEASES = 'https://github.com/KVTADM/kanji-vocab-trainer-web/releases/download/v' + APP_VERSION;
  const RELEASE_DATE = '25 juillet 2026';
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
            ].map(([id, nom]) => `
              <option value="${id}" ${s.theme === id ? 'selected' : ''} ${isPro ? '' : 'disabled'}>${nom}${isPro ? '' : ' 🔒'}</option>
            `).join('')}
          </select>
        </label>
      </div>
      ${isPro ? '' : `
        <p style="font-size:13px; color:var(--muted); line-height:1.6;">
          Sombre et Clair sont gratuits — le mode clair est une question de
          confort visuel, pas un supplément. Les cinq palettes décoratives
          sont réservées au Pro, qui soutient le projet.
        </p>
      `}
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
  // bouge depuis la derniere session.
  switchView('communaute');
}

document.addEventListener('DOMContentLoaded', init);
