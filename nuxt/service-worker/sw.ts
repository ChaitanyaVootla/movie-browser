/// <reference lib="WebWorker" />
/// <reference types="vite/client" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope
const ONE_HOUR_SECS = 60 * 60
const ONE_DAY_SECS = 24 * ONE_HOUR_SECS

// self.__WB_MANIFEST is default injection point
precacheAndRoute(self.__WB_MANIFEST)

// clean old assets
cleanupOutdatedCaches()

let allowlist: undefined | RegExp[]
if (import.meta.env.DEV)
  allowlist = [/^\/$/]

// to allow work offline
registerRoute(new NavigationRoute(
  createHandlerBoundToURL('/'),
  { allowlist },
))

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/trending'),
  new CacheFirst({
    cacheName: 'trending-cache',
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: ONE_HOUR_SECS / 2, // Reduced to 30 minutes to match backend cache
        purgeOnQuotaError: true,
        maxEntries: 50, // Limit cache entries
      }),
    ],
  }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/person'),
  new CacheFirst({
    cacheName: 'person-cache',
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: ONE_DAY_SECS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

registerRoute(
  ({ url }) => {
    const regex = /^\/api\/(movie|series)\/\d+$/
    return regex.test(url.pathname)
  },
  new CacheFirst({
    cacheName: 'movie-series-cache',
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: ONE_DAY_SECS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

registerRoute(
  ({ url }) => {
    const regex = /^\/api\/(movie|series)\/\d+\/recommend$/
    return regex.test(url.pathname)
  },
  new CacheFirst({
    cacheName: 'movie-series-secondary-cache',
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: ONE_DAY_SECS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// Cache discovery API calls
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/discover'),
  new CacheFirst({
    cacheName: 'discovery-cache',
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: ONE_HOUR_SECS, // 1 hour to match backend
        purgeOnQuotaError: true,
        maxEntries: 200, // Allow more discovery cache entries
      }),
    ],
  }),
);

self.skipWaiting()
clientsClaim()