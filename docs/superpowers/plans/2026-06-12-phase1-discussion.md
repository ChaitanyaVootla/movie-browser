# Phase 1 (Discussion Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship spoiler-gated threaded comments on movie/series/episode pages, per-episode SEO discussion pages, the AI moderation gate, spoiler-safe AI thread summaries, notifications (in-app + web push), block/mute + report/mod-queue moderation, and a content policy page — Phase 1 of `docs/superpowers/specs/2026-06-12-social-virality-roadmap-design.md`.

**Architecture:** All comment writes go through Zod-validated server actions that run a Bedrock (Kimi K2.5) AI gate (toxicity + spoiler-scope suggestion; LLM failure → `PENDING_REVIEW`). Reads split into two tiers per spec invariant 8: an anon-cacheable tier (`spoilerScope=NONE, status=PUBLISHED, circleId IS NULL` only) rendered in ISR/edge-cacheable HTML, and a progress-gated tier fetched client-side via server actions (POSTs are never edge-cached). The spoiler gate is a site-wide capability (`src/server/services/discussion/spoiler-gate.ts`): one PK read per viewer per anchor, a pure predicate, and a Prisma where-builder so the gate runs inside SQL for pagination. Per-episode discussion pages live inside the existing `series/[...params]` catch-all (Next.js forbids a sibling `[seriesId]` segment) with 404/308 authority extended in `src/proxy.ts`'s media-resolver.

**Tech Stack:** Next.js 15 App Router (RSC + server actions + ISR), Prisma 6/PostgreSQL 17, Zod, Bedrock `ConverseCommand` via the existing `callBedrockFlex` helper, `web-push` + Serwist service worker for push, shadcn/ui + Tailwind v4, Vitest.

---

## Phase 0 prerequisites (consumed by name — do NOT redefine)

This plan consumes these Phase 0 deliverables exactly as named in the spec (§4.2). **Before Task 1, verify each exists; if any is missing, Phase 0 is not done — stop.**

| Deliverable | Where | Names consumed |
|---|---|---|
| Enums | `prisma/schema.prisma` | `SpoilerScope { NONE, WATCHED, EPISODE, ENDING }`, `CommentStatus { PENDING_REVIEW, PUBLISHED, FLAGGED, REMOVED, DELETED_BY_USER }` |
| Comments | `model Comment` → `comments` | fields per spec: `userId?`, `movieId?`, `seriesId?`, `seasonNumber?`, `episodeNumber?`, `listId?`, `circleId?`, `parentId?`, `body`, `spoilerScope`, `scopeSeason?`, `scopeEpisode?`, `scopeTmdbEpisodeId?`, `status`, `aiLabels Json?`, `likeCount`, `editedAt?`, `createdAt`; indexes incl. `[movieId, circleId, status, createdAt desc]`, `[seriesId, seasonNumber, episodeNumber, circleId, status, createdAt desc]`, `[parentId]`, `[userId, createdAt desc]` |
| Notifications | `model Notification` → `notifications` | `userId` (recipient, Cascade), `type` (`REPLY`/`MENTION`/…), `actorId?`, `payload Json`, `readAt?`, `createdAt`; index `[userId, readAt, createdAt desc]` |
| Reports | `model Report` → `reports` | `reporterId`, `commentId?`, `reviewId?`, `reason` enum, `note?`, `status`, `createdAt`; index `[status, createdAt]` |
| Blocks | `model Block` → `blocks` | `blockerId`, `blockedId`, `type` (`BLOCK`/`MUTE`), unique `[blockerId, blockedId]` |
| Progress | `model SeriesProgress` → `series_progress` | `status WatchStatus`, watermark `maxSeasonNumber`/`maxEpisodeNumber`, PK `[userId, seriesId]` |
| Diary | `model WatchEvent` → `watch_events` | movie watched-state via `[userId, movieId]` index |
| Users | `users.username` + `/u/[username]` profile page | username permalinks, profile header (block/mute UI mounts there) |
| AI gate skeleton | `src/server/services/moderation/` | Phase 0 creates `gate.ts` (`gateText()` via callBedrockFlex) + `gate-policy.ts` (pure parse + PENDING_REVIEW fallback); Task 5 adds `comment-gate.ts` beside them — reuse `gateText`/`gate-policy` helpers where they fit instead of duplicating |
| Raw SQL | `postgres/init/04-ugc-constraints.sql` | comment anchor CHECKs already enforced — actions still validate in app code |

```bash
# Verification (run before starting):
grep -n "model Comment\|model Notification\|model Report\|model Block\|model SeriesProgress\|model WatchEvent\|enum SpoilerScope\|enum CommentStatus" prisma/schema.prisma
ls src/server/services/moderation/ src/app/u 2>/dev/null
```

**Name assumptions to verify** (spec leaves these to Phase 0's discretion — `grep prisma/schema.prisma` and substitute the actual names everywhere in this plan if they differ):
- `NotificationType` enum with `REPLY`, `MENTION` members (or `type String` — then use string literals).
- `ReportReason { SPOILER, HARASSMENT, SPAM, HATE_SPEECH, OTHER }`, `ReportStatus { OPEN, RESOLVED, DISMISSED }` — confirmed against the phase-0 plan (`docs/superpowers/plans/2026-06-12-phase0-backend.md`).
- `BlockType` enum `{ BLOCK, MUTE }`.
- Relation field names on `Comment`: `user`, `parent`, `replies`.

---

## File Structure

```
prisma/schema.prisma                                    # MODIFY: + PushSubscription, ThreadSummary (phase-1-only additions)
src/server/services/discussion/
  comment-schemas.ts                                    # CREATE: Zod schemas + DiscussionAnchor + anchor helpers (pure, testable)
  spoiler-gate.ts                                       # CREATE: site-wide gate — viewer context, pure predicate, Prisma where-builder
  spoiler-gate.test.ts                                  # CREATE: predicate unit tests
  mentions.ts                                           # CREATE: @mention parser (pure) + resolver (PG, block-aware)
  mentions.test.ts                                      # CREATE: parser unit tests
  rate-limit.ts                                         # CREATE: PG sliding-window rate limit (comments table = the log)
  thread-summary.ts                                     # CREATE: AI thread summary, scope-filtered input, PG-cached
  thread-summary.test.ts                                # CREATE: input filter unit tests
src/server/services/moderation/comment-gate.ts          # CREATE: toxicity + spoiler-scope LLM gate (bedrock-flex pattern)
src/server/services/moderation/comment-gate.test.ts     # CREATE: gate response parser tests
src/server/services/notifications/notify.ts             # CREATE: write-on-event notification creation (+ push fan-out to ONE recipient)
src/server/services/notifications/push.ts               # CREATE: web-push wrapper, VAPID, dead-subscription pruning
src/server/db/postgres/comments.ts                      # CREATE: publicComments + gated reads, keyset pagination, reply batches, DTOs
src/server/db/postgres/blocks.ts                        # CREATE: getExcludedAuthorIds — THE block-enforcement helper for all social reads
src/server/actions/comments.ts                          # CREATE: create/edit/soft-delete/report server actions
src/server/actions/comment-reads.ts                     # CREATE: loadComments server action (client-fetched gated tier)
src/server/actions/notifications.ts                     # CREATE: list/unread-count/mark-read actions
src/server/actions/blocks.ts                            # CREATE: block/mute/unblock actions
src/server/actions/thread-summary.ts                    # CREATE: summarizeThread action
src/app/api/push/route.ts                               # CREATE: push subscribe/unsubscribe (POST/DELETE)
src/app/api/admin/moderation/route.ts                   # CREATE: mod queue GET + moderate POST
src/app/sw.ts                                           # MODIFY: push + notificationclick handlers
src/hooks/use-push-subscription.ts                      # CREATE: PushManager subscribe/unsubscribe hook
src/components/features/discussion/
  index.ts                                              # CREATE: barrel
  discussion-section.tsx                                # CREATE: RSC section for detail pages (anon tier SSR + client island)
  comment-list-client.tsx                               # CREATE: client island — gated fetch, pagination, composer state
  comment-item.tsx                                      # CREATE: one comment + replies (mobile-first)
  comment-composer.tsx                                  # CREATE: textarea + scope picker + AI-suggestion confirm flow
  scope-badge.tsx                                       # CREATE: spoiler-scope chip
  mention-text.tsx                                      # CREATE: body renderer, @user → /u/user links
  locked-teaser.tsx                                     # CREATE: "N comments unlock…" conversion hook
  discussion-starters.tsx                               # CREATE: AI prompt seeds (from existing ai_insights — no new LLM calls)
  web-reactions.tsx                                     # CREATE: YouTube topComments as "Reactions from the web"
  report-dialog.tsx                                     # CREATE: report flow UI
  thread-summary-card.tsx                               # CREATE: on-demand AI summary UI
  episode-picker.tsx                                    # CREATE: prev/next + season/episode nav (server-renderable links)
  user-moderation-menu.tsx                              # CREATE: block/mute menu for profile pages
src/components/features/notifications/
  notification-bell.tsx                                 # CREATE: bell + unread badge (nav-bar)
  notification-list.tsx                                 # CREATE: list + mark-read + push toggle
src/app/notifications/page.tsx                          # CREATE: notifications center
src/app/series/[...params]/page.tsx                     # MODIFY: branch to discuss page; discussion section on series page
src/app/series/[...params]/discuss-page.tsx             # CREATE: per-episode discussion page (RSC, ISR, JSON-LD)
src/app/movie/[...params]/page.tsx                      # MODIFY: discussion section
src/server/proxy/media-resolver.ts                      # MODIFY: parse + canonicalize /series/:id/:slug/discuss/sXeY
src/server/proxy/media-resolver.test.ts                 # MODIFY: discuss-path cases
src/components/features/admin/tabs/moderation-tab.tsx   # CREATE: admin mod queue
src/components/features/admin/tabs/index.ts             # MODIFY: export ModerationTab
src/app/admin/client.tsx                                # MODIFY: add "moderation" tab
src/app/content-policy/page.tsx                         # CREATE: content policy
src/components/features/layout/footer.tsx               # MODIFY: content-policy link
src/components/features/layout/nav-bar.tsx              # MODIFY: bell
src/components/features/layout/mobile-bottom-nav.tsx    # MODIFY: notifications entry (logged-in)
template.env                                            # MODIFY: VAPID vars
```

**Perf discipline baked into the design (2-vCPU box):**
- Reads: one ordered index range scan per page (`[anchor…, circleId, status, createdAt desc]` indexes from Phase 0), spoiler predicate as residual, `LIMIT`-bounded; replies fetched for the whole page with ONE `parentId IN (…)` query (no N+1); reply counts via ONE `groupBy`. Keyset `(createdAt, id)` cursors, never OFFSET.
- Locked-count teaser is progress-independent (count of published non-NONE comments) → legal in edge-cached HTML AND computed at most once per ISR window.
- No `revalidatePath` on comment writes (would churn ISR + CloudFront constantly). Logged-in users see writes instantly via the client tier; the anon tier catches up within the 1h revalidate window. Document this as accepted staleness.
- Depth cap = 2 (roots + flat replies): replying to a reply re-parents to the root (`parentId = parent.parentId ?? parent.id`) with an @mention — reply trees never recurse.
- Rate limiting counts rows in `comments` itself (see Task 4 justification) — no new table, no Redis.

---

### Task 1: Phase-1 schema additions (PushSubscription, ThreadSummary)

Only NEW phase-1 tables. The `comments`/`notifications`/`reports`/`blocks` schema is Phase 0's — untouched.

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add models** (place after the Phase 0 social models, before the enums section):

```prisma
// Web-push subscriptions (phase 1). One row per browser endpoint.
model PushSubscription {
  id         Int       @id @default(autoincrement())
  userId     Int       @map("user_id")
  endpoint   String    @unique
  p256dh     String
  auth       String
  userAgent  String?   @map("user_agent")
  createdAt  DateTime  @default(now()) @map("created_at")
  lastUsedAt DateTime? @map("last_used_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("push_subscriptions")
}

// Cached AI thread summaries (phase 1). Keyed by anchor + the viewer's
// spoiler-scope bucket so a summary is only ever served to viewers whose
// visible-comment set is a superset of its input.
model ThreadSummary {
  id              Int      @id @default(autoincrement())
  anchorKey       String   @map("anchor_key") // "movie:603" | "series:1396" | "series:1396:s2e5"
  scopeKey        String   @map("scope_key")  // "none" | "watched" | "completed" | "s2e5"
  summary         String   @db.Text
  commentCount    Int      @map("comment_count")
  newestCommentId Int      @map("newest_comment_id")
  modelId         String?  @map("model_id")
  generatedAt     DateTime @default(now()) @map("generated_at")

  @@unique([anchorKey, scopeKey])
  @@map("thread_summaries")
}
```

- [ ] **Step 2: Add the back-relation on `model User`:** `pushSubscriptions PushSubscription[]` (next to the other relation lists).

- [ ] **Step 3: Push schema + regenerate client**

Run: `yarn db:push`
Expected: "Your database is now in sync". Both FKs here are indexed (invariant 3: `endpoint` unique + `[userId]`).

- [ ] **Step 4: Typecheck**

Run: `yarn typecheck` → PASS

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(discussion): add push_subscriptions + thread_summaries tables"
```

---

### Task 2: Spoiler gate — site-wide capability

The spec's product wedge: "the entire site is spoiler-safe by construction, per-reader". One PK read per (viewer, anchor); a pure predicate for in-memory filtering (summaries, previews, embedded comments anywhere); a Prisma where-builder so pagination gates in SQL.

**Files:**
- Create: `src/server/services/discussion/comment-schemas.ts`
- Create: `src/server/services/discussion/spoiler-gate.ts`
- Test: `src/server/services/discussion/spoiler-gate.test.ts`

- [ ] **Step 1: Write `comment-schemas.ts`** (pure module — schemas + anchor types shared by gate, queries, actions, tests):

```typescript
import { z } from "zod";

/** Typed anchor for a discussion surface (spec invariant 7: no generic itemId/itemType). */
export type DiscussionAnchor =
  | { type: "movie"; movieId: number }
  | {
      type: "series";
      seriesId: number;
      seasonNumber: number | null;
      episodeNumber: number | null;
    };

export const DiscussionAnchorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("movie"), movieId: z.number().int().positive() }),
  z
    .object({
      type: z.literal("series"),
      seriesId: z.number().int().positive(),
      seasonNumber: z.number().int().min(0).nullable(),
      episodeNumber: z.number().int().min(1).nullable(),
    })
    .refine((a) => a.episodeNumber === null || a.seasonNumber !== null, {
      message: "episodeNumber requires seasonNumber",
    }),
]);

export const SpoilerScopeSchema = z.enum(["NONE", "WATCHED", "EPISODE", "ENDING"]);
export type SpoilerScopeValue = z.infer<typeof SpoilerScopeSchema>;

export const CreateCommentSchema = z
  .object({
    anchor: DiscussionAnchorSchema,
    parentId: z.number().int().positive().nullable().default(null),
    body: z.string().trim().min(2).max(4000),
    spoilerScope: SpoilerScopeSchema.default("NONE"),
    scopeSeason: z.number().int().min(0).nullable().default(null),
    scopeEpisode: z.number().int().min(1).nullable().default(null),
    /** true on resubmit after the user accepted/overrode the AI scope suggestion */
    confirmedScope: z.boolean().default(false),
  })
  .refine((i) => i.spoilerScope !== "EPISODE" || i.scopeSeason !== null, {
    message: "EPISODE scope requires scopeSeason",
  });
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const EditCommentSchema = z.object({
  commentId: z.number().int().positive(),
  body: z.string().trim().min(2).max(4000),
  spoilerScope: SpoilerScopeSchema,
  scopeSeason: z.number().int().min(0).nullable().default(null),
  scopeEpisode: z.number().int().min(1).nullable().default(null),
});

export const DeleteCommentSchema = z.object({ commentId: z.number().int().positive() });

export const ReportCommentSchema = z.object({
  commentId: z.number().int().positive(),
  // Substitute Phase 0's actual ReportReason members if they differ:
  reason: z.enum(["SPOILER", "HARASSMENT", "SPAM", "HATE_SPEECH", "OTHER"]),
  note: z.string().trim().max(500).optional(),
});

export const CommentCursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.number().int().positive(),
});
export type CommentCursor = z.infer<typeof CommentCursorSchema>;

/** "movie:603" | "series:1396" | "series:1396:s2" | "series:1396:s2e5" */
export function anchorKey(anchor: DiscussionAnchor): string {
  if (anchor.type === "movie") return `movie:${anchor.movieId}`;
  let key = `series:${anchor.seriesId}`;
  if (anchor.seasonNumber !== null) key += `:s${anchor.seasonNumber}`;
  if (anchor.episodeNumber !== null) key += `e${anchor.episodeNumber}`;
  return key;
}
```

- [ ] **Step 2: Write the failing tests** (`spoiler-gate.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import {
  ANON_GATE_CONTEXT,
  isScopeVisible,
  scopeRank,
  isStricterScope,
  scopeKeyFor,
  type ViewerGateContext,
} from "./spoiler-gate";

const anon = ANON_GATE_CONTEXT;
const movieWatched: ViewerGateContext = { ...anon, loggedIn: true, movieWatched: true };
const midS2E5: ViewerGateContext = {
  loggedIn: true, movieWatched: false, seriesCompleted: false,
  maxSeason: 2, maxEpisode: 5,
};
const completed: ViewerGateContext = { ...midS2E5, seriesCompleted: true };

