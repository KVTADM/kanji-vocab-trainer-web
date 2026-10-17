// Controles de la revente, du marche et des echanges de cartes (classeur-echanges.js,
// partie logique pure, 17/10/2026).
// A lancer depuis la racine du depot : node tests/classeur-echanges.test.js

const fs = require('fs');
global.window = {};
eval(fs.readFileSync(__dirname + '/../classeur-data.js', 'utf8'));
global.KVT_CLASSEUR_DATA = window.KVT_CLASSEUR_DATA;

let DB;
global.assurerGamification = () => { if (!DB.gamification) DB.gamification = { pieces: 0, xp: 0 }; return DB.gamification; };
global.showToast = () => {};
global.persist = () => {};
global.escapeHtml = s => String(s);
global.iconePiece = () => '';

const srcC = fs.readFileSync(__dirname + '/../classeur.js', 'utf8');
const srcE = fs.readFileSync(__dirname + '/../classeur-echanges.js', 'utf8');
const logiqueC = srcC.slice(0, srcC.indexOf('// ---------- Page « Classeur » ----------'));
const logiqueE = srcE.slice(0, srcE.indexOf('// ---------- Accès Supabase ----------'));
eval(logiqueC + '\n' + logiqueE + `
globalThis.C = { CLASSEUR_RARETES, CLASSEUR_COFFRES, CLASSEUR_PRIX_REVENTE, classeurTousLesKanji, classeurTirer, classeurEtat,
  classeurDoublonsDe, classeurListeDoublons, classeurRetirerCarte, classeurAjouterCartes, classeurVendreBoutique,
  classeurVendreTousDoublons, classeurAppliquerTransferts, classeurPrixNetVendeur, classeurPrixReventeDe };`);

const cas = [];
const essai = (nom, fn) => cas.push({ nom, fn });
const ok = (c, m) => { if (!c) throw new Error(m); };
const kanjis = () => C.classeurTousLesKanji();
const premierDe = (rarete) => kanjis().find(e => e.rarete === rarete).k;

essai('on ne vend que les doublons : un exemplaire unique reste toujours', () => {
  const k = premierDe('commun');
  C.classeurEtat().kanji[k] = 1;
  ok(!C.classeurVendreBoutique(k, 1).ok, 'unique refusé');
  C.classeurEtat().kanji[k] = 3;
  ok(C.classeurDoublonsDe(k) === 2, '2 doublons');
  ok(!C.classeurVendreBoutique(k, 3).ok, 'trop de cartes refusé');
  const r = C.classeurVendreBoutique(k, 2);
  ok(r.ok && r.gain === 2 * C.CLASSEUR_PRIX_REVENTE.commun, 'gain commun x2');
  ok(C.classeurEtat().kanji[k] === 1 && DB.gamification.pieces === r.gain, 'reste 1 carte, pièces créditées');
});

essai('prix de revente croissants selon la rareté', () => {
  const p = C.CLASSEUR_RARETES.map(r => C.CLASSEUR_PRIX_REVENTE[r.id]);
  ok(p.every((x, i) => i === 0 || x > p[i - 1]), 'prix croissants : ' + p.join(','));
});

essai('revendre le contenu d\'un coffre ne rapporte jamais plus que son prix (pas d\'arbitrage)', () => {
  let seed = 12345;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  C.CLASSEUR_COFFRES.forEach(c => {
    let total = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) C.classeurTirer(c, rng).forEach(carte => { total += C.CLASSEUR_PRIX_REVENTE[carte.rarete]; });
    const moyenne = total / N;
    ok(moyenne < c.prix * 0.9, `${c.id} : valeur de revente moyenne ${moyenne.toFixed(0)} vs prix ${c.prix}`);
  });
});

essai('vendre tous les doublons', () => {
  const a = premierDe('commun'), b = premierDe('rare');
  C.classeurEtat().kanji[a] = 4; C.classeurEtat().kanji[b] = 2;
  const r = C.classeurVendreTousDoublons();
  ok(r.cartes === 4 && r.gain === 3 * C.CLASSEUR_PRIX_REVENTE.commun + C.CLASSEUR_PRIX_REVENTE.rare, 'gain total');
  ok(C.classeurEtat().kanji[a] === 1 && C.classeurEtat().kanji[b] === 1, 'un exemplaire de chaque reste');
  ok(C.classeurListeDoublons().length === 0, 'plus de doublons');
});

essai('transferts reçus : cartes ajoutées/retirées, pièces sans solde négatif', () => {
  const k = premierDe('epique'), k2 = premierDe('commun');
  DB.gamification.pieces = 50;
  C.classeurEtat().kanji[k2] = 2;
  const r = C.classeurAppliquerTransferts([{ kanji: k, quantite: 1, pieces: -30 }, { kanji: k2, quantite: -1, pieces: 0 }, { kanji: null, quantite: 0, pieces: 90 }]);
  ok(C.classeurEtat().kanji[k] === 1 && C.classeurEtat().kanji[k2] === 1, 'cartes appliquées');
  ok(DB.gamification.pieces === 110, 'pièces : ' + DB.gamification.pieces);
  C.classeurAppliquerTransferts([{ pieces: -1000 }]);
  ok(DB.gamification.pieces === 0, 'jamais négatif');
  C.classeurAppliquerTransferts([{ kanji: k, quantite: -5 }]);
  ok(!C.classeurEtat().kanji[k], 'carte supprimée à zéro');
});

essai('commission de 10 % sur le marché', () => {
  ok(C.classeurPrixNetVendeur(100) === 90 && C.classeurPrixNetVendeur(5) === 4 && C.classeurPrixNetVendeur(1) === 0, 'net vendeur');
});

(async () => {
  const res = [];
  for (const { nom, fn } of cas) {
    try { DB = { gamification: { pieces: 0, xp: 0 } }; await fn(); res.push(['OK', nom]); }
    catch (e) { res.push(['ECHEC', nom + ' -> ' + e.message]); }
  }
  res.forEach(([s, n]) => console.log(`  ${s}  ${n}`));
  const n = res.filter(r => r[0] === 'OK').length;
  console.log(`\n  ${n}/${res.length} passent`);
  process.exit(n === res.length ? 0 : 1);
})();
