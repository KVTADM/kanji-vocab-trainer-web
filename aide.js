// aide.js — Boîte à problèmes (28/09/2026, demande de Paul) : formulaire in-app
// pour signaler un bug, proposer une solution, ou juste demander de l'aide.
// Sans rapport avec /signaler (page statique, uniquement pour signaler un
// contenu de deck partagé qui pose problème). Ici, tout part dans la table
// Supabase `retours_utilisateurs`, visible par Paul dans Admin, et
// interrogeable directement (par lui ou par Claude) sans intermédiaire.

let mesRetours = [];

const RETOUR_STATUT_LABELS = {
  ouvert: 'Envoyé',
  en_cours: 'En cours de traitement',
  resolu: 'Résolu',
  ferme: 'Fermé'
};

function libelleStatutRetour(statut) {
  return RETOUR_STATUT_LABELS[statut] || statut;
}

// Validation pure (testable sans DOM ni Supabase). Mêmes bornes que la
// contrainte SQL de la table -- gardées ici pour donner un message clair
// avant l'aller-retour réseau, pas pour dupliquer la vraie protection (la
// contrainte en base reste la référence en cas de désaccord).
function validerRetour(champs) {
  const erreurs = {};
  const titre = (champs && champs.titre || '').trim();
  const description = (champs && champs.description || '').trim();
  const solutionProposee = (champs && champs.solutionProposee || '').trim();
  if (titre.length < 3) erreurs.titre = 'Le titre doit faire au moins 3 caractères.';
  else if (titre.length > 140) erreurs.titre = 'Le titre est trop long (140 caractères maximum).';
  if (!description) erreurs.description = 'Explique un peu ce qui se passe.';
  else if (description.length > 4000) erreurs.description = 'Description trop longue (4000 caractères maximum).';
  if (solutionProposee.length > 2000) erreurs.solutionProposee = 'Solution proposée trop longue (2000 caractères maximum).';
  return { ok: Object.keys(erreurs).length === 0, erreurs };
}

async function chargerMesRetours() {
  if (!window.sb || !window.accountUser) { mesRetours = []; return; }
  const { data, error } = await window.sb
    .from('retours_utilisateurs')
    .select('id, titre, description, solution_proposee, besoin_aide, statut, reponse, created_at')
    .eq('user_id', window.accountUser.id)
    .order('created_at', { ascending: false });
  if (error) { mesRetours = []; return; }
  mesRetours = data || [];
}

async function envoyerRetour(champs) {
  const { ok, erreurs } = validerRetour(champs);
  if (!ok) return { ok: false, erreurs };
  const { error } = await window.sb.from('retours_utilisateurs').insert({
    user_id: window.accountUser.id,
    pseudo: window.accountUser.pseudo || null,
    titre: champs.titre.trim(),
    description: champs.description.trim(),
    solution_proposee: champs.solutionProposee && champs.solutionProposee.trim() ? champs.solutionProposee.trim() : null,
    besoin_aide: !!champs.besoinAide
  });
  if (error) return { ok: false, erreurs: { general: "Envoi impossible pour l'instant, réessaie dans un instant." } };
  return { ok: true, erreurs: {} };
}

function renderAide() {
  const el = $('#view-aide');
  if (!el) return;
  if (!window.accountUser) {
    el.innerHTML = `<div class="card"><h2>Aide &amp; problèmes</h2><p style="color:var(--muted);">Connecte-toi pour envoyer un message.</p></div>`;
    return;
  }
  el.innerHTML = `
    <div class="card">
      <h2>Aide &amp; problèmes</h2>
      <p style="color:var(--muted);">Un bug, une idée de solution, ou juste besoin d'aide : ce message arrive directement à Paul (et peut être relu et analysé avec l'aide de Claude). Pas besoin de long discours, une description claire suffit.</p>
    </div>
    <div class="card">
      <h3>Envoyer un message</h3>
      <div class="retour-form">
        <label>Titre<input type="text" id="retourTitre" maxlength="140" placeholder="Ex. Le minuteur du jeu de la bombe ne s'arrête pas"></label>
        <label>Explique ce qui se passe<textarea id="retourDescription" rows="4" maxlength="4000" placeholder="Ce que tu as fait, ce qui s'est passé, ce que tu attendais à la place…"></textarea></label>
        <label>Une solution en tête ? (optionnel)<textarea id="retourSolution" rows="2" maxlength="2000" placeholder="Si tu as une idée de correction ou d'amélioration"></textarea></label>
        <label class="retour-form__case"><input type="checkbox" id="retourBesoinAide"> Je souhaite une réponse</label>
        <div id="retourErreur" style="color:var(--pink); font-size:12.5px;"></div>
        <button class="primary" id="btnEnvoyerRetour">Envoyer</button>
      </div>
    </div>
    <div class="card">
      <h3>Mes messages</h3>
      <div id="mesRetoursZone"><p style="color:var(--muted);">Chargement…</p></div>
    </div>`;

  $('#btnEnvoyerRetour').onclick = async () => {
    const bouton = $('#btnEnvoyerRetour');
    const zoneErreur = $('#retourErreur');
    zoneErreur.textContent = '';
    const champs = {
      titre: $('#retourTitre').value,
      description: $('#retourDescription').value,
      solutionProposee: $('#retourSolution').value,
      besoinAide: $('#retourBesoinAide').checked
    };
    bouton.disabled = true;
    const resultat = await envoyerRetour(champs);
    bouton.disabled = false;
    if (!resultat.ok) {
      zoneErreur.textContent = Object.values(resultat.erreurs)[0] || 'Formulaire incomplet.';
      return;
    }
    $('#retourTitre').value = '';
    $('#retourDescription').value = '';
    $('#retourSolution').value = '';
    $('#retourBesoinAide').checked = false;
    showToast('Message envoyé, merci !');
    await chargerMesRetours();
    afficherMesRetours();
  };

  chargerMesRetours().then(afficherMesRetours);
}

function afficherMesRetours() {
  const zone = $('#mesRetoursZone');
  if (!zone) return; // la vue a changé entre-temps
  if (!mesRetours.length) {
    zone.innerHTML = `<p style="color:var(--muted);">Aucun message envoyé pour l'instant.</p>`;
    return;
  }
  zone.innerHTML = mesRetours.map(r => `
    <div class="retour-item">
      <div class="retour-item__tete">
        <strong>${escapeHtml(r.titre)}</strong>
        <span class="retour-statut retour-statut--${escapeHtml(r.statut)}">${escapeHtml(libelleStatutRetour(r.statut))}</span>
      </div>
      <p style="color:var(--muted); font-size:13px; margin:4px 0;">${escapeHtml(r.description)}</p>
      ${r.reponse ? `<div class="retour-reponse"><strong>Réponse :</strong> ${escapeHtml(r.reponse)}</div>` : ''}
    </div>`).join('');
}
