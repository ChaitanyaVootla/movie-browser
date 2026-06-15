/**
 * User Profile Tool
 *
 * Returns a compact taste profile for personalized recommendations.
 * Ultra-lean output: top genres, recent activity with dates, counts.
 * ~200-400 tokens — designed to inform, not bloat.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { prisma } from "@/server/db/postgres";
import { getUserIdFromConfig } from "../utils";
import { aiToolLogger } from "@/lib/logger";

// =============================================================================
// Helpers
// =============================================================================

function daysAgo(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// =============================================================================
// Tool Definition
// =============================================================================

export const getUserProfileTool = tool(
  async (_input: Record<string, never>, config?: RunnableConfig) => {
    const userId = getUserIdFromConfig(config);

    if (!userId) {
      return JSON.stringify({
        error: "Not logged in",
        hint: "Suggest signing in for personalized recommendations.",
      });
    }

    try {
      // Single parallel batch: all user data in one round trip
      const [watchedMovies, watchlistCount, ratings, recentItems] = await Promise.all([
        // Recent watched with title + genres (last 8)
        prisma.watchEvent.findMany({
          where: { userId, movieId: { not: null }, kind: "WATCH" },
          orderBy: [{ watchedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          distinct: ["movieId"],
          take: 8,
          select: {
            movieId: true,
            watchedAt: true,
            createdAt: true,
            movie: {
              select: {
                title: true,
                genres: { select: { genre: { select: { name: true } } } },
              },
            },
          },
        }),
        // Watchlist size (just count)
        prisma.watchlistItem.count({ where: { userId } }),
        // All ratings (for genre analysis + stats)
        prisma.userRating.findMany({
          where: { userId },
          select: {
            rating: true,
            movie: {
              select: {
                title: true,
                genres: { select: { genre: { select: { name: true } } } },
              },
            },
            series: {
              select: {
                name: true,
                genres: { select: { genre: { select: { name: true } } } },
              },
            },
          },
        }),
        // Recent browsing activity (last 5)
        prisma.recentItem.findMany({
          where: { userId },
          orderBy: { viewedAt: "desc" },
          take: 5,
          select: {
            viewedAt: true,
            movie: { select: { title: true } },
            series: { select: { name: true } },
          },
        }),
      ]);

      // --- Build genre frequency from liked items + watched ---
      const genreCounts = new Map<string, number>();

      // Liked items (rating=1) count double
      for (const r of ratings) {
        if (r.rating !== 1) continue;
        const genres = r.movie?.genres ?? r.series?.genres ?? [];
        for (const g of genres) {
          genreCounts.set(g.genre.name, (genreCounts.get(g.genre.name) || 0) + 2);
        }
      }

      // Watched movies contribute to genre preferences
      for (const w of watchedMovies) {
        for (const g of w.movie?.genres ?? []) {
          genreCounts.set(g.genre.name, (genreCounts.get(g.genre.name) || 0) + 1);
        }
      }

      const topGenres = [...genreCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);

      // --- Compact recent watches with timing ---
      const recentWatched = watchedMovies.slice(0, 5).map((w) => ({
        title: w.movie?.title ?? "Unknown",
        when: daysAgo(w.watchedAt ?? w.createdAt),
      }));

      // --- Recently browsed (might not have watched) ---
      const recentlyBrowsed = recentItems.map((r) => ({
        title: r.movie?.title ?? r.series?.name ?? "Unknown",
        when: daysAgo(r.viewedAt),
      }));

      // --- Rating stats ---
      const likes = ratings.filter((r) => r.rating === 1).length;
      const dislikes = ratings.filter((r) => r.rating === -1).length;

      return JSON.stringify({
        topGenres,
        recentWatched,
        recentlyBrowsed,
        counts: {
          watched: watchedMovies.length >= 8 ? "8+" : watchedMovies.length,
          watchlist: watchlistCount,
          likes,
          dislikes,
        },
      });
    } catch (error: unknown) {
      aiToolLogger.error({
        event: "tool_error",
        tool: "get_user_profile",
        error: error instanceof Error ? error.message : String(error),
      });
      return JSON.stringify({ error: "Failed to fetch user profile" });
    }
  },
  {
    name: "get_user_profile",
    description: `Get the user's taste profile: top genres, recent watches, and activity counts.

Use when: Starting a conversation to personalize recs, "what should I watch?", "recommend something for me", or when you want to understand their taste.
Don't use when: User already told you what they want (specific genre, title, person).

Returns: topGenres (ranked), recentWatched (title + when), recentlyBrowsed, counts (watched, watchlist, likes, dislikes).
Use this to tailor tone and recommendations — "since you're into horror..." or "you watched X recently, try Y".`,
    schema: z.object({}),
  }
);
