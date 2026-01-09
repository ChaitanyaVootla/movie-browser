/**
 * Lambda Usage Analytics Queries
 *
 * Queries for AWS Lambda invocations, performance, and cost estimates.
 */

import { query } from "../client";
import {
  getTimeRangeCondition,
  type TimeRange,
  type LambdaUsageOverview,
  type LambdaByFunction,
  type DailyLambdaUsage,
} from "./types";

// =============================================================================
// Lambda Pricing
// =============================================================================

/**
 * Lambda pricing estimates (in USD per invocation + duration)
 * Based on AWS Lambda pricing for ap-south-2 region
 * Assumes 512MB memory allocation
 */
const LAMBDA_PRICING = {
  perRequest: 0.0000002, // $0.20 per 1M requests
  perGbSecond: 0.0000166667, // $0.0000166667 per GB-second
  memoryGb: 0.5, // 512MB = 0.5 GB
};

/**
 * Estimate Lambda cost from invocations and duration
 */
export function estimateLambdaCost(invocations: number, totalDurationMs: number): number {
  // Request cost
  const requestCost = invocations * LAMBDA_PRICING.perRequest;
  // Compute cost (GB-seconds)
  const totalSeconds = totalDurationMs / 1000;
  const gbSeconds = totalSeconds * LAMBDA_PRICING.memoryGb;
  const computeCost = gbSeconds * LAMBDA_PRICING.perGbSecond;
  return requestCost + computeCost;
}

// =============================================================================
// Lambda Usage Overview
// =============================================================================

/**
 * Get Lambda usage overview
 */
export async function getLambdaUsageOverview(range: TimeRange): Promise<LambdaUsageOverview> {
  const timeCondition = getTimeRangeCondition(range);

  const [result] = await query<{
    total_invocations: string;
    successful_invocations: string;
    failed_invocations: string;
    avg_duration: string;
    p95_duration: string;
    total_duration: string;
  }>(`
    SELECT 
      count() AS total_invocations,
      countIf(status_code = 200) AS successful_invocations,
      countIf(status_code != 200) AS failed_invocations,
      avg(duration_ms) AS avg_duration,
      quantile(0.95)(duration_ms) AS p95_duration,
      sum(duration_ms) AS total_duration
    FROM api_calls
    WHERE service = 'lambda' AND ${timeCondition}
  `);

  const totalInvocations = parseInt(result?.total_invocations || "0", 10);
  const totalDurationMs = parseFloat(result?.total_duration || "0");

  return {
    totalInvocations,
    successfulInvocations: parseInt(result?.successful_invocations || "0", 10),
    failedInvocations: parseInt(result?.failed_invocations || "0", 10),
    avgDurationMs: parseFloat(result?.avg_duration || "0"),
    p95DurationMs: parseFloat(result?.p95_duration || "0"),
    estimatedCost: estimateLambdaCost(totalInvocations, totalDurationMs),
  };
}

// =============================================================================
// Lambda by Function
// =============================================================================

/**
 * Get Lambda usage by function
 */
export async function getLambdaByFunction(range: TimeRange): Promise<LambdaByFunction[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    function_name: string;
    invocations: string;
    successful: string;
    avg_duration: string;
    total_duration: string;
  }>(`
    SELECT 
      splitByChar(':', endpoint)[1] AS function_name,
      count() AS invocations,
      countIf(status_code = 200) AS successful,
      avg(duration_ms) AS avg_duration,
      sum(duration_ms) AS total_duration
    FROM api_calls
    WHERE service = 'lambda' AND ${timeCondition}
    GROUP BY function_name
    ORDER BY invocations DESC
  `);

  return rows.map((row) => {
    const invocations = parseInt(row.invocations, 10);
    const totalDurationMs = parseFloat(row.total_duration);
    return {
      functionName: row.function_name,
      invocations,
      successRate: invocations > 0 ? (parseInt(row.successful, 10) / invocations) * 100 : 0,
      avgDurationMs: parseFloat(row.avg_duration),
      estimatedCost: estimateLambdaCost(invocations, totalDurationMs),
    };
  });
}

// =============================================================================
// Daily Lambda Usage
// =============================================================================

/**
 * Get daily Lambda usage
 */
export async function getDailyLambdaUsage(range: TimeRange): Promise<DailyLambdaUsage[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    date: string;
    invocations: string;
    avg_duration: string;
    total_duration: string;
  }>(`
    SELECT 
      toDate(timestamp) AS date,
      count() AS invocations,
      avg(duration_ms) AS avg_duration,
      sum(duration_ms) AS total_duration
    FROM api_calls
    WHERE service = 'lambda' AND ${timeCondition}
    GROUP BY date
    ORDER BY date
  `);

  return rows.map((row) => ({
    date: row.date,
    invocations: parseInt(row.invocations, 10),
    avgDurationMs: parseFloat(row.avg_duration),
    estimatedCost: estimateLambdaCost(
      parseInt(row.invocations, 10),
      parseFloat(row.total_duration)
    ),
  }));
}
