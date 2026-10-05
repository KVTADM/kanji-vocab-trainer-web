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

// Double reponse : sens francais assoupli (signalement du 28/09/2026).
essai('scoreSens : casse, accents, parentheses, alternatives et ordre tolérés', () => {
  DB = baseDB();
  const ok = (saisie, sens) => {
    const r = scoreSens(saisie, sens);
    if (r.pct !== 1) throw new Error('"' + saisie + '" pour "' + sens + '" -> ' + r.pct);
  };
  ok('identique', 'identique, égal');
  ok('Descendre', "Descendre (d'un véhicule, d'un escalier)");
  ok("descendre d'un vehicule d'un escalier", "Descendre (d'un véhicule, d'un escalier)");
  ok('droite gauche', 'gauche, droite');
  ok('egal', 'identique, égal');
  ok('SOUTIEN', 'Soutien / support.');
  ok('se promener aux alentours de la gare', 'Se promener aux alentours de la gare');
  const faux = scoreSens('voiture', 'gauche, droite');
  if (faux.pct > 0.5) throw new Error('une reponse fausse passe : ' + faux.pct);
  const vide = scoreSens('', 'gauche, droite');
  if (vide.pct !== 0) throw new Error('une reponse vide rapporte des points : ' + vide.pct);
});

essai('durée de session : une pause (session reprise le lendemain) ne compte pas', () => {
  const t = { startedAt: Date.now() - 30000 };
  noterActivite(t);                                  // 1re réponse après 30 s
  t.derniereActivite = Date.now() - 24 * 3600 * 1000; // puis 24 h de pause
  noterActivite(t);
  const d = dureeSessionMs(t);
  if (d > 30000 + DUREE_PLAFOND_ENTRE_REPONSES_MS + 1000 || d < 30000) throw new Error('durée=' + d);
  if (dureeSessionMs({ startedAt: Date.now() - 5000 }) < 5000) throw new Error('repli sur startedAt cassé');
});

// ---------- Classement et % (29/09/2026) ----------

essai('calculerPct / formatPct : 1 décimale si pas rond, 100 % réservé au sans-faute', () => {
  if (calculerPct(390, 400) !== 97.5) throw new Error('390/400 = ' + calculerPct(390, 400));
  if (calculerPct(569, 570) !== 99.8) throw new Error('569/570 = ' + calculerPct(569, 570));
  if (calculerPct(5699, 5700) !== 99.9) throw new Error('presque parfait doit plafonner à 99,9 : ' + calculerPct(5699, 5700));
  if (calculerPct(10, 10) !== 100 || calculerPct(0, 0) !== 0) throw new Error('bornes');
  if (formatPct(97.5) !== '97,5 %' || formatPct(100) !== '100 %' || formatPct(84) !== '84 %') throw new Error(formatPct(97.5) + '|' + formatPct(100));
});

essai('comparerResultats : %, puis difficulté, puis temps', () => {
  const r = (pct, difficulte, dureeMs) => ({ pct, difficulte, dureeMs });
  if (!(comparerResultats(r(100, 'difficile', 90000), r(100, 'normal', 30000)) > 0)) throw new Error('Difficile devrait battre Normal à % égal');
  if (!(comparerResultats(r(100, 'facile', 10000), r(100, 'normal', 60000)) < 0)) throw new Error('Facile devrait perdre même plus rapide');
  if (!(comparerResultats(r(100, 'normal', 60000), r(80, 'difficile', 1000)) > 0)) throw new Error('le % passe avant la difficulté');
  if (!(comparerResultats(r(90, 'normal', 40000), r(90, 'normal', 50000)) > 0)) throw new Error('le plus rapide gagne');
});

