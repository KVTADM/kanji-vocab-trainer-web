// ============================================================
// Vue "Classement" : classement de la classe par semaine, à partir de la
// table scores (pseudo uniquement, jamais le nom réel). Lecture seule ici ;
// l'écriture se fait via window.kvtPushScore (voir account.js), appelée
// depuis app.js à la fin de chaque session de révision.
// ============================================================
let leaderboardWeek = null; // { semesterId, week }
let leaderboardMode = 'apercu'; // 'apercu' | 'absolu' | 'progression'
let apercuLignes = null;    // scores bruts pour la vue d'ensemble
let apercuErreur = null;
let apercuSemestre = 'tous';// filtre facultatif, jamais un préalable

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
        <button class="lb-tab ${leaderboardMode === 'apercu' ? 'is-active' : ''}" data-mode="apercu">Vue d'ensemble</button>
        <button class="lb-tab ${leaderboardMode === 'absolu' ? 'is-active' : ''}" data-mode="absolu">Une semaine en détail</button>
        <button class="lb-tab ${leaderboardMode === 'progression' ? 'is-active' : ''}" data-mode="progression">Plus grosse progression</button>
      </div>
      ${leaderboardMode === 'absolu' ? `
      <div class="form-row">
        <label>Semaine <select id="lbWeekSelect">${opts.join('')}</select></label>
      </div>` : ''}
      ${leaderboardMode === 'apercu' ? `
      <div class="lb-filtre">
        <label for="lbSemFiltre">Filtrer (facultatif)</label>
        <select id="lbSemFiltre">
          <option value="tous" ${apercuSemestre === 'tous' ? 'selected' : ''}>Tous les semestres</option>
          ${DB.settings.semesters.map(sem => `<option value="${sem.id}" ${apercuSemestre === sem.id ? 'selected' : ''}>${escapeHtml(sem.label)}</option>`).join('')}
        </select>
      </div>` : ''}
      <p class="lb-explain">${
        leaderboardMode === 'progression'
          ? 'Écart entre ton tout premier essai sur un contenu et ton meilleur score actuel, additionné sur tous les contenus travaillés. Plus on part de loin, plus on peut gagner — ce classement se gagne à la progression, pas au niveau.'
        : leaderboardMode === 'apercu'
          ? 'Le meilleur score de chaque semaine, dans l\'ordre du programme. Le filtre est là si tu veux resserrer, pas pour commencer.'
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

  const filtre = $('#lbSemFiltre');
  if (filtre) filtre.addEventListener('change', () => {
    apercuSemestre = filtre.value;
    renderApercu();
  });

  if (leaderboardMode === 'progression') loadProgressionRows();
  else if (leaderboardMode === 'apercu') chargerApercu();
  else loadLeaderboardRows(leaderboardWeek.semesterId, leaderboardWeek.week);
}

// ---------- Vue d'ensemble ----------

async function chargerApercu() {
  if (apercuLignes) { renderApercu(); return; }
  try {
    // Une seule requête pour toutes les semaines : la table reste petite
    // (quelques centaines de lignes). Si elle grossit, ce calcul devra passer
    // dans une vue Postgres — même remarque que pour la progression.
    const { data, error } = await window.sb
      .from('scores').select('user_id,pseudo,semester_id,week,pct,points,max_points,created_at')
      .order('created_at', { ascending: false }).limit(2000);
    if (error) throw error;
    apercuLignes = data || [];
    apercuErreur = null;
    if (window.kvtProfils) {
      await window.kvtProfils.chargerProfils(apercuLignes.map(r => r.user_id));
    }
  } catch (err) {
    apercuLignes = [];
    apercuErreur = err && err.message ? err.message : String(err);
  }
  if (leaderboardMode === 'apercu') renderApercu();
}

