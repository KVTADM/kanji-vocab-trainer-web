// parties-jeux.js — Nouveaux jeux des salons (02/10/2026, demande de Paul) :
// Duel éclair (2 joueurs), Relais des mots (2-10), Dessin de kanji (2-10).
// Le salon, les joueurs et le temps réel restent dans parties.js ; ici : la
// logique de chaque jeu (fonctions PURES, testées dans tests/parties-jeux.test.js)
// et leur affichage.
//
// Principes communs (différents de la bombe, qui date de la v1) :
//  - L'état de la partie (etat_jeu) porte un numéro de version `v`. Toute
//    écriture passe par ecrireEtatJeu() : « mets à jour SI la version est
//    encore celle que j'ai lue ». Deux joueurs qui répondent en même temps ne
//    s'écrasent donc jamais -- le second relit l'état et réessaie.
//  - Les mots à jouer sont copiés DANS l'état (mot, lectures, sens) : tous les
//    joueurs voient la même chose même si leurs comptes n'ont pas le même
//    vocabulaire débloqué.
//  - Le temps est compté en LOCAL à partir du moment où chaque client voit
//    changer de phase (phaseId), pas avec l'horloge de l'appareil qui a écrit :
//    deux téléphones mal réglés ne faussent donc pas le compte à rebours.
//  - Quand le temps d'une phase est écoulé, N'IMPORTE QUEL joueur peut faire
//    avancer la partie (l'hôte en premier, les autres après un petit délai) ;
//    le contrôle de version empêche l'avance en double. Plus de dépendance à
//    l'hôte comme pour la bombe.
//  - Les tracés du jeu de dessin passent par Supabase Realtime « broadcast »
//    (jamais écrits en base) ; seul le score va dans etat_jeu.
//  - Limite connue et acceptée (jeu sans enjeu) : le mot à dessiner est dans
//    l'état, donc lisible par un joueur qui ouvrirait les outils du navigateur.

const JEUX_RE_KANJI = /[㐀-鿿々]/;
const DUEL_COMPTE_MS = 1500;
const DUEL_RESULTAT_MS = 2600;
const DUEL_NB_MOTS = 30;           // mots tirés d'avance (manches normales + départage)
const DESSIN_REVELE_MS = 4500;
const RELAIS_VIES = 3;
const RELAIS_HISTORIQUE_MAX = 8;

let jeuxPhaseVue = { cle: null, t0: 0 };
let jeuxTick = null;
let jeuxAvanceEnCours = false;

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

function jeuxEstKanji(c) { return JEUX_RE_KANJI.test(c); }

function jeuxContientKanji(mot) { return JEUX_RE_KANJI.test(mot || ''); }

function jeuxDernierKanji(mot) {
  for (let i = (mot || '').length - 1; i >= 0; i--) if (jeuxEstKanji(mot[i])) return mot[i];
  return null;
}

function jeuxCleMot(entree) { return entree.mot + '|' + entree.lecture; }

// Entrées {mot, lecture, sens} sans doublon exact, à partir du vocabulaire.
function jeuxEntreesDepuisVocab(vocab) {
  const vues = new Set();
  const out = [];
  for (const v of vocab) {
    if (!v.mot || !v.lecture) continue;
    const e = { mot: v.mot, lecture: v.lecture, sens: v.sens || '' };
    const k = jeuxCleMot(e);
    if (vues.has(k)) continue;
    vues.add(k);
    out.push(e);
  }
  return out;
}

// Tire n mots DIFFÉRENTS (par écriture) ; chaque mot garde toutes ses lectures
// possibles pour accepter la bonne réponse même s'il en a plusieurs.
function jeuxTirerMots(entrees, n, filtre) {
  const parMot = new Map();
  for (const e of entrees) {
    if (filtre && !filtre(e)) continue;
    if (!parMot.has(e.mot)) parMot.set(e.mot, { mot: e.mot, lectures: [], sens: e.sens });
    const m = parMot.get(e.mot);
    if (!m.lectures.includes(e.lecture)) m.lectures.push(e.lecture);
  }
  return shuffle(Array.from(parMot.values())).slice(0, n);
}

function jeuxLectureCorrecte(saisie, lectures) {
  const val = finaliserKana(String(saisie || ''), false).replace(/\s+/g, '');
  if (!val) return false;
  return lectures.some(l => scoreAnswer(val, l).pct >= 0.99);
}

function jeuxPseudoDe(uid) {
  const j = joueursPartieCourante.find(x => x.user_id === uid);
  return (j && j.pseudo) || 'Joueur';
}

// ---------------------------------------------------------------------------
// Écriture atomique de l'état
// ---------------------------------------------------------------------------

