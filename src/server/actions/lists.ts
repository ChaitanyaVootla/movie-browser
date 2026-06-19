"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import {
  createList as createListQuery,
  updateList as updateListQuery,
  deleteList as deleteListQuery,
  addListItem as addListItemQuery,
  removeListItem as removeListItemQuery,
  moveListItem as moveListItemQuery,
  getOwnLists,
  getListWithItems,
  setFourFavorites as setFourFavoritesQuery,
  getFourFavorites,
} from "@/server/db/postgres/social/lists";

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

const ItemRefSchema = z
  .object({
    movieId: z.number().int().positive().optional(),
    seriesId: z.number().int().positive().optional(),
    personId: z.number().int().positive().optional(),
  })
  .refine(
    (v) =>
      [v.movieId, v.seriesId, v.personId].filter((x) => x !== undefined).length === 1,
    { message: "Exactly one of movieId/seriesId/personId is required" }
  );

const CreateListSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  isPublic: z.boolean().optional(),
  isRanked: z.boolean().optional(),
});

export async function createList(input: z.infer<typeof CreateListSchema>) {
  try {
    const validated = CreateListSchema.parse(input);
    const userId = await requirePgUserId();
    const list = await createListQuery(userId, validated);
    return { success: true as const, list };
  } catch (error: unknown) {
    return actionError("createList", error);
  }
}

const UpdateListSchema = z.object({
  listId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  isPublic: z.boolean().optional(),
  isRanked: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});

export async function updateList(input: z.infer<typeof UpdateListSchema>) {
  try {
    const { listId, ...patch } = UpdateListSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await updateListQuery(userId, listId, patch);
    return ok ? { success: true as const } : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("updateList", error);
  }
}

const ListIdSchema = z.object({ listId: z.number().int().positive() });

export async function deleteList(input: z.infer<typeof ListIdSchema>) {
  try {
    const { listId } = ListIdSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await deleteListQuery(userId, listId);
    return ok ? { success: true as const } : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("deleteList", error);
  }
}

const AddItemSchema = z.object({
  listId: z.number().int().positive(),
  item: ItemRefSchema,
  note: z.string().max(1000).nullable().optional(),
});

export async function addListItem(input: z.infer<typeof AddItemSchema>) {
  try {
    const { listId, item, note } = AddItemSchema.parse(input);
    const userId = await requirePgUserId();
    const created = await addListItemQuery(userId, listId, item, note);
    return { success: true as const, itemId: created.id };
  } catch (error: unknown) {
    return actionError("addListItem", error);
  }
}

const RemoveItemSchema = z.object({
  listId: z.number().int().positive(),
  itemId: z.number().int().positive(),
});

export async function removeListItem(input: z.infer<typeof RemoveItemSchema>) {
  try {
    const { listId, itemId } = RemoveItemSchema.parse(input);
    const userId = await requirePgUserId();
    const ok = await removeListItemQuery(userId, listId, itemId);
    return ok ? { success: true as const } : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("removeListItem", error);
  }
}

const MoveItemSchema = z.object({
  listId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  beforeItemId: z.number().int().positive().nullable(),
});

export async function moveListItem(input: z.infer<typeof MoveItemSchema>) {
  try {
    const { listId, itemId, beforeItemId } = MoveItemSchema.parse(input);
    const userId = await requirePgUserId();
    await moveListItemQuery(userId, listId, itemId, beforeItemId);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("moveListItem", error);
  }
}

export async function getMyLists() {
  try {
    const userId = await requirePgUserId();
    const lists = await getOwnLists(userId);
    return { success: true as const, lists };
  } catch (error: unknown) {
    return actionError("getMyLists", error);
  }
}

export async function getList(input: z.infer<typeof ListIdSchema>) {
  try {
    const { listId } = ListIdSchema.parse(input);
    const userId = await requirePgUserId();
    const list = await getListWithItems(listId);
    if (!list || (!list.isPublic && list.ownerId !== userId)) {
      return { success: false as const, error: "Not found" };
    }
    return { success: true as const, list };
  } catch (error: unknown) {
    return actionError("getList", error);
  }
}

const FourFavoritesSchema = z.object({ items: z.array(ItemRefSchema).max(4) });

export async function setFourFavorites(input: z.infer<typeof FourFavoritesSchema>) {
  try {
    const { items } = FourFavoritesSchema.parse(input);
    const userId = await requirePgUserId();
    await setFourFavoritesQuery(userId, items);
    return { success: true as const };
  } catch (error: unknown) {
    return actionError("setFourFavorites", error);
  }
}

export async function getMyFourFavorites() {
  try {
    const userId = await requirePgUserId();
    const items = await getFourFavorites(userId);
    return { success: true as const, items };
  } catch (error: unknown) {
    return actionError("getMyFourFavorites", error);
  }
}
