// Scénarios pour getWeakestWeek() (recommandation "Recommandé pour toi").

function baseDB() {
  return {
    settings: {
      semesters: [
        { id: 'l0-s2', label: 'Semestre 2 Débutant', weeks: 4 },
        { id: 'n5', label: 'JLPT N5', weeks: 2 }
      ]
    },
    scores: {}
  };
}

essai('une semaine jamais faite (aucune entree de score) est ignoree, pas de plantage', () => {
  DB = baseDB();
  const r = getWeakestWeek();
  if (r !== null) throw new Error('attendu null quand rien n\'a jamais ete fait');
});

essai('une semaine au score suffisant (>= seuil) n\'est jamais recommandee', () => {
  DB = baseDB();
  DB.scores['l0-s2-w1'] = { best: { pct: 60, points: 60, maxPoints: 100 }, history: [] };
  DB.scores['l0-s2-w2'] = { best: { pct: 100, points: 100, maxPoints: 100 }, history: [] };
  const r = getWeakestWeek();
  if (r !== null) throw new Error('attendu null, aucune semaine sous le seuil : ' + JSON.stringify(r));
});

essai('une semaine sous le seuil (< 60%) est recommandee', () => {
  DB = baseDB();
  DB.scores['l0-s2-w1'] = { best: { pct: 45, points: 45, maxPoints: 100 }, history: [] };
  const r = getWeakestWeek();
  if (!r) throw new Error('attendu une recommandation');
  if (r.semesterId !== 'l0-s2' || r.week !== 1 || r.pct !== 45) throw new Error(JSON.stringify(r));
});

essai('parmi plusieurs semaines faibles, la plus faible (score le plus bas) est choisie', () => {
  DB = baseDB();
  DB.scores['l0-s2-w1'] = { best: { pct: 55, points: 55, maxPoints: 100 }, history: [] };
  DB.scores['l0-s2-w2'] = { best: { pct: 20, points: 20, maxPoints: 100 }, history: [] };
  DB.scores['l0-s2-w3'] = { best: { pct: 40, points: 40, maxPoints: 100 }, history: [] };
  const r = getWeakestWeek();
  if (r.week !== 2 || r.pct !== 20) throw new Error('attendu la semaine 2 (20%), obtenu ' + JSON.stringify(r));
});

essai('la recherche couvre bien tous les semestres, pas seulement le premier', () => {
  DB = baseDB();
  DB.scores['l0-s2-w1'] = { best: { pct: 80, points: 80, maxPoints: 100 }, history: [] };
  DB.scores['n5-w2'] = { best: { pct: 30, points: 30, maxPoints: 100 }, history: [] };
  const r = getWeakestWeek();
  if (r.semesterId !== 'n5' || r.week !== 2) throw new Error('attendu n5-w2, obtenu ' + JSON.stringify(r));
});

essai('un score pile au seuil (60%) n\'est PAS considere faible (seuil exclusif)', () => {
  DB = baseDB();
  DB.scores['l0-s2-w1'] = { best: { pct: 60, points: 60, maxPoints: 100 }, history: [] };
  const r = getWeakestWeek();
  if (r !== null) throw new Error('attendu null : 60% est le seuil, pas en dessous');
});

essai('un score a 59% (juste sous le seuil) EST considere faible', () => {
  DB = baseDB();
  DB.scores['l0-s2-w1'] = { best: { pct: 59, points: 59, maxPoints: 100 }, history: [] };
  const r = getWeakestWeek();
  if (!r || r.pct !== 59) throw new Error('attendu une recommandation a 59%, obtenu ' + JSON.stringify(r));
});
