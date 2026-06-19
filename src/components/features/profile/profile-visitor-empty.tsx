"use client";

import { Clapperboard } from "lucide-react";
import { useProfileViewer } from "./profile-viewer-context";

/**
 * Quiet "nothing here yet" note for a sparse profile — shown ONLY to visitors
 * (not the owner, who instead gets the actionable setup card). ISR-safe: reads
 * the shared ProfileViewer context (resolved client-side) and renders nothing
 * until it knows the viewer is NOT the owner. `isEmpty` is derived from
 * cacheable, viewer-agnostic profile data.
 */
export function ProfileVisitorEmpty({
  displayName,
  isEmpty,
}: {
  displayName: string;
  isEmpty: boolean;
}) {
  const { resolved, isOwner } = useProfileViewer();

  // Only visitors, only on an empty profile, only once resolved.
  if (!resolved || isOwner || !isEmpty) return null;

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
      <Clapperboard className="h-7 w-7 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {displayName} hasn&rsquo;t shared anything public yet.
      </p>
    </div>
  );
}
