# Phase 2 (Identity Artifacts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Local-only: no deploys, no prod SSH, no CloudFront changes (deploy follow-ups are flagged inline). Phase 0/1 deliverables are referenced by name and NOT redefined here — see `docs/superpowers/specs/2026-06-12-social-virality-roadmap-design.md` §4.2/§5.

## Goal

Ship the identity-artifact layer of the Social & Virality Roadmap (Phase 2 row):
list CRUD UI (gapped-position reorder, collaborative, ranked, per-item notes,
comments-on-lists, discovery), dynamic OG share cards for every public object
(profiles, lists, reviews, Wrapped, taste-match), the Wrapped/year-in-review page,
taste compatibility (`/u/[a]/vs/[b]` + profile module), Feed v1 at `/feed`,
user search + taste-based follow suggestions, and the per-platform shareability audit.

## Phase 0/1 deliverables this plan consumes (by name — already exist)

- Tables: `lists`, `list_items` (gapped `position`, `addedById`), `watch_events`
  (`source`, `isPrivate`), `series_progress`, `user_ratings` (`score`, `ratedAt`,
  thumb `rating`), `user_reviews`, `comments` (with `listId` anchor + index),
  `reactions`, `notifications`, `reports`, `blocks`, `follows`, `user_stats`
  (lazy dirty-snapshot), `users.username` + `lower(username)` unique.
- Query helpers: `publicComments` (bakes `circleId IS NULL AND status='PUBLISHED'`),
  `withoutBlocked` (block/mute filtering — MUST wrap every new social read here).
- Pages/components: `/u/[username]` profile (with reserved compatibility slot and
  pinned-lists section), phase-1 `<CommentThread>` + comment server actions
  (accept `listId` anchor), notification writer, Four-Favorites list machinery.
- Raw-SQL constraints file: `postgres/init/04-ugc-constraints.sql` + hash-gated apply.

## Architecture decisions (made in this plan)

1. **OG images are origin-rendered, edge-cached, never per-request for crawlers.**
   Route handlers under `/og/*` (NOT the `opengraph-image.tsx` file convention — we
   need explicit `Cache-Control` and cross-page reuse) return `ImageResponse`
   (`next/og`, satori) with `public, max-age=300, s-maxage=86400,
   stale-while-revalidate=604800`. CloudFront's default behavior respects origin
   cache headers, so each card renders ~once/day/edge-chain (Origin Shield collapses).
   Satori CPU cost on the 2-vCPU box is acceptable only behind that cache.
   **Satori cannot decode WebP** → OG images use TMDB JPEG urls
   (`image.tmdb.org/t/p/w342{posterPath}`), never `image.themoviebrowser.com/*.webp`.
   Fonts are local TTFs read once at module scope.
2. **User taste vectors are STORED** (`user_taste_vectors`, vector(1024)), not
   computed lazily. Justification: (a) follow-suggestions need a pgvector `<=>`
   KNN scan — impossible over lazily-computed vectors; (b) the feed reads the
   vector on every page; (c) recompute is 3 aggregate queries (~ms) with the same
   dirty-flag lifecycle as `user_stats`; (d) cost is 4KB/user.
3. **Privacy/caching split**: ISR/anon-cacheable HTML contains ONLY public data
   (public lists, public profiles, snapshot Wrapped). Anything viewer-dependent
   (private list for its owner, compatibility module, feed) loads client-side via
   server actions (uncached POSTs) — per design invariant 8.
4. **Compatibility formula and feed ranking are pure functions** in `src/lib/social/`
   with unit tests; server code only assembles inputs.
5. **Fable rule**: all Wrapped/compatibility/share-card copy is static template
   strings over numbers (`src/lib/social/wrapped-copy.ts`). No LLM call anywhere in
   this phase; no sentence ever characterizes a user ("You watched 214 hours", never
   "You're a horror fiend").
6. **No fan-out writes** (invariant 6): feed is query-time fan-in; the only new
   notification is `LIST_COLLAB_INVITE` (direct recipient).

## Tech Stack

Next 16.1.0 (App Router, Turbopack), React 19, Prisma 6 + Postgres (pgvector,
pg_trgm), `next/og` ImageResponse, next-auth v5 (`auth()` from `@/lib/auth`,
`requireUserIdForDb()` from `@/lib/user-id`), Cohere Embed v4 1024-dim embeddings
(existing, on `movies.embedding`/`series.embedding`), framer-motion (Reorder),
@tanstack/react-query, zod v4, vitest, Playwright. Design system: `DESIGN.md` +
`@/lib/design` constants + `<PageMain>`/`<SectionHeading>`.

## File Structure (new files)

