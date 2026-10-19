// ---------- Classeur de kanji et coffres (15/10/2026) ----------
// Idee de Paul et Lucien : les pieces gagnees en revisant servent a ouvrir des
// coffres qui donnent des kanji a collectionner. Chaque kanji a une rarete
// (commun a legendaire) deduite de sa frequence d'usage reelle dans le japonais
// ecrit (plus un kanji est utilise, plus il est commun), et un niveau JLPT
// (N5 a N1) qui sert a le ranger dans le classeur. Les kanji obtenus se rangent
// automatiquement dans le classeur ; un doublon compte comme un exemplaire de plus.
// Donnees dans classeur-data.js (window.KVT_CLASSEUR_DATA). Etat du joueur :
// DB.gamification.classeur = { kanji: { '日': 2 }, ouvertures: 0, pieces: 0 }.

// Rangs de frequence : rang 1 = le kanji le plus utilise. Un kanji sans rang
// (absent des 2501 plus frequents) est legendaire.
const CLASSEUR_RARETES = [
  { id: 'commun', nom: 'Commun', rangMax: 300, couleur: '#9aa5b1' },
  { id: 'peu-commun', nom: 'Peu commun', rangMax: 800, couleur: '#4ade80' },
  { id: 'rare', nom: 'Rare', rangMax: 1500, couleur: '#3b9bff' },
  { id: 'epique', nom: 'Épique', rangMax: 2501, couleur: '#b05cff' },
  { id: 'legendaire', nom: 'Légendaire', rangMax: Infinity, couleur: '#ffb02e' }
];

// Les prix sont des reglages : a ajuster selon ce que les eleves gagnent en
// pieces (2 pieces par mot correct, voir gamification.js). "poids" = chances
// relatives de chaque rarete pour une carte, dans l'ordre de CLASSEUR_RARETES.
// "garantie" = rarete minimale d'au moins une carte du coffre.
const CLASSEUR_COFFRES = [
  { id: 'bronze', nom: 'Coffre de bronze', prix: 100, nb: 5, poids: [66, 25, 7, 1.7, 0.3], garantie: null, couleur: '#c98a4b' },
  { id: 'argent', nom: "Coffre d'argent", prix: 250, nb: 7, poids: [40, 35, 17, 6, 2], garantie: 'rare', couleur: '#c8d3e0' },
  { id: 'or', nom: "Coffre d'or", prix: 600, nb: 10, poids: [20, 32, 28, 14, 6], garantie: 'epique', couleur: '#ffcf4a' }
];

const CLASSEUR_NIVEAUX = [
  { id: 'n5', nom: 'N5' }, { id: 'n4', nom: 'N4' }, { id: 'n3', nom: 'N3' },
  { id: 'n2', nom: 'N2' }, { id: 'n1', nom: 'N1' }
];

function classeurDonnees() {
  if (typeof window !== 'undefined' && window.KVT_CLASSEUR_DATA) return window.KVT_CLASSEUR_DATA;
  if (typeof globalThis !== 'undefined' && globalThis.KVT_CLASSEUR_DATA) return globalThis.KVT_CLASSEUR_DATA;
  return { niveaux: {}, rangs: '' };
}

function classeurRareteDepuisRang(rang) {
  if (!rang) return 'legendaire';
  for (const r of CLASSEUR_RARETES) if (rang <= r.rangMax) return r.id;
  return 'legendaire';
}

function classeurIndexRarete(id) {
  return CLASSEUR_RARETES.findIndex(r => r.id === id);
}

let classeurCache = null;
// Liste de tous les kanji collectionnables : [{ k, niveau, rang, rarete }],
// rangee par niveau puis du plus courant au moins courant.
function classeurTousLesKanji() {
  if (classeurCache) return classeurCache;
  const data = classeurDonnees();
  const rang = {};
  Array.from(data.rangs || '').forEach((k, i) => { rang[k] = i + 1; });
  const liste = [];
  CLASSEUR_NIVEAUX.forEach(n => {
    Array.from((data.niveaux && data.niveaux[n.id]) || '').forEach(k => {
      liste.push({ k, niveau: n.id, rang: rang[k] || null, rarete: classeurRareteDepuisRang(rang[k]) });
    });
  });
  classeurCache = liste;
  return liste;
}

function classeurParRarete() {
  const par = {};
  CLASSEUR_RARETES.forEach(r => { par[r.id] = []; });
  classeurTousLesKanji().forEach(e => par[e.rarete].push(e));
  return par;
}

