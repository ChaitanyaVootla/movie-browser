/**
 * ClickHouse Client
 *
 * HTTP-based client for inserting analytics events into ClickHouse.
 * Uses the native HTTP interface to avoid adding a heavy client dependency.
 *
 * Features:
 * - Async batch inserts (fire-and-forget)
 * - Automatic JSON Lines formatting
 * - Connection pooling via fetch
 * - Graceful failure handling (don't break app if analytics is down)
 */

import { dataLogger } from "@/lib/logger";
import type { AnalyticsEvent } from "./types";

// =============================================================================
// Configuration
// =============================================================================

interface ClickHouseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  protocol: "http" | "https";
}

function getConfig(): ClickHouseConfig | null {
  const host = process.env.CLICKHOUSE_HOST;
  const password = process.env.CLICKHOUSE_PASSWORD;

  // If not configured, disable analytics
  if (!host || !password) {
    return null;
  }

  return {
    host,
    port: parseInt(process.env.CLICKHOUSE_PORT || "8123", 10),
    database: process.env.CLICKHOUSE_DATABASE || "analytics",
    username: process.env.CLICKHOUSE_USER || "analytics",
    password,
    protocol: (process.env.CLICKHOUSE_PROTOCOL as "http" | "https") || "http",
  };
}

// Singleton config (checked once at startup)
let configCache: ClickHouseConfig | null | undefined = undefined;

function getConfigCached(): ClickHouseConfig | null {
  if (configCache === undefined) {
    configCache = getConfig();
    if (!configCache) {
      dataLogger.warn({
        event: "analytics_disabled",
        reason: "CLICKHOUSE_HOST or CLICKHOUSE_PASSWORD not configured",
      });
    } else {
      dataLogger.info({
        event: "analytics_configured",
        host: configCache.host,
        database: configCache.database,
      });
    }
  }
  return configCache;
}

// =============================================================================
// HTTP Client
// =============================================================================

/**
 * Build the ClickHouse HTTP URL for an insert query
 */
function buildInsertUrl(config: ClickHouseConfig, table: string): string {
  const { protocol, host, port, database, username, password } = config;
  const query = `INSERT INTO ${database}.${table} FORMAT JSONEachRow`;

  const url = new URL(`${protocol}://${host}:${port}/`);
  url.searchParams.set("query", query);
  url.searchParams.set("user", username);
  url.searchParams.set("password", password);

  return url.toString();
}

/**
 * Insert events into ClickHouse (fire-and-forget)
 *
 * @param table - Target table name
 * @param events - Array of event objects to insert
 *
 * This is intentionally async fire-and-forget to avoid blocking the request.
 * Errors are logged but not thrown.
 */
export async function insertEvents<T extends Record<string, unknown>>(
  table: string,
  events: T[]
): Promise<void> {
  const config = getConfigCached();

  if (!config) {
    return; // Analytics disabled
  }

  if (events.length === 0) {
    return;
  }

  try {
    const url = buildInsertUrl(config, table);

    // Convert events to JSON Lines format (one JSON object per line)
    const body = events.map((e) => JSON.stringify(e)).join("\n");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      // Don't wait too long - analytics shouldn't block the app
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      dataLogger.error({
        event: "clickhouse_insert_error",
        table,
        status: response.status,
        error: errorText.slice(0, 500),
        eventCount: events.length,
      });
    } else {
      dataLogger.debug({
        event: "clickhouse_insert_success",
        table,
        eventCount: events.length,
      });
    }
  } catch (error) {
    // Log but don't throw - analytics failures shouldn't break the app
    dataLogger.error({
      event: "clickhouse_insert_error",
      table,
      error: error instanceof Error ? error.message : String(error),
      eventCount: events.length,
    });
  }
}

// =============================================================================
// Batch Buffer (Optional - for high-volume scenarios)
// =============================================================================

interface BatchBuffer<T> {
  events: T[];
  flushTimeout: NodeJS.Timeout | null;
}

const batchBuffers = new Map<string, BatchBuffer<Record<string, unknown>>>();

const BATCH_SIZE = 100;
const BATCH_FLUSH_INTERVAL_MS = 5000;

