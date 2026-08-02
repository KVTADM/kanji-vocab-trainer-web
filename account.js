// ============================================================
// Vue "Compte" : connexion / inscription Supabase, + sync/sauvegarde
// cloud. Fichier séparé exprès pour ne pas toucher plus que nécessaire
// à app.js (qui reste partagé avec les versions Mac/amis). Entièrement
// optionnel — l'app continue de fonctionner sans compte, en local sur
// l'appareil, comme avant. Un compte sert seulement à synchroniser la
// progression entre appareils et à apparaître sur le classement de la
// classe (leaderboard à venir).
//
// window.accountUser (et pas une simple variable locale) pour que
// webapi.js puisse vérifier l'état de connexion au moment de sauvegarder.
//
// Tout l'état de connexion passe par onAuthStateChange plutôt que par un
// enchaînement manuel après signIn/signUp : c'est l'appel officiel
// Supabase qui garantit que la session est pleinement établie (jeton
// d'auth propagé) avant qu'on interroge la base — appeler une requête
// juste après la promesse de signIn peut sinon échouer silencieusement
// (RLS renvoie "aucune ligne" plutôt qu'une erreur explicite).
// ============================================================
window.accountUser = null; // { id, email, pseudo } une fois connecté, sinon null
let kvtSyncedThisSession = false;

// Vrai uniquement pendant une réinitialisation de mot de passe : l'utilisateur
// arrive depuis le lien reçu par mail, Supabase ouvre une session valide mais
// il faut lui faire choisir un nouveau mot de passe avant toute autre chose.
// Sans ce drapeau, renderAccount() afficherait la vue "connecté" habituelle et
// l'utilisateur n'aurait aucun moyen de définir son mot de passe.
let kvtPasswordRecovery = false;

// Seul admin autorisé (voir aussi la vraie vérification, côté serveur,
// dans la Edge Function admin-users — ce flag ici ne sert qu'à
// afficher/cacher l'onglet, jamais à autoriser quoi que ce soit tout seul).
const ADMIN_USER_ID = 'e511a05f-899e-4c50-9390-b31330d4dda8';

async function buildAccountUser(session) {
  const [{ data: profile }, { data: pro }] = await Promise.all([
    window.sb.from('profiles').select('pseudo').eq('id', session.user.id).maybeSingle(),
    // Statut Pro : lecture seule côté client (voir policy RLS sur
    // pro_status) — personne ne peut se déclarer Pro soi-même depuis le
    // navigateur, ce sera écrit uniquement par le futur webhook Stripe.
    window.sb.from('pro_status').select('is_pro').eq('user_id', session.user.id).maybeSingle()
  ]);
  return {
    id: session.user.id,
    email: session.user.email,
    pseudo: profile ? profile.pseudo : null,
    isPro: !!(pro && pro.is_pro),
    isAdmin: session.user.id === ADMIN_USER_ID
  };
}

// --- Sync cloud : sauvegarde complète (le même blob que IndexedDB) dans
// la table user_backups, protégée par RLS (chacun ne voit que la sienne).
window.kvtPushCloud = async function (data) {
  if (!window.accountUser) return;
  await window.sb.from('user_backups').upsert({
    user_id: window.accountUser.id,
    data,
    updated_at: new Date().toISOString()
  });
};

// --- Classement de classe : pousse le meilleur score personnel d'une
// semaine donnée dans la table scores (jamais le nom réel, uniquement le
// pseudo choisi à l'inscription). upsert sur (user_id, semester_id, week)
// pour ne garder qu'une ligne par utilisateur et par semaine — toujours le
// record, jamais chaque tentative individuelle.
window.kvtPushScore = async function (semesterId, week, points, maxPoints, pct) {
  if (!window.accountUser || !window.accountUser.pseudo) return;
  await window.sb.from('scores').upsert({
    user_id: window.accountUser.id,
    pseudo: window.accountUser.pseudo,
    semester_id: semesterId,
    week,
    points,
    max_points: maxPoints,
    pct
  }, { onConflict: 'user_id,semester_id,week' });
};

