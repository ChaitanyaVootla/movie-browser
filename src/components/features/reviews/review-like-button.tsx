"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useLoginDialog } from "@/components/features/auth";
import { useAnalytics } from "@/hooks/use-analytics";
import { toggleReviewLike } from "@/server/actions/review-reactions";

interface ReviewLikeButtonProps {
  reviewId: number;
  initialLiked: boolean;
  initialCount: number;
}

/**
 * Optimistic "like" toggle for a review (spec §F) — mirrors the discussion
 * `like-button.tsx`. Viewer-specific state; only mounted in the (client) review
 * card footer, never baked into cacheable RSC HTML (invariant 1). Anonymous
 * viewers are routed to the login dialog. 40px+ touch target on mobile.
 */
export function ReviewLikeButton({ reviewId, initialLiked, initialCount }: ReviewLikeButtonProps) {
  const { status } = useSession();
  const { openLoginDialog } = useLoginDialog();
  const { trackAction } = useAnalytics();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    if (status !== "authenticated") {
      openLoginDialog();
      return;
    }
    setBusy(true);
    // Optimistic update.
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
    // Fire-and-forget analytics (never awaited).
    trackAction({ action: "review_like", itemId: reviewId });
    const res = await toggleReviewLike({ reviewId });
    setBusy(false);
    if (!res.ok) {
      // Roll back optimistic update.
      setLiked(liked);
      setCount(initialCount);
      toast.error(res.message);
      return;
    }
    // Sync with server truth.
    setLiked(res.liked);
    setCount(res.likeCount);
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      aria-pressed={liked}
      aria-label={liked ? "Unlike review" : "Like review"}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-xs md:h-8",
        liked ? "text-brand" : "text-muted-foreground hover:text-foreground",
        busy && "opacity-60"
      )}
    >
      <Heart className={cn("h-3.5 w-3.5", liked && "fill-brand")} />
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}