essai('meilleurPourClassement ignore les sessions filtrées ; nbEssais compte les recommencements', () => {
  DB = baseDB();
  const hist = [
    { pct: 100, verbeFilter: 'simple', difficulte: 'normal' },
    { pct: 80, verbeFilter: 'tous', difficulte: 'normal' },
    { pct: 70 } // ancienne tentative sans filtre enregistre = "tous"
  ];
  if (meilleurPourClassement(hist).pct !== 80) throw new Error('la session filtrée à 100 % ne doit pas compter');
  if (meilleurPourClassement([{ pct: 100, verbeFilter: 'simple' }]) !== null) throw new Error('rien d\'éligible -> null');
  noterRecommencement('vocab', 's1', 3); noterRecommencement('vocab', 's1', 3);
  if (nbEssais({ history: hist }, 'vocab', 's1', 3) !== 5) throw new Error('3 terminées + 2 recommencées = 5, obtenu ' + nbEssais({ history: hist }, 'vocab', 's1', 3));
});

essai('rechercherVocab : kanji, kana, romaji et français (sans accents) ; mots masqués exclus', () => {
  DB = baseDB();
  DB.kanjiGroups.push({ id: 'g9', semesterId: 's1', week: 2, kanji: '験' });
  DB.vocab.push({ id: 'v9', kanjiGroupId: 'g9', mot: '試験', lecture: 'しけん', sens: 'Examen, épreuve' });
  const ids = (q) => rechercherVocab(q).map(r => r.v.id);
  if (!ids('試験').includes('v9')) throw new Error('kanji');
  if (!ids('しけん').includes('v9')) throw new Error('kana');
  if (!ids('shiken').includes('v9')) throw new Error('romaji');
  if (!ids('EPREUVE').includes('v9')) throw new Error('français sans accent');
  if (ids('').length) throw new Error('requête vide');
  DB.motsMasques = ['v9'];
  if (ids('試験').includes('v9')) throw new Error('mot masqué trouvé');
});


essai('compteurs : les compteurs de la feuille (sauf 券, qui ne se compte pas) sont presents, chacun avec une explication', () => {
  const liste = getPratiqueList('compteurs').concat(getPratiqueList('compteurs2'));
  '個羽頭名度番線期代町杯点号'.split('').forEach(k => {
    const mots = liste.filter(v => v.mot.includes(k));
    if (mots.length < 3) throw new Error('compteur ' + k + ' : moins de 3 mots');
    if (mots.some(v => !v.note || v.note.length < 10)) throw new Error('compteur ' + k + ' : explication manquante');
  });
});

essai('compteurs : pas de doublon mot+lecture, lectures en kana, notes en texte', () => {
  const vus = new Set();
  getPratiqueList('compteurs').concat(getPratiqueList('compteurs2')).forEach(v => {
    const cle = v.mot + '|' + v.lecture;
    if (vus.has(cle)) throw new Error('doublon ' + cle);
    vus.add(cle);
    if (!/^[\u3041-\u309f\u30a0-\u30ff]+$/.test(v.lecture)) throw new Error('lecture non kana : ' + v.mot + ' ' + v.lecture);
    if (v.note !== undefined && typeof v.note !== 'string') throw new Error('note invalide : ' + v.mot);
  });
});

essai('compteurs : les formes irregulieres cles sont bien lues', () => {
  const att = { '一個':'いっこ','三羽':'さんば','六羽':'ろっぱ','一頭':'いっとう','六杯':'ろっぱい','三杯':'さんばい','一点':'いってん','十点':'じゅってん','二十歳':'はたち','一人':'ひとり','四人':'よにん','三本':'さんぼん','三階':'さんがい' };
  const liste = getPratiqueList('compteurs').concat(getPratiqueList('compteurs2'));
  Object.keys(att).forEach(m => {
    const v = liste.find(x => x.mot === m);
    if (!v || v.lecture !== att[m]) throw new Error(m + ' devrait se lire ' + att[m]);
  });
});

essai('compteurs : le theme est coupe en deux parties sans recouvrement', () => {
  const a = getPratiqueList('compteurs'), b = getPratiqueList('compteurs2');
  if (a.length < 30 || b.length < 30) throw new Error('une partie est trop petite : ' + a.length + '/' + b.length);
  const ids = new Set(a.map(v => v.id));
  if (b.some(v => ids.has(v.id))) throw new Error('recouvrement entre les deux parties');
  if (a.some(v => /[度番線期代町杯点号]/.test(v.mot))) throw new Error('un compteur de la partie 2 est dans la partie 1');
});

