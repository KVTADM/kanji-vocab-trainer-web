// Integrité du semestre 5. Lancer : node tests/s5.test.js
const fs = require('fs');
global.window = global;
new Function(fs.readFileSync(__dirname + '/../s5-data.js', 'utf8'))();
const S = window.S5_SEED;
let ko = 0;
const t = (n, ok, info) => { if (!ok) { ko++; console.log('ECHEC', n, info || ''); } else console.log('OK', n); };
t('215 kanji', S.kanjiGroups.length === 215);
t('kanji uniques', new Set(S.kanjiGroups.map(g => g.kanji)).size === 215);
t('12 semaines', new Set(S.kanjiGroups.map(g => g.week)).size === 12);
t('ids uniques', new Set(S.kanjiGroups.map(g => g.id)).size === 215 && new Set(S.vocab.map(v => v.id)).size === S.vocab.length);
const by = Object.fromEntries(S.kanjiGroups.map(g => [g.id, g]));
t('chaque mot pointe vers un groupe', S.vocab.every(v => by[v.kanjiGroupId]));
t('chaque groupe a 1 à 3 mots', S.kanjiGroups.every(g => { const n = S.vocab.filter(v => v.kanjiGroupId === g.id).length; return n >= 1 && n <= 3; }));
t('mot contient son kanji', S.vocab.every(v => v.mot.includes(by[v.kanjiGroupId].kanji)));
t('lectures en kana', S.vocab.every(v => /^[぀-ヿー・]+$/.test(v.lecture)), S.vocab.filter(v => !/^[぀-ヿー・]+$/.test(v.lecture)).map(v => v.mot).join(' '));
t('semesterId s5', S.kanjiGroups.every(g => g.semesterId === 's5'));
t('aucun doublon mot+lecture', new Set(S.vocab.map(v => v.mot + '|' + v.lecture)).size === S.vocab.length);
process.exit(ko ? 1 : 0);
