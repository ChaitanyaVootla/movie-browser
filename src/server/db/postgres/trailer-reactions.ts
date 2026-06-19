import { prisma, Prisma } from "@/server/db/postgres";

/**
 * Top-comments JSON from the title's most-engaged trailer/teaser, for the
 * discussion empty-state "From around the web" panel. Pure cacheable PG read —
 * no network, no viewer data — so it is safe in ISR-cached render trees.
 * Returns `null` when the title has no trailer with stored comments (the
 * WebReactions component then renders nothing — graceful degrade).
 */
export async function getTrailerReactions(
  mediaType: "movie" | "series",
  id: number,
): Promise<unknown> {
  const where =
    mediaType === "movie" ? { movieId: id } : { seriesId: id };

  const video = await prisma.video.findFirst({
    where: {
      ...where,
      topComments: { not: Prisma.DbNull },
    },
    orderBy: { viewCount: "desc" },
    select: { topComments: true },
  });

  return video?.topComments ?? null;
}
