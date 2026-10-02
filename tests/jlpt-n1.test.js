// Integrité des 4 modules JLPT N1. Lancer : node tests/jlpt-n1.test.js
const fs = require('fs');
global.window = global;
let ko = 0;
const t = (n, ok, info) => { if (!ok) { ko++; console.log('ECHEC', n, info || ''); } else console.log('OK', n); };
const all = { kanjiGroups: [], vocab: [] };
for (const c of 'abcd') {
  new Function(fs.readFileSync(__dirname + '/../jlpt-n1' + c + '-data.js', 'utf8'))();
  const S = window['JLPT_N1' + c.toUpperCase() + '_SEED'];
  t('module ' + c + ' : 308 kanji', S.kanjiGroups.length === 308);
  const w = {}; S.kanjiGroups.forEach(g => w[g.week] = (w[g.week] || 0) + 1);
  t('module ' + c + ' : 13 semaines (12x25 + 8)', Object.keys(w).length === 13 && [...Array(12).keys()].every(i => w[i + 1] === 25) && w[13] === 8);
  t('module ' + c + ' : semesterId', S.kanjiGroups.every(g => g.semesterId === 'jlpt-n1' + c));
  all.kanjiGroups.push(...S.kanjiGroups); all.vocab.push(...S.vocab);
}
const n2src = fs.readFileSync(__dirname + '/../jlpt-n2-data.js', 'utf8');
new Function(n2src)();
const n2 = window.JLPT_N2_SEED;
t('1232 kanji', all.kanjiGroups.length === 1232);
t('kanji uniques (et absents du N2)', new Set([...all.kanjiGroups, ...n2.kanjiGroups].map(g => g.kanji)).size === 1232 + 367);
t('ids de groupes uniques', new Set(all.kanjiGroups.map(g => g.id)).size === 1232);
t('ids de mots uniques', new Set(all.vocab.map(v => v.id)).size === all.vocab.length);
const ids = new Set(all.kanjiGroups.map(g => g.id));
t('chaque mot pointe vers un groupe', all.vocab.every(v => ids.has(v.kanjiGroupId)));
t('chaque groupe a 1 à 3 mots', all.kanjiGroups.every(g => { const n = all.vocab.filter(v => v.kanjiGroupId === g.id).length; return n >= 1 && n <= 3; }));
t('champs non vides', all.vocab.every(v => v.mot && v.lecture && v.sens) && all.kanjiGroups.every(g => g.titre));
t('lectures en kana', all.vocab.every(v => /^[぀-ヿー・]+$/.test(v.lecture)), all.vocab.filter(v => !/^[぀-ヿー・]+$/.test(v.lecture)).map(v => v.mot + ':' + v.lecture).join(' '));
const byId = Object.fromEntries(all.kanjiGroups.map(g => [g.id, g]));
t('mot contient son kanji', all.vocab.every(v => v.mot.includes(byId[v.kanjiGroupId].kanji)));
t('onyomi katakana, kunyomi hiragana', all.kanjiGroups.every(g => (!g.onyomi || /^[゠-ヿー・]+$/.test(g.onyomi)) && (!g.kunyomi || /^[぀-ゟ・]+$/.test(g.kunyomi))), all.kanjiGroups.filter(g => !((!g.onyomi || /^[゠-ヿー・]+$/.test(g.onyomi)) && (!g.kunyomi || /^[぀-ゟ・]+$/.test(g.kunyomi)))).map(g => g.kanji).join(''));
t('aucun doublon mot+lecture (N1 + N2)', new Set([...all.vocab, ...n2.vocab].map(v => v.mot + '|' + v.lecture)).size === all.vocab.length + n2.vocab.length);
process.exit(ko ? 1 : 0);
