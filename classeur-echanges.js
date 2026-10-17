// ---------- Revente, marché et échanges de cartes du Classeur (17/10/2026) ----------
// Demande de Paul : vendre et échanger des cartes de kanji.
//  - Revente à la boutique : seulement les DOUBLONS (on garde toujours un
//    exemplaire), prix fixe par rareté, volontairement bas pour qu'ouvrir des
//    coffres pour revendre ne rapporte jamais plus que ça ne coûte.
//  - Marché entre joueurs : on met un doublon en vente au prix voulu (la carte
//    quitte le classeur tout de suite), un autre joueur l'achète. Commission de
//    10 % sur la vente. Tout passe par des fonctions Supabase (tables
//    classeur_offres / classeur_transferts) : une offre ne peut être achetée
//    qu'une fois.
//  - Échange direct avec un ami : une de mes cartes (doublon) contre une carte
//    de son choix ; il accepte ou refuse.
// Les cartes et pièces reçues arrivent par une « boîte de transferts »
// (classeur_transferts) réclamée une seule fois par classeur_reclamer().

const CLASSEUR_PRIX_REVENTE = { 'commun': 4, 'peu-commun': 12, 'rare': 35, 'epique': 100, 'legendaire': 250 };
const CLASSEUR_COMMISSION_MARCHE = 0.1;
const CLASSEUR_PRIX_MAX = 1000000;

// ---------- Règles locales (pures, testées) ----------

function classeurNbCartes(k) {
  const etat = classeurEtat();
  return etat.kanji[k] || 0;
}

function classeurDoublonsDe(k) {
  return Math.max(0, classeurNbCartes(k) - 1);
}

function classeurRareteDeKanji(k) {
  const e = classeurTousLesKanji().find(x => x.k === k);
  return e ? e.rarete : null;
}

function classeurPrixReventeDe(k) {
  const r = classeurRareteDeKanji(k);
  return r ? CLASSEUR_PRIX_REVENTE[r] : 0;
}

// Liste [{ k, doublons, rarete, prix }] des kanji dont j'ai au moins 2 exemplaires,
// du plus rare au plus commun.
function classeurListeDoublons() {
  const etat = classeurEtat();
  const out = [];
  classeurTousLesKanji().forEach(e => {
    const n = etat.kanji[e.k] || 0;
    if (n > 1) out.push({ k: e.k, doublons: n - 1, rarete: e.rarete, prix: CLASSEUR_PRIX_REVENTE[e.rarete] });
  });
  return out.sort((a, b) => classeurIndexRarete(b.rarete) - classeurIndexRarete(a.rarete));
}

function classeurRetirerCarte(k, nb) {
  const etat = classeurEtat();
  const n = nb || 1;
  if ((etat.kanji[k] || 0) - n < 1) return false; // on garde toujours un exemplaire
  etat.kanji[k] -= n;
  return true;
}

function classeurAjouterCartes(k, nb) {
  const etat = classeurEtat();
  const n = (etat.kanji[k] || 0) + nb;
  if (n > 0) etat.kanji[k] = n; else delete etat.kanji[k];
}

// Revente à la boutique : retourne { ok, gain } ou { ok:false, motif }.
function classeurVendreBoutique(k, nb) {
  const n = Math.floor(nb || 1);
  if (!(n >= 1) || classeurDoublonsDe(k) < n) return { ok: false, motif: 'pas-assez-de-doublons' };
  const prix = classeurPrixReventeDe(k);
  if (!prix) return { ok: false, motif: 'kanji-inconnu' };
  const g = assurerGamification();
  classeurRetirerCarte(k, n);
  g.pieces = (g.pieces || 0) + prix * n;
  return { ok: true, gain: prix * n };
}

function classeurVendreTousDoublons() {
  let gain = 0, cartes = 0;
  classeurListeDoublons().forEach(d => {
    const r = classeurVendreBoutique(d.k, d.doublons);
    if (r.ok) { gain += r.gain; cartes += d.doublons; }
  });
  return { gain, cartes };
}

