/**
 * Structured Logger (Pino)
 *
 * Centralized logging for the application with support for:
 * - Structured JSON logging
 * - Log levels (debug, info, warn, error)
 * - Module-specific child loggers
 * - Pretty printing in development
 *
 * Categories:
 * - ai: AI agent core operations (invocations, turns, responses)
 * - ai:tool: AI tool calls and results
 * - api: API route operations
 * - api:user: User library API routes
 * - api:admin: Admin API routes
 * - data: Data fetching operations (movies, series, persons)
 * - tmdb: TMDB API service
 * - auth: Authentication operations
 * - usage: Token usage and cost tracking
 */

import pino from "pino";

// Determine if we're in development
const isDev = process.env.NODE_ENV !== "production";

// Base logger configuration
const baseConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  // Add timestamp and custom fields
  base: {
    env: process.env.NODE_ENV || "development",
  },
  // Custom timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Create the logger - use pino-pretty in dev for readable output
const logger = isDev
  ? pino({
      ...baseConfig,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname,env",
        },
      },
    })
  : pino(baseConfig);

// =============================================================================
// Module-Specific Loggers
// =============================================================================

/**
 * AI Agent logger - for core AI agent operations
 * Use for: invocations, turns, responses, streaming
 */
export const aiLogger = logger.child({ module: "ai" });

/**
 * AI Tool logger - for AI tool calls and results
 * Use for: tool execution, tool errors, tool debug
 */
export const aiToolLogger = logger.child({ module: "ai:tool" });

/**
 * Usage/Cost logger - for tracking LLM costs and token usage
 * This is the primary logger for building usage dashboards
 */
export const usageLogger = logger.child({ module: "usage" });

/**
 * API logger - for general API route operations
 */
export const apiLogger = logger.child({ module: "api" });

/**
 * User API logger - for user library API routes
 * Use for: watchlist, ratings, watched, recents, continue watching
 */
export const userApiLogger = logger.child({ module: "api:user" });

/**
 * Admin API logger - for admin API routes
 * Use for: enrich, user management
 */
export const adminApiLogger = logger.child({ module: "api:admin" });

/**
 * Data logger - for data fetching operations
 * Use for: movie/series/person data fetching, MongoDB queries
 */
export const dataLogger = logger.child({ module: "data" });

/**
 * TMDB Service logger - for TMDB API interactions
 */
export const tmdbLogger = logger.child({ module: "tmdb" });

/**
 * Auth logger - for authentication operations
 */
export const authLogger = logger.child({ module: "auth" });

/**
 * Analytics logger - for analytics event tracking
 * Use for: event ingestion, ClickHouse operations
 */
export const analyticsLogger = logger.child({ module: "analytics" });

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a request-scoped logger with trace ID
 * Useful for tracing requests through the system
 */
export function createRequestLogger(baseLogger: pino.Logger, requestId?: string) {
  return baseLogger.child({
    requestId: requestId || generateRequestId(),
  });
}

/**
 * Generate a simple request ID
 */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Log an API error with consistent structure
 */
export function logApiError(
  logger: pino.Logger,
  route: string,
  error: unknown,
  context?: Record<string, unknown>
) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  logger.error({
    route,
    error: errorMessage,
    stack: errorStack,
    ...context,
  });
}

/**
 * Log a tool execution with timing
 */
export function logToolExecution(
  toolName: string,
  args: unknown,
  result: string,
  durationMs: number,
  error?: unknown
) {
  const logData: Record<string, unknown> = {
    tool: toolName,
    args,
    resultSize: result.length,
    durationMs,
  };

  if (error) {
    logData.error = error instanceof Error ? error.message : String(error);
    aiToolLogger.error(logData, `Tool ${toolName} failed`);
  } else {
    aiToolLogger.debug(logData, `Tool ${toolName} completed`);
  }
}

// =============================================================================
// Type Definitions
// =============================================================================

export type LogModule =
  | "ai"
  | "ai:tool"
  | "usage"
  | "api"
  | "api:user"
  | "api:admin"
  | "data"
  | "tmdb"
  | "auth"
  | "analytics";

// =============================================================================
// Default Export
// =============================================================================

export default logger;
