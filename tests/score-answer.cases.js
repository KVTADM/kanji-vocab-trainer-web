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

essai('un sens a alternatives separees par une virgule fonctionne comme avec "/" (signale par Paul, 28/09/2026, semaine 8 S2)', () => {
  const r1 = scoreAnswer('matin', 'matin, aube');
  if (r1.pct !== 1) throw new Error('attendu 100% sur la 1ere alternative, obtenu ' + JSON.stringify(r1));
  const r2 = scoreAnswer('aube', 'matin, aube');
  if (r2.pct !== 1) throw new Error('attendu 100% sur la 2eme alternative, obtenu ' + JSON.stringify(r2));
});

essai('virgule et "/" peuvent se combiner dans le meme champ sans casser les alternatives', () => {
  const r = scoreAnswer('かど', 'もん / かど, porte');
  if (r.pct !== 1) throw new Error('attendu 100%, obtenu ' + JSON.stringify(r));
});

// Signale par Lucien le 29/09/2026 (boite a problemes).
essai('la ponctuation attendue (！) n\'a pas a etre tapee : あぶない = 危ない！ a 100%', () => {
  const r = scoreAnswer('あぶない', 'あぶない！');
  if (r.pct !== 1) throw new Error('attendu 100%, obtenu ' + JSON.stringify(r));
});

essai('la ponctuation tapee en trop est ignoree aussi (symetrique)', () => {
  const r = scoreAnswer('あぶない!', 'あぶない');
  if (r.pct !== 1) throw new Error('attendu 100%, obtenu ' + JSON.stringify(r));
});

essai('chiffres normaux tapes pour des chiffres pleine chasse : とうきょうの23く = とうきょうの２３く', () => {
  const r = scoreAnswer('とうきょうの23く', 'とうきょうの２３く');
  if (r.pct !== 1) throw new Error('attendu 100%, obtenu ' + JSON.stringify(r));
});

essai('le ー des katakana n\'est pas pris pour de la ponctuation', () => {
  const r = scoreAnswer('すーぱー', 'スーパー');
  if (r.pct !== 1) throw new Error('attendu 100% (ー conserve), obtenu ' + JSON.stringify(r));
  const r2 = scoreAnswer('すぱ', 'スーパー');
  if (r2.pct >= 1) throw new Error('un ー manquant ne doit pas donner 100%');
});

essai('une vraie faute reste penalisee malgre la ponctuation retiree', () => {
  const r = scoreAnswer('あぶなし', 'あぶない！');
  if (r.pct >= 1) throw new Error('faute non detectee : ' + JSON.stringify(r));
});

essai('une lecture faite uniquement de symboles garde sa version brute', () => {
  const r = scoreAnswer('！', '！');
  if (r.pct !== 1) throw new Error('attendu 100%, obtenu ' + JSON.stringify(r));
});

essai('身体 accepte しんたい ET からだ (lectures multiples)', () => {
  if (scoreAnswer('しんたい', 'からだ / しんたい').pct !== 1) throw new Error('しんたい refuse');
  if (scoreAnswer('からだ', 'からだ / しんたい').pct !== 1) throw new Error('からだ refuse');
});
