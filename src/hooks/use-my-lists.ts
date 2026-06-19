"use client";

import { useCallback } from "react";
import { createList, addListItem } from "@/server/actions/lists";
import type { MediaType } from "@/stores/user";
import type { MembershipRow } from "./use-list-membership";

/**
 * Inline "create new list" flow for the save picker: create the list, then add
 * the current title to it, returning a fully-formed (already-checked)
 * `MembershipRow` the picker can prepend via `appendList`. Returns `null` if the
 * list couldn't be created (the action already logs the cause).
 */
export function useCreateListWithItem() {
  return useCallback(
    async (
      name: string,
      itemId: number,
      mediaType: MediaType
    ): Promise<MembershipRow | null> => {
      const created = await createList({ name });
      if (!created.success || !created.list) return null;
      const ref = mediaType === "movie" ? { movieId: itemId } : { seriesId: itemId };
      const added = await addListItem({ listId: created.list.id, item: ref });
      return {
        listId: created.list.id,
        name: created.list.name,
        kind: created.list.kind,
        itemCount: added.success ? 1 : 0,
        isPublic: created.list.isPublic,
        contains: added.success,
        itemId: added.success ? (added.itemId ?? null) : null,
        pending: false,
      };
    },
    []
  );
}
