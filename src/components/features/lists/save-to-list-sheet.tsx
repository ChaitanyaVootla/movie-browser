"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Bookmark,
  Check,
  Globe,
  ListPlus,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { useListMembership } from "@/hooks/use-list-membership";
import { useCreateListWithItem } from "@/hooks/use-my-lists";
import type { MediaType } from "@/stores/user";

interface SaveToListSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  isInWatchlist: boolean;
  onToggleWatchlist: () => Promise<void> | void;
  /**
   * Desktop popover anchor — usually the caret trigger element. The mobile
   * Drawer ignores this (it is bottom-pinned).
   */
  anchor?: React.ReactNode;
}

/** Row > 15 lists shows a filter. Keep in one place. */
const SEARCH_THRESHOLD = 15;

const ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 text-left transition-colors min-h-[48px] disabled:cursor-default";

// ---------------------------------------------------------------------------
// Header — small poster (best-effort, C9) + title for context.
// ---------------------------------------------------------------------------
function SheetHeader({ title, posterPath }: { title: string; posterPath?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      {posterPath ? (
        <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
          <Image
            src={`${TMDB_IMAGE_BASE}/w92${posterPath}`}
            alt=""
            fill
            sizes="40px"
            unoptimized
            className="object-cover"
          />
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Save to
        </p>
        {title ? (
          <p className="truncate text-base font-semibold text-foreground" title={title}>
            {title}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watchlist row — privileged, FIRST. Reads checked from the live prop (reactive
// to a Zustand revert); owns its OWN pending spinner. NO toast here (C7) —
// useUserLibrary.toggleWatchlist already toasts.
// ---------------------------------------------------------------------------
function WatchlistRow({
  isInWatchlist,
  onToggle,
}: {
  isInWatchlist: boolean;
  onToggle: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState(false);

  const handle = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onToggle();
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-pressed={isInWatchlist}
      className={cn(
        ROW,
        "py-2",
        isInWatchlist ? "bg-brand/10 hover:bg-brand/15" : "hover:bg-muted",
        pending && "opacity-50"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          isInWatchlist ? "bg-brand/20 text-brand" : "bg-muted text-muted-foreground"
        )}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Bookmark className={cn("h-4 w-4", isInWatchlist && "fill-current")} />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-foreground">Watchlist</span>
        <span className="block text-xs text-muted-foreground">
          {isInWatchlist ? "Saved · your default queue" : "Your default queue"}
        </span>
      </span>
      {isInWatchlist && !pending ? <Check className="h-4 w-4 shrink-0 text-brand" /> : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline "create new list" row — expands into an input + confirm.
// ---------------------------------------------------------------------------
function CreateListRow({
  onCreate,
}: {
  onCreate: (name: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onCreate(trimmed);
      setName("");
      setExpanded(false);
    } finally {
      setBusy(false);
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(ROW, "py-2 text-foreground hover:bg-muted")}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
          <Plus className="h-4 w-4" />
        </span>
        <span className="flex-1 text-sm font-medium">Create new list</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
      <ListPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            setExpanded(false);
            setName("");
          }
        }}
        placeholder="List name"
        maxLength={120}
        disabled={busy}
        className="h-9 flex-1"
      />
      <Button
        type="button"
        size="sm"
        onClick={() => void submit()}
        disabled={busy || !name.trim()}
        className="shrink-0"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => {
          setExpanded(false);
          setName("");
        }}
        disabled={busy}
        aria-label="Cancel"
        className="h-9 w-9 shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared inner body — used by BOTH the mobile Drawer and the desktop Popover.
// ---------------------------------------------------------------------------
function SaveToListBody({
  itemId,
  mediaType,
  title,
  posterPath,
  isInWatchlist,
  onToggleWatchlist,
}: Omit<SaveToListSheetProps, "open" | "onOpenChange" | "anchor"> & { isInWatchlist: boolean }) {
  // open=true: the body only mounts when the surface is open, so membership
  // fetches exactly once per open.
  const { rows, loading, toggle, appendList, hasLists } = useListMembership(
    itemId,
    mediaType,
    true
  );
  const createWithItem = useCreateListWithItem();
  const [query, setQuery] = useState("");

  const handleCreate = async (name: string) => {
    const row = await createWithItem(name, itemId, mediaType);
    if (row) appendList(row);
  };

  const showSearch = rows.length > SEARCH_THRESHOLD;
  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="flex flex-col gap-2">
      <SheetHeader title={title} posterPath={posterPath} />

      {/* Privileged Watchlist row */}
      <div className="mt-1">
        <WatchlistRow isInWatchlist={isInWatchlist} onToggle={onToggleWatchlist} />
      </div>

      <div className="my-1 border-t border-border" />

      {showSearch ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a list"
            className="h-9 pl-9"
          />
        </div>
      ) : null}

      <CreateListRow onCreate={handleCreate} />

      {/* Custom list rows */}
      <ScrollArea className="max-h-[42dvh]">
        <div className="flex flex-col gap-0.5 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !hasLists ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No lists yet — create your first one above to start organizing titles.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No lists match “{query.trim()}”.
            </p>
          ) : (
            filtered.map((row) => (
              <button
                key={row.listId}
                type="button"
                onClick={() => void toggle(row.listId)}
                disabled={row.pending}
                aria-pressed={row.contains}
                className={cn(ROW, "py-2 hover:bg-muted", row.pending && "opacity-50")}
              >
                <span className="shrink-0">
                  {row.pending ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <Checkbox
                      checked={row.contains}
                      tabIndex={-1}
                      className="pointer-events-none h-5 w-5"
                    />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {row.name}
                    </span>
                    {row.isPublic ? (
                      <Globe
                        className="h-3 w-3 shrink-0 text-muted-foreground"
                        aria-label="Public list"
                      />
                    ) : null}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {row.itemCount} {row.itemCount === 1 ? "title" : "titles"}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Responsive save-to-list picker. Mobile = Vaul Drawer (bottom), desktop =
 * Popover anchored to the caret trigger. ONE shared `<SaveToListBody/>`. No
 * "Done" button — every toggle commits optimistically; closing just dismisses.
 */
export function SaveToListSheet({
  open,
  onOpenChange,
  anchor,
  ...bodyProps
}: SaveToListSheetProps) {
  const isMobile = useMobile();
  // Hardware/gesture Back closes the mobile overlay (doesn't navigate).
  useHistoryDismiss(open, () => onOpenChange(false));

  if (isMobile) {
    // The caret (anchor) renders inline so it can open the Drawer; the Drawer
    // surface is portalled and bottom-pinned.
    return (
      <>
        {anchor}
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent>
            <DrawerHeader className="sr-only">
              <DrawerTitle>Save “{bodyProps.title}” to a list</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-2">
              {open ? <SaveToListBody {...bodyProps} /> : null}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {anchor ? <PopoverAnchor className="inline-flex">{anchor}</PopoverAnchor> : null}
      <PopoverContent align="end" sideOffset={8} className="w-80 p-3">
        {open ? <SaveToListBody {...bodyProps} /> : null}
      </PopoverContent>
    </Popover>
  );
}
