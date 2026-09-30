// ============================================================
// Historique (liste d'idees de Paul, 30/09/2026) :
// - tes dernieres sessions (mode, semaine, %, temps, difficulte) ;
// - le detail des reponses de chaque session, surtout apres un test en mode
//   Difficile (ou la correction n'est montree qu'a la fin) ;
// - l'activite recente de tes amis (leurs derniers records au classement).
//
// Tout reste prive : l'historique detaille n'existe que dans ta sauvegarde
// (DB.historiqueReponses), jamais dans la table publique des scores.
// L'activite des amis ne lit que des scores deja visibles au classement, et
// seulement pour les personnes que tu as acceptees comme amies.
// ============================================================

const HISTORIQUE_MAX_SESSIONS = 30;
const HISTORIQUE_MAX_TEXTE = 40;
const HISTORIQUE_MODES = {
  vocab: 'Vocabulaire',
  kanji: 'Kanji seul',
  traduction: 'Traduction',
  double: 'Double réponse'
};
let historiqueOuverte = null;      // date de la session dont le detail est deplie
let historiqueOnglet = 'sessions'; // 'sessions' | 'amis'
let activiteAmis = null;           // null = pas charge, [] = vide, sinon lignes
let activiteAmisErreur = null;

function coupeTexte(t) {
  const s = String(t == null ? '' : t);
  return s.length > HISTORIQUE_MAX_TEXTE ? s.slice(0, HISTORIQUE_MAX_TEXTE - 1) + '…' : s;
}

// Une reponse de quiz, ramenee a { m: question, a: attendu, r: ta reponse, p: % }.
// Pure : ne depend pas de l'ecran, seulement de la forme de quizSession.answers.
function reponseCompacte(mode, a) {
  const p = Math.round((Number(a && a.pct) || 0) * 100);
  if (mode === 'kanji') {
    return { m: coupeTexte((a.kanji || '') + (a.type ? ' (' + (a.type === 'onyomi' ? 'on' : 'kun') + ')' : '')), a: '', r: coupeTexte(a.userAnswer), p };
  }
  if (mode === 'traduction') {
    return { m: coupeTexte(a.sens), a: coupeTexte(a.mot), r: coupeTexte(a.userAnswer), p };
  }
  if (mode === 'double') {
    return { m: coupeTexte(a.mot), a: coupeTexte((a.lecture || '') + ' / ' + (a.sens || '')), r: coupeTexte((a.userAnswerLecture || '') + ' / ' + (a.userAnswerSens || '')), p };
  }
  return { m: coupeTexte(a.mot), a: coupeTexte(a.lecture), r: coupeTexte(a.userAnswer), p };
}

// Ajoute une session en tete de DB.historiqueReponses (les plus recentes
// d'abord, HISTORIQUE_MAX_SESSIONS au plus : le detail pese quelques ko par
// session, la sauvegarde n'a pas a grossir sans limite).
function enregistrerHistoriqueSession(db, session, mode, resultat) {
  if (!db || !session) return null;
  const reponses = (session.answers || []).map(a => reponseCompacte(mode, a));
  const entree = {
    date: new Date().toISOString(),
    mode,
    semesterId: session.semesterId || null,
    week: session.week || null,
    pct: resultat.pct,
    points: resultat.points,
    maxPoints: resultat.maxPoints,
    dureeMs: Number.isFinite(resultat.dureeMs) ? resultat.dureeMs : null,
    difficulte: resultat.difficulte || 'normal',
    filtre: session.verbeFilter || 'tous',
    reponses
  };
  db.historiqueReponses = [entree].concat(db.historiqueReponses || []).slice(0, HISTORIQUE_MAX_SESSIONS);
  return entree;
}

// Union de deux historiques (deux appareils) : meme date + meme mode = meme
// session. Les plus recentes d'abord, plafonne.
function fusionnerHistoriques(a, b) {
  const vus = new Map();
  [].concat(a || [], b || []).forEach(e => {
    if (e && e.date) vus.set(e.date + '|' + e.mode + '|' + e.semesterId + '|' + e.week, e);
  });
  return Array.from(vus.values())
    .sort((x, y) => (x.date < y.date ? 1 : -1))
    .slice(0, HISTORIQUE_MAX_SESSIONS);
}

