// Scénarios de decks.js. Ce fichier est évalué dans la même portée que
// decks.js (voir decks.test.js) : il voit donc les variables déclarées avec
// let, ce qu'un simple require() ne permettrait pas.
//
// Lancer : node tests/decks.test.js

essai('liste, avant chargement', () => { decksCache = null; decksEnCours = true; renderDecks(); });
essai('liste vide', () => { decksCache = []; decksEnCours = false; renderDecks(); });
essai('liste avec erreur de chargement', () => { decksErreur = 'réseau'; renderDecks(); decksErreur = null; });

const DECK_A = {
  id: '1', slug: 'a', titre: 'Semestre 2 — LLCER', description: 'Le S2.', pseudo: 'Polus', auteur_id: 'u1',
  type: 'cursus', cursus: 'LLCER Japonais', niveau: '', decoupage: 'semaines',
  nb_kanji: 132, nb_mots: 418, nb_semaines: 8, note_moyenne: 4.5, nb_notes: 2, created_at: '2026-08-02T10:00:00Z'
};
const DECK_B = {
  id: '2', slug: 'b', titre: 'Prépa N4', description: '', pseudo: 'kiwitest', auteur_id: 'u2',
  type: 'jlpt', cursus: '', niveau: 'N4', decoupage: 'bloc',
  nb_kanji: 1, nb_mots: 1, nb_semaines: 0, note_moyenne: null, nb_notes: 0, created_at: '2026-08-01T10:00:00Z'
};

essai('liste avec des decks', () => { decksCache = [DECK_A, DECK_B]; renderDecks(); });
essai('filtre JLPT', () => { decksFiltre = 'jlpt'; renderDecks(); decksFiltre = 'tous'; });
essai('recherche', () => { decksRecherche = 'llcer'; renderDecks(); decksRecherche = ''; });

essai('bouton Retirer seulement sur ses propres decks', () => {
  window.accountUser = { id: 'u1', pseudo: 'Polus' };
  renderDecks();
  const html = trouve('#view-decks').innerHTML;
  if (!html.includes('data-retirer="1"')) throw new Error('bouton Retirer absent sur son deck');
  if (html.includes('data-retirer="2"')) throw new Error("bouton Retirer présent sur le deck d'un autre");
});

essai('tri : un deck sans note ne passe pas devant un deck noté', () => {
  const sans = { ...DECK_A, id: 'a', titre: 'Sans note', nb_kanji: 5, note_moyenne: null, nb_notes: 0, created_at: '2026-08-02T00:00:00Z' };
  const trois = { ...DECK_A, id: 'b', titre: 'Note 3', nb_kanji: 9, note_moyenne: 3.0, nb_notes: 2, created_at: '2026-08-01T00:00:00Z' };
  const cinq = { ...DECK_A, id: 'c', titre: 'Note 5', nb_kanji: 1, note_moyenne: 5.0, nb_notes: 1, created_at: '2026-07-01T00:00:00Z' };
  decksCache = [sans, trois, cinq];
  const ordre = (t) => { decksTri = t; return trierDecks(decksCache).map(d => d.id).join(','); };
  if (ordre('note') !== 'c,b,a') throw new Error('par note : ' + ordre('note'));
  if (ordre('kanji') !== 'b,a,c') throw new Error('par kanji : ' + ordre('kanji'));
  // « Note 3 » < « Note 5 » < « Sans note » : c'est mon attente qui était
  // fausse au premier essai, pas le tri.
  if (ordre('titre') !== 'b,c,a') throw new Error('alphabétique : ' + ordre('titre'));
  if (ordre('recents') !== 'a,b,c') throw new Error('par date : ' + ordre('recents'));
  decksTri = 'recents';
});

