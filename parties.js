// parties.js — Salons multijoueur (28/09/2026, demande de Paul : "on vas
// commencé le projets des jeux"). Première version : uniquement le "jeu de
// la bombe" (façon patate chaude sur du vocabulaire), SANS mise de pièces
// (ajoutée plus tard une fois les salons et la partie stables -- choix de
// Paul, pour construire d'abord sur des bases solides). Voir 02 - Idées
// futures.md, entrée du 28/09/2026, pour l'idée d'origine (jeu de vitesse et
// jeu de dessin de kanji à la souris restent à faire, dans un futur salon du
// même système).
//
// Architecture : deux tables Supabase, `parties` (un salon, avec son état de
// jeu complet dans la colonne jsonb etat_jeu) et `parties_joueurs` (qui a
// rejoint). Le temps réel passe par Supabase Realtime (postgres_changes) sur
// ces deux tables : chaque client reçoit tous les changements et se contente
// de ré-afficher -- aucune logique de jeu ne tourne "sur un serveur" à part
// Postgres lui-même.
//
// Arbitrage du tour : pour éviter que deux clients écrivent en même temps la
// même transition, seul le joueur actif écrit quand IL répond, et seul
// L'HÔTE fait tourner un minuteur qui écrit la transition "explosion" en cas
// de temps écoulé. Limite connue et acceptée pour cette v1 : si l'hôte
// quitte l'onglet Parties pendant une partie en cours, plus personne ne
// détecte les explosions par temps écoulé tant qu'il n'est pas revenu (les
// réponses des autres joueurs continuent, elles, à fonctionner normalement).
// Une vraie résolution "sans autorité" (ex. via une fonction Postgres
// atomique) serait plus robuste mais inutile pour un jeu sans enjeu réel.

let partieCourante = null;      // ligne `parties` du salon où on se trouve, ou null
let joueursPartieCourante = []; // lignes `parties_joueurs` de ce salon
let partiesOuvertes = [];       // salons publics en attente, pour le navigateur
let canalPartie = null;         // canal Supabase Realtime abonné au salon courant
let enTraitementTourBombe = false;
let minuteurHotePartie = null;
let minuteurAffichagePartie = null;

const PARTIES_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I, ambigus
const PARTIES_TEMPS_TOUR_OPTIONS = [10000, 15000, 20000, 30000];
const PARTIES_VIES_OPTIONS = [1, 2, 3, 5];

function genererCodePartie() {
  let code = '';
  for (let i = 0; i < 5; i++) code += PARTIES_CODE_ALPHABET[Math.floor(Math.random() * PARTIES_CODE_ALPHABET.length)];
  return code;
}

// Pool de vocabulaire pour une partie : un semestre entier (toutes ses
// semaines) ou, si aucun choisi, tout le vocabulaire débloqué -- une seule
// semaine serait souvent trop courte pour un jeu à plusieurs joueurs qui
// tourne un moment.
function poolVocabPourPartie(config) {
  if (!config || !config.semesterId || config.semesterId === 'tout') {
    return DB.vocab.filter(v => !estMotMasque(v.id));
  }
  const groupIds = new Set(DB.kanjiGroups.filter(g => g.semesterId === config.semesterId).map(g => g.id));
  return DB.vocab.filter(v => groupIds.has(v.kanjiGroupId) && !estMotMasque(v.id));
}

// ---------------------------------------------------------------------------
// Chargement et abonnement temps réel
// ---------------------------------------------------------------------------

async function chargerPartiesOuvertes() {
  if (!window.sb || !window.accountUser) { partiesOuvertes = []; return; }
  const { data, error } = await window.sb
    .from('parties')
    .select('id, code, nom, jeu, config, hote_id, hote_pseudo, created_at, parties_joueurs(count)')
    .eq('prive', false)
    .eq('etat', 'attente')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) { partiesOuvertes = []; return; }
  partiesOuvertes = data || [];
}

