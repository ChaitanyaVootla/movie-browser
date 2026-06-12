# Phase 0 Backend (Tracking Core data layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the entire Phase 0 backend of the Social & Virality Roadmap: schema (watch events, series progress, ratings extension, reviews, comments/reactions/lists anchors, imports, notifications, reports, blocks, user stats), the raw-SQL constraint layer, the watched_movies hard migration, the query-layer modules, the AI moderation gate skeleton, CSV import/export, and server actions — all verified against the LOCAL database only.

**Architecture:** New tables follow spec §4.2 of `docs/superpowers/specs/2026-06-12-social-virality-roadmap-design.md` exactly (invariants §4.1 are LAW: natural keys + tmdbEpisodeId soft refs for episodes, FK indexes everywhere, Restrict on UGC→catalog FKs, Cascade on cheap user state, no fan-out writes, typed nullable anchors). Integrity Prisma can't express lives in `postgres/init/04-ugc-constraints.sql`, applied by a hash-gated deploy step (planned, NOT pushed). Query layer is split into focused modules under `src/server/db/postgres/social/` (each <800 lines); business logic that needs tests is factored into pure functions (progress derivation, stats aggregation, gate policy, blocks filtering, CSV parsers) so vitest covers it without a DB. Server actions follow `.claude/rules/server-actions.md` (Zod at boundaries, pino loggers, `catch (error: unknown)`).

**Tech Stack:** Next.js 16 server actions, Prisma 6 + PostgreSQL 17 (pgvector/pg_trgm already installed), Zod 4, vitest 4, pino, AWS Bedrock via the existing `callBedrockFlex` helper (Kimi K2.5, Flex tier), `fflate` (new dep) for zip handling.

---

## Hard rules for every task

1. **LOCAL DB ONLY.** Every `prisma db push` / SQL command MUST pass the URL explicitly:
   `DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser"` — NEVER rely on `.env` (it may point elsewhere). Never run against production.
