"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, EyeOff } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getDiaryUndated } from "@/server/actions/tracking";
import { episodeCode } from "@/lib/tracking-format";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { DiaryEntryDTO } from "@/types/social";
import { DiaryEntryActions } from "./diary-entry-actions";

interface DiaryBackfillSectionProps {
  count: number;
}

/**
 * Collapsed group for undated BACKFILL/IMPORT entries (spec §4.3: "rewatches
 * collapsed for BACKFILL"). Entries load lazily on first expand.
 */
export function DiaryBackfillSection({ count }: DiaryBackfillSectionProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<DiaryEntryDTO[] | null>(null);

  if (count === 0) return null;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && entries === null) {
      getDiaryUndated()
        .then(setEntries)
        .catch(() => setEntries([]));
    }
  };

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="border rounded-xl bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3.5 text-left">
        <div>
          <p className="text-sm font-medium">Earlier watches</p>
          <p className="text-xs font-medium text-muted-foreground">
            {count} undated {count === 1 ? "entry" : "entries"} from marks and imports
          </p>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t divide-y divide-border/50">
          {entries === null
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-14 w-10 rounded" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))
            : entries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="relative h-14 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
                    {entry.posterPath && (
                      <Image
                        src={`${TMDB_IMAGE_BASE}/w92${entry.posterPath}`}
                        alt={entry.title}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-1">{entry.title}</p>
                    <p className="text-xs font-medium text-muted-foreground">
                      {entry.seasonNumber !== null && entry.episodeNumber !== null
                        ? episodeCode(entry.seasonNumber, entry.episodeNumber)
                        : "Date unknown"}
                      {entry.isPrivate && <EyeOff className="ml-1.5 inline h-3 w-3" />}
                    </p>
                  </div>
                  <DiaryEntryActions entry={entry} />
                </div>
              ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
