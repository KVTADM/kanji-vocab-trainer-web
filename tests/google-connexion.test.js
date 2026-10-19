// Connexion avec Google (google-connexion.js) : desactivee sans identifiant client, branchee sur l'appli.
// Lancer : node tests/google-connexion.test.js
const fs = require('fs');
const R = __dirname + '/../';
let ko = 0; const ok = (c, m) => { if (!c) { ko++; console.log('ECHEC : ' + m); } };
const src = fs.readFileSync(R + 'google-connexion.js', 'utf8');
function charge(source) { const w = { sb: null }; new Function('window', 'document', 'location', 'setTimeout', 'sessionStorage', source)(w, undefined, { pathname: '/' }, undefined, undefined); return w.kvtGoogle; }

const G = charge(src);
ok(G && !G.actif() && G.boutonHtml() === '', 'sans identifiant client : rien d\'affiche');
const m = src.match(/const KVT_GOOGLE_CLIENT_ID = '([^']*)'/);
ok(m && m[1] === '', 'le depot est livre avec un identifiant client vide tant que Paul ne l\'a pas fourni');
const G2 = charge(src.replace("KVT_GOOGLE_CLIENT_ID = ''", "KVT_GOOGLE_CLIENT_ID = '123-abc.apps.googleusercontent.com'"));
ok(G2.actif() && /id="btnGoogle"/.test(G2.boutonHtml()), 'avec un identifiant valide : bouton present');
const G3 = charge(src.replace("KVT_GOOGLE_CLIENT_ID = ''", "KVT_GOOGLE_CLIENT_ID = 'nimporte quoi'"));
ok(!G3.actif(), 'identifiant mal forme : desactive');
ok(!/client_secret|GOCSPX/i.test(src), 'aucun secret client dans le code');
ok(/nonce: brut/.test(src) && /nonce: hache/.test(src), 'nonce : hache pour Google, brut pour Supabase');
ok(!/full_name|user_metadata\.name/.test(src), 'le nom Google n\'est jamais utilise comme pseudo');
ok(/google-connexion\.js/.test(fs.readFileSync(R + 'app/index.html', 'utf8')), 'script charge dans l\'appli');
ok(fs.readFileSync(R + 'app/index.html', 'utf8').indexOf('google-connexion.js') < fs.readFileSync(R + 'app/index.html', 'utf8').indexOf('/account.js'), 'charge avant account.js');
ok(/'\/google-connexion\.js'/.test(fs.readFileSync(R + 'service-worker.js', 'utf8')), 'dans le cache du service worker');
ok(/kvtGoogle\.boutonHtml\(\)/.test(fs.readFileSync(R + 'account.js', 'utf8')) && /kvtGoogle\.brancher\(el\)/.test(fs.readFileSync(R + 'account.js', 'utf8')), 'account.js affiche et branche le bouton');
ok(/Connexion avec Google/.test(fs.readFileSync(R + 'confidentialite/index.html', 'utf8')), 'page confidentialite mise a jour');
console.log(ko ? ko + ' echec(s)' : 'google-connexion : OK');
process.exit(ko ? 1 : 0);
