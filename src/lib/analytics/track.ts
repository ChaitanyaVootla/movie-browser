/**
 * Analytics Tracking Functions
 *
 * High-level functions for tracking analytics events.
 * These are the primary API for instrumenting the application.
 *
 * Admin Filtering:
 * - Admin traffic is excluded from user-facing analytics (page views, actions, performance)
 * - System metrics (cache, errors, AI usage) are still tracked for operational visibility
 */

import { insertAnalyticsEvent, queueEvent } from "./client";

/**
 * Convert to ClickHouse-compatible timestamp format (YYYY-MM-DD HH:MM:SS.mmm)
 */
function toClickHouseTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

/**
 * Check if tracking should be skipped for admin users
 * Admin traffic pollutes analytics with internal testing/dev activity
 * Set TRACK_ADMIN_ANALYTICS=true to track admin traffic (for development/testing)
 */
function shouldSkipForAdmin(context: { is_admin?: boolean }): boolean {
  if (process.env.TRACK_ADMIN_ANALYTICS === "true") {
    return false; // Track admin traffic when explicitly enabled
  }
  return context.is_admin === true;
}

import type {
  PageViewEvent,
  SessionEvent,
  AIUsageEvent,
  UserActionEvent,
  APICallEvent,
  ErrorEvent,
  PerformanceEvent,
  CacheMetricsEvent,
  PageType,
  ActionType,
  QueryType,
  ErrorSeverity,
  ErrorSource,
  DeviceType,
  TrackingContext,
} from "./types";

// =============================================================================
// Page View Tracking
// =============================================================================

interface TrackPageViewOptions {
  path: string;
  pageType: PageType;
  itemId?: number | null;
  itemTitle?: string | null;
  itemMediaType?: "movie" | "series" | "person" | null;
  previousPath?: string | null;
  entryPage?: boolean;
  /** Core Web Vitals (optional, sent later via performance event) */
  ttfb?: number | null;
  fcp?: number | null;
  lcp?: number | null;
  cls?: number | null;
  fid?: number | null;
  loadTime?: number | null;
}

/**
 * Track a page view event
 * Note: Skipped for admin users to avoid polluting analytics
 */
export function trackPageView(context: TrackingContext, options: TrackPageViewOptions): void {
  // Skip admin traffic
  if (shouldSkipForAdmin(context)) {
    return;
  }

  const event: Partial<PageViewEvent> = {
    event_type: "page_view",
    timestamp: context.timestamp,
    session_id: context.session_id,
    user_id: context.user_id,
    is_authenticated: context.is_authenticated,
    country: context.country,
    city: context.city,
    user_agent: context.user_agent,
    device_type: context.device_type,
    browser: context.browser,
    os: context.os,
    is_bot: context.is_bot,
    bot_type: context.bot_type,
    referer: context.referer,
    request_id: context.request_id,
    path: options.path,
    page_type: options.pageType,
    item_id: options.itemId ?? null,
    item_title: options.itemTitle ?? null,
    item_media_type: options.itemMediaType ?? null,
    previous_path: options.previousPath ?? null,
    entry_page: options.entryPage ?? false,
    ttfb: options.ttfb ?? null,
    fcp: options.fcp ?? null,
    lcp: options.lcp ?? null,
    cls: options.cls ?? null,
    fid: options.fid ?? null,
    load_time: options.loadTime ?? null,
  };

  // Queue for batched insertion (high volume)
  queueEvent("page_views", event as Record<string, unknown>);
}

// =============================================================================
// Session Tracking
// =============================================================================

interface TrackSessionStartOptions {
  entryPath: string;
  entryPageType: PageType;
}

/**
 * Track session start
 * Note: Skipped for admin users to avoid polluting analytics
 */
