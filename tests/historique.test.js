// Historique des sessions : capture compacte des reponses, plafond, fusion
// entre appareils. Lancer : node tests/historique.test.js
const fs = require('fs');
const cas = [];
const essai = (nom, fn) => { try { fn(); cas.push(['OK', nom]); } catch (e) { cas.push(['ECHEC', nom + ' -> ' + e.message]); } };
const egal = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' != ' + JSON.stringify(b)); };

global.escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.formatPct = (p) => String(p).replace('.', ',') + ' %';
global.formatDuree = (ms) => Math.round(ms / 1000) + ' s';
global.window = {};
global.document = { getElementById: () => null };
const src = fs.readFileSync(__dirname + '/../historique.js', 'utf8');
const H = new Function(src + '; return { reponseCompacte, enregistrerHistoriqueSession, fusionnerHistoriques, detailReponsesHtml, HISTORIQUE_MAX_SESSIONS };')();

essai('reponse vocab : question, attendu, ta reponse et % arrondi', () => {
  egal(H.reponseCompacte('vocab', { mot: '猫', lecture: 'ねこ', userAnswer: 'ねご', pct: 0.8 }), { m: '猫', a: 'ねこ', r: 'ねご', p: 80 });
});
essai('reponse traduction : la question est le sens, l\'attendu est le mot', () => {
  egal(H.reponseCompacte('traduction', { mot: '猫', sens: 'chat', userAnswer: '猫', pct: 1 }), { m: 'chat', a: '猫', r: '猫', p: 100 });
});
essai('reponse double : lecture et sens regroupes', () => {
  const r = H.reponseCompacte('double', { mot: '猫', lecture: 'ねこ', sens: 'chat', userAnswerLecture: 'ねこ', userAnswerSens: 'chien', pct: 0.5 });
  egal([r.a, r.r, r.p], ['ねこ / chat', 'ねこ / chien', 50]);
});
essai('reponse kanji : on / kun indique', () => {
  egal(H.reponseCompacte('kanji', { kanji: '山', type: 'onyomi', userAnswer: 'サン', pct: 1 }).m, '山 (on)');
});
essai('les textes trop longs sont coupes', () => {
  const r = H.reponseCompacte('vocab', { mot: 'あ'.repeat(200), lecture: 'x', userAnswer: '', pct: 0 });
  if (r.m.length > 40) throw new Error(r.m.length);
});
essai('une session est ajoutee en tete avec son resume', () => {
  const db = {};
  const e = H.enregistrerHistoriqueSession(db, { semesterId: 's1', week: 3, verbeFilter: 'tous', answers: [{ mot: '猫', lecture: 'ねこ', userAnswer: 'ねこ', pct: 1 }] }, 'vocab', { pct: 100, points: 10, maxPoints: 10, dureeMs: 5000, difficulte: 'difficile' });
  egal([db.historiqueReponses.length, e.mode, e.difficulte, e.reponses.length, e.week], [1, 'vocab', 'difficile', 1, 3]);
});
essai('le plafond de sessions gardees est respecte (les plus anciennes partent)', () => {
  const db = {};
  for (let i = 0; i < H.HISTORIQUE_MAX_SESSIONS + 5; i++) H.enregistrerHistoriqueSession(db, { semesterId: 's1', week: i, answers: [] }, 'vocab', { pct: 50, points: 1, maxPoints: 2, dureeMs: 1 });
  egal(db.historiqueReponses.length, H.HISTORIQUE_MAX_SESSIONS);
  egal(db.historiqueReponses[0].week, H.HISTORIQUE_MAX_SESSIONS + 4);
});
essai('fusion : union sans doublon, plus recent d\'abord', () => {
  const a = [{ date: '2026-09-30T10:00:00Z', mode: 'vocab', semesterId: 's1', week: 1 }, { date: '2026-09-29T10:00:00Z', mode: 'vocab', semesterId: 's1', week: 2 }];
  const b = [{ date: '2026-09-30T10:00:00Z', mode: 'vocab', semesterId: 's1', week: 1 }, { date: '2026-09-30T12:00:00Z', mode: 'kanji', semesterId: 's1', week: 3 }];
  const f = H.fusionnerHistoriques(a, b);
  egal(f.map(e => e.week), [3, 1, 2]);
});
essai('fusion : entrees vides ou absentes acceptees', () => {
  egal(H.fusionnerHistoriques(undefined, null), []);
});
essai('le detail affiche la reponse vide en italique et echappe le HTML', () => {
  const html = H.detailReponsesHtml({ reponses: [{ m: '<b>x</b>', a: 'a', r: '', p: 0 }] });
  if (html.includes('<b>x</b>') || !html.includes('<em>(vide)</em>')) throw new Error(html);
});
essai('session sans detail : message clair', () => {
  if (!H.detailReponsesHtml({ reponses: [] }).includes('Pas de détail')) throw new Error('message manquant');
});

cas.forEach(([s, n]) => console.log('  ' + s.padEnd(7) + n));
const ko = cas.filter(c => c[0] === 'ECHEC').length;
console.log(`\n  ${cas.length - ko}/${cas.length} passent`);
process.exit(ko ? 1 : 0);
