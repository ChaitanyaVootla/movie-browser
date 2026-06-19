"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getItemListMembership,
  addListItem,
  removeListItem,
} from "@/server/actions/lists";
import type { MediaType } from "@/stores/user";
// Type-only import from a prisma-touching db module into a "use client" hook is
// erased at compile (C4) — safe. ONE shared membership-row shape across the stack.
import type { ListMembershipRow } from "@/server/db/postgres/social/lists";

export type MembershipRow = ListMembershipRow & { pending?: boolean };

/** Build a single-key list-item ref from the media type. */
function toRef(itemId: number, mediaType: MediaType) {
  return mediaType === "movie" ? { movieId: itemId } : { seriesId: itemId };
}

/**
 * Which of the viewer's custom (REGULAR) lists already hold this title, with the
 * `ListItem.id` for each so a toggle-off can remove the exact row. Fetched lazily
 * when `open` flips true (never SSR — keeps the host page ISR-cacheable).
 *
 * `toggle` is optimistic and serialized per-list via a SYNCHRONOUS ref guard
 * (`inFlight`): a rapid double-tap on the same row is dropped instead of racing
 * an add against a remove. Rows are read through `rowsRef` so the callback stays
 * stable (doesn't re-create on every membership change) yet always sees the
 * latest state — this also avoids the pending-add-then-toggle-off orphan.
 */
export function useListMembership(itemId: number, mediaType: MediaType, open: boolean) {
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(false);

  const rowsRef = useRef<MembershipRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const inFlight = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getItemListMembership({ item: toRef(itemId, mediaType) })
      .then((res) => {
        if (cancelled) return;
        if (res.success) setRows(res.rows.map((r) => ({ ...r, pending: false })));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, itemId, mediaType]);

  const toggle = useCallback(
    async (listId: number) => {
      if (inFlight.current.has(listId)) return; // synchronous guard
      const row = rowsRef.current.find((r) => r.listId === listId);
      if (!row) return;
      inFlight.current.add(listId);
      const wasIn = row.contains;
      // Optimistic flip + pending spinner.
      setRows((prev) =>
        prev.map((r) => (r.listId === listId ? { ...r, contains: !wasIn, pending: true } : r))
      );
      try {
        if (wasIn && row.itemId != null) {
          const res = await removeListItem({ listId, itemId: row.itemId });
          if (!res.success) throw new Error(res.error);
          setRows((prev) =>
            prev.map((r) =>
              r.listId === listId
                ? {
                    ...r,
                    contains: false,
                    itemId: null,
                    pending: false,
                    itemCount: Math.max(0, r.itemCount - 1),
                  }
                : r
            )
          );
        } else if (!wasIn) {
          const res = await addListItem({ listId, item: toRef(itemId, mediaType) });
          if (!res.success) throw new Error(res.error);
          setRows((prev) =>
            prev.map((r) =>
              r.listId === listId
                ? {
                    ...r,
                    contains: true,
                    itemId: res.itemId ?? null,
                    pending: false,
                    itemCount: r.itemCount + 1,
                  }
                : r
            )
          );
        } else {
          // wasIn but itemId not yet known: nothing to remove — clear pending.
          setRows((prev) =>
            prev.map((r) => (r.listId === listId ? { ...r, pending: false } : r))
          );
        }
      } catch (e: unknown) {
        // Revert to the pre-toggle state.
        setRows((prev) =>
          prev.map((r) => (r.listId === listId ? { ...r, contains: wasIn, pending: false } : r))
        );
        toast.error("Couldn't update list", {
          description: e instanceof Error ? e.message : undefined,
        });
      } finally {
        inFlight.current.delete(listId);
      }
    },
    [itemId, mediaType] // stable: rows read via rowsRef
  );

  // Prepend a just-created list (already checked) so it shows up immediately.
  const appendList = useCallback(
    (row: MembershipRow) => setRows((prev) => [row, ...prev]),
    []
  );

  return { rows, loading, toggle, appendList, hasLists: rows.length > 0 };
}
