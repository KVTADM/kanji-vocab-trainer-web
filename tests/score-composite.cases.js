// Scénarios du score composite, évalués dans la même portée que les
// fonctions extraites d'app.js.

function fixerSemestres(...ids) {
  DB = { settings: { semesters: ids.map(id => ({ id })) } };
}

essai('une meilleure précision augmente le score, toutes choses égales par ailleurs', () => {
  fixerSemestres('s1', 's2');
  const bas = scoreComposite({ pct: 50, dureeMs: 200000, essais: 3, semesterId: 's1', mode: 'vocab' });
  const haut = scoreComposite({ pct: 95, dureeMs: 200000, essais: 3, semesterId: 's1', mode: 'vocab' });
  if (haut <= bas) throw new Error('95% devrait scorer plus haut que 50% : ' + haut + ' vs ' + bas);
});

essai('une session plus rapide augmente le score', () => {
  fixerSemestres('s1', 's2');
  const lent = scoreComposite({ pct: 80, dureeMs: 590000, essais: 3, semesterId: 's1', mode: 'vocab' });
  const rapide = scoreComposite({ pct: 80, dureeMs: 30000, essais: 3, semesterId: 's1', mode: 'vocab' });
  if (rapide <= lent) throw new Error('une session rapide devrait scorer plus haut : ' + rapide + ' vs ' + lent);
});

essai('sans temps enregistré, la vitesse est neutre (ni avantagée ni pénalisée)', () => {
  fixerSemestres('s1', 's2');
  const sansTemps = scoreComposite({ pct: 80, dureeMs: null, essais: 3, semesterId: 's1', mode: 'vocab' });
  const tempsMoyen = scoreComposite({ pct: 80, dureeMs: 300000, essais: 3, semesterId: 's1', mode: 'vocab' }); // ~50% du temps de référence
  if (Math.abs(sansTemps - tempsMoyen) > 1) throw new Error('temps absent devrait valoir ~= temps de référence : ' + sansTemps + ' vs ' + tempsMoyen);
});

essai('l\'assiduité plafonne à 5 essais, au-delà ça ne change plus rien', () => {
  fixerSemestres('s1', 's2');
  const cinq = scoreComposite({ pct: 80, dureeMs: 200000, essais: 5, semesterId: 's1', mode: 'vocab' });
  const cinquante = scoreComposite({ pct: 80, dureeMs: 200000, essais: 50, semesterId: 's1', mode: 'vocab' });
  if (cinq !== cinquante) throw new Error('au-delà de 5 essais, le score ne devrait plus bouger : ' + cinq + ' vs ' + cinquante);
});

essai('un semestre plus avancé dans le programme augmente le score', () => {
  fixerSemestres('s1', 's2', 's3');
  const premier = scoreComposite({ pct: 80, dureeMs: 200000, essais: 3, semesterId: 's1', mode: 'vocab' });
  const dernier = scoreComposite({ pct: 80, dureeMs: 200000, essais: 3, semesterId: 's3', mode: 'vocab' });
  if (dernier <= premier) throw new Error('le dernier semestre devrait scorer plus haut que le premier : ' + dernier + ' vs ' + premier);
});

essai('le mode Kanji seul (sans indice) est considéré plus difficile que Vocabulaire', () => {
  fixerSemestres('s1', 's2');
  const vocab = scoreComposite({ pct: 80, dureeMs: 200000, essais: 3, semesterId: 's1', mode: 'vocab' });
  const kanji = scoreComposite({ pct: 80, dureeMs: 200000, essais: 3, semesterId: 's1', mode: 'kanji' });
  if (kanji <= vocab) throw new Error('Kanji seul devrait scorer plus haut que Vocabulaire à résultat égal : ' + kanji + ' vs ' + vocab);
});

essai('un semestre inconnu (deck partagé) ne casse rien et reste neutre', () => {
  fixerSemestres('s1', 's2');
  const score = scoreComposite({ pct: 80, dureeMs: 200000, essais: 3, semesterId: 'deck-venu-dailleurs', mode: 'vocab' });
  if (!Number.isFinite(score)) throw new Error('score composite invalide : ' + score);
});

essai('positionSemestre place le premier à 0 et le dernier à 1', () => {
  fixerSemestres('s1', 's2', 's3');
  if (positionSemestre('s1') !== 0) throw new Error('premier semestre = ' + positionSemestre('s1'));
  if (positionSemestre('s3') !== 1) throw new Error('dernier semestre = ' + positionSemestre('s3'));
  if (Math.abs(positionSemestre('s2') - 0.5) > 1e-9) throw new Error('semestre du milieu = ' + positionSemestre('s2'));
});

essai('sans aucun historique, le score composite personnel est absent (pas zéro)', () => {
  fixerSemestres('s1');
  DB.scores = {}; DB.scoresKanji = {}; DB.scoresTraduction = {}; DB.scoresDouble = {};
  const composite = getScoreCompositePersonnel();
  if (composite !== null) throw new Error('devrait être null sans historique, reçu ' + composite);
});

essai('le score composite personnel moyenne les 4 modes synchronisés', () => {
  fixerSemestres('s1', 's2');
  DB.scores = { 's1-w1': { best: { pct: 90, dureeMs: 60000 }, history: [1, 2, 3] } };
  DB.scoresKanji = { 's2-w1': { best: { pct: 70, dureeMs: 200000 }, history: [1] } };
  DB.scoresTraduction = {};
  DB.scoresDouble = {};
  const attendu = Math.round((
    scoreComposite({ pct: 90, dureeMs: 60000, essais: 3, semesterId: 's1', mode: 'vocab' }) +
    scoreComposite({ pct: 70, dureeMs: 200000, essais: 1, semesterId: 's2', mode: 'kanji' })
  ) / 2);
  const composite = getScoreCompositePersonnel();
  if (composite !== attendu) throw new Error('score composite personnel = ' + composite + ', attendu ' + attendu);
});
