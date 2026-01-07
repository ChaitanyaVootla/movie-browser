/**
 * Next.js Node.js Instrumentation
 *
 * This file runs once when the Node.js server starts.
 * The `.node.ts` suffix ensures this is ONLY loaded in Node.js runtime (not Edge).
 *
 * Handles:
 * - DNS configuration (IPv4 first)
 * - Cache warming from L2 (file) to L1 (memory)
 * - Periodic cache metrics reporting to ClickHouse
 */
import dns from "node:dns";

// Set DNS to prefer IPv4 (fixes connectivity issues with some services)
dns.setDefaultResultOrder("ipv4first");
console.log("[startup] DNS resolver set to IPv4 first");

export async function register() {
  // Warm cache from L2 to L1 on server start (background)
  warmCacheOnStartup().catch((err) => {
    console.error("[startup] Cache warming error:", err);
  });

  // Start periodic cache metrics reporting
  startCacheMetricsReporting().catch((err) => {
    console.error("[startup] Cache metrics reporting error:", err);
  });
}

/**
 * Warm the cache from persistent storage on server startup
 *
 * Pre-loads file cache entries into memory for faster access.
 * Critical for YouTube channel data to avoid API quota usage on restart.
 */
async function warmCacheOnStartup() {
  const { warmCache } = await import("@/lib/cache-service");

  await warmCache({
    namespaces: [
      "youtube-channels", // Most critical - protects YouTube quota
      "youtube", // Video stats
      "person", // Large payloads, rarely change
      "movie", // Movie details
      "series", // Series details
    ],
  });

  console.log("[startup] Cache warming complete");
}

/**
 * Start periodic cache metrics reporting to ClickHouse
 *
 * Reports cache hit rates, memory usage, compression stats every 5 minutes.
 */
async function startCacheMetricsReporting() {
  const { getCacheStats, getCacheSizeStats } = await import("@/lib/cache-service");
  const { trackCacheMetrics } = await import("@/lib/analytics/track");

  // Report metrics every 5 minutes
  const INTERVAL_MS = 5 * 60 * 1000;

  const reportMetrics = () => {
    try {
      const stats = getCacheStats();
      const sizeStats = getCacheSizeStats();

      // Map namespace size stats to the expected format
      const namespaceSizes = {
        youtube: { files: sizeStats.youtube?.files ?? 0, bytes: sizeStats.youtube?.sizeBytes ?? 0 },
        youtube_channels: { files: sizeStats["youtube-channels"]?.files ?? 0, bytes: sizeStats["youtube-channels"]?.sizeBytes ?? 0 },
        movie: { files: sizeStats.movie?.files ?? 0, bytes: sizeStats.movie?.sizeBytes ?? 0 },
        series: { files: sizeStats.series?.files ?? 0, bytes: sizeStats.series?.sizeBytes ?? 0 },
        person: { files: sizeStats.person?.files ?? 0, bytes: sizeStats.person?.sizeBytes ?? 0 },
        discover: { files: sizeStats.discover?.files ?? 0, bytes: sizeStats.discover?.sizeBytes ?? 0 },
        search: { files: sizeStats.search?.files ?? 0, bytes: sizeStats.search?.sizeBytes ?? 0 },
      };

      // Map getCacheStats() output to trackCacheMetrics() input
      trackCacheMetrics({
        l1HitRate: stats.hitRates.l1,
        l2HitRate: stats.hitRates.l2,
        l1Hits: stats.custom.l1Hits,
        l1Misses: stats.custom.l1Misses,
        l2Hits: stats.custom.l2Hits,
        l2Misses: stats.custom.l2Misses,
        staleHits: stats.custom.staleHits,
        backgroundRefreshes: stats.custom.backgroundRefreshes,
        compressionSavingsBytes: stats.custom.compressionSavings,
        compressedWrites: stats.custom.compressedWrites,
        memoryKeys: stats.memory.keys,
        fetchErrors: stats.custom.fetchErrors,
        namespaceSizes,
      });

      console.log("[cache-metrics] Reported to ClickHouse");
    } catch (error) {
      console.error("[cache-metrics] Failed to report:", error);
    }
  };

  // Report initial metrics after a short delay (30 seconds)
  setTimeout(reportMetrics, 30_000);

  // Then report every 5 minutes
  setInterval(reportMetrics, INTERVAL_MS);

  console.log("[startup] Cache metrics reporting started (every 5 minutes)");
}
