/* Caches the app shell so it opens with no connection at all.
   Bump CACHE when any shell file changes. */
const CACHE = 'rental-utility-v49';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/store.js',
  './js/i18n.js',
  './js/invoice.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  // Take over as soon as the new files are cached. Waiting to be asked
  // stranded anyone whose cached page predated the code that asks: it could
  // never request the update, so it was served the old cache forever.
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' is essential. addAll fetches through the browser's
      // HTTP cache by default, so a host that holds files for minutes — as
      // GitHub Pages does — would fill this brand-new cache with the previous
      // version's files. The cache name advances and nothing else does.
      .then(cache => cache.addAll(SHELL.map(path => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // These two decide whether an update exists, so they must always come from
  // the network. Answering them from the cache would hide every update.
  const path = new URL(request.url).pathname;
  if (path.endsWith('/sw.js') || path.endsWith('/version.json')) return;

  // Navigations: serve the cached shell so a cold offline launch still works.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => {
      if (hit) return hit;
      return fetch(request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
        }
        return res;
      });
    })
  );
});
