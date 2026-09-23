// Scénarios pour scoreAnswer() / similarity() : notation du quiz
// vocabulaire, avec le cas particulier des mots à plusieurs lectures
// valables séparées par "/" (ex. 門 -> "もん / かど", 09/09/2026).

DB = { settings: { pointsPerWord: 10 } };

essai('une lecture unique, réponse exacte, donne 100%', () => {
  const r = scoreAnswer('ねこ', 'ねこ');
  if (r.pct !== 1) throw new Error('attendu 100%, obtenu ' + JSON.stringify(r));
});

essai('une lecture unique, mauvaise réponse, donne 0%', () => {
  const r = scoreAnswer('いぬ', 'ねこ');
  if (r.pct !== 0) throw new Error('attendu 0%, obtenu ' + JSON.stringify(r));
});

essai('門 : "もん" (première alternative) donne 100%', () => {
  const r = scoreAnswer('もん', 'もん / かど');
  if (r.pct !== 1) throw new Error('attendu 100%, obtenu ' + JSON.stringify(r));
});

essai('門 : "かど" (deuxième alternative) donne AUSSI 100%', () => {
  const r = scoreAnswer('かど', 'もん / かど');
  if (r.pct !== 1) throw new Error('attendu 100%, obtenu ' + JSON.stringify(r));
});

essai('門 : une réponse fausse reste à 0%, pas de faux-positif', () => {
  const r = scoreAnswer('ねこ', 'もん / かど');
  if (r.pct !== 0) throw new Error('attendu 0%, obtenu ' + JSON.stringify(r));
});

essai('mot à 3 alternatives : la dernière compte aussi', () => {
  const r = scoreAnswer('さどう', 'ちゃどう / さどう');
  if (r.pct !== 1) throw new Error('attendu 100%, obtenu ' + JSON.stringify(r));
});

essai('scoreAnswer renvoie des points cohérents avec le barème', () => {
  const r = scoreAnswer('もん', 'もん / かど');
  if (r.points !== 10) throw new Error('attendu 10 points, obtenu ' + JSON.stringify(r));
});

essai('les espaces decoratifs entre mots ne penalisent pas une reponse juste (signale par Paul, 23/09/2026)', () => {
  const r1 = scoreAnswer('ねむりのもりのびじょ', 'ねむり の もり の びじょ');
  if (r1.pct !== 1) throw new Error('attendu 100%, obtenu ' + JSON.stringify(r1));
  const r2 = scoreAnswer('たいおんをはかる', 'たいおん を はかる');
  if (r2.pct !== 1) throw new Error('attendu 100%, obtenu ' + JSON.stringify(r2));
});

essai('une vraie faute reste penalisee meme avec des espaces decoratifs des deux cotes', () => {
  const r = scoreAnswer('ねむりのもりのびじよ', 'ねむり の もり の びじょ'); // びじよ au lieu de びじょ
  if (r.pct >= 1) throw new Error('une faute reelle ne devrait pas donner 100% : ' + JSON.stringify(r));
});
