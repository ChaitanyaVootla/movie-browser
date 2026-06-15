# Reviews — Rich Composer & Display Redesign

**Date:** 2026-06-15
**Branch:** `feat/social-phase0` (LOCAL-ONLY, not in prod → no backward-compat constraints; refactor freely)
**Status:** Design approved (all recommendations accepted; build autonomously)

## Goal

Bring the **reviews** feature up to (and past) the discussion composer's polish bar, turn
reviewing + rating into one coherent act, and lay a shared, analytics-friendly foundation we
can extend for years. Reviews must work at every anchor level discussions support
(movie / series / **season** this pass; episode is the same components as a fast-follow).

## Current state (the gap)

Reviews are the least-polished social surface: a plain `<textarea>` dialog with two toggles
(spoilers / private). No rating in the composer, no title, no rich text, no emoji/mentions, no
images, no likes, no sort, no progress-aware spoilers. Rating (`user_ratings`: `score` 1–10 +
`rating` thumb ±1) is a wholly separate flow; `ReviewCard` merely read-joins the author's score
as a badge. What's already right: AI moderation gate (fail-closed), edge-cache-safe read path,
and a schema already generalized to movie/series/season/episode via natural keys + per-rewatch
(`watchEventId`).

The **discussion** composer, by contrast, is a Tiptap rich editor with emoji (popover + inline
`:`), entity mentions (`@user`, `[[movie]]`, cast, episodes), catalog-driven image attach (no
upload — picks from our TMDB `images` table, stores a file path), link/trailer unfurl cards, a
spoiler-scope selector, and an AI scope-suggestion step. Its editor pieces are generic with zero
discussion-domain logic — they should be **shared infrastructure**, not discussion-owned.

## Locked decisions

1. **Rating + review = one act, two records.** The composer shows a half-star control (0.5–5)
   mapped to the existing `user_ratings.score` (1–10) via `score = round(stars × 2)` (half-steps
   give exactly 10 values), plus a **"loved it" heart** (new `user_ratings.liked`). The thumb
   (±1) retires from the review flow (stays as the quick-rate action on cards elsewhere). An
   **unrated review abstains** from the average (NULL score, excluded from aggregates) — never
   counts as zero. Submitting a review upserts the canonical `user_ratings` row in the **same
   audited transaction**.
2. **Optional title** (`title VarChar(140)`), shown when present.
3. **Body = the same canonical token string as comments** (emoji, `@mentions`, `[[movie]]`,
   inline spoiler blocks, link refs) → reuse the comment serializer + renderer verbatim.
4. **Reviews adopt the comment `spoilerScope` model** (`SpoilerScope` enum + `scopeSeason` /
   `scopeEpisode` / `scopeTmdbEpisodeId`), **replacing** the bare `containsSpoilers` boolean.
   Reuse `spoiler-gate.ts` for progress-aware reveal.
5. **Images:** `images Json?` — capped array (≤4) of `{entityType, tmdbId, imagePath}`, sourced
   from the existing catalog image picker (no upload, no CSP/abuse surface), display-only/loose.
6. **Likes** reuse the **existing polymorphic `Reaction` table** (add a nullable `reviewId`
   anchor) + a denormalized `user_reviews.likeCount`. Like → batched notification via the
   Phase-D `notifyLikeBatched`.
7. **Display:** ratings histogram + average (over `user_ratings`, NULL-excluded), **Popular /
   Recent** tabs (anon-cacheable) + **Following** tab (viewer-scoped, client-loaded),
   redesigned `ReviewCard`, like button, read-more, own-review slot, profile parity.
8. **Extract a shared rich-text module** (`src/components/features/rich-text/`) from the generic
   discussion editor pieces; update discussion imports; behavior byte-identical. Both discussion
   and reviews import it. Inline-spoiler becomes a first-class editor mark in the shared module
   (lights up in discussions too — consistency).
9. **Designed-for, built-later (no dead schema now):** structured quick-tags UI, AI "what
   reviewers say" digest, share-cards, episode-level review UI, comments-on-reviews.

