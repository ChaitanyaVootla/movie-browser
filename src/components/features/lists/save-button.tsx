"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Bookmark, Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import type { MediaType } from "@/stores/user";
import { SaveToListSheet } from "@/components/features/lists/save-to-list-sheet";

type SaveButtonVariant = "hero" | "compact" | "card";

interface SaveButtonProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  isInWatchlist: boolean;
  /** Zustand-backed watchlist toggle from `useUserLibrary` (already toasts). */
  toggleWatchlist: () => Promise<void> | void;
  variant?: SaveButtonVariant;
  className?: string;
}

/**
 * Split "Save" control: the primary region is the existing one-tap Watchlist
 * toggle (analytics + Framer feedback preserved); the always-visible caret is a
 * separate ≥44px tap target that opens the multi-list picker. Owns the picker
 * `open` state and renders `SaveToListSheet` (Drawer on mobile, Popover on
 * desktop, anchored to the caret).
 */
export function SaveButton({
  itemId,
  mediaType,
  title,
  posterPath,
  isInWatchlist,
  toggleWatchlist,
  variant = "hero",
  className,
}: SaveButtonProps) {
  const { trackWatchlistAdd, trackWatchlistRemove } = useAnalytics();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [bump, setBump] = useState(false);

  const handlePrimary = useCallback(async () => {
    const wasIn = isInWatchlist;
    setUpdating(true);
    try {
      await toggleWatchlist();
      if (!wasIn) {
        setBump(true);
        setTimeout(() => setBump(false), 500);
        trackWatchlistAdd(itemId, mediaType, title);
      } else {
        trackWatchlistRemove(itemId, mediaType, title);
      }
    } finally {
      setUpdating(false);
    }
  }, [isInWatchlist, toggleWatchlist, trackWatchlistAdd, trackWatchlistRemove, itemId, mediaType, title]);

  const sheet = (
    <SaveToListSheet
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      itemId={itemId}
      mediaType={mediaType}
      title={title}
      posterPath={posterPath}
      isInWatchlist={isInWatchlist}
      onToggleWatchlist={toggleWatchlist}
      anchor={
        <CaretButton
          variant={variant}
          isInWatchlist={isInWatchlist}
          onClick={() => setPickerOpen((o) => !o)}
        />
      }
    />
  );

  // -- card: compact icon button + caret on the poster overlay -----------------
  if (variant === "card") {
    return (
      <div className={cn("flex items-center", className)}>
        <Button
          variant="secondary"
          size="icon"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handlePrimary();
          }}
          disabled={updating}
          aria-label={isInWatchlist ? "Remove from watchlist" : "Add to watchlist"}
          className={cn(
            "h-8 w-8 rounded-l-md rounded-r-none border border-r-0 border-white/20 bg-black/70 hover:bg-black/90",
            isInWatchlist && "border-brand bg-brand/80 hover:bg-brand"
          )}
        >
          {updating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isInWatchlist ? (
            <Check className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
        {sheet}
      </div>
    );
  }

  // -- compact: small icon pill + tiny caret -----------------------------------
  if (variant === "compact") {
    return (
      <TooltipProvider>
        <div className={cn("flex items-center", className)}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                onClick={() => void handlePrimary()}
                disabled={updating}
                aria-label={isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
                className={cn(
                  "h-9 w-9 rounded-l-full rounded-r-none transition-all",
                  isInWatchlist
                    ? "border-2 border-r border-brand/70 bg-brand/40 text-white hover:bg-brand/50"
                    : "border border-r-0 border-white/20 bg-white/10 hover:bg-white/20"
                )}
              >
                <motion.span
                  animate={bump ? { scale: [1, 1.25, 0.95, 1.05, 1] } : {}}
                  transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                >
                  {updating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isInWatchlist ? (
                    <Check className="h-4 w-4 stroke-[2.5]" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </motion.span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isInWatchlist ? "In Watchlist" : "Add to Watchlist"}</TooltipContent>
          </Tooltip>
          {sheet}
        </div>
      </TooltipProvider>
    );
  }

  // -- hero: pill with label + caret -------------------------------------------
  return (
    <TooltipProvider>
      <div className={cn("flex items-center", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handlePrimary()}
              disabled={updating}
              aria-label={isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
              className={cn(
                "gap-1.5 rounded-l-full rounded-r-none backdrop-blur-sm transition-all",
                isInWatchlist
                  ? "border-2 border-r border-brand/70 bg-brand/40 text-white hover:bg-brand/50 shadow-[0_0_12px_rgba(var(--brand-rgb),0.3)]"
                  : "border border-r-0 border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
              )}
            >
              <motion.span
                className="flex items-center"
                animate={bump ? { scale: [1, 1.25, 0.95, 1.05, 1] } : {}}
                transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              >
                {updating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isInWatchlist ? (
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </motion.span>
              <span className="hidden text-[13px] font-semibold sm:inline">
                {isInWatchlist ? "Listed" : "Watchlist"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
          </TooltipContent>
        </Tooltip>
        {sheet}
      </div>
    </TooltipProvider>
  );
}

/**
 * The caret half of the split button — a separate ≥44px tap target opening the
 * picker. Styled per variant to butt cleanly against the primary region.
 * Wrapped by `PopoverAnchor` (desktop) inside `SaveToListSheet`.
 */
function CaretButton({
  variant,
  isInWatchlist,
  onClick,
}: {
  variant: SaveButtonVariant;
  isInWatchlist: boolean;
  onClick: () => void;
}) {
  const handle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  if (variant === "card") {
    return (
      <Button
        variant="secondary"
        size="icon"
        onClick={handle}
        aria-haspopup="dialog"
        aria-label="Save to list"
        className={cn(
          "h-8 w-7 rounded-l-none rounded-r-md border border-white/20 bg-black/70 hover:bg-black/90",
          isInWatchlist && "border-brand bg-brand/80 hover:bg-brand"
        )}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
    );
  }

  const tone = isInWatchlist
    ? "border-2 border-l border-brand/70 bg-brand/40 text-white hover:bg-brand/50"
    : "border border-l-0 border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white";

  if (variant === "compact") {
    return (
      <Button
        size="icon"
        variant="secondary"
        onClick={handle}
        aria-haspopup="dialog"
        aria-label="Save to list"
        className={cn("h-9 w-8 rounded-l-none rounded-r-full backdrop-blur-sm transition-all", tone)}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
    );
  }

  // hero
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={handle}
      aria-haspopup="dialog"
      aria-label="Save to list"
      className={cn(
        "min-w-[44px] rounded-l-none rounded-r-full px-2.5 backdrop-blur-sm transition-all",
        tone
      )}
    >
      <Bookmark className="h-3.5 w-3.5" />
      <ChevronDown className="h-3 w-3" />
    </Button>
  );
}
