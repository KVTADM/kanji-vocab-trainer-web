// ============================================================
// Création : fabriquer un deck à partir de la banque de kanji déjà présente.
//
// L'idée de départ, dans les mots de Paul : « je veux un deck personnalisé
// avec les kanji que je ne retiens pas ; j'ai accès à une banque de kanji et
// leurs mots, je les choisis et je les répartis comme je veux ».
//
// Trois façons de choisir, parce qu'on ne cherche pas de la même manière
// selon ce qu'on veut :
//   — par recherche, quand on sait quel caractère on vise ;
//   — par catégorie (un semestre, un niveau JLPT), quand on veut une base ;
//   — par difficulté, quand on ne sait justement PAS lesquels on rate.
//
// Le troisième mode est celui qui manquait vraiment. Les scores sont déjà en
// base locale : l'app sait quelles semaines ont été ratées, il suffisait de
// le dire. Choisir « les kanji que je ne retiens pas » à la main suppose
// qu'on s'en souvienne — or c'est exactement ce qu'on ne fait pas.
//
// Rien ne part sur le réseau ici : la banque est locale (`DB`), et le deck
// créé est un semestre local de plus. La publication reste une étape à part,
// volontairement — créer et publier sont deux décisions différentes.
// ============================================================

let creaSource = 'categorie';   // 'categorie' | 'recherche' | 'difficulte'
let creaCategorie = '';         // semesterId de la catégorie source
let creaRecherche = '';
let creaChoisis = new Set();    // ids de kanjiGroups retenus
let creaNom = '';
let creaParSemaine = 10;        // 0 = un seul bloc
let creaMessage = null;

const CREA_MAX_PAR_SEMAINE = 40;

// ------------------------------------------------------------
// La banque : tous les kanji connus de l'app, avec le nombre de mots qui
// leur sont rattachés. Un kanji sans mot ne sert à rien dans un quiz de
// vocabulaire — il est exclu plutôt que d'être proposé puis décevant.
// ------------------------------------------------------------
function creaBanque() {
  const parGroupe = new Map();
  (DB.vocab || []).forEach(v => {
    parGroupe.set(v.kanjiGroupId, (parGroupe.get(v.kanjiGroupId) || 0) + 1);
  });
  const libelles = new Map((DB.settings.semesters || []).map(s => [s.id, s.label]));
  return (DB.kanjiGroups || [])
    .map(g => ({
      id: g.id,
      kanji: g.kanji || '',
      titre: g.titre || '',
      semesterId: g.semesterId,
      semestre: libelles.get(g.semesterId) || '',
      week: Number(g.week) || 1,
      nbMots: parGroupe.get(g.id) || 0
    }))
    .filter(g => g.nbMots > 0);
}

// Les kanji des semaines les moins bien réussies. On ne connaît pas le score
// kanji par kanji — les scores sont enregistrés par semaine — donc on remonte
// de la semaine au kanji. C'est plus grossier qu'un vrai suivi par carte,
// mais c'est vrai : ça repose sur des résultats réels, pas sur une estimation.
function creaDifficiles(banque) {
  const scores = DB.scores || {};
  const pctParSemaine = new Map();
  Object.keys(scores).forEach(cle => {
    const m = cle.match(/^(.+)-w(\d+)$/);
    if (!m) return;
    const e = scores[cle];
    if (e && e.best && typeof e.best.pct === 'number') {
      pctParSemaine.set(m[1] + '|' + m[2], e.best.pct);
    }
  });
  return banque
    .map(g => {
      const pct = pctParSemaine.get(g.semesterId + '|' + g.week);
      return Object.assign({}, g, { pct: (typeof pct === 'number' ? pct : null) });
    })
    .filter(g => g.pct !== null && g.pct < 80)
    .sort((a, b) => a.pct - b.pct);
}

function creaListeAffichee() {
  const banque = creaBanque();
  if (creaSource === 'difficulte') return creaDifficiles(banque);
  if (creaSource === 'recherche') {
    const q = creaRecherche.trim().toLowerCase();
    if (!q) return [];
    return banque.filter(g =>
      g.kanji.includes(creaRecherche.trim()) ||
      g.titre.toLowerCase().includes(q) ||
      g.semestre.toLowerCase().includes(q)
    ).slice(0, 200);
  }
  if (!creaCategorie) return [];
  return banque.filter(g => g.semesterId === creaCategorie);
}

