/**
 * Client-side deadline for every Prisma operation.
 *
 * WHY (Oct 18 2026 incident): a Prisma promise on a page render never settled.
 * Postgres was idle (no active query, no lock wait), `statement_timeout` is 0,
 * and `pool_timeout` only bounds connection checkout, so nothing ever rejected
 * it. On an ISR route that is permanent, not slow: Next's ResponseCache Batcher
 * parks every later request for the same URL on the first, never-settling
 * render. 36 series URLs stayed wedged in one 6-day-old process and every
 * visit was a Cloudflare 524. A fresh process rendered all of them in ~1-3s.
 *
 * Rejecting at a deadline turns a hang into an ordinary render error: the
 * Batcher entry is released and the next request renders normally. The query
 * may keep running in the engine; only the JS caller stops waiting.
 *
 * Tune with PRISMA_OP_TIMEOUT_MS (0 disables). The 30s default matches the
 * interactive-transaction timeout of the hydration upserts and sits well under
 * Cloudflare's 100s origin timeout. It applies only inside the Next server:
 * cron scripts (tsx) share this client and run legitimately long aggregations
 * (taste-baseline took 302s on its first run), so they default to no deadline.
 */

export const DEFAULT_PRISMA_OP_TIMEOUT_MS = 30_000;

export class PrismaOperationTimeoutError extends Error {
  readonly label: string;
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`Prisma operation ${label} did not settle within ${timeoutMs}ms`);
    this.name = "PrismaOperationTimeoutError";
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * An explicit, valid PRISMA_OP_TIMEOUT_MS always wins. Otherwise the Next
 * server gets the default and everything else (scripts, crons) gets 0.
 */
export function resolveOperationTimeoutMs(raw: string | undefined, inNextServer: boolean): number {
  const fallback = inNextServer ? DEFAULT_PRISMA_OP_TIMEOUT_MS : 0;
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Race `operation` against a timer. The timer is cleared as soon as the
 * operation settles, so a fast query leaves nothing behind. `onTimeout` runs
 * once, before the rejection, for logging.
 */
export function withOperationDeadline<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  label: string,
  onTimeout?: (error: PrismaOperationTimeoutError) => void
): Promise<T> {
  if (!(timeoutMs > 0)) return Promise.resolve(operation);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new PrismaOperationTimeoutError(label, timeoutMs);
      onTimeout?.(error);
      reject(error);
    }, timeoutMs);
    // Never let a pending deadline keep a script process alive.
    timer.unref?.();
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