describe("isScopeVisible", () => {
  it("NONE is visible to everyone, including anon", () => {
    expect(isScopeVisible("NONE", null, null, anon, "movie")).toBe(true);
    expect(isScopeVisible("NONE", null, null, anon, "series")).toBe(true);
  });
  it("anon sees nothing gated", () => {
    expect(isScopeVisible("WATCHED", null, null, anon, "movie")).toBe(false);
    expect(isScopeVisible("EPISODE", 1, 1, anon, "series")).toBe(false);
    expect(isScopeVisible("ENDING", null, null, anon, "series")).toBe(false);
  });
  it("movie: WATCHED/ENDING visible iff a watch event exists", () => {
    expect(isScopeVisible("WATCHED", null, null, movieWatched, "movie")).toBe(true);
    expect(isScopeVisible("ENDING", null, null, movieWatched, "movie")).toBe(true);
    expect(isScopeVisible("WATCHED", null, null, { ...anon, loggedIn: true }, "movie")).toBe(false);
  });
  it("series: EPISODE gated by lifetime watermark tuple", () => {
    expect(isScopeVisible("EPISODE", 2, 5, midS2E5, "series")).toBe(true);  // equal
    expect(isScopeVisible("EPISODE", 1, 9, midS2E5, "series")).toBe(true);  // earlier season
    expect(isScopeVisible("EPISODE", 2, 6, midS2E5, "series")).toBe(false); // one ahead
    expect(isScopeVisible("EPISODE", 3, 1, midS2E5, "series")).toBe(false);
  });
  it("series: WATCHED/ENDING require COMPLETED status", () => {
    expect(isScopeVisible("WATCHED", null, null, midS2E5, "series")).toBe(false);
    expect(isScopeVisible("ENDING", null, null, midS2E5, "series")).toBe(false);
    expect(isScopeVisible("WATCHED", null, null, completed, "series")).toBe(true);
    expect(isScopeVisible("ENDING", null, null, completed, "series")).toBe(true);
  });
  it("COMPLETED sees everything", () => {
    expect(isScopeVisible("EPISODE", 99, 99, completed, "series")).toBe(true);
  });
  it("EPISODE with null season fails closed", () => {
    expect(isScopeVisible("EPISODE", null, null, completed, "series")).toBe(true); // completed bypasses
    expect(isScopeVisible("EPISODE", null, null, midS2E5, "series")).toBe(false);  // can't compare → hidden
  });
});

describe("scope strictness (AI suggestion flow)", () => {
  it("ranks NONE < EPISODE < WATCHED < ENDING", () => {
    expect(scopeRank("NONE")).toBeLessThan(scopeRank("EPISODE"));
    expect(scopeRank("EPISODE")).toBeLessThan(scopeRank("WATCHED"));
    expect(scopeRank("WATCHED")).toBeLessThan(scopeRank("ENDING"));
  });
  it("a later episode tuple is stricter at equal rank", () => {
    expect(isStricterScope("EPISODE", 2, 6, "EPISODE", 2, 5)).toBe(true);
    expect(isStricterScope("EPISODE", 2, 5, "EPISODE", 2, 5)).toBe(false);
  });
  it("EPISODE suggestion over NONE choice is stricter", () => {
    expect(isStricterScope("EPISODE", 1, 1, "NONE", null, null)).toBe(true);
  });
});