essai('les trois états du résultat personnel', () => {
  const deck = { id: 'z', slug: 'mien', titre: 'Mien', auteur_id: 'u9' };
  if (monResultat(deck) !== null) throw new Error('un deck non importé devrait donner null');
  DB.settings.semesters.push({ id: 'deck-mien', label: 'Mien', weeks: 2 });
  const sansScore = monResultat(deck);
  if (!sansScore || sansScore.best !== null) throw new Error('importé sans score mal détecté');
  DB.scores['deck-mien-w1'] = { best: { pct: 70, points: 70, maxPoints: 100 }, history: [] };
  DB.scores['deck-mien-w2'] = { best: { pct: 90, points: 90, maxPoints: 100 }, history: [] };
  DB.scores['s1-w1'] = { best: { pct: 100, points: 10, maxPoints: 10 }, history: [] };
  const avec = monResultat(deck);
  if (!avec.best || avec.best.pct !== 90) throw new Error('meilleur score = ' + JSON.stringify(avec.best));
  if (avec.best.pct === 100) throw new Error('un score d\'un autre semestre a été compté');
});

essai('un deck sans description et sans note reste lisible', () => {
  window.accountUser = null;
  decksCache = [DECK_B];
  decksEnCours = false; decksErreur = null; decksFiltre = 'tous'; decksRecherche = '';
  renderDecks();
  const html = trouve('#view-decks').innerHTML;
  if (!html.includes('est-vide')) throw new Error('la classe est-vide manque');
  if (!html.includes('Aucune note')) throw new Error('« Aucune note » manque');
  if (!html.includes('Aucun résultat')) throw new Error('« Aucun résultat » manque');
});

essai('un auteur ne peut pas noter son propre deck', () => {
  window.accountUser = { id: 'u2' };
  decksCache = [DECK_B];
  renderDecks();
  const html = trouve('#view-decks').innerHTML;
  if (html.includes('data-noter')) throw new Error('les étoiles sont cliquables pour son propre deck');
  if (!html.includes('est-sienne')) throw new Error('marque est-sienne absente');
});

essai('un deck déjà importé ne propose plus le bouton', () => {
  window.accountUser = null;
  const deck = { ...DECK_A, slug: 'mien' }; // 'deck-mien' est déjà dans DB
  decksCache = [deck];
  renderDecks();
  const html = trouve('#view-decks').innerHTML;
  if (!html.includes('Déjà importé')) throw new Error('le bouton devrait annoncer « Déjà importé »');
  if (!/data-importer="[^"]*" disabled/.test(html)) throw new Error('le bouton devrait être désactivé');
});

essai("extraction du contenu d'un semestre", () => {
  const c = contenuDuSemestre('s1', 'semaines');
  if (c.kanjiGroups.length !== 2 || c.vocab.length !== 2) throw new Error('contenu incomplet');
  if (c.kanjiGroups[1].week !== 3) throw new Error('semaine perdue');
});

essai("d'un seul bloc : toutes les semaines ramenées à 1", () => {
  const c = contenuDuSemestre('s1', 'bloc');
  if (c.kanjiGroups.some(g => g.week !== 1)) throw new Error('semaine non ramenée à 1');
});

essai('titre citant un manuel refusé', () => {
  if (!titreCiteUnManuel('Genki chapitre 3')) throw new Error('Genki non détecté');
  if (!titreCiteUnManuel('MINNA NO NIHONGO leçon 12')) throw new Error('casse non gérée');
  if (titreCiteUnManuel('Semestre 2 — LLCER Japonais')) throw new Error('faux positif');
});

essai("import : rien n'est écrasé", () => {
  const avantKanji = DB.kanjiGroups.length, avantMots = DB.vocab.length, avantSem = DB.settings.semesters.length;
  const contenu = contenuDuSemestre('s1', 'semaines');
  const res = fusionnerDeck({ slug: 'venu-dailleurs', titre: "Venu d'ailleurs", decoupage: 'semaines', pseudo: 'Autre' }, contenu);
  if (!res.ok) throw new Error(res.raison);
  if (DB.settings.semesters.length !== avantSem + 1) throw new Error('semestre non ajouté');
  if (DB.kanjiGroups.length !== avantKanji + 2) throw new Error('kanji non ajoutés');
  if (DB.vocab.length !== avantMots + 2) throw new Error('mots non ajoutés');
  if (DB.kanjiGroups.slice(0, avantKanji).some(g => g.semesterId !== 's1')) throw new Error('semestre existant modifié');
  const nouveaux = DB.kanjiGroups.slice(avantKanji);
  if (nouveaux.some(g => g.id === 'kg-1' || g.id === 'kg-2')) throw new Error('identifiants non réattribués');
  const ids = new Set(nouveaux.map(g => g.id));
  if (DB.vocab.slice(avantMots).some(v => !ids.has(v.kanjiGroupId))) throw new Error('mot rattaché au mauvais kanji');
});

