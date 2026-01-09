/**
 * Analytics Utility Queries
 *
 * Utility functions for checking analytics availability and health.
 */

import { query } from "../client";

// =============================================================================
// Health Checks
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

/**
 * Get table row counts for monitoring
 */
export async function getTableCounts(): Promise<Record<string, number>> {
  const tables = [
    "page_views",
    "sessions",
    "ai_usage",
    "user_actions",
    "api_calls",
    "errors",
    "performance",
  ];

  const counts: Record<string, number> = {};

  for (const table of tables) {
    try {
      const [result] = await query<{ count: string }>(
        `SELECT count() AS count FROM ${table}`
      );
      counts[table] = parseInt(result?.count || "0", 10);
    } catch {
      counts[table] = 0;
    }
  }

  return counts;
}

/**
 * Get database size information
 */
export async function getDatabaseSize(): Promise<{
  totalBytes: number;
  tables: Record<string, number>;
}> {
  const rows = await query<{
    table: string;
    size_bytes: string;
  }>(`
    SELECT 
      table,
      sum(bytes_on_disk) AS size_bytes
    FROM system.parts
    WHERE database = 'analytics' AND active = 1
    GROUP BY table
    ORDER BY size_bytes DESC
  `);

  const tables: Record<string, number> = {};
  let total = 0;

  for (const row of rows) {
    const size = parseInt(row.size_bytes, 10);
    tables[row.table] = size;
    total += size;
  }

  return {
    totalBytes: total,
    tables,
  };
}
