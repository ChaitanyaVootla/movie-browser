/**
 * Admin Moderation API
 *
 * GET  /api/admin/moderation?view=queue   → comments awaiting review
 * GET  /api/admin/moderation?view=reports → open user reports
 * POST /api/admin/moderation              → approve/remove comment, resolve report
 *
 * Admin-only. Reads/transitions live in the reports query layer
 * (`src/server/db/postgres/social/reports.ts`).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";
import {
  getModerationQueue,
  getOpenReports,
  approveComment,
  removeComment,
  resolveReport,
} from "@/server/db/postgres/social/reports";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const view = new URL(request.url).searchParams.get("view") ?? "queue";
    if (view === "queue") {
      const comments = await getModerationQueue();
      return NextResponse.json({ comments });
    }
    const reports = await getOpenReports();
    return NextResponse.json({ reports });
  } catch (error: unknown) {
    adminApiLogger.error(
      {
        route: "admin/moderation",
        error: error instanceof Error ? error.message : String(error),
      },
      "moderation GET failed"
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), commentId: z.number().int().positive() }),
  z.object({ action: z.literal("remove"), commentId: z.number().int().positive() }),
  z.object({
    action: z.literal("resolve_report"),
    reportId: z.number().int().positive(),
    resolution: z.enum(["RESOLVED", "DISMISSED"]),
  }),
]);

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const input = ActionSchema.parse(await request.json());
    if (input.action === "approve") {
      await approveComment(input.commentId);
    } else if (input.action === "remove") {
      await removeComment(input.commentId);
    } else {
      await resolveReport(input.reportId, input.resolution);
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    adminApiLogger.error(
      {
        route: "admin/moderation",
        error: error instanceof Error ? error.message : String(error),
      },
      "moderation POST failed"
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