// mutation(copieDeEtatJeu, partie) -> nouvel etat_jeu, ou null pour renoncer.
async function ecrireEtatJeu(mutation) {
  for (let essai = 0; essai < 5; essai++) {
    const p = partieCourante;
    if (!p) return false;
    const ej = JSON.parse(JSON.stringify(p.etat_jeu || {}));
    const v = ej.v || 0;
    const nouvel = mutation(ej, p);
    if (!nouvel) return false;
    nouvel.v = v + 1;
    const patch = { etat_jeu: nouvel };
    if (nouvel.termine) patch.etat = 'termine';
    const { data, error } = await window.sb.from('parties').update(patch).eq('id', p.id).eq('etat_jeu->>v', String(v)).select();
    if (error) { showToast('Erreur de synchronisation de la partie.'); return false; }
    if (data && data.length) {
      partieCourante = data[0];
      renderParties();
      return true;
    }
    // Quelqu'un a écrit avant nous : on relit l'état frais et on réessaie.
    const { data: frais } = await window.sb.from('parties').select('*').eq('id', p.id).maybeSingle();
    if (!frais) return false;
    partieCourante = frais;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Phases et temps (communs aux trois jeux)
// ---------------------------------------------------------------------------

function jeuxDureePhase(ej) {
  if (!ej || !ej.jeu || ej.termine) return 0;
  if (ej.jeu === 'duel') return ej.phase === 'compte' ? DUEL_COMPTE_MS : ej.phase === 'question' ? ej.dureeMs : ej.phase === 'resultat' ? DUEL_RESULTAT_MS : 0;
  if (ej.jeu === 'relais') return ej.phase === 'tour' ? ej.dureeMs : 0;
  if (ej.jeu === 'dessin') return ej.phase === 'dessin' ? ej.dureeMs : ej.phase === 'revele' ? DESSIN_REVELE_MS : 0;
  return 0;
}

function jeuxSynchroPhase(ej) {
  const cle = (partieCourante ? partieCourante.id : '') + ':' + ej.phaseId;
  if (jeuxPhaseVue.cle !== cle) jeuxPhaseVue = { cle, t0: Date.now() };
}

function jeuxResteMs(ej) {
  jeuxSynchroPhase(ej);
  return Math.max(0, jeuxDureePhase(ej) - (Date.now() - jeuxPhaseVue.t0));
}

function jeuxFinPhase(ej) {
  if (ej.jeu === 'duel') return duelFinPhase(ej);
  if (ej.jeu === 'relais') return relaisFinPhase(ej);
  if (ej.jeu === 'dessin') return dessinFinPhase(ej);
  return null;
}

// Délai avant qu'un joueur prenne le relais pour faire avancer la phase :
// l'hôte tout de suite, les autres par rang, pour éviter les écritures en double.
function jeuxDelaiPriorite() {
  if (!partieCourante || !window.accountUser) return 0;
  if (partieCourante.hote_id === window.accountUser.id) return 0;
  const rang = Math.max(1, joueursPartieCourante.findIndex(j => j.user_id === window.accountUser.id) + 1);
  return 1200 + rang * 500;
}

async function jeuxAvancerPhase(phaseId) {
  await ecrireEtatJeu((ej) => (ej.phaseId !== phaseId ? null : jeuxFinPhase(ej)));
}

function demarrerTickJeux() {
  if (jeuxTick) return;
  jeuxTick = setInterval(tickJeux, 250);
}

function arreterTickJeux() {
  if (jeuxTick) { clearInterval(jeuxTick); jeuxTick = null; }
}

function tickJeux() {
  const p = partieCourante;
  if (!p || p.etat !== 'en_cours' || !p.etat_jeu || !p.etat_jeu.jeu) return;
  const ej = p.etat_jeu;
  const duree = jeuxDureePhase(ej);
  if (!duree) return;
  const reste = jeuxResteMs(ej);
  const texte = $('#partieMinuteurTexte');
  const barre = $('#partieMinuteurBarre');
  if (texte) texte.textContent = Math.ceil(reste / 1000) + 's';
  if (barre) barre.style.width = Math.max(0, Math.min(100, (reste / duree) * 100)) + '%';
  if (ej.jeu === 'dessin') dessinMajIndice(ej, reste);
  const depasse = Date.now() - (jeuxPhaseVue.t0 + duree);
  if (reste <= 0 && depasse >= jeuxDelaiPriorite() && !jeuxAvanceEnCours) {
    jeuxAvanceEnCours = true;
    jeuxAvancerPhase(ej.phaseId).finally(() => { jeuxAvanceEnCours = false; });
  }
}

// Départ d'un joueur en pleine partie : on ne bloque pas les autres.
function jeuxRetirerAbsents(ej, presents) {
  if (ej.jeu === 'duel') {
    const restants = ej.joueurs.filter(u => presents.includes(u));
    if (restants.length === ej.joueurs.length || ej.termine) return null;
    return { ...ej, phase: 'fin', termine: true, vainqueurId: restants[0] || null, forfait: true, phaseId: ej.phaseId + 1 };
  }
  if (ej.jeu === 'relais') {
    const ordre = ej.ordre.filter(u => presents.includes(u));
    if (ordre.length === ej.ordre.length || ej.termine) return null;
    const actifId = ej.ordre[ej.actifIndex];
    let actifIndex = ordre.indexOf(actifId);
    const nouveau = { ...ej, ordre, phaseId: ej.phaseId + 1 };
    if (ordre.length <= 1) return { ...nouveau, phase: 'fin', termine: true, vainqueurId: ordre[0] || null, actifIndex: 0 };
    if (actifIndex < 0) actifIndex = ej.actifIndex % ordre.length; // l'actif est parti : son successeur joue
    return { ...nouveau, actifIndex };
  }
  return null;
}

function jeuxGererDeparts() {
  const p = partieCourante;
  if (!p || p.etat !== 'en_cours' || !p.etat_jeu || !p.etat_jeu.jeu || !joueursPartieCourante.length) return;
  const presents = joueursPartieCourante.map(j => j.user_id);
  if (!jeuxRetirerAbsents(p.etat_jeu, presents)) return;
  // Un seul joueur écrit (l'hôte s'il est là, sinon le premier présent).
  const premier = presents.includes(p.hote_id) ? p.hote_id : presents[0];
  if (window.accountUser.id !== premier) return;
  ecrireEtatJeu((ej) => jeuxRetirerAbsents(ej, presents));
}

// ---------------------------------------------------------------------------
// DUEL ÉCLAIR
// ---------------------------------------------------------------------------

function creerEtatDuel(joueurs, config, entrees) {
  return {
    jeu: 'duel', v: 0, phaseId: 1, phase: 'compte',
    joueurs: joueurs.slice(0, 2),
    scores: Object.fromEntries(joueurs.slice(0, 2).map(u => [u, 0])),
    manche: 1, mancheMax: config.manches || 10, dureeMs: config.tempsMs || 10000,
    mots: jeuxTirerMots(entrees, DUEL_NB_MOTS, e => jeuxContientKanji(e.mot)),
    essais: {}, gagnantManche: null, vainqueurId: null, termine: false
  };
}

function duelMotCourant(ej) { return ej.mots[ej.manche - 1] || null; }

function duelReponse(ej, uid, correct) {
  if (ej.phase !== 'question' || !ej.joueurs.includes(uid) || ej.essais[uid]) return null;
  const essais = { ...ej.essais, [uid]: correct ? 'ok' : 'faux' };
  if (correct) {
    return { ...ej, essais, scores: { ...ej.scores, [uid]: (ej.scores[uid] || 0) + 1 }, phase: 'resultat', gagnantManche: uid, phaseId: ej.phaseId + 1 };
  }
  if (ej.joueurs.every(u => essais[u])) return { ...ej, essais, phase: 'resultat', gagnantManche: 'aucun', phaseId: ej.phaseId + 1 };
  return { ...ej, essais };
}

function duelFinPhase(ej) {
  if (ej.phase === 'compte') return { ...ej, phase: 'question', essais: {}, phaseId: ej.phaseId + 1 };
  if (ej.phase === 'question') return { ...ej, phase: 'resultat', gagnantManche: ej.gagnantManche || 'aucun', phaseId: ej.phaseId + 1 };
  if (ej.phase === 'resultat') {
    const [a, b] = ej.joueurs;
    const sa = ej.scores[a] || 0, sb = ej.scores[b] || 0;
    const egalite = sa === sb;
    const fin = (ej.manche >= ej.mancheMax && !egalite) || ej.manche >= ej.mots.length;
    if (fin) return { ...ej, phase: 'fin', termine: true, vainqueurId: egalite ? null : (sa > sb ? a : b), phaseId: ej.phaseId + 1 };
    return { ...ej, manche: ej.manche + 1, phase: 'compte', essais: {}, gagnantManche: null, phaseId: ej.phaseId + 1 };
  }
  return null;
}

async function soumettreReponseDuel(saisie) {
  const ej = partieCourante && partieCourante.etat_jeu;
  if (!ej || ej.phase !== 'question') return;
  const phaseId = ej.phaseId;
  const mot = duelMotCourant(ej);
  const ok = !!mot && jeuxLectureCorrecte(saisie, mot.lectures);
  await ecrireEtatJeu((e) => (e.phaseId !== phaseId ? null : duelReponse(e, window.accountUser.id, ok)));
}

function renderDuel(el, ej) {
  const monId = window.accountUser.id;
  const mot = duelMotCourant(ej);
  const [a, b] = ej.joueurs;
  const casesScore = [a, b].map(u => {
    const etat = ej.essais[u];
    return `<div class="duel-joueur ${u === monId ? 'duel-joueur--moi' : ''} ${ej.gagnantManche === u ? 'duel-joueur--gagne' : ''}">
      <div class="duel-joueur__nom">${escapeHtml(jeuxPseudoDe(u))}${u === monId ? ' (toi)' : ''}</div>
      <div class="duel-joueur__score">${ej.scores[u] || 0}</div>
      <div class="duel-joueur__etat">${etat === 'ok' ? '✔' : etat === 'faux' ? '✘' : ''}</div>
    </div>`;
  }).join('<div class="duel-vs">VS</div>');
  const supplementaire = ej.manche > ej.mancheMax;
  let centre = '';
  if (ej.phase === 'compte') {
    centre = `<div class="duel-pret">Prêt ?</div>`;
  } else if (ej.phase === 'question') {
    const dejaRepondu = !!ej.essais[monId];
    centre = `
      <div class="partie-mot-actif duel-mot">${escapeHtml(mot ? mot.mot : '…')}</div>
      ${dejaRepondu
        ? `<p class="duel-attente">${ej.essais[monId] === 'faux' ? 'Raté ! Tu ne peux plus répondre à ce mot — ton adversaire peut encore tenter sa chance…' : '…'}</p>`
        : `<div class="partie-actions duel-saisie">
             <input type="text" id="partieReponseInput" data-garde autocomplete="off" placeholder="Lecture (hiragana)">
             <button class="primary" id="btnValiderReponsePartie">Valider</button>
           </div>
           <p class="duel-attente">Une seule réponse par mot : fais-la compter.</p>`}`;
  } else {
    const gagnant = ej.gagnantManche;
    centre = `
      <div class="partie-mot-actif duel-mot">${escapeHtml(mot ? mot.mot : '')}</div>
      <div class="duel-revele">${escapeHtml(mot ? mot.lectures.join(' / ') : '')} <span>· ${escapeHtml(mot ? mot.sens : '')}</span></div>
      <div class="duel-verdict ${gagnant === 'aucun' ? 'duel-verdict--aucun' : ''}">${gagnant === 'aucun' ? 'Personne ne marque ce point.' : `Point pour ${escapeHtml(jeuxPseudoDe(gagnant))} !`}</div>`;
  }
  el.innerHTML = `
    <div class="card jeu-carte jeu-carte--duel">
      <h2>⚡ Duel éclair <span class="jeu-manche">${supplementaire ? 'Manche de départage' : `Manche ${ej.manche}/${ej.mancheMax}`}</span></h2>
      <div class="duel-tableau">${casesScore}</div>
      <div class="partie-minuteur"><div class="partie-minuteur-barre"><div class="partie-minuteur-barre__remplissage" id="partieMinuteurBarre"></div></div><span id="partieMinuteurTexte" class="partie-minuteur-texte">…</span></div>
      ${centre}
      <div class="partie-actions" style="margin-top:14px;"><button class="secondary small" id="btnQuitterPartieJeu">Quitter la partie</button></div>
    </div>`;
  if (ej.phase === 'question' && !ej.essais[monId]) {
    const input = $('#partieReponseInput');
    activerSaisieKanaDirecte(input, false);
    input.focus();
    const valider = () => { const v = input.value; if (!v.trim()) return; input.disabled = true; soumettreReponseDuel(v); };
    $('#btnValiderReponsePartie').onclick = valider;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); });
  }
}

