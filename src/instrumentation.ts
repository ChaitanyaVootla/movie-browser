/**
 * Next.js instrumentation file.
 * This runs once when the server starts.
 *
 * Handles:
 * - DNS configuration (IPv4 first)
 * - Cache warming from L2 (file) to L1 (memory)
 *
 * Note: The Edge runtime check is required because Next.js analyzes this file
 * for both runtimes. All Node.js-only imports MUST be dynamic inside the runtime check.
 */
export async function register() {
  // Only run in Node.js runtime (not Edge)
  // IMPORTANT: All Node.js-only modules must be dynamically imported inside this block
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamic import DNS module
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
    console.log("[startup] DNS resolver set to IPv4 first");

    // Warm cache from L2 to L1 on server start
    // This is async but we don't await it - warming happens in background
    warmCacheOnStartup().catch((err) => {
      console.error("[startup] Cache warming error:", err);
    });
  }
}

/**
 * Warm the cache from persistent storage on server startup
 *
 * This pre-loads file cache entries into memory for faster access.
 * Critical for YouTube channel data to avoid API quota usage on restart.
 *
 * Note: This function is only called from Node.js runtime context.
 * The cache-service is marked with "server-only" directive.
 */
async function warmCacheOnStartup() {
  try {
    const { warmCache } = await import("@/lib/cache-service");

    // Warm L2 → L1 for quota-sensitive namespaces
    await warmCache({
      namespaces: [
        "youtube-channels", // Most critical - protects YouTube quota
        "youtube",          // Video stats
        "person",           // Large payloads, rarely change
        "movie",            // Movie details
        "series",           // Series details
      ],
    });

    console.log("[startup] Cache warming complete");
  } catch (error) {
    // Log but don't fail - the server can still operate with cold cache
    console.error("[startup] Cache warming failed:", error);
  }
}
