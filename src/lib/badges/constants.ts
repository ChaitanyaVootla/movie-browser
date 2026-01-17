import type { BadgeType, MediaBadge } from "./types";

/**
 * Thresholds for badge calculations
 *
 * BASE_VOTE_COUNT: Minimum votes required for quality/popularity badges
 * This prevents obscure items with extreme ratings from getting badges
 * Exception: Unreleased items can get "coming-soon" and "highly-anticipated"
 */
export const BADGE_THRESHOLDS = {
  // Base filter - minimum votes for most badges
  BASE_VOTE_COUNT: 100,

  // Recency (in days)
  JUST_RELEASED_DAYS: 7,
  NEW_RELEASE_DAYS: 30,
  NEW_SEASON_DAYS: 30,
  NEW_EPISODE_DAYS: 7,

  // Popularity
  TRENDING_POPULARITY: 100,
  TRENDING_RELEASE_DAYS: 90,
  VERY_POPULAR_POPULARITY: 300,
  VIRAL_POPULARITY: 1000,
  HIGHLY_ANTICIPATED_POPULARITY: 50, // For unreleased items

  // Quality ratings
  ALL_TIME_GREAT_RATING: 8.0,
  ALL_TIME_GREAT_VOTES: 10000,
  CRITICALLY_ACCLAIMED_RATING: 8.5,
  CRITICALLY_ACCLAIMED_VOTES: 5000,
  HIDDEN_GEM_RATING: 7.5,
  HIDDEN_GEM_MAX_VOTES: 5000,
  HIDDEN_GEM_MIN_VOTES: 500, // Must have some votes to be considered
  HIDDEN_GEM_MAX_POPULARITY: 50,
  REALLY_BAD_RATING: 4.0,
  REALLY_BAD_MIN_VOTES: 1000,

  // Revenue (USD)
  BLOCKBUSTER_REVENUE: 500_000_000,
  BOX_OFFICE_HIT_REVENUE: 100_000_000,
  INDIE_MAX_BUDGET: 10_000_000,
  INDIE_MIN_RATING: 7.0,

  // Mini series
  MINI_SERIES_MAX_SEASONS: 1,
} as const;

/**
 * TMDB keyword ID for "mini series" / "miniseries"
 * Used in addition to season count check for mini-series badge
 */
export const MINI_SERIES_KEYWORD_IDS = [
  180547, // "mini series"
  188365, // "miniseries"
] as const;

/**
 * Badge definitions with styling
 * Higher opacity bg (70%) for visibility on poster cards
 */
