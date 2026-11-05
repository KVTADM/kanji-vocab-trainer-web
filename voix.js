// Reconnaissance vocale (05/11/2026, demande de Paul) : repondre a voix haute, en
// francais, dans les tests de traduction. S'appuie sur l'API du navigateur
// (SpeechRecognition / webkitSpeechRecognition) : pas de cle, pas de serveur KVT,
// l'audio n'est jamais enregistre par KVT. Sur Chrome le navigateur confie la
// transcription au service vocal de Google ; Firefox n'a pas cette API (le
// bouton micro n'est alors pas affiche).
//
// Regle de notation par tentative : la reconnaissance se trompe parfois, donc les
// 3 premieres tentatives valent le maximum de points ; ensuite de moins en
// moins (75 %, 50 %, 25 %), puis plus rien apres 6 tentatives.
(function () {
  const MAX_TENTATIVES = 6;
  const SEUIL = 0.85; // similarite minimale pour accepter ce qui a ete entendu
  const g = typeof window !== 'undefined' ? window : globalThis;

  function coefTentative(n) {
    if (!(n >= 1) || n > MAX_TENTATIVES) return 0;
    if (n <= 3) return 1;
    return [0, 1, 1, 1, 0.75, 0.5, 0.25][n];
  }

  function constructeur() {
    return g.SpeechRecognition || g.webkitSpeechRecognition || null;
  }
  function disponible() { return !!constructeur(); }

  let rec = null;

  function arreter() {
    if (!rec) return;
    const r = rec; rec = null;
    r.__annule = true;
    try { r.abort(); } catch (e) { /* deja arrete */ }
  }

  // Une ecoute : appelle exactement une fois onResultat(liste) ou onErreur(code).
  function ecouter(opts) {
    const C = constructeur();
    if (!C) return false;
    arreter();
    const r = new C();
    rec = r;
    r.lang = (opts && opts.lang) || 'fr-FR';
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 10;
    let traite = false;
    const fin = (fn, arg) => { if (traite || r.__annule) return; traite = true; if (rec === r) rec = null; fn(arg); };
    r.onresult = (e) => {
      const liste = [];
      const res = e.results && e.results[e.results.length - 1];
      if (res) for (let i = 0; i < res.length; i++) { const t = (res[i].transcript || '').trim(); if (t) liste.push(t); }
      if (liste.length) fin(opts.onResultat, liste); else fin(opts.onErreur, 'no-speech');
    };
    r.onerror = (e) => { if (e && e.error === 'aborted') return; fin(opts.onErreur, (e && e.error) || 'erreur'); };
    r.onend = () => fin(opts.onErreur, 'no-speech');
    try { r.start(); } catch (e) { fin(opts.onErreur, 'erreur'); }
    return true;
  }

  // Preference "micro automatique a chaque question" (confort par appareil).
  function auto() { try { return g.localStorage.getItem('kvt-voix-auto') === '1'; } catch (e) { return false; } }
  function definirAuto(v) { try { g.localStorage.setItem('kvt-voix-auto', v ? '1' : '0'); } catch (e) { /* ignore */ } }
  function dejaChoisi() { try { return g.localStorage.getItem('kvt-voix-auto') !== null; } catch (e) { return true; } }

  const api = { MAX_TENTATIVES, SEUIL, coefTentative, disponible, ecouter, arreter, auto, definirAuto, dejaChoisi };
  g.kvtVoix = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
