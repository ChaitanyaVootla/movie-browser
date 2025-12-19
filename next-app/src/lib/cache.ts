/**
 * In-Memory Cache Layer
 *
 * Uses node-cache for fast in-memory caching of TMDB API responses.
 * This is server-side only and persists across requests in the same Node process.
 */

import NodeCache from "node-cache";
import { CACHE_DURATIONS } from "./constants";

// Global cache instance - survives across requests
const globalCache = new NodeCache({
  // Check for expired keys every 60 seconds
  checkperiod: 60,
  // Use clones to prevent accidental mutations
  useClones: true,
  // Delete expired keys on check
  deleteOnExpire: true,
});

export type CacheNamespace =
  | "trending"
  | "movie"
  | "series"
  | "person"
  | "search"
  | "discover"
  | "images";

/**
 * Get TTL for a cache namespace
 */
function getTTL(namespace: CacheNamespace): number {
  switch (namespace) {
    case "trending":
      return CACHE_DURATIONS.trending;
    case "movie":
      return CACHE_DURATIONS.movie;
    case "series":
      return CACHE_DURATIONS.series;
    case "person":
      return CACHE_DURATIONS.person;
    case "search":
      return CACHE_DURATIONS.search;
    case "discover":
      return CACHE_DURATIONS.movie;
    case "images":
      return CACHE_DURATIONS.movie;
    default:
      return 3600; // 1 hour default
  }
}

/**
 * Build a namespaced cache key
 */
function buildKey(namespace: CacheNamespace, key: string): string {
  return `${namespace}:${key}`;
}

/**
 * Get a value from cache
 */
export function cacheGet<T>(namespace: CacheNamespace, key: string): T | undefined {
  const fullKey = buildKey(namespace, key);
  return globalCache.get<T>(fullKey);
}

/**
 * Set a value in cache
 */
export function cacheSet<T>(namespace: CacheNamespace, key: string, value: T, ttl?: number): void {
  const fullKey = buildKey(namespace, key);
  const cacheTTL = ttl ?? getTTL(namespace);
  globalCache.set(fullKey, value, cacheTTL);
}

/**
 * Delete a value from cache
 */
export function cacheDel(namespace: CacheNamespace, key: string): void {
  const fullKey = buildKey(namespace, key);
  globalCache.del(fullKey);
}

/**
 * Flush all keys in a namespace
 */
export function cacheFlushNamespace(namespace: CacheNamespace): void {
  const keys = globalCache.keys();
  const prefix = `${namespace}:`;
  const keysToDelete = keys.filter((k) => k.startsWith(prefix));
  globalCache.del(keysToDelete);
}

/**
 * Flush entire cache
 */
export function cacheFlushAll(): void {
  globalCache.flushAll();
}

/**
 * Get cache statistics
 */
export function cacheStats(): NodeCache.Stats {
  return globalCache.getStats();
}

/**
 * Cached fetch wrapper - fetches from cache or executes fetcher
 */
export async function cachedFetch<T>(
  namespace: CacheNamespace,
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Check cache first
  const cached = cacheGet<T>(namespace, key);
  if (cached !== undefined) {
    return cached;
  }

  // Fetch fresh data
  const data = await fetcher();

  // Store in cache
  cacheSet(namespace, key, data, ttl);

  return data;
}

/**
 * Get multiple values from cache (returns map of found values)
 */
export function cacheGetMultiple<T>(
  namespace: CacheNamespace,
  keys: string[]
): Map<string, T | undefined> {
  const results = new Map<string, T | undefined>();

  for (const key of keys) {
    results.set(key, cacheGet<T>(namespace, key));
  }

  return results;
}

