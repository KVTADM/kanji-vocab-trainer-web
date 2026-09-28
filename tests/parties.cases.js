// Scénarios pour parties.js — voir tests/parties.test.js pour le harnais.

function fabriquerSbCapture() {
  let derniere = null;
  let appels = 0;
  const sb = {
    from() {
      return {
        update(payload) {
          appels++;
          derniere = payload;
          return { eq: () => Promise.resolve({ error: null }) };
        }
      };
    }
  };
  return { sb, lire: () => derniere, nbAppels: () => appels };
}

function etatDeBase(overrides) {
  return Object.assign({
    id: 'partie-1',
    hote_id: 'moi',
    config: { tempsTourMs: 15000, vies: 3, semesterId: 'tout' },
    etat: 'en_cours',
    etat_jeu: {
      ordre: ['a', 'b', 'c'],
      joueurActifIndex: 0,
      vies: { a: 3, b: 3, c: 3 },
      poolIds: ['v1', 'v2', 'v3'],
      motActuelId: 'v1',
      motsUtilisesIds: ['v1'],
      finTourA: Date.now() + 10000,
      vainqueurId: null,
      dernierResultat: null
    }
  }, overrides || {});
}

essai('genererCodePartie renvoie 5 caractères pris dans l\'alphabet sans ambiguïté', () => {
  for (let i = 0; i < 50; i++) {
    const code = genererCodePartie();
    if (code.length !== 5) throw new Error('longueur inattendue : ' + code);
    for (const c of code) {
      if (!PARTIES_CODE_ALPHABET.includes(c)) throw new Error('caractère hors alphabet : ' + c);
    }
  }
});

essai('poolVocabPourPartie("tout") renvoie tout le vocabulaire non masqué', () => {
  DB.vocab = [{ id: 'v1', kanjiGroupId: 'g1' }, { id: 'v2', kanjiGroupId: 'g2' }];
  DB.kanjiGroups = [{ id: 'g1', semesterId: 's1' }, { id: 'g2', semesterId: 's2' }];
  estMotMasque = () => false;
  const pool = poolVocabPourPartie({ semesterId: 'tout' });
  if (pool.length !== 2) throw new Error('attendu 2 mots, reçu ' + pool.length);
});

essai('poolVocabPourPartie filtre les mots masqués', () => {
  DB.vocab = [{ id: 'v1', kanjiGroupId: 'g1' }, { id: 'v2', kanjiGroupId: 'g1' }];
  DB.kanjiGroups = [{ id: 'g1', semesterId: 's1' }];
  estMotMasque = (id) => id === 'v2';
  const pool = poolVocabPourPartie({ semesterId: 'tout' });
  if (pool.length !== 1 || pool[0].id !== 'v1') throw new Error('le mot masqué aurait dû être exclu');
  estMotMasque = () => false; // on remet le stub par défaut pour la suite
});

essai('poolVocabPourPartie filtre par semestre choisi', () => {
  DB.vocab = [
    { id: 'v1', kanjiGroupId: 'g1' }, // s1
    { id: 'v2', kanjiGroupId: 'g2' }  // s2
  ];
  DB.kanjiGroups = [{ id: 'g1', semesterId: 's1' }, { id: 'g2', semesterId: 's2' }];
  const pool = poolVocabPourPartie({ semesterId: 's1' });
  if (pool.length !== 1 || pool[0].id !== 'v1') throw new Error('le filtre par semestre ne fonctionne pas : ' + JSON.stringify(pool));
});

essai('appliquerTourBombe("reussi") avance le tour sans faire perdre de vie', async () => {
  const { sb, lire } = fabriquerSbCapture();
  window.sb = sb;
  DB.vocab = [{ id: 'v1', lecture: 'あ' }, { id: 'v2', lecture: 'い' }, { id: 'v3', lecture: 'う' }];
  partieCourante = etatDeBase();
  await appliquerTourBombe('reussi');
  const p = lire();
  if (p.etat !== 'en_cours') throw new Error('la partie ne doit pas se terminer ici');
  if (p.etat_jeu.vies.a !== 3) throw new Error('une réussite ne doit pas coûter de vie');
  if (p.etat_jeu.joueurActifIndex !== 1) throw new Error('le tour doit passer au joueur suivant (index 1), reçu ' + p.etat_jeu.joueurActifIndex);
  if (!p.etat_jeu.ordre.includes('a')) throw new Error('le joueur actif ne doit pas être éliminé sur une réussite');
});