function classeurEtat() {
  const g = assurerGamification();
  if (!g.classeur || typeof g.classeur !== 'object') g.classeur = { kanji: {}, ouvertures: 0, pieces: 0 };
  if (!g.classeur.kanji) g.classeur.kanji = {};
  return g.classeur;
}

// Tirage pondere : poids = tableau de chances relatives, rng() dans [0,1[.
function classeurTirerIndexPondere(poids, rng) {
  const total = poids.reduce((a, b) => a + b, 0);
  let x = rng() * total;
  for (let i = 0; i < poids.length; i++) {
    x -= poids[i];
    if (x < 0) return i;
  }
  return poids.length - 1;
}

function classeurTirerKanjiDeRarete(idRarete, rng, parRarete) {
  const liste = parRarete[idRarete];
  return liste[Math.min(liste.length - 1, Math.floor(rng() * liste.length))];
}

// Tire les cartes d'un coffre (sans toucher a l'etat du joueur). Si la
// garantie du coffre n'est pas remplie, la derniere carte est retiree parmi
// les raretes qui la remplissent.
function classeurTirer(coffre, rng) {
  const tirageRng = rng || Math.random;
  const par = classeurParRarete();
  const cartes = [];
  for (let i = 0; i < coffre.nb; i++) {
    const idx = classeurTirerIndexPondere(coffre.poids, tirageRng);
    cartes.push(classeurTirerKanjiDeRarete(CLASSEUR_RARETES[idx].id, tirageRng, par));
  }
  if (coffre.garantie) {
    const mini = classeurIndexRarete(coffre.garantie);
    if (!cartes.some(c => classeurIndexRarete(c.rarete) >= mini)) {
      const poids = coffre.poids.map((p, i) => (i >= mini ? p : 0));
      const idx = classeurTirerIndexPondere(poids, tirageRng);
      cartes[cartes.length - 1] = classeurTirerKanjiDeRarete(CLASSEUR_RARETES[idx].id, tirageRng, par);
    }
  }
  return cartes;
}

// Ouvre un coffre : debite les pieces, tire les cartes, les range dans le
// classeur. Retourne { ok, cartes: [{ k, niveau, rarete, rang, nouveau }] }.
function classeurOuvrirCoffre(idCoffre, rng) {
  const coffre = CLASSEUR_COFFRES.find(c => c.id === idCoffre);
  if (!coffre) return { ok: false, motif: 'introuvable' };
  const g = assurerGamification();
  if (g.pieces < coffre.prix) return { ok: false, motif: 'pas-assez-de-pieces' };
  if (!classeurTousLesKanji().length) return { ok: false, motif: 'donnees-absentes' };
  const etat = classeurEtat();
  const cartes = classeurTirer(coffre, rng).map(c => Object.assign({}, c));
  const vus = new Set();
  g.pieces -= coffre.prix;
  cartes.forEach(c => {
    c.nouveau = !etat.kanji[c.k] && !vus.has(c.k);
    vus.add(c.k);
    etat.kanji[c.k] = (etat.kanji[c.k] || 0) + 1;
  });
  etat.ouvertures = (etat.ouvertures || 0) + 1;
  etat.pieces = (etat.pieces || 0) + coffre.prix;
  return { ok: true, coffre, cartes };
}

// Progression : combien de kanji differents possedes sur combien, par niveau
// JLPT, par rarete, et au total.
function classeurProgression() {
  const etat = classeurEtat();
  const total = { possedes: 0, total: 0 };
  const parNiveau = {};
  const parRarete = {};
  CLASSEUR_NIVEAUX.forEach(n => { parNiveau[n.id] = { possedes: 0, total: 0 }; });
  CLASSEUR_RARETES.forEach(r => { parRarete[r.id] = { possedes: 0, total: 0 }; });
  classeurTousLesKanji().forEach(e => {
    const a = etat.kanji[e.k] ? 1 : 0;
    total.total++; total.possedes += a;
    parNiveau[e.niveau].total++; parNiveau[e.niveau].possedes += a;
    parRarete[e.rarete].total++; parRarete[e.rarete].possedes += a;
  });
  return { total, parNiveau, parRarete };
}

// Chances (en %) par rarete pour une carte de ce coffre, pour l'affichage.
function classeurChances(coffre) {
  const somme = coffre.poids.reduce((a, b) => a + b, 0);
  return coffre.poids.map(p => Math.round((p / somme) * 1000) / 10);
}

// ---------- Page « Classeur » ----------

