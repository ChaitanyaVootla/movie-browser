# Discussions Phase D — Destination & Retention (Hub · Notifications · Cue)

**Date:** 2026-06-15
**Branch:** `feat/social-phase0` (LOCAL ONLY — NEVER push origin; pushing `next` auto-deploys prod)
**Spec:** `docs/superpowers/specs/2026-06-15-discussions-positioning-design.md` — §2 (global hub IA), §7 (notifications), §8 (Cue seeds), §9 (circles-readiness seams)
**Builds on:** Phases A–C (surfacing, composer, link/trailer cards) — assumed merged on this branch.

---

## Goal

Turn discussions into a **destination** and add the **retention loop**:

1. **Global `/discussions` hub** — cross-catalog browse with **Hot · New · Following** tabs. Curated CHEAP SQL sorts (NOT an algorithmic feed). Anon Hot/New are ISR-cacheable (carry no viewer data); Following hydrates client-side via a server action (gated by spoiler watermark, respects blocks).
2. **"New episode/season dropped" notification** — a PM2 cron diffs newly-aired episodes against each viewer's tracked set (`series_progress` WATCHING/REWATCHING) and writes ONE bounded notification per (viewer, newly-opened title): "its discussion is now open." NO fan-out.
3. **Likes-on-my-comment notification** — **BATCHED** ("Ada + 3 others liked your comment"), low priority — never one-per-like. Coalesces into an existing unread row.
4. **Cue trending seeds** — a reserved system user **`cue`** (bot flag in `users.metadata`); a `CRON_HOUR_UTC`-guarded PM2 cron walks the current trending set (capped top-N/day), seeds ONE title-level `spoilerScope=NONE` Cue comment per title, **idempotent** (skip if title already has a Cue seed OR any human comment). One Bedrock Flex call per seeded title, grounded in `ai_data` themes/premise. Cue posts skip the toxicity gate (trusted). AI badge on render.
5. **Circles-readiness seams (DESIGN-FOR, do NOT build)** — inert audience/circle filter slot on the hub + series discussions page, and a composer audience-selector stub, clearly marked not-wired. `circleId IS NULL` stays baked into public reads.

## Architecture

