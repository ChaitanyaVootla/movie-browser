# Phase 3+4 (Circles, Binge Clubs, AI Second Screen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 3 (circles with invite-link acquisition loop, group decide polls with AI mediation, scheduled binge clubs with auto-created threads, Feed v2) and Phase 4 (episode-scoped AI recaps, spoiler-safe "recap to where I am" + progress-aware agent Q&A, AI recaps auto-posted into club threads) of the Social & Virality Roadmap (`docs/superpowers/specs/2026-06-12-social-virality-roadmap-design.md`).

**Architecture:** Extends the existing `Circle`/`CircleMember` models with slug/inviteCode/imageUrl + a pgvector taste centroid; adds `club_schedules`, `circle_polls`, `poll_candidates`, `poll_votes`, and `episode_ai_data` (natural keys + soft `tmdb_episode_id`, per roadmap invariant 1). All circle content rides phase-0/1 primitives: circle threads are `comments` rows with `circleId` set, the shared watchlist is a `List` with `circleId`, notifications are write-on-event bounded by circle membership (fan-out ban, invariant 6). The club scheduler is a PM2 daily cron with the CRON_HOUR_UTC deploy-guard + compare-and-swap claim for idempotency. Phase-4 recaps are generated via `callBedrockFlex` with a pure, testable input filter that physically cannot include episodes beyond the target; the LangGraph agent gains a `get_progress_context` tool + a hard system-prompt spoiler rule.

**Tech Stack:** Next.js 15 App Router (RSC + server actions, Zod), Prisma 6 / PostgreSQL 17 + pgvector, LangGraph.js agent (Kimi K2.5 via Bedrock), `callBedrockFlex` (Flex tier), PM2 cron (`ecosystem.config.cjs`), Vitest, Tailwind v4 + shadcn/ui per `DESIGN.md`.

---

## Hard constraints (carry through every task)

1. **Local-only.** No deploys, no commits to remote, no CloudFront/EC2 changes. `yarn db:push` only against the local/dev database.
2. **Fan-out ban (roadmap invariant 6).** Every notification write is bounded by *direct recipients* — here, the member list of ONE circle. Never per-follower writes.
3. **Deploy-safe scheduler.** PM2 re-runs cron apps once on every `pm2 start` (= every deploy). The club scheduler script MUST carry the `CRON_HOUR_UTC` guard (exit instantly outside its hour unless `FORCE_RUN=1`) and run under `nice -n 19` — same pattern as `scripts/sync-popularity.ts` / `ecosystem.config.cjs`.
4. **Mobile-first.** Mobile has NO top navbar; desktop navbar is exactly 64px. Use `PAGE_SHELL`, `PAGE_PADDING_X`, `SECTION_HEADING` from `src/lib/design.ts`. Follow `DESIGN.md`; run the `/frontend-design` skill mindset for all UI tasks.
5. **No `any`.** `catch (error: unknown)` + type guards. Zod at all action boundaries. Pino loggers, never `console.log` in app code (scripts may use console).
6. **Fable rule (HARD).** AI classifies/summarizes/mediates **content**; it never characterizes **users** or performs personality. The group mediator's reasons must be content-grounded ("a slow-burn thriller that sits in everyone's top genres"), never user-characterizing ("perfect for Priya, the horror nerd"). Recaps/Q&A never reveal beyond the reader's watermark.
7. **Roadmap invariant 1.** Never FK user/AI data onto `episodes`/`seasons` rows (hydration delete+reinserts them). `episode_ai_data` uses natural keys `(series_id, season_number, episode_number)` + soft `tmdb_episode_id`. FK to `series` is OK (parent rows are stable — same as `series_progress`).
8. **Every FK column gets an index** (invariant 3). Raw-SQL CHECKs go in `postgres/init/04-ugc-constraints.sql` (phase-0 deliverable, hash-gated on deploy).

## Earlier-phase deliverables this plan builds on (reference by name)

These ship in phases 0–2 (same roadmap doc). If a named item does not exist yet when a task runs, STOP and implement the minimal version with the exact signature below first (do not redesign it).

| Deliverable | Phase | What this plan uses |
|---|---|---|
| `WatchEvent`, `SeriesProgress`, `Comment`, `Reaction`, `List`, `ListItem`, `Notification`, `Report`, `Block`, `UserReview` Prisma models + enums (`SpoilerScope`, `CommentStatus`, `NotificationType`, `ListKind`) | 0 | `series_progress.maxSeasonNumber/maxEpisodeNumber` watermark; `comments.circleId/seriesId/seasonNumber/episodeNumber`; `lists.circleId`; `notifications` write-on-event |
| `postgres/init/04-ugc-constraints.sql` + hash-gated deploy apply step | 0 | New CHECKs appended here |
| `src/server/services/comments/comment-service.ts` — `createComment(input): Promise<Comment>`, `publicComments` where-helper (bakes in `circleId: null, status: PUBLISHED`) | 1 | Circle threads reuse creation/moderation; public read paths stay circle-free |
| `src/server/services/notifications/notification-service.ts` — `notifyUsers(recipientIds: number[], type: NotificationType, actorId: number \| null, payload: Prisma.InputJsonValue): Promise<void>` (single `createMany`, filters blocks, optional web-push fire-and-forget) | 0/1 | All circle/club/poll notifications |
| `src/server/services/progress/spoiler-gate.ts` — `getSpoilerWatermark(userId, seriesId): Promise<{ season: number; episode: number } | "COMPLETED" | null>` | 1 | Recap chain + agent tool read the watermark |
| `CommentThread` component (`src/components/features/comments/comment-thread.tsx`) accepting anchor props incl. `circleId` | 1 | Circle chat + club episode threads UI |
| `src/server/services/lists/list-service.ts` — `createList`, `addListItem`, `ListView` component | 2 | Circle shared watchlist |
| `src/server/services/feed/feed-service.ts` — `getFeed(userId, cursor?): Promise<{ cards: FeedCard[]; nextCursor: string | null }>` with a `FeedCard` discriminated union + card renderer registry | 2 | Feed v2 extends the union + fan-in |
| `src/server/services/social/taste-embedding.ts` — `getUserTasteEmbedding(userId): Promise<number[] | null>` (1024-dim centroid of the user's liked/watched title embeddings; built for the phase-2 compatibility module) | 2 | Circle discovery similarity + circle centroid refresh |
| Web push plumbing (`sendWebPush`) | 1 | Used transitively via `notifyUsers`; nothing here calls it directly |

Existing (already in repo, verified): `Circle`/`CircleMember`/`CircleRole`, `callBedrockFlex` (`src/server/services/enrichment/bedrock-flex.ts`), LangGraph agent + tools (`src/server/ai/`), `trackAIUsage` (`src/lib/analytics/track.ts`), `prisma` client (`src/server/db/postgres`), PM2 cron-guard pattern (`ecosystem.config.cjs`), Vitest (`yarn test:unit`), pgvector embeddings on `movies`/`series`.

---

## File Structure

```
prisma/schema.prisma                                   # MODIFY: Circle ext, ClubSchedule, CirclePoll, PollCandidate, PollVote, EpisodeAiData, enums
postgres/init/04-ugc-constraints.sql                   # MODIFY: append phase-3 CHECKs
src/server/services/circles/
  invite-code.ts                                       # pure: code generation + slug
  circle-service.ts                                    # CRUD, membership, roles, invite join, member activity fan-in
  poll-tally.ts                                        # pure: IRV tally + swipe match
  poll-service.ts                                      # candidate pool, create/vote/close
  ai-mediator.ts                                       # Bedrock group picks (Fable rule)
  club-advance.ts                                      # pure: advancePosition, computeNextOpenAt
  club-service.ts                                      # club CRUD, tick (CAS), nudges
  club-ics.ts                                          # pure: ICS builder
  circle-embedding.ts                                  # circle taste centroid refresh + discovery query
src/server/actions/circles.ts                          # circle CRUD/membership actions
src/server/actions/polls.ts                            # poll actions
src/server/actions/clubs.ts                            # club actions
src/server/actions/recaps.ts                           # phase 4: recap-to-here action
src/server/services/feed/circle-cards.ts               # Feed v2 sources (NEW)
src/server/services/feed/feed-service.ts               # MODIFY: interleave circle cards
src/server/services/enrichment/episode-recap.ts        # phase 4: recap input filter + generation + chain
src/server/ai/tools/progress-context.ts                # phase 4: get_progress_context tool
src/server/ai/tools/index.ts                           # MODIFY: register tool (12 tools)
src/server/ai/prompts/system.ts                        # MODIFY: spoiler-safety hard rule
scripts/club-scheduler.ts                              # PM2 daily tick (guarded)
ecosystem.config.cjs                                   # MODIFY: club-scheduler app
src/app/circles/page.tsx                               # my circles + discover
src/app/circles/[slug]/page.tsx                        # circle home (tabs)
src/app/c/join/[code]/page.tsx                         # invite join flow (acquisition loop)
src/app/api/circles/[slug]/clubs/[clubId]/calendar/route.ts  # ICS export
src/components/features/circles/                       # create-circle-dialog, member-list, circle-tabs,
                                                       # poll-create-form, ranked-ballot, swipe-deck, mediator-picks,
                                                       # create-club-form, club-card, club-progress, join-circle-card
src/components/features/feed/circle-feed-cards.tsx     # Feed v2 card renderers
src/components/features/series/recap-panel.tsx         # phase 4 series-page panel
Tests:
src/server/services/circles/invite-code.test.ts
src/server/services/circles/poll-tally.test.ts
src/server/services/circles/club-advance.test.ts
src/server/services/circles/club-service.test.ts        # tick idempotency (mocked prisma)
src/server/services/circles/club-ics.test.ts
src/server/services/enrichment/episode-recap.test.ts    # watermark input filter
src/server/ai/tools/progress-context.test.ts            # tool contract
```

Work on a branch: `git checkout -b phase3-4-circles-clubs-ai` (from `next`). Commit after every task; do NOT push (local-only).

---

# PHASE 3 — Circles, Group Decide, Binge Clubs, Feed v2

### Task 1: Schema — circle extension, clubs, polls, episode AI data, constraints

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `postgres/init/04-ugc-constraints.sql`

- [ ] **Step 1: Extend the `Circle` model and add relations**

Replace the existing `Circle` model in `prisma/schema.prisma` with:

```prisma
model Circle {
  id          Int      @id @default(autoincrement())
  ownerId     Int      @map("owner_id")
  name        String
  slug        String   @unique
  inviteCode  String   @unique @map("invite_code") // shareable join links — the acquisition loop
  imageUrl    String?  @map("image_url") // TMDB poster/backdrop path (zero storage, zero upload moderation)
  description String?
  isPublic    Boolean  @default(false) @map("is_public") // private by default; public = discoverable

  // Taste centroid (avg of member taste + circle list items), refreshed by the
  // club-scheduler daily tick. Drives Feed v2 "circles you'd fit" discovery.
  embedding Unsupported("vector(1024)")?

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  owner     User           @relation("circleOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  members   CircleMember[]
  schedules ClubSchedule[]
  polls     CirclePoll[]

  @@index([ownerId])
  @@index([isPublic])
  @@map("circles")
}
```

Backfill note: if any `circles` rows exist locally, `db push` will fail on the new required uniques. Check first (`SELECT count(*) FROM circles;`); if rows exist, backfill `slug`/`invite_code` with raw SQL before push (slug = `'circle-' || id`, invite_code = `md5(random()::text)`), otherwise proceed (table is empty in practice — the feature never shipped UI).

- [ ] **Step 2: Add club + poll models and enums**

Add to `prisma/schema.prisma` (SOCIAL MODELS section):

```prisma
// Binge club: a circle watches a series on a cadence. One club per (circle, series).
model ClubSchedule {
  id                  Int         @id @default(autoincrement())
  circleId            Int         @map("circle_id")
  seriesId            Int         @map("series_id")
  cadence             ClubCadence
  intervalDays        Int         @default(7) @map("interval_days") // DAILY=1, WEEKLY=7, CUSTOM=n (denormalized for all)
  episodesPerInterval Int         @default(1) @map("episodes_per_interval")
  // Position = last OPENED episode (0 = not started). Natural keys, invariant 1.
  currentSeason       Int         @default(1) @map("current_season")
  currentEpisode      Int         @default(0) @map("current_episode")
  nextOpenAt          DateTime    @map("next_open_at")
  status              ClubStatus  @default(ACTIVE)
  createdById         Int?        @map("created_by_id")
  createdAt           DateTime    @default(now()) @map("created_at")
  updatedAt           DateTime    @updatedAt @map("updated_at")

  circle    Circle  @relation(fields: [circleId], references: [id], onDelete: Cascade)
  series    Series  @relation(fields: [seriesId], references: [id], onDelete: Restrict) // catalog delete = deliberate (invariant 4)
  createdBy User?   @relation("clubCreator", fields: [createdById], references: [id], onDelete: SetNull)

  @@unique([circleId, seriesId])
  @@index([status, nextOpenAt]) // scheduler due-scan
  @@index([seriesId])
  @@index([createdById])
  @@map("club_schedules")
}

// Group-decide poll over a candidate pool.
model CirclePoll {
  id          Int        @id @default(autoincrement())
  circleId    Int        @map("circle_id")
  createdById Int?       @map("created_by_id")
  mode        PollMode
  status      PollStatus @default(OPEN)
  title       String
  filters     Json?      // { genres?: string[], mediaType?: "movie"|"series", maxRuntime?: number }
  result      Json?      // tally output written on close: { winnerCandidateId?, rounds?, matches? }
  closesAt    DateTime?  @map("closes_at")
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  circle     Circle          @relation(fields: [circleId], references: [id], onDelete: Cascade)
  createdBy  User?           @relation("pollCreator", fields: [createdById], references: [id], onDelete: SetNull)
  candidates PollCandidate[]
  votes      PollVote[]

  @@index([circleId, status])
  @@index([createdById])
  @@map("circle_polls")
}

model PollCandidate {
  id       Int  @id @default(autoincrement())
  pollId   Int  @map("poll_id")
  movieId  Int? @map("movie_id")
  seriesId Int? @map("series_id")
  // How many members had it watchlisted at poll creation (display only)
  overlapCount Int @default(1) @map("overlap_count")

  poll   CirclePoll @relation(fields: [pollId], references: [id], onDelete: Cascade)
  movie  Movie?     @relation(fields: [movieId], references: [id], onDelete: Restrict)
  series Series?    @relation(fields: [seriesId], references: [id], onDelete: Restrict)
  votes  PollVote[]

  @@unique([pollId, movieId])
  @@unique([pollId, seriesId])
  @@index([movieId])
  @@index([seriesId])
  @@map("poll_candidates")
}

model PollVote {
  id          Int      @id @default(autoincrement())
  pollId      Int      @map("poll_id")
  candidateId Int      @map("candidate_id")
  userId      Int      @map("user_id")
  rank        Int?     // RANKED mode: 1 = first choice
  approve     Boolean? // SWIPE mode: yes/no
  createdAt   DateTime @default(now()) @map("created_at")

  poll      CirclePoll    @relation(fields: [pollId], references: [id], onDelete: Cascade)
  candidate PollCandidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([pollId, candidateId, userId])
  @@index([pollId, userId])
  @@index([candidateId])
  @@index([userId])
  @@map("poll_votes")
}

enum ClubCadence {
  DAILY
  WEEKLY
  CUSTOM
}

enum ClubStatus {
  ACTIVE
  PAUSED
  COMPLETED
}

enum PollMode {
  RANKED
  SWIPE
}

enum PollStatus {
  OPEN
  CLOSED
}
```

- [ ] **Step 3: Add `EpisodeAiData` (phase 4 table — same migration, one push)**

```prisma
// Per-episode AI recap. Natural keys + soft tmdb ref (roadmap invariant 1:
// NEVER FK onto episodes/seasons — hydration delete+reinserts them).
// FK to series is OK (parent rows stable; series_progress precedent).
model EpisodeAiData {
  id            Int       @id @default(autoincrement())
  seriesId      Int       @map("series_id")
  seasonNumber  Int       @map("season_number")
  episodeNumber Int       @map("episode_number")
  tmdbEpisodeId Int?      @map("tmdb_episode_id") // soft ref, NO relation — renumber reconcile
  recap         String?   @db.Text // spoiler-bounded: built ONLY from inputs <= this episode
  version       Int       @default(1)
  generatedAt   DateTime? @map("generated_at")
  modelId       String?   @map("model_id")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  series Series @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@unique([seriesId, seasonNumber, episodeNumber])
  @@index([seriesId, tmdbEpisodeId]) // reconcile pass
  @@map("episode_ai_data")
}
```

- [ ] **Step 4: Wire back-relations**

Add to `Series`: `clubSchedules ClubSchedule[]`, `pollCandidates PollCandidate[]`, `episodeAiData EpisodeAiData[]`.
Add to `Movie`: `pollCandidates PollCandidate[]`.
Add to `User`: `clubsCreated ClubSchedule[] @relation("clubCreator")`, `pollsCreated CirclePoll[] @relation("pollCreator")`, `pollVotes PollVote[]`.
Extend the phase-0 `NotificationType` enum with (keep existing values): `CIRCLE_JOIN`, `POLL_OPEN`, `POLL_RESULT`, `CLUB_NUDGE` (`CIRCLE_INVITE` and `CLUB_EPISODE_OPEN` are already enumerated in phase 0).
The phase-0 `Comment.circleId` and `List.circleId` columns get real relations now: add `circle Circle? @relation(fields: [circleId], references: [id], onDelete: Cascade)` to both, and `comments Comment[]` / `lists List[]` to `Circle`. Rationale: typed-anchor invariant 7 wants real FKs; circle deletion is a deliberate owner action that removes the circle's private threads/lists (this is group semantics, not a catalog-delete UGC purge).

- [ ] **Step 5: Append raw-SQL CHECKs**

Append to `postgres/init/04-ugc-constraints.sql` (idempotent style, matching the file's existing pattern):

```sql
-- ============================================================================
-- Phase 3: circles, clubs, polls (2026-06)
-- ============================================================================

-- Poll candidates: exactly one catalog anchor
ALTER TABLE poll_candidates DROP CONSTRAINT IF EXISTS poll_candidates_one_anchor;
ALTER TABLE poll_candidates ADD CONSTRAINT poll_candidates_one_anchor
  CHECK (num_nonnulls(movie_id, series_id) = 1);

-- Poll votes: exactly one of rank/approve (mode-specific value)
ALTER TABLE poll_votes DROP CONSTRAINT IF EXISTS poll_votes_one_value;
ALTER TABLE poll_votes ADD CONSTRAINT poll_votes_one_value
  CHECK (num_nonnulls(rank, approve) = 1);
ALTER TABLE poll_votes DROP CONSTRAINT IF EXISTS poll_votes_rank_positive;
ALTER TABLE poll_votes ADD CONSTRAINT poll_votes_rank_positive
  CHECK (rank IS NULL OR rank >= 1);

-- Club schedules: sane position/cadence values
ALTER TABLE club_schedules DROP CONSTRAINT IF EXISTS club_schedules_sane_values;
ALTER TABLE club_schedules ADD CONSTRAINT club_schedules_sane_values
  CHECK (current_season >= 0 AND current_episode >= 0
         AND episodes_per_interval >= 1 AND interval_days >= 1);

-- Circle slugs: lowercase kebab only (route safety)
ALTER TABLE circles DROP CONSTRAINT IF EXISTS circles_slug_format;
ALTER TABLE circles ADD CONSTRAINT circles_slug_format
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
```

- [ ] **Step 6: Push and verify constraints survive**

Run: `yarn db:push`
Expected: success, new tables created.
Then apply the SQL file to the local DB (psql or `prisma db execute --file postgres/init/04-ugc-constraints.sql`) and verify:
`SELECT conname FROM pg_constraint WHERE conname LIKE 'poll_%' OR conname LIKE 'club_%' OR conname LIKE 'circles_slug%';`
Expected: all 5 constraints listed.
Run: `yarn typecheck` — expected PASS (regenerated client).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma postgres/init/04-ugc-constraints.sql
git commit -m "feat(phase3): circle ext + club_schedules + polls + episode_ai_data schema"
```

---

### Task 2: Invite codes + slugs (pure helpers, TDD)

**Files:**
- Create: `src/server/services/circles/invite-code.ts`
- Test: `src/server/services/circles/invite-code.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/server/services/circles/invite-code.test.ts
import { describe, it, expect } from "vitest";
import { generateInviteCode, slugifyCircleName, INVITE_CODE_LENGTH } from "./invite-code";

describe("generateInviteCode", () => {
  it("generates codes of the configured length from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      // No 0/O/1/l/I — codes get read aloud and retyped
      expect(code).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    }
  });

  it("generates unique codes", () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateInviteCode()));
    expect(codes.size).toBe(1000);
  });
});