let classeurNiveauAffiche = 'n5';
let classeurFiltreRarete = 'toutes';
let classeurNouveaux = new Set();
let classeurSelection = null;

function classeurRarete(id) {
  return CLASSEUR_RARETES.find(r => r.id === id) || CLASSEUR_RARETES[0];
}

// Coffre de laque vu en perspective (3/4) : face avant, flanc droit, dessus du
// couvercle, ferrures et motif doré. `couleur` = métal des ferrures.
// Le couvercle est un groupe à part (.coffre-couvercle) pour l'animation d'ouverture.
let classeurCoffreCompteur = 0;
function classeurSvgCoffre(couleur) {
  const u = 'cf' + (classeurCoffreCompteur++);
  const m = couleur;
  const vigne = `M24 96 q10 -16 22 -6 t22 -4 t22 -8 M30 84 q8 -10 16 -2 M70 100 q8 -12 18 -4 M88 82 q4 -8 12 -6`;
  return `<svg class="coffre-svg" viewBox="0 0 160 134" aria-hidden="true">
    <defs>
      <linearGradient id="${u}-av" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d2433"/><stop offset="1" stop-color="#14101a"/></linearGradient>
      <linearGradient id="${u}-fl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0f0b15"/><stop offset="1" stop-color="#070509"/></linearGradient>
      <linearGradient id="${u}-to" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3b3044"/><stop offset="1" stop-color="#241c2c"/></linearGradient>
      <linearGradient id="${u}-me" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
      <radialGradient id="${u}-lu" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6c8"/><stop offset=".5" stop-color="${m}" stop-opacity=".85"/><stop offset="1" stop-color="${m}" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="86" cy="122" rx="66" ry="8" fill="#000" opacity=".35"/>
    <polygon class="coffre-lueur" points="14,70 112,70 148,54 50,54" fill="url(#${u}-lu)"/>
    <polygon points="14,70 112,70 112,116 14,116" fill="url(#${u}-av)"/>
    <polygon points="112,70 148,54 148,100 112,116" fill="url(#${u}-fl)"/>
    <path d="${vigne}" transform="translate(-4 -2)" fill="none" stroke="${m}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
    <circle cx="36" cy="93" r="7" fill="none" stroke="${m}" stroke-width="1.4" opacity=".7"/>
    <circle cx="36" cy="93" r="2.6" fill="${m}" opacity=".7"/>
    <circle cx="90" cy="95" r="7" fill="none" stroke="${m}" stroke-width="1.4" opacity=".7"/>
    <circle cx="90" cy="95" r="2.6" fill="${m}" opacity=".7"/>
    <rect x="14" y="110" width="98" height="6" fill="${m}"/><rect x="14" y="110" width="98" height="6" fill="url(#${u}-me)"/>
    <polygon points="112,110 148,94 148,100 112,116" fill="${m}"/><polygon points="112,110 148,94 148,100 112,116" fill="url(#${u}-me)"/>
    <polygon points="14,70 30,70 14,88" fill="${m}"/><polygon points="112,70 96,70 112,88" fill="${m}"/>
    <polygon points="14,116 14,100 28,116" fill="${m}"/><polygon points="112,116 112,100 98,116" fill="${m}"/>
    <rect x="111" y="70" width="2.4" height="46" fill="${m}"/>
    <ellipse cx="130" cy="82" rx="6" ry="7" fill="none" stroke="${m}" stroke-width="2.4" transform="rotate(-24 130 82)"/>
    <g class="coffre-couvercle">
      <polygon points="112,46 148,30 148,54 112,70" fill="url(#${u}-fl)"/>
      <polygon points="14,46 112,46 112,70 14,70" fill="url(#${u}-av)"/>
      <polygon points="14,46 50,30 148,30 112,46" fill="url(#${u}-to)"/>
      <path d="M44 38 q12 -4 22 0 t24 -1 M92 36 q10 4 18 -2" fill="none" stroke="${m}" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>
      <ellipse cx="70" cy="38" rx="9" ry="3.6" fill="none" stroke="${m}" stroke-width="1.2" opacity=".7"/>
      <rect x="14" y="46" width="98" height="4" fill="${m}"/><rect x="14" y="46" width="98" height="4" fill="url(#${u}-me)"/>
      <polygon points="112,46 148,30 148,34 112,50" fill="${m}"/><polygon points="112,46 148,30 148,34 112,50" fill="url(#${u}-me)"/>
      <polygon points="14,46 50,30 56,30 20,46" fill="${m}"/>
      <polygon points="14,46 30,46 14,64" fill="${m}"/><polygon points="112,46 96,46 112,64" fill="${m}"/>
      <rect x="111" y="46" width="2.4" height="24" fill="${m}"/>
      <rect x="14" y="68" width="98" height="3" fill="${m}"/>
      <path d="M53 66 h22 l-3 20 h-16 z" fill="${m}"/><path d="M53 66 h22 l-3 20 h-16 z" fill="url(#${u}-me)"/>
      <circle cx="64" cy="76" r="3.4" fill="#1a1422"/><rect x="63" y="76" width="2" height="6" rx="1" fill="#1a1422"/>
      <path d="M52 60 q12 -14 24 0" fill="none" stroke="${m}" stroke-width="3" stroke-linecap="round"/>
    </g>
  </svg>`;
}

