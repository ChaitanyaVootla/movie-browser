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
