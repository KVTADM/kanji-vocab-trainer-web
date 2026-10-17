#!/usr/bin/env node
// Genere les MP3 des phrases d'exemple (meme voix Kenzo que les mots) et les range dans audio/phrases/.
//
//   export ELEVENLABS_API_KEY="..."        # ta cle, a taper dans TON terminal (jamais dans un fichier ni dans un chat)
//   node outils/generer-audio-phrases.js --niveau L0 --dry-run   # compte les phrases et les credits, ne genere rien
//   node outils/generer-audio-phrases.js --niveau L0 --limit 10   # petit essai sur 10 phrases
//   node outils/generer-audio-phrases.js --niveau L0              # toutes les phrases du niveau
//
// Options : --niveau L0|L1|L2|L3  --voix <voice_id>  --modele <model_id>  --limit N  --concurrence N  --dry-run
// La voix lit la LECTURE en kana de la phrase (pas les kanji : pas de risque de mauvaise lecture).
// L'index relie le texte de la phrase tel qu'affiche dans l'app (avec kanji) au fichier. Reprise possible :
// les fichiers deja presents ne sont ni regeneres ni repayes. Cout : environ 1 credit par caractere.
const fs = require('fs');
const path = require('path');
const { genere, demanderCle, VOIX_KENZO } = require('./generer-audio.js');
const RACINE = path.join(__dirname, '..');
const DOSSIER = path.join(RACINE, 'audio', 'phrases');
const FICHIERS = { L0: 'phrases-l0-data.js', L1: 'phrases-l1-data.js', L2: 'phrases-l2-data.js', L3: 'phrases-l3-data.js' };

// Texte reellement prononce : la lecture, sans espaces ni points d'exclamation/interrogation superflus ; on garde 、 et 。 (pauses).
function parlerPhrase(lecture) { return String(lecture).replace(/[\s〜～「」『』]/g, '').replace(/[!！?？]/g, '。'); }
function nomFichier(id) { return id.replace(/[^A-Za-z0-9_-]/g, '_') + '.mp3'; }
// Renvoie [{ id, phrase, texte }] sans doublon de phrase.
function listePhrases(niveau) {
  const f = FICHIERS[niveau];
  if (!f) throw new Error('Niveau inconnu : ' + niveau + ' (L0, L1, L2 ou L3)');
  const t = fs.readFileSync(path.join(RACINE, f), 'utf8');
  const donnees = JSON.parse(t.slice(t.indexOf('{"', t.indexOf('KVT_PHRASES')), t.lastIndexOf('}') + 1));
  const vus = new Set(), liste = [];
  for (const [id, p] of Object.entries(donnees)) {
    if (!p || !p[0] || !p[1] || vus.has(p[0])) continue;
    vus.add(p[0]);
    liste.push({ id, phrase: p[0], texte: parlerPhrase(p[1]) });
  }
  return liste;
}
function lireIndex() { try { return JSON.parse(fs.readFileSync(path.join(DOSSIER, 'index.json'), 'utf8')); } catch (e) { return {}; } }
function ecrireIndex(index) {
  const tri = {}; Object.keys(index).sort().forEach(k => { tri[k] = index[k]; });
  fs.writeFileSync(path.join(DOSSIER, 'index.json'), JSON.stringify(tri));
}

async function main() {
  const a = process.argv.slice(2);
  const opt = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
  const niveau = (opt('niveau', '') || '').toUpperCase();
  const dry = a.includes('--dry-run');
  const voix = opt('voix', VOIX_KENZO), modele = opt('modele', 'eleven_v4');
  const limite = parseInt(opt('limit', '0'), 10) || Infinity;
  const conc = Math.max(1, Math.min(4, parseInt(opt('concurrence', '2'), 10) || 2));
  if (!niveau) { console.error('Indique un niveau : --niveau L0'); process.exit(1); }
  const liste = listePhrases(niveau);
  fs.mkdirSync(DOSSIER, { recursive: true });
  const index = lireIndex();
  const existe = p => { try { return fs.statSync(path.join(DOSSIER, nomFichier(p.id))).size > 0; } catch (e) { return false; } };
  const aFaire = liste.filter(p => !existe(p));
  const credits = aFaire.reduce((s, p) => s + p.texte.length, 0);
  console.log(`${niveau} : ${liste.length} phrases uniques, ${liste.length - aFaire.length} deja generees, ${aFaire.length} a generer (~${credits} credits).`);
  liste.filter(existe).forEach(p => { index[p.phrase] = nomFichier(p.id); });
  if (dry) { ecrireIndex(index); return; }
  const cle = (process.env.ELEVENLABS_API_KEY || '').trim() || await demanderCle();
  if (!/^sk_[A-Za-z0-9_-]{10,}$/.test(cle)) { console.error('Cle invalide : une cle ElevenLabs commence par sk_. Rien n\'a ete envoye.'); process.exit(1); }
  const file = aFaire.slice(0, limite);
  const total = file.length;
  let fait = 0, stop = false;
  async function ouvrier() {
    while (!stop && file.length) {
      const p = file.shift();
      try {
        const mp3 = await genere(p.texte, cle, voix, modele, true);
        const chemin = path.join(DOSSIER, nomFichier(p.id));
        fs.writeFileSync(chemin + '.tmp', mp3); fs.renameSync(chemin + '.tmp', chemin);
        index[p.phrase] = nomFichier(p.id); fait++;
        if (fait % 25 === 0) { ecrireIndex(index); console.log(`  ${fait} / ${total}`); }
      } catch (e) {
        console.error(`Erreur sur "${p.phrase}" : ${e.message}`);
        if (e.fatal) { stop = true; console.error('Arret (cle, quota ou parametre refuse). Les fichiers deja faits sont gardes : relance pour reprendre.'); }
      }
    }
  }
  await Promise.all(Array.from({ length: conc }, ouvrier));
  ecrireIndex(index);
  console.log(`Termine : ${fait} fichiers generes. Index : audio/phrases/index.json (${Object.keys(index).length} phrases).`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { listePhrases, parlerPhrase, nomFichier };
