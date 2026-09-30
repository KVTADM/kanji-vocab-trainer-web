// Paliers de couleur du dashboard. Lancer : node tests/paliers.test.js
const fs = require('fs');
const m = fs.readFileSync(__dirname + '/../app.js', 'utf8').match(/function classePalierPct[\s\S]*?\n\}\n/);
const f = new Function(m[0] + '; return classePalierPct;')();
let ko = 0;
[[100,'palier-parfait'],[85,'palier-bon'],[60,'palier-moyen'],[30,'palier-faible'],[0,'palier-faible'],['x','']].forEach(([a,b])=>{
  if (f(a)!==b){ko++;console.log('ECHEC',a,f(a),b);} else console.log('OK',a);
});
process.exit(ko?1:0);