async function chargerJoueursPartie(partieId) {
  const { data, error } = await window.sb
    .from('parties_joueurs')
    .select('id, user_id, pseudo, rejoint_at')
    .eq('partie_id', partieId)
    .order('rejoint_at', { ascending: true });
  if (error) return [];
  return data || [];
}

function seDesabonnerPartie() {
  if (canalPartie) {
    window.sb.removeChannel(canalPartie);
    canalPartie = null;
  }
}

function sabonnerPartie(partieId) {
  seDesabonnerPartie();
  canalPartie = window.sb.channel('partie-' + partieId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parties', filter: `id=eq.${partieId}` }, (payload) => {
      if (payload.eventType === 'DELETE') {
        showToast('Le salon a été fermé.');
        partieCourante = null;
        joueursPartieCourante = [];
        seDesabonnerPartie();
        arreterMinuteursPartie();
        renderParties();
        return;
      }
      partieCourante = payload.new;
      renderParties();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parties_joueurs', filter: `partie_id=eq.${partieId}` }, async () => {
      joueursPartieCourante = await chargerJoueursPartie(partieId);
      renderParties();
    })
    .subscribe();
}

function arreterMinuteursPartie() {
  if (minuteurHotePartie) { clearInterval(minuteurHotePartie); minuteurHotePartie = null; }
  if (minuteurAffichagePartie) { clearInterval(minuteurAffichagePartie); minuteurAffichagePartie = null; }
}

// ---------------------------------------------------------------------------
// Actions sur les salons
// ---------------------------------------------------------------------------

async function creerPartie(options) {
  if (!window.accountUser) { showToast('Connecte-toi pour créer un salon.'); return; }
  const config = {
    semesterId: options.semesterId || 'tout',
    tempsTourMs: options.tempsTourMs || 15000,
    vies: options.vies || 3
  };
  let derniereErreur = null;
  for (let essai = 0; essai < 5; essai++) {
    const code = genererCodePartie();
    const { data, error } = await window.sb
      .from('parties')
      .insert({
        code,
        jeu: 'bombe',
        hote_id: window.accountUser.id,
        hote_pseudo: window.accountUser.pseudo || null,
        nom: options.nom ? options.nom.slice(0, 60) : null,
        prive: !!options.prive,
        mot_de_passe: options.motDePasse || null,
        amis_uniquement: !!options.amisUniquement,
        config
      })
      .select()
      .single();
    if (!error) {
      const { error: erreurJoueur } = await window.sb.from('parties_joueurs').insert({
        partie_id: data.id,
        user_id: window.accountUser.id,
        pseudo: window.accountUser.pseudo || null
      });
      if (erreurJoueur) { showToast("Salon créé mais impossible d'y entrer, réessaie."); return; }
      partieCourante = data;
      joueursPartieCourante = await chargerJoueursPartie(data.id);
      sabonnerPartie(data.id);
      renderParties();
      return;
    }
    derniereErreur = error;
    if (error.code !== '23505') break; // autre chose qu'un code déjà pris : inutile de réessayer
  }
  showToast("Impossible de créer le salon pour l'instant.");
  console.error('creerPartie', derniereErreur);
}

async function rejoindrePartieParCode(codeBrut, motDePasseSaisi) {
  if (!window.accountUser) { showToast('Connecte-toi pour rejoindre un salon.'); return; }
  const code = (codeBrut || '').trim().toUpperCase();
  if (!code) { showToast('Entre un code de salon.'); return; }
  const { data, error } = await window.sb.from('parties').select('*').eq('code', code).maybeSingle();
  if (error || !data) { showToast('Aucun salon avec ce code.'); return; }
  await rejoindrePartie(data, motDePasseSaisi);
}

async function rejoindrePartieDepuisListe(partieId) {
  const { data, error } = await window.sb.from('parties').select('*').eq('id', partieId).maybeSingle();
  if (error || !data) { showToast("Ce salon n'existe plus."); await chargerPartiesOuvertes(); renderParties(); return; }
  await rejoindrePartie(data, null);
}

