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

// Repère, PAR COMPTE (pas juste par appareil — un même navigateur peut
// voir plusieurs comptes se connecter), si cet appareil a déjà vu une vraie
// sauvegarde cloud pour ce compte. Sert de garde-fou dans syncAfterLogin
// (voir decisionSyncApresConnexion plus bas) : ne jamais confondre "je ne
// trouve rien" avec "je sais qu'il n'y a vraiment rien".
const KVT_SYNC_FLAG_PREFIXE = 'kvtCloudSyncEtabli:';
function kvtCleSyncFlag(userId) {
  return KVT_SYNC_FLAG_PREFIXE + userId;
}

// Combien de temps entre deux sauvegardes automatiques horodatées
// (user_backups_history) — pas à chaque session pour ne pas empiler des
// centaines de lignes, mais assez souvent pour ne jamais perdre plus d'une
// journée si la sauvegarde "live" (user_backups) est de nouveau corrompue.
const KVT_HISTORIQUE_INTERVALLE_MS = 20 * 60 * 60 * 1000; // ~1x/jour
const KVT_HISTORIQUE_MAX = 20;

// ---------- Logique pure de synchronisation (testée isolément, voir
// tests/sync.cases.js) ----------
//
// Panne du 29-30/08/2026 (voir `01 - Décisions techniques.md`) : l'ancienne
// version traitait "le cloud ne renvoie rien" et "je sais avec certitude
// qu'il n'y a jamais eu de sauvegarde" comme la même chose, et poussait les
// données locales dans les deux cas. Résultat concret : l'iPhone de Paul
// (pas rejoué depuis la veille, donc avec une copie locale plus ancienne)
// s'est reconnecté, une réponse cloud vide (timing/réseau, pas une vraie
// absence) a été prise pour argent comptant, et sa vieille copie locale a
// écrasé la sauvegarde cloud du jour même faite depuis le Mac — deux
// semaines de résultats perdues. Cette fonction décide QUOI FAIRE à partir
// de trois faits déjà connus, sans jamais toucher au réseau elle-même —
// c'est ce qui la rend testable sans simuler Supabase.
//
// Retourne l'un de :
// - 'erreur-reseau'           : le pull a échoué (pas une histoire d'exister
//                               ou pas) — ne rien toucher, prévenir.
// - 'appliquer-cloud'         : une sauvegarde cloud existe — l'appliquer en
//                               local, cas normal et sûr.
// - 'pousser-local'           : aucune sauvegarde cloud ET cet appareil n'en
//                               a jamais vu une pour ce compte — vraiment un
//                               compte neuf sur cet appareil, sûr de pousser.
// - 'incertain-ne-rien-faire' : aucune sauvegarde cloud trouvée MAIS cet
//                               appareil sait qu'il en existe une d'habitude
//                               — presque certainement un problème de
//                               timing/réseau, pas une preuve de suppression.
//                               Ne RIEN pousser ni appliquer : c'est
//                               exactement le cas qui a causé la perte.
function decisionSyncApresConnexion(pullReussi, cloudDataPresente, appareilDejaSynchronise) {
  if (!pullReussi) return 'erreur-reseau';
  if (cloudDataPresente) return 'appliquer-cloud';
  if (appareilDejaSynchronise) return 'incertain-ne-rien-faire';
  return 'pousser-local';
}

// Traduit la réponse brute de Supabase (upsert vers user_backups) en un
// résultat que l'appelant peut vérifier — avant ce correctif, kvtPushCloud
// ignorait complètement `error` et semblait toujours réussir, y compris
// pour le bouton "Synchroniser maintenant" qui affichait "Synchronisé"
// même en cas d'échec silencieux.
function interpreterReponsePushCloud(error) {
  return error ? { ok: false, motif: error.message } : { ok: true };
}

// Décide si une nouvelle snapshot d'historique est due, à partir de la date
// de la précédente (ou son absence). Pur : pas d'accès réseau ni d'horloge
// cachée, tout est passé en paramètre — testable directement.
function faitUneSnapshotHistorique(dernierSnapshotIso, maintenantMs, intervalleMs) {
  if (!dernierSnapshotIso) return true;
  return (maintenantMs - new Date(dernierSnapshotIso).getTime()) >= intervalleMs;
}

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
  if (!window.accountUser) return { ok: false, motif: 'non-connecte' };
  const { error } = await window.sb.from('user_backups').upsert({
    user_id: window.accountUser.id,
    data,
    updated_at: new Date().toISOString()
  });
  const res = interpreterReponsePushCloud(error);
  if (!res.ok) console.error('kvtPushCloud a échoué :', res.motif);
  return res;
};

