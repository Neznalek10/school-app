/**
 * Service worker of the dashboard: caches the dashboard's own files so it opens offline.
 *
 * Registered by index.html. Invariants: it only touches caches with the school-dash- prefix (all apps share
 * one cache storage), and it never handles non-GET requests, other origins, apps or /api/ calls.
 * CORE must list every dashboard js and css file.
 */
importScripts('./version.js');

// Every app on the same site shares one cache storage, so the dashboard only ever touches caches with its own prefix.
const PREFIX = 'school-dash-';
const CACHE = `${PREFIX}${self.APP_VERSION}`;
const CORE = [
  './',
  './index.html',
  './version.js',
  './manifest.json',
  './css/app.css',
  './js/ai.js',
  './js/app.js',
  './js/apps.js',
  './js/backup.js',
  './js/check.js',
  './js/czech.js',
  './js/docx.js',
  './js/drafts.js',
  './js/chem-theory.js',
  './js/elements.js',
  './js/events.js',
  './js/files.js',
  './js/locale.js',
  './js/holidays.js',
  './js/i18n.js',
  './js/i18n/cs.js',
  './js/mathcheck.js',
  './js/md.js',
  './js/nazvoslovi.js',
  './js/setup.js',
  './js/soustavy.js',
  './js/srs.js',
  './js/study.js',
  './js/store.js',
  './js/subjects.js',
  './js/sync/client.js',
  './js/sync/engine.js',
  './js/sync/page.js',
  './js/sync/snapshot.js',
  './js/ui.js',
  './js/update.js',
  './js/views/account.js',
  './js/views/accounts.js',
  './js/views/backup-ui.js',
  './js/views/calendar.js',
  './js/views/chat.js',
  './js/views/chem.js',
  './js/views/exercises.js',
  './js/views/home.js',
  './js/views/lessons.js',
  './js/views/note.js',
  './js/views/notes.js',
  './js/views/parts.js',
  './js/views/prompts.js',
  './js/views/setup-apply.js',
  './js/views/setup.js',
  './js/views/sources.js',
  './js/views/study.js',
  './js/views/subject.js',
  './js/views/tasks.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];
// On a slow connection, fall back to the cached copy after this long instead of waiting.
const NETWORK_TIMEOUT_MS = 4000;
// The French and English apps have their own service workers and caches.
const APPS_PATH = new URL('./apps/', self.location).pathname;
// The local data API is live state: it is never cached, so requests under it always go to the server.
const API_PATH = new URL('./api/', self.location).pathname;

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
  // Returning without respondWith leaves the request to the browser: apps, API calls and other origins are not cached here.
  const passThrough = request.method !== 'GET' || url.origin !== self.location.origin
    || url.pathname.startsWith(APPS_PATH) || url.pathname.startsWith(API_PATH);
  if (passThrough) return;
  event.respondWith(networkFirst(request));
});