// Applique les lignes de la boîte de transferts au joueur. Jamais de solde ni de
// compteur négatif.
function classeurAppliquerTransferts(lignes) {
  const g = assurerGamification();
  let cartes = 0, pieces = 0;
  (lignes || []).forEach(l => {
    if (l.kanji && l.quantite) { classeurAjouterCartes(l.kanji, l.quantite); cartes += l.quantite; }
    if (l.pieces) { g.pieces = Math.max(0, (g.pieces || 0) + l.pieces); pieces += l.pieces; }
  });
  return { cartes, pieces };
}

function classeurPrixNetVendeur(prix) {
  return Math.floor(prix * (1 - CLASSEUR_COMMISSION_MARCHE));
}

// ---------- Accès Supabase ----------

let echMarche = [];
let echRecus = [];
let echEnvoyes = [];
let echAmis = [];
let echCharge = false;
let echEnCours = false;
let echReclamationEnCours = false;

function echMessageErreur(err) {
  const m = (err && err.message) || '';
  if (/offre-indisponible/.test(m)) return "Cette offre n'est plus disponible.";
  if (/trop-d-offres/.test(m)) return 'Tu as déjà 12 offres ouvertes.';
  if (/trop-d-echanges/.test(m)) return 'Tu as déjà 10 échanges en attente.';
  if (/pas-amis/.test(m)) return "Vous n'êtes pas amis.";
  if (/prix-invalide/.test(m)) return 'Prix invalide.';
  return 'Action impossible pour l\'instant, réessaie.';
}

async function classeurReclamer() {
  if (!window.accountUser || !window.sb || echReclamationEnCours) return null;
  echReclamationEnCours = true;
  try {
    const { data, error } = await window.sb.rpc('classeur_reclamer');
    if (error || !Array.isArray(data) || !data.length) return null;
    const r = classeurAppliquerTransferts(data);
    await persist();
    if (typeof renderTopbarProfil === 'function') renderTopbarProfil();
    const morceaux = [];
    if (r.cartes > 0) morceaux.push(`${r.cartes} carte${r.cartes > 1 ? 's' : ''}`);
    else if (r.cartes < 0) morceaux.push(`${-r.cartes} carte${r.cartes < -1 ? 's' : ''} donnée${r.cartes < -1 ? 's' : ''}`);
    if (r.pieces > 0) morceaux.push(`+${r.pieces} pièces`);
    else if (r.pieces < 0) morceaux.push(`${r.pieces} pièces`);
    if (morceaux.length) showToast('Marché et échanges : ' + morceaux.join(', ') + '.');
    return r;
  } catch (e) {
    return null;
  } finally {
    echReclamationEnCours = false;
  }
}

async function echChargerTout() {
  if (!window.accountUser || !window.sb) return;
  echEnCours = true;
  try {
    const [offres, echanges, amities] = await Promise.all([
      window.sb.from('classeur_offres').select('id, vendeur_id, vendeur_pseudo, kanji, prix, created_at').eq('etat', 'ouverte').order('created_at', { ascending: false }).limit(100),
      window.sb.from('classeur_echanges').select('id, de_id, vers_id, de_pseudo, vers_pseudo, kanji_donne, kanji_demande, created_at').eq('etat', 'en_attente').order('created_at', { ascending: false }),
      window.sb.from('amities').select('a, b').eq('etat', 'acceptee')
    ]);
    echMarche = (offres && offres.data) || [];
    const moi = window.accountUser.id;
    const ech = (echanges && echanges.data) || [];
    echRecus = ech.filter(e => e.vers_id === moi);
    echEnvoyes = ech.filter(e => e.de_id === moi);
    const ids = ((amities && amities.data) || []).map(l => (l.a === moi ? l.b : l.a));
    if (ids.length && window.kvtProfils) { try { await window.kvtProfils.chargerProfils(ids); } catch (e) { /* pseudos en repli */ } }
    echAmis = ids.map(id => ({ id, pseudo: ((window.kvtProfils && window.kvtProfils.profilDe(id)) || {}).pseudo || 'Ami' }));
    echCharge = true;
  } catch (e) {
    echCharge = true;
  } finally {
    echEnCours = false;
  }
}

