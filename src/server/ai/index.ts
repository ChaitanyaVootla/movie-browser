/**
 * AI Agent Module
 *
 * Main exports for the movie recommendation AI agent.
 *
 * Tool consolidation (14 → 8 tools):
 * - get_details: Merged movie/series details + videos + related
 * - smart_discover: Unified discovery + semantic + similar + user watchlist (via fromWatchlist flag)
 * - search: Renamed from search_movies
 *
 * REMOVED: get_user_data - was inefficient (returned IDs without titles)
 */

// Agent
export {
  createMovieAgent,
  invokeAgent,
  streamAgent,
  getAgentResponse,
  extractNavigation,
  clearThread,
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
  smartDiscoverTool,
  getTrendingTool,
  navigateTool,
  // Detail tools
  getDetailsTool,
  getPersonTool,
  getUpcomingTool,
  // Context
  getPageContextTool,
  // Legacy aliases
  getMovieDetailsTool,
  getSeriesDetailsTool,
} from "./tools";

// Providers
export { createChatModel, getAIProvider, getCurrentModelId as getProviderModelId } from "./provider";
export type { AIProvider } from "./provider";

// Bedrock (direct access if needed)
export { createBedrockChat, createBedrockChatWithTools } from "./bedrock";

// OpenRouter (direct access if needed)
export { createOpenRouterChat, createOpenRouterChatWithTools, getOpenRouterModelId } from "./openrouter";

// Prompts
export { getSystemPrompt, SYSTEM_PROMPT } from "./prompts/system";

// Media tag resolution (server-side)
export { resolveMediaTags, parseAndResolveContent, needsResolution } from "./resolve-media-tags";

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
