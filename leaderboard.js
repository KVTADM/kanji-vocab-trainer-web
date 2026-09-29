// ============================================================
// Vue "Classement" : classement de la classe par semaine, à partir de la
// table scores (pseudo uniquement, jamais le nom réel). Lecture seule ici ;
// l'écriture se fait via window.kvtPushScore (voir account.js), appelée
// depuis app.js à la fin de chaque session de révision.
// ============================================================
let leaderboardWeek = null; // { semesterId, week }
// Le classement global est le premier onglet et l'onglet par defaut depuis
// le 23/09/2026 (demande de Paul : "le classement global devrait
// apparaitre en premier") -- c'est la vue tous-modes-confondus, plus
// lisible d'emblee que le detail semaine par semaine.
let leaderboardMode = 'global'; // 'global' | 'apercu' | 'absolu' | 'progression'
let apercuLignes = null;    // scores bruts pour la vue d'ensemble
let apercuErreur = null;
let apercuSemestre = 'tous';// filtre facultatif, jamais un préalable
let globalLignes = null;    // scores bruts tous modes confondus (rang 5, #16)
let globalErreur = null;
let globalTri = 'classement'; // 'classement' | 'points' | 'temps'

// Regle du classement (decision de Paul, 29/09/2026) : le % reussi d'abord,
// puis a % egal la difficulte (Difficile > Normal > Facile), puis a
// difficulte egale le temps le plus court. Meme regle que comparerResultats
// (app.js), ici sur les lignes de la table `scores` (colonnes snake_case).
// Les essais ne departagent plus personne : affiches a titre indicatif.
const LB_RANG_DIFFICULTE = { facile: 0, normal: 1, difficile: 2 };
function rangDifficulte(d) { return LB_RANG_DIFFICULTE[d || 'normal'] ?? 1; }
function ordreLignes(a, b) {
  const dp = (Number(b.pct) || 0) - (Number(a.pct) || 0);
  if (dp) return dp;
  const dd = rangDifficulte(b.difficulte) - rangDifficulte(a.difficulte);
  if (dd) return dd;
  const ta = Number.isFinite(Number(a.duree_ms)) && a.duree_ms != null ? Number(a.duree_ms) : Infinity;
  const tb = Number.isFinite(Number(b.duree_ms)) && b.duree_ms != null ? Number(b.duree_ms) : Infinity;
  return ta === tb ? 0 : (ta < tb ? -1 : 1);
}
function badgeDifficulte(d) {
  if (d === 'difficile') return '<span class="lb-diff lb-diff--difficile">Difficile</span>';
  if (d === 'facile') return '<span class="lb-diff lb-diff--facile">Facile</span>';
  return '';
}
// Seules les sessions completes ("tous les mots") comptent dans TOUS les
// classements (Paul, 29/09/2026). Chaque ligne porte le filtre de mots de
// la session (`verbe_filter`, colonne ajoutee et remplie retroactivement a
// partir de l'historique des sauvegardes le 29/09/2026). Garde-fou en plus
// pour de tres vieilles lignes incoherentes : un total possible inferieur a
// la moitie du plus grand vu pour la semaine est ecarte aussi.
function lignesCompletes(rows) {
  const maxVu = new Map();
  (rows || []).forEach(r => {
    const cle = `${r.mode || 'vocab'}|${r.semester_id}|${r.week}`;
    maxVu.set(cle, Math.max(maxVu.get(cle) || 0, Number(r.max_points) || 0));
  });
  return (rows || []).filter(r => {
    if ((r.verbe_filter || 'tous') !== 'tous') return false;
    const ref = maxVu.get(`${r.mode || 'vocab'}|${r.semester_id}|${r.week}`) || 0;
    return !ref || (Number(r.max_points) || 0) >= 0.5 * ref;
  });
}