// ---------------------------------------------------------------------------
// RELAIS DES MOTS
// ---------------------------------------------------------------------------

function relaisCandidats(entrees, kanji, utilises) {
  if (!kanji) return [];
  return entrees.filter(e => e.mot[0] === kanji && !utilises.includes(e.mot));
}

// Mot de départ : un mot à kanji qui a encore au moins une suite possible.
function relaisChoisirDepart(entrees, utilises) {
  const dispo = shuffle(entrees.filter(e => jeuxContientKanji(e.mot) && !utilises.includes(e.mot)));
  for (const e of dispo) {
    const k = jeuxDernierKanji(e.mot);
    if (k && relaisCandidats(entrees, k, utilises.concat(e.mot)).length) return e;
  }
  return dispo[0] || null;
}

function creerEtatRelais(ordre, config, entrees) {
  const depart = relaisChoisirDepart(entrees, []);
  return {
    jeu: 'relais', v: 0, phaseId: 1, phase: 'tour',
    ordre: ordre.slice(), actifIndex: 0,
    vies: Object.fromEntries(ordre.map(u => [u, RELAIS_VIES])),
    mot: depart, dernierKanji: jeuxDernierKanji(depart.mot),
    utilises: [depart.mot], historique: [{ mot: depart.mot, lecture: depart.lecture, par: null }],
    dureeMs: config.tempsTourMs || 20000, dernierResultat: null, vainqueurId: null, termine: false
  };
}