// --- Sauvegardes automatiques horodatées (user_backups_history, table
// séparée de user_backups) : filet de sécurité en plus de la sauvegarde
// "live" — si celle-ci est un jour de nouveau écrasée par erreur, une
// version récente reste récupérable. Append-only côté client (jamais de
// update), élagué pour ne garder que les KVT_HISTORIQUE_MAX plus récentes.
async function kvtSnapshotHistorique() {
  if (!window.accountUser) return;
  try {
    const { data: dernier } = await window.sb
      .from('user_backups_history')
      .select('created_at')
      .eq('user_id', window.accountUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!faitUneSnapshotHistorique(dernier ? dernier.created_at : null, Date.now(), KVT_HISTORIQUE_INTERVALLE_MS)) return;
    const { error } = await window.sb.from('user_backups_history').insert({
      user_id: window.accountUser.id,
      data: DB
    });
    if (error) { console.error('kvtSnapshotHistorique (insert) :', error.message); return; }
    const { data: toutes } = await window.sb
      .from('user_backups_history')
      .select('id, created_at')
      .eq('user_id', window.accountUser.id)
      .order('created_at', { ascending: false });
    if (toutes && toutes.length > KVT_HISTORIQUE_MAX) {
      const idsATrimmer = toutes.slice(KVT_HISTORIQUE_MAX).map(r => r.id);
      await window.sb.from('user_backups_history').delete().in('id', idsATrimmer);
    }
  } catch (e) {
    console.error('kvtSnapshotHistorique :', e);
  }
}

// --- "Sauvegarder maintenant" (bouton manuel, Compte) : contrairement au
// push automatique silencieux et non-bloquant de saveData() (webapi.js),
// celui-ci attend le réseau et rapporte honnêtement le résultat à
// l'utilisateur, au lieu de toujours dire "Synchronisé" comme avant.
window.kvtSauvegarderMaintenant = async function () {
  if (!window.accountUser) return { ok: false, motif: 'non-connecte' };
  const res = await window.kvtPushCloud(DB);
  if (res.ok) {
    localStorage.setItem(kvtCleSyncFlag(window.accountUser.id), '1');
    await window.kvtPushAllScores(DB);
    await kvtSnapshotHistorique();
  }
  return res;
};

// --- "Récupérer depuis le cloud" (bouton manuel, Compte) : remplace les
// données locales de CET appareil par la dernière sauvegarde cloud. Filet
// de rattrapage manuel si une sync automatique a mal tourné — app.js
// demande une confirmation avant d'appeler ceci, car c'est destructeur
// pour toute donnée locale pas encore synchronisée.
window.kvtRecupererCloud = async function () {
  const result = await kvtPullCloud();
  if (!result.ok) return { ok: false, motif: 'reseau' };
  if (!result.data) return { ok: false, motif: 'aucune-sauvegarde' };
  DB = result.data;
  await window.api.saveData(DB);
  if (window.accountUser) localStorage.setItem(kvtCleSyncFlag(window.accountUser.id), '1');
  return { ok: true };
};

// --- Horodatage de la dernière sauvegarde cloud connue (lecture seule,
// affiché dans Compte).
window.kvtDerniereSauvegardeCloud = async function () {
  if (!window.accountUser) return null;
  const { data, error } = await window.sb
    .from('user_backups')
    .select('updated_at')
    .eq('user_id', window.accountUser.id)
    .maybeSingle();
  if (error || !data) return null;
  return data.updated_at;
};

