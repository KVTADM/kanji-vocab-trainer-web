// Mode « non classé » (17/10/2026) : contrôles sur le code source de app.js.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../app.js', 'utf8');
let ok = 0, ko = 0;
function essai(nom, cond) { if (cond) { ok++; console.log('OK  ' + nom); } else { ko++; console.log('KO  ' + nom); } }
for (const f of ['recordSessionResult', 'recordKanjiSessionResult', 'recordTraductionSessionResult', 'recordDoubleSessionResult']) {
  const i = src.indexOf('function ' + f + '(');
  essai(f + ' sort tôt si non classé', i > 0 && src.slice(i, i + 400).includes('sessionNonClassee()'));
}
essai('flag persisté dans saveInProgress', /nonClasse: !!quizSession\.nonClasse/.test(src));
essai('flag restauré à la reprise', /nonClasse: !!saved\.nonClasse/.test(src));
essai('case à cocher dans la modale', src.includes('id="chkModalNonClasse"'));
essai('plus de bulles ? dans la modale', !/modalMode" value[^`]*aide-bulle/.test(src));
essai('6 badges adaptés', (src.match(/sessionNonClassee\(\) \? htmlBadgeNonClasse\(\)/g) || []).length === 6);
console.log(ok + ' ok, ' + ko + ' ko');
process.exit(ko ? 1 : 0);
