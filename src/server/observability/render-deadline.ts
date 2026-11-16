/**
 * Render deadline: no single ISR render may hold its URL hostage.
 *
 * WHY (Oct 18 + Oct 29 2026): Next's ResponseCache coalesces requests per
 * cache key in a Batcher with NO timeout. If the first render's promise never
 * settles, every later request for that URL joins it until the process
 * restarts: a permanent Cloudflare 524 for that title while the rest of the
 * site is fine. On Oct 29, ~150 movie/series/person URLs were wedged in an
 * 11-day-old process (Frankenstein, Avengers: Endgame, Toy Story 5...). The
 * Oct 18 fix (a deadline on every Prisma op) fired 16 times and did not stop
 * it, so the hanging await is somewhere else. Instead of guessing it again,
 * this bounds the RENDER, whichever await hangs:
 *
 * - `installRenderDeadline` patches `handleResponse` on Next's app-page route
 *   module and races each cacheable render (`responseGenerator`) against a
 *   timer. On timeout the render rejects. Next's ResponseCache releases both
 *   Batcher keys, the waiting requests get an error (or the stale entry
 *   already served), and the next request renders afresh. The hung promise is
 *   abandoned; nothing can cancel it.
 * - Each render runs inside a RenderContext (`@/lib/render-context`), so the
 *   deadline report lists the tracked awaits still pending and the last one
 *   that settled. A watchdog logs renders that are slow but not yet dead.
 *
 * This leans on two Next internals, both pinned by render-deadline.test.ts
 * against the installed runtime: the module path below and
 * `handleResponse({ cacheKey, responseGenerator, ... })` on its prototype.
 */
import { channel } from "node:diagnostics_channel";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  activeRenders,
  beginPending,
  createRenderContext,
  describePending,
  runInRenderContext,
  type RenderContext,
} from "@/lib/render-context";
import { renderStatsWindow, startRenderStatsReporter } from "./render-stats";

/** The runtime the Turbopack production build's page chunks require. */
export const APP_PAGE_RUNTIME_MODULE =
  "next/dist/compiled/next-server/app-page-turbo.runtime.prod.js";
const APP_PAGE_RUNTIME_MODULE_DEV = "next/dist/compiled/next-server/app-page-turbo.runtime.dev.js";

/**
 * 90s: well past a normal cold render (1-16s) and a hydration-limiter queue
 * under a crawler burst, but under Cloudflare's 100s origin timeout, so a
 * visitor gets an error page (or stale-if-error) instead of a 524.
 */
export const DEFAULT_RENDER_DEADLINE_MS = 90_000;
const DEFAULT_RENDER_SLOW_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 15_000;

export class RenderDeadlineError extends Error {
  readonly cacheKey: string;
  readonly timeoutMs: number;

  constructor(cacheKey: string, timeoutMs: number) {
    super(`Render of ${cacheKey} did not settle within ${timeoutMs}ms`);
    this.name = "RenderDeadlineError";
    this.cacheKey = cacheKey;
    this.timeoutMs = timeoutMs;
  }
}

export interface RenderDeadlineReport {
  cacheKey: string;
  timeoutMs: number;
  ageMs: number;
  /** Renders abandoned at their deadline that have not settled since (incl. this one). */
  abandonedOutstanding: number;
  /** Other renders in flight at that moment: is the hang load-correlated? */
  activeRenders: number;
  rssMb: number;
  pending: Array<{ label: string; ageMs: number }>;
  startedOps: number;
  settledOps: number;
  lastSettled: { label: string; agoMs: number } | null;
}

export interface RenderDeadlineOptions {
  timeoutMs: number;
  onDeadline?: (report: RenderDeadlineReport) => void;
  onSettledAfterDeadline?: (info: { cacheKey: string; durationMs: number }) => void;
}

