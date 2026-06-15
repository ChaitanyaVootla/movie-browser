# Reviews — Rich Composer & Display Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the reviews feature to the discussion polish bar — integrated half-star rating + heart, optional title, a shared rich-text editor (emoji/mentions/inline-spoiler/images/link-cards), progress-aware spoiler gating, likes, and a redesigned display (histogram + Popular/Recent/Following) — on a shared rich-text foundation extracted from the discussion editor.

**Architecture:** Phase 0 extracts the generic discussion editor pieces into `src/components/features/rich-text/` (discussion keeps working, byte-identical) and generalizes `DiscussionAnchor` → `MediaAnchor`. Subsequent phases add schema (reviews adopt the comment `spoilerScope` model; `user_ratings` gains a `liked` heart; the polymorphic `Reaction` table gains a `reviewId` anchor), rebuild the composer, reuse `spoiler-gate.ts` for a `loadReviews` server action, and redesign the display. Reviewing upserts both a `user_reviews` row and the canonical `user_ratings` row in one audited transaction.

**Tech Stack:** Next.js 15 (App Router) / React 19 / TypeScript strict · Prisma 6 + PostgreSQL · Tiptap · Zod · shadcn/ui + Tailwind v4 + Framer Motion · Bedrock Flex (moderation gate) · Vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-reviews-rich-composer-design.md`

**Working context (every task):**
- Branch `feat/social-phase0` (local-only; no backward-compat concerns).
- Dev server under PM2: `npx pm2 restart mb-dev` after any `db push`/`prisma generate`; read logs with `npx pm2 logs mb-dev --nostream --lines 80`. Config `ecosystem.dev.config.cjs` (DB :5436, `USER_DATA_SOURCE=postgres`, `ENABLE_MONGODB_ENRICHMENT=false`, `ENABLE_TEST_AUTH=true`).
- DB ops use the dev DB: prefix `DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser'`.
- `yarn typecheck` and `yarn test` (Vitest) must stay green between tasks.
- Commit after every task. Never edit files under `src/components/ui/`.

---

## File Structure

**New shared module — `src/components/features/rich-text/`:**
- `serialize.ts` — Tiptap JSON ↔ canonical token string (+ inline-spoiler token). (moved from discussion)
- `extensions.tsx` — generic Tiptap extensions; `buildMentionExtension(anchor: MediaAnchor)`, emoji extension, inline-spoiler mark. (moved)
- `use-rich-text-editor.ts` — the editor hook (anchor + placeholder + config). (moved)
- `emoji-picker.tsx`, `emoji-suggestion-list.tsx`, `mention-chip.tsx`, `mention-suggestion-list.tsx`, `entity-image-picker.tsx`, `rich-text-body.tsx` — generic UI pieces. (moved)
- `toolbar.tsx` — shared toolbar buttons (emoji, image, inline-spoiler) used by both composers.
- `index.ts` — public exports.

**New/changed types & actions:**
- `src/types/social.ts` — `MediaAnchor` + `MediaAnchorSchema` (generalize `DiscussionAnchor`); extend `ReviewDTO`/`OwnReviewDTO`/`SubmitReviewInput` with `title`, `score`, `liked`, `spoilerScope`, `images`, `likeCount`, `likedByViewer`.
- `src/server/actions/catalog-search.ts` — `searchMentionEntities` + `getEntityImages` (moved from `discussion-search.ts`).
- `src/server/actions/reviews.ts` — extend `upsertReview` (rating+heart+title+scope+images), add `loadReviews`, `getRatingHistogram` bridges.
- `src/server/actions/review-reactions.ts` — `toggleReviewLike` (new).
- `src/server/db/postgres/social/reviews.ts` — scope/title/images/likeCount columns; gated read queries.
- `src/server/db/postgres/social/ratings.ts` — `liked` in upsert; `getRatingHistogram`.

**Reviews UI — `src/components/features/reviews/`:**
- `review-composer.tsx` (rebuilt), `star-rating-input.tsx` (new), `review-card.tsx` (rebuilt), `reviews-section.tsx` (rebuilt, server), `reviews-client.tsx` (new, client island: tabs/spoiler-tier/own/likes), `rating-histogram.tsx` (new, server), `own-review-slot.tsx` (re-skinned), `review-like-button.tsx` (new), `index.ts`.

**Schema/SQL:** `prisma/schema.prisma` (UserReview, UserRating fields, Reaction.reviewId), `postgres/init/04-ugc-constraints.sql` (rating CHECK).

---

## Phase 0 — Extract the shared rich-text module (discussion stays byte-identical)

### Task 0.1: Snapshot discussion behavior as the regression baseline

**Files:** none (read + record).

- [ ] **Step 1:** Run the existing editor/serialize tests to capture the green baseline.

Run: `yarn vitest run src/components/features/discussion`
Expected: PASS (note the count; e.g. `comment-editor-serialize.test.ts`). If any are already red, STOP and report — do not proceed.

- [ ] **Step 2:** Typecheck baseline.

Run: `yarn typecheck`
Expected: clean.

