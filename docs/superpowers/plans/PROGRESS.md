# Social & Virality Roadmap — Implementation Progress / RESUME HERE

**Last updated:** 2026-06-13 ~11:30 IST
**Branch:** `feat/social-phase0` (off `next`). **Local `master` ref = rolling checkpoint.**
**Current HEAD:** `e649ebc` (also pushed to local `master`). **PHASE 1 COMPLETE — awaiting user review.**

This is the authoritative resume point for the autonomous overnight implementation
of the Social & Virality Roadmap. If a session fails, read this first, then continue
from "NEXT STEPS".

---

## ⏸ USER DIRECTIVE (2026-06-13 ~10:30): PAUSE AFTER PHASE 1
Parallelize remaining Phase-1 work as much as safely possible (isolated git
worktrees for disjoint task sets — never two agents in one working tree). When
Phase 1 is COMPLETE + Fable-reviewed + verified, **STOP and present for user
review. Do NOT auto-start Phase 2.** Resume Phase 2/3-4 only on explicit go.

## Guardrails (NON-NEGOTIABLE)

- **NO push to origin / any remote.** Pushing `next` auto-deploys to prod. All work
  is local on branch `feat/social-phase0`. Checkpoints use `git push . HEAD:master`
  (the local repo as its own remote — never a real remote).
- **DB = local container ONLY.** `movie-browser-dev-pg` →
  `postgresql://dev:dev@localhost:5436/moviebrowser` (pgvector/pg17 + pg_trgm).
  Pin `DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser'` on EVERY
  prisma/psql/vitest/typecheck command. NEVER use the `.env` DATABASE_URL — its
  port 5433 is an SSH tunnel to PROD.
- **Model policy:** Opus for well-specified impl subagents; Fable for planning,
  review, and tricky/important impl. (Session default is currently Opus.)
- **Quality gates per task:** `yarn typecheck` (exit 0) + `yarn lint` (0 errors;
  ~120 pre-existing playwright warnings are OK) + `yarn vitest run` for logic tasks.
- **DESIGN.md is law** for all UI (mobile-first 390px, @/lib/design primitives,
  semantic tokens, 40px+ touch targets, safe-area, no edits under `src/components/ui/`).
- **Edge-cache invariant (spec §4.1.8):** no user-specific content in ISR/cacheable
  HTML; viewer state hydrates client-side via server actions.
- Re-arm `ScheduleWakeup` every turn so the run survives usage limits.

## Known issues (not blockers)
- `src/lib/cache-service-l1.test.ts > L1 byte budget` fails ONLY in the full-suite
  run (passes in isolation 3/3). Pre-existing full-suite ordering/pollution flake in
  an untouched file. Full suite = 222/223. Flag for separate cleanup; do NOT treat as
  a regression.

---

## The 5 plans (all written, reconciled, committed)

| Plan file (docs/superpowers/plans/) | Status |
|---|---|
| `2026-06-12-phase0-backend.md` (24 tasks) | ✅ COMPLETE + reviewed + fixed |
| `2026-06-12-phase0-ui.md` (16 tasks) | ✅ COMPLETE (all 16) — prod build passes |
| `2026-06-12-phase1-discussion.md` (18 tasks) | ✅ COMPLETE + reviewed + fixed — build green |
| `2026-06-12-phase2-identity-artifacts.md` (15 tasks) | ⏳ not started |
| `2026-06-12-phase3-4-circles-clubs-ai.md` (19 tasks) | ⏳ not started |

Spec (source of truth): `docs/superpowers/specs/2026-06-12-social-virality-roadmap-design.md`.

---

## DONE — Phase 0 BACKEND (all 24 tasks)

Schema + constraints, watch-dates, progress derivation (cycle vs lifetime watermark,
rewatch/reset), watch-event + progress query layer, diary actions (batch marks =
one recompute), `watched_movies` hard-migration→`watch_events`+drop, ratings
(1–10 score + thumb + ratedAt), blocks/mutes (enforced helper), follows +
notifications, AI moderation gate (fail-open→PENDING_REVIEW), reviews CRUD (first
gate consumer), lists + Four Favorites, lazy `user_stats` snapshot, renumber
reconcile, CSV/Letterboxd/Trakt/IMDb import parsers, import resolution + runner +
upload action, data export (zip), reports, username claim, and the Task-24 UI
contract bridge (`src/types/social.ts`, `public-profile.ts`, `tracking.ts`, + bridge
exports on profile/reviews/imports). Code-reviewed (tasks 5–9 and 10–24); 3
SHOULD-FIX applied in `45f387d` (block-filter notifications read path; block-guard
follow-graph reads; thread `excludeImported` through stats).

Verification passed: 16 `chk_` constraints + 3 `uq_` indexes; FK audit clean for all
NEW tables (only pre-existing tables show as unindexed — documented-acceptable in
performance.md). Tests green (modulo the known cache-l1 flake).

