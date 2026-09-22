// Scénarios pour les 3 nouveaux modes (17/09/2026) : Écriture, Traduction,
// Vocabulaire pratique.

function baseDB() {
  return {
    motsMasques: [],
    settings: {
      semesters: [{ id: 's1', label: 'Semestre 1', weeks: 2 }],
      pointsPerWord: 10
    },
    kanjiGroups: [
      { id: 'g1', semesterId: 's1', week: 1, kanji: '水' },
      { id: 'g2', semesterId: 's1', week: 1, kanji: '火' }
    ],
    vocab: [
      { id: 'v1', kanjiGroupId: 'g1', mot: '水曜日', lecture: 'すいようび', sens: 'mercredi' },
      { id: 'v2', kanjiGroupId: 'g1', mot: '水', lecture: 'みず', sens: 'eau' },
      { id: 'v3', kanjiGroupId: 'g2', mot: '門', lecture: 'もん / かど', sens: 'porte' }
    ],
    scores: {}, scoresKanji: {}, scoresKana: {},
    inProgress: {}, inProgressKanji: {}, inProgressKana: {}
  };
}

// ================= Écriture =================
// Stateless par choix explicite de Paul : pas de score, pas de reprise.

essai('startEcritureQuiz met en file tous les mots de la semaine', () => {
  DB = baseDB();
  startEcritureQuiz('s1', 1);
  if (quizSession.mode !== 'ecriture') throw new Error('mode incorrect : ' + quizSession.mode);
  if (quizSession.queue.length !== 3) throw new Error('attendu 3 mots, obtenu ' + quizSession.queue.length);
  if (quizSession.index !== 0 || quizSession.revealed !== false) throw new Error('etat initial incorrect');
});

essai('startEcritureQuiz respecte le filtre "Mots" (simple vs kanji groupe)', () => {
  DB = baseDB();
  // 水曜日 est un mot a kanji groupes (plusieurs kanji colles), 水 et 門 sont simples.
  startEcritureQuiz('s1', 1, 'simple');
  if (quizSession.queue.length !== 2) throw new Error('attendu 2 mots simples, obtenu ' + quizSession.queue.length);
  if (quizSession.queue.includes('v1')) throw new Error('v1 (mot groupe) ne devrait pas etre inclus');
});

essai('startEcritureQuiz respecte le masquage personnel (mot masque exclu)', () => {
  DB = baseDB();
  DB.motsMasques = ['v2'];
  startEcritureQuiz('s1', 1);
  if (quizSession.queue.includes('v2')) throw new Error('v2 est masque, ne devrait pas apparaitre');
  if (quizSession.queue.length !== 2) throw new Error('attendu 2 mots (3 - 1 masque)');
});

essai('startEcritureQuiz ne cree ni score ni progression sauvegardee (stateless)', () => {
  DB = baseDB();
  global.persistCalls = 0;
  startEcritureQuiz('s1', 1);
  if (DB.scoresEcriture || DB.inProgressEcriture) throw new Error('le mode Ecriture ne doit rien persister');
  if (global.persistCalls !== 0) throw new Error('persist() ne doit jamais etre appele par ce mode');
});

// ================= Traduction =================

essai('scoreTraductionAnswer accepte la reponse en kanji', () => {
  DB = baseDB();
  const v = DB.vocab.find(x => x.id === 'v2'); // 水 / みず
  const r = scoreTraductionAnswer('水', v);
  if (r.pct < 0.99) throw new Error('reponse en kanji devrait scorer ~100%, obtenu ' + r.pct);
});

essai('scoreTraductionAnswer accepte la reponse en kana (lecture)', () => {
  DB = baseDB();
  const v = DB.vocab.find(x => x.id === 'v2'); // 水 / みず
  const r = scoreTraductionAnswer('みず', v);
  if (r.pct < 0.99) throw new Error('reponse en kana devrait scorer ~100%, obtenu ' + r.pct);
});

essai('scoreTraductionAnswer accepte n\'importe laquelle des lectures multiples (門 = もん ou かど)', () => {
  DB = baseDB();
  const v = DB.vocab.find(x => x.id === 'v3'); // 門, lecture "もん / かど"
  const r1 = scoreTraductionAnswer('もん', v);
  const r2 = scoreTraductionAnswer('かど', v);
  if (r1.pct < 0.99) throw new Error('もん devrait scorer ~100%, obtenu ' + r1.pct);
  if (r2.pct < 0.99) throw new Error('かど devrait scorer ~100%, obtenu ' + r2.pct);
});

