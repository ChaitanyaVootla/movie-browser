/// <reference lib="webworker" />
// Service worker — compiled by @serwist/turbopack via esbuild, not the main
// TypeScript build. Runs in a Worker context.
//
// NOTE (Jun 12 2026): entries MUST use serwist v9 shapes — `matcher` +
// strategy INSTANCES. The previous workbox-style `urlPattern`/`handler:
// "CacheFirst"`/`options` threw `unsupported-route-type` at SW evaluation, so
// the service worker NEVER installed (no offline support, console error on
// every page) — and `@ts-nocheck` hid the type mismatch.
import { defaultCache } from "@serwist/turbopack/worker";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // CDN poster/backdrop images — cache-first, long-lived
    {
      matcher: ({ url }) =>
        url.hostname === "image.themoviebrowser.com" ||
        url.hostname === "image.tmdb.org",
      handler: new CacheFirst({
        cacheName: "media-images",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          }),
        ],
      }),
    },
    // YouTube thumbnails — cache-first (immutable per URL)
    {
      matcher: ({ url }) =>
        url.hostname === "i.ytimg.com" || url.hostname === "img.youtube.com",
      handler: new CacheFirst({
        cacheName: "youtube-thumbnails",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 3 * 24 * 60 * 60, // 3 days
          }),
        ],
      }),
    },
    // Google fonts are covered by defaultCache (google-fonts-webfonts /
    // google-fonts-stylesheets) — no custom entry needed.
    // Default caching rules from Serwist (scripts, styles, etc.)
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
