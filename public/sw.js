importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.1.5/workbox-sw.js');
const { registerRoute } = workbox.routing;
const { CacheFirst, StaleWhileRevalidate } = workbox.strategies;
const { CacheableResponse } = workbox.cacheableResponse;
const { ExpirationPlugin } = workbox.expiration;
CACHE_NAME = 'test_cache';
registerRoute(
    ({ request }) => request.destination === 'image',
    new CacheFirst({
        // Put all cached files in a cache named 'images'
        cacheName: 'images',
        plugins: [
            // Ensure that only requests that result in a 200 status are cached
            new CacheableResponse({
                statuses: [200],
            }),
            // Expire them after 30 days
            new ExpirationPlugin({
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
            }),
        ],
    }),
);

registerRoute(
    ({ url }) => url.pathname.includes('tmdb/'),
    new CacheFirst({
        // Put all cached files in a cache named 'tmdb'
        cacheName: 'tmdb',
        plugins: [
            // Ensure that only requests that result in a 200 status are cached
            new CacheableResponse({
                statuses: [200],
            }),
            // Expire them after 1 day
            new ExpirationPlugin({
                maxAgeSeconds: 60 * 60 * 24 * 1, // 1 day
            }),
        ],
    }),
);

registerRoute(
    ({ request }) => request.destination === 'script' || request.destination === 'style',
    new StaleWhileRevalidate(),
);