```
prisma/schema.prisma                                   (extend: ListCollaborator, UserTasteVector, users trgm indexes, reports.listId)
src/lib/social/list-position.ts                        (gapped-position math, pure)
src/lib/social/list-position.test.ts
src/lib/social/compatibility.ts                        (formula, pure)
src/lib/social/compatibility.test.ts
src/lib/social/feed-ranking.ts                         (scoring + interleave, pure)
src/lib/social/feed-ranking.test.ts
src/lib/social/wrapped-copy.ts                         (static neutral copy templates)
src/server/services/taste-vector.ts                    (compute/store/markDirty)
src/server/db/postgres/lists.ts                        (list reads)
src/server/db/postgres/feed.ts                         (feed source queries)
src/server/db/postgres/social-users.ts                 (user search, suggestions, compatibility inputs, wrapped aggregates)
src/server/actions/lists.ts
src/server/actions/feed.ts
src/server/actions/social-users.ts                     (searchUsers, getCompatibility, follow suggestions)
src/server/og/fonts/{Montserrat-Regular,Montserrat-SemiBold,Montserrat-Bold}.ttf
src/server/og/fonts.ts
src/server/og/theme.ts                                 (hex tokens mirroring DESIGN.md)
src/server/og/frame.tsx                                (1200x630 OgFrame + poster strip)
src/app/og/profile/[username]/route.tsx
src/app/og/list/[username]/[slug]/route.tsx
src/app/og/review/[id]/route.tsx
src/app/og/wrapped/[username]/[year]/route.tsx
src/app/og/vs/[a]/[b]/route.tsx
src/app/u/[username]/lists/page.tsx
src/app/u/[username]/list/[slug]/page.tsx              (ISR 300)
src/app/u/[username]/wrapped/[year]/page.tsx           (ISR 3600, snapshot-only)
src/app/u/[username]/vs/[b]/page.tsx                   (dynamic)
src/app/feed/page.tsx                                  (dynamic shell)
src/components/features/lists/*                        (editor, item-row, reorder, collaborators, create-dialog, appears-in-lists)
src/components/features/feed/*                         (feed-client, cards, follow-suggestions)
src/components/features/profile/compatibility-module.tsx (client island into reserved slot)
docs/superpowers/specs/2026-06-12-shareability-audit-checklist.md
e2e/seo/og-cards.spec.ts
```

---

## Task 1 — Schema: collaborators, taste vectors, user trgm, reports anchor

- [ ] Add to `prisma/schema.prisma` (next to `List`):

```prisma
model ListCollaborator {
  id          Int      @id @default(autoincrement())
  listId      Int      @map("list_id")
  userId      Int      @map("user_id")
  invitedById Int?     @map("invited_by_id")
  createdAt   DateTime @default(now()) @map("created_at")

  list      List  @relation(fields: [listId], references: [id], onDelete: Cascade)
  user      User  @relation("listCollaborations", fields: [userId], references: [id], onDelete: Cascade)
  invitedBy User? @relation("listCollabInvites", fields: [invitedById], references: [id], onDelete: SetNull)

  @@unique([listId, userId])
  @@index([userId])
  @@index([invitedById])
  @@map("list_collaborators")
}

model UserTasteVector {
  userId     Int                          @id @map("user_id")
  embedding  Unsupported("vector(1024)")?
  ratedCount Int                          @default(0) @map("rated_count")
  dirty      Boolean                      @default(true)
  computedAt DateTime?                    @map("computed_at")
  updatedAt  DateTime                     @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_taste_vectors")
}
```

- [ ] On `User`: add back-relations `listCollaborations ListCollaborator[] @relation("listCollaborations")`,
      `listCollabInvites ListCollaborator[] @relation("listCollabInvites")`, `tasteVector UserTasteVector?`.
- [ ] On `User`: trigram indexes (MUST live in schema.prisma or `db push` drops them —
      performance.md §8): `@@index([username(ops: raw("gin_trgm_ops"))], type: Gin)`
      and `@@index([name(ops: raw("gin_trgm_ops"))], type: Gin)`.
- [ ] `reports`: add nullable `listId Int? @map("list_id")` + relation (`onDelete: Cascade`
      — a list delete may drop its reports) + `@@index([listId])`; extend the report-reason
      CHECK in `postgres/init/04-ugc-constraints.sql` anchor-arity line to include `list_id`
      (lists/list notes are NOT AI-gated in v1; the report flow is their moderation surface).
- [ ] No new CHECKs otherwise. Run FK-index audit (performance.md §5 pattern) — every new
      FK above carries an index.
- [ ] Verify: `yarn db:push` round-trips (LOCAL DB ONLY: prefix every prisma command with
      `DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser'`); `yarn db:generate`; `yarn typecheck`.
- [ ] Commit: `feat(schema): phase-2 social tables — list collaborators, user taste vectors, user trgm search, list reports`

## Task 2 — Pure logic: gapped list positions

- [ ] `src/lib/social/list-position.ts`:

