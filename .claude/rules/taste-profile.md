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
   `weights.ts` (`titleWeight` / `isPrivateOnly`), before any aggregation; never by
   redacting a full result.
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

## Gotchas (each cost time)

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
  Baseline counts are fetched only for the user's own facet keys, cached 24h
  in-process (`baseline-cache.ts`).
- **Free-text AI tags** are keyed `lower + whitespace-collapsed` in BOTH the JS
  (`normalizeTagKey`) and the baseline SQL (`lower(regexp_replace(btrim(text),'\s+',' ','g'))`)
  — change one, change both.
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

- `db push` adds `user_taste_profiles` (all columns nullable/defaulted) and
  `user_stats.public_stats` (nullable) — no NOT-NULL-on-populated risk, no
  `--accept-data-loss`.
- The first public-profile render per user after deploy recomputes both stats
  projections (public_stats NULL) and the taste row — bounded queries, but expect a
  slightly slower first render per profile. Baseline cache is per process and
  cold after each restart (one population count + quantile scan on first use —
  measure on prod data before relying on its latency).
- The privacy toggle revalidates `/u/<username>`; the CDN copy can lag ~5 min
  (same as other profile edits — `social-features.md` pre-deploy item 4).

See also: `social-features.md` (invariants), `performance.md` §16/§19 (vector index
recipe if a KNN over centroids is ever needed), `audit-log.md` (why derived tables
are not audited).
