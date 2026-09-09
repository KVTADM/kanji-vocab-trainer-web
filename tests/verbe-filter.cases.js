// Scénarios pour le filtre "avec/sans verbe de base".

// ---------- contientKanji / contientHiragana ----------

essai('contientKanji detecte un kanji present', () => {
  if (!contientKanji('泳ぐ')) throw new Error('attendu true pour 泳ぐ');
});

essai('contientKanji renvoie false pour du hiragana pur', () => {
  if (contientKanji('およぐ')) throw new Error('attendu false pour およぐ');
});

essai('contientKanji gere une entree vide/nulle sans planter', () => {
  if (contientKanji('') || contientKanji(null) || contientKanji(undefined)) {
    throw new Error('attendu false pour une entree vide/nulle');
  }
});

essai('contientHiragana detecte du hiragana present', () => {
  if (!contientHiragana('泳ぐ')) throw new Error('attendu true pour 泳ぐ');
});

essai('contientHiragana renvoie false pour du kanji pur', () => {
  if (contientHiragana('問題')) throw new Error('attendu false pour 問題');
});

// ---------- estVerbeDeBase : verbes de base (doivent etre detectes) ----------

essai('泳ぐ (verbe de base, terminaison ぐ) est detecte comme verbe', () => {
  if (!estVerbeDeBase('泳ぐ')) throw new Error('attendu true');
});

essai('話す (verbe de base, terminaison す) est detecte comme verbe', () => {
  if (!estVerbeDeBase('話す')) throw new Error('attendu true');
});

essai('取る (verbe de base, terminaison る) est detecte comme verbe', () => {
  if (!estVerbeDeBase('取る')) throw new Error('attendu true');
});

essai('愛する (verbe en +suru) est detecte comme verbe', () => {
  if (!estVerbeDeBase('愛する')) throw new Error('attendu true');
});

// ---------- estVerbeDeBase : categories grises a garder visibles (NE PAS exclure) ----------

essai('問題 (kanji combines, sans hiragana) n\'est PAS un verbe de base', () => {
  if (estVerbeDeBase('問題')) throw new Error('attendu false (mot a kanji combines)');
});

essai('高校生 (kanji combines, sans hiragana) n\'est PAS un verbe de base', () => {
  if (estVerbeDeBase('高校生')) throw new Error('attendu false (mot a kanji combines)');
});

essai('半 (kanji seul) n\'est PAS un verbe de base', () => {
  if (estVerbeDeBase('半')) throw new Error('attendu false (kanji seul)');
});

essai('高い (adjectif en -i, kanji+hiragana mais termine par い) n\'est PAS un verbe de base', () => {
  if (estVerbeDeBase('高い')) throw new Error('attendu false (adjectif -i)');
});

essai('新しい (adjectif en -i) n\'est PAS un verbe de base', () => {
  if (estVerbeDeBase('新しい')) throw new Error('attendu false (adjectif -i)');
});

essai('mot vide ou nul ne plante pas et n\'est pas un verbe', () => {
  if (estVerbeDeBase('') || estVerbeDeBase(null) || estVerbeDeBase(undefined)) {
    throw new Error('attendu false pour une entree vide/nulle');
  }
});

// ---------- filtrerVocabParVerbe ----------

function listeTest() {
  return [
    { id: 1, mot: '泳ぐ' },      // verbe_base
    { id: 2, mot: '話す' },      // verbe_base
    { id: 3, mot: '愛する' },    // verbe_suru
    { id: 4, mot: '問題' },      // kanji_combine
    { id: 5, mot: '高校生' },    // kanji_combine
    { id: 6, mot: '半' },        // kanji_seul
    { id: 7, mot: '高い' },      // adjectif_i
    { id: 8, mot: '新しい' }     // adjectif_i
  ];
}

essai('filtre "tous" renvoie la liste complete sans modification', () => {
  const l = listeTest();
  const r = filtrerVocabParVerbe(l, 'tous');
  if (r.length !== 8) throw new Error('attendu 8, obtenu ' + r.length);
  if (r !== l) throw new Error('attendu la meme reference (aucune copie necessaire pour "tous")');
});

essai('filtre "sans_verbe" exclut uniquement les vrais verbes (garde kanji_combine, kanji_seul, adjectif_i)', () => {
  const r = filtrerVocabParVerbe(listeTest(), 'sans_verbe');
  const mots = r.map(v => v.mot);
  if (mots.includes('泳ぐ') || mots.includes('話す') || mots.includes('愛する')) {
    throw new Error('un verbe de base n\'a pas ete exclu : ' + JSON.stringify(mots));
  }
  ['問題', '高校生', '半', '高い', '新しい'].forEach(m => {
    if (!mots.includes(m)) throw new Error(m + ' aurait du rester visible (categorie grise) : ' + JSON.stringify(mots));
  });
  if (r.length !== 5) throw new Error('attendu 5 mots restants, obtenu ' + r.length);
});

