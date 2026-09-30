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

essai('corrige la lecture de 大学の入学試験 (の manquant, S2 semaine 8) sur un compte existant', async () => {
  fakeStockage.clear();
  const base = donneeDeBase();
  base.vocab.push({ id: 'v-mrhvk4v7q1w2i', kanjiGroupId: 'kg-test-s3-a', mot: '大学の入学試験', lecture: 'だいがくにゅうがくしけん', sens: 'x' });
  fakeStockage.set('data', base);
  const data = await window.api.loadData();
  const mot = data.vocab.find(v => v.id === 'v-mrhvk4v7q1w2i');
  if (mot.lecture !== 'だいがくのにゅうがくしけん') throw new Error('lecture non corrigee : ' + mot.lecture);
});

essai('corrige 己自身 (おのれじしん) et 試験に落ちる (しけんにおちる) sur un compte existant (Jisho)', async () => {
  fakeStockage.clear();
  const base = donneeDeBase();
  base.vocab.push({ id: 'v-mrhvk4uuo7iw5', kanjiGroupId: 'kg-test-s3-a', mot: '己自身', lecture: 'こじしん', sens: 'x' });
  base.vocab.push({ id: 'v-mrhvk4v76n0qf', kanjiGroupId: 'kg-test-s3-a', mot: '試験に落ちる', lecture: 'しけいにおちる', sens: 'x' });
  fakeStockage.set('data', base);
  const data = await window.api.loadData();
  const l = id => data.vocab.find(v => v.id === id).lecture;
  if (l('v-mrhvk4uuo7iw5') !== 'おのれじしん' || l('v-mrhvk4v76n0qf') !== 'しけんにおちる') throw new Error(l('v-mrhvk4uuo7iw5') + ' / ' + l('v-mrhvk4v76n0qf'));
});

essai('corrige 吸血鬼 (きゅうけつき) et ajoute しんたい à 身体 sur un compte existant (Lucien, 29/09/2026)', async () => {
  fakeStockage.clear();
  const base = donneeDeBase();
  base.vocab.push({ id: 'v-mrhvk4v51mgny', kanjiGroupId: 'kg-test-s3-a', mot: '吸血鬼', lecture: 'きゅうつき', sens: 'x' });
  base.vocab.push({ id: 'v-mrhvk4v3086o6', kanjiGroupId: 'kg-test-s3-a', mot: '身体', lecture: 'からだ', sens: 'x' });
  fakeStockage.set('data', base);
  const data = await window.api.loadData();
  const l = id => data.vocab.find(v => v.id === id).lecture;
  if (l('v-mrhvk4v51mgny') !== 'きゅうけつき' || l('v-mrhvk4v3086o6') !== 'からだ / しんたい') throw new Error(l('v-mrhvk4v51mgny') + ' / ' + l('v-mrhvk4v3086o6'));
});

essai('corrige la lecture kun de 港 (みなo -> みなと) sur un compte existant', async () => {
  fakeStockage.clear();
  const base = donneeDeBase();
  base.kanjiGroups.push({ id: 'kg-mrhvk4v5u55ww', semesterId: 's2', week: 7, kanji: '港', titre: 'Port', onyomi: 'コウ', kunyomi: 'みなo' });
  fakeStockage.set('data', base);
  const data = await window.api.loadData();
  const g = data.kanjiGroups.find(x => x.id === 'kg-mrhvk4v5u55ww');
  if (g.kunyomi !== 'みなと') throw new Error(g.kunyomi);
});

essai('pose les precisions "compteur" et "lecture particuliere" sans ecraser un indice existant (30/09/2026)', async () => {
  fakeStockage.clear();
  const base = donneeDeBase();
  base.vocab.push({ id: 'v-l0s2-w2-10-03', kanjiGroupId: 'kg-test-s3-a', mot: '一台', lecture: 'いちだい', sens: 'x' });
  base.vocab.push({ id: 'v-l0s1-w2-01-06', kanjiGroupId: 'kg-test-s3-a', mot: '一人', lecture: 'ひとり', sens: 'x' });
  base.vocab.push({ id: 'v-mrhvk4uye3rji', kanjiGroupId: 'kg-test-s3-a', mot: '冊', lecture: 'さつ', sens: 'x', indice: 'lecture-speciale' });
  base.vocab.push({ id: 'v-autre-mot', kanjiGroupId: 'kg-test-s3-a', mot: '猫', lecture: 'ねこ', sens: 'x' });
  fakeStockage.set('data', base);
  const data = await window.api.loadData();
  const i = id => data.vocab.find(v => v.id === id).indice;
  if (i('v-l0s2-w2-10-03') !== 'compteur') throw new Error('一台 : ' + i('v-l0s2-w2-10-03'));
  if (i('v-v1eyb2f0swc4y') !== 'chiffre') throw new Error('十 : ' + i('v-v1eyb2f0swc4y'));
  if (i('v-l0s1-w5-05-05') !== 'compteur') throw new Error('とお : ' + i('v-l0s1-w5-05-05'));
  if (i('v-l0s1-w2-01-06') !== 'lecture-speciale') throw new Error('一人 : ' + i('v-l0s1-w2-01-06'));
  if (i('v-mrhvk4uye3rji') !== 'lecture-speciale') throw new Error('indice existant ecrase');
  if (i('v-autre-mot') !== undefined) throw new Error('un mot non liste ne doit pas avoir d\'indice');
});
