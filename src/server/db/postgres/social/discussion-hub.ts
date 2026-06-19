/**
 * Cross-catalog `/discussions` hub reads (spec §2 layer 4).
 *
 * Curated CHEAP SQL sorts — NOT an algorithmic feed:
 *  - New  = root comments ordered createdAt DESC.
 *  - Hot  = root comments in a rolling 72h window, ordered by like volume then
 *           newest (a cheap index-range scan; no whole-table scan, no ML).
 *  - Following = recent visible discussion from followed users / tracked titles;
 *           viewer-scoped, gated, block-filtered — loaded via server action only.
 *
 * Hot/New are anon-cacheable: they bake the public tier
 * (circleId IS NULL + PUBLISHED + spoilerScope = NONE) exactly like
 * getPublicCommentPage. They carry NO viewer data.
 */
import { CommentStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import type { CommentCursor } from "@/server/services/discussion/comment-schemas";
import {
  visibleScopeWhere,
  type ViewerGateContext,
} from "@/server/services/discussion/spoiler-gate";
import { getHiddenUserIds } from "./blocks";

export const HUB_HOT_WINDOW_MS = 72 * 60 * 60 * 1000;

export function hotWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - HUB_HOT_WINDOW_MS);
}

/** Anon-cacheable hub tier: root, public, NONE-scope, no circle. */
export function hubBaseWhere(): Prisma.CommentWhereInput {
  return {
    circleId: null,
    status: CommentStatus.PUBLISHED,
    spoilerScope: "NONE",
    parentId: null,
  };
}

export type HubAnchorKind = "movie" | "series";

export interface HubThreadCardAnchor {
  type: HubAnchorKind;
  title: string;
  posterPath: string | null;
}

export interface HubThreadCard {
  id: number;
  body: string;
  likeCount: number;
  createdAt: string;
  anchor: HubThreadCardAnchor;
  href: string;
  isCue: boolean;
  author: { id: number; username: string | null; name: string | null; image: string | null };
}

export interface HubCommentRow {
  id: number;
  body: string;
  likeCount: number;
  createdAt: Date;
  movieId: number | null;
  seriesId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  user: { id: number; username: string | null; name: string | null; image: string | null; isCue: boolean } | null;
  movie: { id: number; title: string; posterPath: string | null } | null;
  series: { id: number; name: string; posterPath: string | null } | null;
}

export function toHubThreadCard(row: HubCommentRow): HubThreadCard {
  const author = row.user ?? { id: 0, username: null, name: null, image: null, isCue: false };
  if (row.movie) {
    return {
      id: row.id,
      body: row.body,
      likeCount: row.likeCount,
      createdAt: row.createdAt.toISOString(),
      anchor: { type: "movie", title: row.movie.title, posterPath: row.movie.posterPath },
      href: `/movie/${row.movie.id}/discussions`,
      isCue: author.isCue,
      author: { id: author.id, username: author.username, name: author.name, image: author.image },
    };
  }
  if (row.series) {
    return {
      id: row.id,
      body: row.body,
      likeCount: row.likeCount,
      createdAt: row.createdAt.toISOString(),
      anchor: { type: "series", title: row.series.name, posterPath: row.series.posterPath },
      href: `/series/${row.series.id}/discussions`,
      isCue: author.isCue,
      author: { id: author.id, username: author.username, name: author.name, image: author.image },
    };
  }
  // List/circle anchors are not surfaced on the cross-catalog hub.
  return {
    id: row.id,
    body: row.body,
    likeCount: row.likeCount,
    createdAt: row.createdAt.toISOString(),
    anchor: { type: "movie", title: "Untitled", posterPath: null },
    href: "/discussions",
    isCue: author.isCue,
    author: { id: author.id, username: author.username, name: author.name, image: author.image },
  };
}

// =============================================================================
// DB-backed read functions
// =============================================================================

const HUB_PAGE_SIZE = 20;

const HUB_INCLUDE = {
  user: { select: { id: true, username: true, name: true, image: true, metadata: true } },
  movie: { select: { id: true, title: true, posterPath: true } },
  series: { select: { id: true, name: true, posterPath: true } },
} as const;

type RawHubRow = Prisma.CommentGetPayload<{ include: typeof HUB_INCLUDE }>;

function isBotMetadata(metadata: Prisma.JsonValue | null): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).bot === true
  );
}

