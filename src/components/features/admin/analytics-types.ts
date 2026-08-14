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
  /** Views excluded because the traffic declared itself or was provably forged. */
  excludedDeclaredViews: number;
  /** Views excluded by behavioural cohort scoring. */
  excludedHeuristicViews: number;
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

export interface CountryDeviceMix {
  country: string;
  sessions: number;
  views: number;
  pctMobile: number;
  baselinePctMobile: number | null;
  anomalous: boolean;
}

export interface SessionPacingFlag {
  rule: string;
  description: string;
  sessions: number;
  views: number;
  confirmedHumansHit: number;
  confirmedHumansTotal: number;
}

export interface AbuseData {
  cohorts: FleetCohort[];
  flags: AbuseFlags | null;
  targets: FleetTarget[];
  shedReasons: ShedReasonStat[];
  servedBots: ShedReasonStat[];
  deviceMix: CountryDeviceMix[];
  pacing: SessionPacingFlag[];
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
// Agent-layer Types (.md twins + llms.txt) — mirror of src/lib/analytics/
// queries/llm-layer.ts. Kept as a client-side declaration rather than imported
// so the admin bundle does not pull the ClickHouse client in.
// =============================================================================

export interface LlmLayerOverview {
  mdRequests: number;
  mdUniquePaths: number;
  mdSessions: number;
  llmsTxtRequests: number;
  llmsTxtSessions: number;
  botRequests: number;
  distinctAgents: number;
  requestsPerPath: number;
}

export interface LlmLayerTrendPoint {
  date: string;
  mdRequests: number;
  mdUniquePaths: number;
  llmsTxtRequests: number;
}

export interface LlmConsumer {
  userAgent: string;
  botType: string;
  requests: number;
  uniquePaths: number;
  sessions: number;
  usedIndex: boolean;
  topTarget: string;
  activeDays: number;
}

export interface LlmTargetStat {
  target: string;
  requests: number;
  uniquePaths: number;
}

export interface LlmLayerData {
  overview: LlmLayerOverview;
  trend: LlmLayerTrendPoint[];
  consumers: LlmConsumer[];
  targets: LlmTargetStat[];
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
// Product Types
// =============================================================================

/**
 * Shapes returned by `GET /api/admin/analytics?type=product`.
 *
 * Deliberately DUPLICATED from `src/lib/analytics/queries/product.ts` rather than
 * imported, matching every other block in this file: importing the server module
 * from a `"use client"` tree would pull the ClickHouse client into the bundle.
 * Note `TimeRange` is a plain number on the client but `{ days }` on the server.
 *
 * Every count here is scoped to the spec's confirmed-human floor (a session that
 * is authenticated OR performed a tracked action) — NOT to raw `page_views`,
 * which the residential-proxy fleet inflates by minting a `session_id` per IP.
 * The panel prints that caveat; do not present these as total traffic.
 */
export interface ProductOverview {
  confirmedSessions: number;
  confirmedViews: number;
  confirmedItemViews: number;
  authedViews: number;
  totalActions: number;
  actingSessions: number;
  actingUsers: number;
  titlesActedOn: number;
}

export interface TitleConversion {
  itemId: number;
  title: string;
  mediaType: string;
  views: number;
  visitors: number;
  actingSessions: number;
  totalActions: number;
  watchlistAdds: number;
  watchlistRemoves: number;
  ratingLikes: number;
  ratingDislikes: number;
  watchClicks: number;
  trailerPlays: number;
}

export interface TopTitle {
  itemId: number;
  title: string;
  mediaType: string;
  views: number;
  visitors: number;
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

/** All web-vitals beacons for a page type — fleet-contaminated (see below). */
export interface PerformanceByPageType {
  pageType: string;
  p75Lcp: number;
  p75Cls: number;
  p75Inp: number | null;
  sampleCount: number;
}

/**
 * The same vitals restricted to confirmed-human sessions. The live `performance`
 * table has no `is_bot` column and the fleet executes JS, so the unrestricted
 * numbers are ~3-4x worse than what people actually experience.
 */
export interface HumanPageTypePerformance {
  pageType: string;
  samples: number;
  p75Lcp: number;
  p75Cls: number;
  p75Ttfb: number;
  p75Inp: number | null;
}

export interface PerformanceTrendPoint {
  hour: string;
  avgLcp: number;
  avgFcp: number;
  avgTtfb: number;
}

/**
 * The Product tab is split into three independently-fetched panels
 * (`?type=product&panel=…`) so opening the tab does not pay for the expensive
 * ones. `titles` costs two full `page_views` scans; `engagement` costs one;
 * `speed` only touches the small `performance` table.
 */
export type ProductPanel = "engagement" | "titles" | "speed";

export interface ProductEngagementData {
  overview: ProductOverview;
  actions: UserActionSummary[];
  dailyActions: DailyUserAction[];
}

export interface ProductTitlesData {
  conversion: TitleConversion[];
  topTitles: TopTitle[];
}

export interface ProductSpeedData {
  perfByPageType: PerformanceByPageType[];
  humanPerfByPageType: HumanPageTypePerformance[];
  perfTrend: PerformanceTrendPoint[];
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
export type AnalyticsSubTab = "traffic" | "product" | "ai" | "lambda" | "costs" | "performance" | "system" | "database" | "query";

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
