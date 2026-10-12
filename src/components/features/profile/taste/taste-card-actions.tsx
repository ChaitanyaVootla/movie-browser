"use client";

import { useState } from "react";
import { GitCompareArrows, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSignInPrompt } from "@/components/features/media/title-actions/sign-in-dialog";
import { useAnalytics } from "@/hooks/use-analytics";
import { useProfileViewer } from "../profile-viewer-context";
import { CalibrationHost } from "./calibration-host";
import { useTasteCompare } from "./compare-overlay";
import { shareText, shareTitle } from "./taste-copy";

type AxisLite = { lowLabel: string; highLabel: string; value: number };

/**
 * Taste card actions island (taste v2 spec §4.2, §4.5, §4.8): Compare with me
 * (signed-in visitors; guests get the sign-in prompt; hidden for the owner)
 * and Share (Web Share API, copy-link fallback). The cached HTML renders both
 * buttons in their default state; nothing here knows the viewer until
 * `useProfileViewer()` resolves client-side.
 */
export function TasteCardActions({
  username,
  displayName,
  axes,
  positiveCount,
}: {
  username: string;
  displayName: string;
  axes: readonly AxisLite[];
  positiveCount: number;
}) {
  const { resolved, authenticated, isOwner } = useProfileViewer();
  const compare = useTasteCompare();
  const signIn = useSignInPrompt();
  const { trackAction } = useAnalytics();
  const [deckOpen, setDeckOpen] = useState(false);
  const [deckDone, setDeckDone] = useState(false);

  const onCompare = async () => {
    if (compare.on) return compare.disable();
    if (resolved && !authenticated) return signIn.prompt("Sign in to compare your taste");
    const status = await compare.enable();
    if (status === "signed_out") signIn.prompt("Sign in to compare your taste");
  };

  const onShare = async () => {
    const url = `${window.location.origin}/u/${encodeURIComponent(username)}`;
    const payload = { title: shareTitle(displayName), text: shareText(axes, positiveCount), url };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(payload);
        trackAction({ action: "taste_share", metadata: { method: "web_share" } });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
      trackAction({ action: "taste_share", metadata: { method: "copy" } });
    } catch (error: unknown) {
      // A dismissed share sheet is not an error worth a toast.
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn't share this profile");
    }
  };

  const showCompare = !(resolved && isOwner);
  const loading = compare.status === "loading";
  const btn = "min-h-10 w-full gap-1.5 sm:w-auto md:min-h-8";

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {showCompare && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={btn}
            aria-pressed={compare.on}
            disabled={loading}
            onClick={() => void onCompare()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompareArrows className="h-4 w-4" />}
            {compare.on ? "Hide comparison" : "Compare with me"}
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" className={btn} onClick={() => void onShare()}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </div>

      {compare.status === "insufficient" && !compare.on && (
        <p className="text-xs font-medium text-muted-foreground sm:text-right">
          {deckDone ? (
            "Ratings saved. The comparison is ready within a few minutes."
          ) : (
            <>
              Rate 10 titles to compare.{" "}
              <button
                type="button"
                onClick={() => setDeckOpen(true)}
                className="inline-flex min-h-10 items-center font-semibold text-brand underline-offset-4 hover:underline md:min-h-0"
              >
                Start
              </button>
            </>
          )}
        </p>
      )}
      {compare.status === "hidden" && (
        <p className="text-xs font-medium text-muted-foreground sm:text-right">
          Your taste profile is hidden in Settings, under Privacy, so it can&apos;t be compared.
        </p>
      )}
      {compare.status === "error" && (
        <p className="text-xs font-medium text-muted-foreground sm:text-right">Couldn&apos;t load the comparison. Try again.</p>
      )}

      {signIn.dialog}
      <CalibrationHost
        open={deckOpen}
        onOpenChange={setDeckOpen}
        onComplete={() => {
          setDeckOpen(false);
          setDeckDone(true);
        }}
      />
    </div>
  );
}
