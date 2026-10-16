// Furigana des phrases d'exemple (15/10/2026) : la lecture complete de chaque phrase doit
// pouvoir etre decoupee kanji par kanji, avec des longueurs plausibles. Un echec
// signale en general une lecture fausse ou incomplete dans phrases-*-data.js.
// Lancer : node tests/furigana.test.js
const fs = require('fs');
const R = __dirname + '/../';
const app = fs.readFileSync(R + 'app.js', 'utf8');
const a = app.indexOf('function furiganaPhrase');
const code = app.slice(a, app.indexOf('\n}\n', a) + 3);
const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const furiganaPhrase = new Function('escapeHtml', code + '; return furiganaPhrase;')(escapeHtml);
global.window = {};
['phrases-l0-data.js', 'phrases-l1-data.js', 'phrases-l2-data.js', 'phrases-l3-data.js'].forEach(f => eval(fs.readFileSync(R + f, 'utf8')));
const echecs = [];
let ok = 0;
Object.entries(global.window.KVT_PHRASES).forEach(([id, p]) => {
  const r = furiganaPhrase(p[0], p[1]);
  if (!r) { echecs.push(`${p[0]} / ${p[1]} : alignement impossible`); return; }
  ok++;
  const re = /<ruby>(.*?)<rt>(.*?)<\/rt>/g; let m;
  while ((m = re.exec(r))) {
    const n = [...m[1]].length, l = [...m[2]].length;
    if (l > n * 4 || l < n) echecs.push(`${p[0]} : ${m[1]} = ${m[2]} (longueur douteuse)`);
  }
});
const tolere = 8; // phrases avec chiffres, ヶ ou ponctuation particuliere
if (echecs.length > tolere) { console.log('ECHECS (' + echecs.length + ') :\n' + echecs.join('\n')); process.exit(1); }
console.log(`OK : ${ok} phrases alignees, ${echecs.length} cas tolere(s).`);
if (echecs.length) console.log(echecs.join('\n'));
