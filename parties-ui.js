// parties-ui.js — Écrans des salons (accueil, création, salon d'attente, jeu de
// la bombe, fin de partie). Séparé de parties.js (02/10/2026) : parties.js garde
// la logique des salons et du temps réel, les jeux Duel / Relais / Dessin sont
// dans parties-jeux.js, ici on ne fait que dessiner les écrans.

// ---------------------------------------------------------------------------
// Sélection de semaines (création d'un salon)
// ---------------------------------------------------------------------------

// { semestre: { label, semaines: [1, 2, ...] } } pour tout ce que le compte possède.
function semainesDisponiblesPartie() {
  const parSem = new Map();
  for (const g of DB.kanjiGroups) {
    if (g.week == null) continue;
    if (!parSem.has(g.semesterId)) parSem.set(g.semesterId, new Set());
    parSem.get(g.semesterId).add(g.week);
  }
  const sortie = [];
  for (const s of (DB.settings.semesters || [])) {
    if (!parSem.has(s.id)) continue;
    sortie.push({ id: s.id, label: s.label, semaines: Array.from(parSem.get(s.id)).sort((a, b) => a - b) });
  }
  return sortie;
}

function libelleSelectionPartie(selection) {
  if (!selection || !selection.length) return 'Tout le vocabulaire débloqué';
  const nbMots = poolVocabPourPartie({ selection }).length;
  return `${selection.length} semaine${selection.length > 1 ? 's' : ''} · ${nbMots} mots`;
}

function htmlSelectionSemaines() {
  const sems = semainesDisponiblesPartie();
  if (!sems.length) return '<p style="color:var(--muted);">Aucun vocabulaire disponible.</p>';
  return `
    <details class="sel-semaines">
      <summary>Contenu : <strong id="selSemResume">${escapeHtml(libelleSelectionPartie(Array.from(selectionSemainesForm)))}</strong></summary>
      <div class="sel-semaines__corps">
        <p class="sel-semaines__aide">Coche les semaines à jouer, dans un ou plusieurs semestres. Rien de coché = tout le vocabulaire.</p>
        ${sems.map(s => `
          <div class="sel-sem">
            <div class="sel-sem__tete"><strong>${escapeHtml(s.label)}</strong>
              <button type="button" class="secondary small" data-sel-sem="${escapeHtml(s.id)}">Tout / rien</button></div>
            <div class="sel-sem__puces">${s.semaines.map(w => {
              const cle = s.id + ':' + w;
              return `<button type="button" class="sel-puce ${selectionSemainesForm.has(cle) ? 'sel-puce--actif' : ''}" data-sel="${escapeHtml(cle)}">${w}</button>`;
            }).join('')}</div>
          </div>`).join('')}
        <button type="button" class="secondary small" id="selSemVider">Tout décocher</button>
      </div>
    </details>`;
}

function brancherSelectionSemaines(zone) {
  const maj = () => {
    $$('[data-sel]', zone).forEach(b => b.classList.toggle('sel-puce--actif', selectionSemainesForm.has(b.dataset.sel)));
    const r = $('#selSemResume');
    if (r) r.textContent = libelleSelectionPartie(Array.from(selectionSemainesForm));
  };
  $$('[data-sel]', zone).forEach(b => {
    b.onclick = () => {
      if (selectionSemainesForm.has(b.dataset.sel)) selectionSemainesForm.delete(b.dataset.sel);
      else selectionSemainesForm.add(b.dataset.sel);
      maj();
    };
  });
  $$('[data-sel-sem]', zone).forEach(b => {
    b.onclick = () => {
      const cles = $$('[data-sel]', zone).map(x => x.dataset.sel).filter(c => c.startsWith(b.dataset.selSem + ':'));
      const toutes = cles.every(c => selectionSemainesForm.has(c));
      cles.forEach(c => (toutes ? selectionSemainesForm.delete(c) : selectionSemainesForm.add(c)));
      maj();
    };
  });
  const vider = $('#selSemVider');
  if (vider) vider.onclick = () => { selectionSemainesForm.clear(); maj(); };
}

function libelleContenuPartie(config) {
  if (config && Array.isArray(config.selection) && config.selection.length) return libelleSelectionPartie(config.selection);
  if (config && config.semesterId && config.semesterId !== 'tout') {
    const s = (DB.settings.semesters || []).find(x => x.id === config.semesterId);
    return s ? s.label : 'Un semestre';
  }
  return 'Tout le vocabulaire débloqué';
}

