// ============================================================
// Mises à jour : ce que les gens proposent, ce qui est prévu, ce qui est fait.
//
// Deux natures dans la même liste : une idée d'amélioration et un défaut à
// corriger. La frontière est floue en pratique — « le texte est illisible »
// est autant l'un que l'autre — donc on ne force personne à choisir la bonne
// case, on affiche juste laquelle a été cochée.
//
// Pas de vote négatif ici, contrairement aux commentaires de decks : on ne
// fait pas voter contre l'idée de quelqu'un. On soutient, ou on ne dit rien.
// ============================================================

let majListe = null;
let majErreur = null;
let majEnCours = false;
let mesSoutiens = new Set();
let majFiltre = 'tout';       // 'tout' | 'ouverte' | 'prevu' | 'fait'
let majTri = 'soutiens';      // 'soutiens' | 'recents'
let majFormOuvert = false;
let majForm = { type: 'idee', titre: '', texte: '', envoi: false, erreur: null };

const STATUTS = {
  ouverte:  { libelle: 'Proposé',    classe: 'maj-statut--ouverte' },
  a_letude: { libelle: "À l'étude",  classe: 'maj-statut--etude' },
  prevu:    { libelle: 'Prévu',      classe: 'maj-statut--prevu' },
  fait:     { libelle: 'Fait',       classe: 'maj-statut--fait' },
  ecarte:   { libelle: 'Écarté',     classe: 'maj-statut--ecarte' }
};

// Seul le compte qui tient le projet voit les outils de modération. Ce n'est
// qu'un confort d'affichage : c'est la base qui refuse un changement de
// statut venant de quelqu'un d'autre.
function estModerateur() {
  return !!(window.accountUser && window.accountUser.isAdmin);
}

