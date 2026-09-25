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

// Le systeme "double n" (25/09/2026) pose un marqueur invisible (VERROU_N,
// \u200B) apres un ん confirme par "nn", pour qu'il ne fusionne jamais avec
// la syllabe suivante -- voir le commentaire de VERROU_N dans app.js. Ce
// marqueur ne doit jamais apparaitre dans les assertions ci-dessous (il est
// invisible et retire avant la notation), donc on le retire ici aussi.
function rvh(s) {
  return romajiVersHiragana(s).replace(/\u200B/g, '');
}

// Simule la VRAIE frappe clavier telle qu'activerSaisieKanaDirecte la vit :
// touche par touche, en repartant a chaque fois de ce qui est deja affiche
// (romajiVersHiragana retraite l'integralite du champ a chaque frappe, pas
// juste la lettre ajoutee). Un simple romajiVersHiragana('kanni') teste un
// collage en un seul bloc, PAS une vraie frappe lettre par lettre -- c'est
// exactement ce qui a laisse passer un bug reel (kanni tape touche par
// touche redonnait a tort "かに", alors que romajiVersHiragana('kanni') en
// un bloc donnait deja correctement "かんい"). A utiliser pour tout
// scenario ou l'ordre des frappes compte (systeme "double n" notamment).
function tapeReel(romaji) {
  let valeur = '';
  for (const car of romaji) {
    valeur += car;
    const converti = romajiVersHiragana(valeur);
    if (converti !== valeur) valeur = converti;
  }
  return valeur.replace(/\u200B/g, '');
}

essai('romajiVersHiragana : voyelles et syllabes simples', () => {
  if (rvh('konnnichiha') !== 'こんにちは') throw new Error(rvh('konnnichiha'));
  if (rvh('arigatou') !== 'ありがとう') throw new Error(rvh('arigatou'));
  if (rvh('tabemasu') !== 'たべます') throw new Error(rvh('tabemasu'));
});

essai('romajiVersHiragana : shi/chi/tsu et leurs variantes si/ti/tu', () => {
  if (rvh('sushi') !== 'すし') throw new Error(rvh('sushi'));
  if (rvh('chizu') !== 'ちず') throw new Error(rvh('chizu'));
  if (rvh('tsukau') !== 'つかう') throw new Error(rvh('tsukau'));
  if (rvh('tukau') !== 'つかう') throw new Error(rvh('tukau'));
  if (rvh('siru') !== 'しる') throw new Error(rvh('siru'));
});

essai('romajiVersHiragana : syllabes palatalisees (kya/sha/cha/nya/rya...)', () => {
  if (rvh('kyou') !== 'きょう') throw new Error(rvh('kyou'));
  if (rvh('shukudai') !== 'しゅくだい') throw new Error(rvh('shukudai'));
  if (rvh('byouin') !== 'びょういん') throw new Error(rvh('byouin'));
  if (rvh('ryokou') !== 'りょこう') throw new Error(rvh('ryokou'));
});

essai('romajiVersHiragana : consonne doublee -> petit tsu (soku-on)', () => {
  if (rvh('kekkon') !== 'けっこん') throw new Error(rvh('kekkon'));
  if (rvh('kitte') !== 'きって') throw new Error(rvh('kitte'));
  if (rvh('kocchi') !== 'こっち') throw new Error(rvh('kocchi'));
  if (rvh('zasshi') !== 'ざっし') throw new Error(rvh('zasshi'));
});

essai('romajiVersHiragana : "n" isole devient ん (fin de mot, devant consonne, "nn")', () => {
  if (rvh('hon') !== 'ほん') throw new Error(rvh('hon'));
  if (rvh('kantan') !== 'かんたん') throw new Error(rvh('kantan'));
  if (rvh('annnai') !== 'あんない') throw new Error(rvh('annnai'));
});