- [ ] **Step 3:** No commit (read-only baseline).

### Task 0.2: Introduce `MediaAnchor` as the generalized anchor type

**Files:**
- Modify: `src/types/social.ts` (add `MediaAnchor`/`MediaAnchorSchema`, re-export `DiscussionAnchor` as an alias).
- Locate first: `rg "DiscussionAnchor(Schema)?" src --files-with-matches`

- [ ] **Step 1:** Find where `DiscussionAnchor` / `DiscussionAnchorSchema` are defined.

Run: `rg -n "DiscussionAnchor" src/server/services/discussion/comment-schemas.ts src/types/social.ts`
Expected: a Zod object (kind movie/series + ids + season/episode) and a TS type.

- [ ] **Step 2:** Add the generalized alias next to the existing definition (do not delete the old name yet — alias it):

```ts
// MediaAnchor: the unit a rich-text body is attached to (movie/series + optional season/episode).
// Generalizes DiscussionAnchor so reviews + discussion share one anchor type.
export const MediaAnchorSchema = DiscussionAnchorSchema;
export type MediaAnchor = z.infer<typeof MediaAnchorSchema>;
```

(If `DiscussionAnchorSchema` lives in `comment-schemas.ts`, add the alias there and re-export from `types/social.ts`.)

- [ ] **Step 3:** Typecheck.

Run: `yarn typecheck`
Expected: clean.

- [ ] **Step 4:** Commit.

```bash
git add -A && git commit -m "refactor(rich-text): add MediaAnchor alias for the generalized editor anchor"
```

### Task 0.3: Move the truly-generic editor files into `rich-text/` (no logic change)

**Files (git mv + rename, update internal import paths only):**
- `discussion/comment-editor-serialize.ts` → `rich-text/serialize.ts`
- `discussion/emoji-picker-button.tsx` → `rich-text/emoji-picker.tsx`
- `discussion/emoji-suggestion-list.tsx` → `rich-text/emoji-suggestion-list.tsx`
- `discussion/comment-mention-chip.tsx` → `rich-text/mention-chip.tsx`
- `discussion/mention-suggestion-list.tsx` → `rich-text/mention-suggestion-list.tsx`
- `discussion/comment-editor-extensions.tsx` → `rich-text/extensions.tsx`
- `discussion/use-comment-editor.ts` → `rich-text/use-rich-text-editor.ts`
- `discussion/comment-image-picker.tsx` → `rich-text/entity-image-picker.tsx`
- `discussion/comment-body.tsx` → `rich-text/rich-text-body.tsx`
- Also move the test: `discussion/comment-editor-serialize.test.ts` → `rich-text/serialize.test.ts`.

- [ ] **Step 1:** `mkdir -p src/components/features/rich-text` and `git mv` each file to its new path/name above.

- [ ] **Step 2:** In the moved files, update relative imports between them to the new names (e.g. `extensions.tsx` imports `./mention-chip`, `./mention-suggestion-list`, `./emoji-suggestion-list`; `use-rich-text-editor.ts` imports `./extensions`; etc.). Generalize internal type references from `DiscussionAnchor` → `MediaAnchor` (import from `@/types/social`). Do NOT change any runtime behavior. Keep exported symbol names for now (e.g. `useCommentEditor`) to minimize churn; rename in Step 4.

- [ ] **Step 3:** Create `src/components/features/rich-text/index.ts` re-exporting the public surface:

```ts
export * from "./serialize";
export * from "./extensions";
export * from "./use-rich-text-editor";
export { EmojiPicker } from "./emoji-picker";
export { EntityImagePicker } from "./entity-image-picker";
export { RichTextBody } from "./rich-text-body";
```

- [ ] **Step 4:** Rename the public symbols to neutral names where trivial: `useCommentEditor` → `useRichTextEditor`, `EmojiPickerButton` → `EmojiPicker`, `CommentImagePicker` → `EntityImagePicker`, `CommentBody` → `RichTextBody`. Keep `buildMentionExtension`, `CommentEmojiExtension` names (or rename to `MediaEmojiExtension`) — your choice, but be consistent.

- [ ] **Step 5:** Update discussion import sites to the new module. Find them:

Run: `rg -n "from \"\\.\\./?(use-comment-editor|comment-editor-extensions|comment-editor-serialize|emoji-picker-button|emoji-suggestion-list|comment-mention-chip|mention-suggestion-list|comment-image-picker|comment-body)\"" src/components/features/discussion`
Then point each at `@/components/features/rich-text` with the renamed symbol.

- [ ] **Step 6:** Typecheck + run the moved serialize test + the discussion suite.

Run: `yarn typecheck && yarn vitest run src/components/features/rich-text src/components/features/discussion`
Expected: same PASS count as Task 0.1 baseline.

- [ ] **Step 7:** Commit.

```bash
git add -A && git commit -m "refactor(rich-text): extract generic editor pieces from discussion into shared module"
```

### Task 0.4: Move the catalog-search server actions to a generic file

**Files:**
- `src/server/actions/discussion-search.ts` → `src/server/actions/catalog-search.ts` (`searchMentionEntities`, `getEntityImages`).
- Modify import sites.

