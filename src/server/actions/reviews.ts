"use server";

import { z } from "zod";
import { requirePgUserId, getUserIdForDb } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { prisma } from "@/server/db/postgres";
import { auditedTransaction } from "@/server/db/audit";
import { gateText } from "@/server/services/moderation/gate";
import type { GateOutput, GateStatus } from "@/server/services/moderation/gate-policy";
import {
  getViewerGateContext,
  ANON_GATE_CONTEXT,
} from "@/server/services/discussion/spoiler-gate";
import { resolveReviewScope } from "./reviews-helpers";
import type { MediaAnchor, SpoilerScopeValue } from "@/server/services/discussion/comment-schemas";
import { unfurlFirstLink } from "@/server/services/discussion/unfurl";
import {
  upsertUserReview,
  deleteUserReview,
  getOwnReview as getOwnReviewQuery,
  getPublicReviews as getPublicReviewsQuery,
  getVisibleReviews,
  type ReviewImageData,
} from "@/server/db/postgres/social/reviews";
import { setUserRating, getRatingHistogram, type RatingHistogram } from "@/server/db/postgres/social/ratings";
import { listFollowing } from "@/server/db/postgres/social/follows";

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

// ---------------------------------------------------------------------------
// upsertReview — integrated rating + heart + title + scope, AI scope resolution
// ---------------------------------------------------------------------------

const ReviewImageSchema = z.object({
  entityType: z.enum(["movie", "series", "episode", "person"]),
  tmdbId: z.number().int().positive(),
  imagePath: z.string().regex(/^\/[\w./-]{1,200}$/, "TMDB file path"),
});

const UpsertReviewSchema = z
  .object({
    // Movie.id / Series.id ARE the TMDB ids (schema: `id Int @id // TMDB ID`),
    // so the caller passes the tmdbId straight through as movieId / seriesId.
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    seasonNumber: z.number().int().min(0).nullable().optional(),
    title: z.string().trim().max(140).optional(),
    body: z.string().trim().min(1).max(20000),
    score: z.number().int().min(1).max(10).nullable().optional(),
    liked: z.boolean().optional(),
    spoilerScope: z.enum(["NONE", "WATCHED", "EPISODE", "ENDING"]).default("NONE"),
    scopeSeason: z.number().int().min(0).nullable().optional(),
    scopeEpisode: z.number().int().min(1).nullable().optional(),
    isPrivate: z.boolean().default(false),
    images: z.array(ReviewImageSchema).max(4).optional(),
  })
  .refine((v) => (v.movieId === undefined) !== (v.seriesId === undefined), {
    message: "Exactly one of movieId/seriesId is required",
  })
  .refine((v) => v.seasonNumber == null || v.seriesId !== undefined, {
    message: "seasonNumber requires seriesId",
  })
  .refine((v) => v.spoilerScope !== "EPISODE" || v.scopeSeason != null, {
    message: "EPISODE scope requires scopeSeason",
  });

/**
 * FIRST AI-gate consumer. Public (non-private) reviews pass through gateText()
 * before they can be PUBLISHED, and the AI-suggested spoiler scope can only
 * UPGRADE the user's chosen scope (never weaken it). Gate errors land in
 * PENDING_REVIEW (fail-open — never silent-publish). Private reviews skip the
 * gate (only the owner sees them) and keep the user's chosen scope verbatim.
 *
 * In one auditedTransaction: upsert the user_reviews row AND, when the user
 * scored or hearted, upsert the canonical user_ratings row. Link-unfurl runs
 * fire-and-forget AFTER commit (never inside the tx, never on a render path).
 */
