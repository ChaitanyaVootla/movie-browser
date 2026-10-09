/**
 * In-process cache for the taste baseline (spec §6): the catalog population
 * size, per-facet-key catalog counts and the popularity/year quantiles. All of
 * it moves slowly (catalog-wide), so it is cached for 24h per process and only
 * ever fetched for the facet keys a user actually has.
 *
 * Population B = non-adult titles with ≥ BASELINE_MIN_VOTES TMDB votes; when
 * that is smaller than BASELINE_MIN_SIZE (a sparse dev DB) it falls back to the
 * whole non-adult catalog. AI facets (theme/mood) use the enriched catalog
 * (rows in ai_data) as their population.
 */
import {
  BASELINE_MIN_SIZE,
  BASELINE_MIN_VOTES,
} from "@/lib/taste/constants";
import type { CatalogQuantiles, FacetBaseline, FacetType } from "@/lib/taste/types";
import {
  countAllBaseline,
  countEnrichedBaseline,
  countVoteBaseline,
  fetchBaselineCounts,
  fetchCatalogQuantiles,
  type BaselineMode,
} from "@/server/db/postgres/social/taste";

const TTL_MS = 24 * 60 * 60 * 1000;
/** Bound the per-key map (~50k entries ≈ a few MB). */
const MAX_KEYS = 50_000;

interface Population {
  mode: BaselineMode;
  catalogSize: number;
  enrichedSize: number;
  at: number;
}

let population: Population | null = null;
let populationPromise: Promise<Population> | null = null;
let quantiles: { value: CatalogQuantiles; at: number; mode: BaselineMode } | null = null;
const counts = new Map<string, { n: number; at: number }>();

async function loadPopulation(): Promise<Population> {
  const now = Date.now();
  if (population && now - population.at < TTL_MS) return population;
  if (!populationPromise) {
    populationPromise = (async () => {
      const voteSize = await countVoteBaseline(BASELINE_MIN_VOTES);
      const useVotes = voteSize >= BASELINE_MIN_SIZE;
      const catalogSize = useVotes ? voteSize : await countAllBaseline();
      const enrichedSize = await countEnrichedBaseline();
      population = { mode: useVotes ? "votes" : "all", catalogSize, enrichedSize, at: Date.now() };
      return population;
    })().finally(() => {
      populationPromise = null;
    });
  }
  return populationPromise;
}

const cacheKey = (mode: BaselineMode, type: FacetType, key: string) => `${mode}|${type}|${key}`;

function remember(k: string, n: number, at: number): void {
  if (counts.size >= MAX_KEYS) {
    // Map iteration order is insertion order → drop the oldest ~10%.
    let drop = Math.ceil(MAX_KEYS / 10);
    for (const old of counts.keys()) {
      counts.delete(old);
      if (--drop <= 0) break;
    }
  }
  counts.set(k, { n, at });
}

/**
 * Baseline lookups for the given facet keys (missing ones are fetched, absent
 * keys are cached as 0) plus catalog quantiles. Throws on DB failure — the
 * caller keeps serving the last stored snapshot.
 */
export async function getBaseline(
  needed: ReadonlyMap<FacetType, ReadonlySet<string>>
): Promise<{ baseline: FacetBaseline; catalog: CatalogQuantiles | null }> {
  const pop = await loadPopulation();
  const now = Date.now();

  await Promise.all(
    [...needed.entries()].map(async ([type, keys]) => {
      const missing = [...keys].filter((k) => {
        const hit = counts.get(cacheKey(pop.mode, type, k));
        return !hit || now - hit.at >= TTL_MS;
      });
      if (missing.length === 0) return;
      const found = await fetchBaselineCounts(type, missing, pop.mode, BASELINE_MIN_VOTES);
      for (const k of missing) remember(cacheKey(pop.mode, type, k), found.get(k) ?? 0, now);
    })
  );

  if (!quantiles || quantiles.mode !== pop.mode || now - quantiles.at >= TTL_MS) {
    quantiles = { value: await fetchCatalogQuantiles(pop.mode, BASELINE_MIN_VOTES), at: now, mode: pop.mode };
  }

  const baseline: FacetBaseline = {
    count: (type, key) => counts.get(cacheKey(pop.mode, type, key))?.n ?? 0,
    size: (type) => (type === "theme" || type === "mood" ? pop.enrichedSize : pop.catalogSize),
  };
  const catalog = quantiles.value.popularity.length >= 2 ? quantiles.value : null;
  return { baseline, catalog };
}

/** Test hook: forget everything. */
export function resetBaselineCache(): void {
  population = null;
  populationPromise = null;
  quantiles = null;
  counts.clear();
}
