/**
 * Next.js instrumentation hook (runs once at server startup).
 *
 * THIS IS THE ONLY SERVER INSTRUMENTATION FILE NEXT LOADS. Next auto-loads
 * `instrumentation.ts` (root or `src/`) and calls its exported `register()`.
 * There is **no `instrumentation.node.ts` convention** — a file by that name is
 * never executed. We had one for ~2.5 months and everything in it was silently
 * dead (see the L2-janitor note below). If you need node-only startup work, put
 * it HERE behind the `NEXT_RUNTIME` guard.
 */

/**
 * Start the L2 (file) cache janitor.
 *
 * WHY THIS IS LOAD-BEARING (found Aug 18 2026): `cache-service.ts` has always
 * shipped `cleanupExpiredCache()` + `enforceNamespaceSizeLimits()` and a
 * `startCacheJanitor()` that runs both hourly — but the only caller lived in
 * `src/instrumentation.node.ts`, which Next NEVER loads. So the janitor never
 * ran in production and `.cache/` grew unbounded to **44GB** against a budgeted
 * ~2.8GB (movie 800MB + person 500MB + series 500MB + discover 300MB + 200MB
 * defaults) — the single largest consumer on the 116GB root volume, and the
 * third instance of the unbounded-cache-fills-disk failure that took prod down
 * on Jun 10 (41GB ISR cache) and Jun 19 (image optimizer cache). Proof it was
 * dead: that file's module-level `console.log("[startup] DNS resolver ...")`
 * appeared 0 times in 6,000 lines of pm2 logs.
 *
 * Runs in ALL environments (production included — that is the whole point). The
 * sweep is cheap: `readdirSync` + `statSync` per namespace, and the interval is
 * unref'd so it never holds the process open.
 */
async function startL2CacheJanitor(): Promise<void> {
  try {
    const { startCacheJanitor } = await import("@/lib/cache-service");
    startCacheJanitor();
  } catch (error) {
    // Never let cache maintenance break server startup.
    console.error(
      "[startup] cache janitor failed to start:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * DEV-ONLY undici workaround. In some local runtimes (observed: Node 20/22 +
 * Next 16 Turbopack) undici crashes while decompressing gzip/br HTTP responses
 * with `TypeError: controller[kState].transformAlgorithm is not a function`.
 * The originating `fetch()` then never resolves and only rejects when its
 * AbortController fires (~20s), with retries — so EVERY compressed outbound
 * fetch (TMDB API + the proxy's slug-resolver existence check, geo, OAuth
 * userinfo, YouTube, …) stalls for ~20s and serializes behind the single dev
 * thread, saturating the whole server ("nothing loads").
 *
 * Forcing `Accept-Encoding: identity` makes upstreams return UNCOMPRESSED
 * bodies, bypassing the broken decompression path entirely. Bodies on these
 * paths are small JSON, so the bandwidth cost is negligible.
 *
 * NEVER patches in production (real undici there works fine and keeps gzip). It
 * delegates to the existing global `fetch` (so Next's data-cache wrapper still
 * runs) and never overrides a caller that already set Accept-Encoding.
 */
function patchFetchForDevUndici(): void {
  const original = globalThis.fetch;
  if (typeof original !== "function") return;
  const marker = "__identityEncodingPatched";
  if ((original as unknown as Record<string, boolean>)[marker]) return;

  const patched = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      // fetch(Request) with no init: add the header onto a cloned Request.
      if (input instanceof Request && init === undefined) {
        if (input.headers.has("accept-encoding")) return original(input);
        const headers = new Headers(input.headers);
        headers.set("accept-encoding", "identity");
        return original(new Request(input, { headers }));
      }
      const headers = new Headers(init?.headers);
      if (!headers.has("accept-encoding")) headers.set("accept-encoding", "identity");
      return original(input, { ...init, headers });
    } catch {
      // Never let the workaround break a request.
      return original(input, init);
    }
  }) as typeof fetch;

  (patched as unknown as Record<string, boolean>)[marker] = true;
  globalThis.fetch = patched;

  console.warn(
    "[dev] global fetch patched with Accept-Encoding: identity (undici decompression workaround — see src/instrumentation.ts)"
  );
}

export async function register(): Promise<void> {
  // The Edge runtime has no fs and its own fetch — nothing here applies.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Order matters only in that the janitor must NOT sit behind a dev-only
  // guard. It previously did (by living in the orphaned file), which is the bug.
  await startL2CacheJanitor();

  if (process.env.NODE_ENV === "production") return;
  patchFetchForDevUndici();
}
