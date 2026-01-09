/**
 * Error Analytics Queries
 *
 * Queries for error tracking, trends, and detailed error information.
 */

import { query } from "../client";
import {
  getTimeRangeCondition,
  type TimeRange,
  type ErrorOverview,
  type ErrorTrend,
  type TopError,
  type ErrorDetail,
  type ErrorOccurrence,
} from "./types";

// =============================================================================
// Error Overview
// =============================================================================

/**
 * Get error overview
 */
export async function getErrorOverview(range: TimeRange): Promise<ErrorOverview> {
  const timeCondition = getTimeRangeCondition(range);

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
    WHERE ${timeCondition}
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

// =============================================================================
// Error Trends
// =============================================================================

/**
 * Get error trend (hourly)
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

// =============================================================================
// Top Errors
// =============================================================================

/**
 * Get top errors by frequency
 */
export async function getTopErrors(range: TimeRange, limit = 20): Promise<TopError[]> {
  const timeCondition = getTimeRangeCondition(range);

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
    WHERE ${timeCondition}
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
// Error Details
// =============================================================================

/**
 * Get detailed information about a specific error type
 */
export async function getErrorDetails(
  errorType: string,
  errorSource: string,
  range: TimeRange
): Promise<ErrorDetail | null> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    event_id: string;
    timestamp: string;
    session_id: string;
    user_id: string;
    country: string;
    user_agent: string;
    error_source: string;
    error_type: string;
    error_message: string;
    error_stack: string;
    route: string;
    component: string;
    context: string;
    severity: string;
  }>(`
    SELECT 
      toString(event_id) AS event_id,
      toString(timestamp) AS timestamp,
      session_id,
      user_id,
      country,
      user_agent,
      error_source,
      error_type,
      error_message,
      error_stack,
      route,
      component,
      context,
      severity
    FROM errors
    WHERE 
      error_type = '${errorType.replace(/'/g, "''")}'
      AND error_source = '${errorSource.replace(/'/g, "''")}'
      AND ${timeCondition}
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  if (rows.length === 0) return null;

  const row = rows[0];
  let context: Record<string, unknown> = {};
  try {
    context = JSON.parse(row.context || "{}");
  } catch {
    context = {};
  }

  return {
    eventId: row.event_id,
    timestamp: row.timestamp,
    sessionId: row.session_id,
    userId: row.user_id || null,
    country: row.country,
    userAgent: row.user_agent,
    errorSource: row.error_source,
    errorType: row.error_type,
    errorMessage: row.error_message,
    errorStack: row.error_stack || null,
    route: row.route || null,
    component: row.component || null,
    context,
    severity: row.severity,
  };
}

/**
 * Get recent occurrences of a specific error type
 */
export async function getErrorOccurrences(
  errorType: string,
  errorSource: string,
  range: TimeRange,
  limit = 20
): Promise<ErrorOccurrence[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    timestamp: string;
    session_id: string;
    country: string;
    route: string;
    severity: string;
  }>(`
    SELECT 
      toString(timestamp) AS timestamp,
      session_id,
      country,
      route,
      severity
    FROM errors
    WHERE 
      error_type = '${errorType.replace(/'/g, "''")}'
      AND error_source = '${errorSource.replace(/'/g, "''")}'
      AND ${timeCondition}
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    timestamp: row.timestamp,
    sessionId: row.session_id,
    country: row.country,
    route: row.route || null,
    severity: row.severity,
  }));
}
