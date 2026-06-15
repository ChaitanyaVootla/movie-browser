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
import { getMediaPath } from "@/lib/utils";
import { getUnfurlsByHashes } from "./social/link-unfurls";
import { extractFirstLink, urlHash } from "@/server/services/discussion/url-normalize";

// ---------------------------------------------------------------------------
// DTOs (serializable across the server-action boundary — dates as ISO strings)
// ---------------------------------------------------------------------------

export interface CommentAuthorDto {
  id: number;
  username: string | null;
  name: string | null;
  image: string | null;
}

/** The card shape carried on a rendered comment (no urlHash — render-only). */
export interface LinkCardLite {
  url: string;
  domain: string;
  status: "OK" | "FAILED";
  provider: "GENERIC" | "YOUTUBE";
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  youtubeId: string | null;
}

export interface CommentAttachment {
  entityType: "movie" | "series" | "episode" | "person";
  tmdbId: number;
  imagePath: string;
}

export interface EntityMentionRef {
  kind: "movie" | "series" | "episode" | "person";
  tmdbId: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
  name: string; // CURRENT catalog name (live)
  href: string;
}

/** True when an author's users.metadata marks it as a bot (Cue). Pure. */
export function commentIsCue(metadata: Prisma.JsonValue | null | undefined): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).bot === true
  );
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
  isCue?: boolean;
  attachment: CommentAttachment | null;
  viewerLiked: boolean;
  entityMentions: EntityMentionRef[];
  linkCard: LinkCardLite | null;
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
  select: { id: true, username: true, name: true, image: true, metadata: true },
} as const;

export const COMMENT_INCLUDE = {
  user: AUTHOR_SELECT,
  entityMentions: {
    select: {
      movieId: true, seriesId: true, personId: true, seasonNumber: true, episodeNumber: true,
      movie: { select: { id: true, title: true } },
      series: { select: { id: true, name: true } },
      person: { select: { id: true, name: true } },
    },
  },
} as const;

type CommentRow = Prisma.CommentGetPayload<{ include: typeof COMMENT_INCLUDE }>;

export function toCommentDto(row: CommentRow, viewerLikedIds?: Set<number>): CommentDto {
  const deleted = row.status === CommentStatus.DELETED_BY_USER;
  const attachment: CommentAttachment | null =
    deleted || !row.attachmentEntityType || !row.attachmentImagePath
      ? null
      : {
          entityType: row.attachmentEntityType as CommentAttachment["entityType"],
          tmdbId:
            row.attachmentMovieId ?? row.attachmentSeriesId ?? row.attachmentPersonId ?? 0,
          imagePath: row.attachmentImagePath,
        };
  const entityMentions: EntityMentionRef[] = deleted
    ? []
    : row.entityMentions.map((m) => {
        if (m.movie) {
          return { kind: "movie" as const, tmdbId: m.movie.id, seasonNumber: null, episodeNumber: null, name: m.movie.title, href: getMediaPath("movie", m.movie.id, m.movie.title) };
        }
        if (m.person) {
          return { kind: "person" as const, tmdbId: m.person.id, seasonNumber: null, episodeNumber: null, name: m.person.name, href: getMediaPath("person", m.person.id, m.person.name) };
        }
        // series or episode
        const sid = m.series?.id ?? (m.seriesId as number);
        const sname = m.series?.name ?? "Series";
        const base = getMediaPath("series", sid, sname);
        if (m.seasonNumber !== null && m.episodeNumber !== null) {
          return { kind: "episode" as const, tmdbId: sid, seasonNumber: m.seasonNumber, episodeNumber: m.episodeNumber, name: sname, href: `${base}/discuss/s${m.seasonNumber}e${m.episodeNumber}` };
        }
        return { kind: "series" as const, tmdbId: sid, seasonNumber: null, episodeNumber: null, name: sname, href: base };
      });
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
    author: deleted || !row.user ? null : { id: row.user.id, username: row.user.username, name: row.user.name, image: row.user.image },
    isCue: row.user ? commentIsCue(row.user.metadata) : false,
    attachment,
    viewerLiked: viewerLikedIds ? viewerLikedIds.has(row.id) : false,
    entityMentions,
    linkCard: null, // hydrated separately via attachLinkCards (no per-row query)
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
 * viewerId MUST remain null here — invariant 1: no viewer data in cacheable HTML.
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
  // viewerId = null: anon tier — viewerLiked is always false (invariant 1)
  return pageWithReplies(where, { AND: [PUBLIC_COMMENTS_WHERE, { spoilerScope: "NONE" }] }, limit, null);
}

