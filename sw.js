/* =========================================================================
   ByteLens — Service Worker
   Rende l'app installabile e funzionante OFFLINE.

   Strategia:
   - App shell same-origin (HTML/CSS/JS/manifest/icone) e navigazioni:
     NETWORK-FIRST. Online prende sempre l'ultima versione (l'app non resta
     "congelata" su una copia vecchia in cache); offline usa la cache.
   - Risorse cross-origin (es. Google Fonts): CACHE-FIRST con runtime caching.
   ========================================================================= */
var CACHE = 'bytelens-v3';

var APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=20260912-2',
  './app.js?v=20260912-2',
  './image-limits.js?v=20260912-2',
  './i18n.js?v=20260912-2',
  './privacy.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // fetch+put per resilienza (evita che un singolo 404 blocchi tutto).
      return Promise.all(APP_SHELL.map(function (url) {
        return fetch(url, { cache: 'reload' }).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) return cache.put(url, res);
        }).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.startsWith('bytelens-') && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function putInCache(event, req, res) {
  if (!res.ok && res.type !== 'opaque') return res;
  var copy = res.clone();
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.put(req, copy); }).catch(function () {}));
  return res;
}

function cachedResponse(req) {
  return caches.open(CACHE).then(function (cache) { return cache.match(req); });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var isNav = req.mode === 'navigate';

  if (sameOrigin || isNav) {
    // NETWORK-FIRST: prova la rete (aggiorna la cache), altrimenti la cache.
    event.respondWith(
      fetch(req).then(function (res) {
        return putInCache(event, req, res);
      }).catch(function () {
        return cachedResponse(req).then(function (cached) {
          return cached || (isNav ? cachedResponse('./index.html') : Response.error());
        });
      })
    );
    return;
  }

  // CROSS-ORIGIN (font, ecc.): CACHE-FIRST con fallback di rete.
  event.respondWith(
    cachedResponse(req).then(function (cached) {
      return cached || fetch(req).then(function (res) { return putInCache(event, req, res); });
    })
  );
});