essai('scoreTraductionAnswer penalise une reponse fausse', () => {
  DB = baseDB();
  const v = DB.vocab.find(x => x.id === 'v2');
  const r = scoreTraductionAnswer('ぜんぜんちがう', v);
  if (r.pct > 0.3) throw new Error('une reponse totalement fausse ne devrait pas scorer haut, obtenu ' + r.pct);
});

essai('recordTraductionSessionResult est isole de DB.scores/DB.scoresKanji/DB.scoresKana', () => {
  DB = baseDB();
  recordTraductionSessionResult('s1', 1, 25, 30, 83);
  if (Object.keys(DB.scores).length !== 0) throw new Error('DB.scores ne doit pas etre touche');
  if (Object.keys(DB.scoresKanji).length !== 0) throw new Error('DB.scoresKanji ne doit pas etre touche');
  if (Object.keys(DB.scoresKana).length !== 0) throw new Error('DB.scoresKana ne doit pas etre touche');
  const entry = getTraductionScoreEntry('s1', 1);
  if (!entry || entry.best.pct !== 83) throw new Error('le score Traduction devrait etre enregistre a part');
});

essai('recordTraductionSessionResult garde le meilleur score sur plusieurs tentatives', () => {
  DB = baseDB();
  recordTraductionSessionResult('s1', 1, 10, 30, 33);
  recordTraductionSessionResult('s1', 1, 27, 30, 90);
  recordTraductionSessionResult('s1', 1, 15, 30, 50);
  const entry = getTraductionScoreEntry('s1', 1);
  if (entry.best.pct !== 90) throw new Error('attendu meilleur score 90, obtenu ' + entry.best.pct);
  if (entry.history.length !== 3) throw new Error('les 3 tentatives devraient etre dans l\'historique');
});

essai('saveTraductionInProgress puis getValidTraductionInProgress retrouve la session', () => {
  DB = baseDB();
  startTraductionQuiz('s1', 1);
  quizSession.answers.push({ mot: '水', lecture: 'みず', sens: 'eau', userAnswer: 'みず', points: 10, pct: 1 });
  saveTraductionInProgress();
  const saved = getValidTraductionInProgress('s1', 1);
  if (!saved) throw new Error('la session sauvegardee devrait etre valide');
  if (saved.index !== 1) throw new Error('index de reprise incorrect : ' + saved.index);
});

essai('clearTraductionInProgress supprime bien la sauvegarde', () => {
  DB = baseDB();
  startTraductionQuiz('s1', 1);
  quizSession.answers.push({ mot: '水', lecture: 'みず', sens: 'eau', userAnswer: 'みず', points: 10, pct: 1 });
  saveTraductionInProgress();
  clearTraductionInProgress('s1', 1);
  if (getValidTraductionInProgress('s1', 1)) throw new Error('la sauvegarde devrait avoir disparu');
});

essai('getValidTraductionInProgress ignore une sauvegarde perimee (vocabulaire different)', () => {
  DB = baseDB();
  DB.inProgressTraduction = {
    's1-w1': { queue: ['v1', 'v2', 'v-inexistant'], index: 1, answers: [{}], totals: { points: 0, maxPoints: 30 }, hardcore: false, verbeFilter: 'tous' }
  };
  if (getValidTraductionInProgress('s1', 1)) throw new Error('une file avec un id disparu ne devrait plus etre valide');
});

essai('startTraductionQuiz (forceRestart) ignore une sauvegarde existante', () => {
  DB = baseDB();
  startTraductionQuiz('s1', 1);
  quizSession.answers.push({ mot: '水', lecture: 'みず', sens: 'eau', userAnswer: 'みず', points: 10, pct: 1 });
  saveTraductionInProgress();
  startTraductionQuiz('s1', 1, true);
  if (quizSession.index !== 0) throw new Error('forceRestart devrait repartir de zero, index=' + quizSession.index);
});

// ================= Vocabulaire pratique =================

