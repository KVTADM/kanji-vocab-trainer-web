// Scénarios de gamification.js. Concaténés au harnais avant évaluation.

function baseGamif() {
  return {
    xp: 0, pieces: 0, streak: { compte: 0, record: 0, dernierJour: null }, inventaire: [], titreActif: null,
    collationActive: null, banniereActive: null, boostXpJusqua: null
  };
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

// ---------- Difficulté selon le semestre ----------

essai('multiplicateurDifficulte vaut 1 pour le tout premier semestre du programme', () => {
  if (multiplicateurDifficulte('l0-s1') !== 1) throw new Error('l0-s1 -> ' + multiplicateurDifficulte('l0-s1'));
});

essai('multiplicateurDifficulte augmente avec l\'avancement dans le programme', () => {
  const s1 = multiplicateurDifficulte('s1');   // index 2 -> 1 + 2×0.08
  const s6 = multiplicateurDifficulte('s6');   // index 7 -> 1 + 7×0.08
  const n3 = multiplicateurDifficulte('jlpt-n3'); // index 10 -> 1 + 10×0.08
  if (Math.abs(s1 - 1.16) > 1e-9) throw new Error('s1 -> ' + s1);
  if (Math.abs(s6 - 1.56) > 1e-9) throw new Error('s6 -> ' + s6);
  if (Math.abs(n3 - 1.8) > 1e-9) throw new Error('jlpt-n3 -> ' + n3);
  if (!(s1 < s6 && s6 < n3)) throw new Error('l\'ordre croissant n\'est pas respecté');
});

essai('multiplicateurDifficulte vaut 1 pour un deck créé/importé hors programme officiel', () => {
  if (multiplicateurDifficulte('deck-abc123') !== 1) throw new Error('deck inconnu -> ' + multiplicateurDifficulte('deck-abc123'));
  if (multiplicateurDifficulte(undefined) !== 1) throw new Error('semesterId absent -> ' + multiplicateurDifficulte(undefined));
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

essai('gagnerXp est aussi mis à l\'échelle par la difficulté du semestre', () => {
  DB = { gamification: baseGamif() };
  window.accountUser = null;
  const gain = gagnerXp(10, 's3'); // index 4 -> ×1.32
  if (gain !== 13) throw new Error('gain=' + gain + ' (attendu round(10×1.32)=13)');
  window.accountUser = { isPro: true };
  DB = { gamification: baseGamif() };
  const gainPro = gagnerXp(10, 's3'); // ×1.32 puis ×1.5 (Pro)
  if (gainPro !== 20) throw new Error('gainPro=' + gainPro + ' (attendu round(10×1.32×1.5)=20)');
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

essai('gagnerPieces est aussi mis à l\'échelle par la difficulté du semestre', () => {
  DB = { gamification: baseGamif() };
  window.accountUser = null;
  const gain = gagnerPieces(6, 's6'); // index 7 -> ×1.56
  if (gain !== 3) throw new Error('gain=' + gain + ' (attendu round(2×1.56)=3)');
});

essai('gagnerPieces reste au tarif de base sur un deck créé/importé', () => {
  DB = { gamification: baseGamif() };
  window.accountUser = null;
  const gain = gagnerPieces(6, 'deck-perso-xyz');
  if (gain !== 2) throw new Error('gain=' + gain + ' (un deck hors programme ne doit pas être boosté)');
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

essai('bonusFinSession est aussi mis à l\'échelle par la difficulté du semestre', () => {
  DB = { gamification: baseGamif() };
  window.accountUser = null;
  const gain = bonusFinSession(80, 'jlpt-n4'); // index 9 -> ×1.72
  if (gain !== 26) throw new Error('gain=' + gain + ' (attendu round(15×1.72)=26)');
  DB = { gamification: baseGamif() };
  window.accountUser = { isPro: true };
  const gainPro = bonusFinSession(80, 'jlpt-n3'); // ×1.8 puis ×1.5 (Pro)
  if (gainPro !== 41) throw new Error('gainPro=' + gainPro + ' (attendu round(15×1.8×1.5)=41)');
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

// ---------- v6 (25/08/2026) : boost XP temporaire ----------

essai('assurerGamification initialise tous les nouveaux champs par défaut', () => {
  DB = {};
  const g = assurerGamification();
  if (g.collationActive !== null || g.banniereActive !== null || g.boostXpJusqua !== null) throw new Error(JSON.stringify(g));
});

essai('activerBoostXp active un boost de 20 minutes, et un rachat pendant qu\'il tourne prolonge (n\'empile pas le multiplicateur)', () => {
  DB = { gamification: baseGamif() };
  activerBoostXp();
  const premiere = DB.gamification.boostXpJusqua;
  if (!boostXpActif()) throw new Error('le boost devrait être actif juste après achat');
  activerBoostXp(); // racheté immédiatement, doit prolonger depuis la fin précédente, pas depuis maintenant
  const seconde = DB.gamification.boostXpJusqua;
  const ecart = seconde - premiere;
  if (Math.abs(ecart - GAMIF_BOOST_XP_DUREE_MS) > 50) throw new Error('écart=' + ecart + ' (attendu ~' + GAMIF_BOOST_XP_DUREE_MS + ')');
});

essai('boostXpActif/boostXpRestantMs reflètent l\'absence de boost et un boost expiré', () => {
  DB = { gamification: baseGamif() };
  if (boostXpActif()) throw new Error('aucun boost ne devrait être actif au départ');
  if (boostXpRestantMs() !== 0) throw new Error('temps restant devrait être 0 sans boost');
  DB.gamification.boostXpJusqua = Date.now() - 1000; // expiré il y a 1s
  if (boostXpActif()) throw new Error('un boost expiré ne devrait plus être actif');
  if (boostXpRestantMs() !== 0) throw new Error('temps restant devrait être 0 pour un boost expiré');
});

essai('gagnerXp double le gain pendant un boost actif, sans affecter gagnerPieces ni bonusFinSession', () => {
  DB = { gamification: baseGamif() };
  window.accountUser = null;
  DB.gamification.boostXpJusqua = Date.now() + 60000;
  const gainXp = gagnerXp(10);
  if (gainXp !== 20) throw new Error('gainXp=' + gainXp + ' (attendu 20 avec le boost ×2)');
  const gainPieces = gagnerPieces(6);
  if (gainPieces !== 2) throw new Error('gainPieces=' + gainPieces + ' (le boost XP ne doit pas toucher aux pièces)');
  const gainBonus = bonusFinSession(80);
  if (gainBonus !== 15) throw new Error('gainBonus=' + gainBonus + ' (le boost XP ne doit pas toucher au bonus de session)');
});

essai('acheterObjet sur un boost ne l\'ajoute jamais à l\'inventaire et reste rachetable', () => {
  DB = { gamification: { ...baseGamif(), pieces: 100 } };
  window.accountUser = null;
  const premier = acheterObjet('boost-xp-20');
  if (!premier.ok) throw new Error(JSON.stringify(premier));
  if (DB.gamification.inventaire.includes('boost-xp-20')) throw new Error('un boost ne doit jamais entrer dans l\'inventaire');
  if (DB.gamification.pieces !== 70) throw new Error('pièces restantes=' + DB.gamification.pieces);
  const second = acheterObjet('boost-xp-20'); // rachat immédiat, ne doit pas être bloqué par "déjà possédé"
  if (!second.ok) throw new Error(JSON.stringify(second));
  if (DB.gamification.pieces !== 40) throw new Error('pièces restantes après le 2e achat=' + DB.gamification.pieces);
});

// ---------- v6 : collation pendant les révisions ----------

essai('equiperCollation refuse un objet non possédé, accepte un objet possédé et son retrait', () => {
  DB = { gamification: { ...baseGamif(), inventaire: ['collation-cookie'] } };
  const refuse = equiperCollation('collation-lait');
  if (refuse.ok) throw new Error('une collation non possédée a pu être équipée');
  const accepte = equiperCollation('collation-cookie');
  if (!accepte.ok || DB.gamification.collationActive !== 'collation-cookie') throw new Error(JSON.stringify(DB.gamification));
  const retrait = equiperCollation(null);
  if (!retrait.ok || DB.gamification.collationActive !== null) throw new Error('le retrait de la collation a échoué');
});

essai('collationHtml n\'affiche rien sans collation équipée, affiche son nom sinon', () => {
  DB = { gamification: baseGamif() };
  if (collationHtml() !== '') throw new Error('devrait être vide sans collation équipée');
  DB.gamification.collationActive = 'collation-cookie';
  DB.gamification.inventaire = ['collation-cookie'];
  const html = collationHtml();
  if (!html.includes('Cookie') || !html.includes('🍪')) throw new Error('collation absente du rendu : ' + html);
});

// ---------- v6 : thèmes du site achetables avec des pièces ----------

essai('themeDebloqueParPieces reflète l\'inventaire (achat = débloqué comme si on avait le Pro)', () => {
  DB = { gamification: baseGamif() };
  if (themeDebloqueParPieces('sakura')) throw new Error('sakura ne devrait pas être débloqué sans achat');
  DB.gamification.inventaire = ['theme-sakura'];
  if (!themeDebloqueParPieces('sakura')) throw new Error('sakura devrait être débloqué après achat de theme-sakura');
  if (themeDebloqueParPieces('sumi')) throw new Error('un autre thème ne doit pas être débloqué par erreur');
});

// ---------- v6 : bannières de profil ----------

essai('classeBanniere retourne la bonne classe CSS, et une chaîne vide sans bannière ou pour un id invalide', () => {
  if (classeBanniere(null) !== '') throw new Error('null devrait donner une chaîne vide');
  if (classeBanniere('') !== '') throw new Error('chaîne vide devrait donner une chaîne vide');
  if (classeBanniere('objet-inconnu') !== '') throw new Error('un id inconnu ne doit pas planter, juste rien afficher');
  if (classeBanniere('titre-motive') !== '') throw new Error('un objet qui n\'est pas une bannière ne doit pas produire de classe');
  if (classeBanniere('banniere-or') !== 'profil-banniere--or') throw new Error('classe incorrecte : ' + classeBanniere('banniere-or'));
});

essai('equiperBanniere refuse un objet non possédé', async () => {
  DB = { gamification: { ...baseGamif(), inventaire: [] } };
  window.accountUser = null;
  const res = await equiperBanniere('banniere-or');
  if (res.ok) throw new Error('une bannière non possédée a pu être équipée');
});

essai('equiperBanniere s\'équipe seulement en local sans compte connecté (rien à synchroniser)', async () => {
  DB = { gamification: { ...baseGamif(), inventaire: ['banniere-or'] } };
  window.accountUser = null;
  const res = await equiperBanniere('banniere-or');
  if (!res.ok || DB.gamification.banniereActive !== 'banniere-or') throw new Error(JSON.stringify(res));
});

essai('equiperBanniere synchronise vers Supabase quand un compte est connecté', async () => {
  DB = { gamification: { ...baseGamif(), inventaire: ['banniere-or'] } };
  window.accountUser = { id: 'u1' };
  let recu = null;
  window.kvtProfils = { enregistrerProfil: async (champs) => { recu = champs; return { ok: true }; } };
  const res = await equiperBanniere('banniere-or');
  if (!res.ok) throw new Error(JSON.stringify(res));
  if (!recu || recu.banniere_active !== 'banniere-or') throw new Error('enregistrerProfil n\'a pas reçu le bon champ : ' + JSON.stringify(recu));
  window.accountUser = null;
  window.kvtProfils = { enregistrerProfil: async () => ({ ok: true }) };
});

essai('equiperBanniere annule le changement si la synchronisation Supabase échoue', async () => {
  DB = { gamification: { ...baseGamif(), inventaire: ['banniere-or'], banniereActive: null } };
  window.accountUser = { id: 'u1' };
  window.kvtProfils = { enregistrerProfil: async () => ({ ok: false, erreur: 'réseau' }) };
  const res = await equiperBanniere('banniere-or');
  if (res.ok || res.motif !== 'sync-echouee') throw new Error(JSON.stringify(res));
  if (DB.gamification.banniereActive !== null) throw new Error('banniereActive aurait dû revenir à sa valeur précédente');
  window.accountUser = null;
  window.kvtProfils = { enregistrerProfil: async () => ({ ok: true }) };
});

essai('equiperBanniere accepte le retrait (id=null) sans tenter de synchroniser sans compte', async () => {
  DB = { gamification: { ...baseGamif(), banniereActive: 'banniere-or' } };
  window.accountUser = null;
  const res = await equiperBanniere(null);
  if (!res.ok || DB.gamification.banniereActive !== null) throw new Error(JSON.stringify(res));
});

// ---------- v6 : rendu boutique étendu (fumée) ----------

essai('renderBoutique affiche les nouvelles sections (collations, thèmes, bannières, boosts)', () => {
  DB = { gamification: { ...baseGamif(), pieces: 5000, xp: xpPourNiveau(10) } };
  window.accountUser = null;
  renderBoutique();
  const html = $('#view-boutique').innerHTML;
  ['Pendant les révisions', 'Thèmes du site', 'Bannières de profil', 'Boosts'].forEach(titre => {
    if (!html.includes(titre)) throw new Error('section absente du rendu : ' + titre);
  });
});

essai('renderBoutique affiche "Débloqué" pour un thème déjà acheté au lieu d\'un bouton d\'achat', () => {
  DB = { gamification: { ...baseGamif(), pieces: 5000, xp: xpPourNiveau(10), inventaire: ['theme-sakura'] } };
  window.accountUser = null;
  renderBoutique();
  const html = $('#view-boutique').innerHTML;
  if (!html.includes('Débloqué')) throw new Error('le badge "Débloqué" n\'apparaît pas pour un thème déjà acheté');
});
