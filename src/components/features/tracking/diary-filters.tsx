"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Diary filter bar (client island). Drives state through URL searchParams so the
 * server page reads them and renders the filtered list — no client-side data
 * fetching. Changing a filter resets pagination (drops `cursor`).
 *
 * LIMITATION (v1): the stable `getDiaryPage` API paginates by keyset and does
 * not accept filter args, so the server filters the CURRENT page's entries only
 * (the 50 most-recent matching the cursor window), not the entire history.
 * Filtering whole-history requires extending the tracking query layer (owned by
 * another agent). The empty-state copy reflects this honestly.
 */

type MediaFilter = "all" | "movie" | "series";

const MEDIA_OPTIONS: { value: MediaFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "series", label: "Series" },
];

export function DiaryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const media = (searchParams.get("media") as MediaFilter | null) ?? "all";
  const rewatch = searchParams.get("rewatch") === "1";

  const apply = useCallback(
    (next: { media?: MediaFilter; rewatch?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      // Any filter change resets keyset pagination.
      params.delete("cursor");

      const nextMedia = next.media ?? media;
      const nextRewatch = next.rewatch ?? rewatch;

      if (nextMedia === "all") params.delete("media");
      else params.set("media", nextMedia);

      if (nextRewatch) params.set("rewatch", "1");
      else params.delete("rewatch");

      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [searchParams, media, rewatch, pathname, router]
  );

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", isPending && "opacity-70")}
      role="group"
      aria-label="Diary filters"
    >
      <div className="inline-flex rounded-full border bg-card p-0.5">
        {MEDIA_OPTIONS.map((opt) => {
          const active = media === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => apply({ media: opt.value })}
              className={cn(
                "min-h-10 rounded-full px-4 text-sm font-medium transition-colors",
                active
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-pressed={rewatch}
        onClick={() => apply({ rewatch: !rewatch })}
        className={cn(
          "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
          rewatch
            ? "border-brand bg-brand/10 text-brand"
            : "bg-card text-muted-foreground hover:text-foreground"
        )}
      >
        <Repeat className="h-4 w-4" />
        Rewatches
      </button>
    </div>
  );
}
