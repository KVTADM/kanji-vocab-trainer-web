// Scénarios pour le mode "Kanji seul" (onyomi/kunyomi).

function baseDB() {
  return {
    settings: {
      semesters: [{ id: 'l0-s2', label: 'Semestre 2 Débutant', weeks: 10 }],
      pointsPerWord: 10
    },
    kanjiGroups: [
      { id: 'kg-1', semesterId: 'l0-s2', week: 3, kanji: '半', titre: 'moitié', onyomi: 'ハン', kunyomi: 'なか（ば）' },
      { id: 'kg-2', semesterId: 'l0-s2', week: 3, kanji: '上', titre: 'monter', onyomi: 'シャンショウジョウ', kunyomi: 'うえうわ-かみあ.がるあ.げるのぼ.る' },
      { id: 'kg-3', semesterId: 'l0-s2', week: 3, kanji: '々', titre: 'répétition', onyomi: '', kunyomi: '' },
      { id: 'kg-4', semesterId: 'l0-s2', week: 4, kanji: '休', titre: 'repos', onyomi: 'キュウ', kunyomi: 'やす.むやす.まるやす.める' }
    ],
    scores: {},
    scoresKanji: {},
    inProgress: {},
    inProgressKanji: {}
  };
}

// ---------- buildKanjiQueue ----------

essai('un kanji avec onyomi ET kunyomi genere deux items', () => {
  DB = baseDB();
  const q = buildKanjiQueue('l0-s2', 3).filter(i => i.groupId === 'kg-1');
  if (q.length !== 2) throw new Error('attendu 2 items, obtenu ' + q.length);
  if (!q.some(i => i.type === 'onyomi') || !q.some(i => i.type === 'kunyomi')) {
    throw new Error('les deux types onyomi/kunyomi doivent etre presents');
  }
});

essai('un kanji sans aucune lecture ne genere aucun item ("une seule si obligatoire")', () => {
  DB = baseDB();
  const q = buildKanjiQueue('l0-s2', 3).filter(i => i.groupId === 'kg-3');
  if (q.length !== 0) throw new Error('attendu 0 item pour un kanji sans lecture, obtenu ' + q.length);
});

essai('la file totale de la semaine 3 contient bien 4 items (2 kanji x 2 lectures, 1 kanji sans lecture)', () => {
  DB = baseDB();
  const q = buildKanjiQueue('l0-s2', 3);
  if (q.length !== 4) throw new Error('attendu 4, obtenu ' + q.length);
});

// ---------- nettoieLectureBrute ----------

essai('nettoieLectureBrute retire les points, tirets, parentheses pleine largeur et espaces', () => {
  const r = nettoieLectureBrute('うえうわ-かみあ.がるあ.げるのぼ.る');
  if (r !== 'うえうわかみあがるあげるのぼる') throw new Error('obtenu: ' + r);
  const r2 = nettoieLectureBrute('なか（ば）');
  if (r2 !== 'なかば') throw new Error('obtenu: ' + r2);
});

essai('nettoieLectureBrute gere une entree vide/nulle sans planter', () => {
  if (nettoieLectureBrute('') !== '') throw new Error('vide attendu');
  if (nettoieLectureBrute(null) !== '') throw new Error('vide attendu pour null');
});

// ---------- scoreLectureKanji ----------

essai('une lecture exacte au milieu d\'un bloc concatene est notee juste (une seule lecture suffit)', () => {
  DB = baseDB();
  const r = scoreLectureKanji('ジョウ', 'シャンショウジョウ');
  if (r.pct !== 1 || r.points !== 10) throw new Error(JSON.stringify(r));
});

essai('une lecture avec okurigana est reconnue meme sans le point separateur de l\'utilisateur', () => {
  DB = baseDB();
  const r = scoreLectureKanji('あがる', 'うえうわ-かみあ.がるあ.げるのぼ.る');
  if (r.pct !== 1 || r.points !== 10) throw new Error(JSON.stringify(r));
});

essai('la premiere lecture d\'un bloc (avant toute ponctuation) est aussi reconnue', () => {
  DB = baseDB();
  const r = scoreLectureKanji('ハン', 'ハン');
  if (r.pct !== 1 || r.points !== 10) throw new Error(JSON.stringify(r));
});

essai('une reponse totalement fausse retombe sur un credit partiel (pas zero brutal, coherent avec le quiz vocabulaire)', () => {
  DB = baseDB();
  const r = scoreLectureKanji('ぜんぜんちがう', 'ハン');
  if (r.pct >= 0.5) throw new Error('score trop genereux pour une reponse fausse: ' + JSON.stringify(r));
});

essai('une reponse vide vaut zero point, sans planter', () => {
  DB = baseDB();
  const r = scoreLectureKanji('', 'ハン');
  if (r.pct !== 0 || r.points !== 0) throw new Error(JSON.stringify(r));
});

// ---------- recordKanjiSessionResult / getKanjiScoreEntry : isolation ----------

