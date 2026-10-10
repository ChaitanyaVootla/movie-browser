/**
 * Taste-profile tuning constants — the single source of truth (spec
 * docs/superpowers/specs/2026-10-09-taste-profile-design.md §14).
 *
 * Bump TASTE_ALGO_VERSION whenever a weight/threshold/formula changes: stored
 * profiles with a different version are recomputed on their next read, so no
 * migration or backfill is needed.
 */
export const TASTE_ALGO_VERSION = 3; // v3: vectors in the mean-centered embedding space (2026-10-10 spec); v2: privacy over all entry kinds, uncapped privacy, public-finish rule, adult filter

/** Signal weights (spec §4). */
export const W_FAVORITE = 3;
export const W_LIKED = 2;
export const W_THUMB = 1.5;
/** Base engagement for any watched OR rated title (a score at the user mean ≈ an unrated watch). */
export const W_ENGAGED = 0.5;
export const W_REWATCH_STEP = 0.5;
export const W_REWATCH_CAP = 1.5;
export const W_SERIES_FINISHED = 0.75;
export const W_SERIES_DROPPED = -1;
export const W_WATCHLIST = 0.3;
export const SCORE_CLIP = 2;
/** Neutral 1-10 mean used until a user has MIN_SCORES_FOR_MEAN scores. */
export const DEFAULT_MEAN_SCORE = 5.5;
export const MIN_SCORES_FOR_MEAN = 5;

/** Time decay exp(-Δt/τ), τ = 18 months. */
export const DECAY_TAU_DAYS = 547.5;

/** Rocchio negative weight. */
export const ROCCHIO_BETA = 0.3;

/** Thresholds. */
export const MIN_POSITIVES_FOR_CENTROID = 3;
export const MIN_PUBLIC_POSITIVES_FOR_DISPLAY = 10;
export const FACET_MIN_SUPPORT = 2;
export const FACET_PRIOR_M = 3;
export const PEOPLE_PRIOR_M = 2;
export const FACET_TOP_K = 8;
export const PEOPLE_TOP_K = 6;
export const MOODS_TOP_K = 10;
export const FACET_SUPPORT_TITLES = 6;

/** Clustering bounds (the O(n²) step stays at ~20k pairs). */
export const CLUSTER_MAX_INPUT = 200;
export const CLUSTER_MIN_INPUT = 8;
export const MAX_CLUSTERS = 4;
export const MIN_SILHOUETTE = 0.02;

/** Axis minimum support. */
export const AXIS_MIN_POPULARITY = 5;
export const AXIS_MIN_YEAR = 5;
export const AXIS_MIN_GENRES = 8;
export const AXIS_MIN_RATED = 5;
export const AXIS_MIN_MOOD = 5;
/** Genre universe size used to normalise entropy (TMDB has 19 movie genres). */
export const GENRE_UNIVERSE = 19;

/** Input bounds. */
export const SOURCE_ROW_CAP = 500;
export const TITLE_CAP = 600;

/** Snapshot TTL (recompute when older, exactly like user_stats). */
export const TASTE_TTL_MS = 24 * 60 * 60 * 1000;

/** Baseline population: non-adult titles with at least this many TMDB votes. */
export const BASELINE_MIN_VOTES = 100;
/**
 * Minimum embedded titles for a catalog mean μ (spec 2026-10-10 §2); below it
 * (dev DBs) the embedding space stays raw.
 */
export const SPACE_MIN_TITLES = 500;
/**
 * Diagonal whitening on top of centering. OFF: on the restored prod data
 * (136 leave-one-out trials, 2026-10-10 spec §7) whitening was within noise of
 * plain centering (hit@10 .184 vs .162, nDCG@10 .083 vs .083) and adds a
 * second estimated statistic that amplifies low-variance dimensions. σ is
 * still stored nightly so this can be re-evaluated without a migration.
 */
export const TASTE_SPACE_WHITEN = false;
/** Below this many titles the baseline falls back to the whole non-adult catalog (dev DBs). */
export const BASELINE_MIN_SIZE = 1000;
