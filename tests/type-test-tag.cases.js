// Scénarios pour libelleFiltreMots() et le suivi du filtre "Mots" sur les
// scores enregistrés (recordSessionResult), ajoutés le 09/09/2026 : Paul
// veut voir sur le Tableau de bord quel type de test a été fait (mots à
// kanji groupés / simples / tous), pas seulement le score ou la
// progression brute.

essai('libelleFiltreMots("kanji_groupe") -> mots à kanji groupés', () => {
  if (libelleFiltreMots('kanji_groupe') !== 'mots à kanji groupés') throw new Error(libelleFiltreMots('kanji_groupe'));
});

essai('libelleFiltreMots("simple") -> mots simples', () => {
  if (libelleFiltreMots('simple') !== 'mots simples') throw new Error(libelleFiltreMots('simple'));
});

essai('libelleFiltreMots("tous") -> tous les mots', () => {
  if (libelleFiltreMots('tous') !== 'tous les mots') throw new Error(libelleFiltreMots('tous'));
});

essai('libelleFiltreMots("aucun") -> aucun mot', () => {
  if (libelleFiltreMots('aucun') !== 'aucun mot') throw new Error(libelleFiltreMots('aucun'));
});

essai('libelleFiltreMots(valeur inconnue ou vide) retombe sur "tous les mots" sans planter', () => {
  if (libelleFiltreMots('sans_verbe') !== 'tous les mots') throw new Error(libelleFiltreMots('sans_verbe'));
  if (libelleFiltreMots(undefined) !== 'tous les mots') throw new Error(libelleFiltreMots(undefined));
  if (libelleFiltreMots(null) !== 'tous les mots') throw new Error(libelleFiltreMots(null));
});

essai('recordSessionResult enregistre le filtre utilisé sur le meilleur score', () => {
  DB = { scores: {} };
  recordSessionResult('s1', 3, 80, 100, 80, 'kanji_groupe');
  const entry = getScoreEntry('s1', 3);
  if (!entry || entry.best.verbeFilter !== 'kanji_groupe') throw new Error(JSON.stringify(entry));
});

essai('recordSessionResult sans filtre precise retombe sur "tous" (retro-compatible)', () => {
  DB = { scores: {} };
  recordSessionResult('s1', 4, 50, 100, 50);
  const entry = getScoreEntry('s1', 4);
  if (entry.best.verbeFilter !== 'tous') throw new Error(JSON.stringify(entry));
});

essai('une meilleure tentative avec un filtre different met a jour le filtre affiche', () => {
  DB = { scores: {} };
  recordSessionResult('s1', 5, 40, 100, 40, 'simple');
  recordSessionResult('s1', 5, 90, 100, 90, 'kanji_groupe');
  const entry = getScoreEntry('s1', 5);
  if (entry.best.verbeFilter !== 'kanji_groupe' || entry.best.pct !== 90) throw new Error(JSON.stringify(entry));
  if (entry.history.length !== 2) throw new Error('les 2 tentatives doivent rester dans l\'historique');
});

// ---------- Chrono par quiz (rang 2 de la feuille de route, 22/09/2026) ----------
// Fondation demandee par Paul : "un temps de 5 min bat un de 10". formatDuree()
// est la fonction de mise en forme partagee par les 5 modes de quiz ;
// recordSessionResult() accepte maintenant un 7e argument optionnel dureeMs,
// ajoute APRES verbeFilter pour ne pas casser les appels positionnels
// existants (voir les essais "retro-compatible" ci-dessus).

essai('formatDuree : moins d\'une minute -> "X s"', () => {
  if (formatDuree(45000) !== '45 s') throw new Error(formatDuree(45000));
  if (formatDuree(0) !== '0 s') throw new Error(formatDuree(0));
});

essai('formatDuree : une minute ou plus -> "X min YY s"', () => {
  if (formatDuree(272000) !== '4 min 32 s') throw new Error(formatDuree(272000));
  if (formatDuree(60000) !== '1 min 00 s') throw new Error(formatDuree(60000));
});