// Pousse les meilleurs scores locaux (par semaine, voir DB.scores) vers le
// classement de la classe, sans jamais écraser un meilleur score déjà en
// ligne pour la même semaine. Sert notamment quand une sauvegarde faite
// hors ligne (app Mac, version amis — sans compte ni classement) est
// importée ici : ses records peuvent enfin apparaître sur le classement.
window.kvtPushAllScores = async function (data) {
  if (!window.accountUser || !window.accountUser.pseudo || !data || !data.scores) return;
  const entries = Object.entries(data.scores).filter(([, v]) => v && v.best);
  if (entries.length === 0) return;

  const { data: existing } = await window.sb
    .from('scores')
    .select('semester_id, week, points')
    .eq('user_id', window.accountUser.id);
  const existingMap = new Map((existing || []).map(r => [`${r.semester_id}-w${r.week}`, r.points]));

  for (const [key, entry] of entries) {
    const m = key.match(/^(.+)-w(\d+)$/);
    if (!m) continue;
    const semesterId = m[1];
    const week = parseInt(m[2], 10);
    const currentPoints = existingMap.get(key);
    if (currentPoints !== undefined && currentPoints >= entry.best.points) continue;
    await window.kvtPushScore(semesterId, week, entry.best.points, entry.best.maxPoints, entry.best.pct);
  }
};

// Distingue explicitement "pas encore de sauvegarde cloud" (ok, ligne
// absente, sûr de pousser les données locales) de "erreur réseau/RLS"
// (jamais sûr — on ne touche à rien plutôt que de risquer d'écraser une
// vraie sauvegarde avec des données locales fraîches/vides).
async function kvtPullCloud() {
  if (!window.accountUser) return { ok: false, data: null };
  const { data, error } = await window.sb
    .from('user_backups')
    .select('data')
    .eq('user_id', window.accountUser.id)
    .maybeSingle();
  if (error) return { ok: false, data: null };
  return { ok: true, data: data ? data.data : null };
}

// Appelé une seule fois par connexion interactive réussie (pas au simple
// rechargement de page avec session déjà active — voir onAuthStateChange
// plus bas). Simplification volontaire (pas de fusion intelligente entre
// deux appareils) : si une sauvegarde cloud existe déjà, elle remplace
// les données locales de cet appareil ; sinon, les données locales
// actuelles sont envoyées vers le cloud pour amorcer la sauvegarde.
async function syncAfterLogin() {
  if (!window.accountUser) return;
  let result = await kvtPullCloud();
  if (!result.ok) {
    showToast('Sync impossible (réseau) — données locales conservées');
    return;
  }
  // Juste après une connexion, il arrive que la toute première requête ne
  // trouve rien même quand une sauvegarde existe bel et bien (propagation
  // du jeton d'authentification pas encore terminée côté client Supabase).
  // Une nouvelle tentative après une courte pause suffit à le confirmer
  // avant de conclure "pas de sauvegarde" — évite d'écraser une vraie
  // sauvegarde avec des données locales fraîches.
  if (!result.data) {
    await new Promise((r) => setTimeout(r, 700));
    result = await kvtPullCloud();
  }
  if (result.data) {
    DB = result.data;
    await window.api.saveData(DB);
    browsingWeek = null;
    if (typeof applyTheme === 'function') applyTheme();
    renderCurrentView();
    showToast('Sauvegarde cloud appliquée');
  } else {
    await window.kvtPushCloud(DB);
    await window.kvtPushAllScores(DB);
    showToast('Données synchronisées vers le cloud');
  }
}

