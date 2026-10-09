/**
 * Composes the pure taste math into one profile for a scope (spec §4–§8, §11).
 * The service calls this twice per recompute — once with scope "full" (stored
 * in the vector/facet/axes/clusters columns, private recs) and once with
 * "public" (stored as `public_snapshot` + `public_centroid`, the only thing
 * /u/* may render). Pure: no DB, no clock (pass `now`).
 */
import { z } from "zod";
import { computeAxes, type AxisPositive, type AxisRated, type TasteAxis } from "./axes";
import { rocchioCentroid } from "./centroid";
import { wardClusters } from "./cluster";
import { liftFacets, rankPeople, type FacetStat, type PersonStat } from "./lift";
import { MOODS_TOP_K } from "./constants";
import { foldSignals } from "./weights";
import {
  FACET_TYPES,
  type CatalogQuantiles,
  type FacetBaseline,
  type FacetType,
  type PersonInfo,
  type TasteScope,
  type TitleKey,
  type TitleMeta,
  type TitleRef,
  type TitleSignals,
} from "./types";

export interface TasteComputeInput {
  signals: readonly TitleSignals[];
  meta: ReadonlyMap<TitleKey, TitleMeta>;
  embeddings: ReadonlyMap<TitleKey, ArrayLike<number>>;
  people: ReadonlyMap<string, PersonInfo>;
  baseline: FacetBaseline;
  catalog: CatalogQuantiles | null;
  now: Date;
}

export interface TasteClusterView {
  medoid: TitleRef;
  size: number;
  importance: number;
  label: string;
  topFacets: string[];
}

/** FULL cluster detail for the recs path (member keys are private). */
export interface TasteCluster extends TasteClusterView {
  medoidKey: TitleKey;
  memberKeys: TitleKey[];
}

export type TasteFacets = Record<FacetType, FacetStat[]>;

export interface TasteSnapshot {
  v: 1;
  computedAt: string;
  scope: TasteScope;
  positiveCount: number;
  signalCount: number;
  axes: TasteAxis[];
  moods: FacetStat[];
  facets: TasteFacets;
  people: { mostWatched: PersonStat[]; highestRated: PersonStat[] };
  clusters: TasteClusterView[];
}

export interface TasteComputeResult {
  snapshot: TasteSnapshot;
  centroid: number[] | null;
  negCentroid: number[] | null;
  clusters: TasteCluster[];
  meanScore: number;
}

// ---------------------------------------------------------------------------
// Runtime schema for stored snapshots (Json columns are untrusted on read).
// ---------------------------------------------------------------------------
const TitleRefSchema = z.object({
  mediaType: z.enum(["movie", "series"]),
  tmdbId: z.number(),
  title: z.string(),
  posterPath: z.string().nullable(),
});
const FacetStatSchema = z.object({
  type: z.enum(FACET_TYPES as unknown as [FacetType, ...FacetType[]]),
  key: z.string(),
  label: z.string(),
  count: z.number(),
  lift: z.number(),
  score: z.number(),
  titles: z.array(TitleRefSchema),
});
const PersonStatSchema = z.object({
  tmdbId: z.number(),
  name: z.string(),
  profilePath: z.string().nullable(),
  role: z.enum(["director", "cast"]),
  count: z.number(),
  avgScore: z.number().nullable(),
  shrunkScore: z.number().nullable(),
  ratedCount: z.number(),
});
const AxisSchema = z.object({
  key: z.enum(["mainstream", "era", "range", "rating", "weight"]),
  value: z.number(),
  support: z.number(),
  lowLabel: z.string(),
  highLabel: z.string(),
  caption: z.string(),
});
const ClusterViewSchema = z.object({
  medoid: TitleRefSchema,
  size: z.number(),
  importance: z.number(),
  label: z.string(),
  topFacets: z.array(z.string()),
});

export const TasteSnapshotSchema = z.object({
  v: z.literal(1),
  computedAt: z.string(),
  scope: z.enum(["full", "public"]),
  positiveCount: z.number(),
  signalCount: z.number(),
  axes: z.array(AxisSchema),
  moods: z.array(FacetStatSchema),
  facets: z.record(z.string(), z.array(FacetStatSchema)),
  people: z.object({ mostWatched: z.array(PersonStatSchema), highestRated: z.array(PersonStatSchema) }),
  clusters: z.array(ClusterViewSchema),
});

export const TasteClusterSchema = ClusterViewSchema.extend({
  medoidKey: z.string(),
  memberKeys: z.array(z.string()),
});

/** Parse a stored snapshot; null when the shape is off (→ caller recomputes). */
export function parseTasteSnapshot(raw: unknown): TasteSnapshot | null {
  const parsed = TasteSnapshotSchema.safeParse(raw);
  if (!parsed.success) return null;
  const facets = Object.fromEntries(
    FACET_TYPES.map((t) => [t, parsed.data.facets[t] ?? []])
  ) as TasteFacets;
  return { ...parsed.data, facets };
}