// Infos du cours sur un kanji, si le joueur l'a dans son vocabulaire.
function classeurInfoKanji(k) {
  const groupes = (typeof DB !== 'undefined' && DB && Array.isArray(DB.kanjiGroups)) ? DB.kanjiGroups : [];
  const g = groupes.find(x => x.kanji === k && (x.onyomi || x.kunyomi || x.titre));
  return g || null;
}

function classeurHtmlCoffre(c, g) {
  const chances = classeurChances(c);
  const manque = Math.max(0, c.prix - g.pieces);
  return `
    <div class="card coffre-carte-boutique" style="--coffre:${c.couleur}">
      <div class="coffre-boutique__visuel">${classeurSvgCoffre(c.couleur)}</div>
      <div class="coffre-boutique__nom">${escapeHtml(c.nom)}</div>
      <div class="coffre-boutique__prix">${iconePiece(16)} ${c.prix}</div>
      <div class="coffre-boutique__nb">${c.nb} kanji${c.garantie ? ` · 1 ${escapeHtml(classeurRarete(c.garantie).nom.toLowerCase())}+ garanti` : ''}</div>
      <details class="coffre-chances-det"><summary>Chances</summary>
        <ul class="coffre-chances">
          ${CLASSEUR_RARETES.map((r, i) => `<li><span class="coffre-puce" style="background:${r.couleur}"></span>${escapeHtml(r.nom)}<b>${chances[i]} %</b></li>`).join('')}
        </ul>
      </details>
      <button class="primary coffre-ouvrir" data-ouvrir-coffre="${c.id}" ${manque > 0 ? 'disabled' : ''}>${manque > 0 ? `Il manque ${manque} pièce${manque > 1 ? 's' : ''}` : 'Ouvrir'}</button>
    </div>`;
}

// Section « Coffres » de la Boutique : les trois coffres alignes cote a cote.
function classeurHtmlSectionCoffres(g) {
  return kvtSectionRepliable('boutique-coffres', 'Coffres de kanji', `
    <p class="boutique-section__aide">Chaque coffre contient des kanji à ranger dans ton Classeur. Plus un kanji est utilisé au quotidien, plus il est commun ; les kanji rares sont plus difficiles à trouver. Un doublon compte comme un exemplaire de plus.</p>
    <div class="coffre-rangee">${CLASSEUR_COFFRES.map(c => classeurHtmlCoffre(c, g)).join('')}</div>`);
}

function classeurBrancherCoffres(container) {
  $$('[data-ouvrir-coffre]', container).forEach(b => {
    b.onclick = () => classeurLancerOuverture(b.dataset.ouvrirCoffre);
  });
}

// Sens du kanji en francais (classeur-sens.js), 1 a 3 mots.
function classeurSens(k) {
  const t = typeof window !== 'undefined' && window.KVT_CLASSEUR_SENS;
  return (t && t[k]) || '';
}

function classeurHtmlCase(e, etat) {
  const n = etat.kanji[e.k] || 0;
  const r = classeurRarete(e.rarete);
  const nouveau = classeurNouveaux.has(e.k);
  if (!n) return `<div class="classeur-case classeur-case--vide" style="--r:${r.couleur}" title="Pas encore découvert"><span>?</span></div>`;
  return `<button class="classeur-case classeur-case--possede ${classeurSelection === e.k ? 'classeur-case--selection' : ''}" style="--r:${r.couleur}" data-classeur-kanji="${escapeHtml(e.k)}" aria-label="${escapeHtml(e.k)} — ${escapeHtml(r.nom)}${classeurSens(e.k) ? ' · ' + escapeHtml(classeurSens(e.k)) : ''}"><span class="classeur-case__kanji">${escapeHtml(e.k)}</span>${classeurSens(e.k) ? `<span class="classeur-case__sens">${escapeHtml(classeurSens(e.k))}</span>` : ''}${n > 1 ? `<span class="classeur-case__n">×${n}</span>` : ''}${nouveau ? '<span class="classeur-case__nouveau">Nouveau</span>' : ''}</button>`;
}

