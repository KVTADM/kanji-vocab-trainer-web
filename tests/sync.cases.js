// Scénarios de la logique pure de synchronisation cloud (account.js).
// Concaténés au harnais avant évaluation.

// ---------- decisionSyncApresConnexion ----------

essai('un pull qui échoue (réseau) ne touche à rien, quoi que dise le drapeau local', () => {
  if (decisionSyncApresConnexion(false, true, true) !== 'erreur-reseau') throw new Error('cas 1');
  if (decisionSyncApresConnexion(false, false, false) !== 'erreur-reseau') throw new Error('cas 2');
});

essai('une sauvegarde cloud trouvée est toujours appliquée, drapeau ou pas', () => {
  if (decisionSyncApresConnexion(true, true, true) !== 'appliquer-cloud') throw new Error('cas 1');
  if (decisionSyncApresConnexion(true, true, false) !== 'appliquer-cloud') throw new Error('cas 2');
});

essai('aucune sauvegarde trouvée sur un appareil qui n\'a jamais synchronisé ce compte : on pousse le local', () => {
  const r = decisionSyncApresConnexion(true, false, false);
  if (r !== 'pousser-local') throw new Error(JSON.stringify(r));
});

essai('aucune sauvegarde trouvée sur un appareil qui EN a déjà vu une : on ne touche à rien (le bug du 29-30/08/2026)', () => {
  // C'est exactement le scénario qui a fait disparaître les semaines 3 et 4
  // du 29/08/2026 : l'ancienne version aurait ici poussé les données
  // locales (potentiellement périmées) par-dessus une vraie sauvegarde
  // cloud simplement pas encore revenue à temps.
  const r = decisionSyncApresConnexion(true, false, true);
  if (r !== 'incertain-ne-rien-faire') throw new Error(JSON.stringify(r));
});

// ---------- interpreterReponsePushCloud ----------

essai('interpreterReponsePushCloud renvoie ok sans erreur, échec détaillé sinon', () => {
  const succes = interpreterReponsePushCloud(null);
  if (!succes.ok) throw new Error('devrait réussir sans erreur : ' + JSON.stringify(succes));
  const echec = interpreterReponsePushCloud({ message: 'row-level security violation' });
  if (echec.ok || echec.motif !== 'row-level security violation') throw new Error(JSON.stringify(echec));
});

// ---------- faitUneSnapshotHistorique ----------

essai('faitUneSnapshotHistorique dit oui s\'il n\'y a jamais eu de snapshot', () => {
  if (!faitUneSnapshotHistorique(null, Date.now(), 1000)) throw new Error('devrait être dû sans historique du tout');
});

essai('faitUneSnapshotHistorique respecte l\'intervalle : non si trop récent, oui une fois l\'intervalle dépassé', () => {
  const intervalle = 20 * 60 * 60 * 1000;
  const maintenant = Date.parse('2026-08-30T12:00:00Z');
  const ilYA10h = new Date(maintenant - 10 * 60 * 60 * 1000).toISOString();
  const ilYA21h = new Date(maintenant - 21 * 60 * 60 * 1000).toISOString();
  if (faitUneSnapshotHistorique(ilYA10h, maintenant, intervalle)) throw new Error('10h < 20h, ne devrait pas encore être dû');
  if (!faitUneSnapshotHistorique(ilYA21h, maintenant, intervalle)) throw new Error('21h > 20h, devrait être dû');
});

essai('KVT_HISTORIQUE_INTERVALLE_MS vaut bien ~1 jour (20h, marge sous 24h)', () => {
  if (KVT_HISTORIQUE_INTERVALLE_MS !== 20 * 60 * 60 * 1000) throw new Error('valeur inattendue : ' + KVT_HISTORIQUE_INTERVALLE_MS);
});

// ---------- kvtCleSyncFlag (clé de stockage local, par compte) ----------

essai('kvtCleSyncFlag distingue bien deux comptes différents sur le même appareil', () => {
  const cleA = kvtCleSyncFlag('user-aaa');
  const cleB = kvtCleSyncFlag('user-bbb');
  if (cleA === cleB) throw new Error('deux comptes différents ne devraient jamais partager la même clé');
  if (!cleA.includes('user-aaa') || !cleB.includes('user-bbb')) throw new Error('la clé devrait contenir l\'id du compte');
});

