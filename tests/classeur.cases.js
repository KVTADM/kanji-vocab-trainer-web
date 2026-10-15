// Scenarios du Classeur, evalues dans la meme portee que classeur.js (via C).

// Generateur pseudo-aleatoire deterministe (mulberry32) pour des tirages repetables.
function graine(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const idx = id => C.CLASSEUR_RARETES.findIndex(r => r.id === id);

essai('les donnees contiennent les 5 niveaux JLPT et plus de 2000 kanji', () => {
  const t = C.classeurTousLesKanji();
  if (t.length < 2000) throw new Error('trop peu de kanji : ' + t.length);
  for (const n of ['n5', 'n4', 'n3', 'n2', 'n1']) if (!t.some(e => e.niveau === n)) throw new Error('niveau absent : ' + n);
});

essai('aucun kanji en double dans le classeur', () => {
  const t = C.classeurTousLesKanji();
  if (new Set(t.map(e => e.k)).size !== t.length) throw new Error('doublon dans la liste des kanji');
});

essai('la rarete suit la frequence : 日 est commun, un kanji hors du top 2501 est legendaire', () => {
  const t = C.classeurTousLesKanji();
  const nichi = t.find(e => e.k === '日');
  if (!nichi || nichi.rarete !== 'commun') throw new Error('日 devrait etre commun : ' + JSON.stringify(nichi));
  if (C.classeurRareteDepuisRang(null) !== 'legendaire') throw new Error('sans rang = legendaire');
  if (C.classeurRareteDepuisRang(301) !== 'peu-commun') throw new Error('301 = peu commun');
  if (C.classeurRareteDepuisRang(2501) !== 'epique') throw new Error('2501 = epique');
});

essai('chaque rarete contient au moins un kanji', () => {
  const par = C.classeurParRarete();
  for (const r of C.CLASSEUR_RARETES) if (!par[r.id].length) throw new Error('aucun kanji ' + r.id);
});

essai('les chances de chaque coffre font 100 %', () => {
  for (const c of C.CLASSEUR_COFFRES) {
    const s = C.classeurChances(c).reduce((a, b) => a + b, 0);
    if (Math.abs(s - 100) > 0.5) throw new Error(c.id + ' : ' + s);
  }
});

essai('chaque coffre donne entre 5 et 10 kanji', () => {
  for (const c of C.CLASSEUR_COFFRES) {
    if (c.nb < 5 || c.nb > 10) throw new Error(c.id + ' : ' + c.nb);
    if (C.classeurTirer(c, graine(1)).length !== c.nb) throw new Error('mauvais nombre de cartes pour ' + c.id);
  }
});

essai('la garantie du coffre est toujours respectee (3000 tirages)', () => {
  for (const c of C.CLASSEUR_COFFRES) {
    if (!c.garantie) continue;
    const rng = graine(42);
    for (let i = 0; i < 3000; i++) {
      const cartes = C.classeurTirer(c, rng);
      if (!cartes.some(x => idx(x.rarete) >= idx(c.garantie))) throw new Error(c.id + ' sans carte ' + c.garantie + ' au tirage ' + i);
    }
  }
});

essai('un coffre d\'or donne en moyenne de meilleures cartes qu\'un coffre de bronze', () => {
  const moy = (id) => {
    const c = C.CLASSEUR_COFFRES.find(x => x.id === id); const rng = graine(7); let s = 0, n = 0;
    for (let i = 0; i < 2000; i++) C.classeurTirer(c, rng).forEach(x => { s += idx(x.rarete); n++; });
    return s / n;
  };
  const b = moy('bronze'), a = moy('argent'), o = moy('or');
  if (!(b < a && a < o)) throw new Error('bronze ' + b + ' argent ' + a + ' or ' + o);
});

essai('ouvrir un coffre debite les pieces et range les kanji dans le classeur', () => {
  DB.gamification.pieces = 500;
  const res = C.classeurOuvrirCoffre('argent', graine(3));
  if (!res.ok || res.cartes.length !== 7) throw new Error('ouverture ratee');
  if (DB.gamification.pieces !== 250) throw new Error('pieces apres : ' + DB.gamification.pieces);
  const etat = C.classeurEtat();
  const total = Object.values(etat.kanji).reduce((a, b) => a + b, 0);
  if (total !== 7) throw new Error('exemplaires ranges : ' + total);
  if (etat.ouvertures !== 1) throw new Error('ouvertures : ' + etat.ouvertures);
});

essai('pas assez de pieces : rien ne change', () => {
  DB.gamification.pieces = 99;
  const res = C.classeurOuvrirCoffre('bronze', graine(3));
  if (res.ok || res.motif !== 'pas-assez-de-pieces') throw new Error('devrait refuser');
  if (DB.gamification.pieces !== 99) throw new Error('pieces modifiees');
  if (Object.keys(C.classeurEtat().kanji).length) throw new Error('kanji ranges malgre le refus');
});

essai('un doublon compte comme un exemplaire de plus et n\'est pas marque nouveau', () => {
  DB.gamification.pieces = 10000;
  const rng = () => 0; // toujours la meme carte
  const a = C.classeurOuvrirCoffre('bronze', rng);
  const b = C.classeurOuvrirCoffre('bronze', rng);
  if (!a.cartes[0].nouveau) throw new Error('premiere carte devrait etre nouvelle');
  if (a.cartes[1].nouveau) throw new Error('doublon dans le meme coffre marque nouveau');
  if (b.cartes.some(c => c.nouveau)) throw new Error('doublons marques nouveaux au 2e coffre');
  const k = a.cartes[0].k;
  if (C.classeurEtat().kanji[k] !== 10) throw new Error('exemplaires : ' + C.classeurEtat().kanji[k]);
});

essai('la progression compte les kanji differents, par niveau et par rarete', () => {
  DB.gamification.pieces = 10000;
  C.classeurOuvrirCoffre('or', graine(5));
  const p = C.classeurProgression();
  const etat = C.classeurEtat();
  if (p.total.possedes !== Object.keys(etat.kanji).length) throw new Error('total possedes faux');
  const sNiv = Object.values(p.parNiveau).reduce((a, x) => a + x.possedes, 0);
  const sRar = Object.values(p.parRarete).reduce((a, x) => a + x.possedes, 0);
  if (sNiv !== p.total.possedes || sRar !== p.total.possedes) throw new Error('sommes incoherentes');
  if (p.total.total !== C.classeurTousLesKanji().length) throw new Error('total faux');
});
