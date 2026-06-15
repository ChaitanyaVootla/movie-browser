# Discussions — Phase A: Surface What's Built (TDD Implementation Plan)

**Date:** 2026-06-15
**Branch:** `feat/social-phase0` (LOCAL ONLY — NEVER push origin; pushing `next` auto-deploys prod)
**Spec (source of truth):** `docs/superpowers/specs/2026-06-15-discussions-positioning-design.md` §12.1 (Phase A), §2 (IA), §4 (counts).
**Rules honored:** `.claude/rules/social-features.md` (hard invariants), `.claude/rules/design-system.md` + `DESIGN.md` (UI law), `.claude/rules/performance.md` (ISR + AI-cost-safety), `.claude/rules/audit-log.md`.

---

## Goal

Make the already-built Phase 1 discussion engine **discoverable and inviting** without
touching its spoiler-gate, threading, or AI machinery. Specifically:

1. **Entry-point strip** near the top of every movie / series / episode detail page —
   adaptive count (invite below a threshold; real count + activity hint above), an
   in-page anchor jump to the inline section, and a link to the dedicated discussion
   page. CACHEABLE baseline only (no viewer data).
2. **"New since you watched"** — a per-anchor last-seen read cursor (extend
   `comment-reads.ts`) feeding a **client-side** upgrade of the strip ("N new since you
   watched"). NEVER in cacheable HTML.
3. **Dedicated pages** — new routes `/movie/[id]/discussions` and
   `/series/[...params]/discussions`. The series page is **activity-first**
   (Trending · Latest) with `All · Season ▾ · Episode ▾` scope filters, progress-gated and
   spoiler-safe (locked episodes render as `🔒` rows, never leaking by title).
   `DiscussionForumPosting` JSON-LD on movie/series roots (episode version already exists).
4. **Trending / Latest** sorts defined **cheaply, NO AI/ML** — Trending = recent
   comment-activity velocity (rolling window) + `likeCount`, read from **denormalized
   counters**; Latest = `createdAt DESC` keyset.
5. **Counts on media cards + search results** using the same adaptive cacheable baseline.
6. **Inline discussion section polish** — make it a PREVIEW (top N threads + composer +
   "View all →").

## Architecture

- **No viewer data in cacheable HTML.** Every new server-render path (strip baseline,
  dedicated-page roots, JSON-LD, card counts) reads ONLY the anon tier:
  `spoilerScope=NONE` AND `status=PUBLISHED` AND `circleId IS NULL` (via the existing
  `getPublicCommentPage` / `getPublishedCommentCount` / `getLockedCommentCount` helpers in
  `src/server/db/postgres/comments.ts`). Viewer state (gated comments, "N new since you
  watched") hydrates client-side via server-action POSTs — never edge-cached.
- **New ISR routes export `generateStaticParams` + `revalidate`** and contain NO
  `auth()`/`headers()` in their render trees (page, layout, and every server fn they call),
  or ISR silently dies (`performance.md` recipe item 3).
- **Denormalized Trending counters** — add `replyCount` + a rolling `recentActivityCount`
  + `lastActivityAt` to `comments`, maintained by atomic increments on write (in
  `createComment`) and a cheap recompute helper. Trending = ranked purely on stored
  columns; **NO per-render scan, NO AI**. Latest = `(createdAt, id)` keyset (already the
  pagination order).
- **Read cursor** — a new `comment_reads` table keyed by `(userId, anchorKey)` storing
  `lastSeenAt`. "New since you watched" counts visible (gated) comments with
  `createdAt > lastSeenAt` — computed in a server action (POST), never on render.
- **Natural-key episodes** preserved — anchors stay
  `(seriesId, seasonNumber, episodeNumber)`; the read cursor keys off the string
  `anchorKey()` so it needs no FK to `episodes`/`seasons`.
- **Audited mutations** — `markAnchorRead` writes only the cursor table (NOT in the audit
  opt-in set — a read cursor is not human-meaningful history), so no `auditedTransaction`
  needed; the increment of denormalized counters happens INSIDE the existing
  `auditedTransaction` in `createComment`.

## Tech Stack

Next.js 15 App Router · React 19 · TypeScript (strict, no `any`) · Prisma 6 (PostgreSQL,
dev DB on :5436) · Zod at action boundaries · Pino logging · shadcn/ui + Tailwind v4 +
`@/lib/design` primitives · Vitest (unit). AI fires on NOTHING in this phase.

## For agentic workers

Execute this plan with **`superpowers:subagent-driven-development`** — one subagent per
task, each task is a self-contained red→green→commit loop. Honor
`superpowers:test-driven-development` (write the failing test first, watch it fail, then
the minimal implementation) and `superpowers:verification-before-completion` (run the
exact command, confirm output, before claiming done). NEVER `git push`.

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `src/server/db/postgres/comments-trending.ts` | DB layer: Trending/Latest anchor-list queries for the series dedicated page + the denormalized-counter recompute helper. Anon-tier-only reads. |
| `src/server/db/postgres/comments-trending.test.ts` | Pure-helper tests (ranking comparator, scope-row mapping). |
| `src/server/db/postgres/comment-reads.ts` | DB layer: `getLastSeen` / `upsertLastSeen` / `countNewSince` for the per-anchor read cursor. |
| `src/server/services/discussion/trending.ts` | Pure ranking: `rankTrending(rows)` (recent-activity + likeCount weighted score), `compareTrending`. NO AI. |
| `src/server/services/discussion/trending.test.ts` | Unit tests for the ranking comparator. |
| `src/server/services/discussion/discussion-counts.ts` | Pure: `adaptiveCountLabel(count, threshold)` → invite-vs-real baseline string + variant. Shared by strip + cards + search. |
| `src/server/services/discussion/discussion-counts.test.ts` | Unit tests for the adaptive label thresholds. |
| `src/server/actions/discussion-reads.ts` | Server actions (POST): `getAnchorActivity` (count + "N new since you watched"), `markAnchorRead`. Viewer-only — never edge-cached. |
| `src/components/features/discussion/discussion-entry-strip.tsx` | Server component: cacheable baseline strip (adaptive count + anchor jump + dedicated-page link). |
| `src/components/features/discussion/discussion-entry-strip-client.tsx` | Client island: hydrates the strip to "N new since you watched" via `getAnchorActivity`; calls `markAnchorRead`. |
| `src/components/features/discussion/discussion-count-badge.tsx` | Tiny server component for card/search-result count badges (cacheable baseline). |
| `src/components/features/discussion/trending-comment-list.tsx` | Client list for the dedicated series page: Trending/Latest tabs + scope filters + locked-episode `🔒` rows. |
| `src/app/movie/[...params]/discussions/page.tsx` | Movie dedicated discussion page (single scope). ISR. |
| `src/app/series/[...params]/discussions/page.tsx` | Series dedicated discussion index (activity-first + scope filters). ISR. |

> **Route note:** both detail routes are catch-all (`[...params]`). A `discussions`
> child segment under a catch-all is legal in Next.js (the child segment wins over the
> catch-all for that exact path). The movie route is `/movie/[...params]/discussions`
> resolving `/movie/603/discussions` (and `/movie/603/the-matrix/discussions` via the
> page parsing `params[0]` as the id, mirroring the detail page). Confirm in Task 11.

### Modified files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | `Comment`: add `replyCount Int @default(0)`, `recentActivityCount Int @default(0)`, `lastActivityAt DateTime?` + a Trending index. New `model CommentRead`. |
| `src/server/db/postgres/comments.ts` | Add `getAnchorPublicSummary(anchor)` (count + `lastActivityAt`) for the cacheable baseline; export `PUBLIC_COMMENTS_WHERE` reuse. |
| `src/server/actions/comments.ts` | In `createComment`, inside the existing `auditedTransaction`, bump parent `replyCount`/`recentActivityCount`/`lastActivityAt` and the root's activity on every published comment. |
| `src/components/features/discussion/discussion-section.tsx` | Make the inline section a PREVIEW: top N (3) anon threads + composer + "View all →" link to the dedicated page; mount the entry strip is done by the page, not here. |
| `src/components/features/discussion/comment-list-client.tsx` | Accept a `previewLimit?: number` + `viewAllHref?: string`; when set, cap rendered roots and render "View all →" instead of "Show more". |
| `src/components/features/discussion/index.ts` | Export the new components. |
| `src/app/movie/[...params]/page.tsx` | Render `<DiscussionEntryStrip>` near the top; pass `viewAllHref` to the inline section. |
| `src/app/series/[...params]/page.tsx` | Same; `viewAllHref` → `/series/.../discussions`. |
| `src/app/series/[...params]/discuss-page.tsx` | Add an entry strip + breadcrumb link up to the series discussions index (episode page is the episode-scoped case). |
| `src/components/features/movie/media-card.tsx` (+ search result component found in Task 14) | Render `<DiscussionCountBadge>` when a count is supplied. |

### Schema deltas (summary)

- `Comment` += `replyCount`, `recentActivityCount`, `lastActivityAt` + index
  `@@index([movieId, circleId, status, lastActivityAt(sort: Desc)])` and the series
  equivalent (anon-tier Trending reads).
- New `model CommentRead` (`@@map("comment_reads")`, `@@unique([userId, anchorKey])`).

---

## Tasks

> **Every test command pins the dev DB.** Prefix:
> `DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser'`.
> Unit tests: `yarn vitest run <path>`. Typecheck: `yarn typecheck`.
> After any schema change: `db push` to :5436, then `npx pm2 restart mb-dev`.
> Commit messages END WITH:
> `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1 — Adaptive count label (pure)

**Step 1.1 — Write the failing test.**
Create `src/server/services/discussion/discussion-counts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { adaptiveCountLabel } from "./discussion-counts";

describe("adaptiveCountLabel", () => {
  it("invites below the threshold (no negative social proof)", () => {
    expect(adaptiveCountLabel(0)).toEqual({ variant: "invite", label: "Start the discussion" });
    expect(adaptiveCountLabel(4)).toEqual({ variant: "invite", label: "Join the discussion" });
  });
  it("shows the real count at/above the threshold", () => {
    expect(adaptiveCountLabel(5)).toEqual({ variant: "count", label: "5 comments" });
    expect(adaptiveCountLabel(1)).toEqual({ variant: "invite", label: "Join the discussion" });
    expect(adaptiveCountLabel(248)).toEqual({ variant: "count", label: "248 comments" });
  });
  it("singularizes at exactly the threshold boundary", () => {
    expect(adaptiveCountLabel(1, 1)).toEqual({ variant: "count", label: "1 comment" });
  });
  it("honors a custom threshold", () => {
    expect(adaptiveCountLabel(7, 10)).toEqual({ variant: "invite", label: "Join the discussion" });
    expect(adaptiveCountLabel(10, 10)).toEqual({ variant: "count", label: "10 comments" });
  });
});
```

**Step 1.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/services/discussion/discussion-counts.test.ts`

**Step 1.3 — Minimal implementation.**
Create `src/server/services/discussion/discussion-counts.ts`:

```ts
/**
 * Adaptive baseline label (spec §4): a LOW count is negative social proof, so
 * below a threshold we invite instead of showing the number. Pure + cacheable —
 * no viewer data. Shared by the entry strip, media cards, and search results.
 */
export type AdaptiveCountVariant = "invite" | "count";

export interface AdaptiveCountLabel {
  variant: AdaptiveCountVariant;
  label: string;
}

export const DEFAULT_COUNT_THRESHOLD = 5;

export function adaptiveCountLabel(
  count: number,
  threshold: number = DEFAULT_COUNT_THRESHOLD
): AdaptiveCountLabel {
  if (count < threshold) {
    return { variant: "invite", label: count === 0 ? "Start the discussion" : "Join the discussion" };
  }
  return { variant: "count", label: `${count} ${count === 1 ? "comment" : "comments"}` };
}
```

**Step 1.4 — Run (expect PASS).** Same command as 1.2.

**Step 1.5 — Commit.**
```
git add src/server/services/discussion/discussion-counts.ts src/server/services/discussion/discussion-counts.test.ts
git commit -m "feat(discussion): adaptive count label (invite below threshold)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 — Trending ranking (pure, NO AI)

**Step 2.1 — Write the failing test.**
Create `src/server/services/discussion/trending.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { trendingScore, compareTrending, type TrendingRow } from "./trending";

const row = (over: Partial<TrendingRow>): TrendingRow => ({
  id: 1,
  recentActivityCount: 0,
  likeCount: 0,
  createdAt: "2026-06-15T00:00:00.000Z",
  ...over,
});

describe("trendingScore", () => {
  it("weights recent activity above likes", () => {
    const activeNoLikes = trendingScore(row({ recentActivityCount: 3, likeCount: 0 }));
    const likesNoActivity = trendingScore(row({ recentActivityCount: 0, likeCount: 3 }));
    expect(activeNoLikes).toBeGreaterThan(likesNoActivity);
  });
  it("is zero with no signal", () => {
    expect(trendingScore(row({}))).toBe(0);
  });
});

describe("compareTrending", () => {
  it("orders by score desc, tie-breaks newest first", () => {
    const a = row({ id: 1, recentActivityCount: 5, createdAt: "2026-06-10T00:00:00.000Z" });
    const b = row({ id: 2, recentActivityCount: 5, createdAt: "2026-06-14T00:00:00.000Z" });
    const c = row({ id: 3, recentActivityCount: 1 });
    const sorted = [c, a, b].sort(compareTrending);
    expect(sorted.map((r) => r.id)).toEqual([2, 1, 3]);
  });
});
```

**Step 2.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/services/discussion/trending.test.ts`

**Step 2.3 — Minimal implementation.**
Create `src/server/services/discussion/trending.ts`:

```ts
/**
 * Trending ranking — CHEAP, NO AI/ML (spec §3, §4). Reads ONLY denormalized
 * counters that the write path maintains (recentActivityCount, likeCount), so
 * ranking is O(rows-in-page), never a per-render scan. Recent activity is
 * weighted above likes (velocity beats accumulated vanity); ties break newest.
 */
export interface TrendingRow {
  id: number;
  recentActivityCount: number;
  likeCount: number;
  createdAt: string;
}

const ACTIVITY_WEIGHT = 3;
const LIKE_WEIGHT = 1;

export function trendingScore(row: TrendingRow): number {
  return row.recentActivityCount * ACTIVITY_WEIGHT + row.likeCount * LIKE_WEIGHT;
}

export function compareTrending(a: TrendingRow, b: TrendingRow): number {
  const diff = trendingScore(b) - trendingScore(a);
  if (diff !== 0) return diff;
  const at = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (at !== 0) return at;
  return b.id - a.id;
}
```

**Step 2.4 — Run (expect PASS).** Same command as 2.2.

**Step 2.5 — Commit.**
```
git add src/server/services/discussion/trending.ts src/server/services/discussion/trending.test.ts
git commit -m "feat(discussion): cheap Trending ranking from denormalized counters (no AI)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 — Schema: denormalized counters + CommentRead

**Step 3.1 — Edit `prisma/schema.prisma`.**
In `model Comment`, after `likeCount`, add:

```prisma
  replyCount          Int           @default(0) @map("reply_count") // denorm: published replies (roots only meaningful)
  recentActivityCount Int           @default(0) @map("recent_activity_count") // rolling Trending signal; bumped on write, decayed by recompute
  lastActivityAt      DateTime?     @map("last_activity_at") // newest published descendant or self
```

In the `@@index` block of `Comment`, add the two Trending indexes (anon-tier reads order
by `lastActivityAt`):

```prisma
  @@index([movieId, circleId, status, lastActivityAt(sort: Desc)])
  @@index([seriesId, seasonNumber, episodeNumber, circleId, status, lastActivityAt(sort: Desc)])
```

Add a new model (place it directly after `model Reaction`):

```prisma
// Per-(user, anchor) read cursor powering "N new since you watched" (spec §4).
// anchorKey is the string form from comment-schemas.anchorKey() — natural-key
// safe (no FK to episodes/seasons). NOT in the audit opt-in set (a read cursor
// is not human-meaningful history).
model CommentRead {
  id         Int      @id @default(autoincrement())
  userId     Int      @map("user_id")
  anchorKey  String   @map("anchor_key") // "movie:603" | "series:1396:s2e5" | ...
  lastSeenAt DateTime @map("last_seen_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, anchorKey])
  @@index([userId])
  @@map("comment_reads")
}
```

Add the back-relation on `model User` (find the `User` model's relation block and add):

```prisma
  commentReads CommentRead[]
```

**Step 3.2 — Push + regenerate + restart.**
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn db:push
npx pm2 restart mb-dev
```

**Step 3.3 — Verify the client knows the new fields (typecheck is the test here).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck`
(Expected: PASS — no consumers yet; this confirms the schema parses and the client
generated.)

**Step 3.4 — Commit.**
```
git add prisma/schema.prisma
git commit -m "feat(discussion): denormalized Trending counters + CommentRead cursor table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 — Anon-tier anchor summary (cacheable baseline DB read)

**Step 4.1 — Write the failing test.**
Create `src/server/db/postgres/comments-summary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summaryToBaseline } from "./comments";

describe("summaryToBaseline", () => {
  it("maps a summary to the adaptive baseline DTO", () => {
    const r = summaryToBaseline({ publishedCount: 248, lastActivityAt: "2026-06-15T10:00:00.000Z" });
    expect(r.publishedCount).toBe(248);
    expect(r.variant).toBe("count");
    expect(r.label).toBe("248 comments");
  });
  it("invites when below threshold", () => {
    const r = summaryToBaseline({ publishedCount: 2, lastActivityAt: null });
    expect(r.variant).toBe("invite");
    expect(r.label).toBe("Join the discussion");
  });
});
```

**Step 4.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/db/postgres/comments-summary.test.ts`

**Step 4.3 — Minimal implementation.**
Append to `src/server/db/postgres/comments.ts` (after `getPublishedCommentCount`):

```ts
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
```

**Step 4.4 — Run (expect PASS).** Same command as 4.2.

**Step 4.5 — Typecheck + commit.**
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
git add src/server/db/postgres/comments.ts src/server/db/postgres/comments-summary.test.ts
git commit -m "feat(discussion): getAnchorPublicSummary cacheable baseline DTO

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 — Read-cursor DB layer

**Step 5.1 — Write the failing test.**
Create `src/server/db/postgres/comment-reads.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { newSinceFromRows } from "./comment-reads";

describe("newSinceFromRows", () => {
  const rows = [
    { createdAt: "2026-06-15T12:00:00.000Z" },
    { createdAt: "2026-06-14T12:00:00.000Z" },
    { createdAt: "2026-06-13T12:00:00.000Z" },
  ];
  it("counts rows strictly newer than the cursor", () => {
    expect(newSinceFromRows(rows, "2026-06-14T00:00:00.000Z")).toBe(2);
  });
  it("counts everything when there is no cursor (first visit)", () => {
    expect(newSinceFromRows(rows, null)).toBe(3);
  });
  it("counts nothing when the cursor is current", () => {
    expect(newSinceFromRows(rows, "2026-06-15T12:00:00.000Z")).toBe(0);
  });
});
```

**Step 5.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/db/postgres/comment-reads.test.ts`

**Step 5.3 — Minimal implementation.**
Create `src/server/db/postgres/comment-reads.ts`:

```ts
import { prisma } from "@/server/db/postgres";

/** Pure: count rows strictly newer than the last-seen cursor (null = first visit). */
export function newSinceFromRows(rows: Array<{ createdAt: string }>, lastSeenAt: string | null): number {
  if (lastSeenAt === null) return rows.length;
  const cutoff = Date.parse(lastSeenAt);
  return rows.filter((r) => Date.parse(r.createdAt) > cutoff).length;
}

export async function getLastSeen(userId: number, anchorKey: string): Promise<string | null> {
  const row = await prisma.commentRead.findUnique({
    where: { userId_anchorKey: { userId, anchorKey } },
    select: { lastSeenAt: true },
  });
  return row?.lastSeenAt ? row.lastSeenAt.toISOString() : null;
}

export async function upsertLastSeen(userId: number, anchorKey: string, seenAt: Date): Promise<void> {
  await prisma.commentRead.upsert({
    where: { userId_anchorKey: { userId, anchorKey } },
    create: { userId, anchorKey, lastSeenAt: seenAt },
    update: { lastSeenAt: seenAt },
  });
}
```

**Step 5.4 — Run (expect PASS).** Same command as 5.2.

**Step 5.5 — Typecheck + commit.**
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
git add src/server/db/postgres/comment-reads.ts src/server/db/postgres/comment-reads.test.ts
git commit -m "feat(discussion): per-anchor read-cursor DB layer (new-since helper)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 — Viewer activity server actions (POST, never cached)

**Step 6.1 — Write the failing test** (validates the Zod boundary; the action self-skips
without auth, so we test the input schema is wired).
Create `src/server/actions/discussion-reads.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GetAnchorActivitySchema } from "./discussion-reads-schema";

describe("GetAnchorActivitySchema", () => {
  it("accepts a movie anchor", () => {
    const r = GetAnchorActivitySchema.parse({ anchor: { type: "movie", movieId: 603 } });
    expect(r.anchor.type).toBe("movie");
  });
  it("rejects a malformed anchor", () => {
    expect(() => GetAnchorActivitySchema.parse({ anchor: { type: "movie" } })).toThrow();
  });
});
```

**Step 6.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/actions/discussion-reads.test.ts`

**Step 6.3 — Minimal implementation.**
First create `src/server/actions/discussion-reads-schema.ts` (schemas live outside the
`"use server"` file so they can be imported into a non-action test):

```ts
import { z } from "zod";
import { DiscussionAnchorSchema } from "@/server/services/discussion/comment-schemas";

export const GetAnchorActivitySchema = z.object({ anchor: DiscussionAnchorSchema });
export const MarkAnchorReadSchema = z.object({ anchor: DiscussionAnchorSchema });
```

Then create `src/server/actions/discussion-reads.ts`:

```ts
"use server";

import { dataLogger } from "@/lib/logger";
import { getUserIdForDb } from "@/lib/user-id";
import { anchorKey } from "@/server/services/discussion/comment-schemas";
import { getViewerGateContext } from "@/server/services/discussion/spoiler-gate";
import { getVisibleCommentPage } from "@/server/db/postgres/comments";
import { getLastSeen, upsertLastSeen, newSinceFromRows } from "@/server/db/postgres/comment-reads";
import { getAnchorPublicSummary } from "@/server/db/postgres/comments";
import {
  GetAnchorActivitySchema,
  MarkAnchorReadSchema,
} from "./discussion-reads-schema";
import type { z } from "zod";

export interface AnchorActivityResult {
  /** Cacheable-equivalent baseline (also computed here so the client can refresh it). */
  publishedCount: number;
  /** Viewer upgrade: visible comments created after the viewer's last-seen cursor. */
  newSinceLastSeen: number;
  signedIn: boolean;
}

/**
 * Viewer-only activity for the entry strip (spec §4 viewer upgrade). POST —
 * never edge-cached. Anonymous callers get the baseline with newSince=0.
 * "New" is computed against VISIBLE (gated) comments only.
 */
export async function getAnchorActivity(
  rawInput: z.infer<typeof GetAnchorActivitySchema>
): Promise<AnchorActivityResult> {
  try {
    const { anchor } = GetAnchorActivitySchema.parse(rawInput);
    const userId = await getUserIdForDb();
    const baseline = await getAnchorPublicSummary(anchor);
    if (!userId) {
      return { publishedCount: baseline.publishedCount, newSinceLastSeen: 0, signedIn: false };
    }
    const ctx = await getViewerGateContext(userId, anchor);
    const [page, lastSeen] = await Promise.all([
      getVisibleCommentPage(anchor, ctx, userId, null, 100),
      getLastSeen(userId, anchorKey(anchor)),
    ]);
    const newSince = newSinceFromRows(
      page.roots.map((r) => ({ createdAt: r.createdAt })),
      lastSeen
    );
    return { publishedCount: baseline.publishedCount, newSinceLastSeen: newSince, signedIn: true };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "getAnchorActivity", error: error instanceof Error ? error.message : String(error) },
      "getAnchorActivity failed"
    );
    return { publishedCount: 0, newSinceLastSeen: 0, signedIn: false };
  }
}

/** Stamp the viewer's last-seen cursor for an anchor (idempotent upsert). */
export async function markAnchorRead(
  rawInput: z.infer<typeof MarkAnchorReadSchema>
): Promise<{ ok: boolean }> {
  try {
    const { anchor } = MarkAnchorReadSchema.parse(rawInput);
    const userId = await getUserIdForDb();
    if (!userId) return { ok: false };
    await upsertLastSeen(userId, anchorKey(anchor), new Date());
    return { ok: true };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "markAnchorRead", error: error instanceof Error ? error.message : String(error) },
      "markAnchorRead failed"
    );
    return { ok: false };
  }
}
```

**Step 6.4 — Run (expect PASS).** Same command as 6.2.

**Step 6.5 — Typecheck + commit.**
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
git add src/server/actions/discussion-reads.ts src/server/actions/discussion-reads-schema.ts src/server/actions/discussion-reads.test.ts
git commit -m "feat(discussion): viewer activity + read-cursor server actions (POST only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 — Maintain denormalized counters on write

**Step 7.1 — Write the failing test.**
Create `src/server/services/discussion/activity-bump.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rootIdFor } from "./activity-bump";

