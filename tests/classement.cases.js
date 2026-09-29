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

// ---------- Classement global (rang 5, #16) ----------

const LIGNES_GLOBAL = [
  // Moi : deux modes, une ligne sans duree_ms (ancienne colonne absente).
  { user_id: 'moi', pseudo: 'Polus', points: 90, pct: 90, duree_ms: 60000, nb_essais: 3, semester_id: 's1', mode: 'vocab' },
  { user_id: 'moi', pseudo: 'Polus', points: 70, pct: 70, duree_ms: null, nb_essais: 2, semester_id: 's1', mode: 'traduction' },
  // Hana : plus de points cumulés, mais un % moyen plus bas et plus lente.
  { user_id: 'u2', pseudo: 'Hana', points: 100, pct: 60, duree_ms: 120000, nb_essais: 1, semester_id: 's1', mode: 'vocab' },
  { user_id: 'u2', pseudo: 'Hana', points: 100, pct: 80, duree_ms: 100000, nb_essais: 4, semester_id: 's2', mode: 'vocab' },
  // Ken : un seul mode, aucun score.
  { user_id: 'u3', pseudo: 'Ken', points: 0, pct: 0, duree_ms: null, nb_essais: 0, semester_id: 's1', mode: 'vocab' }
];

essai('le classement global additionne les points sur tous les modes', () => {
  const agrege = computeGlobal(LIGNES_GLOBAL);
  const moi = agrege.find(u => u.user_id === 'moi');
  const hana = agrege.find(u => u.user_id === 'u2');
  if (moi.points !== 160) throw new Error('points cumulés de Polus = ' + moi.points);
  if (hana.points !== 200) throw new Error('points cumulés de Hana = ' + hana.points);
});

essai('le % moyen et le temps moyen ignorent les lignes sans donnée', () => {
  const agrege = computeGlobal(LIGNES_GLOBAL);
  const moi = agrege.find(u => u.user_id === 'moi');
  if (moi.pctMoyen !== 80) throw new Error('% moyen de Polus = ' + moi.pctMoyen);
  if (moi.dureeMoyenne !== 60000) throw new Error('temps moyen de Polus aurait dû ignorer la ligne sans durée : ' + moi.dureeMoyenne);
});

essai('les essais se cumulent sur tous les modes', () => {
  const agrege = computeGlobal(LIGNES_GLOBAL);
  const hana = agrege.find(u => u.user_id === 'u2');
  if (hana.essais !== 5) throw new Error('essais cumulés de Hana = ' + hana.essais);
});

essai('trier par points cumulés met Hana devant malgré son % plus bas', () => {
  const ordre = trierGlobal(computeGlobal(LIGNES_GLOBAL), 'points').map(u => u.pseudo).join(',');
  if (ordre !== 'Hana,Polus,Ken') throw new Error('ordre = ' + ordre);
});

essai('le classement global (règle %) met Polus devant malgré moins de points', () => {
  const ordre = trierGlobal(computeGlobal(LIGNES_GLOBAL), 'classement').map(u => u.pseudo).join(',');
  if (ordre[0] !== 'P') throw new Error('Polus devrait être en tête : ' + ordre);
});

essai('trier par temps met les plus rapides devant, sans donnée en dernier', () => {
  const ordre = trierGlobal(computeGlobal(LIGNES_GLOBAL), 'temps').map(u => u.pseudo);
  if (ordre[0] !== 'Polus') throw new Error('Polus (60s) devrait être le plus rapide : ' + ordre.join(','));
  if (ordre[ordre.length - 1] !== 'Ken') throw new Error('Ken (aucun temps) devrait être en dernier : ' + ordre.join(','));
});

essai('l\'onglet global affiche le podium avec le critère choisi', () => {
  globalLignes = LIGNES_GLOBAL; globalErreur = null; globalTri = 'points';
  renderGlobal();
  const html = trouve('#lbTableWrap').innerHTML;
  if (!html.includes('Hana')) throw new Error('Hana devrait apparaître au podium');
  if (!html.includes('200 pts')) throw new Error('le critère affiché (points) manque');
});

