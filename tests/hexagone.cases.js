// Scénarios du graphique hexagonal, évalués dans la même portée que les
// fonctions extraites d'app.js.

function fixerDB(overrides) {
  DB = Object.assign({
    settings: { semesters: [{ id: 's1' }, { id: 's2' }] },
    scores: {}, scoresKanji: {}, scoresTraduction: {}, scoresDouble: {},
    gamification: { streak: { compte: 0 } },
    wordStats: {},
    vocab: []
  }, overrides);
}

essai('sans aucune session, aucuneDonnee est vrai et rien ne plante', () => {
  fixerDB({});
  const stats = getHexagoneStats();
  if (!stats.aucuneDonnee) throw new Error('devrait signaler l\'absence de données');
  if (stats.precision !== 0) throw new Error('précision devrait être 0 sans donnée : ' + stats.precision);
});

essai('la précision reflète la moyenne des meilleurs % sur les 4 modes', () => {
  fixerDB({
    scores: { 's1-w1': { best: { pct: 80, dureeMs: 100000 }, history: [{ date: '2026-01-01', pct: 80 }] } },
    scoresKanji: { 's1-w2': { best: { pct: 60, dureeMs: 100000 }, history: [{ date: '2026-01-01', pct: 80 }] } }
  });
  const stats = getHexagoneStats();
  if (Math.abs(stats.precision - 0.7) > 1e-9) throw new Error('précision = ' + stats.precision + ', attendu 0.7');
});

essai('une session plus rapide augmente l\'axe vitesse', () => {
  fixerDB({ scores: { 's1-w1': { best: { pct: 80, dureeMs: 60000 }, history: [{ date: '2026-01-01', pct: 80 }] } } });
  const rapide = getHexagoneStats().vitesse;
  fixerDB({ scores: { 's1-w1': { best: { pct: 80, dureeMs: 590000 }, history: [{ date: '2026-01-01', pct: 80 }] } } });
  const lent = getHexagoneStats().vitesse;
  if (rapide <= lent) throw new Error('vitesse rapide (' + rapide + ') devrait dépasser vitesse lente (' + lent + ')');
});

essai('sans aucune durée enregistrée, l\'axe vitesse reste à 0 plutôt que neutre', () => {
  fixerDB({ scores: { 's1-w1': { best: { pct: 80, dureeMs: null }, history: [{ date: '2026-01-01', pct: 80 }] } } });
  const stats = getHexagoneStats();
  if (stats.vitesse !== 0) throw new Error('vitesse sans donnée = ' + stats.vitesse + ', attendu 0');
});

essai('la régularité suit le streak actuel, plafonné à 30 jours', () => {
  fixerDB({ gamification: { streak: { compte: 15 } } });
  if (Math.abs(getHexagoneStats().regularite - 0.5) > 1e-9) throw new Error('régularité à 15 jours = ' + getHexagoneStats().regularite);
  fixerDB({ gamification: { streak: { compte: 60 } } });
  if (getHexagoneStats().regularite !== 1) throw new Error('régularité au-delà de 30 jours devrait plafonner à 1');
});

essai('le volume est la part du vocabulaire total déjà vue', () => {
  fixerDB({ vocab: [1, 2, 3, 4], wordStats: { a: {}, b: {} } });
  if (Math.abs(getHexagoneStats().volume - 0.5) > 1e-9) throw new Error('volume = ' + getHexagoneStats().volume + ', attendu 0.5');
});

essai('la difficulté moyenne les semestres réellement travaillés', () => {
  fixerDB({
    settings: { semesters: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] },
    scores: { 's3-w1': { best: { pct: 80, dureeMs: 100000 }, history: [{ date: '2026-01-01', pct: 80 }] } } // dernier semestre = position 1
  });
  if (getHexagoneStats().difficulte !== 1) throw new Error('difficulté = ' + getHexagoneStats().difficulte + ', attendu 1 (dernier semestre)');
});

essai('moins de 4 sessions au total : la progression reste neutre', () => {
  fixerDB({ scores: { 's1-w1': { best: { pct: 80, dureeMs: 100000 }, history: [{ date: '2026-01-01', pct: 80 }] } } });
  if (getHexagoneStats().progression !== 0.5) throw new Error('progression avec peu d\'historique = ' + getHexagoneStats().progression);
});

essai('une tendance récente à la hausse augmente l\'axe progression', () => {
  const historique = [
    { date: '2026-01-01', pct: 40 }, { date: '2026-01-02', pct: 40 },
    { date: '2026-01-03', pct: 90 }, { date: '2026-01-04', pct: 90 }
  ];
  fixerDB({ scores: { 's1-w1': { best: { pct: 90, dureeMs: 100000 }, history: historique } } });
  if (getHexagoneStats().progression <= 0.5) throw new Error('une nette amélioration devrait pousser la progression au-dessus de 0.5');
});

essai('le SVG généré contient les 6 axes attendus', () => {
  const stats = { precision: 0.8, vitesse: 0.6, regularite: 0.3, volume: 0.5, difficulte: 0.7, progression: 0.9 };
  const svg = renderHexagoneSvg(stats);
  ['Précision', 'Vitesse', 'Régularité', 'Volume', 'Difficulté', 'Progression'].forEach((label) => {
    if (!svg.includes(label)) throw new Error('axe manquant dans le SVG : ' + label);
  });
  if (!svg.includes('<polygon points=')) throw new Error('le polygone de données est absent');
});

essai('le SVG ne plante pas avec des valeurs à 0 partout', () => {
  const svg = renderHexagoneSvg({ precision: 0, vitesse: 0, regularite: 0, volume: 0, difficulte: 0, progression: 0 });
  if (!svg.includes('<svg')) throw new Error('SVG invalide sur des stats toutes nulles');
});
