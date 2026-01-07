/**
 * Cache Layer - Re-exports from unified cache service
 *
 * This file provides backwards compatibility for existing code.
 * All caching now goes through the unified cache-service.ts which provides:
 * - L1 (in-memory) + L2 (file-based) hybrid caching
 * - Persistence across server restarts
 * - Stale-while-revalidate support
 *
 * For new code, import directly from "@/lib/cache-service".
 */

// Re-export everything from the unified cache service
export {
  // Types
  type CacheNamespace,

  // Core cache operations
  cacheGet,
  cacheSet,
  cacheDel,
  cacheFlushNamespace,
  getCacheStats,

  // Cached fetch (now with L2 persistence!)
  cachedFetch,
  cachedFetchPersistent,

  // Maintenance utilities
  cleanupExpiredCache,
  getCacheSizeStats,
} from "./cache-service";

// Legacy exports for full backwards compatibility
import NodeCache from "node-cache";

/**
 * @deprecated Use getCacheStats() from cache-service instead
 */
export function cacheStats(): NodeCache.Stats {
  // Return a compatible stats object from the new service
  const { getCacheStats } = require("./cache-service");
  return getCacheStats().memory;
}

/**
 * @deprecated Use cacheFlushNamespace for each namespace instead
 */
export function cacheFlushAll(): void {
  const { cacheFlushNamespace } = require("./cache-service");
  const namespaces = [
    "trending",
    "movie",
    "series",
    "person",
    "search",
    "discover",
    "images",
    "youtube",
    "youtube-channels",
  ];
  for (const ns of namespaces) {
    cacheFlushNamespace(ns);
  }
}

/**
 * @deprecated Use cacheGet instead
 */
export function cacheGetMultiple<T>(
  namespace: import("./cache-service").CacheNamespace,
  keys: string[]
): Map<string, T | undefined> {
  const { cacheGet } = require("./cache-service");
  const results = new Map<string, T | undefined>();
  for (const key of keys) {
    results.set(key, cacheGet(namespace, key));
  }
  return results;
}
