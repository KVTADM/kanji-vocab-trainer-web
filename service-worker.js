// Cache l'app (fichiers statiques) pour qu'elle fonctionne hors-ligne une
// fois ouverte au moins une fois. Les données de l'utilisateur (vocabulaire,
// scores) vivent dans IndexedDB (voir webapi.js), pas ici — le cache ne
// contient que le "coquille" de l'app.
const CACHE_NAME = 'kanji-vocab-trainer-v26';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './webapi.js',
  './supabaseClient.js',
  './account.js',
  './ads.js',
  './leaderboard.js',
  './admin.js',
  './seed-data.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
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

// Stratégie "cache d'abord, réseau en secours" : l'app s'ouvre instantanément
// même hors-ligne, et se met à jour toute seule dès qu'une connexion est
// disponible et qu'une nouvelle version est déployée.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Les gros fichiers d'installeurs (DMG/EXE, ~100 Mo) ne doivent jamais
  // passer par le cache : ça gonflerait le stockage hors-ligne pour rien,
  // ce sont de simples téléchargements, pas des assets de l'app.
  if (event.request.url.includes('/downloads/')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