export const BADGE_DEFINITIONS: Record<BadgeType, Omit<MediaBadge, "type">> = {
  // ===== Recency badges =====
  "just-released": {
    label: "Just Released",
    shortLabel: "New",
    className: "bg-emerald-600/70 text-emerald-50",
    icon: "Sparkles",
    priority: 0,
    description: "Released within the last week",
  },
  new: {
    label: "New Release",
    shortLabel: "New",
    className: "bg-emerald-600/70 text-emerald-50",
    priority: 1,
    description: "Released within the last 30 days",
  },
  "coming-soon": {
    label: "Coming Soon",
    shortLabel: "Soon",
    className: "bg-blue-600/70 text-blue-50",
    icon: "Calendar",
    priority: 2,
    description: "Not yet released",
  },
  "highly-anticipated": {
    label: "Highly Anticipated",
    shortLabel: "Anticipated",
    className: "bg-amber-600/70 text-amber-50",
    icon: "Star",
    priority: 1,
    description: "Upcoming release with high interest",
  },

  // ===== Popularity badges =====
  viral: {
    label: "Viral",
    className: "bg-pink-600/70 text-pink-50",
    icon: "Zap",
    priority: 2,
    description: "Extremely high popularity right now",
  },
  trending: {
    label: "Trending",
    className: "bg-orange-600/70 text-orange-50",
    icon: "TrendingUp",
    priority: 3,
    description: "Currently popular",
  },
  "very-popular": {
    label: "Very Popular",
    shortLabel: "Popular",
    className: "bg-purple-600/70 text-purple-50",
    icon: "Flame",
    priority: 4,
    description: "High popularity score",
  },

  // ===== Quality badges =====
  "all-time-great": {
    label: "All Time Great",
    shortLabel: "Classic",
    className: "bg-amber-600/70 text-amber-50",
    icon: "Trophy",
    priority: 5,
    description: "Highly rated with many votes - a true classic",
  },
  "critically-acclaimed": {
    label: "Critically Acclaimed",
    shortLabel: "Acclaimed",
    className: "bg-yellow-600/70 text-yellow-50",
    icon: "Award",
    priority: 6,
    description: "Exceptional ratings from critics and audiences",
  },
  "hidden-gem": {
    label: "Hidden Gem",
    shortLabel: "Gem",
    className: "bg-violet-600/70 text-violet-50",
    icon: "Gem",
    priority: 7,
    description: "Great rating but not widely known",
  },
  "really-bad": {
    label: "Poorly Rated",
    shortLabel: "Avoid",
    className: "bg-red-600/70 text-red-50",
    icon: "ThumbsDown",
    priority: 99,
    description: "Very low ratings - proceed with caution",
  },

  // ===== Series-specific badges =====
  "new-episode": {
    label: "New Episode",
    shortLabel: "New Ep",
    className: "bg-emerald-600/70 text-emerald-50",
    icon: "Play",
    priority: 0,
    description: "New episode aired recently",
  },
  "new-season": {
    label: "New Season",
    className: "bg-emerald-600/70 text-emerald-50",
    icon: "Plus",
    priority: 1,
    description: "New season recently started",
  },
  "series-finale": {
    label: "Series Finale",
    className: "bg-blue-600/70 text-blue-50",
    icon: "CircleCheck",
    priority: 2,
    description: "The series has concluded",
  },
  "season-finale": {
    label: "Season Finale",
    shortLabel: "Finale",
    className: "bg-yellow-600/70 text-yellow-50",
    icon: "Flag",
    priority: 3,
    description: "Season finale aired recently",
  },
  "returning-soon": {
    label: "Returning Soon",
    className: "bg-sky-600/70 text-sky-50",
    icon: "CalendarClock",
    priority: 4,
    description: "Next episode scheduled",
  },
  "currently-airing": {
    label: "Currently Airing",
    shortLabel: "Airing",
    className: "bg-green-600/70 text-green-50",
    icon: "Radio",
    priority: 5,
    description: "New episodes airing now",
  },
  "mini-series": {
    label: "Mini Series",
    shortLabel: "Mini",
    className: "bg-indigo-600/70 text-indigo-50",
    priority: 8,
    description: "Limited/mini series - complete story in one season",
  },

  // ===== Movie-specific badges =====
  blockbuster: {
    label: "Blockbuster",
    className: "bg-amber-600/70 text-amber-50",
    icon: "DollarSign",
    priority: 6,
    description: "Massive box office success",
  },
  "box-office-hit": {
    label: "Box Office Hit",
    shortLabel: "Hit",
    className: "bg-yellow-600/70 text-yellow-50",
    priority: 7,
    description: "Strong box office performance",
  },
  indie: {
    label: "Indie",
    className: "bg-teal-600/70 text-teal-50",
    icon: "Clapperboard",
    priority: 8,
    description: "Independent film with great reviews",
  },

  // ===== User status badges (bottom-right) =====
  watchlist: {
    label: "Watchlist",
    shortLabel: "Saved",
    className: "bg-neutral-800/80 text-neutral-200",
    priority: 100, // User badges have lowest priority (shown separately)
    description: "In your watchlist",
  },
  watched: {
    label: "Watched",
    className: "bg-neutral-800/80 text-neutral-200",
    priority: 100,
    description: "You have watched this",
  },
};
