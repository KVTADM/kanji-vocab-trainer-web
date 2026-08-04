// ============================================================
// Page publique d'une personne : ce qu'elle a publié, ce qu'elle a écrit.
//
// On y arrive en cliquant un auteur, à côté d'un deck ou d'un avis. Jusqu'ici
// un pseudo n'était qu'un texte : on voyait passer un deck sans pouvoir
// savoir ce que son auteur avait fait d'autre.
//
// Trois onglets, et le troisième n'est pas ce que la feuille de route
// prévoyait. La liste d'amis de quelqu'un d'autre n'est pas lisible : la
// politique RLS de `amities` ne laisse voir que les liens dont on fait
// partie. La rendre publique exposerait le graphe social de tout le monde à
// n'importe qui, ce qui n'est pas une décision de mise en page. L'onglet
// n'apparaît donc que sur son propre profil, et la page le dit.
//
// Tout ce qui est affiché vient de tables publiquement lisibles :
// `profiles`, `decks` visibles, `deck_notes`. Rien n'est recopié depuis le
// client — le pseudo montré est celui de la base, pas celui qu'on nous
// donne.
// ============================================================

let profilVu = null;        // user_id affiché, ou null
let profilData = null;      // { profil, decks, avis, amities }
let profilErreur = null;
let profilOnglet = 'decks'; // 'decks' | 'avis' | 'amis'
let profilEnCours = false;

async function chargerProfilPublic(userId) {
  profilEnCours = true;
  profilErreur = null;
  const res = { profil: null, decks: [], avis: [], amis: null };
  try {
    const requetes = [
      window.sb.from('profiles').select('id,pseudo,avatar_url,niveau,bio,created_at')
        .eq('id', userId).maybeSingle()
        .then(r => { res.profil = r.data || null; }),

      // Uniquement les decks visibles : un deck retiré par son auteur ne
      // doit pas réapparaître sur sa page publique.
      window.sb.from('decks')
        .select('id,slug,titre,description,officiel,type,niveau,nb_kanji,nb_mots,nb_semaines,note_moyenne,nb_notes,created_at')
        .eq('auteur_id', userId).eq('visible', true)
        .order('created_at', { ascending: false })
        .then(r => { res.decks = r.data || []; }),

      window.sb.from('deck_notes').select('note,avis,updated_at,deck_id,decks(titre,slug,officiel)')
        .eq('user_id', userId).neq('avis', '')
        .order('updated_at', { ascending: false }).limit(50)
        .then(r => { res.avis = r.data || []; })
    ];

    // Ses amis ne sont lisibles que si c'est soi : la politique de la base
    // le refuse autrement. On ne tente donc la requête que dans ce cas —
    // l'envoyer quand même renverrait une liste vide, qu'on afficherait
    // comme « aucun ami », ce qui serait faux.
    const cestMoi = window.accountUser && window.accountUser.id === userId;
    if (cestMoi) {
      requetes.push(
        window.sb.from('amities').select('a,b,etat')
          .eq('etat', 'acceptee')
          .then(r => { res.amis = r.data || []; })
      );
    }

    await Promise.allSettled(requetes);
    profilData = res;

    if (!res.profil) profilErreur = "Ce profil n'existe pas ou n'est plus accessible.";

    if (window.kvtProfils && res.amis) {
      const autres = res.amis.map(l => (l.a === userId ? l.b : l.a));
      await window.kvtProfils.chargerProfils(autres);
    }
  } catch (err) {
    profilData = res;
    profilErreur = (err && err.message) ? err.message : String(err);
  } finally {
    profilEnCours = false;
  }
}

async function ouvrirProfilPublic(userId) {
  if (!userId) return;
  profilVu = userId;
  profilData = null;
  profilErreur = null;
  profilOnglet = 'decks';
  switchView('profil');
  await chargerProfilPublic(userId);
  if (currentView === 'profil') renderProfilPublic();
}

// ------------------------------------------------------------
// Badges. Ils décrivent des faits vérifiables, jamais un jugement : « a
// publié un deck », « a écrit des avis », « déclare tel niveau ». Un badge
// qu'on ne peut pas expliquer en une phrase ne sert qu'à décorer.
// ------------------------------------------------------------
function badgesDe(profil, decks, avis) {
  const liste = [];
  if (decks.length) liste.push(['Créateur', decks.length + ' deck' + (decks.length > 1 ? 's' : '') + ' publié' + (decks.length > 1 ? 's' : '')]);
  if (avis.length >= 3) liste.push(['Critique', avis.length + ' avis écrits']);
  if (profil && profil.niveau && window.kvtProfils) {
    const lib = window.kvtProfils.libelleNiveau(profil.niveau);
    if (lib && lib !== 'Non précisé') liste.push([lib, 'niveau déclaré']);
  }
  return liste;
}

