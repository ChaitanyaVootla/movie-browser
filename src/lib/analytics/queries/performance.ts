/**
 * Performance Analytics Queries
 *
 * Queries for Core Web Vitals (LCP, FCP, TTFB, CLS, INP).
 */

import { query } from "../client";
import {
  getTimeRangeCondition,
  type TimeRange,
  type PerformanceMetrics,
  type PerformanceByPageType,
  type PerformanceTrend,
} from "./types";

// =============================================================================
// Performance Overview
// =============================================================================

/**
 * Get overall performance metrics (Core Web Vitals)
 */
export async function getPerformanceMetrics(range: TimeRange): Promise<PerformanceMetrics> {
  const timeCondition = getTimeRangeCondition(range);

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
    WHERE ${timeCondition}
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

// =============================================================================
// Performance by Page Type
// =============================================================================

/**
 * Get performance by page type
 */
export async function getPerformanceByPageType(range: TimeRange): Promise<PerformanceByPageType[]> {
  const timeCondition = getTimeRangeCondition(range);

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
    WHERE ${timeCondition}
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

// =============================================================================
// Performance Trend
// =============================================================================

/**
 * Get performance trend (hourly)
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
