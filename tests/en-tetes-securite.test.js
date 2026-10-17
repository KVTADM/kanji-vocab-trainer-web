// Garde-fou : les en-têtes de sécurité restent déclarés dans netlify.toml
// (ajoutés le 17/10/2026). À lancer depuis la racine : node tests/en-tetes-securite.test.js
const fs = require('fs');
const path = require('path');
const toml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');
const attendus = ['X-Content-Type-Options = "nosniff"', 'X-Frame-Options = "SAMEORIGIN"', 'Referrer-Policy =', 'Permissions-Policy ='];
let ko = 0;
for (const a of attendus) {
  const ok = toml.includes(a);
  console.log((ok ? 'OK    ' : 'ECHEC ') + a);
  if (!ok) ko++;
}
const global = /\[\[headers\]\]\s*\n\s*for = "\/\*"/.test(toml);
console.log((global ? 'OK    ' : 'ECHEC ') + 'règle appliquée à /*');
if (!global) ko++;
process.exit(ko ? 1 : 0);