- [ ] **Step 1:** `git mv src/server/actions/discussion-search.ts src/server/actions/catalog-search.ts`. Update its internal Zod schema name `DiscussionAnchorSchema` → `MediaAnchorSchema` import.

- [ ] **Step 2:** Update importers:

Run: `rg -n "discussion-search" src` then repoint to `@/server/actions/catalog-search`.

- [ ] **Step 3:** Typecheck + discussion tests.

Run: `yarn typecheck && yarn vitest run src/components/features/discussion`
Expected: green.

- [ ] **Step 4:** Commit.

```bash
git add -A && git commit -m "refactor(rich-text): move catalog mention/image search to generic catalog-search action"
```

### Task 0.5: Manual regression — discussion composer unchanged

**Files:** none.

- [ ] **Step 1:** `npx pm2 restart mb-dev` then `npx pm2 logs mb-dev --nostream --lines 40` — confirm clean boot (ignore `clickhouse_insert_error`).

- [ ] **Step 2:** In a real browser (not curl — the proxy 429s headless), open a series episode discussion page, get a session via `GET /api/test-auth/login`, and compose a comment using emoji + an @mention + an image attachment + a spoiler scope. Verify it posts and renders identically to before.

- [ ] **Step 3:** No code change → no commit. If anything regressed, fix imports and re-run Task 0.3 Step 6.

---

## Phase 1 — Schema & data model

### Task 1.1: Add inline-spoiler round-trip to the serializer (TDD)

**Files:**
- Modify: `src/components/features/rich-text/serialize.ts`
- Test: `src/components/features/rich-text/serialize.test.ts`

The renderer (`rich-text-body.tsx`) already tokenizes an inline-spoiler token. Make the serializer emit/parse it so the editor mark round-trips. Confirm the exact token the renderer expects first.

- [ ] **Step 1:** Confirm the renderer's inline-spoiler token.

Run: `rg -n "spoiler" src/components/features/rich-text/rich-text-body.tsx`
Expected: a delimiter (e.g. `||…||` or `[spoiler]…[/spoiler]`). Use whatever it already parses as `SPOILER_TOKEN`.

- [ ] **Step 2:** Write the failing test (use the actual token from Step 1; example assumes `||`):

```ts
import { describe, it, expect } from "vitest";
import { serializeToBody } from "./serialize";

describe("inline spoiler serialization", () => {
  it("wraps a spoiler mark as the spoiler token", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "the killer is " },
      { type: "text", marks: [{ type: "spoiler" }], text: "the butler" },
    ] }] };
    expect(serializeToBody(doc, () => undefined)).toBe("the killer is ||the butler||");
  });
});
```

- [ ] **Step 3:** Run → FAIL.

Run: `yarn vitest run src/components/features/rich-text/serialize.test.ts -t "spoiler"`
Expected: FAIL (mark ignored / no token).

- [ ] **Step 4:** In `serialize.ts`, in the inline-mark handling, wrap text carrying the `spoiler` mark in the token. Match the renderer's token exactly.

- [ ] **Step 5:** Run → PASS.

- [ ] **Step 6:** Commit.

```bash
git add -A && git commit -m "feat(rich-text): serialize inline-spoiler mark to the renderer token"
```

### Task 1.2: Add the inline-spoiler Tiptap mark + toolbar button to the shared editor

**Files:**
- Modify: `src/components/features/rich-text/extensions.tsx` (register a `Spoiler` mark).
- Create: `src/components/features/rich-text/toolbar.tsx` (emoji + image + inline-spoiler buttons).
- Modify: discussion composer to use the shared toolbar (keeps its existing buttons; gains the spoiler button — desired for consistency).

- [ ] **Step 1:** Add a `Spoiler` Tiptap `Mark` extension in `extensions.tsx` (name `"spoiler"`, toggle command `toggleSpoiler`, rendered with a class like `rich-spoiler` for the editor view). Add it to the editor's extension list in `use-rich-text-editor.ts`.

- [ ] **Step 2:** Create `toolbar.tsx` exporting `<RichTextToolbar editor emoji image spoiler … />` rendering the shared `EmojiPicker`, an image button (calls a passed `onAddImage`), and a spoiler toggle (`editor.chain().focus().toggleSpoiler().run()`), using `@/lib/design` primitives + shadcn `Button` (ghost). 40px+ touch targets.

- [ ] **Step 3:** Point the discussion composer at `<RichTextToolbar>` for its emoji/image buttons; keep its scope `Select` where it is.

- [ ] **Step 4:** Typecheck + discussion tests + manual: spoiler button blurs selected text in the discussion composer and round-trips on post.

Run: `yarn typecheck && yarn vitest run src/components/features/rich-text src/components/features/discussion`

- [ ] **Step 5:** Commit.

```bash
git add -A && git commit -m "feat(rich-text): inline-spoiler mark + shared editor toolbar"
```

