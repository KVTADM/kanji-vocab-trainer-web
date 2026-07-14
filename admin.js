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
      <h3>Comptes</h3>
      <div id="adminUsersBox"><p style="color:var(--muted);">Chargement…</p></div>
    </div>`;

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
