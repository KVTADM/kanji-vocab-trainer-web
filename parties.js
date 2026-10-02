// parties.js — Salons multijoueur (28/09/2026, demande de Paul : "on vas
// commencé le projets des jeux"). Première version : uniquement le "jeu de
// la bombe" (façon patate chaude sur du vocabulaire), SANS mise de pièces
// (ajoutée plus tard une fois les salons et la partie stables -- choix de
// Paul, pour construire d'abord sur des bases solides). Voir 02 - Idées
// futures.md, entrée du 28/09/2026, pour l'idée d'origine (jeu de vitesse et
// jeu de dessin de kanji à la souris restent à faire, dans un futur salon du
// même système). Mis à jour le 02/10/2026 : quatre jeux (bombe, duel éclair,
// relais des mots, dessin de kanji), sélection de semaines, écrans dans
// parties-ui.js, nouveaux jeux dans parties-jeux.js.
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
const PARTIES_RELAIS_TEMPS_OPTIONS = [15000, 20000, 30000, 45000];
const PARTIES_DUEL_MANCHES_OPTIONS = [5, 10, 15];
const PARTIES_DUEL_TEMPS_OPTIONS = [5000, 10000, 15000, 20000];
const PARTIES_DESSIN_TEMPS_OPTIONS = [45000, 60000, 90000];

// Les jeux disponibles dans un salon (02/10/2026). `pool` : le jeu utilise la
// sélection de semaines ; le Relais prend tout le vocabulaire, sans choix.
const PARTIES_JEUX = {
  bombe: { nom: 'Jeu de la bombe', icone: '💣', min: 2, max: 10, pool: true, resume: "À tour de rôle, devine la lecture du mot avant l'explosion. Le dernier survivant gagne." },
  duel: { nom: 'Duel éclair', icone: '⚡', min: 2, max: 2, pool: true, resume: 'Même mot pour les deux joueurs : le plus rapide à donner la bonne lecture marque le point.' },
  relais: { nom: 'Relais des mots', icone: '🔗', min: 2, max: 10, pool: false, resume: "Trouve un mot qui commence par le dernier kanji du mot précédent. 3 vies, tout le vocabulaire." },
  dessin: { nom: 'Dessin de kanji', icone: '✏️', min: 2, max: 10, pool: true, resume: 'Chacun son tour dessine un mot ; les autres devinent sa lecture le plus vite possible.' }
};

// Sélection de semaines du formulaire de création : clés « semestre:semaine ».
let selectionSemainesForm = new Set();

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
  // Sélection semaine par semaine (02/10/2026) : config.selection = ['s1:3', 's1:4', ...].
  if (config && Array.isArray(config.selection) && config.selection.length) {
    const cles = new Set(config.selection);
    const groupIds = new Set(DB.kanjiGroups.filter(g => cles.has(g.semesterId + ':' + g.week)).map(g => g.id));
    return DB.vocab.filter(v => groupIds.has(v.kanjiGroupId) && !estMotMasque(v.id));
  }
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
      // Les nouveaux jeux numérotent leur état (v) : on ignore un message
      // arrivé en retard, plus ancien que ce qu'on affiche déjà.
      const vNouveau = payload.new.etat_jeu && payload.new.etat_jeu.v;
      const vActuel = partieCourante && partieCourante.etat_jeu && partieCourante.etat_jeu.v;
      if (typeof vNouveau === 'number' && typeof vActuel === 'number' && vNouveau < vActuel) return;
      partieCourante = payload.new;
      renderParties();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parties_joueurs', filter: `partie_id=eq.${partieId}` }, async () => {
      joueursPartieCourante = await chargerJoueursPartie(partieId);
      renderParties();
      if (typeof jeuxGererDeparts === 'function') jeuxGererDeparts();
    })
    .on('broadcast', { event: 'trait' }, (m) => { if (typeof dessinRecevoir === 'function') dessinRecevoir('trait', m.payload); })
    .on('broadcast', { event: 'annuler' }, (m) => { if (typeof dessinRecevoir === 'function') dessinRecevoir('annuler', m.payload); })
    .on('broadcast', { event: 'effacer' }, (m) => { if (typeof dessinRecevoir === 'function') dessinRecevoir('effacer', m.payload); })
    .on('broadcast', { event: 'demande' }, (m) => { if (typeof dessinRecevoir === 'function') dessinRecevoir('demande', m.payload); })
    .on('broadcast', { event: 'sync' }, (m) => { if (typeof dessinRecevoir === 'function') dessinRecevoir('sync', m.payload); })
    .subscribe();
}

