/**
 * Resume-target logic for series detail pages.
 *
 * Given a user's last-watched position (the lifetime/current-cycle watermark
 * from `series_progress`) and the season episode-counts, decide which season to
 * open and which episode to scroll to + highlight when a viewer lands on a
 * series they're already tracking. Pure + framework-free so it is unit-testable
 * and reusable by deep-link parsing.
 */

export interface ResumeSeasonInfo {
  season_number: number;
  episode_count: number;
}

export interface ResumeTarget {
  seasonNumber: number;
  episodeNumber: number;
  /**
   * True when the target is the *next* (unwatched) episode to watch; false when
   * the viewer is caught up and we fall back to the last episode they watched
   * (so they still land where they left off rather than at the top).
   */
  isNext: boolean;
}

/**
 * Compute where to resume a tracked series. Returns null when there is no usable
 * position (caller keeps its default season selection).
 */
export function computeResumeTarget(
  seasons: ResumeSeasonInfo[],
  lastSeasonNumber: number | null | undefined,
  lastEpisodeNumber: number | null | undefined,
): ResumeTarget | null {
  if (lastSeasonNumber == null || lastEpisodeNumber == null) return null;

  // Only regular seasons (skip specials / season 0), ascending.
  const regular = seasons
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number);

  if (regular.length === 0) {
    // No season metadata — trust the watermark as-is.
    return { seasonNumber: lastSeasonNumber, episodeNumber: lastEpisodeNumber, isNext: false };
  }

  const current = regular.find((s) => s.season_number === lastSeasonNumber);

  // Next episode within the same season.
  if (current && lastEpisodeNumber < current.episode_count) {
    return { seasonNumber: lastSeasonNumber, episodeNumber: lastEpisodeNumber + 1, isNext: true };
  }

  // Otherwise the first episode of the next regular season that has episodes.
  const next = regular.find((s) => s.season_number > lastSeasonNumber);
  if (next) {
    return { seasonNumber: next.season_number, episodeNumber: 1, isNext: true };
  }

  // Caught up across all aired seasons — land on the last watched episode.
  return { seasonNumber: lastSeasonNumber, episodeNumber: lastEpisodeNumber, isNext: false };
}

/**
 * Parse a `?s=<season>&e=<episode>` deep-link from a location search string.
 * Used by Up Next / Continue Watching cards to resume at an exact episode.
 * `e` is optional — a bare `?s=2` just opens season 2.
 */
export function parseResumeParams(
  search: string,
): { seasonNumber: number; episodeNumber: number | null } | null {
  const params = new URLSearchParams(search);
  const s = params.get("s");
  if (!s) return null;
  const seasonNumber = Number.parseInt(s, 10);
  if (Number.isNaN(seasonNumber)) return null;
  const eRaw = params.get("e");
  const e = eRaw != null ? Number.parseInt(eRaw, 10) : Number.NaN;
  return { seasonNumber, episodeNumber: Number.isNaN(e) ? null : e };
}

/**
 * Build a `?s=&e=` resume query string (no leading "?") for a series deep-link.
 */
export function resumeQuery(seasonNumber: number, episodeNumber: number): string {
  return `s=${seasonNumber}&e=${episodeNumber}`;
}