### Task 1.3: Prisma schema — UserReview fields, UserRating.liked, Reaction.reviewId

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1:** In `model UserReview`: remove `containsSpoilers Boolean @default(false) @map("contains_spoilers")`; add:

```prisma
  title              String?      @db.VarChar(140)
  spoilerScope       SpoilerScope @default(NONE) @map("spoiler_scope")
  scopeSeason        Int?         @map("scope_season")
  scopeEpisode       Int?         @map("scope_episode")
  scopeTmdbEpisodeId Int?         @map("scope_tmdb_episode_id")
  images             Json?
  likeCount          Int          @default(0) @map("like_count")
  reactions          Reaction[]
```

Add indexes for the Popular sort:

```prisma
  @@index([movieId, status, likeCount(sort: Desc)])
  @@index([seriesId, seasonNumber, status, likeCount(sort: Desc)])
```

- [ ] **Step 2:** In `model UserRating` (the `user_ratings` table): add `liked Boolean @default(false)`. Add aggregate indexes:

```prisma
  @@index([movieId, score])
  @@index([seriesId, seasonNumber, score])
```

(Confirm exact field names by reading the model first — the file uses `@map` snake_case.)

- [ ] **Step 3:** In `model Reaction`: add the review anchor:

```prisma
  reviewId Int?        @map("review_id")
  review   UserReview? @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  @@unique([userId, reviewId])
  @@index([reviewId])
```

- [ ] **Step 4:** Push to the dev DB + regenerate client + restart dev server.