2. **No push, no deploy.** Commit locally only. The `.github/workflows/deploy-ec2.yml` edit in Task 4 is **DO-NOT-PUSH** — it ships with the eventual release PR, accompanied by the production runbook at the bottom of this plan.
3. Type-safety rules: no `any`, `catch (error: unknown)`, Zod at every action boundary, no non-null assertions in new code (use `?? null` / filtering).
4. Files stay under 800 lines. If a module grows past it, split it.
5. Use `yarn` (repo uses yarn 4). Tests: `yarn vitest run <path>`.

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `postgres/init/04-ugc-constraints.sql` | Idempotent CHECKs + partial/expression/NULLS-NOT-DISTINCT uniques Prisma can't express |
| `scripts/apply-ugc-constraints.ts` | Applies 04 SQL statement-by-statement via Prisma (local dev; deploy uses psql) |
| `scripts/migrate-watched-movies.ts` | One-shot idempotent data migration watched_movies → watch_events |
| `src/lib/watch-dates.ts` (+ `.test.ts`) | Date-only→12:00-UTC storage rule, UTC day keys |
| `src/server/db/postgres/social/progress-derive.ts` (+ `.test.ts`) | PURE progress derivation (status, cycle pointers, lifetime watermark) |
| `src/server/db/postgres/social/progress.ts` | recomputeSeriesProgress (tx), resetToRewatch, setManualStatus, shelf queries |
| `src/server/db/postgres/social/watch-events.ts` | log/edit/delete watch events, batch season/series/position backfill, diary keyset pagination, watched-state EXISTS |
| `src/server/db/postgres/social/stats-dirty.ts` | markStatsDirty(tx, userId) upsert (tiny, breaks an import cycle) |
| `src/server/db/postgres/social/ratings.ts` | score+thumb+ratedAt merge upsert, per-title reads |
| `src/server/db/postgres/social/blocks.ts` (+ `blocks.test.ts`) | block/mute/unblock + PURE computeHiddenUserIds + assertNotBlocked (the enforced query-helper pattern) |
| `src/server/db/postgres/social/follows.ts` | follow/unfollow/counts/lists (block-aware) |
| `src/server/db/postgres/social/notifications.ts` | write-on-event create (block-aware), list, markRead |
| `src/server/db/postgres/social/reviews.ts` | review CRUD (movie unique via Prisma; series unique via raw NULLS NOT DISTINCT), public reads block-aware |
| `src/server/db/postgres/social/lists.ts` | list CRUD, gapped-position items, Four Favorites (max 4 app-enforced) |
| `src/server/db/postgres/social/reports.ts` | createReport |
| `src/server/db/postgres/social/stats-compute.ts` (+ `.test.ts`) | PURE stats aggregation (hours w/ runtime fallback, genres, decades, people, streaks, rewatch champions) + Zod snapshot schema |
| `src/server/db/postgres/social/stats.ts` | SQL row fetch + lazy snapshot (dirty/24h) |
| `src/server/services/moderation/gate-policy.ts` (+ `.test.ts`) | PURE gate output parsing + status decision (fail-open = PENDING_REVIEW) |
| `src/server/services/moderation/gate.ts` | gateText() via callBedrockFlex; never silent-publish |
| `src/server/services/hydration/reconcile-user-episodes.ts` | fire-and-forget post-hydration renumbering reconcile |
| `src/server/services/import/csv.ts` (+ `.test.ts`) | RFC4180 parser + CSV stringifier |
| `src/server/services/import/types.ts` | NormalizedImport / TitleRef / EpisodeRef shapes |
| `src/server/services/import/storage.ts` | ImportFileStorage interface + local-disk impl (S3 later) |
| `src/server/services/import/letterboxd.ts` (+ `.test.ts`) | Letterboxd zip → NormalizedImport (diary, watched, ratings, reviews, likes, watchlist, lists) |
| `src/server/services/import/trakt.ts` (+ `.test.ts`) | Trakt JSON export → NormalizedImport |
| `src/server/services/import/imdb.ts` (+ `.test.ts`) | IMDb ratings.csv → NormalizedImport |
| `src/server/services/import/resolve.ts` | Batch title/episode resolution (tmdbId, imdbId, title+year) — tmdbEpisodeId-first |
| `src/server/services/import/runner.ts` | ImportJob execution: dedupe, chunked inserts, ONE recompute per series, row-level stats |
| `src/server/services/export/csv-export.ts` | Own-data CSV dump → zip |
| `src/app/api/user/export/route.ts` | GET zip download (auth'd) |
| `src/server/actions/diary.ts` | logWatch, editWatchEvent, deleteWatchEvent, markSeasonWatched, markSeriesWatched, setPosition, resetToRewatch, setSeriesStatus, getDiary |
| `src/server/actions/user-ratings.ts` | setRating (thumb/score), clearRating |
| `src/server/actions/reviews.ts` | upsertReview (FIRST AI-gate consumer), deleteReview, getTitleReviews |
| `src/server/actions/social.ts` | follow/unfollow, block/mute/unblock, follower/following lists |
| `src/server/actions/lists.ts` | list CRUD, item add/remove/move, setFourFavorites, pinList |
| `src/server/actions/notifications.ts` | list, markRead, markAllRead |
| `src/server/actions/reports.ts` | createReport |
| `src/server/actions/profile.ts` | claimUsername |
| `src/server/actions/imports.ts` | startImport (FormData upload), getImportJob, listImportJobs |

**Modified:**

| Path | Change |
|---|---|
| `prisma/schema.prisma` | All Phase 0 enums/models/extensions (Tasks 1–2); WatchedMovie removal (Task 9) |
| `.github/workflows/deploy-ec2.yml` | New hash-gated "[3.5/5] UGC constraints" step (Task 4, **DO-NOT-PUSH**) |
| `src/lib/user-id.ts` | add `requirePgUserId()` guard |
| `src/server/db/postgres/user-queries.ts` | 6 watched_movies read surfaces → watch_events; ratings nullability audit |
| `src/server/ai/tools/user-profile.ts` | 7th discovered surface: `prisma.watchedMovie` → watch_events distinct |
| `src/server/services/hydration/index.ts` | wire `triggerUserEpisodeReconcile(seriesId)` at both series upsert sites |
| `package.json` | add `fflate` |

**NOT in scope (separate plans):** all UI surfaces (§4.3), comments query layer/UI (phase 1 — tables + indexes only ship now), web push, OG cards.

---

### Task 1: Schema — tracking-core enums + WatchEvent / SeriesProgress / UserStats + in-place extensions

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add all Phase 0 enums** to the ENUMS section at the bottom of `prisma/schema.prisma` (after `SpoilerLevel`):

```prisma
enum WatchStatus {
  WATCHING
  CAUGHT_UP
  COMPLETED
  DROPPED
  PAUSED
  REWATCHING
}

enum WatchEventSource {
  LOGGED
  BACKFILL
  IMPORT
}

enum WatchedAtPrecision {
  DATETIME
  DATE
  UNKNOWN
}

enum SpoilerScope {
  NONE
  WATCHED
  EPISODE
  ENDING
}

enum CommentStatus {
  PENDING_REVIEW
  PUBLISHED
  FLAGGED
  REMOVED
  DELETED_BY_USER
}

enum ListKind {
  REGULAR
  FOUR_FAVORITES
}

enum ImportSource {
  LETTERBOXD
  TRAKT
  IMDB
}

enum ImportJobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

enum NotificationType {
  REPLY
  MENTION
  FOLLOW
  CIRCLE_INVITE
  CLUB_EPISODE_OPEN
}

enum ReactionType {
  LIKE
}

enum BlockType {
  BLOCK
  MUTE
}

enum ReportReason {
  SPOILER
  HARASSMENT
  SPAM
  HATE_SPEECH
  OTHER
}

enum ReportStatus {
  OPEN
  RESOLVED
  DISMISSED
}
```

- [ ] **Step 2: Add the three tracking-core models** in a new section after `SavedFilter` (before "SOCIAL MODELS"):

```prisma
// =============================================================================
// PHASE 0 — TRACKING CORE (spec: docs/superpowers/specs/2026-06-12-social-virality-roadmap-design.md §4.2)
// Invariant 1: NEVER FK user data onto episodes/seasons rows (hydration
// delete+reinserts them). Natural keys (series_id, season_number,
// episode_number) + tmdb_episode_id as soft no-FK reference.
// =============================================================================

// The diary: one row per watch occurrence; rewatch = new row.
model WatchEvent {
  id                 Int                @id @default(autoincrement())
  userId             Int                @map("user_id")
  movieId            Int?               @map("movie_id")
  seriesId           Int?               @map("series_id")
  seasonNumber       Int?               @map("season_number")
  episodeNumber      Int?               @map("episode_number")
  tmdbEpisodeId      Int?               @map("tmdb_episode_id") // soft ref, NO relation (stable across TMDB renumbering)
  watchedAt          DateTime?          @map("watched_at") // nullable: dateless imports exist
  watchedAtPrecision WatchedAtPrecision @default(DATETIME) @map("watched_at_precision")
  // date-only values stored at 12:00 UTC (no IST day-shift) — src/lib/watch-dates.ts
  note               String? // PRIVATE per-watch note
  tags               String[]           @default([]) // stored for import fidelity; no UI yet
  isRewatch          Boolean            @default(false) @map("is_rewatch")
  isPrivate          Boolean            @default(false) @map("is_private")
  source             WatchEventSource   @default(LOGGED)
  createdAt          DateTime           @default(now()) @map("created_at")

  user    User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie   Movie?       @relation(fields: [movieId], references: [id], onDelete: Restrict)
  series  Series?      @relation(fields: [seriesId], references: [id], onDelete: Restrict)
  reviews UserReview[]

  @@index([userId, watchedAt(sort: Desc)])
  @@index([userId, movieId])
  @@index([userId, seriesId, seasonNumber, episodeNumber])
  @@index([seriesId, tmdbEpisodeId]) // reconcile pass
  @@index([movieId])
  @@index([seriesId])
  @@map("watch_events")
}

// Materialized progress, one row per (user, series). Split pointers: spoiler
// gate reads ONLY the lifetime watermark (max*); Up Next reads current cycle.
model SeriesProgress {
  userId            Int         @map("user_id")
  seriesId          Int         @map("series_id") // FK to series OK (parent rows stable across hydration)
  status            WatchStatus
  statusIsManual    Boolean     @default(false) @map("status_is_manual")
  lastSeasonNumber  Int?        @map("last_season_number")
  lastEpisodeNumber Int?        @map("last_episode_number")
  episodesWatched   Int         @default(0) @map("episodes_watched")
  maxSeasonNumber   Int?        @map("max_season_number")
  maxEpisodeNumber  Int?        @map("max_episode_number")
  rewatchStartedAt  DateTime?   @map("rewatch_started_at") // Trakt reset_at semantics; NEVER deletes events
  rewatchCount      Int         @default(0) @map("rewatch_count")
  updatedAt         DateTime    @updatedAt @map("updated_at")

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  series Series @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@id([userId, seriesId])
  @@index([userId, status, updatedAt(sort: Desc)]) // Up Next / shelves
  @@index([seriesId])
  @@map("series_progress")
}

// Lazy stats snapshot: watch-event writes set dirty; recompute on read when
// dirty or >24h. Public profiles/Wrapped render from snapshot only.
model UserStats {
  userId     Int      @id @map("user_id")
  stats      Json
  computedAt DateTime @map("computed_at")
  dirty      Boolean  @default(true)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_stats")
}
```

NOTE: `reviews UserReview[]` on WatchEvent forward-references Task 2's model — Tasks 1 and 2 are validated and pushed together in Task 2 Step 4. Run `npx prisma format` after each schema edit; do NOT push yet.

- [ ] **Step 3: Extend `UserRating` in place** — replace the `rating` line and add two fields:

```prisma
model UserRating {
  id        Int       @id @default(autoincrement())
  userId    Int       @map("user_id")
  movieId   Int?      @map("movie_id")
  seriesId  Int?      @map("series_id")
  rating    Int? // thumb: 1 = like, -1 = dislike (nullable: score-only rows exist)
  score     Int? // 1-10 (Letterboxd 0.5-5 stars import as stars*2)
  ratedAt   DateTime? @map("rated_at") // import-honest; Wrapped reads it
  createdAt DateTime  @default(now()) @map("created_at")

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie  Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@unique([userId, movieId])
  @@unique([userId, seriesId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("user_ratings")
}
```

- [ ] **Step 4: Extend `WatchlistItem` in place** (add position/note + index):

```prisma
model WatchlistItem {
  id       Int      @id @default(autoincrement())
  userId   Int      @map("user_id")
  movieId  Int?     @map("movie_id")
  seriesId Int?     @map("series_id")
  position Int? // gapped integers (n*1024); addedAt fallback when NULL
  note     String? // Trakt import fidelity
  addedAt  DateTime @default(now()) @map("added_at")

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie  Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  series Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@unique([userId, movieId])
  @@unique([userId, seriesId])
  @@index([userId, addedAt(sort: Desc)])
  @@index([userId, position])
  @@map("watchlist")
}
```

- [ ] **Step 5: Extend `Circle` in place** (slug + invite links + image; phase-3 anchors, designed now):

```prisma
model Circle {
  id          Int      @id @default(autoincrement())
  ownerId     Int      @map("owner_id")
  name        String
  slug        String?  @unique
  inviteCode  String?  @unique @map("invite_code") // shareable join links (phase-3 acquisition loop)
  imageUrl    String?  @map("image_url")
  description String?
  isPublic    Boolean  @default(false) @map("is_public")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  owner    User           @relation("circleOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  members  CircleMember[]
  lists    List[]
  comments Comment[]

  @@index([ownerId])
  @@map("circles")
}
```

- [ ] **Step 6: Add new relation lists to `User`, `Movie`, `Series`, `Person`** (covers Task 2 models too — do it once here):

In `model User`, after the existing `following Follow[] ...` line add:

```prisma
  watchEvents        WatchEvent[]
  seriesProgress     SeriesProgress[]
  userStats          UserStats?
  userReviews        UserReview[]
  comments           Comment[]
  reactions          Reaction[]
  ownedLists         List[]
  listItemsAdded     ListItem[]     @relation("listItemAddedBy")
  importJobs         ImportJob[]
  notifications      Notification[] @relation("notificationRecipient")
  notificationsActed Notification[] @relation("notificationActor")
  reportsFiled       Report[]
  blocksMade         Block[]        @relation("blocker")
  blocksReceived     Block[]        @relation("blocked")
```

In `model Movie`, after `continueWatching ContinueWatching[]` add:

```prisma
  watchEvents WatchEvent[]
  userReviews UserReview[]
  comments    Comment[]
  listItems   ListItem[]
```

In `model Series`, after `continueWatching ContinueWatching[]` add:

```prisma
  watchEvents    WatchEvent[]
  seriesProgress SeriesProgress[]
  userReviews    UserReview[]
  comments       Comment[]
  listItems      ListItem[]
```

In `model Person`, after `seriesCreated SeriesCreator[]` add:

```prisma
  listItems ListItem[]
```

- [ ] **Step 7: Do NOT push yet** (schema references Task 2 models). Continue to Task 2.

---

### Task 2: Schema — UGC/social anchor models (reviews, comments, reactions, lists, imports, notifications, reports, blocks)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the UGC models** after the Phase 0 tracking section:

```prisma
// =============================================================================
// PHASE 0 — UGC & SOCIAL ANCHORS
// Invariant 4: UGC→catalog FKs are Restrict (a catalog delete must be a
// deliberate decision, never a silent UGC purge). Cheap user state → Cascade.
// Invariant 7: typed nullable anchor columns, never generic (itemId, itemType).
// =============================================================================

// Distinct entity, NOT a comment variant. One per user per title (per season
// for series-season reviews). FIRST AI-gate consumer.
model UserReview {
  id               Int           @id @default(autoincrement())
  userId           Int           @map("user_id")
  movieId          Int?          @map("movie_id")
  seriesId         Int?          @map("series_id")
  seasonNumber     Int?          @map("season_number")
  body             String        @db.Text
  containsSpoilers Boolean       @default(false) @map("contains_spoilers")
  isPrivate        Boolean       @default(false) @map("is_private")
  watchEventId     Int?          @map("watch_event_id") // Letterboxd diary↔review linkage
  status           CommentStatus @default(PENDING_REVIEW)
  aiLabels         Json?         @map("ai_labels")
  createdAt        DateTime      @default(now()) @map("created_at")
  editedAt         DateTime?     @map("edited_at")

  user       User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie      Movie?      @relation(fields: [movieId], references: [id], onDelete: Restrict)
  series     Series?     @relation(fields: [seriesId], references: [id], onDelete: Restrict)
  watchEvent WatchEvent? @relation(fields: [watchEventId], references: [id], onDelete: SetNull)
  reports    Report[]

  // Series uniqueness (one series-level review, NULL season, per user) is raw
  // SQL: UNIQUE NULLS NOT DISTINCT in postgres/init/04-ugc-constraints.sql.
  @@unique([userId, movieId])
  @@index([movieId, status, createdAt(sort: Desc)])
  @@index([seriesId, seasonNumber, status, createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
  @@index([seriesId])
  @@index([watchEventId])
  @@map("user_reviews")
}

// Phase-1 anchor, designed now. NO UI until phase 1. Comments are NEVER
// hard-deleted in app code — deletion = status DELETED_BY_USER + body scrubbed.
model Comment {
  id                 Int           @id @default(autoincrement())
  userId             Int?          @map("user_id") // nullable: SetNull on account deletion (reply trees survive)
  movieId            Int?          @map("movie_id")
  seriesId           Int?          @map("series_id")
  seasonNumber       Int?          @map("season_number")
  episodeNumber      Int?          @map("episode_number")
  listId             Int?          @map("list_id") // phase 2
  circleId           Int?          @map("circle_id") // phase 3: visibility scope OR standalone anchor
  parentId           Int?          @map("parent_id") // replies DENORMALIZE anchor columns from root
  body               String        @db.Text
  spoilerScope       SpoilerScope  @default(NONE) @map("spoiler_scope")
  scopeSeason        Int?          @map("scope_season")
  scopeEpisode       Int?          @map("scope_episode")
  scopeTmdbEpisodeId Int?          @map("scope_tmdb_episode_id") // renumber reconcile
  status             CommentStatus @default(PUBLISHED)
  aiLabels           Json?         @map("ai_labels")
  likeCount          Int           @default(0) @map("like_count") // atomic increments only
  editedAt           DateTime?     @map("edited_at")
  createdAt          DateTime      @default(now()) @map("created_at")

  user      User?      @relation(fields: [userId], references: [id], onDelete: SetNull)
  movie     Movie?     @relation(fields: [movieId], references: [id], onDelete: Restrict)
  series    Series?    @relation(fields: [seriesId], references: [id], onDelete: Restrict)
  list      List?      @relation(fields: [listId], references: [id], onDelete: Cascade)
  circle    Circle?    @relation(fields: [circleId], references: [id], onDelete: Cascade)
  parent    Comment?   @relation("CommentReplies", fields: [parentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  replies   Comment[]  @relation("CommentReplies")
  reactions Reaction[]
  reports   Report[]

  // circleId INSIDE the composite (public reads use circle_id IS NULL as index condition)
  @@index([movieId, circleId, status, createdAt(sort: Desc)])
  @@index([seriesId, seasonNumber, episodeNumber, circleId, status, createdAt(sort: Desc)])
  @@index([parentId])
  @@index([listId])
  @@index([circleId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("comments")
}

model Reaction {
  id        Int          @id @default(autoincrement())
  userId    Int          @map("user_id")
  commentId Int?         @map("comment_id") // reviewId?/listId? later — adding nullable anchors is the cheap op
  type      ReactionType @default(LIKE)
  createdAt DateTime     @default(now()) @map("created_at")

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  comment Comment? @relation(fields: [commentId], references: [id], onDelete: Cascade)

  @@unique([userId, commentId])
  @@index([commentId]) // standalone: the unique leading with userId does not cover cascade scans
  @@map("reactions")
}

// Phase-2 anchor, designed now. Four Favorites = List(kind: FOUR_FAVORITES).
model List {
  id              Int      @id @default(autoincrement())
  ownerId         Int      @map("owner_id")
  circleId        Int?     @map("circle_id") // phase-3 group lists
  kind            ListKind @default(REGULAR)
  name            String
  slug            String
  description     String?
  isPublic        Boolean  @default(false) @map("is_public")
  isCollaborative Boolean  @default(false) @map("is_collaborative")
  isRanked        Boolean  @default(false) @map("is_ranked")
  isPinned        Boolean  @default(false) @map("is_pinned") // showcased on profile
  itemCount       Int      @default(0) @map("item_count")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  owner    User       @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  circle   Circle?    @relation(fields: [circleId], references: [id], onDelete: SetNull)
  items    ListItem[]
  comments Comment[]

  @@unique([ownerId, slug])
  @@index([ownerId])
  @@index([circleId])
  @@map("lists")
}

model ListItem {
  id        Int      @id @default(autoincrement()) // surrogate PK: reorders must not churn the PK
  listId    Int      @map("list_id")
  movieId   Int?     @map("movie_id")
  seriesId  Int?     @map("series_id")
  personId  Int?     @map("person_id") // person lists: real Letterboxd gap
  position  Int // gapped integers (n*1024): drag = 1 UPDATE
  note      String?
  addedById Int?     @map("added_by_id")
  addedAt   DateTime @default(now()) @map("added_at")

  list    List    @relation(fields: [listId], references: [id], onDelete: Cascade)
  movie   Movie?  @relation(fields: [movieId], references: [id], onDelete: Restrict)
  series  Series? @relation(fields: [seriesId], references: [id], onDelete: Restrict)
  person  Person? @relation(fields: [personId], references: [id], onDelete: Restrict)
  addedBy User?   @relation("listItemAddedBy", fields: [addedById], references: [id], onDelete: SetNull)

  @@unique([listId, movieId])
  @@unique([listId, seriesId])
  @@unique([listId, personId])
  @@index([listId, position])
  @@index([movieId])
  @@index([seriesId])
  @@index([personId])
  @@index([addedById])
  @@map("list_items")
}

model ImportJob {
  id          Int             @id @default(autoincrement())
  userId      Int             @map("user_id")
  source      ImportSource
  status      ImportJobStatus @default(PENDING)
  fileRef     String          @map("file_ref") // local path now, S3 key later — raw upload retained as lossless fallback
  stats       Json? // {rowsTotal, imported, skipped, errors[]}
  createdAt   DateTime        @default(now()) @map("created_at")
  completedAt DateTime?       @map("completed_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@map("import_jobs")
}

// Write-on-event ONLY, bounded by direct recipients (invariant 6: no fan-out).
model Notification {
  id        Int              @id @default(autoincrement())
  userId    Int              @map("user_id") // recipient
  type      NotificationType
  actorId   Int?             @map("actor_id")
  payload   Json
  readAt    DateTime?        @map("read_at")
  createdAt DateTime         @default(now()) @map("created_at")

  user  User  @relation("notificationRecipient", fields: [userId], references: [id], onDelete: Cascade)
  actor User? @relation("notificationActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([userId, readAt, createdAt(sort: Desc)])
  @@index([actorId])
  @@map("notifications")
}

model Report {
  id         Int          @id @default(autoincrement())
  reporterId Int          @map("reporter_id")
  commentId  Int?         @map("comment_id")
  reviewId   Int?         @map("review_id") // reviews are public UGC from phase 0
  reason     ReportReason
  note       String?
  status     ReportStatus @default(OPEN)
  createdAt  DateTime     @default(now()) @map("created_at")

  reporter User        @relation(fields: [reporterId], references: [id], onDelete: Cascade)
  comment  Comment?    @relation(fields: [commentId], references: [id], onDelete: Cascade)
  review   UserReview? @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  @@index([reporterId])
  @@index([commentId])
  @@index([reviewId])
  @@index([status, createdAt]) // mod queue
  @@map("reports")
}

// Safety table stakes (the retrofit trap). BLOCK = mutual invisibility;
// MUTE = one-way hide. Every social read path filters via blocks.ts helpers.
model Block {
  id        Int       @id @default(autoincrement())
  blockerId Int       @map("blocker_id")
  blockedId Int       @map("blocked_id")
  type      BlockType @default(BLOCK)
  createdAt DateTime  @default(now()) @map("created_at")

  blocker User @relation("blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked User @relation("blocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@unique([blockerId, blockedId])
  @@index([blockedId])
  @@map("blocks")
}
```

- [ ] **Step 2: Validate and format**

Run: `npx prisma format && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid` (if it errors, a relation back-reference from Task 1 Step 6 is missing — every error names the missing field).

- [ ] **Step 3: Push to LOCAL DB**

Run: `DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.` and `Generated Prisma Client`. No `--accept-data-loss` should be needed (only additive changes + a NOT NULL→NULL relax on user_ratings.rating).

- [ ] **Step 4: Typecheck the repo** (the UserRating nullability change may surface consumers — they are fixed properly in Task 10; if `yarn typecheck` fails ONLY in `user-queries.ts`/`user-data.ts` rating mappers, apply the Task 10 Step 1 edit now and note it in the commit)

Run: `yarn typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): phase 0 tracking core + UGC anchor models

WatchEvent, SeriesProgress, UserStats, UserReview, Comment, Reaction,
List/ListItem, ImportJob, Notification, Report, Block + all enums; extend
UserRating (nullable thumb + score + ratedAt), WatchlistItem (position/note),
Circle (slug/inviteCode/imageUrl). Spec §4.2; invariants §4.1 (FK indexes on
every FK, Restrict on UGC→catalog, natural keys + tmdbEpisodeId soft ref).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Raw-SQL constraint layer (04-ugc-constraints.sql) + push-survival verification

**Files:**
- Create: `postgres/init/04-ugc-constraints.sql`
- Create: `scripts/apply-ugc-constraints.ts`

- [ ] **Step 1: Create `postgres/init/04-ugc-constraints.sql`** (complete file):

```sql
-- =============================================================================
-- UGC Integrity Constraints (Phase 0 — Tracking Core)
-- =============================================================================
-- Raw-SQL integrity Prisma cannot express: CHECK constraints, partial uniques,
-- expression uniques, UNIQUE NULLS NOT DISTINCT (PG 17).
--
-- IDEMPOTENT + REAPPLY-SAFE:
--   * CHECKs: DROP CONSTRAINT IF EXISTS + ADD — a `prisma db push` table
--     recreation silently drops CHECKs; reapply must heal, never skip.
--   * Unique indexes: CREATE UNIQUE INDEX IF NOT EXISTS (recreated if a push
--     recreated the table; left alone otherwise).
--
-- Applied by the deploy pipeline gated on a COMBINED hash of this file +
-- prisma/schema.prisma (either changing re-fires the apply — spec invariant 5).
-- Apply manually:
--   DATABASE_URL=postgresql://... npx tsx scripts/apply-ugc-constraints.ts
-- =============================================================================

-- ---------------------------------------------------------------------------
-- watch_events: exactly one of movie/series; season requires series; episode
-- requires season. Series-level events (season/episode NULL) are LEGAL =
-- "watched, granularity unknown" (IMDb imports).
-- ---------------------------------------------------------------------------
ALTER TABLE watch_events DROP CONSTRAINT IF EXISTS chk_watch_events_one_anchor;
ALTER TABLE watch_events ADD CONSTRAINT chk_watch_events_one_anchor
  CHECK (num_nonnulls(movie_id, series_id) = 1);

ALTER TABLE watch_events DROP CONSTRAINT IF EXISTS chk_watch_events_season_chain;
ALTER TABLE watch_events ADD CONSTRAINT chk_watch_events_season_chain
  CHECK (season_number IS NULL OR series_id IS NOT NULL);

ALTER TABLE watch_events DROP CONSTRAINT IF EXISTS chk_watch_events_episode_chain;
ALTER TABLE watch_events ADD CONSTRAINT chk_watch_events_episode_chain
  CHECK (episode_number IS NULL OR season_number IS NOT NULL);

-- ---------------------------------------------------------------------------
-- user_ratings: a row may carry thumb, score, or both — never neither.
-- ---------------------------------------------------------------------------
ALTER TABLE user_ratings DROP CONSTRAINT IF EXISTS chk_user_ratings_thumb;
ALTER TABLE user_ratings ADD CONSTRAINT chk_user_ratings_thumb
  CHECK (rating IS NULL OR rating IN (-1, 1));

ALTER TABLE user_ratings DROP CONSTRAINT IF EXISTS chk_user_ratings_score_range;
ALTER TABLE user_ratings ADD CONSTRAINT chk_user_ratings_score_range
  CHECK (score IS NULL OR (score >= 1 AND score <= 10));

ALTER TABLE user_ratings DROP CONSTRAINT IF EXISTS chk_user_ratings_not_empty;
ALTER TABLE user_ratings ADD CONSTRAINT chk_user_ratings_not_empty
  CHECK (rating IS NOT NULL OR score IS NOT NULL);

-- ---------------------------------------------------------------------------
-- user_reviews: exactly one anchor; season requires series; ONE series-level
-- review (NULL season) per user per series — PG17 UNIQUE NULLS NOT DISTINCT.
-- ---------------------------------------------------------------------------
ALTER TABLE user_reviews DROP CONSTRAINT IF EXISTS chk_user_reviews_one_anchor;
ALTER TABLE user_reviews ADD CONSTRAINT chk_user_reviews_one_anchor
  CHECK (num_nonnulls(movie_id, series_id) = 1);

ALTER TABLE user_reviews DROP CONSTRAINT IF EXISTS chk_user_reviews_season_chain;
ALTER TABLE user_reviews ADD CONSTRAINT chk_user_reviews_season_chain
  CHECK (season_number IS NULL OR series_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_reviews_user_series_season
  ON user_reviews (user_id, series_id, season_number) NULLS NOT DISTINCT
  WHERE series_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- comments: <=1 of movie/series/list anchors AND at least one of (anchor,
-- circle); episode keys require series->season chain; EPISODE scope requires
-- scope_season.
-- ---------------------------------------------------------------------------
ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_anchor_count;
ALTER TABLE comments ADD CONSTRAINT chk_comments_anchor_count
  CHECK (num_nonnulls(movie_id, series_id, list_id) <= 1);

ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_has_target;
ALTER TABLE comments ADD CONSTRAINT chk_comments_has_target
  CHECK (num_nonnulls(movie_id, series_id, list_id, circle_id) >= 1);

ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_season_chain;
ALTER TABLE comments ADD CONSTRAINT chk_comments_season_chain
  CHECK (season_number IS NULL OR series_id IS NOT NULL);

ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_episode_chain;
ALTER TABLE comments ADD CONSTRAINT chk_comments_episode_chain
  CHECK (episode_number IS NULL OR season_number IS NOT NULL);

ALTER TABLE comments DROP CONSTRAINT IF EXISTS chk_comments_episode_scope;
ALTER TABLE comments ADD CONSTRAINT chk_comments_episode_scope
  CHECK (spoiler_scope <> 'EPISODE' OR scope_season IS NOT NULL);

-- ---------------------------------------------------------------------------
-- list_items: exactly one of movie/series/person.
-- ---------------------------------------------------------------------------
ALTER TABLE list_items DROP CONSTRAINT IF EXISTS chk_list_items_one_anchor;
ALTER TABLE list_items ADD CONSTRAINT chk_list_items_one_anchor
  CHECK (num_nonnulls(movie_id, series_id, person_id) = 1);

-- ---------------------------------------------------------------------------
-- lists: one FOUR_FAVORITES list per user (app enforces max 4 items).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_lists_four_favorites_per_owner
  ON lists (owner_id) WHERE kind = 'FOUR_FAVORITES';

-- ---------------------------------------------------------------------------
-- reports: exactly one target.
-- ---------------------------------------------------------------------------
ALTER TABLE reports DROP CONSTRAINT IF EXISTS chk_reports_one_target;
ALTER TABLE reports ADD CONSTRAINT chk_reports_one_target
  CHECK (num_nonnulls(comment_id, review_id) = 1);

-- ---------------------------------------------------------------------------
-- blocks: no self-blocks.
-- ---------------------------------------------------------------------------
ALTER TABLE blocks DROP CONSTRAINT IF EXISTS chk_blocks_not_self;
ALTER TABLE blocks ADD CONSTRAINT chk_blocks_not_self
  CHECK (blocker_id <> blocked_id);

-- ---------------------------------------------------------------------------
-- users: case-insensitive username uniqueness (routes /u/[username]).
-- Expression indexes survive `prisma db push` (FTS precedent, 02-search-indexes.sql).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
  ON users (lower(username));
```

- [ ] **Step 2: Create `scripts/apply-ugc-constraints.ts`**:

```typescript
/**
 * Applies postgres/init/04-ugc-constraints.sql statement-by-statement via
 * Prisma (local dev path; the deploy pipeline uses psql in a hash-gated step).
 *
 * Usage:
 *   DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" \
 *     npx tsx scripts/apply-ugc-constraints.ts
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const sql = readFileSync("postgres/init/04-ugc-constraints.sql", "utf8");
  const statements = sql
    .replace(/^\s*--.*$/gm, "") // strip comment lines
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log(`Applied ${statements.length} statements from 04-ugc-constraints.sql`);

  const checks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
    "SELECT conname FROM pg_constraint WHERE conname LIKE 'chk_%' ORDER BY conname"
  );
  const uniques = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    "SELECT indexname FROM pg_indexes WHERE indexname LIKE 'uq_%' ORDER BY indexname"
  );
  console.log(`CHECK constraints present: ${checks.map((c) => c.conname).join(", ")}`);
  console.log(`Unique indexes present: ${uniques.map((u) => u.indexname).join(", ")}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Apply against the LOCAL DB**

Run: `DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" npx tsx scripts/apply-ugc-constraints.ts`
Expected: `Applied 32 statements...`, a CHECK list containing all 16 `chk_*` names, and 3 `uq_*` indexes (`uq_lists_four_favorites_per_owner`, `uq_user_reviews_user_series_season`, `uq_users_username_lower`).

- [ ] **Step 4: Verify constraints SURVIVE a second `db push`** (spec §4.1 invariant 5 local verification)

Run:
```bash
DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" npx prisma db push
DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" npx tsx scripts/apply-ugc-constraints.ts
```
Expected: push reports `already in sync` (or sync with no destructive change); the apply script's "present" lists are IDENTICAL to Step 3 (re-apply is a no-op heal). If push had dropped anything, the reapply heals it — which is exactly what the deploy gate guarantees; record in the commit message whether anything was dropped.

- [ ] **Step 5: FK audit — no unindexed FKs on new tables** (invariant 3; the 42-minute-DELETE incident)

Run:
```bash
psql "postgresql://dev:dev@localhost:5436/moviebrowser" -c "
SELECT c.conrelid::regclass AS table_name, a.attname AS fk_column
FROM pg_constraint c
CROSS JOIN LATERAL unnest(c.conkey) AS k(attnum)
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE c.contype = 'f'
  AND c.conrelid::regclass::text IN ('watch_events','series_progress','user_stats','user_reviews','comments','reactions','lists','list_items','import_jobs','notifications','reports','blocks')
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND i.indkey[0] = k.attnum
  )
ORDER BY 1, 2;"
```
Expected: `(0 rows)`. If any row appears, add the missing `@@index` to the schema, push, and re-run.

- [ ] **Step 6: Negative test — constraints actually reject bad rows**

Run:
```bash
psql "postgresql://dev:dev@localhost:5436/moviebrowser" -c "INSERT INTO watch_events (user_id, movie_id, series_id) VALUES (1, 603, 1396);"
```
Expected: `ERROR:  new row for relation "watch_events" violates check constraint "chk_watch_events_one_anchor"`.

- [ ] **Step 7: Commit**

```bash
git add postgres/init/04-ugc-constraints.sql scripts/apply-ugc-constraints.ts
git commit -m "feat(db): raw-SQL UGC integrity layer (04-ugc-constraints.sql)

16 idempotent CHECKs + NULLS NOT DISTINCT series-review unique +
four-favorites-per-owner partial unique + lower(username) unique.
Verified locally: survives a second prisma db push; FK audit clean.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Deploy workflow — hash-gated constraints step (**DO-NOT-PUSH**)

**Files:**
- Modify: `.github/workflows/deploy-ec2.yml` (insert after the `[3/5] FTS indexes (gated)` block, before `[4/5] Creating data directories`)

- [ ] **Step 1: Insert the gated step** — mirror the FTS step exactly, but the gate hashes BOTH the constraints file AND the schema (a schema-only change can recreate a table and silently drop CHECKs, so either changing must re-fire):

```bash
            echo "[3.5/5] UGC constraints (gated)..."
            # Gate on schema + constraints file COMBINED: `prisma db push` table
            # recreation silently drops CHECK constraints, so a schema change
            # must re-fire this even when 04-ugc-constraints.sql is unchanged
            # (social roadmap spec §4.1 invariant 5). File is idempotent
            # (DROP CONSTRAINT IF EXISTS + ADD / CREATE UNIQUE INDEX IF NOT EXISTS).
            UGC_HASH=$(cat postgres/init/04-ugc-constraints.sql prisma/schema.prisma | md5sum | cut -d' ' -f1)
            if [ "$UGC_HASH" != "$(cat .last-ugc-hash 2>/dev/null)" ]; then
              echo "UGC sql or schema changed -> apply"
              docker compose exec -T postgres \
                psql -U moviebrowser -d moviebrowser -v ON_ERROR_STOP=0 \
                < postgres/init/04-ugc-constraints.sql 2>&1 | tail -8 \
                && echo "$UGC_HASH" > .last-ugc-hash \
                || echo "UGC constraints step warning (non-fatal)"
            else
              echo "UGC sql unchanged -> skip"
            fi
```

(Keep the file's existing indentation — it sits inside the same SSH heredoc as the FTS step.)

- [ ] **Step 2: Commit locally — DO NOT PUSH**

```bash
git add .github/workflows/deploy-ec2.yml
git commit -m "ci: hash-gated UGC constraints apply step (DO NOT DEPLOY YET)

Gate = md5 of 04-ugc-constraints.sql + schema.prisma combined, so either
changing re-fires the apply. Ships with the phase-0 release PR only —
see deploy runbook in docs/superpowers/plans/2026-06-12-phase0-backend.md.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**FLAG: this commit must not be pushed/deployed until the production cutover runbook (end of this plan) is executed.**

---

### Task 5: Watch-date helpers (TDD)

**Files:**
- Create: `src/lib/watch-dates.ts`
- Test: `src/lib/watch-dates.test.ts`

- [ ] **Step 1: Write the failing test** (`src/lib/watch-dates.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { dateOnlyToUtc, utcDayKey } from "./watch-dates";

describe("dateOnlyToUtc", () => {
  it("stores date-only values at 12:00 UTC (no IST day-shift)", () => {
    const d = dateOnlyToUtc("2026-01-31");
    expect(d.toISOString()).toBe("2026-01-31T12:00:00.000Z");
    // IST is UTC+5:30 → 17:30 same day; US Pacific (UTC-8) → 04:00 same day.
    // Noon UTC keeps the calendar day stable for every offset in (-12, +12).
  });

  it("rejects malformed input", () => {
    expect(() => dateOnlyToUtc("31/01/2026")).toThrow();
    expect(() => dateOnlyToUtc("2026-1-3")).toThrow();
    expect(() => dateOnlyToUtc("")).toThrow();
  });
});

describe("utcDayKey", () => {
  it("returns the UTC calendar day", () => {
    expect(utcDayKey(new Date("2026-01-31T12:00:00.000Z"))).toBe("2026-01-31");
    expect(utcDayKey(new Date("2026-01-31T23:59:59.000Z"))).toBe("2026-01-31");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run src/lib/watch-dates.test.ts`
Expected: FAIL — `Cannot find module './watch-dates'` (or equivalent).

- [ ] **Step 3: Implement** (`src/lib/watch-dates.ts`):

```typescript
/**
 * Diary date helpers.
 *
 * Date-only diary values (imports, manual date picks) are stored at 12:00 UTC
 * so every common timezone offset renders the same calendar day — IST (+5:30)
 * being the audience-critical case (spec §4.2 watch_events).
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dateOnlyToUtc(dateStr: string): Date {
  const m = DATE_ONLY_RE.exec(dateStr);
  if (!m) throw new Error(`Invalid date-only string: ${dateStr}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
}

/** UTC calendar day key (YYYY-MM-DD) — streak math uses these. */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run src/lib/watch-dates.test.ts`
Expected: PASS (2 test files? no — 1 file, 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/watch-dates.ts src/lib/watch-dates.test.ts
git commit -m "feat(diary): date-only watch dates stored at 12:00 UTC

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Progress derivation — pure logic (TDD)

**Files:**
- Create: `src/server/db/postgres/social/progress-derive.ts`
- Test: `src/server/db/postgres/social/progress-derive.test.ts`

This is the heart of episode tracking. PURE function — no DB. The recompute wrapper (Task 7) feeds it one user's events for one series.

Semantics (spec §4.2 series_progress):
- **Lifetime watermark** (`max*`): monotonic max (season, episode) tuple over ALL episode events — the spoiler gate reads ONLY this.
- **Current cycle**: events with `effectiveAt = watchedAt ?? createdAt` >= `rewatchStartedAt` (all events when null) — Up Next / progress % read this.
- **Status** (unless `statusIsManual`): all aired non-special episodes watched in cycle → `COMPLETED` if the show is Ended/Canceled else `CAUGHT_UP`; series-level events only (granularity unknown, IMDb) → `COMPLETED` with NULL pointers; otherwise `REWATCHING` when a rewatch cycle is open, else `WATCHING`. `DROPPED`/`PAUSED` are manual-only.
- Season-0 specials count in the watermark and the displayed episode count, but NOT toward CAUGHT_UP/COMPLETED (they gate as "before S1E1").
- Zero events → progress row is deleted (`empty: true`).

- [ ] **Step 1: Write the failing tests** (`src/server/db/postgres/social/progress-derive.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { deriveProgress, type ProgressEventInput } from "./progress-derive";

const d = (s: string) => new Date(s);

function ep(
  season: number,
  episode: number,
  watchedAt: string | null = "2026-01-10",
  createdAt = "2026-01-10"
): ProgressEventInput {
  return {
    seasonNumber: season,
    episodeNumber: episode,
    watchedAt: watchedAt ? d(watchedAt) : null,
    createdAt: d(createdAt),
  };
}

function seriesLevel(createdAt = "2026-01-10"): ProgressEventInput {
  return { seasonNumber: null, episodeNumber: null, watchedAt: null, createdAt: d(createdAt) };
}

const AIRING = { airedEpisodes: 10, isEnded: false };
const ENDED_8 = { airedEpisodes: 8, isEnded: true };

describe("deriveProgress", () => {
  it("no events -> empty (caller deletes the row)", () => {
    expect(deriveProgress([], AIRING, null, null).empty).toBe(true);
  });

  it("mid-season watching", () => {
    const r = deriveProgress([ep(1, 1), ep(1, 2), ep(1, 3)], AIRING, null, null);
    expect(r).toMatchObject({
      empty: false,
      status: "WATCHING",
      lastSeasonNumber: 1,
      lastEpisodeNumber: 3,
      episodesWatched: 3,
      maxSeasonNumber: 1,
      maxEpisodeNumber: 3,
    });
  });

  it("sparse out-of-order watch: watermark is the max tuple, count is distinct", () => {
    const r = deriveProgress([ep(1, 1), ep(3, 4), ep(1, 1)], AIRING, null, null);
    expect(r.status).toBe("WATCHING");
    expect(r.episodesWatched).toBe(2); // distinct (1,1) and (3,4)
    expect(r.maxSeasonNumber).toBe(3);
    expect(r.maxEpisodeNumber).toBe(4);
  });

  it("CAUGHT_UP: all aired episodes of a still-airing show", () => {
    const events = Array.from({ length: 8 }, (_, i) => ep(1, i + 1));
    const r = deriveProgress(events, { airedEpisodes: 8, isEnded: false }, null, null);
    expect(r.status).toBe("CAUGHT_UP");
  });

  it("COMPLETED: all episodes of an ended show", () => {
    const events = Array.from({ length: 8 }, (_, i) => ep(1, i + 1));
    const r = deriveProgress(events, ENDED_8, null, null);
    expect(r.status).toBe("COMPLETED");
  });

  it("series-level event only (IMDb import) -> COMPLETED with NULL position", () => {
    const r = deriveProgress([seriesLevel()], ENDED_8, null, null);
    expect(r.status).toBe("COMPLETED");
    expect(r.lastSeasonNumber).toBeNull();
    expect(r.maxSeasonNumber).toBeNull();
    expect(r.episodesWatched).toBe(0);
  });

  it("rewatch mid-cycle: current pointers reset, lifetime watermark survives", () => {
    const firstRun = Array.from({ length: 8 }, (_, i) =>
      ep(i < 4 ? 1 : 2, (i % 4) + 1, "2025-05-01")
    );
    const reset = d("2026-01-01");
    const cycle = [ep(1, 1, "2026-01-02"), ep(1, 2, "2026-01-03")];
    const r = deriveProgress([...firstRun, ...cycle], ENDED_8, reset, null);
    expect(r.status).toBe("REWATCHING");
    expect(r.lastSeasonNumber).toBe(1);
    expect(r.lastEpisodeNumber).toBe(2);
    expect(r.episodesWatched).toBe(2);
    expect(r.maxSeasonNumber).toBe(2); // spoiler gate still sees the ending
    expect(r.maxEpisodeNumber).toBe(4);
  });

  it("rewatch completes -> COMPLETED again", () => {
    const firstRun = Array.from({ length: 8 }, (_, i) =>
      ep(i < 4 ? 1 : 2, (i % 4) + 1, "2025-05-01")
    );
    const cycle = Array.from({ length: 8 }, (_, i) =>
      ep(i < 4 ? 1 : 2, (i % 4) + 1, "2026-02-01")
    );
    const r = deriveProgress([...firstRun, ...cycle], ENDED_8, d("2026-01-01"), null);
    expect(r.status).toBe("COMPLETED");
  });

  it("freshly reset with zero cycle events -> REWATCHING with null cycle pointers", () => {
    const firstRun = [ep(1, 1, "2025-05-01")];
    const r = deriveProgress(firstRun, AIRING, d("2026-01-01"), null);
    expect(r.status).toBe("REWATCHING");
    expect(r.lastSeasonNumber).toBeNull();
    expect(r.episodesWatched).toBe(0);
    expect(r.maxSeasonNumber).toBe(1);
  });

  it("manual status is preserved while pointers keep updating", () => {
    const r = deriveProgress([ep(1, 1), ep(1, 2)], AIRING, null, "DROPPED");
    expect(r.status).toBe("DROPPED");
    expect(r.lastEpisodeNumber).toBe(2);
  });

  it("season-0 specials count in watermark but not toward CAUGHT_UP", () => {
    const r = deriveProgress([ep(0, 1)], { airedEpisodes: 1, isEnded: false }, null, null);
    expect(r.status).toBe("WATCHING");
    expect(r.maxSeasonNumber).toBe(0);
    expect(r.maxEpisodeNumber).toBe(1);
  });

  it("dateless events use createdAt for cycle membership", () => {
    const before = ep(1, 1, null, "2025-05-01"); // BACKFILL row created before reset
    const after = ep(1, 2, null, "2026-02-01"); // BACKFILL row created after reset
    const r = deriveProgress([before, after], AIRING, d("2026-01-01"), null);
    expect(r.episodesWatched).toBe(1);
    expect(r.lastEpisodeNumber).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run src/server/db/postgres/social/progress-derive.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`src/server/db/postgres/social/progress-derive.ts`):

```typescript
/**
 * PURE series-progress derivation (no DB). Fed by recomputeSeriesProgress
 * with one user's watch events for one series.
 *
 * Spec: docs/superpowers/specs/2026-06-12-social-virality-roadmap-design.md
 * §4.2 series_progress. Split pointers: spoiler gate reads ONLY the lifetime
 * watermark (max*, monotonic); Up Next reads the current cycle (last*).
 */
import type { WatchStatus } from "@prisma/client";

export interface ProgressEventInput {
  seasonNumber: number | null;
  episodeNumber: number | null;
  watchedAt: Date | null;
  createdAt: Date;
}

export interface SeriesCountsInput {
  /** Episodes with airDate <= now, EXCLUDING season-0 specials. */
  airedEpisodes: number;
  /** TMDB status is "Ended" or "Canceled". */
  isEnded: boolean;
}

export interface DerivedProgress {
  /** True when the user has zero events: caller deletes the progress row. */
  empty: boolean;
  status: WatchStatus;
  lastSeasonNumber: number | null;
  lastEpisodeNumber: number | null;
  episodesWatched: number;
  maxSeasonNumber: number | null;
  maxEpisodeNumber: number | null;
}

function effectiveAt(e: ProgressEventInput): Date {
  return e.watchedAt ?? e.createdAt;
}

function isEpisodeEvent(e: ProgressEventInput): boolean {
  return e.seasonNumber !== null && e.episodeNumber !== null;
}

function maxTuple(events: ProgressEventInput[]): {
  season: number | null;
  episode: number | null;
} {
  let season: number | null = null;
  let episode: number | null = null;
  for (const e of events) {
    if (e.seasonNumber === null || e.episodeNumber === null) continue;
    if (
      season === null ||
      e.seasonNumber > season ||
      (e.seasonNumber === season && e.episodeNumber > (episode ?? -1))
    ) {
      season = e.seasonNumber;
      episode = e.episodeNumber;
    }
  }
  return { season, episode };
}

export function deriveProgress(
  events: ProgressEventInput[],
  counts: SeriesCountsInput,
  rewatchStartedAt: Date | null,
  manualStatus: WatchStatus | null
): DerivedProgress {
  if (events.length === 0) {
    return {
      empty: true,
      status: "WATCHING",
      lastSeasonNumber: null,
      lastEpisodeNumber: null,
      episodesWatched: 0,
      maxSeasonNumber: null,
      maxEpisodeNumber: null,
    };
  }

  const cycleEvents = rewatchStartedAt
    ? events.filter((e) => effectiveAt(e).getTime() >= rewatchStartedAt.getTime())
    : events;

  const lifetime = maxTuple(events);
  const cycle = maxTuple(cycleEvents);

  const cycleKeys = new Set<string>();
  const cycleNonSpecialKeys = new Set<string>();
  let cycleHasGranularityUnknown = false;
  for (const e of cycleEvents) {
    if (isEpisodeEvent(e)) {
      const key = `${e.seasonNumber}:${e.episodeNumber}`;
      cycleKeys.add(key);
      if (e.seasonNumber !== 0) cycleNonSpecialKeys.add(key);
    } else {
      cycleHasGranularityUnknown = true;
    }
  }

  let status: WatchStatus;
  if (manualStatus !== null) {
    status = manualStatus;
  } else if (counts.airedEpisodes > 0 && cycleNonSpecialKeys.size >= counts.airedEpisodes) {
    status = counts.isEnded ? "COMPLETED" : "CAUGHT_UP";
  } else if (cycleKeys.size === 0 && cycleHasGranularityUnknown) {
    // Series-level events only (IMDb import): watched, granularity unknown.
    status = "COMPLETED";
  } else if (rewatchStartedAt !== null) {
    status = "REWATCHING";
  } else {
    status = "WATCHING";
  }

  return {
    empty: false,
    status,
    lastSeasonNumber: cycle.season,
    lastEpisodeNumber: cycle.episode,
    episodesWatched: cycleKeys.size,
    maxSeasonNumber: lifetime.season,
    maxEpisodeNumber: lifetime.episode,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run src/server/db/postgres/social/progress-derive.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/postgres/social/progress-derive.ts src/server/db/postgres/social/progress-derive.test.ts
git commit -m "feat(progress): pure series-progress derivation (cycle vs lifetime watermark)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Watch-events + progress query modules

**Files:**
- Create: `src/server/db/postgres/social/stats-dirty.ts`
- Create: `src/server/db/postgres/social/progress.ts`
- Create: `src/server/db/postgres/social/watch-events.ts`

These are thin DB wrappers around Task 6's pure logic — no new unit tests (the logic is already covered; wrappers are exercised by the verification task and actions).

- [ ] **Step 1: Create `src/server/db/postgres/social/stats-dirty.ts`** (tiny module — avoids an import cycle between watch-events and stats):

```typescript
/**
 * Marks a user's stats snapshot dirty. Called inside every transaction that
 * writes watch events / ratings. Lazy recompute happens on read (stats.ts).
 */
import { Prisma } from "@prisma/client";

export async function markStatsDirty(
  tx: Prisma.TransactionClient,
  userId: number
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO user_stats (user_id, stats, computed_at, dirty)
    VALUES (${userId}, '{}'::jsonb, now(), true)
    ON CONFLICT (user_id) DO UPDATE SET dirty = true
  `;
}
```

- [ ] **Step 2: Create `src/server/db/postgres/social/progress.ts`**:

```typescript
/**
 * Materialized series progress (one row per user+series).
 *
 * recomputeSeriesProgress is TRANSACTIONAL with event writes and runs ONCE
 * per batch (spec mandate: 300-episode mark = 1 action, 1 recompute).
 * Index-only aggregate over one user's rows for one series (~ms at soap scale).
 */
import { Prisma, type WatchStatus } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { deriveProgress } from "./progress-derive";
import { markStatsDirty } from "./stats-dirty";

const ENDED_STATUSES = new Set(["Ended", "Canceled"]);

/** Accepts a transaction client OR the root prisma client (structurally compatible). */
export async function recomputeSeriesProgress(
  tx: Prisma.TransactionClient,
  userId: number,
  seriesId: number
): Promise<void> {
  const [events, series, airedEpisodes, existing] = await Promise.all([
    tx.watchEvent.findMany({
      where: { userId, seriesId },
      select: { seasonNumber: true, episodeNumber: true, watchedAt: true, createdAt: true },
    }),
    tx.series.findUnique({ where: { id: seriesId }, select: { status: true } }),
    tx.episode.count({
      where: {
        airDate: { lte: new Date() },
        season: { seriesId, seasonNumber: { gt: 0 } },
      },
    }),
    tx.seriesProgress.findUnique({
      where: { userId_seriesId: { userId, seriesId } },
      select: { status: true, statusIsManual: true, rewatchStartedAt: true },
    }),
  ]);

  const derived = deriveProgress(
    events,
    { airedEpisodes, isEnded: ENDED_STATUSES.has(series?.status ?? "") },
    existing?.rewatchStartedAt ?? null,
    existing?.statusIsManual ? existing.status : null
  );

  if (derived.empty) {
    await tx.seriesProgress.deleteMany({ where: { userId, seriesId } });
    return;
  }

  const fields = {
    status: derived.status,
    lastSeasonNumber: derived.lastSeasonNumber,
    lastEpisodeNumber: derived.lastEpisodeNumber,
    episodesWatched: derived.episodesWatched,
    maxSeasonNumber: derived.maxSeasonNumber,
    maxEpisodeNumber: derived.maxEpisodeNumber,
  };
  await tx.seriesProgress.upsert({
    where: { userId_seriesId: { userId, seriesId } },
    create: { userId, seriesId, ...fields },
    update: fields,
  });
}

/**
 * "Reset to rewatch": Trakt reset_at semantics. NEVER deletes events.
 */
export async function resetToRewatch(userId: number, seriesId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.seriesProgress.upsert({
      where: { userId_seriesId: { userId, seriesId } },
      create: {
        userId,
        seriesId,
        status: "REWATCHING",
        rewatchStartedAt: new Date(),
        rewatchCount: 1,
      },
      update: {
        rewatchStartedAt: new Date(),
        rewatchCount: { increment: 1 },
        status: "REWATCHING",
        statusIsManual: false,
      },
    });
    await recomputeSeriesProgress(tx, userId, seriesId);
  });
}

/**
 * Manual status override (DROPPED / PAUSED / any). `null` clears the override
 * and recomputes the derived status.
 */
export async function setManualStatus(
  userId: number,
  seriesId: number,
  status: WatchStatus | null
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (status === null) {
      await tx.seriesProgress.updateMany({
        where: { userId, seriesId },
        data: { statusIsManual: false },
      });
    } else {
      await tx.seriesProgress.upsert({
        where: { userId_seriesId: { userId, seriesId } },
        create: { userId, seriesId, status, statusIsManual: true },
        update: { status, statusIsManual: true },
      });
    }
    await recomputeSeriesProgress(tx, userId, seriesId);
  });
}

export interface ProgressShelfItem {
  seriesId: number;
  status: WatchStatus;
  lastSeasonNumber: number | null;
  lastEpisodeNumber: number | null;
  episodesWatched: number;
  updatedAt: Date;
  name: string | null;
  posterPath: string | null;
}

/** Shelf query for Up Next / profile "currently watching" (data-only; UI is a later plan). */
export async function getProgressShelf(
  userId: number,
  statuses: WatchStatus[],
  limit = 20
): Promise<ProgressShelfItem[]> {
  const rows = await prisma.seriesProgress.findMany({
    where: { userId, status: { in: statuses } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { series: { select: { name: true, posterPath: true } } },
  });
  return rows.map((r) => ({
    seriesId: r.seriesId,
    status: r.status,
    lastSeasonNumber: r.lastSeasonNumber,
    lastEpisodeNumber: r.lastEpisodeNumber,
    episodesWatched: r.episodesWatched,
    updatedAt: r.updatedAt,
    name: r.series.name,
    posterPath: r.series.posterPath,
  }));
}

export async function getSeriesProgress(userId: number, seriesId: number) {
  return prisma.seriesProgress.findUnique({
    where: { userId_seriesId: { userId, seriesId } },
  });
}

export { markStatsDirty };
```

- [ ] **Step 3: Create `src/server/db/postgres/social/watch-events.ts`**:

```typescript
/**
 * The diary: one row per watch occurrence; rewatch = new row.
 *
 * Invariant 1: episodes referenced by natural keys (seriesId, seasonNumber,
 * episodeNumber) + tmdbEpisodeId soft ref — NEVER an FK onto episodes rows.
 * Batch mark APIs are MANDATORY: one createMany + ONE recompute per batch.
 */
import { Prisma, type WatchedAtPrecision, type WatchEventSource } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { dateOnlyToUtc } from "@/lib/watch-dates";
import { recomputeSeriesProgress } from "./progress";
import { markStatsDirty } from "./stats-dirty";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogWatchInput {
  movieId?: number;
  seriesId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  /** YYYY-MM-DD = date precision; null = dateless; undefined = now (DATETIME). */
  watchedDate?: string | null;
  note?: string;
  isRewatch?: boolean;
  isPrivate?: boolean;
  tags?: string[];
  source?: WatchEventSource;
}

export interface EditWatchEventInput {
  watchedDate?: string | null;
  note?: string | null;
  isRewatch?: boolean;
  isPrivate?: boolean;
  tags?: string[];
}

export interface DiaryEntry {
  id: number;
  movieId: number | null;
  seriesId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  watchedAt: Date | null;
  watchedAtPrecision: WatchedAtPrecision;
  effectiveAt: Date;
  note: string | null;
  tags: string[];
  isRewatch: boolean;
  isPrivate: boolean;
  source: WatchEventSource;
  title: string | null;
  posterPath: string | null;
}

export interface DiaryCursor {
  effectiveAt: string; // ISO
  id: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWatchedAt(watchedDate: string | null | undefined): {
  watchedAt: Date | null;
  watchedAtPrecision: WatchedAtPrecision;
} {
  if (watchedDate === undefined) {
    return { watchedAt: new Date(), watchedAtPrecision: "DATETIME" };
  }
  if (watchedDate === null) {
    return { watchedAt: null, watchedAtPrecision: "UNKNOWN" };
  }
  return { watchedAt: dateOnlyToUtc(watchedDate), watchedAtPrecision: "DATE" };
}

async function lookupTmdbEpisodeId(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<number | null> {
  const row = await prisma.episode.findFirst({
    where: { episodeNumber, season: { seriesId, seasonNumber } },
    select: { tmdbEpisodeId: true },
  });
  return row?.tmdbEpisodeId ?? null;
}

// ---------------------------------------------------------------------------
// Single-event CRUD
// ---------------------------------------------------------------------------

export async function logWatchEvent(
  userId: number,
  input: LogWatchInput
): Promise<{ id: number }> {
  const { watchedAt, watchedAtPrecision } = resolveWatchedAt(input.watchedDate);
  const tmdbEpisodeId =
    input.seriesId !== undefined &&
    input.seasonNumber !== undefined &&
    input.episodeNumber !== undefined
      ? await lookupTmdbEpisodeId(input.seriesId, input.seasonNumber, input.episodeNumber)
      : null;

  return prisma.$transaction(async (tx) => {
    const event = await tx.watchEvent.create({
      data: {
        userId,
        movieId: input.movieId ?? null,
        seriesId: input.seriesId ?? null,
        seasonNumber: input.seasonNumber ?? null,
        episodeNumber: input.episodeNumber ?? null,
        tmdbEpisodeId,
        watchedAt,
        watchedAtPrecision,
        note: input.note ?? null,
        tags: input.tags ?? [],
        isRewatch: input.isRewatch ?? false,
        isPrivate: input.isPrivate ?? false,
        source: input.source ?? "LOGGED",
      },
      select: { id: true },
    });
    if (input.seriesId !== undefined) {
      await recomputeSeriesProgress(tx, userId, input.seriesId);
    }
    await markStatsDirty(tx, userId);
    return { id: event.id };
  });
}

export async function editWatchEvent(
  userId: number,
  eventId: number,
  patch: EditWatchEventInput
): Promise<boolean> {
  const existing = await prisma.watchEvent.findFirst({
    where: { id: eventId, userId },
    select: { id: true, seriesId: true },
  });
  if (!existing) return false;

  const data: Prisma.WatchEventUpdateInput = {};
  if (patch.watchedDate !== undefined) {
    const { watchedAt, watchedAtPrecision } = resolveWatchedAt(patch.watchedDate);
    data.watchedAt = watchedAt;
    data.watchedAtPrecision = watchedAtPrecision;
  }
  if (patch.note !== undefined) data.note = patch.note;
  if (patch.isRewatch !== undefined) data.isRewatch = patch.isRewatch;
  if (patch.isPrivate !== undefined) data.isPrivate = patch.isPrivate;
  if (patch.tags !== undefined) data.tags = patch.tags;

  await prisma.$transaction(async (tx) => {
    await tx.watchEvent.update({ where: { id: eventId }, data });
    if (existing.seriesId !== null) {
      await recomputeSeriesProgress(tx, userId, existing.seriesId);
    }
    await markStatsDirty(tx, userId);
  });
  return true;
}

export async function deleteWatchEvent(userId: number, eventId: number): Promise<boolean> {
  const existing = await prisma.watchEvent.findFirst({
    where: { id: eventId, userId },
    select: { id: true, seriesId: true },
  });
  if (!existing) return false;

  await prisma.$transaction(async (tx) => {
    await tx.watchEvent.delete({ where: { id: eventId } });
    if (existing.seriesId !== null) {
      await recomputeSeriesProgress(tx, userId, existing.seriesId);
    }
    await markStatsDirty(tx, userId);
  });
  return true;
}

// ---------------------------------------------------------------------------
// Batch mark APIs (spec mandate: ONE createMany, ONE recompute)
// ---------------------------------------------------------------------------

interface EpisodeKey {
  seasonNumber: number;
  episodeNumber: number;
  tmdbEpisodeId: number | null;
}

/**
 * Inserts BACKFILL events for the given episodes that are not yet watched in
 * the current cycle. watchedAt=NULL/UNKNOWN: the user asserts past watching,
 * date unknown — honest for stats (Wrapped excludes BACKFILL noise).
 */
async function backfillEpisodes(
  userId: number,
  seriesId: number,
  episodes: EpisodeKey[]
): Promise<{ inserted: number }> {
  return prisma.$transaction(async (tx) => {
    const progress = await tx.seriesProgress.findUnique({
      where: { userId_seriesId: { userId, seriesId } },
      select: { rewatchStartedAt: true },
    });
    const reset = progress?.rewatchStartedAt ?? null;
    const cycleWhere: Prisma.WatchEventWhereInput = reset
      ? {
          OR: [
            { watchedAt: { gte: reset } },
            { watchedAt: null, createdAt: { gte: reset } },
          ],
        }
      : {};
    const existing = await tx.watchEvent.findMany({
      where: { userId, seriesId, episodeNumber: { not: null }, ...cycleWhere },
      select: { seasonNumber: true, episodeNumber: true },
    });
    const have = new Set(existing.map((e) => `${e.seasonNumber}:${e.episodeNumber}`));

    const rows = episodes
      .filter((e) => !have.has(`${e.seasonNumber}:${e.episodeNumber}`))
      .map((e) => ({
        userId,
        seriesId,
        seasonNumber: e.seasonNumber,
        episodeNumber: e.episodeNumber,
        tmdbEpisodeId: e.tmdbEpisodeId,
        watchedAt: null,
        watchedAtPrecision: "UNKNOWN" as const,
        source: "BACKFILL" as const,
        isRewatch: reset !== null,
      }));

    if (rows.length > 0) {
      await tx.watchEvent.createMany({ data: rows });
    }
    await recomputeSeriesProgress(tx, userId, seriesId);
    await markStatsDirty(tx, userId);
    return { inserted: rows.length };
  });
}

async function fetchAiredEpisodes(
  seriesId: number,
  seasonWhere: Prisma.SeasonWhereInput
): Promise<EpisodeKey[]> {
  const eps = await prisma.episode.findMany({
    where: { airDate: { lte: new Date() }, season: { is: { seriesId, ...seasonWhere } } },
    select: {
      episodeNumber: true,
      tmdbEpisodeId: true,
      season: { select: { seasonNumber: true } },
    },
  });
  return eps.map((e) => ({
    seasonNumber: e.season.seasonNumber,
    episodeNumber: e.episodeNumber,
    tmdbEpisodeId: e.tmdbEpisodeId,
  }));
}

export async function markSeasonWatched(
  userId: number,
  seriesId: number,
  seasonNumber: number
): Promise<{ inserted: number }> {
  const episodes = await fetchAiredEpisodes(seriesId, { seasonNumber });
  return backfillEpisodes(userId, seriesId, episodes);
}

export async function markSeriesWatched(
  userId: number,
  seriesId: number
): Promise<{ inserted: number }> {
  const episodes = await fetchAiredEpisodes(seriesId, { seasonNumber: { gt: 0 } });
  return backfillEpisodes(userId, seriesId, episodes);
}

/** "Caught up through S{s}E{e}": backfills every aired non-special episode <= position. */
export async function setPosition(
  userId: number,
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<{ inserted: number }> {
  const all = await fetchAiredEpisodes(seriesId, { seasonNumber: { gt: 0 } });
  const upTo = all.filter(
    (e) =>
      e.seasonNumber < seasonNumber ||
      (e.seasonNumber === seasonNumber && e.episodeNumber <= episodeNumber)
  );
  return backfillEpisodes(userId, seriesId, upTo);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Movie watched-state: spoiler-gate predicate `EXISTS` on [userId, movieId]. */
export async function hasWatchedMovie(userId: number, movieId: number): Promise<boolean> {
  const row = await prisma.watchEvent.findFirst({
    where: { userId, movieId },
    select: { id: true },
  });
  return row !== null;
}

interface DiaryRawRow {
  id: number;
  movie_id: number | null;
  series_id: number | null;
  season_number: number | null;
  episode_number: number | null;
  watched_at: Date | null;
  watched_at_precision: WatchedAtPrecision;
  effective_at: Date;
  note: string | null;
  tags: string[];
  is_rewatch: boolean;
  is_private: boolean;
  source: WatchEventSource;
  movie_title: string | null;
  movie_poster: string | null;
  series_name: string | null;
  series_poster: string | null;
}

/**
 * Diary page: keyset pagination on (COALESCE(watched_at, created_at), id)
 * descending — never OFFSET.
 */
export async function getDiaryPage(
  userId: number,
  opts: { cursor?: DiaryCursor; limit?: number } = {}
): Promise<{ entries: DiaryEntry[]; nextCursor: DiaryCursor | null }> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const cursorClause = opts.cursor
    ? Prisma.sql`AND (COALESCE(we.watched_at, we.created_at), we.id) < (${new Date(
        opts.cursor.effectiveAt
      )}, ${opts.cursor.id})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<DiaryRawRow[]>`
    SELECT we.id, we.movie_id, we.series_id, we.season_number, we.episode_number,
           we.watched_at, we.watched_at_precision,
           COALESCE(we.watched_at, we.created_at) AS effective_at,
           we.note, we.tags, we.is_rewatch, we.is_private, we.source,
           m.title AS movie_title, m.poster_path AS movie_poster,
           s.name AS series_name, s.poster_path AS series_poster
    FROM watch_events we
    LEFT JOIN movies m ON m.id = we.movie_id
    LEFT JOIN series s ON s.id = we.series_id
    WHERE we.user_id = ${userId}
    ${cursorClause}
    ORDER BY effective_at DESC, we.id DESC
    LIMIT ${limit + 1}
  `;

  const page = rows.slice(0, limit);
  const entries: DiaryEntry[] = page.map((r) => ({
    id: r.id,
    movieId: r.movie_id,
    seriesId: r.series_id,
    seasonNumber: r.season_number,
    episodeNumber: r.episode_number,
    watchedAt: r.watched_at,
    watchedAtPrecision: r.watched_at_precision,
    effectiveAt: r.effective_at,
    note: r.note,
    tags: r.tags,
    isRewatch: r.is_rewatch,
    isPrivate: r.is_private,
    source: r.source,
    title: r.movie_title ?? r.series_name,
    posterPath: r.movie_poster ?? r.series_poster,
  }));
  const nextCursor =
    rows.length > limit && page.length > 0
      ? {
          effectiveAt: page[page.length - 1].effective_at.toISOString(),
          id: page[page.length - 1].id,
        }
      : null;
  return { entries, nextCursor };
}
```

- [ ] **Step 4: Typecheck**

Run: `yarn typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/postgres/social/stats-dirty.ts src/server/db/postgres/social/progress.ts src/server/db/postgres/social/watch-events.ts
git commit -m "feat(diary): watch-events + progress query layer (batch marks, one recompute per batch)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Diary server actions

**Files:**
- Modify: `src/lib/user-id.ts` (add `requirePgUserId`)
- Create: `src/server/actions/diary.ts`

- [ ] **Step 1: Add `requirePgUserId` to `src/lib/user-id.ts`** (append at the end):

```typescript
/**
 * Phase-0 social features are Postgres-only (no MongoDB twin). Throws when the
 * USER_DATA_SOURCE flag still points at MongoDB so we fail loudly, not with
 * FK violations against google-sub pseudo-ids.
 */
export async function requirePgUserId(): Promise<number> {
  if (!usePostgresUserData) {
    throw new Error("Social features require USER_DATA_SOURCE=postgres");
  }
  return requireUserIdForDb();
}
```

- [ ] **Step 2: Create `src/server/actions/diary.ts`**:

```typescript
"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import {
  logWatchEvent,
  editWatchEvent,
  deleteWatchEvent,
  markSeasonWatched as markSeasonWatchedQuery,
  markSeriesWatched as markSeriesWatchedQuery,
  setPosition as setPositionQuery,
  getDiaryPage,
  type DiaryCursor,
} from "@/server/db/postgres/social/watch-events";
import {
  resetToRewatch as resetToRewatchQuery,
  setManualStatus,
} from "@/server/db/postgres/social/progress";

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const LogWatchSchema = z
  .object({
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    seasonNumber: z.number().int().min(0).optional(),
    episodeNumber: z.number().int().min(0).optional(),
    watchedDate: DateOnly.nullable().optional(),
    note: z.string().max(5000).optional(),
    isRewatch: z.boolean().optional(),
    isPrivate: z.boolean().optional(),
    tags: z.array(z.string().max(64)).max(20).optional(),
  })
  .refine((v) => (v.movieId === undefined) !== (v.seriesId === undefined), {
    message: "Exactly one of movieId/seriesId is required",
  })
  .refine((v) => v.seasonNumber === undefined || v.seriesId !== undefined, {
    message: "seasonNumber requires seriesId",
  })
  .refine((v) => v.episodeNumber === undefined || v.seasonNumber !== undefined, {
    message: "episodeNumber requires seasonNumber",
  });

type ActionResult<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

function failure(action: string, error: unknown): { success: false; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false, error: message };
}

export async function logWatch(
  input: z.infer<typeof LogWatchSchema>
): Promise<ActionResult<{ eventId: number }>> {
  try {
    const validated = LogWatchSchema.parse(input);
    const userId = await requirePgUserId();
    const { id } = await logWatchEvent(userId, validated);
    return { success: true, eventId: id };
  } catch (error: unknown) {
    return failure("logWatch", error);
  }
}

const EditWatchSchema = z.object({
  eventId: z.number().int().positive(),
  watchedDate: DateOnly.nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
  isRewatch: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

export async function editDiaryEntry(
  input: z.infer<typeof EditWatchSchema>
): Promise<ActionResult> {
  try {
    const { eventId, ...patch } = EditWatchSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await editWatchEvent(userId, eventId, patch);
    return ok ? { success: true } : { success: false, error: "Not found" };
  } catch (error: unknown) {
    return failure("editDiaryEntry", error);
  }
}

const DeleteWatchSchema = z.object({ eventId: z.number().int().positive() });

export async function deleteDiaryEntry(
  input: z.infer<typeof DeleteWatchSchema>
): Promise<ActionResult> {
  try {
    const { eventId } = DeleteWatchSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await deleteWatchEvent(userId, eventId);
    return ok ? { success: true } : { success: false, error: "Not found" };
  } catch (error: unknown) {
    return failure("deleteDiaryEntry", error);
  }
}

const MarkSeasonSchema = z.object({
  seriesId: z.number().int().positive(),
  seasonNumber: z.number().int().min(0),
});

/** Batch API: one server action, one createMany, ONE recompute (spec mandate). */
export async function markSeasonWatched(
  input: z.infer<typeof MarkSeasonSchema>
): Promise<ActionResult<{ inserted: number }>> {
  try {
    const { seriesId, seasonNumber } = MarkSeasonSchema.parse(input);
    const userId = await requirePgUserId();
    const result = await markSeasonWatchedQuery(userId, seriesId, seasonNumber);
    return { success: true, inserted: result.inserted };
  } catch (error: unknown) {
    return failure("markSeasonWatched", error);
  }
}

const MarkSeriesSchema = z.object({ seriesId: z.number().int().positive() });

export async function markSeriesWatched(
  input: z.infer<typeof MarkSeriesSchema>
): Promise<ActionResult<{ inserted: number }>> {
  try {
    const { seriesId } = MarkSeriesSchema.parse(input);
    const userId = await requirePgUserId();
    const result = await markSeriesWatchedQuery(userId, seriesId);
    return { success: true, inserted: result.inserted };
  } catch (error: unknown) {
    return failure("markSeriesWatched", error);
  }
}

const SetPositionSchema = z.object({
  seriesId: z.number().int().positive(),
  seasonNumber: z.number().int().min(1),
  episodeNumber: z.number().int().min(1),
});

/** "Caught up through S3E4" — one tap backfills (source=BACKFILL). */
export async function setPosition(
  input: z.infer<typeof SetPositionSchema>
): Promise<ActionResult<{ inserted: number }>> {
  try {
    const { seriesId, seasonNumber, episodeNumber } = SetPositionSchema.parse(input);
    const userId = await requirePgUserId();
    const result = await setPositionQuery(userId, seriesId, seasonNumber, episodeNumber);
    return { success: true, inserted: result.inserted };
  } catch (error: unknown) {
    return failure("setPosition", error);
  }
}

const ResetSchema = z.object({ seriesId: z.number().int().positive() });

export async function resetToRewatch(
  input: z.infer<typeof ResetSchema>
): Promise<ActionResult> {
  try {
    const { seriesId } = ResetSchema.parse(input);
    const userId = await requirePgUserId();
    await resetToRewatchQuery(userId, seriesId);
    return { success: true };
  } catch (error: unknown) {
    return failure("resetToRewatch", error);
  }
}

const SetStatusSchema = z.object({
  seriesId: z.number().int().positive(),
  status: z.enum(["WATCHING", "CAUGHT_UP", "COMPLETED", "DROPPED", "PAUSED", "REWATCHING"]).nullable(),
});

export async function setSeriesStatus(
  input: z.infer<typeof SetStatusSchema>
): Promise<ActionResult> {
  try {
    const { seriesId, status } = SetStatusSchema.parse(input);
    const userId = await requirePgUserId();
    await setManualStatus(userId, seriesId, status);
    return { success: true };
  } catch (error: unknown) {
    return failure("setSeriesStatus", error);
  }
}

const DiaryPageSchema = z.object({
  cursor: z.object({ effectiveAt: z.string(), id: z.number().int() }).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function getDiary(input: z.infer<typeof DiaryPageSchema> = {}) {
  try {
    const validated = DiaryPageSchema.parse(input);
    const userId = await requirePgUserId();
    const page = await getDiaryPage(userId, {
      cursor: validated.cursor as DiaryCursor | undefined,
      limit: validated.limit,
    });
    return { success: true as const, ...page };
  } catch (error: unknown) {
    return failure("getDiary", error);
  }
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/user-id.ts src/server/actions/diary.ts
git commit -m "feat(diary): server actions (log/edit/delete, batch season/series/position marks)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: watched_movies hard migration (data script + 7 read surfaces + drop table)

**Files:**
- Create: `scripts/migrate-watched-movies.ts`
- Modify: `src/server/db/postgres/user-queries.ts` (getLibraryData, getWatchedMovieIdsWithDates, markMovieWatched, unmarkMovieWatched, getUserItemStatus, getUserExclusions, getAdminUsersWithActivity)
- Modify: `src/server/ai/tools/user-profile.ts` (7th surface, discovered during exploration — direct `prisma.watchedMovie` query at ~line 48)
- Modify: `prisma/schema.prisma` (remove `WatchedMovie` model + `User.watchedMovies` + `Movie.watchedByUsers`)

No compatibility view, no dual writes (spec). The MongoDB twin (`src/server/db/mongo/user-queries.ts`) is untouched — the `user-data.ts` delegation interface keeps identical shapes, legacy mode keeps its own storage.

- [ ] **Step 1: Create `scripts/migrate-watched-movies.ts`** (idempotent — safe to re-run):

```typescript
/**
 * Hard migration: watched_movies -> watch_events.
 *
 * Old rows become source=BACKFILL, watchedAt=NULL, precision=UNKNOWN — the
 * old createdAt is when the user MARKED, not watched (spec §4.2), preserved
 * as watch_events.created_at for ordering.
 *
 * Idempotent via NOT EXISTS on (user, movie, BACKFILL). Run BEFORE dropping
 * the model from the schema.
 *
 * Usage:
 *   DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" \
 *     npx tsx scripts/migrate-watched-movies.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const sourceRows = await prisma.watchedMovie.count();

  const inserted = await prisma.$executeRaw`
    INSERT INTO watch_events
      (user_id, movie_id, watched_at, watched_at_precision, source,
       is_rewatch, is_private, tags, created_at)
    SELECT wm.user_id, wm.movie_id, NULL, 'UNKNOWN', 'BACKFILL',
           false, false, '{}', wm.created_at
    FROM watched_movies wm
    WHERE NOT EXISTS (
      SELECT 1 FROM watch_events we
      WHERE we.user_id = wm.user_id
        AND we.movie_id = wm.movie_id
        AND we.source = 'BACKFILL'
    )
  `;

  const verify = await prisma.$queryRaw<Array<{ missing: bigint }>>`
    SELECT COUNT(*)::bigint AS missing
    FROM watched_movies wm
    WHERE NOT EXISTS (
      SELECT 1 FROM watch_events we
      WHERE we.user_id = wm.user_id AND we.movie_id = wm.movie_id
    )
  `;
  const missing = Number(verify[0]?.missing ?? 0n);

  await prisma.$executeRaw`UPDATE user_stats SET dirty = true`;

  console.log({ sourceRows, inserted, missing });
  if (missing > 0) {
    throw new Error(`Migration incomplete: ${missing} watched_movies rows have no watch_event`);
  }
  console.log("watched_movies fully represented in watch_events — safe to drop the table.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the migration against the LOCAL DB**

Run: `DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" npx tsx scripts/migrate-watched-movies.ts`
Expected: `{ sourceRows: N, inserted: N, missing: 0 }` then the "safe to drop" line. Re-run it: `inserted: 0, missing: 0` (idempotency proof).

- [ ] **Step 3: Refactor `src/server/db/postgres/user-queries.ts`** — replace every `prisma.watchedMovie` usage:

(a) In `getLibraryData`, replace the `prisma.watchedMovie.findMany` element of the `Promise.all` array with:

```typescript
      prisma.watchEvent.findMany({
        where: { userId, movieId: { not: null } },
        select: { movieId: true },
        distinct: ["movieId"],
      }),
```

and the mapping line with:

```typescript
    watchedMovieIds: watchedMovies.flatMap((w) => (w.movieId === null ? [] : [w.movieId])),
```

(b) Replace `getWatchedMovieIdsWithDates` entirely (same return shape — `createdAt` = most recent effective watch):

```typescript
export async function getWatchedMovieIdsWithDates(
  userId: number
): Promise<{ movieId: number; createdAt: Date }[]> {
  const rows = await prisma.$queryRaw<Array<{ movie_id: number; last_at: Date }>>`
    SELECT movie_id, MAX(COALESCE(watched_at, created_at)) AS last_at
    FROM watch_events
    WHERE user_id = ${userId} AND movie_id IS NOT NULL
    GROUP BY movie_id
    ORDER BY last_at DESC
  `;
  return rows.map((r) => ({ movieId: r.movie_id, createdAt: r.last_at }));
}
```

(c) Replace `markMovieWatched` / `unmarkMovieWatched` (legacy toggle semantics preserved — already-watched is a no-op; unmark clears ALL events for that movie):

```typescript
import { markStatsDirty } from "./social/stats-dirty";

export async function markMovieWatched(userId: number, movieId: number): Promise<void> {
  const existing = await prisma.watchEvent.findFirst({
    where: { userId, movieId },
    select: { id: true },
  });
  if (existing) return;
  await prisma.$transaction(async (tx) => {
    await tx.watchEvent.create({
      data: { userId, movieId, watchedAt: new Date(), watchedAtPrecision: "DATETIME", source: "LOGGED" },
    });
    await markStatsDirty(tx, userId);
  });
}

export async function unmarkMovieWatched(userId: number, movieId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.watchEvent.deleteMany({ where: { userId, movieId } });
    await markStatsDirty(tx, userId);
  });
}
```

(d) In `getUserItemStatus`, movie branch: replace the `prisma.watchedMovie.findUnique` element with:

```typescript
      prisma.watchEvent.findFirst({
        where: { userId, movieId: itemId },
        select: { id: true },
      }),
```

Series branch: replace the hardcoded `isWatched: false` — add a `seriesProgress` lookup to its `Promise.all`:

```typescript
  const [watchlist, rating, progress] = await Promise.all([
    prisma.watchlistItem.findUnique({
      where: { userId_seriesId: { userId, seriesId: itemId } },
      select: { id: true },
    }),
    prisma.userRating.findUnique({
      where: { userId_seriesId: { userId, seriesId: itemId } },
      select: { rating: true },
    }),
    prisma.seriesProgress.findUnique({
      where: { userId_seriesId: { userId, seriesId: itemId } },
      select: { status: true },
    }),
  ]);
  return {
    inWatchlist: !!watchlist,
    isWatched: progress?.status === "COMPLETED" || progress?.status === "CAUGHT_UP",
    userRating: rating?.rating ?? null,
  };
```

(e) In `getUserExclusions`, movie branch: replace the `prisma.watchedMovie.findMany` element with:

```typescript
      prisma.watchEvent.findMany({
        where: { userId, movieId: { not: null } },
        select: { movieId: true },
        distinct: ["movieId"],
      }),
```

and its mapping with `watchedIds: watched.flatMap((w) => (w.movieId === null ? [] : [w.movieId]))`. Series branch: replace `watchedIds: []` with a `seriesProgress.findMany({ where: { userId }, select: { seriesId: true } })` element mapped to `watchedIds`.

(f) In `getAdminUsersWithActivity`: remove `watchedMovies: true` from the `_count.select`, and add a counts prefetch next to `seriesListCounts`:

```typescript
  const watchedCounts = await prisma.$queryRaw<Array<{ user_id: number; n: bigint }>>`
    SELECT user_id, COUNT(DISTINCT movie_id)::bigint AS n
    FROM watch_events
    WHERE movie_id IS NOT NULL
    GROUP BY user_id
  `;
  const watchedByUser = new Map(watchedCounts.map((c) => [c.user_id, Number(c.n)]));
```

then in the return mapping: `WatchedMovies: watchedByUser.get(u.id) ?? 0,`.

- [ ] **Step 4: Refactor `src/server/ai/tools/user-profile.ts`** — replace the `prisma.watchedMovie.findMany` element of the `Promise.all` with:

```typescript
        prisma.watchEvent.findMany({
          where: { userId, movieId: { not: null } },
          orderBy: [{ watchedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          distinct: ["movieId"],
          take: 8,
          select: {
            movieId: true,
            watchedAt: true,
            createdAt: true,
            movie: {
              select: {
                title: true,
                genres: { select: { genre: { select: { name: true } } } },
              },
            },
          },
        }),
```

Downstream fixes in the same function (movie relation is now nullable):
- genre loop: `for (const g of w.movie?.genres ?? []) {`
- recentWatched map: `{ title: w.movie?.title ?? "Unknown", when: daysAgo(w.watchedAt ?? w.createdAt) }`

- [ ] **Step 5: Remove the model from `prisma/schema.prisma`** — delete the entire `model WatchedMovie { ... }` block (and its `// Keep separate - watched movies...` comment), delete `watchedMovies WatchedMovie[]` from `model User`, delete `watchedByUsers WatchedMovie[]` from `model Movie`.

- [ ] **Step 6: Push the drop to the LOCAL DB** (data loss is intentional — the data now lives in watch_events; Step 2 verified `missing: 0`)

Run: `DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" npx prisma db push --accept-data-loss`
Expected: warns about dropping `watched_movies`, completes, regenerates the client.

- [ ] **Step 7: Verify no stragglers + typecheck**

Run: `grep -rn "prisma.watchedMovie\|tx.watchedMovie" src --include="*.ts" | grep -v "db/mongo" || echo CLEAN; grep -c "WatchedMovie" prisma/schema.prisma || true`
Expected: `CLEAN` then `0` (no Prisma-client usages outside the legacy mongo impl; model gone from the schema. Response-shape keys like `watchedMovieIds`/`WatchedMovies:` and the `getWatchedMovieIdsWithDates` function NAME intentionally remain).
Run: `yarn typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add scripts/migrate-watched-movies.ts src/server/db/postgres/user-queries.ts src/server/ai/tools/user-profile.ts prisma/schema.prisma
git commit -m "feat(diary)!: hard-migrate watched_movies into watch_events and drop the table

7 read surfaces refactored (getLibraryData, getWatchedMovieIdsWithDates,
markMovieWatched/unmark, getUserItemStatus, getUserExclusions, admin counts,
ai user-profile tool). No compatibility view, no dual writes. Series
isWatched now derives from series_progress.

PRODUCTION NOTE: run scripts/migrate-watched-movies.ts on the box BEFORE the
schema deploy (see runbook in the phase-0 plan).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Ratings — score + thumb + ratedAt

**Files:**
- Create: `src/server/db/postgres/social/ratings.ts`
- Create: `src/server/actions/user-ratings.ts`
- Modify: `src/server/db/postgres/user-queries.ts` (nullable-rating audit of legacy surfaces)

- [ ] **Step 1: Audit legacy `rating` consumers in `user-queries.ts`** (rating is now `Int?`; legacy thumb surfaces must only see thumb-carrying rows):

(a) `getLibraryData` ratings element — add the null filter and keep the emitted shape non-nullable:

```typescript
      prisma.userRating.findMany({
        where: { userId, rating: { not: null } },
        select: { movieId: true, seriesId: true, rating: true },
      }),
```

and its mapping:

```typescript
    ratings: ratings.flatMap((r) =>
      r.rating === null
        ? []
        : [
            {
              itemId: r.movieId ?? r.seriesId!,
              itemType: r.movieId ? ("movie" as const) : ("series" as const),
              rating: r.rating,
            },
          ]
    ),
```

(`r.seriesId!` matches the file's existing polymorphic-row convention; keep it consistent.)

(b) `getUserRatings`: add `rating: { not: null }` to the `where` and the same `flatMap` null-guard pattern.

(c) `upsertRating` (legacy thumb API used by `/api/user/rating`): stamp `ratedAt` too —
in both branches: `create: { userId, movieId: itemId, rating, ratedAt: new Date() }` / `update: { rating, createdAt: new Date(), ratedAt: new Date() }` (same for the series branch).

(d) `deleteRating` (legacy semantics = remove the thumb, must NOT nuke a coexisting score):

```typescript
export async function deleteRating(
  userId: number,
  itemId: number,
  itemType: "movie" | "series"
): Promise<void> {
  const where =
    itemType === "movie" ? { userId, movieId: itemId } : { userId, seriesId: itemId };
  const existing = await prisma.userRating.findFirst({
    where,
    select: { id: true, score: true },
  });
  if (!existing) return;
  if (existing.score === null) {
    await prisma.userRating.delete({ where: { id: existing.id } });
  } else {
    await prisma.userRating.update({ where: { id: existing.id }, data: { rating: null } });
  }
}
```

(e) `getUserExclusions` disliked filter `rating: -1` — unchanged (NULL never equals -1); verify it compiles.

- [ ] **Step 2: Create `src/server/db/postgres/social/ratings.ts`**:

```typescript
/**
 * User ratings: thumb (±1) + score (1-10) + ratedAt on one row.
 * A row may carry thumb, score, or both — never neither (DB CHECK enforces;
 * this module deletes the row when both would become null).
 */
import { prisma } from "@/server/db/postgres";
import { markStatsDirty } from "./stats-dirty";

export interface SetRatingInput {
  itemId: number;
  itemType: "movie" | "series";
  /** undefined = leave unchanged; null = clear. */
  thumb?: 1 | -1 | null;
  /** undefined = leave unchanged; null = clear. */
  score?: number | null;
  /** Import-honest timestamp; defaults to now. */
  ratedAt?: Date;
}

export async function setUserRating(userId: number, input: SetRatingInput): Promise<void> {
  const where =
    input.itemType === "movie"
      ? { userId, movieId: input.itemId }
      : { userId, seriesId: input.itemId };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.userRating.findFirst({
      where,
      select: { id: true, rating: true, score: true },
    });

    const nextThumb = input.thumb !== undefined ? input.thumb : (existing?.rating ?? null);
    const nextScore = input.score !== undefined ? input.score : (existing?.score ?? null);

    if (nextThumb === null && nextScore === null) {
      if (existing) await tx.userRating.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.userRating.update({
        where: { id: existing.id },
        data: { rating: nextThumb, score: nextScore, ratedAt: input.ratedAt ?? new Date() },
      });
    } else {
      await tx.userRating.create({
        data: {
          userId,
          movieId: input.itemType === "movie" ? input.itemId : null,
          seriesId: input.itemType === "series" ? input.itemId : null,
          rating: nextThumb,
          score: nextScore,
          ratedAt: input.ratedAt ?? new Date(),
        },
      });
    }
    await markStatsDirty(tx, userId);
  });
}

export interface TitleRating {
  thumb: number | null;
  score: number | null;
  ratedAt: Date | null;
}

export async function getTitleRating(
  userId: number,
  itemId: number,
  itemType: "movie" | "series"
): Promise<TitleRating | null> {
  const where =
    itemType === "movie" ? { userId, movieId: itemId } : { userId, seriesId: itemId };
  const row = await prisma.userRating.findFirst({
    where,
    select: { rating: true, score: true, ratedAt: true },
  });
  return row ? { thumb: row.rating, score: row.score, ratedAt: row.ratedAt } : null;
}

/** Batch fetch for review lists: scores by (userId, title). */
export async function getScoresForUsers(
  userIds: number[],
  itemId: number,
  itemType: "movie" | "series"
): Promise<Map<number, number>> {
  if (userIds.length === 0) return new Map();
  const where =
    itemType === "movie"
      ? { movieId: itemId, userId: { in: userIds }, score: { not: null } }
      : { seriesId: itemId, userId: { in: userIds }, score: { not: null } };
  const rows = await prisma.userRating.findMany({
    where,
    select: { userId: true, score: true },
  });
  return new Map(rows.flatMap((r) => (r.score === null ? [] : [[r.userId, r.score] as const])));
}
```

- [ ] **Step 3: Create `src/server/actions/user-ratings.ts`**:

```typescript
"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { setUserRating, getTitleRating } from "@/server/db/postgres/social/ratings";

const SetRatingSchema = z
  .object({
    itemId: z.number().int().positive(),
    itemType: z.enum(["movie", "series"]),
    thumb: z.union([z.literal(1), z.literal(-1)]).nullable().optional(),
    score: z.number().int().min(1).max(10).nullable().optional(),
  })
  .refine((v) => v.thumb !== undefined || v.score !== undefined, {
    message: "Provide thumb and/or score",
  });

export async function setRating(input: z.infer<typeof SetRatingSchema>) {
  try {
    const validated = SetRatingSchema.parse(input);
    const userId = await requirePgUserId();
    await setUserRating(userId, validated);
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "setRating", error: message });
    return { success: false as const, error: message };
  }
}

const GetRatingSchema = z.object({
  itemId: z.number().int().positive(),
  itemType: z.enum(["movie", "series"]),
});

export async function getRating(input: z.infer<typeof GetRatingSchema>) {
  try {
    const { itemId, itemType } = GetRatingSchema.parse(input);
    const userId = await requirePgUserId();
    const rating = await getTitleRating(userId, itemId, itemType);
    return { success: true as const, rating };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "getRating", error: message });
    return { success: false as const, error: message };
  }
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/postgres/social/ratings.ts src/server/actions/user-ratings.ts src/server/db/postgres/user-queries.ts
git commit -m "feat(ratings): 1-10 score + thumb + ratedAt on user_ratings; legacy thumb surfaces audited for nulls

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Blocks — pure helper (TDD) + queries + actions