describe("slugifyCircleName", () => {
  it("kebab-cases and strips non-alphanumerics", () => {
    expect(slugifyCircleName("Friday Night Crew!")).toBe("friday-night-crew");
    expect(slugifyCircleName("  The   Bingers  ")).toBe("the-bingers");
  });

  it("falls back when nothing survives", () => {
    expect(slugifyCircleName("🍿🍿🍿")).toBe("circle");
  });

  it("truncates to 48 chars without trailing hyphen", () => {
    const slug = slugifyCircleName("a".repeat(40) + " " + "b".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:unit src/server/services/circles/invite-code.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/server/services/circles/invite-code.ts
/**
 * Invite codes + circle slugs.
 *
 * The invite code IS the capability: a 12-char random string over a 56-char
 * alphabet is ~69 bits — unguessable. The "signed short URL" is simply
 * /c/join/<code>; rotating the code revokes every previously shared link.
 */
import { randomBytes } from "crypto";

export const INVITE_CODE_LENGTH = 12;

// Unambiguous base-56: no 0/O, 1/l/I
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateInviteCode(length: number = INVITE_CODE_LENGTH): string {
  const out: string[] = [];
  while (out.length < length) {
    const bytes = randomBytes(length * 2);
    for (const b of bytes) {
      // Rejection sampling to avoid modulo bias
      if (b < Math.floor(256 / ALPHABET.length) * ALPHABET.length) {
        out.push(ALPHABET[b % ALPHABET.length]);
        if (out.length === length) break;
      }
    }
  }
  return out.join("");
}

export function slugifyCircleName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "circle";
}

/** /c/join/<code> — short, unfurl-friendly, embeddable in WhatsApp/Telegram. */
export function inviteUrlPath(inviteCode: string): string {
  return `/c/join/${inviteCode}`;
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test:unit src/server/services/circles/invite-code.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/circles/invite-code.ts src/server/services/circles/invite-code.test.ts
git commit -m "feat(phase3): invite code + circle slug helpers"
```

---

### Task 3: Circle service — CRUD, membership, roles, join flow, member activity

**Files:**
- Create: `src/server/services/circles/circle-service.ts`

This is a DB-facing service; its logic is exercised through the invite-flow action test in Task 4 and typecheck here.

- [ ] **Step 1: Implement the service**

```typescript
// src/server/services/circles/circle-service.ts
/**
 * Circle CRUD + membership.
 *
 * Privacy model: private by default. Public circles are discoverable (Feed v2)
 * but still join-by-invite OR join-directly when public.
 * Roles: OWNER > ADMIN > MEMBER (CircleRole enum, phase-0 schema).
 * All notification writes are bounded by ONE circle's member list (fan-out ban).
 */
import { CircleRole, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { generateInviteCode, slugifyCircleName } from "./invite-code";
import { notifyUsers } from "@/server/services/notifications/notification-service";

const ROLE_RANK: Record<CircleRole, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };

export class CircleAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircleAccessError";
  }
}

export interface CircleSummary {
  id: number;
  name: string;
  slug: string;
  imageUrl: string | null;
  description: string | null;
  isPublic: boolean;
  memberCount: number;
  role: CircleRole | null; // null = viewer is not a member
  inviteCode: string | null; // only exposed to ADMIN+
}

export async function requireMembership(
  userId: number,
  circleId: number,
  minRole: CircleRole = CircleRole.MEMBER
): Promise<CircleRole> {
  const member = await prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId, userId } },
    select: { role: true },
  });
  if (!member || ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
    throw new CircleAccessError(`Requires ${minRole} of circle ${circleId}`);
  }
  return member.role;
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugifyCircleName(name);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const exists = await prisma.circle.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${base}-${generateInviteCode(4).toLowerCase()}`;
}

export async function createCircle(input: {
  ownerId: number;
  name: string;
  description?: string;
  isPublic?: boolean;
  imageUrl?: string; // TMDB path picked in the create dialog
}): Promise<CircleSummary> {
  const slug = await uniqueSlug(input.name);
  const circle = await prisma.$transaction(async (tx) => {
    const created = await tx.circle.create({
      data: {
        ownerId: input.ownerId,
        name: input.name,
        slug,
        inviteCode: generateInviteCode(),
        description: input.description ?? null,
        isPublic: input.isPublic ?? false,
        imageUrl: input.imageUrl ?? null,
      },
    });
    await tx.circleMember.create({
      data: { circleId: created.id, userId: input.ownerId, role: CircleRole.OWNER },
    });
    return created;
  });
  return {
    id: circle.id,
    name: circle.name,
    slug: circle.slug,
    imageUrl: circle.imageUrl,
    description: circle.description,
    isPublic: circle.isPublic,
    memberCount: 1,
    role: CircleRole.OWNER,
    inviteCode: circle.inviteCode,
  };
}

export async function getCircleBySlug(slug: string, viewerId: number | null): Promise<CircleSummary | null> {
  const circle = await prisma.circle.findUnique({
    where: { slug },
    include: { _count: { select: { members: true } } },
  });
  if (!circle) return null;
  const membership = viewerId
    ? await prisma.circleMember.findUnique({
        where: { circleId_userId: { circleId: circle.id, userId: viewerId } },
        select: { role: true },
      })
    : null;
  const role = membership?.role ?? null;
  if (!circle.isPublic && role === null) return null; // private circles are invisible to non-members
  const isAdmin = role !== null && ROLE_RANK[role] >= ROLE_RANK[CircleRole.ADMIN];
  return {
    id: circle.id,
    name: circle.name,
    slug: circle.slug,
    imageUrl: circle.imageUrl,
    description: circle.description,
    isPublic: circle.isPublic,
    memberCount: circle._count.members,
    role,
    inviteCode: isAdmin ? circle.inviteCode : null,
  };
}

/** Invite preview is intentionally visible WITHOUT auth — it is the acquisition hook. */
export async function getCircleByInviteCode(code: string): Promise<{
  id: number; name: string; slug: string; imageUrl: string | null;
  description: string | null; memberCount: number; ownerName: string | null;
} | null> {
  const circle = await prisma.circle.findUnique({
    where: { inviteCode: code },
    include: { _count: { select: { members: true } }, owner: { select: { name: true } } },
  });
  if (!circle) return null;
  return {
    id: circle.id,
    name: circle.name,
    slug: circle.slug,
    imageUrl: circle.imageUrl,
    description: circle.description,
    memberCount: circle._count.members,
    ownerName: circle.owner.name,
  };
}

const MAX_CIRCLE_MEMBERS = 50; // bounds every per-member loop in this plan (notifications, polls, dashboards)

export async function joinByInviteCode(userId: number, code: string): Promise<{ slug: string } > {
  const circle = await prisma.circle.findUnique({
    where: { inviteCode: code },
    select: { id: true, slug: true, ownerId: true, _count: { select: { members: true } } },
  });
  if (!circle) throw new CircleAccessError("Invalid or rotated invite link");
  if (circle._count.members >= MAX_CIRCLE_MEMBERS) throw new CircleAccessError("Circle is full");
  try {
    await prisma.circleMember.create({ data: { circleId: circle.id, userId } });
  } catch (error: unknown) {
    const isPrismaError = (e: unknown): e is { code: string } =>
      typeof e === "object" && e !== null && "code" in e;
    if (isPrismaError(error) && error.code === "P2002") {
      return { slug: circle.slug }; // already a member — idempotent join
    }
    throw error;
  }
  // Bounded notification: exactly one recipient (the owner). Invariant 6 holds.
  await notifyUsers([circle.ownerId], "CIRCLE_JOIN", userId, { circleId: circle.id, circleSlug: circle.slug });
  dataLogger.info({ event: "circle_join", circleId: circle.id, userId });
  return { slug: circle.slug };
}

export async function leaveCircle(userId: number, circleId: number): Promise<void> {
  const role = await requireMembership(userId, circleId);
  if (role === CircleRole.OWNER) {
    throw new CircleAccessError("Owner must transfer ownership or delete the circle");
  }
  await prisma.circleMember.delete({ where: { circleId_userId: { circleId, userId } } });
}

export async function kickMember(actorId: number, circleId: number, targetUserId: number): Promise<void> {
  await requireMembership(actorId, circleId, CircleRole.ADMIN);
  const target = await prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId, userId: targetUserId } },
    select: { role: true },
  });
  if (!target) return;
  if (target.role === CircleRole.OWNER) throw new CircleAccessError("Cannot remove the owner");
  await prisma.circleMember.delete({ where: { circleId_userId: { circleId, userId: targetUserId } } });
}

export async function setMemberRole(
  actorId: number, circleId: number, targetUserId: number, role: Extract<CircleRole, "ADMIN" | "MEMBER">
): Promise<void> {
  await requireMembership(actorId, circleId, CircleRole.OWNER);
  if (targetUserId === actorId) throw new CircleAccessError("Owner role is fixed; transfer not supported here");
  await prisma.circleMember.update({
    where: { circleId_userId: { circleId, userId: targetUserId } },
    data: { role },
  });
}

export async function rotateInviteCode(actorId: number, circleId: number): Promise<string> {
  await requireMembership(actorId, circleId, CircleRole.ADMIN);
  const code = generateInviteCode();
  await prisma.circle.update({ where: { id: circleId }, data: { inviteCode: code } });
  return code;
}

export async function listMyCircles(userId: number): Promise<CircleSummary[]> {
  const memberships = await prisma.circleMember.findMany({
    where: { userId },
    include: { circle: { include: { _count: { select: { members: true } } } } },
    orderBy: { joinedAt: "desc" },
  });
  return memberships.map((m) => ({
    id: m.circle.id,
    name: m.circle.name,
    slug: m.circle.slug,
    imageUrl: m.circle.imageUrl,
    description: m.circle.description,
    isPublic: m.circle.isPublic,
    memberCount: m.circle._count.members,
    role: m.role,
    inviteCode: ROLE_RANK[m.role] >= ROLE_RANK[CircleRole.ADMIN] ? m.circle.inviteCode : null,
  }));
}

export async function getMembers(circleId: number, viewerId: number): Promise<Array<{
  userId: number; name: string | null; username: string | null; image: string | null;
  role: CircleRole; joinedAt: Date;
}>> {
  await requireMembership(viewerId, circleId);
  const members = await prisma.circleMember.findMany({
    where: { circleId },
    include: { user: { select: { name: true, username: true, image: true } } },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });
  return members.map((m) => ({
    userId: m.userId, name: m.user.name, username: m.user.username,
    image: m.user.image, role: m.role, joinedAt: m.joinedAt,
  }));
}

/**
 * Member activity — QUERY-TIME FAN-IN (no activity rows are ever written).
 * One indexed query per source over the bounded member-id list.
 */
export interface CircleActivityItem {
  kind: "watch" | "review";
  userId: number;
  userName: string | null;
  title: string;
  mediaType: "movie" | "series";
  mediaId: number;
  at: Date;
}

export async function getMemberActivity(circleId: number, viewerId: number, limit = 30): Promise<CircleActivityItem[]> {
  await requireMembership(viewerId, circleId);
  const memberIds = (
    await prisma.circleMember.findMany({ where: { circleId }, select: { userId: true } })
  ).map((m) => m.userId);

  const [events, reviews] = await Promise.all([
    prisma.watchEvent.findMany({
      where: { userId: { in: memberIds }, isPrivate: false },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { name: true } },
        movie: { select: { id: true, title: true } },
        series: { select: { id: true, name: true } },
      },
    }),
    prisma.userReview.findMany({
      where: { userId: { in: memberIds }, isPrivate: false, status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { name: true } },
        movie: { select: { id: true, title: true } },
        series: { select: { id: true, name: true } },
      },
    }),
  ]);

  const items: CircleActivityItem[] = [
    ...events.map((e): CircleActivityItem => ({
      kind: "watch",
      userId: e.userId,
      userName: e.user?.name ?? null,
      title: e.movie?.title ?? e.series?.name ?? "Unknown",
      mediaType: e.movieId ? "movie" : "series",
      mediaId: e.movieId ?? e.seriesId ?? 0,
      at: e.createdAt,
    })),
    ...reviews
      .filter((r) => r.userId !== null)
      .map((r): CircleActivityItem => ({
        kind: "review",
        userId: r.userId as number,
        userName: r.user?.name ?? null,
        title: r.movie?.title ?? r.series?.name ?? "Unknown",
        mediaType: r.movieId ? "movie" : "series",
        mediaId: r.movieId ?? r.seriesId ?? 0,
        at: r.createdAt,
      })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** Get or lazily create the circle's shared watchlist (a List with circleId — phase-2 lists). */
export async function getOrCreateCircleWatchlist(circleId: number, viewerId: number): Promise<number> {
  await requireMembership(viewerId, circleId);
  const existing = await prisma.list.findFirst({
    where: { circleId, kind: "REGULAR" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const circle = await prisma.circle.findUniqueOrThrow({ where: { id: circleId }, select: { ownerId: true, slug: true } });
  const created = await prisma.list.create({
    data: {
      ownerId: circle.ownerId,
      circleId,
      name: "Circle watchlist",
      slug: `${circle.slug}-watchlist`,
      isCollaborative: true,
      isPublic: false,
    },
    select: { id: true },
  });
  return created.id;
}

/** Circle chat = comments with circleId and NO media anchor (phase-0 CHECK allows circle-only rows). */
export const circleChatWhere = (circleId: number): Prisma.CommentWhereInput => ({
  circleId,
  movieId: null,
  seriesId: null,
  listId: null,
  status: "PUBLISHED",
});
```

- [ ] **Step 2: Typecheck**

Run: `yarn typecheck`
Expected: PASS. (If `notifyUsers` / `userReview` / `watchEvent` / `list` are missing, the earlier-phase deliverable is absent — implement the minimal named version per the prerequisites table before continuing.)

- [ ] **Step 3: Commit**

```bash
git add src/server/services/circles/circle-service.ts
git commit -m "feat(phase3): circle service - CRUD, membership, roles, invite join, activity fan-in"
```

---

### Task 4: Circle server actions + invite-code flow test

**Files:**
- Create: `src/server/actions/circles.ts`
- Test: `src/server/services/circles/circle-join.test.ts`

- [ ] **Step 1: Write the failing invite-flow test (mocked prisma + notifications)**

```typescript
// src/server/services/circles/circle-join.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  circle: { findUnique: vi.fn() },
  circleMember: { create: vi.fn() },
};
vi.mock("@/server/db/postgres", () => ({ prisma: mockPrisma }));

const notifyUsers = vi.fn();
vi.mock("@/server/services/notifications/notification-service", () => ({
  notifyUsers: (...args: unknown[]) => notifyUsers(...args),
}));

import { joinByInviteCode, CircleAccessError } from "./circle-service";

const CIRCLE = { id: 7, slug: "friday-crew", ownerId: 1, _count: { members: 3 } };

describe("joinByInviteCode (the acquisition loop)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.circle.findUnique.mockResolvedValue(CIRCLE);
    mockPrisma.circleMember.create.mockResolvedValue({});
  });

  it("creates membership and notifies ONLY the owner (fan-out ban)", async () => {
    const result = await joinByInviteCode(42, "AbCdEfGh2345");
    expect(result.slug).toBe("friday-crew");
    expect(mockPrisma.circleMember.create).toHaveBeenCalledWith({
      data: { circleId: 7, userId: 42 },
    });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifyUsers.mock.calls[0][0]).toEqual([1]); // exactly one recipient
  });

  it("is idempotent — duplicate join (P2002) returns the slug, no notification", async () => {
    mockPrisma.circleMember.create.mockRejectedValue({ code: "P2002" });
    const result = await joinByInviteCode(42, "AbCdEfGh2345");
    expect(result.slug).toBe("friday-crew");
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("rejects invalid/rotated codes", async () => {
    mockPrisma.circle.findUnique.mockResolvedValue(null);
    await expect(joinByInviteCode(42, "nope")).rejects.toThrow(CircleAccessError);
  });

  it("rejects when the circle is full", async () => {
    mockPrisma.circle.findUnique.mockResolvedValue({ ...CIRCLE, _count: { members: 50 } });
    await expect(joinByInviteCode(42, "AbCdEfGh2345")).rejects.toThrow("full");
  });
});
```

- [ ] **Step 2: Run to verify it fails or passes against Task 3 code**

Run: `yarn test:unit src/server/services/circles/circle-join.test.ts`
Expected: PASS if Task 3 is implemented exactly as written (the test pins the contract). If FAIL, fix `circle-service.ts` to match — the test is the spec.

- [ ] **Step 3: Implement server actions**

```typescript
// src/server/actions/circles.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { dataLogger } from "@/lib/logger";
import {
  createCircle, joinByInviteCode, leaveCircle, kickMember, setMemberRole,
  rotateInviteCode, CircleAccessError,
} from "@/server/services/circles/circle-service";

// NOTE: confirm the session userId accessor against an existing authed action
// (e.g. how watchlist actions resolve the numeric user id) and reuse it.
async function requireUserId(): Promise<number> {
  const session = await auth();
  const id = session?.user?.id ? parseInt(String(session.user.id), 10) : NaN;
  if (!Number.isFinite(id)) throw new Error("UNAUTHENTICATED");
  return id;
}

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toError(error: unknown): string {
  if (error instanceof CircleAccessError) return error.message;
  if (error instanceof Error && error.message === "UNAUTHENTICATED") return "Sign in to continue";
  return "Something went wrong";
}

const CreateCircleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  isPublic: z.boolean().default(false),
  imageUrl: z.string().max(200).regex(/^\/[A-Za-z0-9._-]+$/, "TMDB path only").optional(),
});

export async function createCircleAction(
  input: z.infer<typeof CreateCircleSchema>
): Promise<ActionResult<{ slug: string }>> {
  try {
    const userId = await requireUserId();
    const validated = CreateCircleSchema.parse(input);
    const circle = await createCircle({ ownerId: userId, ...validated });
    revalidatePath("/circles");
    return { ok: true, data: { slug: circle.slug } };
  } catch (error: unknown) {
    dataLogger.error({ action: "createCircle", error: error instanceof Error ? error.message : String(error) });
    return { ok: false, error: toError(error) };
  }
}

const JoinSchema = z.object({ code: z.string().min(8).max(16) });

export async function joinCircleAction(input: z.infer<typeof JoinSchema>): Promise<ActionResult<{ slug: string }>> {
  try {
    const userId = await requireUserId();
    const { code } = JoinSchema.parse(input);
    const result = await joinByInviteCode(userId, code);
    revalidatePath(`/circles/${result.slug}`);
    return { ok: true, data: result };
  } catch (error: unknown) {
    return { ok: false, error: toError(error) };
  }
}

const CircleIdSchema = z.object({ circleId: z.number().int().positive() });

export async function leaveCircleAction(input: z.infer<typeof CircleIdSchema>): Promise<ActionResult<null>> {
  try {
    const userId = await requireUserId();
    const { circleId } = CircleIdSchema.parse(input);
    await leaveCircle(userId, circleId);
    revalidatePath("/circles");
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, error: toError(error) };
  }
}

const KickSchema = CircleIdSchema.extend({ targetUserId: z.number().int().positive() });

export async function kickMemberAction(input: z.infer<typeof KickSchema>): Promise<ActionResult<null>> {
  try {
    const userId = await requireUserId();
    const { circleId, targetUserId } = KickSchema.parse(input);
    await kickMember(userId, circleId, targetUserId);
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, error: toError(error) };
  }
}

const RoleSchema = KickSchema.extend({ role: z.enum(["ADMIN", "MEMBER"]) });

export async function setMemberRoleAction(input: z.infer<typeof RoleSchema>): Promise<ActionResult<null>> {
  try {
    const userId = await requireUserId();
    const { circleId, targetUserId, role } = RoleSchema.parse(input);
    await setMemberRole(userId, circleId, targetUserId, role);
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, error: toError(error) };
  }
}

export async function rotateInviteCodeAction(input: z.infer<typeof CircleIdSchema>): Promise<ActionResult<{ code: string }>> {
  try {
    const userId = await requireUserId();
    const { circleId } = CircleIdSchema.parse(input);
    const code = await rotateInviteCode(userId, circleId);
    return { ok: true, data: { code } };
  } catch (error: unknown) {
    return { ok: false, error: toError(error) };
  }
}
```

- [ ] **Step 4: Typecheck + run circle tests**

Run: `yarn typecheck && yarn test:unit src/server/services/circles/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/circles.ts src/server/services/circles/circle-join.test.ts
git commit -m "feat(phase3): circle server actions + invite-flow contract tests"
```

---

### Task 5: Circle routes + UI (my circles, circle home, join page)

**Files:**
- Create: `src/app/circles/page.tsx`
- Create: `src/app/circles/[slug]/page.tsx`
- Create: `src/app/c/join/[code]/page.tsx`
- Create: `src/components/features/circles/create-circle-dialog.tsx`
- Create: `src/components/features/circles/circle-tabs.tsx`
- Create: `src/components/features/circles/member-list.tsx`
- Create: `src/components/features/circles/join-circle-card.tsx`
- Create: `src/components/features/circles/invite-share-button.tsx`

UI rules: mobile-first, `PAGE_SHELL`/`PAGE_PADDING_X`/`SECTION_HEADING` from `@/lib/design`, shadcn/ui primitives, TMDB imagery via the existing image components (find the poster/backdrop `Image` wrapper used by `media-scroller.tsx` and reuse it). Apply the `/frontend-design` skill for polish; the code below is the functional contract.

- [ ] **Step 1: My-circles page**

```tsx
// src/app/circles/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PAGE_SHELL, PAGE_PADDING_X, SECTION_HEADING } from "@/lib/design";
import { listMyCircles } from "@/server/services/circles/circle-service";
import { CreateCircleDialog } from "@/components/features/circles/create-circle-dialog";
import Link from "next/link";

export const metadata = { title: "Your Circles" };

export default async function CirclesPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin?callbackUrl=/circles");
  const userId = parseInt(String(session.user.id), 10);
  const circles = await listMyCircles(userId);

  return (
    <main className={`${PAGE_SHELL} ${PAGE_PADDING_X} pb-24`}>
      <div className="flex items-center justify-between pt-4">
        <h1 className={SECTION_HEADING}>Your circles</h1>
        <CreateCircleDialog />
      </div>
      {circles.length === 0 ? (
        <div className="mt-12 text-center text-muted-foreground">
          <p className="text-base font-medium">Watch together, asynchronously.</p>
          <p className="mt-1 text-sm">Create a circle and share one link — that&apos;s it.</p>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {circles.map((c) => (
            <li key={c.id}>
              <Link
                href={`/circles/${c.slug}`}
                className="flex items-center gap-3 rounded-xl border bg-card p-3 active:scale-[0.99] transition"
              >
                {/* imageUrl is a TMDB path; render via the shared TMDB image helper */}
                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
                    {c.isPublic ? " · public" : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Create-circle dialog (client)**

```tsx
// src/components/features/circles/create-circle-dialog.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createCircleAction } from "@/server/actions/circles";

export function CreateCircleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createCircleAction({ name, isPublic });
      if (result.ok) {
        setOpen(false);
        router.push(`/circles/${result.data.slug}`);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">New circle</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create a circle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Circle name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />
          <label className="flex items-center justify-between text-sm">
            <span>
              Public circle
              <span className="block text-xs text-muted-foreground">Discoverable by people with similar taste</span>
            </span>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" onClick={submit} disabled={pending || name.trim().length < 2}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

(Circle image: after creation the circle settings sheet lets ADMIN+ pick TMDB art — wire a poster-picker later in the dashboard task; `imageUrl` plumbing already exists end-to-end.)

- [ ] **Step 3: Circle home page with tabs**

```tsx
// src/app/circles/[slug]/page.tsx
import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { PAGE_SHELL, PAGE_PADDING_X } from "@/lib/design";
import { getCircleBySlug, getMembers, getMemberActivity, getOrCreateCircleWatchlist } from "@/server/services/circles/circle-service";
import { CircleTabs } from "@/components/features/circles/circle-tabs";
import { InviteShareButton } from "@/components/features/circles/invite-share-button";

export default async function CirclePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const userId = session?.user ? parseInt(String(session.user.id), 10) : null;
  const circle = await getCircleBySlug(slug, userId);
  if (!circle) notFound();

  // Non-members viewing a PUBLIC circle see the preview header only.
  if (circle.role === null) {
    return (
      <main className={`${PAGE_SHELL} ${PAGE_PADDING_X} pb-24`}>
        <CircleHeader name={circle.name} memberCount={circle.memberCount} description={circle.description} />
        <p className="mt-6 text-sm text-muted-foreground">Ask a member for an invite link to join.</p>
      </main>
    );
  }
  if (!userId) redirect(`/auth/signin?callbackUrl=/circles/${slug}`);

  const [members, activity, watchlistId] = await Promise.all([
    getMembers(circle.id, userId),
    getMemberActivity(circle.id, userId),
    getOrCreateCircleWatchlist(circle.id, userId),
  ]);

  return (
    <main className={`${PAGE_SHELL} ${PAGE_PADDING_X} pb-24`}>
      <div className="flex items-start justify-between gap-3 pt-4">
        <CircleHeader name={circle.name} memberCount={circle.memberCount} description={circle.description} />
        {circle.inviteCode ? <InviteShareButton inviteCode={circle.inviteCode} circleId={circle.id} /> : null}
      </div>
      <CircleTabs
        circle={{ id: circle.id, slug: circle.slug, role: circle.role }}
        members={members}
        activity={activity}
        watchlistId={watchlistId}
        viewerId={userId}
      />
    </main>
  );
}

function CircleHeader({ name, memberCount, description }: { name: string; memberCount: number; description: string | null }) {
  return (
    <div className="min-w-0">
      <h1 className="truncate text-2xl font-bold tracking-tight">{name}</h1>
      <p className="text-sm text-muted-foreground">{memberCount} member{memberCount === 1 ? "" : "s"}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Tabs shell (client) — Chat / Watchlist / Clubs / Polls / Members**

```tsx
// src/components/features/circles/circle-tabs.tsx
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommentThread } from "@/components/features/comments/comment-thread"; // phase-1 deliverable
import { ListView } from "@/components/features/lists/list-view"; // phase-2 deliverable
import { MemberList } from "./member-list";
import type { CircleActivityItem } from "@/server/services/circles/circle-service";
import type { CircleRole } from "@prisma/client";