export async function upsertReview(input: z.infer<typeof UpsertReviewSchema>) {
  try {
    const v = UpsertReviewSchema.parse(input);
    const userId = await requirePgUserId();
    const isMovie = v.movieId !== undefined;
    const itemId = isMovie ? v.movieId! : v.seriesId!;
    const mediaType: "movie" | "series" = isMovie ? "movie" : "series";

    const chosenScope = v.spoilerScope;
    const chosenSeason = v.scopeSeason ?? null;
    const chosenEpisode = v.scopeEpisode ?? null;

    let status: GateStatus = "PUBLISHED";
    let aiLabels: GateOutput | null = null;
    let finalScope = { scope: chosenScope, season: chosenSeason, episode: chosenEpisode };

    if (!v.isPrivate) {
      const title = isMovie
        ? (await prisma.movie.findUnique({ where: { id: itemId }, select: { title: true } }))?.title
        : (await prisma.series.findUnique({ where: { id: itemId }, select: { name: true } }))?.name;
      const gate = await gateText(v.body, { title: title ?? undefined, mediaType });
      status = gate.status;
      aiLabels = gate.aiLabels;
      finalScope = resolveReviewScope(chosenScope, chosenSeason, chosenEpisode, gate.aiLabels?.spoiler);
    }

    const images: ReviewImageData[] | null = v.images ?? null;

    const review = await auditedTransaction(userId, async (tx) => {
      const row = await upsertUserReview(
        userId,
        {
          ...(isMovie ? { movieId: itemId } : { seriesId: itemId }),
          seasonNumber: v.seasonNumber ?? null,
          title: v.title ?? null,
          body: v.body,
          spoilerScope: finalScope.scope,
          scopeSeason: finalScope.season,
          scopeEpisode: finalScope.episode,
          scopeTmdbEpisodeId: null,
          images,
          isPrivate: v.isPrivate,
          status,
          aiLabels,
        },
        tx
      );
      // Letterboxd-style: logging a score/heart on a review also upserts the
      // canonical user_ratings row (title granularity for series).
      if (v.score != null || v.liked) {
        await setUserRating(
          userId,
          {
            itemId,
            itemType: mediaType,
            seasonNumber: v.seasonNumber ?? null,
            ...(v.score !== undefined ? { score: v.score } : {}),
            ...(v.liked !== undefined ? { liked: v.liked } : {}),
          },
          tx
        );
      }
      return row;
    });

    // Fire-and-forget unfurl of the first body link (AFTER commit, only when
    // the review is publicly visible).
    if (!v.isPrivate && status === "PUBLISHED") {
      void unfurlFirstLink(v.body).catch(() => {});
    }

    return { success: true as const, reviewId: review.id, status, review };
  } catch (error: unknown) {
    return actionError("upsertReview", error);
  }
}

const DeleteReviewSchema = z.object({ reviewId: z.number().int().positive() });

export async function deleteReview(input: z.infer<typeof DeleteReviewSchema>) {
  try {
    const { reviewId } = DeleteReviewSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await auditedTransaction(userId, (tx) =>
      deleteUserReview(userId, reviewId, tx)
    );
    return ok ? { success: true as const } : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("deleteReview", error);
  }
}

const TitleReviewsSchema = z
  .object({
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    seasonNumber: z.number().int().min(0).nullable().optional(),
    cursorId: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .refine((v) => (v.movieId === undefined) !== (v.seriesId === undefined), {
    message: "Exactly one of movieId/seriesId is required",
  });

export async function getTitleReviews(input: z.infer<typeof TitleReviewsSchema>) {
  try {
    const validated = TitleReviewsSchema.parse(input);
    const userId = await requirePgUserId().catch(() => null); // public read: viewer optional
    const [page, own] = await Promise.all([
      getPublicReviewsQuery({ ...validated, viewerId: userId }),
      userId !== null ? getOwnReviewQuery(userId, validated) : Promise.resolve(null),
    ]);
    return { success: true as const, ...page, ownReview: own };
  } catch (error: unknown) {
    return actionError("getTitleReviews", error);
  }
}

// ---------------------------------------------------------------------------
// UI contract bridge (Appendix A)
// ---------------------------------------------------------------------------

import type {
  ActionResult as UiActionResult,
  OwnReviewDTO,
  ReviewDTO,
  ReviewImage,
  SubmitReviewInput,
  TrackedMediaType,
} from "@/types/social";

function reviewTarget(mediaType: TrackedMediaType, tmdbId: number, seasonNumber?: number | null) {
  return mediaType === "movie"
    ? { movieId: tmdbId }
    : { seriesId: tmdbId, seasonNumber: seasonNumber ?? null };
}

/** A persisted review row (full row from the DB layer) — the shared mapper input. */
type PersistedReviewRow = {
  id: number;
  title: string | null;
  body: string;
  spoilerScope: SpoilerScopeValue;
  scopeSeason: number | null;
  scopeEpisode: number | null;
  images: unknown;
  seasonNumber: number | null;
  likeCount: number;
  createdAt: Date;
  editedAt: Date | null;
};

/** images JSON is loosely typed in the DB; coerce defensively to ReviewImage[]. */
function parseReviewImages(raw: unknown): ReviewImage[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviewImage[] = [];
  for (const item of raw) {
    if (
      typeof item === "object" &&
      item !== null &&
      "entityType" in item &&
      "tmdbId" in item &&
      "imagePath" in item
    ) {
      const r = item as { entityType: unknown; tmdbId: unknown; imagePath: unknown };
      if (
        (r.entityType === "movie" ||
          r.entityType === "series" ||
          r.entityType === "episode" ||
          r.entityType === "person") &&
        typeof r.tmdbId === "number" &&
        typeof r.imagePath === "string"
      ) {
        out.push({ entityType: r.entityType, tmdbId: r.tmdbId, imagePath: r.imagePath });
      }
    }
  }
  return out;
}

function toReviewDTO(
  r: PersistedReviewRow,
  author: { username: string | null; name: string | null; image: string | null } | null,
  extra: { score: number | null; liked: boolean; likedByViewer: boolean }
): ReviewDTO {
  return {
    id: r.id,
    username: author?.username ?? null,
    displayName: author?.name ?? author?.username ?? "Member",
    avatarUrl: author?.image ?? null,
    title: r.title,
    score: extra.score,
    liked: extra.liked,
    body: r.body,
    spoilerScope: r.spoilerScope,
    scopeSeason: r.scopeSeason,
    scopeEpisode: r.scopeEpisode,
    images: parseReviewImages(r.images),
    seasonNumber: r.seasonNumber,
    likeCount: r.likeCount,
    likedByViewer: extra.likedByViewer,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
  };
}

export async function submitReviewAction(
  input: SubmitReviewInput
): Promise<{ ok: true; review: OwnReviewDTO } | { ok: false; error: string }> {
  const result = await upsertReview({
    ...reviewTarget(input.mediaType, input.tmdbId, input.seasonNumber),
    title: input.title,
    body: input.body,
    score: input.score,
    liked: input.liked,
    spoilerScope: input.spoilerScope,
    scopeSeason: input.scopeSeason,
    scopeEpisode: input.scopeEpisode,
    isPrivate: input.isPrivate,
    images: input.images,
  });
  if (!result.success || !result.review) {
    return { ok: false, error: result.success ? "Review missing" : result.error };
  }
  const userId = await requirePgUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, name: true, image: true },
  });
  const r = result.review;
  const base = toReviewDTO(r, user, {
    score: input.score ?? null,
    liked: input.liked ?? false,
    likedByViewer: false,
  });
  return {
    ok: true,
    review: { ...base, displayName: user?.name ?? user?.username ?? "You", status: r.status, isPrivate: r.isPrivate },
  };
}

