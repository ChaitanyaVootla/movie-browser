"use client";

import { useState } from "react";
import { Check, Dna, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfileViewer } from "./profile-viewer-context";
import { CalibrationHost } from "./taste/calibration-host";
import type { TasteHintState } from "@/types/social";

/**
 * Owner-only taste hint (taste v2 spec §4.6). Under the threshold it IS the
 * fastest way to build the profile: "Rate 10 titles now" opens the calibration
 * deck (workstream A's component, lazily loaded) in a Dialog / Drawer. When the
 * deck finishes, the owner-fresh body is re-pulled so the Taste card appears
 * for the owner at once; visitors see it within the ISR TTL. Visitors never
 * see this hint. ISR-safe: renders nothing until the viewer resolves as owner.
 */
export function TasteOwnerHint({ taste }: { taste: TasteHintState | null }) {
  const { resolved, isOwner, refreshProfile } = useProfileViewer();
  const [deckOpen, setDeckOpen] = useState(false);
  const [done, setDone] = useState(false);
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

  if (done) {
    return (
      <div
        className="flex items-start gap-3 rounded-xl border border-dashed bg-card/50 p-4"
        role="status"
      >
        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" />
        <p className="text-sm text-muted-foreground">
          Ratings saved. The taste profile appears here once 10 titles count, and on the public
          profile within a few minutes.
        </p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((taste.positiveCount / Math.max(1, taste.needed)) * 100));
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Dna className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Build your taste profile —{" "}
              <span className="tabular-nums">
                {taste.positiveCount} of {taste.needed}
              </span>{" "}
              titles counted
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
            <p className="mt-1.5 text-xs font-medium text-muted-foreground">
              Four Favorites count the most. Private diary entries never count.
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="min-h-10 w-full sm:w-auto"
          onClick={() => setDeckOpen(true)}
        >
          Rate 10 titles now
        </Button>
      </div>
      <CalibrationHost
        open={deckOpen}
        onOpenChange={setDeckOpen}
        onComplete={() => {
          setDeckOpen(false);
          setDone(true);
          void refreshProfile();
        }}
      />
    </div>
  );
}
