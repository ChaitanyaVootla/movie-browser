"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { getRating, setRating } from "@/server/actions/user-ratings";

interface ScoreRatingProps {
  itemId: number;
  itemType: "movie" | "series";
  className?: string;
}

const STAR_COUNT = 5;

/**
 * Half-star 5-star score control (0.5–5 stars = score 1–10) for detail pages.
 *
 * Coexists with the thumb in media-actions.tsx — thumb is the casual signal,
 * score the connoisseur signal; both live on one user_ratings row, which
 * `setRating` updates via independent thumb/score fields.
 *
 * Score model: stars * 2 → 1–10. Clicking the current value clears it.
 * Styled for over-imagery placement, matching the thumbs' white/translucent
 * treatment (DESIGN.md over-imagery exception).
 */
export function ScoreRating({ itemId, itemType, className }: ScoreRatingProps) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

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

  // Signed-out users see nothing — the thumb beside it handles the sign-in nudge.
  if (!isAuthenticated) return null;

  // What to paint: hover preview on desktop wins over the saved value.
  const display = hoverScore ?? score ?? 0;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 backdrop-blur-sm",
        className
      )}
      role="radiogroup"
      aria-label="Rate out of 10"
    >
      <div className="flex items-center" onMouseLeave={() => setHoverScore(null)}>
        {Array.from({ length: STAR_COUNT }, (_, i) => {
          const fullValue = (i + 1) * 2; // 2,4,6,8,10
          const halfValue = fullValue - 1; // 1,3,5,7,9
          // Fill state of this star: full / half / empty against `display` (1–10).
          const filled = display >= fullValue;
          const half = !filled && display >= halfValue;
          return (
            <div key={i} className="relative h-10 w-10">
              {/* Visual star (centered); the two buttons below sit on top. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="relative inline-block h-5 w-5">
                  <Star className="absolute inset-0 h-5 w-5 text-white/40" />
                  <span
                    className="absolute inset-0 overflow-hidden"
                    style={{ width: filled ? "100%" : half ? "50%" : "0%" }}
                  >
                    <Star className="h-5 w-5 fill-white text-white" />
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
      <span className="min-w-[2.75rem] select-none text-[13px] font-semibold tabular-nums text-white/90">
        {score !== null ? `${score}/10` : <span className="text-white/50">Rate</span>}
      </span>
    </div>
  );
}
