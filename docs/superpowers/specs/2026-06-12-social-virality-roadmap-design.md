# Social & Virality Roadmap — Design

Date: 2026-06-12
Status: APPROVED DIRECTION — Phase 0 spec detailed below; phases 1–4 sketched.
Supersedes: `2026-06-12-phase0-schema-draft.md` (review draft, deleted; findings folded in).

## 1. Thesis

Own the **before** (deciding together), the **between** (progress tracking,
spoiler-gated threads), and the **after** (discussion, recaps) of watching —
and make every artifact shareable and Google-indexable. Synchronized playback
is explicitly out of scope forever (the entire first-party watch-party
category died 2023–2024; Netflix's own testing showed social sync doesn't
retain).

## 2. Research grounding (June 2026, four parallel research passes)

Key validated facts this design rests on:

- **Discussion attached to already-trafficked title pages is the only model
  that ever worked at scale.** IMDb killed its boards (2017) over moderation
  cost, not demand; every clone (MovieChat, FilmBoards) failed because the
  archive transferred but the traffic source didn't. We have the traffic
  source (SEO detail pages). Moderation cost is now a cheap LLM call.
- **Progress-gated spoiler-safe discussion is validated UX with no TV/movie
  web implementation.** StoryGraph Buddy Reads and Fable book clubs gate
  comments on the reader's own progress; TV Time gates per-episode comments on
  watched state but is shallow, mobile-only, no web/SEO. Reddit episode
  threads archive after ~6 months, locking out every late watcher. Trakt
  comments have only a binary spoiler boolean.
- **Episode-level tracking is table stakes** — its absence on Letterboxd is
  the entire reason Serializd exists. Connoisseurs never start from zero:
  CSV import (Letterboxd/Trakt/IMDb) is the acquisition channel, and the
  Trakt 2025 price-revolt produced a live migration stream.
- **Proven viral mechanics**: constrained self-expression (Letterboxd Four
  Favorites, credited with 3M→30M growth), Wrapped-style share cards, witty
  micro-content that screenshots well, Beli-style friend-weighted scores
  (200k→1.1M MAU in 2025; unclaimed in movies), free rich stats (Letterboxd
  Pro-gates stats; Trakt VIP-gates everything — both resented).
- **AI-native social is greenfield with one bright line** (Fable's Dec-2024
  AI summaries turned bigoted; they removed all generative AI): AI
  classifies, gates, summarizes, and moderates **content**; it never
  characterizes **users** or performs personality.
- **What survives in "watching together"**: deciding together, scheduled
  binge clubs (cadence + progress + threads — what Discord anime servers
  hand-roll with bots), async discussion. Users *prefer* async (Media &
  Communication Reddit study). All metadata problems; zero DRM exposure.

## 3. Phased roadmap

| Phase | What ships | Why it's sequenced here |
|---|---|---|
| **0 — Tracking Core + primitives** (this spec) | Episode-level progress, dated diary w/ rewatches & notes, 1–10 ratings, free stats, CSV import, username + rich public profiles (backdrop/avatar/accent customization, pinned lists, follow graph, public reviews), review writing as first AI-gate consumer; schema anchors for comments/reactions/lists/notifications | Must be good solo before social; everything else reads its tables; profiles are the identity artifact |
| **1 — Discussion layer** | Spoiler-gated threaded comments on movie/series/episode pages; per-episode SEO pages (DiscussionForumPosting structured data); AI gate (toxicity + spoiler-scope classification); AI thread summaries safe-to-your-progress; threads never archive | The virality wedge: fed by existing SEO traffic, no social cold start; anonymous readers see spoiler-free tier + "N comments unlock when you've watched" |
| **2 — Identity artifacts** | Public + collaborative lists, OG share cards, Four-Favorites format, free stats pages + Wrapped, taste-compatibility module, **shareability audit** (X cards / Discord / WhatsApp / Telegram / Reddit unfurls for every public object), **Feed v1** (follows + own activity + popular/taste-blended reviews, trailers, releases) | Share-out acquisition; reuses comment/reaction primitives |
| **3 — Circles + binge clubs** | Group watchlists, taste-aware group polls w/ AI mediation, scheduled series watches with auto-created progress-gated circle threads, invite links, **Feed v2** (your-circles content + related public circles discovery) | The retention engine + invite loop; needs phases 0–1 primitives |
| **4 — AI second screen** | Recap-to-my-progress, spoiler-safe "who is that?" Q&A across whole catalog (Amazon X-Ray Recaps generalized), AI recaps posted into club threads | Rides ai_insights + agent + progress rows; needs per-episode AI table later (same natural-key pattern) |

