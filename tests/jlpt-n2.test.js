// Integrité du module JLPT N2 et fusion dans un compte existant.
// Lancer : node tests/jlpt-n2.test.js
const fs = require('fs');
global.window = global;
new Function(fs.readFileSync(__dirname + '/../jlpt-n2-data.js', 'utf8'))();
const S = window.JLPT_N2_SEED;
let ko = 0;
const t = (n, ok, info) => { if (!ok) { ko++; console.log('ECHEC', n, info || ''); } else console.log('OK', n); };
const kanji = S.kanjiGroups.map(g => g.kanji);
t('367 kanji', S.kanjiGroups.length === 367, S.kanjiGroups.length);
t('kanji uniques', new Set(kanji).size === 367);
t('semaines 1-15, 25 par semaine (17 pour la dernière)', (() => {
  const c = {}; S.kanjiGroups.forEach(g => c[g.week] = (c[g.week] || 0) + 1);
  return Object.keys(c).length === 15 && [...Array(14).keys()].every(i => c[i + 1] === 25) && c[15] === 17;
})());
t('ids de groupes uniques', new Set(S.kanjiGroups.map(g => g.id)).size === 367);
t('ids de mots uniques', new Set(S.vocab.map(v => v.id)).size === S.vocab.length);
const ids = new Set(S.kanjiGroups.map(g => g.id));
t('chaque mot pointe vers un groupe', S.vocab.every(v => ids.has(v.kanjiGroupId)));
t('chaque groupe a 1 à 3 mots', S.kanjiGroups.every(g => { const n = S.vocab.filter(v => v.kanjiGroupId === g.id).length; return n >= 1 && n <= 3; }));
t('champs non vides (mot, lecture, sens, titre)', S.vocab.every(v => v.mot && v.lecture && v.sens) && S.kanjiGroups.every(g => g.titre && g.semesterId === 'jlpt-n2'));
t('lectures en kana uniquement', S.vocab.every(v => /^[぀-ヿー・]+$/.test(v.lecture)), S.vocab.filter(v => !/^[぀-ヿー・]+$/.test(v.lecture)).map(v => v.mot + ':' + v.lecture).join(' '));
t('mot contient son kanji', S.vocab.every(v => v.mot.includes(S.kanjiGroups.find(g => g.id === v.kanjiGroupId).kanji)));
t('onyomi en katakana, kunyomi en hiragana', S.kanjiGroups.every(g => (!g.onyomi || /^[゠-ヿー・]+$/.test(g.onyomi)) && (!g.kunyomi || /^[぀-ゟ・]+$/.test(g.kunyomi))), S.kanjiGroups.filter(g => !((!g.onyomi || /^[゠-ヿー・]+$/.test(g.onyomi)) && (!g.kunyomi || /^[぀-ゟ・]+$/.test(g.kunyomi)))).map(g => g.kanji).join(''));
t('aucun doublon mot+lecture', new Set(S.vocab.map(v => v.mot + '|' + v.lecture)).size === S.vocab.length);
process.exit(ko ? 1 : 0);
