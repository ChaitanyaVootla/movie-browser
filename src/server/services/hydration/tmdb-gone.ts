/**
 * Negative cache for titles TMDB has DELETED (their detail endpoint 404s)
 * while our PG row lives on.
 *
 * Why: such a row is permanently "stale" (its refresh can never succeed), so
 * every visit re-ran the background refresh — a TMDB call that 404s, an error
 * log, and, when only the enriched data was stale, a full Lambda scrape for a
 * title that no longer exists. Prod: series 324537 failed 53 times in a day.
 *
 * In-memory, per process, TTL'd (a TMDB 404 can be transient around merges /
 * re-publishes, so we retry after the TTL rather than marking PG forever) and
 * size-capped (oldest dropped — it is a Map in insertion order).
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10_000;

export function isTmdbNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.includes("TMDB API error: 404");
}

export class TmdbGoneCache {
  private readonly entries = new Map<string, number>();

  constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly maxEntries = MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  private key(mediaType: "movie" | "series", id: number): string {
    return `${mediaType}:${id}`;
  }

  /** True while a recent TMDB 404 says refreshing this title is pointless. */
  has(mediaType: "movie" | "series", id: number): boolean {
    const k = this.key(mediaType, id);
    const expires = this.entries.get(k);
    if (expires === undefined) return false;
    if (expires <= this.now()) {
      this.entries.delete(k);
      return false;
    }
    return true;
  }

  mark(mediaType: "movie" | "series", id: number): void {
    const k = this.key(mediaType, id);
    this.entries.delete(k);
    this.entries.set(k, this.now() + this.ttlMs);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Process-wide instance used by the hydration background refresh. */
export const tmdbGone = new TmdbGoneCache(
  Number(process.env.TMDB_GONE_TTL_MS) > 0 ? Number(process.env.TMDB_GONE_TTL_MS) : DEFAULT_TTL_MS,
);