essai('trace : fleches precedent/suivant parcourent les kanji de la semaine et s\'arretent aux bords', () => {
  modalTraceListe = ['日', '月', '火'];
  modalTraceKanji = '日';
  if (traceKanjiVoisin(-1)) throw new Error('pas de precedent avant le premier');
  if (!traceKanjiVoisin(1) || modalTraceKanji !== '月') throw new Error('suivant 日 -> 月');
  if (!traceKanjiVoisin(1) || modalTraceKanji !== '火') throw new Error('suivant 月 -> 火');
  if (traceKanjiVoisin(1)) throw new Error('pas de suivant apres le dernier');
  if (!traceKanjiVoisin(-1) || modalTraceKanji !== '月') throw new Error('precedent 火 -> 月');
  const html = htmlNavTraceKanji();
  if (!html.includes('2 / 3')) throw new Error('position affichee incorrecte : ' + html);
  if (html.includes('btnTracePrec" aria-label="Kanji precedent" title="Kanji precedent (fleche gauche)" disabled')) throw new Error('precedent ne devrait pas etre desactive au milieu');
  modalTraceListe = null;
  if (htmlNavTraceKanji() !== '') throw new Error('pas de fleches hors page Vocabulaire');
  if (traceKanjiVoisin(1)) throw new Error('pas de navigation sans liste');
  modalTraceKanji = null;
});

essai('compteurs : aucun mot compose qui n\'est pas une forme de compteur', () => {
  const interdits = ['回数券','入場券','乗車券','食券','商品券','羽毛','山手線','新幹線','前期','後期','学期','時代','電気代','代金','番号','電話番号','満点','乾杯'];
  const liste = getPratiqueList('compteurs').concat(getPratiqueList('compteurs2'));
  const trouve = liste.find(v => interdits.includes(v.mot));
  if (trouve) throw new Error(trouve.mot + ' n\'est pas un compteur');
});

essai('cartes du vocabulaire pratique : couleur de palier selon le meilleur score', () => {
  DB = baseDB();
  DB.scoresPratique = { compteurs: { best: { points: 10, maxPoints: 10, pct: 100, history: [] }, history: [] }, couleurs: { best: { points: 2, maxPoints: 10, pct: 20 }, history: [] }, heure: { best: { points: 6, maxPoints: 10, pct: 60 }, history: [] } };
  const html = buildPratiqueCardsHtml('review-week-card', 'r');
  const carte = (t) => (html.split('\n').find(l => l.includes('data-theme="' + t + '"')) || '');
  if (!carte('compteurs').includes('palier-parfait')) throw new Error('compteurs 100% devrait etre palier-parfait');
  if (!carte('couleurs').includes('palier-faible')) throw new Error('couleurs 20% devrait etre palier-faible');
  if (!carte('heure').includes('palier-moyen')) throw new Error('heure 60% devrait etre palier-moyen');
  if (carte('compteurs2').includes('palier')) throw new Error('un theme sans score ne doit pas avoir de palier');
});

essai('traduction : le sens est decoupe hors parentheses, une definition par ligne', () => {
  const p = decouperSens('cohue, encombrement');
  if (p.length !== 2 || p[0] !== 'cohue' || p[1] !== 'encombrement') throw new Error('decoupe : ' + JSON.stringify(p));
  const q = decouperSens('un (objet, generique)');
  if (q.length !== 1 || q[0] !== 'un (objet, generique)') throw new Error('virgule entre parentheses coupee : ' + JSON.stringify(q));
  if (decouperSens('a; b, c').length !== 3) throw new Error('point-virgule');
  if (decouperSens('').length !== 0) throw new Error('vide');
  const h = htmlSensTraduction('cohue, encombrement');
  if ((h.match(/sens-trad-ligne/g) || []).length !== 2) throw new Error('2 lignes attendues');
  if (!htmlSensTraduction('<b>x</b>').includes('&lt;b&gt;')) throw new Error('echappement HTML');
  if (classeTailleSens(['abc']) !== '' || classeTailleSens(['a'.repeat(30)]) !== 'sens-trad--long' || classeTailleSens(['a'.repeat(50)]) !== 'sens-trad--tres-long') throw new Error('classes de taille');
});

