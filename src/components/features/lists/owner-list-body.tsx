"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getList } from "@/server/actions/lists";
import { useUserStore, selectViewerAvatarUrl, selectViewerAvatarCrop } from "@/stores/user";
import { ListHeader, ListItemGrid, type ListItemView } from "./list-presentation";
import { ListEditPanel } from "./list-edit-panel";

/**
 * Owner-fresh list body. Loaded ONLY for the resolved owner (via
 * `ListOwnerSwitch`, `dynamic(ssr:false)`), so its code never enters the
 * visitor bundle and never runs server-side — keeping the page edge-cacheable.
 *
 * Renders the WHOLE detail view from fresh, uncached `getList` data (owner-
 * scoped), so the owner always sees their latest edits AND can view a PRIVATE
 * list whose content is intentionally absent from the cached HTML. The Edit
 * toggle sits beside the title and swaps the read grid for the edit panel
 * (mirrors the profile's Customize pattern); no stranded bottom button.
 */
interface FreshList {
  id: number;
  name: string;
  description: string | null;
  isRanked: boolean;
  isPublic: boolean;
  itemCount: number;
  items: ListItemView[];
}

export function OwnerListBody({
  listId,
  ownerUsername,
}: {
  listId: number;
  ownerUsername: string;
}) {
  const { data: session } = useSession();
  const viewerAvatarUrl = useUserStore(selectViewerAvatarUrl);
  const viewerAvatarCrop = useUserStore(selectViewerAvatarCrop);
  const [list, setList] = useState<FreshList | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const res = await getList({ listId });
      if (isCancelled?.()) return;
      if (!res.success || !res.list) {
        setState("error");
        return;
      }
      const l = res.list;
      const items: ListItemView[] = l.items.flatMap((it): ListItemView[] => {
        if (it.movie)
          return [{ id: it.id, mediaType: "movie", tmdbId: it.movie.id, title: it.movie.title, posterPath: it.movie.posterPath }];
        if (it.series)
          return [{ id: it.id, mediaType: "series", tmdbId: it.series.id, title: it.series.name, posterPath: it.series.posterPath }];
        if (it.person)
          return [{ id: it.id, mediaType: "person", tmdbId: it.person.id, title: it.person.name, posterPath: it.person.profilePath }];
        return [];
      });
      setList({
        id: l.id,
        name: l.name,
        description: l.description,
        isRanked: l.isRanked,
        isPublic: l.isPublic,
        itemCount: l.itemCount,
        items,
      });
      setState("ready");
    } catch {
      if (!isCancelled?.()) setState("error");
    }
  }, [listId]);

  useEffect(() => {
    let cancelled = false;
    void reload(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [reload]);

  if (state === "loading") return <OwnerListSkeleton />;
  if (state === "error" || !list) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Couldn&apos;t load this list.
      </p>
    );
  }

  return (
    <>
      <ListHeader
        owner={{
          username: ownerUsername,
          name: session?.user?.name ?? null,
          image: session?.user?.image ?? null,
          avatarUrl: viewerAvatarUrl ?? session?.user?.image ?? null,
          avatarCrop: viewerAvatarCrop,
        }}
        name={list.name}
        itemCount={list.itemCount}
        isRanked={list.isRanked}
        isPublic={list.isPublic}
        description={list.description}
        action={
          <Button
            variant={editing ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? (
              <>
                <Check className="h-4 w-4" /> Done
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4" /> Edit
              </>
            )}
          </Button>
        }
      />

      {editing ? (
        <ListEditPanel
          listId={list.id}
          initialName={list.name}
          initialDescription={list.description}
          initialIsPublic={list.isPublic}
          initialItems={list.items}
          onChanged={() => void reload()}
        />
      ) : (
        <ListItemGrid items={list.items} isRanked={list.isRanked} />
      )}
    </>
  );
}

function OwnerListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-32" />
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
      <Skeleton className="h-4 w-40" />
      <ol className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <li key={i}>
            <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          </li>
        ))}
      </ol>
    </div>
  );
}
