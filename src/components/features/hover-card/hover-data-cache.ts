"use client";

import { getHoverCardData, type HoverCardData } from "@/server/actions/hover-card";

/**
 * Client-side cache for hover-preview detail fetches.
 *
 * Sweeping the cursor across a card row used to fire one `getHoverCardData`
 * server action per card, every time. On a 2-vCPU box that is a self-inflicted
 * thundering herd. This module dedupes concurrent requests (promise cache) and
 * keeps successful results for the lifetime of the page, so re-hovering an item
 * never refetches. Failures/nulls are evicted so a later hover or Retry can try
 * again.
 *
 * Hover data is user-agnostic display data (ratings, cast, watch options)
 * that changes on the order of days, so staleTime: Infinity semantics are safe.
 */
const cache = new Map<string, Promise<HoverCardData | null>>();

const keyOf = (id: number, mediaType: "movie" | "series") => `${mediaType}:${id}`;

export function fetchHoverCardData(
  id: number,
  mediaType: "movie" | "series"
): Promise<HoverCardData | null> {
  const key = keyOf(id, mediaType);
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = getHoverCardData(id, mediaType).catch(() => null);
  cache.set(key, promise);

  // Don't cache misses/errors — allow a later hover to retry.
  promise.then((data) => {
    if (!data && cache.get(key) === promise) cache.delete(key);
  });

  return promise;
}

/** Drop an entry (used by Retry after a timeout, when the promise is still pending). */
export function evictHoverCardData(id: number, mediaType: "movie" | "series"): void {
  cache.delete(keyOf(id, mediaType));
}
