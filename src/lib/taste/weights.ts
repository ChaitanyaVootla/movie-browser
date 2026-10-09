/**
 * Signal → weight folding (spec §4) and scope filtering (spec §5). Pure.
 */
import {
  DECAY_TAU_DAYS,
  DEFAULT_MEAN_SCORE,
  MIN_SCORES_FOR_MEAN,
  SCORE_CLIP,
  TITLE_CAP,
  W_FAVORITE,
  W_LIKED,
  W_REWATCH_CAP,
  W_REWATCH_STEP,
  W_SERIES_DROPPED,
  W_SERIES_FINISHED,
  W_THUMB,
  W_ENGAGED,
  W_WATCHLIST,
} from "./constants";
import type { TasteScope, TitleSignals, WeightedTitle } from "./types";

const DAY_MS = 86_400_000;

/** exp(-Δt/τ); future or missing timestamps do not decay (factor 1). */
export function decayFactor(at: Date | null, now: Date, tauDays = DECAY_TAU_DAYS): number {
  if (!at) return 1;
  const days = (now.getTime() - at.getTime()) / DAY_MS;
  if (!(days > 0)) return 1;
  return Math.exp(-days / tauDays);
}

export function clip(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * True when the user's entries on the title are ALL private — over every entry
 * kind (WATCH and NOTE diary entries, reviews), not just WATCH events. A private
 * entry logged with a score (a private watch, a private NOTE, a private review)
 * also upserts the canonical rating, so in the PUBLIC scope that rating (and any
 * progress status) must be treated as private too. Falls back to the WATCH
 * counts when the uncapped entry visibility is unknown.
 */
export function isPrivateOnly(s: TitleSignals): boolean {
  if (s.entries) return s.entries.hasPrivate && !s.entries.hasPublic;
  return s.watches.count.all > 0 && s.watches.count.public === 0;
}

/**
 * Could the canonical rating have come from a private entry? True when the
 * title is private-only, or when a private entry carried a score (private
 * scored watch/NOTE, private review) and no public entry did. Conservative:
 * a later public quick-rate on such a title is also withheld.
 */
export function isRatingPrivate(s: TitleSignals): boolean {
  if (isPrivateOnly(s)) return true;
  return s.entries ? s.entries.privateScored && !s.entries.publicScored : false;
}

/** Ratings visible to a scope (public excludes ratings that may come from private entries). */
function scopedRating(s: TitleSignals, scope: TasteScope): TitleSignals["rating"] {
  if (!s.rating) return null;
  if (scope === "public" && isRatingPrivate(s)) return null;
  return s.rating;
}

/** User mean over title-level scores in scope; DEFAULT_MEAN_SCORE under MIN_SCORES_FOR_MEAN. */
export function userMeanScore(signals: readonly TitleSignals[], scope: TasteScope): number {
  const scores: number[] = [];
  for (const s of signals) {
    const r = scopedRating(s, scope);
    if (r?.score != null) scores.push(r.score);
  }
  if (scores.length < MIN_SCORES_FOR_MEAN) return DEFAULT_MEAN_SCORE;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** Fold one title's signals into a weight for the given scope. */
export function titleWeight(
  s: TitleSignals,
  scope: TasteScope,
  ctx: { now: Date; meanScore: number }
): WeightedTitle {
  const { now, meanScore } = ctx;
  const isPublic = scope === "public";
  const rating = scopedRating(s, scope);
  const watchCount = isPublic ? s.watches.count.public : s.watches.count.all;
  const maxCycle = isPublic ? s.watches.maxCycle.public : s.watches.maxCycle.all;
  const lastWatch = isPublic ? s.watches.lastAt.public : s.watches.lastAt.all;

  let w = 0;
  if (s.isFavorite) w += W_FAVORITE;
  if (rating?.liked) w += W_LIKED;

  const hasScore = rating?.score != null;
  const hasThumb = !hasScore && rating?.thumb != null && rating.thumb !== 0;
  if (rating && hasScore) {
    const term = clip(((rating.score as number) - meanScore) / 2, -SCORE_CLIP, SCORE_CLIP);
    w += term * decayFactor(rating.ratedAt, now);
  } else if (rating && hasThumb) {
    w += Math.sign(rating.thumb as number) * W_THUMB * decayFactor(rating.ratedAt, now);
  }

  // Base engagement: choosing + finishing (or rating) a title is weak positive
  // evidence on its own. Without it, a consistently high rater's at-mean 9s
  // would all fold to ~0 or negative and the profile would collapse.
  const engaged = watchCount > 0 || hasScore || hasThumb;
  if (engaged) {
    const at = watchCount > 0 ? lastWatch : (rating?.ratedAt ?? null);
    w += W_ENGAGED * decayFactor(at, now);
  }
  if (watchCount > 0) {
    const extra = s.mediaType === "movie" ? watchCount - 1 : maxCycle - 1;
    if (extra > 0) w += Math.min(W_REWATCH_CAP, W_REWATCH_STEP * extra) * decayFactor(lastWatch, now);
  }

  if (s.progress && !(isPublic && isPrivateOnly(s))) {
    const d = decayFactor(s.progress.updatedAt, now);
    const finished = s.progress.status === "COMPLETED" || s.progress.status === "CAUGHT_UP";
    // Public scope credits a finish only when it is publicly evidenced: public
    // WATCH events and no private ones (otherwise the finish may rest on
    // private viewing).
    const finishIsPublic = s.watches.count.public > 0 && s.watches.count.all === s.watches.count.public;
    if (finished && (!isPublic || finishIsPublic)) {
      w += W_SERIES_FINISHED * d;
    } else if (s.progress.status === "DROPPED") {
      w += W_SERIES_DROPPED * d;
    }
  }

  // Watchlist is aspirational and PRIVATE: never part of the public projection.
  if (!isPublic && s.watchlistedAt) w += W_WATCHLIST;

  return {
    key: s.key,
    mediaType: s.mediaType,
    id: s.id,
    weight: Math.round(w * 1e6) / 1e6,
    watched: watchCount > 0,
    score: rating?.score ?? null,
  };
}

/**
 * Weight every title for a scope, drop zero-weight titles that carry no
 * scoped evidence, and keep the TITLE_CAP titles with the largest |weight|.
 */
export function foldSignals(
  signals: readonly TitleSignals[],
  scope: TasteScope,
  now: Date,
  cap = TITLE_CAP
): { titles: WeightedTitle[]; meanScore: number } {
  const meanScore = userMeanScore(signals, scope);
  const titles = signals
    .map((s) => titleWeight(s, scope, { now, meanScore }))
    .filter((t) => t.weight !== 0 || t.watched || t.score !== null)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.key.localeCompare(b.key))
    .slice(0, cap);
  return { titles, meanScore };
}
