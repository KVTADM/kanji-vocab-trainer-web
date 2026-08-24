// Scénarios de gamification.js. Concaténés au harnais avant évaluation.

function baseGamif() {
  return { xp: 0, pieces: 0, streak: { compte: 0, record: 0, dernierJour: null }, inventaire: [], titreActif: null };
}

// ---------- Niveau ----------

essai('niveau 1 de 0 à 49 XP, niveau 2 pile à 50', () => {
  if (niveauDepuisXp(0) !== 1) throw new Error('xp=0 -> niveau ' + niveauDepuisXp(0));
  if (niveauDepuisXp(49) !== 1) throw new Error('xp=49 -> niveau ' + niveauDepuisXp(49));
  if (niveauDepuisXp(50) !== 2) throw new Error('xp=50 -> niveau ' + niveauDepuisXp(50));
  if (niveauDepuisXp(199) !== 2) throw new Error('xp=199 -> niveau ' + niveauDepuisXp(199));
  if (niveauDepuisXp(200) !== 3) throw new Error('xp=200 -> niveau ' + niveauDepuisXp(200));
});

essai('progressionNiveau calcule le bon pourcentage vers le niveau suivant', () => {
  const debut = progressionNiveau(50); // pile au début du niveau 2 (50-199)
  if (debut.niveau !== 2 || debut.pct !== 0) throw new Error(JSON.stringify(debut));
  const milieu = progressionNiveau(125); // 75/150 = 50%
  if (milieu.niveau !== 2 || milieu.pct !== 50) throw new Error(JSON.stringify(milieu));
});

// ---------- Gains d'XP ----------

essai('gagnerXp ajoute exactement les points sans compte Pro', () => {
  DB = { gamification: baseGamif() };
  window.accountUser = null;
  const gain = gagnerXp(10);
  if (gain !== 10 || DB.gamification.xp !== 10) throw new Error('gain=' + gain + ' xp=' + DB.gamification.xp);
});

essai('gagnerXp est boosté x1.5 avec un compte Pro', () => {
  DB = { gamification: baseGamif() };
  window.accountUser = { isPro: true };
  const gain = gagnerXp(10);
  if (gain !== 15 || DB.gamification.xp !== 15) throw new Error('gain=' + gain + ' xp=' + DB.gamification.xp);
  window.accountUser = null;
});

essai('gagnerXp ne fait rien pour 0 ou des points négatifs', () => {
  DB = { gamification: baseGamif() };
  window.accountUser = null;
  if (gagnerXp(0) !== 0) throw new Error('0 points ne devrait rien rapporter');
  if (gagnerXp(-3) !== 0) throw new Error('points négatifs ne devrait rien rapporter');
  if (DB.gamification.xp !== 0) throw new Error('xp a bougé alors qu\'il ne devrait pas');
});

// ---------- Gains de pièces d'or ----------

essai('gagnerPieces ne rapporte rien sous le seuil (mot raté)', () => {
  DB = { gamification: baseGamif() };
  window.accountUser = null;
  const gain = gagnerPieces(5); // < GAMIF_SEUIL_PIECE (6)
  if (gain !== 0 || DB.gamification.pieces !== 0) throw new Error('gain=' + gain);
});

essai('gagnerPieces rapporte 2 pièces fixes au-dessus du seuil, boostées pour le Pro', () => {
  DB = { gamification: baseGamif() };
  window.accountUser = null;
  if (gagnerPieces(6) !== 2) throw new Error('pièce normale incorrecte');
  if (gagnerPieces(10) !== 2) throw new Error('le gain est fixe, pas proportionnel aux points');
  window.accountUser = { isPro: true };
  if (gagnerPieces(6) !== 3) throw new Error('boost Pro incorrect sur les pièces'); // round(2×1.5) = 3
  window.accountUser = null;
});

// ---------- Bonus de fin de session ----------

essai('bonusFinSession ne paie rien sous 80%, paie 15 (ou 23 en Pro) au-dessus', () => {
  DB = { gamification: baseGamif() };
  window.accountUser = null;
  if (bonusFinSession(79) !== 0) throw new Error('79% ne devrait rien payer');
  if (bonusFinSession(80) !== 15) throw new Error('80% devrait payer 15');
  DB = { gamification: baseGamif() };
  window.accountUser = { isPro: true };
  if (bonusFinSession(100) !== 23) throw new Error('bonus Pro incorrect'); // round(15×1.5)=23
  window.accountUser = null;
});

// ---------- Série quotidienne (streak) ----------

essai('mettreAJourStreak démarre à 1 et ne recompte pas deux fois le même jour', () => {
  DB = { gamification: baseGamif() };
  const premier = mettreAJourStreak();
  if (premier.compte !== 1 || premier.record !== 1) throw new Error(JSON.stringify(premier));
  const second = mettreAJourStreak(); // même jour, appelé une deuxième fois
  if (second.compte !== 1) throw new Error('un deuxième mot le même jour a fait avancer la série');
});

essai('un jour consécutif fait avancer la série et son record', () => {
  const hier = gamifJourPrecedent(gamifDateDuJour());
  DB = { gamification: { ...baseGamif(), streak: { compte: 5, record: 5, dernierJour: hier } } };
  const s = mettreAJourStreak();
  if (s.compte !== 6) throw new Error('compte=' + s.compte);
  if (s.record !== 6) throw new Error('record pas mis à jour : ' + s.record);
});