async function classeurMettreEnVente(k, prix) {
  const p = Math.floor(Number(prix));
  if (!(p >= 1) || p > CLASSEUR_PRIX_MAX) { showToast('Prix invalide.'); return false; }
  if (classeurDoublonsDe(k) < 1) { showToast('Seuls les doublons peuvent être vendus.'); return false; }
  const { error } = await window.sb.rpc('classeur_mettre_en_vente', { p_kanji: k, p_prix: p });
  if (error) { showToast(echMessageErreur(error)); return false; }
  classeurRetirerCarte(k, 1);
  await persist();
  showToast(`${k} est en vente pour ${p} pièces.`);
  return true;
}

async function classeurAnnulerOffre(id) {
  const { data, error } = await window.sb.rpc('classeur_annuler_offre', { p_id: id });
  if (error || !data) { showToast(error ? echMessageErreur(error) : "L'offre n'est plus annulable."); return false; }
  await classeurReclamer();
  return true;
}

async function classeurAcheterOffre(offre) {
  const g = assurerGamification();
  if ((g.pieces || 0) < offre.prix) { showToast('Pas assez de pièces.'); return false; }
  const { error } = await window.sb.rpc('classeur_acheter', { p_id: offre.id });
  if (error) { showToast(echMessageErreur(error)); return false; }
  await classeurReclamer();
  return true;
}

async function classeurProposerEchange(versId, donne, demande) {
  if (classeurDoublonsDe(donne) < 1) { showToast('Seuls les doublons peuvent être échangés.'); return false; }
  if (!classeurTousLesKanji().some(e => e.k === demande)) { showToast('Ce kanji ne fait pas partie du Classeur.'); return false; }
  const { error } = await window.sb.rpc('classeur_proposer_echange', { p_vers: versId, p_donne: donne, p_demande: demande });
  if (error) { showToast(echMessageErreur(error)); return false; }
  classeurRetirerCarte(donne, 1); // la carte est mise de côté jusqu'à la réponse
  await persist();
  showToast('Proposition envoyée.');
  return true;
}

async function classeurRepondreEchange(echange, accepter) {
  if (accepter && classeurDoublonsDe(echange.kanji_demande) < 1) {
    showToast(`Il te faut un doublon de ${echange.kanji_demande} pour accepter.`);
    return false;
  }
  const { data, error } = await window.sb.rpc('classeur_repondre_echange', { p_id: echange.id, p_accepter: !!accepter });
  if (error || !data) { showToast(error ? echMessageErreur(error) : "Cette proposition n'existe plus."); return false; }
  await classeurReclamer();
  return true;
}

async function classeurAnnulerEchange(id) {
  const { data, error } = await window.sb.rpc('classeur_annuler_echange', { p_id: id });
  if (error || !data) { showToast(error ? echMessageErreur(error) : 'Déjà traité.'); return false; }
  await classeurReclamer();
  return true;
}

// ---------- Interface ----------

function echBadgeRarete(k) {
  const id = classeurRareteDeKanji(k);
  const r = id ? classeurRarete(id) : null;
  return r ? `<span class="classeur-badge" style="background:${r.couleur}">${escapeHtml(r.nom)}</span>` : '';
}

function echCarte(k, extra) {
  const id = classeurRareteDeKanji(k);
  const r = id ? classeurRarete(id) : CLASSEUR_RARETES[0];
  return `<span class="ech-carte" style="--r:${r.couleur}"><b>${escapeHtml(k)}</b>${extra ? `<small>${extra}</small>` : ''}</span>`;
}

