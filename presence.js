// ============================================================
// Gens en ligne (Realtime Presence de Supabase).
//
// Rien n'est ecrit en base : la presence vit dans la memoire du serveur
// Realtime et disparait toute seule quand l'onglet se ferme ou se masque.
// Chaque onglet visible annonce { u: identifiant | null }.
//   - Compte connecte : u = son identifiant (sert a allumer la pastille verte
//     chez SES AMIS uniquement : on ne l'affiche jamais ailleurs).
//   - Visiteur non connecte, ou compte qui a choisi de ne pas apparaitre
//     (Reglages) : u = null. Il est compte, mais personne ne peut le reconnaitre.
// Si Realtime est indisponible, tout reste invisible : l'appli ne casse pas.
// ============================================================
(function () {
  const CLE_MASQUE = 'kvtMasquerEnLigne';
  const NOM_CANAL = 'kvt-presence';
  let canal = null, abonne = false, suivi = false;
  let enLigne = new Set();     // identifiants de comptes visibles
  let total = 0;               // nombre de personnes distinctes
  const ecouteurs = [];
  const cleOnglet = 'o' + Math.random().toString(36).slice(2, 10);

  function estMasque() {
    try { return localStorage.getItem(CLE_MASQUE) === '1'; } catch (e) { return false; }
  }
  function monIdentifiant() {
    const u = window.accountUser;
    return u && u.id && !estMasque() ? u.id : null;
  }
  function estEnLigne(userId) { return !!userId && enLigne.has(userId); }
  function nombre() { return total; }

  // Calcule l'etat a partir de presenceState() : { cle: [ { u } ] }.
  function calculer(etat) {
    const ids = new Set();
    const personnes = new Set();
    Object.keys(etat || {}).forEach(cle => {
      const metas = etat[cle] || [];
      metas.forEach(m => {
        const u = m && typeof m.u === 'string' ? m.u : null;
        if (u) { ids.add(u); personnes.add('u:' + u); } else personnes.add('k:' + cle);
      });
    });
    enLigne = ids;
    total = personnes.size;
  }

  function pastilleHtml(userId) {
    if (!userId) return '';
    return `<span class="en-ligne-pastille" data-presence-uid="${String(userId).replace(/[^A-Za-z0-9-]/g, '')}" title="En ligne" aria-label="En ligne" ${estEnLigne(userId) ? '' : 'hidden'}></span>`;
  }

  function majDom() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-presence-uid]').forEach(el => {
      const visible = estEnLigne(el.getAttribute('data-presence-uid'));
      if (el.hidden === visible) el.hidden = !visible;
    });
    document.querySelectorAll('[data-presence-compteur]').forEach(el => {
      const texte = total > 0 ? `${total} en ligne` : '';
      if (el.getAttribute('data-n') !== String(total)) {
        el.setAttribute('data-n', String(total));
        el.textContent = texte;
      }
      el.hidden = total <= 0;
    });
  }
  function prevenir() { majDom(); ecouteurs.forEach(f => { try { f(); } catch (e) { /* un ecouteur ne casse pas les autres */ } }); }
  function surChangement(f) { if (typeof f === 'function') ecouteurs.push(f); }

  function annoncer() {
    if (!canal || !abonne) return;
    const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
    try {
      if (visible) { suivi = true; canal.track({ u: monIdentifiant() }); }
      else if (suivi) { suivi = false; canal.untrack(); }
    } catch (e) { /* Realtime indisponible : on reste discret */ }
  }

  function demarrer() {
    if (canal || !window.sb || typeof window.sb.channel !== 'function') return;
    try {
      canal = window.sb.channel(NOM_CANAL, { config: { presence: { key: cleOnglet } } });
      canal.on('presence', { event: 'sync' }, () => { calculer(canal.presenceState()); prevenir(); });
      canal.subscribe(statut => {
        if (statut === 'SUBSCRIBED') { abonne = true; annoncer(); }
        else if (statut === 'CLOSED' || statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT') { abonne = false; }
      });
    } catch (e) { canal = null; }
  }

  function masquer(oui) {
    try { localStorage.setItem(CLE_MASQUE, oui ? '1' : '0'); } catch (e) { /* stockage indisponible */ }
    suivi = false; annoncer();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', annoncer);
    document.addEventListener('change', ev => {
      const c = ev.target;
      if (c && c.id === 'chkApparaitreEnLigne') masquer(!c.checked);
    });
    // Les listes (amis, classement) sont redessinees en bloc : on rallume les pastilles apres coup.
    let attente = null;
    const obs = new MutationObserver(() => {
      if (attente) return;
      attente = setTimeout(() => { attente = null; majDom(); }, 120);
    });
    const brancher = () => { if (document.body) obs.observe(document.body, { childList: true, subtree: true }); };
    if (document.body) brancher(); else document.addEventListener('DOMContentLoaded', brancher);
  }
  // Quand le compte change (connexion / deconnexion), on re-annonce l'identite courante.
  if (window.sb && window.sb.auth && typeof window.sb.auth.onAuthStateChange === 'function') {
    window.sb.auth.onAuthStateChange(() => { setTimeout(() => { suivi = false; annoncer(); }, 1500); });
  }
  if (typeof window !== 'undefined') setTimeout(demarrer, 2000);

  window.kvtPresence = { estEnLigne, nombre, pastilleHtml, majDom, surChangement, estMasque, masquer, _calculer: calculer };
})();
