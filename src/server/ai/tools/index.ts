/**
 * AI Agent Tools
 *
 * Export all tools for the movie recommendation agent.
 *
 * Consolidated tool set (11 tools total):
 * 1. search - Find movies/series/people by name (TMDB multi-search)
 * 2. smart_discover - Unified discovery with filters + semantic search + user library (PostgreSQL)
 * 3. get_trending - What's popular right now
 * 4. get_details - Movie/series info + optional videos + optional related
 * 5. get_person - Actor/director info and filmography
 * 6. get_upcoming - Upcoming/now playing content
 * 7. get_page_context - Current page the user is viewing (with user status)
 * 8. navigate_to - Navigation intent
 * 9. web_search - Search the live web (Tavily) for news, box office, awards, reviews
 * 10. web_extract - Extract full content from URLs found via web_search
 * 11. get_user_profile - Compact taste profile for personalized recommendations
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

// Context & User tools
export { getPageContextTool, type PageContext } from "./context";
export { getUserProfileTool } from "./user-profile";

// Web tools (Tavily)
export { webSearchTool } from "./web-search";
export { webExtractTool } from "./web-extract";

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
import { getPageContextTool } from "./context";
import { getUserProfileTool } from "./user-profile";
import { webSearchTool } from "./web-search";
import { webExtractTool } from "./web-extract";

/**
 * All available tools for the movie agent (11 tools)
 */
export const allTools = [
  // Search & Discovery
  searchTool, // Find specific title/person by name (TMDB)
  smartDiscoverTool, // Unified: filters + semantic + similar + user library (PostgreSQL)
  getTrendingTool, // What's popular right now

  // Details
  getDetailsTool, // Movie/series info + optional videos + related
  getPersonTool, // Person info + filmography
  getUpcomingTool, // Upcoming releases

  // Context & User
  getPageContextTool, // What page user is on (with user status + media metadata)
  getUserProfileTool, // Compact taste profile (top genres, recent watches, counts)
  navigateTool, // Navigate to pages

  // Web tools (Tavily)
  webSearchTool, // Search live web for news, awards, box office, reviews
  webExtractTool, // Extract full content from URLs
];

// =============================================================================
// Legacy aliases (for backward compatibility)
// =============================================================================

export {
  getDetailsTool as getMovieDetailsTool,
  getDetailsTool as getSeriesDetailsTool,
} from "./details";
