"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Play, Check, Share2, ListPlus, ThumbsUp, ThumbsDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { useUserLibrary } from "@/hooks/use-user-library";
import type { MediaType } from "@/stores/user";
import { useState } from "react";

interface MediaActionsProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  hasTrailer?: boolean;
  onPlayTrailer?: () => void;
  className?: string;
  variant?: "hero" | "compact";
  /**
   * Show the watched toggle (only for movies)
   */
  showWatched?: boolean;
}

export function MediaActions({
  itemId,
  mediaType,
  title,
  hasTrailer = false,
  onPlayTrailer,
  className,
  variant = "hero",
  showWatched = true,
}: MediaActionsProps) {
  const {
    isInWatchlist,
    isWatched,
    isLiked,
    isDisliked,
    toggleWatchlist,
    toggleWatched,
    like,
    dislike,
  } = useUserLibrary(itemId, mediaType);

  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const handleWatchlistToggle = async () => {
    setIsUpdating("watchlist");
    try {
      await toggleWatchlist();
    } finally {
      setIsUpdating(null);
    }
  };

  const handleWatchedToggle = async () => {
    setIsUpdating("watched");
    try {
      await toggleWatched();
    } finally {
      setIsUpdating(null);
    }
  };

  const handleLike = async () => {
    setIsUpdating("like");
    try {
      await like();
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDislike = async () => {
    setIsUpdating("dislike");
    try {
      await dislike();
    } finally {
      setIsUpdating(null);
    }
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
      // Toast will show from the hook
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
                className={cn(
                  "h-9 w-9 rounded-full bg-white/10 hover:bg-white/20",
                  isInWatchlist && "bg-white/20"
                )}
                onClick={handleWatchlistToggle}
                disabled={isUpdating === "watchlist"}
              >
                {isUpdating === "watchlist" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isInWatchlist ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <ListPlus className="h-4 w-4" />
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
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Primary action - Play Trailer */}
      {hasTrailer && onPlayTrailer && (
        <Button
          size="sm"
          className="gap-1.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white font-medium border border-white/20 transition-all hover:scale-105"
          onClick={onPlayTrailer}
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          Trailer
        </Button>
      )}

      {/* Secondary actions - grouped logically */}
      <TooltipProvider>
        <div className="flex items-center gap-1.5">
          {/* Watchlist */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="secondary"
                className={cn(
                  "rounded-full transition-all hover:scale-105",
                  "bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10",
                  isInWatchlist && "bg-white/20 border-white/30"
                )}
                onClick={handleWatchlistToggle}
                disabled={isUpdating === "watchlist"}
                aria-label={isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
              >
                {isUpdating === "watchlist" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isInWatchlist ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <ListPlus className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
            </TooltipContent>
          </Tooltip>

          {/* Watched toggle (movies only) */}
          {showWatched && mediaType === "movie" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="secondary"
                  className={cn(
                    "rounded-full transition-all hover:scale-105",
                    "bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10",
                    isWatched && "bg-white/20 border-white/30"
                  )}
                  onClick={handleWatchedToggle}
                  disabled={isUpdating === "watched"}
                  aria-label={isWatched ? "Mark as Unwatched" : "Mark as Watched"}
                >
                  {isUpdating === "watched" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isWatched ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isWatched ? "Mark as Unwatched" : "Mark as Watched"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Like/Dislike grouped in a pill */}
          <div className="flex items-center rounded-full bg-white/10 backdrop-blur-sm border border-white/10 overflow-hidden">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className={cn(
                    "rounded-none hover:bg-white/15 transition-colors",
                    isLiked && "bg-white/20"
                  )}
                  onClick={handleLike}
                  disabled={isUpdating === "like"}
                  aria-label={isLiked ? "Remove Like" : "Like"}
                >
                  {isUpdating === "like" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ThumbsUp
                      className={cn("h-3.5 w-3.5", isLiked && "fill-white")}
                    />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isLiked ? "Remove Like" : "Like"}
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-white/20" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className={cn(
                    "rounded-none hover:bg-white/15 transition-colors",
                    isDisliked && "bg-white/20"
                  )}
                  onClick={handleDislike}
                  disabled={isUpdating === "dislike"}
                  aria-label={isDisliked ? "Remove Dislike" : "Dislike"}
                >
                  {isUpdating === "dislike" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ThumbsDown
                      className={cn("h-3.5 w-3.5", isDisliked && "fill-white")}
                    />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isDisliked ? "Remove Dislike" : "Dislike"}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Share */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="secondary"
                className="rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 transition-all hover:scale-105"
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
