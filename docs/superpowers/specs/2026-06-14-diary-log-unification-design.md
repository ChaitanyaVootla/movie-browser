# Diary / Log / Watched Unification — Design

**Date:** 2026-06-14
**Branch:** `feat/social-phase0` (local-only, NOT deployed — no backward-compat constraints; dev DB on :5436 is reshaped + reseeded freely)
**Status:** Approved for implementation (high-level design agreed in brainstorming session 2026-06-14)
**Supersedes/extends:** `2026-06-12-social-virality-roadmap-design.md` §4.2 (Tracking Core)

---

## 1. Problem

The tracking core (watch_events / series_progress / user_ratings + user_reviews) is
architecturally sound but its UX has grown asymmetric and fragmented:

- **Movies** have only a rich "Log to diary" modal; **series** have three separate
  controls (episode checkmark, "Set position" pill, StatusChip). No unified mental model.
- The quick episode-checkmark path silently skips the diary's emotional payoff (this is
  Letterboxd's #1 documented support issue — users mark watched, find an empty diary).
- "Mark season" exists in two places; rewatch is split-brained (`isRewatch` flag vs
  `rewatchStartedAt` reset are not linked in the UI).
- The diary page is a plain month-grouped row list — no rewatch grouping, no honest
  counters, no filters, source/precision invisible.
- Reviews and ratings are separate, title-only axes; you cannot rate/review a season or
  episode, and a rewatch cannot carry its own review.

Competitor research (Letterboxd, Trakt, Serializd, TV Time, Simkl, IMDb — see session
research) confirms the **three-axis model** (watched-state / dated-events / decoupled
rating) is correct and already what the schema encodes. **This is a UX + light schema
problem, not a re-architecture.**

## 2. The model (one sentence)

Every watch is an **append-only dated event**. **"Watched"** is the quick capture, the
**Diary panel** is where you manage/enrich those events, **Rate** and **Review** are
separate axes — same concept for movies and series, different primitive.

Terminology is standardized: **"Diary"** is the consistent noun (page, panel, button).
"Watched" = quick state/capture. "Rate"/"Review" = their own axes. "Logged" survives
only as microcopy.

## 3. Decisions locked

1. **Event-first, flexible-but-defaulted.** No separate dateless "watched" boolean —
   everything is a dated event (date auto = today, editable; a "don't remember the date"
   escape hatch yields `precision=UNKNOWN`). Avoids Letterboxd's over-separation pitfall.
2. **Bare one-tap Watched is PUBLIC** in the diary/activity feed (add-note-later is the
   in-app promote path).
3. **Reviews reconciled by LINKING, not merging** (see §6).
4. **Per-season/episode ratings + reviews enabled in the data model now** (UI may land
   incrementally; the schema supports full granularity).
5. **Redundancy resolved:** movie "times watched" == "diary entries," so the movie
   control is a single segmented **Watched** button (tap check = mark/add; tap `×N ▸` =
   open Diary panel). Series counts differ (progress vs entries) → distinct
   **Watched-till** + **Diary** affordances.
6. **No backward compat** — reshape schema, regenerate client, reseed dev DB.

## 4. Schema changes

### 4.1 `watch_events` — analytics-ready + per-viewing rating

Add columns (all snapshot/derived, written on EVERY create path — log, toggle, backfill,
import):

| Column | Type | Purpose |
|--------|------|---------|
| `media_type` | enum `MediaType {MOVIE, SERIES}` | explicit discriminant for bulk `GROUP BY` / partial indexes / ClickHouse partition key (today inferred from nullable FK) |
| `runtime_minutes` | `Int?` | **snapshot** of runtime at watch time (movie runtime, or episode runtime; null when unknown/unaired → counts as 0 hours). Decouples "hours watched" from catalog churn (hydration delete+reinserts episodes) and makes time-aggregates a pure scan |
| `release_year` | `Int?` | snapshot for decade analytics without a catalog join |
| `cycle` | `Int @default(1)` | rewatch-cycle ordinal (1 = first watch-through). Makes "rewatch #N" a `GROUP BY`, not a timestamp window-function. Derived from `series_progress.rewatchCount + 1` at write for series; for movies, `count(prior events)+1` |
| `score` | `Int?` (1–10) | **optional rating captured at this viewing** (Letterboxd diary-entry rating). Historical; canonical "your rating" stays in `user_ratings` |

Indexes added: `@@index([movieId, watchedAt(sort: Desc)])` and
`@@index([seriesId, watchedAt(sort: Desc)])` (cross-user "most-logged this week"),
`@@index([mediaType, watchedAt(sort: Desc)])`.