essai('sans aucun score, l\'onglet global invite à commencer', () => {
  globalLignes = []; globalErreur = null;
  renderGlobal();
  if (!trouve('#lbTableWrap').innerHTML.includes('Aucun score enregistré')) throw new Error('invitation absente');
});

essai('une erreur de chargement est montrée sur l\'onglet global', () => {
  globalErreur = 'réseau coupé';
  renderGlobal();
  if (!trouve('#lbTableWrap').innerHTML.includes('réseau coupé')) throw new Error('erreur avalée');
  globalErreur = null;
});





// ---------- Widget "Classement" sur l'accueil (#21, rang 5) ----------

essai('sans compte connecté, le widget accueil invite à se connecter', () => {
  const ancien = window.accountUser;
  window.accountUser = null;
  renderClassementAccueilWidget();
  const html = trouve('#accueilClassementWrap').innerHTML;
  if (!html.includes('Connecte-toi')) throw new Error('invitation à se connecter absente');
  window.accountUser = ancien;
});

essai('le widget accueil affiche le top 3 du classement global', () => {
  accueilClassementLignes = LIGNES_GLOBAL; accueilClassementErreur = null;
  renderClassementAccueilWidget();
  const html = trouve('#accueilClassementWrap').innerHTML;
  if (!html.includes('Polus')) throw new Error('Polus (en tête au %) devrait apparaître');
  if (!html.includes('Voir le classement complet')) throw new Error('le lien vers la page complète manque');
});

essai('sans aucun score, le widget accueil invite à commencer', () => {
  accueilClassementLignes = []; accueilClassementErreur = null;
  renderClassementAccueilWidget();
  if (!trouve('#accueilClassementWrap').innerHTML.includes('Personne n\'a encore de score')) throw new Error('invitation absente');
});

essai('une erreur de chargement est montrée dans le widget accueil', () => {
  accueilClassementErreur = 'réseau coupé';
  renderClassementAccueilWidget();
  if (!trouve('#accueilClassementWrap').innerHTML.includes('indisponible')) throw new Error('erreur avalée');
  accueilClassementErreur = null;
});


// ---------- Règle du classement (29/09/2026) : %, puis difficulté, puis temps ----------

essai('à % égal, Difficile passe devant Normal même plus lent, et Facile derrière même plus rapide', () => {
  const lignes = [
    { user_id: 'a', pseudo: 'Rapide-Facile', semester_id: 's1', week: 2, pct: 100, points: 100, max_points: 100, duree_ms: 30000, difficulte: 'facile' },
    { user_id: 'b', pseudo: 'Lent-Difficile', semester_id: 's1', week: 2, pct: 100, points: 100, max_points: 100, duree_ms: 90000, difficulte: 'difficile' },
    { user_id: 'c', pseudo: 'Normal', semester_id: 's1', week: 2, pct: 100, points: 100, max_points: 100, duree_ms: 60000, difficulte: 'normal' },
    { user_id: 'd', pseudo: 'Difficile-80', semester_id: 's1', week: 2, pct: 80, points: 80, max_points: 100, duree_ms: 10000, difficulte: 'difficile' }
  ];
  const ordre = meilleursParSemaine(lignes)[0].lignes.map(r => r.pseudo).join(',');
  if (ordre !== 'Lent-Difficile,Normal,Rapide-Facile,Difficile-80') throw new Error('ordre = ' + ordre);
});

essai('à % et difficulté égaux, le plus rapide gagne ; sans temps enregistré en dernier', () => {
  const lignes = [
    { user_id: 'a', pseudo: 'SansTemps', semester_id: 's1', week: 4, pct: 90, points: 90, max_points: 100, duree_ms: null },
    { user_id: 'b', pseudo: 'Lent', semester_id: 's1', week: 4, pct: 90, points: 90, max_points: 100, duree_ms: 90000 },
    { user_id: 'c', pseudo: 'Vite', semester_id: 's1', week: 4, pct: 90, points: 90, max_points: 100, duree_ms: 40000 }
  ];
  const ordre = meilleursParSemaine(lignes)[0].lignes.map(r => r.pseudo).join(',');
  if (ordre !== 'Vite,Lent,SansTemps') throw new Error('ordre = ' + ordre);
});