essai('recordKanjiSessionResult ecrit dans DB.scoresKanji SANS jamais toucher DB.scores', () => {
  DB = baseDB();
  DB.scores['l0-s2-w3'] = { best: { pct: 0.42 }, history: [{ pct: 0.42 }] }; // score vocabulaire preexistant
  recordKanjiSessionResult('l0-s2', 3, 20, 20, 100);
  if (DB.scores['l0-s2-w3'].best.pct !== 0.42) {
    throw new Error('DB.scores (quiz vocabulaire) a ete modifie par erreur : ' + JSON.stringify(DB.scores['l0-s2-w3']));
  }
  const entry = getKanjiScoreEntry('l0-s2', 3);
  if (!entry || entry.best.pct !== 100) throw new Error('DB.scoresKanji non ecrit correctement : ' + JSON.stringify(entry));
});

essai('getKanjiScoreEntry garde le meilleur score au fil de plusieurs sessions', () => {
  DB = baseDB();
  recordKanjiSessionResult('l0-s2', 3, 10, 20, 50);
  recordKanjiSessionResult('l0-s2', 3, 20, 20, 100);
  recordKanjiSessionResult('l0-s2', 3, 5, 20, 25);
  const entry = getKanjiScoreEntry('l0-s2', 3);
  if (entry.best.pct !== 100) throw new Error('meilleur score attendu 100, obtenu ' + entry.best.pct);
  if (entry.history.length !== 3) throw new Error('historique attendu 3 entrees, obtenu ' + entry.history.length);
});

essai('getKanjiScoreEntry renvoie null pour une semaine jamais jouee', () => {
  DB = baseDB();
  if (getKanjiScoreEntry('l0-s2', 9) !== null) throw new Error('attendu null');
});

// ---------- getValidKanjiInProgress ----------

essai('getValidKanjiInProgress retrouve une sauvegarde dont la file correspond exactement', () => {
  DB = baseDB();
  const queue = buildKanjiQueue('l0-s2', 3);
  DB.inProgressKanji['l0-s2-w3'] = { queue, index: 1, answers: [{}], totals: { points: 5, maxPoints: 40 }, hardcore: false, updatedAt: 'x' };
  const saved = getValidKanjiInProgress('l0-s2', 3);
  if (!saved) throw new Error('sauvegarde valide non retrouvee');
  if (saved.index !== 1) throw new Error('index incorrect');
});

essai('getValidKanjiInProgress rejette une sauvegarde dont la file ne correspond plus (kanji modifies)', () => {
  DB = baseDB();
  DB.inProgressKanji['l0-s2-w3'] = {
    queue: [{ groupId: 'kg-inexistant', type: 'onyomi' }],
    index: 0, answers: [], totals: { points: 0, maxPoints: 10 }, hardcore: false, updatedAt: 'x'
  };
  const saved = getValidKanjiInProgress('l0-s2', 3);
  if (saved !== null) throw new Error('attendu null pour une file perimee');
});

essai('getValidKanjiInProgress rejette une session deja terminee (index >= longueur de la file)', () => {
  DB = baseDB();
  const queue = buildKanjiQueue('l0-s2', 3);
  DB.inProgressKanji['l0-s2-w3'] = { queue, index: queue.length, answers: [], totals: { points: 0, maxPoints: 40 }, hardcore: false, updatedAt: 'x' };
  const saved = getValidKanjiInProgress('l0-s2', 3);
  if (saved !== null) throw new Error('attendu null pour une session deja terminee');
});

essai('getValidKanjiInProgress renvoie null quand rien n\'est sauvegarde', () => {
  DB = baseDB();
  if (getValidKanjiInProgress('l0-s2', 3) !== null) throw new Error('attendu null');
});

// ---------- saveKanjiInProgress / clearKanjiInProgress ----------

essai('saveKanjiInProgress ne fait rien si la session active n\'est pas en mode kanji (isolation avec le quiz vocabulaire)', () => {
  DB = baseDB();
  quizSession = { mode: 'vocab', semesterId: 'l0-s2', week: 3 };
  saveKanjiInProgress();
  if (Object.keys(DB.inProgressKanji).length !== 0) throw new Error('DB.inProgressKanji n\'aurait pas du etre modifie');
});

essai('clearKanjiInProgress supprime uniquement l\'entree kanji, jamais DB.inProgress (vocabulaire)', () => {
  DB = baseDB();
  DB.inProgress['l0-s2-w3'] = { queue: ['v1'], index: 0, answers: [], totals: {} };
  DB.inProgressKanji['l0-s2-w3'] = { queue: [], index: 0, answers: [], totals: {} };
  clearKanjiInProgress('l0-s2', 3);
  if (DB.inProgressKanji['l0-s2-w3']) throw new Error('DB.inProgressKanji aurait du etre efface');
  if (!DB.inProgress['l0-s2-w3']) throw new Error('DB.inProgress (vocabulaire) n\'aurait pas du etre touche');
});
