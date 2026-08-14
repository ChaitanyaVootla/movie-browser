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

// Audience queries (three-way honest split: crawlers / bots+fleets / humans)
export {
  getAudienceOverview,
  getAudienceTrend,
  getFleetCohorts,
  getShedReasons,
  getFleetTargets,
  getAbuseFlags,
  getVerifiedCrawlers,
  getCrawlerTrend,
  getServedBotTypes,
  getCountryDeviceMix,
  getSessionPacingFlags,
  type AudienceGranularity,
  type AudienceOverview,
  type AudienceTrendPoint,
  type FleetCohort,
  type ShedReasonStat,
  type FleetTarget,
  type AbuseFlags,
  type CrawlerStat,
  type CrawlerTrendPoint,
  type CountryDeviceMix,
  type SessionPacingFlag,
} from "./audience";

// Agent-layer queries (.md twins + llms.txt consumption)
export {
  getLlmLayerOverview,
  getLlmLayerTrend,
  getLlmLayerConsumers,
  getLlmLayerTargets,
  LLM_LAYER_SQL,
  LLM_MD_SQL,
  type LlmSurface,
  type LlmLayerOverview,
  type LlmLayerTrendPoint,
  type LlmConsumer,
  type LlmTargetStat,
  type LlmLayerData,
} from "./llm-layer";

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

// Product queries (confirmed-human-scoped conversion / engagement)
export {
  getProductOverview,
  getTitleConversion,
  getTopTitles,
  getHumanPerformanceByPageType,
  conversionRate,
  actingSessionSql,
  confirmedHumanViewerSql,
  CONVERSION_ACTIONS,
  type ProductOverview,
  type TitleConversion,
  type TopTitle,
  type HumanPageTypePerformance,
} from "./product";

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