/**
 * Add an event to the batch buffer for delayed insertion
 * Useful for high-volume events like page views
 */
export function queueEvent<T extends Record<string, unknown>>(
  table: string,
  event: T
): void {
  const config = getConfigCached();
  if (!config) {
    return; // Analytics disabled
  }

  let buffer = batchBuffers.get(table);
  if (!buffer) {
    buffer = { events: [], flushTimeout: null };
    batchBuffers.set(table, buffer);
  }

  buffer.events.push(event);

  // Flush if batch size reached
  if (buffer.events.length >= BATCH_SIZE) {
    flushBuffer(table);
    return;
  }

  // Set up delayed flush if not already scheduled
  if (!buffer.flushTimeout) {
    buffer.flushTimeout = setTimeout(() => {
      flushBuffer(table);
    }, BATCH_FLUSH_INTERVAL_MS);
  }
}

/**
 * Flush the batch buffer for a table
 */
function flushBuffer(table: string): void {
  const buffer = batchBuffers.get(table);
  if (!buffer || buffer.events.length === 0) {
    return;
  }

  // Clear timeout
  if (buffer.flushTimeout) {
    clearTimeout(buffer.flushTimeout);
    buffer.flushTimeout = null;
  }

  // Take events and reset buffer
  const events = buffer.events;
  buffer.events = [];

  // Fire-and-forget insert
  insertEvents(table, events).catch(() => {
    // Already logged in insertEvents
  });
}

/**
 * Flush all pending buffers (call on server shutdown)
 */
export function flushAllBuffers(): void {
  for (const table of batchBuffers.keys()) {
    flushBuffer(table);
  }
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Check if ClickHouse is reachable
 */
export async function checkClickHouseHealth(): Promise<{
  available: boolean;
  latencyMs: number | null;
  error: string | null;
}> {
  const config = getConfigCached();
  if (!config) {
    return { available: false, latencyMs: null, error: "Not configured" };
  }

  const start = Date.now();

  try {
    const { protocol, host, port, username, password } = config;
    const url = new URL(`${protocol}://${host}:${port}/ping`);
    url.searchParams.set("user", username);
    url.searchParams.set("password", password);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      return {
        available: true,
        latencyMs: Date.now() - start,
        error: null,
      };
    }

    return {
      available: false,
      latencyMs: Date.now() - start,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      available: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Query Helper (for reading - used in dashboards, not app code)
// =============================================================================

/**
 * Execute a SELECT query against ClickHouse
 * Returns parsed JSON results
 *
 * NOTE: This is for internal tooling/dashboards, not for app code.
 * App code should use Grafana for analytics queries.
 */
export async function query<T = unknown>(sql: string): Promise<T[]> {
  const config = getConfigCached();
  if (!config) {
    throw new Error("ClickHouse not configured");
  }

  const { protocol, host, port, database, username, password } = config;

  const url = new URL(`${protocol}://${host}:${port}/`);
  url.searchParams.set("query", `${sql} FORMAT JSON`);
  url.searchParams.set("user", username);
  url.searchParams.set("password", password);
  url.searchParams.set("database", database);

  const response = await fetch(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ClickHouse query failed: ${errorText.slice(0, 500)}`);
  }

  const result = (await response.json()) as { data: T[] };
  return result.data;
}

// =============================================================================
// Type-Safe Table Inserters
// =============================================================================

type TableName =
  | "page_views"
  | "sessions"
  | "ai_usage"
  | "user_actions"
  | "api_calls"
  | "errors"
  | "cache_metrics"
  | "performance";

/**
 * Insert analytics events with type safety
 */
export function insertAnalyticsEvents(
  table: TableName,
  events: Partial<AnalyticsEvent>[]
): void {
  // Queue for batched insertion
  for (const event of events) {
    queueEvent(table, event as Record<string, unknown>);
  }
}

/**
 * Insert a single analytics event immediately
 */
export function insertAnalyticsEvent(
  table: TableName,
  event: Partial<AnalyticsEvent>
): Promise<void> {
  return insertEvents(table, [event as Record<string, unknown>]);
}
