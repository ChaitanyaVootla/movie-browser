import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAdminUsersWithActivity } from "@/server/db/user-data";
import { userApiLogger } from "@/lib/logger";

/**
 * Admin API: Get all users with their activity data.
 *
 * GET /api/admin/users
 *
 * Requires admin role.
 */
export async function GET() {
  try {
    // Verify admin access
    await requireAdmin();

    const usersWithActivity = await getAdminUsersWithActivity();

    return NextResponse.json(usersWithActivity);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "Authentication required") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "Admin access required") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    userApiLogger.error({
      route: "/api/admin/users",
      event: "fetch_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
