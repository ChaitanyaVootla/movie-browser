/**
 * Data Freshness Logic
 *
 * Determines when movie/series data should be refreshed based on release date.
 * Newer content changes more frequently (ratings accumulating), older content is stable.
 *
 * Thresholds from docs/DATA_ENRICHMENT_PLAN.md:
 * - < 14 days old: refresh daily (ratings change rapidly at release)
 * - 14-30 days: every 4 days (still accumulating reviews)
 * - 30-90 days: weekly (stabilizing)
 * - > 90 days: monthly (mature content, minimal change)
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const FRESHNESS_THRESHOLDS = {
  /** Content < 14 days old: refresh daily */
  VERY_NEW: 1 * DAY_MS,
  /** Content 14-30 days old: refresh every 4 days */
  NEW: 4 * DAY_MS,
  /** Content 30-90 days old: refresh weekly */
  RECENT: 7 * DAY_MS,
  /** Content > 90 days old: refresh monthly */
  MATURE: 30 * DAY_MS,
  /**
   * Content > 3 years old: refresh quarterly. Ratings on mature titles barely
   * move, and the catalog + crawler traffic skew heavily old — this tier cuts
   * the crawler-driven Lambda scrape volume by ~50-65% (June 2026 analysis)
   * at negligible staleness cost.
   */
  VERY_MATURE: 90 * DAY_MS,
} as const;

/**
 * Get the refresh threshold based on content release date
 */
export function getRefreshThreshold(releaseDate: Date | null, now: Date = new Date()): number {
  if (!releaseDate) return FRESHNESS_THRESHOLDS.MATURE;

  const daysSinceRelease = (now.getTime() - releaseDate.getTime()) / DAY_MS;

  if (daysSinceRelease < 14) return FRESHNESS_THRESHOLDS.VERY_NEW;
  if (daysSinceRelease < 30) return FRESHNESS_THRESHOLDS.NEW;
  if (daysSinceRelease < 90) return FRESHNESS_THRESHOLDS.RECENT;
  if (daysSinceRelease < 3 * 365) return FRESHNESS_THRESHOLDS.MATURE;
  return FRESHNESS_THRESHOLDS.VERY_MATURE;
}

/**
 * Check if data is stale and needs refresh
 *
 * @param lastUpdated - When the data was last fetched/scraped
 * @param releaseDate - Content release date (determines threshold)
 * @returns true if data is stale and should be refreshed
 */
export function isDataStale(lastUpdated: Date | null, releaseDate: Date | null): boolean {
  if (!lastUpdated) return true; // Never fetched = stale

  const age = Date.now() - lastUpdated.getTime();
  const threshold = getRefreshThreshold(releaseDate);

  return age > threshold;
}

/**
 * Parse a date from various formats (string, Date, null)
 */
export function parseDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  if (date instanceof Date) return date;
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export interface SeriesFreshnessInput {
  /** When TMDB core data (incl. episodes) was last fetched. */
  tmdbUpdatedAt: Date | null;
  /** Fallback for rows written before tmdbUpdatedAt existed. */
  updatedAt: Date | null;
  firstAirDate: Date | null;
  lastAirDate: Date | null;
  lastEpisodeAirDate: Date | null;
  nextEpisodeAirDate: Date | null;
}

/**
 * Series core (details + seasons + episodes) staleness. Differs from movies
 * (Nov 2026) because a series keeps changing after it premieres:
 *
 * - Clock = `tmdbUpdatedAt`, NOT `updatedAt`. Every enrichment-only refresh
 *   writes scrape stamps onto the row and bumps `updatedAt`, which used to keep
 *   the core looking fresh long after the last real TMDB fetch.
 * - Cadence anchors to the most recent airing, not the premiere. A show that
 *   premiered in 2016 and aired an episode last week refreshes daily, not every
 *   90 days (the premiere anchor kept new episodes out of PG for up to 3 months).
 * - A known next episode that has aired since the last fetch makes it stale now.
 */
export function isSeriesCoreStale(s: SeriesFreshnessInput, now: Date = new Date()): boolean {
  const fetchedAt = s.tmdbUpdatedAt ?? s.updatedAt;
  if (!fetchedAt) return true;

  const next = s.nextEpisodeAirDate;
  if (next && next.getTime() <= now.getTime() && next.getTime() > fetchedAt.getTime()) {
    return true;
  }

  const anchor = [s.lastEpisodeAirDate, s.lastAirDate, s.firstAirDate]
    .filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()) && d <= now)
    .reduce<Date | null>((a, d) => (a === null || d > a ? d : a), null);

  return now.getTime() - fetchedAt.getTime() > getRefreshThreshold(anchor, now);
}
