/**
 * Server Utilities
 *
 * Shared utility functions for server-side code.
 */

// Media data fetching utilities (MongoDB + TMDB)
export {
  getLightMovieDetails,
  getLightSeriesDetails,
  getLightPersonDetails,
  searchPersonAndGetDetails,
  getCountryCode,
  SSR_RENDER_COUNTRY,
  type LightMovieDetails,
  type LightSeriesDetails,
  type LightPersonDetails,
} from "./media-data";
