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
} as const;

/**
 * Get the refresh threshold based on content release date
 */
export function getRefreshThreshold(releaseDate: Date | null): number {
  if (!releaseDate) return FRESHNESS_THRESHOLDS.MATURE;

  const daysSinceRelease =
    (Date.now() - releaseDate.getTime()) / DAY_MS;

  if (daysSinceRelease < 14) return FRESHNESS_THRESHOLDS.VERY_NEW;
  if (daysSinceRelease < 30) return FRESHNESS_THRESHOLDS.NEW;
  if (daysSinceRelease < 90) return FRESHNESS_THRESHOLDS.RECENT;
  return FRESHNESS_THRESHOLDS.MATURE;
}

/**
 * Check if data is stale and needs refresh
 *
 * @param lastUpdated - When the data was last fetched/scraped
 * @param releaseDate - Content release date (determines threshold)
 * @returns true if data is stale and should be refreshed
 */
export function isDataStale(
  lastUpdated: Date | null,
  releaseDate: Date | null
): boolean {
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
