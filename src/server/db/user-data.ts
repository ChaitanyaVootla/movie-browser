/**
 * Unified User Data Service
 *
 * Delegates to either MongoDB or PostgreSQL based on the USER_DATA_SOURCE
 * feature flag. Both implementations conform to the same interfaces.
 *
 * At GA: delete the MongoDB import and reference Prisma directly.
 */

import * as pgQueries from "./postgres/user-queries";
import * as mongoQueries from "./mongo/user-queries";
import { usePostgresUserData } from "@/lib/user-id";

// Re-export the feature flag for consumers that need to check it
export { usePostgresUserData } from "@/lib/user-id";

// ---------------------------------------------------------------------------
// Shared Types (both implementations must conform to these)
// ---------------------------------------------------------------------------

export interface LibraryData {
  watchedMovieIds: number[];
  watchlistMovieIds: number[];
  watchlistSeriesIds: number[];
  ratings: { itemId: number; itemType: "movie" | "series"; rating: number }[];
  recentItems: RecentItemData[];
  continueWatchingItems: ContinueWatchingItemData[];
}

export interface RecentItemData {
  itemId: number;
  isMovie: boolean;
  poster_path: string | null;
  backdrop_path: string | null;
  title: string | null;
  name: string | null;
  viewedAt: Date;
}

export interface ContinueWatchingItemData {
  itemId: number;
  isMovie: boolean;
  poster_path: string | null;
  backdrop_path: string | null;
  title: string | null;
  name: string | null;
  watchLink: string;
  watchProviderName: string | null;
  updatedAt: Date;
}

export interface MovieDetail {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { id: number; name: string }[];
  vote_average: number | null;
  overview: string | null;
  release_date: string | null;
  runtime: number | null;
}

export interface SeriesDetail {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { id: number; name: string }[];
  vote_average: number | null;
  overview: string | null;
  first_air_date: string | null;
  status: string | null;
  number_of_seasons: number | null;
  next_episode_to_air: unknown;
  last_episode_to_air: unknown;
}

export interface UserItemStatus {
  inWatchlist: boolean;
  isWatched: boolean;
  userRating: number | null;
}

export interface UserExclusions {
  watchedIds: number[];
  watchlistIds: number[];
  dislikedIds: number[];
}

export interface AdminUserData {
  id: string;
  sub: string;
  name: string;
  email: string;
  picture: string | null;
  image: string | null;
  createdAt: Date | null;
  lastVisited: Date | null;
  location: string | null;
  [key: string]: unknown; // Activity counts
}

// ---------------------------------------------------------------------------
// Conditional re-exports (pick the active implementation)
// ---------------------------------------------------------------------------

const impl = usePostgresUserData ? pgQueries : mongoQueries;

// Library
export const getLibraryData = impl.getLibraryData;

// Watchlist
export const getMovieWatchlistWithDates = impl.getMovieWatchlistWithDates;
export const getSeriesWatchlistWithDates = impl.getSeriesWatchlistWithDates;
export const getMovieDetails = impl.getMovieDetails;
export const getSeriesDetails = impl.getSeriesDetails;
export const addMovieToWatchlist = impl.addMovieToWatchlist;
export const removeMovieFromWatchlist = impl.removeMovieFromWatchlist;
export const addSeriesToWatchlist = impl.addSeriesToWatchlist;
export const removeSeriesFromWatchlist = impl.removeSeriesFromWatchlist;

// Watched
export const getWatchedMovieIdsWithDates = impl.getWatchedMovieIdsWithDates;
export const markMovieWatched = impl.markMovieWatched;
export const unmarkMovieWatched = impl.unmarkMovieWatched;

// Ratings
export const getUserRatings = impl.getUserRatings;
export const upsertRating = impl.upsertRating;
export const deleteRating = impl.deleteRating;

// Recents
export const getRecentItems = impl.getRecentItems;
export const upsertRecentItem = impl.upsertRecentItem;

// Continue Watching
export const getContinueWatchingItems = impl.getContinueWatchingItems;
export const upsertContinueWatchingItem = impl.upsertContinueWatchingItem;
export const deleteContinueWatchingItem = impl.deleteContinueWatchingItem;

// AI Tools
export const getUserItemStatus = impl.getUserItemStatus;
export const getUserExclusions = impl.getUserExclusions;

// Admin
export const getAdminUsersWithActivity = impl.getAdminUsersWithActivity;
