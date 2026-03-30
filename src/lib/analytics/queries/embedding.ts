/**
 * Embedding Usage Analytics Queries
 *
 * Queries for Cohere Embed v4 usage, costs, and type breakdown.
 * Follows the same pattern as lambda.ts for cost estimation.
 */

import { query } from "../client";
import { calculateEmbeddingCost } from "@/lib/model-pricing";
import {
  getTimeRangeCondition,
  type TimeRange,
  type EmbeddingUsageOverview,
  type DailyEmbeddingUsage,
  type EmbeddingByType,
} from "./types";

// =============================================================================
// Embedding Usage Overview
// =============================================================================

/**
 * Get embedding usage overview (total calls, tokens, estimated cost)
 */
export async function getEmbeddingUsageOverview(range: TimeRange): Promise<EmbeddingUsageOverview> {
  const timeCondition = getTimeRangeCondition(range);

  const [result] = await query<{
    total_calls: string;
    total_tokens: string;
    avg_duration: string;
    successful_calls: string;
    failed_calls: string;
  }>(`
    SELECT
      count() AS total_calls,
      sum(tokens) AS total_tokens,
      avg(duration_ms) AS avg_duration,
      countIf(status_code = 200) AS successful_calls,
      countIf(status_code != 200) AS failed_calls
    FROM api_calls
    WHERE service = 'embedding' AND ${timeCondition}
  `);

  const totalTokens = parseInt(result?.total_tokens || "0", 10);

  return {
    totalCalls: parseInt(result?.total_calls || "0", 10),
    totalTokens,
    estimatedCost: calculateEmbeddingCost(totalTokens, "search_query"),
    avgDurationMs: parseFloat(result?.avg_duration || "0"),
    successfulCalls: parseInt(result?.successful_calls || "0", 10),
    failedCalls: parseInt(result?.failed_calls || "0", 10),
  };
}

// =============================================================================
// Daily Embedding Usage
// =============================================================================

/**
 * Get daily embedding usage over time
 */
export async function getDailyEmbeddingUsage(range: TimeRange): Promise<DailyEmbeddingUsage[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    date: string;
    calls: string;
    tokens: string;
    avg_duration: string;
  }>(`
    SELECT
      toDate(timestamp) AS date,
      count() AS calls,
      sum(tokens) AS tokens,
      avg(duration_ms) AS avg_duration
    FROM api_calls
    WHERE service = 'embedding' AND ${timeCondition}
    GROUP BY date
    ORDER BY date
  `);

  return rows.map((row) => {
    const tokens = parseInt(row.tokens, 10);
    return {
      date: row.date,
      calls: parseInt(row.calls, 10),
      tokens,
      estimatedCost: calculateEmbeddingCost(tokens, "search_query"),
      avgDurationMs: parseFloat(row.avg_duration),
    };
  });
}

// =============================================================================
// Embedding By Type (search_query vs search_document)
// =============================================================================

/**
 * Get embedding usage breakdown by input type (search_query vs search_document)
 * The endpoint field contains the input type info (e.g., "cohere.embed-v4:0:search_query")
 */
export async function getEmbeddingByType(range: TimeRange): Promise<EmbeddingByType[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    input_type: string;
    calls: string;
    tokens: string;
  }>(`
    SELECT
      multiIf(
        endpoint LIKE '%search_query%', 'search_query',
        endpoint LIKE '%search_document%', 'search_document',
        endpoint LIKE '%batch%', 'batch',
        'other'
      ) AS input_type,
      count() AS calls,
      sum(tokens) AS tokens
    FROM api_calls
    WHERE service = 'embedding' AND ${timeCondition}
    GROUP BY input_type
    ORDER BY calls DESC
  `);

  const totalCalls = rows.reduce((sum, row) => sum + parseInt(row.calls, 10), 0);

  return rows.map((row) => {
    const calls = parseInt(row.calls, 10);
    const tokens = parseInt(row.tokens, 10);
    return {
      inputType: row.input_type,
      calls,
      tokens,
      estimatedCost: calculateEmbeddingCost(tokens, row.input_type),
      percentage: totalCalls > 0 ? (calls / totalCalls) * 100 : 0,
    };
  });
}
