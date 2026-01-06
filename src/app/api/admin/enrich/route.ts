import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";

const execAsync = promisify(exec);

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

    const { tmdbId } = await request.json();

    if (!tmdbId || typeof tmdbId !== "number") {
      return NextResponse.json(
        { error: "tmdbId is required and must be a number" },
        { status: 400 }
      );
    }

    // Step 1: Run enrichment script
    // Using npx tsx directly (works with both yarn and npm installs)
    adminApiLogger.info({ event: "enrich_start", tmdbId });
    const enrichResult = await execAsync(
      `npx tsx scripts/enrich-content.ts ${tmdbId}`,
      {
        cwd: process.cwd(),
        timeout: 120000, // 2 minute timeout
        env: { ...process.env },
      }
    );

    if (enrichResult.stderr && !enrichResult.stderr.includes("warning") && !enrichResult.stderr.includes("✅")) {
      adminApiLogger.warn({ event: "enrich_stderr", tmdbId, stderr: enrichResult.stderr.slice(0, 500) });
    }
    adminApiLogger.info({ event: "enrich_complete", tmdbId });

    // Step 2: Run AI summarization
    adminApiLogger.info({ event: "summarize_start", tmdbId });
    const summarizeResult = await execAsync(
      `npx tsx scripts/summarize-movies.ts ${tmdbId}`,
      {
        cwd: process.cwd(),
        timeout: 180000, // 3 minute timeout for AI processing
        env: { ...process.env },
      }
    );

    if (summarizeResult.stderr && !summarizeResult.stderr.includes("warning") && !summarizeResult.stderr.includes("✅")) {
      adminApiLogger.warn({ event: "summarize_stderr", tmdbId, stderr: summarizeResult.stderr.slice(0, 500) });
    }
    adminApiLogger.info({ event: "summarize_complete", tmdbId });

    return NextResponse.json({
      success: true,
      tmdbId,
      message: "Enrichment and AI summarization completed",
    });
  } catch (error) {
    // Check if it's an auth error
    if (error instanceof Error && error.message.includes("access required")) {
      adminApiLogger.warn({ event: "enrich_auth_denied", error: error.message });
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
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