essai('reponse vide : message habituel + bouton "Je ne sais pas" seulement dans ce cas', () => {
  if (verifierSaisieJp('') !== MSG_REPONSE_VIDE || verifierSaisieJp('   ') !== MSG_REPONSE_VIDE) throw new Error('message vide attendu');
  quizSession = { warning: MSG_REPONSE_VIDE };
  if (!htmlBoutonPasser().includes('btn-passer-sans-reponse')) throw new Error('bouton attendu apres une validation vide');
  quizSession = { warning: 'Ta réponse contient du kanji' };
  if (htmlBoutonPasser() !== '') throw new Error('pas de bouton pour un autre avertissement');
  quizSession = null;
  if (htmlBoutonPasser() !== '') throw new Error('pas de bouton sans session');
});

essai('reponse vide : chaque mode sait noter une reponse vide (0 point, pas d\'erreur)', () => {
  const v = { mot: '学校', lecture: 'がっこう', sens: 'ecole' };
  [scoreAnswer('', v.lecture), scoreTraductionAnswer('', v), scoreDoubleAnswer('', '', v)].forEach((r, i) => {
    if (!r || r.points !== 0) throw new Error('mode ' + i + ' : une reponse vide doit valoir 0 point');
  });
});

essai('temps : deux themes (jours / mois-annees), tous avec une explication, lectures cles correctes', () => {
  const t1 = getPratiqueList('temps'), t2 = getPratiqueList('temps2');
  if (t1.length < 30 || t2.length < 30) throw new Error('themes temps trop petits : ' + t1.length + '/' + t2.length);
  const tous = t1.concat(t2);
  const sansNote = tous.find(v => !v.note || v.note.length < 10);
  if (sansNote) throw new Error('explication manquante : ' + sansNote.mot);
  const att = { '二日':'ふつか', '二十日':'はつか', '今日':'きょう', '明日':'あした', '四月':'しがつ', '七月':'しちがつ', '九月':'くがつ', '今年':'ことし', '四年':'よねん', '一週間':'いっしゅうかん', '一か月':'いっかげつ' };
  Object.keys(att).forEach(m => {
    const v = tous.find(x => x.mot === m);
    if (!v || v.lecture !== att[m]) throw new Error(m + ' devrait se lire ' + att[m]);
  });
  if (!tous.some(v => v.mot === '一日' && v.lecture === 'ついたち') || !tous.some(v => v.mot === '一日' && v.lecture === 'いちにち')) throw new Error('les deux lectures de 一日 attendues');
  const vus = new Set();
  tous.forEach(v => { const c = v.mot + '|' + v.lecture; if (vus.has(c)) throw new Error('doublon ' + c); vus.add(c); if (!/^[ぁ-ゟ゠-ヿ]+$/.test(v.lecture)) throw new Error('lecture non kana : ' + v.mot); });
});

essai('nombres : irreguliers cles (centaines, milliers, 万/億, yens) et explication partout', () => {
  const l = getPratiqueList('nombres');
  if (l.length < 50) throw new Error('theme nombres trop petit : ' + l.length);
  const att = { '三百':'さんびゃく','六百':'ろっぴゃく','八百':'はっぴゃく','三千':'さんぜん','八千':'はっせん','一万':'いちまん','一億':'いちおく','四':'よん','七':'なな','九':'きゅう','三百円':'さんびゃくえん','一万円':'いちまんえん','千円':'せんえん' };
  Object.keys(att).forEach(m => {
    const v = l.find(x => x.mot === m);
    if (!v || v.lecture !== att[m]) throw new Error(m + ' devrait se lire ' + att[m]);
  });
  const sans = l.find(v => !v.note || v.note.length < 10);
  if (sans) throw new Error('explication manquante : ' + sans.mot);
});