function renderApercu() {
  const wrap = $('#lbTableWrap');
  if (!wrap) return;

  if (apercuErreur) {
    wrap.innerHTML = `<p style="color:var(--pink);">Impossible de charger les scores : ${escapeHtml(apercuErreur)}</p>`;
    return;
  }
  if (!apercuLignes) {
    wrap.innerHTML = `<p style="color:var(--muted);">Chargement…</p>`;
    return;
  }

  let semaines = meilleursParSemaine(apercuLignes);
  if (apercuSemestre !== 'tous') semaines = semaines.filter(s => s.semesterId === apercuSemestre);

  if (!semaines.length) {
    wrap.innerHTML = `<p style="color:var(--muted);">${apercuSemestre === 'tous'
      ? "Aucun score enregistré pour l'instant. Termine une semaine : tu seras le premier du tableau."
      : "Personne n'a encore de score sur ce semestre."}</p>`;
    return;
  }

  const moi = window.accountUser ? window.accountUser.id : null;

  wrap.innerHTML = `
    <div class="lb-grille">
      ${semaines.map(s => {
        const [premier, ...suivants] = s.lignes;
        const jeSuisPremier = premier.user_id === moi;
        return `
        <div class="lb-case ${jeSuisPremier ? 'lb-me' : ''}">
          <button class="lb-case-titre" data-voir="${s.semesterId}|${s.week}">
            ${escapeHtml(libelleSemestre(s.semesterId))} · semaine ${s.week}
          </button>
          <div class="lb-case-premier">
            ${window.kvtProfils ? window.kvtProfils.avatarHtml(premier.user_id, premier.pseudo, 34) : ''}
            <div class="lb-case-infos">
              <div class="lb-case-pseudo">${escapeHtml(premier.pseudo)}${jeSuisPremier ? ' <span class="com-marque">toi</span>' : ''}</div>
              <div class="lb-case-detail">${premier.points}/${premier.max_points} pts</div>
            </div>
            <div class="lb-case-pct">${Math.round(premier.pct)}%</div>
          </div>
          ${suivants.length ? `
            <div class="lb-case-suite">
              ${suivants.slice(0, 2).map((r, i) => `
                <div class="lb-case-ligne ${r.user_id === moi ? 'lb-row-me' : ''}">
                  <span class="lb-case-rang">${i + 2}</span>
                  <span class="lb-case-nom">${escapeHtml(r.pseudo)}</span>
                  <span class="lb-case-mini">${Math.round(r.pct)}%</span>
                </div>`).join('')}
              ${s.lignes.length > 3 ? `<div class="lb-case-reste">et ${s.lignes.length - 3} autre${s.lignes.length - 3 > 1 ? 's' : ''}</div>` : ''}
            </div>`
            : `<div class="lb-case-suite"><div class="lb-case-reste">Personne d'autre sur cette semaine.</div></div>`}
        </div>`;
      }).join('')}
    </div>`;

  $$('[data-voir]', wrap).forEach(b => {
    b.addEventListener('click', () => {
      const [sem, w] = b.dataset.voir.split('|');
      leaderboardWeek = { semesterId: sem, week: parseInt(w, 10) };
      leaderboardMode = 'absolu';
      renderLeaderboard();
    });
  });
}

// Le meilleur score de chaque semaine, toutes semaines confondues. Une
// personne peut avoir plusieurs lignes sur la même semaine (chaque session
// est enregistrée) : on ne garde que son meilleur essai avant de comparer.
function meilleursParSemaine(rows) {
  const parPersonne = new Map(); // "sem|week|user" -> meilleure ligne
  (rows || []).forEach(r => {
    const cle = `${r.semester_id}|${r.week}|${r.user_id}`;
    const actuel = parPersonne.get(cle);
    if (!actuel || Number(r.pct) > Number(actuel.pct)) parPersonne.set(cle, r);
  });

  const parSemaine = new Map();
  parPersonne.forEach(r => {
    const cle = `${r.semester_id}|${r.week}`;
    if (!parSemaine.has(cle)) parSemaine.set(cle, { semesterId: r.semester_id, week: Number(r.week), lignes: [] });
    parSemaine.get(cle).lignes.push(r);
  });

  const liste = [...parSemaine.values()];
  liste.forEach(s => s.lignes.sort((a, b) => Number(b.pct) - Number(a.pct) || b.points - a.points));
  // Ordre d'affichage : le semestre dans l'ordre du programme, puis la
  // semaine. On lit une progression, pas un palmarès mélangé.
  const ordre = DB.settings.semesters.map(s => s.id);
  liste.sort((a, b) => {
    const ia = ordre.indexOf(a.semesterId), ib = ordre.indexOf(b.semesterId);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.week - b.week;
  });
  return liste;
}

function libelleSemestre(id) {
  const sem = DB.settings.semesters.find(s => s.id === id);
  if (sem) return sem.label;
  // Un deck importé par quelqu'un d'autre : je n'ai pas son libellé.
  return id.startsWith('deck-') ? 'Deck partagé' : id;
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
