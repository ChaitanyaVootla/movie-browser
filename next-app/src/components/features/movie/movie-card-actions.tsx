"use client";

import { Plus, Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/stores/user";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";

interface MovieCardActionsProps {
  itemId: number;
  isMovie: boolean;
  className?: string;
}

export function MovieCardActions({ itemId, isMovie, className }: MovieCardActionsProps) {
  const { data: session } = useSession();
  const { isWatched, isInWatchlist, toggleWatched, toggleWatchlist } = useUserStore();

  // Only show actions for movies and authenticated users
  if (!isMovie || !session) {
    return null;
  }

  const watched = isWatched(itemId);
  const inWatchlist = isInWatchlist(itemId);

  const handleWatchlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWatchlist(itemId);
  };

  const handleWatchedClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWatched(itemId);
  };

  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <Button
        variant="secondary"
        size="icon"
        className={cn(
          "h-8 w-8 bg-black/70 hover:bg-black/90 border border-white/20",
          inWatchlist && "bg-brand/80 hover:bg-brand border-brand"
        )}
        onClick={handleWatchlistClick}
        aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
      >
        {inWatchlist ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </Button>

      <Button
        variant="secondary"
        size="icon"
        className={cn(
          "h-8 w-8 bg-black/70 hover:bg-black/90 border border-white/20",
          watched && "bg-muted-foreground/80 hover:bg-muted-foreground border-muted-foreground"
        )}
        onClick={handleWatchedClick}
        aria-label={watched ? "Mark as not watched" : "Mark as watched"}
      >
        {watched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}
