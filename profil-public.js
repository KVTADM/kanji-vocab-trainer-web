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
      // Etat de l'amitie connu avant l'affichage du bouton.
      (window.kvtAmis && window.accountUser ? window.kvtAmis.assurerAmitiesChargees() : Promise.resolve()).catch(() => {}),

      window.sb.from('profiles').select('id,pseudo,avatar_url,niveau,bio,created_at,banniere_active,hexagone_stats,titre_actif,bordure_active,pseudo_style,niveau_jeu')
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

async function ouvrirProfilPublic(userId, onglet) {
  if (!userId) return;
  profilVu = userId;
  profilData = null;
  profilErreur = null;
  profilOnglet = onglet || 'decks';
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
  if (profil && profil.niveau_jeu >= 1 && typeof rangDepuisNiveau === 'function') {
    const r = rangDepuisNiveau(profil.niveau_jeu);
    liste.unshift([`${r.emoji} ${r.nom} · niv. ${profil.niveau_jeu}`, 'Niveau de jeu et rang']);
  }
  if (profil && profil.titre_actif && typeof objetBoutique === 'function') {
    const t = objetBoutique(profil.titre_actif);
    if (t) liste.push([`${t.emoji} ${t.nom}`, 'Titre affiché (boutique)']);
  }
  return liste;
}

// Le bouton suit la relation : plus de clic en boucle sur quelqu'un qui est
// deja ami, ni sur une demande deja envoyee (retour de Lucien, 30/09/2026).
function boutonAmiHtml(userId) {
  const etat = window.kvtAmis && window.accountUser ? window.kvtAmis.etatAvec(userId) : 'aucune';
  if (etat === 'ami') return `<button class="secondary profil-ajout" disabled>✓ Ami</button>`;
  if (etat === 'envoyee') return `<button class="secondary profil-ajout" disabled>Demande envoyée</button>`;
  if (etat === 'recue') return `<button class="primary profil-ajout" id="btnProfilAmi">Accepter sa demande</button>`;
  return `<button class="primary profil-ajout" id="btnProfilAmi">Ajouter en ami</button>`;
}

function profilVide(message) {
  return `<p class="comm-etat-vide">${message}</p>`;
}

