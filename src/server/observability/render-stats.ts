/**
 * Per-minute render + process stats: ONE `render_stats` log line a minute.
 *
 * WHY (Nov 16 2026, web-1 = 2 vCPU / 4 GB): the only render-side signal was
 * `render_slow` (one line per render >30s — 41k lines / 20 MB in 11.5h while
 * the box was saturated, and nothing at all when it was healthy). There was no
 * way to answer "how many cold renders a minute, how long, how many in flight,
 * how lagged is the event loop" without reading the whole log. This keeps a
 * cheap in-memory window fed by the render-deadline wrapper (which already
 * sees every cacheable render start and settle) and flushes it once a minute.
 *
 * Cost: an array push per render, one `monitorEventLoopDelay` histogram
 * (native, ~free), one log line + (prod) one ~400-byte appendFile per minute.
 *
 * Read it: `grep '"render_stats"' next-out.log` (tail -c first on the box), or
 * the durable copy `~/metrics/render-stats-YYYY-MM-DD.jsonl` via
 * `node scripts/metrics-report.cjs`. See performance.md "Metrics".
 */
import { appendFile, mkdir } from "node:fs/promises";
import { homedir, loadavg } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";

export type RenderOutcome = "ok" | "error" | "deadline";

/** Bound per-window samples: a saturated minute is a few hundred renders. */
const MAX_SAMPLES = 5000;

export interface RenderWindowSnapshot {
  renders: number;
  ok: number;
  errors: number;
  deadline: number;
  slow: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  maxActive: number;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** Accumulates one reporting window. Pure (no clock, no I/O). */
export class RenderStatsWindow {
  private durations: number[] = [];
  private counts = { ok: 0, errors: 0, deadline: 0, slow: 0 };
  private maxActive = 0;

  record(durationMs: number, outcome: RenderOutcome): void {
    if (outcome === "ok") this.counts.ok++;
    else if (outcome === "error") this.counts.errors++;
    else this.counts.deadline++;
    if (this.durations.length < MAX_SAMPLES) this.durations.push(durationMs);
  }

  markSlow(): void {
    this.counts.slow++;
  }

  observeActive(active: number): void {
    if (active > this.maxActive) this.maxActive = active;
  }

  /** Snapshot and reset. */
  take(): RenderWindowSnapshot {
    const sorted = [...this.durations].sort((a, b) => a - b);
    const snap: RenderWindowSnapshot = {
      renders: this.counts.ok + this.counts.errors + this.counts.deadline,
      ok: this.counts.ok,
      errors: this.counts.errors,
      deadline: this.counts.deadline,
      slow: this.counts.slow,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted.length ? sorted[sorted.length - 1] : null,
      maxActive: this.maxActive,
    };
    this.durations = [];
    this.counts = { ok: 0, errors: 0, deadline: 0, slow: 0 };
    this.maxActive = 0;
    return snap;
  }
}

// One window per process, on globalThis for the same reason as render-context:
// instrumentation.ts and the page chunks are separate bundles.
const GLOBAL_KEY = Symbol.for("movie-browser.render-stats");

export function renderStatsWindow(): RenderStatsWindow {
  const holder = globalThis as unknown as Record<symbol, RenderStatsWindow | undefined>;
  let w = holder[GLOBAL_KEY];
  if (!w) {
    w = new RenderStatsWindow();
    holder[GLOBAL_KEY] = w;
  }
  return w;
}

interface StatsLogger {
  info: (obj: Record<string, unknown>) => void;
}

let reporter: ReturnType<typeof setInterval> | null = null;
let eld: IntervalHistogram | null = null;

const ms = (ns: number) => Math.round(ns / 1e6);
const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

/** Build the per-minute line. Exported for the test. */
export function buildRenderStatsLine(
  snap: RenderWindowSnapshot,
  p: {
    intervalMs: number;
    active: number;
    abandoned: number;
    eventLoop: { p50: number; p99: number; max: number } | null;
    mem: NodeJS.MemoryUsage;
    load: number[];
    now: Date;
  }
): Record<string, unknown> {
  return {
    event: "render_stats",
    time: p.now.toISOString(),
    intervalMs: p.intervalMs,
    ...snap,
    active: p.active,
    abandonedOutstanding: p.abandoned,
    eventLoopP50Ms: p.eventLoop ? ms(p.eventLoop.p50) : null,
    eventLoopP99Ms: p.eventLoop ? ms(p.eventLoop.p99) : null,
    eventLoopMaxMs: p.eventLoop ? ms(p.eventLoop.max) : null,
    rssMb: mb(p.mem.rss),
    heapUsedMb: mb(p.mem.heapUsed),
    externalMb: mb(p.mem.external),
    load1: Math.round(p.load[0] * 100) / 100,
  };
}

/**
 * Start the once-a-minute reporter (idempotent). `activeCount` / `abandoned`
 * come from render-deadline so this module stays free of its internals.
 */
export function startRenderStatsReporter(
  log: StatsLogger,
  sources: { activeCount: () => number; abandoned: () => number },
  options: { intervalMs?: number; fileDir?: string | null } = {}
): void {
  if (reporter) return;
  const intervalMs = options.intervalMs ?? 60_000;
  const fileDir =
    options.fileDir !== undefined
      ? options.fileDir
      : process.env.NODE_ENV === "production" && process.env.JOB_METRICS_DIR !== "off"
        ? process.env.JOB_METRICS_DIR || join(homedir(), "metrics")
        : null;
  try {
    eld = monitorEventLoopDelay({ resolution: 20 });
    eld.enable();
  } catch {
    eld = null;
  }
  const window = renderStatsWindow();
  reporter = setInterval(() => {
    try {
      const line = buildRenderStatsLine(window.take(), {
        intervalMs,
        active: sources.activeCount(),
        abandoned: sources.abandoned(),
        eventLoop: eld ? { p50: eld.percentile(50), p99: eld.percentile(99), max: eld.max } : null,
        mem: process.memoryUsage(),
        load: loadavg(),
        now: new Date(),
      });
      eld?.reset();
      log.info(line);
      if (fileDir) {
        const file = join(fileDir, `render-stats-${String(line.time).slice(0, 10)}.jsonl`);
        void mkdir(fileDir, { recursive: true })
          .then(() => appendFile(file, JSON.stringify(line) + "\n"))
          .catch(() => undefined);
      }
    } catch {
      // stats must never hurt the server
    }
  }, intervalMs);
  reporter.unref?.();
}