### 4.2 `user_ratings` — generalize to any granularity (canonical rating)

Add `mediaType`, `seasonNumber Int?`, `episodeNumber Int?`, `tmdbEpisodeId Int?`. Replace
the two title-level uniques with granular partial uniques (raw SQL, NULLS NOT DISTINCT):
- movie: `UNIQUE (user_id, movie_id)` where movie_id NOT NULL
- series unit: `UNIQUE NULLS NOT DISTINCT (user_id, series_id, season_number, episode_number)` where series_id NOT NULL

This keeps `user_ratings` as the **canonical current rating** per unit (drives card
badge, taste vector). The per-viewing `score` on the event is the historical twin.

### 4.3 `user_reviews` — generalize granularity + allow per-event multiplicity

Add `episodeNumber Int?`, `tmdbEpisodeId Int?`, `mediaType`. **Relax uniqueness:** a user
may have ONE canonical unit-level review (NULL `watchEventId`) per unit, PLUS additional
reviews each tied to a distinct `watchEventId` (per-rewatch reviews). New partial unique:
`UNIQUE NULLS NOT DISTINCT (user_id, movie_id, series_id, season_number, episode_number, watch_event_id)`.
Moderation/spoiler-scope/reports/status machinery is UNCHANGED.

### 4.4 UGC constraints SQL (`04-ugc-constraints.sql`)

- `watch_events`: add `chk_watch_events_score_range` (score 1–10 or null);
  `media_type` consistency CHECK (MOVIE ⇒ movie_id, SERIES ⇒ series_id).
- `user_ratings`: episode-chain + season-chain CHECKs; the two granular partial uniques.
- `user_reviews`: episode-chain CHECK; replace `uq_user_reviews_user_series_season` with
  the watch-event-aware partial unique.
- All idempotent + reapply-safe (existing file conventions).

### 4.5 ClickHouse-ready, not built

The flat + discriminated + snapshotted event shape means a thin append-mirror into the
existing ClickHouse is trivial later (cross-user Wrapped/trending/leaderboards). **Not
built in this pass.** PG remains source of truth; per-user stats stay on `user_stats`.

## 5. Controls

### 5.1 Movie action bar
- **Watched** — segmented button. Tap check = log a viewing dated today (or toggle off if
  the only entry). State + count badge (×N at ≥2 rewatches). Tap the **`×N ▸`** zone =
  open the Diary panel. The count chip is the mobile-safe replacement for hover.
- **Rate** — score + thumb (unchanged behavior, generalized backend).
- After a Watched tap: count animates +1, toast *"Added to your diary · today — add a
  note?"* whose CTA opens the panel.

### 5.2 Series
- **Watched-till** status control (refined StatusChip): *Watching · S2E5 → Caught up →
  Completed*, **Completed ×2** after a rewatch. Tap = Set Position modal.
- **Set Position modal** (the no-scroll deliberate entry point): top **"Mark whole series
  watched"** shortcut; per-season **"Mark this season"** rows; picker shows **episode name
  + air date + still**, not bare dropdowns.
- **Episode-list cards stay minimal:** checkmark toggles that one episode; overflow menu
  gets a single **"Mark watched up to here"** (one tap, no dialog). Card and modal never
  open each other.
- **Rewatch** = `resetToRewatch` (lossless) surfaced as "Start a rewatch."
- **Rate** (series header) + **Diary** affordance (opens the show-diary panel).

### 5.3 The Diary panel (shared centerpiece)
Desktop **side panel** (Sheet, right), mobile **slide-up sheet** (Drawer). Per-title diary
slice:
- **Movie:** viewings list (date · note · rewatch glyph · per-viewing score); add/edit
  note, change date, add a rewatch, set canonical rating, write/edit a public review.
- **Series:** logged episodes/seasons by date, season reviews, **rewatch cycles grouped**
  (by `cycle`), Up Next, status — all editable; rate/review the series, a season, or an
  episode.

## 5b. A diary entry need not be a watch — `kind` (WATCH | NOTE)

Watching is not required to make a diary entry. `watch_events.kind` (`WATCH`
default, `NOTE`) lets a user log **just a rating or a note** without asserting a
viewing. Behavior:
- **WATCH** — a viewing. Counts toward series progress/watermark, hours, the
  spoiler gate, "watched" state, hide-watched, AI taste, and the public-profile
  watch heatmap/recent-watches.
- **NOTE** — a dated (or undated) diary entry that does NOT assert viewing. It is
  EXCLUDED from all of the above; it still appears in the diary and can carry a
  score (which still sets the canonical rating) and a note.

