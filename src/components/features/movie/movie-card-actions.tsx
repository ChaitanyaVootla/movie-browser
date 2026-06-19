"use client";

import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useUserStore,
  selectIsWatched,
  selectIsInWatchlist,
  type MediaType,
} from "@/stores/user";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { useAnalytics } from "@/hooks/use-analytics";
import { QuickLogButton } from "@/components/features/tracking/quick-log-button";
import { SaveButton } from "@/components/features/lists/save-button";

const MEDIA_TYPE: MediaType = "movie"; // Only movies for now

interface MovieCardActionsProps {
  itemId: number;
  isMovie: boolean;
  className?: string;
}

export function MovieCardActions({ itemId, isMovie, className }: MovieCardActionsProps) {
  const { data: session } = useSession();
  // Granular subscriptions: only re-render when THIS item's watched/watchlist
  // state changes, not on every store mutation. Action fns are stable references.
  const watched = useUserStore(selectIsWatched(itemId));
  const inWatchlist = useUserStore(selectIsInWatchlist(itemId, MEDIA_TYPE));
  const toggleWatched = useUserStore((s) => s.toggleWatched);
  const toggleWatchlist = useUserStore((s) => s.toggleWatchlist);
  const { trackWatched } = useAnalytics();

  // Only show actions for movies and authenticated users
  if (!isMovie || !session) {
    return null;
  }

  const mediaType = MEDIA_TYPE;

  const handleWatchedClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWatched(itemId);
    trackWatched(itemId, mediaType, !watched);
  };

  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <SaveButton
        variant="card"
        itemId={itemId}
        mediaType={mediaType}
        title=""
        posterPath={null}
        isInWatchlist={inWatchlist}
        toggleWatchlist={() => toggleWatchlist(itemId, mediaType)}
      />

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

      <QuickLogButton mediaType="movie" tmdbId={itemId} title="" variant="card" />
    </div>
  );
}