describe("rootIdFor", () => {
  it("returns the parent's root when replying to a reply", () => {
    expect(rootIdFor({ id: 9, parentId: 4 })).toBe(4);
  });
  it("returns the parent's own id when replying to a root", () => {
    expect(rootIdFor({ id: 4, parentId: null })).toBe(4);
  });
});
```

**Step 7.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/services/discussion/activity-bump.test.ts`

**Step 7.3 — Minimal implementation.**
Create `src/server/services/discussion/activity-bump.ts`:

```ts
import type { Prisma } from "@/server/db/postgres";

/** The root id whose counters a reply should bump (depth cap is 2). */
export function rootIdFor(parent: { id: number; parentId: number | null }): number {
  return parent.parentId ?? parent.id;
}

/**
 * Bump a root comment's denormalized Trending/reply counters when a published
 * reply lands. Runs INSIDE the createComment auditedTransaction (atomic
 * increments only — spec: likeCount/counters are increment-on-write, no scan).
 */
export async function bumpRootActivity(
  tx: Prisma.TransactionClient,
  rootId: number,
  at: Date
): Promise<void> {
  await tx.comment.update({
    where: { id: rootId },
    data: {
      replyCount: { increment: 1 },
      recentActivityCount: { increment: 1 },
      lastActivityAt: at,
    },
  });
}

/** Initialize a brand-new root's own activity stamp on creation. */
export async function stampNewRootActivity(
  tx: Prisma.TransactionClient,
  rootId: number,
  at: Date
): Promise<void> {
  await tx.comment.update({
    where: { id: rootId },
    data: { recentActivityCount: { increment: 1 }, lastActivityAt: at },
  });
}
```

