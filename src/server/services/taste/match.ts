/**
 * Taste match + taste twins (spec
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §4).
 *
 * PUBLIC scope only, for BOTH sides: public ratings (private-only titles
 * dropped) and the PUBLIC centroid. Gate (`canViewTasteMatch`): blocks/mutes,
 * a hidden taste profile or a private target → nothing (a follow never
 * overrides the target's privacy); a public viewer → allowed; a private viewer
 * → only with a mutual follow. Never throws (→ null / []).
 */
import {
  canViewTasteMatch,
  computeTasteMatch,
  publicRatingsFromSignals,
  tasteSim,
  type SharedTitle,
} from "@/lib/taste/compatibility";
import type { CommonGroundPickDTO, TasteMatchDTO, TasteMatchTitleDTO, TasteTwinDTO } from "@/lib/taste/recommend-types";
import { REC_MIN_VOTES_MOVIE, REC_MIN_VOTES_SERIES } from "@/lib/taste/recommend-constants";
import { cosineSimilarity, dot, l2Normalize } from "@/lib/taste/vector";
import { resolveStoredSpace, type TasteSpace } from "@/lib/taste/space";
import { foldSignals } from "@/lib/taste/weights";
import type { TasteMediaType, TitleKey, TitleRef, TitleSignals } from "@/lib/taste/types";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { fetchTasteSignals, fetchTitleEmbeddings } from "@/server/db/postgres/social/taste";
import { getHiddenUserIds } from "@/server/db/postgres/social/blocks";
import {
  annCandidates,
  fetchCandidateDetails,
  fetchFollowingIds,
  fetchRecExclusions,
  fetchTitleRefs,
  fetchTwinCandidates,
  fetchUserById,
  fetchUserByUsername,
  isMutualFollow,
} from "@/server/db/postgres/social/taste-recs";
import { dataLogger } from "@/lib/logger";
import { getTasteSpace, getTasteVectors } from "./index";

/**
 * Twins below this match are not suggested. In the centered space 40% = cosine
 * 0.252, above the p99 of the random-title-set null model (0.19–0.22) and at
 * ≈ the p95 of real user pairs (2026-10-10 spec §7): a twin is a top-5% pair,
 * never a coincidence. (Raw space put EVERY real pair at 50–88%.)
 */
export const TWIN_MIN_MATCH = 40;
export const TWIN_LIMIT = 6;

function split(titles: readonly SharedTitle[]) {
  const movieIds: number[] = [];
  const seriesIds: number[] = [];
  for (const t of titles) (t.mediaType === "movie" ? movieIds : seriesIds).push(t.id);
  return { movieIds, seriesIds };
}

type MatchUser = NonNullable<Awaited<ReturnType<typeof fetchUserById>>>;

/** The taste-match gate for a resolved target (shared by match + common-ground picks). */
async function matchAllowed(viewer: MatchUser, target: MatchUser): Promise<boolean> {
  if (target.id === viewer.id) return false;
  const [hidden, mutualFollow] = await Promise.all([
    getHiddenUserIds(viewer.id),
    isMutualFollow(viewer.id, target.id),
  ]);
  return (
    canViewTasteMatch({
      viewerId: viewer.id,
      targetId: target.id,
      hidden: hidden.has(target.id),
      viewerPublic: viewer.isPublic,
      targetPublic: target.isPublic,
      targetShowsTaste: target.showTaste,
      viewerShowsTaste: viewer.showTaste,
      mutualFollow,
    }) === "allow"
  );
}

