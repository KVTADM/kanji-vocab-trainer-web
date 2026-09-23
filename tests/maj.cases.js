// Scénarios de maj.js -- widget "Nouveautés" du tableau de bord uniquement
// depuis le 23/09/2026 (la page "Mises à jour" en entier a été retirée, voir
// l'en-tête de maj.js).

essai('le widget accueil affiche les suggestions passées "fait"', () => {
  accueilNouveautesListe = [
    { id: 1, titre: 'Mode Double réponse', created_at: '2026-09-20T10:00:00Z' },
    { id: 2, titre: 'Chrono par quiz', created_at: '2026-08-15T10:00:00Z' }
  ];
  accueilNouveautesErreur = null;
  renderNouveautesAccueilWidget();
  const html = trouve('#accueilNouveautesWrap').innerHTML;
  if (!html.includes('Mode Double réponse')) throw new Error('la nouveauté la plus récente manque');
  if (!html.includes('Chrono par quiz')) throw new Error('la deuxième nouveauté manque');
});

essai('sans nouveauté, le widget accueil le dit sans rester vide', () => {
  accueilNouveautesListe = []; accueilNouveautesErreur = null;
  renderNouveautesAccueilWidget();
  if (!trouve('#accueilNouveautesWrap').innerHTML.includes('Rien de nouveau')) throw new Error('message vide absent');
});

essai('une erreur de chargement est montrée dans le widget nouveautés', () => {
  accueilNouveautesErreur = 'réseau coupé';
  renderNouveautesAccueilWidget();
  if (!trouve('#accueilNouveautesWrap').innerHTML.includes('indisponibles')) throw new Error('erreur avalée');
  accueilNouveautesErreur = null;
});