## DONE — Phase 0 UI Tasks 1–9
- T1 `651eecd` analytics action types (social.ts verified, not recreated).
- T2 `45a3e26` tracking-format.ts + profile-accents.ts (+tests, accents use
  globals.css `.dark .accent-*` values).
- T3 `1a08a4f` LogWatchForm + QuickLogButton (wired into media-action-bar, movie-card-actions).
- T4 `7a68d1d` SeriesTrackingProvider, EpisodeWatchToggle, SeasonWatchButton, SetPositionSheet.
- T5 `0f3eba3` StatusChip, SeriesProgressPanel, tracking barrel; episode-scroller/season-selector/series page wired.
- T6 `1073b6b` Up Next module on logged-in home.
- T7 `d5720df` Diary page (edit/delete, collapsed BACKFILL).
- T8 `29f0ced` Stats page (pure CSS/SVG charts, no new deps).
- T9 `bd4718f` Review components + display on detail pages (PENDING_REVIEW messaging).
- T10 `95accf7` Profile scaffolding (accent-scope, follow-button, owner-actions, profile-hero, four-favorites, profile-modules).
- T11 `150c545` `/u/[username]` page: ISR revalidate=300 + generateStaticParams()=>[], OG/Twitter, ProfilePage JSON-LD, private/notFound branches.
- T12 `36e07c7` username-form + claim-prompt (mounted in layout) + privacy-settings.
- T13 `c440a60` backdrop-picker, profile-editor, four-favorites-editor, export-data-button (a T15 file, created early per plan note — T15 skips it), settings barrel, `/settings` hub.

- T15 `fe8f8cb` Import flow UI (import-client + /settings/import) + export button (existed); barrel extended.
- T16 `14c018c` Nav wiring (Diary/Stats in mobile bottom nav + user menu). **Production `yarn build` PASSED** — route types verified: /movie /series /u/[username] = SSG/ISR; /person = SSG; /diary /stats /settings /settings/import = dynamic.

Components live under `src/components/features/{tracking,reviews,home,stats,profile,settings}/`.

### PHASE 0 = COMPLETE (backend 24/24 + UI 16/16, prod build green). Screenshots of
authenticated/seeded surfaces deferred to user morning review (local 5436 DB is
schema-only). Pending: a final Fable review of the full phase-0 UI before declaring done.

---

## NEXT STEPS (resume here)

0. **PHASE 0 SIGNED OFF** — UI review done (1 SHOULD-FIX applied: IS_IOS drawer gate,
   `5d6f403`). Backend 24/24 + UI 16/16, prod build green, edge-cache invariant verified.
1. **Phase 1 IN PROGRESS** — batches: B1 = Tasks 1–5 (schema, spoiler gate, mention
   parser, rate limit, AI comment gate); B2 = Tasks 6–9 (read path, write path,
   notifications service + web push, notifications UI); B3 = Tasks 10–13 (discussion
   UI, wire into detail pages, proxy authority for discuss URLs, per-episode SEO
   pages); B4 = Tasks 14–18 (AI thread summary, block/mute UI+enforcement, admin mod
   queue, content policy page, final verification sweep). Fable review between batches.
2. **Phase 1 (reference)** (`2026-06-12-phase1-discussion.md`, 18 tasks): spoiler-gated comments,
   AI gate, per-episode SEO pages, notifications + web push, moderation. Implement in
   batches, review between, same rules.
6. **Phase 2** (`2026-06-12-phase2-identity-artifacts.md`, 15 tasks): lists UI, OG
   share cards, Wrapped, taste compatibility, Feed v1, user search. NOTE: this plan
   was written less granularly — re-read it before executing; it adds schema (Task 1:
   ListCollaborator, UserTasteVector, user trgm indexes) so run its `db push` on 5436.
7. **Phase 3+4** (`2026-06-12-phase3-4-circles-clubs-ai.md`, 19 tasks): circles,
   binge clubs (club_schedules + PM2 scheduler with CRON_HOUR_UTC guard), group
   decide, Feed v2, AI second screen (episode recaps, get_progress_context tool).

### Resume command pattern (per impl batch)
Dispatch an `Agent` (subagent_type omitted = general; or model: opus) with: plan path,
exact task numbers, "execute in order, commit per task with Co-Authored-By: Claude
Fable 5 trailer", the guardrails above, "defer Playwright/dev-server to the plan's
final verification task", and "DATABASE_URL pinned to localhost:5436, never push
origin". After each batch: typecheck at HEAD, `git push . HEAD:master`, optional
Fable review, update this file's "DONE/NEXT" sections + the memory file.

### Local env recreate (if the dev DB container is gone)
```
docker run -d --name movie-browser-dev-pg -p 5436:5432 -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_USER=dev -e POSTGRES_DB=moviebrowser pgvector/pgvector:pg17
docker exec movie-browser-dev-pg psql -U dev -d moviebrowser \
  -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;"
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' npx prisma db push --skip-generate
npx tsx scripts/apply-ugc-constraints.ts   # with DATABASE_URL pinned — applies 04-ugc-constraints.sql
```
