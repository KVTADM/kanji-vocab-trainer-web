// Scénarios de amis.js, évalués dans la même portée que la source.

// « moi » est ordonné après 'ami1' et avant 'zzz' : la contrainte a < b de la
// base impose cet ordre, et le classement doit s'y retrouver quel que soit le
// côté où je me trouve.
const LIGNES = [
  { a: 'ami1', b: 'moi', demandeur: 'ami1', etat: 'acceptee', created_at: '2026-08-01T00:00:00Z' },
  { a: 'moi', b: 'zzz', demandeur: 'moi', etat: 'acceptee', created_at: '2026-08-02T00:00:00Z' },
  { a: 'dem1', b: 'moi', demandeur: 'dem1', etat: 'en_attente', created_at: '2026-08-03T00:00:00Z' },
  { a: 'moi', b: 'sortant', demandeur: 'moi', etat: 'en_attente', created_at: '2026-08-04T00:00:00Z' }
];

essai("« l'autre » est trouvé des deux côtés de la paire", () => {
  amitiesCache = LIGNES;
  if (autreQueMoi(LIGNES[0]) !== 'ami1') throw new Error('côté a raté');
  if (autreQueMoi(LIGNES[1]) !== 'zzz') throw new Error('côté b raté');
});

essai('les trois piles ne se mélangent pas', () => {
  const { amis, recues, envoyees } = classerAmities();
  if (amis.length !== 2) throw new Error('amis = ' + amis.length);
  if (recues.length !== 1 || autreQueMoi(recues[0]) !== 'dem1') throw new Error('demandes reçues incorrectes');
  if (envoyees.length !== 1 || autreQueMoi(envoyees[0]) !== 'sortant') throw new Error('demandes envoyées incorrectes');
});

essai('une demande que j\'ai envoyée n\'apparaît pas comme reçue', () => {
  const { recues } = classerAmities();
  if (recues.some(l => l.demandeur === 'moi')) throw new Error('ma propre demande attend une réponse de ma part');
});

essai('la clé d\'une ligne permet de la retrouver', () => {
  const l = ligneDepuisCle('dem1|moi');
  if (!l || l.demandeur !== 'dem1') throw new Error('ligne introuvable');
  if (ligneDepuisCle('inexistant|paire')) throw new Error('une clé inconnue devrait ne rien renvoyer');
});

essai('la carte affiche les trois sections et les bons boutons', () => {
  const html = htmlBlocAmis();
  if (!html.includes('Demandes reçues · 1')) throw new Error('section des demandes reçues absente');
  if (!html.includes('Demandes envoyées · 1')) throw new Error('section des demandes envoyées absente');
  if (!html.includes('data-accepter="dem1|moi"')) throw new Error('bouton Accepter absent');
  if (!html.includes('data-refuser="dem1|moi"')) throw new Error('bouton Refuser absent');
  if (html.includes('data-accepter="moi|sortant"')) throw new Error('on peut accepter sa propre demande');
  if (!html.includes('data-retirer-ami="ami1|moi"')) throw new Error('bouton Retirer absent');
});

essai('sans aucun ami, la carte invite au lieu de rester vide', () => {
  amitiesCache = [];
  const html = htmlBlocAmis();
  if (!html.includes("Personne pour l'instant")) throw new Error('message d\'accueil absent');
  if (html.includes('Demandes reçues')) throw new Error('une section vide est affichée');
});

essai('avant chargement, la carte annonce le chargement', () => {
  amitiesCache = null;
  if (!htmlBlocAmis().includes('Chargement')) throw new Error('état de chargement absent');
});

essai('une erreur de chargement est montrée, pas avalée', () => {
  amitiesCache = [];
  amisErreur = 'réseau coupé';
  if (!htmlBlocAmis().includes('réseau coupé')) throw new Error("l'erreur est masquée");
  amisErreur = null;
});

essai('sans compte, aucune carte', () => {
  const sauvegarde = window.accountUser;
  window.accountUser = null;
  if (htmlBlocAmis() !== '') throw new Error('la carte apparaît sans compte');
  window.accountUser = sauvegarde;
});

essai('réinitialiser vide bien le cache', () => {
  amitiesCache = LIGNES;
  amiRecherche = 'quelquun';
  window.kvtAmis.reinitialiser();
  if (amitiesCache !== null) throw new Error('cache conservé');
  if (amiRecherche !== '') throw new Error('recherche conservée');
});