function libelleReglagesPartie(jeu, c) {
  if (jeu === 'duel') return `${c.manches || 10} manches · ${(c.tempsMs || 10000) / 1000} s par mot`;
  if (jeu === 'relais') return `${(c.tempsTourMs || 20000) / 1000} s par tour · 3 vies`;
  if (jeu === 'dessin') return `${(c.tempsMs || 60000) / 1000} s par dessin`;
  return `${(c.tempsTourMs || 15000) / 1000} s par tour · ${c.vies || 3} vies`;
}

function lienSalon(code) {
  return location.origin + '/app/?salon=' + code;
}

// ---------------------------------------------------------------------------
// Accueil : rejoindre / créer
// ---------------------------------------------------------------------------

function optionsHtmlPartie(liste, defaut, suffixe, diviseur) {
  return liste.map(v => `<option value="${v}" ${v === defaut ? 'selected' : ''}>${diviseur ? v / diviseur : v}${suffixe}</option>`).join('');
}

function renderPartiesAccueil(el) {
  const codeUrl = (new URLSearchParams(location.search).get('salon') || '').toUpperCase().slice(0, 5);
  const jeuxCartes = Object.entries(PARTIES_JEUX).map(([id, j], i) => `
    <label class="jeu-choix">
      <input type="radio" name="partieJeu" value="${id}" ${i === 0 ? 'checked' : ''}>
      <span class="jeu-choix__carte">
        <span class="jeu-choix__icone">${j.icone}</span>
        <strong>${escapeHtml(j.nom)}</strong>
        <small>${j.min === j.max ? j.min + ' joueurs' : j.min + ' à ' + j.max + ' joueurs'}</small>
        <em>${escapeHtml(j.resume)}</em>
      </span>
    </label>`).join('');
  el.innerHTML = `
    <div class="card">
      <h2>Parties</h2>
      <p style="color:var(--muted);">Joue en direct contre d'autres joueurs : crée un salon, partage le code ou le lien, et lance la partie à plusieurs.</p>
    </div>
    <div class="card">
      <h3>Rejoindre par code</h3>
      <div class="partie-actions">
        <input type="text" id="partieCodeInput" placeholder="Code du salon" maxlength="5" value="${escapeHtml(codeUrl)}" style="text-transform:uppercase; width:120px;">
        <input type="password" id="partieCodeMdp" placeholder="Mot de passe (si besoin)" style="width:200px;">
        <button class="primary" id="btnRejoindreParCode">Rejoindre</button>
      </div>
    </div>
    <div class="card">
      <h3>Créer un salon</h3>
      <div class="jeu-choix-liste">${jeuxCartes}</div>
      <div class="partie-form" style="margin-top:14px;">
        <label>Nom du salon (optionnel)<input type="text" id="partieNomInput" maxlength="60" placeholder="Ex. Soirée jeu entre nous"></label>
        <div id="partieBlocSelection">${htmlSelectionSemaines()}</div>
        <div data-jeu-options="bombe">
          <label>Temps par tour<select id="partieTempsInput">${optionsHtmlPartie(PARTIES_TEMPS_TOUR_OPTIONS, 15000, ' secondes', 1000)}</select></label>
          <label>Vies par joueur<select id="partieViesInput">${optionsHtmlPartie(PARTIES_VIES_OPTIONS, 3, '')}</select></label>
        </div>
        <div data-jeu-options="duel" hidden>
          <label>Nombre de manches<select id="partieDuelManches">${optionsHtmlPartie(PARTIES_DUEL_MANCHES_OPTIONS, 10, '')}</select></label>
          <label>Temps pour répondre<select id="partieDuelTemps">${optionsHtmlPartie(PARTIES_DUEL_TEMPS_OPTIONS, 10000, ' secondes', 1000)}</select></label>
        </div>
        <div data-jeu-options="relais" hidden>
          <label>Temps par tour<select id="partieRelaisTemps">${optionsHtmlPartie(PARTIES_RELAIS_TEMPS_OPTIONS, 20000, ' secondes', 1000)}</select></label>
          <p style="color:var(--muted); font-size:13px; margin:0;">Pas de choix de semaines : tout le vocabulaire est utilisé. 3 vies par joueur.</p>
        </div>
        <div data-jeu-options="dessin" hidden>
          <label>Temps par dessin<select id="partieDessinTemps">${optionsHtmlPartie(PARTIES_DESSIN_TEMPS_OPTIONS, 60000, ' secondes', 1000)}</select></label>
        </div>
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

  const jeuChoisi = () => (el.querySelector('input[name="partieJeu"]:checked') || {}).value || 'bombe';
  const majOptions = () => {
    const jeu = jeuChoisi();
    $$('[data-jeu-options]', el).forEach(b => { b.hidden = b.dataset.jeuOptions !== jeu; });
    $('#partieBlocSelection').hidden = !PARTIES_JEUX[jeu].pool;
  };
  $$('input[name="partieJeu"]', el).forEach(r => { r.onchange = majOptions; });
  majOptions();
  brancherSelectionSemaines($('#partieBlocSelection'));

  $('#btnRejoindreParCode').onclick = () => {
    rejoindrePartieParCode($('#partieCodeInput').value, $('#partieCodeMdp').value);
  };
  $('#btnCreerPartie').onclick = () => {
    const jeu = jeuChoisi();
    creerPartie({
      jeu,
      nom: $('#partieNomInput').value.trim(),
      selection: Array.from(selectionSemainesForm),
      tempsTourMs: jeu === 'relais' ? parseInt($('#partieRelaisTemps').value, 10) : parseInt($('#partieTempsInput').value, 10),
      vies: parseInt($('#partieViesInput').value, 10),
      manches: parseInt($('#partieDuelManches').value, 10),
      tempsMs: jeu === 'duel' ? parseInt($('#partieDuelTemps').value, 10) : parseInt($('#partieDessinTemps').value, 10),
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
      const infos = PARTIES_JEUX[p.jeu] || PARTIES_JEUX.bombe;
      return `
        <div class="partie-liste-item">
          <div>
            <strong>${infos.icone} ${escapeHtml(p.nom || 'Salon sans nom')}</strong>
            <div style="color:var(--muted); font-size:12.5px;">${escapeHtml(infos.nom)} · ${escapeHtml(p.hote_pseudo || "quelqu'un")} · ${nbJoueurs}/${infos.max} joueur${nbJoueurs > 1 ? 's' : ''} · code ${p.code}</div>
          </div>
          <button class="secondary small" data-rejoindre-partie="${p.id}">Rejoindre</button>
        </div>`;
    }).join('');
    $$('[data-rejoindre-partie]', zone).forEach(btn => {
      btn.onclick = () => rejoindrePartieDepuisListe(btn.dataset.rejoindrePartie);
    });
  });
}

// ---------------------------------------------------------------------------
// Salon d'attente
// ---------------------------------------------------------------------------

function renderPartieLobby(el) {
  const jeSuisHote = partieCourante.hote_id === window.accountUser.id;
  const infos = PARTIES_JEUX[partieCourante.jeu] || PARTIES_JEUX.bombe;
  const n = joueursPartieCourante.length;
  const peutLancer = n >= infos.min && n <= infos.max;
  const joueursHtml = joueursPartieCourante.map(j => `
    <div class="partie-joueur-chip">
      <span>${escapeHtml(j.pseudo || 'Joueur')}${j.user_id === partieCourante.hote_id ? ' 👑' : ''}</span>
      ${jeSuisHote && j.user_id !== window.accountUser.id ? `<button class="secondary small" data-retirer-joueur="${j.user_id}" title="Retirer du salon">✕</button>` : ''}
    </div>`).join('');
  el.innerHTML = `
    <div class="card">
      <h2>${infos.icone} ${escapeHtml(partieCourante.nom || 'Salon sans nom')}</h2>
      <p style="color:var(--muted);"><strong>${escapeHtml(infos.nom)}</strong> — ${escapeHtml(infos.resume)}</p>
      <div class="salon-code">
        <span>Code du salon</span><strong>${partieCourante.code}</strong>
        <button class="secondary small" id="btnCopierLienSalon">Copier le lien</button>
      </div>
      <p style="color:var(--muted);">${escapeHtml(libelleReglagesPartie(partieCourante.jeu, partieCourante.config))}${PARTIES_JEUX[partieCourante.jeu].pool ? ' · ' + escapeHtml(libelleContenuPartie(partieCourante.config)) : ' · tout le vocabulaire'}${partieCourante.mot_de_passe ? ' · protégé par mot de passe' : ''}${partieCourante.amis_uniquement ? " · réservé aux amis de l'hôte" : ''}</p>
      <h3>Joueurs (${n}/${infos.max})</h3>
      <div class="partie-joueurs-liste">${joueursHtml}</div>
      <div class="partie-actions" style="margin-top:14px;">
        ${jeSuisHote
          ? `<button class="primary" id="btnDemarrerPartie" ${peutLancer ? '' : 'disabled'}>Démarrer la partie</button>${peutLancer ? '' : `<span style="color:var(--muted);">${n < infos.min ? `Il faut au moins ${infos.min} joueurs.` : `Maximum ${infos.max} joueurs.`}</span>`}`
          : `<p style="color:var(--muted);">En attente que l'hôte démarre la partie…</p>`}
        <button class="secondary" id="btnQuitterPartie">Quitter le salon</button>
      </div>
    </div>`;
  if (jeSuisHote) {
    $('#btnDemarrerPartie').onclick = () => demarrerPartie();
    $$('[data-retirer-joueur]', el).forEach(btn => { btn.onclick = () => retirerJoueurPartie(btn.dataset.retirerJoueur); });
  }
  $('#btnCopierLienSalon').onclick = async () => {
    try { await navigator.clipboard.writeText(lienSalon(partieCourante.code)); showToast('Lien copié.'); }
    catch (e) { showToast(lienSalon(partieCourante.code)); }
  };
  $('#btnQuitterPartie').onclick = () => quitterPartie();
}

// ---------------------------------------------------------------------------
// Jeu de la bombe (refonte visuelle 02/10/2026)
// ---------------------------------------------------------------------------

let bombeCleFlash = null;

const BOMBE_SVG = `
  <svg class="bombe-svg" viewBox="0 0 220 230" aria-hidden="true">
    <defs>
      <radialGradient id="bombeCorps" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stop-color="#5a5f86"/><stop offset="55%" stop-color="#26283f"/><stop offset="100%" stop-color="#12121f"/>
      </radialGradient>
    </defs>
    <ellipse cx="110" cy="218" rx="62" ry="8" fill="rgba(0,0,0,.35)"/>
    <circle cx="110" cy="132" r="82" fill="url(#bombeCorps)" stroke="#0b0b16" stroke-width="3"/>
    <ellipse cx="78" cy="96" rx="22" ry="12" fill="rgba(255,255,255,.18)" transform="rotate(-35 78 96)"/>
    <rect x="92" y="38" width="36" height="22" rx="5" fill="#9a9db8" stroke="#0b0b16" stroke-width="3"/>
    <path id="bombeMecheFond" d="M110 38 C110 18, 128 12, 150 10 C168 9, 176 20, 186 14" fill="none" stroke="#3a2d22" stroke-width="5" stroke-linecap="round"/>
    <path id="bombeMeche" pathLength="100" d="M110 38 C110 18, 128 12, 150 10 C168 9, 176 20, 186 14" fill="none" stroke="#d9b27a" stroke-width="5" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="0"/>
    <g id="bombeEtincelle"><circle r="9" fill="#ffb340"/><circle r="5" fill="#fff3b0"/></g>
  </svg>`;

function majMecheBombe(ratio) {
  const meche = $('#bombeMeche');
  const etincelle = $('#bombeEtincelle');
  const scene = $('#bombeScene');
  if (!meche || !etincelle) return;
  const r = Math.max(0, Math.min(1, ratio));
  meche.style.strokeDashoffset = String(100 * (1 - r));
  try {
    const len = meche.getTotalLength();
    const pt = meche.getPointAtLength(len * r);
    etincelle.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
  } catch (e) { /* SVG non mesurable (tests) */ }
  if (scene) scene.classList.toggle('bombe-scene--alerte', r < 0.22);
}

function renderPartieJeu(el) {
  const ej = partieCourante.etat_jeu;
  if (ej && ej.jeu) { renderJeuParties(el, ej); return; }
  if (!ej || !ej.ordre) { el.innerHTML = `<div class="card"><p style="color:var(--muted);">Préparation de la partie…</p></div>`; return; }
  const monId = window.accountUser.id;
  const monTour = ej.ordre[ej.joueurActifIndex] === monId;
  const mot = DB.vocab.find(v => v.id === ej.motActuelId);
  const pseudoDe = (uid) => {
    const j = joueursPartieCourante.find(x => x.user_id === uid);
    return (j && j.pseudo) || 'Joueur';
  };
  const cartes = ej.ordre.map((uid, i) => `
    <div class="bombe-joueur ${i === ej.joueurActifIndex ? 'bombe-joueur--actif' : ''}">
      <div class="bombe-joueur__pastille">${escapeHtml(pseudoDe(uid).slice(0, 1).toUpperCase())}</div>
      <div class="bombe-joueur__nom">${escapeHtml(pseudoDe(uid))}${uid === monId ? ' (toi)' : ''}</div>
      <div class="partie-vies">${'❤️'.repeat(Math.max(0, ej.vies[uid] || 0))}</div>
    </div>`).join('');
  const r = ej.dernierResultat;
  const cleFlash = r ? ej.finTourA : null;
  let flash = '';
  if (r && cleFlash !== bombeCleFlash) {
    flash = r.issue === 'reussi'
      ? `<div class="bombe-flash bombe-flash--ok">✔ ${escapeHtml(pseudoDe(r.joueurId))} désamorce !</div>`
      : `<div class="bombe-flash bombe-flash--boum"><span>💥</span> ${escapeHtml(pseudoDe(r.joueurId))} perd une vie</div>`;
    bombeCleFlash = cleFlash;
  }
  el.innerHTML = `
    <div class="card jeu-carte jeu-carte--bombe">
      <h2>💣 Jeu de la bombe</h2>
      <div class="bombe-joueurs">${cartes}</div>
      <div class="bombe-scene" id="bombeScene">
        ${BOMBE_SVG}
        <div class="bombe-mot-carte">
          <div class="partie-mot-actif bombe-mot">${mot ? escapeHtml(mot.mot) : '…'}</div>
        </div>
        ${flash}
      </div>
      <div class="partie-minuteur">
        <div class="partie-minuteur-barre"><div class="partie-minuteur-barre__remplissage" id="partieMinuteurBarre"></div></div>
        <span id="partieMinuteurTexte" class="partie-minuteur-texte">…</span>
      </div>
      ${monTour ? `
        <p class="bombe-consigne"><strong>À toi de jouer !</strong> Tape la lecture du mot avant l'explosion.</p>
        <div class="partie-actions bombe-saisie">
          <input type="text" id="partieReponseInput" autocomplete="off" placeholder="Lecture (hiragana)" autofocus>
          <button class="primary" id="btnValiderReponsePartie">Valider</button>
        </div>` : `<p class="bombe-consigne" style="color:var(--muted);">Tour de ${escapeHtml(pseudoDe(ej.ordre[ej.joueurActifIndex]))}…</p>`}
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

// ---------------------------------------------------------------------------
// Fin de partie
// ---------------------------------------------------------------------------

function renderPartieFin(el) {
  const ej = partieCourante.etat_jeu || {};
  const jeSuisHote = partieCourante.hote_id === window.accountUser.id;
  const pseudoDe = (uid) => {
    const j = joueursPartieCourante.find(x => x.user_id === uid);
    return (j && j.pseudo) || 'Joueur';
  };
  const jaiGagne = ej.vainqueurId === window.accountUser.id;
  const corps = ej.jeu
    ? htmlFinJeu(ej)
    : `<p>${ej.vainqueurId ? `🏆 ${escapeHtml(pseudoDe(ej.vainqueurId))} remporte la partie${jaiGagne ? ' — bravo !' : ''}` : 'Partie terminée.'}</p>`;
  el.innerHTML = `
    <div class="card jeu-carte jeu-carte--fin">
      <h2>Partie terminée</h2>
      ${corps}
      <div class="partie-actions" style="margin-top:14px;">
        ${jeSuisHote ? `<button class="primary" id="btnRejouerPartie">Rejouer avec le même salon</button>` : `<p style="color:var(--muted);">En attente que l'hôte relance une manche…</p>`}
        <button class="secondary" id="btnQuitterPartieFin">Quitter le salon</button>
      </div>
    </div>`;
  if (jeSuisHote) $('#btnRejouerPartie').onclick = () => rejouerPartieBombe();
  $('#btnQuitterPartieFin').onclick = () => quitterPartie();
}
