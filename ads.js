// ============================================================
// Pubs (Google AdSense) + bandeau de consentement cookies (RGPD).
//
// Principes :
// - Aucune pub pour les comptes Pro (ni pour les visiteurs qui ont
//   coché "Pro" — voir kvtShouldShowAds, basé sur window.accountUser).
// - Aucune requête publicitaire (donc aucun cookie pub) tant que
//   l'utilisateur n'a pas explicitement accepté le bandeau cookies.
//   Le script de base AdSense chargé dans <head> de index.html sert
//   uniquement à la validation du site par Google — il ne diffuse rien
//   tant qu'aucun bloc <ins class="adsbygoogle"> n'est inséré et poussé.
// - Le choix (accepté/refusé) est mémorisé dans localStorage : le
//   bandeau ne réapparaît pas à chaque visite.
// ============================================================

const KVT_ADSENSE_CLIENT = 'ca-pub-8318848112615285';

// À remplacer par le vrai ID d'emplacement une fois créé dans AdSense
// (menu Annonces > Par emplacement > Créer un bloc d'annonces), une
// fois le site validé par Google. Tant que c'est ce placeholder, aucun
// <ins> n'est inséré (voir renderAllAdSlots) pour éviter d'envoyer des
// requêtes invalides à Google.
const KVT_AD_SLOT = 'REMPLACER_PAR_ID_EMPLACEMENT';

// --- Adsterra (bannière classique, format iframe uniquement) ---------
// À remplir une fois le site validé sur Adsterra (Sites web > Ajouter
// une zone publicitaire > Banner). Adsterra donne un code du type :
//   atOptions = {'key':'ABC123','format':'iframe','height':90,'width':728,'params':{}};
//   <script src="//www.exemple-adsterra.com/ABC123/invoke.js">
// Reporter ici la clé et l'hôte exacts du code fourni, un bloc par taille
// (728x90 pour ordinateur, 320x50 pour mobile). Tant que la clé est le
// placeholder, rien n'est chargé.
// JAMAIS de popunder, push ni interstitiel : uniquement ce bandeau.
const KVT_ADSTERRA_PLACEHOLDER = 'REMPLACER_PAR_CLE_ADSTERRA';
const KVT_ADSTERRA_BANNIERES = [
  { largeur: 728, hauteur: 90, cle: KVT_ADSTERRA_PLACEHOLDER, hote: 'REMPLACER_PAR_HOTE_ADSTERRA' },
  { largeur: 320, hauteur: 50, cle: KVT_ADSTERRA_PLACEHOLDER, hote: 'REMPLACER_PAR_HOTE_ADSTERRA' }
];

// Choisit la plus grande bannière configurée qui tient dans la largeur
// disponible (null si aucune n'est configurée ou si elle ne tient pas).
function kvtChoisirBanniere(largeurDispo, bannieres) {
  const liste = (bannieres || KVT_ADSTERRA_BANNIERES)
    .filter(b => b && b.cle && b.cle !== KVT_ADSTERRA_PLACEHOLDER
      && /^[A-Za-z0-9]+$/.test(b.cle)
      && b.hote && /^[A-Za-z0-9.-]+$/.test(b.hote) && !/^REMPLACER/.test(b.hote)
      && b.largeur <= largeurDispo)
    .sort((a, b) => b.largeur - a.largeur);
  return liste[0] || null;
}

// Document HTML de l'iframe : l'annonce utilise document.write, donc elle
// doit vivre dans sa propre page.
function kvtBanniereSrcdoc(b) {
  return '<!doctype html><html><body style="margin:0;background:transparent">'
    + '<script>atOptions = {\'key\':\'' + b.cle + '\',\'format\':\'iframe\',\'height\':' + b.hauteur
    + ',\'width\':' + b.largeur + ',\'params\':{}};<\/script>'
    + '<script src="//' + b.hote + '/' + b.cle + '/invoke.js"><\/script>'
    + '</body></html>';
}

const KVT_CONSENT_KEY = 'kvt_ads_consent'; // 'granted' | 'denied'

function kvtGetConsent() {
  try { return localStorage.getItem(KVT_CONSENT_KEY); } catch { return null; }
}

function kvtSetConsent(value) {
  try { localStorage.setItem(KVT_CONSENT_KEY, value); } catch {}
  const banner = document.getElementById('cookieBanner');
  if (banner) banner.remove();
  if (value === 'granted') renderAllAdSlots();
}

// Pas de pub pour les comptes Pro. Les visiteurs non connectés et les
// comptes gratuits voient les emplacements (une fois le consentement
// donné).
function kvtShouldShowAds() {
  return !(window.accountUser && window.accountUser.isPro);
}

function initCookieBanner() {
  if (kvtGetConsent()) return; // déjà répondu lors d'une visite précédente
  const el = document.createElement('div');
  el.id = 'cookieBanner';
  el.className = 'cookie-banner';
  el.innerHTML = `
    <div class="cookie-banner-text">
      KVT utilise des cookies publicitaires (régies partenaires) pour financer la version gratuite de l'app.
      Tu peux les refuser sans aucun impact sur les fonctionnalités.
    </div>
    <div class="cookie-banner-actions">
      <button id="cookieRefuse" class="secondary">Refuser</button>
      <button id="cookieAccept" class="primary">Accepter</button>
    </div>
  `;
  document.body.appendChild(el);
  document.getElementById('cookieAccept').addEventListener('click', () => kvtSetConsent('granted'));
  document.getElementById('cookieRefuse').addEventListener('click', () => kvtSetConsent('denied'));
}

// À insérer dans le HTML d'une vue (ex: `${kvtAdSlotHtml('dashboard-bottom')}`).
// Retourne une chaîne vide si l'utilisateur est Pro — l'emplacement
// n'existe alors même pas dans le DOM.
function kvtAdSlotHtml(id) {
  if (!kvtShouldShowAds()) return '';
  return `<div class="ad-slot" data-ad-container="${id}"></div>`;
}

// À appeler juste après avoir injecté le HTML d'une vue contenant un
// ou plusieurs kvtAdSlotHtml(). Ne fait rien tant que le consentement
// n'est pas "granted", et ne remplit jamais deux fois le même slot.
function renderAllAdSlots() {
  if (!kvtShouldShowAds()) return;
  if (kvtGetConsent() !== 'granted') return;
  document.querySelectorAll('.ad-slot[data-ad-container]').forEach(container => {
    if (container.dataset.filled) return;
    const banniere = kvtChoisirBanniere(container.clientWidth || window.innerWidth);
    if (banniere) {
      container.dataset.filled = '1';
      const cadre = document.createElement('iframe');
      cadre.title = 'Publicité';
      cadre.width = banniere.largeur;
      cadre.height = banniere.hauteur;
      cadre.setAttribute('scrolling', 'no');
      cadre.setAttribute('loading', 'lazy');
      cadre.style.cssText = 'border:0;display:block;margin:0 auto;max-width:100%';
      cadre.srcdoc = kvtBanniereSrcdoc(banniere);
      container.appendChild(cadre);
      return;
    }
    if (KVT_AD_SLOT === 'REMPLACER_PAR_ID_EMPLACEMENT') return; // pas encore configuré côté AdSense
    container.dataset.filled = '1';
    container.innerHTML = `<ins class="adsbygoogle"
      style="display:block"
      data-ad-client="${KVT_ADSENSE_CLIENT}"
      data-ad-slot="${KVT_AD_SLOT}"
      data-ad-format="auto"
      data-full-width-responsive="true"></ins>`;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
  });
}

document.addEventListener('DOMContentLoaded', initCookieBanner);