/** RENDER_DEADLINE_MS: a valid non-negative number wins; 0 disables. */
export function resolveRenderDeadlineMs(
  raw: string | undefined,
  fallback: number = DEFAULT_RENDER_DEADLINE_MS
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * An abandoned render keeps its memory until it settles, if ever. PM2's
 * max_memory_restart on next-server is the backstop; this count is the signal.
 */
let abandonedOutstanding = 0;

export function buildReport(ctx: RenderContext, timeoutMs: number, now: number = Date.now()) {
  const report: RenderDeadlineReport = {
    cacheKey: ctx.cacheKey,
    timeoutMs,
    ageMs: now - ctx.startedAt,
    abandonedOutstanding,
    activeRenders: activeRenders().size,
    rssMb: Math.round(process.memoryUsage().rss / 1048576),
    pending: describePending(ctx, now),
    startedOps: ctx.startedOps,
    settledOps: ctx.settledOps,
    lastSettled: ctx.lastSettled
      ? { label: ctx.lastSettled.label, agoMs: now - ctx.lastSettled.at }
      : null,
  };
  return report;
}

type ResponseGenerator = (...args: unknown[]) => unknown;
type HandleResponse = (this: unknown, args: unknown) => unknown;

interface HandleResponseArgs {
  cacheKey?: unknown;
  responseGenerator?: unknown;
}

function isHandleResponseArgs(value: unknown): value is HandleResponseArgs {
  return typeof value === "object" && value !== null;
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // Observability only.
  }
}

function guardGenerator(
  cacheKey: string,
  generator: ResponseGenerator,
  options: RenderDeadlineOptions
): ResponseGenerator {
  return (...args: unknown[]) => {
    const ctx = createRenderContext(cacheKey);
    const renders = activeRenders();
    renders.add(ctx);
    renderStatsWindow().observeActive(renders.size);
    const render = Promise.resolve().then(() => runInRenderContext(ctx, () => generator(...args)));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ctx.deadlineHit = true;
        abandonedOutstanding++;
        renders.delete(ctx);
        safely(() => renderStatsWindow().record(options.timeoutMs, "deadline"));
        // Reporting must never stop the release: this runs in a timer callback.
        safely(() => options.onDeadline?.(buildReport(ctx, options.timeoutMs)));
        reject(new RenderDeadlineError(cacheKey, options.timeoutMs));
      }, options.timeoutMs);
      timer.unref?.();

      render.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        }
      );
      // Bookkeeping only; the caller's rejection handling is above.
      render
        .then(
          () => "ok" as const,
          () => "error" as const
        )
        .then((outcome) => {
          renders.delete(ctx);
          const durationMs = Date.now() - ctx.startedAt;
          // A deadline render was already counted when its timer fired.
          if (!ctx.deadlineHit) safely(() => renderStatsWindow().record(durationMs, outcome));
          if (ctx.deadlineHit) {
            abandonedOutstanding--;
            safely(() =>
              options.onSettledAfterDeadline?.({ cacheKey, durationMs: Date.now() - ctx.startedAt })
            );
          }
        });
    });
  };
}

const PATCHED = Symbol.for("movie-browser.render-deadline");

/**
 * Patch `handleResponse` on `proto` (or the nearest prototype defining it).
 * Returns false if already patched or if there is nothing to patch.
 */
export function installRenderDeadline(proto: object, options: RenderDeadlineOptions): boolean {
  if (!(options.timeoutMs > 0)) return false;
  const target = proto as Record<string | symbol, unknown>;
  const original = target.handleResponse;
  if (typeof original !== "function") return false;
  if ((original as unknown as Record<symbol, unknown>)[PATCHED]) return false;
  const originalFn = original as HandleResponse;

  const patched: HandleResponse = function (this: unknown, args: unknown) {
    if (
      isHandleResponseArgs(args) &&
      typeof args.cacheKey === "string" &&
      args.cacheKey !== "" &&
      typeof args.responseGenerator === "function"
    ) {
      const guarded = guardGenerator(
        args.cacheKey,
        args.responseGenerator as ResponseGenerator,
        options
      );
      return originalFn.call(this, { ...args, responseGenerator: guarded });
    }
    return originalFn.call(this, args);
  };
  (patched as unknown as Record<symbol, unknown>)[PATCHED] = true;
  Object.defineProperty(proto, "handleResponse", {
    value: patched,
    writable: true,
    configurable: true,
  });
  return true;
}

// =============================================================================
// Outbound fetch tracking (undici diagnostics channels; passive, no patching)
// =============================================================================

interface UndiciRequestMessage {
  request?: { origin?: unknown; method?: unknown; path?: unknown };
}