async function chargerMaj() {
  if (!window.sb) { majErreur = "La connexion au serveur n'est pas disponible."; return; }
  majEnCours = true;
  majErreur = null;
  try {
    const { data, error } = await window.sb
      .from('suggestions')
      .select('id,auteur_id,pseudo,type,titre,texte,statut,reponse,score,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    majListe = data || [];

    mesSoutiens = new Set();
    if (window.accountUser && majListe.length) {
      const { data: votes } = await window.sb
        .from('suggestion_votes').select('suggestion_id').eq('user_id', window.accountUser.id);
      (votes || []).forEach(v => mesSoutiens.add(v.suggestion_id));
    }
    if (window.kvtProfils) {
      await window.kvtProfils.chargerProfils(majListe.map(s => s.auteur_id));
    }
  } catch (err) {
    majListe = [];
    majErreur = err && err.message ? err.message : String(err);
  } finally {
    majEnCours = false;
  }
}

function majVisibles() {
  let liste = (majListe || []).slice();
  if (majFiltre === 'ouverte') liste = liste.filter(s => s.statut === 'ouverte' || s.statut === 'a_letude');
  else if (majFiltre === 'prevu') liste = liste.filter(s => s.statut === 'prevu');
  else if (majFiltre === 'fait') liste = liste.filter(s => s.statut === 'fait');

  if (majTri === 'soutiens') {
    liste.sort((a, b) => (b.score - a.score) || String(b.created_at).localeCompare(String(a.created_at)));
  } else {
    liste.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  // Ce qui est écarté descend toujours en bas : c'est une information, pas
  // une proposition à soutenir.
  liste.sort((a, b) => (a.statut === 'ecarte' ? 1 : 0) - (b.statut === 'ecarte' ? 1 : 0));
  return liste;
}

function compteurs() {
  const l = majListe || [];
  return {
    tout: l.length,
    ouverte: l.filter(s => s.statut === 'ouverte' || s.statut === 'a_letude').length,
    prevu: l.filter(s => s.statut === 'prevu').length,
    fait: l.filter(s => s.statut === 'fait').length
  };
}

// ---------- Affichage ----------

function htmlSuggestion(s) {
  const st = STATUTS[s.statut] || STATUTS.ouverte;
  const soutenu = mesSoutiens.has(s.id);
  const aMoi = window.accountUser && window.accountUser.id === s.auteur_id;
  return `
    <article class="maj ${s.statut === 'ecarte' ? 'est-ecartee' : ''}">
      <button class="maj-soutien ${soutenu ? 'est-actif' : ''}" data-soutenir="${s.id}"
        aria-label="${soutenu ? 'Retirer mon soutien' : 'Soutenir cette proposition'}">
        <span class="maj-soutien-fleche">▲</span>
        <span class="maj-soutien-nombre">${s.score}</span>
      </button>
      <div class="maj-corps">
        <div class="maj-tete">
          <span class="maj-statut ${st.classe}">${st.libelle}</span>
          <span class="maj-type">${s.type === 'probleme' ? 'À corriger' : 'Idée'}</span>
          <h3 class="maj-titre">${escapeHtml(s.titre)}</h3>
        </div>
        ${s.texte ? `<p class="maj-texte">${escapeHtml(s.texte)}</p>` : ''}
        <div class="maj-pied">
          ${window.kvtProfils ? window.kvtProfils.auteurHtml(s.auteur_id, s.pseudo, 20) : escapeHtml(s.pseudo)}
          <span class="maj-date">${dateCourte(s.created_at)}</span>
          ${aMoi ? `<button class="com-action" data-supprimer-maj="${s.id}">Supprimer</button>` : ''}
        </div>
        ${s.reponse ? `
          <div class="maj-reponse">
            <span class="maj-reponse-marque">Réponse de KVT</span>
            <p>${escapeHtml(s.reponse)}</p>
          </div>` : ''}
        ${estModerateur() ? `
          <div class="maj-moderation">
            <select data-statut="${s.id}">
              ${Object.keys(STATUTS).map(k => `<option value="${k}" ${s.statut === k ? 'selected' : ''}>${STATUTS[k].libelle}</option>`).join('')}
            </select>
            <button class="com-action" data-repondre-maj="${s.id}">Répondre</button>
          </div>` : ''}
      </div>
    </article>`;
}

function renderMaj() {
  const el = $('#view-maj');
  if (!el) return;

  if (majListe === null && !majEnCours) {
    chargerMaj().then(() => { if (currentView === 'maj') renderMaj(); });
  }

  const c = compteurs();
  const liste = majVisibles();

  el.innerHTML = `
    <div class="decks-head">
      <div>
        <h2>Mises à jour</h2>
        <p class="decks-sous-titre">Ce que les gens proposent, ce qui est prévu, ce qui est fait. Une idée qui rassemble des soutiens passe devant.</p>
      </div>
      ${window.accountUser
        ? `<button class="primary" id="btnOuvrirFormMaj">${majFormOuvert ? 'Annuler' : 'Proposer quelque chose'}</button>`
        : `<span class="decks-note">Connecte-toi pour proposer</span>`}
    </div>

    ${majFormOuvert && window.accountUser ? `
      <div class="card pub-form">
        <div class="pub-label">De quoi s'agit-il ?</div>
        <div class="pub-choix">
          <button class="pub-option ${majForm.type === 'idee' ? 'is-active' : ''}" data-type-maj="idee">Une idée</button>
          <button class="pub-option ${majForm.type === 'probleme' ? 'is-active' : ''}" data-type-maj="probleme">Quelque chose à corriger</button>
        </div>

        <label class="pub-label" for="majTitre">En une phrase</label>
        <input type="text" id="majTitre" class="pub-champ" maxlength="140" placeholder="Pouvoir écrire ses propres mémos sur un kanji" value="${escapeHtml(majForm.titre)}" />

        <label class="pub-label" for="majTexte">Détails</label>
        <textarea id="majTexte" class="pub-champ pub-zone" rows="4" maxlength="4000"
          placeholder="Ce que tu voudrais, et pourquoi. S'il s'agit d'un défaut : ce que tu faisais, ce qui s'est passé, ce que tu attendais.">${escapeHtml(majForm.texte)}</textarea>

        ${majForm.erreur ? `<div class="pub-erreur">${escapeHtml(majForm.erreur)}</div>` : ''}
        <div class="pub-actions">
          <button class="primary" id="btnEnvoyerMaj" ${majForm.envoi ? 'disabled' : ''}>${majForm.envoi ? 'Envoi…' : 'Envoyer'}</button>
          <span class="pub-aide">Regarde d'abord si quelqu'un l'a déjà proposé : mieux vaut soutenir que répéter.</span>
        </div>
      </div>` : ''}

    <div class="decks-barre">
      <div class="decks-filtres">
        ${[['tout', 'Tout', c.tout], ['ouverte', 'Proposé', c.ouverte], ['prevu', 'Prévu', c.prevu], ['fait', 'Fait', c.fait]]
          .map(([v, lib, n]) => `<button class="deck-filtre ${majFiltre === v ? 'is-active' : ''}" data-filtre-maj="${v}">${lib}${n ? ` · ${n}` : ''}</button>`).join('')}
      </div>
      <label class="decks-tri-label" for="majTri">Trier par</label>
      <select id="majTri" class="decks-tri">
        <option value="soutiens" ${majTri === 'soutiens' ? 'selected' : ''}>Les plus soutenus</option>
        <option value="recents" ${majTri === 'recents' ? 'selected' : ''}>Les plus récents</option>
      </select>
    </div>

    ${majErreur ? `<div class="card"><p>Impossible de charger : ${escapeHtml(majErreur)}</p></div>` : ''}

    ${majEnCours && majListe === null
      ? `<div class="card"><p style="color:var(--muted);">Chargement…</p></div>`
      : (liste.length
          ? `<div class="maj-liste">${liste.map(htmlSuggestion).join('')}</div>`
          : `<div class="card"><p style="color:var(--muted);">${(majListe || []).length
              ? "Rien dans cette catégorie pour l'instant."
              : "Personne n'a encore rien proposé. Si quelque chose te manque ou t'agace dans KVT, c'est ici que ça se dit."}</p></div>`)}`;

  const bOuvrir = $('#btnOuvrirFormMaj');
  if (bOuvrir) bOuvrir.onclick = () => { lireFormMaj(); majFormOuvert = !majFormOuvert; majForm.erreur = null; renderMaj(); };

  $$('[data-type-maj]', el).forEach(b => {
    b.onclick = () => { lireFormMaj(); majForm.type = b.dataset.typeMaj; renderMaj(); };
  });
  const bEnv = $('#btnEnvoyerMaj');
  if (bEnv) bEnv.onclick = () => { lireFormMaj(); envoyerSuggestion(); };

  $$('[data-filtre-maj]', el).forEach(b => {
    b.onclick = () => { lireFormMaj(); majFiltre = b.dataset.filtreMaj; renderMaj(); };
  });
  const tri = $('#majTri');
  if (tri) tri.onchange = () => { lireFormMaj(); majTri = tri.value; renderMaj(); };

  $$('[data-soutenir]', el).forEach(b => { b.onclick = () => soutenir(b.dataset.soutenir); });
  $$('[data-supprimer-maj]', el).forEach(b => { b.onclick = () => supprimerSuggestion(b.dataset.supprimerMaj); });
  $$('[data-statut]', el).forEach(sel => { sel.onchange = () => changerStatut(sel.dataset.statut, sel.value); });
  $$('[data-repondre-maj]', el).forEach(b => { b.onclick = () => repondre(b.dataset.repondreMaj); });
}

// Le formulaire est redessiné à chaque interaction : sans cette sauvegarde,
// changer de filtre effacerait une proposition à moitié écrite.
function lireFormMaj() {
  const t = $('#majTitre'), x = $('#majTexte');
  if (t) majForm.titre = t.value;
  if (x) majForm.texte = x.value;
}

// ---------- Écriture ----------

async function envoyerSuggestion() {
  majForm.erreur = null;
  const titre = (majForm.titre || '').trim();
  if (titre.length < 5) { majForm.erreur = 'Résume ta proposition en une phrase (au moins 5 caractères).'; return renderMaj(); }

  majForm.envoi = true;
  renderMaj();
  try {
    const { error } = await window.sb.from('suggestions').insert({
      auteur_id: window.accountUser.id,
      type: majForm.type,
      titre,
      texte: (majForm.texte || '').trim()
    });
    if (error) throw error;
    majForm = { type: 'idee', titre: '', texte: '', envoi: false, erreur: null };
    majFormOuvert = false;
    majListe = null;
    showToast('Proposition envoyée');
    await chargerMaj();
  } catch (err) {
    majForm.envoi = false;
    majForm.erreur = (err && err.message) ? err.message : String(err);
  }
  renderMaj();
}

async function soutenir(id) {
  if (!window.accountUser) { showToast('Connecte-toi pour soutenir une proposition.'); return; }
  const dejaLa = mesSoutiens.has(id);
  try {
    if (dejaLa) {
      const { error } = await window.sb.from('suggestion_votes').delete()
        .eq('suggestion_id', id).eq('user_id', window.accountUser.id);
      if (error) throw error;
      mesSoutiens.delete(id);
    } else {
      const { error } = await window.sb.from('suggestion_votes')
        .insert({ suggestion_id: id, user_id: window.accountUser.id });
      if (error) throw error;
      mesSoutiens.add(id);
    }
    // Le score est recalculé par la base : il faut le relire.
    const { data } = await window.sb.from('suggestions').select('id,score').eq('id', id).single();
    const s = (majListe || []).find(x => x.id === id);
    if (s && data) s.score = data.score;
    renderMaj();
  } catch (err) {
    showToast('Impossible : ' + (err.message || err));
  }
}

async function supprimerSuggestion(id) {
  const s = (majListe || []).find(x => x.id === id);
  if (!s) return;
  if (!confirm(`Supprimer « ${s.titre} » ?\n\nLes soutiens reçus disparaissent avec.`)) return;
  try {
    const { error } = await window.sb.from('suggestions').delete().eq('id', id);
    if (error) throw error;
    majListe = null;
    showToast('Proposition supprimée');
    await chargerMaj();
    renderMaj();
  } catch (err) {
    showToast('Suppression impossible : ' + (err.message || err));
  }
}

// Réservé à la modération. La base refuse ces deux écritures à quelqu'un
// d'autre : ici on ne fait que proposer les commandes.
async function changerStatut(id, statut) {
  try {
    const { error } = await window.sb.rpc('maj_statut', { p_id: id, p_statut: statut });
    if (error) throw error;
    const s = (majListe || []).find(x => x.id === id);
    if (s) s.statut = statut;
    showToast('Statut mis à jour');
    renderMaj();
  } catch (err) {
    showToast('Impossible : ' + (err.message || err));
  }
}

async function repondre(id) {
  const s = (majListe || []).find(x => x.id === id);
  if (!s) return;
  const texte = prompt('Réponse publique (laisse vide pour retirer la réponse) :', s.reponse || '');
  if (texte === null) return;
  try {
    const { error } = await window.sb.rpc('maj_reponse', { p_id: id, p_reponse: texte.trim() });
    if (error) throw error;
    s.reponse = texte.trim();
    showToast('Réponse enregistrée');
    renderMaj();
  } catch (err) {
    showToast('Impossible : ' + (err.message || err));
  }
}

window.kvtMaj = {
  chargerMaj, majVisibles, compteurs, htmlSuggestion,
  reinitialiser() { majListe = null; mesSoutiens = new Set(); majErreur = null; }
};
