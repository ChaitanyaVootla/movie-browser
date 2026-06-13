# Social & Virality Roadmap — Implementation Progress / RESUME HERE

**Last updated:** 2026-06-13 ~09:40 IST
**Branch:** `feat/social-phase0` (off `next`). **Local `master` ref = rolling checkpoint.**
**Current HEAD:** `bd4718f` (also pushed to local `master`).

This is the authoritative resume point for the autonomous overnight implementation
of the Social & Virality Roadmap. If a session fails, read this first, then continue
from "NEXT STEPS".

---

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
| `2026-06-12-phase0-ui.md` (16 tasks) | 🔄 Tasks 1–9 done; **10–16 remaining** |
| `2026-06-12-phase1-discussion.md` (18 tasks) | ⏳ not started |
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

Components live under `src/components/features/{tracking,reviews,home,stats}/`.

---

## NEXT STEPS (resume here)

1. **(optional) Fable code-review** of UI batch A+B diff `git diff 45f387d..bd4718f`
   — focus: DESIGN.md conformance, edge-cache invariant (no user data in ISR HTML),
   mobile-first/safe-area, analytics wiring, no `any`. Fix findings, commit, checkpoint.
2. **UI Batch C = phase0-ui Tasks 10–13** (opus agent): public profile scaffolding
   components (T10), public profile page `/u/[username]` + SEO (T11), settings hub +
   username claim + privacy (T12), profile customization editor + Four Favorites
   editor (T13).
3. **UI Batch D = phase0-ui Tasks 14–16** (opus agent): settings barrel/ordering
   guard (T14), import flow UI + data export button (T15), nav wiring + **final
   Playwright screenshot verification** at 390px + 1440px (T16 — spoof a real Chrome
   `sec-ch-ua` + userAgent per performance.md or src/proxy.ts 429s headless Chromium
   and pages render empty). This completes phase 0.
4. **Fable code-review** of full phase-0 UI; fix; checkpoint. Phase 0 COMPLETE.
5. **Phase 1** (`2026-06-12-phase1-discussion.md`, 18 tasks): spoiler-gated comments,
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