export function trackSessionStart(
  context: TrackingContext,
  options: TrackSessionStartOptions
): void {
  // Skip admin traffic
  if (shouldSkipForAdmin(context)) {
    return;
  }

  const event: Partial<SessionEvent> = {
    event_type: "session_start",
    session_id: context.session_id,
    user_id: context.user_id,
    is_authenticated: context.is_authenticated,
    country: context.country,
    device_type: context.device_type,
    browser: context.browser,
    os: context.os,
    is_bot: context.is_bot,
    entry_path: options.entryPath,
    entry_page_type: options.entryPageType,
    pages_visited: [options.entryPageType],
    bounce: true, // Assume bounce until proven otherwise
  };

  queueEvent("sessions", event as Record<string, unknown>);
}

interface TrackSessionEndOptions {
  entryPath: string;
  entryPageType: PageType;
  exitPath: string;
  exitPageType: PageType;
  durationSeconds: number;
  pageCount: number;
  actionsCount: number;
  pagesVisited: PageType[];
  bounce: boolean;
}

/**
 * Track session end
 * Note: Skipped for admin users to avoid polluting analytics
 */
export function trackSessionEnd(context: TrackingContext, options: TrackSessionEndOptions): void {
  // Skip admin traffic
  if (shouldSkipForAdmin(context)) {
    return;
  }

  const event: Partial<SessionEvent> = {
    event_type: "session_end",
    session_id: context.session_id,
    user_id: context.user_id,
    is_authenticated: context.is_authenticated,
    country: context.country,
    device_type: context.device_type,
    browser: context.browser,
    os: context.os,
    is_bot: context.is_bot,
    entry_path: options.entryPath,
    entry_page_type: options.entryPageType,
    exit_path: options.exitPath,
    exit_page_type: options.exitPageType,
    duration_seconds: options.durationSeconds,
    page_count: options.pageCount,
    actions_count: options.actionsCount,
    pages_visited: options.pagesVisited,
    bounce: options.bounce,
  };

  queueEvent("sessions", event as Record<string, unknown>);
}

// =============================================================================
// AI Usage Tracking
// =============================================================================

interface TrackAIUsageOptions {
  sessionId: string;
  userId: string | null;
  /** User display name for easier identification in dashboards */
  userName?: string;
  isAuthenticated: boolean;
  country: string;
  query: string;
  queryType: QueryType;
  hasPageContext: boolean;
  pageContextType?: PageType | null;
  pageContextId?: number | null;
  modelId: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  turns: number;
  toolCalls: string[];
  durationMs: number;
  hadToolRecovery: boolean;
  responseLength: number;
}

/**
 * Track AI agent usage and costs
 */
export function trackAIUsage(options: TrackAIUsageOptions): void {
  const event: Partial<AIUsageEvent> = {
    event_type: "ai_usage",
    timestamp: toClickHouseTimestamp(),
    session_id: options.sessionId,
    user_id: options.userId,
    user_name: options.userName || (options.isAuthenticated ? "Unknown" : "Guest"),
    is_authenticated: options.isAuthenticated,
    country: options.country,
    query: options.query.slice(0, 500), // Truncate long queries
    query_type: options.queryType,
    has_page_context: options.hasPageContext,
    page_context_type: options.pageContextType ?? null,
    page_context_id: options.pageContextId ?? null,
    model_id: options.modelId,
    model_name: options.modelName,
    input_tokens: options.inputTokens,
    output_tokens: options.outputTokens,
    total_tokens: options.totalTokens,
    input_cost: options.inputCost,
    output_cost: options.outputCost,
    total_cost: options.totalCost,
    turns: options.turns,
    tool_calls: options.toolCalls,
    duration_ms: options.durationMs,
    had_tool_recovery: options.hadToolRecovery,
    response_length: options.responseLength,
  };

  // Insert immediately (low volume, important data)
  insertAnalyticsEvent("ai_usage", event);
}

// =============================================================================
// User Action Tracking
// =============================================================================