essai('formatDuree : valeur absente ou invalide -> null (pas d\'affichage plutot qu\'un plantage)', () => {
  if (formatDuree(null) !== null) throw new Error(String(formatDuree(null)));
  if (formatDuree(undefined) !== null) throw new Error(String(formatDuree(undefined)));
  if (formatDuree(-5) !== null) throw new Error(String(formatDuree(-5)));
  if (formatDuree(NaN) !== null) throw new Error(String(formatDuree(NaN)));
});

essai('recordSessionResult enregistre la duree passee en 7e argument', () => {
  DB = { scores: {} };
  recordSessionResult('s1', 6, 80, 100, 80, 'tous', 272000);
  const entry = getScoreEntry('s1', 6);
  if (entry.best.dureeMs !== 272000) throw new Error(JSON.stringify(entry));
});

essai('recordSessionResult sans duree precisee (anciens appels) ne plante pas', () => {
  DB = { scores: {} };
  recordSessionResult('s1', 7, 80, 100, 80, 'tous');
  const entry = getScoreEntry('s1', 7);
  if (entry.best.dureeMs !== undefined) throw new Error(JSON.stringify(entry));
});

// ---- Saisie kana sans IME (romajiVersHiragana / hiraganaVersKatakana), tache #22 ----

essai('romajiVersHiragana : voyelles et syllabes simples', () => {
  if (romajiVersHiragana('konnnichiha') !== 'こんにちは') throw new Error(romajiVersHiragana('konnnichiha'));
  if (romajiVersHiragana('arigatou') !== 'ありがとう') throw new Error(romajiVersHiragana('arigatou'));
  if (romajiVersHiragana('tabemasu') !== 'たべます') throw new Error(romajiVersHiragana('tabemasu'));
});

essai('romajiVersHiragana : shi/chi/tsu et leurs variantes si/ti/tu', () => {
  if (romajiVersHiragana('sushi') !== 'すし') throw new Error(romajiVersHiragana('sushi'));
  if (romajiVersHiragana('chizu') !== 'ちず') throw new Error(romajiVersHiragana('chizu'));
  if (romajiVersHiragana('tsukau') !== 'つかう') throw new Error(romajiVersHiragana('tsukau'));
  if (romajiVersHiragana('tukau') !== 'つかう') throw new Error(romajiVersHiragana('tukau'));
  if (romajiVersHiragana('siru') !== 'しる') throw new Error(romajiVersHiragana('siru'));
});

essai('romajiVersHiragana : syllabes palatalisees (kya/sha/cha/nya/rya...)', () => {
  if (romajiVersHiragana('kyou') !== 'きょう') throw new Error(romajiVersHiragana('kyou'));
  if (romajiVersHiragana('shukudai') !== 'しゅくだい') throw new Error(romajiVersHiragana('shukudai'));
  if (romajiVersHiragana('byouin') !== 'びょういん') throw new Error(romajiVersHiragana('byouin'));
  if (romajiVersHiragana('ryokou') !== 'りょこう') throw new Error(romajiVersHiragana('ryokou'));
});

essai('romajiVersHiragana : consonne doublee -> petit tsu (soku-on)', () => {
  if (romajiVersHiragana('kekkon') !== 'けっこん') throw new Error(romajiVersHiragana('kekkon'));
  if (romajiVersHiragana('kitte') !== 'きって') throw new Error(romajiVersHiragana('kitte'));
  if (romajiVersHiragana('kocchi') !== 'こっち') throw new Error(romajiVersHiragana('kocchi'));
  if (romajiVersHiragana('zasshi') !== 'ざっし') throw new Error(romajiVersHiragana('zasshi'));
});

essai('romajiVersHiragana : "n" isole devient ん (fin de mot, devant consonne, "nn")', () => {
  if (romajiVersHiragana('hon') !== 'ほん') throw new Error(romajiVersHiragana('hon'));
  if (romajiVersHiragana('kantan') !== 'かんたん') throw new Error(romajiVersHiragana('kantan'));
  if (romajiVersHiragana('annnai') !== 'あんない') throw new Error(romajiVersHiragana('annnai'));
});