function classeurHtmlDetail(etat) {
  if (!classeurSelection) return '';
  const e = classeurTousLesKanji().find(x => x.k === classeurSelection);
  if (!e) return '';
  const r = classeurRarete(e.rarete);
  const info = classeurInfoKanji(e.k);
  const rang = e.rang ? `Rang d'usage n° ${e.rang} sur 2501` : 'Hors des 2501 kanji les plus utilisés';
  return `<div class="card classeur-detail" style="--r:${r.couleur}">
    <div class="classeur-detail__kanji">${escapeHtml(e.k)}</div>
    <div class="classeur-detail__texte">
      <div><span class="classeur-badge" style="background:${r.couleur}">${escapeHtml(r.nom)}</span> <span class="classeur-detail__niveau">JLPT ${escapeHtml(e.niveau.toUpperCase())}</span> · ${etat.kanji[e.k]} exemplaire${etat.kanji[e.k] > 1 ? 's' : ''}</div>
      ${classeurSens(e.k) ? `<div class="classeur-detail__sens">${escapeHtml(classeurSens(e.k))}</div>` : ''}
      <div class="classeur-detail__rang">${rang}</div>
      ${info ? `<div class="classeur-detail__lectures">${info.onyomi ? `<span>ON ${escapeHtml(info.onyomi)}</span>` : ''}${info.kunyomi ? `<span>KUN ${escapeHtml(info.kunyomi)}</span>` : ''}</div>${info.titre ? `<div>${escapeHtml(info.titre)}</div>` : ''}` : '<div class="classeur-detail__rang">Ce kanji n\'est pas encore dans ton cours : tu l\'as découvert grâce à un coffre.</div>'}
    </div></div>`;
}

function renderClasseur() {
  const container = $('#view-classeur');
  if (!container) return;
  const g = assurerGamification();
  const etat = classeurEtat();
  const prog = classeurProgression();
  const pct = prog.total.total ? Math.round((prog.total.possedes / prog.total.total) * 1000) / 10 : 0;
  const niveau = CLASSEUR_NIVEAUX.some(n => n.id === classeurNiveauAffiche) ? classeurNiveauAffiche : 'n5';
  const liste = classeurTousLesKanji().filter(e => e.niveau === niveau && (classeurFiltreRarete === 'toutes' || e.rarete === classeurFiltreRarete));
  container.innerHTML = `
    <h2>Classeur</h2>
    <div class="card gamif-solde">
      <span class="gamif-piece">${iconePiece(18)} ${g.pieces} pièce${g.pieces > 1 ? 's' : ''} d'or</span>
      <span style="color:var(--muted); font-size:13px;">Gagne des pièces en révisant, ouvre des coffres, et complète ta collection de kanji.</span>
    </div>
    <div class="card classeur-lien-boutique">
      <span>Les coffres s'achètent dans la Boutique.</span>
      <button class="primary" data-aller-boutique>Aller aux coffres</button>
    </div>
    ${kvtSectionRepliable('classeur-collection', 'Ma collection', `
    <div class="card classeur-bilan">
      <div class="classeur-bilan__haut"><b>${prog.total.possedes} / ${prog.total.total}</b> kanji découverts (${pct} %) · ${etat.ouvertures || 0} coffre${(etat.ouvertures || 0) > 1 ? 's' : ''} ouvert${(etat.ouvertures || 0) > 1 ? 's' : ''}</div>
      <div class="classeur-barre"><div class="classeur-barre__plein" style="width:${pct}%"></div></div>
      <div class="classeur-legende">${CLASSEUR_RARETES.map(r => `<span><i class="coffre-puce" style="background:${r.couleur}"></i>${escapeHtml(r.nom)} ${prog.parRarete[r.id].possedes}/${prog.parRarete[r.id].total}</span>`).join('')}</div>
    </div>
    <div class="classeur-onglets" role="tablist">
      ${CLASSEUR_NIVEAUX.map(n => `<button role="tab" class="classeur-onglet ${n.id === niveau ? 'actif' : ''}" data-classeur-niveau="${n.id}">${n.nom}<small>${prog.parNiveau[n.id].possedes}/${prog.parNiveau[n.id].total}</small></button>`).join('')}
      <select id="classeurFiltre" aria-label="Filtrer par rareté">
        <option value="toutes">Toutes les raretés</option>
        ${CLASSEUR_RARETES.map(r => `<option value="${r.id}" ${classeurFiltreRarete === r.id ? 'selected' : ''}>${escapeHtml(r.nom)}</option>`).join('')}
      </select>
    </div>
    ${classeurHtmlDetail(etat)}
    <div class="classeur-grille">${liste.map(e => classeurHtmlCase(e, etat)).join('') || '<p style="color:var(--muted)">Aucun kanji de cette rareté dans ce niveau.</p>'}</div>
`)}
    ${typeof classeurHtmlEchanges === 'function' ? classeurHtmlEchanges() : ''}`;
  classeurBrancher(container);
  kvtBrancherSectionsRepliables(container, renderClasseur);
  if (typeof classeurEchangesBrancher === 'function') classeurEchangesBrancher(container);
  if (typeof classeurEchangesInit === 'function') classeurEchangesInit();
}

