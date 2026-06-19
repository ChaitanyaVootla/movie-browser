"use client";

import { useState } from "react";
import { Check, Loader2, MoreHorizontal, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useUserLibrary } from "@/hooks/use-user-library";
import { useAnalytics } from "@/hooks/use-analytics";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import type { MediaType } from "@/stores/user";

interface MoreActionsProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  className?: string;
}

/**
 * Mobile-only overflow for the detail-page action bar. The casual reactions
 * (Like / Dislike) and Share collapse here on phones so the bar stays one row;
 * on ≥sm they render inline in `MediaActions` (this whole control is hidden).
 *
 * Rendered as the LAST item in `MediaActionBar` so the ⋯ trigger sits at the
 * end of the bar. Shares Like/Dislike state with `MediaActions` via the
 * Zustand-backed `useUserLibrary` store (same item key → same state).
 */
export function MoreActions({ itemId, mediaType, title, className }: MoreActionsProps) {
  const { isLiked, isDisliked, like, dislike } = useUserLibrary(itemId, mediaType);
  const { trackRating, trackShareClick } = useAnalytics();
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  useHistoryDismiss(open, () => setOpen(false));

  const handleLike = async () => {
    const wasLiked = isLiked;
    setUpdating("like");
    try {
      await like();
      trackRating(itemId, mediaType, wasLiked ? "remove" : "like", title);
    } finally {
      setUpdating(null);
    }
  };

  const handleDislike = async () => {
    const wasDisliked = isDisliked;
    setUpdating("dislike");
    try {
      await dislike();
      trackRating(itemId, mediaType, wasDisliked ? "remove" : "dislike", title);
    } finally {
      setUpdating(null);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/${mediaType}/${itemId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        trackShareClick(itemId, mediaType, "native_share", title);
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
      trackShareClick(itemId, mediaType, "clipboard", title);
    }
  };

  const row = "flex h-12 items-center gap-3 rounded-xl px-4 text-left transition-colors";

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          className={cn(
            "rounded-full border border-white/20 bg-white/10 text-white/80 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white sm:hidden",
            className
          )}
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-center">
          <DrawerTitle className="text-lg font-semibold">More actions</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-1 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
          <button
            type="button"
            onClick={handleLike}
            disabled={updating === "like"}
            className={cn(row, "disabled:opacity-60", isLiked ? "bg-brand/15" : "hover:bg-muted")}
          >
            {updating === "like" ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ThumbsUp
                className={cn(
                  "h-5 w-5 shrink-0",
                  isLiked ? "fill-brand text-brand" : "text-muted-foreground"
                )}
              />
            )}
            <span className="flex-1 text-sm font-medium text-foreground">
              {isLiked ? "Liked" : "Like"}
            </span>
            {isLiked && <Check className="h-4 w-4 text-brand" />}
          </button>

          <button
            type="button"
            onClick={handleDislike}
            disabled={updating === "dislike"}
            className={cn(row, "disabled:opacity-60", isDisliked ? "bg-brand/15" : "hover:bg-muted")}
          >
            {updating === "dislike" ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ThumbsDown
                className={cn(
                  "h-5 w-5 shrink-0",
                  isDisliked ? "fill-brand text-brand" : "text-muted-foreground"
                )}
              />
            )}
            <span className="flex-1 text-sm font-medium text-foreground">
              {isDisliked ? "Disliked" : "Dislike"}
            </span>
            {isDisliked && <Check className="h-4 w-4 text-brand" />}
          </button>

          <DrawerClose asChild>
            <button type="button" onClick={handleShare} className={cn(row, "hover:bg-muted")}>
              <Share2 className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium text-foreground">Share</span>
            </button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