**Step 7.4 — Run (expect PASS).** Same command as 7.2.

**Step 7.5 — Wire into `createComment`.**
In `src/server/actions/comments.ts`, add the import:

```ts
import { bumpRootActivity, stampNewRootActivity, rootIdFor } from "@/server/services/discussion/activity-bump";
```

Replace the `auditedTransaction` block (the `const created = await auditedTransaction(...)`)
so the counter update happens in the SAME transaction, only when the comment publishes:

```ts
    const now = new Date();
    const created = await auditedTransaction(userId, async (tx) => {
      const row = await tx.comment.create({
        data: {
          userId,
          movieId: anchor.type === "movie" ? anchor.movieId : null,
          seriesId: anchor.type === "series" ? anchor.seriesId : null,
          seasonNumber: anchor.type === "series" ? anchor.seasonNumber : null,
          episodeNumber: anchor.type === "series" ? anchor.episodeNumber : null,
          parentId,
          body: input.body,
          spoilerScope: input.spoilerScope,
          scopeSeason: input.spoilerScope === "EPISODE" ? input.scopeSeason : null,
          scopeEpisode: input.spoilerScope === "EPISODE" ? input.scopeEpisode : null,
          status: held ? CommentStatus.PENDING_REVIEW : CommentStatus.PUBLISHED,
          aiLabels: aiLabels as object,
          lastActivityAt: held ? null : now,
        },
        include: { user: { select: { id: true, username: true, name: true, image: true } } },
      });
      // Trending counters are PUBLISHED-only (held comments are invisible).
      if (!held) {
        if (parentId !== null) {
          await bumpRootActivity(tx, parentId, now); // parentId is already the flattened root
        } else {
          await stampNewRootActivity(tx, row.id, now);
        }
      }
      return row;
    });
```

