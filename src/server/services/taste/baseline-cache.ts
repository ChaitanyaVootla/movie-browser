/**
 * Request-path access to the taste baseline (spec §6). Reads ONLY the
 * precomputed `taste_facet_baseline` / `taste_baseline_meta` tables (PK
 * lookups by key) — the catalog scans that fill them run in the nightly
 * `taste-baseline` cron (scripts/refresh-taste-baseline.ts). Never a scan here.
 *
 * Fresh env (meta row missing): `size()` returns 0, which liftFacets treats as
 * "no baseline" → a uniform prior over the user's own facet values; catalog
 * quantiles are null → percentile axes are simply omitted.
 *
 * In-process cache: meta for 1h, per-key counts for 1h (bounded map).
 */
import type { CatalogQuantiles, FacetBaseline, FacetType } from "@/lib/taste/types";
import {
  readBaselineCounts,
  readBaselineMeta,
  readEmbeddingStats,
  type BaselineMeta,
} from "@/server/db/postgres/social/taste";
import { RAW_SPACE, makeTasteSpace, type TasteSpace } from "@/lib/taste/space";
import { TASTE_SPACE_WHITEN } from "@/lib/taste/constants";
import { dataLogger } from "@/lib/logger";

const TTL_MS = 60 * 60 * 1000;
const MAX_KEYS = 50_000;

let meta: { value: BaselineMeta | null; at: number } | null = null;
const counts = new Map<string, { n: number; at: number }>();

const cacheKey = (type: FacetType, key: string) => `${type}|${key}`;

function remember(k: string, n: number, at: number): void {
  if (counts.size >= MAX_KEYS) {
    let drop = Math.ceil(MAX_KEYS / 10); // insertion order → oldest first
    for (const old of counts.keys()) {
      counts.delete(old);
      if (--drop <= 0) break;
    }
  }
  counts.set(k, { n, at });
}

export async function getBaseline(
  needed: ReadonlyMap<FacetType, ReadonlySet<string>>
): Promise<{ baseline: FacetBaseline; catalog: CatalogQuantiles | null }> {
  const now = Date.now();
  if (!meta || now - meta.at >= TTL_MS) meta = { value: await readBaselineMeta(), at: now };
  const m = meta.value;

  if (m) {
    await Promise.all(
      [...needed.entries()].map(async ([type, keys]) => {
        const missing = [...keys].filter((k) => {
          const hit = counts.get(cacheKey(type, k));
          return !hit || now - hit.at >= TTL_MS;
        });
        if (missing.length === 0) return;
        const found = await readBaselineCounts(type, missing);
        for (const k of missing) remember(cacheKey(type, k), found.get(k) ?? 0, now);
      })
    );
  }

  const baseline: FacetBaseline = {
    count: (type, key) => counts.get(cacheKey(type, key))?.n ?? 0,
    size: (type) => (!m ? 0 : type === "theme" || type === "mood" ? m.enrichedSize : m.catalogSize),
  };
  const catalog =
    m && m.popularityQuantiles.length >= 2 && m.yearQuantiles.length >= 2
      ? { popularity: m.popularityQuantiles, year: m.yearQuantiles }
      : null;
  return { baseline, catalog };
}

/** Test hook: forget everything. */
export function resetBaselineCache(): void {
  meta = null;
  counts.clear();
  spaceCache = null;
}

// ---------------------------------------------------------------------------
// Embedding space (spec 2026-10-10-taste-vector-upgrades.md §2)
// ---------------------------------------------------------------------------

/** After a failed read, retry this soon (not after the full TTL). */
export const SPACE_RETRY_MS = 60 * 1000;

export interface TasteSpaceState {
  space: TasteSpace;
  /** When the cron computed μ (null in raw space). Rows computed before it are stale. */
  meanAt: Date | null;
  /**
   * False only when the space could not be read and no earlier good value
   * exists in this process. `space` is then RAW_SPACE as a placeholder: callers
   * must not treat it as authoritative (no "space mismatch → recompute", no
   * row written in it).
   */
  known: boolean;
}

let spaceCache: (TasteSpaceState & { at: number; ttl: number }) | null = null;

async function readSpace(): Promise<TasteSpaceState> {
  const stats = await readEmbeddingStats();
  if (!stats) return { space: RAW_SPACE, meanAt: null, known: true };
  const space = makeTasteSpace({ mean: stats.mean, std: stats.std, whiten: TASTE_SPACE_WHITEN });
  return { space, meanAt: space.kind === "raw" ? null : stats.computedAt, known: true };
}

/**
 * The current embedding space: mean-centered when the nightly cron has stored
 * a catalog mean, raw when it has not (fresh env). One PK read per hour per
 * process. `fresh: true` bypasses the cache (the recompute path, so a new row
 * is always built on the latest committed μ) and refreshes it for readers.
 *
 * A failed read NEVER downgrades a known centered space to raw: that would
 * make every centered row look stale, recompute it in raw, and flip it back an
 * hour later (review finding, Oct 10 2026). It keeps the last good value and
 * retries after SPACE_RETRY_MS; with no good value yet it reports
 * `known: false`.
 */
export async function getTasteSpaceState(opts: { fresh?: boolean } = {}): Promise<TasteSpaceState> {
  const now = Date.now();
  if (!opts.fresh && spaceCache && now - spaceCache.at < spaceCache.ttl) {
    return { space: spaceCache.space, meanAt: spaceCache.meanAt, known: spaceCache.known };
  }
  try {
    const state = await readSpace();
    spaceCache = { ...state, at: now, ttl: TTL_MS };
    return state;
  } catch (error: unknown) {
    const last = spaceCache?.known ? spaceCache : null;
    dataLogger.warn({
      action: "taste.space_read_failed",
      keptLastGood: last !== null,
      error: error instanceof Error ? error.message : String(error),
    });
    const state: TasteSpaceState = last
      ? { space: last.space, meanAt: last.meanAt, known: true }
      : { space: RAW_SPACE, meanAt: null, known: false };
    spaceCache = { ...state, at: now, ttl: SPACE_RETRY_MS };
    return state;
  }
}

/** The current embedding space (see getTasteSpaceState). */
export async function getTasteSpace(): Promise<TasteSpace> {
  return (await getTasteSpaceState()).space;
}

/** Test hook. */
export function resetTasteSpaceCache(): void {
  spaceCache = null;
}