describe("scopeKeyFor (thread-summary cache key)", () => {
  it("buckets viewers", () => {
    expect(scopeKeyFor(anon, "movie")).toBe("none");
    expect(scopeKeyFor(movieWatched, "movie")).toBe("watched");
    expect(scopeKeyFor(midS2E5, "series")).toBe("s2e5");
    expect(scopeKeyFor(completed, "series")).toBe("completed");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/server/services/discussion/spoiler-gate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `spoiler-gate.ts`:**

```typescript
/**
 * Site-wide spoiler gate (spec §5: "spoiler gate is a site-wide capability,
 * not a comments feature"). Spec §4.2 predicate, status-aware:
 *   visible ⇔ scope=NONE
 *     OR progress.status=COMPLETED
 *     OR (scopeSeason, scopeEpisode) <= (maxSeasonNumber, maxEpisodeNumber)
 *   movie-side: WATCHED|ENDING visible ⇔ watch_events EXISTS ([userId, movieId] index)
 *
 * Known accepted limitation (spec): high-watermark over-permits sparse/
 * out-of-order watchers; season-0 specials gate as "before S1E1".
 */
import type { Prisma } from "@/server/db/postgres";
import { prisma } from "@/server/db/postgres";
import type { DiscussionAnchor, SpoilerScopeValue } from "./comment-schemas";

export interface ViewerGateContext {
  loggedIn: boolean;
  /** movie anchors: at least one watch_events row for (user, movie) */
  movieWatched: boolean;
  /** series anchors: series_progress.status === COMPLETED */
  seriesCompleted: boolean;
  /** series anchors: lifetime high watermark (NEVER the current-cycle pointer) */
  maxSeason: number | null;
  maxEpisode: number | null;
}

export const ANON_GATE_CONTEXT: ViewerGateContext = {
  loggedIn: false,
  movieWatched: false,
  seriesCompleted: false,
  maxSeason: null,
  maxEpisode: null,
};

/** One cheap lookup per render: PK read (series) or index EXISTS (movie). */
export async function getViewerGateContext(
  userId: number | null,
  anchor: DiscussionAnchor
): Promise<ViewerGateContext> {
  if (!userId) return ANON_GATE_CONTEXT;
  if (anchor.type === "movie") {
    const watched = await prisma.watchEvent.findFirst({
      where: { userId, movieId: anchor.movieId },
      select: { id: true },
    });
    return { ...ANON_GATE_CONTEXT, loggedIn: true, movieWatched: watched !== null };
  }
  const progress = await prisma.seriesProgress.findUnique({
    where: { userId_seriesId: { userId, seriesId: anchor.seriesId } },
    select: { status: true, maxSeasonNumber: true, maxEpisodeNumber: true },
  });
  return {
    loggedIn: true,
    movieWatched: false,
    seriesCompleted: progress?.status === "COMPLETED",
    maxSeason: progress?.maxSeasonNumber ?? null,
    maxEpisode: progress?.maxEpisodeNumber ?? null,
  };
}

/** Pure predicate — usable anywhere (summaries, notification previews, AI chat). */
export function isScopeVisible(
  scope: SpoilerScopeValue,
  scopeSeason: number | null,
  scopeEpisode: number | null,
  ctx: ViewerGateContext,
  anchorKind: "movie" | "series"
): boolean {
  if (scope === "NONE") return true;
  if (anchorKind === "movie") return ctx.movieWatched;
  if (ctx.seriesCompleted) return true;
  if (scope === "WATCHED" || scope === "ENDING") return false;
  // EPISODE: tuple compare against lifetime watermark; fail closed on nulls.
  if (scopeSeason === null || ctx.maxSeason === null) return false;
  if (scopeSeason < ctx.maxSeason) return true;
  if (scopeSeason > ctx.maxSeason) return false;
  return (scopeEpisode ?? 1) <= (ctx.maxEpisode ?? 0);
}

/**
 * The same predicate as a Prisma where-clause so gated pagination runs in SQL
 * (residual filter on the anchor's ordered index — verified read path in spec).
 */
export function visibleScopeWhere(
  ctx: ViewerGateContext,
  anchorKind: "movie" | "series"
): Prisma.CommentWhereInput {
  const branches: Prisma.CommentWhereInput[] = [{ spoilerScope: "NONE" }];
  const fullAccess = anchorKind === "movie" ? ctx.movieWatched : ctx.seriesCompleted;
  if (fullAccess) {
    branches.push({ spoilerScope: { in: ["WATCHED", "EPISODE", "ENDING"] } });
  } else if (anchorKind === "series" && ctx.maxSeason !== null) {
    branches.push({
      spoilerScope: "EPISODE",
      OR: [
        { scopeSeason: { lt: ctx.maxSeason } },
        { scopeSeason: ctx.maxSeason, scopeEpisode: { lte: ctx.maxEpisode ?? 0 } },
      ],
    });
  }
  return { OR: branches };
}

const SCOPE_RANKS: Record<SpoilerScopeValue, number> = {
  NONE: 0,
  EPISODE: 1,
  WATCHED: 2,
  ENDING: 3,
};

export function scopeRank(scope: SpoilerScopeValue): number {
  return SCOPE_RANKS[scope];
}

/** Is the AI-suggested scope stricter than what the user chose? */
export function isStricterScope(
  suggested: SpoilerScopeValue,
  suggestedSeason: number | null,
  suggestedEpisode: number | null,
  chosen: SpoilerScopeValue,
  chosenSeason: number | null,
  chosenEpisode: number | null
): boolean {
  if (scopeRank(suggested) !== scopeRank(chosen)) {
    return scopeRank(suggested) > scopeRank(chosen);
  }
  if (suggested !== "EPISODE") return false;
  const s1 = suggestedSeason ?? 0;
  const s2 = chosenSeason ?? 0;
  if (s1 !== s2) return s1 > s2;
  return (suggestedEpisode ?? 0) > (chosenEpisode ?? 0);
}

/** Viewer bucket for the thread-summary cache key. */
export function scopeKeyFor(ctx: ViewerGateContext, anchorKind: "movie" | "series"): string {
  if (anchorKind === "movie") return ctx.movieWatched ? "watched" : "none";
  if (ctx.seriesCompleted) return "completed";
  if (ctx.maxSeason !== null) return `s${ctx.maxSeason}e${ctx.maxEpisode ?? 0}`;
  return "none";
}
```

Note: `Prisma` must be re-exported from `@/server/db/postgres` (it already is — `export { Prisma }` in `src/server/db/postgres/index.ts`). If `import type { Prisma }` from there fails, import from `@prisma/client` directly.

- [ ] **Step 5: Run tests** — `npx vitest run src/server/services/discussion/spoiler-gate.test.ts` → PASS (all green).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/discussion/comment-schemas.ts src/server/services/discussion/spoiler-gate.ts src/server/services/discussion/spoiler-gate.test.ts
git commit -m "feat(discussion): site-wide spoiler gate predicate + comment schemas"
```

---

### Task 3: @mention parser + resolver

**Files:**
- Create: `src/server/services/discussion/mentions.ts`
- Test: `src/server/services/discussion/mentions.test.ts`

- [ ] **Step 1: Write the failing tests:**

```typescript
import { describe, it, expect } from "vitest";
import { parseMentions } from "./mentions";

describe("parseMentions", () => {
  it("extracts usernames", () => {
    expect(parseMentions("hey @filmfan42 what did you think")).toEqual(["filmfan42"]);
  });
  it("dedupes case-insensitively, preserving first form lowercased", () => {
    expect(parseMentions("@Ana @ana @ANA")).toEqual(["ana"]);
  });
  it("requires a boundary before @ (emails don't mention)", () => {
    expect(parseMentions("mail me a@b.com")).toEqual([]);
    expect(parseMentions("(@ana) and @bob!")).toEqual(["ana", "bob"]);
  });
  it("enforces username charset and length 3-30", () => {
    expect(parseMentions("@ab @this_is_fine @-bad")).toEqual(["this_is_fine"]);
  });
  it("caps at 5 mentions", () => {
    const body = "@u111 @u222 @u333 @u444 @u555 @u666";
    expect(parseMentions(body)).toHaveLength(5);
  });
  it("ignores mentions inside words", () => {
    expect(parseMentions("price is 5@once")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/server/services/discussion/mentions.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `mentions.ts`:**

```typescript
import { prisma } from "@/server/db/postgres";

/**
 * Username charset matches the Phase 0 claim flow: [a-z0-9_], 3-30 chars,
 * case-insensitive (raw UNIQUE INDEX ON lower(username)).
 */
const MENTION_RE = /(^|[^\w@])@([a-z0-9_]{3,30})\b/gi;
const MAX_MENTIONS = 5;

/** Pure: extract up to 5 unique lowercased usernames from a comment body. */
export function parseMentions(body: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    const username = match[2].toLowerCase();
    if (seen.has(username)) continue;
    seen.add(username);
    found.push(username);
    if (found.length >= MAX_MENTIONS) break;
  }
  return found;
}

export interface MentionedUser {
  id: number;
  username: string;
}

/**
 * Resolve usernames → users, excluding the author and anyone with a BLOCK
 * either direction (spec blocks invariant: no mention across blocks).
 */
export async function resolveMentions(
  usernames: string[],
  authorId: number
): Promise<MentionedUser[]> {
  if (usernames.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { username: { in: usernames, mode: "insensitive" } },
    select: { id: true, username: true },
  });
  const candidates = users.filter(
    (u): u is { id: number; username: string } => u.username !== null && u.id !== authorId
  );
  if (candidates.length === 0) return [];
  const ids = candidates.map((u) => u.id);
  const blocks = await prisma.block.findMany({
    where: {
      OR: [
        { blockerId: authorId, blockedId: { in: ids } },
        { blockedId: authorId, blockerId: { in: ids }, type: "BLOCK" },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  const excluded = new Set<number>();
  for (const b of blocks) {
    excluded.add(b.blockerId === authorId ? b.blockedId : b.blockerId);
  }
  return candidates.filter((u) => !excluded.has(u.id));
}
```

- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/server/services/discussion/mentions.ts src/server/services/discussion/mentions.test.ts
git commit -m "feat(discussion): mention parser + block-aware resolver"
```

---

### Task 4: Rate limiting — PG sliding window over the comments table

**Decision + justification:** Use PostgreSQL, counting rows in `comments` itself — NOT in-memory, NOT a new table. (1) The comments table already IS the write log, and Phase 0 ships the `[userId, createdAt desc]` index, so both window counts are single index range scans (~1ms — cheap even on 2 vCPUs at comment-write frequency). (2) In-memory state resets on every PM2 reload — this repo deploys several times a day (see CLAUDE.md Jun 12: 3 rapid deploys), which would zero all limits exactly when an attacker retries. (3) It is exact, a true sliding window, and automatically counts held (`PENDING_REVIEW`) and removed comments — held spam still consumes quota. (4) Zero new infra and correct if the app ever runs >1 process.

**Files:**
- Create: `src/server/services/discussion/rate-limit.ts`

- [ ] **Step 1: Implement:**

```typescript
import { prisma } from "@/server/db/postgres";

const PER_MINUTE_MAX = 4;
const PER_DAY_MAX = 100;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number; message: string };

/**
 * Sliding-window comment rate limit. Two index-only counts on
 * comments [user_id, created_at desc] (phase-0 index) — no extra table:
 * the comments table is the event log.
 */
export async function checkCommentRateLimit(userId: number): Promise<RateLimitResult> {
  const now = Date.now();
  const [minuteCount, dayCount] = await Promise.all([
    prisma.comment.count({ where: { userId, createdAt: { gte: new Date(now - 60_000) } } }),
    prisma.comment.count({ where: { userId, createdAt: { gte: new Date(now - 86_400_000) } } }),
  ]);
  if (minuteCount >= PER_MINUTE_MAX) {
    return { ok: false, retryAfterSeconds: 60, message: "You're commenting too fast. Try again in a minute." };
  }
  if (dayCount >= PER_DAY_MAX) {
    return { ok: false, retryAfterSeconds: 3600, message: "Daily comment limit reached. Try again later." };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck** — `yarn typecheck` → PASS.
- [ ] **Step 3: Commit**

```bash
git add src/server/services/discussion/rate-limit.ts
git commit -m "feat(discussion): PG sliding-window comment rate limit"
```

---

### Task 5: AI comment gate (toxicity + spoiler-scope suggestion)

Lives beside the Phase 0 review gate in `src/server/services/moderation/`. Reuses the `callBedrockFlex` helper (`src/server/services/enrichment/bedrock-flex.ts`). Standard tier, NOT flex: this is an interactive submit (flex trades latency for cost; a comment-sized call costs ~$0.0001). 8s timeout; any failure → caller stores `PENDING_REVIEW` (fail closed for visibility, per scope). Fable rule (spec §5, hard): the prompt classifies CONTENT only and never characterizes users.

**Files:**
- Create: `src/server/services/moderation/comment-gate.ts`
- Test: `src/server/services/moderation/comment-gate.test.ts`

- [ ] **Step 1: Write the failing parser tests:**

```typescript
import { describe, it, expect } from "vitest";
import { parseGateResponse } from "./comment-gate";

describe("parseGateResponse", () => {
  it("parses a clean JSON response", () => {
    const out = parseGateResponse(
      '{"toxicity":"ok","toxicity_reason":null,"spoiler_scope":"EPISODE","scope_season":2,"scope_episode":5}'
    );
    expect(out).toEqual({
      toxicity: "ok",
      toxicityReason: null,
      suggestedScope: "EPISODE",
      suggestedSeason: 2,
      suggestedEpisode: 5,
    });
  });
  it("strips markdown code fences", () => {
    const out = parseGateResponse('```json\n{"toxicity":"flagged","toxicity_reason":"harassment","spoiler_scope":"NONE","scope_season":null,"scope_episode":null}\n```');
    expect(out?.toxicity).toBe("flagged");
    expect(out?.toxicityReason).toBe("harassment");
  });
  it("returns null on garbage / wrong shape", () => {
    expect(parseGateResponse("I think this comment is fine")).toBeNull();
    expect(parseGateResponse('{"toxicity":"maybe"}')).toBeNull();
    expect(parseGateResponse("")).toBeNull();
  });
  it("tolerates missing optional fields", () => {
    const out = parseGateResponse('{"toxicity":"ok","spoiler_scope":"NONE"}');
    expect(out).toEqual({
      toxicity: "ok",
      toxicityReason: null,
      suggestedScope: "NONE",
      suggestedSeason: null,
      suggestedEpisode: null,
    });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/server/services/moderation/comment-gate.test.ts` → FAIL.

- [ ] **Step 3: Implement `comment-gate.ts`:**

```typescript
/**
 * AI gate for comment submission (spec §5): toxicity + spoiler-scope
 * suggestion, user-adjustable pre-publish. aiLabels retained for audit.
 * Fable rule: classifies content, never characterizes users.
 */
import { z } from "zod";
import { callBedrockFlex } from "@/server/services/enrichment/bedrock-flex";
import { dataLogger } from "@/lib/logger";
import type { SpoilerScopeValue } from "@/server/services/discussion/comment-schemas";

export interface CommentGateInput {
  body: string;
  title: string;
  mediaType: "movie" | "series";
  /** thread position, so EPISODE suggestions default sensibly */
  seasonNumber: number | null;
  episodeNumber: number | null;
}

export interface CommentGateResult {
  toxicity: "ok" | "flagged";
  toxicityReason: string | null;
  suggestedScope: SpoilerScopeValue;
  suggestedSeason: number | null;
  suggestedEpisode: number | null;
}

const GateResponseSchema = z.object({
  toxicity: z.enum(["ok", "flagged"]),
  toxicity_reason: z.string().nullable().optional(),
  spoiler_scope: z.enum(["NONE", "WATCHED", "EPISODE", "ENDING"]),
  scope_season: z.number().int().nullable().optional(),
  scope_episode: z.number().int().nullable().optional(),
});

const SYSTEM_PROMPT = `You are a content classifier for a movie/TV discussion board. Classify the COMMENT and respond with ONLY a JSON object, no prose:
{"toxicity":"ok"|"flagged","toxicity_reason":string|null,"spoiler_scope":"NONE"|"WATCHED"|"EPISODE"|"ENDING","scope_season":number|null,"scope_episode":number|null}

Rules:
- toxicity "flagged" = harassment, hate speech, slurs, sexualized minors, doxxing, credible threats, or spam/advertising. Strong negative opinions about the movie/show are "ok".
- spoiler_scope describes what the comment REVEALS about the title:
  "NONE" = safe for someone who has not watched anything.
  "EPISODE" = reveals events up to a specific episode of a series (always set scope_season and scope_episode).
  "WATCHED" = reveals movie plot, or assumes the whole series has been seen.
  "ENDING" = reveals how the story ends.
- Classify the content only. Never judge, profile, or characterize the comment's author.`;

/** Pure, exported for tests: parse + validate the LLM output. */
export function parseGateResponse(output: string): CommentGateResult | null {
  const stripped = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed = GateResponseSchema.parse(JSON.parse(stripped));
    return {
      toxicity: parsed.toxicity,
      toxicityReason: parsed.toxicity_reason ?? null,
      suggestedScope: parsed.spoiler_scope,
      suggestedSeason: parsed.scope_season ?? null,
      suggestedEpisode: parsed.scope_episode ?? null,
    };
  } catch {
    return null;
  }
}

const GATE_TIMEOUT_MS = 8_000;

/** null = gate unavailable (timeout/parse/LLM error) → caller stores PENDING_REVIEW. */
export async function runCommentGate(input: CommentGateInput): Promise<CommentGateResult | null> {
  const threadContext =
    input.mediaType === "movie"
      ? "movie discussion"
      : input.seasonNumber !== null && input.episodeNumber !== null
        ? `episode thread for S${input.seasonNumber}E${input.episodeNumber}`
        : "series-level discussion";
  const userText = `TITLE: ${input.title} (${input.mediaType})\nTHREAD: ${threadContext}\nCOMMENT:\n${input.body}`;
  try {
    const result = await Promise.race([
      callBedrockFlex({
        messages: [{ role: "user", text: userText }],
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 150,
        temperature: 0,
        useFlex: false, // interactive submit — latency matters, cost is ~1e-4 USD
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("comment gate timeout")), GATE_TIMEOUT_MS)
      ),
    ]);
    const parsed = parseGateResponse(result.output);
    if (!parsed) {
      dataLogger.warn({ action: "commentGate", output: result.output.slice(0, 200) }, "unparseable gate output");
    }
    return parsed;
  } catch (error: unknown) {
    dataLogger.error(
      { action: "commentGate", error: error instanceof Error ? error.message : String(error) },
      "comment gate failed"
    );
    return null;
  }
}
```

- [ ] **Step 4: Run tests** → PASS. `yarn typecheck` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/server/services/moderation/comment-gate.ts src/server/services/moderation/comment-gate.test.ts
git commit -m "feat(moderation): AI comment gate (toxicity + spoiler-scope suggestion)"
```

---

### Task 6: Read path — block helper + comment queries (keyset, reply batches)

**Files:**
- Create: `src/server/db/postgres/blocks.ts`
- Create: `src/server/db/postgres/comments.ts`

- [ ] **Step 1: Write `blocks.ts`** — the ONE helper every social read must use (spec blocks invariant: "enforced via the same query-helper pattern as publicComments, never ad-hoc where-clauses"):

```typescript
import { prisma } from "@/server/db/postgres";

/**
 * Author ids the viewer must never see content from:
 * - anyone the viewer BLOCKed or MUTEd (one-way hide),
 * - anyone who BLOCKed the viewer (mutual invisibility).
 * Two small indexed lookups, bounded by the viewer's own block list.
 * EVERY social read path (comments, replies, mentions, notifications, feed)
 * filters with this — day-one invariant from the spec.
 */
export async function getExcludedAuthorIds(viewerId: number | null): Promise<number[]> {
  if (!viewerId) return [];
  const [outgoing, incoming] = await Promise.all([
    prisma.block.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } }),
    prisma.block.findMany({
      where: { blockedId: viewerId, type: "BLOCK" },
      select: { blockerId: true },
    }),
  ]);
  const ids = new Set<number>();
  for (const b of outgoing) ids.add(b.blockedId);
  for (const b of incoming) ids.add(b.blockerId);
  return [...ids];
}
```

- [ ] **Step 2: Write `comments.ts`** (the `publicComments` helper named in the spec lives here; if Phase 0 already created `src/server/db/postgres/comments.ts` for review/comment plumbing, MERGE into it rather than duplicating):

```typescript
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
  const deleted = row.status === "DELETED_BY_USER";
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
  status: "PUBLISHED",
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
        ? [{ userId: viewerId, circleId: null, status: { in: ["PENDING_REVIEW", "FLAGGED", "PUBLISHED"] as const } }]
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
```

Note on `status: { in: [...] as const }`: if Prisma's generated `CommentStatus` enum type rejects the string literals, import `CommentStatus` from `@prisma/client` and use `[CommentStatus.PENDING_REVIEW, …]`. Same for `"PUBLISHED"` in `PUBLIC_COMMENTS_WHERE`.

- [ ] **Step 3: Typecheck** — `yarn typecheck` → PASS (fix any enum-literal friction per the note).
- [ ] **Step 4: EXPLAIN spot-check (local PG)** — verify the root page is one ordered index scan:

```bash
docker exec movie-browser-postgres psql -U postgres -d moviebrowser -c "EXPLAIN SELECT * FROM comments WHERE movie_id=603 AND circle_id IS NULL AND status='PUBLISHED' AND parent_id IS NULL ORDER BY created_at DESC, id DESC LIMIT 21;"
```
Expected: Index Scan on the `[movie_id, circle_id, status, created_at]` index (adjust container/db names to local compose).

- [ ] **Step 5: Commit**

```bash
git add src/server/db/postgres/blocks.ts src/server/db/postgres/comments.ts
git commit -m "feat(discussion): publicComments + gated comment reads with keyset pagination"
```

---

### Task 7: Write path — comment server actions (create/edit/soft-delete/report)

**Files:**
- Create: `src/server/actions/comments.ts`
- Create: `src/server/actions/comment-reads.ts`

- [ ] **Step 1: Write `comments.ts`:**

```typescript
"use server";

import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { requireUserIdForDb } from "@/lib/user-id";
import { getMediaPath } from "@/lib/utils";
import {
  CreateCommentSchema,
  DeleteCommentSchema,
  EditCommentSchema,
  ReportCommentSchema,
  type CreateCommentInput,
  type DiscussionAnchor,
  type SpoilerScopeValue,
} from "@/server/services/discussion/comment-schemas";
import { isStricterScope } from "@/server/services/discussion/spoiler-gate";
import { checkCommentRateLimit } from "@/server/services/discussion/rate-limit";
import { parseMentions, resolveMentions } from "@/server/services/discussion/mentions";
import { runCommentGate, type CommentGateResult } from "@/server/services/moderation/comment-gate";
import { notifyMention, notifyReply } from "@/server/services/notifications/notify";
import { toCommentDto, type CommentDto } from "@/server/db/postgres/comments";

export type CreateCommentResult =
  | { status: "published"; comment: CommentDto }
  | { status: "pending_review" }
  | {
      status: "scope_suggestion";
      suggestedScope: SpoilerScopeValue;
      suggestedSeason: number | null;
      suggestedEpisode: number | null;
    }
  | { status: "error"; message: string };

/** Title lookup for the gate prompt + permalinks (one indexed PK read). */
async function getAnchorTitle(anchor: DiscussionAnchor): Promise<string | null> {
  if (anchor.type === "movie") {
    const movie = await prisma.movie.findUnique({
      where: { id: anchor.movieId },
      select: { title: true },
    });
    return movie?.title ?? null;
  }
  const series = await prisma.series.findUnique({
    where: { id: anchor.seriesId },
    select: { name: true },
  });
  return series?.name ?? null;
}

/** Permalink for notifications (spec: every public social object gets a stable URL). */
function commentPermalink(anchor: DiscussionAnchor, title: string, commentId: number): string {
  if (anchor.type === "movie") {
    return `${getMediaPath("movie", anchor.movieId, title)}#comment-${commentId}`;
  }
  const base = getMediaPath("series", anchor.seriesId, title);
  if (anchor.seasonNumber !== null && anchor.episodeNumber !== null) {
    return `${base}/discuss/s${anchor.seasonNumber}e${anchor.episodeNumber}#comment-${commentId}`;
  }
  return `${base}#comment-${commentId}`;
}

export async function createComment(rawInput: CreateCommentInput): Promise<CreateCommentResult> {
  try {
    const userId = await requireUserIdForDb();
    const input = CreateCommentSchema.parse(rawInput);

    const rate = await checkCommentRateLimit(userId);
    if (!rate.ok) return { status: "error", message: rate.message };

    // Reply handling: depth cap 2 — re-parent reply-to-reply onto the root,
    // and DENORMALIZE the anchor from the parent (spec §4.2).
    let anchor = input.anchor;
    let parentId: number | null = null;
    let parentAuthorId: number | null = null;
    if (input.parentId !== null) {
      const parent = await prisma.comment.findUnique({
        where: { id: input.parentId },
        select: {
          id: true, parentId: true, userId: true, circleId: true, status: true,
          movieId: true, seriesId: true, seasonNumber: true, episodeNumber: true,
        },
      });
      if (!parent || parent.circleId !== null || parent.status !== "PUBLISHED") {
        return { status: "error", message: "Comment not found" };
      }
      parentId = parent.parentId ?? parent.id; // flatten to root
      parentAuthorId = parent.userId;
      anchor = parent.movieId
        ? { type: "movie", movieId: parent.movieId }
        : {
            type: "series",
            seriesId: parent.seriesId as number,
            seasonNumber: parent.seasonNumber,
            episodeNumber: parent.episodeNumber,
          };
    }

    const title = await getAnchorTitle(anchor);
    if (!title) return { status: "error", message: "Title not found" };

    // AI gate. null = unavailable → PENDING_REVIEW (fail closed for visibility).
    const gate = await runCommentGate({
      body: input.body,
      title,
      mediaType: anchor.type,
      seasonNumber: anchor.type === "series" ? anchor.seasonNumber : null,
      episodeNumber: anchor.type === "series" ? anchor.episodeNumber : null,
    });

    // Scope suggestion (user-adjustable pre-publish): if the AI thinks the
    // comment is more spoilery than the chosen scope and the user hasn't
    // confirmed yet, return the suggestion WITHOUT inserting. The confirm
    // resubmit re-runs the gate (second ~1e-4 USD call — cheaper than
    // building a tamper-proof token round-trip).
    if (
      gate &&
      !input.confirmedScope &&
      isStricterScope(
        gate.suggestedScope, gate.suggestedSeason, gate.suggestedEpisode,
        input.spoilerScope, input.scopeSeason, input.scopeEpisode
      )
    ) {
      return {
        status: "scope_suggestion",
        suggestedScope: gate.suggestedScope,
        suggestedSeason: gate.suggestedSeason,
        suggestedEpisode: gate.suggestedEpisode,
      };
    }

    const held = gate === null || gate.toxicity === "flagged";
    const aiLabels: Record<string, unknown> | undefined = gate
      ? { gate: { ...gate }, gatedAt: new Date().toISOString() }
      : { gate: null, gatedAt: new Date().toISOString(), gateError: true };

    const created = await prisma.comment.create({
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
        status: held ? "PENDING_REVIEW" : "PUBLISHED",
        aiLabels: aiLabels as object,
      },
      include: { user: { select: { id: true, username: true, name: true, image: true } } },
    });

    if (held) return { status: "pending_review" };

    // Notifications: write-on-event, bounded recipients (invariant 6).
    // Fire-and-forget — never block the submit response on push delivery.
    const url = commentPermalink(anchor, title, created.id);
    void (async () => {
      try {
        if (parentAuthorId && parentAuthorId !== userId) {
          await notifyReply({
            recipientId: parentAuthorId, actorId: userId,
            commentId: created.id, title, snippet: input.body.slice(0, 140), url,
          });
        }
        const mentioned = await resolveMentions(parseMentions(input.body), userId);
        for (const user of mentioned) {
          if (user.id === parentAuthorId) continue; // no double-notify
          await notifyMention({
            recipientId: user.id, actorId: userId,
            commentId: created.id, title, snippet: input.body.slice(0, 140), url,
          });
        }
      } catch (error: unknown) {
        dataLogger.error(
          { action: "commentNotify", error: error instanceof Error ? error.message : String(error) },
          "notification fan-out failed"
        );
      }
    })();

    return { status: "published", comment: toCommentDto(created) };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) return { status: "error", message: "Invalid comment" };
    dataLogger.error(
      { action: "createComment", error: error instanceof Error ? error.message : String(error) },
      "createComment failed"
    );
    return { status: "error", message: "Something went wrong" };
  }
}

export type SimpleActionResult = { ok: true } | { ok: false; message: string };

export async function editComment(rawInput: z.infer<typeof EditCommentSchema>): Promise<SimpleActionResult> {
  try {
    const userId = await requireUserIdForDb();
    const input = EditCommentSchema.parse(rawInput);
    const existing = await prisma.comment.findUnique({
      where: { id: input.commentId },
      select: { userId: true, status: true, movieId: true, seriesId: true, seasonNumber: true, episodeNumber: true },
    });
    if (!existing || existing.userId !== userId) return { ok: false, message: "Not found" };
    if (existing.status === "REMOVED" || existing.status === "DELETED_BY_USER") {
      return { ok: false, message: "Cannot edit this comment" };
    }
    const anchor: DiscussionAnchor = existing.movieId
      ? { type: "movie", movieId: existing.movieId }
      : {
          type: "series", seriesId: existing.seriesId as number,
          seasonNumber: existing.seasonNumber, episodeNumber: existing.episodeNumber,
        };
    const title = (await getAnchorTitle(anchor)) ?? "";
    // Re-gate edits for toxicity (no scope-suggestion round-trip on edit —
    // the author explicitly sets scope here).
    const gate = await runCommentGate({
      body: input.body, title, mediaType: anchor.type,
      seasonNumber: anchor.type === "series" ? anchor.seasonNumber : null,
      episodeNumber: anchor.type === "series" ? anchor.episodeNumber : null,
    });
    const held = gate === null || gate.toxicity === "flagged";
    await prisma.comment.update({
      where: { id: input.commentId },
      data: {
        body: input.body,
        spoilerScope: input.spoilerScope,
        scopeSeason: input.spoilerScope === "EPISODE" ? input.scopeSeason : null,
        scopeEpisode: input.spoilerScope === "EPISODE" ? input.scopeEpisode : null,
        status: held ? "PENDING_REVIEW" : "PUBLISHED",
        editedAt: new Date(),
        aiLabels: { gate: gate ? { ...gate } : null, gatedAt: new Date().toISOString() } as object,
      },
    });
    return { ok: true };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "editComment", error: error instanceof Error ? error.message : String(error) },
      "editComment failed"
    );
    return { ok: false, message: "Something went wrong" };
  }
}

/** Soft delete (spec invariant 4: NEVER hard-delete; scrub body, keep tree). */
export async function deleteComment(rawInput: z.infer<typeof DeleteCommentSchema>): Promise<SimpleActionResult> {
  try {
    const userId = await requireUserIdForDb();
    const input = DeleteCommentSchema.parse(rawInput);
    const result = await prisma.comment.updateMany({
      where: { id: input.commentId, userId },
      data: { status: "DELETED_BY_USER", body: "" },
    });
    return result.count === 1 ? { ok: true } : { ok: false, message: "Not found" };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "deleteComment", error: error instanceof Error ? error.message : String(error) },
      "deleteComment failed"
    );
    return { ok: false, message: "Something went wrong" };
  }
}

export async function reportComment(rawInput: z.infer<typeof ReportCommentSchema>): Promise<SimpleActionResult> {
  try {
    const reporterId = await requireUserIdForDb();
    const input = ReportCommentSchema.parse(rawInput);
    const comment = await prisma.comment.findUnique({
      where: { id: input.commentId },
      select: { id: true },
    });
    if (!comment) return { ok: false, message: "Not found" };
    await prisma.report.create({
      data: {
        reporterId,
        commentId: input.commentId,
        reason: input.reason,
        note: input.note ?? null,
        // status defaults to the Phase 0 default (OPEN)
      },
    });
    return { ok: true };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "reportComment", error: error instanceof Error ? error.message : String(error) },
      "reportComment failed"
    );
    return { ok: false, message: "Something went wrong" };
  }
}
```

- [ ] **Step 2: Write `comment-reads.ts`** (the gated tier the client island fetches — POST, never edge-cached):

```typescript
"use server";

import { z } from "zod";
import { dataLogger } from "@/lib/logger";
import { getUserIdForDb } from "@/lib/user-id";
import {
  CommentCursorSchema,
  DiscussionAnchorSchema,
} from "@/server/services/discussion/comment-schemas";
import { getViewerGateContext } from "@/server/services/discussion/spoiler-gate";
import {
  getVisibleCommentPage,
  getPublicCommentPage,
  type CommentPageDto,
} from "@/server/db/postgres/comments";

