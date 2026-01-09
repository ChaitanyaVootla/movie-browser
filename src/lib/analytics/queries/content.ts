/**
 * Content Performance Analytics Queries
 *
 * Queries for content performance and user action analytics.
 */

import { query } from "../client";
import {
  getTimeRangeCondition,
  type TimeRange,
  type ContentPerformance,
  type UserActionSummary,
  type CacheMetricsSnapshot,
} from "./types";

// =============================================================================
// Top Content
// =============================================================================

/**
 * Get top performing content
 */
export async function getTopContent(
  range: TimeRange,
  mediaType?: "movie" | "series",
  limit = 20
): Promise<ContentPerformance[]> {
  const timeCondition = getTimeRangeCondition(range);
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
      AND ${timeCondition}
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
// User Action Summary
// =============================================================================

/**
 * Get user action summary
 */
export async function getUserActionSummary(range: TimeRange): Promise<UserActionSummary[]> {
  const timeCondition = getTimeRangeCondition(range);

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
    WHERE is_bot = 0 AND ${timeCondition}
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
// Cache Metrics (from ClickHouse - deprecated, use live metrics instead)
// =============================================================================

/**
 * Get latest cache metrics snapshot from ClickHouse
 * @deprecated Use getLiveCacheMetrics() in the API route instead
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
