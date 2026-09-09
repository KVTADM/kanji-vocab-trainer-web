// Scénarios pour le mode "Kana" (hiragana/katakana -> romaji).

function baseKanaDB() {
  return { scoresKana: {}, inProgressKana: {} };
}

// ---------- Intégrité de la table de référence ----------

essai('la table hiragana contient exactement 104 entrees (gojuon + dakuten/handakuten + yoon)', () => {
  if (KANA_HIRAGANA.length !== 104) throw new Error('obtenu ' + KANA_HIRAGANA.length);
});

essai('la table katakana contient autant d\'entrees que la table hiragana', () => {
  if (KANA_KATAKANA.length !== KANA_HIRAGANA.length) {
    throw new Error('hiragana=' + KANA_HIRAGANA.length + ' katakana=' + KANA_KATAKANA.length);
  }
});

essai('chaque entree katakana a le meme romaji et le meme groupe que son equivalent hiragana, dans le meme ordre', () => {
  for (let i = 0; i < KANA_HIRAGANA.length; i++) {
    if (KANA_HIRAGANA[i].romaji !== KANA_KATAKANA[i].romaji) {
      throw new Error(`index ${i}: romaji different (${KANA_HIRAGANA[i].romaji} vs ${KANA_KATAKANA[i].romaji})`);
    }
    if (KANA_HIRAGANA[i].groupId !== KANA_KATAKANA[i].groupId) {
      throw new Error(`index ${i}: groupe different`);
    }
  }
});

essai('la katakana est bien derivee de la hiragana par un decalage constant de +0x60 en codepoint', () => {
  KANA_HIRAGANA.forEach((entry, i) => {
    const kata = KANA_KATAKANA[i].char;
    if (entry.char.length !== kata.length) throw new Error('longueur differente a l\'index ' + i);
    for (let c = 0; c < entry.char.length; c++) {
      const diff = kata.codePointAt(c) - entry.char.codePointAt(c);
      if (diff !== 0x60) throw new Error(`decalage inattendu (${diff}) sur ${entry.char}[${c}] -> ${kata}[${c}]`);
    }
  });
});

essai('les 5 groupes de KANA_GROUPS sont tous representes dans la table hiragana', () => {
  const groupesUtilises = new Set(KANA_HIRAGANA.map(k => k.groupId));
  KANA_GROUPS.forEach(g => {
    if (!groupesUtilises.has(g.id)) throw new Error('groupe ' + g.id + ' jamais utilise');
  });
  if (KANA_GROUPS.length !== 5) throw new Error('attendu 5 groupes, obtenu ' + KANA_GROUPS.length);
});

essai('aucune entree hiragana n\'a de romaji ou de caractere vide', () => {
  KANA_HIRAGANA.forEach(k => {
    if (!k.char || !k.romaji) throw new Error('entree incomplete : ' + JSON.stringify(k));
  });
});

// ---------- buildKanaQueue / getKanaList ----------

essai('buildKanaQueue filtre correctement par type et par groupe', () => {
  DB = baseKanaDB();
  const q = buildKanaQueue('hiragana', 'g1');
  if (q.length !== 15) throw new Error('attendu 15 (voyelles+ka+sa), obtenu ' + q.length);
  q.forEach(k => { if (k.groupId !== 'g1') throw new Error('fuite d\'un autre groupe'); });
});

essai('buildKanaQueue distingue bien hiragana et katakana pour le meme groupe', () => {
  DB = baseKanaDB();
  const qh = buildKanaQueue('hiragana', 'g5');
  const qk = buildKanaQueue('katakana', 'g5');
  if (qh.length !== qk.length) throw new Error('tailles differentes');
  if (qh[0].char === qk[0].char) throw new Error('les caracteres ne devraient pas etre identiques (hiragana vs katakana)');
  if (qh[0].romaji !== qk[0].romaji) throw new Error('le romaji devrait etre identique entre les deux syllabaires');
});

essai('getKanaList retombe sur hiragana par defaut pour un type inconnu', () => {
  const l = getKanaList('autrechose');
  if (l !== KANA_HIRAGANA) throw new Error('attendu repli sur hiragana');
});

// ---------- recordKanaSessionResult / getKanaScoreEntry : isolation ----------

essai('recordKanaSessionResult ecrit dans DB.scoresKana avec une cle par type+groupe, sans collision entre hiragana et katakana', () => {
  DB = baseKanaDB();
  recordKanaSessionResult('hiragana', 'g1', 100, 100, 100);
  recordKanaSessionResult('katakana', 'g1', 40, 100, 40);
  const eh = getKanaScoreEntry('hiragana', 'g1');
  const ek = getKanaScoreEntry('katakana', 'g1');
  if (eh.best.pct !== 100) throw new Error('hiragana g1 incorrect');
  if (ek.best.pct !== 40) throw new Error('katakana g1 incorrect, contamine par hiragana ? ' + JSON.stringify(ek));
});