// ------------------------------------------------------------
// Création effective : un semestre local de plus, comme un deck importé.
// ------------------------------------------------------------
function creerDeckLocal() {
  creaMessage = null;
  const nom = (creaNom || '').trim();
  if (nom.length < 3) {
    creaMessage = { type: 'erreur', texte: 'Donne un nom à ton deck (au moins 3 caractères).' };
    return false;
  }
  if (!creaChoisis.size) {
    creaMessage = { type: 'erreur', texte: 'Choisis au moins un kanji.' };
    return false;
  }
  if ((DB.settings.semesters || []).some(s => (s.label || '').trim().toLowerCase() === nom.toLowerCase())) {
    creaMessage = { type: 'erreur', texte: 'Tu as déjà un deck qui porte ce nom.' };
    return false;
  }

  const semId = uid('crea');
  const choisis = (DB.kanjiGroups || []).filter(g => creaChoisis.has(g.id));
  const parSemaine = Math.max(0, Math.min(CREA_MAX_PAR_SEMAINE, Number(creaParSemaine) || 0));
  const semaines = parSemaine ? Math.max(1, Math.ceil(choisis.length / parSemaine)) : 1;

  const correspondance = new Map();
  const groupes = choisis.map((g, i) => {
    const nouvel = uid('kg');
    correspondance.set(g.id, nouvel);
    return {
      id: nouvel,
      semesterId: semId,
      // La répartition suit l'ordre d'affichage : par difficulté croissante
      // si c'est ce qu'on a demandé, sinon l'ordre du semestre d'origine.
      week: parSemaine ? Math.floor(i / parSemaine) + 1 : 1,
      kanji: g.kanji || '',
      titre: g.titre || '',
      onyomi: g.onyomi || '',
      kunyomi: g.kunyomi || '',
      bushu: g.bushu || '',
      phrase: g.phrase || '',
      traduction: g.traduction || '',
      memo: g.memo || ''
    };
  });

  // Les mots sont COPIÉS, pas référencés : réviser le deck créé ne doit pas
  // modifier le semestre d'origine, et supprimer l'un ne doit pas vider
  // l'autre.
  const mots = (DB.vocab || [])
    .filter(v => correspondance.has(v.kanjiGroupId))
    .map(v => ({
      id: uid('v'),
      kanjiGroupId: correspondance.get(v.kanjiGroupId),
      mot: v.mot || '',
      lecture: v.lecture || '',
      sens: v.sens || ''
    }));

  DB.settings.semesters.push({ id: semId, label: nom, weeks: semaines, cree: true });
  DB.kanjiGroups.push(...groupes);
  DB.vocab.push(...mots);

  creaMessage = {
    type: 'succes',
    texte: `« ${nom} » créé : ${groupes.length} kanji, ${mots.length} mots, ${semaines} semaine${semaines > 1 ? 's' : ''}.`
  };
  creaChoisis = new Set();
  creaNom = '';
  return true;
}