- **Hub reads** are NEW cross-catalog queries in `src/server/db/postgres/social/discussion-hub.ts` (Hot/New are anon-safe; Following is viewer-scoped). They reuse `PUBLIC_COMMENTS_WHERE` + `circleId: null` from `comments.ts` for the cacheable tier, and `visibleScopeWhere`/`getHiddenUserIds` for the gated Following tier — never hand-rolled.
- **"Hot" without ML:** a denormalized rolling activity counter is out of scope for Phase D (Phase A's concern). The hub's Hot sort is a CHEAP **group-by recent root-comment volume in a 72h window**, ordered by count then newest — pure SQL over the indexed `comments(createdAt)` columns, computed inside the ISR window (revalidate=300). No per-render scan of the whole table; bounded by a `WHERE createdAt > now()-72h` index range.
- **Notifications** extend the existing write-on-event layer (`createNotification`, block-aware). New `NotificationType` values: `EPISODE_DROP` (the show-I-track signal — distinct from the existing `CLUB_EPISODE_OPEN` which is a Phase-3 circles concept) and `LIKES_BATCH`. New `notify*` helpers live in `src/server/services/notifications/notify.ts`.
- **Likes batching:** a like write (the Phase-B reaction action — Phase D adds the notify hook only) calls `notifyLikeBatched`, which **coalesces** into the recipient's existing unread `LIKES_BATCH` row for the same `commentId` (UPDATE the count + actor sample) or inserts a fresh one. Pure DB-level coalescing, no fan-out, no per-like row.
- **Episode-drop cron** (`scripts/seed-episode-drop-notifications.ts`): finds episodes whose `air_date` crossed into the past within the last lookback window, joins to `series_progress` rows in WATCHING/REWATCHING for that series, and writes one `EPISODE_DROP` notification per (viewer, series, season) the first time — idempotent via a marker in the notification payload (skip if an `EPISODE_DROP` for that `series:season` already exists for the viewer). Bounded by tracked-set size, never the catalog.
- **Cue cron** (`scripts/seed-cue-comments.ts`): ensures the `cue` system user exists, walks top-N trending titles (movies+series by `popularity DESC`), and for each title with NO existing Cue seed AND NO human comment, calls Bedrock Flex once with `ai_data` grounding to generate a spoiler-free opener, then inserts a `Comment` authored by `cue` at title level, `spoilerScope=NONE`, `status=PUBLISHED`. Idempotency + skip logic are pure functions, unit-tested without a DB.
- **AI badge:** Cue authorship is detected by `author.id === CUE_USER_ID` (resolved once and cached) OR a `aiAuthor: true` flag on the comment DTO; rendering adds a small "AI" badge. We add an `isCue` boolean to the comment DTO sourced from a metadata bot-flag lookup batched per page.
- **Invariants honored:** AI fires ONLY in the bounded Cue cron batch (O(trending/day) — never render/crawl). Notifications are write-on-event, bounded, no fan-out, block-respecting. ISR-cacheable hub tabs carry no viewer data. All viewer-scoped DB access goes through `requirePgUserId`. Cue's comment insert runs through `auditedTransaction(CUE_USER_ID, …)`. Episodes referenced by natural keys only. DESIGN.md primitives + tokens; no `any`.

## Tech Stack

Next.js 15 App Router (RSC + ISR), React 19, TypeScript strict, Prisma 6 (PostgreSQL on dev :5436), Zod, Vitest + happy-dom, AWS Bedrock Flex (Kimi K2.5) via `callBedrockFlex`, PM2 cron (`CRON_HOUR_UTC` guard + `FORCE_RUN` + `nice -n 19`), shadcn/ui + Tailwind v4 + `@/lib/design` primitives, Pino logging, `web-push` (VAPID-gated, already wired).

## For agentic workers

Execute this with **superpowers:subagent-driven-development**. Each task below is one bite-sized TDD loop (write failing test → run it and SEE it fail → write the MINIMAL implementation with the complete code given → run the test and SEE it pass → `yarn typecheck` → commit). Do NOT batch tasks. Tasks are ordered so each builds on the prior; types are consistent across tasks. Schema-touching tasks (1, 7) require a `db push` to :5436 and a `pm2 restart mb-dev`. NEVER push to origin.

### Standard commands (copy-paste)

```bash
# Run a single test file (pin the dev DB)
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run <path>

# Type check (whole project)
yarn typecheck

# After ANY prisma schema change:
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn db:push
npx pm2 restart mb-dev    # stale client rejects new columns as "Unknown argument"

# Manual cron run (bypass the hour guard):
FORCE_RUN=1 DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' \
  USER_DATA_SOURCE=postgres npx tsx scripts/seed-cue-comments.ts --limit=5 --dry-run
```

### Commit message footer (every commit)

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## File Structure

```
NEW:
  src/server/db/postgres/social/discussion-hub.ts          # cross-catalog Hot/New/Following reads
  src/server/db/postgres/social/discussion-hub.test.ts     # pure where-builder + DTO mapping tests
  src/server/actions/discussions-hub.ts                    # server actions: getHubFollowing (viewer), getHubPage
  src/server/services/notifications/likes-batch.ts         # coalescing logic (pure + db wrapper)
  src/server/services/notifications/likes-batch.test.ts    # pure coalesce-vs-insert decision tests
  src/server/services/cue/cue-seed.ts                      # Cue user resolution + idempotency + prompt builder
  src/server/services/cue/cue-seed.test.ts                 # pure skip/idempotency + prompt-grounding tests
  src/server/services/cue/cue-prompt.ts                    # Cue system prompt + input builder
  scripts/seed-cue-comments.ts                             # PM2 cron: trending seeds (guarded)
  scripts/seed-cue-comments.test.ts                        # cron guard + selection unit tests (no DB)
  scripts/seed-episode-drop-notifications.ts               # PM2 cron: episode-drop notifications (guarded)
  scripts/seed-episode-drop-notifications.test.ts          # cron guard + diff/idempotency unit tests (no DB)
  src/app/discussions/page.tsx                             # global hub (ISR, anon Hot/New)
  src/app/discussions/hub-tabs.tsx                         # client island: tab switch + Following hydrate
  src/app/discussions/hub-thread-card.tsx                  # shared cross-catalog thread card
  src/components/features/discussion/audience-filter-slot.tsx  # inert circles-readiness slot
  src/components/features/discussion/cue-badge.tsx         # "AI" badge for Cue comments

EDIT:
  prisma/schema.prisma                                     # +EPISODE_DROP, +LIKES_BATCH NotificationType
  src/server/services/notifications/notify.ts              # +notifyEpisodeDrop, +notifyLikeBatched
  src/server/db/postgres/social/notifications.ts           # +findUnreadLikesBatch, +coalesce helper
  src/server/db/postgres/comments.ts                       # +isCue flag on DTO (bot detection)
  src/components/features/notifications/notification-list.tsx  # render EPISODE_DROP + LIKES_BATCH
  src/components/features/discussion/comment-item.tsx      # render <CueBadge /> when isCue
  src/components/features/discussion/comment-composer.tsx  # inert audience-selector stub
  ecosystem.config.cjs                                     # +seed-cue-comments, +seed-episode-drop jobs
  CLAUDE.md                                                # PM2 Scheduled Jobs table rows
  .claude/rules/social-features.md                         # Phase D note + file map rows
```

---

## TASKS

### Task 1 — Schema: add `EPISODE_DROP` + `LIKES_BATCH` NotificationType

**Failing test** — `prisma/schema-notification-types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("NotificationType enum", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const block = schema.slice(schema.indexOf("enum NotificationType"));
  const body = block.slice(0, block.indexOf("}"));

  it("includes EPISODE_DROP (a show-I-track new-episode signal)", () => {
    expect(body).toContain("EPISODE_DROP");
  });

  it("includes LIKES_BATCH (coalesced likes-on-my-comment)", () => {
    expect(body).toContain("LIKES_BATCH");
  });

  it("keeps the existing REPLY/MENTION/FOLLOW values", () => {
    expect(body).toContain("REPLY");
    expect(body).toContain("MENTION");
    expect(body).toContain("FOLLOW");
  });
});
```

Run (fail): `DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run prisma/schema-notification-types.test.ts`

**Implementation** — in `prisma/schema.prisma`, extend the enum (lines ~1792):

```prisma
enum NotificationType {
  REPLY
  MENTION
  FOLLOW
  CIRCLE_INVITE
  CLUB_EPISODE_OPEN
  EPISODE_DROP // a new episode/season dropped for a show the viewer tracks; "its discussion is now open"
  LIKES_BATCH  // coalesced likes-on-my-comment (never one-per-like)
}
```

Then:

```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn db:push
npx pm2 restart mb-dev
```

Run (pass): same vitest command. Then `yarn typecheck`.

**Commit:** `feat(discussions): add EPISODE_DROP + LIKES_BATCH notification types`

---

### Task 2 — Cross-catalog hub reads: pure where-builders + DTO

The hub needs a serializable thread card DTO and pure where-builders that the DB functions and tests share. This task is the PURE core (no DB) so it tests fast and pins the contract.

**Failing test** — `src/server/db/postgres/social/discussion-hub.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  HUB_HOT_WINDOW_MS,
  hotWindowStart,
  hubBaseWhere,
  toHubThreadCard,
  type HubCommentRow,
} from "./discussion-hub";

describe("discussion-hub where-builders", () => {
  it("hot window start is 72h before now", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(hotWindowStart(now).toISOString()).toBe("2026-06-12T00:00:00.000Z");
    expect(HUB_HOT_WINDOW_MS).toBe(72 * 60 * 60 * 1000);
  });

  it("hubBaseWhere bakes circleId:null + PUBLISHED + NONE-scope + root-only (anon-cacheable tier)", () => {
    const w = hubBaseWhere();
    expect(w.circleId).toBeNull();
    expect(w.status).toBe("PUBLISHED");
    expect(w.spoilerScope).toBe("NONE");
    expect(w.parentId).toBeNull();
  });
});

describe("toHubThreadCard", () => {
  const baseRow: HubCommentRow = {
    id: 7,
    body: "What did everyone think of the finale framing?",
    likeCount: 3,
    createdAt: new Date("2026-06-14T10:00:00Z"),
    movieId: 603,
    seriesId: null,
    seasonNumber: null,
    episodeNumber: null,
    user: { id: 42, username: "ada", name: "Ada", image: null, isCue: false },
    movie: { id: 603, title: "The Matrix", posterPath: "/m.jpg" },
    series: null,
  };

  it("maps a movie-anchored row to a movie hub card with a /movie permalink", () => {
    const card = toHubThreadCard(baseRow);
    expect(card.anchor).toEqual({ type: "movie", title: "The Matrix", posterPath: "/m.jpg" });
    expect(card.href).toBe("/movie/603/discussions");
    expect(card.isCue).toBe(false);
  });

  it("maps a series-anchored row to a series hub card", () => {
    const card = toHubThreadCard({
      ...baseRow,
      movieId: null,
      movie: null,
      seriesId: 1396,
      series: { id: 1396, name: "Breaking Bad", posterPath: "/bb.jpg" },
    });
    expect(card.anchor).toEqual({ type: "series", title: "Breaking Bad", posterPath: "/bb.jpg" });
    expect(card.href).toBe("/series/1396/discussions");
  });

  it("flags a Cue-authored card", () => {
    const card = toHubThreadCard({
      ...baseRow,
      user: { id: 1, username: "cue", name: "Cue", image: null, isCue: true },
    });
    expect(card.isCue).toBe(true);
    expect(card.author.username).toBe("cue");
  });
});
```

Run (fail).

**Implementation** — `src/server/db/postgres/social/discussion-hub.ts` (PURE part; DB functions added in Task 3):

```ts
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
import { CommentStatus, Prisma } from "@prisma/client";

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
```

Run (pass). `yarn typecheck`.

**Commit:** `feat(discussions): hub thread-card DTO + anon-cacheable where-builders`

---

### Task 3 — Hub DB reads: Hot, New, Following (live DB)

Add the DB-backed read functions to `discussion-hub.ts`. The `isCue` flag is derived from a batched lookup of `users.metadata.bot === true` for the page's author ids.

**Failing test** — append to `src/server/db/postgres/social/discussion-hub.test.ts`:

```ts
import { getHubHotPage, getHubNewPage } from "./discussion-hub";

const HAS_DB = !!process.env.DATABASE_URL?.includes("5436");
const d = HAS_DB ? describe : describe.skip;

d("hub DB reads (dev DB)", () => {
  it("getHubNewPage returns root NONE-scope cards newest-first with a cursor shape", async () => {
    const page = await getHubNewPage(null, 5);
    expect(Array.isArray(page.cards)).toBe(true);
    for (const c of page.cards) {
      expect(["movie", "series"]).toContain(c.anchor.type);
    }
    // nextCursor is null or a {createdAt,id} keyset
    if (page.nextCursor) {
      expect(typeof page.nextCursor.id).toBe("number");
      expect(typeof page.nextCursor.createdAt).toBe("string");
    }
  });

  it("getHubHotPage returns at most `limit` cards within the 72h window", async () => {
    const page = await getHubHotPage(3);
    expect(page.cards.length).toBeLessThanOrEqual(3);
  });
});
```

Run (fail).

**Implementation** — append to `src/server/db/postgres/social/discussion-hub.ts`:

```ts
import { prisma } from "@/server/db/postgres";
import type { CommentCursor } from "@/server/services/discussion/comment-schemas";
import {
  visibleScopeWhere,
  type ViewerGateContext,
} from "@/server/services/discussion/spoiler-gate";
import { getHiddenUserIds } from "./blocks";

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
  // Visible tier: published, not hidden authors, root, scope visible to viewer.
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
        hidden.size > 0 ? { OR: [{ userId: { notIn: [...hidden] } }, { userId: null }] } : {},
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
```

> Note on the Following gate: `visibleScopeWhere(ctx, "series")` is a conservative single-context filter for the mixed list. Per-row exactness against each row's own series watermark is a Phase-A spoiler-gate concern; for the cross-catalog Following tab the spec requires only that gated bodies never appear — `NONE`-scope always passes, and tracked series the viewer is watching contribute their watermark-visible rows. Movie rows in this tab are always `NONE`-scope (Cue/public), so they pass.

Run (pass). `yarn typecheck`.

**Commit:** `feat(discussions): hub Hot/New/Following DB reads (gated, block-filtered)`

---

### Task 4 — Hub server actions

Wrap the reads. Hot/New are callable anonymously (no throw). Following requires a pg user id and builds the viewer gate context.

**Failing test** — `src/server/actions/discussions-hub.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { HubTabSchema } from "./discussions-hub";

describe("HubTabSchema", () => {
  it("accepts hot/new/following", () => {
    expect(HubTabSchema.parse("hot")).toBe("hot");
    expect(HubTabSchema.parse("new")).toBe("new");
    expect(HubTabSchema.parse("following")).toBe("following");
  });
  it("rejects an unknown tab", () => {
    expect(() => HubTabSchema.parse("trending")).toThrow();
  });
});
```

Run (fail).

**Implementation** — `src/server/actions/discussions-hub.ts`:

```ts
"use server";

import { z } from "zod";
import { getUserIdForDb, requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { CommentCursorSchema, type CommentCursor } from "@/server/services/discussion/comment-schemas";
import {
  getHubHotPage,
  getHubNewPage,
  getHubFollowingPage,
  type HubPage,
} from "@/server/db/postgres/social/discussion-hub";
import { ANON_GATE_CONTEXT } from "@/server/services/discussion/spoiler-gate";
import { prisma } from "@/server/db/postgres";

export const HubTabSchema = z.enum(["hot", "new", "following"]);
export type HubTab = z.infer<typeof HubTabSchema>;

const EMPTY: HubPage = { cards: [], nextCursor: null };

const PublicPageSchema = z.object({
  tab: z.enum(["hot", "new"]),
  cursor: CommentCursorSchema.nullable().default(null),
});

/** Anon-safe Hot/New page (no throw). Used by the ISR page AND client paging. */
export async function getHubPublicPage(
  raw: z.input<typeof PublicPageSchema>
): Promise<HubPage> {
  try {
    const { tab, cursor } = PublicPageSchema.parse(raw);
    return tab === "hot" ? getHubHotPage() : getHubNewPage(cursor as CommentCursor | null);
  } catch (error: unknown) {
    userApiLogger.error({
      action: "getHubPublicPage",
      error: error instanceof Error ? error.message : String(error),
    });
    return EMPTY;
  }
}

const FollowingSchema = z.object({
  cursor: CommentCursorSchema.nullable().default(null),
});

/** Viewer-scoped Following tab. Anonymous → empty (never throws). */
export async function getHubFollowing(
  raw: z.input<typeof FollowingSchema> = {}
): Promise<HubPage> {
  try {
    const viewerId = await getUserIdForDb();
    if (!viewerId) return EMPTY;
    const { cursor } = FollowingSchema.parse(raw);
    // Build a series-oriented gate context from the viewer's progress max-watermark.
    // The mixed list only needs the conservative series context (see hub note).
    const completed = await prisma.seriesProgress.count({
      where: { userId: viewerId, status: "COMPLETED" },
    });
    const ctx = {
      ...ANON_GATE_CONTEXT,
      loggedIn: true,
      // Following surfaces NONE-scope + the viewer's tracked-series watermark rows;
      // treat completed-anything as not granting blanket access in the mixed list.
      seriesCompleted: completed > 0 ? false : false,
    };
    return getHubFollowingPage(viewerId, ctx, cursor as CommentCursor | null);
  } catch (error: unknown) {
    userApiLogger.error({
      action: "getHubFollowing",
      error: error instanceof Error ? error.message : String(error),
    });
    return EMPTY;
  }
}

/** Guard used by any future write surface on the hub (kept for parity). */
export async function requireHubViewer(): Promise<number> {
  return requirePgUserId();
}
```

> The `seriesCompleted` line is intentionally `false` (no blanket access in the mixed cross-catalog list) — the conservative choice keeps gated bodies out. Exact per-series watermarking is a Phase-A gate concern.

Run (pass). `yarn typecheck`.

**Commit:** `feat(discussions): hub server actions (public Hot/New + gated Following)`

---

### Task 5 — Inert circles-readiness audience-filter slot

A clearly-marked, non-wired placeholder reused by the hub and the series discussions page. DESIGN.md tokens only.

**Failing test** — `src/components/features/discussion/audience-filter-slot.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AudienceFilterSlot } from "./audience-filter-slot";

describe("AudienceFilterSlot", () => {
  it("renders the public-only audience label and is disabled (circles not wired)", () => {
    render(<AudienceFilterSlot />);
    const btn = screen.getByRole("button", { name: /everyone/i });
    expect(btn).toBeDisabled();
  });

  it("is hidden from assistive tech as a future affordance", () => {
    const { container } = render(<AudienceFilterSlot />);
    expect(container.firstChild).toHaveAttribute("data-circles-readiness", "true");
  });
});
```

Run (fail).

**Implementation** — `src/components/features/discussion/audience-filter-slot.tsx`:

```tsx
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Circles-readiness seam (spec §9 — DESIGN-FOR, do NOT build). An inert
 * audience/circle filter affordance. Public reads always bake circleId IS NULL;
 * this slot only reserves the layout + interaction shape for Phase 3 circles.
 * NOT WIRED — disabled and non-interactive on purpose.
 */
export function AudienceFilterSlot() {
  return (
    <div data-circles-readiness="true" className="shrink-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        aria-disabled="true"
        className="gap-1.5 text-muted-foreground"
        title="Audience filtering (circles) is coming soon"
      >
        <Users className="size-4" />
        Everyone
      </Button>
    </div>
  );
}
```

Run (pass). `yarn typecheck`.

**Commit:** `feat(discussions): inert audience-filter slot (circles-readiness seam)`

---

### Task 6 — Global `/discussions` hub page + tabs + thread card

ISR page. Server-renders Hot (default) + New anon-cacheable. Following hydrates client-side via `getHubFollowing`. Includes the inert audience slot.

**Failing test** — `src/app/discussions/hub-thread-card.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HubThreadCard } from "./hub-thread-card";
import type { HubThreadCard as Card } from "@/server/db/postgres/social/discussion-hub";

const card: Card = {
  id: 1,
  body: "Best heist of the decade, change my mind.",
  likeCount: 12,
  createdAt: "2026-06-14T10:00:00.000Z",
  anchor: { type: "movie", title: "Heat", posterPath: "/heat.jpg" },
  href: "/movie/949/discussions",
  isCue: false,
  author: { id: 5, username: "neo", name: "Neo", image: null },
};

describe("HubThreadCard", () => {
  it("links to the discussion permalink and shows the title", () => {
    render(<HubThreadCard card={card} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/movie/949/discussions");
    expect(screen.getByText("Heat")).toBeInTheDocument();
  });

  it("renders an AI badge for Cue cards", () => {
    render(<HubThreadCard card={{ ...card, isCue: true, author: { id: 1, username: "cue", name: "Cue", image: null } }} />);
    expect(screen.getByText(/AI/)).toBeInTheDocument();
  });
});
```

Run (fail).

**Implementation** — `src/components/features/discussion/cue-badge.tsx`:

```tsx
import { Sparkles } from "lucide-react";

/** AI-authored marker for Cue's comments (spec §8 transparency requirement). */
export function CueBadge({ className }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary " +
        (className ?? "")
      }
    >
      <Sparkles className="size-3" aria-hidden />
      AI
    </span>
  );
}
```

`src/app/discussions/hub-thread-card.tsx`:

```tsx
import Link from "next/link";
import Image from "next/image";
import type { HubThreadCard as Card } from "@/server/db/postgres/social/discussion-hub";
import { CueBadge } from "@/components/features/discussion/cue-badge";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function HubThreadCard({ card }: { card: Card }) {
  const poster = card.anchor.posterPath ? `${TMDB_IMAGE_BASE}/w154${card.anchor.posterPath}` : null;
  const who = card.author.username ?? card.author.name ?? "Someone";
  return (
    <Link
      href={card.href}
      prefetch={false}
      className="flex gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
    >
      {poster ? (
        <Image
          src={poster}
          alt={card.anchor.title}
          width={48}
          height={72}
          unoptimized
          className="h-[72px] w-12 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="h-[72px] w-12 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate font-medium text-foreground">{card.anchor.title}</span>
          {card.isCue ? <CueBadge /> : <span className="truncate">· {who}</span>}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-foreground">{card.body}</p>
        <div className="mt-1.5 text-xs text-muted-foreground">{card.likeCount} likes</div>
      </div>
    </Link>
  );
}
```

`src/app/discussions/hub-tabs.tsx` (client island — owns tab state + Following hydration):

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { HubThreadCard } from "./hub-thread-card";
import { AudienceFilterSlot } from "@/components/features/discussion/audience-filter-slot";
import {
  getHubPublicPage,
  getHubFollowing,
  type HubTab,
} from "@/server/actions/discussions-hub";
import type { HubThreadCard as Card } from "@/server/db/postgres/social/discussion-hub";
import type { CommentCursor } from "@/server/services/discussion/comment-schemas";

const TABS: { id: HubTab; label: string }[] = [
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "following", label: "Following" },
];

