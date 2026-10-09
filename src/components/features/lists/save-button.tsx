"use client";

import { useState, useCallback } from "react";
import { m } from "framer-motion";
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
import { useMobile } from "@/hooks/use-mobile";
import type { MediaType } from "@/stores/user";
import { SaveToListSheet } from "@/components/features/lists/save-to-list-sheet";
import { usePreviewHold } from "@/components/features/hover-card/preview-store";
import {
  COMPACT_ACTIVE,
  COMPACT_BTN,
  COMPACT_IDLE,
} from "@/components/features/media/title-actions/styles";

type SaveButtonVariant = "hero" | "compact";

interface SaveButtonProps {
  itemId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  isInWatchlist: boolean;
  /**
   * The `useUserLibrary` watchlist toggle. It owns the auth gate and the
   * success/failure toasts, and resolves `true` only when the write landed
   * (analytics fire only then). Never pass the raw store action: it rethrows on
   * failure (unhandled rejection) and has no toast. The old card strip did this.
   */
  toggleWatchlist: () => Promise<boolean>;
  /** hero = detail action bar (over imagery); compact = hover preview / quick-info drawer. */
  variant?: SaveButtonVariant;
  className?: string;
}

const BUMP = { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as const };

/**
 * Split "Save" control: the primary region is the one-tap Watchlist toggle;
 * the caret is a separate tap target that opens the multi-list picker
 * (`SaveToListSheet`: Drawer on mobile, Popover on desktop anchored to the
 * caret). The picker's own Watchlist row goes through the same `handlePrimary`,
 * so analytics fire whichever path toggles it.
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
  const isMobile = useMobile();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [bump, setBump] = useState(false);
  // Keep the hover preview open while the (portalled) list picker is showing.
  usePreviewHold(pickerOpen);

  const handlePrimary = useCallback(async () => {
    const wasIn = isInWatchlist;
    setUpdating(true);
    try {
      const ok = await toggleWatchlist();
      if (!ok) return;
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

  const sheetProps = {
    open: pickerOpen,
    onOpenChange: setPickerOpen,
    itemId,
    mediaType,
    title,
    posterPath,
    isInWatchlist,
    onToggleWatchlist: handlePrimary,
  };

  const sheet = (
    <SaveToListSheet
      {...sheetProps}
      anchor={
        <CaretButton
          variant={variant}
          isInWatchlist={isInWatchlist}
          onClick={() => setPickerOpen((o) => !o)}
        />
      }
    />
  );

  const glyph = (size: string) =>
    updating ? (
      <Loader2 className={cn(size, "animate-spin")} />
    ) : isInWatchlist ? (
      <Check className={cn(size, "stroke-[2.5]")} />
    ) : (
      <Plus className={size} />
    );

  // -- compact: 40px icon + caret (hover preview / quick-info drawer) ----------
  if (variant === "compact") {
    return (
      <div className={cn("flex items-center", className)}>
        <button
          type="button"
          onClick={() => void handlePrimary()}
          disabled={updating}
          aria-label={isInWatchlist ? "Remove from watchlist" : "Add to watchlist"}
          aria-pressed={isInWatchlist}
          title={isInWatchlist ? "On your watchlist" : "Add to watchlist"}
          className={cn(
            COMPACT_BTN,
            "rounded-r-none border-r-0 pr-2",
            isInWatchlist ? COMPACT_ACTIVE : COMPACT_IDLE
          )}
        >
          <m.span className="flex items-center" animate={bump ? { scale: [1, 1.25, 0.95, 1.05, 1] } : {}} transition={BUMP}>
            {glyph("h-4 w-4")}
          </m.span>
        </button>
        {sheet}
      </div>
    );
  }

  // -- hero (mobile): ONE button that opens the picker drawer ------------------
  // No split control on mobile (the bar was wrapping). The watchlist toggle,
  // custom lists and create-list all live inside the drawer.
  if (isMobile) {
    return (
      <div className={cn("flex items-center", className)}>
        <SaveToListSheet
          {...sheetProps}
          anchor={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPickerOpen(true)}
              aria-haspopup="dialog"
              aria-label={isInWatchlist ? "Saved — edit lists" : "Save to watchlist or a list"}
              className={cn(
                "rounded-full backdrop-blur-sm transition-all",
                isInWatchlist
                  ? "border-2 border-brand/70 bg-brand/40 text-white hover:bg-brand/50 shadow-[0_0_12px_rgba(var(--brand-rgb),0.3)]"
                  : "border border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
              )}
            >
              {isInWatchlist ? (
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
            </Button>
          }
        />
      </div>
    );
  }

  // -- hero (desktop): split pill — one-tap toggle + caret ---------------------
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
              <m.span className="flex items-center" animate={bump ? { scale: [1, 1.25, 0.95, 1.05, 1] } : {}} transition={BUMP}>
                {glyph("h-3.5 w-3.5")}
              </m.span>
              <span className="text-[13px] font-semibold">
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
 * The caret half of the split button. It is a separate tap target that opens
 * the picker, styled per variant so it butts cleanly against the primary
 * region. It is wrapped by `PopoverAnchor` (desktop) inside `SaveToListSheet`.
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

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handle}
        aria-haspopup="dialog"
        aria-label="Save to a list"
        title="Save to a list"
        className={cn(
          COMPACT_BTN,
          "min-w-0 rounded-l-none px-1.5",
          isInWatchlist ? COMPACT_ACTIVE : COMPACT_IDLE
        )}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    );
  }

  const tone = isInWatchlist
    ? "border-2 border-l border-brand/70 bg-brand/40 text-white hover:bg-brand/50"
    : "border border-l-0 border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white";

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