function dateCourte(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function libelleSemaine(semesterId, week) {
  let sem = null;
  try { sem = typeof getSemester === 'function' ? getSemester(semesterId) : null; } catch (e) { sem = null; }
  return `${sem && sem.label ? sem.label : (semesterId || '?')} · semaine ${week}`;
}

function badgeDiffHistorique(d) {
  if (d === 'difficile') return '<span class="lb-diff lb-diff--difficile">Difficile</span>';
  if (d === 'facile') return '<span class="lb-diff lb-diff--facile">Facile</span>';
  return '';
}

function detailReponsesHtml(e) {
  if (!e.reponses || !e.reponses.length) return '<p class="hist-vide">Pas de détail conservé pour cette session.</p>';
  const lignes = e.reponses.map(r => {
    const classe = r.p >= 99 ? 'bon' : (r.p >= 60 ? 'moyen' : 'faux');
    return `<tr class="hist-rep hist-rep--${classe}">
      <td>${escapeHtml(r.m)}</td>
      <td>${r.a ? escapeHtml(r.a) : '—'}</td>
      <td>${r.r ? escapeHtml(r.r) : '<em>(vide)</em>'}</td>
      <td class="hist-rep__pct">${r.p} %</td>
    </tr>`;
  }).join('');
  return `<div class="hist-detail"><table class="hist-table">
    <thead><tr><th>Question</th><th>Attendu</th><th>Ta réponse</th><th></th></tr></thead>
    <tbody>${lignes}</tbody></table></div>`;
}

function htmlSessionsHistorique() {
  const liste = (typeof DB !== 'undefined' && DB.historiqueReponses) || [];
  if (!liste.length) {
    return `<p class="hist-vide">Aucune session enregistrée pour l'instant. Termine un quiz : ses réponses apparaîtront ici (les ${HISTORIQUE_MAX_SESSIONS} dernières sessions sont gardées).</p>`;
  }
  return `<ul class="hist-liste">${liste.map(e => {
    const ouverte = historiqueOuverte === e.date;
    const classe = e.pct >= 99.9 ? 'parfait' : (e.pct >= 70 ? 'bon' : 'bas');
    return `<li class="hist-session hist-session--${classe}">
      <button type="button" class="hist-session__tete" data-hist-ouvrir="${escapeHtml(e.date)}" aria-expanded="${ouverte}">
        <span class="hist-session__mode">${escapeHtml(HISTORIQUE_MODES[e.mode] || e.mode)}</span>
        <span class="hist-session__semaine">${escapeHtml(libelleSemaine(e.semesterId, e.week))}${e.filtre && e.filtre !== 'tous' ? ' · mots filtrés' : ''}</span>
        <span class="hist-session__pct">${formatPct(e.pct)} ${badgeDiffHistorique(e.difficulte)}</span>
        <span class="hist-session__meta">${e.dureeMs != null ? (formatDuree(e.dureeMs) || '') + ' · ' : ''}${escapeHtml(dateCourte(e.date))}</span>
      </button>
      ${ouverte ? detailReponsesHtml(e) : ''}
    </li>`;
  }).join('')}</ul>`;
}

function htmlActiviteAmis() {
  if (!window.accountUser) return '<p class="hist-vide">Connecte-toi pour voir l\'activité de tes amis.</p>';
  if (activiteAmisErreur) return `<p class="hist-vide">Impossible de charger l'activité : ${escapeHtml(activiteAmisErreur)}</p>`;
  if (activiteAmis === null) return '<p class="hist-vide">Chargement…</p>';
  if (!activiteAmis.length) return '<p class="hist-vide">Rien à montrer pour l\'instant : ajoute des amis depuis l\'onglet Compte, ou attends leur prochain record.</p>';
  return `<ul class="hist-liste">${activiteAmis.map(l => `
    <li class="hist-session">
      <div class="hist-session__tete hist-session__tete--statique">
        <span class="hist-session__mode">${window.kvtProfils ? window.kvtProfils.auteurHtml(l.user_id, l.pseudo, 22) : escapeHtml(l.pseudo || '?')}</span>
        <span class="hist-session__semaine">${escapeHtml(HISTORIQUE_MODES[l.mode] || l.mode || 'Vocabulaire')} · ${escapeHtml(libelleSemaine(l.semester_id, l.week))}</span>
        <span class="hist-session__pct">${formatPct(l.pct)} ${badgeDiffHistorique(l.difficulte)}</span>
        <span class="hist-session__meta">${l.duree_ms != null ? (formatDuree(Number(l.duree_ms)) || '') + ' · ' : ''}${escapeHtml(dateCourte(l.created_at))}</span>
      </div>
    </li>`).join('')}</ul>`;
}

async function chargerActiviteAmis() {
  activiteAmisErreur = null;
  try {
    if (!window.accountUser || !window.sb) { activiteAmis = []; return; }
    if (window.kvtAmis && window.kvtAmis.chargerAmities) await window.kvtAmis.chargerAmities();
    const { amis } = window.kvtAmis.classerAmities();
    const ids = amis.map(l => window.kvtAmis.autreQueMoi(l));
    if (!ids.length) { activiteAmis = []; return; }
    const { data, error } = await window.sb
      .from('scores')
      .select('user_id,pseudo,mode,semester_id,week,pct,duree_ms,difficulte,verbe_filter,created_at')
      .in('user_id', ids).order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    // Comme au classement : seules les sessions completes comptent.
    const lignes = typeof lignesCompletes === 'function' ? lignesCompletes(data || []) : (data || []);
    activiteAmis = lignes.slice(0, 25);
    if (window.kvtProfils) await window.kvtProfils.chargerProfils(activiteAmis.map(l => l.user_id));
  } catch (err) {
    activiteAmis = [];
    activiteAmisErreur = err && err.message ? err.message : String(err);
  }
}

// cible : élément où dessiner (onglet du profil). Sans argument, on garde la
// dernière cible tant qu'elle est encore dans la page ; renderHistorique(null)
// revient à la vue autonome.
let historiqueCible = null;
function renderHistorique(cible) {
  if (cible !== undefined) historiqueCible = cible;
  const dansProfil = !!(historiqueCible && historiqueCible.isConnected);
  const el = dansProfil ? historiqueCible : document.getElementById('view-historique');
  if (!el) return;
  el.innerHTML = `
    ${dansProfil ? '' : '<h2>Historique</h2>'}
    <div class="hist-onglets" role="tablist">
      <button type="button" class="hist-onglet ${historiqueOnglet === 'sessions' ? 'is-active' : ''}" data-hist-onglet="sessions" role="tab" aria-selected="${historiqueOnglet === 'sessions'}">Mes sessions</button>
      <button type="button" class="hist-onglet ${historiqueOnglet === 'amis' ? 'is-active' : ''}" data-hist-onglet="amis" role="tab" aria-selected="${historiqueOnglet === 'amis'}">Activité des amis</button>
    </div>
    <div class="card hist-carte">
      ${historiqueOnglet === 'sessions' ? htmlSessionsHistorique() : htmlActiviteAmis()}
    </div>
    <p class="hist-note">Ton historique reste privé. Les amis ne voient que tes records du classement.</p>`;
  el.querySelectorAll('[data-hist-onglet]').forEach(b => b.addEventListener('click', async () => {
    historiqueOnglet = b.dataset.histOnglet;
    renderHistorique();
    if (historiqueOnglet === 'amis' && activiteAmis === null) {
      await chargerActiviteAmis();
      if (historiqueOnglet === 'amis') renderHistorique();
    }
  }));
  el.querySelectorAll('[data-hist-ouvrir]').forEach(b => b.addEventListener('click', () => {
    historiqueOuverte = historiqueOuverte === b.dataset.histOuvrir ? null : b.dataset.histOuvrir;
    renderHistorique();
  }));
}

window.kvtHistorique = { enregistrerHistoriqueSession, fusionnerHistoriques };