function rawToHubRow(row: RawHubRow): HubCommentRow {
  return {
    id: row.id,
    body: row.body,
    likeCount: row.likeCount,
    createdAt: row.createdAt,
    movieId: row.movieId,
    seriesId: row.seriesId,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    user: row.user
      ? {
          id: row.user.id,
          username: row.user.username,
          name: row.user.name,
          image: row.user.image,
          isCue: isBotMetadata(row.user.metadata),
        }
      : null,
    movie: row.movie ? { id: row.movie.id, title: row.movie.title, posterPath: row.movie.posterPath } : null,
    series: row.series ? { id: row.series.id, name: row.series.name, posterPath: row.series.posterPath } : null,
  };
}

export interface HubPage {
  cards: HubThreadCard[];
  nextCursor: CommentCursor | null;
}

/** Only movie/series-anchored rows are hub-eligible. */
const HUB_ANCHOR_WHERE: Prisma.CommentWhereInput = {
  OR: [{ movieId: { not: null } }, { seriesId: { not: null } }],
};

/** New = createdAt DESC, keyset-paginated. Anon-cacheable. */
export async function getHubNewPage(
  cursor: CommentCursor | null = null,
  limit: number = HUB_PAGE_SIZE
): Promise<HubPage> {
  const cursorWhere: Prisma.CommentWhereInput = cursor
    ? {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      }
    : {};
  const rows = await prisma.comment.findMany({
    where: { AND: [hubBaseWhere(), HUB_ANCHOR_WHERE, cursorWhere] },
    include: HUB_INCLUDE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    cards: page.map((r) => toHubThreadCard(rawToHubRow(r))),
    nextCursor:
      hasMore && last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null,
  };
}

/**
 * Hot = root NONE-scope comments created in the last 72h, ranked by like volume
 * then recency. A bounded index-range scan (WHERE createdAt > window) — no
 * whole-table scan, no ML. Anon-cacheable; recomputed once per ISR window.
 */
export async function getHubHotPage(limit: number = HUB_PAGE_SIZE): Promise<HubPage> {
  const rows = await prisma.comment.findMany({
    where: {
      AND: [hubBaseWhere(), HUB_ANCHOR_WHERE, { createdAt: { gt: hotWindowStart() } }],
    },
    include: HUB_INCLUDE,
    orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return { cards: rows.map((r) => toHubThreadCard(rawToHubRow(r))), nextCursor: null };
}

/**
 * Following = recent VISIBLE discussion from users the viewer follows or titles
 * the viewer tracks. Viewer-scoped + spoiler-gated + block-filtered → server
 * action ONLY, never edge-cached. Loaded into the hub's Following tab.
 */
export async function getHubFollowingPage(
  viewerId: number,
  ctx: ViewerGateContext,
  cursor: CommentCursor | null = null,
  limit: number = HUB_PAGE_SIZE
): Promise<HubPage> {
  const [following, trackedSeries, hidden] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } }),
    prisma.seriesProgress.findMany({ where: { userId: viewerId }, select: { seriesId: true } }),
    getHiddenUserIds(viewerId),
  ]);
  const followedIds = following.map((f) => f.followingId);
  const trackedSeriesIds = trackedSeries.map((s) => s.seriesId);
  if (followedIds.length === 0 && trackedSeriesIds.length === 0) {
    return { cards: [], nextCursor: null };
  }
  const cursorWhere: Prisma.CommentWhereInput = cursor
    ? {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      }
    : {};
  const sourceWhere: Prisma.CommentWhereInput = {
    OR: [
      ...(followedIds.length ? [{ userId: { in: followedIds } }] : []),
      ...(trackedSeriesIds.length ? [{ seriesId: { in: trackedSeriesIds } }] : []),
    ],
  };
  const rows = await prisma.comment.findMany({
    where: {
      AND: [
        { circleId: null, status: CommentStatus.PUBLISHED, parentId: null },
        HUB_ANCHOR_WHERE,
        sourceWhere,
        // gate: NONE always visible; series-tracked rows gated by series ctx.
        visibleScopeWhere(ctx, "series"),
        hidden.size > 0 ? { userId: { notIn: [...hidden] } } : {},
        cursorWhere,
      ],
    },
    include: HUB_INCLUDE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    cards: page.map((r) => toHubThreadCard(rawToHubRow(r))),
    nextCursor:
      hasMore && last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null,
  };
}
