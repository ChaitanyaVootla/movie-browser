"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Play, Share2 } from "lucide-react";
import { useUserLibrary } from "@/hooks/use-user-library";
import { useAnalytics } from "@/hooks/use-analytics";
import type { MediaType } from "@/stores/user";
import { SaveButton } from "@/components/features/lists/save-button";

interface MediaActionsProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  hasTrailer?: boolean;
  onPlayTrailer?: () => void;
  className?: string;
  variant?: "hero" | "compact";
  /** Best-effort poster (C9) for the save-to-list picker header; null-safe. */
  posterPath?: string | null;
}

/**
 * The "Save" cluster of the detail-page action bar: Play Trailer, Watchlist
 * (+ save-to-list picker), and Share — the future-intent / sharing actions.
 *
 * Engagement (watched / rate / like / favorite / review) lives in the SEPARATE
 * `SeenCluster`, rendered as a peer in `MediaActionBar`. Splitting the bar into
 * Save vs Seen is the coherence model from the social-actions-consolidation
 * spec — keep these two concerns in their own components.
 */
export function MediaActions({
  itemId,
  mediaType,
  title,
  hasTrailer = false,
  onPlayTrailer,
  className,
  variant = "hero",
  posterPath,
}: MediaActionsProps) {
  const { isInWatchlist, toggleWatchlist } = useUserLibrary(itemId, mediaType);
  const { trackShareClick } = useAnalytics();

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

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <SaveButton
          variant="compact"
          itemId={itemId}
          mediaType={mediaType}
          title={title}
          posterPath={posterPath}
          isInWatchlist={isInWatchlist}
          toggleWatchlist={toggleWatchlist}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 sm:gap-2", className)}>
      {/* Primary action - Play Trailer */}
      {hasTrailer && onPlayTrailer && (
        <Button
          size="sm"
          className="gap-1.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white font-medium border border-white/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          onClick={onPlayTrailer}
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span className="text-[13px]">Trailer</span>
        </Button>
      )}

      <TooltipProvider>
        <div className="flex items-center gap-1.5">
          {/* Watchlist + save-to-list picker (split control) */}
          <SaveButton
            variant="hero"
            itemId={itemId}
            mediaType={mediaType}
            title={title}
            posterPath={posterPath}
            isInWatchlist={isInWatchlist}
            toggleWatchlist={toggleWatchlist}
          />

          {/* Share — inline at every size (the casual reactions now live in the
              Seen cluster, so there is no mobile overflow drawer to host it). */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="secondary"
                className="rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                onClick={handleShare}
                aria-label="Share"
              >
                <Share2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Share</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}