function classeurBrancher(container) {
  classeurBrancherCoffres(container);
  const lien = $('[data-aller-boutique]', container);
  if (lien) lien.onclick = () => { if (typeof switchView === 'function') switchView('boutique'); };
  $$('[data-classeur-niveau]', container).forEach(b => {
    b.onclick = () => { classeurNiveauAffiche = b.dataset.classeurNiveau; classeurNouveaux = new Set(); classeurSelection = null; renderClasseur(); };
  });
  const f = $('#classeurFiltre', container);
  if (f) f.onchange = () => { classeurFiltreRarete = f.value; renderClasseur(); };
  $$('[data-classeur-kanji]', container).forEach(b => {
    b.onclick = () => { classeurSelection = classeurSelection === b.dataset.classeurKanji ? null : b.dataset.classeurKanji; renderClasseur(); };
  });
}

// ---------- Ouverture animee d'un coffre ----------

function classeurLancerOuverture(idCoffre) {
  const res = classeurOuvrirCoffre(idCoffre);
  if (!res.ok) {
    showToast(res.motif === 'pas-assez-de-pieces' ? "Pas assez de pièces pour ce coffre." : "Impossible d'ouvrir ce coffre pour l'instant.");
    return;
  }
  persist();
  if (typeof renderTopbarProfil === 'function') renderTopbarProfil();
  const overlay = document.createElement('div');
  overlay.className = 'coffre-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `<div class="coffre-scene" style="--coffre:${res.coffre.couleur}">
    <div class="coffre-boite coffre-boite--secoue">${classeurSvgCoffre(res.coffre.couleur)}</div>
    <p class="coffre-scene__texte">Ouverture du ${escapeHtml(res.coffre.nom.toLowerCase())}…</p></div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('coffre-ouvert');
  const reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const boite = overlay.querySelector('.coffre-boite');
  if (!reduit) setTimeout(() => boite && boite.classList.add('coffre-boite--ouvre'), 750);
  setTimeout(() => classeurMontrerCartes(overlay, res), reduit ? 0 : 1500);
}

// Fiche d'un kanji : [on, kun, mot, lecture du mot, sens] (classeur-infos.js).
function classeurFiche(k) {
  const tous = (typeof window !== 'undefined' && window.KVT_CLASSEUR_INFOS) || (typeof globalThis !== 'undefined' && globalThis.KVT_CLASSEUR_INFOS) || {};
  const f = tous[k];
  if (!f) return null;
  return { on: f[0], kun: f[1], mot: f[2], lecture: f[3], sens: f[4] };
}

