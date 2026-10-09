/**
 * Taste match + taste twins (spec
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §4).
 *
 * PUBLIC scope only, for BOTH sides: public ratings (private-only titles
 * dropped) and the PUBLIC centroid. Gate: blocks/mutes → nothing; allowed when
 * both profiles are public and the target shows their taste, otherwise only for
 * mutual follows. Never throws (→ null / []).
 */
import {
  canViewTasteMatch,
  computeTasteMatch,
  publicRatingsFromSignals,
  tasteSim,
  type SharedTitle,
} from "@/lib/taste/compatibility";
import type { TasteMatchDTO, TasteMatchTitleDTO, TasteTwinDTO } from "@/lib/taste/recommend-types";
import { cosineSimilarity } from "@/lib/taste/vector";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { fetchTasteSignals } from "@/server/db/postgres/social/taste";
import { getHiddenUserIds } from "@/server/db/postgres/social/blocks";
import {
  fetchFollowingIds,
  fetchTitleRefs,
  fetchTwinCandidates,
  fetchUserById,
  fetchUserByUsername,
  isMutualFollow,
} from "@/server/db/postgres/social/taste-recs";
import { dataLogger } from "@/lib/logger";
import { getUserTasteEmbedding } from "./index";

/** Twins below this match are not suggested. */
export const TWIN_MIN_MATCH = 40;
export const TWIN_LIMIT = 6;

function split(titles: readonly SharedTitle[]) {
  const movieIds: number[] = [];
  const seriesIds: number[] = [];
  for (const t of titles) (t.mediaType === "movie" ? movieIds : seriesIds).push(t.id);
  return { movieIds, seriesIds };
}

/** Taste match between the viewer and `username`, or null (gated / not enough evidence). */
export async function getTasteMatchFor(viewerId: number, username: string): Promise<TasteMatchDTO | null> {
  try {
    const [target, viewer] = await Promise.all([fetchUserByUsername(username), fetchUserById(viewerId)]);
    if (!target || !viewer) return null;
    if (target.id === viewer.id) return null;
    const [hidden, mutualFollow] = await Promise.all([
      getHiddenUserIds(viewerId),
      isMutualFollow(viewerId, target.id),
    ]);
    const gate = canViewTasteMatch({
      viewerId,
      targetId: target.id,
      hidden: hidden.has(target.id),
      viewerPublic: viewer.isPublic,
      targetPublic: target.isPublic,
      targetShowsTaste: target.showTaste,
      mutualFollow,
    });
    if (gate !== "allow") return null;

    const [sigA, sigB, vecA, vecB] = await Promise.all([
      fetchTasteSignals(viewerId),
      fetchTasteSignals(target.id),
      getUserTasteEmbedding(viewerId, { scope: "public" }),
      getUserTasteEmbedding(target.id, { scope: "public" }),
    ]);
    const result = computeTasteMatch({
      a: publicRatingsFromSignals(sigA),
      b: publicRatingsFromSignals(sigB),
      centroidCosine: vecA && vecB ? cosineSimilarity(vecA, vecB) : null,
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

/**
 * Follow suggestions by PUBLIC-centroid similarity. Candidates are exactly the
 * users the taste-match gate would allow without a mutual follow (public,
 * taste visible; viewer public too), minus self / hidden / already followed.
 */
export async function getTasteTwinsFor(viewerId: number): Promise<TasteTwinDTO[]> {
  try {
    const viewer = await fetchUserById(viewerId);
    if (!viewer || !viewer.isPublic) return [];
    const vec = await getUserTasteEmbedding(viewerId, { scope: "public" }); // ensures a fresh stored row
    if (!vec) return [];
    const [hidden, following] = await Promise.all([getHiddenUserIds(viewerId), fetchFollowingIds(viewerId)]);
    const rows = await fetchTwinCandidates(viewerId, {
      excludeIds: [viewerId, ...hidden, ...following],
      limit: TWIN_LIMIT * 3,
    });
    return rows
      .map((r) => ({ r, match: Math.round(100 * (tasteSim(r.cos) ?? 0)) }))
      .filter(({ r, match }) => match >= TWIN_MIN_MATCH && r.username)
      .slice(0, TWIN_LIMIT)
      .map(({ r, match }) => ({
        username: r.username as string,
        displayName: r.name?.trim() || (r.username as string),
        avatarUrl: r.avatarImagePath ? `${TMDB_IMAGE_BASE}/w185${r.avatarImagePath}` : r.image,
        match,
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
