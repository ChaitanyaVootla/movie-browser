/**
 * Next.js Node.js Instrumentation
 *
 * This file runs once when the Node.js server starts.
 * The `.node.ts` suffix ensures this is ONLY loaded in Node.js runtime (not Edge).
 *
 * Handles:
 * - DNS configuration (IPv4 first)
 * - Cache warming from L2 (file) to L1 (memory)
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

  // Start the L2 cache janitor: sweeps expired entries + enforces size caps
  // so the on-disk .cache/ can't grow unbounded (previously hit 22GB).
  const { startCacheJanitor } = await import("@/lib/cache-service");
  startCacheJanitor();
  console.log("[startup] Cache janitor started");
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
