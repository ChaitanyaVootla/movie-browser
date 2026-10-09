/**
 * Recommendation tuning constants (spec
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §3).
 * Bump REC_ALGO_VERSION on any change: it is part of the in-process cache key.
 */
export const REC_ALGO_VERSION = 1;

/** Query vectors: top clusters by importance (plus one centroid query). */
export const REC_MAX_CLUSTER_QUERIES = 3;
/** Nearest neighbours taken per (query vector, table) from the HNSW index. */
export const REC_ANN_PER_QUERY = 150;
/** Candidates kept (best per-query distance) for exact re-ranking. */
export const REC_POOL = 160;
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

/** "Because you loved X" needs at least this cosine to the anchor. */
export const REC_BECAUSE_MIN_COS = 0.3;

/** In-process cache. */
export const REC_CACHE_TTL_MS = 60 * 60 * 1000;
export const REC_CACHE_MAX = 500;
