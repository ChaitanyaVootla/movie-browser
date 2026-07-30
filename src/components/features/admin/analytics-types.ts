/**
 * Shared Types for Analytics Dashboard
 *
 * Centralized type definitions used across all analytics tab components.
 */

// =============================================================================
// Overview Types
// =============================================================================

export interface AnalyticsOverview {
  traffic: TrafficMetrics | null;
  aiUsage: AIUsageMetrics | null;
  lambda: LambdaMetrics | null;
  embedding: EmbeddingMetrics | null;
  performance: PerformanceMetrics | null;
  errors: ErrorMetrics | null;
  cache: CacheMetrics | null;
  alerts: Alert[];
  checkedAt: string;
}

// =============================================================================
// Alert Types
// =============================================================================

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  message: string;
  value: number | string;
  threshold: number | string;
  detectedAt: string;
}

// =============================================================================
// Traffic Types
// =============================================================================

export interface TrafficMetrics {
  pageViews: number;
  uniqueSessions: number;
  /** Sessions with real engagement (2+ views, an action, or authed) — the bot-resistant human proxy. */
  engagedSessions?: number;
  uniqueUsers: number;
  botViews: number;
  /** Human visits (30-min inactivity gap) — the denominator for the two metrics below. */
  visits?: number;
  /** Mean seconds per human visit (first → last pageview). */
  avgSessionDuration: number;
  /** Share of human visits with a single pageview, 0–1. */
  bounceRate: number;
}

export interface TopUserAgent {
  userAgent: string;
  botType: string;
  views: number;
  percentage: number;
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
  botViews?: number;
}

export interface GeoData {
  country: string;
  views: number;
  percentage: number;
}

export interface DeviceData {
  deviceType: string;
  count: number;
  percentage: number;
}

export interface TrafficData {
  overview: TrafficMetrics | null;
  daily: Array<{
    date: string;
    pageViews: number;
    sessions: number;
    users: number;
  }>;
  dailyWithBots: DailyTrafficWithBots[];
  topPages: TopPage[];
  geo: GeoData[];
  devices: DeviceData[];
  topBots?: Array<{ botType: string; views: number; percentage: number }>;
  topUserAgents?: TopUserAgent[];
}

// =============================================================================
// Audience Types (three-way split — see src/lib/analytics/audience.ts)
// =============================================================================

export interface AudienceOverview {
  rawViews: number;
  verifiedCrawlerViews: number;
  botFleetViews: number;
  shedViews: number;
  behaviourallyFlaggedViews: number;
  humanViews: number;
  /** Upper bound: engaged sessions after fleet exclusion. */
  engagedHumanSessions: number;
  /** Hard floor: sessions that authenticated or performed a tracked action. */
  confirmedHumanSessions: number;
  authenticatedUsers: number;
  flaggedCohorts: number;
}

export interface AudienceTrendPoint {
  date: string;
  verifiedCrawlerViews: number;
  botFleetViews: number;
  humanViews: number;
  confirmedHumanViews: number;
  rawViews: number;
  shedViews: number;
}

export interface AudienceData {
  overview: AudienceOverview | null;
  trend: AudienceTrendPoint[];
  granularity: "hour" | "day";
}

export interface FleetCohort {
  userAgent: string;
  country: string;
  views: number;
  sessions: number;
  uniquePaths: number;
  viewsPerSession: number;
  pathRatio: number;
  jsBeaconShare: number;
  rules: string[];
  topPageType: string;
}

export interface ShedReasonStat {
  botType: string;
  label: string;
  views: number;
  uniquePaths: number;
}

export interface FleetTarget {
  key: string;
  views: number;
  uniquePaths: number;
}

export interface AbuseFlags {
  googleRefererViews: number;
  googleRefererSessions: number;
  noRefererViews: number;
  noBeaconSessions: number;
  humanPoolSessions: number;
}

export interface AbuseData {
  cohorts: FleetCohort[];
  flags: AbuseFlags | null;
  targets: FleetTarget[];
  shedReasons: ShedReasonStat[];
  servedBots: ShedReasonStat[];
}

export interface CrawlerStat {
  botType: string;
  label: string;
  views: number;
  uniquePaths: number;
  activeDays: number;
  topPageType: string;
}

export interface CrawlerTrendPoint {
  date: string;
  byCrawler: Record<string, number>;
}

export interface CrawlerData {
  crawlers: CrawlerStat[];
  trend: CrawlerTrendPoint[];
  granularity: "hour" | "day";
}

// =============================================================================
// AI Types
// =============================================================================

export interface AIUsageMetrics {
  totalInvocations: number;
  totalCost: number;
  totalTokens: number;
  avgResponseTime: number;
  uniqueUsers: number;
}

export interface TopAIUser {
  userId: string;
  userName: string;
  isAuthenticated: boolean;
  invocations: number;
  cost: number;
  tokens: number;
}

export interface QueryTypeData {
  queryType: string;
  count: number;
  percentage: number;
}

export interface DailyAICost {
  date: string;
  invocations: number;
  tokens: number;
  cost: number;
}

export interface AIData {
  overview: AIUsageMetrics;
  daily: DailyAICost[];
  topUsers: TopAIUser[];
  queryTypes: QueryTypeData[];
}

// =============================================================================
// Lambda Types
// =============================================================================

export interface LambdaMetrics {
  totalInvocations: number;
  successfulInvocations: number;
  failedInvocations: number;
  avgDurationMs: number;
  p95DurationMs: number;
  estimatedCost: number;
}

