// Scénarios de creation.js. Concaténés au harnais avant évaluation.

essai('un kanji sans mot rattaché ne peut pas être choisi', () => {
  // Un quiz de vocabulaire sur un kanji sans vocabulaire ne pose aucune
  // question : le proposer serait promettre un deck qui ne marche pas.
  DB = baseExemple();
  const banque = creaBanque();
  if (banque.some(g => g.id === 'vide')) throw new Error('un kanji sans mot est proposé');
  if (banque.length !== 4) throw new Error('banque = ' + banque.length + ' au lieu de 4');
});

essai('la banque compte les mots de chaque kanji', () => {
  DB = baseExemple();
  const banque = creaBanque();
  const soleil = banque.find(g => g.kanji === '日');
  if (soleil.nbMots !== 2) throw new Error('日 devrait avoir 2 mots, il en a ' + soleil.nbMots);
});

essai('« ce que je rate » se fonde sur les vrais scores, pas sur une estimation', () => {
  DB = baseExemple();
  const durs = creaDifficiles(creaBanque());
  // s1 semaine 1 est à 40 %, jlpt-n5 semaine 1 à 60 % : les deux sont sous
  // 80 %. s1 semaine 2 est à 95 %, elle ne doit pas apparaître.
  const kanjis = durs.map(g => g.kanji);
  if (kanjis.includes('火')) throw new Error('une semaine réussie à 95 % est proposée comme difficile');
  if (!kanjis.includes('日') || !kanjis.includes('水')) throw new Error('kanji ratés manquants : ' + kanjis);
  // Du plus raté au moins raté : sinon la liste ne sert à rien.
  if (durs[0].pct > durs[durs.length - 1].pct) throw new Error('mauvais ordre de difficulté');
});

essai('sans aucun score, « ce que je rate » ne propose rien plutôt que tout', () => {
  DB = baseExemple();
  DB.scores = {};
  const durs = creaDifficiles(creaBanque());
  if (durs.length) throw new Error('des kanji sont dits « ratés » sans le moindre score');
});

essai('créer un deck copie les mots au lieu de les partager', () => {
  DB = baseExemple();
  const avantVocab = DB.vocab.length;
  window.kvtCreation.reinitialiser();
  const etat = window.kvtCreation.etat();
  etat.creaChoisis.add('a');
  etat.creaChoisis.add('b');
  // On passe par les mêmes variables que la vue : creerDeckLocal lit l'état
  // du module, pas des arguments.
  eval("creaChoisis = new Set(['a','b']); creaNom = 'Mes durs'; creaParSemaine = 0;");
  if (!creerDeckLocal()) throw new Error('création refusée : ' + (creaMessage && creaMessage.texte));

  const sem = DB.settings.semesters.find(s => s.label === 'Mes durs');
  if (!sem) throw new Error('le semestre créé est introuvable');
  const groupes = DB.kanjiGroups.filter(g => g.semesterId === sem.id);
  if (groupes.length !== 2) throw new Error('kanji copiés : ' + groupes.length);

  // Les mots doivent être de NOUVELLES lignes : modifier le deck créé ne doit
  // pas toucher le semestre d'origine, et le supprimer ne doit pas le vider.
  const idsCopies = new Set(groupes.map(g => g.id));
  const motsCopies = DB.vocab.filter(v => idsCopies.has(v.kanjiGroupId));
  if (motsCopies.length !== 3) throw new Error('mots copiés : ' + motsCopies.length);
  if (DB.vocab.length !== avantVocab + 3) throw new Error('les mots d\'origine ont été déplacés');
  const origine = DB.vocab.filter(v => v.kanjiGroupId === 'a');
  if (origine.length !== 2) throw new Error('le semestre source a été modifié');
});