function classeurHtmlEchanges() {
  if (!window.accountUser) {
    return `<h3 class="boutique-section__titre">Vendre et échanger</h3><div class="card"><p style="color:var(--muted);">Connecte-toi pour vendre et échanger tes cartes.</p></div>`;
  }
  const g = assurerGamification();
  const doublons = classeurListeDoublons();
  const totalRevente = doublons.reduce((s, d) => s + d.prix * d.doublons, 0);
  const moi = window.accountUser.id;
  const mesOffres = echMarche.filter(o => o.vendeur_id === moi);
  const offresAutres = echMarche.filter(o => o.vendeur_id !== moi);
  const optDoublons = doublons.map(d => `<option value="${escapeHtml(d.k)}">${escapeHtml(d.k)} · ${escapeHtml(classeurRarete(d.rarete).nom)} · ×${d.doublons + 1}</option>`).join('');

  const revente = `
    <details class="card ech-bloc" open>
      <summary><b>Revente à la boutique</b> <span class="ech-aide">tes doublons contre des pièces (tu gardes toujours 1 exemplaire)</span></summary>
      ${doublons.length ? `
        <div class="ech-liste">${doublons.map(d => `
          <div class="ech-ligne">
            ${echCarte(d.k, '×' + (d.doublons + 1))}
            <span class="ech-ligne__texte">${echBadgeRarete(d.k)} <span class="ech-aide">${d.doublons} doublon${d.doublons > 1 ? 's' : ''}</span></span>
            <button class="secondary small" data-ech-vendre="${escapeHtml(d.k)}">Vendre 1 · +${d.prix} ${iconePiece(12)}</button>
            ${d.doublons > 1 ? `<button class="secondary small" data-ech-vendre-tout="${escapeHtml(d.k)}">Les ${d.doublons} · +${d.prix * d.doublons}</button>` : ''}
          </div>`).join('')}</div>
        <div class="partie-actions" style="margin-top:10px;"><button class="primary" id="btnVendreTousDoublons">Vendre tous mes doublons · +${totalRevente} ${iconePiece(14)}</button></div>`
        : '<p class="ech-aide">Tu n\'as aucun doublon pour l\'instant : ouvre des coffres !</p>'}
      <p class="ech-aide">Prix de revente : ${CLASSEUR_RARETES.map(r => `${escapeHtml(r.nom)} ${CLASSEUR_PRIX_REVENTE[r.id]}`).join(' · ')}.</p>
    </details>`;

  const marche = `
    <details class="card ech-bloc" open>
      <summary><b>Marché entre joueurs</b> <span class="ech-aide">commission de ${Math.round(CLASSEUR_COMMISSION_MARCHE * 100)} % sur les ventes</span></summary>
      <h4>Mettre un doublon en vente</h4>
      ${doublons.length ? `
        <div class="ech-form">
          <select id="echVenteKanji">${optDoublons}</select>
          <input type="number" id="echVentePrix" min="1" max="${CLASSEUR_PRIX_MAX}" step="1" placeholder="Prix en pièces" inputmode="numeric">
          <button class="primary" id="btnMettreEnVente">Mettre en vente</button>
        </div>
        <p class="ech-aide" id="echVenteAide"></p>` : '<p class="ech-aide">Il te faut un doublon pour vendre.</p>'}
      ${mesOffres.length ? `<h4>Mes offres</h4><div class="ech-liste">${mesOffres.map(o => `
        <div class="ech-ligne">${echCarte(o.kanji)}<span class="ech-ligne__texte">${echBadgeRarete(o.kanji)} <b>${o.prix}</b> ${iconePiece(12)} <span class="ech-aide">(tu reçois ${classeurPrixNetVendeur(o.prix)})</span></span>
        <button class="secondary small" data-ech-annuler-offre="${o.id}">Retirer</button></div>`).join('')}</div>` : ''}
      <h4>Offres des joueurs <button class="secondary small" id="btnEchRafraichir">Actualiser</button></h4>
      ${!echCharge ? '<p class="ech-aide">Chargement…</p>' : offresAutres.length ? `<div class="ech-liste">${offresAutres.map(o => {
        const deja = classeurNbCartes(o.kanji);
        const trop = (g.pieces || 0) < o.prix;
        return `<div class="ech-ligne">${echCarte(o.kanji, deja ? 'tu en as ' + deja : 'nouveau !')}<span class="ech-ligne__texte">${echBadgeRarete(o.kanji)} <span class="ech-aide">par ${escapeHtml(o.vendeur_pseudo || 'Joueur')}</span></span>
          <button class="primary small" data-ech-acheter="${o.id}" ${trop ? 'disabled' : ''}>${o.prix} ${iconePiece(12)}</button></div>`;
      }).join('')}</div>` : '<p class="ech-aide">Aucune offre pour l\'instant.</p>'}
    </details>`;

  const echanges = `
    <details class="card ech-bloc" open>
      <summary><b>Échanges avec mes amis</b> <span class="ech-aide">un doublon contre la carte de ton choix</span></summary>
      ${echRecus.length ? `<h4>Propositions reçues</h4><div class="ech-liste">${echRecus.map(e => {
        const peut = classeurDoublonsDe(e.kanji_demande) >= 1;
        return `<div class="ech-ligne"><span class="ech-ligne__texte"><b>${escapeHtml(e.de_pseudo || 'Ami')}</b> te donne ${echCarte(e.kanji_donne)} contre ${echCarte(e.kanji_demande, peut ? 'tu as un doublon' : 'pas de doublon')}</span>
          <button class="primary small" data-ech-accepter="${e.id}" ${peut ? '' : 'disabled'}>Accepter</button>
          <button class="secondary small" data-ech-refuser="${e.id}">Refuser</button></div>`;
      }).join('')}</div>` : ''}
      ${echEnvoyes.length ? `<h4>Propositions envoyées</h4><div class="ech-liste">${echEnvoyes.map(e => `
        <div class="ech-ligne"><span class="ech-ligne__texte">À <b>${escapeHtml(e.vers_pseudo || 'Ami')}</b> : ${echCarte(e.kanji_donne)} contre ${echCarte(e.kanji_demande)}</span>
        <button class="secondary small" data-ech-annuler-echange="${e.id}">Annuler</button></div>`).join('')}</div>` : ''}
      <h4>Proposer un échange</h4>
      ${!echAmis.length ? '<p class="ech-aide">Ajoute des amis (onglet Compte) pour échanger des cartes.</p>'
        : !doublons.length ? '<p class="ech-aide">Il te faut un doublon à proposer.</p>' : `
        <div class="ech-form">
          <select id="echAmi">${echAmis.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.pseudo)}</option>`).join('')}</select>
          <label class="ech-champ">Je donne<select id="echDonne">${optDoublons}</select></label>
          <label class="ech-champ">Je demande<input type="text" id="echDemande" maxlength="2" placeholder="Un kanji, ex. 桜" autocomplete="off"></label>
          <button class="primary" id="btnProposerEchange">Proposer</button>
        </div>`}
    </details>`;

  return `<h3 class="boutique-section__titre">Vendre et échanger</h3><div id="classeurEchanges">${revente}${marche}${echanges}</div>`;
}

function classeurEchangesRerendre() {
  const bloc = $('#classeurEchanges');
  if (!bloc || !bloc.parentNode) return;
  const parent = bloc.parentNode;
  const tmp = document.createElement('div');
  tmp.innerHTML = classeurHtmlEchanges();
  const nouveau = tmp.querySelector('#classeurEchanges');
  if (nouveau) { parent.replaceChild(nouveau, bloc); classeurEchangesBrancher(parent); }
}

async function echApres(action) {
  await action;
  if (typeof renderTopbarProfil === 'function') renderTopbarProfil();
  await echChargerTout();
  echDerniereCharge = Date.now();
  if (typeof currentView !== 'undefined' && currentView === 'classeur' && typeof renderClasseur === 'function') renderClasseur();
}

function classeurEchangesBrancher(container) {
  $$('[data-ech-vendre]', container).forEach(b => {
    b.onclick = async () => {
      const r = classeurVendreBoutique(b.dataset.echVendre, 1);
      if (!r.ok) { showToast('Impossible de vendre cette carte.'); return; }
      await persist();
      showToast(`+${r.gain} pièces`);
      if (typeof renderTopbarProfil === 'function') renderTopbarProfil();
      renderClasseur();
    };
  });
  $$('[data-ech-vendre-tout]', container).forEach(b => {
    b.onclick = async () => {
      const k = b.dataset.echVendreTout;
      const r = classeurVendreBoutique(k, classeurDoublonsDe(k));
      if (!r.ok) return;
      await persist();
      showToast(`+${r.gain} pièces`);
      if (typeof renderTopbarProfil === 'function') renderTopbarProfil();
      renderClasseur();
    };
  });
  const tous = $('#btnVendreTousDoublons', container);
  if (tous) tous.onclick = async () => {
    const r = classeurVendreTousDoublons();
    if (!r.cartes) return;
    await persist();
    showToast(`${r.cartes} carte${r.cartes > 1 ? 's' : ''} vendue${r.cartes > 1 ? 's' : ''} : +${r.gain} pièces`);
    if (typeof renderTopbarProfil === 'function') renderTopbarProfil();
    renderClasseur();
  };

  const selK = $('#echVenteKanji', container), inPrix = $('#echVentePrix', container), aide = $('#echVenteAide', container);
  const majAide = () => {
    if (!selK || !aide) return;
    const ref = classeurPrixReventeDe(selK.value);
    const p = Math.floor(Number(inPrix.value));
    aide.textContent = p >= 1 ? `Tu recevras ${classeurPrixNetVendeur(p)} pièces (commission de 10 %). Revente boutique : ${ref}.` : `Revente boutique : ${ref} pièces. Fixe un prix plus attractif pour les autres joueurs.`;
  };
  if (selK) { selK.onchange = majAide; inPrix.oninput = majAide; majAide(); }
  const bv = $('#btnMettreEnVente', container);
  if (bv) bv.onclick = () => { bv.disabled = true; echApres(classeurMettreEnVente(selK.value, inPrix.value)); };
  $$('[data-ech-annuler-offre]', container).forEach(b => { b.onclick = () => { b.disabled = true; echApres(classeurAnnulerOffre(Number(b.dataset.echAnnulerOffre))); }; });
  $$('[data-ech-acheter]', container).forEach(b => {
    b.onclick = () => {
      const o = echMarche.find(x => x.id === Number(b.dataset.echAcheter));
      if (!o) return;
      b.disabled = true;
      echApres(classeurAcheterOffre(o));
    };
  });
  const rafr = $('#btnEchRafraichir', container);
  if (rafr) rafr.onclick = () => echApres(Promise.resolve());

  const bp = $('#btnProposerEchange', container);
  if (bp) bp.onclick = () => {
    const demande = ($('#echDemande', container).value || '').trim();
    if (!demande) { showToast('Indique le kanji que tu veux.'); return; }
    bp.disabled = true;
    echApres(classeurProposerEchange($('#echAmi', container).value, $('#echDonne', container).value, Array.from(demande)[0]));
  };
  $$('[data-ech-accepter]', container).forEach(b => { b.onclick = () => { const e = echRecus.find(x => x.id === Number(b.dataset.echAccepter)); if (e) { b.disabled = true; echApres(classeurRepondreEchange(e, true)); } }; });
  $$('[data-ech-refuser]', container).forEach(b => { b.onclick = () => { const e = echRecus.find(x => x.id === Number(b.dataset.echRefuser)); if (e) { b.disabled = true; echApres(classeurRepondreEchange(e, false)); } }; });
  $$('[data-ech-annuler-echange]', container).forEach(b => { b.onclick = () => { b.disabled = true; echApres(classeurAnnulerEchange(Number(b.dataset.echAnnulerEchange))); }; });
}

// Appelé par renderClasseur() : récupère d'abord les transferts en attente,
// puis charge le marché et les échanges (au plus une fois toutes les 30 s).
let echDerniereCharge = 0;
async function classeurEchangesInit(force) {
  if (!window.accountUser || echEnCours) return;
  if (!force && Date.now() - echDerniereCharge < 30000) return;
  echDerniereCharge = Date.now();
  const r = await classeurReclamer();
  await echChargerTout();
  if (typeof currentView === 'undefined' || currentView !== 'classeur') return;
  if (r && typeof renderClasseur === 'function') renderClasseur(); else classeurEchangesRerendre();
}
