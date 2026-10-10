/**
 * Taste recommendations service (spec
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §3).
 *
 * FULL scope — the owner's own recs, shown only to the owner, never rendered
 * into ISR/edge HTML (callers are POST server actions / the Cue tool).
 * Never throws: every failure is `{ rows: [], reason: "error" }`.
 */
import {
  REC_ALGO_VERSION,
  REC_ANN_PER_QUERY,
  REC_CACHE_MAX,
  REC_CACHE_TTL_MS,
  REC_CLUSTER_ROW_MIN,
  REC_FOR_YOU_SIZE,
  REC_MAX_ANCHORS,
  REC_MAX_CLUSTER_QUERIES,
  REC_MIN_VOTES_MOVIE,
  REC_MIN_VOTES_SERIES,
  REC_POOL,
  REC_POOL_OVERFETCH,
} from "@/lib/taste/recommend-constants";
import {
  buildRecRows,
  explainItem,
  facetLabel,
  genreDistribution,
  mergeRankedLists,
  rawRelevance,
  scoreCandidates,
  type LiftedFacets,
  type RecAnchor,
  type RecCandidate,
  type RecCluster,
  type ScoredCandidate,
} from "@/lib/taste/recommend";
import type { RecItemDTO, RecReason, RecRowDTO, RecSource, RecsDTO } from "@/lib/taste/recommend-types";
import { MIN_POSITIVES_FOR_CENTROID } from "@/lib/taste/constants";
import { l2Normalize, weightedMean } from "@/lib/taste/vector";
import { RAW_SPACE, projectAll, type TasteSpace } from "@/lib/taste/space";
import { foldSignals } from "@/lib/taste/weights";
import type { TasteMediaType, TitleKey } from "@/lib/taste/types";
import { fetchTasteSignals, fetchTitleEmbeddings, isAdultKeyword } from "@/server/db/postgres/social/taste";
import {
  annCandidates,
  fetchAnchorInfo,
  fetchCandidateDetails,
  fetchPopularCandidates,
  fetchRecExclusions,
  type RecExclusions,
} from "@/server/db/postgres/social/taste-recs";
import { hasVectorIndex, type VectorTable } from "@/server/db/postgres/vector-index";
import { getRecommendations as getTmdbRecommendations } from "@/server/services/tmdb";
import { dataLogger } from "@/lib/logger";
import { getTasteClusters, getTasteProfile, getTasteSpace, getTasteVectors, type TasteSnapshot } from "./index";

// ---------------------------------------------------------------------------
// Cache (in-process LRU, insertion-ordered Map)
// ---------------------------------------------------------------------------

const cache = new Map<string, { at: number; value: RecsDTO }>();

function cacheGet(key: string): RecsDTO | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > REC_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit); // refresh recency
  return hit.value;
}

