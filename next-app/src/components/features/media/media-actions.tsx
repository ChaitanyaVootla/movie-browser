"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Play, Plus, Check, Heart, Share2, ListPlus } from "lucide-react";
import { useState } from "react";

interface MediaActionsProps {
  itemId: number;
  mediaType: "movie" | "series";
  title: string;
  hasTrailer?: boolean;
  onPlayTrailer?: () => void;
  className?: string;
  variant?: "hero" | "compact";
}

export function MediaActions({
  itemId,
  mediaType,
  title,
  hasTrailer = false,
  onPlayTrailer,
  className,
  variant = "hero",
}: MediaActionsProps) {
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  const handleWatchlistToggle = () => {
    // TODO: Implement with server action
    setIsInWatchlist(!isInWatchlist);
  };

  const handleFavoriteToggle = () => {
    // TODO: Implement with server action
    setIsFavorite(!isFavorite);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/${mediaType}/${itemId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          url: url,
        });
      } catch {
        // User cancelled or error
      }
    } else {
      await navigator.clipboard.writeText(url);
      // TODO: Show toast notification
    }
  };

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20"
                onClick={handleWatchlistToggle}
              >
                {isInWatchlist ? (
                  <Check className="h-4 w-4 text-brand" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {/* Primary action - Play Trailer */}
      {hasTrailer && onPlayTrailer && (
        <Button
          size="lg"
          className="gap-2 rounded-full bg-brand hover:bg-brand/90 text-brand-foreground font-semibold shadow-lg shadow-brand/25 transition-all hover:scale-105"
          onClick={onPlayTrailer}
        >
          <Play className="h-5 w-5 fill-current" />
          Play Trailer
        </Button>
      )}

      {/* Secondary actions */}
      <TooltipProvider>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className={cn(
                  "h-11 w-11 rounded-full transition-all hover:scale-105",
                  "bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10",
                  isInWatchlist && "bg-brand/20 border-brand/30"
                )}
                onClick={handleWatchlistToggle}
                aria-label={isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
              >
                {isInWatchlist ? (
                  <Check className="h-5 w-5 text-brand" />
                ) : (
                  <ListPlus className="h-5 w-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className={cn(
                  "h-11 w-11 rounded-full transition-all hover:scale-105",
                  "bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10",
                  isFavorite && "bg-red-500/20 border-red-500/30"
                )}
                onClick={handleFavoriteToggle}
                aria-label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
              >
                <Heart
                  className={cn("h-5 w-5", isFavorite && "fill-red-500 text-red-500")}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 transition-all hover:scale-105"
                onClick={handleShare}
                aria-label="Share"
              >
                <Share2 className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Share</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}

