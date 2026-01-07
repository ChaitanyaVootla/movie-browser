/**
 * Analytics Query Functions
 *
 * Server-side queries for analytics dashboards.
 * All functions use the ClickHouse HTTP client.
 */

import { query } from "./client";

// =============================================================================
// Types
// =============================================================================

export interface TimeRange {
  /** Days ago from now (e.g., 7 = last 7 days) */
  days: number;
}

export interface TrafficOverview {
  pageViews: number;
  uniqueSessions: number;
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

export interface TopPage {
  path: string;
  pageType: string;
  views: number;
  uniqueVisitors: number;
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

export interface CacheMetricsSnapshot {
  l1HitRate: number;
  l2HitRate: number;
  totalHits: number;
  totalMisses: number;
  memoryKeys: number;
  compressionSavings: number;
  fetchErrors: number;
}

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

// =============================================================================
// Traffic Queries
// =============================================================================

/**
 * Get traffic overview metrics
 */
export async function getTrafficOverview(range: TimeRange): Promise<TrafficOverview> {
  const [result] = await query<{
    page_views: string;
    unique_sessions: string;
    unique_users: string;
    bot_views: string;
  }>(`
    SELECT 
      count() AS page_views,
      uniq(session_id) AS unique_sessions,
      uniqIf(user_id, user_id IS NOT NULL) AS unique_users,
      countIf(is_bot = 1) AS bot_views
    FROM page_views
    WHERE is_bot = 0 AND timestamp >= now() - INTERVAL ${range.days} DAY
  `);

  // Session metrics from sessions table
  const [sessionMetrics] = await query<{
    avg_duration: string;
    bounce_rate: string;
  }>(`
    SELECT 
      avg(duration_seconds) AS avg_duration,
      countIf(bounce = 1) / count() AS bounce_rate
    FROM sessions
    WHERE is_bot = 0 
      AND started_at >= now() - INTERVAL ${range.days} DAY
      AND duration_seconds > 0
  `);

  return {
    pageViews: parseInt(result?.page_views || "0", 10),
    uniqueSessions: parseInt(result?.unique_sessions || "0", 10),
    uniqueUsers: parseInt(result?.unique_users || "0", 10),
    botViews: parseInt(result?.bot_views || "0", 10),
    avgSessionDuration: parseFloat(sessionMetrics?.avg_duration || "0"),
    bounceRate: parseFloat(sessionMetrics?.bounce_rate || "0"),
  };
}

/**
 * Get daily traffic over time
 */
export async function getDailyTraffic(range: TimeRange): Promise<DailyTraffic[]> {
  const rows = await query<{
    date: string;
    page_views: string;
    sessions: string;
    users: string;
  }>(`
    SELECT 
      toDate(timestamp) AS date,
      count() AS page_views,
      uniq(session_id) AS sessions,
      uniqIf(user_id, user_id IS NOT NULL) AS users
    FROM page_views
    WHERE is_bot = 0 AND timestamp >= now() - INTERVAL ${range.days} DAY
    GROUP BY date
    ORDER BY date
  `);

  return rows.map((row) => ({
    date: row.date,
    pageViews: parseInt(row.page_views, 10),
    sessions: parseInt(row.sessions, 10),
    users: parseInt(row.users, 10),
  }));
}

/**
 * Get top pages by views
 */
export async function getTopPages(range: TimeRange, limit = 20): Promise<TopPage[]> {
  const rows = await query<{
    path: string;
    page_type: string;
    views: string;
    unique_visitors: string;
  }>(`
    SELECT 
      path,
      page_type,
      count() AS views,
      uniq(session_id) AS unique_visitors
    FROM page_views
    WHERE is_bot = 0 AND timestamp >= now() - INTERVAL ${range.days} DAY
    GROUP BY path, page_type
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    path: row.path,
    pageType: row.page_type,
    views: parseInt(row.views, 10),
    uniqueVisitors: parseInt(row.unique_visitors, 10),
  }));
}

/**
 * Get geographic distribution of traffic
 */
export async function getGeoDistribution(range: TimeRange, limit = 15): Promise<GeoDistribution[]> {
  const rows = await query<{
    country: string;
    views: string;
  }>(`
    SELECT 
      country,
      count() AS views
    FROM page_views
    WHERE is_bot = 0 AND timestamp >= now() - INTERVAL ${range.days} DAY
    GROUP BY country
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  const total = rows.reduce((sum, row) => sum + parseInt(row.views, 10), 0);

  return rows.map((row) => ({
    country: row.country,
    views: parseInt(row.views, 10),
    percentage: total > 0 ? (parseInt(row.views, 10) / total) * 100 : 0,
  }));
}

/**
 * Get device type breakdown
 */
export async function getDeviceBreakdown(range: TimeRange): Promise<DeviceBreakdown[]> {
  const rows = await query<{
    device_type: string;
    count: string;
  }>(`
    SELECT 
      device_type,
      count() AS count
    FROM page_views
    WHERE is_bot = 0 AND timestamp >= now() - INTERVAL ${range.days} DAY
    GROUP BY device_type
    ORDER BY count DESC
  `);

  const total = rows.reduce((sum, row) => sum + parseInt(row.count, 10), 0);

  return rows.map((row) => ({
    deviceType: row.device_type,
    count: parseInt(row.count, 10),
    percentage: total > 0 ? (parseInt(row.count, 10) / total) * 100 : 0,
  }));
}

// =============================================================================
// AI Usage Queries
// =============================================================================

/**
 * Get AI usage overview
 */
export async function getAIUsageOverview(range: TimeRange): Promise<AIUsageOverview> {
  const [result] = await query<{
    total_invocations: string;
    total_cost: string;
    total_tokens: string;
    avg_response_time: string;
    unique_users: string;
  }>(`
    SELECT 
      count() AS total_invocations,
      sum(total_cost) AS total_cost,
      sum(total_tokens) AS total_tokens,
      avg(duration_ms) AS avg_response_time,
      uniqIf(user_id, user_id IS NOT NULL) + countIf(user_id IS NULL) AS unique_users
    FROM ai_usage
    WHERE timestamp >= now() - INTERVAL ${range.days} DAY
  `);

  return {
    totalInvocations: parseInt(result?.total_invocations || "0", 10),
    totalCost: parseFloat(result?.total_cost || "0"),
    totalTokens: parseInt(result?.total_tokens || "0", 10),
    avgResponseTime: parseFloat(result?.avg_response_time || "0"),
    uniqueUsers: parseInt(result?.unique_users || "0", 10),
  };
}

/**
 * Get daily AI costs over time
 */
export async function getDailyAICosts(range: TimeRange): Promise<DailyAICost[]> {
  const rows = await query<{
    date: string;
    invocations: string;
    tokens: string;
    cost: string;
  }>(`
    SELECT 
      toDate(timestamp) AS date,
      count() AS invocations,
      sum(total_tokens) AS tokens,
      sum(total_cost) AS cost
    FROM ai_usage
    WHERE timestamp >= now() - INTERVAL ${range.days} DAY
    GROUP BY date
    ORDER BY date
  `);

  return rows.map((row) => ({
    date: row.date,
    invocations: parseInt(row.invocations, 10),
    tokens: parseInt(row.tokens, 10),
    cost: parseFloat(row.cost),
  }));
}

/**
 * Get top AI users by cost
 */
export async function getTopAIUsers(range: TimeRange, limit = 10): Promise<TopAIUser[]> {
  const rows = await query<{
    user_id: string;
    is_authenticated: string;
    invocations: string;
    cost: string;
    tokens: string;
  }>(`
    SELECT 
      coalesce(user_id, session_id) AS user_id,
      max(is_authenticated) AS is_authenticated,
      count() AS invocations,
      sum(total_cost) AS cost,
      sum(total_tokens) AS tokens
    FROM ai_usage
    WHERE timestamp >= now() - INTERVAL ${range.days} DAY
    GROUP BY user_id
    ORDER BY cost DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    userId: row.user_id,
    isAuthenticated: row.is_authenticated === "1",
    invocations: parseInt(row.invocations, 10),
    cost: parseFloat(row.cost),
    tokens: parseInt(row.tokens, 10),
  }));
}

/**
 * Get query type distribution
 */
export async function getQueryTypeDistribution(range: TimeRange): Promise<QueryTypeDistribution[]> {
  const rows = await query<{
    query_type: string;
    count: string;
  }>(`
    SELECT 
      query_type,
      count() AS count
    FROM ai_usage
    WHERE timestamp >= now() - INTERVAL ${range.days} DAY
    GROUP BY query_type
    ORDER BY count DESC
  `);

  const total = rows.reduce((sum, row) => sum + parseInt(row.count, 10), 0);

  return rows.map((row) => ({
    queryType: row.query_type,
    count: parseInt(row.count, 10),
    percentage: total > 0 ? (parseInt(row.count, 10) / total) * 100 : 0,
  }));
}

// =============================================================================
// Performance Queries
// =============================================================================

/**
 * Get overall performance metrics (Core Web Vitals)
 */
export async function getPerformanceMetrics(range: TimeRange): Promise<PerformanceMetrics> {
  const [result] = await query<{
    p75_lcp: string;
    p75_fcp: string;
    p75_ttfb: string;
    p75_cls: string;
    p75_inp: string;
    avg_lcp: string;
  }>(`
    SELECT 
      quantile(0.75)(lcp) AS p75_lcp,
      quantile(0.75)(fcp) AS p75_fcp,
      quantile(0.75)(ttfb) AS p75_ttfb,
      quantile(0.75)(cls) AS p75_cls,
      quantile(0.75)(inp) AS p75_inp,
      avg(lcp) AS avg_lcp
    FROM performance
    WHERE timestamp >= now() - INTERVAL ${range.days} DAY
  `);

  return {
    p75Lcp: parseFloat(result?.p75_lcp || "0"),
    p75Fcp: parseFloat(result?.p75_fcp || "0"),
    p75Ttfb: parseFloat(result?.p75_ttfb || "0"),
    p75Cls: parseFloat(result?.p75_cls || "0"),
    p75Inp: result?.p75_inp ? parseFloat(result.p75_inp) : null,
    avgLcp: parseFloat(result?.avg_lcp || "0"),
  };
}

/**
 * Get performance by page type
 */
export async function getPerformanceByPageType(range: TimeRange): Promise<PerformanceByPageType[]> {
  const rows = await query<{
    page_type: string;
    p75_lcp: string;
    p75_cls: string;
    p75_inp: string;
    sample_count: string;
  }>(`
    SELECT 
      page_type,
      quantile(0.75)(lcp) AS p75_lcp,
      quantile(0.75)(cls) AS p75_cls,
      quantile(0.75)(inp) AS p75_inp,
      count() AS sample_count
    FROM performance
    WHERE timestamp >= now() - INTERVAL ${range.days} DAY
    GROUP BY page_type
    ORDER BY sample_count DESC
  `);

  return rows.map((row) => ({
    pageType: row.page_type,
    p75Lcp: parseFloat(row.p75_lcp),
    p75Cls: parseFloat(row.p75_cls),
    p75Inp: row.p75_inp ? parseFloat(row.p75_inp) : null,
    sampleCount: parseInt(row.sample_count, 10),
  }));
}

/**
 * Get performance trend (last 24 hours, hourly)
 */
export async function getPerformanceTrend(hours = 24): Promise<PerformanceTrend[]> {
  const rows = await query<{
    hour: string;
    avg_lcp: string;
    avg_fcp: string;
    avg_ttfb: string;
  }>(`
    SELECT 
      toStartOfHour(timestamp) AS hour,
      avg(lcp) AS avg_lcp,
      avg(fcp) AS avg_fcp,
      avg(ttfb) AS avg_ttfb
    FROM performance
    WHERE timestamp >= now() - INTERVAL ${hours} HOUR
    GROUP BY hour
    ORDER BY hour
  `);

  return rows.map((row) => ({
    hour: row.hour,
    avgLcp: parseFloat(row.avg_lcp),
    avgFcp: parseFloat(row.avg_fcp),
    avgTtfb: parseFloat(row.avg_ttfb),
  }));
}

// =============================================================================
// Error Queries
// =============================================================================

/**
 * Get error overview
 */
export async function getErrorOverview(range: TimeRange): Promise<ErrorOverview> {
  const [result] = await query<{
    total_errors: string;
    critical_errors: string;
    high_errors: string;
    medium_errors: string;
    low_errors: string;
    affected_sessions: string;
  }>(`
    SELECT 
      count() AS total_errors,
      countIf(severity = 'critical') AS critical_errors,
      countIf(severity = 'high') AS high_errors,
      countIf(severity = 'medium') AS medium_errors,
      countIf(severity = 'low') AS low_errors,
      uniq(session_id) AS affected_sessions
    FROM errors
    WHERE timestamp >= now() - INTERVAL ${range.days} DAY
  `);

  return {
    totalErrors: parseInt(result?.total_errors || "0", 10),
    criticalErrors: parseInt(result?.critical_errors || "0", 10),
    highErrors: parseInt(result?.high_errors || "0", 10),
    mediumErrors: parseInt(result?.medium_errors || "0", 10),
    lowErrors: parseInt(result?.low_errors || "0", 10),
    affectedSessions: parseInt(result?.affected_sessions || "0", 10),
  };
}

/**
 * Get error trend (last 24 hours, hourly)
 */
export async function getErrorTrend(hours = 24): Promise<ErrorTrend[]> {
  const rows = await query<{
    hour: string;
    error_source: string;
    count: string;
  }>(`
    SELECT 
      toStartOfHour(timestamp) AS hour,
      error_source,
      count() AS count
    FROM errors
    WHERE timestamp >= now() - INTERVAL ${hours} HOUR
    GROUP BY hour, error_source
    ORDER BY hour, error_source
  `);

  return rows.map((row) => ({
    hour: row.hour,
    errorSource: row.error_source,
    count: parseInt(row.count, 10),
  }));
}

/**
 * Get top errors by frequency
 */
export async function getTopErrors(range: TimeRange, limit = 20): Promise<TopError[]> {
  const rows = await query<{
    error_type: string;
    error_source: string;
    count: string;
    last_seen: string;
    sample_message: string;
  }>(`
    SELECT 
      error_type,
      error_source,
      count() AS count,
      max(timestamp) AS last_seen,
      any(error_message) AS sample_message
    FROM errors
    WHERE timestamp >= now() - INTERVAL ${range.days} DAY
    GROUP BY error_type, error_source
    ORDER BY count DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    errorType: row.error_type,
    errorSource: row.error_source,
    count: parseInt(row.count, 10),
    lastSeen: row.last_seen,
    sampleMessage: row.sample_message,
  }));
}

// =============================================================================
// Cache Metrics Queries
// =============================================================================

/**
 * Get latest cache metrics snapshot
 */
export async function getCacheMetricsSnapshot(): Promise<CacheMetricsSnapshot | null> {
  const rows = await query<{
    l1_hit_rate: string;
    l2_hit_rate: string;
    l1_hits: string;
    l2_hits: string;
    l1_misses: string;
    l2_misses: string;
    memory_keys: string;
    compression_savings_bytes: string;
    fetch_errors: string;
  }>(`
    SELECT 
      l1_hit_rate,
      l2_hit_rate,
      l1_hits,
      l2_hits,
      l1_misses,
      l2_misses,
      memory_keys,
      compression_savings_bytes,
      fetch_errors
    FROM cache_metrics
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    l1HitRate: parseFloat(row.l1_hit_rate) * 100,
    l2HitRate: parseFloat(row.l2_hit_rate) * 100,
    totalHits: parseInt(row.l1_hits, 10) + parseInt(row.l2_hits, 10),
    totalMisses: parseInt(row.l1_misses, 10) + parseInt(row.l2_misses, 10),
    memoryKeys: parseInt(row.memory_keys, 10),
    compressionSavings: parseInt(row.compression_savings_bytes, 10),
    fetchErrors: parseInt(row.fetch_errors, 10),
  };
}

// =============================================================================
// Content Performance Queries
// =============================================================================

/**
 * Get top performing content
 */
export async function getTopContent(
  range: TimeRange,
  mediaType?: "movie" | "series",
  limit = 20
): Promise<ContentPerformance[]> {
  const mediaFilter = mediaType ? `AND item_media_type = '${mediaType}'` : "";

  const rows = await query<{
    item_id: string;
    item_title: string;
    item_media_type: string;
    views: string;
    unique_visitors: string;
  }>(`
    SELECT 
      item_id,
      any(item_title) AS item_title,
      any(item_media_type) AS item_media_type,
      count() AS views,
      uniq(session_id) AS unique_visitors
    FROM page_views
    WHERE 
      is_bot = 0 
      AND item_id IS NOT NULL 
      AND timestamp >= now() - INTERVAL ${range.days} DAY
      ${mediaFilter}
    GROUP BY item_id
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    itemId: parseInt(row.item_id, 10),
    itemTitle: row.item_title || `ID: ${row.item_id}`,
    mediaType: row.item_media_type,
    views: parseInt(row.views, 10),
    uniqueVisitors: parseInt(row.unique_visitors, 10),
  }));
}

// =============================================================================
// User Action Queries
// =============================================================================

/**
 * Get user action summary
 */
export async function getUserActionSummary(range: TimeRange): Promise<UserActionSummary[]> {
  const rows = await query<{
    action: string;
    count: string;
    unique_users: string;
  }>(`
    SELECT 
      action,
      count() AS count,
      uniqIf(user_id, user_id IS NOT NULL) AS unique_users
    FROM user_actions
    WHERE is_bot = 0 AND timestamp >= now() - INTERVAL ${range.days} DAY
    GROUP BY action
    ORDER BY count DESC
  `);

  return rows.map((row) => ({
    action: row.action,
    count: parseInt(row.count, 10),
    uniqueUsers: parseInt(row.unique_users, 10),
  }));
}

// =============================================================================
// Utility: Check if analytics is available
// =============================================================================

/**
 * Check if ClickHouse has data
 */
export async function hasAnalyticsData(): Promise<boolean> {
  try {
    const [result] = await query<{ count: string }>(
      "SELECT count() AS count FROM page_views LIMIT 1"
    );
    return parseInt(result?.count || "0", 10) > 0;
  } catch {
    return false;
  }
}