interface MemberRow {
  userId: number; name: string | null; username: string | null;
  image: string | null; role: CircleRole; joinedAt: Date;
}

export function CircleTabs(props: {
  circle: { id: number; slug: string; role: CircleRole };
  members: MemberRow[];
  activity: CircleActivityItem[];
  watchlistId: number;
  viewerId: number;
}) {
  const { circle, members, activity, watchlistId, viewerId } = props;
  return (
    <Tabs defaultValue="chat" className="mt-4">
      <TabsList className="w-full overflow-x-auto">
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
        <TabsTrigger value="clubs">Clubs</TabsTrigger>
        <TabsTrigger value="polls">Decide</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
      </TabsList>

      <TabsContent value="chat">
        {/* Circle chat = comments with circleId, NO media anchor (phase-0 CHECK) */}
        <CommentThread circleId={circle.id} />
      </TabsContent>

      <TabsContent value="watchlist">
        <ListView listId={watchlistId} collaborative />
      </TabsContent>

      <TabsContent value="clubs" id="clubs">
        {/* Filled in Task 11 (club UI) — placeholder until then */}
        <div data-slot="circle-clubs" data-circle-id={circle.id} />
      </TabsContent>

      <TabsContent value="polls" id="polls">
        {/* Filled in Task 8 (poll UI) — placeholder until then */}
        <div data-slot="circle-polls" data-circle-id={circle.id} />
      </TabsContent>

      <TabsContent value="members">
        <MemberList circleId={circle.id} members={members} viewerId={viewerId} viewerRole={circle.role} />
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-muted-foreground">Recent activity</h3>
          <ul className="mt-2 space-y-2">
            {activity.map((a, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{a.userName ?? "Someone"}</span>{" "}
                {a.kind === "watch" ? "watched" : "reviewed"}{" "}
                <span className="text-muted-foreground">{a.title}</span>
              </li>
            ))}
          </ul>
        </div>
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 5: Member list with kick/role controls**

```tsx
// src/components/features/circles/member-list.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { kickMemberAction, setMemberRoleAction, leaveCircleAction } from "@/server/actions/circles";
import type { CircleRole } from "@prisma/client";

interface MemberRow {
  userId: number; name: string | null; username: string | null;
  image: string | null; role: CircleRole; joinedAt: Date;
}

export function MemberList({ circleId, members, viewerId, viewerRole }: {
  circleId: number; members: MemberRow[]; viewerId: number; viewerRole: CircleRole;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canManage = viewerRole === "OWNER" || viewerRole === "ADMIN";

  return (
    <ul className="divide-y">
      {members.map((m) => (
        <li key={m.userId} className="flex items-center justify-between gap-2 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {m.name ?? m.username ?? "Member"}
              <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">{m.role}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {m.userId === viewerId && m.role !== "OWNER" ? (
              <Button variant="outline" size="sm" disabled={pending}
                onClick={() => startTransition(async () => {
                  const r = await leaveCircleAction({ circleId });
                  if (r.ok) router.push("/circles");
                })}>
                Leave
              </Button>
            ) : null}
            {canManage && m.userId !== viewerId && m.role !== "OWNER" ? (
              <>
                {viewerRole === "OWNER" ? (
                  <Button variant="ghost" size="sm" disabled={pending}
                    onClick={() => startTransition(async () => {
                      await setMemberRoleAction({ circleId, targetUserId: m.userId, role: m.role === "ADMIN" ? "MEMBER" : "ADMIN" });
                      router.refresh();
                    })}>
                    {m.role === "ADMIN" ? "Demote" : "Make admin"}
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" className="text-destructive" disabled={pending}
                  onClick={() => startTransition(async () => {
                    await kickMemberAction({ circleId, targetUserId: m.userId });
                    router.refresh();
                  })}>
                  Remove
                </Button>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Invite share button (Web Share API first — WhatsApp/Telegram heavy audience)**

```tsx
// src/components/features/circles/invite-share-button.tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { rotateInviteCodeAction } from "@/server/actions/circles";
import { inviteUrlPath } from "@/server/services/circles/invite-code";

export function InviteShareButton({ inviteCode, circleId }: { inviteCode: string; circleId: number }) {
  const [code, setCode] = useState(inviteCode);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const url = `${window.location.origin}${inviteUrlPath(code)}`;

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "Join my circle", url }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button size="sm" onClick={share}>{copied ? "Copied!" : "Invite"}</Button>
      <button
        className="text-[11px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const r = await rotateInviteCodeAction({ circleId });
          if (r.ok) setCode(r.data.code);
        })}
      >
        reset link
      </button>
    </div>
  );
}
```

NOTE: `inviteUrlPath` is a pure function in a server-service file; if the import drags server-only code into the client bundle, inline the template string here instead.

- [ ] **Step 7: Join page — THE acquisition loop**

```tsx
// src/app/c/join/[code]/page.tsx
import { auth } from "@/auth";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PAGE_SHELL, PAGE_PADDING_X } from "@/lib/design";
import { getCircleByInviteCode } from "@/server/services/circles/circle-service";
import { JoinCircleCard } from "@/components/features/circles/join-circle-card";

interface Props { params: Promise<{ code: string }> }

// OG matters: this link lands in WhatsApp/Telegram group chats. Roadmap rule:
// every public object ships with correct OG from day one.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const circle = await getCircleByInviteCode(code);
  if (!circle) return { title: "Invite not found" };
  return {
    title: `Join ${circle.name} on The Movie Browser`,
    description: `${circle.memberCount} members deciding what to watch together. Tap to join.`,
    openGraph: {
      title: `Join ${circle.name}`,
      description: `${circle.memberCount} members · watch together, asynchronously`,
    },
  };
}

export default async function JoinPage({ params }: Props) {
  const { code } = await params;
  const circle = await getCircleByInviteCode(code);
  if (!circle) notFound();
  const session = await auth();

  return (
    <main className={`${PAGE_SHELL} ${PAGE_PADDING_X} flex min-h-[70dvh] items-center justify-center pb-24`}>
      <JoinCircleCard
        code={code}
        circleName={circle.name}
        memberCount={circle.memberCount}
        ownerName={circle.ownerName}
        isAuthed={Boolean(session?.user)}
      />
    </main>
  );
}
```

```tsx
// src/components/features/circles/join-circle-card.tsx
"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { joinCircleAction } from "@/server/actions/circles";