let fetchTrackingSubscribed = false;

/**
 * Register every outbound fetch as a pending op of the render that made it.
 * Labels drop the query string (TMDB's api_key travels there).
 */
export function subscribeOutboundFetchTracking(): void {
  if (fetchTrackingSubscribed) return;
  fetchTrackingSubscribed = true;
  const ends = new WeakMap<object, () => void>();

  channel("undici:request:create").subscribe((message: unknown) => {
    const request = (message as UndiciRequestMessage).request;
    if (!request) return;
    const path = typeof request.path === "string" ? request.path.split("?")[0] : "";
    const end = beginPending(`fetch ${String(request.method)} ${String(request.origin)}${path}`);
    if (end) ends.set(request, end);
  });
  const settle = (message: unknown) => {
    const request = (message as UndiciRequestMessage).request;
    if (!request) return;
    ends.get(request)?.();
    ends.delete(request);
  };
  channel("undici:request:trailers").subscribe(settle);
  channel("undici:request:error").subscribe(settle);
}

// =============================================================================
// Production wiring (called from instrumentation.ts)
// =============================================================================

let watchdog: ReturnType<typeof setInterval> | null = null;

function startSlowRenderWatchdog(slowMs: number, log: RenderDeadlineLogger): void {
  if (watchdog) return;
  watchdog = setInterval(() => {
    const now = Date.now();
    for (const ctx of activeRenders()) {
      if (ctx.slowReported || now - ctx.startedAt < slowMs) continue;
      ctx.slowReported = true;
      renderStatsWindow().markSlow();
      safely(() => log.warn({ event: "render_slow", ...buildReport(ctx, slowMs, now) }));
    }
  }, WATCHDOG_INTERVAL_MS);
  watchdog.unref?.();
}

interface RenderDeadlineLogger {
  info: (obj: Record<string, unknown>) => void;
  warn: (obj: Record<string, unknown>) => void;
  error: (obj: Record<string, unknown>) => void;
}

export interface InstallResult {
  installed: boolean;
  timeoutMs: number;
  module?: string;
  reason?: string;
}

/**
 * Patch the app-page runtime this server loads. Uses a require rooted at the
 * app (not the bundle) so it resolves the exact file the page chunks require
 * and shares its module instance.
 */
export function installAppPageRenderDeadline(
  log: RenderDeadlineLogger,
  onDeadline?: (report: RenderDeadlineReport) => void
): InstallResult {
  const timeoutMs = resolveRenderDeadlineMs(process.env.RENDER_DEADLINE_MS);
  if (timeoutMs === 0) return { installed: false, timeoutMs, reason: "disabled" };
  const modulePath =
    process.env.NODE_ENV === "production" ? APP_PAGE_RUNTIME_MODULE : APP_PAGE_RUNTIME_MODULE_DEV;
  try {
    const requireFromApp = createRequire(join(process.cwd(), "package.json"));
    const runtime = requireFromApp(modulePath) as { AppPageRouteModule?: { prototype?: object } };
    const proto = runtime.AppPageRouteModule?.prototype;
    if (!proto) return { installed: false, timeoutMs, module: modulePath, reason: "no AppPageRouteModule" };

    const installed = installRenderDeadline(proto, {
      timeoutMs,
      onDeadline: (report) => {
        log.error({ event: "render_deadline_exceeded", ...report });
        onDeadline?.(report);
      },
      onSettledAfterDeadline: (info) => log.warn({ event: "render_settled_after_deadline", ...info }),
    });
    subscribeOutboundFetchTracking();
    const slowMs = resolveRenderDeadlineMs(process.env.RENDER_SLOW_MS, DEFAULT_RENDER_SLOW_MS);
    if (slowMs > 0) startSlowRenderWatchdog(Math.min(slowMs, timeoutMs), log);
    if (process.env.RENDER_STATS !== "off") {
      startRenderStatsReporter(log, {
        activeCount: () => activeRenders().size,
        abandoned: () => abandonedOutstanding,
      });
    }
    return { installed, timeoutMs, module: modulePath, reason: installed ? undefined : "already patched" };
  } catch (error: unknown) {
    return {
      installed: false,
      timeoutMs,
      module: modulePath,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
