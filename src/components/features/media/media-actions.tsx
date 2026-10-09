"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Play, Share2 } from "lucide-react";
import { useAnalytics } from "@/hooks/use-analytics";
import type { MediaType } from "@/stores/user";
import { getMediaPath } from "@/lib/utils";
import { TitleActions } from "./title-actions/title-actions";

interface MediaActionsProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  hasTrailer?: boolean;
  onPlayTrailer?: () => void;
  className?: string;
  /** Best-effort poster (C9) for the save-to-list picker header; null-safe. */
  posterPath?: string | null;
  /** The watch control (movie Watched toggle / series Set-position). */
  watchSlot?: ReactNode;
  /** Engagement controls (SeenCluster: Rate + Diary). */
  engagementSlot?: ReactNode;
}

/**
 * The detail-page action row: the shared `TitleActions` (hero variant), with
 * Trailer leading and Share trailing:
 *   Trailer · Watched · Watchlist · Rate · Diary · Share.
 * Same primitives and glyphs as the hover preview / quick-info drawer.
 */
export function MediaActions({
  itemId,
  mediaType,
  title,
  hasTrailer = false,
  onPlayTrailer,
  className,
  posterPath,
  watchSlot,
  engagementSlot,
}: MediaActionsProps) {
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

  return (
    <TitleActions
      variant="hero"
      itemId={itemId}
      mediaType={mediaType}
      title={title}
      posterPath={posterPath}
      href={getMediaPath(mediaType, itemId, title)}
      className={className}
      watchSlot={watchSlot}
      engagementSlot={engagementSlot}
      leading={
        hasTrailer && onPlayTrailer ? (
          <Button
            size="sm"
            className="gap-1.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white font-medium border border-white/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={onPlayTrailer}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span className="text-[13px]">Trailer</span>
          </Button>
        ) : null
      }
      trailing={
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
      }
    />
  );
}
