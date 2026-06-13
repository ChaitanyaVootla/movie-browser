/**
 * Full CSV export of a user's own data — the trust mirror of demanding
 * lossless imports from Letterboxd/Trakt (spec §4.2 social plumbing).
 * Includes PRIVATE entries: it is the owner's own data.
 */
import { strToU8, zipSync } from "fflate";
import { prisma } from "@/server/db/postgres";
import { toCsv } from "@/server/services/import/csv";

function iso(d: Date | null): string {
  return d ? d.toISOString() : "";
}

export async function buildUserExport(
  userId: number
): Promise<{ filename: string; zip: Uint8Array }> {
  const [events, ratings, reviews, watchlist, lists, follows] = await Promise.all([
    prisma.watchEvent.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      include: {
        movie: { select: { title: true } },
        series: { select: { name: true } },
      },
    }),
    prisma.userRating.findMany({
      where: { userId },
      include: {
        movie: { select: { title: true } },
        series: { select: { name: true } },
      },
    }),
    prisma.userReview.findMany({
      where: { userId },
      include: {
        movie: { select: { title: true } },
        series: { select: { name: true } },
      },
    }),
    prisma.watchlistItem.findMany({
      where: { userId },
      include: {
        movie: { select: { title: true } },
        series: { select: { name: true } },
      },
    }),
    prisma.list.findMany({
      where: { ownerId: userId },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: {
            movie: { select: { title: true } },
            series: { select: { name: true } },
            person: { select: { name: true } },
          },
        },
      },
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      include: { following: { select: { username: true, name: true } } },
    }),
  ]);

  const diaryCsv = toCsv(
    ["Type", "Title", "TmdbId", "Season", "Episode", "WatchedAt", "Precision", "Rewatch", "Private", "Source", "Tags", "Note"],
    events.map((e) => [
      e.movieId !== null ? "movie" : "series",
      e.movie?.title ?? e.series?.name ?? "",
      String(e.movieId ?? e.seriesId ?? ""),
      e.seasonNumber !== null ? String(e.seasonNumber) : "",
      e.episodeNumber !== null ? String(e.episodeNumber) : "",
      iso(e.watchedAt),
      e.watchedAtPrecision,
      String(e.isRewatch),
      String(e.isPrivate),
      e.source,
      e.tags.join(", "),
      e.note ?? "",
    ])
  );

  const ratingsCsv = toCsv(
    ["Type", "Title", "TmdbId", "Score", "Thumb", "RatedAt"],
    ratings.map((r) => [
      r.movieId !== null ? "movie" : "series",
      r.movie?.title ?? r.series?.name ?? "",
      String(r.movieId ?? r.seriesId ?? ""),
      r.score !== null ? String(r.score) : "",
      r.rating !== null ? String(r.rating) : "",
      iso(r.ratedAt),
    ])
  );

  const reviewsCsv = toCsv(
    ["Type", "Title", "TmdbId", "Season", "Spoilers", "Private", "Status", "CreatedAt", "Body"],
    reviews.map((r) => [
      r.movieId !== null ? "movie" : "series",
      r.movie?.title ?? r.series?.name ?? "",
      String(r.movieId ?? r.seriesId ?? ""),
      r.seasonNumber !== null ? String(r.seasonNumber) : "",
      String(r.containsSpoilers),
      String(r.isPrivate),
      r.status,
      iso(r.createdAt),
      r.body,
    ])
  );

  const watchlistCsv = toCsv(
    ["Type", "Title", "TmdbId", "AddedAt", "Position", "Note"],
    watchlist.map((w) => [
      w.movieId !== null ? "movie" : "series",
      w.movie?.title ?? w.series?.name ?? "",
      String(w.movieId ?? w.seriesId ?? ""),
      iso(w.addedAt),
      w.position !== null ? String(w.position) : "",
      w.note ?? "",
    ])
  );

  const listsCsv = toCsv(
    ["List", "Kind", "Public", "Position", "ItemType", "Title", "TmdbId", "Note"],
    lists.flatMap((l) =>
      l.items.map((i) => [
        l.name,
        l.kind,
        String(l.isPublic),
        String(i.position),
        i.movieId !== null ? "movie" : i.seriesId !== null ? "series" : "person",
        i.movie?.title ?? i.series?.name ?? i.person?.name ?? "",
        String(i.movieId ?? i.seriesId ?? i.personId ?? ""),
        i.note ?? "",
      ])
    )
  );

  const followsCsv = toCsv(
    ["Username", "Name", "FollowedAt"],
    follows.map((f) => [f.following.username ?? "", f.following.name ?? "", iso(f.createdAt)])
  );

  const zip = zipSync({
    "diary.csv": strToU8(diaryCsv),
    "ratings.csv": strToU8(ratingsCsv),
    "reviews.csv": strToU8(reviewsCsv),
    "watchlist.csv": strToU8(watchlistCsv),
    "lists.csv": strToU8(listsCsv),
    "follows.csv": strToU8(followsCsv),
  });

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return { filename: `movie-browser-export-${stamp}.zip`, zip };
}
