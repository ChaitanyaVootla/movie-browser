"use client";

import { cn } from "@/lib/utils";
import { useUserStore, selectIsWatched, selectIsInWatchlist, type MediaType } from "@/stores/user";
import { getBadgeScoopColor, createBadge } from "@/lib/badges";

interface UserStatusBadgeProps {
  itemId: number;
  mediaType: MediaType;
  className?: string;
}

/**
 * UserStatusBadge - Shows watchlist/watched status in the bottom-right corner of cards
 *
 * Priority: watched > watchlist (only shows one)
 * Only renders for authenticated users with hydrated store
 */
export function UserStatusBadge({ itemId, mediaType, className }: UserStatusBadgeProps) {
  const isHydrated = useUserStore((state) => state.isHydrated);
  const isWatched = useUserStore(selectIsWatched(itemId));
  const isInWatchlist = useUserStore(selectIsInWatchlist(itemId, mediaType));

  // Don't render until store is hydrated (prevents flash of empty state)
  if (!isHydrated) return null;

  // Priority: watched > watchlist
  // Only show one badge
  const badge = isWatched
    ? createBadge("watched")
    : isInWatchlist
      ? createBadge("watchlist")
      : null;

  if (!badge) return null;

  return (
    <div className={cn("absolute bottom-0 right-0 z-10 flex items-end", className)}>
      {/* Inverted corner on the left - creates smooth curve */}
      <div
        className="w-[6px] h-[6px] -mr-px"
        style={{
          background: "transparent",
          borderBottomRightRadius: "6px",
          boxShadow: `6px 6px 0 0 ${getBadgeScoopColor(badge.className)}`,
        }}
        aria-hidden="true"
      />
      {/* Badge - small and sleek */}
      <span
        className={cn(
          "inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold",
          "rounded-tl-md",
          badge.className
        )}
        title={badge.description}
      >
        {badge.shortLabel || badge.label}
      </span>
    </div>
  );
}

/**
 * Hook to check if item is watched - for applying grayscale effect
 */
export function useIsWatched(itemId: number): boolean {
  const isHydrated = useUserStore((state) => state.isHydrated);
  const isWatched = useUserStore(selectIsWatched(itemId));
  return isHydrated && isWatched;
}
