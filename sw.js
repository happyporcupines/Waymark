const CACHE_NAME = 'waymark-v7';
const APP_SHELL_FILES = [
    './',
    './index.html',
    './css/style.css',
    './js/state.js',
    './js/utils.js',
    './js/entries.js',
    './js/popups.js',
    './js/ui.js',
    './js/stories.js',
    './js/map.js',
    './js/config.js',
    './js/supabase.js',
    './js/eventHandlers.js',
    './js/pwa.js',
    './manifest.webmanifest',
    './icons/icon-192.svg',
    './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // Always use network for Supabase and ArcGIS API endpoints.
    if (requestUrl.hostname.includes('supabase.co') || requestUrl.hostname.includes('arcgis.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            });
        })
    );
});