export function HubTabs({ initialHot, initialNew }: { initialHot: Card[]; initialNew: Card[] }) {
  const [tab, setTab] = useState<HubTab>("hot");
  const [following, setFollowing] = useState<Card[] | null>(null);
  const [followingCursor, setFollowingCursor] = useState<CommentCursor | null>(null);
  const [loading, setLoading] = useState(false);

  const selectTab = async (next: HubTab) => {
    setTab(next);
    if (next === "following" && following === null) {
      setLoading(true);
      const page = await getHubFollowing({ cursor: null });
      setFollowing(page.cards);
      setFollowingCursor(page.nextCursor);
      setLoading(false);
    }
  };

  const cards = tab === "hot" ? initialHot : tab === "new" ? initialNew : (following ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => void selectTab(t.id)}
              className={cn(
                "min-h-[40px] rounded-md px-3 text-sm font-medium transition-colors",
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <AudienceFilterSlot />
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tab === "following" ? "Follow people or track shows to see their discussions here." : "No discussions yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {cards.map((c) => (
            <HubThreadCard key={c.id} card={c} />
          ))}
        </div>
      )}

      {tab === "following" && followingCursor ? (
        <div className="text-center">
          <button
            className="min-h-[40px] rounded-md border border-border px-4 text-sm"
            onClick={async () => {
              const page = await getHubFollowing({ cursor: followingCursor });
              setFollowing((prev) => [...(prev ?? []), ...page.cards]);
              setFollowingCursor(page.nextCursor);
            }}
          >
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

`src/app/discussions/page.tsx` (ISR — NO viewer data; NO `auth()`/`headers()`):

```tsx
import type { Metadata } from "next";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { HubTabs } from "./hub-tabs";
import { getHubHotPage, getHubNewPage } from "@/server/db/postgres/social/discussion-hub";

export const revalidate = 300; // anon Hot/New cacheable; Following hydrates client-side
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Discussions · The Movie Browser",
  description: "Browse what people are talking about across movies and TV — the discussion boards IMDb deleted.",
};

export default async function DiscussionsHubPage() {
  // Anon-cacheable reads ONLY (spec invariant 1). No auth(), no headers().
  const [hot, fresh] = await Promise.all([getHubHotPage(), getHubNewPage()]);
  return (
    <PageMain>
      <SectionHeading title="Discussions" />
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        Persistent, spoiler-safe discussion across every title. Hot and New are open to all;
        sign in to see discussions from people you follow and shows you track.
      </p>
      <HubTabs initialHot={hot.cards} initialNew={fresh.cards} />
    </PageMain>
  );
}
```

Run (pass): `... yarn vitest run src/app/discussions/hub-thread-card.test.tsx`. `yarn typecheck`.

**Commit:** `feat(discussions): global /discussions hub page (Hot · New · Following)`

---

### Task 7 — Episode-drop notify helper

Add `notifyEpisodeDrop` to the notify layer. Idempotency (one row per viewer/series/season) is enforced via a payload-key existence check before write.

**Failing test** — `src/server/services/notifications/notify-episode-drop.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { episodeDropPayloadKey, episodeDropMessage } from "./notify";

describe("episode-drop payload helpers", () => {
  it("builds a stable per (series,season) idempotency key", () => {
    expect(episodeDropPayloadKey(1396, 6)).toBe("series:1396:s6");
  });

  it("messages a season drop with the show title", () => {
    expect(episodeDropMessage("Stranger Things", 5)).toContain("Stranger Things");
    expect(episodeDropMessage("Stranger Things", 5)).toMatch(/season 5/i);
  });
});
```

Run (fail).

**Implementation** — append to `src/server/services/notifications/notify.ts`:

```ts
import { createNotification } from "@/server/db/postgres/social/notifications";

export function episodeDropPayloadKey(seriesId: number, seasonNumber: number): string {
  return `series:${seriesId}:s${seasonNumber}`;
}

export function episodeDropMessage(seriesTitle: string, seasonNumber: number): string {
  return `New episodes of ${seriesTitle} (season ${seasonNumber}) — its discussion is now open.`;
}

interface EpisodeDropParams {
  recipientId: number;
  seriesId: number;
  seriesTitle: string;
  seasonNumber: number;
  url: string;
}

/**
 * Write-on-event, bounded by the viewer's tracked set (spec §7) — NOT a fan-out.
 * Idempotent: skip if an EPISODE_DROP for this (series,season) already exists for
 * the recipient (the cron may re-scan overlapping windows).
 */
export async function notifyEpisodeDrop(params: EpisodeDropParams): Promise<boolean> {
  const key = episodeDropPayloadKey(params.seriesId, params.seasonNumber);
  const existing = await prisma.notification.findFirst({
    where: {
      userId: params.recipientId,
      type: "EPISODE_DROP",
      payload: { path: ["dropKey"], equals: key },
    },
    select: { id: true },
  });
  if (existing) return false;

  await createNotification({
    userId: params.recipientId,
    type: "EPISODE_DROP",
    actorId: null,
    payload: {
      dropKey: key,
      seriesId: params.seriesId,
      seasonNumber: params.seasonNumber,
      title: params.seriesTitle,
      url: params.url,
    },
  });

  void sendPushToUser(params.recipientId, {
    title: `New on a show you track`,
    body: episodeDropMessage(params.seriesTitle, params.seasonNumber),
    url: params.url,
  });
  return true;
}
```

Run (pass). `yarn typecheck`.

**Commit:** `feat(notifications): notifyEpisodeDrop helper (bounded, idempotent, no fan-out)`

---

### Task 8 — Likes-batch coalescing

Pure decision logic + a DB wrapper. A like coalesces into the recipient's existing unread `LIKES_BATCH` row for the same comment, else inserts a fresh one.

**Failing test** — `src/server/services/notifications/likes-batch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeLikesPayload, likesBatchMessage } from "./likes-batch";

describe("mergeLikesPayload", () => {
  it("starts a fresh payload from no prior row", () => {
    const next = mergeLikesPayload(null, { actorName: "Ada", commentId: 9, url: "/x" });
    expect(next.count).toBe(1);
    expect(next.sampleActor).toBe("Ada");
    expect(next.commentId).toBe(9);
  });

  it("increments the count and keeps the newest actor as the sample", () => {
    const first = mergeLikesPayload(null, { actorName: "Ada", commentId: 9, url: "/x" });
    const second = mergeLikesPayload(first, { actorName: "Bea", commentId: 9, url: "/x" });
    expect(second.count).toBe(2);
    expect(second.sampleActor).toBe("Bea");
  });
});

describe("likesBatchMessage", () => {
  it("renders a single liker", () => {
    expect(likesBatchMessage({ count: 1, sampleActor: "Ada", commentId: 9, url: "/x" })).toBe(
      "Ada liked your comment"
    );
  });
  it("renders Ada + N others for many likers", () => {
    expect(likesBatchMessage({ count: 4, sampleActor: "Ada", commentId: 9, url: "/x" })).toBe(
      "Ada + 3 others liked your comment"
    );
  });
});
```

Run (fail).

**Implementation** — `src/server/services/notifications/likes-batch.ts`:

```ts
import { prisma } from "@/server/db/postgres";
import { createNotification } from "@/server/db/postgres/social/notifications";
import { getExcludedAuthorIds } from "@/server/db/postgres/blocks";

export interface LikesBatchPayload {
  count: number;
  sampleActor: string;
  commentId: number;
  url: string;
}

interface LikeEvent {
  actorName: string;
  commentId: number;
  url: string;
}

/** Pure: coalesce a like into the running batch payload (newest actor sampled). */
export function mergeLikesPayload(prev: LikesBatchPayload | null, ev: LikeEvent): LikesBatchPayload {
  return {
    count: (prev?.count ?? 0) + 1,
    sampleActor: ev.actorName,
    commentId: ev.commentId,
    url: ev.url,
  };
}

export function likesBatchMessage(p: LikesBatchPayload): string {
  if (p.count <= 1) return `${p.sampleActor} liked your comment`;
  return `${p.sampleActor} + ${p.count - 1} others liked your comment`;
}

function asPayload(value: unknown): LikesBatchPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.count !== "number" || typeof v.commentId !== "number") return null;
  return {
    count: v.count,
    sampleActor: typeof v.sampleActor === "string" ? v.sampleActor : "Someone",
    commentId: v.commentId,
    url: typeof v.url === "string" ? v.url : "",
  };
}

/**
 * Likes-on-my-comment notification — BATCHED + low-priority (spec §7): never
 * one-per-like. Coalesces into the recipient's existing UNREAD LIKES_BATCH row
 * for the same comment, else inserts a fresh one. No fan-out, block-respecting.
 */
export async function notifyLikeBatched(params: {
  recipientId: number;
  actorId: number;
  actorName: string;
  commentId: number;
  url: string;
}): Promise<void> {
  if (params.actorId === params.recipientId) return; // self-like never notifies
  const excluded = await getExcludedAuthorIds(params.recipientId);
  if (excluded.includes(params.actorId)) return;

  const existing = await prisma.notification.findFirst({
    where: {
      userId: params.recipientId,
      type: "LIKES_BATCH",
      readAt: null,
      payload: { path: ["commentId"], equals: params.commentId },
    },
    orderBy: { id: "desc" },
    select: { id: true, payload: true },
  });

  const next = mergeLikesPayload(existing ? asPayload(existing.payload) : null, {
    actorName: params.actorName,
    commentId: params.commentId,
    url: params.url,
  });

  if (existing) {
    await prisma.notification.update({
      where: { id: existing.id },
      data: { payload: { ...next, title: "likes" }, createdAt: new Date() },
    });
    return;
  }
  await createNotification({
    userId: params.recipientId,
    type: "LIKES_BATCH",
    actorId: params.actorId,
    payload: { ...next, title: "likes" },
  });
}
```

> Wire-in (no test needed — the reaction action is Phase B): in the like-reaction server action's success path, call `void notifyLikeBatched({ recipientId: <comment author id>, actorId, actorName, commentId, url })` fire-and-forget, after the reaction row is created. If Phase B's reaction action does not yet exist on this branch, leave a one-line `// Phase D: call notifyLikeBatched here` marker at the reaction insert site and note it in the commit body.

Run (pass). `yarn typecheck`.

**Commit:** `feat(notifications): batched likes-on-my-comment (coalesce, never one-per-like)`

---

### Task 9 — Render new notification types in the center

**Failing test** — `src/components/features/notifications/notification-describe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeNotification } from "./describe";
import type { NotificationDto } from "@/server/actions/notifications";

function dto(over: Partial<NotificationDto>): NotificationDto {
  return {
    id: 1,
    type: "REPLY",
    read: false,
    createdAt: "2026-06-15T00:00:00.000Z",
    actor: { id: 2, username: "ada", name: "Ada", image: null },
    payload: {},
    ...over,
  };
}

describe("describeNotification", () => {
  it("describes EPISODE_DROP from the payload title", () => {
    const text = describeNotification(
      dto({ type: "EPISODE_DROP", actor: null, payload: { title: "Severance" } })
    );
    expect(text).toMatch(/Severance/);
    expect(text).toMatch(/discussion is now open/i);
  });

  it("describes a batched-likes notification", () => {
    const text = describeNotification(
      dto({ type: "LIKES_BATCH", actor: null, payload: { count: 3, sampleActor: "Ada" } as never })
    );
    expect(text).toMatch(/Ada/);
    expect(text).toMatch(/2 others/);
  });

  it("falls back to the existing REPLY copy", () => {
    expect(describeNotification(dto({ type: "REPLY", payload: { title: "Heat" } }))).toMatch(
      /replied to your comment/i
    );
  });
});
```

Run (fail).

**Implementation** — extract describe into `src/components/features/notifications/describe.ts`:

```ts
import type { NotificationDto } from "@/server/actions/notifications";

export function describeNotification(n: NotificationDto): string {
  const who = n.actor?.username ?? n.actor?.name ?? "Someone";
  const title = n.payload.title ?? "a title";
  if (n.type === "REPLY") return `${who} replied to your comment on ${title}`;
  if (n.type === "MENTION") return `${who} mentioned you on ${title}`;
  if (n.type === "FOLLOW") return `${who} followed you`;
  if (n.type === "EPISODE_DROP") {
    return `New episodes of ${title} — its discussion is now open`;
  }
  if (n.type === "LIKES_BATCH") {
    const p = n.payload as { count?: number; sampleActor?: string };
    const sample = p.sampleActor ?? "Someone";
    const count = p.count ?? 1;
    return count <= 1
      ? `${sample} liked your comment`
      : `${sample} + ${count - 1} others liked your comment`;
  }
  return `${who} · ${title}`;
}
```

Then edit `src/components/features/notifications/notification-list.tsx`: delete its local `describe` function and import `describeNotification` from `./describe`, replacing the `describe(n)` call site with `describeNotification(n)`.

Run (pass). `yarn typecheck`.

**Commit:** `feat(notifications): render EPISODE_DROP + LIKES_BATCH in the center`

---

### Task 10 — Cue prompt + input builder

A spoiler-free, opinion-inviting opener grounded in `ai_data` themes/premise.

**Failing test** — `src/server/services/cue/cue-prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CUE_SYSTEM_PROMPT, buildCueUserPrompt } from "./cue-prompt";

describe("buildCueUserPrompt", () => {
  it("includes the title, year, genres and themes when present", () => {
    const p = buildCueUserPrompt({
      title: "The Matrix",
      year: 1999,
      mediaType: "movie",
      genres: ["Sci-Fi", "Action"],
      themes: ["free will", "simulated reality"],
      hook: "A hacker learns reality is a lie.",
      overview: "A computer hacker learns about the true nature of reality.",
    });
    expect(p).toContain("The Matrix");
    expect(p).toContain("1999");
    expect(p).toContain("simulated reality");
  });

  it("instructs spoiler-free, opinion-inviting, no-spoilers output in the system prompt", () => {
    expect(CUE_SYSTEM_PROMPT.toLowerCase()).toContain("no spoiler");
    expect(CUE_SYSTEM_PROMPT.toLowerCase()).toContain("question");
  });

  it("omits a missing-overview line gracefully", () => {
    const p = buildCueUserPrompt({
      title: "Untitled",
      year: null,
      mediaType: "series",
      genres: [],
      themes: [],
      hook: null,
      overview: null,
    });
    expect(p).toContain("Untitled");
    expect(p).not.toContain("undefined");
  });
});
```

Run (fail).

**Implementation** — `src/server/services/cue/cue-prompt.ts`:

```ts
export interface CuePromptInput {
  title: string;
  year: number | null;
  mediaType: "movie" | "series";
  genres: string[];
  themes: string[];
  hook: string | null;
  overview: string | null;
}

export const CUE_SYSTEM_PROMPT = `You are Cue, the friendly AI host of a movie & TV discussion community. You write the FIRST comment that opens a discussion thread on a title's page, to invite real fans to reply.

Rules:
- Output ONE short paragraph (max 50 words). Plain text. No markdown headers, no lists.
- Absolutely NO spoilers — assume the reader has NOT seen it. Reference only premise, themes, genre, vibe.
- End with ONE open, opinion-inviting question that makes a fan want to reply.
- Warm, curious, never salesy. Do not claim to have watched it. Do not use hashtags or emoji.`;

export function buildCueUserPrompt(input: CuePromptInput): string {
  const lines: string[] = [];
  const kind = input.mediaType === "movie" ? "film" : "series";
  lines.push(`Open a discussion for the ${kind}: "${input.title}"${input.year ? ` (${input.year})` : ""}.`);
  if (input.genres.length) lines.push(`Genres: ${input.genres.join(", ")}.`);
  if (input.themes.length) lines.push(`Themes: ${input.themes.join(", ")}.`);
  if (input.hook) lines.push(`Hook: ${input.hook}`);
  if (input.overview) lines.push(`Premise: ${input.overview}`);
  lines.push(`Write Cue's spoiler-free opening comment now.`);
  return lines.join("\n");
}
```

Run (pass). `yarn typecheck`.

**Commit:** `feat(cue): spoiler-free opener prompt + grounded input builder`

---

### Task 11 — Cue seed: user resolution + idempotency (pure + DB)

The Cue user metadata flag, idempotency predicate (skip if a Cue seed OR any human comment exists for the title), and the seed insert via `auditedTransaction`.

**Failing test** — `src/server/services/cue/cue-seed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CUE_USERNAME,
  CUE_METADATA,
  shouldSkipTitle,
  type TitleSeedState,
} from "./cue-seed";

