import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";

const execAsync = promisify(exec);

/**
 * Zod schema for validating tmdbId - ensures it's a positive integer
 * to prevent command injection attacks.
 */
const EnrichRequestSchema = z.object({
  tmdbId: z.number().int().positive().max(999999999), // TMDB IDs are positive integers
});

/**
 * Sanitize tmdbId for use in shell command.
 * After Zod validation, this provides defense-in-depth by:
 * 1. Converting to number (removing any string content)
 * 2. Using String() to ensure clean string representation
 */
function sanitizeTmdbId(tmdbId: number): string {
  // Already validated as positive integer by Zod
  // Convert to ensure no prototype pollution or injection
  const sanitized = Math.floor(Math.abs(tmdbId));
  return String(sanitized);
}

/**
 * POST /api/admin/enrich
 * Triggers content enrichment + AI summarization for a movie.
 * Admin-only endpoint.
 *
 * Steps:
 * 1. yarn enrich <tmdbId> - fetches data from TMDB, Wikipedia, IMDb, etc.
 * 2. yarn summarize <tmdbId> - generates AI summary from enriched data
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    await requireAdmin();

    const body = await request.json();

    // Validate request body with Zod schema
    const validationResult = EnrichRequestSchema.safeParse(body);
    if (!validationResult.success) {
      adminApiLogger.warn({
        event: "enrich_validation_failed",
        errors: validationResult.error.flatten(),
      });
      return NextResponse.json(
        { error: "tmdbId is required and must be a positive integer" },
        { status: 400 }
      );
    }

    const { tmdbId } = validationResult.data;
    const safeTmdbId = sanitizeTmdbId(tmdbId);

    // Step 1: Run enrichment script
    // Using npx tsx directly (works with both yarn and npm installs)
    // safeTmdbId is guaranteed to be a clean numeric string after Zod validation + sanitization
    adminApiLogger.info({ event: "enrich_start", tmdbId: safeTmdbId });
    const enrichResult = await execAsync(`npx tsx scripts/enrich-content.ts ${safeTmdbId}`, {
      cwd: process.cwd(),
      timeout: 120000, // 2 minute timeout
      env: { ...process.env },
    });

    if (
      enrichResult.stderr &&
      !enrichResult.stderr.includes("warning") &&
      !enrichResult.stderr.includes("✅")
    ) {
      adminApiLogger.warn({
        event: "enrich_stderr",
        tmdbId: safeTmdbId,
        stderr: enrichResult.stderr.slice(0, 500),
      });
    }
    adminApiLogger.info({ event: "enrich_complete", tmdbId: safeTmdbId });

    // Step 2: Run AI summarization
    adminApiLogger.info({ event: "summarize_start", tmdbId: safeTmdbId });
    const summarizeResult = await execAsync(`npx tsx scripts/summarize-movies.ts ${safeTmdbId}`, {
      cwd: process.cwd(),
      timeout: 180000, // 3 minute timeout for AI processing
      env: { ...process.env },
    });

    if (
      summarizeResult.stderr &&
      !summarizeResult.stderr.includes("warning") &&
      !summarizeResult.stderr.includes("✅")
    ) {
      adminApiLogger.warn({
        event: "summarize_stderr",
        tmdbId: safeTmdbId,
        stderr: summarizeResult.stderr.slice(0, 500),
      });
    }
    adminApiLogger.info({ event: "summarize_complete", tmdbId: safeTmdbId });

    return NextResponse.json({
      success: true,
      tmdbId: Number(safeTmdbId),
      message: "Enrichment and AI summarization completed",
    });
  } catch (error) {
    // Check if it's an auth error
    if (error instanceof Error && error.message.includes("access required")) {
      adminApiLogger.warn({ event: "enrich_auth_denied", error: error.message });
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    adminApiLogger.error({
      event: "enrich_error",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Enrichment failed" },
      { status: 500 }
    );
  }
}