// Contrôle d'une proposition : renvoie { ok, entree } ou { ok:false, raison }.
function relaisValider(entrees, ej, motSaisi, lectureSaisie) {
  const mot = String(motSaisi || '').trim();
  if (!mot) return { ok: false, raison: 'aucun mot saisi' };
  if (mot[0] !== ej.dernierKanji) return { ok: false, raison: `le mot doit commencer par ${ej.dernierKanji}` };
  const candidats = entrees.filter(e => e.mot === mot);
  if (!candidats.length) return { ok: false, raison: `${mot} n'est pas dans le vocabulaire` };
  if (ej.utilises.includes(mot)) return { ok: false, raison: `${mot} a déjà été utilisé` };
  const entree = candidats.find(e => jeuxLectureCorrecte(lectureSaisie, [e.lecture]));
  if (!entree) return { ok: false, raison: `mauvaise lecture pour ${mot}` };
  return { ok: true, entree };
}

function relaisAppliquer(ej, uid, resultat, entrees) {
  if (ej.phase !== 'tour' || ej.ordre[ej.actifIndex] !== uid) return null;
  const n = ej.ordre.length;
  if (resultat.ok) {
    const e = resultat.entree;
    let utilises = ej.utilises.concat(e.mot);
    let mot = e, redemarrage = false;
    let historique = ej.historique.concat({ mot: e.mot, lecture: e.lecture, par: uid });
    let dernierKanji = jeuxDernierKanji(e.mot);
    if (!relaisCandidats(entrees, dernierKanji, utilises).length) {
      // Cul-de-sac : nouveau mot de départ, sans vie perdue.
      const depart = relaisChoisirDepart(entrees, utilises);
      if (depart) {
        redemarrage = true; mot = depart; utilises = utilises.concat(depart.mot);
        dernierKanji = jeuxDernierKanji(depart.mot);
        historique = historique.concat({ mot: depart.mot, lecture: depart.lecture, par: null });
      }
    }
    return {
      ...ej, mot, dernierKanji, utilises, historique: historique.slice(-RELAIS_HISTORIQUE_MAX),
      actifIndex: (ej.actifIndex + 1) % n, phaseId: ej.phaseId + 1,
      dernierResultat: { joueurId: uid, issue: 'ok', mot: e.mot, lecture: e.lecture, sens: e.sens, redemarrage }
    };
  }
  const vies = { ...ej.vies, [uid]: Math.max(0, (ej.vies[uid] || 0) - 1) };
  let ordre = ej.ordre, actifIndex = (ej.actifIndex + 1) % n;
  if (vies[uid] <= 0) {
    ordre = ej.ordre.filter(u => u !== uid);
    actifIndex = ordre.length ? ej.actifIndex % ordre.length : 0;
  }
  const base = {
    ...ej, vies, ordre, actifIndex, phaseId: ej.phaseId + 1,
    dernierResultat: { joueurId: uid, issue: resultat.timeout ? 'timeout' : 'rate', raison: resultat.raison || '', elimine: vies[uid] <= 0 }
  };
  if (ordre.length <= 1) return { ...base, phase: 'fin', termine: true, vainqueurId: ordre[0] || null };
  return base;
}

