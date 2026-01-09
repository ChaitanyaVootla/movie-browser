/**
 * AI Usage Analytics Queries
 *
 * Queries for AI agent invocations, costs, tokens, and user activity.
 */

import { query } from "../client";
import {
  getTimeRangeCondition,
  type TimeRange,
  type AIUsageOverview,
  type DailyAICost,
  type TopAIUser,
  type QueryTypeDistribution,
} from "./types";

// =============================================================================
// AI Usage Overview
// =============================================================================

/**
 * Get AI usage overview
 */
export async function getAIUsageOverview(range: TimeRange): Promise<AIUsageOverview> {
  const timeCondition = getTimeRangeCondition(range);

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
    WHERE ${timeCondition}
  `);

  return {
    totalInvocations: parseInt(result?.total_invocations || "0", 10),
    totalCost: parseFloat(result?.total_cost || "0"),
    totalTokens: parseInt(result?.total_tokens || "0", 10),
    avgResponseTime: parseFloat(result?.avg_response_time || "0"),
    uniqueUsers: parseInt(result?.unique_users || "0", 10),
  };
}

// =============================================================================
// Daily AI Costs
// =============================================================================

/**
 * Get daily AI costs over time
 */
export async function getDailyAICosts(range: TimeRange): Promise<DailyAICost[]> {
  const timeCondition = getTimeRangeCondition(range);

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
    WHERE ${timeCondition}
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

// =============================================================================
// Top AI Users
// =============================================================================

/**
 * Get top AI users by cost
 */
export async function getTopAIUsers(range: TimeRange, limit = 10): Promise<TopAIUser[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    user_id: string;
    user_name: string;
    is_authenticated: string;
    invocations: string;
    cost: string;
    tokens: string;
  }>(`
    SELECT 
      coalesce(user_id, session_id) AS user_id,
      any(user_name) AS user_name,
      max(is_authenticated) AS is_authenticated,
      count() AS invocations,
      sum(total_cost) AS cost,
      sum(total_tokens) AS tokens
    FROM ai_usage
    WHERE ${timeCondition}
    GROUP BY user_id
    ORDER BY cost DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    userId: row.user_id,
    userName: row.user_name || "",
    isAuthenticated: row.is_authenticated === "1",
    invocations: parseInt(row.invocations, 10),
    cost: parseFloat(row.cost),
    tokens: parseInt(row.tokens, 10),
  }));
}

// =============================================================================
// Query Type Distribution
// =============================================================================

/**
 * Get query type distribution
 */
export async function getQueryTypeDistribution(range: TimeRange): Promise<QueryTypeDistribution[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    query_type: string;
    count: string;
  }>(`
    SELECT 
      query_type,
      count() AS count
    FROM ai_usage
    WHERE ${timeCondition}
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
// User AI Stats (for Users dashboard)
// =============================================================================

export interface UserAIStats {
  [email: string]: {
    invocations: number;
    cost: number;
    tokens: number;
  };
}

/**
 * Get AI usage stats grouped by user email/name
 * Used to show per-user AI costs in the Users dashboard
 */
export async function getUserAIStats(range: TimeRange): Promise<UserAIStats> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    user_name: string;
    invocations: string;
    cost: string;
    tokens: string;
  }>(`
    SELECT 
      user_name,
      count() AS invocations,
      sum(total_cost) AS cost,
      sum(total_tokens) AS tokens
    FROM ai_usage
    WHERE ${timeCondition}
      AND is_authenticated = 1
      AND user_name != ''
      AND user_name != 'Guest'
      AND user_name != 'Unknown'
    GROUP BY user_name
    ORDER BY cost DESC
  `);

  const result: UserAIStats = {};
  for (const row of rows) {
    // User name is stored as the email or display name
    result[row.user_name] = {
      invocations: parseInt(row.invocations, 10),
      cost: parseFloat(row.cost),
      tokens: parseInt(row.tokens, 10),
    };
  }

  return result;
}
