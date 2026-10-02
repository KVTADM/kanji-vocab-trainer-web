// Scénarios pour parties-jeux.js — voir tests/parties-jeux.test.js pour le harnais.

function ok(cond, msg) { if (!cond) throw new Error(msg); }

const ENTREES = [
  { mot: '学生', lecture: 'がくせい', sens: 'étudiant' },
  { mot: '生活', lecture: 'せいかつ', sens: 'vie quotidienne' },
  { mot: '活動', lecture: 'かつどう', sens: 'activité' },
  { mot: '動物', lecture: 'どうぶつ', sens: 'animal' },
  { mot: '生物', lecture: 'せいぶつ', sens: 'être vivant' },
  { mot: '学校', lecture: 'がっこう', sens: 'école' },
  { mot: '校長', lecture: 'こうちょう', sens: 'directeur' },
  { mot: '日本', lecture: 'にほん', sens: 'Japon' },
  { mot: '日本', lecture: 'にっぽん', sens: 'Japon' },
  { mot: '本屋', lecture: 'ほんや', sens: 'librairie' },
  { mot: '食べる', lecture: 'たべる', sens: 'manger' },
  { mot: 'ありがとう', lecture: 'ありがとう', sens: 'merci' }
];

function entreesPlus(n) {
  const l = ENTREES.slice();
  for (let i = 0; i < n; i++) l.push({ mot: '字' + String.fromCharCode(0x4e00 + i), lecture: 'じ' + 'あ'.repeat(i + 1), sens: 'x' + i });
  return l;
}

// ---- Outils -----------------------------------------------------------------

essai('poolVocabPourPartie filtre par semaines choisies (semestre:semaine)', () => {
  DB.vocab = [{ id: 'v1', kanjiGroupId: 'g1' }, { id: 'v2', kanjiGroupId: 'g2' }, { id: 'v3', kanjiGroupId: 'g3' }];
  DB.kanjiGroups = [{ id: 'g1', semesterId: 's1', week: 1 }, { id: 'g2', semesterId: 's1', week: 2 }, { id: 'g3', semesterId: 's2', week: 1 }];
  const pool = poolVocabPourPartie({ selection: ['s1:2', 's2:1'] });
  ok(pool.length === 2 && pool.some(v => v.id === 'v2') && pool.some(v => v.id === 'v3'), 'attendu v2 et v3');
  ok(poolVocabPourPartie({ selection: [] }).length === 3, 'sélection vide = tout');
});

essai('jeuxDernierKanji prend le dernier kanji, même avant des kana', () => {
  ok(jeuxDernierKanji('学生') === '生', '学生');
  ok(jeuxDernierKanji('食べる') === '食', '食べる');
  ok(jeuxDernierKanji('ありがとう') === null, 'tout en kana');
});

essai('jeuxTirerMots regroupe les lectures d\'un même mot', () => {
  const m = jeuxTirerMots(ENTREES, 50);
  const nihon = m.find(x => x.mot === '日本');
  ok(nihon && nihon.lectures.length === 2, 'deux lectures attendues');
  ok(new Set(m.map(x => x.mot)).size === m.length, 'mots distincts');
});

essai('configPartiePourJeu garde les réglages de chaque jeu', () => {
  ok(configPartiePourJeu('duel', { manches: 5, tempsMs: 15000, selection: ['s1:1'] }).manches === 5, 'duel manches');
  ok(configPartiePourJeu('relais', { tempsTourMs: 30000, selection: ['s1:1'] }).selection === undefined, 'relais sans sélection');
  ok(configPartiePourJeu('bombe', { selection: ['s1:1', 's1:2'] }).selection.length === 2, 'bombe sélection');
  ok(configPartiePourJeu('dessin', {}).tempsMs === 60000, 'dessin défaut');
});

// ---- Écriture atomique ------------------------------------------------------

