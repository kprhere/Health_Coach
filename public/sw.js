// Offline shell for the installed PWA.
//
// v2 fixes a blank screen after deploys. A stale page could ask for a bundle
// the new deploy had removed; the host answered with the HTML page (status
// 200) and v1 cached that HTML under the script's URL, so the app never
// started. Now:
//  - pages are always fetched fresh (no HTTP cache), the cached copy is only
//    an offline fallback;
//  - an HTML response is never cached or served for anything but a page;
//  - the cache name changed, so activating v2 deletes anything v1 stored.
const CACHE_NAME = 'recomp-os-v2';
const APP_SHELL = ['./', './manifest.json', './icon.svg'];

const isHtml = (response) => (response.headers.get('content-type') || '').includes('text/html');

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put('./', response.clone()));
          return response;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      // A cached HTML body for a script, style or image is the v1 poison; ignore it.
      const usable = cached && !isHtml(cached) ? cached : null;
      const network = fetch(request).then((response) => {
        if (response.ok && !isHtml(response)) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => usable || Response.error());
      return usable || network;
    }),
  );
});
