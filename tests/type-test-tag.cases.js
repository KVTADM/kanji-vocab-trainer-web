// Scénarios pour libelleFiltreMots() et le suivi du filtre "Mots" sur les
// scores enregistrés (recordSessionResult), ajoutés le 09/09/2026 : Paul
// veut voir sur le Tableau de bord quel type de test a été fait (mots à
// kanji groupés / simples / tous), pas seulement le score ou la
// progression brute.

essai('libelleFiltreMots("kanji_groupe") -> mots à kanji groupés', () => {
  if (libelleFiltreMots('kanji_groupe') !== 'mots à kanji groupés') throw new Error(libelleFiltreMots('kanji_groupe'));
});

essai('libelleFiltreMots("simple") -> mots simples', () => {
  if (libelleFiltreMots('simple') !== 'mots simples') throw new Error(libelleFiltreMots('simple'));
});

essai('libelleFiltreMots("tous") -> tous les mots', () => {
  if (libelleFiltreMots('tous') !== 'tous les mots') throw new Error(libelleFiltreMots('tous'));
});

essai('libelleFiltreMots("aucun") -> aucun mot', () => {
  if (libelleFiltreMots('aucun') !== 'aucun mot') throw new Error(libelleFiltreMots('aucun'));
});

essai('libelleFiltreMots(valeur inconnue ou vide) retombe sur "tous les mots" sans planter', () => {
  if (libelleFiltreMots('sans_verbe') !== 'tous les mots') throw new Error(libelleFiltreMots('sans_verbe'));
  if (libelleFiltreMots(undefined) !== 'tous les mots') throw new Error(libelleFiltreMots(undefined));
  if (libelleFiltreMots(null) !== 'tous les mots') throw new Error(libelleFiltreMots(null));
});

essai('recordSessionResult enregistre le filtre utilisé sur le meilleur score', () => {
  DB = { scores: {} };
  recordSessionResult('s1', 3, 80, 100, 80, 'kanji_groupe');
  const entry = getScoreEntry('s1', 3);
  if (!entry || entry.best.verbeFilter !== 'kanji_groupe') throw new Error(JSON.stringify(entry));
});

essai('recordSessionResult sans filtre precise retombe sur "tous" (retro-compatible)', () => {
  DB = { scores: {} };
  recordSessionResult('s1', 4, 50, 100, 50);
  const entry = getScoreEntry('s1', 4);
  if (entry.best.verbeFilter !== 'tous') throw new Error(JSON.stringify(entry));
});

essai('une meilleure tentative avec un filtre different met a jour le filtre affiche', () => {
  DB = { scores: {} };
  recordSessionResult('s1', 5, 40, 100, 40, 'simple');
  recordSessionResult('s1', 5, 90, 100, 90, 'kanji_groupe');
  const entry = getScoreEntry('s1', 5);
  if (entry.best.verbeFilter !== 'kanji_groupe' || entry.best.pct !== 90) throw new Error(JSON.stringify(entry));
  if (entry.history.length !== 2) throw new Error('les 2 tentatives doivent rester dans l\'historique');
});
