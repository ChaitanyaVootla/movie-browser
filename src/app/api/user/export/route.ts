import { NextResponse } from "next/server";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { buildUserExport } from "@/server/services/export/csv-export";

/**
 * GET /api/user/export — zip of the caller's own data (diary, ratings,
 * reviews, watchlist, lists, follows). Auth required; never cached.
 */
export async function GET() {
  try {
    const userId = await requirePgUserId();
    const { filename, zip } = await buildUserExport(userId);
    return new NextResponse(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userApiLogger.error({
      route: "/api/user/export",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
