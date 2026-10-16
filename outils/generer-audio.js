#!/usr/bin/env node
// Genere les MP3 des mots de vocabulaire avec ElevenLabs (voix Kenzo) et les range dans audio/mots/.
//
//   export ELEVENLABS_API_KEY="..."        # ta cle, a taper dans TON terminal (jamais dans un fichier ni dans un chat)
//   node outils/generer-audio.js --niveau L2 --dry-run    # compte les mots et les credits, ne genere rien
//   node outils/generer-audio.js --niveau L2 --limit 10    # petit essai sur 10 mots
//   node outils/generer-audio.js --niveau L2               # tout le niveau
//
// Options : --niveau L0|L1|L2|L3  --voix <voice_id>  --modele <model_id>  --limit N  --concurrence N  --dry-run
// Le script saute les fichiers deja presents : on peut le relancer apres une coupure sans rien payer deux fois.
// Un mot = sa premiere lecture en kana (comme le bouton audio de l'app). Doublons generes une seule fois.
// Cout : environ 1 credit par caractere. Un abonnement payant est necessaire pour utiliser l'audio publiquement.
const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const DOSSIER = path.join(RACINE, 'audio', 'mots');
const VOIX_KENZO = 'b34JylakFZPlGS0BnwyY';
const NIVEAUX = { L0: ['l0-s1', 'l0-s2', 'jlpt-n5'], L1: ['s1', 's2'], L2: ['s3', 's4'], L3: ['s5'] };

function premiereLecture(v) { return String(v.lecture || v.mot).split(/\s*[\/,]\s*/)[0].trim(); }

// Renvoie { lectures: [lecture, ...] sans doublon, ignores: [lecture, ...] non lisibles tels quels }.
function listeMots(niveau) {
  const semestres = NIVEAUX[niveau];
  if (!semestres) throw new Error('Niveau inconnu : ' + niveau + ' (L0, L1, L2 ou L3)');
  const seed = JSON.parse(fs.readFileSync(path.join(RACINE, 'seed-data.json'), 'utf8'));
  let groupes = seed.kanjiGroups, vocab = seed.vocab;
  if (semestres.includes('s5')) {
    const t = fs.readFileSync(path.join(RACINE, 's5-data.js'), 'utf8');
    const s5 = JSON.parse(t.slice(t.indexOf('window.S5_SEED') + 'window.S5_SEED'.length).replace(/^\s*=\s*/, '').replace(/;\s*$/, ''));
    groupes = s5.kanjiGroups; vocab = s5.vocab;
  }
  const sem = {}; groupes.forEach(g => { sem[g.id] = g.semesterId; });
  const vus = new Set(), lectures = [], ignores = [];
  for (const v of vocab) {
    if (!semestres.includes(sem[v.kanjiGroupId])) continue;
    const l = premiereLecture(v);
    if (!l || vus.has(l)) continue;
    vus.add(l);
    (/^[ぁ-ゟァ-ヿー]+$/.test(l) ? lectures : ignores).push(l);
  }
  return { lectures, ignores };
}
function nomFichier(lecture) { return lecture + '.mp3'; }
function lireIndex() {
  try { return JSON.parse(fs.readFileSync(path.join(DOSSIER, 'index.json'), 'utf8')); } catch (e) { return {}; }
}
function ecrireIndex(index) {
  const tri = {}; Object.keys(index).sort().forEach(k => { tri[k] = index[k]; });
  fs.writeFileSync(path.join(DOSSIER, 'index.json'), JSON.stringify(tri));
}
const attendre = ms => new Promise(r => setTimeout(r, ms));

async function genere(lecture, cle, voix, modele) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voix}?output_format=mp3_44100_64`;
  for (let essai = 1; essai <= 4; essai++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': cle, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: lecture, model_id: modele })
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const corps = (await r.text()).slice(0, 300);
    if (r.status === 429 || r.status >= 500) { await attendre(1500 * essai); continue; }
    const err = new Error('HTTP ' + r.status + ' ' + corps); err.status = r.status; err.fatal = true; throw err;
  }
  throw new Error('Echec apres 4 essais : ' + lecture);
}

async function main() {
  const a = process.argv.slice(2);
  const opt = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
  const niveau = (opt('niveau', '') || '').toUpperCase();
  const dry = a.includes('--dry-run');
  const voix = opt('voix', VOIX_KENZO), modele = opt('modele', 'eleven_v4');
  const limite = parseInt(opt('limit', '0'), 10) || Infinity;
  const conc = Math.max(1, Math.min(4, parseInt(opt('concurrence', '2'), 10) || 2));
  if (!niveau) { console.error('Indique un niveau : --niveau L2'); process.exit(1); }
  const { lectures, ignores } = listeMots(niveau);
  fs.mkdirSync(DOSSIER, { recursive: true });
  const index = lireIndex();
  const existe = l => { try { return fs.statSync(path.join(DOSSIER, nomFichier(l))).size > 0; } catch (e) { return false; } };
  const aFaire = lectures.filter(l => !existe(l));
  const credits = aFaire.reduce((s, l) => s + l.length, 0);
  console.log(`${niveau} : ${lectures.length} mots uniques, ${lectures.length - aFaire.length} deja generes, ${aFaire.length} a generer (~${credits} credits).`);
  if (ignores.length) console.log(`A voir a la main (lecture avec caracteres hors kana, ignores) : ${ignores.join(' ')}`);
  lectures.filter(existe).forEach(l => { index[l] = nomFichier(l); });
  if (dry) { ecrireIndex(index); return; }
  const cle = process.env.ELEVENLABS_API_KEY;
  if (!cle) { console.error('Definis ELEVENLABS_API_KEY dans ton terminal (export ELEVENLABS_API_KEY="...").'); process.exit(1); }
  const file = aFaire.slice(0, limite);
  let fait = 0, stop = false;
  async function ouvrier() {
    while (!stop && file.length) {
      const l = file.shift();
      try {
        const mp3 = await genere(l, cle, voix, modele);
        const chemin = path.join(DOSSIER, nomFichier(l));
        fs.writeFileSync(chemin + '.tmp', mp3); fs.renameSync(chemin + '.tmp', chemin);
        index[l] = nomFichier(l); fait++;
        if (fait % 25 === 0) { ecrireIndex(index); console.log(`  ${fait} / ${Math.min(aFaire.length, limite)}`); }
      } catch (e) {
        console.error(`Erreur sur "${l}" : ${e.message}`);
        if (e.fatal) { stop = true; console.error('Arret (cle, quota ou parametre refuse). Les fichiers deja faits sont gardes : relance pour reprendre.'); }
      }
    }
  }
  await Promise.all(Array.from({ length: conc }, ouvrier));
  ecrireIndex(index);
  console.log(`Termine : ${fait} fichiers generes. Index : audio/mots/index.json (${Object.keys(index).length} mots).`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { listeMots, premiereLecture, nomFichier };
