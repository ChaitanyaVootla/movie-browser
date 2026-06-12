/**
 * Lists + list items. Four Favorites = List(kind: FOUR_FAVORITES) — one per
 * user (raw partial unique), max 4 items APP-ENFORCED here.
 * Positions are gapped integers (n*1024): drag = 1 UPDATE; renumber when a
 * gap is exhausted.
 */
import { type ListKind } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";

export const POSITION_GAP = 1024;
const FOUR_FAVORITES_MAX = 4;

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "list";
}

export interface CreateListInput {
  name: string;
  description?: string | null;
  isPublic?: boolean;
  isRanked?: boolean;
  kind?: ListKind;
}

export async function createList(ownerId: number, input: CreateListInput) {
  const base = slugify(input.name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      return await prisma.list.create({
        data: {
          ownerId,
          name: input.name,
          slug,
          description: input.description ?? null,
          isPublic: input.isPublic ?? false,
          isRanked: input.isRanked ?? false,
          kind: input.kind ?? "REGULAR",
        },
      });
    } catch (error: unknown) {
      if (isPrismaError(error) && error.code === "P2002") continue; // slug collision
      throw error;
    }
  }
  throw new Error("Could not generate a unique list slug");
}

export interface UpdateListInput {
  name?: string;
  description?: string | null;
  isPublic?: boolean;
  isRanked?: boolean;
  isPinned?: boolean;
}

export async function updateList(ownerId: number, listId: number, patch: UpdateListInput) {
  const result = await prisma.list.updateMany({
    where: { id: listId, ownerId },
    data: patch,
  });
  return result.count > 0;
}

export async function deleteList(ownerId: number, listId: number): Promise<boolean> {
  const result = await prisma.list.deleteMany({ where: { id: listId, ownerId } });
  return result.count > 0;
}

export interface ListItemRef {
  movieId?: number;
  seriesId?: number;
  personId?: number;
}

async function requireOwnedList(ownerId: number, listId: number) {
  const list = await prisma.list.findFirst({
    where: { id: listId, ownerId },
    select: { id: true, kind: true, itemCount: true },
  });
  if (!list) throw new Error("List not found");
  return list;
}

export async function addListItem(
  ownerId: number,
  listId: number,
  ref: ListItemRef,
  note?: string | null
) {
  const list = await requireOwnedList(ownerId, listId);
  if (list.kind === "FOUR_FAVORITES" && list.itemCount >= FOUR_FAVORITES_MAX) {
    throw new Error(`Four Favorites holds at most ${FOUR_FAVORITES_MAX} items`);
  }
  return prisma.$transaction(async (tx) => {
    const last = await tx.listItem.findFirst({
      where: { listId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    try {
      const item = await tx.listItem.create({
        data: {
          listId,
          movieId: ref.movieId ?? null,
          seriesId: ref.seriesId ?? null,
          personId: ref.personId ?? null,
          position: (last?.position ?? 0) + POSITION_GAP,
          note: note ?? null,
          addedById: ownerId,
        },
      });
      await tx.list.update({ where: { id: listId }, data: { itemCount: { increment: 1 } } });
      return item;
    } catch (error: unknown) {
      if (isPrismaError(error) && error.code === "P2002") {
        throw new Error("Item already on this list");
      }
      throw error;
    }
  });
}

export async function removeListItem(
  ownerId: number,
  listId: number,
  itemId: number
): Promise<boolean> {
  await requireOwnedList(ownerId, listId);
  return prisma.$transaction(async (tx) => {
    const result = await tx.listItem.deleteMany({ where: { id: itemId, listId } });
    if (result.count > 0) {
      await tx.list.update({ where: { id: listId }, data: { itemCount: { decrement: 1 } } });
    }
    return result.count > 0;
  });
}

/**
 * Move an item before the item with id `beforeItemId` (null = move to end).
 * Midpoint placement; full renumber (i+1)*1024 when the gap is exhausted.
 */
export async function moveListItem(
  ownerId: number,
  listId: number,
  itemId: number,
  beforeItemId: number | null
): Promise<void> {
  await requireOwnedList(ownerId, listId);
  await prisma.$transaction(async (tx) => {
    const items = await tx.listItem.findMany({
      where: { listId },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });
    const moving = items.find((i) => i.id === itemId);
    if (!moving) throw new Error("Item not found");

    const others = items.filter((i) => i.id !== itemId);
    const beforeIndex =
      beforeItemId === null ? others.length : others.findIndex((i) => i.id === beforeItemId);
    if (beforeIndex === -1) throw new Error("Target item not found");

    const prev = beforeIndex > 0 ? others[beforeIndex - 1].position : 0;
    const next =
      beforeIndex < others.length
        ? others[beforeIndex].position
        : (others[others.length - 1]?.position ?? 0) + POSITION_GAP * 2;

    if (next - prev > 1) {
      await tx.listItem.update({
        where: { id: itemId },
        data: { position: Math.floor((prev + next) / 2) },
      });
      return;
    }
    // Gap exhausted: renumber the whole list, then place.
    const ordered = [...others];
    ordered.splice(beforeIndex, 0, moving);
    for (let i = 0; i < ordered.length; i++) {
      await tx.listItem.update({
        where: { id: ordered[i].id },
        data: { position: (i + 1) * POSITION_GAP },
      });
    }
  });
}

export async function getOwnLists(ownerId: number) {
  return prisma.list.findMany({
    where: { ownerId },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  });
}

export async function getListWithItems(listId: number) {
  return prisma.list.findUnique({
    where: { id: listId },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          movie: { select: { id: true, title: true, posterPath: true } },
          series: { select: { id: true, name: true, posterPath: true } },
          person: { select: { id: true, name: true, profilePath: true } },
        },
      },
    },
  });
}

/**
 * Four Favorites: replace-all semantics, max 4, transactional. Find-or-create
 * the single FOUR_FAVORITES list (raw partial unique backs this up).
 */
export async function setFourFavorites(ownerId: number, refs: ListItemRef[]): Promise<void> {
  if (refs.length > FOUR_FAVORITES_MAX) {
    throw new Error(`Four Favorites holds at most ${FOUR_FAVORITES_MAX} items`);
  }
  await prisma.$transaction(async (tx) => {
    let list = await tx.list.findFirst({
      where: { ownerId, kind: "FOUR_FAVORITES" },
      select: { id: true },
    });
    if (!list) {
      list = await tx.list.create({
        data: {
          ownerId,
          kind: "FOUR_FAVORITES",
          name: "Four Favorites",
          slug: "four-favorites",
          isPublic: true,
          isPinned: true,
        },
        select: { id: true },
      });
    }
    await tx.listItem.deleteMany({ where: { listId: list.id } });
    if (refs.length > 0) {
      await tx.listItem.createMany({
        data: refs.map((ref, i) => ({
          listId: list.id,
          movieId: ref.movieId ?? null,
          seriesId: ref.seriesId ?? null,
          personId: ref.personId ?? null,
          position: (i + 1) * POSITION_GAP,
          addedById: ownerId,
        })),
      });
    }
    await tx.list.update({ where: { id: list.id }, data: { itemCount: refs.length } });
  });
}

export async function getFourFavorites(ownerId: number) {
  const list = await prisma.list.findFirst({
    where: { ownerId, kind: "FOUR_FAVORITES" },
    select: { id: true },
  });
  if (!list) return [];
  const items = await prisma.listItem.findMany({
    where: { listId: list.id },
    orderBy: { position: "asc" },
    include: {
      movie: { select: { id: true, title: true, posterPath: true } },
      series: { select: { id: true, name: true, posterPath: true } },
    },
  });
  return items;
}
