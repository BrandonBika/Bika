/**
 * @file apps/resident-pwa/service-worker.js
 * Service worker strictly caching shell files only.
 * NEVER caches API responses, signed URLs, or personal data.
 */
const CACHE_NAME = 'cn-shell-v15';
const SHELL_ASSETS = [
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './src/main.js',
  './src/styles/main.css',
  './vendor/supabase-js.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Only cache GET requests for static app shell
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.includes('/functions/') || url.pathname.includes('/rest/')) {
    return; // NEVER cache dynamic API calls
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).catch((error) => {
        if (e.request.mode === 'navigate') return caches.match('./offline.html');
        throw error;
      });
    })
  );
});
