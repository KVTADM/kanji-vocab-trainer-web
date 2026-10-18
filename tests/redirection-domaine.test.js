// L'ancienne adresse .netlify.app doit etre redirigee en 301 vers kvtkanji.app, en premiere regle,
// limitee a son hote (sinon boucle). Lancer : node tests/redirection-domaine.test.js
const fs = require('fs');
const toml = fs.readFileSync(__dirname + '/../netlify.toml', 'utf8');
let ko = 0; const ok = (c, m) => { if (!c) { ko++; console.log('ECHEC : ' + m); } };
const blocs = toml.split('[[redirects]]').slice(1);
ok(blocs.length > 0, 'aucune redirection');
const b = blocs[0];
ok(/from = "https:\/\/kanji-vocab-trainer\.netlify\.app\/\*"/.test(b), 'la premiere regle doit cibler l\'ancien hote');
ok(/to = "https:\/\/kvtkanji\.app\/:splat"/.test(b), 'destination :splat sur kvtkanji.app');
ok(/status = 301/.test(b) && /force = true/.test(b), '301 force');
ok(!/from = "https:\/\/kvtkanji\.app/.test(toml), 'aucune regle ne doit partir de kvtkanji.app (boucle)');
if (ko) process.exit(1); console.log('redirection-domaine : OK');
