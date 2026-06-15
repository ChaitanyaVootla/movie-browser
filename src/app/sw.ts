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
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";
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
  // navigationPreload intentionally OFF: with the NetworkOnly navigation route
  // below nothing consumes event.preloadResponse, and an unconsumed preload was
  // serving direct loads of streamed routes (e.g. /…/discussions, RSC-streamed
  // under loading.tsx) as a DOWNLOAD instead of a page — the "discussions page
  // not accessible / routing race" bug (Jun 2026). See pwa-mobile.md.
  runtimeCaching: [
    // Navigations ALWAYS go to network — never serve/cache HTML documents from
    // the SW. Intercepting navigations broke direct loads of streamed routes
    // (served as a download). Offline still falls back to /~offline via the
    // `fallbacks` config (NetworkOnly throws on network failure → fallback).
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
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

// --- Web push (phase 1) -----------------------------------------------------
// Added additively after Serwist setup — does not touch the precache/runtime
// caching above. Payloads are spoiler-safe by construction (see notify.ts).
interface PushData {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  let data: PushData = {};
  try {
    data = (event.data?.json() as PushData) ?? {};
  } catch {
    // non-JSON push — show generic
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Movie Browser", {
      body: data.body ?? "",
      icon: "/images/android-chrome-192x192.png",
      badge: "/images/android-chrome-192x192.png",
      data: { url: data.url ?? "/notifications" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) {
        void existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
