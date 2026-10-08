"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaCardSkeleton } from "@/components/features/movie/media-card";
import { usePreferencesStore, selectCardDisplayMode } from "@/stores/preferences";
import { LIBRARY_POSTER_GRID, LIBRARY_WIDE_GRID } from "./library-filter-bar";

/** Loading skeleton for a Library tab (header row + grid), display-mode aware. */
export function LibraryGridSkeleton() {
  const displayMode = usePreferencesStore(selectCardDisplayMode);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-[140px]" />
        <Skeleton className="h-9 w-[160px]" />
      </div>
      <div className={displayMode === "wide" ? LIBRARY_WIDE_GRID : LIBRARY_POSTER_GRID}>
        {Array.from({ length: displayMode === "wide" ? 10 : 16 }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** Error block with a retry. */
export function LibraryError({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <p className="text-destructive">{label}</p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </div>
  );
}