> Note: `parentId` was already flattened to the root above (`parent.parentId ?? parent.id`),
> so `bumpRootActivity(tx, parentId, ...)` targets the root directly. `rootIdFor` is
> exported for the unit test and any future caller.

**Step 7.6 — Restart + verify nothing regressed in the existing comment test suite.**
```
npx pm2 restart mb-dev
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/services/discussion
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
```

**Step 7.7 — Commit.**
```
git add src/server/services/discussion/activity-bump.ts src/server/services/discussion/activity-bump.test.ts src/server/actions/comments.ts
git commit -m "feat(discussion): maintain denormalized Trending counters on publish

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8 — Trending/Latest anchor-list DB layer (anon tier)

**Step 8.1 — Write the failing test.**
Create `src/server/db/postgres/comments-trending.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toTrendingRows } from "./comments-trending";

describe("toTrendingRows", () => {
  it("maps comment rows to ranking rows then sorts by Trending", () => {
    const rows = toTrendingRows([
      { id: 1, recentActivityCount: 1, likeCount: 0, createdAt: new Date("2026-06-10T00:00:00Z") },
      { id: 2, recentActivityCount: 9, likeCount: 0, createdAt: new Date("2026-06-11T00:00:00Z") },
    ]);
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });
});
```

**Step 8.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/db/postgres/comments-trending.test.ts`

**Step 8.3 — Minimal implementation.**
Create `src/server/db/postgres/comments-trending.ts`:

```ts
import { prisma, type Prisma } from "@/server/db/postgres";
import { CommentStatus } from "@prisma/client";
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
```

> `anchorWhere`, `PUBLIC_COMMENTS_WHERE`, and `toCommentDto` must be exported from
> `comments.ts` — `anchorWhere` and `PUBLIC_COMMENTS_WHERE` already are; confirm
> `toCommentDto` is exported (it is). If `CommentStatus` import is unused after writing,
> drop it.

**Step 8.4 — Run (expect PASS).** Same command as 8.2.

**Step 8.5 — Typecheck + commit.**
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
git add src/server/db/postgres/comments-trending.ts src/server/db/postgres/comments-trending.test.ts
git commit -m "feat(discussion): anon-tier Trending/Latest root queries (off counters)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9 — Entry-point strip (server baseline)

**Step 9.1 — Write the failing test** (the strip composes the pure label; test the
href-building helper).
Create `src/components/features/discussion/discussion-entry-strip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { discussionsHref } from "./discussion-entry-strip-href";

describe("discussionsHref", () => {
  it("movie → /movie/:id/:slug/discussions", () => {
    expect(discussionsHref({ type: "movie", movieId: 603 }, "The Matrix")).toBe(
      "/movie/603/the-matrix/discussions"
    );
  });
  it("series → /series/:id/:slug/discussions", () => {
    expect(
      discussionsHref({ type: "series", seriesId: 1396, seasonNumber: null, episodeNumber: null }, "Breaking Bad")
    ).toBe("/series/1396/breaking-bad/discussions");
  });
});
```

**Step 9.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/components/features/discussion/discussion-entry-strip.test.ts`

**Step 9.3 — Minimal implementation.**
Create `src/components/features/discussion/discussion-entry-strip-href.ts`:

```ts
import { getMediaPath } from "@/lib/utils";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";

/** Dedicated discussion-page URL for an anchor (title used only for the slug). */
export function discussionsHref(anchor: DiscussionAnchor, title: string | null): string {
  const base =
    anchor.type === "movie"
      ? getMediaPath("movie", anchor.movieId, title)
      : getMediaPath("series", anchor.seriesId, title);
  return `${base}/discussions`;
}
```

Create `src/components/features/discussion/discussion-entry-strip-client.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { MessagesSquare, ArrowRight } from "lucide-react";
import Link from "next/link";
import { getAnchorActivity } from "@/server/actions/discussion-reads";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";

interface Props {
  anchor: DiscussionAnchor;
  /** Cacheable baseline label rendered first (SSR); upgraded after hydration. */
  baselineLabel: string;
  anchorJumpHref: string; // "#discussion"
  dedicatedHref: string;
}

/**
 * Viewer upgrade (spec §4): after hydration, replace the cacheable baseline with
 * "N new since you watched" when the signed-in viewer has unread visible comments.
 * Fetched via a server-action POST — never edge-cached.
 */
