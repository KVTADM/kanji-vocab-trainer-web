// ============================================================
// Vue "Classement" : classement de la classe par semaine, à partir de la
// table scores (pseudo uniquement, jamais le nom réel). Lecture seule ici ;
// l'écriture se fait via window.kvtPushScore (voir account.js), appelée
// depuis app.js à la fin de chaque session de révision.
// ============================================================
let leaderboardWeek = null; // { semesterId, week }

function renderLeaderboard() {
  const el = $('#view-leaderboard');
  if (!el) return;

  if (!window.accountUser) {
    el.innerHTML = `
      <h2>Classement</h2>
      <div class="card" style="max-width:420px;">
        <p>Connecte-toi (onglet Compte) pour voir et apparaître sur le classement de la classe.</p>
      </div>`;
    return;
  }

  const semesters = DB.settings.semesters;
  if (!leaderboardWeek) leaderboardWeek = { semesterId: semesters[0].id, week: 1 };

  const opts = [];
  semesters.forEach((sem) => {
    for (let w = 1; w <= sem.weeks; w++) {
      opts.push(`<option value="${sem.id}|${w}" ${leaderboardWeek.semesterId === sem.id && leaderboardWeek.week === w ? 'selected' : ''}>${sem.label} — Semaine ${w}</option>`);
    }
  });

  el.innerHTML = `
    <h2>Classement</h2>
    <div class="card">
      <div class="form-row">
        <label>Semaine <select id="lbWeekSelect">${opts.join('')}</select></label>
      </div>
      <div id="lbTableWrap"><p style="color:var(--muted);">Chargement…</p></div>
      <p style="font-size:12px; color:var(--muted); margin-top:14px;">
        Seuls les pseudos sont visibles — jamais les noms réels.
      </p>
    </div>`;

  $('#lbWeekSelect').addEventListener('change', (e) => {
    const [sem, w] = e.target.value.split('|');
    leaderboardWeek = { semesterId: sem, week: parseInt(w, 10) };
    renderLeaderboard();
  });

  loadLeaderboardRows(leaderboardWeek.semesterId, leaderboardWeek.week);
}

async function loadLeaderboardRows(semesterId, week) {
  const { data, error } = await window.sb
    .from('scores')
    .select('user_id, pseudo, pct, points, max_points')
    .eq('semester_id', semesterId)
    .eq('week', week)
    .order('points', { ascending: false })
    .limit(50);

  // La vue a pu changer pendant le chargement (autre semaine sélectionnée,
  // ou navigation ailleurs) — on n'écrit alors plus rien.
  if (!leaderboardWeek || leaderboardWeek.semesterId !== semesterId || leaderboardWeek.week !== week) return;
  const wrap = $('#lbTableWrap');
  if (!wrap) return;

  if (error) {
    wrap.innerHTML = `<p style="color:var(--pink);">Impossible de charger le classement.</p>`;
    return;
  }
  if (!data || data.length === 0) {
    wrap.innerHTML = `<p style="color:var(--muted);">Personne n'a encore de score cette semaine-là.</p>`;
    return;
  }

  const isMe = (r) => window.accountUser && r.user_id === window.accountUser.id;
  const medals = ['🥇', '🥈', '🥉'];
  const top3 = data.slice(0, 3);
  const rest = data.slice(3);

  const podiumHtml = `
    <div class="lb-podium">
      ${top3.map((r, i) => `
        <div class="lb-podium-item lb-rank-${i + 1} ${isMe(r) ? 'lb-me' : ''}">
          <div class="lb-medal">${medals[i]}</div>
          <div class="lb-podium-pseudo">${escapeHtml(r.pseudo)}</div>
          <div class="lb-podium-points">${r.points}<span>/${r.max_points}</span></div>
          <div class="lb-podium-pct">${r.pct}% de similarité</div>
        </div>`).join('')}
    </div>`;

  const restHtml = rest.length === 0 ? '' : `
    <table class="lb-table">
      <thead><tr><th>#</th><th>Pseudo</th><th>Points</th><th>Similarité</th></tr></thead>
      <tbody>${rest.map((r, i) => `
        <tr class="${isMe(r) ? 'lb-row-me' : ''}">
          <td class="lb-rank">${i + 4}</td><td>${escapeHtml(r.pseudo)}</td><td><strong>${r.points}</strong>/${r.max_points}</td><td>${r.pct}%</td>
        </tr>`).join('')}</tbody>
    </table>`;

  wrap.innerHTML = podiumHtml + restHtml;
}