export function emptyFacets(): TasteFacets {
  return Object.fromEntries(FACET_TYPES.map((t) => [t, [] as FacetStat[]])) as TasteFacets;
}

// ---------------------------------------------------------------------------

function clusterFacets(
  memberKeys: readonly string[],
  weights: ReadonlyMap<string, number>,
  meta: ReadonlyMap<TitleKey, TitleMeta>,
  baseline: FacetBaseline
): string[] {
  const items = memberKeys
    .map((k) => {
      const m = meta.get(k);
      return m ? { key: k, ref: m.ref, weight: weights.get(k) ?? 0, facets: m.facets } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const minSupport = Math.min(2, items.length);
  const stats = (["genre", "theme", "keyword"] as const).flatMap((t) =>
    liftFacets(t, items, baseline, { minSupport, k: 3 })
  );
  const seen = new Set<string>();
  return stats
    .sort((a, b) => b.score - a.score)
    .map((s) => s.label)
    .filter((l) => (seen.has(l.toLowerCase()) ? false : (seen.add(l.toLowerCase()), true)))
    .slice(0, 3);
}

export function computeTasteProfile(input: TasteComputeInput, scope: TasteScope): TasteComputeResult {
  const { meta, embeddings, baseline, catalog, now } = input;
  const { titles, meanScore } = foldSignals(input.signals, scope, now);
  const positives = titles.filter((t) => t.weight > 0);
  const weights = new Map(titles.map((t) => [t.key, t.weight]));

  // Centroid over every weighted title that has an embedding.
  const embedded = titles
    .map((t) => {
      const vector = embeddings.get(t.key);
      return vector ? { key: t.key, weight: t.weight, vector } : null;
    })
    .filter((x): x is { key: string; weight: number; vector: ArrayLike<number> } => x !== null);
  const { centroid, negCentroid } = rocchioCentroid(embedded);

  // Facets over positives.
  const liftItems = positives
    .map((t) => {
      const m = meta.get(t.key);
      return m ? { key: t.key, ref: m.ref, weight: t.weight, facets: m.facets } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const facets = emptyFacets();
  for (const type of FACET_TYPES) {
    if (type === "director" || type === "cast") continue; // people get their own ranking
    facets[type] = liftFacets(type, liftItems, baseline);
  }
  facets.director = liftFacets("director", liftItems, baseline, { k: 6 });
  facets.cast = liftFacets("cast", liftItems, baseline, { k: 6 });
  const moods = [...facets.theme, ...facets.mood]
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, MOODS_TOP_K);

  // People (watched or rated titles, not just positives).
  const people = rankPeople(
    titles.map((t) => ({
      key: t.key,
      weight: t.weight,
      watched: t.watched,
      score: t.score,
      facets: meta.get(t.key)?.facets ?? [],
    })),
    input.people,
    meanScore
  );

  // Axes.
  const axisPositives: AxisPositive[] = positives
    .map((t) => meta.get(t.key) && { t, m: meta.get(t.key) as TitleMeta })
    .filter((x): x is { t: (typeof positives)[number]; m: TitleMeta } => Boolean(x))
    .map(({ t, m }) => ({
      weight: t.weight,
      popularity: m.popularity,
      year: m.year,
      genres: m.facets.filter((f) => f.type === "genre").map((f) => f.key),
      mood: m.mood,
    }));
  const rated: AxisRated[] = titles
    .filter((t) => t.score !== null)
    .map((t) => ({ score: t.score as number, tmdbAvg: meta.get(t.key)?.tmdbAvg ?? null }));
  const axes = computeAxes(axisPositives, rated, catalog);

  // Clusters over positives with embeddings.
  const clusterResults = wardClusters(embedded.filter((e) => e.weight > 0));
  const clusters: TasteCluster[] = clusterResults
    .map((c) => {
      const medoidMeta = meta.get(c.medoidKey);
      if (!medoidMeta) return null;
      const topFacets = clusterFacets(c.memberKeys, weights, meta, baseline);
      const firstGenre = medoidMeta.facets.find((f) => f.type === "genre")?.label;
      return {
        medoid: medoidMeta.ref,
        medoidKey: c.medoidKey,
        memberKeys: c.memberKeys,
        size: c.size,
        importance: c.importance,
        label: topFacets[0] ?? firstGenre ?? medoidMeta.ref.title,
        topFacets,
      };
    })
    .filter((c): c is TasteCluster => c !== null);

  const snapshot: TasteSnapshot = {
    v: 1,
    computedAt: now.toISOString(),
    scope,
    positiveCount: positives.length,
    signalCount: titles.length,
    axes,
    moods,
    facets,
    people,
    clusters: clusters.map(({ medoidKey: _k, memberKeys: _m, ...view }) => view),
  };
  return { snapshot, centroid, negCentroid, clusters, meanScore };
}
