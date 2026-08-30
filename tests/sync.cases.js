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
