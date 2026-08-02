// Scénarios de profils.js, évalués dans la même portée que la source.
// Lancer : node tests/profils.test.js

essai("sans photo, l'avatar est l'initiale du pseudo", () => {
  const html = avatarHtml('u1', 'Polus', 32);
  if (!html.includes('avatar-initiale')) throw new Error('pas de secours');
  if (!html.includes('>P<')) throw new Error('initiale absente : ' + html);
});

essai('la couleur est stable pour un même pseudo', () => {
  const a = teinteDe('Polus'), b = teinteDe('Polus'), c = teinteDe('kiwitest');
  if (a !== b) throw new Error('couleur instable');
  if (a === c) throw new Error('deux pseudos partagent la même couleur');
});

essai('un pseudo vide ne casse pas l\'avatar', () => {
  const html = avatarHtml('u9', '', 24);
  if (!html.includes('>?<')) throw new Error('pas de repli sur « ? » : ' + html);
});

essai('avec une photo, un secours est prévu si elle ne charge pas', () => {
  profilsCache.set('u2', { id: 'u2', pseudo: 'Hana', avatar_url: 'https://exemple/a.png', niveau: 'n3', bio: '' });
  const html = avatarHtml('u2', 'Hana', 48);
  if (!html.includes('avatar-photo')) throw new Error('la photo manque');
  if (!html.includes('onerror')) throw new Error('aucun secours en cas d\'image cassée');
  if (!html.includes('data-secours')) throw new Error('le secours n\'est pas embarqué');
});

essai('le pseudo affiché vient du profil, pas du paramètre', () => {
  const html = auteurHtml('u2', 'ANCIEN PSEUDO', 24);
  if (!html.includes('Hana')) throw new Error('le profil en cache est ignoré');
  if (html.includes('ANCIEN PSEUDO')) throw new Error('un pseudo périmé est affiché');
});

essai('un pseudo contenant du HTML est échappé', () => {
  const html = avatarHtml('u3', '<img src=x onerror=alert(1)>', 32);
  if (html.includes('<img src=x')) throw new Error('injection possible : ' + html);
});

essai('les niveaux ont tous un libellé', () => {
  const codes = ['', 'debutant', 'n5', 'n4', 'n3', 'n2', 'n1', 'natif'];
  codes.forEach(c => {
    const lib = libelleNiveau(c);
    if (!lib || lib === 'Non précisé' && c !== '') throw new Error('libellé manquant pour ' + c);
  });
  if (libelleNiveau('expert') !== 'Non précisé') throw new Error('un code inconnu devrait retomber sur « Non précisé »');
});

