"use client";

import { useState } from "react";
import { ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toggleLike } from "@/server/actions/comment-reactions";

interface LikeButtonProps {
  commentId: number;
  initialLiked: boolean;
  initialCount: number;
  /** Pass true when the viewer is not signed in (disables the button). */
  disabled?: boolean;
}

/**
 * Optimistic like toggle (spec §5 rung 3). Viewer-specific state — rendered
 * only in the gated (client-fetched) path; never baked into cacheable RSC HTML
 * (invariant 1). 40px+ touch target on mobile.
 */
export function LikeButton({ commentId, initialLiked, initialCount, disabled }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (disabled || busy) return;
    setBusy(true);
    // Optimistic update.
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
    const res = await toggleLike({ commentId });
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
      disabled={disabled || busy}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-xs md:h-8",
        liked ? "text-brand" : "text-muted-foreground hover:text-foreground",
        (disabled || busy) && "opacity-60"
      )}
    >
      <ThumbsUp className={cn("h-3.5 w-3.5", liked && "fill-current")} />
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}
