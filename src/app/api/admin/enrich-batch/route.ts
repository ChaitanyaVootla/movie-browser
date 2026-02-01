/**
 * Batch Enrichment API
 *
 * POST /api/admin/enrich-batch
 * Triggers background enrichment of popular content.
 * Admin-only endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";
import { runEnrichJob, type EnrichJobOptions } from "@/server/jobs/enrich-popular";

const RequestSchema = z.object({
  mediaType: z.enum(["movie", "series", "both"]).default("both"),
  strategy: z.enum(["popular", "recent", "missing"]).default("popular"),
  limit: z.number().int().min(1).max(50).default(10),
  dryRun: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    // Admin check
    await requireAdmin();

    // Parse and validate request
    const body = await request.json();
    const options = RequestSchema.parse(body) as EnrichJobOptions;

    adminApiLogger.info({ event: "enrich_batch_start", options }, "Starting batch enrichment");

    // Run the job
    const result = await runEnrichJob(options);

    adminApiLogger.info(
      {
        event: "enrich_batch_complete",
        processed: result.processed,
        successful: result.successful,
        failed: result.failed,
      },
      "Batch enrichment completed"
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    // Check for auth error
    if (error instanceof Error && error.message.includes("access required")) {
      adminApiLogger.warn({ event: "enrich_batch_auth_denied" }, "Admin access denied");
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      adminApiLogger.warn(
        { event: "enrich_batch_validation_failed", errors: error.flatten() },
        "Validation failed"
      );
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    adminApiLogger.error(
      {
        event: "enrich_batch_error",
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Batch enrichment failed"
    );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
