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

let spaceCache: { value: TasteSpace; at: number } | null = null;

/**
 * The current embedding space: mean-centered when the nightly cron has stored
 * a catalog mean, raw otherwise (fresh env). One PK read per hour per process;
 * a failed read degrades to raw (and is retried after the TTL).
 */
export async function getTasteSpace(): Promise<TasteSpace> {
  const now = Date.now();
  if (spaceCache && now - spaceCache.at < TTL_MS) return spaceCache.value;
  let value: TasteSpace = RAW_SPACE;
  try {
    const stats = await readEmbeddingStats();
    if (stats) value = makeTasteSpace({ mean: stats.mean, std: stats.std, whiten: TASTE_SPACE_WHITEN });
  } catch {
    value = RAW_SPACE;
  }
  spaceCache = { value, at: now };
  return value;
}

/** Test hook. */
export function resetTasteSpaceCache(): void {
  spaceCache = null;
}
