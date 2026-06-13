import { CommentStatus } from "@prisma/client";
import { prisma, Prisma } from "@/server/db/postgres";
import type {
  CommentCursor,
  DiscussionAnchor,
  SpoilerScopeValue,
} from "@/server/services/discussion/comment-schemas";
import {
  visibleScopeWhere,
  type ViewerGateContext,
} from "@/server/services/discussion/spoiler-gate";
import { getExcludedAuthorIds } from "./blocks";

// ---------------------------------------------------------------------------
// DTOs (serializable across the server-action boundary — dates as ISO strings)
// ---------------------------------------------------------------------------

export interface CommentAuthorDto {
  id: number;
  username: string | null;
  name: string | null;
  image: string | null;
}

export interface CommentDto {
  id: number;
  parentId: number | null;
  body: string;
  spoilerScope: SpoilerScopeValue;
  scopeSeason: number | null;
  scopeEpisode: number | null;
  status: string;
  likeCount: number;
  createdAt: string;
  editedAt: string | null;
  author: CommentAuthorDto | null;
}

export interface CommentThreadDto extends CommentDto {
  replyCount: number;
  replies: CommentDto[];
}

export interface CommentPageDto {
  roots: CommentThreadDto[];
  nextCursor: CommentCursor | null;
}

const AUTHOR_SELECT = {
  select: { id: true, username: true, name: true, image: true },
} as const;

type CommentRow = Prisma.CommentGetPayload<{ include: { user: typeof AUTHOR_SELECT } }>;

export function toCommentDto(row: CommentRow): CommentDto {
  const deleted = row.status === CommentStatus.DELETED_BY_USER;
  return {
    id: row.id,
    parentId: row.parentId,
    body: deleted ? "" : row.body,
    spoilerScope: row.spoilerScope as SpoilerScopeValue,
    scopeSeason: row.scopeSeason,
    scopeEpisode: row.scopeEpisode,
    status: row.status,
    likeCount: row.likeCount,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    author: deleted || !row.user ? null : row.user,
  };
}

// ---------------------------------------------------------------------------
// Where-builders
// ---------------------------------------------------------------------------

/**
 * publicComments base predicate (spec §4.2: "Public read paths go through a
 * publicComments query helper that bakes in circleId IS NULL AND
 * status = 'PUBLISHED' — convention is not enough").
 */
export const PUBLIC_COMMENTS_WHERE = {
  circleId: null,
  status: CommentStatus.PUBLISHED,
} satisfies Prisma.CommentWhereInput;

export function anchorWhere(anchor: DiscussionAnchor): Prisma.CommentWhereInput {
  if (anchor.type === "movie") return { movieId: anchor.movieId };
  return {
    seriesId: anchor.seriesId,
    seasonNumber: anchor.seasonNumber,
    episodeNumber: anchor.episodeNumber,
  };
}

/** Keyset (createdAt, id) strictly-less-than — never OFFSET. */
function cursorWhere(cursor: CommentCursor | null): Prisma.CommentWhereInput {
  if (!cursor) return {};
  const at = new Date(cursor.createdAt);
  return { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: cursor.id } }] };
}

const PAGE_SIZE = 20;
const REPLY_PREVIEW_PER_ROOT = 50; // depth cap 2 → bounded total

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Anon-cacheable tier (spec invariant 8): NONE-scope, PUBLISHED, circle-NULL
 * only. Safe inside ISR/edge-cached HTML; exactly what crawlers should index.
 */
export async function getPublicCommentPage(
  anchor: DiscussionAnchor,
  cursor: CommentCursor | null = null,
  limit: number = PAGE_SIZE
): Promise<CommentPageDto> {
  const where: Prisma.CommentWhereInput = {
    AND: [
      anchorWhere(anchor),
      PUBLIC_COMMENTS_WHERE,
      { parentId: null },
      { spoilerScope: "NONE" },
      cursorWhere(cursor),
    ],
  };
  return pageWithReplies(where, { AND: [PUBLIC_COMMENTS_WHERE, { spoilerScope: "NONE" }] }, limit);
}

/**
 * Progress-gated tier — client-fetched only (server-action POST, never
 * edge-cached). Spoiler predicate in SQL, blocks filtered, and the viewer
 * always sees their own PENDING_REVIEW/FLAGGED comments.
 */