essai('recordKanaSessionResult ne touche jamais DB.scores ni DB.scoresKanji', () => {
  DB = baseKanaDB();
  DB.scores = { 'l0-s2-w3': { best: { pct: 55 } } };
  DB.scoresKanji = { 'l0-s2-w3': { best: { pct: 77 } } };
  recordKanaSessionResult('hiragana', 'g1', 100, 100, 100);
  if (DB.scores['l0-s2-w3'].best.pct !== 55) throw new Error('DB.scores (vocabulaire) modifie par erreur');
  if (DB.scoresKanji['l0-s2-w3'].best.pct !== 77) throw new Error('DB.scoresKanji modifie par erreur');
});

essai('getKanaScoreEntry garde le meilleur score au fil de plusieurs sessions', () => {
  DB = baseKanaDB();
  recordKanaSessionResult('hiragana', 'g2', 30, 150, 20);
  recordKanaSessionResult('hiragana', 'g2', 150, 150, 100);
  recordKanaSessionResult('hiragana', 'g2', 90, 150, 60);
  const entry = getKanaScoreEntry('hiragana', 'g2');
  if (entry.best.pct !== 100) throw new Error('meilleur score attendu 100, obtenu ' + entry.best.pct);
  if (entry.history.length !== 3) throw new Error('historique attendu 3 entrees');
});

essai('getKanaScoreEntry renvoie null pour un groupe jamais joue', () => {
  DB = baseKanaDB();
  if (getKanaScoreEntry('hiragana', 'g4') !== null) throw new Error('attendu null');
});

// ---------- getValidKanaInProgress ----------

essai('getValidKanaInProgress retrouve une sauvegarde dont la file correspond exactement', () => {
  DB = baseKanaDB();
  const queue = buildKanaQueue('hiragana', 'g1');
  DB.inProgressKana['hiragana-g1'] = { queue, index: 2, answers: [{}, {}], totals: { points: 10, maxPoints: 150 }, updatedAt: 'x' };
  const saved = getValidKanaInProgress('hiragana', 'g1');
  if (!saved) throw new Error('sauvegarde valide non retrouvee');
  if (saved.index !== 2) throw new Error('index incorrect');
});

essai('getValidKanaInProgress rejette une sauvegarde perimee (ordre/contenu de la file different)', () => {
  DB = baseKanaDB();
  DB.inProgressKana['hiragana-g1'] = {
    queue: [{ char: 'ぞ', romaji: 'zo', groupId: 'g4' }],
    index: 0, answers: [], totals: { points: 0, maxPoints: 10 }, updatedAt: 'x'
  };
  const saved = getValidKanaInProgress('hiragana', 'g1');
  if (saved !== null) throw new Error('attendu null pour une file perimee');
});

essai('getValidKanaInProgress rejette une session deja terminee', () => {
  DB = baseKanaDB();
  const queue = buildKanaQueue('hiragana', 'g1');
  DB.inProgressKana['hiragana-g1'] = { queue, index: queue.length, answers: [], totals: { points: 0, maxPoints: 150 }, updatedAt: 'x' };
  if (getValidKanaInProgress('hiragana', 'g1') !== null) throw new Error('attendu null');
});

// ---------- saveKanaInProgress / clearKanaInProgress ----------

essai('saveKanaInProgress ne fait rien si la session active n\'est pas en mode kana', () => {
  DB = baseKanaDB();
  quizSession = { mode: 'vocab' };
  saveKanaInProgress();
  if (Object.keys(DB.inProgressKana).length !== 0) throw new Error('DB.inProgressKana n\'aurait pas du etre modifie');
});

essai('clearKanaInProgress supprime uniquement l\'entree kana concernee, jamais DB.inProgressKanji', () => {
  DB = baseKanaDB();
  DB.inProgressKanji = { 'l0-s2-w3': { queue: [] } };
  DB.inProgressKana['hiragana-g1'] = { queue: [] };
  DB.inProgressKana['katakana-g1'] = { queue: [] };
  clearKanaInProgress('hiragana', 'g1');
  if (DB.inProgressKana['hiragana-g1']) throw new Error('l\'entree hiragana-g1 aurait du etre effacee');
  if (!DB.inProgressKana['katakana-g1']) throw new Error('katakana-g1 n\'aurait pas du etre touche');
  if (!DB.inProgressKanji['l0-s2-w3']) throw new Error('DB.inProgressKanji n\'aurait pas du etre touche');
});
