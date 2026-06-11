"use client";

import { getHoverCardData, type HoverCardData } from "@/server/actions/hover-card";

/**
 * Client-side cache for hover-card detail fetches.
 *
 * Sweeping the cursor across a card row used to fire one `getHoverCardData`
 * server action per card, every time — on a 2-vCPU box that's a self-inflicted
 * thundering herd. This module dedupes concurrent requests (promise cache) and
 * keeps successful results for the lifetime of the page, so re-hovering an item
 * never refetches. Failures/nulls are evicted so a transient error can retry.
 *
 * Hover-card data is user-agnostic display data (ratings, cast, watch options)
 * that changes on the order of days — staleTime: Infinity semantics are safe.
 */
const cache = new Map<string, Promise<HoverCardData | null>>();

export function fetchHoverCardData(
  id: number,
  mediaType: "movie" | "series"
): Promise<HoverCardData | null> {
  const key = `${mediaType}:${id}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = getHoverCardData(id, mediaType).catch(() => null);
  cache.set(key, promise);

  // Don't cache misses/errors — allow a later hover to retry.
  promise.then((data) => {
    if (!data) cache.delete(key);
  });

  return promise;
}
