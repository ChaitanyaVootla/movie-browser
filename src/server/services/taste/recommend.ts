/**
 * Taste recommendations service (specs
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §3 and
 * 2026-10-12-taste-experience-v2-design.md §3, §6).
 *
 * FULL scope — the owner's own recs, shown only to the owner, never rendered
 * into ISR/edge HTML (callers are POST server actions / the Cue tools).
 * Never throws: every failure is `{ rows: [], reason: "error" }`.
 *
 * One computation per (user, taste computedAt, REC_ALGO_VERSION) produces the
 * untuned rows AND the scored candidate pool; both are cached. Tune / Surprise
 * re-rank the cached pool (services/taste/tune.ts) — no new ANN.
 */
import {
  REC_ALGO_VERSION,
  REC_ANN_PER_QUERY,
  REC_CACHE_MAX,
  REC_CACHE_TTL_MS,
  REC_CLUSTER_ROW_MIN,
  REC_MAX_ANCHORS,
  REC_MAX_CLUSTER_QUERIES,
  REC_POOL,
  REC_POOL_CACHE_MAX,
  REC_POOL_OVERFETCH,
} from "@/lib/taste/recommend-constants";
import {
  anchorClusterRow,
  buildRecRows,
  explainItem,
  genreDistribution,
  rawRelevance,
  scoreCandidates,
  withUnits,
  type LiftedFacets,
  type RecAnchor,
  type RecCandidate,
  type RecCluster,
  type UnitAnchor,
} from "@/lib/taste/recommend";
import type {
  GetHomeRecsOptions,
  HomeRecsDTO,
  RecItemDTO,
  RecReason,
  RecRowDTO,
  RecsDTO,
  TuneParams,
} from "@/lib/taste/recommend-types";
import { isEmptyTune } from "@/lib/taste/tune-tokens";
import { tuneAvailability, userTuneChips, FIXED_TUNE_CHIPS } from "@/lib/taste/tune-filter";
import { MIN_POSITIVES_FOR_CENTROID } from "@/lib/taste/constants";
import { l2Normalize, weightedMean } from "@/lib/taste/vector";
import { RAW_SPACE, projectAll, resolveStoredSpace, type TasteSpace } from "@/lib/taste/space";
import { foldSignals } from "@/lib/taste/weights";
import type { TasteMediaType, TitleKey } from "@/lib/taste/types";
import { fetchTasteSignals, fetchTitleEmbeddings, isAdultKeyword } from "@/server/db/postgres/social/taste";
import {
  annCandidates,
  fetchAnchorInfo,
  fetchCandidateDetails,
  fetchRecExclusions,
  type RecExclusions,
} from "@/server/db/postgres/social/taste-recs";
import { hasVectorIndex, type VectorTable } from "@/server/db/postgres/vector-index";
import { dataLogger } from "@/lib/logger";
import { getTasteClusters, getTasteProfile, getTasteSpace, getTasteVectors, type TasteSnapshot } from "./index";
import { coldStart, excludedFor, REC_TABLES, tmdbFallback, type UserContext } from "./rec-fallbacks";
import { forYouRow, itemKey, thumbOf, toItem } from "./rec-dto";
import { retuneForYou, type RecPool } from "./tune";

export { getMoreLikeThisForUser } from "./more-like-this";
export type { RecPool } from "./tune";

// ---------------------------------------------------------------------------
// Cache (in-process LRU, insertion-ordered Map)
// ---------------------------------------------------------------------------

interface CacheEntry {
  recs: RecsDTO;
  /** Scored candidate pool for Tune / Surprise / sharpen (null for fallbacks). */
  pool: RecPool | null;
}

const cache = new Map<string, { at: number; value: CacheEntry }>();

/**
 * Concurrent cache misses for one key share ONE computation (same pattern as
 * `startRecompute` in ./index): a home load, a Cue call and a retry arriving
 * together would otherwise each run up to 8 HNSW scans at ef_search 1000.
 */
const inflight = new Map<string, Promise<CacheEntry>>();

