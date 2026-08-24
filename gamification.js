// ============================================================
// Gamification — niveaux, XP, pièces d'or, série quotidienne, boutique.
//
// Ajouté le 24/08/2026 à la demande de Paul, ajusté le même jour en deux
// passes suite à ses retours :
// - v2 : ajout d'une deuxième monnaie ("or") séparée des pièces.
// - v3 (celle-ci) : Paul a précisé qu'il ne voulait PAS une deuxième
//   monnaie — juste que la monnaie existante SOIT de l'or (rebaptisée
//   "pièces d'or", même icône 🪙 qui rend déjà comme une pièce dorée).
//   Toute la logique de gain/dépense en "or" séparé (gagnerOr, paliers de
//   niveau/série/session parfaite en or) a donc été retirée : une seule
//   monnaie, plus généreuse (voir plus bas), pas deux.
//
// Principe repris de `01 - Décisions techniques.md` / vision produit du
// 25/07 : tout ce qui touche à l'apprentissage lui-même reste gratuit et
// gagnable en jouant normalement. Le Pro n'accélère que la vitesse à
// laquelle on gagne (boost XP/pièces) et donne accès à quelques objets de
// boutique en plus — jamais un raccourci qui remplace la pratique.
//
// Numéros de barème (XP par niveau, prix boutique, seuils) : troisième
// passe, toujours pas testée sur un usage réel — à ajuster si besoin, voir
// `02 - Idées futures.md`.
// ============================================================

// ---------- Configuration ----------

// Niveau = à quelle vitesse l'XP cumulée fait progresser. Courbe
// quadratique : xp requis pour le niveau L = GAMIF_XP_PAR_NIVEAU * (L-1)^2.
// Chaque niveau demande plus que le précédent, mais reste atteignable.
const GAMIF_XP_PAR_NIVEAU = 50;

// Boost Pro : multiplie XP et pièces d'or gagnées. Le Pro ne touche jamais
// à l'apprentissage lui-même (voir en-tête), seulement à la vitesse de la
// couche jeu — cohérent avec le reste du modèle Pro (déco + soutien).
const GAMIF_BOOST_PRO = 1.5;

// Le flux du quotidien. Deux pièces d'or par mot réussi (au lieu d'une
// dans la toute première version) — seuil identique à MISS_THRESHOLD
// (app.js, 60% = un mot déjà considéré "raté" ailleurs dans l'app, qui ne
// rapporte rien ici non plus).
const GAMIF_SEUIL_PIECE = 6; // sur l'échelle 0-10 de result.points
const GAMIF_PIECES_PAR_MOT = 2;

// Bonus de fin de session, si le score dépasse 80%.
const GAMIF_SEUIL_BONUS_SESSION = 80;
const GAMIF_BONUS_SESSION = 15;

// Catalogue boutique : des titres cosmétiques affichés à côté du niveau.
// Aucun ne touche à l'apprentissage (contenu, stats, classement) — décoratif
// uniquement, comme le reste de ce qui se paie dans KVT. `niveauRequis`
// verrouille l'objet tant que le niveau n'est pas atteint, même avec assez
// de pièces d'or — la boutique se remplit avec la progression, pas
// seulement avec le temps passé. Les objets les plus chers (Légendaire et
// au-delà) servent d'objectif long terme maintenant que le flux de pièces
// est plus généreux.
const GAMIF_BOUTIQUE = [
  { id: 'titre-motive', nom: 'Motivé·e', emoji: '🌱', prix: 20, pro: false, niveauRequis: 1 },
  { id: 'titre-serieux', nom: 'Sérieux·se', emoji: '📘', prix: 60, pro: false, niveauRequis: 1 },
  { id: 'titre-assidu', nom: 'Assidu·e', emoji: '📅', prix: 100, pro: false, niveauRequis: 3 },
  { id: 'titre-chasseur', nom: 'Chasseur de kanji', emoji: '🎯', prix: 150, pro: false, niveauRequis: 3 },
  { id: 'titre-marathonien', nom: 'Marathonien·ne', emoji: '🏃', prix: 200, pro: false, niveauRequis: 4 },
  { id: 'titre-nocturne', nom: 'Réviseur·se nocturne', emoji: '🌙', prix: 250, pro: false, niveauRequis: 5 },
  { id: 'titre-dojo', nom: 'Légende du dojo', emoji: '🥋', prix: 500, pro: false, niveauRequis: 8 },
  { id: 'titre-sensei', nom: 'Sensei', emoji: '⛩️', prix: 400, pro: true, niveauRequis: 5 },
  { id: 'titre-dragon', nom: 'Dragon de jade', emoji: '🐉', prix: 800, pro: true, niveauRequis: 10 },
  { id: 'titre-legendaire', nom: 'Légendaire', emoji: '🏆', prix: 1200, pro: false, niveauRequis: 10 },
  { id: 'titre-immortel', nom: 'Immortel·le', emoji: '💎', prix: 2000, pro: true, niveauRequis: 15 },
  { id: 'titre-empereur', nom: 'Empereur du kanji', emoji: '👑', prix: 3500, pro: true, niveauRequis: 20 }
];

