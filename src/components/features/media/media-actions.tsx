"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Play, Share2, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { useUserLibrary } from "@/hooks/use-user-library";
import { useAnalytics } from "@/hooks/use-analytics";
import type { MediaType } from "@/stores/user";
import { useState, useCallback } from "react";
import {
  PulseRings,
  GlowBurst,
  ParticleBurst,
  ShakeContainer,
} from "./action-animations";
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
  /**
   * Series tracking control, rendered in the SAME slot a movie's "Watched"
   * toggle occupies (right after Watchlist) so the watch control is positionally
   * consistent across movie ↔ series pages.
   */
  watchedSlot?: ReactNode;
}

// Animated icon wrapper with bounce and rotation
function AnimatedIcon({
  children,
  animate,
  variant,
}: {
  children: React.ReactNode;
  animate: boolean;
  variant: "like" | "watchlist" | "watched" | "dislike";
}) {
  const bounceConfig = {
    like: { scale: [1, 1.4, 0.9, 1.1, 1], rotate: [0, -15, 15, -5, 0] },
    watchlist: { scale: [1, 1.25, 0.95, 1.05, 1], rotate: [0, 0, 0, 0, 0] },
    watched: { scale: [1, 1.2, 0.95, 1.05, 1], rotate: [0, 5, -5, 0, 0] },
    dislike: { scale: [1, 1.1, 1], rotate: [0, 0, 0] },
  };

  return (
    <motion.div
      animate={animate ? bounceConfig[variant] : {}}
      transition={{
        duration: variant === "like" ? 0.5 : 0.4,
        ease: [0.34, 1.56, 0.64, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

export function MediaActions({
  itemId,
  mediaType,
  title,
  hasTrailer = false,
  onPlayTrailer,
  className,
  variant = "hero",
  posterPath,
  watchedSlot,
}: MediaActionsProps) {
  const { isInWatchlist, isLiked, isDisliked, toggleWatchlist, like, dislike } = useUserLibrary(
    itemId,
    mediaType
  );
  const { trackRating, trackShareClick } = useAnalytics();

  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [animating, setAnimating] = useState<string | null>(null);

  const triggerAnimation = useCallback((key: string, duration = 600) => {
    setAnimating(key);
    setTimeout(() => setAnimating(null), duration);
  }, []);

  const handleLike = async () => {
    const wasLiked = isLiked;
    setIsUpdating("like");
    try {
      await like();
      if (!wasLiked) {
        triggerAnimation("like", 800);
      }
      trackRating(itemId, mediaType, wasLiked ? "remove" : "like", title);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDislike = async () => {
    const wasDisliked = isDisliked;
    setIsUpdating("dislike");
    try {
      await dislike();
      if (!wasDisliked) {
        triggerAnimation("dislike", 500);
      }
      trackRating(itemId, mediaType, wasDisliked ? "remove" : "dislike", title);
    } finally {
      setIsUpdating(null);
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

          {/* Single watch control, positioned right after Watchlist for both
              media types: movies pass the segmented WatchedButton, series pass
              the progress control (see MediaActionBar). */}
          {watchedSlot}

          {/* Secondary reactions + share: inline on ≥sm, collapsed into the
              mobile "More" drawer below so the bar stays one row on phones. */}
          <div className="hidden items-center gap-1.5 sm:flex">
          {/* Like */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="secondary"
                className={cn(
                  "rounded-full backdrop-blur-sm transition-all relative overflow-visible",
                  isLiked
                    ? "bg-brand/40 text-white border-2 border-brand/70 hover:bg-brand/50 shadow-[0_0_12px_rgba(var(--brand-rgb),0.3)]"
                    : "bg-white/10 hover:bg-white/20 border border-white/20 text-white/70 hover:text-white"
                )}
                onClick={handleLike}
                disabled={isUpdating === "like"}
                aria-label={isLiked ? "Remove Like" : "Like"}
              >
                {/* Like animation layers */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <PulseRings isActive={animating === "like"} ringCount={3} />
                  <GlowBurst isActive={animating === "like"} />
                  <ParticleBurst isActive={animating === "like"} particleCount={10} />
                </div>

                <AnimatedIcon animate={animating === "like"} variant="like">
                  {isUpdating === "like" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ThumbsUp className={cn("h-3.5 w-3.5", isLiked && "fill-current")} />
                  )}
                </AnimatedIcon>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{isLiked ? "Liked" : "Like"}</TooltipContent>
          </Tooltip>

          {/* Dislike */}
          <Tooltip>
            <TooltipTrigger asChild>
              <ShakeContainer isShaking={animating === "dislike"}>
                <Button
                  size="icon-sm"
                  variant="secondary"
                  className={cn(
                    "rounded-full backdrop-blur-sm transition-all",
                    isDisliked
                      ? "bg-brand/40 text-white border-2 border-brand/70 hover:bg-brand/50 shadow-[0_0_12px_rgba(var(--brand-rgb),0.3)]"
                      : "bg-white/10 hover:bg-white/20 border border-white/20 text-white/70 hover:text-white"
                  )}
                  onClick={handleDislike}
                  disabled={isUpdating === "dislike"}
                  aria-label={isDisliked ? "Remove Dislike" : "Dislike"}
                >
                  <AnimatedIcon animate={animating === "dislike"} variant="dislike">
                    {isUpdating === "dislike" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ThumbsDown className={cn("h-3.5 w-3.5", isDisliked && "fill-current")} />
                    )}
                  </AnimatedIcon>
                </Button>
              </ShakeContainer>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isDisliked ? "Disliked" : "Dislike"}
            </TooltipContent>
          </Tooltip>

          {/* Share */}
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
        </div>
      </TooltipProvider>
    </div>
  );
}