essai('PRATIQUE_VOCAB contient exactement les 3 themes attendus, sans champ vide', () => {
  const themesTrouves = new Set(PRATIQUE_VOCAB.map(v => v.theme));
  const themesAttendus = new Set(PRATIQUE_THEMES.map(t => t.id));
  if (themesTrouves.size !== themesAttendus.size || [...themesTrouves].some(t => !themesAttendus.has(t))) {
    throw new Error('themes incoherents entre PRATIQUE_VOCAB et PRATIQUE_THEMES');
  }
  const incomplet = PRATIQUE_VOCAB.find(v => !v.id || !v.mot || !v.lecture || !v.sens);
  if (incomplet) throw new Error('entree incomplete : ' + JSON.stringify(incomplet));
});

essai('PRATIQUE_VOCAB a des ids tous uniques', () => {
  const ids = new Set(PRATIQUE_VOCAB.map(v => v.id));
  if (ids.size !== PRATIQUE_VOCAB.length) throw new Error('des ids sont dupliques');
});

essai('getPratiqueList filtre correctement par theme', () => {
  const compteurs = getPratiqueList('compteurs');
  if (compteurs.length === 0) throw new Error('le theme compteurs ne devrait pas etre vide');
  if (compteurs.some(v => v.theme !== 'compteurs')) throw new Error('getPratiqueList a laisse passer un autre theme');
});

essai('startPratiqueQuiz met en file tous les mots du theme choisi', () => {
  DB = baseDB();
  startPratiqueQuiz('couleurs');
  if (quizSession.mode !== 'pratique' || quizSession.theme !== 'couleurs') throw new Error('etat de session incorrect');
  if (quizSession.queue.length !== getPratiqueList('couleurs').length) {
    throw new Error('taille de file incorrecte : ' + quizSession.queue.length);
  }
});

essai('recordPratiqueSessionResult est isole de DB.scores/DB.scoresTraduction', () => {
  DB = baseDB();
  recordPratiqueSessionResult('heure', 20, 27 * 10, 74);
  recordTraductionSessionResult('s1', 1, 5, 30, 17);
  if (Object.keys(DB.scores).length !== 0) throw new Error('DB.scores ne doit pas etre touche');
  const entryPratique = getPratiqueScoreEntry('heure');
  const entryTraduction = getTraductionScoreEntry('s1', 1);
  if (!entryPratique || entryPratique.best.pct !== 74) throw new Error('score pratique incorrect');
  if (!entryTraduction || entryTraduction.best.pct !== 17) throw new Error('les deux namespaces ne doivent pas se melanger');
});

essai('savePratiqueInProgress / getValidPratiqueInProgress / clearPratiqueInProgress font un aller-retour correct', () => {
  DB = baseDB();
  startPratiqueQuiz('compteurs');
  quizSession.answers.push({ mot: 'x', lecture: 'y', sens: 'z', userAnswer: 'y', points: 10, pct: 1 });
  savePratiqueInProgress();
  const saved = getValidPratiqueInProgress('compteurs');
  if (!saved || saved.index !== 1) throw new Error('reprise pratique incorrecte');
  clearPratiqueInProgress('compteurs');
  if (getValidPratiqueInProgress('compteurs')) throw new Error('la sauvegarde pratique devrait avoir disparu');
});

essai('un compte sans DB.scoresPratique/DB.inProgressPratique (avant migration) ne plante pas', () => {
  DB = baseDB();
  if (getPratiqueScoreEntry('compteurs') !== null) throw new Error('attendu null sans DB.scoresPratique');
  if (getValidPratiqueInProgress('compteurs') !== null) throw new Error('attendu null sans DB.inProgressPratique');
});

// ---------- Chrono par quiz (rang 2 de la feuille de route, 22/09/2026) ----------
essai('recordTraductionSessionResult enregistre la duree passee en 6e argument', () => {
  DB = { scoresTraduction: {} };
  recordTraductionSessionResult('s1', 9, 27, 30, 90, 88000);
  const entry = getTraductionScoreEntry('s1', 9);
  if (entry.best.dureeMs !== 88000) throw new Error(JSON.stringify(entry));
});

essai('recordPratiqueSessionResult enregistre la duree passee en 5e argument', () => {
  DB = { scoresPratique: {} };
  recordPratiqueSessionResult('heure', 250, 270, 92, 60000);
  const entry = getPratiqueScoreEntry('heure');
  if (entry.best.dureeMs !== 60000) throw new Error(JSON.stringify(entry));
});