async function rejoindrePartie(ligne, motDePasseSaisi) {
  if (ligne.etat !== 'attente') { showToast('Cette partie a déjà commencé.'); return; }
  if (ligne.mot_de_passe && ligne.mot_de_passe !== motDePasseSaisi) {
    showToast('Mot de passe incorrect.');
    return;
  }
  const { error } = await window.sb.from('parties_joueurs').insert({
    partie_id: ligne.id,
    user_id: window.accountUser.id,
    pseudo: window.accountUser.pseudo || null
  });
  if (error && error.code !== '23505') { // 23505 = déjà dans le salon (reconnexion) : pas grave
    const refuseParRls = error.code === '42501' || /row-level security/i.test(error.message || '');
    showToast(refuseParRls ? "Ce salon est réservé aux amis de l'hôte." : 'Impossible de rejoindre ce salon.');
    return;
  }
  partieCourante = ligne;
  joueursPartieCourante = await chargerJoueursPartie(ligne.id);
  sabonnerPartie(ligne.id);
  renderParties();
}

async function quitterPartie() {
  if (!partieCourante) return;
  const id = partieCourante.id;
  const jeSuisHote = partieCourante.hote_id === window.accountUser.id;
  seDesabonnerPartie();
  arreterMinuteursPartie();
  partieCourante = null;
  joueursPartieCourante = [];
  renderParties();
  if (jeSuisHote) {
    await window.sb.from('parties').delete().eq('id', id); // supprime aussi parties_joueurs en cascade
  } else {
    await window.sb.from('parties_joueurs').delete().eq('partie_id', id).eq('user_id', window.accountUser.id);
  }
}

async function retirerJoueurPartie(userId) {
  if (!partieCourante || partieCourante.hote_id !== window.accountUser.id) return;
  await window.sb.from('parties_joueurs').delete().eq('partie_id', partieCourante.id).eq('user_id', userId);
}

async function demarrerPartieBombe() {
  if (!partieCourante || partieCourante.hote_id !== window.accountUser.id) return;
  if (joueursPartieCourante.length < 2) { showToast('Il faut au moins 2 joueurs pour commencer.'); return; }
  const pool = poolVocabPourPartie(partieCourante.config);
  if (pool.length < 5) { showToast('Pas assez de vocabulaire dans ce contenu pour jouer.'); return; }
  const ordre = shuffle(joueursPartieCourante.map(j => j.user_id));
  const poolIds = pool.map(v => v.id);
  const motActuelId = poolIds[Math.floor(Math.random() * poolIds.length)];
  const etatJeu = {
    ordre,
    joueurActifIndex: 0,
    vies: Object.fromEntries(ordre.map(uid => [uid, partieCourante.config.vies || 3])),
    poolIds,
    motActuelId,
    motsUtilisesIds: [motActuelId],
    finTourA: Date.now() + (partieCourante.config.tempsTourMs || 15000),
    vainqueurId: null,
    dernierResultat: null
  };
  const { error } = await window.sb.from('parties').update({ etat: 'en_cours', etat_jeu: etatJeu }).eq('id', partieCourante.id);
  if (error) showToast('Impossible de démarrer la partie.');
}

// Relance une nouvelle manche dans le même salon (mêmes joueurs, sans
// recréer de salon) -- pratique pour enchaîner entre amis.
async function rejouerPartieBombe() {
  if (!partieCourante || partieCourante.hote_id !== window.accountUser.id) return;
  await window.sb.from('parties').update({ etat: 'attente', etat_jeu: {} }).eq('id', partieCourante.id);
}

// ---------------------------------------------------------------------------
// Boucle du jeu de la bombe
// ---------------------------------------------------------------------------