```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn db:push
npx pm2 restart mb-dev
```
Expected: push succeeds; no data-loss prompt that blocks (it's local).

- [ ] **Step 5:** Typecheck (the generated client now knows the columns).

Run: `yarn typecheck`
Expected: errors ONLY in code that referenced `containsSpoilers` (fixed in later tasks) — note them. If unrelated errors, stop.

- [ ] **Step 6:** Commit.

```bash
git add -A && git commit -m "feat(reviews): schema — spoilerScope/title/images/likeCount, rating heart, Reaction.reviewId"
```

### Task 1.4: Update the rating CHECK constraint for heart-only rows

**Files:**
- Modify: `postgres/init/04-ugc-constraints.sql`

- [ ] **Step 1:** Find the user_ratings "never neither" CHECK.

Run: `rg -n "user_ratings" postgres/init/04-ugc-constraints.sql`

- [ ] **Step 2:** Replace its predicate so a heart-only row is valid:

```sql
-- a rating row must carry a thumb, a score, OR a heart
ALTER TABLE user_ratings DROP CONSTRAINT IF EXISTS chk_user_ratings_nonempty;
ALTER TABLE user_ratings ADD CONSTRAINT chk_user_ratings_nonempty
  CHECK (rating IS NOT NULL OR score IS NOT NULL OR liked = true);
```

(Match the existing constraint name; keep the file idempotent/reapply-safe like its neighbors.)

- [ ] **Step 3:** Apply to the dev DB.

```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' npx tsx scripts/apply-ugc-constraints.ts
```
Expected: applies without error.

- [ ] **Step 4:** Commit.

```bash
git add -A && git commit -m "feat(reviews): allow heart-only rating rows in the user_ratings CHECK"
```

---

## Phase 2 — DB layer & types

### Task 2.1: `MediaAnchor`-aware review DTOs and inputs

**Files:**
- Modify: `src/types/social.ts`

- [ ] **Step 1:** Extend the review types (replace `containsSpoilers` with scope; add the new fields):

```ts
export interface SubmitReviewInput {
  mediaType: TrackedMediaType;
  tmdbId: number;
  seasonNumber?: number;
  title?: string;
  body: string;
  score?: number | null;          // 1–10; null = unrated/abstain
  liked?: boolean;                 // "loved it" heart
  spoilerScope: SpoilerScopeValue; // "NONE" | "WATCHED" | "EPISODE" | "ENDING"
  scopeSeason?: number | null;
  scopeEpisode?: number | null;
  isPrivate: boolean;
  images?: ReviewImage[];          // ≤4
}

export interface ReviewImage { entityType: "movie" | "series" | "episode" | "person"; tmdbId: number; imagePath: string; }

export interface ReviewDTO {
  id: number;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  title: string | null;
  score: number | null;
  liked: boolean;
  body: string;
  spoilerScope: SpoilerScopeValue;
  scopeSeason: number | null;
  scopeEpisode: number | null;
  images: ReviewImage[];
  seasonNumber: number | null;
  likeCount: number;
  likedByViewer: boolean;
  createdAt: string;
  editedAt: string | null;
}

export interface OwnReviewDTO extends ReviewDTO { status: ReviewStatus; isPrivate: boolean; }
```

Import `SpoilerScopeValue` from `@/server/services/discussion/comment-schemas`.

- [ ] **Step 2:** Typecheck — expect errors in `reviews.ts`/components still using old shapes (fixed next). Confirm no errors in unrelated files.

- [ ] **Step 3:** Commit.

```bash
git add -A && git commit -m "feat(reviews): extend review DTOs with rating/heart/title/scope/images/likes"
```

### Task 2.2: `getRatingHistogram` (TDD)

**Files:**
- Modify: `src/server/db/postgres/social/ratings.ts`
- Test: `src/server/db/postgres/social/ratings.histogram.test.ts`

- [ ] **Step 1:** Write the failing unit test for the pure bucketizer (separate the SQL from the shaping so it's testable):

```ts
import { describe, it, expect } from "vitest";
import { shapeHistogram } from "./ratings";

describe("shapeHistogram", () => {
  it("buckets 1..10, computes average, excludes nothing it is given", () => {
    const rows = [{ score: 8, n: 3 }, { score: 10, n: 1 }];
    const h = shapeHistogram(rows);
    expect(h.total).toBe(4);
    expect(h.buckets[8]).toBe(3);
    expect(h.buckets[10]).toBe(1);
    expect(h.buckets[1]).toBe(0);
    expect(h.average).toBeCloseTo((8 * 3 + 10) / 4, 5);
  });
  it("returns null average for an empty set", () => {
    const h = shapeHistogram([]);
    expect(h.total).toBe(0);
    expect(h.average).toBeNull();
  });
});
```

- [ ] **Step 2:** Run → FAIL (`shapeHistogram` undefined).

- [ ] **Step 3:** Implement `shapeHistogram(rows: {score:number;n:number}[])` returning `{ buckets: Record<number,number> (1..10 init 0), average: number|null, total: number }`, plus `getRatingHistogram(anchor: {movieId?:number; seriesId?:number; seasonNumber?:number|null})` running `SELECT score, COUNT(*)::int n FROM user_ratings WHERE <anchor> AND score IS NOT NULL GROUP BY score` via Prisma `$queryRaw`, mapped through `shapeHistogram`.

- [ ] **Step 4:** Run → PASS.

- [ ] **Step 5:** Commit.

```bash
git add -A && git commit -m "feat(reviews): rating histogram aggregation over user_ratings"
```

### Task 2.3: `upsertUserRating` learns the heart; review DB layer learns the new columns

**Files:**
- Modify: `src/server/db/postgres/social/ratings.ts` (accept `liked` in the upsert; keep the CHECK satisfied)
- Modify: `src/server/db/postgres/social/reviews.ts` (write/read title, spoilerScope+scope*, images, likeCount; replace `containsSpoilers`)

- [ ] **Step 1:** In `ratings.ts`, add `liked?: boolean` to the rating upsert input and persist it (default false; do not clobber an existing true with undefined — only set when provided).

- [ ] **Step 2:** In `reviews.ts` `upsertUserReview`: replace `containsSpoilers` with `spoilerScope`/`scopeSeason`/`scopeEpisode`/`scopeTmdbEpisodeId`; persist `title`, `images` (as `Prisma.InputJsonValue`). Keep the find-then-write + P2002 fallback. `getPublicReviews`/`getOwnReview`/`getUserReviews` select the new columns.

- [ ] **Step 3:** Add a gated public query `getVisibleReviews(opts & { gate: ViewerGateContext; anchorKind })` that applies `visibleScopeWhere(gate, anchorKind)` (import from `spoiler-gate.ts`) ANDed with `status="PUBLISHED"`, `isPrivate=false`, block-filter — for the `loadReviews` action. The existing `getPublicReviews` stays as the anon tier but MUST hard-filter `spolerScope="NONE"` (add it) so cacheable HTML never carries spoiler bodies.

- [ ] **Step 4:** Typecheck.

Run: `yarn typecheck`
Expected: `reviews.ts`/`ratings.ts` clean; remaining errors only in the action/UI layer.

- [ ] **Step 5:** Commit.

```bash
git add -A && git commit -m "feat(reviews): DB layer for scope/title/images + heart + gated review reads"
```

---

## Phase 3 — Server actions

### Task 3.1: Rework `upsertReview` — rating+heart+title+scope in one audited txn (TDD on the pure helpers)

**Files:**
- Modify: `src/server/actions/reviews.ts`
- Test: `src/server/actions/reviews.helpers.test.ts`

- [ ] **Step 1:** Write failing tests for two pure helpers:

```ts
import { describe, it, expect } from "vitest";
import { starsToScore, resolveReviewScope } from "./reviews";

describe("starsToScore", () => {
  it("maps half-stars 0.5..5 to 1..10", () => {
    expect(starsToScore(0.5)).toBe(1);
    expect(starsToScore(5)).toBe(10);
    expect(starsToScore(3.5)).toBe(7);
  });
  it("maps null/0 to null (unrated abstains)", () => {
    expect(starsToScore(null)).toBeNull();
    expect(starsToScore(0)).toBeNull();
  });
});

describe("resolveReviewScope", () => {
  it("keeps the user's chosen scope when not weaker than AI suggestion", () => {
    expect(resolveReviewScope("ENDING", null, null, undefined).scope).toBe("ENDING");
  });
  it("upgrades to the AI-suggested scope when stricter than the user's", () => {
    const ai = { scope: "ENDING" as const, season: null, episode: null };
    expect(resolveReviewScope("NONE", null, null, ai).scope).toBe("ENDING");
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3:** Implement `starsToScore(stars: number|null): number|null` (`stars && stars>0 ? Math.round(stars*2) : null`) and `resolveReviewScope(chosen, chosenSeason, chosenEpisode, aiSpoiler)` using `isStricterScope` from `spoiler-gate.ts` (adopt AI scope when stricter). Export both.

- [ ] **Step 4:** Rewrite `upsertReview`'s Zod schema + body to accept `title`, `score`, `liked`, `spoilerScope`+`scope*`, `images` (max 4, validated `{entityType,tmdbId,imagePath}` with the TMDB path regex `/^\/[\w./-]{1,200}$/`). Flow: validate → `requirePgUserId` → if not private run `gateText` (toxicity → `status`; spoiler suggestion → `resolveReviewScope`) → in one `auditedTransaction(userId, tx)`: `upsertUserReview(...)` AND `upsertUserRating({score, liked}, tx)` when `score!=null || liked` → fire-and-forget `unfurlFirstLink` → return `OwnReviewDTO`.

- [ ] **Step 4b:** `submitReviewAction` reshapes to `OwnReviewDTO` (with author info + `likedByViewer=false`, `likeCount=0` for a fresh row).

- [ ] **Step 5:** Run helper tests → PASS; `yarn typecheck` clean.

- [ ] **Step 6:** Commit.

```bash
git add -A && git commit -m "feat(reviews): integrated rating+heart+title+scope upsert with AI scope resolution"
```

### Task 3.2: `loadReviews` (progress-gated) + `getRatingHistogram` bridges

**Files:**
- Modify: `src/server/actions/reviews.ts`

- [ ] **Step 1:** Add `loadReviews(input)` server action: Zod `{ mediaType, tmdbId, seasonNumber?, sort: "popular"|"recent"|"following", cursorId?, limit? }`. Resolve viewer via `requirePgUserId` (or anon). Build `ViewerGateContext` via `getViewerGateContext(userId, anchor)`. Call `getVisibleReviews` with sort: popular→`likeCount desc`, recent→`createdAt desc`, following→additionally filter author∈`follows`. Join each author's canonical `score`/`liked` and the viewer's `likedByViewer` (one `reaction` lookup keyed by reviewId set). Return `{ reviews: ReviewDTO[], nextCursorId }`. This is a POST → never edge-cached.

- [ ] **Step 2:** Add `getReviewHistogram(input)` bridge → `getRatingHistogram(anchor)` returning the histogram DTO.

- [ ] **Step 3:** `yarn typecheck` clean.

- [ ] **Step 4:** Commit.

```bash
git add -A && git commit -m "feat(reviews): loadReviews progress-gated reader + histogram bridge"
```

### Task 3.3: `toggleReviewLike` (TDD-light, mirrors comment like)

**Files:**
- Create: `src/server/actions/review-reactions.ts`
- (reference: `src/server/actions/comment-reactions.ts`)

- [ ] **Step 1:** Implement `toggleReviewLike({ reviewId })`: `requirePgUserId`; find `reaction` by `@@unique([userId, reviewId])`; in a `$transaction`, delete XOR create the `Reaction` (`type: "LIKE"`, `reviewId`) and in/decrement `user_reviews.likeCount`; return `{ ok:true, liked, likeCount } | { ok:false, message }`. After commit, fire-and-forget `notifyLikeBatched` for the review author (skip self-likes). Mirror `comment-reactions.ts` exactly.

- [ ] **Step 2:** Extend the notification describe/render path (`services/notifications/notify.ts` + `features/notifications/describe.ts`) to recognize a review like target (reuse `LIKES_BATCH`; add a review target shape). If `LIKES_BATCH` is comment-only, generalize its payload key to carry `targetType: "comment"|"review"`.

- [ ] **Step 3:** `yarn typecheck` clean.

- [ ] **Step 4:** Commit.

```bash
git add -A && git commit -m "feat(reviews): toggleReviewLike on the polymorphic Reaction table + batched notify"
```

---

## Phase 4 — Composer UI

### Task 4.1: `StarRatingInput` (TDD on the interaction-free mapping; visual by hand)

**Files:**
- Create: `src/components/features/reviews/star-rating-input.tsx`
- Test: `src/components/features/reviews/star-rating-input.test.tsx`

- [ ] **Step 1:** Write a failing render test (Vitest + @testing-library/react if configured; else test the pure `valueToStars`/`starsFromPointer` helper exported from the file):

```ts
import { describe, it, expect } from "vitest";
import { scoreToStars } from "./star-rating-input";
describe("scoreToStars", () => {
  it("renders 1..10 score as 0.5..5 stars", () => {
    expect(scoreToStars(1)).toBe(0.5);
    expect(scoreToStars(10)).toBe(5);
    expect(scoreToStars(null)).toBe(0);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3:** Build the client component: 5 stars, half-star hover/tap (pointer x < half → .5), keyboard accessible (arrows), a clear/unrate affordance, `aria-label`, 40px+ targets, `@/lib/design` + semantic tokens. Export `scoreToStars`. `onChange(score: number|null)`.

- [ ] **Step 4:** Run → PASS; typecheck.

- [ ] **Step 5:** Commit.

```bash
git add -A && git commit -m "feat(reviews): half-star rating input"
```

### Task 4.2: Rebuild `ReviewComposer` on the shared editor

**Files:**
- Modify: `src/components/features/reviews/review-composer.tsx`

- [ ] **Step 1:** Compose: Dialog (desktop) / Drawer (mobile, safe-area) holding — header: `<StarRatingInput>` + heart toggle + optional title `<Input maxLength={140}>`; body: `useRichTextEditor({ anchor, placeholder })` editor + `<RichTextToolbar emoji image spoiler onAddImage>` wiring `<EntityImagePicker anchor multiple max={4}>`; footer: spoiler-scope `<Select>` (NONE/WATCHED/EPISODE/ENDING with season/episode when series) + privacy toggle + submit. Char counter from the serialized body.

- [ ] **Step 2:** On submit: serialize body via `serializeToBody`; collect `images` (≤4); call `submitReviewAction({ ...rating, liked, title, body, spoilerScope, scope*, isPrivate, images })`; handle the AI-scope-suggestion response (offer "Tag & post / Post as chosen / Keep editing" like the comment composer); optimistic close + toast (status-aware: PENDING_REVIEW vs PUBLISHED); track `review_submit`.

- [ ] **Step 3:** Edit mode: prefill from `existing` `OwnReviewDTO` (parse body back into the editor — reuse the comment composer's seed approach).

- [ ] **Step 4:** Typecheck + manual compose on dev server (movie): rating+heart+title+emoji+mention+inline-spoiler+image → posts; verify the row + the canonical `user_ratings` updated.

- [ ] **Step 5:** Commit.

```bash
git add -A && git commit -m "feat(reviews): rich review composer (rating/heart/title/body/scope/images)"
```

---

## Phase 5 — Display UI

### Task 5.1: `RatingHistogram` (server)

**Files:**
- Create: `src/components/features/reviews/rating-histogram.tsx`

- [ ] **Step 1:** Server component: props `{ histogram }` (from `getRatingHistogram`); renders a 1–10 horizontal bar distribution + big average (1-decimal) + total count. Empty state when `total===0`. DESIGN.md tokens, mobile-first.

- [ ] **Step 2:** Typecheck; commit.

```bash
git add -A && git commit -m "feat(reviews): ratings histogram component"
```

### Task 5.2: Rebuild `ReviewCard` + `ReviewLikeButton`

**Files:**
- Modify: `src/components/features/reviews/review-card.tsx`
- Create: `src/components/features/reviews/review-like-button.tsx`

- [ ] **Step 1:** `ReviewLikeButton` (client): optimistic toggle via `toggleReviewLike`, heart icon + count, 40px target, disabled while pending, login-prompt when anon. Mirror discussion `like-button.tsx`.

- [ ] **Step 2:** `ReviewCard`: header (avatar, name→profile link, date/edited, season label, half-star display of `score`, `liked` heart indicator); body via `<RichTextBody body={...}>` (mentions/emoji/inline-spoiler render; client-reveal); images grid (≤4, TMDB `w500` prefix, `unoptimized`); link card; read-more truncation (line-clamp + expand); `<ReviewLikeButton>` footer. Used by detail + profile.

- [ ] **Step 3:** Typecheck; manual render check.

- [ ] **Step 4:** Commit.

```bash
git add -A && git commit -m "feat(reviews): redesigned review card + like button"
```

### Task 5.3: `reviews-section` (server, anon tier) + `reviews-client` (tabs/own/spoiler/likes)

**Files:**
- Modify: `src/components/features/reviews/reviews-section.tsx`
- Create: `src/components/features/reviews/reviews-client.tsx`
- Modify: `src/components/features/reviews/own-review-slot.tsx`

- [ ] **Step 1:** `reviews-section.tsx` (server, edge-safe): fetch `getRatingHistogram` + the anon tier (`getPublicReviews` hard-filtered to `spoilerScope="NONE"`, Popular + Recent) → render `<RatingHistogram>` + initial `<ReviewCard>`s + mount `<ReviewsClient>`. NO `auth()`/`headers()`.

- [ ] **Step 2:** `reviews-client.tsx` (client): tab bar Popular / Recent / Following; on tab/scroll calls `loadReviews` (gets spoiler-tier reviews revealed per the viewer's watermark + `likedByViewer`); merges with SSR cards (dedupe by id); renders spoiler-locked placeholders for scope-hidden reviews; hosts `<OwnReviewSlot>`.

- [ ] **Step 3:** `own-review-slot.tsx`: re-skin to the new card; status badges (PENDING_REVIEW/Private); edit→`ReviewComposer`; delete.

- [ ] **Step 4:** Typecheck + manual: anon load shows only NONE-scope reviews + histogram (verify no viewer data in HTML via view-source); authed load reveals watched-scope spoilers; Following tab works; like toggles + persists.

- [ ] **Step 5:** Commit.

```bash
git add -A && git commit -m "feat(reviews): edge-safe reviews section + client tabs/own/spoiler/likes"
```

### Task 5.4: Wire detail pages + season-level + profile parity

**Files:**
- Modify: `src/app/movie/[...params]/page.tsx`, `src/app/series/[...params]/page.tsx` (pass histogram; series passes optional `seasonNumber`)
- Modify: `src/server/db/postgres/social/public-profile.ts` consumers / profile reviews widget to use the new `ReviewCard`.

- [ ] **Step 1:** Movie/series pages render `<ReviewsSection>` with the histogram fetched server-side. For series, expose a season selector that re-anchors the section to `seasonNumber` (season-level reviews) — reuse the existing season context on the series page.

- [ ] **Step 2:** Profile reviews widget renders the new `ReviewCard` (public reviews only; no viewer-like state needed server-side — likes hydrate client-side).

- [ ] **Step 3:** Typecheck; manual: movie + series + a specific season all show correct reviews + histogram; profile page renders review cards.

- [ ] **Step 4:** Commit.

```bash
git add -A && git commit -m "feat(reviews): wire detail pages (movie/series/season) + profile card parity"
```

---

## Phase 6 — Analytics, cleanup, verification

### Task 6.1: Analytics action type + tracking

**Files:**
- Modify: `src/lib/analytics/types.ts` (add `review_like` to the `ActionType` union)
- Modify: `review-like-button.tsx` (fire-and-forget `trackAction("review_like", …)`)

- [ ] **Step 1:** Add `review_like`; track in the like button (never await). Keep existing `review_submit`.

- [ ] **Step 2:** Typecheck; commit.

```bash
git add -A && git commit -m "feat(reviews): analytics tracking for review likes"
```

### Task 6.2: Remove dead `containsSpoilers` references + `SpoilerShield` retirement

**Files:**
- Search + remove: old boolean usages, the old plain-textarea path, `spoiler-shield.tsx` (replaced by gate + inline-spoiler).

- [ ] **Step 1:** `rg -n "containsSpoilers|SpoilerShield" src` — remove/replace every hit (DTOs now use `spoilerScope`; display uses the gate + `RichTextBody`).

- [ ] **Step 2:** `yarn typecheck && yarn lint && yarn vitest run` — all green.

- [ ] **Step 3:** Commit.

```bash
git add -A && git commit -m "refactor(reviews): retire containsSpoilers + SpoilerShield in favor of scope gate"
```

### Task 6.3: Update the social-features rule + full verification

**Files:**
- Modify: `.claude/rules/social-features.md` (reviews now: rich composer, spoilerScope, shared rich-text module, likes via Reaction.reviewId, histogram; note the new `src/components/features/rich-text/` shared module + `catalog-search.ts`).

- [ ] **Step 1:** Update the Reviews bullets + the FILE MAP rows + add a note about the shared `rich-text/` module (so future sessions know discussion + reviews share it). Add `rich-text` paths to the rule scope list.

- [ ] **Step 2:** Full gate:

Run: `yarn typecheck && yarn lint && yarn vitest run`
Expected: all green.

- [ ] **Step 3:** End-to-end manual pass on dev server (per `docs/LOCAL_REVIEW.md`) with test-auth: compose movie review (all features) → gate status correct → edit → like (count persists, self-like no notify) → spoiler reveal at/below watermark, hidden above → histogram reflects rating → Popular/Recent/Following → season-level series review → mobile drawer/safe-area → anon view-source shows no viewer data and no spoiler bodies. Also re-verify a discussion compose still works (extraction regression).

- [ ] **Step 4:** Commit.

```bash
git add -A && git commit -m "docs(rules): reviews redesign — shared rich-text module, scope gate, likes, histogram"
```

---

## Self-review notes (coverage check)

- Spec §A extraction → Phase 0 (0.2–0.5). §B schema → 1.3/1.4, 2.1. §C composer → 4.1/4.2. §D spoiler/edge-cache → 2.3 (anon hard-filter + `getVisibleReviews`), 3.2 (`loadReviews`), 5.3 (anon section + client tier). §E display → 5.1–5.4. §F likes → 1.3 (Reaction.reviewId), 3.3, 5.2. §G moderation/notify → 3.1 (gate), 3.3 (notify). §H histogram → 2.2, 5.1. §I analytics → 6.1; designed-for-later items intentionally absent.
- Inline-spoiler (differentiator) → 1.1/1.2.
- Invariants: edge-cache (5.3 no auth/headers, anon NONE-only), spoiler-gate reuse (2.3/3.2), natural keys (schema unchanged on episode FK), audited txn (3.1), AI submit-only (3.1).
- Naming consistency: `starsToScore`/`scoreToStars` (action vs component — both defined, distinct), `getRatingHistogram` (DB) vs `getReviewHistogram` (action bridge), `loadReviews`, `toggleReviewLike`, `getVisibleReviews`, `RichTextBody`, `useRichTextEditor`, `EntityImagePicker`, `RichTextToolbar`, `MediaAnchor`.
