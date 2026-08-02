// ============================================================
// Amis : demander, accepter, retirer.
//
// La base ne garde qu'une ligne par paire, toujours rangée dans le même ordre
// (le plus petit identifiant d'abord). Ce fichier n'a donc jamais à se
// demander « qui a demandé à qui » pour retrouver une amitié : il compare, il
// range, il lit l'état.
// ============================================================

let amitiesCache = null;      // liste brute des lignes qui me concernent
let amisErreur = null;
let amisEnCours = false;
let amiRecherche = '';

async function chargerAmities() {
  if (!window.accountUser || !window.sb) { amitiesCache = []; return; }
  amisEnCours = true;
  amisErreur = null;
  try {
    const { data, error } = await window.sb
      .from('amities').select('a,b,demandeur,etat,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    amitiesCache = data || [];
    if (window.kvtProfils) {
      await window.kvtProfils.chargerProfils(amitiesCache.map(l => autreQueMoi(l)));
    }
  } catch (err) {
    amitiesCache = [];
    amisErreur = err && err.message ? err.message : String(err);
  } finally {
    amisEnCours = false;
  }
}

function autreQueMoi(ligne) {
  return ligne.a === window.accountUser.id ? ligne.b : ligne.a;
}

// Trois piles distinctes, et il faut qu'elles le restent : une demande reçue
// appelle une action, une demande envoyée n'appelle que de la patience.
function classerAmities() {
  const moi = window.accountUser ? window.accountUser.id : null;
  const tout = amitiesCache || [];
  return {
    amis: tout.filter(l => l.etat === 'acceptee'),
    recues: tout.filter(l => l.etat === 'en_attente' && l.demandeur !== moi),
    envoyees: tout.filter(l => l.etat === 'en_attente' && l.demandeur === moi)
  };
}

async function demanderAmi(pseudo) {
  const nom = (pseudo || '').trim();
  if (!nom) { showToast('Écris un pseudo.'); return; }
  try {
    const { data, error } = await window.sb.rpc('demander_ami', { p_pseudo: nom });
    if (error) throw error;
    const messages = {
      demandee: `Demande envoyée à ${nom}.`,
      acceptee: `${nom} t'avait déjà demandé : vous êtes amis.`,
      deja_ami: `Tu es déjà ami avec ${nom}.`,
      deja_demande: 'Demande déjà envoyée, en attente de réponse.',
      inconnu: `Aucun compte ne porte le pseudo « ${nom} ».`,
      soi_meme: 'C\'est toi.'
    };
    showToast(messages[data] || 'Demande envoyée.');
    if (data === 'demandee' || data === 'acceptee') {
      amiRecherche = '';
      amitiesCache = null;
      await chargerAmities();
    }
    renderAccountAmis();
  } catch (err) {
    showToast('Impossible : ' + (err.message || err));
  }
}

async function accepterAmi(ligne) {
  try {
    const { error } = await window.sb.from('amities')
      .update({ etat: 'acceptee' }).eq('a', ligne.a).eq('b', ligne.b);
    if (error) throw error;
    showToast('Demande acceptée');
    amitiesCache = null;
    await chargerAmities();
    renderAccountAmis();
  } catch (err) {
    showToast('Impossible : ' + (err.message || err));
  }
}

// Refuser une demande et retirer un ami sont la même opération en base — on
// supprime la ligne — mais pas le même geste pour la personne : seul le
// retrait d'un ami demande confirmation.
async function retirerAmitie(ligne, avecConfirmation) {
  const p = window.kvtProfils && window.kvtProfils.profilDe(autreQueMoi(ligne));
  const nom = (p && p.pseudo) || 'cette personne';
  if (avecConfirmation && !confirm(`Retirer ${nom} de tes amis ?`)) return;
  try {
    const { error } = await window.sb.from('amities')
      .delete().eq('a', ligne.a).eq('b', ligne.b);
    if (error) throw error;
    showToast(avecConfirmation ? 'Ami retiré' : 'Demande refusée');
    amitiesCache = null;
    await chargerAmities();
    renderAccountAmis();
  } catch (err) {
    showToast('Impossible : ' + (err.message || err));
  }
}

// ---------- Affichage, inséré dans l'onglet Compte ----------

function htmlPersonne(userId, actions) {
  const p = (window.kvtProfils && window.kvtProfils.profilDe(userId)) || {};
  const niveau = p.niveau && window.kvtProfils ? window.kvtProfils.libelleNiveau(p.niveau) : '';
  return `
    <div class="ami">
      ${window.kvtProfils ? window.kvtProfils.avatarHtml(userId, p.pseudo, 40) : ''}
      <div class="ami-infos">
        <div class="ami-pseudo">${escapeHtml(p.pseudo || 'Compte supprimé')}</div>
        ${niveau ? `<div class="ami-niveau">${escapeHtml(niveau)}</div>` : ''}
        ${p.bio ? `<div class="ami-bio">${escapeHtml(p.bio)}</div>` : ''}
      </div>
      <div class="ami-actions">${actions}</div>
    </div>`;
}

function htmlBlocAmis() {
  if (!window.accountUser) return '';

  if (amitiesCache === null) {
    return `<div class="card" id="carteAmis"><h3 class="deck-section-titre">Amis</h3>
      <p style="color:var(--muted);">Chargement…</p></div>`;
  }

  const { amis, recues, envoyees } = classerAmities();

  return `
    <div class="card" id="carteAmis">
      <h3 class="deck-section-titre">Amis${amis.length ? ` · ${amis.length}` : ''}</h3>

      <div class="ami-ajout">
        <input type="text" id="amiPseudo" class="pub-champ" maxlength="30"
          placeholder="Pseudo de la personne à ajouter" value="${escapeHtml(amiRecherche)}" />
        <button class="primary" id="btnDemanderAmi">Demander</button>
      </div>
      <p class="pub-aide">Il faut le pseudo exact. Si cette personne t'a déjà demandé, ta demande vaut acceptation.</p>

      ${amisErreur ? `<div class="pub-erreur">${escapeHtml(amisErreur)}</div>` : ''}

      ${recues.length ? `
        <h4 class="ami-section">Demandes reçues · ${recues.length}</h4>
        <div class="ami-liste">
          ${recues.map(l => htmlPersonne(autreQueMoi(l), `
            <button class="primary small" data-accepter="${l.a}|${l.b}">Accepter</button>
            <button class="secondary small" data-refuser="${l.a}|${l.b}">Refuser</button>`)).join('')}
        </div>` : ''}

      ${envoyees.length ? `
        <h4 class="ami-section">Demandes envoyées · ${envoyees.length}</h4>
        <div class="ami-liste">
          ${envoyees.map(l => htmlPersonne(autreQueMoi(l), `
            <span class="ami-attente">En attente</span>
            <button class="lien-retour" data-refuser="${l.a}|${l.b}">Annuler</button>`)).join('')}
        </div>` : ''}

      <h4 class="ami-section">Mes amis</h4>
      ${amis.length ? `
        <div class="ami-liste">
          ${amis.map(l => htmlPersonne(autreQueMoi(l), `
            <button class="lien-retour" data-retirer-ami="${l.a}|${l.b}">Retirer</button>`)).join('')}
        </div>`
        : `<p style="color:var(--muted);">Personne pour l'instant. Ajoute quelqu'un par son pseudo — c'est plus motivant de réviser en sachant que d'autres avancent aussi.</p>`}
    </div>`;
}

function ligneDepuisCle(cle) {
  const [a, b] = cle.split('|');
  return (amitiesCache || []).find(l => l.a === a && l.b === b);
}

function brancherBlocAmis() {
  const carte = $('#carteAmis');
  if (!carte) return;

  const champ = $('#amiPseudo');
  if (champ) {
    champ.oninput = () => { amiRecherche = champ.value; };
    champ.onkeydown = (e) => { if (e.key === 'Enter') demanderAmi(champ.value); };
  }
  const bouton = $('#btnDemanderAmi');
  if (bouton) bouton.onclick = () => demanderAmi(champ ? champ.value : '');

  $$('[data-accepter]', carte).forEach(b => {
    b.onclick = () => { const l = ligneDepuisCle(b.dataset.accepter); if (l) accepterAmi(l); };
  });
  $$('[data-refuser]', carte).forEach(b => {
    b.onclick = () => { const l = ligneDepuisCle(b.dataset.refuser); if (l) retirerAmitie(l, false); };
  });
  $$('[data-retirer-ami]', carte).forEach(b => {
    b.onclick = () => { const l = ligneDepuisCle(b.dataset.retirerAmi); if (l) retirerAmitie(l, true); };
  });
}

// Redessine la seule carte des amis, sans reconstruire tout l'onglet Compte :
// refaire renderAccount() effacerait la description en cours de frappe dans
// le bloc profil juste au-dessus.
function renderAccountAmis() {
  const carte = $('#carteAmis');
  if (!carte) return;
  carte.outerHTML = htmlBlocAmis();
  brancherBlocAmis();
}

window.kvtAmis = {
  chargerAmities, htmlBlocAmis, brancherBlocAmis, renderAccountAmis,
  classerAmities, autreQueMoi,
  reinitialiser() { amitiesCache = null; amisErreur = null; amiRecherche = ''; }
};