const LoadCommentsSchema = z.object({
  anchor: DiscussionAnchorSchema,
  cursor: CommentCursorSchema.nullable().default(null),
});

/**
 * Progress-gated comment page for the signed-in client tier. Anonymous
 * callers get the public (NONE) tier — same shape, so the client island can
 * call this unconditionally for pagination.
 */
export async function loadComments(
  rawInput: z.infer<typeof LoadCommentsSchema>
): Promise<CommentPageDto> {
  try {
    const input = LoadCommentsSchema.parse(rawInput);
    const userId = await getUserIdForDb();
    if (!userId) return getPublicCommentPage(input.anchor, input.cursor);
    const ctx = await getViewerGateContext(userId, input.anchor);
    return getVisibleCommentPage(input.anchor, ctx, userId, input.cursor);
  } catch (error: unknown) {
    dataLogger.error(
      { action: "loadComments", error: error instanceof Error ? error.message : String(error) },
      "loadComments failed"
    );
    return { roots: [], nextCursor: null };
  }
}
```

- [ ] **Step 3: Typecheck** — `yarn typecheck`. It will FAIL on the missing `notify` module — that's Task 8. To keep this task self-contained, create the notify service stub first? **No — execute Task 8 Step 1 (notify.ts + push.ts) before typechecking this task, or reorder: implement Task 8 first if you prefer green checks at every step.** (Recommended execution order: Task 8 Steps 1–2 can be done as part of this task's Step 3.)
- [ ] **Step 4: Commit** (after Task 8 Step 1 lands and typecheck passes)

```bash
git add src/server/actions/comments.ts src/server/actions/comment-reads.ts
git commit -m "feat(discussion): comment write/read server actions with AI gate + mentions"
```

---

### Task 8: Notifications service + web push plumbing

PWA infra exists (Serwist SW at `src/app/sw.ts`, manifest, `src/app/serwist/[[...path]]` route). This adds: `web-push` dependency, VAPID env, push/notificationclick handlers in the SW, subscribe API, and the notify service consumed by Task 7.

**Files:**
- Create: `src/server/services/notifications/notify.ts`
- Create: `src/server/services/notifications/push.ts`
- Create: `src/app/api/push/route.ts`
- Create: `src/hooks/use-push-subscription.ts`
- Modify: `src/app/sw.ts`
- Modify: `template.env`

- [ ] **Step 1: Install dependency + generate VAPID keys**

```bash
yarn add web-push && yarn add -D @types/web-push
npx web-push generate-vapid-keys
```

Add to `.env.local` (and matching placeholders to `template.env`):

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>
VAPID_PRIVATE_KEY=<privateKey>
VAPID_SUBJECT=mailto:admin@themoviebrowser.com
```

- [ ] **Step 2: Write `push.ts`:**

```typescript
import webpush from "web-push";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false; // push not configured — no-op
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@themoviebrowser.com",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

const isWebPushError = (e: unknown): e is { statusCode: number } =>
  typeof e === "object" && e !== null && "statusCode" in e;

/**
 * Send a push to all of ONE user's subscriptions (bounded fan-out —
 * invariant 6 holds: one direct recipient per event). Dead endpoints
 * (404/410) are pruned. Fire-and-forget callers must not await delivery
 * on the request path.
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (error: unknown) {
        if (isWebPushError(error) && (error.statusCode === 404 || error.statusCode === 410)) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          dataLogger.warn(
            { action: "sendPush", userId, error: error instanceof Error ? error.message : String(error) },
            "push send failed"
          );
        }
      }
    })
  );
}
```

- [ ] **Step 3: Write `notify.ts`:**

```typescript
import { prisma } from "@/server/db/postgres";
import { getExcludedAuthorIds } from "@/server/db/postgres/blocks";
import { sendPushToUser } from "./push";

interface CommentNotifyParams {
  recipientId: number;
  actorId: number;
  commentId: number;
  title: string;
  snippet: string;
  url: string;
}

/**
 * Write-on-event notification (invariant 6: bounded direct recipients, no
 * fan-out). Respects blocks: a recipient who blocked/muted the actor (or is
 * blocked by them) gets nothing.
 *
 * NOTE: snippets may contain spoilers — the notification UI shows the TITLE
 * and actor only for gated-scope comments; the payload carries `snippet`
 * but list rendering re-checks `spoilerScope` (see notification-list).
 */
async function createCommentNotification(
  type: "REPLY" | "MENTION",
  params: CommentNotifyParams
): Promise<void> {
  const excluded = await getExcludedAuthorIds(params.recipientId);
  if (excluded.includes(params.actorId)) return;
  const comment = await prisma.comment.findUnique({
    where: { id: params.commentId },
    select: { spoilerScope: true },
  });
  const spoilery = comment !== null && comment.spoilerScope !== "NONE";
  await prisma.notification.create({
    data: {
      userId: params.recipientId,
      type,
      actorId: params.actorId,
      payload: {
        commentId: params.commentId,
        title: params.title,
        url: params.url,
        snippet: spoilery ? null : params.snippet, // spoiler-safe previews by construction
        spoilery,
      },
    },
  });
  const verb = type === "REPLY" ? "replied to your comment" : "mentioned you";
  void sendPushToUser(params.recipientId, {
    title: `New activity on ${params.title}`,
    body: spoilery ? `Someone ${verb} (spoiler-tagged)` : `Someone ${verb}: ${params.snippet}`,
    url: params.url,
  });
}

export async function notifyReply(params: CommentNotifyParams): Promise<void> {
  return createCommentNotification("REPLY", params);
}

export async function notifyMention(params: CommentNotifyParams): Promise<void> {
  return createCommentNotification("MENTION", params);
}
```

(If Phase 0 made `Notification.type` a Prisma enum, pass `NotificationType.REPLY` instead of the string.)

- [ ] **Step 4: Add push handlers to `src/app/sw.ts`** (append after the `serwist.addEventListeners()` / Serwist setup at the bottom of the file, keeping serwist v9 conventions):

```typescript
// --- Web push (phase 1) -----------------------------------------------------
interface PushData {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  let data: PushData = {};
  try {
    data = (event.data?.json() as PushData) ?? {};
  } catch {
    // non-JSON push — show generic
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Movie Browser", {
      body: data.body ?? "",
      icon: "/images/android-chrome-192x192.png",
      badge: "/images/android-chrome-192x192.png",
      data: { url: data.url ?? "/notifications" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) {
        void existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 5: Write `src/app/api/push/route.ts`:**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { requireUserIdForDb } from "@/lib/user-id";

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserIdForDb();
    const body = SubscribeSchema.parse(await request.json());
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: request.headers.get("user-agent")?.slice(0, 255) ?? null,
      },
      update: { userId, p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const UnsubscribeSchema = z.object({ endpoint: z.string().url() });

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserIdForDb();
    const body = UnsubscribeSchema.parse(await request.json());
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Write `src/hooks/use-push-subscription.ts`:**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushState = "unsupported" | "loading" | "denied" | "subscribed" | "unsubscribed";

export function usePushSubscription() {
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "subscribed" : "unsubscribed"))
      .catch(() => setState("unsupported"));
  }, []);

  const subscribe = useCallback(async () => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      });
      setState("subscribed");
    } catch {
      setState("unsubscribed");
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("unsubscribed");
    } catch {
      setState("subscribed");
    }
  }, []);

  return { state, subscribe, unsubscribe };
}
```

- [ ] **Step 7: Typecheck + lint** — `yarn typecheck && yarn lint` → PASS (this also closes Task 7's pending typecheck).
- [ ] **Step 8: Commit**

```bash
git add package.json yarn.lock template.env src/server/services/notifications/ src/app/api/push/route.ts src/hooks/use-push-subscription.ts src/app/sw.ts src/server/actions/comments.ts src/server/actions/comment-reads.ts
git commit -m "feat(notifications): notify service + web push plumbing (VAPID, SW handlers, subscribe API)"
```

---

### Task 9: Notifications center UI (bell, list, mark-read)

**Files:**
- Create: `src/server/actions/notifications.ts`
- Create: `src/components/features/notifications/notification-bell.tsx`
- Create: `src/components/features/notifications/notification-list.tsx`
- Create: `src/app/notifications/page.tsx`
- Modify: `src/components/features/layout/nav-bar.tsx`
- Modify: `src/components/features/layout/mobile-bottom-nav.tsx`

- [ ] **Step 1: Write `src/server/actions/notifications.ts`:**

```typescript
"use server";

import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { getUserIdForDb, requireUserIdForDb } from "@/lib/user-id";

export interface NotificationDto {
  id: number;
  type: string;
  read: boolean;
  createdAt: string;
  actor: { id: number; username: string | null; name: string | null; image: string | null } | null;
  payload: { commentId?: number; title?: string; url?: string; snippet?: string | null; spoilery?: boolean };
}

const ListSchema = z.object({
  cursor: z.number().int().positive().nullable().default(null),
  limit: z.number().int().min(1).max(50).default(20),
});

export async function getNotifications(
  rawInput: z.infer<typeof ListSchema>
): Promise<{ items: NotificationDto[]; nextCursor: number | null }> {
  try {
    const userId = await getUserIdForDb();
    if (!userId) return { items: [], nextCursor: null };
    const input = ListSchema.parse(rawInput);
    const rows = await prisma.notification.findMany({
      where: { userId, ...(input.cursor ? { id: { lt: input.cursor } } : {}) },
      include: { actor: { select: { id: true, username: true, name: true, image: true } } },
      orderBy: { id: "desc" },
      take: input.limit + 1,
    });
    const hasMore = rows.length > input.limit;
    const items = (hasMore ? rows.slice(0, input.limit) : rows).map((n) => ({
      id: n.id,
      type: String(n.type),
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
      actor: n.actor,
      payload: (n.payload ?? {}) as NotificationDto["payload"],
    }));
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "getNotifications", error: error instanceof Error ? error.message : String(error) },
      "getNotifications failed"
    );
    return { items: [], nextCursor: null };
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const userId = await getUserIdForDb();
    if (!userId) return 0;
    // [userId, readAt, createdAt desc] phase-0 index — index-only count
    return await prisma.notification.count({ where: { userId, readAt: null } });
  } catch {
    return 0;
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    const userId = await requireUserIdForDb();
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  } catch (error: unknown) {
    dataLogger.error(
      { action: "markAllNotificationsRead", error: error instanceof Error ? error.message : String(error) },
      "markAllNotificationsRead failed"
    );
  }
}
```

(Notes: if `Notification.actor` isn't the Phase 0 relation name, adjust the include. `payload` cast is a typed-DTO narrowing of Prisma's `JsonValue`, not `any`.)

- [ ] **Step 2: Write `notification-bell.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useSession } from "next-auth/react";
import { getUnreadNotificationCount } from "@/server/actions/notifications";
import { cn } from "@/lib/utils";

/** Bell + unread badge. Fetches on mount and when the tab regains focus. */
export function NotificationBell({ className }: { className?: string }) {
  const { status } = useSession();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    const refresh = () => {
      void getUnreadNotificationCount().then((n) => {
        if (!cancelled) setUnread(n);
      });
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status]);

  if (status !== "authenticated") return null;

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted transition-colors",
        className
      )}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-brand text-on-brand text-[10px] font-semibold leading-4 text-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
```

(`bg-brand text-on-brand`: use the project's accent utility classes — check `globals.css`; if the utilities are `bg-primary text-primary-foreground` in this codebase, use those. No hardcoded colors per DESIGN.md.)

- [ ] **Step 3: Write `notification-list.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import {
  getNotifications,
  markAllNotificationsRead,
  type NotificationDto,
} from "@/server/actions/notifications";
import { cn } from "@/lib/utils";

function describe(n: NotificationDto): string {
  const who = n.actor?.username ?? n.actor?.name ?? "Someone";
  const title = n.payload.title ?? "a title";
  if (n.type === "REPLY") return `${who} replied to your comment on ${title}`;
  if (n.type === "MENTION") return `${who} mentioned you on ${title}`;
  if (n.type === "FOLLOW") return `${who} followed you`;
  return `${who} · ${title}`;
}

export function NotificationList() {
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { state: pushState, subscribe, unsubscribe } = usePushSubscription();

  useEffect(() => {
    void getNotifications({ cursor: null, limit: 20 }).then((page) => {
      setItems(page.items);
      setCursor(page.nextCursor);
      setLoading(false);
      // Mark read AFTER the unread state has been captured for display
      void markAllNotificationsRead();
    });
  }, []);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    const page = await getNotifications({ cursor, limit: 20 });
    setItems((prev) => [...prev, ...page.items]);
    setCursor(page.nextCursor);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Push toggle */}
      {pushState !== "unsupported" && (
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div className="text-sm">
            <p className="font-medium">Push notifications</p>
            <p className="text-muted-foreground text-xs">
              Get notified about replies and mentions
            </p>
          </div>
          {pushState === "subscribed" ? (
            <Button variant="outline" size="sm" onClick={() => void unsubscribe()}>
              <BellOff className="h-4 w-4 mr-1.5" /> Disable
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={pushState === "loading" || pushState === "denied"}
              onClick={() => void subscribe()}
            >
              <BellRing className="h-4 w-4 mr-1.5" />
              {pushState === "denied" ? "Blocked in browser" : "Enable"}
            </Button>
          )}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          Nothing yet. Replies and mentions land here.
        </p>
      )}

      <ul className="divide-y divide-border">
        {items.map((n) => (
          <li key={n.id}>
            <Link
              href={n.payload.url ?? "/notifications"}
              className={cn(
                "block py-3 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors",
                !n.read && "bg-muted/30"
              )}
            >
              <p className="text-sm">{describe(n)}</p>
              {n.payload.snippet && !n.payload.spoilery && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {n.payload.snippet}
                </p>
              )}
              {n.payload.spoilery && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">
                  Spoiler-tagged comment — open to view
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {cursor && (
        <Button variant="outline" className="w-full" disabled={loading} onClick={() => void loadMore()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/app/notifications/page.tsx`** (per-user → never static, never edge-cached; logged-in requests carry cookies so CloudFront misses anyway, but force-dynamic makes it explicit):

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { NotificationList } from "@/components/features/notifications/notification-list";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notifications",
  robots: "noindex, nofollow",
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/notifications");
  }
  return (
    <PageMain className="max-w-2xl mx-auto">
      <SectionHeading className="mb-4">Notifications</SectionHeading>
      <NotificationList />
    </PageMain>
  );
}
```

- [ ] **Step 5: Mount the bell.** In `src/components/features/layout/nav-bar.tsx`, import `NotificationBell` and render it immediately before `<UserMenu />` (currently around line 191):

```tsx
import { NotificationBell } from "@/components/features/notifications/notification-bell";
// …in the JSX, next to UserMenu:
<NotificationBell />
<UserMenu />
```

In `src/components/features/layout/mobile-bottom-nav.tsx`, add a "Notifications" `Link` row (Bell icon + label, `href="/notifications"`) inside the logged-in profile sheet/menu section (the block using `session` around line 281), following the exact pattern of the adjacent menu items in that file. Mobile has no top navbar (DESIGN.md) — the sheet entry is the mobile surface.

- [ ] **Step 6: Verify visually** — `yarn dev`, sign in, check bell renders (desktop 1440×900) and the sheet entry (390×844); `/notifications` lists and marks read.
- [ ] **Step 7: Commit**

```bash
git add src/server/actions/notifications.ts src/components/features/notifications/ src/app/notifications/ src/components/features/layout/nav-bar.tsx src/components/features/layout/mobile-bottom-nav.tsx
git commit -m "feat(notifications): bell, notifications center, mark-read, push toggle"
```

---

### Task 10: Discussion UI components

Mobile-first thread UI per DESIGN.md (body-md text, ≥40px touch targets, no hardcoded colors, radii from the scale). All files in `src/components/features/discussion/`.

- [ ] **Step 1: `scope-badge.tsx`:**

```tsx
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpoilerScopeValue } from "@/server/services/discussion/comment-schemas";

export function scopeLabel(
  scope: SpoilerScopeValue,
  scopeSeason: number | null,
  scopeEpisode: number | null
): string | null {
  if (scope === "NONE") return null;
  if (scope === "EPISODE" && scopeSeason !== null) {
    return `Spoilers · S${scopeSeason}${scopeEpisode !== null ? `E${scopeEpisode}` : ""}`;
  }
  if (scope === "ENDING") return "Ending spoilers";
  return "Spoilers";
}

export function ScopeBadge({
  scope,
  scopeSeason,
  scopeEpisode,
  className,
}: {
  scope: SpoilerScopeValue;
  scopeSeason: number | null;
  scopeEpisode: number | null;
  className?: string;
}) {
  const label = scopeLabel(scope, scopeSeason, scopeEpisode);
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground",
        className
      )}
    >
      <Lock className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: `mention-text.tsx`** (no dangerouslySetInnerHTML — bodies are plain text, mentions linkified by tokenizing):

```tsx
import Link from "next/link";

const MENTION_SPLIT_RE = /((?:^|[^\w@])@[a-z0-9_]{3,30}\b)/gi;

/** Renders a comment body, linkifying @username → /u/username. Plain text otherwise. */
export function MentionText({ body }: { body: string }) {
  const parts = body.split(MENTION_SPLIT_RE);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        const match = /^(.?)@([a-z0-9_]{3,30})$/i.exec(part);
        if (!match) return <span key={i}>{part}</span>;
        return (
          <span key={i}>
            {match[1]}
            <Link
              href={`/u/${match[2].toLowerCase()}`}
              className="text-foreground font-medium hover:underline"
            >
              @{match[2]}
            </Link>
          </span>
        );
      })}
    </span>
  );
}
```

- [ ] **Step 3: `locked-teaser.tsx`** (the anonymous conversion hook — progress-independent, edge-cache-safe):