essai('romajiVersHiragana : systeme "double n" -- "nn" donne TOUJOURS un seul ん, meme suivi d\'une voyelle', () => {
  // Decision finale de Paul le 25/09/2026 ("on prend l'option du double n,
  // point final") : sur le clavier japonais qu'il utilise deja, "nn" donne
  // toujours un ん isole, quoi qu'il y ait derriere -- il n'y a plus
  // d'absorption "intelligente" de la voyelle suivante par le second "n".
  if (romajiVersHiragana('nn') !== 'ん') throw new Error(romajiVersHiragana('nn'));
  // "nnn" : la premiere paire fait un ん, le troisieme "n" (isole, en fin
  // de saisie) en fait un second.
  if (romajiVersHiragana('nnn') !== 'んん') throw new Error(romajiVersHiragana('nnn'));
  // "nnnn" : deux paires "nn" -> deux ん (exemple donne par Paul lui-meme).
  if (romajiVersHiragana('nnnn') !== 'んん') throw new Error(romajiVersHiragana('nnnn'));
  // Le second "n" ne forme plus jamais de syllabe avec la voyelle suivante :
  // "nna"/"nni" donnent bien んあ/んい (et non plus んな/んに) -- exactement
  // ce que demandait Paul (ex. "kanni" -> かんい, plus かんに).
  if (romajiVersHiragana('nna') !== 'んあ') throw new Error(romajiVersHiragana('nna'));
  if (romajiVersHiragana('nni') !== 'んい') throw new Error(romajiVersHiragana('nni'));
  if (romajiVersHiragana('kanni') !== 'かんい') throw new Error(romajiVersHiragana('kanni'));
  // Consequence acceptee : les mots qui s'ecrivaient avec 2 "n" pour la
  // syllabe absorbee ont desormais besoin d'un 3e "n" pour ce resultat-la ;
  // avec seulement 2 "n", la voyelle reste bien separee (comme demande).
  if (romajiVersHiragana('zannen') !== 'ざんえん') throw new Error(romajiVersHiragana('zannen'));
  if (romajiVersHiragana('zannnen') !== 'ざんねん') throw new Error(romajiVersHiragana('zannnen'));
});

essai('romajiVersHiragana : "n" devant une voyelle ou "y" reste rattache a la syllabe (na/ni/nu/ne/no, nya...)', () => {
  if (romajiVersHiragana('sakana') !== 'さかな') throw new Error(romajiVersHiragana('sakana'));
  if (romajiVersHiragana('inu') !== 'いぬ') throw new Error(romajiVersHiragana('inu'));
  if (romajiVersHiragana('konya') !== 'こにゃ') throw new Error(romajiVersHiragana('konya'));
});

essai('romajiVersHiragana : un "ん"/"ン" deja affiche redevient "n" si une lettre suit (bug clavier FR, "na" -> んあ)', () => {
  // Reproduit l'etat du champ tel qu'il existe reellement pendant la
  // frappe (activerSaisieKanaDirecte retraite input.value, pas une chaine
  // romaji vierge) : apres avoir tape "n" seul, le champ affiche deja
  // "ん"/"ン" avant que la lettre suivante n'arrive.
  if (romajiVersHiragana('んa') !== 'な') throw new Error(romajiVersHiragana('んa'));
  if (romajiVersHiragana('ンa') !== 'な') throw new Error(romajiVersHiragana('ンa'));
  if (romajiVersHiragana('こんi') !== 'こに') throw new Error(romajiVersHiragana('こんi'));
  if (romajiVersHiragana('んya') !== 'にゃ') throw new Error(romajiVersHiragana('んya'));
  // Toujours ん devant une consonne ou en fin de saisie : pas de regression.
  if (romajiVersHiragana('んs') !== 'んs') throw new Error(romajiVersHiragana('んs'));
  if (romajiVersHiragana('ん') !== 'ん') throw new Error(romajiVersHiragana('ん'));
});