function classeurHtmlFicheCarte(c, i, total) {
  const r = classeurRarete(c.rarete);
  const f = classeurFiche(c.k);
  return `<div class="coffre-solo coffre-solo--${c.rarete}" style="--r:${r.couleur}">
    <div class="coffre-solo__compteur">Carte ${i + 1} sur ${total}</div>
    <div class="coffre-solo__carte">
      ${c.nouveau ? '<span class="coffre-flip__nouveau">Nouveau</span>' : '<span class="coffre-solo__doublon">Doublon</span>'}
      <div class="coffre-solo__kanji">${escapeHtml(c.k)}</div>
      ${classeurSens(c.k) ? `<div class="coffre-solo__sens">${escapeHtml(classeurSens(c.k))}</div>` : ''}
      <div class="coffre-solo__pastilles"><span class="classeur-badge" style="background:${r.couleur}">${escapeHtml(r.nom)}</span><span class="coffre-solo__niveau">JLPT ${escapeHtml(c.niveau.toUpperCase())}</span></div>
      ${f ? `<dl class="coffre-solo__lectures">
        ${f.on ? `<div><dt>On'yomi</dt><dd>${escapeHtml(f.on)}</dd></div>` : ''}
        ${f.kun ? `<div><dt>Kun'yomi</dt><dd>${escapeHtml(f.kun)}</dd></div>` : ''}
      </dl>
      ${f.mot ? `<div class="coffre-solo__mot"><span class="coffre-solo__mot-jp">${escapeHtml(f.mot)}</span><span class="coffre-solo__mot-lecture">${escapeHtml(f.lecture)}</span><span class="coffre-solo__mot-sens">${escapeHtml(f.sens)}</span></div>` : ''}` : ''}
    </div></div>`;
}

function classeurMontrerCartes(overlay, res) {
  const total = res.cartes.length;
  let i = 0;
  const entete = `<h3>${escapeHtml(res.coffre.nom)}</h3>`;
  const montrerFiche = () => {
    const dernier = i === total - 1;
    overlay.innerHTML = `<div class="coffre-scene coffre-scene--solo" style="--coffre:${res.coffre.couleur}">
      ${entete}
      ${classeurHtmlFicheCarte(res.cartes[i], i, total)}
      <div class="coffre-actions">
        ${dernier ? '' : '<button class="secondary" data-passer>Résumé</button>'}
        <button class="primary" data-suivant>${dernier ? 'Voir le bilan' : 'Carte suivante'}</button>
      </div></div>`;
    overlay.querySelector('[data-suivant]').onclick = () => { i++; if (i < total) montrerFiche(); else montrerBilan(); };
    const p = overlay.querySelector('[data-passer]');
    if (p) p.onclick = montrerBilan;
    const b = overlay.querySelector('[data-suivant]');
    if (b && b.focus) b.focus({ preventScroll: true });
  };
  const montrerBilan = () => {
    const nouveaux = res.cartes.filter(c => c.nouveau).length;
    const meilleure = res.cartes.reduce((a, b) => (classeurIndexRarete(b.rarete) > classeurIndexRarete(a.rarete) ? b : a));
    overlay.innerHTML = `<div class="coffre-scene coffre-scene--cartes" style="--coffre:${res.coffre.couleur}">
      ${entete}
      <div class="coffre-cartes">
        ${res.cartes.map(c => {
          const r = classeurRarete(c.rarete);
          return `<div class="coffre-flip retournee coffre-flip--fixe" style="--r:${r.couleur}">
            <span class="coffre-flip__face coffre-flip__face--${c.rarete}">
              <span class="coffre-flip__kanji">${escapeHtml(c.k)}</span>
              <span class="coffre-flip__rarete">${escapeHtml(r.nom)}</span>
              <span class="coffre-flip__niveau">${escapeHtml(c.niveau.toUpperCase())}</span>
              ${c.nouveau ? '<span class="coffre-flip__nouveau">Nouveau</span>' : ''}
            </span></div>`;
        }).join('')}
      </div>
      <p class="coffre-bilan">${nouveaux} nouveau${nouveaux > 1 ? 'x' : ''} kanji, ${total - nouveaux} doublon${total - nouveaux > 1 ? 's' : ''}. Meilleure carte : ${escapeHtml(meilleure.k)} (${escapeHtml(classeurRarete(meilleure.rarete).nom)}).</p>
      ${nouveaux ? `<p class="coffre-bilan coffre-bilan--liste">Nouveaux : ${res.cartes.filter(c => c.nouveau).map(c => escapeHtml(c.k)).join(' ')}</p>` : ''}
      <div class="coffre-actions"><button class="primary" data-fin>Ranger dans le classeur</button></div></div>`;
    overlay.querySelector('[data-fin]').onclick = () => {
      classeurNouveaux = new Set(res.cartes.filter(c => c.nouveau).map(c => c.k));
      const premier = res.cartes.find(c => c.nouveau) || res.cartes[0];
      classeurNiveauAffiche = premier.niveau;
      classeurFiltreRarete = 'toutes';
      classeurSelection = null;
      overlay.remove();
      document.body.classList.remove('coffre-ouvert');
      if (typeof currentView !== 'undefined' && currentView !== 'classeur' && typeof switchView === 'function') switchView('classeur');
      else renderClasseur();
      if (typeof renderTopbarProfil === 'function') renderTopbarProfil();
    };
  };
  montrerFiche();
}

