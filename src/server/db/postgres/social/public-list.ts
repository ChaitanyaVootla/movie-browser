/**
 * Public list detail read for the ISR-cached `/u/[username]/list/[slug]` page.
 *
 * EDGE-CACHE INVARIANT: this is called inside an ISR render tree. It must NEVER
 * touch `auth()` / `headers()` and must return ONLY public data — viewer/owner
 * state hydrates client-side in `owner-list-body.tsx`.
 *
 * C8: Four Favorites is excluded (`kind: "REGULAR"`) — it has its own profile
 * board and must not be double-surfaced as a standalone list page.
 */
import { prisma } from "@/server/db/postgres";
import { resolveAvatarUrl, resolveAvatarCrop, resolveAccent } from "@/lib/resolve-avatar";
import type { AvatarCrop } from "@/lib/avatar-crop";
import type { ProfileAccent } from "@/types/social";

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
  owner: {
    id: number;
    username: string;
    name: string | null;
    image: string | null;
    avatarUrl: string | null;
    avatarCrop: AvatarCrop | null;
    accent: ProfileAccent;
  };
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
 * Page-render result for `/u/[username]/list/[slug]`.
 *
 * PRIVATE intentionally carries NO name/description/items — those must never
 * enter the ISR-cached HTML for a private list. The owner's full view hydrates
 * client-side via the owner-scoped `getList` action in `owner-list-body.tsx`
 * (mirrors the profile's owner-fresh body). `null` → the list/user truly
 * doesn't exist → page 404s.
 */
export type ListPageData =
  | ({ visibility: "PUBLIC" } & PublicListData)
  | { visibility: "PRIVATE"; listId: number; owner: { username: string } };

// Prisma `select` for list items + the natural-key→display mapping, shared by
// the public read here and (indirectly, via getList) the owner-fresh body.
const LIST_ITEM_SELECT = {
  id: true,
  note: true,
  movie: { select: { id: true, title: true, posterPath: true } },
  series: { select: { id: true, name: true, posterPath: true } },
  person: { select: { id: true, name: true, profilePath: true } },
} as const;

type RawListItem = {
  id: number;
  note: string | null;
  movie: { id: number; title: string; posterPath: string | null } | null;
  series: { id: number; name: string; posterPath: string | null } | null;
  person: { id: number; name: string; profilePath: string | null } | null;
};

function mapPublicListItems(rawItems: RawListItem[]): PublicListItem[] {
  return rawItems.flatMap((it): PublicListItem[] => {
    if (it.movie) {
      return [{ id: it.id, mediaType: "movie", tmdbId: it.movie.id, title: it.movie.title, posterPath: it.movie.posterPath, note: it.note }];
    }
    if (it.series) {
      return [{ id: it.id, mediaType: "series", tmdbId: it.series.id, title: it.series.name, posterPath: it.series.posterPath, note: it.note }];
    }
    if (it.person) {
      return [{ id: it.id, mediaType: "person", tmdbId: it.person.id, title: it.person.name, posterPath: it.person.profilePath, note: it.note }];
    }
    return [];
  });
}

/**
 * Resolve a REGULAR list by `(username, slug)` for the detail page, WITHOUT
 * filtering on `isPublic`, so a private list still resolves (as a PRIVATE
 * marker, not its content). EDGE-CACHE INVARIANT holds: no `auth()`/`headers()`,
 * and private content is never returned here.
 */
export async function getListPageData(
  username: string,
  slug: string
): Promise<ListPageData | null> {
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    select: { id: true, username: true, name: true, image: true, metadata: true },
  });
  if (!user || !user.username) return null;

  const list = await prisma.list.findFirst({
    where: { ownerId: user.id, slug, kind: "REGULAR" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isRanked: true,
      isPublic: true,
      itemCount: true,
      updatedAt: true,
      createdAt: true,
      items: { orderBy: { position: "asc" }, select: LIST_ITEM_SELECT },
    },
  });
  if (!list) return null;

  // Private: return only the owner username + listId — the owner hydrates the
  // real content client-side; visitors get a generic "private" placeholder.
  if (!list.isPublic) {
    return { visibility: "PRIVATE", listId: list.id, owner: { username: user.username } };
  }

  return {
    visibility: "PUBLIC",
    owner: {
      id: user.id,
      username: user.username,
      name: user.name,
      image: user.image,
      avatarUrl: resolveAvatarUrl(user.image, user.metadata),
      avatarCrop: resolveAvatarCrop(user.metadata),
      accent: resolveAccent(user.metadata),
    },
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
    items: mapPublicListItems(list.items),
  };
}
