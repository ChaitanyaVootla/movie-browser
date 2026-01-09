/**
 * System Metrics Queries
 *
 * ClickHouse queries for CPU, memory, and event loop history.
 * Used for correlating system health with traffic patterns.
 */

import { query } from "../client";
import { getClickHouseDateInterval, type TimeRange } from "./types";

// =============================================================================
// Types
// =============================================================================

export interface SystemMetricsDataPoint {
  timestamp: string;
  cpuUsage: number;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
  memoryRss: number;
  memoryHeapUsed: number;
  memoryHeapTotal: number;
  memoryFree: number;
  memoryTotal: number;
  eventLoopLag: number;
}

export interface SystemMetricsHistory {
  dataPoints: SystemMetricsDataPoint[];
  summary: {
    avgCpuUsage: number;
    maxCpuUsage: number;
    avgMemoryUsedPercent: number;
    maxMemoryUsedPercent: number;
    avgEventLoopLag: number;
    maxEventLoopLag: number;
  };
}

export type Granularity = "minute" | "5min" | "15min" | "hour" | "day";

// =============================================================================
// Queries
// =============================================================================

/**
 * Get system metrics history with configurable granularity
 */
export async function getSystemMetricsHistory(
  range: TimeRange,
  granularity: Granularity = "5min"
): Promise<SystemMetricsHistory> {
  const dateInterval = getClickHouseDateInterval(range.days);

  // Map granularity to ClickHouse function
  const groupByFn =
    granularity === "minute"
      ? "toStartOfMinute"
      : granularity === "5min"
        ? "toStartOfFiveMinutes"
        : granularity === "15min"
          ? "toStartOfFifteenMinutes"
          : granularity === "hour"
            ? "toStartOfHour"
            : "toStartOfDay";

  const sql = `
    SELECT
      ${groupByFn}(timestamp) AS ts,
      avg(cpu_usage) AS cpu_usage,
      avg(load_avg_1m) AS load_avg_1m,
      avg(load_avg_5m) AS load_avg_5m,
      avg(load_avg_15m) AS load_avg_15m,
      avg(memory_rss) AS memory_rss,
      avg(memory_heap_used) AS memory_heap_used,
      avg(memory_heap_total) AS memory_heap_total,
      avg(memory_free) AS memory_free,
      avg(memory_total) AS memory_total,
      avg(event_loop_lag) AS event_loop_lag
    FROM analytics.system_metrics
    WHERE timestamp >= ${dateInterval}
    GROUP BY ts
    ORDER BY ts ASC
  `;

  const rows = await query<{
    ts: string;
    cpu_usage: number;
    load_avg_1m: number;
    load_avg_5m: number;
    load_avg_15m: number;
    memory_rss: number;
    memory_heap_used: number;
    memory_heap_total: number;
    memory_free: number;
    memory_total: number;
    event_loop_lag: number;
  }>(sql);

  const dataPoints: SystemMetricsDataPoint[] = rows.map((row) => ({
    timestamp: row.ts,
    cpuUsage: row.cpu_usage,
    loadAvg1m: row.load_avg_1m,
    loadAvg5m: row.load_avg_5m,
    loadAvg15m: row.load_avg_15m,
    memoryRss: row.memory_rss,
    memoryHeapUsed: row.memory_heap_used,
    memoryHeapTotal: row.memory_heap_total,
    memoryFree: row.memory_free,
    memoryTotal: row.memory_total,
    eventLoopLag: row.event_loop_lag,
  }));

  // Calculate summary stats
  const summarySql = `
    SELECT
      avg(cpu_usage) AS avg_cpu,
      max(cpu_usage) AS max_cpu,
      avg((memory_total - memory_free) / memory_total * 100) AS avg_mem_pct,
      max((memory_total - memory_free) / memory_total * 100) AS max_mem_pct,
      avg(event_loop_lag) AS avg_lag,
      max(event_loop_lag) AS max_lag
    FROM analytics.system_metrics
    WHERE timestamp >= ${dateInterval}
  `;

  const [summary] = await query<{
    avg_cpu: number;
    max_cpu: number;
    avg_mem_pct: number;
    max_mem_pct: number;
    avg_lag: number;
    max_lag: number;
  }>(summarySql);

  return {
    dataPoints,
    summary: {
      avgCpuUsage: summary?.avg_cpu || 0,
      maxCpuUsage: summary?.max_cpu || 0,
      avgMemoryUsedPercent: summary?.avg_mem_pct || 0,
      maxMemoryUsedPercent: summary?.max_mem_pct || 0,
      avgEventLoopLag: summary?.avg_lag || 0,
      maxEventLoopLag: summary?.max_lag || 0,
    },
  };
}

/**
 * Get CPU load history for line chart
 */
export async function getCPUHistory(
  range: TimeRange,
  granularity: Granularity = "5min"
): Promise<{ timestamp: string; value: number }[]> {
  const dateInterval = getClickHouseDateInterval(range.days);

  const groupByFn =
    granularity === "minute"
      ? "toStartOfMinute"
      : granularity === "5min"
        ? "toStartOfFiveMinutes"
        : granularity === "15min"
          ? "toStartOfFifteenMinutes"
          : granularity === "hour"
            ? "toStartOfHour"
            : "toStartOfDay";

  const sql = `
    SELECT
      ${groupByFn}(timestamp) AS ts,
      avg(load_avg_1m) AS value
    FROM analytics.system_metrics
    WHERE timestamp >= ${dateInterval}
    GROUP BY ts
    ORDER BY ts ASC
  `;

  const rows = await query<{ ts: string; value: number }>(sql);
  return rows.map((row) => ({ timestamp: row.ts, value: row.value }));
}

/**
 * Get memory usage history for line chart
 */
export async function getMemoryHistory(
  range: TimeRange,
  granularity: Granularity = "5min"
): Promise<{ timestamp: string; heapUsed: number; rss: number; systemUsedPct: number }[]> {
  const dateInterval = getClickHouseDateInterval(range.days);

  const groupByFn =
    granularity === "minute"
      ? "toStartOfMinute"
      : granularity === "5min"
        ? "toStartOfFiveMinutes"
        : granularity === "15min"
          ? "toStartOfFifteenMinutes"
          : granularity === "hour"
            ? "toStartOfHour"
            : "toStartOfDay";

  const sql = `
    SELECT
      ${groupByFn}(timestamp) AS ts,
      avg(memory_heap_used) AS heap_used,
      avg(memory_rss) AS rss,
      avg((memory_total - memory_free) / memory_total * 100) AS system_used_pct
    FROM analytics.system_metrics
    WHERE timestamp >= ${dateInterval}
    GROUP BY ts
    ORDER BY ts ASC
  `;

  const rows = await query<{
    ts: string;
    heap_used: number;
    rss: number;
    system_used_pct: number;
  }>(sql);

  return rows.map((row) => ({
    timestamp: row.ts,
    heapUsed: row.heap_used,
    rss: row.rss,
    systemUsedPct: row.system_used_pct,
  }));
}
