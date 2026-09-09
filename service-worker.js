// Cache l'app (fichiers statiques) pour qu'elle fonctionne hors-ligne une
// fois ouverte au moins une fois. Les données de l'utilisateur (vocabulaire,
// scores) vivent dans IndexedDB (voir webapi.js), pas ici — le cache ne
// contient que le "coquille" de l'app.
const CACHE_NAME = 'kanji-vocab-trainer-v69';
const ASSETS = [
  '/',
  '/app/',
  '/app/index.html',
  '/style.css',
  '/app.js',
  '/ui.js',
  '/mesure.js',
  '/webapi.js',
  '/supabaseClient.js',
  '/account.js',
  '/ads.js',
  '/leaderboard.js',
  '/decks.js',
  '/maj.js',
  '/communaute.js',
  '/profils.js',
  '/creation.js',
  '/profil-public.js',
  '/amis.js',
  '/admin.js',
  '/seed-data.json',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Stratégie "réseau d'abord, cache en secours" : on sert toujours la dernière
// version en ligne quand il y a du réseau (donc les mises à jour apparaissent
// immédiatement, sans avoir à forcer le rechargement), et on retombe sur le
// cache uniquement si le réseau est indisponible (mode hors-ligne préservé).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Les installeurs sont sur les Releases GitHub depuis le 02/08 : on ne
  // touche pas aux requêtes qui sortent du site.
  if (event.request.url.includes('/downloads/')) return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => cached);
      // Réseau d'abord : on attend la réponse réseau (qui retombe sur le cache
      // en cas d'échec). Plus de version figée servie depuis le cache.
      return fetchPromise;
    })
  );
});