## 4. Phase 0 spec — Tracking Core

### 4.1 Design invariants (production-derived, do not violate)

1. **Never FK user data onto `episodes`/`seasons` rows** — hydration
   delete+reinserts them (`upsert-diff.ts` legacy whole-set path). Use natural
   keys `(series_id, season_number, episode_number)` **plus**
   `tmdb_episode_id` as a soft no-FK reference (stable across TMDB
   renumbering, which natural keys are not).
2. **Renumbering reconciliation**: post-hydration fire-and-forget task (same
   style as `triggerProgressiveEnrichment()`): for the hydrated series, where
   user rows' `tmdb_episode_id` maps to an episode whose
   `(season_number, episode_number)` now disagrees, update the natural-key
   columns and re-run that user's progress recompute. Importers resolve
   incoming rows to `tmdb_episode_id` first and derive natural keys from it.
3. **Every FK column gets an index regardless of onDelete action** (PG scans
   the referencing table on parent delete for Cascade AND Restrict/SetNull;
   un-indexed FK = the 42-minute-DELETE incident).
4. **Cascade policy by data class**:
   - Derived/cheap user state (watchlist, ratings, recents, watch_events,
     reactions, notifications): `userId → Cascade`.
   - **UGC vs catalog**: `movieId/seriesId → Restrict` on `watch_events`,
     `comments`, `user_reviews`, `list_items` (a catalog delete must be a
     deliberate decision, never a silent UGC purge; hydration never deletes
     parent movie/series rows, so Restrict costs nothing).
   - **Comments**: `userId` nullable + `SetNull`; `parentId` self-relation
     `NoAction`. Comments are NEVER hard-deleted in app code — deletion =
     `status: DELETED_BY_USER` + body scrubbed. Account deletion scrubs then
     SetNulls authorship; reply trees survive.
