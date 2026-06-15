import { prisma, type Prisma } from "@/server/db/postgres";
import { compareTrending, type TrendingRow } from "@/server/services/discussion/trending";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { anchorWhere, PUBLIC_COMMENTS_WHERE, toCommentDto, COMMENT_INCLUDE, type CommentDto } from "./comments";

interface RawTrendingRow {
  id: number;
  recentActivityCount: number;
  likeCount: number;
  createdAt: Date;
  lastActivityAt: Date;
}

/** Pure: comment rows → ranked TrendingRows (rolling, recency-decayed against `now`). */
export function toTrendingRows(rows: RawTrendingRow[], now: Date): TrendingRow[] {
  return rows
    .map((r) => ({
      id: r.id,
      recentActivityCount: r.recentActivityCount,
      likeCount: r.likeCount,
      createdAt: r.createdAt.toISOString(),
      lastActivityAt: r.lastActivityAt.toISOString(),
    }))
    .sort(compareTrending(now));
}

// Note: COMMENT_INCLUDE is used instead of the old TOP_AUTHOR to include entityMentions for the DTO.

/** Recently-active candidate window pulled (ordered by lastActivityAt) before
 * in-memory recency-decay ranking. Bounds the per-render scan. */
const TRENDING_CANDIDATE_WINDOW = 100;

/**
 * Anon-tier Trending roots for a dedicated page (spec §3). NONE-scope, PUBLISHED,
 * circle-NULL ONLY — safe in ISR HTML.
 *
 * Rolling, NO cron: pull the bounded set of MOST-RECENTLY-ACTIVE roots
 * (orderBy lastActivityAt DESC — uses the existing trending index), then rank
 * THAT window in memory by a recency-decayed engagement score (`trending.ts`).
 * Because the candidate set is recency-ordered and the score decays with the age
 * of `lastActivityAt`, an old high-engagement thread cannot dominate a freshly
 * active one. Cheap: one indexed scan capped at TRENDING_CANDIDATE_WINDOW.
 */
export async function getPublicTrendingRoots(
  anchor: DiscussionAnchor,
  limit = 20
): Promise<CommentDto[]> {
  const where: Prisma.CommentWhereInput = {
    AND: [anchorWhere(anchor), PUBLIC_COMMENTS_WHERE, { parentId: null }, { spoilerScope: "NONE" }],
  };
  // Pull a bounded recent-activity window, rank in memory (cheap, off counters).
  const rows = await prisma.comment.findMany({
    where,
    orderBy: { lastActivityAt: "desc" },
    take: Math.max(limit * 3, TRENDING_CANDIDATE_WINDOW),
    include: COMMENT_INCLUDE,
  });
  const now = new Date();
  const ranked = toTrendingRows(
    rows.map((r) => ({
      id: r.id,
      recentActivityCount: r.recentActivityCount,
      likeCount: r.likeCount,
      createdAt: r.createdAt,
      // A root's own creation is its first activity (lastActivityAt is null until
      // a reply lands), so fall back to createdAt for the recency decay.
      lastActivityAt: r.lastActivityAt ?? r.createdAt,
    })),
    now
  ).slice(0, limit);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ranked.flatMap((t) => {
    const row = byId.get(t.id);
    return row ? [toCommentDto(row)] : [];
  });
}

/** Anon-tier Latest roots (createdAt DESC) for a dedicated page. */
export async function getPublicLatestRoots(
  anchor: DiscussionAnchor,
  limit = 20
): Promise<CommentDto[]> {
  const rows = await prisma.comment.findMany({
    where: {
      AND: [anchorWhere(anchor), PUBLIC_COMMENTS_WHERE, { parentId: null }, { spoilerScope: "NONE" }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: COMMENT_INCLUDE,
  });
  return rows.map((r) => toCommentDto(r));
}