function tempsTexte(ms) { return ms == null || !Number.isFinite(Number(ms)) ? '—' : formatDuree(Number(ms)); }

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
        <button class="lb-tab ${leaderboardMode === 'global' ? 'is-active' : ''}" data-mode="global">Classement global</button>
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
      ${leaderboardMode === 'global' ? `
      <div class="lb-filtre">
        <label for="lbGlobalTri">Trier par</label>
        <select id="lbGlobalTri">
          <option value="classement" ${globalTri === 'classement' ? 'selected' : ''}>Classement (%, puis difficulté, puis temps)</option>
          <option value="points" ${globalTri === 'points' ? 'selected' : ''}>Points cumulés</option>
          <option value="temps" ${globalTri === 'temps' ? 'selected' : ''}>Temps moyen (plus rapide)</option>
        </select>
      </div>` : ''}
      <p class="lb-explain">${
        leaderboardMode === 'progression'
          ? 'Écart entre ton tout premier essai sur un contenu et ton meilleur score actuel, additionné sur tous les contenus travaillés. Plus on part de loin, plus on peut gagner — ce classement se gagne à la progression, pas au niveau.'
        : leaderboardMode === 'apercu'
          ? 'Le meilleur score de chaque semaine, dans l\'ordre du programme. Le filtre est là si tu veux resserrer, pas pour commencer.'
        : leaderboardMode === 'global'
          ? 'Tous les modes de quiz confondus (Vocabulaire, Kanji seul, Traduction, Double réponse). Classement : ton % moyen d\'abord, puis à % égal la difficulté (Difficile devant Normal devant Facile), puis le temps moyen le plus court. Seules les sessions « tous les mots » comptent. Les essais sont affichés à titre indicatif. Le Kana et la Pratique libre n\'ont pas de semaine fixe, ils ne comptent pas ici.'
          : 'Meilleurs scores de la semaine choisie : le % d\'abord, puis la difficulté, puis le temps. Seules les sessions « tous les mots » comptent.'}</p>
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

  const triGlobal = $('#lbGlobalTri');
  if (triGlobal) triGlobal.addEventListener('change', () => {
    globalTri = triGlobal.value;
    renderGlobal();
  });

  if (leaderboardMode === 'progression') loadProgressionRows();
  else if (leaderboardMode === 'apercu') chargerApercu();
  else if (leaderboardMode === 'global') chargerGlobal();
  else loadLeaderboardRows(leaderboardWeek.semesterId, leaderboardWeek.week);
}

// ---------- Vue d'ensemble ----------

