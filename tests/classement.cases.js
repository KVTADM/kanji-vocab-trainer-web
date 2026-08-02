// Scénarios du classement, évalués dans la même portée que leaderboard.js.

const LIGNES = [
  // Une même personne, trois essais sur la même semaine : seul son meilleur compte.
  { user_id: 'moi', pseudo: 'Polus', semester_id: 's1', week: 1, pct: 60, points: 60, max_points: 100, created_at: '2026-08-01T10:00:00Z' },
  { user_id: 'moi', pseudo: 'Polus', semester_id: 's1', week: 1, pct: 95, points: 95, max_points: 100, created_at: '2026-08-02T10:00:00Z' },
  { user_id: 'moi', pseudo: 'Polus', semester_id: 's1', week: 1, pct: 70, points: 70, max_points: 100, created_at: '2026-08-03T10:00:00Z' },
  { user_id: 'u2', pseudo: 'Hana', semester_id: 's1', week: 1, pct: 88, points: 88, max_points: 100, created_at: '2026-08-01T11:00:00Z' },
  { user_id: 'u3', pseudo: 'Ken', semester_id: 's1', week: 1, pct: 40, points: 40, max_points: 100, created_at: '2026-08-01T12:00:00Z' },
  { user_id: 'u4', pseudo: 'Yuki', semester_id: 's1', week: 1, pct: 30, points: 30, max_points: 100, created_at: '2026-08-01T13:00:00Z' },
  // Une autre semaine, et un semestre plus loin dans le programme.
  { user_id: 'u2', pseudo: 'Hana', semester_id: 's1', week: 3, pct: 77, points: 77, max_points: 100, created_at: '2026-08-01T14:00:00Z' },
  { user_id: 'moi', pseudo: 'Polus', semester_id: 's2', week: 1, pct: 50, points: 50, max_points: 100, created_at: '2026-08-01T15:00:00Z' },
  // Un deck partagé, dont je n'ai pas le libellé.
  { user_id: 'u2', pseudo: 'Hana', semester_id: 'deck-venu-dailleurs', week: 1, pct: 66, points: 66, max_points: 100, created_at: '2026-08-01T16:00:00Z' }
];

essai('plusieurs essais d\'une même personne comptent pour un seul', () => {
  const s = meilleursParSemaine(LIGNES).find(x => x.semesterId === 's1' && x.week === 1);
  const miens = s.lignes.filter(r => r.user_id === 'moi');
  if (miens.length !== 1) throw new Error('la même personne apparaît ' + miens.length + ' fois');
  if (Number(miens[0].pct) !== 95) throw new Error('ce n\'est pas son meilleur essai : ' + miens[0].pct);
});

essai('le classement d\'une semaine va du meilleur au moins bon', () => {
  const s = meilleursParSemaine(LIGNES).find(x => x.semesterId === 's1' && x.week === 1);
  const ordre = s.lignes.map(r => r.pseudo).join(',');
  if (ordre !== 'Polus,Hana,Ken,Yuki') throw new Error('ordre = ' + ordre);
});

essai('les semaines suivent l\'ordre du programme, pas celui des scores', () => {
  const cles = meilleursParSemaine(LIGNES).map(s => s.semesterId + '/' + s.week).join(' ');
  if (cles !== 's1/1 s1/3 s2/1 deck-venu-dailleurs/1') throw new Error('ordre = ' + cles);
});

essai('un semestre inconnu ne casse pas l\'affichage', () => {
  if (libelleSemestre('deck-venu-dailleurs') !== 'Deck partagé') throw new Error('libellé = ' + libelleSemestre('deck-venu-dailleurs'));
  if (libelleSemestre('s2') !== 'Semestre 2') throw new Error('libellé connu perdu');
});

essai('aucun score : la vue invite au lieu de rester vide', () => {
  apercuLignes = []; apercuErreur = null; apercuSemestre = 'tous';
  renderApercu();
  const html = trouve('#lbTableWrap').innerHTML;
  if (!html.includes('tu seras le premier')) throw new Error('invitation absente');
});

essai('la vue d\'ensemble montre plusieurs semaines d\'un coup', () => {
  apercuLignes = LIGNES;
  renderApercu();
  const html = trouve('#lbTableWrap').innerHTML;
  const cases = (html.match(/lb-case-titre/g) || []).length;
  if (cases !== 4) throw new Error('cases affichées = ' + cases);
  if (!html.includes('semaine 3')) throw new Error('la semaine 3 manque');
  if (!html.includes('data-voir="s1|1"')) throw new Error('le lien vers le détail manque');
});

essai('mon propre premier rang est signalé', () => {
  apercuLignes = LIGNES;
  renderApercu();
  const html = trouve('#lbTableWrap').innerHTML;
  if (!html.includes('lb-case lb-me')) throw new Error('la case où je suis premier n\'est pas marquée');
  if (!html.includes('>toi<')) throw new Error('la marque « toi » manque');
});

essai('la case ne montre que trois personnes, et annonce le reste', () => {
  apercuLignes = LIGNES;
  renderApercu();
  const html = trouve('#lbTableWrap').innerHTML;
  if (!html.includes('et 1 autre')) throw new Error('le reste n\'est pas annoncé : quatre personnes sur s1/1');
  if (html.includes('Yuki')) throw new Error('la quatrième personne est affichée alors qu\'elle devrait être comptée');
});

essai('une semaine sans concurrent le dit', () => {
  apercuLignes = LIGNES.filter(r => r.semester_id === 's2');
  renderApercu();
  if (!trouve('#lbTableWrap').innerHTML.includes("Personne d'autre")) throw new Error('mention absente');
});

essai('le filtre resserre sans être un préalable', () => {
  apercuLignes = LIGNES;
  apercuSemestre = 's1';
  renderApercu();
  let html = trouve('#lbTableWrap').innerHTML;
  if ((html.match(/lb-case-titre/g) || []).length !== 2) throw new Error('le filtre ne garde pas les deux semaines de s1');
  apercuSemestre = 'jlpt-n5';
  renderApercu();
  html = trouve('#lbTableWrap').innerHTML;
  if (!html.includes("Personne n'a encore de score sur ce semestre")) throw new Error('message de filtre vide absent');
  apercuSemestre = 'tous';
});

essai('une erreur de chargement est montrée', () => {
  apercuErreur = 'réseau coupé';
  renderApercu();
  if (!trouve('#lbTableWrap').innerHTML.includes('réseau coupé')) throw new Error('erreur avalée');
  apercuErreur = null;
});