```typescript
/** Gapped-integer ordering for list_items.position (design doc §4.2: drag = 1 UPDATE). */
export const POSITION_GAP = 1024;

/** Position for appending after the current max (or first item). */
export function appendPosition(maxPosition: number | null): number {
  return maxPosition === null ? POSITION_GAP : maxPosition + POSITION_GAP;
}

export interface MoveResult {
  /** New position for the moved item, when a single UPDATE suffices. */
  position: number | null;
  /** True when neighbors are adjacent (gap exhausted) — caller must renormalize. */
  needsRenumber: boolean;
}

/**
 * Position when dropping between two neighbors (either may be absent at the ends).
 * `before` = item that will precede, `after` = item that will follow.
 */
export function movePosition(before: number | null, after: number | null): MoveResult {
  if (before === null && after === null) return { position: POSITION_GAP, needsRenumber: false };
  if (before === null) {
    const p = Math.floor((after as number) / 2);
    return p >= 1 && p < (after as number)
      ? { position: p, needsRenumber: false }
      : { position: null, needsRenumber: true };
  }
  if (after === null) return { position: before + POSITION_GAP, needsRenumber: false };
  const mid = Math.floor((before + after) / 2);
  return mid > before && mid < after
    ? { position: mid, needsRenumber: false }
    : { position: null, needsRenumber: true };
}

/** Full renumber: ordered ids → [{id, position: (i+1)*GAP}]. */
export function renumber<T extends { id: number }>(ordered: T[]): { id: number; position: number }[] {
  return ordered.map((it, i) => ({ id: it.id, position: (i + 1) * POSITION_GAP }));
}
```

- [ ] `src/lib/social/list-position.test.ts`: append on empty/non-empty; midpoint
      between 1024/2048 → 1536; move-to-top halves; adjacent positions (5,6) →
      `needsRenumber`; move before position 1 → `needsRenumber`; renumber output gaps.
- [ ] Verify: `yarn vitest run src/lib/social/list-position.test.ts`; commit
      `feat(lists): gapped position math + tests`.

## Task 3 — Pure logic: taste-compatibility formula

- [ ] `src/lib/social/compatibility.ts` — the exact formula (document it in JSDoc):

```typescript
export interface SharedScore { key: string; title: string; mediaType: "movie" | "series"; posterPath: string | null; scoreA: number; scoreB: number }
export interface CompatibilityInput {
  sharedScores: SharedScore[];           // titles BOTH scored 1-10 (private rows excluded upstream)
  likedA: Set<string>; likedB: Set<string>; // liked = thumb +1 OR score >= 7; keys "m:<id>"/"s:<id>"
  tasteCosine: number | null;            // cosine(tasteVectorA, tasteVectorB), null if either missing
}
export interface CompatibilityResult {
  score: number | null;                  // 0-100, null = not enough shared taste
  components: { scoreSim: number | null; likedSim: number | null; tasteSim: number | null };
  sharedCount: number;
  sharedFavorites: SharedScore[];        // both >= 8 (or both liked), top 6 by scoreA+scoreB
  fightAbout: SharedScore[];             // |scoreA-scoreB| >= 4, top 6 by diff
}
```

  Components (each `null` when underpowered, weights renormalized over non-null):
  - `scoreSim` (w 0.5): `n = sharedScores.length`; null if `n < 3`. Pearson `r` over
    the two score arrays; if either side has zero variance fall back to
    `r = 1 - 2 * meanAbsDiff / 9` (agreement in [-1,1]). Then
    `scoreSim = ((r + 1) / 2) * (n / (n + 5))` — shrinkage prior k=5 so 3 shared
    titles can't yield "98% compatible".
  - `likedSim` (w 0.3): null if `min(|likedA|,|likedB|) === 0`. Overlap coefficient
    `|A∩B| / min(|A|,|B|)` (NOT plain Jaccard — it punishes library-size asymmetry),
    spread with `Math.sqrt`.
  - `tasteSim` (w 0.2): null if `tasteCosine === null`; else
    `clamp01((tasteCosine - 0.2) / 0.6)` (Cohere same-domain cosines cluster high;
    0.2→0, 0.8→1).
  - `score = Math.round(100 * Σ wᵢsᵢ / Σ wᵢ)`; null when all components null.
- [ ] `src/lib/social/compatibility.test.ts`: identical scores → high; inverted
      scores → low; n<3 → scoreSim null; shrinkage monotonic in n; zero-variance
      fallback; overlap coefficient vs asymmetric sets; tasteCosine rescale clamps;
      weight renormalization when components missing; fightAbout/sharedFavorites
      selection + ordering; all-null → score null.
- [ ] Verify + commit: `feat(social): taste-compatibility formula + tests`.

## Task 4 — Pure logic: feed ranking

- [ ] `src/lib/social/feed-ranking.ts`:

