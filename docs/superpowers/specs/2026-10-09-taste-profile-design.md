# Taste Profile — Core + Profile UI (design)

Date: 2026-10-09 · Branch: `feat/taste-profile-core` (base `next` @ f79204ee) ·
Status: built locally, not deployed.

Supersedes the `UserTasteVector` / `user_taste_vectors` design in
`docs/superpowers/plans/2026-06-12-phase2-identity-artifacts.md` (Task 1 model,
Task 5 service). That plan's architecture decision 2 (taste vectors are
**stored**, dirty-snapshot lifecycle) and decision 5 (Fable rule) still hold; this
spec replaces the single-vector table with a richer derived profile.

## 1. Goal

A deterministic, explainable **taste profile** per user, computed from their
own tracking data, used for:

1. **Profile UI now** — four widgets on `/u/[username]` ("Taste DNA", "Moods &
   themes", "Your people", "Taste clusters"), rendered from a cacheable public
   snapshot.
2. **Recommendations + user↔user taste match later** (next agent) — a stored
   1024-d centroid (Cohere v4 space, same as `movies.embedding`), a negative
   centroid, PinnerSage-style medoid clusters, and lifted facet tables.

Non-goals: recommendations, compatibility UI, feeds, any LLM or embedding call.

## 2. Hard rules

- **No AI anywhere** — no LLM, no Cohere. All math is pure TS over stored
  embeddings and catalog joins. Fable rule: copy is numbers + neutral templates;
  axis endpoints are dimension labels ("Mainstream ↔ Niche"), never archetypes,
  never "you are a…".
- **Privacy by construction** — two projections are computed from two signal
  sets (§5). Anything rendered on `/u/*` comes ONLY from the public projection.
- **Edge-cache invariant** — the public snapshot is viewer-agnostic and rendered
  in the ISR tree with no `auth()`/`headers()`. Owner-only hints are client
  islands keyed off `useProfileViewer()`.
- **Never throws on render** — the profile read path wraps taste in try/catch →
  `null` (same contract as `getReviewHistogram`), and `next build` with a bogus
  `DATABASE_URL` still succeeds.
- **Derived table, not audited** — `user_taste_profiles` is NOT added to
  `05-audit.sql` (it is a cache of other audited rows).

## 3. Schema

```prisma
model UserTasteProfile {
  userId         Int                          @id @map("user_id")
  centroid       Unsupported("vector(1024)")?                          // FULL Rocchio centroid (private recs)
  negCentroid    Unsupported("vector(1024)")? @map("neg_centroid")     // FULL negative centroid
  publicCentroid Unsupported("vector(1024)")? @map("public_centroid")  // PUBLIC-signal Rocchio centroid
  clusters       Json     @default("[]")                               // FULL clusters (with memberIds)
  facets         Json     @default("{}")                               // FULL lift tables
  axes           Json     @default("[]")                               // FULL axes
  signalCount    Int      @default(0) @map("signal_count")
  positiveCount  Int      @default(0) @map("positive_count")
  publicSnapshot Json     @default("{}") @map("public_snapshot")       // display-safe projection
  algoVersion    Int      @default(0) @map("algo_version")
  dirty          Boolean  @default(true)
  computedAt     DateTime? @map("computed_at")
  updatedAt      DateTime @default(now()) @updatedAt @map("updated_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("user_taste_profiles")
}
```

Additions vs. the brief, with reasons:

- **`publicCentroid`** — user↔user compatibility and follow suggestions are shown
  to *other* users, so they must use a vector built from public signals only;
  using the full centroid would leak private watches/watchlist through a number.
  `centroid` stays FULL for the owner's own recs.
- **`algoVersion`** — a stored row whose version ≠ `TASTE_ALGO_VERSION` is
  recomputed on read, so tuning weights later invalidates every snapshot without
  a migration or a backfill.
- `updatedAt` carries `@default(now())` because `markTasteDirty` inserts with raw
  SQL (Prisma's `@updatedAt` has no DB default).

`UserStats` gains `publicStats Json? @map("public_stats")` (§8).

No vector index: at hundreds of users a KNN over `public_centroid` is a seq scan
of a few hundred rows. If one is ever needed it must follow performance.md §19
(halfvec expression index, hash-gated raw SQL, MATERIALIZED CTE, `ef_search`).

**Deploy safety:** `db push` adds one new table whose columns are all nullable
or defaulted, plus one nullable column on `user_stats`. No NOT-NULL-on-populated
column, no drop, no rename → no `--accept-data-loss` needed.

## 4. Signals and weights

Per title (movie, or series at series level), all signals are folded into ONE
weight `w`:

| Signal | Weight | Decay |
|---|---|---|
| In Four Favorites | +3 | none |
| `liked` heart | +2 | none |
| `score` (1–10) | `clip((score − μ)/2, −2, +2)`; μ = user's mean score if they have ≥5 title-level scores, else 5.5 | yes (rated_at ?? created_at) |
| thumb (only when no score) | ±1.5 | yes |
| engagement: ≥1 WATCH event **or** a score/thumb (counted once) | +0.5 | yes (latest watch, else rated_at) |
| rewatch | +0.5 per extra viewing, capped +1.5 (movie: WATCH count − 1; series: max(cycle) − 1) | yes |
| series status COMPLETED / CAUGHT_UP | +0.75 | yes (progress updated_at) |
| series status DROPPED | −1 | yes |
| watchlist | +0.3 (FULL scope only) | none |

- **Tuning vs. the brief:** the brief gave the +0.5 to unrated watches only. With
  a user-mean-centred score that makes every at-mean rating 0 and every
  slightly-below-mean rating negative, so a consistent high rater (all 8s and
  9s) collapsed to a handful of positives (caught by `profile.test.ts`). The
  +0.5 is therefore a base "chose and watched/rated it" term for ANY engaged
  title: an at-mean score now weighs exactly like an unrated watch, and a score
  2 points under the mean (−1) is still negative.
- Decay `exp(−Δt/τ)`, τ = 18 months (547.5 days). Dateless events fall back to
  the row's `created_at`.
- `kind = 'WATCH'` only; `NOTE` entries never count as watched.
- Ratings are title-level only (movie rows, and series rows with
  `season_number IS NULL AND episode_number IS NULL`). Season/episode ratings are
  ignored in v1 (deferred).
- `w > 0` → positive set P; `w < 0` → negative set N; `w = 0` → ignored.
- Bounded inputs: each source query is capped at the 500 most recent rows, and
  the folded title set is capped at the 600 titles with the largest `|w|`.

### Rocchio centroid

`c = normalize( Σ_{t∈P} w_t·ê_t / Σ w_t  −  0.3 · Σ_{t∈N} |w_t|·ê_t / Σ |w_t| )`,
ê = L2-normalised title embedding. NULL when fewer than 3 positives have an
embedding. `negCentroid` = the normalised negative mean (NULL when N is empty).

## 5. Privacy matrix

| Signal | FULL (`centroid`, `facets`, `axes`, `clusters`) | PUBLIC (`publicSnapshot`, `publicCentroid`) |
|---|---|---|
| WATCH events, `is_private = false` | yes | yes |
| WATCH events, `is_private = true` | yes | **no** |
| Ratings / hearts | yes | yes, **unless** the title's only WATCH events are private (a private watch logged with a score also upserts the canonical rating — counting it would leak the private watch) |
| Four Favorites | yes | yes (the list is always shown on the profile) |
| Series progress status | yes | yes, under the same "not private-only" rule |
| Watchlist | yes | **no** |
| `recent_items`, `continue_watching` | no | no |
| `users.metadata.profile.showTaste === false` | — | public snapshot not rendered at all |

The public projection is computed from a separately-filtered signal set, never by
redacting the full result.

## 6. Facets (lift vs. a shrunk baseline)

Facet types: `genre`, `keyword`, `theme` (AI THEME + VIBE tags, lower-cased and
whitespace-collapsed), `mood` (AI MOOD `subcategory:value`, e.g. `tone:dark`),
`director` (movie directors + series creators), `cast` (top-billed,
`credit_order < 5`, non-aggregate), `country` (production / origin), `language`
(original language), `decade`.

**Baseline choice: the catalog, not other users.** The global user distribution
is a few hundred users, dominated by a handful of heavy loggers, and circular (it
moves when the user being profiled moves). The catalog is stable and cacheable.
Baseline population B = non-adult titles with ≥ 100 TMDB votes (the slice people
actually watch; the raw catalog is ~800k long-tail rows that would make every
mainstream facet look "niche"). If |B| < 1000 (dev DB) it falls back to all
non-adult titles. AI facets use the enriched catalog (titles with `ai_data`) as
their population, because only those titles can carry a tag. Baseline counts are
fetched only for the facet keys the user actually has and cached in-process for
24h (`baseline-cache.ts`).

For facet value f of type T over the positive titles P_T that carry ANY value of
type T (so missing metadata does not dilute the share):

```
u  = Σ_{t∈P_T, f∈t} w_t / Σ_{t∈P_T} w_t           user's weighted share
b  = (count_B(f) + 1) / (|B_T| + 1)               baseline share (add-one)
R  = ln(u / b)                                    log-lift
v  = |{t ∈ P_T : f ∈ t}|                          support
score = v/(v+m) · R + m/(v+m) · C,  m = 3, C = 0  (Bayesian shrinkage to "no lift")
```

A facet is kept when `v ≥ 2` and `score > 0`; top-k (k = 8, people 6) by score,
each with `count = v`, `lift = e^R` and up to 6 supporting titles (highest weight).

**People** additionally get a rating view: `R = mean user score` over the
person's scored titles, `C = user mean score`, `m = 2`, same shrinkage formula
(`v ≥ 2`). "Most watched" = count of watched titles (public scope: public
watches). Scores display as stars (score/2).

## 7. Axes (deterministic, 0–1, neutral captions)

| Axis | 0 ↔ 1 | Value | Min support | Caption template |
|---|---|---|---|---|
| `mainstream` | Mainstream ↔ Niche | 1 − mean popularity percentile of positives within B | 5 | "Favourites average the top {p}% by popularity" |
| `era` | Classic ↔ New | percentile of the positives' median release year within B's years | 5 | "Median release year {y} (catalog median {cy})" |
| `range` | Focused ↔ Eclectic | normalised Shannon entropy of the weighted genre distribution of positives | 8 | "Favourites span {n} genres" |
| `rating` | Generous ↔ Tough | `0.5 − mean(score − tmdbAvg)/4`, clipped | 5 rated titles with a TMDB average | "Rates {d} points above/below TMDB on average" / "in line with" |
| `weight` | Light ↔ Heavy | mean of AI `emotional` (light 0 / medium .5 / heavy 1) and `tone` (light 0 / mixed .5 / dark 1) over positives | 5 | "{h}% of favourites are emotionally heavy" |

Popularity/year percentiles use 101 catalog quantiles (`percentile_cont`) cached
24h. An axis below its support is omitted (never shown as a fake 0.5).

## 8. Clusters (PinnerSage-style medoids)

Input: the 200 highest-weight positives that have an embedding (bounds the O(n²)
step to ~20k pair distances). Ward agglomerative clustering on L2-normalised
vectors (squared Euclidean = 2 − 2cos), nearest-neighbour-chain implementation
with Lance–Williams updates; merges sorted by height and replayed to cut at k.
k ∈ {2,3,4} chosen by the best mean cosine silhouette, every cluster ≥ 2 members;
if fewer than 8 inputs or the best silhouette < 0.02 → one cluster. Medoid =
member minimising Σ w_j·(1 − cos). Importance = Σ member weight / Σ all weight.
Each cluster's `topFacets` = the top 3 lifted genre/theme/keyword facets computed
over its members only; the UI label is the first one. The widget shows only when
there are ≥ 2 clusters.

## 9. The stats privacy leak (fixed here)

`stats.ts fetchEventRows` did not filter `is_private`, so the PUBLIC profile's
films/episodes/hours, genres, decades, countries, people and streaks counted
private watches. Fix: rows carry `isPrivate`; one compute pass produces BOTH
snapshots (`stats` = full, `publicStats` = `!isPrivate` rows only, people filtered
to the surviving titles). `getUserStatsSnapshot(userId, { scope })` — the owner's
`/stats` reads `full`; the public profile reads `public`. A row with
`publicStats IS NULL` (pre-existing) recomputes on first read.

The profile ratings histogram applies the §5 rule too (scores whose title has
only private watches are excluded), so it agrees with the taste projection.

## 10. Compute lifecycle

- `getTasteProfile` reads the row; recomputes when missing, `dirty`, older than
  24h, or `algoVersion ≠ TASTE_ALGO_VERSION`. Concurrent recomputes per user share
  one in-flight promise.
- Dirty marking: `markStatsDirty(tx, userId)` now also upserts
  `user_taste_profiles.dirty = true` in the SAME statement (a CTE), so every
  existing hook site (ratings, watch events, progress, import runner) flags both
  atomically with the write. Sites that touch taste but not stats call
  `markTasteDirty`: watchlist add/remove (fire-and-forget) and Four Favorites
  (`setFourFavorites`, inside its tx).
- Layering: pure math in `src/lib/taste/`, SQL in
  `src/server/db/postgres/social/taste.ts` (+ `taste-dirty.ts`), orchestration in
  `src/server/services/taste/`.

## 11. Public snapshot (display contract)

```ts
interface TasteSnapshot {
  v: 1; computedAt: string;
  positiveCount: number; signalCount: number;
  axes: TasteAxis[];                         // {key, value 0..1, support, lowLabel, highLabel, caption}
  moods: TasteFacet[];                       // theme + mood facets, merged, top 10
  facets: Record<FacetType, TasteFacet[]>;   // {type, key, label, count, lift, score, titles[]}
  people: { mostWatched: TastePerson[]; highestRated: TastePerson[] };
  clusters: TasteClusterView[];              // {medoid: TitleRef, size, importance, label, topFacets[]}
}
```

`PublicProfileDTO.taste`:
`{ status: "ready", snapshot } | { status: "insufficient", positiveCount, needed } | { status: "hidden" } | null` (null = read failed).
Widgets render only for `ready` (≥ 10 public positive titles). The owner sees an
owner-only island for `insufficient` (progress + "rate / heart / Four
Favorites" nudges) and for `hidden`.

## 12. Profile UI

- Widgets (category `taste`): `taste.dna` (labelled sliders — more legible at
  390px than a radar, and each axis carries its own caption), `taste.moods`
  (chips with counts; tapping opens the supporting titles — Popover on desktop,
  Vaul Drawer + `useHistoryDismiss` on mobile), `taste.people` (directors/cast,
  Most watched ↔ Highest rated segmented toggle), `taste.clusters` (2–4 medoid
  posters, label + member count).
- Added to the default layout after the charts. Profiles with a SAVED layout do
  not gain them automatically (respecting the saved arrangement); the owner adds
  them from the Customize palette.
- Privacy toggle "Show taste profile on my public profile"
  (`metadata.profile.showTaste`, default ON) in the settings dialog's Privacy
  section, saved via `setTasteVisibilityAction`, which revalidates `/u/<username>`.
- The reserved compatibility slot in `profile-body-content.tsx` stays EMPTY.
- `PosterBoard` gets the missing `unoptimized`.

## 13. Interface for the next agent

`src/server/services/taste/index.ts` (server-only):

```ts
getTasteProfile(userId, { scope: "full" | "public" }): Promise<TasteSnapshot | null>
getTasteClusters(userId): Promise<TasteCluster[]>          // FULL, with memberIds + medoid ids
getUserTasteEmbedding(userId, { scope?: "full" | "public" }): Promise<number[] | null>  // default full
getTasteVectors(userId): Promise<{ centroid; negCentroid; publicCentroid }>
markTasteDirty(userId): void                                // fire-and-forget
getProfileTaste(userId, show): Promise<ProfileTasteDTO | null>  // profile DTO, never throws
recomputeTasteNow(userId)                                   // dev/test: force a recompute
```

Storage note: the `facets` column holds `{ facets, moods, people }` (every
lift-derived table of the FULL scope); `clusters` holds the FULL clusters with
`memberKeys`/`medoidKey` ("m:<id>" / "s:<id>"); the public snapshot's clusters
are the display view without member keys.

Pure helpers in `src/lib/taste/`: `cosineSimilarity`, `l2Normalize`,
`rocchioCentroid`, `titleWeight`, `decayFactor`, `liftFacets`, `shrink`,
`wardClusters`, `computeAxes`. Rules for consumers: anything shown to someone
other than the owner uses `scope: "public"` / `publicCentroid`; recs for the
owner may use `full`. A query that ranks catalog titles by a centroid must use the
HNSW recipe in performance.md §19 (order by `embedding::halfvec(1024) <=>
q::halfvec(1024)` inside a MATERIALIZED CTE).

## 14. Thresholds (single source: `src/lib/taste/constants.ts`)

`MIN_POSITIVES_FOR_CENTROID = 3`, `MIN_PUBLIC_POSITIVES_FOR_DISPLAY = 10`,
`FACET_MIN_SUPPORT = 2`, `FACET_PRIOR_M = 3`, `PEOPLE_PRIOR_M = 2`,
`CLUSTER_MAX_INPUT = 200`, `CLUSTER_MIN_INPUT = 8`, `MAX_CLUSTERS = 4`,
`SOURCE_ROW_CAP = 500`, `TITLE_CAP = 600`, `DECAY_TAU_DAYS = 547.5`,
`TASTE_TTL_MS = 24h`, `BASELINE_MIN_VOTES = 100`.

## 15. Test plan

- Unit (pure, `src/lib/taste/*.test.ts`): weights per signal + clipping + mean
  fallback; decay; scope filtering (private watch, private-only rating,
  watchlist); Rocchio (null under 3, negative pulls away, normalised); cosine;
  lift + shrinkage monotonicity, min support, add-one baseline; Ward on separable
  synthetic clusters recovers them, k selection, medoid, importance sums to 1,
  small-n single cluster; axes each with support gating and caption numbers.
- Stats: `computeStats` public vs full split; pinned test that private rows never
  reach the public snapshot.
- DB integration (self-skipping on no DB, :5436): compute a seeded user's profile,
  assert private-watch titles are absent from the public snapshot and present in
  the full one, dirty flag lifecycle, `markStatsDirty` flags taste.
- Widgets: render tests for empty/insufficient/ready states.
- Browser: `/u/<demo>` anonymous vs owner at 390 and 1440; ISR grep; `next build`
  with a bogus `DATABASE_URL`.

## 16. Deferred

Season/episode ratings as signals; series-level directors from aggregate crew;
saved-layout auto-insertion of new widget types; per-edit CDN purge on the taste
privacy toggle (relies on `revalidatePath` + the ~5 min profile TTL, same as
other profile edits — see social-features.md pre-deploy item 4); a vector index.