function relaisFinPhase(ej) {
  if (ej.phase !== 'tour') return null;
  return relaisAppliquer(ej, ej.ordre[ej.actifIndex], { ok: false, timeout: true, raison: 'temps écoulé' }, []);
}

function relaisEntreesJeu() {
  return jeuxEntreesDepuisVocab(poolVocabPourPartie({}).filter(v => jeuxContientKanji(v.mot)));
}

async function soumettreReponseRelais(motSaisi, lectureSaisie) {
  const ej = partieCourante && partieCourante.etat_jeu;
  if (!ej || ej.phase !== 'tour') return;
  const phaseId = ej.phaseId;
  const entrees = relaisEntreesJeu();
  const verdict = relaisValider(entrees, ej, motSaisi, lectureSaisie);
  await ecrireEtatJeu((e) => (e.phaseId !== phaseId ? null : relaisAppliquer(e, window.accountUser.id, verdict, entrees)));
}

function renderRelais(el, ej) {
  const monId = window.accountUser.id;
  const actifId = ej.ordre[ej.actifIndex];
  const monTour = actifId === monId;
  const joueurs = ej.ordre.map((u, i) => `
    <div class="partie-joueur-chip ${i === ej.actifIndex ? 'partie-joueur-chip--actif' : ''}">
      <span>${escapeHtml(jeuxPseudoDe(u))}${u === monId ? ' (toi)' : ''}</span>
      <span class="partie-vies">${'❤️'.repeat(Math.max(0, ej.vies[u] || 0))}</span>
    </div>`).join('');
  const chaine = ej.historique.map(h => `<span class="relais-maillon">${escapeHtml(h.mot)}</span>`).join('<span class="relais-fleche">→</span>');
  const r = ej.dernierResultat;
  let retour = '';
  if (r && r.issue === 'ok') {
    retour = `<div class="relais-retour relais-retour--ok">✔ ${escapeHtml(jeuxPseudoDe(r.joueurId))} : <strong>${escapeHtml(r.mot)}</strong> (${escapeHtml(r.lecture)}) — ${escapeHtml(r.sens)}${r.redemarrage ? '<br><em>Plus aucun mot ne continue cette chaîne : nouveau mot de départ, sans perte de vie.</em>' : ''}</div>`;
  } else if (r) {
    retour = `<div class="relais-retour relais-retour--rate">✘ ${escapeHtml(jeuxPseudoDe(r.joueurId))} perd une vie${r.raison ? ' (' + escapeHtml(r.raison) + ')' : ''}${r.elimine ? ' et est éliminé' : ''}.</div>`;
  }
  el.innerHTML = `
    <div class="card jeu-carte jeu-carte--relais">
      <h2>🔗 Relais des mots</h2>
      <div class="partie-joueurs-liste">${joueurs}</div>
      <div class="relais-chaine">${chaine}</div>
      ${retour}
      <div class="partie-minuteur"><div class="partie-minuteur-barre"><div class="partie-minuteur-barre__remplissage" id="partieMinuteurBarre"></div></div><span id="partieMinuteurTexte" class="partie-minuteur-texte">…</span></div>
      <div class="relais-courant">
        <div class="partie-mot-actif">${escapeHtml(ej.mot.mot)}</div>
        <div class="relais-consigne">Prochain mot : il doit commencer par <span class="relais-kanji">${escapeHtml(ej.dernierKanji || '?')}</span></div>
      </div>
      ${monTour ? `
        <div class="relais-saisie">
          <input type="text" id="relaisMotInput" data-garde autocomplete="off" placeholder="Mot en kanji (ex. ${escapeHtml(ej.dernierKanji || '')}…)">
          <input type="text" id="partieReponseInput" data-garde autocomplete="off" placeholder="Lecture (hiragana)">
          <button class="primary" id="btnValiderReponsePartie">Valider</button>
        </div>`
        : `<p class="duel-attente">Tour de ${escapeHtml(jeuxPseudoDe(actifId))}…</p>`}
      <div class="partie-actions" style="margin-top:14px;"><button class="secondary small" id="btnQuitterPartieJeu">Quitter la partie</button></div>
    </div>`;
  if (monTour) {
    const inMot = $('#relaisMotInput'), inLect = $('#partieReponseInput');
    activerSaisieKanaDirecte(inLect, false);
    if (!inMot.value) inMot.focus();
    const valider = () => { const m = inMot.value, l = inLect.value; inMot.disabled = true; inLect.disabled = true; soumettreReponseRelais(m, l); };
    $('#btnValiderReponsePartie').onclick = valider;
    [inMot, inLect].forEach(i => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); }));
  }
}

// ---------------------------------------------------------------------------
// DESSIN DE KANJI
// ---------------------------------------------------------------------------

function creerEtatDessin(ordre, config, entrees) {
  const mots = jeuxTirerMots(entrees, ordre.length, e => jeuxContientKanji(e.mot) && e.mot.length <= 3);
  return {
    jeu: 'dessin', v: 0, phaseId: 1, phase: 'dessin',
    ordre: ordre.slice(), tour: 0, mots,
    dureeMs: config.tempsMs || 60000,
    scores: Object.fromEntries(ordre.map(u => [u, 0])), trouves: {},
    vainqueurId: null, termine: false
  };
}

function dessinMotCourant(ej) { return ej.mots[ej.tour] || null; }

function dessinPointsDevinette(resteMs, dureeMs) {
  return 3 + Math.round(7 * Math.max(0, Math.min(1, resteMs / dureeMs)));
}

