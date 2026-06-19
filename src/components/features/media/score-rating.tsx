"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import { LoginDialog, useLoginDialog } from "@/components/features/auth";
import { useAnalytics } from "@/hooks/use-analytics";
import { getRating, setRating } from "@/server/actions/user-ratings";

interface ScoreRatingProps {
  itemId: number;
  itemType: "movie" | "series";
  className?: string;
}

const STAR_COUNT = 5;

/**
 * Connoisseur 1–10 score control, collapsed into a single "Rate" pill that
 * matches its sibling action-bar buttons (Trailer/Watchlist/Log). Clicking it
 * opens a half-star picker (½–5 stars = score 1–10) in a Popover on desktop /
 * Drawer on mobile.
 *
 * Coexists with the thumb in media-actions.tsx — thumb is the casual signal,
 * score the connoisseur signal; both live on one user_ratings row, which
 * `setRating` updates via independent thumb/score fields.
 *
 * Hydration: the trigger pill renders the SAME markup on server and first
 * client paint regardless of session — only the click BEHAVIOR is auth-gated
 * (unauthenticated → login dialog, mirroring the thumb/QuickLog pattern). This
 * avoids the server/client HTML divergence that an auth-conditional render
 * caused. The saved score loads in an async-IIFE effect with a cancelled guard.
 */
export function ScoreRating({ itemId, itemType, className }: ScoreRatingProps) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const isMobile = useMobile();
  const {
    isOpen: loginOpen,
    openLoginDialog,
    setIsOpen: setLoginOpen,
  } = useLoginDialog();

  const [open, setOpen] = useState(false);
  // Current saved score (1–10) or null. Hover preview is a separate transient.
  const [score, setScore] = useState<number | null>(null);
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { trackAction } = useAnalytics();

  // Load the user's current score on mount / auth change. Async work runs in
  // an IIFE with a cancelled guard so we never setState synchronously in the
  // effect body (strict react-hooks lint).
  useEffect(() => {
    if (!isAuthenticated) {
      setScore(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await getRating({ itemId, itemType });
      if (cancelled) return;
      if (result.success) {
        setScore(result.rating?.score ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, itemId, itemType]);

  const commitScore = useCallback(
    async (nextScore: number | null) => {
      const previous = score;
      setScore(nextScore); // optimistic
      setIsSaving(true);
      try {
        const result = await setRating({ itemId, itemType, score: nextScore });
        if (!result.success) throw new Error(result.error);
        if (nextScore !== null) {
          trackAction({
            action: "rate_score",
            mediaType: itemType,
            itemId,
            metadata: { score: nextScore },
          });
        }
      } catch {
        setScore(previous); // revert
        toast.error("Failed to save your rating");
      } finally {
        setIsSaving(false);
      }
    },
    [score, itemId, itemType, trackAction]
  );

  // Click a half/full star → set; clicking the current value clears it.
  const handleSelect = useCallback(
    (value: number) => {
      void commitScore(value === score ? null : value);
    },
    [commitScore, score]
  );

  // Trigger click: auth-gate the BEHAVIOR only (render is stable for hydration).
  const handleTriggerClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isAuthenticated) {
        e.preventDefault();
        e.stopPropagation();
        openLoginDialog("Sign in to rate this title");
      }
    },
    [isAuthenticated, openLoginDialog]
  );

  const hasScore = score !== null;

  const trigger = (
    <Button
      size="sm"
      variant="secondary"
      className={cn(
        "gap-1.5 rounded-full backdrop-blur-sm transition-all border",
        hasScore
          ? "bg-brand/40 text-white border-2 border-brand/70 hover:bg-brand/50 shadow-[0_0_12px_rgba(var(--brand-rgb),0.3)]"
          : "bg-white/10 hover:bg-white/20 border-white/20 text-white/80 hover:text-white",
        className
      )}
      onClick={handleTriggerClick}
      aria-label={hasScore ? `Your rating: ${score} out of 10. Edit rating` : "Rate out of 10"}
    >
      <Star className={cn("h-3.5 w-3.5", hasScore && "fill-current")} />
      <span className="text-[13px] font-semibold tabular-nums">
        {hasScore ? `${score}/10` : "Rate"}
      </span>
    </Button>
  );

  // What to paint inside the picker: hover preview wins over the saved value.
  const display = hoverScore ?? score ?? 0;

  const picker = (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center" onMouseLeave={() => setHoverScore(null)}>
        {Array.from({ length: STAR_COUNT }, (_, i) => {
          const fullValue = (i + 1) * 2; // 2,4,6,8,10
          const halfValue = fullValue - 1; // 1,3,5,7,9
          const filled = display >= fullValue;
          const half = !filled && display >= halfValue;
          return (
            <div key={i} className="relative h-11 w-11">
              {/* Visual star (centered); the two hit targets below sit on top. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="relative inline-block h-6 w-6">
                  <Star className="absolute inset-0 h-6 w-6 text-muted-foreground/40" />
                  <span
                    className="absolute inset-0 overflow-hidden"
                    style={{ width: filled ? "100%" : half ? "50%" : "0%" }}
                  >
                    <Star className="h-6 w-6 fill-brand text-brand" />
                  </span>
                </span>
              </div>
              {/* Left half = half star (odd score), right half = full star. */}
              <button
                type="button"
                disabled={isSaving}
                className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer disabled:cursor-default"
                aria-label={`Rate ${halfValue} out of 10`}
                onMouseEnter={() => setHoverScore(halfValue)}
                onClick={() => handleSelect(halfValue)}
              />
              <button
                type="button"
                disabled={isSaving}
                className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer disabled:cursor-default"
                aria-label={`Rate ${fullValue} out of 10`}
                onMouseEnter={() => setHoverScore(fullValue)}
                onClick={() => handleSelect(fullValue)}
              />
            </div>
          );
        })}
      </div>
      <div className="flex h-5 items-center text-sm font-semibold tabular-nums text-foreground">
        {display > 0 ? `${display}/10` : <span className="text-muted-foreground">Tap a star</span>}
      </div>
      {hasScore && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isSaving}
          className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => void commitScore(null)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="text-[13px]">Clear rating</span>
        </Button>
      )}
    </div>
  );

  // Signed-out users still see the stable trigger; clicking it opens the login
  // dialog (handled in handleTriggerClick) without ever opening the picker.
  if (!isAuthenticated) {
    return (
      <>
        {trigger}
        <LoginDialog
          open={loginOpen}
          onOpenChange={setLoginOpen}
          message="Sign in to rate this title"
        />
      </>
    );
  }

  if (isMobile) {
    return (
      <>
        {/* Drawer trigger is the same pill; asChild keeps it keyboard-focusable. */}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent>
            <DrawerHeader className="text-center">
              <DrawerTitle className="text-lg font-semibold">Rate this title</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">{picker}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto px-4 py-3">
        {picker}
      </PopoverContent>
    </Popover>
  );
}
