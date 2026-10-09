"use client";

import { Dna, EyeOff } from "lucide-react";
import { useProfileViewer } from "./profile-viewer-context";
import type { ProfileTasteDTO } from "@/types/social";

/**
 * Owner-only nudge for the taste widgets. Visitors see nothing (the widgets are
 * simply absent below the threshold). ISR-safe: renders nothing until the
 * viewer resolves client-side as the owner; the status it reads is part of the
 * cacheable, viewer-agnostic profile DTO.
 */
export function TasteOwnerHint({ taste }: { taste: ProfileTasteDTO | null }) {
  const { resolved, isOwner } = useProfileViewer();
  if (!resolved || !isOwner || !taste || taste.status === "ready") return null;

  if (taste.status === "hidden") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed bg-card/50 p-4">
        <EyeOff className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Your taste profile is hidden from visitors. Turn it back on in Settings, under Privacy.
        </p>
      </div>
    );
  }

  const remaining = Math.max(0, taste.needed - taste.positiveCount);
  const pct = Math.min(100, Math.round((taste.positiveCount / Math.max(1, taste.needed)) * 100));
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-4">
      <div className="flex items-start gap-3">
        <Dna className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Build your taste profile</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Rate, heart or log {remaining} more {remaining === 1 ? "title" : "titles"} to add Taste DNA, moods and
            clusters to your profile. Four Favorites count the most. Private diary entries never count.
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={taste.needed}
            aria-valuenow={taste.positiveCount}
            aria-label="Titles counted toward your taste profile"
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs font-medium tabular-nums text-muted-foreground">
            {taste.positiveCount} of {taste.needed}
          </p>
        </div>
      </div>
    </div>
  );
}