essai('un jour sauté remet la série à 1 sans perdre le record', () => {
  const avantHier = gamifJourPrecedent(gamifJourPrecedent(gamifDateDuJour()));
  DB = { gamification: { ...baseGamif(), streak: { compte: 5, record: 10, dernierJour: avantHier } } };
  const s = mettreAJourStreak();
  if (s.compte !== 1) throw new Error('compte=' + s.compte + ' (devrait repartir à 1)');
  if (s.record !== 10) throw new Error('le record ne doit pas être perdu : ' + s.record);
});

// ---------- Boutique ----------

essai('acheterObjet refuse si pas assez de pièces', () => {
  DB = { gamification: { ...baseGamif(), pieces: 10 } };
  const res = acheterObjet('titre-motive'); // prix 20
  if (res.ok || res.motif !== 'pas-assez-de-pieces') throw new Error(JSON.stringify(res));
  if (DB.gamification.pieces !== 10) throw new Error('les pièces ont bougé alors que l\'achat a échoué');
});

essai('acheterObjet réussit, débite les pièces et ajoute à l\'inventaire', () => {
  DB = { gamification: { ...baseGamif(), pieces: 20 } };
  const res = acheterObjet('titre-motive');
  if (!res.ok) throw new Error(JSON.stringify(res));
  if (DB.gamification.pieces !== 0) throw new Error('pièces restantes = ' + DB.gamification.pieces);
  if (!DB.gamification.inventaire.includes('titre-motive')) throw new Error('objet absent de l\'inventaire');
});

essai('acheterObjet refuse un objet déjà possédé', () => {
  DB = { gamification: { ...baseGamif(), pieces: 5000, inventaire: ['titre-motive'] } };
  const res = acheterObjet('titre-motive');
  if (res.ok || res.motif !== 'deja-possede') throw new Error(JSON.stringify(res));
});

essai('acheterObjet refuse si le niveau requis n\'est pas atteint, même avec assez de pièces', () => {
  DB = { gamification: { ...baseGamif(), pieces: 5000, xp: 0 } }; // niveau 1
  const res = acheterObjet('titre-assidu'); // niveauRequis 3
  if (res.ok || res.motif !== 'niveau-insuffisant') throw new Error(JSON.stringify(res));
  if (DB.gamification.pieces !== 5000) throw new Error('les pièces ont bougé alors que l\'achat a échoué');
});

essai('acheterObjet réussit une fois le niveau requis atteint', () => {
  DB = { gamification: { ...baseGamif(), pieces: 5000, xp: xpPourNiveau(3) } }; // pile niveau 3
  const res = acheterObjet('titre-assidu');
  if (!res.ok) throw new Error(JSON.stringify(res));
});

essai('acheterObjet refuse un objet Pro sans compte Pro (même niveau suffisant), l\'autorise avec', () => {
  DB = { gamification: { ...baseGamif(), pieces: 5000, xp: xpPourNiveau(5) } }; // niveau 5, requis pour titre-sensei
  window.accountUser = null;
  const refuse = acheterObjet('titre-sensei');
  if (refuse.ok || refuse.motif !== 'reserve-pro') throw new Error(JSON.stringify(refuse));
  window.accountUser = { isPro: true };
  const accepte = acheterObjet('titre-sensei');
  if (!accepte.ok) throw new Error(JSON.stringify(accepte));
  window.accountUser = null;
});

essai('acheterObjet refuse un identifiant inconnu', () => {
  DB = { gamification: { ...baseGamif(), pieces: 5000 } };
  const res = acheterObjet('objet-qui-n-existe-pas');
  if (res.ok || res.motif !== 'introuvable') throw new Error(JSON.stringify(res));
});

essai('equiperTitre refuse un objet non possédé, accepte un objet possédé, accepte le retrait', () => {
  DB = { gamification: { ...baseGamif(), inventaire: ['titre-motive'] } };
  const refuse = equiperTitre('titre-serieux');
  if (refuse.ok) throw new Error('un titre non possédé a pu être équipé');
  if (DB.gamification.titreActif !== null) throw new Error('titreActif a bougé malgré le refus');
  const accepte = equiperTitre('titre-motive');
  if (!accepte.ok || DB.gamification.titreActif !== 'titre-motive') throw new Error(JSON.stringify(DB.gamification));
  const retrait = equiperTitre(null);
  if (!retrait.ok || DB.gamification.titreActif !== null) throw new Error('le retrait du titre a échoué');
});

// ---------- Rendu (fumée : ne doit pas planter) ----------

essai('renderBoutique ne plante pas et affiche le solde de pièces', () => {
  DB = { gamification: { ...baseGamif(), pieces: 42 } };
  window.accountUser = null;
  renderBoutique();
  const vue = $('#view-boutique');
  if (!vue.innerHTML.includes('42')) throw new Error('le solde de pièces n\'apparaît pas dans le rendu');
});

essai('renderBoutique verrouille par niveau les objets non encore débloqués', () => {
  DB = { gamification: { ...baseGamif(), pieces: 5000, xp: 0 } }; // niveau 1
  window.accountUser = null;
  renderBoutique();
  const vue = $('#view-boutique');
  if (!vue.innerHTML.includes('Niveau 3 requis')) throw new Error('le verrou de niveau n\'apparaît pas dans le rendu');
});

essai('widgetGamification ne plante pas et affiche le niveau', () => {
  DB = { gamification: { ...baseGamif(), xp: 60 } };
  const html = widgetGamification();
  if (!html.includes('Niv. 2')) throw new Error('niveau absent du widget : ' + html);
});
