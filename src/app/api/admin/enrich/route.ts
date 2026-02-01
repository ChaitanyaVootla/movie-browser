import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";
import { cacheDel } from "@/lib/cache-service";

const execAsync = promisify(exec);

/**
 * Zod schema for validating request - ensures tmdbId is a positive integer
 * and mediaType is valid to prevent command injection attacks.
 */
const EnrichRequestSchema = z.object({
  tmdbId: z.number().int().positive().max(999999999), // TMDB IDs are positive integers
  mediaType: z.enum(["movie", "series"]).default("movie"),
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
 * Triggers content enrichment + AI summarization for a movie or series.
 * Admin-only endpoint.
 *
 * Steps:
 * 1. Run enrich script - fetches data from TMDB, Wikipedia, IMDb, etc.
 * 2. Run summarize script - generates AI summary from enriched data
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

    const { tmdbId, mediaType } = validationResult.data;
    const safeTmdbId = sanitizeTmdbId(tmdbId);

    // Select the appropriate scripts based on mediaType
    const enrichScript =
      mediaType === "series" ? "scripts/enrich-series.ts" : "scripts/enrich-content.ts";
    const summarizeScript = "scripts/summarize-movies.ts"; // Works for both movies and series

    // Step 1: Run enrichment script
    // Using npx tsx directly (works with both yarn and npm installs)
    // safeTmdbId is guaranteed to be a clean numeric string after Zod validation + sanitization
    adminApiLogger.info({ event: "enrich_start", tmdbId: safeTmdbId, mediaType });
    const enrichResult = await execAsync(`npx tsx ${enrichScript} ${safeTmdbId}`, {
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
        mediaType,
        stderr: enrichResult.stderr.slice(0, 500),
      });
    }
    adminApiLogger.info({ event: "enrich_complete", tmdbId: safeTmdbId, mediaType });

    // Step 2: Run AI summarization (--force to regenerate even if exists)
    // Pass --media-type to ensure correct table is used (series might not be in PostgreSQL yet)
    adminApiLogger.info({ event: "summarize_start", tmdbId: safeTmdbId, mediaType });
    const summarizeResult = await execAsync(
      `npx tsx ${summarizeScript} ${safeTmdbId} --force --media-type=${mediaType}`,
      {
        cwd: process.cwd(),
        timeout: 180000, // 3 minute timeout for AI processing
        env: { ...process.env },
      }
    );

    if (
      summarizeResult.stderr &&
      !summarizeResult.stderr.includes("warning") &&
      !summarizeResult.stderr.includes("✅")
    ) {
      adminApiLogger.warn({
        event: "summarize_stderr",
        tmdbId: safeTmdbId,
        mediaType,
        stderr: summarizeResult.stderr.slice(0, 500),
      });
    }
    adminApiLogger.info({ event: "summarize_complete", tmdbId: safeTmdbId, mediaType });

    // Revalidate Next.js page cache
    const pagePath = mediaType === "movie" ? `/movie/${safeTmdbId}` : `/series/${safeTmdbId}`;
    revalidatePath(pagePath);

    // Invalidate L1/L2 cache for TMDB data (in case it was fetched during this session)
    // The cache key format matches buildCacheKey in tmdb.ts
    const cacheNamespace = mediaType === "movie" ? "movie" : "series";
    const tmdbEndpoint =
      mediaType === "movie"
        ? `/movie/${safeTmdbId}?append_to_response=credits,videos,images,keywords,recommendations,external_ids,watch/providers,reviews&include_image_language=en,null`
        : `/tv/${safeTmdbId}?append_to_response=credits,aggregate_credits,videos,images,keywords,recommendations,external_ids,watch/providers,content_ratings,reviews&include_image_language=en,null`;
    cacheDel(cacheNamespace, tmdbEndpoint);

    adminApiLogger.info({
      event: "page_revalidated",
      tmdbId: safeTmdbId,
      mediaType,
      pagePath,
      cacheInvalidated: true,
    });

    return NextResponse.json({
      success: true,
      tmdbId: Number(safeTmdbId),
      mediaType,
      message: `Enrichment and AI summarization completed for ${mediaType}`,
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
