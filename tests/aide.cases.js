// Scénarios pour aide.js — voir tests/aide.test.js pour le harnais.

essai('validerRetour refuse un titre trop court', () => {
  const { ok, erreurs } = validerRetour({ titre: 'Hi', description: 'un souci quelconque' });
  if (ok) throw new Error('un titre de 2 caractères devrait être refusé');
  if (!erreurs.titre) throw new Error('erreur de titre attendue');
});

essai('validerRetour refuse un titre trop long', () => {
  const { ok, erreurs } = validerRetour({ titre: 'x'.repeat(141), description: 'ok' });
  if (ok) throw new Error('un titre de 141 caractères devrait être refusé');
  if (!erreurs.titre) throw new Error('erreur de titre attendue');
});

essai('validerRetour refuse une description vide', () => {
  const { ok, erreurs } = validerRetour({ titre: 'Un vrai titre', description: '   ' });
  if (ok) throw new Error('une description vide (espaces) devrait être refusée');
  if (!erreurs.description) throw new Error('erreur de description attendue');
});

essai('validerRetour refuse une description trop longue', () => {
  const { ok, erreurs } = validerRetour({ titre: 'Un vrai titre', description: 'x'.repeat(4001) });
  if (ok) throw new Error('une description de 4001 caractères devrait être refusée');
  if (!erreurs.description) throw new Error('erreur de description attendue');
});

essai('validerRetour refuse une solution proposée trop longue', () => {
  const { ok, erreurs } = validerRetour({ titre: 'Un vrai titre', description: 'ok', solutionProposee: 'x'.repeat(2001) });
  if (ok) throw new Error('une solution de 2001 caractères devrait être refusée');
  if (!erreurs.solutionProposee) throw new Error('erreur de solution attendue');
});

essai('validerRetour accepte un formulaire minimal valide', () => {
  const { ok, erreurs } = validerRetour({ titre: 'Un vrai titre', description: 'Ça bug quand je clique.' });
  if (!ok) throw new Error('formulaire valide refusé : ' + JSON.stringify(erreurs));
});

essai('validerRetour accepte une solution proposée absente', () => {
  const { ok } = validerRetour({ titre: 'Un vrai titre', description: 'Ça bug.', solutionProposee: '' });
  if (!ok) throw new Error('une solution vide ne devrait pas bloquer le formulaire');
});

essai('libelleStatutRetour traduit chaque statut connu et renvoie la valeur brute sinon', () => {
  if (libelleStatutRetour('ouvert') !== 'Envoyé') throw new Error('libellé "ouvert" inattendu');
  if (libelleStatutRetour('en_cours') !== 'En cours de traitement') throw new Error('libellé "en_cours" inattendu');
  if (libelleStatutRetour('resolu') !== 'Résolu') throw new Error('libellé "resolu" inattendu');
  if (libelleStatutRetour('ferme') !== 'Fermé') throw new Error('libellé "ferme" inattendu');
  if (libelleStatutRetour('inconnu') !== 'inconnu') throw new Error('repli sur la valeur brute attendu pour un statut inconnu');
});

essai('envoyerRetour n\'appelle pas Supabase si le formulaire est invalide', async () => {
  let appele = false;
  window.sb = { from() { appele = true; return { insert: async () => ({ error: null }) }; } };
  const resultat = await envoyerRetour({ titre: 'x', description: '' });
  if (resultat.ok) throw new Error('un formulaire invalide ne doit pas être accepté');
  if (appele) throw new Error('Supabase ne doit pas être appelé pour un formulaire invalide');
});

essai('envoyerRetour insère les bons champs pour un formulaire valide', async () => {
  let insere = null;
  window.sb = { from(table) { return { insert: async (payload) => { insere = { table, payload }; return { error: null }; } }; } };
  window.accountUser = { id: 'u1', pseudo: 'Testeur' };
  const resultat = await envoyerRetour({ titre: 'Bug du minuteur', description: 'Il ne se réinitialise pas.', solutionProposee: 'Vérifier finTourA', besoinAide: true });
  if (!resultat.ok) throw new Error('formulaire valide refusé : ' + JSON.stringify(resultat.erreurs));
  if (insere.table !== 'retours_utilisateurs') throw new Error('mauvaise table : ' + insere.table);
  if (insere.payload.user_id !== 'u1') throw new Error('user_id manquant ou incorrect');
  if (insere.payload.titre !== 'Bug du minuteur') throw new Error('titre mal transmis');
  if (insere.payload.besoin_aide !== true) throw new Error('besoin_aide mal transmis');
  if (insere.payload.solution_proposee !== 'Vérifier finTourA') throw new Error('solution_proposee mal transmise');
  window.accountUser = { id: 'moi', pseudo: 'Moi' };
});

