// ============================================================
// Decks partagés : publier un de ses semestres, parcourir ceux des autres,
// les importer chez soi.
//
// Deux vues, volontairement séparées :
//   view-decks    la liste de tout ce qui est publié, avec ses filtres
//   view-publier  le formulaire, atteint depuis la liste, avec un retour
//
// Règle qui structure tout : ce fichier n'envoie que le titre, la
// description, le format et le contenu. Le pseudo, les compteurs, le nombre
// de semaines et l'adresse du deck sont décidés par la base (fonction
// publier_deck), parce qu'un navigateur peut mentir sur tous ces champs.
// ============================================================

let decksCache = null;        // liste chargée depuis Supabase, ou null tant qu'on n'a rien
let decksErreur = null;       // message d'erreur de chargement, affiché tel quel
let decksFiltre = 'tous';     // 'tous' | 'cursus' | 'jlpt'
let decksTri = 'recents';     // 'recents' | 'note' | 'kanji' | 'titre'
let decksRecherche = '';
let decksEnCours = false;
let mesNotes = {};            // deck_id -> note posée par l'utilisateur connecté
let recordsDecks = {};        // deck_id -> { pseudo, user_id, pct, points, max_points }

// État du formulaire de publication. Conservé entre deux rendus pour que
// changer un champ ne réinitialise pas les autres.
let deckOuvert = null;        // id du deck affiché en pleine page
let deckDetail = null;        // { deck, avis: [], contenu } chargé à l'ouverture
let deckDetailErreur = null;
let monAvis = { note: 0, texte: '', envoi: false };
let commentaires = [];        // liste à plat, l'arbre est reconstruit à l'affichage
let mesVotes = {};            // commentaire_id -> -1 | 1
let reponseA = null;          // id du commentaire auquel on répond, ou null
let brouillons = {};          // id du parent (ou 'racine') -> texte en cours de frappe
let triCommentaires = 'score';// 'score' | 'recents'

let pubEtat = {
  semesterId: null,
  portee: 'tout',             // 'tout' | 'plage'
  semaineDebut: 1,
  semaineFin: 1,
  type: 'cursus',
  cursus: '',
  niveau: 'N4',
  decoupage: 'semaines',
  titre: '',
  description: '',
  envoi: false,
  erreur: null
};

// ---------- Lecture ----------

// On ne demande jamais la colonne "contenu" ici : un deck pèse plus de cent
// kilo-octets et la liste en afficherait cinquante. Le contenu n'est chargé
// qu'au moment de l'import, deck par deck.
const CHAMPS_LISTE = 'id,slug,titre,description,pseudo,auteur_id,officiel,semester_id,type,cursus,niveau,decoupage,nb_kanji,nb_mots,nb_semaines,note_moyenne,nb_notes,created_at';

async function chargerDecks() {
  if (!window.sb) { decksErreur = "La connexion au serveur n'est pas disponible."; return; }
  decksEnCours = true;
  decksErreur = null;
  try {
    const { data, error } = await window.sb
      .from('decks')
      .select(CHAMPS_LISTE)
      .eq('visible', true)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    decksCache = data || [];

    // Les notes de l'utilisateur connecté, pour pouvoir montrer l'étoile
    // qu'il a déjà posée. Une requête séparée : la moyenne est publique, la
    // note personnelle ne l'est pas.
    mesNotes = {};
    if (window.accountUser) {
      const { data: notes } = await window.sb
        .from('deck_notes').select('deck_id,note').eq('user_id', window.accountUser.id);
      (notes || []).forEach(n => { mesNotes[n.deck_id] = n.note; });
    }

    // Le meilleur score de la communauté sur chaque deck. La vue s'appuie sur
    // la table des scores, qui n'est lisible que par un compte connecté : un
    // visiteur verra donc « — » plutôt qu'un record.
    recordsDecks = {};
    if (window.accountUser && decksCache.length) {
      const { data: records } = await window.sb
        .from('deck_record').select('deck_id,pseudo,user_id,pct,points,max_points')
        .in('deck_id', decksCache.map(d => d.id));
      (records || []).forEach(r => { recordsDecks[r.deck_id] = r; });
    }

    // Les profils des auteurs, en une seule requête pour toute la liste.
    if (window.kvtProfils) {
      await window.kvtProfils.chargerProfils(decksCache.filter(d => d.auteur_id).map(d => d.auteur_id));
    }
  } catch (err) {
    decksCache = [];
    decksErreur = err && err.message ? err.message : String(err);
  } finally {
    decksEnCours = false;
  }
}

function decksVisibles() {
  const liste = decksCache || [];
  const q = decksRecherche.trim().toLowerCase();
  return liste.filter(d => {
    if (decksFiltre !== 'tous' && d.type !== decksFiltre) return false;
    if (!q) return true;
    return (d.titre + ' ' + d.description + ' ' + d.cursus + ' ' + d.niveau + ' ' + d.pseudo)
      .toLowerCase().includes(q);
  });
}

// Le meilleur score de l'utilisateur sur ce deck, s'il l'a importé et
// travaillé. Les scores sont locaux : un deck jamais importé n'a rien à
// afficher, et c'est une information en soi.
function monResultat(deck) {
  // Un deck officiel est déjà chez tout le monde, sous son identifiant réel
  // (s1, jlpt-n3…). Un deck d'utilisateur n'existe qu'une fois importé, sous
  // « deck-<slug> ».
  const semId = deck.officiel ? deck.semester_id : ('deck-' + deck.slug);
  if (!DB.settings.semesters.some(s => s.id === semId)) return null;
  let meilleur = null;
  Object.keys(DB.scores || {}).forEach(cle => {
    const m = cle.match(/^(.+)-w(\d+)$/);
    if (!m || m[1] !== semId) return;
    const e = DB.scores[cle];
    if (e && e.best && (!meilleur || e.best.pct > meilleur.pct)) meilleur = e.best;
  });
  return { importe: true, best: meilleur };
}