async function soumettreReponseBombe(valeurBrute) {
  if (!partieCourante || partieCourante.etat !== 'en_cours') return;
  const ej = partieCourante.etat_jeu;
  const monId = window.accountUser.id;
  if (!ej || ej.ordre[ej.joueurActifIndex] !== monId) return; // pas mon tour
  const mot = DB.vocab.find(v => v.id === ej.motActuelId);
  if (!mot) return;
  const val = finaliserKana(valeurBrute || '', false);
  const resultat = scoreAnswer(val, mot.lecture);
  // Seuil strict (comme le badge "bon" du quiz normal, pct >= 0.99) : un jeu
  // à plusieurs doit juger tout le monde pareil, pas de tolérance floue ici.
  await appliquerTourBombe(resultat.pct >= 0.99 ? 'reussi' : 'rate');
}

async function appliquerTourBombe(issue) {
  if (enTraitementTourBombe || !partieCourante || partieCourante.etat !== 'en_cours') return;
  enTraitementTourBombe = true;
  try {
    const ej = partieCourante.etat_jeu;
    const ordre = ej.ordre.slice();
    const vies = { ...ej.vies };
    const indexActif = ej.joueurActifIndex;
    const joueurActifId = ordre[indexActif];
    if (issue !== 'reussi') vies[joueurActifId] = Math.max(0, (vies[joueurActifId] || 0) - 1);

    let nouvelOrdre = ordre;
    let nouvelIndex = indexActif;
    if (vies[joueurActifId] <= 0) {
      nouvelOrdre = ordre.filter(id => id !== joueurActifId);
      nouvelIndex = nouvelOrdre.length ? indexActif % nouvelOrdre.length : 0;
    } else {
      nouvelIndex = (indexActif + 1) % nouvelOrdre.length;
    }

    let nouvelEtatGlobal = 'en_cours';
    let vainqueurId = null;
    if (nouvelOrdre.length <= 1) {
      nouvelEtatGlobal = 'termine';
      vainqueurId = nouvelOrdre[0] || null;
    }

    let motsUtilisesIds = ej.motsUtilisesIds || [];
    const poolRestant = ej.poolIds.filter(id => !motsUtilisesIds.includes(id));
    const poolChoix = poolRestant.length ? poolRestant : ej.poolIds;
    if (!poolRestant.length) motsUtilisesIds = [];
    const motActuelId = poolChoix[Math.floor(Math.random() * poolChoix.length)];

    const nouvelEtatJeu = {
      ...ej,
      ordre: nouvelOrdre,
      joueurActifIndex: nouvelIndex,
      vies,
      motActuelId,
      motsUtilisesIds: [...motsUtilisesIds, motActuelId],
      finTourA: Date.now() + (partieCourante.config.tempsTourMs || 15000),
      vainqueurId,
      dernierResultat: { joueurId: joueurActifId, issue }
    };
    const { error } = await window.sb.from('parties').update({ etat_jeu: nouvelEtatJeu, etat: nouvelEtatGlobal }).eq('id', partieCourante.id);
    if (error) showToast('Erreur de synchronisation de la partie.');
  } finally {
    enTraitementTourBombe = false;
  }
}

function demarrerMinuteurHotePartie() {
  if (minuteurHotePartie) return;
  minuteurHotePartie = setInterval(() => {
    if (!partieCourante || partieCourante.etat !== 'en_cours') return;
    if (!window.accountUser || partieCourante.hote_id !== window.accountUser.id) return;
    const ej = partieCourante.etat_jeu;
    if (ej && ej.finTourA && Date.now() >= ej.finTourA) appliquerTourBombe('timeout');
  }, 400);
}

