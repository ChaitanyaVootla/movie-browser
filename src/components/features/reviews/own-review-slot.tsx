"use client";

import { useEffect, useState } from "react";
import { Clock, EyeOff, PenLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useLoginDialog } from "@/components/features/auth";
import { useAnalytics } from "@/hooks/use-analytics";
import { deleteReviewAction, getOwnReview } from "@/server/actions/reviews";
import { isStaleServerActionError, recoverFromStaleAction } from "@/lib/stale-action";
import type { OwnReviewDTO, TrackedMediaType } from "@/types/social";
import { ReviewCard } from "./review-card";
import { ReviewComposer } from "./review-composer";

interface OwnReviewSlotProps {
  mediaType: TrackedMediaType;
  tmdbId: number;
  title: string;
  seasonNumber?: number;
}

/**
 * Viewer's own review state — client island so detail pages stay edge-cache
 * safe (own PENDING/private reviews must never enter cached HTML, §4.1.8).
 */
export function OwnReviewSlot({ mediaType, tmdbId, title, seasonNumber }: OwnReviewSlotProps) {
  const { status } = useSession();
  const { openLoginDialog } = useLoginDialog();
  const { trackAction } = useAnalytics();
  const [review, setReview] = useState<OwnReviewDTO | null>(null);
  const [fetched, setFetched] = useState(false);
  const [composing, setComposing] = useState(false);

  // Derived: the slot is "loaded" once session state is settled — immediately
  // for logged-out viewers, after the own-review fetch for authenticated ones.
  // (Avoids a synchronous setState inside the effect.)
  const loaded = status === "authenticated" ? fetched : status !== "loading";

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    getOwnReview({ mediaType, tmdbId, seasonNumber })
      .then((data) => {
        if (!cancelled) setReview(data);
      })
      .catch((error: unknown) => {
        if (isStaleServerActionError(error)) recoverFromStaleAction();
      })
      .finally(() => {
        if (!cancelled) setFetched(true);
      });
    return () => {
      cancelled = true;
      // Reset before the next fetch (dep change) so the slot shows its loading
      // state again rather than stale data; runs outside render, not a cascade.
      setFetched(false);
    };
  }, [status, mediaType, tmdbId, seasonNumber]);

  const handleDelete = async () => {
    if (!review) return;
    try {
      const result = await deleteReviewAction({ reviewId: review.id });
      if (result.ok) {
        setReview(null);
        toast.success("Review deleted");
        trackAction({ action: "review_delete", mediaType, itemId: tmdbId });
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to delete review");
    }
  };

  const writeButton = (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        if (status !== "authenticated") {
          openLoginDialog();
          return;
        }
        setComposing(true);
      }}
    >
      <PenLine className="h-3.5 w-3.5" />
      {review ? "Edit your review" : "Write a review"}
    </Button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {loaded && writeButton}
        {review && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={() => void handleDelete()}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        )}
      </div>

      {review && (
        <div className="space-y-2">
          {review.status === "PENDING_REVIEW" && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-brand">
              <Clock className="h-3.5 w-3.5" />
              Awaiting review — only you can see this until it&apos;s checked.
            </p>
          )}
          {review.isPrivate && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <EyeOff className="h-3.5 w-3.5" /> Private — visible only to you.
            </p>
          )}
          <ReviewCard review={review} className="border-brand/30" />
        </div>
      )}

      {composing && (
        <ReviewComposer
          mediaType={mediaType}
          tmdbId={tmdbId}
          title={title}
          seasonNumber={seasonNumber}
          existing={review}
          open={composing}
          onOpenChange={setComposing}
          onSaved={setReview}
        />
      )}
    </div>
  );
}