essai('verbes : formes N5-N3 correctes (te, nai, potentiel, imperatif, volitif, ba, passif, causatif...)', () => {
  const l = getPratiqueList('verbes1').concat(getPratiqueList('verbes2'));
  if (getPratiqueList('verbes1').length < 30 || getPratiqueList('verbes2').length < 40) throw new Error('themes verbes trop petits');
  const att = {
    '書いて':'かいて','行って':'いって','泳いで':'およいで','話して':'はなして','死んで':'しんで','買って':'かって','来て':'きて','勉強して':'べんきょうして',
    '買わない':'かわない','来ない':'こない','行った':'いった','書きたい':'かきたい',
    '書ける':'かける','買える':'かえる','食べられる':'たべられる','来られる':'こられる','勉強できる':'べんきょうできる',
    '書け':'かけ','食べろ':'たべろ','来い':'こい','勉強しろ':'べんきょうしろ',
    '読もう':'よもう','食べよう':'たべよう','来よう':'こよう','食べれば':'たべれば','来れば':'くれば','勉強すれば':'べんきょうすれば',
    '書かれる':'かかれる','書かせる':'かかせる','食べさせる':'たべさせる','来させる':'こさせる','書くな':'かくな','食べさせられる':'たべさせられる','書かされる':'かかされる'
  };
  Object.keys(att).forEach(m => {
    const v = l.find(x => x.mot === m);
    if (!v) throw new Error(m + ' absent');
    if (v.lecture !== att[m]) throw new Error(m + ' devrait se lire ' + att[m] + ' (trouve ' + v.lecture + ')');
  });
  const sans = l.find(v => !v.rappel || v.rappel.length < 20 || !v.sens);
  if (sans) throw new Error('sens/explication manquants : ' + sans.mot);
  const vus = new Set();
  l.forEach(v => { const c = v.mot + '|' + v.lecture; if (vus.has(c)) throw new Error('doublon ' + c); vus.add(c); });
});

essai('grammaire N5-N3 : themes verbes3, verbes4 et grammaire complets, avec lectures cles', () => {
  const v3 = getPratiqueList('verbes3'), v4 = getPratiqueList('verbes4'), g = getPratiqueList('grammaire');
  if (v3.length < 30 || v4.length < 40 || g.length < 40) throw new Error('themes trop petits : ' + [v3.length, v4.length, g.length]);
  const tous = v3.concat(v4, g);
  const sans = tous.find(v => !v.rappel || v.rappel.length < 20 || !v.sens);
  if (sans) throw new Error('sens/explication manquants : ' + sans.mot);
  const att = {
    '書いたら':'かいたら','行ったら':'いったら','読んだら':'よんだら','来たら':'きたら','来なかったら':'こなかったら','食べなかったら':'たべなかったら',
    '書くと':'かくと','来ると':'くると','食べなかった':'たべなかった','買わなかった':'かわなかった','来なかった':'こなかった',
    '高くない':'たかくない','高かった':'たかかった','高くなかった':'たかくなかった','良くない':'よくない','良かった':'よかった','静かじゃない':'しずかじゃない','学生じゃなかった':'がくせいじゃなかった',
    '書いている':'かいている','住んでいる':'すんでいる','知っている':'しっている','開けてある':'あけてある','買っておく':'かっておく','読んでしまう':'よんでしまう','行ってみる':'いってみる','持っていく':'もっていく','持ってくる':'もってくる','行ってもいい':'いってもいい','見てはいけない':'みてはいけない','来てほしい':'きてほしい','教えてあげる':'おしえてあげる','書いてくれる':'かいてくれる','書いてもらう':'かいてもらう','待ってください':'まってください',
    '行くつもりだ':'いくつもりだ','行かないつもりだ':'いかないつもりだ','来るかもしれない':'くるかもしれない','雨かもしれない':'あめかもしれない','静かなはずだ':'しずかなはずだ','学生のはずだ':'がくせいのはずだ','来るはずがない':'くるはずがない','雨でしょう':'あめでしょう','食べているところだ':'たべているところだ','来たところだ':'きたところだ','食べたばかりだ':'たべたばかりだ','寝てばかりいる':'ねてばかりいる','肉ばかり':'にくばかり'
  };
  Object.keys(att).forEach(m => {
    const x = tous.find(y => y.mot === m);
    if (!x) throw new Error(m + ' absent');
    if (x.lecture !== att[m]) throw new Error(m + ' devrait se lire ' + att[m] + ' (trouve ' + x.lecture + ')');
  });
  const vus = new Set();
  const complet = getPratiqueList('verbes1').concat(getPratiqueList('verbes2'), tous);
  complet.forEach(x => { const c = x.mot + '|' + x.lecture; if (vus.has(c)) throw new Error('doublon ' + c); vus.add(c); });
  const ids = new Set(PRATIQUE_VOCAB.map(x => x.id));
  if (ids.size !== PRATIQUE_VOCAB.length) throw new Error('ids dupliques');
});

