# Taste-based Recommendations, Taste Match, Cue integration (design)

Date: 2026-10-09 · Branch: `feat/taste-recs` (base `feat/taste-profile-core`) ·
Status: built locally, not deployed. Consumes the taste core
(`docs/superpowers/specs/2026-10-09-taste-profile-design.md` §13).

## 1. Goals

1. **Recommendations** for the signed-in owner: a mixed movie+series "For you"
   row and up to two "Because you loved <medoid>" rows on the home page, each
   item with a deterministic explanation.
2. **Taste match** (user↔user compatibility) in the reserved profile slot, plus
   **taste twins** (follow suggestions by public-centroid similarity).
3. **Cue**: `get_user_profile` gains a compact taste summary and a new
   `recommend_for_me` tool returns explained recommendations.

Non-goals: feeds, a `/u/a/vs/b` page, OG cards, learning-to-rank, any LLM call
(recs and match are pure math over stored embeddings + catalog rows).

## 2. Hard rules (inherited)

- **Privacy:** recs use the FULL scope (the owner's own data, shown only to the
  owner). Anything another user sees — taste match, twins — uses PUBLIC scope
  only (`public_centroid`, public ratings via `isPrivateOnly`), for BOTH sides,
  so the result is symmetric and never leaks a private watch.
- **Edge cache:** home (`revalidate = 14400`) and `/u/[username]` (300) stay ISR.
  All new surfaces are client islands calling server actions (POST, never
  cached). No `auth()`/`headers()` enters any render tree.
- **Adult filter:** every catalog query carries `notAdult(alias)`; TMDB fallback
  results are filtered on `adult`.
- **Vector cost:** catalog ANN runs ONLY when `hasVectorIndex(table)` is true,
  in the performance.md §19 shape: nearest-N in a `MATERIALIZED` CTE ordered by
  exactly `embedding::halfvec(1024) <=> q::halfvec(1024)` with NO filters, then
  filter + re-rank outside, with `SET LOCAL hnsw.ef_search` in the same batch
  transaction (`annSessionSql`). Without the index we never order by distance;
  we fall back to TMDB recommendations.
- **Never throw** on any surface: services return `[]` plus a `reason`.

## 3. Recommendation pipeline

### 3.1 Inputs (service `src/server/services/taste/recommend.ts`)

- `getTasteProfile(uid, {scope:"full"})` → `computedAt` (cache key) + lifted
  facets (genre / language) for fallback labels.
- `getTasteClusters(uid)` (FULL, with `memberKeys`/`medoidKey`).
- `getTasteVectors(uid)` → `centroid`, `negCentroid`.
- `fetchTasteSignals` + `foldSignals(…, "full")` → weighted positives (the
  service needs per-title weights for anchors and the genre target; the stored
  row does not keep them). Top 100 positives by weight are the **anchors**.
- Anchor + cluster-member embeddings (`fetchTitleEmbeddings`) and anchor
  genres/titles (one small query).

### 3.2 Query vectors

- Per cluster, the top `REC_MAX_CLUSTER_QUERIES = 3` by importance: the
  **normalised mean** of the member embeddings (more robust than the medoid,
  which is one title and over-weights its idiosyncrasies). The medoid is used as
  the human anchor ("Because you loved X") of that cluster's row.
- One query from the full Rocchio `centroid`.
- Each vector queries BOTH `movies` and `series` (clusters are mixed).
- A user with a centroid but < 2 clusters simply has one query (centroid) plus
  the single cluster.

### 3.3 Candidate retrieval (`src/server/db/postgres/social/taste-recs.ts`)

One batch transaction per call: `annSessionSql(N)` then, per (vector, table):

```sql
WITH c AS MATERIALIZED (
  SELECT id AS cid, embedding::halfvec(1024) <=> 'q'::halfvec(1024) AS dist
  FROM movies ORDER BY embedding::halfvec(1024) <=> 'q'::halfvec(1024) LIMIT N)
SELECT c.cid, c.dist FROM c JOIN movies m ON m.id = c.cid
WHERE adult IS NOT TRUE                         -- notAdult("m")
  AND m.embedding IS NOT NULL
  AND NOT (m.id = ANY($excluded))
  AND EXISTS (SELECT 1 FROM ratings r WHERE r.movie_id = m.id
              AND r.source_id = (SELECT id FROM data_sources WHERE slug='tmdb')
              AND r.vote_count >= $floor)
```

