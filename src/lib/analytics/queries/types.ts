/**
 * Analytics Query Types
 *
 * Shared type definitions for all query modules.
 */

// =============================================================================
// Time Range
// =============================================================================

export interface TimeRange {
  /**
   * Days ago from now
   * - 0 = Today (since midnight UTC)
   * - 1 = Last 24 hours
   * - 7 = Last 7 days
   * - etc.
   */
  days: number;
}

/**
 * Get the SQL condition for a time range
 * @param range - Time range config
 * @param column - Column name (default: "timestamp")
 * @returns SQL WHERE clause fragment
 */
export function getTimeRangeCondition(range: TimeRange, column = "timestamp"): string {
  if (range.days === 0) {
    // Today = since midnight UTC
    return `${column} >= toStartOfDay(now())`;
  }
  return `${column} >= now() - INTERVAL ${range.days} DAY`;
}

/**
 * Get the ClickHouse date interval expression for a time range
 * This returns the raw SQL expression for use in queries
 * @param days - Number of days (0 = today)
 * @returns SQL date expression
 */
export function getClickHouseDateInterval(days: number): string {
  if (days === 0) {
    return "toStartOfDay(now())";
  }
  return `now() - INTERVAL ${days} DAY`;
}

// =============================================================================
// Traffic Types
// =============================================================================

export interface TrafficOverview {
  pageViews: number;
  uniqueSessions: number;
  /**
   * Sessions with real engagement: 2+ pageviews, any user action, or an
   * authenticated user. Bot-resistant — request-header forgery (spoofed UA +
   * sec-ch-ua) can inflate uniqueSessions but not engagement.
   */
  engagedSessions: number;
  uniqueUsers: number;
  botViews: number;
  avgSessionDuration: number;
  bounceRate: number;
}

export interface DailyTraffic {
  date: string;
  pageViews: number;
  sessions: number;
  users: number;
}

export interface DailyTrafficWithBots {
  date: string;
  humanViews: number;
  botViews: number;
}

export interface TopPage {
  path: string;
  pageType: string;
  views: number;
  uniqueVisitors: number;
  botViews: number;
}

export interface GeoDistribution {
  country: string;
  views: number;
  percentage: number;
}

export interface DeviceBreakdown {
  deviceType: string;
  count: number;
  percentage: number;
}

// =============================================================================
// AI Types
// =============================================================================

export interface AIUsageOverview {
  totalInvocations: number;
  totalCost: number;
  totalTokens: number;
  avgResponseTime: number;
  uniqueUsers: number;
}

export interface DailyAICost {
  date: string;
  invocations: number;
  tokens: number;
  cost: number;
}

export interface TopAIUser {
  userId: string;
  userName: string;
  isAuthenticated: boolean;
  invocations: number;
  cost: number;
  tokens: number;
}

export interface QueryTypeDistribution {
  queryType: string;
  count: number;
  percentage: number;
}

// =============================================================================
// Performance Types
// =============================================================================

export interface PerformanceMetrics {
  p75Lcp: number;
  p75Fcp: number;
  p75Ttfb: number;
  p75Cls: number;
  p75Inp: number | null;
  avgLcp: number;
}

export interface PerformanceByPageType {
  pageType: string;
  p75Lcp: number;
  p75Cls: number;
  p75Inp: number | null;
  sampleCount: number;
}

export interface PerformanceTrend {
  hour: string;
  avgLcp: number;
  avgFcp: number;
  avgTtfb: number;
}

// =============================================================================
// Error Types
// =============================================================================

export interface ErrorOverview {
  totalErrors: number;
  criticalErrors: number;
  highErrors: number;
  mediumErrors: number;
  lowErrors: number;
  affectedSessions: number;
}

export interface ErrorTrend {
  hour: string;
  errorSource: string;
  count: number;
}

export interface TopError {
  errorType: string;
  errorSource: string;
  count: number;
  lastSeen: string;
  sampleMessage: string;
}

export interface ErrorDetail {
  eventId: string;
  timestamp: string;
  sessionId: string;
  userId: string | null;
  country: string;
  userAgent: string;
  errorSource: string;
  errorType: string;
  errorMessage: string;
  errorStack: string | null;
  route: string | null;
  component: string | null;
  context: Record<string, unknown>;
  severity: string;
}

export interface ErrorOccurrence {
  timestamp: string;
  sessionId: string;
  country: string;
  route: string | null;
  severity: string;
}

// =============================================================================
// Lambda Types
// =============================================================================

export interface LambdaUsageOverview {
  totalInvocations: number;
  successfulInvocations: number;
  failedInvocations: number;
  avgDurationMs: number;
  p95DurationMs: number;
  estimatedCost: number;
}

export interface LambdaByFunction {
  functionName: string;
  invocations: number;
  successRate: number;
  avgDurationMs: number;
  estimatedCost: number;
}

export interface DailyLambdaUsage {
  date: string;
  invocations: number;
  avgDurationMs: number;
  estimatedCost: number;
}

// =============================================================================
// Cache Types
// =============================================================================

export interface CacheMetricsSnapshot {
  l1HitRate: number;
  l2HitRate: number;
  totalHits: number;
  totalMisses: number;
  memoryKeys: number;
  compressionSavings: number;
  fetchErrors: number;
}

// =============================================================================
// Content Types
// =============================================================================

export interface ContentPerformance {
  itemId: number;
  itemTitle: string;
  mediaType: string;
  views: number;
  uniqueVisitors: number;
}

export interface UserActionSummary {
  action: string;
  count: number;
  uniqueUsers: number;
}

export interface DailyUserAction {
  date: string;
  action: string;
  count: number;
}

// =============================================================================
// Embedding Types
// =============================================================================

export interface EmbeddingUsageOverview {
  totalCalls: number;
  totalTokens: number;
  estimatedCost: number;
  avgDurationMs: number;
  successfulCalls: number;
  failedCalls: number;
}

export interface DailyEmbeddingUsage {
  date: string;
  calls: number;
  tokens: number;
  estimatedCost: number;
  avgDurationMs: number;
}

export interface EmbeddingByType {
  inputType: string;
  calls: number;
  tokens: number;
  estimatedCost: number;
  percentage: number;
}

// =============================================================================
// Item-Specific Types
// =============================================================================

export interface ItemAnalytics {
  pageViews: number;
  uniqueVisitors: number;
  watchlistAdds: number;
  watchlistRemoves: number;
  ratingLikes: number;
  ratingDislikes: number;
  watchClicks: number;
  trailerPlays: number;
  lambdaInvocations: number;
  lambdaAvgDuration: number;
  lambdaLastInvoked: string | null;
  lambdaEstimatedCost: number;
}

export interface ItemLambdaHistory {
  functionName: string;
  timestamp: string;
  durationMs: number;
  statusCode: number;
  errorType: string | null;
}

export interface ItemBotStats {
  totalBotViews: number;
  topBots: Array<{ botType: string; count: number }>;
}

export interface ItemDeviceStats {
  mobile: number;
  desktop: number;
  tablet: number;
  other: number;
  total: number;
}

export interface ItemDailyTrend {
  date: string;
  views: number;
  uniqueVisitors: number;
}
