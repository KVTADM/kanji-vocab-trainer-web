// Gens en ligne (presence.js) et statistiques au survol des cartes de semaine (app.js).
// Lancer : node tests/presence-et-survol.test.js
const fs = require('fs');
const R = __dirname + '/../';
let ko = 0; const ok = (c, m) => { if (!c) { ko++; console.log('ECHEC : ' + m); } };

// ---- presence.js, charge avec de faux objets (pas de navigateur, pas de reseau) ----
const store = {};
const fenetre = { sb: null, accountUser: { id: 'aaaa-1111' } };
const pistes = [];
const canalFactice = { on() { return canalFactice; }, subscribe() { return canalFactice; }, track(p) { pistes.push(p); }, untrack() { pistes.push('untrack'); }, presenceState() { return {}; } };
const src = fs.readFileSync(R + 'presence.js', 'utf8');
new Function('window', 'document', 'localStorage', 'setTimeout', 'MutationObserver', src)(
  fenetre, undefined, { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } }, () => 0, undefined);
const P = fenetre.kvtPresence;
ok(P && typeof P.estEnLigne === 'function', 'kvtPresence expose son API');
P._calculer({ o1: [{ u: 'aaaa-1111' }], o2: [{ u: 'aaaa-1111' }], o3: [{ u: null }], o4: [{ u: 'bbbb-2222' }] });
ok(P.nombre() === 3, 'deux onglets du meme compte = une personne ; 3 personnes attendues, recu ' + P.nombre());
ok(P.estEnLigne('bbbb-2222') && !P.estEnLigne('cccc-3333') && !P.estEnLigne(null), 'estEnLigne');
ok(/data-presence-uid="bbbb-2222"/.test(P.pastilleHtml('bbbb-2222')) && !/hidden/.test(P.pastilleHtml('bbbb-2222')), 'pastille visible pour un ami en ligne');
ok(/hidden/.test(P.pastilleHtml('cccc-3333')), 'pastille cachee pour un ami hors ligne');
ok(!/[<>"']/.test(P.pastilleHtml('x"><img src=x onerror=1>').replace(/<span[^>]*>/, '').replace('</span>', '')), 'identifiant assaini dans la pastille');
P._calculer({ o1: [{ u: 5 }], o2: [{ u: undefined }] });
ok(P.nombre() === 2 && !P.estEnLigne(5), 'une valeur etrangere ne devient pas un compte');
ok(P.estMasque() === false, 'par defaut on apparait en ligne');
P.masquer(true); ok(P.estMasque() === true, 'masquage memorise');

// ---- htmlStatsSurvol, extrait de app.js ----
const app = fs.readFileSync(R + 'app.js', 'utf8');
const a = app.indexOf('function htmlStatsSurvol');
const b = app.indexOf('function recordSessionResult');
ok(a > 0 && b > a, 'htmlStatsSurvol present');
const stats = new Function('escapeHtml', 'formatDuree', 'formatPct', app.slice(a, b) + '; return htmlStatsSurvol;')(
  s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  ms => Math.round(ms / 1000) + ' s', p => Math.round(Number(p)) + ' %');
const vide = stats('S1', null, null, 5, 20);
ok(/Pas encore test/.test(vide) && /aria-hidden="true"/.test(vide), 'carte jamais testee');
const entry = { history: [{ pct: 60, dureeMs: 90000, date: '2026-10-01T10:00:00Z' }, { pct: 80, dureeMs: 70000, date: '2026-10-05T10:00:00Z' }, { pct: 95, dureeMs: 65000, date: '2026-10-09T10:00:00Z' }] };
const plein = stats('S1', entry, { n: 2, meilleur: 90 }, 5, 20);
ok(/Tentatives<\/span><b>3/.test(plein), 'nombre de tentatives');
ok(/Moyenne<\/span><b>78 %/.test(plein), 'moyenne (78,3 arrondie)');
ok(/↗/.test(plein), 'tendance en hausse');
ok(/65 s/.test(plein), 'meilleur temps');
ok(/polyline/.test(plein), 'courbe presente a partir de 2 tentatives');
ok(/Entra.nements libres<\/span><b>2/.test(plein), 'entrainements libres');
ok(!/<script/i.test(stats('<script>', entry, null, 1, 1)), 'etiquette echappee');
const casse = stats('S1', { history: [null, { pct: 'x' }, {}] }, null, 1, 1);
ok(/Pas encore test/.test(casse), 'historique abime : pas de plantage');

if (ko) { console.log(ko + ' echec(s)'); process.exit(1); }
console.log('presence-et-survol : OK');