essai('envoyerRetour transforme une chaîne vide de solution proposée en null', () => {
  return (async () => {
    let insere = null;
    window.sb = { from() { return { insert: async (payload) => { insere = payload; return { error: null }; } }; } };
    await envoyerRetour({ titre: 'Un vrai titre', description: 'Ça bug.', solutionProposee: '   ' });
    if (insere.solution_proposee !== null) throw new Error('une solution vide/espaces doit devenir null, reçu ' + JSON.stringify(insere.solution_proposee));
  })();
});

essai('envoyerRetour renvoie une erreur générale si Supabase échoue', async () => {
  window.sb = { from() { return { insert: async () => ({ error: { message: 'boom' } }) }; } };
  const resultat = await envoyerRetour({ titre: 'Un vrai titre', description: 'Ça bug.' });
  if (resultat.ok) throw new Error('un échec Supabase doit remonter comme non-ok');
  if (!resultat.erreurs.general) throw new Error('un message d\'erreur général est attendu');
});

// ---------- Captures d'écran (29/09/2026) ----------

essai('validerCaptures : 3 images max, 5 Mo max, images uniquement', () => {
  const img = (type, size) => ({ type, size });
  if (!validerCaptures([]).ok) throw new Error('aucune capture doit passer');
  if (!validerCaptures([img('image/png', 1000), img('image/jpeg', 1000), img('image/webp', 1000)]).ok) throw new Error('3 images valides refusées');
  if (validerCaptures([img('image/png', 1), img('image/png', 1), img('image/png', 1), img('image/png', 1)]).ok) throw new Error('4 captures acceptées');
  if (validerCaptures([img('application/pdf', 1)]).ok) throw new Error('un PDF accepté');
  if (validerCaptures([img('image/png', 6 * 1024 * 1024)]).ok) throw new Error('6 Mo accepté');
});

essai('envoyerRetour dépose les captures dans le dossier du compte et enregistre leurs chemins', async () => {
  let insere = null; const deposes = [];
  window.sb = {
    storage: { from: (bucket) => ({ upload: async (chemin) => { deposes.push(bucket + ':' + chemin); return { error: null }; }, remove: async () => ({}) }) },
    from() { return { insert: async (payload) => { insere = payload; return { error: null }; } }; }
  };
  window.accountUser = { id: 'u1', pseudo: 'T' };
  const r = await envoyerRetour({ titre: 'Un vrai titre', description: 'Ça bug.', captures: [{ type: 'image/png', size: 10 }, { type: 'image/jpeg', size: 10 }] });
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  if (deposes.length !== 2 || !deposes.every(d => d.startsWith('retours-captures:u1/'))) throw new Error('dépôt : ' + deposes);
  if (insere.captures.length !== 2 || !insere.captures[1].endsWith('.jpg')) throw new Error('chemins : ' + insere.captures);
  window.accountUser = { id: 'moi', pseudo: 'Moi' };
});

essai('envoyerRetour : échec d\'une capture -> rien n\'est inséré, les captures déjà déposées sont retirées', async () => {
  let insere = false; let retires = null; let n = 0;
  window.sb = {
    storage: { from: () => ({ upload: async () => ({ error: ++n === 2 ? { message: 'boom' } : null }), remove: async (c) => { retires = c; return {}; } }) },
    from() { return { insert: async () => { insere = true; return { error: null }; } }; }
  };
  const r = await envoyerRetour({ titre: 'Un vrai titre', description: 'Ça bug.', captures: [{ type: 'image/png', size: 10 }, { type: 'image/png', size: 10 }] });
  if (r.ok || insere) throw new Error('le message ne doit pas partir');
  if (!retires || retires.length !== 1) throw new Error('la 1re capture aurait dû être retirée');
});
