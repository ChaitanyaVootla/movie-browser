/**
 * Recommendation tuning constants (spec
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §3).
 * Bump REC_ALGO_VERSION on any change: it is part of the in-process cache key.
 */
export const REC_ALGO_VERSION = 3; // v3: series ANN capped at k=500 (planner seq-scan crossover); v2: centered taste space, exact re-rank of an over-fetched ANN pool

/** Query vectors: top clusters by importance (plus one centroid query). */
export const REC_MAX_CLUSTER_QUERIES = 3;
/**
 * Nearest neighbours taken per (query vector, table) from the HNSW index. The
 * user's own titles are skipped inside the scan, but the TMDB vote floor runs
 * after the LIMIT and only ~15% of embedded movies pass 150 votes on prod data,
 * so 150 left ~25 survivors per query. Measured on the restored prod dump
 * (2026-10-10 spec §7): share of the exact top-160 retrieved = .37 at 150,
 * .59 at 400, .75 at 1000 (with ×2 over-fetch); ANN cost for 4 queries on
 * movies 30 / 70 / 164 ms. Recs are cached per taste version and computed on a
 * POST, so the 1000 ceiling (= max ef_search) is affordable. `annSearch` caps
 * series at 500 (annMaxK: the smaller table seq-scans above ~650).
 */
export const REC_ANN_PER_QUERY = 1000;
/** Candidates kept (best per-query distance) for exact re-ranking. */
export const REC_POOL = 160;
/**
 * In a centered space the raw HNSW order misses the per-title ‖x − μ‖ term, so
 * REC_POOL × this many ANN candidates are fetched and re-ranked exactly before
 * keeping REC_POOL (spec 2026-10-10 §6 — measured recall + cost).
 */
export const REC_POOL_OVERFETCH = 2;
/** Positive titles used as explanation anchors / calibration target. */
export const REC_MAX_ANCHORS = 100;

/** TMDB vote-count floors (series counts run ~half of movies on TMDB). */
export const REC_MIN_VOTES_MOVIE = 150;
export const REC_MIN_VOTES_SERIES = 75;

/** Relevance blend. */
export const REC_CENTROID_TERM = 0.25;
export const REC_NEGATIVE_PENALTY = 0.3;

/** Final score blend (sums to 1). */
export const REC_W_RELEVANCE = 0.72;
export const REC_W_QUALITY = 0.2;
export const REC_W_POPULARITY = 0.08;

/** Vote shrinkage for quality: (v·R + m·C)/(v + m). */
export const REC_QUALITY_PRIOR_VOTES = 250;
export const REC_QUALITY_PRIOR_MEAN = 6.6;

/** MMR trade-off (1 = pure relevance). */
export const REC_MMR_LAMBDA = 0.7;
/** Calibration weight on KL(p‖q̃) and Steck's smoothing α. */
export const REC_CALIBRATION_GAMMA = 0.15;
export const REC_CALIBRATION_ALPHA = 0.01;

/** Row sizes. */
export const REC_FOR_YOU_SIZE = 20;
export const REC_CLUSTER_ROW_SIZE = 12;
export const REC_CLUSTER_ROWS = 2;
export const REC_CLUSTER_ROW_MIN = 4;

/**
 * "Because you loved X" needs at least this cosine to the anchor. Same number,
 * new meaning in the centered space (2026-10-10 spec §7): raw title cosines
 * never fell below ~0.5 (p10 of recommended items' nearest anchor 0.51), so
 * the old threshold always passed; centered, 0.3 ≈ the p25 of nearest-anchor
 * cosines — the weakest-anchored quarter of picks get a facet label instead.
 */
export const REC_BECAUSE_MIN_COS = 0.3;

/** In-process cache. */
export const REC_CACHE_TTL_MS = 60 * 60 * 1000;
export const REC_CACHE_MAX = 500;