export function JoinCircleCard(props: {
  code: string; circleName: string; memberCount: number; ownerName: string | null; isAuthed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const join = () => {
    if (!props.isAuthed) {
      // Round-trip through Google sign-in and land back HERE — the loop must not drop the code.
      void signIn("google", { callbackUrl: `/c/join/${props.code}` });
      return;
    }
    startTransition(async () => {
      const result = await joinCircleAction({ code: props.code });
      if (result.ok) router.push(`/circles/${result.data.slug}`);
      else setError(result.error);
    });
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">You&apos;re invited to</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{props.circleName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {props.memberCount} member{props.memberCount === 1 ? "" : "s"}
        {props.ownerName ? ` · created by ${props.ownerName}` : ""}
      </p>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <Button className="mt-5 w-full" size="lg" onClick={join} disabled={pending}>
        {props.isAuthed ? (pending ? "Joining…" : "Join circle") : "Sign in & join"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: Verify**

Run: `yarn typecheck && yarn lint`
Expected: PASS.
Run: `yarn dev`, then manually: create a circle, open `/c/join/<code>` in an incognito window — preview renders without auth; sign-in round-trips back to the join page.

- [ ] **Step 9: Commit**

```bash
git add src/app/circles src/app/c src/components/features/circles
git commit -m "feat(phase3): circle pages - my circles, circle home tabs, invite join loop"
```

---

### Task 6: Poll tally — pure functions (TDD)

**Files:**
- Create: `src/server/services/circles/poll-tally.ts`
- Test: `src/server/services/circles/poll-tally.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/server/services/circles/poll-tally.test.ts
import { describe, it, expect } from "vitest";
import { tallyRankedChoice, findSwipeMatches } from "./poll-tally";

describe("tallyRankedChoice (instant-runoff)", () => {
  it("returns the majority winner in round 1", () => {
    const ballots = [[1, 2], [1, 3], [2, 1]]; // candidate 1 has 2/3 first-choice
    const result = tallyRankedChoice(ballots);
    expect(result.winnerCandidateId).toBe(1);
    expect(result.rounds).toHaveLength(1);
  });

  it("eliminates the weakest and transfers votes", () => {
    // First choices: 1→2 votes, 2→2 votes, 3→1 vote. 3 eliminated; its ballot
    // transfers to 2 → 2 wins 3-2.
    const ballots = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 2, 1]];
    const result = tallyRankedChoice(ballots);
    expect(result.winnerCandidateId).toBe(2);
    expect(result.rounds.length).toBeGreaterThan(1);
  });

  it("handles exhausted ballots (voter ranked only eliminated candidates)", () => {
    const ballots = [[3], [1, 2], [1], [2, 1]];
    const result = tallyRankedChoice(ballots);
    expect(result.winnerCandidateId).toBe(1);
  });

  it("returns null winner for no ballots", () => {
    expect(tallyRankedChoice([]).winnerCandidateId).toBeNull();
  });

  it("breaks last-place ties deterministically (lowest id eliminated first)", () => {
    const ballots = [[1], [2]];
    const result = tallyRankedChoice(ballots);
    expect(result.winnerCandidateId).toBe(2); // 1 eliminated on tie, 2 survives
  });
});

describe("findSwipeMatches (match = ALL members said yes)", () => {
  it("returns candidates every member approved", () => {
    const votes = [
      { candidateId: 10, userId: 1, approve: true },
      { candidateId: 10, userId: 2, approve: true },
      { candidateId: 11, userId: 1, approve: true },
      { candidateId: 11, userId: 2, approve: false },
    ];
    expect(findSwipeMatches(votes, [1, 2])).toEqual([10]);
  });

  it("does NOT match when a member has not voted yet", () => {
    const votes = [{ candidateId: 10, userId: 1, approve: true }];
    expect(findSwipeMatches(votes, [1, 2])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:unit src/server/services/circles/poll-tally.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/server/services/circles/poll-tally.ts
/**
 * Pure poll tally logic. No I/O — fully unit-testable.
 */

export interface RankedTallyResult {
  winnerCandidateId: number | null;
  /** Per-round first-choice counts, candidateId -> votes */
  rounds: Array<Record<number, number>>;
}

/**
 * Instant-runoff voting. Each ballot is an ordered array of candidateIds
 * (index 0 = first choice). Ties for elimination break on lowest candidateId.
 */
export function tallyRankedChoice(ballots: number[][]): RankedTallyResult {
  const live = ballots.filter((b) => b.length > 0);
  if (live.length === 0) return { winnerCandidateId: null, rounds: [] };

  const eliminated = new Set<number>();
  const rounds: Array<Record<number, number>> = [];
  const allCandidates = new Set<number>(live.flat());

  for (let round = 0; round < allCandidates.size; round++) {
    const counts = new Map<number, number>();
    for (const id of allCandidates) if (!eliminated.has(id)) counts.set(id, 0);
    let activeBallots = 0;
    for (const ballot of live) {
      const top = ballot.find((id) => !eliminated.has(id));
      if (top === undefined) continue; // exhausted ballot
      counts.set(top, (counts.get(top) ?? 0) + 1);
      activeBallots++;
    }
    rounds.push(Object.fromEntries(counts));
    if (activeBallots === 0) return { winnerCandidateId: null, rounds };

    const entries = [...counts.entries()];
    entries.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const [leaderId, leaderVotes] = entries[0];
    if (leaderVotes * 2 > activeBallots || entries.length === 1) {
      return { winnerCandidateId: leaderId, rounds };
    }
    // Eliminate the weakest (fewest votes; tie → LOWEST candidateId eliminated)
    entries.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    eliminated.add(entries[0][0]);
  }
  return { winnerCandidateId: null, rounds };
}

export interface SwipeVote {
  candidateId: number;
  userId: number;
  approve: boolean;
}

/** A candidate matches only when EVERY member voted approve=true on it. */
export function findSwipeMatches(votes: SwipeVote[], memberIds: number[]): number[] {
  const byCandidate = new Map<number, Map<number, boolean>>();
  for (const v of votes) {
    const m = byCandidate.get(v.candidateId) ?? new Map<number, boolean>();
    m.set(v.userId, v.approve);
    byCandidate.set(v.candidateId, m);
  }
  const matches: number[] = [];
  for (const [candidateId, userVotes] of byCandidate) {
    const allYes = memberIds.every((id) => userVotes.get(id) === true);
    if (allYes) matches.push(candidateId);
  }
  return matches.sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test:unit src/server/services/circles/poll-tally.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/circles/poll-tally.ts src/server/services/circles/poll-tally.test.ts
git commit -m "feat(phase3): pure poll tally - IRV + swipe match"
```

---

### Task 7: Poll service + actions (candidate pool, vote, close)

**Files:**
- Create: `src/server/services/circles/poll-service.ts`
- Create: `src/server/actions/polls.ts`

- [ ] **Step 1: Implement the poll service**

```typescript
// src/server/services/circles/poll-service.ts
/**
 * Group decide: polls over a candidate pool built from members' watchlists.
 * Tally logic is pure (poll-tally.ts); this file is the DB orchestration.
 */
import { PollMode, PollStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { requireMembership, CircleAccessError } from "./circle-service";
import { tallyRankedChoice, findSwipeMatches } from "./poll-tally";
import { notifyUsers } from "@/server/services/notifications/notification-service";

export interface PoolFilters {
  mediaType?: "movie" | "series";
  genres?: string[];      // genre names; resolved against genres table
  maxRuntime?: number;    // movies only
}

export interface PoolCandidate {
  movieId: number | null;
  seriesId: number | null;
  title: string;
  posterPath: string | null;
  year: string | null;
  runtime: number | null;
  genres: string[];
  overlapCount: number; // members who watchlisted it
}

/**
 * Candidate pool = union of members' watchlists, filtered, ranked by
 * (overlap desc, popularity desc), capped at 30. "Each member's watchlist
 * ∩ filters" per the roadmap — overlap is the group signal.
 */
export async function buildCandidatePool(circleId: number, viewerId: number, filters: PoolFilters): Promise<PoolCandidate[]> {
  await requireMembership(viewerId, circleId);
  const memberIds = (
    await prisma.circleMember.findMany({ where: { circleId }, select: { userId: true } })
  ).map((m) => m.userId);

  const items = await prisma.watchlistItem.findMany({
    where: {
      userId: { in: memberIds },
      ...(filters.mediaType === "movie" ? { seriesId: null } : {}),
      ...(filters.mediaType === "series" ? { movieId: null } : {}),
    },
    include: {
      movie: {
        select: {
          id: true, title: true, posterPath: true, releaseDate: true, runtime: true, popularity: true,
          genres: { select: { genre: { select: { name: true } } } },
        },
      },
      series: {
        select: {
          id: true, name: true, posterPath: true, firstAirDate: true, popularity: true,
          genres: { select: { genre: { select: { name: true } } } },
        },
      },
    },
  });

  const wanted = filters.genres?.map((g) => g.toLowerCase());
  const byKey = new Map<string, PoolCandidate & { popularity: number }>();
  for (const item of items) {
    const media = item.movie ?? item.series;
    if (!media) continue;
    const genres = (item.movie?.genres ?? item.series?.genres ?? []).map((g) => g.genre.name);
    if (wanted && wanted.length > 0 && !genres.some((g) => wanted.includes(g.toLowerCase()))) continue;
    const runtime = item.movie?.runtime ?? null;
    if (filters.maxRuntime && runtime !== null && runtime > filters.maxRuntime) continue;
    const key = item.movie ? `m${item.movie.id}` : `s${item.series?.id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.overlapCount++;
      continue;
    }
    const date = item.movie?.releaseDate ?? item.series?.firstAirDate ?? null;
    byKey.set(key, {
      movieId: item.movie?.id ?? null,
      seriesId: item.series?.id ?? null,
      title: item.movie?.title ?? item.series?.name ?? "Unknown",
      posterPath: item.movie?.posterPath ?? item.series?.posterPath ?? null,
      year: date ? String(date.getFullYear()) : null,
      runtime,
      genres,
      overlapCount: 1,
      popularity: item.movie?.popularity ?? item.series?.popularity ?? 0,
    });
  }
  return [...byKey.values()]
    .sort((a, b) => b.overlapCount - a.overlapCount || b.popularity - a.popularity)
    .slice(0, 30)
    .map(({ popularity: _p, ...rest }) => rest);
}

export async function createPoll(input: {
  circleId: number;
  createdById: number;
  mode: PollMode;
  title: string;
  filters: PoolFilters;
  candidates: Array<{ movieId: number | null; seriesId: number | null; overlapCount: number }>;
}): Promise<number> {
  await requireMembership(input.createdById, input.circleId);
  if (input.candidates.length < 2) throw new CircleAccessError("A poll needs at least 2 candidates");
  if (input.candidates.length > 30) throw new CircleAccessError("Too many candidates");

  const poll = await prisma.$transaction(async (tx) => {
    const created = await tx.circlePoll.create({
      data: {
        circleId: input.circleId,
        createdById: input.createdById,
        mode: input.mode,
        title: input.title,
        filters: input.filters as Prisma.InputJsonValue,
      },
    });
    await tx.pollCandidate.createMany({
      data: input.candidates.map((c) => ({
        pollId: created.id, movieId: c.movieId, seriesId: c.seriesId, overlapCount: c.overlapCount,
      })),
    });
    return created;
  });

  // Bounded by circle membership (invariant 6).
  const memberIds = (
    await prisma.circleMember.findMany({ where: { circleId: input.circleId }, select: { userId: true } })
  ).map((m) => m.userId).filter((id) => id !== input.createdById);
  await notifyUsers(memberIds, "POLL_OPEN", input.createdById, { pollId: poll.id, circleId: input.circleId, title: input.title });
  return poll.id;
}

/** RANKED: replace the user's full ballot atomically. */
export async function castRankedBallot(pollId: number, userId: number, orderedCandidateIds: number[]): Promise<void> {
  const poll = await prisma.circlePoll.findUniqueOrThrow({ where: { id: pollId }, select: { circleId: true, mode: true, status: true } });
  if (poll.mode !== PollMode.RANKED || poll.status !== PollStatus.OPEN) throw new CircleAccessError("Poll is not open for ranking");
  await requireMembership(userId, poll.circleId);
  const valid = await prisma.pollCandidate.findMany({ where: { pollId, id: { in: orderedCandidateIds } }, select: { id: true } });
  if (valid.length !== orderedCandidateIds.length) throw new CircleAccessError("Unknown candidate in ballot");
  await prisma.$transaction([
    prisma.pollVote.deleteMany({ where: { pollId, userId } }),
    prisma.pollVote.createMany({
      data: orderedCandidateIds.map((candidateId, i) => ({ pollId, candidateId, userId, rank: i + 1 })),
    }),
  ]);
}

/** SWIPE: one yes/no per candidate; upsert per swipe. Returns new matches (all-yes). */
export async function castSwipeVote(pollId: number, userId: number, candidateId: number, approve: boolean): Promise<{ matchedCandidateIds: number[] }> {
  const poll = await prisma.circlePoll.findUniqueOrThrow({ where: { id: pollId }, select: { circleId: true, mode: true, status: true } });
  if (poll.mode !== PollMode.SWIPE || poll.status !== PollStatus.OPEN) throw new CircleAccessError("Poll is not open for swiping");
  await requireMembership(userId, poll.circleId);
  await prisma.pollVote.upsert({
    where: { pollId_candidateId_userId: { pollId, candidateId, userId } },
    create: { pollId, candidateId, userId, approve },
    update: { approve },
  });
  const [votes, members] = await Promise.all([
    prisma.pollVote.findMany({ where: { pollId, approve: { not: null } }, select: { candidateId: true, userId: true, approve: true } }),
    prisma.circleMember.findMany({ where: { circleId: poll.circleId }, select: { userId: true } }),
  ]);
  const matches = findSwipeMatches(
    votes.map((v) => ({ candidateId: v.candidateId, userId: v.userId, approve: v.approve === true })),
    members.map((m) => m.userId)
  );
  return { matchedCandidateIds: matches };
}

/** Close + tally + notify members. Creator or circle ADMIN+ may close. */
export async function closePoll(pollId: number, actorId: number): Promise<Prisma.JsonObject> {
  const poll = await prisma.circlePoll.findUniqueOrThrow({
    where: { id: pollId },
    include: { votes: true, candidates: { select: { id: true } } },
  });
  if (poll.createdById !== actorId) await requireMembership(actorId, poll.circleId, "ADMIN");
  else await requireMembership(actorId, poll.circleId);
  if (poll.status === PollStatus.CLOSED) return (poll.result ?? {}) as Prisma.JsonObject;

  let result: Prisma.JsonObject;
  if (poll.mode === PollMode.RANKED) {
    const byUser = new Map<number, Array<{ candidateId: number; rank: number }>>();
    for (const v of poll.votes) {
      if (v.rank === null) continue;
      const arr = byUser.get(v.userId) ?? [];
      arr.push({ candidateId: v.candidateId, rank: v.rank });
      byUser.set(v.userId, arr);
    }
    const ballots = [...byUser.values()].map((arr) => arr.sort((a, b) => a.rank - b.rank).map((x) => x.candidateId));
    const tally = tallyRankedChoice(ballots);
    result = { mode: "RANKED", winnerCandidateId: tally.winnerCandidateId, rounds: tally.rounds as unknown as Prisma.JsonArray };
  } else {
    const members = await prisma.circleMember.findMany({ where: { circleId: poll.circleId }, select: { userId: true } });
    const matches = findSwipeMatches(
      poll.votes.filter((v) => v.approve !== null).map((v) => ({ candidateId: v.candidateId, userId: v.userId, approve: v.approve === true })),
      members.map((m) => m.userId)
    );
    result = { mode: "SWIPE", matchedCandidateIds: matches };
  }

  await prisma.circlePoll.update({ where: { id: pollId }, data: { status: PollStatus.CLOSED, result } });
  const memberIds = (
    await prisma.circleMember.findMany({ where: { circleId: poll.circleId }, select: { userId: true } })
  ).map((m) => m.userId);
  await notifyUsers(memberIds, "POLL_RESULT", actorId, { pollId, circleId: poll.circleId, title: poll.title });
  dataLogger.info({ event: "poll_closed", pollId, mode: poll.mode });
  return result;
}

export async function getPollsForCircle(circleId: number, viewerId: number) {
  await requireMembership(viewerId, circleId);
  return prisma.circlePoll.findMany({
    where: { circleId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      candidates: {
        include: {
          movie: { select: { id: true, title: true, posterPath: true } },
          series: { select: { id: true, name: true, posterPath: true } },
        },
      },
      votes: { where: { userId: viewerId } },
    },
  });
}
```

- [ ] **Step 2: Implement poll actions**

```typescript
// src/server/actions/polls.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { dataLogger } from "@/lib/logger";
import {
  buildCandidatePool, createPoll, castRankedBallot, castSwipeVote, closePoll,
  type PoolCandidate,
} from "@/server/services/circles/poll-service";
import { getMediatorPicks, type MediatorPick } from "@/server/services/circles/ai-mediator";
import { CircleAccessError } from "@/server/services/circles/circle-service";

async function requireUserId(): Promise<number> {
  const session = await auth();
  const id = session?.user?.id ? parseInt(String(session.user.id), 10) : NaN;
  if (!Number.isFinite(id)) throw new Error("UNAUTHENTICATED");
  return id;
}

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toError(error: unknown): string {
  if (error instanceof CircleAccessError) return error.message;
  if (error instanceof Error && error.message === "UNAUTHENTICATED") return "Sign in to continue";
  return "Something went wrong";
}

const FiltersSchema = z.object({
  mediaType: z.enum(["movie", "series"]).optional(),
  genres: z.array(z.string().max(40)).max(5).optional(),
  maxRuntime: z.number().int().min(30).max(400).optional(),
});

const PoolSchema = z.object({ circleId: z.number().int().positive(), filters: FiltersSchema });

export async function buildPoolAction(input: z.infer<typeof PoolSchema>): Promise<ActionResult<PoolCandidate[]>> {
  try {
    const userId = await requireUserId();
    const { circleId, filters } = PoolSchema.parse(input);
    return { ok: true, data: await buildCandidatePool(circleId, userId, filters) };
  } catch (error: unknown) {
    return { ok: false, error: toError(error) };
  }
}

const CreatePollSchema = z.object({
  circleId: z.number().int().positive(),
  mode: z.enum(["RANKED", "SWIPE"]),
  title: z.string().trim().min(2).max(80),
  filters: FiltersSchema,
  candidates: z.array(z.object({
    movieId: z.number().int().positive().nullable(),
    seriesId: z.number().int().positive().nullable(),
    overlapCount: z.number().int().min(1).default(1),
  })).min(2).max(30),
});

export async function createPollAction(input: z.infer<typeof CreatePollSchema>): Promise<ActionResult<{ pollId: number }>> {
  try {
    const userId = await requireUserId();
    const validated = CreatePollSchema.parse(input);
    const pollId = await createPoll({ ...validated, createdById: userId });
    revalidatePath(`/circles`);
    return { ok: true, data: { pollId } };
  } catch (error: unknown) {
    dataLogger.error({ action: "createPoll", error: error instanceof Error ? error.message : String(error) });
    return { ok: false, error: toError(error) };
  }
}

const RankedSchema = z.object({
  pollId: z.number().int().positive(),
  orderedCandidateIds: z.array(z.number().int().positive()).min(1).max(30),
});

export async function castRankedBallotAction(input: z.infer<typeof RankedSchema>): Promise<ActionResult<null>> {
  try {
    const userId = await requireUserId();
    const { pollId, orderedCandidateIds } = RankedSchema.parse(input);
    await castRankedBallot(pollId, userId, orderedCandidateIds);
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, error: toError(error) };
  }
}

const SwipeSchema = z.object({
  pollId: z.number().int().positive(),
  candidateId: z.number().int().positive(),
  approve: z.boolean(),
});

export async function castSwipeVoteAction(input: z.infer<typeof SwipeSchema>): Promise<ActionResult<{ matchedCandidateIds: number[] }>> {
  try {
    const userId = await requireUserId();
    const { pollId, candidateId, approve } = SwipeSchema.parse(input);
    return { ok: true, data: await castSwipeVote(pollId, userId, candidateId, approve) };
  } catch (error: unknown) {
    return { ok: false, error: toError(error) };
  }
}

const ClosePollSchema = z.object({ pollId: z.number().int().positive() });

export async function closePollAction(input: z.infer<typeof ClosePollSchema>): Promise<ActionResult<null>> {
  try {
    const userId = await requireUserId();
    const { pollId } = ClosePollSchema.parse(input);
    await closePoll(pollId, userId);
    return { ok: true, data: null };
  } catch (error: unknown) {
    return { ok: false, error: toError(error) };
  }
}

const MediatorSchema = z.object({ circleId: z.number().int().positive(), filters: FiltersSchema });

export async function mediatorPicksAction(input: z.infer<typeof MediatorSchema>): Promise<ActionResult<MediatorPick[]>> {
  try {
    const userId = await requireUserId();
    const { circleId, filters } = MediatorSchema.parse(input);
    return { ok: true, data: await getMediatorPicks(circleId, userId, filters) };
  } catch (error: unknown) {
    dataLogger.error({ action: "mediatorPicks", error: error instanceof Error ? error.message : String(error) });
    return { ok: false, error: toError(error) };
  }
}
```

(`ai-mediator.ts` is Task 9 — create it before typechecking this file, or stub it in this commit and fill it in Task 9. Preferred order: implement Task 9 service file first if executing strictly sequentially; the import is the only coupling.)

- [ ] **Step 3: Typecheck after Task 9 lands (or stub mediator)**

Run: `yarn typecheck`
Expected: PASS once `ai-mediator.ts` exists.

- [ ] **Step 4: Commit**

```bash
git add src/server/services/circles/poll-service.ts src/server/actions/polls.ts
git commit -m "feat(phase3): poll service + actions - pool, ranked ballots, swipe, close"
```

---

### Task 8: AI mediator (Bedrock, Fable rule hard)

**Files:**
- Create: `src/server/services/circles/ai-mediator.ts`
- Test: `src/server/services/circles/ai-mediator.test.ts`

- [ ] **Step 1: Write the failing tests (prompt construction + output validation — the Fable-rule gates)**

```typescript
// src/server/services/circles/ai-mediator.test.ts
import { describe, it, expect } from "vitest";
import { buildMediatorPrompt, parseMediatorOutput } from "./ai-mediator";

const CANDIDATES = [
  { key: "m603", title: "The Matrix", year: "1999", genres: ["Action", "Science Fiction"], runtime: 136, overview: "A hacker discovers reality is a simulation." },
  { key: "s1396", title: "Breaking Bad", year: "2008", genres: ["Drama", "Crime"], runtime: null, overview: "A chemistry teacher turns to crime." },
  { key: "m27205", title: "Inception", year: "2010", genres: ["Action", "Thriller"], runtime: 148, overview: "Dream heists." },
  { key: "m155", title: "The Dark Knight", year: "2008", genres: ["Action", "Crime"], runtime: 152, overview: "Batman vs Joker." },
];
const TASTES = [
  { label: "Taste profile 1", topGenres: ["Action", "Thriller"], lovedTitles: ["Heat"] },
  { label: "Taste profile 2", topGenres: ["Drama", "Crime"], lovedTitles: ["The Wire"] },
];

describe("buildMediatorPrompt", () => {
  it("contains the Fable rule as a hard instruction and anonymized profiles only", () => {
    const { systemPrompt, userPrompt } = buildMediatorPrompt(CANDIDATES, TASTES);
    expect(systemPrompt).toMatch(/never describe|never characterize/i);
    expect(systemPrompt).toMatch(/content/i);
    expect(userPrompt).toContain("Taste profile 1");
    expect(userPrompt).not.toMatch(/user|member name/i); // no user identities in the prompt
  });

  it("instructs picking ONLY from the candidate list", () => {
    const { systemPrompt } = buildMediatorPrompt(CANDIDATES, TASTES);
    expect(systemPrompt).toMatch(/only.*candidate/i);
  });
});

describe("parseMediatorOutput", () => {
  const validKeys = new Set(CANDIDATES.map((c) => c.key));

  it("accepts exactly-3 valid picks", () => {
    const out = JSON.stringify([
      { key: "m603", reason: "A tightly paced sci-fi action film blending both thriller and crime sensibilities." },
      { key: "s1396", reason: "Crime drama with patient, escalating tension." },
      { key: "m155", reason: "Action-crime overlap with strong critical standing." },
    ]);
    const picks = parseMediatorOutput(out, validKeys);
    expect(picks).toHaveLength(3);
  });

  it("rejects picks not in the candidate pool (hallucination guard)", () => {
    const out = JSON.stringify([
      { key: "m999999", reason: "x" }, { key: "m603", reason: "y" }, { key: "m155", reason: "z" },
    ]);
    expect(() => parseMediatorOutput(out, validKeys)).toThrow();
  });

  it("rejects reasons that reference people instead of content (Fable rule)", () => {
    const out = JSON.stringify([
      { key: "m603", reason: "Perfect for member 2, who clearly loves brainy stuff" },
      { key: "s1396", reason: "ok" },
      { key: "m155", reason: "ok" },
    ]);
    expect(() => parseMediatorOutput(out, validKeys)).toThrow(/characteriz/i);
  });

  it("extracts JSON from fenced output", () => {
    const out = "Here you go:\n```json\n" + JSON.stringify([
      { key: "m603", reason: "a" }, { key: "s1396", reason: "b" }, { key: "m27205", reason: "c" },
    ]) + "\n```";
    expect(parseMediatorOutput(out, validKeys)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:unit src/server/services/circles/ai-mediator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/server/services/circles/ai-mediator.ts
/**
 * AI mediator: "3 titles all of you will tolerate, and why."
 *
 * FABLE RULE (HARD, roadmap §5): the model reasons about CONTENT — genres,
 * tone, pacing, themes — never about people. We enforce it three ways:
 *  1. Member identities never enter the prompt (anonymous "Taste profile N").
 *  2. The system prompt forbids user characterization.
 *  3. parseMediatorOutput rejects any reason that references profiles/members.
 */
import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { aiLogger } from "@/lib/logger";
import { callBedrockFlex } from "@/server/services/enrichment/bedrock-flex";
import { trackAIUsage } from "@/lib/analytics/track";
import { requireMembership } from "./circle-service";
import { buildCandidatePool, type PoolFilters } from "./poll-service";

export interface MediatorCandidate {
  key: string; // "m<id>" | "s<id>"
  title: string;
  year: string | null;
  genres: string[];
  runtime: number | null;
  overview: string;
}

export interface MediatorTaste {
  label: string; // "Taste profile N" — NEVER a name
  topGenres: string[];
  lovedTitles: string[];
}

export interface MediatorPick {
  key: string;
  movieId: number | null;
  seriesId: number | null;
  title: string;
  reason: string;
}

export function buildMediatorPrompt(candidates: MediatorCandidate[], tastes: MediatorTaste[]): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are a neutral film/TV mediator helping a group pick what to watch together.

RULES (all hard):
- Pick EXACTLY 3 titles, ONLY from the provided CANDIDATES list (use their "key" values verbatim).
- Reasons must be grounded in the CONTENT: genre, tone, pacing, themes, runtime, and how those overlap the supplied taste profiles IN AGGREGATE.
- NEVER describe, characterize, label, or address any person or profile. Do not write "profile 1 will love", "for the horror fan", or anything that performs personality. Talk about the titles, not the people.
- Each reason: one sentence, max 30 words, neutral tone.
- Output: a JSON array of exactly 3 objects {"key": string, "reason": string}. No other text.`;

  const candidateLines = candidates
    .map((c) => `- key=${c.key} | ${c.title}${c.year ? ` (${c.year})` : ""} | ${c.genres.join("/") || "—"}${c.runtime ? ` | ${c.runtime}m` : ""} | ${c.overview.slice(0, 160)}`)
    .join("\n");
  const tasteLines = tastes
    .map((t) => `- ${t.label}: top genres ${t.topGenres.join(", ") || "unknown"}; loved ${t.lovedTitles.join(", ") || "n/a"}`)
    .join("\n");

  return {
    systemPrompt,
    userPrompt: `CANDIDATES:\n${candidateLines}\n\nGROUP TASTE (anonymous):\n${tasteLines}\n\nReturn the JSON array now.`,
  };
}

const PickSchema = z.array(z.object({ key: z.string(), reason: z.string().min(3).max(300) })).length(3);

const FORBIDDEN_REASON = /\b(member|profile|user|person|people|fan|someone|anybody|everyone of you|you all)\b/i;

export function parseMediatorOutput(raw: string, validKeys: Set<string>): Array<{ key: string; reason: string }> {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Mediator output contained no JSON array");
  const picks = PickSchema.parse(JSON.parse(jsonMatch[0]));
  for (const pick of picks) {
    if (!validKeys.has(pick.key)) throw new Error(`Mediator picked unknown candidate ${pick.key}`);
    if (FORBIDDEN_REASON.test(pick.reason)) {
      throw new Error("Mediator reason characterizes people (Fable rule violation)");
    }
  }
  const unique = new Set(picks.map((p) => p.key));
  if (unique.size !== 3) throw new Error("Mediator picked duplicates");
  return picks;
}

/** Anonymous compact taste per member — same data shape as the agent's get_user_profile. */
async function buildAnonymousTastes(memberIds: number[]): Promise<MediatorTaste[]> {
  const tastes: MediatorTaste[] = [];
  for (let i = 0; i < memberIds.length; i++) {
    const userId = memberIds[i];
    const [ratings, recentEvents] = await Promise.all([
      prisma.userRating.findMany({
        where: { userId, rating: 1 },
        take: 50,
        orderBy: { createdAt: "desc" },
        include: {
          movie: { select: { title: true, genres: { select: { genre: { select: { name: true } } } } } },
          series: { select: { name: true, genres: { select: { genre: { select: { name: true } } } } } },
        },
      }),
      prisma.watchEvent.findMany({
        where: { userId },
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          movie: { select: { genres: { select: { genre: { select: { name: true } } } } } },
          series: { select: { genres: { select: { genre: { select: { name: true } } } } } },
        },
      }),
    ]);
    const genreCounts = new Map<string, number>();
    const bump = (names: Array<{ genre: { name: string } }>, weight: number) => {
      for (const g of names) genreCounts.set(g.genre.name, (genreCounts.get(g.genre.name) ?? 0) + weight);
    };
    for (const r of ratings) bump(r.movie?.genres ?? r.series?.genres ?? [], 2);
    for (const e of recentEvents) bump(e.movie?.genres ?? e.series?.genres ?? [], 1);
    tastes.push({
      label: `Taste profile ${i + 1}`,
      topGenres: [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n),
      lovedTitles: ratings.slice(0, 3).map((r) => r.movie?.title ?? r.series?.name ?? "").filter(Boolean),
    });
  }
  return tastes;
}

export async function getMediatorPicks(circleId: number, viewerId: number, filters: PoolFilters): Promise<MediatorPick[]> {
  await requireMembership(viewerId, circleId);
  const pool = await buildCandidatePool(circleId, viewerId, filters);
  if (pool.length < 3) throw new Error("Not enough shared watchlist candidates — add more titles first");

  const memberIds = (
    await prisma.circleMember.findMany({ where: { circleId }, select: { userId: true } })
  ).map((m) => m.userId);

  const candidates: MediatorCandidate[] = pool.map((c) => ({
    key: c.movieId ? `m${c.movieId}` : `s${c.seriesId}`,
    title: c.title,
    year: c.year,
    genres: c.genres,
    runtime: c.runtime,
    overview: "", // filled below
  }));
  // Fetch overviews in two grouped queries (content grounding for reasons)
  const movieIds = pool.flatMap((c) => (c.movieId ? [c.movieId] : []));
  const seriesIds = pool.flatMap((c) => (c.seriesId ? [c.seriesId] : []));
  const [movies, series] = await Promise.all([
    prisma.movie.findMany({ where: { id: { in: movieIds } }, select: { id: true, overview: true } }),
    prisma.series.findMany({ where: { id: { in: seriesIds } }, select: { id: true, overview: true } }),
  ]);
  const overviewByKey = new Map<string, string>([
    ...movies.map((m): [string, string] => [`m${m.id}`, m.overview ?? ""]),
    ...series.map((s): [string, string] => [`s${s.id}`, s.overview ?? ""]),
  ]);
  for (const c of candidates) c.overview = overviewByKey.get(c.key) ?? "";

  const tastes = await buildAnonymousTastes(memberIds);
  const { systemPrompt, userPrompt } = buildMediatorPrompt(candidates, tastes);

  const startedAt = Date.now();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callBedrockFlex({
        messages: [{ role: "user", text: userPrompt }],
        systemPrompt,
        maxTokens: 500,
        temperature: 0.4,
        useFlex: true,
      });
      trackAIUsage({
        queryType: "group_mediator",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: Date.now() - startedAt,
      });
      const picks = parseMediatorOutput(result.output, new Set(candidates.map((c) => c.key)));
      return picks.map((p) => {
        const candidate = pool.find((c) => (c.movieId ? `m${c.movieId}` : `s${c.seriesId}`) === p.key);
        return {
          key: p.key,
          movieId: candidate?.movieId ?? null,
          seriesId: candidate?.seriesId ?? null,
          title: candidate?.title ?? p.key,
          reason: p.reason,
        };
      });
    } catch (error: unknown) {
      lastError = error;
      aiLogger.warn({ event: "mediator_retry", attempt, error: error instanceof Error ? error.message : String(error) });
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Mediator failed");
}
```

NOTE: check `TrackAIUsageOptions` in `src/lib/analytics/track.ts` and match its exact field names (cost fields etc.) — adjust the `trackAIUsage` call to the real signature; add `"group_mediator"` to the query-type union if it is an enum/union.

- [ ] **Step 4: Run tests**

Run: `yarn test:unit src/server/services/circles/ai-mediator.test.ts`
Expected: PASS (6 tests; pure functions only — no Bedrock call in tests).

- [ ] **Step 5: Typecheck (also clears Task 7's import)**

Run: `yarn typecheck`
Expected: PASS.

- [ ] **Step 6: Live smoke test (optional, needs AWS creds)**

Run: `npx tsx -e "import('./src/server/services/circles/ai-mediator').then(async (m) => console.log(m.buildMediatorPrompt([{key:'m603',title:'The Matrix',year:'1999',genres:['Action'],runtime:136,overview:'x'}],[{label:'Taste profile 1',topGenres:['Action'],lovedTitles:[]}])))"`
Expected: prompt prints with Fable-rule lines.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/circles/ai-mediator.ts src/server/services/circles/ai-mediator.test.ts
git commit -m "feat(phase3): AI mediator with hard Fable-rule prompt + output validation"
```

---

### Task 9: Group-decide UI (poll create, ranked ballot, swipe deck, mediator picks)

**Files:**
- Create: `src/components/features/circles/poll-create-form.tsx`
- Create: `src/components/features/circles/ranked-ballot.tsx`
- Create: `src/components/features/circles/swipe-deck.tsx`
- Create: `src/components/features/circles/mediator-picks.tsx`
- Create: `src/components/features/circles/circle-polls.tsx`
- Modify: `src/components/features/circles/circle-tabs.tsx` (replace the `data-slot="circle-polls"` placeholder with `<CirclePolls circleId={circle.id} />` — server data passed via a new prop `polls` fetched in `src/app/circles/[slug]/page.tsx` with `getPollsForCircle`)

- [ ] **Step 1: Polls tab container**

```tsx
// src/components/features/circles/circle-polls.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PollCreateForm } from "./poll-create-form";
import { RankedBallot } from "./ranked-ballot";
import { SwipeDeck } from "./swipe-deck";
import type { getPollsForCircle } from "@/server/services/circles/poll-service";

type PollWithCandidates = Awaited<ReturnType<typeof getPollsForCircle>>[number];

export function CirclePolls({ circleId, polls }: { circleId: number; polls: PollWithCandidates[] }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4 pt-2">
      {creating ? (
        <PollCreateForm circleId={circleId} onDone={() => setCreating(false)} />
      ) : (
        <Button size="sm" onClick={() => setCreating(true)}>New poll</Button>
      )}
      {polls.map((poll) => (
        <div key={poll.id} className="rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">{poll.title}</p>
            <span className="text-xs uppercase text-muted-foreground">{poll.status === "OPEN" ? poll.mode : "closed"}</span>
          </div>
          {poll.status === "OPEN" && poll.mode === "RANKED" ? <RankedBallot poll={poll} /> : null}
          {poll.status === "OPEN" && poll.mode === "SWIPE" ? <SwipeDeck poll={poll} /> : null}
          {poll.status === "CLOSED" ? <PollResult poll={poll} /> : null}
        </div>
      ))}
    </div>
  );
}

function PollResult({ poll }: { poll: PollWithCandidates }) {
  const result = poll.result as { winnerCandidateId?: number | null; matchedCandidateIds?: number[] } | null;
  const titleOf = (candidateId: number) => {
    const c = poll.candidates.find((x) => x.id === candidateId);
    return c?.movie?.title ?? c?.series?.name ?? "?";
  };
  if (!result) return null;
  if (typeof result.winnerCandidateId === "number") {
    return <p className="mt-2 text-sm">Winner: <span className="font-semibold">{titleOf(result.winnerCandidateId)}</span></p>;
  }
  if (result.matchedCandidateIds?.length) {
    return <p className="mt-2 text-sm">Matches: {result.matchedCandidateIds.map(titleOf).join(", ")}</p>;
  }
  return <p className="mt-2 text-sm text-muted-foreground">No consensus reached.</p>;
}
```

- [ ] **Step 2: Poll create form (pool preview + filters + mode + AI mediator entry point)**

```tsx
// src/components/features/circles/poll-create-form.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPoolAction, createPollAction } from "@/server/actions/polls";
import { MediatorPicks } from "./mediator-picks";
import type { PoolCandidate } from "@/server/services/circles/poll-service";

export function PollCreateForm({ circleId, onDone }: { circleId: number; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("Movie night");
  const [mode, setMode] = useState<"RANKED" | "SWIPE">("SWIPE");
  const [mediaType, setMediaType] = useState<"movie" | "series" | undefined>(undefined);
  const [pool, setPool] = useState<PoolCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const filters = { mediaType };

  const loadPool = () => startTransition(async () => {
    const result = await buildPoolAction({ circleId, filters });
    if (result.ok) setPool(result.data);
    else setError(result.error);
  });

  const create = () => {
    if (!pool) return;
    startTransition(async () => {
      const result = await createPollAction({
        circleId, mode, title, filters,
        candidates: pool.map((c) => ({ movieId: c.movieId, seriesId: c.seriesId, overlapCount: c.overlapCount })),
      });
      if (result.ok) { onDone(); router.refresh(); }
      else setError(result.error);
    });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      <div className="flex gap-2 text-sm">
        {(["SWIPE", "RANKED"] as const).map((m) => (
          <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
            {m === "SWIPE" ? "Swipe match" : "Ranked vote"}
          </Button>
        ))}
        {([undefined, "movie", "series"] as const).map((t) => (
          <Button key={String(t)} size="sm" variant={mediaType === t ? "default" : "outline"} onClick={() => setMediaType(t)}>
            {t ?? "Both"}
          </Button>
        ))}
      </div>
      <Button size="sm" variant="secondary" onClick={loadPool} disabled={pending}>
        {pool ? `Pool: ${pool.length} titles (refresh)` : "Build candidate pool from watchlists"}
      </Button>
      {pool ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
          {pool.map((c) => (
            <li key={`${c.movieId}-${c.seriesId}`} className="flex justify-between">
              <span className="truncate">{c.title}</span>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">{c.overlapCount}× listed</span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={create} disabled={pending || !pool || pool.length < 2}>Start poll</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      <MediatorPicks circleId={circleId} filters={filters} />
    </div>
  );
}
```

- [ ] **Step 3: Ranked ballot (tap-to-rank — mobile-first, no drag dependency)**

```tsx
// src/components/features/circles/ranked-ballot.tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { castRankedBallotAction, closePollAction } from "@/server/actions/polls";
import { useRouter } from "next/navigation";
import type { getPollsForCircle } from "@/server/services/circles/poll-service";

type Poll = Awaited<ReturnType<typeof getPollsForCircle>>[number];

export function RankedBallot({ poll }: { poll: Poll }) {
  const router = useRouter();
  const existing = poll.votes
    .filter((v) => v.rank !== null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((v) => v.candidateId);
  const [ranking, setRanking] = useState<number[]>(existing);
  const [pending, startTransition] = useTransition();

  const toggle = (candidateId: number) =>
    setRanking((prev) => (prev.includes(candidateId) ? prev.filter((id) => id !== candidateId) : [...prev, candidateId]));

  const submit = () => startTransition(async () => {
    await castRankedBallotAction({ pollId: poll.id, orderedCandidateIds: ranking });
    router.refresh();
  });

  return (
    <div className="mt-2">
      <p className="text-xs text-muted-foreground">Tap titles in order of preference.</p>
      <ul className="mt-2 space-y-1.5">
        {poll.candidates.map((c) => {
          const pos = ranking.indexOf(c.id);
          return (
            <li key={c.id}>
              <button
                onClick={() => toggle(c.id)}
                className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm transition ${pos >= 0 ? "border-primary" : ""}`}
              >
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${pos >= 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {pos >= 0 ? pos + 1 : "·"}
                </span>
                <span className="truncate">{c.movie?.title ?? c.series?.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending || ranking.length === 0}>
          {existing.length > 0 ? "Update ballot" : "Submit ballot"}
        </Button>
        <Button size="sm" variant="outline" disabled={pending}
          onClick={() => startTransition(async () => { await closePollAction({ pollId: poll.id }); router.refresh(); })}>
          Close & tally
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Swipe deck (framer-motion drag — already a project dependency)**

```tsx
// src/components/features/circles/swipe-deck.tsx
"use client";

import { useState, useTransition } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { castSwipeVoteAction } from "@/server/actions/polls";
import type { getPollsForCircle } from "@/server/services/circles/poll-service";

type Poll = Awaited<ReturnType<typeof getPollsForCircle>>[number];

export function SwipeDeck({ poll }: { poll: Poll }) {
  const votedIds = new Set(poll.votes.filter((v) => v.approve !== null).map((v) => v.candidateId));
  const queue = poll.candidates.filter((c) => !votedIds.has(c.id));
  const [index, setIndex] = useState(0);
  const [matches, setMatches] = useState<number[]>([]);
  const [, startTransition] = useTransition();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-160, 160], [-12, 12]);

  const current = queue[index];

  const vote = (approve: boolean) => {
    if (!current) return;
    const candidateId = current.id;
    setIndex((i) => i + 1);
    x.set(0);
    startTransition(async () => {
      const result = await castSwipeVoteAction({ pollId: poll.id, candidateId, approve });
      if (result.ok && result.data.matchedCandidateIds.length > 0) setMatches(result.data.matchedCandidateIds);
    });
  };

  if (matches.length > 0) {
    const titleOf = (id: number) => {
      const c = poll.candidates.find((x2) => x2.id === id);
      return c?.movie?.title ?? c?.series?.name ?? "?";
    };
    return (
      <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-center">
        <p className="text-sm font-semibold">It&apos;s a match 🎬</p>
        <p className="text-sm">{matches.map(titleOf).join(" · ")}</p>
      </div>
    );
  }
  if (!current) return <p className="mt-2 text-sm text-muted-foreground">You&apos;ve swiped everything — waiting on the others.</p>;

  return (
    <div className="mt-3 flex flex-col items-center">
      <motion.div
        drag="x"
        style={{ x, rotate }}
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={(_e, info) => {
          if (info.offset.x > 120) vote(true);
          else if (info.offset.x < -120) vote(false);
        }}
        className="w-full max-w-[260px] select-none rounded-xl border bg-card p-4 text-center"
      >
        <p className="font-semibold">{current.movie?.title ?? current.series?.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{current.overlapCount}× on watchlists</p>
      </motion.div>
      <div className="mt-3 flex gap-3">
        <Button size="sm" variant="outline" onClick={() => vote(false)}>Pass</Button>
        <Button size="sm" onClick={() => vote(true)}>Watch it</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Mediator picks**

```tsx
// src/components/features/circles/mediator-picks.tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { mediatorPicksAction } from "@/server/actions/polls";
import type { MediatorPick } from "@/server/services/circles/ai-mediator";
import type { PoolFilters } from "@/server/services/circles/poll-service";

export function MediatorPicks({ circleId, filters }: { circleId: number; filters: PoolFilters }) {
  const [picks, setPicks] = useState<MediatorPick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="border-t pt-3">
      <Button size="sm" variant="secondary" disabled={pending}
        onClick={() => startTransition(async () => {
          setError(null);
          const result = await mediatorPicksAction({ circleId, filters });
          if (result.ok) setPicks(result.data);
          else setError(result.error);
        })}>
        {pending ? "Mediating…" : "✨ 3 titles you'll all tolerate"}
      </Button>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {picks ? (
        <ul className="mt-2 space-y-2">
          {picks.map((p) => (
            <li key={p.key} className="rounded-lg border p-2">
              <p className="text-sm font-semibold">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.reason}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Wire into circle page**

In `src/app/circles/[slug]/page.tsx`, add `getPollsForCircle(circle.id, userId)` to the `Promise.all` and pass `polls` through `CircleTabs` to `<CirclePolls circleId={circle.id} polls={polls} />` (replacing the placeholder div).

- [ ] **Step 7: Verify**

Run: `yarn typecheck && yarn lint`
Expected: PASS.
Manual (`yarn dev`): create poll from two accounts' watchlists, swipe all-yes on one title → match banner; ranked flow → close → winner shown.

- [ ] **Step 8: Commit**

```bash
git add src/components/features/circles src/app/circles
git commit -m "feat(phase3): group-decide UI - poll create, ranked ballot, swipe deck, AI mediator"
```

---

### Task 10: Club advance logic — pure functions (TDD)

**Files:**
- Create: `src/server/services/circles/club-advance.ts`
- Test: `src/server/services/circles/club-advance.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/server/services/circles/club-advance.test.ts
import { describe, it, expect } from "vitest";
import { advancePosition, computeNextOpenAt, type EpisodeKey } from "./club-advance";

const EPISODES: EpisodeKey[] = [
  { season: 1, episode: 1 }, { season: 1, episode: 2 }, { season: 1, episode: 3 },
  { season: 2, episode: 1 }, { season: 2, episode: 2 },
];

describe("advancePosition", () => {
  it("opens the first episode from the not-started position (episode 0)", () => {
    const r = advancePosition(EPISODES, { season: 1, episode: 0 }, 1);
    expect(r.opened).toEqual([{ season: 1, episode: 1 }]);
    expect(r.position).toEqual({ season: 1, episode: 1 });
    expect(r.completed).toBe(false);
  });

  it("opens N episodes across a season boundary", () => {
    const r = advancePosition(EPISODES, { season: 1, episode: 2 }, 2);
    expect(r.opened).toEqual([{ season: 1, episode: 3 }, { season: 2, episode: 1 }]);
    expect(r.position).toEqual({ season: 2, episode: 1 });
  });

  it("clamps at the end of the series and reports completion", () => {
    const r = advancePosition(EPISODES, { season: 2, episode: 1 }, 5);
    expect(r.opened).toEqual([{ season: 2, episode: 2 }]);
    expect(r.completed).toBe(true);
  });

  it("is a no-op when already complete", () => {
    const r = advancePosition(EPISODES, { season: 2, episode: 2 }, 1);
    expect(r.opened).toEqual([]);
    expect(r.completed).toBe(true);
  });

  it("ignores specials (season 0 rows must be excluded by the caller) and unknown positions resume from the next known episode", () => {
    const r = advancePosition(EPISODES, { season: 1, episode: 99 }, 1);
    expect(r.opened).toEqual([{ season: 2, episode: 1 }]); // next strictly-after position
  });
});

describe("computeNextOpenAt", () => {
  const from = new Date("2026-06-12T01:00:00Z");
  it("DAILY adds 1 day", () => {
    expect(computeNextOpenAt("DAILY", 1, from).toISOString()).toBe("2026-06-13T01:00:00.000Z");
  });
  it("WEEKLY adds 7 days", () => {
    expect(computeNextOpenAt("WEEKLY", 7, from).toISOString()).toBe("2026-06-19T01:00:00.000Z");
  });
  it("CUSTOM adds intervalDays", () => {
    expect(computeNextOpenAt("CUSTOM", 3, from).toISOString()).toBe("2026-06-15T01:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:unit src/server/services/circles/club-advance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/server/services/circles/club-advance.ts
/**
 * Pure binge-club position math. Episode order is the caller-supplied list
 * (natural keys, season>0 only, sorted season asc / episode asc).
 */
import type { ClubCadence } from "@prisma/client";

export interface EpisodeKey {
  season: number;
  episode: number;
}

export interface AdvanceResult {
  position: EpisodeKey; // last opened episode after the advance
  opened: EpisodeKey[]; // episodes newly opened by this tick (length <= count)
  completed: boolean;   // position is the final episode
}

const cmp = (a: EpisodeKey, b: EpisodeKey): number => a.season - b.season || a.episode - b.episode;

export function advancePosition(episodes: EpisodeKey[], current: EpisodeKey, count: number): AdvanceResult {
  if (episodes.length === 0) return { position: current, opened: [], completed: true };
  // Index of last opened episode; -1 = not started (episode 0 sorts before all)
  let lastIdx = -1;
  for (let i = 0; i < episodes.length; i++) {
    if (cmp(episodes[i], current) <= 0) lastIdx = i;
    else break;
  }
  const opened = episodes.slice(lastIdx + 1, lastIdx + 1 + Math.max(0, count));
  const newIdx = lastIdx + opened.length;
  const position = newIdx >= 0 ? episodes[newIdx] : current;
  return { position, opened, completed: newIdx >= episodes.length - 1 };
}

export function computeNextOpenAt(cadence: ClubCadence, intervalDays: number, from: Date): Date {
  const days = cadence === "DAILY" ? 1 : cadence === "WEEKLY" ? 7 : Math.max(1, intervalDays);
  return new Date(from.getTime() + days * 86_400_000);
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test:unit src/server/services/circles/club-advance.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/circles/club-advance.ts src/server/services/circles/club-advance.test.ts
git commit -m "feat(phase3): pure club advance + cadence math"
```

---

### Task 11: Club service — create, idempotent tick (CAS), threads, notifications, nudges

**Files:**
- Create: `src/server/services/circles/club-service.ts`
- Create: `src/server/actions/clubs.ts`
- Test: `src/server/services/circles/club-service.test.ts`

- [ ] **Step 1: Write the failing tick-idempotency test (the headline test of phase 3)**

```typescript
// src/server/services/circles/club-service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  clubSchedule: { findMany: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  circleMember: { findMany: vi.fn() },
  comment: { create: vi.fn() },
  episode: { findMany: vi.fn() },
  seriesProgress: { findMany: vi.fn() },
  notification: { findFirst: vi.fn() },
  series: { findUnique: vi.fn() },
};
vi.mock("@/server/db/postgres", () => ({ prisma: mockPrisma }));

const notifyUsers = vi.fn();
vi.mock("@/server/services/notifications/notification-service", () => ({
  notifyUsers: (...args: unknown[]) => notifyUsers(...args),
}));
// Phase-4 recap autopost is injected later; mock it out for tick tests.
vi.mock("@/server/services/enrichment/episode-recap", () => ({
  getOrGenerateEpisodeRecap: vi.fn().mockResolvedValue(null),
}));

import { tickClubSchedules } from "./club-service";

const NOW = new Date("2026-06-12T01:00:00Z");
const SCHEDULE = {
  id: 1, circleId: 7, seriesId: 100, cadence: "DAILY" as const, intervalDays: 1,
  episodesPerInterval: 1, currentSeason: 1, currentEpisode: 1,
  nextOpenAt: new Date("2026-06-12T00:00:00Z"), status: "ACTIVE" as const,
};
const EPISODE_ROWS = [
  { episodeNumber: 1, tmdbEpisodeId: 901, name: "Pilot", season: { seasonNumber: 1 } },
  { episodeNumber: 2, tmdbEpisodeId: 902, name: "Two", season: { seasonNumber: 1 } },
  { episodeNumber: 3, tmdbEpisodeId: 903, name: "Three", season: { seasonNumber: 1 } },
];

describe("tickClubSchedules — idempotent CAS tick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.clubSchedule.findMany.mockResolvedValue([SCHEDULE]);
    mockPrisma.episode.findMany.mockResolvedValue(EPISODE_ROWS);
    mockPrisma.series.findUnique.mockResolvedValue({ name: "Test Show" });
    mockPrisma.circleMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }, { userId: 3 }]);
    mockPrisma.seriesProgress.findMany.mockResolvedValue([]);
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.comment.create.mockResolvedValue({ id: 555 });
  });

  it("claims via compare-and-swap, opens the next episode, creates ONE thread, notifies members once", async () => {
    mockPrisma.clubSchedule.updateMany.mockResolvedValue({ count: 1 }); // claim wins
    const result = await tickClubSchedules(NOW);
    expect(result.opened).toBe(1);
    // CAS claim includes the previous nextOpenAt as the guard
    expect(mockPrisma.clubSchedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 1, status: "ACTIVE", nextOpenAt: SCHEDULE.nextOpenAt }),
      })
    );
    // Thread = circle-scoped episode comment (system-authored: userId null)
    expect(mockPrisma.comment.create).toHaveBeenCalledTimes(1);
    const created = mockPrisma.comment.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(created.data).toMatchObject({
      userId: null, circleId: 7, seriesId: 100, seasonNumber: 1, episodeNumber: 2,
      spoilerScope: "EPISODE", scopeSeason: 1, scopeEpisode: 2,
    });
    // Bounded notification: exactly the circle's member list (fan-out ban)
    expect(notifyUsers).toHaveBeenCalledWith([1, 2, 3], "CLUB_EPISODE_OPEN", null, expect.objectContaining({ scheduleId: 1 }));
  });

  it("a concurrent/second tick loses the CAS and does NOTHING (idempotency)", async () => {
    mockPrisma.clubSchedule.updateMany.mockResolvedValue({ count: 0 }); // someone else claimed
    const result = await tickClubSchedules(NOW);
    expect(result.opened).toBe(0);
    expect(mockPrisma.comment.create).not.toHaveBeenCalled();
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("marks COMPLETED when the advance reaches the final episode", async () => {
    mockPrisma.clubSchedule.findMany.mockResolvedValue([{ ...SCHEDULE, currentEpisode: 2 }]);
    mockPrisma.clubSchedule.updateMany.mockResolvedValue({ count: 1 });
    await tickClubSchedules(NOW);
    const update = mockPrisma.clubSchedule.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(update.data.status).toBe("COMPLETED");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:unit src/server/services/circles/club-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the club service**

```typescript
// src/server/services/circles/club-service.ts
/**
 * Binge clubs: scheduled series watches with auto-created, progress-gated
 * circle threads.
 *
 * The tick is IDEMPOTENT by construction: each due schedule is claimed with a
 * compare-and-swap updateMany (guarded on the previous nextOpenAt). PM2 re-runs
 * cron apps on deploy and crashes can rerun a tick — only one claimant ever
 * creates the thread + notifications.
 */
import { ClubStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { requireMembership } from "./circle-service";
import { advancePosition, computeNextOpenAt, type EpisodeKey } from "./club-advance";
import { notifyUsers } from "@/server/services/notifications/notification-service";
import { getOrGenerateEpisodeRecap } from "@/server/services/enrichment/episode-recap"; // phase 4 (Task 17 wires the call site)

export async function createClub(input: {
  circleId: number;
  actorId: number;
  seriesId: number;
  cadence: "DAILY" | "WEEKLY" | "CUSTOM";
  intervalDays: number;
  episodesPerInterval: number;
  startAt: Date;
}): Promise<number> {
  await requireMembership(input.actorId, input.circleId, "ADMIN");
  const episodes = await getOrderedEpisodes(input.seriesId);
  if (episodes.length === 0) throw new Error("Series has no episodes yet — open the series page once to hydrate");
  const club = await prisma.clubSchedule.create({
    data: {
      circleId: input.circleId,
      seriesId: input.seriesId,
      cadence: input.cadence,
      intervalDays: input.cadence === "DAILY" ? 1 : input.cadence === "WEEKLY" ? 7 : input.intervalDays,
      episodesPerInterval: input.episodesPerInterval,
      currentSeason: episodes[0].season,
      currentEpisode: 0, // not started
      nextOpenAt: input.startAt,
      createdById: input.actorId,
    },
  });
  return club.id;
}

interface OrderedEpisode extends EpisodeKey {
  tmdbEpisodeId: number | null;
  name: string | null;
}

/** Episode order from catalog rows (season>0 — specials never schedule). */
async function getOrderedEpisodes(seriesId: number): Promise<OrderedEpisode[]> {
  const rows = await prisma.episode.findMany({
    where: { season: { seriesId, seasonNumber: { gt: 0 } } },
    select: { episodeNumber: true, tmdbEpisodeId: true, name: true, season: { select: { seasonNumber: true } } },
  });
  return rows
    .map((r) => ({ season: r.season.seasonNumber, episode: r.episodeNumber, tmdbEpisodeId: r.tmdbEpisodeId, name: r.name }))
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
}

export interface TickResult {
  due: number;
  opened: number;   // schedules that opened >=1 episode this tick
  nudged: number;   // straggler nudges written
  errors: number;
}

export async function tickClubSchedules(now: Date): Promise<TickResult> {
  const due = await prisma.clubSchedule.findMany({
    where: { status: ClubStatus.ACTIVE, nextOpenAt: { lte: now } },
    orderBy: { nextOpenAt: "asc" },
    take: 200, // safety bound for a 2-vCPU box
  });
  const result: TickResult = { due: due.length, opened: 0, nudged: 0, errors: 0 };

  for (const schedule of due) {
    try {
      const episodes = await getOrderedEpisodes(schedule.seriesId);
      const advance = advancePosition(
        episodes,
        { season: schedule.currentSeason, episode: schedule.currentEpisode },
        schedule.episodesPerInterval
      );

      // Catch-up: if the schedule slept several intervals, advance nextOpenAt past now in one claim.
      let nextOpenAt = computeNextOpenAt(schedule.cadence, schedule.intervalDays, schedule.nextOpenAt);
      while (nextOpenAt <= now) nextOpenAt = computeNextOpenAt(schedule.cadence, schedule.intervalDays, nextOpenAt);

      // ---- CAS claim: only one ticker wins this schedule for this window ----
      const claim = await prisma.clubSchedule.updateMany({
        where: { id: schedule.id, status: ClubStatus.ACTIVE, nextOpenAt: schedule.nextOpenAt },
        data: {
          currentSeason: advance.position.season,
          currentEpisode: advance.position.episode,
          nextOpenAt,
          status: advance.completed ? ClubStatus.COMPLETED : ClubStatus.ACTIVE,
        },
      });
      if (claim.count === 0) continue; // lost the race — another tick already did this
      if (advance.opened.length === 0) continue;
      result.opened++;

      const [series, members] = await Promise.all([
        prisma.series.findUnique({ where: { id: schedule.seriesId }, select: { name: true } }),
        prisma.circleMember.findMany({ where: { circleId: schedule.circleId }, select: { userId: true } }),
      ]);
      const memberIds = members.map((m) => m.userId);
      const seriesName = series?.name ?? "the series";

      for (const ep of advance.opened) {
        const epMeta = episodes.find((e) => e.season === ep.season && e.episode === ep.episode);
        // Auto-created circle episode thread = system comment anchor.
        // Inherits threading/gating/moderation/reactions/notifications for free.
        const thread = await prisma.comment.create({
          data: {
            userId: null, // system-authored
            circleId: schedule.circleId,
            seriesId: schedule.seriesId,
            seasonNumber: ep.season,
            episodeNumber: ep.episode,
            body: `📺 **S${ep.season}E${ep.episode}${epMeta?.name ? ` — ${epMeta.name}` : ""}** of ${seriesName} is open for discussion. Mark it watched, then dive in.`,
            spoilerScope: "EPISODE",
            scopeSeason: ep.season,
            scopeEpisode: ep.episode,
            scopeTmdbEpisodeId: epMeta?.tmdbEpisodeId ?? null,
            status: "PUBLISHED",
          },
          select: { id: true },
        });

        // Phase 4 (Task 17): "Previously on" recap reply — recap covers ONLY
        // episodes BEFORE the opened one, so it is spoiler-safe for the cohort.
        await postRecapReply(schedule.seriesId, ep, thread.id, schedule.circleId, seriesName, episodes);

        // Bounded write: this circle's members ONLY (invariant 6).
        await notifyUsers(memberIds, "CLUB_EPISODE_OPEN", null, {
          scheduleId: schedule.id,
          circleId: schedule.circleId,
          seriesId: schedule.seriesId,
          season: ep.season,
          episode: ep.episode,
          threadCommentId: thread.id,
        });
      }

      result.nudged += await nudgeStragglers(schedule.id, schedule.circleId, schedule.seriesId, advance.position, episodes, memberIds, now);
    } catch (error: unknown) {
      result.errors++;
      dataLogger.error({
        event: "club_tick_error",
        scheduleId: schedule.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  dataLogger.info({ event: "club_tick", ...result });
  return result;
}

/** Task 17 replaces this body with the real recap autopost; until then it no-ops on null recaps. */
async function postRecapReply(
  seriesId: number,
  opened: EpisodeKey,
  threadCommentId: number,
  circleId: number,
  seriesName: string,
  episodes: OrderedEpisode[]
): Promise<void> {
  const idx = episodes.findIndex((e) => e.season === opened.season && e.episode === opened.episode);
  if (idx <= 0) return; // first episode: nothing to recap
  const prev = episodes[idx - 1];
  const recap = await getOrGenerateEpisodeRecap(seriesId, prev.season, prev.episode);
  if (!recap) return;
  await prisma.comment.create({
    data: {
      userId: null,
      parentId: threadCommentId,
      // Replies denormalize anchor columns from root (phase-0 rule)
      circleId,
      seriesId,
      seasonNumber: opened.season,
      episodeNumber: opened.episode,
      body: `🤖 **Previously on ${seriesName}** (through S${prev.season}E${prev.episode}):\n\n${recap}`,
      spoilerScope: "EPISODE",
      scopeSeason: prev.season,
      scopeEpisode: prev.episode,
      status: "PUBLISHED",
    },
  });
}

/**
 * Straggler nudge: members >= 2 intervals behind the club position get at most
 * one CLUB_NUDGE per schedule per 7 days. Dedupe via existing notification
 * lookup (write-on-event; no nudge-state table).
 */
async function nudgeStragglers(
  scheduleId: number,
  circleId: number,
  seriesId: number,
  position: EpisodeKey,
  episodes: OrderedEpisode[],
  memberIds: number[],
  now: Date
): Promise<number> {
  const posIdx = episodes.findIndex((e) => e.season === position.season && e.episode === position.episode);
  if (posIdx < 2) return 0; // not enough runway to be "behind"
  const threshold = episodes[posIdx - 2]; // 2 episodes behind the opened position

  const progress = await prisma.seriesProgress.findMany({
    where: { seriesId, userId: { in: memberIds } },
    select: { userId: true, maxSeasonNumber: true, maxEpisodeNumber: true, status: true },
  });
  const progressByUser = new Map(progress.map((p) => [p.userId, p]));

  let nudged = 0;
  for (const userId of memberIds) {
    const p = progressByUser.get(userId);
    const behind =
      !p ||
      (p.status !== "COMPLETED" &&
        ((p.maxSeasonNumber ?? 0) < threshold.season ||
          ((p.maxSeasonNumber ?? 0) === threshold.season && (p.maxEpisodeNumber ?? 0) < threshold.episode)));
    if (!behind) continue;
    const recent = await prisma.notification.findFirst({
      where: {
        userId,
        type: "CLUB_NUDGE",
        createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
        payload: { path: ["scheduleId"], equals: scheduleId },
      },
      select: { id: true },
    });
    if (recent) continue;
    await notifyUsers([userId], "CLUB_NUDGE", null, {
      scheduleId, circleId, seriesId,
      clubAt: { season: position.season, episode: position.episode },
    } satisfies Prisma.InputJsonValue as Prisma.InputJsonValue);
    nudged++;
  }
  return nudged;
}

/** Club dashboard: every member's watermark vs the schedule position. */
export interface ClubProgressRow {
  userId: number;
  name: string | null;
  image: string | null;
  watermark: EpisodeKey | null;
  caughtUp: boolean;
}

export async function getClubProgress(clubId: number, viewerId: number): Promise<{
  schedule: { id: number; seriesId: number; seriesName: string; cadence: string; episodesPerInterval: number; position: EpisodeKey; nextOpenAt: Date; status: ClubStatus };
  rows: ClubProgressRow[];
}> {
  const schedule = await prisma.clubSchedule.findUniqueOrThrow({
    where: { id: clubId },
    include: { series: { select: { name: true } } },
  });
  await requireMembership(viewerId, schedule.circleId);
  const members = await prisma.circleMember.findMany({
    where: { circleId: schedule.circleId },
    include: { user: { select: { name: true, image: true } } },
  });
  const progress = await prisma.seriesProgress.findMany({
    where: { seriesId: schedule.seriesId, userId: { in: members.map((m) => m.userId) } },
  });
  const byUser = new Map(progress.map((p) => [p.userId, p]));
  const position: EpisodeKey = { season: schedule.currentSeason, episode: schedule.currentEpisode };
  const rows = members.map((m): ClubProgressRow => {
    const p = byUser.get(m.userId);
    const watermark = p?.maxSeasonNumber
      ? { season: p.maxSeasonNumber, episode: p.maxEpisodeNumber ?? 0 }
      : null;
    const caughtUp =
      p?.status === "COMPLETED" ||
      (watermark !== null &&
        (watermark.season > position.season ||
          (watermark.season === position.season && watermark.episode >= position.episode)));
    return { userId: m.userId, name: m.user.name, image: m.user.image, watermark, caughtUp };
  });
  return {
    schedule: {
      id: schedule.id,
      seriesId: schedule.seriesId,
      seriesName: schedule.series.name,
      cadence: schedule.cadence,
      episodesPerInterval: schedule.episodesPerInterval,
      position,
      nextOpenAt: schedule.nextOpenAt,
      status: schedule.status,
    },
    rows,
  };
}

export async function getClubsForCircle(circleId: number, viewerId: number) {
  await requireMembership(viewerId, circleId);
  return prisma.clubSchedule.findMany({
    where: { circleId },
    orderBy: { createdAt: "desc" },
    include: { series: { select: { id: true, name: true, posterPath: true } } },
  });
}
```

- [ ] **Step 4: Run tick tests**

Run: `yarn test:unit src/server/services/circles/club-service.test.ts`
Expected: PASS (3 tests). The phase-4 import is mocked; until Task 16 lands, create a temporary module `src/server/services/enrichment/episode-recap.ts` exporting `export async function getOrGenerateEpisodeRecap(_seriesId: number, _season: number, _episode: number): Promise<string | null> { return null; }` so typecheck passes (Task 16 replaces it wholesale).

- [ ] **Step 5: Club actions**

```typescript
// src/server/actions/clubs.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createClub, getClubProgress } from "@/server/services/circles/club-service";
import { CircleAccessError } from "@/server/services/circles/circle-service";

async function requireUserId(): Promise<number> {
  const session = await auth();
  const id = session?.user?.id ? parseInt(String(session.user.id), 10) : NaN;
  if (!Number.isFinite(id)) throw new Error("UNAUTHENTICATED");
  return id;
}

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toError(error: unknown): string {
  if (error instanceof CircleAccessError) return error.message;
  if (error instanceof Error && error.message === "UNAUTHENTICATED") return "Sign in to continue";
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

const CreateClubSchema = z.object({
  circleId: z.number().int().positive(),
  seriesId: z.number().int().positive(),
  cadence: z.enum(["DAILY", "WEEKLY", "CUSTOM"]),
  intervalDays: z.number().int().min(1).max(30).default(7),
  episodesPerInterval: z.number().int().min(1).max(10).default(1),
  startAtIso: z.string().datetime(),
});

export async function createClubAction(input: z.infer<typeof CreateClubSchema>): Promise<ActionResult<{ clubId: number }>> {
  try {
    const userId = await requireUserId();
    const validated = CreateClubSchema.parse(input);
    const clubId = await createClub({
      circleId: validated.circleId,
      actorId: userId,
      seriesId: validated.seriesId,
      cadence: validated.cadence,
      intervalDays: validated.intervalDays,
      episodesPerInterval: validated.episodesPerInterval,
      startAt: new Date(validated.startAtIso),
    });
    revalidatePath("/circles");
    return { ok: true, data: { clubId } };
  } catch (error: unknown) {
    return { ok: false, error: toError(error) };
  }
}

const ClubIdSchema = z.object({ clubId: z.number().int().positive() });

export async function getClubProgressAction(input: z.infer<typeof ClubIdSchema>) {
  const userId = await requireUserId();
  const { clubId } = ClubIdSchema.parse(input);
  return getClubProgress(clubId, userId);
}
```

- [ ] **Step 6: Typecheck + all circle tests**

Run: `yarn typecheck && yarn test:unit src/server/services/circles/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/circles/club-service.ts src/server/services/circles/club-service.test.ts src/server/actions/clubs.ts src/server/services/enrichment/episode-recap.ts
git commit -m "feat(phase3): club service - CAS-idempotent tick, threads, bounded notifications, nudges"
```

---

### Task 12: Scheduler script + PM2 cron entry (deploy-safe)

**Files:**
- Create: `scripts/club-scheduler.ts`
- Modify: `ecosystem.config.cjs`

- [ ] **Step 1: Write the script (CRON_HOUR_UTC guard — same pattern as `scripts/sync-popularity.ts`)**

```typescript
// scripts/club-scheduler.ts
/**
 * Binge-club scheduler tick. Runs daily via PM2 cron.
 *
 * DEPLOY SAFETY (CLAUDE.md / ecosystem.config.cjs): PM2 re-runs cron_restart
 * apps once on EVERY `pm2 start` (= every deploy). The CRON_HOUR_UTC guard
 * makes deploy-time autostarts exit instantly; FORCE_RUN=1 bypasses for
 * manual runs:  FORCE_RUN=1 npx tsx scripts/club-scheduler.ts
 *
 * The tick itself is idempotent (CAS claim in tickClubSchedules), so even a
 * double-run is harmless — the guard exists to keep deploy-time CPU flat.
 */
import { tickClubSchedules } from "../src/server/services/circles/club-service";
import { refreshStaleCircleEmbeddings } from "../src/server/services/circles/circle-embedding";

function insideCronWindow(): boolean {
  if (process.env.FORCE_RUN === "1") return true;
  const expected = process.env.CRON_HOUR_UTC;
  if (expected === undefined) return true; // not configured: behave as manual
  return String(new Date().getUTCHours()) === expected;
}

async function main(): Promise<void> {
  if (!insideCronWindow()) {
    console.log("[club-scheduler] outside cron window (deploy autostart) — exiting");
    return;
  }
  const startedAt = Date.now();
  const result = await tickClubSchedules(new Date());
  console.log(`[club-scheduler] tick done in ${Date.now() - startedAt}ms`, result);

  // Piggyback the daily circle-taste-centroid refresh (Feed v2 discovery).
  const refreshed = await refreshStaleCircleEmbeddings(25);
  console.log(`[club-scheduler] refreshed ${refreshed} circle embeddings`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("[club-scheduler] fatal", error instanceof Error ? error.message : error);
    process.exit(1);
  });
```

(`circle-embedding.ts` lands in Task 14; if executing strictly in order, comment those two lines until then or do Task 14 first — prefer reordering over dead code.)

- [ ] **Step 2: Add the PM2 app**

Append to the `apps` array in `ecosystem.config.cjs` (after `isr-cache-prune`):

```javascript
    // Binge-club scheduler - daily at 01:00 UTC (06:30 IST: threads open with
    // the IN-heavy audience's morning). CAS-idempotent tick; CRON_HOUR_UTC
    // guard makes deploy autostarts exit instantly. Manual:
    //   FORCE_RUN=1 npx tsx scripts/club-scheduler.ts
    {
      name: "club-scheduler",
      cwd: "/home/ubuntu/movie-browser-next",
      script: "bash",
      args: ["-c", "exec nice -n 19 npx tsx scripts/club-scheduler.ts"],
      cron_restart: "0 1 * * *",
      autorestart: false,
      restart_delay: 5000,
      max_restarts: 2,
      min_uptime: "1s",
      watch: false,
      max_memory_restart: "600M",
      error_file: "./logs/club-scheduler-error.log",
      out_file: "./logs/club-scheduler-out.log",
      log_file: "./logs/club-scheduler-combined.log",
      time: true,
      env: { NODE_ENV: "production", CRON_HOUR_UTC: "1" },
      kill_timeout: 300000, // 5 min — tick is O(due schedules), Bedrock recap calls bounded
    },
```

- [ ] **Step 3: Verify the guard locally**

Run: `npx tsx scripts/club-scheduler.ts` with `CRON_HOUR_UTC=99` env: `CRON_HOUR_UTC=99 npx tsx scripts/club-scheduler.ts`
Expected: prints "outside cron window" and exits 0 immediately.
Run: `FORCE_RUN=1 npx tsx scripts/club-scheduler.ts`
Expected: tick runs against the local DB (0 due schedules is fine), prints the result object, exits 0.

- [ ] **Step 4: Update the PM2 jobs table in `CLAUDE.md`**

Add a row: `| club-scheduler | 01:00 UTC (06:30 IST) | Binge-club tick: open episode threads, CLUB_EPISODE_OPEN notifications, straggler nudges, circle embedding refresh |`

- [ ] **Step 5: Commit**

```bash
git add scripts/club-scheduler.ts ecosystem.config.cjs CLAUDE.md
git commit -m "feat(phase3): club scheduler PM2 cron with deploy-safe CRON_HOUR_UTC guard"
```

---

### Task 13: Club UI — create form, progress dashboard, ICS export

**Files:**
- Create: `src/server/services/circles/club-ics.ts`
- Test: `src/server/services/circles/club-ics.test.ts`
- Create: `src/app/api/circles/[slug]/clubs/[clubId]/calendar/route.ts`
- Create: `src/components/features/circles/create-club-form.tsx`
- Create: `src/components/features/circles/club-card.tsx`
- Create: `src/components/features/circles/circle-clubs.tsx`
- Modify: `src/components/features/circles/circle-tabs.tsx` + `src/app/circles/[slug]/page.tsx` (pass `clubs` from `getClubsForCircle`, render `<CircleClubs ... />` in the clubs tab)

- [ ] **Step 1: Failing ICS test**

```typescript
// src/server/services/circles/club-ics.test.ts
import { describe, it, expect } from "vitest";
import { buildClubIcs } from "./club-ics";

describe("buildClubIcs", () => {
  it("emits one VEVENT per future interval with stable UIDs", () => {
    const ics = buildClubIcs({
      clubId: 5,
      seriesName: "Severance",
      circleName: "Friday Crew",
      cadence: "WEEKLY",
      intervalDays: 7,
      episodesPerInterval: 2,
      upcoming: [
        { openAt: new Date("2026-06-19T01:00:00Z"), episodes: [{ season: 2, episode: 3 }, { season: 2, episode: 4 }] },
        { openAt: new Date("2026-06-26T01:00:00Z"), episodes: [{ season: 2, episode: 5 }] },
      ],
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:club-5-20260619@themoviebrowser.com");
    expect(ics).toContain("SUMMARY:Severance S2E3–S2E4 · Friday Crew");
    expect(ics).toContain("DTSTART:20260619T010000Z");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("escapes commas/semicolons in names", () => {
    const ics = buildClubIcs({
      clubId: 1, seriesName: "A; B, C", circleName: "X", cadence: "DAILY", intervalDays: 1,
      episodesPerInterval: 1,
      upcoming: [{ openAt: new Date("2026-06-13T01:00:00Z"), episodes: [{ season: 1, episode: 1 }] }],
    });
    expect(ics).toContain("A\\; B\\, C"); // "A; B, C" -> "A\; B\, C" on the wire
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement**

Run: `yarn test:unit src/server/services/circles/club-ics.test.ts` — expected FAIL.

```typescript
// src/server/services/circles/club-ics.ts
/** Pure ICS builder for binge-club schedules. RFC 5545, CRLF line endings. */
import type { EpisodeKey } from "./club-advance";

export interface IcsInterval {
  openAt: Date;
  episodes: EpisodeKey[];
}

export interface ClubIcsInput {
  clubId: number;
  seriesName: string;
  circleName: string;
  cadence: string;
  intervalDays: number;
  episodesPerInterval: number;
  upcoming: IcsInterval[];
}

const esc = (s: string): string => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");

const stamp = (d: Date): string =>
  d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const dateKey = (d: Date): string => stamp(d).slice(0, 8);

function episodeLabel(episodes: EpisodeKey[]): string {
  if (episodes.length === 0) return "";
  const first = episodes[0];
  const last = episodes[episodes.length - 1];
  const one = `S${first.season}E${first.episode}`;
  return episodes.length === 1 ? one : `${one}–S${last.season}E${last.episode}`;
}

export function buildClubIcs(input: ClubIcsInput): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Movie Browser//Binge Club//EN",
    `X-WR-CALNAME:${esc(input.seriesName)} · ${esc(input.circleName)}`,
  ];
  for (const interval of input.upcoming) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:club-${input.clubId}-${dateKey(interval.openAt)}@themoviebrowser.com`,
      `DTSTAMP:${stamp(new Date(0))}`, // deterministic for tests; calendar apps tolerate it
      `DTSTART:${stamp(interval.openAt)}`,
      `SUMMARY:${esc(input.seriesName)} ${episodeLabel(interval.episodes)} · ${esc(input.circleName)}`,
      `DESCRIPTION:${esc(`Episode${interval.episodes.length > 1 ? "s" : ""} open for discussion in your circle.`)}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
```

Run: `yarn test:unit src/server/services/circles/club-ics.test.ts` — expected PASS.

- [ ] **Step 3: ICS route (capability auth via inviteCode — calendar apps cannot send cookies)**

```typescript
// src/app/api/circles/[slug]/clubs/[clubId]/calendar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/postgres";
import { buildClubIcs, type IcsInterval } from "@/server/services/circles/club-ics";
import { advancePosition, computeNextOpenAt, type EpisodeKey } from "@/server/services/circles/club-advance";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; clubId: string }> }
): Promise<NextResponse> {
  const { slug, clubId } = await context.params;
  const key = request.nextUrl.searchParams.get("key");
  const id = parseInt(clubId, 10);
  if (!Number.isFinite(id) || !key) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const schedule = await prisma.clubSchedule.findUnique({
    where: { id },
    include: { circle: { select: { slug: true, name: true, inviteCode: true } }, series: { select: { name: true } } },
  });
  // Capability check: the circle's invite code doubles as the calendar key.
  if (!schedule || schedule.circle.slug !== slug || schedule.circle.inviteCode !== key) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await prisma.episode.findMany({
    where: { season: { seriesId: schedule.seriesId, seasonNumber: { gt: 0 } } },
    select: { episodeNumber: true, season: { select: { seasonNumber: true } } },
  });
  const episodes: EpisodeKey[] = rows
    .map((r) => ({ season: r.season.seasonNumber, episode: r.episodeNumber }))
    .sort((a, b) => a.season - b.season || a.episode - b.episode);

  // Project the next 26 intervals (or until series end)
  const upcoming: IcsInterval[] = [];
  let position: EpisodeKey = { season: schedule.currentSeason, episode: schedule.currentEpisode };
  let openAt = schedule.nextOpenAt;
  for (let i = 0; i < 26; i++) {
    const advance = advancePosition(episodes, position, schedule.episodesPerInterval);
    if (advance.opened.length === 0) break;
    upcoming.push({ openAt, episodes: advance.opened });
    position = advance.position;
    if (advance.completed) break;
    openAt = computeNextOpenAt(schedule.cadence, schedule.intervalDays, openAt);
  }

  const ics = buildClubIcs({
    clubId: schedule.id,
    seriesName: schedule.series.name,
    circleName: schedule.circle.name,
    cadence: schedule.cadence,
    intervalDays: schedule.intervalDays,
    episodesPerInterval: schedule.episodesPerInterval,
    upcoming,
  });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="club-${schedule.id}.ics"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
```

- [ ] **Step 4: Clubs tab UI**

```tsx
// src/components/features/circles/circle-clubs.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateClubForm } from "./create-club-form";
import { ClubCard } from "./club-card";
import type { getClubsForCircle } from "@/server/services/circles/club-service";

type Club = Awaited<ReturnType<typeof getClubsForCircle>>[number];

export function CircleClubs({ circleId, circleSlug, clubs, canManage, inviteCode }: {
  circleId: number; circleSlug: string; clubs: Club[]; canManage: boolean; inviteCode: string | null;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-3 pt-2">
      {canManage ? (
        creating
          ? <CreateClubForm circleId={circleId} onDone={() => setCreating(false)} />
          : <Button size="sm" onClick={() => setCreating(true)}>Start a binge club</Button>
      ) : null}
      {clubs.map((club) => (
        <ClubCard key={club.id} club={club} circleSlug={circleSlug} inviteCode={inviteCode} />
      ))}
      {clubs.length === 0 && !creating ? (
        <p className="text-sm text-muted-foreground">Pick a series, set a cadence, and the thread opens itself on schedule.</p>
      ) : null}
    </div>
  );
}
```

```tsx
// src/components/features/circles/create-club-form.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClubAction } from "@/server/actions/clubs";

// Series picker: reuse the existing autocomplete search action
// (src/server/actions/autocomplete.ts) — check its exact export and result
// shape; render series results only, store the picked seriesId.
import { useSeriesPicker } from "./use-series-picker"; // thin wrapper to build in this task around the autocomplete action

export function CreateClubForm({ circleId, onDone }: { circleId: number; onDone: () => void }) {
  const router = useRouter();
  const { query, setQuery, results, picked, pick } = useSeriesPicker();
  const [cadence, setCadence] = useState<"DAILY" | "WEEKLY" | "CUSTOM">("WEEKLY");
  const [intervalDays, setIntervalDays] = useState(7);
  const [episodesPerInterval, setEpisodesPerInterval] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!picked) return;
    startTransition(async () => {
      const result = await createClubAction({
        circleId,
        seriesId: picked.id,
        cadence,
        intervalDays,
        episodesPerInterval,
        startAtIso: new Date(Date.now() + 60_000).toISOString(), // first window: next scheduler tick
      });
      if (result.ok) { onDone(); router.refresh(); }
      else setError(result.error);
    });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      {picked ? (
        <p className="text-sm font-semibold">{picked.name} <button className="ml-2 text-xs underline" onClick={() => pick(null)}>change</button></p>
      ) : (
        <>
          <Input placeholder="Search a series…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="max-h-36 space-y-1 overflow-y-auto text-sm">
            {results.map((r) => (
              <li key={r.id}>
                <button className="w-full rounded p-1.5 text-left hover:bg-muted" onClick={() => pick(r)}>{r.name}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {(["DAILY", "WEEKLY", "CUSTOM"] as const).map((c) => (
          <Button key={c} size="sm" variant={cadence === c ? "default" : "outline"} onClick={() => setCadence(c)}>{c.toLowerCase()}</Button>
        ))}
        {cadence === "CUSTOM" ? (
          <Input type="number" className="w-20" min={1} max={30} value={intervalDays}
            onChange={(e) => setIntervalDays(parseInt(e.target.value, 10) || 7)} />
        ) : null}
        <label className="flex items-center gap-1.5 text-sm">
          <Input type="number" className="w-16" min={1} max={10} value={episodesPerInterval}
            onChange={(e) => setEpisodesPerInterval(parseInt(e.target.value, 10) || 1)} />
          ep/interval
        </label>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !picked}>Create club</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
```

(`use-series-picker.ts`: small hook in the same folder — debounced call to the existing autocomplete server action filtered to series, `results: Array<{ id: number; name: string }>`, `picked`, `pick()`. Match the real autocomplete action signature from `src/server/actions/autocomplete.ts` when implementing.)

```tsx
// src/components/features/circles/club-card.tsx
"use client";

import { useEffect, useState } from "react";
import { getClubProgressAction } from "@/server/actions/clubs";
import type { getClubsForCircle, getClubProgress } from "@/server/services/circles/club-service";

type Club = Awaited<ReturnType<typeof getClubsForCircle>>[number];
type Progress = Awaited<ReturnType<typeof getClubProgress>>;

export function ClubCard({ club, circleSlug, inviteCode }: { club: Club; circleSlug: string; inviteCode: string | null }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => {
    void getClubProgressAction({ clubId: club.id }).then(setProgress);
  }, [club.id]);

  const position = progress?.schedule.position;
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{club.series.name}</p>
          <p className="text-xs text-muted-foreground">
            {club.status === "COMPLETED" ? "Finished 🎉" : position && position.episode > 0
              ? `At S${position.season}E${position.episode} · ${club.cadence.toLowerCase()}`
              : `Starts soon · ${club.cadence.toLowerCase()}`}
          </p>
        </div>
        {inviteCode ? (
          <a className="text-xs underline underline-offset-2"
             href={`/api/circles/${circleSlug}/clubs/${club.id}/calendar?key=${inviteCode}`}>
            📅 .ics
          </a>
        ) : null}
      </div>
      {progress ? (
        <ul className="mt-3 space-y-1.5">
          {progress.rows.map((row) => (
            <li key={row.userId} className="flex items-center justify-between text-sm">
              <span className="truncate">{row.name ?? "Member"}</span>
              <span className={`text-xs ${row.caughtUp ? "text-primary" : "text-muted-foreground"}`}>
                {row.caughtUp ? "caught up" : row.watermark ? `at S${row.watermark.season}E${row.watermark.episode}` : "not started"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Wire the clubs tab** — in `src/app/circles/[slug]/page.tsx` fetch `getClubsForCircle(circle.id, userId)` in the `Promise.all`, pass to `CircleTabs`, replace the `data-slot="circle-clubs"` placeholder with `<CircleClubs circleId={circle.id} circleSlug={circle.slug} clubs={clubs} canManage={circle.role !== "MEMBER"} inviteCode={circle.inviteCode} />`.

- [ ] **Step 6: Verify**

Run: `yarn typecheck && yarn lint && yarn test:unit src/server/services/circles/`
Expected: PASS.
Manual: create a club → `FORCE_RUN=1 npx tsx scripts/club-scheduler.ts` → episode thread appears in the circle's series episode discussion + members get CLUB_EPISODE_OPEN rows; run the script a second time immediately → no duplicate thread (CAS); download the `.ics` and open it.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/circles/club-ics.* src/app/api/circles src/components/features/circles src/app/circles
git commit -m "feat(phase3): club UI - create form, progress dashboard, ICS calendar export"
```

---

### Task 14: Feed v2 — circle content + public-circle discovery

**Files:**
- Create: `src/server/services/circles/circle-embedding.ts`
- Create: `src/server/services/feed/circle-cards.ts`
- Create: `src/components/features/feed/circle-feed-cards.tsx`
- Modify: `src/server/services/feed/feed-service.ts` (phase-2 deliverable: extend the `FeedCard` union + interleave)

- [ ] **Step 1: Circle taste centroid + discovery (pgvector, raw SQL)**

```typescript
// src/server/services/circles/circle-embedding.ts
/**
 * Circle taste centroid = AVG over pgvector embeddings of
 *   (a) titles on the circle's shared lists, and
 *   (b) members' recently watched/liked titles,
 * stored on circles.embedding. Refreshed daily by the club-scheduler tick
 * (NOT on the request path). Drives Feed v2 "public circles you'd fit".
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { getUserTasteEmbedding } from "@/server/services/social/taste-embedding"; // phase-2 deliverable

export async function refreshCircleEmbedding(circleId: number): Promise<boolean> {
  // One statement: centroid over circle-list items + members' recent watch events (90d), capped.
  const updated = await prisma.$executeRaw`
    UPDATE circles SET embedding = sub.centroid FROM (
      SELECT AVG(e.embedding) AS centroid FROM (
        (
          SELECT COALESCE(m.embedding, s.embedding) AS embedding
          FROM list_items li
          JOIN lists l ON l.id = li.list_id AND l.circle_id = ${circleId}
          LEFT JOIN movies m ON m.id = li.movie_id
          LEFT JOIN series s ON s.id = li.series_id
          WHERE COALESCE(m.embedding, s.embedding) IS NOT NULL
          LIMIT 100
        )
        UNION ALL
        (
          SELECT COALESCE(m.embedding, s.embedding) AS embedding
          FROM watch_events we
          JOIN circle_members cm ON cm.user_id = we.user_id AND cm.circle_id = ${circleId}
          LEFT JOIN movies m ON m.id = we.movie_id
          LEFT JOIN series s ON s.id = we.series_id
          WHERE we.created_at > now() - interval '90 days'
            AND COALESCE(m.embedding, s.embedding) IS NOT NULL
          LIMIT 200
        )
      ) e
    ) sub
    WHERE circles.id = ${circleId} AND sub.centroid IS NOT NULL`;
  return updated > 0;
}

/** Daily batch: stalest circles first (bounded for the 2-vCPU box). */
export async function refreshStaleCircleEmbeddings(limit: number): Promise<number> {
  const circles = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM circles
    ORDER BY (embedding IS NULL) DESC, updated_at ASC
    LIMIT ${limit}`;
  let count = 0;
  for (const { id } of circles) {
    try {
      if (await refreshCircleEmbedding(id)) count++;
    } catch (error: unknown) {
      dataLogger.error({ event: "circle_embedding_error", circleId: id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return count;
}

export interface PublicCircleSuggestion {
  id: number;
  name: string;
  slug: string;
  imageUrl: string | null;
  memberCount: number;
  similarity: number;
}

/** "Public circles you'd fit": cosine similarity of user taste vs circle centroid. */
export async function getSuggestedPublicCircles(userId: number, limit = 5): Promise<PublicCircleSuggestion[]> {
  const taste = await getUserTasteEmbedding(userId);
  if (!taste) return [];
  const vector = `[${taste.join(",")}]`;
  return prisma.$queryRaw<PublicCircleSuggestion[]>`
    SELECT c.id, c.name, c.slug, c.image_url AS "imageUrl",
           (SELECT count(*)::int FROM circle_members cm2 WHERE cm2.circle_id = c.id) AS "memberCount",
           1 - (c.embedding <=> ${vector}::vector) AS similarity
    FROM circles c
    WHERE c.is_public = true
      AND c.embedding IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM circle_members cm WHERE cm.circle_id = c.id AND cm.user_id = ${userId})
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT ${Prisma.raw(String(Math.min(limit, 10)))}`;
}
```

- [ ] **Step 2: Circle feed sources (query-time fan-in — bounded by the viewer's memberships)**

```typescript
// src/server/services/feed/circle-cards.ts
/**
 * Feed v2 circle sources. QUERY-TIME FAN-IN over the viewer's circle ids
 * (roadmap §5: "query-time fan-in over follows + circle memberships,
 * bounded, indexed — the fan-out write ban stands").
 */
import { prisma } from "@/server/db/postgres";
import { getSuggestedPublicCircles, type PublicCircleSuggestion } from "@/server/services/circles/circle-embedding";

export interface CircleThreadCard {
  type: "circle_thread";
  circleId: number;
  circleName: string;
  circleSlug: string;
  commentId: number;
  preview: string;
  seriesName: string | null;
  season: number | null;
  episode: number | null;
  at: Date;
}

export interface CirclePollCard {
  type: "circle_poll";
  circleId: number;
  circleName: string;
  circleSlug: string;
  pollId: number;
  title: string;
  mode: "RANKED" | "SWIPE";
  at: Date;
}

export interface ClubMilestoneCard {
  type: "club_milestone";
  circleId: number;
  circleName: string;
  circleSlug: string;
  seriesId: number;
  seriesName: string;
  season: number;
  episode: number;
  at: Date;
}

export interface CircleSuggestionCard {
  type: "circle_suggestion";
  circles: PublicCircleSuggestion[];
}

export type CircleFeedCard = CircleThreadCard | CirclePollCard | ClubMilestoneCard | CircleSuggestionCard;

export async function getCircleFeedCards(userId: number, since: Date): Promise<CircleFeedCard[]> {
  const circleIds = (
    await prisma.circleMember.findMany({ where: { userId }, select: { circleId: true } })
  ).map((m) => m.circleId);

  const cards: CircleFeedCard[] = [];
  if (circleIds.length > 0) {
    const [threads, polls, milestones] = await Promise.all([
      // Recent root comments in my circles (uses @@index([circleId]) + createdAt sort)
      prisma.comment.findMany({
        where: { circleId: { in: circleIds }, parentId: null, status: "PUBLISHED", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { circle: { select: { name: true, slug: true } }, series: { select: { name: true } } },
      }),
      prisma.circlePoll.findMany({
        where: { circleId: { in: circleIds }, status: "OPEN", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { circle: { select: { name: true, slug: true } } },
      }),
      prisma.clubSchedule.findMany({
        where: { circleId: { in: circleIds }, updatedAt: { gte: since }, currentEpisode: { gt: 0 } },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: { circle: { select: { name: true, slug: true } }, series: { select: { id: true, name: true } } },
      }),
    ]);
    for (const t of threads) {
      if (!t.circle) continue;
      cards.push({
        type: "circle_thread",
        circleId: t.circleId as number,
        circleName: t.circle.name,
        circleSlug: t.circle.slug,
        commentId: t.id,
        preview: t.body.slice(0, 140),
        seriesName: t.series?.name ?? null,
        season: t.seasonNumber,
        episode: t.episodeNumber,
        at: t.createdAt,
      });
    }
    for (const p of polls) {
      cards.push({
        type: "circle_poll", circleId: p.circleId, circleName: p.circle.name, circleSlug: p.circle.slug,
        pollId: p.id, title: p.title, mode: p.mode, at: p.createdAt,
      });
    }
    for (const m of milestones) {
      cards.push({
        type: "club_milestone", circleId: m.circleId, circleName: m.circle.name, circleSlug: m.circle.slug,
        seriesId: m.series.id, seriesName: m.series.name, season: m.currentSeason, episode: m.currentEpisode, at: m.updatedAt,
      });
    }
  }

  // Discovery garnish: at most one suggestion card per feed load.
  const suggestions = await getSuggestedPublicCircles(userId, 4);
  if (suggestions.length > 0) cards.push({ type: "circle_suggestion", circles: suggestions });
  return cards;
}
```

- [ ] **Step 3: Extend feed-service**

In `src/server/services/feed/feed-service.ts` (phase-2 deliverable):
1. `import { getCircleFeedCards, type CircleFeedCard } from "./circle-cards";`
2. Widen the union: `export type FeedCard = <existing members> | CircleFeedCard;`
3. In `getFeed`, add `getCircleFeedCards(userId, since)` to the existing `Promise.all` of sources and merge into the interleave/rank step (circle cards rank with recency like follow cards; the `circle_suggestion` card is pinned at position ~6, max one). Keep the feed per-user, logged-in, client-fetched — never edge-cached (roadmap §5).

- [ ] **Step 4: Card renderers**

```tsx
// src/components/features/feed/circle-feed-cards.tsx
import Link from "next/link";
import type { CircleFeedCard } from "@/server/services/feed/circle-cards";

export function CircleFeedCardView({ card }: { card: CircleFeedCard }) {
  switch (card.type) {
    case "circle_thread":
      return (
        <Link href={`/circles/${card.circleSlug}`} className="block rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">{card.circleName}{card.seriesName ? ` · ${card.seriesName}${card.season ? ` S${card.season}E${card.episode}` : ""}` : ""}</p>
          <p className="mt-1 line-clamp-2 text-sm">{card.preview}</p>
        </Link>
      );
    case "circle_poll":
      return (
        <Link href={`/circles/${card.circleSlug}`} className="block rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">{card.circleName} · poll</p>
          <p className="mt-1 text-sm font-semibold">{card.title}</p>
          <p className="text-xs text-muted-foreground">{card.mode === "SWIPE" ? "Swipe to match" : "Rank your picks"}</p>
        </Link>
      );
    case "club_milestone":
      return (
        <Link href={`/circles/${card.circleSlug}`} className="block rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">{card.circleName} · binge club</p>
          <p className="mt-1 text-sm"><span className="font-semibold">{card.seriesName}</span> S{card.season}E{card.episode} is open</p>
        </Link>
      );
    case "circle_suggestion":
      return (
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Circles you&apos;d fit</p>
          <ul className="mt-2 space-y-2">
            {card.circles.map((c) => (
              <li key={c.id}>
                <Link href={`/circles/${c.slug}`} className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">{c.memberCount} members</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}
```

Register `CircleFeedCardView` in the phase-2 feed card renderer registry (switch on `card.type` — add the four new cases).

- [ ] **Step 5: Verify**

Run: `yarn typecheck && yarn lint`
Expected: PASS.
Manual: with a circle that has chat + an open poll + a started club, the feed shows the three card kinds; a second account with similar taste and zero circles sees the suggestion card (after `FORCE_RUN=1 npx tsx scripts/club-scheduler.ts` populates circle embeddings).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/circles/circle-embedding.ts src/server/services/feed src/components/features/feed
git commit -m "feat(phase3): feed v2 - circle fan-in cards + embedding-based circle discovery"
```

---

# PHASE 4 — AI Second Screen

### Task 15: Episode recap service — spoiler-disciplined input filter (TDD)

**Files:**
- Replace: `src/server/services/enrichment/episode-recap.ts` (the Task-11 stub)
- Test: `src/server/services/enrichment/episode-recap.test.ts`

The non-negotiable: **a recap of S2E5 is generated from inputs ≤ S2E5 only.** The filter is a pure function and the prompt builder takes only its output, so the property is testable without mocking Bedrock.

- [ ] **Step 1: Write the failing tests (the headline test of phase 4)**

```typescript
// src/server/services/enrichment/episode-recap.test.ts
import { describe, it, expect } from "vitest";
import { filterEpisodesUpTo, buildRecapPrompt, type RecapEpisodeInput } from "./episode-recap";

const EPISODES: RecapEpisodeInput[] = [
  { season: 1, episode: 1, name: "Pilot", overview: "Walt starts cooking." },
  { season: 1, episode: 2, name: "Cat", overview: "Disposal goes wrong." },
  { season: 2, episode: 1, name: "Seven", overview: "Tuco escalates." },
  { season: 2, episode: 2, name: "Grilled", overview: "Desert standoff SECRET-FUTURE-A." },
  { season: 3, episode: 1, name: "No Mas", overview: "SECRET-FUTURE-B aftermath." },
];

describe("filterEpisodesUpTo — the spoiler boundary", () => {
  it("includes everything at or before the watermark, in order", () => {
    const result = filterEpisodesUpTo(EPISODES, 2, 1);
    expect(result.map((e) => `${e.season}.${e.episode}`)).toEqual(["1.1", "1.2", "2.1"]);
  });

  it("excludes later episodes of the SAME season (the off-by-one trap)", () => {
    const result = filterEpisodesUpTo(EPISODES, 2, 1);
    expect(result.some((e) => e.season === 2 && e.episode === 2)).toBe(false);
  });

  it("excludes season-0 specials regardless of watermark", () => {
    const withSpecial = [{ season: 0, episode: 1, name: "Special", overview: "x" }, ...EPISODES];
    const result = filterEpisodesUpTo(withSpecial, 1, 1);
    expect(result).toEqual([EPISODES[0]]);
  });

  it("returns empty for a watermark before the first episode", () => {
    expect(filterEpisodesUpTo(EPISODES, 1, 0)).toEqual([]);
  });
});

describe("buildRecapPrompt — nothing beyond the watermark reaches the model", () => {
  it("contains no future episode titles or overviews (S2E5 recap uses only <= S2E5 inputs)", () => {
    const { systemPrompt, userPrompt } = buildRecapPrompt("Breaking Bad", filterEpisodesUpTo(EPISODES, 2, 1));
    const all = systemPrompt + userPrompt;
    expect(all).not.toContain("SECRET-FUTURE-A");
    expect(all).not.toContain("SECRET-FUTURE-B");
    expect(all).not.toContain("Grilled");
    expect(all).not.toContain("No Mas");
    expect(all).toContain("Tuco escalates."); // target episode IS included
  });

  it("compresses deep history: older episodes appear as titles only, last 5 keep overviews", () => {
    const many: RecapEpisodeInput[] = Array.from({ length: 12 }, (_v, i) => ({
      season: 1, episode: i + 1, name: `Ep${i + 1}.`, overview: `OV-${i + 1}-END`,
    }));
    const { userPrompt } = buildRecapPrompt("Show", many);
    expect(userPrompt).toContain("Ep1.");          // title survives in the compressed list
    expect(userPrompt).not.toContain("OV-1-END");  // early overview compressed away
    expect(userPrompt).toContain("OV-12-END");     // target overview kept
  });

  it("instructs the model to never go beyond the final listed episode", () => {
    const { systemPrompt } = buildRecapPrompt("Show", filterEpisodesUpTo(EPISODES, 1, 2));
    expect(systemPrompt).toMatch(/only.*(listed|provided)/i);
    expect(systemPrompt).toMatch(/no speculation|never reference|do not mention/i);
  });

  it("throws if given an empty episode list (nothing to recap)", () => {
    expect(() => buildRecapPrompt("Show", [])).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:unit src/server/services/enrichment/episode-recap.test.ts`
Expected: FAIL — exports missing (file is the Task-11 stub).

- [ ] **Step 3: Implement (replaces the stub entirely)**

```typescript
// src/server/services/enrichment/episode-recap.ts
/**
 * Episode-scoped AI recaps (phase 4).
 *
 * SPOILER DISCIPLINE (hard): the recap of (S, E) is generated from catalog
 * inputs at or before (S, E) ONLY. filterEpisodesUpTo is the single boundary;
 * buildRecapPrompt accepts only its output. Tests pin the property.
 *
 * Storage: episode_ai_data — natural keys + soft tmdb_episode_id (invariant 1;
 * NEVER FK onto episodes rows). Generation: callBedrockFlex (Flex 50% off),
 * deduped in-memory like progressive enrichment, concurrency-capped.
 */
import pLimit from "p-limit";
import { prisma } from "@/server/db/postgres";
import { aiLogger } from "@/lib/logger";
import { callBedrockFlex } from "./bedrock-flex";
import { trackAIUsage } from "@/lib/analytics/track";

export interface RecapEpisodeInput {
  season: number;
  episode: number;
  name: string | null;
  overview: string | null;
}

const RECENT_WITH_OVERVIEW = 5;
const limit = pLimit(2); // 2-vCPU box; recaps are background-ish

/** PURE. The one and only spoiler boundary. Season-0 specials never qualify. */
export function filterEpisodesUpTo(
  episodes: RecapEpisodeInput[],
  season: number,
  episode: number
): RecapEpisodeInput[] {
  return episodes
    .filter((e) => e.season > 0 && (e.season < season || (e.season === season && e.episode <= episode)))
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
}

/** PURE. Takes ONLY the filtered list — by construction nothing beyond the watermark exists here. */
export function buildRecapPrompt(
  seriesName: string,
  episodesUpToTarget: RecapEpisodeInput[]
): { systemPrompt: string; userPrompt: string } {
  if (episodesUpToTarget.length === 0) throw new Error("No episodes to recap");
  const target = episodesUpToTarget[episodesUpToTarget.length - 1];
  const history = episodesUpToTarget.slice(0, -1);
  const compressed = history.length > RECENT_WITH_OVERVIEW
    ? history.slice(0, history.length - RECENT_WITH_OVERVIEW)
    : [];
  const recent = history.slice(compressed.length);

  const systemPrompt = `You write concise, spoiler-bounded TV episode recaps.

RULES (all hard):
- Recap ONLY the events of the listed episodes. The final listed episode is the latest the reader has seen.
- Never reference, foreshadow, or hint at anything not in the provided episode data. No speculation about what happens next.
- 3-5 sentences, present tense, neutral tone. Name characters and concrete events from the overviews.
- Do not address the reader, do not mention "the viewer", and never describe people's tastes — only the show's content.
- Output plain prose only.`;

  const lines: string[] = [`SERIES: ${seriesName}`];
  if (compressed.length > 0) {
    lines.push("EARLIER EPISODES (titles only):");
    lines.push(compressed.map((e) => `- S${e.season}E${e.episode}${e.name ? ` ${e.name}` : ""}`).join("\n"));
  }
  if (recent.length > 0) {
    lines.push("RECENT EPISODES:");
    lines.push(recent.map((e) => `- S${e.season}E${e.episode}${e.name ? ` ${e.name}` : ""}: ${e.overview ?? "(no synopsis)"}`).join("\n"));
  }
  lines.push(`EPISODE TO RECAP (the latest seen): S${target.season}E${target.episode}${target.name ? ` ${target.name}` : ""}: ${target.overview ?? "(no synopsis)"}`);
  lines.push("Write the recap covering the story SO FAR through this episode.");

  return { systemPrompt, userPrompt: lines.join("\n\n") };
}

async function getEpisodeRows(seriesId: number): Promise<Array<RecapEpisodeInput & { tmdbEpisodeId: number | null }>> {
  const rows = await prisma.episode.findMany({
    where: { season: { seriesId } },
    select: {
      episodeNumber: true, name: true, overview: true, tmdbEpisodeId: true,
      season: { select: { seasonNumber: true } },
    },
  });
  return rows.map((r) => ({
    season: r.season.seasonNumber,
    episode: r.episodeNumber,
    name: r.name,
    overview: r.overview,
    tmdbEpisodeId: r.tmdbEpisodeId,
  }));
}

// Dedup concurrent generation per (series, season, episode) — progressive-enrichment pattern.
const inFlight = new Map<string, Promise<string | null>>();

export async function getOrGenerateEpisodeRecap(
  seriesId: number,
  season: number,
  episode: number
): Promise<string | null> {
  const existing = await prisma.episodeAiData.findUnique({
    where: { seriesId_seasonNumber_episodeNumber: { seriesId, seasonNumber: season, episodeNumber: episode } },
    select: { recap: true },
  });
  if (existing?.recap) return existing.recap;

  const key = `${seriesId}:${season}:${episode}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = limit(async (): Promise<string | null> => {
    try {
      const series = await prisma.series.findUnique({ where: { id: seriesId }, select: { name: true } });
      if (!series) return null;
      const allRows = await getEpisodeRows(seriesId);
      const safe = filterEpisodesUpTo(allRows, season, episode); // THE boundary
      if (safe.length === 0) return null;
      const target = safe[safe.length - 1];
      if (target.season !== season || target.episode !== episode) return null; // target not in catalog yet
      if (!target.overview) return null; // nothing factual to recap — skip rather than hallucinate

      const { systemPrompt, userPrompt } = buildRecapPrompt(series.name, safe);
      const startedAt = Date.now();
      const result = await callBedrockFlex({
        messages: [{ role: "user", text: userPrompt }],
        systemPrompt,
        maxTokens: 350,
        temperature: 0.3,
        useFlex: true,
      });
      trackAIUsage({
        queryType: "episode_recap",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: Date.now() - startedAt,
      });
      const recap = result.output.trim();
      if (recap.length < 40) return null;

      const tmdbEpisodeId = allRows.find((r) => r.season === season && r.episode === episode)?.tmdbEpisodeId ?? null;
      await prisma.episodeAiData.upsert({
        where: { seriesId_seasonNumber_episodeNumber: { seriesId, seasonNumber: season, episodeNumber: episode } },
        create: {
          seriesId, seasonNumber: season, episodeNumber: episode, tmdbEpisodeId,
          recap, generatedAt: new Date(), modelId: "moonshotai.kimi-k2.5",
        },
        update: { recap, generatedAt: new Date(), version: { increment: 1 }, tmdbEpisodeId },
      });
      return recap;
    } catch (error: unknown) {
      aiLogger.error({
        event: "episode_recap_error", seriesId, season, episode,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      inFlight.delete(key);
    }
  });
  inFlight.set(key, promise);
  return promise;
}

export interface RecapChainItem {
  season: number;
  episode: number;
  name: string | null;
  recap: string | null;
}

/**
 * "Recap to where I am": cached recaps for the last `count` episodes up to the
 * watermark. Only the LATEST missing one is generated on demand (await);
 * earlier gaps fill lazily on later visits — bounded latency on the page.
 */
export async function getRecapChain(
  seriesId: number,
  watermark: { season: number; episode: number },
  count = 3
): Promise<RecapChainItem[]> {
  const allRows = await getEpisodeRows(seriesId);
  const safe = filterEpisodesUpTo(allRows, watermark.season, watermark.episode);
  const window = safe.slice(-count);
  if (window.length === 0) return [];

  const cached = await prisma.episodeAiData.findMany({
    where: {
      seriesId,
      OR: window.map((e) => ({ seasonNumber: e.season, episodeNumber: e.episode })),
    },
    select: { seasonNumber: true, episodeNumber: true, recap: true },
  });
  const byKey = new Map(cached.map((c) => [`${c.seasonNumber}:${c.episodeNumber}`, c.recap]));

  const items: RecapChainItem[] = window.map((e) => ({
    season: e.season, episode: e.episode, name: e.name,
    recap: byKey.get(`${e.season}:${e.episode}`) ?? null,
  }));
  const latest = items[items.length - 1];
  if (latest.recap === null) {
    latest.recap = await getOrGenerateEpisodeRecap(seriesId, latest.season, latest.episode);
  }
  return items;
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test:unit src/server/services/enrichment/episode-recap.test.ts`
Expected: PASS (9 tests).
Also re-run: `yarn test:unit src/server/services/circles/club-service.test.ts` — still PASS (its mock of this module matches the real export name).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/enrichment/episode-recap.ts src/server/services/enrichment/episode-recap.test.ts
git commit -m "feat(phase4): episode recaps with hard watermark input filter + flex generation"
```

---

### Task 16: "Recap to where I am" on series pages

**Files:**
- Create: `src/server/actions/recaps.ts`
- Create: `src/components/features/series/recap-panel.tsx`
- Modify: `src/app/series/[seriesId]/[[...slug]]/page.tsx` (mount the panel; find the section below the seasons/overview block — match surrounding Suspense patterns)

- [ ] **Step 1: Server action (reads the viewer's watermark — the recap can never exceed it)**

```typescript
// src/server/actions/recaps.ts
"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { getSpoilerWatermark } from "@/server/services/progress/spoiler-gate"; // phase-1 deliverable
import { getRecapChain, type RecapChainItem } from "@/server/services/enrichment/episode-recap";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";

const Schema = z.object({ seriesId: z.number().int().positive() });

export type RecapToHereResult =
  | { state: "anonymous" }
  | { state: "no_progress" }
  | { state: "ready"; watermark: { season: number; episode: number }; items: RecapChainItem[] };

export async function getRecapToProgress(input: z.infer<typeof Schema>): Promise<RecapToHereResult> {
  try {
    const session = await auth();
    if (!session?.user) return { state: "anonymous" };
    const userId = parseInt(String(session.user.id), 10);
    const { seriesId } = Schema.parse(input);

    const watermark = await getSpoilerWatermark(userId, seriesId);
    if (watermark === null) return { state: "no_progress" };

    let position: { season: number; episode: number };
    if (watermark === "COMPLETED") {
      // Completed: recap chain up to the finale.
      const last = await prisma.episode.findFirst({
        where: { season: { seriesId, seasonNumber: { gt: 0 } } },
        orderBy: [{ season: { seasonNumber: "desc" } }, { episodeNumber: "desc" }],
        select: { episodeNumber: true, season: { select: { seasonNumber: true } } },
      });
      if (!last) return { state: "no_progress" };
      position = { season: last.season.seasonNumber, episode: last.episodeNumber };
    } else {
      position = watermark;
    }

    const items = await getRecapChain(seriesId, position, 3);
    return { state: "ready", watermark: position, items };
  } catch (error: unknown) {
    dataLogger.error({ action: "getRecapToProgress", error: error instanceof Error ? error.message : String(error) });
    return { state: "no_progress" };
  }
}
```

- [ ] **Step 2: Panel component (client, lazy — recap fetch may trigger one Bedrock call)**

```tsx
// src/components/features/series/recap-panel.tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getRecapToProgress, type RecapToHereResult } from "@/server/actions/recaps";

export function RecapPanel({ seriesId }: { seriesId: number }) {
  const [result, setResult] = useState<RecapToHereResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result === null) {
    return (
      <section className="mt-6">
        <Button variant="secondary" size="sm" disabled={pending}
          onClick={() => startTransition(async () => setResult(await getRecapToProgress({ seriesId })))}>
          {pending ? "Catching you up…" : "🧠 Recap to where I am"}
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">Spoiler-safe: only covers episodes you&apos;ve marked watched.</p>
      </section>
    );
  }
  if (result.state === "anonymous") {
    return <p className="mt-6 text-sm text-muted-foreground">Sign in and track your progress to get a personal, spoiler-safe recap.</p>;
  }
  if (result.state === "no_progress") {
    return <p className="mt-6 text-sm text-muted-foreground">Mark some episodes watched first — then I can catch you up to exactly there.</p>;
  }
  return (
    <section className="mt-6 rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Previously, through S{result.watermark.season}E{result.watermark.episode}
      </h3>
      <ol className="mt-3 space-y-3">
        {result.items.map((item) => (
          <li key={`${item.season}-${item.episode}`}>
            <p className="text-xs font-semibold text-muted-foreground">
              S{item.season}E{item.episode}{item.name ? ` · ${item.name}` : ""}
            </p>
            <p className="mt-0.5 text-sm leading-relaxed">
              {item.recap ?? "Recap still generating — check back in a minute."}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 3: Mount on the series detail page**

In `src/app/series/[seriesId]/[[...slug]]/page.tsx`, render `<RecapPanel seriesId={numericSeriesId} />` after the hero/overview section (the panel is self-gating: button-first, no layout shift, nothing fetched until tapped — keeps the SEO page anon-cacheable per edge-cache invariant 8: no progress-dependent content in cacheable HTML; the recap loads via a user-initiated server action).

- [ ] **Step 4: Verify**

Run: `yarn typecheck && yarn lint`
Expected: PASS.
Manual: account with `series_progress` at S1E3 of a hydrated series → tap the button → 3-item chain ending exactly at S1E3 (never beyond); anonymous → sign-in nudge.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/recaps.ts src/components/features/series/recap-panel.tsx "src/app/series/[seriesId]"
git commit -m "feat(phase4): recap-to-my-progress panel on series pages"
```

---

### Task 17: Agent tool `get_progress_context` + spoiler-safety system rule (TDD)

**Files:**
- Create: `src/server/ai/tools/progress-context.ts`
- Test: `src/server/ai/tools/progress-context.test.ts`
- Modify: `src/server/ai/tools/index.ts` (register — 12 tools)
- Modify: `src/server/ai/prompts/system.ts` (hard rule)
- Modify: `.claude/rules/ai-agent.md` (tool count + description)

- [ ] **Step 1: Write the failing tool-contract tests**

```typescript
// src/server/ai/tools/progress-context.test.ts
import { describe, it, expect } from "vitest";
import { buildProgressContext, type ProgressEpisode } from "./progress-context";

const EPISODES: ProgressEpisode[] = [
  { season: 1, episode: 1, name: "Pilot" },
  { season: 1, episode: 2, name: "Two" },
  { season: 1, episode: 3, name: "SECRET-TITLE-FUTURE" },
  { season: 2, episode: 1, name: "ALSO-FUTURE" },
];

describe("buildProgressContext — tool contract", () => {
  it("returns watermark + watched-episode metadata, nothing beyond", () => {
    const ctx = buildProgressContext("Show", { season: 1, episode: 2 }, EPISODES);
    expect(ctx.watermark).toEqual({ season: 1, episode: 2 });
    expect(ctx.watchedEpisodes.map((e) => e.name)).toEqual(["Pilot", "Two"]);
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain("SECRET-TITLE-FUTURE"); // future titles never leak
    expect(serialized).not.toContain("ALSO-FUTURE");
  });

  it("exposes nextEpisode position ONLY (no title, no overview)", () => {
    const ctx = buildProgressContext("Show", { season: 1, episode: 2 }, EPISODES);
    expect(ctx.nextEpisode).toEqual({ season: 1, episode: 3 });
    expect(JSON.stringify(ctx.nextEpisode)).not.toContain("name");
  });

  it("COMPLETED watermark exposes the full episode list", () => {
    const ctx = buildProgressContext("Show", "COMPLETED", EPISODES);
    expect(ctx.watermark).toBe("COMPLETED");
    expect(ctx.watchedEpisodes).toHaveLength(4);
    expect(ctx.nextEpisode).toBeNull();
  });

  it("null progress yields an explicit no-progress contract with a hard rule", () => {
    const ctx = buildProgressContext("Show", null, EPISODES);
    expect(ctx.watermark).toBeNull();
    expect(ctx.watchedEpisodes).toEqual([]);
    expect(ctx.spoilerRule).toMatch(/has not watched|no progress/i);
  });

  it("always carries an imperative spoiler rule naming the boundary", () => {
    const ctx = buildProgressContext("Show", { season: 1, episode: 2 }, EPISODES);
    expect(ctx.spoilerRule).toContain("S1E2");
    expect(ctx.spoilerRule).toMatch(/never|do not/i);
  });

  it("caps watchedEpisodes at the 10 most recent (token budget)", () => {
    const many: ProgressEpisode[] = Array.from({ length: 30 }, (_v, i) => ({ season: 1, episode: i + 1, name: `E${i + 1}` }));
    const ctx = buildProgressContext("Show", { season: 1, episode: 25 }, many);
    expect(ctx.watchedEpisodes).toHaveLength(10);
    expect(ctx.watchedEpisodes[9]).toMatchObject({ episode: 25 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:unit src/server/ai/tools/progress-context.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tool**

```typescript
// src/server/ai/tools/progress-context.ts
/**
 * get_progress_context — the spoiler-safety tool (phase 4).
 *
 * Returns the user's lifetime watch watermark for a series plus SAFE episode
 * metadata (titles only up to the watermark; next episode as bare position).
 * The agent's system prompt carries the matching hard rule: never reference
 * events beyond the watermark.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { prisma } from "@/server/db/postgres";
import { aiToolLogger } from "@/lib/logger";
import { getUserIdFromConfig } from "../utils";
import type { PageContext } from "../state";
import { getSpoilerWatermark } from "@/server/services/progress/spoiler-gate"; // phase-1 deliverable

export interface ProgressEpisode {
  season: number;
  episode: number;
  name: string | null;
}

export interface ProgressContextResult {
  seriesId: number;
  seriesName: string;
  watermark: { season: number; episode: number } | "COMPLETED" | null;
  /** Last <=10 episodes the user has seen: position + title ONLY (no overviews — they may carry spoilers for replies). */
  watchedEpisodes: ProgressEpisode[];
  /** Bare position of the next unseen episode. NO title, NO metadata. */
  nextEpisode: { season: number; episode: number } | null;
  /** Imperative rule the model must obey verbatim. */
  spoilerRule: string;
}

/** PURE — the tool contract, pinned by tests. */
export function buildProgressContext(
  seriesName: string,
  watermark: { season: number; episode: number } | "COMPLETED" | null,
  episodes: ProgressEpisode[]
): Omit<ProgressContextResult, "seriesId"> & { seriesName: string } {
  const ordered = [...episodes]
    .filter((e) => e.season > 0)
    .sort((a, b) => a.season - b.season || a.episode - b.episode);

  if (watermark === null) {
    return {
      seriesName,
      watermark: null,
      watchedEpisodes: [],
      nextEpisode: ordered.length > 0 ? { season: ordered[0].season, episode: ordered[0].episode } : null,
      spoilerRule: `The user has not watched ${seriesName}. Do not reveal ANY plot details beyond premise-level information.`,
    };
  }
  if (watermark === "COMPLETED") {
    return {
      seriesName,
      watermark: "COMPLETED",
      watchedEpisodes: ordered.slice(-10),
      nextEpisode: null,
      spoilerRule: `The user has finished ${seriesName}. All episodes may be discussed freely.`,
    };
  }
  const seen = ordered.filter(
    (e) => e.season < watermark.season || (e.season === watermark.season && e.episode <= watermark.episode)
  );
  const next = ordered.find(
    (e) => e.season > watermark.season || (e.season === watermark.season && e.episode > watermark.episode)
  );
  return {
    seriesName,
    watermark,
    watchedEpisodes: seen.slice(-10),
    nextEpisode: next ? { season: next.season, episode: next.episode } : null,
    spoilerRule: `The user has watched ${seriesName} through S${watermark.season}E${watermark.episode}. NEVER reference, hint at, or confirm anything from later episodes — if asked, say it's beyond where they've watched and offer no details.`,
  };
}

export const getProgressContextTool = tool(
  async (input: { seriesId?: number }, config?: RunnableConfig) => {
    const userId = getUserIdFromConfig(config);
    const pageContext = config?.configurable?.pageContext as PageContext | undefined;
    const seriesId =
      input.seriesId ??
      (pageContext?.mediaType === "series" ? pageContext.itemId : undefined);

    if (!seriesId) {
      return JSON.stringify({ error: "No series in scope", hint: "Pass seriesId or call from a series page." });
    }
    if (!userId) {
      return JSON.stringify({ error: "Not logged in", hint: "Treat the user as having watched nothing; stay premise-level." });
    }
    try {
      const [series, watermark, rows] = await Promise.all([
        prisma.series.findUnique({ where: { id: seriesId }, select: { name: true } }),
        getSpoilerWatermark(userId, seriesId),
        prisma.episode.findMany({
          where: { season: { seriesId } },
          select: { episodeNumber: true, name: true, season: { select: { seasonNumber: true } } },
        }),
      ]);
      if (!series) return JSON.stringify({ error: "Series not found" });
      const episodes: ProgressEpisode[] = rows.map((r) => ({
        season: r.season.seasonNumber, episode: r.episodeNumber, name: r.name,
      }));
      const context = buildProgressContext(series.name, watermark, episodes);
      const result: ProgressContextResult = { seriesId, ...context };
      return JSON.stringify(result);
    } catch (error: unknown) {
      aiToolLogger.error({
        event: "tool_error", tool: "get_progress_context",
        error: error instanceof Error ? error.message : String(error),
      });
      return JSON.stringify({ error: "Failed to fetch progress context" });
    }
  },
  {
    name: "get_progress_context",
    description: `Get the user's watch progress (watermark) for a series, with spoiler-safe episode metadata and a hard spoiler rule.

Use when: The user asks ANYTHING plot-related about a series they may be mid-watch — "who is that?", "why did X do that?", "recap me", "what did I miss?" — ALWAYS call this BEFORE answering plot questions about a series.
Don't use when: Questions about movies, casting/production trivia with no plot content, or series the conversation establishes the user has fully finished.

Params: seriesId (optional — defaults to the series page the user is currently viewing).
Returns: watermark (S/E or COMPLETED or null), recent watched episode titles, next episode position (position only), and a spoilerRule you MUST obey verbatim.`,
    schema: z.object({
      seriesId: z.number().optional().describe("TMDB series id; omit to use the current series page"),
    }),
  }
);
```

- [ ] **Step 4: Run tests**

Run: `yarn test:unit src/server/ai/tools/progress-context.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Register the tool**

In `src/server/ai/tools/index.ts`: add `export { getProgressContextTool } from "./progress-context";`, import it, append to `allTools` (update the header comment: 12 tools, add `12. get_progress_context - watch watermark + spoiler-safe episode metadata`).

- [ ] **Step 6: System-prompt hard rule**

In `src/server/ai/prompts/system.ts`, add a section to the main system prompt (next to the existing user-status-awareness section):

```
## Spoiler Safety (HARD RULE)
Before answering ANY plot question about a TV series, call get_progress_context.
The returned spoilerRule is binding: never reveal, hint at, or confirm events
beyond the user's watermark — not even when asked directly. Decline gracefully:
"That's past where you've watched — keep going and ask me again." For users with
no progress, stay at premise level. This rule outranks helpfulness.
```

Also update the tool-selection guide in the same file (add `get_progress_context` with the "plot questions about series" trigger), and `.claude/rules/ai-agent.md` (tool count 11→12, one-line description, spoiler-rule note).

- [ ] **Step 7: Verify agent end-to-end**

Run: `yarn typecheck`
Expected: PASS.
Run: `yarn test:ai "I'm on season 1 episode 2 of Breaking Bad. Who is Gus?" --debug` (with a test account that has progress rows)
Expected: trace shows a `get_progress_context` call; the answer refuses/deflects future-season info. (Knowledge-cutoff models know the plot — the system rule + tool result must win. If it leaks, strengthen the spoilerRule wording, not the tool.)

- [ ] **Step 8: Commit**

```bash
git add src/server/ai/tools/progress-context.* src/server/ai/tools/index.ts src/server/ai/prompts/system.ts .claude/rules/ai-agent.md
git commit -m "feat(phase4): get_progress_context agent tool + hard spoiler-safety rule"
```

---

### Task 18: Club-thread recap autopost — integration check

The call site already exists (`postRecapReply` in `club-service.ts`, Task 11) and the real generator landed in Task 15. This task pins the integration with a test and a manual run.

**Files:**
- Modify: `src/server/services/circles/club-service.test.ts` (add one test)

- [ ] **Step 1: Add the failing test**

Append to `src/server/services/circles/club-service.test.ts` (inside the existing describe; update the episode-recap mock at the top to make the mocked `getOrGenerateEpisodeRecap` importable in tests):

```typescript
import { getOrGenerateEpisodeRecap } from "@/server/services/enrichment/episode-recap";

  it("posts a 'Previously on' recap reply scoped to the PREVIOUS episode (never the opened one)", async () => {
    mockPrisma.clubSchedule.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(getOrGenerateEpisodeRecap).mockResolvedValue("Walt did things.");
    await tickClubSchedules(NOW);
    // Recap is requested for the episode BEFORE the opened one (S1E2 opened → recap S1E1)
    expect(getOrGenerateEpisodeRecap).toHaveBeenCalledWith(100, 1, 1);
    // Two comment writes: thread root + recap reply
    expect(mockPrisma.comment.create).toHaveBeenCalledTimes(2);
    const reply = mockPrisma.comment.create.mock.calls[1][0] as { data: Record<string, unknown> };
    expect(reply.data).toMatchObject({
      userId: null, parentId: 555,
      spoilerScope: "EPISODE", scopeSeason: 1, scopeEpisode: 1, // scoped to the RECAPPED episode
    });
    expect(String(reply.data.body)).toContain("Previously on");
  });

  it("skips the recap reply for the first episode of a club", async () => {
    mockPrisma.clubSchedule.findMany.mockResolvedValue([{ ...SCHEDULE, currentEpisode: 0 }]);
    mockPrisma.clubSchedule.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(getOrGenerateEpisodeRecap).mockResolvedValue("should not be used");
    await tickClubSchedules(NOW);
    expect(getOrGenerateEpisodeRecap).not.toHaveBeenCalled();
    expect(mockPrisma.comment.create).toHaveBeenCalledTimes(1); // root only
  });
```

- [ ] **Step 2: Run; fix `postRecapReply` if the contract differs**

Run: `yarn test:unit src/server/services/circles/club-service.test.ts`
Expected: PASS (5 tests total). If the recap-reply scope or call args differ, fix `club-service.ts` to match the test — the test encodes the spoiler contract (recap reply scope = the recapped episode, which every cohort member at the schedule position has necessarily passed).

- [ ] **Step 3: Manual end-to-end**

With a club one tick in: `FORCE_RUN=1 npx tsx scripts/club-scheduler.ts` → new episode thread carries a system "Previously on" reply whose content stops at the previous episode.

- [ ] **Step 4: Commit**

```bash
git add src/server/services/circles/club-service.test.ts src/server/services/circles/club-service.ts
git commit -m "feat(phase4): pin club-thread recap autopost contract (scope = recapped episode)"
```

---

### Task 19: Final verification + docs

- [ ] **Step 1: Full local gate**

Run: `yarn test:ci` (typecheck + lint + all unit tests)
Expected: PASS — including the new suites: invite-code (6), circle-join (4), poll-tally (7), ai-mediator (6), club-advance (8), club-service (5), club-ics (2), episode-recap (9), progress-context (6).

- [ ] **Step 2: FK index audit (invariant 3)**

Run the unindexed-FK audit query from `.claude/rules/performance.md` against the local DB.
Expected: zero unindexed FKs on `club_schedules`, `circle_polls`, `poll_candidates`, `poll_votes`, `episode_ai_data`, `circles`.

- [ ] **Step 3: `db push` round-trip keeps raw constraints (invariant 5)**

Run `yarn db:push` a second time, then re-check `pg_constraint` for the Task-1 CHECKs. If any dropped, the deploy hash-gate covers prod, but re-apply locally and note it.

- [ ] **Step 4: Update knowledge base**

- `CLAUDE.md`: PM2 jobs table row (done in Task 12); add one line to the architecture patterns if circles introduced new conventions worth pinning.
- `.claude/rules/ai-agent.md`: updated in Task 17.
- Add a short "Circles & clubs" subsection to the most relevant rule file (or create `.claude/rules/social-circles.md` with: CAS-tick idempotency contract, fan-out ban applied to circles, Fable-rule enforcement points, episode_ai_data invariant-1 note) and register it in the CLAUDE.md rules table.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "docs(phase3-4): rules + PM2 table updates for circles, clubs, AI second screen"
```

Do NOT push, do NOT deploy (local-only constraint). Hand off per superpowers:finishing-a-development-branch.

---

## Execution notes & known adaptation points

1. **Session userId accessor** (`requireUserId` in every action file): copy the exact pattern from an existing authed server action once at Task 4 and reuse verbatim everywhere (the `parseInt(String(session.user.id)))` shown is the agent-tools convention; the actions layer may differ).
2. **`trackAIUsage` signature**: match `TrackAIUsageOptions` exactly (Task 8 / Task 15 call sites); extend its `queryType` union with `"group_mediator"` and `"episode_recap"`.
3. **Phase 1/2 component names** (`CommentThread`, `ListView`, feed registry): match the real exports when those tasks integrate; the props shown are the minimum contract.
4. **`p-limit`** is already a dependency (progressive enrichment uses it) — no install needed.
5. **Prisma vector column**: `Unsupported("vector(1024)")` on `circles` means Prisma ignores it in the client — all reads/writes go through `$queryRaw`/`$executeRaw` (already the pattern for movies/series embeddings).
6. **File-size rule**: `club-service.ts` is the largest new file (~400 lines) — under the 800 cap; split `nudgeStragglers` into `club-nudges.ts` if it grows.
7. **Edge-cache discipline**: every circle surface is logged-in and client-fetched or server-rendered per-user — nothing circle-scoped may enter anon-cacheable HTML (invariant 8). The join page IS anon-cacheable (preview only, no member data beyond count/names of owner).

### Critical Files for Implementation
- prisma/schema.prisma
- src/server/services/circles/club-service.ts
- src/server/services/enrichment/episode-recap.ts
- src/server/ai/tools/progress-context.ts (+ src/server/ai/tools/index.ts, src/server/ai/prompts/system.ts)
- scripts/club-scheduler.ts (+ ecosystem.config.cjs)
