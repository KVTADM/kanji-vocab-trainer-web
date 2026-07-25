// ============================================================
// Vue "Classement" : classement de la classe par semaine, à partir de la
// table scores (pseudo uniquement, jamais le nom réel). Lecture seule ici ;
// l'écriture se fait via window.kvtPushScore (voir account.js), appelée
// depuis app.js à la fin de chaque session de révision.
// ============================================================
let leaderboardWeek = null; // { semesterId, week }
let leaderboardMode = 'absolu'; // 'absolu' | 'progression'

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

  const isProg = leaderboardMode === 'progression';

  el.innerHTML = `
    <h2>Classement</h2>
    <div class="card">
      <div class="lb-tabs">
        <button class="lb-tab ${isProg ? '' : 'is-active'}" data-mode="absolu">Meilleurs scores</button>
        <button class="lb-tab ${isProg ? 'is-active' : ''}" data-mode="progression">Plus grosse progression</button>
      </div>
      ${isProg ? '' : `
      <div class="form-row">
        <label>Semaine <select id="lbWeekSelect">${opts.join('')}</select></label>
      </div>`}
      <p class="lb-explain">${isProg
        ? 'Écart entre ton tout premier essai sur un contenu et ton meilleur score actuel, additionné sur tous les contenus travaillés. Plus on part de loin, plus on peut gagner — ce classement se gagne à la progression, pas au niveau.'
        : 'Meilleurs scores obtenus sur la semaine choisie.'}</p>
      <div id="lbTableWrap"><p style="color:var(--muted);">Chargement…</p></div>
      <p style="font-size:12px; color:var(--muted); margin-top:14px;">
        Seuls les pseudos sont visibles — jamais les noms réels.
      </p>
    </div>`;

  el.querySelectorAll('.lb-tab').forEach((b) => {
    b.addEventListener('click', () => {
      leaderboardMode = b.dataset.mode;
      renderLeaderboard();
    });
  });

  const sel = $('#lbWeekSelect');
  if (sel) {
    sel.addEventListener('change', (e) => {
      const [sem, w] = e.target.value.split('|');
      leaderboardWeek = { semesterId: sem, week: parseInt(w, 10) };
      renderLeaderboard();
    });
  }

  if (isProg) loadProgressionRows();
  else loadLeaderboardRows(leaderboardWeek.semesterId, leaderboardWeek.week);
}

// Classement de progression : pour chaque utilisateur et chaque contenu
// (semestre + semaine), on mesure l'écart entre son tout premier essai —
// référence figée, jamais recalculée, pour qu'on ne puisse pas se ménager
// une belle progression en ratant volontairement un test plus tard — et son
// meilleur score obtenu depuis. Les gains sont additionnés sur l'ensemble
// des contenus travaillés.
//
// Le plafond à 100 % rend ce classement structurellement favorable à ceux
// qui partent de loin : qui commence à 90 % ne peut gagner que 10 points,
// qui commence à 20 % peut en gagner 80. C'est voulu (voir
// `14 - Vision produit` : valoriser les premiers, encourager les derniers).
function computeProgression(rows) {
  const perUserContent = new Map(); // "user|sem|week" -> { first, best, pseudo, userId }
  // Tri chronologique : le premier élément rencontré pour une clé est bien
  // le premier essai, quel que soit l'ordre renvoyé par la base.
  rows.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach((r) => {
    const pct = Number(r.pct);
    if (!Number.isFinite(pct)) return;
    const key = `${r.user_id}|${r.semester_id}|${r.week}`;
    const cur = perUserContent.get(key);
    if (!cur) perUserContent.set(key, { first: pct, best: pct, pseudo: r.pseudo, userId: r.user_id });
    else {
      if (pct > cur.best) cur.best = pct;
      cur.pseudo = r.pseudo; // le pseudo le plus récent fait foi
    }
  });

  const perUser = new Map();
  perUserContent.forEach((c) => {
    const gain = Math.max(0, c.best - c.first); // une baisse ne pénalise jamais
    const u = perUser.get(c.userId) || { user_id: c.userId, pseudo: c.pseudo, gain: 0, contenus: 0 };
    u.gain += gain;
    u.pseudo = c.pseudo;
    if (gain > 0) u.contenus += 1;
    perUser.set(c.userId, u);
  });

  return [...perUser.values()]
    .filter((u) => u.gain > 0)
    .map((u) => ({ ...u, gain: Math.round(u.gain * 10) / 10 }))
    .sort((a, b) => b.gain - a.gain);
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

async function loadProgressionRows() {
  // Agrégation côté client : suffisant au volume actuel (quelques dizaines de
  // lignes). Si la table `scores` dépasse quelques milliers de lignes, basculer
  // ce calcul dans une vue Postgres pour éviter de tout télécharger.
  const { data, error } = await window.sb
    .from('scores')
    .select('user_id, pseudo, semester_id, week, pct, created_at')
    .limit(5000);

  if (leaderboardMode !== 'progression') return; // l'utilisateur a changé d'onglet
  const wrap = $('#lbTableWrap');
  if (!wrap) return;

  if (error) {
    wrap.innerHTML = `<p style="color:var(--pink);">Impossible de charger le classement.</p>`;
    return;
  }

  const rows = computeProgression(data || []);
  if (rows.length === 0) {
    wrap.innerHTML = `<p style="color:var(--muted);">Personne n'a encore refait un contenu déjà tenté. Recommence une semaine déjà travaillée : l'écart avec ton premier essai apparaîtra ici.</p>`;
    return;
  }

  const isMe = (r) => window.accountUser && r.user_id === window.accountUser.id;
  const medals = ['🥇', '🥈', '🥉'];
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const contenus = (n) => `${n} contenu${n > 1 ? 's' : ''}`;

  const podiumHtml = `
    <div class="lb-podium">
      ${top3.map((r, i) => `
        <div class="lb-podium-item lb-rank-${i + 1} ${isMe(r) ? 'lb-me' : ''}">
          <div class="lb-medal">${medals[i]}</div>
          <div class="lb-podium-pseudo">${escapeHtml(r.pseudo)}</div>
          <div class="lb-podium-points">+${r.gain}<span> pts</span></div>
          <div class="lb-podium-pct">sur ${contenus(r.contenus)}</div>
        </div>`).join('')}
    </div>`;

  const restHtml = rest.length === 0 ? '' : `
    <table class="lb-table">
      <thead><tr><th>#</th><th>Pseudo</th><th>Progression</th><th>Contenus</th></tr></thead>
      <tbody>${rest.map((r, i) => `
        <tr class="${isMe(r) ? 'lb-row-me' : ''}">
          <td class="lb-rank">${i + 4}</td><td>${escapeHtml(r.pseudo)}</td><td><strong>+${r.gain}</strong> pts</td><td>${r.contenus}</td>
        </tr>`).join('')}</tbody>
    </table>`;

  wrap.innerHTML = podiumHtml + restHtml;
}
