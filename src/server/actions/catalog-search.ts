"use server";

import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { MediaAnchorSchema } from "@/server/services/discussion/comment-schemas";
import type { MentionSearchResultDto } from "@/types/social";

const SearchSchema = z.object({
  query: z.string().trim().min(1).max(60),
  anchor: MediaAnchorSchema,
});

const GetEntityImagesSchema = z.object({
  entityType: z.enum(["movie", "series", "person"]),
  tmdbId: z.number().int().positive(),
  seriesId: z.number().int().positive().optional(),
  seasonNumber: z.number().int().min(0).optional(),
  episodeNumber: z.number().int().min(1).optional(),
});

/**
 * Sectioned catalog search for the @-mention palette (spec §5 rung 2):
 * People (registered users) · Titles · Cast/People (catalog persons) · Episodes
 * (only when the anchor is a series). Pure catalog/user reads — NO AI.
 */
export async function searchMentionEntities(
  raw: z.infer<typeof SearchSchema>
): Promise<MentionSearchResultDto> {
  const empty: MentionSearchResultDto = { people: [], titles: [], cast: [], episodes: [] };
  try {
    const { query, anchor } = SearchSchema.parse(raw);
    const handle = query.replace(/^@/, "").toLowerCase();
    const [people, movies, series, persons] = await Promise.all([
      handle.length >= 2
        ? prisma.user.findMany({
            where: { username: { startsWith: handle, mode: "insensitive" } },
            select: { username: true, name: true, image: true },
            take: 5,
          })
        : Promise.resolve([]),
      prisma.movie.findMany({
        where: { title: { contains: query, mode: "insensitive" } },
        select: { id: true, title: true, releaseDate: true, posterPath: true },
        orderBy: { popularity: "desc" },
        take: 5,
      }),
      prisma.series.findMany({
        where: { name: { contains: query, mode: "insensitive" } },
        select: { id: true, name: true, firstAirDate: true, posterPath: true },
        orderBy: { popularity: "desc" },
        take: 5,
      }),
      prisma.person.findMany({
        where: { name: { contains: query, mode: "insensitive" } },
        select: { id: true, name: true, profilePath: true },
        orderBy: { popularity: "desc" },
        take: 5,
      }),
    ]);

    let episodes: MentionSearchResultDto["episodes"] = [];
    if (anchor.type === "series") {
      const rows = await prisma.episode.findMany({
        where: {
          season: { seriesId: anchor.seriesId },
          name: { contains: query, mode: "insensitive" },
        },
        select: {
          name: true,
          episodeNumber: true,
          stillPath: true,
          season: { select: { seasonNumber: true } },
        },
        take: 5,
      });
      episodes = rows
        .filter((e) => e.name)
        .map((e) => ({
          seriesId: anchor.seriesId,
          seasonNumber: e.season.seasonNumber,
          episodeNumber: e.episodeNumber,
          name: e.name as string,
          imagePath: e.stillPath,
        }));
    }

    return {
      people: people.flatMap((u) =>
        u.username !== null
          ? [{ username: u.username, name: u.name, image: u.image }]
          : []
      ),
      titles: [
        ...movies.map((m) => ({
          kind: "movie" as const,
          tmdbId: m.id,
          name: m.title,
          year: m.releaseDate ? new Date(m.releaseDate).getFullYear() : null,
          imagePath: m.posterPath,
        })),
        ...series.map((s) => ({
          kind: "series" as const,
          tmdbId: s.id,
          name: s.name,
          year: s.firstAirDate ? new Date(s.firstAirDate).getFullYear() : null,
          imagePath: s.posterPath,
        })),
      ],
      cast: persons.map((p) => ({ tmdbId: p.id, name: p.name, imagePath: p.profilePath })),
      episodes,
    };
  } catch (error: unknown) {
    dataLogger.error(
      {
        action: "searchMentionEntities",
        error: error instanceof Error ? error.message : String(error),
      },
      "searchMentionEntities failed"
    );
    return empty;
  }
}

/**
 * Image lookup for the catalog-image picker in the composer (spec §5 rung 4).
 * Returns TMDB file paths (to be prefixed with TMDB_IMAGE_BASE at render).
 * Falls back to prisma image table; does NOT call TMDB API (cost-safe in dev).
 */
export async function getEntityImages(
  raw: z.infer<typeof GetEntityImagesSchema>
): Promise<{ images: string[] }> {
  try {
    const input = GetEntityImagesSchema.parse(raw);
    if (input.entityType === "movie") {
      const rows = await prisma.image.findMany({
        where: { movieId: input.tmdbId, type: { in: ["BACKDROP", "POSTER"] } },
        select: { filePath: true },
        orderBy: { voteAverage: "desc" },
        take: 20,
      });
      return { images: rows.map((r) => r.filePath).filter(Boolean) as string[] };
    }
    if (input.entityType === "series") {
      const rows = await prisma.image.findMany({
        where: { seriesId: input.tmdbId, type: { in: ["BACKDROP", "POSTER"] } },
        select: { filePath: true },
        orderBy: { voteAverage: "desc" },
        take: 20,
      });
      return { images: rows.map((r) => r.filePath).filter(Boolean) as string[] };
    }
    // person: profile images
    const rows = await prisma.image.findMany({
      where: { personId: input.tmdbId, type: "PROFILE" },
      select: { filePath: true },
      orderBy: { voteAverage: "desc" },
      take: 10,
    });
    return { images: rows.map((r) => r.filePath).filter(Boolean) as string[] };
  } catch (error: unknown) {
    dataLogger.error(
      {
        action: "getEntityImages",
        error: error instanceof Error ? error.message : String(error),
      },
      "getEntityImages failed"
    );
    return { images: [] };
  }
}
