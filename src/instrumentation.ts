/**
 * Next.js instrumentation hook (runs once at server startup).
 *
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
 * NEVER patches in production (real undici there works fine and keeps gzip) and
 * only in the Node.js runtime (the Edge runtime has its own fetch). It delegates
 * to the existing global `fetch` (so Next's data-cache wrapper still runs) and
 * never overrides a caller that already set Accept-Encoding.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "production") return;

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

  // eslint-disable-next-line no-console
  console.warn(
    "[dev] global fetch patched with Accept-Encoding: identity (undici decompression workaround — see src/instrumentation.ts)"
  );
}
