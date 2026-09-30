// Meilleur temps à 100 %. Lancer : node tests/meilleur-temps.test.js
const fs = require('fs');
const m = fs.readFileSync(__dirname + '/../app.js', 'utf8').match(/function meilleurTempsParfait[\s\S]*?\n\}\n/);
const f = new Function(m[0] + '; return meilleurTempsParfait;')();
let ko = 0;
const t = (n, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ko++; console.log('ECHEC', n, JSON.stringify(a)); } else console.log('OK', n); };
t('rien', f({}), null);
t('null', f(null), null);
t('ignore < 100 %', f({ a: { history: [{ pct: 90, dureeMs: 1000 }] } }), null);
t('ignore sans durée', f({ a: { history: [{ pct: 100 }] } }), null);
t('plus rapide parfait', f({ a: { history: [{ pct: 100, dureeMs: 9000 }, { pct: 100, dureeMs: 5000 }] }, b: { history: [{ pct: 100, dureeMs: 7000 }, { pct: 50, dureeMs: 100 }] } }), { dureeMs: 5000, cle: 'a' });
process.exit(ko ? 1 : 0);