function fabriquerSbVersionnee(ligneInitiale) {
  const base = { ligne: ligneInitiale, ecritures: 0 };
  base.sb = {
    from() {
      return {
        update(patch) {
          return {
            eq(col, val) {
              return {
                eq(col2, val2) {
                  return {
                    select() {
                      const v = base.ligne.etat_jeu && base.ligne.etat_jeu.v;
                      if (String(v) !== val2) return Promise.resolve({ data: [], error: null });
                      base.ligne = Object.assign({}, base.ligne, patch);
                      base.ecritures++;
                      return Promise.resolve({ data: [base.ligne], error: null });
                    }
                  };
                }
              };
            }
          };
        },
        select() { return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: base.ligne, error: null }) }) }; }
      };
    }
  };
  return base;
}

essai('ecrireEtatJeu : une écriture périmée relit l\'état et réessaie sans écraser l\'autre joueur', async () => {
  const base = fabriquerSbVersionnee({ id: 'p1', etat: 'en_cours', etat_jeu: { v: 3, n: 0 } });
  window.sb = base.sb;
  partieCourante = { id: 'p1', etat: 'en_cours', etat_jeu: { v: 2, n: 0 } }; // on est en retard d'une version
  const r = await ecrireEtatJeu((ej) => ({ ...ej, n: ej.n + 1 }));
  ok(r === true, 'écriture refusée');
  ok(base.ligne.etat_jeu.v === 4, 'version attendue 4, reçu ' + base.ligne.etat_jeu.v);
  ok(base.ligne.etat_jeu.n === 1, 'modification perdue');
});

essai('ecrireEtatJeu : une mutation qui renonce n\'écrit rien', async () => {
  const base = fabriquerSbVersionnee({ id: 'p1', etat: 'en_cours', etat_jeu: { v: 0 } });
  window.sb = base.sb;
  partieCourante = { id: 'p1', etat: 'en_cours', etat_jeu: { v: 0 } };
  ok((await ecrireEtatJeu(() => null)) === false, 'doit renoncer');
  ok(base.ecritures === 0, 'aucune écriture attendue');
});

essai('ecrireEtatJeu : un état terminé passe la partie à « termine »', async () => {
  const base = fabriquerSbVersionnee({ id: 'p1', etat: 'en_cours', etat_jeu: { v: 0 } });
  window.sb = base.sb;
  partieCourante = { id: 'p1', etat: 'en_cours', etat_jeu: { v: 0 } };
  await ecrireEtatJeu((ej) => ({ ...ej, termine: true }));
  ok(base.ligne.etat === 'termine', 'etat attendu termine');
});

// ---- Duel éclair ------------------------------------------------------------

function duelDepart(opts) {
  return creerEtatDuel(['a', 'b'], Object.assign({ manches: 3, tempsMs: 10000 }, opts || {}), entreesPlus(40));
}

function ouvrirQuestion(ej) { return duelFinPhase(ej); } // compte -> question

essai('duel : le premier à donner la bonne lecture marque le point et clôt la manche', () => {
  let ej = ouvrirQuestion(duelDepart());
  ej = duelReponse(ej, 'a', true);
  ok(ej.scores.a === 1 && ej.phase === 'resultat' && ej.gagnantManche === 'a', 'point pour a');
  ok(duelReponse(ej, 'b', true) === null, 'plus de réponse acceptée une fois la manche close');
});

essai('duel : une erreur bloque ce joueur, l\'adversaire peut encore répondre', () => {
  let ej = ouvrirQuestion(duelDepart());
  ej = duelReponse(ej, 'a', false);
  ok(ej.phase === 'question' && ej.essais.a === 'faux', 'la manche continue');
  ok(duelReponse(ej, 'a', true) === null, 'a ne peut plus répondre');
  ej = duelReponse(ej, 'b', true);
  ok(ej.scores.b === 1 && ej.gagnantManche === 'b', 'b marque');
});

