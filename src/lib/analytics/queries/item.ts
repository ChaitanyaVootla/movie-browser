/**
 * Item-Specific Analytics Queries
 *
 * Queries for analytics on specific movies or series.
 */

import { query } from "../client";
import { estimateLambdaCost } from "./lambda";
import {
  getTimeRangeCondition,
  type TimeRange,
  type ItemAnalytics,
  type ItemLambdaHistory,
  type ItemBotStats,
  type ItemDeviceStats,
  type ItemDailyTrend,
} from "./types";

// =============================================================================
// Item Analytics Overview
// =============================================================================

/**
 * Get analytics for a specific item (movie or series)
 */
export async function getItemAnalytics(
  tmdbId: number,
  mediaType: "movie" | "series",
  range: TimeRange
): Promise<ItemAnalytics> {
  const timeCondition = getTimeRangeCondition(range);

  // Page views and visitors
  const [pageViewResult] = await query<{
    page_views: string;
    unique_visitors: string;
  }>(`
    SELECT 
      count() AS page_views,
      uniq(session_id) AS unique_visitors
    FROM page_views
    WHERE 
      item_id = ${tmdbId} 
      AND item_media_type = '${mediaType}'
      AND is_bot = 0 
      AND ${timeCondition}
  `);

  // User actions for this item
  const actionRows = await query<{
    action: string;
    count: string;
  }>(`
    SELECT 
      action,
      count() AS count
    FROM user_actions
    WHERE 
      item_id = ${tmdbId} 
      AND media_type = '${mediaType}'
      AND is_bot = 0
      AND ${timeCondition}
    GROUP BY action
  `);

  const actionCounts: Record<string, number> = {};
  for (const row of actionRows) {
    actionCounts[row.action] = parseInt(row.count, 10);
  }

  // Lambda invocations for this item
  // Endpoint format: "function_name:mediaType:tmdbId"
  const lambdaPattern = `%:${mediaType}:${tmdbId}`;
  const [lambdaResult] = await query<{
    invocations: string;
    avg_duration: string;
    last_invoked: string;
    total_duration: string;
  }>(`
    SELECT 
      count() AS invocations,
      avg(duration_ms) AS avg_duration,
      max(timestamp) AS last_invoked,
      sum(duration_ms) AS total_duration
    FROM api_calls
    WHERE 
      service = 'lambda' 
      AND endpoint LIKE '${lambdaPattern}'
      AND ${timeCondition}
  `);

  const lambdaInvocations = parseInt(lambdaResult?.invocations || "0", 10);
  const totalDurationMs = parseFloat(lambdaResult?.total_duration || "0");

  return {
    pageViews: parseInt(pageViewResult?.page_views || "0", 10),
    uniqueVisitors: parseInt(pageViewResult?.unique_visitors || "0", 10),
    watchlistAdds: actionCounts["watchlist_add"] || 0,
    watchlistRemoves: actionCounts["watchlist_remove"] || 0,
    ratingLikes: actionCounts["rate_like"] || 0,
    ratingDislikes: actionCounts["rate_dislike"] || 0,
    watchClicks: actionCounts["watch_click"] || 0,
    trailerPlays: actionCounts["trailer_play"] || 0,
    lambdaInvocations,
    lambdaAvgDuration: parseFloat(lambdaResult?.avg_duration || "0"),
    // Only return last_invoked if there are actual invocations
    lambdaLastInvoked:
      lambdaInvocations > 0 && lambdaResult?.last_invoked ? lambdaResult.last_invoked : null,
    lambdaEstimatedCost: estimateLambdaCost(lambdaInvocations, totalDurationMs),
  };
}

// =============================================================================
// Item Lambda History
// =============================================================================

/**
 * Get Lambda invocation history for a specific item
 */
