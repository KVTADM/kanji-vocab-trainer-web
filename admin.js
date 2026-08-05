// ============================================================
// Vue "Admin" : réservée à Paul (voir vérification côté serveur dans la
// Supabase Edge Function admin-users — le check ici n'est qu'un confort
// d'affichage, jamais la vraie protection). Liste des comptes existants,
// qui est Pro, et bouton pour activer/désactiver le Pro manuellement
// (ex: pour un test, un geste commercial, ou dépanner un paiement qui n'a
// pas déclenché le webhook Stripe).
// ============================================================
const ADMIN_FUNCTION_URL = 'https://gkwvzfflayktnuhtkoyb.supabase.co/functions/v1/admin-users';

async function callAdminFunction(body) {
  const { data: sessionData } = await window.sb.auth.getSession();
  const token = sessionData && sessionData.session ? sessionData.session.access_token : null;
  if (!token) return { error: 'Non connecté' };
  const res = await fetch(ADMIN_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body || {})
  });
  return res.json();
}

async function renderAdmin() {
  const el = $('#view-admin');
  if (!el) return;

  if (!window.accountUser || !window.accountUser.isAdmin) {
    el.innerHTML = `
      <h2>Admin</h2>
      <div class="card"><p class="empty-state">Accès réservé.</p></div>`;
    return;
  }

  el.innerHTML = `
    <h2>Admin</h2>
    <div class="card">
      <h3>Audience — 30 derniers jours</h3>
      <p style="color:var(--muted);font-size:12.5px;line-height:1.6;margin:0 0 12px;">
        Comptage maison, anonyme et sans cookie : ce sont des évènements, pas des
        personnes. Une même personne qui revient compte deux fois. Pour distinguer
        une publication d'une autre, ajoute <code>?ref=nom-de-la-video</code> au lien
        que tu mets en bio.
      </p>
      <div id="adminAudienceBox"><p style="color:var(--muted);">Chargement…</p></div>
    </div>
    <div class="card">
      <h3>Comptes</h3>
      <div id="adminUsersBox"><p style="color:var(--muted);">Chargement…</p></div>
    </div>`;

  chargerAudience();

  const result = await callAdminFunction({ action: 'list' });
  const box = $('#adminUsersBox');
  if (!box) return;
  if (result.error) {
    box.innerHTML = `<p style="color:var(--pink);">Erreur : ${escapeHtml(result.error)}</p>`;
    return;
  }

  const users = result.users || [];
  box.innerHTML = `
    <table>
      <thead><tr><th>Email</th><th>Pseudo</th><th>Inscrit le</th><th>Pro</th><th></th></tr></thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td>${escapeHtml(u.email)}</td>
            <td>${escapeHtml(u.pseudo || '—')}</td>
            <td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
            <td>${u.is_pro ? '✓ Pro' + (u.pro_source ? ` (${escapeHtml(u.pro_source)})` : '') : '—'}</td>
            <td><button class="secondary small btn-toggle-pro" data-id="${u.id}" data-pro="${u.is_pro ? '1' : '0'}">${u.is_pro ? 'Retirer le Pro' : 'Activer le Pro'}</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:12px; color:var(--muted); margin-top:10px;">${users.length} compte(s) au total.</p>
  `;

  $$('.btn-toggle-pro').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.id;
      const nextIsPro = btn.dataset.pro !== '1';
      btn.disabled = true;
      const result2 = await callAdminFunction({ action: 'set-pro', user_id: userId, is_pro: nextIsPro });
      if (result2.error) {
        showToast('Erreur : ' + result2.error);
        btn.disabled = false;
        return;
      }
      showToast(nextIsPro ? 'Pro activé' : 'Pro retiré');
      renderAdmin();
    });
  });
}

// ------------------------------------------------------------
// Audience. Le tableau répond à une seule question : quelle publication
// amène des gens qui font quelque chose, plutôt que des gens qui cliquent.
//
// D'où la mise en forme par SOURCE et non par jour : une courbe quotidienne
// est jolie et ne se décide sur rien. Une ligne par provenance, avec le
// nombre de comptes créés au bout, se décide immédiatement.
// ------------------------------------------------------------
const ORDRE_ETAPES = ['page', 'app_ouverte', 'quiz_fini', 'compte_cree', 'deck_importe', 'deck_publie'];
const LIB_ETAPES = {
  page: 'Pages vues', app_ouverte: 'App ouverte', quiz_fini: 'Quiz fini',
  compte_cree: 'Comptes créés', deck_importe: 'Decks importés', deck_publie: 'Decks publiés'
};

async function chargerAudience() {
  const box = $('#adminAudienceBox');
  if (!box) return;
  try {
    const { data, error } = await window.sb.rpc('kvt_stats_visites', { p_jours: 30 });
    if (error) throw error;
    const lignes = data || [];
    if (!lignes.length) {
      box.innerHTML = `<p class="empty-state">Aucune visite enregistrée pour l'instant.
        C'est normal tant que rien n'a été partagé — reviens après ta première publication.</p>`;
      return;
    }

    // Regroupement par source. Le total par jour ne sert à rien ici : ce
    // qu'on compare, ce sont des provenances entre elles.
    const parSource = new Map();
    let total = 0;
    for (const l of lignes) {
      const s = l.source || 'direct';
      if (!parSource.has(s)) parSource.set(s, {});
      const e = parSource.get(s);
      e[l.evenement] = (e[l.evenement] || 0) + Number(l.n);
      total += Number(l.n);
    }

    const sources = [...parSource.entries()]
      .sort((a, b) => (b[1].page || 0) - (a[1].page || 0));

    box.innerHTML = `
      <div style="overflow-x:auto;">
      <table class="admin-audience">
        <thead><tr><th>Provenance</th>${ORDRE_ETAPES.map(e => `<th>${LIB_ETAPES[e]}</th>`).join('')}<th>Taux</th></tr></thead>
        <tbody>
          ${sources.map(([src, e]) => {
            const vues = e.page || 0;
            const comptes = e.compte_cree || 0;
            // Le taux qui compte : combien de pages vues finissent en compte.
            // Sans dénominateur, un chiffre brut ne dit rien.
            const taux = vues ? ((comptes / vues) * 100).toFixed(1) + ' %' : '—';
            return `<tr>
              <td><strong>${escapeHtml(src)}</strong></td>
              ${ORDRE_ETAPES.map(k => `<td>${e[k] || 0}</td>`).join('')}
              <td>${taux}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
      <p style="color:var(--muted);font-size:12px;margin-top:10px;">
        ${total} évènements sur 30 jours. « direct » regroupe ce qui arrive sans
        provenance connue : lien tapé à la main, application installée, ou
        référent masqué par le navigateur.
      </p>`;
  } catch (e) {
    box.innerHTML = `<p style="color:var(--pink);">Lecture impossible : ${escapeHtml(e.message || String(e))}</p>`;
  }
}