5. **Raw-SQL integrity lives in `postgres/init/04-ugc-constraints.sql`**
   (idempotent CHECKs + partial/expression uniques Prisma can't express),
   applied by a hash-gated deploy step that fires when **either** the schema
   hash **or** the file hash changed (a `db push` table recreation silently
   drops CHECKs; the gate must not skip reapplication). Verify once locally
   that partial uniques survive `db push`.
6. **No fan-out writes ever** (no per-follower activity rows, no
   "notify all followers" rows). Notifications are write-on-event, bounded by
   direct recipients (reply author, circle members).
7. **Typed nullable anchor columns, never generic `(itemId, itemType)`.**
   Generic polymorphism loses real FKs (no Restrict/Cascade enforcement, no
   FK indexes), invites silent misattribution (TMDB reuses numeric ids across
   movie/TV — id 603 exists in both), kills Prisma relations, and degrades
   join planning. Adding a new anchor type in the typed pattern is one
   nullable column + a CHECK line + an index — the cheap operation. The
   anchor universe is a small closed set (movie, series, season/episode,
   person, list, circle, review); generic typing is for integrity-free
   open-ended streams (ClickHouse analytics — correctly uses itemId/itemType).
8. **Edge-cache rules** (CloudFront caches anon HTML):
   - Anon-cached variants of any discussion surface contain ONLY
     `spoilerScope=NONE, status=PUBLISHED, circleId IS NULL` comments —
     progress-independent, hence cacheable, and exactly what crawlers should
     index. Progress-gated lists load client-side (uncached). Never put
     progress-dependent content in edge-cacheable HTML.
   - Public profile pages: short s-maxage; privacy flips / username changes /
     moderation removals run a **single-path** CloudFront invalidation
     (`/u/<username>*`, or the one discussion page) — never `/*`.

### 4.2 Schema (final, post-review)

New enums: `WatchStatus { WATCHING, CAUGHT_UP, COMPLETED, DROPPED, PAUSED, REWATCHING }`,
`WatchEventSource { LOGGED, BACKFILL, IMPORT }`,
`WatchedAtPrecision { DATETIME, DATE, UNKNOWN }`,
`SpoilerScope { NONE, WATCHED, EPISODE, ENDING }`,
`CommentStatus { PENDING_REVIEW, PUBLISHED, FLAGGED, REMOVED, DELETED_BY_USER }`,
`ListKind { REGULAR, FOUR_FAVORITES }`, `ImportSource { LETTERBOXD, TRAKT, IMDB }`.

#### `watch_events` — the diary (one row per watch occurrence; rewatch = new row)

```prisma
model WatchEvent {
  id                 Int                @id @default(autoincrement())
  userId             Int                @map("user_id")
  movieId            Int?               @map("movie_id")
  seriesId           Int?               @map("series_id")
  seasonNumber       Int?               @map("season_number")
  episodeNumber      Int?               @map("episode_number")
  tmdbEpisodeId      Int?               @map("tmdb_episode_id")   // soft ref, NO relation
  watchedAt          DateTime?          @map("watched_at")        // nullable: dateless imports exist
  watchedAtPrecision WatchedAtPrecision @default(DATETIME) @map("watched_at_precision")
  // date-only values stored at 12:00 UTC (no IST day-shift)
  note               String?            // PRIVATE per-watch note
  tags               String[]           @default([])              // stored for import fidelity; no UI yet
  isRewatch          Boolean            @default(false) @map("is_rewatch")
  isPrivate          Boolean            @default(false) @map("is_private")
  source             WatchEventSource   @default(LOGGED)
  createdAt          DateTime           @default(now()) @map("created_at")

  user   User    @relation(..., onDelete: Cascade)
  movie  Movie?  @relation(..., onDelete: Restrict)
  series Series? @relation(..., onDelete: Restrict)

  @@index([userId, watchedAt(sort: Desc)])
  @@index([userId, movieId])
  @@index([userId, seriesId, seasonNumber, episodeNumber])
  @@index([seriesId, tmdbEpisodeId])   // reconcile pass
  @@index([movieId])
  @@index([seriesId])
  @@map("watch_events")
}
```

CHECK (raw SQL): exactly one of movie/series set; `seasonNumber` requires
`seriesId`; `episodeNumber` requires `seasonNumber`. **Series-level events
(season/episode NULL) are legal** = "watched this series, granularity
unknown" (IMDb imports) → progress recompute sets `status=COMPLETED` with
NULL position.

Decision (adjudicated between reviewers): **no separate `watched_episodes`
state table.** Watched-state = `EXISTS` / `DISTINCT` range scans on
`[userId, seriesId, seasonNumber, episodeNumber]`; a state table doubles every
episode write on a 2-vCPU box. Revisit trigger: rewatch-heavy users making
`DISTINCT` measurably slow — adding the derived table later is a pure
backfill, not a migration.

`watched_movies` is **hard-migrated and dropped** in the same change: rows →
`watch_events (source=BACKFILL, watchedAt=NULL, precision=UNKNOWN)` (the old
`createdAt` is when they *marked*, not watched). Read-surface refactor is
bounded: `getLibraryData`, `getWatchedMovieIdsWithDates`,
`markMovieWatched`/`unmark`, `getUserItemStatus`, `getUserExclusions`, admin
`_count`. No compatibility view, no dual writes.

#### `series_progress` — materialized, one row per (user, series)

```prisma
model SeriesProgress {
  userId            Int         @map("user_id")
  seriesId          Int         @map("series_id")   // FK to series OK (parent rows stable)
  status            WatchStatus
  statusIsManual    Boolean     @default(false) @map("status_is_manual")
  // CURRENT CYCLE (Up Next, progress %): events after rewatchStartedAt
  lastSeasonNumber  Int?        @map("last_season_number")
  lastEpisodeNumber Int?        @map("last_episode_number")
  episodesWatched   Int         @default(0) @map("episodes_watched")
  // LIFETIME HIGH WATERMARK (spoiler gate reads ONLY these; monotonic)
  maxSeasonNumber   Int?        @map("max_season_number")
  maxEpisodeNumber  Int?        @map("max_episode_number")
  rewatchStartedAt  DateTime?   @map("rewatch_started_at")  // Trakt reset_at semantics
  rewatchCount      Int         @default(0) @map("rewatch_count")
  updatedAt         DateTime    @updatedAt @map("updated_at")

  @@id([userId, seriesId])
  @@index([userId, status, updatedAt(sort: Desc)])  // Up Next / shelves
  @@index([seriesId])
  @@map("series_progress")
}
```

Why split pointers (review P1): a rewatcher mid-S1 of a finished show has
seen the ending — the spoiler gate must read lifetime watermark while Up Next
reads current cycle. One pointer can't serve both; splitting later = semantic
migration across every consumer. "Reset to rewatch" sets `rewatchStartedAt`,
increments `rewatchCount`, status `REWATCHING`; **never deletes events**.

**Spoiler-gate predicate** (phase 1, status-aware — required for granularity-
unknown imports): visible ⇔ `scope=NONE` OR `progress.status=COMPLETED` OR
`(scopeSeason, scopeEpisode) <= (maxSeasonNumber, maxEpisodeNumber)`.
Movie-side: `scope=WATCHED|ENDING` visible ⇔ watched-state EXISTS
(`[userId, movieId]` index on watch_events).
Known accepted limitation: high-watermark over-permits sparse/out-of-order
watchers; season-0 specials gate as "before S1E1". Exact per-episode gating
remains possible later from raw events without schema change.

Recompute: transactional with event writes; index-only aggregate over one
user's rows for one series (~ms even at soap scale). **Batch mark APIs are
mandatory**: "mark season/series watched" = one server action, one
`createMany(skipDuplicates)`, ONE recompute — never N client actions.

#### `user_ratings` — extend in place

`rating Int` → nullable (thumb ±1); add `score Int? // 1–10`,
`ratedAt DateTime?` (import-honest; Wrapped reads it). A row may carry thumb,
score, or both. Audit `rating: -1` consumers (`getUserExclusions`) for nulls.
Letterboxd 0.5–5 → score = stars×2; Letterboxd film "likes" import → thumb up
(no third like-concept). Per-episode/season ratings: future separate table
(`user_episode_ratings`, natural keys + tmdbEpisodeId) — confirmed unblocked.

#### `user_reviews` — distinct entity (NOT a comment variant)

One per user per title (per season for series-season reviews — Serializd's
core mechanic): `userId, movieId?, seriesId?, seasonNumber?, body,
containsSpoilers Boolean, isPrivate Boolean, watchEventId Int?` (preserves
Letterboxd diary↔review linkage on import), `status CommentStatus` +
`aiLabels Json?` (reviews are the FIRST AI-gate consumer — they need the same
moderation fields as comments), `createdAt, editedAt`.
Uniqueness: `@@unique([userId, movieId])`; for series use a raw
`UNIQUE NULLS NOT DISTINCT (user_id, series_id, season_number)` index (PG 17;
in 04-ugc-constraints.sql) so one series-level review (NULL season) per user
is actually enforced. Score displays via join to `user_ratings`. Catalog FKs
Restrict. Reviews get own SEO surface (`Review` structured data) later;
comments-on-reviews later via `reviewId` anchor column on comments.

#### `comments` — phase-1 anchor, designed now

```prisma
model Comment {
  id            Int           @id @default(autoincrement())
  userId        Int?          @map("user_id")            // nullable: SetNull on account deletion
  movieId       Int?          @map("movie_id")
  seriesId      Int?          @map("series_id")
  seasonNumber  Int?          @map("season_number")
  episodeNumber Int?          @map("episode_number")
  listId        Int?          @map("list_id")            // phase 2
  circleId      Int?          @map("circle_id")          // phase 3: visibility scope OR standalone anchor
  parentId      Int?          @map("parent_id")          // replies DENORMALIZE anchor columns from root
  body          String        @db.Text
  spoilerScope  SpoilerScope  @default(NONE) @map("spoiler_scope")
  scopeSeason   Int?          @map("scope_season")
  scopeEpisode  Int?          @map("scope_episode")
  scopeTmdbEpisodeId Int?     @map("scope_tmdb_episode_id") // renumber reconcile
  status        CommentStatus @default(PUBLISHED)
  aiLabels      Json?         @map("ai_labels")          // moderation/classification output
  likeCount     Int           @default(0) @map("like_count") // atomic increments only
  editedAt      DateTime?     @map("edited_at")
  createdAt     DateTime      @default(now()) @map("created_at")

  user   User?    @relation(..., onDelete: SetNull)
  movie  Movie?   @relation(..., onDelete: Restrict)
  series Series?  @relation(..., onDelete: Restrict)
  parent Comment? @relation("replies", ..., onDelete: NoAction)

  // circleId INSIDE the composite (public reads use circle_id IS NULL as index condition)
  @@index([movieId, circleId, status, createdAt(sort: Desc)])
  @@index([seriesId, seasonNumber, episodeNumber, circleId, status, createdAt(sort: Desc)])
  @@index([parentId])
  @@index([listId])
  @@index([circleId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("comments")
}
```

CHECKs (raw SQL): ≤1 of movie/series/list anchors AND at least one of
(anchor, circleId); episode keys require series→season chain; EPISODE scope
requires scopeSeason. Circle-scoped episode thread =
`circleId + seriesId + season + episode` (binge clubs inherit threading,
gating, moderation, reactions, reports, notifications for free).
Public read paths go through a `publicComments` query helper that bakes in
`circleId IS NULL AND status = 'PUBLISHED'` — convention is not enough.
Pagination: keyset on `(createdAt, id)` from day one. Likes-sort index:
deferred until "Top" sort ships.

Verified read path: progress = 1 PK lookup; comment page = one ordered index
range scan with spoiler predicate as residual, LIMIT-bounded; single-digit ms
at 10k comments/episode. No partitioning until tens of millions of rows.

#### `reactions`

`userId, commentId?` (+ `reviewId?`/`listId?` later — adding nullable anchors
is this pattern's cheap operation), `type` enum (extensible — future
episode-emotions mechanic), `createdAt`. Uniques per (userId, target);
**standalone indexes on each target column** (the unique leading with userId
does not cover cascade scans). Counters denormalized on targets, atomic
increment only, lazy admin recompute for drift.

#### `lists` + `list_items` — phase-2 anchor, designed now

```prisma
model List {
  id              Int      @id @default(autoincrement())
  ownerId         Int      @map("owner_id")
  circleId        Int?     @map("circle_id")        // phase-3 group lists
  kind            ListKind @default(REGULAR)        // FOUR_FAVORITES = pinned profile module (max 4 app-enforced)
  name            String
  slug            String
  description     String?
  isPublic        Boolean  @default(false) @map("is_public")
  isCollaborative Boolean  @default(false) @map("is_collaborative")
  isRanked        Boolean  @default(false) @map("is_ranked")
  isPinned        Boolean  @default(false) @map("is_pinned")  // showcased on profile
  itemCount       Int      @default(0) @map("item_count")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  @@unique([ownerId, slug])
  @@index([ownerId])
  @@index([circleId])
  @@map("lists")
}

model ListItem {
  id       Int      @id @default(autoincrement())   // surrogate PK: reorders must not churn the PK
  listId   Int      @map("list_id")
  movieId  Int?     @map("movie_id")
  seriesId Int?     @map("series_id")
  personId Int?     @map("person_id")   // person lists: real Letterboxd gap
  position Int      // gapped integers (n*1024): drag = 1 UPDATE
  note     String?
  addedById Int?    @map("added_by_id") // SetNull
  addedAt  DateTime @default(now()) @map("added_at")
  // catalog FKs Restrict
  @@unique([listId, movieId])
  @@unique([listId, seriesId])
  @@unique([listId, personId])
  @@index([listId, position])
  @@index([movieId]) @@index([seriesId]) @@index([personId]) @@index([addedById])
  @@map("list_items")
}
```

No episode list-items (cheap nullable-column add later if ever wanted).
Cover image: derived from first items (no coverItemId FK).

#### `watchlist` — extend in place

Add `position Int?` (gapped; `addedAt` fallback when NULL) + `note String?`
(Trakt import fidelity). Index `[userId, position]`.

#### `favorites` — none. Four Favorites = `List(kind: FOUR_FAVORITES)`

(Adjudicated: inherits slug/OG-card/ordering machinery free; taste-signal
queries join list_items where kind.)

#### `import_jobs`

`userId, source ImportSource, status, fileRef` (S3 key — raw upload retained
as the lossless fallback making every "acceptable loss" reversible),
`stats Json {rowsTotal, imported, skipped, errors[]}`, `createdAt,
completedAt`. `@@index([userId, createdAt(sort: Desc)])`.
Import rules: resolve episodes via tmdb_episode_id; app-level dedupe within a
run on `(source, titleId, watchedAt, isRewatch)` — no brittle unique
constraints on events (two same-day watches are legit); skips recorded in
stats. Unmappable rows (e.g. Trakt episode ratings, for now) counted, not
dropped silently.

#### `notifications`

`userId (recipient, Cascade), type (REPLY|MENTION|FOLLOW|CIRCLE_INVITE|
CLUB_EPISODE_OPEN|...), actorId? (SetNull, indexed), payload Json, readAt?,
createdAt`. `@@index([userId, readAt, createdAt(sort: Desc)])`.
Write-on-event only (invariant 6).

#### `reports`

`reporterId (indexed), commentId? (indexed), reviewId? (indexed — reviews are
public UGC from phase 0), reason enum, note?, status, createdAt`.
`@@index([status, createdAt])` (mod queue).

#### `blocks` — safety table stakes (phase 0 schema; the retrofit trap)

`blockerId, blockedId, type (BLOCK | MUTE), createdAt`;
`@@unique([blockerId, blockedId])`, both columns indexed, both FKs Cascade.
BLOCK = mutual invisibility + no follow/mention/reply; MUTE = one-way hide.
**Invariant: every social read path (comments, replies, follows, mentions,
notifications, feed, compatibility, user search) filters blocks from day one
of social features** — enforced via the same query-helper pattern as
`publicComments`, never ad-hoc where-clauses.

#### Social plumbing designed now (ships phases 0–1)

- **@mentions**: parsed on publish, `MENTION` notification (type already
  enumerated), respects blocks. No schema beyond notifications.
- **Permalinks**: every public social object (comment, review, list) gets a
  stable URL from day one — notifications, shares, and SEO hang off them.
- **User search + taste-based follow suggestions**: username search; embedding
  taste-similarity suggestions ("people who love what you love") instead of
  clout-based popular-user lists. Doubles as the compatibility teaser.
- **Web push** (PWA infra exists): reply notifications, "S3 just dropped"
  (TV Time's biggest retention lever), club-episode-open. Plumbing phase 1.
- **Data export**: full CSV export of own data — the trust mirror of
  demanding lossless imports from Letterboxd/Trakt.

#### Deliberately rejected (taste-graph, not attention-graph)

DMs (moderation surface with none of our strengths), algorithmic engagement
feed, stories/ephemeral, video/clip uploads, public clout mechanics
(follower leaderboards — taste communities sour into status games;
StoryGraph's safety-positioning beats Goodreads partly by avoiding this),
re/quote-posts (imports pile-on culture). External sharing happens on
Twitter/Reddit/Discord — by design — so every public object must unfurl
beautifully there (see shareability, §5).

#### `users` — extend

Username claim flow; raw `UNIQUE INDEX ON lower(username)` (case-insensitive
routing for `/u/[username]`; in 04-ugc-constraints.sql).

Profile customization lives in the existing `metadata` Json envelope (no
schema change): `profile.backdrop {movieId|seriesId, imagePath}` (reference
into TMDB imagery we already serve — zero storage, zero upload moderation),
`profile.avatar` (Google image default OR a TMDB poster/still pick; custom
uploads deferred — they drag in storage + image moderation), `profile.accent`
(rides the existing 3-tier OKLch theming), `profile.links/pronouns/location`.
Note: Letterboxd gates profile backdrops behind Patron ($49/yr) — ours ship
free ("free what they paywall").

#### `follows` — activate existing model (phase 0)

Follow button + follower/following counts and lists on profiles. Safest
social feature (no UGC, no moderation), makes the profile a social object,
and seeds the graph phase 2's friend-weighted scores need. Counts are
query-time at current scale (indexes exist); denormalize only if profiles get
crawler-hot.

#### `circles` — extend existing

Add `slug`, `inviteCode` (shareable join links = the phase-3 acquisition
loop), `imageUrl?`. Binge-club cadence tables (`club_schedules`: circle,
series, cadence, current position, next-open-at) are phase-3; confirmed
nothing here blocks them.

#### `user_stats` — lazy snapshot

`userId PK, stats Json, computedAt, dirty Boolean`. Watch-event writes set
dirty; recompute on read when dirty or >24h. Logged-in `/stats` may compute
live (hundreds of ms acceptable); **public profiles and Wrapped render from
snapshot only** (crawlers hammer them). Runtime fallback:
`COALESCE(episode.runtime, avg(series.episode_run_time))`. `source` column
lets stats exclude BACKFILL/IMPORT noise — honest Wrapped (Letterboxd's is
notoriously import-polluted).

### 4.3 UI surfaces (phase 0)

- **Set-my-position** progress input: mark episode / season / "caught up
  through S3E4" (one tap backfills; `source=BACKFILL`).
- **Up Next** module (logged-in home): WATCHING/REWATCHING shows, next
  unwatched episode, from `series_progress` index.
- **Your-shows calendar** / "S3 just dropped" indicators (data model only;
  push/email delivery later).
- **Diary** view (rewatches collapsed for BACKFILL), quick-log from any card
  (date defaults today).
- **Stats** page (free): hours, counts/month, genres/decades/countries, top
  actors/directors, streaks, rewatch champions.
- **Public profile** `/u/[username]` — the identity page, not a stats dump:
  user-chosen movie/series **backdrop** rendered through the existing
  hero-backdrop/gradient system, avatar (Google or TMDB-art pick), accent
  color, bio + links; Four Favorites module; **pinned lists**; public
  reviews; ratings histogram; top genres/decades; currently-watching shelf;
  streaks/rewatch champions; **follow button + follower/following counts**.
  All respecting per-entry `isPrivate` from day one. Layout reserves a slot
  for the phase-2 **taste-compatibility module** ("you're 87% compatible" +
  share card — Beli's mechanic; profile-visit payoff and the natural
  'compare with me' link for group chats).
- **Review writing** (public/private toggle, containsSpoilers flag) from
  detail pages; renders on profile + detail page. First consumer of the AI
  gate pipeline — moderation machinery gets battle-tested on low-volume
  reviews before phase-1 comment threads scale it.
- **Import** flow: upload → background job → per-row report.
- Settings: privacy defaults (log privately by default toggle).

### 4.4 Cut from phase 0 — confirmed cheap later

Custom tag pages/filtering (raw tags ARE stored), in-film percent progress,
episode ratings (future table sketched), collection/ownership tracking,
activity-feed materialization (query-time later via follows indexes),
episode-level watchlist, DMs, advanced per-criteria scores, Trakt-style
check-in, hidden-items table ("not interested" = existing thumb-down
exclusion; revisit as explicit signal in phase 2), badges/achievements
(retention polish, not foundation), custom image uploads (storage + image
moderation; TMDB art covers customization), taste-compatibility module
(phase 2 — profile layout reserves its slot).

## 5. Phase 1+ design notes carried from research/review

- AI gate on submit: toxicity + spoiler-scope suggestion (user-adjustable);
  `aiLabels` retained for audit. AI-assigned scope composes with imports —
  legacy comments become gateable without author cooperation. Nobody else has
  this (Trakt's only automation: 200+ words = review).
- Seed cold threads from `ai_insights` (themes/spoiler-leveled corpus we
  uniquely have) + YouTube topComments (already fetched) as "reactions from
  the web". Anonymous conversion hook: "N comments unlock when you've
  watched".
- The spoiler gate is **site-wide capability, not a comments feature**: one
  PK read cheap enough to evaluate per render — comments embedded anywhere,
  AI chat answers, notification previews. "The entire site is spoiler-safe by
  construction, per-reader" is the product wedge sentence.
- UGC legal: report flow (table ships phase 0), content policy page, AI gate
  before public visibility. Moderation is a phase-1 launch requirement.
- Fable rule (hard): AI never characterizes users or performs personality;
  Wrapped copy is neutral-toned; roast-style anything is opt-in-never-default.
- **Shareability as a strategy**: rejected features (DMs, re-posts) mean the
  external conversation happens on X/Reddit/Discord/WhatsApp linking back to
  us — so unfurls must be excellent. Rule for ALL phases: every new public
  object ships with *correct* OG from day one; the dedicated audit/polish
  pass (per-platform unfurl rendering, card imagery, oEmbed consideration)
  is a phase-2 item. WhatsApp/Telegram previews matter disproportionately
  for the IN-heavy audience.
- **Feed design** (v1 phase 2, v2 phase 3): query-time fan-in over follows +
  circle memberships (bounded, indexed — the fan-out write ban stands).
  Interleaved card feed: friend reviews, hot threads, new trailers,
  "S2 drops Friday" cards. **The movie/trailer sprinkle is the cold-start
  solution, not garnish** — with a thin graph the feed blends popular +
  taste-matched public content (embeddings: "reviews of titles like what you
  watch", "public circles you'd fit") so it has value at zero follows.
  Taste-relevance ranking, transparent; no engagement-bait dark patterns.
  Per-user, logged-in, client-fetched — never edge-cached.

## 6. Risks

- **Cold start on discussion** (phase 1): mitigated by SEO traffic + AI
  prompt seeding + web-reactions decoration; accept some empty threads.
- **TMDB renumbering** mid-import or pre-reconcile: bounded by tmdbEpisodeId
  resolution; accept rare residual misattribution for titles lacking IDs.
- **Box capacity**: all hot paths verified index-only-ish; stats snapshotted;
  no fan-out. Watch general write growth on comments (likeCount index
  deferred deliberately).
- **Scope creep**: phase 0 UI = tracking + profiles + review writing + the
  Four Favorites module (a List under the hood). Comments tables exist with
  NO UI until phase 1; general list CRUD/browsing UI waits for phase 2
  (profile "pinned lists" section renders only once lists exist).

## 7. Verification (phase 0 definition of done)

- `prisma db push` round-trip keeps all raw-SQL constraints (local verify,
  then deploy-gate check).
- Import a real Letterboxd export (incl. dateless watched.csv, tags, likes,
  reviews) and a Trakt export losslessly; row-level report matches.
- 300-episode mark = 1 action, 1 recompute; EXPLAIN shows index-only paths on
  Up Next, diary, gate lookup.
- Public profile of a private-entries user leaks nothing (incl. via edge
  cache); username case-collision rejected.
- FK audit query (performance.md pattern) returns no unindexed FKs on new
  tables.
