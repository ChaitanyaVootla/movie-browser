/**
 * PURE series-progress derivation (no DB). Fed by recomputeSeriesProgress
 * with one user's watch events for one series.
 *
 * Spec: docs/superpowers/specs/2026-06-12-social-virality-roadmap-design.md
 * §4.2 series_progress. Split pointers: spoiler gate reads ONLY the lifetime
 * watermark (max*, monotonic); Up Next reads the current cycle (last*).
 */
import type { WatchStatus } from "@prisma/client";

export interface ProgressEventInput {
  seasonNumber: number | null;
  episodeNumber: number | null;
  watchedAt: Date | null;
  createdAt: Date;
}

export interface SeriesCountsInput {
  /** Episodes with airDate <= now, EXCLUDING season-0 specials. */
  airedEpisodes: number;
  /** TMDB status is "Ended" or "Canceled". */
  isEnded: boolean;
}

export interface DerivedProgress {
  /** True when the user has zero events: caller deletes the progress row. */
  empty: boolean;
  status: WatchStatus;
  lastSeasonNumber: number | null;
  lastEpisodeNumber: number | null;
  episodesWatched: number;
  maxSeasonNumber: number | null;
  maxEpisodeNumber: number | null;
}

function effectiveAt(e: ProgressEventInput): Date {
  return e.watchedAt ?? e.createdAt;
}

function isEpisodeEvent(e: ProgressEventInput): boolean {
  return e.seasonNumber !== null && e.episodeNumber !== null;
}

function maxTuple(events: ProgressEventInput[]): {
  season: number | null;
  episode: number | null;
} {
  let season: number | null = null;
  let episode: number | null = null;
  for (const e of events) {
    if (e.seasonNumber === null || e.episodeNumber === null) continue;
    if (
      season === null ||
      e.seasonNumber > season ||
      (e.seasonNumber === season && e.episodeNumber > (episode ?? -1))
    ) {
      season = e.seasonNumber;
      episode = e.episodeNumber;
    }
  }
  return { season, episode };
}

export function deriveProgress(
  events: ProgressEventInput[],
  counts: SeriesCountsInput,
  rewatchStartedAt: Date | null,
  manualStatus: WatchStatus | null
): DerivedProgress {
  if (events.length === 0) {
    return {
      empty: true,
      status: "WATCHING",
      lastSeasonNumber: null,
      lastEpisodeNumber: null,
      episodesWatched: 0,
      maxSeasonNumber: null,
      maxEpisodeNumber: null,
    };
  }

  const cycleEvents = rewatchStartedAt
    ? events.filter((e) => effectiveAt(e).getTime() >= rewatchStartedAt.getTime())
    : events;

  const lifetime = maxTuple(events);
  const cycle = maxTuple(cycleEvents);

  const cycleKeys = new Set<string>();
  const cycleNonSpecialKeys = new Set<string>();
  let cycleHasGranularityUnknown = false;
  for (const e of cycleEvents) {
    if (isEpisodeEvent(e)) {
      const key = `${e.seasonNumber}:${e.episodeNumber}`;
      cycleKeys.add(key);
      if (e.seasonNumber !== 0) cycleNonSpecialKeys.add(key);
    } else {
      cycleHasGranularityUnknown = true;
    }
  }

  let status: WatchStatus;
  if (manualStatus !== null) {
    status = manualStatus;
  } else if (counts.airedEpisodes > 0 && cycleNonSpecialKeys.size >= counts.airedEpisodes) {
    status = counts.isEnded ? "COMPLETED" : "CAUGHT_UP";
  } else if (cycleKeys.size === 0 && cycleHasGranularityUnknown) {
    // Series-level events only (IMDb import): watched, granularity unknown.
    status = "COMPLETED";
  } else if (rewatchStartedAt !== null) {
    status = "REWATCHING";
  } else {
    status = "WATCHING";
  }

  return {
    empty: false,
    status,
    lastSeasonNumber: cycle.season,
    lastEpisodeNumber: cycle.episode,
    episodesWatched: cycleKeys.size,
    maxSeasonNumber: lifetime.season,
    maxEpisodeNumber: lifetime.episode,
  };
}