essai('appliquerTourBombe("rate") coûte une vie au joueur actif sans l\'éliminer s\'il lui en reste', async () => {
  const { sb, lire } = fabriquerSbCapture();
  window.sb = sb;
  DB.vocab = [{ id: 'v1', lecture: 'あ' }, { id: 'v2', lecture: 'い' }, { id: 'v3', lecture: 'う' }];
  partieCourante = etatDeBase();
  await appliquerTourBombe('rate');
  const p = lire();
  if (p.etat_jeu.vies.a !== 2) throw new Error('attendu 2 vies restantes, reçu ' + p.etat_jeu.vies.a);
  if (!p.etat_jeu.ordre.includes('a')) throw new Error('le joueur ne doit pas être éliminé tant qu\'il lui reste une vie');
  if (p.etat_jeu.joueurActifIndex !== 1) throw new Error('le tour doit quand même passer au suivant');
});

essai('un joueur du milieu éliminé cède correctement la main à son voisin suivant', async () => {
  const { sb, lire } = fabriquerSbCapture();
  window.sb = sb;
  DB.vocab = [{ id: 'v1', lecture: 'あ' }, { id: 'v2', lecture: 'い' }, { id: 'v3', lecture: 'う' }];
  // b (index 1) n'a plus qu'une vie et c'est son tour.
  partieCourante = etatDeBase({
    etat_jeu: Object.assign({}, etatDeBase().etat_jeu, {
      joueurActifIndex: 1,
      vies: { a: 3, b: 1, c: 3 }
    })
  });
  await appliquerTourBombe('rate');
  const p = lire();
  if (p.etat_jeu.ordre.includes('b')) throw new Error('b aurait dû être éliminé');
  if (p.etat_jeu.ordre.join(',') !== 'a,c') throw new Error('ordre inattendu : ' + p.etat_jeu.ordre.join(','));
  // c était juste après b : c'est à c de jouer.
  const actif = p.etat_jeu.ordre[p.etat_jeu.joueurActifIndex];
  if (actif !== 'c') throw new Error('attendu c actif, reçu ' + actif);
});

essai('le dernier joueur d\'un tour élimine et fait boucler la main sur le premier', async () => {
  const { sb, lire } = fabriquerSbCapture();
  window.sb = sb;
  DB.vocab = [{ id: 'v1', lecture: 'あ' }, { id: 'v2', lecture: 'い' }, { id: 'v3', lecture: 'う' }];
  // c (dernier de l'ordre) n'a plus qu'une vie et c'est son tour.
  partieCourante = etatDeBase({
    etat_jeu: Object.assign({}, etatDeBase().etat_jeu, {
      joueurActifIndex: 2,
      vies: { a: 3, b: 3, c: 1 }
    })
  });
  await appliquerTourBombe('timeout');
  const p = lire();
  if (p.etat_jeu.ordre.join(',') !== 'a,b') throw new Error('ordre inattendu : ' + p.etat_jeu.ordre.join(','));
  const actif = p.etat_jeu.ordre[p.etat_jeu.joueurActifIndex];
  if (actif !== 'a') throw new Error('la main aurait dû boucler sur a, reçu ' + actif);
});

essai('il ne reste qu\'un joueur : la partie se termine et il est désigné vainqueur', async () => {
  const { sb, lire } = fabriquerSbCapture();
  window.sb = sb;
  DB.vocab = [{ id: 'v1', lecture: 'あ' }, { id: 'v2', lecture: 'い' }];
  partieCourante = etatDeBase({
    etat_jeu: {
      ordre: ['a', 'b'],
      joueurActifIndex: 0,
      vies: { a: 1, b: 3 },
      poolIds: ['v1', 'v2'],
      motActuelId: 'v1',
      motsUtilisesIds: ['v1'],
      finTourA: Date.now() + 10000,
      vainqueurId: null
    }
  });
  await appliquerTourBombe('rate');
  const p = lire();
  if (p.etat !== 'termine') throw new Error('la partie aurait dû se terminer');
  if (p.etat_jeu.vainqueurId !== 'b') throw new Error('b aurait dû être désigné vainqueur, reçu ' + p.etat_jeu.vainqueurId);
});

