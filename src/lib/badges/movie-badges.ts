import type { Movie, MovieListItem } from "@/types";
import type { MediaBadge, BadgeOptions } from "./types";
import { BADGE_THRESHOLDS } from "./constants";
import {
  getDaysDiff,
  isFutureDate,
  createBadge,
  sortAndLimitBadges,
  hasEnoughVotes,
} from "./utils";

/**
 * Get badges for a movie based on its data
 *
 * Badge logic considers:
 * - Recency (just released, new, coming soon, highly anticipated)
 * - Popularity (viral, trending, very popular)
 * - Quality (all time great, critically acclaimed, hidden gem, really bad)
 * - Box office (blockbuster, box office hit, indie)
 *
 * All badges except "coming-soon" and "highly-anticipated" require
 * a minimum vote count to avoid noise from obscure titles.
 */
export function getMovieBadges(movie: Movie | MovieListItem, options?: BadgeOptions): MediaBadge[] {
  const badges: MediaBadge[] = [];
  const maxBadges = options?.maxBadges ?? 2;

  const releaseDate = movie.release_date;
  const daysSinceRelease = getDaysDiff(releaseDate);
  const isUnreleased = isFutureDate(releaseDate);

  const voteCount = movie.vote_count ?? 0;
  const rating = movie.vote_average ?? 0;
  const popularity = movie.popularity ?? 0;

  // Helper to check if item qualifies for vote-dependent badges
  const meetsVoteThreshold = hasEnoughVotes(
    voteCount,
    BADGE_THRESHOLDS.BASE_VOTE_COUNT,
    isUnreleased
  );

  // ===== Recency badges (don't require votes) =====
  if (isUnreleased) {
    badges.push(createBadge("coming-soon"));

    // Highly anticipated - unreleased with high popularity
    if (popularity >= BADGE_THRESHOLDS.HIGHLY_ANTICIPATED_POPULARITY) {
      badges.push(createBadge("highly-anticipated"));
    }
  } else if (daysSinceRelease <= BADGE_THRESHOLDS.JUST_RELEASED_DAYS) {
    badges.push(createBadge("just-released"));
  } else if (daysSinceRelease <= BADGE_THRESHOLDS.NEW_RELEASE_DAYS) {
    badges.push(createBadge("new"));
  }

  // ===== Popularity badges (require votes) =====
  if (meetsVoteThreshold) {
    if (popularity >= BADGE_THRESHOLDS.VIRAL_POPULARITY) {
      badges.push(createBadge("viral"));
    } else if (popularity >= BADGE_THRESHOLDS.VERY_POPULAR_POPULARITY) {
      badges.push(createBadge("very-popular"));
    } else if (
      popularity >= BADGE_THRESHOLDS.TRENDING_POPULARITY &&
      daysSinceRelease <= BADGE_THRESHOLDS.TRENDING_RELEASE_DAYS
    ) {
      badges.push(createBadge("trending"));
    }
  }

  // ===== Quality badges (require votes) =====
  if (meetsVoteThreshold) {
    // All time great - high rating + lots of votes
    if (
      rating >= BADGE_THRESHOLDS.ALL_TIME_GREAT_RATING &&
      voteCount >= BADGE_THRESHOLDS.ALL_TIME_GREAT_VOTES
    ) {
      badges.push(createBadge("all-time-great"));
    }
    // Critically acclaimed - very high rating
    else if (
      rating >= BADGE_THRESHOLDS.CRITICALLY_ACCLAIMED_RATING &&
      voteCount >= BADGE_THRESHOLDS.CRITICALLY_ACCLAIMED_VOTES
    ) {
      badges.push(createBadge("critically-acclaimed"));
    }
    // Hidden gem - good rating but not widely known
    else if (
      rating >= BADGE_THRESHOLDS.HIDDEN_GEM_RATING &&
      voteCount >= BADGE_THRESHOLDS.HIDDEN_GEM_MIN_VOTES &&
      voteCount < BADGE_THRESHOLDS.HIDDEN_GEM_MAX_VOTES &&
      popularity < BADGE_THRESHOLDS.HIDDEN_GEM_MAX_POPULARITY
    ) {
      badges.push(createBadge("hidden-gem"));
    }

    // Really bad - very low rating with enough votes to be meaningful
    if (
      rating > 0 &&
      rating < BADGE_THRESHOLDS.REALLY_BAD_RATING &&
      voteCount >= BADGE_THRESHOLDS.REALLY_BAD_MIN_VOTES
    ) {
      badges.push(createBadge("really-bad"));
    }
  }

  // ===== Revenue badges (only for full Movie type with financial data) =====
  if ("revenue" in movie && "budget" in movie && meetsVoteThreshold) {
    const revenue = movie.revenue ?? 0;
    const budget = movie.budget ?? 0;

    if (revenue >= BADGE_THRESHOLDS.BLOCKBUSTER_REVENUE) {
      badges.push(createBadge("blockbuster"));
    } else if (revenue >= BADGE_THRESHOLDS.BOX_OFFICE_HIT_REVENUE) {
      badges.push(createBadge("box-office-hit"));
    }

    // Indie - low budget with good rating
    if (
      budget > 0 &&
      budget < BADGE_THRESHOLDS.INDIE_MAX_BUDGET &&
      rating >= BADGE_THRESHOLDS.INDIE_MIN_RATING
    ) {
      badges.push(createBadge("indie"));
    }
  }

  return sortAndLimitBadges(badges, maxBadges);
}