function dessinTrouve(ej, uid, resteMs) {
  if (ej.phase !== 'dessin' || uid === ej.ordre[ej.tour] || !ej.ordre.includes(uid) || ej.trouves[uid] != null) return null;
  const pts = dessinPointsDevinette(resteMs, ej.dureeMs);
  const dessinateur = ej.ordre[ej.tour];
  const scores = { ...ej.scores, [uid]: (ej.scores[uid] || 0) + pts, [dessinateur]: (ej.scores[dessinateur] || 0) + 3 };
  const trouves = { ...ej.trouves, [uid]: pts };
  const tousTrouves = ej.ordre.filter(u => u !== dessinateur).every(u => trouves[u] != null);
  return { ...ej, scores, trouves, ...(tousTrouves ? { phase: 'revele', phaseId: ej.phaseId + 1 } : {}) };
}

function dessinClassement(ej) {
  return Object.entries(ej.scores).sort((a, b) => b[1] - a[1]);
}

function dessinFinPhase(ej) {
  if (ej.phase === 'dessin') return { ...ej, phase: 'revele', phaseId: ej.phaseId + 1 };
  if (ej.phase === 'revele') {
    if (ej.tour + 1 >= ej.ordre.length || !ej.mots[ej.tour + 1]) {
      const c = dessinClassement(ej);
      const egalite = c.length > 1 && c[0][1] === c[1][1];
      return { ...ej, phase: 'fin', termine: true, vainqueurId: egalite ? null : c[0][0], phaseId: ej.phaseId + 1 };
    }
    return { ...ej, tour: ej.tour + 1, trouves: {}, phase: 'dessin', phaseId: ej.phaseId + 1 };
  }
  return null;
}

// -- Tracés (en direct, hors base) -----------------------------------------

let dessinTraits = [];          // [{ id, pts: [[x, y], ...] }] coordonnées 0..1
let dessinCleCanvas = null;     // salon:phaseId du canevas affiché
let dessinTraitEnCours = null;
let dessinEnvoiEnAttente = [];
let dessinMinuteurEnvoi = null;

function dessinCleActuelle(ej) { return partieCourante.id + ':' + ej.phaseId; }

function dessinEnvoyer(evenement, payload) {
  if (!canalPartie) return;
  canalPartie.send({ type: 'broadcast', event: evenement, payload });
}

function dessinRedessiner() {
  const canvas = $('#dessinCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const L = canvas.width;
  ctx.clearRect(0, 0, L, L);
  ctx.fillStyle = '#fbf7ea';
  ctx.fillRect(0, 0, L, L);
  // Grille de calligraphie (croix + diagonales), comme sur un cahier de kanji.
  ctx.strokeStyle = 'rgba(190, 90, 90, 0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(L / 2, 0); ctx.lineTo(L / 2, L);
  ctx.moveTo(0, L / 2); ctx.lineTo(L, L / 2);
  ctx.moveTo(0, 0); ctx.lineTo(L, L);
  ctx.moveTo(L, 0); ctx.lineTo(0, L);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#1b1b2a';
  ctx.lineWidth = Math.max(4, L / 70);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const t of dessinTraits) {
    if (!t.pts.length) continue;
    ctx.beginPath();
    ctx.moveTo(t.pts[0][0] * L, t.pts[0][1] * L);
    if (t.pts.length === 1) ctx.lineTo(t.pts[0][0] * L + 0.1, t.pts[0][1] * L + 0.1);
    for (let i = 1; i < t.pts.length; i++) ctx.lineTo(t.pts[i][0] * L, t.pts[i][1] * L);
    ctx.stroke();
  }
}

function dessinVider() { dessinTraits = []; dessinTraitEnCours = null; dessinEnvoiEnAttente = []; }

function dessinVidangerEnvoi() {
  if (!dessinTraitEnCours || !dessinEnvoiEnAttente.length) return;
  dessinEnvoyer('trait', { cle: dessinCleCanvas, id: dessinTraitEnCours.id, pts: dessinEnvoiEnAttente });
  dessinEnvoiEnAttente = [];
}

function dessinBrancherDessinateur(canvas) {
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    dessinTraitEnCours = { id: Date.now() + '-' + Math.floor(Math.random() * 1000), pts: [p] };
    dessinTraits.push(dessinTraitEnCours);
    dessinEnvoiEnAttente = [p];
    dessinRedessiner();
    clearInterval(dessinMinuteurEnvoi);
    dessinMinuteurEnvoi = setInterval(dessinVidangerEnvoi, 60);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dessinTraitEnCours) return;
    e.preventDefault();
    const p = pos(e);
    dessinTraitEnCours.pts.push(p);
    dessinEnvoiEnAttente.push(p);
    dessinRedessiner();
  });
  const fin = () => {
    if (!dessinTraitEnCours) return;
    dessinVidangerEnvoi();
    clearInterval(dessinMinuteurEnvoi);
    dessinMinuteurEnvoi = null;
    dessinTraitEnCours = null;
  };
  canvas.addEventListener('pointerup', fin);
  canvas.addEventListener('pointercancel', fin);
}

