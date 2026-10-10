# Taste vector quality upgrades (addendum, 2026-10-10)

Addendum to `2026-10-09-taste-profile-design.md` and
`2026-10-09-taste-recommendations-design.md`. Branch `feat/taste-vectors`.

## 1. Problem: Cohere embeddings are anisotropic

Cohere Embed v4 document vectors share a large common component (the "it's a
film/TV synopsis" direction). Raw cosines between any two titles, or between two
users' centroids, are therefore compressed into a narrow, high band. Two guessed
calibrations exist only to cope with that: the taste-match window
`MATCH_TASTE_COS_LO/HI = 0.3/0.9` and the twins floor `TWIN_MIN_MATCH = 40`.
Centroids make it worse. Averaging N titles keeps the shared component intact and
shrinks everything else by about 1/√N, so a heavy user's raw centroid sits close
to *the catalog mean* and looks similar to everyone.

## 2. Fix: mean-centering (optionally whitening)

- **μ** = mean of L2-normalised embeddings over the baseline population (non-adult,
  TMDB votes ≥ `BASELINE_MIN_VOTES`, with the same dev fallback). It is computed in the
  nightly `taste-baseline` job with pgvector's `avg(embedding)`, a single aggregate with
  no Node-side vectors. Raw embeddings are already ~unit, so no per-row normalise is
  needed. It is stored in `taste_baseline_meta.embedding_mean vector(1024)` (nullable,
  additive).
- **σ** (per-dimension std, optional, for diagonal whitening) is stored as
  `embedding_std real[]` (nullable). It is computed from E[x²] − μ², with `avg` over
  `embedding * embedding`… pgvector has no elementwise square, so this uses one
  `unnest` aggregate pass. The eval decides whether it ships (§5).
- `center(v) = normalize(v/‖v‖ − μ)` (whitened variant: `normalize((v/‖v‖ − μ)/σ)`).
  It is pure, in `src/lib/taste/space.ts`, and returns a `TasteSpace` object so every
  caller applies the same transform.
- The centered space is used for:
  - title vectors before Rocchio, Ward clusters and medoids (so stored `centroid`,
    `neg_centroid`, `public_centroid` and cluster member means are all centered);
  - user↔user cosine (match tasteSim, twins SQL `<=>` on stored public centroids);
  - explanation-anchor cosines and rec re-rank relevance (candidates + anchors
    centered in the service before `scoreCandidates`).
- **ANN stays on the raw HNSW index.** Querying the raw index with a *centered*
  unit query `c` ranks by `x·c`. For a unit title vector x,
  `(x − μ)·c = x·c − μ·c`, and `μ·c` is a per-query constant. So the raw-index
  order equals the centered numerator's order. The only term it misses is the
  per-title norm `‖x − μ‖ = √(1 − 2x·μ + ‖μ‖²)`, which varies little across titles.
  We over-fetch (`REC_ANN_OVERFETCH`) and re-rank exactly in centered space; the cost is
  measured in §6.
- **μ absent** (fresh env, cron not run yet) → identity space. Behaviour is exactly the
  old raw pipeline. A row stores `space` (`raw` | `centered` | `whitened`). A row whose
  space differs from the current baseline's is treated as stale and recomputes on its
  next read, and twins compare only rows in the same space.
- `TASTE_ALGO_VERSION` 2→3, `REC_ALGO_VERSION` 1→2.

## 3. One shared ANN primitive

`src/server/db/postgres/vector-search.ts`:

- `annSearch({ table, queries: number[][], k })` → `AnnHit[]` ({id, dist, query}).
  It runs one batch `$transaction`: `SET LOCAL hnsw.ef_search = k` + iterative scan,
  then per query an UNFILTERED `MATERIALIZED` CTE ordered by exactly the halfvec
  expression. It returns `null` when `hasVectorIndex(table)` is false, and callers
  choose their own fallback.
- `annFromId({ table, id, k })` reads the source embedding first, then calls `annSearch`.
- `candidateRowsSql(idxIds, idxDists)`: the shared filter stage, an
  `unnest($ids::int[], $dists::float8[]) AS c(cid, dist)` source that callers join their
  table to and filter or rank in SQL. It is used by smart-discover (its long WHERE
  list) and taste-recs (adult / exclusions / vote floor).
- Pure helpers in `src/lib/taste/rerank.ts`: `bestPerKey` (multi-query merge), `blend`,
  and min-max `normalizeScores`.
- `notAdult()` stays inside `$queryRawUnsafe` string SQL only.

Migrated: `taste-recs.annCandidates`, `smartDiscover` (similarToId + semanticQuery ANN
path), and therefore the Similar module (`getSimilarItems` → smartDiscover). Behaviour
is unchanged: same LIMIT, ef_search and filters, and the same outer ORDER BY. The only
difference is that it now runs in two statements inside one transaction.

## 4. Taste-aware Cue (`smart_discover.forMe`)

- `forMe: boolean` (signed-in only; ignored for guests and without a query/similarTo).
- The pool is `limit × 4` (≤ 60) from smartDiscover, with the user's exclusions
  (watched, watchlist, rated) passed as `excludeIds`.
- `final = 0.65 · mm(querySim) + 0.35 · mm(tasteSim)`, where `mm` is a min-max over the
  pool. Query cosines (raw query↔doc) and centered taste cosines live on different
  scales, so blending raw values would let one dominate. `tasteSim` is the cosine of the
  centered candidate against the FULL centroid (owner's own chat).
- With no centroid, it falls back to the plain query ranking with `forMe: "no_profile"`
  reported.

## 5. Evaluation protocol (decides the variant + thresholds)

Restored prod tables in a separate `movie-browser-eval-pg` container (:5437) hold
filtered rows only: embedded titles with TMDB votes ≥ 50 plus every user-referenced
title. The protocol is leave-last-K-out (K=3) over users with ≥ 10 positives, scoring
against an exact catalog. The variants are popular, centroid/clusters × raw/centered,
clusters-centered + MMR + calibration, and whitened. Metrics: hit@10, nDCG@10, coverage,
novelty, ILD. Results and the chosen default are in §7.

Calibration derivation: the tasteSim window is `[p10, p95]` of the centered
public-centroid pairwise cosine distribution over real users (so the median pair reads
~"40-50%" and only the top 5% reach 100%). `TWIN_MIN_MATCH` = the match at p75, so a
twin is in the top quartile of all pairs. Numbers in §7.

## 6. Latency budget

These are measured on the eval DB (prod-sized vectors, HNSW built): recompute p50/p95,
recs cold/warm, and the cost of the ANN over-fetch. See §7.

## 7. Results

(filled in after the eval run — see the commit that adds this section)