window.sb.auth.onAuthStateChange((event, session) => {
  // shouldSync verrouillé de façon synchrone (avant tout await) pour
  // empêcher un double déclenchement si l'événement se déclenche deux
  // fois de suite très rapidement (ça arrive avec certains navigateurs).
  const shouldSync = !!session && event === 'SIGNED_IN' && !kvtSyncedThisSession;
  if (shouldSync) kvtSyncedThisSession = true;
  // Retour depuis le lien de réinitialisation reçu par mail : on bascule sur
  // l'onglet Compte, qui affichera le formulaire de nouveau mot de passe.
  if (event === 'PASSWORD_RECOVERY') {
    kvtPasswordRecovery = true;
    if (typeof switchView === 'function') switchView('account');
  }
  (async () => {
    if (session) {
      window.accountUser = await buildAccountUser(session);
      if (shouldSync) {
        await syncAfterLogin();
      }
    } else {
      window.accountUser = null;
      kvtSyncedThisSession = false;
    }
    // Onglet Admin : invisible pour tout le monde sauf le compte admin
    // (la vraie protection est côté serveur, ceci n'est qu'un confort).
    const navAdmin = $('#navAdmin');
    if (navAdmin) navAdmin.style.display = (window.accountUser && window.accountUser.isAdmin) ? '' : 'none';
    // Re-rend aussi Accueil/Vocabulaire/Réglages/Statistiques : leur
    // contenu dépend de isPro (pubs incluses), qui vient tout juste
    // d'être résolu ci-dessus.
    if (typeof currentView !== 'undefined' && ['dashboard', 'manage', 'account', 'settings', 'stats', 'admin'].includes(currentView)) {
      renderCurrentView();
    }
  })();
});

