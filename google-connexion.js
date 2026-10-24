// ============================================================
// Fenetre de connexion + connexion avec Google.
//
// 1. Fenetre « Compte KVT » (bouton Connexion en haut a droite quand on n'est
//    pas connecte) : onglets Se connecter / Creer un compte, bouton Google,
//    e-mail + mot de passe. Memes appels Supabase que l'onglet Compte ; la
//    session est geree par onAuthStateChange (account.js), la fenetre se
//    ferme toute seule des qu'une session existe.
// 2. Bouton « Continuer avec Google » : redirection OAuth Supabase.
// 3. Fenetre Google « One Tap » en haut a droite, proposee automatiquement a
//    un visiteur non connecte quand son navigateur connait un compte Google :
//    jeton echange contre une session Supabase (signInWithIdToken) avec un
//    nonce pour empecher le rejeu.
//
// ACTIVATION DE GOOGLE : tant que KVT_GOOGLE_CLIENT_ID est vide, ni le bouton
// Google ni la fenetre One Tap n'existent et aucun script Google n'est charge
// (la fenetre de connexion e-mail, elle, fonctionne toujours). L'identifiant
// client n'est pas un secret. Le SECRET client ne va JAMAIS ici : il se colle
// uniquement dans Supabase (Authentication > Providers > Google).
//
// Compte cree via Google : le declencheur handle_new_user donne le pseudo
// « Élève » (il ne lit que raw_user_meta_data->>'pseudo'). Le vrai nom Google
// n'est JAMAIS utilise comme pseudo public.
// ============================================================
(function () {
  const KVT_GOOGLE_CLIENT_ID = '892843371297-2uvg9aomt26gtrive0iq8ivvit7ci6id.apps.googleusercontent.com';
  const CLE_FERME = 'kvtOneTapFerme';

  function actif() { return typeof KVT_GOOGLE_CLIENT_ID === 'string' && /\.apps\.googleusercontent\.com$/.test(KVT_GOOGLE_CLIENT_ID); }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }

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
    if (error) toast('Connexion Google impossible : ' + error.message);
  }

  function brancher(racine) {
    const b = (racine || document).querySelector('#btnGoogle');
    if (b) b.addEventListener('click', lancerOAuth);
  }

  // ---- Fenetre de connexion ----
  function fermerConnexion() {
    const ov = document.getElementById('kvtConnexion');
    if (!ov) return;
    ov.classList.remove('on');
    setTimeout(() => ov.remove(), 220);
    document.removeEventListener('keydown', surTouche);
  }
  function surTouche(e) { if (e.key === 'Escape') fermerConnexion(); }

  function ouvrirConnexion(onglet) {
    if (document.getElementById('kvtConnexion')) return;
    const ov = document.createElement('div');
    ov.className = 'modal-backdrop kvt-co';
    ov.id = 'kvtConnexion';
    ov.innerHTML = '<div class="modal-box kvt-co__box" role="dialog" aria-modal="true" aria-labelledby="kcTitre">' +
      '<div class="kvt-co__tete"><b id="kcTitre">Compte KVT</b><button type="button" class="kvt-co__x" aria-label="Fermer">✕</button></div>' +
      '<div class="kvt-co__onglets" data-o="0"><i></i><button type="button" data-o="0" class="on">Se connecter</button><button type="button" data-o="1">Créer un compte</button></div>' +
      boutonHtml() +
      '<label class="kvt-co__champ">E-mail<input type="email" id="kcEmail" autocomplete="email" placeholder="toi@exemple.com"></label>' +
      '<label class="kvt-co__champ">Mot de passe<input type="password" id="kcMdp" autocomplete="current-password"></label>' +
      '<label class="kvt-co__champ" id="kcPseudoBloc" hidden>Pseudo (affiché sur le classement)<input type="text" id="kcPseudo" maxlength="30" placeholder="Pas ton vrai nom"></label>' +
      '<div class="kvt-co__msg" id="kcMsg" role="status"></div>' +
      '<button type="button" class="primary kvt-co__ok" id="kcValider">Se connecter</button>' +
      '<button type="button" class="kvt-co__lien" id="kcOubli">Mot de passe oublié ?</button>' +
      '</div>';
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('on'));
    document.addEventListener('keydown', surTouche);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) fermerConnexion(); });
    ov.querySelector('.kvt-co__x').onclick = fermerConnexion;
    brancher(ov);

    const q = (s) => ov.querySelector(s);
    const msg = (t, bon) => { const m = q('#kcMsg'); m.textContent = t || ''; m.dataset.bon = bon ? '1' : ''; };
    const onglets = q('.kvt-co__onglets');
    function choisir(o) {
      onglets.dataset.o = o;
      onglets.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.o === String(o)));
      q('#kcPseudoBloc').hidden = String(o) !== '1';
      q('#kcValider').textContent = String(o) === '1' ? 'Créer mon compte' : 'Se connecter';
      q('#kcMdp').autocomplete = String(o) === '1' ? 'new-password' : 'current-password';
      q('#kcOubli').hidden = String(o) === '1';
      msg('');
    }
    onglets.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) choisir(b.dataset.o); });
    choisir(onglet === 1 ? 1 : 0);

    q('#kcValider').onclick = async () => {
      const email = q('#kcEmail').value.trim();
      const mdp = q('#kcMdp').value;
      msg('');
      if (!email || !mdp) { msg('Renseigne ton e-mail et ton mot de passe.'); return; }
      const bouton = q('#kcValider');
      bouton.disabled = true;
      try {
        if (onglets.dataset.o === '1') {
          const pseudo = q('#kcPseudo').value.trim();
          if (!pseudo) { msg("Choisis un pseudo pour t'inscrire."); return; }
          const { data, error } = await window.sb.auth.signUp({ email, password: mdp, options: { data: { pseudo } } });
          if (error) { msg(error.message); return; }
          if (window.kvtMesure) window.kvtMesure.noter('compte_cree');
          if (data && data.session) toast('Compte créé et connecté');
          else msg('Compte créé pour ' + email + ' — vérifie ta boîte mail et clique sur le lien de confirmation avant de te connecter.', true);
        } else {
          const { error } = await window.sb.auth.signInWithPassword({ email, password: mdp });
          if (error) { msg(error.message); return; }
          toast('Connecté');
        }
      } finally { bouton.disabled = false; }
    };
    q('#kcOubli').onclick = async () => {
      const email = q('#kcEmail').value.trim();
      if (!email) { msg('Renseigne ton e-mail au-dessus, puis reclique ici.'); return; }
      const { error } = await window.sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/' });
      if (error && !/rate|limit/i.test(error.message)) { msg(error.message); return; }
      if (error) { msg('Trop de demandes. Réessaie dans quelques minutes.'); return; }
      msg("Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé. Pense à regarder dans les indésirables.", true);
    };
    setTimeout(() => { const f = q('#kcEmail'); if (f) f.focus(); }, 60);
  }

  function boutonTopbarHtml() {
    return '<button type="button" class="secondary small kvt-co-ouvrir" data-ouvrir-connexion>Connexion</button>';
  }

  // ---- One Tap ----
  function aleatoire() {
    const o = new Uint8Array(32);
    crypto.getRandomValues(o);
    return Array.from(o, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function empreinte(txt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
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
        toast(error ? 'Connexion Google impossible : ' + error.message : 'Connecté avec Google');
      }
    });
    window.google.accounts.id.prompt((n) => {
      // Fermee a la main : on ne la repropose pas pendant cette visite.
      if (n && ((n.isDismissedMoment && n.isDismissedMoment() && n.getDismissedReason && n.getDismissedReason() !== 'credential_returned') || (n.isSkippedMoment && n.isSkippedMoment()))) {
        try { sessionStorage.setItem(CLE_FERME, '1'); } catch (e) { /* tant pis */ }
      }
    });
  }

  window.kvtGoogle = { actif, boutonHtml, brancher, afficherOneTap, ouvrirConnexion, fermerConnexion, boutonTopbarHtml, _lancerOAuth: lancerOAuth };

  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-ouvrir-connexion]');
      if (b) ouvrirConnexion(0);
    });
    // Une session existe : la fenetre n'a plus lieu d'etre.
    if (window.sb && window.sb.auth && window.sb.auth.onAuthStateChange) {
      window.sb.auth.onAuthStateChange((ev, session) => { if (session) fermerConnexion(); });
    }
    // One Tap proposee quelques secondes apres l'arrivee, seulement dans l'appli.
    if (typeof setTimeout === 'function' && typeof location !== 'undefined' && /^\/app(\/|$)/.test(location.pathname)) {
      setTimeout(() => { afficherOneTap().catch(() => {}); }, 2500);
    }
  }
})();
