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
      KVT utilise des cookies publicitaires (Google AdSense) pour financer la version gratuite de l'app.
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
  if (KVT_AD_SLOT === 'REMPLACER_PAR_ID_EMPLACEMENT') return; // pas encore configuré côté AdSense
  document.querySelectorAll('.ad-slot[data-ad-container]').forEach(container => {
    if (container.dataset.filled) return;
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