essai('romajiVersHiragana : apostrophe apres un "n" -> force んX au lieu de niX/naX... (ex. "n\'i" -> んい)', () => {
  // Signale par Paul le 25/09/2026 : le mot "ふんいき" (funiki, atmosphere)
  // tape "funiki" affichait a tort "ふにき" -- aucune facon de distinguer
  // "んい" de "に" sans un moyen explicite de couper la syllabe. Convention
  // standard des claviers japonais : une apostrophe juste apres le n deja
  // affiche force la coupure, sans rien afficher elle-meme.
  if (romajiVersHiragana("n'") !== 'ん') throw new Error(romajiVersHiragana("n'"));
  if (romajiVersHiragana("n'i") !== 'んい') throw new Error(romajiVersHiragana("n'i"));
  if (romajiVersHiragana("n'a") !== 'んあ') throw new Error(romajiVersHiragana("n'a"));
  if (romajiVersHiragana("fun'iki") !== 'ふんいき') throw new Error(romajiVersHiragana("fun'iki"));
  // Reproduit l'etat reel du champ (n deja affiche en ん avant l'apostrophe).
  if (romajiVersHiragana("ふん'") !== 'ふん') throw new Error(romajiVersHiragana("ふん'"));
  if (romajiVersHiragana("ふん'i") !== 'ふんい') throw new Error(romajiVersHiragana("ふん'i"));
  // Le systeme "double n" marche aussi pour ce mot, sans apostrophe.
  if (romajiVersHiragana('funniki') !== 'ふんいき') throw new Error(romajiVersHiragana('funniki'));
  // Sans apostrophe, "ni" reste bien "に" (pas de regression, coeur de la
  // demande de Paul : les deux doivent pouvoir s'ecrire).
  if (romajiVersHiragana('funiki') !== 'ふにき') throw new Error(romajiVersHiragana('funiki'));
  if (romajiVersHiragana('ni') !== 'に') throw new Error(romajiVersHiragana('ni'));
});

essai('romajiVersHiragana : romaji incomplet en fin de saisie reste tel quel (en attente de la voyelle)', () => {
  if (romajiVersHiragana('k') !== 'k') throw new Error(romajiVersHiragana('k'));
  if (romajiVersHiragana('ky') !== 'ky') throw new Error(romajiVersHiragana('ky'));
  if (romajiVersHiragana('tabek') !== 'たべk') throw new Error(romajiVersHiragana('tabek'));
});

essai('romajiVersHiragana : deja-hiragana ou vide n\'est jamais casse', () => {
  if (romajiVersHiragana('あいう') !== 'あいう') throw new Error(romajiVersHiragana('あいう'));
  if (romajiVersHiragana('') !== '') throw new Error(JSON.stringify(romajiVersHiragana('')));
  if (romajiVersHiragana(null) !== '') throw new Error(JSON.stringify(romajiVersHiragana(null)));
});

essai('hiraganaVersKatakana : convertit pour le champ onyomi, laisse le reste intact', () => {
  if (hiraganaVersKatakana('たべる') !== 'タベル') throw new Error(hiraganaVersKatakana('たべる'));
  if (hiraganaVersKatakana('') !== '') throw new Error(JSON.stringify(hiraganaVersKatakana('')));
  if (hiraganaVersKatakana('コウ') !== 'コウ') throw new Error(hiraganaVersKatakana('コウ'));
});

essai('activerSaisieKanaDirecte : convertit en direct sur l\'evenement input et replace le curseur en fin de champ', () => {
  const input = { value: 'ka', _listeners: {}, addEventListener(evt, fn) { this._listeners[evt] = fn; }, setSelectionRange(a, b) { this._sel = [a, b]; } };
  activerSaisieKanaDirecte(input, false);
  input._listeners.input({});
  if (input.value !== 'か') throw new Error(input.value);
  if (JSON.stringify(input._sel) !== JSON.stringify([1, 1])) throw new Error(JSON.stringify(input._sel));
});

