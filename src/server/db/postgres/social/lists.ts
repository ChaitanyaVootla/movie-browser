/**
 * Lists + list items. Four Favorites = List(kind: FOUR_FAVORITES) — one per
 * user (raw partial unique), max 4 items APP-ENFORCED here.
 * Positions are gapped integers (n*1024): drag = 1 UPDATE; renumber when a
 * gap is exhausted.
 */
import { Prisma, type ListKind } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { auditedTransaction } from "@/server/db/audit";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";

/** Global client or an interactive-tx client (the latter carries audit actor). */
type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Pure visibility predicate. PHASE-3 SEAM: when circles/collaborators land,
 * widen this (and canViewList/canEditList) — do NOT inline ownerId checks at
 * call sites. Kept synchronous + dependency-free so it's trivially testable and
 * reusable by `getList` after it has already fetched the list (no double-query).
 */
export function isListViewable(
  list: { ownerId: number; isPublic: boolean },
  viewerId: number | null
): boolean {
  return list.isPublic || (viewerId != null && list.ownerId === viewerId);
}

/**
 * Single choke point for list visibility. PHASE-3 SEAM: when circles land,
 * extend ONLY this (and canEditList) to also allow circle members /
 * ListCollaborator rows.
 */
export async function canViewList(
  listId: number,
  viewerId: number | null,
  db: Db = prisma
): Promise<boolean> {
  const list = await db.list.findUnique({
    where: { id: listId },
    select: { ownerId: true, isPublic: true /* PHASE 3: circleId */ },
  });
  if (!list) return false;
  return isListViewable(list, viewerId);
}

/** PHASE-3 SEAM: widen to circle ADMIN/OWNER + collaborators with edit perm. */
export async function canEditList(
  listId: number,
  viewerId: number | null,
  db: Db = prisma
): Promise<boolean> {
  if (viewerId == null) return false;
  const list = await db.list.findUnique({
    where: { id: listId },
    select: { ownerId: true /* PHASE 3: circleId, isCollaborative */ },
  });
  return !!list && list.ownerId === viewerId;
}

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
      // Wrap PER-ATTEMPT (C2): a P2002 inside an interactive tx aborts that tx,
      // so the next attempt's create needs a FRESH transaction.
      return await auditedTransaction(ownerId, (tx) =>
        tx.list.create({
          data: {
            ownerId,
            name: input.name,
            slug,
            description: input.description ?? null,
            isPublic: input.isPublic ?? false,
            isRanked: input.isRanked ?? false,
            kind: input.kind ?? "REGULAR",
          },
        })
      );
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
  return auditedTransaction(ownerId, async (tx) => {
    const result = await tx.list.updateMany({
      where: { id: listId, ownerId },
      data: patch,
    });
    return result.count > 0;
  });
}

export async function deleteList(ownerId: number, listId: number): Promise<boolean> {
  return auditedTransaction(ownerId, async (tx) => {
    const result = await tx.list.deleteMany({ where: { id: listId, ownerId } });
    return result.count > 0;
  });
}

export interface ListItemRef {
  movieId?: number;
  seriesId?: number;
  personId?: number;
}

async function requireOwnedList(ownerId: number, listId: number) {
  // Funnel ownership through the access seam (PHASE-3 forward-compat); the
  // findUnique below then loads the fields the mutations need.
  if (!(await canEditList(listId, ownerId))) throw new Error("List not found");
  const list = await prisma.list.findUnique({
    where: { id: listId },
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
  return auditedTransaction(ownerId, async (tx) => {
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
  return auditedTransaction(ownerId, async (tx) => {
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
  // moveListItem touches no `lists` row (pure reorder) → no `lists` audit row by
  // design; the list_items UPDATEs it makes DO audit (C1/C2).
  await auditedTransaction(ownerId, async (tx) => {
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
 * One membership row per REGULAR list, annotated with whether a given ref is on
 * it. Shared by the db query, the server action, and the client picker hook
 * (imported type-only into the `"use client"` hook — erased at compile).
 */
export interface ListMembershipRow {
  listId: number;
  name: string;
  kind: ListKind;
  itemCount: number;
  isPublic: boolean;
  contains: boolean;
  itemId: number | null; // ListItem.id when contains, for removal
}

/**
 * The user's REGULAR lists (FOUR_FAVORITES excluded — it has its own editor)
 * annotated with whether `ref` is already on each. One query for lists, one for
 * the matching items. Used only by the save picker (client-hydrated, never SSR).
 */
export async function getItemListMembership(
  ownerId: number,
  ref: ListItemRef,
  db: Db = prisma
): Promise<ListMembershipRow[]> {
  const lists = await db.list.findMany({
    where: { ownerId, kind: "REGULAR" },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    select: { id: true, name: true, kind: true, itemCount: true, isPublic: true },
  });
  if (lists.length === 0) return [];
  const items = await db.listItem.findMany({
    where: {
      listId: { in: lists.map((l) => l.id) },
      movieId: ref.movieId ?? null,
      seriesId: ref.seriesId ?? null,
      personId: ref.personId ?? null,
    },
    select: { id: true, listId: true },
  });
  const byList = new Map(items.map((i) => [i.listId, i.id]));
  return lists.map((l) => ({
    listId: l.id,
    name: l.name,
    kind: l.kind,
    itemCount: l.itemCount,
    isPublic: l.isPublic,
    contains: byList.has(l.id),
    itemId: byList.get(l.id) ?? null,
  }));
}

/**
 * Four Favorites: replace-all semantics, max 4, transactional. Find-or-create
 * the single FOUR_FAVORITES list (raw partial unique backs this up).
 */
export async function setFourFavorites(
  ownerId: number,
  refs: ListItemRef[],
  db: Db = prisma
): Promise<void> {
  if (refs.length > FOUR_FAVORITES_MAX) {
    throw new Error(`Four Favorites holds at most ${FOUR_FAVORITES_MAX} items`);
  }
  const run = async (tx: Db) => {
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
  };
  // Run on a passed-in tx directly (Prisma forbids nesting $transaction);
  // otherwise open our own audited tx so the replace-all stays atomic AND the
  // actor is attributed. When a tx is passed in, the caller owns the actor.
  if (db === prisma) {
    await auditedTransaction(ownerId, (tx) => run(tx));
  } else {
    await run(db);
  }
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
