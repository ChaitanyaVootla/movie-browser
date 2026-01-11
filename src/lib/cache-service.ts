/**
 * Unified Cache Service
 *
 * A hybrid L1 (in-memory) + L2 (file-based) caching system that:
 * - Survives server restarts (file persistence)
 * - Provides fast access (memory cache)
 * - Supports stale-while-revalidate for background refresh
 * - Protects API quotas (YouTube, TMDB)
 * - Compresses large payloads (>10KB) with gzip
 * - Exports Prometheus-style metrics
 *
 * Architecture:
 *   L1 (node-cache) → Fast, in-memory, lost on restart
 *   L2 (.cache/)    → Slower, file-based, persists across restarts
 *
 * Cache namespaces have configurable TTLs and persistence behavior.
 *
 * @server-only This module uses Node.js-only APIs (fs, path, crypto, zlib)
 */

// Only import server-only when running in Next.js context (not CLI scripts)
// This allows the cache service to be used in test scripts
if (typeof window === "undefined" && process.env.NEXT_RUNTIME) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("server-only");
}

import { existsSync, mkdirSync, readFileSync, writeFile, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import crypto from "crypto";
import { gzipSync, gunzipSync } from "zlib";
import NodeCache from "node-cache";
import { dataLogger } from "./logger";

// =============================================================================
// Configuration
// =============================================================================

const CACHE_ROOT = join(process.cwd(), ".cache");

/**
 * Cache version - increment when data structure changes to invalidate old cache
 */
const CACHE_VERSION = 1;

/**
 * Compression threshold (bytes) - payloads larger than this are gzip compressed
 */
const COMPRESSION_THRESHOLD = 10 * 1024; // 10KB

/** Cache namespace types */
export type CacheNamespace =
  | "trending"
  | "movie"
  | "series"
  | "person"
  | "search"
  | "discover"
  | "images"
  | "youtube"
  | "youtube-channels";

interface CacheConfig {
  /** In-memory cache TTL (seconds) */
  l1TTL: number;
  /** File cache TTL (seconds) - 0 means no file persistence */
  l2TTL: number;
  /** Whether to persist to file system */
  persistToFile: boolean;
  /** Grace period for stale-while-revalidate (seconds) */
  staleGracePeriod?: number;
}

/**
 * Cache configuration per namespace
 *
 * Namespaces are tuned based on:
 * - Data volatility (how often it changes)
 * - API quota sensitivity (YouTube = aggressive caching)
 * - Payload size (person data is large)
 */
const CACHE_CONFIGS: Record<CacheNamespace, CacheConfig> = {
  // === QUOTA SENSITIVE - Long persistent cache ===
  // YouTube caching strategy:
  // - youtube-channels: Channel upload lists. Channels rarely upload >1-2 videos/day.
  //   Extended L2 to 48h with 6h stale grace for quota protection.
  // - youtube: Video stats, comments, dislikes. Default 24h cache.
  //   Age-based TTL applied in youtube.ts: older videos (>30 days) get 7-day cache.
  // - Cache warming on startup loads L2->L1 to avoid API calls after restart.
  youtube: {
    l1TTL: 3600,           // 1 hour in-memory
    l2TTL: 86400,          // 24 hours on disk
    persistToFile: true,
    staleGracePeriod: 3600, // Serve stale for 1 hour while refreshing
  },
  "youtube-channels": {
    l1TTL: 3600,           // 1 hour in-memory
    l2TTL: 172800,         // 48 hours on disk (channels upload infrequently)
    persistToFile: true,
    staleGracePeriod: 21600, // 6 hours grace - maximize quota protection
  },

  // === MEDIUM FREQUENCY - Persist for warm starts ===
  person: {
    l1TTL: 86400,          // 24 hours in-memory
    l2TTL: 259200,         // 3 days on disk (person data rarely changes)
    persistToFile: true,
    staleGracePeriod: 86400, // 1 day grace
  },
  search: {
    l1TTL: 300,            // 5 minutes in-memory
    l2TTL: 3600,           // 1 hour on disk (repeated searches)
    persistToFile: true,
  },
  discover: {
    l1TTL: 1800,           // 30 minutes in-memory
    l2TTL: 3600,           // 1 hour on disk
    persistToFile: true,
  },

  // === STANDARD CACHING ===
  movie: {
    l1TTL: 3600,           // 1 hour in-memory
    l2TTL: 7200,           // 2 hours on disk
    persistToFile: true,
  },
  series: {
    l1TTL: 3600,           // 1 hour in-memory
    l2TTL: 7200,           // 2 hours on disk
    persistToFile: true,
  },
  images: {
    l1TTL: 3600,           // 1 hour in-memory
    l2TTL: 86400,          // 24 hours on disk (images rarely change)
    persistToFile: true,
  },

  // === FRESH DATA NEEDED - In-memory only ===
  trending: {
    l1TTL: 900,            // 15 minutes in-memory
    l2TTL: 0,              // No file persistence
    persistToFile: false,  // Always want fresh trending data
  },
};

// =============================================================================
// L1 Cache (In-Memory)
// =============================================================================

const memoryCache = new NodeCache({
  checkperiod: 60,    // Check for expired keys every 60 seconds
  useClones: true,    // Use clones to prevent accidental mutations
  deleteOnExpire: true,
});

// Track in-flight requests to prevent duplicate fetches
const inFlightRequests = new Map<string, Promise<unknown>>();

// Track cache statistics
const cacheStats = {
  l1Hits: 0,
  l1Misses: 0,
  l2Hits: 0,
  l2Misses: 0,
  staleHits: 0,
  backgroundRefreshes: 0,
  compressionSavings: 0, // Total bytes saved by compression
  compressedWrites: 0,   // Number of compressed writes
  fetchErrors: 0,        // Number of fetch errors
  warmingComplete: false,
  startTime: Date.now(),
};

// Track per-namespace metrics
const namespaceMetrics = new Map<CacheNamespace, {
  hits: number;
  misses: number;
  latencySum: number;
  latencyCount: number;
}>();

// =============================================================================
// L2 Cache (File-Based)
// =============================================================================

interface FileCacheEntry<T> {
  v: number;          // Cache version - for invalidating on structure changes
  data: T;
  timestamp: number;
  expiresAt: number;
  compressed?: boolean; // Whether data is gzip compressed
  originalSize?: number; // Original size before compression (for metrics)
}

/**
 * Create a filesystem-safe hash of the cache key
 */
function hashKey(key: string): string {
  return crypto.createHash("md5").update(key).digest("hex");
}

/**
 * Get the file path for a cache entry
 */
function getFilePath(namespace: CacheNamespace, key: string): string {
  const dir = join(CACHE_ROOT, namespace);
  return join(dir, `${hashKey(key)}.json`);
}

/**
 * Ensure the cache directory exists
 */
function ensureCacheDir(namespace: CacheNamespace): void {
  const dir = join(CACHE_ROOT, namespace);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read from L2 (file) cache
 * Handles both compressed and uncompressed entries
 */
function readFromFile<T>(namespace: CacheNamespace, key: string): FileCacheEntry<T> | null {
  try {
    const filePath = getFilePath(namespace, key);
    if (!existsSync(filePath)) return null;

    const content = readFileSync(filePath, "utf-8");
    const entry = JSON.parse(content) as FileCacheEntry<T> & { data: T | string };

    // Invalidate if cache version doesn't match
    if (entry.v !== CACHE_VERSION) {
      return null;
    }

    // Decompress if needed
    if (entry.compressed && typeof entry.data === "string") {
      try {
        const compressed = Buffer.from(entry.data, "base64");
        const decompressed = gunzipSync(compressed).toString("utf-8");
        entry.data = JSON.parse(decompressed) as T;
      } catch (decompressError) {
        dataLogger.warn({
          event: "cache_decompress_error",
          namespace,
          error: decompressError instanceof Error ? decompressError.message : String(decompressError),
        });
        return null;
      }
    }

    return entry as FileCacheEntry<T>;
  } catch (error) {
    dataLogger.warn({
      event: "cache_file_read_error",
      namespace,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Write to L2 (file) cache - async to avoid blocking event loop
 * Fire-and-forget: errors are logged but don't affect the caller
 * Compresses payloads larger than COMPRESSION_THRESHOLD
 */
function writeToFile<T>(namespace: CacheNamespace, key: string, data: T, ttl: number): void {
  try {
    ensureCacheDir(namespace);
    const filePath = getFilePath(namespace, key);
    
    // Serialize data to check size
    const jsonData = JSON.stringify(data);
    const originalSize = Buffer.byteLength(jsonData, "utf-8");
    
    let entry: FileCacheEntry<T> | FileCacheEntry<string>;
    
    // Compress if larger than threshold
    if (originalSize > COMPRESSION_THRESHOLD) {
      try {
        const compressed = gzipSync(jsonData);
        const compressedSize = compressed.length;
        const savings = originalSize - compressedSize;
        
        // Only use compression if it actually saves space (>10% savings)
        if (savings > originalSize * 0.1) {
          entry = {
            v: CACHE_VERSION,
            data: compressed.toString("base64"),
            timestamp: Date.now(),
            expiresAt: Date.now() + ttl * 1000,
            compressed: true,
            originalSize,
          };
          
          cacheStats.compressionSavings += savings;
          cacheStats.compressedWrites++;
        } else {
          // Compression didn't help, store uncompressed
          entry = {
            v: CACHE_VERSION,
            data,
            timestamp: Date.now(),
            expiresAt: Date.now() + ttl * 1000,
          };
        }
      } catch {
        // Compression failed, store uncompressed
        entry = {
          v: CACHE_VERSION,
          data,
          timestamp: Date.now(),
          expiresAt: Date.now() + ttl * 1000,
        };
      }
    } else {
      entry = {
        v: CACHE_VERSION,
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttl * 1000,
      };
    }
    
    // Async write - non-blocking, fire-and-forget
    writeFile(filePath, JSON.stringify(entry), "utf-8", (err) => {
      if (err) {
        dataLogger.warn({
          event: "cache_file_write_error",
          namespace,
          error: err.message,
        });
      }
    });
  } catch (error) {
    dataLogger.warn({
      event: "cache_file_write_error",
      namespace,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Delete from L2 (file) cache
 */
function deleteFromFile(namespace: CacheNamespace, key: string): void {
  try {
    const filePath = getFilePath(namespace, key);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Ignore deletion errors
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Build a namespaced cache key for L1
 */
function buildFullKey(namespace: CacheNamespace, key: string): string {
  return `${namespace}:${key}`;
}

/**
 * Get a value from cache (L1 → L2 → null)
 */
export function cacheGet<T>(namespace: CacheNamespace, key: string): T | undefined {
  const fullKey = buildFullKey(namespace, key);
  const config = CACHE_CONFIGS[namespace];

  // Check L1 first
  const l1Value = memoryCache.get<T>(fullKey);
  if (l1Value !== undefined) {
    cacheStats.l1Hits++;
    return l1Value;
  }
  cacheStats.l1Misses++;

  // Check L2 if configured
  if (config.persistToFile) {
    const fileEntry = readFromFile<T>(namespace, key);
    if (fileEntry && Date.now() < fileEntry.expiresAt) {
      cacheStats.l2Hits++;
      // Populate L1 from L2
      memoryCache.set(fullKey, fileEntry.data, config.l1TTL);
      return fileEntry.data;
    }
    cacheStats.l2Misses++;
  }

  return undefined;
}

/**
 * Set a value in cache (L1 + L2)
 */
export function cacheSet<T>(
  namespace: CacheNamespace,
  key: string,
  value: T,
  customTTL?: number
): void {
  const config = CACHE_CONFIGS[namespace];
  const fullKey = buildFullKey(namespace, key);

  // Set in L1
  const l1TTL = customTTL ?? config.l1TTL;
  memoryCache.set(fullKey, value, l1TTL);

  // Set in L2 if configured
  if (config.persistToFile && config.l2TTL > 0) {
    const l2TTL = customTTL ?? config.l2TTL;
    writeToFile(namespace, key, value, l2TTL);
  }
}

/**
 * Delete a value from cache (L1 + L2)
 */
export function cacheDel(namespace: CacheNamespace, key: string): void {
  const fullKey = buildFullKey(namespace, key);
  memoryCache.del(fullKey);
  deleteFromFile(namespace, key);
}

/**
 * Flush all keys in a namespace
 */
export function cacheFlushNamespace(namespace: CacheNamespace): void {
  // Flush L1
  const keys = memoryCache.keys();
  const prefix = `${namespace}:`;
  const keysToDelete = keys.filter((k) => k.startsWith(prefix));
  memoryCache.del(keysToDelete);

  // Flush L2
  const dir = join(CACHE_ROOT, namespace);
  if (existsSync(dir)) {
    const files = readdirSync(dir);
    for (const file of files) {
      try {
        unlinkSync(join(dir, file));
      } catch {
        // Ignore deletion errors
      }
    }
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const l1Stats = memoryCache.getStats();
  const uptimeMs = Date.now() - cacheStats.startTime;
  
  return {
    memory: l1Stats,
    custom: cacheStats,
    hitRates: {
      l1: cacheStats.l1Hits / (cacheStats.l1Hits + cacheStats.l1Misses) || 0,
      l2: cacheStats.l2Hits / (cacheStats.l2Hits + cacheStats.l2Misses) || 0,
    },
    uptime: {
      ms: uptimeMs,
      human: formatDuration(uptimeMs),
    },
  };
}

/**
 * Format milliseconds as human-readable duration
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Initialize per-namespace metrics
 */
function initNamespaceMetrics(namespace: CacheNamespace) {
  if (!namespaceMetrics.has(namespace)) {
    namespaceMetrics.set(namespace, {
      hits: 0,
      misses: 0,
      latencySum: 0,
      latencyCount: 0,
    });
  }
}

/**
 * Export metrics in Prometheus format
 * 
 * Usage: GET /api/metrics → returns plain text Prometheus metrics
 */
export function getPrometheusMetrics(): string {
  const lines: string[] = [];
  const stats = getCacheStats();
  
  // Cache hit/miss counters
  lines.push("# HELP cache_l1_hits_total Total L1 (memory) cache hits");
  lines.push("# TYPE cache_l1_hits_total counter");
  lines.push(`cache_l1_hits_total ${stats.custom.l1Hits}`);
  
  lines.push("# HELP cache_l1_misses_total Total L1 (memory) cache misses");
  lines.push("# TYPE cache_l1_misses_total counter");
  lines.push(`cache_l1_misses_total ${stats.custom.l1Misses}`);
  
  lines.push("# HELP cache_l2_hits_total Total L2 (file) cache hits");
  lines.push("# TYPE cache_l2_hits_total counter");
  lines.push(`cache_l2_hits_total ${stats.custom.l2Hits}`);
  
  lines.push("# HELP cache_l2_misses_total Total L2 (file) cache misses");
  lines.push("# TYPE cache_l2_misses_total counter");
  lines.push(`cache_l2_misses_total ${stats.custom.l2Misses}`);
  
  lines.push("# HELP cache_stale_hits_total Total stale-while-revalidate hits");
  lines.push("# TYPE cache_stale_hits_total counter");
  lines.push(`cache_stale_hits_total ${stats.custom.staleHits}`);
  
  lines.push("# HELP cache_background_refreshes_total Total background refresh operations");
  lines.push("# TYPE cache_background_refreshes_total counter");
  lines.push(`cache_background_refreshes_total ${stats.custom.backgroundRefreshes}`);
  
  // Compression metrics
  lines.push("# HELP cache_compression_savings_bytes Total bytes saved by compression");
  lines.push("# TYPE cache_compression_savings_bytes counter");
  lines.push(`cache_compression_savings_bytes ${stats.custom.compressionSavings}`);
  
  lines.push("# HELP cache_compressed_writes_total Total compressed writes");
  lines.push("# TYPE cache_compressed_writes_total counter");
  lines.push(`cache_compressed_writes_total ${stats.custom.compressedWrites}`);
  
  // Error metrics
  lines.push("# HELP cache_fetch_errors_total Total fetch errors");
  lines.push("# TYPE cache_fetch_errors_total counter");
  lines.push(`cache_fetch_errors_total ${stats.custom.fetchErrors}`);
  
  // Hit rates (gauges)
  lines.push("# HELP cache_l1_hit_rate L1 cache hit rate (0-1)");
  lines.push("# TYPE cache_l1_hit_rate gauge");
  lines.push(`cache_l1_hit_rate ${stats.hitRates.l1.toFixed(4)}`);
  
  lines.push("# HELP cache_l2_hit_rate L2 cache hit rate (0-1)");
  lines.push("# TYPE cache_l2_hit_rate gauge");
  lines.push(`cache_l2_hit_rate ${stats.hitRates.l2.toFixed(4)}`);
  
  // Memory cache stats
  lines.push("# HELP cache_memory_keys Current number of keys in memory cache");
  lines.push("# TYPE cache_memory_keys gauge");
  lines.push(`cache_memory_keys ${stats.memory.keys}`);
  
  // Uptime
  lines.push("# HELP cache_uptime_seconds Cache service uptime in seconds");
  lines.push("# TYPE cache_uptime_seconds counter");
  lines.push(`cache_uptime_seconds ${Math.floor(stats.uptime.ms / 1000)}`);
  
  // Warming status
  lines.push("# HELP cache_warming_complete Whether initial cache warming is complete");
  lines.push("# TYPE cache_warming_complete gauge");
  lines.push(`cache_warming_complete ${stats.custom.warmingComplete ? 1 : 0}`);
  
  // Per-namespace metrics
  const sizeStats = getCacheSizeStats();
  lines.push("# HELP cache_namespace_files Number of cache files per namespace");
  lines.push("# TYPE cache_namespace_files gauge");
  for (const [ns, { files }] of Object.entries(sizeStats)) {
    lines.push(`cache_namespace_files{namespace="${ns}"} ${files}`);
  }
  
  lines.push("# HELP cache_namespace_bytes Total cache size per namespace in bytes");
  lines.push("# TYPE cache_namespace_bytes gauge");
  for (const [ns, { sizeBytes }] of Object.entries(sizeStats)) {
    lines.push(`cache_namespace_bytes{namespace="${ns}"} ${sizeBytes}`);
  }
  
  return lines.join("\n");
}

// =============================================================================
// Cached Fetch with Stale-While-Revalidate
// =============================================================================

/**
 * Fetch data with caching and stale-while-revalidate support
 *
 * Order of operations:
 * 1. Check L1 (memory) → return if hit
 * 2. Check L2 (file) → return if valid, populate L1
 * 3. If stale but within grace period → return stale, trigger background refresh
 * 4. Fetch fresh data, store in L1 + L2
 */
export async function cachedFetchPersistent<T>(
  namespace: CacheNamespace,
  key: string,
  fetcher: () => Promise<T>,
  customTTL?: number
): Promise<T> {
  const config = CACHE_CONFIGS[namespace];
  const fullKey = buildFullKey(namespace, key);

  // 1. Check L1 (memory)
  const l1Value = memoryCache.get<T>(fullKey);
  if (l1Value !== undefined) {
    cacheStats.l1Hits++;
    return l1Value;
  }
  cacheStats.l1Misses++;

  // 2. Check L2 (file) if configured
  if (config.persistToFile) {
    const fileEntry = readFromFile<T>(namespace, key);
    if (fileEntry) {
      const now = Date.now();
      const isExpired = now > fileEntry.expiresAt;
      const graceMs = (config.staleGracePeriod ?? 0) * 1000;
      const isWithinGrace = isExpired && now < fileEntry.expiresAt + graceMs;

      if (!isExpired) {
        // Valid cache
        cacheStats.l2Hits++;
        memoryCache.set(fullKey, fileEntry.data, config.l1TTL);
        return fileEntry.data;
      } else if (isWithinGrace) {
        // Stale but within grace period - return stale, refresh in background
        cacheStats.staleHits++;
        memoryCache.set(fullKey, fileEntry.data, 60); // Short L1 TTL

        // Trigger background refresh (don't await)
        refreshInBackground(namespace, key, fetcher, config, customTTL);

        return fileEntry.data;
      }
    }
    cacheStats.l2Misses++;
  }

  // 3. Check if there's already an in-flight request for this key
  const inFlight = inFlightRequests.get(fullKey);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  // 4. Fetch fresh data
  const promise = fetcher()
    .then((data) => {
      // Store in L1
      const l1TTL = customTTL ?? config.l1TTL;
      memoryCache.set(fullKey, data, l1TTL);

      // Store in L2 if configured
      if (config.persistToFile && config.l2TTL > 0) {
        const l2TTL = customTTL ?? config.l2TTL;
        writeToFile(namespace, key, data, l2TTL);
      }

      return data;
    })
    .finally(() => {
      inFlightRequests.delete(fullKey);
    });

  inFlightRequests.set(fullKey, promise);
  return promise;
}

/**
 * Background refresh without blocking the response
 */
async function refreshInBackground<T>(
  namespace: CacheNamespace,
  key: string,
  fetcher: () => Promise<T>,
  config: CacheConfig,
  customTTL?: number
): Promise<void> {
  const bgKey = `${namespace}:${key}:bg-refresh`;

  // Prevent duplicate background refreshes
  if (inFlightRequests.has(bgKey)) return;

  cacheStats.backgroundRefreshes++;

  const promise = fetcher()
    .then((data) => {
      const fullKey = buildFullKey(namespace, key);
      const l1TTL = customTTL ?? config.l1TTL;
      memoryCache.set(fullKey, data, l1TTL);

      if (config.persistToFile && config.l2TTL > 0) {
        const l2TTL = customTTL ?? config.l2TTL;
        writeToFile(namespace, key, data, l2TTL);
      }

      dataLogger.info({
        event: "cache_background_refresh_complete",
        namespace,
        key: key.slice(0, 50), // Truncate for logging
      });
    })
    .catch((error) => {
      dataLogger.warn({
        event: "cache_background_refresh_error",
        namespace,
        key: key.slice(0, 50),
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      inFlightRequests.delete(bgKey);
    });

  inFlightRequests.set(bgKey, promise);
}

// =============================================================================
// Cache Maintenance
// =============================================================================

/**
 * Clean up expired entries from L2 cache
 * Run this periodically (e.g., daily via cron)
 */
export function cleanupExpiredCache(): { deleted: number; errors: number } {
  let deleted = 0;
  let errors = 0;

  const namespaces = Object.keys(CACHE_CONFIGS) as CacheNamespace[];

  for (const namespace of namespaces) {
    const config = CACHE_CONFIGS[namespace];
    if (!config.persistToFile) continue;

    const dir = join(CACHE_ROOT, namespace);
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir);
    const now = Date.now();

    for (const file of files) {
      try {
        const filePath = join(dir, file);
        const content = readFileSync(filePath, "utf-8");
        const entry = JSON.parse(content) as FileCacheEntry<unknown>;

        // Delete if expired beyond grace period
        const graceMs = (config.staleGracePeriod ?? 0) * 1000;
        if (now > entry.expiresAt + graceMs) {
          unlinkSync(filePath);
          deleted++;
        }
      } catch {
        errors++;
      }
    }
  }

  dataLogger.info({
    event: "cache_cleanup_complete",
    deleted,
    errors,
  });

  return { deleted, errors };
}

/**
 * Get L2 cache size statistics
 */
export function getCacheSizeStats(): Record<CacheNamespace, { files: number; sizeBytes: number }> {
  const stats: Record<string, { files: number; sizeBytes: number }> = {};
  const namespaces = Object.keys(CACHE_CONFIGS) as CacheNamespace[];

  for (const namespace of namespaces) {
    const dir = join(CACHE_ROOT, namespace);
    if (!existsSync(dir)) {
      stats[namespace] = { files: 0, sizeBytes: 0 };
      continue;
    }

    const files = readdirSync(dir);
    let totalSize = 0;

    for (const file of files) {
      try {
        const fileStat = statSync(join(dir, file));
        totalSize += fileStat.size;
      } catch {
        // Ignore stat errors
      }
    }

    stats[namespace] = { files: files.length, sizeBytes: totalSize };
  }

  return stats as Record<CacheNamespace, { files: number; sizeBytes: number }>;
}

// =============================================================================
// Backwards Compatibility
// =============================================================================

/**
 * Backwards-compatible wrapper for the old cachedFetch API
 * Use cachedFetchPersistent for new code
 *
 * @deprecated Use cachedFetchPersistent instead
 */
export async function cachedFetch<T>(
  namespace: CacheNamespace,
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> {
  return cachedFetchPersistent(namespace, key, fetcher, ttl);
}

// =============================================================================
// Cache Warming
// =============================================================================

/**
 * Warm the cache from L2 (file) to L1 (memory) for a namespace
 * This pre-loads file cache entries into memory for faster access
 */
export function warmL1FromL2(namespace: CacheNamespace): { loaded: number; errors: number } {
  let loaded = 0;
  let errors = 0;
  
  const config = CACHE_CONFIGS[namespace];
  if (!config.persistToFile) {
    return { loaded, errors };
  }
  
  const dir = join(CACHE_ROOT, namespace);
  if (!existsSync(dir)) {
    return { loaded, errors };
  }
  
  const files = readdirSync(dir);
  const now = Date.now();
  
  for (const file of files) {
    try {
      const filePath = join(dir, file);
      const content = readFileSync(filePath, "utf-8");
      const entry = JSON.parse(content) as FileCacheEntry<unknown> & { data: unknown | string };
      
      // Skip expired entries (beyond grace period)
      const graceMs = (config.staleGracePeriod ?? 0) * 1000;
      if (now > entry.expiresAt + graceMs) {
        continue;
      }
      
      // Skip old version entries
      if (entry.v !== CACHE_VERSION) {
        continue;
      }
      
      // Decompress if needed
      let data = entry.data;
      if (entry.compressed && typeof data === "string") {
        const compressed = Buffer.from(data, "base64");
        const decompressed = gunzipSync(compressed).toString("utf-8");
        data = JSON.parse(decompressed);
      }
      
      // Extract the original key from filename (it's an MD5 hash, so we need to store differently)
      // Since we can't reverse the hash, we store with a sentinel key that includes the hash
      const keyHash = file.replace(".json", "");
      const fullKey = `${namespace}:__warm__:${keyHash}`;
      
      // Calculate remaining TTL
      const remainingTTL = Math.max(0, Math.floor((entry.expiresAt - now) / 1000));
      
      if (remainingTTL > 0) {
        memoryCache.set(fullKey, data, remainingTTL);
        loaded++;
      }
    } catch {
      errors++;
    }
  }
  
  return { loaded, errors };
}

/**
 * Cache warming configuration
 */
export interface CacheWarmingConfig {
  /** Namespaces to warm on startup */
  namespaces?: CacheNamespace[];
  /** Optional warmers that fetch fresh data */
  warmers?: Array<{
    name: string;
    warmer: () => Promise<void>;
  }>;
}

/**
 * Warm the cache on server startup
 * 
 * This function should be called from instrumentation.node.ts on server start.
 * It performs two types of warming:
 * 
 * 1. **L2 → L1 warming**: Loads existing file cache entries into memory
 * 2. **Fresh data warming**: Calls provided warmers to fetch fresh data
 * 
 * @example
 * ```typescript
 * // In instrumentation.node.ts
 * import { warmCache } from "@/lib/cache-service";
 * 
 * export async function register() {
 *   await warmCache({
 *     namespaces: ["youtube-channels", "trending"],
 *     warmers: [
 *       { name: "youtube-channels", warmer: async () => { await getYouTubeChannelTrailers() } },
 *     ],
 *   });
 * }
 * ```
 */
export async function warmCache(config: CacheWarmingConfig = {}): Promise<void> {
  const startTime = Date.now();
  
  dataLogger.info({
    event: "cache_warming_start",
  });
  
  // Default namespaces to warm (quota-sensitive ones)
  const namespacesToWarm = config.namespaces ?? [
    "youtube-channels",
    "youtube",
    "person",
  ];
  
  // Phase 1: Warm L1 from L2 for specified namespaces
  let totalLoaded = 0;
  let totalErrors = 0;
  
  for (const namespace of namespacesToWarm) {
    const { loaded, errors } = warmL1FromL2(namespace);
    totalLoaded += loaded;
    totalErrors += errors;
    
    if (loaded > 0 || errors > 0) {
      dataLogger.debug({
        event: "cache_warming_namespace",
        namespace,
        loaded,
        errors,
      });
    }
  }
  
  // Phase 2: Run custom warmers (if provided)
  let warmerResults: Array<{ name: string; success: boolean; durationMs: number }> = [];
  
  if (config.warmers && config.warmers.length > 0) {
    warmerResults = await Promise.all(
      config.warmers.map(async ({ name, warmer }) => {
        const warmerStart = Date.now();
        try {
          await warmer();
          return { name, success: true, durationMs: Date.now() - warmerStart };
        } catch (error) {
          dataLogger.warn({
            event: "cache_warmer_error",
            name,
            error: error instanceof Error ? error.message : String(error),
          });
          return { name, success: false, durationMs: Date.now() - warmerStart };
        }
      })
    );
  }
  
  cacheStats.warmingComplete = true;
  const totalDuration = Date.now() - startTime;
  
  dataLogger.info({
    event: "cache_warming_complete",
    l2ToL1: { loaded: totalLoaded, errors: totalErrors },
    warmers: warmerResults,
    durationMs: totalDuration,
  });
}

/**
 * Check if cache warming is complete
 */
export function isWarmingComplete(): boolean {
  return cacheStats.warmingComplete;
}

/**
 * Mark cache warming as complete (for manual control)
 */
export function setWarmingComplete(): void {
  cacheStats.warmingComplete = true;
}