essai('filtre "verbe_seul" ne garde que les vrais verbes', () => {
  const r = filtrerVocabParVerbe(listeTest(), 'verbe_seul');
  const mots = r.map(v => v.mot);
  if (mots.length !== 3) throw new Error('attendu 3 verbes, obtenu ' + JSON.stringify(mots));
  ['泳ぐ', '話す', '愛する'].forEach(m => {
    if (!mots.includes(m)) throw new Error(m + ' aurait du etre garde : ' + JSON.stringify(mots));
  });
});

essai('filtrerVocabParVerbe ne modifie jamais la liste d\'origine', () => {
  const l = listeTest();
  filtrerVocabParVerbe(l, 'sans_verbe');
  if (l.length !== 8) throw new Error('la liste d\'origine a ete mutee');
});

// ---------- estKanjiGroupe / filtre "kanji_groupe" (09/09/2026) ----------
// Différencie les mots à kanji groupés (onyomi OU kunyomi, peu importe —
// décidé avec Paul) des mots simples (verbe, kanji seul, adjectif -i), et
// exclut les mots à kanji groupés qui restent des verbes dans l'usage
// (電話, 旅行... = +suru) même stockés ici sous leur forme nominale.

essai('問題 (kanji groupes, onyomi) est detecte comme kanji groupe', () => {
  if (!estKanjiGroupe('問題')) throw new Error('attendu true');
});

essai('子供 (kanji groupes, kunyomi) est AUSSI detecte comme kanji groupe (pas de distinction onyomi/kunyomi)', () => {
  if (!estKanjiGroupe('子供')) throw new Error('attendu true');
});

essai('高校生 (kanji groupes, 3 caracteres) est detecte comme kanji groupe', () => {
  if (!estKanjiGroupe('高校生')) throw new Error('attendu true');
});

essai('半 (kanji seul, un seul caractere) n\'est PAS un kanji groupe', () => {
  if (estKanjiGroupe('半')) throw new Error('attendu false (un seul kanji, pas "groupe")');
});

essai('泳ぐ (verbe, contient du hiragana) n\'est PAS un kanji groupe', () => {
  if (estKanjiGroupe('泳ぐ')) throw new Error('attendu false (contient du hiragana)');
});

essai('高い (adjectif -i, contient du hiragana) n\'est PAS un kanji groupe', () => {
  if (estKanjiGroupe('高い')) throw new Error('attendu false (contient du hiragana)');
});

essai('電話 (kanji groupes mais reste un verbe a l\'usage, +suru) est exclu malgre sa forme', () => {
  if (estKanjiGroupe('電話')) throw new Error('attendu false : exception verbe connue');
});

essai('旅行 et 勉強 (memes exceptions verbe connues) sont exclus', () => {
  if (estKanjiGroupe('旅行')) throw new Error('旅行 aurait du etre exclu');
  if (estKanjiGroupe('勉強')) throw new Error('勉強 aurait du etre exclu');
});

essai('mot vide ou nul ne plante pas et n\'est pas un kanji groupe', () => {
  if (estKanjiGroupe('') || estKanjiGroupe(null) || estKanjiGroupe(undefined)) {
    throw new Error('attendu false pour une entree vide/nulle');
  }
});

essai('filtrerVocabParVerbe("kanji_groupe") ne garde que les mots a kanji groupes, exceptions verbe exclues', () => {
  const liste = [
    { id: 1, mot: '問題' },   // kanji groupe -> garde
    { id: 2, mot: '子供' },   // kanji groupe (kunyomi) -> garde
    { id: 3, mot: '電話' },   // exception verbe connue -> exclu
    { id: 4, mot: '泳ぐ' },   // verbe -> exclu
    { id: 5, mot: '半' },     // kanji seul -> exclu
    { id: 6, mot: '高い' }    // adjectif -i -> exclu
  ];
  const r = filtrerVocabParVerbe(liste, 'kanji_groupe');
  const mots = r.map(v => v.mot);
  if (mots.length !== 2 || !mots.includes('問題') || !mots.includes('子供')) {
    throw new Error('attendu [問題, 子供], obtenu ' + JSON.stringify(mots));
  }
});
