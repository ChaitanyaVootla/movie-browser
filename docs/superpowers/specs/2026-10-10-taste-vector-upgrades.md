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
- **σ** (per-dimension std, for optional diagonal whitening) is stored as
  `embedding_std float8[]`. It is computed as √(E[x²] − μ²) from the same single aggregate
  (`avg(v * v)`, pgvector's elementwise `*`). Shipping is gated by
  `TASTE_SPACE_WHITEN` (off; §7).
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

- `annSearch({ table, queries: number[][], k, excludeIds? })` → `AnnHit[]` ({id, dist,
  query}).
  - It runs one batch `$transaction`: `SET LOCAL hnsw.ef_search = k` + iterative scan,
    then per query a `MATERIALIZED` CTE ordered by exactly the halfvec expression.
  - The only predicate allowed inside the CTE is an id exclusion. It is non-selective, so
    the iterative scan keeps walking past excluded rows (EXPLAIN-verified); every other
    filter stays outside.
  - It returns `null` when `hasVectorIndex(table)` is false, and callers choose their own
    fallback.
- `fetchEmbedding(table, id)` reads a single source embedding (similar-to).
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

Calibration derivation (as run): there are too few real users for raw percentiles alone,
so the window is anchored on two robust references, then checked against the real pairs.
- **lo** = the median cosine of a null model: centroids of two random 10–30-title catalog
  sets, i.e. unrelated tastes.
- **hi** = the lower quartile of real users' split-half self-similarity, i.e. as alike as
  a person is to themself.
- **twins floor** = a match whose cosine clears the null-model p99.

Numbers are in §7.

## 6. Latency budget

These are measured on the eval DB (prod-sized vectors, HNSW built): recompute p50/p95,
recs cold/warm, and the cost of the ANN over-fetch. See §7.

## 7. Results (restored prod dump of 2026-10-10, eval container :5437)

**Data reality first.** 798 users, 130 with any taste signal. Of those, 122 have only 1–2
positives, 2 have 3–4, 1 has 10–29 and 3 have 30+. Leave-last-3-out therefore evaluates
4 users, so it is noise. Leave-ONE-out over the (≤60 most recent) positives of those 4
users gives 136 trials. These are correlated within users and dominated by the heaviest
one, so read differences < ~0.04 hit@10 (≈1 SE) as ties. Catalog: 120,676 embedded movies
+ 24,438 series; rec-eligible (≥150 / ≥75 TMDB votes) 15,283; μ over 17,238 baseline titles.

`npx tsx scripts/eval-recs.ts --min-pos=5 --loo` (exact scoring, pool = top REC_POOL):

| variant | hit@10 | nDCG@10 | coverage | novelty | ILD (raw) |
|---|---|---|---|---|---|
| popular | .022 | .013 | .001 | 8.83 | .627 |
| raw / centroid | .051 | .032 | .004 | 12.57 | .498 |
| raw / clusters | .132 | .064 | .006 | 12.59 | .492 |
| raw / clusters+MMR+calib (old default) | .118 | .050 | .006 | 12.54 | .534 |
| centered / centroid | .132 | .064 | .006 | 12.63 | .518 |
| centered / clusters | .132 | .085 | .006 | 12.37 | .484 |
| **centered / clusters+MMR+calib (shipped)** | **.162** | **.083** | **.008** | 12.65 | .531 |
| centered / centroid+MMR+calib | .110 | .053 | .006 | 12.79 | .537 |
| whitened / clusters+MMR+calib | .184 | .083 | .007 | 12.61 | .532 |
| whitened / centroid | .118 | .057 | .005 | 12.60 | .512 |

- Centering more than doubles the centroid-only variant (.051 → .132) and lifts the shipped
  shape from .118 to .162 hit@10 (nDCG .050 → .083). User→title discrimination (centroid ·
  held-out positive vs centroid · random catalog title) rises from AUC .907 (raw) to .952
  (centered).
- **Default: centered + clusters + MMR + calibration.** On real data clusters beat the
  centroid. This reverses the dev-seed result, where the centroid won on synthetic vectors.
  So the cluster-based retrieval and rows stay.
- **Whitening is not shipped.** It is within noise of centering (.184 vs .162 hit, identical
  nDCG) and needs a second estimated statistic. σ is still stored nightly
  (`TASTE_SPACE_WHITEN` flips it).

**Calibration.** These are cosines of PUBLIC/FULL centroids, by space. There are few real
pairs, so a null model is used too.

| distribution | raw | centered |
|---|---|---|
| real user pairs, full scope (n=15): p10 / p50 / p95 | .60 / .68 / .83 | −.05 / .07 / .25 |
| real user pairs, public scope (n=10): p50 / p95 | .69 / .74 | −.03 / .19 |
| null: two random 30-title sets: p5 / p50 / p99 | .93 / .94 / .95 | −.12 / .02 / .22 |
| null: two random 10-title sets: p50 / p99 | .84 / .88 | .01 / .19 |
| split-half self-similarity (n=4): p25 / p50 | .89 / .95 | .57 / .73 |

In raw space two *random* sets of titles (.94) look more alike than any two real users
(.68). The old 0.3–0.9 window mapped every real pair to 50–88% and random strangers to
100%. Centered window: **lo = 0.02** (null median → 0%) and **hi = 0.60** (≈ p25 of
self-similarity → 100%). The twins floor stays `TWIN_MIN_MATCH = 40`, which now means a
cosine ≥ 0.252: above the null p99 (0.19–0.22) and at ≈ the p95 of real pairs. A twin is a
top-5% pair, never a coincidence.

**Explanation threshold.** The nearest-anchor cosine of recommended items is p10/p25/p50
.51/.55/.58 in raw space and .26/.31/.37 centered. `REC_BECAUSE_MIN_COS = 0.3` is kept. In
raw space it always passed; centered, about the weakest quarter of picks fall back to a
facet label instead of a weak "Because you loved X".

**Latency (eval DB, HNSW built, M-series laptop, Docker).** Measured with
`scripts/eval-taste-latency.ts`:

| | |
|---|---|
| recompute, all 130 users | p50 3 ms, p95 7 ms, max 515 ms (first call: cold baseline cache) |
| recs cold (cache cleared), 6 users with a centroid | p50 316 ms, p95 564 ms (k=1000) — was p50 148 / p95 828 at k=150 + exclusion-sized LIMIT |
| recs warm | p50 3 ms, p95 4 ms |
| ANN, movies, 4 queries + filter stage | k=150: 30 ms · k=400: 70 ms · k=1000: 139–164 ms |
| μ removed from the ANN query (EXPLAIN) | not needed — the index takes the centered query as-is |

**ANN over-fetch / recall.** This is the share of the EXACT centered top-160 (over every
eligible movie) that survives retrieval plus re-rank, for users with ≥10 positives:

| k per query | ×1 | ×2 | ×3 |
|---|---|---|---|
| 150 | .35 | .37 | .37 |
| 400 | .53 | .59 | .59 |
| 1000 | .64 | .75 | .76 |

The real bottleneck is not centering but the **vote floor after the LIMIT**: only ~15% of
embedded movies have ≥150 TMDB votes, so k=150 left ~25 eligible titles per query. The
μ·q distance correction is worth +0.01–0.02. Shipped: k = 1000 (the ef_search ceiling),
over-fetch ×2. The heaviest user (1,405 excluded movies) still has low recall (.12). The
exclusions are no longer the cause: they are skipped inside the iterative scan, verified by
EXPLAIN as Index Scan + Filter, 300 rows, 31 ms cold. The likely cause is the negative-
centroid penalty, which the ANN cannot target; this is still open.

A vote-floor EXISTS *inside* the CTE also kept the HNSW plan on the eval DB (Nested Loop
over the index, iterative scan, 300 rows in 26–38 ms). It is not shipped, because prod
planner statistics differ (1.16M movie rows vs 188k here) and §19's full-scan trap is
exactly a planner flip. Re-test it on prod with EXPLAIN before adopting it. It would let
k drop back to ~200.

## 8. Report-only findings

**Name noise.** This probe is underpowered: 3 users with ≥30 positives, 30 recommended
items each. It measures the share of top-10 recs that share a franchise (movie collection)
or a top-3-billed lead actor with a training positive:

| list | franchise | lead |
|---|---|---|
| popular | .03 | .13 |
| genre-matched popular | .03–.07 | .17–.23 |
| raw / centroid | .17 | .33 |
| centered / centroid | .23 | .63–.73 |
| centered / clusters+MMR+calib | .20–.27 | .63–.67 |

Names clearly carry signal: lead-sharing runs 3× the genre-matched baseline, and centering
amplifies it, because removing the shared component leaves the distinctive parts, which
include names. Held-out hit rate still improved, so this is not yet shown to be harmful.
Much of "same lead" is a legitimate taste signal.

Recommendation: do NOT re-embed now. Revisit when ≥30 users have ≥10 positives, so the
eval can tell a name-free vector apart. The cost is small:

- The embedding text is ~750 characters ≈ 190 tokens per title, ~170 tokens without the
  "Directed by / Starring" parts.
- 145k embedded titles × 170 tokens ≈ 25M tokens. That is ≈ $3 at Cohere Embed v4's Bedrock
  list price of $0.12/M, which matches the "~$4" estimate.
- `src/lib/model-pricing.ts` books it at $1/M, which would put it at ≈ $25. That table entry
  should be checked; it may overstate the embedding costs on the admin dashboard 8×.
- Extra storage is a second vector column + HNSW index, ≈ +0.6 GB for movies (halfvec).

A cheaper mitigation, if lead-clustering ever reads as repetitive, is a small MMR
redundancy term on shared lead/collection.

**Item-item co-occurrence.** Not viable. There are 892 positive (user, title) pairs over
823 titles; 45 titles have ≥2 positive users and 1 has ≥5. Organic logging is ~60–95 watch
events/month from ~10–15 active users. The June spike of 1,333 is the `watched_movies`
backfill. Item-item similarity needs roughly ≥20 co-positive users per item pair over a
meaningful share of the catalog, i.e. tens of thousands of positives from ≥1,000 engaged
users. At the current rate that is decades away, so it only becomes realistic through
CSV-import adoption (Letterboxd/Trakt) or a large growth step. Re-measure with
`eval-recs.ts`, whose last line is the co-occurrence count.
