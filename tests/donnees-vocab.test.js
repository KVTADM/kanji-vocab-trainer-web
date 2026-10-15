// Controles de qualite sur TOUT le vocabulaire (seed, JLPT N5 a N1, semestre 5)
// (15/10/2026). Cherche les memes familles d'erreurs que celles signalees par
// Lucien dans la boite a problemes : lecture avec des kanji ou des lettres,
// abreviations grammaticales dans le sens ("(Tr)", "(Intr)", "(adj)"),
// parentheses non fermees, champ vide, mot en kana dont la lecture differe.
// Les cas deja reperes mais pas encore corriges sont dans A_CORRIGER : le test
// les laisse passer, mais echoue si on en ajoute de nouveaux.
// Lancer : node tests/donnees-vocab.test.js
const fs = require('fs');
const vm = require('vm');
const R = __dirname + '/../';

const sources = [];
sources.push(['seed-data.json', JSON.parse(fs.readFileSync(R + 'seed-data.json', 'utf8'))]);
const webapi = fs.readFileSync(R + 'webapi.js', 'utf8');
['N5', 'N4', 'N3'].forEach(n => {
  const m = webapi.match(new RegExp('const JLPT_' + n + '_SEED = (\\{.*\\});\\s*\\n'));
  if (m) sources.push(['JLPT ' + n, JSON.parse(m[1])]);
});
['jlpt-n2-data.js', 'jlpt-n1a-data.js', 'jlpt-n1b-data.js', 'jlpt-n1c-data.js', 'jlpt-n1d-data.js', 's5-data.js'].forEach(f => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(R + f, 'utf8'), ctx);
  Object.values(ctx.window).forEach(v => { if (v && v.kanjiGroups && v.vocab) sources.push([f, v]); });
});

// Reperes mais pas encore corriges (id -> raison).
const A_CORRIGER = {};

const KANA = /^[ぁ-ゖァ-ヺー〜~・/／、, 　！？…（）()\s!?.]*$/;
const probleme = {};
const vus = new Set();
let total = 0;
sources.forEach(([nom, s]) => {
  const groupes = {};
  s.kanjiGroups.forEach(g => { groupes[g.id] = g; });
  s.vocab.forEach(v => {
    if (vus.has(v.id)) return;
    vus.add(v.id); total++;
    const ajouter = (type, msg) => { (probleme[type] = probleme[type] || []).push({ id: v.id, msg: `${nom} : ${v.mot} / ${v.lecture} / ${v.sens} -> ${msg}` }); };
    const lec = v.lecture || '';
    const sens = v.sens || '';
    if (!v.mot || !String(v.mot).trim()) ajouter('mot vide', 'mot vide');
    if (!lec.trim()) ajouter('lecture vide', 'lecture vide');
    // En NFKC, les chiffres pleine chasse (２３) deviennent 23 : la notation les accepte.
    const nette = lec.normalize('NFKC').replace(/[0-9]/g, '');
    if (!KANA.test(nette)) ajouter('lecture non kana', 'caractere hors kana dans la lecture');
    if (/[（(][^）)]*[）)]/.test(lec)) ajouter('lecture avec parenthese', 'precision entre parentheses dans la lecture (comptee comme du texte a taper)');
    if (!sens.trim()) ajouter('sens vide', 'sens vide');
    if (/\((tr|intr|adj|adv|vt|vi)\.?\)/i.test(sens)) ajouter('abreviation', 'abreviation grammaticale dans le sens');
    if ((sens.match(/[(（]/g) || []).length !== (sens.match(/[)）]/g) || []).length) ajouter('parentheses', 'parentheses non fermees dans le sens');
    if (sens !== sens.trim() || /\s{2,}/.test(sens)) ajouter('espaces', 'espaces en trop dans le sens');
    const mot = String(v.mot || '').replace(/[〜~\s　！？…]/g, '');
    if (/^[ぁ-ゖァ-ヺー]+$/.test(mot) && lec.trim()) {
      const hira = x => x.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
      const alts = lec.split(/[/／,、]/).map(a => hira(a.replace(/[〜~\s　！？…]/g, ''))).filter(Boolean);
      if (!alts.includes(hira(mot))) ajouter('mot en kana', 'mot ecrit en kana mais lecture differente');
    }
  });
});

let echecs = 0;
const nouveaux = [];
Object.keys(probleme).forEach(type => {
  const hors = probleme[type].filter(p => !A_CORRIGER[p.id]);
  if (hors.length) { echecs++; nouveaux.push(`${type} (${hors.length})`); hors.slice(0, 8).forEach(p => console.log('    ' + p.msg)); }
});
const connus = Object.values(probleme).flat().filter(p => A_CORRIGER[p.id]).length;
console.log(`  ${total} mots controles dans ${sources.length} sources, ${connus} cas deja connus a corriger`);
if (echecs) {
  console.log('  ECHEC  nouveaux problemes : ' + nouveaux.join(', '));
  process.exit(1);
}
console.log('  OK  aucun nouveau probleme de lecture, de sens ou de champ vide');
