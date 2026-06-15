import { prisma, type Prisma } from "@/server/db/postgres";
import { compareTrending, type TrendingRow } from "@/server/services/discussion/trending";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { anchorWhere, PUBLIC_COMMENTS_WHERE, toCommentDto, type CommentDto } from "./comments";

interface RawTrendingRow {
  id: number;
  recentActivityCount: number;
  likeCount: number;
  createdAt: Date;
}

/** Pure: comment rows → ranked TrendingRows (sorted desc). */
export function toTrendingRows(rows: RawTrendingRow[]): TrendingRow[] {
  return rows
    .map((r) => ({
      id: r.id,
      recentActivityCount: r.recentActivityCount,
      likeCount: r.likeCount,
      createdAt: r.createdAt.toISOString(),
    }))
    .sort(compareTrending);
}

const TOP_AUTHOR = { select: { id: true, username: true, name: true, image: true } } as const;

/**
 * Anon-tier Trending roots for a dedicated page (spec §3). NONE-scope, PUBLISHED,
 * circle-NULL ONLY — safe in ISR HTML. Ranks the top window in memory off
 * denormalized counters; no per-render scan beyond a bounded LIMIT.
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
    take: limit * 3,
    include: { user: TOP_AUTHOR },
  });
  const ranked = toTrendingRows(
    rows.map((r) => ({
      id: r.id,
      recentActivityCount: r.recentActivityCount,
      likeCount: r.likeCount,
      createdAt: r.createdAt,
    }))
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
    include: { user: TOP_AUTHOR },
  });
  return rows.map(toCommentDto);
}