function trierDecks(liste) {
  const copie = liste.slice();
  if (decksTri === 'note') {
    // Un deck sans note ne passe pas devant un deck noté : il part en fin de
    // liste plutôt que de compter pour zéro.
    copie.sort((a, b) => {
      const na = a.nb_notes ? Number(a.note_moyenne) : -1;
      const nb = b.nb_notes ? Number(b.note_moyenne) : -1;
      if (nb !== na) return nb - na;
      return (b.nb_notes || 0) - (a.nb_notes || 0);
    });
  } else if (decksTri === 'kanji') {
    copie.sort((a, b) => (b.nb_kanji || 0) - (a.nb_kanji || 0));
  } else if (decksTri === 'titre') {
    copie.sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
  } else {
    copie.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  return copie;
}

function etoiles(deck) {
  const moy = deck.nb_notes ? Number(deck.note_moyenne) : 0;
  const mienne = mesNotes[deck.id] || 0;
  const sienne = window.accountUser && window.accountUser.id === deck.auteur_id;
  const pleines = Math.round(moy);
  return `
    <div class="deck-note">
      <div class="deck-etoiles ${sienne ? 'est-sienne' : ''}" ${sienne ? '' : `data-noter="${deck.id}"`}>
        ${[1, 2, 3, 4, 5].map(i => `
          <span class="deck-etoile ${(mienne ? i <= mienne : i <= pleines) ? 'est-pleine' : ''} ${mienne ? 'est-mienne' : ''}" data-valeur="${i}">★</span>`).join('')}
      </div>
      <span class="deck-note-texte">${deck.nb_notes
        ? `${Number(deck.note_moyenne).toFixed(1)} · ${deck.nb_notes} avis`
        : 'Aucune note'}</span>
    </div>`;
}

// Trois états ici aussi : personne n'a encore joué ce deck, un record existe,
// ou le visiteur n'a pas de compte et ne peut pas voir les scores.
function htmlRecord(deck) {
  if (!window.accountUser) return `<span class="deck-resultat-vide">Connecte-toi</span>`;
  const r = recordsDecks[deck.id];
  if (!r) return `<span class="deck-resultat-vide">Personne encore</span>`;
  const cestMoi = r.user_id === window.accountUser.id;
  return `<span class="deck-resultat-score">${Math.round(r.pct)}%</span>
          <span class="deck-resultat-detail">${cestMoi ? 'toi' : escapeHtml(r.pseudo)}</span>`;
}

function formatDeck(d) {
  const bouts = [];
  if (d.officiel) bouts.push('Contenu KVT');
  bouts.push(d.type === 'jlpt' ? ('JLPT ' + d.niveau) : (d.cursus || 'Cursus'));
  bouts.push(d.decoupage === 'bloc' ? "d'un seul bloc" : (d.nb_semaines + ' semaine' + (d.nb_semaines > 1 ? 's' : '')));
  bouts.push(d.nb_kanji + ' kanji');
  bouts.push(d.nb_mots + ' mot' + (d.nb_mots > 1 ? 's' : ''));
  return bouts;
}

function dateCourte(iso) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return ''; }
}

// ---------- Vue : la liste ----------

function renderDecks() {
  const el = $('#view-decks');
  if (!el) return;

  if (decksCache === null && !decksEnCours) {
    chargerDecks().then(() => { if (currentView === 'decks') renderDecks(); });
  }

  const connecte = !!window.accountUser;
  const liste = trierDecks(decksVisibles());

  const entete = `
    <div class="decks-head">
      <div>
        <h2>Decks partagés</h2>
        <p class="decks-sous-titre">Les listes de vocabulaire publiées par les autres utilisateurs. Un import les ajoute à tes semestres — rien n'est remplacé.</p>
      </div>
      ${connecte
        ? `<button class="primary" id="btnAllerPublier">Publier un deck</button>`
        : `<span class="decks-note">Connecte-toi pour publier</span>`}
    </div>`;

  const filtres = `
    <div class="decks-barre">
      <div class="decks-filtres">
        ${[['tous', 'Tous'], ['cursus', 'Cursus'], ['jlpt', 'JLPT']].map(([v, lib]) => `
          <button class="deck-filtre ${decksFiltre === v ? 'is-active' : ''}" data-filtre="${v}">${lib}</button>`).join('')}
      </div>
      <input type="search" id="decksRecherche" class="decks-recherche" placeholder="Rechercher un deck, un cursus, un auteur…" value="${escapeHtml(decksRecherche)}" />
      <label class="decks-tri-label" for="decksTri">Trier par</label>
      <select id="decksTri" class="decks-tri">
        ${[['recents', 'Plus récents'], ['note', 'Mieux notés'], ['kanji', 'Plus de kanji'], ['titre', 'Ordre alphabétique']]
          .map(([v, lib]) => `<option value="${v}" ${decksTri === v ? 'selected' : ''}>${lib}</option>`).join('')}
      </select>
    </div>`;

  let corps;
  if (decksEnCours && decksCache === null) {
    corps = `<div class="card"><p style="color:var(--muted);">Chargement…</p></div>`;
  } else if (decksErreur) {
    corps = `<div class="card"><p>Impossible de charger les decks : ${escapeHtml(decksErreur)}</p>
             <button class="secondary" id="btnRechargerDecks">Réessayer</button></div>`;
  } else if (!liste.length) {
    const vide = (decksCache || []).length === 0
      ? "Aucun deck n'a encore été publié. Le premier sera peut-être le tien."
      : "Aucun deck ne correspond à cette recherche.";
    corps = `<div class="card"><p style="color:var(--muted);">${vide}</p></div>`;
  } else {
    corps = `<div class="decks-grille">${liste.map(d => {
      const res = monResultat(d);
      // Trois états distincts, et il faut pouvoir les distinguer d'un coup
      // d'œil : jamais importé, importé mais jamais travaillé, et un score.
      const resultat = !res
        ? `<span class="deck-resultat-vide">Aucun résultat</span>`
        : (res.best
            ? `<span class="deck-resultat-score">${res.best.pct}%</span><span class="deck-resultat-detail">${res.best.points}/${res.best.maxPoints} pts</span>`
            : `<span class="deck-resultat-vide">Importé, jamais révisé</span>`);
      return `
      <article class="deck-carte" data-ouvrir="${d.id}" tabindex="0" role="link" aria-label="Ouvrir ${escapeHtml(d.titre)}">
        <h3 class="deck-titre">${escapeHtml(d.titre)}</h3>
        <div class="deck-auteur">
          ${d.officiel
            ? `<span class="deck-officiel">Contenu officiel</span>`
            : (window.kvtProfils ? window.kvtProfils.auteurHtml(d.auteur_id, d.pseudo, 22) : escapeHtml(d.pseudo))}
          ${d.officiel ? '' : `<span class="deck-auteur-date">${dateCourte(d.created_at)}</span>`}
        </div>
        <div class="deck-etiquettes">
          ${formatDeck(d).map(t => `<span class="deck-etiquette">${escapeHtml(t)}</span>`).join('')}
        </div>
        <p class="deck-description ${d.description ? '' : 'est-vide'}">${d.description ? escapeHtml(d.description) : "L'auteur n'a pas écrit de description."}</p>
        <div class="deck-mesures deck-mesures--trois">
          <div class="deck-mesure">
            <span class="deck-mesure-titre">Ton résultat</span>
            <div class="deck-resultat">${resultat}</div>
          </div>
          <div class="deck-mesure">
            <span class="deck-mesure-titre">Record</span>
            <div class="deck-resultat">${htmlRecord(d)}</div>
          </div>
          <div class="deck-mesure">
            <span class="deck-mesure-titre">Note</span>
            ${etoiles(d)}
          </div>
        </div>
        <div class="deck-actions">
          ${d.officiel
            ? `<button class="primary" data-ouvrir-semestre="${d.semester_id}">Réviser</button>`
            : `<button class="primary" data-importer="${d.id}" ${res ? 'disabled' : ''}>${res ? 'Déjà importé' : 'Importer ce deck'}</button>`}
          ${!d.officiel && window.accountUser && window.accountUser.id === d.auteur_id
            ? `<button class="secondary" data-retirer="${d.id}">Retirer</button>` : ''}
        </div>
      </article>`; }).join('')}</div>`;
  }

  el.innerHTML = entete + filtres + corps;

  const btnPub = $('#btnAllerPublier');
  if (btnPub) btnPub.onclick = () => { pubEtat.erreur = null; switchView('publier'); };

  const btnRe = $('#btnRechargerDecks');
  if (btnRe) btnRe.onclick = () => { decksCache = null; renderDecks(); };

  $$('.deck-filtre', el).forEach(b => {
    b.onclick = () => { decksFiltre = b.dataset.filtre; renderDecks(); };
  });

  const rech = $('#decksRecherche');
  if (rech) {
    rech.oninput = () => {
      decksRecherche = rech.value;
      const pos = rech.selectionStart;
      renderDecks();
      const nouveau = $('#decksRecherche');
      if (nouveau) { nouveau.focus(); nouveau.setSelectionRange(pos, pos); }
    };
  }

  $$('[data-ouvrir]', el).forEach(carte => {
    carte.onclick = () => ouvrirDeck(carte.dataset.ouvrir);
    carte.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrirDeck(carte.dataset.ouvrir); } };
  });
  // Toute la carte ouvre le deck, mais les commandes qui s'y trouvent gardent
  // leur propre effet : sans ça, noter un deck l'ouvrirait aussi.
  $$('.deck-carte button, .deck-carte .deck-etoiles', el).forEach(cible => {
    cible.addEventListener('click', (e) => e.stopPropagation());
  });

  const tri = $('#decksTri');
  if (tri) tri.onchange = () => { decksTri = tri.value; renderDecks(); };

  $$('[data-noter]', el).forEach(groupe => {
    $$('.deck-etoile', groupe).forEach(et => {
      et.onclick = () => noterDeck(groupe.dataset.noter, Number(et.dataset.valeur));
    });
  });

  $$('[data-ouvrir-semestre]', el).forEach(b => {
    b.onclick = () => {
      // Un deck officiel est déjà installé : on ne l'importe pas, on va le
      // réviser là où il se trouve.
      if (typeof dashboardMode !== 'undefined') {
        const sem = DB.settings.semesters.find(s => s.id === b.dataset.ouvrirSemestre);
        if (sem) dashboardMode = (typeof categorieDuSemestre === 'function') ? categorieDuSemestre(sem) : dashboardMode;
      }
      switchView('dashboard');
    };
  });

  $$('[data-importer]', el).forEach(b => {
    b.onclick = () => importerDeck(b.dataset.importer, b);
  });
  $$('[data-retirer]', el).forEach(b => {
    b.onclick = () => retirerDeck(b.dataset.retirer);
  });
}

