/**
 * PublicProfileDTO assembly. Returns null for unknown OR private users —
 * callers cannot distinguish (privacy by construction, spec §4.1.8).
 * Reads ONLY public, PUBLISHED, progress-independent data + the stats snapshot.
 */
import { prisma } from "@/server/db/postgres";
import { getUserStatsSnapshot } from "./stats";
import { getFourFavorites } from "./lists";
import { getFollowCounts } from "./follows";
import { getUserReviews } from "./reviews";
import { getProgressShelf } from "./progress";
import type {
  BreakdownSliceDTO,
  FavoriteItemDTO,
  PublicProfileDTO,
  ReviewDTO,
} from "@/types/social";

interface ProfileEnvelope {
  profile?: {
    backdrop?: { mediaType: "movie" | "series"; tmdbId: number; imagePath: string; titleName?: string };
    avatarImagePath?: string;
    accent?: string;
    links?: string[];
    location?: string;
  };
  preferences?: { logPrivatelyByDefault?: boolean };
}

export function parseEnvelope(metadata: unknown): ProfileEnvelope {
  if (typeof metadata !== "object" || metadata === null) return {};
  return metadata as ProfileEnvelope;
}

function toSlices(items: { name?: string; decade?: string; count: number }[]): BreakdownSliceDTO[] {
  return items.map((i) => ({ label: i.name ?? i.decade ?? "", count: i.count }));
}

export async function getPublicProfileByUsername(
  username: string
): Promise<PublicProfileDTO | null> {
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    select: {
      id: true, username: true, name: true, image: true, bio: true,
      isPublic: true, metadata: true, createdAt: true,
    },
  });
  if (!user || !user.isPublic || !user.username) return null;
  const env = parseEnvelope(user.metadata);

  const [snapshot, favorites, follows, reviewsPage, watching, pinnedRows, histogramRows] =
    await Promise.all([
      getUserStatsSnapshot(user.id),
      getFourFavorites(user.id),
      getFollowCounts(user.id),
      getUserReviews(user.id, { includePrivate: false, limit: 6 }),
      getProgressShelf(user.id, ["WATCHING", "REWATCHING"], 6),
      prisma.list.findMany({
        where: { ownerId: user.id, isPinned: true, isPublic: true, kind: "REGULAR" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true, name: true, slug: true, itemCount: true,
          items: {
            orderBy: { position: "asc" },
            take: 4,
            select: {
              movie: { select: { posterPath: true } },
              series: { select: { posterPath: true } },
            },
          },
        },
      }),
      prisma.userRating.groupBy({
        by: ["score"],
        where: { userId: user.id, score: { not: null } },
        _count: { _all: true },
      }),
    ]);

  const reviewUser = {
    username: user.username,
    displayName: user.name ?? user.username,
    avatarUrl: user.image,
  };
  const reviews: ReviewDTO[] = reviewsPage.reviews.map((r) => ({
    id: r.id,
    ...reviewUser,
    score: null, // own-score join intentionally omitted on the profile surface (v1)
    body: r.body,
    containsSpoilers: r.containsSpoilers,
    seasonNumber: r.seasonNumber,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
  }));

  const histogram = new Array<number>(10).fill(0);
  for (const row of histogramRows) {
    if (row.score !== null && row.score >= 1 && row.score <= 10) {
      histogram[row.score - 1] = row._count._all;
    }
  }

  const favoriteItems: FavoriteItemDTO[] = favorites.map((f) => ({
    mediaType: f.movie ? "movie" : "series",
    tmdbId: f.movie?.id ?? f.series?.id ?? 0,
    title: f.movie?.title ?? f.series?.name ?? "",
    posterPath: f.movie?.posterPath ?? f.series?.posterPath ?? null,
  }));

  return {
    username: user.username,
    displayName: user.name ?? user.username,
    avatarUrl: env.profile?.avatarImagePath ?? user.image,
    accent: (env.profile?.accent ?? "default") as PublicProfileDTO["accent"],
    bio: user.bio,
    links: env.profile?.links ?? [],
    location: env.profile?.location ?? null,
    backdrop: env.profile?.backdrop
      ? {
          mediaType: env.profile.backdrop.mediaType,
          tmdbId: env.profile.backdrop.tmdbId,
          imagePath: env.profile.backdrop.imagePath,
          titleName: env.profile.backdrop.titleName ?? "",
        }
      : null,
    joinedAt: user.createdAt.toISOString(),
    isPublic: true,
    counts: {
      followers: follows.followers,
      following: follows.following,
      filmsWatched: snapshot.moviesWatched,
      episodesWatched: snapshot.episodesWatched,
      hoursWatched: Math.round(snapshot.hoursWatched),
    },
    fourFavorites: favoriteItems,
    pinnedLists: pinnedRows.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      itemCount: l.itemCount,
      posterPaths: l.items
        .map((i) => i.movie?.posterPath ?? i.series?.posterPath)
        .filter((p): p is string => Boolean(p)),
    })),
    reviews,
    ratingsHistogram: histogram,
    topGenres: toSlices(snapshot.topGenres),
    topDecades: toSlices(snapshot.topDecades),
    currentlyWatching: watching.map((w) => ({
      seriesId: w.seriesId,
      seriesName: w.name ?? "",
      posterPath: w.posterPath,
      seasonNumber: w.lastSeasonNumber,
      episodeNumber: w.lastEpisodeNumber,
    })),
    longestStreakDays: snapshot.longestStreakDays,
    rewatchChampions: snapshot.rewatches.champions,
  };
}