function cacheSet(key: string, value: RecsDTO): void {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > REC_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Test hook. */
export function clearRecsCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------

const TABLES: Array<{ table: VectorTable; mediaType: TasteMediaType; minVotes: number }> = [
  { table: "movies", mediaType: "movie", minVotes: REC_MIN_VOTES_MOVIE },
  { table: "series", mediaType: "series", minVotes: REC_MIN_VOTES_SERIES },
];

function splitKeys(keys: Iterable<TitleKey>): { movieIds: number[]; seriesIds: number[] } {
  const movieIds: number[] = [];
  const seriesIds: number[] = [];
  for (const k of keys) {
    const id = Number(k.slice(2));
    if (!Number.isInteger(id)) continue;
    (k.startsWith("m:") ? movieIds : seriesIds).push(id);
  }
  return { movieIds, seriesIds };
}

function excludedFor(ex: RecExclusions, table: VectorTable): number[] {
  return table === "movies" ? ex.movieIds : ex.seriesIds;
}

function liftedFrom(snapshot: TasteSnapshot | null): LiftedFacets {
  return {
    genres: snapshot?.facets.genre.map((f) => f.label) ?? [],
    languages: snapshot?.facets.language.map((f) => f.key) ?? [],
  };
}

function toItem(c: RecCandidate, source: RecSource, explanation: RecItemDTO["explanation"]): RecItemDTO {
  return {
    mediaType: c.mediaType,
    id: c.id,
    title: c.title,
    posterPath: c.posterPath,
    backdropPath: c.backdropPath,
    releaseDate: c.releaseDate,
    voteAverage: c.voteAverage,
    voteCount: c.voteCount,
    popularity: c.popularity,
    genres: c.genres,
    source,
    explanation,
  };
}

function forYouRow(items: RecItemDTO[]): RecRowDTO {
  return { id: "for-you", kind: "for_you", anchor: null, label: null, items };
}

interface UserContext {
  snapshot: TasteSnapshot | null;
  anchors: RecAnchor[];
  exclusions: RecExclusions;
}

/** Positive anchors (weighted, with embeddings + titles + genres). */
async function loadAnchors(
  userId: number,
  space: TasteSpace,
  extraEmbeddingKeys: readonly TitleKey[],
  extraInfoKeys: readonly TitleKey[] = []
): Promise<{
  anchors: RecAnchor[];
  embeddings: Map<TitleKey, number[]>;
  /** Non-adult titles among positives + extraInfoKeys (adult/missing are absent). */
  safeTitles: Set<TitleKey>;
}> {
  const signals = await fetchTasteSignals(userId);
  const positives = foldSignals(signals, "full", new Date())
    .titles.filter((t) => t.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
    .slice(0, REC_MAX_ANCHORS);
  const keys = new Set<TitleKey>([...positives.map((p) => p.key), ...extraEmbeddingKeys]);
  const { movieIds, seriesIds } = splitKeys(keys);
  const anchorIds = splitKeys(new Set([...positives.map((p) => p.key), ...extraInfoKeys]));
  const [rawEmbeddings, info] = await Promise.all([
    fetchTitleEmbeddings(movieIds, seriesIds),
    fetchAnchorInfo(anchorIds.movieIds, anchorIds.seriesIds),
  ]);
  // Anchors and cluster members live in the same space as the stored user vectors.
  const embeddings = projectAll(space, rawEmbeddings);
  const anchors: RecAnchor[] = [];
  for (const p of positives) {
    const meta = info.get(p.key);
    if (!meta) continue; // adult or missing title → never an anchor
    anchors.push({
      key: p.key,
      mediaType: p.mediaType,
      id: p.id,
      title: meta.title,
      weight: p.weight,
      genres: meta.genres,
      embedding: embeddings.get(p.key) ?? [],
    });
  }
  return { anchors, embeddings, safeTitles: new Set(info.keys()) };
}

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------

async function coldStart(ctx: UserContext, limit = REC_FOR_YOU_SIZE): Promise<RecsDTO> {
  const dist = genreDistribution(ctx.anchors.map((a) => ({ genres: a.genres, weight: a.weight })));
  const topGenres = [...dist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
  const per = Math.ceil(limit / 2) + 4;
  const fetchAll = (genres: string[] | null) =>
    Promise.all(
      TABLES.map(({ table, minVotes }) =>
        fetchPopularCandidates(table, { genres, excludeIds: excludedFor(ctx.exclusions, table), minVotes, limit: per })
      )
    );
  let [movies, series] = await fetchAll(topGenres.length ? topGenres : null);
  if (movies.length + series.length < 6 && topGenres.length) [movies, series] = await fetchAll(null);
  // Interleave media types so the row is mixed.
  const mixed: RecCandidate[] = [];
  for (let i = 0; mixed.length < limit && (i < movies.length || i < series.length); i++) {
    if (movies[i]) mixed.push(movies[i]);
    if (series[i] && mixed.length < limit) mixed.push(series[i]);
  }
  const lifted: LiftedFacets = { genres: topGenres, languages: [] };
  const items = mixed.map((c) => {
    const label = topGenres.length ? facetLabel(c, lifted) : null;
    return toItem(c, "popular", label ? { kind: "facet", label } : null);
  });
  return { rows: items.length ? [forYouRow(items)] : [], reason: "cold_start", algo: REC_ALGO_VERSION };
}

interface TmdbListItem {
  id: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  adult: boolean;
}

function parseTmdbItem(raw: unknown, mediaType: TasteMediaType): TmdbListItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const id = num(r.id);
  const title = str(mediaType === "movie" ? r.title : r.name);
  if (id === null || title === null) return null;
  return {
    id,
    title,
    posterPath: str(r.poster_path),
    backdropPath: str(r.backdrop_path),
    releaseDate: str(mediaType === "movie" ? r.release_date : r.first_air_date),
    voteAverage: num(r.vote_average),
    voteCount: num(r.vote_count),
    popularity: num(r.popularity),
    adult: r.adult === true,
  };
}

/** No HNSW index: TMDB /recommendations for the top 3 positives, RRF-merged. */
async function tmdbFallback(ctx: UserContext, limit = REC_FOR_YOU_SIZE): Promise<RecsDTO> {
  const seeds = ctx.anchors.slice(0, 3);
  const excluded = new Set([
    ...ctx.exclusions.movieIds.map((id) => `m:${id}`),
    ...ctx.exclusions.seriesIds.map((id) => `s:${id}`),
  ]);
  const lists = await Promise.all(
    seeds.map(async (seed) => {
      try {
        const res = await getTmdbRecommendations(seed.id, seed.mediaType);
        const minVotes = seed.mediaType === "movie" ? REC_MIN_VOTES_MOVIE : REC_MIN_VOTES_SERIES;
        const items = res.results
          .map((r) => parseTmdbItem(r, seed.mediaType))
          .filter((r): r is TmdbListItem => r !== null && !r.adult && (r.voteCount ?? 0) >= minVotes)
          .map((r) => ({ ...r, key: `${seed.mediaType === "movie" ? "m" : "s"}:${r.id}`, mediaType: seed.mediaType }))
          .filter((r) => !excluded.has(r.key));
        return { seed: { mediaType: seed.mediaType, id: seed.id, title: seed.title }, items };
      } catch {
        return { seed: { mediaType: seed.mediaType, id: seed.id, title: seed.title }, items: [] };
      }
    })
  );
  const merged = mergeRankedLists(lists).slice(0, limit);
  if (merged.length === 0) return coldStart(ctx, limit);
  const items: RecItemDTO[] = merged.map(({ item, seed }) => ({
    mediaType: item.mediaType,
    id: item.id,
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    releaseDate: item.releaseDate,
    voteAverage: item.voteAverage,
    voteCount: item.voteCount,
    popularity: item.popularity,
    genres: [],
    source: "tmdb",
    explanation: { kind: "because", anchor: seed },
  }));
  return { rows: [forYouRow(items)], reason: "no_index", algo: REC_ALGO_VERSION };
}

// ---------------------------------------------------------------------------
// Main path
// ---------------------------------------------------------------------------

/** Candidate embeddings projected into the taste space (unprojectable ones dropped). */
export function projectCandidates(cands: readonly RecCandidate[], space: TasteSpace): RecCandidate[] {
  if (space.kind === "raw") return [...cands];
  const out: RecCandidate[] = [];
  for (const c of cands) {
    const p = space.project(c.embedding);
    if (p) out.push({ ...c, embedding: p });
  }
  return out;
}

/** The `n` candidates with the best exact raw relevance (same formula as scoreCandidates). */
function topByRelevance(
  cands: readonly RecCandidate[],
  clusters: readonly RecCluster[],
  v: { centroid: number[] | null; negCentroid: number[] | null },
  n: number
): RecCandidate[] {
  if (cands.length <= n) return [...cands];
  const units = clusters.map((c) => c.vector);
  const centroid = v.centroid ? l2Normalize(v.centroid) : null;
  const neg = v.negCentroid ? l2Normalize(v.negCentroid) : null;
  return cands
    .map((c) => ({ c, r: rawRelevance(l2Normalize(c.embedding) ?? [], units, centroid, neg).rel }))
    .sort((a, b) => b.r - a.r || a.c.key.localeCompare(b.c.key))
    .slice(0, n)
    .map((x) => x.c);
}

/** Normalised mean of a cluster's member embeddings (falls back to the medoid). */
function clusterVector(memberKeys: readonly TitleKey[], medoidKey: TitleKey, embeddings: Map<TitleKey, number[]>) {
  const items = memberKeys
    .map((k) => embeddings.get(k))
    .filter((v): v is number[] => Array.isArray(v) && v.length > 0)
    .map((vector) => ({ vector, weight: 1 }));
  const mean = weightedMean(items);
  const v = mean ?? embeddings.get(medoidKey) ?? null;
  return v ? l2Normalize(v) : null;
}

async function computeRecs(userId: number, snapshot: TasteSnapshot | null): Promise<RecsDTO> {
  const [clusters, vectors, exclusions, current] = await Promise.all([
    getTasteClusters(userId),
    getTasteVectors(userId),
    fetchRecExclusions(userId),
    getTasteSpace(),
  ]);
  // Project candidates/anchors into the space the stored vectors were built in.
  // A stale row from another space (recompute failed) degrades to raw.
  const space = vectors.space === current.kind ? current : RAW_SPACE;
  const topClusters = [...clusters].sort((a, b) => b.importance - a.importance).slice(0, REC_MAX_CLUSTER_QUERIES);
  const { anchors, embeddings, safeTitles } = await loadAnchors(
    userId,
    space,
    topClusters.flatMap((c) => [...c.memberKeys, c.medoidKey]),
    topClusters.map((c) => c.medoidKey)
  );
  const ctx: UserContext = { snapshot, anchors, exclusions };

  if (!vectors.centroid || anchors.length < MIN_POSITIVES_FOR_CENTROID) return coldStart(ctx);

  const indexed = (
    await Promise.all(TABLES.map(async (t) => ((await hasVectorIndex(t.table)) ? t : null)))
  ).filter((t): t is (typeof TABLES)[number] => t !== null);
  if (indexed.length === 0) return tmdbFallback(ctx);

  const recClusters: RecCluster[] = [];
  topClusters.forEach((c) => {
    const v = clusterVector(c.memberKeys, c.medoidKey, embeddings);
    if (!v) return;
    // The medoid is shown as the row anchor ("Because you loved X"): it must be
    // a non-adult title (fetchAnchorInfo applies notAdult). No safe medoid → the
    // cluster is skipped entirely (no row, and its vector is not queried).
    if (!safeTitles.has(c.medoidKey)) return;
    recClusters.push({
      index: recClusters.length,
      importance: c.importance,
      label: c.label,
      medoid: { mediaType: c.medoid.mediaType, id: c.medoid.tmdbId, title: c.medoid.title, posterPath: c.medoid.posterPath },
      vector: v,
    });
  });
  const queries = [...recClusters.map((c) => c.vector), vectors.centroid];

  // Retrieval on the RAW HNSW index with (centered) query vectors. Raw
  // distances from different queries are made comparable in the centered
  // space with `dist + μ·q` (spec 2026-10-10 §2), then the best per title.
  const offsets = queries.map((q) => space.meanDot(q));
  const best = new Map<TitleKey, { table: VectorTable; id: number; dist: number }>();
  for (const t of indexed) {
    const hits = await annCandidates(t.table, queries, {
      excludeIds: excludedFor(exclusions, t.table),
      minVotes: t.minVotes,
      perQuery: REC_ANN_PER_QUERY,
    });
    for (const h of hits) {
      const key = `${t.mediaType === "movie" ? "m" : "s"}:${h.id}`;
      const dist = h.dist + (offsets[h.query] ?? 0);
      const cur = best.get(key);
      if (!cur || dist < cur.dist) best.set(key, { table: t.table, id: h.id, dist });
    }
  }
  // Over-fetch, then re-rank exactly in the taste space: the raw index misses
  // the per-title ‖x − μ‖ term, so its top REC_POOL is not the exact top.
  const fetchN = space.kind === "raw" ? REC_POOL : Math.ceil(REC_POOL * REC_POOL_OVERFETCH);
  const pool = [...best.values()].sort((a, b) => a.dist - b.dist).slice(0, fetchN);
  if (pool.length === 0) return coldStart(ctx);
  const fetched = (
    await Promise.all(
      TABLES.map((t) =>
        fetchCandidateDetails(
          t.table,
          pool.filter((p) => p.table === t.table).map((p) => p.id)
        )
      )
    )
  ).flat();
  const projected = projectCandidates(fetched, space);
  const exactPool = topByRelevance(projected, recClusters, vectors, REC_POOL);

  const scored = scoreCandidates(exactPool, {
    clusters: recClusters,
    centroid: vectors.centroid,
    negCentroid: vectors.negCentroid,
  });
  const embeddedAnchors = anchors.filter((a) => a.embedding.length > 0);
  const target = genreDistribution(anchors.map((a) => ({ genres: a.genres, weight: a.weight })));
  const { forYou, clusterRows } = buildRecRows(scored, recClusters, target);
  const lifted = liftedFrom(snapshot);
  const explainAll = (items: ScoredCandidate[]) =>
    items.map((c) => toItem(c, "taste", explainItem(c, embeddedAnchors, lifted)));

  const rows: RecRowDTO[] = [];
  if (forYou.length) rows.push(forYouRow(explainAll(forYou)));
  for (const r of clusterRows) {
    rows.push({
      id: `cluster-${r.cluster.index}`,
      kind: "because",
      anchor: r.cluster.medoid,
      label: isAdultKeyword(r.cluster.label) ? null : r.cluster.label,
      items: explainAll(r.items),
    });
  }
  return { rows, reason: "ok", algo: REC_ALGO_VERSION };
}

/**
 * The owner's recommendations (For-you + up to two cluster rows). Cached per
 * (user, taste computedAt, algo) for an hour; never throws.
 */
export async function getRecommendationsForUser(userId: number): Promise<RecsDTO> {
  const t0 = performance.now();
  try {
    const snapshot = await getTasteProfile(userId, { scope: "full" });
    const key = `${userId}:${snapshot?.computedAt ?? "none"}:${REC_ALGO_VERSION}`;
    const cached = cacheGet(key);
    // A cached result can predate a rating/watch made seconds ago (the taste
    // row recomputes lazily), so always re-filter against fresh exclusions —
    // one cheap UNION query. Also what backs Cue's "all picks are unwatched".
    if (cached) return withoutExcluded(cached, await fetchRecExclusions(userId));
    const result = await computeRecs(userId, snapshot);
    cacheSet(key, result);
    dataLogger.debug({
      action: "taste.recs",
      userId,
      reason: result.reason,
      rows: result.rows.map((r) => r.items.length),
      ms: Math.round(performance.now() - t0),
    });
    return result;
  } catch (error: unknown) {
    dataLogger.warn({
      action: "taste.recs_failed",
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { rows: [], reason: "error", algo: REC_ALGO_VERSION };
  }
}

/** Drop titles the user has engaged with since the result was computed. */
export function withoutExcluded(recs: RecsDTO, ex: RecExclusions): RecsDTO {
  const movies = new Set(ex.movieIds);
  const series = new Set(ex.seriesIds);
  const rows = recs.rows
    .map((r) => ({
      ...r,
      items: r.items.filter((it) => !(it.mediaType === "movie" ? movies : series).has(it.id)),
    }))
    .filter((r) => r.items.length >= (r.kind === "because" ? REC_CLUSTER_ROW_MIN : 1));
  return { ...recs, rows };
}

/** Flat, de-duplicated list (For-you first) — the Cue tool's view. */
export async function getRecommendationList(
  userId: number,
  opts: { mediaType?: TasteMediaType | "all"; limit?: number } = {}
): Promise<{ items: RecItemDTO[]; reason: RecReason }> {
  const recs = await getRecommendationsForUser(userId);
  const seen = new Set<string>();
  const items: RecItemDTO[] = [];
  const want = opts.mediaType ?? "all";
  for (const row of recs.rows) {
    for (const it of row.items) {
      const k = `${it.mediaType}:${it.id}`;
      if (seen.has(k) || (want !== "all" && it.mediaType !== want)) continue;
      seen.add(k);
      items.push(it);
    }
  }
  return { items: items.slice(0, opts.limit ?? 10), reason: recs.reason };
}