function demarrerMinuteurAffichagePartie() {
  if (minuteurAffichagePartie) return;
  minuteurAffichagePartie = setInterval(() => {
    const texte = $('#partieMinuteurTexte');
    const barre = $('#partieMinuteurBarre');
    if (!texte || !partieCourante || !partieCourante.etat_jeu || !partieCourante.etat_jeu.finTourA) return;
    const resteMs = Math.max(0, partieCourante.etat_jeu.finTourA - Date.now());
    texte.textContent = Math.ceil(resteMs / 1000) + 's';
    if (barre) {
      const total = (partieCourante.config && partieCourante.config.tempsTourMs) || 15000;
      barre.style.width = Math.max(0, Math.min(100, (resteMs / total) * 100)) + '%';
    }
  }, 200);
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function renderParties() {
  const el = $('#view-parties');
  if (!el) return;
  if (!window.accountUser) {
    el.innerHTML = `<div class="card"><h2>Parties</h2><p style="color:var(--muted);">Connecte-toi pour créer ou rejoindre un salon de jeu.</p></div>`;
    return;
  }
  if (!partieCourante) {
    arreterMinuteursPartie();
    renderPartiesAccueil(el);
  } else if (partieCourante.etat === 'attente') {
    arreterMinuteursPartie();
    renderPartieLobby(el);
  } else if (partieCourante.etat === 'en_cours') {
    renderPartieJeu(el);
  } else {
    arreterMinuteursPartie();
    renderPartieFin(el);
  }
}

function renderPartiesAccueil(el) {
  const options = (DB.settings.semesters || []).map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  el.innerHTML = `
    <div class="card">
      <h2>Parties</h2>
      <p style="color:var(--muted);">Jeu de la bombe : à tour de rôle, devine la lecture du mot affiché avant l'explosion. Le dernier survivant gagne. (Jeu de vitesse et jeu de dessin de kanji arriveront plus tard, dans ce même système de salons.)</p>
    </div>
    <div class="card">
      <h3>Rejoindre par code</h3>
      <div class="partie-actions">
        <input type="text" id="partieCodeInput" placeholder="Code du salon" maxlength="5" style="text-transform:uppercase; width:120px;">
        <input type="password" id="partieCodeMdp" placeholder="Mot de passe (si besoin)" style="width:200px;">
        <button class="primary" id="btnRejoindreParCode">Rejoindre</button>
      </div>
    </div>
    <div class="card">
      <h3>Créer un salon</h3>
      <div class="partie-form">
        <label>Nom du salon (optionnel)<input type="text" id="partieNomInput" maxlength="60" placeholder="Ex. Soirée jeu entre nous"></label>
        <label>Contenu<select id="partieSemestreInput"><option value="tout">Tout le vocabulaire débloqué</option>${options}</select></label>
        <label>Temps par tour<select id="partieTempsInput">${PARTIES_TEMPS_TOUR_OPTIONS.map(ms => `<option value="${ms}" ${ms === 15000 ? 'selected' : ''}>${ms / 1000} secondes</option>`).join('')}</select></label>
        <label>Vies par joueur<select id="partieViesInput">${PARTIES_VIES_OPTIONS.map(v => `<option value="${v}" ${v === 3 ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="partie-form__case"><input type="checkbox" id="partiePriveInput"> Salon privé (absent du navigateur de salons)</label>
        <label class="partie-form__case"><input type="checkbox" id="partieAmisInput"> Réservé à mes amis</label>
        <label>Mot de passe (optionnel)<input type="text" id="partieMdpInput" placeholder="Laisser vide = aucun"></label>
        <button class="primary" id="btnCreerPartie">Créer et entrer dans le salon</button>
      </div>
    </div>
    <div class="card">
      <h3>Salons ouverts</h3>
      <div id="partiesListeZone"><p style="color:var(--muted);">Chargement…</p></div>
    </div>`;

  $('#btnRejoindreParCode').onclick = () => {
    rejoindrePartieParCode($('#partieCodeInput').value, $('#partieCodeMdp').value);
  };
  $('#btnCreerPartie').onclick = () => {
    creerPartie({
      nom: $('#partieNomInput').value.trim(),
      semesterId: $('#partieSemestreInput').value,
      tempsTourMs: parseInt($('#partieTempsInput').value, 10),
      vies: parseInt($('#partieViesInput').value, 10),
      prive: $('#partiePriveInput').checked,
      amisUniquement: $('#partieAmisInput').checked,
      motDePasse: $('#partieMdpInput').value.trim() || null
    });
  };

  chargerPartiesOuvertes().then(() => {
    const zone = $('#partiesListeZone');
    if (!zone) return; // la vue a changé entre-temps
    if (!partiesOuvertes.length) {
      zone.innerHTML = `<p style="color:var(--muted);">Aucun salon public ouvert pour l'instant. Crée le tien !</p>`;
      return;
    }
    zone.innerHTML = partiesOuvertes.map(p => {
      const nbJoueurs = (p.parties_joueurs && p.parties_joueurs[0] && p.parties_joueurs[0].count) || 0;
      return `
        <div class="partie-liste-item">
          <div>
            <strong>${escapeHtml(p.nom || 'Salon sans nom')}</strong>
            <div style="color:var(--muted); font-size:12.5px;">Hébergé par ${escapeHtml(p.hote_pseudo || "quelqu'un")} · ${nbJoueurs} joueur${nbJoueurs > 1 ? 's' : ''} · code ${p.code}</div>
          </div>
          <button class="secondary small" data-rejoindre-partie="${p.id}">Rejoindre</button>
        </div>`;
    }).join('');
    $$('[data-rejoindre-partie]', zone).forEach(btn => {
      btn.onclick = () => rejoindrePartieDepuisListe(btn.dataset.rejoindrePartie);
    });
  });
}