## Architecture

### A. Shared rich-text foundation (extraction — Phase 0 of implementation)

Create `src/components/features/rich-text/`. Move + generalize the generic discussion pieces;
the discussion feature then imports from here. The shared **anchor type** generalizes
`DiscussionAnchor` → `MediaAnchor` (`{ kind: "movie" | "series", movieId?/seriesId?/tmdbId,
seasonNumber?, episodeNumber? }`) so mention-entity scoping and image-picker defaults work
identically for reviews.

| From (discussion/) | To (rich-text/) | Notes |
|---|---|---|
| `comment-editor-serialize.ts` | `serialize.ts` | Pure; add inline-spoiler token round-trip. |
| `emoji-picker-button.tsx` | `emoji-picker.tsx` | Generic as-is. |
| `emoji-suggestion-list.tsx` | `emoji-suggestion-list.tsx` | Generic as-is. |
| `comment-mention-chip.tsx` | `mention-chip.tsx` | Generic as-is. |
| `mention-suggestion-list.tsx` | `mention-suggestion-list.tsx` | Generic as-is. |
| `comment-editor-extensions.tsx` | `extensions.tsx` | Parametrize `buildMentionExtension(anchor)` on `MediaAnchor`; add the inline-spoiler mark. |
| `use-comment-editor.ts` | `use-rich-text-editor.ts` | Anchor + placeholder + extension-config args; no domain logic. |
| `comment-image-picker.tsx` | `entity-image-picker.tsx` | Anchor becomes optional default. |
| `comment-body.tsx` | `rich-text-body.tsx` | Generic renderer (mentions, emoji, inline-spoiler, link cards). Keep client-reveal behavior. |

Server actions `searchMentionEntities` + `getEntityImages` move from
`src/server/actions/discussion-search.ts` → `src/server/actions/catalog-search.ts` (generic
catalog reads; no discussion coupling). `DiscussionAnchorSchema` → `MediaAnchorSchema` in a
shared types location.

**Inline-spoiler mark:** add a Tiptap mark + a toolbar button to the shared editor, serialized to
the inline-spoiler token the renderer already understands. This gives both discussion and review
bodies tap-to-reveal inline spoilers — the Letterboxd/IMDb gap, and the differentiator.

**Verification gate:** after extraction, `yarn typecheck` clean, existing discussion editor tests
(`*-serialize.test.ts` etc.) green, and a manual discussion compose/post on the dev server behaves
identically before any review work begins.

### B. Data model changes (Prisma + raw SQL)

**`UserReview`** — add `title String? @db.VarChar(140)`; replace `containsSpoilers Boolean` with
`spoilerScope SpoilerScope @default(NONE)` + `scopeSeason Int?` + `scopeEpisode Int?` +
`scopeTmdbEpisodeId Int?`; add `images Json?`; add `likeCount Int @default(0)`; add
`reactions Reaction[]` relation. Body stays `@db.Text` (now canonical token string). Indexes:
keep existing; add `@@index([movieId, status, likeCount(sort: Desc)])` +
`@@index([seriesId, seasonNumber, status, likeCount(sort: Desc)])` for the Popular sort.

**`user_ratings`** — add `liked Boolean @default(false)`. Update the "never neither" CHECK in
`postgres/init/04-ugc-constraints.sql` to `(score IS NOT NULL OR rating IS NOT NULL OR liked =
true)`. (Heart-only rows are valid — Letterboxd parity.)

