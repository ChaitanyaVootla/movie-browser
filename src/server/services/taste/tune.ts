/**
 * Tune bar + Surprise me (taste v2 spec 2026-10-12 §3.4–§3.5). Re-ranks the
 * CACHED candidate pool — never a new ANN query (acceptance #3). When the
 * filters leave fewer than REC_TUNE_MIN_SURVIVORS, the row is topped up from
 * popular titles with the same filters (source `popular`, explanation
 * `popular`), so it never goes empty and the thinning taste signal is visible.
 */
import {
  REC_FOR_YOU_SIZE,
  REC_SHUFFLE_JITTER,
  REC_SHUFFLE_LAMBDA,
  REC_TUNE_MIN_SURVIVORS,
} from "@/lib/taste/recommend-constants";
import {
  explainItem,
  greedySelect,
  type GenreDist,
  type LiftedFacets,
  type RecCandidate,
  type ScoredCandidate,
  type UnitAnchor,
} from "@/lib/taste/recommend";
import type { RecItemDTO, RecRowDTO, TuneParams, TuneToken } from "@/lib/taste/recommend-types";
import {
  ERA_CLASSIC_BEFORE,
  ERA_RECENT_FROM,
  matchesTune,
  popularLabel,
  seededRandom,
  type TuneChip,
} from "@/lib/taste/tune-filter";
import { fetchPopularTuned, type PopularTuneFilters, type RecExclusions } from "@/server/db/postgres/social/taste-recs";
import { excludedFor, REC_TABLES } from "./rec-fallbacks";
import { exclusionKeys, forYouRow, stripShuffle, toItem } from "./rec-dto";

/** What a recs computation caches for re-ranking (units are Float32, embeddings dropped). */
export interface RecPool {
  scored: ScoredCandidate[];
  target: GenreDist | null;
  lifted: LiftedFacets;
  forYouAnchors: UnitAnchor[];
  chips: TuneChip[];
  tuneAvailable: Partial<Record<TuneToken, number>>;
}

export interface RetuneOptions {
  shuffle?: number;
  /** Keys on screen ("m:603") — Surprise me never repeats them. */
  exclude?: readonly string[];
}

/** Pure part: filter + re-rank the pool. Exported for tests. */
export function rerankPool(
  pool: RecPool,
  tune: TuneParams,
  opts: RetuneOptions,
  excluded: ReadonlySet<string>,
  k = REC_FOR_YOU_SIZE
): ScoredCandidate[] {
  const survivors = pool.scored.filter((c) => !excluded.has(c.key) && matchesTune(c, tune));
  if (opts.shuffle === undefined) return greedySelect(survivors, { k, calibrationTarget: pool.target });

  // Surprise: never the titles on screen nor the deterministic top for this
  // tune — unless that would starve the row, then only the on-screen ones.
  const onScreen = new Set(opts.exclude ?? []);
  const deterministic = new Set(greedySelect(survivors, { k, calibrationTarget: pool.target }).map((c) => c.key));
  let candidates = survivors.filter((c) => !onScreen.has(c.key) && !deterministic.has(c.key));
  if (candidates.length < REC_TUNE_MIN_SURVIVORS) candidates = survivors.filter((c) => !onScreen.has(c.key));
  const rand = seededRandom(Math.floor(opts.shuffle));
  const jitter = new Map(candidates.map((c) => [c.key, rand()]));
  return greedySelect(candidates, {
    k,
    lambda: REC_SHUFFLE_LAMBDA,
    calibrationTarget: pool.target,
    scoreOf: (c) => c.score + REC_SHUFFLE_JITTER * (jitter.get(c.key) ?? 0),
  });
}

function sqlFilters(tune: TuneParams): PopularTuneFilters {
  return {
    genreSlugs: tune.genres,
    languages: tune.languages,
    maxRuntime: tune.maxRuntime,
    yearBefore: tune.era === "classic" ? ERA_CLASSIC_BEFORE : undefined,
    yearFrom: tune.era === "recent" ? ERA_RECENT_FROM : undefined,
  };
}

/** Popular titles passing the whole tune (SQL filters + tone/moods in JS), interleaved by media type. */
async function popularTopUp(
  tune: TuneParams,
  ex: RecExclusions,
  skip: ReadonlySet<string>,
  limit: number,
  chipLabel: (t: TuneToken) => string | undefined
): Promise<RecItemDTO[]> {
  if (limit <= 0) return [];
  const tables = REC_TABLES.filter((t) => !tune.media || t.mediaType === tune.media);
  const lists = await Promise.all(
    tables.map((t) =>
      fetchPopularTuned(t.table, {
        filters: sqlFilters(tune),
        excludeIds: excludedFor(ex, t.table),
        minVotes: t.minVotes,
        // Tone/moods are filtered after the fetch (they live in ai_data).
        limit: (tune.tone || tune.moods?.length ? 4 : 1) * (limit + 4),
      })
    )
  );
  const pass = lists.map((l) => l.filter((c) => !skip.has(c.key) && matchesTune(c, tune)));
  const mixed: RecCandidate[] = [];
  for (let i = 0; mixed.length < limit && pass.some((l) => i < l.length); i++) {
    for (const l of pass) if (l[i] && mixed.length < limit) mixed.push(l[i]);
  }
  const label = popularLabel(tune, chipLabel);
  return mixed.map((c) => toItem(c, "popular", { kind: "popular", label }));
}

/** The tuned / shuffled For-you row. */
export async function retuneForYou(
  pool: RecPool,
  tune: TuneParams,
  opts: RetuneOptions,
  ex: RecExclusions
): Promise<RecRowDTO> {
  const excluded = exclusionKeys(ex);
  const picks = rerankPool(pool, tune, opts, excluded);
  const items = picks.map((c) => toItem(c, "taste", explainItem(c, pool.forYouAnchors, pool.lifted)));
  if (items.length < REC_TUNE_MIN_SURVIVORS) {
    const skip = new Set([...picks.map((c) => c.key), ...(opts.exclude ?? [])]);
    const labels = new Map(pool.chips.map((c) => [c.token, c.label]));
    items.push(...(await popularTopUp(tune, ex, skip, REC_FOR_YOU_SIZE - items.length, (t) => labels.get(t))));
  }
  return forYouRow(items, stripShuffle(tune));
}