essai('indications de cours : chaque mot a un sujet et un rappel courts, affiches avant la reponse', () => {
  PRATIQUE_VOCAB.forEach(v => {
    if (!v.sujet || v.sujet.length < 4 || v.sujet.length > 60) throw new Error('sujet invalide : ' + v.id + ' ' + v.sujet);
    if (!v.rappel || v.rappel.length < 20 || v.rappel.length > 200) throw new Error('rappel invalide : ' + v.id);
    if (/Nombre de base/.test(v.note || '')) throw new Error('note parasite : ' + v.id);
  });
  const h1 = htmlIndiceCours(PRATIQUE_VOCAB[0], true);
  if (h1.indexOf('indice-cours__sujet') < 0 || h1.indexOf('indice-cours__rappel') < 0) throw new Error('sujet + rappel attendus');
  const h2 = htmlIndiceCours(PRATIQUE_VOCAB[0], false);
  if (h2.indexOf('indice-cours__rappel') >= 0) throw new Error('rappel masque attendu (mode difficile / apres reponse)');
  if (htmlIndiceCours({ mot: 'x' }, true) !== '') throw new Error('entree sans sujet : rien a afficher');
});

essai('Verbes 1 et 2 : on donne le verbe a la forme neutre, la reponse (forme conjuguee) n est pas affichee', () => {
  const vs = getPratiqueList('verbes1').concat(getPratiqueList('verbes2'));
  vs.forEach(v => {
    if (!v.base || !v.baseLecture) throw new Error('base manquante : ' + v.id);
    if (v.base === v.mot) throw new Error('la base ne doit pas etre la reponse : ' + v.mot);
  });
  const x = vs.find(v => v.mot === '書いて');
  if (x.base !== '書く' || x.baseLecture !== 'かく') throw new Error('base de 書いて : ' + x.base);
});

essai('Verbes 3/4 et Grammaire : le mot de base est donne, la reponse conjuguee n est pas affichee', () => {
  const l = getPratiqueList('verbes3').concat(getPratiqueList('verbes4'), getPratiqueList('grammaire'));
  const sans = l.filter(v => !v.base);
  if (sans.length > 1) throw new Error('entrees sans base : ' + sans.map(v => v.mot).join(','));
  const x = l.find(v => v.mot === '書いたら');
  if (x.base !== '書く' || !x.montrerSens) throw new Error('base de 書いたら');
  const y = l.find(v => v.mot === '行かないつもりだ');
  if (y.base !== '行く' || y.variante !== 'négatif') throw new Error('variante de 行かないつもりだ : ' + y.variante);
  if (l.some(v => v.base === v.mot)) throw new Error('base identique a la reponse');
});
essai('Ecriture : resultat perso = somme des notes 10/5/0, sans enregistrement', () => {
  const r = calculerResultatEcriture([{ id: 'a', note: 10 }, { id: 'b', note: 5 }, { id: 'c', note: 0 }]);
  if (r.total !== 15 || r.max !== 30 || r.pct !== 50) throw new Error(JSON.stringify(r));
  if (calculerResultatEcriture([]).pct !== 0) throw new Error('liste vide');
});
essai('Fin de test : bouton semaine suivante seulement s il existe une semaine suivante non vide', () => {
  if (htmlBoutonSemaineSuivante(null) !== '') throw new Error('sans session : rien');
  if (htmlBoutonSemaineSuivante({ semesterId: 'inconnu', week: 1 }) !== '') throw new Error('semestre inconnu : rien');
});
