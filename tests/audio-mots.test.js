// Audio des mots (16/10/2026) : le script de generation doit sortir des lectures en kana sans doublon,
// et l'app doit lire le MP3 quand l'index en contient un, sinon retomber sur la voix du navigateur.
// Lancer : node tests/audio-mots.test.js
const fs = require('fs');
const R = __dirname + '/../';
const { listeMots, premiereLecture } = require(R + 'outils/generer-audio.js');
let ko = 0;
const ok = (c, m) => { if (!c) { ko++; console.log('ECHEC : ' + m); } };

for (const n of ['L0', 'L1', 'L2', 'L3']) {
  const { lectures } = listeMots(n);
  ok(lectures.length > 300, n + ' : trop peu de mots (' + lectures.length + ')');
  ok(new Set(lectures).size === lectures.length, n + ' : doublons');
  ok(lectures.every(l => /^[ぁ-ゟァ-ヿー]+$/.test(l)), n + ' : lecture hors kana');
}
ok(listeMots('L2').ignores.length === 0, 'L2 : des lectures sont ignorees : ' + listeMots('L2').ignores.join(' '));
ok(premiereLecture({ lecture: 'きょう / こんにち', mot: '今日' }) === 'きょう', 'premiere lecture');

// Comportement de lireAudio : on extrait le code de app.js et on le rejoue avec de faux objets.
const app = fs.readFileSync(R + 'app.js', 'utf8');
const a = app.indexOf('let indexAudioMots');
const b = app.indexOf("if (typeof window !== 'undefined') setTimeout(chargerIndexAudio");
const code = app.slice(a, b);
const journal = [];
function Audio(url) { this.url = url; journal.push('mp3:' + url); this.addEventListener = () => {}; this.pause = () => {}; this.play = () => Promise.resolve(); }
const fabrique = new Function('window', 'fetch', 'Audio', 'meilleureVoixJaponaise', 'SpeechSynthesisUtterance',
  code + '; return { lireAudio, fichierAudioMot, setIndex: j => { indexAudioMots = j; chargementIndexAudio = true; } };');
const synth = { cancel() {}, speak(u) { journal.push('voix:' + u.text); }, getVoices: () => [] };
const lib = fabrique({ speechSynthesis: synth }, undefined, Audio, () => null, function (t) { this.text = t; });
lib.lireAudio('みっか');
ok(journal.pop() === 'voix:みっか', 'sans index : voix du navigateur');
lib.setIndex({ 'みっか': 'みっか.mp3' });
lib.lireAudio('みっか');
ok(journal.pop() === 'mp3:/audio/mots/' + encodeURIComponent('みっか.mp3'), 'avec index : MP3');
lib.lireAudio('ほん');
ok(journal.pop() === 'voix:ほん', 'mot absent de l\'index : voix du navigateur');
lib.setIndex({ constructor: 'x' });
ok(lib.fichierAudioMot('toString') === null, 'cle heritee ignoree');

if (ko) { console.log(ko + ' echec(s)'); process.exit(1); }
console.log('audio-mots : OK');