let amisEnAttente = false;
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
  if (cestMoi) {
    // Demandes d'amis à traiter : pastille sur l'onglet (retour Lucien 30/09).
    const nbRecues = window.kvtAmis && window.accountUser ? window.kvtAmis.classerAmities().recues.length : 0;
    onglets.push(['amis', 'Amis', amis ? amis.length : 0, nbRecues]);
    onglets.push(['historique', 'Historique', '']);
    onglets.push(['compte', 'Compte', '']);
  }
  if (!onglets.some(o => o[0] === profilOnglet)) profilOnglet = 'decks';

  // Graphique hexagonal de performance (deplace des Statistiques vers le
  // profil, demande de Paul le 23/09/2026 : "devrai etre sur le profile et
  // visible par tout ce qui reguarde le profile des autre"). Sur son propre
  // profil, calcule en direct (plus a jour que la derniere synchronisation)
  // et repousse au passage ; sur celui de quelqu'un d'autre, seulement ce
  // qu'il a lui-meme synchronise -- getHexagoneStats() ne lit que la base
  // locale du visiteur, inutilisable pour le profil d'un tiers.
  let hexaStats = null;
  if (cestMoi && typeof getHexagoneStats === 'function') {
    hexaStats = getHexagoneStats();
    if (typeof window.kvtPushHexagoneStats === 'function') window.kvtPushHexagoneStats(hexaStats);
  } else {
    hexaStats = profil.hexagone_stats || null;
  }
  // Résumé chiffré (demande de Paul, 23/09/2026 : "le statistique devrait
  // etre sur la page de profil perso aussi et résumet pour prendre moin de
  // place") -- uniquement sur SON PROPRE profil (contrairement au graphique
  // hexagonal juste au-dessus, jamais synchronisé pour les autres), une
  // seule ligne compacte plutôt que les tableaux détaillés de la page
  // Statistiques. Réutilise la classe .profil-chiffres déjà utilisée par
  // l'en-tête (decks/avis) pour rester visuellement cohérent et ne pas
  // ajouter de CSS.
  const chiffresPersoHtml = (!cestMoi || typeof getScoreCompositePersonnel !== 'function') ? '' : `
    <div class="profil-chiffres" style="margin:0 0 4px;">
      <span><strong>${(typeof DB !== 'undefined' && DB.vocab) ? DB.vocab.length : 0}</strong> mots au total</span>
      <span><strong>${typeof getTotalSessionsJouees === 'function' ? getTotalSessionsJouees() : 0}</strong> sessions jouées</span>
      <span><strong>${(typeof DB !== 'undefined' && DB.kanjiGroups) ? DB.kanjiGroups.length : 0}</strong> kanji importés</span>
      <span><strong>${(() => { const c = getScoreCompositePersonnel(); return c === null ? '—' : c; })()}</strong> score composite</span>
      ${(() => {
        const t = typeof meilleurTempsParfait === 'function' ? meilleurTempsParfait(DB.scores) : null;
        return `<span title="Session la plus rapide terminée à 100 %"><strong>${t && typeof formatDuree === 'function' ? formatDuree(t.dureeMs) : '—'}</strong> meilleur temps (100 %)</span>`;
      })()}
    </div>`;

  const hexaHtml = (typeof renderHexagoneSvg !== 'function') ? '' : `
    <div class="card profil-hexagone">
      <h3>Statistiques</h3>
      ${chiffresPersoHtml}
      <p style="font-size:12px; color:var(--muted); margin-top:8px;">
        Précision, vitesse, régularité, volume de mots vus, difficulté du contenu travaillé et progression récente.
      </p>
      ${(!hexaStats || hexaStats.aucuneDonnee) ? profilVide(cestMoi
          ? 'Termine une première session pour voir apparaître ton graphique de performance.'
          : "Cette personne n'a pas encore de données de performance.")
        : `<div class="hexa-wrap">${renderHexagoneSvg(hexaStats)}</div>`}
    </div>`;

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

  // Le bloc complet (demander, accepter, refuser, retirer) vit ici, dans le
  // profil ; il est branché après le rendu.
  const contenuAmis = !cestMoi ? '' : (window.kvtAmis ? window.kvtAmis.htmlBlocAmis() : '');

  el.innerHTML = `
    ${retour}
    <header class="profil-entete card">
      ${typeof classeBanniere === 'function' && classeBanniere(profil.banniere_active) ? `<div class="profil-banniere ${classeBanniere(profil.banniere_active)}"></div>` : ''}
      <div class="profil-entete__haut">
        ${window.kvtProfils ? window.kvtProfils.avatarHtml(profil.id, profil.pseudo, 72) : ''}
        <div class="profil-entete__ident">
          <h2 class="profil-entete__pseudo"><span class="${typeof classePseudo === 'function' ? classePseudo(profil.pseudo_style) : ''}">${escapeHtml(profil.pseudo || 'quelqu’un')}</span></h2>
          <div class="profil-badges">
            ${badges.map(([lib, titre]) => `<span class="profil-badge" title="${escapeHtml(titre)}">${escapeHtml(lib)}</span>`).join('')}
          </div>
        </div>
        ${cestMoi ? '' : boutonAmiHtml(profil.id)}
      </div>

      ${profil.bio ? `<p class="profil-bio">${escapeHtml(profil.bio)}</p>` : ''}

      <div class="profil-chiffres">
        <span><strong>${decks.length}</strong> deck${decks.length > 1 ? 's' : ''} publié${decks.length > 1 ? 's' : ''}</span>
        <span><strong>${avisRecus}</strong> avis reçu${avisRecus > 1 ? 's' : ''}</span>
        <span><strong>${avis.length}</strong> avis écrit${avis.length > 1 ? 's' : ''}</span>
      </div>
    </header>

    ${hexaHtml}

    <div class="profil-onglets" role="tablist">
      ${onglets.map(([cle, lib, n, alerte]) => `
        <button class="profil-onglet ${profilOnglet === cle ? 'is-active' : ''}" role="tab"
                aria-selected="${profilOnglet === cle}" data-profil-onglet="${cle}">
          ${lib}${n !== '' ? ` <span class="profil-onglet__n">${n}</span>` : ''}${alerte ? ` <span class="notif-pastille" title="${alerte} demande${alerte > 1 ? 's' : ''} d'ami à traiter">${alerte}</span>` : ''}
        </button>`).join('')}
    </div>

    <div class="profil-panneau">
      ${profilOnglet === 'decks' ? contenuDecks : ''}
      ${profilOnglet === 'avis' ? contenuAvis : ''}
      ${profilOnglet === 'amis' ? contenuAmis : ''}
      ${(profilOnglet === 'historique' || profilOnglet === 'compte') ? '<div id="profilSousVue"></div>' : ''}
    </div>

    ${cestMoi ? '' : `<p class="profil-note-vie-privee">
      La liste d'amis d'une personne n'est visible que par elle.
    </p>`}`;

  brancherRetour();

  // Onglets qui réutilisent les écrans existants (Historique, Compte), et
  // bloc des amis. On détache les cibles quand l'onglet n'est pas actif pour
  // que les vues autonomes ne dessinent jamais dans le profil.
  const sousVue = $('#profilSousVue');
  if (typeof renderHistorique === 'function') renderHistorique(profilOnglet === 'historique' ? sousVue : null);
  if (typeof renderAccount === 'function') renderAccount(profilOnglet === 'compte' ? sousVue : null);
  if (cestMoi && profilOnglet === 'amis' && window.kvtAmis) {
    window.kvtAmis.brancherBlocAmis();
    if (!window.kvtAmis.estChargee() && !amisEnAttente) {
      amisEnAttente = true;
      window.kvtAmis.assurerAmitiesChargees().then(() => {
        amisEnAttente = false;
        if (currentView === 'profil' && profilOnglet === 'amis') window.kvtAmis.renderAccountAmis();
      });
    }
  }

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
        const { data: reponse, error } = await window.sb.rpc('demander_ami', { p_pseudo: profil.pseudo });
        if (error) throw error;
        const messages = {
          demandee: 'Demande envoyée à ' + profil.pseudo,
          acceptee: 'Vous êtes maintenant amis.',
          deja_ami: 'Tu es déjà ami avec ' + profil.pseudo + '.',
          deja_demande: 'Demande déjà envoyée, en attente de réponse.'
        };
        showToast(messages[reponse] || 'Demande envoyée à ' + profil.pseudo);
        if (window.kvtAmis) { await window.kvtAmis.rechargerAmities(); renderProfilPublic(); }
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
  ouvrirMonProfil(onglet) { if (window.accountUser) ouvrirProfilPublic(window.accountUser.id, onglet); },
  ouvrirProfilPublic,
  renderProfilPublic,
  depuis(vue) { profilRetourVers = vue; },
  reinitialiser() { profilVu = null; profilData = null; profilErreur = null; }
};