**Files:**
- Create: `src/server/db/postgres/social/blocks.ts`
- Test: `src/server/db/postgres/social/blocks.test.ts`
- Create: `src/server/actions/social.ts` (block half; follow half added in Task 12)

**Invariant:** every social read path filters blocks via THESE helpers — never ad-hoc where-clauses. BLOCK = mutual invisibility + no follow/mention/reply; MUTE = one-way hide.

- [ ] **Step 1: Write the failing test** (`src/server/db/postgres/social/blocks.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { computeHiddenUserIds, type BlockRowInput } from "./blocks";

const row = (blockerId: number, blockedId: number, type: "BLOCK" | "MUTE"): BlockRowInput => ({
  blockerId,
  blockedId,
  type,
});

describe("computeHiddenUserIds", () => {
  it("viewer's own BLOCK and MUTE hide the target", () => {
    const hidden = computeHiddenUserIds(1, [row(1, 2, "BLOCK"), row(1, 3, "MUTE")]);
    expect(hidden.has(2)).toBe(true);
    expect(hidden.has(3)).toBe(true);
  });

  it("being BLOCKed hides the blocker (mutual invisibility)", () => {
    const hidden = computeHiddenUserIds(1, [row(9, 1, "BLOCK")]);
    expect(hidden.has(9)).toBe(true);
  });

  it("being MUTEd does NOT hide the muter (one-way)", () => {
    const hidden = computeHiddenUserIds(1, [row(9, 1, "MUTE")]);
    expect(hidden.has(9)).toBe(false);
  });

  it("unrelated rows are ignored", () => {
    const hidden = computeHiddenUserIds(1, [row(5, 6, "BLOCK")]);
    expect(hidden.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run src/server/db/postgres/social/blocks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/db/postgres/social/blocks.ts`**:

```typescript
/**
 * Blocks & mutes — the ENFORCED query-helper pattern (spec §4.2 blocks).
 * Every social read path (reviews, follows, notifications, future comments/
 * feed/search) filters through getHiddenUserIds/assertNotBlocked. Convention
 * is not enough; do not hand-roll block where-clauses elsewhere.
 */
import type { BlockType } from "@prisma/client";
import { prisma } from "@/server/db/postgres";

export interface BlockRowInput {
  blockerId: number;
  blockedId: number;
  type: BlockType;
}

/** PURE: BLOCK = mutual invisibility; MUTE = one-way hide (viewer's mutes only). */
export function computeHiddenUserIds(viewerId: number, rows: BlockRowInput[]): Set<number> {
  const hidden = new Set<number>();
  for (const r of rows) {
    if (r.blockerId === viewerId) {
      hidden.add(r.blockedId);
    } else if (r.blockedId === viewerId && r.type === "BLOCK") {
      hidden.add(r.blockerId);
    }
  }
  return hidden;
}

export async function getHiddenUserIds(viewerId: number): Promise<Set<number>> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true, type: true },
  });
  return computeHiddenUserIds(viewerId, rows);
}

export class BlockedError extends Error {
  constructor() {
    super("Interaction not allowed");
    this.name = "BlockedError";
  }
}

/** Throws when a BLOCK exists in either direction (follow/mention/reply guard). */
export async function assertNotBlocked(userA: number, userB: number): Promise<void> {
  const row = await prisma.block.findFirst({
    where: {
      type: "BLOCK",
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
    select: { id: true },
  });
  if (row) throw new BlockedError();
}

export async function blockUser(
  blockerId: number,
  blockedId: number,
  type: BlockType
): Promise<void> {
  if (blockerId === blockedId) throw new Error("Cannot block yourself");
  await prisma.$transaction(async (tx) => {
    await tx.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId, type },
      update: { type },
    });
    if (type === "BLOCK") {
      // BLOCK severs the follow edge both ways (spec: no follow while blocked).
      await tx.follow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followingId: blockedId },
            { followerId: blockedId, followingId: blockerId },
          ],
        },
      });
    }
  });
}

export async function unblockUser(blockerId: number, blockedId: number): Promise<void> {
  await prisma.block.deleteMany({ where: { blockerId, blockedId } });
}

export async function getBlockList(blockerId: number) {
  return prisma.block.findMany({
    where: { blockerId },
    orderBy: { createdAt: "desc" },
    include: { blocked: { select: { id: true, username: true, name: true, image: true } } },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run src/server/db/postgres/social/blocks.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Create `src/server/actions/social.ts`** (block half — Task 12 appends the follow half to this same file):

```typescript
"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import {
  blockUser as blockUserQuery,
  unblockUser as unblockUserQuery,
  getBlockList,
} from "@/server/db/postgres/social/blocks";

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

