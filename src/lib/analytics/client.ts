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
  // Analytics is OFF in dev unless explicitly opted in. Local runs have no
  // ClickHouse, and `.env` points CLICKHOUSE_HOST at the (unreachable) prod
  // instance — so without this guard every page-view/event insert awaits a
  // multi-second connect-timeout, and under rapid interaction those pile up and
  // saturate the single dev thread. Set ENABLE_DEV_ANALYTICS=true to opt in.
  if (process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_ANALYTICS !== "true") {
    return null;
  }

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
 *
 * `async_insert=1` + `wait_for_async_insert=0` make ClickHouse buffer rows
 * server-side and write parts in the background instead of creating one part
 * per INSERT — removes parts/merge churn from the many small periodic flushes.
 * Trade-off: data errors surface in ClickHouse logs, not the HTTP response.
 */
function buildInsertUrl(config: ClickHouseConfig, table: string): string {
  const { protocol, host, port, database, username, password } = config;
  const query = `INSERT INTO ${database}.${table} FORMAT JSONEachRow`;

  const url = new URL(`${protocol}://${host}:${port}/`);
  url.searchParams.set("query", query);
  url.searchParams.set("user", username);
  url.searchParams.set("password", password);
  url.searchParams.set("async_insert", "1");
  url.searchParams.set("wait_for_async_insert", "0");

  return url.toString();
}

/**
 * Convert to ClickHouse-compatible timestamp format (YYYY-MM-DD HH:MM:SS.mmm)
 */
export function toClickHouseTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace("T", " ").replace("Z", "");
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
// Batch Buffer (ALL inserts go through this — one HTTP insert per flush)
//
// On the 2-vCPU box every ClickHouse HTTP request transits docker-proxy, so
// per-event inserts at request volume burn dockerd CPU. Everything is queued
// in-process per table and flushed as a single multi-row INSERT every
// BATCH_FLUSH_INTERVAL_MS or at BATCH_SIZE events, whichever comes first.
//
// Guarantees:
// - Fire-and-forget: enqueue is synchronous, never throws into request handling
// - Bounded: queue is capped at MAX_QUEUE_SIZE per table (drop-oldest + warn)
// - Single-flight per table: at most one in-flight insert (no stampedes when
//   ClickHouse is slow; events keep queuing and flush after it settles)
// - Timestamps are stamped at enqueue time, not flush time
// - Best-effort flush on process `beforeExit`; timers are unref'd so a pending
//   flush never holds a short-lived script open
// =============================================================================

interface BatchBuffer {
  events: Record<string, unknown>[];
  flushTimeout: NodeJS.Timeout | null;
  inFlight: boolean;
  droppedSinceWarn: number;
  lastDropWarnAt: number;
}

const batchBuffers = new Map<string, BatchBuffer>();

const BATCH_SIZE = 200;
const BATCH_FLUSH_INTERVAL_MS = 5000;
/** Hard cap per table — beyond this, oldest events are dropped (memory safety) */
const MAX_QUEUE_SIZE = 5000;
/** Rate-limit overflow warnings to avoid log spam during an outage */
const DROP_WARN_INTERVAL_MS = 10_000;

let exitFlushRegistered = false;

/**
 * Register a best-effort flush when the event loop drains.
 * Lazy (on first enqueue) so importing this module has no side effects.
 */
function registerExitFlush(): void {
  if (exitFlushRegistered) {
    return;
  }
  exitFlushRegistered = true;
  process.on("beforeExit", () => {
    flushAllBuffers();
  });
}

function scheduleFlush(table: string, buffer: BatchBuffer): void {
  buffer.flushTimeout = setTimeout(() => {
    flushBuffer(table);
  }, BATCH_FLUSH_INTERVAL_MS);
  // Don't keep the process alive just for a pending analytics flush
  if (typeof buffer.flushTimeout.unref === "function") {
    buffer.flushTimeout.unref();
  }
}

/**
 * Add an event to the batch buffer for delayed insertion.
 *
 * The event's `timestamp` is captured here (enqueue time) if the caller did
 * not set one — never at flush time, and never left to ClickHouse's
 * `DEFAULT now64(3)` (which would stamp insert time, skewed by up to the
 * flush interval).
 */
export function queueEvent<T extends Record<string, unknown>>(table: string, event: T): void {
  const config = getConfigCached();
  if (!config) {
    return; // Analytics disabled
  }

  registerExitFlush();

  let buffer = batchBuffers.get(table);
  if (!buffer) {
    buffer = {
      events: [],
      flushTimeout: null,
      inFlight: false,
      droppedSinceWarn: 0,
      lastDropWarnAt: 0,
    };
    batchBuffers.set(table, buffer);
  }

  // Stamp timestamp at enqueue time (extra fields on tables without a
  // `timestamp` column are skipped by JSONEachRow, same as `event_type`)
  const stamped: Record<string, unknown> =
    event.timestamp === undefined ? { ...event, timestamp: toClickHouseTimestamp() } : event;

  buffer.events.push(stamped);

  // Bounded queue: drop oldest beyond the cap — never grow unbounded
  if (buffer.events.length > MAX_QUEUE_SIZE) {
    const overflow = buffer.events.length - MAX_QUEUE_SIZE;
    buffer.events.splice(0, overflow);
    buffer.droppedSinceWarn += overflow;
    const now = Date.now();
    if (now - buffer.lastDropWarnAt >= DROP_WARN_INTERVAL_MS) {
      dataLogger.warn({
        event: "analytics_queue_overflow",
        table,
        dropped: buffer.droppedSinceWarn,
        queueSize: buffer.events.length,
      });
      buffer.droppedSinceWarn = 0;
      buffer.lastDropWarnAt = now;
    }
  }

  // Flush if batch size reached
  if (buffer.events.length >= BATCH_SIZE) {
    flushBuffer(table);
    return;
  }

  // Set up delayed flush if not already scheduled
  if (!buffer.flushTimeout) {
    scheduleFlush(table, buffer);
  }
}

/**
 * Flush the batch buffer for a table as a single multi-row insert.
 * Single-flight: if an insert is already in progress, events keep queuing
 * and a follow-up flush runs when it settles.
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

  if (buffer.inFlight) {
    return; // The in-flight insert's completion handler re-flushes
  }

  // Take all queued events and reset buffer
  const events = buffer.events;
  buffer.events = [];
  buffer.inFlight = true;

  // Fire-and-forget insert (insertEvents never throws; logs internally)
  void insertEvents(table, events).finally(() => {
    buffer.inFlight = false;
    if (buffer.events.length >= BATCH_SIZE) {
      flushBuffer(table);
    } else if (buffer.events.length > 0 && !buffer.flushTimeout) {
      scheduleFlush(table, buffer);
    }
  });
}

/**
 * Flush all pending buffers (called on `beforeExit`; safe to call manually)
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
  | "performance"
  | "system_metrics";

/**
 * Insert analytics events with type safety
 */
export function insertAnalyticsEvents(table: TableName, events: Partial<AnalyticsEvent>[]): void {
  // Queue for batched insertion
  for (const event of events) {
    queueEvent(table, event as Record<string, unknown>);
  }
}

/**
 * Insert a single analytics event (queued — flushes within 5s or at batch size).
 * Per-event HTTP inserts are banned: each one is a docker-proxy round-trip
 * and a ClickHouse part on the 2-vCPU box.
 */
export function insertAnalyticsEvent(table: TableName, event: Partial<AnalyticsEvent>): void {
  queueEvent(table, event as Record<string, unknown>);
}