export async function getItemLambdaHistory(
  tmdbId: number,
  mediaType: "movie" | "series",
  limit = 10
): Promise<ItemLambdaHistory[]> {
  const lambdaPattern = `%:${mediaType}:${tmdbId}`;
  const rows = await query<{
    endpoint: string;
    timestamp: string;
    duration_ms: string;
    status_code: string;
    error_type: string;
  }>(`
    SELECT 
      endpoint,
      timestamp,
      duration_ms,
      status_code,
      error_type
    FROM api_calls
    WHERE 
      service = 'lambda' 
      AND endpoint LIKE '${lambdaPattern}'
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    // Extract function name from endpoint (e.g., "puppeteer-node14:movie:550" → "puppeteer-node14")
    functionName: row.endpoint.split(":")[0],
    timestamp: row.timestamp,
    durationMs: parseInt(row.duration_ms, 10),
    statusCode: parseInt(row.status_code, 10),
    errorType: row.error_type || null,
  }));
}

// =============================================================================
// Item Bot Stats
// =============================================================================

/**
 * Get bot traffic stats for a specific item
 */
export async function getItemBotStats(
  tmdbId: number,
  mediaType: "movie" | "series",
  range: TimeRange,
  topK = 5
): Promise<ItemBotStats> {
  const timeCondition = getTimeRangeCondition(range);

  // Total bot views
  const [totalResult] = await query<{ total: string }>(`
    SELECT count() AS total
    FROM page_views
    WHERE 
      item_id = ${tmdbId} 
      AND item_media_type = '${mediaType}'
      AND is_bot = 1
      AND ${timeCondition}
  `);

  // Top bots by type
  const botRows = await query<{ bot_type: string; count: string }>(`
    SELECT 
      bot_type,
      count() AS count
    FROM page_views
    WHERE 
      item_id = ${tmdbId} 
      AND item_media_type = '${mediaType}'
      AND is_bot = 1
      AND bot_type != ''
      AND ${timeCondition}
    GROUP BY bot_type
    ORDER BY count DESC
    LIMIT ${topK}
  `);

  return {
    totalBotViews: parseInt(totalResult?.total || "0", 10),
    topBots: botRows.map((row) => ({
      botType: row.bot_type,
      count: parseInt(row.count, 10),
    })),
  };
}

// =============================================================================
// Item Device Stats
// =============================================================================

/**
 * Get device breakdown for a specific item
 */
export async function getItemDeviceStats(
  tmdbId: number,
  mediaType: "movie" | "series",
  range: TimeRange
): Promise<ItemDeviceStats> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{ device_type: string; count: string }>(`
    SELECT 
      device_type,
      count() AS count
    FROM page_views
    WHERE 
      item_id = ${tmdbId} 
      AND item_media_type = '${mediaType}'
      AND is_bot = 0
      AND ${timeCondition}
    GROUP BY device_type
  `);

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const count = parseInt(row.count, 10);
    counts[row.device_type.toLowerCase()] = count;
    total += count;
  }

  return {
    mobile: counts["mobile"] || 0,
    desktop: counts["desktop"] || 0,
    tablet: counts["tablet"] || 0,
    other: counts["other"] || counts["unknown"] || 0,
    total,
  };
}

// =============================================================================
// Item Daily Trend
// =============================================================================

/**
 * Get daily traffic trend for a specific item
 */
export async function getItemDailyTrend(
  tmdbId: number,
  mediaType: "movie" | "series",
  range: TimeRange
): Promise<ItemDailyTrend[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    date: string;
    views: string;
    unique_visitors: string;
  }>(`
    SELECT 
      toDate(timestamp) AS date,
      count() AS views,
      uniq(session_id) AS unique_visitors
    FROM page_views
    WHERE 
      item_id = ${tmdbId} 
      AND item_media_type = '${mediaType}'
      AND is_bot = 0
      AND ${timeCondition}
    GROUP BY date
    ORDER BY date
  `);

  return rows.map((row) => ({
    date: row.date,
    views: parseInt(row.views, 10),
    uniqueVisitors: parseInt(row.unique_visitors, 10),
  }));
}