const BlockSchema = z.object({
  userId: z.number().int().positive(),
  type: z.enum(["BLOCK", "MUTE"]).default("BLOCK"),
});

export async function blockUser(input: z.infer<typeof BlockSchema>) {
  try {
    const { userId: targetId, type } = BlockSchema.parse(input);
    const userId = await requirePgUserId();
    await blockUserQuery(userId, targetId, type);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("blockUser", error);
  }
}

const UnblockSchema = z.object({ userId: z.number().int().positive() });

export async function unblockUser(input: z.infer<typeof UnblockSchema>) {
  try {
    const { userId: targetId } = UnblockSchema.parse(input);
    const userId = await requirePgUserId();
    await unblockUserQuery(userId, targetId);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("unblockUser", error);
  }
}

export async function getMyBlocks() {
  try {
    const userId = await requirePgUserId();
    const blocks = await getBlockList(userId);
    return { success: true as const, blocks };
  } catch (error: unknown) {
    return actionError("getMyBlocks", error);
  }
}
```

- [ ] **Step 6: Typecheck, then commit**

Run: `yarn typecheck && yarn vitest run src/server/db/postgres/social/blocks.test.ts`
Expected: exit 0, 4 tests pass.

```bash
git add src/server/db/postgres/social/blocks.ts src/server/db/postgres/social/blocks.test.ts src/server/actions/social.ts
git commit -m "feat(social): blocks/mutes with enforced query-helper pattern

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Follows + notifications

**Files:**
- Create: `src/server/db/postgres/social/notifications.ts`
- Create: `src/server/db/postgres/social/follows.ts`
- Modify: `src/server/actions/social.ts` (append follow actions)
- Create: `src/server/actions/notifications.ts`

- [ ] **Step 1: Create `src/server/db/postgres/social/notifications.ts`**:

```typescript
/**
 * Notifications: write-on-event ONLY, bounded by direct recipients —
 * invariant 6: NO fan-out writes ever (no per-follower rows).
 */
import { Prisma, type NotificationType } from "@prisma/client";
import { prisma } from "@/server/db/postgres";

export interface CreateNotificationInput {
  userId: number; // recipient
  type: NotificationType;
  actorId?: number | null;
  payload: Prisma.InputJsonValue;
}

/** Respects blocks: suppressed when recipient hid the actor (BLOCK or MUTE)
 *  or the actor BLOCKed the recipient. */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  if (input.actorId != null && input.actorId !== input.userId) {
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: input.userId, blockedId: input.actorId }, // recipient hid actor (any type)
          { blockerId: input.actorId, blockedId: input.userId, type: "BLOCK" },
        ],
      },
      select: { id: true },
    });
    if (blocked) return;
  }
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      actorId: input.actorId ?? null,
      payload: input.payload,
    },
  });
}

export async function listNotifications(
  userId: number,
  opts: { unreadOnly?: boolean; cursorId?: number; limit?: number } = {}
) {
  const limit = Math.min(opts.limit ?? 30, 100);
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      ...(opts.unreadOnly ? { readAt: null } : {}),
      ...(opts.cursorId ? { id: { lt: opts.cursorId } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: { actor: { select: { id: true, username: true, name: true, image: true } } },
  });
  const page = rows.slice(0, limit);
  return {
    notifications: page,
    nextCursorId: rows.length > limit && page.length > 0 ? page[page.length - 1].id : null,
  };
}

export async function markNotificationsRead(userId: number, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await prisma.notification.updateMany({
    where: { userId, id: { in: ids }, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function markAllNotificationsRead(userId: number): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function getUnreadCount(userId: number): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
```

- [ ] **Step 2: Create `src/server/db/postgres/social/follows.ts`**:

```typescript
/**
 * Follow graph (activates the existing Follow model). Counts are query-time
 * at current scale (indexes exist); denormalize only if profiles get
 * crawler-hot (spec §4.2 follows).
 */
import { prisma } from "@/server/db/postgres";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";
import { assertNotBlocked, getHiddenUserIds } from "./blocks";
import { createNotification } from "./notifications";

export async function followUser(followerId: number, followingId: number): Promise<void> {
  if (followerId === followingId) throw new Error("Cannot follow yourself");
  await assertNotBlocked(followerId, followingId);
  try {
    await prisma.follow.create({ data: { followerId, followingId } });
  } catch (error: unknown) {
    if (isPrismaError(error) && error.code === "P2002") return; // already following
    throw error;
  }
  await createNotification({
    userId: followingId,
    type: "FOLLOW",
    actorId: followerId,
    payload: { followerId },
  });
}

export async function unfollowUser(followerId: number, followingId: number): Promise<void> {
  await prisma.follow.deleteMany({ where: { followerId, followingId } });
}

export async function getFollowCounts(
  userId: number
): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);
  return { followers, following };
}

export async function isFollowing(followerId: number, followingId: number): Promise<boolean> {
  const row = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
    select: { id: true },
  });
  return row !== null;
}

export interface FollowListUser {
  id: number;
  username: string | null;
  name: string | null;
  image: string | null;
  followedAt: Date;
}

export async function listFollowers(
  userId: number,
  viewerId: number | null,
  opts: { cursorId?: number; limit?: number } = {}
): Promise<{ users: FollowListUser[]; nextCursorId: number | null }> {
  return listFollowEdge(userId, viewerId, "followers", opts);
}

export async function listFollowing(
  userId: number,
  viewerId: number | null,
  opts: { cursorId?: number; limit?: number } = {}
): Promise<{ users: FollowListUser[]; nextCursorId: number | null }> {
  return listFollowEdge(userId, viewerId, "following", opts);
}

async function listFollowEdge(
  userId: number,
  viewerId: number | null,
  direction: "followers" | "following",
  opts: { cursorId?: number; limit?: number }
): Promise<{ users: FollowListUser[]; nextCursorId: number | null }> {
  const limit = Math.min(opts.limit ?? 30, 100);
  const hidden = viewerId !== null ? await getHiddenUserIds(viewerId) : new Set<number>();
  const userSelect = { select: { id: true, username: true, name: true, image: true } };
  const rows = await prisma.follow.findMany({
    where: {
      ...(direction === "followers" ? { followingId: userId } : { followerId: userId }),
      ...(opts.cursorId ? { id: { lt: opts.cursorId } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: { follower: userSelect, following: userSelect },
  });
  const page = rows.slice(0, limit);
  const users = page
    .map((r) => ({
      ...(direction === "followers" ? r.follower : r.following),
      followedAt: r.createdAt,
    }))
    .filter((u) => !hidden.has(u.id));
  return {
    users,
    nextCursorId: rows.length > limit && page.length > 0 ? page[page.length - 1].id : null,
  };
}
```

- [ ] **Step 3: Append follow actions to `src/server/actions/social.ts`**:

```typescript
import {
  followUser as followUserQuery,
  unfollowUser as unfollowUserQuery,
  getFollowCounts,
  isFollowing,
  listFollowers,
  listFollowing,
} from "@/server/db/postgres/social/follows";

const FollowSchema = z.object({ userId: z.number().int().positive() });

export async function follow(input: z.infer<typeof FollowSchema>) {
  try {
    const { userId: targetId } = FollowSchema.parse(input);
    const userId = await requirePgUserId();
    await followUserQuery(userId, targetId);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("follow", error);
  }
}

export async function unfollow(input: z.infer<typeof FollowSchema>) {
  try {
    const { userId: targetId } = FollowSchema.parse(input);
    const userId = await requirePgUserId();
    await unfollowUserQuery(userId, targetId);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("unfollow", error);
  }
}

const FollowStateSchema = z.object({ userId: z.number().int().positive() });

export async function getFollowState(input: z.infer<typeof FollowStateSchema>) {
  try {
    const { userId: targetId } = FollowStateSchema.parse(input);
    const userId = await requirePgUserId();
    const [counts, following] = await Promise.all([
      getFollowCounts(targetId),
      isFollowing(userId, targetId),
    ]);
    return { success: true as const, counts, isFollowing: following };
  } catch (error: unknown) {
    return actionError("getFollowState", error);
  }
}

const FollowListSchema = z.object({
  userId: z.number().int().positive(),
  direction: z.enum(["followers", "following"]),
  cursorId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function getFollowList(input: z.infer<typeof FollowListSchema>) {
  try {
    const { userId: targetId, direction, cursorId, limit } = FollowListSchema.parse(input);
    const viewerId = await requirePgUserId();
    const fn = direction === "followers" ? listFollowers : listFollowing;
    const page = await fn(targetId, viewerId, { cursorId, limit });
    return { success: true as const, ...page };
  } catch (error: unknown) {
    return actionError("getFollowList", error);
  }
}
```

- [ ] **Step 4: Create `src/server/actions/notifications.ts`**:

```typescript
"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import {
  listNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  getUnreadCount,
} from "@/server/db/postgres/social/notifications";

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

const ListSchema = z.object({
  unreadOnly: z.boolean().optional(),
  cursorId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function getNotifications(input: z.infer<typeof ListSchema> = {}) {
  try {
    const validated = ListSchema.parse(input);
    const userId = await requirePgUserId();
    const [page, unread] = await Promise.all([
      listNotifications(userId, validated),
      getUnreadCount(userId),
    ]);
    return { success: true as const, ...page, unreadCount: unread };
  } catch (error: unknown) {
    return actionError("getNotifications", error);
  }
}

const MarkReadSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) });

export async function markRead(input: z.infer<typeof MarkReadSchema>) {
  try {
    const { ids } = MarkReadSchema.parse(input);
    const userId = await requirePgUserId();
    const count = await markNotificationsRead(userId, ids);
    return { success: true as const, count };
  } catch (error: unknown) {
    return actionError("markRead", error);
  }
}

export async function markAllRead() {
  try {
    const userId = await requirePgUserId();
    const count = await markAllNotificationsRead(userId);
    return { success: true as const, count };
  } catch (error: unknown) {
    return actionError("markAllRead", error);
  }
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `yarn typecheck && yarn lint`
Expected: exit 0.

```bash
git add src/server/db/postgres/social/follows.ts src/server/db/postgres/social/notifications.ts src/server/actions/social.ts src/server/actions/notifications.ts
git commit -m "feat(social): follows (block-aware, FOLLOW notification) + write-on-event notifications

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: AI moderation gate skeleton (TDD on policy)

**Files:**
- Create: `src/server/services/moderation/gate-policy.ts`
- Test: `src/server/services/moderation/gate-policy.test.ts`
- Create: `src/server/services/moderation/gate.ts`

Fable rule (spec, hard): the gate classifies CONTENT — it never characterizes users. Fail-open = PENDING_REVIEW; never silent-publish on error.