export function DiscussionEntryStripClient({ anchor, baselineLabel, anchorJumpHref, dedicatedHref }: Props) {
  const [label, setLabel] = useState(baselineLabel);

  useEffect(() => {
    let active = true;
    void getAnchorActivity({ anchor }).then((res) => {
      if (!active || !res.signedIn) return;
      if (res.newSinceLastSeen > 0) {
        setLabel(`${res.newSinceLastSeen} new since you watched`);
      } else if (res.publishedCount > 0) {
        setLabel(`${res.publishedCount} ${res.publishedCount === 1 ? "comment" : "comments"}`);
      }
    });
    return () => {
      active = false;
    };
  }, [anchor]);

  return (
    <Link
      href={anchorJumpHref}
      className="group flex items-center gap-2 rounded-full border border-border bg-card/40 px-4 py-2 text-sm transition-colors hover:bg-card/70 min-h-10"
      data-discussion-strip
    >
      <MessagesSquare className="h-4 w-4 text-brand shrink-0" />
      <span className="font-medium text-foreground">{label}</span>
      <Link
        href={dedicatedHref}
        className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        View all <ArrowRight className="h-3 w-3" />
      </Link>
    </Link>
  );
}
```

Create `src/components/features/discussion/discussion-entry-strip.tsx`:

```tsx
import { getAnchorPublicSummary } from "@/server/db/postgres/comments";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { discussionsHref } from "./discussion-entry-strip-href";
import { DiscussionEntryStripClient } from "./discussion-entry-strip-client";

interface Props {
  anchor: DiscussionAnchor;
  title: string | null;
  className?: string;
}

/**
 * Cacheable entry-point strip (spec §2/§4). Server-renders the adaptive baseline
 * (no viewer data — safe in ISR HTML); the client island upgrades it to
 * "N new since you watched" after hydration.
 */
export async function DiscussionEntryStrip({ anchor, title, className }: Props) {
  const baseline = await getAnchorPublicSummary(anchor);
  return (
    <div className={className}>
      <DiscussionEntryStripClient
        anchor={anchor}
        baselineLabel={baseline.label}
        anchorJumpHref="#discussion"
        dedicatedHref={discussionsHref(anchor, title)}
      />
    </div>
  );
}
```

**Step 9.4 — Run (expect PASS).** Same command as 9.2.

**Step 9.5 — Export + typecheck + commit.**
Add to `src/components/features/discussion/index.ts`:
```ts
export { DiscussionEntryStrip } from "./discussion-entry-strip";
export { DiscussionCountBadge } from "./discussion-count-badge";
export { TrendingCommentList } from "./trending-comment-list";
```
(The latter two are created in Tasks 10 & 12; adding the exports now keeps one edit.)
Then:
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
```
(Expected FAIL until Tasks 10 & 12 create those files — so split: add ONLY the
`DiscussionEntryStrip` export now, defer the other two exports to their tasks.)

Corrected — add ONLY:
```ts
export { DiscussionEntryStrip } from "./discussion-entry-strip";
```
Then:
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
git add src/components/features/discussion/discussion-entry-strip.tsx src/components/features/discussion/discussion-entry-strip-client.tsx src/components/features/discussion/discussion-entry-strip-href.ts src/components/features/discussion/discussion-entry-strip.test.ts src/components/features/discussion/index.ts
git commit -m "feat(discussion): cacheable entry strip + client new-since upgrade

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10 — Discussion count badge for cards/search

**Step 10.1 — Write the failing test.**
Create `src/components/features/discussion/discussion-count-badge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DiscussionCountBadge } from "./discussion-count-badge";

describe("DiscussionCountBadge", () => {
  it("renders nothing below the invite threshold (cards stay clean)", () => {
    const { container } = render(<DiscussionCountBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });
  it("renders the count at/above threshold", () => {
    const { getByText } = render(<DiscussionCountBadge count={42} />);
    expect(getByText("42")).toBeTruthy();
  });
});
```

> If `@testing-library/react` is not already a dev dep, fall back to a pure-function test:
> export `shouldShowBadge(count)` and `badgeText(count)` from the badge file and test
> those instead (check `package.json` first; prefer the pure-function test to avoid a new
> dep).

**Step 10.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/components/features/discussion/discussion-count-badge.test.tsx`

**Step 10.3 — Minimal implementation.**
Create `src/components/features/discussion/discussion-count-badge.tsx`:

```tsx
import { MessageСircle } from "lucide-react";

/** Cards/search show the count ONLY at/above the invite threshold (spec §4: a low
 * count is negative social proof — don't surface "2 comments" on a card). */
export function shouldShowBadge(count: number, threshold = 5): boolean {
  return count >= threshold;
}

export function DiscussionCountBadge({ count, threshold = 5 }: { count: number; threshold?: number }) {
  if (!shouldShowBadge(count, threshold)) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <MessageСircle className="h-3 w-3" />
      {count}
    </span>
  );
}
```

> Fix the lucide import name to the real export `MessageCircle` (the line above has a
> Cyrillic homoglyph as a placeholder-guard — replace it with the ASCII
> `import { MessageCircle } from "lucide-react";` and use `<MessageCircle .../>`).

**Step 10.4 — Run (expect PASS).** Same command as 10.2.

**Step 10.5 — Export + typecheck + commit.**
Add to `index.ts`:
```ts
export { DiscussionCountBadge, shouldShowBadge } from "./discussion-count-badge";
```
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
git add src/components/features/discussion/discussion-count-badge.tsx src/components/features/discussion/discussion-count-badge.test.tsx src/components/features/discussion/index.ts
git commit -m "feat(discussion): count badge for media cards + search results

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11 — Movie dedicated discussion page (ISR)

**Step 11.1 — Write the failing test** (id parser).
Create `src/app/movie/[...params]/discussions/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDiscussionsParams } from "./parse";

describe("parseDiscussionsParams (movie)", () => {
  it("reads the id from params[0]", () => {
    expect(parseDiscussionsParams(["603"])).toBe(603);
    expect(parseDiscussionsParams(["603", "the-matrix"])).toBe(603);
  });
  it("rejects non-numeric", () => {
    expect(parseDiscussionsParams(["abc"])).toBeNull();
    expect(parseDiscussionsParams([])).toBeNull();
  });
});
```

**Step 11.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/app/movie/[...params]/discussions/parse.test.ts`

**Step 11.3 — Minimal implementation.**
Create `src/app/movie/[...params]/discussions/parse.ts`:

```ts
/** The catch-all under /movie carries [id] or [id, slug]; the id is params[0]. */
export function parseDiscussionsParams(routeParams: string[]): number | null {
  const id = parseInt(routeParams[0] ?? "", 10);
  return Number.isNaN(id) ? null : id;
}
```