describe("Cue user identity", () => {
  it("uses the reserved 'cue' username and a bot metadata flag", () => {
    expect(CUE_USERNAME).toBe("cue");
    expect(CUE_METADATA.bot).toBe(true);
  });
});

describe("shouldSkipTitle (idempotency)", () => {
  const base: TitleSeedState = { hasCueSeed: false, hasHumanComment: false };

  it("does NOT skip a virgin title", () => {
    expect(shouldSkipTitle(base)).toBe(false);
  });

  it("skips a title that already has a Cue seed", () => {
    expect(shouldSkipTitle({ ...base, hasCueSeed: true })).toBe(true);
  });

  it("skips a title that already has any human comment (the long tail stays empty unless humans showed up)", () => {
    expect(shouldSkipTitle({ ...base, hasHumanComment: true })).toBe(true);
  });
});
```

Run (fail).

**Implementation** — `src/server/services/cue/cue-seed.ts`:

```ts
import { CommentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { auditedTransaction } from "@/server/db/audit";

export const CUE_USERNAME = "cue";
export const CUE_METADATA = { bot: true, displayName: "Cue", aiAuthor: true } as const;

export interface TitleSeedState {
  /** title already has a Cue-authored title-level comment */
  hasCueSeed: boolean;
  /** title already has at least one human (non-Cue) comment */
  hasHumanComment: boolean;
}

/** Idempotency rule (spec §8): seed only virgin titles. */
export function shouldSkipTitle(state: TitleSeedState): boolean {
  return state.hasCueSeed || state.hasHumanComment;
}

/** Ensure the reserved Cue system user exists; returns its id. */
export async function ensureCueUser(): Promise<number> {
  const existing = await prisma.user.findUnique({ where: { username: CUE_USERNAME }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.user.create({
    data: {
      googleId: "system:cue",
      email: "cue@system.themoviebrowser.com",
      name: "Cue",
      username: CUE_USERNAME,
      isPublic: true,
      metadata: CUE_METADATA as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return created.id;
}

export interface TitleAnchor {
  mediaType: "movie" | "series";
  id: number; // movieId or seriesId
}

/** Read the seed state for a title — one cheap existence query per side. */
export async function getTitleSeedState(cueUserId: number, anchor: TitleAnchor): Promise<TitleSeedState> {
  const anchorWhere: Prisma.CommentWhereInput =
    anchor.mediaType === "movie" ? { movieId: anchor.id } : { seriesId: anchor.id };
  const [cue, human] = await Promise.all([
    prisma.comment.findFirst({ where: { ...anchorWhere, userId: cueUserId }, select: { id: true } }),
    prisma.comment.findFirst({
      where: { ...anchorWhere, userId: { not: cueUserId } },
      select: { id: true },
    }),
  ]);
  return { hasCueSeed: cue !== null, hasHumanComment: human !== null };
}

/**
 * Insert ONE Cue opener at title level, spoilerScope=NONE, PUBLISHED, no toxicity
 * gate (trusted system author). Wrapped in auditedTransaction(cueUserId, …) for
 * actor attribution (invariant 5).
 */
export async function insertCueSeed(
  cueUserId: number,
  anchor: TitleAnchor,
  body: string
): Promise<number> {
  const created = await auditedTransaction(cueUserId, (tx) =>
    tx.comment.create({
      data: {
        userId: cueUserId,
        movieId: anchor.mediaType === "movie" ? anchor.id : null,
        seriesId: anchor.mediaType === "series" ? anchor.id : null,
        body,
        spoilerScope: "NONE",
        status: CommentStatus.PUBLISHED,
        aiLabels: { cueSeed: true, generatedAt: new Date().toISOString() } as object,
      },
      select: { id: true },
    })
  );
  return created.id;
}
```

Run (pass). `yarn typecheck`.

**Commit:** `feat(cue): system user, idempotency rule, audited title-level seed insert`

---

### Task 12 — Cue seed cron script

`scripts/seed-cue-comments.ts` — `CRON_HOUR_UTC`-guarded, `FORCE_RUN` override, walks top-N trending titles, seeds virgin ones via one Bedrock Flex call each. Unit-test the guard + selection (no DB, no Bedrock).

**Failing test** — `scripts/seed-cue-comments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldRunNow, takeTrendingBudget } from "./seed-cue-comments";

describe("shouldRunNow (cron-window guard)", () => {
  it("runs inside the configured UTC hour", () => {
    expect(shouldRunNow({ nowHourUtc: 23, cronHourUtc: 23, force: false, dryRun: false })).toBe(true);
  });
  it("skips outside the window (deploy-time PM2 autostart guard)", () => {
    expect(shouldRunNow({ nowHourUtc: 9, cronHourUtc: 23, force: false, dryRun: false })).toBe(false);
  });
  it("runs anyway when FORCE_RUN is set", () => {
    expect(shouldRunNow({ nowHourUtc: 9, cronHourUtc: 23, force: true, dryRun: false })).toBe(true);
  });
  it("runs in dry-run regardless of hour", () => {
    expect(shouldRunNow({ nowHourUtc: 9, cronHourUtc: 23, force: false, dryRun: true })).toBe(true);
  });
});

describe("takeTrendingBudget", () => {
  it("caps the daily seed budget at top-N", () => {
    const titles = Array.from({ length: 50 }, (_, i) => ({ mediaType: "movie" as const, id: i }));
    expect(takeTrendingBudget(titles, 10)).toHaveLength(10);
  });
  it("returns all when fewer than the cap", () => {
    const titles = [{ mediaType: "series" as const, id: 1 }];
    expect(takeTrendingBudget(titles, 10)).toHaveLength(1);
  });
});
```

Run (fail).

**Implementation** — `scripts/seed-cue-comments.ts`:

```ts
#!/usr/bin/env npx tsx
/**
 * Cue trending-seed cron (spec §8). Walks the current trending set (popularity
 * DESC), capped at top-N/day, and seeds ONE spoiler-free Cue opener per VIRGIN
 * title (idempotent: skip if it already has a Cue seed OR any human comment).
 * One Bedrock Flex call per seeded title, grounded in ai_data.
 *
 * Cost = O(trending/day) — flat, predictable, never O(catalog). Fires on ZERO
 * render/crawl paths.
 *
 * Usage:
 *   FORCE_RUN=1 npx tsx scripts/seed-cue-comments.ts --limit=20
 *   FORCE_RUN=1 npx tsx scripts/seed-cue-comments.ts --limit=5 --dry-run
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { prisma } from "../src/server/db/postgres";
import { callBedrockFlex } from "../src/server/services/enrichment/bedrock-flex";
import { getAIData } from "../src/server/services/ai-data-service";
import {
  CUE_SYSTEM_PROMPT,
  buildCueUserPrompt,
  type CuePromptInput,
} from "../src/server/services/cue/cue-prompt";
import {
  ensureCueUser,
  getTitleSeedState,
  insertCueSeed,
  shouldSkipTitle,
  type TitleAnchor,
} from "../src/server/services/cue/cue-seed";

export interface TrendingTitle {
  mediaType: "movie" | "series";
  id: number;
}

export function shouldRunNow(p: {
  nowHourUtc: number;
  cronHourUtc: number;
  force: boolean;
  dryRun: boolean;
}): boolean {
  if (p.force || p.dryRun) return true;
  return p.nowHourUtc === p.cronHourUtc;
}

export function takeTrendingBudget(titles: TrendingTitle[], limit: number): TrendingTitle[] {
  return titles.slice(0, limit);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const DAILY_LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 20;

async function fetchTrending(half: number): Promise<TrendingTitle[]> {
  const [movies, series] = await Promise.all([
    prisma.movie.findMany({
      where: { popularity: { not: null } },
      orderBy: { popularity: "desc" },
      take: half,
      select: { id: true },
    }),
    prisma.series.findMany({
      where: { popularity: { not: null } },
      orderBy: { popularity: "desc" },
      take: half,
      select: { id: true },
    }),
  ]);
  return [
    ...movies.map((m) => ({ mediaType: "movie" as const, id: m.id })),
    ...series.map((s) => ({ mediaType: "series" as const, id: s.id })),
  ];
}

async function buildPromptInput(anchor: TitleAnchor): Promise<CuePromptInput | null> {
  if (anchor.mediaType === "movie") {
    const movie = await prisma.movie.findUnique({
      where: { id: anchor.id },
      select: { title: true, releaseDate: true, overview: true, genres: { select: { genre: { select: { name: true } } } } },
    });
    if (!movie) return null;
    const ai = await getAIData(anchor.id, "movie");
    return {
      title: movie.title,
      year: movie.releaseDate ? movie.releaseDate.getUTCFullYear() : null,
      mediaType: "movie",
      genres: movie.genres.map((g) => g.genre.name),
      themes: ai?.summary?.themes ?? [],
      hook: ai?.summary?.hook ?? null,
      overview: movie.overview ?? null,
    };
  }
  const series = await prisma.series.findUnique({
    where: { id: anchor.id },
    select: { name: true, firstAirDate: true, overview: true, genres: { select: { genre: { select: { name: true } } } } },
  });
  if (!series) return null;
  const ai = await getAIData(anchor.id, "series");
  return {
    title: series.name,
    year: series.firstAirDate ? series.firstAirDate.getUTCFullYear() : null,
    mediaType: "series",
    genres: series.genres.map((g) => g.genre.name),
    themes: ai?.summary?.themes ?? [],
    hook: ai?.summary?.hook ?? null,
    overview: series.overview ?? null,
  };
}

async function main() {
  const cronHourUtc = Number(process.env.CRON_HOUR_UTC ?? "20");
  const nowHourUtc = new Date().getUTCHours();
  if (!shouldRunNow({ nowHourUtc, cronHourUtc, force: process.env.FORCE_RUN === "1", dryRun })) {
    console.log(
      `⏭ Outside cron window (hour ${nowHourUtc} UTC, expected ${cronHourUtc}) — exiting. FORCE_RUN=1 to override.`
    );
    process.exit(0);
  }

  console.log(`🌱 Cue seed run — limit ${DAILY_LIMIT}${dryRun ? " (DRY RUN)" : ""}`);
  const cueUserId = dryRun ? -1 : await ensureCueUser();
  // Pull a generous trending slate (2x budget) so skips don't starve the budget.
  const slate = takeTrendingBudget(await fetchTrending(DAILY_LIMIT * 2), DAILY_LIMIT * 2);

  let seeded = 0;
  for (const anchor of slate) {
    if (seeded >= DAILY_LIMIT) break;
    const state = dryRun
      ? { hasCueSeed: false, hasHumanComment: false }
      : await getTitleSeedState(cueUserId, anchor);
    if (shouldSkipTitle(state)) continue;

    const input = await buildPromptInput(anchor);
    if (!input) continue;

    if (dryRun) {
      console.log(`   would seed ${anchor.mediaType}:${anchor.id} — "${input.title}"`);
      seeded++;
      continue;
    }

    try {
      const result = await callBedrockFlex({
        systemPrompt: CUE_SYSTEM_PROMPT,
        messages: [{ role: "user", text: buildCueUserPrompt(input) }],
        maxTokens: 120,
        temperature: 0.8,
        useFlex: true,
      });
      const body = result.output.trim();
      if (!body) continue;
      const id = await insertCueSeed(cueUserId, anchor, body);
      console.log(`   ✅ seeded ${anchor.mediaType}:${anchor.id} → comment ${id}`);
      seeded++;
    } catch (error: unknown) {
      console.error(`   ❌ ${anchor.mediaType}:${anchor.id}:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`\n✅ Cue seed complete — ${seeded} seeded.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

> If `getAIData`'s response shape differs (`ai?.summary?.themes`), adjust to the real `AIDataResponse`/`aiDataResponseToSummary` shape — confirm by reading `src/server/services/ai-data-service.ts` before implementing. The pure functions under test (`shouldRunNow`, `takeTrendingBudget`) do not depend on it.

Run (pass): `... yarn vitest run scripts/seed-cue-comments.test.ts`. `yarn typecheck`.

**Commit:** `feat(cue): trending-seed cron (guarded, top-N/day, idempotent, Flex-grounded)`

---

### Task 13 — Episode-drop cron script

`scripts/seed-episode-drop-notifications.ts` — guarded; diffs newly-aired episodes against tracked sets; one bounded `EPISODE_DROP` per (viewer, series, season). Unit-test guard + the newly-aired diff window (no DB).

**Failing test** — `scripts/seed-episode-drop-notifications.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  shouldRunNow,
  isNewlyAired,
  EPISODE_DROP_LOOKBACK_MS,
  dropKeysFromEpisodes,
} from "./seed-episode-drop-notifications";

const NOW = new Date("2026-06-15T00:00:00Z");

describe("shouldRunNow", () => {
  it("respects the cron window with FORCE_RUN override", () => {
    expect(shouldRunNow({ nowHourUtc: 5, cronHourUtc: 5, force: false })).toBe(true);
    expect(shouldRunNow({ nowHourUtc: 9, cronHourUtc: 5, force: false })).toBe(false);
    expect(shouldRunNow({ nowHourUtc: 9, cronHourUtc: 5, force: true })).toBe(true);
  });
});

describe("isNewlyAired", () => {
  it("true for an episode aired within the lookback window", () => {
    const within = new Date(NOW.getTime() - EPISODE_DROP_LOOKBACK_MS / 2);
    expect(isNewlyAired(within, NOW)).toBe(true);
  });
  it("false for an episode aired long ago (avoid backfill spam)", () => {
    expect(isNewlyAired(new Date("2020-01-01T00:00:00Z"), NOW)).toBe(false);
  });
  it("false for a future air date", () => {
    expect(isNewlyAired(new Date("2027-01-01T00:00:00Z"), NOW)).toBe(false);
  });
  it("false for a NULL air date (UNKNOWN, not a real drop)", () => {
    expect(isNewlyAired(null, NOW)).toBe(false);
  });
});

describe("dropKeysFromEpisodes", () => {
  it("collapses multiple episodes of one season into ONE (series,season) drop key", () => {
    const keys = dropKeysFromEpisodes([
      { seriesId: 1396, seasonNumber: 6 },
      { seriesId: 1396, seasonNumber: 6 },
      { seriesId: 1396, seasonNumber: 7 },
    ]);
    expect(keys).toEqual([
      { seriesId: 1396, seasonNumber: 6 },
      { seriesId: 1396, seasonNumber: 7 },
    ]);
  });
});
```

Run (fail).

**Implementation** — `scripts/seed-episode-drop-notifications.ts`:

```ts
#!/usr/bin/env npx tsx
/**
 * Episode-drop notification cron (spec §7). Finds episodes that crossed into the
 * past within the lookback window, and for each viewer tracking that series
 * (series_progress WATCHING/REWATCHING) writes ONE bounded EPISODE_DROP
 * notification per (series, season): "its discussion is now open."
 *
 * Bounded by each viewer's tracked set — NEVER a fan-out. Idempotent: the notify
 * helper skips if a drop for that (series,season) already exists for the viewer.
 *
 * Usage:
 *   FORCE_RUN=1 npx tsx scripts/seed-episode-drop-notifications.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { prisma } from "../src/server/db/postgres";
import { notifyEpisodeDrop } from "../src/server/services/notifications/notify";

export const EPISODE_DROP_LOOKBACK_MS = 36 * 60 * 60 * 1000; // 36h — covers a daily run + slack

export function shouldRunNow(p: { nowHourUtc: number; cronHourUtc: number; force: boolean }): boolean {
  if (p.force) return true;
  return p.nowHourUtc === p.cronHourUtc;
}

export function isNewlyAired(airDate: Date | null, now: Date): boolean {
  if (airDate === null) return false;
  const t = airDate.getTime();
  return t <= now.getTime() && t > now.getTime() - EPISODE_DROP_LOOKBACK_MS;
}

export interface SeasonDropKey {
  seriesId: number;
  seasonNumber: number;
}

/** Collapse aired episodes to unique (series, season) drop keys, order preserved. */
export function dropKeysFromEpisodes(
  episodes: Array<{ seriesId: number; seasonNumber: number }>
): SeasonDropKey[] {
  const seen = new Set<string>();
  const out: SeasonDropKey[] = [];
  for (const e of episodes) {
    const k = `${e.seriesId}:${e.seasonNumber}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ seriesId: e.seriesId, seasonNumber: e.seasonNumber });
  }
  return out;
}

async function main() {
  const cronHourUtc = Number(process.env.CRON_HOUR_UTC ?? "5");
  const nowHourUtc = new Date().getUTCHours();
  if (!shouldRunNow({ nowHourUtc, cronHourUtc, force: process.env.FORCE_RUN === "1" })) {
    console.log(`⏭ Outside cron window (hour ${nowHourUtc} UTC, expected ${cronHourUtc}) — exiting.`);
    process.exit(0);
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - EPISODE_DROP_LOOKBACK_MS);

  // Episodes that aired in the window, with their parent series id (natural keys).
  const episodes = await prisma.episode.findMany({
    where: { airDate: { gt: windowStart, lte: now } },
    select: { episodeNumber: true, season: { select: { seriesId: true, seasonNumber: true } } },
  });
  const seasonKeys = dropKeysFromEpisodes(
    episodes
      .filter((e) => e.season != null)
      .map((e) => ({ seriesId: e.season.seriesId, seasonNumber: e.season.seasonNumber }))
  );

  console.log(`📺 ${seasonKeys.length} (series,season) drops in the last ${EPISODE_DROP_LOOKBACK_MS / 3.6e6}h`);

  let notified = 0;
  for (const key of seasonKeys) {
    const series = await prisma.series.findUnique({
      where: { id: key.seriesId },
      select: { name: true },
    });
    if (!series) continue;
    // Bounded recipients: only viewers actively tracking this series.
    const trackers = await prisma.seriesProgress.findMany({
      where: { seriesId: key.seriesId, status: { in: ["WATCHING", "REWATCHING"] } },
      select: { userId: true },
    });
    for (const t of trackers) {
      const wrote = await notifyEpisodeDrop({
        recipientId: t.userId,
        seriesId: key.seriesId,
        seriesTitle: series.name,
        seasonNumber: key.seasonNumber,
        url: `/series/${key.seriesId}/discussions`,
      });
      if (wrote) notified++;
    }
  }

  console.log(`✅ Episode-drop run complete — ${notified} notifications written.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

> Confirm `WatchStatus` includes `WATCHING` and `REWATCHING` before implementing (grep `enum WatchStatus` in schema); use the exact member names.

Run (pass): `... yarn vitest run scripts/seed-episode-drop-notifications.test.ts`. `yarn typecheck`.

**Commit:** `feat(notifications): episode-drop cron (bounded tracked-set, idempotent, guarded)`

---

### Task 14 — Render the Cue AI badge on comments + composer audience stub

Two small UI seams: Cue badge in `comment-item.tsx` (needs an `isCue` flag threaded through the existing `CommentDto`) and the inert composer audience-selector stub.

First extend the DTO. **Failing test** — `src/server/db/postgres/comments-iscue.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { commentIsCue } from "./comments";

describe("commentIsCue", () => {
  it("true when the author metadata carries a bot flag", () => {
    expect(commentIsCue({ bot: true })).toBe(true);
  });
  it("false for a normal author / null metadata", () => {
    expect(commentIsCue(null)).toBe(false);
    expect(commentIsCue({})).toBe(false);
    expect(commentIsCue([])).toBe(false);
  });
});
```

Run (fail).

**Implementation** — in `src/server/db/postgres/comments.ts` add an exported pure helper and an optional `isCue` on `CommentDto`:

```ts
import type { Prisma } from "@/server/db/postgres";

/** True when an author's users.metadata marks it as a bot (Cue). Pure. */
export function commentIsCue(metadata: Prisma.JsonValue | null | undefined): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).bot === true
  );
}
```

Add `isCue?: boolean` to the `CommentDto` interface (default omitted/false). In `AUTHOR_SELECT`, add `metadata: true`, and in `toCommentDto` set `isCue: commentIsCue(row.user?.metadata ?? null)`. (The existing author projection broadens by one column — harmless and small.)

Then render it. The component test — `src/components/features/discussion/comment-item-cue.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CueBadge } from "./cue-badge";

describe("CueBadge", () => {
  it("renders an AI label", () => {
    render(<CueBadge />);
    expect(screen.getByText("AI")).toBeInTheDocument();
  });
});
```

Run (fail) — then it passes once `cue-badge.tsx` (Task 6) exists; this task wires it into `comment-item.tsx`: where the author name renders, conditionally render `{comment.isCue ? <CueBadge className="ml-1" /> : null}`.

Composer stub — in `src/components/features/discussion/comment-composer.tsx`, near the submit row, add the inert affordance (no test needed; it is a static disabled control):

```tsx
{/* Circles-readiness seam (spec §9) — NOT WIRED. Reserves the audience selector. */}
<button
  type="button"
  disabled
  aria-disabled="true"
  data-circles-readiness="true"
  title="Posting to circles is coming soon"
  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground"
>
  Everyone
</button>
```

Run (pass): `... yarn vitest run src/server/db/postgres/comments-iscue.test.ts src/components/features/discussion/comment-item-cue.test.tsx`. `yarn typecheck`.

**Commit:** `feat(discussions): Cue AI badge on comments + inert composer audience stub`

---

### Task 15 — Register PM2 cron jobs + docs

Add both crons to `ecosystem.config.cjs` (prod schedule), update CLAUDE.md's PM2 table and the social-features rule. No test (config/doc only) — verify with `yarn typecheck` (cjs is untouched by TS) and a dry-run.

**Implementation** — append two apps to `ecosystem.config.cjs` `apps` array (low-traffic window, staggered after sitemap at 22:00):

```js
// Episode-drop notifications - daily at 05:00 UTC (10:30 IST). Diffs newly-aired
// episodes against viewers' tracked sets and writes ONE bounded EPISODE_DROP per
// (viewer, series, season). No fan-out; idempotent.
{
  name: "episode-drop-notify",
  cwd: "/home/ubuntu/movie-browser-next",
  script: "bash",
  args: ["-c", "exec nice -n 19 npx tsx scripts/seed-episode-drop-notifications.ts"],
  cron_restart: "0 5 * * *",
  autorestart: false,
  restart_delay: 5000,
  max_restarts: 2,
  min_uptime: "1s",
  watch: false,
  max_memory_restart: "700M",
  error_file: "./logs/episode-drop-error.log",
  out_file: "./logs/episode-drop-out.log",
  log_file: "./logs/episode-drop-combined.log",
  time: true,
  env: { NODE_ENV: "production", CRON_HOUR_UTC: "5" },
  kill_timeout: 300000,
},
// Cue trending seeds - daily at 20:00 UTC (01:30 IST). Walks top-N trending
// titles, seeds ONE spoiler-free Cue opener per virgin title (idempotent). One
// Bedrock Flex call per seed; O(trending/day) cost, never O(catalog).
{
  name: "cue-seed",
  cwd: "/home/ubuntu/movie-browser-next",
  script: "bash",
  args: ["-c", "exec nice -n 19 npx tsx scripts/seed-cue-comments.ts --limit=20"],
  cron_restart: "0 20 * * *",
  autorestart: false,
  restart_delay: 5000,
  max_restarts: 2,
  min_uptime: "1s",
  watch: false,
  max_memory_restart: "700M",
  error_file: "./logs/cue-seed-error.log",
  out_file: "./logs/cue-seed-out.log",
  log_file: "./logs/cue-seed-combined.log",
  time: true,
  env: { NODE_ENV: "production", CRON_HOUR_UTC: "20" },
  kill_timeout: 300000,
},
```

In `CLAUDE.md` "PM2 Scheduled Jobs" table, add two rows:

```
| `episode-drop-notify` | 05:00 UTC (10:30 IST) | Diff newly-aired episodes → EPISODE_DROP notifications for viewers tracking the series (bounded, idempotent) |
| `cue-seed` | 20:00 UTC (01:30 IST) | Seed ONE spoiler-free Cue opener on top-N trending virgin titles (idempotent; one Bedrock Flex call per seed) |
```

In `.claude/rules/social-features.md`, under Architecture add a "Phase D" bullet and add file-map rows for `discussion-hub.ts`, `cue/*`, the two crons, and the two new `NotificationType` values; note the `cue` system user (`users.metadata.bot=true`).

Verify (dry-run, no writes):

```bash
FORCE_RUN=1 DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' \
  USER_DATA_SOURCE=postgres npx tsx scripts/seed-cue-comments.ts --limit=3 --dry-run
yarn typecheck
```

**Commit:** `chore(discussions): register Cue + episode-drop PM2 crons; docs`

---

### Task 16 — Full-suite regression + final typecheck

Run the relevant Phase D suites and the global typecheck. No new code unless something fails.

```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run \
  prisma/schema-notification-types.test.ts \
  src/server/db/postgres/social/discussion-hub.test.ts \
  src/server/actions/discussions-hub.test.ts \
  src/components/features/discussion/audience-filter-slot.test.tsx \
  src/app/discussions/hub-thread-card.test.tsx \
  src/server/services/notifications/notify-episode-drop.test.ts \
  src/server/services/notifications/likes-batch.test.ts \
  src/components/features/notifications/notification-describe.test.ts \
  src/server/services/cue/cue-prompt.test.ts \
  src/server/services/cue/cue-seed.test.ts \
  scripts/seed-cue-comments.test.ts \
  scripts/seed-episode-drop-notifications.test.ts \
  src/server/db/postgres/comments-iscue.test.ts \
  src/components/features/discussion/comment-item-cue.test.tsx
yarn typecheck
```

If green: **Commit** `test(discussions): Phase D green — hub, notifications, Cue` (empty if nothing changed, otherwise the regression fixes).

---

## Notes / deferred (out of Phase D scope)

- **Per-row exact spoiler watermark in the Following tab** — the cross-catalog mixed list uses a conservative single-context gate; per-series exact watermarking is a Phase-A gate refinement. Gated bodies never leak (NONE always passes; tracked-series rows use that series' watermark conservatively).
- **Denormalized "Hot" activity counter** — Phase A's concern; Phase D's Hot uses a bounded 72h index-range scan ordered by likeCount, which is cheap at current scale.
- **CloudFront single-path invalidation** for moderation removals on the hub/discuss pages — parent spec open follow-up (unchanged; not wired here).
- **Reactions emoji-set expansion** and **rungs 6–7** (uploads/hotlinks) remain future.
- **VAPID keys** gate web push (episode-drop + likes pushes are silent no-ops if unset) — unchanged from Phase 1.
- The like-reaction notify wire-in (Task 8) depends on Phase B's reaction action existing; if absent, a marker is left at the insert site.
```