function cacheGet(key: string): CacheEntry | null {
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

function cacheSet(key: string, value: CacheEntry): void {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > REC_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  // Pools carry ~1MB of Float32 vectors each: bound them separately (oldest first).
  let pools = 0;
  for (const v of cache.values()) if (v.value.pool) pools++;
  for (const [k, v] of cache) {
    if (pools <= REC_POOL_CACHE_MAX) break;
    if (v.value.pool) {
      cache.delete(k);
      pools--;
    }
  }
}

/** Test hook. */
export function clearRecsCache(): void {
  cache.clear();
  inflight.clear();
}

/** Drop every cached rec result for a user (rec feedback, calibration answers). */
export function evictRecsCache(userId: number): void {
  const prefix = `${userId}:`;
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
}

// ---------------------------------------------------------------------------

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

function liftedFrom(snapshot: TasteSnapshot | null): LiftedFacets {
  return {
    genres: snapshot?.facets.genre.map((f) => f.label) ?? [],
    languages: snapshot?.facets.language.map((f) => f.key) ?? [],
    moods: (snapshot?.moods ?? []).filter((m) => !isAdultKeyword(m.label)).map((m) => ({ key: m.key, label: m.label })),
  };
}

/** Positive anchors (weighted, with embeddings + titles + genres) + member anchors for the given keys. */
async function loadAnchors(
  userId: number,
  space: TasteSpace,
  extraEmbeddingKeys: readonly TitleKey[],
  memberKeys: readonly TitleKey[] = []
): Promise<{
  anchors: RecAnchor[];
  embeddings: Map<TitleKey, number[]>;
  /** Cluster members as anchors (non-adult, positive weight). */
  members: Map<TitleKey, RecAnchor>;
}> {
  const signals = await fetchTasteSignals(userId);
  const folded = foldSignals(signals, "full", new Date()).titles.filter((t) => t.weight > 0);
  const weights = new Map(folded.map((t) => [t.key, t]));
  const positives = [...folded]
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
    .slice(0, REC_MAX_ANCHORS);
  const keys = new Set<TitleKey>([...positives.map((p) => p.key), ...extraEmbeddingKeys, ...memberKeys]);
  const { movieIds, seriesIds } = splitKeys(keys);
  const anchorIds = splitKeys(new Set([...positives.map((p) => p.key), ...memberKeys]));
  const [rawEmbeddings, info] = await Promise.all([
    fetchTitleEmbeddings(movieIds, seriesIds),
    fetchAnchorInfo(anchorIds.movieIds, anchorIds.seriesIds),
  ]);
  // Anchors and cluster members live in the same space as the stored user vectors.
  const embeddings = projectAll(space, rawEmbeddings);
  const toAnchor = (key: TitleKey): RecAnchor | null => {
    const w = weights.get(key);
    const meta = info.get(key);
    if (!w || !meta) return null; // adult, missing or not a positive → never an anchor
    return {
      key,
      mediaType: w.mediaType,
      id: w.id,
      title: meta.title,
      posterPath: meta.posterPath,
      weight: w.weight,
      genres: meta.genres,
      embedding: embeddings.get(key) ?? [],
    };
  };
  const anchors = positives.map((p) => toAnchor(p.key)).filter((a): a is RecAnchor => a !== null);
  const members = new Map<TitleKey, RecAnchor>();
  for (const k of memberKeys) {
    const a = toAnchor(k);
    if (a) members.set(k, a);
  }
  return { anchors, embeddings, members };
}

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

/** Float32 copy of a unit vector (halves the cached pool) and the full embedding dropped. */
function compact<T extends { embedding: number[]; unit: ArrayLike<number> }>(x: T): T {
  return { ...x, embedding: [], unit: Float32Array.from(x.unit) };
}

/** A computed result plus whether it may be cached under the taste-version key. */
interface ComputedRecs {
  value: CacheEntry;
  cacheable: boolean;
}

async function computeRecs(userId: number, snapshot: TasteSnapshot | null): Promise<ComputedRecs> {
  const [clusters, vectors, exclusions, current] = await Promise.all([
    getTasteClusters(userId),
    getTasteVectors(userId),
    fetchRecExclusions(userId),
    getTasteSpace(),
  ]);
  // Project candidates/anchors into the space the stored vectors were built in.
  // A stored raw row can be served in raw space; any other mismatch (a
  // centered row while the space read failed, centered vs whitened) has no
  // correct projection → no vector ranking at all: the distance-free TMDB
  // fallback (→ cold start), NOT cached (the mismatch is transient).
  const space = resolveStoredSpace(vectors.space, current);
  if (!space) {
    dataLogger.warn({ action: "taste.recs_space_mismatch", userId, stored: vectors.space, current: current.kind });
    const { anchors } = await loadAnchors(userId, RAW_SPACE, []);
    return { value: { recs: await tmdbFallback({ snapshot, anchors, exclusions }), pool: null }, cacheable: false };
  }
  return { value: await computeRecsInSpace(userId, snapshot, space, clusters, vectors, exclusions), cacheable: true };
}

async function computeRecsInSpace(
  userId: number,
  snapshot: TasteSnapshot | null,
  space: TasteSpace,
  clusters: Awaited<ReturnType<typeof getTasteClusters>>,
  vectors: Awaited<ReturnType<typeof getTasteVectors>>,
  exclusions: RecExclusions
): Promise<CacheEntry> {
  const topClusters = [...clusters].sort((a, b) => b.importance - a.importance).slice(0, REC_MAX_CLUSTER_QUERIES);
  const { anchors, embeddings, members } = await loadAnchors(
    userId,
    space,
    topClusters.map((c) => c.medoidKey),
    topClusters.flatMap((c) => c.memberKeys)
  );
  const ctx: UserContext = { snapshot, anchors, exclusions };
  const noPool = async (p: Promise<RecsDTO>): Promise<CacheEntry> => ({ recs: await p, pool: null });

  if (!vectors.centroid || anchors.length < MIN_POSITIVES_FOR_CENTROID) return noPool(coldStart(ctx));

  const indexed = (
    await Promise.all(REC_TABLES.map(async (t) => ((await hasVectorIndex(t.table)) ? t : null)))
  ).filter((t): t is (typeof REC_TABLES)[number] => t !== null);
  if (indexed.length === 0) return noPool(tmdbFallback(ctx));

  const recClusters: RecCluster[] = [];
  const clusterSizes = new Map<number, number>();
  topClusters.forEach((c) => {
    const v = clusterVector(c.memberKeys, c.medoidKey, embeddings);
    if (!v) return;
    clusterSizes.set(recClusters.length, c.size);
    recClusters.push({
      index: recClusters.length,
      importance: c.importance,
      label: c.label,
      medoid: { mediaType: c.medoid.mediaType, id: c.medoid.tmdbId, title: c.medoid.title, posterPath: c.medoid.posterPath },
      vector: v,
      memberKeys: c.memberKeys,
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
  if (pool.length === 0) return noPool(coldStart(ctx));
  const fetched = (
    await Promise.all(
      REC_TABLES.map((t) =>
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
  const forYouAnchors = withUnits(anchors);
  const target = genreDistribution(anchors.map((a) => ({ genres: a.genres, weight: a.weight })));
  const { forYou, clusterRows } = buildRecRows(scored, recClusters, target);
  const lifted = liftedFrom(snapshot);

  const rows: RecRowDTO[] = [];
  if (forYou.length) {
    rows.push(forYouRow(forYou.map((c) => toItem(c, "taste", explainItem(c, forYouAnchors, lifted)))));
  }
  for (const r of clusterRows) {
    // One-why model (v2 §3.1): explain against THIS cluster's members only.
    const memberAnchors: UnitAnchor[] = withUnits(
      (r.cluster.memberKeys ?? []).map((k) => members.get(k)).filter((a): a is RecAnchor => a !== undefined)
    );
    const anchored = anchorClusterRow(r.items, memberAnchors, lifted);
    if (anchored.items.length < REC_CLUSTER_ROW_MIN) continue;
    rows.push({
      id: `cluster-${r.cluster.index}`,
      kind: "because",
      anchors: anchored.anchors.map(thumbOf),
      label: isAdultKeyword(r.cluster.label) ? null : r.cluster.label,
      items: anchored.items.map(({ item, explanation }) => toItem(item, "taste", explanation)),
      tune: null,
      groupSize: clusterSizes.get(r.cluster.index) ?? memberAnchors.length,
      members: [...memberAnchors].sort((a, b) => b.weight - a.weight).slice(0, 12).map(thumbOf),
    });
  }

  const chips = [
    ...FIXED_TUNE_CHIPS,
    ...userTuneChips({
      genres: snapshot?.facets.genre ?? [],
      languages: snapshot?.facets.language ?? [],
      moods: (snapshot?.moods ?? []).filter((m) => !isAdultKeyword(m.label)),
    }),
  ];
  const cachedPool: RecPool = {
    scored: scored.map(compact),
    target,
    lifted,
    forYouAnchors: forYouAnchors.map(compact),
    chips,
    tuneAvailable: tuneAvailability(
      scored,
      chips.map((c) => c.token)
    ),
  };
  return { recs: { rows, reason: "ok", algo: REC_ALGO_VERSION }, pool: cachedPool };
}

function computeRecsOnce(key: string, userId: number, snapshot: TasteSnapshot | null): Promise<CacheEntry> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = computeRecs(userId, snapshot)
    .then(({ value, cacheable }) => {
      if (cacheable) cacheSet(key, value);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const ERROR_RECS: RecsDTO = { rows: [], reason: "error", algo: REC_ALGO_VERSION };

/**
 * Cached computation + fresh exclusions. A cached result can predate a rating
 * / watch / dismissal made seconds ago (the taste row recomputes lazily), so
 * every read re-filters against fresh exclusions — one cheap UNION query.
 * Also what backs Cue's "all picks are unwatched". Throws on failure.
 */
async function loadEntry(
  userId: number
): Promise<{ entry: CacheEntry; exclusions: RecExclusions; snapshot: TasteSnapshot | null }> {
  const t0 = performance.now();
  const snapshot = await getTasteProfile(userId, { scope: "full" });
  const key = `${userId}:${snapshot?.computedAt ?? "none"}:${REC_ALGO_VERSION}`;
  const cached = cacheGet(key);
  if (cached) return { entry: cached, exclusions: await fetchRecExclusions(userId), snapshot };
  const entry = await computeRecsOnce(key, userId, snapshot);
  // Re-read AFTER the computation, even on a miss: an in-flight joiner may have
  // started before a dismissal, and the popular top-up (a NEW catalog query)
  // needs the real ids — empty exclusions here let it surface watched titles.
  const exclusions = await fetchRecExclusions(userId);
  dataLogger.debug({
    action: "taste.recs",
    userId,
    reason: entry.recs.reason,
    rows: entry.recs.rows.map((r) => r.items.length),
    ms: Math.round(performance.now() - t0),
  });
  return { entry, exclusions, snapshot };
}

function logFailure(userId: number, error: unknown): void {
  dataLogger.warn({
    action: "taste.recs_failed",
    userId,
    error: error instanceof Error ? error.message : String(error),
  });
}

/**
 * The owner's recommendations (For-you + up to two cluster rows), untuned.
 * Cached per (user, taste computedAt, algo) for an hour; never throws.
 */
export async function getRecommendationsForUser(userId: number): Promise<RecsDTO> {
  try {
    const { entry, exclusions } = await loadEntry(userId);
    return withoutExcluded(entry.recs, exclusions);
  } catch (error: unknown) {
    logFailure(userId, error);
    return ERROR_RECS;
  }
}

/**
 * Home rows + Tune metadata (taste v2 §3.5, §6.3) — the service behind the
 * `getHomeRecs` action and Cue's `steer_recs`. A non-empty `tune` or a
 * `shuffle` nonce re-ranks the cached pool for the For-you row (no new ANN);
 * the because rows stay untuned (minus anything the tuned row now shows).
 * Without a pool (cold start / no index / error) tune is ignored. Never throws.
 */
export async function getHomeRecsForUser(
  userId: number,
  tune?: TuneParams,
  opts: GetHomeRecsOptions = {}
): Promise<HomeRecsDTO> {
  try {
    const { entry, exclusions, snapshot } = await loadEntry(userId);
    const base = withoutExcluded(entry.recs, exclusions);
    const pool = entry.pool;
    const meta = {
      tuneAvailable: pool?.tuneAvailable ?? {},
      tuneChips: pool?.chips ?? [],
      positiveCount: snapshot?.positiveCount ?? 0,
    };
    const shuffle = opts.shuffle ?? tune?.shuffle;
    if (!pool || (isEmptyTune(tune) && shuffle === undefined)) return { ...base, ...meta };

    const forYou = await retuneForYou(pool, tune ?? {}, { shuffle, exclude: opts.exclude }, exclusions);
    const taken = new Set(forYou.items.map(itemKey));
    const rest = base.rows
      .filter((r) => r.kind !== "for_you")
      .map((r) => ({ ...r, items: r.items.filter((it) => !taken.has(itemKey(it))) }))
      .map(pruneAnchors)
      .filter((r) => r.items.length >= REC_CLUSTER_ROW_MIN);
    return { ...base, rows: [forYou, ...rest], ...meta };
  } catch (error: unknown) {
    logFailure(userId, error);
    return { ...ERROR_RECS, tuneAvailable: {}, tuneChips: [], positiveCount: 0 };
  }
}

/** The cached scored pool (sharpen-mode calibration). null without one. Never throws. */
export async function getRecPoolForUser(userId: number): Promise<RecPool | null> {
  try {
    return (await loadEntry(userId)).entry.pool;
  } catch (error: unknown) {
    logFailure(userId, error);
    return null;
  }
}

/** Heading anchors no remaining item cites are dropped (the heading names only the set its cards use). */
function pruneAnchors(row: RecRowDTO): RecRowDTO {
  if (row.kind !== "because") return row;
  const cited = new Set(
    row.items.flatMap((it) => (it.explanation?.kind === "because" ? [itemKey(it.explanation.anchor)] : []))
  );
  return { ...row, anchors: row.anchors.filter((a) => cited.has(itemKey(a))) };
}

/** Drop titles the user has engaged with (or dismissed) since the result was computed. */
export function withoutExcluded(recs: RecsDTO, ex: RecExclusions): RecsDTO {
  if (ex.movieIds.length === 0 && ex.seriesIds.length === 0) return recs;
  const movies = new Set(ex.movieIds);
  const series = new Set(ex.seriesIds);
  const rows = recs.rows
    .map((r) => ({
      ...r,
      items: r.items.filter((it) => !(it.mediaType === "movie" ? movies : series).has(it.id)),
    }))
    .map(pruneAnchors)
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
