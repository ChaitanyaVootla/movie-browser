---
paths:
  - "src/lib/taste/**"
  - "src/server/services/taste/**"
  - "src/server/db/postgres/social/taste.ts"
  - "src/server/db/postgres/social/taste-dirty.ts"
  - "src/server/db/postgres/social/stats-dirty.ts"
  - "src/server/db/postgres/social/stats.ts"
  - "src/components/features/profile/widgets/taste-*.tsx"
  - "src/components/features/profile/taste-owner-hint.tsx"
  - "scripts/seed-taste-demo.ts"
  - "scripts/refresh-taste-baseline.ts"
  - "src/server/db/postgres/social/taste-baseline.ts"
  - "src/server/db/postgres/social/progress.ts"
  - "src/server/db/postgres/social/taste-recs.ts"
  - "src/server/actions/taste-recs.ts"
  - "src/components/features/home/for-you-section.tsx"
  - "src/components/features/home/taste-twins-strip.tsx"
  - "src/components/features/profile/taste-match.tsx"
  - "src/server/ai/tools/recommend-for-me.ts"
  - "src/server/ai/tools/taste-summary.ts"
  - "scripts/eval-recs.ts"
---

# Taste Profile (Oct 2026, branch `feat/taste-profile-core`)

Deterministic per-user taste profile — Rocchio centroid + PinnerSage-style medoid
clusters + shrunk-lift facets + neutral axes — powering four `/u/*` widgets and
(next) recommendations + user↔user taste match. Spec (formulas, privacy matrix,
thresholds): `docs/superpowers/specs/2026-10-09-taste-profile-design.md`. Plan:
`docs/superpowers/plans/2026-10-09-taste-profile-core.md`.

## Layout

| Layer | Where |
|---|---|
| Pure math (tested, no DB/AI/clock) | `src/lib/taste/` — `constants`, `types`, `vector`, `weights`, `centroid`, `lift`, `cluster`, `axes`, `profile` |
| SQL | `src/server/db/postgres/social/taste.ts` (+ `taste-dirty.ts`) |
| Service / interface | `src/server/services/taste/` — `index.ts` (public API), `compute.ts`, `baseline-cache.ts` |
| Table | `user_taste_profiles` (`UserTasteProfile`) — derived, NOT audited |
| UI | `profile/widgets/taste-{widgets,moods,people}.tsx`, `profile/taste-owner-hint.tsx`; DESIGN.md → Taste profile |

Interface for consumers: `getTasteProfile(userId, {scope})`, `getTasteClusters`,
`getUserTasteEmbedding(userId, {scope?})` (default full), `getTasteVectors`,
`markTasteDirty`, `getProfileTaste` (profile DTO, never throws), plus
`cosineSimilarity` / `l2Normalize`.

## Hard rules

1. **Two projections, two signal sets.** FULL (`centroid`, `neg_centroid`,
   `facets`, `axes`, `clusters`) may include private watches + watchlist — owner
   recs only. PUBLIC (`public_snapshot`, `public_centroid`) excludes private WATCH
   events, ratings on titles whose ONLY watches are private (a private watch with a
   score upserts the canonical rating), progress on such titles, and the watchlist.
   **Anything shown to a user other than the owner — compatibility, follow
   suggestions, profile widgets, OG cards — uses PUBLIC.** The filtering happens in
   `weights.ts` (`titleWeight` / `isPrivateOnly` / `isRatingPrivate`), before any
   aggregation; never by redacting a full result.
   - **Privacy is decided over ALL entry kinds, uncapped.** A private NOTE with a
     score and a private review BOTH upsert the canonical rating (`logWatchAction`,
     the review composer), so a WATCH-only check leaks them (review finding, v2).
     `fetchEntryVisibility` unions watch_events (any kind) + user_reviews per title
     id with NO row cap; WATCH-only counts are used for WEIGHTING only. A rated
     title whose watches fall outside the 500 most recent must still get its
     privacy decision — never infer "public" from a missing aggregate row.
   - The profile histogram (`getPublicScoreHistogramRows`) and the "Currently
     watching" shelf (`getPublicProgressShelf`) apply the same rules; any new
     public read of diary/rating data must too.
   - A COMPLETED/CAUGHT_UP finish is credited publicly only when every WATCH on
     the series is public.
2. **No AI.** Stored embeddings + catalog joins only. Fable rule: captions are number
   templates about titles; endpoints are dimension labels. Tests assert no "you're /
   you are / are a" in rendered copy.
3. **Render path never throws.** `getProfileTaste` try/catches → `null`; a failed
   recompute serves the last stored row. The profile page stays ISR (no
   `auth()`/`headers()`); owner-only UI is a client island off `useProfileViewer()`.
4. **Bump `TASTE_ALGO_VERSION`** (`src/lib/taste/constants.ts`) on any weight /
   threshold / label / formula change — rows with another version recompute on read.
   No backfill needed.
