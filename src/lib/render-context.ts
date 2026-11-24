/**
 * Per-render context: which awaits an ISR render is still waiting on.
 *
 * WHY (Oct 29 2026): a render that never settles wedges its URL for the life
 * of the process (Next's ResponseCache Batcher parks every later request on
 * it). Twice the culprit could not be named from a live inspector, because a
 * pending promise carries no record of what created it. So the render
 * deadline (`server/observability/render-deadline.ts`) runs each ISR render
 * inside this AsyncLocalStorage, and the main await points register here
 * (Prisma ops, cache-service fetches, the hydration limiter, outbound fetch).
 * When a render is slow or hits its deadline, the log lists what was still
 * pending and the last thing that settled.
 *
 * Dependency-free on purpose: imported by the Prisma client, cache-service
 * and hydration. Outside a tracked render every helper is a no-op.
 *
 * The storage and the active set live on globalThis because instrumentation.ts
 * and the page chunks are separate bundles; a module-level instance would
 * exist twice and the page code would never see the store that
 * instrumentation opened.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface PendingOp {
  label: string;
  startedAt: number;
}

/**
 * Router headers on the request that started a render. A prefetch without
 * `rsc` is the shape that wedged ISR URLs in Nov 2026 (see
 * server/observability/orphan-flight-headers.ts).
 */
export interface RequestShape {
  rsc: boolean;
  prefetch: string | null;
  stateTree: boolean;
  segmentPrefetch: boolean;
}

export interface RenderContext {
  cacheKey: string;
  /** Set by the render deadline from the request that started the render. */
  request?: RequestShape | null;
  startedAt: number;
  pending: Set<PendingOp>;
  startedOps: number;
  settledOps: number;
  lastSettled: { label: string; at: number } | null;
  slowReported: boolean;
  deadlineHit: boolean;
}

interface RenderContextGlobals {
  storage: AsyncLocalStorage<RenderContext>;
  active: Set<RenderContext>;
}

const GLOBAL_KEY = Symbol.for("movie-browser.render-context");

function globals(): RenderContextGlobals {
  const holder = globalThis as unknown as Record<symbol, RenderContextGlobals | undefined>;
  let value = holder[GLOBAL_KEY];
  if (!value) {
    value = { storage: new AsyncLocalStorage<RenderContext>(), active: new Set() };
    holder[GLOBAL_KEY] = value;
  }
  return value;
}

/** Renders currently in flight (removed when the render itself settles). */
export function activeRenders(): Set<RenderContext> {
  return globals().active;
}

export function createRenderContext(cacheKey: string, now: number = Date.now()): RenderContext {
  return {
    cacheKey,
    startedAt: now,
    pending: new Set(),
    startedOps: 0,
    settledOps: 0,
    lastSettled: null,
    slowReported: false,
    deadlineHit: false,
  };
}

/** Run `fn` with `ctx` as the current render context for everything it awaits. */
export function runInRenderContext<T>(ctx: RenderContext, fn: () => T): T {
  return globals().storage.run(ctx, fn);
}

export function currentRenderContext(): RenderContext | undefined {
  return globals().storage.getStore();
}

/**
 * Register an operation that has started. Returns the function that marks it
 * settled, or null outside a tracked render. Calling the returned function
 * more than once is harmless.
 */
export function beginPending(label: string): (() => void) | null {
  const ctx = globals().storage.getStore();
  if (!ctx) return null;
  const op: PendingOp = { label, startedAt: Date.now() };
  ctx.pending.add(op);
  ctx.startedOps++;
  return () => {
    if (!ctx.pending.delete(op)) return;
    ctx.settledOps++;
    ctx.lastSettled = { label, at: Date.now() };
  };
}

/**
 * Track a promise for the current render. Returns the SAME promise (identity
 * matters: callers may hand back a PrismaPromise), only observing it.
 */
export function trackPending<P extends PromiseLike<unknown>>(label: string, promise: P): P {
  const end = beginPending(label);
  if (end) promise.then(end, end);
  return promise;
}

/** Oldest-first summary of what a render is still waiting on. */
export function describePending(
  ctx: RenderContext,
  now: number = Date.now(),
  limit = 15
): Array<{ label: string; ageMs: number }> {
  return [...ctx.pending]
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(0, limit)
    .map((op) => ({ label: op.label, ageMs: now - op.startedAt }));
}
