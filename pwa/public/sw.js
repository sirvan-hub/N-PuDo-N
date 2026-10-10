const CACHE_NAME = 'pudo-n-shell-v1';
const APP_SHELL = ['/', '/manifest.webmanifest', '/pudo-mark.svg'];
const STATIC_ASSET = /\.(?:js|css|svg|png|webmanifest)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/src/') || url.pathname.startsWith('/@vite/')) return;

  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && (request.mode === 'navigate' || APP_SHELL.includes(url.pathname) || STATIC_ASSET.test(url.pathname))) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return (await caches.match('/')) ?? Response.error();
      return Response.error();
    }),
  );
});