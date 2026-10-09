# Taste Profile Core — Implementation Plan

Spec: `docs/superpowers/specs/2026-10-09-taste-profile-design.md`.
Branch `feat/taste-profile-core`. Local only: dev DB `:5436`, dev server `mb-taste`
on :3012. No push, no deploy, no prod.

Baseline before any change (base f79204ee): typecheck clean; unit tests 3 files /
23 tests already failing (`analytics/client.test.ts`, `discussion/comment-peek.test.tsx`,
`discussion/discussion-page-header.test.tsx`) — not ours, not to be fixed here.

## Task 1 — Pure math (`src/lib/taste/`), TDD

- [ ] `constants.ts` — every threshold in spec §14 + `TASTE_ALGO_VERSION`.
- [ ] `vector.ts` — `l2Normalize`, `dot`, `cosineSimilarity`, `weightedMean`.
- [ ] `weights.ts` — `decayFactor`, `userMeanScore`, `titleWeight(signals, scope, now)`,
      `foldSignals` (scope filtering, private-only rule, caps).
- [ ] `centroid.ts` — `rocchioCentroid(items)` → `{centroid, negCentroid}`.
- [ ] `lift.ts` — `shrink`, `liftFacets`, `rankPeople`.
- [ ] `cluster.ts` — NN-chain Ward, `cutTree`, `silhouette`, `wardClusters` (k
      selection, medoids, importance).
- [ ] `axes.ts` — `computeAxes` + caption templates.
- [ ] `snapshot.ts` — zod `TasteSnapshotSchema`, types, `buildTasteSnapshot(input)`
      composing the above (pure).
- [ ] Tests for each. Commit `feat(taste): pure taste math`.

## Task 2 — Schema

- [ ] `UserTasteProfile` model + `User.tasteProfile` back-relation;
      `UserStats.publicStats`. `db push` against :5436, `prisma generate`.
- [ ] Commit `feat(schema): user_taste_profiles + user_stats.public_stats`.

## Task 3 — Stats privacy fix

- [ ] `StatsEventRow.isPrivate`; `stats.ts` selects `we.is_private`; one pass
      computes full + public; `getUserStatsSnapshot(userId, {scope})`; profile
      reads `public`, `/stats` reads `full`; histogram applies the private-only
      rule. Tests in `stats-compute.test.ts`. Commit `fix(stats): public profile
      stats exclude private watches`.

## Task 4 — DB layer + service

- [ ] `social/taste-dirty.ts` (`markTasteDirtyTx`, `markTasteDirty`); fold into
      `markStatsDirty` (single CTE statement); call sites: watchlist add/remove,
      `setFourFavorites`.
- [ ] `social/taste.ts` — signal queries (ratings, watches, progress, favorites,
      watchlist), embeddings (`::real[]`), title metadata, baseline counts +
      quantiles, read/write of the row (vectors via `::vector` casts).
- [ ] `services/taste/{baseline-cache,compute,index}.ts` — lazy recompute,
      in-flight dedupe, exported interface (spec §13).
- [ ] Integration test (self-skipping) against :5436. Commit
      `feat(taste): taste profile service + dirty hooks`.

## Task 5 — Dev seed

- [ ] `scripts/seed-taste-demo.ts` (5436-guarded, idempotent): hydrate a curated
      title set via TMDB when a key is present; deterministic synthetic
      embeddings (genre/keyword basis + per-title jitter) and synthetic AI
      THEME/VIBE/MOOD tags for dev rows lacking them (`model_id =
      'dev-synthetic-taste'`); per-persona histories for the demo users incl.
      PRIVATE watches that must not surface publicly. Commit.

## Task 6 — Profile UI

- [ ] `PublicProfileDTO.taste`; `getPublicProfileByUsername` reads the public
      snapshot (try/catch → null; respects `showTaste`).
- [ ] Widgets `taste.dna|moods|people|clusters` + registry/default order +
      owner hint island; `PosterBoard` `unoptimized`.
- [ ] Privacy toggle: `setTasteVisibilityAction`, `OwnProfileSettingsDTO.privacy.showTasteProfile`,
      `PrivacySettings` switch.
- [ ] DESIGN.md "Taste profile" section. Render tests. Commit.

## Task 7 — Verify + docs

- [ ] typecheck, lint, unit (compare to baseline), browser at 390/1440 anon vs
      owner (screenshots in scratch), ISR grep, `next build` with bogus
      `DATABASE_URL`.
- [ ] `.claude/rules/taste-profile.md` + CLAUDE.md row + tech-stack line; note in
      the phase-2 plan; PROGRESS.md entry; social-features.md cross-link. Commit.