essai('duel : deux erreurs ou temps écoulé = aucun point', () => {
  let ej = ouvrirQuestion(duelDepart());
  ej = duelReponse(duelReponse(ej, 'a', false), 'b', false);
  ok(ej.phase === 'resultat' && ej.gagnantManche === 'aucun' && ej.scores.a === 0 && ej.scores.b === 0, 'aucun point');
  let ej2 = duelFinPhase(ouvrirQuestion(duelDepart()));
  ok(ej2.phase === 'resultat' && ej2.gagnantManche === 'aucun', 'timeout = aucun point');
});

essai('duel : un joueur étranger à la partie ne peut pas répondre', () => {
  const ej = ouvrirQuestion(duelDepart());
  ok(duelReponse(ej, 'intrus', true) === null, 'refusé');
});

essai('duel : le gagnant est celui qui a le plus de points après toutes les manches', () => {
  let ej = duelDepart({ manches: 3 });
  const jouer = (uid) => {
    ej = ouvrirQuestion(ej);
    if (uid) ej = duelReponse(ej, uid, true); else ej = duelFinPhase(ej);
    ej = duelFinPhase(ej); // résultat -> manche suivante ou fin
  };
  jouer('a'); jouer('a'); jouer('b');
  ok(ej.termine && ej.vainqueurId === 'a', 'a gagne 2-1, reçu ' + JSON.stringify([ej.termine, ej.vainqueurId]));
});

essai('duel : en cas d\'égalité on joue des manches supplémentaires jusqu\'à un avantage', () => {
  let ej = duelDepart({ manches: 2 });
  const jouer = (uid) => {
    ej = ouvrirQuestion(ej);
    ej = uid ? duelReponse(ej, uid, true) : duelFinPhase(ej);
    ej = duelFinPhase(ej);
  };
  jouer('a'); jouer('b');
  ok(!ej.termine && ej.manche === 3, 'égalité 1-1 : manche de départage, reçu manche ' + ej.manche);
  jouer(null);
  ok(!ej.termine && ej.manche === 4, 'toujours égal : on continue');
  jouer('b');
  ok(ej.termine && ej.vainqueurId === 'b', 'b prend l\'avantage');
});

essai('duel : les deux joueurs voient le même mot (copié dans l\'état) avec ses lectures', () => {
  const ej = duelDepart();
  const m = duelMotCourant(ej);
  ok(m && m.mot && m.lectures.length >= 1 && 'sens' in m, 'mot complet attendu');
  ok(ej.mots.every(x => /[㐀-鿿]/.test(x.mot)), 'uniquement des mots écrits avec des kanji');
});

// ---- Relais des mots --------------------------------------------------------

function relaisDepart() {
  const ej = creerEtatRelais(['a', 'b', 'c'], { tempsTourMs: 20000 }, ENTREES.filter(e => e.mot === '学生' || e.mot === '生活' || e.mot === '活動' || e.mot === '動物' || e.mot === '生物'));
  return ej;
}

essai('relais : le départ est un mot qui a une suite possible, chacun commence avec 3 vies', () => {
  const ej = relaisDepart();
  ok(ej.vies.a === 3 && ej.vies.b === 3 && ej.vies.c === 3, '3 vies');
  ok(relaisCandidats(ENTREES, ej.dernierKanji, ej.utilises).length > 0, 'suite possible');
});

essai('relais : exemple 学生 -> 生活 puis 活 pour la suite', () => {
  const entrees = ENTREES;
  let ej = { ...relaisDepart(), mot: ENTREES[0], dernierKanji: '生', utilises: ['学生'], historique: [{ mot: '学生', lecture: 'がくせい', par: null }] };
  const v = relaisValider(entrees, ej, '生活', 'せいかつ');
  ok(v.ok, '生活 doit être accepté');
  ej = relaisAppliquer(ej, 'a', v, entrees);
  ok(ej.dernierKanji === '活' && ej.actifIndex === 1 && ej.utilises.includes('生活'), 'la chaîne continue par 活');
  ok(ej.dernierResultat.sens === 'vie quotidienne', 'le sens est affiché');
});