// Messages « broadcast » reçus (branchés dans sabonnerPartie).
function dessinRecevoir(evenement, payload) {
  const ej = partieCourante && partieCourante.etat_jeu;
  if (!ej || ej.jeu !== 'dessin' || !payload) return;
  const maCle = dessinCleActuelle(ej);
  if (payload.cle !== maCle) return;
  const moiDessinateur = ej.ordre[ej.tour] === window.accountUser.id;
  if (evenement === 'trait' && !moiDessinateur) {
    let t = dessinTraits.find(x => x.id === payload.id);
    if (!t) { t = { id: payload.id, pts: [] }; dessinTraits.push(t); }
    t.pts.push(...payload.pts);
    dessinRedessiner();
  } else if (evenement === 'annuler' && !moiDessinateur) {
    dessinTraits.pop();
    dessinRedessiner();
  } else if (evenement === 'effacer' && !moiDessinateur) {
    dessinVider();
    dessinRedessiner();
  } else if (evenement === 'demande' && moiDessinateur) {
    dessinEnvoyer('sync', { cle: maCle, traits: dessinTraits });
  } else if (evenement === 'sync' && !moiDessinateur && !dessinTraits.length) {
    dessinTraits = payload.traits || [];
    dessinRedessiner();
  }
}

async function soumettreDevinetteDessin(saisie) {
  const ej = partieCourante && partieCourante.etat_jeu;
  if (!ej || ej.phase !== 'dessin') return false;
  const mot = dessinMotCourant(ej);
  if (!mot || !jeuxLectureCorrecte(saisie, mot.lectures)) return false;
  const phaseId = ej.phaseId;
  const reste = jeuxResteMs(ej);
  await ecrireEtatJeu((e) => (e.phaseId !== phaseId ? null : dessinTrouve(e, window.accountUser.id, reste)));
  return true;
}

function dessinMajIndice(ej, reste) {
  const zone = $('#dessinIndice');
  if (!zone || ej.phase !== 'dessin') return;
  const mot = dessinMotCourant(ej);
  if (!mot) return;
  const nb = mot.lectures[0].length;
  zone.textContent = `Indice : ${nb} kana` + (reste < ej.dureeMs / 2 ? ` · sens : ${mot.sens}` : '');
}

function dessinHtmlInfos(ej) {
  const monId = window.accountUser.id;
  const dessinateur = ej.ordre[ej.tour];
  const lignes = ej.ordre.map(u => `
    <div class="partie-joueur-chip ${u === dessinateur ? 'partie-joueur-chip--actif' : ''}">
      <span>${u === dessinateur ? '✏️ ' : ''}${escapeHtml(jeuxPseudoDe(u))}${u === monId ? ' (toi)' : ''}${ej.trouves[u] != null ? ' ✔' : ''}</span>
      <span class="partie-vies">${ej.scores[u] || 0} pts</span>
    </div>`).join('');
  return `<div class="partie-joueurs-liste">${lignes}</div>`;
}

function renderDessin(el, ej) {
  const monId = window.accountUser.id;
  const dessinateur = ej.ordre[ej.tour];
  const moiDessinateur = dessinateur === monId;
  const mot = dessinMotCourant(ej);
  const cle = dessinCleActuelle(ej) + ':' + ej.phase;
  // La zone de dessin n'est reconstruite qu'à chaque nouvelle phase : une
  // mise à jour de score ne doit ni effacer le canevas ni la saisie en cours.
  if (el.dataset.dessinCle === cle && $('#dessinInfos')) {
    $('#dessinInfos').innerHTML = dessinHtmlInfos(ej);
    return;
  }
  el.dataset.dessinCle = cle;
  const nouvelleManche = dessinCleCanvas !== dessinCleActuelle(ej);
  if (nouvelleManche) { dessinCleCanvas = dessinCleActuelle(ej); dessinVider(); }
  const revele = ej.phase === 'revele';
  let zone;
  if (revele) {
    zone = `<div class="duel-revele" style="text-align:center;">C'était <strong style="font-size:34px;">${escapeHtml(mot.mot)}</strong><br>${escapeHtml(mot.lectures.join(' / '))} · ${escapeHtml(mot.sens)}</div>`;
  } else if (moiDessinateur) {
    zone = `<div class="dessin-consigne">Dessine ce mot : <strong class="dessin-mot">${escapeHtml(mot.mot)}</strong> <span>(sans le dire — les autres cherchent sa lecture)</span></div>
      <div class="partie-actions"><button class="secondary small" id="btnDessinAnnuler">↶ Annuler le dernier trait</button><button class="secondary small" id="btnDessinEffacer">Tout effacer</button></div>`;
  } else {
    zone = `<div class="dessin-consigne">${escapeHtml(jeuxPseudoDe(dessinateur))} dessine un mot. Devine sa lecture en hiragana !</div>
      <div id="dessinIndice" class="dessin-indice"></div>
      ${ej.trouves[monId] != null
        ? `<p class="duel-attente">✔ Trouvé ! +${ej.trouves[monId]} pts. Attends la fin de la manche…</p>`
        : `<div class="partie-actions"><input type="text" id="partieReponseInput" data-garde autocomplete="off" placeholder="Lecture (hiragana)"><button class="primary" id="btnValiderReponsePartie">Proposer</button></div>`}`;
  }
  el.innerHTML = `
    <div class="card jeu-carte jeu-carte--dessin">
      <h2>✏️ Dessin de kanji <span class="jeu-manche">Dessin ${ej.tour + 1}/${ej.ordre.length}</span></h2>
      <div id="dessinInfos">${dessinHtmlInfos(ej)}</div>
      <div class="partie-minuteur"><div class="partie-minuteur-barre"><div class="partie-minuteur-barre__remplissage" id="partieMinuteurBarre"></div></div><span id="partieMinuteurTexte" class="partie-minuteur-texte">…</span></div>
      ${zone}
      <div class="dessin-cadre"><canvas id="dessinCanvas" width="480" height="480"></canvas></div>
      <div class="partie-actions" style="margin-top:14px;"><button class="secondary small" id="btnQuitterPartieJeu">Quitter la partie</button></div>
    </div>`;
  const canvas = $('#dessinCanvas');
  dessinRedessiner();
  if (moiDessinateur && !revele) {
    canvas.classList.add('dessin-actif');
    dessinBrancherDessinateur(canvas);
    $('#btnDessinAnnuler').onclick = () => { dessinTraits.pop(); dessinRedessiner(); dessinEnvoyer('annuler', { cle: dessinCleCanvas }); };
    $('#btnDessinEffacer').onclick = () => { dessinVider(); dessinRedessiner(); dessinEnvoyer('effacer', { cle: dessinCleCanvas }); };
  } else if (!moiDessinateur && !revele) {
    dessinEnvoyer('demande', { cle: dessinCleCanvas }); // arrivée en cours de dessin : on réclame le tracé
    if (ej.trouves[monId] == null) {
      const input = $('#partieReponseInput');
      activerSaisieKanaDirecte(input, false);
      const proposer = async () => {
        const v = input.value;
        if (!v.trim()) return;
        const ok = await soumettreDevinetteDessin(v);
        if (!ok) { input.value = ''; input.classList.add('dessin-faux'); setTimeout(() => input.classList.remove('dessin-faux'), 500); }
      };
      $('#btnValiderReponsePartie').onclick = proposer;
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') proposer(); });
    }
  }
}