// ---------- fusionnerSauvegardes (panne du 29/09/2026, deux appareils) ----------

function sauvegardeTest(xp, pieces, scores) {
  return { settings: { theme: 'dark' }, scores, wordStats: {}, gamification: { xp, pieces, inventaire: [], streak: { compte: 1, record: 1, dernierJour: '2026-09-28' } } };
}
function tentative(date, pct) { return { date, points: pct, maxPoints: 100, pct }; }

essai('fusion : le scénario lucienrosset36 ne perd plus rien (scores des deux appareils, XP additionnés)', () => {
  // Base commune : 50 000 XP, S3 semaine 3 faite.
  const base = { xp: 50000, pieces: 1000 };
  const commun = { 's3-w3': { best: tentative('2026-09-28T16:19:00.000Z', 100), history: [tentative('2026-09-28T16:19:00.000Z', 100)] } };
  // Appareil A : +20 000 XP, 2 semaines de S2 débutant (déjà dans le cloud).
  const cloudA = sauvegardeTest(70000, 1400, Object.assign({}, commun, {
    'l0-s2-w2': { best: tentative('2026-09-29T07:52:00.000Z', 94), history: [tentative('2026-09-29T07:52:00.000Z', 94)] },
    'l0-s2-w3': { best: tentative('2026-09-29T07:59:00.000Z', 84), history: [tentative('2026-09-29T07:59:00.000Z', 84)] }
  }));
  // Appareil B (en retard) : +1 000 XP, S2 semaine 10.
  const localB = sauvegardeTest(51000, 1050, Object.assign({}, commun, {
    's2-w10': { best: tentative('2026-09-29T08:42:00.000Z', 92), history: [tentative('2026-09-29T08:42:00.000Z', 92)] }
  }));
  const f = fusionnerSauvegardes(localB, cloudA, base);
  ['s3-w3', 'l0-s2-w2', 'l0-s2-w3', 's2-w10'].forEach(k => { if (!f.scores[k]) throw new Error('semaine perdue : ' + k); });
  if (f.gamification.xp !== 71000) throw new Error('XP attendu 71000, obtenu ' + f.gamification.xp);
  if (f.gamification.pieces !== 1450) throw new Error('pièces attendues 1450, obtenu ' + f.gamification.pieces);
});

essai('fusion : tentatives d\'une même semaine réunies sans doublon, meilleur score recalculé', () => {
  const a = sauvegardeTest(0, 0, { 's1-w1': { best: tentative('2026-09-01T00:00:00.000Z', 70), history: [tentative('2026-09-01T00:00:00.000Z', 70), tentative('2026-09-03T00:00:00.000Z', 60)] } });
  const b = sauvegardeTest(0, 0, { 's1-w1': { best: tentative('2026-09-02T00:00:00.000Z', 90), history: [tentative('2026-09-01T00:00:00.000Z', 70), tentative('2026-09-02T00:00:00.000Z', 90)] } });
  const e = fusionnerSauvegardes(a, b, null).scores['s1-w1'];
  if (e.history.length !== 3) throw new Error('3 tentatives distinctes attendues, obtenu ' + e.history.length);
  if (e.best.pct !== 90) throw new Error('meilleur attendu 90, obtenu ' + e.best.pct);
});

essai('fusion sans base connue : XP et pièces du côté le plus avancé', () => {
  const f = fusionnerSauvegardes(sauvegardeTest(55000, 700, {}), sauvegardeTest(60000, 900, {}), null);
  if (f.gamification.xp !== 60000 || f.gamification.pieces !== 900) throw new Error(JSON.stringify(f.gamification));
  const g = fusionnerSauvegardes(sauvegardeTest(61000, 500, {}), sauvegardeTest(60000, 900, {}), null);
  if (g.gamification.xp !== 61000 || g.gamification.pieces !== 500) throw new Error(JSON.stringify(g.gamification));
});