essai('import deux fois : refusé', () => {
  const contenu = contenuDuSemestre('s1', 'semaines');
  const res = fusionnerDeck({ slug: 'venu-dailleurs', titre: 'x', decoupage: 'semaines', pseudo: 'Autre' }, contenu);
  if (res.ok) throw new Error('doublon accepté');
});

// ---------- Publier une partie de semestre ----------

essai('publier une plage de semaines ne prend que ces semaines', () => {
  DB.kanjiGroups.push(
    { id: 'kg-3', semesterId: 's1', week: 5, kanji: '週', titre: 'semaine' },
    { id: 'kg-4', semesterId: 's1', week: 6, kanji: '末', titre: 'fin' }
  );
  DB.vocab.push({ id: 'v-3', kanjiGroupId: 'kg-3', mot: '今週', lecture: 'こんしゅう', sens: 'cette semaine' });
  const c = contenuDuSemestre('s1', 'semaines', { debut: 5, fin: 6 });
  if (c.kanjiGroups.length !== 2) throw new Error('kanji hors plage inclus : ' + c.kanjiGroups.length);
  if (c.vocab.length !== 1) throw new Error('vocabulaire hors plage inclus');
  // Renumérotation : la semaine 5 devient la 1, la 6 devient la 2.
  if (c.kanjiGroups.map(g => g.week).join(',') !== '1,2') throw new Error('semaines non renumérotées : ' + c.kanjiGroups.map(g => g.week).join(','));
});

essai('une plage inversée est remise à l\'endroit', () => {
  pubEtat.semesterId = 's1'; pubEtat.portee = 'plage';
  pubEtat.semaineDebut = 6; pubEtat.semaineFin = 5;
  const p = plageRetenue({ semaines: 12 });
  if (p.debut !== 5 || p.fin !== 6) throw new Error('plage = ' + JSON.stringify(p));
});

essai('une plage au-delà du semestre est bornée', () => {
  pubEtat.semaineDebut = 1; pubEtat.semaineFin = 99;
  const p = plageRetenue({ semaines: 8 });
  if (p.fin !== 8) throw new Error('borne haute non appliquée : ' + p.fin);
  pubEtat.portee = 'tout';
  if (plageRetenue({ semaines: 8 }) !== null) throw new Error('« tout le semestre » devrait donner null');
});

// ---------- Page d'un deck ----------

essai("la page d'un deck affiche l'aperçu, la note et la discussion", () => {
  window.accountUser = { id: 'u9', pseudo: 'Lecteur' };
  deckDetailErreur = null;
  deckDetail = {
    deck: { ...DECK_A, id: 'p1', slug: 'page', auteur_id: 'u1', visible: true,
            contenu: { kanjiGroups: [{ kanji: '支', titre: 'soutenir', week: 1 }], vocab: [] } },
    avis: []
  };
  commentaires = [
    { id: 'c1', parent_id: null, user_id: 'u5', pseudo: 'Hana', texte: 'Bien construit.', score: 3, created_at: '2026-08-01T00:00:00Z' },
    { id: 'c2', parent_id: 'c1', user_id: 'u6', pseudo: 'Ken', texte: 'D\'accord.', score: 1, created_at: '2026-08-02T00:00:00Z' }
  ];
  mesVotes = {}; reponseA = null; brouillons = {};
  monAvis = { note: 0, texte: '', envoi: false };
  renderDeck();
  const html = trouve('#view-deck').innerHTML;
  if (!html.includes('avisEtoiles')) throw new Error('les étoiles de notation manquent');
  if (!html.includes('Hana')) throw new Error("le commentaire n'est pas affiché");
  if (!html.includes('Bien construit.')) throw new Error('le texte du commentaire manque');
  if (!html.includes('data-repondre="c1"')) throw new Error('le bouton Répondre manque');
  if (html.includes('Supprimer définitivement')) throw new Error('un tiers voit le bouton de suppression');
});

