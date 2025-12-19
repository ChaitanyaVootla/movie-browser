import { NextResponse } from "next/server";
import { requireAdmin, getMongoClient } from "@/lib/auth";

/**
 * Admin API: Get all users with their activity data.
 *
 * GET /api/admin/users
 *
 * Requires admin role.
 *
 * Note: Users collection uses `sub` field (Google OAuth ID) as the user identifier.
 * Activity collections use `userId` field that matches the user's `sub` value.
 */
export async function GET() {
  try {
    // Verify admin access
    await requireAdmin();

    const clientPromise = getMongoClient();
    if (!clientPromise) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const client = await clientPromise;
    // Nuxt app uses 'test' database for user data
    const db = client.db("test");

    // Get all users from the 'users' collection
    const users = await db.collection("users").find().toArray();

    // Get user IDs (sub field from Google OAuth)
    const userSubs = users.map((u) => u.sub).filter(Boolean);

    // Activity collections to aggregate
    // Collection names are lowercase plural in MongoDB
    const collections = [
      { name: "continuewatchings", key: "ContinueWatching" },
      { name: "movieswatchlists", key: "MoviesWatchList" },
      { name: "watchedmovies", key: "WatchedMovies" },
      { name: "serieslists", key: "SeriesList" },
      { name: "recents", key: "recent" },
    ];

    // Fetch activity data in parallel
    const activityData = await Promise.all(
      collections.map(async ({ name, key }) => {
        const items = await db
          .collection(name)
          .find({ userId: { $in: userSubs } })
          .project({ userId: 1, itemId: 1, title: 1, name: 1 })
          .sort({ updatedAt: -1 })
          .toArray();
        return { key, items };
      })
    );

    // Map activity data to users
    const usersWithActivity = users.map((user) => {
      const userData: Record<string, unknown> = {
        id: user._id.toString(),
        sub: user.sub,
        name: user.name,
        email: user.email,
        picture: user.picture,
        image: user.picture,
        createdAt: user.createdAt,
        lastVisited: user.lastVisited,
        location: user.location,
      };

      // Add activity counts and items
      activityData.forEach(({ key, items }) => {
        const userItems = items.filter(
          (item) => item.userId?.toString() === user.sub?.toString()
        );
        userData[key] = userItems.length;
        userData[`${key}-items`] = userItems.slice(0, 10);
      });

      return userData;
    });

    // Sort by last visited (most recent first)
    usersWithActivity.sort((a, b) => {
      const dateA = a.lastVisited ? new Date(a.lastVisited as string).getTime() : 0;
      const dateB = b.lastVisited ? new Date(b.lastVisited as string).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json(usersWithActivity);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Authentication required") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "Admin access required") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    console.error("Admin users API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
