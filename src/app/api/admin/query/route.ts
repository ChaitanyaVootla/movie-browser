/**
 * Admin SQL Query API
 *
 * Execute read-only SQL queries against ClickHouse for analytics exploration.
 * Protected - requires admin role.
 *
 * POST /api/admin/query
 * Body: { sql: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";
import { query } from "@/lib/analytics/client";

// =============================================================================
// Configuration
// =============================================================================

const MAX_ROWS = 10000;
const QUERY_TIMEOUT_MS = 30000;

// =============================================================================
// SQL Safety Validation
// =============================================================================

/**
 * Dangerous SQL keywords that indicate write operations.
 * Must reject any query containing these (case-insensitive).
 */
const DANGEROUS_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "CREATE",
  "REPLACE",
  "RENAME",
  "GRANT",
  "REVOKE",
  "ATTACH",
  "DETACH",
  "OPTIMIZE",
  "KILL",
  "SYSTEM",
];

/**
 * Check if SQL query is safe (read-only).
 * Returns error message if unsafe, null if safe.
 */
function validateSqlSafety(sql: string): string | null {
  const normalizedSql = sql.toUpperCase().trim();

  // Must start with SELECT or WITH (for CTEs)
  if (!normalizedSql.startsWith("SELECT") && !normalizedSql.startsWith("WITH")) {
    return "Query must start with SELECT or WITH";
  }

  // Check for dangerous keywords
  for (const keyword of DANGEROUS_KEYWORDS) {
    // Use word boundary regex to avoid false positives (e.g., "UPDATED_AT" column)
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(normalizedSql)) {
      return `Query contains forbidden keyword: ${keyword}`;
    }
  }

  // Check for multiple statements (semicolon followed by non-whitespace)
  const withoutStrings = sql.replace(/'[^']*'/g, ""); // Remove string literals
  if (/;\s*\S/.test(withoutStrings)) {
    return "Multiple statements are not allowed";
  }

  return null;
}

/**
 * Add LIMIT clause if not present.
 */
function ensureLimit(sql: string): string {
  const normalizedSql = sql.toUpperCase().trim();

  // Check if already has LIMIT
  if (/\bLIMIT\s+\d+/i.test(normalizedSql)) {
    // Extract existing limit and cap it
    const limitMatch = normalizedSql.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) {
      const existingLimit = parseInt(limitMatch[1], 10);
      if (existingLimit > MAX_ROWS) {
        // Replace with max limit
        return sql.replace(/\bLIMIT\s+\d+/i, `LIMIT ${MAX_ROWS}`);
      }
    }
    return sql;
  }

  // Add LIMIT clause
  const trimmedSql = sql.trim().replace(/;?\s*$/, "");
  return `${trimmedSql} LIMIT ${MAX_ROWS}`;
}

// =============================================================================
// Request Schema
// =============================================================================

const QueryRequestSchema = z.object({
  sql: z.string().min(1, "SQL query is required").max(10000, "Query too long"),
});

// =============================================================================
// POST Handler
// =============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify admin access
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Parse and validate request body
    const body = await request.json();
    const { sql } = QueryRequestSchema.parse(body);

    // Validate SQL safety
    const safetyError = validateSqlSafety(sql);
    if (safetyError) {
      adminApiLogger.warn({
        event: "query_rejected",
        reason: safetyError,
        sql: sql.slice(0, 200),
      });
      return NextResponse.json({ error: safetyError }, { status: 400 });
    }

    // Add limit if not present
    const safeSql = ensureLimit(sql);

    adminApiLogger.info({
      event: "query_executing",
      sqlLength: safeSql.length,
      preview: safeSql.slice(0, 100),
    });

    // Execute query with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

    try {
      const data = await Promise.race([
        query<Record<string, unknown>>(safeSql),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error(`Query timeout after ${QUERY_TIMEOUT_MS}ms`));
          });
        }),
      ]);

      clearTimeout(timeoutId);

      const executionTimeMs = Date.now() - startTime;

      adminApiLogger.info({
        event: "query_success",
        rowCount: data.length,
        executionTimeMs,
      });

      return NextResponse.json({
        data,
        rowCount: data.length,
        executionTimeMs,
        truncated: data.length >= MAX_ROWS,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error: unknown) {
    const executionTimeMs = Date.now() - startTime;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    adminApiLogger.error({
      event: "query_error",
      error: errorMessage,
      executionTimeMs,
    });

    // Return user-friendly error message
    const userMessage = errorMessage.includes("timeout")
      ? "Query timed out. Try a simpler query or add stricter filters."
      : errorMessage.includes("not configured")
        ? "ClickHouse is not configured"
        : `Query failed: ${errorMessage}`;

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