essai('la répartition découpe en semaines et n\'en oublie aucune', () => {
  DB = baseExemple();
  eval("creaChoisis = new Set(['a','b','c','d']); creaNom = 'Quatre'; creaParSemaine = 3;");
  if (!creerDeckLocal()) throw new Error('création refusée');
  const sem = DB.settings.semesters.find(s => s.label === 'Quatre');
  // 4 kanji par paquets de 3 : deux semaines, pas une.
  if (sem.weeks !== 2) throw new Error('semaines = ' + sem.weeks);
  const groupes = DB.kanjiGroups.filter(g => g.semesterId === sem.id);
  const semaines = new Set(groupes.map(g => g.week));
  if (semaines.size !== 2) throw new Error('les kanji ne sont pas répartis : ' + [...semaines]);
  if (groupes.length !== 4) throw new Error('un kanji a été perdu : ' + groupes.length);
});

essai('« tout d\'un bloc » met vraiment tout en semaine 1', () => {
  DB = baseExemple();
  eval("creaChoisis = new Set(['a','b','c']); creaNom = 'Bloc'; creaParSemaine = 0;");
  creerDeckLocal();
  const sem = DB.settings.semesters.find(s => s.label === 'Bloc');
  const groupes = DB.kanjiGroups.filter(g => g.semesterId === sem.id);
  if (sem.weeks !== 1) throw new Error('semaines = ' + sem.weeks);
  if (groupes.some(g => g.week !== 1)) throw new Error('une semaine autre que 1 est apparue');
});

essai('un deck sans nom, sans kanji, ou au nom déjà pris est refusé', () => {
  DB = baseExemple();
  eval("creaChoisis = new Set(['a']); creaNom = 'ab'; creaParSemaine = 0;");
  if (creerDeckLocal()) throw new Error('un nom de deux caractères a été accepté');

  eval("creaChoisis = new Set(); creaNom = 'Sans kanji';");
  if (creerDeckLocal()) throw new Error('un deck vide a été accepté');

  eval("creaChoisis = new Set(['a']); creaNom = 'Semestre 1';");
  if (creerDeckLocal()) throw new Error('un nom déjà utilisé a été accepté');
  if (!/déjà un deck/.test(creaMessage.texte)) throw new Error('message peu clair : ' + creaMessage.texte);
});

essai('la recherche trouve par caractère, par sens et par semestre', () => {
  DB = baseExemple();
  eval("creaSource = 'recherche'; creaRecherche = '日';");
  if (!creaListeAffichee().some(g => g.kanji === '日')) throw new Error('recherche par caractère cassée');
  eval("creaRecherche = 'lune';");
  if (!creaListeAffichee().some(g => g.kanji === '月')) throw new Error('recherche par sens cassée');
  eval("creaRecherche = 'JLPT';");
  if (!creaListeAffichee().some(g => g.kanji === '水')) throw new Error('recherche par semestre cassée');
  // Une recherche vide ne doit pas deverser toute la banque d'un coup.
  eval("creaRecherche = '   ';");
  if (creaListeAffichee().length) throw new Error('une recherche vide affiche tout');
});

essai('le deck créé est révisable comme les autres', () => {
  DB = baseExemple();
  eval("creaChoisis = new Set(['a','b']); creaNom = 'Revisable'; creaParSemaine = 0;");
  creerDeckLocal();
  const sem = DB.settings.semesters.find(s => s.label === 'Revisable');
  // Meme forme qu'un semestre normal : un id, un libelle, un nombre de
  // semaines. C'est ce qui le rend utilisable par le quiz sans cas particulier.
  if (!sem.id || !sem.label || !sem.weeks) throw new Error('semestre incomplet : ' + JSON.stringify(sem));
  const groupes = DB.kanjiGroups.filter(g => g.semesterId === sem.id);
  if (groupes.some(g => !g.kanji)) throw new Error('un kanji copié a perdu son caractère');
  const ids = new Set(groupes.map(g => g.id));
  if (!DB.vocab.some(v => ids.has(v.kanjiGroupId))) throw new Error('aucun mot rattaché');
});