function renderAccount() {
  const el = $('#view-account');
  if (!el) return;

  // Réinitialisation en cours : cet écran passe avant tout le reste, y compris
  // la vue "connecté" — la session ouverte par le lien de récupération ne sert
  // qu'à définir un nouveau mot de passe.
  if (kvtPasswordRecovery) {
    el.innerHTML = `
      <h2>Nouveau mot de passe</h2>
      <div class="card" style="max-width:420px;">
        <p style="font-size:13px; color:var(--muted); line-height:1.6;">
          Choisis un nouveau mot de passe pour ton compte. Il te servira aussi
          bien sur le site que dans l'app Mac ou Windows.
        </p>
        <div class="form-row">
          <label>Nouveau mot de passe <input type="password" id="acctNewPwd" autocomplete="new-password" /></label>
        </div>
        <div class="form-row">
          <label>Confirme <input type="password" id="acctNewPwd2" autocomplete="new-password" /></label>
        </div>
        <div class="form-row">
          <button class="primary" id="btnSetPwd">Enregistrer</button>
        </div>
        <div id="acctError" style="color:var(--pink); font-size:13px; margin-top:8px;"></div>
      </div>`;

    $('#btnSetPwd').addEventListener('click', async () => {
      const p1 = $('#acctNewPwd').value;
      const p2 = $('#acctNewPwd2').value;
      const err = $('#acctError');
      err.textContent = '';
      if (p1.length < 6) { err.textContent = 'Six caractères minimum.'; return; }
      if (p1 !== p2) { err.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
      const { error } = await window.sb.auth.updateUser({ password: p1 });
      if (error) { err.textContent = error.message; return; }
      kvtPasswordRecovery = false;
      showToast('Mot de passe enregistré');
      renderAccount();
    });
    return;
  }

  if (!window.accountUser) {
    el.innerHTML = `
      <h2>Compte</h2>
      <div class="card" style="max-width:420px;">
        <h3>Se connecter / créer un compte</h3>
        <div class="form-row">
          <label>Email <input type="email" id="acctEmail" placeholder="toi@exemple.com" /></label>
        </div>
        <div class="form-row">
          <label>Mot de passe <input type="password" id="acctPassword" /></label>
        </div>
        <div class="form-row">
          <label>Pseudo (pour l'inscription uniquement) <input type="text" id="acctPseudo" placeholder="Affiché sur le classement" /></label>
        </div>
        <div class="form-row">
          <button class="primary" id="btnLogin">Se connecter</button>
          <button class="secondary" id="btnSignup">Créer un compte</button>
        </div>
        <div class="form-row">
          <button id="btnForgot" style="background:none; border:none; color:var(--accent-bright); font:inherit; font-size:13px; padding:0; cursor:pointer; text-decoration:underline;">Mot de passe oublié ?</button>
        </div>
        <div id="acctError" style="color:var(--pink); font-size:13px; margin-top:8px;"></div>
        <div id="acctInfo" style="color:var(--good-bright); font-size:13px; margin-top:8px;"></div>
        <p style="font-size:12px; color:var(--muted); margin-top:14px;">
          Optionnel — l'app fonctionne très bien sans compte, en local sur
          cet appareil. Un compte sert seulement à synchroniser ta
          progression entre appareils et à apparaître (sous ton pseudo,
          jamais ton vrai nom) sur le classement de la classe.
        </p>
      </div>`;

    $('#btnLogin').addEventListener('click', async () => {
      const email = $('#acctEmail').value.trim();
      const password = $('#acctPassword').value;
      $('#acctError').textContent = '';
      const { error } = await window.sb.auth.signInWithPassword({ email, password });
      if (error) { $('#acctError').textContent = error.message; return; }
      // onAuthStateChange se charge de refreshAccountUser + syncAfterLogin
      // + renderAccount une fois la session pleinement établie.
      showToast('Connecté');
    });

    $('#btnForgot').addEventListener('click', async () => {
      const email = $('#acctEmail').value.trim();
      const err = $('#acctError');
      const info = $('#acctInfo');
      err.textContent = '';
      info.textContent = '';
      if (!email) { err.textContent = 'Renseigne ton e-mail au-dessus, puis reclique ici.'; return; }
      const { error } = await window.sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/'
      });
      // On affiche le même message que l'adresse existe ou non : révéler qu'un
      // compte existe pour une adresse donnée permettrait à n'importe qui de
      // tester des e-mails un par un.
      if (error && !/rate|limit/i.test(error.message)) {
        err.textContent = error.message;
        return;
      }
      if (error) { err.textContent = 'Trop de demandes. Réessaie dans quelques minutes.'; return; }
      info.textContent = "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé. Pense à regarder dans les indésirables.";
    });

    $('#btnSignup').addEventListener('click', async () => {
      const email = $('#acctEmail').value.trim();
      const password = $('#acctPassword').value;
      const pseudo = $('#acctPseudo').value.trim();
      $('#acctError').textContent = '';
      if (!pseudo) { $('#acctError').textContent = "Choisis un pseudo pour t'inscrire."; return; }
      const { data, error } = await window.sb.auth.signUp({
        email, password, options: { data: { pseudo } }
      });
      if (error) { $('#acctError').textContent = error.message; return; }
      if (data.session) {
        showToast('Compte créé et connecté');
      } else {
        // Confirmation par email requise (si jamais réactivée plus tard
        // côté Supabase) : pas de session tant que le lien reçu par mail
        // n'a pas été cliqué.
        $('#acctError').style.color = 'var(--good-bright)';
        $('#acctError').textContent = `Compte créé pour ${data.user ? data.user.email : email} — vérifie ta boîte mail et clique sur le lien de confirmation avant de te connecter.`;
      }
    });
  } else {
    const isPro = !!window.accountUser.isPro;
    el.innerHTML = `
      <h2>Compte</h2>
      <div class="card" style="max-width:420px;">
        <h3>Connecté</h3>
        <p style="font-size:12px; color:var(--muted); margin:0 0 10px;">Email : ${escapeHtml(window.accountUser.email)}</p>
        <div class="form-row">
          <label>Pseudo (affiché sur le classement)
            <input type="text" id="acctPseudoEdit" value="${escapeHtml(window.accountUser.pseudo || '')}" maxlength="30" />
          </label>
          <label>&nbsp;<button class="secondary small" id="btnSavePseudo">Enregistrer</button></label>
        </div>
        <div id="pseudoError" style="color:var(--pink); font-size:12px; margin:2px 0 10px;"></div>
        <button class="secondary" id="btnSyncNow">Synchroniser maintenant</button>
        <button class="secondary" id="btnLogout">Se déconnecter</button>
      </div>
      ${isPro ? `
      <div class="card pro-card" style="max-width:420px;">
        <span class="pro-badge">✓ Pro actif</span>
        <p style="font-size:13.5px; color:var(--ink); line-height:1.6; margin:0;">
          Merci pour ton soutien ! Ce compte n'affiche aucune publicité et
          a accès aux palettes décoratives. Surtout, il aide KVT à rester
          gratuit pour tout le monde.
        </p>
      </div>` : `
      <div class="card pro-card" style="max-width:420px;">
        <span class="pro-badge">KVT Pro</span>
        <div class="pro-price">3,99 € <span>/ mois, sans engagement</span></div>
        <p style="font-size:13px; color:var(--muted); line-height:1.6; margin:0 0 12px;">
          KVT est gratuit et le restera : tout ce qui sert à apprendre —
          contenu, statistiques, export Anki, classement — est accessible
          sans payer. Le Pro sert d'abord à soutenir le projet.
        </p>
        <ul class="pro-features">
          <li><span class="pro-check">✓</span><span><strong>Aucune publicité</strong> — l'app reste nette, quoi qu'il arrive.</span></li>
          <li><span class="pro-check">✓</span><span><strong>Palettes décoratives</strong> — Sakura et les thèmes à venir. Sombre et Clair restent gratuits.</span></li>
          <li><span class="pro-check">✓</span><span><strong>Tu finances la suite</strong> — nouveaux niveaux JLPT, hébergement, temps de développement.</span></li>
        </ul>
        <a class="pro-cta"
           href="https://buy.stripe.com/00w8wRctAeHxdmo4PI2ZO00?client_reference_id=${encodeURIComponent(window.accountUser.id)}"
           target="_blank" rel="noopener">S'abonner — 3,99 €/mois</a>
        <p class="pro-note">
          Paiement sécurisé par Stripe. Résiliable à tout moment. Le statut
          Pro s'active automatiquement sur ce compte après confirmation du
          paiement (quelques secondes, parfois une minute — recharge la
          page si besoin).
        </p>
      </div>`}
    `;

    // Le profil public est rendu par profils.js : le compte gère l'identité
    // (email, mot de passe, synchronisation), le profil gère ce qui est
    // montré aux autres. Deux sujets, deux fichiers.
    if (window.kvtProfils) {
      el.insertAdjacentHTML('beforeend', window.kvtProfils.htmlBlocProfil());
      window.kvtProfils.brancherBlocProfil();
    }

    if (window.kvtAmis) {
      el.insertAdjacentHTML('beforeend', window.kvtAmis.htmlBlocAmis());
      window.kvtAmis.brancherBlocAmis();
      // Le chargement est asynchrone : la carte s'affiche d'abord en
      // « Chargement… », puis se redessine seule quand les données arrivent.
      window.kvtAmis.chargerAmities().then(() => window.kvtAmis.renderAccountAmis());
    }

    $('#btnSavePseudo').addEventListener('click', async () => {
      const newPseudo = $('#acctPseudoEdit').value.trim();
      $('#pseudoError').textContent = '';
      if (!newPseudo) { $('#pseudoError').textContent = 'Le pseudo ne peut pas être vide.'; return; }
      if (newPseudo === window.accountUser.pseudo) return;
      const { error } = await window.sb.from('profiles').update({ pseudo: newPseudo }).eq('id', window.accountUser.id);
      if (error) { $('#pseudoError').textContent = 'Erreur : ' + error.message; return; }
      window.accountUser.pseudo = newPseudo;
      // Le pseudo est dupliqué dans scores.pseudo (dénormalisé, pour éviter
      // une jointure à chaque affichage du classement) — on met aussi à jour
      // toutes les lignes déjà enregistrées pour que le changement soit
      // rétroactif partout, pas seulement sur les futurs scores.
      await window.sb.from('scores').update({ pseudo: newPseudo }).eq('user_id', window.accountUser.id);
      // Le profil en cache porte l'ancien pseudo : sans ce rechargement,
      // l'avatar et le nom affichés à côté des decks resteraient périmés
      // jusqu'au prochain chargement de page.
      if (window.kvtProfils) await window.kvtProfils.chargerMonProfil();
      showToast('Pseudo mis à jour');
      renderAccount();
    });

    $('#btnSyncNow').addEventListener('click', async () => {
      await window.kvtPushCloud(DB);
      showToast('Synchronisé');
    });

    $('#btnLogout').addEventListener('click', async () => {
      await window.sb.auth.signOut();
      if (window.kvtAmis) window.kvtAmis.reinitialiser();
      renderAccount();
      showToast('Déconnecté');
    });
  }
}
