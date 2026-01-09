/**
 * AI Agent Module
 *
 * Main exports for the movie recommendation AI agent.
 *
 * Tool consolidation (14 → 9 tools):
 * - get_details: Merged movie/series details + videos + related
 * - get_user_data: Merged watchlist + ratings + watched
 * - search: Renamed from search_movies
 */

// Agent
export {
  createMovieAgent,
  invokeAgent,
  streamAgent,
  getAgentResponse,
  extractNavigation,
  getAgentLogs,
  resetAgentLogs,
} from "./agent";
export type { StreamEvent, AgentLogs, UserContextInput } from "./agent";

// State
export { AgentState } from "./state";
export type { AgentStateType, AgentMediaItem, NavigationAction } from "./state";

// Tools (consolidated set)
export {
  allTools,
  // Core tools
  searchTool,
  discoverTool,
  getTrendingTool,
  navigateTool,
  // Detail tools
  getDetailsTool,
  getPersonTool,
  getUpcomingTool,
  // User data
  getUserDataTool,
  // Context
  getPageContextTool,
  // Legacy aliases (deprecated)
  getMovieDetailsTool,
  getSeriesDetailsTool,
  discoverMoviesTool,
  discoverSeriesTool,
} from "./tools";

// Bedrock
export { createBedrockChat, createBedrockChatWithTools } from "./bedrock";

// Prompts
export { getSystemPrompt, SYSTEM_PROMPT } from "./prompts/system";

// Media tag resolution (server-side)
export {
  resolveMediaTags,
  parseAndResolveContent,
  needsResolution,
} from "./resolve-media-tags";

// Logging & Cost Tracking (re-export from lib for convenience)
export { usageLogger, aiLogger } from "@/lib/logger";
export {
  calculateUsageStats,
  calculateCost,
  getModelPricing,
  getCurrentModelId,
  getCurrentModelPricing,
  MODEL_PRICING,
} from "@/lib/model-pricing";
export type { UsageStats, ModelPricing, TokenUsage, UsageCost } from "@/lib/model-pricing";