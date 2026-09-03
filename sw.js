// Caches the app shell (this app's own files, plus the CDN libraries it
// depends on) so the whole thing keeps launching even after weeks with no
// signal in the bush. Map images themselves are cached separately, inside
// the app, via IndexedDB — this worker is just for the code that runs it.
//
// Bump this version string any time index.html (or anything else here)
// changes and gets re-uploaded — that's what makes the update actually
// show up instead of the iPad quietly keeping the old cached copy forever.
const CACHE_NAME = 'harder-field-map-v2';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
  'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js',
  'https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/@babel/standalone@7.25.6/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url, { mode: url.startsWith('http') ? 'cors' : 'same-origin' })
            .then((resp) => resp.ok && cache.put(url, resp))
            .catch(() => {}) // offline on first install — whatever's missing just won't be cached yet
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

// The page itself (index.html / './') is network-first: always try to get
// the latest version when there's signal, so an update you push shows up
// immediately, and only fall back to the saved copy when offline. Every
// other file (React, PDF.js, etc. — things that don't change) stays
// cache-first, since there's no reason to re-fetch those every time.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const isPage = event.request.mode === 'navigate' || event.request.url.endsWith('/index.html') || event.request.url.endsWith('/');

  if (isPage) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
