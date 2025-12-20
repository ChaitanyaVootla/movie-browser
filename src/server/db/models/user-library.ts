import mongoose, { Schema, InferSchemaType } from "mongoose";

/**
 * User Library Models
 *
 * These models store user-specific data like watchlist, watched status, and ratings.
 * They are compatible with the Nuxt app's existing collections.
 *
 * IMPORTANT: userId is the Google OAuth sub (stored as Number for legacy compatibility)
 */

// =============================================================================
// Watched Movies
// =============================================================================

const WatchedMovieSchema = new Schema(
  {
    userId: { type: Number, required: true },
    movieId: { type: Number, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { strict: false, collection: "watchedmovies" }
);

WatchedMovieSchema.index({ userId: 1, movieId: 1 }, { unique: true });
WatchedMovieSchema.index({ userId: 1, createdAt: -1 });

export type IWatchedMovie = InferSchemaType<typeof WatchedMovieSchema>;
export const WatchedMovie =
  mongoose.models.WatchedMovies ||
  mongoose.model<IWatchedMovie>("WatchedMovies", WatchedMovieSchema);

// =============================================================================
// Movies Watchlist
// =============================================================================

const MoviesWatchlistSchema = new Schema(
  {
    userId: { type: Number, required: true },
    movieId: { type: Number, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { strict: false, collection: "movieswatchlists" }
);

MoviesWatchlistSchema.index({ userId: 1, movieId: 1 }, { unique: true });
MoviesWatchlistSchema.index({ userId: 1, createdAt: -1 });

export type IMoviesWatchlist = InferSchemaType<typeof MoviesWatchlistSchema>;
export const MoviesWatchlist =
  mongoose.models.moviesWatchList ||
  mongoose.model<IMoviesWatchlist>("moviesWatchList", MoviesWatchlistSchema);

// =============================================================================
// Series Watchlist
// =============================================================================

const SeriesWatchlistSchema = new Schema(
  {
    userId: { type: Number, required: true },
    seriesId: { type: Number, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { strict: false, collection: "serieslists" }
);

SeriesWatchlistSchema.index({ userId: 1, seriesId: 1 }, { unique: true });
SeriesWatchlistSchema.index({ userId: 1, createdAt: -1 });

export type ISeriesWatchlist = InferSchemaType<typeof SeriesWatchlistSchema>;
export const SeriesWatchlist =
  mongoose.models.seriesList ||
  mongoose.model<ISeriesWatchlist>("seriesList", SeriesWatchlistSchema);

// =============================================================================
// User Ratings (Like/Dislike)
// =============================================================================

const UserRatingSchema = new Schema(
  {
    userId: { type: Number, required: true },
    itemId: { type: Number, required: true },
    itemType: { type: String, required: true, enum: ["movie", "series"] },
    rating: { type: Number, required: true }, // 1 = like, -1 = dislike
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { strict: false, collection: "userratings" }
);

UserRatingSchema.index({ userId: 1, itemId: 1, itemType: 1 }, { unique: true });
UserRatingSchema.index({ userId: 1, createdAt: -1 });

export type IUserRating = InferSchemaType<typeof UserRatingSchema>;
export const UserRating =
  mongoose.models.userratings ||
  mongoose.model<IUserRating>("userratings", UserRatingSchema);

// =============================================================================
// Recent Items (Continue Watching / History)
// =============================================================================

const RecentItemSchema = new Schema(
  {
    userId: { type: Number, required: true },
    itemId: { type: Number, required: true },
    isMovie: { type: Boolean, required: true },
    poster_path: { type: String },
    backdrop_path: { type: String },
    title: { type: String },
    name: { type: String },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { strict: false, collection: "recents" }
);

RecentItemSchema.index({ userId: 1, itemId: 1, isMovie: 1 }, { unique: true });
RecentItemSchema.index({ userId: 1, updatedAt: -1 });

export type IRecentItem = InferSchemaType<typeof RecentItemSchema>;
export const RecentItem =
  mongoose.models.recents || mongoose.model<IRecentItem>("recents", RecentItemSchema);

// =============================================================================
// Continue Watching
// =============================================================================

const ContinueWatchingSchema = new Schema(
  {
    userId: { type: Number, required: true },
    itemId: { type: Number, required: true },
    isMovie: { type: Boolean, required: true },
    poster_path: { type: String },
    backdrop_path: { type: String },
    title: { type: String },
    name: { type: String },
    watchLink: { type: String, required: true },
    watchProviderName: { type: String },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { strict: false, collection: "continuewatchings" }
);

ContinueWatchingSchema.index({ userId: 1, itemId: 1, isMovie: 1 }, { unique: true });
ContinueWatchingSchema.index({ userId: 1, updatedAt: -1 });

export type IContinueWatching = InferSchemaType<typeof ContinueWatchingSchema>;
export const ContinueWatching =
  mongoose.models.continuewatchings ||
  mongoose.model<IContinueWatching>("continuewatchings", ContinueWatchingSchema);