// --- Nombre de sauvegardes automatiques horodatées en historique (juste
// pour rassurer l'utilisateur que le filet de sécurité existe bien).
window.kvtCompterHistorique = async function () {
  if (!window.accountUser) return 0;
  const { count, error } = await window.sb
    .from('user_backups_history')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', window.accountUser.id);
  if (error) return 0;
  return count || 0;
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
  // Juste après une connexion, il arrive qu'une requête ne trouve rien même
  // quand une sauvegarde existe bel et bien (propagation du jeton
  // d'authentification pas encore terminée côté client Supabase, ou juste
  // une connexion plus lente). Un seul essai supplémentaire s'est révélé
  // insuffisant en pratique (voir panne du 29-30/08/2026 dans
  // `01 - Décisions techniques.md`, où ce correctif n'était pas encore en
  // place) — plusieurs essais espacés, ET surtout ne jamais pousser les
  // données locales par défaut quand cet appareil sait déjà qu'une
  // sauvegarde existe pour ce compte (voir decisionSyncApresConnexion).
  const delaisMs = [700, 1500, 3000];
  let tentative = 0;
  while (result.ok && !result.data && tentative < delaisMs.length) {
    await new Promise((r) => setTimeout(r, delaisMs[tentative]));
    result = await kvtPullCloud();
    tentative++;
  }

  const cleFlag = kvtCleSyncFlag(window.accountUser.id);
  const appareilDejaSynchronise = localStorage.getItem(cleFlag) === '1';
  const decision = decisionSyncApresConnexion(result.ok, !!result.data, appareilDejaSynchronise);

  if (decision === 'erreur-reseau') {
    showToast('Sync impossible (réseau) — données locales conservées');
    return;
  }
  if (decision === 'appliquer-cloud') {
    DB = result.data;
    await window.api.saveData(DB);
    localStorage.setItem(cleFlag, '1');
    browsingWeek = null;
    if (typeof applyTheme === 'function') applyTheme();
    renderCurrentView();
    showToast('Sauvegarde cloud appliquée');
    return;
  }
  if (decision === 'incertain-ne-rien-faire') {
    // Exactement le cas qui a effacé les semaines 3 et 4 du 29/08/2026 sur
    // un autre appareil : ne RIEN pousser ni appliquer tant que ce n'est
    // pas sûr, juste prévenir — voir decisionSyncApresConnexion ci-dessus.
    showToast('Sync cloud incertaine — rien n\'a été modifié. Réessaie plus tard, ou utilise "Sauvegarder maintenant" dans Compte.');
    return;
  }
  // decision === 'pousser-local' : vraiment la première fois que CET
  // appareil synchronise ce compte.
  await window.kvtPushCloud(DB);
  await window.kvtPushAllScores(DB);
  localStorage.setItem(cleFlag, '1');
  await kvtSnapshotHistorique();
  showToast('Données synchronisées vers le cloud');
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
    if (typeof currentView !== 'undefined' && ['dashboard', 'manage', 'account', 'settings', 'stats', 'admin', 'communaute'].includes(currentView)) {
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
      // Compte cree : c'est l'evenement le plus cher a obtenir, donc
      // celui qui sert de reference pour comparer deux publications.
      if (window.kvtMesure) window.kvtMesure.noter('compte_cree');
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
        <div class="sync-cloud">
          <p id="cloudSyncStatut" class="sync-cloud__statut">Vérification de la dernière sauvegarde cloud…</p>
          <div class="form-row">
            <button class="secondary" id="btnSyncNow">Sauvegarder maintenant</button>
            <button class="secondary" id="btnRestoreCloud">Récupérer depuis le cloud</button>
          </div>
          <p class="sync-cloud__aide">
            « Sauvegarder maintenant » envoie tout de suite les données de cet
            appareil vers le cloud, sans attendre. « Récupérer depuis le
            cloud » fait l'inverse : ça remplace les données de cet appareil
            par la dernière sauvegarde cloud — utile si un autre appareil
            (téléphone, autre navigateur) a une version plus ancienne. En
            plus de la sauvegarde cloud elle-même, un historique horodaté
            (<span id="cloudHistoriqueCompte">…</span>) est gardé en filet de
            sécurité.
          </p>
        </div>
        <button class="secondary" id="btnLogout" style="margin-top:14px;">Se déconnecter</button>
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

    async function rafraichirStatutSyncCloud() {
      const [iso, nbHistorique] = await Promise.all([
        window.kvtDerniereSauvegardeCloud(),
        window.kvtCompterHistorique()
      ]);
      const statutEl = $('#cloudSyncStatut');
      if (statutEl) {
        statutEl.textContent = iso
          ? 'Dernière sauvegarde cloud : ' + new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : "Aucune sauvegarde cloud pour l'instant.";
      }
      const histEl = $('#cloudHistoriqueCompte');
      if (histEl) histEl.textContent = nbHistorique + (nbHistorique > 1 ? ' versions' : ' version');
    }
    rafraichirStatutSyncCloud();

    $('#btnSyncNow').addEventListener('click', async () => {
      const btn = $('#btnSyncNow');
      btn.disabled = true;
      const res = await window.kvtSauvegarderMaintenant();
      btn.disabled = false;
      if (res.ok) {
        showToast('Sauvegardé dans le cloud');
        rafraichirStatutSyncCloud();
      } else {
        showToast('Échec de la sauvegarde cloud (' + (res.motif || 'réseau') + ')');
      }
    });

    $('#btnRestoreCloud').addEventListener('click', async () => {
      if (!confirm("Remplacer les données de cet appareil par la dernière sauvegarde cloud ? Toute progression faite ici et pas encore synchronisée sera perdue.")) return;
      const btn = $('#btnRestoreCloud');
      btn.disabled = true;
      const res = await window.kvtRecupererCloud();
      btn.disabled = false;
      if (res.ok) {
        browsingWeek = null;
        if (typeof applyTheme === 'function') applyTheme();
        renderCurrentView();
        showToast('Données remplacées par la sauvegarde cloud');
        return;
      }
      if (res.motif === 'aucune-sauvegarde') {
        showToast('Aucune sauvegarde cloud trouvée pour ce compte');
      } else {
        showToast('Impossible de récupérer la sauvegarde cloud (réseau)');
      }
    });

    $('#btnLogout').addEventListener('click', async () => {
      await window.sb.auth.signOut();
      if (window.kvtAmis) window.kvtAmis.reinitialiser();
      renderAccount();
      showToast('Déconnecté');
    });
  }
}
