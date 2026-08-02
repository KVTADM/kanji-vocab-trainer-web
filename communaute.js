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

let commData = null;      // { avis, decks, arrive, demandes, videos }
let commErreur = null;
let commEnCours = false;

async function chargerCommunaute() {
  if (!window.sb) { commErreur = "La connexion au serveur n'est pas disponible."; return; }
  commEnCours = true;
  commErreur = null;
  const res = { avis: [], decks: [], arrive: [], demandes: [], videos: [] };
  try {
    // Cinq requêtes indépendantes : si l'une échoue, les autres s'affichent
    // quand même. Une section vide vaut mieux qu'une page blanche.
    const requetes = [
      sb.from('deck_notes').select('note,avis,pseudo,user_id,updated_at,decks(titre,slug)')
        .neq('avis', '').order('updated_at', { ascending: false }).limit(3)
        .then(r => { res.avis = r.data || []; }),
      sb.from('decks').select('id,titre,slug,pseudo,auteur_id,officiel,semester_id,nb_kanji,note_moyenne,nb_notes')
        .eq('visible', true).order('created_at', { ascending: false }).limit(4)
        .then(r => { res.decks = r.data || []; }),
      sb.from('suggestions').select('titre,statut').in('statut', ['prevu', 'a_letude', 'fait'])
        .order('score', { ascending: false }).limit(3)
        .then(r => { res.arrive = r.data || []; }),
      sb.from('suggestions').select('id,titre,score').eq('statut', 'ouverte')
        .order('score', { ascending: false }).limit(3)
        .then(r => { res.demandes = r.data || []; }),
      sb.from('videos').select('youtube_id,titre,pseudo,score').eq('statut', 'publiee')
        .order('score', { ascending: false }).limit(3)
        .then(r => { res.videos = r.data || []; })
    ];
    await Promise.allSettled(requetes);
    commData = res;

    if (window.kvtProfils) {
      const ids = res.avis.map(a => a.user_id).concat(res.decks.filter(d => d.auteur_id).map(d => d.auteur_id));
      await window.kvtProfils.chargerProfils(ids);
    }
  } catch (err) {
    commData = res;
    commErreur = err && err.message ? err.message : String(err);
  } finally {
    commEnCours = false;
  }
}

function commVide(message) {
  return `<p class="comm-vide">${message}</p>`;
}

function commEtoiles(n) {
  const pleines = Math.round(Number(n) || 0);
  return `<span class="deck-etoiles">${[1, 2, 3, 4, 5]
    .map(i => `<span class="deck-etoile ${i <= pleines ? 'est-pleine' : ''}">★</span>`).join('')}</span>`;
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

  const avis = d.avis.length ? d.avis.map(a => `
    <div class="comm-avis">
      <div class="comm-avis-tete">
        ${window.kvtProfils ? window.kvtProfils.avatarHtml(a.user_id, a.pseudo, 28) : ''}
        <span class="comm-pseudo">${escapeHtml(a.pseudo)}</span>
        ${commEtoiles(a.note)}
      </div>
      <p class="comm-avis-texte">« ${escapeHtml(a.avis)} »</p>
      <div class="comm-source">sur ${a.decks ? escapeHtml(a.decks.titre) : 'un deck'}</div>
    </div>`).join('')
    : commVide("Personne n'a encore écrit d'avis. Le premier deck que tu noteras apparaîtra ici.");

  const decks = d.decks.length ? d.decks.map(x => `
    <button class="comm-ligne" data-comm-deck="${x.id}">
      <span class="comm-ligne-corps">
        <span class="comm-ligne-titre">${escapeHtml(x.titre)}</span>
        <span class="comm-ligne-detail">${x.nb_kanji} kanji · ${x.officiel ? 'officiel' : 'par ' + escapeHtml(x.pseudo)}</span>
      </span>
      <span class="comm-ligne-valeur">
        ${x.nb_notes
          ? `<strong>${Number(x.note_moyenne).toFixed(1)}</strong><span>${x.nb_notes} avis</span>`
          : `<span>pas encore noté</span>`}
      </span>
    </button>`).join('')
    : commVide("Aucun deck partagé pour l'instant.");

  const LIB = { prevu: ['Prévu', 'maj-statut--prevu'], a_letude: ["À l'étude", 'maj-statut--etude'], fait: ['Fait', 'maj-statut--fait'] };
  const arrive = d.arrive.length ? d.arrive.map(s => {
    const [lib, cls] = LIB[s.statut] || LIB.a_letude;
    return `<div class="comm-arrive"><span class="maj-statut ${cls}">${lib}</span><span>${escapeHtml(s.titre)}</span></div>`;
  }).join('')
    : commVide("Rien d'annoncé pour le moment.");

  const demandes = d.demandes.length ? d.demandes.map(s => `
    <div class="comm-demande">
      <span class="comm-soutiens"><span>▲</span><strong>${s.score}</strong></span>
      <span>${escapeHtml(s.titre)}</span>
    </div>`).join('')
    : commVide("Aucune demande en attente. Si quelque chose te manque, dis-le dans « Mises à jour ».");

  // Vignette YouTube seule, sans lecteur : aucun cookie tiers tant qu'on n'a
  // pas cliqué.
  const videos = d.videos.length ? `<div class="comm-videos">${d.videos.map(v => `
    <a class="comm-video" href="https://www.youtube.com/watch?v=${escapeHtml(v.youtube_id)}" target="_blank" rel="noopener">
      <img src="https://i.ytimg.com/vi/${escapeHtml(v.youtube_id)}/mqdefault.jpg" alt="" loading="lazy" />
      <span class="comm-video-titre">${escapeHtml(v.titre)}</span>
      <span class="comm-source">partagé par ${escapeHtml(v.pseudo)} · ▲ ${v.score}</span>
    </a>`).join('')}</div>`
    : commVide("Aucune vidéo partagée pour l'instant.");

  el.innerHTML = `
    <div class="decks-head">
      <div>
        <h2>Page d'accueil</h2>
        <p class="decks-sous-titre">Ce qui a bougé depuis ta dernière session : les avis, les decks, ce qui arrive.</p>
      </div>
    </div>

    ${commErreur ? `<div class="card"><p>Chargement partiel : ${escapeHtml(commErreur)}</p></div>` : ''}

    <div class="comm-grille">
      <div class="card">
        <h3 class="deck-section-titre">Derniers avis</h3>
        ${avis}
      </div>
      <div class="card">
        <h3 class="deck-section-titre">Derniers decks</h3>
        ${decks}
      </div>
      <div class="card">
        <h3 class="deck-section-titre">Ce qui arrive</h3>
        ${arrive}
      </div>
      <div class="card">
        <h3 class="deck-section-titre">Les plus demandés</h3>
        ${demandes}
      </div>
    </div>

    <div class="card">
      <h3 class="deck-section-titre">Vidéos partagées</h3>
      ${videos}
    </div>`;

  $$('[data-comm-deck]', el).forEach(b => {
    b.onclick = () => { if (typeof ouvrirDeck === 'function') ouvrirDeck(b.dataset.commDeck); };
  });
}

window.kvtCommunaute = {
  chargerCommunaute, renderCommunaute,
  reinitialiser() { commData = null; commErreur = null; }
};
