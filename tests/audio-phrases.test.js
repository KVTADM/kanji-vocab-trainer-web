// Audio des phrases d'exemple : le script doit sortir des textes en kana sans doublon, et l'app doit
// lire le MP3 d'une phrase quand l'index des phrases la contient, sinon retomber sur la voix du navigateur.
// Lancer : node tests/audio-phrases.test.js
const fs = require('fs');
const R = __dirname + '/../';
const { listePhrases, parlerPhrase, nomFichier } = require(R + 'outils/generer-audio-phrases.js');
let ko = 0;
const ok = (c, m) => { if (!c) { ko++; console.log('ECHEC : ' + m); } };

const l0 = listePhrases('L0');
ok(l0.length > 700, 'L0 : trop peu de phrases (' + l0.length + ')');
ok(new Set(l0.map(p => p.phrase)).size === l0.length, 'L0 : phrases en double');
ok(l0.every(p => /^[ぁ-ゟァ-ヿー、。]+$/.test(p.texte)), 'L0 : texte prononce hors kana : ' + l0.filter(p => !/^[ぁ-ゟァ-ヿー、。]+$/.test(p.texte)).map(p => p.texte).slice(0, 3).join(' '));
ok(new Set(l0.map(p => nomFichier(p.id))).size === l0.length, 'L0 : noms de fichier en double');
ok(l0.every(p => /^[A-Za-z0-9_-]+\.mp3$/.test(nomFichier(p.id))), 'L0 : nom de fichier douteux');
ok(parlerPhrase('わたしは にほんに いきたいです。') === 'わたしはにほんにいきたいです。', 'texte prononce');
ok(parlerPhrase('すごい！') === 'すごい。', 'point d\'exclamation');

const app = fs.readFileSync(R + 'app.js', 'utf8');
const a = app.indexOf('let indexAudioMots');
const b = app.indexOf("if (typeof window !== 'undefined') setTimeout(chargerIndexAudio");
const journal = [];
function Audio(url) { journal.push('mp3:' + url); this.addEventListener = () => {}; this.pause = () => {}; this.play = () => Promise.resolve(); }
const lib = new Function('window', 'fetch', 'Audio', 'meilleureVoixJaponaise', 'SpeechSynthesisUtterance',
  app.slice(a, b) + '; return { lireAudio, fichierAudioMot, set: (m, p) => { indexAudioMots = m; indexAudioPhrases = p; chargementIndexAudio = true; } };')(
  { speechSynthesis: { cancel() {}, speak(u) { journal.push('voix:' + u.text); }, getVoices: () => [] } }, undefined, Audio, () => null, function (t) { this.text = t; });
lib.set({ 'ほん': 'ほん.mp3' }, { '私は日本に行きたいです。': 'v-l0s1-w1-01-01.mp3' });
lib.lireAudio('私は日本に行きたいです。');
ok(journal.pop() === 'mp3:/audio/phrases/' + encodeURIComponent('v-l0s1-w1-01-01.mp3'), 'phrase de l\'index : MP3');
lib.lireAudio('ほん');
ok(journal.pop() === 'mp3:/audio/mots/' + encodeURIComponent('ほん.mp3'), 'mot : MP3 des mots');
lib.lireAudio('ひらがなだけ');
ok(journal.pop() === 'voix:ひらがなだけ', 'texte inconnu : voix du navigateur');
lib.set({}, null);
lib.lireAudio('私は日本に行きたいです。');
ok(journal.pop() === 'voix:私は日本に行きたいです。', 'sans index des phrases : voix du navigateur');
lib.set({}, { constructor: 'x' });
ok(lib.fichierAudioMot('toString') === null, 'cle heritee ignoree');

if (ko) { console.log(ko + ' echec(s)'); process.exit(1); }
console.log('audio-phrases : OK');