- [ ] **Step 1: Write the failing tests** (`src/server/services/moderation/gate-policy.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { decideStatus, parseGateOutput } from "./gate-policy";

describe("decideStatus", () => {
  it("publishes clean content", () => {
    expect(decideStatus(0)).toBe("PUBLISHED");
    expect(decideStatus(0.49)).toBe("PUBLISHED");
  });

  it("queues borderline content for review", () => {
    expect(decideStatus(0.5)).toBe("PENDING_REVIEW");
    expect(decideStatus(0.84)).toBe("PENDING_REVIEW");
  });

  it("flags toxic content", () => {
    expect(decideStatus(0.85)).toBe("FLAGGED");
    expect(decideStatus(1)).toBe("FLAGGED");
  });

  it("FAIL-OPEN: missing/invalid toxicity NEVER silently publishes", () => {
    expect(decideStatus(null)).toBe("PENDING_REVIEW");
    expect(decideStatus(undefined)).toBe("PENDING_REVIEW");
    expect(decideStatus(Number.NaN)).toBe("PENDING_REVIEW");
  });
});

describe("parseGateOutput", () => {
  it("parses minified JSON", () => {
    const out = parseGateOutput('{"toxicity":0.1,"labels":[],"spoiler":{"scope":"NONE"}}');
    expect(out?.toxicity).toBe(0.1);
    expect(out?.spoiler?.scope).toBe("NONE");
  });

  it("extracts JSON wrapped in model chatter", () => {
    const out = parseGateOutput('Sure! {"toxicity":0.2,"labels":["mild-language"]} Hope that helps.');
    expect(out?.toxicity).toBe(0.2);
    expect(out?.labels).toEqual(["mild-language"]);
  });

  it("returns null on garbage / schema violations", () => {
    expect(parseGateOutput("not json")).toBeNull();
    expect(parseGateOutput('{"toxicity":"high"}')).toBeNull();
    expect(parseGateOutput('{"toxicity":7}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run src/server/services/moderation/gate-policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/services/moderation/gate-policy.ts`**:

```typescript
/**
 * PURE moderation-gate policy: thresholds + LLM output parsing. No network.
 *
 * Fable rule (hard, from the social roadmap spec): AI classifies CONTENT —
 * toxicity + spoiler scope. It never characterizes users.
 */
import { z } from "zod";
import type { CommentStatus } from "@prisma/client";

export const GateOutputSchema = z.object({
  toxicity: z.number().min(0).max(1),
  labels: z.array(z.string()).default([]),
  spoiler: z
    .object({
      scope: z.enum(["NONE", "WATCHED", "EPISODE", "ENDING"]),
      season: z.number().int().nullable().optional(),
      episode: z.number().int().nullable().optional(),
    })
    .optional(),
});

export type GateOutput = z.infer<typeof GateOutputSchema>;

export type GateStatus = Extract<CommentStatus, "PUBLISHED" | "PENDING_REVIEW" | "FLAGGED">;

export const TOXICITY_FLAG_THRESHOLD = 0.85;
export const TOXICITY_REVIEW_THRESHOLD = 0.5;

/**
 * FAIL-OPEN to PENDING_REVIEW: a null/undefined/NaN toxicity (model error,
 * parse failure, timeout) must NEVER silently publish.
 */
export function decideStatus(toxicity: number | null | undefined): GateStatus {
  if (toxicity === null || toxicity === undefined || Number.isNaN(toxicity)) {
    return "PENDING_REVIEW";
  }
  if (toxicity >= TOXICITY_FLAG_THRESHOLD) return "FLAGGED";
  if (toxicity >= TOXICITY_REVIEW_THRESHOLD) return "PENDING_REVIEW";
  return "PUBLISHED";
}

/** Tolerates model chatter around the JSON; null on any schema violation. */
export function parseGateOutput(raw: string): GateOutput | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return GateOutputSchema.parse(JSON.parse(raw.slice(start, end + 1)));
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run src/server/services/moderation/gate-policy.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Implement `src/server/services/moderation/gate.ts`** (the network half — reviews are the first consumer; phase-1 comments reuse it unchanged):

```typescript
/**
 * AI moderation gate: async gate(text) -> { status, aiLabels } via the
 * existing Bedrock Flex helper (same model/pricing path as progressive
 * enrichment). Reviews are the first consumer (phase 0); comments scale it
 * in phase 1.
 *
 * Failure mode: PENDING_REVIEW (fail-open). NEVER silent-publish.
 */
import { callBedrockFlex } from "@/server/services/enrichment/bedrock-flex";
import { dataLogger } from "@/lib/logger";
import {
  decideStatus,
  parseGateOutput,
  type GateOutput,
  type GateStatus,
} from "./gate-policy";

export interface GateContext {
  title?: string;
  mediaType?: "movie" | "series";
}

export interface GateResult {
  status: GateStatus;
  /** Raw classification retained for audit (stored in aiLabels Json). */
  aiLabels: GateOutput | null;
}

const SYSTEM_PROMPT = `You are a content-moderation classifier for a movie/TV discussion site.
Classify the user text. Respond with ONLY minified JSON, no commentary:
{"toxicity":<number 0..1>,"labels":[<short reason tags>],"spoiler":{"scope":"NONE"|"WATCHED"|"EPISODE"|"ENDING","season":<int or null>,"episode":<int or null>}}
toxicity measures hate speech, harassment, threats, sexual content involving minors, or doxxing. Profanity alone or negative opinions about the work are NOT toxic.
spoiler.scope: NONE = safe for someone who has not watched; WATCHED = reveals plot; EPISODE = reveals events up to a specific episode (set season/episode); ENDING = reveals how it ends.
Classify the CONTENT only. Never characterize the author.`;

const MAX_INPUT_CHARS = 6000;

export async function gateText(text: string, context: GateContext = {}): Promise<GateResult> {
  try {
    const result = await callBedrockFlex({
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          text: `Title: ${context.title ?? "unknown"} (${context.mediaType ?? "unknown"})\n---\n${text.slice(0, MAX_INPUT_CHARS)}`,
        },
      ],
      maxTokens: 200,
      temperature: 0,
      useFlex: true,
    });
    const parsed = parseGateOutput(result.output);
    if (parsed === null) {
      dataLogger.warn({ service: "moderation-gate", event: "gate.parse-failed" });
    }
    return { status: decideStatus(parsed?.toxicity), aiLabels: parsed };
  } catch (error: unknown) {
    dataLogger.error({
      service: "moderation-gate",
      event: "gate.error",
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "PENDING_REVIEW", aiLabels: null };
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/server/services/moderation/
git commit -m "feat(moderation): AI gate skeleton (toxicity + spoiler-scope, fail-open to PENDING_REVIEW)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Reviews — query layer + actions (first AI-gate consumer)

**Files:**
- Create: `src/server/db/postgres/social/reviews.ts`
- Create: `src/server/actions/reviews.ts`

- [ ] **Step 1: Create `src/server/db/postgres/social/reviews.ts`**:

```typescript
/**
 * User reviews: distinct entity, NOT a comment variant. One per user per
 * movie (Prisma unique) / per (user, series, season) with NULLS NOT DISTINCT
 * (raw index uq_user_reviews_user_series_season — Prisma can't upsert on it,
 * so the series path is find-then-write with a P2002 retry).
 */
import { Prisma, type CommentStatus } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";
import { getHiddenUserIds } from "./blocks";

export interface UpsertReviewData {
  movieId?: number;
  seriesId?: number;
  seasonNumber?: number | null;
  body: string;
  containsSpoilers: boolean;
  isPrivate: boolean;
  watchEventId?: number | null;
  status: CommentStatus;
  aiLabels?: Prisma.InputJsonValue | null;
}

export async function upsertUserReview(
  userId: number,
  data: UpsertReviewData
): Promise<{ id: number }> {
  const common = {
    body: data.body,
    containsSpoilers: data.containsSpoilers,
    isPrivate: data.isPrivate,
    watchEventId: data.watchEventId ?? null,
    status: data.status,
    aiLabels: data.aiLabels ?? Prisma.JsonNull,
  };

  if (data.movieId !== undefined) {
    const review = await prisma.userReview.upsert({
      where: { userId_movieId: { userId, movieId: data.movieId } },
      create: { userId, movieId: data.movieId, ...common },
      update: { ...common, editedAt: new Date() },
      select: { id: true },
    });
    return review;
  }

  if (data.seriesId === undefined) throw new Error("movieId or seriesId required");
  const seriesWhere = {
    userId,
    seriesId: data.seriesId,
    seasonNumber: data.seasonNumber ?? null,
  };
  const existing = await prisma.userReview.findFirst({
    where: seriesWhere,
    select: { id: true },
  });
  if (existing) {
    await prisma.userReview.update({
      where: { id: existing.id },
      data: { ...common, editedAt: new Date() },
    });
    return existing;
  }
  try {
    return await prisma.userReview.create({
      data: { ...seriesWhere, ...common },
      select: { id: true },
    });
  } catch (error: unknown) {
    // Raced the NULLS NOT DISTINCT unique: fall back to update.
    if (isPrismaError(error) && error.code === "P2002") {
      const raced = await prisma.userReview.findFirst({ where: seriesWhere, select: { id: true } });
      if (raced) {
        await prisma.userReview.update({
          where: { id: raced.id },
          data: { ...common, editedAt: new Date() },
        });
        return raced;
      }
    }
    throw error;
  }
}

export async function deleteUserReview(userId: number, reviewId: number): Promise<boolean> {
  const result = await prisma.userReview.deleteMany({ where: { id: reviewId, userId } });
  return result.count > 0;
}

export async function getOwnReview(
  userId: number,
  target: { movieId?: number; seriesId?: number; seasonNumber?: number | null }
) {
  return prisma.userReview.findFirst({
    where:
      target.movieId !== undefined
        ? { userId, movieId: target.movieId }
        : { userId, seriesId: target.seriesId, seasonNumber: target.seasonNumber ?? null },
  });
}

export interface PublicReviewsOptions {
  movieId?: number;
  seriesId?: number;
  seasonNumber?: number | null;
  viewerId?: number | null;
  cursorId?: number;
  limit?: number;
}

/**
 * Public read path: PUBLISHED + not private, block-filtered via the enforced
 * helper. (Mirror of the publicComments pattern comments get in phase 1.)
 */
export async function getPublicReviews(opts: PublicReviewsOptions) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const hidden =
    opts.viewerId != null ? await getHiddenUserIds(opts.viewerId) : new Set<number>();
  const rows = await prisma.userReview.findMany({
    where: {
      status: "PUBLISHED",
      isPrivate: false,
      ...(opts.movieId !== undefined
        ? { movieId: opts.movieId }
        : { seriesId: opts.seriesId, seasonNumber: opts.seasonNumber ?? null }),
      ...(hidden.size > 0 ? { userId: { notIn: [...hidden] } } : {}),
      ...(opts.cursorId ? { id: { lt: opts.cursorId } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: { user: { select: { id: true, username: true, name: true, image: true } } },
  });
  const page = rows.slice(0, limit);
  return {
    reviews: page,
    nextCursorId: rows.length > limit && page.length > 0 ? page[page.length - 1].id : null,
  };
}

export async function getUserReviews(
  userId: number,
  opts: { includePrivate: boolean; cursorId?: number; limit?: number }
) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const rows = await prisma.userReview.findMany({
    where: {
      userId,
      ...(opts.includePrivate ? {} : { isPrivate: false, status: "PUBLISHED" }),
      ...(opts.cursorId ? { id: { lt: opts.cursorId } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: {
      movie: { select: { id: true, title: true, posterPath: true } },
      series: { select: { id: true, name: true, posterPath: true } },
    },
  });
  const page = rows.slice(0, limit);
  return {
    reviews: page,
    nextCursorId: rows.length > limit && page.length > 0 ? page[page.length - 1].id : null,
  };
}

/** Used by the import runner's lazy gate pass. */
export async function setReviewGateResult(
  reviewId: number,
  status: CommentStatus,
  aiLabels: Prisma.InputJsonValue | null
): Promise<void> {
  await prisma.userReview.update({
    where: { id: reviewId },
    data: { status, aiLabels: aiLabels ?? Prisma.JsonNull },
  });
}
```

- [ ] **Step 2: Create `src/server/actions/reviews.ts`**:

```typescript
"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { prisma } from "@/server/db/postgres";
import { gateText } from "@/server/services/moderation/gate";
import type { GateOutput, GateStatus } from "@/server/services/moderation/gate-policy";
import {
  upsertUserReview,
  deleteUserReview,
  getOwnReview,
  getPublicReviews,
} from "@/server/db/postgres/social/reviews";

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

const UpsertReviewSchema = z
  .object({
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    seasonNumber: z.number().int().min(0).nullable().optional(),
    body: z.string().trim().min(1).max(20000),
    containsSpoilers: z.boolean().default(false),
    isPrivate: z.boolean().default(false),
    watchEventId: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => (v.movieId === undefined) !== (v.seriesId === undefined), {
    message: "Exactly one of movieId/seriesId is required",
  })
  .refine((v) => v.seasonNumber == null || v.seriesId !== undefined, {
    message: "seasonNumber requires seriesId",
  });

/**
 * FIRST AI-gate consumer. Public reviews pass through gateText() before they
 * can be PUBLISHED; gate errors land in PENDING_REVIEW (fail-open — never
 * silent-publish). Private reviews skip the gate (only the owner sees them).
 */
export async function upsertReview(input: z.infer<typeof UpsertReviewSchema>) {
  try {
    const validated = UpsertReviewSchema.parse(input);
    const userId = await requirePgUserId();

    let status: GateStatus = "PUBLISHED";
    let aiLabels: GateOutput | null = null;
    if (!validated.isPrivate) {
      const title =
        validated.movieId !== undefined
          ? (
              await prisma.movie.findUnique({
                where: { id: validated.movieId },
                select: { title: true },
              })
            )?.title
          : (
              await prisma.series.findUnique({
                where: { id: validated.seriesId },
                select: { name: true },
              })
            )?.name;
      const gate = await gateText(validated.body, {
        title: title ?? undefined,
        mediaType: validated.movieId !== undefined ? "movie" : "series",
      });
      status = gate.status;
      aiLabels = gate.aiLabels;
    }

    const { id } = await upsertUserReview(userId, { ...validated, status, aiLabels });
    return { success: true as const, reviewId: id, status };
  } catch (error: unknown) {
    return actionError("upsertReview", error);
  }
}

const DeleteReviewSchema = z.object({ reviewId: z.number().int().positive() });

export async function deleteReview(input: z.infer<typeof DeleteReviewSchema>) {
  try {
    const { reviewId } = DeleteReviewSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await deleteUserReview(userId, reviewId);
    return ok ? { success: true as const } : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("deleteReview", error);
  }
}

const TitleReviewsSchema = z
  .object({
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    seasonNumber: z.number().int().min(0).nullable().optional(),
    cursorId: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .refine((v) => (v.movieId === undefined) !== (v.seriesId === undefined), {
    message: "Exactly one of movieId/seriesId is required",
  });

export async function getTitleReviews(input: z.infer<typeof TitleReviewsSchema>) {
  try {
    const validated = TitleReviewsSchema.parse(input);
    const userId = await requirePgUserId().catch(() => null); // public read: viewer optional
    const [page, own] = await Promise.all([
      getPublicReviews({ ...validated, viewerId: userId }),
      userId !== null ? getOwnReview(userId, validated) : Promise.resolve(null),
    ]);
    return { success: true as const, ...page, ownReview: own };
  } catch (error: unknown) {
    return actionError("getTitleReviews", error);
  }
}
```

- [ ] **Step 3: Typecheck + lint, then commit**

Run: `yarn typecheck && yarn lint`
Expected: exit 0.

```bash
git add src/server/db/postgres/social/reviews.ts src/server/actions/reviews.ts
git commit -m "feat(reviews): review CRUD as first AI-gate consumer (PENDING_REVIEW until gate passes)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Lists + Four Favorites

**Files:**
- Create: `src/server/db/postgres/social/lists.ts`
- Create: `src/server/actions/lists.ts`

- [ ] **Step 1: Create `src/server/db/postgres/social/lists.ts`**:

```typescript
/**
 * Lists + list items. Four Favorites = List(kind: FOUR_FAVORITES) — one per
 * user (raw partial unique), max 4 items APP-ENFORCED here.
 * Positions are gapped integers (n*1024): drag = 1 UPDATE; renumber when a
 * gap is exhausted.
 */
import { Prisma, type ListKind } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";

export const POSITION_GAP = 1024;
const FOUR_FAVORITES_MAX = 4;

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "list";
}

export interface CreateListInput {
  name: string;
  description?: string | null;
  isPublic?: boolean;
  isRanked?: boolean;
  kind?: ListKind;
}

export async function createList(ownerId: number, input: CreateListInput) {
  const base = slugify(input.name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      return await prisma.list.create({
        data: {
          ownerId,
          name: input.name,
          slug,
          description: input.description ?? null,
          isPublic: input.isPublic ?? false,
          isRanked: input.isRanked ?? false,
          kind: input.kind ?? "REGULAR",
        },
      });
    } catch (error: unknown) {
      if (isPrismaError(error) && error.code === "P2002") continue; // slug collision
      throw error;
    }
  }
  throw new Error("Could not generate a unique list slug");
}

export interface UpdateListInput {
  name?: string;
  description?: string | null;
  isPublic?: boolean;
  isRanked?: boolean;
  isPinned?: boolean;
}

export async function updateList(ownerId: number, listId: number, patch: UpdateListInput) {
  const result = await prisma.list.updateMany({
    where: { id: listId, ownerId },
    data: patch,
  });
  return result.count > 0;
}

export async function deleteList(ownerId: number, listId: number): Promise<boolean> {
  const result = await prisma.list.deleteMany({ where: { id: listId, ownerId } });
  return result.count > 0;
}

export interface ListItemRef {
  movieId?: number;
  seriesId?: number;
  personId?: number;
}

async function requireOwnedList(ownerId: number, listId: number) {
  const list = await prisma.list.findFirst({
    where: { id: listId, ownerId },
    select: { id: true, kind: true, itemCount: true },
  });
  if (!list) throw new Error("List not found");
  return list;
}

export async function addListItem(
  ownerId: number,
  listId: number,
  ref: ListItemRef,
  note?: string | null
) {
  const list = await requireOwnedList(ownerId, listId);
  if (list.kind === "FOUR_FAVORITES" && list.itemCount >= FOUR_FAVORITES_MAX) {
    throw new Error(`Four Favorites holds at most ${FOUR_FAVORITES_MAX} items`);
  }
  return prisma.$transaction(async (tx) => {
    const last = await tx.listItem.findFirst({
      where: { listId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    try {
      const item = await tx.listItem.create({
        data: {
          listId,
          movieId: ref.movieId ?? null,
          seriesId: ref.seriesId ?? null,
          personId: ref.personId ?? null,
          position: (last?.position ?? 0) + POSITION_GAP,
          note: note ?? null,
          addedById: ownerId,
        },
      });
      await tx.list.update({ where: { id: listId }, data: { itemCount: { increment: 1 } } });
      return item;
    } catch (error: unknown) {
      if (isPrismaError(error) && error.code === "P2002") {
        throw new Error("Item already on this list");
      }
      throw error;
    }
  });
}

export async function removeListItem(
  ownerId: number,
  listId: number,
  itemId: number
): Promise<boolean> {
  await requireOwnedList(ownerId, listId);
  return prisma.$transaction(async (tx) => {
    const result = await tx.listItem.deleteMany({ where: { id: itemId, listId } });
    if (result.count > 0) {
      await tx.list.update({ where: { id: listId }, data: { itemCount: { decrement: 1 } } });
    }
    return result.count > 0;
  });
}

/**
 * Move an item before the item with id `beforeItemId` (null = move to end).
 * Midpoint placement; full renumber (i+1)*1024 when the gap is exhausted.
 */
export async function moveListItem(
  ownerId: number,
  listId: number,
  itemId: number,
  beforeItemId: number | null
): Promise<void> {
  await requireOwnedList(ownerId, listId);
  await prisma.$transaction(async (tx) => {
    const items = await tx.listItem.findMany({
      where: { listId },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });
    const moving = items.find((i) => i.id === itemId);
    if (!moving) throw new Error("Item not found");

    const others = items.filter((i) => i.id !== itemId);
    const beforeIndex =
      beforeItemId === null ? others.length : others.findIndex((i) => i.id === beforeItemId);
    if (beforeIndex === -1) throw new Error("Target item not found");

    const prev = beforeIndex > 0 ? others[beforeIndex - 1].position : 0;
    const next =
      beforeIndex < others.length
        ? others[beforeIndex].position
        : (others[others.length - 1]?.position ?? 0) + POSITION_GAP * 2;

    if (next - prev > 1) {
      await tx.listItem.update({
        where: { id: itemId },
        data: { position: Math.floor((prev + next) / 2) },
      });
      return;
    }
    // Gap exhausted: renumber the whole list, then place.
    const ordered = [...others];
    ordered.splice(beforeIndex, 0, moving);
    for (let i = 0; i < ordered.length; i++) {
      await tx.listItem.update({
        where: { id: ordered[i].id },
        data: { position: (i + 1) * POSITION_GAP },
      });
    }
  });
}

export async function getOwnLists(ownerId: number) {
  return prisma.list.findMany({
    where: { ownerId },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  });
}

export async function getListWithItems(listId: number) {
  return prisma.list.findUnique({
    where: { id: listId },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          movie: { select: { id: true, title: true, posterPath: true } },
          series: { select: { id: true, name: true, posterPath: true } },
          person: { select: { id: true, name: true, profilePath: true } },
        },
      },
    },
  });
}

/**
 * Four Favorites: replace-all semantics, max 4, transactional. Find-or-create
 * the single FOUR_FAVORITES list (raw partial unique backs this up).
 */
export async function setFourFavorites(ownerId: number, refs: ListItemRef[]): Promise<void> {
  if (refs.length > FOUR_FAVORITES_MAX) {
    throw new Error(`Four Favorites holds at most ${FOUR_FAVORITES_MAX} items`);
  }
  await prisma.$transaction(async (tx) => {
    let list = await tx.list.findFirst({
      where: { ownerId, kind: "FOUR_FAVORITES" },
      select: { id: true },
    });
    if (!list) {
      list = await tx.list.create({
        data: {
          ownerId,
          kind: "FOUR_FAVORITES",
          name: "Four Favorites",
          slug: "four-favorites",
          isPublic: true,
          isPinned: true,
        },
        select: { id: true },
      });
    }
    await tx.listItem.deleteMany({ where: { listId: list.id } });
    if (refs.length > 0) {
      await tx.listItem.createMany({
        data: refs.map((ref, i) => ({
          listId: list.id,
          movieId: ref.movieId ?? null,
          seriesId: ref.seriesId ?? null,
          personId: ref.personId ?? null,
          position: (i + 1) * POSITION_GAP,
          addedById: ownerId,
        })),
      });
    }
    await tx.list.update({ where: { id: list.id }, data: { itemCount: refs.length } });
  });
}

export async function getFourFavorites(ownerId: number) {
  const list = await prisma.list.findFirst({
    where: { ownerId, kind: "FOUR_FAVORITES" },
    select: { id: true },
  });
  if (!list) return [];
  const items = await prisma.listItem.findMany({
    where: { listId: list.id },
    orderBy: { position: "asc" },
    include: {
      movie: { select: { id: true, title: true, posterPath: true } },
      series: { select: { id: true, name: true, posterPath: true } },
    },
  });
  return items;
}
```

- [ ] **Step 2: Create `src/server/actions/lists.ts`**:

```typescript
"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import {
  createList as createListQuery,
  updateList as updateListQuery,
  deleteList as deleteListQuery,
  addListItem as addListItemQuery,
  removeListItem as removeListItemQuery,
  moveListItem as moveListItemQuery,
  getOwnLists,
  getListWithItems,
  setFourFavorites as setFourFavoritesQuery,
  getFourFavorites,
} from "@/server/db/postgres/social/lists";

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

const ItemRefSchema = z
  .object({
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    personId: z.number().int().positive().optional(),
  })
  .refine(
    (v) =>
      [v.movieId, v.seriesId, v.personId].filter((x) => x !== undefined).length === 1,
    { message: "Exactly one of movieId/seriesId/personId is required" }
  );

const CreateListSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  isPublic: z.boolean().optional(),
  isRanked: z.boolean().optional(),
});

export async function createList(input: z.infer<typeof CreateListSchema>) {
  try {
    const validated = CreateListSchema.parse(input);
    const userId = await requirePgUserId();
    const list = await createListQuery(userId, validated);
    return { success: true as const, list };
  } catch (error: unknown) {
    return actionError("createList", error);
  }
}

const UpdateListSchema = z.object({
  listId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  isPublic: z.boolean().optional(),
  isRanked: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});

export async function updateList(input: z.infer<typeof UpdateListSchema>) {
  try {
    const { listId, ...patch } = UpdateListSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await updateListQuery(userId, listId, patch);
    return ok ? { success: true as const } : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("updateList", error);
  }
}

const ListIdSchema = z.object({ listId: z.number().int().positive() });

export async function deleteList(input: z.infer<typeof ListIdSchema>) {
  try {
    const { listId } = ListIdSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await deleteListQuery(userId, listId);
    return ok ? { success: true as const } : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("deleteList", error);
  }
}

const AddItemSchema = z.object({
  listId: z.number().int().positive(),
  item: ItemRefSchema,
  note: z.string().max(1000).nullable().optional(),
});

export async function addListItem(input: z.infer<typeof AddItemSchema>) {
  try {
    const { listId, item, note } = AddItemSchema.parse(input);
    const userId = await requirePgUserId();
    const created = await addListItemQuery(userId, listId, item, note);
    return { success: true as const, itemId: created.id };
  } catch (error: unknown) {
    return actionError("addListItem", error);
  }
}

const RemoveItemSchema = z.object({
  listId: z.number().int().positive(),
  itemId: z.number().int().positive(),
});

export async function removeListItem(input: z.infer<typeof RemoveItemSchema>) {
  try {
    const { listId, itemId } = RemoveItemSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await removeListItemQuery(userId, listId, itemId);
    return ok ? { success: true as const } : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("removeListItem", error);
  }
}

const MoveItemSchema = z.object({
  listId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  beforeItemId: z.number().int().positive().nullable(),
});

export async function moveListItem(input: z.infer<typeof MoveItemSchema>) {
  try {
    const { listId, itemId, beforeItemId } = MoveItemSchema.parse(input);
    const userId = await requirePgUserId();
    await moveListItemQuery(userId, listId, itemId, beforeItemId);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("moveListItem", error);
  }
}

export async function getMyLists() {
  try {
    const userId = await requirePgUserId();
    const lists = await getOwnLists(userId);
    return { success: true as const, lists };
  } catch (error: unknown) {
    return actionError("getMyLists", error);
  }
}

export async function getList(input: z.infer<typeof ListIdSchema>) {
  try {
    const { listId } = ListIdSchema.parse(input);
    const userId = await requirePgUserId();
    const list = await getListWithItems(listId);
    if (!list || (!list.isPublic && list.ownerId !== userId)) {
      return { success: false as const, error: "Not found" };
    }
    return { success: true as const, list };
  } catch (error: unknown) {
    return actionError("getList", error);
  }
}

const FourFavoritesSchema = z.object({ items: z.array(ItemRefSchema).max(4) });

export async function setFourFavorites(input: z.infer<typeof FourFavoritesSchema>) {
  try {
    const { items } = FourFavoritesSchema.parse(input);
    const userId = await requirePgUserId();
    await setFourFavoritesQuery(userId, items);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("setFourFavorites", error);
  }
}

export async function getMyFourFavorites() {
  try {
    const userId = await requirePgUserId();
    const items = await getFourFavorites(userId);
    return { success: true as const, items };
  } catch (error: unknown) {
    return actionError("getMyFourFavorites", error);
  }
}
```

- [ ] **Step 3: Typecheck + lint, then commit**

Run: `yarn typecheck && yarn lint`
Expected: exit 0.

```bash
git add src/server/db/postgres/social/lists.ts src/server/actions/lists.ts
git commit -m "feat(lists): lists + gapped-position items + Four Favorites (max-4 app-enforced)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 16: user_stats — pure compute (TDD) + lazy snapshot

**Files:**
- Create: `src/server/db/postgres/social/stats-compute.ts`
- Test: `src/server/db/postgres/social/stats-compute.test.ts`
- Create: `src/server/db/postgres/social/stats.ts`