/** Taste match between the viewer and `username`, or null (gated / not enough evidence). */
export async function getTasteMatchFor(viewerId: number, username: string): Promise<TasteMatchDTO | null> {
  try {
    const [target, viewer] = await Promise.all([fetchUserByUsername(username), fetchUserById(viewerId)]);
    if (!target || !viewer) return null;
    if (!(await matchAllowed(viewer, target))) return null;

    const [sigA, sigB, vecA, vecB] = await Promise.all([
      fetchTasteSignals(viewerId),
      fetchTasteSignals(target.id),
      getTasteVectors(viewerId),
      getTasteVectors(target.id),
    ]);
    // PUBLIC centroids only, and only when both live in the same embedding
    // space (never compare a raw centroid with a centered one).
    const a = vecA.publicCentroid;
    const b = vecB.publicCentroid;
    const sameSpace = vecA.space === vecB.space;
    const result = computeTasteMatch({
      a: publicRatingsFromSignals(sigA),
      b: publicRatingsFromSignals(sigB),
      centroidCosine: a && b && sameSpace ? cosineSimilarity(a, b) : null,
      space: vecA.space,
    });
    if (result.score === null) return null;

    const { movieIds, seriesIds } = split([...result.sharedFavorites, ...result.fightAbout]);
    const refs = await fetchTitleRefs(movieIds, seriesIds);
    const toDTO = (t: SharedTitle): TasteMatchTitleDTO | null => {
      const ref = refs.get(t.key);
      if (!ref) return null; // adult / missing → not listed
      return {
        mediaType: t.mediaType,
        id: t.id,
        title: ref.title,
        posterPath: ref.posterPath,
        viewerScore: t.scoreA,
        ownerScore: t.scoreB,
      };
    };
    const keep = (xs: SharedTitle[]) => xs.map(toDTO).filter((x): x is TasteMatchTitleDTO => x !== null);
    return {
      score: result.score,
      components: result.components,
      sharedFavorites: keep(result.sharedFavorites),
      fightAbout: keep(result.fightAbout),
      evidence: {
        sharedRated: result.evidence.sharedRated,
        sharedLiked: result.evidence.sharedLiked,
        hasTaste: result.evidence.hasTaste,
      },
    };
  } catch (error: unknown) {
    dataLogger.warn({
      action: "taste.match_failed",
      viewerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Max positives per side used to name a pick's nearest anchor. */
const COMMON_ANCHORS_PER_SIDE = 60;
/** ANN depth per table for common-ground picks (one query, vote floor after the LIMIT). */
const COMMON_ANN_K = 400;
export const COMMON_GROUND_MAX = 8;

/** Target-side titles we may NOT recommend back: their PUBLIC watched/rated titles only. */
export function publicSeenKeys(signals: readonly TitleSignals[], now: Date): Set<TitleKey> {
  const keys = new Set<TitleKey>();
  for (const t of foldSignals(signals, "public", now).titles) if (t.watched || t.score !== null) keys.add(t.key);
  for (const r of publicRatingsFromSignals(signals)) keys.add(r.key);
  return keys;
}

/** PUBLIC positives (heaviest first) — the only titles a pick may cite as "close to". */
function publicPositiveKeys(signals: readonly TitleSignals[], now: Date): TitleKey[] {
  return foldSignals(signals, "public", now)
    .titles.filter((t) => t.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
    .slice(0, COMMON_ANCHORS_PER_SIDE)
    .map((t) => t.key);
}

function splitKeys(keys: Iterable<TitleKey>) {
  const movieIds: number[] = [];
  const seriesIds: number[] = [];
  for (const k of keys) {
    const id = Number(k.slice(2));
    if (!Number.isFinite(id)) continue;
    (k.startsWith("m:") ? movieIds : seriesIds).push(id);
  }
  return { movieIds, seriesIds };
}

/** Nearest anchor (by cosine in `space`) among `anchors` for a projected vector. */
function nearest(
  v: readonly number[],
  anchors: ReadonlyArray<{ key: TitleKey; vec: number[] }>
): { key: TitleKey; cos: number } | null {
  let best: { key: TitleKey; cos: number } | null = null;
  for (const a of anchors) {
    const c = dot(v, a.vec);
    if (!best || c > best.cos) best = { key: a.key, cos: c };
  }
  return best;
}

/**
 * Titles both users would likely enjoy (taste v2 §5.3 `compare_taste` picks):
 * the two PUBLIC centroids averaged in one space (`resolveStoredSpace` on both —
 * different spaces → []), one `annSearch` per table through `annCandidates`
 * (notAdult + vote floor), minus the viewer's exclusions (incl. dismissals) and
 * the target's PUBLIC watched/rated titles, re-ranked exactly in the space.
 * Each pick names its nearest PUBLIC positive on each side. Same gate as the
 * match card (`canViewTasteMatch`). Never throws (→ []).
 */
export async function getCommonGroundPicks(
  viewerId: number,
  targetId: number,
  limit: number
): Promise<CommonGroundPickDTO[]> {
  try {
    const n = Math.max(1, Math.min(COMMON_GROUND_MAX, Math.floor(limit)));
    const [viewer, target] = await Promise.all([fetchUserById(viewerId), fetchUserById(targetId)]);
    if (!viewer || !target) return [];
    if (!(await matchAllowed(viewer, target))) return [];

    const [vecA, vecB, current] = await Promise.all([
      getTasteVectors(viewerId),
      getTasteVectors(targetId),
      getTasteSpace(),
    ]);
    const a = vecA.publicCentroid;
    const b = vecB.publicCentroid;
    if (!a || !b || vecA.space !== vecB.space) return [];
    const space: TasteSpace | null = resolveStoredSpace(vecA.space, current);
    if (!space) return [];
    const query = l2Normalize(a.map((x, i) => x + (b[i] ?? 0)));
    if (!query) return [];

    const now = new Date();
    const [sigA, sigB, exclusions] = await Promise.all([
      fetchTasteSignals(viewerId),
      fetchTasteSignals(targetId),
      fetchRecExclusions(viewerId),
    ]);
    const targetSeen = publicSeenKeys(sigB, now);
    const seen = splitKeys(targetSeen);
    const excluded = {
      movies: [...new Set([...exclusions.movieIds, ...seen.movieIds])],
      series: [...new Set([...exclusions.seriesIds, ...seen.seriesIds])],
    };

    const tables = [
      { table: "movies" as const, minVotes: REC_MIN_VOTES_MOVIE, ex: excluded.movies },
      { table: "series" as const, minVotes: REC_MIN_VOTES_SERIES, ex: excluded.series },
    ];
    const hits = await Promise.all(
      tables.map((t) => annCandidates(t.table, [query], { excludeIds: t.ex, minVotes: t.minVotes, perQuery: COMMON_ANN_K }))
    );
    const offset = space.meanDot(query);
    const pool = tables.flatMap((t, i) =>
      hits[i]
        .map((h) => ({ table: t.table, id: h.id, approx: h.dist + offset }))
        .sort((x, y) => x.approx - y.approx)
        .slice(0, n * 4)
    );
    if (pool.length === 0) return [];

    const [movieDetails, seriesDetails] = await Promise.all(
      tables.map((t) => fetchCandidateDetails(t.table, pool.filter((p) => p.table === t.table).map((p) => p.id)))
    );
    const ranked = [...movieDetails, ...seriesDetails]
      .map((c) => ({ c, v: space.project(c.embedding) }))
      .filter((x): x is { c: (typeof movieDetails)[number]; v: number[] } => x.v !== null)
      .map((x) => ({ ...x, cos: dot(x.v, query) }))
      .sort((x, y) => y.cos - x.cos || x.c.key.localeCompare(y.c.key))
      .slice(0, n);
    if (ranked.length === 0) return [];

    // Anchors: each side's PUBLIC positives only.
    const keysA = publicPositiveKeys(sigA, now);
    const keysB = publicPositiveKeys(sigB, now);
    const ids = splitKeys([...keysA, ...keysB]);
    const [rawEmb, refs] = await Promise.all([
      fetchTitleEmbeddings(ids.movieIds, ids.seriesIds),
      fetchTitleRefs(ids.movieIds, ids.seriesIds),
    ]);
    const side = (keys: TitleKey[]) =>
      keys
        .map((key) => {
          const raw = rawEmb.get(key);
          const vec = raw && refs.has(key) ? space.project(raw) : null;
          return vec ? { key, vec } : null;
        })
        .filter((x): x is { key: TitleKey; vec: number[] } => x !== null);
    const anchorsA = side(keysA);
    const anchorsB = side(keysB);
    const toRef = (hit: { key: TitleKey } | null) => {
      if (!hit) return null;
      const ref = refs.get(hit.key);
      if (!ref) return null;
      const mediaType: TasteMediaType = hit.key.startsWith("m:") ? "movie" : "series";
      return { mediaType, id: Number(hit.key.slice(2)), title: ref.title };
    };

    return ranked.map(({ c, v }) => ({
      mediaType: c.mediaType,
      id: c.id,
      title: c.title,
      year: c.releaseDate ? Number(c.releaseDate.slice(0, 4)) || null : null,
      posterPath: c.posterPath,
      viewerAnchor: toRef(nearest(v, anchorsA)),
      targetAnchor: toRef(nearest(v, anchorsB)),
    }));
  } catch (error: unknown) {
    dataLogger.warn({
      action: "taste.common_ground_failed",
      viewerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** Shared PUBLIC loves (both sides) per twin, for the chip's poster thumbs (<= 2 each). */
async function sharedLovesFor(
  viewerId: number,
  twinIds: readonly number[]
): Promise<Map<number, TitleRef[]>> {
  const out = new Map<number, TitleRef[]>();
  if (twinIds.length === 0) return out;
  const [mine, ...theirs] = await Promise.all([viewerId, ...twinIds].map((id) => fetchTasteSignals(id)));
  const a = publicRatingsFromSignals(mine);
  const perTwin = theirs.map((sig) =>
    computeTasteMatch({ a, b: publicRatingsFromSignals(sig), centroidCosine: null }).sharedFavorites.slice(0, 2)
  );
  const { movieIds, seriesIds } = split(perTwin.flat());
  const refs = await fetchTitleRefs(movieIds, seriesIds);
  twinIds.forEach((id, i) => {
    out.set(
      id,
      perTwin[i]
        .map((t): TitleRef | null => {
          const r = refs.get(t.key);
          return r ? { mediaType: t.mediaType, tmdbId: t.id, title: r.title, posterPath: r.posterPath } : null;
        })
        .filter((x): x is TitleRef => x !== null)
    );
  });
  return out;
}

/**
 * Follow suggestions by PUBLIC-centroid similarity. Candidates are exactly the
 * users the taste-match gate would allow without a mutual follow (public,
 * taste visible; viewer public too), minus self / hidden / already followed.
 */
export async function getTasteTwinsFor(viewerId: number): Promise<TasteTwinDTO[]> {
  try {
    const viewer = await fetchUserById(viewerId);
    if (!viewer || !viewer.isPublic || !viewer.showTaste) return [];
    const vectors = await getTasteVectors(viewerId); // ensures a fresh stored row
    if (!vectors.publicCentroid) return [];
    const [hidden, following] = await Promise.all([getHiddenUserIds(viewerId), fetchFollowingIds(viewerId)]);
    const rows = await fetchTwinCandidates(viewerId, {
      excludeIds: [viewerId, ...hidden, ...following],
      limit: TWIN_LIMIT * 3,
    });
    const twins = rows
      .map((r) => ({ r, match: Math.round(100 * (tasteSim(r.cos, vectors.space) ?? 0)) }))
      .filter(({ r, match }) => match >= TWIN_MIN_MATCH && r.username)
      .slice(0, TWIN_LIMIT);
    // Shared loves are decoration: a failure keeps the twins, without thumbs.
    const shared = await sharedLovesFor(
      viewerId,
      twins.map(({ r }) => r.id)
    ).catch(() => new Map<number, TitleRef[]>());
    return twins.map(({ r, match }) => ({
      username: r.username as string,
      displayName: r.name?.trim() || (r.username as string),
      avatarUrl: r.avatarImagePath ? `${TMDB_IMAGE_BASE}/w185${r.avatarImagePath}` : r.image,
      match,
      shared: shared.get(r.id) ?? [],
    }));
  } catch (error: unknown) {
    dataLogger.warn({
      action: "taste.twins_failed",
      viewerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