essai("l'arbre des commentaires imbrique les réponses", () => {
  const racines = arbreCommentaires();
  if (racines.length !== 1) throw new Error('racines = ' + racines.length);
  if (racines[0].enfants.length !== 1) throw new Error('réponse non rattachée');
  if (racines[0].enfants[0].id !== 'c2') throw new Error('mauvaise réponse rattachée');
});

essai('une réponse orpheline remonte à la racine au lieu de disparaître', () => {
  commentaires = [{ id: 'c9', parent_id: 'parti', user_id: 'u5', pseudo: 'Hana', texte: 'Seul.', score: 0, created_at: '2026-08-01T00:00:00Z' }];
  const racines = arbreCommentaires();
  if (racines.length !== 1) throw new Error('le commentaire a disparu');
});

essai('tri de la discussion : par score puis par date', () => {
  commentaires = [
    { id: 'a', parent_id: null, user_id: 'u5', pseudo: 'A', texte: 'a', score: 1, created_at: '2026-08-01T00:00:00Z' },
    { id: 'b', parent_id: null, user_id: 'u5', pseudo: 'B', texte: 'b', score: 5, created_at: '2026-08-02T00:00:00Z' },
    { id: 'c', parent_id: null, user_id: 'u5', pseudo: 'C', texte: 'c', score: 1, created_at: '2026-07-01T00:00:00Z' }
  ];
  triCommentaires = 'score';
  if (arbreCommentaires().map(c => c.id).join(',') !== 'b,c,a') throw new Error('par score : ' + arbreCommentaires().map(c => c.id).join(','));
  triCommentaires = 'recents';
  if (arbreCommentaires().map(c => c.id).join(',') !== 'b,a,c') throw new Error('par date : ' + arbreCommentaires().map(c => c.id).join(','));
  triCommentaires = 'score';
});

essai("l'imbrication est plafonnée pour ne pas manger la largeur", () => {
  commentaires = [];
  let parent = null;
  for (let i = 0; i < 9; i++) {
    commentaires.push({ id: 'n' + i, parent_id: parent, user_id: 'u5', pseudo: 'P', texte: 'niveau ' + i, score: 0, created_at: '2026-08-0' + (i % 9 + 1) + 'T00:00:00Z' });
    parent = 'n' + i;
  }
  const html = htmlCommentaire(arbreCommentaires()[0], 0, false);
  const marges = [...html.matchAll(/margin-left:(\d+)px/g)].map(m => Number(m[1]));
  if (Math.max(...marges) > PROFONDEUR_MAX * 22) throw new Error('marge maximale = ' + Math.max(...marges));
  if (!html.includes('niveau 8')) throw new Error('un commentaire profond a disparu');
});

essai("l'auteur voit la suppression et pas les étoiles", () => {
  window.accountUser = { id: 'u1', pseudo: 'Polus' };
  commentaires = [];
  renderDeck();
  const html = trouve('#view-deck').innerHTML;
  if (!html.includes('Supprimer définitivement')) throw new Error('bouton de suppression absent');
  if (!html.includes('Retirer de la liste')) throw new Error('bouton de retrait absent');
  if (html.includes('avisEtoiles')) throw new Error("l'auteur peut noter son propre deck");
});

essai('un deck masqué propose de le remettre en ligne', () => {
  deckDetail.deck.visible = false;
  renderDeck();
  if (!trouve('#view-deck').innerHTML.includes('Remettre en ligne')) throw new Error('bouton absent');
  deckDetail.deck.visible = true;
});

essai('une discussion vide invite à commencer', () => {
  window.accountUser = null;
  commentaires = [];
  renderDeck();
  const html = trouve('#view-deck').innerHTML;
  if (!html.includes("Personne n'a encore rien écrit")) throw new Error('invitation absente');
  if (!html.includes('Connecte-toi pour participer')) throw new Error('la marche à suivre manque pour un visiteur');
});

essai('un deck introuvable affiche une erreur, pas une page vide', () => {
  deckDetailErreur = 'introuvable'; deckDetail = null;
  renderDeck();
  if (!trouve('#view-deck').innerHTML.includes('introuvable')) throw new Error("l'erreur n'est pas affichée");
  deckDetailErreur = null;
});
