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
import { getUserComments } from "../comments";
import { getProgressShelf } from "./progress";
import { resolveAvatarUrl, resolveAvatarCrop, resolveAccent } from "@/lib/resolve-avatar";
import type {
  BreakdownSliceDTO,
  FavoriteItemDTO,
  PublicProfileDTO,
  ReviewDTO,
  ReviewImage,
} from "@/types/social";

/** images JSON is loosely typed in the DB; coerce defensively to ReviewImage[]. */
function parseReviewImages(raw: unknown): ReviewImage[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviewImage[] = [];
  for (const item of raw) {
    if (
      typeof item === "object" &&
      item !== null &&
      "entityType" in item &&
      "tmdbId" in item &&
      "imagePath" in item
    ) {
      const r = item as { entityType: unknown; tmdbId: unknown; imagePath: unknown };
      if (
        (r.entityType === "movie" ||
          r.entityType === "series" ||
          r.entityType === "episode" ||
          r.entityType === "person") &&
        typeof r.tmdbId === "number" &&
        typeof r.imagePath === "string"
      ) {
        out.push({ entityType: r.entityType, tmdbId: r.tmdbId, imagePath: r.imagePath });
      }
    }
  }
  return out;
}

interface ProfileEnvelope {
  profile?: {
    backdrop?: { mediaType: "movie" | "series"; tmdbId: number; imagePath: string; titleName?: string };
    avatarImagePath?: string;
    /** Stored avatar framing (zoom/pan). Validated via normalizeCrop before use. */
    avatarCrop?: { zoom: number; nx: number; ny: number; r: number };
    accent?: string;
    links?: string[];
    /** User-entered free-text display location for the PUBLIC profile (string). */
    displayLocation?: string;
    /**
     * Geo object `{countryCode, city, countryName, ...}` written at sign-in by
     * `lib/auth.ts` / `lib/user-location.ts` and read by the admin Users tab.
     * It is NOT a string — never render it or call `.trim()` on it. The public
     * profile's free-text location lives in `displayLocation` (they collided
     * on this key pre-Jun-2026 → `location.trim is not a function` crash).
     * Typed as the geo object (NOT a string) so a future `.trim()` is a type error.
     */
    location?: {
      countryCode?: string;
      countryName?: string;
      city?: string;
      region?: string;
      state?: string;
      timezone?: string;
      updatedAt?: string;
    };
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

  const [snapshot, favorites, follows, reviewsPage, discussions, watching, pinnedRows, histogramRows, dailyRows, recentRows] =
    await Promise.all([
      getUserStatsSnapshot(user.id),
      getFourFavorites(user.id),
      getFollowCounts(user.id),
      // ISR-cached surface: NONE-scope only — non-NONE bodies must not bake into
      // the anon-cacheable profile HTML (HARD INVARIANT 2). Spoiler reviews can
      // be a documented fast-follow to a client-loaded section.
      getUserReviews(user.id, { includePrivate: false, noneScopeOnly: true, limit: 6 }),
      // Same anon-cacheable-tier contract: PUBLISHED + NONE + circle-NULL roots only.
      getUserComments(user.id, 6),
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
      // Daily watch counts for the heatmap (public, dated, last ~26 weeks).
      prisma.$queryRaw<Array<{ day: string; count: number }>>`
        SELECT to_char(watched_at, 'YYYY-MM-DD') AS day, count(*)::int AS count
        FROM watch_events
        WHERE user_id = ${user.id} AND is_private = false AND kind = 'WATCH'
          AND watched_at IS NOT NULL AND watched_at >= now() - interval '182 days'
        GROUP BY 1
      `,
      // Most-recent watched titles for the side list (public, dated).
      prisma.$queryRaw<
        Array<{ movie_id: number | null; series_id: number | null; title: string | null; poster_path: string | null; watched_at: Date }>
      >`
        SELECT we.movie_id, we.series_id, we.watched_at,
               COALESCE(m.title, s.name) AS title,
               COALESCE(m.poster_path, s.poster_path) AS poster_path
        FROM watch_events we
        LEFT JOIN movies m ON m.id = we.movie_id
        LEFT JOIN series s ON s.id = we.series_id
        WHERE we.user_id = ${user.id} AND we.is_private = false AND we.kind = 'WATCH'
          AND we.watched_at IS NOT NULL
        ORDER BY we.watched_at DESC
        LIMIT 8
      `,
    ]);

  const reviewUser = {
    username: user.username,
    displayName: user.name ?? user.username,
    avatarUrl: resolveAvatarUrl(user.image, user.metadata),
    avatarCrop: resolveAvatarCrop(user.metadata),
    accent: resolveAccent(user.metadata),
  };
  const reviews: ReviewDTO[] = reviewsPage.reviews.map((r) => ({
    id: r.id,
    ...reviewUser,
    title: r.title,
    score: null, // own-score join intentionally omitted on the profile surface (v1)
    liked: false, // own-rating heart not joined on the profile surface (v1)
    body: r.body,
    spoilerScope: r.spoilerScope,
    scopeSeason: r.scopeSeason,
    scopeEpisode: r.scopeEpisode,
    images: parseReviewImages(r.images),
    seasonNumber: r.seasonNumber,
    likeCount: r.likeCount,
    likedByViewer: false, // viewer state never baked into the ISR-cached profile (invariant 1)
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
    // The reviewed title — lets each profile card link back to the movie/series
    // (omitted on a title's own detail page, where it would be redundant).
    media: r.movie
      ? { mediaType: "movie", tmdbId: r.movie.id, titleName: r.movie.title, posterPath: r.movie.posterPath }
      : r.series
        ? { mediaType: "series", tmdbId: r.series.id, titleName: r.series.name, posterPath: r.series.posterPath }
        : undefined,
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
    // Chosen TMDB avatar (with framing) wins over the Google photo — shared
    // resolver keeps this identical to every other surface.
    avatarUrl: resolveAvatarUrl(user.image, user.metadata),
    avatarCrop: resolveAvatarCrop(user.metadata),
    accent: (env.profile?.accent ?? "default") as PublicProfileDTO["accent"],
    bio: user.bio,
    links: env.profile?.links ?? [],
    location: typeof env.profile?.displayLocation === "string" ? env.profile.displayLocation : null,
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
    discussions,
    ratingsHistogram: histogram,
    topGenres: toSlices(snapshot.topGenres),
    topDecades: toSlices(snapshot.topDecades),
    topCountries: snapshot.topCountries,
    monthlyActivity: Object.keys(snapshot.byMonth)
      .sort()
      .slice(-12)
      .map((month) => ({ month, count: snapshot.byMonth[month] ?? 0 })),
    dailyActivity: dailyRows.map((r) => ({ day: r.day, count: Number(r.count) })),
    recentWatches: recentRows
      .map((r) => ({
        mediaType: (r.movie_id !== null ? "movie" : "series") as "movie" | "series",
        tmdbId: r.movie_id ?? r.series_id ?? 0,
        title: r.title ?? "",
        posterPath: r.poster_path,
        watchedAt: r.watched_at.toISOString(),
      }))
      .filter((r) => r.tmdbId && r.title),
    currentlyWatching: watching.map((w) => ({
      seriesId: w.seriesId,
      seriesName: w.name ?? "",
      posterPath: w.posterPath,
      seasonNumber: w.lastSeasonNumber,
      episodeNumber: w.lastEpisodeNumber,
    })),
    longestStreakDays: snapshot.longestStreakDays,
    currentStreakDays: snapshot.currentStreakDays,
    rewatchCount: snapshot.rewatches.count,
    rewatchChampions: snapshot.rewatches.champions,
    // Read-only access to the saved widget layout; typed loosely here (the
    // shared envelope stays JSON-write-safe — see updateProfileAction).
    layout: (env.profile as { layout?: unknown } | undefined)?.layout ?? null,
  };
}
