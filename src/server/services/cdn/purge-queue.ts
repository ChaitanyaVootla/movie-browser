/**
 * In-process debounce + rate-limit queue for Cloudflare purges.
 *
 * Shape of the problem: changes arrive one title at a time from background
 * refreshes (crawler-driven most of the time), while Cloudflare Free allows
 * prefix purges at only 5 requests/min PER ACCOUNT (bucket 25), ≤100 items
 * per request. So:
 *  - a quiet site purges a changed title ~`debounceMs` after the change
 *    (the "reload right after the live SSE update" case);
 *  - under load, titles coalesce into batches of ≤`maxBatch`, one call per
 *    token, tokens refilling at `refillMs` — default 3 calls/min, leaving
 *    2/min + the burst bucket for humans / other tooling on the account;
 *  - the pending set is deduped by title and capped at `maxPending` (newest
 *    dropped, counted) so a crawl storm can never grow memory unbounded.
 *
 * Why in-process and not a PG/ClickHouse "dirty" table + PM2 cron: the change
 * signal is born in this process, the latency target is seconds (a cron is
 * minutes), and the work is a lossy cache-freshness hint — losing the queue
 * on restart is harmless (a deploy cold-starts the ISR namespace anyway, and
 * the edge copy expires on its own s-maxage + SWR within ~2h).
 */

import { titleKey, type TitleRef } from "./paths";

export interface PurgeQueueOptions {
  /** Called with ≤maxBatch titles. Must not throw (errors are swallowed anyway). */
  send: (batch: TitleRef[]) => Promise<void>;
  debounceMs?: number;
  maxBatch?: number;
  bucketCapacity?: number;
  refillMs?: number;
  maxPending?: number;
  now?: () => number;
}

export interface PurgeQueueStats {
  pending: number;
  sentBatches: number;
  sentTitles: number;
  dropped: number;
}

export class PurgeQueue {
  private readonly send: PurgeQueueOptions["send"];
  private readonly debounceMs: number;
  private readonly maxBatch: number;
  private readonly capacity: number;
  private readonly refillMs: number;
  private readonly maxPending: number;
  private readonly now: () => number;

  private readonly pending = new Map<string, TitleRef>();
  private tokens: number;
  private lastRefill: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private stats: PurgeQueueStats = { pending: 0, sentBatches: 0, sentTitles: 0, dropped: 0 };

  constructor(opts: PurgeQueueOptions) {
    this.send = opts.send;
    this.debounceMs = opts.debounceMs ?? 3_000;
    // 2 files (page + .md) per title → 50 titles = the 100-item API cap.
    this.maxBatch = opts.maxBatch ?? 50;
    this.capacity = opts.bucketCapacity ?? 3;
    this.refillMs = opts.refillMs ?? 20_000;
    this.maxPending = opts.maxPending ?? 2_000;
    this.now = opts.now ?? Date.now;
    this.tokens = this.capacity;
    this.lastRefill = this.now();
  }

  /** Queue a title. Returns false when dropped because the queue is full. */
  enqueue(ref: TitleRef): boolean {
    const key = titleKey(ref);
    if (this.pending.has(key)) {
      this.pending.set(key, ref); // keep the latest title (slug) for the key
    } else {
      if (this.pending.size >= this.maxPending) {
        this.stats.dropped++;
        return false;
      }
      this.pending.set(key, ref);
    }
    this.schedule(this.debounceMs);
    return true;
  }

  getStats(): PurgeQueueStats {
    return { ...this.stats, pending: this.pending.size };
  }

  private refill(): void {
    const now = this.now();
    if (this.tokens >= this.capacity) {
      // A full bucket earns nothing: restart the refill clock so a long idle
      // stretch cannot bank tokens beyond capacity.
      this.lastRefill = now;
      return;
    }
    const earned = Math.floor((now - this.lastRefill) / this.refillMs);
    if (earned > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + earned);
      this.lastRefill = this.tokens === this.capacity ? now : this.lastRefill + earned * this.refillMs;
    }
  }

  private msUntilToken(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.max(0, this.lastRefill + this.refillMs - this.now());
  }

  private schedule(minDelayMs: number): void {
    if (this.timer || this.flushing || this.pending.size === 0) return;
    const delay = Math.max(minDelayMs, this.msUntilToken());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
    // Never keep a CLI / test process alive just for a cache hint.
    if (typeof this.timer === "object" && this.timer && "unref" in this.timer) this.timer.unref();
  }

  /** Exposed for tests; normally driven by the timer. */
  async flush(): Promise<void> {
    if (this.flushing || this.pending.size === 0) return;
    this.refill();
    if (this.tokens < 1) {
      this.schedule(0);
      return;
    }
    this.flushing = true;
    this.tokens--;
    const batch: TitleRef[] = [];
    for (const [key, ref] of this.pending) {
      if (batch.length >= this.maxBatch) break;
      batch.push(ref);
      this.pending.delete(key);
    }
    try {
      await this.send(batch);
    } catch {
      /* purge failures are tracked by the sender; never retry-storm */
    } finally {
      this.stats.sentBatches++;
      this.stats.sentTitles += batch.length;
      this.flushing = false;
    }
    // Leftovers (or titles that arrived mid-flight) wait for the next token.
    this.schedule(0);
  }
}