function renderPartieLobby(el) {
  const jeSuisHote = partieCourante.hote_id === window.accountUser.id;
  const joueursHtml = joueursPartieCourante.map(j => `
    <div class="partie-joueur-chip">
      <span>${escapeHtml(j.pseudo || 'Joueur')}${j.user_id === partieCourante.hote_id ? ' 👑' : ''}</span>
      ${jeSuisHote && j.user_id !== window.accountUser.id ? `<button class="secondary small" data-retirer-joueur="${j.user_id}" title="Retirer du salon">✕</button>` : ''}
    </div>`).join('');
  el.innerHTML = `
    <div class="card">
      <h2>Salon : ${escapeHtml(partieCourante.nom || 'Sans nom')}</h2>
      <p style="color:var(--muted);">Code à partager : <strong>${partieCourante.code}</strong>${partieCourante.mot_de_passe ? ' · protégé par mot de passe' : ''}${partieCourante.amis_uniquement ? " · réservé aux amis de l'hôte" : ''}</p>
      <p style="color:var(--muted);">Jeu de la bombe · ${(partieCourante.config.tempsTourMs || 15000) / 1000}s par tour · ${partieCourante.config.vies || 3} vies</p>
      <h3>Joueurs (${joueursPartieCourante.length})</h3>
      <div class="partie-joueurs-liste">${joueursHtml}</div>
      <div class="partie-actions" style="margin-top:14px;">
        ${jeSuisHote ? `<button class="primary" id="btnDemarrerPartie">Démarrer la partie</button>` : `<p style="color:var(--muted);">En attente que l'hôte démarre la partie…</p>`}
        <button class="secondary" id="btnQuitterPartie">Quitter le salon</button>
      </div>
    </div>`;
  if (jeSuisHote) {
    $('#btnDemarrerPartie').onclick = () => demarrerPartieBombe();
    $$('[data-retirer-joueur]', el).forEach(btn => { btn.onclick = () => retirerJoueurPartie(btn.dataset.retirerJoueur); });
  }
  $('#btnQuitterPartie').onclick = () => quitterPartie();
}

function renderPartieJeu(el) {
  const ej = partieCourante.etat_jeu;
  if (!ej || !ej.ordre) { el.innerHTML = `<div class="card"><p style="color:var(--muted);">Préparation de la partie…</p></div>`; return; }
  const monId = window.accountUser.id;
  const monTour = ej.ordre[ej.joueurActifIndex] === monId;
  const mot = DB.vocab.find(v => v.id === ej.motActuelId);
  const pseudoDe = (uid) => {
    const j = joueursPartieCourante.find(x => x.user_id === uid);
    return (j && j.pseudo) || 'Joueur';
  };
  const viesHtml = ej.ordre.map((uid, i) => `
    <div class="partie-joueur-chip ${i === ej.joueurActifIndex ? 'partie-joueur-chip--actif' : ''}">
      <span>${escapeHtml(pseudoDe(uid))}${uid === monId ? ' (toi)' : ''}</span>
      <span class="partie-vies">${'❤️'.repeat(Math.max(0, ej.vies[uid] || 0))}</span>
    </div>`).join('');
  el.innerHTML = `
    <div class="card">
      <h2>💣 Jeu de la bombe</h2>
      <div class="partie-joueurs-liste">${viesHtml}</div>
      <div class="partie-minuteur">
        <div class="partie-minuteur-barre"><div class="partie-minuteur-barre__remplissage" id="partieMinuteurBarre"></div></div>
        <span id="partieMinuteurTexte" class="partie-minuteur-texte">…</span>
      </div>
      <div class="partie-mot-actif">${mot ? escapeHtml(mot.mot) : '…'}</div>
      ${monTour ? `
        <p><strong>À toi de jouer !</strong> Tape la lecture du mot avant l'explosion.</p>
        <div class="partie-actions">
          <input type="text" id="partieReponseInput" autocomplete="off" placeholder="Lecture (hiragana)" autofocus>
          <button class="primary" id="btnValiderReponsePartie">Valider</button>
        </div>` : `<p style="color:var(--muted);">Tour de ${escapeHtml(pseudoDe(ej.ordre[ej.joueurActifIndex]))}…</p>`}
      <div class="partie-actions" style="margin-top:14px;"><button class="secondary small" id="btnQuitterPartieJeu">Quitter la partie</button></div>
    </div>`;
  if (monTour) {
    const input = $('#partieReponseInput');
    activerSaisieKanaDirecte(input, false);
    input.focus();
    const valider = () => { const v = input.value; input.value = ''; input.disabled = true; soumettreReponseBombe(v); };
    $('#btnValiderReponsePartie').onclick = valider;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); });
  }
  $('#btnQuitterPartieJeu').onclick = () => quitterPartie();
  demarrerMinuteurAffichagePartie();
  if (partieCourante.hote_id === window.accountUser.id) demarrerMinuteurHotePartie();
}

function renderPartieFin(el) {
  const ej = partieCourante.etat_jeu || {};
  const jeSuisHote = partieCourante.hote_id === window.accountUser.id;
  const pseudoDe = (uid) => {
    const j = joueursPartieCourante.find(x => x.user_id === uid);
    return (j && j.pseudo) || 'Joueur';
  };
  const jaiGagne = ej.vainqueurId === window.accountUser.id;
  el.innerHTML = `
    <div class="card">
      <h2>Partie terminée</h2>
      <p>${ej.vainqueurId ? `🏆 ${escapeHtml(pseudoDe(ej.vainqueurId))} remporte la partie${jaiGagne ? ' — bravo !' : ''}` : 'Partie terminée.'}</p>
      <div class="partie-actions">
        ${jeSuisHote ? `<button class="primary" id="btnRejouerPartie">Rejouer avec le même salon</button>` : `<p style="color:var(--muted);">En attente que l'hôte relance une manche…</p>`}
        <button class="secondary" id="btnQuitterPartieFin">Quitter le salon</button>
      </div>
    </div>`;
  if (jeSuisHote) $('#btnRejouerPartie').onclick = () => rejouerPartieBombe();
  $('#btnQuitterPartieFin').onclick = () => quitterPartie();
}
