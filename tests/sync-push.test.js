// Contrôle de bout en bout (Supabase simulé en mémoire) de la protection
// contre l'écrasement entre deux appareils (account.js, 29/09/2026) :
// kvtPushCloud relit la date du cloud avant d'envoyer, fusionne si un autre
// appareil a écrit entre-temps, et écrase quand on le lui demande (forcer).
// À lancer depuis la racine du dépôt : node tests/sync-push.test.js

const fs = require('fs');
global.window = global;

// ---- Faux client Supabase : une seule table utile, user_backups ----
let ligneCloud = null; // { data, updated_at }
function requete() {
  const q = {
    select() { return q; }, eq() { return q; },
    async maybeSingle() { return { data: ligneCloud ? JSON.parse(JSON.stringify(ligneCloud)) : null, error: null }; },
    async upsert(row) {
      ligneCloud = { data: JSON.parse(JSON.stringify(row.data)), updated_at: row.updated_at.replace('Z', '+00:00') };
      return { error: null };
    }
  };
  return q;
}
window.sb = { auth: { onAuthStateChange: () => {} }, from: () => requete() };
global.DB = null;
global.api = { saveData: async () => ({ ok: true }) };

const cas = [];
global.essai = (nom, fn) => cas.push({ nom, fn });

const SRC = fs.readFileSync('account.js', 'utf8');
eval(SRC + `
window.accountUser = { id: 'u1' }; // account.js le remet a null au chargement
function sauvegarde(xp, semaines) {
  const scores = {};
  semaines.forEach(k => { scores[k] = { best: { date: k, pct: 90 }, history: [{ date: k, pct: 90 }] }; });
  return { settings: {}, scores, wordStats: {}, gamification: { xp, pieces: 0, inventaire: [], streak: {} } };
}
function autreAppareilEcrit(data) {
  ligneCloud = { data: JSON.parse(JSON.stringify(data)), updated_at: new Date(Date.now() + 5000).toISOString().replace('Z', '+00:00') };
}

essai('un appareil en retard fusionne au lieu d\\'écraser', async () => {
  ligneCloud = null; kvtBaseSync = null;
  DB = sauvegarde(1000, ['s1-w1']);
  await window.kvtPushCloud(DB);                         // premier envoi : base posée
  autreAppareilEcrit(sauvegarde(5000, ['s1-w1', 'l0-s2-w2']));  // l'autre appareil avance
  DB.scores['s2-w10'] = { best: { date: 's2-w10', pct: 92 }, history: [{ date: 's2-w10', pct: 92 }] };
  DB.gamification.xp = 1500;                             // cet appareil gagne 500 XP
  await window.kvtPushCloud(DB);
  const c = ligneCloud.data;
  ['s1-w1', 'l0-s2-w2', 's2-w10'].forEach(k => { if (!c.scores[k]) throw new Error('perdu dans le cloud : ' + k); });
  if (c.gamification.xp !== 5500) throw new Error('XP cloud attendu 5500, obtenu ' + c.gamification.xp);
  if (DB.gamification.xp !== 5500 || !DB.scores['l0-s2-w2']) throw new Error('la copie locale n\\'a pas été mise à jour');
});

essai('sans autre appareil : envois successifs sans fusion parasite (XP jamais compté deux fois)', async () => {
  ligneCloud = null; kvtBaseSync = null;
  DB = sauvegarde(1000, []);
  await window.kvtPushCloud(DB);
  DB.gamification.xp = 1200; window.kvtPushCloud(DB);   // envois lancés sans attendre, comme saveData
  DB.gamification.xp = 1300; await window.kvtPushCloud(DB);
  if (ligneCloud.data.gamification.xp !== 1300) throw new Error('XP cloud attendu 1300, obtenu ' + ligneCloud.data.gamification.xp);
});

essai('forcer (import / réinitialisation) écrase bien le cloud', async () => {
  ligneCloud = null; kvtBaseSync = null;
  DB = sauvegarde(1000, ['s1-w1']);
  await window.kvtPushCloud(DB);
  autreAppareilEcrit(sauvegarde(9000, ['s1-w1', 's1-w2']));
  const neuf = sauvegarde(0, []);
  await window.kvtPushCloud(neuf, { forcer: true });
  if (ligneCloud.data.gamification.xp !== 0 || Object.keys(ligneCloud.data.scores).length) throw new Error('le cloud n\\'a pas été écrasé');
});
`);

(async () => {
  let echecs = 0;
  for (const { nom, fn } of cas) {
    try { await fn(); console.log('  OK      ' + nom); }
    catch (e) { echecs++; console.log('  ECHEC   ' + nom + ' — ' + e.message); }
  }
  console.log(`\n  ${cas.length - echecs}/${cas.length} passent`);
  process.exit(echecs ? 1 : 0);
})();
