// Reponse a voix haute (05/11/2026), tests de traduction du cursus : bareme des tentatives et reglages du site.
// A lancer depuis la racine du depot : node tests/voix.test.js
const fs = require('fs');
const R = __dirname + '/../';
const V = require(R + 'voix.js');
let echecs = 0;
const ok = (c, m) => { console.log((c ? '  OK     ' : '  ECHEC  ') + m); if (!c) echecs++; };

ok([1, 2, 3].every(n => V.coefTentative(n) === 1), 'les 3 premieres tentatives valent le maximum');
ok(V.coefTentative(4) === 0.75 && V.coefTentative(5) === 0.5 && V.coefTentative(6) === 0.25, 'tentatives 4, 5, 6 : 75 %, 50 %, 25 %');
ok(V.coefTentative(7) === 0 && V.coefTentative(0) === 0, 'au-dela de 6 tentatives : 0 point');
let bon = true; for (let n = 2; n <= 7; n++) if (V.coefTentative(n) > V.coefTentative(n - 1)) bon = false;
ok(bon, 'le bareme ne remonte jamais');
ok(V.disponible() === false, 'pas de reconnaissance vocale sous node : le bouton micro serait masque');
ok(V.ecouter({}) === false, 'ecouter() sans navigateur compatible renvoie false');

const app = fs.readFileSync(R + 'app.js', 'utf8');
const index = fs.readFileSync(R + 'app/index.html', 'utf8');
const sw = fs.readFileSync(R + 'service-worker.js', 'utf8');
const toml = fs.readFileSync(R + 'netlify.toml', 'utf8');
ok(/<script src="\/voix\.js"><\/script>/.test(index), 'voix.js charge par la page app');
ok(sw.includes("'/voix.js'"), 'voix.js dans le cache hors ligne');
ok(/microphone=\(self\)/.test(toml) && !/microphone=\(\)/.test(toml), 'le micro est autorise pour le site (Permissions-Policy)');
ok(/brancherVoixTraduction\(v,/.test(app) && /htmlVoixTraduction\(\)/.test(app), 'le test de traduction du cursus branche la voix');
ok(!/htmlVoixPratique|brancherVoixPratique/.test(app), 'plus de voix dans le mode Pratique (uniquement les tests de traduction du cursus)');
ok(/VOIX_TRADUCTION_SEMESTRES = \['l0-s1', 'l0-s2', 's1', 's2', 's3', 's4'\]/.test(app), 'voix active sur tout L0, L1 et L2 (et pas au-dela)');
ok(/lang: 'ja-JP'/.test(app), 'reconnaissance du japonais');
ok(/Réponse à voix haute/.test(fs.readFileSync(R + 'confidentialite/index.html', 'utf8')), 'politique de confidentialite mise a jour');
process.exit(echecs ? 1 : 0);
