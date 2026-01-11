/**
 * AI Agent Tools
 *
 * Export all tools for the movie recommendation agent.
 *
 * Consolidated tool set (9 tools total):
 * 1. search - Find movies/series/people by name (TMDB multi-search)
 * 2. smart_discover - Unified discovery with filters + semantic search (PostgreSQL)
 * 3. get_trending - What's popular right now
 * 4. get_details - Movie/series info + optional videos + optional related
 * 5. get_person - Actor/director info and filmography
 * 6. get_upcoming - Upcoming/now playing content
 * 7. get_user_data - Watchlist, ratings, watched history
 * 8. get_page_context - Current page the user is viewing
 * 9. navigate_to - Navigation intent
 *
 * DEPRECATED (replaced by smart_discover):
 * - discover - Use smart_discover instead
 * - semantic_search - Use smart_discover with semanticQuery
 * - find_similar - Use smart_discover with similarTo
 */

// Core tools
export { searchTool } from "./search";
export { smartDiscoverTool } from "./smart-discover";
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
// Legacy exports (deprecated - kept for backward compatibility)
// These tools are replaced by smart_discover but kept for existing code
// =============================================================================
export { semanticSearchTool } from "./semantic-search";
export { discoverTool } from "./discover";
export { findSimilarTool } from "./similar";
// Legacy aliases
export { discoverTool as discoverMoviesTool, discoverTool as discoverSeriesTool } from "./discover";

// =============================================================================
// All Tools Array
// =============================================================================

import { searchTool } from "./search";
import { smartDiscoverTool } from "./smart-discover";
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
 * Tool consolidation summary (Jan 2026):
 * - smart_discover: Unified tool combining discover + semantic_search + find_similar
 *   - PostgreSQL-first with pgvector for semantic ranking
 *   - Filters + semantic query in ONE call
 *   - "More like X" via similarTo parameter
 * - get_details: Movie/series info + optional videos + related
 * - get_user_data: Watchlist + ratings + watched
 * - search: TMDB multi-search for exact title/person lookup
 */
export const allTools = [
  // Search & Discovery
  searchTool, // Find specific title/person by name (TMDB)
  smartDiscoverTool, // Unified: filters + semantic + similar (PostgreSQL)
  getTrendingTool, // What's popular right now

  // Details
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
// More legacy aliases (for backward compatibility)
// =============================================================================

export {
  getDetailsTool as getMovieDetailsTool,
  getDetailsTool as getSeriesDetailsTool,
} from "./details";
export {
  getUserDataTool as getUserWatchlistTool,
  getUserDataTool as getUserRatingsTool,
  getUserDataTool as getUserWatchedTool,
} from "./user-data";