essai('activerSaisieKanaDirecte : katakana=true convertit pour le champ onyomi', () => {
  const input = { value: 'kou', _listeners: {}, addEventListener(evt, fn) { this._listeners[evt] = fn; }, setSelectionRange() {} };
  activerSaisieKanaDirecte(input, true);
  input._listeners.input({});
  if (input.value !== 'コウ') throw new Error(input.value);
});

essai('activerSaisieKanaDirecte : ne touche pas au champ pendant une composition IME en cours (isComposing/keyCode 229)', () => {
  const input = { value: 'ka', _listeners: {}, addEventListener(evt, fn) { this._listeners[evt] = fn; }, setSelectionRange() { throw new Error('ne doit pas etre appele pendant une composition'); } };
  activerSaisieKanaDirecte(input, false);
  input._listeners.input({ isComposing: true });
  if (input.value !== 'ka') throw new Error(input.value);
  input._listeners.input({ keyCode: 229 });
  if (input.value !== 'ka') throw new Error(input.value);
});

essai('motsConfondables : detecte les autres mots du programme partageant exactement la meme lecture', () => {
  DB = { vocab: [
    { id: 'v1', mot: '聞く', lecture: 'きく', sens: 'ecouter' },
    { id: 'v2', mot: '効く', lecture: 'きく', sens: 'faire effet' },
    { id: 'v3', mot: '利く', lecture: 'きく', sens: 'etre efficace' },
    { id: 'v4', mot: '食べる', lecture: 'たべる', sens: 'manger' },
  ] };
  const res = motsConfondables(DB.vocab[0]);
  if (res.length !== 2) throw new Error(JSON.stringify(res));
  if (!res.some(r => r.id === 'v2') || !res.some(r => r.id === 'v3')) throw new Error(JSON.stringify(res));
  if (res.some(r => r.id === 'v1')) throw new Error('ne doit pas se renvoyer lui-meme : ' + JSON.stringify(res));
});

essai('motsConfondables : aucun homophone -> tableau vide (pas de bruit visuel)', () => {
  DB = { vocab: [
    { id: 'v1', mot: '食べる', lecture: 'たべる', sens: 'manger' },
    { id: 'v2', mot: '飲む', lecture: 'のむ', sens: 'boire' },
  ] };
  if (motsConfondables(DB.vocab[0]).length !== 0) throw new Error(JSON.stringify(motsConfondables(DB.vocab[0])));
});

essai('motsConfondables : plafonne a 3 resultats meme si plus d\'homophones existent', () => {
  DB = { vocab: [
    { id: 'v0', mot: '汽', lecture: 'き', sens: 'a' },
    { id: 'v1', mot: '木', lecture: 'き', sens: 'arbre' },
    { id: 'v2', mot: '気', lecture: 'き', sens: 'esprit' },
    { id: 'v3', mot: '黄', lecture: 'き', sens: 'jaune' },
    { id: 'v4', mot: '生', lecture: 'き', sens: 'cru' },
  ] };
  if (motsConfondables(DB.vocab[0]).length !== 3) throw new Error(JSON.stringify(motsConfondables(DB.vocab[0])));
});

essai('motsConfondables : mot sans lecture ou absent -> tableau vide (pas d\'exception)', () => {
  DB = { vocab: [{ id: 'v1', mot: '？', lecture: '' }] };
  if (motsConfondables(null).length !== 0) throw new Error('null');
  if (motsConfondables(undefined).length !== 0) throw new Error('undefined');
  if (motsConfondables(DB.vocab[0]).length !== 0) throw new Error('lecture vide');
});

essai('caracteresKanjiDistincts : isole chaque caractere kanji reel d\'une fiche a plusieurs kanji (ex. "歳/才")', () => {
  const res = caracteresKanjiDistincts('歳/才');
  if (JSON.stringify(res) !== JSON.stringify(['歳', '才'])) throw new Error(JSON.stringify(res));
});