function gamifEstPro() {
  return !!(window.accountUser && window.accountUser.isPro);
}

// Ajoute les champs par défaut si absents — même logique que migrate() dans
// webapi.js (non-destructif, jamais utile en pratique puisque migrate() le
// fait déjà, gardée ici en repli pour les tests et les cas limites).
function assurerGamification() {
  if (!DB.gamification) {
    DB.gamification = { xp: 0, pieces: 0, streak: { compte: 0, record: 0, dernierJour: null }, inventaire: [], titreActif: null };
  }
  return DB.gamification;
}

// ---------- Niveau (dérivé de l'XP, jamais stocké séparément) ----------

function niveauDepuisXp(xp) {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / GAMIF_XP_PAR_NIVEAU));
}

function xpPourNiveau(niveau) {
  return GAMIF_XP_PAR_NIVEAU * Math.pow(niveau - 1, 2);
}

// { niveau, xpDansNiveau, largeurNiveau, pct } — pct = avancement (0-100)
// vers le niveau suivant, pour la barre de progression.
function progressionNiveau(xp) {
  const niveau = niveauDepuisXp(xp);
  const seuilActuel = xpPourNiveau(niveau);
  const seuilSuivant = xpPourNiveau(niveau + 1);
  const xpDansNiveau = xp - seuilActuel;
  const largeurNiveau = seuilSuivant - seuilActuel;
  const pct = largeurNiveau > 0 ? Math.min(100, Math.round((xpDansNiveau / largeurNiveau) * 100)) : 100;
  return { niveau, xpDansNiveau, largeurNiveau, pct };
}

// ---------- Gains ----------

function gagnerXp(points) {
  if (!points || points <= 0) return 0;
  const g = assurerGamification();
  const gain = Math.round(points * (gamifEstPro() ? GAMIF_BOOST_PRO : 1));
  g.xp += gain;
  return gain;
}

function gagnerPieces(points) {
  if (!points || points < GAMIF_SEUIL_PIECE) return 0;
  const g = assurerGamification();
  const gain = Math.round(GAMIF_PIECES_PAR_MOT * (gamifEstPro() ? GAMIF_BOOST_PRO : 1));
  g.pieces += gain;
  return gain;
}

function bonusFinSession(pctSession) {
  if (pctSession < GAMIF_SEUIL_BONUS_SESSION) return 0;
  const g = assurerGamification();
  const gain = Math.round(GAMIF_BONUS_SESSION * (gamifEstPro() ? GAMIF_BOOST_PRO : 1));
  g.pieces += gain;
  return gain;
}

// ---------- Série quotidienne (streak) ----------
// Une seule mise à jour par jour civil (UTC — même convention que les dates
// ISO déjà utilisées dans DB.scores ailleurs dans le projet). Un jour sauté
// remet le compteur à 1, pas à 0 : le jour où on revient compte lui-même.

function gamifDateDuJour() {
  return new Date().toISOString().slice(0, 10);
}

