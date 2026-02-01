/**
 * Admin Item Details API
 *
 * Fetch raw AI data and metadata for a movie or series.
 * Used by admin UI to inspect what the AI agent sees.
 *
 * GET /api/admin/item-details?id=<tmdb_id>&type=<movie|series>
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";
import { getAIData } from "@/server/services/ai-data-service";
import { prisma } from "@/server/db/postgres";

// =============================================================================
// Request Schema
// =============================================================================

const QuerySchema = z.object({
  id: z.string().regex(/^\d+$/, "ID must be a number").transform(Number),
  type: z.enum(["movie", "series"]),
});

// =============================================================================
// GET Handler
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const params = QuerySchema.parse({
      id: searchParams.get("id"),
      type: searchParams.get("type"),
    });

    const { id, type } = params;

    adminApiLogger.info({
      event: "item_details_fetch",
      tmdbId: id,
      mediaType: type,
    });

    // Fetch AI data from PostgreSQL
    const aiData = await getAIData(id, type);

    // Fetch base item details from PostgreSQL
    let itemDetails: Record<string, unknown> | null = null;

    if (type === "movie") {
      // Note: Movie.id IS the TMDB ID (schema design)
      const movie = await prisma.movie.findUnique({
        where: { id },
        include: {
          genres: { include: { genre: true } },
          keywords: { include: { keyword: true } },
          credits: {
            include: { person: true },
            take: 10,
            orderBy: { creditOrder: "asc" },
          },
          ratings: { include: { source: true } },
          watchOptions: { include: { provider: true } },
        },
      });

      if (movie) {
        itemDetails = {
          id: movie.id,
          title: movie.title,
          originalTitle: movie.originalTitle,
          releaseDate: movie.releaseDate,
          runtime: movie.runtime,
          status: movie.status,
          overview: movie.overview,
          tagline: movie.tagline,
          popularity: movie.popularity,
          posterPath: movie.posterPath,
          backdropPath: movie.backdropPath,
          genres: movie.genres.map((g) => g.genre.name),
          keywords: movie.keywords.map((k) => k.keyword.name),
          credits: movie.credits.map((c) => ({
            name: c.person.name,
            character: c.character,
            job: c.job,
            department: c.department,
          })),
          ratings: movie.ratings.map((r) => ({
            source: r.source.name,
            score: r.score,
            voteCount: r.voteCount,
          })),
          watchOptions: movie.watchOptions.map((w) => ({
            provider: w.provider.name,
            type: w.type,
            link: w.link,
          })),
          tmdbUpdatedAt: movie.tmdbUpdatedAt,
          createdAt: movie.createdAt,
          updatedAt: movie.updatedAt,
        };
      }
    } else {
      // Note: Series.id IS the TMDB ID (schema design)
      const series = await prisma.series.findUnique({
        where: { id },
        include: {
          genres: { include: { genre: true } },
          keywords: { include: { keyword: true } },
          credits: {
            include: { person: true },
            take: 10,
            orderBy: { creditOrder: "asc" },
          },
          ratings: { include: { source: true } },
          watchOptions: { include: { provider: true } },
          networks: { include: { network: true } },
        },
      });

      if (series) {
        itemDetails = {
          id: series.id,
          name: series.name,
          originalName: series.originalName,
          firstAirDate: series.firstAirDate,
          lastAirDate: series.lastAirDate,
          status: series.status,
          overview: series.overview,
          tagline: series.tagline,
          popularity: series.popularity,
          posterPath: series.posterPath,
          backdropPath: series.backdropPath,
          numberOfSeasons: series.numberOfSeasons,
          numberOfEpisodes: series.numberOfEpisodes,
          genres: series.genres.map((g) => g.genre.name),
          keywords: series.keywords.map((k) => k.keyword.name),
          credits: series.credits.map((c) => ({
            name: c.person.name,
            character: c.character,
            job: c.job,
            department: c.department,
          })),
          ratings: series.ratings.map((r) => ({
            source: r.source.name,
            score: r.score,
            voteCount: r.voteCount,
          })),
          watchOptions: series.watchOptions.map((w) => ({
            provider: w.provider.name,
            type: w.type,
            link: w.link,
          })),
          networks: series.networks.map((n) => n.network.name),
          tmdbUpdatedAt: series.tmdbUpdatedAt,
          createdAt: series.createdAt,
          updatedAt: series.updatedAt,
        };
      }
    }

    return NextResponse.json({
      tmdbId: id,
      mediaType: type,
      aiData,
      itemDetails,
      hasAIData: !!aiData,
      hasItemDetails: !!itemDetails,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    adminApiLogger.error({
      event: "item_details_error",
      error: errorMessage,
    });

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
