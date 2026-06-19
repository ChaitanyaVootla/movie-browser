/**
 * Public list detail read for the ISR-cached `/u/[username]/list/[slug]` page.
 *
 * EDGE-CACHE INVARIANT: this is called inside an ISR render tree. It must NEVER
 * touch `auth()` / `headers()` and must return ONLY public data — viewer/owner
 * state hydrates client-side in `list-detail-client.tsx`.
 *
 * C8: Four Favorites is excluded (`kind: "REGULAR"`) — it has its own profile
 * board and must not be double-surfaced as a standalone list page.
 */
import { prisma } from "@/server/db/postgres";

export interface PublicListItem {
  id: number;
  mediaType: "movie" | "series" | "person";
  /** TMDB id (movie/series) or internal person id, used for the link. */
  tmdbId: number;
  title: string;
  /** Bare TMDB poster/profile file path (prefix with TMDB_IMAGE_BASE/wNNN). */
  posterPath: string | null;
  note: string | null;
}

export interface PublicListData {
  owner: { id: number; username: string; name: string | null; image: string | null };
  list: {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    isRanked: boolean;
    itemCount: number;
    updatedAt: Date;
    createdAt: Date;
  };
  items: PublicListItem[];
}

/**
 * Resolve a public REGULAR list by `(username, slug)`. Returns `null` when the
 * user, the list, or its public flag is missing — the page `notFound()`s on null.
 */
export async function getPublicListBySlug(
  username: string,
  slug: string
): Promise<PublicListData | null> {
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    select: { id: true, username: true, name: true, image: true },
  });
  if (!user || !user.username) return null;

  const list = await prisma.list.findFirst({
    where: { ownerId: user.id, slug, isPublic: true, kind: "REGULAR" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isRanked: true,
      itemCount: true,
      updatedAt: true,
      createdAt: true,
      items: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          note: true,
          movie: { select: { id: true, title: true, posterPath: true } },
          series: { select: { id: true, name: true, posterPath: true } },
          person: { select: { id: true, name: true, profilePath: true } },
        },
      },
    },
  });
  if (!list) return null;

  const items: PublicListItem[] = list.items.flatMap((it): PublicListItem[] => {
    if (it.movie) {
      return [
        {
          id: it.id,
          mediaType: "movie",
          tmdbId: it.movie.id,
          title: it.movie.title,
          posterPath: it.movie.posterPath,
          note: it.note,
        },
      ];
    }
    if (it.series) {
      return [
        {
          id: it.id,
          mediaType: "series",
          tmdbId: it.series.id,
          title: it.series.name,
          posterPath: it.series.posterPath,
          note: it.note,
        },
      ];
    }
    if (it.person) {
      return [
        {
          id: it.id,
          mediaType: "person",
          tmdbId: it.person.id,
          title: it.person.name,
          posterPath: it.person.profilePath,
          note: it.note,
        },
      ];
    }
    return [];
  });

  return {
    owner: { id: user.id, username: user.username, name: user.name, image: user.image },
    list: {
      id: list.id,
      name: list.name,
      slug: list.slug,
      description: list.description,
      isRanked: list.isRanked,
      itemCount: list.itemCount,
      updatedAt: list.updatedAt,
      createdAt: list.createdAt,
    },
    items,
  };
}
