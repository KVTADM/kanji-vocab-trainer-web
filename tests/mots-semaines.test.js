// Controles de forme des mots du cursus (15/10/2026, demande de Paul) :
//  1. les mots simplifies (S2 semaines 8 et 9) restent des mots ou groupes de
//     mots, jamais une phrase entiere a retaper ;
//  2. chaque mot simplifie contient un kanji de SA fiche et de SA semaine
//     (pas de mot tire d'une phrase sans rapport avec les kanji etudies) ;
//  3. la phrase d'exemple d'un mot simplifie contient bien ce mot (ou sa racine
//     quand le verbe est conjugue) ;
//  4. rapport : combien de mots du cursus S1-S4 n'ont aucun kanji de leur fiche.
// Lancer : node tests/mots-semaines.test.js
const fs = require('fs');
const R = __dirname + '/../';
const seed = JSON.parse(fs.readFileSync(R + 'seed-data.json', 'utf8'));
const webapi = fs.readFileSync(R + 'webapi.js', 'utf8');
const mig = JSON.parse(webapi.match(/const SIMPLIF_15_10 = (\{.*\});/)[1]);
global.window = {};
['phrases-l0-data.js', 'phrases-l1-data.js', 'phrases-l2-data.js', 'phrases-l3-data.js'].forEach(f => eval(fs.readFileSync(R + f, 'utf8')));
const phrases = global.window.KVT_PHRASES;

const groupes = {}; seed.kanjiGroups.forEach(g => { groupes[g.id] = g; });
const echecs = [];
const KANJI = /[一-鿿]/g;

Object.entries(mig).forEach(([id, f]) => {
  const v = seed.vocab.find(x => x.id === id);
  if (!v) return echecs.push(`${id} : absent du seed`);
  if (v.mot !== f.neu.mot) return echecs.push(`${id} : seed ${v.mot} different de la migration ${f.neu.mot}`);
  const g = groupes[v.kanjiGroupId];
  const semaine = seed.kanjiGroups.filter(x => x.semesterId === g.semesterId && x.week === g.week).map(x => x.kanji);
  if (![...g.kanji.replace(/[\/\s]/g, '')].some(k => v.mot.includes(k))) echecs.push(`${v.mot} : ne contient pas le kanji de sa fiche (${g.kanji})`);
  if (![...semaine.join('').replace(/[\/\s]/g, '')].some(k => v.mot.includes(k))) echecs.push(`${v.mot} : aucun kanji de la semaine (${semaine.join('')})`);
  const p = phrases[id];
  if (!p) return echecs.push(`${v.mot} : pas de phrase d'exemple`);
  const racine = v.mot.replace(/〜/g, '').replace(/[ぁ-ゖ]+$/, '');
  if (!p[0].includes(racine)) echecs.push(`${v.mot} : absent de sa phrase "${p[0]}"`);
});

// Plus de mot-phrase dans les semaines concernees.
seed.vocab.forEach(v => {
  const g = groupes[v.kanjiGroupId];
  if (!g || g.semesterId !== 's2' || ![8, 9].includes(g.week)) return;
  if (v.mot.length >= 9) echecs.push(`${v.mot} : trop long pour un mot (S2 semaine ${g.week})`);
  if (v.mot.length >= 7 && /[がは][^\s]{2,}/.test(v.mot) && !/^[ぁ-ゖ]+$/.test(v.mot)) echecs.push(`${v.mot} : phrase avec sujet (S2 semaine ${g.week})`);
});

// Rapport (non bloquant).
let sans = 0, total = 0;
seed.vocab.forEach(v => {
  const g = groupes[v.kanjiGroupId];
  if (!g || !['s1', 's2', 's3', 's4'].includes(g.semesterId)) return;
  total++;
  if (!v.mot.includes(g.kanji)) sans++;
});
console.log(`Rapport : ${sans} / ${total} mots S1-S4 ne contiennent pas le kanji de leur fiche (informatif).`);
if (echecs.length) { console.log('ECHECS :\n' + echecs.join('\n')); process.exit(1); }
console.log(`OK : ${Object.keys(mig).length} mots simplifies verifies.`);

// Compteurs a preciser (retour du 16/10/2026) : 十分 (じゅっぷん, dix minutes) ne doit pas etre confondu avec じゅうぶん.
{
  const seed = JSON.parse(require('fs').readFileSync(__dirname + '/../seed-data.json', 'utf8'));
  const api = require('fs').readFileSync(__dirname + '/../webapi.js', 'utf8');
  ['v-l0s1-w8-07-02', 'v-l0s1-w8-07-01', 'v-l0s1-w8-06-01'].forEach(id => {
    const v = seed.vocab.find(x => x.id === id);
    if (!v || v.indice !== 'compteur') { console.log('ECHEC : indice compteur manquant pour ' + id); process.exitCode = 1; }
    if (!api.includes("'" + id + "': 'compteur'")) { console.log('ECHEC : migration compteur manquante pour ' + id); process.exitCode = 1; }
  });
}

// Paires courant / soutenu (16/10/2026) : 明日 (あした / あす) reste en deux entrees avec badge ; 昨日 est refusionne en une seule entree (24/10/2026). Avant : 昨日 et 明日 (あした / あす) sont des entrees separees avec badge.
{
  const fs = require('fs');
  const seed = JSON.parse(fs.readFileSync(__dirname + '/../seed-data.json', 'utf8'));
  const api = fs.readFileSync(__dirname + '/../webapi.js', 'utf8');
  const par = id => seed.vocab.find(x => x.id === id);
  const attendu = [
    ['v-reg-asu-l0s2w2', 'あす', 'soutenu'], ['v-l0s2-w2-02-04', 'あした', 'courant']
  ];
  attendu.forEach(([id, lecture, registre]) => {
    const v = par(id);
    if (!v || v.lecture !== lecture || v.registre !== registre) { console.log('ECHEC : paire registre ' + id); process.exitCode = 1; }
    if (!api.includes(id)) { console.log('ECHEC : migration absente pour ' + id); process.exitCode = 1; }
  });
  const hier = seed.vocab.filter(x => x.mot === '昨日' && x.kanjiGroupId === 'kg-mrhvk4uwxjay1');
  if (hier.length !== 1 || hier[0].lecture !== 'きのう / さくじつ' || hier[0].registre) { console.log('ECHEC : 昨日 doit etre une seule entree きのう / さくじつ'); process.exitCode = 1; }
  ['v-l0s1-w8-11-04', 'v-n3nxnzqnknnhu', 'v-9godwz35vay6q'].forEach(id => {
    if (!api.includes("'" + id + "':")) { console.log('ECHEC : indice 毎年 absent pour ' + id); process.exitCode = 1; }
  });
}

// 気持ちを表す : la locution entière (きもちをあらわす) est acceptée en plus du verbe seul.
{
  const d = JSON.parse(require('fs').readFileSync(__dirname + '/../seed-data.json', 'utf8'));
  const v = d.vocab.find(x => x.id === 'v-mrhvk4uwvz1k0');
  if (!v || !/きもちをあらわす/.test(v.lecture) || !/^あらわす/.test(v.lecture)) { console.error('FAIL 気持ちを表す : lecture ' + (v && v.lecture)); process.exit(1); }
  console.log('  OK      気持ちを表す accepte きもちをあらわす et あらわす');
}