```typescript
export type FeedItemType =
  | "FOLLOWED_REVIEW" | "FOLLOWED_MILESTONE" | "FOLLOWED_LIST"
  | "POPULAR_REVIEW" | "RELEASE" | "TRAILER" | "PUBLIC_LIST";

export interface RankableItem {
  type: FeedItemType;
  key: string;                 // "<type>:<id>" — dedupe key
  createdAt: Date;             // event time (review createdAt, episode airDate, ...)
  tasteSim: number | null;     // cosine(viewer taste, title embedding) in [0,1], null unknown
}

/** Transparent ranking: score = sourceWeight × recencyDecay × tasteFactor. */
const SOURCE_WEIGHT: Record<FeedItemType, number> = {
  FOLLOWED_REVIEW: 3.0, RELEASE: 2.5, FOLLOWED_MILESTONE: 2.0, FOLLOWED_LIST: 2.0,
  TRAILER: 1.2, POPULAR_REVIEW: 1.0, PUBLIC_LIST: 0.8,
};
const HALF_LIFE_HOURS: Record<FeedItemType, number> = {
  FOLLOWED_REVIEW: 72, FOLLOWED_MILESTONE: 48, FOLLOWED_LIST: 96,
  POPULAR_REVIEW: 48, RELEASE: 168, TRAILER: 168, PUBLIC_LIST: 96,
};

export function scoreFeedItem(item: RankableItem, now: Date): number {
  const ageHours = Math.max(0, (now.getTime() - item.createdAt.getTime()) / 3_600_000);
  const recency = Math.pow(0.5, ageHours / HALF_LIFE_HOURS[item.type]);
  const taste = item.tasteSim === null ? 0.75 : 0.5 + 0.5 * item.tasteSim;
  return SOURCE_WEIGHT[item.type] * recency * taste;
}

/** Sort by score desc, dedupe by key, then enforce ≤2 consecutive items of one type. */
export function rankAndInterleave<T extends RankableItem>(items: T[], now: Date, limit: number): T[]
```

  `rankAndInterleave`: stable sort by `scoreFeedItem` desc (tiebreak `createdAt`
  desc then `key`), dedupe, then greedy pass: when the last 2 emitted share a type,
  emit the next-best item of a different type (if none exists, allow the run).
- [ ] `src/lib/social/feed-ranking.test.ts`: deterministic ordering; recency decay
      halves at half-life; followed review outranks equal-age popular review; null
      tasteSim = 0.75 factor; dedupe; interleave breaks 3-runs but degrades
      gracefully when only one type remains; limit respected.
- [ ] Verify + commit: `feat(feed): transparent ranking function + tests`.

## Task 5 — Taste-vector service

- [ ] `src/server/services/taste-vector.ts` (`import "server-only"`). Lifecycle is a
      carbon copy of phase-0 `user_stats`: `markTasteVectorDirty(userId)` (upsert
      `dirty=true`; called fire-and-forget from phase-0 rating + diary write actions —
      add those two call sites), and `getTasteVector(userId)` which recomputes when
      `dirty || computedAt > 24h`.
- [ ] Computation (define exactly): over the user's titles **that have embeddings**,
      bucket by signal — positive w=1.0 (`score >= 8 OR rating = 1`), neutral w=0.25
      (logged/watched with no rating, or score 5–7), negative w=0.5 subtracted
      (`score <= 4 OR rating = -1`); most recent 500 titles per bucket. One raw query
      per media table using pgvector aggregates:

```sql
SELECT bucket, COUNT(*)::int AS n, AVG(embedding)::text AS centroid
FROM (
  SELECT m.embedding,
         CASE WHEN ur.score >= 8 OR ur.rating = 1 THEN 'pos'
              WHEN ur.score <= 4 OR ur.rating = -1 THEN 'neg'
              ELSE 'neu' END AS bucket
  FROM user_ratings ur JOIN movies m ON m.id = ur.movie_id
  WHERE ur.user_id = $1 AND m.embedding IS NOT NULL
  ORDER BY COALESCE(ur.rated_at, ur.created_at) DESC LIMIT 1500
) t GROUP BY bucket
```

      (plus the series twin, plus a neutral-bucket query over `watch_events`
      `source='LOGGED'` titles without ratings). Parse `::text` vectors to
      `number[]`, combine in JS:
      `v = (1.0·nP·avgP + 0.25·nN·avgN − 0.5·nD·avgD) / (1.0·nP + 0.25·nN + 0.5·nD)`,
      L2-normalize; require `nP >= 3` else store NULL embedding. Write back with
      `prisma.$executeRaw` (`embedding = $1::vector`), `dirty=false`, `computedAt=now()`,
      `ratedCount`.
- [ ] Export `cosineFromDb(a: number[], b: number[])`-free path: pair cosine is done
      in SQL where possible (`1 - (a.embedding <=> b.embedding)`); JS fallback only in
      tests.
- [ ] Verify: `yarn typecheck`; manual: `npx tsx -e` snippet recomputing for a seeded
      user and printing `ratedCount`. Commit: `feat(social): stored user taste vectors (dirty-snapshot lifecycle)`.

## Task 6 — List query layer + server actions

- [ ] `src/server/db/postgres/lists.ts`: `getListBySlug(username, slug)` (owner join,
      items ordered by `position` with movie/series/person cards, collaborators,
      `addedBy` attribution), `getPublicListsForUser(userId)`, `getListsContaining(
      mediaType, id, limit 3)` + `countPublicListsContaining`, `getEditableList(
      listId, userId)` (owner or collaborator). ALL public reads filter
      `isPublic: true` and wrap viewer-dependent paths in phase-1 `withoutBlocked`.
