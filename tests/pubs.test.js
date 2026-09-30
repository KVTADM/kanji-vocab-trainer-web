// Bannières Adsterra : rien ne se charge sans configuration, sans
// consentement ou pour un compte Pro. Lancer : node tests/pubs.test.js
const fs = require('fs');
const cas = [];
const essai = (nom, fn) => { try { fn(); cas.push(['OK', nom]); } catch (e) { cas.push(['ECHEC', nom + ' -> ' + e.message]); } };
const egal = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' != ' + JSON.stringify(b)); };

const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
global.document = { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } };
global.window = { innerWidth: 1000 };
const code = fs.readFileSync(__dirname + '/../ads.js', 'utf8');
const f = new Function(code + '; return { kvtChoisirBanniere, kvtBanniereSrcdoc, kvtShouldShowAds, kvtAdSlotHtml, kvtGetConsent, kvtSetConsent };')();

const b = (l, h, cle, hote) => ({ largeur: l, hauteur: h, cle, hote });
essai('placeholder : aucune bannière', () => egal(f.kvtChoisirBanniere(1000), null));
essai('choisit la plus grande qui tient', () => egal(f.kvtChoisirBanniere(800, [b(320, 50, 'AB1', 'x.com'), b(728, 90, 'AB2', 'x.com')]).cle, 'AB2'));
essai('écran étroit : prend la petite', () => egal(f.kvtChoisirBanniere(360, [b(320, 50, 'AB1', 'x.com'), b(728, 90, 'AB2', 'x.com')]).cle, 'AB1'));
essai('trop étroit : rien', () => egal(f.kvtChoisirBanniere(200, [b(320, 50, 'AB1', 'x.com')]), null));
essai('clé ou hôte suspects refusés (injection)', () => {
  egal(f.kvtChoisirBanniere(800, [b(320, 50, "a'</script>", 'x.com')]), null);
  egal(f.kvtChoisirBanniere(800, [b(320, 50, 'AB1', 'x.com/"><img')]), null);
});
essai('srcdoc contient la clé, la taille et invoke.js', () => {
  const d = f.kvtBanniereSrcdoc(b(728, 90, 'AB2', 'x.com'));
  if (!d.includes("'key':'AB2'") || !d.includes('//x.com/AB2/invoke.js') || !d.includes("'width':728")) throw new Error(d);
});
essai('Pro : pas de pub', () => { global.window.accountUser = { isPro: true }; egal(f.kvtShouldShowAds(), false); egal(f.kvtAdSlotHtml('a'), ''); });
essai('gratuit : emplacement présent', () => { global.window.accountUser = { isPro: false }; if (!f.kvtAdSlotHtml('a').includes('ad-slot')) throw new Error('absent'); });
essai('pas de pub dans les écrans d\'outil', () => {
  const app = fs.readFileSync(__dirname + '/../app.js', 'utf8');
  const n = (app.match(/kvtAdSlotHtml\(/g) || []).length;
  egal(n, 1);
});
cas.forEach(([s, n]) => console.log(s + ' ' + n));
if (cas.some(c => c[0] === 'ECHEC')) process.exit(1);
