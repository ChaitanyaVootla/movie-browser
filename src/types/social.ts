/**
 * Shared Phase 0 (Tracking Core) DTO contracts.
 * The backend plan's server actions implement these exact shapes — this file
 * is the reconciliation point between the UI and backend plans.
 * String unions mirror the Prisma enums in the schema spec (§4.2).
 */

export type WatchStatus =
  | "WATCHING"
  | "CAUGHT_UP"
  | "COMPLETED"
  | "DROPPED"
  | "PAUSED"
  | "REWATCHING";

export type WatchEventSource = "LOGGED" | "BACKFILL" | "IMPORT";
export type WatchedAtPrecision = "DATETIME" | "DATE" | "UNKNOWN";
export type ReviewStatus =
  | "PENDING_REVIEW"
  | "PUBLISHED"
  | "FLAGGED"
  | "REMOVED"
  | "DELETED_BY_USER";
export type ImportSource = "LETTERBOXD" | "TRAKT" | "IMDB";
export type ImportJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type TrackedMediaType = "movie" | "series";

export type ActionResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export interface LogWatchInput {
  mediaType: TrackedMediaType;
  tmdbId: number;
  seasonNumber?: number;
  episodeNumber?: number;
  /** TMDB episode id — soft reference for renumber reconciliation (§4.1.2). */
  tmdbEpisodeId?: number;
  /** ISO date "YYYY-MM-DD" (stored 12:00 UTC, precision DATE) or null = unknown. */
  watchedAt: string | null;
  note?: string;
  /** Per-viewing rating 1-10 (also sets your canonical rating). */
  score?: number | null;
  /** WATCH = a viewing (default); NOTE = a diary entry that is not a viewing. */
  kind?: "WATCH" | "NOTE";
  isRewatch?: boolean;
  isPrivate?: boolean;
}

export interface SeriesProgressDTO {
  status: WatchStatus;
  statusIsManual: boolean;
  lastSeasonNumber: number | null;
  lastEpisodeNumber: number | null;
  episodesWatched: number;
  totalEpisodes: number;
  /**
   * Episodes that have aired so far (air_date <= now, or null air_date), across
   * all regular seasons. The "available" extent for the buffer-style progress
   * bar — on ongoing shows this is < totalEpisodes, so the UI can honestly show
   * "watched / available / total" instead of pretending unaired episodes count.
   */
  airedEpisodes: number;
  rewatchCount: number;
}

export interface EpisodeKeyDTO {
  seasonNumber: number;
  episodeNumber: number;
}

export interface SeriesTrackingDTO {
  progress: SeriesProgressDTO | null;
  /** Current-cycle watched episodes (distinct natural keys). */
  watchedEpisodes: EpisodeKeyDTO[];
}

export interface UpNextItemDTO {
  seriesId: number;
  seriesName: string;
  status: WatchStatus;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string | null;
  /** TMDB still path (e.g. "/abc.jpg") or null — UI falls back to CDN series backdrop. */
  episodeStillPath: string | null;
  episodesLeft: number;
}

export interface DiaryEntryDTO {
  id: number;
  mediaType: TrackedMediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeName: string | null;
  /** ISO datetime or null (undated import/backfill). */
  watchedAt: string | null;
  watchedAtPrecision: WatchedAtPrecision;
  note: string | null;
  /** Rating captured at this viewing (1-10), independent of canonical rating. */
  score: number | null;
  /** Rewatch-cycle ordinal: 1 = first watch-through. */
  cycle: number;
  /** WATCH = a viewing; NOTE = a non-viewing diary entry (rating/note). */
  kind: "WATCH" | "NOTE";
  isRewatch: boolean;
  isPrivate: boolean;
  source: WatchEventSource;
}

