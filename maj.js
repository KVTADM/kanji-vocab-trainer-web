// ============================================================
// Widget "Nouveautés" du tableau de bord : les dernières entrées "faites"
// de la table `suggestions`, en aperçu.
//
// Jusqu'au 23/09/2026, ce fichier portait aussi la page "Mises à jour" en
// entier (proposer une idée/un défaut, soutenir, filtrer, modérer) — une
// page à part, accessible depuis le menu "Plus". Retirée à la demande de
// Paul ("on peut supprimer la page mise a jour") : seul ce widget d'aperçu
// survit, il ne dépend d'aucune des fonctions retirées. Voir l'historique
// git pour l'ancienne page complète si besoin de la restaurer.
//
// La carte "Ce qui arrive" de la page d'accueil (communaute.js) lit elle
// aussi directement la table `suggestions`, indépendamment de ce fichier —
// elle n'a jamais dépendu de la page retirée et n'est donc pas concernée.
// ============================================================

let accueilNouveautesListe = null;
let accueilNouveautesErreur = null;

async function chargerNouveautesAccueil() {
  const wrap = $('#accueilNouveautesWrap');
  if (!wrap) return; // widget pas dans la page (vue déjà changée)

  if (accueilNouveautesListe) { renderNouveautesAccueilWidget(); return; }
  try {
    if (!window.sb) throw new Error('Connexion indisponible');
    const { data, error } = await window.sb
      .from('suggestions')
      .select('id, titre, created_at')
      .eq('statut', 'fait')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    accueilNouveautesListe = data || [];
    accueilNouveautesErreur = null;
  } catch (err) {
    accueilNouveautesListe = [];
    accueilNouveautesErreur = err && err.message ? err.message : String(err);
  }
  renderNouveautesAccueilWidget();
}

function renderNouveautesAccueilWidget() {
  const wrap = $('#accueilNouveautesWrap');
  if (!wrap) return;

  if (accueilNouveautesErreur) {
    wrap.innerHTML = `<p style="font-size:13px; color:var(--pink);">Nouveautés indisponibles pour l'instant.</p>`;
    return;
  }
  if (!accueilNouveautesListe) {
    wrap.innerHTML = `<p style="font-size:13px; color:var(--muted);">Chargement…</p>`;
    return;
  }
  if (!accueilNouveautesListe.length) {
    wrap.innerHTML = `<p style="font-size:13px; color:var(--muted);">Rien de nouveau pour l'instant.</p>`;
    return;
  }

  wrap.innerHTML = `
    <ul class="accueil-nouveautes-liste">
      ${accueilNouveautesListe.map((s) => `
        <li>
          <span class="accueil-nouveautes-titre">${escapeHtml(s.titre)}</span>
          <span class="accueil-nouveautes-date">${new Date(s.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
        </li>`).join('')}
    </ul>`;
}
