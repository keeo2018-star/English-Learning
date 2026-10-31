/* Only public install assets are cached. No account pages, APIs or sessions. */
const CACHE = 'english-learning-install-v1';
const ASSETS = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('english-learning-install-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Always fetch current app/auth HTML. Never store callback URLs or pages.
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html').then(response => response || Response.error())));
  } else if (ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.match(request).then(response => response || fetch(request)));
  }
});