essai('caracteresKanjiDistincts : un seul kanji -> tableau a un element', () => {
  const res = caracteresKanjiDistincts('木');
  if (JSON.stringify(res) !== JSON.stringify(['木'])) throw new Error(JSON.stringify(res));
});

essai('caracteresKanjiDistincts : deduplique tout en gardant l\'ordre d\'apparition', () => {
  const res = caracteresKanjiDistincts('木木水');
  if (JSON.stringify(res) !== JSON.stringify(['木', '水'])) throw new Error(JSON.stringify(res));
});

essai('caracteresKanjiDistincts : chaine vide ou sans kanji -> tableau vide, jamais d\'exception', () => {
  if (caracteresKanjiDistincts('').length !== 0) throw new Error('vide');
  if (caracteresKanjiDistincts(null).length !== 0) throw new Error('null');
  if (caracteresKanjiDistincts(undefined).length !== 0) throw new Error('undefined');
  if (caracteresKanjiDistincts('ABC123').length !== 0) throw new Error('sans kanji');
});

essai('tracesDisponibles : renvoie null proprement quand KANJIVG_DATA est absent (comme dans ce harnais de tests)', () => {
  if (tracesDisponibles('木') !== null) throw new Error(JSON.stringify(tracesDisponibles('木')));
});

essai('tracesDisponibles : renvoie les traits du caractere si KANJIVG_DATA est present, sinon null', () => {
  global.KANJIVG_DATA = { '木': ['M1,1', 'M2,2'] };
  try {
    if (JSON.stringify(tracesDisponibles('木')) !== JSON.stringify(['M1,1', 'M2,2'])) throw new Error('trouve');
    if (tracesDisponibles('不-connu') !== null) throw new Error('absent devrait etre null');
  } finally {
    delete global.KANJIVG_DATA;
  }
});

essai('scoreDoubleAnswer : les deux champs justes -> score plein (minimum des deux pourcentages = 1)', () => {
  DB = { settings: { pointsPerWord: 10 } };
  const v = { mot: '食べる', lecture: 'たべる', sens: 'Manger' };
  const res = scoreDoubleAnswer('たべる', 'Manger', v);
  if (res.pct !== 1) throw new Error(JSON.stringify(res));
  if (res.points !== 10) throw new Error(JSON.stringify(res));
});

essai('scoreDoubleAnswer : lecture juste mais sens faux -> le sens plafonne le score (minimum, pas moyenne)', () => {
  DB = { settings: { pointsPerWord: 10 } };
  const v = { mot: '食べる', lecture: 'たべる', sens: 'Manger' };
  const res = scoreDoubleAnswer('たべる', 'xyzabc totalement faux', v);
  if (res.pct !== res.sens.pct) throw new Error('le minimum devrait etre le pct du sens : ' + JSON.stringify(res));
  if (res.pct >= res.lecture.pct) throw new Error('le sens rate doit plafonner en dessous de la lecture juste : ' + JSON.stringify(res));
});

essai('scoreDoubleAnswer : sens juste mais lecture fausse -> la lecture plafonne le score', () => {
  DB = { settings: { pointsPerWord: 10 } };
  const v = { mot: '食べる', lecture: 'たべる', sens: 'Manger' };
  const res = scoreDoubleAnswer('zzzzzz totalement faux', 'Manger', v);
  if (res.pct !== res.lecture.pct) throw new Error('le minimum devrait etre le pct de la lecture : ' + JSON.stringify(res));
});

essai('scoreDoubleAnswer : une petite faute de frappe dans un champ reste tolerée (scoreAnswer deja tolerant)', () => {
  DB = { settings: { pointsPerWord: 10 } };
  const v = { mot: '食べる', lecture: 'たべる', sens: 'Manger' };
  const res = scoreDoubleAnswer('たべる', 'Mangger', v); // une lettre en trop
  if (res.pct < 0.6) throw new Error('une petite faute ne devrait pas ecraser le score : ' + JSON.stringify(res));
});