essai('relais : refus d\'un mauvais kanji, d\'un mot inconnu, déjà utilisé ou mal lu', () => {
  const ej = { ...relaisDepart(), mot: ENTREES[0], dernierKanji: '生', utilises: ['学生', '生活'] };
  ok(!relaisValider(ENTREES, ej, '日本', 'にほん').ok, 'mauvais premier kanji');
  ok(!relaisValider(ENTREES, ej, '生きる', 'いきる').ok, 'hors vocabulaire');
  ok(!relaisValider(ENTREES, ej, '生活', 'せいかつ').ok, 'déjà utilisé');
  ok(!relaisValider(ENTREES, ej, '生物', 'せいぶつぶつ').ok, 'mauvaise lecture');
  ok(relaisValider(ENTREES, ej, '生物', 'せいぶつ').ok, 'bonne réponse acceptée');
});

essai('relais : une erreur coûte une vie et passe la main ; le temps écoulé pareil', () => {
  let ej = relaisDepart();
  ej = relaisAppliquer(ej, 'a', { ok: false, raison: 'x' }, ENTREES);
  ok(ej.vies.a === 2 && ej.actifIndex === 1, 'vie perdue, tour suivant');
  ej = relaisFinPhase(ej);
  ok(ej.vies.b === 2 && ej.actifIndex === 2 && ej.dernierResultat.issue === 'timeout', 'timeout');
});

essai('relais : seul le joueur actif peut jouer', () => {
  const ej = relaisDepart();
  ok(relaisAppliquer(ej, 'b', { ok: false }, ENTREES) === null, 'tour de a');
});

essai('relais : à 0 vie on est éliminé ; le dernier en jeu gagne', () => {
  let ej = { ...relaisDepart(), ordre: ['a', 'b'], vies: { a: 1, b: 3 }, actifIndex: 0 };
  ej = relaisAppliquer(ej, 'a', { ok: false }, ENTREES);
  ok(ej.termine && ej.vainqueurId === 'b' && ej.ordre.length === 1, 'b gagne');
});

essai('relais : élimination au milieu — la main revient au bon joueur', () => {
  let ej = { ...relaisDepart(), vies: { a: 3, b: 1, c: 3 }, actifIndex: 1 };
  ej = relaisAppliquer(ej, 'b', { ok: false }, ENTREES);
  ok(JSON.stringify(ej.ordre) === '["a","c"]' && ej.ordre[ej.actifIndex] === 'c' && !ej.termine, 'c joue après b');
});

essai('relais : cul-de-sac = nouveau mot de départ, sans perdre de vie', () => {
  const entrees = [
    { mot: '学生', lecture: 'がくせい', sens: 'étudiant' },
    { mot: '生猪', lecture: 'せいちょ', sens: 'x' },       // finit par 猪 : aucun mot ne commence par 猪
    { mot: '日本', lecture: 'にほん', sens: 'Japon' },
    { mot: '本屋', lecture: 'ほんや', sens: 'librairie' }
  ];
  let ej = { ...creerEtatRelais(['a', 'b'], {}, entrees), mot: entrees[0], dernierKanji: '生', utilises: ['学生'] };
  const v = relaisValider(entrees, ej, '生猪', 'せいちょ');
  ok(v.ok, 'mot valide');
  ej = relaisAppliquer(ej, 'a', v, entrees);
  ok(ej.dernierResultat.redemarrage === true, 'redémarrage signalé');
  ok(ej.vies.a === 3, 'aucune vie perdue');
  ok(!ej.utilises.slice(0, 2).every(m => m === ej.mot.mot) && ej.mot.mot !== '生猪', 'nouveau mot de départ');
  ok(relaisCandidats(entrees, ej.dernierKanji, ej.utilises).length > 0, 'le nouveau départ a une suite');
});

essai('relais : un joueur qui quitte ne bloque pas la partie', () => {
  let ej = relaisDepart();
  ej = jeuxRetirerAbsents(ej, ['b', 'c']); // a (actif) part
  ok(ej && JSON.stringify(ej.ordre) === '["b","c"]' && ej.ordre[ej.actifIndex] === 'b', 'b prend la main');
  const fin = jeuxRetirerAbsents(relaisDepart(), ['c']);
  ok(fin.termine && fin.vainqueurId === 'c', 'c gagne seul');
  ok(jeuxRetirerAbsents(relaisDepart(), ['a', 'b', 'c']) === null, 'personne de parti : rien à faire');
});

