/**
 * Media Badges System
 *
 * A unified badge system for movies and series that provides
 * contextual labels based on recency, popularity, quality, and status.
 *
 * Usage:
 * ```tsx
 * import { getMediaBadges, getMovieBadges, getSeriesBadges, getHoverCardBadges } from "@/lib/badges";
 *
 * // Universal getter (auto-detects movie vs series)
 * const badges = getMediaBadges(item, { maxBadges: 2 });
 *
 * // Type-specific getters
 * const movieBadges = getMovieBadges(movie, { maxBadges: 1 });
 * const seriesBadges = getSeriesBadges(series, { maxBadges: 2 });
 *
 * // For hover card data
 * const badges = getHoverCardBadges(data, isMovie, { maxBadges: 2 });
 * ```
 */

export * from "./types";
export * from "./constants";
export * from "./utils";
export { getMovieBadges } from "./movie-badges";
export { getSeriesBadges } from "./series-badges";

import type { MovieListItem, SeriesListItem, Movie, Series } from "@/types";
import type { MediaBadge, BadgeOptions } from "./types";
import { BADGE_THRESHOLDS } from "./constants";
import {
  getDaysDiff,
  isFutureDate,
  createBadge,
  sortAndLimitBadges,
  hasEnoughVotes,
} from "./utils";
import { getMovieBadges } from "./movie-badges";
import { getSeriesBadges } from "./series-badges";

type MediaItem = Movie | MovieListItem | Series | SeriesListItem;

/**
 * Type guard to check if item is a movie (has "title" property)
 */
function isMovie(item: MediaItem): item is Movie | MovieListItem {
  return "title" in item;
}

/**
 * Universal badge getter - automatically detects movie vs series
 *
 * @param item - Movie or Series (full or list item)
 * @param options - Badge options (maxBadges, context)
 * @returns Array of MediaBadge objects sorted by priority
 *
 * @example
 * ```tsx
 * // In a card component
 * const badges = getMediaBadges(item, { maxBadges: 1 });
 *
 * // In a detail page
 * const badges = getMediaBadges(movie, { maxBadges: 3, context: "detail" });
 * ```
 */
export function getMediaBadges(
  item: MediaItem,
  options?: BadgeOptions
): MediaBadge[] {
  if (isMovie(item)) {
    return getMovieBadges(item, options);
  }
  return getSeriesBadges(item, options);
}

/**
 * Minimal data shape for hover card badge computation
 */
interface HoverCardBadgeData {
  vote_average: number;
  vote_count: number;
  popularity: number;
  release_date?: string;
  status?: string;
  number_of_seasons?: number;
}

/**
 * Get badges for hover card data
 * Works with the minimal data available in HoverCardData
 *
 * @param data - HoverCardData object
 * @param isMovieMedia - Whether this is a movie (vs series)
 * @param options - Badge options
 */
export function getHoverCardBadges(
  data: HoverCardBadgeData,
  isMovieMedia: boolean,
  options?: BadgeOptions
): MediaBadge[] {
  const badges: MediaBadge[] = [];
  const maxBadges = options?.maxBadges ?? 2;

  const releaseDate = data.release_date;
  const daysSinceRelease = getDaysDiff(releaseDate);
  const isUnreleased = isFutureDate(releaseDate);

  const voteCount = data.vote_count ?? 0;
  const rating = data.vote_average ?? 0;
  const popularity = data.popularity ?? 0;

  const meetsVoteThreshold = hasEnoughVotes(
    voteCount,
    BADGE_THRESHOLDS.BASE_VOTE_COUNT,
    isUnreleased
  );

  // ===== Recency badges =====
  if (isUnreleased) {
    badges.push(createBadge("coming-soon"));
    if (popularity >= BADGE_THRESHOLDS.HIGHLY_ANTICIPATED_POPULARITY) {
      badges.push(createBadge("highly-anticipated"));
    }
  } else if (daysSinceRelease <= BADGE_THRESHOLDS.JUST_RELEASED_DAYS) {
    badges.push(createBadge("just-released"));
  } else if (daysSinceRelease <= BADGE_THRESHOLDS.NEW_RELEASE_DAYS) {
    badges.push(createBadge("new"));
  }

  // ===== Popularity badges =====
  if (meetsVoteThreshold) {
    if (popularity >= BADGE_THRESHOLDS.VIRAL_POPULARITY) {
      badges.push(createBadge("viral"));
    } else if (popularity >= BADGE_THRESHOLDS.VERY_POPULAR_POPULARITY) {
      badges.push(createBadge("very-popular"));
    } else if (popularity >= BADGE_THRESHOLDS.TRENDING_POPULARITY) {
      // For movies, require recent release for "trending"
      // For series, trending is based on popularity alone (ongoing shows have old first_air_date)
      const trendingEligible = isMovieMedia
        ? daysSinceRelease <= BADGE_THRESHOLDS.TRENDING_RELEASE_DAYS
        : true;
      if (trendingEligible) {
        badges.push(createBadge("trending"));
      }
    }
  }

  // ===== Quality badges =====
  if (meetsVoteThreshold) {
    if (
      rating >= BADGE_THRESHOLDS.ALL_TIME_GREAT_RATING &&
      voteCount >= BADGE_THRESHOLDS.ALL_TIME_GREAT_VOTES
    ) {
      badges.push(createBadge("all-time-great"));
    } else if (
      rating >= BADGE_THRESHOLDS.CRITICALLY_ACCLAIMED_RATING &&
      voteCount >= BADGE_THRESHOLDS.CRITICALLY_ACCLAIMED_VOTES
    ) {
      badges.push(createBadge("critically-acclaimed"));
    } else if (
      rating >= BADGE_THRESHOLDS.HIDDEN_GEM_RATING &&
      voteCount >= BADGE_THRESHOLDS.HIDDEN_GEM_MIN_VOTES &&
      voteCount < BADGE_THRESHOLDS.HIDDEN_GEM_MAX_VOTES &&
      popularity < BADGE_THRESHOLDS.HIDDEN_GEM_MAX_POPULARITY
    ) {
      badges.push(createBadge("hidden-gem"));
    }

    if (
      rating > 0 &&
      rating < BADGE_THRESHOLDS.REALLY_BAD_RATING &&
      voteCount >= BADGE_THRESHOLDS.REALLY_BAD_MIN_VOTES
    ) {
      badges.push(createBadge("really-bad"));
    }
  }

  // ===== Series-specific badges (limited data) =====
  if (!isMovieMedia && data.status && data.number_of_seasons) {
    // Mini series - single season + ended
    if (
      data.number_of_seasons === BADGE_THRESHOLDS.MINI_SERIES_MAX_SEASONS &&
      data.status === "Ended"
    ) {
      badges.push(createBadge("mini-series"));
    }

    // Currently airing - only if we don't already have a popularity badge
    // (trending/popular/viral already implies the show is active and popular)
    const hasPopularityBadge = badges.some(
      (b) => b.type === "trending" || b.type === "very-popular" || b.type === "viral"
    );
    if (data.status === "Returning Series" && !hasPopularityBadge) {
      badges.push(createBadge("currently-airing"));
    }
  }

  return sortAndLimitBadges(badges, maxBadges);
}