essai('classement global : à % moyen égal, la difficulté moyenne départage', () => {
  const lignes = [
    { user_id: 'a', pseudo: 'A', points: 90, pct: 90, duree_ms: 30000, nb_essais: 9, semester_id: 's1', mode: 'vocab', difficulte: 'normal' },
    { user_id: 'b', pseudo: 'B', points: 90, pct: 90, duree_ms: 99000, nb_essais: 1, semester_id: 's1', mode: 'vocab', difficulte: 'difficile' }
  ];
  const ordre = trierGlobal(computeGlobal(lignes), 'classement').map(u => u.pseudo).join(',');
  if (ordre !== 'B,A') throw new Error('ordre = ' + ordre);
});

essai('seules les sessions complètes comptent : 110/110 (filtrée) ne passe pas devant 560/560 (29/09/2026)', () => {
  const lignes = [
    { user_id: 'vy', pseudo: 'Vy', semester_id: 'zz', week: 2, mode: 'vocab', pct: 100, points: 110, max_points: 110, duree_ms: 83000, verbe_filter: 'simple' },
    { user_id: 'lu', pseudo: 'Lu', semester_id: 'zz', week: 2, mode: 'vocab', pct: 100, points: 560, max_points: 560, duree_ms: 155000 },
    { user_id: 'po', pseudo: 'Po', semester_id: 'zz', week: 2, mode: 'vocab', pct: 96, points: 535, max_points: 560, duree_ms: 400000 }
  ];
  const ordre = meilleursParSemaine(lignesCompletes(lignes))[0].lignes.map(r => r.pseudo).join(',');
  if (ordre !== 'Lu,Po') throw new Error('ordre = ' + ordre);
  const vy = agregerGlobal(lignes).find(u => u.pseudo === 'Vy');
  if (!vy || vy.points !== 110) throw new Error('les points filtrés doivent compter au global : ' + JSON.stringify(vy));
  if (vy.pctMoyen !== null) throw new Error('mais pas le % : ' + vy.pctMoyen);
  const ordreGlobal = trierGlobal(agregerGlobal(lignes), 'classement').map(u => u.pseudo);
  if (ordreGlobal[ordreGlobal.length - 1] !== 'Vy') throw new Error('sans session complète, en bas du classement au % : ' + ordreGlobal.join(','));
});

essai('une session complète reste comptée même si son total est plus petit que celui d\'un autre (mots masqués)', () => {
  const lignes = [
    { user_id: 'a', pseudo: 'A', semester_id: 'zz', week: 3, mode: 'vocab', pct: 90, points: 450, max_points: 500, verbe_filter: 'tous' },
    { user_id: 'b', pseudo: 'B', semester_id: 'zz', week: 3, mode: 'vocab', pct: 95, points: 380, max_points: 400, verbe_filter: 'tous' },
    { user_id: 'c', pseudo: 'C', semester_id: 'zz', week: 3, mode: 'vocab', pct: 99, points: 480, max_points: 490, verbe_filter: 'kanji_groupe' }
  ];
  const ordre = meilleursParSemaine(lignesCompletes(lignes))[0].lignes.map(r => r.pseudo).join(',');
  if (ordre !== 'B,A') throw new Error('ordre = ' + ordre);
});

essai('points cumulés au global : sessions filtrées incluses, % moyen sur les complètes seulement', () => {
  const lignes = [
    { user_id: 'p', pseudo: 'P', semester_id: 'zz', week: 1, mode: 'vocab', pct: 50, points: 300, max_points: 600, verbe_filter: 'tous' },
    { user_id: 'p', pseudo: 'P', semester_id: 'zz', week: 2, mode: 'vocab', pct: 90, points: 400, max_points: 450, verbe_filter: 'kanji_groupe' }
  ];
  const p = agregerGlobal(lignes)[0];
  if (p.points !== 700) throw new Error('points = ' + p.points);
  if (p.pctMoyen !== 50) throw new Error('% moyen = ' + p.pctMoyen);
});