- [ ] `src/server/actions/lists.ts` (`"use server"`, zod-validated per
      `.claude/rules/server-actions.md`, pino `dataLogger`, `requireUserIdForDb()`):
  - `createList({ name, description?, isPublic, isRanked, isCollaborative })` —
    slugify via the existing slug helper in `src/lib/seo` (grep `slugify`; reuse,
    don't duplicate), uniquify with `-2` suffix on `@@unique([ownerId, slug])` P2002.
  - `updateList`, `deleteList` (owner only; delete blocked-on nothing — list_items
    cascade per phase-0 FK policy), `togglePinned` (max 5 pinned, app-enforced).
  - `addListItem({ listId, movieId? | seriesId? | personId?, note? })` — position =
    `appendPosition(max)`, stamp `addedById`, atomic `itemCount` increment; P2002 →
    friendly "already in list".
  - `removeListItem`, `updateItemNote` (note ≤ 500 chars).
  - `moveListItem({ listId, itemId, beforeId?, afterId? })` — resolve neighbor
    positions, `movePosition()`; on `needsRenumber` run `renumber()` over the full
    ordered list in ONE transaction (`updateMany` per row is fine at list scale,
    cap lists at 500 items in `addListItem`).
  - `inviteCollaborator({ listId, username })` — owner only, requires
    `isCollaborative`, target must be public profile + not blocked either direction;
    writes `ListCollaborator` + a `LIST_COLLAB_INVITE` notification (direct
    recipient — invariant 6). `removeCollaborator` (owner, or self-leave).
  - Every mutation: `revalidatePath("/u/<owner>/list/<slug>")` +
    `revalidatePath("/u/<owner>")`; privacy flips also follow the phase-0
    single-path CloudFront invalidation hook (reference, do not reimplement).
- [ ] Verify: `yarn typecheck && yarn lint`; commit `feat(lists): query layer + CRUD/reorder/collaborator actions`.

## Task 7 — List pages + editor UI

- [ ] `/u/[username]/list/[slug]/page.tsx` — Server Component, ISR:
      `export const revalidate = 300;` + `export async function generateStaticParams()
      { return []; }` (REQUIRED — performance.md §1). No dynamic APIs in the tree.
      Public list: render header (name, owner avatar/username, description, counts,
      ranked badges), item rows (rank number when `isRanked`, poster via CDN url,
      per-item note, `addedBy` chip when collaborative), phase-1 `<CommentThread
      anchor={{ listId }}>` below. Private list: the cached HTML renders ONLY a
      `<PrivateListGate listId>` client island that fetches via server action and
      shows the list to owner/collaborators, "This list is private" otherwise —
      private bytes never enter cacheable HTML (invariant 8).
- [ ] `generateMetadata`: title `"<name> — a list by @<user>"`, description from
      list description or "N films and shows", `openGraph.images` +
      `twitter: { card: "summary_large_image" }` pointing at
      `/og/list/[username]/[slug]` (absolute via existing `metadataBase`). Private
      lists: `robots: { index: false }`, no OG image.
- [ ] Owner/collaborator edit affordances as client islands on the same page
      (`canEdit` fetched client-side, NOT branched into cached HTML):
      `list-editor.tsx` with: add-item search (reuse existing autocomplete action),
      note editing, remove, visibility/ranked/collaborative toggles, collaborator
      manager (invite by username via `searchUsers` from Task 11), and reorder —
      **desktop**: framer-motion `<Reorder.Group>` drag; **mobile**: ≥40px up/down
      move buttons per row (no drag). Optimistic local order, then `moveListItem`;
      revert + `sonner` toast on failure.
- [ ] `/u/[username]/lists/page.tsx` — public lists grid (ISR 300, cover = first 4
      poster thumbs, no cover FK per design doc); owner sees private lists via a
      client-fetched section. "New list" dialog (shadcn Dialog desktop / Drawer
      mobile per DESIGN.md).
- [ ] Profile pinned-lists section (phase 0) now links here; verify slot renders.
- [ ] Follow DESIGN.md: `<PageMain>`, `<SectionHeading>`, semantic tokens only,
      `prefetch={false}` + `CardPendingOverlay` on card links.
- [ ] Verify: screenshots 390×844 + 1440×900 (Playwright, spoof sec-ch-ua per
      performance.md gotcha) of list page (public anon, owner, mobile reorder);
      `yarn test:ci`. Commit: `feat(lists): list pages, editor, reorder, collaborators, list comments`.

## Task 8 — List discovery on detail pages

- [ ] `<AppearsInLists mediaType id>` server component (Suspense-wrapped) on
      movie/series detail pages, below reviews: "In N public lists" + top 3 list
      rows (name, owner, item count) via `getListsContaining`. Public-lists-only →
      safe inside ISR-cached detail HTML. Render nothing when N=0 (no empty state).
      Keep the query indexed (`list_items.movieId/seriesId` indexes + join filter
      `lists.isPublic`) and `LIMIT`-bounded; EXPLAIN once locally.
- [ ] Verify: detail page TTFB unchanged (Playwright TTFB script before/after);
      commit `feat(lists): "appears in N lists" discovery module on detail pages`.

## Task 9 — OG share-card infrastructure + routes

- [ ] Vendor fonts: download Montserrat Regular/SemiBold/Bold TTFs (google/fonts
      GitHub, OFL) into `src/server/og/fonts/`. `src/server/og/fonts.ts` reads them
      with `fs.readFileSync(path.join(process.cwd(), "src/server/og/fonts", ...))`
      memoized at module scope.
- [ ] `src/server/og/theme.ts`: satori needs concrete colors — hex mirrors of
      DESIGN.md tokens with a comment pinning each to its OKLch source:
      `bg #000000`, `card #1c1c1c (oklch .12)`, `muted #969696 (oklch .65)`,
      `fg #f2f2f2 (oklch .95)`, `brand #ee5a3a (oklch .7 .22 30 — verify visually
      against rendered --brand and adjust once)`, `border rgba(255,255,255,.1)`.
- [ ] `src/server/og/frame.tsx`: `OgFrame` — 1200×630, black canvas, 64px padding,
      brand wordmark + "themoviebrowser.com" bottom row, optional right-side poster
      strip (≤5 TMDB **JPEG** `w342` posters, rounded 10px, slight overlap). Satori
      flexbox-only — every multi-child div needs explicit `display: "flex"`.
- [ ] Shared route scaffolding `src/server/og/respond.ts`: builds `ImageResponse`
      (size 1200×630, fonts) and sets
      `Cache-Control: public, max-age=300, s-maxage=86400, stale-while-revalidate=604800`.
      404 (plain, also cacheable `s-maxage=3600`) for missing/private subjects.
- [ ] Routes (each loads ONLY public data; no `auth()` — must stay cacheable/static
      -safe; LIMIT-bounded queries):
  - `/og/profile/[username]` — avatar circle, display name, @username, counts row
    (films · hours · followers from `user_stats` snapshot), Four-Favorites posters.
  - `/og/list/[username]/[slug]` — list name (line-clamped), "@user · N titles",
    poster strip, "ranked" badge.
  - `/og/review/[id]` — title + year + poster, score (if any), review excerpt
    ~200 chars (PUBLISHED + !isPrivate only; spoiler reviews render "Review contains
    spoilers" instead of the excerpt).
  - `/og/wrapped/[username]/[year]` — big year numeral, 3 stat tiles (hours, titles,
    top genre) from the `user_stats` snapshot ONLY (never live compute — crawler-hot),
    neutral copy from `wrapped-copy.ts`.
  - `/og/vs/[a]/[b]` — both avatars, "NN% compatible", 2 shared-favorite posters;
    **only when both profiles are public** (else 404) — mutual-follow pairs get no
    public card.
- [ ] Wire `generateMetadata` OG/twitter blocks: profile page, list page (Task 7),
      review permalink page (phase 0 deliverable — add images), wrapped page
      (Task 10), vs page (Task 11). Always `twitter.card = "summary_large_image"`,
      `openGraph.images = [{ url, width: 1200, height: 630 }]`.
- [ ] CPU discipline checklist (enforce in review): fonts module-scope; ≤6 remote
      images per card; no per-request font/asset fetch; never call an OG route from
      our own server-side code. DEPLOY FOLLOW-UP (flag, don't do): confirm `/og/*`
      falls under the CloudFront default cacheable behavior and that a repeat
      `curl -I` shows `X-Cache: Hit`.
- [ ] Verify: `curl -so /tmp/og.png -w '%{http_code} %{size_download} %{content_type}\n'
      http://localhost:3000/og/list/<u>/<slug>` → 200, `image/png`, **target
      < 300KB** (WhatsApp's comfort zone; hard fail > 600KB — if over, drop poster
      count/quality); repeat curl returns fast; private list slug → 404. Visual:
      open the PNGs. Commit: `feat(og): dynamic share cards for profiles, lists, reviews, wrapped, compatibility`.

## Task 10 — Wrapped / year-in-review

- [ ] `src/lib/social/wrapped-copy.ts`: static neutral templates (Fable rule — facts
      only, zero personality, zero LLM): `"{hours} hours watched"`,
      `"{count} films · {episodes} episodes"`, `"Top genre: {genre}"`,
      `"Longest streak: {days} days"`, `"Most rewatched: {title}"`, etc.
- [ ] `computeWrapped(userId, year)` in `social-users.ts`: aggregates over
      `watch_events` **`WHERE source = 'LOGGED'`** (excludes IMPORT/BACKFILL noise —
      the design doc's "honest Wrapped") and `user_ratings.ratedAt` within the year:
      hours (runtime COALESCE fallback per phase-0 stats rule), counts by month,
      top genres/decades, top actor/director (via credits join, LIMIT-bounded),
      streaks, rewatch champion, rating histogram. Stored under
      `user_stats.stats.wrapped[year]` through the phase-0 dirty-snapshot writer.
- [ ] `/u/[username]/wrapped/[year]/page.tsx`: ISR (`revalidate = 3600`,
      `generateStaticParams [] `), renders **from snapshot only**; public profiles
      only (private → the client-gate pattern from Task 7). Vertical stack of stat
      panels styled per DESIGN.md (poster-backed top-titles row, recharts month
      bars reused from existing stats components if phase 0 shipped them), share
      button (Web Share API → clipboard fallback) and OG card from Task 9.
      `/wrapped/[year]` (no username) = authed redirect to own page. Valid years:
      2000..currentYear, else `notFound()`.
- [ ] Verify: seeded user renders; IMPORT-heavy seeded user shows only LOGGED data;
      screenshots both viewports. Commit: `feat(wrapped): shareable year-in-review from honest stats snapshot`.

## Task 11 — User search + follow suggestions

- [ ] `searchUsers(query)` in `social-users.ts` + action: trigram over
      `users.username`/`users.name` (`similarity() > 0.3` floor + ILIKE prefix
      fast-path, LIMIT 10), filtered `isPublic AND username IS NOT NULL`, wrapped in
      `withoutBlocked`. Returns id/username/name/image/followerCount.
- [ ] `getFollowSuggestions(userId)`: pgvector KNN over `user_taste_vectors`
      (`embedding <=> $viewer` ASC, LIMIT 20 → filter already-followed, blocked,
      private, self → top 8) with `"people who love what you love"` framing —
      cosine shown as "NN% taste match" teaser (same rescale as `tasteSim`).
      Seq scan is fine at current user counts; note an `ivfflat` index as the
      future lever, don't add it now.
- [ ] UI: "Members" group in the existing cmdk search dialog (grep
      `src/components/features/search` for the dialog; follow the existing async
      group pattern); `<FollowSuggestions>` card used on `/feed` (Task 12) and the
      follower/following pages (phase 0).
- [ ] Verify: dialog shows users for partial username; suggestions exclude follows/
      blocks; `EXPLAIN` shows trgm Bitmap Index Scan. Commit:
      `feat(social): user search (pg_trgm) + taste-based follow suggestions`.

## Task 12 — Compatibility surface

- [ ] `getCompatibilityInputs(a, b)` in `social-users.ts`: shared scored titles
      (join `user_ratings` on movie/series id pairs, both `score IS NOT NULL`,
      private-profile rows excluded), liked sets, pair taste cosine in SQL
      (`SELECT 1 - (ta.embedding <=> tb.embedding) ...`). Then
      `computeCompatibility()` (Task 3).
- [ ] Privacy gate `canViewCompatibility(viewerId, a, b)`: any block between a/b →
      not found; both profiles public → anyone (incl. anon); otherwise viewer must
      be `a` or `b` AND a↔b are **mutual follows**.
- [ ] `/u/[username]/vs/[b]/page.tsx` — **dynamic** (`export const dynamic =
      "force-dynamic"`; long-tail pair pages, the cached artifact is the OG card):
      score dial, component breakdown ("ratings agreement / shared likes / taste
      profile" — transparent), shared favorites poster row, "You'll fight about"
      row (|Δscore| ≥ 4 with both scores shown), share button. Public pairs get OG
      metadata (Task 9); non-public pairs render `robots: noindex` and no OG image.
- [ ] `<CompatibilityModule>` client island in the phase-0 reserved profile slot:
      fetches viewer↔profile-owner score via server action (never in cached HTML),
      renders "NN% compatible · compare" link → vs page; hidden when anon/self/null.
- [ ] Verify: unit tests already cover formula; manual matrix: public-public anon ok;
      private pair non-mutual → 404; blocked pair → 404; module absent in
      `curl` (anon) HTML of `/u/[username]`. Commit:
      `feat(social): taste compatibility page + profile module + privacy gates`.

## Task 13 — Feed v1

- [ ] `src/server/db/postgres/feed.ts` — bounded fan-in queries, each
      `createdAt < cursor`, `LIMIT 20`, all through `withoutBlocked`, all excluding
      `isPrivate` rows:
  1. `followedReviews(userId, cursor)` — `user_reviews` of followed users
     (PUBLISHED, public), join title card data.
  2. `followedMilestones` — `series_progress` of followed users where status ∈
     {COMPLETED, CAUGHT_UP} (event time `updatedAt`) UNION recent public LOGGED
     movie `watch_events` of followed users.
  3. `followedListUpdates` — public lists of followed users by `updatedAt`.
  4. `popularReviews` — public PUBLISHED reviews, last 14 days, `likeCount >= 2`,
     order likeCount desc, exclude followed (already covered).
  5. `upcomingForViewer` — "S2 drops Friday": episodes with
     `airDate BETWEEN now AND now + 7d` for series where the VIEWER's
     `series_progress.status ∈ {WATCHING, CAUGHT_UP, COMPLETED}` (join
     episodes→seasons→series; `episodes.airDate` exists).
  6. `tasteMatchedTrailers` — `videos.type='Trailer'` published last 14 days on
     titles with `1 - (embedding <=> $taste) >= 0.5`, LIMIT 10 (skip the query
     entirely when the viewer has no taste vector).
  7. `popularPublicLists` — recently-updated public lists by itemCount/updatedAt.
     `tasteSim` for popular/trailer/list items computed in the same SQL
     (`1 - (embedding <=> $taste)`), null when no vector.
- [ ] `src/server/actions/feed.ts`: `getFeedPage({ cursor? })` — auth required;
      `Promise.all` the sources (each leg independently try/caught → `[]`, search-
      system error-isolation precedent); map to `RankableItem`+card payload
      (discriminated union `FeedCard` type, no `any`); `rankAndInterleave(items,
      now, 30)`; `nextCursor` = min `createdAt` among returned items (ISO string),
      `null` when every source under-filled. Documented limitation in JSDoc:
      ranking is per-window; a low-scored newer item can surface on a later page.
- [ ] `/feed/page.tsx`: dynamic, `auth()`-gated (anon → marketing empty-state with
      sign-in CTA), renders shell + `<FeedClient initial={firstPage}>`; client uses
      `useInfiniteQuery` + intersection-observer load-more. **Never edge-cached**:
      pages behind auth render dynamic + cookie-keyed (CF function keeps cookies for
      logged-in); do not add revalidate. Cards: review card (score, excerpt,
      spoiler-blur reusing phase-1 spoiler primitives), milestone card ("@u finished
      <series>"), release card ("S2E4 of <series> drops Friday"), trailer card
      (existing video thumb components), list card. Right column (lg+):
      `<FollowSuggestions>`. Cold-start: zero follows still yields sources 4-7
      (the design doc's "sprinkle is the solution").
- [ ] Nav: add Feed to mobile bottom nav + desktop navbar (logged-in only),
      `lucide-react` icon, 40px+ touch target.
- [ ] Verify: `yarn vitest run src/lib/social/`; manual: user with 0 follows gets
      popular/taste content; cursor pagination yields no duplicate keys across 3
      pages; `curl` anon `/feed` → no personal data; check `next-out.log` for any
      leg failures. Commit: `feat(feed): query-time fan-in feed v1 with transparent ranking`.

## Task 14 — Shareability audit (per-platform unfurls)

- [ ] Write `docs/superpowers/specs/2026-06-12-shareability-audit-checklist.md`
      covering every public object (title pages, episode pages, profiles, lists,
      reviews, wrapped, vs) × platforms, with the platform facts baked in:
      **X**: `twitter:card=summary_large_image`, absolute https image, <5MB.
      **Discord**: og:* + `theme-color`; verify spoiler-review cards leak nothing.
      **WhatsApp**: og:image **< 300KB target / 600KB hard limit**, explicit
      `og:image:width/height`, fast image response (edge-cached) — IN-heavy audience
      makes this the priority platform. **Telegram**: caches hard; refresh via
      @WebpageBot. **Reddit**: og:image on link posts.
- [ ] Verification tooling (local, manual): per-URL
      `curl -s <url> | grep -Eo '<meta[^>]+(og:|twitter:)[^>]+>'` checklist;
      image weight via `curl -so /dev/null -w '%{size_download}'`; live unfurl spot
      checks via opengraph.xyz + a private Discord channel + WhatsApp self-chat
      (post-deploy items — mark as deploy follow-ups).
- [ ] `e2e/seo/og-cards.spec.ts` (runs in `yarn test:seo`): for each public-object
      route (seeded fixtures): asserts `og:image` absolute + 1200×630 dims present,
      `twitter:card` present, OG route returns 200 `image/png` under 600KB, private
      objects expose NO og:image and `noindex`.
- [ ] Verify: `yarn test:seo` green locally. Commit:
      `feat(share): per-platform unfurl audit checklist + SEO/OG e2e coverage`.

## Task 15 — Final verification sweep

- [ ] `yarn test:ci` (typecheck + lint strict + unit) and `yarn test:seo`.
- [ ] EXPLAIN spot-checks: list-by-slug, appears-in-lists, feed legs 1/4/6, user
      trgm search, KNN suggestions — no Seq Scan on large tables (user_taste_vectors
      seq scan is accepted).
- [ ] Privacy matrix re-run (anon curl): private list HTML, /feed, profile
      compatibility module, mutual-follow vs page — zero private bytes in any
      cacheable response.
- [ ] OG image weights all < 300KB; repeat-curl latency ~ms after first render.
- [ ] Screenshot pass per design-system rule (390×844 + 1440×900): list page,
      list editor, wrapped, vs, feed.
- [ ] Commit any fixes: `chore(phase2): verification fixes`.

## Risks / notes for executors

- Satori: no WebP decode (TMDB JPEG only), flexbox-only layout, every multi-child
  div needs `display:flex` — build cards iteratively with local curl previews.
- Feed leg failures must never reject the page (`Promise.all` over try/caught legs
  — the June-2026 search incident pattern).
- Don't put `auth()`/`headers()` anywhere in the render tree of ISR pages
  (list/wrapped/profile) — it silently kills ISR (performance.md §1.3).
- `user_taste_vectors` writes use raw SQL (`Unsupported` type); keep all vector SQL
  in `taste-vector.ts`/`feed.ts`/`social-users.ts`, parameterized.
- CloudFront behaviors for `/og/*` + cache-key sanity are deploy follow-ups, out of
  local scope — flagged in Tasks 9/14.
