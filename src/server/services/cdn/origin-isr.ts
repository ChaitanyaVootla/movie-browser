/**
 * Origin ISR invalidation for exact page paths.
 *
 * Why not `revalidatePath()`: it needs a request work-store and throws from a
 * background task (our callers run after the render returned), and before Oct
 * 2026 it was a silent no-op for pages under `cache-handler.cjs` anyway. The
 * bounded handler instead exposes `invalidateKeys` on a process-wide registry
 * (`globalThis[Symbol.for("movie-browser.bounded-isr")]`), shared across module
 * instances. The background refresh runs in the same `next` process (PM2
 * fork, 1 instance), so it reaches the live stores — memory LRU included.
 *
 * Deleting (not marking stale) is deliberate: a stale-marked entry would be
 * served once more (SWR), and the very next reload is exactly the request we
 * need to be fresh. The cost is one synchronous re-render on the next hit.
 *
 * Kill switch: ORIGIN_ISR_INVALIDATE=off. Absent registry (dev without the
 * custom handler, unit tests, CLI scripts — a separate process) = no-op.
 */

const REGISTRY = Symbol.for("movie-browser.bounded-isr");

interface BoundedIsrRegistry {
  invalidateKeys: (keys: string[]) => Promise<number>;
}

function isRegistry(v: unknown): v is BoundedIsrRegistry {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { invalidateKeys?: unknown }).invalidateKeys === "function"
  );
}

/** Resolves to the number of cached entries removed (0 when unavailable). Never throws. */
export async function invalidateOriginIsr(paths: string[]): Promise<number> {
  if (paths.length === 0 || process.env.ORIGIN_ISR_INVALIDATE === "off") return 0;
  const reg: unknown = (globalThis as Record<symbol, unknown>)[REGISTRY];
  if (!isRegistry(reg)) return 0;
  try {
    return await reg.invalidateKeys(paths);
  } catch {
    return 0;
  }
}