- [ ] **Step 1: Write the failing tests** (`src/server/db/postgres/social/stats-compute.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import {
  computeStats,
  effectiveRuntime,
  type StatsEventRow,
  type StatsPersonRow,
} from "./stats-compute";

function movieRow(over: Partial<StatsEventRow> = {}): StatsEventRow {
  return {
    kind: "movie",
    titleId: 603,
    title: "The Matrix",
    runtimeMinutes: 136,
    fallbackRuntimes: [],
    genres: ["Action", "Science Fiction"],
    year: 1999,
    watchedAt: new Date("2026-01-10T12:00:00Z"),
    precision: "DATE",
    isRewatch: false,
    source: "LOGGED",
    ...over,
  };
}

function episodeRow(over: Partial<StatsEventRow> = {}): StatsEventRow {
  return {
    kind: "episode",
    titleId: 1396,
    title: "Breaking Bad",
    runtimeMinutes: null,
    fallbackRuntimes: [47],
    genres: ["Drama"],
    year: 2008,
    watchedAt: new Date("2026-01-11T12:00:00Z"),
    precision: "DATE",
    isRewatch: false,
    source: "LOGGED",
    ...over,
  };
}

describe("effectiveRuntime", () => {
  it("uses the row runtime when present", () => {
    expect(effectiveRuntime(movieRow())).toBe(136);
  });
  it("falls back to avg(series episode_run_time) — the COALESCE rule", () => {
    expect(effectiveRuntime(episodeRow({ runtimeMinutes: null, fallbackRuntimes: [40, 60] }))).toBe(50);
  });
  it("zero when nothing is known", () => {
    expect(effectiveRuntime(episodeRow({ runtimeMinutes: null, fallbackRuntimes: [] }))).toBe(0);
  });
});

describe("computeStats", () => {
  it("aggregates hours, counts, genres, decades, byMonth", () => {
    const stats = computeStats([movieRow(), episodeRow()], []);
    expect(stats.totalWatches).toBe(2);
    expect(stats.moviesWatched).toBe(1);
    expect(stats.episodesWatched).toBe(1);
    expect(stats.hoursWatched).toBeCloseTo((136 + 47) / 60, 2);
    expect(stats.byMonth["2026-01"]).toBe(2);
    expect(stats.topGenres[0]).toEqual({ name: "Action", count: 1 });
    expect(stats.topDecades.map((d) => d.decade)).toContain("1990s");
    expect(stats.topDecades.map((d) => d.decade)).toContain("2000s");
  });

  it("distinct movie count: rewatches do not double-count titles", () => {
    const stats = computeStats([movieRow(), movieRow({ isRewatch: true })], []);
    expect(stats.moviesWatched).toBe(1);
    expect(stats.totalWatches).toBe(2);
  });

  it("streaks: consecutive UTC days with dated events; UNKNOWN precision excluded", () => {
    const rows = [
      movieRow({ watchedAt: new Date("2026-01-10T12:00:00Z") }),
      movieRow({ watchedAt: new Date("2026-01-11T12:00:00Z") }),
      movieRow({ watchedAt: new Date("2026-01-12T12:00:00Z") }),
      movieRow({ watchedAt: new Date("2026-01-20T12:00:00Z") }),
      movieRow({ watchedAt: null, precision: "UNKNOWN" }),
    ];
    expect(computeStats(rows, []).longestStreakDays).toBe(3);
  });

  it("rewatch champions: titles with 2+ watches, sorted by count", () => {
    const rows = [
      movieRow(),
      movieRow({ isRewatch: true }),
      movieRow({ isRewatch: true }),
      movieRow({ titleId: 550, title: "Fight Club" }),
    ];
    const stats = computeStats(rows, []);
    expect(stats.rewatches.count).toBe(2);
    expect(stats.rewatches.champions[0]).toEqual({ title: "The Matrix", count: 3 });
  });

  it("top actors/directors from people rows", () => {
    const people: StatsPersonRow[] = [
      { name: "Keanu Reeves", role: "actor", titleId: 603 },
      { name: "Lana Wachowski", role: "director", titleId: 603 },
    ];
    const stats = computeStats([movieRow()], people);
    expect(stats.topActors[0]).toEqual({ name: "Keanu Reeves", count: 1 });
    expect(stats.topDirectors[0]).toEqual({ name: "Lana Wachowski", count: 1 });
  });

  it("source filter: excludeImported drops BACKFILL/IMPORT rows (honest Wrapped)", () => {
    const rows = [movieRow(), movieRow({ titleId: 550, title: "Fight Club", source: "IMPORT" })];
    const all = computeStats(rows, []);
    const honest = computeStats(rows, [], { excludeImported: true });
    expect(all.totalWatches).toBe(2);
    expect(honest.totalWatches).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run src/server/db/postgres/social/stats-compute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/db/postgres/social/stats-compute.ts`**:

```typescript
/**
 * PURE stats aggregation (no DB). stats.ts feeds it SQL rows; the snapshot
 * JSON is what public profiles / Wrapped render (never live compute there).
 */
import { z } from "zod";
import type { WatchedAtPrecision, WatchEventSource } from "@prisma/client";
import { utcDayKey } from "@/lib/watch-dates";

export interface StatsEventRow {
  kind: "movie" | "episode" | "series";
  titleId: number;
  title: string;
  runtimeMinutes: number | null;
  /** series.episode_run_time — runtime fallback for episodes. */
  fallbackRuntimes: number[];
  genres: string[];
  year: number | null;
  watchedAt: Date | null;
  precision: WatchedAtPrecision;
  isRewatch: boolean;
  source: WatchEventSource;
}

export interface StatsPersonRow {
  name: string;
  role: "actor" | "director";
  titleId: number;
}

const NameCount = z.object({ name: z.string(), count: z.number() });

export const StatsSnapshotSchema = z.object({
  totalWatches: z.number(),
  moviesWatched: z.number(),
  episodesWatched: z.number(),
  seriesTouched: z.number(),
  hoursWatched: z.number(),
  byMonth: z.record(z.string(), z.number()),
  topGenres: z.array(NameCount),
  topDecades: z.array(z.object({ decade: z.string(), count: z.number() })),
  topActors: z.array(NameCount),
  topDirectors: z.array(NameCount),
  longestStreakDays: z.number(),
  rewatches: z.object({
    count: z.number(),
    champions: z.array(z.object({ title: z.string(), count: z.number() })),
  }),
  computedAt: z.string(),
});

export type StatsSnapshot = z.infer<typeof StatsSnapshotSchema>;

/** COALESCE(episode.runtime, avg(series.episode_run_time)) — spec §4.2 user_stats. */
export function effectiveRuntime(row: StatsEventRow): number {
  if (row.runtimeMinutes !== null) return row.runtimeMinutes;
  if (row.fallbackRuntimes.length > 0) {
    return Math.round(
      row.fallbackRuntimes.reduce((a, b) => a + b, 0) / row.fallbackRuntimes.length
    );
  }
  return 0;
}

function topN(counts: Map<string, number>, n: number): Array<{ name: string; count: number }> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function bump(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

const DAY_MS = 86_400_000;

function longestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const day of sorted) {
    const t = Date.parse(`${day}T00:00:00Z`);
    run = prev !== null && t - prev === DAY_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  return longest;
}

export interface ComputeStatsOptions {
  /** Honest Wrapped: drop BACKFILL/IMPORT noise (spec: source column exists for this). */
  excludeImported?: boolean;
}

export function computeStats(
  allRows: StatsEventRow[],
  people: StatsPersonRow[],
  opts: ComputeStatsOptions = {}
): StatsSnapshot {
  const rows = opts.excludeImported
    ? allRows.filter((r) => r.source === "LOGGED")
    : allRows;

  const movieIds = new Set<number>();
  const seriesIds = new Set<number>();
  const genreCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const titleWatchCounts = new Map<number, { title: string; count: number }>();
  const datedDays = new Set<string>();
  let minutes = 0;
  let episodes = 0;
  let rewatchCount = 0;

  for (const row of rows) {
    minutes += effectiveRuntime(row);
    if (row.kind === "movie") movieIds.add(row.titleId);
    else seriesIds.add(row.titleId);
    if (row.kind === "episode") episodes += 1;
    if (row.isRewatch) rewatchCount += 1;
    for (const g of row.genres) bump(genreCounts, g);
    if (row.year !== null) bump(decadeCounts, `${Math.floor(row.year / 10) * 10}s`);
    if (row.watchedAt !== null && row.precision !== "UNKNOWN") {
      const day = utcDayKey(row.watchedAt);
      datedDays.add(day);
      bump(byMonth, day.slice(0, 7));
    }
    const entry = titleWatchCounts.get(row.titleId);
    if (entry) entry.count += 1;
    else titleWatchCounts.set(row.titleId, { title: row.title, count: 1 });
  }

  const watchedTitleIds = new Set([...movieIds, ...seriesIds]);
  const actorCounts = new Map<string, number>();
  const directorCounts = new Map<string, number>();
  for (const p of people) {
    if (!watchedTitleIds.has(p.titleId)) continue;
    bump(p.role === "actor" ? actorCounts : directorCounts, p.name);
  }

  const champions = [...titleWatchCounts.values()]
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 5)
    .map((t) => ({ title: t.title, count: t.count }));

  return {
    totalWatches: rows.length,
    moviesWatched: movieIds.size,
    episodesWatched: episodes,
    seriesTouched: seriesIds.size,
    hoursWatched: Math.round((minutes / 60) * 100) / 100,
    byMonth: Object.fromEntries(byMonth),
    topGenres: topN(genreCounts, 10),
    topDecades: [...decadeCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([decade, count]) => ({ decade, count })),
    topActors: topN(actorCounts, 10),
    topDirectors: topN(directorCounts, 10),
    longestStreakDays: longestStreak(datedDays),
    rewatches: { count: rewatchCount, champions },
    computedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run src/server/db/postgres/social/stats-compute.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Implement `src/server/db/postgres/social/stats.ts`** (SQL fetch + lazy snapshot):

```typescript
/**
 * user_stats lazy snapshot: recompute on read when dirty or >24h old.
 * Logged-in /stats may compute live; PUBLIC profiles and Wrapped render from
 * the snapshot ONLY (crawlers hammer them).
 */
import { Prisma, type WatchedAtPrecision, type WatchEventSource } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import {
  computeStats,
  StatsSnapshotSchema,
  type StatsEventRow,
  type StatsPersonRow,
  type StatsSnapshot,
} from "./stats-compute";

const STATS_TTL_MS = 24 * 60 * 60 * 1000;
const TOP_CAST_ORDER = 5; // top-billed cast only

interface MovieEventRaw {
  title_id: number;
  title: string;
  runtime: number | null;
  year: number | null;
  watched_at: Date | null;
  precision: WatchedAtPrecision;
  is_rewatch: boolean;
  source: WatchEventSource;
  genres: string[];
}

interface SeriesEventRaw extends MovieEventRaw {
  episode_number: number | null;
  fallback_runtimes: number[];
}

async function fetchEventRows(userId: number): Promise<StatsEventRow[]> {
  const movieRows = await prisma.$queryRaw<MovieEventRaw[]>`
    SELECT we.movie_id AS title_id, m.title, m.runtime,
           EXTRACT(YEAR FROM m.release_date)::int AS year,
           we.watched_at, we.watched_at_precision AS precision,
           we.is_rewatch, we.source,
           COALESCE(array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL), '{}') AS genres
    FROM watch_events we
    JOIN movies m ON m.id = we.movie_id
    LEFT JOIN movie_genres mg ON mg.movie_id = m.id
    LEFT JOIN genres g ON g.id = mg.genre_id
    WHERE we.user_id = ${userId} AND we.movie_id IS NOT NULL
    GROUP BY we.id, m.id
  `;

  const seriesRows = await prisma.$queryRaw<SeriesEventRaw[]>`
    SELECT we.series_id AS title_id, s.name AS title,
           e.runtime, we.episode_number,
           EXTRACT(YEAR FROM s.first_air_date)::int AS year,
           we.watched_at, we.watched_at_precision AS precision,
           we.is_rewatch, we.source,
           s.episode_run_time AS fallback_runtimes,
           COALESCE(array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL), '{}') AS genres
    FROM watch_events we
    JOIN series s ON s.id = we.series_id
    LEFT JOIN seasons sn ON sn.series_id = we.series_id AND sn.season_number = we.season_number
    LEFT JOIN episodes e ON e.season_id = sn.id AND e.episode_number = we.episode_number
    LEFT JOIN series_genres sg ON sg.series_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id
    WHERE we.user_id = ${userId} AND we.series_id IS NOT NULL
    GROUP BY we.id, s.id, e.runtime
  `;

  const fromMovie = (r: MovieEventRaw): StatsEventRow => ({
    kind: "movie",
    titleId: r.title_id,
    title: r.title,
    runtimeMinutes: r.runtime,
    fallbackRuntimes: [],
    genres: r.genres,
    year: r.year,
    watchedAt: r.watched_at,
    precision: r.precision,
    isRewatch: r.is_rewatch,
    source: r.source,
  });
  const fromSeries = (r: SeriesEventRaw): StatsEventRow => ({
    kind: r.episode_number !== null ? "episode" : "series",
    titleId: r.title_id,
    title: r.title,
    // series-level events (granularity unknown) get zero runtime — honest hours.
    runtimeMinutes: r.episode_number !== null ? r.runtime : 0,
    fallbackRuntimes: r.episode_number !== null ? r.fallback_runtimes : [],
    genres: r.genres,
    year: r.year,
    watchedAt: r.watched_at,
    precision: r.precision,
    isRewatch: r.is_rewatch,
    source: r.source,
  });

  return [...movieRows.map(fromMovie), ...seriesRows.map(fromSeries)];
}

async function fetchPeopleRows(
  movieIds: number[],
  seriesIds: number[]
): Promise<StatsPersonRow[]> {
  if (movieIds.length === 0 && seriesIds.length === 0) return [];
  const rows = await prisma.$queryRaw<
    Array<{ name: string; role: string; title_id: number }>
  >`
    SELECT p.name,
           CASE WHEN c.credit_type = 'CAST' THEN 'actor' ELSE 'director' END AS role,
           COALESCE(c.movie_id, c.series_id) AS title_id
    FROM credits c
    JOIN persons p ON p.id = c.person_id
    WHERE (
        (c.movie_id = ANY(${movieIds}::int[]))
        OR (c.series_id = ANY(${seriesIds}::int[]) AND c.is_aggregate = false)
      )
      AND (
        (c.credit_type = 'CAST' AND c.credit_order IS NOT NULL AND c.credit_order < ${TOP_CAST_ORDER})
        OR (c.credit_type = 'CREW' AND c.job = 'Director')
      )
  `;
  return rows.map((r) => ({
    name: r.name,
    role: r.role === "actor" ? ("actor" as const) : ("director" as const),
    titleId: r.title_id,
  }));
}

export async function computeUserStats(userId: number): Promise<StatsSnapshot> {
  const events = await fetchEventRows(userId);
  const movieIds = [...new Set(events.filter((e) => e.kind === "movie").map((e) => e.titleId))];
  const seriesIds = [
    ...new Set(events.filter((e) => e.kind !== "movie").map((e) => e.titleId)),
  ];
  const people = await fetchPeopleRows(movieIds, seriesIds);
  return computeStats(events, people);
}

/**
 * Lazy snapshot read: serve stored stats unless dirty or stale (>24h);
 * recompute+store otherwise. This is the ONLY read path public surfaces use.
 */
export async function getUserStatsSnapshot(userId: number): Promise<StatsSnapshot> {
  const row = await prisma.userStats.findUnique({ where: { userId } });
  if (row && !row.dirty && Date.now() - row.computedAt.getTime() < STATS_TTL_MS) {
    const parsed = StatsSnapshotSchema.safeParse(row.stats);
    if (parsed.success) return parsed.data;
  }
  const snapshot = await computeUserStats(userId);
  await prisma.userStats.upsert({
    where: { userId },
    create: {
      userId,
      stats: snapshot as unknown as Prisma.InputJsonValue,
      computedAt: new Date(),
      dirty: false,
    },
    update: {
      stats: snapshot as unknown as Prisma.InputJsonValue,
      computedAt: new Date(),
      dirty: false,
    },
  });
  return snapshot;
}
```

(The `as unknown as Prisma.InputJsonValue` is the one sanctioned cast: the snapshot is Zod-validated JSON; Prisma's Json input type cannot express it structurally.)

- [ ] **Step 6: Typecheck + run all new tests, commit**

Run: `yarn typecheck && yarn vitest run src/server/db/postgres/social/`
Expected: exit 0; progress-derive, blocks, stats-compute suites all pass.

```bash
git add src/server/db/postgres/social/stats-compute.ts src/server/db/postgres/social/stats-compute.test.ts src/server/db/postgres/social/stats.ts
git commit -m "feat(stats): lazy user_stats snapshot (hours/genres/decades/people/streaks/rewatches)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 17: Renumbering reconcile task (fire-and-forget, post-hydration)

**Files:**
- Create: `src/server/services/hydration/reconcile-user-episodes.ts`
- Modify: `src/server/services/hydration/index.ts` (2 call sites)

- [ ] **Step 1: Create `src/server/services/hydration/reconcile-user-episodes.ts`**:

```typescript
/**
 * Post-hydration renumbering reconcile (spec §4.1 invariant 2), in the style
 * of triggerProgressiveEnrichment: fire-and-forget, deduped per series,
 * errors swallowed (logged).
 *
 * For the hydrated series: where a user row's tmdb_episode_id now maps to an
 * episode whose (season_number, episode_number) disagrees, update the
 * natural-key columns and re-run that user's progress recompute once.
 */
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { recomputeSeriesProgress } from "@/server/db/postgres/social/progress";

const inFlight = new Set<number>();

export function triggerUserEpisodeReconcile(seriesId: number): void {
  if (inFlight.has(seriesId)) return;
  inFlight.add(seriesId);
  void reconcile(seriesId)
    .catch((error: unknown) => {
      dataLogger.error({
        service: "episode-reconcile",
        seriesId,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      inFlight.delete(seriesId);
    });
}

async function reconcile(seriesId: number): Promise<void> {
  const drifted = await prisma.$queryRaw<
    Array<{ id: number; user_id: number; season_number: number; episode_number: number }>
  >`
    SELECT we.id, we.user_id, s.season_number, e.episode_number
    FROM watch_events we
    JOIN seasons s ON s.series_id = we.series_id
    JOIN episodes e ON e.season_id = s.id AND e.tmdb_episode_id = we.tmdb_episode_id
    WHERE we.series_id = ${seriesId}
      AND we.tmdb_episode_id IS NOT NULL
      AND (we.season_number IS DISTINCT FROM s.season_number
        OR we.episode_number IS DISTINCT FROM e.episode_number)
  `;
  if (drifted.length === 0) return;

  const userIds = new Set<number>();
  for (const row of drifted) {
    await prisma.watchEvent.update({
      where: { id: row.id },
      data: { seasonNumber: row.season_number, episodeNumber: row.episode_number },
    });
    userIds.add(row.user_id);
  }
  for (const userId of userIds) {
    await prisma.$transaction((tx) => recomputeSeriesProgress(tx, userId, seriesId));
  }
  dataLogger.info({
    service: "episode-reconcile",
    seriesId,
    rows: drifted.length,
    users: userIds.size,
  });
}
```

- [ ] **Step 2: Wire into `src/server/services/hydration/index.ts`** at BOTH series upsert sites:

Add the import next to the `triggerProgressiveEnrichment` import (~line 54):

```typescript
import { triggerUserEpisodeReconcile } from "@/server/services/hydration/reconcile-user-episodes";
```

(a) In `backgroundRefreshSeries` (~line 174), immediately after `await upsertSeriesToPostgres({ ...freshTmdb, seasons }, enriched);` add:

```typescript
      triggerUserEpisodeReconcile(seriesId);
```

(b) In the synchronous series path (~line 513), immediately after `await upsertSeriesToPostgres(tmdbDataWithEpisodes, enriched);` / its `console.log` line, add:

```typescript
    triggerUserEpisodeReconcile(seriesId);
```

- [ ] **Step 3: Verify the hydration contract tests still pass** (the render path must never gain an await)

Run: `yarn vitest run src/server/services/hydration/index.test.ts && yarn typecheck`
Expected: PASS, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/server/services/hydration/reconcile-user-episodes.ts src/server/services/hydration/index.ts
git commit -m "feat(hydration): fire-and-forget user-episode renumbering reconcile post-upsert

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 18: Import foundation — CSV parser (TDD), storage interface, fflate dep

**Files:**
- Modify: `package.json` (via `yarn add fflate`)
- Create: `src/server/services/import/csv.ts`
- Test: `src/server/services/import/csv.test.ts`
- Create: `src/server/services/import/types.ts`
- Create: `src/server/services/import/storage.ts`

- [ ] **Step 1: Add the zip dependency**

Run: `yarn add fflate`
Expected: `fflate` appears in package.json dependencies (zero-dep, ships its own types).

- [ ] **Step 2: Write the failing CSV tests** (`src/server/services/import/csv.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvRecords, toCsv } from "./csv";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields with commas, escaped quotes, and MULTILINE bodies (Letterboxd reviews)", () => {
    const text = 'Name,Review\nHeat,"Line one\nLine ""two"", quoted"\n';
    expect(parseCsv(text)).toEqual([
      ["Name", "Review"],
      ["Heat", 'Line one\nLine "two", quoted'],
    ]);
  });

  it("handles CRLF line endings and a BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a final row without trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvRecords", () => {
  it("maps rows to header-keyed records and skips blank lines", () => {
    const recs = parseCsvRecords("Name,Year\nHeat,1995\n\nSe7en,1995\n");
    expect(recs).toEqual([
      { Name: "Heat", Year: "1995" },
      { Name: "Se7en", Year: "1995" },
    ]);
  });
});

describe("toCsv", () => {
  it("quotes fields containing commas, quotes, or newlines", () => {
    const out = toCsv(["a", "b"], [["x,y", 'he said "hi"\nbye']]);
    expect(out).toBe('a,b\n"x,y","he said ""hi""\nbye"\n');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn vitest run src/server/services/import/csv.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/server/services/import/csv.ts`**:

```typescript
/**
 * Minimal RFC4180 CSV parser/stringifier. In-house because Letterboxd
 * reviews.csv carries quoted MULTILINE bodies — naive split-on-newline breaks
 * silently, and we don't need a streaming dependency for <10MB exports.
 */

export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Header-keyed records; blank lines skipped. */
export function parseCsvRecords(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""))
    .map((r) => {
      const rec: Record<string, string> = {};
      header.forEach((h, idx) => {
        rec[h] = r[idx] ?? "";
      });
      return rec;
    });
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvField).join(","));
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn vitest run src/server/services/import/csv.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Create `src/server/services/import/types.ts`** (the normalized shape ALL three parsers emit — the runner consumes only this):

```typescript
/**
 * Normalized import payload. Parsers (letterboxd/trakt/imdb) emit this;
 * resolve.ts + runner.ts consume it. tmdbEpisodeId-FIRST episode resolution
 * (spec §4.1 invariant 2); natural keys derived from it.
 */
import type { ImportSource } from "@prisma/client";

export interface TitleRef {
  kind: "movie" | "series";
  tmdbId?: number;
  imdbId?: string;
  title?: string;
  year?: number | null;
}

export interface EpisodeRef {
  tmdbEpisodeId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface NormalizedWatch {
  ref: TitleRef;
  episode?: EpisodeRef;
  /** Full ISO datetime (DATETIME), YYYY-MM-DD (DATE), or null (UNKNOWN). */
  watchedAt: string | null;
  precision: "DATETIME" | "DATE" | "UNKNOWN";
  isRewatch: boolean;
  tags: string[];
  note: string | null;
}

export interface NormalizedRating {
  ref: TitleRef;
  score: number | null; // 1-10
  thumb: 1 | -1 | null;
  ratedAt: string | null; // YYYY-MM-DD
}

export interface NormalizedReview {
  ref: TitleRef;
  body: string;
  containsSpoilers: boolean;
  watchedAt: string | null; // links review to the diary entry when possible
}

export interface NormalizedWatchlistItem {
  ref: TitleRef;
  addedAt: string | null;
  note: string | null;
}

export interface NormalizedList {
  name: string;
  description: string | null;
  items: Array<{ ref: TitleRef; position: number }>;
}

export interface UnmappableRow {
  file: string;
  line: number;
  reason: string;
}

export interface NormalizedImport {
  source: ImportSource;
  watches: NormalizedWatch[];
  ratings: NormalizedRating[];
  reviews: NormalizedReview[];
  watchlist: NormalizedWatchlistItem[];
  lists: NormalizedList[];
  /** Counted, never silently dropped (spec §4.2 import_jobs). */
  unmappable: UnmappableRow[];
}

export function emptyImport(source: ImportSource): NormalizedImport {
  return { source, watches: [], ratings: [], reviews: [], watchlist: [], lists: [], unmappable: [] };
}

export interface ImportStats {
  rowsTotal: number;
  imported: number;
  skipped: number;
  errors: string[];
}
```

- [ ] **Step 7: Create `src/server/services/import/storage.ts`**:

```typescript
/**
 * Import file storage. Local disk in dev/phase-0; the interface is the seam
 * for the S3 implementation later. The raw upload is RETAINED as the lossless
 * fallback that makes every "acceptable loss" decision reversible.
 */
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

export interface ImportFileStorage {
  /** Returns the fileRef persisted on the ImportJob row. */
  save(userId: number, filename: string, data: Buffer): Promise<string>;
  load(fileRef: string): Promise<Buffer>;
}

export class LocalImportFileStorage implements ImportFileStorage {
  constructor(
    private readonly baseDir: string = process.env.IMPORT_STORAGE_DIR ?? "data/imports"
  ) {}

  async save(userId: number, filename: string, data: Buffer): Promise<string> {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const ref = `${userId}/${Date.now()}-${safe}`;
    await mkdir(join(this.baseDir, String(userId)), { recursive: true });
    await writeFile(join(this.baseDir, ref), data);
    return ref;
  }

  async load(fileRef: string): Promise<Buffer> {
    if (fileRef.includes("..")) throw new Error("Invalid fileRef");
    return readFile(join(this.baseDir, fileRef));
  }
}

export const importFileStorage: ImportFileStorage = new LocalImportFileStorage();
```

- [ ] **Step 8: Commit**

```bash
git add package.json yarn.lock src/server/services/import/csv.ts src/server/services/import/csv.test.ts src/server/services/import/types.ts src/server/services/import/storage.ts
git commit -m "feat(import): CSV parser (RFC4180, multiline-safe), normalized import types, local file storage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 19: Letterboxd parser (TDD)

**Files:**
- Create: `src/server/services/import/letterboxd.ts`
- Test: `src/server/services/import/letterboxd.test.ts`

Letterboxd export zip layout (the parser takes a `Map<filename, content>` so tests feed strings; the zip is opened by the runner):
`diary.csv` (`Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date`), `watched.csv` (`Date,Name,Year,Letterboxd URI` — DATELESS watch facts), `ratings.csv` (`...,Rating` in 0.5–5 stars), `reviews.csv` (`Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date` — multiline quoted bodies), `likes/films.csv` (→ thumb up, spec: no third like-concept), `watchlist.csv`, `lists/*.csv` (metadata header block, blank line, then `Position,Name,Year,URL,Description`). Letterboxd has no TMDB ids → refs are `{ kind:"movie", title, year }`.

- [ ] **Step 1: Write the failing tests** (`src/server/services/import/letterboxd.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { parseLetterboxdExport } from "./letterboxd";

const DIARY = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2026-01-05,Heat,1995,https://boxd.it/a1,4.5,,crime,2026-01-04
2026-02-01,Heat,1995,https://boxd.it/a2,5,Yes,"crime, rewatch club",2026-01-31
`;

const WATCHED = `Date,Name,Year,Letterboxd URI
2026-01-05,Heat,1995,https://boxd.it/a1
2024-03-02,Se7en,1995,https://boxd.it/b1
`;

const RATINGS = `Date,Name,Year,Letterboxd URI,Rating
2026-01-05,Heat,1995,https://boxd.it/a1,4.5
`;

const REVIEWS = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date
2026-01-05,Heat,1995,https://boxd.it/a1,4.5,,"Pacino vs De Niro.
Still perfect.",crime,2026-01-04
`;

const LIKES = `Date,Name,Year,Letterboxd URI
2026-01-06,Se7en,1995,https://boxd.it/b1
`;

const WATCHLIST = `Date,Name,Year,Letterboxd URI
2026-01-07,Ronin,1998,https://boxd.it/c1
`;

const LIST = `Letterboxd list export v7
Date,Name,Tags,URL,Description
2026-01-08,Crime Essentials,,https://boxd.it/list1,The hard stuff

Position,Name,Year,URL,Description
1,Heat,1995,https://boxd.it/a1,
2,Se7en,1995,https://boxd.it/b1,
`;

function files(extra: Record<string, string> = {}): Map<string, string> {
  return new Map(
    Object.entries({
      "diary.csv": DIARY,
      "watched.csv": WATCHED,
      "ratings.csv": RATINGS,
      "reviews.csv": REVIEWS,
      "likes/films.csv": LIKES,
      "watchlist.csv": WATCHLIST,
      "lists/crime-essentials.csv": LIST,
      ...extra,
    })
  );
}

describe("parseLetterboxdExport", () => {
  it("diary rows become DATE-precision watches with rewatch/tags/note-less", () => {
    const out = parseLetterboxdExport(files());
    const heatWatches = out.watches.filter((w) => w.ref.title === "Heat");
    expect(heatWatches).toHaveLength(2);
    expect(heatWatches[0]).toMatchObject({
      watchedAt: "2026-01-04",
      precision: "DATE",
      isRewatch: false,
      tags: ["crime"],
    });
    expect(heatWatches[1]).toMatchObject({
      watchedAt: "2026-01-31",
      isRewatch: true,
      tags: ["crime", "rewatch club"],
    });
  });

  it("watched.csv adds DATELESS watches only for films absent from the diary", () => {
    const out = parseLetterboxdExport(files());
    const se7en = out.watches.filter((w) => w.ref.title === "Se7en");
    expect(se7en).toHaveLength(1);
    expect(se7en[0]).toMatchObject({ watchedAt: null, precision: "UNKNOWN" });
    // Heat is in the diary -> no extra dateless row
    expect(out.watches.filter((w) => w.ref.title === "Heat")).toHaveLength(2);
  });

  it("ratings: 0.5-5 stars -> score = stars*2; likes -> thumb up", () => {
    const out = parseLetterboxdExport(files());
    const heat = out.ratings.find((r) => r.ref.title === "Heat");
    expect(heat).toMatchObject({ score: 9, ratedAt: "2026-01-05" });
    const like = out.ratings.find((r) => r.ref.title === "Se7en");
    expect(like).toMatchObject({ thumb: 1, score: null });
  });

  it("reviews keep multiline bodies and the watched date for diary linkage", () => {
    const out = parseLetterboxdExport(files());
    expect(out.reviews).toHaveLength(1);
    expect(out.reviews[0].body).toBe("Pacino vs De Niro.\nStill perfect.");
    expect(out.reviews[0].watchedAt).toBe("2026-01-04");
  });

  it("watchlist and lists parse with positions", () => {
    const out = parseLetterboxdExport(files());
    expect(out.watchlist[0].ref.title).toBe("Ronin");
    expect(out.lists).toHaveLength(1);
    expect(out.lists[0].name).toBe("Crime Essentials");
    expect(out.lists[0].items.map((i) => i.ref.title)).toEqual(["Heat", "Se7en"]);
  });

  it("rows without a usable name are counted as unmappable, never dropped silently", () => {
    const out = parseLetterboxdExport(
      files({ "diary.csv": "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-01-05,,1995,u,,,,\n" })
    );
    expect(out.unmappable.some((u) => u.file === "diary.csv")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run src/server/services/import/letterboxd.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/services/import/letterboxd.ts`**:

```typescript
/**
 * Letterboxd export parser. Input: Map<path, csvText> (zip already extracted
 * by the runner — keeps this module pure and unit-testable).
 *
 * Mapping decisions (spec §4.2):
 *  - diary.csv "Watched Date" -> DATE precision (stored at 12:00 UTC later).
 *  - watched.csv films not in the diary -> DATELESS watches (UNKNOWN).
 *  - stars (0.5-5) -> score = stars*2; likes/films.csv -> thumb up.
 *  - reviews.csv bodies preserved verbatim incl. newlines.
 */
import { parseCsv, parseCsvRecords } from "./csv";
import {
  emptyImport,
  type NormalizedImport,
  type TitleRef,
} from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function movieRef(rec: Record<string, string>): TitleRef | null {
  const title = (rec.Name ?? "").trim();
  if (title === "") return null;
  const year = Number.parseInt(rec.Year ?? "", 10);
  return { kind: "movie", title, year: Number.isNaN(year) ? null : year };
}

function starsToScore(raw: string): number | null {
  const stars = Number.parseFloat(raw);
  if (Number.isNaN(stars) || stars <= 0) return null;
  return Math.max(1, Math.min(10, Math.round(stars * 2)));
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function dateOrNull(raw: string | undefined): string | null {
  return raw !== undefined && DATE_RE.test(raw.trim()) ? raw.trim() : null;
}

export function parseLetterboxdExport(files: Map<string, string>): NormalizedImport {
  const out = emptyImport("LETTERBOXD");
  const diaryTitleKeys = new Set<string>();
  const titleKey = (ref: TitleRef) => `${(ref.title ?? "").toLowerCase()}|${ref.year ?? ""}`;

  const diary = files.get("diary.csv");
  if (diary !== undefined) {
    parseCsvRecords(diary).forEach((rec, i) => {
      const ref = movieRef(rec);
      if (!ref) {
        out.unmappable.push({ file: "diary.csv", line: i + 2, reason: "missing film name" });
        return;
      }
      diaryTitleKeys.add(titleKey(ref));
      const watchedAt = dateOrNull(rec["Watched Date"]);
      out.watches.push({
        ref,
        watchedAt,
        precision: watchedAt !== null ? "DATE" : "UNKNOWN",
        isRewatch: (rec.Rewatch ?? "").trim().toLowerCase() === "yes",
        tags: parseTags(rec.Tags ?? ""),
        note: null,
      });
    });
  }

  const watched = files.get("watched.csv");
  if (watched !== undefined) {
    parseCsvRecords(watched).forEach((rec, i) => {
      const ref = movieRef(rec);
      if (!ref) {
        out.unmappable.push({ file: "watched.csv", line: i + 2, reason: "missing film name" });
        return;
      }
      if (diaryTitleKeys.has(titleKey(ref))) return; // diary already covers it
      out.watches.push({
        ref,
        watchedAt: null,
        precision: "UNKNOWN",
        isRewatch: false,
        tags: [],
        note: null,
      });
    });
  }

  const ratings = files.get("ratings.csv");
  if (ratings !== undefined) {
    parseCsvRecords(ratings).forEach((rec, i) => {
      const ref = movieRef(rec);
      const score = starsToScore(rec.Rating ?? "");
      if (!ref || score === null) {
        out.unmappable.push({ file: "ratings.csv", line: i + 2, reason: "missing name or rating" });
        return;
      }
      out.ratings.push({ ref, score, thumb: null, ratedAt: dateOrNull(rec.Date) });
    });
  }

  const likes = files.get("likes/films.csv");
  if (likes !== undefined) {
    parseCsvRecords(likes).forEach((rec, i) => {
      const ref = movieRef(rec);
      if (!ref) {
        out.unmappable.push({ file: "likes/films.csv", line: i + 2, reason: "missing film name" });
        return;
      }
      out.ratings.push({ ref, score: null, thumb: 1, ratedAt: dateOrNull(rec.Date) });
    });
  }

  const reviews = files.get("reviews.csv");
  if (reviews !== undefined) {
    parseCsvRecords(reviews).forEach((rec, i) => {
      const ref = movieRef(rec);
      const body = rec.Review ?? "";
      if (!ref || body.trim() === "") {
        out.unmappable.push({ file: "reviews.csv", line: i + 2, reason: "missing name or body" });
        return;
      }
      out.reviews.push({
        ref,
        body,
        containsSpoilers: false, // Letterboxd exports no spoiler flag
        watchedAt: dateOrNull(rec["Watched Date"]),
      });
    });
  }

  const watchlist = files.get("watchlist.csv");
  if (watchlist !== undefined) {
    parseCsvRecords(watchlist).forEach((rec, i) => {
      const ref = movieRef(rec);
      if (!ref) {
        out.unmappable.push({ file: "watchlist.csv", line: i + 2, reason: "missing film name" });
        return;
      }
      out.watchlist.push({ ref, addedAt: dateOrNull(rec.Date), note: null });
    });
  }

  for (const [path, content] of files) {
    if (!path.startsWith("lists/") || !path.endsWith(".csv")) continue;
    const list = parseLetterboxdList(path, content, out);
    if (list) out.lists.push(list);
  }

  return out;
}

/** lists/*.csv: metadata block, blank line, then the item table. */
function parseLetterboxdList(
  path: string,
  content: string,
  out: NormalizedImport
): NormalizedImport["lists"][number] | null {
  const rows = parseCsv(content);
  const headerIdx = rows.findIndex((r) => r[0] === "Position" && r[1] === "Name");
  if (headerIdx === -1) {
    out.unmappable.push({ file: path, line: 1, reason: "unrecognized list format" });
    return null;
  }
  // Metadata: a "Date,Name,..." header row followed by one value row.
  const metaHeaderIdx = rows.findIndex((r) => r[0] === "Date" && r[1] === "Name");
  const meta =
    metaHeaderIdx !== -1 && metaHeaderIdx + 1 < headerIdx ? rows[metaHeaderIdx + 1] : null;
  const fallbackName = path.replace(/^lists\//, "").replace(/\.csv$/, "").replace(/-/g, " ");
  const name = meta?.[1]?.trim() || fallbackName;
  const description = meta?.[4]?.trim() || null;

  const header = rows[headerIdx];
  const items: Array<{ ref: TitleRef; position: number }> = [];
  rows.slice(headerIdx + 1).forEach((r, i) => {
    if (r.length < 2 || r.every((c) => c.trim() === "")) return;
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => {
      rec[h] = r[idx] ?? "";
    });
    const ref = movieRef(rec);
    if (!ref) {
      out.unmappable.push({ file: path, line: headerIdx + i + 2, reason: "missing film name" });
      return;
    }
    const position = Number.parseInt(rec.Position ?? "", 10);
    items.push({ ref, position: Number.isNaN(position) ? items.length + 1 : position });
  });
  return { name, description, items };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run src/server/services/import/letterboxd.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/import/letterboxd.ts src/server/services/import/letterboxd.test.ts
git commit -m "feat(import): Letterboxd export parser (diary/watched/ratings/reviews/likes/watchlist/lists)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 20: Trakt + IMDb parsers (TDD)

**Files:**
- Create: `src/server/services/import/trakt.ts`
- Test: `src/server/services/import/trakt.test.ts`
- Create: `src/server/services/import/imdb.ts`
- Test: `src/server/services/import/imdb.test.ts`

- [ ] **Step 1: Write the failing Trakt tests** (`src/server/services/import/trakt.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { parseTraktExport } from "./trakt";

const HISTORY = JSON.stringify([
  {
    watched_at: "2026-01-04T21:30:00.000Z",
    type: "movie",
    movie: { title: "Heat", year: 1995, ids: { tmdb: 949, imdb: "tt0113277" } },
  },
  {
    watched_at: "2026-01-05T20:00:00.000Z",
    type: "episode",
    show: { title: "Breaking Bad", year: 2008, ids: { tmdb: 1396 } },
    episode: { season: 1, number: 2, ids: { tmdb: 62086 } },
  },
]);

const RATINGS = JSON.stringify([
  { rated_at: "2026-01-04T22:00:00.000Z", rating: 9, type: "movie", movie: { title: "Heat", year: 1995, ids: { tmdb: 949 } } },
  { rated_at: "2026-01-06T22:00:00.000Z", rating: 8, type: "episode", show: { title: "Breaking Bad", ids: { tmdb: 1396 } }, episode: { season: 1, number: 2, ids: { tmdb: 62086 } } },
]);

const WATCHLIST = JSON.stringify([
  { listed_at: "2026-01-07T10:00:00.000Z", type: "show", show: { title: "The Wire", year: 2002, ids: { tmdb: 1438 } }, notes: "everyone says so" },
]);

function files(extra: Record<string, string> = {}): Map<string, string> {
  return new Map(
    Object.entries({
      "history.json": HISTORY,
      "ratings.json": RATINGS,
      "watchlist.json": WATCHLIST,
      ...extra,
    })
  );
}

describe("parseTraktExport", () => {
  it("movie history -> DATETIME watches with tmdb ids", () => {
    const out = parseTraktExport(files());
    const movie = out.watches.find((w) => w.ref.kind === "movie");
    expect(movie).toMatchObject({
      ref: { kind: "movie", tmdbId: 949 },
      watchedAt: "2026-01-04T21:30:00.000Z",
      precision: "DATETIME",
    });
  });

  it("episode history -> series ref + tmdbEpisodeId-FIRST episode ref", () => {
    const out = parseTraktExport(files());
    const ep = out.watches.find((w) => w.ref.kind === "series");
    expect(ep?.ref.tmdbId).toBe(1396);
    expect(ep?.episode).toEqual({ tmdbEpisodeId: 62086, seasonNumber: 1, episodeNumber: 2 });
  });

  it("movie/show ratings import; episode ratings counted unmappable (no table yet)", () => {
    const out = parseTraktExport(files());
    expect(out.ratings).toHaveLength(1);
    expect(out.ratings[0]).toMatchObject({ score: 9, ratedAt: "2026-01-04" });
    expect(out.unmappable.some((u) => u.reason.includes("episode rating"))).toBe(true);
  });

  it("watchlist keeps notes (import fidelity)", () => {
    const out = parseTraktExport(files());
    expect(out.watchlist[0]).toMatchObject({
      ref: { kind: "series", tmdbId: 1438 },
      note: "everyone says so",
    });
  });

  it("malformed JSON is unmappable, not a crash", () => {
    const out = parseTraktExport(files({ "history.json": "{not json" }));
    expect(out.unmappable.some((u) => u.file === "history.json")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement `src/server/services/import/trakt.ts`**:

Run: `yarn vitest run src/server/services/import/trakt.test.ts` → FAIL (module not found). Then:

```typescript
/**
 * Trakt export parser (JSON files from the official data export / trakt-tools
 * dumps: history.json, ratings.json, watchlist.json).
 *
 * Episodes resolve tmdbEpisodeId-FIRST (invariant 2). Per-episode ratings are
 * COUNTED as unmappable for now (future user_episode_ratings table) — never
 * silently dropped.
 */
import { z } from "zod";
import {
  emptyImport,
  type NormalizedImport,
  type TitleRef,
} from "./types";

const TraktIds = z.object({
  tmdb: z.number().int().nullable().optional(),
  imdb: z.string().nullable().optional(),
});

const TraktTitle = z.object({
  title: z.string().optional(),
  year: z.number().int().nullable().optional(),
  ids: TraktIds,
});

const TraktEpisode = z.object({
  season: z.number().int(),
  number: z.number().int(),
  ids: TraktIds.optional(),
});

const TraktHistoryItem = z.object({
  watched_at: z.string().optional(),
  type: z.enum(["movie", "episode", "show"]).optional(),
  movie: TraktTitle.optional(),
  show: TraktTitle.optional(),
  episode: TraktEpisode.optional(),
});

const TraktRatingItem = z.object({
  rated_at: z.string().optional(),
  rating: z.number().int().min(1).max(10),
  type: z.enum(["movie", "show", "season", "episode"]).optional(),
  movie: TraktTitle.optional(),
  show: TraktTitle.optional(),
  episode: TraktEpisode.optional(),
});

const TraktWatchlistItem = z.object({
  listed_at: z.string().optional(),
  type: z.enum(["movie", "show"]).optional(),
  movie: TraktTitle.optional(),
  show: TraktTitle.optional(),
  notes: z.string().nullable().optional(),
});

function toRef(kind: "movie" | "series", t: z.infer<typeof TraktTitle>): TitleRef {
  return {
    kind,
    tmdbId: t.ids.tmdb ?? undefined,
    imdbId: t.ids.imdb ?? undefined,
    title: t.title,
    year: t.year ?? null,
  };
}

function parseJsonArray<T>(
  out: NormalizedImport,
  file: string,
  content: string,
  schema: z.ZodType<T>
): T[] {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    out.unmappable.push({ file, line: 0, reason: "invalid JSON" });
    return [];
  }
  if (!Array.isArray(raw)) {
    out.unmappable.push({ file, line: 0, reason: "expected a JSON array" });
    return [];
  }
  const items: T[] = [];
  raw.forEach((item, i) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) items.push(parsed.data);
    else out.unmappable.push({ file, line: i, reason: "row failed schema validation" });
  });
  return items;
}

export function parseTraktExport(files: Map<string, string>): NormalizedImport {
  const out = emptyImport("TRAKT");

  const history = files.get("history.json");
  if (history !== undefined) {
    for (const item of parseJsonArray(out, "history.json", history, TraktHistoryItem)) {
      if (item.movie) {
        out.watches.push({
          ref: toRef("movie", item.movie),
          watchedAt: item.watched_at ?? null,
          precision: item.watched_at !== undefined ? "DATETIME" : "UNKNOWN",
          isRewatch: false, // runner marks rewatches per-title by watch order
          tags: [],
          note: null,
        });
      } else if (item.show && item.episode) {
        out.watches.push({
          ref: toRef("series", item.show),
          episode: {
            tmdbEpisodeId: item.episode.ids?.tmdb ?? undefined,
            seasonNumber: item.episode.season,
            episodeNumber: item.episode.number,
          },
          watchedAt: item.watched_at ?? null,
          precision: item.watched_at !== undefined ? "DATETIME" : "UNKNOWN",
          isRewatch: false,
          tags: [],
          note: null,
        });
      } else if (item.show) {
        out.watches.push({
          ref: toRef("series", item.show),
          watchedAt: item.watched_at ?? null,
          precision: item.watched_at !== undefined ? "DATETIME" : "UNKNOWN",
          isRewatch: false,
          tags: [],
          note: null,
        });
      } else {
        out.unmappable.push({ file: "history.json", line: 0, reason: "row has no movie/show" });
      }
    }
  }

  const ratings = files.get("ratings.json");
  if (ratings !== undefined) {
    for (const item of parseJsonArray(out, "ratings.json", ratings, TraktRatingItem)) {
      const ratedAt = item.rated_at !== undefined ? item.rated_at.slice(0, 10) : null;
      if (item.type === "movie" && item.movie) {
        out.ratings.push({ ref: toRef("movie", item.movie), score: item.rating, thumb: null, ratedAt });
      } else if (item.type === "show" && item.show) {
        out.ratings.push({ ref: toRef("series", item.show), score: item.rating, thumb: null, ratedAt });
      } else {
        out.unmappable.push({
          file: "ratings.json",
          line: 0,
          reason: `${item.type ?? "unknown"} rating not yet importable (episode rating)`,
        });
      }
    }
  }

  const watchlist = files.get("watchlist.json");
  if (watchlist !== undefined) {
    for (const item of parseJsonArray(out, "watchlist.json", watchlist, TraktWatchlistItem)) {
      const title = item.movie ?? item.show;
      if (!title) {
        out.unmappable.push({ file: "watchlist.json", line: 0, reason: "row has no movie/show" });
        continue;
      }
      out.watchlist.push({
        ref: toRef(item.movie ? "movie" : "series", title),
        addedAt: item.listed_at !== undefined ? item.listed_at.slice(0, 10) : null,
        note: item.notes ?? null,
      });
    }
  }

  return out;
}
```

Run: `yarn vitest run src/server/services/import/trakt.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 3: Write the failing IMDb tests** (`src/server/services/import/imdb.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { parseImdbRatings } from "./imdb";

const CSV = `Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0113277,9,2026-01-04,Heat,Heat,https://www.imdb.com/title/tt0113277/,Movie,8.3,170,1995,"Action, Crime",750000,1995-12-15,Michael Mann
tt0903747,10,2026-01-05,Breaking Bad,Breaking Bad,https://www.imdb.com/title/tt0903747/,TV Series,9.5,45,2008,"Crime, Drama",2200000,2008-01-20,
tt0959621,9,2026-01-06,Pilot,Pilot,https://www.imdb.com/title/tt0959621/,TV Episode,9.0,58,2008,"Crime, Drama",60000,2008-01-20,
`;

describe("parseImdbRatings", () => {
  it("movie ratings import with imdb ids; rating implies a dateless watch", () => {
    const out = parseImdbRatings(CSV);
    const heat = out.ratings.find((r) => r.ref.imdbId === "tt0113277");
    expect(heat).toMatchObject({ score: 9, ratedAt: "2026-01-04", ref: { kind: "movie" } });
    const watch = out.watches.find((w) => w.ref.imdbId === "tt0113277");
    expect(watch).toMatchObject({ watchedAt: null, precision: "UNKNOWN" });
  });

  it("TV Series ratings -> series-level granularity-unknown watch (spec)", () => {
    const out = parseImdbRatings(CSV);
    const bb = out.watches.find((w) => w.ref.imdbId === "tt0903747");
    expect(bb?.ref.kind).toBe("series");
    expect(bb?.episode).toBeUndefined();
  });

  it("TV Episode rows are unmappable (no episode external-id mapping), counted not dropped", () => {
    const out = parseImdbRatings(CSV);
    expect(out.unmappable.some((u) => u.reason.includes("TV Episode"))).toBe(true);
    expect(out.watches.find((w) => w.ref.imdbId === "tt0959621")).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run to verify failure, then implement `src/server/services/import/imdb.ts`**:

Run: `yarn vitest run src/server/services/import/imdb.test.ts` → FAIL. Then:

```typescript
/**
 * IMDb ratings.csv parser. IMDb has no watch history export — a rating
 * implies "watched, date unknown" (dateless UNKNOWN watch; ratedAt is when
 * they RATED, not watched — import-honest). TV Series rows become
 * series-level granularity-unknown events (spec §4.2 watch_events).
 * TV Episode rows are unmappable for now: external_ids holds movie/series/
 * person ids only — counted, never silently dropped.
 */
import { parseCsvRecords } from "./csv";
import { emptyImport, type NormalizedImport, type TitleRef } from "./types";

const MOVIE_TYPES = new Set(["Movie", "TV Movie", "Video", "TV Special", "Short"]);
const SERIES_TYPES = new Set(["TV Series", "TV Mini Series", "TV Mini-Series"]);

export function parseImdbRatings(csvText: string): NormalizedImport {
  const out = emptyImport("IMDB");
  parseCsvRecords(csvText).forEach((rec, i) => {
    const line = i + 2;
    const imdbId = (rec.Const ?? "").trim();
    const title = (rec.Title ?? "").trim();
    const titleType = (rec["Title Type"] ?? "").trim();
    const score = Number.parseInt(rec["Your Rating"] ?? "", 10);
    const year = Number.parseInt(rec.Year ?? "", 10);
    const ratedAt = /^\d{4}-\d{2}-\d{2}$/.test((rec["Date Rated"] ?? "").trim())
      ? rec["Date Rated"].trim()
      : null;

    if (imdbId === "" || title === "" || Number.isNaN(score)) {
      out.unmappable.push({ file: "ratings.csv", line, reason: "missing const/title/rating" });
      return;
    }

    let kind: TitleRef["kind"];
    if (MOVIE_TYPES.has(titleType)) kind = "movie";
    else if (SERIES_TYPES.has(titleType)) kind = "series";
    else {
      out.unmappable.push({
        file: "ratings.csv",
        line,
        reason: `${titleType || "unknown"} not importable (TV Episode rows need episode external ids)`,
      });
      return;
    }

    const ref: TitleRef = {
      kind,
      imdbId,
      title,
      year: Number.isNaN(year) ? null : year,
    };
    out.ratings.push({ ref, score: Math.max(1, Math.min(10, score)), thumb: null, ratedAt });
    out.watches.push({
      ref,
      watchedAt: null,
      precision: "UNKNOWN",
      isRewatch: false,
      tags: [],
      note: null,
    });
  });
  return out;
}
```

Run: `yarn vitest run src/server/services/import/imdb.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/import/trakt.ts src/server/services/import/trakt.test.ts src/server/services/import/imdb.ts src/server/services/import/imdb.test.ts
git commit -m "feat(import): Trakt JSON + IMDb ratings.csv parsers (unmappable rows counted, never dropped)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 21: Title/episode resolution + import runner + import actions

**Files:**
- Create: `src/server/services/import/resolve.ts`
- Create: `src/server/services/import/runner.ts`
- Create: `src/server/actions/imports.ts`

Resolution policy (decision, recorded): phase-0 imports resolve ONLY against the local catalog (229k movies / 43k+ series). Rows whose title can't be resolved are counted in `stats.errors` as `not in catalog` and skipped — the retained raw upload (`fileRef`) makes a future re-run lossless once the catalog grows. The importer never triggers hydration (a 2k-row import must not queue 2k TMDB+Lambda jobs on the 2-vCPU box).

- [ ] **Step 1: Create `src/server/services/import/resolve.ts`**:

```typescript
/**
 * Batch resolution of TitleRefs/EpisodeRefs against the local catalog.
 * Order: tmdbId (movies/series PKs ARE tmdb ids) -> imdbId (external_ids) ->
 * lower(title)+year (highest popularity wins).
 * Episodes: tmdbEpisodeId FIRST; natural keys derived from it; fall back to
 * (season, episode) natural keys and backfill tmdbEpisodeId from our rows.
 */
import { prisma } from "@/server/db/postgres";
import type { EpisodeRef, TitleRef } from "./types";

export interface ResolvedTitle {
  kind: "movie" | "series";
  id: number;
}

export interface ResolvedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  tmdbEpisodeId: number | null;
}

function refKey(ref: TitleRef): string {
  return [ref.kind, ref.tmdbId ?? "", ref.imdbId ?? "", (ref.title ?? "").toLowerCase(), ref.year ?? ""].join("|");
}

export class TitleResolver {
  private cache = new Map<string, ResolvedTitle | null>();

  /** Pre-resolves a batch; subsequent resolve() calls are map lookups. */
  async prime(refs: TitleRef[]): Promise<void> {
    const todo = refs.filter((r) => !this.cache.has(refKey(r)));
    if (todo.length === 0) return;

    // 1. tmdb ids: PKs are TMDB ids — existence check.
    const movieTmdbIds = [...new Set(todo.filter((r) => r.kind === "movie" && r.tmdbId).map((r) => r.tmdbId as number))];
    const seriesTmdbIds = [...new Set(todo.filter((r) => r.kind === "series" && r.tmdbId).map((r) => r.tmdbId as number))];
    const [movies, series] = await Promise.all([
      movieTmdbIds.length > 0
        ? prisma.movie.findMany({ where: { id: { in: movieTmdbIds } }, select: { id: true } })
        : Promise.resolve([]),
      seriesTmdbIds.length > 0
        ? prisma.series.findMany({ where: { id: { in: seriesTmdbIds } }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    const movieIdSet = new Set(movies.map((m) => m.id));
    const seriesIdSet = new Set(series.map((s) => s.id));

    // 2. imdb ids via external_ids.
    const imdbIds = [...new Set(todo.filter((r) => r.imdbId).map((r) => r.imdbId as string))];
    const externals =
      imdbIds.length > 0
        ? await prisma.externalId.findMany({
            where: { source: "imdb", externalId: { in: imdbIds } },
            select: { externalId: true, movieId: true, seriesId: true },
          })
        : [];
    const byImdb = new Map(externals.map((e) => [e.externalId, e]));

    // 3. title+year (movies and series separately), highest popularity wins.
    const titleRefs = todo.filter((r) => r.title && !r.tmdbId && !byImdb.has(r.imdbId ?? ""));
    const titles = [...new Set(titleRefs.map((r) => (r.title as string).toLowerCase()))];
    const titleRows =
      titles.length > 0
        ? await prisma.$queryRaw<
            Array<{ kind: string; id: number; title: string; year: number | null; popularity: number | null }>
          >`
            SELECT 'movie' AS kind, id, lower(title) AS title,
                   EXTRACT(YEAR FROM release_date)::int AS year, popularity
            FROM movies WHERE lower(title) = ANY(${titles}::text[])
            UNION ALL
            SELECT 'series' AS kind, id, lower(name) AS title,
                   EXTRACT(YEAR FROM first_air_date)::int AS year, popularity
            FROM series WHERE lower(name) = ANY(${titles}::text[])
          `
        : [];

    for (const ref of todo) {
      const key = refKey(ref);
      if (this.cache.has(key)) continue;

      if (ref.tmdbId !== undefined) {
        const hit = ref.kind === "movie" ? movieIdSet.has(ref.tmdbId) : seriesIdSet.has(ref.tmdbId);
        this.cache.set(key, hit ? { kind: ref.kind, id: ref.tmdbId } : null);
        continue;
      }
      const ext = ref.imdbId !== undefined ? byImdb.get(ref.imdbId) : undefined;
      if (ext) {
        const id = ref.kind === "movie" ? ext.movieId : ext.seriesId;
        if (id !== null && id !== undefined) {
          this.cache.set(key, { kind: ref.kind, id });
          continue;
        }
      }
      if (ref.title !== undefined) {
        const lowered = ref.title.toLowerCase();
        const candidates = titleRows.filter(
          (t) =>
            t.kind === ref.kind &&
            t.title === lowered &&
            (ref.year == null || t.year === null || Math.abs(t.year - ref.year) <= 1)
        );
        candidates.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
        this.cache.set(key, candidates[0] ? { kind: ref.kind, id: candidates[0].id } : null);
        continue;
      }
      this.cache.set(key, null);
    }
  }

  resolve(ref: TitleRef): ResolvedTitle | null {
    return this.cache.get(refKey(ref)) ?? null;
  }
}

/**
 * Per-series episode resolver. tmdbEpisodeId first (stable across
 * renumbering); natural keys derived from it. Falls back to natural keys and
 * backfills tmdbEpisodeId from our episodes table.
 */
export class EpisodeResolver {
  private bySeries = new Map<
    number,
    { byTmdbId: Map<number, ResolvedEpisode>; byNatural: Map<string, ResolvedEpisode> }
  >();

  async prime(seriesIds: number[]): Promise<void> {
    const todo = seriesIds.filter((id) => !this.bySeries.has(id));
    if (todo.length === 0) return;
    const rows = await prisma.episode.findMany({
      where: { season: { seriesId: { in: todo } } },
      select: {
        episodeNumber: true,
        tmdbEpisodeId: true,
        season: { select: { seriesId: true, seasonNumber: true } },
      },
    });
    for (const id of todo) {
      this.bySeries.set(id, { byTmdbId: new Map(), byNatural: new Map() });
    }
    for (const row of rows) {
      const entry = this.bySeries.get(row.season.seriesId);
      if (!entry) continue;
      const resolved: ResolvedEpisode = {
        seasonNumber: row.season.seasonNumber,
        episodeNumber: row.episodeNumber,
        tmdbEpisodeId: row.tmdbEpisodeId,
      };
      if (row.tmdbEpisodeId !== null) entry.byTmdbId.set(row.tmdbEpisodeId, resolved);
      entry.byNatural.set(`${row.season.seasonNumber}:${row.episodeNumber}`, resolved);
    }
  }

  resolve(seriesId: number, ref: EpisodeRef): ResolvedEpisode | null {
    const entry = this.bySeries.get(seriesId);
    if (!entry) return null;
    if (ref.tmdbEpisodeId !== undefined) {
      const byId = entry.byTmdbId.get(ref.tmdbEpisodeId);
      if (byId) return byId;
    }
    if (ref.seasonNumber !== undefined && ref.episodeNumber !== undefined) {
      const byNatural = entry.byNatural.get(`${ref.seasonNumber}:${ref.episodeNumber}`);
      if (byNatural) return byNatural;
      // Episode not hydrated locally yet: keep the import's natural keys +
      // tmdbEpisodeId verbatim; the post-hydration reconcile pass heals drift.
      return {
        seasonNumber: ref.seasonNumber,
        episodeNumber: ref.episodeNumber,
        tmdbEpisodeId: ref.tmdbEpisodeId ?? null,
      };
    }
    return null;
  }
}
```

- [ ] **Step 2: Create `src/server/services/import/runner.ts`**:

```typescript
/**
 * ImportJob execution. Fire-and-forget after the action creates the job
 * (triggerProgressiveEnrichment style). Row-level stats; app-level dedupe
 * within the run on (titleKey, watchedAt, isRewatch) — NO unique constraints
 * on events (two same-day watches are legit); skips recorded in stats.
 * ONE progress recompute per affected series, at the end.
 */
import pLimit from "p-limit";
import { Prisma, type ImportSource } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { dateOnlyToUtc } from "@/lib/watch-dates";
import { strFromU8, unzipSync } from "fflate";
import { gateText } from "@/server/services/moderation/gate";
import type { GateOutput, GateStatus } from "@/server/services/moderation/gate-policy";
import { recomputeSeriesProgress } from "@/server/db/postgres/social/progress";
import { markStatsDirty } from "@/server/db/postgres/social/stats-dirty";
import { setUserRating } from "@/server/db/postgres/social/ratings";
import { upsertUserReview, setReviewGateResult } from "@/server/db/postgres/social/reviews";
import { createList, addListItem } from "@/server/db/postgres/social/lists";
import { importFileStorage } from "./storage";
import { parseLetterboxdExport } from "./letterboxd";
import { parseTraktExport } from "./trakt";
import { parseImdbRatings } from "./imdb";
import type { ImportStats, NormalizedImport, NormalizedWatch, TitleRef } from "./types";
import { EpisodeResolver, TitleResolver, type ResolvedTitle } from "./resolve";

const INSERT_CHUNK = 500;
const GATE_CONCURRENCY = 2;

export async function createImportJob(
  userId: number,
  source: ImportSource,
  fileRef: string
): Promise<number> {
  const job = await prisma.importJob.create({
    data: { userId, source, fileRef },
    select: { id: true },
  });
  // Fire-and-forget (triggerProgressiveEnrichment style) — errors land on the job row.
  void runImportJob(job.id).catch((error: unknown) => {
    dataLogger.error({
      service: "import",
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return job.id;
}

function extractFiles(source: ImportSource, buffer: Buffer): Map<string, string> {
  const isZip = buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
  if (!isZip) {
    const text = buffer.toString("utf8");
    if (source === "IMDB") return new Map([["ratings.csv", text]]);
    if (source === "TRAKT") return new Map([["history.json", text]]);
    return new Map([["diary.csv", text]]);
  }
  const unzipped = unzipSync(new Uint8Array(buffer));
  const files = new Map<string, string>();
  for (const [path, data] of Object.entries(unzipped)) {
    if (path.endsWith("/")) continue;
    // Strip a single top-level export folder if present.
    const normalized = path.replace(/^[^/]*letterboxd[^/]*\//i, "");
    files.set(normalized, strFromU8(data));
  }
  return files;
}

function parseBySource(source: ImportSource, files: Map<string, string>): NormalizedImport {
  if (source === "LETTERBOXD") return parseLetterboxdExport(files);
  if (source === "TRAKT") return parseTraktExport(files);
  const csv = files.get("ratings.csv") ?? [...files.values()][0] ?? "";
  return parseImdbRatings(csv);
}

function titleKey(r: ResolvedTitle): string {
  return `${r.kind}:${r.id}`;
}

/** Key matches the stored-row key exactly (ISO of the COMPUTED Date, since
 *  DATE-precision strings become 12:00-UTC datetimes on insert). */
function watchDedupeKey(
  r: ResolvedTitle,
  seasonNumber: number | null,
  episodeNumber: number | null,
  watchedAt: Date | null,
  isRewatch: boolean
): string {
  const ep = seasonNumber !== null ? `:${seasonNumber}:${episodeNumber}` : "";
  return `${titleKey(r)}${ep}|${watchedAt?.toISOString() ?? "null"}|${isRewatch}`;
}

export async function runImportJob(jobId: number): Promise<void> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "PENDING") return;
  await prisma.importJob.update({ where: { id: jobId }, data: { status: "RUNNING" } });

  const stats: ImportStats = { rowsTotal: 0, imported: 0, skipped: 0, errors: [] };
  try {
    const buffer = await importFileStorage.load(job.fileRef);
    const parsed = parseBySource(job.source, extractFiles(job.source, buffer));
    stats.rowsTotal =
      parsed.watches.length +
      parsed.ratings.length +
      parsed.reviews.length +
      parsed.watchlist.length +
      parsed.lists.reduce((n, l) => n + l.items.length, 0) +
      parsed.unmappable.length;
    for (const u of parsed.unmappable.slice(0, 200)) {
      stats.errors.push(`${u.file}:${u.line} ${u.reason}`);
    }
    stats.skipped += parsed.unmappable.length;

    const resolver = new TitleResolver();
    const allRefs: TitleRef[] = [
      ...parsed.watches.map((w) => w.ref),
      ...parsed.ratings.map((r) => r.ref),
      ...parsed.reviews.map((r) => r.ref),
      ...parsed.watchlist.map((w) => w.ref),
      ...parsed.lists.flatMap((l) => l.items.map((i) => i.ref)),
    ];
    await resolver.prime(allRefs);

    const skipUnresolved = (ref: TitleRef, what: string): ResolvedTitle | null => {
      const resolved = resolver.resolve(ref);
      if (!resolved) {
        stats.skipped += 1;
        if (stats.errors.length < 500) {
          stats.errors.push(`${what} "${ref.title ?? ref.imdbId ?? ref.tmdbId}" not in catalog`);
        }
      }
      return resolved;
    };

    // ---- watches -----------------------------------------------------------
    const episodeResolver = new EpisodeResolver();
    const seriesIdsInRun = new Set<number>();
    type Row = Prisma.WatchEventCreateManyInput;
    const rows: Row[] = [];
    const seen = new Set<string>();

    // Cross-run idempotency: skip exact duplicates of prior IMPORT events.
    const existing = await prisma.watchEvent.findMany({
      where: { userId: job.userId, source: "IMPORT" },
      select: {
        movieId: true,
        seriesId: true,
        seasonNumber: true,
        episodeNumber: true,
        watchedAt: true,
        isRewatch: true,
      },
    });
    for (const e of existing) {
      const key = `${e.movieId !== null ? `movie:${e.movieId}` : `series:${e.seriesId}`}${
        e.seasonNumber !== null ? `:${e.seasonNumber}:${e.episodeNumber}` : ""
      }|${e.watchedAt?.toISOString() ?? "null"}|${e.isRewatch}`;
      seen.add(key);
    }

    const preResolve = parsed.watches
      .map((w) => ({ w, resolved: resolver.resolve(w.ref) }))
      .filter((x): x is { w: NormalizedWatch; resolved: ResolvedTitle } => x.resolved !== null);
    await episodeResolver.prime([
      ...new Set(preResolve.filter((x) => x.resolved.kind === "series").map((x) => x.resolved.id)),
    ]);

    for (const w of parsed.watches) {
      const resolved = skipUnresolved(w.ref, "watch");
      if (!resolved) continue;

      let watchedAt: Date | null = null;
      if (w.watchedAt !== null) {
        watchedAt = w.precision === "DATE" ? dateOnlyToUtc(w.watchedAt) : new Date(w.watchedAt);
      }
      const row: Row = {
        userId: job.userId,
        movieId: resolved.kind === "movie" ? resolved.id : null,
        seriesId: resolved.kind === "series" ? resolved.id : null,
        seasonNumber: null,
        episodeNumber: null,
        tmdbEpisodeId: null,
        watchedAt,
        watchedAtPrecision: w.precision,
        isRewatch: w.isRewatch,
        tags: w.tags,
        note: w.note,
        source: "IMPORT",
      };
      if (resolved.kind === "series" && w.episode) {
        const ep = episodeResolver.resolve(resolved.id, w.episode);
        if (ep) {
          row.seasonNumber = ep.seasonNumber;
          row.episodeNumber = ep.episodeNumber;
          row.tmdbEpisodeId = ep.tmdbEpisodeId;
        }
      }
      const key = watchDedupeKey(
        resolved,
        row.seasonNumber ?? null,
        row.episodeNumber ?? null,
        watchedAt,
        w.isRewatch
      );
      if (seen.has(key)) {
        stats.skipped += 1;
        continue;
      }
      seen.add(key);
      if (resolved.kind === "series") seriesIdsInRun.add(resolved.id);
      rows.push(row);
    }

    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      await prisma.watchEvent.createMany({ data: chunk });
      stats.imported += chunk.length;
    }

    // ONE recompute per affected series (spec mandate).
    for (const seriesId of seriesIdsInRun) {
      await prisma.$transaction((tx) => recomputeSeriesProgress(tx, job.userId, seriesId));
    }

    // ---- ratings (merge thumb+score per title) ------------------------------
    for (const r of parsed.ratings) {
      const resolved = skipUnresolved(r.ref, "rating");
      if (!resolved) continue;
      await setUserRating(job.userId, {
        itemId: resolved.id,
        itemType: resolved.kind,
        ...(r.score !== null ? { score: r.score } : {}),
        ...(r.thumb !== null ? { thumb: r.thumb } : {}),
        ratedAt: r.ratedAt !== null ? dateOnlyToUtc(r.ratedAt) : undefined,
      });
      stats.imported += 1;
    }

    // ---- reviews: stored PENDING_REVIEW, gated lazily afterwards ------------
    const reviewIds: number[] = [];
    for (const review of parsed.reviews) {
      const resolved = skipUnresolved(review.ref, "review");
      if (!resolved) continue;
      const { id } = await upsertUserReview(job.userId, {
        ...(resolved.kind === "movie" ? { movieId: resolved.id } : { seriesId: resolved.id }),
        body: review.body,
        containsSpoilers: review.containsSpoilers,
        isPrivate: false,
        status: "PENDING_REVIEW",
      });
      reviewIds.push(id);
      stats.imported += 1;
    }

    // ---- watchlist -----------------------------------------------------------
    for (const item of parsed.watchlist) {
      const resolved = skipUnresolved(item.ref, "watchlist item");
      if (!resolved) continue;
      const anchor =
        resolved.kind === "movie" ? { movieId: resolved.id } : { seriesId: resolved.id };
      const where =
        resolved.kind === "movie"
          ? { userId_movieId: { userId: job.userId, movieId: resolved.id } }
          : { userId_seriesId: { userId: job.userId, seriesId: resolved.id } };
      await prisma.watchlistItem.upsert({
        where,
        create: {
          userId: job.userId,
          ...anchor,
          note: item.note,
          addedAt: item.addedAt !== null ? dateOnlyToUtc(item.addedAt) : new Date(),
        },
        update: { note: item.note ?? undefined },
      });
      stats.imported += 1;
    }

    // ---- lists ---------------------------------------------------------------
    for (const list of parsed.lists) {
      const created = await createList(job.userId, {
        name: list.name,
        description: list.description,
        isRanked: true,
      });
      for (const item of [...list.items].sort((a, b) => a.position - b.position)) {
        const resolved = skipUnresolved(item.ref, `list "${list.name}" item`);
        if (!resolved) continue;
        try {
          await addListItem(
            job.userId,
            created.id,
            resolved.kind === "movie" ? { movieId: resolved.id } : { seriesId: resolved.id }
          );
          stats.imported += 1;
        } catch {
          stats.skipped += 1; // duplicate within the source list
        }
      }
    }

    await prisma.$transaction((tx) => markStatsDirty(tx, job.userId));
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        stats: stats as unknown as Prisma.InputJsonValue,
      },
    });

    // Lazy AI-gate pass over imported reviews — fire-and-forget; failures stay
    // PENDING_REVIEW (fail-open, never silent-publish).
    if (reviewIds.length > 0) {
      void gateImportedReviews(reviewIds).catch(() => {});
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stats.errors.push(message);
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        stats: stats as unknown as Prisma.InputJsonValue,
      },
    });
    dataLogger.error({ service: "import", jobId, error: message });
  }
}

async function gateImportedReviews(reviewIds: number[]): Promise<void> {
  const limit = pLimit(GATE_CONCURRENCY);
  await Promise.all(
    reviewIds.map((id) =>
      limit(async () => {
        const review = await prisma.userReview.findUnique({
          where: { id },
          select: {
            body: true,
            movie: { select: { title: true } },
            series: { select: { name: true } },
          },
        });
        if (!review) return;
        const gate = await gateText(review.body, {
          title: review.movie?.title ?? review.series?.name ?? undefined,
        });
        await setReviewGateResult(id, gate.status, gate.aiLabels);
      })
    )
  );
}
```

- [ ] **Step 3: Create `src/server/actions/imports.ts`**:

```typescript
"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { prisma } from "@/server/db/postgres";
import { importFileStorage } from "@/server/services/import/storage";
import { createImportJob } from "@/server/services/import/runner";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SourceSchema = z.enum(["LETTERBOXD", "TRAKT", "IMDB"]);

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

/** Upload (FormData: file + source) -> background job -> per-row report. */
export async function startImport(formData: FormData) {
  try {
    const userId = await requirePgUserId();
    const source = SourceSchema.parse(formData.get("source"));
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false as const, error: "Missing file" };
    }
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return { success: false as const, error: "File must be between 1 byte and 50MB" };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileRef = await importFileStorage.save(userId, file.name, buffer);
    const jobId = await createImportJob(userId, source, fileRef);
    return { success: true as const, jobId };
  } catch (error: unknown) {
    return actionError("startImport", error);
  }
}

const JobIdSchema = z.object({ jobId: z.number().int().positive() });

export async function getImportJob(input: z.infer<typeof JobIdSchema>) {
  try {
    const { jobId } = JobIdSchema.parse(input);
    const userId = await requirePgUserId();
    const job = await prisma.importJob.findFirst({ where: { id: jobId, userId } });
    return job
      ? { success: true as const, job }
      : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("getImportJob", error);
  }
}

export async function listImportJobs() {
  try {
    const userId = await requirePgUserId();
    const jobs = await prisma.importJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return { success: true as const, jobs };
  } catch (error: unknown) {
    return actionError("listImportJobs", error);
  }
}
```

- [ ] **Step 4: Typecheck, run all import tests, commit**

Run: `yarn typecheck && yarn vitest run src/server/services/import/`
Expected: exit 0; csv/letterboxd/trakt/imdb suites pass.

```bash
git add src/server/services/import/resolve.ts src/server/services/import/runner.ts src/server/actions/imports.ts
git commit -m "feat(import): catalog resolution + background ImportJob runner + upload action

tmdbEpisodeId-first episode resolution; within-run + cross-run dedupe; one
progress recompute per series; imported reviews lazily AI-gated (fail-open).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 22: Data export (CSV dump of own data)

**Files:**
- Create: `src/server/services/export/csv-export.ts`
- Create: `src/app/api/user/export/route.ts`

- [ ] **Step 1: Create `src/server/services/export/csv-export.ts`**:

```typescript
/**
 * Full CSV export of a user's own data — the trust mirror of demanding
 * lossless imports from Letterboxd/Trakt (spec §4.2 social plumbing).
 * Includes PRIVATE entries: it is the owner's own data.
 */
import { strToU8, zipSync } from "fflate";
import { prisma } from "@/server/db/postgres";
import { toCsv } from "@/server/services/import/csv";

function iso(d: Date | null): string {
  return d ? d.toISOString() : "";
}

export async function buildUserExport(
  userId: number
): Promise<{ filename: string; zip: Uint8Array }> {
  const [events, ratings, reviews, watchlist, lists, follows] = await Promise.all([
    prisma.watchEvent.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      include: {
        movie: { select: { title: true } },
        series: { select: { name: true } },
      },
    }),
    prisma.userRating.findMany({
      where: { userId },
      include: {
        movie: { select: { title: true } },
        series: { select: { name: true } },
      },
    }),
    prisma.userReview.findMany({
      where: { userId },
      include: {
        movie: { select: { title: true } },
        series: { select: { name: true } },
      },
    }),
    prisma.watchlistItem.findMany({
      where: { userId },
      include: {
        movie: { select: { title: true } },
        series: { select: { name: true } },
      },
    }),
    prisma.list.findMany({
      where: { ownerId: userId },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: {
            movie: { select: { title: true } },
            series: { select: { name: true } },
            person: { select: { name: true } },
          },
        },
      },
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      include: { following: { select: { username: true, name: true } } },
    }),
  ]);

  const diaryCsv = toCsv(
    ["Type", "Title", "TmdbId", "Season", "Episode", "WatchedAt", "Precision", "Rewatch", "Private", "Source", "Tags", "Note"],
    events.map((e) => [
      e.movieId !== null ? "movie" : "series",
      e.movie?.title ?? e.series?.name ?? "",
      String(e.movieId ?? e.seriesId ?? ""),
      e.seasonNumber !== null ? String(e.seasonNumber) : "",
      e.episodeNumber !== null ? String(e.episodeNumber) : "",
      iso(e.watchedAt),
      e.watchedAtPrecision,
      String(e.isRewatch),
      String(e.isPrivate),
      e.source,
      e.tags.join(", "),
      e.note ?? "",
    ])
  );

  const ratingsCsv = toCsv(
    ["Type", "Title", "TmdbId", "Score", "Thumb", "RatedAt"],
    ratings.map((r) => [
      r.movieId !== null ? "movie" : "series",
      r.movie?.title ?? r.series?.name ?? "",
      String(r.movieId ?? r.seriesId ?? ""),
      r.score !== null ? String(r.score) : "",
      r.rating !== null ? String(r.rating) : "",
      iso(r.ratedAt),
    ])
  );

  const reviewsCsv = toCsv(
    ["Type", "Title", "TmdbId", "Season", "Spoilers", "Private", "Status", "CreatedAt", "Body"],
    reviews.map((r) => [
      r.movieId !== null ? "movie" : "series",
      r.movie?.title ?? r.series?.name ?? "",
      String(r.movieId ?? r.seriesId ?? ""),
      r.seasonNumber !== null ? String(r.seasonNumber) : "",
      String(r.containsSpoilers),
      String(r.isPrivate),
      r.status,
      iso(r.createdAt),
      r.body,
    ])
  );

  const watchlistCsv = toCsv(
    ["Type", "Title", "TmdbId", "AddedAt", "Position", "Note"],
    watchlist.map((w) => [
      w.movieId !== null ? "movie" : "series",
      w.movie?.title ?? w.series?.name ?? "",
      String(w.movieId ?? w.seriesId ?? ""),
      iso(w.addedAt),
      w.position !== null ? String(w.position) : "",
      w.note ?? "",
    ])
  );

  const listsCsv = toCsv(
    ["List", "Kind", "Public", "Position", "ItemType", "Title", "TmdbId", "Note"],
    lists.flatMap((l) =>
      l.items.map((i) => [
        l.name,
        l.kind,
        String(l.isPublic),
        String(i.position),
        i.movieId !== null ? "movie" : i.seriesId !== null ? "series" : "person",
        i.movie?.title ?? i.series?.name ?? i.person?.name ?? "",
        String(i.movieId ?? i.seriesId ?? i.personId ?? ""),
        i.note ?? "",
      ])
    )
  );

  const followsCsv = toCsv(
    ["Username", "Name", "FollowedAt"],
    follows.map((f) => [f.following.username ?? "", f.following.name ?? "", iso(f.createdAt)])
  );

  const zip = zipSync({
    "diary.csv": strToU8(diaryCsv),
    "ratings.csv": strToU8(ratingsCsv),
    "reviews.csv": strToU8(reviewsCsv),
    "watchlist.csv": strToU8(watchlistCsv),
    "lists.csv": strToU8(listsCsv),
    "follows.csv": strToU8(followsCsv),
  });

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return { filename: `movie-browser-export-${stamp}.zip`, zip };
}
```

- [ ] **Step 2: Create `src/app/api/user/export/route.ts`** (route handler, not an action — binary download):

```typescript
import { NextResponse } from "next/server";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { buildUserExport } from "@/server/services/export/csv-export";

/**
 * GET /api/user/export — zip of the caller's own data (diary, ratings,
 * reviews, watchlist, lists, follows). Auth required; never cached.
 */
export async function GET() {
  try {
    const userId = await requirePgUserId();
    const { filename, zip } = await buildUserExport(userId);
    return new NextResponse(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userApiLogger.error({
      route: "/api/user/export",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `yarn typecheck && yarn lint`
Expected: exit 0.

```bash
git add src/server/services/export/csv-export.ts src/app/api/user/export/route.ts
git commit -m "feat(export): full CSV dump of own data (zip download)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 23: Reports + username claim + final verification

**Files:**
- Create: `src/server/db/postgres/social/reports.ts`
- Create: `src/server/actions/reports.ts`
- Create: `src/server/actions/profile.ts`

- [ ] **Step 1: Create `src/server/db/postgres/social/reports.ts`**:

```typescript
/**
 * Reports: phase-0 ships the table + create path (UGC legal requirement);
 * the mod-queue UI is phase 1 (index [status, createdAt] already serves it).
 */
import type { ReportReason } from "@prisma/client";
import { prisma } from "@/server/db/postgres";

export interface CreateReportInput {
  commentId?: number;
  reviewId?: number;
  reason: ReportReason;
  note?: string | null;
}

export async function createReport(
  reporterId: number,
  input: CreateReportInput
): Promise<{ id: number }> {
  // Verify the target exists (FK would catch it, but give a clean error).
  if (input.reviewId !== undefined) {
    const review = await prisma.userReview.findUnique({
      where: { id: input.reviewId },
      select: { id: true },
    });
    if (!review) throw new Error("Review not found");
  }
  if (input.commentId !== undefined) {
    const comment = await prisma.comment.findUnique({
      where: { id: input.commentId },
      select: { id: true },
    });
    if (!comment) throw new Error("Comment not found");
  }
  return prisma.report.create({
    data: {
      reporterId,
      commentId: input.commentId ?? null,
      reviewId: input.reviewId ?? null,
      reason: input.reason,
      note: input.note ?? null,
    },
    select: { id: true },
  });
}
```

- [ ] **Step 2: Create `src/server/actions/reports.ts`**:

```typescript
"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { createReport as createReportQuery } from "@/server/db/postgres/social/reports";

const CreateReportSchema = z
  .object({
    commentId: z.number().int().positive().optional(),
    reviewId: z.number().int().positive().optional(),
    reason: z.enum(["SPOILER", "HARASSMENT", "SPAM", "HATE_SPEECH", "OTHER"]),
    note: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => (v.commentId === undefined) !== (v.reviewId === undefined), {
    message: "Exactly one of commentId/reviewId is required",
  });

export async function createReport(input: z.infer<typeof CreateReportSchema>) {
  try {
    const validated = CreateReportSchema.parse(input);
    const userId = await requirePgUserId();
    const { id } = await createReportQuery(userId, validated);
    return { success: true as const, reportId: id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "createReport", error: message });
    return { success: false as const, error: message };
  }
}
```

- [ ] **Step 3: Create `src/server/actions/profile.ts`** (username claim — the lower(username) unique from Task 3 enforces case-insensitive collisions at the DB):

```typescript
"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { prisma } from "@/server/db/postgres";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";

const RESERVED = new Set(["admin", "api", "settings", "import", "export", "me", "u"]);

const ClaimUsernameSchema = z.object({
  username: z
    .string()
    .regex(/^[a-zA-Z0-9_]{3,20}$/, "3-20 characters: letters, numbers, underscore"),
});

export async function claimUsername(input: z.infer<typeof ClaimUsernameSchema>) {
  try {
    const { username } = ClaimUsernameSchema.parse(input);
    if (RESERVED.has(username.toLowerCase())) {
      return { success: false as const, error: "Username not available" };
    }
    const userId = await requirePgUserId();
    await prisma.user.update({ where: { id: userId }, data: { username } });
    return { success: true as const, username };
  } catch (error: unknown) {
    // P2002 covers both the Prisma @unique and the raw lower(username) unique
    // (PG 23505 maps to P2002).
    if (isPrismaError(error) && error.code === "P2002") {
      return { success: false as const, error: "Username already taken" };
    }
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "claimUsername", error: message });
    return { success: false as const, error: message };
  }
}

export async function getMyProfile() {
  try {
    const userId = await requirePgUserId();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        image: true,
        bio: true,
        isPublic: true,
        metadata: true,
      },
    });
    return { success: true as const, user };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "getMyProfile", error: message });
    return { success: false as const, error: message };
  }
}
```

(Profile customization — backdrop/avatar/accent/links — lives in the existing `metadata` Json envelope per spec; the write action for it ships with the profile UI plan, not here.)

- [ ] **Step 4: Full local verification suite**

Run, in order:

```bash
# 1. Whole test suite + types + lint
yarn test:ci
# Expected: typecheck OK, lint OK, all vitest suites pass
# (watch-dates, progress-derive, blocks, stats-compute, gate-policy, csv,
#  letterboxd, trakt, imdb + all pre-existing suites).

# 2. Schema is in sync and constraints survived everything
DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" npx prisma db push
DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" npx tsx scripts/apply-ugc-constraints.ts
# Expected: "already in sync"; 16 chk_* constraints + 3 uq_* indexes listed.

# 3. EXPLAIN spot-checks (spec §7 definition of done)
psql "postgresql://dev:dev@localhost:5436/moviebrowser" -c "EXPLAIN SELECT * FROM series_progress WHERE user_id = 1 AND series_id = 1396;"
# Expected: Index Scan using series_progress_pkey (1 PK lookup — the gate read).
psql "postgresql://dev:dev@localhost:5436/moviebrowser" -c "EXPLAIN SELECT * FROM watch_events WHERE user_id = 1 ORDER BY watched_at DESC LIMIT 50;"
# Expected: Index Scan (Backward) using watch_events_user_id_watched_at_idx.
psql "postgresql://dev:dev@localhost:5436/moviebrowser" -c "EXPLAIN SELECT 1 FROM watch_events WHERE user_id = 1 AND movie_id = 603 LIMIT 1;"
# Expected: Index (Only) Scan using watch_events_user_id_movie_id_idx.

# 4. FK audit (Task 3 Step 5 query) — still 0 rows.
```

- [ ] **Step 5: Commit**

```bash
git add src/server/db/postgres/social/reports.ts src/server/actions/reports.ts src/server/actions/profile.ts
git commit -m "feat(social): reports create path + username claim (case-insensitive unique)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Production cutover runbook (DO NOT EXECUTE — ships with the release PR)

Local-only constraint: nothing in this plan is pushed or deployed. When phase 0 backend ships, the deploy needs this exact order because the workflow's plain `prisma db push` will REFUSE to drop `watched_movies` while it has rows:

1. SSH to the box; `git fetch` the release branch but do NOT restart anything yet.
2. Run `npx tsx scripts/migrate-watched-movies.ts` against the production DB (idempotent; verify `missing: 0`).
3. Run `npx prisma db push --accept-data-loss --skip-generate` ONCE manually (the only pending loss is the now-empty-in-spirit `watched_movies`).
4. Deploy normally. The new `[3.5/5] UGC constraints (gated)` step applies `04-ugc-constraints.sql` (the combined schema+file hash gate fires on first deploy).
5. Verify on the box: the Task 3 Step 5 FK-audit query returns 0 rows; `SELECT conname FROM pg_constraint WHERE conname LIKE 'chk_%'` returns 16 rows.
6. Definition-of-done items that need real data (spec §7): import a real Letterboxd export + a Trakt export losslessly and check the row-level report; confirm a 300-episode `markSeriesWatched` is one action/one recompute (pg logs); confirm a private-entries user's public surfaces leak nothing.

## Self-review notes (spec coverage)

- §4.2 schema: every model/enum present (Tasks 1–2); raw constraints (Task 3); cascade policy per invariant 4 (Restrict on watch_events/comments/user_reviews/list_items catalog FKs; Cascade on cheap state; Comment.userId SetNull; Comment.parentId NoAction).
- watched_movies hard migration + all 6 spec-listed surfaces + 1 discovered surface (ai user-profile tool): Task 9.
- Batch marks = single action + single recompute: Tasks 7–8. REWATCHING/reset semantics + CAUGHT_UP vs COMPLETED via aired-episode counts: Tasks 6–7.
- Reviews as first AI-gate consumer, fail-open PENDING_REVIEW: Tasks 13–14; imported reviews lazily gated: Task 21.
- Blocks-everywhere helper pattern: Task 11, consumed by follows (12) and reviews (14).
- Four Favorites as List kind, max-4 app-enforced + DB partial unique: Tasks 3, 15.
- user_stats lazy snapshot w/ COALESCE runtime fallback + source-filter for honest Wrapped: Task 16.
- Notifications write-on-event, no fan-out: Task 12. Reports: Task 23. Username claim + lower() unique: Tasks 3, 23.
- Renumbering reconcile fire-and-forget: Task 17. CSV import (Letterboxd zip incl. dateless watched.csv + date-only precision, Trakt, IMDb) + ImportJob row stats + local storage interface: Tasks 18–21. Export: Task 22.
- Deliberately NOT here (other plans): all §4.3 UI, comments read/write paths (phase 1), web push, OG cards, taste-compat.