// ---------- Vue : le formulaire ----------

function semestresPubliables() {
  return DB.settings.semesters
    .map(sem => {
      const groupes = DB.kanjiGroups.filter(g => g.semesterId === sem.id);
      const ids = new Set(groupes.map(g => g.id));
      const mots = DB.vocab.filter(v => ids.has(v.kanjiGroupId));
      const semaines = groupes.reduce((m, g) => Math.max(m, Number(g.week) || 0), 0);
      return { sem, nbKanji: groupes.length, nbMots: mots.length, semaines };
    })
    .filter(x => x.nbKanji > 0);
}

// La plage effectivement retenue, bornée aux semaines qui existent.
function plageRetenue(choisi) {
  if (!choisi || pubEtat.portee !== 'plage') return null;
  const max = Math.max(1, choisi.semaines);
  let a = Math.min(Math.max(1, Number(pubEtat.semaineDebut) || 1), max);
  let b = Math.min(Math.max(1, Number(pubEtat.semaineFin) || max), max);
  if (b < a) { const t = a; a = b; b = t; }
  return { debut: a, fin: b };
}

function renderPublier() {
  const el = $('#view-publier');
  if (!el) return;

  if (!window.accountUser) {
    el.innerHTML = `
      <h2>Publier un deck</h2>
      <div class="card" style="max-width:460px;">
        <p>Il faut un compte pour publier : c'est ton pseudo qui apparaîtra comme auteur.</p>
        <button class="primary" id="btnVersCompte">Aller à l'onglet Compte</button>
      </div>`;
    $('#btnVersCompte').onclick = () => switchView('account');
    return;
  }

  const dispo = semestresPubliables();
  if (!dispo.length) {
    el.innerHTML = `<h2>Publier un deck</h2>
      <div class="card"><p>Aucun de tes semestres ne contient de kanji pour l'instant.</p></div>`;
    return;
  }

  if (!pubEtat.semesterId || !dispo.some(x => x.sem.id === pubEtat.semesterId)) {
    pubEtat.semesterId = dispo[0].sem.id;
  }
  const choisi = dispo.find(x => x.sem.id === pubEtat.semesterId);

  const estJlpt = pubEtat.type === 'jlpt';
  const parSemaines = pubEtat.decoupage === 'semaines';
  const plage = plageRetenue(choisi);
  // Le récapitulatif compte ce qui part réellement, pas ce que contient le
  // semestre : publier 3 semaines sur 12 ne doit pas annoncer 132 kanji.
  const apercu = contenuDuSemestre(pubEtat.semesterId, pubEtat.decoupage, plage);
  const nbSemainesEnvoyees = parSemaines
    ? apercu.kanjiGroups.reduce((m, g) => Math.max(m, g.week), 0)
    : 0;

  el.innerHTML = `
    <div class="pub-fil"><button class="lien-retour" id="btnRetourDecks">← Tous les decks</button></div>
    <h2>Publier un deck</h2>
    <p class="decks-sous-titre">Tu publies une copie de l'un de tes semestres. Ton exemplaire n'est pas modifié, et tu peux retirer le deck à tout moment.</p>

    <div class="card pub-form">

      <label class="pub-label" for="pubSemestre">Quel semestre publier ?</label>
      <select id="pubSemestre" class="pub-champ">
        ${dispo.map(x => `<option value="${x.sem.id}" ${x.sem.id === pubEtat.semesterId ? 'selected' : ''}>${escapeHtml(x.sem.label)} — ${x.nbKanji} kanji, ${x.nbMots} mots</option>`).join('')}
      </select>

      <div class="pub-label">Quelle partie ?</div>
      <div class="pub-choix">
        <button class="pub-option ${pubEtat.portee === 'tout' ? 'is-active' : ''}" data-portee="tout">Tout le semestre</button>
        <button class="pub-option ${pubEtat.portee === 'plage' ? 'is-active' : ''}" data-portee="plage">Certaines semaines</button>
      </div>
      ${pubEtat.portee === 'plage' ? `
        <div class="pub-plage">
          <label for="pubSemDebut">De la semaine</label>
          <select id="pubSemDebut" class="pub-champ pub-champ-court">
            ${Array.from({ length: Math.max(1, choisi.semaines) }, (_, i) => i + 1)
              .map(w => `<option value="${w}" ${plage && plage.debut === w ? 'selected' : ''}>${w}</option>`).join('')}
          </select>
          <label for="pubSemFin">à</label>
          <select id="pubSemFin" class="pub-champ pub-champ-court">
            ${Array.from({ length: Math.max(1, choisi.semaines) }, (_, i) => i + 1)
              .map(w => `<option value="${w}" ${plage && plage.fin === w ? 'selected' : ''}>${w}</option>`).join('')}
          </select>
        </div>
        <p class="pub-aide">Les semaines sont renumérotées à partir de 1 chez celui qui importe.</p>` : ''}

      <div class="pub-label">Que publies-tu ?</div>
      <div class="pub-choix">
        <button class="pub-option ${estJlpt ? '' : 'is-active'}" data-type="cursus">Un cursus</button>
        <button class="pub-option ${estJlpt ? 'is-active' : ''}" data-type="jlpt">Un niveau JLPT</button>
      </div>
      <p class="pub-aide">Un cursus suit un programme réel. Un niveau JLPT suit la liste officielle de l'examen.</p>

      ${estJlpt ? `
        <label class="pub-label" for="pubNiveau">Niveau</label>
        <select id="pubNiveau" class="pub-champ">
          ${['N5', 'N4', 'N3', 'N2', 'N1'].map(n => `<option value="${n}" ${pubEtat.niveau === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>`
      : `
        <label class="pub-label" for="pubCursus">Cursus</label>
        <input type="text" id="pubCursus" class="pub-champ" maxlength="80" placeholder="LLCER Japonais, LEA, autodidacte…" value="${escapeHtml(pubEtat.cursus)}" />`}

      <label class="pub-label" for="pubTitre">Titre du deck</label>
      <input type="text" id="pubTitre" class="pub-champ" maxlength="120" placeholder="Semestre 2 — LLCER Japonais" value="${escapeHtml(pubEtat.titre)}" />
      <div class="pub-avertissement">
        Nomme ton deck par le cursus ou le niveau, <strong>jamais par un manuel</strong>.
        « Genki chapitre 3 » ou « Minna no Nihongo leçon 12 » ne sont pas acceptés :
        la sélection et l'ordre d'un chapitre appartiennent à son éditeur.
        <a href="/regles-de-publication" target="_blank" rel="noopener">Les règles en entier</a>
      </div>

      <label class="pub-label" for="pubDescription">Description</label>
      <textarea id="pubDescription" class="pub-champ pub-zone" maxlength="2000" rows="3" placeholder="Ce que contient ce deck, et pour qui il est utile.">${escapeHtml(pubEtat.description)}</textarea>

      <div class="pub-label">Découpage</div>
      <div class="pub-choix">
        <button class="pub-option ${parSemaines ? 'is-active' : ''}" data-decoupage="semaines">Par semaines</button>
        <button class="pub-option ${parSemaines ? '' : 'is-active'}" data-decoupage="bloc">D'un seul bloc</button>
      </div>
      <p class="pub-aide">${parSemaines
        ? `Le découpage est conservé : ${nbSemainesEnvoyees} semaine${nbSemainesEnvoyees > 1 ? 's' : ''}.`
        : `Tout le vocabulaire arrivera en une seule semaine chez celui qui importe.`}</p>

      <div class="pub-recap">
        Ce deck contiendra <strong>${apercu.kanjiGroups.length} kanji</strong> et <strong>${apercu.vocab.length} mots</strong>${parSemaines ? `, sur <strong>${nbSemainesEnvoyees} semaine${nbSemainesEnvoyees > 1 ? 's' : ''}</strong>` : ''}${plage ? ` (semaines ${plage.debut} à ${plage.fin} du semestre)` : ''}.
      </div>

      ${pubEtat.erreur ? `<div class="pub-erreur">${escapeHtml(pubEtat.erreur)}</div>` : ''}

      <div class="pub-actions">
        <button class="primary" id="btnPublier" ${pubEtat.envoi ? 'disabled' : ''}>${pubEtat.envoi ? 'Publication…' : 'Publier'}</button>
        <span class="pub-aide">Tu pourras le retirer à tout moment depuis la liste.</span>
      </div>
    </div>`;

  // Les champs de texte ne redessinent pas la vue à chaque frappe : on lit
  // leur valeur au moment de publier. Seuls les choix qui changent la forme
  // du formulaire provoquent un rendu.
  const lire = () => {
    const t = $('#pubTitre'), d = $('#pubDescription'), c = $('#pubCursus'), n = $('#pubNiveau');
    if (t) pubEtat.titre = t.value;
    if (d) pubEtat.description = d.value;
    if (c) pubEtat.cursus = c.value;
    if (n) pubEtat.niveau = n.value;
  };

  $('#btnRetourDecks').onclick = () => { lire(); switchView('decks'); };
  $('#pubSemestre').onchange = (e) => { lire(); pubEtat.semesterId = e.target.value; renderPublier(); };

  const sel = $('#pubNiveau');
  if (sel) sel.onchange = (e) => { pubEtat.niveau = e.target.value; };

  $$('[data-portee]', el).forEach(b => {
    b.onclick = () => { lire(); pubEtat.portee = b.dataset.portee; renderPublier(); };
  });
  const sd = $('#pubSemDebut'), sf = $('#pubSemFin');
  if (sd) sd.onchange = () => { lire(); pubEtat.semaineDebut = Number(sd.value); renderPublier(); };
  if (sf) sf.onchange = () => { lire(); pubEtat.semaineFin = Number(sf.value); renderPublier(); };

  $$('[data-type]', el).forEach(b => {
    b.onclick = () => { lire(); pubEtat.type = b.dataset.type; renderPublier(); };
  });
  $$('[data-decoupage]', el).forEach(b => {
    b.onclick = () => { lire(); pubEtat.decoupage = b.dataset.decoupage; renderPublier(); };
  });

  $('#btnPublier').onclick = () => { lire(); publierDeck(); };
}

// ---------- Vue : la page d'un deck ----------

async function ouvrirDeck(id) {
  deckOuvert = id;
  deckDetail = null;
  deckDetailErreur = null;
  monAvis = { note: 0, texte: '', envoi: false };
  switchView('deck');
  await chargerDetail(id);
  if (currentView === 'deck') renderDeck();
}

async function chargerDetail(id) {
  try {
    // Le contenu vient avec : la page en montre un aperçu, et l'import depuis
    // cette page évite alors une seconde requête.
    const { data: deck, error } = await window.sb
      .from('decks').select(CHAMPS_LISTE + ',contenu').eq('id', id).single();
    if (error) throw error;

    const { data: avis, error: e2 } = await window.sb
      .from('deck_notes').select('user_id,pseudo,note,avis,updated_at')
      .eq('deck_id', id).order('updated_at', { ascending: false });
    if (e2) throw e2;

    const { data: coms, error: e3 } = await window.sb
      .from('deck_commentaires').select('id,parent_id,user_id,pseudo,texte,score,created_at')
      .eq('deck_id', id).order('created_at', { ascending: true });
    if (e3) throw e3;
    commentaires = coms || [];
    if (window.kvtProfils) {
      await window.kvtProfils.chargerProfils(commentaires.map(c => c.user_id).concat([deck.auteur_id]));
    }

    mesVotes = {};
    if (window.accountUser && commentaires.length) {
      const { data: votes } = await window.sb
        .from('deck_commentaire_votes').select('commentaire_id,valeur')
        .eq('user_id', window.accountUser.id)
        .in('commentaire_id', commentaires.map(c => c.id));
      (votes || []).forEach(v => { mesVotes[v.commentaire_id] = v.valeur; });
    }

    deckDetail = { deck, avis: avis || [] };
    const mien = (avis || []).find(a => window.accountUser && a.user_id === window.accountUser.id);
    monAvis = { note: mien ? mien.note : 0, texte: mien ? mien.avis : '', envoi: false };
  } catch (err) {
    deckDetailErreur = err && err.message ? err.message : String(err);
  }
}

// L'arbre des commentaires, reconstruit à partir de la liste à plat. Une
// réponse dont le parent a été supprimé remonte à la racine plutôt que de
// disparaître avec lui : le texte reste lisible, il perd juste son contexte.
function arbreCommentaires() {
  const parId = new Map(commentaires.map(c => [c.id, { ...c, enfants: [] }]));
  const racines = [];
  parId.forEach(c => {
    const parent = c.parent_id ? parId.get(c.parent_id) : null;
    if (parent) parent.enfants.push(c); else racines.push(c);
  });
  const ordonner = (liste) => {
    liste.sort((a, b) => triCommentaires === 'recents'
      ? String(b.created_at).localeCompare(String(a.created_at))
      : (b.score - a.score) || String(a.created_at).localeCompare(String(b.created_at)));
    liste.forEach(c => ordonner(c.enfants));
  };
  ordonner(racines);
  return racines;
}

function ilYA(iso) {
  const secondes = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secondes < 60) return "à l'instant";
  const paliers = [[60, 'minute'], [3600, 'heure'], [86400, 'jour'], [604800, 'semaine'], [2592000, 'mois'], [31536000, 'an']];
  let valeur = secondes, unite = 'seconde';
  for (let i = paliers.length - 1; i >= 0; i--) {
    if (secondes >= paliers[i][0]) { valeur = Math.floor(secondes / paliers[i][0]); unite = paliers[i][1]; break; }
  }
  const pluriel = valeur > 1 ? (unite === 'mois' ? 'mois' : unite + 's') : unite;
  return `il y a ${valeur} ${pluriel}`;
}

const PROFONDEUR_MAX = 5; // au-delà, la marge mangerait toute la largeur

function htmlCommentaire(c, profondeur, estAuteurDuDeck) {
  const monVote = mesVotes[c.id] || 0;
  const aMoi = window.accountUser && window.accountUser.id === c.user_id;
  const p = Math.min(profondeur, PROFONDEUR_MAX);
  return `
    <div class="com" style="margin-left:${p * 22}px;">
      <div class="com-corps">
        <div class="com-votes">
          <button class="com-vote ${monVote === 1 ? 'est-actif' : ''}" data-vote="${c.id}" data-valeur="1" aria-label="Voter pour">▲</button>
          <span class="com-score ${c.score > 0 ? 'est-positif' : (c.score < 0 ? 'est-negatif' : '')}">${c.score}</span>
          <button class="com-vote ${monVote === -1 ? 'est-actif' : ''}" data-vote="${c.id}" data-valeur="-1" aria-label="Voter contre">▼</button>
        </div>
        <div class="com-contenu">
          <div class="com-tete">
            ${window.kvtProfils ? window.kvtProfils.avatarHtml(c.user_id, c.pseudo, 20) : ''}
            <span class="com-pseudo">${escapeHtml(c.pseudo)}</span>
            ${aMoi ? '<span class="com-marque">toi</span>' : ''}
            <span class="com-date">${ilYA(c.created_at)}</span>
          </div>
          <p class="com-texte">${escapeHtml(c.texte)}</p>
          <div class="com-actions">
            ${window.accountUser ? `<button class="com-action" data-repondre="${c.id}">Répondre</button>` : ''}
            ${(aMoi || estAuteurDuDeck) ? `<button class="com-action" data-supprimer-com="${c.id}">Supprimer</button>` : ''}
          </div>
          ${reponseA === c.id ? `
            <div class="com-reponse">
              <textarea class="pub-champ pub-zone" data-brouillon="${c.id}" rows="2" maxlength="4000" placeholder="Ta réponse…">${escapeHtml(brouillons[c.id] || '')}</textarea>
              <div class="pub-actions">
                <button class="primary" data-envoyer="${c.id}">Répondre</button>
                <button class="secondary" data-annuler-reponse="1">Annuler</button>
              </div>
            </div>` : ''}
        </div>
      </div>
      ${c.enfants.map(e => htmlCommentaire(e, profondeur + 1, estAuteurDuDeck)).join('')}
    </div>`;
}

function renderDeck() {
  const el = $('#view-deck');
  if (!el) return;

  if (deckDetailErreur) {
    el.innerHTML = `<div class="pub-fil"><button class="lien-retour" id="btnRetourListe">← Tous les decks</button></div>
      <div class="card"><p>Ce deck est introuvable : ${escapeHtml(deckDetailErreur)}</p></div>`;
    $('#btnRetourListe').onclick = () => switchView('decks');
    return;
  }
  if (!deckDetail) {
    el.innerHTML = `<div class="card"><p style="color:var(--muted);">Chargement…</p></div>`;
    return;
  }

  const d = deckDetail.deck;
  const res = monResultat(d);
  const estAuteur = window.accountUser && window.accountUser.id === d.auteur_id;
  // Un deck officiel ne porte pas son contenu en base : il est déjà installé.
  // L'aperçu se lit donc dans les données locales.
  const groupes = d.officiel
    ? DB.kanjiGroups.filter(g => g.semesterId === d.semester_id)
    : ((d.contenu && d.contenu.kanjiGroups) || []);
  const apercu = groupes.slice(0, 6);

  el.innerHTML = `
    <div class="pub-fil"><button class="lien-retour" id="btnRetourListe">← Tous les decks</button></div>

    <div class="deck-page-tete">
      <h2>${escapeHtml(d.titre)}</h2>
      <div class="deck-auteur">
        ${d.officiel
          ? `<span class="deck-officiel">Contenu officiel de KVT</span>`
          : `${window.kvtProfils ? window.kvtProfils.auteurHtml(d.auteur_id, d.pseudo, 28) : escapeHtml(d.pseudo)}
             <span class="deck-auteur-date">${dateCourte(d.created_at)}</span>`}
        ${(() => { const p = window.kvtProfils && window.kvtProfils.profilDe(d.auteur_id);
                   return p && p.niveau ? `<span class="deck-etiquette">${escapeHtml(window.kvtProfils.libelleNiveau(p.niveau))}</span>` : ''; })()}
      </div>
      <div class="deck-etiquettes">
        ${formatDeck(d).map(t => `<span class="deck-etiquette">${escapeHtml(t)}</span>`).join('')}
      </div>
      <p class="deck-description ${d.description ? '' : 'est-vide'}">${d.description ? escapeHtml(d.description) : "L'auteur n'a pas écrit de description."}</p>
      <div class="deck-page-actions">
        ${d.officiel
          ? `<button class="primary" id="btnReviserPage">Réviser</button>`
          : `<button class="primary" id="btnImporterPage" ${res ? 'disabled' : ''}>${res ? 'Déjà importé' : 'Importer ce deck'}</button>`}
        ${estAuteur && !d.officiel ? `
          <button class="secondary" id="btnMasquerPage">${d.visible === false ? 'Remettre en ligne' : 'Retirer de la liste'}</button>
          <button class="danger" id="btnSupprimerPage">Supprimer définitivement</button>` : ''}
      </div>
      <div class="deck-mesures deck-mesures--deux">
        <div class="deck-mesure">
          <span class="deck-mesure-titre">Ton meilleur résultat</span>
          <div class="deck-resultat">${res && res.best
            ? `<span class="deck-resultat-score">${res.best.pct}%</span><span class="deck-resultat-detail">${res.best.points}/${res.best.maxPoints} pts</span>`
            : `<span class="deck-resultat-vide">${res ? 'Importé, jamais révisé' : 'Aucun résultat'}</span>`}</div>
        </div>
        <div class="deck-mesure">
          <span class="deck-mesure-titre">Record de la communauté</span>
          <div class="deck-resultat">${htmlRecord(d)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="deck-section-titre">Aperçu</h3>
      ${apercu.length ? `
        <div class="deck-apercu">
          ${apercu.map(g => `
            <div class="deck-apercu-ligne">
              <span class="deck-apercu-kanji">${escapeHtml(g.kanji)}</span>
              <span class="deck-apercu-sens">${escapeHtml(g.titre || '')}</span>
              ${d.decoupage === 'bloc' ? '' : `<span class="deck-apercu-semaine">semaine ${g.week}</span>`}
            </div>`).join('')}
        </div>
        ${groupes.length > apercu.length ? `<p class="pub-aide">et ${groupes.length - apercu.length} autres kanji.</p>` : ''}`
        : `<p style="color:var(--muted);">Ce deck ne contient aucun kanji.</p>`}
    </div>

    <div class="card">
      <h3 class="deck-section-titre">Note</h3>
      ${estAuteur
        ? `<p style="color:var(--muted);">On ne note pas son propre deck.</p>`
        : (window.accountUser
            ? `<div class="avis-form-note">
                 <div class="deck-etoiles" id="avisEtoiles">
                   ${[1, 2, 3, 4, 5].map(i => `<span class="deck-etoile ${i <= monAvis.note ? 'est-pleine est-mienne' : ''}" data-valeur="${i}">★</span>`).join('')}
                 </div>
                 <span class="pub-aide">${monAvis.note ? `Ta note : ${monAvis.note}/5. Reclique la même étoile pour la retirer.` : 'Clique une étoile pour noter ce deck.'}</span>
               </div>`
            : `<p style="color:var(--muted);">Connecte-toi pour noter ce deck.</p>`)}
      <p class="pub-aide">${d.nb_notes
        ? `Moyenne : ${Number(d.note_moyenne).toFixed(1)} sur ${d.nb_notes} note${d.nb_notes > 1 ? 's' : ''}.`
        : 'Aucune note pour le moment.'}</p>
    </div>

    <div class="card">
      <div class="com-entete">
        <h3 class="deck-section-titre">Discussion${commentaires.length ? ` · ${commentaires.length}` : ''}</h3>
        ${commentaires.length > 1 ? `
          <div class="decks-filtres">
            <button class="deck-filtre ${triCommentaires === 'score' ? 'is-active' : ''}" data-tri-com="score">Les plus votés</button>
            <button class="deck-filtre ${triCommentaires === 'recents' ? 'is-active' : ''}" data-tri-com="recents">Les plus récents</button>
          </div>` : ''}
      </div>

      ${window.accountUser ? `
        <div class="com-nouveau">
          <textarea class="pub-champ pub-zone" data-brouillon="racine" rows="3" maxlength="4000" placeholder="Une question, une remarque sur ce deck…">${escapeHtml(brouillons.racine || '')}</textarea>
          <div class="pub-actions"><button class="primary" data-envoyer="racine">Commenter</button></div>
        </div>`
        : `<p style="color:var(--muted);">Connecte-toi pour participer à la discussion.</p>`}

      <div class="com-fil">
        ${commentaires.length
          ? arbreCommentaires().map(c => htmlCommentaire(c, 0, estAuteur)).join('')
          : `<p style="color:var(--muted);">Personne n'a encore rien écrit. Le premier commentaire est souvent celui qui lance la discussion.</p>`}
      </div>
    </div>`;

  $('#btnRetourListe').onclick = () => { decksCache = null; switchView('decks'); };

  const bImp = $('#btnImporterPage');
  if (bImp && !res) bImp.onclick = () => importerDeck(d.id, bImp, d.contenu);

  const bRev = $('#btnReviserPage');
  if (bRev) bRev.onclick = () => switchView('dashboard');

  const bMasq = $('#btnMasquerPage');
  if (bMasq) bMasq.onclick = () => masquerDeck(d.id, d.visible === false);

  const bSup = $('#btnSupprimerPage');
  if (bSup) bSup.onclick = () => supprimerDeck(d);

  const et = $('#avisEtoiles');
  if (et) $$('.deck-etoile', et).forEach(e => {
    e.onclick = async () => {
      lireBrouillons(el);
      await noterDeck(d.id, Number(e.dataset.valeur));
      await chargerDetail(d.id);
      renderDeck();
    };
  });

  $$('[data-tri-com]', el).forEach(b => {
    b.onclick = () => { lireBrouillons(el); triCommentaires = b.dataset.triCom; renderDeck(); };
  });
  $$('[data-vote]', el).forEach(b => {
    b.onclick = () => voter(b.dataset.vote, Number(b.dataset.valeur));
  });
  $$('[data-repondre]', el).forEach(b => {
    b.onclick = () => { lireBrouillons(el); reponseA = (reponseA === b.dataset.repondre) ? null : b.dataset.repondre; renderDeck(); };
  });
  $$('[data-annuler-reponse]', el).forEach(b => {
    b.onclick = () => { lireBrouillons(el); reponseA = null; renderDeck(); };
  });
  $$('[data-envoyer]', el).forEach(b => {
    b.onclick = () => { lireBrouillons(el); envoyerCommentaire(d.id, b.dataset.envoyer); };
  });
  $$('[data-supprimer-com]', el).forEach(b => {
    b.onclick = () => supprimerCommentaire(d.id, b.dataset.supprimerCom);
  });
}


// Le fil est redessiné entièrement à chaque interaction : sans cette
// sauvegarde, ouvrir une réponse effacerait un commentaire à moitié écrit.
function lireBrouillons(el) {
  $$('[data-brouillon]', el).forEach(z => { brouillons[z.dataset.brouillon] = z.value; });
}

async function voter(commentaireId, valeur) {
  if (!window.accountUser) { showToast('Connecte-toi pour voter.'); return; }
  const actuel = mesVotes[commentaireId] || 0;
  try {
    if (actuel === valeur) {
      const { error } = await window.sb.from('deck_commentaire_votes').delete()
        .eq('commentaire_id', commentaireId).eq('user_id', window.accountUser.id);
      if (error) throw error;
      delete mesVotes[commentaireId];
    } else {
      const { error } = await window.sb.from('deck_commentaire_votes')
        .upsert({ commentaire_id: commentaireId, user_id: window.accountUser.id, valeur },
                { onConflict: 'commentaire_id,user_id' });
      if (error) throw error;
      mesVotes[commentaireId] = valeur;
    }
    const { data } = await window.sb.from('deck_commentaires').select('id,score').eq('id', commentaireId).single();
    const c = commentaires.find(x => x.id === commentaireId);
    if (c && data) c.score = data.score;
    renderDeck();
  } catch (err) {
    showToast(err.message && err.message.includes('row-level security')
      ? 'On ne vote pas pour son propre commentaire.'
      : 'Vote impossible : ' + (err.message || err));
  }
}

async function envoyerCommentaire(deckId, cle) {
  const texte = (brouillons[cle] || '').trim();
  if (!texte) { showToast('Écris quelque chose avant d\'envoyer.'); return; }
  try {
    const ligne = { deck_id: deckId, user_id: window.accountUser.id, texte };
    if (cle !== 'racine') ligne.parent_id = cle;
    const { error } = await window.sb.from('deck_commentaires').insert(ligne);
    if (error) throw error;
    brouillons[cle] = '';
    reponseA = null;
    showToast('Commentaire publié');
    await chargerDetail(deckId);
    renderDeck();
  } catch (err) {
    showToast('Envoi impossible : ' + (err.message || err));
  }
}

async function supprimerCommentaire(deckId, id) {
  const c = commentaires.find(x => x.id === id);
  const reponses = commentaires.filter(x => x.parent_id === id).length;
  const message = reponses
    ? `Supprimer ce commentaire ?\n\nLes ${reponses} réponse(s) qu'il a reçues seront supprimées avec lui.`
    : 'Supprimer ce commentaire ?';
  if (!confirm(message)) return;
  try {
    const { error } = await window.sb.from('deck_commentaires').delete().eq('id', id);
    if (error) throw error;
    showToast('Commentaire supprimé');
    await chargerDetail(deckId);
    renderDeck();
  } catch (err) {
    showToast('Suppression impossible : ' + (err.message || err));
  }
}

// Deux gestes distincts, et il faut qu'ils le restent : masquer est
// réversible, supprimer ne l'est pas.
async function masquerDeck(id, remettre) {
  try {
    const { error } = await window.sb.from('decks').update({ visible: !!remettre }).eq('id', id);
    if (error) throw error;
    decksCache = null;
    showToast(remettre ? 'Deck remis en ligne' : 'Deck retiré de la liste');
    await chargerDetail(id);
    renderDeck();
  } catch (err) {
    showToast('Impossible : ' + (err.message || err));
  }
}

async function supprimerDeck(deck) {
  const attendu = 'SUPPRIMER';
  const saisi = prompt(
    `Supprimer définitivement « ${deck.titre} » ?\n\n` +
    `Le deck et tous ses avis disparaissent. Cette action est irréversible.\n` +
    `Les personnes qui l'ont déjà importé gardent leur copie.\n\n` +
    `Écris ${attendu} pour confirmer.`);
  if (saisi !== attendu) { showToast('Suppression annulée'); return; }
  try {
    const { error } = await window.sb.from('decks').delete().eq('id', deck.id);
    if (error) throw error;
    decksCache = null;
    deckOuvert = null;
    showToast('Deck supprimé');
    switchView('decks');
  } catch (err) {
    showToast('Suppression impossible : ' + (err.message || err));
  }
}

// ---------- Publication ----------

// Le contenu envoyé est réduit aux champs pédagogiques. Les identifiants
// locaux partent avec, mais ils seront réattribués à l'import : deux
// utilisateurs peuvent très bien avoir généré le même identifiant.
function contenuDuSemestre(semesterId, decoupage, plage) {
  let groupes = DB.kanjiGroups.filter(g => g.semesterId === semesterId);
  if (plage) {
    groupes = groupes.filter(g => {
      const w = Number(g.week) || 1;
      return w >= plage.debut && w <= plage.fin;
    });
  }
  // Les semaines sont renumérotées à partir de 1 : celui qui importe les
  // semaines 5 à 8 d'un semestre reçoit un deck de 4 semaines, pas un deck
  // qui commence à la semaine 5 avec quatre semaines vides devant.
  const decalage = plage ? plage.debut - 1 : 0;
  const ids = new Set(groupes.map(g => g.id));
  const mots = DB.vocab.filter(v => ids.has(v.kanjiGroupId));
  return {
    kanjiGroups: groupes.map(g => ({
      id: g.id,
      week: decoupage === 'bloc' ? 1 : Math.max(1, (Number(g.week) || 1) - decalage),
      kanji: g.kanji || '',
      titre: g.titre || '',
      onyomi: g.onyomi || '',
      kunyomi: g.kunyomi || '',
      bushu: g.bushu || '',
      phrase: g.phrase || '',
      traduction: g.traduction || '',
      memo: g.memo || ''
    })),
    vocab: mots.map(v => ({
      id: v.id,
      kanjiGroupId: v.kanjiGroupId,
      mot: v.mot || '',
      lecture: v.lecture || '',
      sens: v.sens || ''
    }))
  };
}

// Un titre qui cite un manuel est refusé avant même de partir. Ce n'est pas
// une protection sérieuse — on peut écrire n'importe quoi — mais ça arrête
// l'erreur de bonne foi, qui est le cas courant.
const MANUELS_CONNUS = ['genki', 'minna no nihongo', 'minna-no-nihongo', 'nihongo so-matome', 'so matome',
  'kanzen master', 'tobira', 'marugoto', 'shin kanzen', 'basic kanji book', 'remembering the kanji'];

function titreCiteUnManuel(titre) {
  const t = titre.toLowerCase();
  return MANUELS_CONNUS.find(m => t.includes(m)) || null;
}

async function publierDeck() {
  pubEtat.erreur = null;

  const titre = (pubEtat.titre || '').trim();
  if (titre.length < 3) { pubEtat.erreur = 'Donne un titre à ton deck (au moins 3 caractères).'; return renderPublier(); }

  const manuel = titreCiteUnManuel(titre);
  if (manuel) {
    pubEtat.erreur = `Le titre cite « ${manuel} ». Nomme ton deck par le cursus ou le niveau : « Semestre 2 — LLCER Japonais », « JLPT N4 — semaines 1 à 5 ».`;
    return renderPublier();
  }

  if (pubEtat.type === 'cursus' && !(pubEtat.cursus || '').trim()) {
    pubEtat.erreur = 'Indique le cursus, ou choisis « Un niveau JLPT ».';
    return renderPublier();
  }

  const dispo = semestresPubliables();
  const choisi = dispo.find(x => x.sem.id === pubEtat.semesterId);
  const contenu = contenuDuSemestre(pubEtat.semesterId, pubEtat.decoupage, plageRetenue(choisi));
  if (!contenu.kanjiGroups.length) {
    pubEtat.erreur = pubEtat.portee === 'plage'
      ? "Ces semaines ne contiennent aucun kanji. Choisis une autre plage."
      : 'Ce semestre est vide.';
    return renderPublier();
  }

  pubEtat.envoi = true;
  renderPublier();

  try {
    const { data, error } = await window.sb.rpc('publier_deck', {
      p_titre: titre,
      p_description: (pubEtat.description || '').trim(),
      p_type: pubEtat.type,
      p_cursus: (pubEtat.cursus || '').trim(),
      p_niveau: pubEtat.type === 'jlpt' ? pubEtat.niveau : '',
      p_decoupage: pubEtat.decoupage,
      p_contenu: contenu
    });
    if (error) throw error;

    pubEtat.envoi = false;
    pubEtat.titre = '';
    pubEtat.description = '';
    decksCache = null;
    showToast('Deck publié : ' + (data && data.titre ? data.titre : titre));
    switchView('decks');
  } catch (err) {
    pubEtat.envoi = false;
    pubEtat.erreur = (err && err.message) ? err.message : String(err);
    renderPublier();
  }
}

// Cliquer sur l'étoile déjà posée retire la note : c'est le seul geste
// naturel pour se rétracter, et ça évite un second bouton.
async function noterDeck(deckId, valeur) {
  if (!window.accountUser) { showToast('Connecte-toi pour noter un deck.'); return; }
  const actuelle = mesNotes[deckId] || 0;
  try {
    if (actuelle === valeur) {
      const { error } = await window.sb.from('deck_notes').delete()
        .eq('deck_id', deckId).eq('user_id', window.accountUser.id);
      if (error) throw error;
      delete mesNotes[deckId];
      showToast('Note retirée');
    } else {
      const { error } = await window.sb.from('deck_notes')
        .upsert({ deck_id: deckId, user_id: window.accountUser.id, note: valeur },
                { onConflict: 'deck_id,user_id' });
      if (error) throw error;
      mesNotes[deckId] = valeur;
      showToast('Note enregistrée');
    }
    // La moyenne est recalculée par la base : il faut la relire.
    const { data } = await window.sb.from('decks')
      .select('id,note_moyenne,nb_notes').eq('id', deckId).single();
    if (data && decksCache) {
      const d = decksCache.find(x => x.id === deckId);
      if (d) { d.note_moyenne = data.note_moyenne; d.nb_notes = data.nb_notes; }
    }
    renderDecks();
  } catch (err) {
    showToast('Note impossible : ' + (err.message || err));
  }
}

async function retirerDeck(id) {
  const deck = (decksCache || []).find(d => d.id === id);
  if (!deck) return;
  if (!confirm(`Retirer « ${deck.titre} » de la liste publique ?\n\nRien n'est supprimé : tu peux le remettre en ligne depuis sa page. Les personnes qui l'ont déjà importé gardent leur copie.`)) return;
  try {
    const { error } = await window.sb.from('decks').update({ visible: false }).eq('id', id);
    if (error) throw error;
    decksCache = null;
    showToast('Deck retiré de la liste');
    renderDecks();
  } catch (err) {
    showToast('Retrait impossible : ' + (err.message || err));
  }
}

// ---------- Import ----------

// Un import ne touche à rien de ce qui existe : il crée un semestre de plus.
// Tous les identifiants sont réattribués, sinon un identifiant du deck
// pourrait entrer en collision avec un identifiant local et faire disparaître
// des mots de l'utilisateur.
function fusionnerDeck(deck, contenu) {
  const semId = 'deck-' + deck.slug;
  const dejaLa = DB.settings.semesters.some(s => s.id === semId);
  if (dejaLa) return { ok: false, raison: 'Ce deck est déjà dans tes semestres.' };

  const semaines = deck.decoupage === 'bloc'
    ? 1
    : Math.max(1, contenu.kanjiGroups.reduce((m, g) => Math.max(m, Number(g.week) || 1), 1));

  const correspondance = new Map();
  const groupes = contenu.kanjiGroups.map(g => {
    const nouvel = uid('kg');
    correspondance.set(g.id, nouvel);
    return {
      id: nouvel,
      semesterId: semId,
      week: deck.decoupage === 'bloc' ? 1 : Math.min(semaines, Math.max(1, Number(g.week) || 1)),
      kanji: g.kanji || '',
      titre: g.titre || '',
      onyomi: g.onyomi || '',
      kunyomi: g.kunyomi || '',
      bushu: g.bushu || '',
      phrase: g.phrase || '',
      traduction: g.traduction || '',
      memo: g.memo || ''
    };
  });

  const mots = contenu.vocab
    .filter(v => correspondance.has(v.kanjiGroupId))
    .map(v => ({
      id: uid('v'),
      kanjiGroupId: correspondance.get(v.kanjiGroupId),
      mot: v.mot || '',
      lecture: v.lecture || '',
      sens: v.sens || ''
    }));

  DB.settings.semesters.push({ id: semId, label: deck.titre, weeks: semaines, importe: true, auteur: deck.pseudo });
  DB.kanjiGroups.push(...groupes);
  DB.vocab.push(...mots);

  return { ok: true, nbKanji: groupes.length, nbMots: mots.length };
}

async function importerDeck(id, bouton, contenuDejaLa) {
  const deck = (decksCache || []).find(d => d.id === id)
    || (deckDetail && deckDetail.deck.id === id ? deckDetail.deck : null);
  if (!deck) return;

  const libelle = bouton ? bouton.textContent : '';
  if (bouton) { bouton.disabled = true; bouton.textContent = 'Import…'; }

  try {
    let contenu = contenuDejaLa;
    if (!contenu) {
      const { data, error } = await window.sb
        .from('decks').select('contenu').eq('id', id).single();
      if (error) throw error;
      contenu = data && data.contenu;
    }
    if (!contenu || !Array.isArray(contenu.kanjiGroups)) {
      throw new Error('Le contenu de ce deck est illisible.');
    }

    const res = fusionnerDeck(deck, contenu);
    if (!res.ok) { showToast(res.raison); return; }

    await persist();
    showToast(`« ${deck.titre} » importé : ${res.nbKanji} kanji, ${res.nbMots} mots`);
    if (currentView === 'deck') renderDeck(); else renderDecks();
  } catch (err) {
    showToast('Import impossible : ' + (err.message || err));
  } finally {
    if (bouton) { bouton.disabled = false; bouton.textContent = libelle || 'Importer ce deck'; }
  }
}