// ---------------------------------------------------------------------------
// Point d'entrée commun
// ---------------------------------------------------------------------------

function creerEtatInitialJeu(jeu, joueurs, config) {
  const entrees = jeu === 'relais' ? relaisEntreesJeu() : jeuxEntreesDepuisVocab(poolVocabPourPartie(config));
  if (jeu === 'duel') return creerEtatDuel(joueurs, config, entrees);
  if (jeu === 'relais') return creerEtatRelais(joueurs, config, entrees);
  if (jeu === 'dessin') return creerEtatDessin(joueurs, config, entrees);
  return null;
}

// Vocabulaire minimal pour qu'une partie ait un sens.
function verifierPoolJeu(jeu, config) {
  if (jeu === 'relais') return relaisEntreesJeu().length >= 30;
  const entrees = jeuxEntreesDepuisVocab(poolVocabPourPartie(config)).filter(e => jeuxContientKanji(e.mot));
  const besoin = jeu === 'duel' ? 12 : 6;
  return new Set(entrees.map(e => e.mot)).size >= besoin;
}

async function demarrerPartieJeu() {
  const p = partieCourante;
  if (!p || p.hote_id !== window.accountUser.id) return;
  const infos = PARTIES_JEUX[p.jeu];
  const n = joueursPartieCourante.length;
  if (n < infos.min) { showToast(`Il faut au moins ${infos.min} joueurs pour commencer.`); return; }
  if (n > infos.max) { showToast(`Ce jeu accepte ${infos.max} joueurs au maximum.`); return; }
  if (!verifierPoolJeu(p.jeu, p.config)) { showToast('Pas assez de vocabulaire dans ce contenu pour jouer.'); return; }
  const ordre = shuffle(joueursPartieCourante.map(j => j.user_id));
  const etat = creerEtatInitialJeu(p.jeu, ordre, p.config);
  if (!etat) return;
  const { error } = await window.sb.from('parties').update({ etat: 'en_cours', etat_jeu: etat }).eq('id', p.id);
  if (error) showToast('Impossible de démarrer la partie.');
}

function renderJeuParties(el, ej) {
  jeuxSynchroPhase(ej);
  if (ej.jeu === 'duel') renderDuel(el, ej);
  else if (ej.jeu === 'relais') renderRelais(el, ej);
  else if (ej.jeu === 'dessin') renderDessin(el, ej);
  const quitter = $('#btnQuitterPartieJeu');
  if (quitter) quitter.onclick = () => quitterPartie();
  demarrerTickJeux();
  tickJeux();
}

// Écran de fin des nouveaux jeux : classement lisible.
function htmlFinJeu(ej) {
  if (ej.jeu === 'dessin') {
    const lignes = dessinClassement(ej).map(([u, s], i) => `<div class="partie-liste-item"><span>${i === 0 ? '🏆 ' : (i + 1) + '. '}${escapeHtml(jeuxPseudoDe(u))}</span><strong>${s} pts</strong></div>`).join('');
    return `<p>${ej.vainqueurId ? `🏆 ${escapeHtml(jeuxPseudoDe(ej.vainqueurId))} remporte la partie !` : 'Égalité parfaite !'}</p>${lignes}`;
  }
  if (ej.jeu === 'duel') {
    const lignes = ej.joueurs.map(u => `<div class="partie-liste-item"><span>${ej.vainqueurId === u ? '🏆 ' : ''}${escapeHtml(jeuxPseudoDe(u))}</span><strong>${ej.scores[u] || 0}</strong></div>`).join('');
    return `<p>${ej.vainqueurId ? `🏆 ${escapeHtml(jeuxPseudoDe(ej.vainqueurId))} remporte le duel${ej.forfait ? ' (forfait de son adversaire)' : ''} !` : 'Égalité : aucun mot en plus à jouer.'}</p>${lignes}`;
  }
  if (ej.jeu === 'relais') {
    return `<p>${ej.vainqueurId ? `🏆 ${escapeHtml(jeuxPseudoDe(ej.vainqueurId))} est le dernier en jeu et remporte le relais !` : 'Partie terminée.'}</p>
      <div class="relais-chaine">${(ej.historique || []).map(h => `<span class="relais-maillon">${escapeHtml(h.mot)}</span>`).join('<span class="relais-fleche">→</span>')}</div>`;
  }
  return '';
}