Create `src/app/movie/[...params]/discussions/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { prisma } from "@/server/db/postgres";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { breadcrumbList, omitEmpty } from "@/lib/seo/jsonld";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import {
  getPublicCommentPage,
  getLockedCommentCount,
  getPublishedCommentCount,
} from "@/server/db/postgres/comments";
import { CommentListClient } from "@/components/features/discussion/comment-list-client";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { parseDiscussionsParams } from "./parse";

// ISR — user-agnostic; viewer state hydrates client-side (spec invariant 1).
export const revalidate = 3600;
export async function generateStaticParams(): Promise<{ params: string[] }[]> {
  return [];
}

interface PageProps {
  params: Promise<{ params: string[] }>;
}

async function getMovieLite(id: number) {
  return prisma.movie.findUnique({ where: { id }, select: { id: true, title: true, releaseDate: true } });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { params: routeParams } = await params;
  const id = parseDiscussionsParams(routeParams);
  if (id === null) return { title: "Discussion Not Found" };
  const movie = await getMovieLite(id);
  if (!movie) return { title: "Discussion Not Found" };
  const title = `${movie.title} Discussion | ${SITE_NAME}`;
  const canonical = `${SITE_URL}${getMediaPath("movie", movie.id, movie.title)}/discussions`;
  const description = truncateAtWord(
    `Join the spoiler-safe discussion of ${movie.title}. Threads never archive.`,
    160
  );
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function MovieDiscussionsPage({ params }: PageProps) {
  const { params: routeParams } = await params;
  const id = parseDiscussionsParams(routeParams);
  if (id === null) notFound();
  const movie = await getMovieLite(id);
  if (!movie) notFound();

  const anchor: DiscussionAnchor = { type: "movie", movieId: movie.id };
  const basePath = getMediaPath("movie", movie.id, movie.title);
  const canonicalUrl = `${SITE_URL}${basePath}/discussions`;

  const [initialPage, lockedCount, publishedCount] = await Promise.all([
    getPublicCommentPage(anchor),
    getLockedCommentCount(anchor),
    getPublishedCommentCount(anchor),
  ]);

  const jsonLd = omitEmpty({
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: `${movie.title} discussion`,
    url: canonicalUrl,
    datePublished: movie.releaseDate ? movie.releaseDate.toISOString() : undefined,
    commentCount: publishedCount,
    author: { "@type": "Organization", name: SITE_NAME },
    comment: initialPage.roots.slice(0, 10).map((c) => ({
      "@type": "Comment",
      text: c.body,
      dateCreated: c.createdAt,
      author: { "@type": "Person", name: c.author?.username ?? c.author?.name ?? "Member" },
    })),
    about: { "@type": "Movie", name: movie.title, url: `${SITE_URL}${basePath}` },
  });
  const breadcrumbs = breadcrumbList([
    { name: "Home", path: "/" },
    { name: movie.title, path: basePath },
    { name: "Discussion" },
  ]);

  return (
    <PageMain className="max-w-3xl mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <header className="space-y-2 mb-6">
        <a
          href={basePath}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
        >
          {movie.title}
        </a>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{movie.title} — Discussion</h1>
      </header>
      <div className="space-y-6" id="discussion">
        <SectionHeading icon={<MessagesSquare className="h-5 w-5 text-brand" />}>Discussion</SectionHeading>
        <CommentListClient
          anchor={anchor}
          initialPage={initialPage}
          lockedCount={lockedCount}
          starters={[]}
          defaultScope="NONE"
        />
      </div>
    </PageMain>
  );
}
```

**Step 11.4 — Run (expect PASS for the parse test).** Same command as 11.2.

**Step 11.5 — Smoke-test the route renders (manual).**
```
npx pm2 restart mb-dev
# Browser (proxy 429s curl/headless): http://localhost:3000/movie/<seeded-id>/discussions
npx pm2 logs mb-dev --nostream --lines 40   # confirm no Prisma/render error
```

**Step 11.6 — Typecheck + commit.**
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
git add "src/app/movie/[...params]/discussions/"
git commit -m "feat(discussion): /movie/[id]/discussions ISR page + ForumPosting JSON-LD

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12 — Trending comment list (client; tabs + scope filters + locked rows)

**Step 12.1 — Write the failing test.**
Create `src/components/features/discussion/trending-locked-rows.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lockedEpisodeRows } from "./trending-locked-rows";

describe("lockedEpisodeRows", () => {
  const episodes = [
    { seasonNumber: 1, episodeNumber: 1 },
    { seasonNumber: 1, episodeNumber: 2 },
    { seasonNumber: 2, episodeNumber: 1 },
  ];
  it("marks episodes ahead of the watermark as locked (never leaks titles)", () => {
    const rows = lockedEpisodeRows(episodes, { maxSeason: 1, maxEpisode: 1 });
    expect(rows).toEqual([
      { seasonNumber: 1, episodeNumber: 2, locked: true },
      { seasonNumber: 2, episodeNumber: 1, locked: true },
    ]);
  });
  it("anon (null watermark) locks everything", () => {
    const rows = lockedEpisodeRows(episodes, { maxSeason: null, maxEpisode: null });
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.locked)).toBe(true);
  });
});
```

**Step 12.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/components/features/discussion/trending-locked-rows.test.ts`

**Step 12.3 — Minimal implementation.**
Create `src/components/features/discussion/trending-locked-rows.ts`:

```ts
/** Episodes ahead of the viewer's lifetime watermark → honest 🔒 rows (spec §2:
 * never leak ahead-episodes by title in a mixed activity list). */
export interface EpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
}
export interface LockedRow extends EpisodeRef {
  locked: true;
}

export function lockedEpisodeRows(
  episodes: EpisodeRef[],
  watermark: { maxSeason: number | null; maxEpisode: number | null }
): LockedRow[] {
  const { maxSeason, maxEpisode } = watermark;
  return episodes
    .filter((e) => {
      if (maxSeason === null) return true; // anon: everything locked
      if (e.seasonNumber < maxSeason) return false;
      if (e.seasonNumber > maxSeason) return true;
      return e.episodeNumber > (maxEpisode ?? 0);
    })
    .map((e) => ({ ...e, locked: true as const }));
}
```

Create `src/components/features/discussion/trending-comment-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Flame, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommentDto } from "@/server/db/postgres/comments";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { CommentThread } from "./comment-item";

type SortTab = "trending" | "latest";

interface Props {
  anchor: DiscussionAnchor;
  /** Anon-tier roots, server-fetched per sort (spec invariant 1: cacheable). */
  trending: CommentDto[];
  latest: CommentDto[];
}

/**
 * Activity-first list for the series/movie dedicated page (spec §2/§3). Tabs swap
 * between two PRE-COMPUTED anon-tier lists (no viewer data in cacheable HTML).
 * Gated comments + scope filters that need the viewer hydrate via the existing
 * CommentListClient on the inline section — this list is the SEO/anon surface.
 */
