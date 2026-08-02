// Profils publics : avatar, secours sur l'initiale, contrôles avant envoi.
// Lancer : node tests/profils.test.js

const fs = require('fs');
const cas = [];
global.essai = function (nom, fn) {
  try { fn(); cas.push(['OK', nom]); }
  catch (e) { cas.push(['ECHEC', nom + ' -> ' + e.message]); }
};
global.escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.showToast = () => {};
global.confirm = () => true;
global.$ = () => null;
global.$$ = () => [];
global.window = { accountUser: null, sb: null };

// Même piège que pour decks.js : les « const » de profils.js restent
// enfermés dans leur eval. On évalue la source et les scénarios ensemble,
// sinon les scénarios manipulent des variables homonymes et testent du vide.
const SOURCE = fs.readFileSync(__dirname + '/../profils.js', 'utf8');
const SCENARIOS = fs.readFileSync(__dirname + '/profils.cases.js', 'utf8');
eval(SOURCE + '\n;' + SCENARIOS);

(async () => {
  await (async function () {
    global.window.accountUser = { id: 'u1', pseudo: 'Polus' };

    let res = await envoyerAvatar(null);
    if (res.ok || !res.erreur.includes('Aucun fichier')) cas.push(['ECHEC', 'aucun fichier -> ' + JSON.stringify(res)]);
    else cas.push(['OK', 'envoyer sans fichier est refusé proprement']);

    res = await envoyerAvatar({ type: 'image/gif', size: 1000 });
    if (res.ok || !res.erreur.includes('JPEG')) cas.push(['ECHEC', 'format refusé -> ' + JSON.stringify(res)]);
    else cas.push(['OK', 'un GIF est refusé avec un message clair']);

    res = await envoyerAvatar({ type: 'image/png', size: 400 * 1024 });
    if (res.ok || !res.erreur.includes('300 ko')) cas.push(['ECHEC', 'taille refusée -> ' + JSON.stringify(res)]);
    else cas.push(['OK', 'une image de 400 ko est refusée avant tout envoi']);
  })();

  let echecs = 0;
  cas.forEach(([v, n]) => { if (v === 'ECHEC') echecs++; console.log(`  ${v.padEnd(7)} ${n}`); });
  console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
  process.exit(echecs ? 1 : 0);
})();
