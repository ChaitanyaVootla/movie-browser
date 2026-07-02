/**
 * Analytics Queries
 *
 * Re-exports all query functions for convenience.
 * This allows importing from '@/lib/analytics/queries' or '@/lib/analytics'.
 */

// Types and helpers
export * from "./types";

// Traffic queries
export {
  getTrafficOverview,
  getDailyTraffic,
  getDailyTrafficWithBots,
  getHourlyTraffic,
  getHourlyTrafficWithBots,
  getTrafficTrend,
  getTrafficWithBotsTrend,
  getTopPages,
  getGeoDistribution,
  getDeviceBreakdown,
  getTopBotSources,
  getTopUserAgents,
  type TrafficGranularity,
  type HourlyTraffic,
  type HourlyTrafficWithBots,
  type BotSource,
} from "./traffic";

// AI usage queries
export {
  getAIUsageOverview,
  getDailyAICosts,
  getTopAIUsers,
  getQueryTypeDistribution,
  getUserAIStats,
  type UserAIStats,
} from "./ai";

// Performance queries
export {
  getPerformanceMetrics,
  getPerformanceByPageType,
  getPerformanceTrend,
} from "./performance";

// Error queries
export {
  getErrorOverview,
  getErrorTrend,
  getTopErrors,
  getErrorDetails,
  getErrorOccurrences,
} from "./errors";

// Lambda queries
export {
  getLambdaUsageOverview,
  getLambdaByFunction,
  getDailyLambdaUsage,
  estimateLambdaCost,
} from "./lambda";

// Item-specific queries
export {
  getItemAnalytics,
  getItemLambdaHistory,
  getItemBotStats,
  getItemDeviceStats,
  getItemDailyTrend,
} from "./item";

// Content queries
export { getTopContent, getUserActionSummary, getDailyUserActions, getCacheMetricsSnapshot } from "./content";

// Embedding queries
export {
  getEmbeddingUsageOverview,
  getDailyEmbeddingUsage,
  getEmbeddingByType,
} from "./embedding";

// Cost queries
export {
  getUnifiedCostBreakdown,
  type ServiceCost,
  type DailyCostBreakdown,
  type UnifiedCostBreakdown,
} from "./costs";

// Utility queries
export { hasAnalyticsData, getTableCounts, getDatabaseSize } from "./utils";

// System metrics queries
export {
  getSystemMetricsHistory,
  getCPUHistory,
  getMemoryHistory,
  type SystemMetricsDataPoint,
  type SystemMetricsHistory,
  type Granularity,
} from "./system";

// Database stats queries
export {
  getDatabaseCounts,
  getTMDBAvailableCounts,
  getMovieRefreshStats,
  getSeriesRefreshStats,
  getEnrichmentStats,
  getDatabaseStats,
} from "./database";

// Re-export checkClickHouseHealth from client for consistency
export { checkClickHouseHealth } from "../client";