N = 150 per vector (≤ 4 vectors × 2 tables = 8 index scans, ~8–15ms each warm
on the prod dump numbers in §19). Vote floors: movies 150, series 75 (series
vote counts run ~½ of movies on TMDB). Exclusions = every title the user has
any WATCH event on, any watchlist row, any title-level rating row (score,
thumb or heart — "rated" includes disliked), any series_progress row. Then a
second query fetches metadata + `embedding::real[]` for the union of surviving
ids, capped at the best `REC_POOL = 160` by best per-query distance.

### 3.4 Scoring (pure, `src/lib/taste/recommend.ts`)

For candidate i with unit embedding e:

```
rel_raw  = max_c cos(e, μ_c) + 0.25·cos(e, centroid) − 0.30·max(0, cos(e, neg))
rel      = min-max normalise rel_raw over the pool          (Cohere cosines live in a narrow band)
quality  = (v·R + m·C)/(v + m) / 10,  m = 250, C = 6.6     (IMDb-style vote shrinkage, TMDB avg/votes)
pop      = log1p(popularity) / log1p(max popularity in pool)
score    = 0.72·rel + 0.20·quality + 0.08·pop
```

Light popularity (8%) keeps the list from being junk without becoming
blockbuster-only; the vote floor already removes the obscure tail.

### 3.5 Diversification: MMR + calibration (one greedy pass)

Greedy selection; at each step pick the candidate maximising

```
λ·score_i − (1−λ)·max_{j∈S} cos(e_i, e_j) − γ·KL(p ‖ q̃(S ∪ {i}))
```

- MMR (Carbonell & Goldstein 1998), λ = 0.7.
- Calibration (Steck 2018, "Calibrated Recommendations"): p = the user's
  weighted genre mix over positive anchors (each title spreads its weight evenly
  over its genres); q = the same over the selected list; q̃ = (1−α)q + α·p with
  α = 0.01 (Steck's smoothing so KL is finite); γ = 0.15.
- Both terms are switchable so the eval can compare variants.

### 3.6 Rows

- **For you** = greedy top 20 over the whole pool (mixed media).
- **Because you loved <medoid>** for the top 2 clusters by importance: from the
  remaining pool, candidates whose nearest cluster (argmax cos to μ_c) is that
  cluster, ranked by cos to μ_c blended with quality, MMR'd, top 12. A row with
  < 4 items is dropped.

### 3.7 Explanations (no LLM)

- `{kind:"because", anchor}`: the user's positive anchor with the highest cosine
  to the item, if that cosine ≥ `REC_BECAUSE_MIN_COS` (0.3). Tie → higher weight.
- Else `{kind:"facet", label}`: built from the user's top LIFTED facets that the
  item carries — language adjective when a non-English language facet is lifted
  (`Intl.DisplayNames` → "Korean") + the best lifted genre as a plural noun
  ("thrillers") → "Korean thrillers"; genre-only → "More thrillers";
  language-only → "Korean picks".
- Else `null`. The UI renders `because` as "Because you loved X".

### 3.8 Fallbacks (each sets `reason`)

| Condition | Behaviour | reason |
|---|---|---|
| < 3 positives (no centroid) | popular titles in the user's top genres (positives' genres), else popular overall — PG `popularity DESC` with notAdult + vote floor + exclusions | `cold_start` |
| no valid HNSW index on a table | TMDB `/recommendations` for the user's top 3 positive titles (TMDB client is L1/L2-cached), merged by summed reciprocal rank, filtered (adult, exclusions); anchor = the seed title | `no_index` |
| no user / exception | `[]` | `error` |
| ok | — | `ok` |

### 3.9 Caching

In-process LRU (`Map` insertion order), max 500 entries, TTL 1h, key
`userId:computedAt:REC_ALGO_VERSION`. A taste recompute changes `computedAt`, so
a rating/watch invalidates the cache naturally (taste rows are dirty-marked on
every write). Recs never enter ISR/edge HTML.

### 3.10 Evaluation (`scripts/eval-recs.ts`)

Read-only, refuses unless `DATABASE_URL` contains `5436`. For each user with
≥ 8 positives: hold out the k = 3 most recent positive titles (by latest signal
date), rebuild centroid + clusters from the remaining signals with the pure taste
functions, retrieve by exact JS cosine over the embedded catalog (offline: no
ANN needed), apply the same filters, rank with each variant:
`centroid-only`, `clusters`, `clusters+mmr`, `clusters+mmr+calibration`.
Metrics: hit@10, nDCG@10 (binary relevance), catalog coverage (unique items
recommended / eligible catalog), novelty (mean −log2 popularity-share),
intra-list diversity (mean pairwise 1−cos).