async function chargerApercu() {
  if (apercuLignes) { renderApercu(); return; }
  try {
    // Une seule requête pour toutes les semaines : la table reste petite
    // (quelques centaines de lignes). Si elle grossit, ce calcul devra passer
    // dans une vue Postgres — même remarque que pour la progression.
    // .eq('mode','vocab') (rang 5, #16) : la table scores accueille
        // maintenant 4 modes (voir migration scores_multi_mode_duree_essais) --
        // sans ce filtre, une semaine melangerait des lignes Vocabulaire ET
        // Traduction/Kanji/Double, des defis differents pas comparables entre
        // eux. Ces 3 onglets existants restent scopes a Vocabulaire comme
        // avant ; le nouvel onglet "Classement global" ci-dessous est le seul
        // a agreger les 4 modes ensemble.
        const { data, error } = await window.sb
      .from('scores').select('user_id,pseudo,semester_id,week,pct,points,max_points,duree_ms,difficulte,verbe_filter,created_at')
      .eq('mode', 'vocab')
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

  let semaines = meilleursParSemaine(lignesCompletes(apercuLignes));
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
            ${window.kvtProfils ? window.kvtProfils.auteurHtml(premier.user_id, premier.pseudo, 34) : `<span class="auteur"><span class="auteur-pseudo">${escapeHtml(premier.pseudo)}</span></span>`}
            <div class="lb-case-infos">
              ${jeSuisPremier ? '<span class="com-marque">toi</span>' : ''}
            </div>
            <div class="lb-case-pct">${formatPct(premier.pct)}</div>
          </div>
          <div class="lb-case-detail">${premier.points}/${premier.max_points} pts${premier.duree_ms != null ? ' · ' + tempsTexte(premier.duree_ms) : ''} ${badgeDifficulte(premier.difficulte)}</div>
          ${suivants.length ? `
            <div class="lb-case-suite">
              ${suivants.slice(0, 2).map((r, i) => `
                <div class="lb-case-ligne ${r.user_id === moi ? 'lb-row-me' : ''}">
                  <span class="lb-case-rang">${i + 2}</span>
                  <span class="lb-case-nom">${window.kvtProfils ? window.kvtProfils.auteurHtml(r.user_id, r.pseudo, 16) : escapeHtml(r.pseudo)}</span>
                  <span class="lb-case-mini">${formatPct(r.pct)}</span>
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
    if (!actuel || ordreLignes(r, actuel) < 0) parPersonne.set(cle, r);
  });

  const parSemaine = new Map();
  parPersonne.forEach(r => {
    const cle = `${r.semester_id}|${r.week}`;
    if (!parSemaine.has(cle)) parSemaine.set(cle, { semesterId: r.semester_id, week: Number(r.week), lignes: [] });
    parSemaine.get(cle).lignes.push(r);
  });

  const liste = [...parSemaine.values()];
  liste.forEach(s => s.lignes.sort(ordreLignes));
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
  const resultat = await window.sb
    .from('scores')
    .select('user_id, pseudo, pct, points, max_points, duree_ms, nb_essais, difficulte, verbe_filter')
    .eq('semester_id', semesterId)
    .eq('week', week)
    .eq('mode', 'vocab') // rang 5, #16 : voir remarque dans chargerApercu()
    .limit(200);
  let data = lignesCompletes((resultat.data || []).map(r => ({ ...r, semester_id: semesterId, week, mode: 'vocab' })));
  const error = resultat.error;
  data.sort(ordreLignes);

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

  if (window.kvtProfils) {
    await window.kvtProfils.chargerProfils(data.map(r => r.user_id));
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
          <div class="lb-podium-pseudo">${window.kvtProfils ? window.kvtProfils.auteurHtml(r.user_id, r.pseudo, 22) : escapeHtml(r.pseudo)}</div>
          <div class="lb-podium-points">${formatPct(r.pct)} ${badgeDifficulte(r.difficulte)}</div>
          <div class="lb-podium-pct">${r.points}/${r.max_points} pts · ${tempsTexte(r.duree_ms)}</div>
          <div class="lb-podium-temps">${r.nb_essais != null ? r.nb_essais + ' essai' + (r.nb_essais > 1 ? 's' : '') : ''}</div>
        </div>`).join('')}
    </div>`;

  const restHtml = rest.length === 0 ? '' : `
    <table class="lb-table">
      <thead><tr><th>#</th><th>Pseudo</th><th>Réussite</th><th>Difficulté</th><th>Temps</th><th>Points</th><th title="À titre indicatif, ne compte pas dans le classement">Essais</th></tr></thead>
      <tbody>${rest.map((r, i) => `
        <tr class="${isMe(r) ? 'lb-row-me' : ''}">
          <td class="lb-rank">${i + 4}</td><td>${window.kvtProfils ? window.kvtProfils.auteurHtml(r.user_id, r.pseudo, 18) : escapeHtml(r.pseudo)}</td><td><strong>${formatPct(r.pct)}</strong></td><td>${badgeDifficulte(r.difficulte) || 'Normal'}</td><td>${tempsTexte(r.duree_ms)}</td><td>${r.points}/${r.max_points}</td><td>${r.nb_essais ?? '—'}</td>
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
    .select('user_id, pseudo, semester_id, week, pct, max_points, verbe_filter, created_at')
    .eq('mode', 'vocab') // rang 5, #16 : voir remarque dans chargerApercu()
    .limit(5000);

  if (leaderboardMode !== 'progression') return; // l'utilisateur a changé d'onglet
  const wrap = $('#lbTableWrap');
  if (!wrap) return;

  if (error) {
    wrap.innerHTML = `<p style="color:var(--pink);">Impossible de charger le classement.</p>`;
    return;
  }

  const rows = computeProgression(lignesCompletes((data || []).map(r => ({ ...r, mode: 'vocab' }))));
  if (rows.length === 0) {
    wrap.innerHTML = `<p style="color:var(--muted);">Personne n'a encore refait un contenu déjà tenté. Recommence une semaine déjà travaillée : l'écart avec ton premier essai apparaîtra ici.</p>`;
    return;
  }

  if (window.kvtProfils) {
    await window.kvtProfils.chargerProfils(rows.map(r => r.user_id));
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
          <div class="lb-podium-pseudo">${window.kvtProfils ? window.kvtProfils.auteurHtml(r.user_id, r.pseudo, 22) : escapeHtml(r.pseudo)}</div>
          <div class="lb-podium-points">+${r.gain}<span> pts</span></div>
          <div class="lb-podium-pct">sur ${contenus(r.contenus)}</div>
        </div>`).join('')}
    </div>`;

  const restHtml = rest.length === 0 ? '' : `
    <table class="lb-table">
      <thead><tr><th>#</th><th>Pseudo</th><th>Progression</th><th>Contenus</th></tr></thead>
      <tbody>${rest.map((r, i) => `
        <tr class="${isMe(r) ? 'lb-row-me' : ''}">
          <td class="lb-rank">${i + 4}</td><td>${window.kvtProfils ? window.kvtProfils.auteurHtml(r.user_id, r.pseudo, 18) : escapeHtml(r.pseudo)}</td><td><strong>+${r.gain}</strong> pts</td><td>${r.contenus}</td>
        </tr>`).join('')}</tbody>
    </table>`;

  wrap.innerHTML = podiumHtml + restHtml;
}

// ---------- Classement global (rang 5, #16) ----------
// Agrège les 4 modes synchronisés (vocab, kanji, traduction, double) — voir
// la migration scores_multi_mode_duree_essais. Le Kana et la Pratique libre
// n'ont pas de couple (semestre, semaine) naturel et restent hors de ce
// classement (voir la remarque dans chargerApercu()).

async function chargerGlobal() {
  if (globalLignes) { renderGlobal(); return; }
  try {
    const { data, error } = await window.sb
      .from('scores')
      .select('user_id, pseudo, points, max_points, pct, duree_ms, nb_essais, semester_id, week, mode, difficulte, verbe_filter')
      .limit(5000);
    if (error) throw error;
    globalLignes = data || [];
    globalErreur = null;
    if (window.kvtProfils) {
      await window.kvtProfils.chargerProfils(globalLignes.map(r => r.user_id));
    }
  } catch (err) {
    globalLignes = [];
    globalErreur = err && err.message ? err.message : String(err);
  }
  if (leaderboardMode === 'global') renderGlobal();
}

// Une ligne par (utilisateur, mode, semestre, semaine) dans la table : on
// additionne les points (le meilleur de chaque semaine/mode compte pour le
// total), on moyenne le % et le temps sur les lignes où ils existent, et on
// additionne les essais. `duree_ms`/`nb_essais` peuvent être absents sur
// d'anciennes lignes (colonnes ajoutées après coup) : on les ignore plutôt
// que de les compter comme zéro.
function computeGlobal(rows) {
  const parUser = new Map();
  (rows || []).forEach((r) => {
    const u = parUser.get(r.user_id) || {
      user_id: r.user_id, pseudo: r.pseudo,
      points: 0, sommePct: 0, nbPct: 0, sommeDuree: 0, nbDuree: 0, essais: 0,
      sommeDiff: 0
    };
    u.pseudo = r.pseudo; // le pseudo le plus récent fait foi (comme ailleurs)
    u.points += Number(r.points) || 0;
    const pct = Number(r.pct);
    if (Number.isFinite(pct)) { u.sommePct += pct; u.nbPct += 1; }
    const duree = Number(r.duree_ms);
    if (Number.isFinite(duree) && duree > 0) { u.sommeDuree += duree; u.nbDuree += 1; }
    const essais = Number(r.nb_essais);
    if (Number.isFinite(essais)) u.essais += essais;
    u.sommeDiff += rangDifficulte(r.difficulte);
    u.nbLignes = (u.nbLignes || 0) + 1;
    parUser.set(r.user_id, u);
  });

  return [...parUser.values()].map((u) => ({
    user_id: u.user_id,
    pseudo: u.pseudo,
    points: u.points,
    pctMoyen: u.nbPct ? u.sommePct / u.nbPct : null,
    dureeMoyenne: u.nbDuree ? u.sommeDuree / u.nbDuree : null,
    essais: u.essais,
    // Difficulte moyenne (0 = Facile, 1 = Normal, 2 = Difficile), ne sert
    // qu'a departager deux % moyens egaux.
    difficulteMoyenne: u.nbLignes ? u.sommeDiff / u.nbLignes : 1
  }));
}

function trierGlobal(rows, tri) {
  const copie = rows.slice();
  if (tri === 'classement') {
    copie.sort((a, b) => ((b.pctMoyen ?? -1) - (a.pctMoyen ?? -1))
      || (b.difficulteMoyenne - a.difficulteMoyenne)
      || ((a.dureeMoyenne ?? Infinity) - (b.dureeMoyenne ?? Infinity) || 0));
  } else if (tri === 'temps') {
    // Sans temps enregistré (anciennes sessions) : en fin de liste, jamais
    // avantagé par une absence de donnée.
    copie.sort((a, b) => {
      if (a.dureeMoyenne == null && b.dureeMoyenne == null) return b.points - a.points;
      if (a.dureeMoyenne == null) return 1;
      if (b.dureeMoyenne == null) return -1;
      return a.dureeMoyenne - b.dureeMoyenne;
    });
  } else {
    copie.sort((a, b) => b.points - a.points);
  }
  return copie;
}

function renderGlobal() {
  const wrap = $('#lbTableWrap');
  if (!wrap) return;

  if (globalErreur) {
    wrap.innerHTML = `<p style="color:var(--pink);">Impossible de charger le classement : ${escapeHtml(globalErreur)}</p>`;
    return;
  }
  if (!globalLignes) {
    wrap.innerHTML = `<p style="color:var(--muted);">Chargement…</p>`;
    return;
  }

  const agrege = computeGlobal(lignesCompletes(globalLignes)).filter((u) => u.points > 0);
  if (!agrege.length) {
    wrap.innerHTML = `<p style="color:var(--muted);">Aucun score enregistré pour l'instant. Termine une session (Vocabulaire, Kanji seul, Traduction ou Double réponse) : tu seras le premier du tableau.</p>`;
    return;
  }

  const rows = trierGlobal(agrege, globalTri);
  const isMe = (r) => window.accountUser && r.user_id === window.accountUser.id;
  const medals = ['🥇', '🥈', '🥉'];
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  const critere = (r) => {
    if (globalTri === 'classement') return r.pctMoyen == null ? '—' : formatPct(r.pctMoyen);
    if (globalTri === 'temps') return r.dureeMoyenne == null ? '—' : formatDuree(r.dureeMoyenne);
    return `${r.points} pts`;
  };

  const podiumHtml = `
    <div class="lb-podium">
      ${top3.map((r, i) => `
        <div class="lb-podium-item lb-rank-${i + 1} ${isMe(r) ? 'lb-me' : ''}">
          <div class="lb-medal">${medals[i]}</div>
          <div class="lb-podium-pseudo">${window.kvtProfils ? window.kvtProfils.auteurHtml(r.user_id, r.pseudo, 22) : escapeHtml(r.pseudo)}</div>
          <div class="lb-podium-points">${critere(r)}</div>
          <div class="lb-podium-pct">${globalTri === 'points' ? (r.pctMoyen == null ? '—' : formatPct(r.pctMoyen) + ' de moyenne') : r.points + ' pts cumulés'}</div>
          ${globalTri === 'temps' ? '' : `<div class="lb-podium-temps">${r.dureeMoyenne == null ? 'Temps : —' : `Temps moyen : ${formatDuree(r.dureeMoyenne)}`}</div>`}
          <div class="lb-podium-temps">${r.essais} essai${r.essais > 1 ? 's' : ''}</div>
        </div>`).join('')}
    </div>`;

  const restHtml = rest.length === 0 ? '' : `
    <table class="lb-table">
      <thead><tr><th>#</th><th>Pseudo</th><th>% moyen</th><th>Temps moyen</th><th>Points</th><th title="À titre indicatif, ne compte pas dans le classement">Essais</th></tr></thead>
      <tbody>${rest.map((r, i) => `
        <tr class="${isMe(r) ? 'lb-row-me' : ''}">
          <td class="lb-rank">${i + 4}</td>
          <td>${window.kvtProfils ? window.kvtProfils.auteurHtml(r.user_id, r.pseudo, 18) : escapeHtml(r.pseudo)}</td>
          <td><strong>${r.pctMoyen == null ? '—' : formatPct(r.pctMoyen)}</strong></td>
          <td>${r.dureeMoyenne == null ? '—' : formatDuree(r.dureeMoyenne)}</td>
          <td>${r.points}</td>
          <td>${r.essais}</td>
        </tr>`).join('')}</tbody>
    </table>`;

  wrap.innerHTML = podiumHtml + restHtml;
}

// ---------- Widget "Classement" sur l'accueil (#21, rang 5) ----------
// Reprend computeGlobal()/trierGlobal() du classement global ci-dessus --
// même agrégation, juste un top 3 compact avec un lien vers la page
// complète, plutôt qu'une deuxième logique de classement à maintenir.
let accueilClassementLignes = null;
let accueilClassementErreur = null;

async function chargerClassementAccueil() {
  const wrap = $('#accueilClassementWrap');
  if (!wrap) return; // widget pas dans la page (vue déjà changée)

  if (!window.accountUser) { renderClassementAccueilWidget(); return; }
  if (accueilClassementLignes) { renderClassementAccueilWidget(); return; }
  try {
    if (!window.sb) throw new Error('Connexion indisponible');
    const { data, error } = await window.sb
      .from('scores')
      .select('user_id, pseudo, points, max_points, pct, duree_ms, nb_essais, semester_id, week, mode, difficulte, verbe_filter')
      .limit(5000);
    if (error) throw error;
    accueilClassementLignes = data || [];
    accueilClassementErreur = null;
    if (window.kvtProfils) {
      await window.kvtProfils.chargerProfils(accueilClassementLignes.map(r => r.user_id));
    }
  } catch (err) {
    accueilClassementLignes = [];
    accueilClassementErreur = err && err.message ? err.message : String(err);
  }
  renderClassementAccueilWidget();
}

function renderClassementAccueilWidget() {
  const wrap = $('#accueilClassementWrap');
  if (!wrap) return;

  if (!window.accountUser) {
    wrap.innerHTML = `<p style="font-size:13px; color:var(--muted);">Connecte-toi (onglet Compte) pour voir le classement de la classe.</p>`;
    return;
  }
  if (accueilClassementErreur) {
    wrap.innerHTML = `<p style="font-size:13px; color:var(--pink);">Classement indisponible pour l'instant.</p>`;
    return;
  }
  if (!accueilClassementLignes) {
    wrap.innerHTML = `<p style="font-size:13px; color:var(--muted);">Chargement…</p>`;
    return;
  }

  const classes = trierGlobal(computeGlobal(lignesCompletes(accueilClassementLignes)).filter((u) => u.points > 0), 'classement');
  if (!classes.length) {
    wrap.innerHTML = `<p style="font-size:13px; color:var(--muted);">Personne n'a encore de score. Termine une session : tu seras le premier.</p>`;
    return;
  }

  const moi = window.accountUser.id;
  const medals = ['🥇', '🥈', '🥉'];
  wrap.innerHTML = `
    <div class="accueil-classement-liste">
      ${classes.slice(0, 3).map((r, i) => `
        <div class="accueil-classement-ligne ${r.user_id === moi ? 'lb-row-me' : ''}">
          <span>${medals[i]}</span>
          <span class="accueil-classement-pseudo">${window.kvtProfils ? window.kvtProfils.auteurHtml(r.user_id, r.pseudo, 20) : escapeHtml(r.pseudo)}</span>
          <span class="accueil-classement-points">${r.pctMoyen == null ? '—' : formatPct(r.pctMoyen)}</span>
        </div>`).join('')}
    </div>
    <button class="lien-retour" id="btnVoirClassement" style="margin-top:10px;">Voir le classement complet →</button>`;

  const btn = $('#btnVoirClassement');
  if (btn) btn.addEventListener('click', () => switchView('leaderboard'));
}