export interface DiaryPageDTO {
  entries: DiaryEntryDTO[];
  /** Opaque keyset cursor for the next (older) page, or null. */
  nextCursor: string | null;
  /** Count of undated (BACKFILL/IMPORT, watchedAt NULL) events, shown collapsed. */
  undatedCount: number;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface BreakdownSliceDTO {
  label: string;
  count: number;
}

export interface PersonSliceDTO {
  /** null in v1 — stats aggregate by name; render unlinked with initials fallback. */
  personId: number | null;
  name: string;
  profilePath: string | null;
  count: number;
}

export interface RewatchChampionDTO {
  title: string;
  count: number;
}

export interface UserStatsDTO {
  totalHours: number;
  moviesWatched: number;
  episodesWatched: number;
  seriesCompleted: number;
  /** Last 12 months, oldest first. month = "2026-06". Combined movie+episode count. */
  monthlyCounts: { month: string; count: number }[];
  genres: BreakdownSliceDTO[];
  decades: BreakdownSliceDTO[];
  /** May be empty in v1 (no country dimension in the snapshot) — hide section when []. */
  countries: BreakdownSliceDTO[];
  topActors: PersonSliceDTO[];
  topDirectors: PersonSliceDTO[];
  currentStreakDays: number;
  longestStreakDays: number;
  rewatchChampions: RewatchChampionDTO[];
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export interface SubmitReviewInput {
  mediaType: TrackedMediaType;
  tmdbId: number;
  seasonNumber?: number;
  body: string;
  containsSpoilers: boolean;
  isPrivate: boolean;
}

export interface ReviewDTO {
  id: number;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  /** 1–10 score from user_ratings join, when present. */
  score: number | null;
  body: string;
  containsSpoilers: boolean;
  seasonNumber: number | null;
  createdAt: string;
  editedAt: string | null;
}

export interface OwnReviewDTO extends ReviewDTO {
  status: ReviewStatus;
  isPrivate: boolean;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export type ProfileAccent =
  | "default"
  | "midnight"
  | "forest"
  | "golden"
  | "ocean"
  | "sunset"
  | "violet"
  | "rose";

export interface ProfileBackdropDTO {
  mediaType: TrackedMediaType;
  tmdbId: number;
  /** TMDB backdrop file path ("/abc.jpg"). */
  imagePath: string;
  titleName: string;
}

export interface FavoriteItemDTO {
  mediaType: TrackedMediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
}

export interface PinnedListDTO {
  id: number;
  name: string;
  slug: string;
  itemCount: number;
  posterPaths: string[];
}

export interface CurrentlyWatchingItemDTO {
  seriesId: number;
  seriesName: string;
  posterPath: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

export interface PublicProfileDTO {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accent: ProfileAccent;
  bio: string | null;
  links: string[];
  location: string | null;
  backdrop: ProfileBackdropDTO | null;
  joinedAt: string;
  isPublic: boolean;
  counts: {
    followers: number;
    following: number;
    filmsWatched: number;
    episodesWatched: number;
    hoursWatched: number;
  };
  fourFavorites: FavoriteItemDTO[];
  pinnedLists: PinnedListDTO[];
  reviews: ReviewDTO[];
  /** Index 0 = score 1 … index 9 = score 10. */
  ratingsHistogram: number[];
  topGenres: BreakdownSliceDTO[];
  topDecades: BreakdownSliceDTO[];
  /** Top production/origin countries (ISO alpha-2 code + count); name/flag derived in the UI. */
  topCountries: { code: string; count: number }[];
  /** Last 12 months, oldest first. month = "2026-06". */
  monthlyActivity: { month: string; count: number }[];
  /** Per-day watch counts (public, dated, last ~26 weeks) for the heatmap. day = "2026-06-13". */
  dailyActivity: { day: string; count: number }[];
  /** Most-recent public watched titles for the watch-activity side list. */
  recentWatches: {
    mediaType: TrackedMediaType;
    tmdbId: number;
    title: string;
    posterPath: string | null;
    watchedAt: string;
  }[];
  currentlyWatching: CurrentlyWatchingItemDTO[];
  longestStreakDays: number;
  currentStreakDays: number;
  rewatchCount: number;
  rewatchChampions: RewatchChampionDTO[];
  /** Saved widget-dashboard layout (metadata.profile.layout) or null → default. Validated by resolveLayout. */
  layout: unknown;
}

export interface ProfileViewerStateDTO {
  isOwner: boolean;
  isFollowing: boolean;
}

export interface ProfileCustomizationInput {
  backdrop: { mediaType: TrackedMediaType; tmdbId: number; imagePath: string } | null;
  /** null = Google photo default; otherwise a TMDB image path pick. */
  avatarImagePath: string | null;
  accent: ProfileAccent;
  bio: string;
  links: string[];
  location: string;
}

export interface OwnProfileSettingsDTO {
  username: string | null;
  displayName: string;
  googleImageUrl: string | null;
  customization: ProfileCustomizationInput;
  privacy: { logPrivatelyByDefault: boolean };
  fourFavorites: FavoriteItemDTO[];
  /** Prior usernames this account has left behind, newest-first (Twitter-style trail). */
  previousUsernames: string[];
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

export interface ImportRowErrorDTO {
  row: number;
  reason: string;
}

export interface ImportJobDTO {
  id: number;
  source: ImportSource;
  status: ImportJobStatus;
  stats: {
    rowsTotal: number;
    processed: number;
    imported: number;
    skipped: number;
    errors: ImportRowErrorDTO[];
  } | null;
  createdAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Phase B: @-mention search (sectioned catalog search for the autocomplete)
// ---------------------------------------------------------------------------

export interface MentionSearchResultDto {
  people: { username: string; name: string | null; image: string | null }[];
  titles: { kind: "movie" | "series"; tmdbId: number; name: string; year: number | null; imagePath: string | null }[];
  cast: { tmdbId: number; name: string; imagePath: string | null }[];
  episodes: { seriesId: number; seasonNumber: number; episodeNumber: number; name: string; imagePath: string | null }[];
}