essai('appliquerTourBombe recycle le pool de mots une fois tous utilisés', async () => {
  const { sb, lire } = fabriquerSbCapture();
  window.sb = sb;
  DB.vocab = [{ id: 'v1', lecture: 'あ' }, { id: 'v2', lecture: 'い' }];
  partieCourante = etatDeBase({
    etat_jeu: Object.assign({}, etatDeBase().etat_jeu, {
      poolIds: ['v1', 'v2'],
      motActuelId: 'v2',
      motsUtilisesIds: ['v1', 'v2'] // les deux mots du pool ont déjà servi
    })
  });
  await appliquerTourBombe('reussi');
  const p = lire();
  // Le pool ayant été épuisé, la liste des mots utilisés doit repartir du
  // seul mot qu'on vient de piocher (pas rester bloquée à vide ni garder
  // les anciens en plus du nouveau).
  if (p.etat_jeu.motsUtilisesIds.length !== 1) throw new Error('le recyclage du pool a mal fonctionné : ' + JSON.stringify(p.etat_jeu.motsUtilisesIds));
  if (!p.etat_jeu.poolIds.includes(p.etat_jeu.motActuelId)) throw new Error('le nouveau mot doit venir du pool');
});

essai('appliquerTourBombe ignore les appels concurrents (garde-fou de ré-entrance)', async () => {
  const { sb, nbAppels } = fabriquerSbCapture();
  window.sb = sb;
  DB.vocab = [{ id: 'v1', lecture: 'あ' }, { id: 'v2', lecture: 'い' }, { id: 'v3', lecture: 'う' }];
  partieCourante = etatDeBase();
  const p1 = appliquerTourBombe('rate');
  const p2 = appliquerTourBombe('rate'); // doit être un no-op, le premier appel n'est pas encore résolu
  await p1; await p2;
  if (nbAppels() !== 1) throw new Error('attendu un seul appel à la base, reçu ' + nbAppels());
});

essai('soumettreReponseBombe ignore une soumission hors tour', async () => {
  const { sb, nbAppels } = fabriquerSbCapture();
  window.sb = sb;
  DB.vocab = [{ id: 'v1', lecture: 'あ' }];
  window.accountUser = { id: 'b', pseudo: 'B' }; // ce n'est pas son tour (a est actif)
  partieCourante = etatDeBase();
  scoreAnswer = () => ({ pct: 1, points: 0 });
  await soumettreReponseBombe('あ');
  if (nbAppels() !== 0) throw new Error('une soumission hors tour ne doit déclencher aucune mise à jour');
  window.accountUser = { id: 'moi', pseudo: 'Moi' }; // on remet l'état par défaut pour la suite
});

essai('soumettreReponseBombe applique le seuil strict (pct >= 0.99) pour juger une réponse correcte', async () => {
  const { sb, lire } = fabriquerSbCapture();
  window.sb = sb;
  DB.vocab = [{ id: 'v1', lecture: 'あ' }, { id: 'v2', lecture: 'い' }, { id: 'v3', lecture: 'う' }];
  window.accountUser = { id: 'a', pseudo: 'A' };
  partieCourante = etatDeBase();
  scoreAnswer = () => ({ pct: 0.98, points: 0 }); // proche mais pas exact
  await soumettreReponseBombe('presque');
  const p = lire();
  if (p.etat_jeu.vies.a !== 2) throw new Error('0.98 de similarité doit compter comme raté (perte de vie)');
  window.accountUser = { id: 'moi', pseudo: 'Moi' };
  scoreAnswer = (input, correct) => ({ pct: input === correct ? 1 : 0, points: 0 });
});