function gamifJourPrecedent(jourIso) {
  const d = new Date(jourIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function mettreAJourStreak() {
  const g = assurerGamification();
  const aujourdhui = gamifDateDuJour();
  if (g.streak.dernierJour === aujourdhui) return g.streak; // déjà compté aujourd'hui
  if (g.streak.dernierJour === gamifJourPrecedent(aujourdhui)) {
    g.streak.compte += 1;
  } else {
    g.streak.compte = 1;
  }
  g.streak.dernierJour = aujourdhui;
  if (g.streak.compte > g.streak.record) g.streak.record = g.streak.compte;
  return g.streak;
}

// ---------- Boutique ----------

function objetBoutique(id) {
  return GAMIF_BOUTIQUE.find(o => o.id === id) || null;
}

// Ordre des refus : introuvable, déjà possédé, niveau, Pro, puis les pièces
// — le niveau et le statut Pro sont des conditions d'accès à l'objet
// lui-même, vérifiées avant de regarder si le porte-monnaie suit.
function acheterObjet(id) {
  const g = assurerGamification();
  const objet = objetBoutique(id);
  if (!objet) return { ok: false, motif: 'introuvable' };
  if (g.inventaire.includes(id)) return { ok: false, motif: 'deja-possede' };
  if (niveauDepuisXp(g.xp) < objet.niveauRequis) return { ok: false, motif: 'niveau-insuffisant' };
  if (objet.pro && !gamifEstPro()) return { ok: false, motif: 'reserve-pro' };
  if (g.pieces < objet.prix) return { ok: false, motif: 'pas-assez-de-pieces' };
  g.pieces -= objet.prix;
  g.inventaire.push(id);
  return { ok: true };
}

function equiperTitre(id) {
  const g = assurerGamification();
  if (id !== null && !g.inventaire.includes(id)) return { ok: false };
  g.titreActif = id;
  return { ok: true };
}

// ---------- Rendu : widget tableau de bord ----------
// Inséré dans renderDashboard() (app.js) — voir en-tête de la fonction.

function widgetGamification() {
  const g = assurerGamification();
  const prog = progressionNiveau(g.xp);
  const titre = g.titreActif ? objetBoutique(g.titreActif) : null;
  return `
    <div class="card gamif-widget">
      <div class="gamif-widget__niveau">
        <div class="gamif-widget__badge">Niv. ${prog.niveau}</div>
        <div class="gamif-widget__barre" title="${prog.xpDansNiveau}/${prog.largeurNiveau} XP avant le niveau suivant">
          <div class="gamif-widget__barre-remplie" style="width:${prog.pct}%"></div>
        </div>
        <div class="gamif-widget__xp">${g.xp} XP</div>
      </div>
      <div class="gamif-widget__stats">
        <span class="gamif-piece" title="Pièces d'or">🪙 ${g.pieces}</span>
        <span class="gamif-streak" title="Série de jours consécutifs">🔥 ${g.streak.compte}</span>
        ${titre ? `<span class="gamif-titre">${titre.emoji} ${escapeHtml(titre.nom)}</span>` : ''}
      </div>
    </div>`;
}

// ---------- Rendu : vue Boutique ----------

function renderBoutique() {
  const container = $('#view-boutique');
  const g = assurerGamification();
  const pro = gamifEstPro();
  const niveauActuel = niveauDepuisXp(g.xp);
  container.innerHTML = `
    <h2>Boutique</h2>
    <div class="card gamif-solde">
      <span class="gamif-piece">🪙 ${g.pieces} pièce${g.pieces > 1 ? 's' : ''} d'or</span>
      <span style="color:var(--muted); font-size:13px;">Gagnées en révisant — deux pièces d'or par mot correct, un bonus si tu finis une session à 80% ou plus. Purement décoratif : aucun avantage sur le classement.</span>
    </div>
    <div class="boutique-grid">
      ${GAMIF_BOUTIQUE.map(o => {
        const possede = g.inventaire.includes(o.id);
        const niveauBloque = niveauActuel < o.niveauRequis;
        const proBloque = o.pro && !pro;
        const actif = g.titreActif === o.id;
        let bouton;
        if (possede) {
          bouton = `<button class="secondary" data-equiper="${o.id}" ${actif ? 'disabled' : ''}>${actif ? 'Équipé' : 'Équiper'}</button>`;
        } else if (niveauBloque) {
          bouton = `<button class="secondary" disabled>Niveau ${o.niveauRequis} requis</button>`;
        } else if (proBloque) {
          bouton = `<button class="secondary" disabled>Réservé Pro</button>`;
        } else {
          bouton = `<button class="primary" data-acheter="${o.id}" ${g.pieces < o.prix ? 'disabled' : ''}>${o.prix} 🪙</button>`;
        }
        return `
          <div class="card boutique-item ${possede ? 'boutique-item--possede' : ''}">
            <div class="boutique-item__emoji">${o.emoji}</div>
            <div class="boutique-item__nom">${escapeHtml(o.nom)}</div>
            ${o.pro ? '<div class="boutique-item__pro">Pro</div>' : ''}
            ${bouton}
          </div>`;
      }).join('')}
    </div>
    ${g.titreActif ? `<button class="lien-retour" id="btnRetirerTitre">Ne plus afficher de titre</button>` : ''}
  `;
  $$('[data-acheter]', container).forEach(b => {
    b.onclick = () => {
      const res = acheterObjet(b.dataset.acheter);
      if (!res.ok) { showToast('Achat impossible.'); return; }
      showToast('Objet acheté !');
      persist();
      renderBoutique();
    };
  });
  $$('[data-equiper]', container).forEach(b => {
    b.onclick = () => { equiperTitre(b.dataset.equiper); persist(); renderBoutique(); };
  });
  const btnRetirer = $('#btnRetirerTitre');
  if (btnRetirer) btnRetirer.onclick = () => { equiperTitre(null); persist(); renderBoutique(); };
}