export async function getVisibleCommentPage(
  anchor: DiscussionAnchor,
  ctx: ViewerGateContext,
  viewerId: number | null,
  cursor: CommentCursor | null = null,
  limit: number = PAGE_SIZE
): Promise<CommentPageDto> {
  const excluded = await getExcludedAuthorIds(viewerId);
  const anchorKind = anchor.type;
  const visibility: Prisma.CommentWhereInput = {
    OR: [
      { AND: [PUBLIC_COMMENTS_WHERE, visibleScopeWhere(ctx, anchorKind)] },
      // own held/published comments (author must see what they wrote)
      ...(viewerId
        ? [
            {
              userId: viewerId,
              circleId: null,
              status: {
                in: [
                  CommentStatus.PENDING_REVIEW,
                  CommentStatus.FLAGGED,
                  CommentStatus.PUBLISHED,
                ],
              },
            },
          ]
        : []),
    ],
  };
  const blockFilter: Prisma.CommentWhereInput =
    excluded.length > 0 ? { OR: [{ userId: { notIn: excluded } }, { userId: null }] } : {};
  const where: Prisma.CommentWhereInput = {
    AND: [anchorWhere(anchor), { parentId: null }, visibility, blockFilter, cursorWhere(cursor)],
  };
  return pageWithReplies(where, { AND: [visibility, blockFilter] }, limit);
}

/** Shared pagination + ONE batched reply fetch + ONE reply-count groupBy. */
async function pageWithReplies(
  rootWhere: Prisma.CommentWhereInput,
  replyVisibility: Prisma.CommentWhereInput,
  limit: number
): Promise<CommentPageDto> {
  const rows = await prisma.comment.findMany({
    where: rootWhere,
    include: { user: AUTHOR_SELECT },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const roots = hasMore ? rows.slice(0, limit) : rows;
  const rootIds = roots.map((r) => r.id);

  let replies: CommentRow[] = [];
  let counts: Array<{ parentId: number | null; _count: { _all: number } }> = [];
  if (rootIds.length > 0) {
    [replies, counts] = await Promise.all([
      prisma.comment.findMany({
        where: { AND: [{ parentId: { in: rootIds } }, replyVisibility] },
        include: { user: AUTHOR_SELECT },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: REPLY_PREVIEW_PER_ROOT * rootIds.length,
      }),
      prisma.comment.groupBy({
        by: ["parentId"],
        where: { AND: [{ parentId: { in: rootIds } }, replyVisibility] },
        _count: { _all: true },
      }),
    ]);
  }
  const repliesByRoot = new Map<number, CommentDto[]>();
  for (const reply of replies) {
    if (reply.parentId === null) continue;
    const list = repliesByRoot.get(reply.parentId) ?? [];
    list.push(toCommentDto(reply));
    repliesByRoot.set(reply.parentId, list);
  }
  const countByRoot = new Map<number, number>();
  for (const c of counts) {
    if (c.parentId !== null) countByRoot.set(c.parentId, c._count._all);
  }
  const last = roots[roots.length - 1];
  return {
    roots: roots.map((r) => ({
      ...toCommentDto(r),
      replies: repliesByRoot.get(r.id) ?? [],
      replyCount: countByRoot.get(r.id) ?? 0,
    })),
    nextCursor: hasMore && last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null,
  };
}

/**
 * Locked-count teaser ("N comments unlock when you've watched"). Counts
 * PUBLISHED non-NONE comments — progress-INDEPENDENT, hence legal in
 * edge-cacheable HTML (spec invariant 8) and computed once per ISR window.
 */
export async function getLockedCommentCount(anchor: DiscussionAnchor): Promise<number> {
  return prisma.comment.count({
    where: {
      AND: [anchorWhere(anchor), PUBLIC_COMMENTS_WHERE, { spoilerScope: { not: "NONE" } }],
    },
  });
}

/** Published-comment total for JSON-LD commentCount. */
export async function getPublishedCommentCount(anchor: DiscussionAnchor): Promise<number> {
  return prisma.comment.count({ where: { AND: [anchorWhere(anchor), PUBLIC_COMMENTS_WHERE] } });
}
