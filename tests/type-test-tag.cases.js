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

// ---------- Chrono par quiz (rang 2 de la feuille de route, 22/09/2026) ----------
// Fondation demandee par Paul : "un temps de 5 min bat un de 10". formatDuree()
// est la fonction de mise en forme partagee par les 5 modes de quiz ;
// recordSessionResult() accepte maintenant un 7e argument optionnel dureeMs,
// ajoute APRES verbeFilter pour ne pas casser les appels positionnels
// existants (voir les essais "retro-compatible" ci-dessus).

essai('formatDuree : moins d\'une minute -> "X s"', () => {
  if (formatDuree(45000) !== '45 s') throw new Error(formatDuree(45000));
  if (formatDuree(0) !== '0 s') throw new Error(formatDuree(0));
});

essai('formatDuree : une minute ou plus -> "X min YY s"', () => {
  if (formatDuree(272000) !== '4 min 32 s') throw new Error(formatDuree(272000));
  if (formatDuree(60000) !== '1 min 00 s') throw new Error(formatDuree(60000));
});

essai('formatDuree : valeur absente ou invalide -> null (pas d\'affichage plutot qu\'un plantage)', () => {
  if (formatDuree(null) !== null) throw new Error(String(formatDuree(null)));
  if (formatDuree(undefined) !== null) throw new Error(String(formatDuree(undefined)));
  if (formatDuree(-5) !== null) throw new Error(String(formatDuree(-5)));
  if (formatDuree(NaN) !== null) throw new Error(String(formatDuree(NaN)));
});

essai('recordSessionResult enregistre la duree passee en 7e argument', () => {
  DB = { scores: {} };
  recordSessionResult('s1', 6, 80, 100, 80, 'tous', 272000);
  const entry = getScoreEntry('s1', 6);
  if (entry.best.dureeMs !== 272000) throw new Error(JSON.stringify(entry));
});

essai('recordSessionResult sans duree precisee (anciens appels) ne plante pas', () => {
  DB = { scores: {} };
  recordSessionResult('s1', 7, 80, 100, 80, 'tous');
  const entry = getScoreEntry('s1', 7);
  if (entry.best.dureeMs !== undefined) throw new Error(JSON.stringify(entry));
});
