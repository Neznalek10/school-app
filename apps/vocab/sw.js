importScripts('./version.js');

// Every app on the same site shares one cache storage, so this app only ever touches caches with its own prefix.
const PREFIX = 'vocab2-';
const CACHE = `${PREFIX}${self.APP_VERSION}`;
const CORE = [
  './',
  './index.html',
  './version.js',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/backup.js',
  './js/check.js',
  './js/data.js',
  './js/embed.js',
  './js/explain.js',
  './js/srs.js',
  './js/store.js',
  './js/ui.js',
  './js/views/accounts.js',
  './js/views/backup-ui.js',
  './js/views/decks.js',
  './js/views/home.js',
  './js/views/import.js',
  './js/views/practice.js',
  './js/views/settings.js',
  './js/views/stats.js',
  './js/views/words.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];
// On a slow connection, fall back to the cached copy after this long instead of waiting.
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CORE.map(url => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Network first: always try for the newest file, so a push to GitHub shows up on the next open.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  url.search = '';
  const key = request.mode === 'navigate' ? './index.html' : url.href;

  const network = fetch(request.url, { cache: 'no-cache' }).then(response => {
    if (response.ok) cache.put(key, response.clone());
    return response;
  });
  const cached = await cache.match(key);
  if (!cached) return network;

  const timeout = new Promise(resolve => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
  return Promise.race([network.catch(() => cached), timeout]);
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  // The data API lives at the site root, two levels above this app. It is live state, so it is never cached here.
  const apiPath = new URL('../../api/', self.location).pathname;
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith(apiPath)) return;
  event.respondWith(networkFirst(request));
});