**`Reaction`** — add `reviewId Int? @map("review_id")` + `review UserReview?` relation
(`onDelete: Cascade`) + `@@unique([userId, reviewId])` + `@@index([reviewId])`. The existing
`@@unique([userId, commentId])` stays. (The model's own comment already anticipated this.)

**`series_progress`** watermark columns the gate reads (`maxSeasonNumber`, `maxEpisodeNumber`,
`status`) are unchanged.

Raw-SQL is hash-gated in CI (`04-ugc-constraints.sql` + schema md5) — the CHECK change re-fires
the apply automatically. Local: `apply-ugc-constraints.ts` after `db:push`.

### C. Reviews composer (`features/reviews/review-composer.tsx`, rebuilt)

The shared `useRichTextEditor` editor wrapped with a review header/footer:

- **Header:** half-star rating (0.5–5) + heart toggle + optional title input.
- **Body:** shared rich editor — emoji, mentions, inline-spoiler, images (≤4 via
  `entity-image-picker`), link unfurl on publish.
- **Footer:** spoiler-scope selector (with AI scope-suggestion override, reused from comments),
  privacy toggle, image button, emoji button, inline-spoiler button, submit.
- Desktop Dialog / mobile Drawer + safe-area (as today), char counter, optimistic save,
  edit-prefill from `existing`.

On submit, `submitReviewAction` →: validate; resolve final `spoilerScope` (user choice vs AI
suggestion via `isStricterScope`); run `gateText` for toxicity (skip if private) → `status`;
in one `auditedTransaction`: upsert `user_reviews` row + upsert canonical `user_ratings`
(score/heart); fire-and-forget link unfurl on the first body link (reuse `unfurlFirstLink`).

### D. Spoiler model & edge-cache (preserves the hard invariant)

- **Anon-cacheable tier** (in ISR HTML): `spoilerScope = NONE` AND `status = PUBLISHED` AND not
  private — exactly the comment public predicate (`visibleScopeWhere`).
- **Spoiler tier** (whole-review spoiler, scope ≠ NONE): **not** in cached HTML. Loaded via a new
  `loadReviews` server action (POST, never edge-cached) that applies `getViewerGateContext` +
  `visibleScopeWhere`/`isScopeVisible` against the viewer's watermark → reveal if watched, else a
  `locked-teaser`-style placeholder. Mirrors `loadComments`.
- **Inline-spoiler blocks** inside an otherwise-NONE review ship in HTML as blurred markup,
  revealed client-side (safe — the body itself is non-spoiler-scoped).

### E. Reviews display (`features/reviews/*`, redesigned)

- **`reviews-section.tsx`** (server): histogram + average header; **Popular / Recent** lists from
  `getPublicReviews` (anon-cacheable, the NONE+PUBLISHED+public tier); mounts the client
  `reviews-client` for the Following tab, spoiler-tier reviews, own review, and likes.
- **`rating-histogram.tsx`** (server): 1–10 distribution bar chart + average + count, from
  `getRatingHistogram(anchor)`.
- **`review-card.tsx`** (shared by detail + profile): title, half-star display, heart, score
  badge, author, date/edited, like button (client, optimistic), read-more truncation,
  `rich-text-body` rendering (mentions/emoji/inline-spoiler), images, link card.
- **`own-review-slot.tsx`**: edit/delete + status badges (PENDING_REVIEW / Private), as today,
  re-skinned.
- Sort: Popular = `likeCount` desc (new index); Recent = `createdAt` desc; Following =
  viewer-scoped server action filtered to `follows`.

### F. Likes (`features/reviews/review-like-button.tsx` + `actions/review-reactions.ts`)

Mirror `toggleLike` exactly, keyed on `reviewId`: atomic txn (delete XOR create `Reaction` +
in/decrement `user_reviews.likeCount`), idempotent via `@@unique([userId, reviewId])`, returns
`{ ok, liked, likeCount }`. Optimistic client button. Reuse the discussion `like-button.tsx`
visual as a shared primitive if trivially generic, else a thin review variant.

### G. Moderation & notifications (reuse)

- Body re-gated via `gateText` on every non-private submit/edit (submit-only, cost-safe). Private
  skips the gate (→ PUBLISHED). Catalog images need no moderation (our own posters/stills). AI
  never runs on render/crawler paths.
- Like on your review → **batched** notification via Phase-D `notifyLikeBatched` (never
  one-per-like). New `NotificationType` reuse if `LIKES_BATCH` already covers it; extend the
  describe/render path to recognize a review target.

### H. Aggregates (histogram)

`getRatingHistogram(anchor)` → `{ buckets: Record<1..10, number>, average: number | null, total:
number }`, computed via indexed `GROUP BY score` over `user_ratings` for the unit (NULL scores
excluded). Add `@@index([movieId, score])` / `@@index([seriesId, seasonNumber, score])` to
`user_ratings`. Cheap under ISR (`revalidate=3600`) — computed at most once per window. If it ever
gets hot at scale, denormalize into a per-title stats row later (documented, not built).

### I. Analytics & long-run posture

First-class/queryable/indexed: `score`, `liked`, `spoilerScope`, `likeCount`, granularity keys.
Loose/JSON: body, title (display), images. ClickHouse: keep `review_submit`; add `review_like`
action type (`src/lib/analytics/types.ts`), fire-and-forget. **Structured quick-tags** (mood/pace/
"would rewatch" → per-title % stats + browse filters + taste vectors) and the **AI "what reviewers
say" digest** (click-gated + cached like `thread_summaries`) are designed-for via the
separate-entity + natural-key shape — added when their UI lands, no dead schema now.

## Reuse / refactor map (summary)

- **Extract & share:** rich-text editor, emoji, mentions, image picker, serializer, body renderer,
  catalog-search actions, `MediaAnchor` type. Discussion + reviews both consume.
- **Reuse as-is:** `spoiler-gate.ts`, `gateText`/`gate-policy.ts`, `Reaction` table + toggle
  pattern, `notifyLikeBatched`, `auditedTransaction`, `requirePgUserId`, `unfurlFirstLink`,
  catalog image actions.
- **Rewrite:** review composer, review card, reviews section, own-review slot, spoiler shield →
  real gate, `loadReviews` action, histogram.
- **Delete:** plain-textarea composer internals, `containsSpoilers` boolean + its UI, thumb in the
  review flow, the "score badge only if author happened to rate" disconnect.

## Invariants preserved

Edge-cache (no `auth()`/`headers()` in ISR render trees — viewer state hydrates client-side);
spoiler-gate anon tier = scope NONE + PUBLISHED + circleId NULL; natural keys for episodes (never
FK `episodes`/`seasons`; FK only stable `series`); `requirePgUserId`; audited mutations via
`auditedTransaction`; AI only on submit; DESIGN.md law (mobile-first 390px, `@/lib/design`
primitives, semantic tokens, 40px+ touch targets, safe-area; no edits under `components/ui/`). See
`.claude/rules/social-features.md`, `audit-log.md`, `cdn.md`.

## Out of scope (fast-follow)

Episode-level review UI (same components, parametrized); comments/replies *on* reviews;
structured quick-tags UI; AI review digest; share-card generation; helpfulness-vs-like
distinction.

## Testing

TDD where it pays. Unit: score↔star mapping; serializer inline-spoiler round-trip; histogram
aggregation; review spoiler-gate (`loadReviews`) reusing `spoiler-gate` test patterns; review like
toggle/count. Regression: existing discussion editor/serialize tests stay green post-extraction.
Integration: dev server under PM2 (`mb-dev`, DB :5436, `USER_DATA_SOURCE=postgres`,
`ENABLE_TEST_AUTH=true`) with test-auth — compose a movie review (rating+heart+title+emoji+
mention+inline-spoiler+image), verify gate status, edit, like, spoiler reveal at/below watermark,
histogram, Popular/Recent/Following, season-level review, mobile drawer, and that an anon load
shows no viewer data. Per `docs/LOCAL_REVIEW.md`. Restart `mb-dev` after every `db push`/`prisma
generate` (stale client rejects new columns).

## Open risks

- **Extraction touches discussion on an in-flux branch** — mitigated by byte-identical behavior +
  the verification gate before any review work.
- **`MediaAnchor` generalization** must not change discussion mention/image scoping semantics —
  covered by discussion regression tests + manual compose.
- **Histogram cost** at scale — accepted under ISR now; denormalization path documented.