function profilVide(message) {
  return `<p class="comm-etat-vide">${message}</p>`;
}

function renderProfilPublic() {
  const el = $('#view-profil');
  if (!el) return;

  const retour = `<div class="pub-fil"><button class="lien-retour" id="btnProfilRetour">← Retour</button></div>`;

  if (profilEnCours && !profilData) {
    el.innerHTML = retour + `<div class="card"><p style="color:var(--muted);">Chargement…</p></div>`;
    brancherRetour();
    return;
  }
  if (profilErreur || !profilData || !profilData.profil) {
    el.innerHTML = retour + `<div class="card"><p>${escapeHtml(profilErreur || 'Profil introuvable.')}</p></div>`;
    brancherRetour();
    return;
  }

  const { profil, decks, avis, amis } = profilData;
  const cestMoi = window.accountUser && window.accountUser.id === profil.id;
  const badges = badgesDe(profil, decks, avis);

  // Les avis reçus, tous decks confondus : c'est la mesure de ce que son
  // travail a provoqué, et non de son activité à lui.
  const avisRecus = decks.reduce((s, d) => s + (d.nb_notes || 0), 0);

  const onglets = [['decks', 'Decks publiés', decks.length], ['avis', 'Avis écrits', avis.length]];
  if (cestMoi) onglets.push(['amis', 'Amis', amis ? amis.length : 0]);
  if (!onglets.some(o => o[0] === profilOnglet)) profilOnglet = 'decks';

  const contenuDecks = decks.length ? `
    <div class="profil-grille">
      ${decks.map(d => `
        <article class="card profil-deck">
          <h4 class="profil-deck__titre">${escapeHtml(d.titre)}</h4>
          <p class="profil-deck__detail">${d.nb_kanji} kanji · ${d.nb_mots} mots${d.officiel ? ' · officiel' : ''}</p>
          <p class="profil-deck__note">${d.nb_notes
            ? `${Number(d.note_moyenne).toFixed(1)} / 5 · ${d.nb_notes} avis`
            : 'Pas encore noté'}</p>
          <div class="profil-deck__actions">
            <button class="small" data-profil-deck="${escapeHtml(d.id)}">${d.officiel ? 'Réviser' : 'Voir le deck'}</button>
            <a class="profil-deck__lien" href="/deck/${escapeHtml(d.slug)}">Page publique</a>
          </div>
        </article>`).join('')}
    </div>`
    : profilVide(cestMoi
        ? "Tu n'as encore rien publié. Un deck partagé, c'est du travail qui sert à quelqu'un d'autre."
        : "Cette personne n'a pas encore publié de deck.");

  const contenuAvis = avis.length ? `
    <div class="profil-avis-liste">
      ${avis.map(a => `
        <blockquote class="profil-avis">
          <div class="profil-avis__tete">
            ${[1, 2, 3, 4, 5].map(i => `<span class="deck-etoile ${i <= a.note ? 'est-pleine' : ''}">★</span>`).join('')}
            <span class="profil-avis__cible">sur ${a.decks
              ? `<a href="/deck/${escapeHtml(a.decks.slug)}">${escapeHtml(a.decks.titre)}</a>`
              : 'un deck retiré depuis'}</span>
          </div>
          <p>« ${escapeHtml(a.avis)} »</p>
        </blockquote>`).join('')}
    </div>`
    : profilVide(cestMoi
        ? "Tu n'as encore écrit aucun avis. C'est ce qui aide les autres à choisir."
        : "Cette personne n'a pas encore écrit d'avis.");

  const contenuAmis = !cestMoi ? '' : (amis && amis.length ? `
    <div class="profil-amis">
      ${amis.map(l => {
        const autre = l.a === profil.id ? l.b : l.a;
        const p = window.kvtProfils ? window.kvtProfils.profilDe(autre) : null;
        return `<button class="profil-ami" data-profil-voir="${escapeHtml(autre)}">
          ${window.kvtProfils ? window.kvtProfils.avatarHtml(autre, p && p.pseudo, 32) : ''}
          <span>${escapeHtml((p && p.pseudo) || 'quelqu’un')}</span>
        </button>`;
      }).join('')}
    </div>`
    : profilVide("Aucun ami pour l'instant. Ajoute quelqu'un depuis l'onglet Compte."));

  el.innerHTML = `
    ${retour}
    <header class="profil-entete card">
      <div class="profil-entete__haut">
        ${window.kvtProfils ? window.kvtProfils.avatarHtml(profil.id, profil.pseudo, 72) : ''}
        <div class="profil-entete__ident">
          <h2 class="profil-entete__pseudo">${escapeHtml(profil.pseudo || 'quelqu’un')}</h2>
          <div class="profil-badges">
            ${badges.map(([lib, titre]) => `<span class="profil-badge" title="${escapeHtml(titre)}">${escapeHtml(lib)}</span>`).join('')}
          </div>
        </div>
        ${cestMoi ? '' : `<button class="primary profil-ajout" id="btnProfilAmi">Ajouter en ami</button>`}
      </div>

      ${profil.bio ? `<p class="profil-bio">${escapeHtml(profil.bio)}</p>` : ''}

      <div class="profil-chiffres">
        <span><strong>${decks.length}</strong> deck${decks.length > 1 ? 's' : ''} publié${decks.length > 1 ? 's' : ''}</span>
        <span><strong>${avisRecus}</strong> avis reçu${avisRecus > 1 ? 's' : ''}</span>
        <span><strong>${avis.length}</strong> avis écrit${avis.length > 1 ? 's' : ''}</span>
      </div>
    </header>

    <div class="profil-onglets" role="tablist">
      ${onglets.map(([cle, lib, n]) => `
        <button class="profil-onglet ${profilOnglet === cle ? 'is-active' : ''}" role="tab"
                aria-selected="${profilOnglet === cle}" data-profil-onglet="${cle}">
          ${lib} <span class="profil-onglet__n">${n}</span>
        </button>`).join('')}
    </div>

    <div class="profil-panneau">
      ${profilOnglet === 'decks' ? contenuDecks : ''}
      ${profilOnglet === 'avis' ? contenuAvis : ''}
      ${profilOnglet === 'amis' ? contenuAmis : ''}
    </div>

    ${cestMoi ? '' : `<p class="profil-note-vie-privee">
      La liste d'amis d'une personne n'est visible que par elle.
    </p>`}`;

  brancherRetour();

  $$('[data-profil-onglet]', el).forEach(b => {
    b.onclick = () => { profilOnglet = b.dataset.profilOnglet; renderProfilPublic(); };
  });
  $$('[data-profil-deck]', el).forEach(b => {
    b.onclick = () => { if (typeof ouvrirDeck === 'function') ouvrirDeck(b.dataset.profilDeck); };
  });
  $$('[data-profil-voir]', el).forEach(b => {
    b.onclick = () => ouvrirProfilPublic(b.dataset.profilVoir);
  });

  const btnAmi = $('#btnProfilAmi');
  if (btnAmi) {
    btnAmi.onclick = async () => {
      if (!window.accountUser) { showToast('Connecte-toi pour ajouter quelqu\'un'); return; }
      btnAmi.disabled = true;
      try {
        // La demande passe par le pseudo, comme dans l'onglet Compte : c'est
        // la fonction en base qui décide, pas le client.
        const { error } = await window.sb.rpc('demander_ami', { p_pseudo: profil.pseudo });
        if (error) throw error;
        showToast('Demande envoyée à ' + profil.pseudo);
      } catch (e) {
        showToast('Demande impossible : ' + (e.message || e));
        btnAmi.disabled = false;
      }
    };
  }
}

function brancherRetour() {
  const b = $('#btnProfilRetour');
  if (b) b.onclick = () => switchView(profilRetourVers || 'decks');
}

// D'où l'on venait, pour que « Retour » ramène là et non toujours à la même
// liste : on peut atteindre un profil depuis un deck comme depuis l'accueil.
let profilRetourVers = 'decks';

window.kvtProfilPublic = {
  ouvrirProfilPublic,
  renderProfilPublic,
  depuis(vue) { profilRetourVers = vue; },
  reinitialiser() { profilVu = null; profilData = null; profilErreur = null; }
};