export function TrendingCommentList({ anchor, trending, latest }: Props) {
  const [tab, setTab] = useState<SortTab>("trending");
  const list = tab === "trending" ? trending : latest;
  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-full border border-border p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("trending")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm min-h-10",
            tab === "trending" ? "bg-brand text-brand-foreground" : "text-muted-foreground"
          )}
        >
          <Flame className="h-4 w-4" /> Trending
        </button>
        <button
          type="button"
          onClick={() => setTab("latest")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm min-h-10",
            tab === "latest" ? "bg-brand text-brand-foreground" : "text-muted-foreground"
          )}
        >
          <Clock className="h-4 w-4" /> Latest
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No public discussion yet — be the first.</p>
      ) : (
        <div className="space-y-5">
          {list.map((c) => (
            <CommentThread
              key={c.id}
              thread={{ ...c, replies: [], replyCount: 0 }}
              anchor={anchor}
              viewerId={null}
              canInteract={false}
              onChanged={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

> `CommentThread` expects a `CommentThreadDto` (`replies` + `replyCount`); the anon list
> renders root previews, so we pad with empty replies. Confirm `CommentThread`'s prop
> type tolerates `viewerId={null}`/`canInteract={false}` (it does — see comment-item.tsx
> and the SSR usage in comment-list-client.tsx).

**Step 12.4 — Run (expect PASS).** Same command as 12.2.

**Step 12.5 — Export + typecheck + commit.**
Add to `index.ts`:
```ts
export { TrendingCommentList } from "./trending-comment-list";
```
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
git add src/components/features/discussion/trending-comment-list.tsx src/components/features/discussion/trending-locked-rows.ts src/components/features/discussion/trending-locked-rows.test.ts src/components/features/discussion/index.ts
git commit -m "feat(discussion): activity-first Trending/Latest list + locked-episode rows

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13 — Series dedicated discussion index (ISR, activity-first + scope filters)

**Step 13.1 — Write the failing test** (route disambiguation — `discussions` must NOT be
mistaken for the `discuss` per-episode parser).
Create `src/app/series/[...params]/discussions/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSeriesDiscussionsId } from "./parse";

describe("parseSeriesDiscussionsId", () => {
  it("reads the series id from params[0]", () => {
    expect(parseSeriesDiscussionsId(["1396"])).toBe(1396);
    expect(parseSeriesDiscussionsId(["1396", "breaking-bad"])).toBe(1396);
  });
  it("rejects non-numeric / empty", () => {
    expect(parseSeriesDiscussionsId(["x"])).toBeNull();
    expect(parseSeriesDiscussionsId([])).toBeNull();
  });
});
```

**Step 13.2 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/app/series/[...params]/discussions/parse.test.ts`

**Step 13.3 — Minimal implementation.**
Create `src/app/series/[...params]/discussions/parse.ts`:

```ts
/** /series/[id]/discussions or /series/[id]/[slug]/discussions — id is params[0]. */
export function parseSeriesDiscussionsId(routeParams: string[]): number | null {
  const id = parseInt(routeParams[0] ?? "", 10);
  return Number.isNaN(id) ? null : id;
}
```

Create `src/app/series/[...params]/discussions/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { prisma } from "@/server/db/postgres";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { breadcrumbList, omitEmpty } from "@/lib/seo/jsonld";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import {
  getPublishedCommentCount,
  getPublicCommentPage,
} from "@/server/db/postgres/comments";
import { getPublicTrendingRoots, getPublicLatestRoots } from "@/server/db/postgres/comments-trending";
import { TrendingCommentList } from "@/components/features/discussion/trending-comment-list";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { parseSeriesDiscussionsId } from "./parse";

// ISR — anon/activity-first surface; viewer-gated tier hydrates elsewhere.
export const revalidate = 3600;
export async function generateStaticParams(): Promise<{ params: string[] }[]> {
  return [];
}

interface PageProps {
  params: Promise<{ params: string[] }>;
}

async function getSeriesLite(id: number) {
  return prisma.series.findUnique({ where: { id }, select: { id: true, name: true, firstAirDate: true } });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { params: routeParams } = await params;
  const id = parseSeriesDiscussionsId(routeParams);
  if (id === null) return { title: "Discussion Not Found" };
  const series = await getSeriesLite(id);
  if (!series) return { title: "Discussion Not Found" };
  const title = `${series.name} Discussion | ${SITE_NAME}`;
  const canonical = `${SITE_URL}${getMediaPath("series", series.id, series.name)}/discussions`;
  const description = truncateAtWord(
    `Spoiler-safe discussion of ${series.name} — all seasons and episodes. Comments unlock with your watch progress. Threads never archive.`,
    160
  );
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function SeriesDiscussionsPage({ params }: PageProps) {
  const { params: routeParams } = await params;
  const id = parseSeriesDiscussionsId(routeParams);
  if (id === null) notFound();
  const series = await getSeriesLite(id);
  if (!series) notFound();

  // Series-ROOT anchor (All scope). Season/Episode scope filters navigate to the
  // per-episode discuss pages (already built) — kept link-based so this page stays
  // a cacheable anon surface (no viewer gate in the render tree).
  const anchor: DiscussionAnchor = {
    type: "series",
    seriesId: series.id,
    seasonNumber: null,
    episodeNumber: null,
  };
  const basePath = getMediaPath("series", series.id, series.name);
  const canonicalUrl = `${SITE_URL}${basePath}/discussions`;

  const [trending, latest, publishedCount, initialPage] = await Promise.all([
    getPublicTrendingRoots(anchor),
    getPublicLatestRoots(anchor),
    getPublishedCommentCount(anchor),
    getPublicCommentPage(anchor),
  ]);

  const jsonLd = omitEmpty({
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: `${series.name} discussion`,
    url: canonicalUrl,
    datePublished: series.firstAirDate ? series.firstAirDate.toISOString() : undefined,
    commentCount: publishedCount,
    author: { "@type": "Organization", name: SITE_NAME },
    comment: initialPage.roots.slice(0, 10).map((c) => ({
      "@type": "Comment",
      text: c.body,
      dateCreated: c.createdAt,
      author: { "@type": "Person", name: c.author?.username ?? c.author?.name ?? "Member" },
    })),
    about: { "@type": "TVSeries", name: series.name, url: `${SITE_URL}${basePath}` },
  });
  const breadcrumbs = breadcrumbList([
    { name: "Home", path: "/" },
    { name: series.name, path: basePath },
    { name: "Discussion" },
  ]);

  return (
    <PageMain className="max-w-3xl mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <header className="space-y-2 mb-6">
        <Link
          href={basePath}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
        >
          {series.name}
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{series.name} — Discussion</h1>
        <p className="text-sm text-muted-foreground">
          Whole-series threads below. For an episode, open its{" "}
          <Link href={`${basePath}/discuss/s1e1`} className="underline hover:text-foreground">
            per-episode discussion
          </Link>
          .
        </p>
      </header>
      <div className="space-y-6" id="discussion">
        <SectionHeading icon={<MessagesSquare className="h-5 w-5 text-brand" />}>
          Series discussion
        </SectionHeading>
        <TrendingCommentList anchor={anchor} trending={trending} latest={latest} />
      </div>
    </PageMain>
  );
}
```

> **Scope filters (All · Season ▾ · Episode ▾):** in Phase A these are link-based
> navigations to the existing per-episode discuss pages (keeps the page a cacheable anon
> surface with no viewer gate in the render tree). The `🔒`-row treatment from
> `lockedEpisodeRows` (Task 12) applies in a future viewer-gated episode-list island; this
> task wires the All-scope activity list + the link affordance to episode pages. Note this
> limitation in the commit body.

**Step 13.4 — Run (expect PASS for the parse test).** Same command as 13.2.

**Step 13.5 — Smoke-test + typecheck + commit.**
```
npx pm2 restart mb-dev
# Browser: http://localhost:3000/series/<seeded-id>/discussions
npx pm2 logs mb-dev --nostream --lines 40
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
git add "src/app/series/[...params]/discussions/"
git commit -m "feat(discussion): /series/[...]/discussions activity-first index (ISR)

Scope filters link to per-episode discuss pages in Phase A; viewer-gated 🔒
episode list deferred. Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14 — Wire the entry strip + "View all" into the detail pages

**Step 14.1 — Make the inline section a preview (failing-by-typecheck).**
Edit `src/components/features/discussion/comment-list-client.tsx`:

- Add to the props interface:
```ts
  previewLimit?: number;
  viewAllHref?: string;
```
- Destructure with defaults: `previewLimit, viewAllHref` (no default → `undefined`).
- After computing `allRoots`, cap when previewing:
```ts
  const visibleRoots = previewLimit ? allRoots.slice(0, previewLimit) : allRoots;
```
  and render `visibleRoots` instead of `allRoots` in the `.map`.
- Replace the "Show more comments" button block with:
```tsx
      {viewAllHref ? (
        <Button asChild variant="outline" size="sm" className="w-full">
          <a href={viewAllHref}>View all comments →</a>
        </Button>
      ) : (
        lastCursor && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Show more comments"}
          </Button>
        )
      )}
```

**Step 14.2 — Pass preview props from `DiscussionSection`.**
Edit `src/components/features/discussion/discussion-section.tsx`:
- Add props `viewAllHref?: string` and `previewLimit?: number` (default 3) to
  `DiscussionSectionProps`.
- Forward them to `<CommentListClient ... previewLimit={previewLimit ?? 3} viewAllHref={viewAllHref} />`.

**Step 14.3 — Mount the strip + pass href in the movie page.**
Edit `src/app/movie/[...params]/page.tsx`:
- Import: `import { DiscussionEntryStrip } from "@/components/features/discussion";`
- Near the top of the rendered detail content (above the fold, after the hero/overview —
  place it where other above-content chips live; if unsure, directly before the existing
  `<DiscussionSection ...>` is acceptable for Phase A but the spec wants it near the TOP —
  put it just under the overview block), render:
```tsx
      <DiscussionEntryStrip
        anchor={{ type: "movie", movieId: movie.id }}
        title={movie.title}
        className="px-4 md:px-8 lg:px-12"
      />
```
- On the existing `<DiscussionSection anchor={{ type: "movie", movieId: movie.id }} ...>`
  add `viewAllHref={`${getMediaPath("movie", movie.id, movie.title)}/discussions`}`.
  (`getMediaPath` is already imported in this file; confirm.)

**Step 14.4 — Same for the series page.**
Edit `src/app/series/[...params]/page.tsx`:
- Import `DiscussionEntryStrip`.
- Render the strip with `anchor={{ type: "series", seriesId: series.id, seasonNumber: null, episodeNumber: null }}` and `title={series.name}`.
- On the existing series `<DiscussionSection>` add
  `viewAllHref={`${getMediaPath("series", series.id, series.name)}/discussions`}`.

**Step 14.5 — Add the strip to the per-episode discuss page.**
Edit `src/app/series/[...params]/discuss-page.tsx`:
- Import `DiscussionEntryStrip`.
- In `EpisodeDiscussPage`, after the `<EpisodePicker .../>`, add a link up to the series
  index and the strip:
```tsx
        <Link
          href={`${basePath}/discussions`}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          ← All {series.name} discussions
        </Link>
        <DiscussionEntryStrip anchor={anchor} title={series.name} />
```

**Step 14.6 — Typecheck (this is the test for the wiring).**
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
```

**Step 14.7 — Smoke test.**
```
npx pm2 restart mb-dev
# Browser: open a seeded movie + series detail page; confirm the strip renders near the
# top, "View all →" links to /discussions, and the inline section shows ≤3 threads.
npx pm2 logs mb-dev --nostream --lines 40
```

**Step 14.8 — Commit.**
```
git add src/components/features/discussion/comment-list-client.tsx src/components/features/discussion/discussion-section.tsx "src/app/movie/[...params]/page.tsx" "src/app/series/[...params]/page.tsx" "src/app/series/[...params]/discuss-page.tsx"
git commit -m "feat(discussion): entry strip + preview inline section + View-all wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15 — Counts on media cards + search results

**Step 15.1 — Locate the surfaces (read-only investigation).**
```
grep -rln "media-card\|MediaCard" src/components/features/movie/media-card.tsx
grep -rln "search.*result\|SearchResult\|cmdk-item" src/components/features/search
```
Identify (a) the large media card component (`src/components/features/movie/media-card.tsx`)
and (b) the search-results list/item. Determine where each gets its data so a
`commentCount?: number` prop can be threaded WITHOUT adding a per-card DB read on the
render path (counts must come from the page's existing data fetch or a single batched
query — never N+1).

**Step 15.2 — Add a batched count helper (failing test).**
Create `src/server/db/postgres/comment-counts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { countsToMap } from "./comment-counts";

describe("countsToMap", () => {
  it("maps grouped counts to a movieId→count map", () => {
    const m = countsToMap([
      { movieId: 603, _count: { _all: 12 } },
      { movieId: 78, _count: { _all: 3 } },
    ]);
    expect(m.get(603)).toBe(12);
    expect(m.get(78)).toBe(3);
  });
});
```

**Step 15.3 — Run (expect FAIL).**
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/db/postgres/comment-counts.test.ts`

**Step 15.4 — Minimal implementation.**
Create `src/server/db/postgres/comment-counts.ts`:

```ts
import { prisma } from "@/server/db/postgres";
import { CommentStatus } from "@prisma/client";

/** Pure: groupBy result → id→count map. */
export function countsToMap<K extends "movieId" | "seriesId">(
  rows: Array<Record<K, number | null> & { _count: { _all: number } }>
): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows) {
    const id = r[("movieId" in r ? "movieId" : "seriesId") as K];
    if (typeof id === "number") m.set(id, r._count._all);
  }
  return m;
}

/**
 * Batched anon-tier published-comment counts for a set of movies (one groupBy,
 * no N+1). Cacheable baseline — safe in ISR card grids (spec §4).
 */
export async function getMoviePublicCounts(movieIds: number[]): Promise<Map<number, number>> {
  if (movieIds.length === 0) return new Map();
  const rows = await prisma.comment.groupBy({
    by: ["movieId"],
    where: { movieId: { in: movieIds }, circleId: null, status: CommentStatus.PUBLISHED },
    _count: { _all: true },
  });
  return countsToMap(rows.map((r) => ({ movieId: r.movieId, _count: r._count })));
}

export async function getSeriesPublicCounts(seriesIds: number[]): Promise<Map<number, number>> {
  if (seriesIds.length === 0) return new Map();
  const rows = await prisma.comment.groupBy({
    by: ["seriesId"],
    where: { seriesId: { in: seriesIds }, circleId: null, status: CommentStatus.PUBLISHED },
    _count: { _all: true },
  });
  return countsToMap(rows.map((r) => ({ seriesId: r.seriesId, _count: r._count })));
}
```

**Step 15.5 — Run (expect PASS).** Same command as 15.3.

**Step 15.6 — Thread the badge into the card.**
Edit `src/components/features/movie/media-card.tsx`:
- Add an optional `commentCount?: number` prop.
- Render `<DiscussionCountBadge count={commentCount} />` in the card's metadata row
  (import from `@/components/features/discussion`). `DiscussionCountBadge` returns null
  below threshold, so cards lacking a count or with a low one stay clean.

> Wiring the count from grid pages is OPTIONAL for Phase A acceptance (the badge degrades
> to nothing when `commentCount` is undefined). If a grid page already batch-fetches its
> items, pass `getMoviePublicCounts`/`getSeriesPublicCounts` output through; otherwise
> leave the prop unset (no N+1 introduced). Document which surfaces are wired in the
> commit body.

**Step 15.7 — Typecheck + commit.**
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
git add src/server/db/postgres/comment-counts.ts src/server/db/postgres/comment-counts.test.ts src/components/features/movie/media-card.tsx
git commit -m "feat(discussion): batched public comment counts + card badge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 16 — Full verification sweep

**Step 16.1 — Run the whole discussion test surface + typecheck + lint.**
```
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/services/discussion src/server/db/postgres src/components/features/discussion src/server/actions/discussion-reads.test.ts
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn typecheck
yarn lint
```

**Step 16.2 — Invariant audit (manual checklist — confirm each, do NOT skip).**
- New pages (`movie/.../discussions`, `series/.../discussions`) export `revalidate` +
  `generateStaticParams` and contain NO `auth()`/`headers()` (grep them):
  `grep -rn "auth()\|headers()\|cookies()" "src/app/movie/[...params]/discussions" "src/app/series/[...params]/discussions"` → expect ZERO hits.
- Anon reads only: `getPublicTrendingRoots`/`getPublicLatestRoots`/`getAnchorPublicSummary`
  all include `{ spoilerScope: "NONE" }`/`PUBLIC_COMMENTS_WHERE` — re-read each.
- Viewer upgrade is POST-only: `getAnchorActivity`/`markAnchorRead` are in a
  `"use server"` file and the strip calls them in `useEffect` (client) — confirm.
- Audited mutation: counter bump runs inside the existing `auditedTransaction` in
  `createComment` (Task 7) — confirm no separate un-audited comment write was added.
- AI: grep the new files for any Bedrock/LLM import — `grep -rn "bedrock\|runCommentGate\|generateText\|invokeModel" src/server/actions/discussion-reads.ts src/server/db/postgres/comments-trending.ts` → expect ZERO.

**Step 16.3 — Final smoke (browser).**
```
npx pm2 restart mb-dev
# Visit, in a real browser (proxy 429s headless):
#   /movie/<id>/discussions, /series/<id>/discussions, a detail page (strip + preview),
#   a per-episode /series/<id>/discuss/s1e1 (strip + "All discussions" link).
npx pm2 logs mb-dev --nostream --lines 60   # expect no Prisma "Unknown argument"/render errors
```

**Step 16.4 — Commit any lint fixups.**
```
git add -A
git commit -m "chore(discussion): Phase A verification fixups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Spec coverage map

| Spec §12.1 / §2 / §4 item | Task(s) |
|---|---|
| Entry-point strip (adaptive, cacheable, anchor jump + dedicated link) | 1, 4, 9, 14 |
| "New since you watched" read cursor + client upgrade | 3, 5, 6, 9 |
| `/movie/[id]/discussions` (ISR, ForumPosting JSON-LD) | 11 |
| `/series/[...]/discussions` (activity-first, scope filters, JSON-LD) | 8, 12, 13 |
| Locked-episode `🔒` rows (never leak titles) | 12 |
| Trending = velocity + likes from denorm counters; Latest = createdAt keyset | 2, 3, 7, 8 |
| Counts on cards + search (adaptive baseline) | 10, 15 |
| Inline section as PREVIEW (top N + composer + View all →) | 14 |
| Honor all hard invariants (ISR, spoiler-gate, natural-key, requirePgUserId, audit, no-AI) | 16 + threaded throughout |

## Out-of-scope confirmations (Phase A only)

- NO `@`-mention entity work, NO Like reaction UI, NO catalog-image picker, NO markdown/
  spoiler-tag composer changes, NO `obscenity` prefilter — those are **Phase B**.
- NO link unfurl / lite-YouTube — **Phase C**.
- NO global `/discussions` hub, NO Cue seeds, NO "new episode dropped" notifications —
  **Phase D**.
- The series scope filters (`Season ▾ · Episode ▾`) ship as **links to the existing
  per-episode discuss pages** in Phase A; a viewer-gated in-page episode list with live
  `🔒` rows is a deliberate small deferral (the pure `lockedEpisodeRows` helper is built
  and tested now so the gated island slots in without rework).