Every "is this watched?" inference is `kind = 'WATCH'`-filtered: `recomputeSeriesProgress`,
`hasWatchedMovie`, stats SQL (`stats.ts`), `getSeriesTracking`, `getWatchedMovieIdsWithDates`,
`markMovieWatched`/`unmarkMovieWatched`, `getProfile`, `getLibraryData` (hide-watched),
the AI taste tool, the admin watched-count, and the public-profile heatmap/recent-watches.
The `LogWatchForm` exposes an "I watched it" toggle (hidden when editing); off = NOTE.

## 6. Reviews reconciliation (the "wdyt")

**Link, don't merge.** `user_reviews` stays the first-class public/moderated/
spoiler-scoped/reactionable object. Generalize it to any granularity + allow multiple per
unit linked to distinct watch events. Private quick scribble stays `watch_events.note`; a
public review is a `user_reviews` row optionally tied to the event. In the Diary panel a
single action can create the event + set the canonical rating + attach a review.

## 7. Diary page (`/diary`) redesign

- Month-grouped, poster-forward rows (date · poster · title · year · score · rewatch glyph
  · note/review icon · edit).
- **Two honest counters:** *unique titles* vs *total entries* (rewatch divergence,
  labeled).
- **Filters:** media type, rewatch-only, year, rating.
- Clearer **backfill/undated** promote affordance.
- Optional **activity heatmap** header (reuse `dailyActivity` already computed for the
  profile widget).

## 8. Invariants preserved (hard gates)

- Natural-key episodes — NEVER FK to episodes/seasons (only `series` FK, Restrict).
- `requirePgUserId` on all social actions; ISR edge-cache (all viewer state hydrates
  client-side via server actions — controls + Diary panel are client islands; no
  `auth()`/`headers()` in cacheable render trees).
- `auditedTransaction` on watch_events / user_ratings / user_reviews writes (actor_id).
- AI gate runs only on review submit (rate-limited), never on render/crawler paths.
- DESIGN.md primitives, 40px touch targets, safe-area, semantic tokens.

## 9. Implementation phases

1. **Schema + constraints + snapshot logic** — schema deltas, UGC SQL, `MediaType` enum,
   snapshot computation in `logWatchEvent`/backfill/`setPosition`, generalize
   `ratings.ts` + `reviews.ts` granularity; apply to dev DB on :5436, regen client,
   reseed; unit tests (snapshot, granular keys, cycle derivation).
2. **Movie Watched/Rate controls + Diary panel** (shared panel component).
3. **Series controls** (refined Watched-till, richer Set Position modal, minimal episode
   card + overflow, header Rate + Diary affordance).
4. **Diary page redesign** (counters, filters, heatmap, backfill).

## 9b. Build status (2026-06-14)

All phases implemented on the working tree (typecheck PASS, unit tests PASS, lint
adds 0 new errors; dev DB on :5436 reshaped + reseeded). Built:
- **Schema/foundation**: `MediaType`, `WatchEntryKind`; `watch_events` +media_type/
  runtime_minutes/release_year/cycle/score/kind + indexes; `user_ratings`/`user_reviews`
  generalized to any granularity; UGC constraints + audit reapplied; snapshot on
  every write path; `getTitleDiary` + filtered `getDiaryPage`.
- **Movie controls**: segmented `WatchedButton` (×N + Diary opener), kept `ScoreRating`.
- **Diary panel** (`diary-panel.tsx`): shared Sheet/Drawer; log/note/rate/edit/delete; cycle grouping; NOTE badge.
- **Diary page**: monthly groups, two honest counters, heatmap, server-side filters (whole-history), per-viewing scores, NOTE badge.
- **Series controls**: richer Set-Position modal (episode names/stills + mark-series/season), minimal episode cards + "mark up to here", "Completed ×N".
- **NOTE kind**: log a rating/note without a watch (§5b).

Open follow-ups (not blockers): per-season/episode rating UI is data-ready but
minimal in the UI; CloudFront single-path invalidation still unwired (pre-existing);
visual Playwright pass pending user review.

## 10. Testing

- Unit: snapshot/backfill, `deriveProgress` (unchanged — regression), granular rating/
  review keys, cycle derivation, diary counters.
- Local click-through per `docs/LOCAL_REVIEW.md` (dev DB :5436, `USER_DATA_SOURCE=postgres`,
  `ENABLE_TEST_AUTH=true`).
- Playwright screenshots at 390×844 + 1440×900 for the controls, Diary panel, diary page.
