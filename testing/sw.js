/* This worker's default /testing/ scope does not replace the live app worker. */
const CACHE_NAME = 'live-form-testing-2026-10-15-v1';
const APP_SHELL = [
    './', './index.html', './production.css', './gate-config.js',
    './production-core.js', './production-ui.js',
    './vendor/jszip.min.js', './vendor/pako.min.js', './vendor/qrcode.min.js'
];
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('live-form-testing-') && name !== CACHE_NAME).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        if (event.request.mode === 'navigate') {
            try {
                const response = await fetch(event.request);
                if (response.ok) await cache.put(event.request, response.clone());
                return response;
            } catch {
                return (await cache.match(event.request)) || (await cache.match('./index.html')) || Response.error();
            }
        }
        return (await cache.match(event.request)) || fetch(event.request);
    })());
});
