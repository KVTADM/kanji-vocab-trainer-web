// Scénarios de maj.js.

const S = (o) => Object.assign({
  id: 'x', auteur_id: 'autre', pseudo: 'Hana', type: 'idee', titre: 'Une idée',
  texte: '', statut: 'ouverte', reponse: '', score: 0, created_at: '2026-08-01T00:00:00Z'
}, o);

const LOT = [
  S({ id: 'a', titre: 'Peu soutenue', score: 1, created_at: '2026-08-03T00:00:00Z' }),
  S({ id: 'b', titre: 'Très soutenue', score: 12, created_at: '2026-08-01T00:00:00Z' }),
  S({ id: 'c', titre: 'Déjà prévue', score: 5, statut: 'prevu' }),
  S({ id: 'd', titre: 'Déjà faite', score: 3, statut: 'fait' }),
  S({ id: 'e', titre: 'Écartée mais populaire', score: 99, statut: 'ecarte' }),
  S({ id: 'f', titre: "Un défaut d'affichage", type: 'probleme', statut: 'a_letude', score: 2 })
];

essai('le tri par soutiens met la plus demandée en tête', () => {
  majListe = LOT; majFiltre = 'tout'; majTri = 'soutiens';
  const ordre = majVisibles().map(s => s.id).join(',');
  if (ordre.startsWith('e')) throw new Error('une proposition écartée passe en tête');
  if (ordre.split(',')[0] !== 'b') throw new Error('ordre = ' + ordre);
});

essai('ce qui est écarté descend toujours en bas', () => {
  majTri = 'soutiens';
  const ordre = majVisibles().map(s => s.id);
  if (ordre[ordre.length - 1] !== 'e') throw new Error('ordre = ' + ordre.join(','));
});

essai('le filtre « Proposé » regroupe ouvert et à l\'étude', () => {
  majFiltre = 'ouverte';
  const ids = majVisibles().map(s => s.id).sort().join(',');
  if (ids !== 'a,b,f') throw new Error('ids = ' + ids);
  majFiltre = 'tout';
});

essai('les compteurs ne comptent pas deux fois la même chose', () => {
  const c = compteurs();
  if (c.tout !== 6) throw new Error('tout = ' + c.tout);
  if (c.ouverte !== 3) throw new Error('ouverte = ' + c.ouverte);
  if (c.prevu !== 1 || c.fait !== 1) throw new Error('prevu/fait = ' + c.prevu + '/' + c.fait);
});

essai('un utilisateur ordinaire ne voit pas les outils de modération', () => {
  window.accountUser = { id: 'moi', pseudo: 'Polus', isAdmin: false };
  majListe = LOT; majFiltre = 'tout';
  renderMaj();
  const html = trouve('#view-maj').innerHTML;
  if (html.includes('data-statut=')) throw new Error('le menu de statut est visible');
  if (html.includes('data-repondre-maj=')) throw new Error('le bouton Répondre est visible');
});

essai('la modération voit ses outils', () => {
  window.accountUser = { id: 'moi', pseudo: 'Polus', isAdmin: true };
  renderMaj();
  const html = trouve('#view-maj').innerHTML;
  if (!html.includes('data-statut="a"')) throw new Error('menu de statut absent');
  if (!html.includes('data-repondre-maj="a"')) throw new Error('bouton Répondre absent');
});

essai('on ne peut supprimer que ses propres propositions', () => {
  window.accountUser = { id: 'moi', pseudo: 'Polus', isAdmin: false };
  majListe = [S({ id: 'mienne', auteur_id: 'moi' }), S({ id: 'autre', auteur_id: 'quelquun' })];
  renderMaj();
  const html = trouve('#view-maj').innerHTML;
  if (!html.includes('data-supprimer-maj="mienne"')) throw new Error('bouton absent sur la mienne');
  if (html.includes('data-supprimer-maj="autre"')) throw new Error('bouton présent sur celle d\'un autre');
});

essai('une réponse de KVT est affichée quand elle existe', () => {
  majListe = [S({ id: 'r', reponse: 'Prévu après la rentrée.' })];
  renderMaj();
  const html = trouve('#view-maj').innerHTML;
  if (!html.includes('Réponse de KVT')) throw new Error('la marque manque');
  if (!html.includes('Prévu après la rentrée.')) throw new Error('le texte manque');
});

essai('une liste vide invite à écrire', () => {
  majListe = []; majFiltre = 'tout'; majEnCours = false;
  renderMaj();
  if (!trouve('#view-maj').innerHTML.includes("Personne n'a encore rien proposé")) throw new Error('invitation absente');
});

essai('un filtre sans résultat ne dit pas la même chose qu\'une liste vide', () => {
  majListe = [S({ id: 'z', statut: 'fait' })];
  majFiltre = 'prevu';
  renderMaj();
  const html = trouve('#view-maj').innerHTML;
  if (!html.includes('Rien dans cette catégorie')) throw new Error('message de filtre vide absent');
  majFiltre = 'tout';
});

essai('sans compte, on ne propose pas mais on lit', () => {
  window.accountUser = null;
  majListe = LOT;
  renderMaj();
  const html = trouve('#view-maj').innerHTML;
  if (!html.includes('Connecte-toi pour proposer')) throw new Error('invitation à se connecter absente');
  if (!html.includes('Très soutenue')) throw new Error('les propositions ne sont pas lisibles');
});

essai('un titre trop court est refusé avant l\'envoi', () => {
  window.accountUser = { id: 'moi', pseudo: 'Polus', isAdmin: false };
  majForm = { type: 'idee', titre: 'abc', texte: '', envoi: false, erreur: null };
  majFormOuvert = true;
  envoyerSuggestion();
  if (!majForm.erreur || !majForm.erreur.includes('une phrase')) throw new Error('erreur = ' + majForm.erreur);
});
