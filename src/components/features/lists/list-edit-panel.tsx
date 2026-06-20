"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { GripVertical, Globe, Loader2, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn, getMediaPath } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { moveListItem, removeListItem, updateList } from "@/server/actions/lists";
import type { ListItemView } from "./list-presentation";

/**
 * Owner edit surface for a list: details (name / description / visibility) +
 * drag-reorder + remove. Rendered by `OwnerListBody` ONLY in edit mode, seeded
 * with the items it already fetched (no second round-trip). Ownership is gated
 * by the parent; every mutation is independently authorized server-side
 * (`canEditList` / `requireOwnedList`). `onChanged` lets the parent re-pull so
 * its read view reflects edits when the owner toggles back.
 */
export function ListEditPanel({
  listId,
  initialName,
  initialDescription,
  initialIsPublic,
  initialItems,
  onChanged,
}: {
  listId: number;
  initialName: string;
  initialDescription: string | null;
  initialIsPublic: boolean;
  initialItems: ListItemView[];
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<ListItemView[]>(initialItems);

  return (
    <div className="mt-6 space-y-6 rounded-xl border bg-card p-4">
      <DetailsForm
        listId={listId}
        initialName={initialName}
        initialDescription={initialDescription}
        initialIsPublic={initialIsPublic}
        onSaved={onChanged}
      />

      <div className="space-y-2">
        <Label>Reorder &amp; remove</Label>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This list is empty. Add titles from any movie or show page.
          </p>
        ) : (
          <ReorderableItems
            listId={listId}
            items={items}
            setItems={setItems}
            onChanged={onChanged}
          />
        )}
      </div>
    </div>
  );
}

function DetailsForm({
  listId,
  initialName,
  initialDescription,
  initialIsPublic,
  onSaved,
}: {
  listId: number;
  initialName: string;
  initialDescription: string | null;
  initialIsPublic: boolean;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [busy, setBusy] = useState(false);

  const dirty =
    name.trim() !== initialName ||
    description.trim() !== (initialDescription ?? "").trim() ||
    isPublic !== initialIsPublic;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await updateList({
        listId,
        name: trimmed,
        description: description.trim() ? description.trim() : null,
        isPublic,
      });
      if (!res.success) throw new Error(res.error);
      toast.success("List updated");
      onSaved?.();
    } catch (e: unknown) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="edit-list-name">Name</Label>
        <Input
          id="edit-list-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          disabled={busy}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-list-desc">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id="edit-list-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
          disabled={busy}
          className="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <Label htmlFor="edit-list-public" className="flex cursor-pointer items-center gap-2">
          {isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {isPublic ? "Public" : "Private"}
        </Label>
        <Switch
          id="edit-list-public"
          checked={isPublic}
          onCheckedChange={setIsPublic}
          disabled={busy}
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={!dirty || busy || !name.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save details"}
        </Button>
      </div>
    </div>
  );
}

function ReorderableItems({
  listId,
  items,
  setItems,
  onChanged,
}: {
  listId: number;
  items: ListItemView[];
  setItems: React.Dispatch<React.SetStateAction<ListItemView[]>>;
  onChanged?: () => void;
}) {
  const [removing, setRemoving] = useState<Set<number>>(new Set());
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // Serialize reorder persists so rapid drops don't race on the gapped-position
  // renumber. We hold the latest ordering in a ref for the async commit.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const persistLock = useRef(false);

  const commitMove = useCallback(
    async (movedId: number, beforeItemId: number | null) => {
      if (persistLock.current) return;
      persistLock.current = true;
      try {
        const res = await moveListItem({ listId, itemId: movedId, beforeItemId });
        if (!res.success) throw new Error(res.error);
        onChanged?.();
      } catch (e: unknown) {
        toast.error("Couldn't reorder", { description: e instanceof Error ? e.message : undefined });
      } finally {
        persistLock.current = false;
      }
    },
    [listId, onChanged]
  );

  const handleDrop = (toIndex: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    setDragOver(null);
    if (from == null || from === toIndex) return;
    const next = [...itemsRef.current];
    const [moved] = next.splice(from, 1);
    next.splice(toIndex, 0, moved);
    setItems(next);
    // The new "before" anchor = the item now AFTER the moved one (null = end).
    const movedPos = next.findIndex((i) => i.id === moved.id);
    const beforeItemId = movedPos < next.length - 1 ? next[movedPos + 1].id : null;
    void commitMove(moved.id, beforeItemId);
  };

  const remove = async (itemId: number) => {
    if (removing.has(itemId)) return;
    setRemoving((prev) => new Set(prev).add(itemId));
    const snapshot = itemsRef.current;
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    try {
      const res = await removeListItem({ listId, itemId });
      if (!res.success) throw new Error(res.error);
      onChanged?.();
    } catch (e: unknown) {
      setItems(snapshot); // revert
      toast.error("Couldn't remove", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setRemoving((prev) => {
        const n = new Set(prev);
        n.delete(itemId);
        return n;
      });
    }
  };

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, index) => (
        <li
          key={item.id}
          draggable
          onDragStart={() => {
            dragIndex.current = index;
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(index);
          }}
          onDrop={() => handleDrop(index)}
          onDragEnd={() => {
            dragIndex.current = null;
            setDragOver(null);
          }}
          className={cn(
            "flex items-center gap-3 rounded-lg border border-border bg-background p-2 transition-colors",
            dragOver === index && "border-brand/60 bg-muted/50",
            removing.has(item.id) && "opacity-50"
          )}
        >
          <span className="cursor-grab text-muted-foreground active:cursor-grabbing" aria-hidden>
            <GripVertical className="h-4 w-4" />
          </span>
          <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-muted">
            {item.posterPath ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/w92${item.posterPath}`}
                alt=""
                fill
                unoptimized
                className="object-cover"
                sizes="32px"
              />
            ) : null}
          </div>
          <Link
            href={getMediaPath(item.mediaType, item.tmdbId, item.title)}
            prefetch={false}
            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:text-brand"
          >
            {item.title}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => void remove(item.id)}
            disabled={removing.has(item.id)}
            aria-label={`Remove ${item.title}`}
          >
            {removing.has(item.id) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </li>
      ))}
    </ul>
  );
}