export async function deleteReviewAction(input: { reviewId: number }): Promise<UiActionResult> {
  const result = await deleteReview({ reviewId: input.reviewId });
  return result.success ? { ok: true } : { ok: false, error: result.error };
}

/**
 * Build the rating-lookup batch join (author score + heart) for a page of
 * reviews. Shared by every review read bridge.
 */
async function scoresForAuthors(
  reviews: { userId: number | null }[],
  mediaType: TrackedMediaType,
  tmdbId: number,
  seasonNumber: number | null
): Promise<Map<number, { score: number | null; liked: boolean }>> {
  const userIds = [...new Set(reviews.map((r) => r.userId).filter((id): id is number => id !== null))];
  if (userIds.length === 0) return new Map();
  const rows = await prisma.userRating.findMany({
    where: {
      userId: { in: userIds },
      ...(mediaType === "movie"
        ? { movieId: tmdbId }
        : { seriesId: tmdbId, seasonNumber, episodeNumber: null }),
    },
    select: { userId: true, score: true, liked: true },
  });
  return new Map(rows.map((r) => [r.userId, { score: r.score, liked: r.liked ?? false }]));
}

export async function getPublicReviews(input: {
  mediaType: TrackedMediaType;
  tmdbId: number;
  seasonNumber?: number;
  limit?: number;
}): Promise<ReviewDTO[]> {
  const page = await getPublicReviewsQuery({
    ...reviewTarget(input.mediaType, input.tmdbId, input.seasonNumber),
    viewerId: null,
    limit: input.limit ?? 10,
  });
  const scoreByUser = await scoresForAuthors(page.reviews, input.mediaType, input.tmdbId, input.seasonNumber ?? null);
  return page.reviews.map((r) =>
    toReviewDTO(r, r.user, {
      score: r.userId !== null ? scoreByUser.get(r.userId)?.score ?? null : null,
      liked: r.userId !== null ? scoreByUser.get(r.userId)?.liked ?? false : false,
      likedByViewer: false,
    })
  );
}

export async function getOwnReview(input: {
  mediaType: TrackedMediaType;
  tmdbId: number;
  seasonNumber?: number;
}): Promise<OwnReviewDTO | null> {
  try {
    const userId = await requirePgUserId();
    const r = await getOwnReviewQuery(userId, reviewTarget(input.mediaType, input.tmdbId, input.seasonNumber));
    if (!r) return null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, name: true, image: true },
    });
    const own = await prisma.userRating.findFirst({
      where: {
        userId,
        ...(input.mediaType === "movie"
          ? { movieId: input.tmdbId }
          : { seriesId: input.tmdbId, seasonNumber: input.seasonNumber ?? null, episodeNumber: null }),
      },
      select: { score: true, liked: true },
    });
    const base = toReviewDTO(r, user, {
      score: own?.score ?? null,
      liked: own?.liked ?? false,
      likedByViewer: false,
    });
    return { ...base, displayName: user?.name ?? user?.username ?? "You", status: r.status, isPrivate: r.isPrivate };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// loadReviews — progress-gated reader (POST, never edge-cached). Mirrors