// ------------------------------------------------------------
// Affichage
// ------------------------------------------------------------
function renderCreation() {
  const el = $('#view-creation');
  if (!el) return;

  const banque = creaBanque();
  const categories = (DB.settings.semesters || [])
    .map(s => ({ id: s.id, label: s.label, n: banque.filter(g => g.semesterId === s.id).length }))
    .filter(c => c.n > 0);
  if (!creaCategorie && categories.length) creaCategorie = categories[0].id;

  const liste = creaListeAffichee();
  const difficiles = creaDifficiles(banque);
  const choisisListe = banque.filter(g => creaChoisis.has(g.id));
  const nbMotsChoisis = choisisListe.reduce((s, g) => s + g.nbMots, 0);
  const parSemaine = Math.max(0, Math.min(CREA_MAX_PAR_SEMAINE, Number(creaParSemaine) || 0));
  const semaines = parSemaine ? Math.max(1, Math.ceil(choisisListe.length / parSemaine)) : 1;

  const aide = {
    categorie: 'Prends une base existante, puis retire ce que tu connais déjà.',
    recherche: 'Tape un kanji, un sens ou un semestre. La banque contient tout ce que tu as déjà.',
    difficulte: difficiles.length
      ? 'Les kanji des semaines où ton meilleur score est sous 80 %, du plus raté au moins raté.'
      : "Aucune semaine sous 80 % pour l'instant — fais quelques quiz et reviens : c'est là que ce mode devient utile."
  }[creaSource];

  el.innerHTML = `
    <div class="decks-head">
      <div>
        <h2>Créer un deck</h2>
        <p class="decks-sous-titre">Choisis des kanji dans ta banque, répartis-les comme tu veux, et révise-les ensemble.</p>
      </div>
    </div>

    ${creaMessage ? `<div class="card crea-message crea-message--${creaMessage.type}">${escapeHtml(creaMessage.texte)}</div>` : ''}

    ${!banque.length ? `<div class="card"><p>Ta banque est vide : importe un deck ou ajoute du vocabulaire avant de créer.</p></div>` : `
    <div class="crea-colonnes">
      <div class="crea-principal">
        <section class="card crea-bloc">
          <h3 class="pub-etape__titre"><span class="pub-etape__num">1</span> Où chercher</h3>
          <div class="pub-choix">
            <button class="pub-option ${creaSource === 'categorie' ? 'is-active' : ''}" data-crea-source="categorie">Une catégorie</button>
            <button class="pub-option ${creaSource === 'recherche' ? 'is-active' : ''}" data-crea-source="recherche">Rechercher</button>
            <button class="pub-option ${creaSource === 'difficulte' ? 'is-active' : ''}" data-crea-source="difficulte">Ce que je rate</button>
          </div>
          <p class="pub-aide">${aide}</p>

          ${creaSource === 'categorie' ? `
            <label class="pub-label" for="creaCategorie">Catégorie</label>
            <select id="creaCategorie" class="pub-champ">
              ${categories.map(c => `<option value="${escapeHtml(c.id)}" ${c.id === creaCategorie ? 'selected' : ''}>${escapeHtml(c.label)} — ${c.n} kanji</option>`).join('')}
            </select>` : ''}

          ${creaSource === 'recherche' ? `
            <label class="pub-label" for="creaRecherche">Rechercher un kanji</label>
            <input type="search" id="creaRecherche" class="pub-champ" placeholder="日, soleil, Semestre 2…" value="${escapeHtml(creaRecherche)}" />` : ''}
        </section>

        <section class="card crea-bloc">
          <div class="crea-liste-tete">
            <h3 class="pub-etape__titre"><span class="pub-etape__num">2</span> Quels kanji</h3>
            ${liste.length ? `<div class="crea-liste-actions">
              <button class="small" id="creaToutPrendre">Tout ajouter (${liste.length})</button>
              <button class="small" id="creaToutEnlever">Tout enlever</button>
            </div>` : ''}
          </div>

          ${liste.length ? `
            <div class="crea-banque">
              ${liste.map(g => `
                <button type="button" class="crea-kanji ${creaChoisis.has(g.id) ? 'is-choisi' : ''}"
                        data-crea-kanji="${escapeHtml(g.id)}"
                        aria-pressed="${creaChoisis.has(g.id)}">
                  <span class="crea-kanji__glyphe">${escapeHtml(g.kanji)}</span>
                  <span class="crea-kanji__titre">${escapeHtml(g.titre || '—')}</span>
                  <span class="crea-kanji__meta">${g.nbMots} mot${g.nbMots > 1 ? 's' : ''}${typeof g.pct === 'number' ? ` · ${g.pct} %` : ''}</span>
                </button>`).join('')}
            </div>`
          : `<p class="comm-etat-vide">${creaSource === 'recherche' && !creaRecherche.trim()
              ? 'Tape quelque chose pour voir des résultats.'
              : 'Rien à afficher ici.'}</p>`}
        </section>
      </div>

      <aside class="crea-cote">
        <div class="card crea-recap">
          <h3 class="pub-etape__titre"><span class="pub-etape__num">3</span> Ton deck</h3>

          <label class="pub-label" for="creaNom">Nom</label>
          <input type="text" id="creaNom" class="pub-champ" maxlength="80"
                 placeholder="Mes kanji difficiles" value="${escapeHtml(creaNom)}" />

          <label class="pub-label" for="creaParSemaine">Répartition</label>
          <select id="creaParSemaine" class="pub-champ">
            <option value="0" ${parSemaine === 0 ? 'selected' : ''}>Tout d'un bloc</option>
            ${[5, 10, 15, 20, 25, 30].map(n => `<option value="${n}" ${parSemaine === n ? 'selected' : ''}>${n} kanji par semaine</option>`).join('')}
          </select>

          <div class="pub-recap">
            <span class="pub-recap__ligne"><strong>${choisisListe.length}</strong> kanji</span>
            <span class="pub-recap__ligne"><strong>${nbMotsChoisis}</strong> mots</span>
            <span class="pub-recap__ligne"><strong>${semaines}</strong> semaine${semaines > 1 ? 's' : ''}</span>
          </div>

          <div class="pub-actions">
            <button class="primary" id="creaCreer" ${choisisListe.length ? '' : 'disabled'}>Créer le deck</button>
          </div>
          <p class="pub-aide">Le deck reste chez toi. Tu pourras le publier ensuite depuis « Decks partagés », si tu veux.</p>
        </div>

        ${choisisListe.length ? `
        <div class="card crea-choisis">
          <h3 class="deck-section-titre">Retenus</h3>
          <div class="crea-choisis-liste">
            ${choisisListe.slice(0, 60).map(g => `
              <button type="button" class="crea-puce" data-crea-kanji="${escapeHtml(g.id)}" title="Retirer ${escapeHtml(g.kanji)}">
                ${escapeHtml(g.kanji)} <span aria-hidden="true">×</span>
              </button>`).join('')}
          </div>
          ${choisisListe.length > 60 ? `<p class="pub-aide">et ${choisisListe.length - 60} autres.</p>` : ''}
        </div>` : ''}
      </aside>
    </div>`}`;

  // ---- Branchements ----
  $$('[data-crea-source]', el).forEach(b => {
    b.onclick = () => { lireChamps(); creaSource = b.dataset.creaSource; creaMessage = null; renderCreation(); };
  });
  const selCat = $('#creaCategorie');
  if (selCat) selCat.onchange = () => { lireChamps(); creaCategorie = selCat.value; renderCreation(); };

  const champRech = $('#creaRecherche');
  if (champRech) {
    champRech.oninput = () => {
      creaRecherche = champRech.value;
      // Redessiner à chaque frappe ferait perdre le curseur : on ne
      // rafraîchit que la liste, et le champ garde le focus.
      majListeSeulement();
    };
  }

  $$('[data-crea-kanji]', el).forEach(b => {
    b.onclick = () => { lireChamps(); basculerKanji(b.dataset.creaKanji); };
  });

  const tout = $('#creaToutPrendre');
  if (tout) tout.onclick = () => { lireChamps(); liste.forEach(g => creaChoisis.add(g.id)); renderCreation(); };
  const rien = $('#creaToutEnlever');
  if (rien) rien.onclick = () => { lireChamps(); creaChoisis = new Set(); renderCreation(); };

  const selRep = $('#creaParSemaine');
  if (selRep) selRep.onchange = () => { lireChamps(); creaParSemaine = Number(selRep.value); renderCreation(); };

  const creer = $('#creaCreer');
  if (creer) {
    creer.onclick = async () => {
      lireChamps();
      const ok = creerDeckLocal();
      if (ok && typeof persist === 'function') await persist();
      renderCreation();
      if (ok && typeof showToast === 'function') showToast(creaMessage.texte);
    };
  }

  function lireChamps() {
    const n = $('#creaNom'); if (n) creaNom = n.value;
    const r = $('#creaRecherche'); if (r) creaRecherche = r.value;
    const s = $('#creaParSemaine'); if (s) creaParSemaine = Number(s.value);
  }

  // Cocher/décocher un kanji redessine toute la vue (le récap, les puces
  // « Retenus » et le bouton Créer en dépendent tous) — mais un nouvel
  // élément .crea-banque part toujours avec un scroll à zéro. Sans ça,
  // choisir un kanji tout en bas de la banque faisait remonter la liste
  // en haut à chaque clic.
  function basculerKanji(id) {
    const zone = el.querySelector('.crea-banque');
    const y = zone ? zone.scrollTop : 0;
    if (creaChoisis.has(id)) creaChoisis.delete(id); else creaChoisis.add(id);
    renderCreation();
    const nouvelleZone = el.querySelector('.crea-banque');
    if (nouvelleZone) nouvelleZone.scrollTop = y;
  }

  function majListeSeulement() {
    // Recalcul de la seule zone qui dépend de la recherche. Redessiner toute
    // la vue à chaque touche ferait sauter le curseur hors du champ.
    const zone = el.querySelector('.crea-banque');
    const nouvelle = creaListeAffichee();
    if (!zone) { renderCreation(); return; }
    zone.innerHTML = nouvelle.map(g => `
      <button type="button" class="crea-kanji ${creaChoisis.has(g.id) ? 'is-choisi' : ''}"
              data-crea-kanji="${escapeHtml(g.id)}" aria-pressed="${creaChoisis.has(g.id)}">
        <span class="crea-kanji__glyphe">${escapeHtml(g.kanji)}</span>
        <span class="crea-kanji__titre">${escapeHtml(g.titre || '—')}</span>
        <span class="crea-kanji__meta">${g.nbMots} mot${g.nbMots > 1 ? 's' : ''}</span>
      </button>`).join('');
    $$('[data-crea-kanji]', zone).forEach(b => {
      b.onclick = () => basculerKanji(b.dataset.creaKanji);
    });
  }
}

window.kvtCreation = {
  renderCreation, creaBanque, creaDifficiles, creerDeckLocal,
  etat() { return { creaSource, creaChoisis, creaNom, creaParSemaine, creaMessage }; },
  reinitialiser() {
    creaSource = 'categorie'; creaCategorie = ''; creaRecherche = '';
    creaChoisis = new Set(); creaNom = ''; creaParSemaine = 10; creaMessage = null;
  }
};