essai('romajiVersHiragana : systeme "double n" -- "nn" donne TOUJOURS un seul ん, meme suivi d\'une voyelle', () => {
  // Decision finale de Paul le 25/09/2026 ("on prend l'option du double n,
  // point final") : sur le clavier japonais qu'il utilise deja, "nn" donne
  // toujours un ん isole, quoi qu'il y ait derriere -- il n'y a plus
  // d'absorption "intelligente" de la voyelle suivante par le second "n".
  if (rvh('nn') !== 'ん') throw new Error(rvh('nn'));
  // "nnn" : la premiere paire fait un ん, le troisieme "n" (isole, en fin
  // de saisie) en fait un second.
  if (rvh('nnn') !== 'んん') throw new Error(rvh('nnn'));
  // "nnnn" : deux paires "nn" -> deux ん (exemple donne par Paul lui-meme).
  if (rvh('nnnn') !== 'んん') throw new Error(rvh('nnnn'));
  // Le second "n" ne forme plus jamais de syllabe avec la voyelle suivante :
  // "nna"/"nni" donnent bien んあ/んい (et non plus んな/んに) -- exactement
  // ce que demandait Paul (ex. "kanni" -> かんい, plus かんに).
  if (rvh('nna') !== 'んあ') throw new Error(rvh('nna'));
  if (rvh('nni') !== 'んい') throw new Error(rvh('nni'));
  if (rvh('kanni') !== 'かんい') throw new Error(rvh('kanni'));
  // Consequence acceptee : les mots qui s'ecrivaient avec 2 "n" pour la
  // syllabe absorbee ont desormais besoin d'un 3e "n" pour ce resultat-la ;
  // avec seulement 2 "n", la voyelle reste bien separee (comme demande).
  if (rvh('zannen') !== 'ざんえん') throw new Error(rvh('zannen'));
  if (rvh('zannnen') !== 'ざんねん') throw new Error(rvh('zannnen'));
});

essai('romajiVersHiragana : systeme "double n" tape touche par touche (pas colle en un bloc)', () => {
  // Signale par Paul le 25/09/2026 ("aucun changement... ん s'ecrit 'n' pas
  // 'nn'") : rvh('kanni') donnait deja correctement かんい en collant tout
  // le mot d'un coup, mais tape VRAIMENT touche par touche (k, a, n, n, i,
  // une a une, en repartant a chaque fois de ce qui est deja affiche --
  // comportement reel de activerSaisieKanaDirecte), le "ん" affiche par le
  // premier "n" etait reconverti en "n" simple des que le second "n"
  // arrivait, indiscernable d'un nouveau "n" isole -- la 3e frappe ("i")
  // fusionnait alors avec lui et redonnait "かに" au lieu de "かんい". Fixe
  // en posant un marqueur invisible (VERROU_N) sur le ん confirme par "nn",
  // qui empeche toute fusion ulterieure -- voir romajiVersHiragana/app.js.
  if (tapeReel('kanni') !== 'かんい') throw new Error(tapeReel('kanni'));
  if (tapeReel('ni') !== 'に') throw new Error(tapeReel('ni'));
  if (tapeReel('nn') !== 'ん') throw new Error(tapeReel('nn'));
  if (tapeReel('nnn') !== 'んん') throw new Error(tapeReel('nnn'));
  if (tapeReel('nnnn') !== 'んん') throw new Error(tapeReel('nnnn'));
  if (tapeReel('nna') !== 'んあ') throw new Error(tapeReel('nna'));
  if (tapeReel('nni') !== 'んい') throw new Error(tapeReel('nni'));
  if (tapeReel('zannen') !== 'ざんえん') throw new Error(tapeReel('zannen'));
  if (tapeReel('zannnen') !== 'ざんねん') throw new Error(tapeReel('zannnen'));
  if (tapeReel('annnai') !== 'あんない') throw new Error(tapeReel('annnai'));
  if (tapeReel('konnnichiha') !== 'こんにちは') throw new Error(tapeReel('konnnichiha'));
  if (tapeReel('funniki') !== 'ふんいき') throw new Error(tapeReel('funniki'));
  // Pas de regression sur les mots sans double "n".
  if (tapeReel('hon') !== 'ほん') throw new Error(tapeReel('hon'));
  if (tapeReel('kantan') !== 'かんたん') throw new Error(tapeReel('kantan'));
  if (tapeReel('kanpai') !== 'かんぱい') throw new Error(tapeReel('kanpai'));
  if (tapeReel('sakana') !== 'さかな') throw new Error(tapeReel('sakana'));
  if (tapeReel('na') !== 'な') throw new Error(tapeReel('na'));
});

