// ============================================================
// Page d'accueil : elle montre ce que la communauté fait en ce moment.
//
// Le HTML livré par la maquette contient un exemple pour chaque section. Ce
// fichier remplace ces exemples par les vraies données — ou par un état vide
// qui invite à agir, parce qu'au début il n'y aura presque rien.
//
// Tout est en lecture seule et sans compte : les tables lues ici sont
// publiques (decks visibles, avis, suggestions, vidéos publiées). Les scores
// ne le sont pas, donc les records n'apparaissent pas ici.
// ============================================================

(function () {
  const $ = (sel) => document.querySelector(sel);
  const sb = window.sb;

  const echapper = (t) => String(t == null ? '' : t)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CARTE = 'background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:20px';
  const VIDE = 'background:var(--panel);border:1px dashed var(--border);border-radius:var(--radius);padding:20px;font-size:13px;line-height:1.6;color:var(--muted)';

  function remplir(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
  function vider(id, message) {
    remplir(id, `<div style="${VIDE}">${message}</div>`);
  }

  // Initiales sur pastille, même principe que dans l'app : jamais d'image
  // cassée, et une teinte stable par personne.
  function pastille(pseudo) {
    const nom = (pseudo || '?').trim();
    const ini = nom.slice(0, 2).toUpperCase();
    return `<span style="width:32px;height:32px;border-radius:50%;background:var(--panel-alt);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:var(--accent-bright);flex:none">${echapper(ini)}</span>`;
  }

  function etoiles(n) {
    const pleines = Math.round(Number(n) || 0);
    return `<span style="font-size:13px;line-height:1.3;color:var(--warn);margin-left:8px">${'★'.repeat(pleines)}<span style="color:var(--border)">${'★'.repeat(5 - pleines)}</span></span>`;
  }

  // ---------- Les sections ----------

  async function avis() {
    const { data, error } = await sb
      .from('deck_notes')
      .select('note,avis,pseudo,updated_at,decks(titre,slug)')
      .neq('avis', '')
      .order('updated_at', { ascending: false })
      .limit(3);
    if (error || !data || !data.length) {
      vider('zoneAvis', "Personne n'a encore écrit d'avis. Le premier deck que tu noteras apparaîtra ici.");
      return;
    }
    remplir('zoneAvis', data.map(a => `
      <div style="${CARTE}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          ${pastille(a.pseudo)}
          <span style="font-size:14px;line-height:1.3;font-weight:600">${echapper(a.pseudo)}</span>
          ${etoiles(a.note)}
        </div>
        <p style="font-size:14px;line-height:1.6;margin:0 0 8px">« ${echapper(a.avis)} »</p>
        <div style="font-size:12px;line-height:1.6;color:var(--muted)">sur ${a.decks ? echapper(a.decks.titre) : 'un deck'}</div>
      </div>`).join(''));
  }

  async function decks() {
    const { data, error } = await sb
      .from('decks')
      .select('titre,slug,pseudo,officiel,nb_kanji,note_moyenne,nb_notes')
      .eq('visible', true)
      .order('created_at', { ascending: false })
      .limit(3);
    if (error || !data || !data.length) {
      vider('zoneDecks', "Aucun deck partagé pour l'instant.");
      return;
    }
    remplir('zoneDecks', data.map(d => `
      <div style="${CARTE};display:flex;align-items:center;gap:16px">
        <div style="flex:1;min-width:0">
          <div style="font-size:16px;line-height:1.3;font-weight:600">${echapper(d.titre)}</div>
          <div style="font-size:12px;line-height:1.6;color:var(--muted)">${d.nb_kanji} kanji · ${d.officiel ? 'officiel' : 'par ' + echapper(d.pseudo)}</div>
        </div>
        <div style="text-align:right;flex:none">
          ${d.nb_notes
            ? `<div style="font-size:20px;line-height:1.3;font-weight:600;color:var(--good)">${Number(d.note_moyenne).toFixed(1)}</div>
               <div style="font-size:12px;line-height:1.6;color:var(--muted)">${d.nb_notes} avis</div>`
            : `<div style="font-size:13px;line-height:1.6;color:var(--muted)">pas encore noté</div>`}
        </div>
      </div>`).join(''));
  }

  const LIB_STATUT = {
    prevu:    ['Prévu', 'var(--accent-bright)'],
    a_letude: ["À l'étude", 'var(--warn)'],
    fait:     ['Fait', 'var(--good)']
  };

  async function arrive() {
    const { data, error } = await sb
      .from('suggestions')
      .select('titre,statut')
      .in('statut', ['prevu', 'a_letude', 'fait'])
      .order('score', { ascending: false })
      .limit(3);
    if (error || !data || !data.length) {
      vider('zoneArrive', "Rien d'annoncé pour le moment. Ce qui sera décidé apparaîtra ici.");
      return;
    }
    remplir('zoneArrive', data.map(s => {
      const [lib, couleur] = LIB_STATUT[s.statut] || LIB_STATUT.a_letude;
      return `
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:16px">
        <span style="flex:none;min-width:72px;text-align:center;font-size:12px;line-height:1.6;color:${couleur};border:1px solid ${couleur};border-radius:999px;padding:0 8px">${lib}</span>
        <span style="font-size:14px;line-height:1.6">${echapper(s.titre)}</span>
      </div>`;
    }).join(''));
  }

  async function demandes() {
    const { data, error } = await sb
      .from('suggestions')
      .select('titre,score')
      .eq('statut', 'ouverte')
      .order('score', { ascending: false })
      .limit(3);
    if (error || !data || !data.length) {
      vider('zoneDemandes', "Aucune demande en attente. Si quelque chose te manque dans KVT, c'est le moment de le dire.");
      return;
    }
    remplir('zoneDemandes', data.map(s => `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
        <div style="flex:none;width:44px;text-align:center;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 0">
          <div style="font-size:12px;line-height:1;color:var(--muted)">▲</div>
          <div style="font-size:14px;line-height:1.3;font-weight:600">${s.score}</div>
        </div>
        <span style="font-size:14px;line-height:1.6">${echapper(s.titre)}</span>
      </div>`).join(''));
  }

  async function videos() {
    const { data, error } = await sb
      .from('videos')
      .select('youtube_id,titre,pseudo,score')
      .eq('statut', 'publiee')
      .order('score', { ascending: false })
      .limit(3);
    if (error || !data || !data.length) {
      vider('zoneVideos', "Aucune vidéo partagée pour l'instant.");
      return;
    }
    // La vignette vient de YouTube et rien d'autre n'est chargé : pas de
    // lecteur intégré, donc aucun cookie tiers déposé tant qu'on n'a pas
    // cliqué. C'est ce qui permet de dire que la page ne trace pas.
    remplir('zoneVideos', data.map(v => `
      <a href="https://www.youtube.com/watch?v=${echapper(v.youtube_id)}" target="_blank" rel="noopener"
         style="display:block;text-decoration:none;color:inherit">
        <img src="https://i.ytimg.com/vi/${echapper(v.youtube_id)}/mqdefault.jpg" alt="" loading="lazy"
             style="width:100%;aspect-ratio:16/9;object-fit:cover;border:1px solid var(--border);border-radius:var(--radius-sm);display:block" />
        <div style="font-size:14px;line-height:1.6;margin-top:8px">${echapper(v.titre)}</div>
        <div style="font-size:12px;line-height:1.6;color:var(--muted)">partagé par ${echapper(v.pseudo)} · ▲ ${v.score}</div>
      </a>`).join(''));
  }

  // Les trois nombres du bandeau. Cette fonction visait un #nbKanji qui
  // n'existait pas dans index.html : elle sortait a la premiere ligne, et les
  // chiffres inventes de la maquette (2 136 / 341 / 4 802) sont restes
  // affiches en production. Toute valeur montree ici doit venir d'une source
  // reelle, et un echec doit laisser un tiret — jamais un nombre plausible.
  //
  // Le contenu de l'app ne bouge qu'a l'ajout d'un module. Le lire depuis
  // seed-data.json couterait 988 ko a chaque visiteur de la page d'accueil,
  // pour deux nombres : on ne telecharge pas un megaoctet pour afficher
  // "1 318". Ces deux constantes sont donc ecrites ici, et
  // tests/accueil.test.js verifie qu'elles correspondent au vrai
  // seed-data.json. Ajoute un module sans les mettre a jour, le controle
  // echoue. Le nombre de decks, lui, vient de la base : il bouge tout seul.
  const CONTENU = { kanji: 1318, mots: 4221 };

  const nombreFr = (n) => n.toLocaleString('fr-FR').replace(/ | /g, ' ');

  async function compteurs() {
    const kanji = document.getElementById('nbKanji');
    const mots = document.getElementById('nbMots');
    const decksEl = document.getElementById('nbDecks');
    if (!kanji && !mots && !decksEl) return;

    if (kanji) kanji.textContent = nombreFr(CONTENU.kanji);
    if (mots) mots.textContent = nombreFr(CONTENU.mots);

    if (decksEl) {
      const { count } = await sb.from('decks').select('id', { count: 'exact', head: true }).eq('visible', true);
      if (count != null) decksEl.textContent = nombreFr(count);
    }
  }

  // Une section qui échoue ne doit pas emporter les autres : chacune est
  // lancée séparément et son échec reste dans son coin.
  function lancer() {
    if (!sb) return;
    [avis, decks, arrive, demandes, videos, compteurs].forEach(fn => {
      fn().catch(() => {});
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lancer);
  else lancer();
})();