// ---- Dessin de kanji --------------------------------------------------------

function dessinDepart() {
  return creerEtatDessin(['a', 'b', 'c'], { tempsMs: 60000 }, entreesPlus(10));
}

essai('dessin : plus on devine vite, plus on gagne de points ; le dessinateur gagne 3 points par devineur', () => {
  let ej = dessinDepart();
  ej = dessinTrouve(ej, 'b', 60000);
  ej = dessinTrouve(ej, 'c', 0);
  ok(ej.scores.b === 10 && ej.scores.c === 3, 'points b/c : ' + ej.scores.b + '/' + ej.scores.c);
  ok(ej.scores.a === 6, 'le dessinateur a gagne 3 x 2');
  ok(ej.phase === 'revele', 'tous ont trouvé : manche close');
});

essai('dessin : le dessinateur ne peut pas deviner, ni deviner deux fois', () => {
  let ej = dessinDepart();
  ok(dessinTrouve(ej, 'a', 1000) === null, 'dessinateur refusé');
  ej = dessinTrouve(ej, 'b', 30000);
  ok(dessinTrouve(ej, 'b', 30000) === null, 'deuxième réponse refusée');
});

essai('dessin : chacun dessine à son tour puis classement final', () => {
  let ej = dessinDepart();
  ej = dessinTrouve(dessinTrouve(ej, 'b', 60000), 'c', 60000); // manche 1 close
  ej = dessinFinPhase(ej);                                       // revele -> dessin suivant
  ok(ej.tour === 1 && ej.phase === 'dessin' && Object.keys(ej.trouves).length === 0, 'tour de b');
  ej = dessinTrouve(ej, 'a', 60000);                             // a devine vite le dessin de b
  ej = dessinFinPhase(ej); ej = dessinFinPhase(ej);              // temps écoulé, puis révélation
  ok(ej.tour === 2, 'tour de c');
  ej = dessinFinPhase(ej); ej = dessinFinPhase(ej);
  ok(ej.termine && ej.vainqueurId === 'a', 'a gagne : ' + JSON.stringify(ej.scores));
  ok(dessinClassement(ej)[0][0] === ej.vainqueurId, 'vainqueur = premier du classement');
});

essai('dessin : égalité en tête = pas de vainqueur désigné', () => {
  let ej = dessinDepart();
  ej = { ...ej, scores: { a: 5, b: 9, c: 9 }, tour: 2, phase: 'revele' };
  ej = dessinFinPhase(ej);
  ok(ej.termine && ej.vainqueurId === null, 'égalité');
});

essai('dessin : les mots choisis ont au plus 3 caractères et contiennent un kanji', () => {
  const ej = dessinDepart();
  ok(ej.mots.length === 3 && ej.mots.every(m => m.mot.length <= 3 && /[㐀-鿿]/.test(m.mot)), 'mots dessinables');
});

// ---- Choix des durées -------------------------------------------------------

essai('jeuxDureePhase : durées par jeu et par phase', () => {
  ok(jeuxDureePhase({ jeu: 'duel', phase: 'compte' }) === DUEL_COMPTE_MS, 'compte');
  ok(jeuxDureePhase({ jeu: 'duel', phase: 'question', dureeMs: 10000 }) === 10000, 'question');
  ok(jeuxDureePhase({ jeu: 'relais', phase: 'tour', dureeMs: 20000 }) === 20000, 'tour');
  ok(jeuxDureePhase({ jeu: 'dessin', phase: 'revele' }) === DESSIN_REVELE_MS, 'révélation');
  ok(jeuxDureePhase({ jeu: 'duel', phase: 'fin', termine: true }) === 0, 'fin sans minuteur');
});