essai('romajiVersHiragana : "n" devant une voyelle ou "y" reste rattache a la syllabe (na/ni/nu/ne/no, nya...)', () => {
  if (rvh('sakana') !== 'さかな') throw new Error(rvh('sakana'));
  if (rvh('inu') !== 'いぬ') throw new Error(rvh('inu'));
  if (rvh('konya') !== 'こにゃ') throw new Error(rvh('konya'));
});

essai('romajiVersHiragana : un "ん"/"ン" deja affiche redevient "n" si une lettre suit (bug clavier FR, "na" -> んあ)', () => {
  // Reproduit l'etat du champ tel qu'il existe reellement pendant la
  // frappe (activerSaisieKanaDirecte retraite input.value, pas une chaine
  // romaji vierge) : apres avoir tape "n" seul, le champ affiche deja
  // "ん"/"ン" avant que la lettre suivante n'arrive.
  if (rvh('んa') !== 'な') throw new Error(rvh('んa'));
  if (rvh('ンa') !== 'な') throw new Error(rvh('ンa'));
  if (rvh('こんi') !== 'こに') throw new Error(rvh('こんi'));
  if (rvh('んya') !== 'にゃ') throw new Error(rvh('んya'));
  // Toujours ん devant une consonne ou en fin de saisie : pas de regression.
  if (rvh('んs') !== 'んs') throw new Error(rvh('んs'));
  if (rvh('ん') !== 'ん') throw new Error(rvh('ん'));
});

essai('romajiVersHiragana : apostrophe apres un "n" -> force んX au lieu de niX/naX... (ex. "n\'i" -> んい)', () => {
  // Signale par Paul le 25/09/2026 : le mot "ふんいき" (funiki, atmosphere)
  // tape "funiki" affichait a tort "ふにき" -- aucune facon de distinguer
  // "んい" de "に" sans un moyen explicite de couper la syllabe. Convention
  // standard des claviers japonais : une apostrophe juste apres le n deja
  // affiche force la coupure, sans rien afficher elle-meme.
  if (rvh("n'") !== 'ん') throw new Error(rvh("n'"));
  if (rvh("n'i") !== 'んい') throw new Error(rvh("n'i"));
  if (rvh("n'a") !== 'んあ') throw new Error(rvh("n'a"));
  if (rvh("fun'iki") !== 'ふんいき') throw new Error(rvh("fun'iki"));
  // Reproduit l'etat reel du champ (n deja affiche en ん avant l'apostrophe).
  if (rvh("ふん'") !== 'ふん') throw new Error(rvh("ふん'"));
  if (rvh("ふん'i") !== 'ふんい') throw new Error(rvh("ふん'i"));
  // Le systeme "double n" marche aussi pour ce mot, sans apostrophe.
  if (rvh('funniki') !== 'ふんいき') throw new Error(rvh('funniki'));
  // Sans apostrophe, "ni" reste bien "に" (pas de regression, coeur de la
  // demande de Paul : les deux doivent pouvoir s'ecrire).
  if (rvh('funiki') !== 'ふにき') throw new Error(rvh('funiki'));
  if (rvh('ni') !== 'に') throw new Error(rvh('ni'));
});

essai('romajiVersHiragana : romaji incomplet en fin de saisie reste tel quel (en attente de la voyelle)', () => {
  if (rvh('k') !== 'k') throw new Error(rvh('k'));
  if (rvh('ky') !== 'ky') throw new Error(rvh('ky'));
  if (rvh('tabek') !== 'たべk') throw new Error(rvh('tabek'));
});

essai('romajiVersHiragana : deja-hiragana ou vide n\'est jamais casse', () => {
  if (rvh('あいう') !== 'あいう') throw new Error(rvh('あいう'));
  if (rvh('') !== '') throw new Error(JSON.stringify(rvh('')));
  if (rvh(null) !== '') throw new Error(JSON.stringify(rvh(null)));
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
