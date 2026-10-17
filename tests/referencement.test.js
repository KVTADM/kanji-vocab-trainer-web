// Garde-fou référencement (17/10/2026) : chaque page publique a un titre, une
// description, une adresse canonique, une image de partage et des balises
// Open Graph / Twitter. À lancer depuis la racine : node tests/referencement.test.js
const fs = require('fs');
const path = require('path');
const racine = path.join(__dirname, '..');
const pages = ['app', 'a-propos', 'faq', 'contact', 'l-idee', 'confidentialite', 'signaler', 'regles-de-publication', 'blog']
  .concat(fs.readdirSync(path.join(racine, 'blog')).filter((d) => fs.existsSync(path.join(racine, 'blog', d, 'index.html'))).map((d) => 'blog/' + d))
  .map((d) => d + '/index.html');
let ko = 0;
const verifie = (nom, ok) => { console.log((ok ? 'OK    ' : 'ECHEC ') + nom); if (!ok) ko++; };
verifie('image de partage présente (icons/og-image.png)', fs.existsSync(path.join(racine, 'icons', 'og-image.png')));
for (const p of pages) {
  const s = fs.readFileSync(path.join(racine, p), 'utf8');
  const manque = [];
  if (!/<title>[^<]{10,}<\/title>/.test(s)) manque.push('title');
  if (!/<meta name="description" content="[^"]{50,}"/.test(s)) manque.push('description');
  if (!/<link rel="canonical" href="https:\/\/kvtkanji\.app/.test(s)) manque.push('canonical');
  for (const t of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card']) if (!s.includes(t)) manque.push(t);
  verifie(p + (manque.length ? ' — manque : ' + manque.join(', ') : ''), manque.length === 0);
}
const faq = fs.readFileSync(path.join(racine, 'faq/index.html'), 'utf8');
verifie('FAQ : données structurées FAQPage', /"@type":\s*"FAQPage"/.test(faq));
const sm = fs.readFileSync(path.join(racine, 'sitemap.xml'), 'utf8');
verifie('sitemap : toutes les adresses en https du site', (sm.match(/<loc>(.*?)<\/loc>/g) || []).every((l) => l.includes('https://kvtkanji.app')));
process.exit(ko ? 1 : 0);