## 4. Taste match

### 4.1 Formula (`src/lib/taste/compatibility.ts`, pure)

Inputs per side: PUBLIC title-level ratings `{key, score|null, liked}` (ratings
on private-only titles dropped via `isPrivateOnly`), and the PUBLIC centroid.

- **scoreSim** (w 0.5) — **Pearson** on the shared 1–10 scores, null when
  n < 3. Pearson is invariant to each user's offset and scale, which is exactly
  what Criticker's percentile normalisation is for (a generous and a tough rater
  who order films the same way agree), without needing each user's full score
  distribution. Zero variance on either side → agreement `1 − 2·MAD/9`. Mapped
  to [0,1] as `(r+1)/2` and **shrunk toward 0.5 (neutral), not toward 0**:
  `0.5 + ((r+1)/2 − 0.5)·n/(n+5)`. (The Phase-2 plan shrank toward 0, which
  reads few-shared pairs as incompatible rather than unknown.)
- **likedSim** (w 0.3) — liked = heart OR score ≥ 8. Overlap coefficient
  `|A∩B| / min(|A|,|B|)` (insensitive to library-size asymmetry), `sqrt`
  spread; null when either side has < 3 liked titles.
- **tasteSim** (w 0.2) — `clamp01((cos − 0.3)/0.6)` on the PUBLIC centroids
  (0.3 → 0, 0.9 → 1). Centroids are averages of Cohere vectors that share a
  large common component, so raw cosines sit high; the window is a first guess
  to be re-fit on prod (the eval script prints the pairwise distribution).
- `score = round(100·Σwᵢsᵢ/Σwᵢ)` over non-null components; null when all are
  null. Output also carries `sharedFavorites` (both liked/≥8, top 6 by sum),
  `fightAbout` (|Δ| ≥ 4, top 6 by Δ) and evidence counts.

### 4.2 Gate (`canViewTasteMatch`, pure)

| Condition | Result |
|---|---|
| no session, or viewer = target | deny |
| BLOCK either direction, or viewer muted target (`getHiddenUserIds`) | deny |
| viewer public AND target public AND target `showTaste !== false` | allow |
| mutual follow | allow |
| otherwise | deny |

Private profiles render no body, so the mutual-follow branch has no UI today
(the server gate supports it for a future compare page).

### 4.3 Taste twins

`getTasteTwins()`: the viewer's PUBLIC centroid vs other users' `public_centroid`
in SQL over `user_taste_profiles` (a few hundred rows; exact scan is cheap — the
"no unindexed vector scan" rule is about the ~1M-row catalog). Candidates must
pass the same gate as taste match (public + showTaste, viewer public), and
exclude self, hidden (blocks/mutes) and already-followed. Label "NN% taste
match" = the tasteSim rescale. Top 6, min 40%. An index (halfvec HNSW on
`public_centroid`, hash-gated SQL) is needed at ~50k profiles or when the scan
exceeds ~20ms.

Surface: home page, directly under the For you rows (signed-in only, hidden
when empty) — the home page is where a signed-in user starts, and the profile
owner view is rarely visited.

## 5. Cue

- `get_user_profile` adds `taste` (FULL scope — the user's own chat):
  `moods` (top 5 labels), `genres` / `keywords` / `directors` (top 3 lifted
  labels), `axes` (`{axis, value 0-1, low, high}`), `clusters`
  (`{label, medoid:{id,mediaType,title}, share}`). ~150 extra tokens.
- New tool `recommend_for_me` (`{mediaType?: "movie"|"series"|"all", limit ≤ 10}`)
  → the recs service; returns id/mediaType/title/year/rating/reason. Guests get
  `{error:"Not logged in"}` and the guest prompt forbids calling it.
- Tool count 12 → 13; system prompt: open-ended "what should I watch" for a
  signed-in user → `recommend_for_me` first, then `smart_discover` for
  constraints.

## 6. Analytics

New `ActionType`s: `rec_impression` (one per row render: `metadata.{row, source,
count, ids[], reason}`) and `rec_click` (`metadata.{row, source, position,
explanation}`), plus `taste_match_view` and `taste_twin_click`.

## 7. Deferred

Season/episode-level recs; negative feedback ("not interested"); a learned
blend; a vs page + OG card; private-profile mutual-follow surface; centering
centroids on the population mean before cosine (better-calibrated tasteSim).