// loadComments: anon callers fall back to the NONE tier via ANON_GATE_CONTEXT.
// ---------------------------------------------------------------------------

const LoadReviewsSchema = z.object({
  mediaType: z.enum(["movie", "series"]),
  tmdbId: z.number().int().positive(),
  seasonNumber: z.number().int().min(0).optional(),
  sort: z.enum(["popular", "recent", "following"]),
  cursorId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type LoadReviewsResult =
  | { ok: true; reviews: ReviewDTO[]; nextCursorId: number | null }
  | { ok: false; error: string };

export async function loadReviews(
  input: z.infer<typeof LoadReviewsSchema>
): Promise<LoadReviewsResult> {
  try {
    const v = LoadReviewsSchema.parse(input);
    const userId = await getUserIdForDb(); // null for anon — never throws
    const isMovie = v.mediaType === "movie";
    const seasonNumber = v.seasonNumber ?? null;

    const anchor: MediaAnchor = isMovie
      ? { type: "movie", movieId: v.tmdbId }
      : { type: "series", seriesId: v.tmdbId, seasonNumber, episodeNumber: null };
    const gate = userId ? await getViewerGateContext(userId, anchor) : ANON_GATE_CONTEXT;

    // Following: scope to the viewer's follows. Anon / no-follows → empty page.
    let followingIds: number[] | null = null;
    if (v.sort === "following") {
      if (!userId) return { ok: true, reviews: [], nextCursorId: null };
      const follows = await listFollowing(userId, userId, { limit: 100 });
      followingIds = follows.users.map((u) => u.id);
      if (followingIds.length === 0) return { ok: true, reviews: [], nextCursorId: null };
    }

    const page = await getVisibleReviews({
      ...(isMovie ? { movieId: v.tmdbId } : { seriesId: v.tmdbId, seasonNumber }),
      viewerId: userId,
      gate,
      anchorKind: isMovie ? "movie" : "series",
      sort: v.sort === "following" ? "recent" : v.sort,
      cursorId: v.cursorId,
      limit: v.limit,
    });

    // Following: residual author filter (kept out of the DB helper to keep its
    // signature anchor-only; the follow set is bounded at 100).
    const rows =
      followingIds !== null
        ? page.reviews.filter((r) => r.userId !== null && followingIds!.includes(r.userId))
        : page.reviews;

    const scoreByUser = await scoresForAuthors(rows, v.mediaType, v.tmdbId, seasonNumber);
    const reviewIds = rows.map((r) => r.id);
    const likedByViewer =
      userId && reviewIds.length > 0
        ? new Set(
            (
              await prisma.reaction.findMany({
                where: { userId, reviewId: { in: reviewIds } },
                select: { reviewId: true },
              })
            ).flatMap((x) => (x.reviewId === null ? [] : [x.reviewId]))
          )
        : new Set<number>();

    const reviews = rows.map((r) =>
      toReviewDTO(r, r.user, {
        score: r.userId !== null ? scoreByUser.get(r.userId)?.score ?? null : null,
        liked: r.userId !== null ? scoreByUser.get(r.userId)?.liked ?? false : false,
        likedByViewer: likedByViewer.has(r.id),
      })
    );

    // When the Following residual filter trimmed the page, the helper's cursor
    // (keyset on raw rows) is still valid — it points at the last raw row id.
    return { ok: true, reviews, nextCursorId: page.nextCursorId };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ---------------------------------------------------------------------------
// getReviewHistogram — 1..10 score distribution for the title unit.
// ---------------------------------------------------------------------------

const ReviewHistogramSchema = z.object({
  mediaType: z.enum(["movie", "series"]),
  tmdbId: z.number().int().positive(),
  seasonNumber: z.number().int().min(0).optional(),
});

export async function getReviewHistogram(
  input: z.infer<typeof ReviewHistogramSchema>
): Promise<RatingHistogram> {
  const v = ReviewHistogramSchema.parse(input);
  return getRatingHistogram(
    v.mediaType === "movie"
      ? { movieId: v.tmdbId }
      : { seriesId: v.tmdbId, seasonNumber: v.seasonNumber ?? null }
  );
}
