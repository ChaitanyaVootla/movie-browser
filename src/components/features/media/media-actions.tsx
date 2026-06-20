"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Play, Share2 } from "lucide-react";
import { useUserLibrary } from "@/hooks/use-user-library";
import { useAnalytics } from "@/hooks/use-analytics";
import type { MediaType } from "@/stores/user";
import { SaveButton } from "@/components/features/lists/save-button";
import type { ReactNode } from "react";

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
  /**
   * The watch control (movie Watched toggle / series Set-position), rendered
   * RIGHT AFTER Trailer so it leads.
   */
  watchSlot?: ReactNode;
  /**
   * Engagement controls (SeenCluster: Rate + Diary), rendered after Watchlist.
   */
  engagementSlot?: ReactNode;
}

/**
 * The detail-page action bar row, in a single sensible order:
 *   Trailer · Watched · Watchlist · Rate · Diary · Share.
 * The watch control leads (right after Trailer), then Watchlist, then the
 * engagement controls, then Share. No separator — one coherent row for both
 * movie and series.
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
  watchSlot,
  engagementSlot,
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

      {/* Watch control — leads, right after Trailer. */}
      {watchSlot}

      {/* Watchlist + save-to-list picker (split on desktop, single on mobile). */}
      <SaveButton
        variant="hero"
        itemId={itemId}
        mediaType={mediaType}
        title={title}
        posterPath={posterPath}
        isInWatchlist={isInWatchlist}
        toggleWatchlist={toggleWatchlist}
      />

      {/* Engagement (Rate · Diary) — after Watchlist. */}
      {engagementSlot}

      {/* Share — inline at every size. */}
      <TooltipProvider>
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
      </TooltipProvider>
    </div>
  );
}
