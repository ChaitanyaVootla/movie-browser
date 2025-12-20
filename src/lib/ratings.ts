/**
 * Ratings Utilities
 *
 * Combines and normalizes ratings from multiple sources:
 * - TMDB (from API)
 * - IMDb, Rotten Tomatoes, Google (from MongoDB via lambda scrapers)
 */

export interface ProcessedRating {
  source: "tmdb" | "imdb" | "rt_critic" | "rt_audience" | "google" | "metacritic";
  score: number; // Normalized 0-100
  label: string;
  link?: string;
  ratingCount?: number;
  certified?: boolean;
  sentiment?: "POSITIVE" | "NEGATIVE";
}

interface LegacyRating {
  rating: string;
  name: string;
  link: string;
}

interface DetailedImdbData {
  rating: number | null;
  ratingCount: number | null;
  sourceUrl?: string;
}

interface DetailedRtScoreData {
  score: number | null;
  ratingCount: number | null;
  certified: boolean | null;
  sentiment: string | null;
}

interface DetailedRatings {
  imdb?: DetailedImdbData;
  rottenTomatoes?: {
    critic?: DetailedRtScoreData;
    audience?: DetailedRtScoreData;
    sourceUrl?: string;
  };
}

interface ExternalData {
  ratings?: DetailedRatings;
  externalIds?: Record<string, string>;
}

interface GoogleData {
  ratings?: LegacyRating[];
  imdbId?: string;
}

/**
 * Normalize rating to 0-100 scale based on source
 */
function normalizeRating(rating: number, source: string): number {
  const sourceLower = source.toLowerCase();

  // IMDb and TMDB are 0-10 scale
  if (sourceLower.includes("imdb") || sourceLower.includes("tmdb")) {
    return Math.round(rating * 10);
  }

  // Everything else is already 0-100
  return Math.round(rating);
}

/**
 * Combine ratings from multiple sources into a unified format
 */
export function combineRatings(
  googleData?: GoogleData,
  externalData?: ExternalData,
  tmdbRating?: number,
  tmdbVoteCount?: number,
  itemId?: number,
  mediaType?: "movie" | "tv"
): ProcessedRating[] {
  const ratings: ProcessedRating[] = [];
  const addedSources = new Set<string>();

  // 1. TMDB rating (always first, highest priority)
  if (tmdbRating && tmdbRating > 0 && itemId && mediaType) {
    const normalizedScore = normalizeRating(tmdbRating, "tmdb");
    ratings.push({
      source: "tmdb",
      score: normalizedScore,
      label: "TMDB",
      link: `https://www.themoviedb.org/${mediaType}/${itemId}`,
      ratingCount: tmdbVoteCount,
    });
    addedSources.add("tmdb");
  }

  // 2. IMDb from detailed external_data (preferred)
  if (externalData?.ratings?.imdb?.rating != null) {
    const imdb = externalData.ratings.imdb;
    ratings.push({
      source: "imdb",
      score: normalizeRating(imdb.rating!, "imdb"),
      label: "IMDb",
      link: imdb.sourceUrl,
      ratingCount: imdb.ratingCount ?? undefined,
    });
    addedSources.add("imdb");
  }

  // 3. Rotten Tomatoes Critic from external_data
  if (externalData?.ratings?.rottenTomatoes?.critic?.score != null) {
    const critic = externalData.ratings.rottenTomatoes.critic;
    ratings.push({
      source: "rt_critic",
      score: normalizeRating(critic.score!, "rotten"),
      label: "Rotten Tomatoes",
      link: externalData.ratings.rottenTomatoes.sourceUrl,
      ratingCount: critic.ratingCount ?? undefined,
      certified: critic.certified ?? undefined,
      sentiment: critic.sentiment as "POSITIVE" | "NEGATIVE" | undefined,
    });
    addedSources.add("rt_critic");
  }

  // 4. Rotten Tomatoes Audience from external_data
  if (externalData?.ratings?.rottenTomatoes?.audience?.score != null) {
    const audience = externalData.ratings.rottenTomatoes.audience;
    ratings.push({
      source: "rt_audience",
      score: normalizeRating(audience.score!, "rotten"),
      label: "Audience Score",
      link: externalData.ratings.rottenTomatoes.sourceUrl,
      ratingCount: audience.ratingCount ?? undefined,
      certified: audience.certified ?? undefined,
      sentiment: audience.sentiment as "POSITIVE" | "NEGATIVE" | undefined,
    });
    addedSources.add("rt_audience");
  }

  // 5. Fall back to googleData for any missing sources
  if (googleData?.ratings) {
    for (const rating of googleData.ratings) {
      const name = rating.name.toLowerCase();
      const ratingStr = rating.rating.replace("%", "");
      const ratingNum = parseFloat(ratingStr);

      if (isNaN(ratingNum)) continue;

      // IMDb from googleData (if not already added)
      if (name.includes("imdb") && !addedSources.has("imdb")) {
        ratings.push({
          source: "imdb",
          score: normalizeRating(ratingNum, "imdb"),
          label: "IMDb",
          link: rating.link,
        });
        addedSources.add("imdb");
        continue;
      }

      // RT from googleData (if not already added)
      if (name.includes("rotten") && !name.includes("audience") && !addedSources.has("rt_critic")) {
        ratings.push({
          source: "rt_critic",
          score: normalizeRating(ratingNum, "rotten"),
          label: "Rotten Tomatoes",
          link: rating.link,
        });
        addedSources.add("rt_critic");
        continue;
      }

      // Google Users
      if (name.includes("google") && !addedSources.has("google")) {
        ratings.push({
          source: "google",
          score: normalizeRating(ratingNum, "google"),
          label: "Google",
          link: rating.link,
        });
        addedSources.add("google");
        continue;
      }
    }
  }

  return ratings;
}

/**
 * Get color for rating score (0-100 scale)
 * Returns muted HSL color from red (low) to green (high)
 */
export function getRatingColor(score: number): string {
  const cutoff = 30;
  const safeValue = Math.max(cutoff, Math.min(100, score));
  const scaledValue = safeValue - cutoff;
  const hue = (120 * scaledValue) / 70; // 0 = red, 120 = green
  // Muted palette: lower saturation (50%) and moderate lightness (55%)
  return `hsl(${hue}, 50%, 55%)`;
}

/**
 * Get rating icon path based on source and attributes
 */
export function getRatingIcon(rating: ProcessedRating): string {
  switch (rating.source) {
    case "tmdb":
      return "/images/rating/tmdb.svg";
    case "imdb":
      return "/images/rating/imdb.svg";
    case "google":
      return "/images/rating/google.svg";
    case "rt_critic":
      if (rating.certified) return "/images/rating/rt_critic_certified.svg";
      if (rating.sentiment === "NEGATIVE") return "/images/rating/rt_critic_negative.svg";
      return "/images/rating/rt_critic.svg";
    case "rt_audience":
      if (rating.certified) return "/images/rating/rt_audience_certified.svg";
      if (rating.sentiment === "NEGATIVE") return "/images/rating/rt_audience_negative.svg";
      return "/images/rating/rt_audience.svg";
    case "metacritic":
      return "/images/rating/metacritic.svg";
    default:
      return "/images/rating/tmdb.svg";
  }
}

/**
 * Get descriptive rating tier
 */
export function getRatingTier(score: number): "great" | "good" | "mixed" | "poor" {
  if (score >= 75) return "great";
  if (score >= 60) return "good";
  if (score >= 40) return "mixed";
  return "poor";
}

