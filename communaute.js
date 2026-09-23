// ============================================================
// Vue « Page d'accueil » : le premier écran de l'app. Elle montre ce qui a
// bougé depuis la dernière session avant de proposer de réviser.
//
// L'identifiant interne reste « communaute » : le renommer imposerait de
// toucher au routage, aux tests et au service worker pour un gain nul.
//
// Pourquoi les deux existent : la page publique s'adresse à quelqu'un qui
// découvre le site et n'a pas de compte ; cette vue-ci s'adresse à quelqu'un
// qui est déjà dedans et qui veut voir ce qui a bougé depuis sa dernière
// session. Même contenu, deux moments différents.
//
// Ici on utilise les classes de l'app (card, deck-*, maj-*) et non des styles
// écrits à la main : c'est ce qui manquait, et c'est pour ça que l'accueil
// avait l'air d'être à part.
// ============================================================

let commData = null;      // { arrive }
let commErreur = null;
let commEnCours = false;

async function chargerCommunaute() {
  if (!window.sb) { commErreur = "La connexion au serveur n'est pas disponible."; return; }
  commEnCours = true;
  commErreur = null;
  const res = { arrive: [] };
  try {
    // « Derniers avis », « Derniers decks », « Les plus demandés » (widget
    // Classement déplacé sur le tableau de bord) puis « Vidéos partagées »
    // vivaient ici -- retirés le 23/09/2026 à la demande de Paul, pour une
    // page d'accueil plus sobre (voir l'historique git pour l'ancien
    // contenu).
    await sb.from('suggestions').select('titre,statut').in('statut', ['prevu', 'a_letude', 'fait'])
      .order('score', { ascending: false }).limit(3)
      .then(r => { res.arrive = r.data || []; });
    commData = res;
  } catch (err) {
    commData = res;
    commErreur = err && err.message ? err.message : String(err);
  } finally {
    commEnCours = false;
  }
}

function commVide(message) {
  return `<p class="comm-etat-vide">${message}</p>`;
}

function renderCommunaute() {
  const el = $('#view-communaute');
  if (!el) return;

  if (commData === null && !commEnCours) {
    chargerCommunaute().then(() => { if (currentView === 'communaute') renderCommunaute(); });
  }

  if (commData === null) {
    el.innerHTML = `<h2>Page d'accueil</h2><div class="card"><p style="color:var(--muted);">Chargement…</p></div>`;
    return;
  }

  const d = commData;

  const LIB = { prevu: ['Prévu', 'maj-statut--prevu'], a_letude: ["À l'étude", 'maj-statut--etude'], fait: ['Fait', 'maj-statut--fait'] };
  const arrive = d.arrive.length ? d.arrive.map(s => {
    const [lib, cls] = LIB[s.statut] || LIB.a_letude;
    return `<div class="comm-arrive"><span class="maj-statut ${cls}">${lib}</span><span>${escapeHtml(s.titre)}</span></div>`;
  }).join('')
    : commVide("Rien d'annoncé pour le moment.");

  const proverbe = (typeof getProverbOfDay === 'function') ? getProverbOfDay() : null;

  // ------------------------------------------------------------
  // Mise en page (23/09/2026, demande de Paul -- page plus sobre) : plus de
  // grand entete ni de chiffres en avant-page, plus de « Derniers avis »,
  // « Derniers decks », « Les plus demandés » ni « Vidéos partagées ». Le
  // classement (déplacé depuis le tableau de bord -- "le classement
  // devrait etre sur la page d'accueil pas le tableau de bord") occupe la
  // place à côté de « Ce qui arrive ».
  // ------------------------------------------------------------
  el.innerHTML = `
    <h2>Page d'accueil</h2>

    ${commErreur ? `<div class="card"><p>Chargement partiel : ${escapeHtml(commErreur)}</p></div>` : ''}

    ${proverbe ? `
    <div class="card proverb-card kvt-fade">
      <div class="proverb-kanji">${escapeHtml(proverbe.kanji)}</div>
      <div class="proverb-lecture">${escapeHtml(proverbe.lecture)}</div>
      <div class="proverb-sens">${escapeHtml(proverbe.sens)}</div>
    </div>` : ''}

    <div class="accueil-grille kvt-stagger">
      <div class="card kvt-fade">
        <h3 class="deck-section-titre">Classement</h3>
        <div id="accueilClassementWrap"><p style="font-size:13px; color:var(--muted);">Chargement…</p></div>
      </div>
      <div class="card kvt-fade">
        <h3 class="deck-section-titre">Ce qui arrive</h3>
        ${arrive}
      </div>
    </div>`;

  if (typeof chargerClassementAccueil === 'function') chargerClassementAccueil();
}

window.kvtCommunaute = {
  chargerCommunaute, renderCommunaute,
  reinitialiser() { commData = null; commErreur = null; }
};
