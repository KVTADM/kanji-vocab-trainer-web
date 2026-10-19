// ============================================================
// Connexion avec Google.
//
// Deux portes d'entree, toutes deux branchees sur Supabase Auth :
//   1. Le bouton « Continuer avec Google » (onglet Compte) : redirection
//      OAuth classique, la session revient dans l'URL (supabase-js la lit seul).
//   2. La petite fenetre Google « One Tap » en haut a droite, proposee
//      automatiquement a un visiteur non connecte quand son navigateur connait
//      un compte Google. On recoit un jeton, qu'on echange contre une session
//      Supabase (signInWithIdToken), avec un nonce pour empecher le rejeu.
//
// ACTIVATION : tant que KVT_GOOGLE_CLIENT_ID est vide, TOUT est desactive (ni
// bouton, ni fenetre, ni script Google charge). L'identifiant client n'est pas
// un secret : il est fait pour apparaitre dans le code du navigateur. Le SECRET
// client, lui, ne va JAMAIS ici : il se colle uniquement dans Supabase
// (Authentication > Providers > Google).
//
// Compte cree via Google : le declencheur handle_new_user donne le pseudo
// « Élève » (il ne lit que raw_user_meta_data->>'pseudo'). On n'utilise donc
// JAMAIS le vrai nom Google comme pseudo public ; la personne le choisit dans
// l'onglet Compte.
// ============================================================
(function () {
  const KVT_GOOGLE_CLIENT_ID = ''; // ex. '1234567890-abcdef.apps.googleusercontent.com'
  const CLE_FERME = 'kvtOneTapFerme';

  function actif() { return typeof KVT_GOOGLE_CLIENT_ID === 'string' && /\.apps\.googleusercontent\.com$/.test(KVT_GOOGLE_CLIENT_ID); }

  function boutonHtml() {
    if (!actif()) return '';
    return '<div class="form-row kvt-google-bloc">' +
      '<button type="button" class="kvt-google-btn" id="btnGoogle"><span class="kvt-google-pastille" aria-hidden="true"></span>Continuer avec Google</button>' +
      '</div><div class="kvt-google-sep"><span>ou avec ton e-mail</span></div>';
  }

  async function lancerOAuth() {
    if (!window.sb) return;
    const { error } = await window.sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/app/' }
    });
    if (error && typeof showToast === 'function') showToast('Connexion Google impossible : ' + error.message);
  }

  function brancher(racine) {
    const b = (racine || document).querySelector('#btnGoogle');
    if (b) b.addEventListener('click', lancerOAuth);
  }

  // ---- One Tap ----
  function aleatoire() {
    const o = new Uint8Array(32);
    crypto.getRandomValues(o);
    return Array.from(o, x => x.toString(16).padStart(2, '0')).join('');
  }
  async function empreinte(txt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf), x => x.toString(16).padStart(2, '0')).join('');
  }
  function chargerGsi() {
    return new Promise((ok, ko) => {
      if (window.google && window.google.accounts && window.google.accounts.id) return ok();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = () => ok(); s.onerror = () => ko(new Error('gsi'));
      document.head.appendChild(s);
    });
  }

  async function afficherOneTap() {
    if (!actif() || !window.sb || !window.crypto || !crypto.subtle) return;
    try { if (sessionStorage.getItem(CLE_FERME) === '1') return; } catch (e) { /* tant pis */ }
    const { data } = await window.sb.auth.getSession();
    if (data && data.session) return; // deja connecte : on ne propose rien
    try { await chargerGsi(); } catch (e) { return; }
    const brut = aleatoire();
    const hache = await empreinte(brut);
    window.google.accounts.id.initialize({
      client_id: KVT_GOOGLE_CLIENT_ID,
      nonce: hache,
      auto_select: false,
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: true,
      callback: async (rep) => {
        if (!rep || !rep.credential) return;
        const { error } = await window.sb.auth.signInWithIdToken({ provider: 'google', token: rep.credential, nonce: brut });
        if (typeof showToast === 'function') showToast(error ? 'Connexion Google impossible : ' + error.message : 'Connecté avec Google');
      }
    });
    window.google.accounts.id.prompt((n) => {
      // Fermee a la main : on ne la repropose pas pendant cette visite.
      if (n && ((n.isDismissedMoment && n.isDismissedMoment() && n.getDismissedReason && n.getDismissedReason() !== 'credential_returned') || (n.isSkippedMoment && n.isSkippedMoment()))) {
        try { sessionStorage.setItem(CLE_FERME, '1'); } catch (e) { /* tant pis */ }
      }
    });
  }

  window.kvtGoogle = { actif, boutonHtml, brancher, afficherOneTap, _lancerOAuth: lancerOAuth };

  // Proposee quelques secondes apres l'arrivee, seulement dans l'appli.
  if (typeof setTimeout === 'function' && typeof location !== 'undefined' && /^\/app(\/|$)/.test(location.pathname)) {
    setTimeout(() => { afficherOneTap().catch(() => {}); }, 2500);
  }
})();