```tsx
import { Lock } from "lucide-react";

export function LockedTeaser({
  count,
  mediaType,
}: {
  count: number;
  mediaType: "movie" | "series";
}) {
  if (count <= 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/40 px-4 py-3">
      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{count}</span>{" "}
        {count === 1 ? "comment unlocks" : "comments unlock"} as you{" "}
        {mediaType === "movie" ? "watch — mark it watched to join in" : "watch — log your progress to join in"}
        .
      </p>
    </div>
  );
}
```

- [ ] **Step 4: `report-dialog.tsx`:**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { reportComment } from "@/server/actions/comments";

const REASONS = [
  { value: "SPOILER", label: "Untagged spoiler" },
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "HATE_SPEECH", label: "Hate speech" },
  { value: "SPAM", label: "Spam or advertising" },
  { value: "OTHER", label: "Something else" },
] as const;

type ReasonValue = (typeof REASONS)[number]["value"];

export function ReportDialog({
  commentId,
  open,
  onOpenChange,
}: {
  commentId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState<ReasonValue>("SPOILER");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    const result = await reportComment({ commentId, reason, note: note || undefined });
    setSubmitting(false);
    if (result.ok) {
      toast.success("Report submitted. Thanks for keeping threads safe.");
      onOpenChange(false);
      setNote("");
    } else {
      toast.error(result.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report comment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={reason} onValueChange={(v) => setReason(v as ReasonValue)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Anything the moderators should know (optional)"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: `comment-composer.tsx`** (scope picker + the AI scope-suggestion confirm flow):

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createComment, type CreateCommentResult } from "@/server/actions/comments";
import type {
  DiscussionAnchor,
  SpoilerScopeValue,
} from "@/server/services/discussion/comment-schemas";
import { scopeLabel } from "./scope-badge";

interface ComposerProps {
  anchor: DiscussionAnchor;
  parentId?: number | null;
  /** Episode pages default the scope to that episode */
  defaultScope?: SpoilerScopeValue;
  defaultScopeSeason?: number | null;
  defaultScopeEpisode?: number | null;
  placeholder?: string;
  /** Prefill from a discussion starter */
  seedText?: string;
  onPublished?: () => void;
  onCancel?: () => void;
}

interface Suggestion {
  scope: SpoilerScopeValue;
  season: number | null;
  episode: number | null;
}

export function CommentComposer({
  anchor,
  parentId = null,
  defaultScope = "NONE",
  defaultScopeSeason = null,
  defaultScopeEpisode = null,
  placeholder = "Share your take…",
  seedText = "",
  onPublished,
  onCancel,
}: ComposerProps) {
  const [body, setBody] = useState(seedText);
  const [scope, setScope] = useState<SpoilerScopeValue>(defaultScope);
  const [submitting, setSubmitting] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  const isSeries = anchor.type === "series";
  const episodeScopeAvailable =
    isSeries && defaultScopeSeason !== null && defaultScopeEpisode !== null;

  const scopeForSubmit = (confirmed: boolean, accepted: Suggestion | null) => ({
    spoilerScope: accepted ? accepted.scope : scope,
    scopeSeason: accepted
      ? accepted.season
      : scope === "EPISODE"
        ? defaultScopeSeason
        : null,
    scopeEpisode: accepted
      ? accepted.episode
      : scope === "EPISODE"
        ? defaultScopeEpisode
        : null,
    confirmedScope: confirmed,
  });

  const submit = async (confirmed: boolean, accepted: Suggestion | null = null) => {
    if (body.trim().length < 2) return;
    setSubmitting(true);
    const result: CreateCommentResult = await createComment({
      anchor,
      parentId,
      body,
      ...scopeForSubmit(confirmed, accepted),
    });
    setSubmitting(false);
    if (result.status === "published") {
      setBody("");
      setSuggestion(null);
      toast.success("Comment posted");
      onPublished?.();
    } else if (result.status === "pending_review") {
      setBody("");
      setSuggestion(null);
      toast.info("Held for review — it'll appear once a moderator approves it.");
      onPublished?.();
    } else if (result.status === "scope_suggestion") {
      setSuggestion({
        scope: result.suggestedScope,
        season: result.suggestedSeason,
        episode: result.suggestedEpisode,
      });
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-card/40 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
      />

      {suggestion ? (
        // AI scope suggestion — user-adjustable pre-publish (spec §5)
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            This looks like it contains{" "}
            {scopeLabel(suggestion.scope, suggestion.season, suggestion.episode)?.toLowerCase() ??
              "spoilers"}
            . Tag it so unwatched readers don't see it?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={submitting} onClick={() => void submit(true, suggestion)}>
              Tag &amp; post
            </Button>
            <Button size="sm" variant="outline" disabled={submitting} onClick={() => void submit(true, null)}>
              Post as &quot;{scopeLabel(scope, defaultScopeSeason, defaultScopeEpisode) ?? "no spoilers"}&quot;
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
              Keep editing
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as SpoilerScopeValue)}>
            <SelectTrigger className="w-auto min-w-36 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No spoilers</SelectItem>
              {episodeScopeAvailable && (
                <SelectItem value="EPISODE">
                  Spoilers up to S{defaultScopeSeason}E{defaultScopeEpisode}
                </SelectItem>
              )}
              <SelectItem value="WATCHED">
                {isSeries ? "Whole-series spoilers" : "Spoilers (watched it)"}
              </SelectItem>
              <SelectItem value="ENDING">Ending spoilers</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            )}
            <Button
              size="sm"
              disabled={submitting || body.trim().length < 2}
              onClick={() => void submit(false)}
            >
              {submitting ? "Posting…" : "Post"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: `comment-item.tsx`:**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Flag, MessageCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteComment } from "@/server/actions/comments";
import type { CommentDto, CommentThreadDto } from "@/server/db/postgres/comments";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { CommentComposer } from "./comment-composer";
import { MentionText } from "./mention-text";
import { ReportDialog } from "./report-dialog";
import { ScopeBadge } from "./scope-badge";
import { cn } from "@/lib/utils";

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function CommentBody({ comment }: { comment: CommentDto }) {
  if (comment.status === "DELETED_BY_USER") {
    return <p className="text-sm text-muted-foreground italic">Comment deleted by author</p>;
  }
  if (comment.status === "PENDING_REVIEW" || comment.status === "FLAGGED") {
    return (
      <div>
        <p className="text-[11px] text-muted-foreground italic mb-1">Pending review — visible only to you</p>
        <p className="text-sm text-foreground/90 leading-relaxed"><MentionText body={comment.body} /></p>
      </div>
    );
  }
  return (
    <p className="text-sm text-foreground/90 leading-relaxed"><MentionText body={comment.body} /></p>
  );
}

function SingleComment({
  comment,
  viewerId,
  canInteract,
  onReply,
  onChanged,
  isReply = false,
}: {
  comment: CommentDto;
  viewerId: number | null;
  canInteract: boolean;
  onReply?: () => void;
  onChanged: () => void;
  isReply?: boolean;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const isOwn = viewerId !== null && comment.author?.id === viewerId;
  const username = comment.author?.username;

  const remove = async () => {
    const result = await deleteComment({ commentId: comment.id });
    if (result.ok) {
      toast.success("Comment deleted");
      onChanged();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div id={`comment-${comment.id}`} className={cn("flex gap-2.5", isReply && "pl-9")}>
      <div className="relative h-7 w-7 shrink-0 rounded-full overflow-hidden bg-muted">
        {comment.author?.image && (
          <Image src={comment.author.image} alt="" fill sizes="28px" className="object-cover" unoptimized />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
          {username ? (
            <Link href={`/u/${username}`} className="font-medium text-foreground/90 hover:underline">
              {username}
            </Link>
          ) : (
            <span className="font-medium text-foreground/70">
              {comment.author?.name ?? "former member"}
            </span>
          )}
          <span>{relativeTime(comment.createdAt)}</span>
          {comment.editedAt && <span>(edited)</span>}
          <ScopeBadge
            scope={comment.spoilerScope}
            scopeSeason={comment.scopeSeason}
            scopeEpisode={comment.scopeEpisode}
          />
        </div>
        <CommentBody comment={comment} />
        {comment.status === "PUBLISHED" && (
          <div className="flex items-center gap-1 -ml-2">
            {canInteract && onReply && (
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={onReply}>
                <MessageCircle className="h-3.5 w-3.5 mr-1" /> Reply
              </Button>
            )}
            {canInteract && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" aria-label="Comment actions">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {isOwn ? (
                    <DropdownMenuItem onClick={() => void remove()}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => setReportOpen(true)}>
                      <Flag className="h-3.5 w-3.5 mr-2" /> Report
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
      <ReportDialog commentId={comment.id} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}

export function CommentThread({
  thread,
  anchor,
  viewerId,
  canInteract,
  onChanged,
}: {
  thread: CommentThreadDto;
  anchor: DiscussionAnchor;
  viewerId: number | null;
  canInteract: boolean;
  onChanged: () => void;
}) {
  const [replying, setReplying] = useState(false);
  return (
    <div className="space-y-3">
      <SingleComment
        comment={thread}
        viewerId={viewerId}
        canInteract={canInteract}
        onReply={() => setReplying((r) => !r)}
        onChanged={onChanged}
      />
      {thread.replies.map((reply) => (
        <SingleComment
          key={reply.id}
          comment={reply}
          viewerId={viewerId}
          canInteract={canInteract}
          onReply={() => setReplying(true)}
          onChanged={onChanged}
          isReply
        />
      ))}
      {thread.replyCount > thread.replies.length && (
        <p className="pl-9 text-xs text-muted-foreground">
          {thread.replyCount - thread.replies.length} more replies hidden by your spoiler settings
        </p>
      )}
      {replying && (
        <div className="pl-9">
          <CommentComposer
            anchor={anchor}
            parentId={thread.id}
            placeholder="Write a reply…"
            onPublished={() => {
              setReplying(false);
              onChanged();
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: `discussion-starters.tsx`** (thread seeding — derived from EXISTING `ai_insights` rows, zero new LLM calls; neutral + content-grounded satisfies the Fable rule because the corpus is already content-only):

```tsx
"use client";

import { MessageSquarePlus } from "lucide-react";

/**
 * AI discussion prompts seeded from ai_insights (spoiler-free questions +
 * themes — the corpus the spec says we uniquely have). Clicking seeds the
 * composer. Rendered in cacheable HTML: prompts are content-derived, never
 * user-derived.
 */
export function DiscussionStarters({
  prompts,
  onPick,
}: {
  prompts: string[];
  onPick: (prompt: string) => void;
}) {
  if (prompts.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Discussion starters
      </p>
      <div className="flex flex-wrap gap-2">
        {prompts.slice(0, 4).map((prompt) => (
          <button
            key={prompt}
            onClick={() => onPick(prompt)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/60 transition-colors text-left"
          >
            <MessageSquarePlus className="h-3 w-3 shrink-0" />
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: `web-reactions.tsx`** (YouTube topComments decoration — clearly labeled, not part of the thread):

```tsx
import Image from "next/image";
import { z } from "zod";
import { Globe, ThumbsUp } from "lucide-react";

/** videos.top_comments JSON shape (see prisma Video.topComments comment). */
const TopCommentSchema = z.object({
  author: z.string().optional(),
  text: z.string().optional(),
  likeCount: z.number().optional(),
  authorProfileImageUrl: z.string().optional(),
});

export function parseTopComments(raw: unknown, limit = 3): Array<z.infer<typeof TopCommentSchema>> {
  if (!Array.isArray(raw)) return [];
  const parsed: Array<z.infer<typeof TopCommentSchema>> = [];
  for (const item of raw) {
    const result = TopCommentSchema.safeParse(item);
    if (result.success && result.data.text) parsed.push(result.data);
    if (parsed.length >= limit) break;
  }
  return parsed;
}

/** "Reactions from the web" — trailer top comments as cold-thread decoration. */
export function WebReactions({ raw }: { raw: unknown }) {
  const comments = parseTopComments(raw);
  if (comments.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Globe className="h-3 w-3" /> Reactions from the web
      </p>
      <div className="space-y-2">
        {comments.map((c, i) => (
          <div key={i} className="flex gap-2.5 rounded-lg bg-muted/30 px-3 py-2">
            <div className="relative h-5 w-5 shrink-0 rounded-full overflow-hidden bg-muted mt-0.5">
              {c.authorProfileImageUrl && (
                <Image src={c.authorProfileImageUrl} alt="" fill sizes="20px" className="object-cover" unoptimized />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-foreground/80 line-clamp-3">{c.text}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                {c.author ?? "YouTube viewer"}
                {typeof c.likeCount === "number" && c.likeCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <ThumbsUp className="h-2.5 w-2.5" /> {c.likeCount}
                  </span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Before relying on the field names, verify the actual stored shape: `docker exec movie-browser-postgres psql -U postgres -d moviebrowser -c "SELECT top_comments->0 FROM videos WHERE top_comments IS NOT NULL LIMIT 1;"` — adjust `TopCommentSchema` keys to match (schema comment says `{ author, authorChannel, text, likeCount, publishedAt, isCreatorHeart }`).

- [ ] **Step 9: `comment-list-client.tsx`** (the client island — SSR-renders the anon tier from props, upgrades to gated tier after mount for signed-in users):

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadComments } from "@/server/actions/comment-reads";
import type { CommentPageDto } from "@/server/db/postgres/comments";
import type {
  CommentCursor,
  DiscussionAnchor,
  SpoilerScopeValue,
} from "@/server/services/discussion/comment-schemas";
import { CommentComposer } from "./comment-composer";
import { CommentThread } from "./comment-item";
import { DiscussionStarters } from "./discussion-starters";
import { LockedTeaser } from "./locked-teaser";

interface CommentListClientProps {
  anchor: DiscussionAnchor;
  /** Anon tier (NONE-scope only) — rendered into the cacheable HTML */
  initialPage: CommentPageDto;
  lockedCount: number;
  starters: string[];
  defaultScope?: SpoilerScopeValue;
  defaultScopeSeason?: number | null;
  defaultScopeEpisode?: number | null;
}

/**
 * Two-tier list (spec invariant 8): the SSR pass renders ONLY the
 * progress-independent anon tier passed as props; after hydration, signed-in
 * viewers refetch the gated tier via a server action POST (never edge-cached).
 */
export function CommentListClient({
  anchor,
  initialPage,
  lockedCount,
  starters,
  defaultScope = "NONE",
  defaultScopeSeason = null,
  defaultScopeEpisode = null,
}: CommentListClientProps) {
  const { data: session, status } = useSession();
  const viewerId = session?.user ? Number(session.user.dbId ?? 0) || null : null;
  const [page, setPage] = useState<CommentPageDto>(initialPage);
  const [extraPages, setExtraPages] = useState<CommentPageDto[]>([]);
  const [seed, setSeed] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const signedIn = status === "authenticated";

  const refresh = useCallback(() => {
    void loadComments({ anchor, cursor: null }).then((fresh) => {
      setPage(fresh);
      setExtraPages([]);
    });
  }, [anchor]);

  // Upgrade anon tier → gated tier once we know the viewer is signed in.
  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn, refresh]);

  const allRoots = [...page.roots, ...extraPages.flatMap((p) => p.roots)];
  const lastCursor: CommentCursor | null =
    extraPages.length > 0 ? extraPages[extraPages.length - 1].nextCursor : page.nextCursor;

  const loadMore = async () => {
    if (!lastCursor) return;
    setLoadingMore(true);
    const next = await loadComments({ anchor, cursor: lastCursor });
    setExtraPages((prev) => [...prev, next]);
    setLoadingMore(false);
  };

  return (
    <div className="space-y-5">
      {signedIn ? (
        <CommentComposer
          key={seed} // re-mount to apply starter seed text
          anchor={anchor}
          seedText={seed}
          defaultScope={defaultScope}
          defaultScopeSeason={defaultScopeSeason}
          defaultScopeEpisode={defaultScopeEpisode}
          onPublished={refresh}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Sign in to join the discussion — comments are spoiler-gated to your watch progress.
        </p>
      )}

      {allRoots.length === 0 && <DiscussionStarters prompts={starters} onPick={setSeed} />}
      {!signedIn && <LockedTeaser count={lockedCount} mediaType={anchor.type} />}

      <div className="space-y-5">
        {allRoots.map((thread) => (
          <CommentThread
            key={thread.id}
            thread={thread}
            anchor={anchor}
            viewerId={viewerId}
            canInteract={signedIn}
            onChanged={refresh}
          />
        ))}
      </div>

      {lastCursor && (
        <Button variant="outline" size="sm" className="w-full" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Show more comments"}
        </Button>
      )}
    </div>
  );
}
```

`session.user.dbId`: check what the session callback exposes (`grep -n "dbId\|googleId" src/lib/auth.ts src/types/next-auth.d.ts`). If the numeric PG id isn't on the session, derive `isOwn` differently: have `loadComments` return `viewerId` alongside the page (add `viewerId: number | null` to its return) and use that — do NOT guess session fields.

- [ ] **Step 10: `discussion-section.tsx`** (RSC for detail pages) and `index.ts`:

```tsx
import { MessagesSquare } from "lucide-react";
import { prisma, Prisma } from "@/server/db/postgres";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { getLockedCommentCount, getPublicCommentPage } from "@/server/db/postgres/comments";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { CommentListClient } from "./comment-list-client";
import { WebReactions } from "./web-reactions";

interface DiscussionSectionProps {
  anchor: DiscussionAnchor;
  /** spoiler-free AI questions/themes for starters (from the page's cached getAIData) */
  starters: string[];
  className?: string;
  children?: React.ReactNode; // e.g. episode-thread links on series pages
}

/**
 * Detail-page discussion section. EVERYTHING rendered here server-side is
 * progress-independent (anon tier + locked count + web reactions) — safe for
 * ISR + CloudFront (spec invariant 8). The gated tier hydrates client-side.
 * No dynamic APIs (headers/cookies) — keep it that way or ISR dies for the
 * whole route (performance.md recipe item 3).
 */
export async function DiscussionSection({
  anchor,
  starters,
  className,
  children,
}: DiscussionSectionProps) {
  const [initialPage, lockedCount, topVideo] = await Promise.all([
    getPublicCommentPage(anchor),
    getLockedCommentCount(anchor),
    prisma.video.findFirst({
      where: {
        ...(anchor.type === "movie" ? { movieId: anchor.movieId } : { seriesId: anchor.seriesId }),
        topComments: { not: Prisma.DbNull },
      },
      orderBy: { viewCount: "desc" },
      select: { topComments: true },
    }),
  ]);

  return (
    <section className={className} id="discussion">
      <div className="px-4 md:px-8 lg:px-12 space-y-5">
        <SectionHeading icon={<MessagesSquare className="h-5 w-5" />}>Discussion</SectionHeading>
        {children}
        {topVideo?.topComments != null && <WebReactions raw={topVideo.topComments} />}
        <CommentListClient
          anchor={anchor}
          initialPage={initialPage}
          lockedCount={lockedCount}
          starters={starters}
          defaultScope="NONE"
        />
      </div>
    </section>
  );
}
```

`index.ts`:

```typescript
export { DiscussionSection } from "./discussion-section";
export { CommentListClient } from "./comment-list-client";
export { CommentComposer } from "./comment-composer";
export { CommentThread } from "./comment-item";
export { LockedTeaser } from "./locked-teaser";
export { WebReactions, parseTopComments } from "./web-reactions";
export { DiscussionStarters } from "./discussion-starters";
export { ScopeBadge, scopeLabel } from "./scope-badge";
export { MentionText } from "./mention-text";
export { ReportDialog } from "./report-dialog";
export { EpisodePicker } from "./episode-picker";
export { ThreadSummaryCard } from "./thread-summary-card";
export { UserModerationMenu } from "./user-moderation-menu";
```

(Two exports — `EpisodePicker`, `ThreadSummaryCard`, `UserModerationMenu` — land in Tasks 13–15; create the barrel lines then, or create stub-free now by omitting and appending later. Prefer appending in their tasks.)

- [ ] **Step 11: Typecheck + lint** — `yarn typecheck && yarn lint` → PASS.
- [ ] **Step 12: Commit**

```bash
git add src/components/features/discussion/
git commit -m "feat(discussion): thread UI — composer with AI scope confirm, gated list, teaser, starters, web reactions"
```

---

### Task 11: Wire discussion sections into movie + series detail pages

Reuses the Phase 0 review-display placement pattern (reviews render on detail pages below the fold); the discussion section slots directly after it (or after `SimilarSection` if Phase 0 placed reviews elsewhere).

**Files:**
- Modify: `src/app/movie/[...params]/page.tsx`
- Modify: `src/app/series/[...params]/page.tsx`

- [ ] **Step 1: Movie page.** In `MovieContentAsync` (which already has `movie` and `aiData` in scope), add after the `<SimilarSection>` Suspense block:

```tsx
{/* Discussion — anon tier + locked teaser are progress-independent (ISR-safe);
    gated tier hydrates client-side. */}
<Suspense fallback={null}>
  <DiscussionSection
    anchor={{ type: "movie", movieId: movie.id }}
    starters={(aiSummary?.aiQuestions ?? []).slice(0, 4)}
    className="mt-8 md:mt-12"
  />
</Suspense>
```

Import: `import { DiscussionSection } from "@/components/features/discussion";`

- [ ] **Step 2: Series page.** Same pattern in the series content async component (`src/app/series/[...params]/page.tsx` mirrors the movie page structure — find the equivalent of `MovieContentAsync`). Series detail page anchors at SERIES level (`seasonNumber: null, episodeNumber: null`) and links to per-episode threads:

```tsx
<Suspense fallback={null}>
  <DiscussionSection
    anchor={{ type: "series", seriesId: series.id, seasonNumber: null, episodeNumber: null }}
    starters={(aiSummary?.aiQuestions ?? []).slice(0, 4)}
    className="mt-8 md:mt-12"
  >
    <EpisodeThreadsLink seriesId={series.id} seriesName={series.name} />
  </DiscussionSection>
</Suspense>
```

with a small server component in the same file (or inline):

```tsx
import { getMediaPath } from "@/lib/utils";
import Link from "next/link";

function EpisodeThreadsLink({ seriesId, seriesName }: { seriesId: number; seriesName: string }) {
  return (
    <Link
      href={`${getMediaPath("series", seriesId, seriesName)}/discuss/s1e1`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      Browse per-episode discussions →
    </Link>
  );
}
```

- [ ] **Step 3: ISR safety check.** Confirm neither page gained a dynamic API: `grep -n "headers()\|cookies()\|searchParams" src/app/movie/[...params]/page.tsx src/app/series/[...params]/page.tsx` — only the existing NODE_ENV-gated `__e2e_error` block may touch `searchParams`.

- [ ] **Step 4: Verify locally** — `yarn dev`, open a movie page: Discussion section renders, anon shows teaser + sign-in CTA; signed in, posting works end-to-end (gate runs — needs AWS creds locally; without them the gate fails → comment lands `PENDING_REVIEW`, which is correct fail-closed behavior and worth observing once).

- [ ] **Step 5: Commit**

```bash
git add src/app/movie/[...params]/page.tsx src/app/series/[...params]/page.tsx
git commit -m "feat(discussion): discussion sections on movie + series detail pages"
```

---

### Task 12: Proxy authority for /series/:id/:slug/discuss/sXeY

**The footgun this task exists for:** `MEDIA_DETAIL_RE` in `src/server/proxy/media-resolver.ts` already matches `/series/123/anything/...` and `decideMediaRoute` 308s any non-canonical pathname to `/series/123/<slug>` — so without resolver awareness, every discuss URL would redirect AWAY to the detail page. The resolver must (a) recognize the discuss suffix, (b) canonicalize the slug part while PRESERVING the suffix, (c) 404 garbage suffixes pre-render (the catch-all route has `loading.tsx`, so the page itself can never emit a real 404 — performance.md "Status codes").

**Files:**
- Modify: `src/server/proxy/media-resolver.ts`
- Modify: `src/server/proxy/media-resolver.test.ts`

- [ ] **Step 1: Write the failing tests** (add to the existing test file, following its current style):

```typescript
describe("discuss paths", () => {
  it("parses a canonical discuss path", () => {
    expect(parseMediaDetailPath("/series/1396/breaking-bad/discuss/s2e5")).toEqual({
      kind: "media", mediaType: "series", id: 1396, discuss: { season: 2, episode: 5 },
    });
  });
  it("parses a slugless discuss path", () => {
    expect(parseMediaDetailPath("/series/1396/discuss/s2e5")).toEqual({
      kind: "media", mediaType: "series", id: 1396, discuss: { season: 2, episode: 5 },
    });
  });
  it("rejects malformed discuss suffixes as invalid (pre-render 404)", () => {
    expect(parseMediaDetailPath("/series/1396/breaking-bad/discuss/nonsense")).toEqual({ kind: "invalid" });
    expect(parseMediaDetailPath("/series/1396/discuss/s2")).toEqual({ kind: "invalid" });
    expect(parseMediaDetailPath("/movie/603/the-matrix/discuss/s1e1")).toEqual({ kind: "invalid" });
  });
  it("redirects wrong-slug discuss paths to canonical, preserving the suffix", () => {
    const decision = decideMediaRoute("/series/1396/wrong-slug/discuss/s2e5", "series", 1396, "breaking-bad", { season: 2, episode: 5 });
    expect(decision).toEqual({ action: "redirect", location: "/series/1396/breaking-bad/discuss/s2e5" });
  });
  it("passes through the canonical discuss path", () => {
    const decision = decideMediaRoute("/series/1396/breaking-bad/discuss/s2e5", "series", 1396, "breaking-bad", { season: 2, episode: 5 });
    expect(decision).toEqual({ action: "next", verified: true });
  });
});
```

(Adjust to `decideMediaRoute`'s real signature — the new `discuss` argument is added in Step 3.)

- [ ] **Step 2: Run** `npx vitest run src/server/proxy/media-resolver.test.ts` → new cases FAIL.

- [ ] **Step 3: Implement.** In `media-resolver.ts`:

1. Extend the parsed type:

```typescript
export interface DiscussSuffix {
  season: number;
  episode: number;
}

export type ParsedMediaPath =
  | { kind: "media"; mediaType: MediaType; id: number; discuss?: DiscussSuffix }
  | { kind: "invalid" };
```

2. Add a discuss regex and parse it BEFORE the generic detail regex inside `parseMediaDetailPath`:

```typescript
// /series/123/some-slug/discuss/s2e5 or /series/123/discuss/s2e5
const DISCUSS_RE = /^\/series\/(\d+)(?:\/[a-z0-9-]+)?\/discuss\/s(\d{1,2})e(\d{1,3})$/;
// any /movie|series/<id>/.../discuss/... that did NOT match DISCUSS_RE is garbage
const DISCUSS_PREFIX_RE = /^\/(movie|series)\/\d+(?:\/[^/]+)?\/discuss(\/|$)/;
```

```typescript
export function parseMediaDetailPath(pathname: string): ParsedMediaPath | null {
  const discussMatch = DISCUSS_RE.exec(pathname);
  if (discussMatch) {
    const id = Number(discussMatch[1]);
    if (!Number.isSafeInteger(id) || id <= 0 || id > PG_INT4_MAX) return { kind: "invalid" };
    return {
      kind: "media", mediaType: "series", id,
      discuss: { season: Number(discussMatch[2]), episode: Number(discussMatch[3]) },
    };
  }
  if (DISCUSS_PREFIX_RE.test(pathname)) return { kind: "invalid" };
  // …existing MEDIA_DETAIL_RE logic unchanged…
}
```

3. Thread `discuss` through to canonicalization — extend `decideMediaRoute` with a fifth optional param and suffix the canonical path:

```typescript
export function decideMediaRoute(
  pathname: string,
  mediaType: MediaType,
  id: number,
  resolved: ResolvedSlug | null,
  discuss?: DiscussSuffix
): MediaRouteDecision {
  if (resolved === null) return { action: "next", verified: false };
  if (resolved === NOT_FOUND) return { action: "not_found" };
  const suffix = discuss ? `/discuss/s${discuss.season}e${discuss.episode}` : "";
  const canonical = canonicalMediaPath(mediaType, id, resolved) + suffix;
  if (pathname !== canonical) return { action: "redirect", location: canonical };
  return { action: "next", verified: true };
}
```

4. In `src/proxy.ts`, pass `parsed.discuss` everywhere `decideMediaRoute` is called (both the LRU-hit path via `applyMediaDecision` and the async `resolveAndApply` path — add a `discuss` parameter to both helpers).

**Accepted limitation (document in a code comment):** the proxy verifies the SERIES exists (404/308 authority) but not that S{s}E{e} exists — that would cost an extra episodes query per request. A discuss page for a nonexistent episode renders the not-found UI with HTTP 200 (soft-404), same fallback class as proxy-bypassing requests on detail pages. Discuss pages are only ever linked for episodes that exist; revisit only if Search Console flags it.

- [ ] **Step 4: Run resolver tests + full suite** — `npx vitest run src/server/proxy/media-resolver.test.ts` → PASS (old cases must stay green).
- [ ] **Step 5: Commit**

```bash
git add src/server/proxy/media-resolver.ts src/server/proxy/media-resolver.test.ts src/proxy.ts
git commit -m "feat(proxy): canonical 308/404 authority for per-episode discuss URLs"
```

---

### Task 13: Per-episode discussion SEO pages

Routed through the EXISTING `series/[...params]` catch-all (Next.js forbids a sibling `[seriesId]` dynamic segment next to `[...params]`). The page branches on a parsed discuss suffix. ISR comes free: the route already has `export const revalidate = 3600` + `generateStaticParams() => []`. The discuss branch must add NO dynamic APIs.

**Files:**
- Create: `src/app/series/[...params]/discuss-page.tsx`
- Create: `src/components/features/discussion/episode-picker.tsx`
- Modify: `src/app/series/[...params]/page.tsx`

- [ ] **Step 1: Write `episode-picker.tsx`** (server-renderable — pure links, crawlable nav):

```tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EpisodeNavItem {
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
}

interface EpisodePickerProps {
  basePath: string; // `${getMediaPath("series", id, name)}` — links append /discuss/sXeY
  episodes: EpisodeNavItem[]; // all episodes, ordered (s asc, e asc)
  currentSeason: number;
  currentEpisode: number;
}

export function EpisodePicker({ basePath, episodes, currentSeason, currentEpisode }: EpisodePickerProps) {
  const idx = episodes.findIndex(
    (e) => e.seasonNumber === currentSeason && e.episodeNumber === currentEpisode
  );
  const prev = idx > 0 ? episodes[idx - 1] : null;
  const next = idx >= 0 && idx < episodes.length - 1 ? episodes[idx + 1] : null;
  const seasons = [...new Set(episodes.map((e) => e.seasonNumber))];
  const inSeason = episodes.filter((e) => e.seasonNumber === currentSeason);
  const href = (e: EpisodeNavItem) => `${basePath}/discuss/s${e.seasonNumber}e${e.episodeNumber}`;

  return (
    <nav aria-label="Episode discussions" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {prev ? (
          <Link href={href(prev)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-10">
            <ChevronLeft className="h-4 w-4" /> S{prev.seasonNumber}E{prev.episodeNumber}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={href(next)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-10">
            S{next.seasonNumber}E{next.episodeNumber} <ChevronRight className="h-4 w-4" />
          </Link>
        ) : <span />}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {seasons.map((s) => {
          const first = episodes.find((e) => e.seasonNumber === s);
          if (!first) return null;
          return (
            <Link
              key={s}
              href={href(first)}
              className={cn(
                "shrink-0 rounded-full border border-border px-3 py-1.5 text-xs transition-colors",
                s === currentSeason ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              Season {s}
            </Link>
          );
        })}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {inSeason.map((e) => (
          <Link
            key={e.episodeNumber}
            href={href(e)}
            title={e.name ?? undefined}
            className={cn(
              "shrink-0 inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-border px-2 text-xs transition-colors",
              e.episodeNumber === currentEpisode
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            {e.episodeNumber}
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

Append `export { EpisodePicker } from "./episode-picker";` to the discussion barrel.

- [ ] **Step 2: Write `discuss-page.tsx`** (RSC — data, JSON-LD, layout; NOT a route file, imported by `page.tsx`):

```tsx
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/server/db/postgres";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { breadcrumbList, omitEmpty } from "@/lib/seo/jsonld";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import {
  getLockedCommentCount,
  getPublicCommentPage,
  getPublishedCommentCount,
} from "@/server/db/postgres/comments";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { CommentListClient } from "@/components/features/discussion/comment-list-client";
import { EpisodePicker, type EpisodeNavItem } from "@/components/features/discussion/episode-picker";
import { ThreadSummaryCard } from "@/components/features/discussion/thread-summary-card";

export interface DiscussParams {
  seriesId: number;
  season: number;
  episode: number;
}

/** Parse ["1396","breaking-bad","discuss","s2e5"] | ["1396","discuss","s2e5"] → DiscussParams */
export function parseDiscussParams(routeParams: string[]): DiscussParams | null {
  const last = routeParams[routeParams.length - 1];
  const beforeLast = routeParams[routeParams.length - 2];
  if (beforeLast !== "discuss" || routeParams.length < 3 || routeParams.length > 4) return null;
  const id = parseInt(routeParams[0], 10);
  const match = /^s(\d{1,2})e(\d{1,3})$/.exec(last ?? "");
  if (isNaN(id) || !match) return null;
  return { seriesId: id, season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
}

// One PG round trip for series + all episode nav data; cache() dedups
// between generateMetadata and the page render (same pattern as getMovie).
export const getDiscussData = cache(async (seriesId: number) => {
  return prisma.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      name: true,
      seasons: {
        where: { seasonNumber: { gt: 0 } },
        orderBy: { seasonNumber: "asc" },
        select: {
          seasonNumber: true,
          episodes: {
            orderBy: { episodeNumber: "asc" },
            select: { episodeNumber: true, name: true, overview: true, airDate: true },
          },
        },
      },
    },
  });
});

export async function generateDiscussMetadata(p: DiscussParams): Promise<Metadata> {
  const series = await getDiscussData(p.seriesId);
  const episode = series?.seasons
    .find((s) => s.seasonNumber === p.season)
    ?.episodes.find((e) => e.episodeNumber === p.episode);
  if (!series) return { title: "Discussion Not Found" };
  const epName = episode?.name ? ` — "${episode.name}"` : "";
  const title = `${series.name} S${p.season}E${p.episode}${epName} Discussion | ${SITE_NAME}`;
  const description = truncateAtWord(
    `Spoiler-safe discussion of ${series.name} Season ${p.season} Episode ${p.episode}${epName}. Comments unlock with your watch progress — no spoilers before you're ready. Threads never archive.`,
    160
  );
  const canonical = `${SITE_URL}${getMediaPath("series", series.id, series.name)}/discuss/s${p.season}e${p.episode}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export async function EpisodeDiscussPage({ params }: { params: DiscussParams }) {
  const series = await getDiscussData(params.seriesId);
  const season = series?.seasons.find((s) => s.seasonNumber === params.season);
  const episode = season?.episodes.find((e) => e.episodeNumber === params.episode);
  if (!series || !episode) {
    // Soft-404 fallback (proxy verified the SERIES; episode existence is
    // page-level — see media-resolver comment). Renders not-found UI.
    notFound();
  }

  const anchor: DiscussionAnchor = {
    type: "series",
    seriesId: series.id,
    seasonNumber: params.season,
    episodeNumber: params.episode,
  };
  const basePath = getMediaPath("series", series.id, series.name);
  const canonicalUrl = `${SITE_URL}${basePath}/discuss/s${params.season}e${params.episode}`;

  // Anon-cacheable tier only (invariant 8): NONE-scope comments + counts.
  const [initialPage, lockedCount, publishedCount] = await Promise.all([
    getPublicCommentPage(anchor),
    getLockedCommentCount(anchor),
    getPublishedCommentCount(anchor),
  ]);

  const episodeNav: EpisodeNavItem[] = series.seasons.flatMap((s) =>
    s.episodes.map((e) => ({
      seasonNumber: s.seasonNumber,
      episodeNumber: e.episodeNumber,
      name: e.name,
    }))
  );

  // DiscussionForumPosting structured data (Google's discussion-forum format),
  // fed ONLY from the spoiler-free tier — exactly what crawlers may index.
  const jsonLd = omitEmpty({
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: `${series.name} S${params.season}E${params.episode}${episode.name ? ` — ${episode.name}` : ""} discussion`,
    url: canonicalUrl,
    datePublished: episode.airDate ? episode.airDate.toISOString() : undefined,
    commentCount: publishedCount,
    author: { "@type": "Organization", name: SITE_NAME },
    comment: initialPage.roots.slice(0, 10).map((c) => ({
      "@type": "Comment",
      text: c.body,
      dateCreated: c.createdAt,
      author: { "@type": "Person", name: c.author?.username ?? c.author?.name ?? "Member" },
    })),
    about: {
      "@type": "TVEpisode",
      name: episode.name ?? `Episode ${params.episode}`,
      episodeNumber: params.episode,
      partOfSeason: { "@type": "TVSeason", seasonNumber: params.season },
      partOfSeries: { "@type": "TVSeries", name: series.name, url: `${SITE_URL}${basePath}` },
    },
  });
  const breadcrumbs = breadcrumbList([
    { name: "Home", path: "/" },
    { name: series.name, path: basePath },
    { name: `S${params.season}E${params.episode} Discussion` },
  ]);

  return (
    <PageMain className="max-w-3xl mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />

      <header className="space-y-2 mb-6">
        <Link href={basePath} className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide">
          {series.name}
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          S{params.season}E{params.episode}
          {episode.name ? ` · ${episode.name}` : ""}
        </h1>
        {episode.overview && (
          <p className="text-sm text-muted-foreground line-clamp-3">{episode.overview}</p>
        )}
      </header>

      <div className="space-y-6">
        <EpisodePicker
          basePath={basePath}
          episodes={episodeNav}
          currentSeason={params.season}
          currentEpisode={params.episode}
        />

        <SectionHeading>Discussion</SectionHeading>
        <ThreadSummaryCard anchor={anchor} />
        <CommentListClient
          anchor={anchor}
          initialPage={initialPage}
          lockedCount={lockedCount}
          starters={[]}
          defaultScope="EPISODE"
          defaultScopeSeason={params.season}
          defaultScopeEpisode={params.episode}
        />
      </div>
    </PageMain>
  );
}
```

(`ThreadSummaryCard` lands in Task 14 — if executing strictly in order, add it there and leave this import commented until then, or do Task 14 first. Recommended: implement Task 14's component before wiring this file, then both compile together. Check the `Season` model's field name with `grep -n "model Season" -A 12 prisma/schema.prisma` — adjust `seasonNumber` if it differs.)

- [ ] **Step 3: Branch the catch-all.** In `src/app/series/[...params]/page.tsx`:

In `generateMetadata`, FIRST thing after awaiting params:

```typescript
const discuss = parseDiscussParams(routeParams);
if (discuss) return generateDiscussMetadata(discuss);
```

In the default export, same branch before the existing logic:

```typescript
const discuss = parseDiscussParams(routeParams);
if (discuss) return <EpisodeDiscussPage params={discuss} />;
```

Imports: `import { EpisodeDiscussPage, generateDiscussMetadata, parseDiscussParams } from "./discuss-page";`

- [ ] **Step 4: Verify ISR + tiers locally** (the full performance.md recipe):

```bash
yarn build && yarn start -p 3111 &
sleep 8
# 1) ISR: second hit must be fast & cached
curl -so /dev/null -w 'first: %{time_total}\n' http://localhost:3111/series/1396/breaking-bad/discuss/s2e5
curl -so /dev/null -w 'second: %{time_total}\n' http://localhost:3111/series/1396/breaking-bad/discuss/s2e5
ls .next/server/app/series/ | head   # route-cache entries present
# 2) Proxy authority: wrong slug 308s, garbage suffix 404s
curl -so /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3111/series/1396/wrong/discuss/s2e5
curl -so /dev/null -w '%{http_code}\n' http://localhost:3111/series/1396/breaking-bad/discuss/garbage
# 3) Invariant 8: anon HTML contains NO gated comment bodies
curl -s http://localhost:3111/series/1396/breaking-bad/discuss/s2e5 | grep -c "comment-" || true
```

(Use a series id that exists in the local DB. Remember `lsof -ti :3111` first — a half-killed old next-server invalidates the test matrix.)

- [ ] **Step 5: Commit**

```bash
git add src/app/series/[...params]/discuss-page.tsx src/app/series/[...params]/page.tsx src/components/features/discussion/episode-picker.tsx src/components/features/discussion/index.ts
git commit -m "feat(discussion): per-episode SEO discussion pages with DiscussionForumPosting JSON-LD"
```

---

### Task 14: AI thread summary "safe to your progress"

On-demand (button click), input = ONLY comments visible at the viewer's gate context (so the summary cannot leak past their progress, by construction), cached in PG per (anchor, scope-bucket), regenerated only when new comments exist. Requires sign-in to trigger generation (cost control); cached summaries serve to anyone in the same bucket.

**Files:**
- Create: `src/server/services/discussion/thread-summary.ts`
- Create: `src/server/actions/thread-summary.ts`
- Create: `src/components/features/discussion/thread-summary-card.tsx`
- Test: `src/server/services/discussion/thread-summary.test.ts`

- [ ] **Step 1: Write the failing input-filter tests:**

```typescript
import { describe, it, expect } from "vitest";
import { filterSummaryInput, type SummaryInputComment } from "./thread-summary";
import { ANON_GATE_CONTEXT, type ViewerGateContext } from "./spoiler-gate";

const comments: SummaryInputComment[] = [
  { body: "loved the cinematography", spoilerScope: "NONE", scopeSeason: null, scopeEpisode: null, status: "PUBLISHED" },
  { body: "that S2E6 twist!!", spoilerScope: "EPISODE", scopeSeason: 2, scopeEpisode: 6, status: "PUBLISHED" },
  { body: "the ending broke me", spoilerScope: "ENDING", scopeSeason: null, scopeEpisode: null, status: "PUBLISHED" },
  { body: "held for review", spoilerScope: "NONE", scopeSeason: null, scopeEpisode: null, status: "PENDING_REVIEW" },
];

describe("filterSummaryInput", () => {
  it("anon bucket gets only NONE + PUBLISHED", () => {
    const out = filterSummaryInput(comments, ANON_GATE_CONTEXT, "series");
    expect(out.map((c) => c.body)).toEqual(["loved the cinematography"]);
  });
  it("mid-watch viewer gets watermark-visible comments, never ENDING", () => {
    const ctx: ViewerGateContext = { loggedIn: true, movieWatched: false, seriesCompleted: false, maxSeason: 2, maxEpisode: 6 };
    const out = filterSummaryInput(comments, ctx, "series");
    expect(out.map((c) => c.body)).toEqual(["loved the cinematography", "that S2E6 twist!!"]);
  });
  it("non-PUBLISHED never feeds the summary, even when scope-visible", () => {
    const ctx: ViewerGateContext = { loggedIn: true, movieWatched: false, seriesCompleted: true, maxSeason: 9, maxEpisode: 9 };
    const out = filterSummaryInput(comments, ctx, "series");
    expect(out.some((c) => c.status !== "PUBLISHED")).toBe(false);
    expect(out).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/server/services/discussion/thread-summary.test.ts` → FAIL.

- [ ] **Step 3: Implement `thread-summary.ts`:**

```typescript
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { callBedrockFlex } from "@/server/services/enrichment/bedrock-flex";
import { anchorKey, type DiscussionAnchor, type SpoilerScopeValue } from "./comment-schemas";
import {
  isScopeVisible,
  scopeKeyFor,
  type ViewerGateContext,
} from "./spoiler-gate";
import { anchorWhere, PUBLIC_COMMENTS_WHERE } from "@/server/db/postgres/comments";

export interface SummaryInputComment {
  body: string;
  spoilerScope: SpoilerScopeValue;
  scopeSeason: number | null;
  scopeEpisode: number | null;
  status: string;
}

const MIN_COMMENTS = 5;
const MAX_INPUT_COMMENTS = 150;
const REGEN_MIN_AGE_MS = 6 * 60 * 60 * 1000; // don't re-burn tokens more than 4x/day per bucket

/**
 * Pure + exported for tests: the spoiler-safety property of the whole
 * feature lives in this filter — summary input ⊆ what the viewer may read.
 */
export function filterSummaryInput(
  comments: SummaryInputComment[],
  ctx: ViewerGateContext,
  anchorKind: "movie" | "series"
): SummaryInputComment[] {
  return comments.filter(
    (c) =>
      c.status === "PUBLISHED" &&
      isScopeVisible(c.spoilerScope, c.scopeSeason, c.scopeEpisode, ctx, anchorKind)
  );
}

const SUMMARY_SYSTEM_PROMPT = `You summarize a discussion thread about a movie or TV episode in 3-5 neutral sentences.
Rules:
- Describe only what commenters discussed: recurring themes, debates, reactions.
- Never mention, quote by name, judge, or characterize any individual commenter.
- Do not add plot information that is not present in the comments.
- Plain prose, no lists, no headings, no preamble.`;

export type ThreadSummaryResult =
  | { status: "ok"; summary: string; commentCount: number; cached: boolean }
  | { status: "not_enough_comments" }
  | { status: "error" };

export async function getOrCreateThreadSummary(
  anchor: DiscussionAnchor,
  ctx: ViewerGateContext,
  title: string
): Promise<ThreadSummaryResult> {
  const aKey = anchorKey(anchor);
  const sKey = scopeKeyFor(ctx, anchor.type);

  // Visible candidate set: newest first, bounded. The gate predicate is
  // re-applied in-memory by filterSummaryInput (single source of truth).
  const rows = await prisma.comment.findMany({
    where: { AND: [anchorWhere(anchor), PUBLIC_COMMENTS_WHERE] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_INPUT_COMMENTS,
    select: { id: true, body: true, spoilerScope: true, scopeSeason: true, scopeEpisode: true, status: true },
  });
  const visible = filterSummaryInput(
    rows.map((r) => ({ ...r, spoilerScope: r.spoilerScope as SpoilerScopeValue })),
    ctx,
    anchor.type
  );
  if (visible.length < MIN_COMMENTS) return { status: "not_enough_comments" };

  const newestVisibleId = rows.find((r) =>
    visible.some((v) => v.body === r.body)
  )?.id ?? rows[0].id;

  const cached = await prisma.threadSummary.findUnique({
    where: { anchorKey_scopeKey: { anchorKey: aKey, scopeKey: sKey } },
  });
  const fresh =
    cached &&
    (cached.newestCommentId === newestVisibleId ||
      Date.now() - cached.generatedAt.getTime() < REGEN_MIN_AGE_MS);
  if (cached && fresh) {
    return { status: "ok", summary: cached.summary, commentCount: cached.commentCount, cached: true };
  }

  try {
    const input = visible
      .map((c) => `- [${c.spoilerScope}] ${c.body.slice(0, 400)}`)
      .join("\n");
    const result = await callBedrockFlex({
      messages: [{ role: "user", text: `Thread: discussion of "${title}"\nComments:\n${input}` }],
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      maxTokens: 250,
      temperature: 0.2,
      useFlex: false,
    });
    const summary = result.output.trim();
    if (!summary) return { status: "error" };
    await prisma.threadSummary.upsert({
      where: { anchorKey_scopeKey: { anchorKey: aKey, scopeKey: sKey } },
      create: {
        anchorKey: aKey, scopeKey: sKey, summary,
        commentCount: visible.length, newestCommentId: newestVisibleId,
        modelId: "moonshotai.kimi-k2.5",
      },
      update: {
        summary, commentCount: visible.length, newestCommentId: newestVisibleId,
        generatedAt: new Date(),
      },
    });
    return { status: "ok", summary, commentCount: visible.length, cached: false };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "threadSummary", anchorKey: aKey, error: error instanceof Error ? error.message : String(error) },
      "thread summary generation failed"
    );
    return { status: "error" };
  }
}
```

- [ ] **Step 4: Write `src/server/actions/thread-summary.ts`:**

```typescript
"use server";

import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { requireUserIdForDb } from "@/lib/user-id";
import { DiscussionAnchorSchema } from "@/server/services/discussion/comment-schemas";
import { getViewerGateContext } from "@/server/services/discussion/spoiler-gate";
import {
  getOrCreateThreadSummary,
  type ThreadSummaryResult,
} from "@/server/services/discussion/thread-summary";

const SummarizeSchema = z.object({ anchor: DiscussionAnchorSchema });

export async function summarizeThread(
  rawInput: z.infer<typeof SummarizeSchema>
): Promise<ThreadSummaryResult> {
  try {
    const userId = await requireUserIdForDb(); // sign-in required: cost control
    const { anchor } = SummarizeSchema.parse(rawInput);
    const ctx = await getViewerGateContext(userId, anchor);
    const title =
      anchor.type === "movie"
        ? (await prisma.movie.findUnique({ where: { id: anchor.movieId }, select: { title: true } }))?.title
        : (await prisma.series.findUnique({ where: { id: anchor.seriesId }, select: { name: true } }))?.name;
    if (!title) return { status: "error" };
    return await getOrCreateThreadSummary(anchor, ctx, title);
  } catch {
    return { status: "error" };
  }
}
```

- [ ] **Step 5: Write `thread-summary-card.tsx`:**

```tsx
"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { summarizeThread } from "@/server/actions/thread-summary";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";

export function ThreadSummaryCard({ anchor }: { anchor: DiscussionAnchor }) {
  const { status } = useSession();
  const [summary, setSummary] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");

  if (status !== "authenticated") return null;

  const generate = async () => {
    setState("loading");
    const result = await summarizeThread({ anchor });
    if (result.status === "ok") {
      setSummary(result.summary);
      setCount(result.commentCount);
      setState("idle");
    } else {
      setState(result.status === "not_enough_comments" ? "empty" : "error");
    }
  };

  if (summary) {
    return (
      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" /> Thread summary · safe to your progress
        </p>
        <p className="text-sm text-foreground/90 leading-relaxed">{summary}</p>
        <p className="text-[11px] text-muted-foreground">
          AI summary of the {count} comments visible at your watch progress.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" disabled={state === "loading"} onClick={() => void generate()}>
        {state === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
        )}
        Summarize discussion
      </Button>
      {state === "empty" && (
        <span className="text-xs text-muted-foreground">Not enough comments to summarize yet.</span>
      )}
      {state === "error" && (
        <span className="text-xs text-muted-foreground">Couldn't summarize right now.</span>
      )}
    </div>
  );
}
```

Append `export { ThreadSummaryCard } from "./thread-summary-card";` to the barrel; uncomment/add its usage in `discuss-page.tsx` (Task 13) and optionally inside `DiscussionSection` above the list.

- [ ] **Step 6: Run tests** — `npx vitest run src/server/services/discussion/thread-summary.test.ts` → PASS. `yarn typecheck` → PASS.
- [ ] **Step 7: Commit**

```bash
git add src/server/services/discussion/thread-summary.ts src/server/services/discussion/thread-summary.test.ts src/server/actions/thread-summary.ts src/components/features/discussion/thread-summary-card.tsx src/components/features/discussion/index.ts src/app/series/[...params]/discuss-page.tsx
git commit -m "feat(discussion): spoiler-safe AI thread summaries, PG-cached per scope bucket"
```

---

### Task 15: Block/mute — actions, profile UI, enforcement verification

Enforcement in reads already exists via `getExcludedAuthorIds` (Task 6) and in notifications (Task 8). This task adds the user-facing controls.

**Files:**
- Create: `src/server/actions/blocks.ts`
- Create: `src/components/features/discussion/user-moderation-menu.tsx`
- Modify: the Phase 0 profile page `src/app/u/[username]/page.tsx` (or its header component)

- [ ] **Step 1: Write `blocks.ts`:**

```typescript
"use server";

import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { getUserIdForDb, requireUserIdForDb } from "@/lib/user-id";

const TargetSchema = z.object({
  targetUserId: z.number().int().positive(),
  type: z.enum(["BLOCK", "MUTE"]),
});

export type BlockActionResult = { ok: true } | { ok: false; message: string };

export async function blockUser(rawInput: z.infer<typeof TargetSchema>): Promise<BlockActionResult> {
  try {
    const blockerId = await requireUserIdForDb();
    const input = TargetSchema.parse(rawInput);
    if (input.targetUserId === blockerId) return { ok: false, message: "Cannot block yourself" };
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId: input.targetUserId } },
      create: { blockerId, blockedId: input.targetUserId, type: input.type },
      update: { type: input.type },
    });
    // BLOCK = no follow either direction (spec): drop existing follow edges.
    if (input.type === "BLOCK") {
      await prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followingId: input.targetUserId },
            { followerId: input.targetUserId, followingId: blockerId },
          ],
        },
      });
    }
    return { ok: true };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "blockUser", error: error instanceof Error ? error.message : String(error) },
      "blockUser failed"
    );
    return { ok: false, message: "Something went wrong" };
  }
}

export async function unblockUser(rawInput: { targetUserId: number }): Promise<BlockActionResult> {
  try {
    const blockerId = await requireUserIdForDb();
    const input = z.object({ targetUserId: z.number().int().positive() }).parse(rawInput);
    await prisma.block.deleteMany({ where: { blockerId, blockedId: input.targetUserId } });
    return { ok: true };
  } catch {
    return { ok: false, message: "Something went wrong" };
  }
}

/** For rendering the profile menu state. */
export async function getBlockState(targetUserId: number): Promise<"BLOCK" | "MUTE" | null> {
  const viewerId = await getUserIdForDb();
  if (!viewerId) return null;
  const row = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId: viewerId, blockedId: targetUserId } },
    select: { type: true },
  });
  return row ? (row.type as "BLOCK" | "MUTE") : null;
}
```

(Verify the `Follow` model's field names — `followerId`/`followingId` — with `grep -n "model Follow" -A 10 prisma/schema.prisma` and adjust.)

- [ ] **Step 2: Write `user-moderation-menu.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { MoreHorizontal, ShieldOff, VolumeX, Volume2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { blockUser, getBlockState, unblockUser } from "@/server/actions/blocks";

export function UserModerationMenu({ targetUserId }: { targetUserId: number }) {
  const { status } = useSession();
  const [state, setState] = useState<"BLOCK" | "MUTE" | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      void getBlockState(targetUserId).then(setState);
    }
  }, [status, targetUserId]);

  if (status !== "authenticated") return null;

  const apply = async (type: "BLOCK" | "MUTE" | null) => {
    const result = type
      ? await blockUser({ targetUserId, type })
      : await unblockUser({ targetUserId });
    if (result.ok) {
      setState(type);
      toast.success(
        type === "BLOCK" ? "User blocked" : type === "MUTE" ? "User muted" : "Restrictions removed"
      );
    } else {
      toast.error(result.message);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 w-10 p-0" aria-label="User options">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {state !== "MUTE" && state !== "BLOCK" && (
          <DropdownMenuItem onClick={() => void apply("MUTE")}>
            <VolumeX className="h-4 w-4 mr-2" /> Mute (hide their comments from you)
          </DropdownMenuItem>
        )}
        {state === "MUTE" && (
          <DropdownMenuItem onClick={() => void apply(null)}>
            <Volume2 className="h-4 w-4 mr-2" /> Unmute
          </DropdownMenuItem>
        )}
        {state !== "BLOCK" ? (
          <DropdownMenuItem onClick={() => void apply("BLOCK")}>
            <Shield className="h-4 w-4 mr-2" /> Block (mutual invisibility)
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => void apply(null)}>
            <ShieldOff className="h-4 w-4 mr-2" /> Unblock
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Append `export { UserModerationMenu } from "./user-moderation-menu";` to the discussion barrel.

- [ ] **Step 3: Mount on the profile page.** In the Phase 0 profile header (`src/app/u/[username]/page.tsx` or its header component), render next to the follow button, only for other users' profiles:

```tsx
import { UserModerationMenu } from "@/components/features/discussion";
// in the header action row:
<UserModerationMenu targetUserId={profileUser.id} />
```

(Adapt the prop source to the page's actual data variable; the menu itself handles signed-out by rendering nothing. Mind invariant 8: the profile page may be edge-cached with short s-maxage — this component renders nothing in anon HTML because session is unauthenticated during SSR, and resolves client-side. Do NOT make the profile RSC read the block state server-side.)

- [ ] **Step 4: Enforcement audit** — confirm every comment read filters blocks:

```bash
grep -rn "getExcludedAuthorIds" src/server | sort
```
Expected: `db/postgres/comments.ts` (gated reads), `services/notifications/notify.ts`. The public NONE tier intentionally does NOT filter (anonymous edge-cached HTML is identical for everyone — per-viewer filtering there is impossible by definition; signed-in viewers immediately upgrade to the filtered gated tier).

- [ ] **Step 5: Typecheck + commit**

```bash
yarn typecheck && yarn lint
git add src/server/actions/blocks.ts src/components/features/discussion/user-moderation-menu.tsx src/components/features/discussion/index.ts src/app/u
git commit -m "feat(safety): block/mute actions + profile controls"
```

---

### Task 16: Admin moderation queue

Follows the existing admin pattern: `requireAdmin()` API route + a client tab registered in `src/app/admin/client.tsx`.

**Files:**
- Create: `src/app/api/admin/moderation/route.ts`
- Create: `src/components/features/admin/tabs/moderation-tab.tsx`
- Modify: `src/components/features/admin/tabs/index.ts`
- Modify: `src/app/admin/client.tsx`

- [ ] **Step 1: Write the API route:**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";

const COMMENT_INCLUDE = {
  user: { select: { id: true, username: true, name: true } },
} as const;

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "queue";
    if (view === "queue") {
      const comments = await prisma.comment.findMany({
        where: { status: { in: ["PENDING_REVIEW", "FLAGGED"] } },
        include: COMMENT_INCLUDE,
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      return NextResponse.json({ comments });
    }
    const reports = await prisma.report.findMany({
      where: { status: "OPEN" },
      include: {
        comment: { include: COMMENT_INCLUDE },
        reporter: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return NextResponse.json({ reports });
  } catch (error: unknown) {
    adminApiLogger.error(
      { route: "admin/moderation", error: error instanceof Error ? error.message : String(error) },
      "moderation GET failed"
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), commentId: z.number().int().positive() }),
  z.object({ action: z.literal("remove"), commentId: z.number().int().positive() }),
  z.object({
    action: z.literal("resolve_report"),
    reportId: z.number().int().positive(),
    resolution: z.enum(["RESOLVED", "DISMISSED"]),
  }),
]);

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const input = ActionSchema.parse(await request.json());
    if (input.action === "approve") {
      await prisma.comment.update({
        where: { id: input.commentId },
        data: { status: "PUBLISHED" },
      });
    } else if (input.action === "remove") {
      await prisma.comment.update({
        where: { id: input.commentId },
        data: { status: "REMOVED" },
      });
    } else {
      await prisma.report.update({
        where: { id: input.reportId },
        data: { status: input.resolution },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    adminApiLogger.error(
      { route: "admin/moderation", error: error instanceof Error ? error.message : String(error) },
      "moderation POST failed"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

(Verify the Phase 0 `Report` relation names — `comment`, `reporter` — and `ReportStatus` members; adjust literals.)

- [ ] **Step 2: Write `moderation-tab.tsx`:**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ModAuthor { id: number; username: string | null; name: string | null }
interface ModComment {
  id: number;
  body: string;
  status: string;
  spoilerScope: string;
  aiLabels: Record<string, unknown> | null;
  createdAt: string;
  user: ModAuthor | null;
}
interface ModReport {
  id: number;
  reason: string;
  note: string | null;
  createdAt: string;
  reporter: { id: number; username: string | null } | null;
  comment: ModComment | null;
}

async function postAction(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/admin/moderation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

function CommentRow({ comment, onDone }: { comment: ModComment; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (action: "approve" | "remove") => {
    setBusy(true);
    const ok = await postAction({ action, commentId: comment.id });
    setBusy(false);
    if (ok) {
      toast.success(action === "approve" ? "Published" : "Removed");
      onDone();
    } else toast.error("Action failed");
  };
  const gateLabels = comment.aiLabels ? JSON.stringify(comment.aiLabels) : null;
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <Badge variant="outline">{comment.status}</Badge>
        <Badge variant="outline">{comment.spoilerScope}</Badge>
        <span>{comment.user?.username ?? comment.user?.name ?? "unknown"}</span>
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">{comment.body}</p>
      {gateLabels && (
        <p className="text-[11px] text-muted-foreground font-mono break-all line-clamp-2">{gateLabels}</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void act("approve")}>
          <Check className="h-3.5 w-3.5 mr-1" /> Publish
        </Button>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => void act("remove")}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
        </Button>
      </div>
    </div>
  );
}

export function ModerationTab() {
  const [comments, setComments] = useState<ModComment[]>([]);
  const [reports, setReports] = useState<ModReport[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [queueRes, reportsRes] = await Promise.all([
      fetch("/api/admin/moderation?view=queue"),
      fetch("/api/admin/moderation?view=reports"),
    ]);
    if (queueRes.ok) setComments(((await queueRes.json()) as { comments: ModComment[] }).comments);
    if (reportsRes.ok) setReports(((await reportsRes.json()) as { reports: ModReport[] }).reports);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolveReport = async (reportId: number, resolution: "RESOLVED" | "DISMISSED") => {
    const ok = await postAction({ action: "resolve_report", reportId, resolution });
    if (ok) {
      toast.success("Report updated");
      void refresh();
    } else toast.error("Action failed");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Review queue ({comments.length})</h2>
        {comments.length === 0 && <p className="text-sm text-muted-foreground">Queue is empty.</p>}
        {comments.map((c) => (
          <CommentRow key={c.id} comment={c} onDone={() => void refresh()} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Open reports ({reports.length})</h2>
        {reports.length === 0 && <p className="text-sm text-muted-foreground">No open reports.</p>}
        {reports.map((r) => (
          <div key={r.id} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <Badge>{r.reason}</Badge>
              <span>by {r.reporter?.username ?? "unknown"}</span>
              <span>{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            {r.note && <p className="text-xs text-muted-foreground italic">"{r.note}"</p>}
            {r.comment ? (
              <CommentRow comment={r.comment} onDone={() => void refresh()} />
            ) : (
              <p className="text-xs text-muted-foreground">Reported content unavailable</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void resolveReport(r.id, "RESOLVED")}>
                <Check className="h-3.5 w-3.5 mr-1" /> Resolved
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void resolveReport(r.id, "DISMISSED")}>
                <X className="h-3.5 w-3.5 mr-1" /> Dismiss
              </Button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Register the tab.** In `src/components/features/admin/tabs/index.ts` add `export { ModerationTab } from "./moderation-tab";`. In `src/app/admin/client.tsx`: add `"moderation"` to `VALID_TABS`, import `ModerationTab` (and a `ShieldAlert` icon from lucide), add a `<TabsTrigger value="moderation">` following the existing triggers, and a `<TabsContent value="moderation"><ModerationTab /></TabsContent>` following the existing content blocks.

- [ ] **Step 4: Verify** — `yarn dev`, sign in as admin, `/admin?tab=moderation`: queue lists a `PENDING_REVIEW` comment (create one by posting with AWS creds unset → gate fails → held), Publish/Remove work, report flow from a comment shows up under reports.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/moderation/route.ts src/components/features/admin/tabs/moderation-tab.tsx src/components/features/admin/tabs/index.ts src/app/admin/client.tsx
git commit -m "feat(admin): moderation queue tab (pending comments + reports)"
```

---

### Task 17: Content policy page

UGC legal requirement (spec §5): report flow + content policy + AI gate = the moderation launch trio.

**Files:**
- Create: `src/app/content-policy/page.tsx`
- Modify: `src/components/features/layout/footer.tsx`

- [ ] **Step 1: Write the page** (static RSC, modeled on `/privacy` & `/terms` — check one of them for the exact prose-styling classes used and match them):

```tsx
import type { Metadata } from "next";
import { PageMain } from "@/components/features/layout/page-main";

export const metadata: Metadata = {
  title: "Content Policy",
  description:
    "Community rules for discussions on The Movie Browser: spoiler etiquette, prohibited content, AI moderation, and how reporting and enforcement work.",
};

export default function ContentPolicyPage() {
  return (
    <PageMain className="max-w-3xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-6">Content Policy</h1>
      <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">The spirit</h2>
          <p>
            Discussions here exist so people can talk about movies and shows without being spoiled
            and without being attacked. Disagree about the art as hard as you like; leave the
            people out of it.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Spoiler etiquette</h2>
          <p>
            Every comment carries a spoiler scope (none, up-to-an-episode, watched, or ending).
            Readers only see comments their own watch progress unlocks. Tag honestly — our AI
            suggests a scope when a comment looks spoilery, and you confirm or adjust it before
            publishing. Deliberately mis-tagged spoilers are removable and repeat offenses may
            lead to restrictions.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Not allowed</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Harassment, bullying, or threats against anyone.</li>
            <li>Hate speech or slurs targeting protected groups.</li>
            <li>Sexual content involving minors — zero tolerance, reported where required by law.</li>
            <li>Doxxing or sharing anyone's private information.</li>
            <li>Spam, advertising, link farming, or engagement manipulation.</li>
            <li>Piracy links or instructions for accessing content illegally.</li>
            <li>Impersonation of other people or of The Movie Browser staff.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">How moderation works</h2>
          <p>
            Every comment passes an automated AI check before or shortly after it becomes visible.
            The AI classifies content only — it flags toxicity and suggests spoiler scopes; it
            never rates, profiles, or characterizes you. Flagged comments are held for human
            review. Moderators can publish, remove, or restrict.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Reporting and enforcement</h2>
          <p>
            Use the report option on any comment. Reports go to a human-reviewed queue. Depending
            on severity we may remove content, hold future comments for review, or suspend
            accounts. You can also block (mutual invisibility) or mute (one-way hide) any user
            from their profile.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Your content</h2>
          <p>
            You own what you write. Deleting a comment scrubs its text immediately; the thread
            structure around it survives so replies keep their context. Deleting your account
            removes your name from all of your comments.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">Last updated: June 2026</p>
      </div>
    </PageMain>
  );
}
```

- [ ] **Step 2: Footer link.** In `footer.tsx`, find the column containing the Privacy/Terms links and add, following the identical `<li><Link …>` pattern:

```tsx
<li>
  <Link href="/content-policy" className="hover:text-foreground transition-colors">
    Content Policy
  </Link>
</li>
```

- [ ] **Step 3: Verify + commit**

```bash
yarn typecheck && yarn lint
git add src/app/content-policy/page.tsx src/components/features/layout/footer.tsx
git commit -m "feat(legal): content policy page"
```

---

### Task 18: Final verification sweep

- [ ] **Step 1: Full CI locally**

```bash
yarn test:ci
```
Expected: typecheck PASS, lint PASS, all unit tests PASS (including the new spoiler-gate, mentions, comment-gate, thread-summary, media-resolver suites).

- [ ] **Step 2: File-size audit** (repo rule: <800 lines, components <600)

```bash
wc -l src/server/db/postgres/comments.ts src/server/actions/comments.ts src/components/features/discussion/*.tsx src/app/series/[...params]/discuss-page.tsx | sort -rn | head
```
Split anything over the limit (most likely candidate: `comment-item.tsx` → extract `SingleComment` into `comment-single.tsx`).

- [ ] **Step 3: Edge-cache invariant smoke test** (the one that must never regress):

```bash
yarn build && yarn start -p 3111 &
sleep 8
# Post (via UI beforehand) one NONE comment and one EPISODE-scoped comment on a test title, then:
curl -s http://localhost:3111/series/<id>/<slug>/discuss/s1e1 > /tmp/anon.html
grep -c "spoiler-test-marker-none" /tmp/anon.html   # 1 — NONE comment IS in anon HTML
grep -c "spoiler-test-marker-gated" /tmp/anon.html  # 0 — gated comment NOT in anon HTML
```
(Use those marker strings as the bodies of the two test comments.)

- [ ] **Step 4: N+1 audit** — confirm a discussion page render issues a bounded query count: set `DEBUG="prisma:query"` (or Prisma log option) on `yarn dev`, load a discuss page, count queries: expect ~6 server-side (series+episodes, public page, replies, reply counts, locked count, published count) regardless of comment count.

- [ ] **Step 5: ISR verification** (performance.md): repeat-curl a discuss URL → ~ms on second hit; `.next/server/app/series/**` contains the discuss page HTML; garbage suffix → 404; wrong slug → 308 (from Task 13 Step 4 — re-run after all wiring).

- [ ] **Step 6: Commit any fixes**

```bash
git add -A && git commit -m "chore(discussion): phase-1 verification fixes"
```

---

## Deliberately deferred (spec-consistent)

- **Likes/reactions UI** on comments: `likeCount` renders nothing yet; the reactions table + atomic-increment flow ships with Phase 2 identity artifacts (spec sequences the likes-sort index as deferred anyway).
- **CloudFront invalidation hooks** for moderation removals on discuss pages (invariant 8's single-path invalidation): local-only phase — add the `aws cloudfront create-invalidation --paths "/series/<id>/*"` call to the admin remove action when this deploys.
- **Sitemap entries** for discuss pages: add to `scripts/generate-sitemap.js` once threads have content worth indexing (cold-start empty threads in the sitemap would hurt, not help).
- **`CLUB_EPISODE_OPEN` / "S3 just dropped" push**: plumbing (service, SW, subscriptions) ships here; the trigger is Phase 3's club scheduler.

## Self-review notes (checked against the spec)

- Invariant 6 (no fan-out): notifications only ever target the reply parent author + ≤5 mentioned users. ✓
- Invariant 7 (typed anchors): all new code uses `DiscussionAnchor`; no `(itemId, itemType)`. ✓
- Invariant 8 (edge cache): SSR'd discussion HTML = NONE/PUBLISHED/circle-NULL + progress-independent counts; gated tier is server-action POSTs. ✓
- Spec §4.2 "publicComments helper bakes in circleId IS NULL AND status PUBLISHED": `PUBLIC_COMMENTS_WHERE` + both read paths compose it. ✓
- Fable rule: gate + summary prompts classify/summarize content, never users; starters come from content-grounded `ai_insights`. ✓
- Soft-delete semantics (invariant 4): `DELETED_BY_USER` + body scrub, tree survives. ✓
- Phase 0 names consumed, not redefined; every assumed name carries a grep-verify instruction. ✓

### Critical Files for Implementation

- /Users/chaitanya/dev/movie-browser/src/server/services/discussion/spoiler-gate.ts (new — the predicate everything hangs off)
- /Users/chaitanya/dev/movie-browser/src/server/db/postgres/comments.ts (new — publicComments + gated reads)
- /Users/chaitanya/dev/movie-browser/src/server/actions/comments.ts (new — write path + AI gate flow)
- /Users/chaitanya/dev/movie-browser/src/server/proxy/media-resolver.ts (modify — discuss-URL 308/404 authority)
- /Users/chaitanya/dev/movie-browser/src/app/series/[...params]/page.tsx (modify — catch-all branch to the discuss page)