export interface LambdaFunction {
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

export interface LambdaData {
  overview: LambdaMetrics;
  byFunction: LambdaFunction[];
  daily: DailyLambdaUsage[];
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

// =============================================================================
// Error Types
// =============================================================================

export interface ErrorMetrics {
  totalErrors: number;
  criticalErrors: number;
  highErrors: number;
  mediumErrors: number;
  lowErrors: number;
  affectedSessions: number;
}

// =============================================================================
// Cache Types
// =============================================================================

export interface CacheMetrics {
  l1HitRate: number;
  l2HitRate: number;
  totalHits: number;
  totalMisses: number;
  memoryKeys: number;
  compressionSavings: number;
  fetchErrors: number;
}

export interface CacheNamespaceStat {
  files: number;
  sizeBytes: number;
}

export interface CacheSizeStats {
  [namespace: string]: CacheNamespaceStat;
}

export interface CacheData {
  metrics: CacheMetrics | null;
  sizeStats: CacheSizeStats;
}

// =============================================================================
// System Metrics Types
// =============================================================================

export interface CPUMetrics {
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
  cores: number;
  loadAvgRaw: [number, number, number];
}

export interface ProcessMemoryMetrics {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
  heapUsedPercent: number;
}

export interface SystemMemoryMetrics {
  total: number;
  free: number;
  used: number;
  usedPercent: number;
}

export interface EventLoopMetrics {
  lagMs: number;
  isHealthy: boolean;
}

export interface ProcessInfo {
  uptime: number;
  pid: number;
  nodeVersion: string;
  platform: string;
  arch: string;
}

export interface SystemMetricsData {
  cpu: CPUMetrics;
  processMemory: ProcessMemoryMetrics;
  systemMemory: SystemMemoryMetrics;
  eventLoop: EventLoopMetrics;
  process: ProcessInfo;
  collectedAt: string;
}

export interface SystemHealth {
  status: "healthy" | "warning" | "critical";
  issues: string[];
}

export interface SystemData {
  metrics: SystemMetricsData;
  health: SystemHealth;
}

// History data for correlation charts
export interface SystemMetricsHistoryPoint {
  timestamp: string;
  cpuUsage: number;
  loadAvg1m: number;
  memoryHeapUsed: number;
  memoryRss: number;
  systemUsedPct: number;
  eventLoopLag: number;
}

export interface SystemMetricsHistoryData {
  dataPoints: SystemMetricsHistoryPoint[];
  summary: {
    avgCpuUsage: number;
    maxCpuUsage: number;
    avgMemoryUsedPercent: number;
    maxMemoryUsedPercent: number;
    avgEventLoopLag: number;
    maxEventLoopLag: number;
  };
}

// Hourly traffic for correlation
export interface HourlyTrafficPoint {
  timestamp: string;
  pageViews: number;
  humanViews?: number;
  botViews?: number;
  sessions?: number;
}

// =============================================================================
// Fetch Functions Types
// =============================================================================

/**
 * Time range in days
 * 0 = Today (since midnight)
 * 1 = Last 24 hours
 * 7 = Last 7 days
 * 30 = Last 30 days
 * 90 = Last 90 days
 */
export type TimeRange = 0 | 1 | 7 | 30 | 90;

// =============================================================================
// Utility Types
// =============================================================================

export interface TabProps {
  range: TimeRange;
  isLoading?: boolean;
}

export type StatVariant = "default" | "destructive" | "warning";

/**
 * Analytics sub-tab identifiers for URL deep linking
 */
export type AnalyticsSubTab = "traffic" | "ai" | "lambda" | "costs" | "performance" | "system" | "database" | "query";

// =============================================================================
// Costs Types
// =============================================================================

export interface CostServiceBreakdown {
  cost: number;
  calls: number;
}

export interface DailyCostEntry {
  date: string;
  llmChat: number;
  llmSearchParsing: number;
  embedding: number;
  lambda: number;
  tavily: number;
  total: number;
}

export interface CostsData {
  llmChat: CostServiceBreakdown;
  llmSearchParsing: CostServiceBreakdown;
  embedding: CostServiceBreakdown;
  lambda: CostServiceBreakdown;
  tavily: CostServiceBreakdown & { credits: number };
  total: number;
  daily: DailyCostEntry[];
}

// =============================================================================
// Embedding Types (for overview)
// =============================================================================

export interface EmbeddingMetrics {
  totalCalls: number;
  totalTokens: number;
  estimatedCost: number;
}

// =============================================================================
// Database Stats Types
// =============================================================================

/**
 * Counts of items in PostgreSQL database
 */
export interface DatabaseCounts {
  movies: number;
  series: number;
  persons: number;
  episodes: number;
  videos: number;
  ratings: number;
}

/**
 * Counts from TMDB daily export files (available items)
 */
export interface TMDBAvailableCounts {
  movies: number;
  series: number;
  persons: number;
  exportDate: string | null; // Date of the export file
}

/**
 * Refresh activity stats for movies/series
 */
export interface RefreshStats {
  lastHour: number;
  last24Hours: number;
  last7Days: number;
  last30Days: number;
}

/**
 * Enrichment stats (ratings scraped, watch links scraped)
 */
export interface EnrichmentStats {
  moviesWithRatings: number;
  seriesWithRatings: number;
  moviesWithWatchLinks: number;
  seriesWithWatchLinks: number;
}

/**
 * Combined database stats
 */
export interface DatabaseStats {
  dbCounts: DatabaseCounts;
  tmdbCounts: TMDBAvailableCounts;
  movieRefresh: RefreshStats;
  seriesRefresh: RefreshStats;
  enrichment: EnrichmentStats;
  coverage: {
    moviesPercent: number;
    seriesPercent: number;
    personsPercent: number;
  };
}