/**
 * Progress-gated tier — client-fetched only (server-action POST, never
 * edge-cached). Spoiler predicate in SQL, blocks filtered, and the viewer
 * always sees their own PENDING_REVIEW/FLAGGED comments.
 */
/**
 * The viewer's visible-comment predicate (spoiler-gated public set ∪ the
 * viewer's own held/published) plus their block filter. Shared by the gated
 * read path and the cheap "new since" count so they can never diverge.
 */
async function buildVisibleFilters(
  anchor: DiscussionAnchor,
  ctx: ViewerGateContext,
  viewerId: number | null
): Promise<{ visibility: Prisma.CommentWhereInput; blockFilter: Prisma.CommentWhereInput }> {
  const excluded = await getExcludedAuthorIds(viewerId);
  const visibility: Prisma.CommentWhereInput = {
    OR: [
      { AND: [PUBLIC_COMMENTS_WHERE, visibleScopeWhere(ctx, anchor.type)] },
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
  return { visibility, blockFilter };
}

export async function getVisibleCommentPage(
  anchor: DiscussionAnchor,
  ctx: ViewerGateContext,
  viewerId: number | null,
  cursor: CommentCursor | null = null,
  limit: number = PAGE_SIZE
): Promise<CommentPageDto> {
  const { visibility, blockFilter } = await buildVisibleFilters(anchor, ctx, viewerId);
  const where: Prisma.CommentWhereInput = {
    AND: [anchorWhere(anchor), { parentId: null }, visibility, blockFilter, cursorWhere(cursor)],
  };
  return pageWithReplies(where, { AND: [visibility, blockFilter] }, limit, viewerId);
}

/**
 * Cheap count of VISIBLE root comments created after `since` (hot path: the
 * entry-strip "N new since you watched" upgrade). Same gating + block predicate
 * as getVisibleCommentPage, so it counts exactly what the viewer may see — but a
 * single COUNT instead of materializing a 100-row page. `since` null = first
 * visit (count all visible roots).
 */
export async function countVisibleNewSince(
  anchor: DiscussionAnchor,
  ctx: ViewerGateContext,
  viewerId: number | null,
  since: Date | null
): Promise<number> {
  const { visibility, blockFilter } = await buildVisibleFilters(anchor, ctx, viewerId);
  return prisma.comment.count({
    where: {
      AND: [
        anchorWhere(anchor),
        { parentId: null },
        visibility,
        blockFilter,
        ...(since ? [{ createdAt: { gt: since } }] : []),
      ],
    },
  });
}

/** Shared pagination + ONE batched reply fetch + ONE reply-count groupBy. */
async function pageWithReplies(
  rootWhere: Prisma.CommentWhereInput,
  replyVisibility: Prisma.CommentWhereInput,
  limit: number,
  viewerId: number | null
): Promise<CommentPageDto> {
  const rows = await prisma.comment.findMany({
    where: rootWhere,
    include: COMMENT_INCLUDE,
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
        include: COMMENT_INCLUDE,
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

  // Viewer like-state: only for the gated (POST) path (invariant 1 — no viewer data in cacheable HTML).
  const allIds = [...roots.map((r) => r.id), ...replies.map((r) => r.id)];
  const likedRows =
    viewerId && allIds.length
      ? await prisma.reaction.findMany({
          where: { userId: viewerId, commentId: { in: allIds }, type: "LIKE" },
          select: { commentId: true },
        })
      : [];
  const likedIds = new Set(likedRows.map((l) => l.commentId).filter((id): id is number => id !== null));

  // Link cards: ONE batched lookup against the CACHED unfurl table for every
  // body on the page (roots + replies), then a pure in-process join. NO network
  // on the render path (edge-cache + perf invariant) — cards only appear for
  // links already unfurled on submit; everything else renders a plain anchor.
  const cardMap = await buildLinkCardMap([
    ...roots.map((r) => r.body),
    ...replies.map((r) => r.body),
  ]);

  const repliesByRoot = new Map<number, CommentDto[]>();
  for (const reply of replies) {
    if (reply.parentId === null) continue;
    const list = repliesByRoot.get(reply.parentId) ?? [];
    list.push(toCommentDto(reply, likedIds));
    repliesByRoot.set(reply.parentId, list);
  }
  const countByRoot = new Map<number, number>();
  for (const c of counts) {
    if (c.parentId !== null) countByRoot.set(c.parentId, c._count._all);
  }
  const last = roots[roots.length - 1];
  return {
    roots: attachLinkCards(
      roots.map((r) => ({
        ...toCommentDto(r, likedIds),
        replies: attachLinkCards(repliesByRoot.get(r.id) ?? [], cardMap),
        replyCount: countByRoot.get(r.id) ?? 0,
      })),
      cardMap
    ),
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

// ---------------------------------------------------------------------------
// Link card hydration (no-network join from cached unfurl table)
// ---------------------------------------------------------------------------

/**
 * Attach a cached link card to each comment whose FIRST link has a cached
 * unfurl. PURE — reads only the provided map (built once per page). NEVER fetches
 * on the render path (edge-cache + perf invariant). Comments without a cached row
 * keep `linkCard: null` and render a plain anchor.
 */
export function attachLinkCards<T extends CommentDto>(
  comments: T[],
  cardsByUrl: Map<string, LinkCardLite>
): T[] {
  return comments.map((c) => {
    if (c.status !== "PUBLISHED") return c;
    const link = extractFirstLink(c.body);
    if (!link) return c;
    const card = cardsByUrl.get(link);
    return card ? { ...c, linkCard: card } : c;
  });
}

/**
 * Build the URL→card map for a set of comment bodies (roots + replies). One
 * batched query against the unfurl cache; returns only OK rows (FAILED rows
 * render as plain anchors anyway).
 */
export async function buildLinkCardMap(bodies: string[]): Promise<Map<string, LinkCardLite>> {
  const urls = new Map<string, string>(); // normalized url → urlHash
  for (const body of bodies) {
    const link = extractFirstLink(body);
    if (link) urls.set(link, urlHash(link));
  }
  if (urls.size === 0) return new Map();
  const byHash = await getUnfurlsByHashes([...urls.values()]);
  const result = new Map<string, LinkCardLite>();
  for (const [url, hash] of urls) {
    const dto = byHash.get(hash);
    if (dto && dto.status === "OK") {
      result.set(url, {
        url: dto.url,
        domain: dto.domain,
        status: dto.status,
        provider: dto.provider,
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        faviconUrl: dto.faviconUrl,
        youtubeId: dto.youtubeId,
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Cacheable baseline summary
// ---------------------------------------------------------------------------

import { adaptiveCountLabel, type AdaptiveCountVariant } from "@/server/services/discussion/discussion-counts";

export interface AnchorPublicSummary {
  publishedCount: number;
  lastActivityAt: string | null;
}

export interface AnchorBaseline extends AnchorPublicSummary {
  variant: AdaptiveCountVariant;
  label: string;
}

/** Pure mapper (testable without a DB): summary → adaptive baseline DTO. */
export function summaryToBaseline(summary: AnchorPublicSummary): AnchorBaseline {
  const { variant, label } = adaptiveCountLabel(summary.publishedCount);
  return { ...summary, variant, label };
}

/**
 * Anon-cacheable baseline (spec §4): published count + freshest activity for the
 * anchor. NONE-tier-agnostic count is fine in ISR HTML (progress-independent).
 * One aggregate read; no per-render scan.
 */
export async function getAnchorPublicSummary(anchor: DiscussionAnchor): Promise<AnchorBaseline> {
  const where = { AND: [anchorWhere(anchor), PUBLIC_COMMENTS_WHERE] };
  const [publishedCount, latest] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findFirst({
      where,
      orderBy: { lastActivityAt: "desc" },
      select: { lastActivityAt: true },
    }),
  ]);
  return summaryToBaseline({
    publishedCount,
    lastActivityAt: latest?.lastActivityAt ? latest.lastActivityAt.toISOString() : null,
  });
}