essai('fusion : dépense de pièces sur cet appareil conservée, jamais négatif', () => {
  const f = fusionnerSauvegardes(sauvegardeTest(1000, 100, {}), sauvegardeTest(1500, 1200, {}), { xp: 1000, pieces: 1000 });
  if (f.gamification.pieces !== 300) throw new Error('attendu 1200 - 900 dépensées = 300, obtenu ' + f.gamification.pieces);
  const g = fusionnerSauvegardes(sauvegardeTest(1000, 0, {}), sauvegardeTest(1000, 10, {}), { xp: 1000, pieces: 500 });
  if (g.gamification.pieces !== 0) throw new Error('pièces négatives : ' + g.gamification.pieces);
});

essai('fusion : réglages et vocabulaire locaux gardés, namespace présent seulement dans le cloud repris', () => {
  const local = sauvegardeTest(0, 0, {}); local.settings = { theme: 'ai' };
  const cloud = sauvegardeTest(0, 0, {}); cloud.scoresDouble = { 's1-w1': { best: tentative('2026-09-01T00:00:00.000Z', 80), history: [tentative('2026-09-01T00:00:00.000Z', 80)] } };
  const f = fusionnerSauvegardes(local, cloud, null);
  if (f.settings.theme !== 'ai') throw new Error('réglages locaux perdus');
  if (!f.scoresDouble || !f.scoresDouble['s1-w1']) throw new Error('scoresDouble du cloud perdu');
});

essai('fusion : wordStats gardent la fiche la plus fournie, inventaire réuni, série la plus récente', () => {
  const a = sauvegardeTest(0, 0, {}); a.wordStats = { m1: { attempts: 5 }, m2: { attempts: 1 } }; a.gamification.inventaire = ['t1'];
  const b = sauvegardeTest(0, 0, {}); b.wordStats = { m1: { attempts: 2 }, m2: { attempts: 4 }, m3: { attempts: 1 } }; b.gamification.inventaire = ['t2'];
  b.gamification.streak = { compte: 3, record: 3, dernierJour: '2026-09-29' };
  const f = fusionnerSauvegardes(a, b, null);
  if (f.wordStats.m1.attempts !== 5 || f.wordStats.m2.attempts !== 4 || !f.wordStats.m3) throw new Error(JSON.stringify(f.wordStats));
  if (f.gamification.inventaire.length !== 2) throw new Error('inventaire : ' + f.gamification.inventaire);
  if (f.gamification.streak.dernierJour !== '2026-09-29') throw new Error('série : ' + JSON.stringify(f.gamification.streak));
});

// ---------- rattraperScoresDepuisClassement ----------

essai('rattrapage : les 4 semaines absentes reviennent, une semaine déjà connue n\'est pas touchée', () => {
  const data = sauvegardeTest(0, 0, { 's2-w10': { best: tentative('2026-09-29T08:42:00.000Z', 92), history: [tentative('2026-09-29T08:42:00.000Z', 92)] } });
  const lignes = [
    { semester_id: 'l0-s2', week: 2, mode: 'vocab', points: 404, max_points: 430, pct: '94', duree_ms: 155930, created_at: '2026-09-29T07:52:27.843581+00:00' },
    { semester_id: 'l0-s2', week: 3, mode: 'vocab', points: 351, max_points: 420, pct: '84', duree_ms: 167613, created_at: '2026-09-29T07:59:48+00:00' },
    { semester_id: 's2', week: 10, mode: 'vocab', points: 1, max_points: 540, pct: '1', duree_ms: null, created_at: '2026-09-29T08:42:09+00:00' },
    { semester_id: 's1', week: 1, mode: 'double', points: 50, max_points: 100, pct: '50', duree_ms: null, created_at: '2026-09-29T08:00:00+00:00' }
  ];
  const n = rattraperScoresDepuisClassement(data, lignes);
  if (n !== 3) throw new Error('3 ajouts attendus, obtenu ' + n);
  if (data.scores['l0-s2-w2'].best.pct !== 94 || data.scores['l0-s2-w2'].best.dureeMs !== 155930) throw new Error(JSON.stringify(data.scores['l0-s2-w2']));
  if (data.scores['s2-w10'].best.pct !== 92) throw new Error('semaine déjà connue écrasée');
  if (!data.scoresDouble['s1-w1']) throw new Error('mode double non rattrapé');
  if (rattraperScoresDepuisClassement(data, lignes) !== 0) throw new Error('second passage : doublons');
});
