essai('reparerGroupesManquants restaure un groupe de kanji manquant (S3) et son vocabulaire', async () => {
  fakeStockage.clear();
  fakeStockage.set('data', donneeDeBase());
  const data = await window.api.loadData();
  const groupe = data.kanjiGroups.find(g => g.id === 'kg-test-s3-b');
  if (!groupe) throw new Error('le groupe manquant kg-test-s3-b n\'a pas ete restaure');
  if (groupe.kanji !== '柔') throw new Error('le groupe restaure ne correspond pas au seed : ' + JSON.stringify(groupe));
  const mot = data.vocab.find(v => v.id === 'v-test-b1');
  if (!mot) throw new Error('le vocabulaire du groupe restaure (v-test-b1) est absent');
  if (mot.mot !== '柔らかい') throw new Error('le mot restaure ne correspond pas au seed : ' + JSON.stringify(mot));
});

essai('ne duplique jamais un groupe deja present, meme apres plusieurs chargements', async () => {
  fakeStockage.clear();
  fakeStockage.set('data', donneeDeBase());
  await window.api.loadData();
  const data = await window.api.loadData(); // deuxieme chargement sur le meme stockage
  const occurrencesA = data.kanjiGroups.filter(g => g.id === 'kg-test-s3-a').length;
  const occurrencesB = data.kanjiGroups.filter(g => g.id === 'kg-test-s3-b').length;
  if (occurrencesA !== 1) throw new Error('kg-test-s3-a (deja present) a ete duplique : ' + occurrencesA + ' occurrence(s)');
  if (occurrencesB !== 1) throw new Error('kg-test-s3-b (restaure) a ete duplique : ' + occurrencesB + ' occurrence(s)');
  const motsA = data.vocab.filter(v => v.id === 'v-test-a1').length;
  const motsB = data.vocab.filter(v => v.id === 'v-test-b1').length;
  if (motsA !== 1 || motsB !== 1) throw new Error('le vocabulaire a ete duplique (a=' + motsA + ', b=' + motsB + ')');
});

essai('ne restaure jamais un groupe hors du perimetre reparable (ex. jlpt-n5)', async () => {
  fakeStockage.clear();
  fakeStockage.set('data', donneeDeBase());
  const data = await window.api.loadData();
  const groupe = data.kanjiGroups.find(g => g.id === 'kg-test-jlpt');
  if (groupe) throw new Error('kg-test-jlpt (jlpt-n5, hors perimetre) a ete restaure a tort par reparerGroupesManquants');
  const mot = data.vocab.find(v => v.id === 'v-test-jlpt1');
  if (mot) throw new Error('v-test-jlpt1 (jlpt-n5, hors perimetre) a ete restaure a tort par reparerGroupesManquants');
});

essai('fonctionne encore normalement si /seed-data.json est injoignable (hors ligne)', async () => {
  fakeStockage.clear();
  fakeStockage.set('data', donneeDeBase());
  const fetchOriginal = global.fetch;
  global.fetch = async () => { throw new Error('reseau indisponible (simule)'); };
  try {
    const data = await window.api.loadData();
    // Le chargement ne doit jamais planter ni perdre les donnees existantes,
    // meme si la reparation elle-meme echoue silencieusement.
    if (!data.kanjiGroups.some(g => g.id === 'kg-test-s3-a')) {
      throw new Error('les donnees existantes ont ete perdues alors que le reseau etait simplement indisponible');
    }
  } finally {
    global.fetch = fetchOriginal;
  }
});
