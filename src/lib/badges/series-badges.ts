import type { Series, SeriesListItem, Keyword } from "@/types";
import type { MediaBadge, BadgeOptions } from "./types";
import { BADGE_THRESHOLDS, MINI_SERIES_KEYWORD_IDS } from "./constants";
import {
  getDaysDiff,
  isFutureDate,
  createBadge,
  sortAndLimitBadges,
  hasEnoughVotes,
  hasKeyword,
} from "./utils";

/**
 * Check if series has the mini-series keyword
 */
function hasMiniSeriesKeyword(series: Series): boolean {
  const keywords = series.keywords?.results;
  if (!keywords || keywords.length === 0) return false;

  const keywordIds = keywords.map((k: Keyword) => k.id);
  return hasKeyword(keywordIds, MINI_SERIES_KEYWORD_IDS);
}

/**
 * Get badges for a series based on its data
 *
 * Badge logic considers:
 * - Episode status (new episode, new season, finale, returning soon)
 * - Series status (currently airing, mini series)
 * - Popularity (viral, trending, very popular)
 * - Quality (all time great, critically acclaimed, hidden gem, really bad)
 *
 * All quality/popularity badges require minimum vote count.
 * Episode-related badges work even with low votes (they're time-sensitive).
 */
export function getSeriesBadges(
  series: Series | SeriesListItem,
  options?: BadgeOptions
): MediaBadge[] {
  const badges: MediaBadge[] = [];
  const maxBadges = options?.maxBadges ?? 2;

  const voteCount = series.vote_count ?? 0;
  const rating = series.vote_average ?? 0;
  const popularity = series.popularity ?? 0;

  // Check if this is a full Series object with detailed data
  const isFullSeries = "status" in series && "seasons" in series;

  // For list items, use first_air_date for recency
  const firstAirDate = series.first_air_date;
  const daysSinceFirstAir = getDaysDiff(firstAirDate);
  const isUnreleased = isFutureDate(firstAirDate);

  // Helper to check if item qualifies for vote-dependent badges
  const meetsVoteThreshold = hasEnoughVotes(
    voteCount,
    BADGE_THRESHOLDS.BASE_VOTE_COUNT,
    isUnreleased
  );

  // ===== Unreleased series =====
  if (isUnreleased) {
    badges.push(createBadge("coming-soon"));

    if (popularity >= BADGE_THRESHOLDS.HIGHLY_ANTICIPATED_POPULARITY) {
      badges.push(createBadge("highly-anticipated"));
    }
  }

  // ===== Full series with episode data =====
  if (isFullSeries) {
    const full = series as Series;

    const nextEp = full.next_episode_to_air;
    const lastEp = full.last_episode_to_air;

    // Returning soon - has next episode scheduled
    if (nextEp?.air_date && isFutureDate(nextEp.air_date)) {
      badges.push(createBadge("returning-soon"));
    }

    // New episode aired recently
    if (lastEp?.air_date) {
      const daysSinceLastEp = getDaysDiff(lastEp.air_date);
      if (daysSinceLastEp >= 0 && daysSinceLastEp <= BADGE_THRESHOLDS.NEW_EPISODE_DAYS) {
        badges.push(createBadge("new-episode"));
      }
    }

    // Season/series finale detection
    if (lastEp && full.seasons) {
      const currentSeason = full.seasons.find(
        (s) => s.season_number === lastEp.season_number
      );
      if (currentSeason && currentSeason.episode_count > 0) {
        const isLastEpisodeOfSeason =
          lastEp.episode_number === currentSeason.episode_count;
        const daysSinceFinale = getDaysDiff(lastEp.air_date);
        const isRecentFinale = daysSinceFinale >= 0 && daysSinceFinale <= 14;

        if (isLastEpisodeOfSeason && isRecentFinale) {
          if (full.status === "Ended" || full.status === "Canceled") {
            badges.push(createBadge("series-finale"));
          } else {
            badges.push(createBadge("season-finale"));
          }
        }
      }
    }

    // New season badge
    if (full.seasons && full.seasons.length > 0) {
      const realSeasons = full.seasons.filter((s) => s.season_number > 0);
      if (realSeasons.length > 0) {
        const latestSeason = realSeasons.sort(
          (a, b) => b.season_number - a.season_number
        )[0];

        if (latestSeason?.air_date) {
          const daysSinceSeasonStart = getDaysDiff(latestSeason.air_date);
          if (
            daysSinceSeasonStart >= 0 &&
            daysSinceSeasonStart <= BADGE_THRESHOLDS.NEW_SEASON_DAYS
          ) {
            badges.push(createBadge("new-season"));
          }
        }
      }
    }

    // Mini series - single season + ended (or has keyword)
    const isSingleSeason = full.number_of_seasons === BADGE_THRESHOLDS.MINI_SERIES_MAX_SEASONS;
    const isEnded = full.status === "Ended";
    const hasKeywordMatch = hasMiniSeriesKeyword(full);

    if ((isSingleSeason && isEnded) || hasKeywordMatch) {
      badges.push(createBadge("mini-series"));
    }
  } else {
    // For list items without full data, just check first air date
    if (
      !isUnreleased &&
      daysSinceFirstAir >= 0 &&
      daysSinceFirstAir <= BADGE_THRESHOLDS.NEW_RELEASE_DAYS
    ) {
      badges.push(createBadge("new"));
    }
  }

  // ===== Popularity badges (require votes) =====
  if (meetsVoteThreshold) {
    if (popularity >= BADGE_THRESHOLDS.VIRAL_POPULARITY) {
      badges.push(createBadge("viral"));
    } else if (popularity >= BADGE_THRESHOLDS.VERY_POPULAR_POPULARITY) {
      badges.push(createBadge("very-popular"));
    } else if (popularity >= BADGE_THRESHOLDS.TRENDING_POPULARITY) {
      badges.push(createBadge("trending"));
    }
  }

  // ===== Currently airing (add after popularity check) =====
  // Only add if no popularity badge and no new-episode badge
  // (trending/popular/viral already implies the show is active)
  if (isFullSeries) {
    const full = series as Series;
    const hasPopularityBadge = badges.some(
      (b) => b.type === "trending" || b.type === "very-popular" || b.type === "viral"
    );
    const hasNewEpisodeBadge = badges.some((b) => b.type === "new-episode");

    if (
      full.status === "Returning Series" &&
      full.in_production &&
      !hasPopularityBadge &&
      !hasNewEpisodeBadge
    ) {
      badges.push(createBadge("currently-airing"));
    }
  }

  // ===== Quality badges (require votes) =====
  if (meetsVoteThreshold) {
    // All time great
    if (
      rating >= BADGE_THRESHOLDS.ALL_TIME_GREAT_RATING &&
      voteCount >= BADGE_THRESHOLDS.ALL_TIME_GREAT_VOTES
    ) {
      badges.push(createBadge("all-time-great"));
    }
    // Critically acclaimed
    else if (
      rating >= BADGE_THRESHOLDS.CRITICALLY_ACCLAIMED_RATING &&
      voteCount >= BADGE_THRESHOLDS.CRITICALLY_ACCLAIMED_VOTES
    ) {
      badges.push(createBadge("critically-acclaimed"));
    }
    // Hidden gem
    else if (
      rating >= BADGE_THRESHOLDS.HIDDEN_GEM_RATING &&
      voteCount >= BADGE_THRESHOLDS.HIDDEN_GEM_MIN_VOTES &&
      voteCount < BADGE_THRESHOLDS.HIDDEN_GEM_MAX_VOTES &&
      popularity < BADGE_THRESHOLDS.HIDDEN_GEM_MAX_POPULARITY
    ) {
      badges.push(createBadge("hidden-gem"));
    }

    // Really bad
    if (
      rating > 0 &&
      rating < BADGE_THRESHOLDS.REALLY_BAD_RATING &&
      voteCount >= BADGE_THRESHOLDS.REALLY_BAD_MIN_VOTES
    ) {
      badges.push(createBadge("really-bad"));
    }
  }

  return sortAndLimitBadges(badges, maxBadges);
}