// ---------- Fiche flottante au survol d'un kanji du Classeur (souris uniquement) ----------
// Suit le curseur, reste dans la fenetre. Sur ecran tactile rien ne s'affiche :
// le clic ouvre toujours le detail sous la grille.
function classeurHtmlSurvol(k) {
  const e = classeurTousLesKanji().find(x => x.k === k);
  if (!e) return '';
  const r = classeurRarete(e.rarete);
  const f = classeurFiche(k);
  const sens = classeurSens(k);
  const n = (classeurEtat().kanji || {})[k] || 0;
  const rang = e.rang ? `n° ${e.rang} sur 2501` : 'hors des 2501 plus utilisés';
  const lec = f ? [f.on ? `<dt>ON</dt><dd>${escapeHtml(f.on)}</dd>` : '', f.kun ? `<dt>KUN</dt><dd>${escapeHtml(f.kun)}</dd>` : ''].join('') : '';
  return `<div class="kj-fiche__tete"><div class="kj-fiche__kanji">${escapeHtml(k)}</div>
    <div class="kj-fiche__titre">${sens ? `<div class="kj-fiche__sens">${escapeHtml(sens)}</div>` : ''}
      <div class="kj-fiche__tags"><span class="classeur-badge" style="background:${r.couleur}">${escapeHtml(r.nom)}</span><span>JLPT ${escapeHtml(String(e.niveau).toUpperCase())}</span>${n > 1 ? `<span>×${n}</span>` : ''}</div></div></div>
    ${lec ? `<dl class="kj-fiche__lec">${lec}</dl>` : ''}
    ${f && f.mot ? `<div class="kj-fiche__ex"><b>${escapeHtml(f.mot)}</b> <span>${escapeHtml(f.lecture || '')}</span>${f.sens ? ` — ${escapeHtml(f.sens)}` : ''}</div>` : ''}
    <div class="kj-fiche__rang">Usage : ${rang}</div>`;
}

let classeurFicheEl = null;
let classeurFicheKanji = null;
function classeurPlacerFiche(ev) {
  if (!classeurFicheEl) return;
  const w = classeurFicheEl.offsetWidth, h = classeurFicheEl.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  let x = ev.clientX + 18, y = ev.clientY + 18;
  if (x + w > vw - 8) x = ev.clientX - w - 18;
  if (y + h > vh - 8) y = vh - h - 8;
  if (x < 8) x = 8;
  if (y < 64) y = 64;
  classeurFicheEl.style.left = Math.round(x) + 'px';
  classeurFicheEl.style.top = Math.round(y) + 'px';
}
function classeurCacherFiche() {
  if (classeurFicheEl) classeurFicheEl.classList.remove('on');
  classeurFicheKanji = null;
}
if (typeof document !== 'undefined') {
  const caseDe = (t) => (t && t.closest ? t.closest('.classeur-case--possede[data-classeur-kanji]') : null);
  const souris = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  document.addEventListener('mouseover', (ev) => {
    const b = caseDe(ev.target);
    if (!b || !souris()) return;
    if (!classeurFicheEl) {
      classeurFicheEl = document.createElement('div');
      classeurFicheEl.className = 'kj-fiche';
      classeurFicheEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(classeurFicheEl);
    }
    const k = b.dataset.classeurKanji;
    if (k !== classeurFicheKanji) {
      classeurFicheKanji = k;
      classeurFicheEl.innerHTML = classeurHtmlSurvol(k);
      classeurFicheEl.style.setProperty('--r', b.style.getPropertyValue('--r') || 'var(--accent-bright)');
      classeurFicheEl.classList.remove('on');
      void classeurFicheEl.offsetWidth;
    }
    classeurPlacerFiche(ev);
    classeurFicheEl.classList.add('on');
  });
  document.addEventListener('mousemove', (ev) => {
    if (classeurFicheEl && classeurFicheEl.classList.contains('on') && caseDe(ev.target)) classeurPlacerFiche(ev);
  });
  document.addEventListener('mouseout', (ev) => {
    if (caseDe(ev.target) && !caseDe(ev.relatedTarget)) classeurCacherFiche();
  });
  document.addEventListener('click', classeurCacherFiche, true);
  window.addEventListener('scroll', classeurCacherFiche, { passive: true });
}