interface TrackUserActionOptions {
  sessionId: string;
  userId: string | null;
  isAuthenticated: boolean;
  isAdmin?: boolean;
  country: string;
  isBot: boolean;
  action: ActionType;
  mediaType?: "movie" | "series" | null;
  itemId?: number | null;
  itemTitle?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Track user actions (watchlist, ratings, clicks, etc.)
 * Note: Skipped for admin users to avoid polluting analytics
 */
export function trackUserAction(options: TrackUserActionOptions): void {
  // Skip admin traffic
  if (shouldSkipForAdmin({ is_admin: options.isAdmin })) {
    return;
  }

  const event: Partial<UserActionEvent> = {
    event_type: "user_action",
    session_id: options.sessionId,
    user_id: options.userId,
    is_authenticated: options.isAuthenticated,
    country: options.country,
    is_bot: options.isBot,
    action: options.action,
    media_type: options.mediaType ?? null,
    item_id: options.itemId ?? null,
    item_title: options.itemTitle ?? null,
    metadata: options.metadata ?? {},
  };

  queueEvent("user_actions", event as Record<string, unknown>);
}

// =============================================================================
// API Call Tracking
// =============================================================================

interface TrackAPICallOptions {
  sessionId?: string;
  requestId?: string;
  service: "tmdb" | "youtube" | "mongodb" | "lambda";
  endpoint: string;
  method?: string;
  statusCode: number;
  durationMs: number;
  responseSize?: number;
  cached?: boolean;
  cacheHit?: "l1" | "l2" | "stale" | "miss" | null;
  quotaCost?: number | null;
  errorType?: string | null;
  errorMessage?: string | null;
}

/**
 * Track external API calls (TMDB, YouTube, MongoDB, Lambda)
 *
 * Lambda calls are inserted immediately (low volume, important for debugging).
 * Other API calls are batched for efficiency.
 */
export function trackAPICall(options: TrackAPICallOptions): void {
  const event: Partial<APICallEvent> = {
    event_type: "api_call",
    timestamp: toClickHouseTimestamp(),
    session_id: options.sessionId ?? "",
    request_id: options.requestId ?? "",
    service: options.service,
    endpoint: options.endpoint,
    method: options.method ?? "GET",
    status_code: options.statusCode,
    duration_ms: options.durationMs,
    response_size: options.responseSize ?? 0,
    cached: options.cached ?? false,
    cache_hit: options.cacheHit ?? null,
    quota_cost: options.quotaCost ?? null,
    error_type: options.errorType ?? null,
    error_message: options.errorMessage ?? null,
  };

  // Lambda calls: insert immediately (low volume, important for item analytics)
  // Other API calls: batch for efficiency
  if (options.service === "lambda") {
    insertAnalyticsEvent("api_calls", event);
  } else {
    queueEvent("api_calls", event as Record<string, unknown>);
  }
}

// =============================================================================
// Error Tracking
// =============================================================================

interface TrackErrorOptions {
  sessionId: string;
  userId?: string | null;
  country?: string;
  userAgent?: string;
  errorSource: ErrorSource;
  errorType: string;
  errorMessage: string;
  errorStack?: string | null;
  route?: string | null;
  component?: string | null;
  context?: Record<string, unknown>;
  severity?: ErrorSeverity;
}

/**
 * Track errors (client and server)
 */
export function trackError(options: TrackErrorOptions): void {
  const event: Partial<ErrorEvent> = {
    event_type: "error",
    timestamp: toClickHouseTimestamp(),
    session_id: options.sessionId,
    user_id: options.userId ?? null,
    country: options.country ?? "unknown",
    user_agent: options.userAgent ?? "",
    error_source: options.errorSource,
    error_type: options.errorType,
    error_message: options.errorMessage.slice(0, 1000), // Truncate
    error_stack: options.errorStack?.slice(0, 2000) ?? null, // Truncate
    route: options.route ?? null,
    component: options.component ?? null,
    context: options.context ?? {},
    severity: options.severity ?? "medium",
  };

  // Insert immediately (errors are important)
  insertAnalyticsEvent("errors", event);
}

// =============================================================================
// Performance Tracking
// =============================================================================

interface TrackPerformanceOptions {
  sessionId: string;
  country: string;
  deviceType: DeviceType;
  connectionType?: string | null;
  path: string;
  pageType: PageType;
  ttfb: number;
  fcp: number;
  lcp: number;
  cls: number;
  inp?: number | null;
  resourceCount?: number;
  totalTransferSize?: number;
  isAdmin?: boolean;
}

/**
 * Track Core Web Vitals and performance metrics
 * Note: Skipped for admin users to avoid polluting analytics
 */
export function trackPerformance(options: TrackPerformanceOptions): void {
  // Skip admin traffic
  if (shouldSkipForAdmin({ is_admin: options.isAdmin })) {
    return;
  }

  const event: Partial<PerformanceEvent> = {
    event_type: "performance",
    timestamp: toClickHouseTimestamp(),
    session_id: options.sessionId,
    country: options.country,
    device_type: options.deviceType,
    connection_type: options.connectionType ?? null,
    path: options.path,
    page_type: options.pageType,
    ttfb: options.ttfb,
    fcp: options.fcp,
    lcp: options.lcp,
    cls: options.cls,
    inp: options.inp ?? null,
    resource_count: options.resourceCount ?? 0,
    total_transfer_size: options.totalTransferSize ?? 0,
  };

  queueEvent("performance", event as Record<string, unknown>);
}

// =============================================================================
// Cache Metrics Tracking
// =============================================================================

interface TrackCacheMetricsOptions {
  l1HitRate: number;
  l2HitRate: number;
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  staleHits: number;
  backgroundRefreshes: number;
  compressionSavingsBytes: number;
  compressedWrites: number;
  memoryKeys: number;
  fetchErrors: number;
  namespaceSizes: CacheMetricsEvent["namespace_sizes"];
}

/**
 * Track cache performance metrics
 * Called periodically (every 5 minutes) by cache service
 */
export function trackCacheMetrics(options: TrackCacheMetricsOptions): void {
  const event: Partial<CacheMetricsEvent> = {
    event_type: "cache_metrics",
    timestamp: toClickHouseTimestamp(),
    l1_hit_rate: options.l1HitRate,
    l2_hit_rate: options.l2HitRate,
    l1_hits: options.l1Hits,
    l1_misses: options.l1Misses,
    l2_hits: options.l2Hits,
    l2_misses: options.l2Misses,
    stale_hits: options.staleHits,
    background_refreshes: options.backgroundRefreshes,
    compression_savings_bytes: options.compressionSavingsBytes,
    compressed_writes: options.compressedWrites,
    memory_keys: options.memoryKeys,
    fetch_errors: options.fetchErrors,
    namespace_sizes: options.namespaceSizes,
  };

  // Insert immediately (low volume)
  insertAnalyticsEvent("cache_metrics", event);
}

// =============================================================================
// System Metrics Tracking
// =============================================================================

interface TrackSystemMetricsOptions {
  cpuUsage: number;
  cpuCores: number;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
  memoryRss: number;
  memoryHeapTotal: number;
  memoryHeapUsed: number;
  memoryExternal: number;
  memoryArrayBuffers: number;
  memoryTotal: number;
  memoryFree: number;
  eventLoopLag: number;
  uptime: number;
}

/**
 * Track system metrics (CPU, memory, event loop)
 * Called periodically (every 1-5 minutes) by background collector
 */
export function trackSystemMetrics(options: TrackSystemMetricsOptions): void {
  const event = {
    timestamp: toClickHouseTimestamp(),
    cpu_usage: options.cpuUsage,
    cpu_cores: options.cpuCores,
    load_avg_1m: options.loadAvg1m,
    load_avg_5m: options.loadAvg5m,
    load_avg_15m: options.loadAvg15m,
    memory_rss: options.memoryRss,
    memory_heap_total: options.memoryHeapTotal,
    memory_heap_used: options.memoryHeapUsed,
    memory_external: options.memoryExternal,
    memory_array_buffers: options.memoryArrayBuffers,
    memory_total: options.memoryTotal,
    memory_free: options.memoryFree,
    event_loop_lag: options.eventLoopLag,
    uptime: options.uptime,
  };

  // Insert immediately (low volume, time-critical for correlation)
  insertAnalyticsEvent("system_metrics", event);
}