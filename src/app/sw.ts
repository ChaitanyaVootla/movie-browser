// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — Service worker runs in a Worker context.
// Compiled by @serwist/turbopack via esbuild, not the main TypeScript build.
import { defaultCache } from "@serwist/turbopack/worker";
import { Serwist } from "serwist";

declare const self: WorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision: string | null })[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // CDN poster/backdrop images — cache-first, long-lived
    {
      urlPattern: ({ url }) =>
        url.hostname === "image.themoviebrowser.com" ||
        url.hostname === "image.tmdb.org",
      handler: "CacheFirst",
      options: {
        cacheName: "media-images",
        expiration: {
          maxEntries: 500,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
      },
    },
    // YouTube thumbnails — cache-first (immutable per URL)
    {
      urlPattern: ({ url }) =>
        url.hostname === "i.ytimg.com" ||
        url.hostname === "img.youtube.com",
      handler: "CacheFirst",
      options: {
        cacheName: "youtube-thumbnails",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 3 * 24 * 60 * 60, // 3 days
        },
      },
    },
    // Google fonts — cache-first
    {
      urlPattern: ({ url }) =>
        url.hostname === "fonts.googleapis.com" ||
        url.hostname === "fonts.gstatic.com",
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
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