function arreterMinuteursPartie() {
  if (minuteurHotePartie) { clearInterval(minuteurHotePartie); minuteurHotePartie = null; }
  if (minuteurAffichagePartie) { clearInterval(minuteurAffichagePartie); minuteurAffichagePartie = null; }
  if (typeof arreterTickJeux === 'function') arreterTickJeux();
}

// ---------------------------------------------------------------------------
// Actions sur les salons
// ---------------------------------------------------------------------------

// Réglages propres à chaque jeu, tels qu'ils sont enregistrés dans parties.config.
function configPartiePourJeu(jeu, o) {
  const selection = PARTIES_JEUX[jeu].pool && Array.isArray(o.selection) && o.selection.length ? o.selection.slice() : null;
  if (jeu === 'duel') return { semesterId: 'tout', selection, manches: o.manches || 10, tempsMs: o.tempsMs || 10000 };
  if (jeu === 'relais') return { tempsTourMs: o.tempsTourMs || 20000 };
  if (jeu === 'dessin') return { semesterId: 'tout', selection, tempsMs: o.tempsMs || 60000 };
  return { semesterId: o.semesterId || 'tout', selection, tempsTourMs: o.tempsTourMs || 15000, vies: o.vies || 3 };
}

async function creerPartie(options) {
  if (!window.accountUser) { showToast('Connecte-toi pour créer un salon.'); return; }
  const jeu = PARTIES_JEUX[options.jeu] ? options.jeu : 'bombe';
  const config = configPartiePourJeu(jeu, options);
  let derniereErreur = null;
  for (let essai = 0; essai < 5; essai++) {
    const code = genererCodePartie();
    const { data, error } = await window.sb
      .from('parties')
      .insert({
        code,
        jeu,
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
  const max = (PARTIES_JEUX[ligne.jeu] || PARTIES_JEUX.bombe).max;
  const dedans = await chargerJoueursPartie(ligne.id);
  if (dedans.length >= max && !dedans.some(j => j.user_id === window.accountUser.id)) { showToast('Ce salon est complet.'); return; }
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

// Démarre le jeu du salon, quel qu'il soit.
async function demarrerPartie() {
  if (!partieCourante) return;
  if (partieCourante.jeu === 'bombe' || !partieCourante.jeu) return demarrerPartieBombe();
  return demarrerPartieJeu();
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
    const total = (partieCourante.config && partieCourante.config.tempsTourMs) || 15000;
    if (barre) barre.style.width = Math.max(0, Math.min(100, (resteMs / total) * 100)) + '%';
    if (typeof majMecheBombe === 'function') majMecheBombe(resteMs / total);
  }, 200);
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

// Chaque mise à jour du salon reconstruit la vue : on garde ce qu'un joueur
// était en train de taper (champs marqués data-garde) et le focus.
function sauvegarderSaisiesParties(el) {
  const sauve = {};
  el.querySelectorAll('input[data-garde]').forEach(i => {
    sauve[i.id] = { valeur: i.value, focus: document.activeElement === i, debut: i.selectionStart, fin: i.selectionEnd };
  });
  return sauve;
}

function restaurerSaisiesParties(el, sauve) {
  Object.keys(sauve).forEach(id => {
    const i = el.querySelector('#' + id);
    if (!i || i.disabled) return;
    if (sauve[id].valeur) i.value = sauve[id].valeur;
    if (sauve[id].focus) { i.focus(); try { i.setSelectionRange(sauve[id].debut, sauve[id].fin); } catch (e) { /* champ sans sélection */ } }
  });
}

function renderParties() {
  const el = $('#view-parties');
  if (!el) return;
  const sauve = (typeof document !== 'undefined' && el.querySelectorAll) ? sauvegarderSaisiesParties(el) : {};
  renderPartiesVue(el);
  if (el.querySelectorAll) restaurerSaisiesParties(el, sauve);
}

function renderPartiesVue(el) {
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

// Les écrans (accueil, salon, bombe, fin) sont dans parties-ui.js ; les jeux Duel, Relais et Dessin dans parties-jeux.js.
