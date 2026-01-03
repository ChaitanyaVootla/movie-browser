/**
 * AI Agent Tools
 *
 * Export all tools for the movie recommendation agent.
 *
 * Consolidated tool set (9 tools total):
 * 1. search - Find movies/series/people by name
 * 2. discover - Filter-based discovery with rich criteria
 * 3. get_trending - What's popular right now
 * 4. get_details - Movie/series info + optional videos + optional related
 * 5. get_person - Actor/director info and filmography
 * 6. get_upcoming - Upcoming/now playing content
 * 7. get_user_data - Watchlist, ratings, watched history
 * 8. get_page_context - Current page the user is viewing
 * 9. navigate_to - Navigation intent
 */

// Core tools
export { searchTool } from "./search";
export { discoverTool } from "./discover";
export { getTrendingTool } from "./trending";
export { navigateTool } from "./navigation";

// Consolidated detail tool (replaces get_movie_details, get_series_details, get_videos, get_related_content)
export { getDetailsTool, detailTools } from "./details";

// Person tool
export { getPersonTool, personTools } from "./person";

// Upcoming tool
export { getUpcomingTool, upcomingTools } from "./upcoming";

// Consolidated user data tool (replaces get_user_watchlist, get_user_ratings, get_user_watched)
export { getUserDataTool, userDataTools } from "./user-data";

// Context tool
export { getPageContextTool, type PageContext } from "./context";

// =============================================================================
// All Tools Array
// =============================================================================

import { searchTool } from "./search";
import { discoverTool } from "./discover";
import { getTrendingTool } from "./trending";
import { navigateTool } from "./navigation";
import { getDetailsTool } from "./details";
import { getPersonTool } from "./person";
import { getUpcomingTool } from "./upcoming";
import { getUserDataTool } from "./user-data";
import { getPageContextTool } from "./context";

/**
 * All available tools for the movie agent (9 tools)
 *
 * Tool consolidation summary:
 * - get_details: Merged from get_movie_details + get_series_details + get_videos + get_related_content
 * - get_user_data: Merged from get_user_watchlist + get_user_ratings + get_user_watched
 * - search: Renamed from search_movies (searches movies, series, AND people)
 */
export const allTools = [
  // Search & Discovery
  searchTool, // Find by name
  discoverTool, // Find by filters
  getTrendingTool, // What's popular

  // Details (consolidated)
  getDetailsTool, // Movie/series info + optional videos + related
  getPersonTool, // Person info + filmography
  getUpcomingTool, // Upcoming releases

  // User data (consolidated)
  getUserDataTool, // Watchlist + ratings + watched

  // Context & Navigation
  getPageContextTool, // What page user is on
  navigateTool, // Navigate to pages
];

// =============================================================================
// Legacy exports (deprecated - for backward compatibility)
// =============================================================================

// These are deprecated aliases - use the new consolidated tools instead
export {
  getDetailsTool as getMovieDetailsTool,
  getDetailsTool as getSeriesDetailsTool,
} from "./details";
export {
  getUserDataTool as getUserWatchlistTool,
  getUserDataTool as getUserRatingsTool,
  getUserDataTool as getUserWatchedTool,
} from "./user-data";
export { discoverTool as discoverMoviesTool, discoverTool as discoverSeriesTool } from "./discover";
