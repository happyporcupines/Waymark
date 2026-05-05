const CACHE_NAME = 'waymark-v26';
const TILE_CACHE_NAME = 'waymark-offline-tiles-v1';
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
    './js/offline.js',
    './js/supabase.js',
    './js/pdf.js',
    './js/eventHandlers.js',
    './js/pwa.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-512-maskable.png',
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
                    .filter((cacheName) => cacheName !== CACHE_NAME && cacheName !== TILE_CACHE_NAME)
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

    const isTileRequest =
        requestUrl.hostname === 'tile.openstreetmap.org';

    // Cache-first for map tiles so saved extents continue to render offline.
    if (isTileRequest) {
        event.respondWith(
            caches.open(TILE_CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cached) => {
                    if (cached) {
                        return cached;
                    }
                    return fetch(event.request).then((networkResponse) => {
                        if (networkResponse) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                });
            }).catch(() => fetch(event.request))
        );
        return;
    }

    // Only serve app shell files from cache for same-origin requests.
    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    // Cache-first for app shell — loads instantly offline.
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) {
                // Serve from cache immediately, refresh in background.
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                    }
                }).catch(() => {});
                return cached;
            }
            // Not in cache yet — try network.
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return networkResponse;
            });
        })
    );
});