5. **Dirty marking**: `markStatsDirty(tx, userId)` flags BOTH user_stats and
   user_taste_profiles in ONE statement (data-modifying CTE) — every existing hook
   site got taste for free. Writes that change taste but not stats call
   `markTasteDirty` (watchlist add/remove, fire-and-forget) or `markTasteDirtyTx`
   (`setFourFavorites`). New taste-relevant write paths must do the same.
6. **Adult content never reaches /u/*** (indexable): `fetchMetaFor` filters
   `adult = false`, and `isAdultKeyword` drops adult-adjacent keyword/theme labels
   (display hygiene; see `seo-search-console.md`).
7. **No catalog scan on a request.** Lift baselines come from
   `taste_facet_baseline`/`taste_baseline_meta` (PK lookups), rebuilt by the
   `taste-baseline` cron (19:00 UTC, `nice -n 19`, CRON_HOUR_UTC guard). Empty
   tables → uniform prior. Recomputes: per-user dedupe, global `p-limit(2)`, 20s
   cap, 1.5s reader wait then stale, failure backoff 5 min→1 h.

## Gotchas (each cost time)

- **`user_stats` has the same lost-dirty race** — `dirty_at` (clock_timestamp)
  guards `refreshUserStatsSnapshot` exactly like `updated_at` guards
  `writeTasteRow`.
- **`series.episode_run_time` can be NULL**, not just `{}` — stats crashed with
  `fallbackRuntimes.length` on such rows (found by the privacy integration test).

- **Mark-dirty during a recompute must survive it.** Markers set `updated_at =
  clock_timestamp()` (NOT `now()`, which is the transaction START time and can be
  older than the recompute's read); `writeTasteRow` keeps `dirty = true` when the
  row's `updated_at` moved past the value it observed before computing.
- **User-mean-centred scores need a base engagement term.** With only "unrated watch
  = +0.5", a consistent high rater's at-mean 9s fold to 0/negative and their profile
  collapses. Every watched OR rated title gets +0.5 once (`W_ENGAGED`).
- **Lift baseline = catalog, not users** (stable, cacheable, not circular).
  Population = non-adult titles with ≥100 TMDB votes; falls back to all non-adult
  titles when that is < 1000 (dev). AI tags use `ai_data` as their population.
  The nightly cron precomputes every key; requests read only the user's own keys
  by PK (1h in-process cache in `baseline-cache.ts`).
- **Free-text AI tags** are keyed `lower + whitespace-collapsed` in BOTH the JS
  (`normalizeTagKey`) and the cron's baseline SQL (`TAG_KEY` in `taste-baseline.ts`)
  — change one, change both, and bump `TASTE_ALGO_VERSION`.
- **Embeddings are read as `embedding::real[]`** (driver returns number[]; no 12KB
  text parse per title). Vectors are written with `${literal}::vector`.
- **PM2 only treats `*.config.{js,cjs}` as an ecosystem file.** A local
  `ecosystem.taste.cjs` was run AS A SCRIPT (process named after the file, no server).
  Name local ecosystems `ecosystem.<x>.config.cjs`.
- **The dev DB is shared** with other agents/worktrees: `prisma db push` from a
  schema that lacks `UserTasteProfile` would want to drop the table (it refuses
  without `--accept-data-loss` once rows exist), and another worktree's `prisma
  generate` rewrites the shared client without the model → "Unknown field" until you
  re-run generate from this branch.

## Local data

`scripts/seed-taste-demo.ts` (:5436-guarded, idempotent) — run AFTER
`seed-social-demo.ts`. Hydrates ~55 curated titles TMDB-only (pass
`ENV_FILE=<path to .env.local>` for `TMDB_API_KEY`; dotenv never overrides
`DATABASE_URL`), writes DEV-ONLY synthetic embeddings + AI tags where missing
(`ai_data.model_id = 'dev-synthetic-taste'`), and per-persona histories including
PRIVATE watches (ada: horror, bea: crime series, local_tester: romcoms) that must
never appear on `/u/*`. It also gives the test-auth user (`test-local-user`) the
handle `local_tester` so an E2E session can view its own profile. Recompute is
~20–100ms per user locally (cold baseline cache on the first).

## Pre-deploy

- `db push` adds `user_taste_profiles`, `taste_facet_baseline`,
  `taste_baseline_meta` (all columns nullable/defaulted) and
  `user_stats.public_stats` + `user_stats.dirty_at` (nullable) — no
  NOT-NULL-on-populated risk, no `--accept-data-loss`.
- Until the first `taste-baseline` run, lifts use the uniform prior and the
  percentile axes are absent. Run it once by hand after the first deploy:
  `FORCE_RUN=1 nice -n 19 npx tsx scripts/refresh-taste-baseline.ts`, then check
  `logs/taste-baseline-out.log` per-type timings against the spec §6 estimate.
- The first public-profile render per user after deploy recomputes both stats
  projections (public_stats NULL) and the taste row — bounded queries, but expect a
  slightly slower first render per profile. Baseline cache is per process and
  cold after each restart, but it only reads the precomputed tables.
- The privacy toggle revalidates `/u/<username>`; the CDN copy can lag ~5 min
  (same as other profile edits — `social-features.md` pre-deploy item 4).

## Recommendations, taste match, Cue (branch `feat/taste-recs`)

Spec: `docs/superpowers/specs/2026-10-09-taste-recommendations-design.md` (formulas,
fallback table, gate matrix). Plan: `docs/superpowers/plans/2026-10-09-taste-recommendations.md`.

| Layer | Where |
|---|---|
| Pure rec math (re-rank, MMR + Steck calibration, explanations, RRF merge) | `src/lib/taste/recommend.ts` (+ `recommend-constants.ts`, `REC_ALGO_VERSION`) |
| Pure taste match + gate | `src/lib/taste/compatibility.ts` |
| Client-safe DTOs | `src/lib/taste/recommend-types.ts` |
| SQL (ANN candidates, exclusions, popular fallback, twins scan) | `src/server/db/postgres/social/taste-recs.ts` |
| Services | `src/server/services/taste/{recommend,match}.ts` |
| Actions (POST) | `src/server/actions/taste-recs.ts` — `getHomeRecs`, `getTasteMatch`, `getTasteTwins` |
| UI | `home/for-you-section.tsx`, `home/taste-twins-strip.tsx`, `profile/taste-match.tsx` (reserved slot) |
| Cue | `ai/tools/recommend-for-me.ts` (`recommend_for_me`), `ai/tools/taste-summary.ts` (`get_user_profile.taste`) |
| Eval | `scripts/eval-recs.ts` (read-only, :5436-guarded) |

Rules:

1. **Recs = FULL scope, owner only; match + twins = PUBLIC scope for BOTH sides**
   (`publicRatingsFromSignals` → `isRatingPrivate`, `getUserTasteEmbedding({scope:"public"})`).
   Owner recs may explain with a PRIVATE watch ("Like Get Out") — fine, only the owner
   sees them; never move rec explanations onto a surface someone else can see.
2. **Catalog ANN only behind `hasVectorIndex(table)`**, in the §19 shape (filters
   OUTSIDE the MATERIALIZED CTE, `annSessionSql` in the same `$transaction` batch).
   No index → TMDB `/recommendations` fallback (no distance ordering ever). The dev
   DB has no index by default: apply `postgres/init/03-vector-indexes.sql` to :5436
   (tiny tables, instant) or every dev rec is the TMDB fallback (and that needs a
   `TMDB_API_KEY`).
3. Every candidate query carries `notAdult()`; TMDB fallback items are filtered on
   `adult`; facet/cluster labels pass `isAdultKeyword`.
4. Exclusions = any WATCH/NOTE event, watchlist row, title-level rating row (incl.
   dislikes and heart-only) and series_progress row (`fetchRecExclusions`).
5. Cache key `userId:computedAt:REC_ALGO_VERSION` — a taste recompute (every
   taste-relevant write marks the row dirty) naturally invalidates it. Bump
   `REC_ALGO_VERSION` on any rec-constant change.
6. Gate (`canViewTasteMatch`): no session/self → deny; hidden (BLOCK either way or
   viewer's MUTE, via `getHiddenUserIds`) → deny; viewer public + target public +
   target `showTaste` → allow; mutual follow → allow. Twins use the same candidate
   set minus already-followed (so a private viewer gets no twins).
7. Twins scan `user_taste_profiles` exactly (a few hundred rows). Add a halfvec HNSW
   index on `public_centroid` (hash-gated raw SQL, §19) at ~50k profiles or when the
   scan passes ~20ms.

Gotchas:

- **Card subtitles are one line at 150px** (`MovieCard` `line-clamp-1`): "Because you
  loved Pride & Prejudice" truncated to "Because you loved Prid…" on mobile, losing
  the anchor. Card copy is `Like <title>`; the long form lives in the row heading.
- **Min-max normalised relevance makes tiny pools extreme** — with 3 candidates the
  worst is always rel 0. Tests that exercise MMR need a far-away "anchor" item.
- **Dev synthetic centroids are NOT Cohere-shaped**: pairwise public-centroid cosines
  on the seed are −0.17…0.47, so the 0.3–0.9 tasteSim window shows "28% taste
  match" and twins (min 40%) never appear locally. Calibrate the window on prod data
  before trusting the twins threshold.
- Eval on the dev seed (4 users, ~60 embedded titles, K=3): centroid-only beat
  clusters (nDCG@10 .52 vs .38); calibration/MMR raised diversity and coverage. The
  sample is synthetic and tiny — re-run `eval-recs.ts` on a restored prod dump
  (`scripts/sync-local-db.sh`) before changing `REC_CENTROID_TERM` or the cluster
  count.

See also: `social-features.md` (invariants), `performance.md` §16/§19 (vector index
recipe), `ai-agent.md` (tool list), `audit-log.md` (why derived tables are not
audited).
