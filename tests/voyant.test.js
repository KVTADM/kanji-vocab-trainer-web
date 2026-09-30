// Voyant de synchronisation. Lancer : node tests/voyant.test.js
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const m = src.match(/function voyantSyncInfos[\s\S]*?\n\}\n/);
if (!m) { console.log('ECHEC fonction introuvable'); process.exit(1); }
const voyantSyncInfos = new Function(m[0] + '; return voyantSyncInfos;')();
let ko = 0;
const t = (nom, a, b) => { if (a !== b) { ko++; console.log('ECHEC', nom, a, '!=', b); } else console.log('OK', nom); };
t('non connecté → local', voyantSyncInfos('ok', false).classe, 'local');
t('erreur → rouge', voyantSyncInfos('erreur', true).classe, 'erreur');
t('erreur → texte', voyantSyncInfos('erreur', true).texte, 'Non synchronisé');
t('envoi → reste vert', voyantSyncInfos('envoi', true).classe, 'ok');
t('ok → Sync', voyantSyncInfos(undefined, true).texte, 'Sync');
process.exit(ko ? 1 : 0);
